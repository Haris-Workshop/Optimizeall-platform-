using System.Net;
using System.Security.Cryptography;
using System.Text;
using Google;
using Google.Apis.Auth.OAuth2.Responses;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using OptimizeAll.Api.Modules.Files;
using OptimizeAll.Api.Modules.Learning.YouTubeUploads;
using OptimizeAll.Domain.Common;
using OptimizeAll.Domain.Learning;

namespace OptimizeAll.UnitTests.Learning;

public class YouTubeOptionsTests
{
    private const string Secret = "s3cr3t-value-that-must-never-leak";

    private static IConfiguration Config(params (string Key, string? Value)[] values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values.ToDictionary(v => v.Key, v => v.Value)).Build();

    private static IOptions<YouTubeOptions> Resolve(IConfiguration config, ILoggerProvider? logs = null)
    {
        var services = new ServiceCollection();
        services.AddOptions<YouTubeOptions>().Configure<IConfiguration>((o, cfg) => YouTubeOptions.Bind(o, cfg)).ValidateOnStart();
        services.AddSingleton<IValidateOptions<YouTubeOptions>, YouTubeOptionsValidator>();
        services.AddSingleton(config);
        return services.BuildServiceProvider().GetRequiredService<IOptions<YouTubeOptions>>();
    }

    [Fact]
    public void None_set_disables_the_feature_and_lists_all_four_variable_names()
    {
        var o = Resolve(Config()).Value;
        Assert.False(o.Enabled);
        Assert.False(o.Partial);
        Assert.Equal(new[] { "YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN", "YOUTUBE_CHANNEL_ID" }, o.MissingVariables);
        Assert.Equal(YouTubePrivacy.Unlisted, o.DefaultPrivacy);
        Assert.Equal(2L * 1024 * 1024 * 1024, o.MaxUploadBytes);
    }

    [Fact]
    public void Blank_values_count_as_not_set()
    {
        var o = Resolve(Config(("YOUTUBE_CLIENT_ID", "  "), ("YOUTUBE_CLIENT_SECRET", ""))).Value;
        Assert.False(o.Enabled);
        Assert.False(o.Partial);
    }

    [Fact]
    public void A_partial_set_fails_naming_only_the_missing_variable_names_never_a_value()
    {
        var config = Config(("YOUTUBE_CLIENT_ID", "client-id-123"), ("YOUTUBE_CLIENT_SECRET", Secret), ("YOUTUBE_CHANNEL_ID", "UCabcdefghijklmnopqrstuv"));
        var ex = Assert.Throws<OptionsValidationException>(() => _ = Resolve(config).Value);
        Assert.Contains("YOUTUBE_REFRESH_TOKEN", ex.Message);
        Assert.DoesNotContain("YOUTUBE_CLIENT_SECRET,", ex.Message.Split("Missing:")[1]);
        Assert.DoesNotContain(Secret, ex.Message);
        Assert.DoesNotContain("client-id-123", ex.Message);
        Assert.DoesNotContain("UCabcdefghijklmnopqrstuv", ex.Message);
    }

    [Fact]
    public void All_four_set_enables_and_reads_the_optional_settings()
    {
        var o = Resolve(Config(("YOUTUBE_CLIENT_ID", "a"), ("YOUTUBE_CLIENT_SECRET", Secret), ("YOUTUBE_REFRESH_TOKEN", "c"), ("YOUTUBE_CHANNEL_ID", "UCx"),
            ("YouTube:DefaultPrivacy", "public"), ("YouTube:MaxUploadBytes", "1048576"))).Value;
        Assert.True(o.Enabled);
        Assert.Empty(o.MissingVariables);
        Assert.Equal(YouTubePrivacy.Public, o.DefaultPrivacy);
        Assert.Equal(1048576, o.MaxUploadBytes);
    }

