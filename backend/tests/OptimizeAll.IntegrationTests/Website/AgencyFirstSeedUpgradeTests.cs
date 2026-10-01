using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using OptimizeAll.Api.Modules.Website.Pages;
using OptimizeAll.Api.Modules.Website.Seed;
using OptimizeAll.Api.Modules.Website.Settings;
using OptimizeAll.Domain.Settings;
using OptimizeAll.Domain.Website;
using OptimizeAll.Infrastructure.Persistence;
using OptimizeAll.IntegrationTests.Infrastructure;

namespace OptimizeAll.IntegrationTests.Website;

/// <summary>
/// Databases still on an earlier built-in generation of the site settings get the agency-first defaults at the next start
/// (once, keyed in the seed ledger); settings an administrator edited are never overwritten.
/// </summary>
public sealed class AgencyFirstSeedUpgradeTests(ApiFactory api) : IClassFixture<ApiFactory>
{
    private static readonly SiteSettings D = SiteSettingsService.Defaults;

    private static SiteSettings AcademyFirst() => D with
    {
        Header = new HeaderSettings(SiteSettingsService.AcademyFirstDefaults.Menu, SiteSettingsService.AcademyFirstDefaults.Cta),
        Footer = D.Footer with { Blurb = SiteSettingsService.AcademyFirstDefaults.Blurb, Columns = SiteSettingsService.AcademyFirstDefaults.Columns },
        Seo = D.Seo with { DefaultTitle = SiteSettingsService.AcademyFirstDefaults.SeoTitle, DefaultDescription = SiteSettingsService.AcademyFirstDefaults.SeoDescription },
    };

    /// <summary>Stores <paramref name="settings"/>, forgets that the upgrade ran (as on a database from before this release) and runs the seeder.</summary>
    private async Task<SiteSettings> SeedWithAsync(SiteSettings settings, bool upgradeNotYetRun)
    {
        return await api.WithDbAsync(async db =>
        {
            var doc = await db.Set<SiteSettingsDocument>().SingleAsync(d => d.Key == SiteSettingsDocument.DefaultKey);
            doc.Json = JsonSerializer.Serialize(settings, SiteSettingsService.Json);
            var ledger = await db.Set<SystemSetting>().SingleAsync(s => s.Key == "seed.website_baseline");
            var keys = JsonSerializer.Deserialize<List<string>>(ledger.ValueJson)!;
            keys.Remove(WebsiteBaselineSeeder.AgencyFirstUpgradeKey);
            if (!upgradeNotYetRun) keys.Add(WebsiteBaselineSeeder.AgencyFirstUpgradeKey);
            ledger.ValueJson = JsonSerializer.Serialize(keys);
            await db.SaveChangesAsync();

            await new WebsiteBaselineSeeder().SeedAsync(db, CancellationToken.None);
            db.ChangeTracker.Clear();
            return SiteSettingsService.Parse((await db.Set<SiteSettingsDocument>().AsNoTracking().SingleAsync(d => d.Key == SiteSettingsDocument.DefaultKey)).Json);
        });
    }

    private static string J<T>(T value) => JsonSerializer.Serialize(value, SiteSettingsService.Json);

    [Fact]
    public async Task Settings_still_on_the_academy_first_defaults_are_upgraded_exactly_once()
    {
        var upgraded = await SeedWithAsync(AcademyFirst(), upgradeNotYetRun: true);
        Assert.Equal(J(D.Header), J(upgraded.Header));
        Assert.Equal(D.Footer.Blurb, upgraded.Footer.Blurb);
        Assert.Equal(D.Footer.Columns.Select(c => c.Title), upgraded.Footer.Columns.Select(c => c.Title));
        Assert.Equal(D.Seo.DefaultTitle, upgraded.Seo.DefaultTitle);
        Assert.Equal(D.Seo.DefaultDescription, upgraded.Seo.DefaultDescription);

        // Once: with the upgrade recorded, a later start leaves whatever is stored alone.
        var again = await SeedWithAsync(AcademyFirst(), upgradeNotYetRun: false);
        Assert.Equal("Academy", again.Header.Menu[0].Label);
    }

