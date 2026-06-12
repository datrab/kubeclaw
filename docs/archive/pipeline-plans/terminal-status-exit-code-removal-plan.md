# Terminal Status and Exit Code Removal Plan

Status: in progress
Owner: Nova / maintainers
Created: 2026-06-06

## Purpose

Remove numeric exit codes from pipeline domain logic, operator language, typed telemetry payloads, and replay artifacts.

The pipeline should speak in typed terminal state and typed next actions. Numeric process exits are not part of the domain model. If a shell, CI job, Kubernetes job, or wrapper later needs a POSIX process status, add a small boundary adapter outside pipeline core.

## Direction

Current terminal behavior grew around constants such as `EXIT_NEEDS_NOVA`, `EXIT_BLOCKED`, `EXIT_TIMEOUT`, and `EXIT_RATE_LIMITED`. Those constants now leak into:

- scheduler and halt decisions
- operator alerts
- Nova handoff
- telemetry payloads
- summary artifacts
- verification expectations
- docs and reference surfaces

Target behavior:

- no internal numeric terminal states
- no operator-facing `exit 10` / `NEEDS_NOVA` language
- no new artifact schemas that require `exit`, `exit_code`, or numeric result fields
- no behavior triggered by magic numbers
- one typed terminal decision is the authority for halt consequences

## Target Model

### Terminal status

Use a closed typed status vocabulary:

```ts
type PipelineTerminalStatus =
  | 'succeeded'
  | 'failed'
  | 'paused'
  | 'blocked'
  | 'action_required'
  | 'timed_out'
  | 'rate_limited'
  | 'cancelled';
```

Status meanings:

- `succeeded`: all required work completed
- `failed`: terminal failure without a specialized recovery state
- `paused`: intentional nonterminal stop that can resume without failure semantics
- `blocked`: manual project/code change required before resume
- `action_required`: operator/Nova handoff required
- `timed_out`: terminal timeout policy fired
- `rate_limited`: cooldown budget exhausted or rate-limit policy refused progress
- `cancelled`: operator or policy cancelled execution

### Terminal action

Use typed actions for scheduler decisions:

```ts
type PipelineNextAction =
  | 'continue'
  | 'retry'
  | 'pause'
  | 'stop'
  | 'notify_operator'
  | 'request_handoff';
```

Actions are internal orchestration instructions. They are not process codes.

### Terminal decision

Create one canonical terminal decision shape:

```ts
interface PipelineTerminalDecision {
  kind: 'pipeline_terminal_decision';
  status: PipelineTerminalStatus;
  next_action: PipelineNextAction;
  scope: 'pipeline' | 'module' | 'gate' | 'summary' | 'worker';
  scope_id: string | null;
  reason_code: string;
  human_reason: string;
  retryable: boolean;
  resumable: boolean;
  operator_action: 'none' | 'inspect' | 'fix_and_resume' | 'handoff_to_nova' | 'wait_and_retry';
  correlation: {
    run_id: string | null;
    project: string | null;
    module_id: string | null;
    gate_id: string | null;
    gate_type: string | null;
    attempt: number | null;
    dispatch_id: string | null;
    session_key: string | null;
    gateway_label: string | null;
  };
  diagnostics: {
    summary: string;
    metadata?: Record<string, unknown>;
  };
}
```

This decision becomes the source for all terminal consequences.

## Explicit Non-Goals

- Do not keep numeric exit codes in pipeline core as compatibility state.
- Do not preserve `EXIT_*` constants for future possible external users.
- Do not keep `NEEDS_NOVA` as an operator status. Use `action_required`.
- Do not make Discord, Nova injection, summary generation, or replay artifacts independently decide terminal meaning.
- Do not do a big-bang rewrite without a first compatibility read of current consumers.

## Boundary Adapter Policy

Process exit conversion is allowed only at a true process boundary.

If needed later, add a small adapter such as:

