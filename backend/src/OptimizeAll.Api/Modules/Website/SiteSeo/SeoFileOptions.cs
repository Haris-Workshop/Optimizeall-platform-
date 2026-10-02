using System.Globalization;
using System.Text.RegularExpressions;
using OptimizeAll.Api.Modules.Accounts;
using OptimizeAll.Api.Modules.Website.Shared;

namespace OptimizeAll.Api.Modules.Website.SiteSeo;

/// <summary>
/// Editor additions to the generated robots.txt (Agency → Website → SEO → robots.txt). The generated rules (private areas,
/// crawler groups) always come first and cannot be removed here.
/// </summary>
/// <param name="ExtraRules">Allow / Disallow / Crawl-delay lines added to every crawler group that may crawl the site.</param>
/// <param name="ExtraText">Extra lines appended after the generated groups: comments or groups for other crawlers.</param>
/// <param name="ExtraSitemaps">Absolute sitemap URLs listed after the site's own sitemap index.</param>
public sealed record RobotsOptions(IReadOnlyList<string> ExtraRules, string? ExtraText, IReadOnlyList<string> ExtraSitemaps)
{
    public static RobotsOptions Defaults => new(Array.Empty<string>(), null, Array.Empty<string>());
}

/// <summary><c>changefreq</c> and <c>priority</c> written for every URL of a sitemap group (null: left out, as before).</summary>
public sealed record SitemapGroupDefaults(string? ChangeFrequency, decimal? Priority);

/// <summary>Editor choices for the sitemaps (Agency → Website → SEO → Sitemaps).</summary>
/// <param name="ExcludedGroups">Sitemap files left out of the index (a content group, <c>images</c> or <c>videos</c>).</param>
/// <param name="ExcludedPaths">Individual URLs (path and query, e.g. <c>/blog?category=news</c>) left out of every sitemap.</param>
/// <param name="ExtraPaths">Public paths added to the <c>pages</c> sitemap (pages the generator does not know about).</param>
public sealed record SitemapOptions(
    IReadOnlyList<string> ExcludedGroups, IReadOnlyList<string> ExcludedPaths, IReadOnlyList<string> ExtraPaths,
    IReadOnlyDictionary<string, SitemapGroupDefaults> GroupDefaults)
{
    public static SitemapOptions Defaults => new(Array.Empty<string>(), Array.Empty<string>(), Array.Empty<string>(),
        new Dictionary<string, SitemapGroupDefaults>());

    public bool Excludes(SitemapUrl url) =>
        ExcludedGroups.Contains(url.Group, StringComparer.Ordinal) || ExcludedPaths.Contains(url.Path, StringComparer.Ordinal);
}

/// <summary>A section an editor adds to llms.txt (Markdown).</summary>
public sealed record LlmsCustomSection(string Title, string Body);

/// <summary>Editor choices for llms.txt (Agency → Website → SEO → llms.txt).</summary>
/// <param name="Summary">The one-line summary (the "&gt;" quote under the title); null: the default SEO description.</param>
/// <param name="Intro">The introduction paragraph(s) under it; null: the generated introduction.</param>
/// <param name="ExcludedSections">Generated sections left out (keys of <see cref="LlmsSections.All"/>).</param>
/// <param name="CustomSections">Sections added before "Machine-readable".</param>
/// <param name="AcademyGuideEnabled">Publish <c>/llms/academy.txt</c> (and link it).</param>
public sealed record LlmsOptions(
    string? Summary, string? Intro, IReadOnlyList<string> ExcludedSections, IReadOnlyList<LlmsCustomSection> CustomSections, bool AcademyGuideEnabled)
{
    public static LlmsOptions Defaults => new(null, null, Array.Empty<string>(), Array.Empty<LlmsCustomSection>(), true);

    public bool Includes(string section) => !ExcludedSections.Contains(section, StringComparer.Ordinal);
}

/// <summary>The generated sections of llms.txt an editor can switch off.</summary>
public static class LlmsSections
{
    public const string KeyPages = "keyPages";
    public const string Services = "services";
    public const string Industries = "industries";
    public const string CaseStudies = "caseStudies";
    public const string Blog = "blog";
    public const string BlogTopics = "blogTopics";
    public const string Careers = "careers";
    public const string Creators = "creators";
    public const string Partners = "partners";
    public const string Academy = "academy";
    public const string Optional = "optional";

    public static readonly IReadOnlyList<(string Key, string Label)> All = new[]
    {
        (KeyPages, "Key pages"), (Services, "Services"), (Industries, "Industries"), (CaseStudies, "Case studies"), (Blog, "Blog articles"),
        (BlogTopics, "Blog topics"), (Careers, "Careers"), (Creators, "Creators programme"), (Partners, "Partners"),
        (Academy, "Academy courses"), (Optional, "Optional (other pages)"),
    };
}

