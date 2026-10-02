using System.Text.RegularExpressions;
using OptimizeAll.Api.Modules.Website.Seed;
using OptimizeAll.Domain.Website;

namespace OptimizeAll.UnitTests.Website;

/// <summary>
/// Editorial rules for the partner blog posts seeded by <see cref="PartnerContentSeeder"/>: SEO lengths, unique slugs and
/// primary keywords, alt text, the disclosure line, at most three partner links, and only known internal links.
/// </summary>
public sealed partial class PartnerPostLibraryTests
{
    private static IReadOnlyList<PartnerPost> Posts => PartnerPostLibrary.All;

    /// <summary>The nineteen posts that shipped first must always remain (the seeder is insert-only, so they are live).</summary>
    private static readonly string[] OriginalSlugs =
    {
        "what-is-project-controls", "earned-value-management-explained", "ai-in-project-controls",
        "how-to-become-a-project-controls-professional", "dscr-vs-llcr-vs-plcr", "ppp-and-concession-structures-explained",
        "agile-vs-hybrid-project-delivery-with-ai", "choosing-a-project-management-certification",
        "spaced-repetition-and-active-recall-for-exams", "how-to-use-an-ai-study-coach", "how-to-pass-the-cpa-exam",
        "cma-exam-study-plan", "cia-exam-preparation-guide", "cisa-exam-preparation-guide", "cfa-exam-study-strategies",
        "pmp-exam-prep-pmbok-7", "nclex-ngn-question-types", "nclex-rn-vs-nclex-pn", "how-to-prepare-for-pci-ai-exams",
    };

    [Fact]
    public void The_original_posts_remain_and_the_library_covers_the_three_clusters()
    {
        var slugs = Posts.Select(p => p.Slug).ToHashSet(StringComparer.Ordinal);
        Assert.All(OriginalSlugs, s => Assert.Contains(s, slugs));
        Assert.True(Posts.Count(p => p.Cluster == "pci-ai") >= 8);
        Assert.True(Posts.Count(p => p.Cluster == "certuvo") >= 10);
        Assert.NotEmpty(Posts.Where(p => p.Cluster == "cross"));
        Assert.All(Posts, p => Assert.Contains(p.Cluster, new[] { "pci-ai", "certuvo", "cross" }));
    }

    [Fact]
    public void Slugs_and_primary_keywords_are_unique()
    {
        Assert.Equal(Posts.Count, Posts.Select(p => p.Slug).Distinct(StringComparer.Ordinal).Count());
        Assert.Equal(Posts.Count, Posts.Select(p => p.PrimaryKeyword.ToLowerInvariant()).Distinct().Count());
        Assert.All(Posts, p => Assert.Matches("^[a-z0-9]+(-[a-z0-9]+)*$", p.Slug));
    }

    [Fact]
    public void Titles_and_descriptions_fit_search_result_limits()
    {
        Assert.All(Posts, p =>
        {
            Assert.InRange(p.Title.Length, 20, 60);
            Assert.InRange(p.Description.Length, 70, 155);
        });
    }

    [Fact]
    public void Every_post_has_a_cover_with_alt_text_categories_tags_and_a_past_publish_date()
    {
        var categorySlugs = PartnerPostLibrary.Categories.Select(c => c.Slug).ToHashSet();
        Assert.All(Posts, p =>
        {
            Assert.False(string.IsNullOrWhiteSpace(p.CoverAlt));
            Assert.True(p.CoverAlt.Length >= 20, p.Slug);
            Assert.True(PartnerPostLibrary.CoverBytes(p.Cover).Length > 0);
            Assert.NotNull(OptimizeAll.Domain.Files.ImageInspector.Inspect(PartnerPostLibrary.CoverBytes(p.Cover)));
            Assert.NotEmpty(p.Categories);
            Assert.All(p.Categories, c => Assert.Contains(c, categorySlugs));
            Assert.InRange(p.Tags.Count, 1, 12);
            Assert.All(p.Tags, t => Assert.Matches("^[a-z0-9 -]{1,40}$", t));
            Assert.InRange(p.PublishedDaysAgo, 1, 90);
            Assert.Equal(Posts.Count, Posts.Select(x => x.PublishedDaysAgo).Distinct().Count()); // staggered: one post per day
        });
    }

    [Fact]
    public void Every_post_ends_with_the_disclosure_and_has_an_faq_section()
    {
        Assert.All(Posts, p =>
        {
            Assert.EndsWith("*" + PartnerPostLibrary.Disclosure + "*", p.Body);
            Assert.Contains("## Frequently asked questions", p.Body);
            var faqs = p.Body[p.Body.IndexOf("## Frequently asked questions", StringComparison.Ordinal)..]
                .Split('\n').Count(l => l.StartsWith("### ", StringComparison.Ordinal));
            Assert.InRange(faqs, 3, 5);
        });
    }

