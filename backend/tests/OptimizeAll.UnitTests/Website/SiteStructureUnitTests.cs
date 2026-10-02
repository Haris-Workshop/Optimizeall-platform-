using System.Text.Json;
using OptimizeAll.Api.Modules.Content.Copy;
using OptimizeAll.Api.Modules.Website.Settings;
using OptimizeAll.Api.Modules.Website.Shared;

namespace OptimizeAll.UnitTests.Website;

/// <summary>Site structure settings (page layout, product chrome, footer groups, brand) and link-type page texts.</summary>
public sealed class SiteStructureUnitTests
{
    [Fact]
    public void Stored_settings_without_the_structure_read_the_defaults()
    {
        var legacy = JsonSerializer.Serialize(SiteSettingsService.Defaults with { Brand = null, Layouts = null, Products = null }, SiteSettingsService.Json);
        var doc = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(legacy)!;
        doc.Remove("brand");
        doc.Remove("layouts");
        doc.Remove("products");
        var parsed = SiteSettingsService.Parse(JsonSerializer.Serialize(doc));
        Assert.Equal(PageLayoutCatalog.Home.Select(x => x.Key), parsed.Layouts!.Home.Select(s => s.Key));
        Assert.All(parsed.Layouts.Home, s => Assert.True(s.Visible));
        Assert.Equal(SiteSettingsService.DefaultAcademy, parsed.Products!.Academy);
        Assert.Equal(SiteSettingsService.DefaultProductLinks, parsed.Footer.ProductLinks);
        Assert.Equal(SiteSettingsService.DefaultSecondaryLink, parsed.Header.SecondaryLink);
        Assert.Null(parsed.Brand!.LogoUrl);
    }

    [Fact]
    public void Layout_merge_drops_unknown_and_repeated_sections_and_appends_new_ones()
    {
        var merged = PageLayoutCatalog.Merge(new[] { new PageSection("cta", false), new PageSection("nope", true), new PageSection("cta", true) },
            PageLayoutCatalog.Creators);
        Assert.Equal(new[] { "cta", "how", "earnings", "rules", "faq" }, merged.Select(s => s.Key));
        Assert.False(merged[0].Visible);
    }

    [Theory]
    [InlineData("/contact", true)]
    [InlineData("/register?audience=creator", true)]
    [InlineData("/creators#how-it-works", true)]
    [InlineData("https://example.com/offer", true)]
    [InlineData("//evil.test", false)]
    [InlineData("/\\evil.test", false)]
    [InlineData("http://example.com", false)]
    [InlineData("javascript:alert(1)", false)]
    [InlineData("/two words", false)]
    public void Link_texts_accept_same_site_paths_and_https(string value, bool ok) => Assert.Equal(ok, SiteCopyService.IsLink(value));

    [Fact]
    public void Every_link_default_is_a_valid_link()
    {
        var links = SiteCopyCatalog.ByKey.Values.Where(e => e.Type == CopyType.Link).ToList();
        Assert.NotEmpty(links);
        foreach (var entry in links)
        {
            var errors = new FieldErrors();
            SiteCopyService.Validate(entry, entry.Default, entry.Key, errors);
            Assert.False(errors.Any, entry.Key);
        }
    }
}
