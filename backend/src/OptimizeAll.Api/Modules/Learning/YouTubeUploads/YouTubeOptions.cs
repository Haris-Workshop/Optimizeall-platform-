using Microsoft.Extensions.Options;
using OptimizeAll.Domain.Learning;

namespace OptimizeAll.Api.Modules.Learning.YouTubeUploads;

/// <summary>
/// The YouTube connection used to publish lesson lectures (docs/LEARNING.md). The four credentials are read from the
/// environment variables below (by their raw names); none of them is ever logged or returned by the API.
/// <list type="bullet">
/// <item>none set: the feature is off (the admin status endpoint says so, the upload endpoints answer 409);</item>
/// <item>some but not all set: the API refuses to start and names the missing variables;</item>
/// <item>all set: the feature is on.</item>
/// </list>
/// Optional settings live in the <c>YouTube</c> section: <c>YouTube:DefaultPrivacy</c> (private | unlisted | public, default
/// unlisted) and <c>YouTube:MaxUploadBytes</c> (default 2 GiB).
/// </summary>
public sealed class YouTubeOptions
{
    public const string Section = "YouTube";
    public const string ClientIdVariable = "YOUTUBE_CLIENT_ID";
    public const string ClientSecretVariable = "YOUTUBE_CLIENT_SECRET";
    public const string RefreshTokenVariable = "YOUTUBE_REFRESH_TOKEN";
    public const string ChannelIdVariable = "YOUTUBE_CHANNEL_ID";
    public const long DefaultMaxUploadBytes = 2L * 1024 * 1024 * 1024;

    public static readonly IReadOnlyList<string> VariableNames =
        new[] { ClientIdVariable, ClientSecretVariable, RefreshTokenVariable, ChannelIdVariable };

    public string? ClientId { get; set; }
    public string? ClientSecret { get; set; }
    public string? RefreshToken { get; set; }
    /// <summary>The channel the lectures must go to (a public identifier, not a secret).</summary>
    public string? ChannelId { get; set; }
    public YouTubePrivacy DefaultPrivacy { get; set; } = YouTubePrivacy.Unlisted;
    public long MaxUploadBytes { get; set; } = DefaultMaxUploadBytes;

    /// <summary>The names (never the values) of the credentials that are not set.</summary>
    public IReadOnlyList<string> MissingVariables
    {
        get
        {
            var missing = new List<string>();
            if (string.IsNullOrWhiteSpace(ClientId)) missing.Add(ClientIdVariable);
            if (string.IsNullOrWhiteSpace(ClientSecret)) missing.Add(ClientSecretVariable);
            if (string.IsNullOrWhiteSpace(RefreshToken)) missing.Add(RefreshTokenVariable);
            if (string.IsNullOrWhiteSpace(ChannelId)) missing.Add(ChannelIdVariable);
            return missing;
        }
    }

    /// <summary>True when all four credentials are set.</summary>
    public bool Enabled => MissingVariables.Count == 0;

    /// <summary>True when some, but not all, credentials are set (an invalid configuration).</summary>
    public bool Partial => MissingVariables.Count is > 0 and < 4;

    public static void Bind(YouTubeOptions o, IConfiguration config)
    {
        o.ClientId = Trimmed(config[ClientIdVariable]);
        o.ClientSecret = Trimmed(config[ClientSecretVariable]);
        o.RefreshToken = Trimmed(config[RefreshTokenVariable]);
        o.ChannelId = Trimmed(config[ChannelIdVariable]);
        var section = config.GetSection(Section);
        if (Enum.TryParse<YouTubePrivacy>(section["DefaultPrivacy"], ignoreCase: true, out var privacy)) o.DefaultPrivacy = privacy;
        if (long.TryParse(section["MaxUploadBytes"], out var max) && max > 0) o.MaxUploadBytes = max;
    }

    private static string? Trimmed(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

/// <summary>Fails startup for a partly configured YouTube connection (the message names the variables, never their values).</summary>
public sealed class YouTubeOptionsValidator : IValidateOptions<YouTubeOptions>
{
    public ValidateOptionsResult Validate(string? name, YouTubeOptions options) =>
        options.Partial
            ? ValidateOptionsResult.Fail(
                "The YouTube connection is only partly configured. Set all of " + string.Join(", ", YouTubeOptions.VariableNames) +
                " or none of them. Missing: " + string.Join(", ", options.MissingVariables) + ".")
            : ValidateOptionsResult.Success;
}

/// <summary>Logs once at startup whether lecture uploads to YouTube are available (no values).</summary>
public sealed class YouTubeStartupLogger(IOptions<YouTubeOptions> options, ILogger<YouTubeStartupLogger> logger) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken)
    {
        var o = options.Value;
        if (o.Enabled)
            logger.LogInformation("YouTube lecture uploads are enabled for channel {ChannelId} (default privacy {Privacy}, max upload {MaxBytes} bytes)",
                o.ChannelId, o.DefaultPrivacy, o.MaxUploadBytes);
        else
            logger.LogInformation("YouTube lecture uploads are disabled: set {Variables} to enable them", string.Join(", ", YouTubeOptions.VariableNames));
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
