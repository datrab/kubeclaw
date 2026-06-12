# Batch V03a — Behavior verification agents, Buster, deployment, polling, and redaction

Status: completed
Date started: 2026-05-09
Date completed: 2026-05-09
Reviewer: Nova

## Scope

```text
tests/verification/behavior/areas/agent-lifecycle.mjs
tests/verification/behavior/areas/buster-runtime-normalization.mjs
tests/verification/behavior/areas/deployment-surface.mjs
tests/verification/behavior/areas/discord-correlation.mjs
tests/verification/behavior/areas/many-module-soak.mjs
tests/verification/behavior/areas/polling.mjs
tests/verification/behavior/areas/redaction-surface.mjs
```

Scope expansion verified live: 7 files, under the 10-file maximum. The scoped files were read end to end in the main session before conclusions were written.

## Sources checked

Implementation files:

```text
kubeclaw-main/tests/verification/behavior/areas/agent-lifecycle.mjs
kubeclaw-main/tests/verification/behavior/areas/buster-runtime-normalization.mjs
kubeclaw-main/tests/verification/behavior/areas/deployment-surface.mjs
kubeclaw-main/tests/verification/behavior/areas/discord-correlation.mjs
kubeclaw-main/tests/verification/behavior/areas/many-module-soak.mjs
kubeclaw-main/tests/verification/behavior/areas/polling.mjs
kubeclaw-main/tests/verification/behavior/areas/redaction-surface.mjs
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/docs/pipeline/implementation-map/README.md
kubeclaw-main/docs/pipeline/implementation-map/batch-template.md
kubeclaw-main/docs/open-issues.md
```

## Per-file map

### `tests/verification/behavior/areas/agent-lifecycle.mjs`

Role: Behavior area for Nova ACP/subagent spawn, kill, reviewer lifecycle, and Redis task dispatch surfaces.

Imports/dependencies: Injected behavior harness deps, fake Redis, fake gateway, filesystem/temp helpers, `materializeRuntimeTree`, `importRuntimeModule`, `writeExecutable`, `execFileSync`, and runtime modules for orchestration/lifecycle/runtime.

Exports/public surface: `registerAgentLifecycleArea(deps)`.

Defines: `buildBuiltInRegistry(runtimeRootForRegistry)` and 8 records: Forge ACP spawn, Forge subagent spawn, spawn-failed alert correlation, ACP/subagent kill split, reviewer lifecycle, known-session kill correlation, direct Redis dispatch import, per-config Redis adapter resolution, and fail-closed unregistered `redis_js_path` handling.

Important variables/state: Fake gateway request log; tracked agents in lifecycle service; `OPENCLAW_GATEWAY_URL` and `PATH` save/restore; fake `acpx`/`node` traps; temp repo/swarm/log roots; fake Redis adapter call logs.

Calls out to: `spawnAcpAgent`, `spawnReviewerAgent`, `killReviewerAgent`, `killAcpAgent`, `lifecycleMod.killSession`, `trackAgent`/`untrackAgent`, `dispatchRedisTask`, Discord audit writers, fake gateway tools `sessions_spawn`, `session_status`, `sessions_send`, and `subagents`.

Called by / expected callers: `tests/verification/behavior/verify.mjs` when `agent-lifecycle` is selected.

Environment variables / CLI inputs / config fields: Temporarily sets `OPENCLAW_GATEWAY_URL`, `PATH`, and `BEHAVIOR_REDIS_DISPATCH_CALL_PATH`. Fixture configs use `project`, `repo_root`, `telemetry.enabled`, `agents.forge.cwd`, `agents.forge.timeout_seconds`, `agents.forge.thinking_level`, `agents.buster.dispatch`, `agents.buster.redis_js_path`, `agents.buster.redis_adapter`, `_testOverrides.adapters.redis`, `_logDir`, `_runLogDir`, `_runId`/`run_id`, `_disable_discord_webhooks`, `discord_webhook_url`, `_runStats`, `_pluginRegistry`, and `paths.swarm_dir`/`paths.modules_dir`.

Paths built/read/written: Temp repos under `os.tmpdir()`; `.swarm/logs/pipeline/discord.jsonl`; `.swarm/logs/pipeline/runs/<run_id>/discord.jsonl`; fake executable directories; `${HOME}/.openclaw/tmp/behavior-redis-dispatch-*`; fake Redis adapter modules and `dispatch-call.json`.

Authority behavior: Verifies gateway/session lifecycle and telemetry/Discord correlation are owned by orchestration/lifecycle, not display labels or local wrappers; subagent kill uses gateway `subagents kill`; ACP kill uses `sessions_send`; Redis dispatch imports registered adapters directly and does not spawn a temporary Node wrapper.

Error/retry/terminal behavior: Spawn rejection throws with canonical gateway label and writes spawn-failed Discord evidence. Session status failure during post-kill verification emits degraded/restored observability. Unregistered Redis adapter rejects fail-closed.

Verification coverage: Strong behavior assertions for gateway request bodies, telemetry `agent.spawned`/`agent.killed` events, Discord audit fields, direct adapter calls, and fail-closed errors.

Findings: None found in scoped file.

### `tests/verification/behavior/areas/buster-runtime-normalization.mjs`

Role: Behavior area for Buster runtime import normalization, gateway/token resolution, task identity validation, monitor telemetry, rate-limit identity, task queue terminal guarantees, cleanup diagnostics, orphan recovery, and removed Redis direct completion path.

Imports/dependencies: Injected harness deps, fake Redis, fake gateway, overlay source reader, runtime materializer, Buster root pipeline module, sandbox runtime modules, and a fake `ioredis` module written into `runtimeRoot/node_modules/ioredis` for queue tests.

Exports/public surface: `registerBusterRuntimeNormalizationArea(deps)`.

Defines: `createBusterTelemetryCapture()`, `silentLogger`, `installQueuedTaskRedis(runtimeRoot, opts)`, `buildQueuePayload(extra)`, and 14 records covering runtime imports, monitor deltas, Buster rate-limit pause budgets, gate cooldowns, task payload validation, process diagnostics, critical catches, terminal-completion-before-ACK guarantees, explicit cleanup catches, startup orphan recovery, and removed `redis.js complete`.

Important variables/state: Fake Redis queue globals `__queueRedisCalls`, `__queueRedisDelivered`, `__queueRedisPayload`, `__queueRedisFailCompletion`, `__queueRedisFailDeadLetter`; telemetry capture context; temp active-session files; fake gateway session-state map; process env `OPENCLAW_GATEWAY_URL` save/restore.

