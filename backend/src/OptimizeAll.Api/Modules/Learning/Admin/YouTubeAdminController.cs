using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.Extensions.Options;
using OptimizeAll.Api.Common.Http;
using OptimizeAll.Api.Common.Security;
using OptimizeAll.Api.Modules.Learning.YouTubeUploads;

namespace OptimizeAll.Api.Modules.Learning.Admin;

/// <summary>
/// Raises the request limits of the lecture upload action only (not the whole API): the body may be as large as
/// <see cref="YouTubeOptions.MaxUploadBytes"/> plus a thumbnail and form overhead. The body is read as a stream by
/// <see cref="YouTubeUploadIntake"/>: the form value providers are removed for this action (they would read the whole form,
/// buffering the video, before the action runs), so the multipart form limit never applies either.
/// </summary>
[AttributeUsage(AttributeTargets.Method)]
public sealed class YouTubeUploadLimitsAttribute : Attribute, IResourceFilter
{
    public void OnResourceExecuting(ResourceExecutingContext context)
    {
        var factories = context.ValueProviderFactories;
        for (var i = factories.Count - 1; i >= 0; i--)
            if (factories[i] is FormValueProviderFactory or FormFileValueProviderFactory or JQueryFormValueProviderFactory) factories.RemoveAt(i);
        var max = context.HttpContext.RequestServices.GetRequiredService<IOptions<YouTubeOptions>>().Value.MaxUploadBytes;
        var bodyLimit = context.HttpContext.Features.Get<IHttpMaxRequestBodySizeFeature>();
        if (bodyLimit is { IsReadOnly: false }) bodyLimit.MaxRequestBodySize = max + YouTubeUploadIntake.MaxThumbnailBytes + (1 << 20);
    }

    public void OnResourceExecuted(ResourceExecutedContext context)
    {
    }
}

/// <summary>Lecture uploads to YouTube (docs/LEARNING.md): connection status, a course's uploads, upload, retry and resync. Admin only (learning.manage).</summary>
[ApiController]
[HasPermission(Permissions.LearningManage)]
[Route("api/v1/admin/learning")]
public sealed class YouTubeAdminController(YouTubeUploadService uploads, YouTubeUploadIntake intake, ICurrentUser currentUser) : ControllerBase
{
    /// <summary>Whether the YouTube connection is configured and which channel it reaches. Never returns credentials.</summary>
    [HttpGet("youtube/status")]
    public Task<YouTubeStatusDto> Status(CancellationToken ct) => uploads.StatusAsync(ct);

    [HttpGet("courses/{courseId:guid}/youtube")]
    public Task<CourseYouTubeDto> Course(Guid courseId, CancellationToken ct) => uploads.CourseAsync(courseId, ct);

    /// <summary>
    /// Queues the lesson's lecture video for YouTube (multipart: <c>file</c> required; <c>privacy</c> private|unlisted|public,
    /// <c>publish</c> true|false, <c>thumbnail</c> PNG/JPEG optional). Idempotent: a lesson with an upload in progress or a
    /// video already on YouTube gets that upload back.
    /// </summary>
    [HttpPost("courses/{courseId:guid}/lessons/{lessonSlug}/youtube")]
    [YouTubeUploadLimits]
    [ProducesResponseType(typeof(YouTubeUploadDto), StatusCodes.Status202Accepted)]
    public async Task<IActionResult> Upload(Guid courseId, string lessonSlug, CancellationToken ct)
    {
        if (await uploads.PrepareAsync(courseId, lessonSlug, ct) is { } existing) return Accepted(existing);
        var maxBytes = HttpContext.RequestServices.GetRequiredService<IOptions<YouTubeOptions>>().Value.MaxUploadBytes;
        var staged = await intake.ReadAsync(Request.Body, Request.ContentType, maxBytes, ct);
        return Accepted(await uploads.EnqueueAsync(currentUser.Id, courseId, lessonSlug, staged, ct));
    }

    /// <summary>Queues a failed upload again (attempts reset).</summary>
    [HttpPost("courses/{courseId:guid}/lessons/{lessonSlug}/youtube/retry")]
    [ProducesResponseType(typeof(YouTubeUploadDto), StatusCodes.Status202Accepted)]
    public async Task<IActionResult> Retry(Guid courseId, string lessonSlug, CancellationToken ct) =>
        Accepted(await uploads.RetryAsync(currentUser.Id, courseId, lessonSlug, ct));

    /// <summary>Re-reads the video from YouTube and repairs the status, privacy and notice.</summary>
    [HttpPost("courses/{courseId:guid}/lessons/{lessonSlug}/youtube/resync")]
    public Task<YouTubeUploadDto> Resync(Guid courseId, string lessonSlug, CancellationToken ct) =>
        uploads.ResyncAsync(currentUser.Id, courseId, lessonSlug, ct);
}