    [Fact]
    public void Bodies_are_long_form_and_survive_sanitization_unchanged()
    {
        Assert.All(Posts, p =>
        {
            var words = MarkdownSanitizer.ToPlainText(p.Body).Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;
            Assert.True(words is >= 1200 and <= 2400, $"{p.Slug}: {words} words");
            Assert.Equal(p.Body.Replace("\r\n", "\n").Trim(), MarkdownSanitizer.Sanitize(p.Body));
            Assert.DoesNotMatch(@"(?m)^# ", p.Body); // the page renders the title as the only h1
        });
    }

    [Fact]
    public void Partner_links_are_at_most_three_and_point_only_to_the_partner_sites()
    {
        Assert.All(Posts, p =>
        {
            var external = Links(p.Body).Where(u => u.StartsWith("http", StringComparison.Ordinal)).ToList();
            Assert.All(external, u => Assert.StartsWith("https://", u));
            var hosts = external.Select(u => new Uri(u).Host).ToList();
            Assert.All(hosts, h => Assert.Contains(h, PartnerPostLibrary.PartnerHosts));
            Assert.InRange(external.Count, 1, 3);
        });
    }

    [Fact]
    public void Internal_links_point_to_known_courses_partner_pages_or_other_partner_posts()
    {
        var slugs = Posts.Select(p => p.Slug).ToHashSet(StringComparer.Ordinal);
        Assert.All(Posts, p =>
        {
            var internalLinks = Links(p.Body).Where(u => u.StartsWith('/')).ToList();
            Assert.Contains(internalLinks, u => u.StartsWith("/learn/", StringComparison.Ordinal));
            Assert.Contains(internalLinks, u => PartnerPostLibrary.PartnerPages.Contains(u));
            Assert.All(internalLinks, u =>
            {
                var valid = PartnerPostLibrary.PartnerPages.Contains(u)
                            || PartnerPostLibrary.Downloads.Contains(u)
                            || (u.StartsWith("/learn/", StringComparison.Ordinal) && PartnerPostLibrary.CourseSlugs.Contains(u["/learn/".Length..]))
                            || (u.StartsWith("/blog/", StringComparison.Ordinal) && slugs.Contains(u["/blog/".Length..]) && u != "/blog/" + p.Slug);
                Assert.True(valid, $"{p.Slug}: unknown internal link {u}");
            });
            Assert.All(p.Related, r => Assert.Contains(r, slugs));
        });
    }

    [Fact]
    public void Every_free_pdf_guide_exists_in_the_web_app_and_is_linked_from_at_least_two_posts()
    {
        var root = new DirectoryInfo(AppContext.BaseDirectory);
        while (root is not null && !Directory.Exists(Path.Combine(root.FullName, "frontend", "public"))) root = root.Parent;
        Assert.All(PartnerPostLibrary.Downloads, d =>
        {
            Assert.Matches("^/downloads/[a-z0-9-]+\\.pdf$", d);
            Assert.True(Posts.Count(p => p.Body.Contains("](" + d + ")", StringComparison.Ordinal)) >= 2, $"{d} is linked from fewer than two posts");
            if (root is null) return; // tests running outside the repository (packaged): the file check needs the sources
            var file = new FileInfo(Path.Combine(root.FullName, "frontend", "public", d.TrimStart('/')));
            Assert.True(file.Exists, $"{d} is missing from frontend/public");
            Assert.InRange(file.Length, 10_000, 1_000_000);
            using var stream = file.OpenRead();
            var head = new byte[5];
            stream.ReadExactly(head);
            Assert.Equal("%PDF-"u8.ToArray(), head);
        });
    }

    [Fact]
    public void Certuvo_cluster_posts_link_the_certuvo_page_and_pci_ai_posts_link_the_pci_ai_page()
    {
        Assert.All(Posts.Where(p => p.Cluster == "certuvo"), p => Assert.Contains("](/partners/certuvo)", p.Body));
        Assert.All(Posts.Where(p => p.Cluster == "pci-ai"), p => Assert.Contains("](/partners/pci-ai)", p.Body));
        Assert.All(Posts.Where(p => p.Cluster == "cross"), cross =>
        {
            Assert.Contains("](/partners/pci-ai)", cross.Body);
            Assert.Contains("](/partners/certuvo)", cross.Body);
        });
    }

    [Fact]
    public void Front_matter_problems_are_reported_with_the_file_name()
    {
        var ex = Assert.Throws<InvalidOperationException>(() => PartnerPostLibrary.Parse("broken.md", "---\nslug: x\n---\nBody"));
        Assert.Contains("broken.md", ex.Message);
        Assert.Throws<InvalidOperationException>(() => PartnerPostLibrary.Parse("none.md", "No front matter"));
    }

    private static IEnumerable<string> Links(string markdown) =>
        LinkRegex().Matches(markdown).Select(m => m.Groups["url"].Value);

    [GeneratedRegex(@"\[[^\]]*\]\((?<url>[^)\s]+)\)")]
    private static partial Regex LinkRegex();
}
