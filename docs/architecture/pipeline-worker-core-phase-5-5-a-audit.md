# Pipeline Worker Core Phase 5.5-A Audit

Status: complete
Date: 2026-08-05

## Scope

Phase 5.5-A defines the neutral worker messages. It does not execute work. It
does not add a distributed queue.

The contract package is separate from the Buster test-gate contract. Prism,
DeepSec, Buster, and future specialist workers can use the same worker messages.

The package uses a minimum-field rule. A field belongs in the worker contract
only when it is required to execute, recover, or prove one attempt. Features
that can be added later without breaking version 1 remain deferred.

## Implemented Contracts

The package defines:

- Worker lifecycle state.
- Worker profile.
- Worker registration.
- Worker health message.
- Attempt claim and claim generation.
- Immutable attempt envelope.
- Attempt progress event.
- Ordered log part.
- Cancellation request.
- Evidence reference.
- Terminal attempt result.

Specialist input and result data use schema-identified JSON. The worker core
does not know the specialist meaning.

## Checked Rules

The proof checks:

- Exact schema versions.
- Future protocol advertisement with exact v1 attempt selection.
- Unknown-field rejection.
- Stable identities and SHA-256 digest form.
- Fixed worker profiles and protocol versions.
- Valid worker lifecycle states.
- Reconciled worker capacity.
- Matching worker and profile types.
- Positive claim generations and valid claim times.
- Matching embedded claim and attempt identities.
- Capability grants within the selected profile.
- Unique package and input identities.
- Non-negative log sequence numbers.
- Complete terminal result identities.
- Required specialist results for completed attempts.
- Required error details for errored attempts.
- Cleanup-failure propagation.
- Message, cancellation, and immutable-envelope binding.

## Portable Digest Rules

The README defines RFC 8785 JSON canonicalization and SHA-256 rules for worker
profiles, attempt specifications, log parts, and attempt results. Phase 5.5-B
will calculate and verify these digests.

## Trust Boundary

Worker IDs inside messages are not authentication. The contract documentation
requires mutual Nova and worker authentication for distributed operation. Nova
must bind claims and messages to the authenticated worker identity.

Authentication and the distributed queue remain deferred. They are not needed
for the first local attempt executor.

## Proof

Run:

```bash
npm run verify:worker-core:contracts
```

This command validates all eleven JSON contract definitions and type-checks the
TypeScript contract package.

## Completion

Phases 5.5-B through 5.5-D now use these contracts. The complete extraction is
recorded in
[pipeline-worker-core-phase-5-5-audit.md](pipeline-worker-core-phase-5-5-audit.md).
