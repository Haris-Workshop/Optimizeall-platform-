namespace OptimizeAll.Api.Modules.Learning.YouTubeUploads;

/// <summary>Retry timing: exponential backoff for transient failures and the daily YouTube quota reset.</summary>
public static class YouTubeSchedule
{
    public const int MaxAttempts = 5;

    /// <summary>The wait after the <paramref name="attempt"/>-th failed attempt: 1, 2, 4, 8, 16 minutes, plus up to 20 % jitter.</summary>
    public static TimeSpan Backoff(int attempt, double jitter01)
    {
        var minutes = Math.Pow(2, Math.Clamp(attempt, 1, 10) - 1);
        return TimeSpan.FromMinutes(minutes * (1 + 0.2 * Math.Clamp(jitter01, 0, 1)));
    }

    /// <summary>
    /// When the YouTube quota next resets: the next 00:00 in America/Los_Angeles plus five minutes, as UTC. The US daylight
    /// saving rules (second Sunday of March 02:00 to first Sunday of November 02:00) are applied here directly, so the
    /// result does not depend on the host having time zone data.
    /// </summary>
    public static DateTime NextQuotaReset(DateTime utcNow)
    {
        var now = DateTime.SpecifyKind(utcNow, DateTimeKind.Utc);
        var local = now + PacificOffset(now);
        var nextMidnightLocal = local.Date.AddDays(1);
        // The offset is resolved for the target instant; midnight is never inside the one-hour DST jump.
        var guess = nextMidnightLocal + TimeSpan.FromHours(8);
        var utc = nextMidnightLocal - PacificOffset(guess);
        return DateTime.SpecifyKind(utc, DateTimeKind.Utc).AddMinutes(5);
    }

    /// <summary>The Pacific offset from UTC at <paramref name="utc"/>: -7 h during daylight saving time, else -8 h.</summary>
    public static TimeSpan PacificOffset(DateTime utc)
    {
        var year = utc.Year;
        var start = NthSunday(year, 3, 2).AddHours(2 + 8);   // 02:00 PST = 10:00 UTC
        var end = NthSunday(year, 11, 1).AddHours(2 + 7);    // 02:00 PDT = 09:00 UTC
        return utc >= start && utc < end ? TimeSpan.FromHours(-7) : TimeSpan.FromHours(-8);
    }

    private static DateTime NthSunday(int year, int month, int n)
    {
        var first = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc);
        var offset = ((int)DayOfWeek.Sunday - (int)first.DayOfWeek + 7) % 7;
        return first.AddDays(offset + 7 * (n - 1));
    }
}
