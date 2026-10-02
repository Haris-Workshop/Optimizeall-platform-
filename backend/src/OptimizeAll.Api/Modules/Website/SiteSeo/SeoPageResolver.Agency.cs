using System.Globalization;
using Microsoft.EntityFrameworkCore;
using OptimizeAll.Api.Modules.Website.Public;
using OptimizeAll.Domain.Agency;
using OptimizeAll.Domain.Website;

namespace OptimizeAll.Api.Modules.Website.SiteSeo;

/// <summary>
/// The agency pages (services, a service, pricing, industries, an industry, case studies, a case study), in the order and
/// words of the web app's pages (frontend/src/features/public/pages/ServicePages.tsx, PricingPage.tsx,
/// IndustryAndCasePages.tsx): every link written here is a link on the rendered page.
/// </summary>
public sealed partial class SeoPageResolver
{
    private LinkItem Consultation(string key = "agency.cta.primary") => new(_copy.Text(key), "/book-a-consultation");

    /// <summary>The closing call to action every agency page ends with: book a consultation, plus a lighter second action.</summary>
    private void ConsultationCta(List<ContentNode> c, string title, string? text, LinkItem? secondary = null)
    {
        c.Add(new ParagraphNode(_copy.Text("agency.cta.eyebrow")));
        c.Add(new HeadingNode(2, title));
        if (!string.IsNullOrWhiteSpace(text)) c.Add(new ParagraphNode(text));
        c.Add(new LinkListNode(new[] { Consultation(), secondary ?? new LinkItem(_copy.Text("agency.cta.secondary"), "/free-audit") }));
        c.Add(new ListNode(_copy.List("agency.cta.points")));
    }

    private void PairsSection(List<ContentNode> c, string prefix)
    {
        c.Add(new ParagraphNode(_copy.Text($"{prefix}.eyebrow")));
        c.Add(new HeadingNode(2, _copy.Text($"{prefix}.title")));
        if (_copy.Text($"{prefix}.intro") is { Length: > 0 } intro) c.Add(new ParagraphNode(intro));
        foreach (var (title, text) in _copy.Pairs($"{prefix}.points"))
        {
            c.Add(new HeadingNode(3, title));
            c.Add(new ParagraphNode(text));
        }
    }

    private static string Figure(MetricDto m) => $"{m.Value} ({m.Measurement.ToString().ToLowerInvariant()}{(string.IsNullOrWhiteSpace(m.Context) ? string.Empty : $"; {m.Context}")})";

    // ---------------------------------------------------------------- Listing pages

    private async Task<SeoPage> ServicesAsync(CancellationToken ct)
    {
        var page = CopyPage("/services");
        var c = page.Content;
        var groups = await site.ServicesAsync(ct);
        c.Add(new LinkListNode(new[] { Consultation(), new LinkItem(_copy.Text("services.hero.secondaryCta"), "/case-studies") }));
        if (groups.Count > 0)
            c.Add(new ParagraphNode(_copy.Text("services.hero.meta", ("lines", groups.Count.ToString(CultureInfo.InvariantCulture)),
                ("services", groups.Sum(g => g.Services.Count).ToString(CultureInfo.InvariantCulture)))));
        foreach (var g in groups)
        {
            c.Add(new HeadingNode(2, g.Name));
            if (!string.IsNullOrWhiteSpace(g.Description)) c.Add(new ParagraphNode(g.Description));
            c.Add(new LinkListNode(g.Services.Select(s => new LinkItem(s.Name, $"/services/{s.Slug}",
                s.StartingPrice is { } p ? $"{s.Tagline} From {Money(p.Amount, p.Currency)} {Period(p.BillingPeriod)}." : s.Tagline)).ToList()));
        }
        PairsSection(c, "services.approach");
        ConsultationCta(c, _copy.Text("services.cta.title"), _copy.Text("services.cta.text"));
        if (_seoLd.ItemList("Services", groups.SelectMany(g => g.Services).Select(s => (s.Name, $"/services/{s.Slug}")).ToList()) is { } list)
            page.JsonLd.Add(list);
        return AddCatalogVideos(page);
    }

