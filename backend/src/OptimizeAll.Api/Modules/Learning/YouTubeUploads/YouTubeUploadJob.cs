using OptimizeAll.Api.Common.Jobs;

namespace OptimizeAll.Api.Modules.Learning.YouTubeUploads;

/// <summary>Every minute: polls videos YouTube is processing and uploads due lecture videos (see <see cref="YouTubeUploadService"/>).</summary>
public sealed class YouTubeUploadJob(YouTubeUploadService uploads) : IJob
{
    public string Name => "YouTubeUploadJob";

    public Task<string> ExecuteAsync(CancellationToken ct) => uploads.ProcessDueAsync(ct);
}
