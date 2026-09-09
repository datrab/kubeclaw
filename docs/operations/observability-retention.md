# Observability retention and operator cleanup

Disk and Git logs remain until the operator explicitly requests their cleanup.
There is no automatic log expiry. Code, final reports, decisions and acceptance
history remain until explicit project deletion. Runs waiting for a decision keep
the evidence needed for inspection and continuation. These are the approved
[D01/D07 rules](../review/remediation/decisions.md); D09 separately requires durable
worker recovery independent of Clawdeck. The seven-day demo namespace/exposure
lifetime in D06 does not expire logs or run history.

Clawdeck owns central log collection. Existing local journals, artifact files,
result records and delivery state retain their own recovery responsibilities.
A displayed Clawdeck event or an observer delivery acknowledgement does not prove
that every required source artifact is durably archived or authorize its deletion.
No Clawdeck-internal deletion interval is established by the approved decisions.

## Existing roots and capacity limits

Resolve roots from the running configuration and exact run/job identity. A name
that resembles a run directory is insufficient ownership evidence. Limits below
are embedded defaults, not claims about actual free disk capacity or configured
PVC sizes. MiB/GiB denote powers of 1024.

| Owner and root | Stored data and current bounds | Capacity consequence |
| --- | --- | --- |
| Nova `platform.storageRoot/runs/v2-<sha256(runId UTF-8)>` | `events.jsonl`, `observer-checkpoints.jsonl`, `observer-deliveries.jsonl`, administrative decisions, signals and graph/registry snapshots. `FileJournal` has no retention deadline or total-byte quota. A legacy directory may be selected only after its event identity is verified by `runRoot()`. | Filesystem/inode exhaustion stops writes; deleting a prefix breaks the journal sequence/hash chain. |
| Nova `<runRoot>/observability/admission/admission.json` | Up to 1,000,000 admitted records and 4 GiB snapshot bytes; ingress 16 MiB; quarantine 10,000 records/1 GiB within the enclosing snapshot budget. | `OBSERVABILITY_ADMISSION_FULL`; confirmed history has no admission compaction API. |
| Nova `<runRoot>/observability/attempts` | `attempt-store.json` plus evidence blobs: 100,000 evidence objects, 10 GiB aggregate evidence, 1 GiB per object, 100,000 results, 100,000 closures and 1 GiB metadata. | Evidence, result, closure or metadata writes fail explicitly at their respective limits. |
| Buster `<runtimeRoot>/<sha256(jobId)>/observability` | Remote-plan job directory resolved by the service, with `admission` and `attempts` subdirectories. Admission: 10,000 records/256 MiB, ingress 16 MiB, quarantine 1,000 records/64 MiB. Attempts: 10,000 evidence objects/results/closures, 10 GiB evidence, 1 GiB per object, 256 MiB metadata. Injected stores must match the configured directories. | The same explicit admission/attempt capacity failures; a terminal job directory is not automatically deletable. |
| Buster configured `artifactRoot` (remote jobs: `<jobRoot>/artifacts`) and remote job-store root | Original diagnostic files and reports; the remote store separately retains job identities and result blobs. Store ownership and limits come from the service/adapter configuration, not the demo namespace. | Preserve referenced result/artifact identities when diagnosing per-job storage. Removing the job directory does not retire shared job records. |
| Artifact adapter configured `artifactRoot` | `records/store.json` metadata defaults to 100,000 records/256 MiB; content-addressed blobs have a separate 256 MiB aggregate bound and 16 MiB individual default. | `DURABLE_RECORD_STORE_FULL` or `DURABLE_BLOB_STORE_LIMIT_EXCEEDED`; an individual oversized blob fails separately. |
| Telemetry adapter configured `root` | `records/store.json`, stream `telemetry/plugin-events`: 100,000 records/256 MiB by default, 1 MiB per record. This is a telemetry projection, not a second canonical log archive. | `DURABLE_RECORD_STORE_FULL` or `TELEMETRY_RECORD_SIZE_EXCEEDED`; no automatic ring buffer or deletion. |

