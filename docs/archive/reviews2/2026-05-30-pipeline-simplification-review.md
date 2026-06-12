# Pipeline Simplification Review

Date: 2026-05-30

Requested scope:
- `skills/nova/pipeline`
- `skills/buster`
- `skills/common/pipeline`

Seed plan read first: `docs/reviews/2026-05-29-pipeline-simplification-batch-plan.md`.

All requested batches 0-7 were reviewed. No exclusions.

## Executive Summary

The current pipeline is broadly aligned with the stated policies: TypeScript-only runtime surfaces are enforced, typed control/result contracts are the active authority, lifecycle/read-models are the state authority, and Buster no longer accepts old `status_json_path` / `result_status` / `result_artifact_path` completion fallbacks.

The highest-confidence simplification path is not to collapse the state machines. The runner split, registry gate dispatch, lifecycle/read-model projection, and nonblocking telemetry boundaries are doing useful isolation work and should stay. The best cuts are around authority duplication and old transitional envelopes:

1. Remove hidden runtime/config defaults where validation already requires explicit config: ACP agent id fallback to agent type, Buster crash retry fallback to `2`, suite timeout defaults in the Nova Buster payload producer, and old `handleRateLimit(... maxPauses = 5)`.
2. Stop converting raw `{ exit, status, reason }` terminal envelopes into typed step results inside module runners. Make phase handlers return `PipelineStepResult` or a narrow typed retry envelope directly.
3. Delete or phase out compatibility-shaped inference inside typed contract builders. Producers should pass explicit `outcome`, `producerType`, correlation, and failure class instead of relying on contract-layer guessing.
4. Migrate runtime authority from mutable `config._*` fields to `PipelineContext`, then delete the config mirror.
5. Keep Buster/Nova operator notifications nonblocking, but align Buster Discord health with the common observability approach or document why Buster must keep a local health map.
6. Update active docs and maps that still say `.js`, legacy fallback, compatibility authority, or old direct gate wrappers. Contract tests catch runtime JavaScript files, but docs still contain stale `.js` and legacy language.

Recommended implementation order is: defaults and dead wrappers first, then typed producer strictness, then runner terminal envelope simplification, then context authority migration, then docs/test guard tightening. Each step should run fast contracts before full verification.

## Reviewed Scope

Primary code read included:
- Nova entry/config/policy/context/registry: `skills/nova/pipeline.ts`, `skills/nova/pipeline/index.ts`, `skills/nova/pipeline/core/{config,context,policy,registry}.ts`.
- Typed result contracts: `skills/nova/pipeline/services/contracts/{pipeline-step-result,worker-control-result,gate-control-result,validator-control-result}.ts`.
- Nova module/gate runners: `skills/nova/pipeline/runners/module-runner*`, `skills/nova/pipeline/runners/gate-runner.ts`, gate control files, approval helpers, rate-limit services, telemetry and Discord surfaces.
- Common runtime/session authority: `skills/common/pipeline/agents/{lifecycle,session-termination}.ts`.
- Buster runtime/suites/task surfaces: `skills/buster/buster-pipeline.ts`, `skills/buster/pipeline/runners/suite-runner.ts`, `skills/buster/pipeline/services/{task-lifecycle,task-validation,task-completion,pipeline-helpers,rate-limit,telemetry,discord}.ts`, and adjacent task/session helpers.
- Verification/docs: focused contract tests under `tests/verification/contracts`, runtime smoke tests, implementation maps, `docs/pipeline-reference-v10.md`, `docs/architecture-validator-reference.md`, and chart config.

## Architecture And Authority Map

- Public Nova runtime entrypoint is intentionally thin: `skills/nova/pipeline.ts:1-4` re-exports `./pipeline/index.ts`; direct execution only imports CLI at `skills/nova/pipeline.ts:20-22`. Keep.
- Nova public API is bounded in `skills/nova/pipeline/index.ts:1-7`. Keep.
- Startup config is a terminal validation boundary: `loadConfig` requires a project and real git repo at `skills/nova/pipeline/core/config.ts:22-49`, loads platform and progress files at `skills/nova/pipeline/core/config.ts:49-61`, validates required config/progress fields at `skills/nova/pipeline/core/config.ts:94-190`, requires ACP monitor fields at `skills/nova/pipeline/core/config.ts:245-268`, rejects unknown top-level fields at `skills/nova/pipeline/core/config.ts:295-312`, and builds/validates plugin registry at `skills/nova/pipeline/core/config.ts:318-336`.
- Model/thinking policy authority is centralized in `skills/nova/pipeline/core/policy.ts:3-11` and `skills/nova/pipeline/core/policy.ts:56-104`. The platform `fallback_model` is an explicit configured policy fallback, not a silent per-call default. Keep unless product policy changes.
- Runtime context is partially split: `PipelineContext` owns run/runtime fields in `skills/nova/pipeline/core/context.ts:60-117`, but compatibility mirrors still write `_logDir`, `_runLogDir`, `_pluginRegistry`, and `_runtimeOverrides` back to config at `skills/nova/pipeline/core/context.ts:95-128`. This should be a planned authority migration, not a casual deletion.
- Plugin registry is the startup-frozen owner for stage/gate/hook dispatch. `requirePluginRegistry`, `requireStageOwner`, and `requireGateTypeOwner` fail closed at `skills/nova/pipeline/core/registry.ts:151-190`; optional listener lookup returns empty at `skills/nova/pipeline/core/registry.ts:214-227`. Keep the require/resolve split.
- Lifecycle/read-model authority is explicit: default lifecycle read models and loader are in `skills/nova/pipeline/services/status-store-lifecycle/read-models.ts:14-58`; active-session file/tracked state is evidence only per `tests/verification/contracts/check-session-authority-slice-surface.mjs:41-44`.
- Typed contracts are guarded by focused tests: pipeline step result rejects compatibility authority in `tests/verification/contracts/check-pipeline-step-result-surface.mjs:48-74` and missing typed outcome inference in `tests/verification/contracts/check-pipeline-step-result-surface.mjs:288-300`; worker result rejects compatibility projection in `tests/verification/contracts/check-worker-control-result-surface.mjs:65-91`; Buster completion rejects old status/result paths in `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs:214-277`.

