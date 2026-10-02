using System.Net;
using System.Text.Json;
using System.Xml.Linq;
using Microsoft.EntityFrameworkCore;
using OptimizeAll.Domain.Audit;
using OptimizeAll.Domain.Learning;
using OptimizeAll.Domain.Website;
using OptimizeAll.IntegrationTests.Infrastructure;

namespace OptimizeAll.IntegrationTests.Website;

/// <summary>
/// Agency → Website → SEO → robots.txt, Sitemaps and llms.txt (<c>/api/v1/agency/website/seo/files</c>): the editor's
/// additions are validated, audited and served at once; the content's own "hide from sitemap" flags are honoured.
/// </summary>
public sealed class SeoFilesAdminTests(ApiFactory api) : IClassFixture<ApiFactory>
{
    private const string Files = "/api/v1/agency/website/seo/files";
    private static readonly XNamespace Ns = "http://www.sitemaps.org/schemas/sitemap/0.9";

    private static Guid Stamp(JsonElement files) => files.GetProperty("concurrencyStamp").GetGuid();

    private async Task<bool> AuditedAsync(string action) =>
        await api.WithDbAsync(db => db.Set<AuditLog>().AnyAsync(a => a.Action == action));

    private async Task<List<string>> SitemapLocsAsync(string file) =>
        XDocument.Parse(await api.Anonymous().GetStringAsync(file)).Descendants(Ns + "loc").Select(l => l.Value).ToList();

    [Fact]
    public async Task Robots_additions_are_previewed_validated_confirmed_and_served()
    {
        var admin = await api.AdminAsync();
        var files = await admin.GetJsonAsync(Files);
        Assert.Contains("User-agent: *", files.GetProperty("robots").GetProperty("generated").GetString());

        // Preview: nothing is saved; invalid lines come back as errors, a whole-site Disallow as a warning.
        var preview = await admin.PostJsonAsync($"{Files}/robots/preview", new { extraRules = new[] { "Disallow: /drafts/", "Noindex: /x" } }, 200);
        Assert.True(preview.GetProperty("errors").TryGetProperty("extraRules[1]", out _));
        Assert.Contains("Disallow: /drafts/", preview.GetProperty("text").GetString());
        Assert.DoesNotContain("Disallow: /drafts/", await api.Anonymous().GetStringAsync("/robots.txt"));
        var closing = await admin.PostJsonAsync($"{Files}/robots/preview", new { extraRules = new[] { "Disallow: /" } }, 200);
        Assert.Equal("disallowAll", closing.GetProperty("warnings")[0].GetProperty("code").GetString());

        // Invalid input is a 400; closing the site needs the explicit confirmation.
        await admin.PutJsonAsync($"{Files}/robots", new { extraText = "User-agent: *\nDisallow: /x", concurrencyStamp = Stamp(files) }, 400);
        var unconfirmed = await admin.PutJsonAsync($"{Files}/robots", new { extraRules = new[] { "Disallow: /" }, concurrencyStamp = Stamp(files) }, 400);
        Assert.Equal("seo.confirm_disallow_all", unconfirmed.Code());

        var saved = await admin.PutJsonAsync($"{Files}/robots", new
        {
            extraRules = new[] { "Disallow: /drafts/" },
            extraText = "User-agent: ExampleBot\nDisallow: /",
            extraSitemaps = new[] { "https://cdn.example.test/sitemap.xml" },
            confirmDisallowAll = true,
            concurrencyStamp = Stamp(files),
        });
        try
        {
            var robots = await api.Anonymous().GetStringAsync("/robots.txt");
            Assert.Contains("Disallow: /drafts/\n", robots);
            Assert.Contains("User-agent: ExampleBot\nDisallow: /\n", robots);
            Assert.Contains("Sitemap: https://cdn.example.test/sitemap.xml\n", robots);
            Assert.True(await AuditedAsync("website.seo_robots_updated"));
            // The crawler settings share the document: their stamp moved on with this save.
            await admin.PutJsonAsync("/api/v1/agency/website/seo/settings",
                new { crawlerGroups = new Dictionary<string, bool>(), indexNowEnabled = false, llmsTxtEnabled = true, concurrencyStamp = Stamp(files) }, 409);
            // Stale stamp on the files themselves too.
            await admin.PutJsonAsync($"{Files}/robots", new { concurrencyStamp = Stamp(files) }, 409);
        }
        finally
        {
            await admin.PutJsonAsync($"{Files}/robots", new { concurrencyStamp = Stamp(saved) });
        }
        Assert.DoesNotContain("ExampleBot", await api.Anonymous().GetStringAsync("/robots.txt"));
    }

