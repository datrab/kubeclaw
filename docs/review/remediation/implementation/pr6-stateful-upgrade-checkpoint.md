# PR 6 stateful upgrade checkpoint

This checkpoint fixes IFR-15-001 locally under D12. It does not close the four
original Core/Buster/Prism/Observability findings or the remaining stateful
capacity, migration and coordinated recovery findings.

## Prism database upgrade boundary

Ordinary bootstrap no longer executes `ALTER ROLE ... PASSWORD` for existing
roles. Real password authentication verifies every existing role before any
role/schema/grant changes. Missing roles and additive grants commit together
under an advisory transaction lock. A wrong password fails closed without
replacing the working SCRAM verifiers. Migration 016 retains the pre-011 INSERT
contract while preserving wire-event uniqueness. Historical migrations remain
unchanged. Operator documentation separates Kubernetes rollback from committed
schema changes and external Secrets, defines a fenced maintenance credential
transition and an isolated restore procedure, and prepares the actual failed
worker-Pod rollout for the operator's final live acceptance.

`skills/prism/tests/native/database-upgrade.mts` passed against native PostgreSQL
17.11 and pgvector 0.8.6 from the exact selected Prism OCI image. The test applies
the actual migrations as `prism_migrator`, verifies runtime and readonly access,
rejects credential changes, proves old INSERT compatibility and duplicate
rejection, runs a real application-process failure after migration, and restores
a custom-format dump into a separate initially empty server. Original
migration/event/nonce records compare exactly; restored authentication, ACLs,
legacy writes and the vector extension work. This is not a Kubernetes rollback
or cross-store recovery result.

## Infrastructure pins and upgrade guards

Redis chart 28.1.0 / application 8.10.1 and PostgreSQL chart 18.11.1 / application
18.6.0 are bound in `versions.json` by immutable OCI/chart/image hashes. Both
actual install/upgrade renders pass. The upstream PostgreSQL offline password
helper receives a marker that is required to disappear from every resource;
the marker never enters a real upgrade or authentication request.

Before infrastructure mutations, the stateful preflight checks actual existing
StatefulSet/PVC metadata and database versions. Redis additionally checks actual
AOF/no-eviction configuration. Incompatible templates, old/unknown versions,
orphaned volumes or unsafe durability transitions stop deployment. PostgreSQL
now requests 20 GiB storage and a 4 GiB memory limit. The complete source-data
migration/cutover, off-node backup and provider capacity workflow is still open;
the preflight does not turn a blocked upgrade into a completed migration.

The real Redis 8.10.1 server passed the actual application's Lua transport gate:
lost acknowledgement, SIGKILL/restart, retry deduplication and no-eviction refusal.
The native upstream binary test is not execution of the Bitnami entrypoint.

## Native admission follow-up

Expired or unsupported new attempts are rejected under the journal admission
lock before their identity/input is persisted. Such a rejection no longer
permanently fences the worker. Accepted historical receipt replay bypasses new
admission checks. If a claim expires after admission but before launch, the
intact owner lookup proves no launch and a durable failure receipt is sealed.
Six real filesystem/flock/process journal tests pass, including the new
pre-admission rejection and reopened receipt-replay regression. Positive cgroup
execution and production V3 activation remain separately open.

## Evidence and limits

Raw evidence is in `docs/review/evidence/pr6-stateful-upgrades/`: three archived
Helm/policy tests, one native Redis test, six durable journal tests and one native
Prism database integration test pass, with zero failed/skipped cases. Two
additional filesystem version-propagation tests pass after splitting the version
generator into lint-compliant functions; its 27 generated outputs are unchanged. Canonical
lint, Core/Prism typechecks, shell syntax and all 27 generated-version checks
pass. These are focused gates, not a claim that every repository test ran.

`prism-sql-regression.txt` also retains six earlier mixed tests: they include
PGlite SQL, pure projection logic and two query-recording test doubles. They are
not counted as native database evidence. The actual PostgreSQL gate above
establishes authentication, DDL, privileges and restore behavior without mocks.
An initial incorrect version-check CLI invocation is retained separately; the
correct `--check` invocation passed.

Local native database execution used a QEMU TCG Linux guest, original PG17/vector
image binaries on a read-only filesystem, and fresh ext4 database storage owned
by guest UID 999. Host loopback forwarding reached isolated source/destination
servers. This did not use KVM, a deployed cluster, a fake cgroup filesystem or
the previously denied isolation helper. Initial guest socket/locale startup
failures were fixed before the passing integration run. PG18's minimal test
root uses locale C/UTF-8 encoding and is not a complete Bitnami container.

Pinned provenance: Prism image
`pgvector/pgvector:pg17@sha256:cf134a767f474095eeba57e0117be8e568e011a63f33fbf252f14c9b760f8e6f`;
Redis 8.10.1 source SHA-256
`60166c95ab7aedaa9dfe516de685be0a4dd87be95ded59ba429df14c13f1b663`;
PostgreSQL 18.6 client source SHA-256
`555610c24d53e4316da5b7d3fc25c279d96856d5e0e23ee308c328c5fa881d9f`.
Redis optional module compilation failed; the explicit `redis-server` and
`redis-cli` core build passed. No full optional-module build is claimed.
