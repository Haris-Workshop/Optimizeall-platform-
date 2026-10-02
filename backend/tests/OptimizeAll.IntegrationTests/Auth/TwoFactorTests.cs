using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Time.Testing;
using OptimizeAll.Api.Modules.Auth.TwoFactor;
using OptimizeAll.Domain.Audit;
using OptimizeAll.Domain.Identity;
using OptimizeAll.IntegrationTests.Infrastructure;

namespace OptimizeAll.IntegrationTests.Auth;

/// <summary>Two-step verification helpers: codes from the shared fake clock, set-up through the API, sign-in steps.</summary>
internal static class TwoFactorKit
{
    public static string Code(string secret, FakeTimeProvider clock, int stepOffset = 0) =>
        Totp.Compute(Totp.Base32Decode(secret), Totp.TimeStep(clock.GetUtcNow()) + stepOffset);

    /// <summary>Codes are single use per 30-second step: move to the next step before using another one.</summary>
    public static void NextStep(FakeTimeProvider clock) => clock.Advance(TimeSpan.FromSeconds(30));

    public static string WrongCode(string secret, FakeTimeProvider clock)
    {
        var valid = Enumerable.Range(-1, 3).Select(o => Code(secret, clock, o)).ToHashSet();
        return Enumerable.Range(0, 1000).Select(i => i.ToString("D6")).First(c => !valid.Contains(c));
    }

    /// <summary>Turns two-step verification on for the signed-in client; returns the secret and recovery codes.</summary>
    public static async Task<(string Secret, string[] RecoveryCodes)> EnableAsync(HttpClient client, FakeTimeProvider clock)
    {
        var setup = await (await client.PostAsync("/api/v1/auth/2fa/setup", null)).ReadJsonAsync();
        var secret = setup.GetProperty("secret").GetString()!;
        var confirmed = await (await client.PostAsJsonAsync("/api/v1/auth/2fa/confirm", new { code = Code(secret, clock) })).ReadJsonAsync();
        NextStep(clock);
        return (secret, confirmed.GetProperty("recoveryCodes").EnumerateArray().Select(c => c.GetString()!).ToArray());
    }

    public static HttpClient NewClient(WebApplicationFactory<Program> app)
    {
        var client = app.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        client.DefaultRequestHeaders.Add("X-Requested-With", "tests");
        return client;
    }

    /// <summary>Password step: returns the login body (a session, or <c>twoFactor</c>) and the cookie-carrying client.</summary>
    public static async Task<(HttpClient Client, HttpResponseMessage Response, JsonElement Body)> PasswordAsync(
        WebApplicationFactory<Program> app, TestUser user)
    {
        var client = NewClient(app);
        var response = await client.PostAsJsonAsync("/api/v1/auth/login", new { email = user.Email, password = user.Password });
        return (client, response, await response.ReadJsonAsync());
    }

    public static string ChallengeToken(JsonElement loginBody) =>
        loginBody.GetProperty("twoFactor").GetProperty("challengeToken").GetString()!;

    public static void UseSession(HttpClient client, JsonElement auth) =>
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.GetProperty("accessToken").GetString());

    /// <summary>Signs in with password + code; returns a client holding the access token and the refresh cookie.</summary>
    public static async Task<HttpClient> SignInAsync(WebApplicationFactory<Program> app, TestUser user, string secret, FakeTimeProvider clock)
    {
        var (client, _, body) = await PasswordAsync(app, user);
        var auth = await (await client.PostAsJsonAsync("/api/v1/auth/2fa/verify",
            new { challengeToken = ChallengeToken(body), code = Code(secret, clock) })).ReadJsonAsync();
        NextStep(clock);
        UseSession(client, auth);
        return client;
    }

    public static Task<List<AuditLog>> AuditAsync(ApiFactory api, Guid userId) => api.WithDbAsync(db => db.Set<AuditLog>().AsNoTracking()
        .Where(a => a.EntityId == userId.ToString()).OrderBy(a => a.Id).ToListAsync());

    public static async Task<string?> LatestMailSubjectAsync(WebApplicationFactory<Program> app, string to)
    {
        var response = await NewClient(app).GetAsync($"/api/v1/dev/mailbox?to={Uri.EscapeDataString(to)}");
        return response.StatusCode == HttpStatusCode.OK ? (await response.ReadJsonAsync()).GetProperty("subject").GetString() : null;
    }
}