    [Fact]
    public void The_startup_log_line_never_contains_a_credential()
    {
        var log = new CapturingLogger<YouTubeStartupLogger>();
        var options = Resolve(Config(("YOUTUBE_CLIENT_ID", "a"), ("YOUTUBE_CLIENT_SECRET", Secret), ("YOUTUBE_REFRESH_TOKEN", "refresh-token-value"), ("YOUTUBE_CHANNEL_ID", "UCx")));
        new YouTubeStartupLogger(options, log).StartAsync(default).Wait();
        new YouTubeStartupLogger(Resolve(Config()), log).StartAsync(default).Wait();
        Assert.Equal(2, log.Lines.Count);
        Assert.All(log.Lines, l =>
        {
            Assert.DoesNotContain(Secret, l);
            Assert.DoesNotContain("refresh-token-value", l);
        });
        Assert.Contains(log.Lines, l => l.Contains("disabled") && l.Contains("YOUTUBE_CLIENT_ID"));
    }

    private sealed class CapturingLogger<T> : ILogger<T>
    {
        public List<string> Lines { get; } = new();
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            Lines.Add(formatter(state, exception));
    }
}

public class YouTubeErrorMapperTests
{
    private static GoogleApiException Api(HttpStatusCode status, string? reason)
    {
        var ex = new GoogleApiException("YouTube", "raw message with detail") { HttpStatusCode = status };
        if (reason is not null)
            ex.Error = new Google.Apis.Requests.RequestError { Code = (int)status, Errors = new[] { new Google.Apis.Requests.SingleError { Reason = reason } } };
        return ex;
    }

    [Theory]
    [InlineData(HttpStatusCode.Forbidden, "quotaExceeded", YouTubeApiErrorKind.QuotaExceeded)]
    [InlineData(HttpStatusCode.BadRequest, "uploadLimitExceeded", YouTubeApiErrorKind.QuotaExceeded)]
    [InlineData(HttpStatusCode.Forbidden, "rateLimitExceeded", YouTubeApiErrorKind.RateLimited)]
    [InlineData(HttpStatusCode.TooManyRequests, null, YouTubeApiErrorKind.RateLimited)]
    [InlineData(HttpStatusCode.BadGateway, null, YouTubeApiErrorKind.Transient)]
    [InlineData(HttpStatusCode.InternalServerError, "backendError", YouTubeApiErrorKind.Transient)]
    [InlineData(HttpStatusCode.Forbidden, "forbidden", YouTubeApiErrorKind.Forbidden)]
    [InlineData(HttpStatusCode.Unauthorized, null, YouTubeApiErrorKind.Forbidden)]
    [InlineData(HttpStatusCode.BadRequest, "invalidMetadata", YouTubeApiErrorKind.Other)]
    public void Google_api_errors_are_classified(HttpStatusCode status, string? reason, YouTubeApiErrorKind kind)
    {
        var mapped = YouTubeErrorMapper.Map(Api(status, reason));
        Assert.Equal(kind, mapped.Kind);
        Assert.Equal((int)status, mapped.HttpStatus);
        Assert.DoesNotContain("raw message", mapped.Message);
    }

    [Fact]
    public void An_invalid_grant_token_error_is_classified_even_when_wrapped()
    {
        var token = new TokenResponseException(new TokenErrorResponse { Error = "invalid_grant", ErrorDescription = "Token has been expired or revoked." });
        Assert.Equal(YouTubeApiErrorKind.InvalidGrant, YouTubeErrorMapper.Map(token).Kind);
        Assert.Equal(YouTubeApiErrorKind.InvalidGrant, YouTubeErrorMapper.Map(new InvalidOperationException("outer", token)).Kind);
    }

    [Fact]
    public void Network_failures_are_transient_and_unknown_ones_are_other()
    {
        Assert.Equal(YouTubeApiErrorKind.Transient, YouTubeErrorMapper.Map(new HttpRequestException("connection reset")).Kind);
        Assert.Equal(YouTubeApiErrorKind.Transient, YouTubeErrorMapper.Map(new IOException("broken pipe")).Kind);
        Assert.Equal(YouTubeApiErrorKind.Other, YouTubeErrorMapper.Map(new InvalidOperationException("boom")).Kind);
    }
}

