# Batch P04 — Nova agent lifecycle and runtime foundations

Status: completed
Date started: 2026-05-08
Date completed: 2026-05-08
Reviewer: Nova

## Scope

```text
skills/nova/pipeline/agents/acp-monitor.js
skills/nova/pipeline/agents/lifecycle.js
skills/nova/pipeline/agents/runtime.js
skills/nova/pipeline/agents/session-semantics.js
skills/nova/pipeline/agents/shutdown.js
skills/nova/pipeline/agents/orchestration-healthcheck.js
```

Scope expansion verified live: 6 files, under the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/nova/pipeline/agents/acp-monitor.js
kubeclaw-main/skills/nova/pipeline/agents/lifecycle.js
kubeclaw-main/skills/nova/pipeline/agents/runtime.js
kubeclaw-main/skills/nova/pipeline/agents/session-semantics.js
kubeclaw-main/skills/nova/pipeline/agents/shutdown.js
kubeclaw-main/skills/nova/pipeline/agents/orchestration-healthcheck.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/skills/common/pipeline/agents/acp-monitor.js
kubeclaw-main/skills/common/pipeline/agents/lifecycle.js
kubeclaw-main/skills/common/pipeline/agents/runtime.js
kubeclaw-main/skills/common/pipeline/agents/session-semantics.js
kubeclaw-main/tests/verification/behavior/areas/runtime-monitor.mjs
kubeclaw-main/tests/verification/behavior/areas/transcript-monitor.mjs
kubeclaw-main/tests/verification/behavior/areas/shutdown-integration.mjs
kubeclaw-main/tests/verification/behavior/areas/agent-lifecycle.mjs
kubeclaw-main/tests/verification/behavior/areas/models.mjs
kubeclaw-main/tests/verification/contracts/check-critical-dynamic-imports.mjs
kubeclaw-main/tests/verification/runtime/check-nova-startup-smoke.mjs
```

## Per-file map

### `skills/nova/pipeline/agents/acp-monitor.js`

Role: Repo-local Nova compatibility facade for shared ACP/session transcript monitor.

Imports/dependencies: Static re-export from `../../../common/pipeline/agents/acp-monitor.js`.

Exports/public surface: Re-exports common `publishTranscriptDelta`, `parseSessionState`, `getAcpMonitorConfig`, `classifyTranscriptText`, `readAcpTranscriptState`, `transcriptShowsProgress`, `getAcpMonitorState`, `isSessionTerminal`, `waitForSessionIdle`, `ACP_MONITOR_REASONS`, `isSessionTerminalState`, `isStoppedSessionState`, and `isUnreachableSessionState`.

Defines: No local functions or state.

Important variables/state: None locally. Adjacent common owner maintains `_transcriptRateLimits` keyed by agent label and transcript state objects across polling calls.

Calls out to: Static ESM re-export only. Adjacent common owner reads transcript files, calls gateway session status, and uses one documented lazy lifecycle import to avoid an ESM cycle.

Called by / expected callers: Nova polling/session-end/ACP observability/orchestration healthcheck surfaces import the local shim path; Buster imports its equivalent shim.

Environment variables / CLI inputs / config fields: None in scoped shim. Adjacent common owner reads ACP monitor config fields from `config.acp_monitor` or opts: unknown/stale limits, transcript grace/extension limits, and monitor poll interval.

Paths built/read/written: Static import path only in scoped shim. Adjacent common owner reads ACP transcript JSONL from tracked `streamLogPath` and may resolve subagent transcript files from `$HOME/.openclaw/agents/<parentAgentId>/sessions` through lifecycle.

Authority behavior: Compatibility shim only; common helper owns ACP monitor state machine, transcript delta publishing, and session state semantics for both Nova and Buster.

Error/retry/terminal behavior: No local handling. Common owner treats transcript read failures as non-terminal state detail, gateway failures as unreachable with transcript fallback, and `waitForSessionIdle` uses polling/deadline extension rather than throwing for timeout.

Verification coverage: `runtime-monitor.mjs`, `transcript-monitor.mjs`, `check-critical-dynamic-imports.mjs`, and common-helper import-surface tests cover this surface.

Findings: None.

### `skills/nova/pipeline/agents/lifecycle.js`

Role: Repo-local Nova compatibility facade for shared agent/session lifecycle tracking, spawn, kill, transcript path, and active-session persistence.

Imports/dependencies: Static re-export from `../../../common/pipeline/agents/lifecycle.js`.

Exports/public surface: Re-exports common `getActiveSession`, `trackAgent`, `untrackAgent`, `getTrackedAgent`, `getTrackedAgentCount`, `listTrackedAgents`, `clearActiveSession`, `recoverActiveSession`, `resolveSubagentTranscriptPath`, `resolveSpawnTranscriptPath`, `acpxCleanup`, `spawnSession`, `killSession`, and `killActiveSession`.

Defines: No local functions or state.

Important variables/state: None locally. Adjacent common owner keeps module-local `_activeSession` and `_trackedAgents`, and can persist active session state to an optional JSON file.

Calls out to: Static ESM re-export only. Adjacent common owner calls gateway `sessions_spawn`, `session_status`, `sessions_send`, `subagents`, and `acpx` for ACP cleanup.

Called by / expected callers: Nova orchestration, reviewer lifecycle, pipeline recovery, summary/case-study sessions, shutdown, and tests import this local shim path.

Environment variables / CLI inputs / config fields: None in scoped shim. Adjacent common owner uses `process.cwd()`, `os.homedir()`, session payload/options, gateway env through shared gateway helper, and optional active-state path fields.

Paths built/read/written: Static import only in scoped shim. Adjacent common owner writes optional active session JSON atomically, removes it on clear, and reads `$HOME/.openclaw/agents/<id>/sessions/sessions.json` for subagent transcript path resolution.

Authority behavior: Compatibility shim only; common helper owns in-process tracked-agent and active-session authority. Nova shutdown delegates tracking to this helper instead of maintaining a second map.

Error/retry/terminal behavior: No local handling. Common spawn retries failed gateway spawn up to 3 attempts by default; kill confirms stop by polling, tries subagent kill first for subagents, falls back to `/stop`, and may run `acpx` cleanup for ACP sessions.

Verification coverage: `agent-lifecycle.mjs`, `shutdown-integration.mjs`, `summaries.mjs`, runtime session-launch helper, and common-helper import contracts.

Findings: None.

### `skills/nova/pipeline/agents/runtime.js`

Role: Repo-local Nova compatibility facade for shared model-to-runtime/harness classification.

Imports/dependencies: Static re-export from `../../../common/pipeline/agents/runtime.js`.

Exports/public surface: Re-exports common `modelToHarness`, `isSubagentModel`, and `resolveRuntime`.

Defines: No local functions or state.

Important variables/state: None.

Calls out to: Static ESM re-export only.

Called by / expected callers: Common lifecycle spawn/kill and verification session launch helper. Nova orchestration consumes lifecycle runtime resolution indirectly.

Environment variables / CLI inputs / config fields: None in scoped shim. Adjacent common owner classifies runtime from string input or object `runtime`, `dispatch`, and `model` fields.

Paths built/read/written: Static import only.

Authority behavior: Compatibility shim only; common helper owns model/harness classification and runtime defaulting.

Error/retry/terminal behavior: No local handling. Common functions do not throw for unknown model/runtime; unknown harness returns null and runtime defaults to ACP unless model looks like subagent.

Verification coverage: `models.mjs` verifies GPT/Codex models resolve to subagent and Claude model resolves to ACP.

Findings: None.

### `skills/nova/pipeline/agents/session-semantics.js`

Role: Repo-local Nova compatibility facade for shared ACP monitor reason constants and session state classifiers.

Imports/dependencies: Static re-export from `../../../common/pipeline/agents/session-semantics.js`.

Exports/public surface: Re-exports common `ACP_MONITOR_REASONS`, `isSessionTerminalState`, `isStoppedSessionState`, and `isUnreachableSessionState`.

Defines: No local functions or state.

Important variables/state: None.

Calls out to: Static ESM re-export only.

Called by / expected callers: ACP monitor common helper and callers that need state classification.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: Static import only.

Authority behavior: Compatibility shim only; common helper owns terminal/stopped/unreachable regex vocabulary and monitor reason enum.

Error/retry/terminal behavior: No local handling. Common classifiers return booleans and do not throw.

Verification coverage: Runtime monitor and Buster normalization tests exercise state semantics indirectly; common-helper import contracts verify shim shape.

Findings: None.

### `skills/nova/pipeline/agents/shutdown.js`

Role: Nova graceful shutdown, tracked-session stop, ACP process reaper, interrupted module status persistence, and telemetry Redis close.

Imports/dependencies: Node `fs`, `child_process.execFileSync`; status store load/save; logger; gateway URL/token helpers; telemetry close; lifecycle state transition; lifecycle tracked-agent/session helpers.

Exports/public surface: `reaperAfterKill`, `registerShutdownHooks`, `setShutdownContext`, `clearShutdownContext`.

Defines: Process table parser, descendant collector, process signaling helpers, ACP wrapper command detector, `/proc/<pid>/environ` reader, tracked ACP environment matcher, victim set builder, signal shutdown flow.

Important variables/state: Module-local `_shutdownState = { config, statusDir, currentLabel, shuttingDown }`; lifecycle `_trackedAgents` is the actual tracked-session authority.

Calls out to: `ps -eo pid=,ppid=,command=`, `process.kill`, `/proc/<pid>/environ`, `killSession`, `reaperAfterKill`, `loadStatus`, `transitionModuleStatus`, `saveStatus`, `closeTelemetryRedis`, `process.on`, `process.exit`.

Called by / expected callers: Nova CLI registers hooks; module runner/attempt code sets and clears shutdown context; orchestration imports `reaperAfterKill` for post-kill process cleanup.

Environment variables / CLI inputs / config fields: Reads child process env from `/proc/<pid>/environ` for `OPENCLAW_SHELL=acp` and `CURRENT_PROJECT`; uses `config.project`, `config.agents[agentType].dispatch`, gateway env through helper resolution, and status dir inputs.

Paths built/read/written: Reads `/proc/<pid>/environ`; status-store reads/writes module `status.json`; telemetry close may close Redis. Does not build status path itself.

Authority behavior: Owns process signal handling and last-chance cleanup. Does not own tracked agent storage; delegates to shared lifecycle. On signal, non-PASS/BLOCKED current module status is transitioned to FAIL and persisted.

Error/retry/terminal behavior: Process table parsing and `/proc` reads are best-effort; reaper sends SIGTERM, waits 1s, then SIGKILL for still-alive victims. Session stop failures are logged and shutdown continues. Status persistence and telemetry close failures are logged and non-fatal. Signal handler exits with code 1 when cleanup completes.

Verification coverage: `shutdown-integration.mjs` verifies shutdown uses lifecycle tracking, gateway helpers, and no legacy sync kill/curl paths; startup smoke verifies `registerShutdownHooks` export.

Findings: None.

### `skills/nova/pipeline/agents/orchestration-healthcheck.js`

Role: Nova agent liveness check that combines gateway session status, transcript-progress fallback, and observability degraded/restored events.

Imports/dependencies: Core logger active context; telemetry observability emitters; gateway invoke; ACP monitor transcript/state helpers; lifecycle tracked-agent lookup; `sleep`.

Exports/public surface: `healthCheckIdentity`, `verifyAgentAlive`.

Defines: Agent label builder, tracked transcript state update, health-check mode suppression, identity builder, gateway observability state transitions, liveness check flow.

Important variables/state: Mutates tracked lifecycle entry with `transcriptState`, `healthCheckMode`, and `healthCheckObservability`. Emits observability state per tracked entry.

Calls out to: `gatewayInvoke('session_status')`, `parseSessionState`, `readAcpTranscriptState`, `transcriptShowsProgress`, `getTrackedAgent`, `emitObservabilityDegraded`, `emitObservabilityRestored`, `sleep`, `log`.

Called by / expected callers: Nova orchestration and module-worker health checks; review/Buster gate runners via orchestration exports; tests import through orchestration runtime surface.

Environment variables / CLI inputs / config fields: Reads `config.agents[agentType]`, `config._runId`, `config.run_id`, active context, and tracked entry telemetry fields.

Paths built/read/written: Reads tracked `entry.streamLogPath` transcript JSONL through ACP monitor helper. Writes no files directly; observability emitters write/stream elsewhere.

Authority behavior: Owns Nova-specific health-check decision: Redis-dispatched agents are considered alive; ACP/subagent sessions require session status or transcript progress. Gateway degraded/restored projection is attached to the tracked lifecycle entry.

Error/retry/terminal behavior: Missing agent config returns false; Redis dispatch returns true; missing sessionKey returns false with ERROR log. Gateway status terminal states return false; unknown/unreachable state degrades observability and may return true if transcript progressed; thrown gateway errors follow the same transcript fallback path. No retry/backoff beyond initial wait.

Verification coverage: `transcript-monitor.mjs` verifies transcript delta reuse, fallback warning suppression, degraded/restored events, and unknown-state rejection without progress.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `agents/acp-monitor.js` | `skills/common/pipeline/agents/acp-monitor.js` | `export *` | Nova shim delegates ACP monitor implementation to common owner. |
| `agents/lifecycle.js` | `skills/common/pipeline/agents/lifecycle.js` | `export *` | Nova shim delegates lifecycle/session tracking implementation to common owner. |
| `agents/runtime.js` | `skills/common/pipeline/agents/runtime.js` | `export *` | Nova shim delegates runtime/harness classification to common owner. |
| `agents/session-semantics.js` | `skills/common/pipeline/agents/session-semantics.js` | `export *` | Nova shim delegates session state vocabulary to common owner. |
| `agents/shutdown.js` | `agents/lifecycle.js` | `getTrackedAgent`, `killSession`, `listTrackedAgents`, `trackAgent`, `untrackAgent` | Shutdown cleanup delegates tracked-session authority to shared lifecycle shim. |
| `agents/shutdown.js` | `services/status-store.js`; `lifecycle-state.js` | `loadStatus`, `transitionModuleStatus`, `saveStatus` | Signal shutdown marks interrupted in-flight module as FAIL. |
| `agents/shutdown.js` | `integrations/gateway.js`; `services/telemetry.js` | gateway URL/token helpers; `closeTelemetryRedis` | Session stop and final telemetry transport cleanup. |
| `agents/orchestration-healthcheck.js` | `agents/acp-monitor.js` | `parseSessionState`, `readAcpTranscriptState`, `transcriptShowsProgress` | Health check combines gateway status and transcript progress. |
| `agents/orchestration-healthcheck.js` | `agents/lifecycle.js` | `getTrackedAgent` | Reads/mutates tracked entry health/transcript fields. |
| `agents/orchestration-healthcheck.js` | `services/telemetry.js` | `emitObservabilityDegraded`, `emitObservabilityRestored` | Gateway health degradation/restoration events. |
| Common `agents/lifecycle.js` | Common `agents/acp-monitor.js`, `agents/runtime.js`, gateway helper | state parsing, runtime resolution, gateway calls | Adjacent common owner for shim behavior. |
| Common `agents/acp-monitor.js` | Common `agents/lifecycle.js` | lazy `import('./lifecycle.js')` | Documented lazy import avoids monitor/lifecycle hard ESM cycle. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| Scoped compatibility shims | None found in scoped files | None | Static `export *` only | Confirms no Nova-specific logic in four agent shim files. |
| Common `parseSessionState` | ACP state/status/statusText patterns | Gateway session status result | Return `{ active, state }` with running/terminal/idle/unknown mapping | Session state normalization authority. |
| Common `getAcpMonitorState` | Nova signature vs direct signature | Argument shapes | Resolve tracked agent/session key or direct child session key | Maintains Nova/Buster compatibility. |
| Common monitor state builder | Transcript rate-limit/error, session terminal, unknown+stale thresholds | Transcript/session state and prior monitor state | Set terminal/rateLimited/reason/detail fields | Drives polling/session terminal behavior. |
| Common `waitForSessionIdle` | Terminal, unreachable, inactive, active transcript | Monitor state and deadlines | Return, grace wait, extend deadline, or keep polling | Preserves transcript summary time before kill. |
| Common lifecycle `spawnSession` | Runtime resolves to subagent vs ACP | Runtime/model/options | Build gateway `sessions_spawn` args with subagent/ACP-specific fields | Spawn payload authority. |
| Common lifecycle `killSession` | Already stopped, subagent, stop request, ACP cleanup | Session state/runtime/options | Confirm, kill subagent, send `/stop`, optional `acpx` cleanup | Stop behavior differs by runtime. |
| `shutdown.js buildVictimSet` | Command/session/gateway match and tracked ACP env | `ps` rows and `/proc` env | Select wrapper/orphan roots and descendants | Prevents broad process killing outside tracked project/session. |
| `shutdown.js performSignalShutdown` | Tracked sessions/status dir present | Lifecycle map and shutdown context | Stop sessions; mark in-flight status FAIL; close telemetry | Signal cleanup order. |
| `orchestration-healthcheck.js verifyAgentAlive` | Redis dispatch, missing key, terminal/unknown/unreachable/gateway error | Config, session status, transcript progress | Return true/false and emit degraded/restored as needed | Nova liveness gate before worker control continues. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| Common `publishTranscriptDelta` | `_transcriptRateLimits` map | Agent label and new transcript lines | Reset 1s window, either emit one bundled info event or per-line events | At most 5 emitted transcript events/sec per label window. |
| Common `readAcpTranscriptState` | Transcript monitor state object | Previous state and appended file bytes | Preserve previous offsets/counters, reset on truncation, append parsed line effects | Incremental transcript state. |
| Common lifecycle `trackAgent` | `_trackedAgents` map | Label/session metadata/extra | Base fields then spread `extra` | Tracked entry stores telemetry/runtime metadata. |
| Common lifecycle active session | `_activeSession` and optional JSON file | Session data | Copy data then persist atomically to configured path | Active session recovery surface. |
| `shutdown.js _shutdownState` | Shutdown context | Register/set/clear/signal | Store config/statusDir/currentLabel; duplicate signal sets `shuttingDown` guard | Single in-flight graceful shutdown. |
| `shutdown.js performSignalShutdown` | Module status object | Current status file and signal | Transition non-PASS/BLOCKED status to FAIL with interrupted note | Interrupted module is terminalized. |
| `orchestration-healthcheck.js readTrackedTranscriptState` | Tracked entry `transcriptState` | Existing entry transcript state and stream path | ACP monitor state replaces entry field | Health checks reuse transcript offset. |
| `orchestration-healthcheck.js updateHealthCheckObservability` | Tracked entry `healthCheckObservability` | Issue/restoration | First issue marks active; success emits restore and deletes state | One degrade/restore cycle per active issue. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| Common `waitForSessionIdle` | `Date.now() < deadline` | `sleep(min(pollMs, remaining))` | `totalTimeoutMs`; optional transcript extension by `transcriptGraceMs` up to `maxTranscriptExtensions` | Return on terminal/unreachable inactive/inactive grace; timeout logs and proceeds. |
| Common lifecycle `waitForSessionStop` | `Date.now() <= deadline` | `sleep(min(confirmPollMs, remaining))` | `confirmTimeoutMs` | Confirm stopped state or return last unconfirmed state. |
| Common lifecycle `spawnSession` | `attempt <= maxRetries` | `sleep(retryDelayMs)` between failures | Gateway spawn timeout 30000 ms per attempt | Return accepted session or throw after attempts. |
| `shutdown.js reaperAfterKill` | Victim list iteration | Initial 2000 ms wait; 1000 ms between SIGTERM/SIGKILL | No explicit deadline beyond waits | Signals victims and returns; errors swallowed/logged. |
| `shutdown.js collectDescendants` | Recursive children traversal | None | None | Stops when descendant already seen. |
| `shutdown.js performSignalShutdown` | Iterate `listTrackedAgents()` | Await each stop sequentially | Kill/confirm timings delegated to lifecycle | Continues after per-session failures. |
| `orchestration-healthcheck.js verifyAgentAlive` | Single health check | Initial `sleep(waitMs)`, default 8000 ms | Gateway call timeout 10000 ms | Return boolean; no retry loop. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `config.acp_monitor.unknown_poll_limit` / `unknownPollLimit` | Config/opts field | Common `getAcpMonitorConfig`, monitor state builder | `10` | Unknown/unreachable poll terminal threshold. |
| `config.acp_monitor.stale_poll_limit` / `stalePollLimit` | Config/opts field | Common `getAcpMonitorConfig`, monitor state builder | `10` | Transcript stale poll threshold. |
| `config.acp_monitor.max_transcript_extensions` / `maxTranscriptExtensions` | Config/opts field | Common `waitForSessionIdle` | `3` | Max idle deadline extensions for active transcript. |
| `config.acp_monitor.transcript_grace_ms` / `transcriptGraceMs` | Config/opts field | Common `waitForSessionIdle` | `300000` | Grace extension duration. |
| `config.acp_monitor.monitor_poll_ms` / `monitorPollMs` | Config/opts field | Common `waitForSessionIdle` | `10000` | Idle poll sleep interval. |
| `OPENCLAW_GATEWAY_URL`, `GATEWAY_URL`, gateway token vars | Environment variables via gateway helper | Common monitor/lifecycle and Nova shutdown/healthcheck | Gateway helper defaults | Used for session status/spawn/stop gateway calls. |
| `OPENCLAW_SHELL`, `CURRENT_PROJECT` | Child process environment read from `/proc/<pid>/environ` | `shutdown.js` | Child process provided | Reaper only treats matching ACP shell/project processes as tracked. |
| `GIT_EDITOR` | Command env override | Adjacent Git worktree, not P04 scoped | None | None found in P04 scoped files. |
| `config.agents[agentType].dispatch` | Config field | `shutdown.js setShutdownContext`, `orchestration-healthcheck.js verifyAgentAlive` | Config-defined | Redis agents skip local session tracking/health checks. |
| Lifecycle spawn options/payload session fields | Function input | Common `spawnSession` | Defaults from opts/session object | Includes runtime/model/agentId/cwd/label/thread/mode/cleanup/thinking/retry settings. |
| Lifecycle kill options | Function input | Common `killSession` | Runtime-dependent confirmation timeout | Includes runtime/model/agentId/label/gateway/timeout/stop message. |
| Shutdown context inputs | Function input | `setShutdownContext(config, agentType, moduleId, statusDir)` | Caller-provided | Stores status dir and optional current tracked label. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| ACP transcript `streamLogPath` | Spawn/session callers; common lifecycle resolver | Common monitor and Nova healthcheck | Agent runtime outside P04 | Incrementally read by byte offset. |
| `$HOME/.openclaw/agents/<parentAgentId>/sessions/sessions.json` | OpenClaw session runtime | Common lifecycle `resolveSubagentTranscriptPath` | OpenClaw runtime | Used to find subagent transcript JSONL. |
| `$HOME/.openclaw/agents/<parentAgentId>/sessions/<sessionId>.jsonl` | Common lifecycle resolver | Common monitor via resolved stream path | OpenClaw runtime | Fallback subagent transcript path. |
| Active session state JSON path | Common lifecycle `activeStatePath` option | `recoverActiveSession` | `persistActiveSession`, `clearPersistedActiveSession` | Optional atomic active-session persistence. |
| `/proc/<pid>/environ` | Linux procfs | `shutdown.js readProcEnv` | Kernel/process env | Used only for ACP reaper filtering. |
| Module status `status.json` | Status-store path helpers outside P04 | `shutdown.js performSignalShutdown` via `loadStatus` | `saveStatus` after transition | Signal shutdown terminalizes interrupted module status. |
| Gateway tools: `sessions_spawn`, `session_status`, `sessions_send`, `subagents` | Common lifecycle/monitor and Nova healthcheck | Gateway API | None | External gateway API names, not filesystem paths. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| ACP monitor state and transcript delta schema | `skills/common/pipeline/agents/acp-monitor.js` via Nova/Buster shims | Polling, orchestration healthcheck, Buster monitor/rate-limit | None. |
| Active/tracked session maps | `skills/common/pipeline/agents/lifecycle.js` via shims | Nova orchestration, reviewer lifecycle, shutdown, recovery | None. |
| Runtime/harness classification | `skills/common/pipeline/agents/runtime.js` via shims | Lifecycle spawn/kill and verification launch helper | None. |
| Session state semantic vocabulary | `skills/common/pipeline/agents/session-semantics.js` via shims | ACP monitor, lifecycle, downstream monitors | None. |
| Shutdown signal handling and reaper | `skills/nova/pipeline/agents/shutdown.js` | CLI/module runner/orchestration | None. |
| Agent health degraded/restored state | `skills/nova/pipeline/agents/orchestration-healthcheck.js` on tracked entry | Telemetry/observability sinks and worker health callers | None. |
| Interrupted module status transition on process signal | `shutdown.js` plus lifecycle-state/status-store | Status readers | Full status-store authority reviewed in P14/P15. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Transcript delta event | Common `publishTranscriptDelta` | `agent_type`, `label`, `module_id`, `gate_id`, `gate_type`, `session_key`, `dispatch_id`, `line_kind`, `text`, `transcript_offset?`, optional `line_count` | JSON parse and `VALID_LINE_KINDS` fallback to `info` | Telemetry/observability transcript emitters. |
| Transcript monitor state | Common `readAcpTranscriptState` | `offset`, `byteOffset`, `eventCount`, `lastEventTs`, `lastActivityPoll`, `hardError`, `rateLimited`, `terminal`, `lastDetail`, `partialLine`, `newLines` | Incremental file reader and transcript classifier | ACP monitor and healthcheck. |
| ACP monitor state | Common `buildMonitorState` | `sessionKey`, `sessionState`, `sessionActive`, `transcript`, `unknownPolls`, `transcriptStalePolls`, `gatewayUnreachable`, `gatewayDetail`, `terminal`, `rateLimited`, `reason`, `detail`, `lastDetail`, `lastSummary`, `failed`, `sessionTerminal`, `stopped` | Session semantic helpers and thresholds | Polling, Buster monitor, healthcheck. |
| Active session state JSON | Common lifecycle `persistActiveSession` | `childSessionKey`, `runId`, `label`, `agentId`, `model`, `streamLogPath`, `runtime`, `gatewayLabel`, `cwd`, `activeStatePath`, `trackedAt` | `recoverActiveSession` requires `childSessionKey` | Recovery/session cleanup. |
| Tracked agent entry | Common lifecycle `trackAgent` | `sessionKey`, `agentId`, `gatewayLabel`, `streamLogPath`, `project`, plus caller `extra` telemetry/runtime fields | None beyond caller inputs | Shutdown, healthcheck, orchestration. |
| Spawn gateway request | Common lifecycle `spawnSession` | `task`, `runtime`, `label`, `model`, `cwd`, `thread`, `mode`, `cleanup`, plus ACP-only `agentId`, `streamTo`, optional `thinking` | Gateway accepted response check | Gateway `sessions_spawn`. |
| Spawn session result | Common lifecycle `spawnSession` | `childSessionKey`, `runId`, `label`, `agentId`, `model`, `streamLogPath`, `runtime`, `gatewayLabel`, `cwd`, `activeStatePath` | Accepted status and transcript resolver | Orchestration/reviewer/summary services. |
| Kill session result | Common lifecycle `killSession` | `{ requested, confirmed, state, cleanupAttempted }` | Session status polling and stopped-state semantics | Shutdown/orchestration/recovery callers. |
| Health check identity | `orchestration-healthcheck.js healthCheckIdentity` | `module_id`, `gate_id`, `gate_type`, `gateway_label`, `session_key`, `attempt`, `dispatch_id`, `agent_type` | Tracked entry field normalization | Observability degraded/restored events. |
| Health observability detail | `orchestration-healthcheck.js updateHealthCheckObservability` | `component:'acp_monitor'`, `surface:'gateway'`, `reason`, `detail`, `degraded_at`, optional `restored_at`, `restored_after_ms`, identity fields | Active context/config run context | Telemetry stream/observability sinks. |
| Shutdown state | `shutdown.js` | `{ config, statusDir, currentLabel, shuttingDown }` | Module-local state only | Signal handler and context setters. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Session spawn task prompt | Common `spawnSession` | None in scoped files | Uses `opts.task \|\| prompt` as gateway `sessions_spawn.task` | Gateway `sessions_spawn` tool schema | Gateway response with `status:'accepted'`, `childSessionKey`, optional `runId`/`streamLogPath`. |

No prompt text is built in P04 scoped files; P04 only forwards caller-provided task/prompt content to the gateway spawn tool.

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| Scoped compatibility shims | Static common import failure | No | No retry/backoff | Importer fails during module resolution/evaluation | None. |
| Common `readAcpTranscriptState` | Missing transcript, truncation, read/parse errors | Partial recovery | No retry; next poll rereads from updated offset | Missing file returns prior state; truncation resets offsets; read errors set `lastDetail`; per-line JSON parse ignored | Transcript text details are not redacted in this helper. |
| Common `getAcpMonitorState` | Gateway session status failure | No local retry beyond gateway helper | Gateway helper retries network errors; monitor has no own retry | If transcript progressed, state becomes running; otherwise unreachable | Error message stored in `gatewayDetail`. |
| Common `waitForSessionIdle` | Session remains active/unreachable until deadline | No | Polls every `pollMs`; may extend deadline by `transcriptGraceMs` up to `maxTranscriptExtensions` | Logs debug and proceeds with kill after timeout | None. |
| Common lifecycle `spawnSession` | Gateway spawn not accepted or gateway failure | Yes | Default 3 attempts, 5000 ms delay, 30000 ms gateway timeout per attempt | Throws after final attempt | None. |
| Common lifecycle `recoverActiveSession` | Active session file missing/invalid/missing key | No | No retry/backoff | Returns null; invalid file is removed | None. |
| Common lifecycle `killSession` | Gateway stop/kill/status failures or unconfirmed stop | Conditional | Status polling every 2000 ms; subagent confirm default 120000 ms, ACP 15000 ms; optional ACP `acpx` cleanup | Returns `{ confirmed:false }` if still active; logs warnings | None. |
| Common lifecycle `acpxCleanup` | `acpx` close failure | No | Timeout 10000 ms | Logs DEBUG and continues | None. |
| `shutdown.js parsePsTable/readProcEnv/reaperAfterKill` | `ps`, `/proc`, signal failure | No | Fixed waits 2000 ms then 1000 ms; no retry beyond SIGTERM then SIGKILL | Reaper logs/skips non-fatal failures | None. |
| `shutdown.js performSignalShutdown` | Session stop, status persist, telemetry close failures | No | Delegates stop timing to lifecycle; no retry around status/telemetry | Logs WARN/DEBUG and continues shutdown | None. |
| `shutdown.js registerShutdownHooks` | Duplicate signal while shutdown in progress | Not applicable | No retry | Logs WARN and ignores duplicate signal | None. |
| `orchestration-healthcheck.js verifyAgentAlive` | Missing config/session key, terminal/unknown/unreachable/gateway error | No | Initial `waitMs` sleep; gateway call timeout 10000 ms; no retry | Returns false unless Redis dispatch or transcript progress fallback | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| Scoped compatibility shims | Static common import failure | No | none | none | ESM loader | Importer receives module load failure. |
| Common `readAcpTranscriptState` | Missing transcript/read/parse failure | No direct telemetry | none | none | Function state only | Downstream monitors may emit based on state/reason. |
| Common `getAcpMonitorState` | Gateway session status failure | Indirect | monitor state fields `gatewayUnreachable`, `gatewayDetail` | none in helper | Helper state return | Polling/Buster/healthcheck project this into telemetry. |
| Common `waitForSessionIdle` | Grace timeout | Partial | stdout via helper local logger | `[ACP-MONITOR] [DEBUG] Grace timeout...` | local `log` | No structured telemetry in helper. |
| Common lifecycle `spawnSession` | Spawn retry/final failure | Partial | stdout via helper local logger | `[LIFECYCLE] [WARN] Spawn attempt...` | local `log` | Caller owns structured telemetry. |
| Common lifecycle `recoverActiveSession` | Invalid active state file | No | none | none | Function deletes file | Silent cleanup. |
| Common lifecycle `killSession` | Stop/kill/status failures | Partial | stdout via helper local logger | `[LIFECYCLE] [WARN] ...` | local `log` | Caller owns structured telemetry. |
| Common lifecycle `acpxCleanup` | `acpx` close failure | Partial | stdout via helper local logger | DEBUG close failed | `acpxCleanup` | Non-critical cleanup path. |
| `shutdown.js parsePsTable/readProcEnv/reaperAfterKill` | Process discovery/signal failures | Partial | core logger for outer reaper only | DEBUG `ACP reaper skipped...` or per-PID reaped logs | `reaperAfterKill` | Individual parse/proc read/signal failures mostly silent. |
| `shutdown.js performSignalShutdown` | Session stop/status persist/telemetry close failures | Yes | core logger stderr/file if active | WARN/DEBUG shutdown log lines | `log` | No telemetry stream emission before exit. |
| `shutdown.js registerShutdownHooks` | Duplicate signal | Yes | core logger stderr/file if active | WARN duplicate signal | `log` | Process continues current shutdown. |
| `orchestration-healthcheck.js verifyAgentAlive` | Unknown/unreachable/gateway error | Yes | telemetry/observability sinks plus core logger | `observability.degraded` / `observability.restored`; WARN/ERROR/OK logs | `emitObservabilityDegraded`, `emitObservabilityRestored`, `log` | Transcript progress fallback returns true while degraded. |
| `orchestration-healthcheck.js verifyAgentAlive` | Missing agent/session key or terminal state | Partial | core logger stderr/file if active | ERROR log lines | `log` | Missing agent config returns false with no log. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js runtime | `node` binary | Observed `v24.14.0` during review | All P04 modules | ESM, fs/path/os, process signals, timers | No package pin in scoped files. |
| Node `fs` built-in | Runtime built-in | Node major 24 observed | Common monitor/lifecycle; Nova shutdown | Transcript reads, active-state JSON, proc env, status-store delegated IO | Many failures are best-effort or state-only. |
| Node `child_process.execFileSync` | Runtime built-in | Node major 24 observed | Common lifecycle `acpxCleanup`; Nova shutdown `parsePsTable` | `acpx` cleanup and `ps` process table | Timeouts: `ps` 10000 ms, `acpx` 10000 ms. |
| System `ps` binary/procfs | Host OS | Linux-like procfs assumed | `shutdown.js` | Process reaper discovery and env filtering | Missing/failed `ps` disables victim discovery. |
| `acpx` binary | External CLI | Not pinned in scoped files | Common lifecycle `acpxCleanup` | ACP harness session close fallback | Failure is non-critical. |
| OpenClaw gateway API | Gateway helper | External local service | Common monitor/lifecycle and Nova healthcheck/shutdown | Session status/spawn/send/subagent operations | Gateway helper owns network retry; lifecycle has spawn/stop polling. |
| Common agent helpers | `skills/common/pipeline/agents/*.js` | Internal source | Four Nova agent shims | Canonical shared monitor/lifecycle/runtime/session semantics | Import failure terminates importers. |
| Status-store/lifecycle-state services | Internal source | Internal | `shutdown.js` | Interrupted module status persistence | Full authority reviewed in P14/P15. |
| Telemetry service | Internal source | Internal | `shutdown.js`, `orchestration-healthcheck.js` | Telemetry Redis close and observability events | Sink behavior reviewed in P16. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Transcript delta publish | Per-label rate window | `TRANSCRIPT_MAX_PER_SEC = 5` emitted events/sec | Excess lines bundled into one `info` event | Emitted transcript event has `line_count` | None. |
| ACP monitor wait loop | Poll interval and deadline | `monitor_poll_ms=10000`, total default 600000 ms, transcript grace default 300000 ms, max extensions 3 | Proceeds with kill after timeout | DEBUG stdout log | None. |
| Lifecycle spawn | Retry loop | 3 attempts, 5000 ms delay, 30000 ms gateway timeout | Final failure throws | stdout WARN per retry | None. |
| Lifecycle kill confirmation | Poll loop | ACP 15000 ms, subagent 120000 ms, poll 2000 ms | Returns unconfirmed result; optional ACP cleanup | stdout WARN/OK logs | None. |
| Shutdown tracked session cleanup | Sequential iteration | Current tracked-agent map size | Slow stop delays process exit; failures logged and continue | core logs | None. |
| Shutdown process reaper | Victim list iteration | 2000 ms initial delay + 1000 ms grace between signals | Still-alive unkillable PIDs remain; signal errors ignored | DEBUG logs for signaled/reaped paths | None. |
| Healthcheck liveness probe | Single gateway call after wait | wait default 8000 ms; gateway timeout 10000 ms | Returns false or transcript fallback true; no retry | Observability degraded/restored | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Session status gateway response | Gateway `session_status` | OpenClaw gateway | Common monitor/lifecycle, Nova healthcheck | Gateway helper timeout/retry; lifecycle stop polling | Normalized by `parseSessionState` from `acp.state`, `state`, `status`, or textual status. |
| Transcript JSONL event | ACP/subagent runtime transcript | Agent runtime | Common `readAcpTranscriptState`, `publishTranscriptDelta` | Incremental byte offset; partial-line buffering; rate-limited delta publishing | Fields observed: `ts`, `kind`, `text`, `data.text`, `offset`, lifecycle `phase`, `data.error`. |
| Transcript delta telemetry payload | Common `publishTranscriptDelta` | Nova/Buster polling/observability callers | Telemetry emit function | Max 5 emitted events/sec per label; overflow bundled | See data schema `Transcript delta event`. |
| Session spawn gateway request/result | Common lifecycle `spawnSession` | Nova callers through gateway | OpenClaw gateway and session trackers | Spawn retry loop; no queue | Request includes `task`, `runtime`, `label`, `model`, `cwd`, `thread`, `mode`, `cleanup`, ACP-only `agentId`/`streamTo`. |
| Session stop gateway requests | Common lifecycle `killSession` | Shutdown/orchestration/recovery | OpenClaw gateway | Status polling confirmation; subagent kill then `/stop`; optional ACP `acpx` cleanup | `subagents { action:'kill' }`, `sessions_send { message:'/stop' }`, `session_status`. |
| Active session state file | Common lifecycle | Pipeline runtime | Recovery helpers | Atomic write/rename; delete on clear | JSON schema listed above. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| ACP monitor running/closed/unreachable/rate-limited state handling | `tests/verification/behavior/areas/runtime-monitor.mjs` | Good direct behavior coverage | Does not exhaust every statusText regex. |
| Transcript incremental reads and idle grace | `tests/verification/behavior/areas/transcript-monitor.mjs` | Strong behavior coverage for offsets/grace | Does not cover transcript read failure detail. |
| Healthcheck fallback and observability degraded/restored | `tests/verification/behavior/areas/transcript-monitor.mjs` | Strong behavior coverage | None found. |
| Shutdown wiring delegates to lifecycle and gateway helpers | `tests/verification/behavior/areas/shutdown-integration.mjs` | Strong source/API boundary coverage | Does not execute actual process reaper. |
| Runtime model classification | `tests/verification/behavior/areas/models.mjs` | Good slice coverage | Limited model vocabulary. |
| Lazy dynamic import in common ACP monitor is documented and unique | `tests/verification/contracts/check-critical-dynamic-imports.mjs` | Strong source-contract coverage | None found. |
| Nova startup public `registerShutdownHooks` export | `tests/verification/runtime/check-nova-startup-smoke.mjs` | Good public API smoke | Does not test signal delivery. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- None yet.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
