using Google.Apis.Auth.OAuth2;
using Google.Apis.Auth.OAuth2.Flows;
using Google.Apis.Auth.OAuth2.Responses;
using Google.Apis.Services;
using Google.Apis.Upload;
using Google.Apis.YouTube.v3;
using Google.Apis.YouTube.v3.Data;
using Microsoft.Extensions.Options;
using OptimizeAll.Domain.Learning;

namespace OptimizeAll.Api.Modules.Learning.YouTubeUploads;

/// <summary>
/// <see cref="IYouTubeGateway"/> on the YouTube Data API v3 (Google.Apis.YouTube.v3) with OAuth2 refresh-token credentials.
/// The access token is refreshed by the client library when needed; neither it nor the refresh token is ever logged.
/// </summary>
public sealed class GoogleYouTubeGateway(IOptions<YouTubeOptions> options, ILogger<GoogleYouTubeGateway> logger) : IYouTubeGateway, IDisposable
{
    private const int ChunkSize = 8 * 1024 * 1024; // a multiple of 256 KiB, as the resumable protocol requires
    private readonly object _gate = new();
    private YouTubeService? _service;

    private YouTubeService Service
    {
        get
        {
            lock (_gate)
            {
                if (_service is not null) return _service;
                var o = options.Value;
                if (!o.Enabled) throw new InvalidOperationException("The YouTube connection is not configured.");
                var flow = new GoogleAuthorizationCodeFlow(new GoogleAuthorizationCodeFlow.Initializer
                {
                    ClientSecrets = new ClientSecrets { ClientId = o.ClientId, ClientSecret = o.ClientSecret },
                    Scopes = new[] { YouTubeService.Scope.Youtube },
                });
                var credential = new UserCredential(flow, "optimizeall-youtube", new TokenResponse { RefreshToken = o.RefreshToken });
                return _service = new YouTubeService(new BaseClientService.Initializer
                {
                    HttpClientInitializer = credential,
                    ApplicationName = "OptimizeAll Academy",
                });
            }
        }
    }

    public async Task<YouTubeChannel> GetChannelAsync(CancellationToken ct)
    {
        var channel = await Run(async () =>
        {
            var request = Service.Channels.List("id,snippet");
            request.Mine = true;
            return (await request.ExecuteAsync(ct)).Items?.FirstOrDefault();
        });
        return channel is null
            ? throw new YouTubeApiException(YouTubeApiErrorKind.Forbidden, null, "The connected Google account has no YouTube channel.", "no_channel")
            : new YouTubeChannel(channel.Id, channel.Snippet?.Title ?? string.Empty);
    }

    public Task<string> EnsurePlaylistAsync(string? existingPlaylistId, string title, string description, YouTubePrivacy privacy, CancellationToken ct) => Run(async () =>
    {
        if (!string.IsNullOrEmpty(existingPlaylistId))
        {
            var list = Service.Playlists.List("id");
            list.Id = existingPlaylistId;
            if ((await list.ExecuteAsync(ct)).Items?.Count > 0) return existingPlaylistId;
        }
        var playlist = new Playlist
        {
            Snippet = new PlaylistSnippet { Title = Truncate(title, 150), Description = Truncate(description, 5000) },
            Status = new PlaylistStatus { PrivacyStatus = PrivacyValue(privacy == YouTubePrivacy.Public ? YouTubePrivacy.Public : YouTubePrivacy.Unlisted) },
        };
        var created = await Service.Playlists.Insert(playlist, "snippet,status").ExecuteAsync(ct);
        return created.Id;
    });

