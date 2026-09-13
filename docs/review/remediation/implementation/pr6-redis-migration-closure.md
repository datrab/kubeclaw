# IFR-11-001 local closure

Redis durability is locally complete under D12. **139/154 locally verified,
15 incomplete**. Native Kubernetes/CSI, container-entrypoint and hardware
power-loss acceptance remain explicit operator work; none is reported passed.

The existing selected Redis chart/image and AOF/noeviction contract now have an
actual data migration path. `redis-prepare-migration.sh` converts a verified RDB
into a fresh selected-version AOF dataset, waits for rewrite and proves an
AOF-only restart before publishing the receipt/checksums. It never overwrites
the source or an existing destination. Temporary server access is authenticated
and loopback-only, with bounded execution and private temporary files.

The [complete maintenance procedure](../../../operations/redis-migration.md)
specifies source writer fencing, bounded snapshot capture, source shutdown,
independent backup, fresh volume population, checksum verification on that
volume, exact chart/image first install, canary acceptance, endpoint switch and
the point after which rollback requires a new authoritative backup. It avoids
immutable claim-template replacement and provider-dependent PVC expansion.

Deployment and teardown use the selected `REDIS_RELEASE` and
`REDIS_VALUES_FILE`. The preflight inspects that release rather than accidentally
comparing it with the retained source. Explicitly mounted existing PVCs must
remain Bound. Fresh orphaned data still requires the explicit restore procedure;
normal deployment has no override to skip this boundary.

## Evidence

`../evidence/pr6-redis-migration/native.txt`: **2 native tests passed**, no skips.
The migration uses real Redis 7.2.7 and 8.10.1, the actual replication snapshot
transport, original publisher Lua and production values. After conversion and
restart, stream records, pending consumer state and exact absolute dedup expiry
match. A retry returns the original entry without duplication. Existing-target
and wrong-checksum attempts fail without touching the running target.
The other test verifies lost ACK, SIGKILL/restart, durable retry and noeviction
OOM refusal. This is native process-crash recovery, not storage power-loss proof.

`../evidence/pr6-redis-migration/helm.txt`: **4 archived Helm/policy tests passed**,
no skips. They include the separately named destination release and restored-PVC
binding. Shell syntax, canonical preflight lint and diff whitespace checks pass.

An initial migration test failed because native Unix sockets are unavailable
in this environment. The final implementation uses authenticated loopback TCP
and that original test passes. Initial Helm execution failed with SIGSEGV because
an extracted binary was truncated; restoring all 59,715,768 bytes from its
existing archive fixed the tool. No source check or policy was disabled.

Native sources: Redis 8.10.1 archive SHA-256
`60166c95ab7aedaa9dfe516de685be0a4dd87be95ded59ba429df14c13f1b663`;
Redis 7.2.7 archive SHA-256
`72c081e3b8cfae7144273d26d76736f08319000af46c01515cad5d29765cead5`.
The selected 8.10.1 core server/CLI/checker and 7.2.7 server/CLI compiled locally.
Optional Redis modules and Bitnami entrypoints were not executed.

IFR-24-001 still includes the separate PostgreSQL storage/version cutover.
Cross-store/off-node backup policy and physical node capacity remain in their
own open findings. This closure does not silently close those dependencies.
