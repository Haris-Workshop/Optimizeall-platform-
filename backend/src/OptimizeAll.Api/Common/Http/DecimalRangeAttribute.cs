using System.ComponentModel.DataAnnotations;

namespace OptimizeAll.Api.Common.Http;

/// <summary>
/// <c>[Range(typeof(decimal), "min", "max")]</c> that is safe to validate from several requests at once.
/// </summary>
/// <remarks>
/// On .NET 8 <see cref="RangeAttribute"/> parses its string limits lazily on the first validation and swaps
/// <see cref="RangeAttribute.Minimum"/> from the string to the parsed decimal before it publishes the conversion.
/// MVC shares one attribute instance across requests, so a second request validating at the same moment can read the
/// already-parsed decimal and cast it to string: <c>InvalidCastException</c>, a 500 for a perfectly normal body.
/// The limits are parsed here, in the constructor, before the instance is shared.
/// </remarks>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Field | AttributeTargets.Parameter)]
public sealed class DecimalRangeAttribute : RangeAttribute
{
    public DecimalRangeAttribute(string minimum, string maximum) : base(typeof(decimal), minimum, maximum)
    {
        // Runs the one-time conversion setup now (null always passes, so this validates nothing).
        IsValid(null);
    }
}