## Batch 0: Architecture/Policy Map

### High-confidence simplifications

- `skills/nova/pipeline/core/config.ts:398-400` exports `resolveModel` as a thin `resolvePolicy(...).model` wrapper. If callers no longer require this compatibility API, remove the wrapper and import `resolvePolicy` directly. Blast radius: docs and older callers. Verification: `rg "resolveModel\\(" skills tests docs`.
- `skills/nova/pipeline/core/context.ts:119-128` mirrors runtime context back onto config. Convert callers to read `ctx` first, then remove `syncConfigRuntimeFields`. Blast radius: logging, telemetry, registry, CLI runtime overrides. Verification: runtime smoke, contract suite, and a run-context unit fixture.
- `skills/nova/pipeline/core/config.ts:74-80` still copies `progress.pipeline_review` to config and fills `discord_webhook_url` from `DISCORD_WEBHOOK` if config is empty. Treat as platform-approved config ingress or require explicit config. If tightened, update deployment/chart docs first. Blast radius: operator notification setup.

### Risky phased changes

- Registry optional lookups at `skills/nova/pipeline/core/registry.ts:162-167` and `skills/nova/pipeline/core/registry.ts:214-227` are not authority fallbacks by themselves. Do not delete them until every decision path uses `require*` and listener absence semantics are documented.

### Things that should stay

- Thin entrypoints and bounded public API.
- Startup config validation and unknown-field rejection.
- Platform fallback model as explicit config policy.
- Lifecycle/read-model defaults as empty read-model shape, not legacy status fallback.
- Plugin registry require/resolve split.

## Batch 1: Typed Contracts/Result Authority

### Finding 1: Contract builders still infer too much producer meaning

Refs:
- `skills/nova/pipeline/services/contracts/pipeline-step-result.ts:135-164`
- `skills/nova/pipeline/services/contracts/pipeline-step-result.ts:226-254`
- `skills/nova/pipeline/services/contracts/gate-control-result.ts:35-50`
- `skills/nova/pipeline/services/contracts/validator-control-result.ts:23-54`

Current behavior:
- `buildPipelineStepResultFromControlResult` derives `outcome` from explicit `outcome`, approval special cases, typed worker/gate/validator metadata, gate run status, outcome class, and recommendation.
- Gate status normalization accepts aliases like `PASS`, `GO`, `OK`, `APPROVED`, `NO-GO`, and `NOGO`.
- Validator control result can infer `producerType` from `stageId` and has broad summary fallback logic.

Risk/complexity:
- The contract layer is doing semantic recovery that should belong to producers. This makes it easier to reintroduce compatibility-shaped outputs without noticing.

Proposed change:
- Require every producer-to-step call to pass explicit `outcome`.
- Require validator producers to pass explicit `producerType`.
- Shrink gate status aliases after current gate adapters emit one canonical vocabulary.

Blast radius:
- Gate control builders, module worker results, validator stages, pipeline runner terminal projection.

Verification:
- Existing typed contract tests plus targeted fixtures for each producer kind.
- Extend `check-pipeline-step-result-surface.mjs` to assert no `gateRunStatus`/`recommendation` inference branch remains once producers are migrated.

### Finding 2: Pipeline rate-limit helper contains redundant truth

Refs:
- `skills/nova/pipeline/services/contracts/pipeline-step-result.ts:313-333`

Current behavior:
- `pipelineStepRateLimitDetails` calculates `rate_limit_exhausted` from metadata and also ORs in `stepResult.outcome === RATE_LIMITED`.

Risk/complexity:
- The terminal outcome already owns exhaustion. The extra fields make status appear multi-authoritative.

Proposed change:
- After confirming callers do not need source-specific detail, set `rate_limit_exhausted` directly from `stepResult.outcome === PIPELINE_STEP_OUTCOMES.RATE_LIMITED`; preserve other metadata as diagnostics.

Blast radius:
- Pipeline halt payloads and Discord fields.

Verification:
- `check-rate-limit-slice-surface.mjs`, rate-limit halt behavior fixtures.

### Finding 3: Worker contract strictness should stay

Refs:
- `skills/nova/pipeline/services/contracts/worker-control-result.ts:26-61`
- `skills/nova/pipeline/services/contracts/worker-control-result.ts:71-109`
- `skills/nova/pipeline/services/contracts/worker-control-result.ts:111-164`

Current behavior:
- Worker results are normalized through explicit typed fields and invalid results produce source-redacted diagnostics.

Why stay:
- This is the right anti-corruption boundary. Do not weaken it while removing fallback logic elsewhere.

### Finding 4: Validator mapping is still a compatibility bridge

Refs:
- `skills/nova/pipeline/services/contracts/validator-control-result.ts:111-131`
- `skills/nova/pipeline/services/contracts/validator-control-result.ts:173-220`

Current behavior:
- Module validator results with `passed` / `blocked` are mapped into typed validator controls.

Risk/complexity:
- This bridge is useful during migration but keeps old validator result shape alive.

Proposed change:
- Make validator implementations return typed control results directly, then delete `mapModuleValidatorResultToControl`.

