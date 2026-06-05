# Batch P11 — Nova Buster gate

Status: completed
Date started: 2026-05-08
Date completed: 2026-05-08
Reviewer: Nova

## Scope

```text
skills/nova/pipeline/runners/buster-gate*.js
```

Scope expansion verified live: 6 files, under the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/nova/pipeline/runners/buster-gate-completion.js
kubeclaw-main/skills/nova/pipeline/runners/buster-gate-control.js
kubeclaw-main/skills/nova/pipeline/runners/buster-gate-fix-cycle.js
kubeclaw-main/skills/nova/pipeline/runners/buster-gate-runner.js
kubeclaw-main/skills/nova/pipeline/runners/buster-gate-task.js
kubeclaw-main/skills/nova/pipeline/runners/buster-gate-terminal.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/contracts/check-gate-control-result-surface.mjs
kubeclaw-main/tests/verification/contracts/check-gate-active-session-surface.mjs
kubeclaw-main/tests/verification/contracts/check-remediation-handoff-surface.mjs
kubeclaw-main/tests/verification/contracts/check-gate-fix-scaffold-surface.mjs
kubeclaw-main/tests/verification/behavior/areas/gates.mjs
kubeclaw-main/tests/verification/behavior/areas/fix-cycles.mjs
kubeclaw-main/tests/verification/behavior/areas/gate-session-persistence.mjs
kubeclaw-main/tests/verification/behavior/areas/polling.mjs
kubeclaw-main/tests/verification/behavior/areas/telemetry.mjs
kubeclaw-main/tests/verification/behavior/areas/stops.mjs
kubeclaw-main/tests/verification/behavior/areas/buster-runtime-normalization.mjs
```

## Per-file map

### `skills/nova/pipeline/runners/buster-gate-completion.js`

Role: Buster gate completion evidence adapter that maps Redis/local completion events into poll results.

Imports/dependencies: Logger, status constants, path helpers, status-store completion projection, completion adjudicator, pipeline event contract, completion event adapters, Buster completion controller, rate-limit builders, Buster gate identity helpers.

Exports/public surface: `waitBusterGateCompletionEvidence`.

Defines: Redis verdict parser, expected identity builders, Redis completion mapper, output-file completion mapper, gate watch paths, and event-wait lifecycle cleanup.

Important variables/state: Per-wait event bus and abort controller; Redis/local adapters stop in `finally`.

Calls out to: `createRedisCompletionEventAdapter`, `createLocalEvidenceEventAdapter`, `waitForBusterCompletion`, `buildGateLocalEvidenceResolver`, `adjudicateCompletionEvidence`, `projectGateCompletionState`, `buildGateSessionRateLimitStatus`, `buildGateTerminalOwnedRedisRateLimitExitResult`, `deps.pollResult`.

Called by / expected callers: `_runBusterGateOnce` in `buster-gate-runner.js`.

Environment variables / CLI inputs / config fields: Uses gate `type`; completion identity fields from runner.

Paths built/read/written: Builds watch paths for `gate.output_file` and `gate-status.json`; output-file evidence is read through `projectGateCompletionState`; Redis evidence arrives through the completion event adapter.

Authority behavior: Owns event-result mapping: Redis completion is evaluated first; output-file completion is local fallback. Completion adjudicator owns conflict/terminal-owned rate-limit authority.

Error/retry/terminal behavior: Completion conflicts, terminal-owned Redis rate-limit, timeout, PASS, FAIL, invalid output contract, and output-file rate-limit are mapped to poll result objects. Redis verdict JSON parse failure returns null verdict rather than throwing.

Verification coverage: Gates, polling, telemetry, and gate-control contract tests cover completion mapping/rate-limit/conflict paths.

Findings: None.

### `skills/nova/pipeline/runners/buster-gate-control.js`

Role: Buster gate typed-control result, issue extraction, failure-class mapping, and remediation request builder.

Imports/dependencies: Status/exit constants, runtime run id, gate-control contract helpers, remediation request builder, correlation helpers.

Exports/public surface: `buildBusterIssueFindings`, `buildBusterGateControlResult`, `isBusterGateControlResult`, `coerceBusterGateControlResult`, `extractGateIssues`, `buildBusterRequestFixControlResult`.

Defines: Failure-class inference from compatibility result, typed finding builders, Buster verdict/output issue extraction, request-fix control result construction.

Important variables/state: No module-global state.

Calls out to: `mapGateCompatibilityResultToControl`, `buildTypedGateControlResult`, `coerceTypedGateControlResult`, `buildGateRemediationRequestControlResult`, correlation resolvers.

Called by / expected callers: Buster gate runner/terminal/fix-cycle, generic gate runner through adapter, contract tests.

Environment variables / CLI inputs / config fields: Reads `config.default_max_fails`, run id fields, gate `type`, opts max fix cycles/attempt/correlation.

Paths built/read/written: None. Remediation diagnostics carry status/issue data only.

Authority behavior: Owns Buster producer-type typed control-result schema, failure-class vocabulary, and issue extraction from output/Redis verdicts.

Error/retry/terminal behavior: Coercion can throw via contract helper. Missing/unknown issue details degrade to a generic `Gate test failure` issue. Failure-class inference maps rate-limit/timeout/git/spawn/parse/config/fix-loop/verdict classes.

Verification coverage: Gate-control and remediation-handoff contract tests; gates/fix-cycles behavior tests.

Findings: None.

### `skills/nova/pipeline/runners/buster-gate-fix-cycle.js`

Role: Buster-specific Forge fix-cycle adapter around the generic gate fix-cycle engine.

Imports/dependencies: Node `fs`/`path`; logger/runtime/path helpers; remediation spec reader; gate-control clone helper; generic gate Forge fix-cycle runner.

Exports/public surface: `performBusterGateFixAttempt`.

Defines: Remediation control-result patcher, issue bullet renderer, Buster fix prompt invocation, active-session metadata, Discord message templates, pre-retest stale output/status cleanup.

Important variables/state: Uses caller-provided `fixHistory`; generic fix cycle appends history. No module-global state.

Calls out to: `readGateRemediationSpec`, `deps.buildGateFixPrompt`, `runGateForgeFixCycle`, `deps.archiveGateOutputIfPresent`, `buildBusterGateControlResult`.

Called by / expected callers: `runBusterGateFixAttempt` in Buster gate runner.

Environment variables / CLI inputs / config fields: Reads gate `max_fix_cycles`, `timeout_minutes`, `output_file`, `type`; `config.default_max_fails`, `config.default_timeout_minutes`.

Paths built/read/written: Builds and deletes stale `gate.output_file` under swarm root and `gateStatusPath(config, gateId)` before retest; archives both first through deps.

Authority behavior: Owns Buster-specific fix prompt/correlation cleanup and retest preparation; generic fix cycle owns ACP Forge session mechanics.

Error/retry/terminal behavior: Missing gate throws. Archive/delete cleanup errors are swallowed. Spawn/health/no-change/rate-limit/success are delegated to generic fix cycle; rate-limit is converted to Buster typed control result.

Verification coverage: Fix-cycle and gate-session-persistence behavior tests; gate-fix-scaffold contract tests.

Findings: None.

### `skills/nova/pipeline/runners/buster-gate-runner.js`

Role: Buster gate lifecycle orchestrator: completion skip, stale cleanup, Buster dispatch/poll/kill, rate-limit wrapper, remediation controller wiring.

Imports/dependencies: Node `fs`/`path`; logger/constants/runtime/config/path/git/Discord; status-store; polling/Redis; rate-limit; Buster gate prompts; gate-fix prompts; agent orchestration/lifecycle; telemetry; Discord fields; redaction; remediation handoff; gate active-session; remediable gate engine; gate-control contracts and P11 helpers.

Exports/public surface: `projectBusterGateCompatibilityResult`, `buildBusterRemediationExhaustedControlResult`, `runBusterGateEvaluation`, `runBusterGateFixAttempt`, `createBusterGateRemediationController`, `getBusterGateControlAdapter`, `runBusterGate`, `runBusterGateStage`.

Defines: Dependency seam, Discord field builder, single Buster attempt executor, exhausted remediation control result, gate evaluation, fix attempt wrapper, remediation controller, remediable adapter, legacy/direct runner.

Important variables/state: Mutates run stats `total_buster_attempts`, `gates_failed`, `gates_completed`. Persists/clears gate active-session evidence around Buster agent spawn/kill.

Calls out to: `buildBusterGatePrompt`, `validateBusterConfig`, `archiveModuleCompletions`, `spawnAgent`, `waitBusterGateCompletionEvidence`, `killAgent`, `handleBusterGateEvaluationResult`, `runRemediableGateControlLoop`.

Called by / expected callers: Gate registry/generic gate runner, direct Buster gate tests, legacy callers.

Environment variables / CLI inputs / config fields: Reads `config._testOverrides.busterGate`, `default_timeout_minutes`, `default_max_fails`, `rate_limit.max_pauses_per_module`, gate `model`, `type`, `title`, `output_file`, `timeout_minutes`, `max_fix_cycles`, `on_fail`.

Paths built/read/written: Writes redacted Buster prompt artifact `gates/<gateId>/buster-prompt-attempt-<n>.md`; archives/deletes stale `gate.output_file` and `gate-status.json`; prompt/log paths from `gateLogDir` and `gateStatusPath`.

Authority behavior: Owns Buster gate setup/dispatch/wait orchestration and remediable adapter. Terminal outcome mapping is delegated to `buster-gate-terminal.js`; completion evidence mapping to `buster-gate-completion.js`.

Error/retry/terminal behavior: Missing gate throws. Existing PASS output skips. Stale outputs are archived/deleted on first attempt. Instruction read/config invalid/spawn/archive failures return fail poll/control paths. Rate-limit wrapper preserves attempt count. Invalid `maxFixCycles < 1` for fix loop returns unexpected needs-Nova compatibility result.

Verification coverage: Gates, stops, telemetry, polling, fix-cycles, gate-session-persistence and Buster runtime normalization behavior tests.

Findings: None.

### `skills/nova/pipeline/runners/buster-gate-task.js`

Role: Pure Buster gate dispatch identity/payload helper functions.

Imports/dependencies: None.

Exports/public surface: `createBusterGateCompletionIdentity`, `buildBusterGateRateLimitStatusOptions`, `buildBusterGateArchiveIdentity`, `buildBusterGateArchiveTarget`, `buildBusterGateSpawnOptions`, `buildBusterGateActiveSessionMetadata`, `buildBusterGateActiveCompletionIdentity`, `applyTrackedBusterGateIdentity`, `syncBusterGateRateLimitStatusOptions`.

Defines: Completion identity, Redis archive identity/target, spawn options, active-session metadata, completion identity projection, tracked-agent identity merge, rate-limit option sync.

Important variables/state: Mutates passed `completionIdentity` in `applyTrackedBusterGateIdentity` and passed `statusOptions` in `syncBusterGateRateLimitStatusOptions`.

Calls out to: `Date.now()` only through default argument.

Called by / expected callers: Buster gate runner and completion adapter.

Environment variables / CLI inputs / config fields: Uses gate `type` and complete gate object in spawn/archive target.

Paths built/read/written: None.

Authority behavior: Owns Buster gate identity shape and precedence after tracked-agent spawn: tracked dispatch/gateway/session override generated fallbacks.

Error/retry/terminal behavior: No throws expected; absent tracked agent leaves generated dispatch id and null session.

Verification coverage: Buster runtime normalization, polling, and gate tests exercise identity/correlation indirectly.

Findings: None.

### `skills/nova/pipeline/runners/buster-gate-terminal.js`

Role: Post-attempt Buster gate result handler for PASS, setup/runtime failures, rate-limit, verdict failures, and request-fix construction.

Imports/dependencies: Node `fs`/`path`; logger; constants/runtime/path helpers; telemetry; rate-limit finalizer; correlation resolvers.

Exports/public surface: `handleBusterGateEvaluationResult`.

Defines: PASS artifact persistence, failure classification branches, rate-limit finalization, fix-loop request vs terminal needs-Nova mapping.

Important variables/state: Mutates run stats `gates_completed`/`gates_failed`; writes gate status/output artifacts on PASS.

Calls out to: `onGatePass`, `onGateFail`, `finalizeGateSessionRateLimitExit`, `deps.gitCommitAndPush`, callbacks for control/request-fix builders and issue extraction.

Called by / expected callers: `runBusterGateEvaluation`.

Environment variables / CLI inputs / config fields: Uses gate `type`, `title`, `output_file`; timeout/maxRateLimitPauses/maxFixCycles/hasFixLoop from runner.

Paths built/read/written: Writes `gateStatusPath(config, gateId)` PASS JSON and optional `gate.output_file` PASS JSON under swarm root. Commits PASS gate-status with soft-fail Git.

Authority behavior: Owns Buster gate terminal presentation and typed control-result mapping after one evaluation attempt.

Error/retry/terminal behavior: PASS persists artifacts best-effort. Config invalid returns `EXIT_NEEDS_NOVA`. Spawn/invalid-contract/git return `EXIT_ERROR`. Parse-corrupted returns `EXIT_NEEDS_NOVA`. Timeout returns `EXIT_TIMEOUT`. Rate-limit returns `EXIT_RATE_LIMITED`. Verdict FAIL enters request-fix when `hasFixLoop`, otherwise terminal `EXIT_NEEDS_NOVA`.

Verification coverage: Gates, stops, telemetry, fix-cycles and polling behavior tests.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `buster-gate-runner.js` | `buster-gate-task.js` | identity/archive/spawn/rate-limit helpers | Pure Buster gate correlation and payload helpers. |
| `buster-gate-runner.js` | `buster-gate-completion.js` | `waitBusterGateCompletionEvidence` | Event-driven Redis/local evidence mapping. |
| `buster-gate-runner.js` | `buster-gate-terminal.js` | `handleBusterGateEvaluationResult` | Terminal outcome and request-fix mapping. |
| `buster-gate-runner.js` | `buster-gate-fix-cycle.js` | `performBusterGateFixAttempt` | Buster-specific Forge fix adapter. |
| `buster-gate-runner.js` | `buster-gate-control.js` | control/result/issue helpers | Typed Buster control-result authority. |
| `buster-gate-fix-cycle.js` | `gate-forge-fix-cycle.js` | `runGateForgeFixCycle` | Shared Forge fix side effects. |
| `buster-gate-runner.js` | `remediable-gate-engine.js` | `runRemediableGateControlLoop` | Shared request-fix loop. |
| `buster-gate-runner.js` | `gate-active-session.js` | `persistGateActiveSession`, `clearGateActiveSession` | Active gate-session recovery evidence. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `waitBusterGateCompletionEvidence` | Redis completion, local evidence, or fatal event arrives | Completion controller result | Map Redis first | Redis completion has precedence over file projection. |
| `buildRedisCompletionPollResult` | Conflict/rate-limited/timeout/PASS/FAIL | Adjudicated completion | Completion conflict, terminal rate-limit, pause, PASS, FAIL | Completion authority mapping. |
| `buildFileCompletionPollResult` | Invalid output/parse/rate-limited/done/not done | `projectGateCompletionState` | Terminal invalid, parse marker, pause, poll result, or continue | Output-file fallback mapping. |
| `_runBusterGateOnce` | First attempt config invalid/archive failed/spawn failed | Attempt/config/Redis archive/spawn | Return failing poll result before polling | Pre-dispatch fail-fast. |
| `runBusterGateEvaluation` | Existing canonical PASS output on attempt 1 | `readBusterGateCompletion` | Skip Buster dispatch with OK control result | Resume idempotence. |
| `runBusterGateEvaluation` | Stale output/status on attempt 1 | Existing completion artifacts | Archive/delete before dispatch | Prevent stale completion from winning. |
| `handleBusterGateEvaluationResult` | `result.ok` | Poll result | PASS artifacts, telemetry, OK control result | PASS terminal projection. |
| `handleBusterGateEvaluationResult` | `config_invalid`, `spawn_failed`, `invalid_contract`, `parse_corrupted`, `timeout`, `git_error`, `rate_limit_exhausted` | `result.reason` | Typed terminal failure by class | Buster terminal semantics. |
| `handleBusterGateEvaluationResult` | Verdict FAIL with `hasFixLoop` | `gate.on_fail` and extracted issues | Build `request_fix` control result | Remediation handoff. |
| `performBusterGateFixAttempt` | Successful fix before retest | Gate output/status paths | Archive/delete stale outputs/status | Retest must observe fresh Buster evidence. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `applyTrackedBusterGateIdentity` | `completionIdentity` | Generated identity and tracked agent | Tracked dispatch/gateway/session override generated fallback | Poll identity matches spawned agent. |
| `syncBusterGateRateLimitStatusOptions` | Rate-limit status options | Updated completion identity | Dispatch/gateway/session fallbacks copied from identity | Cooldown telemetry preserves correlation. |
| `_runBusterGateOnce` | Gate active-session JSON | Tracked Buster agent | Persist after spawn; clear only when kill succeeds | Restart recovery can find live Buster. |
| `buildBusterGateControlResult` | Typed control metadata | Compatibility result/config/gate/opts | Result fields first, rate-limit fallback, opts attempt fallback | Control result carries Buster failure class and correlation. |
| `buildBusterRequestFixControlResult` | Remediation diagnostics | Result status/issues/opts | Opt correlation first, status correlation fallback | Fix cycle receives issues and previous dispatch identity. |
| `patchBusterRemediationControlResult` | Cloned remediation control result | New correlation/diagnostics/metadata | Deep clone then shallow merge typed remediation subobjects | Next control result preserves updated fix correlation. |
| `handleBusterGateEvaluationResult` | PASS status/output artifacts | Poll result/gate config | Write `gate-status.json`; write output file only if missing | PASS persistence is best-effort. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `_runBusterGateOnce` | Event-driven `waitBusterGateCompletionEvidence` call | Redis/local adapter wait | `timeout` from gate/config | Break on completion evidence done/rate-limit/error. |
| `runBusterGateEvaluation` | Rate-limit wrapper around one attempt | Rate-limit service sleep/resume | `max_pauses_per_module` default 5 | Exhaustion returns rate-limit result; attempt count unchanged. |
| `runBusterGate` | Remediation loop delegated | Generic remediable engine | `max_fix_cycles`/default max fails | Stops on pass/block/error/exhausted. |
| `performBusterGateFixAttempt` | One Forge fix cycle | Generic gate fix cycle | Gate timeout/default timeout | Returns retry/re-evaluate/terminal mode. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `config._testOverrides.busterGate` | Test override | `getBusterGateRunnerDeps` | `{}` | Replaces Buster gate dependencies. |
| `gate.model` | Gate config | `runBusterGateEvaluation` policy resolver | Policy fallback | Buster gate model. |
| `gate.timeout_minutes`, `config.default_timeout_minutes` | Gate/config field | Runner/fix cycle | Gate overrides default | Buster poll and Forge fix timeout. |
| `gate.max_fix_cycles`, `config.default_max_fails` | Gate/config field | Runner/control/fix cycle | Gate overrides default | Fix-and-retest cycle budget. |
| `gate.on_fail` | Gate config | Runner/terminal handler | No fix loop unless `fix_and_retest` | Controls request-fix vs terminal needs-Nova. |
| `gate.output_file` | Gate config | Runner/terminal/fix cycle/status projection | Optional | Canonical completion output file. |
| `gate.type`, `gate.title` | Gate config | All P11 runner/terminal paths | Required by gate registry | Telemetry, active-session, and prompt metadata. |
| `config.rate_limit.max_pauses_per_module` | Config field | Rate-limit wrapper/terminal | `5` fallback | Buster gate cooldown pause budget. |
| Redis completion fields `status`, `source`, `verdict`, identity fields | Runtime input | Completion adapter/terminal | Redis completion service | Completion adjudication and issue extraction. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| `gates/<gateId>/buster-prompt-attempt-<n>.md` | `_runBusterGateOnce` via `gateLogDir` | Operators/debugging | `writeRedactedPromptArtifact` | Redacted Buster prompt archive. |
| `<swarmRoot>/<gate.output_file>` | Runner/fix/terminal via `swarmRoot` | Completion projection and resume skip | Buster pipeline/output writer or terminal PASS fallback | Canonical Buster gate completion output. |
| `gateStatusPath(config, gateId)` | Runner/fix/terminal | Compatibility/status diagnostics | Terminal PASS writer and cleanup/archive paths | Diagnostic/compatibility gate-status artifact. |
| Redis completion stream/key | Polling deps | Completion adapter | Buster pipeline/Redis service | Archived before dispatch; Redis evidence preferred. |
| Gate active-session path | `persistGateActiveSession` in runner/fix scaffold | Restart recovery | Buster gate runner/fix scaffold | Recovery evidence only. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Buster gate completion precedence | `buster-gate-completion.js` plus completion adjudicator | Runner polling loop | None. |
| Buster typed control and remediation request | `buster-gate-control.js` | Generic gate runner/remediable engine | None. |
| Buster gate dispatch identity | `buster-gate-task.js` | Runner/completion/rate-limit/telemetry | None. |
| Buster gate lifecycle orchestration | `buster-gate-runner.js` | Gate registry/pipeline runner | None. |
| Buster terminal outcome mapping | `buster-gate-terminal.js` | Runner/generic gate projection | None. |
| Buster fix prompt/retest cleanup policy | `buster-gate-fix-cycle.js` | Generic Forge fix cycle | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Buster gate completion identity | `createBusterGateCompletionIdentity` | `runId`, `attempt`, `dispatchId`, `sessionKey`, `gateway_label` | Identity helpers | Prompt, Redis archive, polling, active-session, telemetry. |
| Buster gate spawn options | `buildBusterGateSpawnOptions` | `taskType:'gate_test'`, `gate`, `run_id`, `attempt`, `dispatch_id` | Buster runtime task validation downstream | Buster agent/Redis runtime. |
| Redis completion poll result | `buildRedisCompletionPollResult` | `ok`, `reason`, `status` with gate/status/reason/source/verdict/run/attempt/dispatch/gateway/session/source fields | `adjudicateCompletionEvidence`, `deps.pollResult` | Polling loop/terminal handler. |
| File completion poll result | `buildFileCompletionPollResult` | `ok`, `reason`, `status` from projected output plus identity fallback | `projectGateCompletionState`, `deps.pollResult` | Polling loop/terminal handler. |
| Buster typed control result | `buildBusterGateControlResult` | Producer `buster`, next action, issue type, summary, findings, metadata failure/correlation/status, metrics | Gate control contract helper | Generic gate runner/remediable loop. |
| Buster issue object | `extractGateIssues` | `title`, `description`, `affected_module`, `affected_files`, `severity`, `reproduction` | Extractor from output issues or verdict suites | Fix prompt and findings. |
| Buster remediation request | `buildBusterRequestFixControlResult` | producer `buster`, remediation policy `{ maxFixCycles, nextFixCycle, rerunStageId:'gate:buster' }`, correlation, diagnostics issues/status/fail_reason | Remediation handoff contract | Remediable gate engine/fix adapter. |
| PASS gate-status/output JSON | `handleBusterGateEvaluationResult` | `status:'PASS'`, `gate`, `source`, `completed_at`, `fix_cycles` | Completion projection/readers | Resume skip/operators. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Buster gate prompt | `deps.buildBusterGatePrompt(config, gateId, gate, instructions, commitHash, attempt, completionIdentity)` | `gates/<gateId>/buster-prompt-attempt-<n>.md` redacted copy | Prompt body built in `prompts/buster-gate.js`; P11 supplies instructions, commit hash, attempt, dispatch identity | Buster Redis/gate-test runtime | Redis completion and/or gate output/status PASS/FAIL evidence. |
| Buster gate fix prompt | `deps.buildGateFixPrompt(config, gate, issues, cycle, maxFixCycles, fixHistory)` | Generic gate fix scaffold prompt artifact | Prompt body built in `prompts/gate-fix.js`; P11 supplies issue list/history | Forge fix agent through generic gate fix cycle | File changes followed by Buster retest or terminal no-change/rate-limit. |
| Buster gate instructions | `deps.readGateInstructions(config, gate)` | Instructions file path configured on gate | Instructions body owned by gate config; P11 passes through | Buster prompt builder | Missing instructions terminal error. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `buildRedisCompletionPollResult` | Completion conflict | No | No retry | Terminal poll result `completion_conflict` | Conflict/drift details included. |
| `buildRedisCompletionPollResult` | Redis terminal-owned rate-limit | No local retry | Buster pipeline owns rate-limit terminal | Terminal `EXIT_RATE_LIMITED` result | None. |
| `buildRedisCompletionPollResult` | Redis transient rate-limit | Yes through wrapper | Rate-limit wrapper pause budget default 5 | Returns rate-limited status | None. |
| `buildRedisCompletionPollResult` | Timeout/PASS/FAIL | No local retry | Poll loop stops | Terminal poll result | Verdict JSON parse failure becomes null verdict. |
| `buildFileCompletionPollResult` | Invalid output contract | No | No retry | Terminal poll result `invalid_contract` | Invalid reason/error included. |
| `buildFileCompletionPollResult` | Parse error without permanent invalid contract | Yes by poll continuation | Polling service controls retry | Returns parse marker | None. |
| `_runBusterGateOnce` | Prompt artifact write failure | Soft | No retry | Swallowed | Prompt writer redacts when successful. |
| `_runBusterGateOnce` | Config validation failure | No | First attempt only | Terminal poll result `config_invalid` | Error message included. |
| `_runBusterGateOnce` | Redis archive failure | No | No retry | Terminal poll result `completion_archive_failed` | Archive failure included. |
| `_runBusterGateOnce` | Spawn failure | No local retry | No retry | Terminal poll result `spawn_failed` | Error included. |
| `_runBusterGateOnce` | Kill/clear after polling | Soft/cleanup | Always in finally; no retry | Active-session clear only if kill succeeds | None. |
| `runBusterGateEvaluation` | Existing stale output/status cleanup failure | Soft | No retry | Swallowed and continues | None. |
| `runBusterGateEvaluation` | Instruction read failure | No | No retry | Terminal error control result | Error included. |
| `runBusterGateEvaluation` | Rate-limit pause exhaustion | No | Pause/retry handled by wrapper, max default 5 | Terminal rate-limit result | None. |
| `runBusterGate` | Fix loop enabled with max cycles < 1 | No | No retry | Unexpected needs-Nova compatibility result | None. |
| `performBusterGateFixAttempt` | Retest cleanup archive/delete failure | Soft | No retry | Swallowed and continues | None. |
| `handleBusterGateEvaluationResult` | PASS artifact persist failure | Soft | No retry | WARN and still passes | None. |
| `handleBusterGateEvaluationResult` | Config invalid/spawn/invalid contract/parse/timeout/git/rate-limit | No | No retry at terminal handler | Typed terminal failure by class | Details included in metadata. |
| `handleBusterGateEvaluationResult` | Verdict FAIL with fix loop | Yes via remediable loop | No local sleep; max fix cycles from gate/config | Request-fix control result | Issues copied into remediation diagnostics. |
| `handleBusterGateEvaluationResult` | Verdict FAIL without fix loop | No | No retry | Terminal `EXIT_NEEDS_NOVA` | Issues included. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `buildRedisCompletionPollResult` | Completion conflict | Indirect | Terminal handler/generic poll result | terminal poll result | Caller | Completion adapter itself logs Redis completion line. |
| `buildRedisCompletionPollResult` | Redis terminal-owned rate-limit | Yes downstream | Rate-limit terminal result/telemetry | terminal-owned Redis rate-limit | Rate-limit builder/terminal path | Buster pipeline owns original event. |
| `buildRedisCompletionPollResult` | Redis transient rate-limit | Yes downstream | Rate-limit wrapper Discord/telemetry | cooldown pause/resume | `withSessionRateLimitRecovery` | Status carries correlation. |
| `buildRedisCompletionPollResult` | Timeout/PASS/FAIL | Yes downstream | Terminal handler telemetry | gate pass/fail | `handleBusterGateEvaluationResult` | Adapter logs Redis completion. |
| `buildFileCompletionPollResult` | Invalid output contract | Yes downstream | Gate fail telemetry/Discord | `gate.failed` invalid output | Terminal handler | Contract reason attached. |
| `buildFileCompletionPollResult` | Parse error | Partial | Polling logs/downstream timeout | parse marker | Poll loop | No direct telemetry until terminal path. |
| `_runBusterGateOnce` | Prompt artifact write failure | No | none | none | Swallowed catch | Non-critical artifact loss. |
| `_runBusterGateOnce` | Config validation failure | Yes | Discord/core log, then terminal handler telemetry | CRITICAL config invalid; `gate.failed` | `deps.discord`, terminal handler | Pre-dispatch alert. |
| `_runBusterGateOnce` | Redis archive failure | Partial | Core log and terminal handler fallback | ERROR log; terminal failure | `log`, terminal handler | No specialized archive event. |
| `_runBusterGateOnce` | Spawn failure | Yes downstream | Terminal handler gate fail telemetry/Discord | `gate.failed` spawn failed | Terminal handler | Poll result carries error. |
| `_runBusterGateOnce` | Kill/clear cleanup | Partial | Active-session file remains if kill false | recovery evidence file | `clearGateActiveSession` if killed | Kill failure telemetry owned by agent lifecycle. |
| `runBusterGateEvaluation` | Stale cleanup failure | No | none | none | Swallowed catch | Non-critical cleanup. |
| `runBusterGateEvaluation` | Instruction read failure | Yes | Gate fail telemetry/Discord/core log | `gate.failed`, CRITICAL Discord | `onGateFail`, `log` | Missing await on event call but event invoked. |
| `runBusterGateEvaluation` | Rate-limit exhausted | Yes | Rate-limit telemetry/Discord/gate fail stats | rate-limit terminal event | `finalizeGateSessionRateLimitExit` | Terminal handler. |
| `runBusterGate` | Invalid max fix cycles | Yes | Gate fail telemetry/Discord/core log | `gate.failed`, CRITICAL Discord | `onGateFail`, `log` | Returns compatibility result directly. |
| `performBusterGateFixAttempt` | Retest cleanup failure | No | none | none | Swallowed catch | Non-critical stale cleanup risk mitigated by archive attempt. |
| `handleBusterGateEvaluationResult` | PASS artifact persist failure | Yes | Core log | WARN persist/write output_file failed | `log` | PASS still returned. |
| `handleBusterGateEvaluationResult` | Terminal failure classes | Yes | Gate telemetry/Discord/core log | `gate.failed` class-specific CRITICAL | `onGateFail`, `log`, rate-limit finalizer | Rate-limit uses finalizer. |
| `handleBusterGateEvaluationResult` | Verdict FAIL with fix loop | Yes | Gate telemetry/Discord | WARN `gate.failed`, request-fix result | `onGateFail` | Remediation loop continues. |
| `handleBusterGateEvaluationResult` | Verdict FAIL without fix loop | Yes | Gate telemetry/Discord/core log | CRITICAL `gate.failed` | `onGateFail`, `log` | Terminal needs-Nova. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js runtime | `node` binary | Observed `v24.14.0` during review | All P11 modules | ESM, sync fs/path, async polling | No package pin in scoped files. |
| Node `fs`/`path` built-ins | Runtime built-ins | Node major 24 observed | Runner/fix/terminal | Prompt/status/output artifacts and cleanup | Sync IO used; many cleanup failures soft. |
| Redis completion service | Internal Redis via polling deps | Internal/external Redis | Completion adapter/runner | Completion evidence, archive stale completions, rate-limit ownership | Conflict/rate-limit adjudicated. |
| Buster gate ACP/Redis runtime | Agent orchestration helpers | Internal gateway/session/Redis | Runner | Spawn/poll/kill Buster gate task | Active-session evidence persisted. |
| Forge fix ACP runtime | Generic gate fix cycle | Internal gateway/session | Buster fix-cycle | Fix failed Buster gate issues | Shared P09 scaffold owns session lifecycle. |
| Git CLI/worktree helpers | `gitCommitAndPush`/status helpers | System Git through internal helpers | Terminal PASS and fix cleanup | Commit persisted PASS and fix changes | Soft-fail in PASS/fix paths. |
| Gate-control/remediation contracts | Internal source | Internal | Control/runner/terminal | Typed Buster control and request-fix validation | Contract errors propagate to generic gate runner. |
| Telemetry/Discord/rate-limit services | Internal/external | Internal/external | Runner/terminal/fix | Operator alerts, cooldowns, retry exhaustion | Sink behavior reviewed elsewhere. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Buster gate dispatch | One Buster agent per gate attempt | Pipeline loop sequential | Spawn failure terminal error | Gate fail telemetry | None. |
| Completion polling | One `pollGeneric` loop per attempt | Gate/default timeout minutes | Timeout terminal result | Gate fail telemetry | None. |
| Rate-limit pause recovery | Pause budget | `config.rate_limit.max_pauses_per_module` default 5 | Exhaustion terminal `EXIT_RATE_LIMITED` | Rate-limit telemetry/Discord | None. |
| Fix-and-retest loop | Sequential Forge fix then Buster retest | `gate.max_fix_cycles`/default max fails | Exhaustion BLOCK via remediable engine | Gate fail/retry-exhausted telemetry | None. |
| Redis completion archive | One archive before dispatch | Active dispatch identity preserved | Archive failure terminal fail-closed | ERROR log/terminal failure | None. |
| Active-session persistence | Single gate active-session file | One Buster/fix session at a time | Cleared only when kill succeeds | Recovery evidence file | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Buster gate spawn | `spawnAgent(config, progress, 'buster', gateId, model, prompt, { taskType:'gate_test', gate, run_id, attempt, dispatch_id })` | Buster gate runner | Agent orchestration/Buster runtime | Backend spawn semantics | Completion identity updated from tracked agent. |
| Buster gate active-session record | Gate active-session JSON from tracked agent plus run/attempt/dispatch/gateway | Buster gate runner | Restart recovery | Atomic write via shared helper; clear after kill | Session/dispatch/gateway evidence. |
| Redis completion evidence | Redis entry with status/source/reason/summary/verdict/run/attempt/dispatch/gateway/session | Buster pipeline/Redis service | Completion adapter | Blocking Redis completion adapter; stale completions archived before dispatch | Redis preferred over file evidence. |
| Buster output-file evidence | Gate output file projected to completion state | Buster pipeline/output writer | Completion adapter | Local evidence event fallback when Redis absent | Invalid contract terminal fail-closed. |
| Buster gate fix Forge session | Generic gate fix cycle with Buster prompt/session extras | Buster fix adapter | Gate fix scaffold/Forge runtime | Shared P09 fix-cycle semantics | Fix prompt and active-session evidence. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Buster typed-control extraction | `tests/verification/contracts/check-gate-control-result-surface.mjs` | Strong source/delegation coverage | Behavior covered in gates/fix-cycles. |
| Buster active-session extraction | `tests/verification/contracts/check-gate-active-session-surface.mjs`, `gate-session-persistence.mjs` | Good persistence/delegation coverage | Full stale recovery covered elsewhere. |
| Buster remediation handoff | `tests/verification/contracts/check-remediation-handoff-surface.mjs`, `fix-cycles.mjs` | Strong request-fix/fix-loop coverage | None. |
| Buster gate completion/rate-limit/correlation | `gates.mjs`, `polling.mjs`, `telemetry.mjs`, `buster-runtime-normalization.mjs` | Strong targeted coverage | None. |
| Buster terminal stop/failure telemetry | `stops.mjs`, `gates.mjs` | Good class-specific failure coverage | None. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- None yet.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
