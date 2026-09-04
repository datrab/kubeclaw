# Pipeline Test Gate Phase 7-A Audit

Date: 2026-08-10

## Purpose

This audit defines the connection that Phase 7 must build. It covers the
pipeline only. It does not build ClawDeck or its future storage services.

## Accepted connection

Nova sends one immutable resolved-plan job to Buster through the authenticated
remote API. Buster schedules attempt-level work through the existing worker
core. Nova imports the durable result and makes the gate decision.

The first transport uses submit, status, and cancel requests. The transport is
behind a replaceable dispatcher. A future durable queue can replace it without
changing the plan or result contracts.

## Current path inventory

### Nova

- `loadPipelineTestScope` reads declared tests from `.swarm/pipeline.json`.
- `resolveTestPlan` creates and digest-binds `resolved-test-plan.v1`.
- The registry snapshot freezes provider and report-adapter identities.
- `NovaObservabilityReconciler` imports durable attempt results after restart.
- Nova has no resolved-plan remote dispatcher or test-gate decision importer.

### Buster

- `TestPlanRunner` runs one immutable resolved plan.
- It schedules one worker envelope for each provider attempt.
- It stores attempt results and evidence before completion.
- It supports retries, cancellation, cleanup, fixtures, typed links, report
  adapters, resource limits, and concurrency groups.
- It has no resolved-plan HTTP service or durable plan-job store.

### Existing remote worker

`kubeclaw.buster-suite-runtime` exposes `/v2/jobs`. It runs the old closed suite
runtime. Its protocol includes the 13 suite names, old test configuration, and
old result summaries. It is a migration bridge. It is not the Phase 7 base.

The bridge has useful transport behavior that the new path must preserve:

- Bearer-token authentication.
- Bounded request and archive sizes.
- Archive digest verification and safe extraction.
- Stable job identity and duplicate-submit conflict detection.
- Status polling and cancellation.
- Process isolation and bounded termination.

The bridge has behavior that the new path must not copy:

- A compiled suite list.
- Suite-to-capability mappings in the wire protocol.
- `testConfig` and task-specific legacy payloads.
- Summary-only results.
- Restart behavior that changes active work directly to failed.

## Required Phase 7 records

Nova must store these items before remote dispatch:

- The resolved plan.
- The plan digest.
- The repository archive digest.
- The bounded archive bytes or a durable authenticated artifact reference.
- The registry snapshot digest.
- The remote job identity.
- The dispatch request digest.
- The expected run and plan ownership.

Buster must durably store:

- The accepted job request.
- The verified repository archive bytes or its recoverable durable reference.
- The current job state.
- The complete `TestPlanRunResult`.
- The terminal error or cancellation record.
- The result digest and receipt.

## Authority

Nova owns:

- Plan resolution.
- Remote dispatch and reconnect policy.
- Result import.
- Blocking and advisory gate policy.
- Optional agent-review activation.
- Final pipeline state.

Buster owns:

- Plan validation against its installed registry snapshot.
- Attempt scheduling and execution.
- Provider and report-adapter isolation.
- Evidence and attempt-result durability.
- Plan cleanup.

The transport owns no pipeline policy.

## Deletion targets

The following surfaces remain only for old-suite migration:

- `skills/buster/plugins/buster-suite-runtime/src/protocol.ts`
- the retired Buster suite adapter;
- the retired Buster suite worker;
- the retired Buster suite worker runner.
- The compiled `SUPPORTED_SUITES` list.
- The compiled suite capability map.
- Old suite result summaries and receipts.

Phase 7-E must prevent resolved-plan work from entering this path. Later suite
cutovers remove each mapping. Phase 10 starts that deletion with unit.

## Gaps assigned to later subphases

- Phase 7-B owns the versioned remote contracts and durable Nova dispatch plan.
- Phase 7-C owns verified archive retention, the Buster plan service, and the
  reconnect-safe client.
- Phase 7-D owns result verification, import, and gate policy.
- Phase 7-E owns bridge containment and dual-authority prevention.
- Phase 7-F owns restart, duplicate, cancellation, and concurrency proof.

## Decision audit

- D-005: The remote path consumes the canonical `pipeline.json` plan.
- D-012 and D-054: Provided and imported providers use the same plan contract.
- D-072 through D-079: The existing plan and result contracts remain in use.
- D-081: Provider code remains outside the Buster host process.
- D-091: Nova integration is the Phase 7 authority boundary.
- D-097 and D-103: One worker envelope still represents one attempt.
- D-105: Nova, worker, and Buster role ownership remains separate.
- D-106 and D-107: Results and evidence remain durable and restart-safe.
- D-108 and D-109: Normalized report facts remain attached to attempt results.

## Phase 7-A result

The audit is complete. No runtime change is required in Phase 7-A. Phase 7-B
can define the new resolved-plan remote job contract without extending the old
suite protocol.
