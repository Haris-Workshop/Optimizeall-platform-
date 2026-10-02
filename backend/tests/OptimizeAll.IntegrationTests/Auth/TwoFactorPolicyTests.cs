using System.Net.Http.Json;
using OptimizeAll.Domain.Identity;
using OptimizeAll.Domain.Settings;
using OptimizeAll.IntegrationTests.Infrastructure;

namespace OptimizeAll.IntegrationTests.Auth;

/// <summary>
/// The "require two-step verification for staff" policy (setting <c>security.requireTwoFactorForStaff</c>): forced set-up
/// at sign-in, sessions of unenrolled staff end at refresh, no impersonation without it, no turning it off, participants
/// unaffected. Own host: the policy is platform-wide.
/// </summary>
public sealed class TwoFactorPolicyTests(ApiFactory api) : IClassFixture<ApiFactory>
{
    private const string SettingUrl = "/api/v1/admin/settings/" + SettingKeys.RequireTwoFactorForStaff;

    private static object Change(bool value) => new { value, reason = "Security review: staff must use 2FA", confirm = true };

    [Fact]
    public async Task Policy_walks_staff_through_set_up_at_sign_in_and_leaves_participants_alone()
    {
        var reviewer = await api.CreateUserAsync(new[] { Role.Reviewer });
        var participant = await api.CreateUserAsync();
        var reviewerBefore = await api.LoginAsync(reviewer); // signed in before the policy (holds a refresh cookie)
        var (_, otherAdminBefore) = await api.CreateClientAsync(Role.Admin); // likewise, without two-step verification

        // An admin can only require it once they use it themselves.
        var (_, admin) = await api.CreateClientAsync(Role.Admin);
        await (await admin.PutAsJsonAsync(SettingUrl, Change(true))).ShouldFailAsync(409, "settings.two_factor_required_first");
        await TwoFactorKit.EnableAsync(admin, api.Clock);
        (await admin.PutAsJsonAsync(SettingUrl, Change(true))).EnsureSuccessStatusCode();
        try
        {
            // Participants and learners are not affected.
            var (_, _, participantBody) = await TwoFactorKit.PasswordAsync(api, participant);
            Assert.True(participantBody.TryGetProperty("accessToken", out _));

            // Staff sessions from before the policy can't impersonate meanwhile and can't be renewed.
            await (await Impersonating.StartAsync(otherAdminBefore, participant.Id)).ShouldFailAsync(403, "auth.2fa_enrollment_required");
            await (await reviewerBefore.PostAsync("/api/v1/auth/refresh", null)).ShouldFailAsync(401, "auth.2fa_enrollment_required");
            await (await reviewerBefore.PostAsync("/api/v1/auth/refresh", null)).ShouldFailAsync(401); // the session is gone

            // Sign-in: the password step answers with an "enroll" challenge instead of a session.
            var (client, _, body) = await TwoFactorKit.PasswordAsync(api, reviewer);
            Assert.False(body.TryGetProperty("accessToken", out _));
            Assert.Equal("enroll", body.GetProperty("twoFactor").GetProperty("kind").GetString());
            var token = TwoFactorKit.ChallengeToken(body);

            // It can't be used as a verify challenge, and nothing is enabled before a code is confirmed.
            await (await client.PostAsJsonAsync("/api/v1/auth/2fa/verify", new { challengeToken = token, code = "123456" }))
                .ShouldFailAsync(401, "auth.2fa_challenge_expired");
            await (await client.PostAsJsonAsync("/api/v1/auth/2fa/enroll/confirm", new { challengeToken = token, code = "123456" }))
                .ShouldFailAsync(409, "auth.2fa_no_setup");
            var setup = await (await client.PostAsJsonAsync("/api/v1/auth/2fa/enroll/setup", new { challengeToken = token })).ReadJsonAsync();
            var secret = setup.GetProperty("secret").GetString()!;
            Assert.Equal(reviewer.Email, setup.GetProperty("accountName").GetString());
            await (await client.PostAsJsonAsync("/api/v1/auth/2fa/enroll/confirm", new { challengeToken = token, code = TwoFactorKit.WrongCode(secret, api.Clock) }))
                .ShouldFailAsync(400, "auth.2fa_invalid_code");
            var enrolled = await (await client.PostAsJsonAsync("/api/v1/auth/2fa/enroll/confirm",
                new { challengeToken = token, code = TwoFactorKit.Code(secret, api.Clock) })).ReadJsonAsync();
            TwoFactorKit.NextStep(api.Clock);
            Assert.Equal(10, enrolled.GetProperty("recoveryCodes").GetArrayLength());
            TwoFactorKit.UseSession(client, enrolled.GetProperty("auth"));
            (await client.GetAsync("/api/v1/auth/me")).EnsureSuccessStatusCode();
            (await client.PostAsync("/api/v1/auth/refresh", null)).EnsureSuccessStatusCode();
            await (await client.PostAsJsonAsync("/api/v1/auth/2fa/enroll/confirm",
                    new { challengeToken = token, code = TwoFactorKit.Code(secret, api.Clock) }))
                .ShouldFailAsync(401, "auth.2fa_challenge_expired");

            var status = await (await client.GetAsync("/api/v1/auth/2fa")).ReadJsonAsync();
            Assert.True(status.GetProperty("required").GetBoolean());
            Assert.True(status.GetProperty("enabled").GetBoolean());
            // Required: it can't be turned off.
            await (await client.PostAsJsonAsync("/api/v1/auth/2fa/disable", new { password = reviewer.Password, code = TwoFactorKit.Code(secret, api.Clock) }))
                .ShouldFailAsync(409, "auth.2fa_required_by_policy");

            // Next sign-in: a normal code challenge.
            var (_, _, next) = await TwoFactorKit.PasswordAsync(api, reviewer);
            Assert.Equal("verify", next.GetProperty("twoFactor").GetProperty("kind").GetString());
            Assert.Contains(await TwoFactorKit.AuditAsync(api, reviewer.Id), a => a.Action == "auth.2fa_enrollment_required");
        }
        finally
        {
            (await admin.PutAsJsonAsync(SettingUrl, Change(false))).EnsureSuccessStatusCode();
        }
    }

