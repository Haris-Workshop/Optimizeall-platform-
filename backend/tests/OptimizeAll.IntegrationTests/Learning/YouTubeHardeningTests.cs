using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OptimizeAll.Api.Common.Jobs;
using OptimizeAll.Api.Modules.Files;
using OptimizeAll.Api.Modules.Learning.YouTubeUploads;
using OptimizeAll.Domain.Files;
using OptimizeAll.Domain.Identity;
using OptimizeAll.Domain.Learning;
using OptimizeAll.IntegrationTests.Infrastructure;

namespace OptimizeAll.IntegrationTests.Learning;

/// <summary>Edge cases of the upload pipeline found in review: retries, leases, polling, adoption, playlists, cleanup, files.</summary>
public sealed class YouTubeHardeningTests(YouTubeFixture fx) : IClassFixture<YouTubeFixture>, IAsyncLifetime
{
    private FakeYouTubeGateway Gateway => fx.Gateway;
    private DateTime Now => fx.Api.Clock.GetUtcNow().UtcDateTime;

    public Task InitializeAsync() => fx.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    private static async Task<HttpResponseMessage> PostAsync(HttpClient admin, Guid courseId, string lesson, byte[]? file = null)
    {
        using var form = YouTubeFixture.Form(file ?? YouTubeFixture.Mp4(30_000));
        return await admin.PostAsync(YouTubeFixture.UploadUrl(courseId, lesson), form);
    }

    private static async Task<JsonElement> UploadAsync(HttpClient admin, Guid courseId, string lesson, byte[]? file = null)
    {
        var response = await PostAsync(admin, courseId, lesson, file);
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        return await response.ReadJsonAsync();
    }

    private Task UpdateRowAsync(Guid courseId, string lesson, Action<LessonYouTubeUpload> change) => fx.Api.WithDbAsync(async db =>
    {
        var row = await db.Set<LessonYouTubeUpload>().SingleAsync(u => u.CourseId == courseId && u.LessonSlug == lesson);
        change(row);
        await db.SaveChangesAsync();
    });

    private async Task<bool> PublicProcessingAsync(Guid courseId, string lesson)
    {
        var slug = await fx.Api.WithDbAsync(db => db.Set<Course>().AsNoTracking().Where(c => c.Id == courseId).Select(c => c.Slug).SingleAsync());
        var page = await (await fx.Host.CreateClient().GetAsync($"/api/v1/public/learning/courses/{slug}/lessons/{lesson}")).ReadJsonAsync();
        return page.GetProperty("lecture").GetProperty("processing").GetBoolean();
    }

    private async Task<StoredFile> AddStoredFileAsync(FilePurpose purpose, string contentType, string extension, bool isPublic = false, DateTime? createdAt = null)
    {
        var storage = fx.Host.Services.GetRequiredService<IFileStorage>();
        var key = storage.NewKey(Now, extension);
        await storage.WriteAsync(key, new byte[] { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16 });
        var file = new StoredFile
        {
            OwnerUserId = Guid.NewGuid(), Purpose = purpose, StorageKey = key, ContentType = contentType, SizeBytes = 16, Sha256 = new string('a', 64),
            OriginalFileName = "file" + extension, CreatedAt = createdAt ?? Now, IsPublic = isPublic,
        };
        await fx.Api.WithDbAsync(async db => { db.Set<StoredFile>().Add(file); await db.SaveChangesAsync(); });
        return file;
    }

    private bool BlobExists(StoredFile file) => File.Exists(Path.Combine(fx.Api.StorageDirectory, file.StorageKey));

    // ------------------------------------------------------------ 1: replacing a failed upload

