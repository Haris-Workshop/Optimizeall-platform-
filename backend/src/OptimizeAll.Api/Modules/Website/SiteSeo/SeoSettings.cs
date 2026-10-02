using System.ComponentModel.DataAnnotations;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using OptimizeAll.Api.Common.Audit;
using OptimizeAll.Api.Common.Persistence;
using OptimizeAll.Api.Modules.Accounts;
using OptimizeAll.Api.Modules.Website.Settings;
using OptimizeAll.Api.Modules.Website.Shared;
using OptimizeAll.Domain.Common;
using OptimizeAll.Domain.Website;
using OptimizeAll.Infrastructure.Persistence;

namespace OptimizeAll.Api.Modules.Website.SiteSeo;

/// <summary>A group of crawlers that robots.txt treats alike (one admin toggle per group).</summary>
public sealed record CrawlerGroup(string Key, string Label, string Description, bool AllowedByDefault, IReadOnlyList<string> UserAgents);

/// <summary>
/// The crawlers robots.txt names explicitly. Each named user agent gets its own robots.txt group (a crawler obeys only
/// the most specific group that names it, so every group repeats the private-area rules). The policy is documented in
/// docs/SEO_CRO.md.
/// </summary>
public static class CrawlerCatalog
{
    public const string Search = "search";
    public const string AiSearch = "aiSearch";
    public const string AiTraining = "aiTraining";
    public const string Scrapers = "scrapers";

    public static readonly IReadOnlyList<CrawlerGroup> Groups = new CrawlerGroup[]
    {
        new(Search, "Search engines",
            "Google, Bing, Apple, DuckDuckGo, Yandex and Baidu: how people find the site in search results.",
            true, new[] { "Googlebot", "Bingbot", "Applebot", "DuckDuckBot", "YandexBot", "Baiduspider" }),
        new(AiSearch, "AI search and assistants",
            "Crawlers that fetch pages to answer a user's question with a link back (ChatGPT search, Claude, Perplexity, " +
            "DuckDuckGo's DuckAssist, Mistral Le Chat, Meta AI, Amazon Alexa and Rufus, You.com).",
            true, new[] { "OAI-SearchBot", "ChatGPT-User", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User",
                "DuckAssistBot", "MistralAI-User", "Meta-ExternalFetcher", "Amazonbot", "YouBot" }),
        new(AiTraining, "AI model training",
            "Reputable AI companies that use public pages to train models (OpenAI, Anthropic, Google, Apple, Meta, Common Crawl).",
            true, new[] { "GPTBot", "ClaudeBot", "anthropic-ai", "Google-Extended", "Applebot-Extended", "Meta-ExternalAgent", "CCBot" }),
        new(Scrapers, "Aggressive scrapers",
            "Crawlers known for heavy, low-value scraping. Blocked by default.",
            false, new[] { "Bytespider", "PetalBot", "cohere-ai", "Diffbot", "ImagesiftBot", "omgili" }),
    };

    public static CrawlerGroup? Find(string key) => Groups.FirstOrDefault(g => g.Key == key);
}

public sealed record BotPolicy(IReadOnlyDictionary<string, bool> Groups)
{
    public bool IsAllowed(string groupKey) =>
        Groups.TryGetValue(groupKey, out var allowed) ? allowed : CrawlerCatalog.Find(groupKey)?.AllowedByDefault ?? true;
}

/// <summary>IndexNow (Bing, Yandex, Seznam, Naver…): off by default. The key is generated when first enabled.</summary>
public sealed record IndexNowSettings(bool Enabled, string? Key);

/// <summary>
/// The SEO settings document (stored as JSON in <c>website_settings</c> under the key <c>seo</c>): the crawler policy,
/// IndexNow, llms.txt, the security contact and the editor's additions to robots.txt, the sitemaps and llms.txt (stored
/// documents from before those existed read them as null; <see cref="SeoSettingsService.Parse"/> fills in the defaults).
/// </summary>
public sealed record SeoSettings(
    BotPolicy Bots, IndexNowSettings IndexNow, bool LlmsTxtEnabled, string? SecurityContactEmail,
    RobotsOptions? Robots = null, SitemapOptions? Sitemap = null, LlmsOptions? Llms = null)
{
    public static SeoSettings Defaults => new(
        new BotPolicy(CrawlerCatalog.Groups.ToDictionary(g => g.Key, g => g.AllowedByDefault)), new IndexNowSettings(false, null), true, null,
        RobotsOptions.Defaults, SitemapOptions.Defaults, LlmsOptions.Defaults);

    public RobotsOptions RobotsOrDefault => Robots ?? RobotsOptions.Defaults;

    public SitemapOptions SitemapOrDefault => Sitemap ?? SitemapOptions.Defaults;

    public LlmsOptions LlmsOrDefault => Llms ?? LlmsOptions.Defaults;
}

public sealed record CrawlerGroupDto(string Key, string Label, string Description, bool AllowedByDefault, bool Allowed, IReadOnlyList<string> UserAgents);

