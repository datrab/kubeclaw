# Data and State: What Must Survive

Status: implemented with stated retention and disaster-recovery limits
Audience: platform operator, runtime developer, data owner, incident responder
Owner: state-owning component maintainers
Evidence: skills/nova/core; skills/worker/core; skills/buster/engine; skills/prism; charts/prism; gitops/platform; scripts/postgresql-recovery.sh; scripts/redis-prepare-migration.sh
Evidence revision: `5b6e1b97415ffefa4bb42bf2ae331f27597170b5`
Applies to: current file stores, Prism PostgreSQL, LiteLLM PostgreSQL, Redis, and content-addressed artifacts
Last verified: code, schema, chart, values, recovery-script, and focused-test inspection on 2026-09-20

## Purpose

KubeClaw keeps several kinds of state. They do not have equal authority.
A Nova event can decide whether a run completed. A Redis entry can deliver a
copy of that event, but it cannot make the decision. A PostgreSQL row can refer
to an artifact, but it does not contain the artifact bytes.

This page explains which data must survive, where it is stored, who can write
it, and how to recover it. It also states where the repository does not provide
automatic retention or complete disaster recovery.

The design uses one rule throughout the platform:

> **Restore the owner before its projections.**
>
> A projection can be rebuilt only when its authoritative source still exists.
> Do not use a cache, log, metric, Redis stream, or observer sink to invent
> missing lifecycle state.

## The Ownership Model

Three terms prevent unsafe recovery decisions.

| Term | Meaning | Example |
| --- | --- | --- |
| Authority | The record that can change or prove product state. | Nova's hash-verified event journal. |
| Durable support | Data that the authority refers to and needs for replay. | An effect result blob or Prism artifact. |
| Projection | A copy for delivery, search, display, or diagnosis. | A Redis telemetry stream or generated audit view. |

A durable support object is not optional merely because it is not the main
record. If a journal points to a digest-addressed blob, the record and the blob
form one recovery group.

## Complete Store Matrix

The physical locations below are paths inside the configured volume or service.
The deployment can mount those roots at different host paths.

