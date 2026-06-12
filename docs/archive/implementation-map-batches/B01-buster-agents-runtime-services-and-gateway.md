# Batch B01 — Buster agents, runtime services, and gateway

Status: completed
Date started: 2026-05-09
Date completed: 2026-05-09
Reviewer: Nova

## Scope

```text
skills/buster/pipeline/agents/*.js
skills/buster/pipeline/integrations/gateway.js
skills/buster/pipeline/services/gateway-health.js
skills/buster/pipeline/services/logger.js
skills/buster/pipeline/services/runtime.js
skills/buster/pipeline/services/runtime-diagnostics.js
skills/buster/pipeline/services/session-monitor.js
```

Scope expansion verified live: 10 files, at the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/buster/pipeline/agents/acp-monitor.js
kubeclaw-main/skills/buster/pipeline/agents/lifecycle.js
kubeclaw-main/skills/buster/pipeline/agents/runtime.js
kubeclaw-main/skills/buster/pipeline/agents/session-semantics.js
kubeclaw-main/skills/buster/pipeline/integrations/gateway.js
kubeclaw-main/skills/buster/pipeline/services/gateway-health.js
kubeclaw-main/skills/buster/pipeline/services/logger.js
kubeclaw-main/skills/buster/pipeline/services/runtime-diagnostics.js
kubeclaw-main/skills/buster/pipeline/services/runtime.js
kubeclaw-main/skills/buster/pipeline/services/session-monitor.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/contracts/check-buster-pipeline-slice-surface.mjs
kubeclaw-main/tests/verification/contracts/check-common-helper-import-surface.mjs
kubeclaw-main/tests/verification/contracts/check-buster-operator-surface.mjs
kubeclaw-main/tests/verification/contracts/check-observability-catch-reporting.mjs
kubeclaw-main/tests/verification/runtime/check-buster-startup-smoke.mjs
kubeclaw-main/tests/verification/behavior/areas/buster-runtime-normalization.mjs
kubeclaw-main/tests/verification/behavior/areas/runtime-monitor.mjs
```

## Per-file map

### `skills/buster/pipeline/agents/acp-monitor.js`

Role: Repo-local compatibility facade for the shared ACP monitor helper.

Imports/dependencies: `../../../common/pipeline/agents/acp-monitor.js`.

Exports/public surface: Re-exports every common ACP monitor export.

Defines: No local logic.

Important variables/state: None.

Calls out to: Common helper module.

Called by / expected callers: `services/session-monitor.js`, `services/rate-limit.js`, `buster-pipeline.js` re-export surface, and Buster runtime/session verification.

Environment variables / CLI inputs / config fields: Delegated to common helper.

Paths built/read/written: None locally.

Authority behavior: Shim only; canonical implementation lives under `skills/common/pipeline` and the comment says production images overwrite this path.

Error/retry/terminal behavior: Import failure is a module-load failure; runtime behavior delegated.

Verification coverage: `check-common-helper-import-surface.mjs`; Buster runtime normalization behavior checks production-local imports.

Findings: None.

### `skills/buster/pipeline/agents/lifecycle.js`

Role: Repo-local compatibility facade for shared ACP/session lifecycle helpers.

Imports/dependencies: `../../../common/pipeline/agents/lifecycle.js`.

Exports/public surface: Re-exports every common lifecycle export.

Defines: No local logic.

Important variables/state: None locally.

Calls out to: Common helper module.

Called by / expected callers: `buster-pipeline.js`, `services/session-monitor.js`, orphan recovery, rate-limit/session lifecycle callers.

Environment variables / CLI inputs / config fields: Delegated to common helper.

Paths built/read/written: None locally.

Authority behavior: Shim only; active-session lifecycle authority is delegated.

Error/retry/terminal behavior: Import failure only locally.

Verification coverage: `check-common-helper-import-surface.mjs`, `check-buster-pipeline-slice-surface.mjs`, startup smoke.

Findings: None.

### `skills/buster/pipeline/agents/runtime.js`

Role: Repo-local compatibility facade for shared agent runtime helper.

Imports/dependencies: `../../../common/pipeline/agents/runtime.js`.

Exports/public surface: Re-exports every common runtime export.

Defines: No local logic.

Important variables/state: None locally.

Calls out to: Common helper module.

Called by / expected callers: Buster runtime code that imports the production `/app/skills/pipeline/agents/runtime.js` surface.

Environment variables / CLI inputs / config fields: Delegated.

Paths built/read/written: None locally.

Authority behavior: Shim only.

Error/retry/terminal behavior: Import failure only locally.

Verification coverage: Common helper import surface.

Findings: None.

### `skills/buster/pipeline/agents/session-semantics.js`

Role: Repo-local compatibility facade for shared session semantics helpers.

Imports/dependencies: `../../../common/pipeline/agents/session-semantics.js`.

Exports/public surface: Re-exports every common session semantics export.

Defines: No local logic.

Important variables/state: None locally.

Calls out to: Common helper module.

Called by / expected callers: Buster code needing shared session terminal/state semantics.

Environment variables / CLI inputs / config fields: Delegated.

Paths built/read/written: None locally.

Authority behavior: Shim only.

Error/retry/terminal behavior: Import failure only locally.

Verification coverage: Common helper import surface.

Findings: None.

### `skills/buster/pipeline/integrations/gateway.js`

Role: Repo-local compatibility facade for shared gateway integration helpers.

Imports/dependencies: `../../../common/pipeline/integrations/gateway.js`.

Exports/public surface: Re-exports every common gateway export.

Defines: No local logic.

Important variables/state: None locally.

Calls out to: Common helper module.

Called by / expected callers: `buster-pipeline.js`, `services/gateway-health.js`, `services/session-monitor.js`, Buster runtime tests.

Environment variables / CLI inputs / config fields: Delegated to common gateway helper; Buster code calls the shim for gateway URL/token resolution rather than reading token env directly.

Paths built/read/written: None locally.

Authority behavior: Shim only; gateway endpoint/token resolution delegated.

Error/retry/terminal behavior: Import failure only locally.

Verification coverage: `check-common-helper-import-surface.mjs`, `buster-runtime-normalization.mjs`.

Findings: None.

### `skills/buster/pipeline/services/gateway-health.js`

Role: Gateway readiness wait and periodic gateway liveness monitor for the Buster process.

Imports/dependencies: `resolveGatewayHealthUrl` from `../integrations/gateway.js`; Node/global `fetch`; `AbortSignal.timeout`; `setInterval`; caller-provided `shutdown`.

Exports/public surface: `GATEWAY_READY_TIMEOUT`, `GATEWAY_READY_INTERVAL`, `GATEWAY_HEALTH_INTERVAL`, `GATEWAY_HEALTH_MAX_FAILURES`, `checkGatewayHealth()`, `waitForGateway({ shutdown })`, `startGatewayHealthMonitor({ isShuttingDown, shutdown })`.

Defines: Readiness timeout 120000 ms, readiness poll interval 3000 ms, periodic health interval 60000 ms, and max consecutive health failures 3.

Important variables/state: `startGatewayHealthMonitor` keeps `consecutiveFailures` in closure scope and resets it after a healthy probe.

Calls out to: Gateway `/health` URL through `fetch(resolveGatewayHealthUrl(), { signal: AbortSignal.timeout(5000) })`; caller `shutdown()` on readiness timeout or periodic failure.

Called by / expected callers: `buster-pipeline.js` startup and health-monitor paths; covered by Buster pipeline slice tests.

Environment variables / CLI inputs / config fields: Reads no environment directly; gateway URL resolution is delegated to `../integrations/gateway.js`.

Paths built/read/written: None.

Authority behavior: Does not own task/session authority; triggers structured process shutdown with reason and detail when gateway readiness/health policy fails.

Error/retry/terminal behavior: `checkGatewayHealth` catches any fetch/timeout error and returns `false`. `waitForGateway` polls until success or 120s deadline, then calls `shutdown('GATEWAY_READY_TIMEOUT', { exitCode:1, cleanupStage:'gateway-ready-timeout', reason:'gateway_ready_timeout', detail, emitGatewayDegraded:true })`. Periodic monitor increments consecutive failures and calls `shutdown('GATEWAY_HEALTH_FAILED', { exitCode:1, cleanupStage:'gateway-health-failed', reason:'gateway_unreachable', detail, emitGatewayDegraded:true })` after three failures.

Verification coverage: `check-buster-pipeline-slice-surface.mjs` asserts gateway failures route through structured shutdown; `buster-runtime-normalization.mjs` checks normalized gateway imports and no hard `process.exit(1)`.

Findings: None.

### `skills/buster/pipeline/services/logger.js`

Role: Per-task structured logger that writes human-readable stdout and optional compact JSONL log file entries.

Imports/dependencies: Node `fs.appendFileSync`, `fs.mkdirSync`, `path.dirname`; noncritical reporting helpers from `../noncritical-reporting.js`.

Exports/public surface: `createLogger(opts)`.

Defines: Secret-key regex `/(?:token|secret|password|authorization|api[_-]?key|cookie|oauth)/i`; logger methods `info`, `warn`, `error`, `step`, `flush`.

Important variables/state: Per-logger `currentStep`, `loggerDegraded`, and `loggerDegradedReason`; options such as `logPath`, `module`, `taskType`, optional telemetry/correlation fields.

Calls out to: `mkdirSync(dirname(logPath), { recursive:true })`, `appendFileSync(logPath, JSON.stringify(entry)+'\n')`, `console.log`, `process.stderr.write`, optional `opts.emitTelemetry`, and noncritical incident reporter.

Called by / expected callers: Buster task lifecycle/services and `session-monitor.js`; behavior tests import the runtime logger surface.

Environment variables / CLI inputs / config fields: No direct env/CLI reads; uses runtime options `logPath`, `module`, `taskType`, `emitTelemetry`, `moduleId`, `gateId`, `attempt`, `dispatchId`, `sessionKey`.

Paths built/read/written: Parent directory of `logPath`; appends JSONL entries to `logPath` when supplied.

Authority behavior: Observability/logging only; log file is not task or lifecycle authority.

Error/retry/terminal behavior: Directory creation and append failures are non-terminal. First degraded append/create failure can emit `observability.degraded`; restored append emits `observability.restored`. Incident reporting is deduped by noncritical-reporting keys. `flush()` is intentionally no-op because writes are synchronous.

Verification coverage: `check-observability-catch-reporting.mjs` includes this file in no-empty-catch checks; `buster-runtime-normalization.mjs` checks lower-risk cleanup catches and logger behavior; redaction/operator behavior tests import logger runtime surface.

Findings: None.

### `skills/buster/pipeline/services/runtime-diagnostics.js`

Role: Sanitized diagnostic-record helpers for malformed tasks and process/runtime health.

Imports/dependencies: Node `fs`, `path.join`; `sanitizeNonBlockingErrorDetail`; `normalizeRequiredIdentity` from task validation.

Exports/public surface: `sanitizeBusterRuntimeDetail`, `safeErrorMessage`, `buildBusterProcessDiagnosticRecord`, `appendMalformedTaskArtifact`, `appendBusterProcessDiagnostic`, `reportBusterRuntimeDiagnostic`.

Defines: Diagnostic JSON shapes for process-health and malformed-task JSONL artifacts.

Important variables/state: No persistent in-memory state; defaults `projectHint` from `process.env.BUSTER_PROJECT` and timestamp from `new Date().toISOString()`.

Calls out to: `.swarm/logs/buster` directory creation, append to `malformed-tasks.jsonl` and `process-health.jsonl`, stderr fallback, and `console.warn` for runtime diagnostics.

Called by / expected callers: `buster-pipeline.js` startup/shutdown/error paths and task validation/lifecycle error handling.

Environment variables / CLI inputs / config fields: `process.env.BUSTER_PROJECT` as diagnostic-only project hint when caller does not pass `projectHint`.

Paths built/read/written: `.swarm/logs/buster/malformed-tasks.jsonl`; `.swarm/logs/buster/process-health.jsonl`.

Authority behavior: Diagnostic-only process scope. `buildBusterProcessDiagnosticRecord` marks records `diagnostic_only:true`, `scope:'process'`, `source:'buster'`, `emitter:'buster/buster-pipeline'` and does not include canonical run `seq`/`run_id` authority fields.

Error/retry/terminal behavior: Diagnostic artifact append failures are caught and reported to stderr using sanitized detail; stderr write failure is swallowed to avoid blocking poison-message acknowledgement or shutdown/cleanup.

Verification coverage: `buster-runtime-normalization.mjs` asserts diagnostic-only process record shape and no run/seq fields; startup smoke re-exports diagnostic helpers.

Findings: None.

### `skills/buster/pipeline/services/runtime.js`

Role: Runtime dependency loader for Redis constructor and Discord webhook URL resolution.

Imports/dependencies: Node `module.createRequire`.

Exports/public surface: `requireFirst(candidates)`, `loadRedisCtor()`, `resolveDiscordWebhookUrl(override = null)`.

Defines: Candidate Redis module lookup order: `ioredis`, `/app/node_modules/ioredis`, `/usr/local/lib/node_modules/ioredis`.

Important variables/state: `require` bound to module URL; no mutable runtime state.

Calls out to: CommonJS `require(candidate)` for each candidate; `process.env.DISCORD_WEBHOOK_URL`, `process.env.DISCORD_WEBHOOK`.

Called by / expected callers: Buster Redis tool/task queue telemetry services and visual-reg suite for webhook resolution.

Environment variables / CLI inputs / config fields: `DISCORD_WEBHOOK_URL`, `DISCORD_WEBHOOK`; optional function `override` wins over env.

Paths built/read/written: None.

Authority behavior: Dependency/config helper only.

Error/retry/terminal behavior: `requireFirst` tries candidates in order, stores the last caught error, and throws the last error if all candidates fail. No telemetry locally.

Verification coverage: Buster package/runtime smoke and tool/suite behavior cover import availability indirectly.

Findings: None.

### `skills/buster/pipeline/services/session-monitor.js`

Role: Monitor one Buster ACP child session until terminal, hard timeout, or rate-limit terminal condition while publishing Buster telemetry and transcript deltas.

Imports/dependencies: ACP monitor shim (`getAcpMonitorConfig`, `getAcpMonitorState`, `isSessionTerminal`, `publishTranscriptDelta`), lifecycle `killSession`, gateway integration URL/token resolvers, Buster telemetry `emitEvent`, Buster rate-limit service, logger, `sleep` helper.

Exports/public surface: `monitorSession(childSessionKey, streamLogPath, payload = {}, tctx = null, meta = {})`.

Defines: Internal `buildRateLimitStatus(rlState)` and nested `enforceHardTimeout(lastState)`.

Important variables/state: Monitor config, `moduleId`, `spawnedAt`, injected test hooks, hard timeout deadline, `killGraceMs`, gateway URL/token, rate-limit state, `prev` ACP state, `pollCount`, `gatewayDegradedAt`.

Calls out to: ACP state polling, telemetry events, transcript delta publication, rate-limit cooldown/resume helper, session kill helper, logger, sleep.

Called by / expected callers: Buster task lifecycle/session services and `buster-pipeline.js` public `monitorSession` export.

Environment variables / CLI inputs / config fields: Payload/meta fields `payload.acp_monitor`, `payload.rate_limit`, `payload.timeout_seconds`, `payload.session.timeout_seconds`, `payload.session.runtime/model/agentId/label`, `payload.module_id`, `payload.gate_id`, `payload.gate_type`, `payload.project`, `payload.attempt`, `payload.dispatch_id`; no direct environment reads.

Paths built/read/written: Reads ACP stream log through `getAcpMonitorState(childSessionKey, streamLogPath, prev, opts)`; no direct filesystem writes in this file.

Authority behavior: Returns monitor evidence but does not itself finalize Buster task completion; completion authority remains with task lifecycle/artifact readers. It owns canonical Buster child-session pause telemetry by passing `ownsCanonicalSignal:true` to rate-limit recovery.

Error/retry/terminal behavior: Poll loop emits `buster.session_monitor` every poll. Gateway unreachable state emits `observability.degraded` once and emits `observability.restored` after a later reachable state. Transcript lines publish `agent.transcript`. Rate-limit state pauses through `handleRateLimit`; recovery `resume` clears `rateLimited` in `prev`; exhausted/non-resume returns `{ terminal:false, reason:'rate_limited', ... rate_limit_status }`. Hard timeout calls `killSession` and waits up to `killGraceMs`, returning `session_timeout_kill_failed`, `session_timeout_kill_confirmed`, or `session_timeout_kill_unconfirmed`. Terminal ACP state returns `{ terminal:true, reason, detail, state }`.

Verification coverage: `check-buster-pipeline-slice-surface.mjs` asserts exported monitor surface, canonical transcript identity, monitor exception handling in lifecycle, and rate-limit status return. `runtime-monitor.mjs` covers rate-limit gateway degrade/restore events. `buster-runtime-normalization.mjs` covers imports, identity, diagnostic scoping, and monitor behavior.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `services/gateway-health.js` | `integrations/gateway.js` | `resolveGatewayHealthUrl` | Builds the gateway health URL through the shared shim. |
| `services/session-monitor.js` | `agents/acp-monitor.js` | `getAcpMonitorConfig`, `getAcpMonitorState`, `isSessionTerminal`, `publishTranscriptDelta` | Polls session state and publishes transcript deltas through the common ACP monitor facade. |
| `services/session-monitor.js` | `agents/lifecycle.js` | `killSession` | Hard-timeout enforcement attempts explicit session kill. |
| `services/session-monitor.js` | `integrations/gateway.js` | `resolveGatewayBaseUrl`, `resolveGatewayToken` | Supplies gateway context to ACP monitor and rate-limit recovery. |
| `services/session-monitor.js` | `services/rate-limit.js` | `createRateLimitState`, `shouldRetryAfterRateLimit`, `handleRateLimit` | Owns Buster child-session pause loop and terminal rate-limit status. |
| `services/session-monitor.js` | `services/telemetry.js` | `emitEvent` | Emits session monitor, observability, and transcript telemetry. |
| `services/session-monitor.js` | `services/logger.js` | `createLogger` | Uses default structured logger when caller does not pass one. |
| `services/logger.js` | `noncritical-reporting.js` | incident/reporting helpers | Non-terminal logger filesystem failures become classified incidents. |
| `services/runtime-diagnostics.js` | `task-validation.js` | `normalizeRequiredIdentity` | Normalizes diagnostic-only project hints. |
| `services/runtime.js` | Node CommonJS loader | `requireFirst`, `loadRedisCtor` | Runtime Redis dependency resolution. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `gateway-health.js checkGatewayHealth` | `fetch(...).ok` vs thrown/timeout error | Gateway health HTTP response or exception | Return `true` only for `res.ok`, otherwise `false` | Collapses network/timeout/status errors into readiness boolean. |
| `gateway-health.js waitForGateway` | Health succeeds before deadline | `Date.now() < deadline`, `checkGatewayHealth()` | Return on success; otherwise shutdown with `GATEWAY_READY_TIMEOUT` | Buster startup must not enter queue loop before gateway readiness. |
| `gateway-health.js startGatewayHealthMonitor` | Consecutive unhealthy count reaches 3 | `consecutiveFailures`, `isShuttingDown()` | Structured shutdown with `GATEWAY_HEALTH_FAILED` | Periodic liveness fail-fast path. |
| `logger.js sanitizeLoggerValue` | Value type and secret-like key | key regex, value type | Recursively sanitize secret-bearing values; preserve booleans/numbers unless secret key | Prevents log JSON from writing obvious secrets. |
| `logger.js write` | `data` is non-empty object | optional `data` | Include sanitized `entry.data`; otherwise omit | Keeps JSONL shape compact and redacted. |
| `runtime-diagnostics.js normalizeDiagnosticDetail` | Detail type | string, error.message, JSON serializable, fallback string | Sanitized detail or null | Keeps diagnostic artifact safe and non-throwing. |
| `runtime.js requireFirst` | Candidate requires successfully | Ordered candidate list | Return first module; throw last error if none load | Supports container/global dependency fallbacks. |
| `session-monitor.js monitorSession` | Hard deadline reached before/after poll | `hardDeadlineMs`, injected `now()` | Route to `enforceHardTimeout(prev)` | Bounds stuck sessions and attempts explicit kill. |
| `session-monitor.js monitorSession` | Gateway unreachable transitions | `state.gatewayUnreachable`, `gatewayDegradedAt` | Emit degraded once, restored after reachable state | Avoids duplicate degraded events and records recovery. |
| `session-monitor.js monitorSession` | `state.rateLimited` | ACP monitor state and pause budget | Exhaust terminal or invoke cooldown/recovery | Keeps Buster-owned rate-limit pause semantics local to child-session monitor. |
| `session-monitor.js monitorSession` | `isSessionTerminal(state)` | ACP monitor terminal semantics | Return terminal result | Normal completion path. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `gateway-health.js startGatewayHealthMonitor` | Closure `consecutiveFailures` | Health result | Increment on failure; reset to 0 after any success | Shutdown only after configured consecutive failures. |
| `logger.js createLogger/write` | Closure `currentStep` | `step(stepName)` calls | Set current step before writing STEP entry; later entries inherit | Log entries carry current step. |
| `logger.js write` | Closure `loggerDegraded`, `loggerDegradedReason` | append success/failure and optional telemetry | First failure marks degraded; next successful append restores and clears reason | Emits degraded/restored at most around actual append health transitions when telemetry hook exists. |
| `session-monitor.js monitorSession` | `prev` ACP state | latest state and recovery result | Normal loop assigns `prev = state`; rate-limit resume copies state but clears `rateLimited` and transcript `rateLimited` while preserving gateway flags | Avoids immediately re-processing a recovered rate-limit state. |
| `session-monitor.js monitorSession` | `gatewayDegradedAt` | gateway unreachable/restored observations | Set first degraded timestamp; clear after restored event | Degraded/restored event pairing. |
| `session-monitor.js enforceHardTimeout` | `observedState` | repeated post-kill ACP polls | Replace with latest observed state until terminal/idle/error/no_session_key or grace expires | Timeout result includes final observed state. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `gateway-health.js waitForGateway` | `Date.now() < Date.now()+120000` | `GATEWAY_READY_INTERVAL` 3000 ms | Fixed readiness timeout 120s | Health success returns; deadline calls structured shutdown. |
| `gateway-health.js startGatewayHealthMonitor` | `setInterval` every 60000 ms | Fixed periodic interval | No absolute deadline | Skips while shutting down; shutdown after 3 consecutive failures. |
| `session-monitor.js monitorSession` | `while (true)` | `cfg.monitorPollMs`, clipped to hard deadline | `spawnedAt + timeoutSeconds*1000` if timeout > 0 | Hard timeout, rate-limit terminal, ACP terminal. |
| `session-monitor.js enforceHardTimeout` | `now() < killDeadlineMs` | `min(cfg.monitorPollMs, remainingKillMs)` | `now() + max(payload/meta kill_grace_ms or 15000, cfg.monitorPollMs)` | Terminal/closed/error/idle/no_session_key confirms; grace expiry unconfirmed. |
| `session-monitor.js rate-limit recovery` | Delegated to `handleRateLimit` | Service cooldown config | `max_pauses`, initial/max cooldown from payload rate-limit config | Resume continues monitor; non-resume/exhaust returns terminal rate-limited monitor result. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `GATEWAY_URL`, `GATEWAY_TOKEN` | Env/config delegated to gateway shim | `gateway-health.js`, `session-monitor.js` via gateway helper functions | Common gateway helper defaults | B01 files do not read env directly for gateway access. |
| `DISCORD_WEBHOOK_URL`, `DISCORD_WEBHOOK` | Env vars | `runtime.js resolveDiscordWebhookUrl` | Function override first, then env, then `null` | Shared Buster webhook resolution helper. |
| `BUSTER_PROJECT` | Env var | `runtime-diagnostics.js buildBusterProcessDiagnosticRecord` | `null` after normalization when absent/invalid | Diagnostic-only `project_hint`, not canonical run identity. |
| `payload.acp_monitor.monitor_poll_ms`, `unknownPollLimit`, `stalePollLimit`, `kill_grace_ms`, `max_rate_limit_pauses` | Task payload config | `session-monitor.js` | Common ACP monitor defaults; kill grace 15000 ms minimum/clipped to monitor poll | Monitor cadence, stale/unknown behavior, kill grace. |
| `payload.rate_limit.max_pauses`, `initial_cooldown_s`, `max_cooldown_s` | Task payload config | `session-monitor.js` | max pauses 3, initial cooldown 120s, max cooldown 600s | Buster child-session rate-limit policy. |
| `payload.timeout_seconds`, `payload.session.timeout_seconds`, `meta.timeoutSeconds` | Runtime/task input | `session-monitor.js` | `0` disables hard deadline | `meta.timeoutSeconds` takes precedence over payload fields. |
| `opts.logPath`, `module`, `taskType`, `emitTelemetry`, correlation option fields | Runtime options | `logger.js createLogger` | stdout-only when no logPath | Controls JSONL file output and logger degraded/restored telemetry. |
| `requireFirst(candidates)` | Runtime input | `runtime.js` | Caller provided | Ordered dependency fallback list. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| Logger JSONL `logPath` | Caller-provided to `createLogger` | Operators/tests | `logger.js appendFileSync` | Observability only; stdout remains fallback. |
| `.swarm/logs/buster/malformed-tasks.jsonl` | `runtime-diagnostics.js appendMalformedTaskArtifact` | Operators/tests | `appendMalformedTaskArtifact` | Diagnostic-only poison/malformed task artifact. |
| `.swarm/logs/buster/process-health.jsonl` | `runtime-diagnostics.js appendBusterProcessDiagnostic` | Operators/tests | `appendBusterProcessDiagnostic`, `reportBusterRuntimeDiagnostic` | Diagnostic-only process health surface; not canonical run telemetry. |
| ACP stream log path | Caller-passed `streamLogPath` | `session-monitor.js` through `getAcpMonitorState` | ACP/common monitor/runtime outside scoped file | Session monitor consumes transcript deltas; no direct write here. |
| Gateway health URL | `resolveGatewayHealthUrl` via shim | `gateway-health.js checkGatewayHealth` | N/A | External HTTP endpoint path delegated to common gateway helper. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Buster gateway readiness/health process decision | `gateway-health.js` calls structured `shutdown` | `buster-pipeline.js` startup/health monitor | None. |
| Buster task JSONL log entries | `logger.js createLogger/write` | Operators/tests | None; log is observability only. |
| Buster process diagnostic records | `runtime-diagnostics.js` | Operators/tests/startup diagnostics | Diagnostic-only, no run `seq`; no issue. |
| Buster child-session monitor result | `session-monitor.js monitorSession` | Task lifecycle/completion finalization | Task completion authority remains outside B01. |
| Common ACP/gateway/lifecycle helper behavior | `skills/common/pipeline/*` | Buster shims and Buster services | Details deferred to C00b. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Logger JSONL entry | `logger.js write` | `ts:string`, `level`, `tag`, `msg`, `module`, `step`, `task_type`, optional `data:object` sanitized recursively | Local sanitizer only | Log readers/operators. |
| Logger degraded telemetry payload | `buildLoggerDegradedPayload` / `createLogger` | `component:'buster_logger'`, `surface:'jsonl_file'`, `reason`, `detail`, optional module/gate/attempt/dispatch/session, `log_path`, `degraded_at` | Sanitizers and optional telemetry hook | Telemetry sinks when caller supplies `emitTelemetry`. |
| Process diagnostic record | `buildBusterProcessDiagnosticRecord` | `v:1`, `type:'observability.degraded'`, `ts`, `source:'buster'`, `emitter:'buster/buster-pipeline'`, `diagnostic_only:true`, `scope:'process'`, `component`, `surface`, `reason`, `detail`, `agent_type:'buster'`, `project_hint`, `degraded_at` | `normalizeDiagnosticDetail`, `normalizeRequiredIdentity` | Process-health JSONL/operators. |
| Malformed task artifact line | `appendMalformedTaskArtifact` | `ts`, `component:'buster_pipeline'`, `event:'malformed_task_rejected'`, plus caller record fields | Caller record plus JSON stringify | Operators. |
| `monitorSession` result | `session-monitor.js` | Terminal: `{terminal:true, reason, detail, state}`; timeout/rate-limit: `{terminal:false, reason, detail, state, ...}`; rate-limit adds `max_rate_limit_pauses`, `rate_limit_status`; timeout adds `killIssued`, `killConfirmed` | Local builders plus ACP monitor state; callers validate completion downstream | Task lifecycle/finalization. |
| Rate-limit status | `buildRateLimitStatus` | `pause_count:number`, `max_rate_limit_pauses:number`, `current_cooldown_s:number` | Rate-limit state object | Task completion/rate-limit terminal projection. |
| `buster.session_monitor` event payload | `session-monitor.js` | `module_id`, `session_key`, `agent_type:'buster'`, `elapsed_seconds`, `acp_state`, `transcript_events`, `rate_limited`, `gateway_unreachable` | Telemetry service downstream; no local validator | Telemetry stream/operators/tests. |
| `agent.transcript` event payload | `publishTranscriptDelta` callback in `session-monitor.js` | Identity object with `label`, `module_id`, optional gate fields, `session_key`, `dispatch_id`, `agent_type:'buster'`, plus common transcript delta fields | Common ACP monitor publisher | Telemetry stream/operators/tests. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Buster child-session monitor | `session-monitor.js monitorSession` | None generated in scoped file | Watches existing spawned child session and publishes transcript deltas with label `buster-${moduleId}` | ACP monitor state, lifecycle kill, rate-limit recovery, telemetry emit hooks | Returns terminal/nonterminal monitor result for task lifecycle; no agent prompt text built here. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `gateway-health.js checkGatewayHealth` | Gateway health fetch timeout/error/non-ok | Yes at caller loop level | Fetch abort timeout 5000 ms; readiness retry every 3000 ms; periodic every 60000 ms | Returns `false`; caller decides shutdown | None locally. |
| `gateway-health.js waitForGateway` | Gateway not ready within 120s | No after deadline | Polls until `GATEWAY_READY_TIMEOUT` | Calls structured shutdown with `GATEWAY_READY_TIMEOUT` | Detail has no secrets. |
| `gateway-health.js startGatewayHealthMonitor` | Periodic gateway unreachable | Yes until failure count exhausted | 3 consecutive failures at 60000 ms interval | Calls structured shutdown with `GATEWAY_HEALTH_FAILED` | Detail has no secrets. |
| `logger.js createLogger` | Log directory create failure | No | One mkdir attempt at construction | Continue stdout-only / repeated append attempts if logPath remains | Details sanitized by noncritical reporting. |
| `logger.js write` | Log append failure | Yes on next log write | Synchronous append each entry; restored event on later success | Continue stdout-only for failed write | Data and path detail sanitized. |
| `logger.js emitTelemetry` | Degraded/restored telemetry emit failure | No | One optional hook call | Writes sanitized stderr line, continues | Telemetry error message sanitized. |
| `runtime-diagnostics.js append*` | Diagnostic artifact write failure | No | One mkdir/append attempt | Write sanitized stderr and continue; stderr failure swallowed | Uses `safeErrorMessage`. |
| `runtime.js requireFirst/loadRedisCtor` | Redis package candidate missing/load failure | Fallback candidates | Tries `ioredis`, `/app/node_modules/ioredis`, `/usr/local/lib/node_modules/ioredis` | Throws last error if all candidates fail | None locally. |
| `session-monitor.js getAcpMonitorState` | ACP/gateway polling failure thrown | Caller lifecycle catches monitor exceptions | No local catch around `getState` | Monitor rejects; lifecycle handles monitor_error outside B01 | Details handled by caller. |
| `session-monitor.js gateway unreachable state` | Gateway unreachable but monitor returns state | Yes | Per monitor poll; degraded once until restored | Continue monitoring; emit degraded/restored telemetry | Detail from state/recovery passed as telemetry. |
| `session-monitor.js rate-limit` | ACP state rate-limited | Yes until pause budget exhausted | Max pauses payload/default 3; cooldown delegated, initial 120s max 600s | Resume monitor or return terminal rate-limited result | Detail passed through rate-limit service. |
| `session-monitor.js enforceHardTimeout` | Session hard timeout; kill fails/unconfirmed/confirmed | Kill retried by explicit kill once, then grace polling | Deadline from timeout seconds; kill grace max(15000 ms, pollMs) | Returns timeout kill result for task lifecycle; does not finalize here | Logger detail includes session key/time only. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `gateway-health.js checkGatewayHealth` | Individual failed health fetch | No direct telemetry | Console only when caller logs | none | N/A | Readiness/periodic caller records terminal gateway degradation through shutdown path. |
| `gateway-health.js waitForGateway` | Readiness timeout | Indirect/yes through caller shutdown option | Structured shutdown in `buster-pipeline.js`, process diagnostics when enabled | Gateway degraded diagnostic/event by shutdown caller | caller `shutdown` | B01 passes `emitGatewayDegraded:true`; actual emission lives in entrypoint. |
| `gateway-health.js startGatewayHealthMonitor` | 3 consecutive failures | Indirect/yes through caller shutdown option | Structured shutdown/process diagnostics | Gateway degraded diagnostic/event by shutdown caller | caller `shutdown` | Health monitor itself logs WARN/ERROR to console. |
| `logger.js createLogger` | Directory create failure | Yes when `opts.emitTelemetry` supplied; otherwise noncritical incident/stderr | Telemetry hook or stderr | `observability.degraded`; classified incident | `reportLoggerIncident` | Non-terminal stdout-only fallback. |
| `logger.js write` | Append failure/restored | Yes when `opts.emitTelemetry` supplied; otherwise noncritical incident/stderr | Telemetry hook or stderr | `observability.degraded` / `observability.restored` | `write`, `reportLoggerIncident` | Restored event emitted on later successful append. |
| `logger.js emitTelemetry` | Degraded/restored telemetry hook throws | Partial | process stderr | `[buster-logger] degraded/restored telemetry emit failed` | local catch | No secondary telemetry possible. |
| `runtime-diagnostics.js append*` | Diagnostic artifact write failure | Partial | process stderr | `[BUSTER-DIAGNOSTIC] ... write failed` | `appendMalformedTaskArtifact`, `appendBusterProcessDiagnostic` | Stderr failure swallowed by design. |
| `runtime.js requireFirst/loadRedisCtor` | All Redis candidates fail | No | none in scoped file | none | thrown error | Caller/importer owns logging; dependency failure is startup/tool error. |
| `session-monitor.js getAcpMonitorState` | Poll helper throws | Indirect | task lifecycle monitor-error path outside B01 | `agent.killed` reason `monitor_error` per adjacent tests | task lifecycle caller | `check-buster-pipeline-slice-surface` asserts caller catch. |
| `session-monitor.js gateway unreachable state` | Gateway unreachable/restored | Yes | Buster telemetry stream/sinks | `observability.degraded`, `observability.restored`; `buster.session_monitor` includes gateway flag | `emitEvent` in monitor | Degraded deduped by `gatewayDegradedAt`. |
| `session-monitor.js rate-limit` | Rate-limited/exhausted | Yes | Buster telemetry/rate-limit service plus monitor result | `rate_limit.detected`, `buster.session_monitor`, terminal rate-limit result | `handleRateLimit`, `emitEvent` | Monitor owns canonical pause signal. |
| `session-monitor.js enforceHardTimeout` | Timeout kill failed/confirmed/unconfirmed | Partial | Logger stdout/JSONL and task lifecycle downstream | `MONITOR` WARN log; downstream timeout completion/Discord outside B01 | `logger.warn`, caller lifecycle | No standalone monitor telemetry event for timeout; task lifecycle owns terminal projection. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js runtime | `node` binary | Observed `v24.14.0` during review | All B01 JS files | ESM modules, fetch, AbortSignal, sync filesystem, timers | No engines field in scoped files. |
| Common ACP/session/gateway helpers | Internal source `skills/common/pipeline/**` | Internal | Buster shims and monitor | Canonical ACP monitor/lifecycle/runtime/gateway behavior | C00b owns implementation details. |
| Gateway HTTP health endpoint | External Gateway | Env/config delegated | `gateway-health.js` | Startup readiness and periodic liveness | 5s fetch abort; structured shutdown after readiness/health thresholds. |
| Buster telemetry service | Internal/source plus Redis/file sinks downstream | Internal | `session-monitor.js`, optional logger telemetry hook | Session monitor, transcript, degraded/restored events | `emitEvent` awaited in monitor. |
| Buster rate-limit service | Internal source | Internal | `session-monitor.js` | Rate-limit pause/resume/exhaustion | Pause budget/cooldowns configurable by payload. |
| Node `fs`/`path` built-ins | Runtime built-ins | Node major 24 observed | `logger.js`, `runtime-diagnostics.js` | JSONL logs and diagnostics | Failures non-terminal and sanitized. |
| `ioredis` | npm package / fallback absolute paths | Declared `^5.4.1` in Buster package | `runtime.js loadRedisCtor` | Redis clients for queue/tooling | Tries ordered candidates; throws if all fail. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Gateway readiness polling | One startup loop | 120s timeout, 3000 ms interval, 5000 ms fetch abort | Structured shutdown on timeout | Console plus caller shutdown diagnostic | None. |
| Gateway periodic health monitor | One `setInterval` | 60000 ms interval, 3 consecutive failures | Structured shutdown after threshold | WARN/ERROR console and caller shutdown diagnostic | Interval handle not returned; shutdown flag expected to stop work. |
| Logger file writes | Synchronous append per log entry | No queue/buffer; stdout always written | Append failure reports degraded and continues stdout-only | JSONL/telemetry/stderr incident | None. |
| Diagnostic artifact writes | Synchronous append per diagnostic | No queue/retry | Write failure stderr and continue | stderr only | None. |
| Session monitor loop | One loop per child session | `monitorPollMs` from ACP monitor config; hard timeout optional | Sleeps per poll; terminal/timeout/rate-limit exits | `buster.session_monitor` per poll | None. |
| Session timeout kill grace | Post-timeout poll loop | `max(kill_grace_ms or 15000, monitorPollMs)` | Unconfirmed result after grace expires | WARN log/result | None. |
| Buster rate-limit pauses | In-memory pause state per monitor | max pauses default 3; cooldown initial 120s, max 600s | Resume monitor or terminal rate-limited result | rate-limit telemetry/result | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Buster child-session poll state | ACP monitor state including `sessionState`, `sessionActive`, `transcript`, `rateLimited`, `gatewayUnreachable`, `detail` | `getAcpMonitorState` via shim | `session-monitor.js monitorSession` | Per monitor poll interval | Monitor logs/events/result. |
| Buster session monitor event | `buster.session_monitor` payload with module/session/elapsed/acp/transcript/rate/gateway fields | `session-monitor.js` | Telemetry sinks/operators/tests | Emitted on every poll | Telemetry stream/event sinks. |
| Buster transcript delta | Identity object `{label,module_id,gate_id,gate_type,session_key,dispatch_id,agent_type}` plus transcript lines from common publisher | `publishTranscriptDelta` callback | Telemetry sinks/Nova operators | Emitted when `newLines.length > 0` | `agent.transcript` telemetry. |
| Buster gateway degraded/restored projection | Observability payload with component `acp_monitor`, surface `gateway`, reason `gateway_unreachable`, detail, module/session identity, timestamps | `session-monitor.js` | Telemetry sinks/operators/tests | Degraded once until restored | `observability.degraded/restored` telemetry. |
| Buster rate-limit recovery | Pause/recovery request with session key, gateway URL/token, module/gate/run/attempt/dispatch identity, provider `anthropic`, `ownsCanonicalSignal:true` | `session-monitor.js` | Buster rate-limit service and telemetry | Pause budget/cooldown delegated | `rate_limit.detected` and monitor result. |
| Hard-timeout kill request | `killSession(childSessionKey, { runtime, model, agentId, label })` | `enforceHardTimeout` | Common lifecycle/gateway | One kill then grace polls | Timeout monitor result. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Buster shims re-export common helpers and production-local imports are used | `check-common-helper-import-surface.mjs`, `buster-runtime-normalization.mjs` | Good | Common helper internals deferred to C00b. |
| Gateway failures route through structured shutdown, not hard exit | `check-buster-pipeline-slice-surface.mjs`, `check-buster-startup-smoke.mjs`, `buster-runtime-normalization.mjs` | Good | None. |
| Session monitor export, transcript identity, rate-limit status, and monitor-error caller handling | `check-buster-pipeline-slice-surface.mjs`, `runtime-monitor.mjs`, `buster-runtime-normalization.mjs` | Good | None. |
| Logger non-empty catches and degraded reporting shape | `check-observability-catch-reporting.mjs`, `buster-runtime-normalization.mjs`, redaction/operator behavior areas | Good | None. |
| Runtime diagnostics diagnostic-only schema | `buster-runtime-normalization.mjs` | Good | None. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- None yet.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
