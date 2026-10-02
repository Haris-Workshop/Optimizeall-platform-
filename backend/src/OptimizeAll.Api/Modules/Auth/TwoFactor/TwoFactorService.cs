using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using OptimizeAll.Api.Common.Audit;
using OptimizeAll.Api.Common.Security;
using OptimizeAll.Api.Common.Settings;
using OptimizeAll.Domain.Common;
using OptimizeAll.Domain.Identity;
using OptimizeAll.Domain.Settings;
using OptimizeAll.Infrastructure.Persistence;

namespace OptimizeAll.Api.Modules.Auth.TwoFactor;

/// <summary>A sign-in challenge that was completed: the user to start a session for.</summary>
public sealed record CompletedChallenge(User User, string Method, string Factor);

/// <summary>
/// Two-step verification with an authenticator app (TOTP) and recovery codes.
/// <list type="bullet">
/// <item>Set-up: <see cref="BeginSetupAsync"/> stores a new secret (encrypted with Data Protection) as pending and returns
/// it with the otpauth URI for the QR code; <see cref="ConfirmSetupAsync"/> turns it on once a code from the app matches
/// and returns 10 recovery codes (stored as keyed hashes, shown once).</item>
/// <item>Sign-in: after the first factor, <see cref="ChallengeForAsync"/> issues a challenge (enter a code, or, when the
/// staff policy requires it and it is not set up, set it up now). The challenge row is single use, expires after a few
/// minutes, allows <see cref="TwoFactorOptions.MaxChallengeAttempts"/> tries and dies with a password change. The client
/// holds a Data-Protection token naming the row.</item>
/// <item>Codes: ±1 time step of drift; a code is only accepted for a time step after the last accepted one (no replay),
/// enforced by a conditional update so two concurrent requests can't both use it. Wrong codes count per user:
/// <see cref="TwoFactorOptions.MaxFailedAttempts"/> in a row lock code entry for <see cref="TwoFactorOptions.LockoutMinutes"/>.</item>
/// </list>
/// Every change and sign-in outcome is audited; enabling, disabling and using a recovery code email the account owner.
/// </summary>
public sealed class TwoFactorService(
    AppDbContext db,
    IDataProtectionProvider protection,
    IPasswordHasher<User> hasher,
    IPrivacyHasher privacyHasher,
    ISettingsService settings,
    IPermissionDirectory directory,
    IAuditLogger audit,
    Notifications.Templates.AccountEmails accountEmails,
    IOptions<TwoFactorOptions> options,
    TimeProvider clock,
    ILogger<TwoFactorService> logger)
{
    public const string KindVerify = "verify";
    public const string KindEnroll = "enroll";
    public const string MethodPassword = "password";
    public const string MethodGoogle = "google";
    private const string FactorTotp = "totp";
    private const string FactorRecovery = "recovery_code";

    private readonly IDataProtector _secrets = protection.CreateProtector("OptimizeAll.Auth.TwoFactor.Secret.v1");
    private readonly IDataProtector _challenges = protection.CreateProtector("OptimizeAll.Auth.TwoFactor.Challenge.v1");
    private TwoFactorOptions Options => options.Value;
    private DateTime Now => clock.GetUtcNow().UtcDateTime;

    private sealed record ChallengePayload(Guid Id, Guid UserId, DateTime ExpiresAt);

    // ---------- Policy ----------

    /// <summary>Whether the staff policy is on and the user holds any staff permission (built-in or custom role).</summary>
    public async Task<bool> IsRequiredAsync(Guid userId, CancellationToken ct)
    {
        if (!await settings.GetAsync(SettingKeys.RequireTwoFactorForStaff, false, ct)) return false;
        return (await directory.StaffAmongAsync(new[] { userId }, ct)).Count > 0;
    }

    public Task<bool> IsEnabledAsync(Guid userId, CancellationToken ct) =>
        db.Set<UserTwoFactor>().AnyAsync(t => t.UserId == userId && t.EnabledAt != null, ct);

    /// <summary>Required by policy but not set up: such a user can't keep or start a session (or impersonate).</summary>
    public async Task<bool> NeedsEnrollmentAsync(Guid userId, CancellationToken ct) =>
        await IsRequiredAsync(userId, ct) && !await IsEnabledAsync(userId, ct);

    public static DomainException EnrollmentRequired(DomainErrorKind kind = DomainErrorKind.Forbidden) =>
        new("auth.2fa_enrollment_required",
            "Two-step verification is required for staff accounts. Sign in again to set it up.", kind);

    // ---------- Status and self-service ----------

    public async Task<TwoFactorStatusDto> GetStatusAsync(Guid userId, CancellationToken ct)
    {
        var row = await db.Set<UserTwoFactor>().AsNoTracking().FirstOrDefaultAsync(t => t.UserId == userId, ct);
        var enabled = row?.EnabledAt is not null;
        var remaining = enabled ? await db.Set<UserRecoveryCode>().CountAsync(c => c.UserId == userId && c.UsedAt == null, ct) : 0;
        var passwordHash = await db.Set<User>().Where(u => u.Id == userId).Select(u => u.PasswordHash).FirstAsync(ct);
        return new TwoFactorStatusDto(enabled, row?.EnabledAt, row is { EnabledAt: null }, remaining,
            enabled ? row!.RecoveryCodesGeneratedAt : null, enabled ? row!.LastUsedAt : null,
            await IsRequiredAsync(userId, ct), !string.IsNullOrEmpty(passwordHash));
    }

    /// <summary>Creates (or replaces) the pending set-up with a new secret. Refused while two-step verification is on.</summary>
    public async Task<TwoFactorSetupResponse> BeginSetupAsync(Guid userId, CancellationToken ct)
    {
        var user = await db.Set<User>().AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId, ct) ?? throw DomainException.NotFound("User");
        var row = await db.Set<UserTwoFactor>().FirstOrDefaultAsync(t => t.UserId == userId, ct);
        if (row?.EnabledAt is not null)
            throw DomainException.Conflict("auth.2fa_already_enabled", "Two-step verification is already on for this account.");

        var secret = Totp.NewSecret();
        var base32 = Totp.Base32Encode(secret);
        if (row is null)
        {
            row = new UserTwoFactor { UserId = userId, CreatedAt = Now };
            db.Set<UserTwoFactor>().Add(row);
        }
        row.SecretCiphertext = _secrets.Protect(base32);
        row.CreatedAt = Now;
        row.LastUsedTimeStep = 0;
        audit.Record("auth.2fa_setup_started", nameof(User), userId);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (Common.Errors.ProblemExceptionHandler.IsUniqueViolation(ex))
        {
            throw DomainException.Conflict("auth.2fa_setup_conflict", "Set-up was started in another window. Start again.");
        }
        return new TwoFactorSetupResponse(GroupSecret(base32), Totp.OtpAuthUri(Options.Issuer, user.Email, base32), Options.Issuer, user.Email);
    }

    /// <summary>Turns two-step verification on once a code from the app matches the pending secret; returns the recovery codes.</summary>
    public async Task<IReadOnlyList<string>> ConfirmSetupAsync(Guid userId, string code, CancellationToken ct)
    {
        var row = await db.Set<UserTwoFactor>().AsNoTracking().FirstOrDefaultAsync(t => t.UserId == userId, ct);
        if (row is null)
            throw DomainException.Conflict("auth.2fa_no_setup", "Start the set-up first: scan the QR code, then enter a code.");
        if (row.EnabledAt is not null)
            throw DomainException.Conflict("auth.2fa_already_enabled", "Two-step verification is already on for this account.");
        await VerifyTotpAsync(row, code, ct);

        // Only the pending row is enabled (a concurrent confirmation can't enable it twice or issue two code sets).
        var enabled = await db.Set<UserTwoFactor>().Where(t => t.Id == row.Id && t.EnabledAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.EnabledAt, Now), ct);
        if (enabled == 0)
            throw DomainException.Conflict("auth.2fa_already_enabled", "Two-step verification is already on for this account.");
        var codes = await ReplaceRecoveryCodesAsync(userId, row.Id, ct);
        audit.Record("auth.2fa_enabled", nameof(User), userId, after: new { recoveryCodes = codes.Count });
        await db.SaveChangesAsync(ct);
        await NotifyAsync(userId, (user, c) => accountEmails.SendTwoFactorEnabledAsync(user, c), ct);
        return codes;
    }

    /// <summary>Turns two-step verification off: needs the password (when the account has one) and a current code or a recovery code.</summary>
    public async Task DisableAsync(Guid userId, TwoFactorDisableRequest request, CancellationToken ct)
    {
        var row = await db.Set<UserTwoFactor>().AsNoTracking().FirstOrDefaultAsync(t => t.UserId == userId && t.EnabledAt != null, ct)
                  ?? throw NotEnabled();
        if (await IsRequiredAsync(userId, ct))
            throw DomainException.Conflict("auth.2fa_required_by_policy",
                "Two-step verification is required for staff accounts, so it can't be turned off. You can set it up on a new " +
                "phone by asking an administrator to reset it.");
        var user = await db.Set<User>().AsNoTracking().FirstAsync(u => u.Id == userId, ct);
        if (!string.IsNullOrEmpty(user.PasswordHash) &&
            (string.IsNullOrEmpty(request.Password) ||
             hasher.VerifyHashedPassword(user, user.PasswordHash, request.Password) == PasswordVerificationResult.Failed))
            throw FieldError("auth.invalid_password", "password", "Your password is incorrect.");
        await VerifyCodeOrRecoveryAsync(row, request.Code, request.RecoveryCode, ct);

        await RemoveAsync(userId, ct);
        audit.Record("auth.2fa_disabled", nameof(User), userId);
        await db.SaveChangesAsync(ct);
        await NotifyAsync(userId, (u, c) => accountEmails.SendTwoFactorDisabledAsync(u, byAdministrator: false, c), ct);
    }

    /// <summary>Replaces the recovery codes (the old ones stop working); needs a current code from the app.</summary>
    public async Task<IReadOnlyList<string>> RegenerateRecoveryCodesAsync(Guid userId, string code, CancellationToken ct)
    {
        var row = await db.Set<UserTwoFactor>().AsNoTracking().FirstOrDefaultAsync(t => t.UserId == userId && t.EnabledAt != null, ct)
                  ?? throw NotEnabled();
        await VerifyTotpAsync(row, code, ct);
        var codes = await ReplaceRecoveryCodesAsync(userId, row.Id, ct);
        audit.Record("auth.2fa_recovery_codes_regenerated", nameof(User), userId, after: new { recoveryCodes = codes.Count });
        await db.SaveChangesAsync(ct);
        return codes;
    }

    /// <summary>
    /// Administrator reset (lost phone): removes the authenticator, the recovery codes and open sign-in challenges. The
    /// caller audits it with the reason, ends the user's sessions and saves. Returns false when nothing was set up.
    /// </summary>
    public async Task<bool> ResetAsync(Guid userId, CancellationToken ct)
    {
        var existed = await db.Set<UserTwoFactor>().AnyAsync(t => t.UserId == userId, ct);
        await RemoveAsync(userId, ct);
        return existed;
    }

    public Task NotifyResetAsync(Guid userId, CancellationToken ct) =>
        NotifyAsync(userId, (u, c) => accountEmails.SendTwoFactorDisabledAsync(u, byAdministrator: true, c), ct);

    private async Task RemoveAsync(Guid userId, CancellationToken ct)
    {
        await db.Set<UserRecoveryCode>().Where(c => c.UserId == userId).ExecuteDeleteAsync(ct);
        await db.Set<TwoFactorChallenge>().Where(c => c.UserId == userId).ExecuteDeleteAsync(ct);
        await db.Set<UserTwoFactor>().Where(t => t.UserId == userId).ExecuteDeleteAsync(ct);
    }

    // ---------- Sign-in challenge ----------

    /// <summary>
    /// The second step for a user who just proved the first factor, or null when none is needed (two-step verification
    /// off and not required). Staged; the caller saves.
    /// </summary>
    public async Task<TwoFactorChallengeDto?> ChallengeForAsync(User user, string method, CancellationToken ct)
    {
        TwoFactorChallengeKind kind;
        if (await IsEnabledAsync(user.Id, ct)) kind = TwoFactorChallengeKind.Verify;
        else if (await IsRequiredAsync(user.Id, ct)) kind = TwoFactorChallengeKind.Enroll;
        else return null;

        // Old challenges of this user are no longer needed (each sign-in issues a fresh one).
        var stale = Now.AddDays(-1);
        await db.Set<TwoFactorChallenge>().Where(c => c.UserId == user.Id && (c.ExpiresAt < stale || c.ConsumedAt != null))
            .ExecuteDeleteAsync(ct);

        var lifetime = kind == TwoFactorChallengeKind.Enroll ? Options.EnrollmentChallengeMinutes : Options.ChallengeMinutes;
        var challenge = new TwoFactorChallenge
        {
            UserId = user.Id,
            Kind = kind,
            Method = method,
            CreatedAt = Now,
            ExpiresAt = Now.AddMinutes(Math.Clamp(lifetime, 1, 60)),
            SecurityVersion = user.SecurityVersion,
        };
        db.Set<TwoFactorChallenge>().Add(challenge);
        audit.Record(kind == TwoFactorChallengeKind.Verify ? "auth.2fa_challenge_issued" : "auth.2fa_enrollment_required",
            nameof(User), user.Id, after: new { method });
        var token = Base64UrlEncoder.Encode(_challenges.Protect(
            JsonSerializer.SerializeToUtf8Bytes(new ChallengePayload(challenge.Id, user.Id, challenge.ExpiresAt))));
        return new TwoFactorChallengeDto(token, kind == TwoFactorChallengeKind.Verify ? KindVerify : KindEnroll, challenge.ExpiresAt);
    }

    /// <summary>Completes a "verify" challenge with an app code or a recovery code; the caller starts the session.</summary>
    public async Task<CompletedChallenge> VerifyChallengeAsync(TwoFactorVerifyRequest request, CancellationToken ct)
    {
        var (challenge, user) = await OpenChallengeAsync(request.ChallengeToken, TwoFactorChallengeKind.Verify, ct);
        var row = await db.Set<UserTwoFactor>().AsNoTracking().FirstOrDefaultAsync(t => t.UserId == user.Id && t.EnabledAt != null, ct)
                  ?? throw ChallengeExpired(); // reset by an administrator in the meantime
        await CountAttemptAsync(challenge, ct);
        string factor;
        try
        {
            factor = await VerifyCodeOrRecoveryAsync(row, request.Code, request.RecoveryCode, ct);
        }
        catch (DomainException ex) when (ex.Code == InvalidCodeCode)
        {
            audit.Record("auth.2fa_failed", nameof(User), user.Id, after: new { method = challenge.Method });
            await db.SaveChangesAsync(ct);
            throw;
        }
        await ConsumeAsync(challenge, ct);
        audit.Record("auth.2fa_verified", nameof(User), user.Id, after: new { method = challenge.Method, factor });
        return new CompletedChallenge(user, challenge.Method, factor);
    }

    /// <summary>Forced set-up during sign-in, step 1: the secret and QR code content (an "enroll" challenge only).</summary>
    public async Task<TwoFactorSetupResponse> BeginEnrollmentAsync(string challengeToken, CancellationToken ct)
    {
        var (_, user) = await OpenChallengeAsync(challengeToken, TwoFactorChallengeKind.Enroll, ct);
        return await BeginSetupAsync(user.Id, ct);
    }

    /// <summary>Forced set-up during sign-in, step 2: confirm with a code; returns the user (for the session) and the recovery codes.</summary>
    public async Task<(CompletedChallenge Completed, IReadOnlyList<string> RecoveryCodes)> ConfirmEnrollmentAsync(
        TwoFactorEnrollConfirmRequest request, CancellationToken ct)
    {
        var (challenge, user) = await OpenChallengeAsync(request.ChallengeToken, TwoFactorChallengeKind.Enroll, ct);
        await CountAttemptAsync(challenge, ct);
        var codes = await ConfirmSetupAsync(user.Id, request.Code, ct);
        await ConsumeAsync(challenge, ct);
        return (new CompletedChallenge(user, challenge.Method, FactorTotp), codes);
    }

    private async Task<(TwoFactorChallenge Challenge, User User)> OpenChallengeAsync(string token, TwoFactorChallengeKind kind, CancellationToken ct)
    {
        ChallengePayload? payload;
        try
        {
            payload = JsonSerializer.Deserialize<ChallengePayload>(_challenges.Unprotect(Base64UrlEncoder.DecodeBytes(token)));
        }
        catch (Exception ex) when (ex is CryptographicException or FormatException or JsonException or ArgumentException)
        {
            payload = null;
        }
        if (payload is null || payload.ExpiresAt <= Now) throw ChallengeExpired();
        var challenge = await db.Set<TwoFactorChallenge>().AsNoTracking().FirstOrDefaultAsync(c => c.Id == payload.Id, ct);
        if (challenge is null || challenge.UserId != payload.UserId || challenge.Kind != kind || challenge.ConsumedAt is not null ||
            challenge.ExpiresAt <= Now || challenge.Attempts >= Options.MaxChallengeAttempts)
            throw ChallengeExpired();
        var user = await db.Set<User>().AsNoTracking().Include(u => u.Roles).FirstOrDefaultAsync(u => u.Id == challenge.UserId, ct);
        if (user is null || user.SecurityVersion != challenge.SecurityVersion) throw ChallengeExpired();
        if (user.Status != UserStatus.Active)
            throw DomainException.Forbidden("account.suspended",
                user.Status == UserStatus.Suspended
                    ? "Your account is suspended. Contact support if you believe this is a mistake."
                    : "This account has been deactivated.");
        return (challenge, user);
    }

    /// <summary>Counts a try against the challenge (atomically, so parallel guesses all count); a used-up challenge is void.</summary>
    private async Task CountAttemptAsync(TwoFactorChallenge challenge, CancellationToken ct)
    {
        var max = Options.MaxChallengeAttempts;
        var counted = await db.Set<TwoFactorChallenge>()
            .Where(c => c.Id == challenge.Id && c.ConsumedAt == null && c.Attempts < max)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.Attempts, c => c.Attempts + 1), ct);
        if (counted == 0) throw ChallengeExpired();
    }

    private async Task ConsumeAsync(TwoFactorChallenge challenge, CancellationToken ct)
    {
        var consumed = await db.Set<TwoFactorChallenge>().Where(c => c.Id == challenge.Id && c.ConsumedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.ConsumedAt, Now), ct);
        if (consumed == 0) throw ChallengeExpired();
    }

    // ---------- Code verification ----------

    private const string InvalidCodeCode = "auth.2fa_invalid_code";

    /// <summary>Verifies an app code or a recovery code (exactly one); returns which factor was used.</summary>
    private async Task<string> VerifyCodeOrRecoveryAsync(UserTwoFactor row, string? code, string? recoveryCode, CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(recoveryCode) && string.IsNullOrWhiteSpace(code))
        {
            await VerifyRecoveryCodeAsync(row, recoveryCode, ct);
            return FactorRecovery;
        }
        await VerifyTotpAsync(row, code, ct);
        return FactorTotp;
    }

    private async Task VerifyTotpAsync(UserTwoFactor row, string? code, CancellationToken ct)
    {
        EnsureNotLocked(row);
        if (Totp.NormalizeCode(code) is null)
            throw FieldError(InvalidCodeCode, "code", "Enter the 6-digit code from your authenticator app.");
        byte[] key;
        try
        {
            key = Totp.Base32Decode(_secrets.Unprotect(row.SecretCiphertext));
        }
        catch (CryptographicException ex)
        {
            // The key ring lost the key that encrypted this secret: nobody can produce a valid code any more.
            logger.LogError(ex, "Two-step verification secret of user {UserId} can't be decrypted", row.UserId);
            throw DomainException.Conflict("auth.2fa_secret_unavailable",
                "Two-step verification can't be checked for this account right now. Use a recovery code, or ask an administrator to reset it.");
        }
        var step = Totp.Match(key, code, clock.GetUtcNow(), row.LastUsedTimeStep);
        CryptographicOperations.ZeroMemory(key);
        // The conditional update is the replay guard: the step must still be newer than the last accepted one.
        var accepted = step is { } s && await db.Set<UserTwoFactor>()
            .Where(t => t.Id == row.Id && t.LastUsedTimeStep < s)
            .ExecuteUpdateAsync(u => u
                .SetProperty(t => t.LastUsedTimeStep, s)
                .SetProperty(t => t.LastUsedAt, Now)
                .SetProperty(t => t.FailedAttempts, 0), ct) == 1;
        if (!accepted)
        {
            await RegisterFailureAsync(row, ct);
            throw FieldError(InvalidCodeCode, "code",
                "That code didn’t work. Enter the newest code from your authenticator app (each code works once).");
        }
    }

    private async Task VerifyRecoveryCodeAsync(UserTwoFactor row, string recoveryCode, CancellationToken ct)
    {
        EnsureNotLocked(row);
        var normalized = RecoveryCodes.Normalize(recoveryCode);
        var used = normalized is not null && await db.Set<UserRecoveryCode>()
            .Where(c => c.UserId == row.UserId && c.CodeHash == HashRecoveryCode(normalized) && c.UsedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.UsedAt, Now), ct) == 1;
        if (!used)
        {
            await RegisterFailureAsync(row, ct);
            throw FieldError(InvalidCodeCode, "recoveryCode", "That recovery code didn’t work. Each code can be used once.");
        }
        await db.Set<UserTwoFactor>().Where(t => t.Id == row.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.FailedAttempts, 0).SetProperty(t => t.LastUsedAt, Now), ct);
        var remaining = await db.Set<UserRecoveryCode>().CountAsync(c => c.UserId == row.UserId && c.UsedAt == null, ct);
        audit.Record("auth.2fa_recovery_code_used", nameof(User), row.UserId, after: new { remaining });
        await db.SaveChangesAsync(ct);
        await NotifyAsync(row.UserId, (u, c) => accountEmails.SendRecoveryCodeUsedAsync(u, remaining, c), ct);
    }

    private void EnsureNotLocked(UserTwoFactor row)
    {
        if (row.LockoutEndsAt is { } until && until > Now)
            throw new DomainException("auth.2fa_locked",
                $"Too many wrong codes. Code entry is paused for this account; try again in {Options.LockoutMinutes} minutes.",
                DomainErrorKind.TooManyRequests);
    }

    /// <summary>Counts a wrong code in one atomic update and starts the lockout at the threshold (like password lockout).</summary>
    private async Task RegisterFailureAsync(UserTwoFactor row, CancellationToken ct)
    {
        var max = Options.MaxFailedAttempts;
        DateTime? lockUntil = Now.AddMinutes(Options.LockoutMinutes);
        // LockoutEndsAt first: MySQL evaluates SET assignments left to right (see AuthService.RegisterFailedLoginAsync).
        await db.Set<UserTwoFactor>().Where(t => t.Id == row.Id).ExecuteUpdateAsync(s => s
            .SetProperty(t => t.LockoutEndsAt, t => t.FailedAttempts + 1 >= max ? lockUntil : t.LockoutEndsAt)
            .SetProperty(t => t.FailedAttempts, t => t.FailedAttempts + 1 >= max ? 0 : t.FailedAttempts + 1), ct);
        if (await db.Set<UserTwoFactor>().AsNoTracking().AnyAsync(t => t.Id == row.Id && t.LockoutEndsAt == lockUntil, ct))
        {
            audit.Record("auth.2fa_locked_out", nameof(User), row.UserId);
            await db.SaveChangesAsync(ct);
        }
    }

    // ---------- Helpers ----------

    private async Task<IReadOnlyList<string>> ReplaceRecoveryCodesAsync(Guid userId, Guid rowId, CancellationToken ct)
    {
        await db.Set<UserRecoveryCode>().Where(c => c.UserId == userId).ExecuteDeleteAsync(ct);
        var codes = RecoveryCodes.Generate();
        foreach (var code in codes)
            db.Set<UserRecoveryCode>().Add(new UserRecoveryCode
            {
                UserId = userId, CodeHash = HashRecoveryCode(RecoveryCodes.Normalize(code)!), CreatedAt = Now,
            });
        await db.Set<UserTwoFactor>().Where(t => t.Id == rowId)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RecoveryCodesGeneratedAt, Now), ct);
        return codes;
    }

    /// <summary>Keyed hash (HMAC with Security:HashSalt), so a database dump alone can't be brute-forced into codes.</summary>
    private string HashRecoveryCode(string normalized) => privacyHasher.Hash("2fa-recovery:" + normalized)!;

    /// <summary>"JBSWY3DPEHPK3PXP…" in groups of four for typing by hand.</summary>
    private static string GroupSecret(string base32) =>
        string.Join(' ', Enumerable.Range(0, (base32.Length + 3) / 4).Select(i => base32.Substring(i * 4, Math.Min(4, base32.Length - i * 4))));

    /// <summary>Security notices are best effort: a mail outage must not fail the change itself.</summary>
    private async Task NotifyAsync(Guid userId, Func<User, CancellationToken, Task<Common.Notifications.EmailSendResult>> send, CancellationToken ct)
    {
        try
        {
            var user = await db.Set<User>().AsNoTracking().FirstAsync(u => u.Id == userId, ct);
            var result = await send(user, ct);
            if (!result.Success) logger.LogWarning("Two-step verification notice for user {UserId} failed: {Error}", userId, result.Error);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Two-step verification notice for user {UserId} failed", userId);
        }
    }

    private static DomainException NotEnabled() =>
        DomainException.Conflict("auth.2fa_not_enabled", "Two-step verification isn't turned on for this account.");

    public static DomainException ChallengeExpired() =>
        new("auth.2fa_challenge_expired", "This sign-in step has expired or was already used. Please sign in again.",
            DomainErrorKind.Unauthorized);

    private static DomainException FieldError(string code, string field, string message) =>
        new(code, message, DomainErrorKind.Validation, new Dictionary<string, string[]> { [field] = new[] { message } });
}