| Store | Schema or format | Physical location | Writer and reader | Consistency and protection | Retention, capacity, migration, and recovery |
| --- | --- | --- | --- | --- | --- |
| Nova run snapshot | `run-snapshot.v4` with graph, registry, dispatch profile, review-cache profile, and SHA-256 digest | `<storageRoot>/runs/v2-<sha256(runId)>/run-snapshot.json` | Nova creates it once; recovery and evidence readers validate it | Private file, temporary file, `fsync`, no-replace hard link, directory `fsync` | No automatic expiry or size quota. Keep it with the complete run root. Versions v1-v4 are readable, but automatic semantic migration is not provided. |
| Nova canonical events | Hash-chained JSON Lines containing `lifecycle-event.v2` and `plugin-domain-event.v2` | `<runRoot>/events.jsonl` | Nova Core and granted plugin contexts append; scheduler recovery, audit, artifact recovery, and observers read | One append lock, monotonic file sequence, previous-record hash, durable append; an incomplete final line is truncated | No automatic expiry or compaction. Restore before resume. A broken chain, rewind, replacement, or divergent prefix stops recovery. |
| Nova effects and large results | Hash-chained effect records; result references use `effect-result-reference.v1` | `<runRoot>/effects.jsonl`; blobs under `<runRoot>/effect-results/sha256/<prefix>/<hash>.json` | Effect Coordinator writes; recovery and evidence readers read | Idempotency key, request/receipt conflict checks, append lock, content digest and byte-count verification | Results at or below 64 KiB remain inline. Larger JSON results use immutable digest paths. No garbage collector exists; back up the journal and result tree together. |
| Nova observer delivery state | `observer-checkpoint.v2` and `observer-delivery-record.v2`, each in a hash-chained journal | `<runRoot>/observer-checkpoints.jsonl`; `<runRoot>/observer-deliveries.jsonl` | Observer Runtime writes and replays | Checkpoint binds observer provenance, run, event sequence, and event ID; delivery journal retains each started/completed/failed attempt | Retain with the event journal until all required recovery and audit obligations end. Deleting it can cause redelivery. There is no automatic retirement in Nova Core. |
| Nova resource locks | Durable lock-manager records | `<storageRoot>/resource-locks` | Effect Coordinator acquires and releases; recovery validates | Fencing tokens and configured lock TTL; lock state does not replace an effect receipt | Restore with Nova state. A lock timeout is not proof that an external effect did not occur. Reconcile the effect before retry. |
| Worker ownership | `worker-ownership-store.v2`; a guarded v1-to-v2 read conversion exists | `<ownershipRoot>/owners.json` | Trusted native supervisor writes and reads | Host and boot identity, claim generation, compare-and-swap revision, private durable write, record and byte limits | Terminal identities remain reserved against stale work. No automatic deletion. A different host or unproved legacy host stops admission. |
| Worker attempt journal | `native-attempt-journal.v1` in the common durable-record store plus immutable blobs | `<journalRoot>/metadata/records/store.json`; `<journalRoot>/data/blobs/sha256/...` | Native supervisor writes; restart recovery and result readers read | Private root mode `0700`; envelope/result digest, exact attempt identity, idempotency key, global admission lock, per-attempt fence | Admission reserves input, output, result, metadata, and state capacity before work. Limits cover records, state bytes, total bytes, input, output, and result. No automatic retirement is implemented. |
| Worker original output | Two raw byte files | `<journalRoot>/outputs/<attempt-key>/stdout` and `stderr` | Native host capture writes; journal sealing and recovery read | Directory `0700`, files `0600`, no-follow exclusive creation, append and `fsync`; combined byte limit; SHA-256 checked on read | Output is never silently truncated or rotated. Keep it through result sealing and any audit period. Cleanup requires proven terminal ownership. |
| Buster remote job authority | Stored plan job, status, result, completion intent/receipt, source snapshot, and inline source archive until verified compaction | `<stateRoot>/records/store.json`; result blobs below `<stateRoot>/results/blobs/sha256/...` | Nova dispatch client and Buster HTTP service write through bounded stores; status/result/import paths read | Job ID, request digest, plan digest, source archive digest and attestation, status transition rules, result digest and receipt binding | Admission reserves result liability. Completed-job compaction is explicit and keeps source, result, and evidence authority. These file stores are not replicated databases. Back up a quiesced state root. |
| Buster local attempts | Per-job workspace, durable attempt records, closure records, fixture journal, evidence, and report-adapter delivery state | `<runtimeRoot>/<sha256(jobId)>/`; attempts below `observability/attempts`; evidence below `artifacts/` | Buster Engine and Worker Core write; restart recovery and evidence readers read | Durable records, idempotency keys, bounded state and result sizes, attempt and claim identity | Limits come from runner admission and the resolved plan. Preserve unresolved attempts. Terminal cleanup removes the extracted repository only after the retained set is known. |
| Buster evidence and reports | Immutable evidence bytes plus `ArtifactRefV1`, attempt/node results, normalized report results | `<artifactRoot>/sha256/...`; temporary collection under `<artifactRoot>/.staging` | Providers stage files; Buster verifies and publishes; report adapters and Nova read by reference | Containment checks, file and byte limits, media type, content digest, size, evidence ID, and result signature | Raw evidence and normalized report facts can both be required. There is no repository-wide automatic garbage collector or remote backup scheduler. Preserve referenced objects with results. |
| Prism relational authority | `prism` schema and the ordered migration journal; 17 forward migrations | Prism PostgreSQL data volume; database `prism` in the Prism chart | `prism_migrator` owns schema changes; `prism_runtime` reads and changes product rows; read-only role observes | Transactions, row and advisory locks, uniqueness, foreign keys, compare-and-swap frontiers, separate credentials | Stores projects, requests, rounds, documents, revisions, directions, approvals, baselines, corpus, preferences, operations, jobs, nonces, and decisions. Forward-only migrations run once by filename. No automatic row-retention scheduler exists. |
| Prism artifacts | Content-addressed bytes | Prism artifact PVC at `/var/lib/prism/artifacts`, objects below digest-derived paths | Control and ingestion publish; Control, Worker, renderer, and backup read | Temporary file, content digest, hard-link no-replace publication, file and directory `fsync`, no-follow reads | Default PVC request is 100 GiB. The chart keeps the PVC on removal. There is no automatic garbage collector. Database and artifacts form one backup group. |
| Prism derived data | Text-search vector, embeddings, previews, retrieval and other rebuildable views | PostgreSQL and artifact store, depending on object | Prism services derive; search and Studio consume | Derived data stays bound to source and model evidence where implemented | Rebuild after authority is restored. Current vector search has no approximate index or automatic re-embedding migration. Rebuild duration has no accepted RTO. |
| LiteLLM relational authority | Schema and migrations owned by the pinned LiteLLM image | Managed PostgreSQL database `litellm`, on its own PostgreSQL PVC | LiteLLM writes and reads; PostgreSQL recovery job dumps and restores | Database credentials from `postgresql-secrets`; LiteLLM master and optional salt keys remain a separate credential authority | Contains keys, permissions, budgets, stored model configuration, and encrypted credentials. It is not a cache. The repository does not own its SQL migrations. Upgrade only with the pinned application/database compatibility procedure. |
| Redis transport state | Streams with `idempotency_key` and JSON `payload`; dedup keys map stable publication keys to stream entry IDs | Standalone Redis, AOF on its PVC | Selected adapters and host observers write; configured external consumers read | Password authentication; Lua performs dedup lookup, `XADD`, and dedup-key set as one server operation; AOF `appendfsync always`; `noeviction` | Stream `MAXLEN` is approximate and per stream. Dedup TTL is finite. The production values use 1 GiB Redis memory and a 20 GiB PVC. AOF-aware migration preserves absolute expiry. Redis is not lifecycle authority. |
| Generic artifact adapter | Immutable canonical or portable JSON records | `<artifactRoot>/records/store.json`; blobs below `<artifactRoot>/blobs/sha256/...` | Granted `artifacts.write` callers publish; later stages read declared references | Namespace and resource checks, encoding, digest, size, metadata admission before immutable blob publication | Defaults: 16 MiB per artifact, 100,000 records, a 256 MiB metadata-store ceiling, and a separate 256 MiB blob-store ceiling. A lifecycle checkpoint in Nova binds the reference to its producer. No global deletion policy exists. |
| Telemetry sink records | Redacted `telemetry-envelope.v2` projections in a durable record store or Redis stream | File sink: `<root>/records/store.json`; Redis sink: configured stream prefix | Telemetry observer writes through `telemetry.emit`; sink-specific readers consume | Stable delivery idempotency, size/depth/node limits, structured redaction, store or Redis durability | Diagnostic projection only. File defaults are 100,000 records, 256 MiB total, and 1 MiB per record. Redis uses configured MAXLEN and dedup TTL. See [Telemetry](telemetry.md). |

