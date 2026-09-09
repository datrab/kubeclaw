# PCR-OBS-002: next package after Attempt-v2

Read-only source audit at `30e6a4d`; this is scheduling analysis, not new runtime
proof or permission to mutate operational stores. D01/D07 remain unchanged.

## What is actually implemented, and what still fills

| Store / exact consumer | Already releasable | Remaining boundary |
| --- | --- | --- |
| [DurableRecordStore](../../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts), `retire` / `existingRecord` | The statement “no tombstones/deletion API” is stale. Owned v2 records can become payload-free tombstones; resident count and net metadata bytes are freed, duplicate append retains sequence and does not append. | Tombstones and retirement receipts still count against metadata bytes. Generic `read` omits retired payloads and `transition` rejects them: this primitive cannot be applied indiscriminately to consumers that require old payloads. |
| [Telemetry operator](../../../../scripts/retire-telemetry.mjs) and [adapter](../../../../skills/common/plugins/telemetry-store/src/adapter.ts) | Existing manual `delete-telemetry-projections` uses that primitive for explicit run-owned telemetry, holding the run/store fences and retaining canonical run history. | This is the actual connected production-domain retirement caller; it is not a universal RecordStore GC. Historical ownerless records are not guessed into a run. |
| [Admission and outbox](../../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts) | Admission completion projection frees resident entry count/bytes and preserves exact raw record/cursor/ACK through the original Attempt authority. Outbox `compact` removes acknowledged copies. | Admission refs, gaps/quarantine and metadata remain finite; other records have no general release operation. No production `FileProducerOutbox` construction or `compact()` caller was found under `skills`/`scripts`; do not present wiring it as the known live bottleneck. |
| [Attempt store](../../../../skills/common/plugin-runtime/foundation/observability/durable-attempts.ts) | New imported-result projection releases one resident result payload/count slot; original expiry cleanup releases only result-unreferenced staging evidence. | Full completion intents, closures, evidence objects/bytes and reference metadata remain. No completed-history release covers their quotas. |
| [Artifact adapter](../../../../skills/common/plugins/artifact-store/src/adapter.ts) | Content-addressed duplicate puts reuse existing blobs; bounded metadata is committed before a new blob, allowing same-request recovery after a crash. | Record count/metadata and aggregate blob bytes have no retirement caller. `findArtifact` needs old metadata, exact refs and bytes; `get_latest` selects producer run. Blobs can be shared across records/runs. Generic tombstones would make reads disappear. |
| [Buster jobs](../../../../skills/buster/engine/test-gates/remote-plan-service.ts) | Existing `compactCompletedArchive` removes embedded archive bytes only after validating retained source and all result/evidence dependencies. | `records()` still includes compact jobs, so both record-count quota and admission's sum of result sizes/reservations remain occupied. Result/evidence blobs remain. `accept`, status/result/evidence routes and recovery require the retained job. Deleting a record before teaching all these consumers about retirement risks a duplicate executing again. |
| [Nova dispatch](../../../../skills/nova/core/test-gates/remote-dispatch.ts) / [gate imports](../../../../skills/nova/core/test-gates/remote-result-import.ts) | No connected retirement found. | Dispatch retains full archive both inside job metadata and as a blob; imports retain full decision/result plus evidence blobs. `load`, `readVerifiedResult`, `readExecutionGraphs` and import replay require these authorities. |

Other users of the same RecordStore—state history, wait/continuation and operator
delivery receipts—are not interchangeable telemetry. For example,
[operator delivery](../../../../skills/common/plugins/operator-messaging/src/delivery-records.ts)
reads request/reservation/receipt records before transmitting and binds handoff
lookup to their original owner. Removing those payloads merely because a run is
terminal would remove its no-repeat/uncertainty guard.

## Smallest next connected implementation candidate

Inspect and test an explicit **Nova dispatch archive projection**, not generic
history deletion. `persistBeforeDispatch` currently stores the full base64
archive in `remote-plan-jobs` and then the same bytes in BlobStore; `load` even
recreates a missing blob from that full record. A bounded new persisted variant
could replace only the redundant embedded archive after the real canonical blob
is durably present and verified, preserving the complete reconstructed job,
request digest and original source attestation. Keep the blob; do not trade this
for deleting the last source copy or moving uncharged data into a sidecar.

The minimum package is coupled: versioned dispatch record, original load/replay,
read-only inventory, writer-fenced manual transition, genuine retained terminal
import/source binding, and small-quota real Store/Core/HTTP tests. Cover old v1
metadata-before-blob crash recovery, missing/corrupt/foreign blobs, active/waiting
owners, exact duplicate dispatch after restart, source/request mismatch, stale
CAS, competing writers and actual process death. Removing a `data` property
alone is not the implementation. This candidate frees metadata bytes only, not
job-record count or aggregate unique source bytes. No Kubernetes/provider run is
intrinsically needed to prove this precise storage transition.

## Authority still absent for full-history release

Retaining an unbounded set of unique original bytes and all reopening rights
cannot free the corresponding finite byte quota. D07 permits explicit manual
cleanup, not automatic TTL-based log loss. A full-history operation therefore
needs an actual selected disposition (manual diagnostic cleanup or explicit
project deletion as applicable), durable consumer completion, shared-reference
closure and an atomic retirement record honored by **every** reopen/accept/read
path. Today no such common end-of-reopening authority exists. A terminal event,
an import result, a Clawdeck view/cursor or a Demo TTL is not that disposition.

This is an absent connected protocol/implementation, not an invented native
infrastructure gate. Building the manual protocol remains distinct from running
cleanup on real user data; this repair task does not authorize the latter.
Keep PCR-OBS-002 open until its original mixed-active/completed quota and replay
acceptance is actually met for the claimed connected release scope.
