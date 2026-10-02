using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using OptimizeAll.Api.Common.Hosting;
using OptimizeAll.Api.Common.Audit;
using OptimizeAll.Api.Modules.Accounts;
using OptimizeAll.Api.Modules.Website.Shared;
using OptimizeAll.Domain.Website;
using OptimizeAll.Infrastructure.Persistence;

namespace OptimizeAll.Api.Modules.Website.Settings;

public sealed record MenuItem(string Label, string? Url, string? Description, IReadOnlyList<MenuItem>? Children);

/// <summary>
/// The site header: the menu, the highlighted call to action, and an optional quiet text link next to it (the default is
/// "Free Academy"). Stored documents without <c>secondaryLink</c> read as null.
/// </summary>
public sealed record HeaderSettings(IReadOnlyList<MenuItem> Menu, SiteLink? Cta, SiteLink? SecondaryLink = null);

public sealed record FooterColumn(string Title, IReadOnlyList<SiteLink> Links);

/// <summary>
/// The site footer. <see cref="ProductLinks"/> ("More from Optimize All": the sibling products) and <see cref="SignInLinks"/>
/// (one sign-in group labelled by audience) are the two small groups after the columns; stored documents without them
/// read the defaults (<see cref="SiteSettingsService.Normalize"/>).
/// </summary>
public sealed record FooterSettings(
    string? Blurb, IReadOnlyList<FooterColumn> Columns, IReadOnlyList<SiteLink> LegalLinks,
    IReadOnlyList<SiteLink>? ProductLinks = null, IReadOnlyList<SiteLink>? SignInLinks = null);

/// <summary>
/// Brand assets: the logo in the header and footer (light and, optionally, dark backgrounds) and the browser icon. Null:
/// the built-in Optimize All logo and icons.
/// </summary>
public sealed record BrandSettings(string? LogoUrl, string? LogoDarkUrl, string? FaviconUrl)
{
    public static readonly BrandSettings Empty = new(null, null, null);
}

/// <summary>A section of a built-in page and whether it is shown (the list order is the page order).</summary>
public sealed record PageSection(string Key, bool Visible);

/// <summary>Section order and visibility of the home page and the creators page (the hero always comes first).</summary>
public sealed record PageLayouts(IReadOnlyList<PageSection> Home, IReadOnlyList<PageSection> Creators);

/// <summary>
/// The chrome of a sibling product site (Academy at /learn, Creators at /creators): its header navigation and call to
/// action, and the links and note of its footer.
/// </summary>
public sealed record ProductChrome(IReadOnlyList<SiteLink> Nav, SiteLink Cta, IReadOnlyList<SiteLink> FooterLinks, string? FooterNote, SiteLink? FooterNoteLink);

public sealed record ProductSites(ProductChrome Academy, ProductChrome Creators);

/// <summary>The sections of the pages whose layout is editable (key → admin label), in their default order.</summary>
public static class PageLayoutCatalog
{
    public static readonly IReadOnlyList<(string Key, string Label)> Home = new[]
    {
        ("logos", "Client logos"), ("partners", "Partner placements"), ("services", "Services"), ("proof", "Results and case studies"),
        ("process", "How we work"), ("industries", "Industries"), ("testimonials", "Testimonials"), ("insights", "Latest articles"), ("band", "Partner band"),
        ("more", "More from Optimize All (Academy, Creators)"), ("cta", "Closing call to action and pricing"), ("newsletter", "Newsletter"),
    };

    public static readonly IReadOnlyList<(string Key, string Label)> Creators = new[]
    {
        ("how", "How it works (#how-it-works)"), ("earnings", "How earnings work"), ("rules", "Campaign rules (#rules)"),
        ("faq", "Most asked questions"), ("cta", "Closing call to action"),
    };

    public static IReadOnlyList<PageSection> Defaults(IReadOnlyList<(string Key, string Label)> catalog) =>
        catalog.Select(x => new PageSection(x.Key, true)).ToList();

    /// <summary>The stored order with unknown and repeated keys dropped and sections added since appended (shown).</summary>
    public static IReadOnlyList<PageSection> Merge(IReadOnlyList<PageSection>? stored, IReadOnlyList<(string Key, string Label)> catalog)
    {
        var known = catalog.Select(x => x.Key).ToHashSet(StringComparer.Ordinal);
        var result = new List<PageSection>();
        foreach (var section in stored ?? Array.Empty<PageSection>())
            if (section?.Key is { } key && known.Contains(key) && result.All(r => r.Key != key)) result.Add(new PageSection(key, section.Visible));
        foreach (var (key, _) in catalog)
            if (result.All(r => r.Key != key)) result.Add(new PageSection(key, true));
        return result;
    }
}

public sealed record ContactSettings(string? Email, string? Phone, string? WhatsApp, string? Address, string? Hours);

public sealed record SocialProfile(string Platform, string Url);

public sealed record TrustLogo(string Name, string ImageUrl, string? Url);

public sealed record AnnouncementBar(bool Enabled, string? Text, string? LinkLabel, string? LinkUrl);