    private async Task<SeoPage> PricingAsync(CancellationToken ct)
    {
        var page = CopyPage("/pricing", "WebPage");
        var c = page.Content;
        var pricing = await site.PricingAsync(ct);
        c.Add(new LinkListNode(new[] { Consultation(), new LinkItem(_copy.Text("pricing.hero.secondaryCta"), "/get-a-quote") }));
        foreach (var s in pricing.Services)
        {
            c.Add(new HeadingNode(2, s.Service.Name));
            c.Add(new ParagraphNode(s.Service.Tagline));
            c.Add(new FactsNode(s.Packages.Select(p => KeyValuePair.Create(p.Name, PackagePrice(p))).ToList()));
            c.Add(new ActionNode(_copy.Text("pricing.service.link", ("name", s.Service.Name)), $"/services/{s.Service.Slug}#pricing"));
        }
        PairsSection(c, "pricing.how");
        if (await CmsBlocksAsync("pricing", ct) is { } extra) c.AddRange(extra);
        ConsultationCta(c, _copy.Text("pricing.cta.title"), _copy.Text("pricing.cta.text"), new LinkItem(_copy.Text("pricing.hero.secondaryCta"), "/get-a-quote"));
        if (_seoLd.OfferCatalog(pricing.Services) is { } catalog) page.JsonLd.Add(catalog);
        return AddCatalogVideos(page);
    }

    private async Task<SeoPage> IndustriesAsync(CancellationToken ct)
    {
        var page = CopyPage("/industries");
        var c = page.Content;
        var items = await site.IndustriesAsync(ct);
        c.Add(new LinkListNode(new[] { Consultation(), new LinkItem(_copy.Text("industries.hero.secondaryCta"), "/case-studies") }));
        c.Add(new HeadingNode(2, _copy.Text("industries.list.title")));
        c.Add(new ParagraphNode(_copy.Text("industries.list.intro")));
        c.Add(new LinkListNode(items.Select(i => new LinkItem(i.Name, $"/industries/{i.Slug}", i.Summary)).ToList()));
        PairsSection(c, "industries.approach");
        ConsultationCta(c, _copy.Text("shared.cta.title"), _copy.Text("shared.cta.text"));
        if (_seoLd.ItemList("Industries", items.Select(i => (i.Name, $"/industries/{i.Slug}")).ToList()) is { } list) page.JsonLd.Add(list);
        return AddCatalogVideos(page);
    }

    private async Task<SeoPage> CaseStudiesAsync(IReadOnlyDictionary<string, string> query, CancellationToken ct)
    {
        var page = CopyPage("/case-studies");
        query.TryGetValue("service", out var service);
        query.TryGetValue("industry", out var industry);
        var items = await site.CaseStudiesAsync(service, industry, ct);
        // Filtered views are variations of the one list: canonical to it, crawlable but not indexed separately.
        if (service is not null || industry is not null)
        {
            page.NoIndex = true;
            page.Canonical = _ld.Url("/case-studies");
        }
        var c = page.Content;
        c.Add(new LinkListNode(new[] { Consultation() }));
        c.Add(new LinkListNode(items.Select(cs => new LinkItem(cs.Title, $"/case-studies/{cs.Slug}", $"{cs.ClientName}: {cs.Summary}")).ToList()));
        ConsultationCta(c, _copy.Text("shared.cta.title"), _copy.Text("shared.cta.text"));
        if (_seoLd.ItemList("Case studies", items.Select(cs => (cs.Title, $"/case-studies/{cs.Slug}")).ToList()) is { } list) page.JsonLd.Add(list);
        return AddCatalogVideos(page);
    }

    // ---------------------------------------------------------------- Detail pages

