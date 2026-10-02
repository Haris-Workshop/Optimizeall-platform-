using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

namespace OptimizeAll.Api.Common.Http;

/// <summary>
/// The API's rate limiters (see <see cref="RateLimitPolicies.AddAppRateLimiting"/>): the global per-IP limiter and one
/// limiter for the endpoint policies, partitioned per policy and key. A singleton, so the container disposes both (and
/// stops their replenishment timers) when the host stops.
/// </summary>
public sealed class AppRateLimiter : IAsyncDisposable, IDisposable
{
    private readonly Dictionary<string, Func<HttpContext, RateLimitPartition<string>>> _policies;

    public AppRateLimiter(IConfiguration config)
    {
        _policies = RateLimitPolicies.Policies(config);
        Global = PartitionedRateLimiter.Create(RateLimitPolicies.GlobalPartitioner(config));
        Endpoint = PartitionedRateLimiter.Create<HttpContext, PolicyKey>(ctx =>
        {
            var name = ctx.GetEndpoint()?.Metadata.GetMetadata<EnableRateLimitingAttribute>()?.PolicyName
                ?? throw new InvalidOperationException("The endpoint has no rate limiting policy.");
            if (!_policies.TryGetValue(name, out var policy))
                throw new InvalidOperationException($"This endpoint requires a rate limiting policy with name {name}, but no such policy exists.");
            var partition = policy(ctx);
            return RateLimitPartition.Get(new PolicyKey(name, partition.PartitionKey), key => partition.Factory(key.Key));
        });
    }

    public PartitionedRateLimiter<HttpContext> Global { get; }

    /// <summary>Applies the endpoint's <c>[EnableRateLimiting(policy)]</c> limiter.</summary>
    public PartitionedRateLimiter<HttpContext> Endpoint { get; }

    public async ValueTask DisposeAsync()
    {
        await Global.DisposeAsync();
        await Endpoint.DisposeAsync();
    }

    public void Dispose()
    {
        Global.Dispose();
        Endpoint.Dispose();
    }

    private readonly record struct PolicyKey(string Policy, string Key);
}

/// <summary>Applies <see cref="AppRateLimiter"/>: global limiter first, then the endpoint policy; 429 when either refuses.</summary>
public sealed class AppRateLimitingMiddleware(RequestDelegate next, AppRateLimiter limiter)
{
    public Task Invoke(HttpContext context)
    {
        var metadata = context.GetEndpoint()?.Metadata;
        if (metadata?.GetMetadata<DisableRateLimitingAttribute>() is not null) return next(context);
        return InvokeLimited(context, metadata?.GetMetadata<EnableRateLimitingAttribute>() is not null);
    }

    private async Task InvokeLimited(HttpContext context, bool hasPolicy)
    {
        using var global = limiter.Global.AttemptAcquire(context);
        if (!global.IsAcquired)
        {
            await RejectAsync(context, global);
            return;
        }
        using var endpoint = hasPolicy ? limiter.Endpoint.AttemptAcquire(context) : null;
        if (endpoint is { IsAcquired: false })
        {
            await RejectAsync(context, endpoint);
            return;
        }
        await next(context);
    }

    private static async Task RejectAsync(HttpContext context, RateLimitLease lease)
    {
        context.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        context.Response.ContentType = "application/problem+json";
        if (lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
            context.Response.Headers.RetryAfter = ((int)retryAfter.TotalSeconds).ToString();
        await context.Response.WriteAsync(
            "{\"status\":429,\"title\":\"Too many requests. Please wait and try again.\",\"code\":\"rate_limited\"}", context.RequestAborted);
    }
}
