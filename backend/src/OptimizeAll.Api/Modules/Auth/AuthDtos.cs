using System.ComponentModel.DataAnnotations;

namespace OptimizeAll.Api.Modules.Auth;

public sealed class RegisterRequest
{
    [Required, EmailAddress, MaxLength(254)]
    public string Email { get; set; } = string.Empty;

    [Required, MinLength(10), MaxLength(128)]
    public string Password { get; set; } = string.Empty;

    [Required, MinLength(2), MaxLength(100)]
    public string DisplayName { get; set; } = string.Empty;

    [Required, RegularExpression("^[A-Za-z]{2}$", ErrorMessage = "Use a two-letter country code.")]
    public string CountryCode { get; set; } = string.Empty;

    [MaxLength(10)]
    public string LanguageCode { get; set; } = "en";

    [MaxLength(64)]
    public string TimeZone { get; set; } = "UTC";

    [MaxLength(32)]
    public string? ReferralCode { get; set; }

    [MaxLength(32)]
    public string? InviteCode { get; set; }

    /// <summary>Opaque client device identifier (random per browser); only its hash is stored, for referral fraud checks.</summary>
    [MaxLength(100)]
    public string? DeviceId { get; set; }

    /// <summary>
    /// Where to send the person after they verify their email: a same-site path only (starts with a single "/", no "//",
    /// no scheme, no backslash, at most 200 characters). Anything else is ignored silently (<see cref="RegistrationHints.ReturnTo"/>).
    /// </summary>
    public string? ReturnTo { get; set; }

    /// <summary>"learner" (free Academy) or "creator" (Creators programme), case-insensitive; anything else is ignored (<see cref="RegistrationHints.Audience"/>).</summary>
    public string? Audience { get; set; }

    public bool AcceptTerms { get; set; }
    public bool MarketingEmailOptIn { get; set; }
}

/// <summary>Sanitizing of the optional registration hints (pure, unit-tested): never an error, a bad value is simply dropped.</summary>
public static class RegistrationHints
{
    public const int ReturnToMaxLength = 200;
    public const string Learner = "learner", Creator = "creator";

    /// <summary>The path when it is a safe same-site relative path, else null.</summary>
    public static string? ReturnTo(string? value)
    {
        if (string.IsNullOrEmpty(value) || value.Length > ReturnToMaxLength) return null;
        if (value[0] != '/' || (value.Length > 1 && value[1] == '/')) return null;
        foreach (var c in value)
            if (c == '\\' || char.IsControl(c) || char.IsWhiteSpace(c)) return null;
        // A percent-encoded form ("/%2f/evil", "/%5Cevil") must not turn into a protocol-relative or backslash address either.
        var decoded = Uri.UnescapeDataString(value);
        if (decoded.StartsWith("//", StringComparison.Ordinal) || decoded.Contains('\\') || decoded.Any(char.IsControl)) return null;
        return value;
    }

    /// <summary>"learner" or "creator" (lower case), else null.</summary>
    public static string? Audience(string? value) => value?.Trim().ToLowerInvariant() switch
    {
        Learner => Learner,
        Creator => Creator,
        _ => null,
    };
}

public sealed class LoginRequest
{
    [Required, EmailAddress, MaxLength(254)]
    public string Email { get; set; } = string.Empty;

    [Required, MaxLength(128)]
    public string Password { get; set; } = string.Empty;
}

public sealed class TokenRequest
{
    [Required, MaxLength(200)]
    public string Token { get; set; } = string.Empty;
}

public sealed class EmailRequest
{
    [Required, EmailAddress, MaxLength(254)]
    public string Email { get; set; } = string.Empty;
}

public sealed class ResetPasswordRequest
{
    [Required, MaxLength(200)]
    public string Token { get; set; } = string.Empty;

    [Required, MinLength(10), MaxLength(128)]
    public string NewPassword { get; set; } = string.Empty;
}

public sealed class ChangePasswordRequest
{
    [Required, MaxLength(128)]
    public string CurrentPassword { get; set; } = string.Empty;

    [Required, MinLength(10), MaxLength(128)]
    public string NewPassword { get; set; } = string.Empty;
}

public sealed record SessionUserDto(
    Guid Id,
    string Email,
    string DisplayName,
    bool EmailVerified,
    string CountryCode,
    string LanguageCode,
    string TimeZone,
    string Status,
    IReadOnlyCollection<string> Roles,
    IReadOnlyCollection<string> Permissions,
    bool IsTestAccount = false,
    ImpersonatorDto? ImpersonatedBy = null,
    // Names of the custom roles assigned to the user, sorted (header badges); their permissions are in Permissions.
    IReadOnlyCollection<string>? CustomRoles = null,
    // "learner" or "creator" when the person said so at registration; null otherwise (first-screen hint only).
    string? Audience = null);

/// <summary>Present on the session while a staff member is viewing as this user (impersonation).</summary>
public sealed record ImpersonatorDto(Guid Id, string DisplayName, string Email, DateTime StartedAt, DateTime ExpiresAt);

public sealed class ImpersonateRequest
{
    /// <summary>Why you need to see the account (support ticket, bug report...). Audited.</summary>
    [Required, MinLength(5), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;

    public bool Confirm { get; set; }
}

public sealed record AuthResponse(string AccessToken, DateTime ExpiresAt, SessionUserDto User);

public sealed record MessageResponse(string Message);