Calls out to: `busterPipelineMod.monitorSession`, `resolveBusterRateLimitMaxPauses`, `validateBusterTaskPayload`, `buildBusterProcessDiagnosticRecord`, `recoverOrphanedActiveSession`, sandbox `rate-limit.js handleRateLimit`, `task-queue.js processOneQueuedTask`, and `tools/redis.js complete`.

Called by / expected callers: `tests/verification/behavior/verify.mjs` when `buster-runtime-normalization` is selected.

Environment variables / CLI inputs / config fields: Verifies sources do not read legacy `process.env.GATEWAY_TOKEN` directly. Temporarily sets `OPENCLAW_GATEWAY_URL`. Payload/config fields include `task_type`, `module_id`, `module`, `project`, `run_id`, `attempt`, `dispatch_id`, `completion_stream`, `gate_id`, `gate_type`, `rate_limit.max_pauses`, `acp_monitor.monitor_poll_ms`, `session.label`, and active-session `runtime`/`gatewayLabel`.

Paths built/read/written: Fake `node_modules/ioredis`; active-session JSON files; Buster source files via `readOverlayText`; queue completion stream `pipeline:demo-project:completions`; `swarm:buster:tasks`; dead-letter streams; process-health artifact references.

Authority behavior: Buster task identity must come from canonical payload fields rather than invented module/project/run/attempt/dispatch fallbacks. Queue terminal completion or dead-letter must be written before ACK; if both fail ACK is refused. Orphan active-session file is deleted only after confirmed kill; malformed active-session files are removed after diagnostic evidence.

Error/retry/terminal behavior: Validates rate-limit pause budget/exhaustion, process diagnostic records marked `diagnostic_only`, critical catch diagnostics, queue fallback completion, dead-letter fallback, no ACK when terminal guarantee fails, unconfirmed orphan kill preservation, malformed active-session file cleanup, and removed Redis direct complete rejection.

Verification coverage: Strong behavior and source-text assertions across Buster monitor, queue, rate-limit, startup recovery, runtime diagnostics, and legacy-path removal.

Findings: None found in scoped file.

### `tests/verification/behavior/areas/deployment-surface.mjs`

Role: Behavior wrapper for deployment truth verification from the behavior suite.

Imports/dependencies: Injected harness deps and `execFileSync`.

Exports/public surface: `registerDeploymentSurfaceArea(deps)`.

Defines: One record, `helm render for nova values preserves service exposure, skills merge behavior, and writable config provenance`.

Important variables/state: Parsed JSON output from `tests/verification/deployment/check-deployment-truth.mjs`.

Calls out to: `node tests/verification/deployment/check-deployment-truth.mjs --source-root <sourceRoot>`.

Called by / expected callers: `tests/verification/behavior/verify.mjs` when `deployment-surface` is selected.

Environment variables / CLI inputs / config fields: No direct env reads. Passes `--source-root` CLI flag to deployment check script.

Paths built/read/written: Builds check script path from `sourceRoot`; no direct writes.

Authority behavior: Delegates deployment truth to the dedicated deployment verification script and asserts expected rendered Helm/deploy smoke checks.

Error/retry/terminal behavior: `execFileSync` failure or missing check text fails the behavior record; no retry logic in scoped file.

Verification coverage: Coverage is a behavior-suite bridge over deployment verification output, including Nova/Buster Services/Deployments, `SWARM_CONFIG`, custom skills merge rules, build/deploy scripts, live verification, and setup/status/teardown failure classification.

Findings: None found in scoped file.

### `tests/verification/behavior/areas/discord-correlation.mjs`

Role: Behavior area for Discord identity fields, canonical correlation parsing, Nova injection messages/audit entries, failure-service correlation helpers, and blueprint Discord field ownership.

Imports/dependencies: Injected behavior deps, fake gateway, runtime materializer, Discord integration module, failure service, overlay source reader.

Exports/public surface: `registerDiscordCorrelationArea(deps)`.

Defines: 8 records covering shared Discord identity fields, pipeline/failure/rate-limit joins, display-label parsing, canonical builder imports, module/gate Nova injection correlation, failure presentation/correlation service source contracts, and blueprint reporting correlation.

Important variables/state: Fake gateway request list for `sessions_send`; temp `.swarm/logs`; Discord audit JSONL entries; source-text assertions for imports/helper presence/absence.

Calls out to: `buildDiscordIdentityFields`, `discordMod.discord`, `failuresMod.injectNeedsNova`, fake gateway `sessions_send`, and source-text checks for `discord-fields.js`, failures presentation, correlation service, blueprint, and core operator modules.

Called by / expected callers: `tests/verification/behavior/verify.mjs` when `discord-correlation` is selected.

Environment variables / CLI inputs / config fields: Temporarily sets `OPENCLAW_GATEWAY_URL`; fixture configs use `_runId`/`run_id`, `_logDir`, `_disable_discord_webhooks`, and correlation fields `dispatch_id`, `gateway_label`, `session_key`, `gate_id`, `gate_type`, `attempt`, `step_type`, and `step_id`.

Paths built/read/written: Temp `.swarm/logs/pipeline/discord.jsonl`; `.swarm/logs/pipeline/runs/<run_id>/nova-injections.jsonl`; `.swarm/logs/pipeline/nova-injections.jsonl`.

Authority behavior: Canonical Discord identity builder owns field order/aliases. Display `Label` is not canonical `gateway_label`. Failure presentation uses `resolveResultCorrelation` and read-model provenance rather than duplicate/fallback correlation helpers.

Error/retry/terminal behavior: Nova injection audit status and gateway `sessions_send` request are asserted; no retry logic in scoped file. Source assertions prevent fallback helper reintroduction that could drift correlation.

Verification coverage: Strong behavior/source assertions for module and gate injection fields, audit JSONL, Discord field ordering, failure presentation import contracts, and blueprint fields.

Findings: None found in scoped file.

### `tests/verification/behavior/areas/many-module-soak.mjs`

Role: Behavior area for integrated and hermetic many-module full-pipeline soak execution, typed worker contracts, validator/generator scheduling, retry flow, status persistence, and telemetry ordering.

Imports/dependencies: Injected fake Redis helpers, Node fs/os/path/assert, runtime materializer/importer, pipeline runner, runtime core, lifecycle state, status store, and pipeline-step-result contract.

Exports/public surface: `registerManyModuleSoakArea(deps)`.

Defines: `buildBuiltInRegistry(runtimeRootForRegistry)`, `withIntegratedModuleHappyPathStages(registry, opts)`, inner `readStatusFromInput(input)`, `validatorPass(stageId, input)`, and 3 records: integrated 10-module happy path, integrated 8-module mixed retry path, and hermetic 12-module execution-order soak.

