# Redis durability implementation checkpoint

Partial implementation for IFR-11-001; not yet closed. The checked-in policy now
sets `appendonly yes`, `appendfsync always`, no fsync suspension during rewrite,
`aof-load-truncated no`, and `maxmemory-policy noeviction`. Memory admission is
1 GiB with a 4 GiB container limit to leave substantial allocator, connection and
copy-on-write headroom. Desired PVC capacity is 20 GiB. These are starting budgets,
not measurements of the user's node capacity or workload peak.

The native Redis 7.2.7 test loads `commonConfiguration` from the actual values file
and executes the publisher's actual Lua. A real connection disables its reply
before publication, then the Redis process is SIGKILLed. Restart and retry return
the original entry ID and leave exactly one stream entry. Reducing maxmemory to
one byte makes both ordinary allocation and a new publisher invocation fail with
Redis's OOM response while retaining the existing stream and dedup key. Restoring
the production threshold permits retry. No Redis emulator or mock is used.

This demonstrates process-crash recovery on the local filesystem, not storage
hardware power-loss durability or external disaster recovery. Deduplication is
bounded by the configured TTL. Stream MAXLEN is not permanent audit retention;
canonical file evidence continues to follow D07. `appendfsync always` trades
latency/throughput for persistence before acknowledgement. No benchmark or
production sizing result is claimed.

Remaining: the deployment's exact maintained Redis image and compatible chart
must be bound and rendered together, and the live storage migration must be
prepared. Existing 2 GiB PVCs cannot be silently resized by changing StatefulSet
volumeClaimTemplates. Verify expansion support and available storage, expand the
existing claim through an explicit migration, and handle the immutable
StatefulSet template before applying the new desired capacity. Do not delete the
claim to make an upgrade succeed. Restore/rollback must retain the AOF directory,
password Secret and original Redis data-format compatibility.

The inspected OCI archive `bitnamicharts/redis:23.1.1` has archive SHA-256
`05665707e771f9ed843842d3ebacb992ef1c4089f138b9711446b37db76ad60a`.
It renders the desired persistence policy, but its image defaults to
`registry-1.docker.io/bitnami/redis:latest`; this is not a selected release.
Bitnami describes its legacy catalog as unmaintained migration-only content and
its unrestricted maintained version catalog as a commercial offering:
[upstream catalog transition](https://github.com/bitnami/containers/issues/83267).
Pinning an unsupported legacy image is not treated as a security-update solution.
