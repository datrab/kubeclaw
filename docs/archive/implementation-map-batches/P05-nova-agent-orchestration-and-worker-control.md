# Batch P05 — Nova agent orchestration and worker control

Status: completed
Date started: 2026-05-08
Date completed: 2026-05-08
Reviewer: Nova

## Scope

```text
skills/nova/pipeline/agents/module-worker-control-results.js
skills/nova/pipeline/agents/module-workers.js
skills/nova/pipeline/agents/orchestration-lifecycle-events.js
skills/nova/pipeline/agents/orchestration.js
skills/nova/pipeline/agents/reviewer-lifecycle.js
```

Scope expansion verified live: 5 files, under the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/nova/pipeline/agents/module-worker-control-results.js
kubeclaw-main/skills/nova/pipeline/agents/module-workers.js
kubeclaw-main/skills/nova/pipeline/agents/orchestration-lifecycle-events.js
kubeclaw-main/skills/nova/pipeline/agents/orchestration.js
kubeclaw-main/skills/nova/pipeline/agents/reviewer-lifecycle.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/contracts/check-worker-control-result-surface.mjs
kubeclaw-main/tests/verification/behavior/areas/agent-lifecycle.mjs
kubeclaw-main/tests/verification/behavior/areas/telemetry.mjs
kubeclaw-main/tests/verification/behavior/areas/foundations.mjs
kubeclaw-main/tests/verification/behavior/areas/gates.mjs
```

## Per-file map

### `skills/nova/pipeline/agents/module-worker-control-results.js`

Role: Typed worker control-result adapter for Module Forge and Module Buster backend results.

Imports/dependencies: Pipeline `STATUS`, shared `worker-control-result.js` contract helpers, and `classifyPreTestFailure`.

Exports/public surface: `buildModuleForgeWorkerControlResult`, `isModuleForgeWorkerControlResult`, `coerceModuleForgeWorkerControlResult`, `buildModuleBusterWorkerControlResult`, `isModuleBusterWorkerControlResult`, `coerceModuleBusterWorkerControlResult`.

Defines: Forge summary builder; Buster failure-class inference; Buster summary builder; metadata projection from backend/poll/status/Redis entries.

Important variables/state: No mutable module state. Output metadata is cloned with `cloneSerializable` for final status, poll result, Redis entry.

Calls out to: `mapWorkerBackendResultToControl`, `buildTypedWorkerControlResult`, `isTypedWorkerControlResult`, `coerceTypedWorkerControlResult`, `classifyPreTestFailure`.

Called by / expected callers: `module-workers.js`, `orchestration.js` re-exports, module-runner helpers through contract projections, verification contracts.

Environment variables / CLI inputs / config fields: None directly. Consumes `config._runId`, `config.run_id`, worker input ids/refs, backend result fields, and Redis completion entry shape.

Paths built/read/written: None.

Authority behavior: Owns P05 worker backend-to-control-result projection for module Forge/Buster workers; shared contract helper owns canonical typed result schema.

Error/retry/terminal behavior: No throws in normal builders except downstream contract helper validation. Failure mapping is data-driven: Buster Redis pre-test verdicts become `pretest_code`, `pretest_config`, or `pretest_infra`; final FAIL/BLOCKED map to verdict/block classes; unknown falls back to reason or `unknown`.

Verification coverage: `check-worker-control-result-surface.mjs` asserts extraction, helper imports, typed-result behavior, and compatibility-shaped backend rejection.

Findings: None.

### `skills/nova/pipeline/agents/module-workers.js`

Role: Extracted module worker execution facade for Forge ACP/subagent work and Buster Redis dispatch, returning typed worker control results.

Imports/dependencies: `STATUS`, polling/recovery helpers, status store, session authority policy, healthcheck, control-result builders, lifecycle tracking, orchestration spawn/kill functions.

Exports/public surface: `runModuleForgeWorker`, `runModuleBusterWorker`.

Defines: Default ACP label helper, Forge spawn/health/poll/finalize flow, Buster completion archive/spawn/poll/finalize flow.

Important variables/state: No module-global state. Uses local dispatch/final status/stream/session variables; clears shutdown context after terminal/early-return paths when default or injected dependency supplied.

Calls out to: `spawnAgent`, `verifyAgentAlive`, `killAgent`, `getTrackedAgent`, `pollWithRateLimitRecovery`, `pollDualWithRateLimitRecovery`, `archiveModuleCompletions`, `loadStatus`, `saveStreamLog`, `buildActiveSessionAuthorityPolicy`, typed control-result builders.

Called by / expected callers: `orchestration.js` re-exports; module-runner Forge/Buster stages; worker control-result contract tests.

Environment variables / CLI inputs / config fields: None directly. Consumes worker input fields: `moduleId`, `moduleDir`, `timeoutMinutes`, `model`, `prompt`, `thinking`, `attempt`, `headBefore`, `status`, `runId`, `dispatchId`, callbacks.

Paths built/read/written: Persists stream log path through `saveStreamLog(config, moduleDir, phase, attempt, streamPath)` and reads status via `loadStatus`; concrete paths are status-store authority outside P05.

Authority behavior: Owns the worker execution envelope and typed-result return boundary, but delegates actual spawn, polling, kill, and status persistence to injected/default services.

Error/retry/terminal behavior: Missing config throws. Forge spawn/health failures return typed control results. Poll calls are finalized in `finally` with kill, status reload, optional callback, stream log save, and shutdown context clear. Buster archive or spawn failure returns typed control result; Buster polling finalization uses active-session authority policy before trusting status `active_agent` session/stream fields.

Verification coverage: `check-worker-control-result-surface.mjs` executes the Forge default dependency path and asserts typed result return; downstream module-runner tests cover stage use.

Findings: None.

### `skills/nova/pipeline/agents/orchestration-lifecycle-events.js`

Role: Shared payload/Discord-field builders for agent/reviewer spawn/kill lifecycle events.

Imports/dependencies: `buildDiscordIdentityFields`, `DISCORD_FIELD_SPECS` from `discord-fields.js`.

Exports/public surface: `buildLifecycleDiscordFields`, `telemetryModuleId`, `buildSpawnTelemetryPayload`, `buildSpawnDiscordFields`, `buildSpawnFailureDiscordFields`, `buildKillTelemetryPayload`.

Defines: Identity field ordering, spawn telemetry payload shape, spawn/failure Discord field composition, kill telemetry payload shape with optional change summary.

Important variables/state: None.

Calls out to: Discord identity field builder.

Called by / expected callers: `orchestration.js` and `reviewer-lifecycle.js`.

Environment variables / CLI inputs / config fields: None directly. Consumes caller-provided identity and tracked entry fields.

Paths built/read/written: None.

Authority behavior: Owns lifecycle-event payload/field construction shared by module agents and reviewers.

Error/retry/terminal behavior: No throws expected except downstream field builder. `telemetryModuleId` preserves explicit `opts.module_id` even when null, otherwise uses fallback.

Verification coverage: Agent lifecycle behavior tests assert spawn telemetry and Discord audit fields.

Findings: None.

### `skills/nova/pipeline/agents/orchestration.js`

Role: Main Nova agent orchestration boundary for ACP/subagent spawn/kill/steer, Redis dispatch, Buster payload construction, and module worker/reviewer exports.

Imports/dependencies: Node `child_process.execFileSync`, `path`; core paths/logger/constants; telemetry; ACP observability; worker result builders; healthcheck; lifecycle event builders; gateway/Discord/Redis adapter registry; shutdown reaper; ACP monitor/lifecycle/runtime helpers; prompt shared path helper; module worker/reviewer lifecycle helpers.

Exports/public surface: Worker compatibility/result exports, healthcheck, module worker runners, reviewer lifecycle, plus `acpLabel`, `spawnAcpAgent`, `killAcpAgent`, `buildBusterPayload`, `dispatchRedisTask`, `spawnAgent`, `killAgent`, `steerAgent`.

Defines: Redis dispatch adapter cache, Git worktree baseline/change detection, ACP label, ACP/subagent spawn/kill, Buster Redis payload builder for module/gate tests, Redis dispatch, generic agent spawn/kill/steer route selection.

Important variables/state: Module-local `_redisDispatchModules` cache keyed by registered adapter key. Tracked lifecycle entries gain baseline `_baselineFiles` and telemetry fields via `trackAgent`.

Calls out to: `resolveRegisteredRedisAdapter`, `spawnSession`, `trackAgent`, `getTrackedAgent`, `killSession`, `untrackAgent`, `waitForSessionIdle`, `reaperAfterKill`, `observeAcpMonitorSurfaces`, `onAgentSpawned`, `onAgentKilled`, `discord`, `gatewayInvoke`, `execFileSync('git', ...)`, module worker/reviewer helpers.

Called by / expected callers: Module/gate runners, registry built-ins, tests, public pipeline index.

Environment variables / CLI inputs / config fields: Reads `config.agents[agentType]` including `dispatch`, `cwd`, `timeout_seconds`, `acp_agent_id`, Redis adapter fields via adapter registry; uses `config.project`, `repo_root`, `run_id`/`_runId`, `_logDir`, `_runLogDir`, default timeout, progress modules/gates and test config.

Paths built/read/written: Builds module/gate Buster payload paths: module path, `BUSTER.md`, result artifact, status JSON, gate work dir/output/instructions, module/gate log dirs, pipeline log paths. Runs Git diff in agent cwd/repo root to detect changed files. Writes none directly except through downstream services.

Authority behavior: Owns route selection between Redis dispatch and ACP/subagent session lifecycle; owns Buster task payload schema. Adapter registry owns allowed Redis adapter selection; lifecycle helper owns tracked session map.

Error/retry/terminal behavior: Unknown agent throws in `spawnAgent`; Redis non-redis dispatch throws in `dispatchRedisTask`; ACP spawn failures send CRITICAL Discord best-effort then throw enriched error; kill waits for idle only when graceful, logs unconfirmed stops, and returns boolean; steer warns and returns on failures. Telemetry/Discord failures are logged DEBUG and non-blocking.

Verification coverage: `agent-lifecycle.mjs` covers ACP/subagent spawn correlation, Redis dispatch/static adapter fail-closed behavior, reviewer lifecycle, and kill paths; `telemetry.mjs` checks Buster payload telemetry fields; startup smoke checks public orchestration exports.

Findings: None.

### `skills/nova/pipeline/agents/reviewer-lifecycle.js`

Role: Echo reviewer session spawn/kill lifecycle for review gates.

Imports/dependencies: Model resolver, logger, telemetry, ACP observability, Discord, shutdown reaper, ACP monitor, runtime/lifecycle helpers, healthcheck identity, lifecycle event builders.

Exports/public surface: `spawnReviewerAgent`, `killReviewerAgent`.

Defines: Reviewer tracking key/gateway label/dispatch id generation, reviewer spawn payload, telemetry/Discord spawn events, reviewer kill/monitor/telemetry flow.

Important variables/state: No module-local state. Uses shared lifecycle tracked-agent map with labels `echo-<reviewer.label>-<gateId>`.

Calls out to: `resolveModel`, `modelToHarness`, `resolveRuntime`, `spawnSession`, `trackAgent`, `killSession`, `untrackAgent`, `waitForSessionIdle`, `reaperAfterKill`, `observeAcpMonitorSurfaces`, `onAgentSpawned`, `onAgentKilled`, `discord`.

Called by / expected callers: Review gate runner/fix cycle and gate tests.

Environment variables / CLI inputs / config fields: Reads reviewer `label`, `model`, `agent_id`, `dispatch`, `timeout_seconds`; config `agents.echo.cwd`, `repo_root`, run id fields.

Paths built/read/written: No direct filesystem paths. Uses reviewer session transcript path returned by lifecycle spawn and reaper inputs.

Authority behavior: Owns Echo reviewer lifecycle route; shared lifecycle owns tracked session state.

Error/retry/terminal behavior: Spawn failure sends CRITICAL Discord best-effort, wraps error with gateway label, and throws. Kill waits for idle when graceful, tries lifecycle kill/reaper/monitor, emits kill telemetry best-effort, untracks only when monitor confirms terminal/stopped/failed.

Verification coverage: `agent-lifecycle.mjs` exercises reviewer spawn/kill; gate tests inject reviewer lifecycle seams.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `module-workers.js` | `module-worker-control-results.js` | `buildModuleForgeWorkerControlResult`, `buildModuleBusterWorkerControlResult` | Worker execution returns typed control results directly. |
| `module-workers.js` | `orchestration.js` | `spawnAgent`, `killAgent` | Default spawn/kill dependency path. |
| `orchestration.js` | `module-workers.js` | `runModuleForgeWorker`, `runModuleBusterWorker` | Re-exported module worker entrypoints. |
| `orchestration.js` | `reviewer-lifecycle.js` | `spawnReviewerAgent`, `killReviewerAgent` | Re-exported reviewer lifecycle entrypoints. |
| `orchestration.js` | `lifecycle.js` | `spawnSession`, `killSession`, `trackAgent`, `untrackAgent`, `getTrackedAgent` | Shared lifecycle tracking/session authority. |
| `orchestration.js` | `adapter-registry.js` | `resolveRegisteredRedisAdapter` | Static fail-closed Redis adapter selection. |
| `orchestration.js` | `gateway.js` | `gatewayInvoke('sessions_send')` | ACP steer path. |
| `orchestration.js`; `reviewer-lifecycle.js` | `orchestration-lifecycle-events.js` | spawn/kill telemetry and Discord field builders | Shared lifecycle event schemas. |
| `orchestration.js`; `reviewer-lifecycle.js` | `acp-observability.js` | `observeAcpMonitorSurfaces` | Post-kill confirmation monitor. |
| `orchestration.js`; `reviewer-lifecycle.js` | `telemetry.js`; `discord.js` | `onAgentSpawned`, `onAgentKilled`, `discord` | Operator/telemetry lifecycle notifications. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `module-worker-control-results.js inferModuleBusterFailureClass` | Explicit `failure_class`, ok result, known reason, Redis entry/verdict/final status | Backend/poll result | Return pass/spawn/rate-limit/timeout/pretest/verdict/block/unknown class | Drives worker next-action mapping. |
| `module-workers.js runModuleForgeWorker` | Spawn failure or healthcheck failure | Spawn/health result | Return typed failure before poll | Avoids polling dead Forge sessions. |
| `module-workers.js runModuleForgeWorker` | Poll completes/throws | Poll/finally block | Always kill, reload status, finalize, save stream log, clear shutdown context | Ensures cleanup after Forge worker polling. |
| `module-workers.js runModuleBusterWorker` | Completion archive failure or spawn failure | Archive/spawn result | Return typed failure before poll | Prevents stale completion reuse and reports dispatch failures. |
| `module-workers.js runModuleBusterWorker` | Status `active_agent` identity confirmed | Active-session authority policy | Trust status stream/session only if identity confirmed; otherwise use dispatch/poll entry | Prevents stale active-agent authority. |
| `orchestration.js getRedisDispatchModule` | Adapter cacheable false/cache hit/miss | Adapter registry result | Return uncached override, cached adapter, or cache new static adapter | Keeps production adapter stable while allowing test override. |
| `orchestration.js spawnAgent/killAgent/steerAgent` | `agentConfig.dispatch === 'redis'` | Agent config | Redis dispatch/no-kill/Redis steer vs ACP spawn/kill/gateway steer | Central dispatch route selection. |
| `orchestration.js spawnAcpAgent` | Runtime resolves to subagent | Model/runtime | Use subagent runtime, omit ACP agent id semantics, suppress thinking in gateway request | Keeps subagent/ACP gateway semantics distinct. |
| `orchestration.js killAcpAgent` | Graceful flag, missing session, post-kill monitor terminal | Inputs/tracked entry/monitor | Wait idle or skip; warn and untrack missing; untrack only after terminal confirmation | Prevents premature session cleanup. |
| `orchestration.js buildBusterPayload` | `taskType` is `module_test`, `gate_test`, or other | Task type/progress | Build module schema, gate schema, or generic message | Buster receives task-type-specific contract. |
| `reviewer-lifecycle.js spawnReviewerAgent` | Runtime resolves to subagent vs ACP | Reviewer dispatch/model | Spawn with shared lifecycle and record runtime | Review gate supports ACP/subagent reviewer runtimes. |
| `reviewer-lifecycle.js killReviewerAgent` | Graceful and terminal monitor result | Inputs/monitor | Wait idle if graceful; untrack only when terminal/stopped/failed | Echo reviewer cleanup mirrors module agent cleanup. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `module-worker-control-results.js` | Typed worker metadata object | Config, worker input, result, opts | IDs/refs first, config/run fallback, result status/poll cloned | Worker result metadata is serializable and source-attributed. |
| `module-workers.js` | Module stream-log status projection | `saveStreamLog(config,moduleDir,phase,attempt,path)` | Save after final status/callback, even on poll throw via `finally` | Status store records worker transcript path. |
| `module-workers.js` | Final Buster stream/session authority | Dispatch, poll Redis entry, status active agent | Confirm status active-agent identity before trusting it; otherwise fallback to dispatch/poll | Avoids stale active session fields. |
| `orchestration.js _redisDispatchModules` | Adapter cache | Registered adapter key | Cache unless adapter result has `cacheable:false` | Static Redis adapter loaded once per process. |
| `orchestration.js trackAgent` call | Shared lifecycle tracked entry | Spawn result and opts | Base lifecycle fields plus telemetry module/gate/attempt/dispatch extras | Healthcheck/kill/shutdown can correlate sessions. |
| `orchestration.js captureBaselineFiles` | Tracked entry `_baselineFiles` | `git diff --name-only HEAD` | Store Set only when cwd is Git worktree and entry exists | Kill telemetry can report newly changed files. |
| `reviewer-lifecycle.js trackAgent` call | Shared lifecycle tracked entry | Reviewer spawn result and opts | Base lifecycle fields plus reviewer/gate telemetry extras | Reviewer kill/telemetry can correlate Echo session. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `module-workers.js runModuleForgeWorker` | Polling delegated to `pollWithRateLimitRecovery` | Delegated | `timeoutMinutes` input | Finally kills and returns typed result after poll completes/throws. |
| `module-workers.js runModuleBusterWorker` | Polling delegated to `pollDualWithRateLimitRecovery` | Delegated | `timeoutMinutes` input | Finally kills and returns typed result after poll completes/throws. |
| `orchestration.js captureBaselineFiles/computeFilesChanged` | Git command once each | None | Git timeout 5000 ms | Debug log and continue on Git errors. |
| `orchestration.js killAcpAgent`; `reviewer-lifecycle.js killReviewerAgent` | Idle wait/kill confirmation delegated | `waitForSessionIdle`, `killSession` | Lifecycle/monitor timeouts from P04 | Return boolean based on post-kill monitor terminal state. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `workerInput.moduleId/moduleDir/timeoutMinutes/model/prompt/thinking/attempt/headBefore` | Worker input | `runModuleForgeWorker` | Caller-provided; `attempt=1`, `thinking=null` | Forge worker execution envelope. |
| `workerInput.status/runId/dispatchId` | Worker input | `runModuleBusterWorker` | Caller-provided | Buster dispatch/completion identity. |
| `deps.*` worker dependency overrides | Function input | `runModuleForgeWorker`, `runModuleBusterWorker` | Default orchestration/status/polling helpers | Test seams and alternate dependency injection. |
| `config.agents[agentType].dispatch` | Config field | `spawnAgent`, `killAgent`, `steerAgent`, `dispatchRedisTask` | Agent config | Selects Redis vs ACP/subagent route and validates Redis dispatch. |
| `config.agents[agentType].cwd/timeout_seconds/acp_agent_id` | Config fields | `spawnAcpAgent` | cwd falls back to `config.repo_root`; agent id falls back to model harness/agentType | ACP/subagent spawn payload inputs; thinking comes from runtime/scope/project policy only. |
| `config.agents[agentType].redis_*` | Config fields | `getRedisDispatchModule` via adapter registry | `pipeline-redis` from adapter registry | Static Redis adapter selection. |
| `reviewer.label/model/agent_id/dispatch/timeout_seconds` | Reviewer input | `spawnReviewerAgent`, `killReviewerAgent` | Model resolved through config/progress | Echo reviewer lifecycle identity and runtime. |
| `opts.dispatch_id/module_id/gate_id/gate_type/substep/attempt/thinking/status/taskType/model` | Function opts | Orchestration/reviewer/module workers | Generated/fallback values where absent | Correlation and task payload fields. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| Module Buster `module_path` | `orchestration.js buildBusterPayload` | Buster task consumer | None in P05 | Relative path to module directory. |
| Module Buster `buster_md_path` | `orchestration.js buildBusterPayload` | Buster task consumer | None in P05 | Relative `BUSTER.md` path in module dir. |
| Module Buster `result_artifact_path` | `orchestration.js buildBusterPayload` via `busterResultArtifactPath` | Buster task consumer/Nova result readers | Buster outside P05 | Artifact path authority is prompt/shared + Buster result handling. |
| Module Buster `status_json_path` | `orchestration.js buildBusterPayload` via `statusPath` | Buster task consumer/status readers | Status store outside P05 | Relative status path. |
| Gate Buster `work_dir`, `output_file`, `instructions_file` | `orchestration.js buildBusterPayload` | Buster gate task consumer | Gate/Buster services outside P05 | Paths relative to swarm root when configured. |
| Module/gate `log_dir`, `pipeline_log_path`, `pipeline_run_log_path` | `orchestration.js buildBusterPayload` | Buster task consumer/Discord logging | Log services outside P05 | Passed through Redis payload for task context. |
| Agent Git diff baseline paths | `orchestration.js captureBaselineFiles`, `computeFilesChanged` | Kill telemetry builder | None | `git diff --name-only HEAD` in cwd/repo root. |
| Worker stream log path | Spawn/tracked lifecycle and status active-agent | `module-workers.js` | `saveStreamLog` delegated to status-store | Stored per phase/attempt after finalization. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Module worker typed control result | `module-worker-control-results.js` with shared contract helper | Module runners, registry built-ins, verification contracts | None. |
| Module worker execution envelope | `module-workers.js` | Module runners/orchestration exports | Polling/status-store authority reviewed later. |
| Agent dispatch route | `orchestration.js spawnAgent/killAgent/steerAgent` | Module/gate runners and registry built-ins | None. |
| Redis Buster task payload schema | `orchestration.js buildBusterPayload` | Buster task pipeline, Redis dispatch, tests | Completion/result consumption reviewed in Buster/P17 batches. |
| Redis dispatch adapter process cache | `orchestration.js _redisDispatchModules` | `dispatchRedisTask` | None. |
| Agent/reviewer tracked lifecycle metadata | `orchestration.js`, `reviewer-lifecycle.js` through shared lifecycle | Healthcheck, shutdown, telemetry, kill paths | Shared lifecycle map authority reviewed in P04. |
| Lifecycle telemetry/Discord payload builders | `orchestration-lifecycle-events.js` | Orchestration and reviewer lifecycle | Full Discord field schema reviewed in rate-limit contract batch. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Module Forge worker control result | `buildModuleForgeWorkerControlResult` | Shared typed worker result plus metadata `module_id`, `run_id`, `attempt`, `stage_id`, `worker_type`, `module_dir`, `reason`, `error`, `gateway_label`, `session_key`, `stream_log_path`, `module_attempt_ref`, `final_status`, `poll_result` | Shared worker control-result helper | Module runner, registry worker stage. |
| Module Buster worker control result | `buildModuleBusterWorkerControlResult` | Shared typed worker result plus metadata `failure_class`, `dispatch_id`, `worker_dispatch_ref`, `redis_entry`, final/poll/status/session fields | Buster failure-class inference and shared helper | Module runner, registry worker stage. |
| Spawn telemetry payload | `buildSpawnTelemetryPayload` | `label`, `model`, `dispatch`, `module_id`, `gate_id`, `gate_type`, `substep`, `attempt`, `dispatch_id`, `timeout_minutes`, `session_key`, `thinking_level` | Lifecycle event builder | `onAgentSpawned`. |
| Kill telemetry payload | `buildKillTelemetryPayload` | `label`, `module_id`, `gate_id`, `gate_type`, `session_key`, `attempt`, `dispatch_id`, optional `has_changes`, `files_changed` | Lifecycle event builder | `onAgentKilled`. |
| Module Buster Redis task payload | `buildBusterPayload` for `module_test` | `task_type`, `module`, `project`, `commit_hash`, `timestamp`, `completion_stream`, `stage_id`, `worker_type`, `module_id`, `prompt`, `instructions`, `session`, `module_path`, `buster_md_path`, `result_artifact_path`, `status_json_path`, `suites`, `test_suites`, `test_config`, `run_id`, `attempt`, `dispatch_id`, log paths | Constructor only | Buster Redis task consumer. |
| Gate Buster Redis task payload | `buildBusterPayload` for `gate_test` | Base fields plus `stage_id:'gate:buster'`, `gate_type`, `gate_id`, `gate_title`, `work_dir`, `output_file`, `instructions_file`, suites/test config, identity/log fields | Constructor only | Buster gate task consumer. |
| Generic Redis task payload | `buildBusterPayload` fallback / `dispatchRedisTask` | `{ module, project, message, timestamp }` or base plus `message` | Constructor only | Redis task consumer. |
| Agent spawn return | `spawnAcpAgent`, `spawnReviewerAgent` | `{ label, childSessionKey, runId, dispatchId, streamLogPath }` | Shared lifecycle spawn accepted response | Module/gate runners. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Forge ACP/subagent worker prompt | Caller-provided `taskPrompt` passed by `spawnAcpAgent`/`runModuleForgeWorker` | None built in P05 | P05 forwards prompt unchanged to `spawnSession` | Gateway `sessions_spawn` via shared lifecycle | Session accepted, healthcheck passes, status reaches READY_FOR_TESTING/FAIL/BLOCKED. |
| Module Buster Redis prompt | `buildBusterPayload` from caller `taskPrompt` | `result_artifact_path` included in payload | Same text assigned to `prompt` and `instructions` | Redis task stream via static adapter | Buster completion/status reaches PASS/FAIL/BLOCKED. |
| Gate Buster Redis prompt | `buildBusterPayload` for `gate_test` | `output_file`/`instructions_file` included when gate configured | Same text assigned to `prompt` and `instructions` | Redis task stream via static adapter | Buster gate completion/status consumed by gate runner. |
| Echo reviewer prompt | Caller-provided `instructions` passed by `spawnReviewerAgent` | None built in P05 | P05 forwards instructions unchanged to `spawnSession` | Gateway `sessions_spawn` via shared lifecycle | Reviewer session accepted and later killed/monitored. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `module-worker-control-results.js` builders | Invalid backend data/contract helper failure | No | No retry/backoff | Shared helper may throw; otherwise maps to typed control result | Metadata cloned, not redacted. |
| `module-workers.js runModuleForgeWorker` | Missing config | No | No retry/backoff | Throws | None. |
| `module-workers.js runModuleForgeWorker` | Spawn failure | No local retry | Shared spawn may retry | Returns typed control result `reason:'spawn_failed'` | Error message included. |
| `module-workers.js runModuleForgeWorker` | Healthcheck failed | No | No retry/backoff | Kills agent, clears shutdown context, returns typed failure | None. |
| `module-workers.js runModuleForgeWorker` | Poll/finalize failures | Poll helper owns retry | Poll timeout delegated | `finally` kills, reloads status, saves stream log, clears shutdown context; poll throw propagates after finally | None. |
| `module-workers.js runModuleBusterWorker` | Completion archive failure | No | No retry/backoff in scoped file | Returns typed `completion_archive_failed` result | None. |
| `module-workers.js runModuleBusterWorker` | Spawn failure | No local retry | Spawn helper/Redis path may retry downstream | Returns typed `spawn_failed` result | Error message included. |
| `module-workers.js runModuleBusterWorker` | Poll/finalize failures | Poll helper owns retry | Poll timeout delegated | `finally` kills, reloads status, resolves active authority, saves stream log, clears shutdown context | None. |
| `orchestration.js spawnAcpAgent` | Gateway/lifecycle spawn failure | Shared lifecycle retry | Default shared spawn retry 3 attempts/5000 ms | Sends CRITICAL Discord best-effort and throws enriched error | Discord sanitizer downstream. |
| `orchestration.js killAcpAgent` | Missing session, kill/monitor failures | Kill helper may poll | Idle/kill polling delegated | Missing session warns/untracks false; kill errors propagate; monitor errors debug; returns terminal boolean | None. |
| `orchestration.js dispatchRedisTask` | Non-redis config, adapter resolution, send failure | Adapter/Redis helper may retry | Redis client retry downstream | Throws wrapped dispatch error | None. |
| `orchestration.js steerAgent` | Missing session or Redis/gateway steer failure | No | Gateway timeout 15000 ms for ACP steer | Logs WARN and returns | None. |
| `orchestration.js Git baseline/change detection` | Non-Git cwd or Git diff failure | No | Git command timeout 5000 ms | Non-Git returns; errors DEBUG and continue | None. |
| `reviewer-lifecycle.js spawnReviewerAgent` | Gateway/lifecycle spawn failure | Shared lifecycle retry | Default shared spawn retry | Sends CRITICAL Discord best-effort and throws enriched error | Discord sanitizer downstream. |
| `reviewer-lifecycle.js killReviewerAgent` | Missing session, kill/monitor failures | Kill helper may poll | Idle/kill polling delegated | Missing session warns/untracks false; monitor errors debug; untracks only if terminal | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `module-worker-control-results.js` builders | Contract/helper failure | No direct telemetry | none | none | Function throws | Caller owns logging. |
| `module-workers.js runModuleForgeWorker` | Missing config | No | none | none | Function throws | Caller owns logging. |
| `module-workers.js runModuleForgeWorker` | Spawn failure | Indirect | Typed worker control result | `producerType:'module_forge'`, `reason:'spawn_failed'` metadata | Control-result builder | Upstream module runner logs/projects result. |
| `module-workers.js runModuleForgeWorker` | Healthcheck failed | Indirect plus kill logs | Typed worker control result and kill telemetry if kill emits | `healthcheck_failed` | Control-result builder / kill path | No direct telemetry in worker wrapper. |
| `module-workers.js runModuleForgeWorker` | Poll/finalize failures | Partial | Kill telemetry/logs in downstream kill path | agent kill events/logs | `killAgent` downstream | Poll helper owns poll telemetry. |
| `module-workers.js runModuleBusterWorker` | Archive failure | Indirect | Typed worker control result | `completion_archive_failed` | Control-result builder | Upstream runner handles result. |
| `module-workers.js runModuleBusterWorker` | Spawn failure | Indirect | Typed worker control result | `spawn_failed` | Control-result builder | Upstream runner handles result. |
| `module-workers.js runModuleBusterWorker` | Poll/finalize failures | Partial | Redis/poll/kill downstream logs | poll/kill service events | Downstream helpers | Worker wrapper has no direct telemetry. |
| `orchestration.js spawnAcpAgent` | Spawn success/failure | Yes | Telemetry stream and Discord/audit JSONL | `agent.spawned`; CRITICAL spawn failed Discord on failure | `onAgentSpawned`, `discord` | Telemetry/Discord failures logged DEBUG. |
| `orchestration.js killAcpAgent` | Kill success/failure/unconfirmed | Yes on kill attempt | Telemetry stream and core logger | `agent.killed`; WARN/OK logs | `onAgentKilled`, `log` | Monitor errors logged DEBUG. |
| `orchestration.js dispatchRedisTask` | Redis dispatch failure | No direct telemetry | none | none | Function throws | Redis adapter/logging may emit separately. |
| `orchestration.js steerAgent` | Steer failure | Yes | Core logger | WARN `Redis steer failed` / `ACP steer failed` | `log` | No telemetry stream event. |
| `orchestration.js Git baseline/change detection` | Git diff failure | Yes | Core logger | DEBUG baseline/change failure | `log` | Non-critical. |
| `reviewer-lifecycle.js spawnReviewerAgent` | Spawn success/failure | Yes | Telemetry stream and Discord/audit JSONL | `agent.spawned`; CRITICAL reviewer spawn failed Discord | `onAgentSpawned`, `discord` | Telemetry/Discord failures logged DEBUG. |
| `reviewer-lifecycle.js killReviewerAgent` | Kill success/failure/unconfirmed | Yes on kill attempt | Telemetry stream and core logger | `agent.killed`; WARN/OK/DEBUG logs | `onAgentKilled`, `log` | Untracks only after terminal confirmation. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js runtime | `node` binary | Observed `v24.14.0` during review | All P05 modules | ESM, async functions, optional chaining, Date | No package pin in scoped files. |
| Git binary | System `git` | Observed `2.39.5` during review | `orchestration.js` baseline/change detection | `rev-parse --is-inside-work-tree`, `diff --name-only HEAD` | 5000 ms timeout; failures debug/continue. |
| Redis adapter | Static adapter registry result | Internal source | `orchestration.js dispatchRedisTask` | Buster Redis task dispatch | Unknown adapters fail closed in P02/P03-reviewed registry. |
| OpenClaw gateway/session lifecycle | Shared lifecycle/gateway helpers | Internal/external gateway | `spawnAcpAgent`, `killAcpAgent`, reviewer lifecycle, `steerAgent` | ACP/subagent spawn/kill/steer | Spawn/kill retry semantics reviewed in P04. |
| Discord integration | Internal service + webhook API | Internal/external | Spawn/failure lifecycle notices | Operator notification/audit | Failures are best-effort DEBUG logs in scoped callers. |
| Telemetry service | Internal source | Internal | Spawn/kill events | Agent lifecycle telemetry | Sink behavior reviewed in P16. |
| Worker control-result contract helper | `services/contracts/worker-control-result.js` | Internal source | `module-worker-control-results.js` | Typed worker result schema and mapping | Full contract reviewed in P13. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Redis adapter process cache | Map keyed by adapter key | Cache unless adapter result `cacheable:false` | Static adapter reused; test overrides can bypass cache | INFO log on load/uncached | None. |
| Module worker polling | Delegated poll loops | `timeoutMinutes` input | Poll helper decides timeout/rate-limit recovery; worker wrapper finalizes in `finally` | Poll/kill downstream logs | Polling reviewed in P17. |
| ACP/subagent spawn | Shared lifecycle retry | Default 3 attempts/5000 ms from P04 | Final spawn failure throws and emits CRITICAL Discord | Discord/telemetry on spawn success/failure | None. |
| ACP/subagent kill | Shared lifecycle monitor and post-kill observe | Idle wait only when `graceful=true` | Unconfirmed monitor leaves tracked entry and returns false | WARN/telemetry kill attempt | None. |
| Git baseline/change detection | Synchronous Git calls | 5000 ms timeout each | Failure does not block lifecycle | DEBUG log | None. |
| Discord/telemetry lifecycle notifications | Fire-and-catch for Discord; telemetry try/catch | No queue in scoped caller | Failures logged DEBUG and do not block spawn/kill return | DEBUG logs | Sink backpressure reviewed in P16/P03. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| ACP/subagent spawn request | `spawnAcpAgent`, `spawnReviewerAgent` through shared lifecycle | Nova orchestration/reviewer lifecycle | OpenClaw gateway `sessions_spawn` | Shared lifecycle retry; no local queue | Request includes caller prompt/instructions, runtime, model, agentId, cwd, label, thinking. |
| ACP/subagent tracked session record | Shared lifecycle `trackAgent` called by P05 | Shared lifecycle map | Healthcheck, shutdown, kill, telemetry | No throttle; map entry overwritten by label | Includes sessionKey, gatewayLabel, streamLogPath, runtime, run/attempt/dispatch identity. |
| ACP/subagent steer request | `steerAgent` | Nova orchestration | Gateway `sessions_send` | Gateway timeout 15000 ms; no retry | `{ sessionKey, message }`. |
| ACP/subagent kill/idle observation | `killAcpAgent`, `killReviewerAgent` | Nova orchestration/reviewer lifecycle | Shared lifecycle/gateway/ACP monitor | Idle wait only when graceful; post-kill observe before untrack | Monitor terminal/stopped/failed controls returned boolean. |
| Redis-dispatched Buster task | `dispatchRedisTask` / `buildBusterPayload` | Nova orchestration | Buster Redis consumer | Redis adapter/client backpressure downstream | Task schemas listed in data schema map. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Worker control-result extraction and typed contract behavior | `tests/verification/contracts/check-worker-control-result-surface.mjs` | Strong source and behavior coverage | Full mapping semantics reviewed with contract batch P13. |
| ACP/subagent spawn telemetry/Discord correlation | `tests/verification/behavior/areas/agent-lifecycle.mjs` | Strong behavior coverage | Does not exhaust every Discord failure branch. |
| Redis dispatch static adapter and fail-closed behavior | `tests/verification/behavior/areas/agent-lifecycle.mjs` | Good behavior coverage | Redis backend live behavior covered elsewhere. |
| Reviewer spawn/kill lifecycle | `tests/verification/behavior/areas/agent-lifecycle.mjs`, `gates.mjs` | Good direct/injected coverage | Actual review prompt parsing outside P05. |
| Buster payload telemetry/log fields | `tests/verification/behavior/areas/telemetry.mjs` | Focused coverage | Full Buster consumer schema reviewed in Buster batches. |
| Public orchestration exports | `tests/verification/behavior/areas/foundations.mjs` | Good public surface smoke | Source-only for some exports. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- None yet.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
