using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using OptimizeAll.Api.Common.Http;
using OptimizeAll.Api.Common.Security;
using OptimizeAll.Api.Modules.Website.Shared;
using OptimizeAll.Domain.Common;
using OptimizeAll.Domain.Website;

namespace OptimizeAll.Api.Modules.Website.Partners;

/// <summary>
/// Website → Partners (<c>site.manage</c>). Writes are denied while impersonating, like the site settings and redirects:
/// partners decide which paid/partnership links and ads every visitor of the public site sees.
/// </summary>
[ApiController]
[HasPermission(Permissions.SiteManage)]
[Route("api/v1/agency/website/partners")]
public sealed class WebsitePartnersController(PartnerAdminService partners, PartnerTrackingService tracking) : ControllerBase
{
    [HttpGet]
    public Task<IReadOnlyList<PartnerDto>> List(CancellationToken ct) => partners.ListAsync(ct);

    /// <summary>The placement slots of the public site (what each partner can be switched on for).</summary>
    [HttpGet("slots")]
    public IReadOnlyList<PartnerSlotDto> Slots() => PartnerAdminService.Slots();

    [HttpGet("{id:guid}")]
    public Task<PartnerDto> Get(Guid id, CancellationToken ct) => partners.GetAsync(id, ct);

    [HttpPost]
    [DeniedWhileImpersonating]
    public async Task<IActionResult> Create(PartnerInput input, CancellationToken ct) =>
        StatusCode(StatusCodes.Status201Created, await partners.CreateAsync(input, ct));

    [HttpPut("{id:guid}")]
    [DeniedWhileImpersonating]
    public Task<PartnerDto> Update(Guid id, PartnerInput input, CancellationToken ct) => partners.UpdateAsync(id, input, ct);

    [HttpDelete("{id:guid}")]
    [DeniedWhileImpersonating]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await partners.DeleteAsync(id, ct);
        return NoContent();
    }

    [HttpPost("reorder")]
    [DeniedWhileImpersonating]
    public Task<ReorderResult> Reorder(ReorderInput input, CancellationToken ct) => partners.ReorderAsync(input, ct);

    /// <summary>Impressions, clicks and click-through rate by partner, slot, page and day (UTC days, default the last 30).</summary>
    [HttpGet("report")]
    public Task<PartnerReportDto> Report([FromQuery] PartnerReportQuery query, CancellationToken ct) => tracking.ReportAsync(query, ct);

    [HttpGet("report.csv")]
    public async Task<IActionResult> ExportReport([FromQuery] PartnerReportQuery query, CancellationToken ct)
    {
        var rows = await tracking.ExportAsync(query, ct);
        return Csv.File("partner-placements.csv",
            new[] { "day", "partner", "partner_name", "slot", "page", "impressions", "clicks", "ctr" },
            rows.Select(r => new object?[] { r.Day, r.Partner, r.PartnerName, r.Slot, r.Page, r.Impressions, r.Clicks, PartnerTrackingService.Ctr(r.Impressions, r.Clicks) }));
    }
}

/// <summary>
/// Public partner endpoints (anonymous). Reads use the <c>public</c> rate limit; the impression beacon and the click
/// redirect run on page views and use the higher <c>tracking</c> limit, like the short-link redirects.
/// </summary>
[ApiController]
[AllowAnonymous]
[Route("api/v1/public/partners")]
public sealed class PublicPartnersController(PartnerPublicService partners, PartnerTrackingService tracking) : ControllerBase
{
    /// <summary>Active partners (partners page, home strip, footer line), link rules for partner links in content, SEO and JSON-LD.</summary>
    [HttpGet]
    [EnableRateLimiting(RateLimitPolicies.Public)]
    public Task<PublicPartnersDto> List(CancellationToken ct) => partners.DirectoryAsync(ct);