/// <summary>Two-step verification end to end with the staff policy off (the default).</summary>
public sealed class TwoFactorTests(ApiFactory api) : IClassFixture<ApiFactory>
{
    private static bool HasRefreshCookie(HttpResponseMessage response) =>
        response.Headers.TryGetValues("Set-Cookie", out var cookies) && cookies.Any(c => c.StartsWith("oa_refresh=", StringComparison.Ordinal) &&
                                                                                       !c.StartsWith("oa_refresh=;", StringComparison.Ordinal));

    [Fact]
    public async Task Participant_enrols_and_then_signs_in_with_password_and_code()
    {
        var user = await api.CreateUserAsync();
        var client = await api.LoginAsync(user);

        var status = await (await client.GetAsync("/api/v1/auth/2fa")).ReadJsonAsync();
        Assert.False(status.GetProperty("enabled").GetBoolean());
        Assert.False(status.GetProperty("required").GetBoolean());

        // Confirming needs a set-up first, then a matching code.
        await (await client.PostAsJsonAsync("/api/v1/auth/2fa/confirm", new { code = "123456" })).ShouldFailAsync(409, "auth.2fa_no_setup");
        var setup = await (await client.PostAsync("/api/v1/auth/2fa/setup", null)).ReadJsonAsync();
        var secret = setup.GetProperty("secret").GetString()!;
        Assert.Matches("^([A-Z2-7]{4} )*[A-Z2-7]{1,4}$", secret);
        var uri = setup.GetProperty("otpAuthUri").GetString()!;
        Assert.StartsWith("otpauth://totp/Optimize%20All:", uri);
        Assert.Contains("secret=" + secret.Replace(" ", ""), uri);
        Assert.Contains("issuer=Optimize%20All", uri);
        await (await client.PostAsJsonAsync("/api/v1/auth/2fa/confirm", new { code = TwoFactorKit.WrongCode(secret, api.Clock) }))
            .ShouldFailAsync(400, "auth.2fa_invalid_code");
        var confirmed = await (await client.PostAsJsonAsync("/api/v1/auth/2fa/confirm", new { code = TwoFactorKit.Code(secret, api.Clock) })).ReadJsonAsync();
        Assert.Equal(10, confirmed.GetProperty("recoveryCodes").GetArrayLength());
        TwoFactorKit.NextStep(api.Clock);
        Assert.Equal("Two-step verification is on for your Optimize All account", await TwoFactorKit.LatestMailSubjectAsync(api, user.Email));
        await (await client.PostAsync("/api/v1/auth/2fa/setup", null)).ShouldFailAsync(409, "auth.2fa_already_enabled");

        status = await (await client.GetAsync("/api/v1/auth/2fa")).ReadJsonAsync();
        Assert.True(status.GetProperty("enabled").GetBoolean());
        Assert.Equal(10, status.GetProperty("recoveryCodesRemaining").GetInt32());

        // The password alone no longer starts a session: no access token, no refresh cookie.
        var (signIn, response, body) = await TwoFactorKit.PasswordAsync(api, user);
        Assert.False(body.TryGetProperty("accessToken", out _));
        Assert.False(HasRefreshCookie(response));
        Assert.Equal("verify", body.GetProperty("twoFactor").GetProperty("kind").GetString());
        await (await signIn.PostAsync("/api/v1/auth/refresh", null)).ShouldFailAsync(401);

        var verified = await signIn.PostAsJsonAsync("/api/v1/auth/2fa/verify",
            new { challengeToken = TwoFactorKit.ChallengeToken(body), code = TwoFactorKit.Code(secret, api.Clock) });
        Assert.True(HasRefreshCookie(verified));
        var auth = await verified.ReadJsonAsync();
        Assert.Equal(user.Id, auth.GetProperty("user").GetProperty("id").GetGuid());
        TwoFactorKit.UseSession(signIn, auth);
        (await signIn.GetAsync("/api/v1/auth/me")).EnsureSuccessStatusCode();
        (await signIn.PostAsync("/api/v1/auth/refresh", null)).EnsureSuccessStatusCode(); // a normal rotating session

        var actions = (await TwoFactorKit.AuditAsync(api, user.Id)).Select(a => a.Action).ToList();
        Assert.Contains("auth.2fa_setup_started", actions);
        Assert.Contains("auth.2fa_enabled", actions);
        Assert.Contains("auth.2fa_challenge_issued", actions);
        Assert.Contains("auth.2fa_verified", actions);
        // Secrets and codes never reach the audit log.
        Assert.All(await TwoFactorKit.AuditAsync(api, user.Id), a => Assert.DoesNotContain(secret.Replace(" ", ""), a.AfterJson ?? ""));
    }

