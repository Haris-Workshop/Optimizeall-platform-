using OptimizeAll.Domain.Learning;

namespace OptimizeAll.Api.Modules.Learning.YouTubeUploads;

public sealed record YouTubeChannel(string Id, string Title);

/// <summary>What YouTube is told about an uploaded video.</summary>
public sealed record YouTubeVideoMetadata(string Title, string Description, IReadOnlyList<string> Tags, string CategoryId, YouTubePrivacy Privacy);

public enum YouTubeProcessingState
{
    /// <summary>YouTube is still working on the video.</summary>
    Processing,
    /// <summary>The video is processed and playable.</summary>
    Succeeded,
    /// <summary>YouTube failed or rejected the video; <see cref="YouTubeVideoStatus.FailureReason"/> says why.</summary>
    Failed,
    /// <summary>YouTube does not list the video (deleted, or not owned by the connected channel).</summary>
    Missing,
}

public sealed record YouTubeVideoStatus(string VideoId, YouTubeProcessingState State, YouTubePrivacy? Privacy, string? FailureReason);

/// <summary>
/// The YouTube Data API calls the lecture pipeline needs. Production: <see cref="GoogleYouTubeGateway"/>; tests replace it
/// with a fake. Failures are reported as <see cref="YouTubeApiException"/>.
/// </summary>
public interface IYouTubeGateway
{
    /// <summary>The channel the refresh token belongs to (channels.list mine=true).</summary>
    Task<YouTubeChannel> GetChannelAsync(CancellationToken ct);

    /// <summary>Returns <paramref name="existingPlaylistId"/> when that playlist still exists, otherwise creates a playlist and returns its id.</summary>
    Task<string> EnsurePlaylistAsync(string? existingPlaylistId, string title, string description, YouTubePrivacy privacy, CancellationToken ct);

    /// <summary>Resumable upload of <paramref name="content"/> (streamed, never buffered whole); returns the new video id.</summary>
    Task<string> UploadVideoAsync(Stream content, YouTubeVideoMetadata metadata, Action<long> onProgress, CancellationToken ct);

    Task<YouTubeVideoStatus> GetVideoStatusAsync(string videoId, CancellationToken ct);

    /// <summary>Adds the video to the playlist at the zero-based <paramref name="position"/>.</summary>
    Task AddToPlaylistAsync(string playlistId, string videoId, int position, CancellationToken ct);

    Task SetThumbnailAsync(string videoId, Stream image, string contentType, CancellationToken ct);
}

public enum YouTubeApiErrorKind
{
    /// <summary>The daily API quota (or daily upload limit) is used up until the quota resets.</summary>
    QuotaExceeded,
    /// <summary>The refresh token was revoked or expired: an admin must re-authorize the connection.</summary>
    InvalidGrant,
    /// <summary>Too many requests right now (retry later).</summary>
    RateLimited,
    /// <summary>A server error or network problem (retry).</summary>
    Transient,
    /// <summary>The connected account may not do this (401/403 other than quota).</summary>
    Forbidden,
    Other,
}

/// <summary>A YouTube API failure with a plain-language message that never contains credentials.</summary>
public sealed class YouTubeApiException(YouTubeApiErrorKind kind, int? httpStatus, string message, string? reason = null, Exception? inner = null)
    : Exception(message, inner)
{
    public YouTubeApiErrorKind Kind { get; } = kind;
    public int? HttpStatus { get; } = httpStatus;
    /// <summary>YouTube's machine reason (e.g. quotaExceeded), for logs.</summary>
    public string? Reason { get; } = reason;
}
