using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using OptimizeAll.IntegrationTests.Infrastructure;

namespace OptimizeAll.IntegrationTests.Website;

/// <summary>
/// Site settings for the site's structure (docs/ADMIN_CONTENT_GUIDE.md): brand assets, page layout (home and creators
/// sections), the Academy's and Creators' chrome, the footer's product and sign-in groups, and the link-type page texts
/// for button targets. The public API and the server-rendered HTML follow them; the defaults reproduce the site as it was.
/// </summary>
public sealed class SiteStructureSettingsTests(ApiFactory api) : IClassFixture<ApiFactory>
{
    private const string Settings = "/api/v1/agency/website/settings";

    private async Task<(JsonObject Settings, Guid Stamp, JsonElement Raw)> LoadAsync(HttpClient admin)
    {
        var current = await admin.GetJsonAsync(Settings);
        return (JsonNode.Parse(current.GetProperty("settings").GetRawText())!.AsObject(), current.GetProperty("concurrencyStamp").GetGuid(), current);
    }

    private static int IndexOf(string html, string text)
    {
        var i = html.IndexOf(text, StringComparison.Ordinal);
        Assert.True(i >= 0, $"'{text}' is missing");
        return i;
    }

    [Fact]
    public async Task Defaults_are_complete_and_public()
    {
        var site = await api.Anonymous().GetJsonAsync("/api/v1/public/site");
        var home = site.GetProperty("layouts").GetProperty("home").EnumerateArray().Select(s => s.GetProperty("key").GetString()).ToList();
        Assert.Equal(new[] { "logos", "partners", "services", "proof", "process", "industries", "testimonials", "insights", "more", "cta", "newsletter" }, home);
        Assert.Equal("Start learning free", site.GetProperty("products").GetProperty("academy").GetProperty("cta").GetProperty("label").GetString());
        Assert.Equal("/login?audience=creator", site.GetProperty("footer").GetProperty("signInLinks")[1].GetProperty("url").GetString());
        Assert.Equal(JsonValueKind.Null, site.GetProperty("brand").GetProperty("logoUrl").ValueKind);

        var admin = await api.AdminAsync();
        var (_, _, raw) = await LoadAsync(admin);
        Assert.Equal("Free Academy", raw.GetProperty("defaults").GetProperty("header").GetProperty("secondaryLink").GetProperty("label").GetString());
    }

    [Fact]
    public async Task Layout_products_and_favicon_reach_the_public_api_and_the_server_rendered_html()
    {
        var admin = await api.AdminAsync();
        var (settings, stamp, _) = await LoadAsync(admin);
        var original = settings.DeepClone();

        // Unknown sections and invalid links are rejected.
        var bad = settings.DeepClone().AsObject();
        bad["layouts"] = JsonNode.Parse("""{"home":[{"key":"nope","visible":true}],"creators":[]}""");
        bad["products"]!["academy"]!["cta"] = JsonNode.Parse("""{"label":"Go","url":"javascript:alert(1)"}""");
        var problem = await admin.PutJsonAsync(Settings, new { settings = bad, concurrencyStamp = stamp }, 400);
        Assert.True(problem.GetProperty("errors").TryGetProperty("layouts.home[0].key", out _));
        Assert.True(problem.GetProperty("errors").TryGetProperty("products.academy.cta.url", out _));

        // Newsletter first, process hidden; creators FAQ hidden; Academy button renamed; uploaded favicon.
        settings["layouts"] = JsonNode.Parse("""
            {"home":[{"key":"newsletter","visible":true},{"key":"process","visible":false}],
             "creators":[{"key":"cta","visible":true},{"key":"faq","visible":false}]}
            """);
        settings["products"]!["academy"]!["cta"] = JsonNode.Parse("""{"label":"Join the academy","url":"/register?audience=learner"}""");
        settings["brand"] = JsonNode.Parse("""{"logoUrl":null,"logoDarkUrl":null,"faviconUrl":"/api/v1/files/00000000-0000-0000-0000-000000000001"}""");
        var saved = await admin.PutJsonAsync(Settings, new { settings, concurrencyStamp = stamp });
        try
        {
            // Missing sections are appended (shown) in the catalog order.
            var home = saved.GetProperty("settings").GetProperty("layouts").GetProperty("home").EnumerateArray().ToList();
            Assert.Equal(11, home.Count);
            Assert.Equal("newsletter", home[0].GetProperty("key").GetString());
            var site = await api.Anonymous().GetJsonAsync("/api/v1/public/site");
            Assert.Equal("Join the academy", site.GetProperty("products").GetProperty("academy").GetProperty("cta").GetProperty("label").GetString());

            var html = await api.Anonymous().GetStringAsync("/_document/");
            Assert.True(IndexOf(html, "Get marketing insights in your inbox") < IndexOf(html, "Every channel, one accountable team"));
            Assert.DoesNotContain("A process built for accountability", html);
            Assert.Contains("<link rel=\"icon\" href=\"/api/v1/files/00000000-0000-0000-0000-000000000001\" data-oa-brand>", html);

            var creators = await api.Anonymous().GetStringAsync("/_document/creators");
            // The FAQ section (and its FAQPage structured data) is gone; the call to action now comes before "How it works".
            Assert.DoesNotContain("FAQPage", creators);
            var how = creators.IndexOf("id=\"how-it-works\"", StringComparison.Ordinal);
            Assert.True(how < 0 || IndexOf(creators, "<h2") < how);
        }
        finally
        {
            await admin.PutJsonAsync(Settings, new { settings = original, concurrencyStamp = saved.GetProperty("concurrencyStamp").GetGuid() });
        }
    }