public class YouTubeScheduleTests
{
    [Theory]
    [InlineData(1, 1)]
    [InlineData(2, 2)]
    [InlineData(3, 4)]
    [InlineData(4, 8)]
    [InlineData(5, 16)]
    public void Backoff_doubles_from_one_minute_with_up_to_twenty_percent_jitter(int attempt, double minutes)
    {
        Assert.Equal(TimeSpan.FromMinutes(minutes), YouTubeSchedule.Backoff(attempt, 0));
        Assert.Equal(TimeSpan.FromMinutes(minutes * 1.2), YouTubeSchedule.Backoff(attempt, 1));
    }

    [Theory]
    [InlineData("2026-10-01T09:00:00Z", "2026-10-02T07:05:00Z")]   // PDT (UTC-7): next midnight is 07:00 UTC
    [InlineData("2026-10-02T06:59:00Z", "2026-10-02T07:05:00Z")]   // one minute before midnight Pacific
    [InlineData("2026-10-02T07:04:00Z", "2026-10-03T07:05:00Z")]   // just after midnight: the day after
    [InlineData("2026-12-15T12:00:00Z", "2026-12-16T08:05:00Z")]   // PST (UTC-8)
    [InlineData("2026-11-01T06:00:00Z", "2026-11-01T07:05:00Z")]   // 23:00 PDT the evening before the DST change
    [InlineData("2026-11-01T10:00:00Z", "2026-11-02T08:05:00Z")]   // after the change: midnight is PST again
    [InlineData("2026-03-07T20:00:00Z", "2026-03-08T08:05:00Z")]   // before the spring change: midnight PST
    public void The_quota_resets_at_midnight_pacific_plus_five_minutes(string now, string expected)
    {
        var result = YouTubeSchedule.NextQuotaReset(DateTime.Parse(now, null, System.Globalization.DateTimeStyles.AdjustToUniversal));
        Assert.Equal(DateTime.Parse(expected, null, System.Globalization.DateTimeStyles.AdjustToUniversal), result);
        Assert.Equal(DateTimeKind.Utc, result.Kind);
    }
}

public class VideoSnifferTests
{
    private static byte[] Head(params byte[] bytes) => bytes.Concat(new byte[64]).ToArray();
    private static byte[] Ftyp(string brand) => Head(new byte[] { 0, 0, 0, 0x18, (byte)'f', (byte)'t', (byte)'y', (byte)'p' }.Concat(Encoding.ASCII.GetBytes(brand)).ToArray());

    [Fact]
    public void Identifies_mp4_mov_and_webm_by_their_first_bytes()
    {
        Assert.Equal(("video/mp4", ".mp4"), VideoSniffer.Identify(Ftyp("isom")));
        Assert.Equal(("video/mp4", ".mp4"), VideoSniffer.Identify(Ftyp("mp42")));
        Assert.Equal(("video/quicktime", ".mov"), VideoSniffer.Identify(Ftyp("qt  ")));
        Assert.Equal(("video/webm", ".webm"), VideoSniffer.Identify(Head(0x1A, 0x45, 0xDF, 0xA3)));
    }

    [Fact]
    public void Rejects_everything_else_including_images_audio_and_scripts()
    {
        Assert.Null(VideoSniffer.Identify(Ftyp("heic")));
        Assert.Null(VideoSniffer.Identify(Ftyp("avif")));
        Assert.Null(VideoSniffer.Identify(Ftyp("M4A ")));
        Assert.Null(VideoSniffer.Identify(Head(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)));
        Assert.Null(VideoSniffer.Identify(Encoding.ASCII.GetBytes("<?php echo 1; ?> not a video at all")));
        Assert.Null(VideoSniffer.Identify(new byte[3]));
        Assert.Null(VideoSniffer.Identify(ReadOnlySpan<byte>.Empty));
    }
}

public class YouTubeUploadIntakeTests
{
    private const string Boundary = "----oa-test-boundary";