    public async Task<string> UploadVideoAsync(Stream content, YouTubeVideoMetadata metadata, Action<long> onProgress, CancellationToken ct)
    {
        var video = new Video
        {
            Snippet = new VideoSnippet
            {
                Title = metadata.Title,
                Description = metadata.Description,
                Tags = metadata.Tags.ToList(),
                CategoryId = metadata.CategoryId,
                DefaultLanguage = "en",
                DefaultAudioLanguage = "en",
            },
            Status = new VideoStatus
            {
                PrivacyStatus = PrivacyValue(metadata.Privacy),
                SelfDeclaredMadeForKids = false,
                Embeddable = true,
                License = "youtube",
                ContainsSyntheticMedia = true,
            },
        };
        string? videoId = null;
        IUploadProgress progress;
        try
        {
            var insert = Service.Videos.Insert(video, "snippet,status", content, "video/*");
            insert.ChunkSize = ChunkSize;
            insert.ProgressChanged += p => { if (p.Status == UploadStatus.Uploading) onProgress(p.BytesSent); };
            insert.ResponseReceived += v => videoId = v.Id;
            progress = await insert.UploadAsync(ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            throw YouTubeErrorMapper.Map(ex);
        }
        if (progress.Status == UploadStatus.Completed && YouTube.IsId(videoId)) return videoId!;
        if (progress.Exception is { } failure) throw YouTubeErrorMapper.Map(failure);
        logger.LogWarning("YouTube upload ended with status {Status} and no video id", progress.Status);
        throw new YouTubeApiException(YouTubeApiErrorKind.Transient, null, "YouTube did not confirm the upload.", "upload_incomplete");
    }

    public async Task<YouTubeVideoStatus> GetVideoStatusAsync(string videoId, CancellationToken ct)
    {
        var video = await Run(async () =>
        {
            var request = Service.Videos.List("status,processingDetails");
            request.Id = videoId;
            return (await request.ExecuteAsync(ct)).Items?.FirstOrDefault();
        });
        if (video is null) return new YouTubeVideoStatus(videoId, YouTubeProcessingState.Missing, null, null);
        var privacy = video.Status?.PrivacyStatus?.ToLowerInvariant() switch
        {
            "private" => YouTubePrivacy.Private,
            "unlisted" => YouTubePrivacy.Unlisted,
            "public" => YouTubePrivacy.Public,
            _ => (YouTubePrivacy?)null,
        };
        var upload = video.Status?.UploadStatus?.ToLowerInvariant();
        var processing = video.ProcessingDetails?.ProcessingStatus?.ToLowerInvariant();
        if (upload is "failed" or "rejected" or "deleted" || processing is "failed" or "terminated")
            return new YouTubeVideoStatus(videoId, YouTubeProcessingState.Failed, privacy, FailureText(video, upload));
        var done = processing == "succeeded" || (processing is null && upload == "processed");
        return new YouTubeVideoStatus(videoId, done ? YouTubeProcessingState.Succeeded : YouTubeProcessingState.Processing, privacy, null);
    }

    public Task AddToPlaylistAsync(string playlistId, string videoId, int position, CancellationToken ct) => Run(async () =>
    {
        var item = new PlaylistItem
        {
            Snippet = new PlaylistItemSnippet
            {
                PlaylistId = playlistId,
                Position = position >= 0 ? position : null,
                ResourceId = new ResourceId { Kind = "youtube#video", VideoId = videoId },
            },
        };
        await Service.PlaylistItems.Insert(item, "snippet").ExecuteAsync(ct);
        return true;
    });

    public async Task<IReadOnlyList<string>> GetPlaylistVideoIdsAsync(string playlistId, CancellationToken ct)
    {
        var ids = new List<string>();
        string? pageToken = null;
        for (var page = 0; page < 4; page++)
        {
            var response = await Run(async () =>
            {
                var request = Service.PlaylistItems.List("contentDetails");
                request.PlaylistId = playlistId;
                request.MaxResults = 50;
                request.PageToken = pageToken;
                return await request.ExecuteAsync(ct);
            });
            ids.AddRange((response.Items ?? new List<PlaylistItem>()).Select(i => i.ContentDetails?.VideoId).Where(v => !string.IsNullOrEmpty(v))!);
            pageToken = response.NextPageToken;
            if (string.IsNullOrEmpty(pageToken)) break;
        }
        return ids;
    }

    public Task DeletePlaylistAsync(string playlistId, CancellationToken ct) => Run(async () =>
    {
        await Service.Playlists.Delete(playlistId).ExecuteAsync(ct);
        return true;
    });

    public Task<string?> FindUploadByMarkerAsync(string marker, CancellationToken ct) => Run(async () =>
    {
        var channels = Service.Channels.List("contentDetails");
        channels.Mine = true;
        var uploads = (await channels.ExecuteAsync(ct)).Items?.FirstOrDefault()?.ContentDetails?.RelatedPlaylists?.Uploads;
        if (string.IsNullOrEmpty(uploads)) return null;
        var items = Service.PlaylistItems.List("contentDetails");
        items.PlaylistId = uploads;
        items.MaxResults = 50;
        var ids = ((await items.ExecuteAsync(ct)).Items ?? new List<PlaylistItem>()).Select(i => i.ContentDetails?.VideoId).Where(v => !string.IsNullOrEmpty(v)).ToList();
        if (ids.Count == 0) return null;
        // The playlist item's description can be cut short; the video resource carries the whole description.
        var videos = Service.Videos.List("snippet");
        videos.Id = string.Join(',', ids);
        return (await videos.ExecuteAsync(ct)).Items?.FirstOrDefault(v => v.Snippet?.Description?.Contains(marker, StringComparison.Ordinal) == true)?.Id;
    });

    public Task SetThumbnailAsync(string videoId, Stream image, string contentType, CancellationToken ct) => Run(async () =>
    {
        var progress = await Service.Thumbnails.Set(videoId, image, contentType).UploadAsync(ct);
        if (progress.Exception is { } failure) throw failure;
        return true;
    });

    private static async Task<T> Run<T>(Func<Task<T>> call)
    {
        try
        {
            return await call();
        }
        catch (YouTubeApiException)
        {
            throw;
        }
        catch (Exception ex) when (ex is not OperationCanceledException || ex is TaskCanceledException { InnerException: TimeoutException })
        {
            throw YouTubeErrorMapper.Map(ex);
        }
    }

    private static string FailureText(Video video, string? upload)
    {
        var reason = video.Status?.RejectionReason ?? video.Status?.FailureReason ?? video.ProcessingDetails?.ProcessingFailureReason;
        var text = reason switch
        {
            "duplicate" => "YouTube rejected the video as a duplicate of one already uploaded.",
            "copyright" => "YouTube rejected the video for a copyright claim.",
            "length" => "YouTube rejected the video because of its length.",
            "termsOfUse" => "YouTube rejected the video for violating its terms of use.",
            "trademark" => "YouTube rejected the video for a trademark claim.",
            "uploadAborted" => "The upload was aborted before YouTube received the whole file.",
            "transcodeFailed" => "YouTube could not convert the video; re-export it as H.264 MP4 and try again.",
            "streamingFailed" or "processingFailed" or "other" => "YouTube could not process the video; re-export it and try again.",
            _ => null,
        };
        return text ?? (upload == "deleted" ? "The video was deleted on YouTube." : "YouTube could not process the video.");
    }

    private static string PrivacyValue(YouTubePrivacy privacy) => privacy.ToString().ToLowerInvariant();

    private static string Truncate(string value, int max) => value.Length <= max ? value : value[..max];

    public void Dispose() => _service?.Dispose();
}
