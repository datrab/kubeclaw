# Batch V02b — Behavior verification pipeline, recovery, resume, sequence, and stops

Status: completed
Date started: 2026-05-09
Date completed: 2026-05-09
Reviewer: Nova

## Scope

```text
tests/verification/behavior/areas/pipeline.mjs
tests/verification/behavior/areas/restart-recovery.mjs
tests/verification/behavior/areas/resume-idempotence.mjs
tests/verification/behavior/areas/seq-restart.mjs
tests/verification/behavior/areas/stops.mjs
```

Scope expansion verified live: 5 files, under the 10-file maximum. The scoped files were read end to end.

## Sources checked

Implementation files:

```text
kubeclaw-main/tests/verification/behavior/areas/pipeline.mjs
kubeclaw-main/tests/verification/behavior/areas/restart-recovery.mjs
kubeclaw-main/tests/verification/behavior/areas/resume-idempotence.mjs
kubeclaw-main/tests/verification/behavior/areas/seq-restart.mjs
kubeclaw-main/tests/verification/behavior/areas/stops.mjs
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/docs/pipeline/implementation-map/README.md
kubeclaw-main/docs/pipeline/implementation-map/batch-template.md
kubeclaw-main/docs/open-issues.md
```

## Per-file map

### `tests/verification/behavior/areas/pipeline.mjs`

Role: Behavior area for top-level `runPipeline` halt/finalizer semantics, typed pipeline step result authority, gate and architecture-validator scheduling, mandatory and scheduled validator stages, generator stage scheduling, pipeline telemetry, Discord halt evidence, and correlation/provenance handling.

Imports/dependencies: Node `fs`, `os`, `path`, `assert`; `materializeRuntimeTree` and `importRuntimeModule` from `../../lib/lifecycle-audit-lib.mjs`; materialized Nova runtime modules including pipeline runner, registry, runtime, constants, status/lifecycle, and architecture validator.

Exports/public surface: `registerPipelineArea(deps)`.

Defines: `buildBuiltInRegistry(runtimeRoot)`, `withStubbedGeneratorStages(registry)`, `stepOutcomeForExit(exitCode)`, `makeStepResult(...)`, `readJsonl(filePath)`, `seedBlockedModuleLifecycleState(...)`, `seedFailedModuleLifecycleState(...)`, and 26 behavior records.

Important variables/state: Fake Redis globals; temp repo/module/log roots; `_pluginRegistry` stage-owner fixtures; `_testOverrides.pipeline` and `_testOverrides.moduleRunner` hooks; `progress.execution_order`, modules, gates, validators, and generators; run-scoped config fields; captured outputs, Discord calls, and telemetry events.

Calls out to: `runPipeline`, `runArchitectureValidatorStage`, status/lifecycle helpers, fake Redis `xaddEvents`/`flushAsync`, Discord sink stubs, built-in/stubbed validator and generator stage owners.

Called by / expected callers: `tests/verification/behavior/verify.mjs` when the `pipeline` area is selected.

Environment variables / CLI inputs / config fields: No direct env reads. Fixture configs use `project`, `repo_root`, `paths.swarm_dir`, `paths.modules_dir`, `telemetry.enabled`, `_runId`/`run_id`, `_runStats`, `_logDir`, `_runLogDir`, `_pluginRegistry`, `_testOverrides`, `_disable_discord_webhooks`, `default_timeout_minutes`, `default_max_fails`, and progress fields `execution_order`, `modules`, `gates`, `validators`, `generators`.

Paths built/read/written: Temp repos under `os.tmpdir()`; `.swarm/modules/<module>/status.json`; `.swarm/logs`; run log roots; `discord.jsonl`; `architecture-validator/results.json`; `architecture-validator/summary.md`; `scheduled-validator-completions.json`; fake Redis streams `pipeline:telemetry:<project>:<runId>`.

Authority behavior: Verifies typed `pipeline_step_result` objects own scheduler halt/continue semantics instead of raw exit fallback; module/gate status correlation can be carried as provenance only; architecture validators and generators run through registry stage owners; pipeline finalizer owns halt telemetry and summary scheduling.

Error/retry/terminal behavior: Covers module NEEDS_NOVA/BLOCKED/RATE_LIMITED halts, missing gate registry fail-closed behavior, gate halt/rate-limit surfaces, architecture validation block/error/registry-miss behavior, request-fix validator halts, generator schedule suppression after blockers, and raw exit-shaped step result rejection.

Verification coverage: Direct behavior assertions for pipeline telemetry ordering, Discord halt entries, output payloads, arch-validator report artifacts, generator calls, and scheduler authority.

