using OptimizeAll.Domain.Common;

namespace OptimizeAll.Domain.Learning;

/// <summary>Where a lesson lecture is in the upload-to-YouTube pipeline.</summary>
public enum YouTubeUploadStatus
{
    /// <summary>Queued (or waiting for a retry / the daily quota reset, see <see cref="LessonYouTubeUpload.NextAttemptAt"/>).</summary>
    Pending,
    /// <summary>A worker holds the lease and is sending the file to YouTube.</summary>
    Uploading,
    /// <summary>The file is on YouTube and YouTube is still processing it.</summary>
    Processing,
    /// <summary>YouTube finished processing; the lesson links the video when the privacy allows embedding.</summary>
    Ready,
    /// <summary>The upload stopped for a reason in <see cref="LessonYouTubeUpload.Error"/>; an admin can retry it.</summary>
    Failed,
}

public enum YouTubePrivacy
{
    Private,
    Unlisted,
    Public,
}

/// <summary>
/// The automatic YouTube upload of one lesson's lecture video. A lesson has at most one row (unique on course + lesson
/// slug), which makes enqueueing idempotent. The uploaded file waits in private storage (<see cref="StoredFileId"/>) until
/// YouTube confirmed it, then it is deleted.
/// </summary>
public class LessonYouTubeUpload : AuditedEntity, IConcurrencyStamped
{
    public Guid CourseId { get; set; }
    public string LessonSlug { get; set; } = string.Empty;
    /// <summary>The uploaded video in private storage; null once it was deleted after a confirmed upload.</summary>
    public Guid? StoredFileId { get; set; }
    /// <summary>Optional thumbnail image (a stored file); removed with the video.</summary>
    public Guid? ThumbnailFileId { get; set; }
    /// <summary>The original file name, kept for the admin list after the file itself is gone.</summary>
    public string FileName { get; set; } = string.Empty;
    public Guid RequestedByUserId { get; set; }
    public YouTubePrivacy Privacy { get; set; } = YouTubePrivacy.Unlisted;
    /// <summary>Publish the course version that links the video once YouTube finished processing.</summary>
    public bool PublishAfterReady { get; set; }
    public YouTubeUploadStatus Status { get; set; } = YouTubeUploadStatus.Pending;
    /// <summary>The 11-character YouTube video id once the upload finished.</summary>
    public string? YouTubeVideoId { get; set; }
    /// <summary>Plain-language reason for a failure (or the reason an upload is waiting); never contains secrets.</summary>
    public string? Error { get; set; }
    /// <summary>quota_exceeded, invalid_grant, channel_mismatch, upload_failed, processing_failed, ...</summary>
    public string? ErrorCode { get; set; }
    /// <summary>Something an admin should know although the upload succeeded (e.g. YouTube kept the video Private).</summary>
    public string? Notice { get; set; }
    public DateTime? UploadedAt { get; set; }
    public int UploadAttempts { get; set; }
    /// <summary>UTC. The job does not touch a Pending row before this time.</summary>
    public DateTime? NextAttemptAt { get; set; }
    /// <summary>UTC. While in the future, the worker that set <see cref="YouTubeUploadStatus.Uploading"/> owns the row.</summary>
    public DateTime? LeaseUntil { get; set; }
    /// <summary>UTC. When the row last entered Processing; a video that stays there for 24 hours is failed (processing_timeout).</summary>
    public DateTime? ProcessingSince { get; set; }
    /// <summary>How many polls found the video still processing or could not read its status (drives the polling back-off).</summary>
    public int PollAttempts { get; set; }
    /// <summary>True once a request that may create the video on YouTube has been sent: a re-attempt first looks for that video (by the marker in its description) instead of uploading again.</summary>
    public bool UploadMayExist { get; set; }
    public bool PlaylistItemAdded { get; set; }
    /// <summary>The privacy YouTube reports for the video (it can differ from <see cref="Privacy"/> for unaudited API projects).</summary>
    public YouTubePrivacy? ActualPrivacy { get; set; }
    public Guid ConcurrencyStamp { get; set; } = Guid.NewGuid();
}