    private async Task<SeoPage> ServiceAsync(string slug, CancellationToken ct)
    {
        var s = await site.ServiceAsync(slug, ct);
        var page = NewPage($"/services/{slug}", s.Name, s.Tagline);
        page.Source = "Service";
        page.EditPath = "/agency/website/services";
        ApplySeo(page, s.Seo, s.JsonLd, s.Name);
        Crumbs(page, ("Services", "/services"), (s.Name, $"/services/{s.Slug}"));
        var quote = new LinkItem(_copy.Text("services.detail.quoteCta"), $"/get-a-quote?service={s.Slug}");
        var c = page.Content;
        c.Add(new ParagraphNode(s.CategoryName));
        c.Add(new HeadingNode(1, s.HeroTitle ?? s.Name));
        c.Add(new ParagraphNode(s.HeroBody ?? s.Tagline));
        c.Add(new LinkListNode(new[] { Consultation("services.detail.callCta"), quote }));
        if (s.HeroImageUrl is not null) c.Add(new ImageNode(s.HeroImageUrl, string.Empty, 640, 480, Priority: true));
        else
        {
            if (s.Kpis.Count > 0) { c.Add(new HeadingNode(2, _copy.Text("services.detail.kpisTitle"))); c.Add(new ListNode(s.Kpis)); }
            var from = s.Packages.Where(p => p.Price is not null && !p.IsCustomQuote).OrderBy(p => p.Price).FirstOrDefault();
            if (from is not null) c.Add(new ParagraphNode($"{_copy.Text("services.detail.startingFrom")} {Money(from.Price!.Value, from.Currency)} {Period(from.BillingPeriod)}"));
        }
        if (!string.IsNullOrWhiteSpace(s.OverviewMarkdown)) c.Add(new MarkdownNode(s.OverviewMarkdown));
        if (s.ProblemsSolved.Count > 0) { c.Add(new HeadingNode(2, _copy.Text("services.detail.problemsTitle"))); c.Add(new ListNode(s.ProblemsSolved, Ordered: true)); }
        if (s.Deliverables.Count > 0)
        {
            c.Add(new HeadingNode(2, _copy.Text("services.detail.includedTitle")));
            c.Add(new ListNode(s.Deliverables));
            if (s.Tools.Count > 0) { c.Add(new HeadingNode(3, _copy.Text("services.detail.toolsTitle"))); c.Add(new ListNode(s.Tools)); }
        }
        if (s.ProcessSteps.Count > 0)
        {
            c.Add(new HeadingNode(2, _copy.Text("services.detail.processTitle")));
            foreach (var step in s.ProcessSteps) { c.Add(new HeadingNode(3, step.Title)); c.Add(new ParagraphNode(step.Description)); }
        }
        if (s.Packages.Count > 0)
        {
            c.Add(new HeadingNode(2, _copy.Text("services.detail.pricingTitle")));
            c.Add(new ParagraphNode(_copy.Text("services.detail.pricingIntro")));
            foreach (var p in s.Packages)
            {
                c.Add(new HeadingNode(3, $"{p.Name}: {PackagePrice(p)}"));
                if (!string.IsNullOrWhiteSpace(p.Description)) c.Add(new ParagraphNode(p.Description));
                if (p.Features.Count > 0) c.Add(new ListNode(p.Features));
            }
        }
        if (s.CaseStudies.Count > 0)
        {
            c.Add(new HeadingNode(2, _copy.Text("services.detail.caseStudiesTitle")));
            c.Add(new LinkListNode(s.CaseStudies.Select(cs => new LinkItem(cs.Title, $"/case-studies/{cs.Slug}", cs.Summary)).ToList()));
            c.Add(new ActionNode(_copy.Text("services.detail.allCaseStudies"), $"/case-studies?service={s.Slug}"));
        }
        if (s.Testimonials.Count > 0)
        {
            c.Add(new HeadingNode(2, _copy.Text("services.detail.testimonialsTitle")));
            foreach (var t in s.Testimonials) c.Add(new QuoteNode(t.Quote, string.Join(", ", new[] { t.AuthorName, t.Company }.Where(x => !string.IsNullOrWhiteSpace(x)))));
        }
        if (s.Faqs.Count > 0)
        {
            c.Add(new HeadingNode(2, _copy.Text("services.detail.faqTitle")));
            foreach (var f in s.Faqs) c.Add(new QuestionNode(f.Question, f.Answer));
        }
        if (s.RelatedServices.Count > 0)
        {
            c.Add(new HeadingNode(2, _copy.Text("services.detail.relatedTitle")));
            c.Add(new LinkListNode(s.RelatedServices.Select(r => new LinkItem(r.Name, $"/services/{r.Slug}", r.Tagline)).ToList()));
        }
        ConsultationCta(c, _copy.Text("services.detail.ctaTitle", ("name", s.Name)), _copy.Text("services.detail.ctaText"), quote);
        page.ModifiedAt = await db.Set<AgencyService>().AsNoTracking().Where(x => x.Id == s.Id).Select(x => (DateTime?)x.UpdatedAt).FirstOrDefaultAsync(ct);
        return AddCatalogVideos(page);
    }