Blast radius:
- Architecture/preflight/delivery validators and scheduling tests.

Verification:
- `check-validator-control-result-surface.mjs` plus behavior areas for validators and governance.

## Batch 2: Module Runner Stack

### Finding 1: Module attempts still convert raw terminal envelopes into typed step results

Refs:
- `skills/nova/pipeline/runners/module-runner/attempt.ts:120-183`
- `skills/nova/pipeline/runners/module-runner/terminal-results.ts:14-78`

Current behavior:
- Phase handlers return retry envelopes or raw `{ exit, status, reason }`; `buildTypedModuleAttemptResult` maps exit/status into `PipelineStepResult`.

Risk/complexity:
- This preserves an older result protocol and duplicates terminal classification in the attempt wrapper.

Proposed change:
- Make phase handlers return `PipelineStepResult` for terminal outcomes and a narrow typed retry result for retry outcomes. Delete raw terminal builders.

Blast radius:
- Forge phase, Buster phase, pre-Buster handoff, forge-only modules, pipeline runner terminal halt.

Verification:
- `check-module-runner-slice-surface.mjs`, `check-pipeline-step-result-surface.mjs`, module failure behavior areas, full verification.

### Finding 2: Hidden ACP agent-id fallback should be removed

Refs:
- `skills/nova/pipeline/runners/module-runner-forge.ts:103-111`
- `skills/nova/pipeline/agents/orchestration.ts:136-169`

Current behavior:
- Forge spawn resolves harness from model, then `config.agents.forge.acp_agent_id`, then literal `'forge'` in the runner; generic ACP spawn resolves model harness, `agentConfig.acp_agent_id`, then `agentType`.

Risk/complexity:
- This violates the no hidden default model/config/session behavior policy when config validation already requires explicit ACP agent ids for subagent-dispatch agents.

Proposed change:
- Remove final literal fallbacks and fail if resolved agent id is missing.

Blast radius:
- Local runs with incomplete config; verification launch helpers.

Verification:
- `check-nova-startup-smoke.mjs`, runtime launch checks, config validation negative fixture.

### Finding 3: Buster crash retry count has a hidden literal default

Refs:
- `skills/nova/pipeline/runners/module-runner/buster-phase.ts:63`

Current behavior:
- `maxBusterCrashRetries` falls back through module, config, then literal `2`.

Risk/complexity:
- A retry budget affects task side effects and operator timing. It should be explicit platform config or a named validated policy.

Proposed change:
- Add required config validation for `max_buster_crash_retries` or move the literal into a named platform policy field, then remove `?? 2`.

Blast radius:
- Buster crash recovery behavior.

Verification:
- Buster crash retry behavior fixture, `check-buster-pipeline-slice-surface.mjs`, module-runner slice contract.

### Finding 4: Forge/Buster worker phases reconstruct poll-result-like objects from typed worker metadata

Refs:
- `skills/nova/pipeline/runners/module-runner-forge.ts:276-282`
- `skills/nova/pipeline/runners/module-runner/buster-phase.ts:89-99`
- `skills/nova/pipeline/agents/module-worker-control-results.ts:117-136`

Current behavior:
- Typed worker results carry `poll_result`, `final_status`, Redis entries, and session identity; phase code reconstructs old poll-result shapes to route outcomes.

Risk/complexity:
- This undermines typed contract authority by routing on reconstructed compatibility objects.

Proposed change:
- Route directly on typed `nextAction`, `outcomeClass`, and typed correlation/failure metadata. Keep raw poll/Redis data only as diagnostics.

Blast radius:
- Forge finalization, Buster completion/failure adjudication, rate-limit finalizer.

Verification:
- Worker control result contract, Buster completion controller tests, module runner behavior fixtures.

### Finding 5: Shared module worker input builders duplicate large state snapshots

Refs:
- `skills/nova/pipeline/runners/module-runner-shared.ts:221-289`
- `skills/nova/pipeline/runners/module-runner-shared.ts:292-354`
- `skills/nova/pipeline/runners/module-runner-shared.ts:423-511`

Current behavior:
- Forge, Buster, and validator input builders duplicate refs, execution context, workspace, deadline, artifacts, and state snapshot fields.

Risk/complexity:
- Duplication makes authority migrations error-prone.

Proposed change:
- Introduce one `buildModuleWorkerRunInputBase` that takes stage/worker-specific extensions.

Blast radius:
- Plugin input contracts and built-in worker adapters.

Verification:
- Module worker plugin input snapshots, registry/builtin contract checks.

### Finding 6: Some defaults in module runner should stay for now

Refs:
- `skills/nova/pipeline/runners/module-runner/attempt.ts:108-117`
- `charts/kubeclaw/files/config/swarm.config.json:12-20`

Current behavior:
- Module timeout and max-fails default to validated platform config when absent on a module.

Why stay:
- These are explicit platform policy defaults, not hidden local literals. Removing them would require a progress schema change and broad project config updates.

## Batch 3: Gate/Review/Approval Runners

### Finding 1: Gate runner error projection has repeated failure construction

Refs:
- `skills/nova/pipeline/runners/gate-runner.ts:77-135`
- `skills/nova/pipeline/runners/gate-runner.ts:403-446`

Current behavior:
- Dispatch and execution errors build similar typed runtime-error controls and step results.

Risk/complexity:
- Duplication increases drift in operator metadata and failure class assignment.

Proposed change:
- Factor a single `buildGateRuntimeErrorControl` helper and use it for dispatch/evaluation/remediation errors.

Blast radius:
- Gate error telemetry and terminal step result fields.

Verification:
- `check-gate-control-result-surface.mjs`, gate behavior fixtures.