    private sealed class MemoryStorage : IFileStorage
    {
        public Dictionary<string, byte[]> Blobs { get; } = new();
        public string NewKey(DateTime nowUtc, string extension) => $"{nowUtc:yyyy}/{nowUtc:MM}/{Guid.NewGuid():N}{extension}";
        public Task WriteAsync(string key, ReadOnlyMemory<byte> content, CancellationToken ct = default) { Blobs[key] = content.ToArray(); return Task.CompletedTask; }
        public async Task WriteAsync(string key, Stream content, CancellationToken ct = default)
        {
            using var ms = new MemoryStream();
            await content.CopyToAsync(ms, ct);
            Blobs[key] = ms.ToArray();
        }
        public Stream? OpenRead(string key) => Blobs.TryGetValue(key, out var b) ? new MemoryStream(b) : null;
        public void Delete(string key) => Blobs.Remove(key);
    }

    private static byte[] Mp4(int totalBytes)
    {
        var b = new byte[totalBytes];
        b[3] = 0x18;
        "ftypisom"u8.CopyTo(b.AsSpan(4));
        new Random(7).NextBytes(b.AsSpan(16));
        return b;
    }

    private static (MemoryStream Body, string ContentType) Form(byte[]? file, string fileName = "lecture.mp4", string? privacy = null, string? publish = null, byte[]? thumbnail = null)
    {
        var ms = new MemoryStream();
        void Text(string s) => ms.Write(Encoding.UTF8.GetBytes(s));
        void Field(string name, string value) => Text($"--{Boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n");
        void FilePart(string name, string fn, byte[] content)
        {
            Text($"--{Boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{fn}\"\r\nContent-Type: video/mp4\r\n\r\n");
            ms.Write(content);
            Text("\r\n");
        }
        if (privacy is not null) Field("privacy", privacy);
        if (publish is not null) Field("publish", publish);
        if (thumbnail is not null) FilePart("thumbnail", "thumb.png", thumbnail);
        if (file is not null) FilePart("file", fileName, file);
        Text($"--{Boundary}--\r\n");
        ms.Position = 0;
        return (ms, $"multipart/form-data; boundary={Boundary}");
    }

    private static YouTubeUploadIntake Intake(MemoryStorage storage) => new(storage, new FakeTimeProvider(new DateTimeOffset(2026, 10, 1, 0, 0, 0, TimeSpan.Zero)));

    [Fact]
    public async Task A_valid_video_is_streamed_to_storage_with_its_size_and_hash_and_the_form_fields_are_read()
    {
        var storage = new MemoryStorage();
        var video = Mp4(300_000);
        var (body, contentType) = Form(video, "My Lecture!.MP4", privacy: "public", publish: "true");
        var staged = await Intake(storage).ReadAsync(body, contentType, 1_000_000, default);
        Assert.Equal("video/mp4", staged.Video.ContentType);
        Assert.Equal(video.Length, staged.Video.SizeBytes);
        Assert.Equal(Convert.ToHexString(SHA256.HashData(video)).ToLowerInvariant(), staged.Video.Sha256);
        Assert.Equal(video, storage.Blobs[staged.Video.StorageKey]);
        Assert.EndsWith(".mp4", staged.Video.StorageKey);
        Assert.Equal("My Lecture_.mp4", staged.Video.FileName);
        Assert.Equal("public", staged.Privacy);
        Assert.True(staged.Publish);
    }

    [Fact]
    public async Task A_form_built_by_HttpClient_with_a_quoted_boundary_is_read()
    {
        var storage = new MemoryStorage();
        var video = Mp4(150_000);
        using var form = new MultipartFormDataContent { { new StringContent("unlisted"), "privacy" }, { new ByteArrayContent(video), "file", "lecture.mp4" } };
        var body = new MemoryStream();
        await form.CopyToAsync(body);
        body.Position = 0;
        var staged = await Intake(storage).ReadAsync(body, form.Headers.ContentType!.ToString(), 1_000_000, default);
        Assert.Equal(video, storage.Blobs[staged.Video.StorageKey]);
        Assert.Equal("unlisted", staged.Privacy);
    }

