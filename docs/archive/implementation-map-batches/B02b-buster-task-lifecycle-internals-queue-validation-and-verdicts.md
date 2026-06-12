# Batch B02b — Buster task lifecycle internals, queue, validation, and verdicts

Status: completed
Date started: 2026-05-09
Date completed: 2026-05-09
Reviewer: Nova

## Scope

```text
skills/buster/pipeline/services/task-lifecycle/cleanup.js
skills/buster/pipeline/services/task-lifecycle/completion-signal.js
skills/buster/pipeline/services/task-lifecycle/git-sync.js
skills/buster/pipeline/services/task-lifecycle/session.js
skills/buster/pipeline/services/task-queue.js
skills/buster/pipeline/services/task-validation.js
skills/buster/pipeline/services/verdict-schema.js
```

Scope expansion verified live: 7 files, under the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/buster/pipeline/services/task-lifecycle/cleanup.js
kubeclaw-main/skills/buster/pipeline/services/task-lifecycle/completion-signal.js
kubeclaw-main/skills/buster/pipeline/services/task-lifecycle/git-sync.js
kubeclaw-main/skills/buster/pipeline/services/task-lifecycle/session.js
kubeclaw-main/skills/buster/pipeline/services/task-queue.js
kubeclaw-main/skills/buster/pipeline/services/task-validation.js
kubeclaw-main/skills/buster/pipeline/services/verdict-schema.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/contracts/check-buster-pipeline-slice-surface.mjs
kubeclaw-main/tests/verification/runtime/check-buster-startup-smoke.mjs
kubeclaw-main/tests/verification/behavior/areas/buster-runtime-normalization.mjs
```

## Per-file map

### `skills/buster/pipeline/services/task-lifecycle/cleanup.js`

Role: Lifecycle wrapper for sandbox cleanup telemetry.

Imports/dependencies: `emitEvent` from Buster telemetry; `doSandboxCleanup` from pipeline helpers.

Exports/public surface: `runSandboxCleanupStage({ payload, moduleId, tctx, logger, stage, logCompletion })`.

Defines: No constants; computes cleanup duration per call.

Important variables/state: Local `cleanupStart` timestamp.

Calls out to: `emitEvent` for started/completed cleanup events; `doSandboxCleanup(stage, payload)`; optional logger.

Called by / expected callers: `task-lifecycle.js` pre/final cleanup stages.

Environment variables / CLI inputs / config fields: Delegated to cleanup helper/service; uses task payload and stage.

Paths built/read/written: Delegated to sandbox cleanup service.

Authority behavior: Cleanup telemetry wrapper only; cleanup authority remains in `sandbox-cleanup.js`.

Error/retry/terminal behavior: Does not catch cleanup or telemetry errors; caller task lifecycle owns propagation/finalization context.

Verification coverage: Buster runtime normalization covers cleanup result/terminal completion behavior through callers.

Findings: None.

### `skills/buster/pipeline/services/task-lifecycle/completion-signal.js`

Role: Emit terminal Buster completion signal to Nova's completion stream.

Imports/dependencies: Rate-limit pause resolver and pre-test verdict builder; runtime error sanitizer; queue Redis client; completion field emitter.

Exports/public surface: `sendTaskCompletionSignal(args)`.

Defines: No constants.

Important variables/state: Mutates caller-owned `completionState` with `attempted`, `stream`, `terminal`, `error`.

Calls out to: `getRedisClient()`, Redis completion `xadd` through `emitTaskCompletion`, logger.

Called by / expected callers: `task-lifecycle.js` `finally` block.

Environment variables / CLI inputs / config fields: Payload `completion_stream`; task/run/attempt/dispatch/session identity; rate-limit settings for RATE_LIMITED completion projection.

Paths built/read/written: Redis completion stream only.

Authority behavior: Owns lifecycle terminal completion emission when task lifecycle reaches finalization. Pre-test verdict is included only when no subagent spawned.

Error/retry/terminal behavior: Missing completion stream returns without marking attempted. Redis errors are caught, sanitized, recorded on `completionState.error`, and logged; task queue later enforces completion/dead-letter before ACK.

Verification coverage: Buster runtime normalization covers terminal completion fallback/ACK behavior; Buster pipeline slice covers rate-limit pause budget projection.

Findings: None.

### `skills/buster/pipeline/services/task-lifecycle/git-sync.js`

Role: Resolve repo root, run Buster git sync, and emit git-sync telemetry.

Imports/dependencies: `gitSync`, `getRepoRoot`; Buster telemetry.

Exports/public surface: `syncTaskRepo({ payload, commitHash, moduleId, tctx, logger })`.

Defines: Sync result shape.

Important variables/state: Local `repoRoot`, `actualHash`, `syncResult`.

Calls out to: Git workflow service and telemetry.

Called by / expected callers: `task-lifecycle.js` git-sync stage.

Environment variables / CLI inputs / config fields: `payload.session.cwd`, `commitHash`.

Paths built/read/written: Git repo root resolved from session cwd or process cwd; git workflow mutates repo checkout.

Authority behavior: Delegates Git state authority to `git-workflows.js`, but projects result into telemetry and task lifecycle decision.

Error/retry/terminal behavior: `gitSync` returns `null` on failure; this wrapper emits `ok:false` telemetry and returns error `git_sync_failed` to caller.

Verification coverage: Buster pipeline/runtime behavior covers git-sync failure routing indirectly.

Findings: None.

### `skills/buster/pipeline/services/task-lifecycle/session.js`

Role: Buster child-session spawn, monitor, kill, and outcome publication helpers.

Imports/dependencies: Common lifecycle shim `spawnSession`, `killSession`, `clearActiveSession`; repo root; telemetry; Buster path/embed/result helpers; session monitor; runtime error sanitizer.

Exports/public surface: `spawnTaskSession`, `monitorTaskSession`, `killTaskSession`, `publishTaskOutcome`.

Defines: Default model `anthropic/claude-sonnet-4-6` when payload session model absent.

Important variables/state: Mutates telemetry context `tctx.sessionKey` and `tctx.dispatchId` after spawn.

Calls out to: ACP session lifecycle, active-agent status marker, Discord, telemetry, monitor, kill, result resolver.

Called by / expected callers: `task-lifecycle.js` session stages.

Environment variables / CLI inputs / config fields: Payload `session.model`, `session.cwd`, runtime/agent/label fields delegated to common lifecycle, prompt, timeout seconds, status JSON path, task/gate identity.

Paths built/read/written: Active-session path via `resolveBusterActiveSessionPath`; status active-agent path; stream log path from session data.

Authority behavior: Creates active-session recovery evidence, marks status active agent, and clears common active session after kill. Outcome authority uses `resolveBusterAgentResult` result/source routing.

Error/retry/terminal behavior: Spawn failure returns `{ ok:false }`. Monitor exceptions trigger best-effort kill, active-session clear with preservation if unconfirmed, `agent.killed` telemetry reason `monitor_error`, and `{ ok:false }`. Kill skips duplicate kill when monitor already issued and confirmed timeout kill; otherwise kills and clears active session preserving file if unconfirmed. Outcome publishes timeout or session-complete Discord embed.

Verification coverage: Buster pipeline slice asserts monitor exception handling, active-session clearing/preservation, rate-limit completion, and session identity.

Findings: None.

### `skills/buster/pipeline/services/task-queue.js`

Role: Redis task queue client, pending reclaim, dequeue, task dispatch, dead-letter, ACK, stream trimming, and Redis lifecycle helpers.

Imports/dependencies: Node `hostname`; Redis constructor loader; sandbox cleanup; task type constants; runtime diagnostics; task completion/dead-letter helpers.

Exports/public surface: queue constants, `getRedisClient`, `disconnectRedisClient`, `reclaimPendingTask`, `readNextTaskEntry`, `processOneQueuedTask`.

Defines: `AGENT_NAME`, `STREAM_KEY`, `GROUP_NAME`, `CONSUMER_NAME`, `POLL_INTERVAL=2000`, `STREAM_MAX_LEN=250`, `PENDING_RECLAIM_IDLE_MS` default 60000.

Important variables/state: Module-level `RedisCtor` and singleton `redis` client.

Calls out to: Redis `xreadgroup`, `XAUTOCLAIM`, `xack`, `xtrim`, completion/dead-letter `xadd`, sandbox cleanup on task error, diagnostics/artifact writers.

Called by / expected callers: Buster entrypoint main loop and completion-signal Redis getter.

Environment variables / CLI inputs / config fields: `AGENT_NAME`, `BUSTER_TASK_STREAM`, `BUSTER_PENDING_RECLAIM_IDLE_MS`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`; payload `payload` JSON field, Redis `type`/`sender` fields.

