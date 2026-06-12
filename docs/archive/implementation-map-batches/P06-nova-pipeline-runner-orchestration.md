# Batch P06 — Nova pipeline runner orchestration

Status: completed
Date started: 2026-05-08
Date completed: 2026-05-08
Reviewer: Nova

## Scope

```text
skills/nova/pipeline/runners/pipeline-runner*.js
skills/nova/pipeline/runners/pipeline-runner-scheduling/*.js
```

Scope expansion verified live: 10 files, exactly at the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-deps.js
kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-loop.js
kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-recovery.js
kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-scheduling.js
kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-scheduling/snapshots.js
kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-scheduling/validator-completions.js
kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-shared.js
kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-start.js
kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-terminal.js
kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/contracts/check-pipeline-runner-slice-surface.mjs
kubeclaw-main/tests/verification/runtime/check-final-gate-hardening.mjs
kubeclaw-main/tests/verification/runtime/check-nova-startup-smoke.mjs
kubeclaw-main/tests/verification/behavior/areas/pipeline.mjs
kubeclaw-main/tests/verification/behavior/areas/restart-recovery.mjs
kubeclaw-main/tests/verification/behavior/areas/resume-idempotence.mjs
kubeclaw-main/tests/verification/behavior/areas/foundations.mjs
kubeclaw-main/tests/verification/behavior/areas/gates.mjs
```

## Per-file map

### `skills/nova/pipeline/runners/pipeline-runner-deps.js`

Role: Dependency aggregation and test override seam for the pipeline runner.

Imports/dependencies: Status-store readers, failure injection, Discord integration, runtime output, module/gate runners, blueprint file sync, summary/generator services.

Exports/public surface: `DEFAULT_PIPELINE_RUNNER_DEPS`, `getPipelineRunnerDeps`.

Defines: Default dependency object and merge helper.

Important variables/state: Frozen by convention only; `DEFAULT_PIPELINE_RUNNER_DEPS` is a plain exported object.

Calls out to: None at runtime except object merge.

Called by / expected callers: Pipeline runner main/start/loop/terminal/scheduling wrappers and tests.

Environment variables / CLI inputs / config fields: Reads `config._testOverrides.pipelineRunner` to override dependencies.

Paths built/read/written: None directly.

Authority behavior: Owns runner dependency injection seam; concrete service authority stays with imported services.

Error/retry/terminal behavior: No local error handling.

Verification coverage: `check-pipeline-runner-slice-surface.mjs` asserts helper exports and runner use.

Findings: None.

### `skills/nova/pipeline/runners/pipeline-runner-loop.js`

Role: Main scheduling loop that repeatedly selects next step, executes validator/gate/module, and delegates terminal handling.

Imports/dependencies: Durable rate-limit resume, scheduling helpers, terminal helpers, runner deps.

Exports/public surface: `runValidatorStep`, `runPipelineLoop`.

Defines: Scheduled validator execution/projection to pipeline step result, infinite loop scheduler.

Important variables/state: No module state. Scheduled validator completion state is delegated to `validator-completions.js`.

Calls out to: `findNextStep`, `runScheduledValidator`, `projectValidatorControlResultToStepResult`, `markScheduledValidatorComplete`, `resumeDurableCooldownForStep`, `completePipeline`, `haltPipeline`, dependency `runGate`/`runModule`.

Called by / expected callers: `pipeline-runner.js runPipeline`; tests import slice.

Environment variables / CLI inputs / config fields: Uses `opts.novaPrompt`; reads progress/config through scheduling and dependencies.

Paths built/read/written: Validator completion persistence delegated; no direct file IO.

Authority behavior: Owns runtime loop control and only continues when normalized typed pipeline-step result says `shouldContinue`.

Error/retry/terminal behavior: No catch around step execution; thrown errors propagate to top-level caller and run lock finally release. Rate-limit cooldown and validator execution own their retry/failure behavior.

Verification coverage: Pipeline behavior tests exercise full loop outcomes; contract test asserts no raw `result.exit` branching in main runner after step-result cutover.

Findings: None.

### `skills/nova/pipeline/runners/pipeline-runner-recovery.js`

Role: Pipeline concurrency lock, stale module/gate session recovery, identity confirmation, and recovery-block telemetry/Discord reporting.

Imports/dependencies: Node `fs`, `os`, `path`; logger; status-store lifecycle APIs; gate active-session recovery evidence; Discord; telemetry; ACP monitor; lifecycle kill; shutdown reaper; lifecycle-state; failure semantics; pipeline shared fields; correlation; session authority.

Exports/public surface: `PIPELINE_RUN_CONCURRENCY_LIMIT`, `acquirePipelineRunLock`, `releasePipelineRunLock`, `reconcileStaleModuleState`, `reconcileStaleGateSessions`.

Defines: Recovery identity resolution, run lock path/read/remove/reclaim logic, recovery blocked event/Discord alert, stale module reset, stale gate active-session cleanup.

Important variables/state: No module-global mutable state. Lock file contains owner token/pid/host/project/run/module/resume/repo metadata.

Calls out to: `loadStatus`, `saveStatus`, `appendLifecycleEvent`, `appendStaleRecoveryLifecycleEvent`, `resolveGateActiveSessionRecoveryEvidence`, `observeAcpMonitorSurfaces`, `killSession`, `reaperAfterKill`, `transitionModuleStatus`, `markModuleLifecycleIntent`, `onModuleStatusChanged`, `discord`, session authority policy builder.

Called by / expected callers: `pipeline-runner.js runPipeline` before start; public lock exports used by runtime/foundation tests.

Environment variables / CLI inputs / config fields: Reads `config.paths.swarm_dir`, `_logDir`, `_runId`/`run_id`, `repo_root`, `project`, `recovery_session_stop_confirm_timeout_ms`, `recovery_session_stop_confirm_poll_ms`, `_testOverrides.recovery.*`, `opts.module`, `opts.resume`.

Paths built/read/written: Builds `<swarm_dir>/logs/pipeline/active-run.lock.json`; reads/writes/deletes that lock. Reads/writes module status via status-store; reads/removes gate active-session recovery file path returned by gate-active-session service.

Authority behavior: Owns per-swarm pipeline run serialization and startup stale-session reconciliation. Session identity must be confirmed before stale recovery mutates or kills sessions.

Error/retry/terminal behavior: Lock acquisition fails closed on active/malformed/unreclaimable lock; stale recovery throws if identity or stop confirmation cannot be confirmed and records recovery-block event/Discord alert. Module stale status resets only after confirmed terminal/kill or stale no-session age over 10 minutes. Gate active-session file is removed only after confirmed terminal/kill or no session key.

Verification coverage: `check-final-gate-hardening.mjs`, `foundations.mjs`, `restart-recovery.mjs`, and contract slice tests cover lock and recovery surfaces.

Findings: None.

### `skills/nova/pipeline/runners/pipeline-runner-scheduling.js`

Role: Validator/generator plugin invocation, configured validator schedule resolution, mandatory full-lint scheduling, next-step selection, and pre-run blueprint prep.

Imports/dependencies: Logger; plugin context/registry; constants/runtime; contract diagnostics; validator control contracts; arch/module validators; blueprint services; pipeline-step result contract; shared scheduler projections; stage envelope primitives; snapshots and validator completion helpers.

Exports/public surface: `isScheduledValidatorComplete`, `markScheduledValidatorComplete`, `projectValidatorControlResultToStepResult`, `validateGeneratorExecutionResult`, `runScheduledValidator`, `runScheduledGenerator`, `resolveConfiguredValidatorSchedule`, `findNextStep`, `preparePipeline`.

Defines: Generator and validator run input builders, state snapshots, plugin invocation builders, architecture validator normalization, generator result validation, configured schedule normalization, next-step routing.

Important variables/state: No module-local mutable state. Completion state delegated to `validator-completions.js`.

Calls out to: `requireStageHandler`, `createPluginContext`, `buildPluginInvocationEnvelope`, validator/generator plugin handlers, `normalizeTypedValidatorControlResult`, `buildPipelineStepResultFromControlResult`, `loadAuthoritativeModuleState`, `projectPipelineGateState`, `releaseGateFiles`, `syncControlFiles`.

Called by / expected callers: Loop/start/terminal/main runner and tests.

Environment variables / CLI inputs / config fields: Reads `progress.execution_order`, `progress.validators.schedule`, `progress.validators.config`, `progress.arch_validation`, `config.arch_validation`, `config.validators`, plugin registry stage owners, gate `type`, `lint_tier`, module/gate configs.

Paths built/read/written: Generator artifact refs from snapshot helper; validator completion persistence via completion helper; blueprint prep delegates control file release/sync.

Authority behavior: Owns scheduler next-step decision and scheduled validator/generator plugin dispatch envelopes. Gate/module completion authority is delegated to status-store scheduler projections.

Error/retry/terminal behavior: Validator registry/execution errors return failed validator control results; contract invalid diagnostics are preserved. Generator registry/execution/contract errors return degraded generator result. Blueprint prep failures log WARN and continue. No retry/backoff locally.

Verification coverage: Pipeline behavior tests cover validators, mandatory full-lint before review gates, schedule persistence/resume, generator execution, and next-step skipping consumed gates.

Findings: None.

### `skills/nova/pipeline/runners/pipeline-runner-scheduling/snapshots.js`

Role: Small helper for status-count snapshots and generator artifact references.

Imports/dependencies: Node `path`; `collectExistingArtifactRefs`.

Exports/public surface: `countByStatus`, `buildGeneratorArtifactRefs`.

Defines: Status counter and summary/latest artifact reference list.

Important variables/state: None.

Calls out to: `collectExistingArtifactRefs`.

Called by / expected callers: `pipeline-runner-scheduling.js` generator state/input builders.

Environment variables / CLI inputs / config fields: Reads `config._logDir` and `config._runLogDir`.

Paths built/read/written: Builds `<_runLogDir>/summary.json`, `<_logDir>/pipeline/summary.json`, and `<_logDir>/pipeline/latest.json` artifact refs; does not write them.

Authority behavior: Owns generator artifact reference construction for pipeline summaries.

Error/retry/terminal behavior: No local catch; returns empty refs if no pipeline log dir.

Verification coverage: Generator/summaries behavior tests indirectly cover artifact refs.

Findings: None.

### `skills/nova/pipeline/runners/pipeline-runner-scheduling/validator-completions.js`

Role: Durable per-run scheduled validator completion marker store.

Imports/dependencies: Node `fs`, `path`; logger; `getRunId`.

Exports/public surface: `scheduledValidatorCompletionPath`, `markScheduledValidatorComplete`, `isScheduledValidatorComplete`.

Defines: Completion path resolution, mutable config `_validatorRunState` cache, durable JSON load/save.

Important variables/state: Mutates `config._validatorRunState = { completed: Set, durableLoaded }`.

Calls out to: `fs.existsSync`, `readFileSync`, `mkdirSync`, `writeFileSync`, `renameSync`, logger.

Called by / expected callers: `pipeline-runner-scheduling.js`, `pipeline-runner-loop.js`, schedule resume tests.

Environment variables / CLI inputs / config fields: Reads `config._runLogDir`, `_logDir`, `paths.swarm_dir`, `_runId`/`run_id`.

Paths built/read/written: Builds and atomically writes `scheduled-validator-completions.json` under run log dir or `<swarm_dir>/logs/pipeline/runs/<runId>/`.

Authority behavior: Owns exactly-once scheduled validator completion state within a run.

Error/retry/terminal behavior: Unreadable completion file logs WARN and treats as empty. Save errors propagate. No retry/backoff.

Verification coverage: Pipeline behavior tests assert completion file persistence and resume idempotence for after-module validators.

Findings: None.

### `skills/nova/pipeline/runners/pipeline-runner-shared.js`

Role: Shared pipeline runner projections, Discord field builders, halt/escalation payloads, module/gate scheduler read-model adapters, and blocked-module step result builder.

Imports/dependencies: Logger active context; status-store projections; constants; pipeline-step result contract; correlation helpers; Discord field builders.

Exports/public surface: `_telemetryCtx`, `buildPipelineDiscordFields`, `getResultGateType`, `getProgressGateType`, `resolvePipelineGateType`, `buildEscalationPayload`, `buildPipelineHaltPayload`, `projectPipelineGateState`, `loadModuleStatus`, `loadAuthoritativeModuleState`, `hasModuleStarted`, `hasAnyStartedModules`, `buildBlockedModuleResult`, `buildResultWithStepCorrelation`.

Defines: Correlation projection helpers, rate-limit halt payload fields, scheduler read-model adapter, module-start detector, typed blocked-module step result, narrow halt-correlation boundary.

Important variables/state: None.

Calls out to: `getActiveContext`, status-store projection helpers, pipeline-step result builder/projection, correlation resolvers, Discord field builder.

Called by / expected callers: Runner start/scheduling/recovery/terminal/main, tests.

Environment variables / CLI inputs / config fields: Reads `progress.execution_order`, `progress.modules`, `progress.gates`, status projections, `config.run_id`/`_runId`.

Paths built/read/written: Reads module status through status-store `loadStatus`; no direct path building.

Authority behavior: Owns pipeline-runner view of module/gate scheduler read models and terminal halt correlation boundary. It explicitly avoids mining arbitrary nested raw result status shapes for authority.

Error/retry/terminal behavior: Missing module/gate/status projections return null/defaults; blocked-module builder returns typed halt result with `EXIT_BLOCKED`.

Verification coverage: Contract slice test asserts projections delegate to status-store and raw nested status correlation is rejected.

Findings: None.

### `skills/nova/pipeline/runners/pipeline-runner-start.js`

Role: Pipeline start initialization, run-scoped log/config snapshot, single-module mode, and architecture validation preflight.

Imports/dependencies: Node `fs`, `path`; logger; pipeline lifecycle event API; path builders; constants; architecture validator; telemetry; cost/governance/correlation/rate-limit services; shared runner helpers; scheduling and terminal helpers; runner deps.

Exports/public surface: `startPipelineRun`, `runSingleModulePipeline`, `preparePipelineStart`.

Defines: Run log dir ensure, config validation snapshot writer, start description builder, single-module terminal flow, architecture validation gate.

Important variables/state: Mutates `config._progress`, may set `config._logDir` and `config._runLogDir`, resolves arch-validator model/thinking from progress arch override/defaults plus platform fallback without mutating config role models, initializes governance context.

Calls out to: `appendPipelineLifecycleEvent`, `onPipelineStarted`, `resumeDurableCooldownForStep`, `runModule`, `finalizeTerminalHalt`, `runScheduledValidator`, `extractArchValidatorReport`, `recordArchValidatorResult`, `emitOperatorAlert`, `onEscalated`, `onPipelineHalted`, `emitPipelineSummaryLifecycle`, `writeCostReport`, `preparePipeline`.

Called by / expected callers: `pipeline-runner.js runPipeline`.

Environment variables / CLI inputs / config fields: Reads `opts.module`, `opts.resume`, `opts.skipArchValidation`, `opts.novaPrompt`, `opts.novaChannel`; config/progress architecture validation settings and models.

Paths built/read/written: Ensures `pipelineRunLogDir(config)` exists; writes `<_runLogDir>/config-validation.json`; cost/summary paths delegated.

Authority behavior: Owns pipeline run start lifecycle and pre-module architecture validation decision.

Error/retry/terminal behavior: Config snapshot write and cost write are non-critical. Single-module non-OK results finalize terminal halt. Architecture execution error exits `EXIT_ERROR`; blocking findings exit `EXIT_BLOCKED`; both emit operator alert and terminal telemetry.

Verification coverage: Pipeline behavior tests cover single-module success/failure/rate-limit and architecture validation resume/fresh-start behavior.

Findings: None.

### `skills/nova/pipeline/runners/pipeline-runner-terminal.js`

Role: Terminal completion/halt normalization, operator alerts, escalation, summary/cost generation, and terminal generator scheduling.

Imports/dependencies: Node `path`; logger; status-store lifecycle/read models; constants; telemetry; cost; correlation; pipeline-step result contract; shared runner helpers; scheduling generator helper; runner deps.

Exports/public surface: `normalizeStepResultForPipeline`, `emitPipelineSummaryLifecycle`, `finalizeTerminalHalt`, `completePipeline`, `haltPipeline`.

Defines: Exit labels, invalid-step-result builder, summary lifecycle wrapper, terminal halt finalizer, complete pipeline flow, blocked/generic halt route.

Important variables/state: None.

Calls out to: `appendPipelineLifecycleEvent`, `emitOperatorAlert`, `injectNeedsNova`, `onEscalated`, `output`, `onPipelineHalted`, `onPipelineCompleted`, `writeSummary`, `writeCostReport`, `runScheduledGenerator`, `loadLifecycleReadModels`.

Called by / expected callers: Loop/start/main runner and tests.

Environment variables / CLI inputs / config fields: Reads `opts.novaChannel`, run id/project, progress state, `_logDir`; terminal generator scheduling uses project config through plugin registry.

Paths built/read/written: Summary output dir `<_logDir>/pipeline`; lifecycle/status/summary/cost/generator artifacts delegated.

Authority behavior: Owns terminal exit mapping from typed pipeline-step results, operator alert payloads, and completion generator scheduling.

Error/retry/terminal behavior: Invalid raw step results are converted to terminal `EXIT_ERROR`; terminal halt injects needs-Nova only for NEEDS_NOVA/TIMEOUT, escalates NEEDS_NOVA/TIMEOUT/BLOCKED, writes summary/cost best-effort, and may schedule project summary on blocked. Completion is idempotent if lifecycle read model already says completed or append sees terminal state.

Verification coverage: Contract slice test checks typed step-result authority and rate-limit source; pipeline/resume/summaries tests cover terminal paths.

Findings: None.

### `skills/nova/pipeline/runners/pipeline-runner.js`

Role: Public pipeline runner facade: top-level run orchestration, status print, dry run, and extracted helper exports.

Imports/dependencies: Logger/runtime output/constants; shared scheduler projections; scheduling/recovery/deps/start/loop helpers.

Exports/public surface: Default `runPipeline`; named `runPipeline`, `validateGeneratorExecutionResult`, `runScheduledGenerator`, `findNextStep`, `PIPELINE_RUN_CONCURRENCY_LIMIT`, `acquirePipelineRunLock`, `releasePipelineRunLock`, terminal/start/loop helper re-exports, `printStatus`, `dryRun`.

Defines: Top-level run sequence, status overview printer, dry-run printer.

Important variables/state: No module state. Run lock object is local and always released in `finally` after acquisition.

Calls out to: `acquirePipelineRunLock`, `reconcileStaleModuleState`, `reconcileStaleGateSessions`, `startPipelineRun`, `runSingleModulePipeline`, `preparePipelineStart`, `runPipelineLoop`, `releasePipelineRunLock`, `loadAuthoritativeModuleState`, `projectPipelineGateState`, `output`, `log`.

Called by / expected callers: Pipeline CLI/index/public skill surface and tests.

Environment variables / CLI inputs / config fields: Uses `opts.module`, `opts.resume`, `opts.skipArchValidation`; status/dry-run read progress/config modules/gates/models.

Paths built/read/written: Delegated to helper modules. `printStatus` writes JSON to runtime output; `dryRun` writes logs only.

Authority behavior: Owns top-level execution order: acquire lock, stale recovery, start event, single-module short-circuit, prep/architecture validation, loop, release lock.

Error/retry/terminal behavior: No catch except lock release `finally`; errors propagate to caller. Dry-run/status do not mutate pipeline state.

Verification coverage: Startup smoke checks public export; pipeline behavior tests execute top-level runner; contract slice test checks extraction boundaries.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `pipeline-runner.js` | `pipeline-runner-recovery.js` | lock acquire/release, stale reconciliation | Top-level run safety before pipeline start. |
| `pipeline-runner.js` | `pipeline-runner-start.js` | `startPipelineRun`, `runSingleModulePipeline`, `preparePipelineStart` | Start, single-module, and architecture validation phases. |
| `pipeline-runner.js` | `pipeline-runner-loop.js` | `runPipelineLoop` | Full scheduler loop after prep. |
| `pipeline-runner-loop.js` | `pipeline-runner-scheduling.js` | next-step and validator helpers | Scheduler selection and validator execution. |
| `pipeline-runner-loop.js` | `pipeline-runner-terminal.js` | `completePipeline`, `haltPipeline`, normalization | Terminal routing from loop. |
| `pipeline-runner-start.js` | `pipeline-runner-terminal.js` | `finalizeTerminalHalt`, `emitPipelineSummaryLifecycle` | Single-module and architecture terminal exits. |
| `pipeline-runner-terminal.js` | `pipeline-runner-scheduling.js` | `runScheduledGenerator` | Project summary/review/case-study generator scheduling. |
| `pipeline-runner-scheduling.js` | `pipeline-runner-scheduling/validator-completions.js` | completion load/save helpers | Durable scheduled validator idempotence. |
| `pipeline-runner-scheduling.js` | `pipeline-runner-scheduling/snapshots.js` | counts/artifact refs | Generator input state snapshots. |
| runner helpers | `pipeline-runner-deps.js` | `getPipelineRunnerDeps` | Central test override seam. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `runPipeline` | `opts.module` | CLI opts | Run single-module path after start/recovery | Single module bypasses full prep/loop. |
| `runPipelineLoop` | `findNextStep` returns done/blocked/validator/gate/module | Scheduler projection | Complete, halt, run validator/gate/module | Main loop dispatch authority. |
| `findNextStep` | Execution-order item is validator/gate/module | `progress.execution_order` and read models | Inline validator, gate scheduler, module scheduler, done | Top-level scheduling. |
| `findNextStep` | Gate consumed/completed | Gate scheduler projection | Skip gate and run after-gate validator if pending | Avoids rerunning consumed gates. |
| `findNextStep` | Review gate has full-lint owner | Gate type and plugin registry stage owner | Insert mandatory full-lint before review gate | Enforces pre-review lint. |
| `findNextStep` | Module PASS/BLOCKED/FAIL/other | Module scheduler projection | Skip, halt blocked, retry fail, resume other | Module progression authority. |
| `maybeRunArchitectureValidation` | Arch enabled, not skipped, and fresh/resume-before-work | Config/progress/opts/module started state | Run validator or skip | Prevents rerunning architecture validation after module work started. |
| `finalizeTerminalHalt` | Exit code NEEDS_NOVA/TIMEOUT/BLOCKED/RATE_LIMITED | Typed pipeline-step result | Inject needs-Nova, emit escalation, include rate-limit fields | Terminal side effects by exit class. |
| `completePipeline` | Lifecycle read model already completed or terminal append error | Lifecycle read model/append error | Return OK idempotently | Resume-safe completion. |
| `reconcileStaleModuleState` | Active session, old status age, stop confirmed | Status active_agent/updated_at/monitor | Reset for retry, kill orphan, or block recovery | Safe startup recovery. |
| `acquirePipelineRunLock` | Lock absent, active, reclaimable, malformed | Lock file and pid/host | Create, throw, reclaim, or throw | Per-swarm concurrency limit. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `getPipelineRunnerDeps` | Dependency object | Defaults and `config._testOverrides.pipelineRunner` | Defaults first, test overrides second | Tests can replace runner dependencies. |
| `validatorRunState` | `config._validatorRunState` | Existing config cache/durable file | Initialize cache, normalize completed Set, load durable once | Scheduled validator completion cache. |
| `markScheduledValidatorComplete` | Completion Set and JSON file | Schedule key | Add key then atomic write sorted completion records | Completed validators are idempotent across resume. |
| `startPipelineRun` | `config._progress`, log dirs | Config/progress | Attach progress; set `_logDir` from swarm dir if absent; set `_runLogDir` from run log builder | Programmatic calls get run log dirs. |
| `maybeRunArchitectureValidation` | Arch-validator runtime policy | Progress arch override/defaults plus platform fallback model | Resolve model/thinking through policy without mutating config role models | Progress supplies arch-validator model/thinking before platform fallback. |
| `reconcileStaleModuleState` | Module status object | Monitor/kill/no-session recovery | Append recovery event, transition status, optionally mark lifecycle intent, save status | Stale in-progress/test state reset safely. |
| `reconcileStaleGateSessions` | Gate active-session recovery file | Monitor/kill result | Append recovery event then remove file | Stale gate active session state cleared only after confirmation. |
| `finalizeTerminalHalt` | Lifecycle/summary/cost/generator artifacts | Typed step result | Normalize result, build correlated projection, append halt lifecycle, emit outputs/telemetry | Terminal state projected once. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `runPipelineLoop` | `while (true)` | Delegated to step runners/cooldown | None locally | Returns on done or non-continuing step. |
| `acquirePipelineRunLock` | `while (true)` until lock created or unrecoverable error | None | None | Returns on exclusive create; throws active/malformed/unreclaimable lock. |
| `reconcileStaleModuleState` | Iterate progress modules | KillSession polling delegated | Stop confirm timeout default 15000 ms, poll 2000 ms | Continue modules; throw on unconfirmed active session. |
| `reconcileStaleGateSessions` | Iterate progress gates | KillSession polling delegated | Stop confirm timeout default 15000 ms, poll 2000 ms | Continue gates; throw on unconfirmed active session. |
| Scheduled validator completion load | Load once per config cache | None | None | `durableLoaded` prevents repeated disk reads. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `opts.module` | CLI/run option | `runPipeline`, `startPipelineRun`, `runSingleModulePipeline`, lock owner | null | Single-module mode. |
| `opts.resume` | CLI/run option | `runPipeline`, arch validation, lock owner | false | Affects lock owner and architecture validation skip. |
| `opts.skipArchValidation` | CLI/run option | `maybeRunArchitectureValidation` | false | Bypasses pre-module architecture validator. |
| `opts.novaPrompt`, `opts.novaChannel` | CLI/run option | Loop/terminal | null | Forwarded to module/gate runners and needs-Nova injection. |
| `config._testOverrides.pipelineRunner` | Test override | `getPipelineRunnerDeps` | `{}` | Replaces runner dependencies. |
| `config.recovery_session_stop_confirm_timeout_ms`, `_testOverrides.recovery.killConfirmTimeoutMs` | Config/test field | Recovery stop options | `15000` | Stale session stop confirmation timeout. |
| `config.recovery_session_stop_confirm_poll_ms`, `_testOverrides.recovery.killConfirmPollMs` | Config/test field | Recovery stop options | `2000` | Stale session stop polling interval. |
| `progress.validators.schedule[]` | Progress config | Scheduler | `[]` | Configured before/after/inline validator schedule. |
| `progress.arch_validation`, `config.arch_validation` | Config/progress fields | Start architecture validation | enabled default true | Progress can override model/thinking when config lacks values. |
| `config._runLogDir`, `_logDir`, `paths.swarm_dir` | Config paths | Validator completions, snapshots, start, recovery | Derived from swarm dir/run id | Run artifacts and locks. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| `<swarm_dir>/logs/pipeline/active-run.lock.json` | `pipelineRunLockPath` | Lock acquire/release | Lock acquire/release | Serializes pipeline runs per swarm dir. |
| `<_runLogDir>/scheduled-validator-completions.json` | `scheduledValidatorCompletionPath` | Validator completion loader | Completion saver | Durable scheduled validator idempotence. |
| `<_runLogDir>/config-validation.json` | `writeConfigValidationSnapshot` | Operators/tests | Pipeline start | Best-effort config validation snapshot. |
| `<_runLogDir>/summary.json`, `<_logDir>/pipeline/summary.json`, `<_logDir>/pipeline/latest.json` | `buildGeneratorArtifactRefs` | Generator inputs/operators | Summary services outside P06 | Existing artifact refs for generators. |
| Module status JSON | Status-store helpers | Recovery/shared/start | Recovery saves reset status | Concrete status paths owned by status-store. |
| Gate active-session recovery file | Gate active-session service | `reconcileStaleGateSessions` | Removed after confirmed recovery | File path supplied by gate service. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Pipeline run concurrency lock | `pipeline-runner-recovery.js` | Runner start/tests/operators | None. |
| Top-level run sequence | `pipeline-runner.js runPipeline` | CLI/public skill surface | None. |
| Scheduler next-step decision | `pipeline-runner-scheduling.js findNextStep` | Pipeline loop/dry-run/status tests | Status-store read-model authority reviewed in P14/P15. |
| Scheduled validator completion state | `validator-completions.js` | Scheduler/loop/resume | None. |
| Pre-pipeline architecture validation decision | `pipeline-runner-start.js` | Pipeline start | Full validator implementation reviewed in P19. |
| Terminal exit mapping and pipeline halt/completion side effects | `pipeline-runner-terminal.js` | CLI exit/public outputs/telemetry | None. |
| Pipeline runner dependency injection seam | `pipeline-runner-deps.js` | Tests and helper modules | None. |
| Stale session recovery decisions | `pipeline-runner-recovery.js` with session authority and ACP monitor | Startup recovery and operators | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Pipeline run lock | `acquirePipelineRunLock` | `token`, `pid`, `hostname`, `project`, `run_id`, `module`, `resume`, `acquired_at`, `repo_root` | Lock read/reclaim helpers | Runner lock release/operators. |
| Scheduled validator completion JSON | `saveScheduledValidatorCompletions` | `schemaVersion:'v1'`, `project`, `run_id`, `completed:[{ key, completed_at }]` | Loader normalizes strings/objects to keys | Scheduler completion cache. |
| Validator run input | `buildValidatorRunInput` | `refs`, `ids`, `validator`, optional `module`/`gate`, `artifacts`, `stateSnapshot`, `executionContext` | Plugin envelope/context | Validator plugin handlers. |
| Generator run input | `buildGeneratorRunInput` | `refs`, `ids`, `generator.config`, `artifacts`, `summaries`, `stateSnapshot`, `executionContext` | Plugin envelope/context | Generator plugin handlers. |
| Generator execution result | Generator plugin or degraded fallback | `schemaVersion:'v1'`, `producerKind:'generator'`, `producerType`, `outputs.status`, optional `artifacts`, `diagnostics` | `validateGeneratorExecutionResult` | Terminal generator scheduling/tests. |
| Pipeline halt lifecycle event data | `finalizeTerminalHalt` | `progress`, `result`, `stepType`, `stepId`, `haltReason` | Typed step result normalization | Lifecycle event store. |
| Recovery blocked lifecycle event data | `recordUnconfirmedRecoveryBlock` | `scope`, ids, previous phase, attempt, dispatch/session/gateway, status/evidence, stop/session authority, reason | Local builder | Lifecycle event store/operators. |
| Pipeline status overview | `printStatus` | `{ project, timestamp, modules:{...}, gates:{...} }` | Scheduler projections | Runtime output consumers. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Validator plugin invocation | `runScheduledValidator` | None built in P06 | Structured validator input from progress/config/state snapshot | Registry `validator.run` handler through plugin context | Typed validator control result. |
| Generator plugin invocation | `runScheduledGenerator` | Summary artifact refs in input | Structured generator input from progress/config/state snapshot | Registry `generator.run` handler through plugin context | Generator execution result v1. |
| Module/gate runner prompt forwarding | `runPipelineLoop` | None built in P06 | Forwards `opts.novaPrompt` to module/gate runners | Module/gate runner contracts outside P06 | Typed pipeline step result. |

No direct natural-language prompt text is built in P06 scoped files; P06 builds structured plugin inputs and forwards caller prompts.

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `runPipeline` | Any thrown setup/loop/recovery error | No local retry | No retry/backoff | Propagates after `releasePipelineRunLock` finally | None. |
| `acquirePipelineRunLock` | Active/malformed/unreclaimable lock | No | No retry/backoff | Throws descriptive error; reclaim only dead same-host pid | None. |
| `releasePipelineRunLock` | Token mismatch/malformed lock/ENOENT | No | No retry/backoff | Returns without deleting mismatched/malformed; ignores ENOENT; other errors throw | None. |
| `reconcileStaleModuleState` | Unconfirmed identity/kill, monitor/kill failure | No | Kill confirmation default 15000 ms, poll 2000 ms | Records block and throws; otherwise resets safely | None. |
| `reconcileStaleGateSessions` | Unconfirmed identity/kill, monitor/kill failure | No | Kill confirmation default 15000 ms, poll 2000 ms | Records block and throws; otherwise removes active-session file | None. |
| `runScheduledValidator` | Registry/handler/contract/execution failure | No | No retry/backoff | Logs ERROR and returns failed validator control result | Contract diagnostic may include raw result/input. |
| `runScheduledGenerator` | Registry/handler/contract/execution failure | No | No retry/backoff | Logs WARN and returns degraded generator result | Contract diagnostic may include raw result/input. |
| `preparePipeline` | Gate file release/control sync failure | No | No retry/backoff | Logs WARN and continues | None. |
| `validator-completions.js` | Unreadable completion file/save failure | No | No retry/backoff | Read logs WARN and treats empty; save throws | None. |
| `writeConfigValidationSnapshot` / cost reports | File write failure | No | No retry/backoff | Snapshot/cost write swallowed as non-critical | Snapshot includes config validation issues only. |
| `normalizeStepResultForPipeline` | Non-typed step result | No | No retry/backoff | Converts to invalid typed halt result with `EXIT_ERROR` | Rejected result keys only, not full payload. |
| `completePipeline` | Already terminal/completed lifecycle | Not error | No retry/backoff | Returns OK idempotently | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `runPipeline` | Thrown setup/loop/recovery error | No direct telemetry | none | none | Function propagates | CLI/top-level caller owns final logging/exit. |
| `acquirePipelineRunLock` | Lock conflict/error | Partial | Core logger on success only; thrown error text on failure | none on failure | Function throws | Caller/operator sees exception. |
| `releasePipelineRunLock` | Token mismatch/malformed/ENOENT | Partial | INFO log on release success | none for mismatch/malformed | Function return/throw | Safe non-delete is silent. |
| `reconcileStaleModuleState` | Recovery block/reset | Yes | Lifecycle event store, Discord/audit, telemetry, core log | `recovery.stale_blocked`, stale recovery Discord, `module.status_changed` | Recovery helpers | Discord failures log WARN/DEBUG. |
| `reconcileStaleGateSessions` | Recovery block/cleanup | Yes | Lifecycle event store, Discord/audit, core log | `recovery.stale_blocked` or stale recovery event, Discord WARN/CRITICAL | Recovery helpers | No module status telemetry for gate file cleanup. |
| `runScheduledValidator` | Registry/execution/contract failure | Yes | Core logger and returned control result | ERROR log; failed validator control result diagnostics | Scheduler | Upstream terminal path emits operator alert if halting. |
| `runScheduledGenerator` | Registry/execution/contract failure | Yes | Core logger and returned degraded generator result | WARN log; generator diagnostics error | Scheduler | Terminal completion continues. |
| `preparePipeline` | Gate/control sync failure | Yes | Core logger | WARN log | `preparePipeline` | Non-critical. |
| `validator-completions.js` | Unreadable completion file/save failure | Partial | Core logger for read failure | WARN `Scheduled validator completion state unreadable` | Loader | Save failure throws without local telemetry. |
| `writeConfigValidationSnapshot` / cost reports | File write failure | No | none | none | Swallowed catch | Non-critical artifact loss is silent. |
| `normalizeStepResultForPipeline` | Non-typed step result | Indirect | Typed invalid step result then terminal alert | `compatibility_authority_rejected` metadata | Normalizer/terminal halt | Terminal halt emits operator alert. |
| `completePipeline` | Already terminal/completed lifecycle | Yes | Core logger | INFO idempotent completion log | `completePipeline` | Returns OK. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js runtime | `node` binary | Observed `v24.14.0` during review | All P06 modules | ESM, fs/path/os/process, async loops | No package pin in scoped files. |
| Node `fs`/`path`/`os` built-ins | Runtime built-ins | Node major 24 observed | Recovery, start, snapshots, validator completions | Lock files, run artifacts, hostname, JSON persistence | Sync IO used for locks and validator completion state. |
| OpenClaw/ACP gateway/session helpers | Internal/external gateway via lifecycle/monitor | Reviewed P04 | Recovery | Observe/kill stale sessions | Kill confirmation defaults 15000 ms in recovery. |
| Plugin registry/context | Internal source | Reviewed P02/P01 | Scheduling | Validator/generator stage handler invocation | Registry failures degrade validator/generator results. |
| Status-store services | Internal source | Reviewed later P14/P15 | Recovery/shared/start/terminal | Lifecycle events, module/gate projections, status persistence | Full authority reviewed later. |
| Telemetry/Discord services | Internal/external | Reviewed P03/P16 later | Start/recovery/terminal | Operator alerts, lifecycle and summary events | Sink failures often non-critical. |
| Pipeline-step and validator/generator contracts | Internal source | P13/P19 later | Scheduling/terminal/shared | Typed step/control/result validation | Invalid step result becomes terminal `EXIT_ERROR`. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Pipeline run lock | Hard concurrency limit | `PIPELINE_RUN_CONCURRENCY_LIMIT = 1` per `swarm_dir` | Active/malformed/unreclaimable lock throws; dead same-host pid reclaimed | INFO logs on acquire/release | None. |
| Scheduler loop | Sequential one-step-at-a-time loop | No queue/concurrency | Blocks until current module/gate/validator returns; non-continue halts | Step-level telemetry downstream | None. |
| Scheduled validator completions | In-memory Set plus one JSON file | Durable load once per config | Save failure throws; read failure treats empty | WARN on unreadable file | None. |
| Stale recovery | Sequential modules then gates | Stop confirm 15000 ms, poll 2000 ms | Unconfirmed session blocks recovery and run start | Lifecycle/Discord/log events | None. |
| Generators on completion/halt | Sequential scheduled generator calls | project_summary on blocked; three generators on complete | Generator failure returns degraded result but terminal flow continues | WARN/degraded result | None. |
| Summary/cost/config snapshots | Synchronous/best-effort file writes | No retry | Snapshot/cost failures swallowed; summary failure projected in telemetry | Summary telemetry; none for snapshot/cost | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Stale session monitor evidence | `observeAcpMonitorSurfaces` result `{ monitor }` | ACP monitor service | Recovery | Kill confirmation default 15000 ms; monitor evidence required for active sessions | Used to decide terminal vs kill orphan. |
| Stale session kill request | `killSession(active.session_key, { runtime, model, agentId, label, confirmTimeoutMs, confirmPollMs })` | Recovery | Shared lifecycle/gateway | Confirmation polling delegated to lifecycle | Recovery block if `confirmed` false. |
| Validator/generator plugin envelope | `buildPluginInvocationEnvelope(input, pluginContext)` | Scheduler | Registry plugin handlers | No ACP transport; in-process plugin call | Inputs schemas listed above. |
| Terminal generator scheduling | `runScheduledGenerator` for summary/review/case-study | Terminal helper | Registry generator handlers | Sequential awaits; degraded result on failure | Generator result v1. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Pipeline runner slice boundaries and typed step-result authority | `tests/verification/contracts/check-pipeline-runner-slice-surface.mjs` | Strong source/import/export and behavior assertions | Does not execute every terminal branch. |
| Pipeline lock concurrency and final-gate hardening | `tests/verification/runtime/check-final-gate-hardening.mjs`, `foundations.mjs` | Good lock behavior coverage | Malformed lock manual recovery not deeply exercised. |
| Full pipeline scheduling, validators, architecture validation, terminal paths | `tests/verification/behavior/areas/pipeline.mjs` | Strong behavior coverage | Very broad; individual generator failure branches limited. |
| Restart/stale recovery | `tests/verification/behavior/areas/restart-recovery.mjs`, `resume-idempotence.mjs` | Good recovery/resume coverage | Actual OS/process reaper behavior covered indirectly. |
| Public startup export | `tests/verification/runtime/check-nova-startup-smoke.mjs` | Smoke coverage | No behavior assertions. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- None yet.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