```ts
function terminalStatusToProcessExit(status: PipelineTerminalStatus): number {
  return status === 'succeeded' ? 0 : 1;
}
```

That adapter should live near CLI/container entrypoints, not in scheduler, runner, telemetry, artifact, or operator-surface code.

## Migration Phases

### Phase 0: Inventory

Find and classify every use of:

- `EXIT_OK`
- `EXIT_ERROR`
- `EXIT_NEEDS_NOVA`
- `EXIT_BLOCKED`
- `EXIT_TIMEOUT`
- `EXIT_RATE_LIMITED`
- `exit`
- `exit_code`
- `exit_reason`
- `NEEDS_NOVA`

Classification buckets:

- domain logic
- scheduler action
- operator display
- Nova handoff trigger
- telemetry payload
- summary/replay artifact
- test fixture or assertion
- docs/reference
- true process boundary

Expected result:

- a checked inventory committed beside this plan or folded into the first implementation PR
- proof that current numeric codes are not required by a real external shell/CI/Kubernetes consumer

### Phase 1: Add typed terminal contract

Add the new terminal decision contract without deleting old behavior yet.

Status: initial contract added on 2026-06-06.

Likely files:

- `skills/nova/pipeline/services/contracts/terminal-decision.ts`
- `skills/nova/pipeline/services/contracts/pipeline-step-result.ts`
- focused contract tests under `tests/verification/contracts/`

Requirements:

- validate allowed statuses and actions
- reject unknown terminal status values
- keep correlation fields explicit and nullable
- support module, gate, pipeline, summary, and worker scopes
- do not include numeric exit fields in the new contract

Initial implementation notes:

- `terminal-decision.ts` defines immutable typed status, action, and scope registries.
- `PipelineTerminalDecision` validation rejects top-level `exit`, `exitCode`, and `exit_code`.
- `pipeline-step-result.ts` now exposes typed `terminal.status` and `terminal.decision`.
- Legacy step-result terminal projections were intentionally removed: no `terminal.exitCode`, no `terminal.exitLabel`, and no `PIPELINE_STEP_EXIT_*` registries/helpers.
- Existing older halt/summary artifacts still have numeric debt, but the new typed contract does not carry compatibility fields forward.

### Phase 2: Make halt path decision-first

Refactor `finalizeTerminalHalt(...)` so it first builds a `PipelineTerminalDecision`.

Status: started on 2026-06-06.

Current direct consequences in the halt path:

- append lifecycle event
- emit operator alert / Discord presentation
- inject Nova for numeric exit `10` or `30`
- emit `error.escalation`
- output result
- emit `pipeline.halted`
- emit summary lifecycle and write summary artifacts
- write cost report
- optionally schedule project summary on blocked halt

Target shape:

1. normalize owner result into `PipelineTerminalDecision`
2. persist/emit the canonical terminal decision
3. project consequences from that decision
4. return a typed terminal result to callers

The halt path should not branch on numeric codes.

Initial scheduler/halt status migration notes:

- `normalizeStepResultForPipeline(...)` now returns `terminalStatus` and `terminalDecision`, not step exit code/label projections.
- Full pipeline scheduler halt/continue remains based on typed `nextAction`.
- Single-module halt/success now branches on `terminalStatus`, not `result.exit`.
- Terminal halt Nova handoff, escalation, rate-limit handling, and blocked project-summary scheduling now branch on typed terminal status.
- Architecture-validation direct halt payloads now include typed `terminal_status`.
- `buildResultWithStepCorrelation(...)` no longer branches on `EXIT_BLOCKED`; it uses typed `terminal_status === 'blocked'`.
- Numeric fields still exist in some older producer outputs and process-boundary return paths, but they are no longer scheduler/halt decision authority in this slice.

### Phase 3: Projection split

Move terminal consequences behind projection functions that consume `PipelineTerminalDecision`.

Projection surfaces:

- telemetry projection:
  - `pipeline.terminal_decision` or equivalent canonical typed event
  - projected `pipeline.halted` only if still needed during transition
  - projected `error.escalation` only if still semantically useful