    [Fact]
    public async Task Administrator_edited_settings_are_never_overwritten()
    {
        var edited = AcademyFirst() with
        {
            Header = new HeaderSettings(new[] { new MenuItem("Shop", "/shop", null, null) }, new SiteLink("Buy", "/shop")),
            Footer = AcademyFirst().Footer with { Blurb = "Our own words." },
            Seo = AcademyFirst().Seo with { DefaultTitle = "Our own title", DefaultDescription = "Our own description of the company and what it does." },
        };
        var result = await SeedWithAsync(edited, upgradeNotYetRun: true);
        Assert.Equal("Shop", Assert.Single(result.Header.Menu).Label);
        Assert.Equal("Buy", result.Header.Cta!.Label);
        Assert.Equal("Our own words.", result.Footer.Blurb);
        Assert.Equal("Our own title", result.Seo.DefaultTitle);
        Assert.Equal("Our own description of the company and what it does.", result.Seo.DefaultDescription);
        // Only the untouched part (the footer columns) moved on.
        Assert.Equal("Services", result.Footer.Columns[0].Title);
    }

    [Fact]
    public async Task An_untouched_two_pillar_about_page_becomes_the_agency_first_page_and_an_edited_one_stays()
    {
        var old = BaselinePages.TwoPillarAbout;
        async Task<SitePage> RunAsync(Action<SitePage> arrange)
        {
            return await api.WithDbAsync(async db =>
            {
                var page = await db.Set<SitePage>().SingleAsync(p => p.Slug == "about");
                page.Title = old.Title;
                page.Summary = old.Summary;
                page.BlocksJson = PageBlockValidator.Serialize(old.Blocks);
                page.Seo.Title = BaselineSeo.TwoPillarAboutTitle;
                page.Seo.Description = BaselineSeo.TwoPillarAboutDescription;
                arrange(page);
                var ledger = await db.Set<SystemSetting>().SingleAsync(s => s.Key == "seed.website_baseline");
                var keys = JsonSerializer.Deserialize<List<string>>(ledger.ValueJson)!;
                keys.Remove(WebsiteBaselineSeeder.AgencyFirstUpgradeKey);
                ledger.ValueJson = JsonSerializer.Serialize(keys);
                await db.SaveChangesAsync();
                await new WebsiteBaselineSeeder().SeedAsync(db, CancellationToken.None);
                db.ChangeTracker.Clear();
                return await db.Set<SitePage>().AsNoTracking().SingleAsync(p => p.Slug == "about");
            });
        }

        var next = BaselinePages.Pages.Single(p => p.Slug == "about");
        var upgraded = await RunAsync(_ => { });
        Assert.Equal(next.Summary, upgraded.Summary);
        Assert.Equal(PageBlockValidator.Serialize(next.Blocks), upgraded.BlocksJson);
        Assert.Equal(BaselineSeo.ForPage("about", next.Summary).Title, upgraded.Seo.Title);

        var edited = await RunAsync(p => p.Summary = "Our own summary.");
        Assert.Equal("Our own summary.", edited.Summary);
        Assert.Equal(PageBlockValidator.Serialize(old.Blocks), edited.BlocksJson);
    }
}

/// <summary>A database created by this release starts on the agency-first defaults and records the upgrade as done (own host: nothing else touches its settings).</summary>
public sealed class AgencyFirstFreshDatabaseTests(ApiFactory api) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task A_fresh_database_starts_on_the_agency_first_defaults_and_records_the_upgrade_as_done()
    {
        var d = SiteSettingsService.Defaults;
        var stored = await api.WithDbAsync(async db => SiteSettingsService.Parse((await db.Set<SiteSettingsDocument>().AsNoTracking().SingleAsync(x => x.Key == SiteSettingsDocument.DefaultKey)).Json));
        Assert.Equal(JsonSerializer.Serialize(d.Header, SiteSettingsService.Json), JsonSerializer.Serialize(stored.Header, SiteSettingsService.Json));
        Assert.Equal(d.Seo.DefaultTitle, stored.Seo.DefaultTitle);
        var ledger = await api.WithDbAsync(db => db.Set<SystemSetting>().AsNoTracking().SingleAsync(s => s.Key == "seed.website_baseline"));
        Assert.Contains(WebsiteBaselineSeeder.AgencyFirstUpgradeKey, ledger.ValueJson);
    }
}
