using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using OptimizeAll.Api.Common.Security;

namespace OptimizeAll.Api.Common.Http;

public static class RateLimitPolicies
{
    /// <summary>Credential endpoints: 10 requests/minute per IP.</summary>
    public const string Auth = "auth";

    /// <summary>
    /// Session refresh: 240/minute per IP by default (<c>RateLimiting:RefreshPerMinute</c>). Every page load and tab refreshes
    /// silently, and many people can share one IP (an office behind NAT), so this is generous; refresh tokens are
    /// 256-bit random and rotate with reuse detection, so no credential can be guessed here.
    /// </summary>
    public const string Refresh = "refresh";

    /// <summary>Writes that create work for staff (submissions, tickets, appeals): 30/minute per user.</summary>
    public const string Submissions = "submissions";

    /// <summary>
    /// Learner progress writes (enrol, lesson start/complete, knowledge checks, exam answer autosave): 120/minute per user
    /// (<c>RateLimiting:LearningPerMinute</c>). Exam starts and submissions use <see cref="Submissions"/>.
    /// </summary>
    public const string Learning = "learning";

    /// <summary>Staff global search (command palette, typed as you go): 60/minute per user.</summary>
    public const string Search = "search";

    /// <summary>
    /// Public unauthenticated endpoints (the public website and academy API, landing pages, tracking redirects, postbacks):
    /// 240/minute per IP by default (<c>RateLimiting:PublicPerMinute</c>). One bucket per address for all of them, and a
    /// public page view makes several calls (site settings, page copy, partner list and ad unit, the academy), so this
    /// allows roughly 40 page views a minute from one address (an office behind NAT).
    /// </summary>
    public const string Public = "public";

    /// <summary>
    /// Email open pixels, click redirects and one-click unsubscribes: 1,200/minute per IP (mailbox providers fetch pixels
    /// and post unsubscribes for many recipients from a few proxy IPs). Exempt from the global per-IP limiter.
    /// </summary>
    public const string Tracking = "tracking";

    /// <summary>
    /// Signature-verified provider webhooks (ESP events, SMS status/inbound): 6,000/minute per endpoint path, i.e. per
    /// provider and workspace, never per IP (providers send one request per message from shared IPs). Exempt from the
    /// global per-IP limiter so a large send cannot lose bounce/complaint events (and therefore suppressions).
    /// </summary>
    public const string Webhooks = "webhooks";

    /// <summary>
    /// Server-rendered public pages and SEO files (HTML documents, sitemaps, robots.txt, llms.txt): 600/minute per IP by
    /// default (<c>RateLimiting:DocumentsPerMinute</c>). Search engine crawlers fetch many pages from few addresses, and
    /// every visit to the site loads one document, so this sits above the global per-IP limiter it is exempt from.
    /// </summary>
    public const string Documents = "documents";

    /// <summary>Policies whose endpoints bypass the global per-IP limiter (they carry their own, higher limits).</summary>
    private static readonly HashSet<string> HighVolumePolicies = new(StringComparer.Ordinal) { Tracking, Webhooks, Documents };

    /// <summary>
    /// Registers the rate limiters. They are owned by <see cref="AppRateLimiter"/>, a singleton the container disposes
    /// when the host stops, and applied by <see cref="AppRateLimitingMiddleware"/> (<see cref="UseAppRateLimiting"/>).
    /// <para>
    /// Not ASP.NET Core's <c>AddRateLimiter</c>/<c>UseRateLimiter</c>: on .NET 8 its middleware builds a partitioned
    /// limiter for the endpoint policies (and takes <c>RateLimiterOptions.GlobalLimiter</c>) and never disposes either.
    /// Each runs a 100 ms timer that holds the limiter, the rest of the request pipeline and the execution context the
    /// host started in, so a stopped host could never be collected: the integration tests, which start ~400 hosts,
    /// grew to ~10 GB and requests began failing under memory pressure.
    /// </para>
    /// The same semantics: <c>[DisableRateLimiting]</c> skips every limiter; otherwise the global per-IP limiter applies,
    /// then the endpoint's <c>[EnableRateLimiting(policy)]</c> limiter, partitioned per policy and key; a rejection is a
    /// 429 problem with <c>Retry-After</c> when the limiter knows it.
    /// </summary>
    public static IServiceCollection AddAppRateLimiting(this IServiceCollection services)
    {
        services.AddSingleton<AppRateLimiter>();
        return services;
    }

    public static IApplicationBuilder UseAppRateLimiting(this IApplicationBuilder app) => app.UseMiddleware<AppRateLimitingMiddleware>();

