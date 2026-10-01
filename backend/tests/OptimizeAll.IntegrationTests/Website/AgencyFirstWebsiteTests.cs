using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Xml.Linq;
using AngleSharp.Html.Parser;
using OptimizeAll.IntegrationTests.Infrastructure;

namespace OptimizeAll.IntegrationTests.Website;

/// <summary>
/// The agency is the main frame; the free Academy (/learn) and Creators (/creators) are separate, labelled products:
/// permanent redirects of /academy and /faq, JSON-LD scoping (the Academy node only on /learn), section title templates,
/// filtered /learn views, the creators sitemap and the reserved CMS addresses.
/// </summary>
public sealed class AgencyFirstWebsiteTests(ApiFactory api) : IClassFixture<ApiFactory>
{
    private static readonly HtmlParser Parser = new();

    private async Task<(HttpStatusCode Status, string? Location, string Body)> DocumentAsync(string target)
    {
        var client = api.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var response = await client.GetAsync("/_document" + target);
        return (response.StatusCode, response.Headers.Location?.OriginalString, await response.Content.ReadAsStringAsync());
    }

    private static IEnumerable<string> Types(string html) => Parser.ParseDocument(html).QuerySelectorAll("script[type='application/ld+json']")
        .Select(s => JsonDocument.Parse(s.TextContent).RootElement)
        .SelectMany(n => n.GetProperty("@type").ValueKind == JsonValueKind.Array
            ? n.GetProperty("@type").EnumerateArray().Select(t => t.GetString()!) : new[] { n.GetProperty("@type").GetString()! }).ToList();

    [Theory]
    [InlineData("/academy", "/learn")]
    [InlineData("/faq", "/creators/faq")]
    [InlineData("/Academy/", "/learn")]
    [InlineData("/academy?utm_source=mail", "/learn?utm_source=mail")]
    [InlineData("/faq?utm_campaign=x&utm_medium=y", "/creators/faq?utm_campaign=x&utm_medium=y")]
    public async Task Academy_and_faq_are_permanently_redirected_server_side(string from, string to)
    {
        var (status, location, _) = await DocumentAsync(from);
        Assert.Equal(HttpStatusCode.MovedPermanently, status);
        Assert.Equal(to, location);
    }

