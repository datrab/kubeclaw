# Buster disposable run storage

Status: implemented
Audience: operator, maintainer
Owner: Buster runtime maintainers
Evidence: skills/buster/engine/test-gates/run-retention.ts; tests/verification/reliability/buster-run-retention.test.mts
Applies to: Buster remote plan runtime and Nova verified import
Last verified: generated during publication

Buster no longer uses one historical JSON journal. Every run has an atomic
`stateRoot/jobs/<SHA256(jobId)>/run.ndjson`: a bounded first-line status header and
a second-line, integrity-checked native record/source input. Native result blobs
live below that same run directory. Native execution inputs, logs and evidence
remain in `runtimeRoot/<SHA256(jobId)>`; collection removes both locations.
Status, admission lookup, census and recovery do not parse other runs' archives.
Global admission/capacity fences protect quotas and concurrent state transitions.

## Operator switch

Generated runtime config accepts exactly one of:

```json
{"retention":{"mode":"delete_after_delivery"}}
```

```json
{"retention":{"mode":"retain_days","days":14}}
```

`delete_after_delivery` is the default. In the runtime container select it with
`BUSTER_V2_RETENTION_MODE=delete_after_delivery`, or choose
`BUSTER_V2_RETENTION_MODE=retain_days` and `BUSTER_V2_RETENTION_DAYS=1..14`.
Fractions, zero, larger values and unknown modes are rejected before startup.
Production `my-values/buster-values.yaml` explicitly selects the default.
Days are UTC 24-hour durations from the terminal transition, not from delivery.
Unacknowledged terminal data also expires after fourteen days.

## Delivery and replay

Sending an HTTP response is not delivery confirmation. Nova first verifies the
bound result and every artifact, durably stores the complete import, then POSTs
`/v1/plan-jobs/:jobId/delivered` with the exact request and result digests. Existing
bearer/SPIFFE authentication applies. Wrong identities or nonterminal jobs cannot
be acknowledged. A lost ACK response is retried using the verified local import;
it does not fetch deleted remote data and does not execute a new test.
Old servers without this endpoint remain compatible; they do not gain deletion
semantics merely because a new client attempted an ACK.

Before deleting payloads, Buster commits a small replay receipt containing IDs,
digests, terminal status and timestamps, but no plan, archive or log/error text.
The receipt remains for fourteen days after payload deletion; it is not a permanent history. During that
window identical submission returns the old terminal status, conflicting inputs
are rejected, and deleted payload access reports HTTP410. After the replay window
old idempotency keys must not be reused for new work.

## Collection and ownership

Collection runs at startup, every sixty seconds and after delivery confirmation.
An actual active execution always wins over retention. Completion and proven
quiescence are committed together in one atomic record. Clean cancelled runs and
failures before provider invocation also carry that proof. A restarted running
job or failed cleanup is not proof of process termination: these runs are held
and reported through `buster.retention`/`buster.retention.failed` until ownership
is reconciled. Never delete live inputs merely to satisfy an age threshold.
The compact replay receipt is durable before recursive removal, so interrupted
collection can resume without restoring execution authority. Temporary receipt
writes from an interrupted process are removed under the maintenance fence.

## Explicit legacy discard

The former `records/store.json` is not silently ignored. Normal startup rejects
it. For this Raven-authorized cutover, production explicitly sets
`BUSTER_V2_DISCARD_LEGACY_JOURNAL=1`; the chart already uses Recreate, so the old
runtime is stopped before the new runtime prepares storage and opens its API.
The reset acquires the old admission and record writer fences, streams one bounded
native record at a time, and vetoes accepted/running/cancelling jobs or malformed
history. Small terminal replay receipts are committed before unlink and directory
fsync. It does not keep another full copy of the discarded journal. A partial
receipt write can be retried; conflicting receipts or a mixed new/old layout veto
the reset. Existing separate legacy artifact trees are not silently erased by
this journal-only reset.

Tests: `node --test tests/verification/reliability/buster-run-retention.test.mts`
plus existing shutdown, compaction, HTTP runtime and verified-import contracts.
