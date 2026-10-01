using OptimizeAll.Domain.Learning;

namespace OptimizeAll.Api.Modules.Learning.YouTubeUploads;

/// <summary>The YouTube connection as the admin sees it. Never contains credentials.</summary>
public sealed record YouTubeStatusDto(bool Configured, IReadOnlyList<string> MissingVariables, string? ChannelId, string? ChannelTitle,
    string? ExpectedChannelId, bool ChannelMatches, string? Error);

/// <summary>One lesson's upload. <see cref="Privacy"/> is private | unlisted | public; <see cref="Status"/> is Pending | Uploading | Processing | Ready | Failed.</summary>
public sealed record YouTubeUploadDto(string LessonSlug, string Status, string Privacy, string? ActualPrivacy, string? VideoId, string? WatchUrl,
    string? Error, string? ErrorCode, string? Notice, DateTime? UploadedAt, int Attempts, DateTime? NextAttemptAt, string? FileName, bool PublishAfterReady)
{
    public static YouTubeUploadDto From(LessonYouTubeUpload u) => new(u.LessonSlug, u.Status.ToString(), PrivacyText(u.Privacy), u.ActualPrivacy is { } a ? PrivacyText(a) : null,
        u.YouTubeVideoId, u.YouTubeVideoId is null ? null : YouTube.WatchUrl(u.YouTubeVideoId), u.Error, u.ErrorCode, u.Notice, u.UploadedAt,
        u.UploadAttempts, u.NextAttemptAt, string.IsNullOrEmpty(u.FileName) ? null : u.FileName, u.PublishAfterReady);

    public static string PrivacyText(YouTubePrivacy p) => p.ToString().ToLowerInvariant();
}

public sealed record CourseYouTubeDto(string? PlaylistId, IReadOnlyList<YouTubeUploadDto> Uploads);
