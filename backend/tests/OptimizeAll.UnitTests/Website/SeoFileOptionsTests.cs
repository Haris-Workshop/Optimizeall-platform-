using System.Xml.Linq;
using OptimizeAll.Api.Modules.Website.Shared;
using OptimizeAll.Api.Modules.Website.SiteSeo;

namespace OptimizeAll.UnitTests.Website;

/// <summary>The editable parts of robots.txt, the sitemaps and llms.txt (Agency → Website → SEO): validation and output.</summary>
public sealed class SeoFileOptionsTests
{
    private const string Base = "https://www.example.test";

    private static SitemapUrl Url(string path, string group) =>
        new(path, new DateTime(2026, 9, 1, 12, 0, 0, DateTimeKind.Utc), group, Array.Empty<SeoImage>(), Array.Empty<SeoVideo>(), path);

    [Fact]
    public void Robots_additions_are_normalised_and_written_into_every_crawling_group()
    {
        var e = new FieldErrors();
        var (options, warnings) = SeoFileRules.Robots(new[] { "disallow:   /drafts/", "Crawl-delay: 5", " " },
            "# Our partner's crawler\r\nUser-agent: ExampleBot\r\ndisallow: /private/\n", new[] { "https://cdn.example.test/sitemap.xml" }, e);
        Assert.False(e.Any);
        Assert.Empty(warnings);
        Assert.Equal(new[] { "Disallow: /drafts/", "Crawl-delay: 5" }, options.ExtraRules);

        var text = RobotsWriter.Write(SeoSettings.Defaults with { Robots = options }, Base);
        // Every group that may crawl gets the rule (search, AI search, AI training, everyone else); blocked groups do not.
        Assert.Equal(4, text.Split("Disallow: /drafts/\n").Length - 1);
        Assert.Contains("User-agent: ExampleBot\nDisallow: /private/\n", text);
        Assert.Contains("Sitemap: https://www.example.test/sitemap.xml\nSitemap: https://cdn.example.test/sitemap.xml\n", text);
        // The generated private-area rules still come first and are untouched.
        Assert.True(text.IndexOf("Disallow: /app$", StringComparison.Ordinal) < text.IndexOf("Disallow: /drafts/", StringComparison.Ordinal));
    }

    [Theory]
    [InlineData("Disallow: /")]
    [InlineData("Disallow: /*")]
    [InlineData("disallow:/")]
    public void Closing_the_whole_site_is_flagged(string rule)
    {
        var e = new FieldErrors();
        var (_, warnings) = SeoFileRules.Robots(new[] { rule }, null, null, e);
        Assert.False(e.Any);
        Assert.Contains(warnings, w => w.Code == "disallowAll");

        var (_, textWarnings) = SeoFileRules.Robots(null, "User-agent: ExampleBot\n" + rule, null, e);
        Assert.Contains(textWarnings, w => w.Code == "disallowAll");
    }

    [Theory]
    [InlineData("Noindex: /x")]
    [InlineData("Disallow private")]
    [InlineData("Allow: nope")]
    [InlineData("Crawl-delay: soon")]
    public void Invalid_rules_are_rejected(string rule)
    {
        var e = new FieldErrors();
        SeoFileRules.Robots(new[] { rule }, null, null, e);
        Assert.True(e.Any);
    }

    [Theory]
    [InlineData("User-agent: *\nDisallow: /x")]
    [InlineData("User-agent: GPTBot\nDisallow: /x")]
    [InlineData("Disallow: /x")]
    [InlineData("Sitemap: /relative.xml")]
    [InlineData("<script>alert(1)</script>")]
    public void Extra_lines_cannot_redefine_the_generated_groups_or_break_the_file(string lines)
    {
        var e = new FieldErrors();
        SeoFileRules.Robots(null, lines, new[] { "ftp://x.test/s.xml" }, e);
        Assert.True(e.Any);
    }

