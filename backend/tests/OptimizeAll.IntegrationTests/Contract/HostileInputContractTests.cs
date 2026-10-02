using System.Diagnostics;
using System.Text.RegularExpressions;
using Xunit.Abstractions;

namespace OptimizeAll.IntegrationTests.ApiContract;

/// <summary>
/// Every endpoint, called by a caller its metadata allows, answers every input of the hostile matrix (<see cref="HostileCases"/>)
/// with a success or a 4xx RFC 7807 problem carrying <c>code</c> and <c>traceId</c>: never a 5xx, never internals, unknown
/// ids are never a success, malformed JSON/types/enums/dates are 400, unsupported media types 415, oversized pages clamped
/// or 400. The body/form cases run twice for endpoints with record ids: against unknown ids (the lookup answers 404) and
/// against existing demo records, so the handler logic behind the lookup sees the hostile values as well. Exceptions that
/// escape the host's pipeline are findings too, also when they come after the response started and the client had already
/// read it (<see cref="ContractFixture.ServerFailures"/>); a client-side transport error names the server exception behind it.
/// </summary>
[Collection(ContractCollection.Name)]
public sealed partial class HostileInputContractTests(ContractFixture fx, ITestOutputHelper output)
{
    /// <summary>Real-record runs skip deletions and actions that would remove the demo data other checks rely on.</summary>
    [GeneratedRegex("delete|remove|archive|purge|anonymi|erase|revoke|suspend|deactivate|impersonat|merge|convert|void|cancel|reset", RegexOptions.IgnoreCase)]
    private static partial Regex Destructive();

    [Fact]
    public async Task Every_endpoint_rejects_hostile_input_with_a_problem_and_never_fails_with_a_500()
    {
        var findings = new Findings();
        fx.ServerFailures.Drain(); // only this test's requests
        var stopwatch = Stopwatch.StartNew();
        var anyTenant = await fx.WithDbAsync(db => IdIndex.LoadAsync(db, perType: 1));
        var tenantA = await fx.WithDbAsync(db => IdIndex.LoadAsync(db, fx.ClientA, perType: 1));

        var work = new List<(ApiEndpoint Endpoint, Caller? Caller, Case Case)>();
        foreach (var e in fx.Endpoints)
        {
            var caller = fx.AuthorizedCallerFor(e);
            work.AddRange(HostileCases.For(e).Select(c => (e, caller, c)));
            if (caller is null || e.Method == "DELETE" || Destructive().IsMatch(e.Route) || !(e.HasBody || e.HasForm)) continue;
            var index = caller.Role == Domain.Identity.Role.Client ? tenantA : anyTenant;
            if (index.RealRoute(e) is { } route)
                work.AddRange(HostileCases.For(e, route).Select(c => (e, (Caller?)caller, c with { Name = "existing ids, " + c.Name })));
        }

        var statuses = new System.Collections.Concurrent.ConcurrentDictionary<(bool Existing, int Status), int>();
        await Findings.ForEachAsync(work, ContractFixture.Parallelism, async item =>
        {
            var (endpoint, caller, @case) = item;
            Outcome outcome;
            try
            {
                outcome = await Outcome.ReadAsync(await fx.SendAsync(caller, @case.Build));
            }
            catch (Exception ex)
            {
                findings.Add($"{endpoint.Key} [{@case.Name}] as {caller?.Name ?? "anonymous"}: {Findings.ClientFailure(ex)}");
                return;
            }
            statuses.AddOrUpdate((@case.Name.StartsWith("existing ids", StringComparison.Ordinal), outcome.Status), 1, (_, n) => n + 1);
            var violation = outcome.ContractViolation(endpoint.Key) ?? @case.Expect?.Invoke(outcome);
            if (outcome.IsChallenge && caller is not null) violation ??= $"[401] signed-in caller got {outcome.Short}";
            if (violation is not null)
                findings.Add($"{endpoint.Key} [{@case.Name}] as {caller?.Name ?? "anonymous"}: {violation}");
        });

        output.WriteLine($"{fx.Endpoints.Count} endpoints, {work.Count} hostile requests " +
                         $"({work.Count(w => w.Case.Name.StartsWith("existing ids", StringComparison.Ordinal))} against existing records) " +
                         $"in {stopwatch.Elapsed.TotalSeconds:F0}s");
        foreach (var existing in new[] { false, true })
            output.WriteLine((existing ? "existing ids: " : "unknown ids:  ") + string.Join(", ",
                statuses.Where(s => s.Key.Existing == existing).OrderBy(s => s.Key.Status).Select(s => $"{s.Key.Status}x{s.Value}")));
        foreach (var failure in fx.ServerFailures.Drain()) findings.Add(failure);
        findings.AssertEmpty("hostile-input", work.Count);
    }
}