### Finding 2: Gate state snapshots mix authority with diagnostics

Refs:
- `skills/nova/pipeline/runners/gate-runner.ts:138-190`
- `skills/nova/pipeline/runners/gate-runner.ts:193-235`

Current behavior:
- Gate run input includes output file refs, gate-status JSON refs, lifecycle gate state, and completion evidence.

Risk/complexity:
- Snapshot consumers may treat diagnostic `gate-status.json` as authority unless the field names stay clear.

Proposed change:
- Rename or nest diagnostic-only gate-status fields under an explicit `diagnostics` object after checking plugin inputs. Keep lifecycle/read-model and typed output fields authoritative.

Blast radius:
- Gate plugin adapters and operator artifacts.

Verification:
- Gate active-session and artifact authority contracts.

### Finding 3: Waitable gate engine mutates errors to signal stage start

Refs:
- `skills/nova/pipeline/runners/waitable-gate-engine.ts:47-89`

Current behavior:
- Scheduled waitable gates set `error.gateStageStarted = true`.

Risk/complexity:
- Mutable error markers are fragile and hard to type.

Proposed change:
- Return a typed waitable gate execution object with `{ started, controlResult, error }` instead of annotating thrown errors.

Blast radius:
- Approval gate runner and generic gate runner error handling.

Verification:
- Approval wait/resolution behavior fixtures.

### Finding 4: Generic gate fix cycle hides missing adapter copy with message fallbacks

Refs:
- `skills/nova/pipeline/runners/gate-forge-fix-cycle.ts:13-17`
- `skills/nova/pipeline/runners/gate-forge-fix-cycle.ts:97-163`
- `skills/nova/pipeline/runners/gate-forge-fix-cycle.ts:188-260`

Current behavior:
- `callMaybe` accepts strings or functions and defaults missing messages/evidence.

Risk/complexity:
- Missing adapter-specific operator copy becomes silently generic.

Proposed change:
- Require a typed message builder object for each remediable gate adapter. Fail startup/adapter validation if required message builders are missing.

Blast radius:
- Review and Buster gate fix-cycle adapters.

Verification:
- Gate fix scaffold contract and remediation handoff tests.

### Finding 5: Review/Buster gate control still uses correlation fallbacks

Refs:
- `skills/nova/pipeline/runners/review-gate-control.ts:72-115`
- `skills/nova/pipeline/runners/review-gate-control.ts:125-172`
- `skills/nova/pipeline/runners/buster-gate-control.ts:130-169`
- `skills/nova/pipeline/runners/buster-gate-control.ts:187-236`
- `skills/nova/pipeline/runners/buster-gate-control.ts:240-286`

Current behavior:
- Attempt/dispatch/session/gateway and issue extraction are recovered from result objects, rate-limit status, gate status, `_verdict`, and fallbacks.

Risk/complexity:
- Gate controls can look typed while still depending on old result shapes.

Proposed change:
- Require explicit `GateControlCorrelation` and typed issue payloads from the gate completion/evaluation layer. Remove `_verdict`, generic `result.status`, and rate-limit-derived attempt fallbacks from controls.

Blast radius:
- Review gate task, Buster completion adapter, gate terminal presentation.

Verification:
- Review/Buster gate contract fixtures and behavior gate matrix.

### Things that should stay

- Generic `runGate` registry dispatch and adapter validation at `skills/nova/pipeline/runners/gate-runner.ts:247-304`.
- Approval gate timeout policy validation at `skills/nova/pipeline/runners/approval-gate-shared.ts:19-42`.
- Gate active-session lifecycle/read-model authority at `skills/nova/pipeline/services/gate-active-session.ts:65-171`.

## Batch 4: Session/Runtime/Rate-limit Authority

### Finding 1: Session termination policy has hard-coded defaults and invalid-option normalization

Refs:
- `skills/common/pipeline/agents/session-termination.ts:13-55`

Current behavior:
- Grace/poll/attempt/cleanup timeouts default locally and invalid options normalize back to defaults.

Risk/complexity:
- Teardown budgets affect external sessions and should be explicit runtime policy for production paths.

Proposed change:
- Keep defaults for test helpers only, but require production callers to pass a validated termination policy. Invalid numeric options should fail closed.

Blast radius:
- Nova kill/shutdown/reviewer teardown and Buster monitor termination.

Verification:
- Session authority contract, shutdown integration behavior, runtime launch cleanup fixtures.

### Finding 2: Lifecycle file cleanup is best-effort and diagnostic-only

Refs:
- `skills/common/pipeline/agents/lifecycle.ts:59-89`
- `skills/common/pipeline/agents/lifecycle.ts:140-174`
- `skills/buster/pipeline/services/orphan-recovery.ts:27-55`

Current behavior:
- Persisted active-session files are read as diagnostics; cleanup failures do not become lifecycle authority; Buster startup blocks if persisted evidence exists without lifecycle authority.

Risk/complexity:
- The code is intentionally cautious. Do not simplify by hydrating or killing from the file.

Proposed change:
- Keep authority semantics. Optionally replace stderr-only cleanup failures with structured noncritical diagnostics.

Blast radius:
- Restart recovery and orphan session cleanup.

Verification:
- `check-session-authority-slice-surface.mjs`, restart recovery behavior.

### Finding 3: Orchestration hides runtime/session defaults

Refs:
- `skills/nova/pipeline/agents/orchestration.ts:150-169`
- `skills/nova/pipeline/agents/orchestration.ts:308-321`
- `skills/nova/pipeline/agents/orchestration.ts:333-359`
- `skills/nova/pipeline/agents/orchestration.ts:411-441`