Paths built/read/written: Malformed task/process diagnostics and sandbox cleanup paths through callees; Redis streams directly.

Authority behavior: Enforces ACK authority: task ACK only after terminal completion or dead-letter evidence exists. Unknown/malformed tasks are dead-lettered before ACK.

Error/retry/terminal behavior: Redis reconnect behavior via ioredis retryStrategy. Disconnect quit failure falls back to disconnect with diagnostics. Pending entries are reclaimed before reading new tasks. Malformed JSON/type/validation writes dead-letter before ACK or throws terminal guarantee error. Process error runs error cleanup, then completion/dead-letter guarantee before ACK. Stream trimmed after successful normal processing.

Verification coverage: `buster-runtime-normalization.mjs` covers completion-before-ACK, dead-letter-before-ACK, no ACK when both fail, and explicit diagnostic catch paths. Startup smoke covers Redis disconnect helper export.

Findings: None.

### `skills/buster/pipeline/services/task-validation.js`

Role: Validate and normalize required Buster task identity from untrusted Redis payloads.

Imports/dependencies: None.

Exports/public surface: `PIPELINE_TASK_TYPES`, `MalformedBusterTaskError`, `normalizeRequiredIdentity`, `validateBusterTaskPayload`.

Defines: Allowed task types `module_test`, `gate_test`; malformed error shape/code `BUSTER_TASK_MALFORMED`.