    [Fact]
    public async Task The_type_comes_from_the_bytes_not_from_the_name_or_content_type()
    {
        var storage = new MemoryStorage();
        var (body, contentType) = Form(Encoding.ASCII.GetBytes("#!/bin/sh\necho not a video\n"), "evil.mp4");
        var ex = await Assert.ThrowsAsync<DomainException>(() => Intake(storage).ReadAsync(body, contentType, 1_000_000, default));
        Assert.Equal("file.unsupported_type", ex.Code);
        Assert.Empty(storage.Blobs);
    }

    [Fact]
    public async Task A_video_over_the_size_limit_is_refused_and_the_partial_blob_is_removed()
    {
        var storage = new MemoryStorage();
        var (body, contentType) = Form(Mp4(200_000));
        var ex = await Assert.ThrowsAsync<DomainException>(() => Intake(storage).ReadAsync(body, contentType, 100_000, default));
        Assert.Equal("file.too_large", ex.Code);
        Assert.Empty(storage.Blobs);
    }

    [Fact]
    public async Task A_video_exactly_at_the_limit_is_accepted()
    {
        var (body, contentType) = Form(Mp4(100_000));
        var staged = await Intake(new MemoryStorage()).ReadAsync(body, contentType, 100_000, default);
        Assert.Equal(100_000, staged.Video.SizeBytes);
    }

    [Theory]
    [InlineData(null)]
    [InlineData(new byte[0])]
    public async Task A_missing_or_empty_file_is_refused(byte[]? file)
    {
        var (body, contentType) = Form(file);
        var ex = await Assert.ThrowsAsync<DomainException>(() => Intake(new MemoryStorage()).ReadAsync(body, contentType, 1_000_000, default));
        Assert.Contains(ex.Code, new[] { "file.required", "file.empty" });
    }

    [Fact]
    public async Task A_body_that_is_not_multipart_is_refused()
    {
        var ex = await Assert.ThrowsAsync<DomainException>(() => Intake(new MemoryStorage()).ReadAsync(new MemoryStream(Mp4(100)), "video/mp4", 1000, default));
        Assert.Equal("file.required", ex.Code);
    }

    [Fact]
    public async Task A_thumbnail_must_be_a_png_or_jpeg_and_a_bad_one_discards_the_video_too()
    {
        var storage = new MemoryStorage();
        var (body, contentType) = Form(Mp4(1000), thumbnail: Encoding.ASCII.GetBytes("GIF89a....not accepted here"));
        var ex = await Assert.ThrowsAsync<DomainException>(() => Intake(storage).ReadAsync(body, contentType, 1_000_000, default));
        Assert.Equal("file.unsupported_type", ex.Code);
        Assert.Empty(storage.Blobs);
    }
}

public class YouTubeChannelGuardTests
{
    private sealed class StubGateway(Func<YouTubeChannel> channel) : IYouTubeGateway
    {
        public int Calls;
        public Task<YouTubeChannel> GetChannelAsync(CancellationToken ct) { Calls++; return Task.FromResult(channel()); }
        public Task<string> EnsurePlaylistAsync(string? existingPlaylistId, string title, string description, YouTubePrivacy privacy, CancellationToken ct) => throw new NotSupportedException();
        public Task<string> UploadVideoAsync(Stream content, YouTubeVideoMetadata metadata, Action<long> onProgress, CancellationToken ct) => throw new NotSupportedException();
        public Task<YouTubeVideoStatus> GetVideoStatusAsync(string videoId, CancellationToken ct) => throw new NotSupportedException();
        public Task AddToPlaylistAsync(string playlistId, string videoId, int position, CancellationToken ct) => throw new NotSupportedException();
        public Task SetThumbnailAsync(string videoId, Stream image, string contentType, CancellationToken ct) => throw new NotSupportedException();
    }

