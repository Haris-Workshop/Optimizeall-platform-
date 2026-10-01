using Microsoft.EntityFrameworkCore;
using OptimizeAll.Api.Common.Audit;
using OptimizeAll.Api.Common.Persistence;
using OptimizeAll.Api.Modules.Accounts;
using OptimizeAll.Api.Modules.Files;
using OptimizeAll.Api.Modules.Learning.Admin;
using OptimizeAll.Api.Modules.Learning.Certificates;
using OptimizeAll.Domain.Common;
using OptimizeAll.Domain.Files;
using OptimizeAll.Domain.Learning;
using OptimizeAll.Infrastructure.Persistence;
using Microsoft.Extensions.Options;

namespace OptimizeAll.Api.Modules.Learning.YouTubeUploads;

/// <summary>A failure of the pipeline itself (not of the YouTube API), with a stable code and a plain-language message.</summary>
public sealed class YouTubeUploadException(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}

/// <summary>
/// Verifies that the connected Google account owns the expected channel before anything is uploaded. A successful check is
/// remembered for the life of the process; a mismatch (or any failure) is never remembered, so fixing the configuration or
/// re-authorizing takes effect on the next attempt.
/// </summary>
public sealed class YouTubeChannelGuard
{
    private volatile bool _verified;

    public async Task EnsureAsync(IYouTubeGateway gateway, string expectedChannelId, CancellationToken ct)
    {
        if (_verified) return;
        var channel = await gateway.GetChannelAsync(ct);
        if (!string.Equals(channel.Id, expectedChannelId, StringComparison.Ordinal))
            throw new YouTubeUploadException("channel_mismatch",
                $"The connected YouTube account is not the expected channel (expected channel id {expectedChannelId}). " +
                "Re-authorize the connection with the right channel, or correct YOUTUBE_CHANNEL_ID, then press Retry.");
        _verified = true;
    }
}