public sealed record SeoSettingsDto(
    IReadOnlyList<CrawlerGroupDto> CrawlerGroups, bool IndexNowEnabled, string? IndexNowKey, bool LlmsTxtEnabled, string? SecurityContactEmail,
    DateTime UpdatedAt, Guid ConcurrencyStamp);

public sealed class UpdateSeoSettingsRequest
{
    /// <summary>Crawler group key → allowed. Groups left out keep their current value.</summary>
    public Dictionary<string, bool>? CrawlerGroups { get; set; }

    public bool IndexNowEnabled { get; set; }

    public bool LlmsTxtEnabled { get; set; } = true;

    [MaxLength(254)]
    public string? SecurityContactEmail { get; set; }

    /// <summary>Blocking the search engines group closes the whole site to Google and Bing: it must be confirmed.</summary>
    public bool ConfirmBlockSearch { get; set; }

    [Required]
    public Guid? ConcurrencyStamp { get; set; }
}

/// <summary>Loads and saves the SEO settings (crawler policy, IndexNow, llms.txt, security contact).</summary>
public sealed partial class SeoSettingsService(AppDbContext db, IAuditLogger audit, IDatabaseDialect dialect)
{
    public const string DocumentKey = "seo";
    private const string LockName = "website.seo-settings";

    public async Task<SeoSettings> GetAsync(CancellationToken ct)
    {
        var json = await db.Set<SiteSettingsDocument>().AsNoTracking().Where(d => d.Key == DocumentKey).Select(d => d.Json).FirstOrDefaultAsync(ct);
        return Parse(json);
    }

    public static SeoSettings Parse(string? json)
    {
        var defaults = SeoSettings.Defaults;
        if (string.IsNullOrWhiteSpace(json)) return defaults;
        try
        {
            var s = JsonSerializer.Deserialize<SeoSettings>(json, SiteSettingsService.Json);
            if (s is null) return defaults;
            // Groups added to the catalog after the document was saved take their default.
            var groups = CrawlerCatalog.Groups.ToDictionary(g => g.Key,
                g => s.Bots?.Groups is { } saved && saved.TryGetValue(g.Key, out var v) ? v : g.AllowedByDefault);
            var robots = s.Robots is null ? RobotsOptions.Defaults : new RobotsOptions(s.Robots.ExtraRules ?? Array.Empty<string>(),
                s.Robots.ExtraText, s.Robots.ExtraSitemaps ?? Array.Empty<string>());
            var sitemap = s.Sitemap is null ? SitemapOptions.Defaults : new SitemapOptions(s.Sitemap.ExcludedGroups ?? Array.Empty<string>(),
                s.Sitemap.ExcludedPaths ?? Array.Empty<string>(), s.Sitemap.ExtraPaths ?? Array.Empty<string>(),
                s.Sitemap.GroupDefaults ?? new Dictionary<string, SitemapGroupDefaults>());
            var llms = s.Llms is null ? LlmsOptions.Defaults : new LlmsOptions(s.Llms.Summary, s.Llms.Intro, s.Llms.ExcludedSections ?? Array.Empty<string>(),
                s.Llms.CustomSections ?? Array.Empty<LlmsCustomSection>(), s.Llms.AcademyGuideEnabled);
            return new SeoSettings(new BotPolicy(groups), s.IndexNow ?? defaults.IndexNow, s.LlmsTxtEnabled, s.SecurityContactEmail, robots, sitemap, llms);
        }
        catch (JsonException)
        {
            return defaults;
        }
    }

    public async Task<SeoSettingsDto> GetForEditAsync(CancellationToken ct)
    {
        var doc = await db.Set<SiteSettingsDocument>().AsNoTracking().FirstOrDefaultAsync(d => d.Key == DocumentKey, ct);
        return ToDto(Parse(doc?.Json), doc?.UpdatedAt ?? DateTime.UnixEpoch, doc?.ConcurrencyStamp ?? Guid.Empty);
    }