Current behavior:
- ACP spawn can fall back to agent type for agent id.
- Buster suite timeout is provided by `BUSTER_SUITE_RUNNER_DEFAULT_POLICY` if config is missing.
- Buster payload generates attempt/dispatch defaults.
- Unknown Redis kill/steer configs become no-ops.

Risk/complexity:
- These are hidden runtime defaults at a central dispatch boundary.

Proposed change:
- Require validated ACP agent id, suite timeout, attempt, and dispatch id before dispatch.
- Convert unknown kill/steer agent config to explicit typed no-op or error with operator diagnostic.

Blast radius:
- Redis dispatch, Buster payload producers, tests that construct minimal payloads.

Verification:
- Buster slice contract, Nova startup smoke, Redis dispatch tests.

### Finding 4: Nova rate-limit helpers use hard-coded and wrapper defaults

Refs:
- `skills/nova/pipeline/services/rate-limit.ts:80-208`
- `skills/nova/pipeline/services/rate-limit.ts:344-390`
- `skills/nova/pipeline/services/rate-limit.ts:450-525`
- `skills/nova/pipeline/services/rate-limit-builders.ts:137-177`
- `skills/nova/pipeline/services/rate-limit-exit.ts:27-80`

Current behavior:
- Cooldown buffer is hard-coded to 5000 ms.
- Resume phase falls back to `TESTING` when phase is null.
- Old `handleRateLimit` defaults max pauses to 5.
- Identity is resolved through multiple fallback fields.

Risk/complexity:
- Rate-limit recovery is a high-impact control path and should not infer phase, budgets, or identity.

Proposed change:
- Add required `cooldown_buffer_ms` config or named policy.
- Require phase for recovery resume.
- Delete old `handleRateLimit` wrapper if unused; otherwise make `maxPauses` required.
- Introduce a single required `RateLimitIdentity` object and stop passing `*Fallback` fields.

Blast radius:
- Module Forge/Buster, review fix, Buster gate, case study, summary polling.

Verification:
- `check-rate-limit-slice-surface.mjs`, behavior areas for polling/fix-cycles/runtime-monitor.

### Finding 5: Buster rate-limit service is stricter, but Discord emission is fire-and-forget

Refs:
- `skills/buster/pipeline/services/rate-limit.ts:88-106`
- `skills/buster/pipeline/services/rate-limit.ts:192-256`
- `skills/buster/pipeline/services/rate-limit.ts:258-363`

Current behavior:
- Buster requires numeric policy, returns typed liveness states, and only kills after confirmed closed liveness. It sends Discord notification calls inside the recovery path without awaiting the webhook side effect.

Risk/complexity:
- Nonblocking notification is acceptable, but unawaited side effects should have explicit catch/reporting at the call boundary.

Proposed change:
- Ensure every Buster rate-limit Discord call is routed through the Buster Discord sender with internal catch/reporting or is explicitly awaited when the caller needs delivery diagnostics.

Blast radius:
- Operator notification timing only.

Verification:
- Buster operator surface and observability catch reporting contracts.

## Batch 5: Telemetry/Discord/Operator Surfaces

### Finding 1: Nova telemetry nonblocking behavior should stay

Refs:
- `skills/nova/pipeline/services/telemetry.ts:1-8`
- `skills/nova/pipeline/services/telemetry/dispatch.ts:13-121`
- `skills/nova/pipeline/services/telemetry-sink-dispatch.ts:50-160`
- `tests/verification/contracts/check-operator-alert-surface.mjs:47-64`

Current behavior:
- Durable operator alerts are local-first. Telemetry sink failures and invalid payloads are classified degraded evidence, not orchestration failures.

Why stay:
- This preserves reliability: observability failure must not mutate lifecycle/result authority.

### Finding 2: Shared Discord field contract is in a misleading rate-limit-named file

Refs:
- `skills/common/pipeline/services/rate-limit-contract.ts:51-238`
- `skills/nova/pipeline/services/discord-fields.ts:1-9`
- `docs/pipeline/implementation-map/authority-map.md:50`

Current behavior:
- The common `rate-limit-contract.ts` owns Discord identity surfaces and rate-limit payloads; Nova has a `discord-fields.ts` re-export shim.

Risk/complexity:
- The file name hides broader Discord field authority.

Proposed change:
- Move shared Discord identity fields to `services/discord-fields-contract.ts`, keep a temporary re-export from `rate-limit-contract.ts`, then update imports and delete `discord-fields.ts` shim.

Blast radius:
- Many operator/Discord callers.

Verification:
- Operator alert, rate-limit slice, and common helper import contracts.

### Finding 3: Buster Discord duplicates observability health logic locally

Refs:
- `skills/buster/pipeline/services/discord.ts:111-130`
- `skills/buster/pipeline/services/discord.ts:204-244`
- `skills/buster/pipeline/services/discord.ts:258-345`
- `skills/buster/pipeline/services/discord.ts:387-468`

Current behavior:
- Buster keeps local webhook/audit health maps and emits degraded/restored telemetry through Buster telemetry context. It also normalizes many camel/snake aliases in `DiscordContext` at `skills/buster/pipeline/services/discord.ts:29-67` and `skills/buster/pipeline/services/discord.ts:162-182`.

Risk/complexity:
- Nova centralizes observability health; Buster has a parallel circuit breaker. The alias-heavy input surface keeps compatibility alive.

Proposed change:
- Decide if Buster must remain process-local due sandbox isolation. If not, port Buster Discord degraded/restored state to common observability. Then shrink `DiscordContext` to one canonical field style at internal call sites.

Blast radius:
- Buster operator messages, Discord audit artifacts, telemetry health events.