Important variables/state: Stage owner stubs for `worker:module_forge`, `worker:module_buster`, `validator:delivery_lint`, `validator:pre_check`, and three generators; `workerCalls`, `validatorCalls`, `generatorCalls`; module status files; retry module sets; fake Redis streams; `_testOverrides.pipelineRunner` and `_testOverrides.moduleRunner`.

Calls out to: `runPipeline`, `statusStoreMod.loadStatus/saveStatus/initStatus`, lifecycle transitions, `buildPipelineStepResult`, and stubbed module/validator/generator stage owners.

Called by / expected callers: `tests/verification/behavior/verify.mjs` when `many-module-soak` is selected.

Environment variables / CLI inputs / config fields: No direct env reads. Fixture configs use `project`, `repo_root`, `default_timeout_minutes`, `default_max_fails`, `telemetry.enabled`, `models`, `_runId`/`run_id`, `_runStats`, `_pluginRegistry`, `_logDir`, `paths.swarm_dir`, `paths.modules_dir`, and `_testOverrides.pipelineRunner/moduleRunner`. Progress uses `execution_order`, `modules[*].dir/title/stages/test_suites/max_fails`, and empty `gates`.

Paths built/read/written: Temp `.swarm/modules/<module-dir>/status.json`; `.swarm/logs`; fake Redis telemetry stream `pipeline:telemetry:<project>:<runId>`.

Authority behavior: Pipeline scheduler must visit modules exactly in `execution_order`; typed worker control results drive retry/continue; lifecycle/status store owns status transitions and final status; generator stage owners run once after successful pipeline completion.

Error/retry/terminal behavior: Forge `request_fix` and Buster retryable `FAIL` each schedule one retry in the mixed soak; failed attempts increment `fail_count` and `fail_summaries`; final PASS clears `current_phase`. No terminal failure path remains after retry in scoped records.

Verification coverage: Strong integrated coverage for real module runner with typed worker stubs, validators, generators, status history, retry telemetry, and pipeline completion telemetry.

Findings: None found in scoped file.

### `tests/verification/behavior/areas/polling.mjs`

Role: Behavior area for generic polling cadence/throttling, Redis completion adapter resolution/adjudication, shared rate-limit builders/recovery, ACP session polling, file polling, status polling, transcript/progress telemetry, Discord rate-limit correlation, and observability degradation.

Imports/dependencies: Injected behavior deps, fake Redis, fake gateway, Git command execution, lifecycle service, git-context, polling service, rate-limit service, runtime core, built-in registry, and status files.

Exports/public surface: `registerPollingArea(deps)`.

Defines: `buildBuiltInRegistry(runtimeRootForRegistry)` and 38 records covering `pollGeneric`, Redis adapter resolution, rate-limit status/builders, `pollDual`, `pollForSessionEnd`, `pollForFile`, and `pollStatus`.

Important variables/state: Fake gateway request logs; tracked lifecycle agents; temp git repos with commits; temporary status/transcript files; fake Redis adapter modules; console error capture; `Date.now` override for throttle tests; fake Redis globals; `OPENCLAW_GATEWAY_URL`/`OPENCLAW_GATEWAY_TOKEN` save/restore; global `fetch` override for gateway failure.

Calls out to: `pollGeneric`, `archiveModuleCompletions`, rate-limit service builders/recovery, `pollDual`, `pollForSessionEnd`, `pollForFile`, `pollStatus`, lifecycle `trackAgent`/`untrackAgent`, git-context `setRepoRoot`, fake gateway `session_status`/`sessions_send`, fake Redis adapters, and telemetry streams.

Called by / expected callers: `tests/verification/behavior/verify.mjs` when `polling` is selected.

Environment variables / CLI inputs / config fields: Temporarily sets/restores `OPENCLAW_GATEWAY_URL`, `OPENCLAW_GATEWAY_TOKEN`, `global.fetch`, `Date.now`, and `console.error`. Fixture configs use `project`, `repo_root`, `poll_interval_seconds`, `poll_progress_log_interval_ms`, `session_progress_log_interval_ms`, `session_progress_emit_interval_ms`, `session_nudge_threshold`, `session_end_grace_ms`, `rate_limit.cooldown_hours`, `rate_limit.max_pauses_per_module`, `acp_monitor.poll_ms`, `acp_monitor.unknown_poll_limit`, `acp_monitor.stale_poll_limit`, `telemetry.enabled`, `_logDir`, `_runLogDir`, `_runId`/`run_id`, `_runStats`, `_pluginRegistry`, `paths.swarm_dir`, `paths.modules_dir`, and `agents.buster.dispatch`/`redis_js_path`.

Paths built/read/written: Temp git repos in `os.tmpdir()` and `/home/node/.openclaw/workspace/behavior-*`; `.swarm/modules/01-scaffold/status.json`; fake Redis adapter modules; transcript JSONL files; run log dirs; `discord.jsonl`; fake Redis telemetry stream `pipeline:telemetry:<project>:<runId>`.

Authority behavior: Immediate poll check precedes sleeping. Redis completion adapter resolution is per config. Redis completion is authoritative only with active dispatch confirmation and no local terminal conflict. Git-backed terminal/RATE_LIMITED statuses are legacy evidence in Redis-dispatch polling. Tracked ACP session correlation and live status correlation are preserved for transcript/progress/rate-limit telemetry.

Error/retry/terminal behavior: Covers timeout, rate-limited, rate-limit exhausted, session closed no changes, session ended no output, completion conflict, stale/unconfirmed Redis terminal ignored, timeout nudge capped at one failed send, transcript read degraded observability, gateway unreachable degraded observability, and exhausted gate-fix rate-limit returns.

Verification coverage: Very strong behavior coverage for polling loops, throttles, Redis completion authority, ACP monitor/session/fetch boundaries, Discord rate-limit correlation, and telemetry emitted for transcript/progress/observability/rate-limit events. Existing P17/P16 schema-owner issues remain relevant to Redis completion and telemetry payload schemas.

Findings: No new actionable issue found in scoped verification file; existing P16-ISSUE-001 and P17-ISSUE-001 remain applicable.

### `tests/verification/behavior/areas/redaction-surface.mjs`

Role: Behavior area for secret redaction across noncritical incidents, Nova telemetry/logs/Discord/module/gate artifacts, Buster telemetry/Discord/loggers, and Buster task/provider diagnostics.

