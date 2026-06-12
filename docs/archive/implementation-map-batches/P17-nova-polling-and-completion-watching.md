# Batch P17 — Nova polling and completion watching

Status: completed
Date started: 2026-05-08
Date completed: 2026-05-08
Reviewer: Nova

## Scope

```text
skills/nova/pipeline/services/polling*.js
skills/nova/pipeline/services/completion-adjudicator.js
skills/nova/pipeline/services/redis-completion.js
```

Scope expansion verified live: 8 files, under the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/nova/pipeline/services/completion-adjudicator.js
kubeclaw-main/skills/nova/pipeline/services/polling-dual.js
kubeclaw-main/skills/nova/pipeline/services/polling-identity.js
kubeclaw-main/skills/nova/pipeline/services/polling-observability.js
kubeclaw-main/skills/nova/pipeline/services/polling-redis-completion.js
kubeclaw-main/skills/nova/pipeline/services/polling-session-end.js
kubeclaw-main/skills/nova/pipeline/services/polling.js
kubeclaw-main/skills/nova/pipeline/services/redis-completion.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/contracts/check-redis-completion-service-surface.mjs
kubeclaw-main/tests/verification/contracts/check-status-store-slice-surface.mjs
kubeclaw-main/tests/verification/contracts/check-telemetry-contract.mjs
kubeclaw-main/tests/verification/behavior/areas/polling.mjs
kubeclaw-main/tests/verification/behavior/areas/telemetry.mjs
kubeclaw-main/tests/verification/behavior/areas/transcript-monitor.mjs
kubeclaw-main/tests/verification/behavior/areas/module-failures.mjs
```

## Per-file map

### `skills/nova/pipeline/services/completion-adjudicator.js`

Role: Canonical completion evidence projection/adjudication between Redis completion entries and local lifecycle/status evidence.

Imports/dependencies: `STATUS` constants.

Exports/public surface: Completion identity constants, identity normalizers/diagnostics, Redis status/outcome classifiers, `projectCompletionState`, `buildCompletionDrift`, `adjudicateCompletionEvidence`, `shouldApplyRedisCompletionToStatus`.

Defines: Strong completion identity fields, Redis-to-status mapping, terminal rate-limit ownership rules, active-dispatch confirmation, completion authority policy, drift generation.

Important variables/state: Constants only; pure functions.

Calls out to: None outside module.

Called by / expected callers: Polling dual channel, status/truth-drift projections, tests.

Environment variables / CLI inputs / config fields: None direct.

Paths built/read/written: None.

Authority behavior: Local terminal status wins over conflicting Redis terminal evidence. Redis terminal completion can become authority only when `preferRedis` is true, the local status is not terminal, and active dispatch identity is confirmed. Terminal rate-limited Redis outcomes are terminal only when source is Buster pipeline owned.

Error/retry/terminal behavior: No throw paths in scoped source. Weak identity and status conflicts are returned as diagnostics/drift, not exceptions.

Verification coverage: `check-status-store-slice-surface.mjs`, behavior `polling`, `telemetry`, `module-failures`.

Findings: `P17-ISSUE-001` covers lack of explicit Redis completion entry validator/schema owner.

### `skills/nova/pipeline/services/polling-dual.js`

Role: Buster module completion wait wrapper around the event-driven Redis/local evidence adapters and shared completion controller.

Imports/dependencies: Node `path`; logger/runtime/path helpers; status store; rate-limit builders; pipeline event contract; completion event adapters; Buster completion controller.

Exports/public surface: `waitForModuleBusterCompletion`.

Defines: Module completion identity construction, module output watch path resolution, controller-result-to-poll-result mapping, and adapter lifecycle cleanup.

Important variables/state: Per-wait event bus and abort controller; Redis/local adapters are stopped in `finally`.

Calls out to: `createRedisCompletionEventAdapter`, `createLocalEvidenceEventAdapter`, `waitForBusterCompletion`, `loadStatus`, rate-limit result/status builders, `log`.

Called by / expected callers: `pollDual` in `polling.js`.

Environment variables / CLI inputs / config fields: Reads run id via `getRunId(config)`; delegates Redis config/path reads to the adapter and stream-key helpers.

Paths built/read/written: Watches the module Buster output artifact path; reads module status through `loadStatus` as local context for adjudication.

Authority behavior: Redis completion events are adjudicated against local lifecycle context and active identity by the shared controller/adjudicator. Local module evidence is a wakeup/context signal, not an independent terminal authority.

Error/retry/terminal behavior: Completion conflicts fail closed. Terminal-owned Redis rate limit returns rate-limit exit result. Raw rate limit returns a rate-limited poll result. Redis timeout maps to failure. Fatal adapter errors map to completion adapter failure.

Verification coverage: `check-buster-completion-controller-surface.mjs`, `check-completion-event-adapters-surface.mjs`, behavior `polling`, `telemetry`, `module-failures`.

Findings: `P17-ISSUE-001`.

### `skills/nova/pipeline/services/polling-identity.js`

Role: Pure identity and log-key helpers for polling surfaces.

Imports/dependencies: Correlation resolvers.

Exports/public surface: `sessionLabelAgentType`, `resolveFilePollIdentity`, `resolveSessionPollIdentity`, `resolveStatusPollIdentity`, `buildAcpPollLogKey`, `buildSessionProgressStateKey`.

Defines: Mapping from tracked agent/session/status state into telemetry identity objects and stable progress log keys.

Important variables/state: None.

Calls out to: `resolveStatusSessionKey`, `resolveStatusDispatchId`, `resolveStatusGatewayLabel`.

Called by / expected callers: `polling.js`, `polling-session-end.js`.

Environment variables / CLI inputs / config fields: None direct.

Paths built/read/written: None.

Authority behavior: Preserves tracked gate/module/session correlation and avoids deriving fake module ids from labels.

Error/retry/terminal behavior: No throw paths; missing values normalize to null/undefined fields.

Verification coverage: Behavior `polling`, `telemetry`, `transcript-monitor`.

Findings: None.

### `skills/nova/pipeline/services/polling-observability.js`

Role: ACP polling observability, transcript delta, and progress emission helpers.

Imports/dependencies: ACP transcript delta publisher, logger, telemetry facade.

Exports/public surface: `buildAcpObservabilityData`, `updateAcpPollObservability`, `publishAcpTranscriptDelta`, `maybeEmitAcpPollProgress`.

Defines: ACP monitor state to observability payload conversion, gateway/transcript observability update, fire-and-forget transcript delta publication, throttled progress telemetry.

Important variables/state: Mutates caller-provided observability state through telemetry updaters; no module-global state.

Calls out to: `updateGatewayObservability`, `updateTranscriptObservability`, `publishTranscriptDelta`, `emitTranscriptLine`, `emitAgentProgress`, `log`.

Called by / expected callers: `polling.js`, `polling-session-end.js`.

Environment variables / CLI inputs / config fields: Progress interval passed by caller.

Paths built/read/written: None directly.

Authority behavior: Observability only; does not alter scheduler truth.

Error/retry/terminal behavior: Transcript delta publish is scheduled asynchronously. Publish and scheduling errors are caught and logged DEBUG as non-critical. Progress emits only when interval elapsed.

Verification coverage: Behavior `polling`, `telemetry`, `transcript-monitor`.

Findings: None.

### `skills/nova/pipeline/services/polling-redis-completion.js`

Role: Redis completion adapter resolution, old-completion archival, completion read, and Redis-completion observability.

Imports/dependencies: Logger, completion stream path helper, correlation, Redis operation logger, telemetry observability builders, adapter registry.

Exports/public surface: `archiveModuleCompletions`.

Defines: Archive failure result and degraded event builder, Redis adapter resolver with operation log callback, completion archive and read wrappers.

Important variables/state: `COMPLETION_ARCHIVE_MAX_LEN = 1000`.

Calls out to: `resolveRegisteredRedisAdapter`, adapter `archiveCompletions`, `completionStreamKey`, `logRedisOperation`, `emitObservabilityDegraded`.

Called by / expected callers: Buster dispatch/archive paths, `polling-dual.js`, tests.

Environment variables / CLI inputs / config fields: Reads Redis adapter registry from config; `_logDir` enables Redis operation log callback.

Paths built/read/written: Uses `completionStreamKey(config)` and archive stream `${stream}:log`; Redis operation log delegated to `redis-log.js`.

Authority behavior: Adapter registry owns Redis transport. Read results are evidence only until completion adjudicator accepts them.

Error/retry/terminal behavior: Adapter resolution/import failure logs ERROR and returns null/failed archive. Archive failures emit degraded observability, WARN log, and failed result. Read failures update Redis-completion observability, DEBUG log, and return null.

Verification coverage: Behavior `telemetry`, `polling`; contract `check-redis-completion-service-surface.mjs` for lower helper ownership.

Findings: `P17-ISSUE-001`.

### `skills/nova/pipeline/services/polling-session-end.js`

Role: ACP session end poller that detects pushed changes, terminal sessions, rate limits, transcript activity extensions, and optional subagent transcript mirroring.

Imports/dependencies: Node `fs`/`path`; logger/runtime; ACP monitor; tracked agent lifecycle; gateway invoke; redaction transcript copy; Git polling/worktree helpers; rate-limit service; identity/observability helpers; sleep.

Exports/public surface: `pollForSessionEnd`.

Defines: Local repo sync helper, session-end polling loop, post-change grace logic, session-end grace logic, timeout nudge, transcript active deadline extension, subagent transcript mirror.

Important variables/state: Local polling state: ACP monitor state, observability state, deadline, nudge flag, transcript extensions, HEAD tracking, rate-limit pause count, progress log throttle fields.

Calls out to: `getAcpMonitorState`, `getTrackedAgent`, `gitPullForPolling`, `headHash`, `gitExec`, `gatewayInvoke('sessions_send')`, `processSessionRateLimit`, observability/progress helpers, `copyRedactedTranscriptArtifact`, `sleep`.

Called by / expected callers: Gate/module fix-cycle and session polling surfaces via `polling.js` re-export.

Environment variables / CLI inputs / config fields: Reads `config.poll_interval_seconds`, `session_nudge_threshold`, `session_end_grace_ms`, `session_progress_log_interval_ms`, `session_progress_emit_interval_ms`, `rate_limit.max_pauses_per_module`, repo/log paths, ACP monitor config.

Paths built/read/written: Reads stream log path from tracked agent; writes redacted subagent transcript to `<_logDir>/modules/<moduleId>/subagent-transcript.jsonl`; commits local uncommitted files in repo after session completion.

Authority behavior: Completion can be HEAD movement plus post-change grace, terminal ACP session plus final-push grace, or timeout. Idle ACP state is explicitly not terminal.

Error/retry/terminal behavior: Missing session key returns `no_session_key`. Git sync failure returns `git_error`. Rate limits can extend deadline or return exhausted result. Nudge send failures are swallowed. Transcript mirror failures are DEBUG/non-critical. Timeout can extend when transcript has active events, up to ACP monitor config limit.

Verification coverage: Behavior `polling`, `transcript-monitor`, `fix-cycles`, `telemetry`.

Findings: None.

### `skills/nova/pipeline/services/polling.js`

Role: Public polling facade and generic poll engine for file, status, dual Redis/local completion, and rate-limit recovery wrappers.

Imports/dependencies: Node `fs`; logger/runtime/path helpers; status store; ACP monitor/tracked agent; rate-limit recovery; correlation; Git polling; lifecycle transition; identity/observability helpers; Redis completion; dual checker; sleep.

Exports/public surface: Redis completion helpers, `sleep`, `pollForSessionEnd`, selected completion adjudicator helpers, `pollResult`, `pollGeneric`, `pollForFile`, `pollStatus`, `pollDual`, `pollWithRateLimitRecovery`, `pollDualWithRateLimitRecovery`.

Defines: Poll result wrapper, generic polling loop, file existence poller, module status poller with ACP crash/head-move fallback, Buster dual poll wrapper, Forge/Buster rate-limit recovery wrappers.

Important variables/state: Per-call deadlines, parse failure counter, progress log throttles, ACP monitor state, observability state, progress telemetry interval.

Calls out to: `sleep`, `gitPullForPolling`, `loadStatus`, `saveStatus`, `transitionModuleStatus`, `getAcpMonitorState`, identity/observability helpers, `waitForModuleBusterCompletion`, `withRateLimitRecovery`.

Called by / expected callers: Module runner, gate runner, Buster/review/fix-cycle paths, tests.

Environment variables / CLI inputs / config fields: Reads `poll_interval_seconds`, `poll_progress_log_interval_ms`, `session_progress_emit_interval_ms`, repo path/run id fields.

Paths built/read/written: Reads file path supplied to `pollForFile`; reads module `status.json`; status poll may save status after auto-advancing READY_FOR_TESTING; Git sync/pull and HEAD hash delegated.

Authority behavior: `pollGeneric` owns common file/status/session loop semantics. File poll trusts output file existence first. Status poll treats expected status/BLOCKED/RATE_LIMITED as authority and ACP terminal state as fail-fast/fallback. Buster module completion waits delegate Redis/local completion authority to the event-driven controller/adjudicator.

Error/retry/terminal behavior: Parse corruption threshold 10. Git sync error returns `git_error`. Rate-limit status returns to wrappers for shared handling. Poll timeout returns timeout. ACP terminal without output/status change produces terminal no-output/no-changes results.

Verification coverage: Behavior `polling`, `foundations`, `telemetry`, `module-failures`, `fix-cycles`; contracts `check-status-store-slice-surface.mjs`.

Findings: None.

### `skills/nova/pipeline/services/redis-completion.js`

Role: Redis completion stream identity, selection, conflict, duplicate diagnostics, tail scanning, and archive chunking helpers.

Imports/dependencies: None.

Exports/public surface: Completion conflict/duplicate/ignored diagnostics, expected identity normalization/matching, `selectLatestCompletion`, `scanLatestCompletionFromTail`, `archiveCompletionsChunked`.

Defines: Completion outcome normalization, current source predicate, stream entry decoder, exclusive stream id helper, reverse scan and chunked archive algorithms.

Important variables/state: Strong expected identity fields constant.

Calls out to: Redis client methods `xrevrange`, `xrange`, `multi`, `xadd`, `xdel`, `xtrim`, transaction `exec`.

Called by / expected callers: `tools/redis.js` adapter and tests.

Environment variables / CLI inputs / config fields: None direct; stream key and batch/scan/archive options are inputs.

Paths built/read/written: Redis stream keys supplied by caller; archive stream key supplied by caller.

Authority behavior: Only entries with `type:'completion'`, matching `module`, strong expected identity, and source exactly `buster-pipeline` are selectable. Conflicting outcomes for same identity synthesize a failure conflict entry. Same-outcome duplicates and ignored noncanonical sources are diagnostic fields.

Error/retry/terminal behavior: Missing strong identity prevents matching unless `requireStrongIdentity:false`. Tail scan stops at scan limit or empty stream; reports `truncated`. Archive preserves active identity entries and moves older matching entries to archive stream, then trims archive.

Verification coverage: `check-redis-completion-service-surface.mjs`, behavior `telemetry`, `polling`.

Findings: `P17-ISSUE-001`.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `polling.js` | `polling-session-end.js` | `pollForSessionEnd` re-export | Public polling facade. |
| `polling.js` | `polling-redis-completion.js` | `archiveModuleCompletions` re-export/use | Redis completion archive service facade before Buster dispatch. |
| `polling.js` | `completion-adjudicator.js` | re-export completion classifiers/adjudicator | Shared completion authority helpers. |
| `polling.js` | `polling-dual.js` | `waitForModuleBusterCompletion` | Event-driven Buster module completion wait. |
| `polling.js` | `polling-identity.js` | identity/log-key helpers | File/status/session telemetry identity. |
| `polling.js` | `polling-observability.js` | observability/progress/transcript helpers | ACP telemetry during polls. |
| `polling-dual.js` | `completion-event-adapters.js` | `createRedisCompletionEventAdapter`, `createLocalEvidenceEventAdapter` | Redis/local completion evidence events. |
| `polling-dual.js` | `completion-adjudicator.js` | `adjudicateCompletionEvidence` | Redis/local authority decision. |
| `polling-redis-completion.js` | adapter registry | `resolveRegisteredRedisAdapter` | Redis transport authority. |
| `polling-session-end.js` | gateway integration | `gatewayInvoke('sessions_send')` | Timeout nudge. |
| `polling-session-end.js` | Git worktree integration | pull/head/add/commit helpers | Session completion by commits. |
| `redis-completion.js` | Redis client | stream scan/archive methods | Low-level Redis completion helper. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `adjudicateCompletionEvidence` | Redis terminal vs local terminal vs weak identity | Redis/status completion and expected identity | Conflict, local authority, Redis candidate/authority, or pending | Completion authority boundary. |
| `buildCompletionDrift` | Weak identity/status mismatch/Redis requires dispatch | Expected identity and projected completions | Drift entries | Operator diagnostics. |
| `waitForModuleBusterCompletion` | Redis completion event or fatal adapter event | Completion controller/adjudication | conflict/rate_limited/timeout/pass/blocked/fatal | Event-driven Buster module terminal routing. |
| `pollGeneric` | Check result shape | `done`, `parse_error`, `rate_limited`, pending | Return terminal, parse threshold, rate-limit, or progress | Common loop semantics. |
| `pollForFile` | File exists before ACP terminal | Output path and ACP state | Success wins; otherwise session no-output/rate-limit/pending | Gate output authority. |
| `pollStatus` | status target/BLOCKED/RATE_LIMITED vs ACP terminal | status.json/read-model and ACP state | Terminal, rate-limit, auto-advance, crash/no changes, pending | Module status polling. |
| `pollForSessionEnd` | HEAD moved vs session terminal vs timeout | HEAD hashes, ACP state, transcript state | Session ended with changes/no changes, git error, rate-limit, timeout | ACP session completion. |
| `scanLatestCompletionFromTail` | Completion entry matching identity/source/outcome | Redis stream entries | Select latest, conflict, duplicate diagnostics, ignored diagnostics | Redis completion selection. |
| `archiveCompletionsChunked` | Active identity match | Redis stream entries | Preserve active entry, archive old matching entries | Prevent stale completions. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `pollResult` | Poll result object | ok/reason/status/extra | Shallow merge extra over base fields | Common poll result shape. |
| `pollStatus` | Module status object/file | ACP rate limit or terminal HEAD move | Rate-limit enriches status then transition; HEAD move auto-advances READY_FOR_TESTING and saves | Guarded status lifecycle path used. |
| `pollForSessionEnd` | Local repo and transcript artifact | HEAD/session state | Add/commit local changes defensively after completion; mirror subagent transcript redacted | Session output preservation. |
| `updateAcpPollObservability` | Observability state | ACP state and identity | Gateway/transcript states update independently | Degraded/restored dedupe owned by telemetry. |
| `archiveCompletionsChunked` | Redis active/archive streams | Stream entries and active identity | XADD old matching entries to archive, XDEL originals, XTRIM archive | Active completion preserved. |
| `attach*Diagnostics` | Redis completion entry object | matched/ignored entries | Add duplicate/ignored diagnostic fields without changing base status | Diagnostics are non-authority additions. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `pollGeneric` | `Date.now() < deadline` | `sleep(config.poll_interval_seconds*1000)` after first cycle | `deadline = now + timeoutMinutes*60*1000` | `done`, parse threshold 10, rate limit, git error, timeout. |
| `pollForSessionEnd` | Outer transcript extension loop and inner deadline loop | `sleep(interval)` after first cycle | Initial timeout minutes; rate-limit cooldown extends deadline; transcript active extends by ACP monitor grace | HEAD grace, session end grace, rate-limit exhaustion, git error, timeout. |
| `pollForSessionEnd` | Timeout nudge threshold | No retry; one gateway send attempt | `percentElapsed >= session_nudge_threshold` | Nudge sent once unless session already detected ended. |
| `scanLatestCompletionFromTail` | `scanned < scanLimit` | Redis call pacing only | `batchSize` default 100, `scanLimit` default 1000 | Empty/short batch, match return without identity, scan limit/truncated. |
| `archiveCompletionsChunked` | `while true` Redis XRANGE batches | Redis transaction only | `batchSize` default 100; archive trim `maxLen` default caller | Empty/short batch then optional XTRIM. |
| `maybeEmitAcpPollProgress` | Interval gate | None | default interval 30000 ms | Returns prior timestamp until interval elapsed. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `config.poll_interval_seconds` | Config field | `pollGeneric`, `pollForSessionEnd` | Required by config | Poll sleep interval. |
| `config.poll_progress_log_interval_ms` | Config field | `pollGeneric` | 30000 | Progress log throttle. |
| `config.session_progress_emit_interval_ms` | Config field | `pollForFile`, `pollStatus`, `pollForSessionEnd` | 30000 | Agent progress telemetry throttle. |
| `config.session_nudge_threshold` | Config field | `pollForSessionEnd` | 0.75 | Timeout nudge threshold. |
| `config.session_end_grace_ms` | Config field | `pollForSessionEnd` | 15000 | Grace after terminal ACP session before final HEAD check. |
| `config.session_progress_log_interval_ms` | Config field | `pollForSessionEnd` | 30000 | Session progress log throttle. |
| `config.rate_limit.max_pauses_per_module` | Config field | `pollForSessionEnd` | 5 | Session rate-limit exhaustion cap. |
| `config.repo_root` | Config path | Polling Git sync helpers | Optional | Git pull/head/add/commit boundary. |
| `config._logDir` | Runtime log path | `polling-session-end.js`, `polling-redis-completion.js` | Set by status-store init | Transcript mirror and Redis op logging. |
| `expectedIdentity` / active identity | Runtime input | completion adjudicator, Redis completion, dual poll | Caller-provided | Strong identity requires run/attempt/dispatch for Redis authority. |
| `timeoutMinutes` | Runtime input | polling loops | Caller-provided | Deadline calculation. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| Module `status.json` | `statusPath`/status store | `pollStatus`, Buster completion controller context | `pollStatus` may save auto-advance/rate-limit status | Local lifecycle/status authority; Buster module completion does not poll it as terminal evidence. |
| Polled output file path | Caller supplied | `pollForFile` | External gate/agent | File existence wins file poll. |
| Redis completion stream | `completionStreamKey(config)` | Redis completion event adapter | Buster completion producer | Evidence until adjudicated. |
| Redis completion archive stream | `${completionStreamKey(config)}:log` | Operators/tests | `archiveModuleCompletions`/adapter | Stale completion archive. |
| Redis completion low-level streams | Caller supplied | `redis-completion.js` helpers | `archiveCompletionsChunked` | Service has no config path building. |
| `<_logDir>/modules/<moduleId>/subagent-transcript.jsonl` | `pollForSessionEnd` | Operators/tests | `copyRedactedTranscriptArtifact` | Non-critical redacted transcript mirror. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Generic poll terminal result | `pollGeneric` plus caller check function | Polling callers | None. |
| File poll completion | Output file writer external to polling | `pollForFile` | None. |
| Module status poll completion | Status store/lifecycle authority | `pollStatus` | P07 existing issue covers one guarded save caller path. |
| Buster Redis completion evidence | Buster pipeline Redis producer | Redis completion event adapter, adjudicator | Schema-validated Redis entry evidence; see resolved `P17-ISSUE-001`. |
| Redis/local completion authority | `adjudicateCompletionEvidence` | `buster-completion-controller.js`, truth drift/status surfaces | None. |
| ACP session completion | ACP monitor plus Git HEAD movement | `pollForSessionEnd`, `pollStatus`, `pollForFile` | None. |
| Redis completion archival | Redis adapter/service helpers | Buster dispatch and tests | None. |
| Polling observability | Telemetry builders | Operators/tests | Observability only. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| `PollResult` | `pollResult` | `ok:boolean`, `reason:string`, `status:object\|null`, optional `transcript`, `error`, extra fields | None beyond constructor | Polling callers. |
| Completion identity | Completion adjudicator / Redis completion service | `run_id`, `attempt`, `dispatch_id`, optional `session_key` | `normalizeCompletionIdentity`, `normalizeExpectedCompletionIdentity` | Redis matching/adjudication. |
| Completion projection | `projectCompletionState` | `targetKind`, `targetId`, `source`, raw/mapped status, `terminal`, `targetReached`, `blocked`, `rateLimited`, `terminalOwnedRateLimited`, `timeout`, `outcome` | Status/outcome mappers | Adjudicator/polling/truth drift. |
| Completion adjudication | `adjudicateCompletionEvidence` | Authority projection plus `candidate_completion`, `redis_completion`, `status_completion`, `identity`, `authority_policy`, conflict/drift flags | Internal policy builders | Polling dual/status surfaces. |
| Redis completion entry | Buster Redis producer, read by P17 helpers | Observed fields: `_id`, `type:'completion'`, `module`, `status`, `outcome`, `source`, identity fields, optional summary/commit diagnostics | Identity normalizers only; no full entry validator | Redis completion service/adjudicator. |
| Completion conflict entry | `buildCompletionConflictEntry` | `_id`, `type:'completion'`, `module`, `status:'FAIL'`, `outcome:'COMPLETION_CONFLICT'`, `source:'completion-conflict'`, reason/summary/conflict diagnostics plus identity | Conflict builder | Polling/adjudicator. |
| Archive failure result | `buildCompletionArchiveFailureResult` | `archived:0`, `failed:true`, `reason`, `error`, `stream`, `archive_stream`, `module`, `active_identity` | None | Buster dispatch/operators. |
| ACP observability data | `buildAcpObservabilityData` | session/gateway/transcript detail plus module/gate/session/dispatch/agent identity | Identity helpers | Telemetry observability builders. |
| Session poll result | `pollForSessionEnd` | `completed`, `hasChanges`, `reason`, optional `transcript`, `error` | None | Session/fix-cycle callers. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| ACP timeout nudge | `pollForSessionEnd` via `gatewayInvoke('sessions_send')` | none | `TIMEOUT WARNING: You have ~<minutes> minutes remaining. Complete your current task and write your output files now. Unfinished work will be lost.` | Gateway `sessions_send` with `sessionKey` and message | Best-effort operator/agent nudge; failures swallowed. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `pollGeneric` | Git pull failure | No local retry | Per poll cycle after first | Terminal `git_error` poll result | None. |
| `pollGeneric` | Parse corruption | Retry until cap | Consecutive parse failures cap 10 | WARN until cap, then `parse_corrupted` terminal | None. |
| `pollGeneric` | Timeout | No | Deadline from timeout minutes | Terminal `timeout` | None. |
| `pollForFile` | ACP session terminal without output | No | Poll loop interval | Terminal `session_ended_no_output` | Transcript object returned, not redacted here. |
| `pollForFile` | ACP rate limit | Handled by caller/wrapper | Returns immediately to rate-limit owner | `rate_limited` poll result | None. |
| `pollStatus` | Status parse error | Retry until generic cap | Via `pollGeneric` parse_error | Eventually `parse_corrupted` | None. |
| `pollStatus` | ACP terminal with HEAD moved | Not error | Git pull/head check | Auto-advance READY_FOR_TESTING and save status | None. |
| `pollStatus` | ACP terminal without HEAD movement | No | Git pull/head check | Terminal `session_ended_no_changes` | Transcript object returned, not redacted here. |
| `pollStatus` | ACP rate limit | Handled by caller/wrapper | Returns immediately to rate-limit owner | Status transitioned RATE_LIMITED and returned | None. |
| `waitForModuleBusterCompletion` | Redis/local completion conflict | No | No retry | Terminal `completion_conflict` fail-closed | None. |
| `waitForModuleBusterCompletion` | Redis timeout outcome | No | No retry | Terminal failure `timeout` | None. |
| `waitForModuleBusterCompletion` | Redis rate limited | Rate-limit owner handles | No local cooldown | rate-limited result/status or terminal-owned exit result | None. |
| `resolveRedisModule` | Redis adapter missing/import failure | No local retry | No retry | ERROR log; caller returns null/failed archive | None. |
| `archiveModuleCompletions` | Archive failure | Soft | No retry | Degraded observability, WARN log, failed result | None. |
| Redis completion event adapter/controller | Redis adapter fatal error | Fatal | Active wait exits fail-closed | `completion_event_adapter_failed` result | Adapters stop in `finally`. |
| `publishAcpTranscriptDelta` | Transcript delta publish/scheduling failure | Soft | No retry | DEBUG log and continue | Transcript publisher/redaction owns output. |
| `maybeEmitAcpPollProgress` | Progress interval not elapsed | Not error | 30000 ms default | Skips emit, returns prior timestamp | None. |
| `pollForSessionEnd` | Missing session key | No | No retry | Terminal `{completed:false, reason:'no_session_key'}` | None. |
| `pollForSessionEnd` | Git sync failure | No local retry | Per cycle/final check | Terminal `git_error` result | None. |
| `pollForSessionEnd` | Timeout nudge send failure | Soft | One best-effort attempt | Swallowed | None. |
| `pollForSessionEnd` | Rate limit | Retry until pause cap | Cooldown handled by rate-limit service; deadline extended by cooldown | Continue or exhausted terminal result | None. |
| `pollForSessionEnd` | Transcript mirror failure | Soft | No retry | DEBUG log and continue | Uses `copyRedactedTranscriptArtifact` when successful. |
| `pollForSessionEnd` | Timeout with active transcript | Retry/extend | Up to ACP monitor `max_transcript_extensions`, each by `transcript_grace_ms` | Extend deadline then final timeout | None. |
| `scanLatestCompletionFromTail` | Scan limit reached | Soft diagnostic | Batch loop to `scanLimit` | Returns `truncated:true` | None. |
| `archiveCompletionsChunked` | Redis command/transaction failure | No local catch | Redis/client-owned | Throws to caller/adapter | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `pollGeneric` | Git pull failure | Yes | Core log and return result | WARN/ERROR, `git_error` | `syncRepoForPolling`/`pollResult` | Caller may emit higher-level telemetry. |
| `pollGeneric` | Parse corruption | Yes | Core log and return result | WARN parse failures, ERROR cap, `parse_corrupted` | `log`, `pollResult` | No separate telemetry event. |
| `pollGeneric` | Timeout | Yes | Core log and return result | ERROR timeout, `timeout` | `log`, `pollResult` | Caller owns higher-level telemetry. |
| `pollForFile` | Session ended no output | Yes | Core log/result and ACP observability | WARN terminal, `session_ended_no_output` | `log`, telemetry helpers | Transcript/gateway degradation may emit events. |
| `pollForFile` | Rate limit | Yes | Core log/result and telemetry progress/observability | WARN rate limit, `rate_limited` | `log`, telemetry helpers | Shared rate-limit owner emits cooldown telemetry. |
| `pollStatus` | Parse error | Yes | Generic parser logs/result | parse_corrupted after cap | `pollGeneric` | No separate telemetry event. |
| `pollStatus` | ACP terminal with HEAD moved | Yes | Core log/status artifact | INFO auto-advance, status save | `log`, `saveStatus` | Status lifecycle telemetry downstream. |
| `pollStatus` | ACP terminal without HEAD movement | Yes | Core log/result and ACP observability | WARN session ended no changes | `log`, telemetry helpers | Transcript/gateway observability may emit. |
| `pollStatus` | ACP rate limit | Yes | Status artifact/result and rate-limit telemetry downstream | RATE_LIMITED status | `transitionModuleStatus`, rate-limit owner | Returned to wrapper. |
| `waitForModuleBusterCompletion` | Completion conflict | Yes | Core log/result | WARN drift plus `completion_conflict` result | `log`, `pollResult` | Drift included in status payload. |
| `waitForModuleBusterCompletion` | Redis timeout | Yes | Core log/result | Redis completion OK log, `timeout` result | `log`, `pollResult` | No separate telemetry event here. |
| `waitForModuleBusterCompletion` | Redis rate limited | Yes | Result and rate-limit owner downstream | rate-limited status/result | Rate-limit builders | Terminal-owned rate limit result carries details. |
| `resolveRedisModule` | Adapter missing/import failure | Yes | Core log and Redis completion observability if read/archive path supplies state | ERROR import failed | `log`, caller telemetry | Archive/read callers add degraded events. |
| `archiveModuleCompletions` | Archive failure | Yes | Telemetry stream/disk through telemetry facade and core log | `observability.degraded` reason `completion_archive_failed`, WARN | `emitCompletionArchiveFailure`, `log` | Returns failed result. |
| Redis completion event adapter/controller | Redis adapter fatal error | Yes | Fatal event mapped fail-closed | `completion_event_adapter_failed` result | `completion-event-adapters.js`, `buster-completion-controller.js`, `log` | Active waits stop Redis/local adapters in `finally`. |
| `publishAcpTranscriptDelta` | Publish/scheduling failure | Yes | Core log | DEBUG transcript delta publish failed | `log` | Non-critical. |
| `maybeEmitAcpPollProgress` | Interval not elapsed | No | none | none | Return prior timestamp | Expected throttle path. |
| `pollForSessionEnd` | Missing session key | Yes | Core log/result | ERROR no sessionKey, `no_session_key` | `log`, return result | No telemetry event. |
| `pollForSessionEnd` | Git sync failure | Yes | Core log/result | WARN/ERROR, `git_error` | `syncRepoForPolling` | No separate telemetry event. |
| `pollForSessionEnd` | Nudge send failure | No | none | swallowed | catch block | Best-effort only. |
| `pollForSessionEnd` | Rate limit | Yes | Rate-limit telemetry/status and core logs | cooldown/exhaustion logs/events | `processSessionRateLimit` | Deadline extended if recoverable. |
| `pollForSessionEnd` | Transcript mirror failure | Yes | Core log | DEBUG transcript mirror failed | `log` | Redacted copy skipped. |
| `pollForSessionEnd` | Active transcript timeout extension | Yes | Core log | WARN transcript active extending deadline | `log` | No telemetry event. |
| `scanLatestCompletionFromTail` | Scan truncated | Yes as return data | Return object | `truncated:true`, scanned/batches | Function return | Caller can log. |
| `archiveCompletionsChunked` | Redis command failure | Indirect | Caller/adapter handling | thrown error | Caller | `archiveModuleCompletions` catches via adapter path. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js runtime | `node` binary | Observed `v24.14.0` during review | All P17 JS modules | ESM, async polling, sync fs | No package pin in scoped files. |
| Node `fs`/`path` built-ins | Runtime built-ins | Node major 24 observed | polling file/session helpers | File existence, transcript mirror path | Failures mostly result/log non-critical. |
| Git worktree integration | Internal source/external git | Internal | `polling.js`, `polling-session-end.js` | Pull/head/add/commit during polling | Git failure can terminally fail polling. |
| ACP monitor/gateway | Internal ACP/gateway integration | Internal/external | Poll file/status/session end | Session state, transcript, timeout nudge | Gateway nudge failures swallowed; monitor errors mostly propagate. |
| Redis adapter registry | Internal adapter registry | Internal/external Redis | `polling-redis-completion.js`, `redis-completion.js` | Completion stream read/archive | Missing adapter degraded/null/failed result. |
| Status store/lifecycle | Internal source | Internal | `polling.js`, `polling-dual.js` | Module status reads/saves | Existing P07 guarded save issue remains separate. |
| Rate-limit service | Internal source | Internal | Poll wrappers/session end/dual | Cooldown/exhaustion handling | May extend session deadline. |
| Telemetry facade | Internal source | Internal | Polling observability/Redis completion | Degraded/restored/progress/transcript telemetry | Non-blocking. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Generic polling | One async loop per caller | `poll_interval_seconds`, timeout minutes | Sleeps after first check; timeout result | Progress logs throttled | None. |
| Parse failure cap | Consecutive counter | 10 | Terminal `parse_corrupted` | WARN/ERROR logs | None. |
| Progress logs | Log throttle | `poll_progress_log_interval_ms` default 30000 | Suppresses duplicate/stable progress logs | Core logs | None. |
| ACP progress telemetry | Emit throttle | `session_progress_emit_interval_ms` default 30000 | Suppresses progress events until interval | `agent.progress` telemetry | None. |
| Session nudge | One-shot flag | threshold default 75% elapsed | At most one gateway send attempt | WARN log; send failure swallowed | None. |
| Session rate-limit pauses | Pause counter | `rate_limit.max_pauses_per_module` default 5 | Exceeded returns exhausted result | Rate-limit telemetry/status | None. |
| Transcript timeout extension | Extension counter | ACP monitor config max/grace | Deadline extended while transcript active, then timeout | WARN logs | None. |
| Redis completion tail scan | Batch/scan caps | batch 100, scan 1000 | Returns `truncated:true` at cap | Return diagnostics | None. |
| Redis archive chunking | Batch and archive trim | batch 100, archive maxLen default caller/1000 | Moves chunks then approximate trim | Return scanned/batches/archived | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| ACP monitor state | `sessionState`, `reason`, `detail`, `terminal`, `rateLimited`, transcript fields | `getAcpMonitorState` | File/status/session pollers | Per poll interval | Poll results and observability events. |
| ACP transcript delta | `newLines` plus label/agent/module/gate/session/dispatch identity | ACP monitor | `publishTranscriptDelta` via polling observability | Fire-and-forget Promise; errors DEBUG | `agent.transcript` telemetry. |
| ACP progress telemetry | elapsed/transcript event count/last activity/status | Polling observability | Telemetry consumers | `session_progress_emit_interval_ms` throttle | `agent.progress` telemetry. |
| ACP timeout nudge | Gateway `sessions_send` request with `sessionKey` and warning message | `pollForSessionEnd` | Active ACP session | One best-effort send at threshold | WARN log; no artifact on failure. |
| ACP session terminal evidence | Terminal session plus optional HEAD movement | ACP monitor and Git | Polling callers | Session-end grace default 15s | Poll result reason and transcript. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Redis completion service ownership | `tests/verification/contracts/check-redis-completion-service-surface.mjs` | Good helper ownership/source coverage | No full Redis entry validator; see issue. |
| Completion adjudication and dual polling authority | `tests/verification/contracts/check-status-store-slice-surface.mjs`, behavior `polling` | Strong conflict/stale/local authority coverage | `P17-ISSUE-001`. |
| Polling loop timing/log throttles/session end | behavior `polling`, `transcript-monitor` | Strong behavior coverage | None. |
| Redis completion degraded/restored telemetry | behavior `telemetry` | Strong observability coverage | None. |
| Module failure/Buster polling integration | behavior `module-failures` | Good integration coverage; `P07-ISSUE-001` was later resolved in V02a3 | `P07-ISSUE-001` resolved in V02a3. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- `P17-ISSUE-001` — Redis completion stream entries lack an explicit validator/schema owner.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
