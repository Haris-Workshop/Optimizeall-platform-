using Microsoft.EntityFrameworkCore;
using OptimizeAll.Api.Common.Persistence;
using OptimizeAll.Api.Modules.Learning.Admin;
using OptimizeAll.Domain.Learning;
using OptimizeAll.Infrastructure.Persistence;

namespace OptimizeAll.Api.Modules.Learning;

/// <summary>
/// Upserts the course packs shipped with the API (Modules/Learning/Catalog/*.json) on startup ("Baseline" seed profile, so
/// every environment gets the catalog). Idempotent by slug + pack version, under the named lock "learning-catalog"
/// (several API instances may start at once):
/// <list type="bullet">
/// <item>New slug → a pack-origin course with version 1 (pack version N), published.</item>
/// <item>Known slug, higher pack version → a new course version. It is published automatically only while the live
/// version is itself pack-sourced; if staff published an edited version, the pack update is stored but NOT published
/// (the Learning admin shows "pack update available" and staff decide). Nothing is ever overwritten.</item>
/// <item>Same pack version with different content → ignored with a warning (bump <c>version</c> to ship changes).</item>
/// <item>A pack that fails validation (structural rules, <see cref="PackValidationMode.Authoring"/>) is skipped with an error
/// log; CI's <c>CoursePackTests</c> applies every rule (<see cref="PackValidationMode.Strict"/>) so this should not happen.</item>
/// </list>
/// </summary>
public sealed class LearningCatalogSeeder(
    IDatabaseDialect dialect, TimeProvider clock, ILogger<LearningCatalogSeeder> logger, LearningCatalogHealth? health = null) : ISeeder
{
    public const string LockName = "learning-catalog";

    public string Profile => "Baseline";
    public int Order => 40;

    // Streams the packs one at a time: the whole parsed catalog is never in memory at once.
    public Task SeedAsync(AppDbContext db, CancellationToken ct) => UpsertAsync(db, CoursePackLibrary.Enumerate(), ct);

    /// <summary>
    /// Upserts each pack under its own savepoint, clearing the change tracker after each one (the content JSON of every
    /// course version would otherwise stay tracked until the end). A pack that fails is rolled back, logged and skipped;
    /// the others are still applied.
    /// </summary>
    public async Task<int> UpsertAsync(AppDbContext db, IEnumerable<PackFile> files, CancellationToken ct)
    {
        await using var _ = await dialect.AcquireNamedLockAsync(db, LockName, TimeSpan.FromSeconds(120), ct);
        await using var tx = await dialect.BeginWriteTransactionAsync(db, ct);
        var now = clock.GetUtcNow().UtcDateTime;
        int changes = 0, packs = 0, failed = 0;
        var problems = new List<CatalogPackProblem>();
        var slugs = new List<string>();
        foreach (var file in files)
        {
            packs++;
            if (file.Pack is not { } pack)
            {
                logger.LogError("Course pack {File} (slug unknown) is not valid JSON and was skipped: {Error}", file.FileName, file.ParseError);
                problems.Add(new CatalogPackProblem(file.FileName, null, "invalid", file.ParseError ?? "Not valid JSON."));
                continue;
            }
            var issues = CoursePackValidator.Validate(pack, PackValidationMode.Authoring);
            if (issues.Count > 0)
            {
                var reason = string.Join("; ", issues.Take(10));
                logger.LogError("Course pack {Slug} ({File}) is invalid and was skipped: {Issues}", pack.Slug, file.FileName, reason);
                problems.Add(new CatalogPackProblem(file.FileName, pack.Slug, "invalid", reason));
                continue;
            }
            slugs.Add(pack.Slug);
            await tx.CreateSavepointAsync("course_pack", ct);
            try
            {
                if (await UpsertAsync(db, pack, now, ct)) changes++;
                await tx.ReleaseSavepointAsync("course_pack", ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                failed++;
                await tx.RollbackToSavepointAsync("course_pack", ct);
                logger.LogError(ex, "Course pack {Slug} ({File}) could not be applied and was skipped: {Reason}", pack.Slug, file.FileName, ex.Message);
                problems.Add(new CatalogPackProblem(file.FileName, pack.Slug, "failed", ex.Message));
            }
            finally
            {
                db.ChangeTracker.Clear();
            }
        }
        await tx.CommitAsync(ct);
        logger.LogInformation("Learning catalog: {Packs} course pack(s) checked, {Count} added or updated, {Failed} failed", packs, changes, failed);

        // The one line to look for after a deploy: how much of the shipped catalog is live. Fewer than all is a warning.
        var published = slugs.Count == 0 ? 0 : await db.Set<Course>().AsNoTracking().CountAsync(c =>
            slugs.Contains(c.Slug) && c.Origin == CourseSource.Pack && c.Status == CourseStatus.Published && c.PublishedVersionId != null, ct);
        if (published == packs) logger.LogInformation("Learning catalog: {Published} of {Total} packs published", published, packs);
        else logger.LogWarning("Learning catalog: {Published} of {Total} packs published ({Problems} with problems; staff may also have unpublished some)", published, packs, problems.Count);
        health?.Record(new CatalogSeedRun(packs, published, problems, clock.GetUtcNow().UtcDateTime));
        return changes;
    }

    private async Task<bool> UpsertAsync(AppDbContext db, CoursePack pack, DateTime now, CancellationToken ct)
    {
        var course = await db.Set<Course>().FirstOrDefaultAsync(c => c.Slug == pack.Slug, ct);
        if (course is null)
        {
            course = new Course { Slug = pack.Slug, Origin = CourseSource.Pack, SortOrder = 100 };
            CourseVersioning.ApplyListing(course, pack);
            db.Set<Course>().Add(course);
            var first = CourseVersioning.NewVersion(course, pack, 1, CourseSource.Pack, pack.Version, null, $"Course pack v{pack.Version}", null, now);
            db.Set<CourseVersion>().Add(first);
            course.LatestVersionId = first.Id;
            CourseVersioning.Publish(course, first, pack, now);
            await db.SaveChangesAsync(ct);
            return true;
        }
        if (course.Origin != CourseSource.Pack)
        {
            logger.LogWarning("Course pack {Slug} skipped: the slug belongs to a staff-authored course", pack.Slug);
            return false;
        }

        var packVersions = await db.Set<CourseVersion>().Where(v => v.CourseId == course.Id && v.Source == CourseSource.Pack)
            .Select(v => new { v.Id, v.PackVersion, v.ContentSha256 }).ToListAsync(ct);
        var latestPack = packVersions.MaxBy(v => v.PackVersion ?? 0);
        if (latestPack is not null && pack.Version <= (latestPack.PackVersion ?? 0))
        {
            var same = packVersions.FirstOrDefault(v => v.PackVersion == pack.Version);
            var candidate = CourseVersioning.NewVersion(course, pack, 0, CourseSource.Pack, pack.Version, null, null, null, now);
            if (same is not null && same.ContentSha256 != candidate.ContentSha256)
                logger.LogWarning("Course pack {Slug} v{Version} changed without a version bump; the change is ignored (bump \"version\")",
                    pack.Slug, pack.Version);
            return false;
        }

        var publishedSource = course.PublishedVersionId is { } pid
            ? await db.Set<CourseVersion>().Where(v => v.Id == pid).Select(v => (CourseSource?)v.Source).FirstOrDefaultAsync(ct)
            : null;
        var number = await CourseVersioning.NextNumberAsync(db, course.Id, ct);
        var version = CourseVersioning.NewVersion(course, pack, number, CourseSource.Pack, pack.Version, latestPack?.Id,
            $"Course pack v{pack.Version}", null, now);
        db.Set<CourseVersion>().Add(version);
        course.LatestVersionId = version.Id;
        if (publishedSource is null or CourseSource.Pack)
        {
            // Staff may have unpublished the course: keep it unpublished, but point it at the new content.
            var status = course.Status;
            CourseVersioning.Publish(course, version, pack, now);
            if (publishedSource is not null) course.Status = status;
            logger.LogInformation("Course pack {Slug} updated to pack v{Version} (course version {Number})", pack.Slug, pack.Version, number);
        }
        else
        {
            logger.LogWarning("Course pack {Slug} v{Version} stored as course version {Number} but not published: staff published an edited version",
                pack.Slug, pack.Version, number);
        }
        await db.SaveChangesAsync(ct);
        return true;
    }
}

/// <summary>A pack the catalog seed could not apply: <c>invalid</c> (does not parse or fails the structural rules) or <c>failed</c> (the upsert threw).</summary>
public sealed record CatalogPackProblem(string File, string? Slug, string Kind, string Reason);

/// <summary>The result of the last catalog seed run in this process.</summary>
public sealed record CatalogSeedRun(int Total, int Published, IReadOnlyList<CatalogPackProblem> Problems, DateTime CheckedAt);

/// <summary>Remembers the last <see cref="LearningCatalogSeeder"/> run so the Learning admin can show catalog health (singleton).</summary>
public sealed class LearningCatalogHealth
{
    private volatile CatalogSeedRun? _last;

    public CatalogSeedRun? Last => _last;

    public void Record(CatalogSeedRun run) => _last = run;
}
