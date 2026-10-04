using OptimizeAll.IntegrationTests.Infrastructure;
using Xunit;

namespace OptimizeAll.IntegrationTests.Auth;

/// <summary>Headers every API response carries, kept in step with the web server's (frontend/nginx/snippets/security-headers.conf).</summary>
public sealed class SecurityHeadersTests(ApiFactory api) : IClassFixture<ApiFactory>
{
    [Theory]
    [InlineData("/api/v1/public/site")]
    [InlineData("/robots.txt")]
    [InlineData("/api/v1/does-not-exist")]
    public async Task Responses_carry_the_hardening_headers(string path)
    {
        var response = await api.CreateClient().GetAsync(path);
        string Header(string name) => response.Headers.TryGetValues(name, out var v) ? string.Join(",", v) : string.Empty;
        Assert.Equal("nosniff", Header("X-Content-Type-Options"));
        Assert.Equal("DENY", Header("X-Frame-Options"));
        Assert.Equal("strict-origin-when-cross-origin", Header("Referrer-Policy"));
        Assert.Equal("camera=(), microphone=(), geolocation=(), payment=()", Header("Permissions-Policy"));
        Assert.Equal("same-origin", Header("Cross-Origin-Opener-Policy"));
        Assert.Contains("frame-ancestors 'none'", Header("Content-Security-Policy"));
    }
}
