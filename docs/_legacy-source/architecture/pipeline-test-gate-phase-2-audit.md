# Pipeline Test-Gate Phase 2 Audit

Status: complete
Audit date: 2026-08-05

## Purpose

This audit checks the first version of the shared test-gate contracts.

It checks the contracts against:

- The accepted design decisions.
- The implementation plan.
- The existing roadmap constraints.
- The TypeScript types.
- The contract verification test.

## Defects Found and Corrected

### Attempt and Final Result Were Mixed

The first schema used one result for both an execution attempt and the final
test result.

This did not work for retries. It also required a false attempt for a skipped
test.

The corrected contract has:

- `attemptResult` for one provider attempt.
- `nodeResult` for the final result after retries or a skip.

### Fixture Results Were Missing

The first result required a test mode. A fixture has no blocking or advisory
mode.

The corrected attempt result supports tests and fixtures. A fixture uses a
null mode and can return typed outputs.

### Typed Outputs Were Missing

The first provider registration declared outputs. No result could return those
outputs.

The corrected attempt result returns named value or artifact outputs.

### Links Were Not Fully Typed

A value link could omit its schema. An artifact link could omit its media type.

The corrected contract requires:

- A schema ID for each value port and value link.
- At least one media type for each artifact port.
- A media type for each artifact link.

### Retry Safety and Variations Were Missing

The first provider registration did not declare retry safety or supported
matrix fields.

Both declarations are now required.

### Error Evidence Was Missing

The first evidence policy defined only pass and fail evidence.

The corrected policy also defines evidence for execution errors, cancellation,
and time limits.

### Granted Access Was Missing

The first invocation did not record the access granted to that attempt.

The corrected invocation records the granted capabilities.

### Required Correlation Identities Were Missing

The first terminal results did not identify the module, gate, suite, or
execution. They also had no immutable receipt identity.

The corrected attempt and node results record:

- Plan and run.
- Module and gate.
- Suite instance.
- Node and execution.
- Attempt, when an attempt exists.
- Result digest.
- Receipt ID and receipt digest.

Evidence manifests use the same execution identities.

### Evidence Declaration and Stored Evidence Were Mixed

The first evidence manifest could contain an optional stored artifact.

The corrected manifest declares files only. Buster validates and stores those
files. The stored artifact references then appear in the attempt result.

### Wire Collections Had No Size Bounds

The first schemas allowed unlimited nodes, links, findings, metrics, files,
cases, and other lists.

The corrected schemas add structural limits. The runner must add byte and
resource limits in Phase 5.

### Execution Ceilings Were Missing

The first plan and invocation contained only a time limit.

The corrected contracts also require limits for CPU, memory, logs, artifacts,
artifact file count, and process count. The operator values and enforcement
remain Phase 5 work.

### Provider Details Were Not Typed

The first result allowed free provider detail data with no schema identity.

The corrected result records the detail schema ID, its digest, and the values.
ClawDeck can select a specialist view from this stable identity.

### Providers Could Appear to Create Receipts

The first contract did not separate the provider return from the stored attempt
result.

The corrected contract has a `providerResult` for provider facts and declared
files. It cannot contain a receipt. Buster creates the stored `attemptResult`,
result digest, artifact references, resource values, and immutable receipt.

### Type Tests Did Not Check Fixtures Against TypeScript

The first tests validated JSON objects. They did not require the valid examples
to satisfy the exported TypeScript interfaces.

The corrected tests use TypeScript `satisfies` checks for all public contract
examples.

### Plan Status Was Stale

The plan header said that only Phase 1 was complete.

The header now reports that Phase 2 is audited and complete.

## What Phase 2 Proves

Phase 2 proves:

- All eleven public contract definitions compile in strict JSON Schema mode.
- Valid examples satisfy the JSON Schema and TypeScript types.
- Shared fields reject unknown properties.
- Provider configuration remains open only for JSON-safe provider values.
- Tests and fixtures use the same provider boundary.
- Fixtures do not use a test quality mode.
- Skipped nodes do not create false attempts.
- Value and artifact links carry required type information.
- Evidence paths cannot escape the evidence directory.
- A gate-level expected-failure field is rejected.
- Results contain the required correlation and receipt identities.

## Required Checks in Later Phases

JSON Schema cannot prove relations between separate objects. Later phases must
implement and test the checks below.

### Phase 3: Provider Registry

- Reject duplicate registration IDs.
- Reject duplicate input or output names.
- Load the provider configuration schema from the locked package.
- Verify the schema digest.
- Confirm that evidence defaults use supported evidence types.
- Confirm that granted capabilities are declared by the provider.
- Freeze the exact package version and content digest.

### Phase 4: Suite Resolver

- Validate provider configuration against its provider schema.
- Apply provider defaults, suite values, and project changes in order.
- Require unique node and execution IDs.
- Validate every dependency and typed link.
- Confirm that linked port kinds and types match.
- Reject dependency cycles.
- Apply conditions and record skip reasons.
- Expand variations with stable parent and child identities.
- Calculate and verify the immutable plan digest.

### Phase 5: Test-Plan Runner

- Match every invocation and result identity to the plan.
- Confirm that outputs match declared provider ports.
- Confirm that evidence types match the selected evidence policy.
- Enforce output, log, artifact, time, retry, and resource limits.
- Verify test counts and time values.
- Store evidence before it creates an artifact reference.
- Calculate result digests.
- Create immutable receipts outside provider control.
- Create one final node result from all attempts.
- Mark a fail-then-pass result as unstable.

### Phase 7: Nova Integration

- Store attempts and final node results in the Nova execution graph.
- Apply blocking and advisory rules only to final node results.
- Check that every required result and receipt exists.
- Keep agent review as a separate linked result.

## Proof Commands

```text
npm run verify:test-gate:contracts
npm run verify:test-gate:traceability
```
