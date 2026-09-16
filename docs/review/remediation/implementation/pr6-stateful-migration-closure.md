# PR6 infrastructure version and storage migration closure

IFR-24-001 is locally verified under D12. The earlier hashed infrastructure
chart/image checkpoints and Redis migration are now completed by PostgreSQL and
Qdrant source-data migration, separate destination releases, storage transfer,
client/network binding and explicit rollback boundaries. This closes the
original unbound installer/version finding; it does not close provider capacity,
coordinated off-node recovery, image reproducibility or live acceptance.

## PostgreSQL

`postgresql-recovery.sh migrate` accepts an explicit recorded source version and
requires the real selected destination server/dump/restore client version. It
supports forward logical migration, while ordinary restore still requires the
same server version. Source identity, checksum/age/size, application-image and
credential bindings remain enforced. A different initially empty database is
required. Owners/ACLs are retained and restore runs in one transaction.

Two final real native tests pass with zero skips: PostgreSQL18.6→18.6 and
17.11→18.6. Both use the full original LiteLLM schema (1012 columns/217 indexes),
real password authentication and unchanged upstream encryption/decryption code.
They compare original authorization/model rows and both encrypted formats. An
intentional missing object-owner role makes the actual restore fail after SQL
has started; the destination has no partially committed objects. Recreating the
correct role then allows a complete restore with owner preservation. Corrupt,
stale, incomplete, same-server, nonempty and incorrectly bound inputs fail.

`POSTGRESQL_RELEASE`/`POSTGRESQL_VALUES_FILE` select a distinct Helm destination.
Scheduled recovery derives its Service and workload selector from that actual
chart render. The runbook covers global roles/extensions/locale, fenced final
dump, fresh PVC, source shutdown, canary/client switch and the no-new-writes
rollback boundary. See [PostgreSQL migration](../../../operations/postgresql-migration.md).

## Qdrant

A full-storage snapshot export records all collections/aliases and verifies the
actual downloaded bytes. Single-peer cluster mode is allowed only with stable
local shards; multi-peer or moving/remote shards are rejected. The restore
copies and rehashes the package privately, refuses any existing directory and
uses the real `--storage-snapshot` option. Version changes require an explicit
selected version and a forward patch or one consecutive minor, never a skipped
minor/major or downgrade. The old one-collection exact-version restore remains.

Two native tests pass with zero skips. The existing TLS/auth/read-only-key,
corruption, restart and key-rotation gate remains intact. The added real
1.18.2→1.19.1 migration starts the source in the actual chart's enabled
single-peer Raft mode. Two collections, an alias, original vectors/payloads and
search order survive full snapshot restore, clean shutdown, copying into a
fresh directory and enabled-cluster restart. The old source also restarts with
its original peer URI and original data. Corrupt bytes, existing targets,
wrong selected version, downgrade and skipped-version inputs are refused.

`QDRANT_RELEASE`/`QDRANT_VALUES_FILE` now bind normal deployment, teardown and
preflight. Runtime version, immutable templates, Bound claims and orphaned
storage are checked before mutations. TLS validation uses the actual selected
Service DNS. The migration renderer derives fresh storage/snapshot PVCs and a
bounded network-isolated transfer Pod from the locked chart. The explicit first
restore installation is documented; ordinary orphaned-PVC checks stay enabled.
The Qdrant migration implementation described here was retired on 2026-09-16; the evidence below is historical.

## Shared chart/network gate and raw evidence

`stateful-database-service.mjs` derives the actual Redis/PostgreSQL/Qdrant Service,
workload selector and port mapping. `render-stateful-network-policies.mjs`
binds ingress and consumer egress together, including translated Service ports.
Unexpected policy shapes fail closed. Qdrant gets HTTP/gRPC edges, not Raft
access. Normal infrastructure deployment renders the result before mutations.

Ten real archived Helm/manifest-contract tests pass: the three install/upgrade
renders, retained-claim/version safeguards, selected recovery release/service,
all three network bindings and fresh Qdrant transfer resources. No fake Helm,
kubectl, database or network protocol implementation supplies this evidence.
Manifest cases are not a claim of executed Kubernetes admission or CSI attach.

Raw evidence:
- `docs/review/evidence/pr6-postgresql-migration/recovery.txt`
- `docs/review/evidence/pr6-postgresql-migration/migration.txt`
- `docs/review/evidence/pr6-postgresql-migration/charts.txt`
- `docs/review/evidence/pr6-postgresql-migration/lint.txt`
- `docs/review/evidence/pr6-qdrant-migration/native.txt`

PostgreSQL uses original PG17.11 image binaries and PG18.6 compiled source in a
QEMU Linux guest with real UID999 and ext4. The disk is a memory-backed block
device; backup files use host tmpfs with working fsync. Host scratch initially
returned fsync EIO and a synchronized disk copy exhausted host space; those runs
failed and were not accepted. The final runs use real fsync, not a disabled or
mocked durability operation. Qdrant likewise uses actual native binaries and
tmpfs with real fsync. This proves logical migration, not physical durability.
An initial Qdrant source restart changed its peer URI and failed; retaining the
original URI resolved it. Test expectations were adapted to Qdrant's verified
`v`-prefixed chart metadata and tag-plus-digest image representation; digest and
runtime-version requirements were not relaxed.

Pinned provenance: PostgreSQL17 image
`pgvector/pgvector:pg17@sha256:cf134a767f474095eeba57e0117be8e568e011a63f33fbf252f14c9b760f8e6f`;
PG18.6 source SHA256
`555610c24d53e4316da5b7d3fc25c279d96856d5e0e23ee308c328c5fa881d9f`;
Qdrant1.18.2 release archive SHA256
`cd619c61d8d32dd176af88cf498714ecb765b7df9021d691862478d6ac35392c`;
Qdrant1.19.1 release archive SHA256
`eef986e769d4d3e806dd2d546e1b4ecdd416211e54d34b4ed764fac7c58e1085`.
The production chart/image identities remain in `versions.json`.

Actual container entrypoints, Kubernetes/CSI transfer, live network negative
checks, application HTTP canaries and independent production backup acceptance
remain the operator's live gate. No deployment, merge or history cleanup ran.
The unrelated deployment-truth script still has its pre-existing Nova archviewer
NodePort assertion mismatch; no full-repository green claim is made.
