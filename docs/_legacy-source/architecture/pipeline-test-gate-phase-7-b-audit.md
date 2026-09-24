# Pipeline Test Gate Phase 7-B Audit

Date: 2026-08-10

## Purpose

Phase 7-B defines the immutable remote job contract. It also gives Nova a
durable pre-dispatch store.

## Contracts

The test-gate contract now defines:

- `buster-plan-job.v1`
- `buster-plan-status.v1`
- `buster-plan-result.v1`
- `repository-archive.v1`

The job contains the resolved plan, exact grants, maximum concurrency, and the
repository archive. The request digest covers all job fields except the digest
field itself.

The archive uses a SHA-256 digest over the decoded bytes. Validation rejects a
changed digest, size, encoding, or payload.

The terminal result contains all attempt results, node results, cleanup errors,
the plan and run identities, a result digest, and a receipt.

## Durable Nova record

`FileNovaRemotePlanStore` writes the complete plan job to the shared durable
record store before it writes the content-addressed archive copy. The complete
record permits recovery if the process stops between these writes. The store
restores a missing content-addressed copy from the digest-bound job record.

The record write also resolves idempotency before blob storage. A conflicting
request cannot fill the blob store with unreachable archive objects.

The store reconstructs and validates the exact job before dispatch. The same
job can be stored more than once. A different job with the same identity is
rejected.

This order is mandatory:

1. Resolve and freeze the plan.
2. Build and digest the repository archive.
3. Store the archive and dispatch record.
4. Read and validate the stored job.
5. Send the job.

## Bounds

- The caller sets the maximum archive size.
- The durable blob store has a total byte limit.
- The durable record store has record, record-size, and total byte limits.
- The contract limits plan nodes, results, grants, and concurrency.

## Decision audit

- D-072: The job carries `resolved-test-plan.v1` without a second plan model.
- D-078: Original evidence and artifacts remain durable.
- D-085: Provider and report-adapter identities remain digest-bound.
- D-097: Attempt results remain the execution unit inside the plan result.
- D-106: The new store uses the shared durable record and blob boundary.
- D-110: Nova can now persist the complete immutable job before dispatch.

## Verification

`check-pipeline-remote-plan-contracts.mts` proves:

- Valid job, status, and result contracts.
- Request-digest rejection after job changes.
- Archive-digest rejection after byte changes.
- Durable store round-trip.
- Idempotent duplicate storage.
- Conflicting job rejection.
- Terminal status rules.

## Phase 7-B result

The remote contract and pre-dispatch storage are complete. Phase 7-C can add
the authenticated Buster service and reconnect-safe dispatcher.