Source owners: [Nova run-root resolution](../../skills/nova/core/execution/run-root.ts),
[Nova runtime journals](../../skills/nova/core/execution/engine-runtime.ts),
[Nova reconciliation limits](../../skills/nova/core/observability/reconciler.ts),
[Buster runner limits](../../skills/buster/engine/test-gates/runner.ts),
[Buster remote job storage](../../skills/buster/engine/test-gates/remote-plan-service.ts),
[artifact adapter](../../skills/common/plugins/artifact-store/src/adapter.ts),
and [telemetry adapter](../../skills/common/plugins/telemetry-store/src/adapter.ts).

For a read-only capacity check, use the resolved configured root, for example:

```bash
OBS_ROOT=/absolute/configured/root
realpath -- "$OBS_ROOT"
df -h -- "$OBS_ROOT"
df -i -- "$OBS_ROOT"
du -sh -- "$OBS_ROOT"
```

Record the affected root, exact run/job IDs, configured limits, snapshot/file
sizes, free bytes/inodes and original error code in the operator diagnosis.
Inspection of shared store records must preserve their run/job/attempt identities;
an aggregate directory size does not establish which records can be retired.
Reading a Nova `FileJournal` through its runtime class can repair an incomplete
append tail, so use ordinary filesystem inspection when read-only measurement is
required. Tail repair is not historical compaction.

At a quota failure, do not submit additional work to the affected store until the
operator has resolved the capacity condition. Retain the original failed result
and pending delivery/recovery state. Repeated retries do not create capacity.
Changing a quota alone postpones exhaustion and does not supply a safe release
operation. This document requests no new capacity and performs no cleanup.

## What existing cleanup actually does

The producer outbox exposes explicit `compact()`: it removes acknowledged local
copies only after a matching durable admission acknowledgement was recorded.
It neither compacts admission nor proves Clawdeck consumer completion. No
production invocation of this method was found in the inspected source.

The attempt store's `reclaimExpiredEvidence` removes staging evidence older than
its one-hour configured age only when no committed result references it. It does
not retire confirmed results, closures or run history. Its staging-age test is
not a general proof that an active/waiting run no longer needs an artifact.

Buster's existing `cleanupTerminalWorkspace` removes only `repository.tar.gz`,
`workspace/repository`, and `workspace/test-provider-snapshots` from its terminal
job. It preserves workspace diagnostics, scratch, evidence, artifacts,
observability and durable records. These reproducible input copies are distinct
from D07 retained logs.

The [durable record/blob interfaces](../../skills/common/plugin-runtime/foundation/observability/durable-records.ts)
provide append/read/transition and put/get, respectively. They expose no
run-retirement or tombstone operation. The
[Clawdeck observation view](../../skills/common/plugin-runtime/foundation/observability/clawdeck-view.ts)
projects admission/attempt state with cursors and completeness; it is not a durable
consumer checkpoint or storage-deletion acknowledgement.

## Required manual retirement contract — not yet implemented

PCR-OBS-002 remains partially addressed: policy is decided, but a safe capacity
release operation is missing. There is currently no supported command that
selectively deletes confirmed history from these stores. Do not edit
`store.json`, `admission.json`, `attempt-store.json`, journal prefixes or referenced
blob files to make quota space. That would remove sequence, digest, result or
idempotency facts without the required retirement transition.

A future manual operation must produce a reviewable plan naming the operator,
project/run/job IDs, canonical roots, affected bytes and every cross-store
reference. Active, waiting, administratively reopenable and externally uncertain
work stays protected. An explicit decision to end future continuation must be
recorded before any of its required data can be released. Final project reports,
code, decisions and acceptance history remain protected until project deletion.

Execution must hold the existing writer/run fences, recheck the planned identities
and digests, and require durable consumer completion plus an independently checked
archive of retained material. Producer admission ACK alone is insufficient. Shared
artifact/result references must remain valid. Permanent retirement/idempotency
facts must survive outside the released portion so late deliveries and retries
cannot recreate work or repeat an external action. Recovery, archival state and
byte release must tolerate a crash at each boundary and report exactly what was
retained or released. Unknown references or missing consumer evidence keep the
plan non-executable.

Acceptance requires small real store quotas with completed and active runs mixed,
old delivery replay, pending/uncertain jobs and crashes at retirement boundaries.
Only explicitly retired data may be released; surviving runs must recover with
their original evidence and late deliveries must not execute again. This is a
separate functional slice, not a new central log store or an automatic TTL.
