# Batch P09 — Nova generic gate engines and stage envelopes

Status: completed
Date started: 2026-05-08
Date completed: 2026-05-08
Reviewer: Nova

## Scope

```text
skills/nova/pipeline/runners/gate-runner.js
skills/nova/pipeline/runners/gate-forge-fix-cycle.js
skills/nova/pipeline/runners/remediable-gate-engine.js
skills/nova/pipeline/runners/stage-envelope-primitives.js
skills/nova/pipeline/runners/waitable-gate-engine.js
skills/nova/pipeline/services/gate-active-session.js
skills/nova/pipeline/services/gate-fix-scaffold.js
```

Scope expansion verified live: 7 files, under the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/nova/pipeline/runners/gate-runner.js
kubeclaw-main/skills/nova/pipeline/runners/gate-forge-fix-cycle.js
kubeclaw-main/skills/nova/pipeline/runners/remediable-gate-engine.js
kubeclaw-main/skills/nova/pipeline/runners/stage-envelope-primitives.js
kubeclaw-main/skills/nova/pipeline/runners/waitable-gate-engine.js
kubeclaw-main/skills/nova/pipeline/services/gate-active-session.js
kubeclaw-main/skills/nova/pipeline/services/gate-fix-scaffold.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/contracts/check-gate-active-session-surface.mjs
kubeclaw-main/tests/verification/contracts/check-gate-control-result-surface.mjs
kubeclaw-main/tests/verification/contracts/check-gate-fix-scaffold-surface.mjs
kubeclaw-main/tests/verification/contracts/check-remediation-handoff-surface.mjs
kubeclaw-main/tests/verification/contracts/check-stage-envelope-primitives-surface.mjs
kubeclaw-main/tests/verification/behavior/areas/gates.mjs
kubeclaw-main/tests/verification/behavior/areas/approvals.mjs
kubeclaw-main/tests/verification/behavior/areas/fix-cycles.mjs
kubeclaw-main/tests/verification/behavior/areas/gate-session-persistence.mjs
kubeclaw-main/tests/verification/behavior/areas/polling.mjs
```

## Per-file map

### `skills/nova/pipeline/runners/gate-runner.js`

Role: Generic gate dispatch layer for registry-owned standard, remediable, and waitable gate types.

Imports/dependencies: Node `fs`/`path`; logger/runtime/constants; plugin context/registry; path builders; telemetry; Discord field helpers; status-store gate readers; remediable/waitable engines; stage-envelope primitives; gate-control and pipeline-step contracts.

Exports/public surface: `runGate` default/named export.

Defines: Dependency seam, Discord/correlation helpers, gate artifact/state/input/plugin invocation builders, gate-control adapter validator, control-result normalization, standard/remediable/waitable route selection, runtime/dispatch failure projections.

Important variables/state: May set `config._logDir` and `config._runLogDir` in `ensureGatePluginLogDirs`. No module-global mutable state.

Calls out to: `requireGateTypeOwner`, `requireStageHandler`, plugin handlers, `createPluginContext`, gate-control adapters, `runScheduledRemediableGate`, `runScheduledWaitableGate`, status-store read helpers, telemetry emitters.

Called by / expected callers: Pipeline runner loop, approval/review/buster gate tests, plugin registry built-ins.

Environment variables / CLI inputs / config fields: Reads `progress.gates[gateId]`, gate `type/title/output_file/instructions_file/timeout_minutes`, `opts.novaPrompt`, config run/log/path fields and registry.

Paths built/read/written: Builds gate output/status/active-session/instructions artifact refs, pipeline run log dir, swarm-root-relative gate file paths. Reads only through status-store/read helpers and `collectExistingArtifactRefs` existence checks; creates run log dir when missing.

Authority behavior: Owns generic gate execution envelope and typed pipeline-step projection. Gate-type owners own gate-specific control adapter/coercion/remediation/wait controllers.

Error/retry/terminal behavior: Missing gate registry/gate/owner emits dispatch failure with CRITICAL telemetry and terminal error step result. Adapter validation/handler/contract errors emit execution failure with diagnostics and terminal error step result. Remediable/waitable loops own retry/wait mechanics.

Verification coverage: Gate behavior tests cover unknown/missing gate paths and registered gate execution; contract tests cover gate-control/stage-envelope/remediation surfaces.

Findings: None.

### `skills/nova/pipeline/runners/gate-forge-fix-cycle.js`

Role: Shared Forge fix-cycle engine for remediable gates.

Imports/dependencies: Logger/constants/runtime; ACP transcript progress classifier; gate rate-limit finalizer; gate fix scaffold start/finish helpers.

Exports/public surface: `runGateForgeFixCycle`.

Defines: Fix-cycle identity/correlation helpers, configurable message rendering, spawn/health/rate-limit/no-change/success routes, fix history update, optional success hooks.

Important variables/state: Mutates local correlation from scaffold start; pushes `{ attempt, hasChanges, issues }` into caller-provided `fixHistory`.

Calls out to: `deps.discord`, `startGateForgeFixCycleScaffold`, `finishGateForgeFixCycleScaffold`, `finalizeGateSessionRateLimitExit`, `deps.gitCommitAndPush`, callbacks supplied by gate-specific adapters.

Called by / expected callers: Review/Buster gate fix-cycle adapters through remediable gate controllers.

Environment variables / CLI inputs / config fields: Reads `config.rate_limit.max_pauses_per_module`, gate model/thinking through scaffold, cycle/maxFixCycles, timeout minutes, prompt labels/messages.

Paths built/read/written: Prompt/transcript artifacts and active-session files delegated to scaffold. Git commit/push delegated.

Authority behavior: Owns generic Forge fix-cycle lifecycle and result modes; gate-specific adapters own prompt text, re-evaluation, and terminal control-result construction.

Error/retry/terminal behavior: Spawn/health/no-change return `retry_request_fix`; rate-limit returns terminal control result; successful changes commit softly and return `re_evaluate` with optional control result. Discord/Git/helper errors are mostly propagated except scaffold non-critical artifact writes.

Verification coverage: Fix-cycle behavior tests and gate-fix-scaffold contract tests cover interruption/correlation/artifact surfaces.

Findings: None.

### `skills/nova/pipeline/runners/remediable-gate-engine.js`

Role: Shared remediable gate control loop and scheduled plugin execution wrapper.

Imports/dependencies: Node `fs`/`path`; plugin context/registry; path builder; remediation handoff service.

Exports/public surface: `finalizeGateCompatibilityResult`, `runRemediableGateControlLoop`, `runRemediableGateControlLoopResult`, `runScheduledRemediableGate`.

Defines: Gate plugin log-dir helper, compatibility projection filler, compatibility-only remediation loop, typed remediation loop, scheduled remediable plugin execution.

Important variables/state: May set `config._logDir`/`_runLogDir`; loop-local `controlResult` changes across remediation cycles.

Calls out to: `resolveGateRemediationController`, `readGateRemediationSpec`, `isGateRemediationControlResult`, `bumpGateRemediationControlResult`, `runGateRemediationHandoff`, `requireStageHandler`, plugin handler, `normalizeControlResult`.

Called by / expected callers: `gate-runner.js` for remediable gate adapters; contract tests.

Environment variables / CLI inputs / config fields: Reads config `paths.swarm_dir`, plugin registry stage owner, gate remediation policy from control result.

Paths built/read/written: Creates pipeline run log dir through `pipelineRunLogDir(config)`. No other direct file IO.

Authority behavior: Owns generic request-fix loop mechanics; remediation controller owns actual fix/evaluation/exhaustion semantics.

Error/retry/terminal behavior: Missing normalizer or invalid/terminal remediation outcomes throw. Invalid cycle bounds build exhausted control result. `retry_request_fix` bumps next cycle and continues. `terminal` returns terminal control result.

Verification coverage: `check-remediation-handoff-surface.mjs` and fix-cycle behavior tests.

Findings: None.

### `skills/nova/pipeline/runners/stage-envelope-primitives.js`

Role: Small shared primitive helpers for stage refs, plugin invocation identity, and existing artifact filtering.

Imports/dependencies: Node `fs`.

Exports/public surface: `buildStageRefs`, `buildStagePluginInvocation`, `collectExistingArtifactRefs`.

Defines: Reference-string builder, invocation object builder, file-existence artifact filter.

Important variables/state: None.

Calls out to: `fs.existsSync` by default.

Called by / expected callers: Gate runner, module-runner shared builders, pipeline scheduling/generator builders, contract tests.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: Does not build paths itself; checks candidate artifact paths for existence.

Authority behavior: Owns canonical stage ref string format `prefix:part:part` and avoids refs with missing parts.

Error/retry/terminal behavior: No local catch; invalid/missing candidates are skipped.

Verification coverage: `check-stage-envelope-primitives-surface.mjs`.

Findings: None.

### `skills/nova/pipeline/runners/waitable-gate-engine.js`

Role: Shared waitable gate control loop and scheduled plugin execution wrapper.

Imports/dependencies: Plugin context/registry and remediable engine compatibility finalizer.

Exports/public surface: `validateGateWaitController`, `resolveGateWaitController`, `runWaitableGateControlLoop`, `runWaitableGateControlLoopResult`, `runScheduledWaitableGate`.

Defines: Wait controller validation, compatibility-only wait loop, typed wait loop, scheduled waitable plugin execution.

Important variables/state: None.

Calls out to: `requireStageHandler`, plugin handler, `createPluginContext`, `buildPluginInvocationEnvelope`, `createWaitController`, `normalizeControlResult`, `waitController.waitForSignal`, `projectCompatibilityResult`.

Called by / expected callers: `gate-runner.js` for approval/waitable gates; approval behavior tests.

Environment variables / CLI inputs / config fields: Reads plugin registry stage owner, gate config through input envelope.

Paths built/read/written: None directly.

Authority behavior: Owns generic wait-action resolution; gate-specific wait controller owns signal persistence/wait behavior.

Error/retry/terminal behavior: Missing/invalid wait controller throws. Non-wait control results pass through. Wait result is normalized in typed loop before projection.

Verification coverage: Approval behavior tests and gate-control contract tests.

Findings: None.

### `skills/nova/pipeline/services/gate-active-session.js`

Role: Shared active gate-session persistence and recovery-evidence authority helper.

Imports/dependencies: Node `fs`/`path`; gate active-session path; logger; lifecycle read models; session-authority helpers.

Exports/public surface: `GATE_ACTIVE_SESSION_EVIDENCE_ROLES`, `buildGateActiveSessionRecoveryPolicy`, `resolveGateActiveSessionRecoveryEvidence`, `persistGateActiveSession`, `clearGateActiveSession`.

Defines: Atomic JSON writer, best-effort JSON reader, active-session entry normalizer, lifecycle read-model active-session lookup, recovery policy builder, persistence and clear helpers.

Important variables/state: Writes/removes gate active-session recovery JSON file. Uses lifecycle read model when strong identity exists.

Calls out to: `gateActiveSessionPath`, `loadLifecycleReadModels`, `normalizeActiveSessionIdentity`, `hasStrongActiveSessionIdentity`, `buildActiveSessionConfirmation`, logger.

Called by / expected callers: Gate fix scaffold, review/buster gate helpers, pipeline stale recovery, gate active-session tests.

Environment variables / CLI inputs / config fields: Requires `config._logDir` and `gateId` for persist/clear; run id from config/entry/extra.

Paths built/read/written: Reads/writes/deletes `gateActiveSessionPath(config, gateId)` atomically using `.tmp` rename.

Authority behavior: Lifecycle active session is authoritative when strong; file/tracked-agent are recovery evidence only. File authority and tracked-agent authority are explicitly disallowed in returned policy.

Error/retry/terminal behavior: Corrupt file reports parse error and still returns recovery evidence state. `persistGateActiveSession` no-ops without `_logDir`, gate id, or session key. `clearGateActiveSession` ignores ENOENT and logs DEBUG on other errors.

Verification coverage: `check-gate-active-session-surface.mjs`, gate-session-persistence behavior tests, restart recovery tests.

Findings: None.

### `skills/nova/pipeline/services/gate-fix-scaffold.js`

Role: Shared side-effect scaffold for starting and finishing Forge gate fix sessions.

Imports/dependencies: Node `fs`/`path`; logger; gate log path; redaction artifact helpers; gate active-session helpers.

Exports/public surface: `startGateForgeFixCycleScaffold`, `finishGateForgeFixCycleScaffold`.

Defines: Forge policy/model resolution, redacted prompt artifact write, Forge spawn/healthcheck, active-session persistence, session polling, redacted transcript archival, kill/clear active session.

Important variables/state: Persists gate active-session file on spawn; clears it after successful kill/health-fail cleanup.

Calls out to: `deps.resolvePolicy`, `deps.logEffectivePolicy`, `deps.acpLabel`, `deps.spawnAgent`, `deps.getTrackedAgent`, `deps.verifyAgentAlive`, `deps.killAgent`, `deps.pollForSessionEnd`, `writeRedactedPromptArtifact`, `copyRedactedTranscriptArtifact`, `persistGateActiveSession`, `clearGateActiveSession`.

Called by / expected callers: `gate-forge-fix-cycle.js`.

Environment variables / CLI inputs / config fields: Reads gate `forge_model`, `forge_thinking_level`, gate id/type, cycle, fix label/prompt, timeout.

Paths built/read/written: Writes redacted prompt `gates/<gateId>/forge-fix-prompt-cycle-<cycle>.md`; copies redacted transcript to `gates/<gateId>/forge-fix-transcript-cycle-<cycle>.jsonl`; writes/removes gate active-session file.

Authority behavior: Owns generic fix-session side effects shared by gate types; caller owns prompt content and cycle policy.

Error/retry/terminal behavior: Prompt artifact write failures are swallowed; spawn errors return `{ ok:false, stage:'spawn' }`; healthcheck failure kills and clears active session if killed; transcript copy failures log DEBUG; kill result controls active-session clear.

Verification coverage: `check-gate-fix-scaffold-surface.mjs`, gate-session-persistence, fix-cycle/polling behavior tests.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `gate-runner.js` | `stage-envelope-primitives.js` | `buildStageRefs`, `buildStagePluginInvocation`, `collectExistingArtifactRefs` | Gate run-input and artifact envelope. |
| `gate-runner.js` | `remediable-gate-engine.js` | `runScheduledRemediableGate`, `finalizeGateCompatibilityResult` | Remediable gate loop route. |
| `gate-runner.js` | `waitable-gate-engine.js` | `runScheduledWaitableGate` | Waitable gate loop route. |
| `remediable-gate-engine.js` | `remediation-handoff.js` | remediation controller/loop helpers | Generic request-fix loop mechanics. |
| `waitable-gate-engine.js` | gate-specific wait controller | `waitForSignal` | Generic wait resolution. |
| `gate-forge-fix-cycle.js` | `gate-fix-scaffold.js` | start/finish scaffold | Shared Forge fix side effects. |
| `gate-fix-scaffold.js` | `gate-active-session.js` | persist/clear helpers | Gate active-session recovery evidence. |
| `gate-active-session.js` | `session-authority.js` and lifecycle read models | identity normalization/confirmation | Lifecycle active session authority. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `runGate` | Missing `progress.gates`, missing gate, unknown gate type | Progress/registry | Dispatch failure terminal error step result | Fail-closed gate dispatch. |
| `requireGateControlAdapter` | Adapter missing/invalid mode/missing methods | Gate type owner adapter | Throw execution failure | Ensures gate type owners implement contract. |
| `runScheduledRegistryGate` | Adapter mode standard/remediable/waitable | `adapter.mode` | Standard plugin, remediable loop, or waitable loop | Generic gate route selection. |
| `normalizeGateControlResultForAdapter` | Remediable vs standard/waitable | Adapter mode | Remediable or standard typed normalizer | Enforces correct control-result contract. |
| `runGateForgeFixCycle` | Spawn failure/health failure/rate-limit/no changes/success | Scaffold/session result | Retry request, terminal, or re-evaluate | Shared fix-cycle outcome routing. |
| `runRemediableGateControlLoopResult` | `request_fix`, invalid cycle, terminal/retry/re-evaluate | Control result remediation policy/fix outcome | Exhausted, terminal, bump cycle, evaluate | Remediation loop authority. |
| `runWaitableGateControlLoopResult` | `nextAction === 'wait'` | Control result | Wait for signal and normalize resolved result | Generic wait gate authority. |
| `buildGateActiveSessionRecoveryPolicy` | Lifecycle strong identity and file/tracked conflicts | Active-session evidence | Lifecycle authoritative, file/tracked evidence-only, conflict flags | Prevents stale gate file authority. |
| `startGateForgeFixCycleScaffold` | Spawn/health success/failure | Agent spawn/health result | Active-session persist, spawn failure, health failure, OK | Shared Forge fix startup. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `ensureGatePluginLogDirs` | `config._logDir`, `_runLogDir` | `paths.swarm_dir` and run id | Fill missing fields, mkdir run dir | Plugin logs have run-scoped directory. |
| `buildGateRunInput` | Gate input object | Gate config/status/lifecycle/completion reads | Config copy plus existing artifact refs and state snapshot | Plugin receives deterministic structured envelope. |
| `finalizeGateCompatibilityResult` | Compatibility projection | Adapter projection/gate id/type | Adds `gate`, `gate_id`, `gate_type` fallbacks | Legacy projection has gate identity. |
| `runRemediableGateControlLoopResult` | Loop control result | Fix outcome | Terminal returns, retry bumps cycle, re-evaluate replaces control result | Loop ends on non-remediation control result. |
| `persistGateActiveSession` | Gate active-session JSON | Tracked entry and extra fields | Extra/run entry fallbacks; writes atomically | Recovery evidence persisted after spawn. |
| `buildGateActiveSessionRecoveryPolicy` | Recovery policy object | Lifecycle/file/tracked evidence | Lifecycle strong identity outranks file/tracked; conflicts recorded | File/tracked never authoritative. |
| `finishGateForgeFixCycleScaffold` | Transcript artifact/active-session file | Stream path and kill result | Copy if source exists; clear only when kill returns true | Fix session cleanup evidence. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `runRemediableGateControlLoopResult` | While control result is remediation request | None locally | Cycle bounds from remediation policy | Terminal, exhausted, non-remediation result. |
| `runGateForgeFixCycle` | Single fix cycle invocation | None locally | Rate-limit max fallback from config, timeout passed to scaffold | Returns retry/terminal/re-evaluate mode. |
| `finishGateForgeFixCycleScaffold` | Polling delegated to `deps.pollForSessionEnd` | Delegated | `timeoutMinutes` input | Returns session result then kills agent. |
| `runWaitableGateControlLoopResult` | One wait resolution | Wait controller owns sleep/backoff | Wait controller owns timeout | Returns normalized resolved control result. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `progress.gates[gateId]` | Progress config | `runGate`, input builders | Required | Gate config and type lookup. |
| Gate `type/title/output_file/instructions_file/timeout_minutes` | Gate config | `gate-runner.js` | Type required; timeout optional | Gate envelope/artifacts/deadline. |
| Gate `forge_model`, `forge_thinking_level` | Gate config | `startGateForgeFixCycleScaffold` | Policy resolver fallback | Forge fix-cycle model/thinking. |
| `opts.novaPrompt` | Run option | `buildGateRunInput`, plugin invocation | null | Forwarded to gate plugin context. |
| `config.paths.swarm_dir`, `_logDir`, `_runLogDir` | Config paths | Gate runner/remediable/scaffold/active-session | Derived when missing | Gate logs, run logs, active-session path. |
| `config.rate_limit.max_pauses_per_module` | Config field | `runGateForgeFixCycle` | `5` fallback | Gate fix rate-limit terminal projection. |
| Gate-control adapter fields | Registry adapter | `gate-runner.js` | Gate type owner | `mode`, `coerce`, `projectCompatibilityResult`, optional controllers. |
| Remediation policy fields | Control result diagnostics | `remediable-gate-engine.js` | Gate adapter produced | `maxFixCycles`, `nextFixCycle`. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| Gate output path | `buildGateArtifactRefs` via `swarmRoot(config)` + `gate.output_file` | Gate plugins/state snapshot | Gate-specific runners | Existing artifact ref only in P09. |
| Gate status path | `gateStatusPath(config, gateId)` | Gate plugins/state snapshot | Gate-specific runners/status-store | Existing artifact ref/read helper. |
| Gate active-session path | `gateActiveSessionPath(config, gateId)` | Gate runner artifact refs, recovery evidence | `persistGateActiveSession`, `clearGateActiveSession` | Recovery evidence; lifecycle read model remains authority. |
| Gate instructions path | `swarmRoot(config)` + `gate.instructions_file` | Gate plugins | Operators/gate setup | Existing artifact ref only. |
| Pipeline run log dir | `pipelineRunLogDir(config)` | Plugin log writers | `ensureGatePluginLogDirs` | Created when missing. |
| Gate fix prompt artifact | `gateLogDir(config, gateId)/forge-fix-prompt-cycle-<cycle>.md` | Operators/debugging | `writeRedactedPromptArtifact` | Redacted prompt archive. |
| Gate fix transcript artifact | `gateLogDir(config, gateId)/forge-fix-transcript-cycle-<cycle>.jsonl` | Operators/debugging | `copyRedactedTranscriptArtifact` | Redacted transcript archive if source exists. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Generic gate dispatch envelope | `gate-runner.js` | Plugin handlers and tests | None. |
| Gate-type execution mode and coercion | Registry gate-control adapter | `gate-runner.js` | Gate-specific adapters reviewed in P10-P12. |
| Remediable gate loop mechanics | `remediable-gate-engine.js` and remediation handoff service | Review/Buster gate adapters | None. |
| Waitable gate loop mechanics | `waitable-gate-engine.js` and gate wait controller | Approval gate adapters | None. |
| Gate Forge fix side effects | `gate-fix-scaffold.js` | Generic fix-cycle engine/gate recovery | None. |
| Gate active-session recovery evidence | `gate-active-session.js` | Restart recovery/gate fix scaffold/tests | Lifecycle read model remains authoritative; file/tracked are evidence only. |
| Stage ref/envelope primitives | `stage-envelope-primitives.js` | Module/gate/generator input builders | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Gate run input | `buildGateRunInput` | `refs`, `ids`, `gate.config`, optional `instructionsRef`, `artifacts`, `priorResults`, `stateSnapshot`, `executionContext`, optional `deadline.timeoutMs` | Plugin envelope/context | Gate plugin handlers. |
| Gate state snapshot | `buildGateStateSnapshot` | pipeline project/run, gate id/type/title/output/status/lifecycle/completion booleans/status refs | Status-store read helpers | Gate plugins and tests. |
| Gate plugin invocation | `buildGatePluginInvocation` | `stageId`, `gateId`, `novaPromptProvided` | Stage invocation primitive | Plugin context. |
| Gate step result | `buildGateStepResultFromControl` | Typed pipeline-step result with gate correlation, remediation/wait diagnostics, compatibility projection | Pipeline-step contract helper | Pipeline runner loop. |
| Gate runtime error step result | `buildGateRuntimeErrorStepResult` | Typed error step result with `HALT`, `ERROR`, issue type, diagnostics | Pipeline-step contract helper | Pipeline runner terminal handling. |
| Gate active-session recovery policy | `buildGateActiveSessionRecoveryPolicy` | code, roles, authoritative/recovery identities, confirmations, conflict booleans | Session-authority helpers | Restart recovery and operators. |
| Gate active-session JSON | `persistGateActiveSession` | `gate_id`, `label`, `run_id`, `attempt`, `dispatch_id`, `session_key`, `stream_log_path`, `gateway_label`, `runtime`, `model`, `agent_id`, `tracked_at`, extra fields | Recovery evidence reader | Restart recovery/gate cleanup. |
| Fix-cycle scaffold result | `startGateForgeFixCycleScaffold` | `{ ok, fixLabel, fixAcpLabel, correlation }` or `{ ok:false, stage, error?, ... }` | Caller branch checks | Generic fix-cycle engine. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Gate plugin execution input | `buildGateRunInput` | Artifact refs listed in input | Structured gate config/state snapshot; no natural-language prompt body | Registry `gate.execute` handler | Typed gate control result. |
| Gate Forge fix prompt | Gate-specific adapter supplies `fixPrompt`; scaffold writes redacted copy | `gates/<gateId>/forge-fix-prompt-cycle-<cycle>.md` | Prompt body owned by P10/P11 adapters; P09 persists/forwards | Forge ACP/subagent via `deps.spawnAgent` | Session produces file changes or terminal no-change/rate-limit result. |
| Waitable gate signal | Gate-specific wait controller | Controller-owned | Wait controller owns operator/signal instructions | `waitForSignal` function | Resolved typed gate control result. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `runGate` | Missing gates map/gate/unknown type | No | No retry | Dispatch failure terminal error step result | None. |
| `runGate` | Adapter validation/plugin/contract execution failure | No | No retry | Execution failure terminal error step result with diagnostics | Contract diagnostics may include raw preview. |
| `ensureGatePluginLogDirs` | mkdir failure | No | No retry | Throws into execution failure path | None. |
| `runRemediableGateControlLoopResult` | Missing normalizer/controller invalid terminal outcome | No | No retry | Throws | None. |
| `runRemediableGateControlLoopResult` | Remediation cycle invalid/exhausted | No | No retry | Builds exhausted control result | Controller decides fields. |
| `runGateForgeFixCycle` | Forge spawn failure | Yes through remediation cycle budget | No local sleep; loop bumps next cycle | `retry_request_fix` | Error included in Discord. |
| `runGateForgeFixCycle` | Forge health failure | Yes through remediation cycle budget | No local sleep | Kills agent, retry request | None. |
| `runGateForgeFixCycle` | Rate-limit exhausted | No | Rate-limit service owns thresholds | Terminal control result | None. |
| `runGateForgeFixCycle` | No changes/timeout | Yes through remediation cycle budget | No local sleep | `retry_request_fix` | Transcript field derived; prompt/transcript artifacts redacted by scaffold. |
| `runGateForgeFixCycle` | Git commit/push failure | Soft | `softFail:true` | Continues to re-evaluate | None. |
| `waitable-gate-engine.js` | Invalid/missing wait controller | No | No retry | Throws into execution failure path | None. |
| `gate-active-session.js` | Corrupt active-session file | No | No retry | Reports parse error in evidence; does not throw | Parsed data discarded. |
| `persistGateActiveSession` | Missing config/log/gate/session | No | No retry | No-op | None. |
| `clearGateActiveSession` | Missing file/other unlink error | No | No retry | ENOENT ignored; other errors DEBUG log | None. |
| `gate-fix-scaffold.js` | Prompt artifact write failure | Soft | No retry | Swallowed | Prompt artifact uses redaction when write succeeds. |
| `gate-fix-scaffold.js` | Transcript artifact copy failure | Soft | No retry | DEBUG log and continue | Transcript copy uses redaction when succeeds. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `runGate` | Missing gates/gate/unknown type | Yes | Gate telemetry/Discord presentation/core log | `gate.started`, `gate.failed`, ERROR log | `emitGateDispatchFailure`, `log` | Terminal error step result. |
| `runGate` | Adapter/plugin/contract failure | Yes | Gate telemetry/Discord presentation/core log | `gate.started`, `gate.failed`, ERROR log | `emitGateExecutionFailure`, `log` | Diagnostics attached. |
| `ensureGatePluginLogDirs` | mkdir failure | Indirect | Execution failure telemetry | gate execution failed | `runGate` catch | Error caught by runGate. |
| `runRemediableGateControlLoopResult` | Missing normalizer/invalid terminal | Indirect | Execution failure telemetry | gate execution failed | `runGate` catch | Error caught by runGate. |
| `runRemediableGateControlLoopResult` | Exhausted remediation cycle | Yes downstream | Control result and gate terminal telemetry | adapter/projected result | Controller/gate runner | Gate adapter owns exhausted result content. |
| `runGateForgeFixCycle` | Forge spawn failure | Yes | Discord and gate fail telemetry | CRITICAL spawn failed; fix-cycle fail | `deps.discord`, `emitFixCycleFail` | Returns retry request. |
| `runGateForgeFixCycle` | Forge health failure | Yes | Discord and gate fail telemetry | WARN health failed; fix-cycle fail | `deps.discord`, `emitFixCycleFail` | Agent kill attempted in scaffold. |
| `runGateForgeFixCycle` | Rate-limit exhausted | Yes | Rate-limit telemetry/Discord/gate stats | rate-limit terminal event | `finalizeGateSessionRateLimitExit` | Pushes gate failed stat. |
| `runGateForgeFixCycle` | No changes/timeout | Yes | Core log, Discord, gate fail telemetry | WARN no changes/timeout | `log`, `deps.discord`, `emitFixCycleFail` | Transcript activity included. |
| `runGateForgeFixCycle` | Git commit/push failure | Indirect/soft | Git helper may log | softFail commit | `deps.gitCommitAndPush` | P09 does not inspect result. |
| `waitable-gate-engine.js` | Invalid wait controller | Indirect | Execution failure telemetry | gate execution failed | `runGate` catch | Error caught by runGate. |
| `gate-active-session.js` | Corrupt active-session file | Yes via evidence | Recovery evidence object | `file_parse_error` | `resolveGateActiveSessionRecoveryEvidence` | No log. |
| `persistGateActiveSession` | Missing config/log/gate/session | No | none | none | No-op | Intentional guard. |
| `clearGateActiveSession` | unlink non-ENOENT error | Yes | Core logger | DEBUG active session clear failed | `log` | ENOENT ignored. |
| `gate-fix-scaffold.js` | Prompt artifact write failure | No | none | none | Swallowed catch | Non-critical artifact loss. |
| `gate-fix-scaffold.js` | Transcript artifact copy failure | Yes | Core logger | DEBUG stream log save failed | `log` | Non-critical artifact loss. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js runtime | `node` binary | Observed `v24.14.0` during review | All P09 modules | ESM, fs/path sync IO, async control flow | No package pin in scoped files. |
| Node `fs`/`path` built-ins | Runtime built-ins | Node major 24 observed | Gate runner/remediable/stage/gate session/scaffold | Artifact existence, atomic JSON writes, mkdir, transcript copy source checks | Sync IO used. |
| Plugin registry/context | Internal source | Internal | Gate runner and engines | Gate type owner/stage handler dispatch | Missing handlers fail closed. |
| Gate/pipeline-step control contracts | Internal source | Internal | Gate runner/engines | Typed result normalization and pipeline projection | Contract failures become execution failure. |
| Remediation handoff service | Internal source | Internal | Remediable engine | Request-fix loop/controller normalization | Controller failures propagate. |
| ACP/session/worker services | Internal/external via deps | Internal gateway | Gate fix scaffold | Forge fix spawn/health/poll/kill | Backend behavior reviewed P04/P05. |
| Telemetry/Discord/rate-limit services | Internal/external | Internal/external | Gate runner/fix cycle | Operator alerts, rate-limit terminal behavior | Sink behavior reviewed elsewhere. |
| Redaction helpers | Internal source | Internal | Gate fix scaffold | Redacted prompt/transcript artifacts | Artifact failures non-critical. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Generic gate execution | One plugin invocation per gate dispatch | Pipeline loop sequential | Failure becomes terminal gate step error | Gate fail telemetry | None. |
| Remediable gate loop | Sequential fix/evaluate loop | `maxFixCycles` from remediation policy | Exhausted control result | Gate adapter telemetry/projection | None. |
| Waitable gate loop | One wait controller call | Controller-defined | Invalid controller throws; wait behavior delegated | Gate execution failure or controller events | Controller details reviewed P12. |
| Gate Forge fix session | One Forge session per fix cycle | Timeout minutes from gate adapter | Spawn/health/no-change retry request; rate-limit terminal | Discord/gate telemetry | None. |
| Gate active-session file | Single JSON file per gate | No locking | Atomic write via tmp rename; stale file evidence only | Recovery evidence policy | None. |
| Prompt/transcript artifacts | Synchronous redacted artifact IO | No retry | Prompt write swallowed; transcript copy DEBUG | DEBUG for transcript only | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Gate Forge fix spawn request | `spawnAgent(config, progress, 'forge', fixLabel, model, fixPrompt, opts)` | Gate fix scaffold | Agent orchestration/gateway | Backend retry/poll outside P09 | Correlation captured from tracked agent. |
| Gate fix active-session record | JSON with gate/session/run/dispatch/gateway/runtime/model/agent fields | `persistGateActiveSession` | Restart recovery/gate cleanup | Atomic write; no queue | Recovery policy marks file as evidence only. |
| Gate fix session poll | `pollForSessionEnd(config, fixAcpLabel, timeoutMinutes, fixLabel, metadata)` | Gate fix scaffold | Polling service | Polling delegated | Session result drives no-change/rate-limit/success. |
| Gate wait controller signal | `waitForSignal({ controlResult, gateId, gate })` | Waitable engine | Gate-specific controller | Controller-defined wait/backoff | Resolved typed control result. |
| Gate plugin envelope | `buildPluginInvocationEnvelope(gateInput, pluginContext)` | Gate runner/remediable/waitable engines | Registry gate handlers | In-process, no ACP transport | Gate run input schema listed above. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Stage envelope primitives | `tests/verification/contracts/check-stage-envelope-primitives-surface.mjs` | Strong source/export/behavior coverage | None. |
| Gate active-session helper | `tests/verification/contracts/check-gate-active-session-surface.mjs`, `gate-session-persistence.mjs` | Strong persistence/authority surface coverage | Full recovery flow covered in restart recovery. |
| Gate fix scaffold | `tests/verification/contracts/check-gate-fix-scaffold-surface.mjs`, `fix-cycles.mjs` | Good artifact/session surface coverage | Gate-specific prompt content reviewed P10/P11. |
| Remediable gate engine | `tests/verification/contracts/check-remediation-handoff-surface.mjs`, `fix-cycles.mjs` | Good loop/delegation coverage | Controller-specific behavior reviewed P10/P11. |
| Waitable gate engine | `approvals.mjs`, gate-control contracts | Good approval wait coverage | Approval-specific signals reviewed P12. |
| Generic gate dispatch | `gates.mjs`, `approvals.mjs`, `pipeline.mjs` | Broad behavior coverage | Individual gate implementations reviewed later. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- None yet.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
