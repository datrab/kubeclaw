# Batch C00b — Common agent, integration, and service helpers

Status: completed
Date started: 2026-05-09
Date completed: 2026-05-09
Reviewer: Nova

## Scope

```text
skills/common/pipeline/agents/acp-monitor.js
skills/common/pipeline/agents/lifecycle.js
skills/common/pipeline/agents/runtime.js
skills/common/pipeline/agents/session-semantics.js
skills/common/pipeline/integrations/discord-webhook.js
skills/common/pipeline/integrations/gateway.js
skills/common/pipeline/services/rate-limit-contract.js
```

Scope expansion verified live: 7 files, under the 10-file maximum. All scoped files were read end to end.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/common/pipeline/agents/acp-monitor.js
kubeclaw-main/skills/common/pipeline/agents/lifecycle.js
kubeclaw-main/skills/common/pipeline/agents/runtime.js
kubeclaw-main/skills/common/pipeline/agents/session-semantics.js
kubeclaw-main/skills/common/pipeline/integrations/discord-webhook.js
kubeclaw-main/skills/common/pipeline/integrations/gateway.js
kubeclaw-main/skills/common/pipeline/services/rate-limit-contract.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/contracts/check-common-helper-import-surface.mjs
kubeclaw-main/tests/verification/contracts/check-critical-dynamic-imports.mjs
kubeclaw-main/tests/verification/behavior/areas/foundations.mjs
kubeclaw-main/tests/verification/behavior/areas/runtime-monitor.mjs
kubeclaw-main/tests/verification/behavior/areas/discord-correlation.mjs
kubeclaw-main/tests/verification/runtime/session-launch-lib.mjs
```

## Per-file map

### `skills/common/pipeline/agents/acp-monitor.js`

Role: Shared ACP/subagent monitor for transcript deltas, transcript progress/error classification, gateway session status, terminal-state decisions, and idle-grace waits.

Imports/dependencies: Node `fs`/`url`; gateway integration; session-state semantics; timing `sleep`; lazy dynamic import of sibling lifecycle for tracked-agent lookup.

Exports/public surface: `publishTranscriptDelta`, `parseSessionState`, `getAcpMonitorConfig`, `classifyTranscriptText`, `readAcpTranscriptState`, `transcriptShowsProgress`, `getAcpMonitorState`, `isSessionTerminal`, `waitForSessionIdle`, and re-exported session semantics.

Defines: Transcript per-label rate limiter; valid transcript line kinds; config defaults; transcript classification patterns; monitor-state builder; Nova-compatible and direct call signatures.

Important variables/state: `_transcriptRateLimits` map keyed by agent label; transcript cursor state from previous monitor poll; no filesystem writes.

Calls out to: ACP gateway `session_status`; transcript JSONL reads; dynamic import of lifecycle tracker; sleep loop.

Called by / expected callers: Nova polling/session-end/observability, Buster rate-limit recovery, runtime verification helpers, session lifecycle helpers.

Environment variables / CLI inputs / config fields: Gateway env resolved by integration helper; monitor config fields `unknown_poll_limit`, `stale_poll_limit`, `max_transcript_extensions`, `transcript_grace_ms`, `monitor_poll_ms` and camelCase aliases.

Paths built/read/written: Reads optional transcript stream log path with byte offset; no writes.

Authority behavior: Owns common session monitor interpretation of gateway status plus transcript progress/error state; does not own session creation/kill.

Error/retry/terminal behavior: Transcript read failures become `lastDetail` but do not throw. Gateway status failure marks gateway unreachable; transcript progress can preserve running state, otherwise state becomes unreachable. Hard transcript errors and terminal session states mark terminal. Idle wait extends deadline while transcript progresses, then returns or times out.

Verification coverage: `runtime-monitor.mjs` directly exercises session status, gateway unreachable, transcript progress, and rate-limit transcript classification; `check-critical-dynamic-imports.mjs` covers the justified lazy lifecycle import.

Findings: `C00b-ISSUE-001`.

### `skills/common/pipeline/agents/lifecycle.js`

Role: Shared session lifecycle helper for active-session tracking, spawn through gateway, transcript path resolution, session stop/kill, and fallback ACP harness cleanup.

Imports/dependencies: Node `child_process.execFileSync`, `fs`, `os`, `path`; gateway integration; monitor parsing/stop semantics; runtime resolver; sleep.

Exports/public surface: active/tracked-agent helpers, transcript path resolvers, `acpxCleanup`, `spawnSession`, `killSession`, `killActiveSession`.

Defines: Module-local active session and tracked-agent registry; atomic JSON writer; active-state persistence/recovery; gateway request normalizer; spawn retry loop; kill confirmation and fallback cleanup.

Important variables/state: `_activeSession`; `_trackedAgents`; optional persisted active-session JSON file.

Calls out to: Gateway `sessions_spawn`, `sessions_send`, `session_status`, `subagents`; system `acpx`; filesystem `.openclaw` session metadata and active-state JSON; sleep loop.

Called by / expected callers: Nova/Buster lifecycle wrappers and common compatibility surfaces.

Environment variables / CLI inputs / config fields: Gateway env through integration; spawn/session options `model`, `runtime`, `agentId`, `cwd`, `label`, `activeStatePath`, `thinking`, `maxRetries`, `retryDelayMs`, tracking flags; kill options `runtime`, `model`, `agentId`, `label`, confirmation timeouts.

Paths built/read/written: Optional active-session state file; `~/.openclaw/agents/<parentAgentId>/sessions/sessions.json` and referenced transcript file; no direct pipeline status writes.

Authority behavior: Owns process-local and optional file-backed active child-session record; gateway remains authority for actual session state.

Error/retry/terminal behavior: Active-session cleanup file delete is best-effort. Recover deletes malformed/missing-key state. Spawn retries up to max retries on all failures and throws after exhaustion. Kill first checks stopped, requests subagent kill or `/stop`, polls confirmation, optionally confirms subagent inactivity, and for ACP sessions runs `acpx` cleanup if stop is unconfirmed. `acpx` failures are non-critical logs.

Verification coverage: Shared import-surface and runtime monitor/session-launch verification cover major lifecycle seams, but no explicit schema validator for spawn/kill/monitor result shapes; tracked as `C00b-ISSUE-001`.

Findings: `C00b-ISSUE-001`.

### `skills/common/pipeline/agents/runtime.js`

Role: Shared model-to-harness and runtime resolver.

Imports/dependencies: None.

Exports/public surface: `modelToHarness`, `isSubagentModel`, `resolveRuntime`.

Defines: String matching for Claude/Codex/GPT/Gemini/OpenCode/Kimi and OpenAI/Codex subagent model detection.

Important variables/state: Stateless.

Calls out to: None.

Called by / expected callers: Shared lifecycle spawn/kill and Nova/Buster runtime facades.

Environment variables / CLI inputs / config fields: Runtime/model input object or string.

Paths built/read/written: None.

Authority behavior: Owns shared default dispatch of model/runtime to ACP vs subagent.

Error/retry/terminal behavior: Unknown model returns null harness; unknown runtime falls back to model-derived runtime or ACP.

Verification coverage: Foundations/import-surface tests cover common helper presence and compatibility.

Findings: None.

### `skills/common/pipeline/agents/session-semantics.js`

Role: Shared state-name semantics for session monitor decisions.

Imports/dependencies: None.

Exports/public surface: `ACP_MONITOR_REASONS`, `isSessionTerminalState`, `isStoppedSessionState`, `isUnreachableSessionState`.

Defines: Terminal, stopped, and unreachable regex state sets.

Important variables/state: Stateless frozen reason object.

Calls out to: None.

Called by / expected callers: Common ACP monitor/lifecycle and Nova/Buster wrappers.

Environment variables / CLI inputs / config fields: State strings from gateway/session status.

Paths built/read/written: None.

Authority behavior: Owns common terminal/stopped/unreachable classification.

Error/retry/terminal behavior: Empty/null states stringify to non-matching empty string; helpers return booleans.

Verification coverage: Runtime monitor tests indirectly exercise these semantics.

Findings: None.

### `skills/common/pipeline/integrations/discord-webhook.js`

Role: Shared Discord webhook POST helper with timeout and structured delivery error.

Imports/dependencies: Global `fetch`, `AbortSignal.timeout` when available.

Exports/public surface: `DiscordWebhookDeliveryError`, `postDiscordWebhook`.

Defines: Default 10s timeout; 500-character error-body preview; timeout signal helper; body preview reader.

Important variables/state: Stateless.

Calls out to: Discord webhook HTTP endpoint or caller-supplied `fetchImpl`.

Called by / expected callers: Nova/Buster Discord integrations and visual/task notification helpers.

Environment variables / CLI inputs / config fields: None directly; caller supplies URL, payload/body, headers, timeout, signal, fetch implementation.

Paths built/read/written: None.

Authority behavior: Owns common HTTP delivery result/error shape for Discord webhook calls.

Error/retry/terminal behavior: Missing URL/fetch throws `DiscordWebhookDeliveryError`. Non-OK HTTP reads preview and throws. Network/fetch errors are wrapped. No retry/backoff.

Verification coverage: Operator/Discord behavior tests cover non-critical handling through callers; helper itself is import-surface covered.

Findings: None.

### `skills/common/pipeline/integrations/gateway.js`

Role: Shared gateway URL/token resolver and `/tools/invoke` HTTP client with network retry.

Imports/dependencies: Timing `sleep`, global `fetch`, `AbortController`.

Exports/public surface: `resolveGatewayBaseUrl`, `resolveGatewayInvokeUrl`, `resolveGatewayHealthUrl`, `resolveGatewayToken`, `gatewayInvoke`.

Defines: Default gateway URLs, URL trimming/suffix handling, authorization header builder, network-error classifier, internal invoke loop.

Important variables/state: Stateless.

Calls out to: Local OpenClaw gateway `/tools/invoke` and `/health` URL construction.

Called by / expected callers: Common lifecycle/monitor and Nova/Buster gateway wrappers.

Environment variables / CLI inputs / config fields: `OPENCLAW_GATEWAY_URL`, `GATEWAY_URL`, `OPENCLAW_GATEWAY_TOKEN`, `GATEWAY_TOKEN`; caller overrides for gateway URL/token/body/headers.

Paths built/read/written: URL strings only; no filesystem paths.

Authority behavior: Owns common gateway endpoint construction and retry behavior for tool invocation.

Error/retry/terminal behavior: Network-like errors retry up to 3 attempts with 5s delay; HTTP non-OK returns an Error with `httpStatus`/`httpBody` and does not retry. Request timeout uses `AbortController` with default 30s. JSON parse failure returns `{raw:text}`.

Verification coverage: Runtime monitor and session-launch helpers exercise gateway invocation via fake gateway. Gateway result schemas are not explicitly validated; tracked as `C00b-ISSUE-001`.

Findings: `C00b-ISSUE-001`.

### `skills/common/pipeline/services/rate-limit-contract.js`

Role: Shared rate-limit Discord field, telemetry payload, embed, and recovery-action contract helper.

Imports/dependencies: None.

Exports/public surface: `DISCORD_FIELD_SPECS`, `buildDiscordIdentityFields`, `buildSessionRateLimitDiscordFields`, `buildRateLimitDetectedPayload`, `formatRateLimitEmbed`, `resolveRateLimitRecoveryAction`.

Defines: Identity field specs, value reader, field normalizer, Discord text truncator, present-value assignment helper.

Important variables/state: Stateless; exported field specs frozen.

Calls out to: None.

Called by / expected callers: Nova/Buster rate-limit services and Discord/telemetry surfaces.

Environment variables / CLI inputs / config fields: Identity objects and rate-limit context data from callers.

Paths built/read/written: None.

Authority behavior: Owns shared shape for rate-limit detected telemetry payloads and Discord identity fields.

Error/retry/terminal behavior: Missing/empty identity values are omitted. Cooldown seconds derive from cooldown ms when retry seconds absent. Recovery action resumes on gateway unreachable or alive session, otherwise kills.

Verification coverage: `discord-correlation.mjs`, telemetry contracts, and rate-limit slice checks cover rate-limit identity joins.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `acp-monitor.js` | `integrations/gateway.js` | `gatewayInvoke`, URL/token resolvers | Polls `session_status` for monitor state. |
| `acp-monitor.js` | `session-semantics.js` | terminal/stopped/unreachable helpers and reasons | Classifies monitor state and terminal reasons. |
| `acp-monitor.js` | `agents/lifecycle.js` | lazy `getTrackedAgent` import | Avoids hard ESM cycle while supporting Nova label lookup. |
| `lifecycle.js` | `integrations/gateway.js` | `gatewayInvoke`, URL/token resolvers | Spawns, stops, kills, lists, and checks sessions. |
| `lifecycle.js` | `acp-monitor.js` | `parseSessionState`, `isStoppedSessionState` | Normalizes gateway session status and confirms stop. |
| `lifecycle.js` | `runtime.js` | `modelToHarness`, `resolveRuntime` | Chooses ACP/subagent spawn arguments and kill timeouts. |
| Nova/Buster rate-limit services | `rate-limit-contract.js` | payload, embed, action builders | Shared rate-limit telemetry/Discord/recovery semantics. |
| Nova/Buster Discord callers | `discord-webhook.js` | `postDiscordWebhook` | Shared webhook delivery with structured errors. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `acp-monitor.js publishTranscriptDelta` | Transcript lines exceed 5/sec window | per-label count/window | Emit one aggregated info event instead of each line | Transcript telemetry throttling. |
| `acp-monitor.js parseSessionState` | Structured ACP state vs status text | gateway status result | Structured state preferred; status text regex fallback | Handles multiple gateway response shapes. |
| `acp-monitor.js buildMonitorState` | Rate-limit transcript, hard error, terminal session, unknown+stale | transcript/session state/poll counters | Reason and terminal flags assigned in that precedence order | Defines terminal monitor authority. |
| `acp-monitor.js getAcpMonitorState` | Nova signature vs direct signature | argument shape | Nova label lookup or direct child session monitor | Backward-compatible API. |
| `lifecycle.js spawnSession` | runtime is subagent vs ACP | resolved runtime/model | Subagent omits `agentId`/`streamTo`; ACP includes them | Gateway spawn payload differs by runtime. |
| `lifecycle.js killSession` | already stopped, subagent, ACP fallback | status/runtime/request result | Return, subagent kill, `/stop`, list-confirm, or `acpx` cleanup | Stop escalation sequence. |
| `runtime.js resolveRuntime` | explicit runtime/dispatch, then model | runtime/model strings | explicit `acp\|subagent` wins; otherwise model-based default | Shared dispatch selection. |
| `gateway.js invokeGatewayTool` | network-like error vs HTTP error | error fields/status | Network errors retry; HTTP errors throw immediately | Gateway retry semantics. |
| `rate-limit-contract.js resolveRateLimitRecoveryAction` | gateway unreachable or session alive | booleans | Resume; otherwise kill | Shared rate-limit recovery action. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `acp-monitor.js readAcpTranscriptState` | Transcript cursor state | previous state and file bytes | Preserve prev, reset on truncation, append complete new lines, carry partial line | Byte-offset monitor can resume across polls. |
| `acp-monitor.js publishTranscriptDelta` | `_transcriptRateLimits` | agent label/new lines | Reset window after 1s; increment by emitted event count | Max 5 transcript events/sec/label. |
| `lifecycle.js trackAgent/untrackAgent` | `_trackedAgents` | label/session metadata | Label key replaced on track, deleted on untrack | Label lookup surface for monitor compatibility. |
| `lifecycle.js setActiveSession/clear/recover` | `_activeSession` and optional file | session data/file path | Persist atomic JSON on set, delete unless preserveFile, recover only with childSessionKey | Active session state can survive restart when file valid. |
| `rate-limit-contract.js buildRateLimitDetectedPayload` | Payload object | identity/context | Assign non-empty identity fields; derive retry seconds from cooldown ms when absent | Sparse flat telemetry payload. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `acp-monitor.js waitForSessionIdle` | Until deadline | `monitor_poll_ms` default 10000 ms | total timeout default 600000 ms; transcript grace default 300000 ms, max 3 extensions | Terminal/unreachable/non-active returns; timeout proceeds. |
| `lifecycle.js waitForSessionStop` | Until deadline | poll default 2000 ms | timeout default caller-specific 15000/120000 ms | stopped state confirmed or timeout. |
| `lifecycle.js spawnSession` | attempt <= maxRetries | retry delay default 5000 ms | gateway request timeout 30000 ms | accepted spawn returns; exhaustion throws. |
| `gateway.js invokeGatewayTool` | attempt <= maxRetries | retry delay default 5000 ms for network errors | request timeout default 30000 ms | success returns parsed/raw response; HTTP/final network error throws. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `acp_monitor.*` / camelCase aliases | Config object | `acp-monitor.js` | unknown/stale 10, transcript extensions 3, grace 300000 ms, poll 10000 ms | Monitor thresholds and idle wait timing. |
| `OPENCLAW_GATEWAY_URL`, `GATEWAY_URL` | Env vars | `gateway.js` | `http://127.0.0.1:18789` | Gateway base/invoke/health URL source. |
| `OPENCLAW_GATEWAY_TOKEN`, `GATEWAY_TOKEN` | Env vars | `gateway.js` | empty string | Bearer token for gateway calls. |
| `spawnSession` options/session payload | Runtime input | `lifecycle.js` | runtime/model/cwd/label defaults | Session spawn payload and active-state persistence controls. |
| `killSession` options | Runtime input | `lifecycle.js` | subagent confirm 120000 ms, ACP confirm 15000 ms, poll 2000 ms | Stop escalation timing and runtime-specific behavior. |
| Discord webhook options | Runtime input | `discord-webhook.js` | timeout 10000 ms | URL, payload/body, headers, signal, fetch implementation. |
| Rate-limit identity/context | Runtime input | `rate-limit-contract.js` | provider `anthropic` | Telemetry payload and Discord field construction. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| ACP transcript stream log | lifecycle caller or `resolveSubagentTranscriptPath` | `acp-monitor.js`, `lifecycle.js` | ACP/subagent runtime outside C00b | Byte-offset incremental read with partial-line carry. |
| `~/.openclaw/agents/<parent>/sessions/sessions.json` | `lifecycle.js resolveSubagentTranscriptPath` | `lifecycle.js` | OpenClaw agent runtime | Used to locate subagent transcript JSONL. |
| Active-session state file | caller `activeStatePath` | `lifecycle.js recoverActiveSession` | `lifecycle.js setActiveSession` | Atomic JSON with child session metadata. |
| Gateway invoke/health URLs | `gateway.js` | gateway callers | None | Normalizes `/tools/invoke` suffix and trailing slash. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| ACP monitor state | `acp-monitor.js buildMonitorState` | Nova/Buster polling, rate-limit, lifecycle callers | Result schema validator missing; tracked as `C00b-ISSUE-001`. |
| Active child-session record | `lifecycle.js` | `getActiveSession`, `killActiveSession`, restart recovery from file | Gateway remains authority for actual live status. |
| Tracked agent registry | `lifecycle.js trackAgent` | `acp-monitor.js` lazy lookup | Process-local only. |
| Runtime dispatch choice | `runtime.js resolveRuntime` | lifecycle/session spawn callers | None. |
| Gateway request/response boundary | `gateway.js gatewayInvoke` | lifecycle/monitor/Nova/Buster gateway callers | Response schema normalization is caller-specific; tracked as `C00b-ISSUE-001`. |
| Rate-limit payload and Discord field contract | `rate-limit-contract.js` | Nova/Buster rate-limit services | None. |
| Discord webhook delivery result/error | `discord-webhook.js` | Nova/Buster Discord callers | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Transcript delta event input | `acp-monitor.js publishTranscriptDelta` | JSONL lines with optional `kind`, `text`, `data.text`, `offset`; emitted fields include agent/module/gate/session/dispatch identity, `line_kind`, `text`, `transcript_offset`, optional `line_count` | Kind allowlist; JSON parse best-effort | Telemetry emit function callers. |
| Transcript state | `readAcpTranscriptState` | `{offset, byteOffset, eventCount, lastEventTs, lastActivityPoll, hardError, rateLimited, terminal, lastDetail, partialLine, newLines}` | Local cursor logic only | Monitor state builder. |
| ACP monitor state | `buildMonitorState` | `{sessionKey, sessionState, sessionActive, transcript, unknownPolls, transcriptStalePolls, gatewayUnreachable, gatewayDetail, terminal, rateLimited, reason, detail, lastDetail, lastSummary, failed, sessionTerminal, stopped}` | Local builder; no exported validator | Polling/rate-limit/lifecycle consumers. |
| Active session persisted JSON | `lifecycle.js persistActiveSession` | `childSessionKey`, `runId`, `label`, `agentId`, `model`, `streamLogPath`, `runtime`, `gatewayLabel`, `cwd`, `activeStatePath`, `trackedAt` | `recoverActiveSession` requires `childSessionKey` only | Active session recovery/kill. |
| Spawn session data | `lifecycle.js spawnSession` | `childSessionKey`, `runId`, `label`, `agentId`, `model`, `streamLogPath`, `runtime`, `gatewayLabel`, `cwd`, `activeStatePath` | Gateway accepted-status check only | Session lifecycle callers. |
| Kill session result | `lifecycle.js killSession` | `{requested:boolean, confirmed:boolean, state:string, cleanupAttempted:boolean}` | Local stop confirmation logic | `killActiveSession`, callers. |
| Gateway invoke request | `gateway.js invokeGatewayTool` | POST JSON `{tool, args, ...body}` to `/tools/invoke`, Authorization optional | HTTP status and JSON parse only | Gateway backend. |
| Gateway invoke result | `gateway.js invokeGatewayTool` | Parsed JSON object or `{raw:string}` | JSON parse fallback; no schema validator | Lifecycle/monitor callers. |
| Discord webhook result/error | `postDiscordWebhook` | success `{ok:true,status,statusText}`; `DiscordWebhookDeliveryError` with `code`, optional `status`, `statusText`, `bodyPreview`, `cause` | Helper class | Discord callers. |
| Rate-limit detected payload | `buildRateLimitDetectedPayload` | Sparse flat identity plus `provider`, retry/cooldown/resume/pause/detail fields | Builder omits null/empty fields | Telemetry/Discord callers. |
| Rate-limit embed | `formatRateLimitEmbed` | `{title,description,fields[]}` with Cause/Pause/Cooldown/Resume at | local formatter/truncation | Discord callers. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Session spawn task prompt | `lifecycle.js spawnSession` | None found in scoped files | Caller-supplied `prompt` becomes gateway `sessions_spawn.task`; no local prompt template | Gateway tool `sessions_spawn` with runtime/model/label/cwd/mode/cleanup and ACP-specific agentId/streamTo | Gateway result must be accepted and include child session identity; no local output parser beyond accepted check. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `acp-monitor.js readAcpTranscriptState` | Missing/truncated/unreadable transcript | Missing/truncated handled; read no retry | No retry; byte offset reset on truncation | Missing returns previous-like state; read failure stores `lastDetail` | Error message included raw. |
| `acp-monitor.js getDirectAcpMonitorState` | Gateway status failure | No local retry beyond gateway helper | Gateway helper timeout/retry applies | Marks gateway unreachable; transcript progress can keep session active | Error message included as gateway detail. |
| `acp-monitor.js waitForSessionIdle` | Active transcript/session while waiting | Poll loop | Poll default 10000 ms; total 600000 ms; transcript grace 300000 ms up to 3 extensions | Returns on terminal/inactive/unreachable without active transcript, otherwise timeout proceeds | Logs only. |
| `lifecycle.js spawnSession` | Gateway spawn rejected/failure | Yes | max retries default 3, delay 5000 ms, request timeout 30000 ms | Throws after exhaustion | Error message logged/thrown raw. |
| `lifecycle.js killSession` | Stop/kill request failure or unconfirmed stop | Partial | confirm poll 2000 ms; timeout 15000 ms ACP / 120000 ms subagent | Logs warnings; may fallback to subagent list or `acpx`; returns unconfirmed instead of throwing | Error message logged raw. |
| `lifecycle.js` active-state IO | Persist/recover/clear failures | No | Atomic write; no retry | Persist write throws; recover/clear malformed or cleanup failures are best-effort | Error in cleanup stderr raw. |
| `discord-webhook.js postDiscordWebhook` | Missing URL/fetch, HTTP non-OK, network/timeout | No | AbortSignal timeout default 10000 ms | Throws structured delivery error | Body preview capped 500; no secret redaction. |
| `gateway.js gatewayInvoke` | Network/abort vs HTTP/non-JSON | Network only | maxRetries 3, retryDelay 5000 ms, timeout default 30000 ms | HTTP/final error throws; non-JSON returns `{raw}` | HTTP body retained raw on error. |
| `rate-limit-contract.js` | Missing identity/cooldown values | Not applicable | None | Omits missing fields; action defaults kill unless alive/unreachable | Detail not redacted locally. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `acp-monitor.js readAcpTranscriptState` | Transcript missing/read failure | Partial | Returned monitor/transcript state | `lastDetail=transcript-read-failed...` | `readAcpTranscriptState` | Caller decides telemetry. |
| `acp-monitor.js getDirectAcpMonitorState` | Gateway status failure | Partial | Returned monitor state | `gatewayUnreachable`, `gatewayDetail`, `sessionState` | `buildMonitorState` | Caller decides telemetry. |
| `acp-monitor.js waitForSessionIdle` | Timeout/extension paths | Partial | stdout | `[ACP-MONITOR] [DEBUG] ...` | `log` | No event emission. |
| `lifecycle.js spawnSession` | Spawn retry/exhaustion | Partial | stdout and thrown error | `[LIFECYCLE] [WARN] Spawn attempt...` | `log`, thrown error | Caller decides telemetry. |
| `lifecycle.js killSession` | Stop/kill/fallback failures | Partial | stdout and returned result | `[LIFECYCLE] [WARN] ...`, kill result | `log`, `killSession` | Caller decides telemetry. |
| `lifecycle.js` active-state IO | Cleanup/recover failures | Partial | stderr for cleanup, silent recover cleanup | `[session-lifecycle] active-session cleanup failed...` | `clearPersistedActiveSession` | Persist write throws. |
| `discord-webhook.js postDiscordWebhook` | Delivery failure | None in helper | Caller decides | none | none | Structured error for caller logging/telemetry. |
| `gateway.js gatewayInvoke` | Gateway failure | None in helper | Caller decides | none | none | Raw HTTP body available on error. |
| `rate-limit-contract.js` | Missing/defaulted fields | None | Caller decides | none | none | Pure builder. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| OpenClaw gateway HTTP API | Local gateway `/tools/invoke` | runtime API | `gateway.js`, `acp-monitor.js`, `lifecycle.js` | Session status, spawn, stop, subagent kill/list | Network retry only; HTTP errors terminal. |
| ACP harness CLI `acpx` | System binary | runtime installed | `lifecycle.js acpxCleanup` | Fallback ACP session close | Failure logged non-critical. |
| Discord webhook HTTP API | External HTTPS | webhook endpoint | `discord-webhook.js` | Notification delivery | No retry; errors structured. |
| Node `fs` | Runtime built-in | Node runtime | `acp-monitor.js`, `lifecycle.js` | Transcript and active-state files | Read failures degrade; persist write throws. |
| Node `os`/`path`/`url` | Runtime built-ins | Node runtime | `lifecycle.js`, `acp-monitor.js` | Session metadata and dynamic import path resolution | None. |
| Timer/AbortController/fetch | Runtime globals | Node runtime | `gateway.js`, `discord-webhook.js`, monitor/lifecycle | HTTP timeout/retry and waits | Missing fetch causes runtime errors; Discord helper wraps missing fetch. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Transcript delta publishing | Max 5 events/sec per agent label | hard-coded | Excess batch is aggregated into one info event | Emitted `line_count` and joined text | Null labels share one bucket. |
| ACP monitor unknown/stale terminal | Poll counters | unknown 10, stale 10 | Terminal only when both unknown and stale exceeded | Monitor state fields | None. |
| Session idle grace | Deadline extensions | total 600s, transcript grace 300s, max extensions 3 | Extends while transcript active; then proceeds | DEBUG logs | None. |
| Spawn retry | Sequential attempts | max 3, delay 5s | Throws after exhaustion | WARN logs/thrown error | None. |
| Kill confirmation | Poll loop | subagent 120s, ACP 15s, poll 2s | Fallback list/acpx then returns unconfirmed if still active | WARN/OK logs and kill result | None. |
| Gateway invoke retry | Sequential network retry | max 3, delay 5s, timeout 30s | HTTP errors not retried; network final error throws | Caller-owned | None. |
| Discord webhook delivery | Single request | timeout 10s | Any failure throws | Caller-owned structured error | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Transcript delta projection | `{agent_type,label,module_id,gate_id,gate_type,session_key,dispatch_id,line_kind,text,transcript_offset,line_count?}` | `acp-monitor.js publishTranscriptDelta` | Caller-provided telemetry emit function | Max 5 events/sec/label; excess lines aggregated | Telemetry event callback payload. |
| Transcript monitor state | Byte-offset JSONL cursor plus hard/rate-limit flags | `acp-monitor.js readAcpTranscriptState` | `buildMonitorState`, polling callers | Incremental file read with partial-line carry | Transcript state object. |
| Gateway session status | `session_status` tool with `{sessionKey}` | `gateway.js` / gateway backend | `acp-monitor.js`, `lifecycle.js` | Gateway helper retries network errors | Parsed `active/state/raw` lifecycle state. |
| Session spawn | `sessions_spawn` tool payload with task/runtime/label/model/cwd/thread/mode/cleanup and ACP fields `agentId/streamTo/thinking` | `lifecycle.js spawnSession` | Gateway backend | Retry loop around spawn | Accepted result normalized to session data. |
| Session stop/kill | `sessions_send` `/stop`, `subagents kill/list`, ACP `acpx sessions close` fallback | `lifecycle.js killSession` | Gateway/acpx | Confirmation poll loop | Kill result object and lifecycle logs. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Runtime monitor gateway/transcript behavior | `runtime-monitor.mjs` | Good behavior coverage | Does not enforce explicit schema validators. |
| Common helper import compatibility | `check-common-helper-import-surface.mjs` | Good surface coverage | Does not execute every helper branch. |
| Lazy dynamic import justification | `check-critical-dynamic-imports.mjs` | Surface coverage | None. |
| Rate-limit identity/Discord joins | `discord-correlation.mjs`, telemetry contract checks | Good | None. |
| Session launch runtime helpers | `runtime/session-launch-lib.mjs` | Runtime helper coverage | Not a direct unit contract for lifecycle result schema. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- `C00b-ISSUE-001` — Common ACP/gateway helper result shapes are consumed as contracts but have no central validator/schema owner.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