Findings: The prior malformed `progress.execution_order` gap is resolved; `pipeline.mjs` now covers structured `EXEC_ORDER_ENTRY_INVALID` diagnostics. No new actionable issue was found in the scoped verification file.

### `tests/verification/behavior/areas/restart-recovery.mjs`

Role: Behavior area for restart-time stale ACP/session recovery across module and gate active sessions, terminal reconciliation, no-session recovery, unconfirmed orphan kill blocking, and weak active-agent identity blocking.

Imports/dependencies: Injected behavior deps: `record`, roots, fake Redis helpers, `startGatewayServer`, Node fs/os/path/assert, `execFileSync`, overlay readers/writers, materialized runtime import helpers, and preloaded pipeline/gateway/Discord/lifecycle/monitor/Redis modules.

Exports/public surface: `registerRestartRecoveryArea(deps)`.

Defines: Local `buildBuiltInRegistry(runtimeRootForRegistry)`, `withStubbedGeneratorStages(registry)`, and 5 behavior records.

Important variables/state: Fake gateway request log and session state map; temp `.swarm` status/log roots; active module/gate session keys; lifecycle event logs; status `active_agent` objects; `process.env.OPENCLAW_GATEWAY_URL` save/restore blocks.

Calls out to: `runPipeline`, gateway `session_status`/`sessions_send` stubs, status/lifecycle services, Redis telemetry fake, Discord audit JSONL writer, recovery orchestration in the pipeline runner.

Called by / expected callers: `tests/verification/behavior/verify.mjs` when the `restart-recovery` area is selected.

Environment variables / CLI inputs / config fields: Temporarily sets/restores `process.env.OPENCLAW_GATEWAY_URL`; fixture configs use `project`, paths, `_logDir`, `_runId`/`run_id`, `_runStats`, `_pluginRegistry`, `_testOverrides`, `_disable_discord_webhooks`, `resume`, and telemetry fields.

Paths built/read/written: Temp repo `.swarm` roots; module `status.json`; gate active-session artifacts; lifecycle event files; `.swarm/logs/pipeline/discord.jsonl`; fake Redis telemetry streams.

Authority behavior: Verifies stale recovery writes lifecycle `recovery.stale_reset` or `recovery.stale_blocked` events and status resets; gateway stop confirmation is required before clearing active sessions; weak active-agent identity must not trigger stop requests.

Error/retry/terminal behavior: Handles gateway status lookup errors with degraded/restored observability; terminal observed sessions reset without stop requests; no-session stale recovery emits evidence; unconfirmed stop and weak identity block recovery visibly.

Verification coverage: Direct assertions for status resets, preserved/cleared active-agent fields, gateway request counts, lifecycle events, Redis telemetry, and Discord audit rows.

Findings: None found in scoped files.

### `tests/verification/behavior/areas/resume-idempotence.mjs`

Role: Behavior area for full-pipeline resume idempotence after gate-phase interruption, pending approval reuse, duplicate telemetry/Discord suppression, and pre-pipeline architecture validation resume timing.

Imports/dependencies: Injected fake Redis helpers, Node fs/os/path/assert, materialized runtime import helpers, pipeline runner, approval gate runner, status store, runtime core, lifecycle-state, telemetry, paths, constants, and pipeline-step-result contract modules.

Exports/public surface: `registerResumeIdempotenceArea(deps)`.

Defines: Local `buildBuiltInRegistry(runtimeRoot)`, `loadRuntimeModules()`, `createBaseRepoRoot(prefix)`, `buildResumeHarness()`, `runRepeatedResumeScenario()`, `buildArchValidationResumeHarness({ seedStartedModule })`, and 4 behavior records.

Important variables/state: Approval gate status persisted across interrupted/resumed runs; fake module run call list; Discord call capture; arch-validator call list; module status transitions; fake Redis telemetry events; run id `run-resume-idempotent-1`.

Calls out to: `runPipeline`, approval-gate runner, status-store/lifecycle helpers, telemetry service, built-in registry with stubbed generator stage owners.

Called by / expected callers: `tests/verification/behavior/verify.mjs` when the `resume-idempotence` area is selected.

Environment variables / CLI inputs / config fields: No direct env reads. Fixture configs use `resume`, `project`, paths, `_runId`/`run_id`, `_runStats`, `_pluginRegistry`, `_testOverrides`, `telemetry.enabled`, progress modules/gates, and approval gate timeout/on-timeout fields.

Paths built/read/written: Temp repo `.swarm/modules/01-scaffold`; approval gate state artifacts via paths service; fake Redis stream `pipeline:telemetry:behavior-resume-idempotent:run-resume-idempotent-1`.

