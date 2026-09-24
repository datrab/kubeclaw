# Pipeline Worker Core Phase 5.5-B Audit

Status: complete
Date: 2026-08-05

## Scope

Phase 5.5-B adds the neutral executor for one immutable worker attempt.

It does not schedule plan nodes. It does not apply dependencies, retries, test
mode, suite policy, or Nova gate policy.

## Implemented Boundary

The neutral executor owns:

- Worker-envelope and digest validation.
- Queue-deadline rejection.
- Attempt timeout and cancellation.
- Ordered log parts and the log-byte limit.
- Specialist-result size limits.
- Evidence count and byte limits.
- Required hard-limit preparation by the isolated operation adapter.
- CPU, memory, and process measurement checks after execution.
- Optional attempt cleanup with a separate cleanup limit.
- Resource facts.
- Worker result digests and receipts.

The specialist operation owns the meaning of its work. It returns typed
specialist data and stored evidence references. Before execution, it must
prepare its isolation boundary with the exact limits from the attempt. Phase
5.5-C connects this call to the existing provider process boundary.

## Simplicity Check

The executor accepts one envelope and returns one result. It has no queue,
worker registry, suite resolver, retry loop, dependency graph, or gate logic.

No new worker-contract fields were added. This follows D-104.

## Architecture Check

- D-096: the executor is neutral and has no Buster types.
- D-097: one immutable attempt is the unit of work.
- D-100: timeout, cancellation, and local limits are enforced per attempt.
- D-101: results, ordered logs, and evidence references remain separate.
- D-102: the selected profile and protocol are verified by digest.
- D-103: the implementation is TypeScript and uses JSON contracts.
- D-104: only attempt lifecycle data appears in the executor interface.

Distributed queue claims, authenticated transport, worker registration,
heartbeats, draining, and reassignment remain outside this phase.

## Proof

Run:

```bash
npm run verify:worker-core:attempt-executor
npm run verify:worker-core:contracts
npm run verify:test-gate:plan-runner
```

The proof covers success, digest rejection, queue expiry, timeout,
cancellation, an already-cancelled request, ordered logs, log limits, result
limits, evidence limits, resource limits, cleanup, full-log storage, result
digests, and receipts.

A queue-expired attempt returns zero resource use without calling the operation
adapter. The operation was never prepared or started. Calling its measurement
path could create or inspect work after Nova's queue deadline.

The unchanged Buster runner proof confirms that this phase does not change
current test behavior.

## Independent review

Independent review used only `gpt-5.6-terra` with high reasoning.

Accepted findings led to focused fixes for:

- Cancellation through cleanup and finalization.
- Late and excessive log parts.
- Large log-write splitting and terminal log markers.
- Synchronous preparation and post-preparation deadline checks.
- Immutable result, resource, and evidence snapshots.
- Portable canonical JSON and digest verification.
- Claim time, ownership, and renewal rules.
- Bounded termination before a cancelled result.
- Invalid Unicode and non-JSON values.
- Standard aggregate proof coverage.

Two findings were rejected:

- RFC 8785 key sorting uses UTF-16 code units. The implementation and proof
  use that required order.
- The main attempt timer is cleared before cleanup. Cleanup uses its own
  bounded timer and failure result.

Final result:

```text
independent review clean: no accepted/actionable findings reported
```

## Phase 5.5-C Boundary

Phase 5.5-C creates the Buster specialist adapter. It moves provider loading,
provider-result validation, evidence-file collection, and provider cleanup
behind the neutral attempt executor while keeping Buster scheduling unchanged.