Imports/dependencies: `pathToFileURL` plus injected fake Redis, fs/os/path/assert, materializer/importer, common redaction/noncritical helpers, Nova telemetry/Discord/status-store/runtime modules, Buster telemetry/Discord/logger/root pipeline modules.

Exports/public surface: `registerRedactionSurfaceArea(deps)`.

Defines: `listFiles(fs, path, root)`, `assertNoLeaks({ assert, fs, path, root, secrets })`, `buildBuiltInRegistry(runtimeRootForRegistry)`, and 5 records.

Important variables/state: Seeded secrets for bearer/api keys/password/token/cookie; temp `.swarm/logs`; fake Redis globals; generated prompt/transcript/Discord/telemetry artifacts; Buster logger degraded telemetry capture.

Calls out to: `normalizeNonBlockingErrorDetail`, `reportClassifiedNonBlockingError`, Nova `telemetry.emitEvent`, Nova `discord`, `statusStore.savePrompt`, `statusStore.saveStreamLog`, common `writeRedactedPromptArtifact`, `copyRedactedTranscriptArtifact`, Buster `createTelemetryContext`/`emitEvent`/`closeTelemetry`, Buster `sendDiscord`, Buster `createLogger`, `sanitizeBusterRuntimeDetail`, and `buildBusterProcessDiagnosticRecord`.

Called by / expected callers: `tests/verification/behavior/verify.mjs` when `redaction-surface` is selected.

Environment variables / CLI inputs / config fields: No direct env reads. Fixture configs use `project`, `repo_root`, `telemetry.enabled`, `_logDir`, `_runLogDir`, `_runId`/`run_id`, `_disable_discord_webhooks`, `discord_webhook_url`, `discord_alerts`, `_runStats`, `_pluginRegistry`, `paths.swarm_dir`, `paths.modules_dir`, and Buster telemetry/log context fields.

Paths built/read/written: `.swarm/logs/pipeline/pipeline.jsonl`; run-scoped `pipeline.jsonl`; top/run `discord.jsonl`; `.swarm/logs/modules/<id>/forge-prompt-attempt-1.md`; `.swarm/logs/modules/<id>/forge-transcript-attempt-1.jsonl`; `.swarm/logs/gates/review/echo-prompt-attempt-1.md`; gate transcript artifacts; Buster module log dirs; Buster `buster.jsonl`; process diagnostic artifacts.

Authority behavior: Common redaction helpers and runtime artifact writers must redact or summarize secret-bearing text before emitting telemetry, Discord audit rows, prompts, transcripts, JSONL logs, degraded telemetry details, and Buster diagnostic records. Prompt content is omitted by default for secret hygiene; transcript artifacts become summaries.

Error/retry/terminal behavior: Noncritical incident reporting returns true and emits one redacted fallback line. Buster logger path creation failure emits redacted `observability.degraded`. Buster task/provider errors are sanitized and source-text assertions prevent raw stack/message use.

Verification coverage: Strong seeded-secret no-leak assertions over all generated artifacts and fake Redis events.

