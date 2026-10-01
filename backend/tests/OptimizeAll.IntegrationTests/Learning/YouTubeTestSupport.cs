using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using OptimizeAll.Api.Modules.Files;
using OptimizeAll.Api.Modules.Learning;
using OptimizeAll.Api.Modules.Learning.YouTubeUploads;
using OptimizeAll.Domain.Files;
using OptimizeAll.Domain.Identity;
using OptimizeAll.Domain.Learning;
using OptimizeAll.IntegrationTests.Infrastructure;
using OptimizeAll.Infrastructure.Persistence;

namespace OptimizeAll.IntegrationTests.Learning;

/// <summary>A scriptable YouTube: no network. Records what the pipeline asked for and fails on demand.</summary>
public sealed class FakeYouTubeGateway : IYouTubeGateway
{
    public sealed record UploadRecord(YouTubeVideoMetadata Metadata, long Bytes, string Sha256, string VideoId);

    private readonly object _gate = new();
    private int _videoCounter;

    public string ChannelId { get; set; } = YouTubeFixture.ChannelId;
    public string ChannelTitle { get; set; } = "Optimize All Academy";
    public int ChannelCalls;
    public int UploadCalls;
    public int StatusCalls;
    public int FindCalls;
    public List<string> DeletedPlaylists { get; } = new();
    /// <summary>The upload reaches YouTube (the video exists) but the answer is lost: the call throws a transient error.</summary>
    public bool LoseResponseOnUpload { get; set; }
    public Exception? PlaylistListError { get; set; }
    /// <summary>Runs inside EnsurePlaylistAsync, before it answers (to let a concurrent worker win a race).</summary>
    public Action<string?>? OnEnsurePlaylist { get; set; }
    public TaskCompletionSource UploadCancelled { get; private set; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
    public List<UploadRecord> Uploads { get; } = new();
    public Queue<Exception> UploadErrors { get; } = new();
    public Queue<Exception> StatusErrors { get; } = new();
    public Exception? PlaylistError { get; set; }
    public Exception? ThumbnailError { get; set; }
    public List<string> PlaylistsCreated { get; } = new();
    public Dictionary<string, List<string>> PlaylistItems { get; } = new();
    public List<(string Playlist, string Video, int Position)> AddCalls { get; } = new();
    public List<string> ThumbnailCalls { get; } = new();
    /// <summary>How many polls report Processing before the video is done.</summary>
    public int ProcessingPolls { get; set; }
    public YouTubeProcessingState FinalState { get; set; } = YouTubeProcessingState.Succeeded;
    public string? FailureReason { get; set; }
    /// <summary>When set, every video reports this privacy (an unaudited API project forces Private).</summary>
    public YouTubePrivacy? ForcedPrivacy { get; set; }
    public TaskCompletionSource? UploadGate { get; set; }
    public TaskCompletionSource UploadEntered { get; private set; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly Dictionary<string, YouTubePrivacy> _requested = new();

    public void Reset()
    {
        lock (_gate)
        {
            ChannelId = YouTubeFixture.ChannelId;
            UploadErrors.Clear();
            StatusErrors.Clear();
            PlaylistError = null;
            ThumbnailError = null;
            ProcessingPolls = 0;
            FinalState = YouTubeProcessingState.Succeeded;
            FailureReason = null;
            ForcedPrivacy = null;
            UploadGate = null;
            UploadEntered = new(TaskCreationOptions.RunContinuationsAsynchronously);
            UploadCancelled = new(TaskCreationOptions.RunContinuationsAsynchronously);
            LoseResponseOnUpload = false;
            PlaylistListError = null;
            OnEnsurePlaylist = null;
            DeletedPlaylists.Clear();
            StatusCalls = 0;
            FindCalls = 0;
            Uploads.Clear();
            AddCalls.Clear();
            PlaylistsCreated.Clear();
            PlaylistItems.Clear();
            ThumbnailCalls.Clear();
            UploadCalls = 0;
        }
    }

    public Task<YouTubeChannel> GetChannelAsync(CancellationToken ct)
    {
        Interlocked.Increment(ref ChannelCalls);
        return Task.FromResult(new YouTubeChannel(ChannelId, ChannelTitle));
    }

    public Task<string> EnsurePlaylistAsync(string? existingPlaylistId, string title, string description, YouTubePrivacy privacy, CancellationToken ct)
    {
        OnEnsurePlaylist?.Invoke(existingPlaylistId);
        lock (_gate)
        {
            if (PlaylistError is { } error) throw error;
            if (existingPlaylistId is not null && PlaylistItems.ContainsKey(existingPlaylistId)) return Task.FromResult(existingPlaylistId);
            var id = "PL" + (PlaylistsCreated.Count + 1).ToString("D6") + Guid.NewGuid().ToString("N")[..8];
            PlaylistsCreated.Add(title);
            PlaylistItems[id] = new List<string>();
            return Task.FromResult(id);
        }
    }

    public async Task<string> UploadVideoAsync(Stream content, YouTubeVideoMetadata metadata, Action<long> onProgress, CancellationToken ct)
    {
        Interlocked.Increment(ref UploadCalls);
        UploadEntered.TrySetResult();
        if (UploadGate is { } gate)
        {
            try { await gate.Task.WaitAsync(ct); }
            catch (OperationCanceledException) { UploadCancelled.TrySetResult(); throw; }
        }
        lock (_gate)
        {
            if (UploadErrors.Count > 0) throw UploadErrors.Dequeue();
        }
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        var buffer = new byte[64 * 1024];
        long total = 0;
        int n;
        while ((n = await content.ReadAsync(buffer, ct)) > 0)
        {
            hash.AppendData(buffer.AsSpan(0, n));
            total += n;
            onProgress(total);
        }
        lock (_gate)
        {
            var id = "vid" + (++_videoCounter).ToString("D8");
            Uploads.Add(new UploadRecord(metadata, total, Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant(), id));
            _requested[id] = metadata.Privacy;
            if (LoseResponseOnUpload)
            {
                LoseResponseOnUpload = false;
                throw new YouTubeApiException(YouTubeApiErrorKind.Transient, null, "connection lost", "network");
            }
            return id;
        }
    }

    public Task<string?> FindUploadByMarkerAsync(string marker, CancellationToken ct)
    {
        Interlocked.Increment(ref FindCalls);
        lock (_gate)
            return Task.FromResult(Uploads.FirstOrDefault(u => u.Metadata.Description.Contains(marker, StringComparison.Ordinal))?.VideoId);
    }

    public Task<IReadOnlyList<string>> GetPlaylistVideoIdsAsync(string playlistId, CancellationToken ct)
    {
        lock (_gate)
        {
            if (PlaylistListError is { } error) throw error;
            return Task.FromResult<IReadOnlyList<string>>(PlaylistItems[playlistId].ToList());
        }
    }

    public Task DeletePlaylistAsync(string playlistId, CancellationToken ct)
    {
        lock (_gate)
        {
            PlaylistItems.Remove(playlistId);
            DeletedPlaylists.Add(playlistId);
        }
        return Task.CompletedTask;
    }

    public Task<YouTubeVideoStatus> GetVideoStatusAsync(string videoId, CancellationToken ct)
    {
        lock (_gate)
        {
            StatusCalls++;
            if (StatusErrors.Count > 0) throw StatusErrors.Dequeue();
            if (!_requested.TryGetValue(videoId, out var requested))
                return Task.FromResult(new YouTubeVideoStatus(videoId, YouTubeProcessingState.Missing, null, null));
            var privacy = ForcedPrivacy ?? requested;
            if (ProcessingPolls > 0)
            {
                ProcessingPolls--;
                return Task.FromResult(new YouTubeVideoStatus(videoId, YouTubeProcessingState.Processing, privacy, null));
            }
            return Task.FromResult(new YouTubeVideoStatus(videoId, FinalState, privacy, FinalState == YouTubeProcessingState.Failed ? FailureReason : null));
        }
    }

    public Task AddToPlaylistAsync(string playlistId, string videoId, int position, CancellationToken ct)
    {
        lock (_gate)
        {
            var items = PlaylistItems[playlistId];
            items.Insert(position < 0 ? items.Count : Math.Min(position, items.Count), videoId);
            AddCalls.Add((playlistId, videoId, position));
        }
        return Task.CompletedTask;
    }

    public Task SetThumbnailAsync(string videoId, Stream image, string contentType, CancellationToken ct)
    {
        lock (_gate)
        {
            if (ThumbnailError is { } error) throw error;
            ThumbnailCalls.Add(videoId + ":" + contentType);
        }
        return Task.CompletedTask;
    }
}

/// <summary>The real local storage, with deletes that can be made to fail on demand.</summary>
public sealed class TogglingStorage(IFileStorage inner) : IFileStorage
{
    /// <summary>When set, Delete throws this (a failure that is not an IOException).</summary>
    public Exception? DeleteFailure { get; set; }

    public string NewKey(DateTime nowUtc, string extension) => inner.NewKey(nowUtc, extension);
    public Task WriteAsync(string key, ReadOnlyMemory<byte> content, CancellationToken ct = default) => inner.WriteAsync(key, content, ct);
    public Task WriteAsync(string key, Stream content, CancellationToken ct = default) => inner.WriteAsync(key, content, ct);
    public Stream? OpenRead(string key) => inner.OpenRead(key);

    public void Delete(string key)
    {
        if (DeleteFailure is { } failure) throw failure;
        inner.Delete(key);
    }
}

/// <summary>Collects every log line (message and exception text) so tests can prove no secret is logged.</summary>
public sealed class CapturingLoggerProvider : ILoggerProvider
{
    public List<string> Lines { get; } = new();
    public ILogger CreateLogger(string categoryName) => new CaptureLogger(this);
    public void Dispose() { }

    private sealed class CaptureLogger(CapturingLoggerProvider owner) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            lock (owner.Lines) owner.Lines.Add(formatter(state, exception) + (exception is null ? string.Empty : " " + exception));
        }
    }
}

