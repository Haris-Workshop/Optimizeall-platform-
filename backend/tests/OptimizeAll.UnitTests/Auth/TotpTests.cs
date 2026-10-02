using System.Security.Cryptography;
using System.Text;
using OptimizeAll.Api.Modules.Auth.TwoFactor;

namespace OptimizeAll.UnitTests.Auth;

/// <summary>TOTP (RFC 6238) and HOTP (RFC 4226) against the RFCs' own test vectors, plus skew, replay and encoding rules.</summary>
public sealed class TotpTests
{
    private static readonly byte[] Sha1Seed = Encoding.ASCII.GetBytes("12345678901234567890");
    private static readonly byte[] Sha256Seed = Encoding.ASCII.GetBytes("12345678901234567890123456789012");
    private static readonly byte[] Sha512Seed = Encoding.ASCII.GetBytes("1234567890123456789012345678901234567890123456789012345678901234");

    /// <summary>RFC 6238 Appendix B (8 digits): time, expected SHA-1, SHA-256 and SHA-512 codes.</summary>
    public static TheoryData<long, string, string, string> Rfc6238Vectors => new()
    {
        { 59, "94287082", "46119246", "90693936" },
        { 1111111109, "07081804", "68084774", "25091201" },
        { 1111111111, "14050471", "67062674", "99943326" },
        { 1234567890, "89005924", "91819424", "93441116" },
        { 2000000000, "69279037", "90698825", "38618901" },
        { 20000000000, "65353130", "77737706", "47863826" },
    };

    [Theory]
    [MemberData(nameof(Rfc6238Vectors))]
    public void Matches_the_RFC_6238_test_vectors(long unixTime, string sha1, string sha256, string sha512)
    {
        var step = Totp.TimeStep(DateTimeOffset.FromUnixTimeSeconds(unixTime));
        Assert.Equal(sha1, Totp.Compute(Sha1Seed, step, 8));
        Assert.Equal(sha256, Totp.Compute(Sha256Seed, step, 8, HashAlgorithmName.SHA256));
        Assert.Equal(sha512, Totp.Compute(Sha512Seed, step, 8, HashAlgorithmName.SHA512));
        // The 6-digit code the app shows is the same truncation modulo 10^6.
        Assert.Equal(sha1[^6..], Totp.Compute(Sha1Seed, step));
    }

    [Fact]
    public void Matches_the_RFC_4226_HOTP_vectors()
    {
        string[] expected = { "755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489" };
        for (var counter = 0; counter < expected.Length; counter++)
            Assert.Equal(expected[counter], Totp.Compute(Sha1Seed, counter));
    }

    [Fact]
    public void Time_steps_are_30_seconds_from_the_unix_epoch()
    {
        Assert.Equal(0, Totp.TimeStep(DateTimeOffset.FromUnixTimeSeconds(29)));
        Assert.Equal(1, Totp.TimeStep(DateTimeOffset.FromUnixTimeSeconds(30)));
        Assert.Equal(37037037, Totp.TimeStep(DateTimeOffset.FromUnixTimeSeconds(1111111111)));
    }

    [Fact]
    public void Accepts_one_step_of_drift_either_way_and_no_more()
    {
        var now = DateTimeOffset.FromUnixTimeSeconds(1_800_000_015);
        var step = Totp.TimeStep(now);
        Assert.Equal(step, Totp.Match(Sha1Seed, Totp.Compute(Sha1Seed, step), now, 0));
        Assert.Equal(step - 1, Totp.Match(Sha1Seed, Totp.Compute(Sha1Seed, step - 1), now, 0));
        Assert.Equal(step + 1, Totp.Match(Sha1Seed, Totp.Compute(Sha1Seed, step + 1), now, 0));
        Assert.Null(Totp.Match(Sha1Seed, Totp.Compute(Sha1Seed, step - 2), now, 0));
        Assert.Null(Totp.Match(Sha1Seed, Totp.Compute(Sha1Seed, step + 2), now, 0));
    }