Important variables/state: None.

Calls out to: None.

Called by / expected callers: `task-lifecycle.js` and `task-queue.js`; runtime diagnostics uses `normalizeRequiredIdentity` for project hints.

Environment variables / CLI inputs / config fields: Payload fields `task_type`, `module_id`, `project`, `run_id`, `attempt`, `dispatch_id`, and `gate_id` for gate tests.

Paths built/read/written: None.

Authority behavior: Required identity gate before lifecycle telemetry/session work.

Error/retry/terminal behavior: Non-object payload and missing/invalid required identity throw `MalformedBusterTaskError`; task queue dead-letters these without processing.

Verification coverage: Buster runtime normalization covers malformed task dead-letter behavior; pipeline slice verifies task validation behavior indirectly.

Findings: None.

### `skills/buster/pipeline/services/verdict-schema.js`

Role: Deterministic suite verdict, finding, runner verdict, recommendation, and prompt truncation schema helpers.

Imports/dependencies: None.

Exports/public surface: `STATUS`, `SEVERITY`, `RECOMMENDATION`, `createSuiteVerdict`, `createFinding`, `createRunnerVerdict`, `truncateForPrompt`.

Defines: Status enum PASS/FAIL/SKIP/ERROR, severity enum, recommendation enum NO_SUBAGENT/SPAWN.

Important variables/state: None.

Calls out to: None except Date/JSON clone.

Called by / expected callers: Suite runner, suite modules, pipeline helpers/pre-test verdicts, prompt injection callers.

Environment variables / CLI inputs / config fields: `truncateForPrompt(maxFindings=5)` caller input.

Paths built/read/written: `truncateForPrompt` embeds reference `/sandbox/results/<suite>-verdict.json` in synthetic finding text; no direct writes.

Authority behavior: Schema factory for suite and runner verdicts. Runner recommendation is `NO_SUBAGENT` only on critical FAIL/ERROR.

Error/retry/terminal behavior: Invalid suite name/status or finding severity throws immediately.

