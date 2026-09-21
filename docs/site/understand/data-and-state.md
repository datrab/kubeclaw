# Data and State: What Must Survive

Status: implemented with stated retention and disaster-recovery limits
Audience: platform operator, runtime developer, data owner, incident responder
Owner: state-owning component maintainers
Evidence: skills/nova/core; skills/worker/core; skills/buster/engine; skills/prism; charts/prism; gitops/platform; scripts/postgresql-recovery.sh; scripts/redis-prepare-migration.sh
Evidence revision: `32b02816cc19cc8865a45b221b8b6ca28e99e8fb`
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
| Nova resume signals | Hash-chained `resume-signal.v2` records | `<runRoot>/signals.jsonl` | The authenticated resume entry writes; wait validation and run recovery read | The journal lock serializes append. Wait ID, signal type, issuer, nonce, issue time, expiry, and signature bind a signal to one unresolved wait. `wait.resolved` in the event journal prevents reuse. | No expiry-based file deletion or count quota. Back up and restore with the run. A bad signal record or missing matching event blocks resume. Retire only with the complete terminal run. |
| Nova administrative decisions | Hash-chained `administrative-reopen-decision.v1` records | `<runRoot>/administrative-decisions.jsonl` | An authenticated operator or administrator submits a decision; reopen and repair recovery read it | Journal append is serialized. Decision ID, principal, reason, run, stage, action, and expected journal head fence a decision against another history. The causal lifecycle event proves application. | No automatic expiry or capacity quota. Back up with events. On corruption or a head mismatch, stop administrative continuation. Do not reconstruct a decision from an event. Retire only with the complete terminal run and its audit obligation. |
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
| Buster evidence and reports | Immutable evidence bytes plus `ArtifactRefV1`, attempt/node results, normalized report results | `<artifactRoot>/sha256/...`; temporary collection under `<artifactRoot>/.staging` | Providers stage files; Buster verifies and publishes; report adapters and Nova read by reference | Containment checks, file and byte limits, media type, content digest, size, evidence ID, and result signature | Raw evidence and normalized report facts can both be required. There is no repository-wide automatic garbage collector or remote backup scheduler. Preserve referenced objects with results. |
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

