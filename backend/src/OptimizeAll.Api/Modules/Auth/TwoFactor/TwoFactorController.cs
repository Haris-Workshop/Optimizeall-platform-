using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using OptimizeAll.Api.Common.Http;
using OptimizeAll.Api.Common.Security;

namespace OptimizeAll.Api.Modules.Auth.TwoFactor;

/// <summary>
/// Two-step verification (authenticator app, TOTP). The sign-in step (<c>verify</c>, <c>enroll/*</c>) is anonymous: the
/// caller proves the first factor by the challenge token from <c>POST /auth/login</c> or the Google callback. The
/// settings endpoints act on the signed-in user and are refused while impersonating (they are credentials).
/// </summary>
[ApiController]
[Route("api/v1/auth/2fa")]
[EnableRateLimiting(RateLimitPolicies.Auth)]
public sealed class TwoFactorController(
    IAuthService auth, TwoFactorService twoFactor, ICurrentUser currentUser, IOptions<SecurityOptions> security) : ControllerBase
{
    // ---------- Sign-in step ----------

    /// <summary>Completes sign-in with a code from the authenticator app or a recovery code; sets the refresh cookie.</summary>
    /// <remarks>
    /// 400 auth.2fa_invalid_code (wrong, reused or malformed code; counts against the challenge and the account),
    /// 401 auth.2fa_challenge_expired (expired, used, too many tries, or the password changed: sign in again),
    /// 429 auth.2fa_locked (too many wrong codes in a row).
    /// </remarks>
    [AllowAnonymous]
    [HttpPost("verify")]
    public async Task<ActionResult<AuthResponse>> Verify(TwoFactorVerifyRequest request, CancellationToken ct)
    {
        var session = await auth.CompleteTwoFactorAsync(request, ct);
        AuthController.SetRefreshCookie(Response, security.Value, session.RefreshToken, session.RefreshExpiresAt);
        return session.Response;
    }

    /// <summary>Forced set-up during sign-in (challenge kind "enroll"): returns the secret and the otpauth URI for the QR code.</summary>
    [AllowAnonymous]
    [HttpPost("enroll/setup")]
    public Task<TwoFactorSetupResponse> EnrollSetup(TwoFactorChallengeRequest request, CancellationToken ct) =>
        twoFactor.BeginEnrollmentAsync(request.ChallengeToken, ct);

    /// <summary>Forced set-up during sign-in: confirms with a code, turns two-step verification on and signs in.</summary>
    [AllowAnonymous]
    [HttpPost("enroll/confirm")]
    public async Task<TwoFactorEnrolledResponse> EnrollConfirm(TwoFactorEnrollConfirmRequest request, CancellationToken ct)
    {
        var (session, codes) = await auth.CompleteTwoFactorEnrollmentAsync(request, ct);
        AuthController.SetRefreshCookie(Response, security.Value, session.RefreshToken, session.RefreshExpiresAt);
        return new TwoFactorEnrolledResponse(session.Response, codes);
    }

    // ---------- Settings of the signed-in user ----------

    /// <summary>Whether two-step verification is on, required by policy, and how many recovery codes are left.</summary>
    [Authorize]
    [HttpGet]
    [DisableRateLimiting]
    public Task<TwoFactorStatusDto> Status(CancellationToken ct) => twoFactor.GetStatusAsync(currentUser.Id, ct);

    /// <summary>Starts (or restarts) the set-up: a new secret and otpauth URI. 409 when it is already on.</summary>
    [Authorize]
    [DeniedWhileImpersonating]
    [HttpPost("setup")]
    public Task<TwoFactorSetupResponse> Setup(CancellationToken ct) => twoFactor.BeginSetupAsync(currentUser.Id, ct);

    /// <summary>Confirms the set-up with a code from the app and turns it on; returns 10 recovery codes (shown once).</summary>
    [Authorize]
    [DeniedWhileImpersonating]
    [HttpPost("confirm")]
    public async Task<RecoveryCodesResponse> Confirm(TwoFactorCodeRequest request, CancellationToken ct) =>
        new(await twoFactor.ConfirmSetupAsync(currentUser.Id, request.Code, ct));

    /// <summary>Turns it off (password when the account has one, plus a code or a recovery code). 409 when policy requires it.</summary>
    [Authorize]
    [DeniedWhileImpersonating]
    [HttpPost("disable")]
    public async Task<IActionResult> Disable(TwoFactorDisableRequest request, CancellationToken ct)
    {
        await twoFactor.DisableAsync(currentUser.Id, request, ct);
        return NoContent();
    }

    /// <summary>Replaces the recovery codes (needs a current app code); the old ones stop working.</summary>
    [Authorize]
    [DeniedWhileImpersonating]
    [HttpPost("recovery-codes")]
    public async Task<RecoveryCodesResponse> RegenerateRecoveryCodes(TwoFactorCodeRequest request, CancellationToken ct) =>
        new(await twoFactor.RegenerateRecoveryCodesAsync(currentUser.Id, request.Code, ct));
}