Authority behavior: Verifies completed module PASS transition is not duplicated on repeated resume; pending approval state is reused without duplicate approval request telemetry or Discord delivery; arch validation skip/run decision is core-owned by whether module work has started.

Error/retry/terminal behavior: Simulated approval polling interruption rejects once, then repeated `--resume` continues idempotently. Pre-work/no-work arch validation resume paths return expected blocked/continued control outcomes.

Verification coverage: Direct assertions for single PASS event, one approval requested/resolved/verdict sequence, Discord request count, arch-validator call counts, and exit code behavior.

Findings: None found in scoped files.

### `tests/verification/behavior/areas/seq-restart.mjs`

Role: Behavior area for Redis-owned telemetry sequence continuity across Nova/Buster emitter restarts, durable stream artifact replay, and fail-closed identity validation.

Imports/dependencies: Injected fake Redis helpers, Node fs/os/path/assert, materialized runtime import helpers, Nova and Buster telemetry modules, runtime core, and registry builder.

Exports/public surface: `registerSeqRestartArea(deps)`.

Defines: Local `buildBuiltInRegistry(runtimeRootForRegistry)` and 4 behavior records.

Important variables/state: Fake Redis call/counter globals; stream key `pipeline:telemetry:<project>:<runId>`; sequence key `pipeline:telemetry:seq:<project>:<runId>`; Nova/Buster telemetry contexts; run-scoped log paths.

Calls out to: Nova `emitEvent`/`closeTelemetryRedis`, Buster `createTelemetryContext`/`emitEvent`/`closeTelemetry`, fake Redis `xaddEvents`, and telemetry artifact writers.

Called by / expected callers: `tests/verification/behavior/verify.mjs` when the `seq-restart` area is selected.

Environment variables / CLI inputs / config fields: No direct env reads. Fixture contexts/configs require non-empty `project`, `runId`, `module`, `telemetry.enabled`, `_runId`/`run_id`, `_runStats`, `_pluginRegistry`, `_logDir`, and `_runLogDir`.

Paths built/read/written: Temp `.swarm/logs` and run log dirs; durable telemetry stream artifacts written by telemetry service; fake Redis stream and seq keys.

Authority behavior: Verifies Redis counter owns `seq` across process/materialized-runtime restarts; durable artifacts mirror Redis-owned seq for capped replay; weak identity does not fall back to local/unknown streams.

Error/retry/terminal behavior: Missing project/run identity rejects or disables stream publishing rather than using unknown/local fallback.

Verification coverage: Direct assertions for event types, seq values `[1,2,3,4]` across restart, durable artifact seq values, Redis counter values, and missing identity contexts.

Findings: None found in scoped files.

### `tests/verification/behavior/areas/stops.mjs`

Role: Behavior area for Buster gate post-start terminal failure mapping and authoritative gate failure telemetry.

Imports/dependencies: Node `fs`, `os`, `path`, `assert`; `materializeRuntimeTree` and `importRuntimeModule`; fake Redis helpers; Buster gate runner and runtime core modules.

Exports/public surface: `registerStopsArea(deps)`.

Defines: Local `buildBuiltInRegistry(runtimeRootForRegistry)` and one behavior record with seven Buster gate terminal scenarios.

Important variables/state: Scenario matrix for config invalid, spawn failed, parse corrupted, timeout, git error, rate-limit exhausted, and no fix loop; captured Discord calls; fake Redis streams.

Calls out to: `runBusterGate`, runtime stats, fake Redis, Discord sink stubs, and built-in registry.

Called by / expected callers: `tests/verification/behavior/verify.mjs` when the `stops` area is selected.

Environment variables / CLI inputs / config fields: No direct env reads. Fixture configs use `project`, `paths.swarm_dir`, `telemetry.enabled`, `_runId`/`run_id`, `_runStats`, `_pluginRegistry`, `default_timeout_minutes`, `default_max_fails`, and `rate_limit.max_pauses_per_module`/`cooldown_hours`.

Paths built/read/written: Temp Buster runtime tree, fake Redis stream `pipeline:telemetry:<project>:<runId>`; no live suite artifacts are required by the scenario stubs.

Authority behavior: Verifies Buster gate result mapping owns exit code/reason, session/gateway/dispatch correlation, gate verdict telemetry, retry.exhausted telemetry for rate-limit exhaustion, and operator Discord failure notices.

Error/retry/terminal behavior: Config invalid, spawn failed, parse corrupted, timeout, git error, rate limit exhausted, and no-fix loop all return deterministic terminal exits/reasons; rate-limit exhaustion adds retry-exhausted telemetry.

Verification coverage: Direct assertions for returned exit/reason/correlation, `gate.started`, `gate.verdict`, optional `retry.exhausted`, and Discord failure titles.