/// <summary>
/// Uploads lesson lectures to YouTube and links them into the lesson. A lesson has at most one upload row (unique index), the
/// background job claims a row with a conditional update (so two instances never upload the same file), transient failures
/// are retried with backoff, an exhausted daily quota only postpones the row, and the local file is deleted only after YouTube
/// confirmed the video.
/// </summary>
public sealed class YouTubeUploadService(
    AppDbContext db,
    IYouTubeGateway gateway,
    YouTubeChannelGuard guard,
    IOptions<YouTubeOptions> options,
    IFileStorage storage,
    CourseContentCache cache,
    LearningAdminService admin,
    LearningIssuerProvider issuers,
    IAuditLogger audit,
    IServiceScopeFactory scopes,
    TimeProvider clock,
    ILogger<YouTubeUploadService> logger)
{
    public static readonly TimeSpan UploadLease = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan PollLease = TimeSpan.FromMinutes(2);
    private const int MaxPendingPerTick = 3;
    private const int MaxPollsPerTick = 25;
    private const string PlaylistNoticePrefix = "Uploaded, but not added to the course playlist";

    private YouTubeOptions Options => options.Value;
    private DateTime Now => clock.GetUtcNow().UtcDateTime;

    // ---------------------------------------------------------------- admin reads

    public async Task<YouTubeStatusDto> StatusAsync(CancellationToken ct)
    {
        var o = Options;
        if (!o.Enabled) return new YouTubeStatusDto(false, o.MissingVariables, null, null, o.ChannelId, false, null);
        try
        {
            var channel = await gateway.GetChannelAsync(ct);
            return new YouTubeStatusDto(true, Array.Empty<string>(), channel.Id, channel.Title, o.ChannelId,
                string.Equals(channel.Id, o.ChannelId, StringComparison.Ordinal), null);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            var failure = YouTubeErrorMapper.Map(ex);
            logger.LogWarning("YouTube status check failed: {Kind} (HTTP {Status}, {Reason})", failure.Kind, failure.HttpStatus, failure.Reason);
            return new YouTubeStatusDto(true, Array.Empty<string>(), null, null, o.ChannelId, false, PlainMessage(failure));
        }
    }

    public async Task<CourseYouTubeDto> CourseAsync(Guid courseId, CancellationToken ct)
    {
        var playlist = await db.Set<Course>().AsNoTracking().Where(c => c.Id == courseId).Select(c => new { c.YouTubePlaylistId }).FirstOrDefaultAsync(ct)
                       ?? throw DomainException.NotFound("Course");
        var rows = await db.Set<LessonYouTubeUpload>().AsNoTracking().Where(u => u.CourseId == courseId).OrderBy(u => u.CreatedAt).ToListAsync(ct);
        return new CourseYouTubeDto(playlist.YouTubePlaylistId, rows.Select(YouTubeUploadDto.From).ToList());
    }

    // ---------------------------------------------------------------- enqueue / retry / resync

    public static DomainException NotConfigured() => DomainException.Conflict("youtube.not_configured",
        "Uploading lectures to YouTube is not set up yet. A developer must set " + string.Join(", ", YouTubeOptions.VariableNames) + " on the server.");

    private void EnsureConfigured()
    {
        if (!Options.Enabled) throw NotConfigured();
    }

    /// <summary>
    /// Checks that an upload can be taken for the lesson and returns the existing upload when one is already in progress or
    /// finished (idempotent), so the endpoint can answer before reading a large body.
    /// </summary>
    public async Task<YouTubeUploadDto?> PrepareAsync(Guid courseId, string lessonSlug, CancellationToken ct)
    {
        EnsureConfigured();
        var course = await db.Set<Course>().AsNoTracking().FirstOrDefaultAsync(c => c.Id == courseId, ct) ?? throw DomainException.NotFound("Course");
        await RequireVideoLessonAsync(course, lessonSlug, ct);
        var existing = await db.Set<LessonYouTubeUpload>().AsNoTracking().FirstOrDefaultAsync(u => u.CourseId == courseId && u.LessonSlug == lessonSlug, ct);
        return existing is not null && BlocksNewUpload(existing) ? YouTubeUploadDto.From(existing) : null;
    }

    private static bool BlocksNewUpload(LessonYouTubeUpload u) =>
        u.YouTubeVideoId is not null || u.Status is YouTubeUploadStatus.Pending or YouTubeUploadStatus.Uploading or YouTubeUploadStatus.Processing;

    public static YouTubePrivacy? ParsePrivacy(string? text) =>
        string.IsNullOrWhiteSpace(text) ? null
        : Enum.TryParse<YouTubePrivacy>(text.Trim(), ignoreCase: true, out var p) && Enum.IsDefined(p) && !int.TryParse(text.Trim(), out _) ? p
        : throw FieldRules.FieldError("youtube.invalid_privacy", "privacy", "Use private, unlisted or public.");

    /// <summary>
    /// Queues the staged files as the lesson's upload. Idempotent: when an upload is already running, waiting or finished the
    /// staged files are discarded and the existing upload is returned; a failed upload without a video is replaced.
    /// </summary>
    public async Task<YouTubeUploadDto> EnqueueAsync(Guid staffId, Guid courseId, string lessonSlug, StagedUpload staged, CancellationToken ct)
    {
        try
        {
            EnsureConfigured();
            var privacy = ParsePrivacy(staged.Privacy) ?? Options.DefaultPrivacy;
            var course = await db.Set<Course>().AsNoTracking().FirstOrDefaultAsync(c => c.Id == courseId, ct) ?? throw DomainException.NotFound("Course");
            var lesson = await RequireVideoLessonAsync(course, lessonSlug, ct);

            var existing = await db.Set<LessonYouTubeUpload>().FirstOrDefaultAsync(u => u.CourseId == courseId && u.LessonSlug == lessonSlug, ct);
            if (existing is not null && BlocksNewUpload(existing))
            {
                DiscardStaged(staged);
                return YouTubeUploadDto.From(existing);
            }

            var now = Now;
            var video = NewStoredFile(staged.Video, staffId, now);
            var thumbnail = staged.Thumbnail is null ? null : NewStoredFile(staged.Thumbnail, staffId, now);
            var posterId = thumbnail is null ? PosterFileId(lesson) : null; // the lecture poster doubles as the thumbnail
            db.Set<StoredFile>().Add(video);
            if (thumbnail is not null) db.Set<StoredFile>().Add(thumbnail);

            List<StoredFile> replaced = new();
            LessonYouTubeUpload row;
            if (existing is null)
            {
                row = new LessonYouTubeUpload { CourseId = courseId, LessonSlug = lessonSlug, RequestedByUserId = staffId };
                db.Set<LessonYouTubeUpload>().Add(row);
            }
            else
            {
                row = existing;
                replaced = await OwnedFilesAsync(existing, ct);
                db.Set<StoredFile>().RemoveRange(replaced);
                row.YouTubeVideoId = null;
                row.PlaylistItemAdded = false;
                row.ActualPrivacy = null;
                row.UploadedAt = null;
                row.RequestedByUserId = staffId;
            }
            row.StoredFileId = video.Id;
            row.ThumbnailFileId = thumbnail?.Id ?? posterId;
            row.FileName = video.OriginalFileName;
            row.Privacy = privacy;
            row.PublishAfterReady = staged.Publish;
            ResetToPending(row);
            audit.Record("learning.youtube_upload_requested", nameof(LessonYouTubeUpload), row.Id, null,
                new { courseId, lessonSlug, privacy = privacy.ToString(), publish = staged.Publish, video.SizeBytes, video.Sha256 });
            try
            {
                await db.SaveChangesAsync(ct);
            }
            catch (DbUpdateException ex) when (DatabaseErrors.IsUniqueViolation(ex))
            {
                // A concurrent request created the lesson's row first: that upload wins.
                db.ChangeTracker.Clear();
                DiscardStaged(staged);
                var winner = await db.Set<LessonYouTubeUpload>().AsNoTracking().FirstAsync(u => u.CourseId == courseId && u.LessonSlug == lessonSlug, ct);
                return YouTubeUploadDto.From(winner);
            }
            DeleteBlobs(replaced);
            logger.LogInformation("YouTube upload queued for lesson {LessonSlug} of course {CourseId} (upload {UploadId}, {Bytes} bytes)", lessonSlug, courseId, row.Id, video.SizeBytes);
            return YouTubeUploadDto.From(row);
        }
        catch
        {
            DiscardStaged(staged);
            throw;
        }
    }

    public async Task<YouTubeUploadDto> RetryAsync(Guid staffId, Guid courseId, string lessonSlug, CancellationToken ct)
    {
        EnsureConfigured();
        var row = await LoadRowAsync(courseId, lessonSlug, ct);
        if (row.Status != YouTubeUploadStatus.Failed)
            throw DomainException.Conflict("youtube.not_failed", "Only a failed upload can be retried.");
        if (row.ErrorCode is "processing_failed" or "video_not_found") // the video on YouTube is unusable: send the file again
        {
            row.YouTubeVideoId = null;
            row.PlaylistItemAdded = false;
            row.ActualPrivacy = null;
        }
        if (row.YouTubeVideoId is null && row.StoredFileId is null)
            throw DomainException.Conflict("youtube.file_missing", "The video file is no longer stored. Upload it again.");
        row.UploadAttempts = 0;
        row.Notice = null;
        ResetToPending(row);
        audit.Record("learning.youtube_upload_retried", nameof(LessonYouTubeUpload), row.Id, null, new { courseId, lessonSlug });
        await db.SaveChangesAsync(ct);
        return YouTubeUploadDto.From(row);
    }

    /// <summary>Re-reads the video from YouTube and repairs status, privacy and notice (links the lesson once embedding is allowed).</summary>
    public async Task<YouTubeUploadDto> ResyncAsync(Guid staffId, Guid courseId, string lessonSlug, CancellationToken ct)
    {
        EnsureConfigured();
        var row = await LoadRowAsync(courseId, lessonSlug, ct);
        if (row.YouTubeVideoId is null)
            throw DomainException.Conflict("youtube.no_video", "This lesson has no YouTube video yet.");
        if (row.Status is YouTubeUploadStatus.Uploading or YouTubeUploadStatus.Pending)
            throw DomainException.Conflict("youtube.busy", "The upload is still being sent to YouTube. Try again in a moment.");
        var before = new { status = row.Status.ToString(), actual = row.ActualPrivacy?.ToString(), row.Notice };
        row.Status = YouTubeUploadStatus.Processing;
        row.Error = null;
        row.ErrorCode = null;
        row.NextAttemptAt = null;
        if (row.Notice?.StartsWith(PlaylistNoticePrefix, StringComparison.Ordinal) == true) row.Notice = null;
        await ContinueAsync(row, ct);
        audit.Record("learning.youtube_upload_resynced", nameof(LessonYouTubeUpload), row.Id, before, new { status = row.Status.ToString(), actual = row.ActualPrivacy?.ToString(), row.Notice });
        await db.SaveChangesAsync(ct);
        return YouTubeUploadDto.From(row);
    }

    // ---------------------------------------------------------------- background job

    /// <summary>One pass of the job: polls videos YouTube is processing, then uploads due Pending rows.</summary>
    public async Task<string> ProcessDueAsync(CancellationToken ct)
    {
        if (!Options.Enabled) return "YouTube uploads are not configured";
        var now = Now;
        // A worker that died mid-upload leaves its row Uploading with an expired lease: queue it again (the attempt counts).
        var reclaimed = await db.Set<LessonYouTubeUpload>().Where(u => u.Status == YouTubeUploadStatus.Uploading && u.LeaseUntil < now)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.Status, YouTubeUploadStatus.Pending).SetProperty(u => u.LeaseUntil, (DateTime?)null)
                .SetProperty(u => u.UploadAttempts, u => u.UploadAttempts + 1).SetProperty(u => u.ConcurrencyStamp, Guid.NewGuid()), ct);

        var polling = await db.Set<LessonYouTubeUpload>().AsNoTracking()
            .Where(u => u.Status == YouTubeUploadStatus.Processing && (u.NextAttemptAt == null || u.NextAttemptAt <= now) && (u.LeaseUntil == null || u.LeaseUntil < now))
            .OrderBy(u => u.CreatedAt).Select(u => u.Id).Take(MaxPollsPerTick).ToListAsync(ct);
        var due = await db.Set<LessonYouTubeUpload>().AsNoTracking()
            .Where(u => u.Status == YouTubeUploadStatus.Pending && (u.NextAttemptAt == null || u.NextAttemptAt <= now))
            .OrderBy(u => u.CreatedAt).Select(u => u.Id).Take(MaxPendingPerTick).ToListAsync(ct);

        var processed = 0;
        foreach (var id in polling.Concat(due))
        {
            ct.ThrowIfCancellationRequested();
            db.ChangeTracker.Clear();
            try
            {
                if (await ProcessOneAsync(id, ct)) processed++;
            }
            catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
            {
                logger.LogError(ex, "YouTube upload {UploadId} failed unexpectedly", id);
            }
        }
        return $"{processed} upload(s) processed ({polling.Count} polled, {due.Count} queued), {reclaimed} reclaimed";
    }

    private async Task<bool> ProcessOneAsync(Guid id, CancellationToken ct)
    {
        var now = Now;
        var leaseUntil = now.Add(UploadLease);
        var claimed = await db.Set<LessonYouTubeUpload>()
            .Where(u => u.Id == id && u.Status == YouTubeUploadStatus.Pending && (u.NextAttemptAt == null || u.NextAttemptAt <= now))
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.Status, YouTubeUploadStatus.Uploading).SetProperty(u => u.LeaseUntil, leaseUntil)
                .SetProperty(u => u.ConcurrencyStamp, Guid.NewGuid()), ct);
        if (claimed == 0)
        {
            var pollUntil = now.Add(PollLease);
            claimed = await db.Set<LessonYouTubeUpload>()
                .Where(u => u.Id == id && u.Status == YouTubeUploadStatus.Processing && (u.NextAttemptAt == null || u.NextAttemptAt <= now) && (u.LeaseUntil == null || u.LeaseUntil < now))
                .ExecuteUpdateAsync(s => s.SetProperty(u => u.LeaseUntil, pollUntil).SetProperty(u => u.ConcurrencyStamp, Guid.NewGuid()), ct);
        }
        if (claimed == 0) return false; // another worker has it

        var row = await db.Set<LessonYouTubeUpload>().FirstAsync(u => u.Id == id, ct);
        try
        {
            if (row.YouTubeVideoId is null)
            {
                if (row.UploadAttempts >= YouTubeSchedule.MaxAttempts)
                {
                    Fail(row, "upload_failed", "YouTube could not be reached after several tries. Press Retry to try again.");
                }
                else if (!await UploadAsync(row, ct))
                {
                    await db.SaveChangesAsync(CancellationToken.None);
                    return true;
                }
            }
            if (row.Status != YouTubeUploadStatus.Failed) await ContinueAsync(row, ct);
            await db.SaveChangesAsync(ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // Shutting down: hand the row back so the next start picks it up without losing an attempt.
            if (row.YouTubeVideoId is null) row.Status = YouTubeUploadStatus.Pending;
            row.LeaseUntil = null;
            await db.SaveChangesAsync(CancellationToken.None);
            throw;
        }
        return true;
    }

    /// <summary>Sends the file to YouTube. Returns true when the video id was stored (status Processing); false when the row was postponed or failed.</summary>
    private async Task<bool> UploadAsync(LessonYouTubeUpload row, CancellationToken ct)
    {
        try
        {
            await guard.EnsureAsync(gateway, Options.ChannelId!, ct);
            var file = row.StoredFileId is { } fileId ? await db.Set<StoredFile>().AsNoTracking().FirstOrDefaultAsync(f => f.Id == fileId, ct) : null;
            await using var content = file is null ? null : storage.OpenRead(file.StorageKey);
            if (content is null)
            {
                Fail(row, "upload_failed", "The video file is no longer stored. Upload it again.");
                return false;
            }
            var metadata = await BuildMetadataAsync(row, ct);
            using var stop = CancellationTokenSource.CreateLinkedTokenSource(ct);
            var heartbeat = HeartbeatAsync(row.Id, stop.Token);
            string videoId;
            try
            {
                videoId = await gateway.UploadVideoAsync(content, metadata, _ => { }, ct);
            }
            finally
            {
                await stop.CancelAsync();
                await heartbeat;
            }
            row.YouTubeVideoId = videoId;
            row.Status = YouTubeUploadStatus.Processing;
            row.LeaseUntil = null;
            row.NextAttemptAt = null;
            row.Error = null;
            row.ErrorCode = null;
            row.UploadAttempts++;
            await db.SaveChangesAsync(CancellationToken.None); // the video exists on YouTube now: remember it before anything else
            logger.LogInformation("YouTube accepted upload {UploadId} for lesson {LessonSlug} as video {VideoId}", row.Id, row.LessonSlug, videoId);
            return true;
        }
        catch (YouTubeUploadException ex)
        {
            logger.LogWarning("YouTube upload {UploadId} stopped: {Code}", row.Id, ex.Code);
            Fail(row, ex.Code, ex.Message);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            HandleUploadFailure(row, YouTubeErrorMapper.Map(ex));
        }
        return false;
    }

    private void HandleUploadFailure(LessonYouTubeUpload row, YouTubeApiException failure)
    {
        logger.LogWarning("YouTube upload {UploadId} failed: {Kind} (HTTP {Status}, {Reason}), attempt {Attempts}", row.Id, failure.Kind, failure.HttpStatus, failure.Reason, row.UploadAttempts + 1);
        switch (failure.Kind)
        {
            case YouTubeApiErrorKind.QuotaExceeded:
                Postpone(row);
                break;
            case YouTubeApiErrorKind.InvalidGrant:
                Fail(row, "invalid_grant", PlainMessage(failure));
                break;
            case YouTubeApiErrorKind.Transient or YouTubeApiErrorKind.RateLimited:
                row.UploadAttempts++;
                if (row.UploadAttempts >= YouTubeSchedule.MaxAttempts)
                {
                    Fail(row, "upload_failed", $"YouTube could not be reached after {YouTubeSchedule.MaxAttempts} tries. Press Retry to try again later.");
                }
                else
                {
                    row.Status = YouTubeUploadStatus.Pending;
                    row.LeaseUntil = null;
                    row.NextAttemptAt = Now + YouTubeSchedule.Backoff(row.UploadAttempts, Random.Shared.NextDouble());
                    row.ErrorCode = "upload_failed";
                    row.Error = $"YouTube had a temporary problem. The upload will be retried automatically (try {row.UploadAttempts} of {YouTubeSchedule.MaxAttempts} failed).";
                }
                break;
            default:
                row.UploadAttempts++;
                Fail(row, failure.Kind == YouTubeApiErrorKind.Forbidden ? "forbidden" : "upload_failed", PlainMessage(failure));
                break;
        }
    }

    /// <summary>The daily quota is used up: wait for the reset without consuming an attempt.</summary>
    private void Postpone(LessonYouTubeUpload row)
    {
        var resetAt = YouTubeSchedule.NextQuotaReset(Now);
        if (row.YouTubeVideoId is null) row.Status = YouTubeUploadStatus.Pending;
        row.LeaseUntil = null;
        row.NextAttemptAt = resetAt;
        row.ErrorCode = "quota_exceeded";
        row.Error = $"YouTube's daily quota is used up. The upload continues automatically after the quota resets (about {resetAt:yyyy-MM-dd HH:mm} UTC).";
    }

    private void Fail(LessonYouTubeUpload row, string code, string message)
    {
        row.Status = YouTubeUploadStatus.Failed;
        row.LeaseUntil = null;
        row.NextAttemptAt = null;
        row.ErrorCode = code;
        row.Error = message;
        audit.RecordSystem("learning.youtube_upload_failed", nameof(LessonYouTubeUpload), row.Id, new { row.CourseId, row.LessonSlug, code });
    }

    /// <summary>Keeps the row's lease alive while a long upload runs.</summary>
    private async Task HeartbeatAsync(Guid id, CancellationToken ct)
    {
        try
        {
            using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1));
            while (await timer.WaitForNextTickAsync(ct))
            {
                using var scope = scopes.CreateScope();
                var scopedDb = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var until = Now.Add(UploadLease);
                await scopedDb.Set<LessonYouTubeUpload>().Where(u => u.Id == id && u.Status == YouTubeUploadStatus.Uploading)
                    .ExecuteUpdateAsync(s => s.SetProperty(u => u.LeaseUntil, until), ct);
            }
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Could not extend the lease of YouTube upload {UploadId}", id);
        }
    }

    // ---------------------------------------------------------------- after the upload

    /// <summary>
    /// Everything after YouTube has the video: the course playlist, the optional thumbnail, YouTube's processing result and,
    /// when it is ready and embeddable, the link into the lesson. The caller saves the row.
    /// </summary>
    private async Task ContinueAsync(LessonYouTubeUpload row, CancellationToken ct)
    {
        var videoId = row.YouTubeVideoId!;
        row.Status = YouTubeUploadStatus.Processing;
        row.LeaseUntil = null;
        try
        {
            if (!row.PlaylistItemAdded && row.Notice?.StartsWith(PlaylistNoticePrefix, StringComparison.Ordinal) != true)
                await AddToPlaylistAsync(row, videoId, ct);
            if (row.ThumbnailFileId is not null) await SetThumbnailAsync(row, videoId, ct);

            var status = await gateway.GetVideoStatusAsync(videoId, ct);
            row.Error = null;
            row.ErrorCode = null;
            row.NextAttemptAt = null;
            switch (status.State)
            {
                case YouTubeProcessingState.Failed:
                    Fail(row, "processing_failed", status.FailureReason ?? "YouTube could not process the video.");
                    return;
                case YouTubeProcessingState.Missing:
                    Fail(row, "video_not_found", "YouTube no longer lists this video (it may have been deleted). Press Retry to upload it again.");
                    return;
                case YouTubeProcessingState.Processing:
                    return;
            }
            await FinishAsync(row, status.Privacy ?? row.Privacy, ct);
        }
        catch (Exception ex) when (ex is YouTubeApiException or YouTubeUploadException or HttpRequestException or IOException or TimeoutException)
        {
            if (ex is YouTubeUploadException own)
            {
                Fail(row, own.Code, own.Message);
                return;
            }
            var failure = YouTubeErrorMapper.Map(ex);
            logger.LogWarning("YouTube upload {UploadId} could not be advanced: {Kind} (HTTP {Status}, {Reason})", row.Id, failure.Kind, failure.HttpStatus, failure.Reason);
            switch (failure.Kind)
            {
                case YouTubeApiErrorKind.QuotaExceeded:
                    Postpone(row);
                    break;
                case YouTubeApiErrorKind.InvalidGrant:
                    Fail(row, "invalid_grant", PlainMessage(failure));
                    break;
                default: // temporary: keep Processing and look again on the next tick
                    row.Error = PlainMessage(failure);
                    row.ErrorCode = "upload_failed";
                    break;
            }
        }
    }

    private async Task AddToPlaylistAsync(LessonYouTubeUpload row, string videoId, CancellationToken ct)
    {
        var course = await db.Set<Course>().AsNoTracking().FirstAsync(c => c.Id == row.CourseId, ct);
        var doc = await LatestDocumentAsync(course, ct);
        var links = new LearningLinks((await issuers.GetAsync(ct)).BaseUrl);
        var courseUrl = links.Absolute(LearningLinks.CoursePath(doc.Pack.Slug));
        try
        {
            await guard.EnsureAsync(gateway, Options.ChannelId!, ct);
            var playlistId = await gateway.EnsurePlaylistAsync(course.YouTubePlaylistId, doc.Pack.Title,
                $"Video lectures for the Optimize All Academy course {doc.Pack.Title}. {courseUrl}", row.Privacy, ct);
            if (playlistId != course.YouTubePlaylistId)
            {
                // Not through SaveChanges: the course's concurrency stamp belongs to the course editor.
                await db.Set<Course>().Where(c => c.Id == course.Id).ExecuteUpdateAsync(s => s.SetProperty(c => c.YouTubePlaylistId, playlistId), ct);
            }
            var order = doc.LessonsBySlug.TryGetValue(row.LessonSlug, out var me) ? me.Index : int.MaxValue;
            var earlier = await db.Set<LessonYouTubeUpload>().AsNoTracking().Where(u => u.CourseId == row.CourseId && u.PlaylistItemAdded && u.Id != row.Id)
                .Select(u => u.LessonSlug).ToListAsync(ct);
            var position = earlier.Count(slug => doc.LessonsBySlug.TryGetValue(slug, out var other) && other.Index < order);
            await gateway.AddToPlaylistAsync(playlistId, videoId, position, ct);
            row.PlaylistItemAdded = true;
        }
        catch (YouTubeApiException ex) when (ex.Kind is YouTubeApiErrorKind.Forbidden or YouTubeApiErrorKind.Other)
        {
            // The video is on YouTube; a playlist problem must not fail the lecture.
            logger.LogWarning("YouTube upload {UploadId} was not added to the course playlist: {Kind} (HTTP {Status}, {Reason})", row.Id, ex.Kind, ex.HttpStatus, ex.Reason);
            row.Notice = $"{PlaylistNoticePrefix} ({PlainMessage(ex)}). Add it in YouTube Studio if you want it there.";
        }
    }

    private async Task SetThumbnailAsync(LessonYouTubeUpload row, string videoId, CancellationToken ct)
    {
        var file = await db.Set<StoredFile>().AsNoTracking().FirstOrDefaultAsync(f => f.Id == row.ThumbnailFileId, ct);
        var usable = file is not null && file.ContentType is "image/png" or "image/jpeg";
        if (usable)
        {
            await using var image = storage.OpenRead(file!.StorageKey);
            if (image is not null)
            {
                try
                {
                    await gateway.SetThumbnailAsync(videoId, image, file.ContentType, ct);
                }
                catch (YouTubeApiException ex) when (ex.Kind is YouTubeApiErrorKind.Forbidden or YouTubeApiErrorKind.Other)
                {
                    logger.LogWarning("Thumbnail of YouTube upload {UploadId} was refused: {Kind} (HTTP {Status}, {Reason})", row.Id, ex.Kind, ex.HttpStatus, ex.Reason);
                    row.Notice = "YouTube did not accept the thumbnail (custom thumbnails need a verified channel); set it in YouTube Studio.";
                }
            }
        }
        // Done (or not usable): the thumbnail is never retried. A lecture poster is a public lesson asset and stays.
        if (file is { Purpose: FilePurpose.LessonYouTubeSource })
        {
            var tracked = await db.Set<StoredFile>().FirstOrDefaultAsync(f => f.Id == file.Id, ct);
            if (tracked is not null)
            {
                db.Set<StoredFile>().Remove(tracked);
                DeleteBlobs(new List<StoredFile> { tracked });
            }
        }
        row.ThumbnailFileId = null;
    }

    /// <summary>YouTube finished processing: record the result, link the lesson when embedding is allowed, then drop the local file.</summary>
    private async Task FinishAsync(LessonYouTubeUpload row, YouTubePrivacy actual, CancellationToken ct)
    {
        row.ActualPrivacy = actual;
        row.UploadedAt ??= Now;
        var embeddable = actual is YouTubePrivacy.Unlisted or YouTubePrivacy.Public;
        string? notice;
        if (embeddable)
        {
            await db.SaveChangesAsync(ct); // keep the row consistent before the lesson update runs its own transaction
            var linked = await LinkLessonAsync(row, ct);
            if (linked is { Retry: true }) return; // the course changed under us: try again on the next tick, status stays Processing
            notice = linked?.Notice;
        }
        else if (row.Privacy != YouTubePrivacy.Private)
        {
            notice = "YouTube kept this video Private (the API project is not yet audited); publish it from YouTube Studio or after Google approves the audit";
        }
        else
        {
            notice = "The video is Private on YouTube, so it is not linked into the lesson page. Make it Unlisted or Public in YouTube Studio, then press Resync.";
        }
        if (row.Notice?.StartsWith(PlaylistNoticePrefix, StringComparison.Ordinal) == true) notice = notice is null ? row.Notice : row.Notice + " " + notice;
        row.Notice = notice;
        row.Status = YouTubeUploadStatus.Ready;
        row.Error = null;
        row.ErrorCode = null;
        row.NextAttemptAt = null;
        row.LeaseUntil = null;
        // YouTube confirmed the video: the local copy is no longer needed.
        var owned = await OwnedFilesAsync(row, ct);
        db.Set<StoredFile>().RemoveRange(owned);
        row.StoredFileId = null;
        row.ThumbnailFileId = null;
        audit.RecordSystem("learning.youtube_upload_ready", nameof(LessonYouTubeUpload), row.Id,
            new { row.CourseId, row.LessonSlug, row.YouTubeVideoId, actualPrivacy = actual.ToString(), linked = embeddable && notice is null });
        await db.SaveChangesAsync(ct);
        DeleteBlobs(owned);
        logger.LogInformation("YouTube upload {UploadId} for lesson {LessonSlug} is ready (privacy {Privacy})", row.Id, row.LessonSlug, actual);
    }

    private sealed record LinkOutcome(bool Retry, string? Notice);

    /// <summary>Writes the YouTube watch URL into the lesson (a new course version, published when requested); null when nothing was needed.</summary>
    private async Task<LinkOutcome?> LinkLessonAsync(LessonYouTubeUpload row, CancellationToken ct)
    {
        var watchUrl = YouTube.WatchUrl(row.YouTubeVideoId!);
        try
        {
            var course = await db.Set<Course>().AsNoTracking().FirstOrDefaultAsync(c => c.Id == row.CourseId, ct);
            if (course is null) return new LinkOutcome(false, "The course no longer exists, so the video was not linked.");
            var doc = await LatestDocumentAsync(course, ct);
            if (!doc.LessonsBySlug.TryGetValue(row.LessonSlug, out var lessonRef))
                return new LinkOutcome(false, "The lesson no longer exists, so the video was not linked.");
            var lesson = lessonRef.Lesson;
            var currentSrc = lesson.Lecture?.Src ?? lesson.Video?.Src;
            if (string.Equals(currentSrc, watchUrl, StringComparison.Ordinal)) return null;
            var request = new LessonVideoRequest
            {
                Src = watchUrl,
                Poster = lesson.Lecture?.Poster ?? lesson.Video?.Poster,
                Captions = lesson.Lecture?.Captions ?? lesson.Video?.Captions,
                PublishedAt = Now.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture),
                Publish = row.PublishAfterReady,
                ConcurrencyStamp = course.ConcurrencyStamp,
            };
            await admin.SetLessonVideoAsync(row.RequestedByUserId, row.CourseId, row.LessonSlug, request, ct);
            return null;
        }
        catch (DomainException ex) when (ex.Code == "concurrency.conflict")
        {
            DetachCourseEntities();
            return new LinkOutcome(true, null);
        }
        catch (DbUpdateConcurrencyException)
        {
            DetachCourseEntities();
            return new LinkOutcome(true, null);
        }
        catch (DomainException ex)
        {
            DetachCourseEntities();
            logger.LogWarning("YouTube upload {UploadId} could not be linked into its lesson: {Code}", row.Id, ex.Code);
            return new LinkOutcome(false, "Uploaded to YouTube, but the lesson could not be updated: " + ex.Message);
        }
    }

    // ---------------------------------------------------------------- helpers

    /// <summary>Drops what a failed lesson update left in the change tracker, keeping this service's own rows.</summary>
    private void DetachCourseEntities()
    {
        foreach (var entry in db.ChangeTracker.Entries().ToList())
            if (entry.Entity is not LessonYouTubeUpload and not StoredFile) entry.State = EntityState.Detached;
    }

    private async Task<LessonYouTubeUpload> LoadRowAsync(Guid courseId, string lessonSlug, CancellationToken ct) =>
        await db.Set<LessonYouTubeUpload>().FirstOrDefaultAsync(u => u.CourseId == courseId && u.LessonSlug == lessonSlug, ct)
        ?? throw DomainException.NotFound("YouTubeUpload");

    private static void ResetToPending(LessonYouTubeUpload row)
    {
        row.Status = YouTubeUploadStatus.Pending;
        row.Error = null;
        row.ErrorCode = null;
        row.NextAttemptAt = null;
        row.LeaseUntil = null;
    }

    private StoredFile NewStoredFile(StagedFile file, Guid ownerId, DateTime now) => new()
    {
        OwnerUserId = ownerId,
        Purpose = FilePurpose.LessonYouTubeSource,
        StorageKey = file.StorageKey,
        ContentType = file.ContentType,
        SizeBytes = file.SizeBytes,
        Sha256 = file.Sha256,
        OriginalFileName = file.FileName,
        CreatedAt = now,
        IsPublic = false,
    };

    /// <summary>The stored files this upload owns (never a lecture poster, which belongs to the lesson).</summary>
    private async Task<List<StoredFile>> OwnedFilesAsync(LessonYouTubeUpload row, CancellationToken ct)
    {
        var ids = new[] { row.StoredFileId, row.ThumbnailFileId }.Where(i => i is not null).Select(i => i!.Value).ToList();
        if (ids.Count == 0) return new List<StoredFile>();
        return await db.Set<StoredFile>().Where(f => ids.Contains(f.Id) && f.Purpose == FilePurpose.LessonYouTubeSource).ToListAsync(ct);
    }

    private void DeleteBlobs(IEnumerable<StoredFile> files)
    {
        foreach (var file in files)
        {
            try { storage.Delete(file.StorageKey); }
            catch (IOException ex) { logger.LogWarning(ex, "Could not delete stored file {FileId}", file.Id); }
        }
    }

    private void DiscardStaged(StagedUpload staged)
    {
        foreach (var file in new[] { staged.Video, staged.Thumbnail })
        {
            if (file is null) continue;
            try { storage.Delete(file.StorageKey); } catch (IOException) { }
        }
    }

    private static Guid? PosterFileId(PackLesson lesson)
    {
        var poster = lesson.Lecture?.Poster ?? lesson.Video?.Poster;
        const string prefix = "/api/v1/files/";
        return poster is not null && poster.StartsWith(prefix, StringComparison.Ordinal) && Guid.TryParse(poster[prefix.Length..], out var id) ? id : null;
    }

    private async Task<CourseDocument> LatestDocumentAsync(Course course, CancellationToken ct) =>
        await cache.GetAsync(db, course.LatestVersionId ?? course.PublishedVersionId ?? throw DomainException.NotFound("CourseVersion"), ct);

    private async Task<PackLesson> RequireVideoLessonAsync(Course course, string lessonSlug, CancellationToken ct)
    {
        var doc = await LatestDocumentAsync(course, ct);
        if (!doc.LessonsBySlug.TryGetValue(lessonSlug, out var lessonRef)) throw DomainException.NotFound("Lesson");
        var lesson = lessonRef.Lesson;
        if (lesson.Lecture is null && (lesson.TypeValue != LessonType.Video || lesson.Video is null))
            throw DomainException.Conflict("learning.not_a_video_lesson", "Only video lessons have a video; change the lesson type in the course editor first.");
        return lesson;
    }

    private async Task<YouTubeVideoMetadata> BuildMetadataAsync(LessonYouTubeUpload row, CancellationToken ct)
    {
        var course = await db.Set<Course>().AsNoTracking().FirstAsync(c => c.Id == row.CourseId, ct);
        var doc = await LatestDocumentAsync(course, ct);
        var lessonRef = doc.LessonsBySlug[row.LessonSlug];
        var links = new LearningLinks((await issuers.GetAsync(ct)).BaseUrl);
        var lessonUrl = links.Absolute(LearningLinks.LessonPath(doc.Pack.Slug, row.LessonSlug));
        var courseUrl = links.Absolute(LearningLinks.CoursePath(doc.Pack.Slug));
        var lectureTitle = lessonRef.Lesson.Lecture?.Title ?? lessonRef.Lesson.Title;
        var moduleNumber = (doc.Pack.Modules ?? new()).IndexOf(lessonRef.Module) + 1;
        return new YouTubeVideoMetadata(
            YouTubeMetadataBuilder.Title(lectureTitle, doc.Pack.Title),
            YouTubeMetadataBuilder.Description(doc.Pack, lessonRef.Lesson, Math.Max(moduleNumber, 1), lessonRef.Module.Title, lessonRef.Index + 1, lessonUrl, courseUrl),
            YouTubeMetadataBuilder.Tags(doc.Pack, lectureTitle),
            YouTubeMetadataBuilder.CategoryEducation,
            row.Privacy);
    }

    /// <summary>What an admin reads about a failed call: plain language, no credentials, no raw error text.</summary>
    public static string PlainMessage(YouTubeApiException failure) => failure.Kind switch
    {
        YouTubeApiErrorKind.InvalidGrant =>
            "The YouTube connection is no longer authorized. An administrator must re-authorize it (create a new YouTube refresh token and set it as YOUTUBE_REFRESH_TOKEN), then press Retry.",
        YouTubeApiErrorKind.QuotaExceeded => "YouTube's daily quota is used up; it resets at midnight Pacific time.",
        YouTubeApiErrorKind.RateLimited => "YouTube asked us to slow down; this is retried automatically.",
        YouTubeApiErrorKind.Transient => "YouTube could not be reached or had a temporary problem; this is retried automatically.",
        YouTubeApiErrorKind.Forbidden => "YouTube refused the request: the connected account may not be allowed to do this (check the channel and the granted permissions).",
        _ => "YouTube rejected the request" + (failure.HttpStatus is { } status ? $" (HTTP {status})." : "."),
    };
}