- operator projection:
  - durable operator alert
  - Discord/audit mirroring
  - wording based on status, not process code
- Nova handoff projection:
  - trigger on `status: 'action_required'`
  - optionally trigger on `status: 'timed_out'` only if policy says timeout needs active handoff
  - never trigger by numeric code
- artifact projection:
  - summary artifacts
  - latest pointers
  - replay bundle
  - Nova handoff audit
- cost/report projection:
  - terminal cost report or explicit noncritical failure surface

### Phase 4: Remove numeric fields from new events and artifacts

Status: started on 2026-06-06.

New canonical telemetry and summary schemas should use:

- `terminal_status`
- `reason_code`
- `human_reason`
- `operator_action`
- `retryable`
- `resumable`

Do not add:

- `exit`
- `exit_code`
- `exit_reason`

Do not keep temporary compatibility readers for old numeric terminal or replay shapes. Readers and tests should consume the typed terminal contract only:

- `terminal_status`
- `terminal_decision`
- `reason_code`

If a test still depends on an old `exit`, `exit_code`, or `exit_reason` review/replay shape, change the test to the typed contract instead of preserving the old reader.

Initial projection rewrite notes:

- `pipeline.completed`, `pipeline.halted`, `error.escalation`, `summary.started`, and `summary.completed` telemetry now project `terminal_status` / `terminal_decision` / `reason_code` instead of `exit_code` or `exit_reason`.
- Pipeline summary artifacts write `terminal_status` and `reason_code`; latest pointers write `terminal_status`.
- Lifecycle replay events and read models write `terminal_status`, `terminal_decision`, and `reason_code` instead of `exit_code`.
- Durable operator alerts preserve typed terminal fields instead of numeric exit codes.
- Nova injection logs and Discord fields use `Status` and `Action`; they no longer emit `exit` or `exit_label`.
- Scheduled generator state snapshots and plugin metadata carry typed terminal status and reason code.
- Remaining numeric `exit` values in this slice are process/stdout return values or older producer-side results slated for the producer cleanup slice.

### Phase 5: Rename operator language

Operator-facing vocabulary:

- `NEEDS_NOVA` -> `Action required`
- `EXIT_BLOCKED` / `BLOCKED` -> `Blocked`
- `EXIT_TIMEOUT` -> `Timed out`
- `EXIT_RATE_LIMITED` -> `Rate limited`
- `EXIT_ERROR` -> `Failed`
- `EXIT_OK` -> `Succeeded`

Discord fields should lead with:

- `Status`
- `Action`
- `Reason`
- identity/correlation fields

They should not lead with or require `Exit Code`.

### Phase 6: Update scheduler and owners

Replace numeric outcomes at the producer side.

Likely producer areas:

- module runner
- Forge worker result normalization
- Buster module completion
- Buster gate completion
- review gate
- approval gate
- architecture validator
- summary generators
- rate-limit exhaustion translators
- failure/retry policy

Each owner should return typed status/action data and diagnostics. The central runner should not recover meaning from a numeric result.

### Phase 7: Hard-cut compatibility cleanup

Remove temporary read compatibility everywhere rather than keeping migration-only readers alive.

Cutover targets:

- old numeric terminal/replay readers
- old event/replay fixtures kept only for tests
- migration notes that say consumers may ingest old producer envelopes
- docs that describe numeric terminal state as accepted replay shape
- tests that assert legacy review/replay fields instead of typed terminal fields

Replacement contract:

- producers write typed terminal status/action/reason data
- readers require typed terminal status/action/reason data
- validation rejects old numeric terminal fields at producer and reader boundaries
- true process exits remain only at CLI/process boundaries

Update active docs:

- `docs/reference/exit-codes.md`
- `docs/operators/running-the-pipeline.md`
- `docs/pipeline/failure-and-recovery.md`
- `docs/pipeline/telemetry-and-artifacts.md`
- `docs/pipeline/runtime-flow.md`
- `docs/developers/adding-pipeline-features.md`