Findings: None found in scoped file.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `verify.mjs` | `agent-lifecycle.mjs` | `registerAgentLifecycleArea(sharedAreaDeps)` | Registers agent lifecycle behavior records. |
| `verify.mjs` | `buster-runtime-normalization.mjs` | `registerBusterRuntimeNormalizationArea(sharedAreaDeps)` | Registers Buster runtime/queue/diagnostic behavior records. |
| `verify.mjs` | `deployment-surface.mjs` | `registerDeploymentSurfaceArea(sharedAreaDeps)` | Bridges deployment truth script into behavior suite. |
| `verify.mjs` | `discord-correlation.mjs` | `registerDiscordCorrelationArea(sharedAreaDeps)` | Registers Discord/correlation behavior records. |
| `verify.mjs` | `many-module-soak.mjs` | `registerManyModuleSoakArea(sharedAreaDeps)` | Registers many-module soak behavior records. |
| `verify.mjs` | `polling.mjs` | `registerPollingArea(sharedAreaDeps)` | Registers polling/rate-limit/completion behavior records. |
| `verify.mjs` | `redaction-surface.mjs` | `registerRedactionSurfaceArea(sharedAreaDeps)` | Registers redaction behavior records. |
| `agent-lifecycle.mjs` | Nova orchestration/lifecycle | `spawnAcpAgent`, `spawnReviewerAgent`, `killReviewerAgent`, `killAcpAgent`, `dispatchRedisTask`, `killSession` | Agent spawn/kill/dispatch contracts. |
| `buster-runtime-normalization.mjs` | Buster runtime modules | `monitorSession`, `validateBusterTaskPayload`, `processOneQueuedTask`, `recoverOrphanedActiveSession` | Buster identity/queue/recovery contracts. |
| `deployment-surface.mjs` | deployment verification | `check-deployment-truth.mjs` | Helm/deploy rendered truth bridge. |
| `discord-correlation.mjs` | Discord/failure/correlation services | `buildDiscordIdentityFields`, `discord`, `injectNeedsNova` | Operator identity/correlation contracts. |
| `many-module-soak.mjs` | pipeline runner/status/lifecycle | `runPipeline`, `transitionModuleStatus`, `buildPipelineStepResult` | Integrated full-pipeline soak. |
| `polling.mjs` | polling/rate-limit/lifecycle/gateway | `pollGeneric`, `pollDual`, `pollForSessionEnd`, `pollForFile`, `pollStatus` | Polling authority and telemetry contracts. |
| `redaction-surface.mjs` | redaction/telemetry/Discord/status/loggers | redaction artifact writers and telemetry/log emitters | Secret hygiene contracts. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `agent-lifecycle.mjs` spawn records | gateway `sessions_spawn` accepted vs rejected | `details.status`, child session key prefix/runtime | emits `agent.spawned` or throws spawn-failed with Discord evidence | Ensures ACP/subagent runtime semantics and failure correlation. |
| `agent-lifecycle.mjs` kill record | tracked runtime `subagent` vs `acp` | session key/runtime | `subagents kill` for subagent, `sessions_send` for ACP, no `acpx` fallback | Prevents mixed cleanup behavior. |
| `agent-lifecycle.mjs dispatchRedisTask` | configured adapter registered vs raw `redis_js_path` | `_testOverrides.adapters.redis`, `agents.buster.*` | direct adapter call or fail-closed error | Avoids temporary wrapper execution and unsafe arbitrary adapter path. |
| `buster-runtime-normalization.mjs validateBusterTaskPayload` | missing canonical identity | `project`, `run_id`, `attempt`, `dispatch_id`, `gate_id` | `BUSTER_TASK_MALFORMED` instead of invented fallbacks | Protects Buster completion/session identity. |
| `buster-runtime-normalization.mjs task queue` | process task throws and completion/dead-letter success/failure | fake Redis XADD outcomes | completion before ACK, dead-letter before ACK, or no ACK | Guarantees terminal signal before task acknowledgment. |
| `buster-runtime-normalization.mjs recoverOrphanedActiveSession` | kill confirmed, unconfirmed, or malformed file | gateway state and active-session JSON | delete confirmed/malformed file, preserve unconfirmed file | Preserves active-session evidence unless cleanup is proven. |
| `deployment-surface.mjs` | deployment check output includes required checks | parsed `checks[]`, `kubeconform.summary` | pass/fail behavior record | Keeps behavior surface tied to deployment truth script. |
| `discord-correlation.mjs` | field name `Label` vs `Gateway Label` | Discord audit fields | `Label` remains display-only; `Gateway Label` sets canonical correlation | Prevents display labels from becoming ACP correlation. |
| `many-module-soak.mjs` worker stubs | retry module and attempt | `forgeRetryOnceModules`, `busterRetryOnceModules`, `attempt` | request fix / retryable FAIL once, then PASS | Exercises real retry scheduler. |
| `polling.mjs pollGeneric` | first check done vs wait | poll callback result | immediate completion before sleep | Prevents unnecessary first-interval latency. |
| `polling.mjs pollDual` | Redis terminal identity confirmed and local status compatible | Redis completion fields, local `status.json`, expected dispatch | accept Redis terminal, timeout stale/unconfirmed evidence, or conflict | Defines Redis/local completion authority. |
| `polling.mjs pollForSessionEnd/File/Status` | session state, transcript rate limit/no output, timeouts | gateway state, transcript lines, tracked agent metadata | closed/no-output/rate-limited/exhausted/timeout results | Keeps ACP monitor outcomes correctly classified. |
| `redaction-surface.mjs assertNoLeaks` | generated artifact contains seeded secret | recursively read artifact text | assertion failure if leak found | Enforces end-to-end secret hygiene. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `agent-lifecycle.mjs` lifecycle records | tracked agent registry, Discord JSONL, Redis telemetry | gateway accepted session details, config/run identity | gateway/session key becomes canonical; label stays gateway/display label | Telemetry and Discord share run/session/gateway correlation. |
| `buster-runtime-normalization.mjs installQueuedTaskRedis` | fake Redis queue call log and delivery flags | payload/failure options | first `xreadgroup` delivers one payload; completion/dead-letter failures controlled by flags | Deterministic queue terminal guarantee assertions. |
| `buster-runtime-normalization.mjs recoverOrphanedActiveSession` | active-session file | active-session JSON, kill confirmation | delete only confirmed cleanup or malformed file; preserve unconfirmed | Evidence preservation after startup crash. |
| `many-module-soak.mjs withIntegratedModuleHappyPathStages` | module `status.json` | worker/validator/generator stage inputs | lifecycle transition to `READY_FOR_TESTING`/`PASS`; retry FAIL increments fail state; generator calls appended | Final statuses PASS in execution order. |
| `polling.mjs` rate-limit builders | result/status objects | observed status plus fallback/tracked correlation | observed strong fields win; tracked fallback fills sparse statuses; gateway label not invented from dispatch | Stable cooldown/exhaustion correlation. |
| `polling.mjs` lifecycle tracking | tracked agent metadata | `trackAgent` metadata and live status/status.json | live dispatch-backed status can override stale tracked dispatch; tracked label/session retained where appropriate | Transcript/progress telemetry uses preserved session identity. |
| `redaction-surface.mjs` redaction artifacts | telemetry/log/Discord/prompt/transcript JSONL and markdown | raw secret-bearing detail | secret strings replaced with redacted markers/hashes or summarized payloads | No seeded secret appears in generated artifacts. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `polling.mjs pollGeneric` | callback returns `{ done:false }` until done/timeout | `poll_interval_seconds`; progress log throttled by interval/logKey | timeout argument seconds | done result or timeout. |
| `polling.mjs pollDual` | Redis/local completion not authoritative | `poll_interval_seconds` | timeout argument seconds/minutes in tests | accepted Redis terminal, conflict, rate-limit, or timeout. |
| `polling.mjs pollForSessionEnd` | ACP session still running | `poll_interval_seconds`; session progress log throttle; optional cooldown recovery | timeout plus `session_end_grace_ms`; nudge threshold | closed/no-changes, rate-limit recovered/exhausted, timeout, or gateway/session error classification. |
| `polling.mjs pollForFile` | output file absent and session not terminal | `poll_interval_seconds`; ACP monitor progress throttle | timeout argument | output found, rate-limited/exhausted, session ended no output, timeout. |
| `polling.mjs pollStatus` | status target not reached and ACP/session monitor may be active | `poll_interval_seconds`; `acp_monitor` poll/unknown/stale limits | timeout argument | target reached, rate-limited/exhausted, no-change session end, conflict/degraded evidence. |
| `buster-runtime-normalization.mjs task queue` | one fake `xreadgroup` delivery | none in behavior fake | none in scoped fake | completion/dead-letter/ACK branch completes or throws terminal guarantee failure. |
| `many-module-soak.mjs` pipeline execution | modules in `execution_order` | no real sleeps; module runner `sleep` overridden | runner timeouts configured but not waited | completion after all modules/generators or retry scheduling. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `OPENCLAW_GATEWAY_URL` | Env var | `agent-lifecycle.mjs`, `buster-runtime-normalization.mjs`, `discord-correlation.mjs`, `polling.mjs` via gateway/runtime modules | fake gateway URL in tests | Restored after records. |
| `OPENCLAW_GATEWAY_TOKEN` | Env var | `polling.mjs` via gateway helpers | deleted/restore in tests | Verifies token absence is handled. |
| `PATH` | Env var | `agent-lifecycle.mjs` kill/dispatch wrapper guards | fake bin dir | Ensures `acpx`/`node` wrappers are not invoked where disallowed. |
| `BEHAVIOR_REDIS_DISPATCH_CALL_PATH` | Env var | fake Redis dispatch adapter in `agent-lifecycle.mjs` | temp JSON path | Captures direct adapter payload. |
| `agents.forge.*` | Config object | `agent-lifecycle.mjs` | per fixture | ACP/subagent cwd/model/thinking/timeout semantics. |
| `agents.buster.dispatch`, `redis_js_path`, `redis_adapter` | Config object | `agent-lifecycle.mjs`, `polling.mjs` | per fixture | Redis dispatch and completion adapter resolution. |
| `poll_interval_seconds` and poll log intervals | Config fields | `polling.mjs` through polling service | per fixture | Poll sleep cadence and progress-log throttling. |
| `session_end_grace_ms`, `session_nudge_threshold`, `session_progress_emit_interval_ms` | Config fields | `polling.mjs` | per fixture | Session polling terminal/nudge/progress behavior. |
| `rate_limit.cooldown_hours`, `max_pauses_per_module`, `max_pauses` | Config fields | `polling.mjs`, `buster-runtime-normalization.mjs` | per fixture | Cooldown/recovery/exhaustion behavior. |
| `_testOverrides.adapters.redis` | Test override | `agent-lifecycle.mjs`, `polling.mjs` | per fixture | Registered Redis adapter boundary. |
| `_testOverrides.pipelineRunner/moduleRunner` | Test override | `many-module-soak.mjs` | per fixture | Integrated pipeline/module runner seams. |
| `_runId`/`run_id`, `_runStats`, `_pluginRegistry`, `_logDir`, `_runLogDir`, `paths.*` | Runtime config | all V03a areas except simple deployment bridge | per fixture | Run identity, registry, log/artifact roots. |
| `--source-root` | CLI flag | `deployment-surface.mjs` invoking deployment check | `sourceRoot` | Deployment truth check input. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| `.swarm/logs/pipeline/discord.jsonl` and run-scoped `discord.jsonl` | Discord runtime/test configs | V03a assertions | Discord runtime | Operator audit/correlation evidence. |
| `.swarm/logs/pipeline/nova-injections.jsonl` and run-scoped copy | failure presentation service | `discord-correlation.mjs` | `injectNeedsNova` | Nova injection audit evidence. |
| `.swarm/modules/<module>/status.json` | status-store/lifecycle/polling fixtures | `many-module-soak.mjs`, `polling.mjs` | status-store/runtime/tests | Module state authority. |
| Fake Redis adapter modules | V03a fixtures | orchestration/polling runtime | tests | Adapter contract boundary for dispatch/completion. |
| Fake `node_modules/ioredis` | `buster-runtime-normalization.mjs` | Buster task queue runtime | test fixture | Queue behavior isolation. |
| Active-session JSON files | Buster runtime/tests | orphan recovery | Buster orphan recovery/tests | Preserved unless kill confirmed or malformed. |
| Transcript JSONL files | V03a fixtures | polling/redaction/monitor runtime | tests/redaction writers | ACP transcript/progress/rate-limit evidence. |
| Prompt/transcript redaction artifacts | status-store/redaction helpers | `redaction-surface.mjs` | runtime under test | Secret-safe artifacts; prompt content omitted/summarized. |
| `pipeline:telemetry:<project>:<runId>` | telemetry service/fake Redis | V03a assertions | runtime under test | Behavior telemetry stream. |
| Deployment truth script path | `deployment-surface.mjs` | Node `execFileSync` | none | Delegated deployment verification. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Agent spawn/kill lifecycle | Nova orchestration/lifecycle services | telemetry, Discord audit, tracked agents | None. |
| Redis task dispatch | registered Redis adapter selected per config | orchestration and tests | None. |
| Buster canonical task identity | Buster task payload validator/lifecycle | monitor, queue, completion, diagnostics | None. |
| Buster terminal queue guarantee | Buster task queue | Redis completion/dead-letter/ACK streams | None. |
| Deployment truth | `check-deployment-truth.mjs` | behavior deployment bridge | None. |
| Discord canonical correlation | `discord-fields.js` and correlation service | operator Discord/audit/failure/blueprint surfaces | None. |
| Many-module module status | status-store/lifecycle + typed worker results | pipeline scheduler/telemetry/tests | None. |
| Polling completion authority | polling/completion adjudicator/rate-limit services | module runner/gates/telemetry | Existing P17 tracks Redis completion schema owner. |
| Telemetry event payloads | telemetry builders/progress/services | fake Redis, JSONL artifacts, tests | Existing P16 tracks payload schema owner. |
| Secret redaction | common redaction helpers and runtime artifact writers | telemetry/log/Discord/artifact consumers | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| `agent.spawned` / `agent.killed` telemetry | orchestration/lifecycle | `type`, `agent_type`, `label`, `module_id` or `gate_id`, optional `gate_type`, `attempt`, `dispatch_id`, `session_key`, `dispatch`, `thinking_level` | telemetry service/builders | Redis stream, V03a assertions. |
| Discord identity fields | `buildDiscordIdentityFields` | array of `{ name, value, inline }` using `Run ID`, `Module`, `Gate`, `Gate Type`, `Phase`, `Attempt`, `Dispatch`, `Gateway Label`, `Session`, `Step Type`, `Step ID` | `DISCORD_FIELD_SPECS` | Discord operator surfaces. |
| Nova injection audit entry | failures presentation | `step_type`, `step_id`, `status`, `attempt`, `dispatch_id`, `gateway_label`, `session_key`, optional `gate_id`, `gate_type` | failure presentation/correlation service | JSONL audit and Discord tests. |
| Buster task payload | Buster validation | `task_type`, `module_id`/`module`, `project`, `run_id`, `attempt`, `dispatch_id`, optional `gate_id`, `gate_type`, `completion_stream`, `session` | `validateBusterTaskPayload` | Buster monitor/queue/completion. |
| Buster process diagnostic record | `buildBusterProcessDiagnosticRecord` | `type:'observability.degraded'`, `diagnostic_only:true`, `scope:'process'`, `component`, optional `surface`, `reason`, redacted `detail`, optional `project_hint`, no run-scoped `run_id`/`seq` | Buster runtime diagnostics | process health JSONL/log consumers. |
| Redis task queue completion/dead-letter | Buster task queue | completion stream XADD with terminal payload before ACK; dead-letter stream on fallback failure | task queue terminal guarantee logic | Redis consumers/operators. |
| Polling result objects | polling service | common keys `ok`/`completed`, `reason`, `status`, optional `run_id`, `attempt`, `dispatch_id`, `gateway_label`, `session_key`, `rate_limit_status`, `transcript` | polling/rate-limit normalizers | module/gate runners/tests. |
| Rate-limit status/result | rate-limit service | `status:'RATE_LIMITED'`, module/gate identity, `agent_type`, `run_id`, `attempt`, `dispatch_id`, `gateway_label`, `session_key`, `detail`/`reason`, pause counters and `max_rate_limit_pauses` when exhausted | rate-limit builders/recovery options | polling, Buster gate, Discord, telemetry. |
| Transcript/progress telemetry | polling/telemetry progress | `agent.transcript` or `agent.progress`, `agent_type`, `label`, `module_id` or `gate_id`, `gate_type`, `session_key`, `dispatch_id`, redacted/summarized text/progress fields | telemetry progress builders/redaction | Redis stream/operators/tests. |
| Many-module worker result | stub worker stage owners | `schemaVersion:'v1'`, `producerKind:'worker'`, `producerType`, `nextAction`, `diagnostics.summary`, `diagnostics.metadata.final_status/poll_result/gateway_label/session_key/attempt` | worker contract/runtime | module runner scheduler. |
| Generator/validator result | stub stage owners | validator: `schemaVersion`, `producerKind:'validator'`, `producerType`, `nextAction:'pass'`, diagnostics; generator: `producerKind:'generator'`, `producerType`, `outputs.status` | stage contracts | pipeline scheduler/generator assertions. |
| Redacted artifact records | redaction/telemetry/log/Discord writers | redacted markers `[redacted-secret]`, `[redacted-secret; sha256=<12>]`, `[redacted prompt;...]`, `[redacted payload;...]`, `transcript.summary` | common redaction helpers | artifact readers/operators/tests. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Forge ACP/subagent workers | `agent-lifecycle.mjs` orchestration fixtures | none directly; telemetry/Discord audit only | spawned with configured cwd/thinking/timeout | gateway `sessions_spawn` or `subagents` runtime | accepted child session or correlated spawn-failed error. |
| Reviewer/Nova injection behavior | failure presentation and reviewer lifecycle | `nova-injections.jsonl`, Discord audit rows | operator escalation/injection message | gateway `sessions_send` | canonical dispatch/gateway/session correlation. |
| Buster queued task worker | Buster task queue payload | Redis completion/dead-letter streams | no prompt in scoped fixture | Redis task payload and completion stream schema | terminal completion/dead-letter before ACK. |
| Many-module worker/validator/generator stubs | integrated registry stage owners | status files and telemetry | no prompt; typed stage owner inputs | stage-owner `run({ input })` | typed worker/validator/generator results. |
| Polling session monitor | polling service | transcript/progress telemetry, Discord rate-limit audit | no prompt; ACP session polling/nudge tools | `session_status`, `sessions_send`, Redis completion adapters | classified terminal/rate-limit/timeout result. |
| Redaction artifact writers | common redaction helpers | prompt/transcript/Discord/log artifacts | prompts are omitted by default for secret hygiene | filesystem artifact writer | redacted/summarized artifacts only. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `agent-lifecycle.mjs` spawn | gateway spawn rejected | No | no retry in record | throws spawn-failed and writes Discord evidence | runtime redaction only. |
| `agent-lifecycle.mjs` kill verification | session status check fails after stop | Observability recovery only | degraded/restored path, no real sleep | kill remains reported with degraded/restored evidence | runtime redaction only. |
| `agent-lifecycle.mjs` Redis adapter | unregistered `redis_js_path` | No | none | fail-closed error, no temporary wrapper execution | runtime redaction only. |
| `buster-runtime-normalization.mjs` task payload | missing canonical identity | No | none | `BUSTER_TASK_MALFORMED` / diagnostic behavior | Buster detail sanitizer covered. |
| `buster-runtime-normalization.mjs` task queue | task fails, completion and/or dead-letter may fail | fallback dead-letter only | completion attempted before ACK, then dead-letter fallback | ACK only after terminal evidence; both failing refuses ACK | diagnostic detail sanitized. |
| `buster-runtime-normalization.mjs` orphan recovery | unconfirmed or malformed active-session file | unconfirmed not retried in record | gateway fake state, no sleep | preserve unconfirmed file; remove malformed file after diagnostic | diagnostic detail sanitized. |
| `deployment-surface.mjs` deployment check | check script exits/fails output assertion | No | none | behavior record fails | n/a. |
| `discord-correlation.mjs` injection/correlation | gateway injection/audit or source contract drift | No | no retry | behavior assertion fails; drift prevented by source checks | runtime redaction only. |
| `many-module-soak.mjs` module attempts | one Forge request-fix or Buster retryable fail | Yes, once in fixture | retry scheduled by pipeline/module runner; no real sleep | final PASS after retry | runtime redaction only. |
| `polling.mjs` polling | timeout, stale Redis completion, conflict, gateway failure, no output, rate limit | Some via polling loops/recovery | `poll_interval_seconds`, progress/session throttles, grace/nudge thresholds | classified timeout/conflict/rate-limited/exhausted/degraded result | runtime redaction/progress summarization. |
| `redaction-surface.mjs` noncritical incident | secret-bearing nonblocking error | No | none | classified nonblocking report emits one fallback line | required redaction markers/hashes. |
| `redaction-surface.mjs` Buster logger | log directory creation failure | No | none | emits redacted `observability.degraded` | required redaction markers/hashes. |
| `redaction-surface.mjs` Buster provider/task error | secret-bearing detail/stack/message | No | none | sanitized diagnostic record; raw stack/message source use forbidden | required redaction markers/hashes. |

