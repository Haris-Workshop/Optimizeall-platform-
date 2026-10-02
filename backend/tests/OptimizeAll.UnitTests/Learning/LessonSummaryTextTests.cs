using OptimizeAll.Api.Modules.Learning;
using Xunit;

namespace OptimizeAll.UnitTests.Learning;

/// <summary>A lesson's description text skips a leading callout repeated across a course (unique meta descriptions).</summary>
public sealed class LessonSummaryTextTests
{
    [Fact]
    public void A_leading_blockquote_is_left_out()
    {
        const string body = "> **Not legal advice.** Confirm with counsel.\n> Laws change.\n\n### From experiments to rules\n\nTeams adopted AI fast.";
        Assert.StartsWith("From experiments to rules", PublicLearningService.LessonSummaryText(body), StringComparison.Ordinal);
    }

    [Fact]
    public void A_body_without_a_leading_blockquote_is_unchanged()
    {
        const string body = "Intro paragraph.\n\n> A quote later on.";
        Assert.Equal(PublicLearningService.PlainText(body), PublicLearningService.LessonSummaryText(body));
    }

    [Fact]
    public void A_body_that_is_only_a_blockquote_keeps_it()
    {
        Assert.Contains("Only a note", PublicLearningService.LessonSummaryText("> Only a note."), StringComparison.Ordinal);
    }

    [Fact]
    public void The_catalog_has_no_two_lessons_with_the_same_description()
    {
        var seen = new Dictionary<string, string>();
        foreach (var pack in CoursePackLibrary.All.Where(f => f.Pack is not null).Select(f => f.Pack!))
            foreach (var (_, lesson) in pack.AllLessons)
            {
                var description = PublicLearningService.Truncate(PublicLearningService.LessonSummaryText(lesson.Body), PublicLearningService.SeoDescriptionMax);
                var where = $"{pack.Slug}/{lesson.Slug}";
                Assert.False(seen.TryGetValue(description, out var other), $"{where} has the same description as {other}: {description}");
                seen[description] = where;
            }
    }
}
