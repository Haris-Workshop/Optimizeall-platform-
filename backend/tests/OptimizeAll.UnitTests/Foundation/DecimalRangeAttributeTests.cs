using System.ComponentModel.DataAnnotations;
using System.Reflection;
using OptimizeAll.Api.Common.Http;

namespace OptimizeAll.UnitTests.Foundation;

public sealed class DecimalRangeAttributeTests
{
    [Fact]
    public void Limits_are_parsed_before_the_attribute_is_shared()
    {
        // RangeAttribute(typeof(decimal), "…", "…") parses lazily and is not thread-safe on .NET 8: a request validating
        // while another one parses reads the decimal limit as a string (InvalidCastException → 500).
        var range = new DecimalRangeAttribute("0.0001", "1000");
        Assert.IsType<decimal>(range.Minimum);
        Assert.IsType<decimal>(range.Maximum);
    }

    [Fact]
    public void Validates_like_RangeAttribute()
    {
        var range = new DecimalRangeAttribute("0.0001", "1000");
        Assert.True(range.IsValid(null));
        Assert.True(range.IsValid(0.0001m));
        Assert.True(range.IsValid(1000m));
        Assert.False(range.IsValid(0m));
        Assert.False(range.IsValid(1000.01m));
        Assert.Contains("0.0001", range.FormatErrorMessage("Rate"));
    }

    [Fact]
    public void A_fresh_instance_validates_safely_from_many_threads()
    {
        for (var round = 0; round < 200; round++)
        {
            var range = new DecimalRangeAttribute("0", "100");
            Parallel.For(0, 16, _ => Assert.True(range.IsValid(5m)));
        }
    }

    [Fact]
    public void No_dto_uses_the_unsafe_string_range()
    {
        var unsafeRanges = typeof(DecimalRangeAttribute).Assembly.GetTypes()
            .SelectMany(t => t.GetProperties(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
                .SelectMany(p => p.GetCustomAttributes<RangeAttribute>().Select(a => (Member: $"{t.FullName}.{p.Name}", Range: a))))
            .Where(x => x.Range is not DecimalRangeAttribute && x.Range.Minimum is string)
            .Select(x => x.Member)
            .ToList();
        Assert.True(unsafeRanges.Count == 0, "Use [DecimalRange] instead of [Range(typeof(…), \"…\", \"…\")]: " + string.Join(", ", unsafeRanges));
    }
}