    [Fact]
    public async Task A_used_code_is_refused_and_a_challenge_dies_after_five_wrong_codes()
    {
        var user = await api.CreateUserAsync();
        var (secret, _) = await TwoFactorKit.EnableAsync(await api.LoginAsync(user), api.Clock);

        var code = TwoFactorKit.Code(secret, api.Clock);
        var (first, _, firstBody) = await TwoFactorKit.PasswordAsync(api, user);
        (await first.PostAsJsonAsync("/api/v1/auth/2fa/verify", new { challengeToken = TwoFactorKit.ChallengeToken(firstBody), code }))
            .EnsureSuccessStatusCode();
        // Replay within the same 30 seconds with a fresh challenge (someone watched it being typed).
        var (second, _, secondBody) = await TwoFactorKit.PasswordAsync(api, user);
        var token = TwoFactorKit.ChallengeToken(secondBody);
        await (await second.PostAsJsonAsync("/api/v1/auth/2fa/verify", new { challengeToken = token, code }))
            .ShouldFailAsync(400, "auth.2fa_invalid_code");
        // The first challenge is spent.
        await (await first.PostAsJsonAsync("/api/v1/auth/2fa/verify",
                new { challengeToken = TwoFactorKit.ChallengeToken(firstBody), code = TwoFactorKit.Code(secret, api.Clock, 1) }))
            .ShouldFailAsync(401, "auth.2fa_challenge_expired");

        for (var i = 0; i < 4; i++) // one wrong try already counted (the replay)
            await (await second.PostAsJsonAsync("/api/v1/auth/2fa/verify", new { challengeToken = token, code = TwoFactorKit.WrongCode(secret, api.Clock) }))
                .ShouldFailAsync(400, "auth.2fa_invalid_code");
        TwoFactorKit.NextStep(api.Clock);
        await (await second.PostAsJsonAsync("/api/v1/auth/2fa/verify", new { challengeToken = token, code = TwoFactorKit.Code(secret, api.Clock) }))
            .ShouldFailAsync(401, "auth.2fa_challenge_expired");
        Assert.Equal(5, (await TwoFactorKit.AuditAsync(api, user.Id)).Count(a => a.Action == "auth.2fa_failed"));

        // A garbled or foreign token is just "expired".
        await (await second.PostAsJsonAsync("/api/v1/auth/2fa/verify", new { challengeToken = "forged", code = "123456" }))
            .ShouldFailAsync(401, "auth.2fa_challenge_expired");
        await (await second.PostAsJsonAsync("/api/v1/auth/2fa/verify", new { challengeToken = token[..^3] + "abc", code = "123456" }))
            .ShouldFailAsync(401, "auth.2fa_challenge_expired");
    }

    [Fact]
    public async Task A_challenge_expires_after_five_minutes_and_a_password_change_voids_it()
    {
        var user = await api.CreateUserAsync();
        var client = await api.LoginAsync(user);
        var (secret, _) = await TwoFactorKit.EnableAsync(client, api.Clock);

        var (anon, _, body) = await TwoFactorKit.PasswordAsync(api, user);
        api.Clock.Advance(TimeSpan.FromMinutes(5) + TimeSpan.FromSeconds(1));
        await (await anon.PostAsJsonAsync("/api/v1/auth/2fa/verify",
                new { challengeToken = TwoFactorKit.ChallengeToken(body), code = TwoFactorKit.Code(secret, api.Clock) }))
            .ShouldFailAsync(401, "auth.2fa_challenge_expired");

        (anon, _, body) = await TwoFactorKit.PasswordAsync(api, user);
        var fresh = await TwoFactorKit.SignInAsync(api, user, secret, api.Clock);
        (await fresh.PostAsJsonAsync("/api/v1/auth/change-password", new { currentPassword = user.Password, newPassword = "Another-Strong-Pass-77" }))
            .EnsureSuccessStatusCode();
        await (await anon.PostAsJsonAsync("/api/v1/auth/2fa/verify",
                new { challengeToken = TwoFactorKit.ChallengeToken(body), code = TwoFactorKit.Code(secret, api.Clock) }))
            .ShouldFailAsync(401, "auth.2fa_challenge_expired");
    }

