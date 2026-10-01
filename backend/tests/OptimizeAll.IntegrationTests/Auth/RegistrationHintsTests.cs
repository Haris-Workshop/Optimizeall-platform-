using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Web;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using OptimizeAll.Domain.Identity;
using OptimizeAll.IntegrationTests.Infrastructure;

namespace OptimizeAll.IntegrationTests.Auth;

/// <summary>
/// Registration accepts an optional safe <c>returnTo</c> (carried to the verification link as <c>next</c>) and an optional
/// <c>audience</c> ("learner" | "creator", kept on the user and returned in the session). Hostile or unknown values are dropped
/// silently; verification links without <c>next</c> keep working.
/// </summary>
public sealed class RegistrationHintsTests(ApiFactory api) : IClassFixture<ApiFactory>
{
    private HttpClient NewClient()
    {
        var client = api.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        client.DefaultRequestHeaders.Add("X-Requested-With", "tests");
        return client;
    }

    private static Dictionary<string, object?> Registration(string email, string? returnTo = null, string? audience = null)
    {
        var body = new Dictionary<string, object?>
        {
            ["email"] = email, ["password"] = "Horizon-Tulip-42", ["displayName"] = "Sara Khan", ["countryCode"] = "PK", ["languageCode"] = "en",
            ["timeZone"] = "Asia/Karachi", ["acceptTerms"] = true,
        };
        if (returnTo is not null) body["returnTo"] = returnTo;
        if (audience is not null) body["audience"] = audience;
        return body;
    }

    /// <summary>The verification link of the latest email to the address.</summary>
    private async Task<Uri> LinkAsync(HttpClient client, string email)
    {
        var mail = await (await client.GetAsync($"/api/v1/dev/mailbox?to={Uri.EscapeDataString(email)}")).ReadJsonAsync();
        return new Uri(mail.GetProperty("links")[0].GetString()!);
    }

    private async Task<Uri> RegisterAsync(HttpClient client, string email, string? returnTo = null, string? audience = null)
    {
        Assert.Equal(HttpStatusCode.Accepted, (await client.PostAsJsonAsync("/api/v1/auth/register", Registration(email, returnTo, audience))).StatusCode);
        return await LinkAsync(client, email);
    }

    private static string Email(string tag) => $"{tag}-{Guid.NewGuid():N}@example.test";

    [Theory]
    [InlineData("/learn/ai-fundamentals-for-marketers")]
    [InlineData("/app/learning?course=ai%20basics&tab=lessons")]
    [InlineData("/learn#certificates")]
    [InlineData("/")]
    public async Task A_safe_relative_return_path_is_carried_to_the_verification_link_as_next(string returnTo)
    {
        var link = await RegisterAsync(NewClient(), Email("next"), returnTo);
        var query = HttpUtility.ParseQueryString(link.Query);
        Assert.Equal("/verify-email", link.AbsolutePath);
        Assert.Equal(returnTo, query["next"]);
        Assert.False(string.IsNullOrEmpty(query["token"]));
        Assert.DoesNotContain("next", query["token"]!);
    }

    [Theory]
    [InlineData("https://evil.example/phish")]
    [InlineData("//evil.example/phish")]
    [InlineData("/\\evil.example")]
    [InlineData("\\\\evil.example")]
    [InlineData("javascript:alert(1)")]
    [InlineData("learn/ai")]
    [InlineData("/%2f/evil.example")]
    [InlineData("/%5Cevil.example")]
    [InlineData("/learn\r\nLocation: https://evil.example")]
    [InlineData("/learn ai")]
    [InlineData("")]
    public async Task Hostile_or_malformed_return_values_are_dropped_silently_and_registration_still_succeeds(string returnTo)
    {
        var link = await RegisterAsync(NewClient(), Email("hostile"), returnTo);
        Assert.DoesNotContain("next=", link.Query);
        Assert.Contains("token=", link.Query);
    }

    [Fact]
    public async Task A_return_path_over_200_characters_is_dropped_and_exactly_200_is_kept()
    {
        var ok = "/" + new string('a', 199);
        Assert.Equal(ok, HttpUtility.ParseQueryString((await RegisterAsync(NewClient(), Email("len200"), ok)).Query)["next"]);
        var tooLong = "/" + new string('a', 200);
        Assert.DoesNotContain("next=", (await RegisterAsync(NewClient(), Email("len201"), tooLong)).Query);
    }

    [Fact]
    public async Task Links_without_next_still_verify_and_next_never_changes_verification()
    {
        var client = NewClient();
        var plain = await RegisterAsync(client, Email("plain"));
        Assert.DoesNotContain("next=", plain.Query);
        var plainToken = HttpUtility.ParseQueryString(plain.Query)["token"]!;
        (await client.PostAsJsonAsync("/api/v1/auth/verify-email", new { token = plainToken })).EnsureSuccessStatusCode();

        // The token alone verifies: the frontend reads next from the link, the API never sees it.
        var withNext = await RegisterAsync(NewClient(), Email("withnext"), "/learn/x");
        var anon = NewClient();
        (await anon.PostAsJsonAsync("/api/v1/auth/verify-email", new { token = HttpUtility.ParseQueryString(withNext.Query)["token"] })).EnsureSuccessStatusCode();
    }

    [Theory]
    [InlineData("learner", "learner")]
    [InlineData("creator", "creator")]
    [InlineData("Creator", "creator")]
    [InlineData(" LEARNER ", "learner")]
    [InlineData("admin", null)]
    [InlineData("agency", null)]
    [InlineData("", null)]
    [InlineData(null, null)]
    public async Task Audience_is_stored_on_the_user_and_returned_in_the_session_only_when_valid(string? sent, string? expected)
    {
        var client = NewClient();
        var email = Email("aud");
        await RegisterAsync(client, email, audience: sent);
        var stored = await api.WithDbAsync(db => db.Set<User>().AsNoTracking().Where(u => u.Email == email).Select(u => u.Audience).SingleAsync());
        Assert.Equal(expected, stored);

        var login = await (await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = "Horizon-Tulip-42" })).ReadJsonAsync();
        var user = login.GetProperty("user");
        if (expected is null) Assert.True(!user.TryGetProperty("audience", out var a) || a.ValueKind == System.Text.Json.JsonValueKind.Null);
        else Assert.Equal(expected, user.GetProperty("audience").GetString());

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", login.GetProperty("accessToken").GetString());
        var me = await (await client.GetAsync("/api/v1/auth/me")).ReadJsonAsync();
        if (expected is not null) Assert.Equal(expected, me.GetProperty("audience").GetString());
    }
}
