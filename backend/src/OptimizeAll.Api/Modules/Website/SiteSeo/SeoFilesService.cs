using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using OptimizeAll.Api.Common.Security;
using OptimizeAll.Api.Modules.Accounts;
using OptimizeAll.Api.Modules.Website.Shared;
using OptimizeAll.Domain.Common;

namespace OptimizeAll.Api.Modules.Website.SiteSeo;

public sealed record RobotsFileDto(
    IReadOnlyList<string> ExtraRules, string? ExtraText, IReadOnlyList<string> ExtraSitemaps, string Generated, IReadOnlyList<RobotsWarning> Warnings,
    IReadOnlyList<CrawlerGroupDto> CrawlerGroups);

public sealed record SitemapFileInfoDto(string Name, string Url, int UrlCount, DateTime? LastModified);

/// <summary>A sitemap group in the admin report: what the generator found, what is listed, and its files.</summary>
public sealed record SitemapGroupDto(
    string Name, string Label, string Kind, bool Excluded, int UrlCount, int HiddenCount, DateTime? LastModified, SitemapGroupDefaults? Defaults,
    IReadOnlyList<SitemapFileInfoDto> Files);

public sealed record SitemapFileSettingsDto(
    string IndexUrl, IReadOnlyList<SitemapGroupDto> Groups, IReadOnlyList<string> ExcludedGroups, IReadOnlyList<string> ExcludedPaths,
    IReadOnlyList<string> ExtraPaths, IReadOnlyDictionary<string, SitemapGroupDefaults> GroupDefaults, int ListedUrls, int HiddenUrls,
    DateTime GeneratedAt, DateTime? LastModified, IReadOnlyList<string> ChangeFrequencies, bool IndexNowEnabled);

public sealed record LlmsSectionDto(string Key, string Label, bool Included);

public sealed record LlmsFileDto(
    bool Enabled, string? Summary, string? Intro, string DefaultSummary, string DefaultIntro, IReadOnlyList<LlmsSectionDto> Sections,
    IReadOnlyList<LlmsCustomSection> CustomSections, bool AcademyGuideEnabled);

/// <summary>Agency → Website → SEO → robots.txt, Sitemaps and llms.txt: the generated files and the editor's choices.</summary>
public sealed record SeoFilesDto(RobotsFileDto Robots, SitemapFileSettingsDto Sitemap, LlmsFileDto Llms, string SiteUrl, DateTime UpdatedAt, Guid ConcurrencyStamp);

/// <summary>One public URL in the sitemap report (listed, or hidden and why).</summary>
public sealed record SitemapUrlRowDto(string Path, string Url, string Group, string Title, DateTime? LastModified, string? HiddenBy, bool Extra);

public sealed record SitemapUrlsDto(IReadOnlyList<SitemapUrlRowDto> Rows, int Total, bool Truncated);

public sealed class UpdateRobotsFileRequest
{
    public List<string>? ExtraRules { get; set; }

    [MaxLength(20_000)]
    public string? ExtraText { get; set; }

    public List<string>? ExtraSitemaps { get; set; }

    /// <summary>The additions close the whole site to a crawler (<c>Disallow: /</c>): saving needs this explicit confirmation.</summary>
    public bool ConfirmDisallowAll { get; set; }

    [Required]
    public Guid? ConcurrencyStamp { get; set; }
}

public sealed class PreviewRobotsFileRequest
{
    public List<string>? ExtraRules { get; set; }

    [MaxLength(20_000)]
    public string? ExtraText { get; set; }

    public List<string>? ExtraSitemaps { get; set; }

    /// <summary>Crawler group key → allowed, to preview a change of the crawler policy too (left out: as saved).</summary>
    public Dictionary<string, bool>? CrawlerGroups { get; set; }
}

public sealed record RobotsPreviewDto(string Text, IReadOnlyList<RobotsWarning> Warnings, IReadOnlyDictionary<string, string[]> Errors);