    [Fact]
    public async Task Recovery_codes_sign_in_once_each_and_can_be_regenerated()
    {
        var user = await api.CreateUserAsync();
        var client = await api.LoginAsync(user);
        var (secret, codes) = await TwoFactorKit.EnableAsync(client, api.Clock);

        var (anon, _, body) = await TwoFactorKit.PasswordAsync(api, user);
        var auth = await (await anon.PostAsJsonAsync("/api/v1/auth/2fa/verify",
            new { challengeToken = TwoFactorKit.ChallengeToken(body), recoveryCode = codes[0].ToLowerInvariant() })).ReadJsonAsync();
        Assert.Equal(user.Id, auth.GetProperty("user").GetProperty("id").GetGuid());
        Assert.Equal("A recovery code was used on your Optimize All account", await TwoFactorKit.LatestMailSubjectAsync(api, user.Email));
        Assert.Contains(await TwoFactorKit.AuditAsync(api, user.Id), a => a.Action == "auth.2fa_verified" && a.AfterJson!.Contains("recovery_code"));

        (anon, _, body) = await TwoFactorKit.PasswordAsync(api, user);
        await (await anon.PostAsJsonAsync("/api/v1/auth/2fa/verify", new { challengeToken = TwoFactorKit.ChallengeToken(body), recoveryCode = codes[0] }))
            .ShouldFailAsync(400, "auth.2fa_invalid_code");
        var status = await (await client.GetAsync("/api/v1/auth/2fa")).ReadJsonAsync();
        Assert.Equal(9, status.GetProperty("recoveryCodesRemaining").GetInt32());

        // A new set needs an app code; the old codes stop working.
        await (await client.PostAsJsonAsync("/api/v1/auth/2fa/recovery-codes", new { code = TwoFactorKit.WrongCode(secret, api.Clock) }))
            .ShouldFailAsync(400, "auth.2fa_invalid_code");
        var regenerated = await (await client.PostAsJsonAsync("/api/v1/auth/2fa/recovery-codes", new { code = TwoFactorKit.Code(secret, api.Clock) })).ReadJsonAsync();
        TwoFactorKit.NextStep(api.Clock);
        var fresh = regenerated.GetProperty("recoveryCodes").EnumerateArray().Select(c => c.GetString()!).ToArray();
        Assert.Equal(10, fresh.Length);
        Assert.Empty(fresh.Intersect(codes));
        await (await anon.PostAsJsonAsync("/api/v1/auth/2fa/verify", new { challengeToken = TwoFactorKit.ChallengeToken(body), recoveryCode = codes[1] }))
            .ShouldFailAsync(400, "auth.2fa_invalid_code");
        (await anon.PostAsJsonAsync("/api/v1/auth/2fa/verify", new { challengeToken = TwoFactorKit.ChallengeToken(body), recoveryCode = fresh[1] }))
            .EnsureSuccessStatusCode();
        Assert.Contains(await TwoFactorKit.AuditAsync(api, user.Id), a => a.Action == "auth.2fa_recovery_codes_regenerated");
    }

