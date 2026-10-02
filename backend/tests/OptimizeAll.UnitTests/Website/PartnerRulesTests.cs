using System.Text.RegularExpressions;
using OptimizeAll.Api.Modules.Website.Partners;
using OptimizeAll.Api.Modules.Website.SiteSeo.SocialCards;
using OptimizeAll.Domain.Website;

namespace OptimizeAll.UnitTests.Website;

/// <summary>Targeting of ad units, the partner-link rule (rel="sponsored"), offer visibility, page paths and the slot registry.</summary>
public sealed class PartnerRulesTests
{
    private static readonly DateOnly Day = new(2026, 9, 25);

    private static PartnerCandidate P(string slug, int order, string[] keywords, params string[] categories) =>
        new(Guid.NewGuid(), slug, order, keywords, categories);

    private static readonly PartnerCandidate Pci = P("pci-ai", 10, new[] { "PCL-AI", "earned value", "AI forecasting and risk", "project finance" }, "ai", "project-finance");
    private static readonly PartnerCandidate Certuvo = P("certuvo", 20, new[] { "CPA exam prep", "NCLEX-RN prep", "mock exams", "PCL-AI exam prep" }, "nursing", "accounting");

    [Fact]
    public void The_best_keyword_and_category_match_wins()
    {
        var both = new[] { Pci, Certuvo };
        Assert.Equal("pci-ai", PartnerTargeting.Choose(both, new[] { "Earned Value" }, null, "/blog/a", Day)!.Slug);
        Assert.Equal("certuvo", PartnerTargeting.Choose(both, new[] { "mock exams", "forecasting" }, new[] { "Nursing" }, "/blog/a", Day)!.Slug);
        // Categories weigh more than a single keyword.
        Assert.Equal("certuvo", PartnerTargeting.Choose(both, new[] { "project finance" }, new[] { "accounting" }, "/x", Day)!.Slug);
        // Whole words only: "value" matches "earned value", "valu" does not.
        Assert.Equal(1, PartnerTargeting.Score(Pci, PartnerTargeting.Normalize(new[] { "value" }), Array.Empty<string>()));
        Assert.Equal(0, PartnerTargeting.Score(Pci, PartnerTargeting.Normalize(new[] { "valu" }), Array.Empty<string>()));
        Assert.Equal("ai era certification", PartnerTargeting.NormalizeTerm("  AI-Era  Certification! "));
    }

    [Fact]
    public void Ties_and_no_matches_rotate_deterministically_by_page_and_day()
    {
        var both = new[] { Pci, Certuvo };
        var a = PartnerTargeting.Choose(both, new[] { "gardening" }, null, "/blog/roses", Day);
        Assert.Equal(a, PartnerTargeting.Choose(both, new[] { "gardening" }, null, "/blog/roses", Day));
        var chosen = Enumerable.Range(0, 40).Select(i => PartnerTargeting.Choose(both, null, null, $"/blog/post-{i}", Day)!.Slug).ToHashSet();
        Assert.Equal(new[] { "certuvo", "pci-ai" }, chosen.Order());
        // Both match "pcl ai" once: a tie, also rotated.
        var tie = Enumerable.Range(0, 40).Select(i => PartnerTargeting.Choose(both, new[] { "PCL-AI" }, null, $"/p/{i}", Day)!.Slug).ToHashSet();
        Assert.Equal(2, tie.Count);
        Assert.Null(PartnerTargeting.Choose(Array.Empty<PartnerCandidate>(), null, null, "/", Day));
        // Stable across processes (not string.GetHashCode).
        Assert.Equal(PartnerTargeting.Rotation("/blog/a", Day), PartnerTargeting.Rotation("/blog/a", Day));
        Assert.NotEqual(PartnerTargeting.Rotation("/blog/a", Day), PartnerTargeting.Rotation("/blog/a", Day.AddDays(1)));
    }

    [Fact]
    public void Hostile_term_lists_are_bounded()
    {
        var many = Enumerable.Range(0, 5000).Select(i => new string('x', 10_000) + i);
        Assert.True(PartnerTargeting.Normalize(many).Count <= PartnerTargeting.MaxTerms);
        Assert.NotNull(PartnerTargeting.Choose(new[] { Pci }, many, many, "/", Day));
    }

    private static readonly PartnerLinkRule[] Rules =
    {
        new("pci-ai", "pciai.org", "optimizeall", "partner", null),
        new("certuvo", "certuvo.com", "optimizeall", "partner", "spring"),
    };