public sealed class UpdateSitemapFileRequest
{
    public List<string>? ExcludedGroups { get; set; }

    public List<string>? ExcludedPaths { get; set; }

    public List<string>? ExtraPaths { get; set; }

    public Dictionary<string, SitemapGroupDefaults>? GroupDefaults { get; set; }

    [Required]
    public Guid? ConcurrencyStamp { get; set; }
}

/// <summary>Leave one address out of the sitemaps, or list it again.</summary>
public sealed class ToggleSitemapUrlRequest
{
    [Required, MaxLength(500)]
    public string? Path { get; set; }

    public bool Excluded { get; set; }

    [Required]
    public Guid? ConcurrencyStamp { get; set; }
}

public sealed class UpdateLlmsFileRequest
{
    [MaxLength(1000)]
    public string? Summary { get; set; }

    [MaxLength(10_000)]
    public string? Intro { get; set; }

    public List<string>? ExcludedSections { get; set; }

    public List<LlmsCustomSection>? CustomSections { get; set; }

    public bool AcademyGuideEnabled { get; set; } = true;

    [Required]
    public Guid? ConcurrencyStamp { get; set; }
}

/// <summary>
/// The editable parts of robots.txt, the sitemaps and llms.txt (stored in the SEO settings document). Every save is
/// audited (<c>website.seo_robots_updated</c>, <c>website.seo_sitemap_updated</c>, <c>website.seo_llms_updated</c>) and
/// is served at once: robots.txt and the sitemaps are generated on every request, and the llms.txt cache key includes
/// these settings.
/// </summary>
public sealed class SeoFilesService(SeoSettingsService settings, SeoPageResolver resolver, LlmsTxtService llms, IConfiguration configuration,
    TimeProvider clock)
{
    private int MaxUrls => Math.Clamp(configuration.GetValue("Website:Seo:SitemapMaxUrls", 45_000), 1, 50_000);

    private static readonly IReadOnlyDictionary<string, string> GroupLabels = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        [SeoPageResolver.GroupPages] = "Pages (built-in, CMS and industry pages)",
        [SeoPageResolver.GroupServices] = "Services",
        [SeoPageResolver.GroupCaseStudies] = "Case studies",
        [SeoPageResolver.GroupBlog] = "Blog articles and topics",
        [SeoPageResolver.GroupCareers] = "Open jobs",
        [SeoPageResolver.GroupLanding] = "Landing pages and public campaigns",
        [SeoPageResolver.GroupPartners] = "Partners",
        [SeoPageResolver.GroupLearn] = "Academy (courses and lessons)",
        [SeoPageResolver.GroupCreators] = "Creators programme",
        ["images"] = "Images (from the pages above)",
        ["videos"] = "Videos (from the pages above)",
    };

    public async Task<SeoFilesDto> GetAsync(CancellationToken ct)
    {
        await resolver.EnsureLoadedAsync(ct);
        var (s, updatedAt, stamp) = await settings.GetWithStampAsync(ct);
        return await ToDtoAsync(s, updatedAt, stamp, ct);
    }

    private async Task<SeoFilesDto> ToDtoAsync(SeoSettings s, DateTime updatedAt, Guid stamp, CancellationToken ct)
    {
        var baseUrl = resolver.BaseUrl;
        var robots = s.RobotsOrDefault;
        var (_, warnings) = SeoFileRules.Robots(robots.ExtraRules, robots.ExtraText, robots.ExtraSitemaps, new FieldErrors());
        var groupsDto = CrawlerGroups(s);
        var robotsDto = new RobotsFileDto(robots.ExtraRules, robots.ExtraText, robots.ExtraSitemaps, RobotsWriter.Write(s, baseUrl), warnings, groupsDto);

        var options = s.SitemapOrDefault;
        var rows = await resolver.SitemapReportAsync(ct);
        var listed = rows.Where(u => u.HiddenBy is null).ToList();
        var allFiles = SitemapWriter.Files(listed, MaxUrls);
        var groups = new List<SitemapGroupDto>();
        foreach (var name in SeoFileRules.SitemapGroups)
        {
            var kind = name is "images" or "videos" ? name : "urls";
            var members = kind == "images" ? listed.Where(u => u.Images.Count > 0).ToList()
                : kind == "videos" ? listed.Where(u => u.Videos.Any(SitemapWriter.Listable)).ToList()
                : listed.Where(u => u.Group == name).ToList();
            var hidden = kind == "urls" ? rows.Count(u => u.Group == name && u.HiddenBy is not null) : 0;
            var files = allFiles.Where(f => SitemapWriter.GroupOf(f) == name)
                .Select(f => new SitemapFileInfoDto(f.Name, $"{baseUrl}/sitemaps/{f.Name}.xml", f.Urls.Count, f.LastModified)).ToList();
            options.GroupDefaults.TryGetValue(name, out var d);
            groups.Add(new SitemapGroupDto(name, GroupLabels.GetValueOrDefault(name, name), kind, options.ExcludedGroups.Contains(name), members.Count, hidden,
                members.Select(u => u.LastModified).Max(), d, files));
        }
        var sitemap = new SitemapFileSettingsDto($"{baseUrl}/sitemap.xml", groups, options.ExcludedGroups, options.ExcludedPaths, options.ExtraPaths,
            options.GroupDefaults, listed.Count(u => !options.ExcludedGroups.Contains(u.Group)), rows.Count - listed.Count, clock.GetUtcNow().UtcDateTime,
            listed.Select(u => u.LastModified).Max(), SeoFileRules.ChangeFrequencies, s.IndexNow.Enabled);

        var o = s.LlmsOrDefault;
        var llmsDto = new LlmsFileDto(s.LlmsTxtEnabled, o.Summary, o.Intro, llms.DefaultSummary(), llms.DefaultIntro(),
            LlmsSections.All.Select(x => new LlmsSectionDto(x.Key, x.Label, o.Includes(x.Key))).ToList(), o.CustomSections, o.AcademyGuideEnabled);
        return new SeoFilesDto(robotsDto, sitemap, llmsDto, baseUrl, updatedAt, stamp);
    }

    private static List<CrawlerGroupDto> CrawlerGroups(SeoSettings s) => CrawlerCatalog.Groups
        .Select(g => new CrawlerGroupDto(g.Key, g.Label, g.Description, g.AllowedByDefault, s.Bots.IsAllowed(g.Key), g.UserAgents)).ToList();

    /// <summary>robots.txt as it would be served with these additions (nothing is saved), with warnings and field errors.</summary>
    public async Task<RobotsPreviewDto> PreviewRobotsAsync(PreviewRobotsFileRequest request, CancellationToken ct)
    {
        await resolver.EnsureLoadedAsync(ct);
        var current = await settings.GetAsync(ct);
        var e = new FieldErrors();
        var (options, warnings) = SeoFileRules.Robots(request.ExtraRules, request.ExtraText, request.ExtraSitemaps, e);
        var groups = current.Bots.Groups.ToDictionary(kv => kv.Key, kv => kv.Value);
        foreach (var (key, allowed) in request.CrawlerGroups ?? new())
            if (CrawlerCatalog.Find(key) is not null) groups[key] = allowed;
        if (!groups.GetValueOrDefault(CrawlerCatalog.Search, true))
            warnings.Insert(0, new RobotsWarning("searchBlocked", "Search engines are blocked: the site will drop out of Google and Bing."));
        var preview = current with { Bots = new BotPolicy(groups), Robots = options };
        return new RobotsPreviewDto(RobotsWriter.Write(preview, resolver.BaseUrl), warnings, e.ToDictionary());
    }

    public async Task<SeoFilesDto> UpdateRobotsAsync(UpdateRobotsFileRequest request, CancellationToken ct)
    {
        var e = new FieldErrors();
        var (options, warnings) = SeoFileRules.Robots(request.ExtraRules, request.ExtraText, request.ExtraSitemaps, e);
        e.ThrowIfAny();
        if (warnings.Any(w => w.Code == "disallowAll") && !request.ConfirmDisallowAll)
            throw new DomainException("seo.confirm_disallow_all", warnings.First(w => w.Code == "disallowAll").Message + " Confirm to save it.",
                DomainErrorKind.Validation, new Dictionary<string, string[]> { ["confirmDisallowAll"] = new[] { "Confirm that this rule should close the site." } });
        await resolver.EnsureLoadedAsync(ct);
        var (s, updatedAt, stamp) = await settings.SaveAsync(request.ConcurrencyStamp!.Value, "website.seo_robots_updated",
            before => before with { Robots = options }, x => x.RobotsOrDefault, ct);
        return await ReloadedAsync(s, updatedAt, stamp, ct);
    }

    /// <summary>The DTO after a save: the resolver re-reads the settings so the report and the generated files match them.</summary>
    private async Task<SeoFilesDto> ReloadedAsync(SeoSettings s, DateTime updatedAt, Guid stamp, CancellationToken ct)
    {
        resolver.Reload();
        await resolver.EnsureLoadedAsync(ct);
        return await ToDtoAsync(s, updatedAt, stamp, ct);
    }

    public async Task<SeoFilesDto> UpdateSitemapAsync(UpdateSitemapFileRequest request, CancellationToken ct)
    {
        var e = new FieldErrors();
        var options = SeoFileRules.Sitemap(request.ExcludedGroups, request.ExcludedPaths, request.ExtraPaths, request.GroupDefaults, e);
        e.ThrowIfAny();
        await resolver.EnsureLoadedAsync(ct);
        var (s, updatedAt, stamp) = await settings.SaveAsync(request.ConcurrencyStamp!.Value, "website.seo_sitemap_updated",
            before => before with { Sitemap = options }, x => x.SitemapOrDefault, ct);
        return await ReloadedAsync(s, updatedAt, stamp, ct);
    }

    public async Task<SeoFilesDto> ToggleSitemapUrlAsync(ToggleSitemapUrlRequest request, CancellationToken ct)
    {
        var e = new FieldErrors();
        var path = SeoFileRules.PublicPath(request.Path, "path", e, forExtra: false);
        e.ThrowIfAny();
        await resolver.EnsureLoadedAsync(ct);
        var (s, updatedAt, stamp) = await settings.SaveAsync(request.ConcurrencyStamp!.Value, "website.seo_sitemap_updated", before =>
        {
            var o = before.SitemapOrDefault;
            var paths = o.ExcludedPaths.Where(p => p != path).ToList();
            if (request.Excluded) paths.Add(path!);
            if (paths.Count > SeoFileRules.MaxExcludedPaths) throw new DomainException("seo.too_many_exclusions", $"Exclude at most {SeoFileRules.MaxExcludedPaths:N0} addresses.");
            return before with { Sitemap = o with { ExcludedPaths = paths } };
        }, x => new { x.SitemapOrDefault.ExcludedPaths.Count, Path = path, request.Excluded }, ct);
        return await ReloadedAsync(s, updatedAt, stamp, ct);
    }

    /// <summary>The sitemap report's rows (listed and hidden public URLs), filtered by group, state and text; at most 1,000.</summary>
    public async Task<SitemapUrlsDto> UrlsAsync(string? group, string? state, string? q, CancellationToken ct)
    {
        await resolver.EnsureLoadedAsync(ct);
        var options = resolver.Seo.SitemapOrDefault;
        var extra = options.ExtraPaths.ToHashSet(StringComparer.Ordinal);
        IEnumerable<SitemapUrl> rows = await resolver.SitemapReportAsync(ct);
        if (!string.IsNullOrWhiteSpace(group)) rows = rows.Where(u => u.Group == group);
        if (state == "listed") rows = rows.Where(u => u.HiddenBy is null);
        else if (state == "hidden") rows = rows.Where(u => u.HiddenBy is not null);
        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim();
            rows = rows.Where(u => u.Path.Contains(term, StringComparison.OrdinalIgnoreCase) || u.Title.Contains(term, StringComparison.OrdinalIgnoreCase));
        }
        var list = rows.ToList();
        const int max = 1000;
        return new SitemapUrlsDto(list.Take(max).Select(u => new SitemapUrlRowDto(u.Path, resolver.Absolute(u.Path), u.Group, u.Title, u.LastModified,
            u.HiddenBy, extra.Contains(u.Path))).ToList(), list.Count, list.Count > max);
    }

    public async Task<SeoFilesDto> UpdateLlmsAsync(UpdateLlmsFileRequest request, CancellationToken ct)
    {
        var e = new FieldErrors();
        var options = SeoFileRules.Llms(request.Summary, request.Intro, request.ExcludedSections, request.CustomSections, request.AcademyGuideEnabled, e);
        e.ThrowIfAny();
        await resolver.EnsureLoadedAsync(ct);
        var (s, updatedAt, stamp) = await settings.SaveAsync(request.ConcurrencyStamp!.Value, "website.seo_llms_updated",
            before => before with { Llms = options }, x => x.LlmsOrDefault, ct);
        return await ReloadedAsync(s, updatedAt, stamp, ct);
    }
}