/// <summary>A host with the YouTube connection configured (fake credentials) and <see cref="FakeYouTubeGateway"/> instead of Google.</summary>
public class YouTubeFixture : IAsyncLifetime
{
    public const string ChannelId = "UCexpected0000000000000";
    public const string ClientSecret = "test-client-secret-DO-NOT-LEAK-123";
    public const string RefreshToken = "test-refresh-token-DO-NOT-LEAK-456";
    public static readonly string[] Secrets = { ClientSecret, RefreshToken, "test-client-id-DO-NOT-LEAK-789" };

    public ApiFactory Api { get; } = new();
    public WebApplicationFactory<Program> Host { get; private set; } = null!;
    public FakeYouTubeGateway Gateway { get; } = new();
    public CapturingLoggerProvider Logs { get; } = new();
    public long MaxUploadBytes { get; init; } = 400_000;
    public string? HeartbeatSeconds { get; init; }
    public TogglingStorage? Storage { get; private set; }

    public async Task InitializeAsync()
    {
        await Api.InitializeAsync();
        Host = Api.WithWebHostBuilder(b =>
        {
            b.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["YOUTUBE_CLIENT_ID"] = "test-client-id-DO-NOT-LEAK-789",
                ["YOUTUBE_CLIENT_SECRET"] = ClientSecret,
                ["YOUTUBE_REFRESH_TOKEN"] = RefreshToken,
                ["YOUTUBE_CHANNEL_ID"] = ChannelId,
                ["YouTube:MaxUploadBytes"] = MaxUploadBytes.ToString(),
                ["YouTube:HeartbeatSeconds"] = HeartbeatSeconds,
            }));
            b.ConfigureTestServices(services =>
            {
                services.RemoveAll<IYouTubeGateway>();
                services.AddSingleton<IYouTubeGateway>(Gateway);
                services.AddSingleton<ILoggerProvider>(Logs);
                services.RemoveAll<IFileStorage>();
                services.AddSingleton<IFileStorage>(sp => Storage = new TogglingStorage(ActivatorUtilities.CreateInstance<LocalFileStorage>(sp)));
            });
        });
        await Host.StartAsync();
    }

    public async Task DisposeAsync()
    {
        await Host.DisposeAsync();
        await Api.DisposeAsync();
    }

    public async Task<HttpClient> ClientAsync(params Role[] roles)
    {
        var user = await Api.CreateUserAsync(roles.Length == 0 ? null : roles);
        return await LoginAsync(user);
    }

    private async Task<HttpClient> LoginAsync(TestUser user)
    {
        var client = Host.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        client.DefaultRequestHeaders.Add("X-Requested-With", "tests");
        var response = await client.PostAsJsonAsync("/api/v1/auth/login", new { email = user.Email, password = user.Password });
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", body.GetProperty("accessToken").GetString());
        return client;
    }

    public async Task ResetAsync()
    {
        Gateway.Reset();
        Host.Services.GetRequiredService<IFileStorage>(); // creates the storage wrapper
        Storage!.DeleteFailure = null;
        await Api.WithDbAsync(db => db.Set<LessonYouTubeUpload>().ExecuteDeleteAsync());
    }

    /// <summary>One minute of the platform: the upload job, then the processing job.</summary>
    public async Task RunJobAsync()
    {
        var runner = Host.Services.GetRequiredService<OptimizeAll.Api.Common.Jobs.JobRunner>();
        await runner.RunAsync<YouTubeUploadJob>();
        await runner.RunAsync<YouTubeProcessingJob>();
    }

    public Task RunProcessingJobAsync() => Host.Services.GetRequiredService<OptimizeAll.Api.Common.Jobs.JobRunner>().RunAsync<YouTubeProcessingJob>();

    // ------------------------------------------------------------ courses

    public static readonly string[] LessonSlugs =
        { "campaigns-and-eligibility", "submitting-posts-that-pass-review", "earnings-and-payouts", "disclosure-and-platform-rules" };

    private static string Words(int n, string word) => string.Join(' ', Enumerable.Repeat(word, n));

    /// <summary>The sample pack as a published v2 course whose lessons all have a lecture script (no produced video yet); v1: the plain sample (lesson 1 is an article, lesson 2 a video lesson).</summary>
    public async Task<Guid> CreateCourseAsync(bool v2 = true, string? poster = null)
    {
        var pack = SamplePacks.V1();
        pack.Slug = "yt-" + Guid.NewGuid().ToString("N")[..10];
        if (v2)
        {
            pack.LastReviewed = "2026-09";
            pack.Tools = new() { "Claude" };
        }
        var lessons = pack.AllLessons.Select(x => x.Lesson).ToList();
        foreach (var lesson in v2 ? lessons : new List<PackLesson>())
        {
            var missing = 750 - CoursePackValidator.WordCount(lesson.Body);
            if (missing > 0) lesson.Body += "\n\n" + Words(missing, "detail");
            lesson.Lecture = new PackLecture
            {
                TargetMinutes = 7,
                Scenes = Enumerable.Range(1, 6).Select(i => new PackScene
                {
                    Narration = (i == 1 ? "Welcome to this lecture. It is short. It is useful. Skip this part. " : string.Empty) + Words(140, "spoken"),
                    OnScreen = $"Chapter {i} heading\n• First point\n• Second point",
                    Visual = "Animated diagram, then a screen recording.",
                    Seconds = 60,
                }).ToList(),
            };
        }
        if (poster is not null && v2) lessons[0].Lecture!.Poster = poster;
        Assert.Empty(CoursePackValidator.Validate(pack));
        using var scope = Api.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await scope.ServiceProvider.GetRequiredService<LearningCatalogSeeder>()
            .UpsertAsync(db, new[] { new PackFile(pack.Slug + ".json", pack.ToJson(), pack, null) }, CancellationToken.None);
        return await db.Set<Course>().Where(c => c.Slug == pack.Slug).Select(c => c.Id).SingleAsync();
    }

    // ------------------------------------------------------------ uploads

    public static byte[] Mp4(int totalBytes, int seed = 7)
    {
        var b = new byte[totalBytes];
        b[3] = 0x18;
        "ftypisom"u8.CopyTo(b.AsSpan(4));
        new Random(seed).NextBytes(b.AsSpan(16));
        return b;
    }

    public static MultipartFormDataContent Form(byte[]? file, string fileName = "lecture.mp4", string? privacy = null, bool? publish = null, byte[]? thumbnail = null)
    {
        var form = new MultipartFormDataContent();
        if (privacy is not null) form.Add(new StringContent(privacy), "privacy");
        if (publish is { } p) form.Add(new StringContent(p ? "true" : "false"), "publish");
        if (thumbnail is not null) form.Add(new ByteArrayContent(thumbnail), "thumbnail", "thumb.png");
        if (file is not null) form.Add(new ByteArrayContent(file) { Headers = { ContentType = new MediaTypeHeaderValue("video/mp4") } }, "file", fileName);
        return form;
    }

    public static string UploadUrl(Guid courseId, string lesson) => $"/api/v1/admin/learning/courses/{courseId}/lessons/{lesson}/youtube";

    public Task<LessonYouTubeUpload> RowAsync(Guid courseId, string lesson) =>
        Api.WithDbAsync(db => db.Set<LessonYouTubeUpload>().AsNoTracking().SingleAsync(u => u.CourseId == courseId && u.LessonSlug == lesson));

    public async Task<bool> BlobExistsAsync(Guid? storedFileId)
    {
        if (storedFileId is null) return false;
        var key = await Api.WithDbAsync(db => db.Set<StoredFile>().AsNoTracking().Where(f => f.Id == storedFileId).Select(f => f.StorageKey).SingleOrDefaultAsync());
        return key is not null && File.Exists(Path.Combine(Api.StorageDirectory, key));
    }

    public Task<string> LatestContentAsync(Guid courseId) => Api.WithDbAsync(async db =>
    {
        var versionId = await db.Set<Course>().AsNoTracking().Where(c => c.Id == courseId).Select(c => c.LatestVersionId).SingleAsync();
        return await db.Set<CourseVersion>().AsNoTracking().Where(v => v.Id == versionId).Select(v => v.ContentJson).SingleAsync();
    });
}
