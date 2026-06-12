# Batch P16 — Nova telemetry, event sinks, and observability

Status: completed
Date started: 2026-05-08
Date completed: 2026-05-08
Reviewer: Nova

## Scope

```text
skills/nova/pipeline/services/acp-observability.js
skills/nova/pipeline/services/observability.js
skills/nova/pipeline/services/telemetry.js
skills/nova/pipeline/services/telemetry-sink-contract.js
skills/nova/pipeline/services/telemetry-sink-dispatch.js
skills/nova/pipeline/services/telemetry-stream.js
skills/nova/pipeline/services/telemetry/*.js
```

Scope expansion verified live: 10 files, at the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/nova/pipeline/services/acp-observability.js
kubeclaw-main/skills/nova/pipeline/services/observability.js
kubeclaw-main/skills/nova/pipeline/services/telemetry.js
kubeclaw-main/skills/nova/pipeline/services/telemetry-sink-contract.js
kubeclaw-main/skills/nova/pipeline/services/telemetry-sink-dispatch.js
kubeclaw-main/skills/nova/pipeline/services/telemetry-stream.js
kubeclaw-main/skills/nova/pipeline/services/telemetry/builders.js
kubeclaw-main/skills/nova/pipeline/services/telemetry/dispatch.js
kubeclaw-main/skills/nova/pipeline/services/telemetry/progress.js
kubeclaw-main/skills/nova/pipeline/services/telemetry/sinks.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/contracts/check-observability-catch-reporting.mjs
kubeclaw-main/tests/verification/contracts/check-telemetry-contract.mjs
kubeclaw-main/tests/verification/contracts/check-operator-alert-surface.mjs
kubeclaw-main/tests/verification/contracts/check-redis-log-ownership.mjs
kubeclaw-main/tests/verification/behavior/areas/telemetry.mjs
kubeclaw-main/tests/verification/behavior/areas/telemetry-schema.mjs
kubeclaw-main/tests/verification/behavior/areas/runtime-surface.mjs
kubeclaw-main/tests/verification/behavior/areas/operator-surface.mjs
kubeclaw-main/tests/verification/behavior/areas/polling.mjs
```

## Per-file map

### `skills/nova/pipeline/services/acp-observability.js`

Role: ACP monitor surface observer that converts gateway/transcript monitor degradation into telemetry events.

Imports/dependencies: Logger context, ACP monitor state reader, telemetry observability updaters, shared sleep helper.

Exports/public surface: `observeAcpMonitorSurfaces`.

Defines: Context fallback, identity normalizer, monitor-to-observability-data builder, bounded polling loop.

Important variables/state: Mutates caller-provided or local `gatewayState` and `transcriptState` objects with `{ active, degradedAt }`.

Calls out to: `getAcpMonitorState`, `updateGatewayObservability`, `updateTranscriptObservability`, `sleep`.

Called by / expected callers: ACP/polling/session health-check surfaces and telemetry behavior tests.

Environment variables / CLI inputs / config fields: Reads `config._runId`, `config.run_id` through fallback context.

Paths built/read/written: Delegates stream log path to `getAcpMonitorState`; no direct path construction.

Authority behavior: Does not promote lookup label to canonical `session_key`; only normalized identity inputs populate telemetry join fields.

Error/retry/terminal behavior: No local catch. Polls up to `maxPolls` (default 3), sleeps `pollMs` (default 250 ms) between still-degraded polls, and stops early once both surfaces are restored.

Verification coverage: `check-telemetry-contract.mjs`, behavior `telemetry`, `polling`, `runtime-monitor`, `transcript-monitor`.

Findings: None.

### `skills/nova/pipeline/services/observability.js`

Role: File-backed structured event mirror, usage/cost snapshots, budget thresholds, and operator cost report helpers.

Imports/dependencies: Node `fs`/`path`; logger; runtime run id; noncritical reporting; telemetry stream.

Exports/public surface: `appendStructuredEvent`, `appendStructuredEventMirror`, `recordUsageSnapshot`, `aggregateUsage`, `checkBudgetThresholds`, `isBudgetExceeded`, `emitBudgetWarnings`, `writeCostReport`.

Defines: Pipeline JSONL event appender, structured-event health map, usage aggregate helpers, threshold calculators, budget event writer, cost-report writer.

Important variables/state: Module-global `_structuredEventHealth` Map keyed by project/run; writes cost and pipeline observability files.

Calls out to: `log`, `getRunId`, `emitTelemetryStreamEvent`, `reportClassifiedNonBlockingError`.

Called by / expected callers: Telemetry dispatch spine, cost/summary surfaces, runtime/operator behavior tests.

Environment variables / CLI inputs / config fields: Reads `config._runLogDir`, `_logDir`, `project`, run id fields, `config.observability.budget.*`.

Paths built/read/written: Appends global `.swarm/logs/pipeline/pipeline.jsonl`, run-scoped `<runLogDir>/pipeline.jsonl`, cost `usage-snapshots.jsonl`, `budget-events.jsonl`, and `cost-report.json`.

Authority behavior: Durable disk audit append is owned here; stream mirroring reports degraded/restored state but remains non-blocking.

Error/retry/terminal behavior: All operations are non-blocking. Missing log dir skips. JSON/FS failures log DEBUG/WARN or emit `observability.degraded`; budget limit check failure returns false.

Verification coverage: `check-observability-catch-reporting.mjs`, `check-redis-log-ownership.mjs`, behavior `runtime-surface`, `operator-surface`, `telemetry`.

Findings: `P16-ISSUE-001` covers missing centralized validator/schema owner for non-sink telemetry event payload builders.

### `skills/nova/pipeline/services/telemetry.js`

Role: Public telemetry facade re-exporting dispatch, builders, progress, and sink-close helpers.

Imports/dependencies: Telemetry submodules in `services/telemetry/`.

Exports/public surface: `emitEvent`, `emitEventNonBlocking`, `emitOperatorAlert`, all telemetry builder helpers, progress helpers, `closeTelemetryRedis`.

Defines: Public import surface only.

Important variables/state: None.

Calls out to: Re-exports only.

Called by / expected callers: Pipeline runners, services, ACP observability, tests.

Environment variables / CLI inputs / config fields: Delegated.

Paths built/read/written: Delegated.

Authority behavior: Documents that operator delivery is registry-owned through telemetry sinks, not legacy direct reroutes.

Error/retry/terminal behavior: Delegated.

Verification coverage: Telemetry contract and behavior tests.

Findings: None.

### `skills/nova/pipeline/services/telemetry-sink-contract.js`

Role: Telemetry sink plugin contract, sink input builder/validator, and built-in Redis/Discord sink definitions.

Imports/dependencies: Runtime run id, plugin constants, Discord integration, telemetry stream, serialization clone.

Exports/public surface: `TELEMETRY_SINK_HOOK_FAMILY`, `TELEMETRY_SINK_STAGE_ID`, `buildTelemetrySinkInput`, `validateTelemetrySinkInput`, `assertTelemetrySinkInput`, `observeRedisTelemetrySink`, `observeDiscordTelemetrySink`, `getBuiltinTelemetrySinkPluginDefinitions`.

Defines: Canonical telemetry sink ids/refs/input schema, Redis sink observer, Discord presentation observer, built-in sink plugin manifests.

Important variables/state: Frozen priority map; no mutable module state.

Calls out to: `getRunId`, `deepClone`, `emitTelemetryStreamEvent`, `discord`, `discordEmbeds`.

Called by / expected callers: Telemetry sink dispatch, registry startup, operator-alert surfaces, tests.

Environment variables / CLI inputs / config fields: Reads run id fields from `ctx.config`; sink observers require `ctx.coreRuntime.readConfig()`.

Paths built/read/written: None directly; Redis stream and Discord/audit paths delegated.

Authority behavior: Owns typed telemetry sink input contract and plugin manifests. Redis sink is full-firehose; Discord sink only acts on explicit `presentation.discord` payloads.

Error/retry/terminal behavior: `assertTelemetrySinkInput` throws on invalid schema. `readTelemetrySinkConfig` throws if core runtime is absent. Redis sink throws on non-skipped emission failure; Discord sink propagates Discord errors.

Verification coverage: `check-telemetry-contract.mjs`, `check-operator-alert-surface.mjs`.

Findings: None.

### `skills/nova/pipeline/services/telemetry-sink-dispatch.js`

Role: Registry-owned telemetry sink dispatch loop and degraded-observability incident emission.

Imports/dependencies: Logger, plugin context and capability narrowing, plugin registry, structured observability append, telemetry sink contract, serialization clone/freeze.

Exports/public surface: `dispatchTelemetrySinks`.

Defines: Missing-sink incident detection, sink invocation envelope, one-time sink degradation event per project/run/event/sink/reason.

Important variables/state: Module-global `_telemetrySinkIncidents` Set suppresses duplicate degraded events.

Calls out to: `resolveHookListeners`, `createPluginContext`, `narrowPluginInputForCapabilities`, sink `observe`, `appendStructuredEvent`, `log`.

Called by / expected callers: Telemetry dispatch spine and operator alert helper.

Environment variables / CLI inputs / config fields: Reads `ctx.config`, `ctx.progress`, optional `options.sinkModuleIds`.

Paths built/read/written: Writes degraded events through `appendStructuredEvent`.

Authority behavior: Telemetry sink registry is startup-frozen authority for operator/stream delivery. Missing/disabled registry is explicit degraded observability, not fallback direct dispatch.

Error/retry/terminal behavior: Missing listeners return `listenerMissing:true` and append degraded event. Each listener failure is caught, logged WARN, appended as degraded once, and does not block later listeners.

Verification coverage: `check-telemetry-contract.mjs`, `check-operator-alert-surface.mjs`, behavior `telemetry`.

Findings: None.

### `skills/nova/pipeline/services/telemetry-stream.js`

Role: Redis stream telemetry writer and Redis connection owner.

Imports/dependencies: Logger, runtime run id, noncritical reporting, telemetry payload sanitizer, top-level telemetry Redis constants/constructor helpers.

Exports/public surface: `isTelemetryEnabled`, `getTelemetryStreamKeyForRun`, `emitTelemetryStreamEvent`, `closeTelemetryStreamRedis`.

Defines: Lazy Redis client, identity resolver, sequence allocator, sanitized Redis stream event emitter, close helper.

Important variables/state: Module-global `_redis` lazy client.

Calls out to: `loadRedisCtor`, `getTelemetryStreamKey`, `getTelemetrySeqKey`, `sanitizeTelemetryPayload`, `reportClassifiedNonBlockingError`, Redis `incr`, `expire`, `xadd`, `quit`.

Called by / expected callers: Redis telemetry sink, observability mirror degraded/restored, tests.

Environment variables / CLI inputs / config fields: Reads `config.telemetry.enabled`, `config.telemetry.stream_key`; process env `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`.

Paths built/read/written: None; writes Redis stream keys `telemetry:<project>:<runId>` and sequence key via top-level helpers.

Authority behavior: Redis stream emission is a non-blocking projection of telemetry; disk audit remains core durable mirror.

Error/retry/terminal behavior: Disabled telemetry returns skipped. Missing project/run id returns `missing_identity`. Redis constructor failures and runtime errors are noncritical incidents. Redis emit failures return result error. Close failures log DEBUG and clear client.

Verification coverage: `check-telemetry-contract.mjs`, `check-observability-catch-reporting.mjs`, behavior `telemetry`, `seq-restart`, `redaction-surface`.

Findings: None.

### `skills/nova/pipeline/services/telemetry/builders.js`

Role: High-level telemetry event payload builders for pipeline, modules, gates, agents, retries, budgets, approvals, cost, rate limits, and observability surfaces.

Imports/dependencies: Runtime stats and telemetry dispatch helpers.

Exports/public surface: `onPipelineStarted`, `onPipelineCompleted`, `onPipelineHalted`, module/gate/agent/phase/retry/summary/budget/approval/cost/rate-limit/observability builder helpers.

Defines: Percent calculator, approval timeout normalizer, pipeline exit status mapper, event-specific payload construction.

Important variables/state: Mutates `ctx.stats.inputTokens` and `ctx.stats.outputTokens` in `onAgentKilled`; observability surface helpers mutate caller state `{ active, degradedAt }`.

Calls out to: `getRunStats`, `emitEvent`, `emitEventNonBlocking`.

Called by / expected callers: Pipeline/module/gate/agent/rate-limit/approval services and tests.

Environment variables / CLI inputs / config fields: Reads `ctx.config.resume`, `nova_prompt`, run stats, progress modules/gates/default models.

Paths built/read/written: None directly; dispatch owns sinks/disk.

Authority behavior: Owns event payload assembly but has no centralized payload validator/schema owner; docs/tests act as coverage. See `P16-ISSUE-001`.

Error/retry/terminal behavior: Most helpers call non-blocking dispatch. Terminal module/gate/pipeline events call blocking `emitEvent` and return its Promise/result. Observability state only emits on active/restored transitions, suppressing duplicate degraded/restored events.

Verification coverage: `check-telemetry-contract.mjs`, behavior `telemetry`, `telemetry-schema`, `telemetry-docs`, `operator-surface`.

Findings: `P16-ISSUE-001`.

### `skills/nova/pipeline/services/telemetry/dispatch.js`

Role: Core telemetry spine: dispatch to registry sinks, append durable disk event, and nonblocking error reporting.

Imports/dependencies: Logger, runtime run id, noncritical reporting, structured observability append, telemetry sink dispatch.

Exports/public surface: `emitEventNonBlocking`, `emitEvent`, `emitOperatorAlert`.

Defines: Core disk append helper, telemetry degraded helper, wrapper failure reporter.

Important variables/state: None.

Calls out to: `dispatchTelemetrySinks`, `appendStructuredEvent`, `reportClassifiedNonBlockingError`, `log`.

Called by / expected callers: Telemetry builders/progress helpers and direct operator alert callers.

Environment variables / CLI inputs / config fields: Reads ctx/config project/run id for incidents and disk append.

Paths built/read/written: Writes structured events through `appendStructuredEvent`.

Authority behavior: Disk audit append is always attempted after sink dispatch. Redis event payload is reused for disk when Redis sink succeeded; otherwise original payload plus source/emitter is written.

Error/retry/terminal behavior: Sink dispatch failure is caught, reported, and mirrored as `observability.degraded`. Disk append failure is reported nonblocking. `emitEventNonBlocking` catches all failures. Operator alert restricts sink module ids to Discord and returns dispatch error shape on failure.

Verification coverage: `check-observability-catch-reporting.mjs`, `check-telemetry-contract.mjs`, `check-operator-alert-surface.mjs`.

Findings: None.

### `skills/nova/pipeline/services/telemetry/progress.js`

Role: Agent transcript/progress telemetry payload helpers.

Imports/dependencies: Nonblocking telemetry dispatch.

Exports/public surface: `emitTranscriptLine`, `emitAgentProgress`.

Defines: `agent.transcript` and `agent.progress` payload construction.

Important variables/state: None.

Calls out to: `emitEventNonBlocking`.

Called by / expected callers: Polling/ACP runtime transcript monitor paths and tests.

Environment variables / CLI inputs / config fields: None direct.

Paths built/read/written: None directly.

Authority behavior: Emits joinable progress/transcript telemetry with module/gate/session/dispatch identity when caller supplies it.

Error/retry/terminal behavior: Nonblocking dispatch catches/report failures downstream.

Verification coverage: Behavior `polling`, `runtime-monitor`, `agent-lifecycle`, `telemetry`.

Findings: None.

### `skills/nova/pipeline/services/telemetry/sinks.js`

Role: Compatibility close helper for telemetry Redis sink.

Imports/dependencies: Telemetry stream close helper.

Exports/public surface: `closeTelemetryRedis`.

Defines: Async wrapper over `closeTelemetryStreamRedis`.

Important variables/state: Delegated `_redis` state in telemetry stream.

Calls out to: `closeTelemetryStreamRedis`.

Called by / expected callers: Shutdown paths/tests.

Environment variables / CLI inputs / config fields: None direct.

Paths built/read/written: None.

Authority behavior: Close-only facade.

Error/retry/terminal behavior: Delegated close is non-blocking and logs but does not throw for Redis close failure.

Verification coverage: `check-observability-catch-reporting.mjs`, telemetry behavior tests.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `acp-observability.js` | `telemetry.js` facade | `updateGatewayObservability`, `updateTranscriptObservability` | ACP monitor degradation/restoration events. |
| `telemetry.js` | `telemetry/dispatch.js`, `telemetry/builders.js`, `telemetry/progress.js`, `telemetry/sinks.js` | re-exports | Public telemetry import surface. |
| `telemetry/builders.js` | `telemetry/dispatch.js` | `emitEvent`, `emitEventNonBlocking` | Event-specific payloads into telemetry spine. |
| `telemetry/progress.js` | `telemetry/dispatch.js` | `emitEventNonBlocking` | Transcript/progress payloads. |
| `telemetry/dispatch.js` | `telemetry-sink-dispatch.js` | `dispatchTelemetrySinks` | Registry-owned Redis/Discord sinks. |
| `telemetry/dispatch.js` | `observability.js` | `appendStructuredEvent` | Core durable disk event mirror. |
| `telemetry-sink-dispatch.js` | `telemetry-sink-contract.js` | sink input builder/validator/constants | Typed sink input contract. |
| `telemetry-sink-dispatch.js` | plugin registry/context | `resolveHookListeners`, `createPluginContext` | Startup-frozen sink listener authority. |
| `telemetry-sink-contract.js` | `telemetry-stream.js` | `emitTelemetryStreamEvent` | Built-in Redis sink. |
| `telemetry-sink-contract.js` | Discord integration | `discord`, `discordEmbeds` | Built-in Discord sink. |
| `observability.js` | `telemetry-stream.js` | `emitTelemetryStreamEvent` | Structured-event mirror degraded/restored stream. |
| `telemetry/sinks.js` | `telemetry-stream.js` | `closeTelemetryStreamRedis` | Redis close compatibility facade. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `observeAcpMonitorSurfaces` | Gateway/transcript state still active vs restored | Monitor state each poll | Emit degraded/restored updates; break when both inactive | Bounded observability polling. |
| `appendStructuredEvent` | Missing log dir vs write success/failure | `_logDir`, `_runLogDir`, fs result | Skip, append both mirrors, or return error | Disk mirror nonblocking behavior. |
| `appendStructuredEventMirror` | Structured append failed/restored | Previous `_structuredEventHealth` state | Emit stream degraded/restored once per run | Visibility of disk mirror health. |
| `checkBudgetThresholds` | Cost/tokens exceed configured thresholds | Aggregated usage and budget config | Warning/exceeded event objects | Budget semantics. |
| `buildTelemetrySinkInput` | ids/refs explicit vs derived | ctx, payload, options | Canonical sink input with refs/ids/event | Sink contract identity. |
| `validateTelemetrySinkInput` | Missing run/ref/event/timestamp | Sink input object | Error list or valid | Sink boundary validation. |
| `dispatchTelemetrySinks` | Registry missing/disabled/no listeners | Plugin registry/listeners | Degraded registry event and no listeners | Sink availability authority. |
| `dispatchTelemetrySinks` | Listener succeeds/fails | Sink observe result/error | Per-listener result; failure degraded once | Sink failure isolation. |
| `emitTelemetryStreamEvent` | Disabled/missing identity/Redis unavailable/emit ok/fail | Config, env, Redis result | Skipped, error result, or Redis event | Redis stream nonblocking path. |
| `emitEvent` | Sink dispatch throws vs succeeds | Dispatch result/error | Report degraded then append disk event | Core telemetry spine resiliency. |
| `updateObservabilitySurface` | New degraded/restored/no-change | State active flag and current degradation | Emit only transition events | Suppresses duplicate observability events. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `recordUsageSnapshot` | `usage-snapshots.jsonl` | Agent/module/gate/cost fields | Include optional identity fields only when present | One JSON line per usage snapshot. |
| `aggregateUsage` | Aggregate object | Snapshot JSONL | Sum run, by_module, by_gate, by_agent; partial ORs | Usage aggregate shape. |
| `writeCostReport` | Cost report JSON | Aggregate and thresholds | Availability full/partial/tokens_only/unavailable by cost/token fields | Operator-readable cost report. |
| `dispatchTelemetrySinks` | `telemetrySinkState` object | Sink plugin side effects | Shared hidden object accumulates Redis result/event/key | Later sinks/dispatch can inspect stream metadata. |
| `emitEvent` | Disk telemetry event | Sink result and original payload | Prefer Redis sanitized event when present; otherwise source/emitter-enriched original payload | Disk event mirrors stream identity when stream succeeded. |
| `onAgentKilled` | `ctx.stats` token counters | Agent kill metadata | Add input/output tokens to existing counters | Module summary token accumulation. |
| `updateObservabilitySurface` | Caller observability state | Degraded/restored spec and identity data | Set active/degradedAt on degrade; clear on restore | One open degradation interval per state object. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `observeAcpMonitorSurfaces` | `poll < maxPolls` | `sleep(pollMs)` when pollMs > 0 and more polls remain | No absolute deadline; `maxPolls` default 3, `pollMs` default 250 | Both gateway/transcript inactive or max polls reached. |
| `dispatchTelemetrySinks` | Iterate enabled listeners | No sleep/backoff | None | All listeners attempted; failures isolated. |
| `aggregateUsage` | Iterate snapshot lines | No sleep/backoff | None | End of file. |
| `emitBudgetWarnings` | Iterate warning array | No sleep/backoff | None | All warnings attempted in one try. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `config._logDir` | Runtime log path | `observability.js` | Set by status-store init | Global pipeline/cost artifacts. |
| `config._runLogDir` | Runtime run log path | `appendStructuredEvent` | Set by status-store init | Run-scoped pipeline JSONL mirror. |
| `config.project` | Config field | Structured events, telemetry stream, incidents | empty/unknown fallback depending path | Stream identity and incident keys. |
| `config._runId`, `config.run_id`, `getRunId(config)` | Runtime id | Observability/telemetry sink/stream builders | Runtime fallback | Run identity. |
| `config.telemetry.enabled`, `config.telemetry.stream_key` | Config field | `isTelemetryEnabled` | falsey disables stream | Redis telemetry stream gate. |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | Environment variables | `getRedisClient` | host `redis-master.kubeclaw.svc.cluster.local`, port `6379` | Redis telemetry stream connection. |
| `config.observability.budget.warn_cost_usd` | Config field | `checkBudgetThresholds`, `isBudgetExceeded`, `writeCostReport` | unset | Cost warning threshold. |
| `config.observability.budget.hard_limit_cost_usd` | Config field | Budget helpers | unset | Cost hard-limit threshold. |
| `config.observability.budget.warn_tokens` | Config field | Budget helpers | unset | Token warning threshold. |
| `ctx.coreRuntime.readConfig()` | Plugin context capability | Telemetry sink observers | Required for sink plugin config | Public PluginContextV1 intentionally lacks read config. |
| `options.sinkModuleIds` | Dispatch option | `dispatchTelemetrySinks`, `emitOperatorAlert` | null/all listeners | Restricts sink dispatch, Discord-only for operator alerts. |
| `opts.maxPolls`, `opts.pollMs` | ACP observability option | `observeAcpMonitorSurfaces` | 3 polls, 250 ms | Bounded monitor observation. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| `.swarm/logs/pipeline/pipeline.jsonl` | `appendStructuredEvent` | Operators/tests | `appendStructuredEvent` | Global durable pipeline event mirror. |
| `<runLogDir>/pipeline.jsonl` | `appendStructuredEvent` | Operators/tests | `appendStructuredEvent` | Run-scoped durable pipeline event mirror. |
| `.swarm/logs/cost/usage-snapshots.jsonl` | `recordUsageSnapshot` | `aggregateUsage` | `recordUsageSnapshot` | Usage/cost snapshot input. |
| `.swarm/logs/cost/budget-events.jsonl` | `emitBudgetWarnings` | Operators/tests | `emitBudgetWarnings` | Budget warning/exceeded events. |
| `.swarm/logs/cost/cost-report.json` | `writeCostReport` | Operators/tests | `writeCostReport` | Operator cost report. |
| Redis telemetry stream key | `getTelemetryStreamKey(project, runId)` | ClawDeck/live consumers/tests | `emitTelemetryStreamEvent` | Non-blocking stream projection. |
| Redis telemetry sequence key | `getTelemetrySeqKey(project, runId)` | Redis stream emitter | `allocateSeq` | Per-run sequence counter with TTL. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Durable disk telemetry event mirror | `appendStructuredEvent` via `emitEvent` | Operators/tests/replay | None. |
| Telemetry sink input contract | `telemetry-sink-contract.js` | Sink dispatch and sink plugins | None. |
| Telemetry sink listener registry | Startup-frozen plugin registry consumed by `dispatchTelemetrySinks` | Telemetry dispatch | None. |
| Redis telemetry stream | `emitTelemetryStreamEvent` | Live consumers/ClawDeck/tests | Non-authoritative projection. |
| Discord telemetry sink | `observeDiscordTelemetrySink` | Operators/Discord audit integration | Explicit presentation only. |
| Usage/cost artifacts | `observability.js` | Cost report/summary/operators | None. |
| Observability degraded/restored state | Callers plus telemetry builders | Operators/tests | State object per surface controls dedupe. |
| Telemetry event payload schemas | `telemetry/payload-schema.js` | Telemetry builders/dispatch, consumers/tests | Central schema owner validates non-Buster Nova payloads before sink/disk projection; summary lifecycle allows pipeline/project-summary artifact fields while excluding internal control flags. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Structured disk event | `appendStructuredEvent` | `v:1`, `type`, `ts`, `run_id`, `project`, `source:'pipeline'`, `emitter`, plus payload fields | None in scoped file | Pipeline JSONL replay/operators/tests. |
| Telemetry stream event | `emitTelemetryStreamEvent` | `v:1`, `type`, `ts`, `run_id`, `project`, `seq`, `source:'pipeline'`, `emitter`, sanitized payload | `sanitizeTelemetryPayload` only | Redis stream consumers. |
| Telemetry sink input | `buildTelemetrySinkInput` | `refs`, `ids`, `event:{type,payload,emitter,source}`, `presentation`, `stateSnapshot`, `executionContext`, `occurredAt` | `validateTelemetrySinkInput`, `assertTelemetrySinkInput` | Sink plugins. |
| Sink dispatch result | `dispatchTelemetrySinks` | `input`, `listeners`, `results:[{moduleId,ok,error?}]`, `listenerMissing`, `reason?`, `telemetrySinkState` | None beyond sink input assertion | Telemetry spine/tests. |
| Usage snapshot | `recordUsageSnapshot` | `ts`, `run_id`, `agent_type`, optional module/gate/attempt/session, `source`, `input_tokens`, `output_tokens`, `estimated_cost_usd`, `partial` | None in scoped file | `aggregateUsage`. |
| Usage aggregate | `aggregateUsage` | `run`, `by_module`, `by_gate`, `by_agent`; each has token/cost/partial fields | Internal parser only | Cost report/budget checks. |
| Budget warning | `checkBudgetThresholds` | `type`, `threshold`, `current`, `limit`, `unit`, cost fields, `percent_used`, `message` | None in scoped file | Budget events/report. |
| Cost report | `writeCostReport` | `generated_at`, `run_id`, `project`, `usage`, `warnings`, `availability:{status,note}` | None in scoped file | Operators/summary. |
| Observability degraded/restored payload | `emitObservabilityDegraded`, `emitObservabilityRestored` | component/surface/reason/detail plus module/gate/session/dispatch/agent correlation and timestamps | None in scoped file | Operators/tests. |
| Agent transcript/progress payloads | `emitTranscriptLine`, `emitAgentProgress` | agent/module/gate/session/dispatch fields plus line/progress fields | None in scoped file | Telemetry consumers. |

## Prompt and agent behavior updates

None found in scoped files.

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `observeAcpMonitorSurfaces` | ACP monitor read/update throws | No local retry beyond loop | Error propagates; loop does not catch | Caller-owned failure | None. |
| `appendStructuredEvent` | Missing log dirs | Not error | No retry | Returns `{ ok:true, skipped:true }` | None. |
| `appendStructuredEvent` | Filesystem append failure | Soft | No retry | DEBUG log, returns `{ ok:false, error }` | None. |
| `appendStructuredEventMirror` | Structured event append failed | Soft | No retry | Emits `observability.degraded` to telemetry stream once per run | None. |
| `recordUsageSnapshot` | Missing `_logDir` | Not error | No retry | Return/skip | None. |
| `recordUsageSnapshot` | Snapshot write failure | Soft | No retry | DEBUG log and continue | None. |
| `aggregateUsage` | Missing/empty snapshots | Not error | No retry | Empty usage aggregate | None. |
| `aggregateUsage` | Snapshot parse/read failure | Soft | No retry | DEBUG log and empty usage | None. |
| `isBudgetExceeded` | Budget check failure | Soft | No retry | Noncritical incident, returns false | None. |
| `emitBudgetWarnings` | Budget event write failure | Soft | No retry | DEBUG log and continue | None. |
| `writeCostReport` | Cost report write/read failure | Soft | No retry | WARN log and returns null | None. |
| `validateTelemetrySinkInput` / `assertTelemetrySinkInput` | Invalid sink input | No | No retry | Throws invalid sink input error | None. |
| `observeRedisTelemetrySink` | Missing plugin config context | No | No retry | Throws | None. |
| `observeRedisTelemetrySink` | Redis stream emission failed | Soft at dispatch level | No retry | Throws to dispatch; dispatch records degraded result | Payload sanitized by stream emitter. |
| `observeDiscordTelemetrySink` | Discord send failure | Soft at dispatch level | No retry | Throws to dispatch; dispatch records degraded result | Discord integration owns redaction/audit. |
| `dispatchTelemetrySinks` | Registry missing/disabled/no listeners | Soft | No retry | WARN log, degraded event, returns listenerMissing | None. |
| `dispatchTelemetrySinks` | Sink listener throws | Soft | No retry | WARN log, degraded event once, continue next sink | None. |
| `emitTelemetryStreamEvent` | Telemetry disabled | Not error | No retry | Skipped result | None. |
| `emitTelemetryStreamEvent` | Missing project/run identity | Soft | No retry | Error result `missing_identity` | None. |
| `getRedisClient` | Redis constructor failure | Soft | No retry | Noncritical incident and null client | None. |
| Redis client runtime `error` | Redis runtime error | Soft | ioredis retryStrategy min(times*50,2000), maxRetriesPerRequest 1 | Noncritical incident | None. |
| `emitTelemetryStreamEvent` | Redis emit failure | Soft | No local retry beyond Redis client policy | Error result `redis_emit_failed` | `sanitizeTelemetryPayload` used before xadd. |
| `closeTelemetryStreamRedis` | Redis quit failure | Soft | No retry | DEBUG log, clears client | None. |
| `emitEvent` | Sink dispatch failure | Soft | No retry | Noncritical incident and disk degraded event; still appends core event | None. |
| `emitEvent` | Disk append failure | Soft | No retry | Noncritical incident | None. |
| `emitEventNonBlocking` | Any emit failure | Soft | No retry | Noncritical incident; Promise resolves undefined | None. |
| `emitOperatorAlert` | Discord-only dispatch failure | Soft | No retry | Noncritical incident, degraded event, returns dispatchError | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `observeAcpMonitorSurfaces` | Monitor read/update throws | Indirect | Caller telemetry/error handling | thrown error | Caller | No local catch. |
| `appendStructuredEvent` | Missing log dirs | Yes as return data | Return object | `skipped:true` | Function return | Expected when logging not initialized. |
| `appendStructuredEvent` | FS append failure | Yes | Core log | DEBUG appendStructuredEvent failed | `log` | Mirror wrapper can emit degraded stream event. |
| `appendStructuredEventMirror` | Append failed | Yes | Redis telemetry stream | `observability.degraded` surface `pipeline_jsonl` | `emitTelemetryStreamEvent` | Emits once per project/run until restored. |
| `recordUsageSnapshot` | Missing log dir | No | none | none | Return skip | Non-critical pre-init path. |
| `recordUsageSnapshot` | Write failure | Yes | Core log | DEBUG recordUsageSnapshot failed | `log` | Non-critical. |
| `aggregateUsage` | Missing/empty snapshots | Yes as return data | Usage aggregate | empty usage object | Function return | Expected no usage state. |
| `aggregateUsage` | Parse/read failure | Yes | Core log | DEBUG aggregateUsage failed | `log` | Returns empty usage. |
| `isBudgetExceeded` | Budget check failure | Yes | Noncritical incident reporter/core log | classification `budget_limit_check_failed` | `reportClassifiedNonBlockingError` | Returns false. |
| `emitBudgetWarnings` | Write failure | Yes | Core log | DEBUG emitBudgetWarnings failed | `log` | Non-critical. |
| `writeCostReport` | Write/read failure | Yes | Core log | WARN writeCostReport failed | `log` | Returns null. |
| Sink input assertion | Invalid input | Indirect | Dispatch/telemetry wrapper incident | invalid input thrown | Caller/`emitEvent` catch | Contract module itself emits none. |
| `observeRedisTelemetrySink` | Missing config context | Yes downstream | Sink dispatch degraded event | `observability.degraded` surface sink module | `dispatchTelemetrySinks` | Throw caught per listener. |
| `observeRedisTelemetrySink` | Stream emit failed | Yes downstream | Sink dispatch degraded event | `observability.degraded`, stream_key if known | `dispatchTelemetrySinks` | Stream emitter returns sanitized error result. |
| `observeDiscordTelemetrySink` | Discord send failed | Yes downstream | Sink dispatch degraded event | `observability.degraded` surface Discord sink | `dispatchTelemetrySinks` | Discord integration may also emit its own observability. |
| `dispatchTelemetrySinks` | Registry missing/disabled/no listeners | Yes | Pipeline JSONL/core log | `observability.degraded`, WARN log | `appendSinkDegraded`, `log` | Incident suppressed by key. |
| `dispatchTelemetrySinks` | Listener throws | Yes | Pipeline JSONL/core log | `observability.degraded`, WARN log | `appendSinkDegraded`, `log` | Continues later sinks. |
| `emitTelemetryStreamEvent` | Disabled | Yes as return data | Return object | `reason:disabled`, `skipped:true` | Function return | Intentional. |
| `emitTelemetryStreamEvent` | Missing identity | Yes as return data | Return object | `reason:missing_identity` | Function return | Sink dispatch records degraded if used by Redis sink. |
| `getRedisClient` | Constructor failure | Yes | Noncritical incident reporter/core log | classification `redis_client_init_failed` | `reportTelemetryStreamIncident` | Returns null. |
| Redis client runtime `error` | Runtime error | Yes | Noncritical incident reporter/core log | classification `redis_client_runtime_error` | Redis error handler | Non-blocking. |
| `emitTelemetryStreamEvent` | Redis emit failure | Yes as return data | Return object | `reason:redis_emit_failed` | Function return | Sink dispatch emits degraded when called through sink. |
| `closeTelemetryStreamRedis` | Quit failure | Yes | Core log | DEBUG Redis close failed | `log` | Client cleared. |
| `emitEvent` | Sink dispatch failure | Yes | Noncritical incident and disk event | `event_emit_failed`, `observability.degraded` | `reportTelemetryWrapperFailure`, `appendCoreTelemetryDegraded` | Core event still attempted. |
| `emitEvent` | Disk append failure | Yes | Noncritical incident reporter/core log | `event_emit_failed` | `reportTelemetryWrapperFailure` | No additional disk event possible. |
| `emitEventNonBlocking` | Any emit failure | Yes | Noncritical incident reporter/core log | `event_emit_failed` | `reportTelemetryWrapperFailure` | Non-blocking wrapper. |
| `emitOperatorAlert` | Discord-only dispatch failure | Yes | Noncritical incident and disk event | `operator_alert_sink_dispatch_failed` degraded | `reportTelemetryWrapperFailure`, `appendCoreTelemetryDegraded` | Returns dispatchError. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js runtime | `node` binary | Observed `v24.14.0` during review | All P16 JS modules | ESM, sync fs/path, async Redis/Discord | No package pin in scoped files. |
| Node `fs`/`path` built-ins | Runtime built-ins | Node major 24 observed | `observability.js` | Pipeline/cost JSONL/JSON artifacts | Sync IO; failures non-blocking. |
| Redis/ioredis constructor | Loaded by top-level telemetry helper | Internal dependency | `telemetry-stream.js` | Redis stream events and sequence key | Lazy client, maxRetriesPerRequest 1, retryStrategy capped 2000 ms. |
| Discord integration | Internal external webhook wrapper | Internal/external | Telemetry Discord sink | Operator sink delivery | Errors caught by sink dispatch. |
| Plugin registry/context | Internal source | Internal | Sink dispatch | Startup-frozen sink listeners and PluginContextV1 | Missing/disabled registry emits degraded observability. |
| Noncritical reporting | Internal source | Internal | Observability/dispatch/stream | Incident dedupe/logging | Non-blocking error path. |
| Redaction sanitizer | Internal source | Internal | Telemetry stream | Sanitizes stream payload before Redis xadd | Disk event uses Redis event when available. |
| ACP monitor | Internal source | Internal | ACP observability | Gateway/transcript state | Errors propagate to caller. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| ACP observability polling | `maxPolls` loop | default 3 polls, 250 ms | Stops at max polls or restoration | Observability degraded/restored events | None. |
| Telemetry sink dispatch | Sequential listener loop | Registry listener order/priority | Failed sink isolated; later sinks still attempted | Degraded event per sink incident | None. |
| Sink degradation dedupe | In-memory Set | project/run/event/sink/reason | Duplicate degraded events suppressed for process lifetime | First degraded event only | None. |
| Structured-event mirror health | In-memory Map | project/run key | One degraded until restored event | Stream degraded/restored events | None. |
| Redis telemetry stream | Redis XADD maxlen approximate | `TELEMETRY_STREAM_MAXLEN`; seq TTL `TELEMETRY_SEQ_TTL_SECONDS` | Stream trims approximately; emit errors return nonblocking result | Redis event result/degraded sink event | None. |
| Usage aggregation | Full file read and per-line parse | No explicit cap | Parse failure returns empty usage | DEBUG log | No file-size guard in scoped file. |
| Budget warning write | Sequential sync writes | No explicit cap | Failure aborts loop catch and logs DEBUG | budget-events JSONL when successful | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| ACP monitor observability identity | module/gate/gateway/session/attempt/dispatch/agent fields | Caller identity normalized by `acp-observability.js` | Observability telemetry builders | Bounded maxPolls/pollMs loop | `observability.degraded/restored` telemetry. |
| ACP monitor state | `gatewayUnreachable`, `gatewayDetail`, `transcript.lastDetail`, `sessionState` | `getAcpMonitorState` | `buildObservabilityData` | Polled per loop | Degraded/restored events. |
| Agent transcript telemetry | `agent.transcript` with line kind/text/offset/count plus session correlation | `emitTranscriptLine` | Redis/disk/Discord sinks as configured | Nonblocking dispatch | Telemetry stream and pipeline JSONL. |
| Agent progress telemetry | `agent.progress` with elapsed/transcript/files/status plus session correlation | `emitAgentProgress` | Telemetry consumers | Nonblocking dispatch | Telemetry stream and pipeline JSONL. |
| Redis telemetry event | JSON stored in Redis stream field `data` | `emitTelemetryStreamEvent` | Live telemetry consumers | `XADD MAXLEN ~ TELEMETRY_STREAM_MAXLEN`; sequence incr/expire | Stream key and event result. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Telemetry sink contract/dispatch and stream events | `tests/verification/contracts/check-telemetry-contract.mjs` | Strong contract/runtime coverage | Event payload validators missing; see `P16-ISSUE-001`. |
| Observability nonblocking catch/reporting | `tests/verification/contracts/check-observability-catch-reporting.mjs` | Good source/runtime coverage | None. |
| Operator alert/Discord sink behavior | `tests/verification/contracts/check-operator-alert-surface.mjs`, behavior `operator-surface` | Good operator-surface coverage | None. |
| Redis log ownership not duplicated in observability | `tests/verification/contracts/check-redis-log-ownership.mjs` | Source/runtime coverage | None. |
| ACP/transcript/gateway observability | behavior `telemetry`, `polling`, `runtime-monitor`, `transcript-monitor`, `agent-lifecycle` | Strong behavior coverage | None. |
| Telemetry docs/schema surfaces | behavior `telemetry-schema`, `telemetry-docs` | Good docs-schema coverage | Missing code-level payload validator; see issue. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- `P16-ISSUE-001` — Telemetry event payload builders lack a centralized validator/schema owner.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
