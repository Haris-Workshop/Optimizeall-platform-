using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using OptimizeAll.Api.Modules.Learning.YouTubeUploads;
using OptimizeAll.Domain.Identity;
using OptimizeAll.Domain.Learning;
using OptimizeAll.IntegrationTests.Infrastructure;

namespace OptimizeAll.IntegrationTests.Learning;

/// <summary>Without any YouTube variable the feature is off: the admin sees why, uploads answer 409 and the job does nothing.</summary>
public sealed class YouTubeDisabledTests(ApiFactory api) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task Status_says_not_configured_and_uploads_answer_409_with_a_plain_message()
    {
        var (_, admin) = await api.CreateClientAsync(Role.Admin);
        var status = await (await admin.GetAsync("/api/v1/admin/learning/youtube/status")).ReadJsonAsync();
        Assert.False(status.GetProperty("configured").GetBoolean());
        Assert.Equal(new[] { "YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN", "YOUTUBE_CHANNEL_ID" },
            status.GetProperty("missingVariables").EnumerateArray().Select(e => e.GetString()).ToArray());
        Assert.Equal(JsonValueKind.Null, status.GetProperty("channelId").ValueKind);
        Assert.False(status.GetProperty("channelMatches").GetBoolean());

        var courseId = await api.WithDbAsync(db => db.Set<Course>().AsNoTracking().Select(c => c.Id).FirstAsync());
        using var form = YouTubeFixture.Form(YouTubeFixture.Mp4(2000));
        var response = await admin.PostAsync(YouTubeFixture.UploadUrl(courseId, "any-lesson"), form);
        await response.ShouldFailAsync(409, "youtube.not_configured");
        Assert.Contains("YOUTUBE_REFRESH_TOKEN", await response.Content.ReadAsStringAsync());
        await (await admin.PostAsync(YouTubeFixture.UploadUrl(courseId, "any-lesson") + "/retry", null)).ShouldFailAsync(409, "youtube.not_configured");
        await (await admin.PostAsync(YouTubeFixture.UploadUrl(courseId, "any-lesson") + "/resync", null)).ShouldFailAsync(409, "youtube.not_configured");
        var course = await (await admin.GetAsync($"/api/v1/admin/learning/courses/{courseId}/youtube")).ReadJsonAsync();
        Assert.Equal(0, course.GetProperty("uploads").GetArrayLength());
        Assert.Equal(JsonValueKind.Null, course.GetProperty("playlistId").ValueKind);
    }

    [Fact]
    public async Task The_job_does_nothing_and_does_not_fail()
    {
        var run = await api.RunJobAsync<YouTubeUploadJob>();
        Assert.NotNull(run);
        Assert.Equal(OptimizeAll.Domain.Jobs.JobRunStatus.Succeeded, run!.Status);
        Assert.Contains("not configured", run.Summary);
    }

    [Fact]
    public void A_partial_configuration_fails_startup_naming_only_the_missing_variables()
    {
        const string secret = "partial-config-secret-DO-NOT-LEAK";
        var partial = api.WithWebHostBuilder(b => b.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["YOUTUBE_CLIENT_ID"] = "partial-client-id-DO-NOT-LEAK",
            ["YOUTUBE_CLIENT_SECRET"] = secret,
        })));
        var failure = Assert.ThrowsAny<Exception>(() => partial.CreateClient());
        var validation = Flatten(failure).OfType<OptionsValidationException>().FirstOrDefault();
        Assert.NotNull(validation);
        Assert.Contains("YOUTUBE_REFRESH_TOKEN", validation!.Message);
        Assert.Contains("YOUTUBE_CHANNEL_ID", validation.Message);
        Assert.DoesNotContain(secret, validation.Message);
        Assert.DoesNotContain("partial-client-id-DO-NOT-LEAK", validation.Message);
    }

    private static IEnumerable<Exception> Flatten(Exception ex)
    {
        for (var e = ex; e is not null; e = e.InnerException)
        {
            yield return e;
            if (e is AggregateException aggregate)
                foreach (var inner in aggregate.InnerExceptions.SelectMany(Flatten)) yield return inner;
        }
    }
}