    [Fact]
    public async Task Replacing_a_failed_upload_resets_its_attempts_and_notices_so_the_new_file_really_goes_to_YouTube()
    {
        var courseId = await fx.CreateCourseAsync();
        var admin = await fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[0];
        for (var i = 0; i < 6; i++) Gateway.UploadErrors.Enqueue(new YouTubeApiException(YouTubeApiErrorKind.Transient, 503, "down", "backendError"));
        await UploadAsync(admin, courseId, slug);
        for (var i = 0; i < 5; i++)
        {
            await fx.RunJobAsync();
            fx.Api.Clock.Advance(TimeSpan.FromMinutes(30));
        }
        await UpdateRowAsync(courseId, slug, r => r.Notice = "An old notice");
        var failed = await fx.RowAsync(courseId, slug);
        Assert.Equal(YouTubeUploadStatus.Failed, failed.Status);
        Assert.Equal(5, failed.UploadAttempts);
        var callsBefore = Gateway.UploadCalls;
        Gateway.UploadErrors.Clear();

        admin = await fx.ClientAsync(Role.Admin); // the old access token expired with the test clock
        var replaced = await UploadAsync(admin, courseId, slug, YouTubeFixture.Mp4(40_000, 9));
        Assert.Equal("Pending", replaced.GetProperty("status").GetString());
        Assert.Equal(0, replaced.GetProperty("attempts").GetInt32());
        Assert.Equal(JsonValueKind.Null, replaced.GetProperty("notice").ValueKind);
        await fx.RunJobAsync();
        Assert.Equal(callsBefore + 1, Gateway.UploadCalls); // YouTube IS called for the new file
        Assert.Equal(YouTubeUploadStatus.Ready, (await fx.RowAsync(courseId, slug)).Status);
    }

    // ------------------------------------------------------------ 3: a long upload does not block the processing job

    [Fact]
    public async Task A_video_YouTube_finished_is_linked_while_another_upload_is_still_in_flight()
    {
        var courseId = await fx.CreateCourseAsync();
        var admin = await fx.ClientAsync(Role.Admin);
        var l1 = YouTubeFixture.LessonSlugs[0];
        var l2 = YouTubeFixture.LessonSlugs[1];
        Gateway.ProcessingPolls = 1;
        await UploadAsync(admin, courseId, l1);
        await fx.RunJobAsync();
        Assert.Equal(YouTubeUploadStatus.Processing, (await fx.RowAsync(courseId, l1)).Status);
        fx.Api.Clock.Advance(TimeSpan.FromMinutes(2));

        await UploadAsync(admin, courseId, l2);
        Gateway.UploadGate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var runner = fx.Host.Services.GetRequiredService<JobRunner>();
        var uploading = runner.RunAsync<YouTubeUploadJob>();
        await Gateway.UploadEntered.Task.WaitAsync(TimeSpan.FromSeconds(30));

        var run = await runner.RunAsync<YouTubeProcessingJob>(); // its own job and lease: not held up by the upload
        Assert.NotNull(run);
        Assert.Equal(YouTubeUploadStatus.Ready, (await fx.RowAsync(courseId, l1)).Status);
        Assert.Equal(YouTubeUploadStatus.Uploading, (await fx.RowAsync(courseId, l2)).Status);

        Gateway.UploadGate.SetResult();
        await uploading;
        Assert.Equal(YouTubeUploadStatus.Processing, (await fx.RowAsync(courseId, l2)).Status);
    }

    // ------------------------------------------------------------ 4: resync takes the same lease

    [Fact]
    public async Task Resync_refuses_a_row_a_worker_holds_and_releases_its_own_lease_afterwards()
    {
        var courseId = await fx.CreateCourseAsync();
        var admin = await fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[0];
        Gateway.ProcessingPolls = 5;
        await UploadAsync(admin, courseId, slug);
        await fx.RunJobAsync();
        var url = YouTubeFixture.UploadUrl(courseId, slug) + "/resync";

        await UpdateRowAsync(courseId, slug, r => r.LeaseUntil = Now.AddMinutes(2)); // the job is polling it right now
        await (await admin.PostAsync(url, null)).ShouldFailAsync(409, "youtube.busy");
        await UpdateRowAsync(courseId, slug, r => r.Status = YouTubeUploadStatus.Uploading);
        await (await admin.PostAsync(url, null)).ShouldFailAsync(409, "youtube.busy");

        await UpdateRowAsync(courseId, slug, r => { r.Status = YouTubeUploadStatus.Processing; r.LeaseUntil = Now.AddMinutes(-1); });
        var resynced = await (await admin.PostAsync(url, null)).ReadJsonAsync();
        Assert.Equal("Processing", resynced.GetProperty("status").GetString());
        Assert.Null((await fx.RowAsync(courseId, slug)).LeaseUntil); // not left locked for the job
    }