/// <summary>A robots.txt check result shown in the editor's preview.</summary>
public sealed record RobotsWarning(string Code, string Message);

/// <summary>Validation of the editable parts of robots.txt, the sitemaps and llms.txt.</summary>
public static partial class SeoFileRules
{
    public const int MaxExtraRules = 50;
    public const int MaxExtraTextLines = 200;
    public const int MaxExtraSitemaps = 20;
    public const int MaxExcludedPaths = 2000;
    public const int MaxExtraPaths = 200;
    public const int MaxCustomSections = 10;

    public static readonly string[] ChangeFrequencies = { "always", "hourly", "daily", "weekly", "monthly", "yearly", "never" };

    /// <summary>Directives allowed in a crawler group (extra rules) and in the free text.</summary>
    private static readonly string[] RuleFields = { "Allow", "Disallow", "Crawl-delay" };
    private static readonly string[] TextFields = { "User-agent", "Allow", "Disallow", "Crawl-delay", "Sitemap", "Clean-param", "Host" };

    /// <summary>The sitemap files an editor may leave out: every content group plus images and videos.</summary>
    public static IEnumerable<string> SitemapGroups => SeoPageResolver.UrlGroups.Concat(new[] { "images", "videos" });

    private static (string Field, string Value)? Directive(string line)
    {
        var i = line.IndexOf(':');
        if (i <= 0) return null;
        return (line[..i].Trim(), line[(i + 1)..].Trim());
    }

    /// <summary>True for a Disallow value that closes the whole site (<c>/</c>, <c>/*</c>).</summary>
    public static bool IsWholeSite(string value) => value is "/" or "/*" or "*";

    private static string? Canonical(string field, IEnumerable<string> allowed) =>
        allowed.FirstOrDefault(f => string.Equals(f, field, StringComparison.OrdinalIgnoreCase));