    private async Task<SeoPage> IndustryAsync(string slug, CancellationToken ct)
    {
        var i = await site.IndustryAsync(slug, ct);
        var page = NewPage($"/industries/{slug}", i.Name, i.Summary);
        page.Source = "Industry";
        page.EditPath = "/agency/website/industries";
        ApplySeo(page, i.Seo, i.JsonLd, i.Name);
        Crumbs(page, ("Industries", "/industries"), (i.Name, $"/industries/{i.Slug}"));
        var c = page.Content;
        c.Add(new ParagraphNode(_copy.Text("industries.hero.eyebrow")));
        c.Add(new HeadingNode(1, _copy.Text("industries.detail.title", ("name", i.Name))));
        c.Add(new ParagraphNode(i.Summary));
        c.Add(new LinkListNode(new[] { Consultation() }));
        if (i.HeroImageUrl is not null) c.Add(new ImageNode(i.HeroImageUrl, string.Empty, 640, 480, Priority: true));
        if (!string.IsNullOrWhiteSpace(i.BodyMarkdown)) c.Add(new MarkdownNode(i.BodyMarkdown));
        if (i.Challenges.Count > 0) { c.Add(new HeadingNode(2, _copy.Text("industries.detail.challengesTitle"))); c.Add(new ListNode(i.Challenges, Ordered: true)); }
        if (i.Services.Count > 0)
        {
            c.Add(new HeadingNode(2, _copy.Text("industries.detail.servicesTitle")));
            c.Add(new ParagraphNode(_copy.Text("industries.detail.servicesIntro", ("name", i.Name))));
            c.Add(new LinkListNode(i.Services.Select(s => new LinkItem(s.Name, $"/services/{s.Slug}", s.Tagline)).ToList()));
        }
        if (i.CaseStudies.Count > 0)
        {
            c.Add(new HeadingNode(2, _copy.Text("industries.detail.caseStudiesTitle", ("name", i.Name))));
            c.Add(new LinkListNode(i.CaseStudies.Select(cs => new LinkItem(cs.Title, $"/case-studies/{cs.Slug}", cs.Summary)).ToList()));
            c.Add(new ActionNode(_copy.Text("services.detail.allCaseStudies"), $"/case-studies?industry={i.Slug}"));
        }
        ConsultationCta(c, _copy.Text("industries.detail.ctaTitle", ("name", i.Name.ToLowerInvariant())), _copy.Text("shared.cta.text"));
        page.ModifiedAt = await db.Set<Industry>().AsNoTracking().Where(x => x.Slug == slug).Select(x => (DateTime?)x.UpdatedAt).FirstOrDefaultAsync(ct);
        return AddCatalogVideos(page);
    }

