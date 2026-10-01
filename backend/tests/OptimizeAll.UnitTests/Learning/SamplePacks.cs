using OptimizeAll.Domain.Learning;

namespace OptimizeAll.UnitTests.Learning;

/// <summary>
/// A frozen v1 course pack (tests/Fixtures/Learning/sample-pack-v1.json, the original "platform-getting-started"): tests of
/// the validator, the exam engine and v1 video lessons use it, so they keep testing the same shape while the live catalog
/// pack of that slug is upgraded. Each call returns a fresh copy.
/// </summary>
internal static class SamplePacks
{
    private static readonly Lazy<CoursePack> V1Pack = new(() =>
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Fixtures", "Learning", "sample-pack-v1.json");
        var parsed = CoursePack.Parse(File.ReadAllText(path));
        return parsed.Pack ?? throw new InvalidOperationException("sample-pack-v1.json: " + parsed.Error);
    });

    public static CoursePack V1() => V1Pack.Value.Clone();
}