    [Theory]
    [InlineData("https://pciai.org/certifications.html", "pci-ai")]
    [InlineData("https://www.pciai.org/", "pci-ai")]
    [InlineData("https://exams.certuvo.com/cpa", "certuvo")]
    [InlineData("HTTPS://CERTUVO.COM", "certuvo")]
    [InlineData("https://notcertuvo.com/", null)]
    [InlineData("https://certuvo.com.evil.example/", null)]
    [InlineData("/partners/certuvo", null)]
    [InlineData("mailto:hello@certuvo.com", null)]
    [InlineData("javascript:alert(1)", null)]
    [InlineData(null, null)]
    public void Links_to_a_partner_domain_or_its_subdomains_are_partner_links(string? href, string? partner) =>
        Assert.Equal(partner, PartnerLinkPolicy.Match(href, Rules)?.Slug);

    [Fact]
    public void Partner_links_get_rel_sponsored_a_new_tab_and_utm_tags_keeping_explicit_ones()
    {
        var link = PartnerLinkPolicy.Apply("https://pciai.org/certifications.html#pcl", Rules)!;
        Assert.Equal("sponsored noopener", link.Rel);
        Assert.Equal("_blank", link.Target);
        Assert.Equal("https://pciai.org/certifications.html?utm_source=optimizeall&utm_medium=partner&utm_campaign=editorial#pcl", link.Href);
        var tagged = PartnerLinkPolicy.Apply("https://certuvo.com/?utm_campaign=newsletter&x=1", Rules)!;
        Assert.Equal("https://certuvo.com/?utm_campaign=newsletter&x=1&utm_source=optimizeall&utm_medium=partner", tagged.Href);
        Assert.Equal("https://certuvo.com/?utm_source=optimizeall&utm_medium=partner&utm_campaign=spring",
            PartnerLinkPolicy.Apply("https://certuvo.com", Rules)!.Href);
        Assert.Null(PartnerLinkPolicy.Apply("https://example.com", Rules));
        Assert.Equal("pciai.org", PartnerLinkPolicy.HostOf("https://WWW.PCIAI.ORG/x"));
    }

    [Fact]
    public void Offers_need_a_confirmation_and_expire_at_their_date_or_30_days_after_the_last_edit()
    {
        var now = new DateTime(2026, 9, 25, 12, 0, 0, DateTimeKind.Utc);
        var p = new WebsitePartner { OfferText = "50% off", OfferUpdatedAt = now };
        Assert.False(PartnerOfferRules.IsVisible(p, now));
        p.OfferConfirmed = true;
        Assert.True(PartnerOfferRules.IsVisible(p, now.AddDays(29)));
        Assert.False(PartnerOfferRules.IsVisible(p, now.AddDays(30)));
        Assert.Equal(now.AddDays(30), PartnerOfferRules.VisibleUntil(p));
        p.OfferExpiresAt = now.AddDays(90);
        Assert.True(PartnerOfferRules.IsVisible(p, now.AddDays(89)));
        Assert.False(PartnerOfferRules.IsVisible(p, now.AddDays(90)));
        p.OfferText = " ";
        Assert.False(PartnerOfferRules.IsVisible(p, now));
        Assert.Null(PartnerOfferRules.VisibleUntil(p));
    }

    [Theory]
    [InlineData("/", "/")]
    [InlineData("/blog/SEO-Tips/?utm_source=x#top", "/blog/seo-tips")]
    [InlineData("/learn/ai/lesson-1/exam", "/learn/ai/lesson-1/exam")]
    [InlineData("/a/b/c/d/e", null)]
    [InlineData("//evil.example", null)]
    [InlineData("https://evil.example/", null)]
    [InlineData("/blog/<script>", null)]
    [InlineData("/blog/a--b", null)]
    [InlineData("", null)]
    public void Only_public_page_paths_are_counted(string raw, string? expected) =>
        Assert.Equal(expected, PartnerRules.NormalizePagePath(raw));

    [Fact]
    public void Bundled_logos_and_the_default_relationship_label()
    {
        Assert.True(PartnerRules.IsBundledLogo("/partners/pci-ai.png"));
        Assert.True(PartnerRules.IsBundledLogo("/partners/certuvo.jpg"));
        Assert.False(PartnerRules.IsBundledLogo("/partners/../secret.png"));
        Assert.False(PartnerRules.IsBundledLogo("/other/logo.png"));
        Assert.Equal("Optimize All is the official marketing partner of Certuvo",
            PartnerRules.Relationship(new WebsitePartner { Name = "Certuvo", RelationshipLabel = PartnerRules.DefaultRelationship }));
    }