Expected doc changes:

- remove exit-code reference as domain behavior
- document typed terminal statuses
- document optional future process-boundary adapter policy
- document operator language and replay semantics

### Phase 8: Delete constants and numeric compatibility

After behavior and docs are green:

- remove `EXIT_*` constants from pipeline core
- remove numeric-code maps from scheduler/runner services
- remove tests that assert magic numbers
- remove docs that describe `10`, `20`, `30`, or `40` as pipeline concepts
- leave only an optional process-boundary adapter if a real boundary exists

Status: completed on 2026-06-06 for runtime producers, gate/module/summary owners, behavior expectations, and public exports. Remaining numeric fields are limited to explicit denial guards or ordinary process/tool exit boundaries.

## Verification Matrix

For each terminal status, verify:

- one canonical terminal decision is emitted/persisted
- no numeric terminal fields are present in the new canonical event
- scheduler action is correct
- operator alert wording is human status/action based
- Discord audit and durable operator alert are written once
- Nova handoff occurs only for `action_required` policy
- summary lifecycle and summary artifacts match the terminal decision
- replay bundle can reconstruct the terminal state
- resume behavior remains correct
- no duplicate terminal side effects are produced

Statuses to cover:

- `succeeded`
- `failed`
- `paused`
- `blocked`
- `action_required`
- `timed_out`
- `rate_limited`
- `cancelled`

## First Implementation Slice

Start with a narrow vertical slice:

1. Add `PipelineTerminalDecision` contract and tests.
2. Add a builder that maps existing typed step results into terminal decisions.
3. Wire `finalizeTerminalHalt(...)` to build and log/emit the decision while preserving existing side effects.
4. Add verification that the new decision has no numeric exit fields.
5. Do not remove old exit constants in this slice.

This gives us a stable typed target before deleting legacy behavior.

## Second Implementation Slice

Move operator alert and Discord projection to consume `PipelineTerminalDecision`.

Acceptance:

- no operator field named `Exit Code`
- operator status is `Succeeded`, `Failed`, `Blocked`, `Action required`, `Timed out`, or `Rate limited`
- old numeric fields are not used to choose the message
- current audit mirroring remains intact

## Third Implementation Slice

Move Nova handoff to typed policy.

Acceptance:

- Nova handoff triggers on `status: 'action_required'`
- timeout handoff is explicit policy, not inherited from an exit code
- `nova-injections.jsonl` records typed status and reason code
- no `NEEDS_NOVA` wording remains in operator-facing handoff text

## Fourth Implementation Slice

Move summary/replay artifacts to typed terminal status.

Acceptance:

- summary artifact stores `terminal_status`, `reason_code`, and `operator_action`
- latest/replay pointers remain stable
- old replay files can still be read if needed
- new artifacts do not introduce numeric terminal fields

## Fifth Implementation Slice

Replace producer-side numeric outcomes.

Acceptance:

- module/gate/summary owners return typed terminal data
- scheduler no longer branches on `EXIT_*`
- `pipeline-step-result` no longer requires numeric exit projection
- focused module, gate, rate-limit, blocked, and timeout verification is green

## Final Cleanup Slice

Delete old symbols and references.

Acceptance:

- no active runtime import of `EXIT_*`
- no active docs describing numeric exit-code semantics as pipeline behavior
- no behavior tests asserting magic exit numbers
- no operator alert, telemetry, summary, or replay writer emits numeric terminal status
- any remaining numeric process result is isolated in an explicit boundary adapter, or absent

## Open Decisions

- Should `timed_out` request Nova handoff by default, or only notify operators?
- Should `paused` be terminal for a run or a resumable nonterminal snapshot?
- Should `rate_limited` be terminal, paused, or policy-dependent?
- Should the canonical event be named `pipeline.terminal_decision`, `pipeline.terminated`, or reuse `pipeline.halted` with a new payload?