    [Fact]
    public async Task Blocking_search_engines_needs_a_confirmation()
    {
        var admin = await api.AdminAsync();
        var settings = await admin.GetJsonAsync("/api/v1/agency/website/seo/settings");
        var refused = await admin.PutJsonAsync("/api/v1/agency/website/seo/settings", new
        {
            crawlerGroups = new Dictionary<string, bool> { ["search"] = false }, indexNowEnabled = false, llmsTxtEnabled = true,
            concurrencyStamp = settings.GetProperty("concurrencyStamp").GetGuid(),
        }, 400);
        Assert.Equal("seo.confirm_block_search", refused.Code());
        var preview = await admin.PostJsonAsync($"{Files}/robots/preview", new { crawlerGroups = new Dictionary<string, bool> { ["search"] = false } }, 200);
        Assert.Equal("searchBlocked", preview.GetProperty("warnings")[0].GetProperty("code").GetString());
        Assert.Contains("# Search engines — blocked", preview.GetProperty("text").GetString());
    }

    [Fact]
    public async Task Sitemap_groups_addresses_and_page_flags_shape_the_served_sitemaps()
    {
        var admin = await api.AdminAsync();
        var files = await admin.GetJsonAsync(Files);
        var groups = files.GetProperty("sitemap").GetProperty("groups").EnumerateArray().ToList();
        var services = groups.Single(g => g.GetProperty("name").GetString() == "services");
        Assert.True(services.GetProperty("urlCount").GetInt32() > 1);
        Assert.Equal("http://app.test/sitemaps/services.xml", services.GetProperty("files")[0].GetProperty("url").GetString());

        // A service's own "hide from sitemap" flag: left out of the sitemap and llms.txt, reported as hidden by the page.
        await api.WithDbAsync(async db =>
        {
            var s = await db.Set<AgencyService>().SingleAsync(x => x.Slug == "seo");
            s.Seo.HideFromSitemap = true;
            return await db.SaveChangesAsync();
        });
        try
        {
            Assert.DoesNotContain("http://app.test/services/seo", await SitemapLocsAsync("/sitemaps/services.xml"));
            Assert.DoesNotContain("/services/seo.md", await api.Anonymous().GetStringAsync("/llms.txt"));
            var hidden = await admin.GetJsonAsync($"{Files}/sitemap/urls?state=hidden&q=/services/seo");
            Assert.Equal("page", hidden.GetProperty("rows").EnumerateArray().Single(r => r.GetProperty("path").GetString() == "/services/seo").GetProperty("hiddenBy").GetString());
            // The page itself stays indexable.
            Assert.Contains("name=\"robots\" content=\"index, follow", await api.Anonymous().GetStringAsync("/_document/services/seo"));
        }
        finally
        {
            await api.WithDbAsync(async db =>
            {
                var s = await db.Set<AgencyService>().SingleAsync(x => x.Slug == "seo");
                s.Seo.HideFromSitemap = false;
                return await db.SaveChangesAsync();
            });
        }

        // Exclude one address from the table, leave a whole group out, add an address and set hints for a group.
        var toggled = await admin.PostJsonAsync($"{Files}/sitemap/urls", new { path = "/about", excluded = true, concurrencyStamp = Stamp(files) }, 200);
        Assert.Contains("/about", toggled.GetProperty("sitemap").GetProperty("excludedPaths").EnumerateArray().Select(p => p.GetString()));
        Assert.DoesNotContain("http://app.test/about", await SitemapLocsAsync("/sitemaps/pages.xml"));

        await admin.PutJsonAsync($"{Files}/sitemap", new { extraPaths = new[] { "/admin/x" }, concurrencyStamp = Stamp(toggled) }, 400);
        var saved = await admin.PutJsonAsync($"{Files}/sitemap", new
        {
            excludedGroups = new[] { "careers" },
            excludedPaths = new[] { "/about" },
            extraPaths = new[] { "/webinar-2026" },
            groupDefaults = new Dictionary<string, object> { ["services"] = new { changeFrequency = "monthly", priority = 0.8 } },
            concurrencyStamp = Stamp(toggled),
        });
        try
        {
            var index = await SitemapLocsAsync("/sitemap.xml");
            Assert.DoesNotContain(index, l => l.Contains("/sitemaps/careers", StringComparison.Ordinal));
            Assert.Equal(HttpStatusCode.NotFound, (await api.Anonymous().GetAsync("/sitemaps/careers.xml")).StatusCode);
            Assert.Contains("http://app.test/webinar-2026", await SitemapLocsAsync("/sitemaps/pages.xml"));
            var servicesXml = XDocument.Parse(await api.Anonymous().GetStringAsync("/sitemaps/services.xml"));
            Assert.All(servicesXml.Descendants(Ns + "url"), u => Assert.Equal("monthly", u.Element(Ns + "changefreq")!.Value));
            Assert.All(servicesXml.Descendants(Ns + "url"), u => Assert.Equal("0.8", u.Element(Ns + "priority")!.Value));
            Assert.DoesNotContain("http://app.test/about", await SitemapLocsAsync("/api/v1/public/sitemap.xml"));
            var report = saved.GetProperty("sitemap");
            Assert.True(report.GetProperty("groups").EnumerateArray().Single(g => g.GetProperty("name").GetString() == "careers").GetProperty("excluded").GetBoolean());
            Assert.True(await AuditedAsync("website.seo_sitemap_updated"));
        }
        finally
        {
            await admin.PutJsonAsync($"{Files}/sitemap", new { concurrencyStamp = Stamp(saved) });
        }
        Assert.Contains("http://app.test/about", await SitemapLocsAsync("/sitemaps/pages.xml"));
    }

