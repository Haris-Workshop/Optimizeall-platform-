using OptimizeAll.Api.Common.Security;

namespace OptimizeAll.Api.Modules.Auth;

/// <summary>
/// The session cookies. Both are HttpOnly, SameSite=Strict, Secure (production) and scoped to <c>/api/v1/auth</c>, so
/// they only ever reach refresh/logout/exit. Next to the refresh cookie goes <see cref="SessionHint"/>, a readable
/// marker without any secret that tells the web app a session may exist, so anonymous visitors of the public website do
/// not call refresh (and get a 401) on every page view.
/// </summary>
/// <remarks>
/// Lifetimes are sent as <c>Max-Age</c> (relative, counted by the browser's own clock), never as an absolute
/// <c>Expires</c> date: a browser whose clock runs ahead of the server's by more than a short cookie's lifetime (the
/// 10-minute Google flow cookie, an impersonation session) would otherwise receive it already expired and drop it.
/// The server still enforces the real expiry itself.
/// </remarks>
public static class AuthCookies
{
    public const string Refresh = "oa_refresh";

    /// <summary>Opaque token of a live impersonation session, next to (never replacing) the staff member's refresh cookie.</summary>
    public const string Impersonation = "oa_impersonation";

    public const string Path = "/api/v1/auth";

    /// <summary>
    /// "A refresh cookie was issued to this browser": value <c>1</c>, readable by the web app (not HttpOnly), site-wide,
    /// with the refresh cookie's lifetime. It carries no secret and grants nothing; the web app only uses it to skip the
    /// silent session restore when there cannot be a session (frontend/src/lib/auth/sessionHint.ts).
    /// </summary>
    public const string SessionHint = "oa_signed_in";

    public static void Set(HttpResponse response, SecurityOptions security, string name, string value, DateTime expiresAt)
    {
        response.Cookies.Append(name, value, new CookieOptions
        {
            HttpOnly = true,
            Secure = security.SecureCookies,
            SameSite = SameSiteMode.Strict,
            Path = Path,
            MaxAge = LifetimeUntil(response, expiresAt),
            IsEssential = true,
        });
        if (name == Refresh)
            response.Cookies.Append(SessionHint, "1", new CookieOptions
            {
                HttpOnly = false,
                Secure = security.SecureCookies,
                SameSite = SameSiteMode.Strict,
                Path = "/",
                MaxAge = LifetimeUntil(response, expiresAt),
                IsEssential = true,
            });
    }

    /// <summary>The time left until <paramref name="expiresAt"/> (UTC) by the app clock, for a <c>Max-Age</c>.</summary>
    public static TimeSpan LifetimeUntil(HttpResponse response, DateTime expiresAt)
    {
        var now = response.HttpContext.RequestServices.GetRequiredService<TimeProvider>().GetUtcNow().UtcDateTime;
        var left = expiresAt - now;
        return left > TimeSpan.Zero ? left : TimeSpan.Zero;
    }

    public static void Clear(HttpResponse response, SecurityOptions security, string name)
    {
        response.Cookies.Delete(name, new CookieOptions
        {
            HttpOnly = true, Secure = security.SecureCookies, SameSite = SameSiteMode.Strict, Path = Path,
        });
        if (name == Refresh)
            response.Cookies.Delete(SessionHint, new CookieOptions
            {
                HttpOnly = false, Secure = security.SecureCookies, SameSite = SameSiteMode.Strict, Path = "/",
            });
    }
}