    // ------------------------------------------------------------ 5: post-commit cleanup cannot discard the new file

    [Fact]
    public async Task A_failing_delete_of_the_replaced_file_never_discards_the_new_one()
    {
        var courseId = await fx.CreateCourseAsync();
        var admin = await fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[0];
        Gateway.UploadErrors.Enqueue(new YouTubeApiException(YouTubeApiErrorKind.InvalidGrant, 400, "bad", "invalid_grant"));
        await UploadAsync(admin, courseId, slug);
        await fx.RunJobAsync();
        var failed = await fx.RowAsync(courseId, slug);
        Assert.Equal(YouTubeUploadStatus.Failed, failed.Status);

        fx.Storage!.DeleteFailure = new UnauthorizedAccessException("not allowed");
        var response = await PostAsync(admin, courseId, slug, YouTubeFixture.Mp4(30_000, 4));
        fx.Storage.DeleteFailure = null;
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        var row = await fx.RowAsync(courseId, slug);
        Assert.NotEqual(failed.StoredFileId, row.StoredFileId);
        Assert.True(await fx.BlobExistsAsync(row.StoredFileId)); // the committed row's file is intact
        await fx.RunJobAsync();
        Assert.Equal(YouTubeUploadStatus.Ready, (await fx.RowAsync(courseId, slug)).Status);
    }

    // ------------------------------------------------------------ 6: processing age, back-off and permanent refusals

    [Fact]
    public async Task A_video_processing_for_24_hours_is_failed_with_a_pointer_to_Resync_and_the_page_placeholder_goes_away()
    {
        var courseId = await fx.CreateCourseAsync();
        var admin = await fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[0];
        Gateway.ProcessingPolls = 1000;
        await UploadAsync(admin, courseId, slug);
        await fx.RunJobAsync();
        Assert.True(await PublicProcessingAsync(courseId, slug));

        await UpdateRowAsync(courseId, slug, r => { r.ProcessingSince = Now.AddHours(-25); r.NextAttemptAt = null; });
        await fx.RunProcessingJobAsync();
        var row = await fx.RowAsync(courseId, slug);
        Assert.Equal(YouTubeUploadStatus.Failed, row.Status);
        Assert.Equal("processing_timeout", row.ErrorCode);
        Assert.Contains("Re-sync", row.Error);
        Assert.False(await PublicProcessingAsync(courseId, slug));

        Gateway.ProcessingPolls = 0;
        var resynced = await (await admin.PostAsync(YouTubeFixture.UploadUrl(courseId, slug) + "/resync", null)).ReadJsonAsync();
        Assert.Equal("Ready", resynced.GetProperty("status").GetString());
    }

    [Fact]
    public async Task A_video_still_processing_is_polled_after_1_2_5_and_then_10_minutes()
    {
        var courseId = await fx.CreateCourseAsync();
        var admin = await fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[0];
        Gateway.ProcessingPolls = 1000;
        await UploadAsync(admin, courseId, slug);
        await fx.RunJobAsync();
        var polls = Gateway.StatusCalls;
        Assert.Equal(1, polls);
        foreach (var minutes in new[] { 1, 2, 5, 10, 10 })
        {
            var row = await fx.RowAsync(courseId, slug);
            Assert.Equal(Now.AddMinutes(minutes), row.NextAttemptAt!.Value, TimeSpan.FromSeconds(1)); // MySQL keeps microseconds, .NET ticks
            fx.Api.Clock.Advance(TimeSpan.FromMinutes(minutes) - TimeSpan.FromSeconds(1));
            await fx.RunProcessingJobAsync();
            Assert.Equal(polls, Gateway.StatusCalls); // not due yet: YouTube is not asked
            fx.Api.Clock.Advance(TimeSpan.FromSeconds(1));
            await fx.RunProcessingJobAsync();
            Assert.Equal(++polls, Gateway.StatusCalls);
        }
    }

