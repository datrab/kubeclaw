# Function call map

Status: P00a-P23b, B00a-B05, C00a-C00b, S00, V00-V01b, V02a1-V03a, OI-39, OI-41 completed; OI-42 phase 6 cleanup complete; OI-43 phase 5 updated; RV-04/RV-06/RV-18/RV-23/RV-30/RV-32 resolved; OI-47 resolved

| ID | Batch | Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- | --- | --- |
| AO6-F001 | AO6 | Forge/lifecycle waiters | Canonical `agent.*` telemetry produced from agent-observability Redis control events | Wait for hook-derived lifecycle events only | ACP/Gateway polling and transcript/session monitor calls are not valid completion/readiness callees. Missing canonical `agent.ended` degrades/fails closed. |
| AO6-F002 | AO6 | Orchestration Gateway callers | Gateway spawn/stop/steer/health wrappers | Command/control calls only | Gateway results may acknowledge requested actions or platform health, but callers must not promote them to lifecycle completion authority. |
| AO5-F001 | AO5 | `runModuleForgeWorker` | `pollForgeCompletionWithRateLimitRecovery` | Passes module/run/dispatch/session/gateway identity and `headBefore` into Forge completion polling | Enables precise `agent.ended` telemetry matching without changing spawn/kill authority. |
| AO5-F002 | AO5 | `pollForgeCompletion` | `createAgentEndedTelemetryReader`, `collectMeaningfulForgeDiffEvidence` | Waits for matching canonical `agent.ended`, settles final writes, classifies meaningful diff, and returns Forge worker poll result | Phase 6 removes ACP monitor fallback and `forge-completion.json` authority. |
| AO5-F003 | AO5 | Module Forge runner | `agent_ended_meaningful_diff` / `agent_ended_no_meaningful_diff` poll results | Promotes module to `READY_FOR_TESTING` only from hook-derived canonical `agent.ended` plus meaningful diff evidence | Buster/reviewer/lint/test stages still own quality/PASS decisions. |
| AO4-F001 | AO4 | Contract tests / future evidence runners | `compareAgentObservabilityParallelRunEvidence` | Normalizes Phase 0 ingress events and legacy ACP/Gateway records, computes coverage/span/timing/identity/pressure evidence, and returns `AgentObservabilityParallelRunEvidenceV1` | Observe-only; no Redis client, `emitEvent`, Gateway call, or lifecycle mutation. |
| AO4-F002 | AO4 | `compareAgentObservabilityParallelRunEvidence` | Internal helpers in `comparator.ts` | Maps OpenClaw event types to comparable agent evidence families, pairs tool/model/LLM records by call ids, and compares session end timestamps by identity | Missing hook evidence becomes warnings; Redis pressure above thresholds makes the evidence status degraded. |
| AO3-F001 | AO3 | `AgentObservabilityIngester.processEntry` | `mapAgentObservabilityEventToTelemetry` | Produces first-class `agent.*` telemetry payloads for promoted control events instead of generic `plugin.event` when a stable schema exists | Still validates ingress first and calls existing `emitEvent(...)` only. |
| AO3-F002 | AO3 | `mapAgentObservabilityEventToTelemetry` | Phase 0 mapping table and Phase 3 helper builders | Builds bounded summaries: duration ms to seconds, final-message counts, LLM char counts, tool param/result byte counts, model usage token/cost summaries | Full prompts, responses, tool params/results, and final messages are not copied into canonical telemetry. |
| AO3-F003 | AO3 | `tests/verification/contracts/check-telemetry-contract.mjs` | Agent-observability mapping source and payload schema registry | Verifies first-class event inventory/schema parity and sample payload validation | Treats AO3 schemas as canonical telemetry even before all are promoted by default. |
| AO2-F001 | AO2 | Nova pipeline runner runtime/tests | `createOpenClawAgentObserverPluginController` -> `openclaw plugins enable/disable kubeclaw-agent-observer`; `startAgentObservabilityIngester` -> `createAgentObservabilityIngester` / `AgentObservabilityIngester.processNext` | Enables the OpenClaw plugin for the active pipeline run, starts the Redis consumer loop from `swarm.config.json`, ensures Redis consumer group, reclaims pending records, reads new control records, validates, maps, emits, records usage snapshots, ACKs, then disables the plugin in runner cleanup | Disabled `agent_observability.plugin_control.enabled` skips plugin toggling; disabled `agent_observability.ingester.enabled` returns without touching Redis; no environment variable enables ingestion. |
| AO2-F002 | AO2 | `AgentObservabilityIngester.processEntry` | Shared Phase 0 validator and stream routing | Parses `data`, rejects malformed or payload-stream event types on control stream, maps promoted events, and calls `emitEvent(...)` | Invalid or unemittable records go to dead-letter before `XACK`. |
| AO2-F003 | AO2 | `mapAgentObservabilityEventToTelemetry` | Phase 0 telemetry mapping table plus model-usage aggregate projection | Converts promoted control events to canonical telemetry, including `openclaw.model.usage -> cost.update` with delta and cumulative USD fields when run config is available | Payload-stream LLM/tool content is not promoted. |
| AO2-F004 | AO2 | `AgentObservabilityIngester.checkPressure` / `trim` | Redis `XPENDING`, `XLEN`, `XTRIM`; observability degraded/restored reporters | Classifies control lag and payload pressure, emits health transitions, and trims control/dead-letter streams | Fake Redis tests cover pressure transition and trim behavior. |
| AO1-F001 | AO1 | OpenClaw plugin runtime / tests | `registerOpenClawAgentObserver` in `plugins/openclaw-agent-observer/src/index.ts` | Registers approved hooks with `api.on(..., { priority:-100, timeoutMs:1000 })`, seeds config from `api.pluginConfig`, and uses `api.registerService` start/stop with `ctx.config` | Hooks are observation-only and return synchronously after enqueue/drop. |
| AO1-F002 | AO1 | `OpenClawAgentObserver.handleHook` | `normalizeHookEvent` / shared `assertAgentObservabilityIngressEvent` | Converts OpenClaw hook object plus second hook context argument to Phase 0 ingress envelopes and validates them before Redis enqueue | Runtime hook context supplies identity/config when OpenClaw provides it outside the event body; normalization failures are logged once and dropped. |
| AO1-F005 | AO1 | `OpenClawAgentObserver.startDiagnostics` / `handleDiagnostic` | plugin-local `subscribeModelUsageDiagnostics`, `normalizeModelUsageDiagnosticEvent` | Subscribes to OpenClaw `onDiagnosticEvent(...)`, filters `model.usage`, normalizes to `openclaw.model.usage`, and enqueues the control event | Diagnostic usage/cost evidence is observation-only and maps to `cost.update`; it does not decide lifecycle/readiness. |
| AO1-F003 | AO1 | `AgentObserverRedisWriter.flush` | Plugin-local `selectAgentObservabilityStreamKey`, `checkAgentObservabilityPayloadSize`, `createRedisClient`/`loadRedisCtor` | Routes to control/payload Redis streams and writes `data` JSON records with approximate MAXLEN trimming | No `/app/skills` import and no canonical telemetry emission in Phase 1. |
| AO1-F004 | AO1 | `tests/verification/lib/run-contract-suite.sh` | `tests/verification/contracts/check-openclaw-agent-observer-plugin.mjs` | Adds focused plugin contract smoke test to the contract suite | Uses fake Redis, no live Redis dependency. |
| AO0-F001 | AO0 | `tests/verification/contracts/check-agent-observability-contract.mjs`, AO1 plugin, and future ingester code | `skills/common/pipeline/agent-observability/src/index.ts` | Re-exported contract functions: validation/assertion, minimal masking, stream routing, size fuse checks, telemetry mapping lookup | AO1 plugin now imports this contract; existing canonical telemetry paths remain unchanged. |
| AO0-F002 | AO0 | `tests/verification/lib/run-contract-suite.sh` | `tests/verification/contracts/check-agent-observability-contract.mjs` | Adds deterministic contract guard to the suite | Contract guard verifies llm input/output full-content fields, masking marker, payload-size fuse, stream routing, and mapping coverage. |
| P00a-F001 | P00a | `skills/nova/pipeline.ts` | `skills/nova/pipeline/index.ts` | `export *`; default re-export | Entrypoint public API delegates exactly to index. |
| P00a-F002 | P00a | `skills/nova/pipeline.ts` | `skills/nova/pipeline/cli.ts` | dynamic import `{ main }`; `await main()` | Only on direct invocation. |
| P00a-F003 | P00a | `skills/nova/pipeline/cli.ts main` | `skills/nova/pipeline/cli-args.ts` -> `skills/common/pipeline/cli-args.ts`; local `normalizeNovaCliFlags` | `parseCliFlagValues`; frozen canonical flag normalization | Strict parser throws on invalid argv; Nova immediately maps raw keys to one immutable camelCase object and catches parser/normalizer failures through the JSON error envelope. |
| P00a-F004 | P00a | `skills/nova/pipeline/cli.ts main` | `skills/nova/pipeline/index.ts` | `loadConfig`, `EXIT_OK`, `EXIT_ERROR`, `registerShutdownHooks` | Uses public API imports. |
| P00a-F005 | P00a | `skills/nova/pipeline/cli.ts main` | `skills/nova/pipeline/services/blueprint.ts` | `listBlueprints`, `releaseBlueprint` | Blueprint command surface. |
| P00a-F006 | P00a | `skills/nova/pipeline/cli.ts main` | `skills/nova/pipeline/core/context.ts` | `createPipelineContext` | Builds context with config/progress/runId/stats/novaChannel. |
| P00a-F007 | P00a | `skills/nova/pipeline/cli.ts main` | `skills/nova/pipeline/core/logger.ts` | `setActiveContext`, `clearActiveContext` | Set after context creation; clear only in catch. |
| P00a-F008 | P00a | `skills/nova/pipeline/cli.ts main` | `skills/nova/pipeline/core/temp.ts` | `createTempManager().init()/cleanup()` | Temp lifecycle wrapper. |
| P00a-F009 | P00a | `skills/nova/pipeline/cli.ts main` | `skills/nova/pipeline/services/status-store.ts` | `initLogDir` | Log directory setup. |
| P00a-F010 | P00a | `skills/nova/pipeline/cli.ts main` | `skills/nova/pipeline/core/runtime.ts` | `createRunId`, `createRunStats` | Run identity/stats. |
| P00a-F011 | P00a | `skills/nova/pipeline/cli.ts main` | `skills/nova/pipeline/core/policy.ts` | `validateThinkingLevel`, `VALID_THINKING_LEVELS` | Early validation of runtime thinking override; CLI help renders the accepted enum from `VALID_THINKING_LEVELS.join('|')`. |
| P00a-F012 | P00a | `skills/nova/pipeline/cli.ts main` | `skills/nova/pipeline/runners/pipeline-runner.ts` | `runPipeline`, `printStatus`, `dryRun` | Main command routes. |
| P00a-F013 | P00a | `skills/nova/pipeline/cli.ts main` | `skills/nova/pipeline/services/prompt-ingress.ts` | `resolveNovaPromptIngress`, `PROMPT_INGRESS_MAX_BYTES` | Bounded/redacted operator prompt ingress before runner handoff. |
| P00a-F014 | P00a | `skills/nova/pipeline/index.ts` | Owned implementation modules | named/default re-exports | Narrow public allowlist. |
| P00b-F001 | P00b | `skills/nova/pipeline/git-primitives.ts` | `skills/common/pipeline/git-primitives.ts` | `export *` | Nova shim delegates directly to the canonical typed common Git primitive owner. |
| P00b-F002 | P00b | `skills/nova/pipeline/lifecycle-state.ts` | `skills/common/pipeline/lifecycle-state.ts` | `export *` | Nova shim delegates directly to the canonical typed common lifecycle-state owner. |
| P00b-F003 | P00b | `skills/nova/pipeline/noncritical-reporting.ts` | `skills/common/pipeline/noncritical-reporting.ts` | `export *` | Nova shim delegates all noncritical reporting exports to common owner. |
| P00b-F004 | P00b | `skills/nova/pipeline/redaction.ts` | `skills/common/pipeline/redaction.ts` | `export *` | Nova shim delegates all redaction exports to common owner. |
| P00b-F005 | P00b | `skills/nova/pipeline/security.ts` | `skills/common/pipeline/security.ts` | `export *` | Nova shim delegates all security exports to common owner. |
| P00b-F006 | P00b | `skills/nova/pipeline/telemetry.ts` | `skills/common/pipeline/telemetry.ts` | `export *` | Nova shim delegates telemetry constants/key helpers to common owner. |
| P00b-F007 | P00b | `skills/nova/pipeline/timing.ts` | `skills/common/pipeline/timing.ts` | `export *` | Nova shim delegates timing primitive to common owner. |
| P00b-F008 | P00b | `skills/nova/pipeline/core/git-context.ts` | `skills/nova/pipeline/git-primitives.ts` | Git primitive imports | Expected production-local import path. |
| P00b-F009 | P00b | Nova module/status/rate-limit/polling/failure services | `skills/nova/pipeline/lifecycle-state.ts` | Lifecycle mutation helpers | Expected callers use shim path rather than direct common imports. |
| P00b-F010 | P00b | Nova observability/Discord/Redis/failure services | `skills/nova/pipeline/noncritical-reporting.ts` | Noncritical reporting helpers | Expected callers use shim path. |
| P00b-F011 | P00b | Nova gate/status/summary/Discord/telemetry helpers | `skills/nova/pipeline/redaction.ts` | Redaction/artifact helpers | Expected callers use shim path. |
| P00b-F012 | P00b | `skills/nova/pipeline/tools/project-summary.ts` | `skills/nova/pipeline/security.ts` | `validateAllowedPath` | Nova security shim caller found in current search. |
| P00b-F013 | P00b | `skills/nova/pipeline/services/telemetry-stream.ts`; `skills/nova/pipeline/services/artifact-bundle.ts` | `skills/nova/pipeline/telemetry.ts` | Redis telemetry constants/key helpers | Top-level telemetry shim is separate from service-level telemetry emitters. |
| P00b-F014 | P00b/RV-23 | Nova polling/ACP/Git wait helpers | `skills/nova/pipeline/timing.ts` | `sleep`, `createBudget`, `createBudgetFromMinutes`, `BudgetExhaustedError` | Expected callers use shim path; budget-aware sleeps reject on absolute budget exhaustion. |
| P01-F001 | P01 | `core/config.js` | `core/platform-config.js` | `loadPlatformSwarmConfig`, discovery re-exports | Platform config loaded before project progress validation. |
| P01-F002 | P01 | `core/config.js` | `core/git-context.js` | `getRepoRoot`, `setRepoRoot` | Repo discovery fallback and Git helper default binding. |
| P01-F003 | P01 | `core/config.js` | `core/paths.js` | `validateSafePath` | Validates Redis tool paths. |
| P01-F004 | P01 | `core/config.js` | `core/policy.js` | policy re-exports | Config module remains policy facade. |
| P01-F005 | P01 | `core/config.js` | `core/registry.js` | `buildPluginRegistry` | Startup plugin registry and gate type validation. |
| P01-F006 | P01 | `core/context.js` | `core/runtime.js` | `bindRunContext`, `createRunId`, `createRunStats`, `createEffectReceipt` | Runtime context bridge and default receipts. |
| P01-F007 | P01 | `core/context.js` | `core/registry.js` | `resolveStageOwner` | Finds plugin owner if record not supplied. |
| P01-F008 | P01 | `core/context.js` | `services/correlation.js` | `buildInvocationSnapshot` | Shared plugin invocation/correlation snapshot. |
| P01-F009 | P01 | `core/context.js` | `services/artifact-bundle.js` | `createPluginArtifactsApi` | Default plugin artifact surface. |
| P01-F010 | P01 | `core/context.js` | `services/observability.js` | `appendStructuredEvent` | Default plugin stream sink. |
| P01-F011 | P01 | `core/context.js` | `services/telemetry-stream.js` | `emitTelemetryStreamEvent` | Default plugin telemetry sink. |
| P01-F012 | P01 | `core/context.js` | `integrations/discord.js` | `discord` | Default plugin notify.operator sink. |
| P01-F013 | P01 | `core/paths.js` | `core/runtime.js` | `getRunId` | Run-scoped log dir builder. |
| P01-F014 | P01 | `core/policy.js`; `core/logger.js` | `core/runtime.js`; `services/system-io-warning.js` | `getRunId`; `emitPolicyAuditAppendWarning`; `emitPipelineLogAppendWarning` on append failure | Model-policy and structural pipeline JSONL append failures emit `system.io_warning` through the shared I/O warning helper without using file-backed telemetry append. |
| P01-F015 | P01 | `core/runtime.js` | `core/logger.js`, `redaction.js` | `getActiveContext`, `sanitizeJsonEgress` | Active context fallback for run identity; stdout JSON is sanitized at output boundary. |
| P01-F016 | P01 | `core/git-context.js` | `../git-primitives.ts` | named re-export | Facade to shared Git primitives. |
| P02-F001 | P02 | `core/registry.js` | `core/registry/config-normalization.js` | `normalizePluginConfig` | Normalizes `config.plugins` before discovery/indexing. |
| P02-F002 | P02 | `core/registry.js` | `core/registry/builtins.js` | `BUILTIN_PLUGIN_DEFINITIONS` via cloned definitions | Built-in definitions seed startup registry. |
| P02-F003 | P02 | `core/registry.js` | `core/registry/validation.js` | manifest/config/trust/capability/implementation validators | Validation errors accumulate into startup failure. |
| P02-F004 | P02 | `core/registry.js` | `core/registry/indexes.js` | `buildStageOwnerIndex`, `buildGateTypeIndex`, `buildHookIndex` | Creates frozen lookup surfaces. |
| P02-F005 | P02 | `core/registry/builtins.js` | gate/validator/generator services | `run*Stage`, `generate*`, control adapters | Built-in plugins bridge registry dispatch to existing implementations. |
| P02-F006 | P02 | `core/registry/builtins.js` | plugin context surfaces | `ctx.stream.emit`, `ctx.telemetry.emit`, `ctx.workerRuntime.dispatch` | Bridge trace and worker dispatch. |
| P02-F007 | P02 | `core/registry/config-normalization.js` | `core/paths.js` | `validateSafePath` | Validates configured extra plugin paths before rejecting custom discovery. |
| P02-F008 | P02 | `core/registry/validation.js` | `core/registry/config-normalization.js` | `allKnownCapabilities` | Shared capability universe. |
| P02-F009 | P02 | `services/adapter-registry.js` | `tools/redis.ts` | static default import | Redis runtime adapter source. |
| P02-F010 | P02 | `services/adapter-registry.js` | `tools/project-summary.ts` | static `generateSummary` import | Project-summary generator source. |
| P02-F011 | P02 | `services/dependencies.js` | `services/status-store.js` | `projectGateSchedulerState`, `projectModuleSchedulerState` | Canonical dependency read models. |
| P02-F012 | P02 | `services/validation.js` | `core/paths.js` | `modulePath`, `projectSrcPath` | Validation input path construction. |
| P03-F001 | P03 | `integrations/discord.js` | `integrations/discord-webhook.ts` | `postDiscordWebhook` | Webhook delivery after audit/test/mute/config gates. |
| P03-F002 | P03/RV-25 | `integrations/discord.js` | `services/observability.js` | `recordObservabilityDegraded`, `recordObservabilityRestored` | Discord webhook/audit health transitions delegate to the central circuit-breaker state machine; no Discord-local health map remains. |
| P03-F003 | P03 | `integrations/discord.js` | `noncritical-reporting.js`, `redaction.js` | incident helpers, `sanitizeDiscordMessage`, `sanitizeJsonEgress` | Sanitized notifications, sanitized injected Discord sinks, sanitized audit JSONL, and nonblocking incident reporting. |
| P03-F004 | P03 | `integrations/git-worktree.ts` | `core/git-context.js` | Git primitives | Repo-scoped Git command/hash/cache operations. |
| P03-F005 | P03 | `integrations/git-worktree.ts` | `services/failures/classification.js`, `agents/lifecycle.js`, `lifecycle-state.ts` | failure classification, tracked agents, status transition | Git safety and Buster handoff status update; transient push retries stay local logs/stats, while soft-fail telemetry is emitted by orchestration callers through the shared Git soft-fail observability helper. |
| P03-F006 | P03 | `services/discord-fields.js` | `services/rate-limit-contract.js` | re-exported `DISCORD_FIELD_SPECS`, `DISCORD_IDENTITY_SURFACES`, `DISCORD_IDENTITY_FIELD_SETS`, `buildDiscordIdentityFields`, `buildDiscordIdentitySurfaceFields` | Central Discord identity field schema and surface-set facade. |
| P03-F007 | P03 | `services/redis-log.js` | `core/paths.js`, `core/runtime.js` | `redisLogArtifactTargets`, `getRunId` | Redis artifact target construction/run id. |
| P03-F008 | P03 | `tools/redis.ts` | `telemetry.js`; `services/redis-completion.js`; `services/task-transport-contract.js` | `loadRedisCtor`/`createRedisClient`, scan/archive/identity helpers, `createRedisTaskQueue` for task publish | Completion ownership lives in service helper; task dispatch goes through TaskQueue after secure Redis client construction. |
| P03-F009 | P03 | `tools/redis.ts` | `integrations/discord.js`, `redaction.js` | dynamic imports in `logToDiscord` | Optional task notification path; errors ignored. |
| P03-F010 | P03 | `integrations/gateway.ts` | `skills/common/pipeline/integrations/gateway.ts` | `export *` | Nova compatibility facade. |
| P03-F011 | P03 | `integrations/discord-webhook.ts` | `skills/common/pipeline/integrations/discord-webhook.ts` | `export *` | Nova compatibility facade. |
| P03-F012 | P03 | `integrations/git-worktree.ts isRuntimeStatePath` | local `normalizeRepoPathForRuntimeCheck` | normalize Git-relative/slash-prefixed/repo-prefixed paths before `.swarm` allowlist checks | Runtime-state conflict/stash classification preserves the `.swarm` segment. |
| P04-F001 | P04 | `agents/acp-monitor.js` | `skills/common/pipeline/agents/acp-monitor.ts` | `export *` | Nova shim delegates ACP monitor implementation to common owner. |
| P04-F002 | P04 | `agents/lifecycle.js` | `skills/common/pipeline/agents/lifecycle.ts` | `export *` | Nova shim delegates lifecycle/session tracking implementation to common owner. |
| P04-F003 | P04 | `agents/runtime.js` | `skills/common/pipeline/agents/runtime.ts` | `export *` | Nova shim delegates runtime/harness classification to common owner. |
| P04-F004 | P04 | `agents/session-semantics.js` | `skills/common/pipeline/agents/session-semantics.ts` | `export *` | Nova shim delegates session state vocabulary and status parsing to common owner. |
| P04-F004a | OI-41 | `agents/tracked-agents.js` | `skills/common/pipeline/agents/tracked-agents.ts` | `export *` | Nova/Buster shims delegate the process-local tracked-agent registry to the neutral common owner. |
| P04-F005 | P04 | `agents/shutdown.js` | `agents/lifecycle.js` | tracked-agent and kill helpers | Shutdown delegates tracked-session authority to shared lifecycle shim. |
| P04-F006 | P04 | `agents/shutdown.js` | `services/status-store.js`; `lifecycle-state.ts` | `loadStatus`, `transitionModuleStatus`, `saveStatus` | Signal shutdown marks interrupted in-flight module as FAIL. |
| P04-F007 | P04 | `agents/shutdown.js` | `integrations/gateway.ts`; `services/telemetry.js` | gateway URL/token helpers; `closeTelemetryRedis` | Session stop and final telemetry transport cleanup. |
| P04-F008 | P04 | `agents/orchestration-healthcheck.js` | `agents/acp-monitor.js`, `agents/lifecycle.js` | transcript/session helpers, `getTrackedAgent` | Health check combines gateway status and transcript progress. |
| P04-F009 | P04 | `agents/orchestration-healthcheck.js` | `services/telemetry.js` | `emitObservabilityDegraded`, `emitObservabilityRestored` | Gateway health degradation/restoration events. |
| P04-F010 | P04/OI-41 | Common `agents/lifecycle.js` | Common `agents/session-semantics.js`, `agents/runtime.js`, `agents/tracked-agents.js`, gateway helper | state parsing, runtime resolution, tracked-agent re-exports, gateway calls | Lifecycle owns low-level spawn/kill primitives and no longer imports ACP monitor; shared state parsing and tracked-agent registry are neutral static dependencies. |
| P04-F012 | P04/RV-14 | Common `agents/session-termination.js` | Common `agents/lifecycle.js`; `services/acp-gateway-contract.js` | `killSession`, active-session helpers, `assertValidSessionTerminationResult` | Canonical termination controller with isolated grace-period budget and strict result schema. |
| P04-F011 | OI-41 | Common `agents/acp-monitor.js` | Common `agents/tracked-agents.js`, `agents/session-semantics.js` | static `getTrackedAgent`, `parseSessionState`, terminal helpers | ACP monitor resolves Nova label lookups through the neutral tracked-agent read model; no lazy lifecycle import remains. |
| P05-F001 | P05 | `module-workers.js` | `module-worker-control-results.ts` | `buildModuleForgeWorkerControlResult`, `buildModuleBusterWorkerControlResult` | Worker execution returns typed control results directly. |
| P05-F002 | P05 | `module-workers.js` | `orchestration.ts` | `spawnAgent`, `killAgent` | Default spawn/kill dependency path. |
| P05-F003 | P05 | `orchestration.ts` | `module-workers.js` | `runModuleForgeWorker`, `runModuleBusterWorker` | Re-exported module worker entrypoints. |
| P05-F004 | P05 | `orchestration.ts` | `reviewer-lifecycle.js` | `spawnReviewerAgent`, `killReviewerAgent` | Re-exported reviewer lifecycle entrypoints. |
| P05-F005 | P05/RV-14 | `orchestration.ts` | `lifecycle.js`; `session-termination.js` | `spawnSession`, `trackAgent`, `untrackAgent`, `getTrackedAgent`, `terminateSession` | Shared lifecycle tracking plus canonical termination authority. |
| P05-F006 | P05 | `orchestration.ts` | `adapter-registry.js`; `core/paths.js` | `resolveRegisteredRedisAdapter`; module/gate Buster path ref helpers | Static fail-closed Redis adapter selection; Buster payload path fields are produced only through canonical path helpers. |
| P05-F007 | P05/OI-47 | `orchestration.ts` | `gateway.js` typed operation facade | `sendGatewaySessionMessage` | ACP steer path uses the common Gateway operation wrapper; raw Gateway tool names stay inside common. |
| P05-F008 | P05 | `orchestration.ts`; `reviewer-lifecycle.js` | `orchestration-lifecycle-events.js` | spawn/kill telemetry and Discord field builders | Shared lifecycle event schemas. |
| P05-F009 | P05/RV-14 | `orchestration.ts`; `reviewer-lifecycle.js` | `session-termination.js` | `terminateSession` | Post-kill confirmation monitor removed; canonical termination result controls untracking. |
| P05-F010 | P05 | `orchestration.ts`; `reviewer-lifecycle.js` | `telemetry.js`; `discord.js` | `onAgentSpawned`, `onAgentKilled`, `discord` | Operator/telemetry lifecycle notifications. |
| P06-F001 | P06 | `pipeline-runner.js` | `pipeline-runner-recovery.js` and `pipeline-runner-lock.js` | leased lock acquire/release/heartbeat, stale reconciliation | Top-level run safety before pipeline start; heartbeat is stopped in `runPipeline` finally via release; lock implementation is isolated from stale recovery. |
| P06-F002 | P06 | `pipeline-runner.js` | `pipeline-runner-start.js` | `startPipelineRun`, `runSingleModulePipeline`, `preparePipelineStart` | Start, single-module, and architecture validation phases. |
| P06-F003 | P06 | `pipeline-runner.js` | `pipeline-runner-loop.js` | `runPipelineLoop` | Thin full-run loop entrypoint after prep. |
| P06-F004 | P06 | `pipeline-runner-loop.js` | `pipeline-runner-state-machine.js` | `runPipelineStateMachine` | Explicit done/blocked/validator/gate/module action routing. |
| P06-F005 | P06 | `pipeline-runner-state-machine.js` | `pipeline-runner-terminal.js` | `completePipeline`, `haltPipeline`, normalization | Terminal routing from planned actions and step results. |
| P06-F012 | P06 | `pipeline-runner-state-machine.js` | `pipeline-runner-scheduling.js` via injected callbacks | next-step and validator helpers | State machine receives scheduler selection and validator execution from the loop seam. |
| P06-F013 | P06 | `pipeline-runner-state-machine.js` | `rate-limit.js` | `resumeDurableCooldownForStep` | Planned runnable steps resume durable cooldown before validator/gate/module execution. |
| P06-F006 | P06 | `pipeline-runner-start.js` | `pipeline-runner-terminal.js` | `finalizeTerminalHalt`, `emitPipelineSummaryLifecycle` | Single-module and architecture terminal exits. |
| P06-F007 | P06 | `pipeline-runner-terminal.js` | `pipeline-runner-scheduling.js` | `runScheduledGenerator` | Project summary/review/case-study generator scheduling. |
| P06-F008 | P06 | `pipeline-runner-scheduling.js` | `pipeline-runner-scheduling/validator-completions.js` | completion helpers | Durable scheduled validator idempotence. |
| P06-F009 | P06 | `pipeline-runner-scheduling.js` | `pipeline-runner-scheduling/snapshots.js` | counts/artifact refs | Generator input state snapshots. |
| P06-F010 | P06 | runner helpers | `pipeline-runner-deps.js` | `getPipelineRunnerDeps` | Central verification DI seam. |
| P06-F011 | P06 | `pipeline-runner-scheduling.js` | `contracts/generator-result.js` | `normalizeGeneratorResult`, `validateGeneratorResult` | Scheduled generator outputs use the shared v1 generator contract before scheduling-specific `outputs.status` validation. |
| P07-F001 | P07 | `module-runner.ts` | `module-runner/attempt.ts` | `resolveModuleRunContext`, `executeModuleAttempt`, `getModuleRunnerDeps` | Public wrapper delegates attempt sequencing to P08 internals. |
| P07-F002 | P07 | `module-runner.ts` | `module-runner-shared.ts` | `_telemetryCtx`, `buildModuleStepResult`, `setLogScope` | Retry telemetry and typed step result wrapper. |
| P07-F003 | P07 | `module-runner-forge.ts` | `module-runner-shared.ts` | input builders, fields, validation, result normalizers | Shared schemas and projections. |
| P07-F004 | P07 | `module-runner-forge.ts` | `module-runner/preflight.js` | `runModulePreflight` | Preflight owned by P08 internals. |
| P07-F005 | P07 | `module-runner-forge.ts` | Plugin registry/context | `worker:module_forge` | Forge worker plugin dispatch. |
| P07-F006 | P07 | `module-runner-prebuster.ts` | Plugin registry/context | `validator:delivery_lint`, `validator:pre_check` | Pre-Buster deterministic validators. |
| P07-F007 | P07 | `module-runner-buster-worker.ts` | Plugin registry/context | `worker:module_buster` | Buster worker plugin dispatch. |
| P07-F008 | P07 | deleted Buster compatibility re-export | `module-runner/buster-phase.ts` | canonical import target | Old static re-export removed; callers use the extracted Buster phase directly. |
| P07-F009 | P07 | `module-runner-shared.ts` | `agents/module-workers.js` | default worker runtime dispatch | Plugin effect can call default Forge/Buster worker helpers. |
| P07-F010 | P07 | P07 files | lifecycle-state, telemetry, Discord, contracts | status mutation, events, typed validation | Shared downstream authorities. |
| P08-F001 | P08 | `module-runner.ts` | `module-runner/attempt.ts` | `executeModuleAttempt` | Public retry loop delegates dependency precheck and one-attempt state-machine startup here. |
| P08-F002 | P08 | `attempt.js` | `module-runner/state-machine.ts` | `runModuleAttemptStateMachine` | Explicit loaded-status, phase, retry/terminal, and unexpected-status action routing. |
| P08-F003 | P08 | `module-runner/state-machine.ts` | `module-runner-forge.ts` | `runModuleForgePhase`, `finalizeForgeOnlyPass` | Forge and forge-only PASS stages. |
| P08-F004 | P08 | `module-runner/state-machine.ts` | `module-runner-prebuster.ts` | `prepareModuleForBuster` | Pre-Buster validation and Git sync. |
| P08-F011 | P08 | `module-runner/state-machine.ts` | `module-runner/buster-phase.ts` | `runModuleBusterPhase` | Buster dispatch/completion loop. |
| P08-F005 | P08 | `buster-phase.ts` | `buster-phase/dispatch.ts` | `executeBusterAttemptDispatch` | One crash-retry dispatch attempt. |
| P08-F006 | P08 | `dispatch.js` | `module-runner-buster-worker.ts` | `executeBusterWorkerAttempt` | Registry-backed Buster worker adapter from P07. |
| P08-F007 | P08 | `buster-phase.ts` | `buster-phase/poll-failure.ts` | `handleFailedPollResult` | Handles non-ok poll outcomes. |
| P08-F008 | P08 | `buster-phase.ts` | `buster-phase/terminal-failure.ts` | `handleBusterFailOrBlockedStatus` | Handles terminal FAIL/BLOCKED status. |
| P08-F009 | P08 | `buster-phase.ts` | `buster-phase/terminal-pass.ts` | `handleBusterPassStatus` | Handles terminal PASS status. |
| P08-F010 | P08 | Buster handlers | `buster-phase/identity.ts`; `terminal-results.js` | correlation and terminal builders | Shared P08 helper surfaces. |
| P09-F001 | P09 | `gate-runner.js` | `stage-envelope-primitives.js` | `buildStageRefs`, `buildStagePluginInvocation`, `collectExistingArtifactRefs` | Gate run-input and artifact envelope. |
| P09-F002 | P09 | `gate-runner.js` | `remediable-gate-engine.js` | `runScheduledRemediableGate`, `finalizeGateCompatibilityResult` | Remediable gate loop route. |
| P09-F003 | P09 | `gate-runner.js` | `waitable-gate-engine.js` | `runScheduledWaitableGate` | Waitable gate loop route. |
| P09-F004 | P09 | `remediable-gate-engine.js` | `remediation-handoff.js` | remediation controller/loop helpers | Generic request-fix loop mechanics. |
| P09-F005 | P09 | `waitable-gate-engine.js` | gate-specific wait controller | `waitForSignal` | Generic wait resolution. |
| P09-F006 | P09 | `gate-forge-fix-cycle.js` | `gate-fix-scaffold.js` | start/finish scaffold | Shared Forge fix side effects. |
| P09-F007 | P09 | `gate-fix-scaffold.js` | `gate-active-session.js` | persist/clear helpers | Gate active-session recovery evidence. |
| P09-F008 | P09 | `gate-active-session.js` | `session-authority.js` and lifecycle read models | identity normalization/confirmation | Lifecycle active session authority. |
| P09-F009 | P09 | `core/registry/builtins.js` | review/Buster/approval gate runner exports | `run*GateStage`, `get*GateControlAdapter` | Registry exposes evaluation stages plus strategy adapters; direct `run*Gate` orchestration helpers are not registry calls. |
| P10-F001 | P10 | `review-gate-runner.js` | `review-gate-task.js` | `runReviewGateOnce`, `reviewOutputPath`, `describeReviewTranscriptActivityState` | Echo review task and output path. |
| P10-F002 | P10 | `review-gate-runner.js` | `review-gate-control.js` | control result and request-fix builders | Typed review gate result authority. |
| P10-F003 | P10 | `review-gate-control.js` | `review-gate-output.js` | issue extraction/findings/summary | Reuses output facts for control metadata. |
| P10-F004 | P10 | `review-gate-runner.js` | `review-gate-fix-cycle.js` | `performReviewGateFixAttempt` | Review-specific fix adapter. |
| P10-F005 | P10 | `review-gate-fix-cycle.js` | `gate-forge-fix-cycle.js` | `runGateForgeFixCycle` | Shared Forge fix session mechanics. |
| P10-F006 | P10 | `review-gate-runner.js` | `remediable-gate-engine.js` | `createReviewGateRemediationController` consumed by generic scheduled remediable route | Generic GateRunner owns request-fix orchestration; no direct review runtime wrapper remains. |
| P10-F007 | P10 | `review-gate-task.js` | `gate-active-session.js` | `persistGateActiveSession`, `clearGateActiveSession` | Echo active-session recovery evidence. |
| P10-F008 | P10 | `review-gate-task.js` | `review-gate-output.js` | `parseReviewOutputContent` | Strict review JSON/status parser. |
| OI43-F001 | OI-43 phase 2 | `module-runner-forge.ts`, `review-gate-task.js`, `gate-forge-fix-cycle.js`, `buster-gate-terminal.js` | `services/git-soft-fail-observability.ts` | `emitGitCommitPushSoftFailDegraded` | Orchestration-owned Git persistence degradation telemetry with caller context; stable payload fields stay centralized. |
| P11-F001 | P11 | `buster-gate-runner.ts` | `buster-gate-task.js` | identity/archive/spawn/rate-limit helpers | Pure Buster gate correlation and payload helpers. |
| P11-F002 | P11 | `buster-gate-runner.ts` | `buster-gate-completion.js` | `waitBusterGateCompletionEvidence` | Active Buster gate completion wait via event adapters/controller; fatal adapter and timeout terminal paths write durable operator-alert JSONL. |
| P11-F003 | P11 | `buster-gate-runner.ts` | `buster-gate-terminal.js` | `handleBusterGateEvaluationResult` | Terminal outcome and request-fix mapping. |
| P11-F004 | P11 | `buster-gate-runner.ts` | `buster-gate-fix-cycle.js` | `performBusterGateFixAttempt` | Buster-specific Forge fix adapter. |
| P11-F005 | P11 | `buster-gate-runner.ts` | `buster-gate-control.js` | control/result/issue helpers | Typed Buster control-result authority. |
| P11-F006 | P11 | `buster-gate-fix-cycle.js` | `gate-forge-fix-cycle.js` | `runGateForgeFixCycle` | Shared Forge fix side effects. |
| P11-F007 | P11 | `buster-gate-runner.ts` | `remediable-gate-engine.js` | `createBusterGateRemediationController` consumed by generic scheduled remediable route | Generic GateRunner owns request-fix orchestration; no direct Buster runtime wrapper remains. |
| P11-F008 | P11 | `buster-gate-runner.ts` | `gate-active-session.js` | `persistGateActiveSession`, `clearGateActiveSession` | Active gate-session recovery evidence. |
| P12-F001 | P12 | `approval-gate-runner.js` | `approval-gate-control.js` | terminal/wait/coerce/project helpers | Typed control-result authority. |
| P12-F002 | P12 | `approval-gate-runner.js` | `approval-gate-state.js` | load/save/audit/fail-closed helpers | Persistent approval evidence and audit artifacts. |
| P12-F003 | P12 | `approval-gate-runner.js` | `approval-gate-shared.js` | status/policy/identity helpers | Shared approval enum/normalization authority. |
| P12-F004 | P12 | `approval-gate-control.js` | `approval-gate-shared.js` | status/policy constants | Wait and metadata schema. |
| P12-F005 | P12 | `approval-gate-state.js` | `approval-gate-shared.js`; `discord-fields.js` | approval identity/normalization; canonical approval Discord identity surface fields | State artifact and operator presentation. |
| P12-F006 | P12 | `approval-gate-runner.js` | status-store/governance/telemetry services | wait sync/outcome/events | Lifecycle/read-model and observability projection. |
| P12-F007 | P12/RV-16 | `approval-gate-runner.js` | `pipeline-event-contract.js`; `approval-signal-event-adapter.js` | `createPipelineEventBus`, `waitForAny`, `createApprovalSignalEventAdapter` | Approval waits consume canonical EventBus signals; filesystem watching stays at the edge. |
| P12-F008 | P12/RV-16 | `approval-signal-event-adapter.js` | `pipeline-event-contract.js`; `core/paths.js`; `approval-gate-shared.js` | `assertPipelineEvent`, `assertPipelineEventBusAdapter`, `gateStatusPath`, approval normalization | Adapter emits strict `approval.signal` events from gate-state filesystem changes and owns watcher teardown. |
| P13-F001 | P13 | `gate-control-result.js` | `control-result-mapping.js` | `buildControlResultMapping`, `buildUnknownControlResultMapping` | Gate compatibility mapping. |
| P13-F002 | P13 | `validator-control-result.js` | `control-result-mapping.js` | `buildControlResultMapping` | Validator pass/request-fix/block mapping. |
| P13-F003 | P13 | `worker-control-result.js` | `control-result-mapping.js` | mapping helpers | Worker backend-result mapping. |
| P13-F004 | P13 | `pipeline-step-result.js` | `compatibility-authority.js` | `findCompatibilityAuthorityKeys`, `stripCompatibilityAuthority` | Reject/strip legacy authority. |
| P13-F005 | P13 | Gate/worker/validator contracts | `contract-diagnostics.js` | `createContractInvalidError` | Contract-invalid error envelope. |
| P13-F006 | P13 | `index.js` | contract modules | namespace re-exports | Public grouped contract import surface. |
| P14-F001 | P14 | `status-store.js` | `status-store-lifecycle.js` | lifecycle append/read/get/reset exports | Public facade and guarded save integration. |
| P14-F002 | P14 | `status-store.js` | lifecycle read models | `loadStatus`, `saveStatus`, lifecycle append/read-model helpers | `loadStatus` and `saveStatus` operate on lifecycle projections and appenders only; pipeline runtime no longer maintains a module status-file mirror. |
| P14-F003 | P14 | `status-store.js` | `redaction.js`; `services/system-io-warning.js` | prompt/transcript artifact writers, `sanitizeJsonEgress`, `emitPromptArtifactWriteWarning` | Redacted prompt/transcript artifact persistence; prompt artifact write failures emit `system.io_warning` without affecting lifecycle read-model authority. |
| P14-F004 | P14 | `status-store-lifecycle.js` | lifecycle submodules | wrapper imports/exports | Stable public surface. |
| P14-F005 | P14 | `appenders.js` | `storage.js` | lifecycle path/read/write helpers | Durable event/read-model storage. |
| P14-F006 | P14 | `appenders.js` | `idempotency.js` | `buildLifecycleIdempotencyKey` | Dedupe before legality. |
| P14-F007 | P14 | `appenders.js` | `legality.js` | `ensureLifecycleEventLegal` | Transition legality guard. |
| P14-F008 | P14 | `appenders.js` | `projections.js` | `applyLifecycleEventToReadModels` | Event-to-read-model projection. |
| P14-F009 | P14 | `appenders.js` | `refs.js` | ref builders and resolvers | Canonical event refs. |
| P14-F010 | P14 | `read-models.js` | `storage.js` | JSON/JSONL helpers | Read-model/event persistence. |
| P14-F011 | P14 | `projections.js` | `read-models.js` | default model/progression helpers | Projection root and progression recompute. |
| P15-F001 | P15 | `status-store-compat.js` | `common.js` | constants and `buildProjectionSourceFields` | Public re-export. |
| P15-F002 | P15 | `status-store-compat.js` | `module-projection.js` | module compatibility helpers | Public re-export. |
| P15-F003 | P15 | `status-store-compat.js` | `gate-projection.js` | gate compatibility helpers | Public re-export. |
| P15-F004 | P15 | `module-projection.js` | `session-authority.js` | `buildActiveSessionAuthorityPolicy` | `status.active_agent` confirmation policy. |
| P15-F005 | P15 | `module-projection.js` | lifecycle read models | `loadLifecycleReadModels` | Canonical module scheduler authority. |
| P15-F006 | P15 | `gate-projection.js` | lifecycle read models/appenders | `loadLifecycleReadModels`, wait/signal appenders | Canonical gate/wait authority. |
| P15-F007 | P15 | `gate-projection.js` | gate output contract | `validateGateOutputContract` | Canonical output validation. |
| OI39-F001 | OI-39 | Gate/review runners, prompts, orchestration, and gate projection | `core/paths.js` | `gateOutputPath`, `gateInstructionsPath`, `reviewGateOutputPath` | Durable gate output/instruction/review artifact call sites delegate to the central path authority. |
| OI39-F002 | OI-39 | Approval state and governance context | `core/paths.js` | `approvalGateArtifactPaths`, `approvalGateArtifactRefPaths` | Approval artifact writes and operator/governance references derive from the same central helper. |
| OI39-F003 | OI-39 | Redis log service | `core/paths.js` | `redisLogArtifactTargets` | Redis project/run JSONL targets are centrally built and file-name bounded. |
| P15-F008 | P15 | `truth-drift.js` | status-store compat helpers | module/gate scheduler projection | Drift source one. |
| P15-F009 | P15 | `truth-drift.js` | completion adjudicator | `adjudicateCompletionEvidence` | Drift source two. |
| P16-F001 | P16 | `acp-observability.js` | `telemetry.js` facade | `updateGatewayObservability`, `updateTranscriptObservability` | ACP monitor degradation/restoration events. |
| P16-F002 | P16/RV-25 | `telemetry.js` | `telemetry/dispatch.js`, `durable-operator-alert.js`, `observability.js`, `telemetry/builders.js`, `telemetry/progress.js`, common `services/telemetry/payload-schema.js`, `telemetry/sinks.js` | re-exports | Public telemetry import surface including durable operator alert helpers, central observability transition helpers, and common payload schema helpers. |
| P16-F003 | P16/RV-25 | `telemetry/builders.js` | `telemetry/dispatch.js`, `observability.js` | `emitEvent`, `emitEventNonBlocking`, `recordObservabilityDegraded`, `recordObservabilityRestored` | Event-specific payloads into telemetry spine; observability builder wrappers are pass-throughs to the central controller. |
| P16-F004 | P16 | `telemetry/progress.js` | `telemetry/dispatch.js` | `emitEventNonBlocking` | Transcript/progress payloads. |
| P16-F005 | P16 | `telemetry/dispatch.js` | common `services/telemetry/payload-schema.js`; `telemetry-sink-dispatch.js`; `durable-operator-alert.js` | `assertTelemetryEventPayload`, `dispatchTelemetrySinks`, `appendDurableOperatorAlert` | Validate event payloads before normal telemetry sinks; operator alerts write durable local evidence before registry-owned Discord sink dispatch. |
| P16-F006 | P16/RV-25 | `telemetry/dispatch.js` | `observability.js` | `appendStructuredEvent`, `recordObservabilityDegraded` | Core durable disk event mirror after payload validation; telemetry-spine degraded conditions use the central transition gate. |
| P16-F007 | P16 | `telemetry-sink-dispatch.js` | `telemetry-sink-contract.js` | sink input builder/validator/constants | Typed sink input contract. |
| P16-F008 | P16 | `telemetry-sink-dispatch.js` | plugin registry/context | `resolveHookListeners`, `createPluginContext` | Startup-frozen sink listener authority. |
| P16-F009 | P16 | `telemetry-sink-contract.js` | `telemetry-stream.js` | `emitTelemetryStreamEvent` | Built-in Redis sink uses shared secure Redis transport before stream writes. |
| P16-F010 | P16 | `telemetry-sink-contract.js` | Discord integration | `discord`, `discordEmbeds` | Built-in Discord sink. |
| P16-F011 | P16/RV-25 | `observability.js` | `durable-operator-alert.js`; common `services/telemetry/payload-schema.js`; `telemetry-stream.js` | `appendDurableOperatorAlert`, `validateTelemetryEventPayload`, `emitTelemetryStreamEvent` | Central degraded/restored circuit breaker; first degraded and valid restored transitions write durable operator alert, pipeline JSONL, and Redis stream projections. |
| OI43-F002 | OI-43 phase 3 | `services/system-io-warning.js` | `services/telemetry-stream.js` | `emitSystemIoWarning`, `emitPolicyAuditAppendWarning`, `emitTelemetryStreamEvent` | Shared point-in-time local I/O warning emission; policy logger consumes the model-policy append specialization. |
| P16-F012 | P16 | `telemetry/sinks.js` | `telemetry-stream.js` | `closeTelemetryStreamRedis` | Redis close compatibility facade. |
| P16-F013 | P16 | Terminal alert producers | `durable-operator-alert.js` | `appendDurableOperatorAlert` | Rate-limit exhaustion, completion adapter fatal/timeout, ACP session timeout/nudge failure, pipeline halt, and run-lock conflict paths persist sanitized local operator-alert evidence before/without network sinks. |
| P17-F001 | P17 | `polling.js` | `polling-session-end.js` | `pollForSessionEnd` re-export | Public polling facade. |
| P17-F002 | P17 | `polling.js` | `polling-redis-completion.js` | `archiveModuleCompletions` re-export/use | Redis completion archive facade before Buster dispatch. |
| P17-F003 | P17 | `polling.js` | `completion-adjudicator.js` | re-export completion classifiers/adjudicator | Shared completion authority helpers. |
| P17-F004 | P17/RV-23 | `polling.js` | `polling-dual.js` | `waitForModuleBusterCompletion` via `pollDual` | Active Buster module completion wait uses event adapters/controller behind public wrappers, consumes any shared budget remaining time, and writes durable operator alerts for fatal/timeout terminal paths. |
| P17-F005 | P17 | `polling.js` | `polling-identity.js` | identity/log-key helpers | File/status/session telemetry identity. |
| P17-F006 | P17 | `polling.js` | `polling-observability.js`; common redaction facade | observability/progress/transcript helpers; `sanitizeAcpTranscriptEvidence`, `sanitizeTranscriptDetail` | ACP telemetry during polls plus source-level terminal transcript redaction. |
| P17-F007 | P17 | `polling-dual.js` | `completion-event-adapters.js` | `createRedisCompletionEventAdapter`; `createDedicatedRedisCompletionClient`; `createLocalEvidenceEventAdapter` | Active Redis/local evidence fast path is event-driven; dedicated Redis client uses the shared secure transport contract. |
| P17-F008 | P17 | `polling-dual.js` | `completion-adjudicator.js` | `adjudicateCompletionEvidence` | Redis/local authority decision. |
| P17-F009 | P17 | `polling-redis-completion.js` | adapter registry and Redis completion service | `resolveRegisteredRedisAdapter`, `readCompletion` adapter call | Redis transport authority; returned completion evidence has passed Redis completion schema validation. |
| P17-F010 | P17/RV-23/OI-47 | `polling-session-end.js` | gateway typed operation facade; `durable-operator-alert.js`; timing budget | `sendGatewaySessionMessage`; `appendDurableOperatorAlert`; `createBudgetFromMinutes` | Timeout nudge uses the common Gateway operation wrapper plus durable local alert on nudge failure/final timeout; session polling consumes the shared absolute budget without internal transcript/activity extensions. |
| P17-F011 | P17 | `polling-session-end.js` | Git worktree integration | pull/head/add/commit helpers | Session completion by commits. |
| P17-F012 | P17 | `redis-completion.js` | Common Redis message contract and Redis client | `validateRedisCompletionEntry`, stream scan/archive methods | Low-level Redis completion helper with fail-closed validation before selection/adjudication. |
| P17-F013 | P17 | `tools/redis.ts` / Buster Redis tools | Common Redis message contract and common transport contract | `buildRedisTaskStreamEntry`, `assertRedisTaskEntry`, then `TaskQueue.publishTask` | Task producers emit normalized module/gate task envelopes behind the TaskQueue boundary. |
| P17-F014 | P17 | `task-queue.js` | Common Redis message contract, common transport contract, and dead-letter writer | `TaskQueue.readNext/reclaimPending/ack/trim`, `validateRedisTaskEntry` before payload/task execution | Invalid task envelopes are dead-lettered before ACK. |
| P17-F015 | P17 | `task-completion.js` | Common Redis message contract and common transport contract | `buildTaskCompletionRecord`, `assertRedisCompletionEntry`, then `EventBus.publish` | Buster terminal completions use the same normalized envelope behind the EventBus boundary. |
| OI42-F001 | OI-42/RV-11/RV-12/RV-23 | Event adapters/controllers | `pipeline-event-contract.js`; `acp-gateway-contract.js`; `acp-monitor.js` | `createPipelineEventBus`, `emitPipelineEvent`, `waitForEvent`, `waitForAny`, `validateAcpSessionStateEventPayload`, `validateAcpTranscriptDeltaEventPayload`, `createAcpMonitorEventAdapter`, `monitorStateFromAcpEvent` | In-process event contract backs active Buster completion waits and ACP session/transcript state waits; waits are AbortSignal-based and ACP producer payloads are synchronously schema-rejected on malformed or extra fields. |
| OI42-F002 | OI-42 phase 2/5/6 | Buster completion waits | `completion-event-adapters.js` | `createRedisCompletionEventAdapter(config,{ eventBus })`, `createLocalEvidenceEventAdapter(config,{ eventBus, paths })`, adapter `.start()/.stop()` | Active module/gate waits start adapters and stop them in `finally`; verification covers fake Redis blocking-client, local watcher cleanup, and retired-helper absence. |
| OI42-F003 | OI-42 phase 3/5 | Buster runner cutover | `buster-completion-controller.js` | `waitForBusterCompletion`, `resolveBusterCompletionEvent`, optional `buildGateLocalEvidenceResolver`, `buildCompletionEventEntry` compatibility bridge | Active module/gate call sites map controller results to existing poll-result shapes; Phase 5 verifies module/gate wrapper behavior. |
| P18a-F001 | P18a | `failures.js` | `failure-semantics.js` | constants and normalized helpers | Public facade. |
| P18a-F002 | P18a | `failures.js` | `failures/classification.js` | classifier helpers | Public facade. |
| P18a-F003 | P18a | `failures.js` | `failures/presentation.js` | Discord/Nova presentation helpers | Public facade. |
| P18a-F004 | P18a | `failures.js` | `failures/retry-policy.js` | retry/escalation helpers | Public facade. |
| P18a-F005 | P18a | `classification.js` | `failure-semantics.js` | `normalizeFailureClass` | Pre-test and fail summary classification. |
| P18a-F006 | P18a | `classification.js` | `incidents.js` | `reportFailureSurfaceIncident` | Pre-test verdict parse/summarize soft failures. |
| P18a-F007 | P18a/OI-47 | `presentation.js` | gateway typed operation facade; Discord integration | `sendGatewaySessionMessage`, `discord` | Nova injection and failure alerts; Gateway RPC details stay behind common. |
| P18a-F008 | P18a | `presentation.js` | artifact/correlation helpers | artifact paths and identity fields | Injection logs and operator fields. |
| P18a-F009 | P18a | `retry-policy.js` | lifecycle/status store | `transitionModuleStatus`, `markModuleBlocked`, `saveStatus` | Failure status authority mutation. |
| P18a-F010 | P18a | `retry-policy.js` | telemetry facade | `onModuleFail`, `onRetryExhausted`, `onModuleBlocked` | Failure telemetry/operator presentation. |
| P18a-F011 | P18a | `retry-policy.js` | `presentation.js` | failure Discord fields and telemetry payloads | Shared presentation payloads. |
| P18b-F001 | P18b | `rate-limit.js` | `rate-limit-builders.js` | status/detail/Discord/tracked builders | Recovery option and normalized status construction. |
| P18b-F002 | P18b/RV-24 | `rate-limit.js` | `rate-limit-exit.js` | `finalizeSessionRateLimitExhaustion`; `buildSessionRateLimitExitResult` | Generic wrappers route terminal exhaustion through the central finalizer; pure builders remain side-effect free. |
| P18b-F003 | P18b/RV-23 | `rate-limit.js` | `status-store.js`, `lifecycle-state.ts`, timing budget | load/save/append cooldown/transition; `budget.extendForRateLimit(cooldownMs)` | Durable cooldown and module status authority; recognized provider cooldowns explicitly extend the shared deadline by exact cooldown plus configured buffer. |
| P18b-F004 | P18b | `rate-limit-builders.js` | `rate-limit-builders/exhaustion-options.js` | exhaustion/notifier/tracked module helpers | Extracted sub-surface re-exported by parent. |
| P18b-F005 | P18b | `rate-limit-builders.js` | `rate-limit-contract.js`, `discord-fields.js`, `correlation.js` | payload/canonical surface fields/correlation resolvers | Operator and telemetry correlation construction. |
| P18b-F006 | P18b/RV-24 | `rate-limit-exit.js` | `telemetry.js` | `appendDurableOperatorAlert`; retry/gate/summary telemetry hooks; guarded Discord hooks | Central terminal exhaustion side effects: local durable evidence first, then non-blocking hooks with delivery-failure alerts. |
| P19-F001 | P19 | `arch-validator.js` | `arch-validator-checks.js` | `runDeterministicArchitectureChecks` and constants | Phase 1 architecture validation. |
| P19-F002 | P19/OI-47 | `arch-validator.js` | `gateway.js` typed operation facade | `completeGatewayPrompt` | Optional architecture agent judgment through common Gateway completion wrapper. |
| P19-F003 | P19 | `arch-validator.js` | `core/config.js`, `redaction.js` | policy resolution/logging; redacted prompt artifact | Agent config and artifacts. |
| P19-F004 | P19 | `arch-validator-checks.js` | `fs`, `path`, `swarmRoot` | file existence/read/path resolution | Deterministic filesystem validation. |
| P19-F005 | P19 | `module-validators.js` | `validation.js`, `lint.js` | delivery lint, pre-check, lint report | Built-in validator adapters. |
| P19-F006 | P19 | `module-validators.js` | `contracts/validator-control-result.js` | `buildModuleValidatorControlResult` | Typed validator result projection. |
| P19-F007 | P19 | Control-result contracts | `contract-diagnostics.js` | `createContractInvalidError` | Contract-invalid plugin diagnostics. |
| P20-F001 | P20 | `summary.js` | `artifact-bundle.js` | `getPipelineArtifactBundle`, `buildLatestPointer`, `buildSummaryArtifactBundle` | Summary/latest path and authority projection. |
| P20-F002 | P20 | `summary.js` | `observability.js`, `governance-context.js`, `redaction.js` | OpenClaw usage cost report/budget artifacts, governance summary, `sanitizeJsonEgress`, `sanitizeMarkdownText` | Summary/latest JSON artifacts are sanitized at write boundary; pipeline-review instruction Markdown uses text-specific scrubbing. |
| P20-F003 | P20 | `summary.js` / `case-study.js` | `summary-session-cleanup.js`, `rate-limit.js`, `correlation.js`, `redaction.js` | cleanup, rate-limit recovery/finalization, correlation resolvers, `sanitizeMarkdownText` | Post-run generator lifecycle; case-study instructions/output Markdown are scrubbed without object summarization. |
| P20-F004 | P20 | `summary.js` / `case-study.js` | `contracts/generator-result.js` | `buildGeneratorResult`, `buildGeneratorArtifactRef`, generator result validators/normalizer | Typed generator result projection and shared v1 contract authority. |
| P20-F005 | P20 | `blueprint.ts` | Git CLI/integration | `gitExec`, `spawnSync('git', ...)` | Architecture branch materialization; selected-path `git add`; staged-path subset validation; `git commit -- <paths>`; pull/rebase/push. |
| P20-F006 | P20 | `contract-diagnostics.js` | `serialization.js`, `../redaction.ts` | `sanitizeForJson`, `cloneSerializable`, `redactSecrets`, `sanitizeTelemetryPayload`, `summarizeStructuredValue` | Source-redacted contract-invalid diagnostics. |
| P20-F007 | P20 | Plugin context | `artifact-bundle.js`, `correlation.js` | plugin artifacts API and invocation snapshot | Plugin invocation evidence. |
| P21-F001 | P21 | Pipeline runner / approval gate | `governance-context.js` | record/build governance helpers | Summary/embed governance projection. |
| P21-F002 | P21 | `summary.js` | `governance-context.js` | `buildGovernanceSummary` | Embeds governance section in summary JSON. |
| P21-F003 | P21 | Module validators / review gate | `lint.js`, `core/paths.js` | `generateLintReport`, `runPreCheck`, formatter, lint log dir helpers | Lint report execution, prompt injection, scratch cleanup, and canonical lint report artifact retention. |
| P21-F004 | P21 | Registry builtins | `notification-contract.js` | `getBuiltinNotificationPluginDefinitions` | Built-in telemetry/artifact/Discord listeners. |
| P21-F005 | P21/RV-25 | `notification-dispatch.js` | `notification-contract.js`, `observability.js`, registry/context services | input builder/assertion, central degraded/restored transition helpers, listener resolution, plugin context | Registry-driven notification loop with stateless listener health reporting through the central controller. |
| P21-F006 | P21 | Gate controls/engine | `remediation-handoff.js` | request_fix contract builders, validators, controller resolution | Shared review/Buster remediation contract semantics; loop execution lives only in generic remediable gate engine. |
| P22-F001 | P22 | `buster-module.js` | `buster-instructions.js` | `readBusterInstructions` | Module BUSTER.md read. |
| P22-F002 | P22 | Prompt builders | `shared.js` | `makePromptResult` | Standard prompt result shape and metadata. |
| P22-F003 | P22 | Forge/Buster prompt builders | Core path helpers | `modulePath`, `statusPath`, `projectSrcPath`, `swarmRoot`, `relPath` | Prompt path context. |
| P22-F004 | P22 | `forge.js` / `polling.js` | `shared.js`, `forge-completion.js` | `buildForgeCompletionArtifactContract`, Forge validator/reader | Prompt defines a raw-JSON typed completion artifact; poller reads only that artifact for Forge completion. |
| P22-F005 | P22 | `buster-module.js` / `buster-gate.js` | `shared.js` | `buildBusterResultArtifactContract`, Buster completion protocols | Raw-JSON result artifact/output instructions; no generated shell/Node writer helpers. |
| P22-F006 | P22 | Gate/review fix prompts | `shared.js` | `makePromptResult` | Prompt metadata plus constrained action contract for fix phases. |
| P22-F007 | P22 | Forge and review fix prompt builders | `services/prompt-ingress.js` | `formatOperatorRemediationDirective` | Shared XML-fenced untrusted operator remediation directive formatter. |
| P23a-F001 | P23a | `project-summary.ts` | `project-summary-formatters.ts` | `buildMarkdown`, `buildDiscordEmbeds`, `buildCaseStudyBase`, `pct` | Report formatting and case-study base schema; formatter helpers normalize unit-test and hardest-module metric aliases. |
| P23a-F002 | P23a | `project-summary.ts` | Git CLI | `git(repoDir,args)` | Code stats and commit/author dates. |
| P23a-F003 | P23a | `project-summary.ts` | `platform-config.js`, `lifecycle-state.ts`, `discord.js`, `redaction.js` | project path resolution, status normalization, sanitized data/Markdown, Discord embeds | Project summary data and delivery use `sanitizeJsonEgress` for structured output and `sanitizeMarkdownText` for Markdown. |
| P23a-F004 | P23a | `lint-report.ts` | typed lint-report internals | constants/discovery/output/report/tool registry | Entrypoint delegates tool execution/report authority. |
| P23b-F001 | P23b | `lint-report.ts` | `report.ts` | `runAllTools`, `lintReportExitCode` | Entrypoint execution and direct CLI exit mapping from report summary. |
| P23b-F002 | P23b | `report.js` | `execution.js` | `commandExists` | Binary availability gate. |
| P23b-F003 | P23b | Tool definitions | `execution.js`, `discovery.js`, `parsers.js` | `safeExec`, project type/scope helpers, JSON/export parsers | Tool detection/run/parse; `safeExec` builds an explicit child env with the shared allowlist. |
| P23b-F004 | P23b | `tool-registry.js` | `container-yaml-tools.js` | `registerContainerYamlTools` | Adds Docker/Helm/K8s/YAML tools. |
| P23b-F005 | P23b | All internals | `output.js` | `log`, `writeReport`, `setLintLogPath` | Observability/output. |
| B00a-F001 | B00a | `buster-pipeline.ts` | `task-lifecycle.js`, `task-queue.js` | `processTask`, `getLastRunLogDir`, Redis task loop helpers | Task processing and status CLI. |
| B00a-F002 | B00a | `buster-pipeline.ts` | Gateway/orphan/base-image/cleanup services | startup and health helpers | Startup readiness and recovery. |
| B00a-F003 | B00a | `buster-pipeline.ts` | Runtime diagnostics | diagnostic record/report helpers | Structured shutdown/startup evidence. |
| B00a-F004 | B00a | Buster local shims | Common helpers | CLI args and Git primitives | Compatibility facade. |
| B00b-F001 | B00b | Buster shim files | `skills/common/pipeline/*.ts` | star re-exports | Repo/dev compatibility for production shared surfaces. |
| B01-F001 | B01 | Buster agent/gateway shim files | `skills/common/pipeline/**` | star re-exports | Repo/dev compatibility for production helper surfaces. |
| B01-F002 | B01 | `gateway-health.js` | `integrations/gateway.ts` | `resolveGatewayHealthUrl` | Gateway readiness/health endpoint resolution. |
| B01-F003 | B01/RV-11/RV-12 | `session-monitor.js` | `agents/acp-monitor.js`; `services/pipeline-event-contract.js` | `getAcpMonitorConfig`, `createAcpMonitorEventAdapter`, `monitorStateFromAcpEvent`, `isSessionTerminal`, `publishTranscriptDelta`, `waitForAny` | Event-driven session state and transcript telemetry consume canonical ACP payloads; ACP polling and producer-side schema validation are owned by the edge adapter/common event contract. |
| B01-F004 | B01/RV-14 | `session-monitor.js` | `agents/session-termination.js` | `terminateSession` | Hard-timeout explicit termination through the shared controller. |
| B01-F005 | B01 | `session-monitor.js` | `integrations/gateway.ts` | `resolveGatewayBaseUrl`, `resolveGatewayToken` | Gateway context for ACP monitor/rate-limit recovery. |
| B01-F006 | B01 | `session-monitor.js` | `services/rate-limit.ts` | `createRateLimitState`, `shouldRetryAfterRateLimit`, `handleRateLimit` | Buster-owned child-session pause handling. |
| B01-F007 | B01 | `session-monitor.js` | `services/telemetry.js` | `emitEvent` | Monitor/degraded/restored/transcript telemetry. |
| B01-F008 | B01 | `session-monitor.js` | `services/logger.js` | `createLogger` | Default monitor logger. |
| B01-F009 | B01 | `logger.js` | `noncritical-reporting.js` | incident key/report/sanitize helpers | Non-terminal logger filesystem incident reporting. |
| B01-F010 | B01 | `runtime-diagnostics.js` | `task-validation.js` | `normalizeRequiredIdentity` | Diagnostic-only project hint normalization. |
| B02a-F001 | B02a | `task-lifecycle.js` | `suite-runner.ts` | `runSuites` | Ordered pre-agent suite execution with explicit payload capabilities. |
| B02a-F002 | B02a | `task-lifecycle.js` | `discord.js` | `sendDiscord` | Suite/failure/session operator notifications. |
| B02a-F003 | B02a | `task-lifecycle.js` / completion signal | `pipeline-helpers.js` | status/output/embed helpers | Status path, active-agent clear, output_file ensure/read, embeds. |
| B02a-F004 | B02a | `task-lifecycle.js` | task-lifecycle internals | cleanup/git/session/completion functions | Detailed in B02b. |
| B02a-F005 | B02a | `pipeline-helpers.js` | `sandbox-cleanup.js` | `cleanupSandboxResources` | Stage/scope cleanup policy entrypoint; maximum-privilege cleanup is not gated by task capabilities. |
| B02a-F006 | B02a | `task-completion.js` | `pipeline-helpers.js`; `task-transport-contract.js` | `buildCompletionIdentityFields`; `createRedisEventBus` | Completion identity fields are validated, then completion/dead-letter events publish through EventBus. |
| B02a-F007 | B02a | `orphan-recovery.js` | `pipeline-helpers.js` | `resolveBusterActiveSessionPath` | Locate persisted active-session file. |
| B02a-F008 | B02a | `orphan-recovery.js` | local diagnostic evidence reader | active-session JSON inspect only | Startup recovery is fenced: file-only evidence is diagnostic, no lifecycle hydration or kill is attempted. |
| B02a-F009 | B02a | `discord.js` | `integrations/discord-webhook.ts` | `postDiscordWebhook`, `deliverDiscordWebhookRequest` | Shared Buster webhook delivery for JSON notifications and raw/multipart callers, including degraded/restored telemetry. |
| B02a-F010 | B02a | `git-workflows.ts` | `git-primitives.ts` | `gitExec`, `getCurrentBranch` | Git sync/push commands; commit mode stages only explicit `addPaths`. |
| B02a-F011 | B02a | `suite-runner.ts`, `base-images.ts`, `visual-audit.ts`, `task-validation.js` | `capabilities.js` | `assertBusterCapabilities`, `requiredCapabilitiesForSuite`, `normalizeBusterCapabilities`, durable operator-alert helpers | Default-deny task/platform capability enforcement before destructive or tool-heavy boundaries. |
| B02b-F001 | B02b | `task-lifecycle/cleanup.js` | `pipeline-helpers.js` | `doSandboxCleanup` | Stage-specific cleanup telemetry envelope. |
| B02b-F002 | B02b | `task-lifecycle/completion-signal.js` | `task-queue.js` | `getRedisClient` | Reuses queue Redis singleton; completion emission itself goes through EventBus. |
| B02b-F003 | B02b | `task-lifecycle/completion-signal.js` | `task-completion.js` | `emitTaskCompletion` | Publishes terminal completion stream fields through EventBus. |
| B02b-F004 | B02b | `task-lifecycle/git-sync.js` | `git-workflows.ts` | `getRepoRoot`, `gitSync` | Resolves repo and syncs checkout. |
| B02b-F005 | B02b/RV-14 | `task-lifecycle/session.js` | `agents/lifecycle.js`; `agents/session-termination.js` | `spawnSession`, `clearActiveSession`, `terminateSession` | ACP session spawn plus canonical termination boundary. |
| B02b-F006 | B02b | `task-lifecycle/session.js` | `session-monitor.js` | `monitorSession` | Watches spawned child session. |
| B02b-F007 | B02b | `task-lifecycle/session.js` | `pipeline-helpers.js` | active-session/result/embed helpers | Status active-agent, Discord embeds, outcome projection. |
| B02b-F008 | B02b | `task-queue.js` | local telemetry facade; `task-transport-contract.js`; `task-completion.js` | `createRedisClient`, `createRedisTaskQueue`, `ensureTaskTerminalBeforeAck`, `writeTaskDeadLetter` | Secure Redis client construction precedes TaskQueue read/reclaim/ACK/trim; completion/dead-letter before ACK guarantee is preserved. |
| B02b-F009 | B02b | `task-queue.js` | `runtime-diagnostics.js` | malformed/process diagnostics | Poison task and Redis cleanup diagnostics. |
| B02b-F010 | B02b | `task-validation.js` | callers | `validateBusterTaskPayload` | Throws typed malformed error for queue dead-letter path. |
| B02b-F011 | B02b | `verdict-schema.ts` | suite runner/helpers | verdict factories | Produces suite and runner verdict structures. |
| B03-F001 | B03 | B03 suites | `repo-paths.js` | `resolveRepoScopedPath` | Repo boundary for task-controlled suite paths. |
| B03-F002 | B03 | `build.ts`, `k8s.ts` | `sandbox-cleanup.js` | `trackSandboxResources`, cleanup label helpers | Tracks containers/images/namespaces and applies cleanup scope labels; K8s namespace tracking runs only after cleanup-safe prefix validation. |
| B03-F003 | B03 | `k8s.ts` | `manifest.ts` | `loadYamlDocuments`, `dumpYamlDocuments` | Structural manifest rewrite before kubectl apply. |
| B03-F004 | B03 | `suite-runner.ts` | `capabilities.js` then lazy B03 suite imports | `assertBusterCapabilities`, default async suites | Blocks unauthorized B03 suites loudly before suite import/execution. |
| B03-F005 | B03 | all B03 suites | `verdict-schema.ts` | `createSuiteVerdict`, `createFinding`, enums | Deterministic result shape. |
| B03-F006 | B03 | `unit.ts` | `security.ts` | `tokenizeCommandString`, `validateAllowedPath`, `buildSubprocessEnv` | Harden custom unit command, project dir, and subprocess env. |
| B04-F001 | B04 | `suite-runner.ts` | `capabilities.js` then lazy B04 suite imports | `assertBusterCapabilities`, `a11ySuite`, `bundleSuite`, `healthSuite`, `perfSuite`, `securitySuite`, `runVisualReg` | Registry blocks unauthorized specialized suites loudly before suite import/execution. |
| B04-F002 | B04 | `visual-reg.ts` | `tools/screenshot.ts` | `takeScreenshotBatch` | Visual capture uses explicit reviewed baselines; baseline generation remains CLI-only operator setup. |
| B04-F003 | B04 | `visual-reg.ts` | `visual-reg-discord.ts` | `discordSingle`, `discordSummary` | Optional Discord media presentation; helpers receive delivery context and return delivery status for telemetry projection. |
| B04-F004 | B04 | `visual-reg.ts` | `services/telemetry.ts` | `emitPluginEvent` | Emits `plugin.event` (`plugin_event: visual_reg`) after successful compare paths with aggregated Discord delivery fields in `details`. |
| B04-F005 | B04 | `health.ts`, `visual-reg.ts` | `suites/repo-paths.js` | `resolveRepoScopedPath`, `REPO_DIR` | Derived route/baseline paths stay inside canonical repo. |
| B04-F006 | B04 | `perf.ts`, `bundle.ts` | system tools | `lighthouse`, `du` | External CLI boundaries for performance and size. |
| B04-F007 | B04 | `a11y.ts`, `health.ts`, `screenshot.ts`, `visual-audit.ts` | Playwright | Chromium launch/page APIs | Browser boundary for scans, smoke navigation, screenshot/video. |
| B04-F008 | B04 | `visual-reg-discord.ts`, `visual-audit.ts` | `capabilities.js`, `services/discord.js` / Discord HTTP | `assertBusterCapabilities`; `deliverDiscordWebhookRequest` for visual-reg multipart webhooks; direct REST `fetch` for visual-audit | Operator-facing media delivery requires `discord_media`; visual-reg inherits shared webhook degraded/restored telemetry. |
| B05-F001 | B05 | Buster startup/runtime | `base-images.ts`, `capabilities.js` | `loadBaseImagesFromProgress`, `ensureBaseImages`, `parseCapabilitiesEnv` | Startup calls `ensureBaseImages` only when platform grants `image_prepull`; denied direct pre-pull attempts write durable operator alerts and perform no Podman calls. |
| B05-F002 | B05 | `rate-limit.ts` | `rate-limit-contract.js` | `buildRateLimitDetectedPayload`, `formatRateLimitEmbed`, `resolveRateLimitRecoveryAction` | Shared contract helpers build telemetry/Discord payloads and resume/kill decision. |
| B05-F003 | B05 | `rate-limit.ts` | `telemetry.ts` | `emitEvent` | Validates and emits canonical `rate_limit.detected` when Buster owns sleep. |
| B05-F004 | B05 | `rate-limit.ts` | `agents/acp-monitor.js` | `getAcpMonitorState` | Post-cooldown liveness probe for child session. |
| B05-F005 | B05 | `telemetry.ts` | common telemetry facade and payload schema | `getTelemetryStreamKey`, `getTelemetrySeqKey`, `loadRedisCtor`, `createRedisClient`, `assertTelemetryEventPayload`, `buildPluginTelemetryPayload` | Shared stream key, sequence key, native Redis package lookup, secure Redis client construction, and core/plugin event payload validation. |
| B05-F006 | B05 | `redis.ts` | local telemetry facade plus runtime/Discord/redaction helpers | `loadRedisCtor`, `createRedisClient`, `resolveDiscordWebhookUrl`, `postDiscordWebhook`, redaction summary helpers | Legacy stream send/read and optional redacted Discord logging after secure Redis client construction. |
| B05-F007 | B05 | `verify-task.ts` | Git workflow helpers | `gitExec`, `getRepoRoot`, `getCurrentBranch`, `gitPushWithRetry` | Scope firewall, then scoped commit/push through explicit `addPaths`. |
| C00a-F001 | C00a | `redaction.js` | `noncritical-reporting.js` | `buildNonBlockingIncidentKey`, `reportClassifiedNonBlockingError`, `sanitizeJsonEgress`, `sanitizeMarkdownText` | Transcript parse failures are reported non-blockingly; common redaction owns structured JSON and Markdown/text egress sanitizers. |
| C00a-F002 | C00a | Nova/Buster telemetry transports | `telemetry.ts` / `redis-transport.ts` | constants, key builders, `loadRedisCtor`, `createRedisClient`, `resolveRedisTransportConfig` | Shared Redis stream identity, native package dependency loader, structured missing-dependency error, and secure transport policy. |
| C00a-F002a | C00a | Nova/Buster task/completion transports | `services/task-transport-contract.js` | TaskQueue/EventBus adapter assertions and Redis adapter factories | Shared non-telemetry work-stream transport boundary. |
| C00a-F003 | C00a | Nova/Buster CLI tools | `cli-args.ts` | `parseCliArgs`, `parseCliFlagValues` | Shared strict flag parsing. |
| C00a-F004 | C00a | Nova/Buster Git facades | `git-primitives.ts` | Git read/exec helpers | Shared argv-safe Git primitive surface. |
| C00a-F005 | C00a | Nova/Buster path/command/process callers | `security.ts` | path validators, tokenizer, `buildSubprocessEnv` | Shared path/shell/env boundary checks; child processes receive allowlisted env maps and known secret keys are denied. |
| C00a-F006 | C00a | Nova/Buster lifecycle facades | `lifecycle-state.ts` | transition/status helpers | Shared legacy status mutation semantics. |
| C00b-F001 | C00b/RV-11/RV-12/RV-17/OI-47 | `acp-monitor.js` | `integrations/gateway.ts`, `services/acp-gateway-contract.js`, `services/pipeline-event-contract.js`, `timing.js` | `getGatewaySessionStatus`, URL/token resolvers, transcript/monitor/event-payload validators, `createAcpMonitorEventAdapter` | Owns edge polling through typed common Gateway operations, validates exact transcript/monitor result shapes, builds canonical ACP session/transcript event payloads, diffs state, emits through synchronous EventBus contract validation, and threads shared budgets/signals into sleeps and Gateway calls. |
| C00b-F002 | C00b/OI-41 | `acp-monitor.js` | `session-semantics.js` | `parseSessionState`, terminal/stopped/unreachable helpers and reasons | Classifies monitor state, gateway status text, and terminal reasons. |
| C00b-F003 | OI-41 | `acp-monitor.js` | `agents/tracked-agents.js` | static `getTrackedAgent` import | Supports Nova label lookup without depending on lifecycle. |
| C00b-F004 | C00b/RV-17/OI-47 | `lifecycle.js` | `integrations/gateway.ts`, `services/acp-gateway-contract.js`, `timing.js` | `spawnGatewaySession`, `getGatewaySessionStatus`, `sendGatewaySessionMessage`, `killGatewaySubagent`, `listGatewaySubagents`, URL/token resolvers, lifecycle/kill validators, abortable retry sleep | Spawns, stops, kills, lists, checks sessions through typed common Gateway operations, validates lifecycle result shapes, and propagates caller abort/budget controls through spawn retries. |
| C00b-F005 | C00b/OI-41 | `lifecycle.js` | `session-semantics.js` | `parseSessionState`, `isStoppedSessionState` | Normalizes gateway status and confirms stop without importing ACP monitor. |
| C00b-F006 | C00b | `lifecycle.js` | `runtime.js` | `modelToHarness`, `resolveRuntime` | Chooses ACP/subagent spawn arguments and kill timeouts. |
| C00b-F007 | C00b | Nova/Buster rate-limit services | `rate-limit-contract.js` | payload, embed, action builders | Shared rate-limit telemetry/Discord/recovery semantics. |
| C00b-F008 | C00b | Nova/Buster Discord callers | `discord-webhook.js` | `postDiscordWebhook` | Shared webhook delivery with structured errors. |
| C00b-F009 | C00b/RV-17/OI-47 | `gateway.js` | `services/acp-gateway-contract.js`, `timing.js` | `gatewayInvoke` private raw RPC path; typed wrappers `getGatewaySessionStatus`, `spawnGatewaySession`, `sendGatewaySessionMessage`, `killGatewaySubagent`, `listGatewaySubagents`, `completeGatewayPrompt`, `checkGatewayHealth`; `normalizeGatewayInvokeResult`, `assertValidGatewayInvokeResult`, `buildGatewayInvokeHttpError`, abortable retry sleep | Gateway success/error shapes and raw OpenClaw tool names are centralized before caller-specific detail parsing; retry waits and in-flight fetches respect caller budget/signal. |
| S00-F001 | S00 | Project setup docs | Nova pipeline CLI | `/app/skills/pipeline.ts --project ... --dry-run/--resume` | Operator command examples for validation and run. |
| S00-F002 | S00 | Module/prism docs | Buster screenshot/visual-reg tools | `/app/skills/pipeline/tools/screenshot.ts --generate-baselines`; visual-reg suite explicit baseline metadata | Current source/runtime entrypoints and derived baseline paths are documented. |
| S00-F003 | S00 | Prism conventions | Visual-reg baseline generator | route manifest and `?baselines=true` conventions | Source screenshot tool implements these conventions. |
| V00-F001 | V00 | `run-fast-verification.sh` | runtime smoke scripts | Nova/Buster startup, runtime collisions, final-gate hardening | Fast deterministic local lane. |
| V00-F002 | V00 | `run-fast-verification.sh` | `run-contract-suite.sh`, behavior harness | deterministic contract suite; selected behavior areas | Contract/runtime plus skippable behavior. |
| V00-F003 | V00 | `run-full-verification.sh` | deployment/runtime/launch scripts | deployment truth, collisions, final-gate, startup, subagent launch | Full fail-fast lane. |
| V00-F004 | V00 | `run-full-verification.sh` | contract suite and behavior harness | full deterministic suite plus full behavior verify | Uses canonical telemetry contract path. |
| V00-F005 | V00 | `run-local-acp-verification.sh` | ACP launch smoke | `check-acp-launch.mjs "$@"` | Explicit local/provider lane. |
| V00-F006 | V00 | V00 docs | V00 wrappers | fast/full/local commands | Docs describe wrapper authority and expectations. |
| V01a-F001 | V01a | V00 wrappers/docs | `behavior/verify.mjs` | CLI options and final JSON summary | Canonical behavior harness entrypoint. |
| V01a-F002 | V01a | `verify.mjs` | lifecycle audit lib | args, roots, contract, runtime materialization/import helpers | Shared verification fixture setup. |
| V01a-F003 | V01a | `verify.mjs` | fake Redis lib | `installFakeRedis`, `xaddEvents`, `flushAsync` | Injected into Redis-aware areas. |
| V01a-F004 | V01a | `verify.mjs` | `docs-surface.mjs`, `foundations.mjs`, `repo-docs.mjs` | area registrar functions | Selected V01a area execution. |
| V01a-F005 | V01a | area modules | runtime modules | injected `importRuntimeModule` and pre-imported modules | Behavior records assert materialized runtime behavior. |
| V01b-F001 | V01b | `verify.mjs` | V01b area modules | `register*Area(sharedAreaDeps)` | Area selection/orchestration. |
| V01b-F002 | V01b | `governance.mjs` | approval/summary/governance runtime modules | `runGateViaRegistry`, `writeSummary`, governance recorders | Approval governance fixtures exercise approval through generic gate registry dispatch. |
| V01b-F003 | V01b | `migrated-seams.mjs` | module/pipeline runners and registry | `runModule`, `runPipeline`, fake `stageOwners` | Typed worker seam traversal and fail-closed contracts. |
| V01b-F004 | V01b | `models.mjs` | runtime/policy/telemetry modules | `resolveRuntime`, `modelToHarness`, `resolvePolicy`, `onPipelineStarted` | Model dispatch/default policy checks. |
| V01b-F005 | V01b | `operator-surface.mjs` | Discord/Redis/Buster/observability modules | Discord audit/webhook, Redis task send, Buster Discord/logger, budget APIs | Operator evidence and degraded/restored observability. |
| V01b-F006 | V01b | `runtime-surface.mjs` | gateway/lifecycle/redis/observability/notification/session launch modules | helper resolvers, artifact logging, notification dispatch, launch assessment | Runtime public surface and authority checks. |
| V02a1-F001 | V02a1 | `verify.mjs` | V02a1 area modules | `registerApprovalsArea`, `registerFixCyclesArea`, `registerGateSessionPersistenceArea`, `registerLifecycleStateSurfaceArea` | Selected behavior area registration. |
| V02a1-F002 | V02a1 | `approvals.mjs` | approval/gate/status/dependency runtime modules | `runGateViaRegistry`, `waitForApprovalGateSignal`, `syncApprovalWaitState`, `checkDependencies` | Approval lifecycle checks enter through the generic gate registry path. |
| V02a1-F003 | V02a1 | `fix-cycles.mjs` | review/Buster gate runners plus registry helper | `runGateViaRegistry` with review/Buster stage adapters | Fix-cycle interruption and retry exhaustion telemetry through generic remediable gate dispatch. |
| V02a1-F004 | V02a1 | `gate-session-persistence.mjs` | source runtime files | `readOverlayText` marker checks | Restart-recovery and retry correlation source assertions. |
| V02a1-F005 | V02a1 | `lifecycle-state-surface.mjs` | prompt/lifecycle/status/failure modules | prompt builders, lifecycle transitions, failure reason extraction | Prompt authority and lifecycle cleanup semantics. |
| V02a2-F001 | V02a2 | `verify.mjs` | `gates.mjs` | `registerGatesArea(sharedAreaDeps)` | Selected behavior area registration. |
| V02a2-F002 | V02a2 | `gates.mjs` | registry/runtime helpers | `buildPluginRegistry`, fake `stageOwners['gate.execute']` | Stage-owner dispatch and contract validation fixtures. |
| V02a2-F003 | V02a2 | `gates.mjs` | gate runners | `runGate` / `runGateViaRegistry` with review/Buster registry adapters | Review/Buster gate execution and failure matrix through the sole runtime gate path. |
| V02a2-F004 | V02a2 | `gates.mjs` | status/dependency services | `readGateOutput`, `projectGateSchedulerState`, `projectGateCompletionState`, `checkDependencies` | Gate output projection and dependency authority checks. |
| V02a2-F005 | V02a2 | `gates.mjs` | fake Redis and Discord JSONL | `xaddEvents`, `flushAsync`, `readJsonl` | Telemetry and operator alert assertions. |
| V02a3-F001 | V02a3 | `verify.mjs` | `module-failures.mjs` | `registerModuleFailuresArea(sharedAreaDeps)` | Selected behavior area registration. |
| V02a3-F002 | V02a3 | `module-failures.mjs` | module runner | `runModule` | Worker dispatch and terminal module failure matrix. |
| V02a3-F003 | V02a3 | `module-failures.mjs` | registry runtime | `buildPluginRegistry`, fake `stageOwners['worker.execute']` | Forge/Buster worker owner dispatch and invalid contract fixtures. |
| V02a3-F004 | V02a3 | `module-failures.mjs` | status/lifecycle services | `initStatus`, `saveStatus`, `loadStatus`, lifecycle transitions | Seeding READY_FOR_TESTING, active phase, FAIL/BLOCKED fixtures. |
| V02a3-F005 | V02a3 | `module-failures.mjs` | failures service | `extractAgentFailReason`, `handleFail` | Phase-owned detail and retry-exhausted BLOCKED behavior. |
| V02a3-F006 | V02a3 | `module-failures.mjs` | rate-limit service | `withRateLimitRecovery`, `handleRateLimit` | Shared pause/resume owner behavior. |
| V02a3-F007 | V02a3 | `module-failures.mjs` | fake Redis/Discord logs | `xaddEvents`, `flushAsync`, JSONL reads | Telemetry/operator correlation assertions. |
| V02b-F001 | V02b | `verify.mjs` | `pipeline.mjs` | `registerPipelineArea(sharedAreaDeps)` | Selected behavior area registration for pipeline scheduler/finalizer surfaces. |
| V02b-F002 | V02b | `verify.mjs` | `restart-recovery.mjs` | `registerRestartRecoveryArea(sharedAreaDeps)` | Selected behavior area registration for restart-time ACP/session recovery. |
| V02b-F003 | V02b | `verify.mjs` | `resume-idempotence.mjs` | `registerResumeIdempotenceArea(sharedAreaDeps)` | Selected behavior area registration for resume idempotence. |
| V02b-F004 | V02b | `verify.mjs` | `seq-restart.mjs` | `registerSeqRestartArea(sharedAreaDeps)` | Selected behavior area registration for telemetry sequence restart safety. |
| V02b-F005 | V02b | `verify.mjs` | `stops.mjs` | `registerStopsArea(sharedAreaDeps)` | Selected behavior area registration for Buster gate terminal stops. |
| V02b-F006 | V02b | `pipeline.mjs` | pipeline runner / architecture validator | `runPipeline`, `runArchitectureValidatorStage` | Exercises scheduler, terminal finalizer, validation, and generator schedule behavior. |
| V02b-F007 | V02b | `restart-recovery.mjs` | fake gateway/session runtime | `session_status`, `sessions_send` | Simulates stale/terminal/unconfirmed/weak identity recovery branches. |
| V02b-F008 | V02b | `resume-idempotence.mjs` | pipeline runner / approval gate | `runPipeline`, approval gate runner | Exercises repeated resume and approval duplicate suppression. |
| V02b-F009 | V02b | `seq-restart.mjs` | Nova/Buster telemetry services | `emitEvent`, `closeTelemetry`, `closeTelemetryRedis` | Verifies Redis-owned sequence continuity and weak identity rejection. |
| V02b-F010 | V02b | `stops.mjs` | Buster gate runner through registry dispatch | `runGateViaRegistry` with Buster control adapter | Exercises post-start terminal gate mapping and telemetry through generic gate execution. |
| V03a-F001 | V03a | `verify.mjs` | `agent-lifecycle.mjs` | `registerAgentLifecycleArea(sharedAreaDeps)` | Registers agent spawn/kill/dispatch behavior records. |
| V03a-F002 | V03a | `verify.mjs` | `buster-runtime-normalization.mjs` | `registerBusterRuntimeNormalizationArea(sharedAreaDeps)` | Registers Buster runtime, queue, and recovery behavior records. |
| V03a-F003 | V03a | `verify.mjs` | `deployment-surface.mjs` | `registerDeploymentSurfaceArea(sharedAreaDeps)` | Bridges deployment truth verification into behavior suite. |
| V03a-F004 | V03a | `verify.mjs` | `discord-correlation.mjs` | `registerDiscordCorrelationArea(sharedAreaDeps)` | Registers Discord correlation behavior records. |
| V03a-F005 | V03a | `verify.mjs` | `many-module-soak.mjs` | `registerManyModuleSoakArea(sharedAreaDeps)` | Registers integrated many-module soak records. |
| V03a-F006 | V03a | `verify.mjs` | `polling.mjs` | `registerPollingArea(sharedAreaDeps)` | Registers polling/rate-limit/completion behavior records. |
| V03a-F007 | V03a | `verify.mjs` | `redaction-surface.mjs` | `registerRedactionSurfaceArea(sharedAreaDeps)` | Registers seeded-secret redaction behavior records. |
| V03b-F001 | V03b | `verify.mjs` | V03b area modules | `register*Area(sharedAreaDeps)` | Registers the eight selected behavior areas. |
| V03b-F002 | V03b | `runtime-monitor.mjs` | monitor/Buster runtime | `getAcpMonitorState`, `handleRateLimit`, `monitorSession` | Gateway-unreachable and rate-limit recovery behavior. |
| V03b-F003 | V03b | `shell-boundary.mjs` | Buster suites/cleanup/runtime | manifest rendering, K8s namespace-prefix preflight, `unit`, `bundle`, capability gates, `ensureBaseImages`, `cleanupSandboxResources` | Shell-safe execution, default-deny Buster capabilities, durable-denial alerts, and maximum-privilege cleanup scope. |
| V03b-F004 | V03b/RV-14 | `shutdown-integration.mjs` | shutdown/lifecycle/orchestration/termination | `reaperAfterKill`, `terminateSession`, lifecycle tracking exports | Shutdown wiring contract. |
| V03b-F005 | V03b | `summaries.mjs` | summary/case-study/rate-limit/pipeline runtime | `generatePipelineReview`, `generateCaseStudy`, `generateProjectSummary`, `runPipeline` | Summary telemetry/artifact/Discord behavior. |
| V03b-F006 | V03b | `telemetry-docs.mjs` / `telemetry-schema.mjs` | docs/contracts/source helpers | lifecycle audit text/schema checks | Documentation authority checks. |
| V03b-F007 | V03b | `telemetry.mjs` | telemetry/Redis/polling/gate runtime | completion selection/archive, `emitEvent`, `pollDual`, `runGateViaRegistry` | Telemetry runtime authority for Buster gate paths through generic dispatch. |
| V03b-F008 | V03b | `transcript-monitor.mjs` | monitor/orchestration/lifecycle | `readAcpTranscriptState`, `waitForSessionIdle`, `verifyAgentAlive` | Transcript fallback and observability. |
| V04a-F001 | V04a | artifact authority contract | `services/artifact-bundle.js` | artifact helpers | Frozen roles/surface policy validation. |
| V04a-F002 | V04a | dynamic-import contract | runtime source files | static import markers | Active paths must use static imports/registries. |
| V04a-F003 | V04a | complexity budget contract | source roots | recursive line scan | Enforces 700-line budget. |
| V04a-F004 | V04a | gate active-session contract | `services/gate-active-session.js` | recovery helper | Lifecycle read-model precedence. |
| V04a-F005 | V04a | gate control contract | control helpers/runners | mapping/validation/normalization | Shared typed gate result contract. |
| V04a-F006 | V04a | gate fix scaffold contract | fix scaffold/runners | start/finish scaffold | Shared Forge fix-cycle artifact ownership. |
| V04a-F007 | V04a | generator result contract | generator-result/summary/case-study | artifact/result helper plus validator/normalizer | Shared generator schema, explicit gateway identity, and no-fallback v1 generator validation. |
| V04a-F008 | V04a | module-runner contract | module-runner helpers/registry | phase/result/validator helpers | Extracted module runner and plugin diagnostics. |
| V04b-F001 | V04b | observability catch contract | observability/telemetry/Discord/logger sources | banned catch/no-op patterns | Silent error handling prevention. |
| V04b-F002 | V04b | operator alert contract | telemetry/sink registry | `emitOperatorAlert`, `onGateFail` | Discord sink plugin delivery. |
| V04b-F003 | V04b | entrypoint shim contract | pipeline shim/index | re-export/default export | Thin top-level entrypoint. |
| V04b-F004 | V04b | pipeline runner contract | runner slices | start/loop/terminal/recovery/deps helpers | Extracted runner architecture. |
| V04b-F005 | V04b | step-result contract | `pipeline-step-result.js` | builders/validators/projections | Typed step authority. |
| V04b-F006 | V04b | rate-limit contract | rate-limit builders/exit | helper APIs | Split rate-limit ownership. |
| V04b-F007 | V04b | Redis completion contract | common Redis message contract plus Redis tool/service | envelope/completion validators and completion helpers | Service ownership plus compatibility re-exports. |
| V04b-F008 | V04b | Redis log contract | observability/redis-log | logging exports | Single Redis logging owner. |
| V04b-F009 | V04b | remediation contract | remediation/gate engine/runners | request/control/controller APIs | Shared typed remediation handoff. |
| V04c-F001 | V04c | session authority contract | `session-authority.js`, correlation/status compat | active-session authority APIs/source markers | Lifecycle read-model authority, gateway confirmation fencing, and diagnostic evidence hydration prohibition. |
| V04c-F002 | V04c | stage envelope contract | stage primitives and runner builders | `buildStageRefs`, `buildStagePluginInvocation`, `collectExistingArtifactRefs` | Shared stage envelope construction. |
| V04c-F003 | V04c | status-store contract | status lifecycle/compat/polling/completion/truth drift | lifecycle/projection/adjudication APIs | Lifecycle read-model authority and completion/gate policies. |
| V04c-F004 | V04c | telemetry contract | telemetry docs/schema/runtime emitters | contract inventory, fake Redis, emitters | Canonical telemetry contract end to end. |
| V04c-F005 | V04c | validator control contract | validator control/module validators/lint/scheduling | builders/normalizers/runners | Typed validator contract and fail-closed diagnostics. |
| V04c-F006 | V04c | worker control contract | worker control/orchestration/module workers/runners | builders/mappers/normalizers | Typed worker contract and compatibility rejection. |
| V05-F001 | V05 | Buster operator contract | Buster pipeline/task lifecycle sources | canonical Discord embeds | One canonical operator surface each. |
| V05-F002 | V05 | Buster pipeline slice contract | Buster helpers/monitor/rate-limit/gateway/suite runner | active-agent/result/rate-limit/timeout APIs | Extracted Buster pipeline architecture. |
| V05-F003 | V05 | repo-scoped path contract | Buster repo paths/common security/visual-reg/perf | path scoping helpers | Repo-scoped path authority. |
| V05-F004 | V05 | verify-task scope contract | verify-task helpers/source | project/git scope helpers | `.swarm` staging and strict slug/path checks. |
| V05-F005 | V05 | common helper import contract | lifecycle audit inventory/common git primitives | common helper shims/head hash | Shared helper ownership. |
| V05-F006 | V05 | strict CLI contract | shared CLI parser and migrated CLIs | parser API/subprocess fixtures | Strict flag parsing. |
| V06a-F001 | V06a | deployment truth verifier | Helm/kubeconform/chart/scripts/workflow | rendered manifests and operator source | Pins deployment truth and repo-only checks. |
| V06a-F002 | V06a | fake Redis helper | lifecycle audit `ensureDir` | fake `ioredis` install, constructor option capture, xaddEvents, flushAsync | Test Redis transport fixture; unauthenticated local verification must pass explicit factory options. |
| V06a-F003 | V06a | lifecycle audit lib | source/docs/schema/runtime files | packaging/materialization/markdown/telemetry helpers | Shared verification utility owner. |
| V06a-F004 | V06a | verification console | process/console globals | quiet capture/failure handling | Clean JSON success output. |
| V06a-F005 | V06a | live Redis smoke | real Redis tool/Buster pipeline/git | task dispatch/process/completion read | Optional live Redis integration. |
| V06b-F001 | V06b | ACP/subagent launch wrappers | `session-launch-lib.mjs` | `parseLaunchArgs`, `verifyLaunchReachability` | Runtime-specific launch verification defaults. |
| V06b-F002 | V06b | startup smokes | Nova/Buster entrypoints | `node --check`, dynamic import, help/status subprocesses | Entrypoint parse/API checks. |
| V06b-F003 | V06b | final gate hardening | pipeline runner/session launch lib | lock APIs and launch assessment | Concurrency and fail-closed launch observations. |
| V06b-F004 | V06b | runtime collisions | lifecycle audit lib/runtime modules | packaging manifests/materialized imports | Image runtime surface validation. |
| V06b-F005 | V06b | session launch lib | common lifecycle/gateway/runtime/timing | spawn/status/kill/sleep/model mapping | Live launch reachability. |