Verification:
- `check-buster-operator-surface.mjs`, observability catch reporting, Buster runtime smoke.

### Finding 4: Buster telemetry artifact fallback is deliberate, but naming should stay explicit

Refs:
- `skills/buster/pipeline/services/telemetry.ts:145-166`
- `skills/buster/pipeline/services/telemetry.ts:206-250`
- `skills/buster/pipeline/services/telemetry.ts:398-454`
- `skills/buster/pipeline/services/telemetry.ts:463-497`

Current behavior:
- Missing identity or Redis failure does not block Buster. Events are mirrored to fallback artifacts and degraded/restored records.

Why stay:
- Telemetry is non-authoritative. The fallback is observable and typed, not a silent result fallback.

Small simplification:
- Remove alias support for `runId` / `run_id`, `gateId` / `gate_id`, etc. after all callers pass the canonical telemetry options shape.

Blast radius:
- Buster telemetry callers and tests.

Verification:
- Telemetry contract and Buster operator surface contracts.

## Batch 6: Buster Runtime/Suite Surface

### Finding 1: Buster main entrypoint is already simplified

Refs:
- `skills/buster/buster-pipeline.ts:14-17`
- `skills/buster/buster-pipeline.ts:72-93`
- `skills/buster/buster-pipeline.ts:95-148`
- `skills/buster/buster-pipeline.ts:153-221`
- `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs:83-90`

Current behavior:
- Root runtime exposes only status/startup helpers, initializes gateway/recovery/cleanup/base images/consumer group, runs task loop, and has structured shutdown.

Things that should stay:
- No helper barrel.
- Structured shutdown and Redis disconnect.
- Startup block when persisted active session file exists without lifecycle authority.

Simplification:
- `BUSTER_RUNTIME_LOOP_POLICY.errorBackoffMs` at `skills/buster/buster-pipeline.ts:78-80` is named but still local. Move to validated runtime config only if operators need tuning; otherwise keep as a named code policy.

### Finding 2: Buster task lifecycle still has hidden session defaults

Refs:
- `skills/buster/pipeline/services/task-lifecycle.ts:63-80`
- `skills/buster/pipeline/services/task-lifecycle.ts:112-123`
- `skills/buster/pipeline/services/task-lifecycle/session.ts:129-145`

Current behavior:
- Task validation requires identity, but task lifecycle still defaults `suites` to `[]`, `timeout_seconds` to `1800`, `log_dir` to `.swarm/logs/buster/...`, stage id from task type, worker type from task type, session `cwd` to repo root, and label to dispatch id.

Risk/complexity:
- Some are useful derived values; `timeout_seconds`, session `cwd`, and session label are runtime behavior and should be explicit in the payload or a validated payload producer policy.

Proposed change:
- Require `timeout_seconds` and session label/cwd in `validateBusterTaskPayload`, or explicitly mark them as producer-owned defaults in the schema. Keep log-dir derivation if it is documented as the Buster artifact layout.

Blast radius:
- Nova `buildBusterPayload`, direct Redis task CLI, Buster task validation fixtures.

Verification:
- `check-buster-pipeline-slice-surface.mjs`, Buster task malformed/dead-letter tests.

### Finding 3: Buster task validation is a strong boundary

Refs:
- `skills/buster/pipeline/services/task-validation.ts:83-145`
- `skills/buster/pipeline/services/task-validation.ts:41-80`
- `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs:328-340`

Current behavior:
- Payload must be object, task type known, required identity present, capabilities known, and paths repo-relative/non-traversing.

Why stay:
- This is exactly the right place to reject weak task inputs. Add new required fields here rather than deeper in task flow.

### Finding 4: Buster suite runner mostly removed old defaults; keep strict timeout

Refs:
- `skills/buster/pipeline/runners/suite-runner.ts:157-185`
- `skills/buster/pipeline/runners/suite-runner.ts:187-215`
- `skills/buster/pipeline/runners/suite-runner.ts:221-238`
- `skills/buster/pipeline/runners/suite-runner.ts:390-497`
- `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs:92-110`
- `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs:272-284`

Current behavior:
- Suites are statically registered, unknown suites fail validation, missing dependency declaration fails, and `test_config.suite_timeout_ms` is required.

Things that should stay:
- Static registry and explicit timeout rejection.
- Capability enforcement before suite selection.
- Result write failures are degraded evidence, not verdict authority.

Small simplifications:
- `validateSuiteNames(suites = [])` at `skills/buster/pipeline/runners/suite-runner.ts:187` accepts missing suites as empty. If a task with no suites should be invalid, require non-empty suite list in Buster task validation.
- `RESULTS_DIR = '/sandbox/results'` at `skills/buster/pipeline/runners/suite-runner.ts:38` is a hard-coded runtime mount. Keep if it is part of sandbox contract; otherwise inject via validated payload/platform config.

### Finding 5: Buster output file is the right completion authority, but completion fallback naming should be tightened

Refs:
- `skills/buster/pipeline/services/pipeline-helpers.ts:117-149`
- `skills/buster/pipeline/services/pipeline-helpers.ts:151-204`
- `skills/buster/pipeline/services/task-lifecycle/completion-signal.ts:30-85`
- `skills/buster/pipeline/services/task-completion.ts:41-80`
- `skills/buster/pipeline/services/task-completion.ts:143-213`

Current behavior:
- `resolveBusterAgentResult` reads only `output_file` for terminal PASS/FAIL after session terminal. `ensureBusterOutputFile` writes a fail artifact if needed before Redis completion. `ensureTaskTerminalBeforeAck` can emit a "fallback_completion" before ACK if process result did not emit completion.

Risk/complexity:
- The fallback completion is intentional ACK safety, but the name is dangerously close to silent result fallback.