    [Fact]
    public async Task A_permanent_refusal_while_following_a_video_fails_the_upload_as_forbidden()
    {
        var courseId = await fx.CreateCourseAsync();
        var admin = await fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[0];
        Gateway.StatusErrors.Enqueue(new YouTubeApiException(YouTubeApiErrorKind.Forbidden, 403, "no", "forbidden"));
        await UploadAsync(admin, courseId, slug);
        await fx.RunJobAsync();
        var row = await fx.RowAsync(courseId, slug);
        Assert.Equal(YouTubeUploadStatus.Failed, row.Status);
        Assert.Equal("forbidden", row.ErrorCode);
        Assert.False(await PublicProcessingAsync(courseId, slug));
    }

    // ------------------------------------------------------------ 7: adopt a video whose upload response was lost

    [Fact]
    public async Task An_upload_whose_response_was_lost_adopts_the_video_instead_of_uploading_again()
    {
        var courseId = await fx.CreateCourseAsync();
        var admin = await fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[0];
        Gateway.LoseResponseOnUpload = true;
        await UploadAsync(admin, courseId, slug);
        await fx.RunJobAsync();
        var row = await fx.RowAsync(courseId, slug);
        Assert.Equal(YouTubeUploadStatus.Pending, row.Status);
        Assert.Equal(1, row.UploadAttempts);
        var created = Assert.Single(Gateway.Uploads); // the video exists although the answer was lost
        Assert.Contains($"optimizeall-upload:{row.Id}", created.Metadata.Description);

        fx.Api.Clock.Advance(TimeSpan.FromMinutes(3));
        await fx.RunJobAsync();
        row = await fx.RowAsync(courseId, slug);
        Assert.Equal(1, Gateway.FindCalls);
        Assert.Equal(1, Gateway.UploadCalls); // no second upload
        Assert.Single(Gateway.Uploads);
        Assert.Equal(created.VideoId, row.YouTubeVideoId);
        Assert.Equal(YouTubeUploadStatus.Ready, row.Status);
    }

    [Fact]
    public async Task A_retry_that_finds_no_earlier_video_uploads_normally()
    {
        var courseId = await fx.CreateCourseAsync();
        var admin = await fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[0];
        Gateway.UploadErrors.Enqueue(new YouTubeApiException(YouTubeApiErrorKind.Transient, 503, "down", "backendError")); // never reached YouTube
        await UploadAsync(admin, courseId, slug);
        await fx.RunJobAsync();
        Assert.Equal(0, Gateway.FindCalls); // a first attempt never searches
        fx.Api.Clock.Advance(TimeSpan.FromMinutes(3));
        await fx.RunJobAsync();
        Assert.Equal(1, Gateway.FindCalls);
        Assert.Equal(2, Gateway.UploadCalls);
        Assert.Single(Gateway.Uploads);
        Assert.Equal(YouTubeUploadStatus.Ready, (await fx.RowAsync(courseId, slug)).Status);
    }

    // ------------------------------------------------------------ 9: playlist

