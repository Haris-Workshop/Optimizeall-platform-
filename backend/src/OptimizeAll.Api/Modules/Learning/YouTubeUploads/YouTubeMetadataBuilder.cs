using System.Text.RegularExpressions;
using OptimizeAll.Domain.Learning;

namespace OptimizeAll.Api.Modules.Learning.YouTubeUploads;

/// <summary>
/// The YouTube title, description and tags of a lesson lecture, in the shape of the lecture studio's metadata
/// (tools/lecture-studio/studio/metadata.py): "Lecture | Course" title (≤ 100), a hook, the lesson and course links, the
/// module line, the AI-voice disclosure and tags (≤ 480 characters). Chapters are not listed: the planned scene times
/// are not the real video's timings.
/// </summary>
public static partial class YouTubeMetadataBuilder
{
    public const int TitleMax = 100;
    public const int DescriptionMax = 5000;
    public const int TagsMaxChars = 480;
    public const string CategoryEducation = "27";
    public const string AiVoiceDisclosure = "Narration uses an AI voice; script written and reviewed by Optimize All Academy.";

    [GeneratedRegex(@"(?<=[.!?])\s+")]
    private static partial Regex SentenceSplit();

    [GeneratedRegex("[:(]")]
    private static partial Regex CourseCut();

    [GeneratedRegex("[<>\"]")]
    private static partial Regex TagStrip();

    public static string Title(string lectureTitle, string courseTitle)
    {
        var full = $"{lectureTitle} | {courseTitle}";
        if (full.Length <= TitleMax) return full;
        var shortCourse = CourseCut().Split(courseTitle)[0].Trim();
        full = $"{lectureTitle} | {shortCourse}";
        if (full.Length <= TitleMax) return full;
        return lectureTitle.Length <= TitleMax ? lectureTitle : lectureTitle[..(TitleMax - 1)].TrimEnd() + "…";
    }

    public static string Description(CoursePack pack, PackLesson lesson, int moduleNumber, string moduleTitle, int lessonNumber, string lessonUrl, string courseUrl)
    {
        var first = (lesson.Lecture?.Scenes ?? new()).FirstOrDefault(s => s is not null)?.Narration ?? string.Empty;
        var hook = string.Join(' ', SentenceSplit().Split(first.Trim()).Take(3)).Trim();
        var lines = new List<string>();
        if (hook.Length > 0)
        {
            lines.Add(hook);
            lines.Add(string.Empty);
        }
        lines.Add($"Full lesson, code, knowledge check and certificate: {lessonUrl}");
        lines.Add($"Course: {pack.Title} — {courseUrl}");
        lines.Add(string.Empty);
        lines.Add($"Module {moduleNumber}: {moduleTitle} · Lesson {lessonNumber}");
        lines.Add(AiVoiceDisclosure);
        lines.Add(string.Empty);
        lines.Add("#OptimizeAll #OnlineLearning");
        var text = string.Join('\n', lines).Replace("<", "‹").Replace(">", "›"); // YouTube rejects angle brackets
        return text.Length <= DescriptionMax ? text : text[..(DescriptionMax - 1)];
    }

    public static IReadOnlyList<string> Tags(CoursePack pack, string lectureTitle)
    {
        var raw = new List<string> { "Optimize All Academy", pack.Title, lectureTitle };
        raw.AddRange(pack.Tools ?? new());
        raw.AddRange(pack.Skills ?? new());
        var category = (pack.Category ?? string.Empty).Trim();
        raw.Add(category.Length <= 3 ? category.ToUpperInvariant() : char.ToUpperInvariant(category[0]) + category[1..].ToLowerInvariant());
        raw.Add("online course");
        raw.Add("tutorial");
        var result = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var total = 0;
        foreach (var item in raw)
        {
            var tag = TagStrip().Replace(item ?? string.Empty, string.Empty).Trim();
            if (tag.Length > 60) tag = tag[..60];
            if (tag.Length == 0 || !seen.Add(tag)) continue;
            var cost = tag.Length + (tag.Contains(' ') ? 2 : 0) + 1;
            if (total + cost > TagsMaxChars) break;
            result.Add(tag);
            total += cost;
        }
        return result;
    }
}