    [Fact]
    public async Task Staff_by_custom_role_are_covered_and_staff_with_it_impersonate_normally()
    {
        // A participant holding a staff permission through a custom role only.
        var custom = await api.CreateUserAsync();
        await api.WithDbAsync(async db =>
        {
            var role = new CustomRole { Name = "Support desk " + Guid.NewGuid().ToString("N")[..6], Permissions = new() { "support.manage" } };
            role.NormalizedName = CustomRole.Normalize(role.Name);
            db.Add(role);
            db.Add(new UserCustomRole { UserId = custom.Id, CustomRoleId = role.Id, AssignedAt = DateTime.UtcNow });
            await db.SaveChangesAsync();
        });
        var target = await api.CreateUserAsync();
        var (_, admin) = await api.CreateClientAsync(Role.Admin);
        await TwoFactorKit.EnableAsync(admin, api.Clock);
        (await admin.PutAsJsonAsync(SettingUrl, Change(true))).EnsureSuccessStatusCode();
        try
        {
            var (_, _, body) = await TwoFactorKit.PasswordAsync(api, custom);
            Assert.Equal("enroll", body.GetProperty("twoFactor").GetProperty("kind").GetString());

            // An admin who has it: impersonation and refresh keep working under the policy.
            (await Impersonating.StartAsync(admin, target.Id)).EnsureSuccessStatusCode();
            (await admin.PostAsync("/api/v1/auth/impersonation/exit", null)).EnsureSuccessStatusCode();
            (await admin.PostAsync("/api/v1/auth/refresh", null)).EnsureSuccessStatusCode();
        }
        finally
        {
            (await admin.PutAsJsonAsync(SettingUrl, Change(false))).EnsureSuccessStatusCode();
        }
    }
}
