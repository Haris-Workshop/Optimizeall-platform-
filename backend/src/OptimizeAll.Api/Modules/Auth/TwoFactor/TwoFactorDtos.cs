using System.ComponentModel.DataAnnotations;

namespace OptimizeAll.Api.Modules.Auth.TwoFactor;

/// <summary>Tuning of two-step verification (section <c>TwoFactor</c>); the defaults are the documented behaviour.</summary>
public sealed class TwoFactorOptions
{
    public const string Section = "TwoFactor";

    /// <summary>The issuer shown in authenticator apps (and the otpauth label prefix).</summary>
    public string Issuer { get; set; } = "Optimize All";

    /// <summary>Lifetime of the sign-in challenge (enter a code).</summary>
    public int ChallengeMinutes { get; set; } = 5;

    /// <summary>Lifetime of the forced set-up challenge (scan the QR code, then enter a code).</summary>
    public int EnrollmentChallengeMinutes { get; set; } = 15;

    /// <summary>Wrong codes one challenge accepts before it is void (sign in again).</summary>
    public int MaxChallengeAttempts { get; set; } = 5;

    /// <summary>Consecutive wrong codes (across challenges and settings actions) before codes are refused for a while.</summary>
    public int MaxFailedAttempts { get; set; } = 10;

    public int LockoutMinutes { get; set; } = 15;
}

/// <summary>
/// The second step a sign-in still needs (the first factor succeeded; no session exists yet). <c>ChallengeToken</c> is
/// opaque, signed and encrypted, single use: send it back to the verify/enroll endpoints. <c>Kind</c> "verify": enter a
/// code from the authenticator app or a recovery code; "enroll": two-step verification is required for this account and
/// must be set up now (enroll/setup, then enroll/confirm).
/// </summary>
public sealed record TwoFactorChallengeDto(string ChallengeToken, string Kind, DateTime ExpiresAt);

/// <summary>Answer of <c>POST /auth/login</c> (and the Google callback) when a second step is needed instead of a session.</summary>
public sealed record TwoFactorRequiredResponse(TwoFactorChallengeDto TwoFactor);

/// <summary>
/// Two-step verification of the signed-in user. <c>Required</c>: the platform policy requires it for this account (staff),
/// so it can't be turned off. <c>HasPassword</c>: turning it off asks for the password when the account has one.
/// </summary>
public sealed record TwoFactorStatusDto(
    bool Enabled,
    DateTime? EnabledAt,
    bool SetupPending,
    int RecoveryCodesRemaining,
    DateTime? RecoveryCodesGeneratedAt,
    DateTime? LastUsedAt,
    bool Required,
    bool HasPassword);

/// <summary>What the authenticator app needs: the QR code content and the same secret for typing in by hand.</summary>
public sealed record TwoFactorSetupResponse(string Secret, string OtpAuthUri, string Issuer, string AccountName);

/// <summary>New recovery codes, shown once (only hashes are stored).</summary>
public sealed record RecoveryCodesResponse(IReadOnlyList<string> RecoveryCodes);

/// <summary>Forced set-up during sign-in finished: the session plus the recovery codes (shown once).</summary>
public sealed record TwoFactorEnrolledResponse(AuthResponse Auth, IReadOnlyList<string> RecoveryCodes);

public sealed class TwoFactorCodeRequest
{
    /// <summary>The 6-digit code from the authenticator app (spaces allowed).</summary>
    [Required, MaxLength(20)]
    public string Code { get; set; } = string.Empty;
}

public sealed class TwoFactorChallengeRequest
{
    [Required, MaxLength(2000)]
    public string ChallengeToken { get; set; } = string.Empty;
}

public sealed class TwoFactorVerifyRequest
{
    [Required, MaxLength(2000)]
    public string ChallengeToken { get; set; } = string.Empty;

    /// <summary>A code from the authenticator app. Send this or <see cref="RecoveryCode"/>.</summary>
    [MaxLength(20)]
    public string? Code { get; set; }

    /// <summary>One of the recovery codes (single use).</summary>
    [MaxLength(40)]
    public string? RecoveryCode { get; set; }
}

public sealed class TwoFactorEnrollConfirmRequest
{
    [Required, MaxLength(2000)]
    public string ChallengeToken { get; set; } = string.Empty;

    [Required, MaxLength(20)]
    public string Code { get; set; } = string.Empty;
}

public sealed class TwoFactorDisableRequest
{
    /// <summary>The current password (required when the account has one; Google-only accounts have none).</summary>
    [MaxLength(128)]
    public string? Password { get; set; }

    /// <summary>A code from the authenticator app. Send this or <see cref="RecoveryCode"/>.</summary>
    [MaxLength(20)]
    public string? Code { get; set; }

    [MaxLength(40)]
    public string? RecoveryCode { get; set; }
}

public sealed class AdminResetTwoFactorRequest
{
    /// <summary>Why (e.g. the support ticket after the person lost their phone). Audited and required.</summary>
    [Required, MinLength(5), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;

    public bool Confirm { get; set; }
}
