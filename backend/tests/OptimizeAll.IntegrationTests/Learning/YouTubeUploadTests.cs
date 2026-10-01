using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OptimizeAll.Api.Modules.Learning.YouTubeUploads;
using OptimizeAll.Domain.Files;
using OptimizeAll.Domain.Identity;
using OptimizeAll.Domain.Learning;
using OptimizeAll.IntegrationTests.Infrastructure;

namespace OptimizeAll.IntegrationTests.Learning;

/// <summary>
/// Lecture upload to YouTube end to end on the real API with a fake gateway (no network): the admin endpoints, the
/// background job, retries, quota, authorization problems, duplicate prevention and the lesson link.
/// </summary>
public sealed class YouTubeUploadTests(YouTubeFixture fx) : IClassFixture<YouTubeFixture>, IAsyncLifetime
{
    private readonly YouTubeFixture _fx = fx;
    private FakeYouTubeGateway Gateway => _fx.Gateway;

    // Every test starts with a clean fake and no upload rows of earlier tests (the job processes every due row).
    public Task InitializeAsync() => _fx.ResetAsync();

    public Task DisposeAsync() => Task.CompletedTask;

    private async Task<JsonElement> UploadAsync(HttpClient admin, Guid courseId, string lesson, byte[]? file = null, string? privacy = null, bool? publish = null, byte[]? thumbnail = null)
    {
        using var form = YouTubeFixture.Form(file ?? YouTubeFixture.Mp4(150_000), privacy: privacy, publish: publish, thumbnail: thumbnail);
        var response = await admin.PostAsync(YouTubeFixture.UploadUrl(courseId, lesson), form);
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        return await response.ReadJsonAsync();
    }

    private async Task<JsonElement> CourseDtoAsync(HttpClient admin, Guid courseId) =>
        await (await admin.GetAsync($"/api/v1/admin/learning/courses/{courseId}/youtube")).ReadJsonAsync();

    // ------------------------------------------------------------ authorization