Proposed change:
- Rename `fallback_completion` mode to `synthesized_failure_completion_before_ack` or similar, and ensure it can only emit FAIL unless an already-authored output file has validated PASS.

Blast radius:
- Task queue logging, tests that assert mode names.

Verification:
- Redis completion service surface and Buster completion controller contracts.

### Finding 6: Buster task outcome defaults should be narrowed

Refs:
- `skills/buster/pipeline/services/task-lifecycle/session.ts:337-368`
- `skills/buster/pipeline/services/task-completion.ts:41-74`
- `skills/buster/pipeline/services/task-completion.ts:175-190`

Current behavior:
- Outcome defaults to `FAIL`, reason to `unknown`, and summary to reason in several terminal emitters.

Risk/complexity:
- Defaulting to FAIL is safer than PASS, but it hides missing reason quality.

Proposed change:
- Require explicit outcome/reason at completion-emission boundaries; keep emergency process-error fallback only in `ensureTaskTerminalBeforeAck` and name it as synthesized failure evidence.

Blast radius:
- Task lifecycle publishing and malformed task handling.

Verification:
- Buster task completion tests, malformed task dead-letter tests.

## Batch 7: Docs/Verification/Dead Policy References

### Finding 1: Active docs still refer to `.js` runtime paths

Refs:
- `docs/pipeline-reference-v10.md:139-180`
- `docs/pipeline-reference-v10.md:231-237`
- `docs/pipeline-reference-v10.md:365-399`
- `docs/pipeline-reference-v10.md:1153-1306`
- `docs/pipeline-reference-v10.md:1379-1402`
- `docs/pipeline/implementation-map/authority-map.md:28-35`
- `docs/pipeline/implementation-map/logic-and-algorithms-map.md:48-57`

Current behavior:
- Runtime source is TypeScript, but active docs and maps still say `core/config.js`, `gate-runner.js`, `pipeline-runner.js`, etc.

Risk/complexity:
- This conflicts with no-JS reintroduction policy and makes docs unreliable for future simplification work.

Proposed change:
- Update active maps/reference docs to `.ts` paths or path-without-extension language. Add a doc guard that catches active docs referencing `skills/nova|buster|common/...*.js`.

Blast radius:
- Docs only, but many references.

Verification:
- Extend `check-phase10-final-reference-surface.mjs` beyond `/app/skills` path references, or add a dedicated docs path-extension guard.

### Finding 2: Active docs still describe legacy fallbacks and obsolete surfaces

Refs:
- `docs/pipeline-reference-v10.md:395`
- `docs/pipeline-reference-v10.md:782`
- `docs/pipeline-reference-v10.md:835`
- `docs/pipeline-reference-v10.md:1823`
- `docs/pipeline-reference-v10.md:1922-1971`
- `docs/architecture-validator-reference.md:191-205`

Current behavior:
- Docs mention `RUN_ID` / `_runStats` legacy fallback, `status_json_path`, `telemetry.stream_key` legacy enable flag, and model fallback policy.

Risk/complexity:
- Some items are genuinely obsolete (`status_json_path`), some are current but should be framed as explicit platform policy (`fallback_model`), and some are transitional (`config._*` run-state bridge).

Proposed change:
- Remove obsolete `status_json_path` and old direct gate wrapper documentation.
- Reword `fallback_model` as explicit platform policy, not ad hoc default fallback.
- Track `config._*` runtime bridge as a known migration item with deletion criteria.

Blast radius:
- Docs and implementation-map sync tests.

Verification:
- Implementation map sync contract and a new stale-policy-doc guard.

### Finding 3: Complexity budget currently scans `.js` files only

Refs:
- `tests/verification/contracts/check-pipeline-complexity-budgets.mjs:18-31`
- `tests/verification/contracts/check-pipeline-complexity-budgets.mjs:44-62`

Current behavior:
- Complexity budget roots are correct, but `listJsFiles` only checks files ending in `.js`.

Risk/complexity:
- After TS migration, this guard no longer measures the actual pipeline code.

Proposed change:
- Change this guard to scan `.ts` runtime files and set budgets by class of file. Keep exceptions for generated declarations/shims if needed.

Blast radius:
- Test thresholds; likely many current files exceed 700 lines.

Verification:
- Run the contract in report mode first to set realistic limits, then enforce.

### Finding 4: Verification wrappers are centralized and should stay

Refs:
- `tests/verification/contracts/check-verification-wrapper-surface.mjs:25-69`
- `tests/verification/lib/run-contract-suite.sh:11-61`

Current behavior:
- Fast/full wrappers delegate to the shared deterministic contract list; required guards include no-JS, typed contracts, rate-limit, operator alerts, session authority, implementation-map sync.

Why stay:
- This is a useful policy wall. Add guards to it rather than scattering new verification lists.

### Finding 5: No-JS runtime policy is guarded, but docs are under-guarded

Refs:
- `tests/verification/contracts/check-phase9-unpaired-js-surface.mjs:29-47`
- `tests/verification/contracts/check-phase10-final-reference-surface.mjs:32-77`

Current behavior:
- Runtime `skills/*` contains zero `.js` files; active docs/source files cannot reference certain `/app/skills/...*.js` paths.

Gap:
- Active docs can still contain many `.js` references that are not matched by the current forbidden-reference pattern.

Proposed change:
- Add a docs-focused assertion for `skills/nova/pipeline`, `skills/buster/pipeline`, and `skills/common/pipeline` `.js` path mentions outside archives.

## Recommended Implementation Sequence