    [Fact]
    public async Task A_matching_channel_is_checked_once_per_process()
    {
        var gateway = new StubGateway(() => new YouTubeChannel("UCok", "Optimize All"));
        var guard = new YouTubeChannelGuard();
        await guard.EnsureAsync(gateway, "UCok", default);
        await guard.EnsureAsync(gateway, "UCok", default);
        Assert.Equal(1, gateway.Calls);
    }

    [Fact]
    public async Task A_mismatch_aborts_with_channel_mismatch_and_is_never_cached_as_success()
    {
        var current = "UCother";
        var gateway = new StubGateway(() => new YouTubeChannel(current, "Someone else"));
        var guard = new YouTubeChannelGuard();
        var ex = await Assert.ThrowsAsync<YouTubeUploadException>(() => guard.EnsureAsync(gateway, "UCexpected", default));
        Assert.Equal("channel_mismatch", ex.Code);
        Assert.Contains("UCexpected", ex.Message);
        Assert.DoesNotContain("UCother", ex.Message);
        await Assert.ThrowsAsync<YouTubeUploadException>(() => guard.EnsureAsync(gateway, "UCexpected", default));
        Assert.Equal(2, gateway.Calls); // asked again: the failure was not remembered
        current = "UCexpected"; // the account was re-authorized
        await guard.EnsureAsync(gateway, "UCexpected", default);
        await guard.EnsureAsync(gateway, "UCexpected", default);
        Assert.Equal(3, gateway.Calls);
    }
}

public class YouTubeMetadataBuilderTests
{
    private static CoursePack Pack()
    {
        var pack = new CoursePack { Slug = "ai-basics", Title = "AI Basics: From Prompts to Workflows", Category = "ai", Tools = new() { "Claude", "n8n" }, Skills = new() { "Prompting", "claude" } };
        return pack;
    }

    [Fact]
    public void The_title_is_lecture_pipe_course_and_never_longer_than_100_characters()
    {
        Assert.Equal("Intro | AI Basics", YouTubeMetadataBuilder.Title("Intro", "AI Basics"));
        var longCourse = "AI Basics: " + new string('x', 120);
        Assert.Equal("Intro | AI Basics", YouTubeMetadataBuilder.Title("Intro", longCourse));
        Assert.True(YouTubeMetadataBuilder.Title(new string('L', 150), "C").Length <= 100);
    }

    [Fact]
    public void The_description_links_the_lesson_and_course_and_discloses_the_ai_voice()
    {
        var lesson = new PackLesson
        {
            Slug = "intro", Title = "Intro",
            Lecture = new PackLecture { Scenes = new() { new PackScene { Narration = "First sentence. Second one! Third? Fourth is cut." } } },
        };
        var text = YouTubeMetadataBuilder.Description(Pack(), lesson, 2, "Prompts", 5, "https://academy.test/learn/ai-basics/intro", "https://academy.test/learn/ai-basics");
        Assert.StartsWith("First sentence. Second one! Third?", text);
        Assert.DoesNotContain("Fourth", text);
        Assert.Contains("Full lesson, code, knowledge check and certificate: https://academy.test/learn/ai-basics/intro", text);
        Assert.Contains("Course: AI Basics: From Prompts to Workflows — https://academy.test/learn/ai-basics", text);
        Assert.Contains("Module 2: Prompts · Lesson 5", text);
        Assert.Contains(YouTubeMetadataBuilder.AiVoiceDisclosure, text);
        Assert.True(text.Length <= YouTubeMetadataBuilder.DescriptionMax);
    }

    [Fact]
    public void Tags_are_unique_within_the_character_budget_and_keep_the_brand_first()
    {
        var tags = YouTubeMetadataBuilder.Tags(Pack(), "Intro");
        Assert.Equal("Optimize All Academy", tags[0]);
        Assert.Contains("AI", tags);
        Assert.Contains("online course", tags);
        Assert.Equal(tags.Count, tags.Select(t => t.ToLowerInvariant()).Distinct().Count());
        Assert.True(tags.Sum(t => t.Length + (t.Contains(' ') ? 2 : 0) + 1) <= YouTubeMetadataBuilder.TagsMaxChars);
    }
}