public sealed record DefaultSeo(string? SiteUrl, string TitleTemplate, string DefaultTitle, string? DefaultDescription, string? DefaultOgImageUrl, string? TwitterHandle);

public sealed record OrganizationSchema(
    string? LegalName, string? LogoUrl, int? FoundingYear, string? StreetAddress, string? Locality, string? Region,
    string? PostalCode, string? CountryCode, IReadOnlyList<string> AreaServed);

/// <summary>Tag ids injected by the web app only after the visitor consents to analytics / marketing cookies.</summary>
public sealed record AnalyticsSettings(string? Ga4MeasurementId, string? GtmContainerId, string? MetaPixelId);

public sealed record HomeStat(string Label, string Value, MetricMeasurement Measurement, string? Context);

/// <summary>The site settings document (stored as JSON in <c>website_settings</c>).</summary>
public sealed record SiteSettings(
    string SiteName,
    string Tagline,
    HeaderSettings Header,
    FooterSettings Footer,
    ContactSettings Contact,
    IReadOnlyList<SocialProfile> Social,
    IReadOnlyList<TrustLogo> TrustLogos,
    AnnouncementBar Announcement,
    DefaultSeo Seo,
    OrganizationSchema Organization,
    AnalyticsSettings Analytics,
    IReadOnlyList<HomeStat> HomeStats,
    BrandSettings? Brand = null,
    PageLayouts? Layouts = null,
    ProductSites? Products = null);

/// <param name="Defaults">The shipped defaults (for "reset to default" in the editor).</param>
public sealed record SiteSettingsDto(SiteSettings Settings, DateTime UpdatedAt, Guid ConcurrencyStamp, SiteSettings? Defaults = null);

public sealed class UpdateSiteSettingsRequest
{
    [Required]
    public SiteSettings? Settings { get; set; }

    [Required]
    public Guid? ConcurrencyStamp { get; set; }
}