1. Low-risk deletion/default pass:
   - Remove unused `resolveModel` wrapper if no callers remain.
   - Delete or strictify old Nova `handleRateLimit` wrapper.
   - Remove ACP agent-id literal fallbacks.
   - Add required config for Buster crash retry and cooldown buffer before removing literals.

2. Buster payload/session strictness:
   - Require `timeout_seconds`, session label/cwd policy, and non-empty suite list where intended.
   - Rename task completion `fallback_completion` mode and constrain it to synthesized failure evidence.

3. Typed contract producer strictness:
   - Update producers to pass explicit `outcome`, `producerType`, correlation, and failure class.
   - Canonicalize gate adapter `gateRunStatus` output to `PASS`, `FAIL`, `WAIT`, or `TIMED_OUT`; fail producers that emit aliases.
   - Remove contract-layer outcome/status/recommendation inference after tests prove all producers are explicit.

4. Module runner terminal envelope migration:
   - Make Forge/Buster/pre-Buster phases return typed step results.
   - Delete raw `{ exit, status }` terminal builders and projection code.
   - Collapse duplicated worker input builders into a shared base.

5. Gate simplification:
   - Factor shared gate runtime-error builder.
   - Make gate snapshots distinguish authoritative state from diagnostic gate-status evidence.
   - Replace mutable waitable-gate error markers with typed execution results.

6. Runtime context authority migration:
   - Convert callers to read `PipelineContext` directly.
   - Remove `syncConfigRuntimeFields` and `_logDir`/`_runLogDir`/`_pluginRegistry` config mirrors.

7. Operator surface cleanup:
   - Move Buster Discord degraded/restored state onto common observability authority.
   - Move shared Discord field contract out of rate-limit-named file.
   - Remove Buster Discord alias-heavy context inputs after callers are canonical.

8. Docs and verification hardening:
   - Update active `.js` docs references.
   - Extend no-JS docs guard so active `skills/*` runtime path references cannot point at `.js` files outside archives.
   - Convert complexity budget from `.js` to `.ts`.

## Verification Matrix

Run after each narrow implementation batch:
- `tests/verification/lib/run-contract-suite.sh --source-root <repo>`
- `tests/verification/runtime/check-nova-startup-smoke.mjs`
- `tests/verification/runtime/check-buster-startup-smoke.mjs`

Run after typed contract changes:
- `tests/verification/contracts/check-pipeline-step-result-surface.mjs`
- `tests/verification/contracts/check-worker-control-result-surface.mjs`
- `tests/verification/contracts/check-gate-control-result-surface.mjs`
- `tests/verification/contracts/check-validator-control-result-surface.mjs`
- `tests/verification/contracts/check-module-runner-slice-surface.mjs`
- Add/extend a gate adapter assertion that every emitter uses only `PASS`, `FAIL`, `WAIT`, or `TIMED_OUT` for `gateRunStatus`.

Run after rate-limit/session/runtime changes:
- `tests/verification/contracts/check-rate-limit-slice-surface.mjs`
- `tests/verification/contracts/check-session-authority-slice-surface.mjs`
- `tests/verification/contracts/check-time-budget-surface.mjs`
- behavior areas: polling, runtime-monitor, shutdown-integration, restart-recovery.

Run after Buster payload/suite changes:
- `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs`
- `tests/verification/contracts/check-buster-completion-controller-surface.mjs`
- `tests/verification/contracts/check-redis-completion-service-surface.mjs`
- `tests/verification/contracts/check-buster-repo-scoped-paths.mjs`
- Add/extend Buster task validation coverage for empty suite lists as invalid input.
- Buster startup smoke.

Run after operator/telemetry changes:
- `tests/verification/contracts/check-operator-alert-surface.mjs`
- `tests/verification/contracts/check-observability-catch-reporting.mjs`
- `tests/verification/contracts/check-telemetry-contract.mjs`
- `tests/verification/contracts/check-buster-operator-surface.mjs`

Run after docs/verification changes:
- `tests/verification/contracts/check-phase9-unpaired-js-surface.mjs`
- `tests/verification/contracts/check-phase10-final-reference-surface.mjs`
- `tests/verification/contracts/check-implementation-map-sync-surface.mjs`
- `tests/verification/contracts/check-verification-wrapper-surface.mjs`

Final gate before merge:
- `tests/verification/run-full-verification.sh`

## Resolved Policy Decisions

1. `fallback_model` remains a platform-wide explicit policy default. The implementation and docs should describe it as policy authority, not as an ad hoc silent fallback.
2. `default_timeout_minutes` and `default_max_fails` remain platform defaults for modules. Individual module budgets are still valid overrides, but every module does not need to duplicate the defaults.
3. Buster Discord does not need a separate degraded/restored health state machine. It can share the common observability state because common pipeline code is already shared.
4. Buster tasks with an empty suite list are invalid. Empty pre-test coverage should fail validation instead of spending tokens on work that cannot prove the code passes pretests.
5. Gate adapters should emit one canonical `gateRunStatus` vocabulary: `PASS`, `FAIL`, `WAIT`, or `TIMED_OUT`. No emitter should produce aliases such as `GO`, `NO-GO`, `OK`, `APPROVED`, `REJECTED`, `CANCELLED`, `PENDING`, or `PENDING_APPROVAL`; domain-specific details belong in typed metadata.
6. Delete `config._*` runtime mirrors only after runtime callers read from `PipelineContext` or explicit parameters, verification fails on new mirror usage, and logs, telemetry, plugin registry, run IDs, runtime overrides, and summaries pass without the bridge.
7. Docs guards should forbid active `.js` source path references under `skills/*` outside archives. Generic JavaScript concepts, browser JS error text, and archived/historical material can remain where they are not pointing at active runtime skill paths.