    [Fact]
    public async Task Losing_the_playlist_creation_race_uses_the_winners_playlist_and_deletes_the_extra_one()
    {
        var courseId = await fx.CreateCourseAsync();
        var admin = await fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[0];
        string? winner = null;
        Gateway.OnEnsurePlaylist = _ =>
        {
            Gateway.OnEnsurePlaylist = null;
            winner = Gateway.EnsurePlaylistAsync(null, "winner", "d", YouTubePrivacy.Unlisted, default).GetAwaiter().GetResult();
            fx.Api.WithDbAsync(db => db.Set<Course>().Where(c => c.Id == courseId).ExecuteUpdateAsync(s => s.SetProperty(c => c.YouTubePlaylistId, winner))).GetAwaiter().GetResult();
        };
        await UploadAsync(admin, courseId, slug);
        await fx.RunJobAsync();

        Assert.NotNull(winner);
        var stored = await fx.Api.WithDbAsync(db => db.Set<Course>().AsNoTracking().Where(c => c.Id == courseId).Select(c => c.YouTubePlaylistId).SingleAsync());
        Assert.Equal(winner, stored);
        var deleted = Assert.Single(Gateway.DeletedPlaylists);
        Assert.NotEqual(winner, deleted);
        Assert.Equal(winner, Gateway.AddCalls.Single().Playlist);
        Assert.Equal(YouTubeUploadStatus.Ready, (await fx.RowAsync(courseId, slug)).Status);
    }

    [Fact]
    public async Task The_playlist_position_comes_from_the_real_playlist_not_from_stored_flags()
    {
        var courseId = await fx.CreateCourseAsync();
        var admin = await fx.ClientAsync(Role.Admin);
        var l1 = YouTubeFixture.LessonSlugs[0];
        var l3 = YouTubeFixture.LessonSlugs[2];
        await UploadAsync(admin, courseId, l3);
        await fx.RunJobAsync();
        var playlist = (await fx.RowAsync(courseId, l3)) is { } r3 ? Gateway.PlaylistItems.Keys.Single() : throw new InvalidOperationException();
        Gateway.PlaylistItems[playlist].Insert(0, "foreign0001"); // somebody added another video in YouTube Studio
        await UpdateRowAsync(courseId, l3, r => r.PlaylistItemAdded = false); // the stored flag is stale

        await UploadAsync(admin, courseId, l1);
        await fx.RunJobAsync();
        Assert.Equal(1, Gateway.AddCalls.Last().Position); // after the foreign video, before lesson 3's
        var l1Video = (await fx.RowAsync(courseId, l1)).YouTubeVideoId;
        var l3Video = (await fx.RowAsync(courseId, l3)).YouTubeVideoId;
        Assert.Equal(new[] { "foreign0001", l1Video, l3Video }, Gateway.PlaylistItems[playlist]);
    }

    [Fact]
    public async Task A_playlist_that_cannot_be_read_gives_a_notice_and_the_video_is_appended()
    {
        var courseId = await fx.CreateCourseAsync();
        var admin = await fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[0];
        Gateway.PlaylistListError = new YouTubeApiException(YouTubeApiErrorKind.Other, 400, "bad", "invalidPosition");
        await UploadAsync(admin, courseId, slug);
        await fx.RunJobAsync();
        var row = await fx.RowAsync(courseId, slug);
        Assert.Equal(YouTubeUploadStatus.Ready, row.Status);
        Assert.True(row.PlaylistItemAdded);
        Assert.Equal(-1, Gateway.AddCalls.Single().Position);
        Assert.Contains("Could not read the playlist", row.Notice);
    }

    // ------------------------------------------------------------ 10: lesson gone

    [Fact]
    public async Task A_lesson_that_no_longer_exists_fails_with_lesson_missing_without_using_attempts()
    {
        var courseId = await fx.CreateCourseAsync();
        var admin = await fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[0];
        await UploadAsync(admin, courseId, slug);
        await UpdateRowAsync(courseId, slug, r => r.LessonSlug = "a-lesson-that-was-removed");
        await fx.RunJobAsync();
        var row = await fx.RowAsync(courseId, "a-lesson-that-was-removed");
        Assert.Equal(YouTubeUploadStatus.Failed, row.Status);
        Assert.Equal("lesson_missing", row.ErrorCode);
        Assert.Contains("no longer exists", row.Error);
        Assert.Equal(0, row.UploadAttempts);
        Assert.Equal(0, Gateway.UploadCalls);
    }

    // ------------------------------------------------------------ 11: who may read a staged lecture file