/// <summary>Loads, validates and saves the site settings document.</summary>
public sealed partial class SiteSettingsService(AppDbContext db, IAuditLogger audit, WebsiteRules rules, IPublicOrigin publicOrigin)
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
    };

    public static readonly string[] SocialPlatforms =
        { "LinkedIn", "Instagram", "Facebook", "X", "TikTok", "YouTube", "Pinterest", "Threads", "WhatsApp", "GitHub", "Behance", "Dribbble" };

    public async Task<SiteSettings> GetAsync(CancellationToken ct)
    {
        var doc = await db.Set<SiteSettingsDocument>().AsNoTracking().FirstOrDefaultAsync(d => d.Key == SiteSettingsDocument.DefaultKey, ct);
        return Parse(doc?.Json);
    }

    public async Task<SiteSettingsDto> GetForEditAsync(CancellationToken ct)
    {
        var doc = await EnsureAsync(ct);
        return new SiteSettingsDto(Parse(doc.Json), doc.UpdatedAt, doc.ConcurrencyStamp, Defaults);
    }

    public async Task<SiteSettingsDto> UpdateAsync(UpdateSiteSettingsRequest request, CancellationToken ct)
    {
        var doc = await EnsureAsync(ct);
        CmsStore.CheckStamp(db, doc, request.ConcurrencyStamp);
        var before = Parse(doc.Json);
        var normalized = Validate(request.Settings!);
        doc.Json = JsonSerializer.Serialize(normalized, Json);
        audit.Record("website.settings_updated", nameof(SiteSettingsDocument), doc.Id, before, normalized);
        await db.SaveChangesAsync(ct);
        publicOrigin.SiteUrlChanged(normalized.Seo.SiteUrl);
        return new SiteSettingsDto(normalized, doc.UpdatedAt, doc.ConcurrencyStamp, Defaults);
    }

    private async Task<SiteSettingsDocument> EnsureAsync(CancellationToken ct)
    {
        var doc = await db.Set<SiteSettingsDocument>().FirstOrDefaultAsync(d => d.Key == SiteSettingsDocument.DefaultKey, ct);
        if (doc is not null) return doc;
        doc = new SiteSettingsDocument { Json = JsonSerializer.Serialize(Defaults, Json) };
        db.Set<SiteSettingsDocument>().Add(doc);
        await db.SaveChangesAsync(ct);
        return doc;
    }

    public static SiteSettings Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return Defaults;
        try
        {
            return Normalize(JsonSerializer.Deserialize<SiteSettings>(json, Json) ?? Defaults);
        }
        catch (JsonException)
        {
            return Defaults;
        }
    }

    /// <summary>
    /// Fills in the parts a stored document may not have yet (brand, page layouts, product sites, the footer's product and
    /// sign-in groups, the header's quiet link) with the defaults, so every reader sees the same complete settings and the
    /// site looks exactly as before until an editor changes them.
    /// </summary>
    public static SiteSettings Normalize(SiteSettings s)
    {
        var footer = s.Footer ?? Defaults.Footer;
        var header = s.Header ?? Defaults.Header;
        var layouts = s.Layouts;
        return s with
        {
            Header = header with { SecondaryLink = header.SecondaryLink ?? DefaultSecondaryLink },
            Footer = footer with
            {
                ProductLinks = footer.ProductLinks ?? DefaultProductLinks,
                SignInLinks = footer.SignInLinks ?? DefaultSignInLinks,
            },
            Brand = s.Brand ?? BrandSettings.Empty,
            Layouts = new PageLayouts(PageLayoutCatalog.Merge(layouts?.Home, PageLayoutCatalog.Home),
                PageLayoutCatalog.Merge(layouts?.Creators, PageLayoutCatalog.Creators)),
            Products = new ProductSites(s.Products?.Academy ?? DefaultAcademy, s.Products?.Creators ?? DefaultCreators),
        };
    }

    public static readonly SiteLink DefaultSecondaryLink = new("Free Academy", "/learn");

    /// <summary>The footer's "More from Optimize All" group (frontend SiteFooter.tsx shipped these as constants).</summary>
    public static readonly IReadOnlyList<SiteLink> DefaultProductLinks = new SiteLink[]
    {
        new("Optimize All Academy", "/learn"), new("Optimize All Creators", "/creators"),
    };

    /// <summary>One sign-in group labelled by audience; all open /login (the audience only chooses the page's wording).</summary>
    public static readonly IReadOnlyList<SiteLink> DefaultSignInLinks = new SiteLink[]
    {
        new("Client login", "/login"), new("Creator sign in", "/login?audience=creator"), new("Academy sign in", "/login?audience=learner"),
    };

    public static readonly ProductChrome DefaultAcademy = new(
        new SiteLink[] { new("Courses", "/learn"), new("Learning paths", "/learn/paths"), new("Certificates", "/learn#certificates"), new("Verify a certificate", "/verify") },
        new SiteLink("Start learning free", "/learn"),
        new SiteLink[] { new("Courses", "/learn"), new("Learning paths", "/learn/paths"), new("Certificates", "/learn#certificates"), new("Verify a certificate", "/verify") },
        "Optimize All Academy is run by Optimize All, a marketing agency.",
        new SiteLink("Work with us", "/services"));

    public static readonly ProductChrome DefaultCreators = new(
        new SiteLink[] { new("How it works", "/creators#how-it-works"), new("FAQ", "/creators/faq"), new("Campaign rules", "/creators#rules") },
        new SiteLink("Create a creator account", "/register?audience=creator"),
        new SiteLink[]
        {
            new("How it works", "/creators#how-it-works"), new("FAQ", "/creators/faq"), new("Campaign rules", "/creators#rules"),
            new("Create a creator account", "/register?audience=creator"), new("Creator sign in", "/login?audience=creator"),
        },
        "Optimize All Creators is run by Optimize All, a marketing agency.",
        new SiteLink("Visit Optimize All", "/"));

    /// <summary>Validates every field (links, images, ids) and returns a trimmed copy. Throws 400 with field errors.</summary>
    public SiteSettings Validate(SiteSettings s)
    {
        var e = new FieldErrors();
        string Req(string? v, string field, int max)
        {
            var c = WebsiteRules.Clean(v);
            if (c is null) e.Add(field, "Required.");
            else if (c.Length > max) e.Add(field, $"At most {max} characters.");
            return c ?? string.Empty;
        }
        string? Opt(string? v, string field, int max)
        {
            var c = WebsiteRules.Clean(v);
            if (c is not null && c.Length > max) e.Add(field, $"At most {max} characters.");
            return c;
        }
        SiteLink? Link(SiteLink? l, string field, bool required = false)
        {
            if (l is null || (WebsiteRules.Clean(l.Label) is null && WebsiteRules.Clean(l.Url) is null))
            {
                if (required) e.Add(field, "Add a label and a link.");
                return null;
            }
            var label = Req(l.Label, field + ".label", 60);
            var url = WebsiteRules.Link(l.Url, field + ".url", e);
            if (url is null) e.Add(field + ".url", "Add the link.");
            return new SiteLink(label, url ?? string.Empty);
        }

        var menu = new List<MenuItem>();
        var items = s.Header?.Menu ?? Array.Empty<MenuItem>();
        if (items.Count > 10) e.Add("header.menu", "Use at most 10 top-level menu items.");
        for (var i = 0; i < items.Count; i++)
        {
            var m = items[i];
            var f = $"header.menu[{i}]";
            var children = new List<MenuItem>();
            var kids = m.Children ?? Array.Empty<MenuItem>();
            if (kids.Count > 40) e.Add(f + ".children", "Use at most 40 sub-items.");
            for (var j = 0; j < kids.Count; j++)
            {
                var c = kids[j];
                var cf = $"{f}.children[{j}]";
                var url = WebsiteRules.Link(c.Url, cf + ".url", e);
                if (url is null) e.Add(cf + ".url", "Sub-items need a link.");
                children.Add(new MenuItem(Req(c.Label, cf + ".label", 60), url, Opt(c.Description, cf + ".description", 160), null));
            }
            var topUrl = WebsiteRules.Link(m.Url, f + ".url", e);
            if (topUrl is null && children.Count == 0) e.Add(f + ".url", "Add a link or sub-items.");
            menu.Add(new MenuItem(Req(m.Label, f + ".label", 40), topUrl, Opt(m.Description, f + ".description", 160), children));
        }

        var columns = new List<FooterColumn>();
        var cols = s.Footer?.Columns ?? Array.Empty<FooterColumn>();
        if (cols.Count > 6) e.Add("footer.columns", "Use at most 6 footer columns.");
        for (var i = 0; i < cols.Count; i++)
        {
            var links = (cols[i].Links ?? Array.Empty<SiteLink>()).Select((l, j) => Link(l, $"footer.columns[{i}].links[{j}]", true)!).Where(l => l is not null).ToList();
            if (links.Count > 15) e.Add($"footer.columns[{i}].links", "Use at most 15 links per column.");
            columns.Add(new FooterColumn(Req(cols[i].Title, $"footer.columns[{i}].title", 40), links));
        }
        var legal = (s.Footer?.LegalLinks ?? Array.Empty<SiteLink>()).Select((l, j) => Link(l, $"footer.legalLinks[{j}]", true)!).Where(l => l is not null).ToList();
        List<SiteLink> Links(IReadOnlyList<SiteLink>? links, string field, int max)
        {
            var list = (links ?? Array.Empty<SiteLink>()).Select((l, j) => Link(l, $"{field}[{j}]", true)!).Where(l => l is not null).ToList();
            if (list.Count > max) e.Add(field, $"Use at most {max} links.");
            return list;
        }
        var productLinks = Links(s.Footer?.ProductLinks ?? DefaultProductLinks, "footer.productLinks", 8);
        var signInLinks = Links(s.Footer?.SignInLinks ?? DefaultSignInLinks, "footer.signInLinks", 8);

        var b0 = s.Brand ?? BrandSettings.Empty;
        var brand = new BrandSettings(rules.Image(b0.LogoUrl, "brand.logoUrl", e), rules.Image(b0.LogoDarkUrl, "brand.logoDarkUrl", e),
            rules.Image(b0.FaviconUrl, "brand.faviconUrl", e));

        IReadOnlyList<PageSection> Sections(IReadOnlyList<PageSection>? sections, IReadOnlyList<(string Key, string Label)> catalog, string field)
        {
            var known = catalog.Select(x => x.Key).ToHashSet(StringComparer.Ordinal);
            var input = sections ?? Array.Empty<PageSection>();
            for (var i = 0; i < input.Count; i++)
                if (input[i]?.Key is not { } key || !known.Contains(key)) e.Add($"{field}[{i}].key", "Unknown section.");
            if (input.Select(x => x?.Key).Distinct().Count() != input.Count) e.Add(field, "List each section once.");
            return PageLayoutCatalog.Merge(input, catalog);
        }
        var layouts = new PageLayouts(Sections(s.Layouts?.Home, PageLayoutCatalog.Home, "layouts.home"),
            Sections(s.Layouts?.Creators, PageLayoutCatalog.Creators, "layouts.creators"));

        ProductChrome Product(ProductChrome? p, ProductChrome fallback, string field)
        {
            p ??= fallback;
            var nav = Links(p.Nav, field + ".nav", 8);
            var cta = Link(p.Cta, field + ".cta", required: true);
            var footerLinks = Links(p.FooterLinks, field + ".footerLinks", 12);
            return new ProductChrome(nav, cta ?? fallback.Cta, footerLinks, Opt(p.FooterNote, field + ".footerNote", 200), Link(p.FooterNoteLink, field + ".footerNoteLink"));
        }
        var products = new ProductSites(Product(s.Products?.Academy, DefaultAcademy, "products.academy"),
            Product(s.Products?.Creators, DefaultCreators, "products.creators"));

        var c0 = s.Contact ?? new ContactSettings(null, null, null, null, null);
        var email = Opt(c0.Email, "contact.email", 254);
        if (email is not null && !FieldRules.IsEmail(email)) e.Add("contact.email", "Enter a valid email address.");
        var phone = Opt(c0.Phone, "contact.phone", 32);
        if (phone is not null && !PhoneRegex().IsMatch(phone)) e.Add("contact.phone", "Enter a phone number such as +1 415 555 0100.");
        var whatsapp = Opt(c0.WhatsApp, "contact.whatsApp", 16)?.Replace(" ", string.Empty);
        if (whatsapp is not null && !FieldRules.IsE164(whatsapp)) e.Add("contact.whatsApp", "Use the international format, e.g. +14155550100.");

        var social = new List<SocialProfile>();
        var socialIn = s.Social ?? Array.Empty<SocialProfile>();
        for (var i = 0; i < socialIn.Count; i++)
        {
            var platform = SocialPlatforms.FirstOrDefault(p => string.Equals(p, socialIn[i].Platform?.Trim(), StringComparison.OrdinalIgnoreCase));
            if (platform is null) { e.Add($"social[{i}].platform", "Unknown platform."); continue; }
            var url = WebsiteRules.Clean(socialIn[i].Url);
            if (url is null || !url.StartsWith("https://", StringComparison.Ordinal) || !FieldRules.IsSafeContentUrl(url))
                e.Add($"social[{i}].url", "Use the https:// link to the profile.");
            social.Add(new SocialProfile(platform, url ?? string.Empty));
        }

        var logos = new List<TrustLogo>();
        var logosIn = s.TrustLogos ?? Array.Empty<TrustLogo>();
        if (logosIn.Count > 24) e.Add("trustLogos", "Use at most 24 logos.");
        for (var i = 0; i < logosIn.Count; i++)
        {
            var img = rules.Image(logosIn[i].ImageUrl, $"trustLogos[{i}].imageUrl", e);
            if (img is null) e.Add($"trustLogos[{i}].imageUrl", "Upload the logo image.");
            logos.Add(new TrustLogo(Req(logosIn[i].Name, $"trustLogos[{i}].name", 80), img ?? string.Empty,
                WebsiteRules.Link(logosIn[i].Url, $"trustLogos[{i}].url", e)));
        }

        var a0 = s.Announcement ?? new AnnouncementBar(false, null, null, null);
        var aText = Opt(a0.Text, "announcement.text", 200);
        if (a0.Enabled && aText is null) e.Add("announcement.text", "Add the announcement text or turn the bar off.");
        var aUrl = WebsiteRules.Link(a0.LinkUrl, "announcement.linkUrl", e);
        var aLabel = Opt(a0.LinkLabel, "announcement.linkLabel", 40);
        if ((aUrl is null) != (aLabel is null)) e.Add("announcement.linkLabel", "Link label and link go together.");

        var seo0 = s.Seo ?? Defaults.Seo;
        var siteUrl = Opt(seo0.SiteUrl, "seo.siteUrl", 200)?.TrimEnd('/');
        if (siteUrl is not null && (!Uri.TryCreate(siteUrl, UriKind.Absolute, out var su) || su.Scheme != Uri.UriSchemeHttps || su.AbsolutePath != "/"))
            e.Add("seo.siteUrl", "Use the site's https:// origin, e.g. https://www.optimizeall.com.");
        var template = Req(seo0.TitleTemplate, "seo.titleTemplate", 80);
        if (!template.Contains("%s", StringComparison.Ordinal)) e.Add("seo.titleTemplate", "Include %s where the page title goes.");
        var twitter = Opt(seo0.TwitterHandle, "seo.twitterHandle", 16);
        if (twitter is not null && !TwitterRegex().IsMatch(twitter)) e.Add("seo.twitterHandle", "Use a handle such as @optimizeall.");

        var o0 = s.Organization ?? Defaults.Organization;
        var country = Opt(o0.CountryCode, "organization.countryCode", 2)?.ToUpperInvariant();
        if (country is not null && !FieldRules.IsCountryCode(country)) e.Add("organization.countryCode", "Use a two-letter country code.");
        if (o0.FoundingYear is { } year && (year < 1900 || year > 2100)) e.Add("organization.foundingYear", "Enter a valid year.");

        var an = s.Analytics ?? new AnalyticsSettings(null, null, null);
        var ga4 = Opt(an.Ga4MeasurementId, "analytics.ga4MeasurementId", 20)?.ToUpperInvariant();
        if (ga4 is not null && !Ga4Regex().IsMatch(ga4)) e.Add("analytics.ga4MeasurementId", "A GA4 measurement ID looks like G-ABC123XYZ9.");
        var gtm = Opt(an.GtmContainerId, "analytics.gtmContainerId", 20)?.ToUpperInvariant();
        if (gtm is not null && !GtmRegex().IsMatch(gtm)) e.Add("analytics.gtmContainerId", "A GTM container ID looks like GTM-ABC1234.");
        var pixel = Opt(an.MetaPixelId, "analytics.metaPixelId", 20);
        if (pixel is not null && !PixelRegex().IsMatch(pixel)) e.Add("analytics.metaPixelId", "A Meta Pixel ID is 10–20 digits.");

        var stats = new List<HomeStat>();
        var statsIn = s.HomeStats ?? Array.Empty<HomeStat>();
        if (statsIn.Count > 8) e.Add("homeStats", "Use at most 8 stats.");
        for (var i = 0; i < statsIn.Count; i++)
        {
            if (!Enum.IsDefined(statsIn[i].Measurement)) e.Add($"homeStats[{i}].measurement", "Say whether the figure is measured or estimated.");
            stats.Add(new HomeStat(Req(statsIn[i].Label, $"homeStats[{i}].label", 80), Req(statsIn[i].Value, $"homeStats[{i}].value", 20),
                statsIn[i].Measurement, Opt(statsIn[i].Context, $"homeStats[{i}].context", 160)));
        }

        var result = new SiteSettings(
            Req(s.SiteName, "siteName", 80),
            Req(s.Tagline, "tagline", 120),
            new HeaderSettings(menu, Link(s.Header?.Cta, "header.cta"), Link(s.Header?.SecondaryLink, "header.secondaryLink") ?? DefaultSecondaryLink),
            new FooterSettings(Opt(s.Footer?.Blurb, "footer.blurb", 400), columns, legal, productLinks, signInLinks),
            new ContactSettings(email, phone, whatsapp, Opt(c0.Address, "contact.address", 300), Opt(c0.Hours, "contact.hours", 120)),
            social,
            logos,
            new AnnouncementBar(a0.Enabled, aText, aLabel, aUrl),
            new DefaultSeo(siteUrl, template, Req(seo0.DefaultTitle, "seo.defaultTitle", 70), Opt(seo0.DefaultDescription, "seo.defaultDescription", 200),
                rules.Image(seo0.DefaultOgImageUrl, "seo.defaultOgImageUrl", e), twitter),
            new OrganizationSchema(Opt(o0.LegalName, "organization.legalName", 150), rules.Image(o0.LogoUrl, "organization.logoUrl", e), o0.FoundingYear,
                Opt(o0.StreetAddress, "organization.streetAddress", 200), Opt(o0.Locality, "organization.locality", 100),
                Opt(o0.Region, "organization.region", 100), Opt(o0.PostalCode, "organization.postalCode", 20), country,
                WebsiteRules.Lines(o0.AreaServed, "organization.areaServed", e, 30, 80)),
            new AnalyticsSettings(ga4, gtm, pixel),
            stats,
            brand,
            layouts,
            products);
        e.ThrowIfAny();
        return result;
    }

    /// <summary>
    /// Defaults used before an administrator saves settings (and by the baseline seed). The agency is the main frame: the
    /// header, footer and SEO texts lead with the marketing agency (strategy, performance, SEO, content, AI). The free
    /// Academy (/learn) and Creators (/creators) are separate, labelled products reached by a quiet header link and the
    /// footer's "More from Optimize All" group.
    /// </summary>
    public static readonly SiteSettings Defaults = new(
        "Optimize All",
        "Discover the world of solution",
        new HeaderSettings(DefaultMenu, new SiteLink("Book a consultation", "/book-a-consultation"), new SiteLink("Free Academy", "/learn")),
        new FooterSettings(
            "A digital marketing agency: strategy, performance marketing, SEO, content and AI, measured in revenue rather than vanity metrics. We also run a free Academy for learners and a Creators programme.",
            DefaultFooterColumns,
            new SiteLink[]
            {
                new("Privacy policy", "/privacy-policy"), new("Terms of service", "/terms-of-service"), new("Cookie policy", "/cookie-policy"),
                new("Accessibility", "/accessibility"), new("Refund policy", "/refund-policy"),
            },
            DefaultProductLinks,
            DefaultSignInLinks),
        new ContactSettings("hello@optimizeall.com", null, null, null, "Monday–Friday, 9:00–18:00"),
        Array.Empty<SocialProfile>(),
        Array.Empty<TrustLogo>(),
        new AnnouncementBar(false, null, null, null),
        new DefaultSeo(null, "%s | Optimize All", "Optimize All — Digital Marketing, SEO & AI Agency",
            "A digital marketing agency for strategy, performance marketing, SEO, content and AI, with reporting tied to revenue. Free Academy courses too.", null, null),
        new OrganizationSchema("Optimize All", null, null, null, null, null, null, null, Array.Empty<string>()),
        new AnalyticsSettings(null, null, null),
        Array.Empty<HomeStat>(),
        BrandSettings.Empty,
        new PageLayouts(PageLayoutCatalog.Defaults(PageLayoutCatalog.Home), PageLayoutCatalog.Defaults(PageLayoutCatalog.Creators)),
        new ProductSites(DefaultAcademy, DefaultCreators));

    private static MenuItem[] DefaultMenu => new MenuItem[]
    {
        new("Services", "/services", "Everything we do to grow your brand.", Array.Empty<MenuItem>()),
        new("Industries", "/industries", null, null),
        new("Case studies", "/case-studies", null, null),
        new("Insights", "/blog", "Playbooks, research and news.", null),
        new("Partners", "/partners", null, null),
        new("About", "/about", null, new MenuItem[]
        {
            new("About us", "/about", "Who we are and what we do.", null),
            new("How we work", "/how-we-work", "Our process, from audit to results.", null),
            new("Team", "/team", "The people behind your results.", null),
            new("Careers", "/careers", "Join the team.", null),
            new("Contact", "/contact", "Talk to us.", null),
        }),
    };

    private static FooterColumn[] DefaultFooterColumns => new FooterColumn[]
    {
        new("Services", new SiteLink[]
        {
            new("SEO", "/services/seo"), new("Google Ads / PPC", "/services/google-ads-ppc"),
            new("Social media management", "/services/social-media-management"),
            new("Influencer & UGC marketing", "/services/influencer-ugc-marketing"),
            new("Web design & development", "/services/web-design-development"), new("All services", "/services"),
        }),
        new("Company", new SiteLink[]
        {
            new("About", "/about"), new("How we work", "/how-we-work"), new("Team", "/team"), new("Careers", "/careers"),
            new("Case studies", "/case-studies"), new("Insights", "/blog"), new("Partners", "/partners"), new("Contact", "/contact"),
        }),
        new("Get started", new SiteLink[]
        {
            new("Book a consultation", "/book-a-consultation"), new("Free marketing audit", "/free-audit"), new("Get a quote", "/get-a-quote"),
            new("Pricing", "/pricing"),
        }),
        new("More from Optimize All", new SiteLink[]
        {
            new("Academy: free courses", "/learn"), new("Learning paths", "/learn/paths"), new("Creators programme", "/creators"),
        }),
        new("Sign in", new SiteLink[]
        {
            new("Sign in", "/login"), new("Create a free account", "/register"),
        }),
    };

    /// <summary>
    /// The agency-only defaults shipped before the two-pillar repositioning (2026-09). The baseline seed upgrades stored
    /// settings whose header, footer or SEO defaults still equal these exactly (never an administrator's own edits).
    /// </summary>
    internal static class PreviousDefaults
    {
        public static readonly IReadOnlyList<MenuItem> Menu = new MenuItem[]
        {
            new("Services", "/services", "Everything we do to grow your brand.", Array.Empty<MenuItem>()),
            new("Industries", "/industries", null, null),
            new("Case studies", "/case-studies", null, null),
            new("Pricing", "/pricing", null, null),
            new("Academy", "/learn", "Free courses with certificates.", null),
            new("About", "/about", null, new MenuItem[]
            {
                new("About us", "/about", "Who we are and how we work.", null),
                new("Team", "/team", "The people behind your results.", null),
                new("Careers", "/careers", "Join the agency.", null),
                new("Blog", "/blog", "Playbooks, research and news.", null),
            }),
            new("Creators", "/creators", "Get paid to share brands you believe in.", null),
        };

        public static readonly SiteLink Cta = new("Get a free audit", "/free-audit");

        public const string Blurb =
            "A full-service digital marketing agency: search, social, paid media, content, email, brand and web — measured in revenue, not vanity metrics.";

        public static readonly IReadOnlyList<FooterColumn> Columns = new FooterColumn[]
        {
            new("Services", new SiteLink[]
            {
                new("SEO", "/services/seo"), new("Google Ads / PPC", "/services/google-ads-ppc"),
                new("Social media management", "/services/social-media-management"),
                new("Influencer & UGC marketing", "/services/influencer-ugc-marketing"),
                new("Web design & development", "/services/web-design-development"), new("All services", "/services"),
            }),
            new("Company", new SiteLink[]
            {
                new("About", "/about"), new("How we work", "/how-we-work"), new("Team", "/team"), new("Careers", "/careers"),
                new("Case studies", "/case-studies"), new("Blog", "/blog"), new("Free courses", "/learn"),
            }),
            new("Get started", new SiteLink[]
            {
                new("Free marketing audit", "/free-audit"), new("Get a quote", "/get-a-quote"), new("Book a consultation", "/book-a-consultation"),
                new("Pricing", "/pricing"), new("Contact", "/contact"), new("Become a creator", "/creators"),
            }),
        };

        public const string SeoTitle = "Optimize All — Full-service digital marketing agency";

        public const string SeoDescription = "Search, social, paid media, content, email and web — one accountable team focused on measurable growth.";
    }

    /// <summary>
    /// The academy-first defaults shipped with the two-pillar repositioning (2026-09), frozen as they were. Stored settings
    /// that still equal them are moved to the agency-first <see cref="Defaults"/> (2026-10).
    /// </summary>
    internal static class AcademyFirstDefaults
    {
        public static readonly IReadOnlyList<MenuItem> Menu = new MenuItem[]
        {
            new("Academy", "/academy", "Free courses with certificates.", new MenuItem[]
            {
                new("All courses", "/learn", "Free, self-paced courses with certificates.", null),
                new("AI courses", "/learn?category=Ai", "ChatGPT, Claude, prompting, agents and more.", null),
                new("Learning paths", "/learn/paths", "Beginner to advanced, one course at a time.", null),
                new("Certificates", "/academy#certificates", "Verifiable, and ready for LinkedIn.", null),
            }),
            new("Services", "/services", "Everything we do to grow your brand.", Array.Empty<MenuItem>()),
            new("Industries", "/industries", null, null),
            new("Case studies", "/case-studies", null, null),
            new("Pricing", "/pricing", null, null),
            new("About", "/about", null, new MenuItem[]
            {
                new("About us", "/about", "Our mission: the academy and the agency.", null),
                new("Team", "/team", "The people behind your results.", null),
                new("Careers", "/careers", "Join the team.", null),
                new("Blog", "/blog", "Playbooks, research and news.", null),
                new("Creators", "/creators", "Get paid to share brands you believe in.", null),
            }),
        };

        public static readonly SiteLink Cta = new("Start learning free", "/learn");

        public const string Blurb =
            "A learning platform and a growth agency: free, certificate-backed courses in AI, marketing, SEO, sales and business — and a full-service digital marketing team that grows revenue and proves it.";

        public static readonly IReadOnlyList<FooterColumn> Columns = new FooterColumn[]
        {
            new("Academy", new SiteLink[]
            {
                new("All courses", "/learn"), new("AI courses", "/learn?category=Ai"), new("Marketing courses", "/learn?category=Marketing"),
                new("SEO courses", "/learn?category=Seo"), new("Learning paths", "/learn/paths"), new("Certificates", "/academy#certificates"),
                new("Academy overview", "/academy"),
            }),
            new("Services", new SiteLink[]
            {
                new("SEO", "/services/seo"), new("Google Ads / PPC", "/services/google-ads-ppc"),
                new("Social media management", "/services/social-media-management"),
                new("Influencer & UGC marketing", "/services/influencer-ugc-marketing"),
                new("Web design & development", "/services/web-design-development"), new("All services", "/services"),
            }),
            new("Company", new SiteLink[]
            {
                new("About", "/about"), new("How we work", "/how-we-work"), new("Team", "/team"), new("Careers", "/careers"),
                new("Case studies", "/case-studies"), new("Blog", "/blog"), new("Partners", "/partners"),
            }),
            new("Get started", new SiteLink[]
            {
                new("Start learning free", "/learn"), new("Free marketing audit", "/free-audit"), new("Get a quote", "/get-a-quote"),
                new("Book a consultation", "/book-a-consultation"), new("Pricing", "/pricing"), new("Contact", "/contact"),
                new("Become a creator", "/creators"),
            }),
        };

        public const string SeoTitle = "Optimize All — Free AI & Marketing Courses + Agency";

        public const string SeoDescription =
            "Free, certificate-backed courses in AI, marketing, SEO, sales and business — and a full-service digital marketing agency that grows revenue.";
    }

    /// <summary>
    /// Moves stored settings that still carry an earlier built-in generation (the agency-only defaults, or the academy-first
    /// two-pillar defaults including their first <c>/academy#paths</c> variant) to the current agency-first defaults, part by
    /// part: the header (menu, call to action), the footer blurb and columns, and the default SEO title and description. Any
    /// part an administrator has changed is kept as it is. Returns null when nothing changes.
    /// </summary>
    public static SiteSettings? UpgradeFromPreviousDefaults(SiteSettings s)
    {
        static string J<T>(T value) => JsonSerializer.Serialize(value, Json);
        // Saving settings in the admin turns "no sub-items" (null) into an empty list; both mean the same menu.
        static List<MenuItem> Norm(IEnumerable<MenuItem>? items) =>
            (items ?? Array.Empty<MenuItem>()).Select(m => new MenuItem(m.Label, m.Url, m.Description, Norm(m.Children))).ToList();
        // The first two-pillar defaults linked "Learning paths" to /academy#paths; the paths now have their own pages.
        static string FirstTwoPillar(string json) => json.Replace("\"/learn/paths\"", "\"/academy#paths\"", StringComparison.Ordinal);
        var changed = false;
        var header = s.Header;
        var menu = J(Norm(header.Menu));
        var cta = J(header.Cta);
        var academyMenu = J(Norm(AcademyFirstDefaults.Menu));
        var academyCta = J(AcademyFirstDefaults.Cta);
        if ((menu == J(Norm(PreviousDefaults.Menu)) && cta == J(PreviousDefaults.Cta)) ||
            (menu == academyMenu && cta == academyCta) ||
            (menu == FirstTwoPillar(academyMenu) && cta == academyCta))
        {
            header = Defaults.Header;
            changed = true;
        }
        var footer = s.Footer;
        if (footer.Blurb == PreviousDefaults.Blurb || footer.Blurb == AcademyFirstDefaults.Blurb)
        {
            footer = footer with { Blurb = Defaults.Footer.Blurb };
            changed = true;
        }
        var columns = J(footer.Columns);
        if (columns == J(PreviousDefaults.Columns) || columns == J(AcademyFirstDefaults.Columns) || columns == FirstTwoPillar(J(AcademyFirstDefaults.Columns)))
        {
            footer = footer with { Columns = Defaults.Footer.Columns };
            changed = true;
        }
        var seo = s.Seo;
        if ((seo.DefaultTitle == PreviousDefaults.SeoTitle && seo.DefaultDescription == PreviousDefaults.SeoDescription) ||
            (seo.DefaultTitle == AcademyFirstDefaults.SeoTitle && seo.DefaultDescription == AcademyFirstDefaults.SeoDescription))
        {
            seo = seo with { DefaultTitle = Defaults.Seo.DefaultTitle, DefaultDescription = Defaults.Seo.DefaultDescription };
            changed = true;
        }
        return changed ? s with { Header = header, Footer = footer, Seo = seo } : null;
    }

    [GeneratedRegex(@"^\+?[0-9][0-9 ().-]{5,30}$")]
    private static partial Regex PhoneRegex();

    [GeneratedRegex(@"^@[A-Za-z0-9_]{1,15}$")]
    private static partial Regex TwitterRegex();

    [GeneratedRegex(@"^G-[A-Z0-9]{4,15}$")]
    private static partial Regex Ga4Regex();

    [GeneratedRegex(@"^GTM-[A-Z0-9]{4,12}$")]
    private static partial Regex GtmRegex();

    [GeneratedRegex(@"^[0-9]{10,20}$")]
    private static partial Regex PixelRegex();
}