    private async Task<SeoPage> CaseStudyAsync(string slug, CancellationToken ct)
    {
        var cs = await site.CaseStudyAsync(slug, ct);
        var page = NewPage($"/case-studies/{slug}", cs.Title, cs.Summary);
        page.Source = "Case study";
        page.EditPath = "/agency/website/case-studies";
        page.OgType = "article";
        ApplySeo(page, cs.Seo, cs.JsonLd, cs.Title);
        Crumbs(page, ("Case studies", "/case-studies"), (cs.Title, $"/case-studies/{cs.Slug}"));
        page.PublishedAt = cs.PublishedAt;
        page.Section = "Case studies";
        var c = page.Content;
        c.Add(new ParagraphNode(string.Join(" · ", new[] { cs.ClientName, cs.IndustryName }.Where(x => !string.IsNullOrWhiteSpace(x)))));
        c.Add(new HeadingNode(1, cs.Title));
        c.Add(new ParagraphNode(cs.Summary));
        var facts = new List<KeyValuePair<string, string>> { KeyValuePair.Create(_copy.Text("caseStudies.detail.clientLabel"), cs.ClientName) };
        if (cs.IndustryName is not null) facts.Add(KeyValuePair.Create(_copy.Text("caseStudies.detail.industryLabel"), cs.IndustryName));
        if (cs.Services.Count > 0) facts.Add(KeyValuePair.Create(_copy.Text("caseStudies.detail.servicesLabel"), string.Join(", ", cs.Services.Select(s => s.Name))));
        if (cs.PublishedAt is { } published) facts.Add(KeyValuePair.Create(_copy.Text("caseStudies.detail.publishedLabel"), published.ToString("d MMMM yyyy", CultureInfo.InvariantCulture)));
        c.Add(new FactsNode(facts));
        if (cs.CoverImageUrl is not null) c.Add(new ImageNode(cs.CoverImageUrl, cs.Title, 1200, 675, Priority: true));
        if (cs.Metrics.Count > 0)
        {
            c.Add(new HeadingNode(2, _copy.Text("caseStudies.detail.resultsTitle")));
            if (cs.Metrics.Any(m => m.Measurement == MetricMeasurement.Estimated)) c.Add(new ParagraphNode(_copy.Text("caseStudies.detail.estimateNote")));
            c.Add(new FactsNode(cs.Metrics.Select(m => KeyValuePair.Create(m.Label, Figure(m))).ToList()));
        }
        void Part(string key, string? md)
        {
            if (string.IsNullOrWhiteSpace(md)) return;
            c.Add(new HeadingNode(2, _copy.Text(key)));
            c.Add(new MarkdownNode(md, 3));
        }
        Part("caseStudies.detail.challengeTitle", cs.ChallengeMarkdown);
        Part("caseStudies.detail.strategyTitle", cs.StrategyMarkdown);
        Part("caseStudies.detail.executionTitle", cs.ExecutionMarkdown);
        if (cs.TestimonialQuote is not null)
        {
            c.Add(new HeadingNode(2, _copy.Text("caseStudies.detail.quoteTitle")));
            c.Add(new QuoteNode(cs.TestimonialQuote, string.Join(", ", new[] { cs.TestimonialAuthor, cs.TestimonialRole }.Where(x => x is not null))));
        }
        foreach (var img in cs.GalleryImageUrls) page.Images.Add(new SeoImage(_ld.Url(img), cs.Title));
        if (cs.Services.Count > 0)
        {
            c.Add(new HeadingNode(2, _copy.Text("caseStudies.detail.servicesTitle")));
            c.Add(new LinkListNode(cs.Services.Select(s => new LinkItem(s.Name, $"/services/{s.Slug}", s.Tagline)).ToList()));
        }
        if (cs.Related.Count > 0)
        {
            c.Add(new HeadingNode(2, _copy.Text("caseStudies.detail.moreTitle")));
            c.Add(new LinkListNode(cs.Related.Select(r => new LinkItem(r.Title, $"/case-studies/{r.Slug}")).ToList()));
            c.Add(new ActionNode(_copy.Text("services.detail.allCaseStudies"), "/case-studies"));
        }
        ConsultationCta(c, _copy.Text("caseStudies.detail.ctaTitle"), _copy.Text("caseStudies.detail.ctaText"));
        page.ModifiedAt = await db.Set<CaseStudy>().AsNoTracking().Where(x => x.Slug == slug).Select(x => (DateTime?)x.UpdatedAt).FirstOrDefaultAsync(ct);
        return AddCatalogVideos(page);
    }
}
