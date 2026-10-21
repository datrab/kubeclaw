# Data and State: What Must Survive

Status: implemented with stated retention and disaster-recovery limits
Audience: platform operator, runtime developer, data owner, incident responder
Owner: state-owning component maintainers
Evidence: skills/nova/core; skills/worker/core; skills/buster/engine; skills/prism; charts/prism; gitops/platform; scripts/postgresql-recovery.sh; scripts/redis-prepare-migration.sh
Evidence revision: `13bff0a18a64e74f2cbbaa1978e746fcdeff0c10`
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

Buster remote results bind a content digest and receipt. The source snapshot
has a separate Ed25519 attestation; do not treat it as a result signature.

> **Source evidence — result and source identities**
>
> [Remote results carry a digest and receipt](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/contracts/pipeline-test-gate/v1/src/types.ts#L416-L429).
> [Source snapshots carry the distinct Ed25519 attestation](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/contracts/pipeline-test-gate/v1/src/types.ts#L385-L401).

| Store | Schema or format | Physical location | Writer and reader | Consistency and protection | Retention, capacity, migration, and recovery |
| --- | --- | --- | --- | --- | --- |
| Nova run snapshot | `run-snapshot.v4` with graph, registry, dispatch profile, review-cache profile, and SHA-256 digest | `<storageRoot>/runs/v2-<sha256(runId)>/run-snapshot.json` | Nova creates it once; recovery and evidence readers validate it | Private file, temporary file, `fsync`, no-replace hard link, directory `fsync` | No automatic expiry or size quota. Keep it with the complete run root. Versions v1-v4 are readable, but automatic semantic migration is not provided. |
| Nova canonical events | Hash-chained JSON Lines containing `lifecycle-event.v2` and `plugin-domain-event.v2` | `<runRoot>/events.jsonl` | Nova Core and granted plugin contexts append; scheduler recovery, audit, artifact recovery, and observers read | One append lock, monotonic file sequence, previous-record hash, durable append; an incomplete final line is truncated | No automatic expiry or compaction. Restore before resume. A broken chain, rewind, replacement, or divergent prefix stops recovery. |
| Nova resume signals | Hash-chained `resume-signal.v2` records | `<runRoot>/signals.jsonl` | The resume entry writes; wait validation and run recovery read. The CLI reads an operator-supplied JSON file | Append is serialized. Validation checks the schema, wait ID, signal type, matching issuer fields, wait expiry, and issue time. The signal has no nonce or signature; matching issuer fields do not authenticate the caller. `wait.resolved` prevents reuse of a resolved wait. | No expiry-based file deletion or count quota. Protect access to the CLI and run files. Back up and restore with the run. An invalid signal stops resume. Retire only with the complete terminal run. |
| Nova administrative decisions | Hash-chained `administrative-reopen.v2` records | `<runRoot>/administrative-decisions.jsonl` | A supplied authentication callback identifies a new decision's operator or administrator; reopen and repair recovery read it | Mutation is serialized. The callback principal must match the actor and configured issuer. Decision ID and idempotency key detect conflicting replay. Recovery verifies pinned packages, graph, and blocked state. There is no expected-journal-head field. The causal lifecycle event records application. | No automatic expiry or capacity quota. Back up with events. Stop on corruption, conflicting replay, or invalid recovered state. A recorded identical decision can continue without calling authentication again. Do not reconstruct a decision from an event. Retire with the complete terminal run and its audit obligation. |
| Nova effects and large results | Hash-chained effect records; result references use `effect-result-reference.v1` | `<runRoot>/effects.jsonl`; blobs under `<runRoot>/effect-results/sha256/<prefix>/<hash>.json` | Effect Coordinator writes; recovery and evidence readers read | Idempotency key, request/receipt conflict checks, append lock, content digest and byte-count verification | Results at or below 64 KiB remain inline. Larger JSON results use immutable digest paths. No garbage collector exists; back up the journal and result tree together. |
| Nova observer delivery state | `observer-checkpoint.v2` and `observer-delivery-record.v2`, each in a hash-chained journal | `<runRoot>/observer-checkpoints.jsonl`; `<runRoot>/observer-deliveries.jsonl` | Observer Runtime writes and replays | Checkpoint binds observer provenance, run, event sequence, and event ID; delivery journal retains each started/completed/failed attempt | Retain with the event journal until all required recovery and audit obligations end. Deleting it can cause redelivery. There is no automatic retirement in Nova Core. |
| Nova resource locks | Durable lock-manager records | `<storageRoot>/resource-locks` | Effect Coordinator acquires and releases; recovery validates | Fencing tokens and configured lock TTL; lock state does not replace an effect receipt | Restore with Nova state. A lock timeout is not proof that an external effect did not occur. Reconcile the effect before retry. |
| Nova remote dispatch | Durable records for `nova-remote-plan-dispatch.v1`, interruption facts, and projected dispatch receipts; source archives are digest-addressed blobs | `<remoteStateRoot>/dispatch/records/store.json`; `<remoteStateRoot>/dispatch/blobs/sha256/...` | Nova persists before HTTP submission; dispatch, reconnect, import-retention, and operator projection tools read | Durable-record writer lock, idempotency key and payload digest; archive digest and byte count; run/import fences are required before compaction | Limits for records, record bytes, total metadata, one archive, and total archive bytes come from the remote-gate configuration. No age expiry. Back up record and blob roots together. Missing or changed blobs block dispatch/recovery. Projection can remove inline archive bytes only after verified import authority; delete the remaining record only with the run. |
| Nova remote result import | `nova-test-gate-import.v2` pending/complete records, execution graphs, result and decision digests; evidence is digest-addressed | `<remoteStateRoot>/imports/records/store.json`; `<remoteStateRoot>/imports/blobs/sha256/...` | Nova importer writes; verified-output, execution-graph, dispatch-compaction, and later gate readers read | The store reserves a pending record before evidence, checks the complete job/source/result/decision identity, writes immutable blobs, then performs a digest-guarded transition to complete | Evidence-per-job and store-wide byte limits plus durable-record limits apply. No age expiry. Back up with dispatch and the run. A pending record is recoverable; a digest mismatch or absent blob blocks import. Retain completed authority while a lifecycle decision, report, or dispatch projection refers to it. |
| Nova observability reconciliation | `nova-observability-plan.v1`, durable attempt/evidence/closure records, bounded raw-ingress quarantine, and hash-chained `nova-observability-reconciliation.v1` decisions | `<runRoot>/observability/reconciliation-plan.json`; `attempts/`; `admission/`; `reconciliation.jsonl` | Nova saves the plan; Worker observation import and recovery reconciler write; completion and recovery readers consume | Atomic durable plan write; durable-record locks and digests; exact run/plan/node/attempt identities; reconciliation journal ordering. Import completes only after completeness checks. | Embedded limits are 100,000 evidence objects and results, 10 GiB evidence, 1 GiB metadata, 1,000,000 admission records, 4 GiB admission data, and 1 GiB quarantine. No automatic retirement. Back up the complete observability directory with the run. Corruption or unresolved quarantine blocks an observability-required result; retire only after imported lifecycle authority and evidence retention are proved. |
| Wait adapter records | `wait-value.v1` containing validated `wait-request.v2` objects | `<waitRoot>/records/store.json`, stream `waits/all` | A plugin with `signal.wait` creates or reads; approval flows and operators read | Durable-record writer lock, idempotency key, payload digest, and invocation fence; the canonical run event and signal journal remain the resume authority | Defaults: 1 MiB per entry, 100,000 records, 256 MiB total; no automatic expiry even after `expiresAt`. Back up with the run and delivery store. Corruption blocks lookup; loss can prevent safe operator action but does not erase the canonical wait event. Retire only after the wait is resolved and the run/effect/delivery proof is retained. |
| Operator-message delivery | Notification request, reservation, terminal receipt or failure, and optional compacted projection records | `<deliveryRoot>/records/store.json`, one `notifications/<target>` stream per target | Operator-messaging adapter writes; retry, receipt lookup, handoff, and retirement tools read | Durable-record lock and payload digest; stable logical delivery ID; attempt-specific reservation; digest-guarded terminal transition. A possible lost acknowledgement blocks retry unless the receiver supports receipt lookup. | Defaults: 100,000 records and 256 MiB total; target payload defaults to 64 KiB and cannot exceed 1 MiB. No age expiry. Back up with effects and waits. Corruption or loss makes an external result uncertain. Compact the request only under run, wait, effect, and terminal-receipt fences; retire only after the operator decision is durably imported. |
| Worker ownership | `worker-ownership-store.v2`; a guarded v1-to-v2 read conversion exists | `<ownershipRoot>/owners.json` | Trusted native supervisor writes and reads | Host and boot identity, claim generation, compare-and-swap revision, private durable write, record and byte limits | Terminal identities remain reserved against stale work. No automatic deletion. A different host or unproved legacy host stops admission. |
| Worker attempt journal | `native-attempt-journal.v1` in the common durable-record store plus immutable blobs | `<journalRoot>/metadata/records/store.json`; `<journalRoot>/data/blobs/sha256/...` | Native supervisor writes; restart recovery and result readers read | Private root mode `0700`; envelope/result digest, exact attempt identity, idempotency key, global admission lock, per-attempt fence | Admission reserves input, output, result, metadata, and state capacity before work. Limits cover records, state bytes, total bytes, input, output, and result. No automatic retirement is implemented. |
| Worker original output | Two raw byte files | `<journalRoot>/outputs/<attempt-key>/stdout` and `stderr` | Native host capture writes; journal sealing and recovery read | Directory `0700`, files `0600`, no-follow exclusive creation, append and `fsync`; combined byte limit; SHA-256 checked on read | Output is never silently truncated or rotated. Keep it through result sealing and any audit period. Cleanup requires proven terminal ownership. |
| Buster remote job authority | Stored plan job, status, result, completion intent/receipt, source snapshot, and inline source archive until verified compaction | `<stateRoot>/records/store.json`; result blobs below `<stateRoot>/results/blobs/sha256/...` | Nova dispatch client and Buster HTTP service write through bounded stores; status/result/import paths read | Job ID, request digest, plan digest, source archive digest and attestation, status transition rules, result digest and receipt binding | Admission reserves result liability. Completed-job compaction is explicit and keeps source, result, and evidence authority. These file stores are not replicated databases. Back up a quiesced state root. |
| Buster local attempts | Per-job workspace, durable attempt records, closure records, fixture journal, evidence, and report-adapter delivery state | `<runtimeRoot>/<sha256(jobId)>/`; attempts below `observability/attempts`; evidence below `artifacts/` | Buster Engine and Worker Core write; restart recovery and evidence readers read | Durable records, idempotency keys, bounded state and result sizes, attempt and claim identity | Limits come from runner admission and the resolved plan. Preserve unresolved attempts. Terminal cleanup removes the extracted repository only after the retained set is known. |
| Buster evidence and reports | Exclusively created evidence files plus `ArtifactRefV1`, attempt/node results, normalized report results | Default `FileEvidenceStore`: `<artifactRoot>/<safeName(attemptId)>/<safeName(evidenceId)>-<basename(file)>`; temporary collection under `<artifactRoot>/.staging` | Providers stage files; Buster verifies and publishes; report adapters and Nova read by reference | Containment checks, file and byte limits, media type, content digest, size, evidence ID, and result digest with receipt binding | Raw evidence and normalized report facts can both be required. There is no repository-wide automatic garbage collector or remote backup scheduler. Preserve referenced objects with results. |
| Prism relational authority | `prism` schema and the ordered migration journal; 17 forward migrations | Prism PostgreSQL data volume; database `prism` in the Prism chart | `prism_migrator` owns schema changes; `prism_runtime` reads and changes product rows; read-only role observes | Transactions, row and advisory locks, uniqueness, foreign keys, compare-and-swap frontiers, separate credentials | Stores projects, requests, rounds, documents, revisions, directions, approvals, baselines, corpus, preferences, operations, jobs, nonces, and decisions. Forward-only migrations run once by filename. No automatic row-retention scheduler exists. |
| Prism artifacts | Content-addressed bytes | Prism artifact PVC at `/var/lib/prism/artifacts`, objects below digest-derived paths | Control and ingestion publish; Control, Worker, renderer, and backup read | Temporary file, content digest, hard-link no-replace publication, file and directory `fsync`, no-follow reads | Default PVC request is 100 GiB. The chart keeps the PVC on removal. There is no automatic garbage collector. Database and artifacts form one backup group. |
| Prism acquisition quarantine | Raw acquired bytes named by SHA-256 digest | Ingestion Pod `emptyDir` at `/quarantine`, limited to 4 GiB | Ingestion writes and reads; Control receives verified bytes and requests deletion | Digest naming prevents conflicting content under one name. This is one-Pod temporary state; it has no cross-Pod lock, replication, or durable-volume fence. | TTL defaults to 1 hour and is clamped to 1 minute–1 day; the reaper runs at most once a minute. Successful publication requests immediate removal. There is no backup or restore: Pod loss discards quarantine and the caller must reacquire. A missing or changed object blocks publication. Retire by the successful DELETE or TTL reaper, never as a substitute for database/artifact publication. |
| Prism derived data | Text-search vector, embeddings, previews, retrieval and other rebuildable views | PostgreSQL and artifact store, depending on object | Prism services derive; search and Studio consume | Derived data stays bound to source and model evidence where implemented | Rebuild after authority is restored. Current vector search has no approximate index or automatic re-embedding migration. Rebuild duration has no accepted RTO. |
| LiteLLM relational authority | Schema and migrations owned by the pinned LiteLLM image | Managed PostgreSQL database `litellm`, on its own PostgreSQL PVC | LiteLLM writes and reads; PostgreSQL recovery job dumps and restores | Database credentials from `postgresql-secrets`; LiteLLM master and optional salt keys remain a separate credential authority | Contains keys, permissions, budgets, stored model configuration, and encrypted credentials. It is not a cache. The repository does not own its SQL migrations. Upgrade only with the pinned application/database compatibility procedure. |
| Redis transport state | Streams with `idempotency_key` and JSON `payload`; dedup keys map stable publication keys to stream entry IDs | Standalone Redis, AOF on its PVC | Selected adapters and host observers write; configured external consumers read | Password authentication; Lua performs dedup lookup, `XADD`, and dedup-key set as one server operation; AOF `appendfsync always`; `noeviction` | Stream `MAXLEN` is approximate and per stream. Dedup TTL is finite. The production values use 1 GiB Redis memory and a 20 GiB PVC. AOF-aware migration preserves absolute expiry. Redis is not lifecycle authority. |
| Generic artifact adapter | Immutable canonical or portable JSON records | `<artifactRoot>/records/store.json`; blobs below `<artifactRoot>/blobs/sha256/...` | Granted `artifacts.write` callers publish; later stages read declared references | Namespace and resource checks, encoding, digest, size, metadata admission before immutable blob publication | Defaults: 16 MiB per artifact, 100,000 records, a 256 MiB metadata-store ceiling, and a separate 256 MiB blob-store ceiling. A lifecycle checkpoint in Nova binds the reference to its producer. No global deletion policy exists. |
| Telemetry sink records | Redacted `telemetry-envelope.v2` projections in a durable record store or Redis stream | File sink: `<root>/records/store.json`; Redis sink: configured stream prefix | Telemetry observer writes through `telemetry.emit`; sink-specific readers consume | Stable delivery idempotency, size/depth/node limits, structured redaction, store or Redis durability | Diagnostic projection only. File defaults are 100,000 records, 256 MiB total, and 1 MiB per record. Redis uses configured MAXLEN and dedup TTL. See [Telemetry](telemetry.md). |
| OpenClaw configuration and host state | `openclaw.json`, `swarm.config.json`, host SQLite state, plugin installation/cache state, startup verification logs, and other OpenClaw-owned files | Per-agent config PVC mounted at `/home/node/.openclaw`; default 10 GiB | Init setup and OpenClaw startup doctor can change it while the gateway is stopped; OpenClaw gateway reads and writes at runtime; health checks read selected files | One replica is required. The PVC is `ReadWriteOnce` and retained by Helm and Argo CD. Startup doctor is the only declared schema repair path; the repository does not define record-level fencing for upstream OpenClaw files. | No repository-owned TTL, quota below PVC size, backup job, or tested restore. Back up while the gateway and doctor are stopped. Corrupt SQLite/config can prevent startup; restore the matched config group or use the pinned OpenClaw doctor, not manual row edits. Retire after external credentials and required session/audit evidence are handled. |
| Agent workspace and Git checkout | Workspace files, memory, project files, and checked-out Git repository | Per-agent workspace PVC mounted at `/home/node/.openclaw/workspace`; default 20 GiB | Workspace init seeds files; OpenClaw and tools change them; Git init/update and pipeline readers consume | One replica and `ReadWriteOnce`; init preserves existing files unless `overrideOnRestart` is true. Git commit/tree identity, not the mutable checkout, is pipeline source authority. | No automatic expiry, quota below PVC size, backup, or restore. Back up separately from config and record the Git remote/commit. Corruption or loss removes mutable memory and edits; recloning restores only committed Git data. Retire only after exporting required uncommitted work and memory. |

### Source-discovered store identities

The [generated platform surface inventory](../reference/platform-surfaces-generated.md#state-and-cache-names)
finds path names and volume identities in current source. A name such as
`store.json` is not one global store. Its source and configured root select the
owner. The tables below classify every discovered identity and connect it to a
complete operating contract. A repeated literal appears once for each distinct
meaning.

The four classes have strict meanings:

- **Persistent authority** must survive while it owns a decision, recovery
  frontier, referenced bytes, backup, or diagnostic history.
- **Ephemeral state** supports one bounded operation. Loss cancels or repeats
  that operation; it must not be used as completion evidence.
- **Cache** can be rebuilt from a separate authority. Loss costs time, not
  product truth.
- **Inactive/library-only** has no current production composition. Its source
  contract does not prove deployed state.

| Discovered identity | Class | Contract alias | Exact meaning |
| --- | --- | --- | --- |
| `${hash.slice(2)}.json` | Persistent authority | `S02` | Nova effect result above the inline limit |
| `administrative-decisions.jsonl` | Persistent authority | `S01` | Nova authenticated reopen decisions |
| `effects.jsonl` | Persistent authority | `S01` | Nova external-effect requests and receipts |
| `events.jsonl` | Persistent authority | `S01` | Nova canonical lifecycle and domain events |
| `locks.jsonl` | Persistent authority | `S01` | Nova resource-lock transition journal |
| `observer-checkpoints.jsonl` | Persistent authority | `S01` | Nova observer recovery frontier |
| `observer-deliveries.jsonl` | Persistent authority | `S01` | Nova observer attempt history |
| `reconciliation.jsonl` | Persistent authority | `S01` | Nova or imported-attempt reconciliation decisions; the configured root selects the owner |
| `signals.jsonl` | Persistent authority | `S01` | Nova resume inputs validated against the wait; caller authentication is outside this file contract |
| `claim.json` | Persistent authority | `S03` | One resource-lock claim |
| `owner.json` | Persistent authority | `S03` | One resource-lock owner record |
| `resource-locks` | Persistent authority | `S03` | Root for Nova resource locks |
| `effect-results` | Persistent authority | `S02` | Root for digest-addressed large effect results |
| `graph-snapshot.json` | Inactive/library-only | `S20` | Rejected split-snapshot name; current Nova does not write it |
| `registry-snapshot.json` | Inactive/library-only | `S20` | Rejected split-snapshot name; current Nova does not write it |
| `run-snapshot.json` | Persistent authority | `S04` | Immutable Nova starting state |
| `dispatch` | Persistent authority | `S05` | Nova remote job and source-archive state |
| `imports` | Persistent authority | `S05` | Nova verified result-import state |
| `reconciliation-plan.json` | Persistent authority | `S06` | Expected Nova observability attempts |
| `admission.json` | Persistent authority | `S06` | Bounded observability ingress and quarantine state |
| `attempt-store.json` | Persistent authority | `S06` | Durable attempt, result, evidence, and closure metadata |
| `attempts` | Persistent authority | `S06` | Configured Nova or Buster durable-attempt root |
| `observability/attempts` | Persistent authority | `S06` | Required attempt-projection root for a run |
| `blob-budget` | Persistent authority | `S07` | Lock and budget fence for a configured durable blob store |
| `blobs` | Persistent authority | `S07` | Digest-addressed bytes below a configured active store |
| `records` | Persistent authority | `S07` | Directory that contains a configured durable record store |
| `store.json` | Persistent authority | `S07` | Configured durable records; the root and stream define the owner |
| `metadata` | Persistent authority | `S08` | Worker or Buster fixture record metadata root |
| `data` | Persistent authority | `S08` | Worker or Buster fixture digest-addressed blob root |
| `outputs` | Persistent authority | `S08` | Worker original stdout and stderr root |
| `owners.json` | Persistent authority | `S08` | Worker native-process ownership authority |
| `results` | Persistent authority | `S09` | Buster remote result blob root |
| `test-attempts` | Persistent authority | `S09` | Buster per-attempt workspace; owned attempt cleanup removes reproducible checkouts but retains scratch and evidence |
| `.kubeclaw-playwright-${executionId}.json` | Ephemeral state | `S10` | Playwright JSON handoff file, deleted in `finally` |
| `config.json` | Ephemeral state | `S10` | Two independent temporary credential files: Docker authentication for container build and registry authentication for Trivy; each provider deletes its owned file or directory |
| `metadata.json` | Ephemeral state | `S10` | Temporary BuildKit result metadata, deleted with its directory |
| `ephemeral:buildkit-cache` | Cache | `S11` | Rootless BuildKit cache in the container writable layer |
| `outbox.json` | Inactive/library-only | `S12` | Implemented producer-outbox class with no production constructor found |
| `openclaw/state` | Persistent authority | `S13` | Per-agent OpenClaw configuration and host state |
| `pvc:kubeclaw/agent-buster-config` | Persistent authority | `S13` | Buster OpenClaw config volume |
| `pvc:kubeclaw/agent-buster-runtime-state` | Persistent authority | `S09` | Buster job, attempt, evidence, and receipt volume |
| `pvc:kubeclaw/agent-buster-workspace` | Persistent authority | `S13` | Buster mutable workspace and checkout |
| `pvc:kubeclaw/agent-nova-config` | Persistent authority | `S13` | Nova OpenClaw config volume |
| `pvc:kubeclaw/agent-nova-workspace` | Persistent authority | `S13` | Nova mutable workspace and checkout |
| `pvc:kubeclaw/agent-prism-config` | Persistent authority | `S13` | Prism OpenClaw config volume |
| `pvc:kubeclaw/agent-prism-workspace` | Persistent authority | `S13` | Prism mutable workspace and checkout |
| `pvc:kubeclaw/prism-artifacts` | Persistent authority | `S14` | Prism content-addressed artifact authority |
| `pvc:kubeclaw/prism-backups` | Persistent authority | `S14` | Locally retained Prism recovery groups |
| `pvc:kubeclaw/data-prism-postgresql-0` | Persistent authority | `S21` | Prism relational authority for projects, revisions, operations, jobs, approvals, preferences, and corpus state |
| `helm:litellm-postgresql/data` | Persistent authority | `S15` | LiteLLM relational product data |
| `pvc:kubeclaw/litellm-postgresql-backup` | Persistent authority | `S15` | Scheduled LiteLLM PostgreSQL recovery dumps and verification state |
| `helm:redis/data` | Persistent authority | `S16` | Redis transport, dedupe, and pending delivery state |
| `pvc:kubeclaw/registry-local-data` | Persistent authority | `S17` | Local OCI blobs and manifests not copied elsewhere |
| `pvc:kubeclaw/registry-mirror-cache` | Cache | `S17` | Rebuildable Docker Hub pull-through cache |
| `helm:prometheus/data` | Persistent authority | `S18` | Retained metric samples only |
| `helm:loki/data` | Persistent authority | `S18` | Retained log copies only |
| `helm:grafana/data` | Persistent authority | `S18` | Grafana UI and dashboard state only |
| `host:alloy/positions` | Persistent authority | `S18` | Node-local log collection cursor |
| `pvc:kubeclaw-ops/codex-ops-tailscale` | Persistent authority | `S19` | Sensitive Ops device state; tailnet control remains external authority |
| `pvc:kubeclaw-ops/home-codex-ops-0` | Persistent authority | `S22` | Codex home, configuration, credentials, and tool state for the Ops Pod |
| `pvc:kubeclaw-ops/workspace-codex-ops-0` | Persistent authority | `S22` | Mutable Ops workspace and checked-out diagnostic material |

### Complete operating contracts for the aliases

Each alias answers the full operating question set: authority and data, writer,
reader, consistency or fencing, retention, capacity, backup, restore,
corruption, loss, and retirement. An alias applies only with the exact meaning
in the identity table.

| Alias and class | Authority, data, writer, and reader | Consistency and fencing | Retention and capacity | Backup and restore | Corruption, loss, and retirement |
| --- | --- | --- | --- | --- | --- |
| `S01` Persistent authority | Nova owns hash-chained decisions, events, effects, observer state, locks, signals, and reconciliation. Owned Nova writers append; recovery, audit, scheduler, and observer readers verify. | One file lock, monotonic sequence, prior-record hash, durable append, and domain identity fences. | No age expiry or compaction. Filesystem capacity is the bound; append stops when durability cannot be promised. | Stop run mutation. Copy and restore the complete run group. Verify every chain and referenced object before recovery. | A bad committed hash, replacement, or missing prefix stops mutation. Loss can make lifecycle or an external outcome unknowable. Retire only a terminal run after effect, wait, observer, artifact, audit, and legal references end. |
| `S02` Persistent authority | Nova Effect Coordinator writes large JSON results by digest; effect recovery and evidence readers hydrate them. | Private temporary write, `fsync`, no-replace publication, byte count, and SHA-256 bind bytes to the receipt. | Results above 64 KiB use this tree. There is no age expiry, quota, or garbage collector. | Copy with `effects.jsonl`; restore both before replay and verify every referenced digest. | Missing or changed bytes invalidate the receipt and block replay. Never invent the result. Retire only when no retained effect record refers to it. |
| `S03` Persistent authority | Nova's lock manager writes lock owner and claim state; Effect Coordinator and recovery read it. | Writer lock, claim generation, fencing token, and TTL separate current ownership from stale work. | No automatic retirement is documented. Filesystem capacity is the outer bound. | Stop effects and restore with the Nova storage group; then reconcile effects before lock reuse. | Corruption or loss removes ownership proof, not the external effect. Stop and reconcile; do not treat timeout as non-execution. Retire after the protected effect is terminal and retained receipts make the lock unnecessary. |
| `S04` Persistent authority | Nova writes one immutable `run-snapshot.json` that contains the graph and registry; execution and recovery validate it. | SHA-256 identity, private temporary file, synchronized no-replace publication, and directory synchronization. | One file per run; no automatic expiry or explicit quota. | Back up with the run journals. Restore privately and verify the digest before any event replay. | A mismatch or missing snapshot blocks resume. Do not rebuild it from the current registry. Retire only with the complete terminal run. |
| `S05` Persistent authority | Nova remote dispatch owns accepted job/source state; import owns pending and complete result/evidence state. Their dispatch, reconnect, import, and retention readers consume it. | Durable-record locks, idempotency and payload digests, content-addressed blobs, import fences, and digest-guarded state transitions. | Configured record, record-byte, blob, archive, job-evidence, and store-wide limits apply. There is no age expiry. | Fence remote dispatch/import. Back up each record root with its blob root and the run. Restore and verify source, job, result, decision, and evidence digests. | Missing blobs or conflicts block dispatch/import. Loss can remove the only accepted remote proof. Compact only after verified import authority; retire with the owning run after all references end. |
| `S06` Persistent authority | Nova or Buster owns expected attempt plans, admission/quarantine, attempts, evidence, results, and closure state. Worker import, gate completion, recovery, and evidence readers consume it. | Durable file locks and writes, exact run/plan/node/attempt identity, content digests, bounded quarantine, and ordered reconciliation decisions. | The active composition supplies record, metadata, evidence, result, quarantine, and pending-age limits. No general age-based retirement exists. | Stop admission and import. Copy the complete observability root. Restore it with the run/job and verify the plan, records, blobs, and reconciliation journal. | Corruption, overflow, unresolved quarantine, or loss blocks an observability-required result. Retire only after canonical import and every evidence obligation are proved. |
| `S07` Persistent authority | The configured adapter or service owns typed records and digest-addressed blobs. Its granted writer writes; declared domain, recovery, and later-stage readers read. The generic class owns no global data. | Per-store writer lock, idempotency key, payload digest, immutable blob digest, and configured record/blob budgets. | Every constructor supplies maximum record count, record bytes, total metadata, object bytes, and blob bytes. No common age expiry exists. | Fence the owning writer. Back up that configured root and its referring authority together. Restore into an empty private root and verify records plus blobs. | A replay conflict, digest mismatch, missing blob, or invalid budget stops the owner. Loss has the impact of that configured domain. Retire only through that owner's reference and terminal-state rules. |
| `S08` Persistent authority | Worker Core or the Buster fixture journal owns accepted input, result, state, blobs, output, and native ownership. The trusted supervisor writes; restart and result readers read. | Private roots, record locks, host/boot/claim generation, compare-and-swap revision, digests, exclusive output files, and synchronized writes. | Admission reserves input, output, result, state, metadata, record, and total-byte liability. There is no automatic age retirement. | Stop admission and the native process. Copy ownership, metadata, data, and outputs together. Restore only to a proved host boundary and validate ownership before replay. | Corruption or loss removes safe process/result proof. Keep admission closed; never infer completion from a process exit alone. Retire only after terminal ownership and imported result/evidence are proved. |
| `S09` Persistent authority | Buster owns remote jobs, source snapshots, statuses, results, receipts, local attempts, and evidence. Buster services write; Nova import, status, recovery, and report readers consume. | Job/request/plan/source/result digests, status rules, durable-record locks, attempt identity, and completion receipt bind transitions. | Admission reserves configured result, evidence, record, and store liability inside the 64 GiB runtime PVC. No automatic age deletion exists. | Stop remote admission, execution, and compaction. Copy the complete state and runtime roots. Restore and reconcile incomplete attempts before exposing status. | Corruption or loss can make a job or external result uncertain. Stop import and redispatch until reconciled. Use verified compaction; retire only after Nova import and evidence retention end. |
| `S10` Ephemeral state | One Buster provider writes a temporary report, overlay, credential, or result-metadata file; that provider reads it during the same bounded invocation. | Contained paths, private modes where credentials exist, unique execution directories, process/cgroup limits, and `finally` cleanup. These files have no cross-process transaction fence. | Invocation time, output, result, artifact, file-count, process, memory, and CPU limits apply. Workspace or container ephemeral capacity is the outer bound. | Do not back up or restore. Repeat the whole provider invocation from its accepted source and plan after the owner proves that no external effect remains uncertain. | Missing or corrupt temporary files fail that attempt. Handled completion, error, or cancellation runs owned cleanup. Abrupt process or Pod loss can leave files. Remove such files only inside the proved inactive attempt root; never treat them as retained results. |
| `S11` Cache | Rootless `buildkitd` writes its local content and build cache; BuildKit reads it during later builds. Buster consumes only verified build output. | One daemon owns the root. Content digests detect addressed-object change, but the cache is not a result receipt. | It shares the Pod's 8 GiB ephemeral-storage request and 60 GiB limit; no dedicated quota or age policy exists. | Do not back up. Replace the Pod and rebuild from retained source and registry inputs. | Corruption or Pod loss removes acceleration and can fail an active build, not an accepted prior result. Retire by stopping submissions and replacing the Pod. |
| `S12` Inactive/library-only | `FileProducerOutbox` can hold unacknowledged producer records, but no production constructor was found at this revision. | The class has a durable-store lock, record digest, acknowledgement identity, and compaction method. These are library properties, not deployed guarantees. | A caller must supply record and byte limits. No active caller supplies them. | No production backup or restore contract applies. A future caller must define one before activation. | Do not diagnose a running outbox from this file name. If activated later, corruption, loss, and retirement rules must be documented with its concrete root and consumer. |
| `S13` Persistent authority | OpenClaw, init, startup doctor, tools, and Git operations own agent config/workspace files. The gateway and pipeline readers consume them. | One replica, `ReadWriteOnce`, retained claims, stopped-gateway doctor rule, and Git commit/tree identity for committed source. Upstream OpenClaw files have no repository record fence. | Config defaults to 10 GiB and workspace to 20 GiB. No inner quota or TTL exists. | Scale the agent to zero. Back up the matched config/workspace pair plus independent Secret and Git identities. Restore privately, run the pinned doctor, and verify the exact checkout. | Corruption can stop startup; loss removes host state, memory, or uncommitted work. Reclone restores only committed Git data. Retire after exporting needed work, handling session/audit evidence, and revoking credentials. |
| `S14` Persistent authority | Prism owns digest-addressed artifacts; the backup job owns immutable recovery groups. Control, ingestion, Worker, renderer, backup, and restore readers use them. | Artifacts use temporary writes, digest paths, no-replace publication, and file/directory synchronization. Backup groups use checksums, metadata, and atomic complete-group publication. | Artifacts and backups each request 100 GiB. Claims are retained. No automatic garbage collection or backup expiry exists. | Fence migrations and administrative deletion. Restore one verified database-and-artifact group into isolated targets and validate application references before cutover. | A missing referenced artifact or invalid group keeps Prism isolated. Keep the last verified group. Retire objects only after all database, baseline, report, and recovery references end. |
| `S15` Persistent authority | LiteLLM owns models, keys, budgets, permissions, and encrypted configuration in its PostgreSQL database. LiteLLM writes and reads; the recovery job dumps and restores. | PostgreSQL transactions and the pinned application's migrations protect rows; database and encryption credentials are separate authorities. | Direct profile is 20 GiB; GitOps profile is 1 GiB. The recovery policy limits dump size and retained backup bytes. Checked-in YAML selects no row-retention policy; effective LiteLLM settings can enable cleanup of aged diagnostic and accounting rows. See [row retention](#litellm-row-retention). | Fence LiteLLM writes. Restore roles and an empty database, restore one verified dump, supply the matched keys, and validate real encrypted data before cutover. | Corruption, missing keys, or incompatible schema blocks service. Do not overwrite encrypted values. Retire only under LiteLLM data policy after backup and credential obligations end. |
| `S16` Persistent authority | Redis owns transport streams, pending entries, and finite dedup state; publishers write and configured consumers read. It never owns Nova lifecycle truth. | Authentication, Lua atomic dedup plus `XADD`, AOF policy in the direct profile, and `noeviction`. | Stream `MAXLEN`, dedup TTL, 1 GiB memory, and selected PVC profile bound retention. Direct PVC is 20 GiB; GitOps PVC is 2 GiB with chart-default persistence details. | Pause all publishers. Use the AOF-aware migration procedure, restore in isolation, and verify streams, pending entries, expiry, restart, and lost-ack behavior before client cutover. | Corruption or loss removes delivery and dedup history. Recover from Redis when required, then replay only from canonical owners. Retire after publishers and consumers no longer depend on the stream or dedup window. |
| `S17` Persistent authority or cache as mapped | The local registry owns OCI blobs/manifests that have no other retained copy. The mirror owns only rebuildable upstream cache. Registry processes write; BuildKit and runtimes read. | One replica and single-writer PVC policy in the direct local profile; OCI digests verify content. The GitOps local profile is ephemeral. | Local capacity has no default and no automatic retention. Mirror is 5 GiB and permits cache deletion. | Fence pushes and garbage collection before local-registry backup. Restore empty storage and verify API, manifest, layer, and real pull. Recreate an empty mirror instead of restoring it. | Missing layers or digest mismatch block that image. Mirror loss only causes upstream pulls. Retire local content after release and rollback references end; retire cache after clients move. |
| `S18` Persistent authority | Prometheus owns retained samples, Loki owns retained log copies, Grafana owns UI state, and Alloy owns its local read cursor. None owns product decisions. | Each product owns its store consistency. One intended Alloy collector per node prevents duplicate cursor ownership. | Prometheus: 15 days/20 GiB. Loki: 720 hours/20 GiB. Grafana: 5 GiB. Alloy host path has no declared quota. | No repository-tested backup or restore exists. Use product snapshot boundaries or stop writers. Restore data stores before Grafana; restore positions only with known source-file cutover. | Loss creates diagnostic gaps, duplicates, or lost dashboards, never product-state changes. Retire only after incident/retention obligations and safe collector cutover. |
| `S19` Persistent authority | The Ops Tailscale sidecar writes local device state; Tailscale control remains identity authority. Operators and the sidecar consume it. | One sidecar and `ReadWriteOnce`; no repository record fence. `TS_AUTH_ONCE` permits reuse. | 1 GiB, no local TTL or cleanup automation. | Treat copies as secrets. The repository has no tested restore; prefer revocation and a new authentication after loss. | Corruption or cloning can create identity ambiguity. Never mount one copy to concurrent devices. Retire by revoking the device, handling the auth Secret, and deleting the PVC. |
| `S20` Inactive/library-only | Current Nova stores graph and registry inside `run-snapshot.json`. It checks that the two unsupported split filenames do not exist before first publication; no current writer or reader uses their content. | File absence is an admission guard. There is no consistency or fencing contract for content under either name. | No retention or capacity contract applies because supported execution rejects their presence. | Do not back up or restore them as current state. Restore only the verified combined run snapshot. | If either file exists at new-run creation, Nova reports that the run already exists and stops. Preserve it for investigation, then recover through the supported run group; do not migrate its bytes by inference. |
| `S21` Persistent authority | Prism PostgreSQL owns projects, revisions, operations, agent jobs, approvals, preferences, corpus metadata, and worker nonces. Control and Worker write under their application contracts; migration, backup, restore, and application readers consume it. | PostgreSQL transactions, row and advisory locks, unique keys, revision compare-and-swap, job fences, and the migration history order conflicting changes. | The selected chart requests 100 GiB and retains the claim. Application retention is owner-specific; there is no general row-expiry service. | Stop Prism mutations and agent admission. Restore one verified database-and-artifact group, run the pinned migrations, verify Control and Worker reads, then reconcile nonterminal operations before reopening admission. | Corruption, an unmatched artifact group, or lost fencing state keeps Prism read-only or offline. Do not reconstruct current revisions or jobs from artifacts. Retire only after product, audit, backup, and legal references end. |
| `S22` Persistent authority | The Ops StatefulSet owns one home claim and one workspace claim. Codex and operator tools write configuration, credentials, caches, checkouts, and diagnostic work; the same single Pod reads them. These claims do not own pipeline lifecycle or cluster truth. | One StatefulSet ordinal and `ReadWriteOnce` prevent concurrent attachment in the supported profile. Files inside have tool-specific consistency; the repository defines no cross-file transaction or fencing contract. | Home requests 2 GiB; workspace uses the configured persistence size. Neither claim has an age policy, automatic compaction, or repository-tested quota below its PVC size. | Stop the Ops Pod before a consistent copy. Protect credentials separately, record the checked-out revision, and restore into the same single-owner boundary. After restore, prove Codex configuration and an authorized read-only Ops query; do not infer cluster recovery from restored local files. | Corruption can remove operator configuration or make a checkout misleading, but it cannot rewrite cluster authority. Recreate disposable caches and checkouts from verified sources; recover credentials from their external authority. Retire only after exporting required incident evidence, revoking credentials, and proving no recovery procedure depends on the workspace. |

> **Source evidence — temporary and inactive identities**
>
> [Playwright creates its report and related temporary paths, consumes the report,
> and removes them in `finally`](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/buster/engine/test-gates/browser-playwright-runtime.ts#L102-L120).
> [Container build creates temporary metadata and registry credentials and removes
> their directory in `finally`](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/buster/engine/test-gates/container-build-runtime.ts#L226-L278).
> [Security scan creates and removes a private temporary registry credential
> directory](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/buster/engine/test-gates/security-scan-runtime.ts#L220-L262).
> [Terminal workspace cleanup removes only reproducible input copies and keeps
> scratch, evidence, artifacts, observability, records, and logs](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/buster/engine/test-gates/terminal-workspace.ts#L1-L19).
> [Attempt cleanup removes its copied repository unless a successful fixture must
> remain active](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/buster/engine/test-gates/runner.ts#L1727-L1739).
> [The producer-outbox class implements append, acknowledgement, and compaction,
> but does not establish an active composition](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L333-L392).
> [Current snapshot publication rejects the unsupported split filenames and writes
> only the combined run snapshot](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/nova/core/execution/engine-snapshots.ts#L100-L120).

> **Source evidence — the common file-store guarantees**
>
> [The file journal validates and hash-chains records under its file lock](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/nova/core/state/journal.ts#L21-L80).
> [Its append and refresh paths synchronize writes and truncate only an incomplete final line](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/nova/core/state/journal.ts#L136-L195).
>
> [The durable-record store enforces per-record, record-count, and total-byte limits and uses idempotency plus payload digests](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/common/plugin-runtime/foundation/observability/durable-records.ts#L56-L115).
>
> **Reason:** These stores favor an explicit stop over silent state loss. A full
> store reduces availability, but it does not evict the proof needed for replay.

### Deployment and operations stores

These stores do not use the Nova record format. Some are caches or operator
workspaces. They still need an explicit loss and retirement rule.

| Store and authority | Data, writer, and reader | Consistency, lock, or fence | Retention and capacity | Backup, restore, corruption, loss, and retirement |
| --- | --- | --- | --- | --- |
| Buster runtime PVC; Buster is authority for remote jobs and attempt evidence | `agent-buster-runtime-state`, 64 GiB, `ReadWriteOnce`; Buster writes plan jobs and run state under `/var/lib/buster-v2`, and Buster recovery reads them | The chart requires one Buster service writer. Buster record and attempt fences protect product state. | No automatic age deletion. Buster admission and evidence limits apply inside the volume; the PVC size is the outer limit. | Stop Buster admission before a volume copy. Restore Buster authority and verify jobs and evidence before admitting work. Corrupt records stop recovery. Retire this state only by the Buster rules above. |
| Rootless BuildKit cache; replaceable accelerator, not authority | The colocated `buildkitd` writes `/home/builder/.local/share/buildkit`; Buster submits builds through its Unix socket. That path is not one of the declared volume mounts, so the cache is in the container writable layer. | One BuildKit process owns the root. Content digests validate addressed objects but do not make cache content a result receipt. | No project cleanup age is set. The cache shares the Pod's ephemeral-storage budget: an 8 GiB request and 60 GiB limit cover all container ephemeral storage, not a dedicated cache quota. Pod replacement removes the cache. | Do not back up or restore it as authority. On corruption or loss, replace the Pod and rebuild only when source plus required external registry objects remain available. Stop BuildKit before any diagnostic copy. Retire by stopping submissions and replacing the Pod; preserve Buster records separately. |
| Writable local OCI registry; registry filesystem is image-blob authority for images not copied elsewhere | `registry-local-data`; registry writes blobs/manifests under `/var/lib/registry`; BuildKit pushes and runtimes pull | One replica, `Recreate`, and `ReadWriteOncePod` prevent simultaneous writers in the direct profile. OCI digests detect changed content. The Argo-adopted profile is different and has no PVC. | Storage class and capacity have no default in the direct template and must be rendered explicitly. Delete and upload purging are disabled there. No automatic retention exists. The Argo-adopted registry is ephemeral. | Fence pushes and garbage collection before a storage snapshot. Restore into an empty compatible registry and verify `/v2/`, manifest digest, and a real pull. Missing layers or digest mismatch make the image unavailable. The repository has no registry backup or tested restore. Retire a manifest only after every release and rollback reference is absent. |
| Docker Hub pull-through mirror; cache only | `registry-mirror-cache`, 5 GiB `ReadWriteOnce`; registry proxy writes cached Docker Hub content; BuildKit or node clients read only when separately configured | One deployment writer; upstream and local content digests validate objects. There is no product transaction or consumer fence. | Cache deletion is enabled; eviction behavior belongs to the upstream registry implementation. The PVC is the capacity bound. | Backup is unnecessary for correctness. Stop the mirror before copying if warm-cache preservation matters. On corruption or loss, recreate the empty cache and verify an upstream pull. Existing locally built images are unaffected. Delete the cache only after clients no longer point at it. |
| Prometheus time-series database; diagnostic authority for retained samples only | Prometheus scrapes discovered metric endpoints and writes a 20 GiB `ReadWriteOnce` volume; Prometheus and Grafana query it | The Prometheus server and its TSDB own append/WAL consistency. Samples do not fence product state. | Configured retention is 15 days, also bounded by 20 GiB. No project-specific sampling rule or remote-write copy is configured. | The repository supplies no backup or restore procedure. A consistent TSDB snapshot needs the running Prometheus API or a stopped writer; a raw live PVC copy is not claimed safe. Corruption/loss removes metric history but must not change product decisions. Retire after dashboards and incident obligations no longer require the period. |
| Grafana state; dashboard/UI configuration authority, never metric or log authority | Grafana writes plugins, dashboard state, and its internal database to a 5 GiB PVC; users and Grafana read it; Prometheus and Loki remain the data sources | One chart-managed Grafana instance owns its internal state. The external `prometheus-grafana` Secret owns administrator credentials. | No repository-defined row retention or capacity alert; PVC size is 5 GiB. | No repository backup or tested restore exists. Restore a consistent Grafana data copy and the independent admin Secret, then verify both data sources. Loss removes saved UI state, not Prometheus or Loki data. Retire only after exporting required dashboards and revoking access. |
| Loki log store; diagnostic authority for retained log copies | Monolithic Loki writes TSDB schema-v13 indexes and chunks to a 20 GiB filesystem PVC; Grafana queries it; Alloy pushes | One replica and one retained StatefulSet claim; Loki owns index/chunk consistency. It does not fence CRI logs or product state. | Retention is 720 hours and maximum query length is 721 hours. Capacity is 20 GiB. Caches, gateway, canary, and replication are disabled. | The repository supplies no backup or restore test. Stop or use a Loki-consistent snapshot before copying. Index/chunk corruption or loss removes queryable logs; source container logs may already be rotated. Restore Loki before Grafana queries, but after product authority. Retire only after retention and incident requirements end. |
| Alloy positions; local collection cursor, not log authority | Each node's Alloy DaemonSet reads CRI files and writes positions below host path `/var/lib/kubeclaw-alloy`; on first start it can import `/run/promtail/positions.yaml` | One intended collector per node. A position orders reads for one file; it does not coordinate with Loki acceptance. The Promtail-to-Alloy cutover must prevent two collectors. | Host-path capacity has no declared quota or expiry. Kubelet controls source-log rotation. | No backup is required for product correctness. Preserving positions reduces duplicates. Loss causes reread or gaps depending on remaining CRI files; inspect timestamps and Loki before resetting. Retire Promtail positions only after Alloy has imported them and fresh logs are queryable; retire Alloy positions only when collection on that node ends. |
| Ops home and workspace PVCs; operator-owned tool state | StatefulSet claim templates provide 2 GiB for `/home/node` and the configured size, default 20 GiB, for `/workspace`; Codex writes both and an operator reads them | One StatefulSet replica and `ReadWriteOnce`; no application record lock or fencing protocol is declared | No TTL, internal quota, backup job, or automatic cleanup. PVC size is the only repository limit. | Stop the Codex container before backup or restore. Corruption or loss can remove credentials cached by the tool, working files, and uncommitted edits, but cannot be used to reconstruct cluster authority. Export required work before retiring the release. |
| Ops Tailscale state; device identity support | Optional 1 GiB `ReadWriteOnce` PVC at `/var/lib/tailscale`; the Tailscale sidecar writes device state and reads its separate `authkey` Secret | One sidecar writer. `TS_AUTH_ONCE=true` reuses state; there is no project-level record fence. Tailnet control remains external authority. | No local TTL or cleanup automation. Capacity is 1 GiB. | Treat a copy as sensitive identity material. The repository has no backup/restore test. On loss or corruption, revoke the old device when possible and authenticate a new one; do not clone one state volume into concurrent Pods. Retire by revoking the tailnet device, deleting the auth Secret as policy permits, and then deleting the PVC. |

> **Source evidence — deployment store contracts**
>
> [The agent chart creates retained config and workspace claims with configured
> access modes and sizes](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/charts/kubeclaw/templates/pvc.yaml#L1-L48).
> [The Buster state claim enforces one writer and `ReadWriteOnce`](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/charts/kubeclaw/templates/buster-runtime-pvc.yaml#L1-L21).
> [The runtime starts rootless BuildKit with an explicit state root](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/docker/buster-runtime-entrypoint.sh#L7-L34).
> [The image sets that root below the builder home directory](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/docker/Dockerfile.buster-runtime#L127-L148),
> while [the deployment mounts only the workspace, Buster state, credentials,
> and cgroup subtree and declares its shared ephemeral-storage budget](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/my-values/buster-values.yaml#L145-L174).
>
> [The direct registry requires an explicit `ReadWriteOncePod` claim and disables
> deletion and upload purging](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/my-values/infra/registry-local.yaml#L1-L34).
> [The GitOps registry profile is explicitly ephemeral](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/gitops/platform/registry-local/resources.yaml#L1-L36).
> [The mirror has a 5 GiB claim and Docker Hub proxy endpoint](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/my-values/infra/registry-mirror.yaml#L14-L55).
>
> [Prometheus retains 15 days on 20 GiB, while Grafana uses 5 GiB and an external
> administrator Secret](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/gitops/platform/values/prometheus.yaml#L3-L50).
> [Loki uses one filesystem-backed 20 GiB replica with 720-hour retention](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/gitops/platform/values/loki.yaml#L1-L33).
> [Alloy stores positions on the node and imports the legacy Promtail position
> file](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/gitops/platform/values/alloy.yaml#L8-L29).
> [The Ops workload defines its two claim templates and optional Tailscale state
> claim](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/charts/ops-pod/templates/workload.yaml#L137-L176).

### Why these stores remain separate

**Accepted approach:** each component keeps the state that it can validate. A
digest-addressed blob store is paired with its owning record store, while caches
and diagnostic stores remain replaceable. The benefit is a clear corruption
boundary and a small writer set. The cost is a multi-part backup order and no
single platform transaction. The repository does not record the original
historical reason for every PVC choice; this explanation is an inference from
the implemented ownership and validation rules.

Reconsider the split if a supported multi-writer deployment, an off-node backup
service, or an accepted cross-store transaction protocol becomes available.
Do not merge stores only to reduce PVC count: first preserve writer fencing,
digest verification, independent retention, and the restore order in this page.

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
> [Run-root selection validates the ID, uses a SHA-256 path, and verifies a legacy directory through its journal](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/nova/core/execution/run-root.ts#L62-L76).
>
> [Snapshot publication writes a private temporary file, synchronizes it, links it without replacement, and synchronizes the directory](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/nova/core/execution/engine-snapshots.ts#L75-L121).

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
> [The effect journal stores request, acceptance, receipt, and content-addressed large-result references](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/nova/core/effects/journal.ts#L13-L25).
>
> [Large results use private temporary files, immutable publication, directory synchronization, size checks, and digest checks](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/nova/core/effects/journal.ts#L146-L205).

### Signals, administrative decisions, and remote gates

A resume signal and an administrative reopen decision are independent inputs.
Nova retains each input in its own hash-chained journal. The event journal then
records the lifecycle transition that applied it. Keep both sides. The input
records what was submitted; the event records what the state machine committed.
For resume, issuer-field validation is not caller authentication. Protect the
entry point and its file inputs. For a new administrative decision, the caller
must supply an authentication callback that establishes the matching principal.
An identical recorded decision is a replay and does not call that callback again.

Remote test execution has two more stores. Dispatch records preserve the exact
job and committed source archive before any network call. Import records first
reserve the job and decision, then store verified evidence, and only then move
to `complete`. This order makes a crash recoverable without claiming that a
partly downloaded result passed. A completed import can authorize removal of an
inline dispatch archive, but only while the retained Git source, import record,
result, evidence, run snapshot, and journal head still match.

Observability reconciliation is also product state when a gate requires its
evidence. Nova saves the expected attempt plan, bounded ingress/quarantine,
attempt results and evidence, and every reconciliation decision. Do not group
this directory with optional Prometheus or Loki data.

> **Source evidence — Nova control stores**
>
> [Run entry points open separate decision, event, and signal journals and reject
> a signal after the event journal records wait resolution](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/nova/core/execution/engine-run.ts#L58-L117).
> [Resume validation checks wait and issuer fields, expiry, and issue time](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/nova/core/execution/engine-snapshots.ts#L137-L144).
> [The signal contract contains no nonce or signature](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L543-L555), and
> [the CLI reads the supplied JSON file](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/nova/core/cli.ts#L60-L67).
> [Administrative replay and authentication check decision identity and callback principal](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/nova/core/execution/engine-admin.ts#L57-L67).
> [Application checks the recovered stage and terminal run state](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/nova/core/execution/engine-admin.ts#L69-L86).
>
> [Remote production composition gives dispatch and import distinct roots and
> bounded record/blob stores](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/nova/core/test-gates/production.ts#L87-L121).
> [Dispatch persists the validated job before its archive and verifies that blob
> on every load](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/nova/core/test-gates/remote-dispatch-store.ts#L27-L71).
> [Import reserves pending state before blobs and makes a digest-guarded terminal
> transition only after all evidence is stored](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/nova/core/test-gates/remote-result-import.ts#L154-L199).
>
> [Nova persists the reconciliation plan and constructs bounded attempt,
> admission, and journal stores during recovery](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/nova/core/observability/reconciler.ts#L338-L395).

### Wait and operator-message projections

The wait adapter makes a `wait-request.v2` discoverable outside the event
journal. The operator-message adapter retains the exact outbound request and an
attempt reservation before transport. It then replaces the reservation with a
receipt or a bounded failure. These stores support human interaction, but they
do not own the lifecycle decision. A lost acknowledgement without receiver
lookup leaves delivery uncertain, so retry stops instead of sending another
unbound message.

> [The wait adapter validates identity and issuer, applies bounded store defaults,
> and uses idempotent append](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/common/plugins/wait-store/src/adapter.ts#L141-L200).
> [Wait create and read use the `waits/all` stream and preserve the original
> idempotency key](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/common/plugins/wait-store/src/adapter.ts#L202-L240).
>
> [Operator-message configuration bounds target payloads, records, and total
> delivery bytes](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/common/plugins/operator-messaging/src/config.ts#L45-L104).
> [The delivery store reserves before transport and blocks an uncertain retry
> when receiver receipt lookup is absent](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/common/plugins/operator-messaging/src/delivery-records.ts#L31-L57).
> [A terminal receipt uses a digest-guarded transition and resolves a concurrent
> accepted result](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/common/plugins/operator-messaging/src/delivery-records.ts#L60-L88).

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
> [The attempt journal binds accepted envelopes and retained state to exact claim
> and attempt identity](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/worker/core/worker/native-attempt-journal.ts#L18-L77).
> [It validates process completion and sealed-result transitions](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/worker/core/worker/native-attempt-journal.ts#L78-L131).
>
> [Admission counts retained bytes and outstanding reservations before it writes the accepted envelope](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/worker/core/worker/native-attempt-journal.ts#L162-L183).
>
> [The ownership store validates host, boot, owner, and generation identity](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/worker/core/worker/ownership-store.ts#L50-L109).
> [Its transitions apply revision checks and configured record and byte limits](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/worker/core/worker/ownership-store.ts#L110-L169).
>
> [The output spool uses private files, exclusive no-follow creation, bounded append, and per-write synchronization](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/worker/core/worker/native-output-spool.ts#L13-L68).

For lifecycle transitions, corruption cases, and restart decisions, read
[Worker Core](worker-core.md#attempt-journal-and-commit-boundaries).

## Buster State

Buster separates five things that have similar roles:

1. The resolved plan says what must run.
2. The committed source snapshot says which source can run.
3. Durable admission says that Buster accepted storage liability.
4. Attempt records and evidence say what each provider did.
5. Nova verifies the result digest and bound receipt before its one-time import.

The default file evidence store uses attempt/evidence-derived paths, not content
addresses. Buster verifies containment, declared file identity, count, total
bytes, media type, size, and digest before publication.
Report adapters read retained evidence and add bounded normalized facts. They do
not replace the original evidence.

Automatic age-based deletion is not implemented. Completed remote jobs have an
explicit compaction contract. Compaction can remove an inline repository archive
only after it verifies the retained Git source and all referenced result
artifacts. It keeps a receipt of that decision.

> **Source evidence — Buster stores**
>
> [The remote job store configures bounded records and content-addressed result
> blobs](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/buster/engine/test-gates/remote-plan-service.ts#L52-L111).
> [Admission validates and reserves the accepted job before execution](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/buster/engine/test-gates/remote-plan-service.ts#L112-L164).
>
> [Execution derives one SHA-256 job directory under `runtimeRoot` and separates its workspace, artifacts, and observability roots](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/buster/engine/test-gates/remote-plan-service.ts#L337-L370).
>
> [Runner construction separates artifact, observability, attempt, admission, and report-adapter roots and rejects overlapping trust roots](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/buster/engine/test-gates/runner.ts#L667-L726).
>
> [Evidence staging enforces containment, duplicate-file rejection, count, and byte limits before immutable storage](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/buster/engine/test-gates/artifacts.ts#L24-L83).
>
> [Remote compaction verifies the completed job, source identity, archive digest, and retained result artifacts](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/buster/engine/test-gates/remote-plan-compaction.ts#L90-L149).

The full record and failure flow is in [Buster architecture](buster.md#4-durable-admission-and-state).

### Buster evidence paths are not content addresses

The default runner constructs `FileEvidenceStore`. It writes evidence to
`<artifactRoot>/<safeName(attemptId)>/<safeName(evidenceId)>-<basename(file)>`
using exclusive creation. `safeName` replaces characters outside
`[A-Za-z0-9._-]` with `_` and truncates to 128 characters. `artifactId` hashes
`attemptId:evidenceId`; it does not hash content. `contentDigest` separately
hashes the bytes, and `storageUrl` names the actual file. Keep those paths and
references with the attempt/result backup; collecting only a guessed
`sha256` subtree would lose evidence. Exclusive creation rejects an existing
path; it does not supply deduplication, retry recovery or a garbage collector.

Source: [default evidence writer](https://github.com/datrab/kubeclaw/blob/1e60f5d34c9a599a334a414987a754c95dc3543f/skills/buster/engine/test-gates/artifacts.ts#L1-L112) and [runner composition](https://github.com/datrab/kubeclaw/blob/1e60f5d34c9a599a334a414987a754c95dc3543f/skills/buster/engine/test-gates/runner.ts#L1-L2012). Digest-addressed remote result/import blobs and Prism artifacts retain their separate layouts.


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
> [Prism migration uses one reserved connection, a transaction, an advisory lock, ownership checks, and a filename journal](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/prism/storage/index.ts#L21-L74).
>
> [The artifact store publishes digest-addressed files without replacement and verifies every read](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/prism/storage/artifacts.ts#L8-L67).
>
> [The backup program dumps the database, copies immutable artifacts, writes checksums and metadata, and publishes the complete group atomically](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/charts/prism/files/prism-backup.sh#L58-L117).

### Prism acquisition quarantine

Ingestion holds acquired bytes in a 4 GiB `emptyDir` before publication. It
names the file with the content digest. Control verifies that digest, publishes
the durable artifact and relational record, and then requests quarantine
deletion. The reaper removes old files even if Control never returns. The
configured one-hour TTL is clamped to a minimum of one minute and a maximum of
one day.

This store is intentionally disposable. The benefit is that unaccepted remote
content does not enter the durable artifact PVC. The cost is that a Pod restart
or TTL expiry can discard an acquisition before publication. Recovery is a new
bounded acquisition, not file restore. Reconsider `emptyDir` only if the product
requires recovery of in-flight acquisitions; that change also needs ownership,
encryption, capacity, and cleanup rules for hostile input.

> [Ingestion clamps the TTL and reaps digest-named files](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/prism/server/ingestion.ts#L12-L20).
> [It writes an acquired object before returning its digest](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/prism/server/ingestion.ts#L21-L79).
> [The chart mounts a 4 GiB quarantine-only `emptyDir` and passes the configured
> TTL](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/charts/prism/templates/ingestion.yaml#L22-L39).

### LiteLLM PostgreSQL

LiteLLM has a separate database, owner, secret set, backup, and restore path.
`STORE_MODEL_IN_DB=True` enables database-backed model configuration. The
database also holds virtual-key permissions, budgets, and accounting records.
These rows are product data. Do not group this database with Prism.

The pinned LiteLLM application owns the SQL schema and its migrations. KubeClaw
deploys and protects the service but must not invent a local schema migration.
The production values request a 20 GiB standalone PostgreSQL PVC. A logical
backup includes schema, rows, owners, and access-control lists. It does not
include login passwords, Kubernetes Secrets, provider accounts, or the
LiteLLM master and salt keys. Recover those through their separate authority.

The recovery policy requests a backup every 15 minutes, checks every 5 minutes,
sets a two-hour maximum age, permits 64 GiB per dump, and reserves 100 GiB with a
90 GiB retained-data ceiling. Configuration defines these objectives. It does
not prove a live recovery time. The recovery script does not automatically
delete completed backup groups or upload them off-node.

> **Source evidence — LiteLLM persistence**
>
> [The deployment enables database-backed model storage and obtains database and encryption settings from Secrets](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/my-values/infra/litellm-deployment.yaml#L21-L50).
>
> [The production PostgreSQL values select the LiteLLM database, external Secret, standalone mode, and 20 GiB persistent volume](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/my-values/infra/postgresql-values.yaml#L1-L19).
>
> [The recovery script validates the source and publishes a custom-format dump
> with checksums and metadata](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/scripts/postgresql-recovery.sh#L56-L95).
> [Verification checks the file set, checksums, selected application and
> credential binding, version, age, and archive](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/scripts/postgresql-recovery.sh#L101-L129).
> [Restore rejects the source server and a nonempty target, then uses one
> error-stopping transaction](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/scripts/postgresql-recovery.sh#L141-L156).

### LiteLLM row retention

The [checked-in gateway YAML selects no row-retention policy](https://github.com/datrab/kubeclaw/blob/ebcc04066d42c94b4a4e0fc85e3393dae3d61f78/my-values/infra/litellm-config.yaml#L1-L14).
Both selected LiteLLM revisions can schedule deletion of old request-cost
records (spend logs), request-routing sessions (autorouter sessions), and
health-check records when their effective retention settings enable cleanup.
[Direct scheduling](https://github.com/BerriAI/litellm/blob/7d5b6456baaf8be6ac1a60db2b710566b5344adf/litellm/proxy/proxy_server.py#L9588-L9629)
and [GitOps scheduling](https://github.com/BerriAI/litellm/blob/16f6d924530c1cf2dc94b3e83c86a4632aefb7c0/litellm/proxy/proxy_server.py#L10008-L10049)
are conditional. Database-stored settings can change and reschedule this job;
see [direct setting application](https://github.com/BerriAI/litellm/blob/7d5b6456baaf8be6ac1a60db2b710566b5344adf/litellm/proxy/proxy_server.py#L6805-L6825)
and [GitOps setting application](https://github.com/BerriAI/litellm/blob/16f6d924530c1cf2dc94b3e83c86a4632aefb7c0/litellm/proxy/proxy_server.py#L7162-L7182).
The cleanup implementation [deletes aged rows in bounded batches](https://github.com/BerriAI/litellm/blob/7d5b6456baaf8be6ac1a60db2b710566b5344adf/litellm/proxy/db/db_transaction_queue/spend_log_cleanup.py#L308-L336)
from [these record tables](https://github.com/BerriAI/litellm/blob/7d5b6456baaf8be6ac1a60db2b710566b5344adf/litellm/proxy/db/db_transaction_queue/spend_log_cleanup.py#L456-L505).

Before assuming indefinite retention, identify the mounted configuration and
database-stored values of `maximum_spend_logs_retention_period`,
`maximum_autorouter_session_retention_period`, and
`maximum_health_check_retention_period`. Cleanup can remove aged diagnostic or
accounting rows before a later backup. A retained earlier dump can still contain
those rows. Preserve the dumps and determine the effective policy before treating
this difference as corruption. These settings do not define a common expiry for
models, keys, or budgets, and do not delete retained backup groups.

#### Read retention inputs without changing the service

This procedure applies to the two [selected LiteLLM revisions](#selected-litellm-source-and-image-boundary).
Run it from the bound independent administration machine. It reads one running
LiteLLM Pod and its database; it does not change retention or start cleanup.
Use `kubectl`, Python 3 with PyYAML in the selected container, and `psql` on the
administration machine. Do not install tools into the running container.

Before starting, the LiteLLM and database owners must identify the deployed
profile, immutable image, upstream revision, database service and database
name, applied schema-change history, and the exact Pod/container. They must
supply an authorized read-only database connection profile privately. It must
select that instance and a role with only the necessary read access. Use a
libpq service file and password file through their private paths; never put a
credential URL or password in a command, record, or shell trace. Cluster access
must permit reading the selected Pod and executing this file-read command.
The owners must confirm that the deployed `LiteLLM_Config` table is in `public`,
with `param_name` as its unique text key and `param_value` as JSON or JSONB.
The [direct schema](https://github.com/BerriAI/litellm/blob/7d5b6456baaf8be6ac1a60db2b710566b5344adf/schema.prisma#L618-L623)
and [GitOps schema](https://github.com/BerriAI/litellm/blob/16f6d924530c1cf2dc94b3e83c86a4632aefb7c0/schema.prisma#L621-L626)
describe the selected schema, but do not prove that live migrations completed.
Stop if this instance, schema, read-only access, or tool selection is unverified.

1. Bind the cluster as specified in [Bind Cluster Authority](../use/install.md#bind-cluster-authority).
   Set `LITELLM_POD` to the owner's exact running Pod name and
   `LITELLM_POD_UID` to its recorded UID. Keep its non-secret owner/image/mount
   record with the observation time. Both repository profiles mount
   `/app/config.yaml`; confirm that this is the selected container's actual
   configuration file. The [direct mount](https://github.com/datrab/kubeclaw/blob/ebcc04066d42c94b4a4e0fc85e3393dae3d61f78/my-values/infra/litellm-deployment.yaml#L60-L74)
   and [GitOps mount](https://github.com/datrab/kubeclaw/blob/ebcc04066d42c94b4a4e0fc85e3393dae3d61f78/gitops/platform/litellm/resources.yaml#L40-L50)
   use `subPath`. A ConfigMap alone is insufficient: the `subPath` mount
   can keep older bytes after a ConfigMap change.

```bash
assert_cluster_binding || exit 126
set -euo pipefail
umask 077
test "$(kubectl --context "$EXPECTED_CONTEXT" -n "$NAMESPACE" get pod \
  "$LITELLM_POD" -o jsonpath='{.metadata.uid}')" = "$LITELLM_POD_UID"
kubectl --context "$EXPECTED_CONTEXT" -n "$NAMESPACE" exec -i \
  "$LITELLM_POD" -c litellm -- python - <<'PY'
try:
    import hashlib, json, re, yaml
    raw = open('/app/config.yaml', 'rb').read()
    config = yaml.safe_load(raw)
    if not isinstance(config, dict):
        raise ValueError()
    g = config.get('general_settings', {})
    if not isinstance(g, dict):
        raise ValueError()
    keys = ('maximum_spend_logs_retention_period',
            'maximum_autorouter_session_retention_period',
            'maximum_health_check_retention_period')
    def safe(v):
        if v is None or type(v) is int:
            return v
        if type(v) is str and re.fullmatch(r'[0-9]+(s|m|h|d|w|mo)', v):
            return v
        return {'uninterpreted_type': type(v).__name__, 'value_withheld': True}
    print(json.dumps({'mounted_file_sha256': hashlib.sha256(raw).hexdigest(),
        'settings': {k: {'present': k in g, 'value': safe(g.get(k))} for k in keys}}))
except Exception:
    raise SystemExit('LITELLM_RETENTION_CONFIG_READ_FAILED') from None
PY
```

Expected result: one mounted-file digest and exactly three setting records.
`present: false` differs from an explicit YAML null. The output withholds
unexpected values instead of exposing arbitrary configuration strings.
A missing Pod, changed UID, file-read failure, unavailable Python/PyYAML, or
unexpected value stops this identification. File-read, import, parse, and
mapping-shape failures return nonzero with only
`LITELLM_RETENTION_CONFIG_READ_FAILED`; raw YAML, exception text and tracebacks
are withheld. An empty/null document or a nonmapping `general_settings` is
rejected. Keep this constant failure record and ask the owner to diagnose the
configuration privately. Obtain a versioned owner procedure
that exports only these fields and the exact mounted-file identity if this
read command is unavailable. Do not dump the configuration or environment.

2. In a dedicated query shell, set `PGSERVICE`, `PGSERVICEFILE`, and
   `PGPASSFILE` to the owner's read-only service name and absolute private
   service-file and password-file paths. Ordinary shell assignments are not
   inherited by `psql`; the command block below explicitly exports them.
   The owner must confirm that this service name exists in that exact file,
   selects the verified source host/address, port, database and read-only user,
   and contains the approved transport and authentication settings. The files
   must be privately owned and readable; the password file must deny group and
   other access. The service section must contain neither a `password` nor a
   `passfile` setting for this password-file procedure. Do not print file
   contents or selector values.

   A [service-file field](https://www.postgresql.org/docs/18/libpq-pgservice.html)
   overrides its corresponding environment value. A field omitted from the
   service can still use an inherited variable or a built-in default. A direct
   connection argument overrides the service. Therefore the block rejects
   every other `PG*` shell input and supplies no host, user, database, password
   or connection-string argument. In particular, inherited `PGPASSWORD` can
   supply a password before the [password file](https://www.postgresql.org/docs/18/libpq-pgpass.html)
   is considered. Reject it instead of silently using it. The selected service
   must define all target identity and required security fields; owners must
   approve any deliberately omitted default. Selector export and a clean
   environment do not by themselves prove which server accepted a connection.

   If the guard rejects an inherited input, stop and ask the owner for a clean
   query shell with the same approved files. Do not dump the environment,
   inspect secrets, or remove an input to guess a connection. Run this exact
   projection only after the live schema and instance checks above:

```bash
set -euo pipefail
umask 077
for pg_input in ${!PG@}; do
  case "$pg_input" in
    PGSERVICE|PGSERVICEFILE|PGPASSFILE) ;;
    *) printf '%s\n' 'LITELLM_RETENTION_PROFILE_INPUT_REJECTED' >&2; exit 126 ;;
  esac
done
if test -z "${PGSERVICE-}" || test -z "${PGSERVICEFILE-}" || test -z "${PGPASSFILE-}"; then
  printf '%s\n' 'LITELLM_RETENTION_PROFILE_INPUT_MISSING' >&2
  exit 126
fi
for profile_path in "$PGSERVICEFILE" "$PGPASSFILE"; do
  case "$profile_path" in
    /*) ;;
    *) printf '%s\n' 'LITELLM_RETENTION_PROFILE_PATH_INVALID' >&2; exit 126 ;;
  esac
  if ! test -f "$profile_path" || ! test -r "$profile_path"; then
    printf '%s\n' 'LITELLM_RETENTION_PROFILE_FILE_UNAVAILABLE' >&2
    exit 126
  fi
done
export PGSERVICE PGSERVICEFILE PGPASSFILE
psql --no-psqlrc --set=ON_ERROR_STOP=1 <<'SQL'
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '5s';
SHOW transaction_read_only;
WITH keys(key) AS (VALUES
 ('maximum_spend_logs_retention_period'),
 ('maximum_autorouter_session_retention_period'),
 ('maximum_health_check_retention_period')),
settings AS (
 SELECT param_value::jsonb AS value FROM public."LiteLLM_Config"
 WHERE param_name = 'general_settings'
)
SELECT keys.key, settings.value IS NOT NULL AS record_has_value,
       jsonb_typeof(settings.value) AS record_type,
       COALESCE(settings.value ? keys.key, false) AS key_present,
       jsonb_typeof(settings.value -> keys.key) AS value_type,
       CASE
         WHEN jsonb_typeof(settings.value -> keys.key) = 'null' THEN 'null'
         WHEN jsonb_typeof(settings.value -> keys.key) = 'number'
           AND (settings.value ->> keys.key) ~ '^-?[0-9]+$'
           THEN settings.value ->> keys.key
         WHEN jsonb_typeof(settings.value -> keys.key) = 'string'
           AND (settings.value ->> keys.key) ~ '^[0-9]+(s|m|h|d|w|mo)$'
           THEN settings.value ->> keys.key
         ELSE '[absent or withheld]'
       END AS retention_value
FROM keys LEFT JOIN settings ON true ORDER BY keys.key;
ROLLBACK;
SQL
```

Expected result: `transaction_read_only` is `on`, three rows and `ROLLBACK`.
`record_type` must be `object` or null; stop for any other record shape.
The query reads only the three retention fields from the `general_settings`
record. A missing record, SQL null record, absent key and JSON null key are
not an enabled policy. An unexpected type or withheld value needs owner
interpretation against the selected parser. Do not broaden the query to whole
records, Secrets, provider credentials, or key tables. On connection, schema,
permission, timeout, or shape failure, stop; preserve the safe error and obtain
the database owner's corrected read-only procedure. Do not try a write-capable
profile or run a migration.

3. Compare the mounted and stored observations with these rules.

| Input or observation | Interpretation |
| --- | --- |
| Key absent from initial mounted settings and not applied from the database | No retention period for that record type; deletion is disabled. There is no built-in number of retention days for these three keys. |
| Database key present and applied by the selected process | It overwrites the loaded value even when YAML also supplied that key. A changed value, including null, reschedules cleanup. |
| Database key absent | The setter does not assign that key. It does not prove that the process has forgotten an earlier stored value or now equals the mounted file. |
| Applied null, or a string that raises `ValueError` in the retention parser | The corresponding deletion path is disabled. Other unexpected types can fail parsing; do not call them a safe disabled policy without owner investigation. |
| Integer | The retention parser treats it as days. Use an explicit string such as `7d` when the owner later changes policy. |
| Explicit duration string | `s`, `m`, `h`, `d`, `w`, and `mo` mean seconds, minutes, hours, days, weeks, and calendar months. Zero can parse; do not assume zero disables deletion. Calendar-month seconds depend on parsing time. |

Spend retention applies to `LiteLLM_SpendLogs.startTime` and its derived
`LiteLLM_SpendLogToolIndex.start_time` rows. Autorouter retention applies to
`LiteLLM_AutoRouterSession.last_turn_at`; health retention applies to
`LiteLLM_HealthCheckTable.checked_at`. Each uses its own cutoff. These are
current-database deletions, not changes to previously published backup groups.

The authenticated admin-view `GET /config/field/info?field_name=<key>` reads
stored settings and can fail for an absent field. It is not a loaded-value
read. `GET /config/list?config_type=general_settings` reports loaded settings
but falls back to the database when the loaded value is `None`.
Its `stored_in_db` flag describes presence, not proof of successful application.
Use the owner's private authenticated administration surface for these GETs;
retain only these three fields, not the full response. Neither endpoint is an
unconditional observation of the cleanup task in every running worker.

**Effective runtime policy can remain unknown.** The mounted-file and SQL
results prove inputs at their recorded times. They do not prove that each worker
loaded the same inputs, that a database change was applied, that a scheduler
ran, or that deletion succeeded. To claim an effective policy, the LiteLLM owner
must supply a versioned read-only observation procedure bound to each relevant
Pod/process and observation time. It must identify the loaded values, their
parsed seconds or disabled/error result, the scheduled cleanup state, and any
change between the input reads. Stop at this boundary if that observation is
unavailable or conflicts with the inputs. Keep both dumps and mark the effective
policy `unknown`; do not restart, change retention, or delete rows to make the
observations agree.

> **Source evidence — retention identification and its limit**
>
> Claim: database application overwrites present retention keys; the parser and
> table-specific deletion paths determine cleanup, while administration reads
> have the limits stated above.
>
> Implementation: [direct setter](https://github.com/BerriAI/litellm/blob/7d5b6456baaf8be6ac1a60db2b710566b5344adf/litellm/proxy/proxy_server.py#L6805-L6825),
> [GitOps setter](https://github.com/BerriAI/litellm/blob/16f6d924530c1cf2dc94b3e83c86a4632aefb7c0/litellm/proxy/proxy_server.py#L7162-L7182),
> [parser](https://github.com/BerriAI/litellm/blob/7d5b6456baaf8be6ac1a60db2b710566b5344adf/litellm/proxy/db/db_transaction_queue/spend_log_cleanup.py#L176-L207),
> [table cutoffs](https://github.com/BerriAI/litellm/blob/7d5b6456baaf8be6ac1a60db2b710566b5344adf/litellm/proxy/db/db_transaction_queue/spend_log_cleanup.py#L456-L505),
> [duration units](https://github.com/BerriAI/litellm/blob/7d5b6456baaf8be6ac1a60db2b710566b5344adf/litellm/litellm_core_utils/duration_parser.py#L23-L98),
> [direct field-info read](https://github.com/BerriAI/litellm/blob/7d5b6456baaf8be6ac1a60db2b710566b5344adf/litellm/proxy/proxy_server.py#L16810-L16879),
> [GitOps field-info read](https://github.com/BerriAI/litellm/blob/16f6d924530c1cf2dc94b3e83c86a4632aefb7c0/litellm/proxy/proxy_server.py#L17342-L17411),
> [GitOps config-list fallback](https://github.com/BerriAI/litellm/blob/16f6d924530c1cf2dc94b3e83c86a4632aefb7c0/litellm/proxy/proxy_server.py#L17540-L17682),
> and [direct config-list fallback](https://github.com/BerriAI/litellm/blob/7d5b6456baaf8be6ac1a60db2b710566b5344adf/litellm/proxy/proxy_server.py#L17004-L17140).
>
> Contract or setting: only the three named retention settings are projected.
> Test evidence: local output-filter and query-shape checks; no deployed
> input retrieval or cleanup execution has been demonstrated by this page.
> Revision: the two selected upstream revisions above; KubeClaw `ebcc040`.
> Limit: input evidence and source rules do not establish an observed live policy.

### Selected LiteLLM source and image boundary

An image digest selects an OCI index: a list of images for different processor
architectures. Both checked-in LiteLLM indexes contain Linux `amd64` and
`arm64` images. Their registry configuration and attached BuildKit provenance
identify different upstream source revisions.

| Deployment profile | Selected OCI index digest | Upstream revision reported by both architectures |
| --- | --- | --- |
| Direct infrastructure | `sha256:690f24800e2208e4f31b01483b9d0521d79dc508c8191f1c0b2f21549400c580` | `7d5b6456baaf8be6ac1a60db2b710566b5344adf` |
| GitOps platform | `sha256:a79320760af8df488074ab3fbc830883856c7f952976aad00f039d3a43ffe4b2` | `16f6d924530c1cf2dc94b3e83c86a4632aefb7c0` |

The [direct manifest selects the first index](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/my-values/infra/litellm-deployment.yaml#L25-L33).
The [GitOps manifest selects the second index](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/gitops/platform/litellm/resources.yaml#L22-L30);
its `main-latest` tag does not replace the digest authority.
[The direct registry index](https://ghcr.io/v2/berriai/litellm/manifests/sha256:690f24800e2208e4f31b01483b9d0521d79dc508c8191f1c0b2f21549400c580)
and [the GitOps registry index](https://ghcr.io/v2/berriai/litellm/manifests/sha256:a79320760af8df488074ab3fbc830883856c7f952976aad00f039d3a43ffe4b2)
bind their platform manifests, configuration, provenance, and filesystem layers
by digest. Registry API access can require a pull token.

The revision labels are in the
[direct amd64 configuration](https://ghcr.io/v2/berriai/litellm/blobs/sha256:1c188fb990fad2d2cc6d7555910ab4d455b69e9750ecdd4d8557957035019053),
[direct arm64 configuration](https://ghcr.io/v2/berriai/litellm/blobs/sha256:fdd19ec7b3b133895f6f09116cc27979d32bcd6bb3344a2e3ed59bb86c942585),
[GitOps amd64 configuration](https://ghcr.io/v2/berriai/litellm/blobs/sha256:c175e926e4b0e8328885696165f40e28bb763c7384e4c9c55235e3cdfb78a0c7),
and [GitOps arm64 configuration](https://ghcr.io/v2/berriai/litellm/blobs/sha256:27852540a0b41e0150d72f51bfbad3be449fb26e8067456c5e6bc3c74b004356).

Selected schema, migration, startup, model-storage, and encryption files from
those layers matched the official Git source at the reported revisions for
both architectures. This establishes the inspected file bytes. It does not
establish a verified publisher signature, complete runtime equivalence, or a
successful database restore. The two profiles have different schema and
migration files; do not treat them as interchangeable application versions.

### Rows and encryption inputs

The direct revision's [Prisma schema defines budgets, named credentials, and
stored models](https://github.com/BerriAI/litellm/blob/7d5b6456baaf8be6ac1a60db2b710566b5344adf/schema.prisma#L12-L61),
[virtual-key permissions and limits](https://github.com/BerriAI/litellm/blob/7d5b6456baaf8be6ac1a60db2b710566b5344adf/schema.prisma#L417-L466),
and [configuration and request accounting](https://github.com/BerriAI/litellm/blob/7d5b6456baaf8be6ac1a60db2b710566b5344adf/schema.prisma#L618-L654).
The [GitOps schema defines the corresponding model and credential records](https://github.com/BerriAI/litellm/blob/16f6d924530c1cf2dc94b3e83c86a4632aefb7c0/schema.prisma#L38-L61).
A dump must preserve the whole database and its record of applied database
schema changes, not only the current embedding model row.

On a stored-model write, LiteLLM passes each model parameter through the
[encryption helper before inserting the model](https://github.com/BerriAI/litellm/blob/7d5b6456baaf8be6ac1a60db2b710566b5344adf/litellm/proxy/management_endpoints/model_management_endpoints.py#L1054-L1081).
The helper encrypts strings; it leaves non-string values unchanged. It selects
`LITELLM_SALT_KEY` when present and otherwise uses the loaded master key.
Without an effective `general_settings.encryption_algorithm` override, new
strings use XSalsa20-Poly1305, a SHA-256-derived key, and URL-safe Base64 storage.
An `aes-256-gcm` override selects versioned `v2:gcm:` values. Reads detect the
format, so one database can contain both formats.
[Direct key and algorithm selection](https://github.com/BerriAI/litellm/blob/7d5b6456baaf8be6ac1a60db2b710566b5344adf/litellm/proxy/common_utils/encrypt_decrypt_utils.py#L23-L116)
and [GitOps key and algorithm selection](https://github.com/BerriAI/litellm/blob/16f6d924530c1cf2dc94b3e83c86a4632aefb7c0/litellm/proxy/common_utils/encrypt_decrypt_utils.py#L26-L119)
use this rule. The checked-in gateway configuration does not select an
algorithm override; stored settings and externally supplied Secrets still need
to be checked for the deployed instance.

A failed decryption can return `None` or the original stored value, depending
on the caller. It does not always stop the process.
[The direct read helper handles these failures](https://github.com/BerriAI/litellm/blob/7d5b6456baaf8be6ac1a60db2b710566b5344adf/litellm/proxy/common_utils/encrypt_decrypt_utils.py#L119-L160).
Keep the encryption input that wrote the retained rows. If no salt key was used,
changing the master key also changes that input. Do not replace ciphertext with
new values to hide a failed restore. Before cutover, prove that the restored
application can use retained encrypted configuration, as well as complete one
real authenticated embedding. A route backed only by mounted credentials does
not prove that database ciphertext can be read.

The checked-in configuration supplies no pool override. The CLI's default
connection limit is 10 and its pool-wait timeout is 60 seconds. These control
one client's pool; they are not a service-wide concurrency limit or an operation
deadline. The CLI writes the selected pool parameters into `DATABASE_URL`,
over existing query values. `database_extra_connection_params` can override
those selected parameters. Do not print the credential-bearing URL during
diagnosis. Check the effective settings and PostgreSQL connection capacity
before increasing a limit.
[Default pool values and parameter construction](https://github.com/BerriAI/litellm/blob/7d5b6456baaf8be6ac1a60db2b710566b5344adf/litellm/proxy/proxy_cli.py#L56-L92),
[URL parameter precedence](https://github.com/BerriAI/litellm/blob/7d5b6456baaf8be6ac1a60db2b710566b5344adf/litellm/proxy/proxy_cli.py#L162-L176),
and [GitOps pool defaults](https://github.com/BerriAI/litellm/blob/16f6d924530c1cf2dc94b3e83c86a4632aefb7c0/litellm/proxy/proxy_cli.py#L63-L66)
support these bounds.

### Startup can change a restored schema

The image entrypoint starts the `litellm` CLI. With `DATABASE_URL` present and
schema updates enabled, the CLI applies migrations before starting HTTP.
The checked-in arguments do not select `--use_prisma_db_push` or the v2 migration
resolver, so the default path uses `prisma migrate deploy` with the v1 resolver.
Schema updates can be disabled by `general_settings.disable_prisma_schema_update`
or, when that setting is absent, `DISABLE_SCHEMA_UPDATE`.
[The CLI selects the migration path](https://github.com/BerriAI/litellm/blob/7d5b6456baaf8be6ac1a60db2b710566b5344adf/litellm/proxy/proxy_cli.py#L1309-L1360)
and [the database manager selects the update setting](https://github.com/BerriAI/litellm/blob/7d5b6456baaf8be6ac1a60db2b710566b5344adf/litellm/proxy/db/prisma_client.py#L968-L992).

The v1 resolver makes up to four migration attempts per setup call. After applying pending
migrations, it can generate and execute a schema difference; a nonempty database
without a record of applied schema changes can enter its baseline-and-resolution path. These
are writes, not read-only compatibility checks.
[Migration attempts and baseline recovery](https://github.com/BerriAI/litellm/blob/7d5b6456baaf8be6ac1a60db2b710566b5344adf/litellm-proxy-extras/litellm_proxy_extras/utils.py#L1018-L1137)
and [schema-difference execution](https://github.com/BerriAI/litellm/blob/7d5b6456baaf8be6ac1a60db2b710566b5344adf/litellm-proxy-extras/litellm_proxy_extras/utils.py#L416-L552)
explain why the restored database must remain isolated from production writers.

The CLI can continue startup when migration setup returns `False` unless
`ENFORCE_PRISMA_MIGRATION_CHECK` or its CLI flag enables enforcement. An
unrecoverable `RuntimeError` instead exits with status 2.
[Direct startup failure handling](https://github.com/BerriAI/litellm/blob/7d5b6456baaf8be6ac1a60db2b710566b5344adf/litellm/proxy/proxy_cli.py#L1333-L1360)
and [GitOps startup failure handling](https://github.com/BerriAI/litellm/blob/16f6d924530c1cf2dc94b3e83c86a4632aefb7c0/litellm/proxy/proxy_cli.py#L1351-L1378)
show this distinction. Neither checked-in Deployment sets enforcement directly;
`envFrom` can supply it through the external Secret. A running process therefore
does not prove that migrations succeeded.

Fence writers and retain an untouched verified dump before starting an image
against a restored database. Keep the recorded application digest, key inputs,
and record of applied database schema changes together. Stop cutover on a
migration failure, unexplained schema change, or unreadable retained ciphertext. Do not downgrade an image
against a database that a newer image has changed; restore an isolated,
compatible recovery group first.

> **Source evidence — selected LiteLLM implementation**
>
> **Claim:** The selected files implement the schema, encryption selection, and
> startup migration behavior described above.
> **Implementation:** The commit-pinned upstream functions and schema linked
> beside each mechanism; their selected OCI-layer bytes matched both architectures.
> **Contract or setting:** The two deployment image digests, external `litellm-secrets`,
> gateway configuration, and startup arguments determine the selected profile.
> **Test evidence:** Registry and file-digest comparisons completed; no upstream
> test, image execution, encryption round trip, or application restore was run.
> **Revision:** Direct `7d5b6456baaf8be6ac1a60db2b710566b5344adf`;
> GitOps `16f6d924530c1cf2dc94b3e83c86a4632aefb7c0`.
> **Limit:** The linked implementation does not establish a verified publisher signature,
> deployed Secret values, effective stored settings, or live recovery.

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
> [The Argo CD PostgreSQL values request 1 GiB](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/gitops/platform/values/postgresql.yaml#L1-L23), while [the direct production values request 20 GiB](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/my-values/infra/postgresql-values.yaml#L1-L19).
>
> [The Argo CD Redis values request 2 GiB and omit an explicit persistence-policy block](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/gitops/platform/values/redis.yaml#L1-L19).
>
> [The direct profile declares strict AOF, no eviction, and 20 GiB](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/my-values/infra/redis-values.yaml#L1-L27).

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
> [The adapter validates endpoints and bounds, limits payloads to 1 MiB, and performs stream append plus deduplication in Lua](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/skills/common/plugins/redis-transport/src/adapter.ts#L28-L87).
>
> [The selected production values enable strict AOF, disable eviction, set 1 GiB Redis memory, and request a 20 GiB PVC](https://github.com/datrab/kubeclaw/blob/13bff0a18a64e74f2cbbaa1978e746fcdeff0c10/my-values/infra/redis-values.yaml#L1-L27).

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

### Generic JSON artifact encoding and reads

The generic artifact adapter accepts only `application/json` writes. Omitting
`encoding` selects legacy `canonicalJson`; the retained `ArtifactRef` has no
encoding field. Explicit `encoding: "kubeclaw-json.utf16.v1"` selects
`portableJson` and retains that exact label. Other labels, including `null`,
fail with `ARTIFACT_ENCODING_UNSUPPORTED`. This is a serialization identity,
not a declaration that the stored UTF-8 bytes are UTF-16 text.

| Read operation | Selection and result |
| --- | --- |
| `get_json` | Select by artifact ID, namespace and digest; return the parsed value, digest, byte size and stored reference. |
| `get_json_bytes` | Select by the same keys and require the complete `reference` payload; return verified JSON text and the stored reference with the parsed value. Missing reference fails with `ARTIFACT_REFERENCE_REQUIRED`; a candidate with no exact matching reference fails with `ARTIFACT_REFERENCE_CORRUPT`. |
| `get_latest_json` / `get_latest_json_bytes` | Select the latest completed matching artifact in the caller's run, not the latest artifact across all runs. The bytes variant includes verified JSON text. |

Metadata admission precedes immutable blob publication. A metadata-only write
intent is not readable completion: reads skip its missing blob and may return
an older completed match. No completed match yields `ARTIFACT_NOT_FOUND`.
Corrupt blob bytes yield `ARTIFACT_INTEGRITY_FAILED`; other verification failures
propagate rather than authorizing a fallback to unchecked data.

Preserve the complete reference and encoding when copying or restoring an
artifact. Identical digests do not authorize adding or removing a codec label,
even when the two encoders happen to produce identical bytes. Stop on reference
or integrity failure; reconcile the producer's retained checkpoint, metadata and
blob before retrying. Do not relabel a retained reference to force a read.
These rules describe local adapter and checkpoint behavior, not a successful
remote backup or restore exercise.

> **Source evidence:**
> [Legacy locale ordering and explicit portable UTF-16 code-unit key ordering](https://github.com/datrab/kubeclaw/blob/f99aecbb00cb399b46dfbbeb3ddb375fba6218e7/skills/common/plugin-runtime/sdk/src/values.ts#L45-L63).
> [Adapter encoding, read selection, verification and metadata-before-blob publication](https://github.com/datrab/kubeclaw/blob/f99aecbb00cb399b46dfbbeb3ddb375fba6218e7/skills/common/plugins/artifact-store/src/adapter.ts#L38-L173).
> [Maintained tests preserve legacy and portable checkpoints and reject same-byte relabeling](https://github.com/datrab/kubeclaw/blob/f99aecbb00cb399b46dfbbeb3ddb375fba6218e7/tests/verification/reliability/artifact-checkpoint-encoding.test.mjs#L39-L106).

## Encryption is a separate boundary

A digest, hash chain, file permission, database role or `fsync` does not encrypt
stored bytes. Transport TLS does not establish encryption of a volume or backup.
The following boundaries apply to the store matrix and its backup groups.

| Matrix family | Application storage protection | Independent encryption authority |
| --- | --- | --- |
| Nova run, effects, observer state, waits, message delivery, remote dispatch/import and reconciliation | Repository writers serialize records and supplied blob bytes without an application encryption envelope. Private permissions, identity checks and digests protect different properties. | The operator must establish encryption for the actual filesystem/PVC and every backup destination; no provider-key or volume-encryption proof follows from these writers. |
| Worker ownership, attempt records, input/result blobs and output spools | The native stores write record or raw output bytes, not application ciphertext. | Host/storage owner controls volume and backup protection. Keep host identity and credential recovery separate from copied files. |
| Buster jobs, attempts, evidence and reports | File stores retain serialized records and supplied evidence bytes; content digests do not conceal them. | Storage owner must protect runtime roots, evidence and backups, including provider-supplied sensitive evidence. |
| Prism relational data, artifacts and quarantine | Artifact publication writes supplied bytes directly. SQL permissions and transactions do not encrypt the whole database. Quarantine is temporary but can contain sensitive source bytes. | Database, PVC and node-storage owners must establish their actual at-rest policy. The application artifact store does not supply an encryption key. |
| LiteLLM PostgreSQL | Selected LiteLLM versions encrypt certain credential fields with their master/salt-key contract; this is not whole-database or whole-backup encryption. See the detailed LiteLLM sections below. | Retain those exact keys through their independent credential authority, separately from database dumps; database/storage owners still own volume protection. |
| Redis, telemetry and monitoring projections | AOF/RDB, diagnostic records and metrics are not an application-wide encryption boundary. A chart or product may delegate storage security to its configured provider. | Redis/telemetry/storage owners must verify the selected server, PVC and backup policy. This page does not establish provider encryption or key recovery. |
| OpenClaw config/workspace, Ops home/workspace/Tailscale state and registry files | These volumes can contain source, credentials, tokens or device identity; a private path or Kubernetes Secret reference does not establish ciphertext at rest. | Respective service/credential owner and storage provider must establish encryption, key retention and access isolation. Never duplicate a live device identity to concurrent writers. |

The Prism backup script creates a custom PostgreSQL dump and copies artifact
bytes; the PostgreSQL recovery script also creates a custom dump. Neither adds
an encryption envelope to the group. Protect the complete group during storage
and transfer using the owner's approved encryption/access procedure, with keys
retained independently. Compression, checksums and field encryption inside a
row do not replace that protection. If the destination or its key-recovery
policy is unknown, record that limit and stop an unattended off-host transfer;
do not label the group encrypted.

Source: [Prism supplied-byte publication](https://github.com/datrab/kubeclaw/blob/1e60f5d34c9a599a334a414987a754c95dc3543f/skills/prism/storage/artifacts.ts#L1-L68), [Prism dump and artifact group](https://github.com/datrab/kubeclaw/blob/1e60f5d34c9a599a334a414987a754c95dc3543f/charts/prism/files/prism-backup.sh#L1-L191), and [PostgreSQL recovery archive](https://github.com/datrab/kubeclaw/blob/1e60f5d34c9a599a334a414987a754c95dc3543f/scripts/postgresql-recovery.sh#L1-L196). The family-specific writers linked in the matrix define their record and blob encodings; none of these statements verifies a deployed storage provider.

## Backup Groups

| Group | Include | Writer fence | Restore order | Current automation boundary |
| --- | --- | --- | --- | --- |
| Nova run | Complete run root, large effect results, and any separately stored artifact bytes referenced by events | Stop mutation for the selected run and stop administrative reopen | Restore files privately; verify snapshot and hash chains; verify referenced artifacts; then start recovery | No repository-wide scheduler, off-node copy, RPO, or RTO |
| Worker host | Ownership store, attempt metadata, input/result blobs, and output spools | Stop admission and hold the trusted supervisor boundary | Restore only to the proved host identity; validate ownership; replay attempts; reopen admission last | No automatic retirement or cross-host restore workflow |
| Buster runtime | Complete `stateRoot` plus `runtimeRoot`: remote jobs, statuses, source archives or verified retained Git source, attempts, results, receipts, evidence, and reports | Stop remote admission, execution, and compaction | Restore the state store, result blobs, and job directories together; verify identities and digests; reconcile incomplete attempts; expose status last | Quiesced storage backup is operator work; file stores are not replicated |
| Prism | One PostgreSQL dump plus the complete immutable artifact superset and group metadata | Stop migrations and administrative artifact deletion; normal immutable publication follows the group rule | Verify group; restore database and artifacts into isolated targets; start Prism readers; verify application references; cut over last | Scheduled local backup, verification, and SQL smoke proof exist; no automatic expiry or off-host copy |
| LiteLLM | Full logical database dump, roles/ACL evidence, metadata, checksums, and independently retained master/salt and database credentials | Fence LiteLLM writes | Restore roles and empty database; restore dump; supply exact keys; validate LiteLLM API and encrypted values; cut over last | Scheduled local recovery job exists; no automatic backup-group deletion or off-node copy |
| Redis | AOF-aware snapshot or fenced RDB plus stream, consumer, pending, and expiry evidence and external password authority | Pause writes and stop all publishers before source shutdown | Prepare a fresh compatible AOF data set; start isolated target; validate streams, pending entries, exact dedup expiry, lost-ACK replay, and restart; switch clients last | Migration tooling and native tests exist; cluster/CSI and power-loss acceptance remain environment work |
| Telemetry projections | Sink store only when diagnostic retention requires it | Stop the sink writer or use its owned consistent snapshot | Restore after canonical Nova journals; replay only events beyond verified checkpoints | Projection recovery must never block restoration of lifecycle authority |
| OpenClaw agent | One config PVC and one workspace PVC for the same agent; independent Secrets and committed Git remote remain outside the group | Scale that agent to zero; ensure startup doctor and Git init are not running | Restore config and workspace to private claims; restore Secrets from their own authority; run the pinned startup doctor; verify gateway and exact repository state | No automated backup, checksum manifest, restore test, RPO, or RTO |
| Registry | Registry filesystem plus an inventory of retained manifests/digests and the independent client configuration | Stop pushes, garbage collection, and registry writer | Restore to an empty compatible registry; verify manifest and layer digests; perform a real pull; switch clients last | No repository backup/restore; Argo-adopted local registry has no persistent data to restore |
| Monitoring | Prometheus TSDB, Loki store, Grafana state, and optional Alloy positions are separate groups; do not combine inconsistent live copies | Use each product's snapshot boundary or stop its writer | Restore Loki and Prometheus, then Grafana; restore positions only when their source CRI files and cutover point are known | No repository backup/restore test; metric/log loss must not block product recovery |
| Ops | Home and workspace claims; optional Tailscale state is a separate sensitive group | Scale the StatefulSet to zero and revoke external sessions if compromise is suspected | Restore home/workspace privately; prefer new Tailscale authentication after loss; verify that bearer, GitHub, Kubernetes, and tailnet credentials come from current external authorities | No automated backup or restore test; never clone one Tailscale device state to concurrent writers |

## Prepare a Redis RDB as a fresh AOF dataset

The supported repository primitive is **offline RDB-to-AOF preparation**, not
an arbitrary AOF restore or an automatic cluster cutover. Its input is one
checksum-bound RDB from a fenced source; its output is a new private local
directory for the selected Redis version. Keep the original release, volume,
source snapshot, independent password authority and consumer configuration.
Do not run this tool against the only retained copy or a destination in use.

Before capture, the Redis owner must inventory and stop publishers, schedulers
and reconciliation that could restart them. Preserve streams, consumer groups,
pending deliveries and absolute dedup expiries. Obtain the RDB with the selected
authenticated snapshot transport while source writes remain fenced. The existing
migration procedure uses `CLIENT PAUSE 600000 WRITE`, a bounded 240-second
`redis-cli --rdb` capture, then stops the source within that pause window.
A pause alone is temporary, not an enduring fence. If the owner cannot prove
that no newer source writes occurred, discard the candidate for cutover and
repeat capture after restoring the fence. Retain the RDB/checksum outside the
source-volume failure domain. An old source PVC is not proof of the latest state.

For the **offline step**, use a Linux maintenance host with Bash, Node.js and
locked repository dependencies (`js-yaml`), coreutils, `setsid`, `timeout`, and
the actual native `redis-server`, `redis-cli` and `redis-check-rdb` binaries.
`versions.json` selects the destination server version; a different server
version fails admission. Supply these private, explicitly selected paths:

```bash
set -eu
export REDIS_SERVER=/absolute/selected/redis-server
export REDIS_CLI=/absolute/selected/redis-cli
export REDIS_CHECK_RDB=/absolute/selected/redis-check-rdb
# Set SNAPSHOT to the retained absolute RDB path and RDB_SHA256 to its recorded hash.
# NEW_DATA_DIRECTORY must be an absolute canonical path that does not yet exist.
bash scripts/redis-prepare-migration.sh "$SNAPSHOT" "$RDB_SHA256" "$NEW_DATA_DIRECTORY"
(cd "$NEW_DATA_DIRECTORY" && sha256sum --check SHA256SUMS)
```

The tool verifies the snapshot checksum, size and RDB format before creating the
new directory. It loads RDB with AOF disabled on loopback using a random temporary
password, enables AOF, waits for rewrite, persists configuration, then shuts down.
It removes the loaded RDB from the destination and verifies a second startup
from AOF, `appendfsync always` and `noeviction`, followed by clean shutdown.
The input RDB remains unchanged. `REDIS_MIGRATION_MAXIMUM_SECONDS` defaults to
600. Each server start gets a fresh timeout; polling also checks a shared
deadline. This is not a whole-command deadline. Snapshot hashing, RDB checking,
copying, final hashing and synchronization run outside that server timeout.
`REDIS_MIGRATION_MAXIMUM_BYTES` defaults to 21,474,836,480. It bounds input size,
the server's individual file-growth limit and a final aggregate destination check.
It does not cap total temporary disk use during conversion. Reserve headroom
for source, destination, rewrite and temporary files. If the maintenance window
requires a total deadline or capacity ceiling, the owner must supply an
independently bounded procedure and preserve interrupted-state evidence.

Success prints the new directory and produces `migration-receipt.txt` with
`state=aof-restart-verified` and `cutover=not-performed`, plus `SHA256SUMS` for
AOF files and the receipt. Preserve the initial output and verify checksums.
Existing destination, invalid/mismatched checksum, wrong selected version,
invalid RDB, deadline, size, rewrite or restart failure is a stop condition.
An interrupted directory remains visibly incomplete; the tool refuses to
silently overwrite or resume it. Preserve it for diagnosis and choose a fresh
absent destination only after resolving the failure. No source credentials,
Kubernetes mutation or client switch belong to this offline command.

The Redis owner must separately provision and isolate a compatible target,
copy and verify the full AOF manifest/files into a fresh correctly owned volume,
retain the external password authority, and verify the selected server version,
streams/groups/pending state, original absolute dedup expiries, lost-ACK replay
without an extra entry, and a target restart. Render client endpoints and
network policies for the selected release before opening access. Switch clients
last with the old source fenced. Before new target writes, a compatible restore
of the retained snapshot may support rollback; after new writes it is stale.
Fence and capture the new authoritative dataset or fix forward instead of
starting both writers or downgrading AOF in place. A copied directory, checksum
or offline receipt proves neither Kubernetes/CSI durability nor a complete
live restore. Stop before cluster install/cutover without the owners' bound
provisioning, security, verification and rollback procedure.

Source: [offline conversion](https://github.com/datrab/kubeclaw/blob/1e60f5d34c9a599a334a414987a754c95dc3543f/scripts/redis-prepare-migration.sh#L1-L109), [selected version](https://github.com/datrab/kubeclaw/blob/1e60f5d34c9a599a334a414987a754c95dc3543f/versions.json#L1-L147), [persistence policy](https://github.com/datrab/kubeclaw/blob/1e60f5d34c9a599a334a414987a754c95dc3543f/my-values/infra/redis-values.yaml#L1-L29), and [verification fixture](https://github.com/datrab/kubeclaw/blob/1e60f5d34c9a599a334a414987a754c95dc3543f/tests/verification/reliability/redis-migration.test.mts#L1-L86). These are inspected implementation and fixture contracts, not an execution result from this page.

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
| A resume signal exists but no matching `wait.resolved` event exists | Resume was not committed, or stopped before its lifecycle commit | Validate the signal, wait identity, issuer, expiry, snapshot, and event head. Resume only through Nova's owned entry point; do not append the event manually. |
| Administrative decision conflicts with a recorded decision ID or idempotency key | The supplied decision differs from the retained decision | Stop. Preserve both inputs and the complete run journals. Recover the intended run group and reconcile the original decision through the authorized entry point; do not edit the recorded decision or bypass its identity checks. |
| Remote import remains `pending_evidence` | Nova reserved the result but did not finish verified evidence storage | Re-fetch by the same job and digests within the original deadline policy. Never mark the record complete or compact dispatch by hand. |
| Reconciliation quarantine is non-empty | Raw observation was invalid or could not be attributed | Preserve the entry and overflow metadata. Correct the producer or mapping; an observability-required gate remains incomplete. |
| Operator delivery says `outcome: possible` and has no receiver receipt | The external service can have accepted a lost acknowledgement | Stop automatic retry. Query the receiver when supported, or require an operator decision that records the uncertainty. |
| Worker ownership refers to another host | Kernel ownership cannot be proved | Keep admission closed. Recover on the original proved host or perform an explicit abandonment procedure. |
| Worker or Buster store is full | The system cannot retain the promised result | Reject new work. Add capacity or retire only records whose owner proves safe deletion. |
| Prism database exists but an artifact is missing | Backup group is incomplete or storage is corrupt | Keep Prism isolated. Restore a matched database-and-artifact group. |
| LiteLLM data decrypts with neither retained key | Credential authority is incomplete | Do not overwrite encrypted fields. Recover the original master/salt keys or select an older compatible group. |
| Redis is empty after restore | Transport and dedup history is absent | Restore Redis if that history is required, then replay from canonical journals within policy. Do not infer that Nova events were lost. |
| Telemetry sink is missing records | Diagnostic projection is incomplete | Inspect observer checkpoints and canonical events; replay through the owned observer path. |
| Prism quarantine object is absent | The temporary Pod store restarted, expired, or was cleaned | Reacquire the source. Do not create a database or artifact reference for missing bytes. |
| Registry manifest exists but a layer is missing | Registry storage is incomplete or corrupt | Stop release use of that digest. Restore the registry group or rebuild from the exact retained source and build contract, then publish a new verified result. |
| Alloy positions are lost | Collection can reread retained CRI bytes or skip bytes that kubelet already rotated | Keep one collector. Compare source files and Loki time range, then accept documented duplication/gap or restore a known position; do not infer completeness from readiness. |
| OpenClaw SQLite or configuration is corrupt | Gateway-owned host state cannot be trusted | Stop the gateway, preserve the volume, restore the matched group, and run the pinned startup doctor. Do not edit SQLite rows to make health pass. |

## Verification Map and Evidence Limits

| Claim | Repository check | What it does not prove |
| --- | --- | --- |
| Nova journal, effects, snapshots, and recovery | Nova Core state, effect, recovery, and audit tests | Filesystem or volume survival during real node loss |
| Worker store durability and limits | Worker local-runtime, native journal, ownership, spool, and recovery tests | Correct cgroup and disk behavior on every target host |
| Buster admission, evidence, and compaction | Buster runner, storage, remote dispatch, compaction, and evidence tests | Replication or off-node recovery of a deployed runtime root |
| Prism SQL, artifacts, and backup grouping | Prism storage tests, native PostgreSQL tests, artifact durability tests, and deployment backup test | Complete live service restore in an independent cluster |
| LiteLLM database recovery | PostgreSQL recovery renderer and native two-server test | Real LiteLLM image, Kubernetes Secret, CSI, and network-policy recovery |
| Redis durability and migration | Redis durability and version-migration tests with real Redis binaries | Storage-hardware power-loss behavior and live Kubernetes cutover |
| Nova dispatch, import, wait, operator delivery, and reconciliation | Store-boundary, remote-fault, import, operator-delivery, wait, and observability recovery tests | A coordinated off-node restore of every configured root |
| Prism quarantine | Ingestion service and rendered resource tests verify TTL clamping, deletion, and 4 GiB `emptyDir` | Survival across Pod loss; survival is intentionally not provided |
| Registry, OpenClaw, monitoring, and Ops PVCs | Source manifests and chart-render checks establish mounts, sizes, retention settings, and one-writer shapes | Consistent backup, restore, media integrity, live capacity, or accepted RPO/RTO |

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
