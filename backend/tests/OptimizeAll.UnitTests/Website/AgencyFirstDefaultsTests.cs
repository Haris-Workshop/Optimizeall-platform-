using OptimizeAll.Api.Modules.Website.Public;
using OptimizeAll.Api.Modules.Website.Seed;
using OptimizeAll.Api.Modules.Website.Redirects;
using OptimizeAll.Api.Modules.Website.Settings;
using OptimizeAll.Api.Modules.Website.SiteSeo;
using OptimizeAll.Domain.Website;
using Xunit;

namespace OptimizeAll.UnitTests.Website;

/// <summary>
/// The agency-first positioning: the defaults lead with the agency (Academy and Creators are separate, labelled products), and
/// stored settings are upgraded only where they still equal an earlier built-in generation (agency-only or academy-first
/// two-pillar) — an administrator's own edits are never replaced.
/// </summary>
public class AgencyFirstDefaultsTests
{
    private static readonly SiteSettings D = SiteSettingsService.Defaults;

    private static SiteSettings AcademyFirst() => D with
    {
        Header = new HeaderSettings(SiteSettingsService.AcademyFirstDefaults.Menu, SiteSettingsService.AcademyFirstDefaults.Cta),
        Footer = D.Footer with { Blurb = SiteSettingsService.AcademyFirstDefaults.Blurb, Columns = SiteSettingsService.AcademyFirstDefaults.Columns },
        Seo = D.Seo with { DefaultTitle = SiteSettingsService.AcademyFirstDefaults.SeoTitle, DefaultDescription = SiteSettingsService.AcademyFirstDefaults.SeoDescription },
    };

    private static SiteSettings AgencyOnly() => D with
    {
        Header = new HeaderSettings(SiteSettingsService.PreviousDefaults.Menu, SiteSettingsService.PreviousDefaults.Cta),
        Footer = D.Footer with { Blurb = SiteSettingsService.PreviousDefaults.Blurb, Columns = SiteSettingsService.PreviousDefaults.Columns },
        Seo = D.Seo with { DefaultTitle = SiteSettingsService.PreviousDefaults.SeoTitle, DefaultDescription = SiteSettingsService.PreviousDefaults.SeoDescription },
    };

    [Fact]
    public void Defaults_lead_with_the_agency_and_keep_the_academy_a_quiet_secondary_link()
    {
        Assert.Equal(new[] { "Services", "Industries", "Case studies", "Insights", "Partners", "About" }, D.Header.Menu.Select(m => m.Label));
        Assert.Equal(new[] { "/services", "/industries", "/case-studies", "/blog", "/partners", "/about" }, D.Header.Menu.Select(m => m.Url));
        Assert.Equal(new[] { "About us", "How we work", "Team", "Careers", "Contact" }, D.Header.Menu[^1].Children!.Select(c => c.Label));
        Assert.Equal(new SiteLink("Book a consultation", "/book-a-consultation"), D.Header.Cta);
        Assert.Equal(new SiteLink("Free Academy", "/learn"), D.Header.SecondaryLink);
        Assert.DoesNotContain(D.Header.Menu, m => m.Url is "/learn" or "/academy" or "/creators");
    }

    [Fact]
    public void Footer_groups_put_the_agency_first_and_label_the_other_products_and_sign_in()
    {
        var titles = D.Footer.Columns.Select(c => c.Title).ToList();
        Assert.Equal("Services", titles[0]);
        Assert.True(titles.IndexOf("Company") < titles.IndexOf("More from Optimize All"));
        var more = D.Footer.Columns.Single(c => c.Title == "More from Optimize All");
        Assert.Contains(more.Links, l => l.Url == "/learn");
        Assert.Contains(more.Links, l => l.Url == "/creators");
        var signIn = D.Footer.Columns.Single(c => c.Title == "Sign in");
        Assert.Contains(signIn.Links, l => l.Url == "/login");
        Assert.DoesNotContain(D.Footer.Columns.Take(3).SelectMany(c => c.Links), l => l.Url.StartsWith("/learn", StringComparison.Ordinal) || l.Url == "/academy");
        Assert.InRange(D.Footer.Columns.Count, 1, 6);
        Assert.All(D.Footer.Columns, c => Assert.InRange(c.Links.Count, 1, 15));
    }

