# Pipeline Test Gate Phase 7-D Audit

Date: 2026-08-10

## Purpose

Phase 7-D imports a remote Buster result into Nova. Nova then makes the gate
decision. Buster does not make pipeline policy.

## Result verification

Nova verifies:

- The job and request digest.
- The plan ID, digest, and run ID.
- The exact plan-node set.
- Each node, execution, provider, mode, and scope identity.
- Each attempt number and final-attempt relation.
- Attempt, node, and plan-result content digests.
- Attempt, node, and plan-result receipts.
- Cleanup errors and their node ownership.

A changed result with the same job identity is rejected.

## Evidence transfer

Buster exposes evidence only for a completed job. The request identifies the
job and SHA-256 content digest. Buster confirms that the artifact belongs to
the result. It reads only a regular file inside that job directory. It checks
the size and digest before it returns the bytes.

Nova applies a total evidence limit. It checks each size and digest again. It
stores the bytes in its content-addressed durable store before the import is
complete. A restart can continue a pending import without running the tests
again.

## Gate policy

Nova applies these rules:

- A passed blocking test does not block the gate.
- A failed blocking test requests pipeline remediation.
- An advisory failure remains visible and does not block the gate.
- An execution or cleanup error blocks the gate.
- A failed or errored normalized report is a deterministic failure.
- A skipped resolved node does not block the gate.

New resolved plans contain `reviewAgent`. It is `null` unless
`pipeline.json` explicitly declares `review.agent` for that test. A configured
agent receives an evidence-review request only for a provider failure that
needs judgment. Clear report failures and execution errors do not start an
agent.

`NovaRemoteTestGate` is the production handoff. It dispatches the durable job,
imports the terminal status and evidence, and returns the canonical pipeline
stage result. A terminal remote status cannot bypass the importer.

The field is optional in the version 1 wire schema. This keeps old durable
version 1 plans recoverable. The resolver always writes the field for new
plans.

## Durable import

Nova first writes a pending import record. It stores and verifies evidence. It
then changes the same record to complete. The job ID is the idempotency key.
The record contains the full verified remote result, its digest, the request
digest, evidence digests, and the gate-decision digest. Nova can recover all
attempt, report, and finding facts after Buster removes the remote job.

## Proof

`npm run verify:test-gate:remote-import` proves:

- Blocking pass and failure.
- Advisory failure.
- Explicit agent review.
- Normalized report failure.
- Execution and cleanup errors.
- Evidence verification and durable storage.
- Tampered terminal-result rejection.

## Decision audit

- D-003: Nova owns the gate decision.
- D-010: Advisory tests do not block.
- D-011: An agent runs only when the resolved plan declares it.
- D-079: Facts remain separate from policy.
- D-106 and D-107: Results and evidence are durable before authority changes.
- D-109: Report facts are normalized facts, not adapter policy.
- D-110: Nova imports the remote result.
- D-111: Remote import is verified, durable, and idempotent.

## Phase result

Phase 7-D is complete. Phase 7-E can now contain the old suite bridge and
prevent dual authority.
