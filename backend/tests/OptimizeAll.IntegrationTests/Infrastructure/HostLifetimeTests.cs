using System.Runtime.CompilerServices;
using OptimizeAll.Domain.Identity;

namespace OptimizeAll.IntegrationTests.Infrastructure;

/// <summary>
/// A stopped API host can be garbage-collected. Timers that outlive a host and capture the execution context it started
/// in keep the whole host (services, EF model, caches) alive: ASP.NET Core's rate limiting middleware never disposed its
/// limiters (the SQLite test process grew to ~10 GB), and MySqlConnector's process-wide connection pools have reaper
/// timers (see ApiFactory.CreateConnectionPool).
/// </summary>
public sealed class HostLifetimeTests
{
    [MethodImpl(MethodImplOptions.NoInlining)]
    private static async Task<WeakReference> StartUseAndStopAHostAsync()
    {
        var api = new ApiFactory();
        await api.InitializeAsync();
        var (_, client) = await api.CreateClientAsync(Role.Admin);
        (await client.GetAsync("/api/v1/auth/me")).Dispose();
        var services = new WeakReference(api.Services);
        await api.DisposeAsync();
        return services;
    }

    [Fact]
    public async Task A_disposed_host_is_not_kept_alive()
    {
        // Three hosts in a row: the runtime may keep a reference to the most recently stopped one for a while (and to
        // the first host of the process), never to the ones before it.
        var first = await StartUseAndStopAHostAsync();
        var second = await StartUseAndStopAHostAsync();
        var third = await StartUseAndStopAHostAsync();

        for (var attempt = 0; attempt < 10 && second.IsAlive; attempt++)
        {
            GC.Collect();
            GC.WaitForPendingFinalizers();
            GC.Collect();
            if (second.IsAlive) await Task.Delay(200);
        }
        Assert.False(second.IsAlive, "A disposed API host is still reachable: something holds on to its services after it stopped.");
        GC.KeepAlive(first);
        GC.KeepAlive(third);
    }
}
