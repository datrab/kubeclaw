# Batch P07 — Nova module runner top-level flow

Status: completed
Date started: 2026-05-08
Date completed: 2026-05-08
Reviewer: Nova

## Scope

```text
skills/nova/pipeline/runners/module-runner.ts
skills/nova/pipeline/runners/module-runner-*.ts
```

Scope expansion verified live: 6 files, under the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/nova/pipeline/runners/module-runner.ts
kubeclaw-main/skills/nova/pipeline/runners/module-runner-buster-worker.ts
kubeclaw-main/skills/nova/pipeline/runners/module-runner-forge.ts
kubeclaw-main/skills/nova/pipeline/runners/module-runner-prebuster.ts
kubeclaw-main/skills/nova/pipeline/runners/module-runner-shared.ts
kubeclaw-main/skills/nova/pipeline/runners/module-runner/buster-phase.ts
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/contracts/check-worker-control-result-surface.mjs
kubeclaw-main/tests/verification/behavior/areas/pipeline.mjs
kubeclaw-main/tests/verification/behavior/areas/modules.mjs
kubeclaw-main/tests/verification/behavior/areas/telemetry.mjs
kubeclaw-main/tests/verification/behavior/areas/foundations.mjs
```

## Per-file map

### `skills/nova/pipeline/runners/module-runner.ts`

Role: Public module runner facade and retry loop.

Imports/dependencies: Logger, retry telemetry, module-runner shared helpers, and internal attempt helpers from `./module-runner/attempt.js`.

Exports/public surface: `runModule` default/named export.

Defines: Module banner logger and retry loop around `executeModuleAttempt`.

Important variables/state: No module-global state. Local `deps`, module context, and `novaPrompt`; retry telemetry uses attempt result fields.

Calls out to: `getModuleRunnerDeps`, `resolveModuleRunContext`, `executeModuleAttempt`, `buildModuleStepResult`, `onRetryScheduled`, `deps.sleep(5000)`.

Called by / expected callers: Pipeline runner loop, public runner exports, tests.

Environment variables / CLI inputs / config fields: Uses `opts.novaPrompt`; dependency overrides and module context are resolved by internal attempt helpers.

Paths built/read/written: None directly.

Authority behavior: Owns only public retry-loop boundary; actual attempt sequencing is delegated to `module-runner/attempt.ts` outside P07 scope.

Error/retry/terminal behavior: If attempt returns non-retry, wraps result as typed pipeline step result. If retry, emits retry telemetry and sleeps 5000 ms before rereading attempt state. Thrown attempt errors propagate.

Verification coverage: Pipeline/module behavior tests cover retry loop indirectly; startup/foundation checks cover public surface.

Findings: None.

### `skills/nova/pipeline/runners/module-runner-buster-worker.ts`

Role: Registry-backed Buster worker execution adapter for one module Buster attempt.

Imports/dependencies: Plugin context/envelope, constants/logger/registry, worker-control projection helper, active-agent lifecycle state, module-runner shared builders/normalizers/telemetry.

Exports/public surface: `executeBusterWorkerAttempt` default/named export.

Defines: Buster execution input, worker input with dispatch/finalize callbacks, plugin context, control-result normalization/projection, terminal error projection.

Important variables/state: Mutates caller `status` object through `setModuleActiveAgent` and `clearModuleActiveAgent`; mutates local `completionIdentity.dispatchId` and `.gateway_label` from dispatch callback.

Calls out to: `requireStageHandler`, `ensureModulePluginLogDirs`, `buildModuleBusterRunInput`, `buildModuleWorkerPluginInvocation`, `buildWorkerPluginEffects`, plugin handler, `normalizeModuleBusterWorkerResult`, `projectModuleBusterWorkerCompatibilityResult`, `emitTerminalModuleFailTelemetry`, `deps.saveStatus`, `deps.loadStatus`.

Called by / expected callers: Module Buster phase implementation in adjacent `module-runner/buster-phase.ts`.

Environment variables / CLI inputs / config fields: Consumes worker params: `timeout`, `maxFails`, `busterPrompt`, `completionIdentity`, `busterModel`, `maxBusterCrashRetries`, `busterAttempt`, and config/progress through plugin context.

Paths built/read/written: No direct path building. Status persistence delegated to deps/status-store; plugin log dirs created by shared helper.

Authority behavior: Owns Buster worker plugin invocation boundary for top-level module runner. Shared contract helper owns typed worker result validation.

Error/retry/terminal behavior: Plugin lookup/execution/contract errors are caught, logged, projected to terminal `EXIT_ERROR`, and include contract diagnostics if present. Dispatch/finalize callbacks persist active-agent state and clear it after worker finalization.

Verification coverage: Worker control-result surface and module pipeline behavior tests exercise registry-backed worker dispatch indirectly.

Findings: None.

### Deleted Buster phase compatibility re-export

The former top-level Buster phase facade has been deleted. `skills/nova/pipeline/runners/module-runner/buster-phase.ts` is the canonical Buster phase implementation surface.

### `skills/nova/pipeline/runners/module-runner-forge.js`

Role: Forge phase controller plus forge-only completion finalizer.

Imports/dependencies: Plugin context/envelope, constants/logger/runtime/registry, ACP transcript progress classifier, lifecycle-state active-agent helpers, telemetry, rate-limit service, validator/worker control contracts, correlation helpers, shared module-runner helpers, preflight helper, retry result helper.

Exports/public surface: `runModuleForgePhase`, `finalizeForgeOnlyPass`.

Defines: Forge preflight, model/policy resolution, prompt build/save, active-agent lifecycle callbacks, worker plugin invocation, worker result handling, failure routing, forced READY_FOR_TESTING, forge-only PASS finalizer.

Important variables/state: Mutates `status`: phase start, validation reset, active agent, READY_FOR_TESTING/PASS transitions, cost durations. Updates run stats `total_forge_attempts` and `modules_completed`.

Calls out to: `runModulePreflight`, deps policy/model/prompt/status/git helpers, `requireStageHandler`, plugin handler, `normalizeModuleForgeWorkerResult`, `projectModuleForgeWorkerCompatibilityResult`, `handleFail`, `finalizeModuleSessionRateLimitExit`, telemetry emitters, Discord, lifecycle-state transitions.

Called by / expected callers: Internal attempt orchestrator under `module-runner/attempt.js`.

Environment variables / CLI inputs / config fields: Uses module `forge_model`, `thinking_level.forge`, `stages`; config agent dispatch and runtime model policy, rate-limit max pauses, run id, repo/head helpers; opts `novaPrompt`.

Paths built/read/written: Saves Forge prompt through deps, status through deps, plugin log dirs through shared helper. No raw filesystem writes in scoped file except delegated services.

Authority behavior: Owns Forge phase outcome mapping and top-level status transition from Forge to READY_FOR_TESTING or PASS when no Buster stage exists.

Error/retry/terminal behavior: Prompt assembly and plugin failures become terminal `EXIT_ERROR`. Spawn failure emits CRITICAL operator alert and terminal fail. Healthcheck/no-changes/timeout/parse-corrupted/default failures go through `handleFail` retry budget. Rate-limit exhaustion delegates terminal rate-limit finalization. Git polling error fails closed. If worker succeeds but status is not READY_FOR_TESTING, it force-advances with WARN Discord.

Verification coverage: Module/pipeline behavior tests cover Forge success, retry, no-change, rate-limit, and status-transition paths indirectly; worker control contracts cover normalized worker result shapes.

Findings: None.

### `skills/nova/pipeline/runners/module-runner-prebuster.js`

Role: Pre-Buster gate for buster-only promotion, delivery lint, pre-check validation, and Git sync before Buster dispatch.

Imports/dependencies: Plugin context/envelope, constants/logger/runtime/registry, correlation helpers, contract diagnostics, validator-control contract, lifecycle transition, telemetry, shared module-runner helpers, retry result helper.

Exports/public surface: `prepareModuleForBuster`.

Defines: Module validator producer/summary/metadata/code helpers, registry module-validator invocation, contract diagnostic builder, block terminal builder, Buster prep flow.

Important variables/state: Mutates status validation milestone fields, buster-only READY_FOR_TESTING transition, and status persistence through deps.

Calls out to: `requireStageHandler`, validator plugin handler, `normalizeTypedValidatorControlResult`, `transitionModuleStatus`, `ensureValidationState`, `markValidationPassed`, `deps.handleFail`, `deps.gitSyncBeforeBuster`, `deps.discord`, `emitOperatorAlert`, `emitTerminalModuleFailTelemetry`, `deps.saveStatus`.

Called by / expected callers: Internal attempt orchestrator before Buster phase.

Environment variables / CLI inputs / config fields: Uses module `stages`, `test_config`, config `pre_check`, validator registry stage ids `validator:delivery_lint` and `validator:pre_check`, timeout/maxFails inputs.

Paths built/read/written: Validator input artifact refs/status paths via shared helper; status persistence and Git sync are delegated.

Authority behavior: Owns top-level handoff invariants before Buster: buster-only promotion, Forge+Buster validation milestones, and Git sync fail-closed boundary.

Error/retry/terminal behavior: Validator execution/contract errors block with `EXIT_NEEDS_NOVA`; validator non-pass either blocks or calls `handleFail` for retry. Missing validation milestones produce terminal `EXIT_ERROR`. Git sync errors emit terminal module fail telemetry and return `EXIT_ERROR`.

Verification coverage: Pipeline/module tests cover delivery-lint/pre-check handoff and Git sync behavior indirectly.

Findings: None.

### `skills/nova/pipeline/runners/module-runner-shared.js`

Role: Shared module-runner telemetry, Discord fields, validation state, typed step/result projection, plugin effect builders, and module Forge/Buster/validator input schemas.

Imports/dependencies: Node `fs`, `path`; logger context; constants/runtime/paths; telemetry; lifecycle-state active-agent helpers; Discord field builder; worker-control and pipeline-step contracts; serialization; stage-ref and plugin invocation builders; artifact collector; correlation helpers; module worker control-result coercers.

Exports/public surface: `_telemetryCtx`, duration/attempt helpers, Discord field builders, corrupt-status identity reader, terminal event builders/emitters, log scope, validation state helpers, stats/log-dir helpers, `buildModuleStepResult`, `buildWorkerPluginEffects`, Forge/Buster/validator input builders, plugin invocation builders, worker result normalizers.

Defines: Status JSON best-effort identity extractor, module artifact ref builders, state snapshots, typed worker/validator/generator input schemas, worker runtime effect dispatch.

Important variables/state: Mutates active logger context `_logModule`/`_logPhase`; `ensureValidationState` and `markValidationPassed` mutate `status.validation`; `ensureModulePluginLogDirs` may set `config._logDir` and `config._runLogDir`.

Calls out to: Runtime/context getters, status path helper, telemetry emitters, Discord field builder, typed contract builders, artifact collection, module worker defaults, correlation helpers.

Called by / expected callers: All P07 module runner files and adjacent P08 internals.

Environment variables / CLI inputs / config fields: Reads `config.project`, `repo_root`, `paths.modules_dir`, `_logDir`, `_runLogDir`, run id fields, module `stages`, `substeps`, `test_suites`, `test_config`, config `pre_check`, active status fields.

Paths built/read/written: Reads corrupt `status.json` through `statusPath`; builds module status, `FORGE.md`, `BUSTER.md`, `test-spec.json`, Buster suite paths under `skills/buster/suites`, plugin run log dir `<logs>/pipeline/runs/<runId>`. Creates run log dir when needed.

Authority behavior: Owns module-runner plugin envelope schemas and compatibility projection into typed pipeline step results. Contract helpers own final validation.

Error/retry/terminal behavior: Corrupt status read returns null identities; elapsed time invalid dates become 0; existing typed pipeline-step result is passed through with compatibility projection; worker normalizers coerce compatibility results through typed contract helper and may throw on invalid data.

Verification coverage: Worker control-result contract tests, pipeline-step authority tests, and module/pipeline behavior tests exercise shared projections indirectly.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `module-runner.ts` | `module-runner/attempt.ts` | `resolveModuleRunContext`, `executeModuleAttempt`, `getModuleRunnerDeps` | Public wrapper delegates attempt sequencing to P08 internals. |
| `module-runner.ts` | `module-runner-shared.ts` | `_telemetryCtx`, `buildModuleStepResult`, `setLogScope` | Retry telemetry and typed step result wrapper. |
| `module-runner-forge.ts` | `module-runner-shared.ts` | input builders, Discord fields, validation helpers, result normalizers | Shared schemas and status projections. |
| `module-runner-forge.ts` | `module-runner/preflight.ts` | `runModulePreflight` | Preflight owned by P08 internals. |
| `module-runner-forge.ts` | Plugin registry/context | `requireStageHandler('worker.execute','worker:module_forge')` | Forge worker plugin dispatch. |
| `module-runner-prebuster.ts` | Plugin registry/context | validator stages `delivery_lint`, `pre_check` | Pre-Buster deterministic validators. |
| `module-runner-buster-worker.ts` | Plugin registry/context | `worker:module_buster` | Buster worker plugin dispatch. |
| `module-runner/state-machine.ts` | `module-runner/buster-phase.ts` | `runModuleBusterPhase` | Direct canonical Buster phase call; old compatibility re-export was deleted. |
| `module-runner-shared.ts` | `agents/module-workers.ts` | default worker runtime dispatch | Plugin effect can call default Forge/Buster worker helpers. |
| P07 files | `lifecycle-state.js`, telemetry, Discord, contracts | status mutation, events, typed result validation | Shared downstream authorities. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `runModule` | Attempt requests retry | `executeModuleAttempt` result | Emit retry telemetry, sleep 5000 ms, rerun | Public retry-loop authority. |
| `runModuleForgePhase` | Preflight terminal | Preflight result | Return terminal before Forge worker | Prevents worker spawn after failed preflight. |
| `runModuleForgePhase` | Prompt error, plugin error, spawn/health/no-change/timeout/rate-limit/git error | Worker/poll result | Terminal error, retry via `handleFail`, or rate-limit exit | Forge outcome routing. |
| `runModuleForgePhase` | Worker ok but status not READY_FOR_TESTING | Status after worker | Force READY_FOR_TESTING and WARN Discord | Keeps pipeline moving after successful file changes. |
| `finalizeForgeOnlyPass` | Module has no Buster stage | Stages/status | Soft git push, transition PASS, emit pass telemetry | Forge-only completion. |
| `prepareModuleForBuster` | Buster-only module in PENDING/FAIL | Stages/status | Promote to READY_FOR_TESTING | Allows buster-only modules to skip Forge. |
| `prepareModuleForBuster` | Delivery lint/pre-check not passed | `status.validation` | Run validator, pass marker, block, or retry via handleFail | Mandatory pre-Buster validation. |
| `prepareModuleForBuster` | Validation milestones missing | Status validation | Terminal `EXIT_ERROR` refusing Buster dispatch | Fail-closed handoff invariant. |
| `prepareModuleForBuster` | Ready for Buster | Status/stages | Run Git sync before dispatch | Protects Buster from dirty/stale worktree. |
| `executeBusterWorkerAttempt` | Worker plugin throws/invalid | Error/diagnostics | Terminal `EXIT_ERROR` with optional contract diagnostics | Buster worker fail-closed boundary. |
| `buildWorkerPluginEffects` | Stage id is Buster vs Forge | `stageId` | Dispatch default/injected Buster or Forge worker | Worker plugin effect routing. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `runModule` | None directly | Attempt result | Non-retry returns typed step result; retry sleeps | Attempt helper remains status authority. |
| Forge/Buster dispatch callbacks | `status.active_agent` | Worker dispatch result | Dispatch fields override fallbacks; save status immediately | Recovery/shutdown can see live worker. |
| Worker finalize callbacks | `status.active_agent` | Finalized status/session | Reload status if supplied/missing, clear active agent, save | Active-agent cleared after worker finalization. |
| `ensureValidationState` | `status.validation` | Current attempt | Reinitialize when missing or attempt changes | Validation milestones are per-attempt. |
| `markValidationPassed` | `status.validation` | milestone key | Set boolean and `<key>_at` timestamp | Validator completion preserved in status. |
| `ensureModulePluginLogDirs` | `config._logDir`, `_runLogDir` | paths/modules_dir/run id | Fill missing fields and mkdir run dir | Plugin logs have run-scoped directory. |
| `buildModuleStepResult` | Step result projection | Compatibility result/status | Typed result passed through; otherwise build from compatibility with correlation | Module runner output is typed pipeline-step result. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `runModule` | `while (true)` retry loop | Fixed `deps.sleep(5000)` between retries | Retry budget delegated to attempt/handleFail | Breaks on non-retry attempt. |
| Forge/Buster worker execution | No local poll loop | Worker helpers downstream poll | Deadline encoded in worker run input as `timeoutMinutes * 60 * 1000` | Worker result returned by plugin/default worker. |
| Pre-Buster validators | Sequential delivery lint then pre-check | None | None local | Stop on block/retry/error; continue only after pass markers. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `opts.novaPrompt` | Run option | `runModule`, `runModuleForgePhase` | null | Passed to Forge prompt builder and run input flag. |
| Module `stages` | Module config | Forge/pre-Buster/finalize logic | `['forge','buster']` where helpers default | Controls buster-only and forge-only paths. |
| Module `forge_model`, `thinking_level.forge` | Module config | Forge policy resolution | Policy resolver defaults | Forge worker model/thinking inputs. |
| Module `test_suites`, `test_config`, `substeps` | Module config | Shared input/artifact builders | empty/null | Buster/validator artifact refs and config. |
| `config.pre_check` | Config field | Module validator input | `{}` | Pre-check validator config. |
| `config.rate_limit.max_pauses_per_module` | Config field | Forge rate-limit terminal path | `5` fallback | Rate-limit exhausted projection. |
| Worker plugin stage ids | Registry input | Forge/Buster/pre-Buster | `worker:module_forge`, `worker:module_buster`, `validator:delivery_lint`, `validator:pre_check` | Stage-owner lookup keys. |
| Worker inputs/callbacks | Plugin envelope extra | Worker plugin/default effects | Built per attempt | Includes prompt, model, status, dispatch/finalize callbacks. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| Module `status.json` | `statusPath(config, dir)` in shared helper | `readCorruptStatusIdentity`, artifact refs | Status-store deps | Direct read only for corrupt identity salvage. |
| Module `FORGE.md` / substep `FORGE.md` | `buildModuleArtifactRefs` | Worker/validator plugin inputs | Module authors/outside P07 | Existing refs only. |
| Module `BUSTER.md`, `test-spec.json` | `buildModuleBusterArtifactRefs` | Buster worker plugin input | Module authors/outside P07 | Existing refs only. |
| Buster suite files under `skills/buster/pipeline/suites/<suite>.ts` | `buildModuleBusterArtifactRefs` | Buster worker plugin input | Buster suite source | Existing refs only. |
| `<logs>/pipeline/runs/<runId>` | `ensureModulePluginLogDirs` | Plugin log writers | `fs.mkdirSync` in shared helper | Run-scoped plugin log directory. |
| Forge prompt artifact | `runModuleForgePhase` via `deps.savePrompt` | Operators/worker debugging | Prompt service outside P07 | Concrete path delegated. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Public module retry loop | `module-runner.js` | Pipeline runner loop | Attempt internals reviewed in P08. |
| Forge phase status transition and outcome mapping | `module-runner-forge.js` | Attempt orchestrator, telemetry, status-store | None. |
| Pre-Buster validation milestones | `module-runner-prebuster.js` and `status.validation` | Buster handoff and recovery | None. |
| Buster worker plugin execution boundary | `module-runner-buster-worker.js` | Buster phase internals | Full Buster phase reviewed in P08. |
| Module worker/validator plugin input schemas | `module-runner-shared.js` | Plugin handlers/contracts/tests | None. |
| Module runner typed pipeline-step projection | `module-runner-shared.js` with pipeline-step contract | Pipeline loop/terminal handling | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Module validation state | `ensureValidationState`, `markValidationPassed` | `attempt`, `delivery_lint_passed`, `delivery_lint_passed_at`, `pre_check_passed`, `pre_check_passed_at` | Attempt number reset logic | Pre-Buster handoff. |
| Module Forge worker run input | `buildModuleForgeRunInput` | `refs`, `ids`, `worker.workerType:'module_forge'`, `workspace`, `artifacts`, `stateSnapshot`, `executionContext`, `deadline` | Worker control normalizer | Forge worker plugin/default backend. |
| Module validator run input | `buildModuleValidatorRunInput` | `refs`, `ids`, `validator`, `module`, `workspace`, `artifacts`, `stateSnapshot`, `executionContext` | Validator control normalizer | Delivery lint/pre-check validators. |
| Module Buster worker run input | `buildModuleBusterRunInput` | `refs`, `ids`, `worker.workerType:'module_buster'`, `workspace`, `artifacts`, `stateSnapshot`, `executionContext`, `deadline` | Worker control normalizer | Buster worker plugin/default backend. |
| Worker plugin invocation | `buildModuleWorkerPluginInvocation` | `stageId`, `moduleId`, `attempt`, `dispatchId`, `sessionKey`, `gatewayLabel` | Stage invocation builder | Plugin context/registry handlers. |
| Terminal module fail event | `buildTerminalModuleFailEvent`, `buildTerminalBusterCrashFailEvent` | title/status/attempt/phase/model/dispatch/gateway/session/duration/commit/reason fields | Correlation helpers | Telemetry `onModuleFail`. |
| Module step result | `buildModuleStepResult` | Typed pipeline-step result with module correlation, diagnostics, reason | Pipeline-step contract helper | Pipeline runner loop/terminal. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Forge worker prompt | `deps.buildForgePrompt` result saved by `runModuleForgePhase` | Delegated `deps.savePrompt(config, dir, 'forge', attempt, forgePrompt)` | Prompt text built outside P07; P07 saves and passes it unchanged to worker input | Worker plugin/default runtime effect | Typed module Forge worker control result. |
| Buster worker prompt | `busterPrompt` input to `executeBusterWorkerAttempt` | None in P07 | Prompt text built by adjacent Buster phase; P07 passes it unchanged to worker input | Worker plugin/default runtime effect | Typed module Buster worker control result. |
| Delivery lint/pre-check validators | `buildModuleValidatorRunInput` | None | Structured validator inputs from module config/status/artifacts | Registry validator handler | Typed validator control result with `nextAction`. |

No natural-language prompt bodies are constructed in P07 scoped files; P07 passes prompt text from delegated builders/adjacent phases into worker inputs.

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `runModule` | Attempt asks retry | Yes | Fixed 5000 ms sleep; retry budget delegated | Continues loop after telemetry | None. |
| `runModule` | Attempt throws | No local retry | No catch | Propagates | None. |
| `runModuleForgePhase` | Preflight terminal | Depends on preflight result | Delegated | Returns preflight terminal | None. |
| `runModuleForgePhase` | Forge prompt assembly failure | No | No retry | Terminal `EXIT_ERROR` | Error string included. |
| `runModuleForgePhase` | Worker plugin/contract failure | No | No retry | Terminal `EXIT_ERROR`; diagnostics included when present | Diagnostics not redacted locally. |
| `runModuleForgePhase` | Spawn failure | No local retry | Worker spawn may retry downstream | CRITICAL operator alert; terminal `EXIT_ERROR` | Error included. |
| `runModuleForgePhase` | Healthcheck/no-change/timeout/parse-corrupted/default failure | Yes if retry budget remains | Retry budget via `deps.handleFail` | Retry result or terminal fail | Reasons included. |
| `runModuleForgePhase` | Rate-limit exhausted | No | Rate-limit service owns details | Terminal rate-limit exit | None. |
| `runModuleForgePhase` | Git polling error | No | No retry | Terminal `EXIT_ERROR` fail-closed | Git details included. |
| `runModuleForgePhase` | Worker ok but status not READY_FOR_TESTING | Soft recovery | No retry | Force READY_FOR_TESTING, save, WARN Discord | None. |
| `finalizeForgeOnlyPass` | Git commit/push failure | No | No retry | Swallowed as non-critical; PASS continues | None. |
| `prepareModuleForBuster` | Validator execution/contract failure | No | No retry | Terminal `EXIT_NEEDS_NOVA` block | Diagnostics included. |
| `prepareModuleForBuster` | Validator non-pass | Yes unless block or budget exhausted | Retry budget via `deps.handleFail` | Retry Forge or terminal block/fail | Summary/codes included. |
| `prepareModuleForBuster` | Missing validation milestones | No | No retry | Terminal `EXIT_ERROR` fail-closed | None. |
| `prepareModuleForBuster` | Git sync before Buster failure | No | No retry | Terminal `EXIT_ERROR` | Error included. |
| `executeBusterWorkerAttempt` | Worker plugin/contract failure | No | No retry | Terminal `EXIT_ERROR`; diagnostics included when present | Diagnostics not redacted locally. |
| `readCorruptStatusIdentity` | Status JSON read/parse failure | No | No retry | Returns null identity fields | None. |
| Shared input/result normalizers | Invalid worker/step result | No | No retry | Contract helper may throw or produce typed invalid result depending surface | Diagnostics may include raw result. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `runModule` | Retry requested | Yes | Telemetry stream/core log | `retry.scheduled`; INFO retry log | `onRetryScheduled`, `log` | Includes dispatch/gateway/session when available. |
| `runModule` | Attempt throws | No direct telemetry | none | none | Function propagates | Caller owns top-level error handling. |
| `runModuleForgePhase` | Preflight terminal | Delegated | Preflight helper | delegated | `runModulePreflight` | P08 owns details. |
| `runModuleForgePhase` | Prompt assembly failure | Yes | Telemetry stream/core log | `module.failed`; ERROR log | `emitTerminalModuleFailTelemetry`, `log` | Terminal result carries reason. |
| `runModuleForgePhase` | Worker plugin/contract failure | Yes | Telemetry stream/core log | `module.failed`; ERROR log | `emitTerminalModuleFailTelemetry`, `log` | Contract diagnostics returned. |
| `runModuleForgePhase` | Spawn failure | Yes | Operator alert/Discord and telemetry | `module.operator_alert`; `module.failed` | `emitOperatorAlert`, `emitTerminalModuleFailTelemetry` | CRITICAL Discord presentation. |
| `runModuleForgePhase` | Healthcheck/no-change/timeout/parse/default failure | Yes | `handleFail` downstream and/or operator alert | retry/fail events downstream; no-change operator alert | `deps.handleFail`, `emitOperatorAlert` | Retry telemetry emitted by outer loop. |
| `runModuleForgePhase` | Rate-limit exhausted | Yes | Rate-limit service/Discord/log | rate-limit terminal exit | `finalizeModuleSessionRateLimitExit` | Service owns event schema. |
| `runModuleForgePhase` | Git polling error | Partial | Terminal result only | none direct | Function return | Caller terminal path projects result. |
| `runModuleForgePhase` | Forced READY_FOR_TESTING | Yes | Core log and Discord | WARN forced READY_FOR_TESTING | `log`, `deps.discord` | Status saved. |
| `finalizeForgeOnlyPass` | Git commit/push failure | No | none | none | Swallowed catch | Non-critical soft push failure is silent. |
| `prepareModuleForBuster` | Validator execution/contract failure | Yes | Core log and terminal result diagnostics | ERROR log; `EXIT_NEEDS_NOVA` | `log`, terminal result | Terminal path alerts later. |
| `prepareModuleForBuster` | Validator non-pass | Yes | Core log, Discord, downstream handleFail | WARN delivery/pre-check fail | `log`, `deps.discord`, `deps.handleFail` | Block result enters terminal path. |
| `prepareModuleForBuster` | Missing validation milestones | Partial | Terminal result only | none direct | Function return | Caller terminal path projects result. |
| `prepareModuleForBuster` | Git sync before Buster failure | Yes | Core log and telemetry | ERROR log; `module.failed` | `log`, `emitTerminalModuleFailTelemetry` | Terminal result returned. |
| `executeBusterWorkerAttempt` | Worker plugin/contract failure | Yes | Core log and telemetry | ERROR log; `module.failed` | `log`, `emitTerminalModuleFailTelemetry` | Contract diagnostics returned. |
| `readCorruptStatusIdentity` | Status JSON read/parse failure | No | none | none | Function fallback | Intentional best-effort salvage helper. |
| Shared input/result normalizers | Invalid worker/step result | Indirect | Contract diagnostics/typed result or thrown error | contract invalid diagnostics | Contract helpers | Caller handles projection/telemetry. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js runtime | `node` binary | Observed `v24.14.0` during review | All P07 modules | ESM, async functions, fs/path helpers | No package pin in scoped files. |
| Node `fs`/`path` built-ins | Runtime built-ins | Node major 24 observed | `module-runner-shared.js` | Status identity salvage, artifact paths, plugin log dir creation | Read failures are best-effort; mkdir may throw. |
| Plugin registry/context | Internal source | Internal | Forge/Buster workers and validators | Stage handler lookup and invocation envelopes | Missing/invalid handlers fail closed. |
| Worker/validator/pipeline-step contracts | Internal source | Internal | Shared normalizers and runner outputs | Typed control/result validation | Invalid contracts produce diagnostics or throw. |
| Lifecycle-state status helpers | Internal source | Internal | Forge/Buster/pre-Buster | Active-agent and status transitions | Status-store persistence delegated through deps. |
| Telemetry/Discord services | Internal/external | Internal/external | Forge/pre-Buster/Buster worker/shared | Module lifecycle, failures, retry and operator alerts | Several Discord calls are awaited and may affect path if they throw via deps. |
| Module worker backends | `agents/module-workers.js` default effects or registry plugins | Internal | Shared worker plugin effects | Forge ACP/subagent and Buster Redis execution | Backend details reviewed in P05. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Public module retry loop | Sequential retry loop | 5000 ms delay between retries | Blocks module runner until retry budget exhausted or pass | Retry telemetry and INFO log | None. |
| Forge/Buster worker execution | One worker plugin invocation per phase attempt | Timeout encoded in run input | Downstream worker backend owns polling/backpressure | Worker result telemetry downstream | None. |
| Pre-Buster validators | Sequential delivery lint then pre-check | No parallelism | First non-pass stops handoff | WARN Discord/log | None. |
| Active-agent status persistence | Immediate save on dispatch/finalize | No queue | Save failure propagates from deps callback | Status-store side effects | None. |
| Plugin log directory creation | Synchronous mkdir | Once per missing run dir | mkdir failure propagates through worker/validator setup | Error path caught by caller for workers/validators | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Forge worker plugin/default dispatch | `workerRuntime.dispatch` with Forge worker input | Module Forge plugin context/effects | Default Forge worker backend or plugin handler | Backend polling/timeout outside P07 | Worker input includes prompt, model, thinking, attempt, headBefore, dispatch/finalize callbacks. |
| Buster worker plugin/default dispatch | `workerRuntime.dispatch` with Buster worker input | Buster worker plugin context/effects | Default Buster worker backend or plugin handler | Backend polling/timeout outside P07 | Worker input includes prompt, model, dispatch id, completion identity, callbacks. |
| Status `active_agent` ACP/session record | Forge/Buster dispatch callbacks | Status-store/recovery/shutdown | Saved immediately on dispatch | No throttle | Fields include session key, stream log path, label/gateway, dispatch/run id, runtime/model/agent id/phase. |
| ACP transcript progress classification | `transcriptShowsProgress` | Forge no-change handler | Operator alert text | No polling here | Classifies no-change transcript as active/stale. |
| Plugin invocation envelopes | `buildPluginInvocationEnvelope` | Forge/Buster/validator controllers | Registry handlers | In-process, no ACP transport | Carries structured run input and plugin context. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Module runner retry/status lifecycle | `tests/verification/behavior/areas/pipeline.mjs`, `modules.mjs` | Broad behavior coverage | Attempt internals reviewed in P08. |
| Worker control-result projections | `tests/verification/contracts/check-worker-control-result-surface.mjs` | Strong contract coverage | Full default backend behavior reviewed in P05. |
| Module telemetry/correlation fields | `tests/verification/behavior/areas/telemetry.mjs` | Good correlation coverage | Does not exhaust every validator failure branch. |
| Public exports/imports | `tests/verification/behavior/areas/foundations.mjs` | Basic surface coverage | No deep behavior assertions. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- `P07-ISSUE-001` — Module Buster crash-exhaustion verification fails on guarded `phase_started_at` status save.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