    [Fact]
    public async Task Turning_it_off_needs_the_password_and_a_code_and_emails_the_owner()
    {
        var user = await api.CreateUserAsync();
        var client = await api.LoginAsync(user);
        var (secret, codes) = await TwoFactorKit.EnableAsync(client, api.Clock);

        await (await client.PostAsJsonAsync("/api/v1/auth/2fa/disable", new { code = TwoFactorKit.Code(secret, api.Clock) }))
            .ShouldFailAsync(400, "auth.invalid_password");
        await (await client.PostAsJsonAsync("/api/v1/auth/2fa/disable", new { password = "wrong-password-1", code = TwoFactorKit.Code(secret, api.Clock) }))
            .ShouldFailAsync(400, "auth.invalid_password");
        await (await client.PostAsJsonAsync("/api/v1/auth/2fa/disable", new { password = user.Password, code = TwoFactorKit.WrongCode(secret, api.Clock) }))
            .ShouldFailAsync(400, "auth.2fa_invalid_code");
        // A recovery code also proves the second factor (phone lost, still signed in elsewhere).
        Assert.Equal(HttpStatusCode.NoContent,
            (await client.PostAsJsonAsync("/api/v1/auth/2fa/disable", new { password = user.Password, recoveryCode = codes[3] })).StatusCode);
        Assert.Equal("Two-step verification is off for your Optimize All account", await TwoFactorKit.LatestMailSubjectAsync(api, user.Email));
        Assert.Contains(await TwoFactorKit.AuditAsync(api, user.Id), a => a.Action == "auth.2fa_disabled");
        await (await client.PostAsJsonAsync("/api/v1/auth/2fa/disable", new { password = user.Password, code = "123456" }))
            .ShouldFailAsync(409, "auth.2fa_not_enabled");

        var (_, _, body) = await TwoFactorKit.PasswordAsync(api, user);
        Assert.True(body.TryGetProperty("accessToken", out _));
        Assert.Equal(0, await api.WithDbAsync(db => db.Set<UserRecoveryCode>().CountAsync(c => c.UserId == user.Id)));
    }

    [Fact]
    public async Task Lockout_after_ten_wrong_codes_answers_429_until_it_ends()
    {
        var user = await api.CreateUserAsync();
        var (secret, _) = await TwoFactorKit.EnableAsync(await api.LoginAsync(user), api.Clock);
        for (var i = 0; i < 10; i++)
        {
            var (anon, _, body) = await TwoFactorKit.PasswordAsync(api, user);
            await (await anon.PostAsJsonAsync("/api/v1/auth/2fa/verify",
                    new { challengeToken = TwoFactorKit.ChallengeToken(body), code = TwoFactorKit.WrongCode(secret, api.Clock) }))
                .ShouldFailAsync(400, "auth.2fa_invalid_code");
        }
        var (locked, _, lockedBody) = await TwoFactorKit.PasswordAsync(api, user);
        await (await locked.PostAsJsonAsync("/api/v1/auth/2fa/verify",
                new { challengeToken = TwoFactorKit.ChallengeToken(lockedBody), code = TwoFactorKit.Code(secret, api.Clock) }))
            .ShouldFailAsync(429, "auth.2fa_locked");
        Assert.Contains(await TwoFactorKit.AuditAsync(api, user.Id), a => a.Action == "auth.2fa_locked_out");

        api.Clock.Advance(TimeSpan.FromMinutes(16));
        await TwoFactorKit.SignInAsync(api, user, secret, api.Clock);
    }

