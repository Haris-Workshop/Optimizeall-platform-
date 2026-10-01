using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using OptimizeAll.Api.Common.Persistence;
using OptimizeAll.Api.Modules.Learning;
using OptimizeAll.Domain.Identity;
using OptimizeAll.Domain.Learning;
using OptimizeAll.Infrastructure.Persistence;
using OptimizeAll.IntegrationTests.Infrastructure;

namespace OptimizeAll.IntegrationTests.Learning;

/// <summary>
/// The shipped course-pack catalog (Modules/Learning/Catalog/*.json, compiled into the API): every embedded pack passes the
/// Strict validator and the Baseline seed publishes all of them on a fresh database, so a pack that cannot go live fails CI
/// instead of silently missing from /learn. The count is the number of embedded packs, never a hard-coded number.
/// </summary>
public sealed class CatalogHealthTests(ApiFactory api) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task Every_embedded_pack_passes_the_strict_validator_and_is_published_on_a_fresh_database()
    {
        var files = CoursePackLibrary.All;
        Assert.Equal(CoursePackLibrary.Names.Count, files.Count);
        Assert.NotEmpty(files);
        foreach (var file in files)
        {
            Assert.True(file.Pack is not null, $"{file.FileName}: {file.ParseError}");
            var issues = CoursePackValidator.Validate(file.Pack!, PackValidationMode.Strict);
            Assert.True(issues.Count == 0, $"{file.FileName}:\n" + string.Join('\n', issues));
        }

        var slugs = files.Select(f => f.Pack!.Slug).ToList();
        var published = await api.WithDbAsync(db => db.Set<Course>().AsNoTracking()
            .Where(c => c.Origin == CourseSource.Pack && c.Status == CourseStatus.Published && c.PublishedVersionId != null)
            .Select(c => c.Slug).ToListAsync());
        Assert.Empty(slugs.Except(published));
        Assert.True(published.Count >= files.Count, $"{published.Count} published of {files.Count} embedded packs");
    }

    [Fact]
    public async Task The_admin_endpoint_reports_published_total_and_invalid_counts_to_learning_viewers_only()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.CreateClient().GetAsync("/api/v1/admin/learning/catalog-health")).StatusCode);
        var (_, participant) = await api.CreateClientAsync(Role.Participant);
        Assert.Equal(HttpStatusCode.Forbidden, (await participant.GetAsync("/api/v1/admin/learning/catalog-health")).StatusCode);

        var (_, admin) = await api.CreateClientAsync(Role.Admin);
        var health = await (await admin.GetAsync("/api/v1/admin/learning/catalog-health")).ReadJsonAsync();
        Assert.Equal(CoursePackLibrary.Names.Count, health.GetProperty("totalPacks").GetInt32());
        Assert.True(health.GetProperty("publishedPacks").GetInt32() >= health.GetProperty("totalPacks").GetInt32());
        Assert.Equal(0, health.GetProperty("invalidPacks").GetInt32());
        Assert.Equal(0, health.GetProperty("failedPacks").GetInt32());
        Assert.True(health.GetProperty("seedRan").GetBoolean());
        Assert.Equal(0, health.GetProperty("problems").GetArrayLength());
    }

    [Fact]
    public async Task An_invalid_pack_is_logged_at_error_level_with_its_slug_and_reason_and_the_summary_line_is_logged()
    {
        var logs = new LogCapture();
        var good = SamplePacks.V1();
        good.Slug = "health-ok-" + Guid.NewGuid().ToString("N")[..8];
        var bad = SamplePacks.V1();
        bad.Slug = "health-bad-" + Guid.NewGuid().ToString("N")[..8];
        bad.Title = string.Empty;
        Assert.NotEmpty(CoursePackValidator.Validate(bad, PackValidationMode.Authoring));

        using var scope = api.Services.CreateScope();
        var health = new LearningCatalogHealth();
        var seeder = new LearningCatalogSeeder(scope.ServiceProvider.GetRequiredService<IDatabaseDialect>(), TimeProvider.System,
            new LoggerFactory(new[] { logs }).CreateLogger<LearningCatalogSeeder>(), health);
        var changes = await seeder.UpsertAsync(scope.ServiceProvider.GetRequiredService<AppDbContext>(), new[]
        {
            new PackFile(good.Slug + ".json", good.ToJson(), good, null),
            new PackFile(bad.Slug + ".json", bad.ToJson(), bad, null),
        }, CancellationToken.None);

        Assert.Equal(1, changes);
        var error = Assert.Single(logs.Entries, e => e.Level == LogLevel.Error);
        Assert.Contains(bad.Slug, error.Message);
        Assert.Contains("title", error.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains(logs.Entries, e => e.Message.StartsWith("Learning catalog: 1 of 2 packs published", StringComparison.Ordinal));
        var run = health.Last!;
        Assert.Equal((2, 1), (run.Total, run.Published));
        var problem = Assert.Single(run.Problems);
        Assert.Equal((bad.Slug, "invalid"), (problem.Slug, problem.Kind));
    }
}