Findings: None found in scoped files.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `verify.mjs` | `pipeline.mjs` | `registerPipelineArea(sharedAreaDeps)` | Selected behavior area registration for pipeline scheduler/finalizer surfaces. |
| `verify.mjs` | `restart-recovery.mjs` | `registerRestartRecoveryArea(sharedAreaDeps)` | Selected behavior area registration for restart-time ACP/session recovery. |
| `verify.mjs` | `resume-idempotence.mjs` | `registerResumeIdempotenceArea(sharedAreaDeps)` | Selected behavior area registration for resume idempotence. |
| `verify.mjs` | `seq-restart.mjs` | `registerSeqRestartArea(sharedAreaDeps)` | Selected behavior area registration for telemetry sequence restart safety. |
| `verify.mjs` | `stops.mjs` | `registerStopsArea(sharedAreaDeps)` | Selected behavior area registration for terminal Buster gate stops. |
| `pipeline.mjs` | pipeline runner | `runPipeline` | Exercises module/gate/validator/generator scheduling and terminal halt finalization. |
| `pipeline.mjs` | architecture validator | `runArchitectureValidatorStage` | Exercises control-result and artifact behavior for built-in architecture validation. |
| `restart-recovery.mjs` | gateway/session runtime | `session_status`, `sessions_send` | Fake gateway drives stale/terminal/unconfirmed/weak identity recovery branches. |
| `resume-idempotence.mjs` | pipeline runner / approval gate | `runPipeline`, approval gate runner | Exercises repeated resume, pending approval reuse, and duplicate suppression. |
| `seq-restart.mjs` | telemetry services | `emitEvent`, `closeTelemetry`, `closeTelemetryRedis` | Exercises Redis-owned sequence continuity and weak identity rejection. |
| `stops.mjs` | Buster gate runner | `runBusterGate` | Exercises post-start terminal result mapping and telemetry. |
| V02b areas | fake Redis/Discord/filesystem | `xaddEvents`, `flushAsync`, JSONL/status reads | Assertions for telemetry and operator evidence. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `pipeline.mjs stepOutcomeForExit` | exit code `0/10/20/30/40/default` | numeric exit | maps to continue/pass or halt needs_nova/blocked/timeout/rate_limited/error | Builds typed pipeline-step fixtures and verifies raw exit fallback is rejected. |
| `pipeline.mjs runPipeline records` | step result `nextAction` and `outcome` | typed module/gate/validator result | scheduler continues, halts, or blocks; terminal finalizer emits telemetry/summary | Typed step result authority. |
| `pipeline.mjs` gate/validator registry routes | missing stage owner or validator `request_fix`/`block`/`error` | registry, validator result | fail closed, halt before review, or continue | Registry and validation fail-closed behavior. |
| `pipeline.mjs` generator schedule routes | full pipeline passed, module blocked, arch validation block, single-module mode | pipeline mode/outcome | all generators, project-summary only, none, or none | Prevents post-terminal over-scheduling. |
| `restart-recovery.mjs` stale recovery routes | gateway reachable/running/closed, no session, unconfirmed stop, weak identity | active-agent and gateway state | reset status, emit degraded/restored, block recovery, or skip stop | Restart safety for orphan ACP sessions. |
| `resume-idempotence.mjs` resume route | module already completed vs pending approval vs module not started | persisted status/gate state | skip redispatch, reuse approval, skip/run arch validation | Resume idempotence and core-owned timing. |
| `seq-restart.mjs` telemetry identity route | project/run id present or missing | telemetry context/config identity | publish to stream with Redis seq or reject/disable unknown stream | Prevents local seq fallback and unknown streams. |
| `stops.mjs` Buster terminal route | terminal reason | `config_invalid`, `spawn_failed`, `parse_corrupted`, `timeout`, `git_error`, `rate_limited`, `gate_fail` | deterministic exit/reason/telemetry/Discord | Gate operator consistency. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `pipeline.mjs makeStepResult` | typed step fixture result | exit/reason/status/projection/correlation | exit maps to `nextAction`/`outcome`; projection and correlation are copied into compatibility metadata | Scheduler uses typed fields, not raw exit. |
| `pipeline.mjs seedBlockedModuleLifecycleState` / `seedFailedModuleLifecycleState` | module `status.json` | lifecycle helpers plus overrides | canonical lifecycle transitions first, then correlation/status overrides | Status correlation may be provenance but not authoritative top-level correlation unless typed result supplies it. |
| `restart-recovery.mjs` recovery fixtures | module/gate active-session state and lifecycle events | active-agent records, gateway responses | confirmed stale sessions clear/reset; unconfirmed or weak identities remain active and emit blocked evidence | No unsafe orphan clearing. |
| `resume-idempotence.mjs` repeated resume harness | module status, approval state, telemetry, Discord calls | interrupted first run plus resumed runs | already-completed module and pending approval artifacts are reused | No duplicate PASS/request telemetry or Discord delivery. |
| `seq-restart.mjs` telemetry seq state | Redis seq counter and durable artifacts | Nova/Buster events across materialized runtimes | Redis counter increments globally per project/run; artifacts mirror emitted seq | Monotonic seq across restart. |
| `stops.mjs` Buster gate result projection | gate result and telemetry payload | scenario terminal result | runner maps reason/status/correlation into exit/reason and gate verdict | Correlation preserved for terminal gate stops. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `pipeline.mjs` behavior records | sequential records through harness | none at area level | none | first failing record aborts selected area. |
| `pipeline.mjs` generator/validator schedules | progress execution order and completion finalizer | none in fixtures | validator/gate timeout values supplied but not waited | schedules explicit stage owners or halts. |
| `restart-recovery.mjs` gateway recovery | active module/gate sessions during startup | fake gateway calls, no real sleep | no real deadline in fixtures | confirmed stop/reset, terminal reset, no-session reset, blocked unconfirmed/weak identity. |
| `resume-idempotence.mjs runRepeatedResumeScenario` | repeated `runPipeline(..., { resume: true })` after simulated interruption | no real sleep | approval timeout configured, not waited | first run rejects; repeated resumes reuse state. |
| `seq-restart.mjs` telemetry stream caps | stream/artifact event retention | Redis fake XADD behavior | stream cap from telemetry config/runtime | durable artifacts retain capped replay with Redis-owned seq. |
| `stops.mjs` scenario matrix | `for (const scenario of scenarios)` | none | timeout scenario supplied by fake result, no real wait | each terminal reason emits expected result/telemetry. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `progress.execution_order` | Progress fixture input | `pipeline.mjs`, `resume-idempotence.mjs` through pipeline runner | per-record | Controls module/gate/validator/generator order; malformed entry type guard is covered in `pipeline.mjs`. |
| `progress.validators` / `validator:full_lint` | Progress fixture input | `pipeline.mjs` through scheduler | per-record | Mandatory and scheduled full_lint behavior. |
| `progress.generators` / built-ins | Progress fixture input | `pipeline.mjs` through scheduler | per-record or built-in defaults | Project summary/pipeline review/case study schedule assertions. |
| `_pluginRegistry.stageOwners` | Runtime registry fixture | V02b areas | built-in registry plus stubs | Provides module/gate/validator/generator owners and missing-registry scenarios. |
| `_testOverrides.pipeline` / `_testOverrides.moduleRunner` | Test override object | `pipeline.mjs`, `restart-recovery.mjs`, `resume-idempotence.mjs`, `stops.mjs` | per-record | Simulates runtime stages, Discord, gateway, module results, and failure paths. |
| `OPENCLAW_GATEWAY_URL` | Environment variable | `restart-recovery.mjs` through gateway runtime | temporarily set to fake gateway URL | Restored after records. |
| `resume` | Config flag | `restart-recovery.mjs`, `resume-idempotence.mjs`, `seq-restart.mjs` | per-record | Enables restart/reconcile and resume behavior. |
| `rate_limit.max_pauses_per_module`, `cooldown_hours` | Config object | `pipeline.mjs`, `stops.mjs` | per-record | Controls rate-limit exhaustion mapping. |
| `telemetry.enabled`, `_runId`/`run_id`, `_runStats` | Runtime config | all V02b areas | per-record | Required for fake Redis event assertions and sequence keys. |
| `_disable_discord_webhooks` | Runtime config | `pipeline.mjs`, `restart-recovery.mjs` | true in operator-audit fixtures | Produces JSONL/audit evidence without live webhooks. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| Temp repo roots under `os.tmpdir()` | V02b fixtures | V02b areas/runtime | V02b fixtures/runtime | Isolated behavior execution. |
| `.swarm/modules/<module>/status.json` | status-store/lifecycle fixtures | pipeline/recovery/resume tests and runtime | status-store/runtime/tests | Module lifecycle authority. |
| Gate active-session/status artifacts | paths/gate services | recovery/resume tests/runtime | gate runtime/tests | Gate active session authority for stale recovery and approval reuse. |
| `.swarm/logs/pipeline/discord.jsonl` and run `discord.jsonl` | Discord audit runtime | `pipeline.mjs`, `restart-recovery.mjs` | runtime under test | Operator evidence; not state authority. |
| `pipeline:telemetry:<project>:<runId>` | telemetry service/fake Redis | V02b assertions | runtime under test | Pipeline/gate/module/approval telemetry stream. |
| `pipeline:telemetry:seq:<project>:<runId>` | telemetry service/fake Redis | `seq-restart.mjs` | telemetry service | Redis-owned monotonic sequence counter. |
| `architecture-validator/results.json` and `summary.md` | architecture validator stage | `pipeline.mjs` | architecture validator | Report artifacts stay downstream of control-result authority. |
| `scheduled-validator-completions.json` | scheduler/validator runtime | `pipeline.mjs` | runtime under test | Resume evidence for scheduled validator completion state. |
| Durable telemetry stream artifacts | telemetry stream runtime | `seq-restart.mjs` | telemetry service | Mirror Redis-owned seq for capped replay. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Pipeline step outcome | typed `pipeline_step_result` producer/validator | scheduler/finalizer/tests | None. |
| Pipeline halt telemetry/finalizer | pipeline runner finalizer | Redis stream, Discord halt notice, summary schedule | None. |
| Architecture validator control result | validator stage owner / architecture validator | scheduler/governance context/report artifacts | Malformed `execution_order` user input classification is covered by behavior regression. |
| Generator schedule | pipeline scheduler stage owners | generator stage stubs/tests | None. |
| Restart stale recovery state | pipeline runner recovery/lifecycle services | module/gate status, lifecycle events, Discord/telemetry | None. |
| Approval gate pending state | approval gate runner | resume scheduler, telemetry, Discord | None. |
| Telemetry seq | Redis sequence key | Redis stream and durable artifacts | None. |
| Buster gate terminal result | Buster gate runner | gate verdict telemetry, Discord, pipeline result | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Pipeline step result | `pipeline.mjs makeStepResult` and runtime owners | `schemaVersion:'v1'`, `kind:'pipeline_step_result'`, `stepType`, `stepId`, `nextAction`, `outcome`, `diagnostics.summary/findings/metadata/typed`, `correlation`, `compatibility.exitCode/exitLabel/projection` | pipeline-step result contract/runtime validators | scheduler/finalizer. |
| Pipeline telemetry events | pipeline/telemetry runtime | `pipeline.started`, `error.escalation`, `pipeline.halted`, `summary.started`, `summary.completed`, plus correlation/rate-limit fields | telemetry service | fake Redis/operators/tests. |
| Gate telemetry events | gate runners | `gate.started`, `gate.verdict`, optional `retry.exhausted`, with `gate_id`, `gate_type`, `reason`, `session_key`, `dispatch_id`, `gateway_label` | telemetry service/gate runner | fake Redis/operators/tests. |
| Recovery lifecycle events | lifecycle recovery runtime | `type:'recovery.stale_reset'\|'recovery.stale_blocked'`, `refs.module_id\|gate_id`, `data.session_key/gateway_label/dispatch_id/reason` | lifecycle event writer | recovery tests/operators. |
| Approval telemetry/events | approval gate runner | `gate.started`, `approval.requested`, `approval.resolved`, `gate.verdict` keyed by `gate_id` | gate/telemetry runtime | resume-idempotence assertions. |
| Telemetry Redis seq record | telemetry service | stream event includes numeric `seq`; Redis seq key `pipeline:telemetry:seq:<project>:<runId>` increments per emitted event | telemetry service | `seq-restart.mjs`, durable artifacts. |
| Architecture validator report | architecture validator | `results.json` control/report object and `summary.md`; control result has `nextAction`, diagnostics/outcome | architecture validator | scheduler/governance context/tests. |
| Buster gate terminal result | Buster gate runner | result `exit`, `reason`, `gateway_label`, `session_key`, optional `dispatch_id`, `max_rate_limit_pauses`; verdict reason may summarize issues | Buster gate runner | pipeline/gate tests/operators. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Module/gate/validator/generator stage-owner fixtures | V02b fake registries | none | no real prompt; direct fake owner results | stage-owner `run({ input })` contract | typed worker/validator/generator/pipeline-step results. |
| Approval gate operator behavior | approval gate runner exercised by `resume-idempotence.mjs` | gate state/Discord artifacts via runtime | approval required operator notice | Discord sink stub; approval state machine | pending approval reused; no duplicate request telemetry/Discord. |
| Gateway ACP session tools | fake gateway in `restart-recovery.mjs` | none | no prompt; tool calls only | `session_status`, `sessions_send` request/response bodies | stale session stop/confirmation or visible block. |
| Buster gate terminal scenarios | `stops.mjs` fake run results | none | no prompt; post-start terminal results injected | Buster gate result object | deterministic exit/reason/telemetry. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| V02b area records | Assertion/runtime failure | No wrapper retry | None | Harness record fails selected area | No area redaction. |
| `pipeline.mjs` module/gate halt paths | NEEDS_NOVA/BLOCKED/ERROR/RATE_LIMITED typed step outcomes | No area retry | Runtime retry already reflected in fixture status | terminal pipeline halt; rate-limit avoids escalation drift | Runtime redaction only; area none. |
| `pipeline.mjs` missing gate/validator registry | missing stage owner | No | None | fail closed before fallback execution | Runtime redaction only. |
| `pipeline.mjs` architecture validation block/error | validator block, request_fix, internal error, registry miss | No | None in area | halt before module/review/generator work as applicable | Runtime redaction only. |
| `pipeline.mjs` raw exit-shaped result | invalid scheduler authority | No | None | rejected as error outcome | Runtime redaction only. |
| `restart-recovery.mjs` gateway degraded/restored | gateway status call throws, later succeeds | Yes for observability only | fake gateway first-call throw; no sleep | emits degraded/restored and completes recovery | Runtime redaction only. |
| `restart-recovery.mjs` unconfirmed/weak identity recovery | orphan kill unconfirmed or active-agent identity incomplete | No | no stop retry in fixture | recovery blocked; active session retained | Runtime redaction only. |
| `resume-idempotence.mjs` interrupted approval poll | simulated restart during approval polling | Yes via `--resume` rerun | repeated resume calls; no sleep | no module redispatch or duplicate approval request | Runtime redaction only. |
| `seq-restart.mjs` weak telemetry identity | missing project or run id | No | None | rejects/disables publishing to unknown stream | Runtime redaction only. |
| `stops.mjs` Buster terminal gate failures | config/spawn/parse/timeout/git/rate-limit/gate fail | No after terminal result | timeout/rate-limit supplied by scenario; no wait | deterministic terminal exit and verdict; rate-limit adds exhausted event | Runtime redaction only. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| V02b area records | Assertion/runtime failure | Yes/partial | behavior harness stderr/buffered logs | `[behavior] FAILED: <record>` | `verify.mjs record` | Area relies on harness observability. |
| `pipeline.mjs` module/gate halts | NEEDS_NOVA/BLOCKED/ERROR | Yes | fake Redis and Discord call/jsonl | `error.escalation`, `pipeline.halted`, summary events, halt Discord title | pipeline runner/finalizer | Correlation/provenance assertions included. |
| `pipeline.mjs` rate-limit halts | rate-limit exhausted | Yes | fake Redis and Discord | `pipeline.halted` with rate-limit fields; no `error.escalation` | pipeline runner/finalizer | Verifies no escalation drift. |
| `pipeline.mjs` registry/validator failures | missing registry, validator block/error/request_fix, malformed execution-order entries | Yes | fake Redis and Discord/audit artifacts | `gate.verdict`, `error.escalation`, `pipeline.halted`, arch validator reports | scheduler/validator/finalizer | Malformed progress diagnostics now assert structured findings instead of internal errors. |
| `pipeline.mjs` raw exit-shaped result | invalid scheduler result | Yes | pipeline output/harness | error outcome payload | scheduler contract handling | No separate Redis assertion in that record. |
| `restart-recovery.mjs` gateway degraded/restored | gateway status error | Yes | fake Redis and lifecycle/Discord logs | `observability.degraded`, `observability.restored`, `recovery.stale_reset` | recovery/observability runtime | Correlation asserted. |
| `restart-recovery.mjs` blocked recovery | unconfirmed/weak identity | Yes | lifecycle events and Discord audit | `recovery.stale_blocked`, blocked Discord titles | recovery runtime | Active session retained. |
| `resume-idempotence.mjs` interrupted approval poll | resume after simulated restart | Yes | fake Redis and Discord calls | `module.status_changed`, `approval.requested`, `approval.resolved`, `gate.verdict` | pipeline/approval/telemetry runtime | Duplicate suppression asserted. |
| `seq-restart.mjs` weak identity | missing project/run id | Yes/partial | thrown/disabled context observed by test | no unknown stream; `seqKey:null` for weak Buster contexts | telemetry service | Intentionally prevents telemetry publish. |
| `stops.mjs` terminal Buster gate failures | terminal post-start statuses | Yes | fake Redis and Discord calls | `gate.started`, `gate.verdict`, optional `retry.exhausted`, Gate FAIL/Spawn Failed Discord titles | Buster gate runner | Rate-limit exhausted includes retry event. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js | Runtime binary | Node runtime | V02b areas | ESM behavior execution, built-in fs/os/path/assert | Required by harness. |
| Materialized runtime tree | verification helper | local source copy | V02b areas | Imports runtime modules under packaged `/app/skills/pipeline` paths | Import/materialization failure fails records. |
| Fake Redis library | verification helper | local source | V02b areas | Captures telemetry streams and seq counters | Globals reset per record/scenario. |
| Fake gateway server | verification helper | local HTTP server | `restart-recovery.mjs` | Simulates ACP gateway `session_status`/`sessions_send` | Gateway failures intentionally injected. |
| Filesystem temp dirs | Node built-ins | runtime built-ins | V02b areas | Isolated repo, swarm, status, log, JSONL, artifact fixtures | Cleanup is OS temp lifecycle. |
| Discord sink stubs/audit JSONL | runtime under test plus fixture stubs | local source | `pipeline.mjs`, `restart-recovery.mjs`, `resume-idempotence.mjs`, `stops.mjs` | Operator evidence capture without live webhooks | `_disable_discord_webhooks` used where appropriate. |
| Built-in registry/stage owners | Nova runtime | local source | V02b areas | Module/gate/validator/generator stage dispatch | Missing owner scenarios verify fail-closed behavior. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| V02b area execution | Sequential records per selected area | behavior harness area selection | First failing record aborts that area | harness failure output | None. |
| Pipeline scheduler execution | progress `execution_order` and mode | per-record progress | Halts stop downstream work; generator schedule suppressed or reduced after blockers | telemetry/output/generator call assertions | None. |
| Restart recovery gateway calls | one fake gateway request flow per active session | fake gateway state map | unconfirmed/weak identity blocks instead of clearing state | lifecycle/Discord/Redis evidence | None. |
| Resume idempotence | repeated `--resume` calls | same run id/state artifacts | already-completed module and pending approval are reused | no duplicate events/calls | None. |
| Telemetry stream sequence | Redis counter per project/run | fake Redis counter | missing identity prevents publish; Redis seq remains monotonic across runtime restarts | seq counter and stream events | None. |
| Buster terminal scenario loop | sequential scenario matrix | seven scenarios | each scenario isolated; rate-limit exhausted emits retry event | fake Redis/Discord assertions | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Pipeline module/gate correlation | `session_key`, `dispatch_id`, `gateway_label`, optional `correlation_provenance` | fake module/gate results and status fixtures | pipeline finalizer/telemetry/Discord | no live ACP; fixture values copied/filtered | `pipeline.mjs` halt telemetry and outputs. |
| Restart recovery session status | gateway request `{ tool:'session_status', args:{ sessionKey } }` returning state under `result.details.state` | fake gateway | recovery runtime | first status call can throw to emit degraded/restored | `restart-recovery.mjs` gateway request log/telemetry. |
| Restart recovery stop request | gateway request `{ tool:'sessions_send', args:{ sessionKey, ... } }` closes session in fake map | recovery runtime | fake gateway | no retry/sleep in fixture | request log and lifecycle reset/block assertions. |
| Approval gate resume state | pending approval gate state with Discord/operator request metadata | approval gate runner | resume scheduler | repeated resume does not republish request | `resume-idempotence.mjs` telemetry/Discord counts. |
| Telemetry ACP/session identity | project/run/module/session correlation fields on events | Nova/Buster telemetry services | Redis stream/artifact consumers | Redis flush via fake `flushAsync`; weak identity rejected | `seq-restart.mjs` stream/counter assertions. |
| Buster gate terminal correlation | result status with `session_key`, `gateway_label`, optional `dispatch_id` | fake Buster gate result | Buster gate runner/telemetry/Discord | no live ACP; post-start terminal mapping | `stops.mjs` returned result and gate telemetry. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Pipeline terminal finalizer and typed scheduler authority | `tests/verification/behavior/areas/pipeline.mjs` | High for deterministic halt/telemetry/generator/validator surfaces plus malformed progress entry diagnostics | None. |
| Restart-time stale ACP recovery | `tests/verification/behavior/areas/restart-recovery.mjs` | High for fake gateway stale/terminal/no-session/unconfirmed/weak identity branches | Live gateway behavior covered elsewhere. |
| Resume idempotence | `tests/verification/behavior/areas/resume-idempotence.mjs` | High for repeated resume and pending approval duplicate suppression | None found in scoped files. |
| Telemetry sequence restart safety | `tests/verification/behavior/areas/seq-restart.mjs` | High for fake Redis seq continuity and weak identity rejection | None found in scoped files. |
| Buster gate terminal stops | `tests/verification/behavior/areas/stops.mjs` | High for terminal result mapping and telemetry matrix | None found in scoped files. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- P19-ISSUE-001 is resolved; scoped `pipeline.mjs` coverage now protects malformed `progress.execution_order` entries.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
