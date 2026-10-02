using System.Collections.Concurrent;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using OptimizeAll.Api.Common.Audit;
using OptimizeAll.Api.Common.Hosting;
using OptimizeAll.Api.Common.Notifications;
using OptimizeAll.Api.Common.Persistence;
using OptimizeAll.Api.Common.Security;
using OptimizeAll.Api.Common.Settings;
using OptimizeAll.Api.Modules.Auth.TwoFactor;
using OptimizeAll.Api.Modules.Notifications.Templates;
using OptimizeAll.Domain.Audit;
using OptimizeAll.Domain.Common;
using OptimizeAll.Domain.Identity;
using OptimizeAll.Domain.Settings;
using OptimizeAll.Infrastructure.Persistence;

namespace OptimizeAll.UnitTests.Auth;

/// <summary>
/// <see cref="TwoFactorService"/> on a throwaway SQLite file with a fake clock: set-up, the sign-in challenge, replay
/// protection, per-challenge attempt limits, per-account lockout, recovery codes and encryption at rest.
/// </summary>
public sealed class TwoFactorServiceTests : IDisposable
{
    private readonly string _file = Path.Combine(Path.GetTempPath(), $"oa-2fa-{Guid.NewGuid():N}.db");
    private readonly FakeTimeProvider _clock = new(new DateTimeOffset(2026, 10, 2, 9, 0, 10, TimeSpan.Zero));
    private readonly DbContextOptions<AppDbContext> _options;
    private readonly IDataProtectionProvider _protection = new EphemeralDataProtectionProvider();
    private readonly CapturingEmailSender _mail = new();