Verification coverage: Buster suite/pipeline slice and behavior tests consume the factories; no standalone schema contract in B02b scope.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `task-lifecycle/cleanup.js` | `pipeline-helpers.js` | `doSandboxCleanup` | Runs stage-specific cleanup with telemetry envelope. |
| `task-lifecycle/completion-signal.js` | `task-queue.js` | `getRedisClient` | Reuses queue Redis singleton for completion emission. |
| `task-lifecycle/completion-signal.js` | `task-completion.js` | `emitTaskCompletion` | Writes terminal completion stream fields. |
| `task-lifecycle/git-sync.js` | `git-workflows.js` | `getRepoRoot`, `gitSync` | Resolves repo and syncs checkout. |
| `task-lifecycle/session.js` | `agents/lifecycle.js` | `spawnSession`, `killSession`, `clearActiveSession` | ACP session lifecycle boundary. |
| `task-lifecycle/session.js` | `session-monitor.js` | `monitorSession` | Watches spawned child session. |
| `task-lifecycle/session.js` | `pipeline-helpers.js` | active-session/result/embed helpers | Status active-agent, Discord embeds, outcome projection. |
| `task-queue.js` | `task-completion.js` | `ensureTaskTerminalBeforeAck`, `writeTaskDeadLetter` | Completion/dead-letter before ACK guarantee. |
| `task-queue.js` | `runtime-diagnostics.js` | malformed/process diagnostics | Poison task and Redis cleanup diagnostics. |
| `task-validation.js` | callers | `validateBusterTaskPayload` | Throws typed malformed error for queue dead-letter path. |
| `verdict-schema.js` | suite runner/helpers | verdict factories | Produces suite and runner verdict structures. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `completion-signal.js sendTaskCompletionSignal` | Missing `completion_stream` | payload | Return without attempting Redis | Queue fallback/dead-letter owns ACK safety if needed. |
| `completion-signal.js sendTaskCompletionSignal` | `spawnedSubagent` false | suites info | Include pre-test verdict and suite summary | No-subagent failures still provide deterministic verdict evidence. |
| `session.js spawnTaskSession` | `spawnSession` throws | spawn error | Return `{ok:false, reason:'spawn_failed: ...'}` | Prevents lifecycle crash and routes task failure. |
| `session.js monitorTaskSession` | monitor throws | monitor error | Kill best-effort, clear active session preserving file if unconfirmed, emit `agent.killed` | Monitor failure recovery path. |
| `session.js killTaskSession` | Monitor already issued/confirmed kill | `sessionResult.killIssued/killConfirmed` | Skip duplicate kill or call `killSession` | Avoids duplicate timeout kill while still clearing state. |
| `task-queue.js readNextTaskEntry` | Pending task reclaimed | XAUTOCLAIM result | Process reclaimed before new stream read | Crash recovery before new work. |
| `task-queue.js processOneQueuedTask` | Payload JSON invalid, unknown type, malformed validation, process error | Redis fields/payload/error code | Dead-letter before ACK or completion/dead-letter guarantee | Prevents poison messages and preserves terminal evidence. |
| `task-validation.js validateBusterTaskPayload` | Missing required identity or gate id | payload fields | Throw `MalformedBusterTaskError` | Fail-closed queue validation. |
| `verdict-schema.js createRunnerVerdict` | Any fail/error and critical fail | suite statuses | Overall PASS/FAIL and recommendation SPAWN/NO_SUBAGENT | Suite decision authority. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `completion-signal.js` | `completionState` | completion stream and Redis result/error | Mark attempted/stream before Redis; terminal true on success, error string on catch | Queue can inspect terminal completion state. |
| `session.js spawnTaskSession` | telemetry context and status active-agent | session data, payload | session label fills missing dispatch id; status active agent marked after spawn | Completion and telemetry correlation updated. |
| `task-queue.js getRedisClient/disconnectRedisClient` | module Redis singleton | env and Redis constructor | Lazy initialize; disconnect clears singleton before quit fallback | Shared client lifecycle. |
| `task-queue.js processOneQueuedTask` | Redis stream ACK/trim state | terminal result | ACK only after terminal/dead-letter ok; trim normal success to max len | ACK invariant maintained. |
| `verdict-schema.js truncateForPrompt` | cloned runner verdict | max findings | Deep clone, keep first N findings, append synthetic overflow finding | Original verdict unchanged. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `task-queue.js reclaimPendingTask` | Single XAUTOCLAIM call | Redis server idle selection | `PENDING_RECLAIM_IDLE_MS` default 60000 | Return one reclaimed task or null. |
| `task-queue.js readNextTaskEntry` | Single blocking read after reclaim | Redis BLOCK 2000 ms | `POLL_INTERVAL` | Return one task or null. |
| `session.js monitorTaskSession` | Delegated monitor loop | Delegated to `monitorSession` | Timeout seconds passed through | Return monitor result or monitor_error. |
| `verdict-schema.js truncateForPrompt` | Iterate suites | None | `maxFindings` default 5 | Each suite findings truncated if over limit. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `AGENT_NAME` | Env var | `task-queue.js` | `buster` | Builds stream/group/consumer names. |
| `BUSTER_TASK_STREAM` | Env var | `task-queue.js` | `swarm:${AGENT_NAME}:tasks` | Redis task stream. |
| `BUSTER_PENDING_RECLAIM_IDLE_MS` | Env var | `task-queue.js` | `60000` | XAUTOCLAIM idle threshold. |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | Env vars | `task-queue.js getRedisClient` | `redis-master.kubeclaw.svc.cluster.local`, `6379`, none | Redis queue/completion client config. |
| Redis entry `payload`, `type`, `sender` | Redis task fields | `task-queue.js processOneQueuedTask` | payload `{}`, type/sender `unknown` fallback | Payload is JSON parsed before validation. |
| Payload identity fields | Task payload | `task-validation.js` | required | `task_type`, `module_id`, `project`, `run_id`, `attempt`, `dispatch_id`, gate id for gate tests. |
| `payload.session.model`, `payload.session.cwd` | Task payload | `session.js`, `git-sync.js` | model `anthropic/claude-sonnet-4-6`, cwd process cwd | Session spawn and repo root. |
| `payload.completion_stream` | Task payload | `completion-signal.js`, `task-queue.js` | none | Terminal completion stream; queue fallback when lifecycle did not emit. |
| `maxFindings` | Function input | `verdict-schema.js truncateForPrompt` | 5 | Prompt-size truncation. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| Redis task stream `STREAM_KEY` | `task-queue.js` env/default | `readNextTaskEntry`, `reclaimPendingTask` | external Nova producer; `xack`/`xtrim` by queue | Queue transport authority. |
| Redis completion stream | payload `completion_stream` | Nova poller/task queue | `completion-signal.js`, `task-completion.js` fallback | Terminal signal authority. |
| Dead-letter stream | `task-completion.js` via queue | Operators/task queue | malformed/fallback paths | ACK fallback evidence. |
| Active-session file | `session.js` via `resolveBusterActiveSessionPath` | recovery/lifecycle | common lifecycle/session spawn | Recovery evidence. |
| Status JSON active-agent projection | `session.js`/helpers | Nova/status readers | `markBusterActiveAgent`, clear helper in outer lifecycle | Correlates Buster child session. |
| `/sandbox/results/<suite>-verdict.json` | `verdict-schema.js truncateForPrompt` reference | Agent/operator prompt consumers | suite runner writes actual artifact | Overflow finding points to full verdict. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Redis task ACK | `task-queue.js` | Redis consumer group | None; guarded by completion/dead-letter result. |
| Pending task reclaim | `task-queue.js` | Buster queue loop | None. |
| Buster task identity validation | `task-validation.js` | task lifecycle/queue | None. |
| Buster terminal completion state | `completion-signal.js` and queue fallback | task queue/Nova poller | None. |
| Buster session active marker | `session.js` through helpers/common lifecycle | recovery/status readers | None. |
| Suite verdict schema | `verdict-schema.js` | suite runner/prompts/completion | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Malformed task error | `MalformedBusterTaskError` | Error `name`, `code:'BUSTER_TASK_MALFORMED'`, `details`, `missing_fields` | constructor | task queue dead-letter path. |
| Buster task identity | `validateBusterTaskPayload` | `taskType`, `moduleId`, `gateId\|null`, `project`, `runId`, `attempt:number`, `dispatchId` | `normalizeRequiredIdentity`, `normalizeAttempt` | task lifecycle. |
| Redis task entry | external producer / `parseTaskEntry` | `{ id, fields, data, reclaimed }`, where `data.payload` is JSON string and `type/sender` optional | local parser and payload validator | `processOneQueuedTask`. |
| Completion state | `createTaskCompletionState` / completion signal | `attempted:boolean`, `terminal:boolean`, `stream:string\|null`, `error:string\|null` | lifecycle mutation | task queue ACK guarantee. |
| Agent spawned telemetry | `spawnTaskSession` | `module_id`, `agent_type:'buster'`, `label`, `session_key`, `runtime`, `model`, `timeout_seconds` | telemetry downstream | telemetry consumers. |
| Agent killed telemetry | `monitorTaskSession`, `killTaskSession` | `module_id`, `agent_type:'buster'`, `label`, `session_key`, `reason`, `elapsed_seconds`, optional `kill_confirmed` | telemetry downstream | telemetry consumers. |
| Suite verdict | `createSuiteVerdict` | `suite`, `status`, `critical`, `duration_ms`, counts, `findings`, `metadata`, optional `reason/error` | enum validation | suite runner/runner verdict/prompts. |
| Finding | `createFinding` | `severity`, `message`, `rule`, `element`, `file`, `line` | severity enum validation | suite verdicts/prompts. |
| Runner verdict | `createRunnerVerdict` | `run_id`, `module`, `project`, `timestamp`, `overall_status`, `critical_failure`, `duration_ms`, `suites`, `summary`, `recommendation` | suite verdict factories | suite runner/pre-test verdict/prompt truncation. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Buster child session spawn | `session.js spawnTaskSession` | Active-session file and stream log path from common lifecycle | Passes prompt from outer lifecycle unchanged | ACP/common session runtime | Child must later produce output consumed by Buster result resolver. |
| Verdict prompt truncation | `verdict-schema.js truncateForPrompt` | References `/sandbox/results/<suite>-verdict.json` for overflow | Keeps top findings inline and appends synthetic overflow finding | N/A | Truncated runner verdict object for prompt consumers. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `cleanup.js runSandboxCleanupStage` | Cleanup/telemetry throws | Caller-owned | No local catch | Propagates to task lifecycle | Delegated. |
| `completion-signal.js sendTaskCompletionSignal` | Redis completion failure | Queue fallback later | One xadd attempt | Logs error, records `completionState.error`, does not throw | `safeErrorMessage`. |
| `git-sync.js syncTaskRepo` | Git sync failed | Delegated to git workflow | `gitSync` handles fetch/reset behavior | Emits `ok:false` and returns error to lifecycle | Git workflow sanitizes log first line. |
| `session.js spawnTaskSession` | Spawn failure | No local retry | One spawn attempt | Returns fail reason | `safeErrorMessage`. |
| `session.js monitorTaskSession` | Monitor throws | Best-effort kill | One kill attempt after monitor error | Returns fail reason; emits killed telemetry | `safeErrorMessage`. |
| `session.js killTaskSession` | Kill failure | No local catch | One kill unless monitor already confirmed | Exception propagates to lifecycle catch | Delegated. |
| `task-queue.js getRedisClient` | Redis connection errors | ioredis retry | retryStrategy min(times*100,5000), maxRetriesPerRequest null | Logs error; client remains | `safeErrorMessage`. |
| `task-queue.js disconnectRedisClient` | quit/disconnect failure | fallback disconnect | quit then disconnect | Diagnostics, no throw unless disconnect outside catch throws handled | diagnostics sanitizer. |
| `task-queue.js processOneQueuedTask` | Malformed JSON/type/validation | Dead-letter path | One dead-letter attempt then ACK | Dead-letter before ACK; terminal guarantee error if dead-letter fails | `safeErrorMessage`. |
| `task-queue.js processOneQueuedTask` | processTask throws | Completion/dead-letter fallback | Cleanup once, completion then dead-letter | ACK only after terminal evidence; otherwise throws terminal guarantee | `safeErrorMessage`. |
| `task-validation.js validateBusterTaskPayload` | Invalid payload identity | No | None | Throws typed malformed error | Missing fields only. |
| `verdict-schema.js factories` | Invalid status/severity/suite | No | None | Throws immediate schema error | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `cleanup.js runSandboxCleanupStage` | Cleanup completes/fails by result | Yes when no throw | Telemetry sinks | `buster.sandbox_cleanup` started/completed | `emitEvent` | Throw path propagates to lifecycle. |
| `completion-signal.js sendTaskCompletionSignal` | Completion xadd failure | Partial | Logger; queue fallback later | ERROR log; fallback completion/dead-letter | logger, task queue | Queue enforces ACK safety. |
| `git-sync.js syncTaskRepo` | Git sync failed | Yes | Telemetry sinks and logger | `buster.git_sync` with `ok:false` | `emitEvent` | Lifecycle emits task failure later. |
| `session.js spawnTaskSession` | Spawn failure | Partial | Logger and lifecycle failure notification | `SPAWN` ERROR; task failure embed downstream | logger/lifecycle | No `agent.spawned` on failure. |
| `session.js monitorTaskSession` | Monitor throws | Yes | Telemetry sinks/logger | `agent.killed` reason `monitor_error` | `emitEvent` | Kill failure logged. |
| `session.js killTaskSession` | Kill failure | Indirect | lifecycle catch/final completion | task failure/completion | lifecycle caller | No local catch. |
| `task-queue.js getRedisClient` | Redis client error event | Partial | stderr/stdout | `[REDIS]` log lines | event listeners | No telemetry before Redis may be available. |
| `task-queue.js disconnectRedisClient` | quit/disconnect failure | Yes | process diagnostic JSONL/console | `observability.degraded` diagnostic record | `reportBusterRuntimeDiagnostic` | Non-terminal disconnect cleanup. |
| `task-queue.js malformed task paths` | Bad JSON/type/validation | Yes | malformed task JSONL and Redis dead-letter | `malformed-tasks.jsonl`, task dead-letter | `appendMalformedTaskArtifact`, `writeTaskDeadLetter` | ACK only after dead-letter. |
| `task-queue.js processTask throws` | Runtime task error | Yes | cleanup diagnostics as needed, Redis completion/dead-letter | completion/dead-letter, process diagnostics | `ensureTaskTerminalBeforeAck`, diagnostics | Throws if no terminal evidence. |
| `task-validation.js validateBusterTaskPayload` | Invalid payload identity | Indirect | queue malformed artifact/dead-letter | malformed/dead-letter | task queue caller | Validator itself just throws. |
| `verdict-schema.js factories` | Invalid schema input | No direct telemetry | none in scoped file | none | thrown error | Caller suite/lifecycle records if propagated. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Redis / ioredis client | `loadRedisCtor()` | `ioredis` declared elsewhere | `task-queue.js`, completion signal | Task stream, completion, dead-letter | Retry strategy and no max retries per request. |
| Redis Streams | Redis commands | Runtime Redis | `task-queue.js` | `XREADGROUP`, `XAUTOCLAIM`, `XACK`, `XTRIM` | Pending reclaim before new reads. |
| ACP/common lifecycle | Internal common helper | Internal | `session.js` | spawn/kill/clear sessions | Errors routed by session helpers. |
| Git CLI workflow | Buster git workflow service | Runtime Git | `git-sync.js` | repo sync | Failure telemetry emitted. |
| Buster telemetry service | Internal | Internal | cleanup/git/session helpers | lifecycle events | Emit behavior delegated. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Redis task read | One task per `processOneQueuedTask` | `COUNT 1`, `BLOCK 2000` | Null when no task | console task line | None. |
| Pending reclaim | One pending entry per call | idle default 60000 ms, `COUNT 1` | Reclaimed before new tasks | `reclaimed=pending` console marker | None. |
| Redis stream trim | Approx max length | `STREAM_MAX_LEN=250` | Trim after normal ACK | Redis stream state | Error path does not trim in scoped code. |
| Redis reconnect | ioredis retry | min(times*100,5000) | Keeps retrying | Redis error logs | None. |
| Completion/ACK backpressure | ACK gated by terminal evidence | completion stream or dead-letter | Throws terminal guarantee error when both fail | diagnostics/caller error | None. |
| Session lifecycle | One child session per task | timeout delegated from payload | monitor/kill/outcome flow | telemetry/logs/Discord | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Child session spawn request | Payload, prompt, timeout, activeStatePath; returns label/session/runtime/stream log | `session.js spawnTaskSession` | Common lifecycle/gateway | One spawn attempt | `agent.spawned` telemetry and active-session marker. |
| Monitor error kill | `killSession(sessionKey, { runtime, agentId, label })` | `session.js monitorTaskSession` | Common lifecycle/gateway | One kill after monitor exception | `agent.killed` reason `monitor_error`. |
| Normal session kill | Same kill shape unless monitor timeout already confirmed | `session.js killTaskSession` | Common lifecycle/gateway | One kill/clear after monitor | `agent.killed` telemetry. |
| Redis task transport | Stream fields `payload`, `type`, `sender`; consumer group/consumer name | Nova/task producer, Buster queue | Buster task lifecycle | XAUTOCLAIM then XREADGROUP count 1 | ACK/dead-letter/completion evidence. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Buster monitor exceptions emit kill evidence and preserve unconfirmed active-session file | `check-buster-pipeline-slice-surface.mjs`, `buster-runtime-normalization.mjs` | Good | None. |
| Task queue completion/dead-letter before ACK invariant | `buster-runtime-normalization.mjs` | Good | None. |
| Buster startup exports task queue disconnect and session helpers | `check-buster-startup-smoke.mjs` | Good | None. |
| Verdict and completion fields are consumed by pipeline slice tests | `check-buster-pipeline-slice-surface.mjs` | Good | No standalone verdict-schema contract, but behavior covered through callers. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- None yet.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