    /// <summary>The ad unit for a slot: the best-matching partner for the page's keywords/categories, or null.</summary>
    [HttpGet("placement")]
    [EnableRateLimiting(RateLimitPolicies.Public)]
    public Task<PartnerPlacementDto> Placement([FromQuery] PartnerPlacementQuery query, CancellationToken ct) => partners.PlacementAsync(query, ct);

    [HttpGet("{slug}")]
    [EnableRateLimiting(RateLimitPolicies.Public)]
    public Task<PublicPartnerDto> Profile(string slug, CancellationToken ct) => partners.ProfileAsync(slug, ct);

    /// <summary>Counts impressions (batched by the web app; bots are ignored). Always 202.</summary>
    [HttpPost("impressions")]
    [EnableRateLimiting(RateLimitPolicies.Tracking)]
    [ProducesResponseType(typeof(PartnerImpressionsResult), StatusCodes.Status202Accepted)]
    public async Task<IActionResult> Impressions(PartnerImpressionsInput input, CancellationToken ct)
    {
        Response.Headers.CacheControl = "no-store";
        return Accepted(new PartnerImpressionsResult(await tracking.RecordImpressionsAsync(input, Request.Headers.UserAgent.ToString(), ct)));
    }

    /// <summary>
    /// Counts a click and redirects (302) to the partner's website with its UTM tags. The destination always comes from
    /// the partner record, never from the request, so this cannot be used as an open redirect. 404 when the partner is
    /// inactive or has no website. robots.txt disallows /api, and links to it carry rel="sponsored".
    /// </summary>
    [HttpGet("{slug}/visit")]
    [EnableRateLimiting(RateLimitPolicies.Tracking)]
    public async Task<IActionResult> Visit(string slug, [FromQuery] string? slot, [FromQuery] string? path, CancellationToken ct)
    {
        Response.Headers.CacheControl = "no-store";
        Response.Headers["X-Robots-Tag"] = "noindex, nofollow";
        var target = await tracking.VisitAsync(slug, slot, path, Request.Headers.UserAgent.ToString(), ct)
                     ?? throw new DomainException("website.not_found", "Partner was not found.", DomainErrorKind.NotFound);
        return Redirect(target);
    }
}

/// <summary>
/// Referral-friendly short links: <c>/go/pciai</c> and <c>/go/certuvo</c> count a click (slot <c>go.link</c>) and redirect
/// (302) to the partner's website with its UTM tags — for newsletters, social bios and sharing. The aliases are edited in
/// Website → Page copy ("Short links"); a partner's own slug always works too. Like the click counter behind every partner
/// link, the destination comes from the partner record only (never from the request), the response is not cached and not
/// indexed, and robots.txt disallows /go/.
/// </summary>
[ApiController]
[AllowAnonymous]
public sealed class PartnerShortLinksController(PartnerTrackingService tracking, Modules.Content.Copy.SiteCopyService copy) : ControllerBase
{
    [HttpGet("/go/{alias}")]
    [EnableRateLimiting(RateLimitPolicies.Tracking)]
    public async Task<IActionResult> Go(string alias, CancellationToken ct)
    {
        Response.Headers.CacheControl = "no-store";
        Response.Headers["X-Robots-Tag"] = "noindex, nofollow";
        var key = alias.Trim().ToLowerInvariant();
        var slug = Resolve(await copy.ValueAsync("partners.go.aliases", ct), key) ?? key;
        var target = await tracking.VisitAsync(slug, PartnerSlots.Go, "/go/" + key, Request.Headers.UserAgent.ToString(), ct);
        return target is null ? NotFound() : Redirect(target);
    }

    /// <summary>The partner slug an alias stands for in the list "alias | slug" (null when it is not listed).</summary>
    public static string? Resolve(string? list, string alias)
    {
        foreach (var line in (list ?? string.Empty).Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var bar = line.IndexOf('|');
            if (bar > 0 && line[..bar].Trim().ToLowerInvariant() == alias) return line[(bar + 1)..].Trim().ToLowerInvariant();
        }
        return null;
    }
}