    public TwoFactorServiceTests()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Database:Provider"] = "Sqlite",
            ["Database:SqlitePath"] = _file,
        }).Build();
        var builder = new DbContextOptionsBuilder<AppDbContext>();
        DatabaseConnection.Configure(builder, config);
        _options = builder.Options;
        using var db = NewDb();
        db.Database.EnsureCreated();
    }

    public void Dispose()
    {
        using (var connection = new Microsoft.Data.Sqlite.SqliteConnection(
                   new Microsoft.Data.Sqlite.SqliteConnectionStringBuilder { DataSource = _file }.ConnectionString))
            Microsoft.Data.Sqlite.SqliteConnection.ClearPool(connection);
        foreach (var suffix in new[] { "", "-wal", "-shm" })
            try { File.Delete(_file + suffix); } catch (IOException) { }
    }

    private AppDbContext NewDb() => new(_options, _clock);

    private TwoFactorService Service(AppDbContext db)
    {
        var currentUser = new AnonymousUser();
        var audit = new AuditLogger(db, currentUser, new NoImpersonation(), _clock);
        var emails = new AccountEmails(_mail, new EmailTemplateService(db, audit, currentUser, DatabaseDialects.Sqlite),
            new FixedOrigin(), NullLogger<AccountEmails>.Instance);
        return new TwoFactorService(db, _protection, new PasswordHasher<User>(),
            new PrivacyHasher(Options.Create(new SecurityOptions { HashSalt = "unit-test-salt" })), new SettingsService(db, _clock),
            new PermissionDirectory(db), audit, emails, Options.Create(new TwoFactorOptions()), _clock, NullLogger<TwoFactorService>.Instance);
    }

    private async Task<T> WithServiceAsync<T>(Func<TwoFactorService, AppDbContext, Task<T>> action)
    {
        await using var db = NewDb();
        return await action(Service(db), db);
    }

    private async Task<User> UserAsync(params Role[] roles)
    {
        await using var db = NewDb();
        var user = new User
        {
            Email = $"{Guid.NewGuid():N}@example.test", NormalizedEmail = Guid.NewGuid().ToString("N"), DisplayName = "Ada",
            ReferralCode = Guid.NewGuid().ToString("N")[..10],
        };
        user.PasswordHash = new PasswordHasher<User>().HashPassword(user, "Correct-Horse-42");
        foreach (var role in roles.Length == 0 ? new[] { Role.Participant } : roles)
            user.Roles.Add(new UserRole { UserId = user.Id, Role = role, GrantedAt = _clock.GetUtcNow().UtcDateTime });
        db.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    private string CodeAt(byte[] key, int stepOffset = 0) => Totp.Compute(key, Totp.TimeStep(_clock.GetUtcNow()) + stepOffset);

    /// <summary>Sets up and confirms two-step verification; returns the raw key and the recovery codes.</summary>
    private async Task<(byte[] Key, IReadOnlyList<string> RecoveryCodes)> EnableAsync(User user)
    {
        var setup = await WithServiceAsync((s, _) => s.BeginSetupAsync(user.Id, default));
        var key = Totp.Base32Decode(setup.Secret);
        var codes = await WithServiceAsync((s, _) => s.ConfirmSetupAsync(user.Id, CodeAt(key), default));
        _clock.Advance(TimeSpan.FromSeconds(30)); // the confirmation code's step is spent
        return (key, codes);
    }

    private async Task<string> ChallengeAsync(User user) =>
        (await WithServiceAsync(async (s, db) =>
        {
            var reloaded = await db.Set<User>().AsNoTracking().FirstAsync(u => u.Id == user.Id);
            var challenge = await s.ChallengeForAsync(reloaded, TwoFactorService.MethodPassword, default);
            await db.SaveChangesAsync();
            return challenge;
        }))!.ChallengeToken;

    private Task<CompletedChallenge> VerifyAsync(string token, string? code = null, string? recovery = null) =>
        WithServiceAsync((s, _) => s.VerifyChallengeAsync(new TwoFactorVerifyRequest { ChallengeToken = token, Code = code, RecoveryCode = recovery }, default));

    private async Task<List<string>> AuditActionsAsync(Guid userId)
    {
        await using var db = NewDb();
        var id = userId.ToString();
        return await db.Set<AuditLog>().Where(a => a.EntityId == id).OrderBy(a => a.Id).Select(a => a.Action).ToListAsync();
    }

    [Fact]
    public async Task Setup_needs_a_matching_code_and_returns_ten_recovery_codes()
    {
        var user = await UserAsync();
        var setup = await WithServiceAsync((s, _) => s.BeginSetupAsync(user.Id, default));
        Assert.StartsWith("otpauth://totp/Optimize%20All:", setup.OtpAuthUri);
        Assert.Contains("secret=" + setup.Secret.Replace(" ", ""), setup.OtpAuthUri);
        var key = Totp.Base32Decode(setup.Secret);

        var wrong = await Assert.ThrowsAsync<DomainException>(() => WithServiceAsync((s, _) => s.ConfirmSetupAsync(user.Id, "000000" == CodeAt(key) ? "111111" : "000000", default)));
        Assert.Equal("auth.2fa_invalid_code", wrong.Code);
        Assert.False(await WithServiceAsync((s, _) => s.IsEnabledAsync(user.Id, default)));

        var codes = await WithServiceAsync((s, _) => s.ConfirmSetupAsync(user.Id, CodeAt(key), default));
        Assert.Equal(10, codes.Count);
        var status = await WithServiceAsync((s, _) => s.GetStatusAsync(user.Id, default));
        Assert.True(status.Enabled);
        Assert.Equal(10, status.RecoveryCodesRemaining);
        Assert.Contains("auth.2fa_enabled", await AuditActionsAsync(user.Id));
        Assert.Contains(_mail.Sent, m => m.ToAddress == user.Email && m.Subject.Contains("Two-step verification is on"));

        // Secrets are encrypted at rest and recovery codes are stored as keyed hashes only.
        await using var db = NewDb();
        var row = await db.Set<UserTwoFactor>().SingleAsync(t => t.UserId == user.Id);
        Assert.DoesNotContain(setup.Secret.Replace(" ", ""), row.SecretCiphertext);
        var hashes = await db.Set<UserRecoveryCode>().Where(c => c.UserId == user.Id).Select(c => c.CodeHash).ToListAsync();
        Assert.Equal(10, hashes.Count);
        Assert.All(codes, c => Assert.DoesNotContain(hashes, h => h.Contains(c.Replace("-", ""), StringComparison.OrdinalIgnoreCase)));
    }

    [Fact]
    public async Task A_code_works_once_a_replay_in_the_same_time_step_is_refused()
    {
        var user = await UserAsync();
        var (key, _) = await EnableAsync(user);
        var code = CodeAt(key);

        var completed = await VerifyAsync(await ChallengeAsync(user), code);
        Assert.Equal(user.Id, completed.User.Id);
        Assert.Equal("totp", completed.Factor);

        // Same code, same 30 seconds, fresh challenge (an attacker who watched it being typed): refused.
        var replay = await Assert.ThrowsAsync<DomainException>(() => VerifyAsync(ChallengeAsync(user).Result, code));
        Assert.Equal("auth.2fa_invalid_code", replay.Code);
        // So is the previous step's code, though it is inside the drift window.
        var older = await Assert.ThrowsAsync<DomainException>(() => VerifyAsync(ChallengeAsync(user).Result, CodeAt(key, -1)));
        Assert.Equal("auth.2fa_invalid_code", older.Code);

        _clock.Advance(TimeSpan.FromSeconds(30));
        await VerifyAsync(await ChallengeAsync(user), CodeAt(key));
    }

    [Fact]
    public async Task A_challenge_is_single_use_short_lived_and_tamper_proof()
    {
        var user = await UserAsync();
        var (key, _) = await EnableAsync(user);

        var token = await ChallengeAsync(user);
        await VerifyAsync(token, CodeAt(key));
        _clock.Advance(TimeSpan.FromSeconds(30));
        var reused = await Assert.ThrowsAsync<DomainException>(() => VerifyAsync(token, CodeAt(key)));
        Assert.Equal("auth.2fa_challenge_expired", reused.Code);

        var expiring = await ChallengeAsync(user);
        _clock.Advance(TimeSpan.FromMinutes(6));
        Assert.Equal("auth.2fa_challenge_expired", (await Assert.ThrowsAsync<DomainException>(() => VerifyAsync(expiring, CodeAt(key)))).Code);

        var tampered = (await ChallengeAsync(user))[..^4] + "AAAA";
        Assert.Equal("auth.2fa_challenge_expired", (await Assert.ThrowsAsync<DomainException>(() => VerifyAsync(tampered, CodeAt(key)))).Code);
        Assert.Equal("auth.2fa_challenge_expired", (await Assert.ThrowsAsync<DomainException>(() => VerifyAsync("not-a-token", CodeAt(key)))).Code);
    }

    [Fact]
    public async Task A_password_change_voids_an_open_challenge()
    {
        var user = await UserAsync();
        var (key, _) = await EnableAsync(user);
        var token = await ChallengeAsync(user);
        await using (var db = NewDb())
            await db.Set<User>().Where(u => u.Id == user.Id).ExecuteUpdateAsync(s => s.SetProperty(u => u.SecurityVersion, u => u.SecurityVersion + 1));
        Assert.Equal("auth.2fa_challenge_expired", (await Assert.ThrowsAsync<DomainException>(() => VerifyAsync(token, CodeAt(key)))).Code);
    }

    [Fact]
    public async Task A_challenge_allows_five_tries_then_is_void_even_for_the_right_code()
    {
        var user = await UserAsync();
        var (key, _) = await EnableAsync(user);
        var token = await ChallengeAsync(user);
        var wrong = WrongCode(key);
        for (var i = 0; i < 5; i++)
            Assert.Equal("auth.2fa_invalid_code", (await Assert.ThrowsAsync<DomainException>(() => VerifyAsync(token, wrong))).Code);
        Assert.Equal("auth.2fa_challenge_expired", (await Assert.ThrowsAsync<DomainException>(() => VerifyAsync(token, CodeAt(key)))).Code);
        Assert.Equal(5, (await AuditActionsAsync(user.Id)).Count(a => a == "auth.2fa_failed"));
    }

    [Fact]
    public async Task Ten_wrong_codes_in_a_row_lock_code_entry_for_fifteen_minutes()
    {
        var user = await UserAsync();
        var (key, recovery) = await EnableAsync(user);
        var wrong = WrongCode(key);
        for (var i = 0; i < 10; i++)
        {
            var token = await ChallengeAsync(user); // new challenges (sign in again with the password) don't reset the count
            await Assert.ThrowsAsync<DomainException>(() => VerifyAsync(token, wrong));
        }
        var locked = await Assert.ThrowsAsync<DomainException>(async () => await VerifyAsync(await ChallengeAsync(user), CodeAt(key)));
        Assert.Equal("auth.2fa_locked", locked.Code);
        Assert.Equal(DomainErrorKind.TooManyRequests, locked.Kind);
        // Recovery codes are locked too (they are the other half of the same second factor).
        Assert.Equal("auth.2fa_locked",
            (await Assert.ThrowsAsync<DomainException>(async () => await VerifyAsync(await ChallengeAsync(user), recovery: recovery[0]))).Code);
        Assert.Contains("auth.2fa_locked_out", await AuditActionsAsync(user.Id));

        _clock.Advance(TimeSpan.FromMinutes(15) + TimeSpan.FromSeconds(1));
        await VerifyAsync(await ChallengeAsync(user), CodeAt(key));
    }

    [Fact]
    public async Task A_correct_code_resets_the_failure_count()
    {
        var user = await UserAsync();
        var (key, _) = await EnableAsync(user);
        for (var round = 0; round < 3; round++)
        {
            for (var i = 0; i < 4; i++)
                await Assert.ThrowsAsync<DomainException>(async () => await VerifyAsync(await ChallengeAsync(user), WrongCode(key)));
            await VerifyAsync(await ChallengeAsync(user), CodeAt(key));
            _clock.Advance(TimeSpan.FromSeconds(30));
        }
        await using var db = NewDb();
        Assert.Equal(0, (await db.Set<UserTwoFactor>().SingleAsync(t => t.UserId == user.Id)).FailedAttempts);
    }

    [Fact]
    public async Task Recovery_codes_work_once_each_in_any_format_and_are_audited()
    {
        var user = await UserAsync();
        var (_, codes) = await EnableAsync(user);

        var completed = await VerifyAsync(await ChallengeAsync(user), recovery: codes[0].ToLowerInvariant().Replace("-", " "));
        Assert.Equal("recovery_code", completed.Factor);
        var again = await Assert.ThrowsAsync<DomainException>(async () => await VerifyAsync(await ChallengeAsync(user), recovery: codes[0]));
        Assert.Equal("auth.2fa_invalid_code", again.Code);
        Assert.Equal(9, (await WithServiceAsync((s, _) => s.GetStatusAsync(user.Id, default))).RecoveryCodesRemaining);
        Assert.Contains("auth.2fa_recovery_code_used", await AuditActionsAsync(user.Id));
        Assert.Contains(_mail.Sent, m => m.Subject.Contains("recovery code was used"));
    }

    [Fact]
    public async Task Regenerating_recovery_codes_needs_an_app_code_and_retires_the_old_set()
    {
        var user = await UserAsync();
        var (key, old) = await EnableAsync(user);
        var fresh = await WithServiceAsync((s, _) => s.RegenerateRecoveryCodesAsync(user.Id, CodeAt(key), default));
        Assert.Empty(fresh.Intersect(old));
        await Assert.ThrowsAsync<DomainException>(async () => await VerifyAsync(await ChallengeAsync(user), recovery: old[1]));
        await VerifyAsync(await ChallengeAsync(user), recovery: fresh[1]);
    }

    [Fact]
    public async Task Disabling_needs_the_password_and_a_code_and_is_refused_while_the_staff_policy_requires_it()
    {
        var user = await UserAsync(Role.Reviewer);
        var (key, _) = await EnableAsync(user);

        var noPassword = await Assert.ThrowsAsync<DomainException>(() => WithServiceAsync(async (s, _) =>
        {
            await s.DisableAsync(user.Id, new TwoFactorDisableRequest { Code = CodeAt(key) }, default);
            return true;
        }));
        Assert.Equal("auth.invalid_password", noPassword.Code);

        await using (var db = NewDb())
        {
            await new SettingsService(db, _clock).SetAsync(SettingKeys.RequireTwoFactorForStaff, true, null);
            await db.SaveChangesAsync();
        }
        var required = await Assert.ThrowsAsync<DomainException>(() => WithServiceAsync(async (s, _) =>
        {
            await s.DisableAsync(user.Id, new TwoFactorDisableRequest { Password = "Correct-Horse-42", Code = CodeAt(key) }, default);
            return true;
        }));
        Assert.Equal("auth.2fa_required_by_policy", required.Code);

        await using (var db = NewDb())
        {
            await new SettingsService(db, _clock).SetAsync(SettingKeys.RequireTwoFactorForStaff, false, null);
            await db.SaveChangesAsync();
        }
        await WithServiceAsync(async (s, _) =>
        {
            await s.DisableAsync(user.Id, new TwoFactorDisableRequest { Password = "Correct-Horse-42", Code = CodeAt(key) }, default);
            return true;
        });
        Assert.False(await WithServiceAsync((s, _) => s.IsEnabledAsync(user.Id, default)));
        Assert.Contains("auth.2fa_disabled", await AuditActionsAsync(user.Id));
        Assert.Contains(_mail.Sent, m => m.Subject.Contains("Two-step verification is off"));
    }

    [Fact]
    public async Task The_staff_policy_issues_an_enrolment_challenge_only_to_staff_without_two_step_verification()
    {
        var participant = await UserAsync();
        var staff = await UserAsync(Role.Finance);
        await using (var db = NewDb())
        {
            await new SettingsService(db, _clock).SetAsync(SettingKeys.RequireTwoFactorForStaff, true, null);
            await db.SaveChangesAsync();
        }

        var none = await WithServiceAsync((s, _) => s.ChallengeForAsync(participant, TwoFactorService.MethodPassword, default));
        Assert.Null(none);
        var enroll = await WithServiceAsync(async (s, db) =>
        {
            var c = await s.ChallengeForAsync(staff, TwoFactorService.MethodPassword, default);
            await db.SaveChangesAsync();
            return c;
        });
        Assert.Equal("enroll", enroll!.Kind);

        // An enrolment challenge can't be used to verify, and vice versa.
        Assert.Equal("auth.2fa_challenge_expired",
            (await Assert.ThrowsAsync<DomainException>(() => VerifyAsync(enroll.ChallengeToken, "123456"))).Code);
        var setup = await WithServiceAsync((s, _) => s.BeginEnrollmentAsync(enroll.ChallengeToken, default));
        var key = Totp.Base32Decode(setup.Secret);
        var (completed, codes) = await WithServiceAsync((s, _) => s.ConfirmEnrollmentAsync(
            new TwoFactorEnrollConfirmRequest { ChallengeToken = enroll.ChallengeToken, Code = CodeAt(key) }, default));
        Assert.Equal(staff.Id, completed.User.Id);
        Assert.Equal(10, codes.Count);
        Assert.False(await WithServiceAsync((s, _) => s.NeedsEnrollmentAsync(staff.Id, default)));
    }

    private string WrongCode(byte[] key)
    {
        var valid = Enumerable.Range(-1, 3).Select(o => CodeAt(key, o)).ToHashSet();
        return Enumerable.Range(0, 1000).Select(i => i.ToString("D6")).First(c => !valid.Contains(c));
    }

    private sealed class CapturingEmailSender : IEmailSender
    {
        public ConcurrentBag<EmailMessage> Sent { get; } = new();

        public Task<EmailSendResult> SendAsync(EmailMessage message, CancellationToken ct = default)
        {
            Sent.Add(message);
            return Task.FromResult(new EmailSendResult(true, "test", null));
        }
    }

    private sealed class FixedOrigin : IPublicOrigin
    {
        public string Current => "https://app.example.com";
        public Task<string> GetAsync(CancellationToken ct = default) => Task.FromResult(Current);
        public string Resolve(string? siteUrl) => Current;
        public string RequireAbsolute() => Current;
        public Task<string> RequireAbsoluteAsync(CancellationToken ct = default) => Task.FromResult(Current);
        public void SiteUrlChanged(string? siteUrl) { }
    }

    private sealed class AnonymousUser : ICurrentUser
    {
        public bool IsAuthenticated => false;
        public Guid Id => throw new InvalidOperationException();
        public Guid? IdOrNull => null;
        public IReadOnlyCollection<Role> Roles => Array.Empty<Role>();
        public IReadOnlySet<string> Permissions => new HashSet<string>();
        public bool HasPermission(string permission) => false;
        public string? IpAddress => "127.0.0.1";
        public string? UserAgent => null;
        public string? CorrelationId => null;
        public void Require(string permission) => throw new InvalidOperationException();
    }

    private sealed class NoImpersonation : IImpersonationContext
    {
        public bool IsImpersonating => false;
        public Guid? SessionId => null;
        public Guid? ImpersonatorId => null;
        public string? ImpersonatorName => null;
    }
}
