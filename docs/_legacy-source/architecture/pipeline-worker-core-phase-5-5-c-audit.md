# Pipeline Worker Core Phase 5.5-C Audit

Status: complete
Date: 2026-08-05

## Scope

Phase 5.5-C connects the local Buster runner to the neutral attempt executor.
It does not add distributed dispatch or change suite and provider contracts.

## Ownership

Nova and the Buster scheduler still own:

- Ready-node scheduling.
- Dependencies and result filters.
- Concurrency groups.
- Retries and unstable results.
- Matrix nodes.
- Typed links.
- Final node results and gate policy.

The neutral executor now owns each provider attempt:

- One immutable worker envelope.
- Timeout and cancellation.
- Log limits and durable full logs.
- Provider termination.
- Resource checks.
- Attempt cleanup.
- Evidence limits.
- Worker result integrity.

The Buster adapter owns provider loading, provider-result validation, evidence
selection, output mapping, capability calls, and retained-fixture cleanup.

## Architecture Audit

The implementation matches D-096 through D-104:

- The worker executor remains neutral.
- Buster keeps test-plan policy and scheduling.
- One immutable attempt remains the worker unit.
- Cancellation waits for bounded termination and staging shutdown.
- A failed termination prevents retries.
- Provider results are copied and frozen before cleanup.
- Resource use is measured before cleanup.
- Normal and error evidence use separate bounded staging sets.
- Durable evidence storage is separate from the provider workspace.
- Provider loading receives the attempt cancellation signal.

The local provider sandbox applies CPU, memory, and process limits when it
creates the provider process. This occurs before provider code starts.

## Simplicity Check

The scheduler was not replaced. One adapter connects an existing Buster node to
one neutral attempt. No queue, heartbeat, remote worker, or gate policy was
added.

## Proof

Run:

```bash
npm run verify:worker-core:contracts
npm run verify:worker-core:attempt-executor
npm run verify:test-gate:plan-runner
```

The existing Phase 5 runner proof remains unchanged. It covers parallel nodes,
dependencies, retries, typed links, provider isolation, limits, evidence,
cleanup, fixtures, and package verification.

The proof also checks nested evidence, link escapes, cleanup-time evidence,
late provider loading, failed termination, private artifact storage, immutable
provider results, and TypeScript validity of the attempt-executor test.

## Independent review

Independent review used only `gpt-5.6-terra` with high reasoning.

Accepted findings were fixed in these areas:

- Evidence collection before cleanup.
- Nested-path and link safety.
- Cancellation-aware staging and provider loading.
- Immutable provider results.
- Resource measurement before cleanup.
- Normal and error evidence budgets.
- Cleanup boundaries for loading, fixture initialization, and execution.
- Retry prevention after failed termination.
- Closed log capture after its limit.
- Worker and artifact path separation.
- Cleanup-time and result-size option validation.
- Direct TypeScript checking for the neutral executor proof.

One finding was rejected. It claimed that the Buster adapter does not apply
hard resource limits. The registered provider loader installs the resolved
limits in the isolated process launcher before provider code starts.

Final result:

```text
independent review clean: no accepted/actionable findings reported
```
