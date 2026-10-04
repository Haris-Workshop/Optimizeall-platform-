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
/// Uploads lesson lectures to YouTube and links them into the lesson. A lesson has at most one upload row (unique index).
/// Two background jobs share the work and never block each other: <see cref="YouTubeUploadJob"/> claims Pending rows and
/// sends the files, <see cref="YouTubeProcessingJob"/> follows videos YouTube is processing (playlist, thumbnail, status,
/// the link into the lesson) and cleans up. Rows are claimed with conditional updates and leases, so two instances never
/// upload the same file; an upload whose response was lost is found again by a marker in the video description instead of
/// being sent twice; transient failures are retried with backoff; an exhausted daily quota only postpones the row; and the
/// local file is deleted only after YouTube confirmed the video.
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
    private static readonly TimeSpan PollLease = TimeSpan.FromMinutes(2);
    /// <summary>A video that is still Processing after this long is failed (processing_timeout); Re-sync picks it up again.</summary>
    public static readonly TimeSpan ProcessingTimeout = TimeSpan.FromHours(24);
    /// <summary>The wait before the next look at a video that is still processing: 1, 2, 5, then every 10 minutes.</summary>
    private static readonly int[] PollBackoffMinutes = { 1, 2, 5, 10 };
    /// <summary>A failed upload's file is deleted after this long (the row stays, with errorCode file_expired).</summary>
    public static readonly TimeSpan FailedFileRetention = TimeSpan.FromDays(14);
    private static readonly TimeSpan OrphanFileAge = TimeSpan.FromDays(1);
    private const int MaxPendingPerTick = 3;
    private const int MaxPollsPerTick = 25;
    private const int MaxCleanupPerTick = 50;

    private const string PlaylistNotice = "Uploaded, but not added to the course playlist";
    private const string PositionNotice = "Could not read the playlist";
    private const string ThumbnailRefusedNotice = "YouTube did not accept the thumbnail";
    private const string NoThumbnailNotice = "No thumbnail was set";
    private static readonly string[] StickyNotices = { PlaylistNotice, PositionNotice, ThumbnailRefusedNotice, NoThumbnailNotice };
    private const string ForcedPrivateNotice = "YouTube kept this video Private (the API project is not yet audited); publish it from YouTube Studio or after Google approves the audit";
    private const string PrivateNotice = "The video is Private on YouTube, so it is not linked into the lesson page. Make it Unlisted or Public in YouTube Studio, then press Resync.";

    private YouTubeOptions Options => options.Value;
    private DateTime Now => clock.GetUtcNow().UtcDateTime;
    private TimeSpan UploadLease => TimeSpan.FromSeconds(Options.UploadLeaseSeconds);

    /// <summary>The line that ties a video on YouTube to its upload row (see <see cref="IYouTubeGateway.FindUploadByMarkerAsync"/>).</summary>
    public static string Marker(Guid uploadId) => $"optimizeall-upload:{uploadId}";

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
    /// staged files are discarded and the existing upload is returned; a failed upload without a video is replaced (with its
    /// attempts and notices reset, so the new file is really sent).
    /// </summary>
    public async Task<YouTubeUploadDto> EnqueueAsync(Guid staffId, Guid courseId, string lessonSlug, StagedUpload staged, CancellationToken ct)
    {
        var committed = false;
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
            Guid? posterId = null;
            string? thumbnailNotice = null;
            if (thumbnail is null && PosterFileId(lesson) is { } candidate)
            {
                // The lecture poster doubles as the thumbnail, but only when it really is an image of the lessons' own media.
                if (await IsPosterImageAsync(candidate, ct)) posterId = candidate;
                else thumbnailNotice = NoThumbnailNotice + ": the lecture poster is not an image from the lesson media.";
            }
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
            row.UploadMayExist = false; // a new file: nothing of an earlier attempt belongs to it
            ResetToPending(row);
            row.Notice = thumbnailNotice;
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
            committed = true;
            // The row is saved and references the new files: nothing after this point may remove them.
            DeleteBlobs(replaced);
            logger.LogInformation("YouTube upload queued for lesson {LessonSlug} of course {CourseId} (upload {UploadId}, {Bytes} bytes)", lessonSlug, courseId, row.Id, video.SizeBytes);
            return YouTubeUploadDto.From(row);
        }
        catch when (!committed)
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
            row.UploadMayExist = false; // the earlier video is known to be unusable: do not adopt it
        }
        if (row.YouTubeVideoId is null && row.StoredFileId is null)
            throw DomainException.Conflict("youtube.file_missing", "The video file is no longer stored. Upload it again.");
        ResetToPending(row);
        if (row.YouTubeVideoId is not null)
        {
            // The video is already on YouTube: pick up where it stopped (the processing job), no new upload.
            row.Status = YouTubeUploadStatus.Processing;
            row.ProcessingSince = Now;
        }
        audit.Record("learning.youtube_upload_retried", nameof(LessonYouTubeUpload), row.Id, null, new { courseId, lessonSlug });
        await db.SaveChangesAsync(ct);
        return YouTubeUploadDto.From(row);
    }

    /// <summary>
    /// Re-reads the video from YouTube and repairs status, privacy and notice (links the lesson once embedding is allowed).
    /// Takes the same lease as the job's poll, so it never works on a row the job is working on (409 youtube.busy).
    /// </summary>
    public async Task<YouTubeUploadDto> ResyncAsync(Guid staffId, Guid courseId, string lessonSlug, CancellationToken ct)
    {
        EnsureConfigured();
        var existing = await db.Set<LessonYouTubeUpload>().AsNoTracking().FirstOrDefaultAsync(u => u.CourseId == courseId && u.LessonSlug == lessonSlug, ct)
                       ?? throw DomainException.NotFound("YouTubeUpload");
        if (existing.YouTubeVideoId is null)
            throw DomainException.Conflict("youtube.no_video", "This lesson has no YouTube video yet.");
        var busy = DomainException.Conflict("youtube.busy", "The video is being worked on right now. Try again in a moment.");
        if (existing.Status is YouTubeUploadStatus.Uploading or YouTubeUploadStatus.Pending) throw busy;

        var now = Now;
        var until = now.Add(PollLease);
        var claimed = await db.Set<LessonYouTubeUpload>()
            .Where(u => u.Id == existing.Id && u.Status != YouTubeUploadStatus.Uploading && u.Status != YouTubeUploadStatus.Pending && u.YouTubeVideoId != null &&
                        (u.LeaseUntil == null || u.LeaseUntil < now))
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.LeaseUntil, until).SetProperty(u => u.ConcurrencyStamp, Guid.NewGuid()), ct);
        if (claimed == 0) throw busy;

        var row = await db.Set<LessonYouTubeUpload>().FirstAsync(u => u.Id == existing.Id, ct);
        var before = new { status = row.Status.ToString(), actual = row.ActualPrivacy?.ToString(), row.Notice };
        row.Status = YouTubeUploadStatus.Processing;
        row.ProcessingSince = now;
        row.PollAttempts = 0;
        row.Error = null;
        row.ErrorCode = null;
        row.NextAttemptAt = null;
        RemoveNotice(row, PlaylistNotice);
        try
        {
            await ContinueAsync(row, ct);
            audit.Record("learning.youtube_upload_resynced", nameof(LessonYouTubeUpload), row.Id, before, new { status = row.Status.ToString(), actual = row.ActualPrivacy?.ToString(), row.Notice });
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw busy;
        }
        return YouTubeUploadDto.From(row);
    }

    // ---------------------------------------------------------------- upload job

    /// <summary>One pass of the upload job: claims due Pending rows (without a video yet) and sends their files.</summary>
    public async Task<string> ProcessUploadsAsync(CancellationToken ct)
    {
        if (!Options.Enabled) return "YouTube uploads are not configured";
        var now = Now;
        // A worker that died mid-upload leaves its row Uploading with an expired lease: queue it again (the attempt counts).
        var reclaimed = await db.Set<LessonYouTubeUpload>().Where(u => u.Status == YouTubeUploadStatus.Uploading && u.LeaseUntil < now)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.Status, YouTubeUploadStatus.Pending).SetProperty(u => u.LeaseUntil, (DateTime?)null)
                .SetProperty(u => u.UploadAttempts, u => u.UploadAttempts + 1).SetProperty(u => u.ConcurrencyStamp, Guid.NewGuid()), ct);

        var due = await db.Set<LessonYouTubeUpload>().AsNoTracking()
            .Where(u => u.Status == YouTubeUploadStatus.Pending && u.YouTubeVideoId == null && (u.NextAttemptAt == null || u.NextAttemptAt <= now))
            .OrderBy(u => u.CreatedAt).Select(u => u.Id).Take(MaxPendingPerTick).ToListAsync(ct);

        var processed = 0;
        foreach (var id in due)
        {
            ct.ThrowIfCancellationRequested();
            db.ChangeTracker.Clear();
            try
            {
                if (await UploadOneAsync(id, ct)) processed++;
            }
            catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
            {
                logger.LogError(ex, "YouTube upload {UploadId} failed unexpectedly", id);
            }
        }
        return $"{processed} upload(s) processed ({due.Count} queued), {reclaimed} reclaimed";
    }

    private async Task<bool> UploadOneAsync(Guid id, CancellationToken ct)
    {
        var now = Now;
        var claimStamp = Guid.NewGuid();
        var leaseUntil = now.Add(UploadLease);
        var claimed = await db.Set<LessonYouTubeUpload>()
            .Where(u => u.Id == id && u.Status == YouTubeUploadStatus.Pending && u.YouTubeVideoId == null && (u.NextAttemptAt == null || u.NextAttemptAt <= now))
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.Status, YouTubeUploadStatus.Uploading).SetProperty(u => u.LeaseUntil, leaseUntil)
                .SetProperty(u => u.ConcurrencyStamp, claimStamp), ct);
        if (claimed == 0) return false; // another worker has it

        var row = await db.Set<LessonYouTubeUpload>().FirstAsync(u => u.Id == id, ct);
        try
        {
            if (row.UploadAttempts >= YouTubeSchedule.MaxAttempts)
            {
                Fail(row, "upload_failed", "YouTube could not be reached after several tries. Press Retry to try again.");
                await db.SaveChangesAsync(CancellationToken.None);
                return true;
            }
            if (await UploadAsync(row, claimStamp, ct) != UploadOutcome.LostLease)
                await db.SaveChangesAsync(CancellationToken.None);
        }
        catch (DbUpdateConcurrencyException)
        {
            // Somebody else changed the row meanwhile (a reclaim after a lost lease): never fail the upload because of that.
            logger.LogWarning("YouTube upload {UploadId} was changed by another worker while it was being processed", id);
            db.ChangeTracker.Clear();
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // Shutting down: hand the row back so the next start picks it up without losing an attempt.
            if (row.YouTubeVideoId is null) row.Status = YouTubeUploadStatus.Pending;
            row.LeaseUntil = null;
            try { await db.SaveChangesAsync(CancellationToken.None); } catch (DbUpdateConcurrencyException) { }
            throw;
        }
        return true;
    }

    private enum UploadOutcome { Recorded, Changed, LostLease }

    /// <summary>
    /// Sends the file to YouTube (or adopts a video an earlier attempt already created). <see cref="UploadOutcome.Recorded"/>:
    /// the video id is saved (Processing); <see cref="UploadOutcome.Changed"/>: the row was postponed or failed (the caller
    /// saves it); <see cref="UploadOutcome.LostLease"/>: another worker owns the row now, nothing is saved.
    /// </summary>
    private async Task<UploadOutcome> UploadAsync(LessonYouTubeUpload row, Guid claimStamp, CancellationToken ct)
    {
        try
        {
            await guard.EnsureAsync(gateway, Options.ChannelId!, ct);
            var file = row.StoredFileId is { } fileId ? await db.Set<StoredFile>().AsNoTracking().FirstOrDefaultAsync(f => f.Id == fileId, ct) : null;
            await using var content = file is null ? null : storage.OpenRead(file.StorageKey);
            if (content is null)
            {
                Fail(row, "upload_failed", "The video file is no longer stored. Upload it again.");
                return UploadOutcome.Changed;
            }
            var metadata = await BuildMetadataAsync(row, ct);

            // An earlier attempt may have reached YouTube although its answer was lost: look for its video before sending again.
            if (row.UploadMayExist && await gateway.FindUploadByMarkerAsync(Marker(row.Id), ct) is { } adopted)
            {
                logger.LogInformation("YouTube upload {UploadId} adopted the video {VideoId} an earlier attempt had created", row.Id, adopted);
                return await RecordVideoAsync(row, adopted, adoptedExisting: true);
            }
            await MarkUploadStartedAsync(row, ct);

            using var lostLease = CancellationTokenSource.CreateLinkedTokenSource(ct);
            using var stopBeat = new CancellationTokenSource();
            var beat = RunHeartbeatAsync(TimeSpan.FromSeconds(Options.HeartbeatSeconds), ExtendLeaseAsync(row.Id, claimStamp), lostLease.Cancel, logger, stopBeat.Token);
            string videoId;
            try
            {
                videoId = await gateway.UploadVideoAsync(content, metadata, _ => { }, lostLease.Token);
            }
            catch (OperationCanceledException) when (lostLease.IsCancellationRequested && !ct.IsCancellationRequested)
            {
                logger.LogWarning("YouTube upload {UploadId} lost its lease and was stopped; another worker owns the row", row.Id);
                return UploadOutcome.LostLease;
            }
            finally
            {
                await stopBeat.CancelAsync();
                await beat;
            }
            return await RecordVideoAsync(row, videoId, adoptedExisting: false);
        }
        catch (YouTubeUploadException ex)
        {
            logger.LogWarning("YouTube upload {UploadId} stopped: {Code}", row.Id, ex.Code);
            Fail(row, ex.Code, ex.Message);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            if (ex is DbUpdateConcurrencyException) throw;
            HandleUploadFailure(row, YouTubeErrorMapper.Map(ex));
        }
        return UploadOutcome.Changed;
    }

    /// <summary>Remembers (without touching the row's stamp) that a request that may create the video is about to go out.</summary>
    private async Task MarkUploadStartedAsync(LessonYouTubeUpload row, CancellationToken ct)
    {
        if (row.UploadMayExist) return;
        await db.Set<LessonYouTubeUpload>().Where(u => u.Id == row.Id).ExecuteUpdateAsync(s => s.SetProperty(u => u.UploadMayExist, true), ct);
        var entry = db.Entry(row).Property(u => u.UploadMayExist);
        entry.OriginalValue = true;
        entry.CurrentValue = true;
    }

    private Func<CancellationToken, Task<int>> ExtendLeaseAsync(Guid id, Guid claimStamp) => async ct =>
    {
        using var scope = scopes.CreateScope();
        var scopedDb = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var until = Now.Add(UploadLease);
        return await scopedDb.Set<LessonYouTubeUpload>().Where(u => u.Id == id && u.Status == YouTubeUploadStatus.Uploading && u.ConcurrencyStamp == claimStamp)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.LeaseUntil, until), ct);
    };

    /// <summary>
    /// Renews a lease every <paramref name="interval"/> until stopped. A failed renewal is logged and tried again at the next
    /// tick (it never ends the loop); a renewal that updates no row means the worker lost the row, which is reported through
    /// <paramref name="onLost"/> so the upload is cancelled.
    /// </summary>
    internal static async Task RunHeartbeatAsync(TimeSpan interval, Func<CancellationToken, Task<int>> extend, Action onLost, ILogger logger, CancellationToken stop)
    {
        try
        {
            using var timer = new PeriodicTimer(interval);
            while (await timer.WaitForNextTickAsync(stop))
            {
                try
                {
                    if (await extend(stop) == 0)
                    {
                        onLost();
                        return;
                    }
                }
                catch (OperationCanceledException) when (stop.IsCancellationRequested)
                {
                    return;
                }
                catch (Exception ex)
                {
                    logger.LogWarning("Could not renew the lease of a YouTube upload ({ErrorType}); trying again at the next tick", ex.GetType().Name);
                }
            }
        }
        catch (OperationCanceledException)
        {
        }
    }

    /// <summary>Saves the video id the moment YouTube has the video (status Processing).</summary>
    private async Task<UploadOutcome> RecordVideoAsync(LessonYouTubeUpload row, string videoId, bool adoptedExisting)
    {
        var now = Now;
        row.YouTubeVideoId = videoId;
        row.Status = YouTubeUploadStatus.Processing;
        row.LeaseUntil = null;
        row.NextAttemptAt = null;
        row.Error = null;
        row.ErrorCode = null;
        row.ProcessingSince = now;
        row.PollAttempts = 0;
        if (!adoptedExisting) row.UploadAttempts++;
        try
        {
            await db.SaveChangesAsync(CancellationToken.None); // the video exists on YouTube now: remember it before anything else
        }
        catch (DbUpdateConcurrencyException)
        {
            // The row was reclaimed while the upload finished. Record the video if nobody else recorded one; otherwise this
            // upload is a duplicate that cannot be linked (its id is logged so it can be deleted in YouTube Studio).
            db.ChangeTracker.Clear();
            var recorded = await db.Set<LessonYouTubeUpload>().Where(u => u.Id == row.Id && u.YouTubeVideoId == null)
                .ExecuteUpdateAsync(s => s.SetProperty(u => u.YouTubeVideoId, videoId).SetProperty(u => u.Status, YouTubeUploadStatus.Processing)
                    .SetProperty(u => u.LeaseUntil, (DateTime?)null).SetProperty(u => u.NextAttemptAt, (DateTime?)null)
                    .SetProperty(u => u.ProcessingSince, now).SetProperty(u => u.PollAttempts, 0).SetProperty(u => u.ConcurrencyStamp, Guid.NewGuid()));
            if (recorded == 0)
                logger.LogError("YouTube video {VideoId} was uploaded for upload {UploadId}, but another worker had already recorded a video; delete the duplicate in YouTube Studio", videoId, row.Id);
            return UploadOutcome.LostLease;
        }
        logger.LogInformation("YouTube accepted upload {UploadId} for lesson {LessonSlug} as video {VideoId}", row.Id, row.LessonSlug, videoId);
        return UploadOutcome.Recorded;
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

    // ---------------------------------------------------------------- processing job

    /// <summary>
    /// One pass of the processing job: follows videos YouTube is processing (due ones only, with back-off), then deletes the
    /// files of long-failed uploads and files nothing refers to any more. Independent of the upload job, so a long upload
    /// never delays it.
    /// </summary>
    public async Task<string> ProcessProcessingAsync(CancellationToken ct)
    {
        if (!Options.Enabled) return "YouTube uploads are not configured";
        var now = Now;
        var polling = await db.Set<LessonYouTubeUpload>().AsNoTracking()
            .Where(u => u.Status == YouTubeUploadStatus.Processing && (u.NextAttemptAt == null || u.NextAttemptAt <= now) && (u.LeaseUntil == null || u.LeaseUntil < now))
            .OrderBy(u => u.CreatedAt).Select(u => u.Id).Take(MaxPollsPerTick).ToListAsync(ct);
        var processed = 0;
        foreach (var id in polling)
        {
            ct.ThrowIfCancellationRequested();
            db.ChangeTracker.Clear();
            try
            {
                if (await PollOneAsync(id, ct)) processed++;
            }
            catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
            {
                logger.LogError(ex, "Following YouTube upload {UploadId} failed unexpectedly", id);
            }
        }
        db.ChangeTracker.Clear();
        var cleaned = 0;
        try
        {
            cleaned = await CleanUpFilesAsync(ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            logger.LogError(ex, "Cleaning up YouTube upload files failed");
        }
        return $"{processed} video(s) followed ({polling.Count} due), {cleaned} file(s) cleaned up";
    }

    private async Task<bool> PollOneAsync(Guid id, CancellationToken ct)
    {
        var now = Now;
        var until = now.Add(PollLease);
        var claimed = await db.Set<LessonYouTubeUpload>()
            .Where(u => u.Id == id && u.Status == YouTubeUploadStatus.Processing && (u.NextAttemptAt == null || u.NextAttemptAt <= now) && (u.LeaseUntil == null || u.LeaseUntil < now))
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.LeaseUntil, until).SetProperty(u => u.ConcurrencyStamp, Guid.NewGuid()), ct);
        if (claimed == 0) return false; // another worker (or a Re-sync) has it

        var row = await db.Set<LessonYouTubeUpload>().FirstAsync(u => u.Id == id, ct);
        try
        {
            if (row.YouTubeVideoId is null) Fail(row, "upload_failed", "The upload has no video on YouTube. Press Retry.");
            else await ContinueAsync(row, ct);
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            logger.LogWarning("YouTube upload {UploadId} was changed by another worker while it was being followed", id);
            db.ChangeTracker.Clear();
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            db.ChangeTracker.Clear();
            await db.Set<LessonYouTubeUpload>().Where(u => u.Id == id).ExecuteUpdateAsync(s => s.SetProperty(u => u.LeaseUntil, (DateTime?)null));
            throw;
        }
        return true;
    }

    /// <summary>Deletes the files of uploads that failed more than 14 days ago and stored files no upload refers to.</summary>
    private async Task<int> CleanUpFilesAsync(CancellationToken ct)
    {
        var now = Now;
        var cleaned = 0;
        var failedBefore = now - FailedFileRetention;
        var expired = await db.Set<LessonYouTubeUpload>()
            .Where(u => u.Status == YouTubeUploadStatus.Failed && u.UpdatedAt < failedBefore && (u.StoredFileId != null || u.ThumbnailFileId != null))
            .OrderBy(u => u.UpdatedAt).Take(MaxCleanupPerTick).ToListAsync(ct);
        foreach (var row in expired)
        {
            var owned = await OwnedFilesAsync(row, ct);
            db.Set<StoredFile>().RemoveRange(owned);
            row.StoredFileId = null;
            row.ThumbnailFileId = null;
            row.ErrorCode = "file_expired";
            AddNotice(row, "The video file was deleted after 14 days without a successful upload. Upload it again.");
            audit.RecordSystem("learning.youtube_upload_file_expired", nameof(LessonYouTubeUpload), row.Id, new { row.CourseId, row.LessonSlug });
            await db.SaveChangesAsync(ct);
            DeleteBlobs(owned);
            cleaned++;
        }
        db.ChangeTracker.Clear();
        var orphanBefore = now - OrphanFileAge;
        var orphans = await db.Set<StoredFile>()
            .Where(f => f.Purpose == FilePurpose.LessonYouTubeSource && f.CreatedAt < orphanBefore &&
                        !db.Set<LessonYouTubeUpload>().Any(u => u.StoredFileId == f.Id || u.ThumbnailFileId == f.Id))
            .OrderBy(f => f.CreatedAt).Take(MaxCleanupPerTick).ToListAsync(ct);
        if (orphans.Count > 0)
        {
            db.Set<StoredFile>().RemoveRange(orphans);
            await db.SaveChangesAsync(ct);
            DeleteBlobs(orphans);
            cleaned += orphans.Count;
        }
        return cleaned;
    }

    // ---------------------------------------------------------------- after the upload

    /// <summary>
    /// Everything after YouTube has the video: the course playlist, the optional thumbnail, YouTube's processing result and,
    /// when it is ready and embeddable, the link into the lesson. The caller saves the row. The channel is verified first
    /// (every call below acts on the connected account), a video still processing after 24 hours is failed, and a video
    /// still processing is looked at again after 1, 2, 5, then 10 minutes.
    /// </summary>
    private async Task ContinueAsync(LessonYouTubeUpload row, CancellationToken ct)
    {
        var videoId = row.YouTubeVideoId!;
        row.Status = YouTubeUploadStatus.Processing;
        row.ProcessingSince ??= Now;
        row.LeaseUntil = null;
        try
        {
            await guard.EnsureAsync(gateway, Options.ChannelId!, ct);
            if (Now - row.ProcessingSince.Value >= ProcessingTimeout)
            {
                Fail(row, "processing_timeout", "YouTube has not finished processing this video after 24 hours. Check it in YouTube Studio, then press Re-sync.");
                return;
            }
            if (!row.PlaylistItemAdded && !HasNotice(row, PlaylistNotice))
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
                    ScheduleNextPoll(row);
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
                case YouTubeApiErrorKind.Forbidden: // a permanent refusal: looking again will not change it
                    Fail(row, "forbidden", PlainMessage(failure));
                    break;
                default: // temporary: keep Processing and look again later
                    row.Error = PlainMessage(failure);
                    row.ErrorCode = "upload_failed";
                    ScheduleNextPoll(row);
                    break;
            }
        }
    }

    private void ScheduleNextPoll(LessonYouTubeUpload row)
    {
        row.PollAttempts++;
        row.NextAttemptAt = Now.AddMinutes(PollBackoffMinutes[Math.Min(row.PollAttempts, PollBackoffMinutes.Length) - 1]);
    }

    private async Task AddToPlaylistAsync(LessonYouTubeUpload row, string videoId, CancellationToken ct)
    {
        var course = await db.Set<Course>().AsNoTracking().FirstAsync(c => c.Id == row.CourseId, ct);
        var doc = await LatestDocumentAsync(course, ct);
        var links = new LearningLinks((await issuers.GetAsync(ct)).BaseUrl);
        var courseUrl = links.Absolute(LearningLinks.CoursePath(doc.Pack.Slug));
        try
        {
            var playlistId = await gateway.EnsurePlaylistAsync(course.YouTubePlaylistId, doc.Pack.Title,
                $"Video lectures for the Optimize All Academy course {doc.Pack.Title}. {courseUrl}", row.Privacy, ct);
            if (playlistId != course.YouTubePlaylistId) playlistId = await ClaimPlaylistAsync(course, playlistId, ct);
            var position = await PlaylistPositionAsync(row, doc, playlistId, ct);
            await gateway.AddToPlaylistAsync(playlistId, videoId, position, ct);
            row.PlaylistItemAdded = true;
        }
        catch (YouTubeApiException ex) when (ex.Kind is YouTubeApiErrorKind.Forbidden or YouTubeApiErrorKind.Other)
        {
            // The video is on YouTube; a playlist problem must not fail the lecture.
            logger.LogWarning("YouTube upload {UploadId} was not added to the course playlist: {Kind} (HTTP {Status}, {Reason})", row.Id, ex.Kind, ex.HttpStatus, ex.Reason);
            AddNotice(row, $"{PlaylistNotice} ({PlainMessage(ex)}). Add it in YouTube Studio if you want it there.");
        }
    }

    /// <summary>
    /// Stores the playlist id on the course only if nobody else did meanwhile (a conditional update, not SaveChanges: the
    /// course's concurrency stamp belongs to the course editor). Losing means another worker created a playlist at the same
    /// time: the winner's playlist is used and the extra one is deleted (best effort).
    /// </summary>
    private async Task<string> ClaimPlaylistAsync(Course course, string ours, CancellationToken ct)
    {
        var expected = course.YouTubePlaylistId;
        var stored = await db.Set<Course>().Where(c => c.Id == course.Id && c.YouTubePlaylistId == expected)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.YouTubePlaylistId, ours), ct);
        if (stored == 1) return ours;
        var winner = await db.Set<Course>().AsNoTracking().Where(c => c.Id == course.Id).Select(c => c.YouTubePlaylistId).FirstAsync(ct);
        if (winner is null || winner == ours) return ours;
        try
        {
            await gateway.DeletePlaylistAsync(ours, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning("Could not delete the extra YouTube playlist {PlaylistId} created for course {CourseId} ({ErrorType})", ours, course.Id, ex.GetType().Name);
        }
        return winner;
    }

    /// <summary>
    /// Where the video goes in the playlist: before the first item that belongs to a later lesson, else at the end. Read from
    /// the playlist's real items (videos removed or added in YouTube Studio are taken into account). When the playlist cannot
    /// be read the video is appended and a notice says so.
    /// </summary>
    private async Task<int> PlaylistPositionAsync(LessonYouTubeUpload row, CourseDocument doc, string playlistId, CancellationToken ct)
    {
        IReadOnlyList<string> items;
        try
        {
            items = await gateway.GetPlaylistVideoIdsAsync(playlistId, ct);
        }
        catch (YouTubeApiException ex) when (ex.Kind is YouTubeApiErrorKind.Forbidden or YouTubeApiErrorKind.Other)
        {
            logger.LogWarning("YouTube upload {UploadId}: the playlist could not be read: {Kind} (HTTP {Status}, {Reason})", row.Id, ex.Kind, ex.HttpStatus, ex.Reason);
            AddNotice(row, $"{PositionNotice}; the video was added at the end of the course playlist.");
            return -1;
        }
        var mine = doc.LessonsBySlug.TryGetValue(row.LessonSlug, out var me) ? me.Index : int.MaxValue;
        var rows = await db.Set<LessonYouTubeUpload>().AsNoTracking()
            .Where(u => u.CourseId == row.CourseId && u.YouTubeVideoId != null && u.Id != row.Id)
            .Select(u => new { u.YouTubeVideoId, u.LessonSlug }).ToListAsync(ct);
        var lessonOf = rows.Where(r => doc.LessonsBySlug.ContainsKey(r.LessonSlug))
            .ToDictionary(r => r.YouTubeVideoId!, r => doc.LessonsBySlug[r.LessonSlug].Index, StringComparer.Ordinal);
        for (var i = 0; i < items.Count; i++)
            if (lessonOf.TryGetValue(items[i], out var index) && index > mine) return i;
        return items.Count;
    }

    private async Task SetThumbnailAsync(LessonYouTubeUpload row, string videoId, CancellationToken ct)
    {
        var file = await db.Set<StoredFile>().AsNoTracking().FirstOrDefaultAsync(f => f.Id == row.ThumbnailFileId, ct);
        // Our own staged thumbnail, or the lesson's poster when it is an image of the learning media (checked again here).
        var usable = file is not null && file.ContentType is "image/png" or "image/jpeg" && file.Purpose is FilePurpose.LessonYouTubeSource or FilePurpose.LearningMedia;
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
                    AddNotice(row, $"{ThumbnailRefusedNotice} (custom thumbnails need a verified channel); set it in YouTube Studio.");
                }
            }
        }
        else
        {
            AddNotice(row, $"{NoThumbnailNotice}: the lecture poster is not an image from the lesson media.");
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
        else
        {
            notice = row.Privacy != YouTubePrivacy.Private ? ForcedPrivateNotice : PrivateNotice;
        }
        // Notices about the playlist and the thumbnail stay; the privacy notice is recomputed every time.
        var parts = NoticeParts(row.Notice).Where(IsSticky).ToList();
        if (notice is not null) parts.Add(notice);
        row.Notice = parts.Count == 0 ? null : string.Join('\n', parts);
        row.Status = YouTubeUploadStatus.Ready;
        row.Error = null;
        row.ErrorCode = null;
        row.NextAttemptAt = null;
        row.LeaseUntil = null;
        row.PollAttempts = 0;
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

    // ---------------------------------------------------------------- notices

    private static List<string> NoticeParts(string? notice) =>
        (notice ?? string.Empty).Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();

    private static bool IsSticky(string part) => StickyNotices.Any(p => part.StartsWith(p, StringComparison.Ordinal));

    private static bool HasNotice(LessonYouTubeUpload row, string prefix) => NoticeParts(row.Notice).Any(p => p.StartsWith(prefix, StringComparison.Ordinal));

    private static void AddNotice(LessonYouTubeUpload row, string text)
    {
        var parts = NoticeParts(row.Notice);
        if (!parts.Contains(text)) parts.Add(text);
        row.Notice = string.Join('\n', parts);
    }

    private static void RemoveNotice(LessonYouTubeUpload row, string prefix)
    {
        var parts = NoticeParts(row.Notice).Where(p => !p.StartsWith(prefix, StringComparison.Ordinal)).ToList();
        row.Notice = parts.Count == 0 ? null : string.Join('\n', parts);
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

    /// <summary>Back to a fresh Pending state: attempts, notices, polling state and any error are cleared.</summary>
    private static void ResetToPending(LessonYouTubeUpload row)
    {
        row.Status = YouTubeUploadStatus.Pending;
        row.UploadAttempts = 0;
        row.PollAttempts = 0;
        row.ProcessingSince = null;
        row.Notice = null;
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

    /// <summary>Best effort: a blob that cannot be deleted is logged and left for the cleanup, it never fails the caller.</summary>
    private void DeleteBlobs(IEnumerable<StoredFile> files)
    {
        foreach (var file in files)
        {
            try { storage.Delete(file.StorageKey); }
            catch (Exception ex) { logger.LogWarning("Could not delete stored file {FileId} ({ErrorType})", file.Id, ex.GetType().Name); }
        }
    }

    private void DiscardStaged(StagedUpload staged)
    {
        foreach (var file in new[] { staged.Video, staged.Thumbnail })
        {
            if (file is null) continue;
            try { storage.Delete(file.StorageKey); }
            catch (Exception ex) { logger.LogWarning("Could not delete staged file {StorageKey} ({ErrorType})", file.StorageKey, ex.GetType().Name); }
        }
    }

    private async Task<bool> IsPosterImageAsync(Guid fileId, CancellationToken ct) =>
        await db.Set<StoredFile>().AsNoTracking().AnyAsync(f => f.Id == fileId && f.Purpose == FilePurpose.LearningMedia &&
                                                               (f.ContentType == "image/png" || f.ContentType == "image/jpeg"), ct);

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
        var course = await db.Set<Course>().AsNoTracking().FirstOrDefaultAsync(c => c.Id == row.CourseId, ct)
                     ?? throw new YouTubeUploadException("lesson_missing", "The course no longer exists, so this video cannot be uploaded.");
        var doc = await LatestDocumentAsync(course, ct);
        if (!doc.LessonsBySlug.TryGetValue(row.LessonSlug, out var lessonRef))
            throw new YouTubeUploadException("lesson_missing", "The lesson no longer exists in the course, so this video cannot be uploaded. Restore the lesson or discard this upload.");
        var links = new LearningLinks((await issuers.GetAsync(ct)).BaseUrl);
        var lessonUrl = links.Absolute(LearningLinks.LessonPath(doc.Pack.Slug, row.LessonSlug));
        var courseUrl = links.Absolute(LearningLinks.CoursePath(doc.Pack.Slug));
        var lectureTitle = lessonRef.Lesson.Lecture?.Title ?? lessonRef.Lesson.Title;
        var moduleNumber = (doc.Pack.Modules ?? new()).IndexOf(lessonRef.Module) + 1;
        var marker = Marker(row.Id);
        var description = YouTubeMetadataBuilder.Description(doc.Pack, lessonRef.Lesson, Math.Max(moduleNumber, 1), lessonRef.Module.Title, lessonRef.Index + 1, lessonUrl, courseUrl);
        var room = YouTubeMetadataBuilder.DescriptionMax - marker.Length - 2;
        if (description.Length > room) description = description[..room];
        return new YouTubeVideoMetadata(
            YouTubeMetadataBuilder.Title(lectureTitle, doc.Pack.Title),
            description + "\n\n" + marker,
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