> **Source evidence — the common file-store guarantees**
>
> [The file journal validates and hash-chains records under its file lock](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/core/state/journal.ts#L21-L80).
> [Its append and refresh paths synchronize writes and truncate only an incomplete final line](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/core/state/journal.ts#L136-L195).
>
> [The durable-record store enforces per-record, record-count, and total-byte limits and uses idempotency plus payload digests](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugin-runtime/foundation/observability/durable-records.ts#L56-L115).
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
> access modes and sizes](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/kubeclaw/templates/pvc.yaml#L1-L48).
> [The Buster state claim enforces one writer and `ReadWriteOnce`](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/kubeclaw/templates/buster-runtime-pvc.yaml#L1-L21).
> [The runtime starts rootless BuildKit with an explicit state root](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/docker/buster-runtime-entrypoint.sh#L7-L34).
> [The image sets that root below the builder home directory](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/docker/Dockerfile.buster-runtime#L127-L148),
> while [the deployment mounts only the workspace, Buster state, credentials,
> and cgroup subtree and declares its shared ephemeral-storage budget](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/my-values/buster-values.yaml#L145-L174).
>
> [The direct registry requires an explicit `ReadWriteOncePod` claim and disables
> deletion and upload purging](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/my-values/infra/registry-local.yaml#L1-L34).
> [The GitOps registry profile is explicitly ephemeral](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/gitops/platform/registry-local/resources.yaml#L1-L36).
> [The mirror has a 5 GiB claim and Docker Hub proxy endpoint](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/my-values/infra/registry-mirror.yaml#L14-L55).
>
> [Prometheus retains 15 days on 20 GiB, while Grafana uses 5 GiB and an external
> administrator Secret](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/gitops/platform/values/prometheus.yaml#L3-L50).
> [Loki uses one filesystem-backed 20 GiB replica with 720-hour retention](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/gitops/platform/values/loki.yaml#L1-L33).
> [Alloy stores positions on the node and imports the legacy Promtail position
> file](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/gitops/platform/values/alloy.yaml#L8-L29).
> [The Ops workload defines its two claim templates and optional Tailscale state
> claim](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/ops-pod/templates/workload.yaml#L137-L176).

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
> [Run-root selection validates the ID, uses a SHA-256 path, and verifies a legacy directory through its journal](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/core/execution/run-root.ts#L62-L76).
>
> [Snapshot publication writes a private temporary file, synchronizes it, links it without replacement, and synchronizes the directory](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/core/execution/engine-snapshots.ts#L75-L121).

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
> [The effect journal stores request, acceptance, receipt, and content-addressed large-result references](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/core/effects/journal.ts#L13-L25).
>
> [Large results use private temporary files, immutable publication, directory synchronization, size checks, and digest checks](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/core/effects/journal.ts#L146-L205).

### Signals, administrative decisions, and remote gates

A resume signal and an administrative reopen decision are independent inputs.
Nova retains each input in its own hash-chained journal. The event journal then
records the lifecycle transition that applied it. Keep both sides. The input
proves what an authorized principal requested; the event proves what the state
machine committed.

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
> a signal after the event journal records wait resolution](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/core/execution/engine-run.ts#L58-L117).
> [Administrative apply checks the expected journal head and decision identity
> before it appends a causal lifecycle event](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/core/execution/engine-admin.ts#L35-L82).
>
> [Remote production composition gives dispatch and import distinct roots and
> bounded record/blob stores](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/core/test-gates/production.ts#L87-L121).
> [Dispatch persists the validated job before its archive and verifies that blob
> on every load](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/core/test-gates/remote-dispatch-store.ts#L27-L71).
> [Import reserves pending state before blobs and makes a digest-guarded terminal
> transition only after all evidence is stored](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/core/test-gates/remote-result-import.ts#L154-L199).
>
> [Nova persists the reconciliation plan and constructs bounded attempt,
> admission, and journal stores during recovery](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/core/observability/reconciler.ts#L338-L395).

### Wait and operator-message projections

The wait adapter makes a `wait-request.v2` discoverable outside the event
journal. The operator-message adapter retains the exact outbound request and an
attempt reservation before transport. It then replaces the reservation with a
receipt or a bounded failure. These stores support human interaction, but they
do not own the lifecycle decision. A lost acknowledgement without receiver
lookup leaves delivery uncertain, so retry stops instead of sending another
unbound message.

> [The wait adapter validates identity and issuer, applies bounded store defaults,
> and uses idempotent append](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/wait-store/src/adapter.ts#L141-L200).
> [Wait create and read use the `waits/all` stream and preserve the original
> idempotency key](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/wait-store/src/adapter.ts#L202-L240).
>
> [Operator-message configuration bounds target payloads, records, and total
> delivery bytes](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/operator-messaging/src/config.ts#L45-L104).
> [The delivery store reserves before transport and blocks an uncertain retry
> when receiver receipt lookup is absent](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/operator-messaging/src/delivery-records.ts#L31-L57).
> [A terminal receipt uses a digest-guarded transition and resolves a concurrent
> accepted result](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/operator-messaging/src/delivery-records.ts#L60-L88).

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
> and attempt identity](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/worker/core/worker/native-attempt-journal.ts#L18-L77).
> [It validates process completion and sealed-result transitions](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/worker/core/worker/native-attempt-journal.ts#L78-L131).
>
> [Admission counts retained bytes and outstanding reservations before it writes the accepted envelope](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/worker/core/worker/native-attempt-journal.ts#L162-L183).
>
> [The ownership store validates host, boot, owner, and generation identity](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/worker/core/worker/ownership-store.ts#L50-L109).
> [Its transitions apply revision checks and configured record and byte limits](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/worker/core/worker/ownership-store.ts#L110-L169).
>
> [The output spool uses private files, exclusive no-follow creation, bounded append, and per-write synchronization](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/worker/core/worker/native-output-spool.ts#L13-L68).

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
> [The remote job store configures bounded records and content-addressed result
> blobs](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/buster/engine/test-gates/remote-plan-service.ts#L52-L111).
> [Admission validates and reserves the accepted job before execution](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/buster/engine/test-gates/remote-plan-service.ts#L112-L164).
>
> [Execution derives one SHA-256 job directory under `runtimeRoot` and separates its workspace, artifacts, and observability roots](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/buster/engine/test-gates/remote-plan-service.ts#L337-L370).
>
> [Runner construction separates artifact, observability, attempt, admission, and report-adapter roots and rejects overlapping trust roots](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/buster/engine/test-gates/runner.ts#L667-L726).
>
> [Evidence staging enforces containment, duplicate-file rejection, count, and byte limits before immutable storage](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/buster/engine/test-gates/artifacts.ts#L24-L83).
>
> [Remote compaction verifies the completed job, source identity, archive digest, and retained result artifacts](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/buster/engine/test-gates/remote-plan-compaction.ts#L90-L149).

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
> [Prism migration uses one reserved connection, a transaction, an advisory lock, ownership checks, and a filename journal](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/prism/storage/index.ts#L21-L74).
>
> [The artifact store publishes digest-addressed files without replacement and verifies every read](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/prism/storage/artifacts.ts#L8-L67).
>
> [The backup program dumps the database, copies immutable artifacts, writes checksums and metadata, and publishes the complete group atomically](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/prism/files/prism-backup.sh#L58-L117).

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

> [Ingestion clamps the TTL and reaps digest-named files](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/prism/server/ingestion.ts#L12-L20).
> [It writes an acquired object before returning its digest](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/prism/server/ingestion.ts#L21-L79).
> [The chart mounts a 4 GiB quarantine-only `emptyDir` and passes the configured
> TTL](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/prism/templates/ingestion.yaml#L22-L39).

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
> [The deployment enables database-backed model storage and obtains database and encryption settings from Secrets](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/my-values/infra/litellm-deployment.yaml#L21-L50).
>
> [The production PostgreSQL values select the LiteLLM database, external Secret, standalone mode, and 20 GiB persistent volume](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/my-values/infra/postgresql-values.yaml#L1-L19).
>
> [The recovery script validates the source and publishes a custom-format dump
> with checksums and metadata](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/scripts/postgresql-recovery.sh#L56-L95).
> [Verification checks the file set, checksums, selected application and
> credential binding, version, age, and archive](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/scripts/postgresql-recovery.sh#L101-L129).
> [Restore rejects the source server and a nonempty target, then uses one
> error-stopping transaction](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/scripts/postgresql-recovery.sh#L141-L156).

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
> [The Argo CD PostgreSQL values request 1 GiB](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/gitops/platform/values/postgresql.yaml#L1-L23), while [the direct production values request 20 GiB](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/my-values/infra/postgresql-values.yaml#L1-L19).
>
> [The Argo CD Redis values request 2 GiB and omit an explicit persistence-policy block](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/gitops/platform/values/redis.yaml#L1-L19).
>
> [The direct profile declares strict AOF, no eviction, and 20 GiB](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/my-values/infra/redis-values.yaml#L1-L27).

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
> [The adapter validates endpoints and bounds, limits payloads to 1 MiB, and performs stream append plus deduplication in Lua](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/redis-transport/src/adapter.ts#L28-L87).
>
> [The selected production values enable strict AOF, disable eviction, set 1 GiB Redis memory, and request a 20 GiB PVC](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/my-values/infra/redis-values.yaml#L1-L27).

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
| OpenClaw agent | One config PVC and one workspace PVC for the same agent; independent Secrets and committed Git remote remain outside the group | Scale that agent to zero; ensure startup doctor and Git init are not running | Restore config and workspace to private claims; restore Secrets from their own authority; run the pinned startup doctor; verify gateway and exact repository state | No automated backup, checksum manifest, restore test, RPO, or RTO |
| Registry | Registry filesystem plus an inventory of retained manifests/digests and the independent client configuration | Stop pushes, garbage collection, and registry writer | Restore to an empty compatible registry; verify manifest and layer digests; perform a real pull; switch clients last | No repository backup/restore; Argo-adopted local registry has no persistent data to restore |
| Monitoring | Prometheus TSDB, Loki store, Grafana state, and optional Alloy positions are separate groups; do not combine inconsistent live copies | Use each product's snapshot boundary or stop its writer | Restore Loki and Prometheus, then Grafana; restore positions only when their source CRI files and cutover point are known | No repository backup/restore test; metric/log loss must not block product recovery |
| Ops | Home and workspace claims; optional Tailscale state is a separate sensitive group | Scale the StatefulSet to zero and revoke external sessions if compromise is suspected | Restore home/workspace privately; prefer new Tailscale authentication after loss; verify that bearer, GitHub, Kubernetes, and tailnet credentials come from current external authorities | No automated backup or restore test; never clone one Tailscale device state to concurrent writers |

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
| Administrative decision expects another journal head | The decision belongs to a different run history | Reject it. Recover the intended journal or issue a new authenticated decision against the current verified head. |
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