    [Fact]
    public async Task A_staged_lecture_file_is_readable_only_with_learning_manage_even_if_flagged_public()
    {
        var participant = await fx.Api.CreateUserAsync();
        var storage = fx.Host.Services.GetRequiredService<IFileStorage>();
        var key = storage.NewKey(Now, ".mp4");
        await storage.WriteAsync(key, YouTubeFixture.Mp4(2000));
        var file = new StoredFile
        {
            OwnerUserId = participant.Id, Purpose = FilePurpose.LessonYouTubeSource, StorageKey = key, ContentType = "video/mp4", SizeBytes = 2000,
            Sha256 = new string('b', 64), OriginalFileName = "lecture.mp4", CreatedAt = Now, IsPublic = true,
        };
        await fx.Api.WithDbAsync(async db => { db.Set<StoredFile>().Add(file); await db.SaveChangesAsync(); });
        var url = $"/api/v1/files/{file.Id}";

        await (await fx.Host.CreateClient().GetAsync(url)).ShouldFailAsync(404);
        await (await (await fx.ClientAsync()).GetAsync(url)).ShouldFailAsync(404); // a signed-in participant without the permission
        var admin = await fx.ClientAsync(Role.Admin);
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync(url)).StatusCode);
    }

    // ------------------------------------------------------------ 12: cleanup

    [Fact]
    public async Task The_files_of_uploads_that_failed_14_days_ago_and_orphaned_files_are_deleted()
    {
        var courseId = await fx.CreateCourseAsync();
        var admin = await fx.ClientAsync(Role.Admin);
        var old = YouTubeFixture.LessonSlugs[0];
        var recent = YouTubeFixture.LessonSlugs[1];
        Gateway.UploadErrors.Enqueue(new YouTubeApiException(YouTubeApiErrorKind.InvalidGrant, 400, "bad", "invalid_grant"));
        Gateway.UploadErrors.Enqueue(new YouTubeApiException(YouTubeApiErrorKind.InvalidGrant, 400, "bad", "invalid_grant"));
        await UploadAsync(admin, courseId, old);
        await fx.RunJobAsync();
        fx.Api.Clock.Advance(TimeSpan.FromDays(10));
        admin = await fx.ClientAsync(Role.Admin);
        await UploadAsync(admin, courseId, recent);
        await fx.RunJobAsync();
        fx.Api.Clock.Advance(TimeSpan.FromDays(5));
        var oldRow = await fx.RowAsync(courseId, old);
        var recentRow = await fx.RowAsync(courseId, recent);
        Assert.Equal(YouTubeUploadStatus.Failed, oldRow.Status);
        Assert.Equal(YouTubeUploadStatus.Failed, recentRow.Status);
        var orphan = await AddStoredFileAsync(FilePurpose.LessonYouTubeSource, "video/mp4", ".mp4", createdAt: Now.AddDays(-2));
        var freshOrphan = await AddStoredFileAsync(FilePurpose.LessonYouTubeSource, "video/mp4", ".mp4", createdAt: Now.AddHours(-1));

        await fx.RunProcessingJobAsync();

        var cleaned = await fx.RowAsync(courseId, old);
        Assert.Equal(YouTubeUploadStatus.Failed, cleaned.Status); // the row stays
        Assert.Equal("file_expired", cleaned.ErrorCode);
        Assert.Contains("14 days", cleaned.Notice);
        Assert.Null(cleaned.StoredFileId);
        Assert.False(await fx.BlobExistsAsync(oldRow.StoredFileId));
        var untouched = await fx.RowAsync(courseId, recent);
        Assert.NotNull(untouched.StoredFileId);
        Assert.Equal("invalid_grant", untouched.ErrorCode);
        Assert.True(await fx.BlobExistsAsync(untouched.StoredFileId));
        Assert.False(BlobExists(orphan));
        Assert.True(BlobExists(freshOrphan)); // younger than a day: might belong to an upload being enqueued
    }

    // ------------------------------------------------------------ 13: poster thumbnails

    [Fact]
    public async Task A_poster_that_is_not_a_learning_media_image_is_ignored_with_a_notice_that_stays()
    {
        var bad = await AddStoredFileAsync(FilePurpose.SaleProof, "image/png", ".png"); // somebody else's private file
        var courseId = await fx.CreateCourseAsync(poster: $"/api/v1/files/{bad.Id}");
        var admin = await fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[0];
        var queued = await UploadAsync(admin, courseId, slug);
        Assert.Contains("No thumbnail was set", queued.GetProperty("notice").GetString());
        Assert.Null((await fx.RowAsync(courseId, slug)).ThumbnailFileId);
        await fx.RunJobAsync();
        Assert.Empty(Gateway.ThumbnailCalls);
        var row = await fx.RowAsync(courseId, slug);
        Assert.Equal(YouTubeUploadStatus.Ready, row.Status);
        Assert.Contains("No thumbnail was set", row.Notice);
        Assert.True(BlobExists(bad)); // never touched
    }

    [Fact]
    public async Task A_poster_that_is_a_learning_media_image_becomes_the_thumbnail_and_stays_public()
    {
        var good = await AddStoredFileAsync(FilePurpose.LearningMedia, "image/png", ".png", isPublic: true);
        var courseId = await fx.CreateCourseAsync(poster: $"/api/v1/files/{good.Id}");
        var admin = await fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[0];
        await UploadAsync(admin, courseId, slug);
        Assert.Equal(good.Id, (await fx.RowAsync(courseId, slug)).ThumbnailFileId);
        await fx.RunJobAsync();
        Assert.Single(Gateway.ThumbnailCalls);
        Assert.True(BlobExists(good));
        Assert.Equal(1, await fx.Api.WithDbAsync(db => db.Set<StoredFile>().CountAsync(f => f.Id == good.Id)));
    }
}