    [Fact]
    public void Default_title_and_description_describe_the_agency_without_invented_figures()
    {
        Assert.InRange(D.Seo.DefaultTitle.Length, 30, 60);
        Assert.InRange(D.Seo.DefaultDescription!.Length, 70, 155);
        Assert.Contains("agency", D.Seo.DefaultDescription, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("SEO", D.Seo.DefaultTitle);
        Assert.DoesNotMatch(@"\d", D.Seo.DefaultTitle + D.Seo.DefaultDescription + D.Footer.Blurb);
    }

    [Theory]
    [InlineData("academy-first")]
    [InlineData("agency-only")]
    public void Untouched_earlier_defaults_are_upgraded_to_the_agency_first_defaults(string generation)
    {
        var upgraded = SiteSettingsService.UpgradeFromPreviousDefaults(generation == "agency-only" ? AgencyOnly() : AcademyFirst());
        Assert.NotNull(upgraded);
        Assert.Equal(D.Header, upgraded!.Header);
        Assert.Equal(D.Footer.Blurb, upgraded.Footer.Blurb);
        Assert.Equal(D.Footer.Columns.Select(c => c.Title), upgraded.Footer.Columns.Select(c => c.Title));
        Assert.Equal(D.Seo.DefaultTitle, upgraded.Seo.DefaultTitle);
        Assert.Equal(D.Seo.DefaultDescription, upgraded.Seo.DefaultDescription);
    }

    [Fact]
    public void A_menu_saved_in_the_admin_without_changes_still_counts_as_untouched()
    {
        // Saving turns "no sub-items" (null) into an empty list.
        var saved = AcademyFirst() with
        {
            Header = new HeaderSettings(
                SiteSettingsService.AcademyFirstDefaults.Menu.Select(m => m with { Children = m.Children ?? Array.Empty<MenuItem>() }).ToList(),
                SiteSettingsService.AcademyFirstDefaults.Cta),
        };
        Assert.Equal("Services", SiteSettingsService.UpgradeFromPreviousDefaults(saved)!.Header.Menu[0].Label);
    }

    [Fact]
    public void Stored_first_two_pillar_defaults_with_academy_paths_anchors_are_upgraded_too()
    {
        static IReadOnlyList<MenuItem> Old(IEnumerable<MenuItem> items) => items.Select(m => m with
        {
            Url = m.Url == "/learn/paths" ? "/academy#paths" : m.Url,
            Children = m.Children is null ? null : Old(m.Children),
        }).ToList();
        var a = AcademyFirst();
        var stored = a with
        {
            Header = new HeaderSettings(Old(a.Header.Menu), a.Header.Cta),
            Footer = a.Footer with
            {
                Columns = a.Footer.Columns.Select(c => c with { Links = c.Links.Select(l => l.Url == "/learn/paths" ? l with { Url = "/academy#paths" } : l).ToList() }).ToList(),
            },
        };
        var upgraded = SiteSettingsService.UpgradeFromPreviousDefaults(stored)!;
        Assert.Equal(D.Header, upgraded.Header);
        Assert.Equal("Services", upgraded.Footer.Columns[0].Title);
    }

    [Fact]
    public void Administrator_edits_are_kept_and_current_settings_are_left_alone()
    {
        var edited = AcademyFirst() with
        {
            Header = new HeaderSettings(new[] { new MenuItem("Shop", "/shop", null, null) }, new SiteLink("Buy", "/shop")),
            Footer = AcademyFirst().Footer with { Blurb = "Our own words." },
            Seo = AcademyFirst().Seo with { DefaultTitle = "Our own title" },
        };
        var upgraded = SiteSettingsService.UpgradeFromPreviousDefaults(edited)!;
        Assert.Equal("Shop", Assert.Single(upgraded.Header.Menu).Label);
        Assert.Equal("Buy", upgraded.Header.Cta!.Label);
        Assert.Null(upgraded.Header.SecondaryLink);
        Assert.Equal("Our own words.", upgraded.Footer.Blurb);
        Assert.Equal("Our own title", upgraded.Seo.DefaultTitle);
        Assert.Equal(AcademyFirst().Seo.DefaultDescription, upgraded.Seo.DefaultDescription); // title and description move together or not at all
        Assert.Equal("Services", upgraded.Footer.Columns[0].Title); // the untouched columns still move to the new defaults

        // A single edited link in an otherwise untouched menu keeps the whole menu as the admin left it.
        var tweaked = AcademyFirst() with
        {
            Header = new HeaderSettings(SiteSettingsService.AcademyFirstDefaults.Menu.Select(m => m.Label == "Pricing" ? m with { Label = "Plans" } : m).ToList(),
                SiteSettingsService.AcademyFirstDefaults.Cta),
        };
        Assert.Contains(SiteSettingsService.UpgradeFromPreviousDefaults(tweaked)!.Header.Menu, m => m.Label == "Plans");

        Assert.Null(SiteSettingsService.UpgradeFromPreviousDefaults(D));
        Assert.Null(SiteSettingsService.UpgradeFromPreviousDefaults(D with { Header = new HeaderSettings(edited.Header.Menu, edited.Header.Cta) }));
    }

    [Fact]
    public void A_stored_document_without_the_secondary_link_reads_the_default_link()
    {
        // The web app always showed "Free Academy" when the link was missing; the settings now say so explicitly.
        var json = System.Text.Json.JsonSerializer.Serialize(D, SiteSettingsService.Json).Replace(",\"secondaryLink\":{\"label\":\"Free Academy\",\"url\":\"/learn\"}", string.Empty);
        Assert.DoesNotContain("secondaryLink", json);
        Assert.Equal(SiteSettingsService.DefaultSecondaryLink, SiteSettingsService.Parse(json).Header.SecondaryLink);
        Assert.Equal(D.Header.Cta, SiteSettingsService.Parse(json).Header.Cta);
    }

    // ---------------------------------------------------------------- JSON-LD scoping

    private static JsonLd Ld(OrganizationSchema? org = null) => new("https://www.optimizeall.test", D with { Organization = org ?? D.Organization });

    [Fact]
    public void Professional_service_is_valid_without_an_address_and_adds_it_when_configured()
    {
        var plain = Ld().ProfessionalService();
        Assert.Equal("ProfessionalService", plain.GetProperty("@type").GetString());
        Assert.False(plain.TryGetProperty("address", out _));
        Assert.Equal("https://www.optimizeall.test/#organization", plain.GetProperty("parentOrganization").GetProperty("@id").GetString());
        Assert.Null(Ld().LocalBusiness());

        var withAddress = Ld(D.Organization with { StreetAddress = "1 Main St", Locality = "Austin", CountryCode = "US" });
        var node = withAddress.ProfessionalService();
        Assert.Equal("Austin", node.GetProperty("address").GetProperty("addressLocality").GetString());
        Assert.NotNull(withAddress.LocalBusiness());
    }

    [Fact]
    public void The_academy_node_is_an_educational_organization_with_the_organization_as_parent_at_learn()
    {
        var academy = Ld().Academy();
        Assert.Equal("EducationalOrganization", academy.GetProperty("@type").GetString());
        Assert.Equal("https://www.optimizeall.test/learn", academy.GetProperty("url").GetString());
        Assert.Equal("Optimize All Academy", academy.GetProperty("name").GetString());
        Assert.Equal("https://www.optimizeall.test/#organization", academy.GetProperty("parentOrganization").GetProperty("@id").GetString());
    }

    // ---------------------------------------------------------------- titles and redirects

    [Theory]
    [InlineData("/", "%s | Optimize All")]
    [InlineData("/services", "%s | Optimize All")]
    [InlineData("/blog/post", "%s | Optimize All")]
    [InlineData("/learn", "%s | Optimize All Academy")]
    [InlineData("/learn/paths/ai-engineer", "%s | Optimize All Academy")]
    [InlineData("/learn/course/lesson", "%s | Optimize All Academy")]
    [InlineData("/verify/certificates/abc", "%s | Optimize All Academy")]
    [InlineData("/creators", "%s | Optimize All Creators")]
    [InlineData("/creators/faq", "%s | Optimize All Creators")]
    [InlineData("/learning", "%s | Optimize All")]
    [InlineData("/creators-guide", "%s | Optimize All")]
    public void Section_title_templates_follow_the_path(string path, string expected) =>
        Assert.Equal(expected, SeoText.TemplateFor(path, "%s | Optimize All", "Optimize All"));

    [Fact]
    public void Section_templates_apply_to_titles_and_keep_a_custom_template_workable()
    {
        Assert.Equal("Prompting basics | Optimize All Academy",
            SeoText.ApplyTemplate("Prompting basics", SeoText.TemplateFor("/learn/prompting", "%s | Optimize All", "Optimize All"), "Optimize All"));
        Assert.Equal("Payouts | Optimize All Creators",
            SeoText.ApplyTemplate("Payouts", SeoText.TemplateFor("/creators/faq", "%s | Optimize All", "Optimize All"), "Optimize All"));
        // A template that does not end with the site name is replaced by the standard section form.
        Assert.Equal("%s | Optimize All Academy", SeoText.TemplateFor("/learn", "%s – OA Home", "Optimize All"));
    }

    [Fact]
    public void Academy_and_faq_are_built_in_permanent_moves_that_cannot_be_overridden()
    {
        Assert.Equal("/learn", RedirectPaths.BuiltInRedirects["/academy"]);
        Assert.Equal("/creators/faq", RedirectPaths.BuiltInRedirects["/faq"]);
        Assert.True(RedirectPaths.IsProtected("/academy"));
        Assert.True(RedirectPaths.IsProtected("/faq"));
        Assert.True(RedirectPaths.IsProtected("/creators/faq"));
        Assert.True(RedirectPaths.IsProtected("/learn"));
    }

    [Fact]
    public void The_seeded_about_page_is_agency_first_and_the_dead_academy_page_is_no_longer_seeded()
    {
        var about = Assert.Single(BaselinePages.Pages, p => p.Slug == "about");
        Assert.DoesNotContain("two pillars", about.Blocks.First().Data.GetRawText(), StringComparison.OrdinalIgnoreCase);
        Assert.NotEqual(BaselinePages.TwoPillarAbout.Summary, about.Summary);
        Assert.Contains("agency", about.Summary, StringComparison.OrdinalIgnoreCase);
        var text = string.Concat(about.Blocks.Select(b => b.Data.GetRawText()));
        Assert.Contains("/learn", text);
        Assert.Contains("/creators", text);
        var seo = BaselineSeo.ForPage("about", about.Summary);
        Assert.InRange((seo.Title + " | Optimize All").Length, 30, 60);
        Assert.InRange(seo.Description!.Length, 70, 155);
        Assert.DoesNotContain(BaselinePages.Pages, p => p.Slug == "academy"); // /academy is a permanent redirect to /learn
    }
}