### Mandatory telemetry / observability rows

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `agent-lifecycle.mjs` spawn | gateway spawn rejected | Yes | Discord audit JSONL | spawn-failed Discord entry with run/session/gateway fields | orchestration Discord error path | No Redis event required for rejected spawn. |
| `agent-lifecycle.mjs` kill verification | session status failure after kill | Yes | fake Redis/Discord or lifecycle observability path | `observability.degraded`, `observability.restored`, kill evidence | lifecycle/session kill | Degraded/restored asserted. |
| `agent-lifecycle.mjs` Redis adapter | unregistered adapter path | Yes/partial | thrown error observed by behavior harness | fail-closed error text | `dispatchRedisTask` | No Redis telemetry because adapter is rejected before dispatch. |
| `buster-runtime-normalization.mjs` malformed payload | missing identity | Yes | diagnostic/result object | `BUSTER_TASK_MALFORMED` / process diagnostic | Buster validator/diagnostic builder | Schema identity protected. |
| `buster-runtime-normalization.mjs` queue terminal guarantee | task/completion/dead-letter failure | Yes | Redis completion/dead-letter streams or thrown error | completion stream, dead-letter stream, no-ACK error | Buster task queue | ACK refused when terminal evidence cannot be recorded. |
| `buster-runtime-normalization.mjs` orphan recovery | unconfirmed/malformed active session | Yes | process diagnostics/gateway request log | orphan recovery diagnostic and active-session file outcome | Buster startup recovery | Unconfirmed file preserved. |
| `deployment-surface.mjs` deployment check | script failure | Yes/partial | behavior harness stderr | failed behavior record | behavior harness / execFileSync | Delegated script owns detailed diagnostics. |
| `discord-correlation.mjs` injection drift | injection/audit/source mismatch | Yes | gateway request log, `nova-injections.jsonl`, Discord audit | Nova injection audit rows | failure presentation service | Source checks prevent helper drift. |
| `many-module-soak.mjs` retry attempts | Forge/Buster retryable attempt | Yes | fake Redis and status history | module retry/status/pipeline telemetry | pipeline/module runner | Final PASS asserted after retry. |
| `polling.mjs` timeout/rate-limit/degraded | timeout, stale/conflict, no output, gateway unreachable | Yes | fake Redis, Discord audit, status/transcript evidence | `agent.progress`, `agent.transcript`, `observability.degraded`, rate-limit Discord fields | polling/rate-limit services | Existing P16/P17 track schema ownership gaps. |
| `redaction-surface.mjs` noncritical incident | secret error detail | Yes | fallback emitted line | classified nonblocking incident line | `reportClassifiedNonBlockingError` | Redacted hash marker asserted. |
| `redaction-surface.mjs` logger failure | path creation blocked | Yes | captured telemetry callback | `observability.degraded` | Buster logger | Redacted telemetry asserted. |
| `redaction-surface.mjs` Buster provider/task | secret-bearing detail | Yes | diagnostic record/log source checks | sanitized diagnostic detail | Buster pipeline diagnostic helpers | Raw stack/message usage forbidden by source assertions. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js | Runtime binary | Node runtime | all V03a areas | ESM execution, `execFileSync`, filesystem/temp helpers | Required by harness. |
| Fake Redis helpers | verification helper | local source | `agent-lifecycle.mjs`, `many-module-soak.mjs`, `polling.mjs`, `redaction-surface.mjs` | Telemetry streams, adapters, completion queues | Globals reset between records. |
| Fake gateway server | verification helper | local HTTP server | `agent-lifecycle.mjs`, `buster-runtime-normalization.mjs`, `discord-correlation.mjs`, `polling.mjs` | ACP session/status/send surfaces | Controlled failures exercise recovery. |
| Materialized runtime tree | lifecycle-audit helper | local source copy | V03a runtime-heavy areas | Imports Nova/Buster runtime modules | Import/source drift fails records. |
| Fake `ioredis` module | test fixture module | local fixture | `buster-runtime-normalization.mjs` | Queue terminal guarantee isolation | Injected under materialized runtime. |
| Git binary | host binary | host version | `polling.mjs` | Git-backed terminal/RATE_LIMITED status evidence | Fixture repos created in temp workspace. |
| Helm/deployment verification script | repo script | local source | `deployment-surface.mjs` | Deployment truth bridge | Script failure fails area. |
| Common redaction helpers | repo source | local source | `redaction-surface.mjs` | Secret hygiene for artifacts/telemetry/logs | Source/runtime no-leak assertions. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Agent lifecycle dispatch | one fake gateway request per spawn/kill record | fixture configs | rejected spawn fails with audit; kill verifies stop state | Discord/Redis/gateway request logs | None. |
| Buster task queue | Redis group single-delivery fake | queue payload/completion stream | terminal completion/dead-letter required before ACK | Redis call log/dead-letter evidence | None. |
| Many-module soak | 8/10/12 module execution order | progress `execution_order` | retry once for selected modules, then continue | status history and telemetry | None. |
| Polling loops | poll intervals, progress/session emit throttles, nudge threshold | `poll_interval_seconds`, `*_interval_ms`, `session_nudge_threshold` | timeout/rate-limit/degraded classifications; one capped failed nudge | progress/transcript/observability telemetry | None. |
| Redis completion adjudication | one completion stream per dispatch | adapter config/dispatch id | stale/unconfirmed/conflicting terminals ignored or conflict | Redis archive/completion evidence | Existing P17 schema-owner issue. |
| Redaction artifact generation | recursive artifact scan after writes | no concurrency limit in scoped file | assertion fails on first seeded secret leak | no-leak scan and redaction markers | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Agent spawn | gateway `sessions_spawn`/subagent args include cwd, timeout, thinking/runtime details | orchestration service | fake gateway/subagent runtime | no retry in scoped record | gateway request log, `agent.spawned`. |
| Agent kill | `sessions_send` stop for ACP; `subagents kill` for subagent | lifecycle/orchestration | fake gateway/subagent runtime | post-kill status can emit degraded/restored | request log, `agent.killed`, Discord audit. |
| Nova injection | gateway `sessions_send` with canonical dispatch/gateway/session fields | failure presentation service | fake gateway | no retry in scoped record | gateway request log and `nova-injections.jsonl`. |
| Buster monitor/session | active-session file plus gateway/session state | Buster runtime | gateway monitor/recovery | monitor poll config in fixtures | monitor deltas and process diagnostics. |
| Polling session monitor | `session_status`, optional `sessions_send` nudge, transcript/progress records | polling service | fake gateway and Redis telemetry | throttled by session progress/nudge configs | `agent.progress`, `agent.transcript`, rate-limit Discord evidence. |
| Redis dispatch/completion | adapter payload/completion stream includes project/run/module/attempt/dispatch/session | orchestration/Buster/polling | Redis adapter/fake Redis | per-config adapter resolution, completion archived | adapter call JSON, Redis stream events. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Agent lifecycle spawn/kill/dispatch | `tests/verification/behavior/areas/agent-lifecycle.mjs` | High for fake gateway/subagent/Redis adapter behavior | None found. |
| Buster runtime normalization/queue/recovery | `tests/verification/behavior/areas/buster-runtime-normalization.mjs` | High for source/runtime/queue/orphan branches | None found. |
| Deployment truth behavior bridge | `tests/verification/behavior/areas/deployment-surface.mjs` | Medium; delegates to deployment script | None found. |
| Discord correlation | `tests/verification/behavior/areas/discord-correlation.mjs` | High for field/audit/source contracts | None found. |
| Many-module soak | `tests/verification/behavior/areas/many-module-soak.mjs` | High for integrated multi-module scheduler/status/retry/generator behavior | None found. |
| Polling/rate-limit/Redis completion | `tests/verification/behavior/areas/polling.mjs` | Very high for polling loops and authority branches | Existing P16/P17 schema-owner issues remain applicable. |
| Redaction surface | `tests/verification/behavior/areas/redaction-surface.mjs` | High for seeded secret no-leak over generated artifacts | None found. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- P16-ISSUE-001 remains open and applicable to polling telemetry payload schema ownership.
- P17-ISSUE-001 remains open and applicable to Redis completion schema ownership/adjudication.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