    [Fact]
    public void The_web_app_knows_every_slot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "frontend", "src", "features", "public", "partners", "slots.ts"))) dir = dir.Parent;
        Assert.NotNull(dir);
        var source = File.ReadAllText(Path.Combine(dir!.FullName, "frontend", "src", "features", "public", "partners", "slots.ts"));
        var names = Regex.Matches(source, @"name:\s*'([a-z.-]+)'").Select(m => m.Groups[1].Value).ToList();
        Assert.Equal(PartnerSlots.All.Select(s => s.Name), names);
    }

    [Fact]
    public void The_seeded_partners_state_only_the_partnership_and_the_supplied_facts()
    {
        var pci = PartnerBaselineSeeder.PciAi();
        var certuvo = PartnerBaselineSeeder.Certuvo(DateTime.UtcNow);
        Assert.Equal("https://pciai.org", pci.WebsiteUrl);
        Assert.Equal("https://certuvo.com", certuvo.WebsiteUrl);
        Assert.Contains("Optimize All is its official marketing partner.", pci.DescriptionMarkdown);
        Assert.Contains("Optimize All is its official marketing partner.", certuvo.DescriptionMarkdown);
        Assert.DoesNotContain("ACCA", certuvo.DescriptionMarkdown + string.Join(' ', certuvo.Keywords));
        Assert.False(certuvo.OfferConfirmed);
        Assert.All(pci.Slots.Concat(certuvo.Slots), s => Assert.NotNull(PartnerSlots.Find(s)));
        Assert.True(pci.Seo.Title!.Length <= 60 && certuvo.Seo.Title!.Length <= 60);
        Assert.True(pci.Seo.Description!.Length <= 200 && certuvo.Seo.Description!.Length <= 200);
    }
    [Theory]
    [InlineData("blog.inline | 2\nblog.end | 1", "blog.inline", 2)]
    [InlineData("blog.inline | 2\nblog.end | 1", "blog.end", 1)]
    [InlineData("blog.inline | 2", "learn.hub", 1)] // not listed: no cap
    [InlineData("learn.hub | 0", "learn.hub", 0)]
    [InlineData("learn.hub | many", "learn.hub", 1)] // unreadable: no cap
    [InlineData(null, "learn.hub", 1)]
    public void Frequency_caps_are_read_from_the_slot_list(string? list, string slot, int expected) =>
        Assert.Equal(expected, PartnerFrequency.EveryNth(list, slot));

    [Fact]
    public void A_capped_slot_shows_on_a_stable_share_of_pages_and_zero_shows_on_none()
    {
        var pages = Enumerable.Range(0, 400).Select(i => $"/blog/post-{i}").ToList();
        Assert.All(pages, p => Assert.True(PartnerFrequency.Shows("blog.inline", p, 1)));
        Assert.All(pages, p => Assert.False(PartnerFrequency.Shows("blog.inline", p, 0)));
        var shown = pages.Count(p => PartnerFrequency.Shows("blog.inline", p, 2));
        Assert.InRange(shown, 140, 260); // about one page in two
        Assert.Equal(shown, pages.Count(p => PartnerFrequency.Shows("blog.inline", p, 2))); // the same pages every time
    }

    [Fact]
    public void Short_link_aliases_resolve_from_the_list_and_ignore_everything_else()
    {
        const string list = "pciai | pci-ai\nCertuvo | Certuvo\nbroken line";
        Assert.Equal("pci-ai", PartnerShortLinksController.Resolve(list, "pciai"));
        Assert.Equal("certuvo", PartnerShortLinksController.Resolve(list, "certuvo"));
        Assert.Null(PartnerShortLinksController.Resolve(list, "broken line"));
        Assert.Null(PartnerShortLinksController.Resolve(null, "pciai"));
    }

    [Fact]
    public void The_partner_social_card_is_tinted_with_the_brand_colour_and_states_the_partnership()
    {
        var pci = PartnerBaselineSeeder.PciAi();
        var card = PartnerPublicService.SocialCardFor(pci);
        Assert.Equal("Official marketing partner", card.Eyebrow);
        Assert.Contains("PCI AI", card.Title);
        Assert.Equal("Optimize All is the official marketing partner of PCI AI.", card.Subtitle);
        Assert.Equal("#14285A", card.Accent);
        Assert.NotEqual(card.Version("Optimize All", "optimizeall.example"), (card with { Accent = "#1D4ED8" }).Version("Optimize All", "optimizeall.example"));
        var renderer = new SocialCardRenderer();
        var png = renderer.Render(card, "Optimize All", "optimizeall.example");
        Assert.True(png.Length > 5_000);
        Assert.NotEqual(png, renderer.Render(card with { Accent = null }, "Optimize All", "optimizeall.example"));
    }

    [Fact]
    public void Every_slot_has_a_variant_and_only_the_home_band_and_the_academy_hub_are_hero_size()
    {
        Assert.All(PartnerSlots.All, s => Assert.Contains(s.Variant, new[] { PartnerVariants.Hero, PartnerVariants.Kit, PartnerVariants.Inline, PartnerVariants.Bar }));
        Assert.Equal(new[] { PartnerSlots.HomeBand, PartnerSlots.LearnHub }, PartnerSlots.All.Where(s => s.Variant == PartnerVariants.Hero).Select(s => s.Name));
    }
}