    [Fact]
    public async Task Admin_resets_a_lost_authenticator_with_a_reason_signing_the_user_out()
    {
        var (adminUser, admin) = await api.CreateClientAsync(Role.Admin);
        var user = await api.CreateUserAsync();
        var (secret, _) = await TwoFactorKit.EnableAsync(await api.LoginAsync(user), api.Clock);
        var userSession = await TwoFactorKit.SignInAsync(api, user, secret, api.Clock);

        var detail = await (await admin.GetAsync($"/api/v1/admin/users/{user.Id}")).ReadJsonAsync();
        Assert.True(detail.GetProperty("twoFactor").GetProperty("enabled").GetBoolean());
        Assert.Equal(10, detail.GetProperty("twoFactor").GetProperty("recoveryCodesRemaining").GetInt32());

        var url = $"/api/v1/admin/users/{user.Id}/two-factor/reset";
        await (await admin.PostAsJsonAsync(url, new { reason = "Lost phone, identity checked on ticket #88", confirm = false }))
            .ShouldFailAsync(400, "admin.confirmation_required");
        await (await admin.PostAsJsonAsync(url, new { reason = "", confirm = true })).ShouldFailAsync(400);
        await (await admin.PostAsJsonAsync($"/api/v1/admin/users/{adminUser.Id}/two-factor/reset", new { reason = "Resetting myself", confirm = true }))
            .ShouldFailAsync(403, "admin.two_factor_reset_self");

        // Only holders of users.manage.
        var (_, reviewer) = await api.CreateClientAsync(Role.Reviewer);
        await (await reviewer.PostAsJsonAsync(url, new { reason = "Lost phone, identity checked on ticket #88", confirm = true })).ShouldFailAsync(403);

        var reset = await (await admin.PostAsJsonAsync(url, new { reason = "Lost phone, identity checked on ticket #88", confirm = true })).ReadJsonAsync();
        Assert.False(reset.GetProperty("twoFactor").GetProperty("enabled").GetBoolean());
        await (await admin.PostAsJsonAsync(url, new { reason = "Lost phone, identity checked on ticket #88", confirm = true }))
            .ShouldFailAsync(409, "admin.two_factor_not_enabled");

        var entry = Assert.Single(await TwoFactorKit.AuditAsync(api, user.Id), a => a.Action == "admin.user_two_factor_reset");
        Assert.Equal(adminUser.Id, entry.ActorUserId);
        Assert.Equal("Lost phone, identity checked on ticket #88", entry.Reason);
        Assert.Contains("an administrator", (await (await TwoFactorKit.NewClient(api).GetAsync(
            $"/api/v1/dev/mailbox?to={Uri.EscapeDataString(user.Email)}")).ReadJsonAsync()).GetProperty("text").GetString());

        // Signed out everywhere; the password alone signs in again.
        await (await userSession.GetAsync("/api/v1/auth/me")).ShouldFailAsync(401);
        await (await userSession.PostAsync("/api/v1/auth/refresh", null)).ShouldFailAsync(401);
        var (_, _, body) = await TwoFactorKit.PasswordAsync(api, user);
        Assert.True(body.TryGetProperty("accessToken", out _));
    }

    [Fact]
    public async Task Impersonation_neither_needs_the_targets_code_nor_lets_the_impersonator_change_it()
    {
        var (_, admin) = await api.CreateClientAsync(Role.Admin);
        var user = await api.CreateUserAsync();
        var (secret, _) = await TwoFactorKit.EnableAsync(await api.LoginAsync(user), api.Clock);

        // The target's two-step verification doesn't block "view as": the staff member never signs in as them.
        var token = await Impersonating.TokenAsync(admin, user.Id);
        var status = await (await Impersonating.SendAsync(admin, HttpMethod.Get, "/api/v1/auth/2fa", token)).ReadJsonAsync();
        Assert.True(status.GetProperty("enabled").GetBoolean());

        // ...but it is a credential: no changes while impersonating.
        foreach (var (path, body) in new (string, object)[]
                 {
                     ("/api/v1/auth/2fa/disable", new { password = user.Password, code = TwoFactorKit.Code(secret, api.Clock) }),
                     ("/api/v1/auth/2fa/recovery-codes", new { code = TwoFactorKit.Code(secret, api.Clock) }),
                     ("/api/v1/auth/2fa/setup", new { }),
                     ("/api/v1/auth/2fa/confirm", new { code = "123456" }),
                 })
            await (await Impersonating.SendAsync(admin, HttpMethod.Post, path, token, body)).ShouldFailAsync(403, "auth.impersonation_forbidden_action");
        Assert.True(await api.WithDbAsync(db => db.Set<UserTwoFactor>().AnyAsync(t => t.UserId == user.Id && t.EnabledAt != null)));
    }

    [Fact]
    public async Task Google_only_accounts_turn_it_off_without_a_password()
    {
        var user = await api.CreateUserAsync();
        var client = await api.LoginAsync(user);
        var (secret, _) = await TwoFactorKit.EnableAsync(client, api.Clock);
        await api.WithDbAsync(db => db.Set<User>().Where(u => u.Id == user.Id).ExecuteUpdateAsync(s => s.SetProperty(u => u.PasswordHash, "")));

        var status = await (await client.GetAsync("/api/v1/auth/2fa")).ReadJsonAsync();
        Assert.False(status.GetProperty("hasPassword").GetBoolean());
        Assert.Equal(HttpStatusCode.NoContent,
            (await client.PostAsJsonAsync("/api/v1/auth/2fa/disable", new { code = TwoFactorKit.Code(secret, api.Clock) })).StatusCode);
    }
}