/// <summary>Leases and heartbeats on the real job pipeline (a one-second heartbeat).</summary>
public sealed class FastHeartbeatFixture : YouTubeFixture
{
    public FastHeartbeatFixture() => HeartbeatSeconds = "1";
}

public sealed class YouTubeLeaseTests(FastHeartbeatFixture fx) : IClassFixture<FastHeartbeatFixture>, IAsyncLifetime
{
    private FakeYouTubeGateway Gateway => fx.Gateway;
    private DateTime Now => fx.Api.Clock.GetUtcNow().UtcDateTime;

    public Task InitializeAsync() => fx.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    private async Task<(Guid CourseId, string Slug)> QueueAsync()
    {
        var courseId = await fx.CreateCourseAsync();
        var admin = await fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[0];
        using var form = YouTubeFixture.Form(YouTubeFixture.Mp4(30_000));
        Assert.Equal(HttpStatusCode.Accepted, (await admin.PostAsync(YouTubeFixture.UploadUrl(courseId, slug), form)).StatusCode);
        return (courseId, slug);
    }

    [Fact]
    public async Task A_slow_upload_that_outlives_the_lease_keeps_it_through_the_heartbeat_and_is_not_uploaded_twice()
    {
        var (courseId, slug) = await QueueAsync();
        Gateway.UploadGate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var scopeA = fx.Host.Services.CreateScope();
        using var scopeB = fx.Host.Services.CreateScope();
        var first = scopeA.ServiceProvider.GetRequiredService<YouTubeUploadService>().ProcessUploadsAsync(default);
        await Gateway.UploadEntered.Task.WaitAsync(TimeSpan.FromSeconds(30));

        fx.Api.Clock.Advance(TimeSpan.FromMinutes(30)); // far past the 10-minute lease the claim took
        var deadline = DateTime.UtcNow.AddSeconds(20);
        while ((await fx.RowAsync(courseId, slug)).LeaseUntil is not { } until || until <= Now)
        {
            Assert.True(DateTime.UtcNow < deadline, "the heartbeat did not renew the lease");
            await Task.Delay(100);
        }

        var second = await scopeB.ServiceProvider.GetRequiredService<YouTubeUploadService>().ProcessUploadsAsync(default);
        Assert.Contains("0 reclaimed", second);
        Assert.Equal(1, Gateway.UploadCalls);
        Gateway.UploadGate.SetResult();
        await first;
        var row = await fx.RowAsync(courseId, slug);
        Assert.Equal(YouTubeUploadStatus.Processing, row.Status);
        Assert.NotNull(row.YouTubeVideoId);
        Assert.Single(Gateway.Uploads);
    }