    [Fact]
    public async Task The_public_lookup_and_the_redirect_manager_agree_on_the_built_in_moves()
    {
        var body = await (await api.Anonymous().GetAsync("/api/v1/public/redirects?path=/academy")).ReadJsonAsync();
        Assert.Equal(301, body.GetProperty("statusCode").GetInt32());
        Assert.Equal("/learn", body.GetProperty("location").GetString());

        // The sources are built in: staff cannot add a (shadowed) manual redirect for them.
        var admin = await api.AdminAsync();
        foreach (var from in new[] { "/academy", "/faq" })
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync("/api/v1/agency/website/redirects", new { fromPath = from, toPath = "/contact" })).StatusCode);
    }

    [Fact]
    public async Task Creators_faq_is_a_real_page_with_its_own_canonical_and_the_creators_title_template()
    {
        var (status, _, html) = await DocumentAsync("/creators/faq");
        Assert.Equal(HttpStatusCode.OK, status);
        var doc = Parser.ParseDocument(html);
        Assert.Equal("http://app.test/creators/faq", doc.QuerySelector("link[rel=canonical]")!.GetAttribute("href"));
        Assert.Contains("BreadcrumbList", Types(html));
        var creators = Parser.ParseDocument((await DocumentAsync("/creators")).Body);
        Assert.Contains("/creators/faq", creators.QuerySelectorAll("main a, #oa-ssr a").Select(a => a.GetAttribute("href")));
    }

    [Fact]
    public async Task Home_describes_the_agency_and_never_the_academy_in_json_ld()
    {
        var (status, _, html) = await DocumentAsync("/");
        Assert.Equal(HttpStatusCode.OK, status);
        var types = Types(html).ToList();
        Assert.Contains("Organization", types);
        Assert.Contains("WebSite", types);
        Assert.Contains("ProfessionalService", types);
        Assert.DoesNotContain("EducationalOrganization", types);
        // No address is configured in the default settings: the node is still there, and valid without one.
        var service = Parser.ParseDocument(html).QuerySelectorAll("script[type='application/ld+json']")
            .Select(s => JsonDocument.Parse(s.TextContent).RootElement).Single(n => n.GetProperty("@type").GetString() == "ProfessionalService");
        Assert.False(service.TryGetProperty("address", out _));
        Assert.Equal("http://app.test/#organization", service.GetProperty("parentOrganization").GetProperty("@id").GetString());

        var title = Parser.ParseDocument(html).Title!;
        Assert.Contains("Digital Marketing", title);
        Assert.DoesNotContain("Free AI", title);
    }

    [Fact]
    public async Task The_learn_hub_alone_carries_the_educational_organization_and_the_academy_title_template()
    {
        var (status, _, html) = await DocumentAsync("/learn");
        Assert.Equal(HttpStatusCode.OK, status);
        var nodes = Parser.ParseDocument(html).QuerySelectorAll("script[type='application/ld+json']").Select(s => JsonDocument.Parse(s.TextContent).RootElement).ToList();
        var academy = nodes.Single(n => n.GetProperty("@type").GetString() == "EducationalOrganization");
        Assert.Equal("Optimize All Academy", academy.GetProperty("name").GetString());
        Assert.Equal("http://app.test/learn", academy.GetProperty("url").GetString());
        Assert.Equal("http://app.test/#organization", academy.GetProperty("parentOrganization").GetProperty("@id").GetString());
        Assert.DoesNotContain("EducationalOrganization", Types((await DocumentAsync("/services")).Body));
        Assert.DoesNotContain("EducationalOrganization", Types((await DocumentAsync("/learn/paths")).Body));
    }

    [Fact]
    public async Task Filtered_learn_views_point_their_canonical_at_the_hub_and_are_noindex_follow()
    {
        var hub = Parser.ParseDocument((await DocumentAsync("/learn")).Body);
        Assert.StartsWith("index, follow", hub.QuerySelector("meta[name=robots]")!.GetAttribute("content"));

        foreach (var filtered in new[] { "/learn?category=Ai", "/learn?q=seo", "/learn?level=Beginner&category=Seo" })
        {
            var doc = Parser.ParseDocument((await DocumentAsync(filtered)).Body);
            Assert.Equal("http://app.test/learn", doc.QuerySelector("link[rel=canonical]")!.GetAttribute("href"));
            Assert.Equal("noindex, follow", doc.QuerySelector("meta[name=robots]")!.GetAttribute("content"));
        }
        // Tracking parameters are not filters: the hub stays indexable.
        var tracked = Parser.ParseDocument((await DocumentAsync("/learn?utm_source=mail")).Body);
        Assert.StartsWith("index, follow", tracked.QuerySelector("meta[name=robots]")!.GetAttribute("content"));
        // The sitemap lists the hub only, never a filtered view.
        var learn = await api.Anonymous().GetStringAsync("/sitemaps/learn.xml");
        Assert.DoesNotContain("/learn?", learn);
    }

    [Fact]
    public async Task Creators_pages_have_their_own_sitemap_and_the_academy_overview_is_gone_from_the_pages_sitemap()
    {
        var anon = api.Anonymous();
        var index = await anon.GetStringAsync("/sitemap.xml");
        Assert.Contains("/sitemaps/creators.xml", index);
        XNamespace ns = "http://www.sitemaps.org/schemas/sitemap/0.9";
        var creators = XDocument.Parse(await anon.GetStringAsync("/sitemaps/creators.xml")).Descendants(ns + "loc").Select(l => l.Value).ToList();
        Assert.Contains("http://app.test/creators", creators);
        Assert.Contains("http://app.test/creators/faq", creators);
        var pages = XDocument.Parse(await anon.GetStringAsync("/sitemaps/pages.xml")).Descendants(ns + "loc").Select(l => l.Value).ToList();
        Assert.DoesNotContain("http://app.test/academy", pages);
        Assert.DoesNotContain("http://app.test/creators", pages);
        Assert.DoesNotContain("http://app.test/faq", pages);
        Assert.Contains("http://app.test/services", pages);
    }

    [Theory]
    [InlineData("creators", false)]
    [InlineData("academy", false)]
    [InlineData("learn", false)]
    [InlineData("faq", false)]
    [InlineData("verify", false)]
    [InlineData("our-approach", true)]
    public async Task Reserved_addresses_cannot_become_cms_pages_but_free_ones_can(string slug, bool allowed)
    {
        var admin = await api.AdminAsync();
        var unique = allowed ? slug + "-" + Guid.NewGuid().ToString("N")[..6] : slug;
        var response = await admin.PostAsJsonAsync("/api/v1/agency/website/pages", new
        {
            slug = unique, title = "Page " + unique, summary = "Summary", kind = "Standard", sortOrder = 0, isPublished = false,
            blocks = new[] { new { type = "richText", data = new { markdown = "Body" } } },
        });
        Assert.Equal(allowed ? HttpStatusCode.Created : HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task The_public_site_payload_carries_the_agency_first_header_with_its_secondary_academy_link()
    {
        var site = await api.Anonymous().GetJsonAsync("/api/v1/public/site");
        var header = site.GetProperty("header");
        Assert.Equal("Book a consultation", header.GetProperty("cta").GetProperty("label").GetString());
        Assert.Equal("/book-a-consultation", header.GetProperty("cta").GetProperty("url").GetString());
        Assert.Equal("/learn", header.GetProperty("secondaryLink").GetProperty("url").GetString());
        Assert.Equal("Services", header.GetProperty("menu")[0].GetProperty("label").GetString());

        // The secondary link is validated like every other link.
        var admin = await api.AdminAsync();
        var current = await admin.GetJsonAsync("/api/v1/agency/website/settings");
        var settings = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(current.GetProperty("settings").GetRawText())!;
        var bad = new Dictionary<string, object?>(settings.ToDictionary(kv => kv.Key, kv => (object?)kv.Value))
        {
            ["header"] = new { menu = settings["header"].GetProperty("menu"), cta = settings["header"].GetProperty("cta"), secondaryLink = new { label = "Learn", url = "javascript:alert(1)" } },
        };
        var problem = await admin.PutJsonAsync("/api/v1/agency/website/settings",
            new { settings = bad, concurrencyStamp = current.GetProperty("concurrencyStamp").GetGuid() }, 400);
        Assert.True(problem.GetProperty("errors").TryGetProperty("header.secondaryLink.url", out _));
    }

    [Fact]
    public async Task The_verify_index_is_a_server_rendered_academy_page_listed_in_the_learn_sitemap()
    {
        var (status, _, html) = await DocumentAsync("/verify");
        Assert.Equal(HttpStatusCode.OK, status);
        var doc = Parser.ParseDocument(html);
        Assert.Equal("Verify a certificate | Optimize All Academy", doc.Title);
        Assert.Equal("http://app.test/verify", doc.QuerySelector("link[rel=canonical]")!.GetAttribute("href"));
        Assert.StartsWith("index, follow", doc.QuerySelector("meta[name=robots]")!.GetAttribute("content"));
        Assert.Single(doc.QuerySelectorAll("h1"));
        Assert.Contains("BreadcrumbList", Types(html));
        Assert.Contains("<loc>http://app.test/verify</loc>", await api.Anonymous().GetStringAsync("/sitemaps/learn.xml"));
        // A certificate's own page is untouched by the new index.
        Assert.Equal(HttpStatusCode.NotFound, (await DocumentAsync("/verify/certificates/not-a-real-id")).Status);
    }

    [Theory]
    [InlineData("/services", "Optimize All")]
    [InlineData("/verify", "Optimize All Academy")]
    [InlineData("/join/abc123", "Optimize All Creators")]
    public async Task Titles_carry_the_suffix_of_their_section(string path, string suffix)
    {
        var (status, _, html) = await DocumentAsync(path);
        var title = Parser.ParseDocument(html).Title!;
        Assert.True(status is HttpStatusCode.OK, $"{path}: {status}");
        Assert.EndsWith(" | " + suffix, title);
    }
}
