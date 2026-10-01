using OptimizeAll.Api.Modules.Auth;
using OptimizeAll.Api.Modules.Notifications.Templates;
using Xunit;

namespace OptimizeAll.UnitTests.Auth;

public class RegistrationHintsTests
{
    [Theory]
    [InlineData("/", "/")]
    [InlineData("/learn", "/learn")]
    [InlineData("/learn/ai-basics?lesson=2#top", "/learn/ai-basics?lesson=2#top")]
    [InlineData("/a%20b", "/a%20b")]
    public void Safe_relative_paths_are_kept(string value, string expected) => Assert.Equal(expected, RegistrationHints.ReturnTo(value));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("learn")]
    [InlineData("//evil.example")]
    [InlineData("///evil.example")]
    [InlineData("/\\evil.example")]
    [InlineData("\\learn")]
    [InlineData("http://evil.example")]
    [InlineData("https://evil.example/learn")]
    [InlineData("javascript:alert(1)")]
    [InlineData("data:text/html,x")]
    [InlineData("/%2F/evil.example")]
    [InlineData("/%2f%2fevil.example")]
    [InlineData("/%5Cevil.example")]
    [InlineData("/learn\nX: y")]
    [InlineData("/learn\t")]
    [InlineData("/learn x")]
    public void Hostile_or_malformed_values_are_dropped(string? value) => Assert.Null(RegistrationHints.ReturnTo(value));

    [Fact]
    public void Length_limit_is_200_characters_inclusive()
    {
        Assert.NotNull(RegistrationHints.ReturnTo("/" + new string('a', 199)));
        Assert.Null(RegistrationHints.ReturnTo("/" + new string('a', 200)));
    }

    [Theory]
    [InlineData("learner", "learner")]
    [InlineData("LEARNER", "learner")]
    [InlineData(" creator ", "creator")]
    [InlineData("Creator", "creator")]
    [InlineData("admin", null)]
    [InlineData("learners", null)]
    [InlineData("", null)]
    [InlineData(null, null)]
    public void Audience_is_learner_or_creator_else_null(string? value, string? expected) => Assert.Equal(expected, RegistrationHints.Audience(value));

    [Fact]
    public void The_verification_link_carries_next_url_encoded_only_when_given()
    {
        Assert.Equal("https://app.test/verify-email?token=a%2Bb", AccountEmails.VerifyUrl("https://app.test", "a+b", null));
        Assert.Equal("https://app.test/verify-email?token=abc&next=%2Flearn%2Fx%3Ftab%3D1", AccountEmails.VerifyUrl("https://app.test", "abc", "/learn/x?tab=1"));
    }
}