    [Fact]
    public async Task Only_staff_with_learning_manage_reach_the_youtube_endpoints()
    {
        var courseId = await _fx.CreateCourseAsync();
        var slug = YouTubeFixture.LessonSlugs[0];
        var anonymous = _fx.Host.CreateClient();
        var participant = await _fx.ClientAsync();
        var admin = await _fx.ClientAsync(Role.Admin);
        var calls = new (HttpMethod Method, string Url)[]
        {
            (HttpMethod.Get, "/api/v1/admin/learning/youtube/status"),
            (HttpMethod.Get, $"/api/v1/admin/learning/courses/{courseId}/youtube"),
            (HttpMethod.Post, YouTubeFixture.UploadUrl(courseId, slug)),
            (HttpMethod.Post, YouTubeFixture.UploadUrl(courseId, slug) + "/retry"),
            (HttpMethod.Post, YouTubeFixture.UploadUrl(courseId, slug) + "/resync"),
        };
        foreach (var (method, url) in calls)
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.SendAsync(new HttpRequestMessage(method, url))).StatusCode);
            var denied = await participant.SendAsync(new HttpRequestMessage(method, url));
            Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        }
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync(calls[0].Url)).StatusCode);
        Assert.Equal(0, Gateway.UploadCalls);
    }

    [Fact]
    public async Task The_status_endpoint_reports_the_channel_and_never_a_credential()
    {
        var admin = await _fx.ClientAsync(Role.Admin);
        var response = await admin.GetAsync("/api/v1/admin/learning/youtube/status");
        var text = await response.Content.ReadAsStringAsync();
        var json = JsonDocument.Parse(text).RootElement;
        Assert.True(json.GetProperty("configured").GetBoolean());
        Assert.Equal(0, json.GetProperty("missingVariables").GetArrayLength());
        Assert.Equal(YouTubeFixture.ChannelId, json.GetProperty("channelId").GetString());
        Assert.Equal("Optimize All Academy", json.GetProperty("channelTitle").GetString());
        Assert.Equal(YouTubeFixture.ChannelId, json.GetProperty("expectedChannelId").GetString());
        Assert.True(json.GetProperty("channelMatches").GetBoolean());
        Assert.Equal(JsonValueKind.Null, json.GetProperty("error").ValueKind);
        Assert.All(YouTubeFixture.Secrets, secret => Assert.DoesNotContain(secret, text));

        Gateway.ChannelId = "UCsomeoneelse";
        var mismatch = await (await admin.GetAsync("/api/v1/admin/learning/youtube/status")).ReadJsonAsync();
        Assert.False(mismatch.GetProperty("channelMatches").GetBoolean());
        Assert.Equal("UCsomeoneelse", mismatch.GetProperty("channelId").GetString());
    }

    // ------------------------------------------------------------ validation

    [Fact]
    public async Task Upload_validates_the_bytes_the_size_the_lesson_and_the_privacy()
    {
        var courseId = await _fx.CreateCourseAsync(v2: false);
        var admin = await _fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[1]; // the only video lesson of the v1 sample pack

        using (var fake = YouTubeFixture.Form(System.Text.Encoding.ASCII.GetBytes("#!/bin/sh\necho hi\n"), "lecture.mp4"))
            await (await admin.PostAsync(YouTubeFixture.UploadUrl(courseId, slug), fake)).ShouldFailAsync(400, "file.unsupported_type");
        using (var big = YouTubeFixture.Form(YouTubeFixture.Mp4((int)_fx.MaxUploadBytes + 1)))
            await (await admin.PostAsync(YouTubeFixture.UploadUrl(courseId, slug), big)).ShouldFailAsync(400, "file.too_large");
        using (var none = YouTubeFixture.Form(null, privacy: "unlisted"))
            await (await admin.PostAsync(YouTubeFixture.UploadUrl(courseId, slug), none)).ShouldFailAsync(400, "file.required");
        using (var badPrivacy = YouTubeFixture.Form(YouTubeFixture.Mp4(2000), privacy: "everyone"))
            await (await admin.PostAsync(YouTubeFixture.UploadUrl(courseId, slug), badPrivacy)).ShouldFailAsync(400, "youtube.invalid_privacy");
        using (var article = YouTubeFixture.Form(YouTubeFixture.Mp4(2000)))
            await (await admin.PostAsync(YouTubeFixture.UploadUrl(courseId, YouTubeFixture.LessonSlugs[0]), article)).ShouldFailAsync(409, "learning.not_a_video_lesson");
        using (var unknown = YouTubeFixture.Form(YouTubeFixture.Mp4(2000)))
            await (await admin.PostAsync(YouTubeFixture.UploadUrl(courseId, "no-such-lesson"), unknown)).ShouldFailAsync(404);
        using (var noCourse = YouTubeFixture.Form(YouTubeFixture.Mp4(2000)))
            await (await admin.PostAsync(YouTubeFixture.UploadUrl(Guid.NewGuid(), slug), noCourse)).ShouldFailAsync(404);

        // Nothing was queued and nothing is left in storage by the refused uploads.
        Assert.Empty((await CourseDtoAsync(admin, courseId)).GetProperty("uploads").EnumerateArray());
        // At the limit is fine; a WebM is recognised by its EBML header.
        var webm = new byte[5000];
        new byte[] { 0x1A, 0x45, 0xDF, 0xA3 }.CopyTo(webm, 0);
        var accepted = await UploadAsync(admin, courseId, slug, webm);
        Assert.Equal("Pending", accepted.GetProperty("status").GetString());
        Assert.Equal("unlisted", accepted.GetProperty("privacy").GetString()); // the configured default
    }

    // ------------------------------------------------------------ success path

    [Fact]
    public async Task A_lecture_is_uploaded_added_to_a_new_playlist_in_lesson_order_and_linked_into_the_lesson()
    {
        var courseId = await _fx.CreateCourseAsync();
        var admin = await _fx.ClientAsync(Role.Admin);
        var video = YouTubeFixture.Mp4(250_000, seed: 11);
        var channelCallsBefore = _fx.Gateway.ChannelCalls;

        // Lessons 3, 1 and 2 are uploaded in that order: the playlist must still end up in lesson order.
        var l3 = YouTubeFixture.LessonSlugs[2];
        var l1 = YouTubeFixture.LessonSlugs[0];
        var l2 = YouTubeFixture.LessonSlugs[1];
        var queued = await UploadAsync(admin, courseId, l3, video, privacy: "public", publish: true);
        Assert.Equal("Pending", queued.GetProperty("status").GetString());
        Assert.Equal("public", queued.GetProperty("privacy").GetString());
        Assert.Equal("lecture.mp4", queued.GetProperty("fileName").GetString());
        var queuedRow = await _fx.RowAsync(courseId, l3);
        Assert.True(await _fx.BlobExistsAsync(queuedRow.StoredFileId)); // waiting in private storage
        var storedFile = await _fx.Api.WithDbAsync(db => db.Set<StoredFile>().AsNoTracking().SingleAsync(f => f.Id == queuedRow.StoredFileId));
        Assert.False(storedFile.IsPublic);
        Assert.Equal(FilePurpose.LessonYouTubeSource, storedFile.Purpose);

        // The public lesson page only learns that something is in flight.
        var pending = await (await _fx.Host.CreateClient().GetAsync($"/api/v1/public/learning/courses/{await SlugAsync(courseId)}/lessons/{l3}")).ReadJsonAsync();
        Assert.True(pending.GetProperty("lecture").GetProperty("processing").GetBoolean());
        Assert.Equal(JsonValueKind.Null, pending.GetProperty("lecture").GetProperty("youTubeId").ValueKind);
        Assert.False(pending.GetProperty("lecture").TryGetProperty("videoId", out _)); // nothing else about the upload is public

        await _fx.RunJobAsync();
        var dto = (await CourseDtoAsync(admin, courseId)).GetProperty("uploads").EnumerateArray().Single();
        Assert.Equal("Ready", dto.GetProperty("status").GetString());
        Assert.Equal("public", dto.GetProperty("actualPrivacy").GetString());
        Assert.Equal(1, dto.GetProperty("attempts").GetInt32());
        var videoId = dto.GetProperty("videoId").GetString()!;
        Assert.Equal("https://www.youtube.com/watch?v=" + videoId, dto.GetProperty("watchUrl").GetString());
        Assert.NotEqual(JsonValueKind.Null, dto.GetProperty("uploadedAt").ValueKind);
        Assert.Equal(JsonValueKind.Null, dto.GetProperty("error").ValueKind);

        // What YouTube received: the exact bytes (streamed from storage), the metadata and the requested privacy.
        var upload = Gateway.Uploads.Single();
        Assert.Equal(video.Length, upload.Bytes);
        Assert.Equal(Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(video)).ToLowerInvariant(), upload.Sha256);
        Assert.Equal(YouTubePrivacy.Public, upload.Metadata.Privacy);
        Assert.Equal("27", upload.Metadata.CategoryId);
        Assert.Contains(" | ", upload.Metadata.Title);
        Assert.True(upload.Metadata.Title.Length <= 100);
        Assert.Contains("/learn/", upload.Metadata.Description);
        Assert.Contains(l3, upload.Metadata.Description);
        Assert.Contains("AI voice", upload.Metadata.Description);
        Assert.Contains("Welcome to this lecture. It is short. It is useful.", upload.Metadata.Description);
        Assert.DoesNotContain("Skip this part", upload.Metadata.Description);
        Assert.Contains("Optimize All Academy", upload.Metadata.Tags);

        // The playlist was created once, stored on the course, and the lesson links the video.
        var playlistId = (await CourseDtoAsync(admin, courseId)).GetProperty("playlistId").GetString();
        Assert.NotNull(playlistId);
        Assert.Single(Gateway.PlaylistsCreated);
        Assert.Equal(new[] { videoId }, Gateway.PlaylistItems[playlistId!]);
        var lesson = await (await _fx.Host.CreateClient().GetAsync($"/api/v1/public/learning/courses/{await SlugAsync(courseId)}/lessons/{l3}")).ReadJsonAsync();
        Assert.Equal(videoId, lesson.GetProperty("lecture").GetProperty("youTubeId").GetString());
        Assert.False(lesson.GetProperty("lecture").GetProperty("processing").GetBoolean()); // published: the embed replaces the placeholder

        // The local file is gone only now, with its stored-file row.
        var row = await _fx.RowAsync(courseId, l3);
        Assert.Null(row.StoredFileId);
        Assert.False(File.Exists(Path.Combine(_fx.Api.StorageDirectory, storedFile.StorageKey)));
        Assert.Equal(0, await _fx.Api.WithDbAsync(db => db.Set<StoredFile>().CountAsync(f => f.Id == storedFile.Id)));

        // Lessons 1 and 2 later: same playlist, positions follow the lesson order.
        await UploadAsync(admin, courseId, l1, YouTubeFixture.Mp4(100_000, 1));
        await _fx.RunJobAsync();
        await UploadAsync(admin, courseId, l2, YouTubeFixture.Mp4(100_000, 2));
        await _fx.RunJobAsync();
        Assert.Single(Gateway.PlaylistsCreated);
        var ids = new[] { l1, l2, l3 }.Select(async s => (await _fx.RowAsync(courseId, s)).YouTubeVideoId!).Select(t => t.Result).ToArray();
        Assert.Equal(ids, Gateway.PlaylistItems[playlistId!]);
        Assert.Equal(new[] { 0, 0, 1 }, Gateway.AddCalls.Select(c => c.Position).ToArray()); // l3 first, then l1 before it, then l2 between

        // The channel was verified once for all three uploads (a success is cached for the process).
        Assert.True(_fx.Gateway.ChannelCalls - channelCallsBefore <= 1);
        // Unpublished lessons keep their embed out of the public page until the course is published: this one was requested published.
        Assert.Contains("https://www.youtube.com/watch?v=" + videoId, await _fx.LatestContentAsync(courseId));
    }

    private Task<string> SlugAsync(Guid courseId) => _fx.Api.WithDbAsync(db => db.Set<Course>().AsNoTracking().Where(c => c.Id == courseId).Select(c => c.Slug).SingleAsync());

    [Fact]
    public async Task Without_publish_the_link_goes_into_a_new_unpublished_version()
    {
        var courseId = await _fx.CreateCourseAsync();
        var admin = await _fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[1];
        var publishedBefore = await _fx.Api.WithDbAsync(db => db.Set<Course>().AsNoTracking().Where(c => c.Id == courseId).Select(c => c.PublishedVersionId).SingleAsync());
        await UploadAsync(admin, courseId, slug, publish: false);
        await _fx.RunJobAsync();
        var row = await _fx.RowAsync(courseId, slug);
        Assert.Equal(YouTubeUploadStatus.Ready, row.Status);
        Assert.Contains(row.YouTubeVideoId!, await _fx.LatestContentAsync(courseId));
        Assert.Equal(publishedBefore, await _fx.Api.WithDbAsync(db => db.Set<Course>().AsNoTracking().Where(c => c.Id == courseId).Select(c => c.PublishedVersionId).SingleAsync()));
        var lesson = await (await _fx.Host.CreateClient().GetAsync($"/api/v1/public/learning/courses/{await SlugAsync(courseId)}/lessons/{slug}")).ReadJsonAsync();
        Assert.Equal(JsonValueKind.Null, lesson.GetProperty("lecture").GetProperty("youTubeId").ValueKind);
    }

    [Fact]
    public async Task A_thumbnail_is_set_once_and_removed()
    {
        var courseId = await _fx.CreateCourseAsync();
        var admin = await _fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[0];
        var png = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");
        await UploadAsync(admin, courseId, slug, thumbnail: png);
        var queued = await _fx.RowAsync(courseId, slug);
        Assert.NotNull(queued.ThumbnailFileId);
        await _fx.RunJobAsync();
        Assert.Single(Gateway.ThumbnailCalls);
        Assert.EndsWith(":image/png", Gateway.ThumbnailCalls[0]);
        var row = await _fx.RowAsync(courseId, slug);
        Assert.Null(row.ThumbnailFileId);
        Assert.Equal(0, await _fx.Api.WithDbAsync(db => db.Set<StoredFile>().CountAsync(f => f.Id == queued.ThumbnailFileId)));
    }

    [Fact]
    public async Task A_playlist_problem_does_not_fail_the_lecture()
    {
        var courseId = await _fx.CreateCourseAsync();
        var admin = await _fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[0];
        Gateway.PlaylistError = new YouTubeApiException(YouTubeApiErrorKind.Forbidden, 403, "no", "forbidden");
        await UploadAsync(admin, courseId, slug);
        await _fx.RunJobAsync();
        var row = await _fx.RowAsync(courseId, slug);
        Assert.Equal(YouTubeUploadStatus.Ready, row.Status);
        Assert.False(row.PlaylistItemAdded);
        Assert.Contains("not added to the course playlist", row.Notice);
    }

    // ------------------------------------------------------------ idempotency

    [Fact]
    public async Task Enqueueing_twice_creates_one_upload_and_a_finished_lesson_is_never_uploaded_again()
    {
        var courseId = await _fx.CreateCourseAsync();
        var admin = await _fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[0];
        var first = await UploadAsync(admin, courseId, slug, YouTubeFixture.Mp4(50_000, 1));
        var second = await UploadAsync(admin, courseId, slug, YouTubeFixture.Mp4(50_000, 2), privacy: "public");
        Assert.Equal(first.GetRawText(), second.GetRawText()); // the existing upload, unchanged
        Assert.Equal(1, await _fx.Api.WithDbAsync(db => db.Set<LessonYouTubeUpload>().CountAsync(u => u.CourseId == courseId)));
        Assert.Equal(1, await _fx.Api.WithDbAsync(db => db.Set<StoredFile>().CountAsync(f => f.OwnerUserId != Guid.Empty && f.Purpose == FilePurpose.LessonYouTubeSource && f.OriginalFileName == "lecture.mp4" && f.Id == db.Set<LessonYouTubeUpload>().Where(u => u.CourseId == courseId).Select(u => u.StoredFileId).FirstOrDefault())));

        await _fx.RunJobAsync();
        await _fx.RunJobAsync();
        Assert.Equal(1, Gateway.UploadCalls);
        var third = await UploadAsync(admin, courseId, slug, YouTubeFixture.Mp4(50_000, 3));
        Assert.Equal("Ready", third.GetProperty("status").GetString());
        await _fx.RunJobAsync();
        Assert.Equal(1, Gateway.UploadCalls);
    }

    [Fact]
    public async Task Two_workers_running_at_once_upload_the_file_only_once()
    {
        var courseId = await _fx.CreateCourseAsync();
        var admin = await _fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[0];
        await UploadAsync(admin, courseId, slug);
        Gateway.UploadGate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        using var scopeA = _fx.Host.Services.CreateScope();
        using var scopeB = _fx.Host.Services.CreateScope();
        var a = scopeA.ServiceProvider.GetRequiredService<YouTubeUploadService>().ProcessUploadsAsync(default);
        await Gateway.UploadEntered.Task.WaitAsync(TimeSpan.FromSeconds(30));
        var b = await scopeB.ServiceProvider.GetRequiredService<YouTubeUploadService>().ProcessUploadsAsync(default); // finds the row claimed
        Assert.StartsWith("0 upload(s) processed", b);
        Assert.Equal(YouTubeUploadStatus.Uploading, (await _fx.RowAsync(courseId, slug)).Status);
        Gateway.UploadGate.SetResult();
        await a;
        Assert.Equal(YouTubeUploadStatus.Processing, (await _fx.RowAsync(courseId, slug)).Status); // the upload job only uploads
        await _fx.RunProcessingJobAsync();

        Assert.Equal(1, Gateway.UploadCalls);
        Assert.Single(Gateway.Uploads);
        Assert.Equal(YouTubeUploadStatus.Ready, (await _fx.RowAsync(courseId, slug)).Status);
    }

    [Fact]
    public async Task A_crashed_worker_is_recovered_after_its_lease_expires()
    {
        var courseId = await _fx.CreateCourseAsync();
        var admin = await _fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[0];
        await UploadAsync(admin, courseId, slug);
        // A worker claimed the row and died: Uploading with a lease that is still valid is left alone, an expired one is requeued.
        await _fx.Api.WithDbAsync(db => db.Set<LessonYouTubeUpload>().Where(u => u.CourseId == courseId)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.Status, YouTubeUploadStatus.Uploading).SetProperty(u => u.LeaseUntil, _fx.Api.Clock.GetUtcNow().UtcDateTime.AddMinutes(5))));
        await _fx.RunJobAsync();
        Assert.Equal(0, Gateway.UploadCalls);
        _fx.Api.Clock.Advance(TimeSpan.FromMinutes(6));
        await _fx.RunJobAsync();
        Assert.Equal(1, Gateway.UploadCalls);
        Assert.Equal(YouTubeUploadStatus.Ready, (await _fx.RowAsync(courseId, slug)).Status);
    }

    // ------------------------------------------------------------ retries, quota, authorization

    [Fact]
    public async Task Transient_errors_are_retried_with_backoff_and_the_file_is_kept_until_it_works()
    {
        var courseId = await _fx.CreateCourseAsync();
        var admin = await _fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[0];
        Gateway.UploadErrors.Enqueue(new YouTubeApiException(YouTubeApiErrorKind.Transient, 503, "down", "backendError"));
        Gateway.UploadErrors.Enqueue(new YouTubeApiException(YouTubeApiErrorKind.RateLimited, 429, "slow", "rateLimitExceeded"));
        await UploadAsync(admin, courseId, slug);
        var start = _fx.Api.Clock.GetUtcNow().UtcDateTime;

        await _fx.RunJobAsync();
        var row = await _fx.RowAsync(courseId, slug);
        Assert.Equal(YouTubeUploadStatus.Pending, row.Status);
        Assert.Equal(1, row.UploadAttempts);
        Assert.InRange(row.NextAttemptAt!.Value - start, TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(1.2) + TimeSpan.FromSeconds(1));
        Assert.True(await _fx.BlobExistsAsync(row.StoredFileId));

        await _fx.RunJobAsync(); // not due yet
        Assert.Equal(1, Gateway.UploadCalls);

        _fx.Api.Clock.Advance(TimeSpan.FromMinutes(1.5));
        await _fx.RunJobAsync();
        row = await _fx.RowAsync(courseId, slug);
        Assert.Equal(2, row.UploadAttempts);
        Assert.Equal(YouTubeUploadStatus.Pending, row.Status);
        Assert.InRange(row.NextAttemptAt!.Value - _fx.Api.Clock.GetUtcNow().UtcDateTime, TimeSpan.FromMinutes(2), TimeSpan.FromMinutes(2.4) + TimeSpan.FromSeconds(1));
        Assert.True(await _fx.BlobExistsAsync(row.StoredFileId));

        _fx.Api.Clock.Advance(TimeSpan.FromMinutes(3));
        await _fx.RunJobAsync();
        row = await _fx.RowAsync(courseId, slug);
        Assert.Equal(YouTubeUploadStatus.Ready, row.Status);
        Assert.Equal(3, row.UploadAttempts);
        Assert.False(await _fx.BlobExistsAsync(row.StoredFileId));
    }

    [Fact]
    public async Task After_five_failed_attempts_the_upload_fails_with_a_plain_message_and_keeps_the_file()
    {
        var courseId = await _fx.CreateCourseAsync();
        var admin = await _fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[0];
        for (var i = 0; i < 7; i++) Gateway.UploadErrors.Enqueue(new YouTubeApiException(YouTubeApiErrorKind.Transient, 500, "down", "backendError"));
        await UploadAsync(admin, courseId, slug);
        for (var i = 0; i < 5; i++)
        {
            await _fx.RunJobAsync();
            _fx.Api.Clock.Advance(TimeSpan.FromMinutes(30));
        }
        var row = await _fx.RowAsync(courseId, slug);
        Assert.Equal(YouTubeUploadStatus.Failed, row.Status);
        Assert.Equal(5, row.UploadAttempts);
        Assert.Equal(5, Gateway.UploadCalls);
        Assert.Equal("upload_failed", row.ErrorCode);
        Assert.Contains("5 tries", row.Error);
        Assert.Null(row.NextAttemptAt);
        Assert.True(await _fx.BlobExistsAsync(row.StoredFileId));
        await _fx.RunJobAsync(); // a failed upload is left alone
        Assert.Equal(5, Gateway.UploadCalls);

        // Retry resets the attempts and sends the file again.
        Gateway.UploadErrors.Clear();
        admin = await _fx.ClientAsync(Role.Admin); // the test clock moved on: the old access token expired
        var retried = await (await admin.PostAsync(YouTubeFixture.UploadUrl(courseId, slug) + "/retry", null)).ReadJsonAsync();
        Assert.Equal("Pending", retried.GetProperty("status").GetString());
        Assert.Equal(0, retried.GetProperty("attempts").GetInt32());
        await _fx.RunJobAsync();
        Assert.Equal(YouTubeUploadStatus.Ready, (await _fx.RowAsync(courseId, slug)).Status);
    }

    [Fact]
    public async Task Retry_only_applies_to_failed_uploads()
    {
        var courseId = await _fx.CreateCourseAsync();
        var admin = await _fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[0];
        await (await admin.PostAsync(YouTubeFixture.UploadUrl(courseId, slug) + "/retry", null)).ShouldFailAsync(404);
        await UploadAsync(admin, courseId, slug);
        await (await admin.PostAsync(YouTubeFixture.UploadUrl(courseId, slug) + "/retry", null)).ShouldFailAsync(409, "youtube.not_failed");
    }

    [Fact]
    public async Task An_exhausted_quota_postpones_to_the_next_pacific_midnight_without_using_an_attempt()
    {
        var courseId = await _fx.CreateCourseAsync();
        var admin = await _fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[0];
        Gateway.UploadErrors.Enqueue(new YouTubeApiException(YouTubeApiErrorKind.QuotaExceeded, 403, "quota", "quotaExceeded"));
        await UploadAsync(admin, courseId, slug);
        var now = _fx.Api.Clock.GetUtcNow().UtcDateTime;
        await _fx.RunJobAsync();

        var row = await _fx.RowAsync(courseId, slug);
        Assert.Equal(YouTubeUploadStatus.Pending, row.Status);
        Assert.Equal(0, row.UploadAttempts);
        Assert.Equal("quota_exceeded", row.ErrorCode);
        Assert.Equal(YouTubeSchedule.NextQuotaReset(now), row.NextAttemptAt);
        Assert.True(row.NextAttemptAt > now && row.NextAttemptAt <= now.AddHours(24).AddMinutes(6));
        Assert.True(await _fx.BlobExistsAsync(row.StoredFileId));

        _fx.Api.Clock.Advance(TimeSpan.FromHours(1));
        await _fx.RunJobAsync();
        Assert.Equal(1, Gateway.UploadCalls); // still waiting for the reset

        _fx.Api.Clock.SetUtcNow(new DateTimeOffset(row.NextAttemptAt!.Value, TimeSpan.Zero));
        await _fx.RunJobAsync();
        row = await _fx.RowAsync(courseId, slug);
        Assert.Equal(YouTubeUploadStatus.Ready, row.Status);
        Assert.Equal(1, row.UploadAttempts);
        Assert.Equal(2, Gateway.UploadCalls);
    }

    [Fact]
    public async Task A_revoked_refresh_token_fails_the_upload_with_a_message_to_reauthorize_and_leaks_nothing()
    {
        var courseId = await _fx.CreateCourseAsync();
        var admin = await _fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[0];
        Gateway.UploadErrors.Enqueue(new YouTubeApiException(YouTubeApiErrorKind.InvalidGrant, 400, "bad",
            "invalid_grant", new InvalidOperationException("refresh token " + YouTubeFixture.RefreshToken + " rejected")));
        await UploadAsync(admin, courseId, slug);
        await _fx.RunJobAsync();

        var row = await _fx.RowAsync(courseId, slug);
        Assert.Equal(YouTubeUploadStatus.Failed, row.Status);
        Assert.Equal("invalid_grant", row.ErrorCode);
        Assert.Contains("re-authorize", row.Error);
        Assert.Contains("administrator", row.Error);
        Assert.Equal(0, row.UploadAttempts);
        var body = await (await admin.GetAsync($"/api/v1/admin/learning/courses/{courseId}/youtube")).Content.ReadAsStringAsync();
        Assert.Contains("invalid_grant", body);
        AssertNoSecrets(body, row.Error!);

        // After re-authorizing, Retry works.
        await (await admin.PostAsync(YouTubeFixture.UploadUrl(courseId, slug) + "/retry", null)).ReadJsonAsync();
        await _fx.RunJobAsync();
        Assert.Equal(YouTubeUploadStatus.Ready, (await _fx.RowAsync(courseId, slug)).Status);
        AssertNoSecrets(_fx.Logs.Lines.ToArray());
    }

    private static void AssertNoSecrets(params string[] texts)
    {
        foreach (var secret in YouTubeFixture.Secrets)
            Assert.All(texts, t => Assert.DoesNotContain(secret, t));
    }

    // ------------------------------------------------------------ processing and privacy

    [Fact]
    public async Task The_video_stays_Processing_until_YouTube_finishes()
    {
        var courseId = await _fx.CreateCourseAsync();
        var admin = await _fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[0];
        Gateway.ProcessingPolls = 2;
        await UploadAsync(admin, courseId, slug);
        await _fx.RunJobAsync();
        var row = await _fx.RowAsync(courseId, slug);
        Assert.Equal(YouTubeUploadStatus.Processing, row.Status);
        Assert.NotNull(row.YouTubeVideoId);
        Assert.Null(row.UploadedAt);
        Assert.True(await _fx.BlobExistsAsync(row.StoredFileId)); // not confirmed yet
        var page = await (await _fx.Host.CreateClient().GetAsync($"/api/v1/public/learning/courses/{await SlugAsync(courseId)}/lessons/{slug}")).ReadJsonAsync();
        Assert.True(page.GetProperty("lecture").GetProperty("processing").GetBoolean());

        _fx.Api.Clock.Advance(TimeSpan.FromMinutes(1.5)); // polls are spaced 1, 2, 5, 10 minutes apart
        await _fx.RunJobAsync();
        Assert.Equal(YouTubeUploadStatus.Processing, (await _fx.RowAsync(courseId, slug)).Status);
        _fx.Api.Clock.Advance(TimeSpan.FromMinutes(2.5));
        await _fx.RunJobAsync();
        row = await _fx.RowAsync(courseId, slug);
        Assert.Equal(YouTubeUploadStatus.Ready, row.Status);
        Assert.Equal(1, Gateway.UploadCalls);
        Assert.Single(Gateway.AddCalls); // the playlist item was added once, not on every poll
        Assert.False(await _fx.BlobExistsAsync(row.StoredFileId));
    }

    [Fact]
    public async Task A_rejected_video_fails_with_the_reason_and_Retry_uploads_the_file_again()
    {
        var courseId = await _fx.CreateCourseAsync();
        var admin = await _fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[0];
        Gateway.FinalState = YouTubeProcessingState.Failed;
        Gateway.FailureReason = "YouTube could not convert the video; re-export it as H.264 MP4 and try again.";
        await UploadAsync(admin, courseId, slug);
        await _fx.RunJobAsync();
        var row = await _fx.RowAsync(courseId, slug);
        Assert.Equal(YouTubeUploadStatus.Failed, row.Status);
        Assert.Equal("processing_failed", row.ErrorCode);
        Assert.Equal(Gateway.FailureReason, row.Error);
        Assert.True(await _fx.BlobExistsAsync(row.StoredFileId)); // kept: nothing was confirmed
        Assert.DoesNotContain(row.YouTubeVideoId!, await _fx.LatestContentAsync(courseId));

        Gateway.FinalState = YouTubeProcessingState.Succeeded;
        await (await admin.PostAsync(YouTubeFixture.UploadUrl(courseId, slug) + "/retry", null)).ReadJsonAsync();
        await _fx.RunJobAsync();
        row = await _fx.RowAsync(courseId, slug);
        Assert.Equal(YouTubeUploadStatus.Ready, row.Status);
        Assert.Equal(2, Gateway.UploadCalls);
    }

    [Fact]
    public async Task A_video_YouTube_forced_Private_is_Ready_with_a_notice_and_is_not_linked_until_resync_finds_it_public()
    {
        var courseId = await _fx.CreateCourseAsync();
        var admin = await _fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[0];
        Gateway.ForcedPrivacy = YouTubePrivacy.Private;
        await UploadAsync(admin, courseId, slug, privacy: "unlisted", publish: true);
        await _fx.RunJobAsync();

        var dto = (await CourseDtoAsync(admin, courseId)).GetProperty("uploads").EnumerateArray().Single();
        Assert.Equal("Ready", dto.GetProperty("status").GetString());
        Assert.Equal("unlisted", dto.GetProperty("privacy").GetString());
        Assert.Equal("private", dto.GetProperty("actualPrivacy").GetString());
        Assert.Equal("YouTube kept this video Private (the API project is not yet audited); publish it from YouTube Studio or after Google approves the audit",
            dto.GetProperty("notice").GetString());
        var videoId = dto.GetProperty("videoId").GetString()!;
        Assert.DoesNotContain(videoId, await _fx.LatestContentAsync(courseId));
        var page = await (await _fx.Host.CreateClient().GetAsync($"/api/v1/public/learning/courses/{await SlugAsync(courseId)}/lessons/{slug}")).ReadJsonAsync();
        Assert.Equal(JsonValueKind.Null, page.GetProperty("lecture").GetProperty("youTubeId").ValueKind);
        Assert.False(page.GetProperty("lecture").GetProperty("processing").GetBoolean());
        Assert.False(await _fx.BlobExistsAsync((await _fx.RowAsync(courseId, slug)).StoredFileId)); // the upload itself was confirmed

        // Google approves the audit / the admin publishes it in Studio: Resync links it.
        Gateway.ForcedPrivacy = YouTubePrivacy.Unlisted;
        var resynced = await (await admin.PostAsync(YouTubeFixture.UploadUrl(courseId, slug) + "/resync", null)).ReadJsonAsync();
        Assert.Equal("Ready", resynced.GetProperty("status").GetString());
        Assert.Equal("unlisted", resynced.GetProperty("actualPrivacy").GetString());
        Assert.Equal(JsonValueKind.Null, resynced.GetProperty("notice").ValueKind);
        Assert.Contains(videoId, await _fx.LatestContentAsync(courseId));
        Assert.Equal(1, Gateway.UploadCalls);
    }

    [Fact]
    public async Task Resync_needs_a_video_and_a_missing_video_is_reported()
    {
        var courseId = await _fx.CreateCourseAsync();
        var admin = await _fx.ClientAsync(Role.Admin);
        var slug = YouTubeFixture.LessonSlugs[0];
        await (await admin.PostAsync(YouTubeFixture.UploadUrl(courseId, slug) + "/resync", null)).ShouldFailAsync(404);
        await UploadAsync(admin, courseId, slug);
        await (await admin.PostAsync(YouTubeFixture.UploadUrl(courseId, slug) + "/resync", null)).ShouldFailAsync(409, "youtube.no_video");
        Gateway.ProcessingPolls = 1;
        await _fx.RunJobAsync();
        var processing = await (await admin.PostAsync(YouTubeFixture.UploadUrl(courseId, slug) + "/resync", null)).ReadJsonAsync();
        Assert.Equal("Ready", processing.GetProperty("status").GetString());
    }
}