> **Source evidence — the common file-store guarantees**
>
> [The file journal locks append, hash-chains every record, synchronizes concurrent readers, truncates only an incomplete final line, and calls `fsync`](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/core/state/journal.ts#L21-L195).
>
> [The durable-record store enforces per-record, record-count, and total-byte limits and uses idempotency plus payload digests](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugin-runtime/foundation/observability/durable-records.ts#L56-L125).
>
> **Reason:** These stores favor an explicit stop over silent state loss. A full
> store reduces availability, but it does not evict the proof needed for replay.

## Nova Run State

### One run, one immutable starting point

Nova converts a valid run ID into a SHA-256 directory key. This prevents the run
ID from becoming a filesystem path. A verified legacy directory can still be
read, but Nova accepts it only when its event file contains the requested run ID.

Before execution, Nova writes one snapshot that binds the graph, package bytes,
registrations, grants, selected providers, and effective runtime configuration.
Recovery compares current inputs with that snapshot. It does not silently
replace a package or graph because a newer copy is installed.

> **Source evidence — run identity and snapshots**
>
> [Run-root selection validates the ID, uses a SHA-256 path, and verifies a legacy directory through its journal](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/core/execution/run-root.ts#L62-L76).
>
> [Snapshot publication writes a private temporary file, synchronizes it, links it without replacement, and synchronizes the directory](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/core/execution/engine-snapshots.ts#L75-L121).

### Journal commit boundary

A complete newline-terminated, synchronized record is committed. The next
record contains its predecessor hash. A crash during the final line can leave
bytes without a newline; startup truncates only that tail. It does not repair a
bad hash, a changed committed prefix, or a removed journal.

The journal sequence is global to the file. Event `sequence` is assigned from
the same append position. Readers can therefore recover per-run order from the
canonical journal. Timestamps describe when a producer observed an event; they
do not override sequence.

### Effects and referenced results

An external effect moves through requested, accepted, and completed records.
The idempotency key binds exact request content and exact receipt content.
Results larger than 64 KiB are stored once under their SHA-256 digest. Replay
checks both byte count and digest before it hydrates the receipt.

This split keeps the append journal small. It also creates a strict backup rule:
never restore `effects.jsonl` without its referenced `effect-results` tree.

> **Source evidence — effect persistence**
>
> [The effect journal stores request, acceptance, receipt, and content-addressed large-result references](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/core/effects/journal.ts#L13-L25).
>
> [Large results use private temporary files, immutable publication, directory synchronization, size checks, and digest checks](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/core/effects/journal.ts#L146-L207).

## Worker State

Worker Core keeps two related authorities. The attempt journal proves the exact
accepted input and sealed result. The ownership store proves which native
process scope the supervisor controls. Neither record alone proves the other.

Admission calculates conservative liability before it accepts an envelope:
input bytes, maximum output, maximum result, metadata allowance, pending
reservations, current retained bytes, and state-write allowance. It rejects new
work when the total can exceed `maximumTotalBytes`.

The output spool preserves original stdout and stderr. It rejects the write that
would cross the combined maximum. It does not truncate old output to admit new
bytes. The sealed result is immutable for the accepted identity.

> **Source evidence — Worker durability and capacity**
>
> [The attempt journal binds envelopes, output, process completion, and sealed results to exact claim and attempt identity](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/worker/core/worker/native-attempt-journal.ts#L18-L131).
>
> [Admission counts retained bytes and outstanding reservations before it writes the accepted envelope](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/worker/core/worker/native-attempt-journal.ts#L162-L183).
>
> [The ownership store uses host identity, generation checks, compare-and-swap transitions, and configured record and byte limits](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/worker/core/worker/ownership-store.ts#L50-L169).
>
> [The output spool uses private files, exclusive no-follow creation, bounded append, and per-write synchronization](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/worker/core/worker/native-output-spool.ts#L13-L68).

For lifecycle transitions, corruption cases, and restart decisions, read
[Worker Core](worker-core.md#attempt-journal-and-commit-boundaries).

## Buster State

Buster separates five things that have similar roles:

1. The resolved plan says what must run.
2. The committed source snapshot says which source can run.
3. Durable admission says that Buster accepted storage liability.
4. Attempt records and evidence say what each provider did.
5. The signed result and completion receipt authorize Nova's one-time import.

Evidence bytes are content addressed. Buster verifies containment, declared file
identity, count, total bytes, media type, size, and digest before publication.
Report adapters read retained evidence and add bounded normalized facts. They do
not replace the original evidence.

Automatic age-based deletion is not implemented. Completed remote jobs have an
explicit compaction contract. Compaction can remove an inline repository archive
only after it verifies the retained Git source and all referenced result
artifacts. It keeps a receipt of that decision.

> **Source evidence — Buster stores**
>
> [The remote job store separates bounded records under `stateRoot` from content-addressed result blobs and reserves result capacity at admission](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/buster/engine/test-gates/remote-plan-service.ts#L52-L164).
>
> [Execution derives one SHA-256 job directory under `runtimeRoot` and separates its workspace, artifacts, and observability roots](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/buster/engine/test-gates/remote-plan-service.ts#L337-L370).
>
> [Runner construction separates artifact, observability, attempt, admission, and report-adapter roots and rejects overlapping trust roots](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/buster/engine/test-gates/runner.ts#L644-L726).
>
> [Evidence staging enforces containment, duplicate-file rejection, count, and byte limits before immutable storage](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/buster/engine/test-gates/artifacts.ts#L21-L83).
>
> [Remote compaction verifies the completed job, source identity, archive digest, and retained result artifacts](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/buster/engine/test-gates/remote-plan-compaction.ts#L76-L149).

The full record and failure flow is in [Buster architecture](buster.md#4-durable-admission-and-state).

## PostgreSQL Owners

### Prism PostgreSQL

Prism owns its schema. The `prism_migrator` role applies the ordered SQL files
inside one transaction and one advisory lock. The runtime role receives data
permissions but does not own schema changes. This separation prevents a normal
service process from changing the database structure.

Prism keeps product history instead of overwriting it. A new design revision,
preference event, approval, and baseline are separate records. Transactions and
frontier checks prevent a late worker result from becoming current after its
input changed.

The complete table, migration, lock, and transaction model is in
[Prism data architecture](prism-data.md). That page is the detailed authority;
this page defines how Prism fits the platform-wide recovery order.

### Prism artifacts

Prism writes artifact bytes before it creates a database reference. Therefore,
a database dump followed by a copy of the immutable artifact superset is a valid
group: an extra unreferenced object is possible, but a referenced object should
already exist. Administrative deletion must not run during this copy.

The chart requests 100 GiB each for artifacts and backups. It does not delete old
backup groups automatically. It fails a new backup when retained bytes leave too
little capacity. This behavior protects the last verified copy but requires an
operator-owned retention decision.

> **Source evidence — Prism ownership and backup**
>
> [Prism migration uses one reserved connection, a transaction, an advisory lock, ownership checks, and a filename journal](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/prism/storage/index.ts#L21-L74).
>
> [The artifact store publishes digest-addressed files without replacement and verifies every read](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/prism/storage/artifacts.ts#L6-L67).
>
> [The backup program dumps the database, copies immutable artifacts, writes checksums and metadata, and publishes the complete group atomically](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/charts/prism/files/prism-backup.sh#L44-L117).

### LiteLLM PostgreSQL

LiteLLM has a separate database, owner, secret set, backup, and restore path.
`STORE_MODEL_IN_DB=True` makes stored models, keys, permissions, budgets, and
encrypted values durable product data. Do not group this database with Prism.

The pinned LiteLLM application owns the SQL schema and its migrations. KubeClaw
deploys and protects the service but must not invent a local schema migration.
The production values request a 20 GiB standalone PostgreSQL PVC. A logical
backup includes schema, rows, owners, and access-control lists. It does not
include login passwords, Kubernetes Secrets, provider accounts, or the
LiteLLM master and salt keys. Recover those through their separate authority.

The recovery policy requests a backup every 15 minutes, checks every 5 minutes,
sets a two-hour maximum age, permits 64 GiB per dump, and reserves 100 GiB with a
90 GiB retained-data ceiling. Configuration defines these objectives. It does
not prove a live recovery time. There is no automatic deletion or off-node
upload.

> **Source evidence — LiteLLM persistence**
>
> [The deployment enables database-backed model storage and obtains database and encryption settings from Secrets](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/my-values/infra/litellm-deployment.yaml#L21-L50).
>
> [The production PostgreSQL values select the LiteLLM database, external Secret, standalone mode, and 20 GiB persistent volume](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/my-values/infra/postgresql-values.yaml#L1-L19).
>
> [The recovery script validates the source, creates a custom-format dump, verifies checksums and metadata, and rejects unsafe restore targets](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/scripts/postgresql-recovery.sh).

### Deployment profiles are not the same capacity contract

The repository contains two PostgreSQL value profiles. The direct production
profile at `my-values/infra/postgresql-values.yaml` requests 20 GiB. The Argo CD
platform profile at `gitops/platform/values/postgresql.yaml` requests 1 GiB and
smaller resource limits. Both select the `litellm` database and an external
Secret. An operator must record which profile owns the deployed release. Do not
use the larger value when you calculate free space for the smaller profile.

The same distinction exists for Redis. The direct production profile requests a
20 GiB PVC and contains the strict AOF and no-eviction policy described below.
The Argo CD platform profile requests 2 GiB and does not repeat that
`commonConfiguration` block. Chart defaults therefore become part of the GitOps
profile's effective durability contract. Render and inspect them before you
claim the same durability as the direct profile.

> **Source evidence — profile differences**
>
> [The Argo CD PostgreSQL values request 1 GiB](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/gitops/platform/values/postgresql.yaml#L1-L23), while [the direct production values request 20 GiB](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/my-values/infra/postgresql-values.yaml#L1-L19).
>
> [The Argo CD Redis values request 2 GiB and omit an explicit persistence-policy block](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/gitops/platform/values/redis.yaml#L1-L19).
>
> [The direct profile declares strict AOF, no eviction, and 20 GiB](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/my-values/infra/redis-values.yaml#L1-L27).

## Redis: Durable Delivery, Not Product Authority

The direct production Redis profile persists stream and dedup state with AOF. It
uses `appendfsync always`, rejects a truncated AOF, disables RDB snapshots, and
uses `noeviction`. When memory is full, new writes fail. Redis does not evict a
dedup key and then accept a duplicate publication.

The adapter uses one Lua operation:

1. Read the dedup key.
2. Return its original stream ID when it exists.
3. Otherwise append the payload with approximate `MAXLEN`.
4. Store the returned stream ID under the dedup TTL.

This is atomic inside Redis. It does not provide indefinite deduplication. When
the dedup key expires, a very late replay can append again. Consumers must use
the stable envelope identity when their own correctness needs a longer window.

The configured 1 GiB Redis memory limit is not a capacity proof for every
stream. `MAXLEN` is per stream, payloads can be up to 1 MiB, and dedup keys also
consume memory. Monitor measured stream and key growth.

> **Source evidence — Redis data behavior**
>
> [The adapter validates endpoints and bounds, limits payloads to 1 MiB, and performs stream append plus deduplication in Lua](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/redis-transport/src/adapter.ts#L14-L87).
>
> [The selected production values enable strict AOF, disable eviction, set 1 GiB Redis memory, and request a 20 GiB PVC](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/my-values/infra/redis-values.yaml#L1-L27).

## Artifact Lifecycle

An artifact needs five identities:

| Identity | Purpose |
| --- | --- |
| Namespace | Prevent one plugin or domain from writing into another owner's space. |
| Artifact ID | Stable reference used in a contract. |
| Content digest | Prove the exact bytes. |
| Media type and encoding | Tell a reader how to interpret the bytes. |
| Producer identity | Bind the object to run, stage, attempt, and registration authority. |

Publication is complete only after the bytes are durable and the authoritative
record contains their verified reference. A temporary file is not an artifact.
A digest-named file without the matching journal or database reference is an
unreferenced object, not proof that an operation completed.

Current stores do not share one garbage collector. The owning domain must prove
that no journal, result, baseline, report, backup, or active recovery process
still refers to an object before deletion. Absence from the latest UI is not
such proof.

## Backup Groups

| Group | Include | Writer fence | Restore order | Current automation boundary |
| --- | --- | --- | --- | --- |
| Nova run | Complete run root, large effect results, and any separately stored artifact bytes referenced by events | Stop mutation for the selected run and stop administrative reopen | Restore files privately; verify snapshot and hash chains; verify referenced artifacts; then start recovery | No repository-wide scheduler, off-node copy, RPO, or RTO |
| Worker host | Ownership store, attempt metadata, input/result blobs, and output spools | Stop admission and hold the trusted supervisor boundary | Restore only to the proved host identity; validate ownership; replay attempts; reopen admission last | No automatic retirement or cross-host restore workflow |
| Buster runtime | Complete `stateRoot` plus `runtimeRoot`: remote jobs, statuses, source archives or verified retained Git source, attempts, results, receipts, evidence, and reports | Stop remote admission, execution, and compaction | Restore the state store, result blobs, and job directories together; verify identities and digests; reconcile incomplete attempts; expose status last | Quiesced storage backup is operator work; file stores are not replicated |
| Prism | One PostgreSQL dump plus the complete immutable artifact superset and group metadata | Stop migrations and administrative artifact deletion; normal immutable publication follows the group rule | Verify group; restore database and artifacts into isolated targets; start Prism readers; verify application references; cut over last | Scheduled local backup, verification, and SQL smoke proof exist; no automatic expiry or off-host copy |
| LiteLLM | Full logical database dump, roles/ACL evidence, metadata, checksums, and independently retained master/salt and database credentials | Fence LiteLLM writes | Restore roles and empty database; restore dump; supply exact keys; validate LiteLLM API and encrypted values; cut over last | Scheduled local recovery job exists; no automatic cleanup or off-node copy |
| Redis | AOF-aware snapshot or fenced RDB plus stream, consumer, pending, and expiry evidence and external password authority | Pause writes and stop all publishers before source shutdown | Prepare a fresh compatible AOF data set; start isolated target; validate streams, pending entries, exact dedup expiry, lost-ACK replay, and restart; switch clients last | Migration tooling and native tests exist; cluster/CSI and power-loss acceptance remain environment work |
| Telemetry projections | Sink store only when diagnostic retention requires it | Stop the sink writer or use its owned consistent snapshot | Restore after canonical Nova journals; replay only events beyond verified checkpoints | Projection recovery must never block restoration of lifecycle authority |

## Restore Decision Rules

Use this order during an incident:

1. Identify the failed owner and stop its writers.
2. Preserve the failed media. Do not clean, compact, or migrate it.
3. Select one checksum-valid and version-compatible backup group.
4. Restore into an isolated destination.
5. Validate native format, schema, hashes, and references.
6. Start the owning application reader and verify real records.
7. Rebuild projections only after authority is healthy.
8. Cut over clients through a separate, reversible operation.
9. Retain the old source until the acceptance and rollback window ends.

Do not combine members from different backup groups. Do not treat a PVC as a
backup. Do not rotate an encryption key to make old encrypted data readable.

## Deletion and Retention Rules

The platform has no single global retention timer. This is intentional: Nova,
Buster, Worker Core, Prism, LiteLLM, Redis, and telemetry have different proof
obligations. The cost is that operators must assign retention explicitly.

Before deletion, record:

- the domain owner;
- the exact selected identities and digests;
- the terminal or superseded state that permits deletion;
- all reference checks;
- backup and legal retention requirements;
- the writer fence;
- the deletion receipt or tombstone;
- the rollback boundary.

Never delete unresolved effects, active Worker ownership, a Buster job with an
unimported result, an artifact referenced by a retained record, the last verified
backup, or Redis data while a publisher can still rely on its dedup window.

## Failure and Recovery Matrix

| Observation | Meaning | Safe action |
| --- | --- | --- |
| Nova journal has an incomplete final line | Last append did not commit | Preserve a copy. Let the journal truncate only the uncommitted tail, then verify the full chain. |
| Nova journal hash or committed prefix differs | Authoritative history is corrupt or replaced | Stop mutation. Restore the complete run group from a trusted copy. |
| Effect request is accepted but has no receipt | External outcome is uncertain | Reconcile through the effect owner. Do not blind-retry. |
| Worker ownership refers to another host | Kernel ownership cannot be proved | Keep admission closed. Recover on the original proved host or perform an explicit abandonment procedure. |
| Worker or Buster store is full | The system cannot retain the promised result | Reject new work. Add capacity or retire only records whose owner proves safe deletion. |
| Prism database exists but an artifact is missing | Backup group is incomplete or storage is corrupt | Keep Prism isolated. Restore a matched database-and-artifact group. |
| LiteLLM data decrypts with neither retained key | Credential authority is incomplete | Do not overwrite encrypted fields. Recover the original master/salt keys or select an older compatible group. |
| Redis is empty after restore | Transport and dedup history is absent | Restore Redis if that history is required, then replay from canonical journals within policy. Do not infer that Nova events were lost. |
| Telemetry sink is missing records | Diagnostic projection is incomplete | Inspect observer checkpoints and canonical events; replay through the owned observer path. |

## Verification Map and Evidence Limits

| Claim | Repository check | What it does not prove |
| --- | --- | --- |
| Nova journal, effects, snapshots, and recovery | Nova Core state, effect, recovery, and audit tests | Filesystem or volume survival during real node loss |
| Worker store durability and limits | Worker local-runtime, native journal, ownership, spool, and recovery tests | Correct cgroup and disk behavior on every target host |
| Buster admission, evidence, and compaction | Buster runner, storage, remote dispatch, compaction, and evidence tests | Replication or off-node recovery of a deployed runtime root |
| Prism SQL, artifacts, and backup grouping | Prism storage tests, native PostgreSQL tests, artifact durability tests, and deployment backup test | Complete live service restore in an independent cluster |
| LiteLLM database recovery | PostgreSQL recovery renderer and native two-server test | Real LiteLLM image, Kubernetes Secret, CSI, and network-policy recovery |
| Redis durability and migration | Redis durability and version-migration tests with real Redis binaries | Storage-hardware power-loss behavior and live Kubernetes cutover |

No environment-wide RPO or RTO is proven. Prism has scheduled local backup
resources, and LiteLLM has a rendered PostgreSQL recovery job. These do not
prove off-site disaster recovery. The operator must retain credentials, copy
verified groups to an independent failure domain, and execute an application
restore test.

## Related Guides

- [Nova Core](nova-core.md) explains lifecycle and recovery decisions.
- [Worker Core](worker-core.md) explains native attempt and ownership state.
- [Buster architecture](buster.md) explains remote test authority and evidence.
- [Prism data architecture](prism-data.md) is the detailed Prism schema guide.
- [Telemetry](telemetry.md) explains active event and observer data paths.
- [Back up and recover](../use/recovery.md) gives the operator procedure.