/// <summary>The channel guard on the real pipeline: a wrong channel aborts every upload and a mismatch is never remembered as success.</summary>
public sealed class YouTubeChannelGuardPipelineTests : IClassFixture<YouTubeFixture>
{
    private readonly YouTubeFixture _fx;

    public YouTubeChannelGuardPipelineTests(YouTubeFixture fx)
    {
        _fx = fx;
        fx.ResetAsync().GetAwaiter().GetResult();
    }

    [Fact]
    public async Task A_channel_mismatch_aborts_the_upload_and_only_a_success_is_cached()
    {
        var courseId = await _fx.CreateCourseAsync();
        var admin = await _fx.ClientAsync(Role.Admin);
        var l1 = YouTubeFixture.LessonSlugs[0];
        var l2 = YouTubeFixture.LessonSlugs[1];
        var channelCalls = _fx.Gateway.ChannelCalls;
        _fx.Gateway.ChannelId = "UCsomeoneelse000000000000";

        using (var form = YouTubeFixture.Form(YouTubeFixture.Mp4(20_000)))
            Assert.Equal(HttpStatusCode.Accepted, (await admin.PostAsync(YouTubeFixture.UploadUrl(courseId, l1), form)).StatusCode);
        await _fx.RunJobAsync();
        var row = await _fx.RowAsync(courseId, l1);
        Assert.Equal(YouTubeUploadStatus.Failed, row.Status);
        Assert.Equal("channel_mismatch", row.ErrorCode);
        Assert.Contains(YouTubeFixture.ChannelId, row.Error); // names the expected channel
        Assert.DoesNotContain("UCsomeoneelse", row.Error);
        Assert.DoesNotContain(YouTubeFixture.RefreshToken, row.Error);
        Assert.Equal(0, _fx.Gateway.UploadCalls);
        Assert.True(await _fx.BlobExistsAsync(row.StoredFileId));

        // The wrong answer was not remembered: asking again asks YouTube again.
        await (await admin.PostAsync(YouTubeFixture.UploadUrl(courseId, l1) + "/retry", null)).ReadJsonAsync();
        await _fx.RunJobAsync();
        Assert.Equal(YouTubeUploadStatus.Failed, (await _fx.RowAsync(courseId, l1)).Status);
        Assert.Equal(channelCalls + 2, _fx.Gateway.ChannelCalls);
        Assert.Equal(0, _fx.Gateway.UploadCalls);

        // Re-authorized with the right channel: Retry works, and the success is cached for the next lesson.
        _fx.Gateway.ChannelId = YouTubeFixture.ChannelId;
        await (await admin.PostAsync(YouTubeFixture.UploadUrl(courseId, l1) + "/retry", null)).ReadJsonAsync();
        await _fx.RunJobAsync();
        Assert.Equal(YouTubeUploadStatus.Ready, (await _fx.RowAsync(courseId, l1)).Status);
        Assert.Equal(channelCalls + 3, _fx.Gateway.ChannelCalls);

        using (var form = YouTubeFixture.Form(YouTubeFixture.Mp4(20_000)))
            Assert.Equal(HttpStatusCode.Accepted, (await admin.PostAsync(YouTubeFixture.UploadUrl(courseId, l2), form)).StatusCode);
        _fx.Gateway.ChannelId = "UCsomeoneelse000000000000"; // would now fail, but a verified channel is trusted for the process
        await _fx.RunJobAsync();
        Assert.Equal(YouTubeUploadStatus.Ready, (await _fx.RowAsync(courseId, l2)).Status);
        Assert.Equal(channelCalls + 3, _fx.Gateway.ChannelCalls);
    }
}