    private static bool ValidRuleValue(string field, string value) => field switch
    {
        "Crawl-delay" => decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var d) && d >= 0 && d <= 60,
        "Disallow" => value.Length == 0 || value.StartsWith('/') || value.StartsWith('*'),
        _ => value.StartsWith('/') || value.StartsWith('*'),
    };

    /// <summary>Cleans and validates the robots.txt additions; adds field errors and returns the cleaned options plus warnings.</summary>
    public static (RobotsOptions Options, List<RobotsWarning> Warnings) Robots(
        IReadOnlyList<string>? extraRules, string? extraText, IReadOnlyList<string>? extraSitemaps, FieldErrors e)
    {
        var warnings = new List<RobotsWarning>();
        var rules = new List<string>();
        var rulesIn = (extraRules ?? Array.Empty<string>()).Select(l => (l ?? string.Empty).Trim()).Where(l => l.Length > 0).ToList();
        if (rulesIn.Count > MaxExtraRules) e.Add("extraRules", $"Add at most {MaxExtraRules} rules.");
        for (var i = 0; i < rulesIn.Count; i++)
        {
            var line = rulesIn[i];
            var d = Directive(line);
            var field = d is null ? null : Canonical(d.Value.Field, RuleFields);
            if (line.Length > 500 || d is null || field is null || !ValidRuleValue(field, d.Value.Value) || ControlRegex().IsMatch(line))
            {
                e.Add($"extraRules[{i}]", "Write a rule as 'Disallow: /path', 'Allow: /path' or 'Crawl-delay: 5'.");
                continue;
            }
            if (field == "Disallow" && IsWholeSite(d!.Value.Value))
                warnings.Add(new RobotsWarning("disallowAll", $"'{line}' closes the whole site to every crawler, including search engines."));
            rules.Add($"{field}: {d!.Value.Value}");
        }

        var text = new List<string>();
        var textIn = (extraText ?? string.Empty).Replace("\r\n", "\n").Replace('\r', '\n').Split('\n').Select(l => l.Trim()).ToList();
        while (textIn.Count > 0 && textIn[^1].Length == 0) textIn.RemoveAt(textIn.Count - 1);
        while (textIn.Count > 0 && textIn[0].Length == 0) textIn.RemoveAt(0);
        if (textIn.Count > MaxExtraTextLines) e.Add("extraText", $"Use at most {MaxExtraTextLines} lines.");
        var catalogAgents = CrawlerCatalog.Groups.SelectMany(g => g.UserAgents).ToHashSet(StringComparer.OrdinalIgnoreCase);
        string? agent = null;
        for (var i = 0; i < textIn.Count && i < MaxExtraTextLines; i++)
        {
            var line = textIn[i];
            if (line.Length == 0 || line.StartsWith('#'))
            {
                if (line.Length > 500 || ControlRegex().IsMatch(line)) e.Add("extraText", $"Line {i + 1}: keep comments to one line under 500 characters.");
                text.Add(line);
                if (line.Length == 0) agent = null;
                continue;
            }
            var d = Directive(line);
            var field = d is null ? null : Canonical(d.Value.Field, TextFields);
            if (line.Length > 500 || d is null || field is null || ControlRegex().IsMatch(line))
            {
                e.Add("extraText", $"Line {i + 1}: use 'Field: value' with User-agent, Allow, Disallow, Crawl-delay or Sitemap (or start a comment with #).");
                continue;
            }
            var value = d.Value.Value;
            switch (field)
            {
                case "User-agent":
                    if (value == "*")
                        e.Add("extraText", $"Line {i + 1}: 'User-agent: *' is generated already; use the rules for every crawler instead.");
                    else if (catalogAgents.Contains(value))
                        e.Add("extraText", $"Line {i + 1}: {value} is in a crawler group above; allow or block the group instead.");
                    else if (!AgentRegex().IsMatch(value))
                        e.Add("extraText", $"Line {i + 1}: a user agent is a single word such as ExampleBot.");
                    agent = value;
                    break;
                case "Sitemap":
                    if (!IsAbsoluteHttpUrl(value)) e.Add("extraText", $"Line {i + 1}: a sitemap is an absolute http(s) URL.");
                    break;
                case "Allow" or "Disallow" or "Crawl-delay":
                    if (agent is null) e.Add("extraText", $"Line {i + 1}: start a group with 'User-agent: name' before its rules.");
                    else if (!ValidRuleValue(field, value)) e.Add("extraText", $"Line {i + 1}: '{line}' is not a valid rule.");
                    else if (field == "Disallow" && IsWholeSite(value))
                        warnings.Add(new RobotsWarning("disallowAll", $"Line {i + 1} closes the whole site to {agent}."));
                    break;
            }
            text.Add($"{field}: {value}");
        }

        var sitemaps = new List<string>();
        var sitemapsIn = (extraSitemaps ?? Array.Empty<string>()).Select(l => (l ?? string.Empty).Trim()).Where(l => l.Length > 0).ToList();
        if (sitemapsIn.Count > MaxExtraSitemaps) e.Add("extraSitemaps", $"Add at most {MaxExtraSitemaps} sitemaps.");
        for (var i = 0; i < sitemapsIn.Count; i++)
        {
            if (sitemapsIn[i].Length > 500 || !IsAbsoluteHttpUrl(sitemapsIn[i])) e.Add($"extraSitemaps[{i}]", "Use an absolute https:// sitemap URL.");
            else sitemaps.Add(sitemapsIn[i]);
        }
        return (new RobotsOptions(rules, text.Count == 0 ? null : string.Join('\n', text), sitemaps.Distinct().ToList()), warnings);
    }

    public static bool IsAbsoluteHttpUrl(string value) =>
        Uri.TryCreate(value, UriKind.Absolute, out var u) && (u.Scheme == Uri.UriSchemeHttps || u.Scheme == Uri.UriSchemeHttp) && !value.Any(char.IsWhiteSpace);

    /// <summary>A public site path (with an optional query), as it appears in the sitemaps.</summary>
    public static string? PublicPath(string? raw, string field, FieldErrors e, bool forExtra)
    {
        var value = (raw ?? string.Empty).Trim();
        if (value.Length == 0) return null;
        if (value.Length > 500 || !value.StartsWith('/') || value.StartsWith("//", StringComparison.Ordinal) || value.Any(char.IsWhiteSpace) || value.Contains('#'))
        {
            e.Add(field, "Use a path on this site, such as /about.");
            return null;
        }
        var path = value.Split('?')[0];
        if (forExtra && (SeoPageResolver.IsPrivatePath(path) || SeoPageResolver.IsTokenPath(path) || path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase) ||
                         SeoPageResolver.UtilityPaths.Any(p => SeoPageResolver.IsUnder(path, p))))
        {
            e.Add(field, $"{value} is closed to crawlers (signed-in, personal or utility page) and can't be listed in the sitemap.");
            return null;
        }
        return value;
    }

    public static SitemapOptions Sitemap(
        IReadOnlyList<string>? excludedGroups, IReadOnlyList<string>? excludedPaths, IReadOnlyList<string>? extraPaths,
        IReadOnlyDictionary<string, SitemapGroupDefaults>? groupDefaults, FieldErrors e)
    {
        var known = SitemapGroups.ToHashSet(StringComparer.Ordinal);
        var groups = (excludedGroups ?? Array.Empty<string>()).Select(g => (g ?? string.Empty).Trim()).Where(g => g.Length > 0).Distinct().ToList();
        foreach (var g in groups.Where(g => !known.Contains(g))) e.Add("excludedGroups", $"Unknown sitemap '{g}'.");

        var excluded = (excludedPaths ?? Array.Empty<string>()).ToList();
        if (excluded.Count > MaxExcludedPaths) e.Add("excludedPaths", $"Exclude at most {MaxExcludedPaths:N0} addresses.");
        var paths = excluded.Take(MaxExcludedPaths).Select((p, i) => PublicPath(p, $"excludedPaths[{i}]", e, forExtra: false)).OfType<string>().Distinct().ToList();

        var extraIn = (extraPaths ?? Array.Empty<string>()).ToList();
        if (extraIn.Count > MaxExtraPaths) e.Add("extraPaths", $"Add at most {MaxExtraPaths} addresses.");
        var extra = extraIn.Take(MaxExtraPaths).Select((p, i) => PublicPath(p, $"extraPaths[{i}]", e, forExtra: true)).OfType<string>().Distinct().ToList();

        var defaults = new Dictionary<string, SitemapGroupDefaults>(StringComparer.Ordinal);
        foreach (var (group, d) in groupDefaults ?? new Dictionary<string, SitemapGroupDefaults>())
        {
            if (!SeoPageResolver.UrlGroups.Contains(group)) { e.Add($"groupDefaults.{group}", "Unknown sitemap group."); continue; }
            var freq = string.IsNullOrWhiteSpace(d?.ChangeFrequency) ? null : d!.ChangeFrequency.Trim().ToLowerInvariant();
            if (freq is not null && !ChangeFrequencies.Contains(freq)) e.Add($"groupDefaults.{group}.changeFrequency", "Choose a change frequency from the list.");
            var priority = d?.Priority;
            if (priority is { } p && (p < 0 || p > 1 || decimal.Round(p, 1) != p))
                e.Add($"groupDefaults.{group}.priority", "Use a priority from 0.0 to 1.0 in steps of 0.1.");
            if (freq is not null || priority is not null) defaults[group] = new SitemapGroupDefaults(freq, priority);
        }
        return new SitemapOptions(groups, paths, extra, defaults);
    }

    public static LlmsOptions Llms(
        string? summary, string? intro, IReadOnlyList<string>? excludedSections, IReadOnlyList<LlmsCustomSection>? customSections, bool academyGuide,
        FieldErrors e)
    {
        var s = WebsiteRules.Clean(summary);
        if (s is not null && (s.Contains('\n') || s.Length > 300)) e.Add("summary", "Keep the summary to one line under 300 characters.");
        var i = Text(intro);
        if (i is not null && i.Length > 5000) e.Add("intro", "Keep the introduction under 5,000 characters.");
        var keys = LlmsSections.All.Select(x => x.Key).ToHashSet(StringComparer.Ordinal);
        var excluded = (excludedSections ?? Array.Empty<string>()).Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x.Trim()).Distinct().ToList();
        foreach (var x in excluded.Where(x => !keys.Contains(x))) e.Add("excludedSections", $"Unknown section '{x}'.");
        var sections = new List<LlmsCustomSection>();
        var inSections = customSections ?? Array.Empty<LlmsCustomSection>();
        if (inSections.Count > MaxCustomSections) e.Add("customSections", $"Add at most {MaxCustomSections} sections.");
        for (var n = 0; n < inSections.Count && n < MaxCustomSections; n++)
        {
            var title = WebsiteRules.Clean(inSections[n]?.Title);
            var body = Text(inSections[n]?.Body);
            if (title is null) e.Add($"customSections[{n}].title", "Add a heading.");
            else if (title.Length > 100 || title.Contains('\n')) e.Add($"customSections[{n}].title", "Keep the heading to one line under 100 characters.");
            if (body is null) e.Add($"customSections[{n}].body", "Add the section's text.");
            else if (body.Length > 5000) e.Add($"customSections[{n}].body", "Keep the section under 5,000 characters.");
            if (title is not null && body is not null) sections.Add(new LlmsCustomSection(title.TrimStart('#', ' '), body));
        }
        return new LlmsOptions(s, i, excluded.Where(keys.Contains).ToList(), sections, academyGuide);
    }

    /// <summary>Multi-line plain text: line endings normalised, control characters and trailing spaces removed.</summary>
    private static string? Text(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var lines = raw.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n').Select(l => ControlRegex().Replace(l, string.Empty).TrimEnd());
        var text = string.Join('\n', lines).Trim('\n', ' ');
        return text.Length == 0 ? null : text;
    }

    [GeneratedRegex(@"[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]")]
    private static partial Regex ControlRegex();

    [GeneratedRegex(@"^[A-Za-z0-9._\-/]{1,80}$")]
    private static partial Regex AgentRegex();
}