    [Fact]
    public async Task A_worker_that_lost_its_row_stops_uploading_and_does_not_fail_it()
    {
        var (courseId, slug) = await QueueAsync();
        Gateway.UploadGate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var scope = fx.Host.Services.CreateScope();
        var first = scope.ServiceProvider.GetRequiredService<YouTubeUploadService>().ProcessUploadsAsync(default);
        await Gateway.UploadEntered.Task.WaitAsync(TimeSpan.FromSeconds(30));

        // Another instance reclaimed the row (its lease had expired, say) and queued it again.
        await fx.Api.WithDbAsync(db => db.Set<LessonYouTubeUpload>().Where(u => u.CourseId == courseId)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.Status, YouTubeUploadStatus.Pending).SetProperty(u => u.LeaseUntil, (DateTime?)null)
                .SetProperty(u => u.ConcurrencyStamp, Guid.NewGuid())));
        await Gateway.UploadCancelled.Task.WaitAsync(TimeSpan.FromSeconds(20)); // the heartbeat noticed and cancelled the upload
        await first;

        var row = await fx.RowAsync(courseId, slug);
        Assert.Equal(YouTubeUploadStatus.Pending, row.Status); // not Failed
        Assert.Null(row.YouTubeVideoId);
        Assert.Empty(Gateway.Uploads);

        Gateway.UploadGate = null;
        await fx.RunJobAsync();
        Assert.Single(Gateway.Uploads); // exactly one video in the end
        Assert.NotNull((await fx.RowAsync(courseId, slug)).YouTubeVideoId);
    }
}

/// <summary>Every call acts on the connected account: the channel is checked when following a video and when re-syncing.</summary>
public sealed class YouTubeChannelGuardPollingTests(YouTubeFixture fx) : IClassFixture<YouTubeFixture>, IAsyncLifetime
{
    public Task InitializeAsync() => fx.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task A_wrong_channel_fails_following_and_resyncing_before_YouTube_is_asked_anything_else()
    {
        var courseId = await fx.CreateCourseAsync();
        var admin = await fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[0];
        var user = await fx.Api.CreateUserAsync(new[] { Role.Admin });
        await fx.Api.WithDbAsync(async db =>
        {
            db.Set<LessonYouTubeUpload>().Add(new LessonYouTubeUpload
            {
                CourseId = courseId, LessonSlug = slug, RequestedByUserId = user.Id, FileName = "x.mp4", Status = YouTubeUploadStatus.Processing,
                YouTubeVideoId = "vid00000001", ProcessingSince = fx.Api.Clock.GetUtcNow().UtcDateTime,
            });
            await db.SaveChangesAsync();
        });
        fx.Gateway.ChannelId = "UCsomeoneelse000000000000";

        await fx.RunProcessingJobAsync();
        var row = await fx.RowAsync(courseId, slug);
        Assert.Equal(YouTubeUploadStatus.Failed, row.Status);
        Assert.Equal("channel_mismatch", row.ErrorCode);
        Assert.Equal(0, fx.Gateway.StatusCalls);
        Assert.Empty(fx.Gateway.AddCalls);
        Assert.Empty(fx.Gateway.PlaylistsCreated);

        var resynced = await (await admin.PostAsync(YouTubeFixture.UploadUrl(courseId, slug) + "/resync", null)).ReadJsonAsync();
        Assert.Equal("Failed", resynced.GetProperty("status").GetString());
        Assert.Equal("channel_mismatch", resynced.GetProperty("errorCode").GetString());
        Assert.Equal(0, fx.Gateway.StatusCalls);
    }
}