/// <summary>Agency → Website → SEO → robots.txt, Sitemaps and llms.txt (site.manage; changes denied while impersonating).</summary>
[ApiController]
[HasPermission(Permissions.SiteManage)]
[Route("api/v1/agency/website/seo/files")]
public sealed class WebsiteSeoFilesController(SeoFilesService files, IServiceProvider services) : ControllerBase
{
    [HttpGet]
    public Task<SeoFilesDto> Get(CancellationToken ct) => files.GetAsync(ct);

    [HttpPost("robots/preview")]
    public Task<RobotsPreviewDto> PreviewRobots(PreviewRobotsFileRequest request, CancellationToken ct) => files.PreviewRobotsAsync(request, ct);

    [HttpPut("robots")]
    [DeniedWhileImpersonating]
    public Task<SeoFilesDto> UpdateRobots(UpdateRobotsFileRequest request, CancellationToken ct) => files.UpdateRobotsAsync(request, ct);

    [HttpPut("sitemap")]
    [DeniedWhileImpersonating]
    public Task<SeoFilesDto> UpdateSitemap(UpdateSitemapFileRequest request, CancellationToken ct) => files.UpdateSitemapAsync(request, ct);

    [HttpPost("sitemap/urls")]
    [DeniedWhileImpersonating]
    public Task<SeoFilesDto> ToggleUrl(ToggleSitemapUrlRequest request, CancellationToken ct) => files.ToggleSitemapUrlAsync(request, ct);

    [HttpGet("sitemap/urls")]
    public Task<SitemapUrlsDto> Urls([FromQuery] string? group, [FromQuery] string? state, [FromQuery] string? q, CancellationToken ct) =>
        files.UrlsAsync(group, state, q, ct);

    [HttpPut("llms")]
    [DeniedWhileImpersonating]
    public Task<SeoFilesDto> UpdateLlms(UpdateLlmsFileRequest request, CancellationToken ct) => files.UpdateLlmsAsync(request, ct);

    /// <summary>llms.txt as it is served now (also when it is switched off), for the editor's preview.</summary>
    [HttpGet("llms/preview")]
    public async Task<IActionResult> PreviewLlms([FromQuery] string? file, CancellationToken ct)
    {
        var llms = services.GetRequiredService<LlmsTxtService>();
        var body = file switch
        {
            "academy" => await llms.SectionAsync("academy", ct) ?? string.Empty,
            _ => await llms.LlmsTxtAsync(ct),
        };
        return Content(body, "text/plain; charset=utf-8");
    }
}
