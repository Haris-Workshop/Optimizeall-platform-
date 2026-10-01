using OptimizeAll.Api.Common.Jobs;

namespace OptimizeAll.Api.Modules.Learning.YouTubeUploads;

/// <summary>Every minute: claims due lecture videos and uploads them (see <see cref="YouTubeUploadService"/>).</summary>
public sealed class YouTubeUploadJob(YouTubeUploadService uploads) : IJob
{
    public string Name => "YouTubeUploadJob";

    public Task<string> ExecuteAsync(CancellationToken ct) => uploads.ProcessUploadsAsync(ct);
}

/// <summary>
/// Every minute, independent of <see cref="YouTubeUploadJob"/> (its own name and lease, so a long upload never delays it):
/// follows videos YouTube is processing, links ready ones into their lesson and cleans up stored files.
/// </summary>
public sealed class YouTubeProcessingJob(YouTubeUploadService uploads) : IJob
{
    public string Name => "YouTubeProcessingJob";

    public Task<string> ExecuteAsync(CancellationToken ct) => uploads.ProcessProcessingAsync(ct);
}
