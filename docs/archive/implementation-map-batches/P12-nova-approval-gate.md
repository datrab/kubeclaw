# Batch P12 — Nova approval gate

Status: completed
Date started: 2026-05-08
Date completed: 2026-05-08
Reviewer: Nova

## Scope

```text
skills/nova/pipeline/runners/approval-gate*.js
```

Scope expansion verified live: 4 files, under the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/nova/pipeline/runners/approval-gate-control.js
kubeclaw-main/skills/nova/pipeline/runners/approval-gate-runner.js
kubeclaw-main/skills/nova/pipeline/runners/approval-gate-shared.js
kubeclaw-main/skills/nova/pipeline/runners/approval-gate-state.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/contracts/check-gate-control-result-surface.mjs
kubeclaw-main/tests/verification/behavior/areas/approvals.mjs
kubeclaw-main/tests/verification/behavior/areas/gates.mjs
kubeclaw-main/tests/verification/behavior/areas/pipeline.mjs
```

## Per-file map

### `skills/nova/pipeline/runners/approval-gate-control.js`

Role: Typed gate-control result builders for approval gates, including wait control results.

Imports/dependencies: Exit constant, gate-control contract helpers, approval status/timeout constants and normalizer.

Exports/public surface: `projectApprovalGateCompatibilityResult`, `buildApprovalGateControlResult`, `buildApprovalGateWaitControlResult`, `isApprovalGateControlResult`, `coerceApprovalGateControlResult`.

Defines: Approval summary/finding builders, terminal/pass/block typed result construction, wait typed result construction.

Important variables/state: No module-global state.

Calls out to: `mapGateCompatibilityResultToControl`, `buildTypedGateControlResult`, `coerceTypedGateControlResult`, `normalizeApprovalTimeoutPolicy`.

Called by / expected callers: Approval runner, generic waitable gate engine/gate adapter, contract/behavior tests.

Environment variables / CLI inputs / config fields: Reads run id fields, gate `type`, `on_timeout`, input `stateSnapshot.gate.gate_status_timeout_policy`, input `refs.waitRef`.

Paths built/read/written: None.

Authority behavior: Owns typed approval control-result schema and wait payload shape.

Error/retry/terminal behavior: Coercion can throw through contract helper. Timeout continue maps to pass only when compatibility mapping/adapter validation agree.

Verification coverage: Gate-control contract tests and approval behavior tests.

Findings: None.

### `skills/nova/pipeline/runners/approval-gate-runner.js`

Role: Human-in-the-loop approval gate runner, wait controller, timeout resolver, Discord/operator request builder, and resume-safe state router.

Imports/dependencies: Logger, exit constants, status-store approval wait sync, governance context, telemetry, gate-control constants, approval shared/control/state helpers.

Exports/public surface: Approval status/policy/control exports, `buildApprovalEmbed`, `runApprovalGateEvaluation`, `waitForApprovalGateSignal`, `createApprovalGateWaitController`, `runApprovalGate`, `runApprovalGateStage`, `getApprovalGateControlAdapter`, default `runApprovalGate`.

Defines: Telemetry replay helpers, Discord embed builder, dependency seam, timeout resolver, polling loop, evaluation startup/resume logic, wait controller and adapter.

Important variables/state: Reads/writes persisted gate-status approval state via deps; writes governance/telemetry events; no module-global mutable state.

Calls out to: `syncApprovalWaitState`, `recordApprovalGateOutcome`, approval telemetry/gate telemetry functions, state helpers, Discord deps, sleep deps.

Called by / expected callers: Gate registry/generic waitable gate engine, direct approval gate tests, legacy runner path.

Environment variables / CLI inputs / config fields: Reads `config._testOverrides.approvalGate`, `config._approvalPollIntervalMs`, `default_timeout_minutes`, `project`, run id fields, gate `timeout_minutes`, `on_timeout`, `title`, `description`, `type`, progress `execution_order`.

Paths built/read/written: Delegated to state helpers: gate-status file and gate log artifacts. Operator embed references `.swarm/logs/gates/<gateId>/`.

Authority behavior: Lifecycle/read-model state is synchronized through `syncApprovalWaitState`; persisted gate-state file is operator evidence and wait source read each poll. Runner refuses to reset corrupted/invalid persisted state.

Error/retry/terminal behavior: Missing gate throws. Corrupted/invalid state fail closed. Existing terminal state replays telemetry. Existing pending state returns wait or resolves timeout on resume. Fresh start creates pending state and returns WAIT. `waitForApprovalGateSignal` polls until approve/reject/cancel/timeout/invalid status.

Verification coverage: Approval behavior tests, gates/pipeline tests, gate-control contract tests.

Findings: None.

### `skills/nova/pipeline/runners/approval-gate-shared.js`

Role: Shared approval constants, timeout-policy normalizer, state identity normalizer, and Discord identity fields.

Imports/dependencies: Discord field builder/specs.

Exports/public surface: `APPROVAL_STATUS`, `APPROVAL_TIMEOUT_POLICY`, `APPROVAL_TERMINAL_OR_WAIT_STATUSES`, `DEFAULT_TIMEOUT_MINUTES`, `DEFAULT_POLL_INTERVAL_MS`, `normalizeApprovalTimeoutPolicy`, `isApprovalTimeoutContinue`, `normalizeApprovalGateState`, `buildApprovalIdentity`, `buildApprovalGateDiscordFields`.

Defines: Approval status enum, timeout policy enum, defaults, state normalization helper, identity builder.

Important variables/state: Constants only.

Calls out to: `buildDiscordIdentityFields`.

Called by / expected callers: Approval control/runner/state helpers.

Environment variables / CLI inputs / config fields: Normalizes status fields from state/config; no direct env reads.

Paths built/read/written: None.

Authority behavior: Owns approval timeout policy normalization: only `BLOCK` and `CONTINUE` are valid, fallback clamps to `BLOCK` unless explicitly `CONTINUE`.

Error/retry/terminal behavior: Invalid states are not thrown here; normalizers return fallback/normalized copies.

Verification coverage: Approval behavior and gate-control tests.

Findings: None.

### `skills/nova/pipeline/runners/approval-gate-state.js`

Role: Approval persisted state, audit artifacts, fail-closed corrupted/invalid handlers, and default dependency seam.

Imports/dependencies: Node `fs`/`path`; logger; exit constant; path helpers; Discord integration; approval shared helpers.

Exports/public surface: `loadApprovalGateState`, `failClosedOnCorruptedApprovalState`, `failClosedOnInvalidApprovalState`, `saveApprovalGateState`, `appendApprovalTransition`, `writeApprovalRequest`, `writeApprovalDecision`, `DEFAULT_APPROVAL_GATE_DEPS`.

Defines: Gate-state JSON loader with corruption sentinel, atomic state saver, transition JSONL appender, approval request JSON/Markdown writers, decision writer, default deps.

Important variables/state: Writes gate-status file and `.swarm/logs/gates/<gateId>/approval-*` audit artifacts.

Calls out to: `gateStatusPath`, `gateLogDir`, `discordIntegration`, approval identity/normalization helpers.

Called by / expected callers: Approval runner and tests.

Environment variables / CLI inputs / config fields: Reads `config.project`, run id fields, `_logDir`; gate `title`, `type`.

Paths built/read/written: Reads/writes `gateStatusPath(config, gateId)` via tmp+rename; writes `approval-transitions.jsonl`, `approval-request.json`, `approval-request.md`, `approval-decision.json` under `gateLogDir(config, gateId)`.

Authority behavior: Owns persisted approval state artifact shape and audit artifact emission. Corrupted/invalid state handlers fail closed and require operator repair/removal.

Error/retry/terminal behavior: Corrupt JSON returns sentinel instead of throwing. Save is atomic but can throw. Audit artifact writes are best-effort. Fail-closed handlers emit CRITICAL Discord and return `EXIT_NEEDS_NOVA` compatibility results.

Verification coverage: Approval behavior and gate-control tests.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `approval-gate-runner.js` | `approval-gate-control.js` | terminal/wait/coerce/project helpers | Typed control-result authority. |
| `approval-gate-runner.js` | `approval-gate-state.js` | load/save/audit/fail-closed helpers | Persistent approval evidence and audit artifacts. |
| `approval-gate-runner.js` | `approval-gate-shared.js` | status/policy/identity helpers | Shared approval enum/normalization authority. |
| `approval-gate-control.js` | `approval-gate-shared.js` | status/policy constants | Wait and metadata schema. |
| `approval-gate-state.js` | `approval-gate-shared.js` | identity/normalization/Discord fields | State artifact and operator presentation. |
| `approval-gate-runner.js` | status-store/governance/telemetry services | wait sync/outcome/events | Lifecycle/read-model and observability projection. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `normalizeApprovalTimeoutPolicy` | Input is `BLOCK`/`CONTINUE` vs invalid | Raw policy and fallback | Valid policy or fallback clamped to BLOCK/CONTINUE | Timeout authority. |
| `runApprovalGateEvaluation` | Corrupted/invalid persisted state | Loaded gate-state JSON | Fail closed typed control result | Prevents unsafe reset/reopen. |
| `runApprovalGateEvaluation` | Existing APPROVED/REJECTED/CANCELLED/TIMED_OUT/PENDING | Persisted status | Replay terminal telemetry, re-resolve timeout, wait, or fail | Resume idempotence. |
| `runApprovalGateEvaluation` | Fresh start | No state | Create PENDING_APPROVAL, write artifacts, emit request, return WAIT | New approval request authority. |
| `pollForApproval` | APPROVED/REJECTED/CANCELLED/invalid | Current persisted status each poll | Pass, block, cancel block, or fail closed | Operator decision routing. |
| `pollForApproval` | Deadline elapsed | `Date.now()` vs `state.deadline` | Save TIMED_OUT, write decision, resolve timeout | Timeout resolution. |
| `resolveTimeout` | Timeout policy CONTINUE vs BLOCK | Normalized timeout policy | Pass/continue or needs-Nova block | Approval timeout semantics. |
| `getApprovalGateControlAdapter.extraValidate` | Timed-out continued result not PASS | Control metadata/action | Adapter validation error | Prevents invalid timeout-continue mapping. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `normalizeApprovalGateState` | State identity/policy fields | State and identity fallback | Existing state first, identity fills missing; timeout policy normalized | State has canonical gate/project/type/policy. |
| `saveApprovalGateState` | Gate-status JSON | State plus config identity | Normalize, set `updated_at`, write tmp then rename | Atomic persisted approval evidence. |
| `runApprovalGateEvaluation` | Fresh pending state | Gate/config timeout and identity | Gate timeout overrides config/default; run/project from config | PENDING_APPROVAL state synchronized to wait lifecycle. |
| `pollForApproval` | Terminal decision state | Current persisted state | Sync wait lifecycle, append transition, write decision | Terminal operator evidence persisted. |
| `pollForApproval` | Timed-out state | Pending state and timeout policy | Copy state, set TIMED_OUT/resolved_at/decision_via/continued/reason | Timeout decision evidence persisted. |
| `writeApprovalRequest` | Request JSON/Markdown | Normalized pending state | State identity plus gate title/project | Operator-facing request artifacts. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `pollForApproval` | `while (true)` until terminal state | `deps.sleep(min(pollIntervalMs, remainingMs))` | State `deadline` reloaded each iteration; default poll 30000 ms | Approved/rejected/cancelled/invalid/timeout. |
| `runApprovalGateEvaluation` | No local wait loop | Returns WAIT for core-owned wait handling | Fresh deadline = now + timeout minutes | Existing terminal/pending routes return immediately. |
| `waitForApprovalGateSignal` | Delegates loop to `pollForApproval` | Config `_approvalPollIntervalMs` or 30000 ms | State timeout policy/deadline | Returns resolved control result. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `config._testOverrides.approvalGate` | Test override | `getApprovalGateRunnerDeps` | `{}` | Replaces approval gate deps. |
| `config._approvalPollIntervalMs` | Test/config override | `waitForApprovalGateSignal` | `30000` ms | Poll interval for approval wait loop. |
| `gate.timeout_minutes`, `config.default_timeout_minutes` | Gate/config field | `runApprovalGateEvaluation` | `60` minutes fallback | Approval deadline duration. |
| `gate.on_timeout` | Gate field | Runner/control/shared | `BLOCK` fallback | Timeout policy `BLOCK` or `CONTINUE`. |
| `gate.title`, `gate.description`, `gate.type` | Gate fields | Embed/state/telemetry | Type defaults `approval` | Operator-facing request and telemetry. |
| `progress.execution_order` | Progress field | `buildApprovalEmbed` | empty array | Completed/remaining step context. |
| Persisted approval state `status`, `deadline`, `timeout_policy` | Runtime file input | Runner/wait loop/control | Gate-state file | Operator decision/wait source. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| `gateStatusPath(config, gateId)` | Approval state helper | Approval runner/wait loop | `saveApprovalGateState` tmp+rename | Operator evidence/wait source. |
| `gateLogDir(config, gateId)/approval-transitions.jsonl` | `appendApprovalTransition` | Operators/tests | Approval state helper | Append-only transition audit best-effort. |
| `gateLogDir(config, gateId)/approval-request.json` | `writeApprovalRequest` | Operators/tests | Approval state helper | Normalized request payload. |
| `gateLogDir(config, gateId)/approval-request.md` | `writeApprovalRequest` | Operators | Approval state helper | Human-readable instructions. |
| `gateLogDir(config, gateId)/approval-decision.json` | `writeApprovalDecision` | Operators/tests | Approval state helper | Final decision record. |
| `.swarm/logs/gates/<gateId>/` | Embed/request text | Operators | State helper artifacts | Operator audit trail reference. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Approval typed control/wait result | `approval-gate-control.js` | Waitable gate engine/generic runner | None. |
| Approval timeout-policy normalization | `approval-gate-shared.js` | Runner/control/state helpers | None. |
| Approval persisted state and audit artifacts | `approval-gate-state.js` | Runner/wait loop/operators | None. |
| Approval lifecycle/read-model sync | `syncApprovalWaitState` called by `approval-gate-runner.js` | Status-store read models/gate runner | Full status-store authority reviewed P14/P15. |
| Approval operator decision routing | `approval-gate-runner.js pollForApproval` | Pipeline runner/generic gate projection | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Approval gate-state JSON | `saveApprovalGateState`/operator | `gate_id`, `gate_type`, `status`, `run_id`, `project`, `requested_at`, `deadline`, `timeout_minutes`, `timeout_policy`, `resolved_at`, `decision_by`, `decision_via`, `continued`, `reason`, `request_message_ref`, `updated_at` | `normalizeApprovalGateState`, terminal status set | Runner/wait loop/operators. |
| Corrupted state sentinel | `loadApprovalGateState` | `_corrupted_gate_state:true`, `gate_id`, `gate_type`, `project`, `parse_error`, `parse_error_path`, `parse_error_preview` | Fail-closed handler | Runner/wait loop. |
| Approval request JSON | `writeApprovalRequest` | `gate_id`, `gate_type`, `gate_title`, `run_id`, `project`, `status:PENDING_APPROVAL`, `requested_at`, `deadline`, `timeout_minutes`, `timeout_policy`, `operator_instructions`, `artifacts_dir` | Normalized state | Operators/tests. |
| Approval transition JSONL | `appendApprovalTransition` | `ts`, `run_id`, `project`, `gate_id`, `gate_type`, `from`, `to`, `note` | None beyond writer | Operators/tests. |
| Approval wait control result | `buildApprovalGateWaitControlResult` | Typed gate result plus `wait:{ schemaVersion:'v1', waitKind:'approval', waitRef, status, deadline, timeoutPolicy, signalKinds }` | Gate control contract | Waitable gate engine. |
| Approval terminal control result | `buildApprovalGateControlResult` | Typed gate result metadata `timeout_policy`, `continued`, `timed_out`, `decision_by`, `decision_via`, `corrupted_state`, `invalid_state`, `wait_ref`, `scheduler_consumed` | Gate control contract | Generic gate runner/pipeline. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Approval Discord/operator request | `buildApprovalEmbed` + `writeApprovalRequest` | `approval-request.json`, `approval-request.md`; Discord presentation payload | Operator instructions: `APPROVE gate:<id>` or `REJECT gate:<id> reason: ...` | Human/OpenClaw operator writes gate-state decision evidence | Persisted gate-state status APPROVED/REJECTED/CANCELLED/TIMED_OUT. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `loadApprovalGateState` | Missing state file | Not error | No retry | Returns null | None. |
| `loadApprovalGateState` | Corrupt JSON | No | No retry | Returns corrupted sentinel | Preview limited to 200 chars. |
| `failClosedOnCorruptedApprovalState` | Corrupted persisted state | No | No retry | CRITICAL Discord, terminal `EXIT_NEEDS_NOVA` | Preview whitespace-collapsed and sliced. |
| `failClosedOnInvalidApprovalState` | Illegal/missing state status | No | No retry | CRITICAL Discord, terminal `EXIT_NEEDS_NOVA` | Status sliced to 200 chars. |
| `saveApprovalGateState` | Write/rename failure | No local retry | Atomic tmp+rename | Throws to caller | None. |
| `appendApprovalTransition` / request/decision writers | Log artifact write failure | Soft | No retry | Swallowed | None. |
| `runApprovalGateEvaluation` | Missing gate | No | No retry | Throws | None. |
| `runApprovalGateEvaluation` | Existing terminal state on resume | Not error | No retry | Replays telemetry and returns terminal control result | None. |
| `runApprovalGateEvaluation` | Pending state timeout elapsed on restart | No | No retry | Marks TIMED_OUT and resolves timeout | None. |
| `pollForApproval` | Invalid status while polling | No | No retry | Fail closed invalid-state result | None. |
| `pollForApproval` | Timeout while polling | No | Sleeps until min interval/deadline | Saves TIMED_OUT then BLOCK or CONTINUE by policy | None. |
| `resolveTimeout` | Timeout policy BLOCK vs CONTINUE | No | No retry | BLOCK returns needs-Nova; CONTINUE returns OK/pass | None. |
| `waitForApprovalGateSignal` | No persisted state | No | No retry | Throws | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `loadApprovalGateState` | Missing file | No | none | none | Return null | Fresh start emits request later. |
| `loadApprovalGateState` | Corrupt JSON | Yes downstream | Fail-closed handler Discord/core log/control result | CRITICAL approval state corrupted | `failClosedOnCorruptedApprovalState` | Sentinel carries preview/path. |
| `failClosedOnCorruptedApprovalState` | Corrupted state | Yes | Core log and Discord | ERROR log, CRITICAL Discord | `log`, `deps.discord` | Control result also carries reason. |
| `failClosedOnInvalidApprovalState` | Invalid state | Yes | Core log and Discord | ERROR log, CRITICAL Discord | `log`, `deps.discord` | Control result also carries reason. |
| `saveApprovalGateState` | Write/rename failure | Indirect | Caller error path | thrown error | Caller | No local catch. |
| Audit artifact writers | Artifact write failure | No | none | none | Swallowed catch | Non-critical audit artifact loss. |
| `runApprovalGateEvaluation` | Missing gate | No direct telemetry | none | none | Function throws | Caller owns error handling. |
| `runApprovalGateEvaluation` | Existing terminal state | Yes | Governance and approval/gate telemetry | approval resolved, gate pass/fail | `replayResolvedApprovalTelemetry` | Restores observability on resume. |
| `runApprovalGateEvaluation` | Restart timeout elapsed | Yes | Governance/approval/gate telemetry and decision artifacts | TIMED_OUT decision | `resolveTimeout`, state writers | State saved before telemetry. |
| `pollForApproval` | Invalid status | Yes via fail-closed handler | Core log and Discord | CRITICAL invalid state | `failClosedOnInvalidApprovalState` | Terminal control result. |
| `pollForApproval` | Timeout | Yes | Governance/approval/gate telemetry, Discord presentation, decision artifact | TIMED_OUT decision | `resolveTimeout`, state writers | CONTINUE uses WARN/pass semantics. |
| `resolveTimeout` | BLOCK/CONTINUE policy | Yes | Governance/approval/gate telemetry | timeout resolved | `recordApprovalGateOutcome`, `onApprovalResolved`, gate telemetry | Policy determines terminal action. |
| `waitForApprovalGateSignal` | No persisted state | No direct telemetry | none | none | Throws | Caller/generic gate runner owns error reporting. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js runtime | `node` binary | Observed `v24.14.0` during review | All P12 modules | ESM, sync fs/path, async polling | No package pin in scoped files. |
| Node `fs`/`path` built-ins | Runtime built-ins | Node major 24 observed | Approval state helper | Gate-state and audit artifacts | Sync IO; audit writes mostly soft. |
| Discord integration | Internal external webhook wrapper | Internal/external | Fail-closed state handlers and telemetry presentations | Operator alerts/request UI | Discord is UI, not source of truth. |
| Status-store approval wait sync | Internal source | Internal | Approval runner | Lifecycle/read-model wait state projection | Full status-store reviewed P14/P15. |
| Governance context service | Internal source | Internal | Approval runner | Approval outcome governance projection | Event sink behavior elsewhere. |
| Gate-control/waitable contracts | Internal source | Internal | Approval control/runner | Typed control/wait result validation | Contract errors propagate to generic gate runner. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Approval wait polling | One polling loop per approval wait | `config._approvalPollIntervalMs` or 30000 ms | Sleeps until status/deadline; no queue | INFO log each pending poll | None. |
| Approval timeout | Deadline from timeout minutes | Gate/default/60 minutes | BLOCK halts, CONTINUE passes | Timeout telemetry/decision artifact | None. |
| Gate-state writes | Single JSON state file | Atomic tmp+rename | Write failure throws | No local telemetry | None. |
| Audit artifacts | Best-effort sync writes | `_logDir` required | Failures swallowed | none | None. |
| Operator decision source | Persisted gate-state file | Manual/OpenClaw operator update | Invalid/corrupt state fails closed | CRITICAL Discord/log | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Approval wait control result | Typed gate result with `wait.schemaVersion:'v1'`, `waitKind:'approval'`, `waitRef`, `deadline`, `timeoutPolicy`, signal kinds | Approval control helper | Waitable gate engine | No ACP session transport; generic wait loop invokes controller | Gate-state file and wait read model. |
| Approval signal source | Persisted gate-state status/decision fields | Operator/OpenClaw outside P12 | `pollForApproval` | Poll interval default 30000 ms | `approval-decision.json`, transitions JSONL. |
| Discord approval request | Gate telemetry presentation payload with command examples | Approval runner | Operator UI | Emitted once on fresh start, not duplicated on pending resume | Request JSON/Markdown artifacts. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Approval typed control/wait result | `tests/verification/contracts/check-gate-control-result-surface.mjs` | Good contract/delegation coverage | None. |
| Approval wait/resume/timeout behavior | `tests/verification/behavior/areas/approvals.mjs` | Strong behavior coverage | None. |
| Gate runner integration | `tests/verification/behavior/areas/gates.mjs`, `pipeline.mjs` | Good integration coverage | None. |
| Operator/audit artifacts | `approvals.mjs` | Good state/audit coverage | None. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- None yet.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