    [Fact]
    public async Task Course_flags_hide_courses_from_the_sitemap_or_from_search()
    {
        var admin = await api.AdminAsync();
        var slug = await api.WithDbAsync(db => db.Set<Course>().Where(c => c.Status == CourseStatus.Published).Select(c => c.Slug).FirstOrDefaultAsync());
        Assert.NotNull(slug); // The baseline seed publishes the academy courses.
        var path = $"http://app.test/learn/{slug}";
        Assert.Contains(path, await SitemapLocsAsync("/sitemaps/learn.xml"));

        await api.WithDbAsync(async db =>
        {
            var c = await db.Set<Course>().SingleAsync(x => x.Slug == slug);
            c.HideFromSitemap = true;
            return await db.SaveChangesAsync();
        });
        Assert.DoesNotContain(await SitemapLocsAsync("/sitemaps/learn.xml"), l => l.StartsWith(path, StringComparison.Ordinal));
        Assert.Contains("name=\"robots\" content=\"index, follow", await api.Anonymous().GetStringAsync($"/_document/learn/{slug}"));

        await api.WithDbAsync(async db =>
        {
            var c = await db.Set<Course>().SingleAsync(x => x.Slug == slug);
            c.HideFromSitemap = false;
            c.NoIndex = true;
            return await db.SaveChangesAsync();
        });
        try
        {
            Assert.DoesNotContain(await SitemapLocsAsync("/sitemaps/learn.xml"), l => l.StartsWith(path, StringComparison.Ordinal));
            Assert.Contains("name=\"robots\" content=\"noindex", await api.Anonymous().GetStringAsync($"/_document/learn/{slug}"));
        }
        finally
        {
            await api.WithDbAsync(async db =>
            {
                var c = await db.Set<Course>().SingleAsync(x => x.Slug == slug);
                c.NoIndex = false;
                return await db.SaveChangesAsync();
            });
        }
    }

    [Fact]
    public async Task Llms_txt_intro_sections_and_academy_guide_are_editable()
    {
        var admin = await api.AdminAsync();
        var files = await admin.GetJsonAsync(Files);
        var llms = files.GetProperty("llms");
        Assert.False(string.IsNullOrWhiteSpace(llms.GetProperty("defaultIntro").GetString()));
        Assert.Contains(llms.GetProperty("sections").EnumerateArray(), s => s.GetProperty("key").GetString() == "services");

        await admin.PutJsonAsync($"{Files}/llms", new { excludedSections = new[] { "nope" }, concurrencyStamp = Stamp(files) }, 400);
        var saved = await admin.PutJsonAsync($"{Files}/llms", new
        {
            summary = "Optimize All, the accountable marketing agency.",
            intro = "We plan, run and report marketing as one team.",
            excludedSections = new[] { "services" },
            customSections = new[] { new { title = "Pricing notes", body = "Prices exclude VAT; ad spend is billed at cost." } },
            academyGuideEnabled = false,
            concurrencyStamp = Stamp(files),
        });
        try
        {
            var text = await api.Anonymous().GetStringAsync("/llms.txt");
            Assert.StartsWith("# Optimize All\n\n> Optimize All, the accountable marketing agency.\n\nWe plan, run and report marketing as one team.\n\n", text);
            Assert.DoesNotContain("## Services\n", text);
            Assert.Contains("## Pricing notes\n\nPrices exclude VAT; ad spend is billed at cost.\n", text);
            Assert.DoesNotContain("/llms/academy.txt", text);
            Assert.Equal(HttpStatusCode.NotFound, (await api.Anonymous().GetAsync("/llms/academy.txt")).StatusCode);
            Assert.Equal(text, await admin.GetStringAsync($"{Files}/llms/preview"));
            Assert.True(await AuditedAsync("website.seo_llms_updated"));
        }
        finally
        {
            await admin.PutJsonAsync($"{Files}/llms", new { concurrencyStamp = Stamp(saved) });
        }
        var restored = await api.Anonymous().GetStringAsync("/llms.txt");
        Assert.Contains("## Services\n", restored);
        Assert.Equal(HttpStatusCode.OK, (await api.Anonymous().GetAsync("/llms/academy.txt")).StatusCode);
    }

    [Fact]
    public async Task Only_site_managers_reach_the_seo_files()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.Anonymous().GetAsync(Files)).StatusCode);
        var (_, staff) = await api.CreateClientAsync(OptimizeAll.Domain.Identity.Role.Participant);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync(Files)).StatusCode);
    }
}
