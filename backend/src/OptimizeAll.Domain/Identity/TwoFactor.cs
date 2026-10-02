using OptimizeAll.Domain.Common;

namespace OptimizeAll.Domain.Identity;

/// <summary>
/// A user's authenticator app (TOTP, RFC 6238: SHA-1, 6 digits, 30-second steps). At most one per user. A row with
/// <see cref="EnabledAt"/> null is a set-up in progress (secret shown, not yet confirmed with a code): it does not
/// protect sign-in until confirmed. The secret is stored encrypted with ASP.NET Core Data Protection, never in clear.
/// </summary>
public class UserTwoFactor : Entity
{
    public Guid UserId { get; set; }

    /// <summary>The Base32 shared secret, encrypted (Data Protection purpose <c>OptimizeAll.Auth.TwoFactor.Secret.v1</c>).</summary>
    public string SecretCiphertext { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }

    /// <summary>When the user confirmed the set-up with a valid code; null while the set-up is pending.</summary>
    public DateTime? EnabledAt { get; set; }

    /// <summary>
    /// The highest TOTP time step (Unix time / 30 s) accepted so far. A code is accepted only for a later step, so a code
    /// cannot be replayed, not even within its own 30 seconds (RFC 6238 § 5.2).
    /// </summary>
    public long LastUsedTimeStep { get; set; }

    public DateTime? LastUsedAt { get; set; }

    /// <summary>Consecutive wrong codes (any sign-in attempt or settings action); reset by a correct one.</summary>
    public int FailedAttempts { get; set; }

    /// <summary>While in the future, every code is refused (after too many wrong ones).</summary>
    public DateTime? LockoutEndsAt { get; set; }

    public DateTime? RecoveryCodesGeneratedAt { get; set; }
}

/// <summary>A single-use recovery code (SHA-256 of the normalized code; the code itself is shown to the user once).</summary>
public class UserRecoveryCode : Entity
{
    public Guid UserId { get; set; }
    public string CodeHash { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime? UsedAt { get; set; }
}

public enum TwoFactorChallengeKind
{
    /// <summary>The user has two-step verification: enter a code (or a recovery code) to finish signing in.</summary>
    Verify,

    /// <summary>Two-step verification is required for this account by policy but not set up: set it up to finish signing in.</summary>
    Enroll,
}

/// <summary>
/// The pending second step of a sign-in: issued after the first factor (password or Google) succeeded, completed by a
/// valid code. Short-lived, single use (<see cref="ConsumedAt"/>) and limited to a few attempts. The client holds a
/// Data-Protection-signed token naming this row; nothing about the session exists until it is completed.
/// </summary>
public class TwoFactorChallenge : Entity
{
    public Guid UserId { get; set; }
    public TwoFactorChallengeKind Kind { get; set; }

    /// <summary>How the first factor was proven: "password" or "google".</summary>
    public string Method { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public int Attempts { get; set; }
    public DateTime? ConsumedAt { get; set; }

    /// <summary>The user's <see cref="User.SecurityVersion"/> when issued: a password change or forced sign-out voids it.</summary>
    public int SecurityVersion { get; set; }
}