    /// <summary>The endpoint policies: policy name → partition (limit and key) for a request.</summary>
    internal static Dictionary<string, Func<HttpContext, RateLimitPartition<string>>> Policies(IConfiguration config)
    {
        var enabled = Enabled(config);
        RateLimitPartition<string> Off() => RateLimitPartition.GetNoLimiter("off");
        return new Dictionary<string, Func<HttpContext, RateLimitPartition<string>>>(StringComparer.Ordinal)
        {
            [Auth] = ctx => !enabled ? Off()
                : RateLimitPartition.GetFixedWindowLimiter(ClientKey(ctx), _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = config.GetValue("RateLimiting:AuthPerMinute", 10), Window = TimeSpan.FromMinutes(1), QueueLimit = 0,
                }),
            [Refresh] = ctx => !enabled ? Off()
                : RateLimitPartition.GetFixedWindowLimiter(ClientKey(ctx), _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = config.GetValue("RateLimiting:RefreshPerMinute", 240), Window = TimeSpan.FromMinutes(1), QueueLimit = 0,
                }),
            [Submissions] = ctx => !enabled ? Off()
                : RateLimitPartition.GetSlidingWindowLimiter(UserKey(ctx), _ => new SlidingWindowRateLimiterOptions
                {
                    PermitLimit = 30, Window = TimeSpan.FromMinutes(1), SegmentsPerWindow = 6, QueueLimit = 0,
                }),
            [Search] = ctx => !enabled ? Off()
                : RateLimitPartition.GetSlidingWindowLimiter("search:" + UserKey(ctx), _ => new SlidingWindowRateLimiterOptions
                {
                    PermitLimit = config.GetValue("RateLimiting:SearchPerMinute", 60), Window = TimeSpan.FromMinutes(1),
                    SegmentsPerWindow = 6, QueueLimit = 0,
                }),
            [Learning] = ctx => !enabled ? Off()
                : RateLimitPartition.GetSlidingWindowLimiter("learning:" + UserKey(ctx), _ => new SlidingWindowRateLimiterOptions
                {
                    PermitLimit = config.GetValue("RateLimiting:LearningPerMinute", 120), Window = TimeSpan.FromMinutes(1),
                    SegmentsPerWindow = 6, QueueLimit = 0,
                }),
            [Public] = ctx => !enabled ? Off()
                : RateLimitPartition.GetFixedWindowLimiter(ClientKey(ctx), _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = config.GetValue("RateLimiting:PublicPerMinute", 240), Window = TimeSpan.FromMinutes(1), QueueLimit = 0,
                }),
            [Tracking] = ctx => !enabled ? Off()
                : RateLimitPartition.GetFixedWindowLimiter(ClientKey(ctx), _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = config.GetValue("RateLimiting:TrackingPerMinute", 1200), Window = TimeSpan.FromMinutes(1), QueueLimit = 0,
                }),
            [Documents] = ctx => !enabled ? Off()
                : RateLimitPartition.GetFixedWindowLimiter("documents:" + ClientKey(ctx), _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = config.GetValue("RateLimiting:DocumentsPerMinute", 600), Window = TimeSpan.FromMinutes(1), QueueLimit = 0,
                }),
            [Webhooks] = ctx => !enabled ? Off()
                : RateLimitPartition.GetFixedWindowLimiter("webhook:" + ctx.Request.Path.Value?.ToLowerInvariant(), _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = config.GetValue("RateLimiting:WebhooksPerMinute", 6000), Window = TimeSpan.FromMinutes(1), QueueLimit = 0,
                }),
        };
    }

    /// <summary>Global safety net per client IP (<c>RateLimiting:GlobalPerMinute</c>, default 300); high-volume policies are exempt.</summary>
    internal static Func<HttpContext, RateLimitPartition<string>> GlobalPartitioner(IConfiguration config)
    {
        var enabled = Enabled(config);
        var perMinute = GlobalPerMinute(config);
        return ctx => !enabled || IsHighVolume(ctx) ? RateLimitPartition.GetNoLimiter("off")
            : RateLimitPartition.GetTokenBucketLimiter(ClientKey(ctx), _ => new TokenBucketRateLimiterOptions
            {
                TokenLimit = perMinute, TokensPerPeriod = perMinute, ReplenishmentPeriod = TimeSpan.FromMinutes(1), QueueLimit = 0,
            });
    }

    private static bool Enabled(IConfiguration config) => config.GetValue("RateLimiting:Enabled", true);

    /// <summary>Global per-IP budget (<c>RateLimiting:GlobalPerMinute</c>, default 300; the e2e harness, where every actor shares 127.0.0.1, raises it).</summary>
    private static int GlobalPerMinute(IConfiguration config) => Math.Max(1, config.GetValue("RateLimiting:GlobalPerMinute", 300));

    private static bool IsHighVolume(HttpContext ctx) =>
        ctx.GetEndpoint()?.Metadata.GetMetadata<EnableRateLimitingAttribute>()?.PolicyName is { } policy && HighVolumePolicies.Contains(policy);

    private static string ClientKey(HttpContext ctx) => ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";

    private static string UserKey(HttpContext ctx) =>
        ctx.User.FindFirst(AppClaims.UserId)?.Value ?? ClientKey(ctx);
}