    [Fact]
    public void Rejects_a_code_for_a_step_already_used_or_older_replay_protection()
    {
        var now = DateTimeOffset.FromUnixTimeSeconds(1_800_000_015);
        var step = Totp.TimeStep(now);
        var code = Totp.Compute(Sha1Seed, step);
        Assert.Equal(step, Totp.Match(Sha1Seed, code, now, step - 1));
        // The same code again (same 30-second step) is refused once that step was accepted...
        Assert.Null(Totp.Match(Sha1Seed, code, now, step));
        // ...and so is the previous step's code, still inside the drift window.
        Assert.Null(Totp.Match(Sha1Seed, Totp.Compute(Sha1Seed, step - 1), now, step));
        // The next step's code is still fine.
        Assert.Equal(step + 1, Totp.Match(Sha1Seed, Totp.Compute(Sha1Seed, step + 1), now, step));
    }

    [Theory]
    [InlineData("123 456", "123456")]
    [InlineData(" 123-456 ", "123456")]
    [InlineData("123456", "123456")]
    [InlineData("12345", null)]
    [InlineData("1234567", null)]
    [InlineData("12a456", null)]
    [InlineData("１２３４５６", null)] // full-width digits are not ASCII digits
    [InlineData("", null)]
    [InlineData(null, null)]
    public void Normalizes_typed_codes(string? input, string? expected) => Assert.Equal(expected, Totp.NormalizeCode(input));

    [Fact]
    public void Wrong_and_malformed_codes_never_match()
    {
        var now = DateTimeOffset.FromUnixTimeSeconds(1_800_000_015);
        var step = Totp.TimeStep(now);
        var valid = new[] { step - 1, step, step + 1 }.Select(s => Totp.Compute(Sha1Seed, s)).ToHashSet();
        var wrong = Enumerable.Range(0, 1000).Select(i => i.ToString("D6")).First(c => !valid.Contains(c));
        Assert.Null(Totp.Match(Sha1Seed, wrong, now, 0));
        Assert.Null(Totp.Match(Sha1Seed, "abcdef", now, 0));
        Assert.Null(Totp.Match(Sha1Seed, null, now, 0));
    }

    [Fact]
    public void Base32_round_trips_and_matches_RFC_4648()
    {
        Assert.Equal("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", Totp.Base32Encode(Sha1Seed));
        Assert.Equal("MZXW6YTBOI", Totp.Base32Encode(Encoding.ASCII.GetBytes("foobar")));
        Assert.Equal(Sha1Seed, Totp.Base32Decode("gezd gnbv gy3t qojq gezd gnbv gy3t qojq"));
        var secret = Totp.NewSecret();
        Assert.Equal(20, secret.Length);
        Assert.Equal(secret, Totp.Base32Decode(Totp.Base32Encode(secret)));
        Assert.Throws<FormatException>(() => Totp.Base32Decode("not base32!"));
    }

    [Fact]
    public void The_otpauth_uri_carries_issuer_account_and_parameters()
    {
        var uri = Totp.OtpAuthUri("Optimize All", "ada+test@example.com", "JBSWY3DPEHPK3PXP");
        Assert.Equal("otpauth://totp/Optimize%20All:ada%2Btest%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Optimize%20All" +
                     "&algorithm=SHA1&digits=6&period=30", uri);
    }
}

public sealed class RecoveryCodesTests
{
    [Fact]
    public void Generates_ten_distinct_well_formed_codes()
    {
        var codes = RecoveryCodes.Generate();
        Assert.Equal(10, codes.Count);
        Assert.Equal(10, codes.Distinct().Count());
        Assert.All(codes, c => Assert.Matches("^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$", c));
    }

    [Fact]
    public void Two_sets_do_not_overlap() =>
        Assert.Empty(RecoveryCodes.Generate().Intersect(RecoveryCodes.Generate()));

    [Theory]
    [InlineData("ABCDE-FGHJK", "ABCDEFGHJK")]
    [InlineData("abcde fghjk", "ABCDEFGHJK")]
    [InlineData(" abcdefghjk ", "ABCDEFGHJK")]
    [InlineData("ABCDE-FGHJ", null)] // too short
    [InlineData("ABCDE-FGHJKL", null)] // too long
    [InlineData("ABCDE-FGHI0", null)] // I and 0 are not in the alphabet
    [InlineData("", null)]
    [InlineData(null, null)]
    public void Normalizes_typed_codes(string? input, string? expected) => Assert.Equal(expected, RecoveryCodes.Normalize(input));
}
