# Batch P18b — Nova rate-limit handling

Status: completed
Date started: 2026-05-08
Date completed: 2026-05-08
Reviewer: Nova

## Scope

```text
skills/nova/pipeline/services/rate-limit.js
skills/nova/pipeline/services/rate-limit-builders.js
skills/nova/pipeline/services/rate-limit-builders/exhaustion-options.js
skills/nova/pipeline/services/rate-limit-contract.js
skills/nova/pipeline/services/rate-limit-exit.js
```

Scope expansion verified live: 5 files, under the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/nova/pipeline/services/rate-limit.js
kubeclaw-main/skills/nova/pipeline/services/rate-limit-builders.js
kubeclaw-main/skills/nova/pipeline/services/rate-limit-builders/exhaustion-options.js
kubeclaw-main/skills/nova/pipeline/services/rate-limit-contract.js
kubeclaw-main/skills/nova/pipeline/services/rate-limit-exit.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/skills/common/pipeline/services/rate-limit-contract.js
kubeclaw-main/tests/verification/contracts/check-rate-limit-slice-surface.mjs
kubeclaw-main/tests/verification/contracts/check-telemetry-contract.mjs
kubeclaw-main/tests/verification/behavior/areas/polling.mjs
```

## Per-file map

### `skills/nova/pipeline/services/rate-limit.js`

Role: Rate-limit cooldown orchestration surface for modules, gates, summaries, and generic ACP polling wrappers.

Imports/dependencies: Logger/runtime, status-store lifecycle/status helpers, Discord integration, failure presentation embed helper, telemetry facade, lifecycle-state transition helper, shared rate-limit contract, polling sleep, rate-limit builders, and exit builders.

Exports/public surface: `createRateLimitPauseState`, `handleSessionRateLimit`, `processSessionRateLimit`, `createTrackedModuleSessionRateLimitRecoveryOptions`, `resumeDurableCooldownForStep`, `withRateLimitRecovery`, `withSessionRateLimitRecovery`, `handleRateLimit`, plus re-exports from `rate-limit-builders.js` and `rate-limit-exit.js`.

Defines: Cooldown start/resume flow, generic `reason === 'rate_limited'` recovery loop, durable cooldown replay, module status sync to/from `RATE_LIMITED`, and default exhausted-result builders.

Important variables/state: In-memory pause counter from `pauseState.count`; computed `pauseCount`, `maxPauses`, `cooldownHours`, `cooldownMs`, `resumeAt`; module status mutation to `RATE_LIMITED` and back to `IN_PROGRESS` for forge or `TESTING` for other phases.

Calls out to: `appendCooldownLifecycleEvent`, `loadStatus`, `saveStatus`, `transitionModuleStatus`, `emitRateLimitDetected`, `onModuleStatusChanged`, `discord`, `sleep`, `buildRateLimitDetectedPayload`, `buildSessionRateLimitExitResult`.

Called by / expected callers: Polling wrappers, module runner Forge/Buster paths, gate runners, pipeline start/loop durable cooldown replay, review/Buster gate tasks, summary/case-study helpers.

Environment variables / CLI inputs / config fields: Reads `config.rate_limit.max_pauses_per_module` default `5`, `config.rate_limit.cooldown_hours` default `2`, runtime run id via `getRunId(config)`, `config._runId`, `config.run_id`, and progress module dirs during durable replay.

Paths built/read/written: Reads/writes module `status.json` through status-store; appends lifecycle cooldown events/read models through status-store; emits Discord webhooks through integration; no direct filesystem path construction.

Authority behavior: Owns canonical cooldown pause/resume lifecycle events and module `RATE_LIMITED` status transition for local sleeps. It does not own raw rate-limit detection; callers pass `reason: 'rate_limited'` poll results.

Error/retry/terminal behavior: Pause branch emits lifecycle/telemetry/Discord then sleeps. Exhaustion occurs when `rateLimitPauses > maxPauses` and returns a terminal `rate_limit_exhausted` result. Discord pause/resume failures are DEBUG-only. Status/lifecycle save failures propagate. Durable replay sleeps until persisted `resume_at` then appends a completion event.

Verification coverage: `check-rate-limit-slice-surface.mjs`, telemetry contract rate-limit checks, behavior polling rate-limit scenarios.

Findings: Existing P07 guarded-save issue can still affect module status saves; new P18b summary gateway-label fallback issue below.

### `skills/nova/pipeline/services/rate-limit-builders.js`

Role: Status/result identity builders, Discord field facade, tracked correlation factories, and gate/summary recovery option scaffolding.

Imports/dependencies: Logger/runtime/status-store/Discord/failure embed/telemetry/lifecycle imports retained for facade compatibility and helpers; shared Discord field contract; shared rate-limit contract; correlation resolvers; polling sleep; exhaustion option submodule.

Exports/public surface: `STATUS`, `buildModuleStatusTelemetry`, `buildSessionRateLimitDiscordFields`, `emitGateRetryExhausted`, `defaultSessionRateLimitDetail`, `buildSessionRateLimitExhaustedResult`, resolver helpers, gate/module/summary status builders, tracked recovery option builders, tracked outcome resolver, and re-exported exhaustion helpers.

Defines: Normalized `RATE_LIMITED` status shapes for module/gate/summary, correlation fallback precedence, tracked dispatch/gateway memory, and notifier field builders.

Important variables/state: `trackedCorrelation` objects in gate and summary recovery factories persist last dispatch/gateway label across polls in-process.

Calls out to: Correlation resolvers, `onRetryExhausted`, shared Discord field builder, `createSessionRateLimitDiscordNotifier`, submodule exhaustion factories.

Called by / expected callers: `rate-limit.js`, `rate-limit-exit.js`, gate/review/Buster/summary runners, polling/session-end wrappers, contract tests.

Environment variables / CLI inputs / config fields: Reads runtime run id for module tracked status fallback via submodule; helper options include run/attempt/dispatch/gateway/session fallbacks, max pauses, suppress presentation, Discord descriptions, and exhausted result config.

Paths built/read/written: No direct paths. Delegated tracked module status builder in submodule reads module status.

Authority behavior: Owns normalized status payload construction for rate-limit pause/exhaustion surfaces. Gate and module builders preserve gateway-label fallbacks; summary builders currently drop `gatewayLabelFallback` when source status has no gateway label.

Error/retry/terminal behavior: Pure builders except `emitGateRetryExhausted`. No local throw paths except caller-supplied callback errors.

Verification coverage: `check-rate-limit-slice-surface.mjs`, telemetry contract, polling behavior.

Findings: `P18b-ISSUE-001` — summary rate-limit status/notifier builders ignore `gatewayLabelFallback` and tracked gateway correlation.

### `skills/nova/pipeline/services/rate-limit-builders/exhaustion-options.js`

Role: Exhaustion option factories for gate/summary terminal handling, pause/resume Discord notifier, and tracked module status builder.

Imports/dependencies: Logger/runtime, Discord integration, status-store `loadStatus`, gate fail telemetry, correlation helpers, parent builder functions.

Exports/public surface: `createGateSessionRateLimitExhaustionOptions`, `createSummarySessionRateLimitExhaustionOptions`, `createSessionRateLimitDiscordNotifier`, `buildTrackedModuleSessionRateLimitStatus`.

Defines: Gate `beforeReturn` telemetry hook, retry-exhausted emitter, CRITICAL Discord exhaustion notifier, nonterminal pause/resume Discord notifier, persisted+caller module status merge for rate-limit status.

Important variables/state: No module-level mutable state; merge order is persisted module status first then caller status.

Calls out to: `onGateFail`, `emitGateRetryExhausted`, `discordFn`/`notifyDiscord`, `loadStatus`, `buildModuleSessionRateLimitStatus`.

Called by / expected callers: Parent `rate-limit-builders.js`, terminal exit builders, module/gate tracked recovery setup.

Environment variables / CLI inputs / config fields: Runtime run id fallback via `getRunId(config)`, caller option fallbacks for gate/module identity, Discord levels/titles/descriptions/log messages.

Paths built/read/written: Reads module status through status-store. No direct path construction.

Authority behavior: Owns tracked module status merge for rate-limit surfaces. Terminal gate failure telemetry is optional and requires `gateId` plus `telemetryCtx`.

Error/retry/terminal behavior: Pause/resume Discord failures are caught and logged DEBUG. Exhaustion Discord errors are not caught here unless caller passes a safe notifier. Gate failure telemetry errors propagate through awaited `beforeReturn`.

Verification coverage: `check-rate-limit-slice-surface.mjs`, telemetry contract, gate/polling behavior.

Findings: None new in this file.

### `skills/nova/pipeline/services/rate-limit-contract.js`

Role: Repo-local compatibility shim for the shared rate-limit contract used by production image overwrites.

Imports/dependencies: Re-exports `../../../common/pipeline/services/rate-limit-contract.js`.

Exports/public surface: Shared `DISCORD_FIELD_SPECS`, `buildDiscordIdentityFields`, `buildSessionRateLimitDiscordFields`, `buildRateLimitDetectedPayload`, `formatRateLimitEmbed`, `resolveRateLimitRecoveryAction` via re-export.

Defines: No local implementation.

Important variables/state: None.

Calls out to: Shared common pipeline service.

Called by / expected callers: Nova rate-limit builders, Discord fields, failure presentation.

Environment variables / CLI inputs / config fields: None locally.

Paths built/read/written: None.

Authority behavior: Common pipeline helper is canonical; Nova file is a compatibility facade.

Error/retry/terminal behavior: None locally.

Verification coverage: Common-helper import surface, rate-limit slice surface, telemetry contract.

Findings: None.

### `skills/nova/pipeline/services/rate-limit-exit.js`

Role: Terminal rate-limit exhaustion and Redis-terminal result builders/finalizers for modules, gates, and summaries.

Imports/dependencies: Logger, Discord integration, telemetry facade, rate-limit builders/exhaustion options, correlation resolvers.

Exports/public surface: `buildSessionRateLimitExitResult`, terminal-owned Redis result builders for generic/module/gate, `finalizeSessionRateLimitExhaustion`, summary/gate/module finalizers, `createTrackedSummarySessionRateLimitExhaustionOptions`, `createModuleSessionRateLimitExhaustionOptions`.

Defines: Canonical `rate_limit_exhausted` result shape, Redis terminal ownership projection, finalizer hook order, module/gate/summary Discord and telemetry terminal wrappers.

Important variables/state: None; pure result builders plus async finalizer hooks.

Calls out to: `onRetryExhausted`, `onSummaryCompleted`, `onGateFail` via option factories, Discord/notify functions, logger.

Called by / expected callers: Polling, module runner Forge/Buster failure handlers, review/Buster gate terminal paths, summary/session helpers.

Environment variables / CLI inputs / config fields: Reads no env directly; finalizers depend on `config`, module/gate ids, phase, fallbacks for run/attempt/dispatch/gateway/session, Discord title/description/level, exit code overrides.

Paths built/read/written: None directly.

Authority behavior: Owns terminal `rate_limit_exhausted` result shape and correlation merge for exhausted returns. Redis-owned terminal builders preserve Redis entry as `_redis_entry` and mark `_source: 'redis'`.

Error/retry/terminal behavior: Finalizer hook order is `beforeReturn`, retry-exhausted telemetry, summary-completed telemetry, Discord, log. Hook/Discord errors propagate except `createTrackedSummarySessionRateLimitExhaustionOptions.notifyDiscord`, which catches and logs DEBUG. Terminal result itself is returned, not thrown.

Verification coverage: `check-rate-limit-slice-surface.mjs`, telemetry contract, polling behavior.

Findings: Summary finalizers inherit `P18b-ISSUE-001` when only fallback/tracked gateway label exists.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `rate-limit.js` | `rate-limit-builders.js` | status/Discord/detail/tracked module builders | Pause/resume and recovery option construction. |
| `rate-limit.js` | `rate-limit-exit.js` | `buildSessionRateLimitExitResult` | Default exhaustion result construction. |
| `rate-limit.js` | `status-store.js` / `lifecycle-state.js` | load/save/append/transition | Durable cooldown and module status authority. |
| `rate-limit-builders.js` | `rate-limit-builders/exhaustion-options.js` | exhaustion/notifier/module status helpers | Extracted helper surface re-exported by parent. |
| `rate-limit-builders.js` | `rate-limit-contract.js` / `discord-fields.js` | Discord fields and detected payload | Shared operator/telemetry contract. |
| `rate-limit-exit.js` | `rate-limit-builders.js` | status/result builders | Terminal result normalization. |
| `rate-limit-exit.js` | `telemetry.js` | `onRetryExhausted`, `onSummaryCompleted`, gate fail via options | Terminal exhaustion observability. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `rate-limit.js::handleSessionRateLimit` | `status.module_id \|\| status.gate_id` | Normalized status identity | Append cooldown lifecycle started/completed events | Only module/gate sessions get durable cooldown read-model evidence. |
| `rate-limit.js::handleSessionRateLimit` | `suppressPausePresentation` false | Option boolean or callback result | Emit `rate_limit.detected` telemetry and Discord pause notice | Allows callers with canonical Redis/other ownership to avoid duplicate operator signals. |
| `rate-limit.js::processSessionRateLimit` | `pauseCount > maxPauses` | Pause count and configured cap | Return exhausted result without sleep | Terminal max-pause policy. |
| `rate-limit.js::withSessionRateLimitRecovery` | `result.reason !== 'rate_limited'` | Poll result reason | Return poll result unchanged | Recovery loop only owns explicit rate-limit results. |
| `rate-limit.js::withSessionRateLimitRecovery` | `rateLimitPauses > maxPauses` | Incremented pause counter | Return custom/options/default `rate_limit_exhausted` result | Exhaustion is greater-than cap, so cap `5` permits five sleeps and exhausts on sixth detection. |
| `rate-limit.js::resumeDurableCooldownForStep` | Missing step/cooldown/open/resume_at | Step id/type and lifecycle cooldown read-model | Return `resumed:false` | Avoids sleeping unless durable cooldown is open. |
| `rate-limit-builders.js::build*RateLimitStatus` | Fallback precedence | Status fields, option fallbacks, correlation resolvers | Build `STATUS.RATE_LIMITED` object | Defines status authority and correlation propagation. |
| `rate-limit-exit.js::finalizeSessionRateLimitExhaustion` | Optional hook functions exist | `beforeReturn`, telemetry, Discord, log options | Execute hooks in fixed order then return exit result | Terminal side effects are centralized and ordered. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `rate-limit.js::withSessionRateLimitRecovery` | `pauseState.count` | Prior count, poll result | Increment only on `rate_limited` result | Shared pause state can span nested wrappers. |
| `rate-limit.js::syncModuleRateLimitPause` | Module status | Persisted status, normalized rate-limit status | Build telemetry before mutation, transition to `RATE_LIMITED`, save | Module status reflects paused state. |
| `rate-limit.js::syncModuleRateLimitResume` | Module status | Fresh raw status, current phase | Only if fresh status is `RATE_LIMITED`; forge -> `IN_PROGRESS`, other -> `TESTING` | Avoids overwriting non-paused status. |
| `rate-limit-builders/exhaustion-options.js::buildTrackedModuleSessionRateLimitStatus` | Returned status object | Persisted status and caller status | `{...persistedStatus, ...callerStatus}` then fallback options | Caller evidence overrides persisted snapshot. |
| `rate-limit-builders.js::createTrackedGateSessionRateLimitStatusBuilder` | In-memory tracked correlation | External update, status, prior tracked, fallbacks | External > status > prior tracked > fallback | Maintains dispatch/gateway across sparse poll returns. |
| `rate-limit-builders.js::createTrackedSummarySessionRateLimitRecoveryOptions` | In-memory tracked summary correlation | External update, status, prior tracked, fallbacks | External > status > prior tracked > fallback | Maintains dispatch/gateway for summary status, but gateway is not projected into status/Discord when only fallback exists. |
| `rate-limit-exit.js::buildSessionRateLimitExitResult` | Returned result/status | Result, rate-limit status, fallbacks, overrides | Status/result strip nested rate-limit fields; correlation merged into both; overrides win last | Canonical terminal shape avoids nested legacy authority. |
| `rate-limit-exit.js::buildTerminalOwnedRedisRateLimitExitResult` | Returned result/status | Redis entry, expected identity, status override | Redis identity > expected identity; status defaults preserve Redis source and entry | Redis terminal completion remains auditable. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `rate-limit.js::withSessionRateLimitRecovery` | `while (true)` around caller `pollFn` | `handleSessionRateLimit` sleeps `cooldownMs` per rate-limited result | `cooldownHours * 60 * 60 * 1000`, default 2h | Non-rate-limited result or max pauses exceeded. |
| `rate-limit.js::handleSessionRateLimit` | No loop; single cooldown | `sleepFn(cooldownMs)` | `resumeAt = now + cooldownMs` | Returns context after resume side effects. |
| `rate-limit.js::resumeDurableCooldownForStep` | No loop; replay one cooldown | Sleeps remaining `resume_at - now` if positive | `Math.max(0, Date(cooldown.resume_at) - Date.now())` | Appends completion event and returns refreshed cooldown. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `config.rate_limit.max_pauses_per_module` | Config field | `handleSessionRateLimit`, `processSessionRateLimit`, `withSessionRateLimitRecovery` | `5` | Pause budget; exhaustion when detections exceed cap. |
| `config.rate_limit.cooldown_hours` | Config field | `handleSessionRateLimit` | `2` | Cooldown duration for local sleeps. |
| `config._runId`, `config.run_id`, runtime run id | Runtime/config fields | `handleSessionRateLimit`, tracked module builder | `getRunId(config)` fallback | Correlation for detected payload/status. |
| `progress.modules[step.id].dir` | Progress runtime field | `resumeDurableCooldownForStep` | Required for module status resume sync | Durable replay can only update module status when module dir exists. |
| `options.pauseState.count` | Runtime option | `withSessionRateLimitRecovery` | `0` | Shared in-memory counter. |
| `options.suppressPausePresentation` | Runtime option/callback | `handleSessionRateLimit`, gate recovery options | false | Suppresses rate-limit detected telemetry and Discord pause notice. |
| `options.*Fallback` identity fields | Runtime options | Status builders/finalizers | null | Run/attempt/dispatch/gateway/session fallback correlation. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| Module `status.json` | Status-store path helpers | `buildTrackedModuleSessionRateLimitStatus`, `syncModuleRateLimitPause`, `syncModuleRateLimitResume` | `syncModuleRateLimitPause`, `syncModuleRateLimitResume` | Rate-limit service mutates module status only through status-store. |
| Lifecycle cooldown events/read models | Status-store lifecycle helpers | `resumeDurableCooldownForStep` via `getLifecycleCooldown` | `handleSessionRateLimit`, `resumeDurableCooldownForStep` | Durable cooldown authority is lifecycle event/read-model state. |
| Discord webhook payload | Discord integration | Operators/Discord | Rate-limit pause/resume/exhaustion notifiers | No filesystem path; external operator boundary. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Rate-limit cooldown lifecycle | `handleSessionRateLimit`, `resumeDurableCooldownForStep` | Pipeline loop/start durable replay and lifecycle read models | None. |
| Module `RATE_LIMITED` status transition | `syncModuleRateLimitPause`/`syncModuleRateLimitResume` | Module runner, scheduler, telemetry | Existing guarded save issue P07 remains relevant. |
| Terminal `rate_limit_exhausted` result | `rate-limit-exit.js` builders/finalizers | Polling, module/gate/summary terminal callers | None for module/gate; summary gateway-label fallback gap in P18b issue. |
| Rate-limit detected telemetry payload | `handleSessionRateLimit` using shared contract | Telemetry sinks/operators | Shared contract is a builder, not schema validator. Covered by P16 schema-owner issue. |
| Redis-owned rate-limit terminal projection | `build*TerminalOwnedRedisRateLimitExitResult` | Polling/gate/module terminal handlers | Relies on Redis completion schema issue P17 for validation. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| `RATE_LIMITED` module status | `buildModuleSessionRateLimitStatus`/tracked module builder | Existing status plus `status:'RATE_LIMITED'`, optional `module_id`, `current_phase`, `phase`, `agent_type`, `run_id`, `attempt`, `dispatch_id`, `gateway_label`, `session_key` | Builder only | Module status store, telemetry, Discord. |
| `RATE_LIMITED` gate status | `buildGateSessionRateLimitStatus`/tracked gate builder | Existing status plus `status:'RATE_LIMITED'`, `gate`, `gate_id`, `gate_type`, `agent_type`, `run_id`, `attempt`, `dispatch_id`, `gateway_label`, `session_key` | Builder only | Gate wrappers, Discord, terminal finalizers. |
| Summary rate-limit status | `buildSummarySessionRateLimitStatus` | Existing status plus `status:'RATE_LIMITED'`, optional `module_id`, `agent_type`, `run_id`, `attempt`, `dispatch_id`, `gateway_label`, `session_key` | Builder only | Summary finalizers and telemetry; gateway fallback gap in P18b issue. |
| `rate_limit.detected` payload | `buildRateLimitDetectedPayload` via `handleSessionRateLimit` | Optional `run_id`, `module_id`, `gate_id`, `gate_type`, `agent_type`, `attempt`, `dispatch_id`, `gateway_label`, `session_key`, `provider`, `retry_after_seconds`, `cooldown_ms`, `resume_at`, `pause_count`, `max_pauses`, `detail` | Shared common builder | `emitRateLimitDetected`, telemetry sinks. |
| Exhausted result | `buildSessionRateLimitExitResult` | `ok:false`, `reason`, `status`, `rate_limit_exhausted:true`, `rate_limit_status`, `rate_limit_pauses`, `max_rate_limit_pauses`, correlation fields, optional `exit` and caller result overrides | Builder only | Module/gate/summary terminal callers. |
| Redis terminal rate-limit result | `buildTerminalOwnedRedisRateLimitExitResult` and module/gate wrappers | Exhausted result plus Redis-derived `source`, `_source:'redis'`, `_redis_entry`, identity/correlation, optional module/gate identity | Builder only; Redis entry validation tracked in P17 | Polling and terminal handlers. |
| Discord identity fields | Shared `buildSessionRateLimitDiscordFields` | Array of `{name,value,inline}` for run/module/gate/phase/attempt/dispatch/gateway/session and extra fields | Shared common builder | Discord pause/resume/exhaustion notifiers. |
| Cooldown lifecycle events | `handleSessionRateLimit`, `resumeDurableCooldownForStep` | Event types `rate_limit.cooldown_started`/`rate_limit.cooldown_completed`; data includes module/gate identity, attempt, pause/max, cooldown/resume times, detail, agent type, correlation, commit hash where available | Status-store lifecycle legality/idempotency | Lifecycle read model/cooldown replay. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| None found in scoped files | N/A | N/A | N/A | N/A | N/A |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `handleSessionRateLimit` | Provider/session rate limit | Yes until cap | Sleeps `cooldown_hours` default 2h per pause | Soft pause; no retry attempt consumed | None local. |
| `withSessionRateLimitRecovery` | Max pause exhaustion | No | Exhausts when `rateLimitPauses > maxPauses` | Returns terminal `rate_limit_exhausted` result | None local. |
| `processSessionRateLimit` | Max pause exhaustion | No | Caller-provided `pauseCount > maxPauses` | Returns exhausted object/result | None local. |
| `handleSessionRateLimit` pause/resume Discord | Discord notification failure | No retry | One best-effort send each | Caught and DEBUG logged; cooldown continues | Discord integration owns redaction if any. |
| `createSessionRateLimitDiscordNotifier` | Tracked pause/resume Discord failure | No retry | One best-effort send each | Caught and DEBUG logged | Discord integration owns redaction if any. |
| `syncModuleRateLimitPause`/`syncModuleRateLimitResume` | Status/lifecycle save or transition failure | No retry | Immediate status-store call | Propagates to caller and can fail poll/gate/module flow | Status-store owns serialization. |
| `resumeDurableCooldownForStep` | Persisted cooldown remaining | Yes/resumable | Sleeps remaining persisted duration | Soft delay then appends completion | None local. |
| `finalizeSessionRateLimitExhaustion` | Terminal side-effect failure | No local retry | Hook order once | Hook/Discord errors propagate unless caller passes safe function | None local. |
| `createTrackedSummarySessionRateLimitExhaustionOptions.notifyDiscord` | Summary terminal Discord failure | No retry | One best-effort notify | Caught and DEBUG logged | Discord integration owns redaction if any. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `handleSessionRateLimit` | Rate-limit pause | Yes unless `suppressPausePresentation` | Telemetry sink, lifecycle event store, Discord, logs if option message | `rate_limit.detected`, `rate_limit.cooldown_started` | `emitRateLimitDetected`, `appendCooldownLifecycleEvent`, `discord` | Detection plus durable cooldown evidence. |
| `handleSessionRateLimit` | Rate-limit resume | Yes | Lifecycle event store, Discord, logs if option message | `rate_limit.cooldown_completed` | `appendCooldownLifecycleEvent`, `discord` | No dedicated telemetry facade event beyond lifecycle/Discord. |
| `withSessionRateLimitRecovery` | Max pauses exceeded | Yes if caller finalizes with exit helpers; otherwise result only | Returned result; downstream finalizers may emit telemetry/Discord | `rate_limit_exhausted` result | `buildSessionRateLimitExitResult` | Generic wrapper itself does not emit telemetry on exhaustion. |
| `processSessionRateLimit` | Max pauses exceeded | Result/log only | Returned object and optional ERROR log | `rate_limit_exhausted` result | `defaultSessionMonitorRateLimitExhaustedResult` | Caller must emit terminal telemetry if needed. |
| `handleSessionRateLimit` | Pause/resume Discord failure | Yes, log only | Runtime log/stdout pipeline logger | DEBUG message | `log('DEBUG', ...)` | Noncritical by design. |
| `createSessionRateLimitDiscordNotifier` | Tracked pause/resume Discord failure | Yes, log only | Runtime log/stdout pipeline logger | DEBUG message | `log('DEBUG', ...)` | Noncritical by design. |
| `syncModuleRateLimitPause`/`syncModuleRateLimitResume` | Status save succeeds | Yes | Status store and telemetry | `module.status.changed` | `saveStatus`, `onModuleStatusChanged` | Failure before emit propagates and may leave no local rate-limit telemetry beyond prior detected event. |
| `resumeDurableCooldownForStep` | Durable cooldown replay | Yes | Lifecycle event store and log | `rate_limit.cooldown_completed`; `[cooldown-resume]` log | `appendCooldownLifecycleEvent`, `log` | No Discord resume notice on replay. |
| `finalizeSessionRateLimitExhaustion` | Terminal exhaustion | Depends on provided options | Telemetry, Discord, log, returned result | Retry exhausted/summary/gate events | Option hooks from exit helpers | Base finalizer is intentionally hook-driven. |
| `createTrackedSummarySessionRateLimitExhaustionOptions.notifyDiscord` | Summary terminal Discord failure | Yes, log only | Runtime log/stdout pipeline logger | DEBUG message | `log('DEBUG', ...)` | Caught noncritical. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js runtime | `node` binary | Observed `v24.14.0` during review | All scoped JS modules | ESM, async sleeps/hooks, object spread | No package pin in scoped files. |
| Status store/lifecycle | Internal source | Internal | `rate-limit.js`, exhaustion module | Status reads/saves and lifecycle cooldown events | Guarded save failure can propagate; P07 remains relevant. |
| Discord integration | Internal/external webhook | Internal | Pause/resume/exhaustion notifiers | Operator notices | Some sends swallowed DEBUG; terminal sends may propagate. |
| Telemetry facade | Internal source | Internal | Detected/module status/retry/gate/summary events | Observability | Base exhaustion builder needs caller finalizer to emit telemetry. |
| Common rate-limit contract | `skills/common/pipeline/services/rate-limit-contract.js` | Internal shared helper | Nova shim/builders/failures | Discord fields, detected payload, embed, recovery action | Builder contract, not centralized validator. |
| Polling sleep helper | Internal source | Internal | `handleSessionRateLimit`, durable replay, recovery options | Cooldown delay | Circular import noted safe by source comment. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Rate-limit cooldown sleeps | One sleep per rate-limited wrapper invocation | `cooldown_hours` default 2h | Blocks current module/gate/session flow; pipeline remains sequential | Lifecycle events, detected telemetry, Discord | None. |
| Pause budget | In-memory counter optionally shared by `pauseState` | `max_pauses_per_module` default 5 | Exhausts on detection count greater than cap | Terminal exhausted result; finalizer telemetry if used | None. |
| Durable cooldown replay | One persisted cooldown per scheduler step | Lifecycle read-model `resume_at` | Sleeps remaining time before resuming step | Lifecycle completion event and logs | None. |
| Discord rate-limit notices | One pause and one resume send per cooldown | No retry/backoff | Send failure DEBUG only for pause/resume; terminal send depends on finalizer | Discord/log | None. |
| Tracked correlation memory | One in-memory object per recovery option factory | Process lifetime | Sparse poll results reuse prior dispatch/gateway | Status/result/Discord fields | Summary gateway label fallback gap tracked in P18b issue. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| ACP poll result rate-limit signal | Poll result with `reason:'rate_limited'`, optional `status` carrying run/attempt/dispatch/gateway/session | Polling/session monitor callers | `withSessionRateLimitRecovery`, `processSessionRateLimit` | Cooldown sleep per signal; exhausted after max pauses | Rate-limit detected telemetry/lifecycle/Discord/result. |
| ACP session correlation | `dispatch_id`, `gateway_label`, `session_key`, `attempt`, `run_id` on status/result | Correlation resolvers and tracked status builders | Discord fields, telemetry, terminal result builders | In-memory tracked fallback across sparse poll results | Status/result payloads; Discord fields. |
| ACP terminal rate-limit exhaustion | `rate_limit_exhausted` result with `rate_limit_status` and correlation | `rate-limit-exit.js` | Module/gate/summary/pipeline terminal callers | No stream flush here; downstream finalizers emit telemetry/Discord | Returned control result and telemetry finalizer events. |
| Redis-owned ACP terminal completion | Redis entry with status/source/reason/summary/identity/pause fields, mirrored under `_redis_entry` | Redis completion service/polling | Terminal-owned Redis rate-limit builders | No local throttle | Returned result with `_source:'redis'`. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Extracted rate-limit public surface and exports | `check-rate-limit-slice-surface.mjs` | Good import/export smoke | Does not assert fallback gateway label behavior. |
| Telemetry payloads for rate-limit detected/exhaustion | `check-telemetry-contract.mjs` | Good contract behavior coverage | P16 centralized telemetry schema-owner issue remains. |
| Polling rate-limit recovery/exhaustion/correlation | behavior `polling` | Strong behavior coverage | Does not cover summary gateway-label fallback gap. |
| Module status cooldown transitions | behavior `module-failures`, polling scenarios | Partial because existing P07 guarded save issue can affect reruns | Existing P07 issue. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- `P18b-ISSUE-001` — Summary rate-limit builders ignore `gatewayLabelFallback` / tracked gateway correlation when source status lacks a gateway label.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