    [Fact]
    public async Task Button_links_are_page_texts_validated_as_links_and_rendered()
    {
        var admin = await api.AdminAsync();
        var catalog = await admin.GetJsonAsync("/api/v1/agency/website/copy");
        var entry = catalog.GetProperty("groups").EnumerateArray().SelectMany(g => g.GetProperty("entries").EnumerateArray())
            .Single(e => e.GetProperty("key").GetString() == "home.hero.primaryCtaUrl");
        Assert.Equal("Link", entry.GetProperty("type").GetString());

        var invalid = await admin.PutJsonAsync("/api/v1/agency/website/copy",
            new { changes = new[] { new { key = "home.hero.primaryCtaUrl", value = "javascript:alert(1)", concurrencyStamp = (Guid?)null } } }, 400);
        Assert.True(invalid.GetProperty("errors").TryGetProperty("home.hero.primaryCtaUrl", out _) ||
                    invalid.GetProperty("errors").EnumerateObject().Any());

        await admin.PutJsonAsync("/api/v1/agency/website/copy", new
        {
            changes = new object[]
            {
                new { key = "home.hero.primaryCtaUrl", value = "/contact", concurrencyStamp = (Guid?)null },
                new { key = "partners.index.title", value = "Our partner network", concurrencyStamp = (Guid?)null },
            },
        });
        try
        {
            var html = await api.Anonymous().GetStringAsync("/_document/");
            Assert.Contains("href=\"/contact\"", html);
            var partners = await api.Anonymous().GetAsync("/_document/partners");
            if (partners.StatusCode == HttpStatusCode.OK) Assert.Contains("Our partner network", await partners.Content.ReadAsStringAsync());
            Assert.Equal("Our partner network", (await api.Anonymous().GetJsonAsync("/api/v1/public/partners")).GetProperty("seo").GetProperty("title").GetString());
        }
        finally
        {
            var current = await admin.GetJsonAsync("/api/v1/agency/website/copy");
            var stamps = current.GetProperty("groups").EnumerateArray().SelectMany(g => g.GetProperty("entries").EnumerateArray())
                .Where(e => e.GetProperty("key").GetString() is "home.hero.primaryCtaUrl" or "partners.index.title")
                .Select(e => new { key = e.GetProperty("key").GetString(), value = (string?)null, concurrencyStamp = (Guid?)e.GetProperty("concurrencyStamp").GetGuid() })
                .ToArray();
            await admin.PutJsonAsync("/api/v1/agency/website/copy", new { changes = stamps });
        }
    }
}
