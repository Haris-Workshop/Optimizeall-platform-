using System.Security.Cryptography;
using System.Text;

namespace OptimizeAll.Api.Modules.Auth.TwoFactor;

/// <summary>
/// Time-based one-time passwords (RFC 6238 on HOTP, RFC 4226) with the parameters every authenticator app supports:
/// HMAC-SHA-1, 6 digits, 30-second steps, Unix epoch. Pure functions; no state, no clock of its own.
/// </summary>
public static class Totp
{
    public const int Digits = 6;
    public const int PeriodSeconds = 30;

    /// <summary>Steps accepted either side of the current one (clock drift between server and phone): ±30 seconds.</summary>
    public const int AllowedSkewSteps = 1;

    /// <summary>160-bit secrets, the length RFC 4226 recommends for HMAC-SHA-1.</summary>
    public const int SecretBytes = 20;

    private const string Base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

    public static byte[] NewSecret() => RandomNumberGenerator.GetBytes(SecretBytes);

    /// <summary>The RFC 6238 time step T = floor((unix time - T0) / X) with T0 = 0, X = 30 s.</summary>
    public static long TimeStep(DateTimeOffset at) => (long)Math.Floor(at.ToUnixTimeSeconds() / (double)PeriodSeconds);

    /// <summary>The code for a time step (HOTP with the step as counter), zero-padded.</summary>
    public static string Compute(ReadOnlySpan<byte> key, long timeStep, int digits = Digits, HashAlgorithmName? algorithm = null)
    {
        Span<byte> counter = stackalloc byte[8];
        System.Buffers.Binary.BinaryPrimitives.WriteInt64BigEndian(counter, timeStep);
        var name = algorithm ?? HashAlgorithmName.SHA1;
        byte[] hash = name == HashAlgorithmName.SHA1 ? HMACSHA1.HashData(key, counter)
            : name == HashAlgorithmName.SHA256 ? HMACSHA256.HashData(key, counter)
            : name == HashAlgorithmName.SHA512 ? HMACSHA512.HashData(key, counter)
            : throw new ArgumentOutOfRangeException(nameof(algorithm));
        // Dynamic truncation (RFC 4226 § 5.3).
        var offset = hash[^1] & 0x0f;
        var binary = ((hash[offset] & 0x7f) << 24) | (hash[offset + 1] << 16) | (hash[offset + 2] << 8) | hash[offset + 3];
        var modulo = (int)Math.Pow(10, digits);
        return (binary % modulo).ToString(System.Globalization.CultureInfo.InvariantCulture).PadLeft(digits, '0');
    }

    /// <summary>
    /// The time step a code is valid for, within ±<see cref="AllowedSkewSteps"/> of <paramref name="now"/> and strictly
    /// after <paramref name="lastUsedStep"/> (replay protection), or null. Every candidate is compared in constant time.
    /// </summary>
    public static long? Match(ReadOnlySpan<byte> key, string? code, DateTimeOffset now, long lastUsedStep)
    {
        var normalized = NormalizeCode(code);
        if (normalized is null) return null;
        var current = TimeStep(now);
        long? matched = null;
        for (var step = current - AllowedSkewSteps; step <= current + AllowedSkewSteps; step++)
        {
            var expected = Compute(key, step);
            if (CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(expected), Encoding.ASCII.GetBytes(normalized)) &&
                step > lastUsedStep && matched is null)
                matched = step;
        }
        return matched;
    }

    /// <summary>"123 456" / "123-456" → "123456"; null unless exactly <see cref="Digits"/> ASCII digits remain.</summary>
    public static string? NormalizeCode(string? code)
    {
        if (string.IsNullOrWhiteSpace(code) || code.Length > 20) return null;
        var digits = new StringBuilder(Digits);
        foreach (var c in code)
        {
            if (c is ' ' or '-' or '\t') continue;
            if (!char.IsAsciiDigit(c)) return null;
            digits.Append(c);
        }
        return digits.Length == Digits ? digits.ToString() : null;
    }

    /// <summary>RFC 4648 Base32 without padding (what authenticator apps expect for the secret).</summary>
    public static string Base32Encode(ReadOnlySpan<byte> data)
    {
        var output = new StringBuilder((data.Length * 8 + 4) / 5);
        int buffer = 0, bits = 0;
        foreach (var b in data)
        {
            buffer = (buffer << 8) | b;
            bits += 8;
            while (bits >= 5)
            {
                output.Append(Base32Alphabet[(buffer >> (bits - 5)) & 31]);
                bits -= 5;
            }
        }
        if (bits > 0) output.Append(Base32Alphabet[(buffer << (5 - bits)) & 31]);
        return output.ToString();
    }

    /// <summary>Decodes Base32 (case-insensitive, spaces and padding ignored); throws <see cref="FormatException"/> otherwise.</summary>
    public static byte[] Base32Decode(string value)
    {
        var output = new List<byte>(value.Length * 5 / 8);
        int buffer = 0, bits = 0;
        foreach (var raw in value)
        {
            if (raw is ' ' or '=' or '-') continue;
            var index = Base32Alphabet.IndexOf(char.ToUpperInvariant(raw));
            if (index < 0) throw new FormatException("Not a Base32 string.");
            buffer = (buffer << 5) | index;
            bits += 5;
            if (bits >= 8)
            {
                output.Add((byte)((buffer >> (bits - 8)) & 0xff));
                bits -= 8;
            }
        }
        return output.ToArray();
    }

    /// <summary>
    /// The Key URI an authenticator app scans (Google Authenticator "Key Uri Format"):
    /// <c>otpauth://totp/Issuer:account?secret=…&amp;issuer=Issuer&amp;algorithm=SHA1&amp;digits=6&amp;period=30</c>.
    /// </summary>
    public static string OtpAuthUri(string issuer, string account, string base32Secret)
    {
        var label = Uri.EscapeDataString(issuer) + ":" + Uri.EscapeDataString(account);
        return $"otpauth://totp/{label}?secret={base32Secret}&issuer={Uri.EscapeDataString(issuer)}" +
               $"&algorithm=SHA1&digits={Digits}&period={PeriodSeconds}";
    }
}

/// <summary>Single-use recovery codes: 10 per set, "XXXXX-XXXXX" from an unambiguous 32-character alphabet (50 bits).</summary>
public static class RecoveryCodes
{
    public const int Count = 10;
    private const int Length = 10;
    private const string Alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 symbols: no I, O, 0 or 1

    public static IReadOnlyList<string> Generate(int count = Count)
    {
        var codes = new HashSet<string>(StringComparer.Ordinal);
        while (codes.Count < count)
        {
            var chars = new char[Length];
            for (var i = 0; i < Length; i++) chars[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
            codes.Add(new string(chars, 0, 5) + "-" + new string(chars, 5, 5));
        }
        return codes.ToList();
    }

    /// <summary>
    /// Upper case without separators ("abcde fghjk", "ABCDE-FGHJK" → "ABCDEFGHJK"); null unless it has the code's shape.
    /// Lookalikes are not folded: the alphabet has none of them.
    /// </summary>
    public static string? Normalize(string? input)
    {
        if (string.IsNullOrWhiteSpace(input) || input.Length > 40) return null;
        var output = new StringBuilder(Length);
        foreach (var c in input)
        {
            if (c is ' ' or '-' or '\t') continue;
            var upper = char.ToUpperInvariant(c);
            if (!Alphabet.Contains(upper)) return null;
            output.Append(upper);
        }
        return output.Length == Length ? output.ToString() : null;
    }
}