    [Fact]
    public void Sitemap_options_validate_paths_groups_and_hints()
    {
        var e = new FieldErrors();
        var options = SeoFileRules.Sitemap(new[] { "careers", "videos" }, new[] { "/old-page", "/blog?category=news" }, new[] { "/webinar" },
            new Dictionary<string, SitemapGroupDefaults> { ["blog"] = new("Weekly", 0.6m) }, e);
        Assert.False(e.Any);
        Assert.Equal("weekly", options.GroupDefaults["blog"].ChangeFrequency);

        var bad = new FieldErrors();
        SeoFileRules.Sitemap(new[] { "nope" }, new[] { "https://elsewhere.test/x" }, new[] { "/admin/users", "/login" },
            new Dictionary<string, SitemapGroupDefaults> { ["blog"] = new("sometimes", 0.55m) }, bad);
        foreach (var field in new[] { "excludedGroups", "excludedPaths[0]", "extraPaths[0]", "extraPaths[1]", "groupDefaults.blog.changeFrequency", "groupDefaults.blog.priority" })
            Assert.True(bad.Has(field), field);
    }

    [Fact]
    public void Excluded_groups_leave_the_index_and_group_hints_are_written()
    {
        var urls = new[] { Url("/", SeoPageResolver.GroupPages), Url("/careers/dev", SeoPageResolver.GroupCareers), Url("/blog/a", SeoPageResolver.GroupBlog) };
        var options = SitemapOptions.Defaults with { ExcludedGroups = new[] { SeoPageResolver.GroupCareers } };
        var files = SitemapWriter.Files(urls, 45_000, options);
        Assert.Equal(new[] { "pages", "blog" }, files.Select(f => f.Name));
        Assert.Equal("case-studies", SitemapWriter.GroupOf(new SitemapFile("case-studies", "urls", Array.Empty<SitemapUrl>(), null)));
        Assert.Equal("case-studies", SitemapWriter.GroupOf(new SitemapFile("case-studies-2", "urls", Array.Empty<SitemapUrl>(), null)));

        XNamespace ns = "http://www.sitemaps.org/schemas/sitemap/0.9";
        var blog = XDocument.Parse(SitemapWriter.UrlSet(files.Single(f => f.Name == "blog"), Base, new SitemapGroupDefaults("weekly", 0.6m)));
        Assert.Equal("weekly", blog.Descendants(ns + "changefreq").Single().Value);
        Assert.Equal("0.6", blog.Descendants(ns + "priority").Single().Value);
        var plain = XDocument.Parse(SitemapWriter.UrlSet(files.Single(f => f.Name == "pages"), Base));
        Assert.Empty(plain.Descendants(ns + "changefreq"));
    }

    [Fact]
    public void Llms_options_are_cleaned_and_checked()
    {
        var e = new FieldErrors();
        var options = SeoFileRules.Llms("  A short summary ", "Line one\r\n\r\nLine two\u0007", new[] { "blog", "partners" },
            new[] { new LlmsCustomSection("## Pricing notes", "All prices exclude VAT.") }, academyGuide: false, e);
        Assert.False(e.Any);
        Assert.Equal("A short summary", options.Summary);
        Assert.Equal("Line one\n\nLine two", options.Intro);
        Assert.Equal("Pricing notes", options.CustomSections.Single().Title);
        Assert.False(options.Includes(LlmsSections.Blog));
        Assert.True(options.Includes(LlmsSections.Services));

        var bad = new FieldErrors();
        SeoFileRules.Llms("two\nlines", null, new[] { "unknown" }, new[] { new LlmsCustomSection("", "") }, true, bad);
        foreach (var field in new[] { "summary", "excludedSections", "customSections[0].title", "customSections[0].body" })
            Assert.True(bad.Has(field), field);
    }

    [Fact]
    public void Stored_settings_without_the_new_parts_read_as_defaults()
    {
        var parsed = SeoSettingsService.Parse("{\"bots\":{\"groups\":{}},\"llmsTxtEnabled\":true}");
        Assert.Empty(parsed.RobotsOrDefault.ExtraRules);
        Assert.Empty(parsed.SitemapOrDefault.ExcludedPaths);
        Assert.True(parsed.LlmsOrDefault.AcademyGuideEnabled);
        Assert.Equal(RobotsWriter.Write(SeoSettings.Defaults, Base), RobotsWriter.Write(parsed, Base));
    }
}