    /// <summary>
    /// Saves the settings. The first save creates the document (expected stamp <see cref="Guid.Empty"/>); a named lock plus a
    /// write transaction make concurrent first saves safe. Audited with before/after values.
    /// </summary>
    public async Task<SeoSettingsDto> UpdateAsync(UpdateSeoSettingsRequest request, CancellationToken ct)
    {
        var e = new FieldErrors();
        foreach (var key in (request.CrawlerGroups ?? new()).Keys.Where(k => CrawlerCatalog.Find(k) is null))
            e.Add($"crawlerGroups.{key}", "Unknown crawler group.");
        var email = WebsiteRules.Clean(request.SecurityContactEmail);
        if (email is not null && !FieldRules.IsEmail(email)) e.Add("securityContactEmail", "Enter a valid email address.");
        e.ThrowIfAny();
        var current = await GetAsync(ct);
        if (request.CrawlerGroups is { } requested && requested.TryGetValue(CrawlerCatalog.Search, out var search) && !search &&
            current.Bots.IsAllowed(CrawlerCatalog.Search) && !request.ConfirmBlockSearch)
            throw new DomainException("seo.confirm_block_search",
                "Blocking search engines removes the whole site from Google and Bing. Confirm to block them.", DomainErrorKind.Validation,
                new Dictionary<string, string[]> { ["crawlerGroups.search"] = new[] { "Confirm that search engines may not crawl the site." } });

        await using var named = await dialect.AcquireNamedLockAsync(db, LockName, TimeSpan.FromSeconds(10), ct);
        await using var tx = await dialect.BeginWriteTransactionAsync(db, ct);
        var doc = await db.Set<SiteSettingsDocument>().FirstOrDefaultAsync(d => d.Key == DocumentKey, ct);
        var expected = request.ConcurrencyStamp!.Value;
        if (doc is null && expected != Guid.Empty)
            throw DomainException.Conflict("concurrency.conflict", "This record was changed by someone else. Reload and try again.");
        if (doc is not null) ConcurrencyGuard.Apply(db, doc, expected);

        var before = Parse(doc?.Json);
        var groups = before.Bots.Groups.ToDictionary(kv => kv.Key, kv => kv.Value);
        foreach (var (key, allowed) in request.CrawlerGroups ?? new()) groups[key] = allowed;
        var indexNowKey = before.IndexNow.Key ?? (request.IndexNowEnabled ? NewIndexNowKey() : null);
        var after = before with
        {
            Bots = new BotPolicy(groups), IndexNow = new IndexNowSettings(request.IndexNowEnabled, indexNowKey), LlmsTxtEnabled = request.LlmsTxtEnabled,
            SecurityContactEmail = email,
        };

        if (doc is null)
        {
            doc = new SiteSettingsDocument { Key = DocumentKey };
            db.Set<SiteSettingsDocument>().Add(doc);
        }
        doc.Json = JsonSerializer.Serialize(after, SiteSettingsService.Json);
        audit.Record("website.seo_settings_updated", nameof(SiteSettingsDocument), doc.Id, before, after);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return ToDto(after, doc.UpdatedAt, doc.ConcurrencyStamp);
    }

    /// <summary>The settings with the document's last update and concurrency stamp (empty before the first save).</summary>
    public async Task<(SeoSettings Settings, DateTime UpdatedAt, Guid Stamp)> GetWithStampAsync(CancellationToken ct)
    {
        var doc = await db.Set<SiteSettingsDocument>().AsNoTracking().FirstOrDefaultAsync(d => d.Key == DocumentKey, ct);
        return (Parse(doc?.Json), doc?.UpdatedAt ?? DateTime.UnixEpoch, doc?.ConcurrencyStamp ?? Guid.Empty);
    }

    /// <summary>
    /// Applies <paramref name="change"/> to the stored settings under the same lock, transaction and concurrency rules as
    /// <see cref="UpdateAsync"/>, and audits <paramref name="action"/> with the changed part before and after.
    /// </summary>
    public async Task<(SeoSettings Settings, DateTime UpdatedAt, Guid Stamp)> SaveAsync(
        Guid expected, string action, Func<SeoSettings, SeoSettings> change, Func<SeoSettings, object?> audited, CancellationToken ct)
    {
        await using var named = await dialect.AcquireNamedLockAsync(db, LockName, TimeSpan.FromSeconds(10), ct);
        await using var tx = await dialect.BeginWriteTransactionAsync(db, ct);
        var doc = await db.Set<SiteSettingsDocument>().FirstOrDefaultAsync(d => d.Key == DocumentKey, ct);
        if (doc is null && expected != Guid.Empty)
            throw DomainException.Conflict("concurrency.conflict", "This record was changed by someone else. Reload and try again.");
        if (doc is not null) ConcurrencyGuard.Apply(db, doc, expected);
        var before = Parse(doc?.Json);
        var after = change(before);
        if (doc is null)
        {
            doc = new SiteSettingsDocument { Key = DocumentKey };
            db.Set<SiteSettingsDocument>().Add(doc);
        }
        doc.Json = JsonSerializer.Serialize(after, SiteSettingsService.Json);
        audit.Record(action, nameof(SiteSettingsDocument), doc.Id, audited(before), audited(after));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return (after, doc.UpdatedAt, doc.ConcurrencyStamp);
    }

    /// <summary>A 32-character hex key (IndexNow accepts 8–128 characters of [a-zA-Z0-9-]).</summary>
    public static string NewIndexNowKey() => Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();

    public static bool IsIndexNowKey(string value) => IndexNowKeyRegex().IsMatch(value);

    private static SeoSettingsDto ToDto(SeoSettings s, DateTime updatedAt, Guid stamp) => new(
        CrawlerCatalog.Groups.Select(g => new CrawlerGroupDto(g.Key, g.Label, g.Description, g.AllowedByDefault, s.Bots.IsAllowed(g.Key), g.UserAgents))
            .ToList(),
        s.IndexNow.Enabled, s.IndexNow.Key, s.LlmsTxtEnabled, s.SecurityContactEmail, updatedAt, stamp);

    [GeneratedRegex("^[A-Za-z0-9-]{8,128}$")]
    private static partial Regex IndexNowKeyRegex();
}
