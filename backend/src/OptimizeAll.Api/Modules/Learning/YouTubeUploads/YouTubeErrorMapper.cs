using System.Net;
using Google;
using Google.Apis.Auth.OAuth2.Responses;

namespace OptimizeAll.Api.Modules.Learning.YouTubeUploads;

/// <summary>Maps exceptions of the Google client library (and the network) to <see cref="YouTubeApiException"/>.</summary>
public static class YouTubeErrorMapper
{
    public static YouTubeApiException Map(Exception ex)
    {
        for (var e = ex; e is not null; e = e.InnerException)
        {
            switch (e)
            {
                case YouTubeApiException already:
                    return already;
                case TokenResponseException token:
                    return FromToken(token);
                case GoogleApiException api:
                    return FromApi(api);
            }
        }
        if (ex is HttpRequestException or TaskCanceledException or TimeoutException or IOException or System.Net.Sockets.SocketException)
            return new YouTubeApiException(YouTubeApiErrorKind.Transient, null, "YouTube could not be reached.", "network", ex);
        return new YouTubeApiException(YouTubeApiErrorKind.Other, null, "An unexpected problem occurred while talking to YouTube.", ex.GetType().Name, ex);
    }

    private static YouTubeApiException FromToken(TokenResponseException ex)
    {
        var code = ex.Error?.Error;
        if (code is "invalid_grant" or "unauthorized_client" or "invalid_client" || ex.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.Unauthorized)
            return new YouTubeApiException(YouTubeApiErrorKind.InvalidGrant, (int?)ex.StatusCode,
                "The YouTube connection is no longer authorized.", code ?? "invalid_grant", ex);
        return new YouTubeApiException(YouTubeApiErrorKind.Transient, (int?)ex.StatusCode, "YouTube sign-in is temporarily unavailable.", code, ex);
    }

    private static YouTubeApiException FromApi(GoogleApiException ex)
    {
        var status = (int)ex.HttpStatusCode;
        var reason = ex.Error?.Errors?.FirstOrDefault()?.Reason;
        switch (reason)
        {
            case "quotaExceeded" or "dailyLimitExceeded" or "uploadLimitExceeded" or "dailyLimitExceededUnreg":
                return new YouTubeApiException(YouTubeApiErrorKind.QuotaExceeded, status, "YouTube's daily quota is used up.", reason, ex);
            case "rateLimitExceeded" or "userRateLimitExceeded" or "concurrentLimitExceeded":
                return new YouTubeApiException(YouTubeApiErrorKind.RateLimited, status, "YouTube asked us to slow down.", reason, ex);
            case "authError" or "invalid_grant":
                return new YouTubeApiException(YouTubeApiErrorKind.InvalidGrant, status, "The YouTube connection is no longer authorized.", reason, ex);
        }
        if (status == 429) return new YouTubeApiException(YouTubeApiErrorKind.RateLimited, status, "YouTube asked us to slow down.", reason, ex);
        if (status >= 500) return new YouTubeApiException(YouTubeApiErrorKind.Transient, status, "YouTube had a temporary problem.", reason, ex);
        if (status is 401 or 403)
            return new YouTubeApiException(YouTubeApiErrorKind.Forbidden, status, "YouTube refused the request for the connected account.", reason, ex);
        return new YouTubeApiException(YouTubeApiErrorKind.Other, status, "YouTube rejected the request.", reason, ex);
    }
}
