# Logic and algorithms map

Status: P00a-P23b, B00a-B05, C00a-C00b, S00, V00-V01b, V02a1-V03a, OI-39, OI-41 completed; OI-42 phase 6 cleanup complete; OI-43 phase 5 updated; RV-04/RV-06/RV-18/RV-23/RV-32 resolved; OI-47 resolved

## Branch / routing conditions

| ID | Batch | File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- | --- | --- |
| AO6-LB001 | AO6 | Exclusive hook lifecycle cutover | Canonical `agent.*` telemetry exists from agent-observability Redis control stream | run/module/dispatch/session identity on hook-derived telemetry | Decide lifecycle/readiness from hook event plus existing diff/quality gates, or degrade/fail closed when evidence is missing | No ACP/Gateway polling, transcript/session monitor, or `forge-completion.json` branch may substitute for missing hook evidence. |
| AO6-LB002 | AO6 | Gateway command separation | Gateway spawn/stop/steer/health response received | Command result/status payload | Treat as acknowledgement or platform health only; emit no lifecycle completion from it | Prevents command transport from becoming shadow observability authority. |
| AO5-LB001 | AO5 | `pollForgeCompletion` hook path | Matching `agent.ended` telemetry exists for run/module/dispatch/session/gateway identity | Canonical telemetry stream event | Wait configured settle window, collect meaningful git diff, return `agent_ended_meaningful_diff` or `agent_ended_no_meaningful_diff` | Replaces Forge artifact authority while preserving final-write safety. |
| AO5-LB002 | AO5 | Meaningful Forge diff classifier | Git HEAD movement or worktree status after Forge | `headBefore`, `headNow`, `git diff --name-only`, `git status --porcelain` | Exclude runtime/control artifacts and classify remaining paths as meaningful work | Prevents `forge-completion.json`, `.swarm`, and logs from advancing Forge. |
| AO5-LB003 | AO5 | Removed ACP legacy completion branch | Hook reader unavailable/degraded or hook missing | None; do not query ACP monitor/session status for completion | Degraded/fail-closed missing lifecycle evidence handled by retry/escalation policy | Phase 6 eradicates the migration branch instead of preserving two paths. |
| AO4-LB001 | AO4 | `compareAgentObservabilityParallelRunEvidence` | Observed hook event type is known OpenClaw ingress family | `event.type`, identity, payload outcome/reason/error | Normalize to comparable `agent.*` evidence families and add derived rate-limit/failure records when outcome text indicates them | Enables parallel comparison without changing telemetry promotion. |
| AO4-LB002 | AO4 | Coverage comparison | Legacy and hook records share entity identity | run/dispatch/session/child-session/module/gate/agent fields | Compute observed/legacy counts, missing hook evidence, missing legacy evidence, and legacy coverage ratio | Historical cutover evidence only after Phase 6; not a runtime fallback or lifecycle authority. |
| AO4-LB003 | AO4 | Span and LLM completeness checks | Tool/model call ids and model call ids | Started/finished/input/output record sets | Report complete/orphan spans and paired/unpaired LLM payload records | Detects incomplete hook coverage before any completion authority migration. |
| AO4-LB004 | AO4 | Redis pressure classification | Control lag/pending, payload length/bytes, memory bytes, thresholds | Snapshot numbers | Mark degraded pressure dimensions and overall evidence status | Documents backpressure observations without consuming payload streams. |
| AO3-LB001 | AO3 | `mapAgentObservabilityEventToTelemetry` | Mapping row has `promoted_by_default:true` and first-class type | Validated ingress event | Dispatch to event-type-specific payload builder and return canonical event type/payload/options | Unpromoted LLM summaries still return null in ingester despite schemas existing. |
| AO3-LB002 | AO3 | First-class payload builders | OpenClaw ingress payload has full content | Payload-specific summary logic | Convert durations to seconds, compute char counts/byte sizes/key lists, copy usage/error summaries and identity | Avoids raw full-content promotion to telemetry. |
| AO3-LB003 | AO3 | Telemetry contract test | Schema registry, lifecycle contract, telemetry schema docs, mapping source | Extract event names and sample payloads | Enforce inventory/docs/schema parity for AO3 events | Prevents schema drift between code and docs. |
| AO2-LB001 | AO2 | `AgentObservabilityIngester.processNext` | Ingester `enabled:false` | Config/env | Return `{processed:0, disabled:true}` without Redis access | Keeps Phase 2 inert until explicit runtime enablement. |
| AO2-LB002 | AO2 | `AgentObservabilityIngester.readNext` | Enabled ingester tick | Redis consumer group config | Ensure group, reclaim one pending entry with `XAUTOCLAIM`, otherwise block-read one new entry with `XREADGROUP` | Pending work is preferred before new stream records. |
| AO2-LB003 | AO2 | `AgentObservabilityIngester.processEntry` | Record read from control stream | Redis `data` field | Parse JSON, assert ingress contract, verify event routes to control stream | Invalid records are dead-lettered and then ACKed. |
| AO2-LB004 | AO2 | `mapAgentObservabilityEventToTelemetry` | Valid control event | Phase 0 mapping table and event identity/payload | Skip unpromoted events; emit unstable promoted schemas as `plugin.event`; map compatible subagent-spawned to existing `agent.spawned` | Phase 3 owns first-class schema promotion. |
| AO2-LB005 | AO2 | `AgentObservabilityIngester.checkPressure` | Health check requested | Redis pending count and payload stream length | Emit degraded once when thresholds are crossed and restored once when healthy again | Tracks control lag and payload pressure without consuming payload stream. |
| AO1-LB001 | AO1 | `OpenClawAgentObserver.handleHook` | Plugin config resolves `enabled:false` | Hook event `context.pluginConfig` plus env | Return without enqueue/write | Keeps Phase 1 disabled until explicitly enabled. |
| AO1-LB002 | AO1 | `normalizeHookEvent` / `normalizePayload` | Approved hook name selected | OpenClaw hook payload/context/session/metadata | Build Phase 0 ingress type/payload, apply minimal API-key mask, drop undefined optional fields, validate contract | Preserves full prompt/response/tool/final-message content while preventing raw hook shape drift. |
| AO1-LB003 | AO1 | `AgentObserverRedisWriter.enqueue` | Event disabled, oversize, or per-stream queue full | Config limits, serialized event bytes, stream kind queue length | Drop disabled/oversize/full-queue events; otherwise enqueue and schedule async flush | Captures first runtime backpressure boundary without blocking hook execution. |
| AO1-LB004 | AO1 | `AgentObserverRedisWriter.flush` | Pending queued event and Redis client available | Queue order, stream key, command timeout | `XADD MAXLEN ~ streamMaxLen * data <json>`; failures are classified and dropped | Redis outage degrades observability rather than agent runtime. |
| AO0-LB001 | AO0 | `agent-observability/src/validation.ts validateAgentObservabilityIngressEvent` | Envelope/type/hook/schema checks fail | `v`, `type`, fixed `source`, parseable `ts`, allowed identity fields, type-specific payload required fields, masking profile | Returns `{ ok:false, errors }`; assert wrapper throws `AgentObservabilityContractError` | Future plugin/ingester can reject malformed events before Redis or telemetry processing. |
| AO0-LB002 | AO0 | `validation.ts` LLM payload branches | `openclaw.llm.input` or `openclaw.llm.output` | Input requires full `prompt` and `history_messages`; output requires full `response`; optional system prompt, assistant message, provider/model/usage remain JSON-safe | Validates full-content fields without summarizing them | Satisfies Phase 0 requirement that prompt/history/response contract fields exist before runtime wiring. |
| AO0-LB003 | AO0 | `masking.ts applyMinimalApiKeyMask` | String matches basic API-key/token/secret/authorization pattern | Recursive JSON-safe strings/arrays/objects | Replaces only matching secret value with `[REDACTED_API_KEY]` and records `basic_api_key_pattern`; otherwise preserves content unchanged | Keeps broad content redaction out of Phase 0 while marking minimal masking. |
| AO0-LB004 | AO0 | `routing.ts selectAgentObservabilityStreamKind` | Event type is LLM or tool payload family | Ingress event type | Routes `openclaw.llm.*` and `openclaw.tool.*` to payload stream; other lifecycle/model/session/subagent events to control stream | Captures split-stream boundary without creating Redis writers. |
| AO0-LB005 | AO0 | `routing.ts normalizeAgentObservabilityMaxEventBytes` / `checkAgentObservabilityPayloadSize` | Max bytes invalid or event JSON exceeds configured limit | Configured byte cap, serialized event bytes | Rejects caps above 5 MiB; default is 3 MiB; oversize check returns `agent_observability_payload_too_large` plus identity/size metadata | Documents the safety fuse before Phase 1 backpressure/Redis writes. |
| P00a-LB001 | P00a | `skills/nova/pipeline.ts` top-level | `__currentPath === __entryPath` | Realpath of `import.meta.url`; realpath/raw `process.argv[1]` | Import CLI and `await main()` | Preserves importable API without CLI side effects. |
| P00a-LB002 | P00a | `skills/nova/pipeline/cli.ts main` | `flags.help` | Frozen canonical `help`; `VALID_THINKING_LEVELS` | Print help with the policy-derived thinking enum; exit 0 before config load | Help has no project/channel requirement. |
| P00a-LB003 | P00a | `skills/nova/pipeline/cli.ts normalizeNovaCliFlags` | Missing raw `project` / `nova-channel` | Parser output; `CURRENT_PROJECT`; `NOVA_CHANNEL` | Create frozen canonical `project`/`novaChannel` fields with env fallbacks | CLI flags override env; downstream code never mutates or reads raw keys. |
| P00a-LB004 | P00a | `skills/nova/pipeline/cli.ts main` | No nova channel and not status/dry-run/blueprint/list | `flags.novaChannel`, `flags.status`, `flags.dryRun`, `flags.blueprint`, `flags.blueprintList` | Print stderr error; exit `EXIT_ERROR` | Real runs need escalation channel for EXIT 10/TIMEOUT. |
| P00a-LB005 | P00a | `skills/nova/pipeline/cli.ts main` | `flags.runtimeThinking` validation throws | `--thinking` | JSON error; cleanup; exit `EXIT_ERROR` | Invalid policy input fails early. |
| P00a-LB006 | P00a | `skills/nova/pipeline/cli.ts main` | Runtime model or thinking present | `--model`; `--thinking` | Attach `config._runtimeOverrides` and log | CLI runtime overrides take precedence downstream. |
| P00a-LB007 | P00a | `skills/nova/pipeline/cli.ts main` | `flags.blueprintList` | `--blueprint-list` | Output list; cleanup; exit 0 | Blueprint commands precede status/dry-run. |
| P00a-LB008 | P00a | `skills/nova/pipeline/cli.ts main` | `flags.blueprint` with no matching progress module | `--blueprint`; `progress.modules` | Output JSON error; cleanup; exit `EXIT_ERROR` | Unknown module guard. |
| P00a-LB009 | P00a | `skills/nova/pipeline/cli.ts main` | `flags.blueprint` with module | Module `dir`; `mod.stages` | `releaseBlueprint(..., mod.stages \|\| ['forge','buster'])`; output; exit 0 | Default stage list is forge+buster. |
| P00a-LB010 | P00a | `skills/nova/pipeline/cli.ts main` | `flags.status` / `flags.dryRun` | Command flags | `printStatus` or `dryRun`; cleanup; exit 0 | Non-spawning operator commands. |
| P00a-LB011 | P00a | `skills/nova/pipeline/cli.ts main` / `services/prompt-ingress.js` | `flags.prompt != null` else `flags.promptFile` | `--prompt`; `--prompt-file`; repo root realpath; prompt byte/char counts | Return bounded/redacted prompt metadata or throw | Inline prompt is validated first; prompt-file fallback realpaths symlinks and fails closed outside repo root. |
| P00a-LB012 | P00a | `skills/common/pipeline/cli-args.ts parseCliArgs` plus `skills/nova/pipeline/cli.ts normalizeNovaCliFlags` | Token/flag/schema validation failures or deleted legacy key access | argv, parser schema, frozen canonical flag proxy | Parser throws `Error`; deleted raw-key reads throw `Error`; Nova CLI catches startup parser/normalizer failures, logs `[ERROR]`, outputs `{ exit: EXIT_ERROR, error }`, and exits `EXIT_ERROR` | Parser remains throw-only; Nova CLI owns operator-facing invalid-argv presentation and uses one immutable internal flag shape. |
| P00b-LB001 | P00b | Scoped P00b shim files | None found in scoped files | None | Static `export *` only | Confirms no Nova-specific branch logic lives in these top-level helper facades. |
| P01-LB001 | P01 | `core/config.js loadConfig` | Missing project or explicit/detected repo path branch | `projectName`, `opts.repoRoot`, `REPO_ROOT`, Git discovery | Throw, use explicit repo, or discover repo | Defines startup repo/project authority. |
| P01-LB002 | P01 | `core/config.js validateConfig` | Agent/gate/plugin/Wave 3 validation branches | Config/progress/plugin fields | Accumulate errors then throw once | Startup validation is comprehensive and terminal. |
| P01-LB003 | P01 | `core/context.js createPluginContext` | Capability includes surface capability | Plugin manifest capabilities | Add only authorized context surfaces | Enforces plugin least privilege. |
| P01-LB004 | P01 | `core/context.js createPluginContext` | `sourceType === 'builtin'` | Plugin manifest | Add non-enumerable `coreRuntime` | Builtins get mutable config/progress access. |
| P01-LB005 | P01 | `core/context.js narrowPluginInputForCapabilities` | No `read.artifacts` or no `notify.operator` | Capabilities | Remove artifact/summaries/priorResults and/or presentation | Prevents over-broad plugin input. |
| P01-LB006 | P01 | `core/platform-config.js discoverSwarmConfigPath` | Candidate exists | Candidate paths | Return first existing else first candidate | Deterministic config path selection. |
| P01-LB007 | P01 | `core/policy.js resolvePolicy` | Candidate precedence and unsupported dispatch path | Runtime/scope/project/config values, `dispatchPath` | First non-empty value wins; Redis suppresses thinking | Central model/thinking authority. |
| P01-LB008 | P01 | `core/runtime.js resolveRunContext` | Explicit context/config/active/fallback order | Input and active AsyncLocalStorage context | Return first valid run context | Prevents active context from overriding explicit config. |
| P01-LB009 | P01 | `core/paths.js validateSafePath` | Path invalid or outside allowed prefixes | File path | Throw | Restricts configured executable/tool paths. |
| P01-LB010 | P01 | `core/temp.js file` | `_dir` absent | Manager state | Lazy init before file path | Scratch dir is on-demand. |
| P02-LB001 | P02 | `core/registry.js buildPluginRegistry` | Duplicate discovered moduleId or config references missing module | Definitions and normalized config | Push registry errors; skip duplicate definition | Prevents ambiguous module records. |
| P02-LB002 | P02 | `core/registry.js buildPluginRegistry` | Errors present and `throwOnError !== false` | Accumulated errors | Throw formatted startup error | Registry fails closed by default. |
| P02-LB003 | P02 | `core/registry.js resolve*/require*` | Registry missing/disabled/missing owner | Config or registry | Resolve returns null/empty; require throws | Separates optional lookup from enforcement. |
| P02-LB004 | P02 | `core/registry.js resolveHookListeners` | Multiple listeners | Enabled records | Sort by priority then moduleId | Deterministic listener order. |
| P02-LB005 | P02 | `registry/config-normalization.js` | Invalid plugin config field or extra path | `config.plugins.*` | Push structured errors and normalize valid fields | Maintains startup error aggregation. |
| P02-LB006 | P02 | `registry/indexes.js buildStageOwnerIndex` | One owner vs conflict vs missing owner | Records per hook/stage | Auto-select one, error on conflict/missing | Registry owns decision-stage single writer. |
| P02-LB007 | P02 | `registry/indexes.js buildGateTypeIndex` | Gate type owner mismatch/conflict | Gate record and stage owner | Push missing/conflict errors | Gate type must match stage owner. |
| P02-LB008 | P02 | `registry/validation.js validateJsonSchemaValue` | Schema type/enum/required/additionalProperties | Resolved module config | Push config errors | Minimal plugin config schema enforcement. |
| P02-LB009 | P02 | `registry/validation.js validateCapabilities` | Unknown/duplicate/forbidden/missing/restricted capability; unknown manifest kind | Manifest/trust/allowlist | Push capability errors; unknown-kind policy arrays default to empty so manifest validation errors still aggregate | Capability policy enforcement remains fail-closed without raw `TypeError`. |
| P02-LB010 | P02 | `services/adapter-registry.js resolve*` | Verification DI present or unknown key | Config adapter values | Return validated verification DI or throw fail-closed error | Static adapter boundary. |
| P02-LB011 | P02 | `services/dependencies.js checkDependencies` | `depends_on` entry starts `gate:` | Progress dependency string | Evaluate gate projection | Gate dependencies use gate read model. |
| P02-LB012 | P02 | `services/validation.js runPreflightValidation` | FORGE.md missing/unreadable | Module path | Skip checks and pass | Preflight is non-blocking without blueprint. |
| P02-LB013 | P02 | `services/validation.js runDeliveryLintValidation` | No declared Dockerfile, invalid/escaped Dockerfile path, missing/unreadable Dockerfile, invalid `static_path`, COPY mismatch | `test_config.serve.*`, `config.repo_root`, and file realpath state | Skip/pass only when no `serve.dockerfile`; otherwise return failure for invalid/missing/read errors or COPY mismatch | Delivery lint branch outcomes. |
| P03-LB001 | P03 | `integrations/discord.js discord/discordEmbeds` | Verification DI, mute flag/env, missing webhook, disabled alert level | Config/env/level | Audit first, then override/skip/deliver | Operator notifications are optional and testable. |
| P03-LB002 | P03/RV-25 | `integrations/discord.js health transitions` | Central observability degraded state | `observability.js` circuit-breaker map | Emit degraded once, restored on later success only if previously degraded | Prevents repeated degradation spam without Discord-local state. |
| P03-LB003 | P03 | `git-worktree.ts assessPollingPullSafety` | Active sessions, dirty state, unpushed commits | Tracked agents, git status/upstream | Skip, fail, or pull | Protects shared worktree. |
| P03-LB004 | P03 | `git-worktree.ts _gitPullCore` | Pull success/rebase/destructive flag | Git result and `.git/rebase-*` dirs; `isRuntimeStatePath` for conflict paths | Return ok, auto-resolve runtime-state conflicts, abort/rethrow/reset otherwise | Central pull recovery policy. |
| P03-LB005 | P03 | `git-worktree.ts collectRuntimeStateStash` | Dirty entries include non-runtime paths | Porcelain entries normalized by `isRuntimeStatePath` | Throw `GIT_SYNC_FAILED` or stash runtime paths | Prevents silent source/config stashing; `.swarm` dot is preserved during path normalization. |
| P03-LB006 | P03/RV-17 | `git-worktree.ts gitPushWithRetry` | Attempt count, caller budget/signal, and classified failure | Git push error or caller abort/budget exhaustion | Abortable budget-aware wait/retry or propagate final/abort error | Push resiliency without uninterruptible retry sleeps. |
| P03-LB007 | P03 | `services/redis-log.js logRedisExchange` | Payload large/unserializable | Payload JSON | Truncate preview or write marker, then append to `redisLogArtifactTargets` | Prevents log bloat/crashes while centralizing target path construction. |
| P03-LB008 | P03 | `tools/redis.ts readCompletion` | Weak expected identity | run/attempt/dispatch/session identity | Emit log callback and return null | Prevents stale completion reads. |
| P03-LB009 | P03 | `tools/redis.ts CLI wrapper` | `--action` value | CLI flags | send/read/archive or error | Redis CLI routing. |
| P03-LB010 | P03 | Common gateway helper | Network-like error and attempts left | Error classifier/attempt | Retry after sleep; HTTP/final errors throw | Gateway retry boundary. |
| P04-LB001 | P04/OI-41 | Scoped compatibility shims | None found in scoped files | None | Static `export *` only | Confirms no Nova-specific logic in agent shim files, including the neutral tracked-agent facade. |
| P04-LB002 | P04/OI-41 | Common `parseSessionState` in `session-semantics.js` | ACP state/status/statusText patterns | Gateway session status result | Return `{ active, state }` with running/terminal/idle/unknown mapping | Session state normalization authority shared by monitor and lifecycle without an import cycle. |
| P04-LB003 | P04 | Common `getAcpMonitorState` | Label/config call shape vs direct session-key call shape | Argument shapes | Resolve tracked agent/session key or direct child session key, then validate canonical monitor state | Shared monitor edge supports both current Nova/Buster caller shapes without changing the canonical ACP event schema. |
| P04-LB004 | P04/RV-12 | Common monitor state builder | Transcript rate-limit/error, session terminal, unknown+stale thresholds | Transcript/session state and prior monitor state | Set terminal/rateLimited/reason/detail fields, then validate exact canonical monitor shape | Drives polling/session terminal behavior and ACP event payload validation. |
| P04-LB005 | P04/RV-11 | Common `waitForSessionIdle` | Terminal, unreachable, inactive, active transcript events | ACP EventBus monitor state and budget | Return, bounded event grace wait, or budget timeout | ACP polling delegated to edge adapter. |
| P04-LB006 | P04/OI-47 | Common lifecycle `spawnSession` | Runtime resolves to subagent vs ACP | Runtime/model/options | Build `spawnGatewaySession` args with runtime-specific fields | Spawn payload authority; raw Gateway tool name is common-owned. |
| P04-LB007 | P04 | Common lifecycle `killSession` | Already stopped, subagent, stop request, ACP cleanup | Session state/runtime/options | Confirm, kill subagent, send `/stop`, optional `acpx` cleanup | Low-level stop primitive; runtime callers use the RV-14 termination controller. |
| P04-LB011 | P04/RV-14 | Common `terminateSession` controller | Missing key, confirmed stop, unconfirmed stop, cleanup callback | Session key/runtime/options plus isolated grace budget | Call low-level kill with capped confirmation budget, run controller-owned cleanup, validate canonical termination result | Sole runtime ACP teardown result authority. |
| P04-LB008 | P04 | `shutdown.js buildVictimSet` | Command/session/gateway match and tracked ACP env | `ps` rows and `/proc` env | Select wrapper/orphan roots and descendants | Prevents broad process killing outside tracked project/session. |
| P04-LB009 | P04 | `shutdown.js performSignalShutdown` | Tracked sessions/status dir present | Lifecycle map and shutdown context | Stop sessions; mark in-flight status FAIL; close telemetry | Signal cleanup order. |
| P04-LB010 | P04 | `orchestration-healthcheck.js verifyAgentAlive` | Redis dispatch, missing key, terminal/unknown/unreachable/gateway error | Config, session status, transcript progress | Return true/false and emit degraded/restored as needed | Nova liveness gate. |
| P05-LB001 | P05 | `module-worker-control-results.ts inferModuleBusterFailureClass` | Explicit class/ok/known reason/Redis verdict/final status | Backend/poll result | Return pass/spawn/rate-limit/timeout/pretest/verdict/block/unknown class | Drives worker next-action mapping. |
| P05-LB002 | P05 | `module-workers.js runModuleForgeWorker` | Spawn failure, healthcheck failure, poll finalization | Spawn/health/poll result | Return typed failure or poll then always kill/finalize | Prevents polling dead sessions and ensures cleanup. |
| P05-LB003 | P05 | `module-workers.js runModuleBusterWorker` | Archive failure, spawn failure, status active-agent identity | Archive/spawn/status/poll | Return typed failure; trust active-agent only if identity confirmed | Prevents stale completion/session authority. |
| P05-LB004 | P05 | `orchestration.ts getRedisDispatchModule` | Adapter cacheable false/cache hit/miss | Adapter registry result | Return uncached override, cached adapter, or cache new static adapter | Stable adapter behavior with test seam. |
| P05-LB005 | P05 | `orchestration.ts spawnAgent/killAgent/steerAgent` | `dispatch === 'redis'` | Agent config | Redis dispatch/no-kill/Redis steer vs ACP spawn/kill/gateway steer | Central dispatch route selection. |
| P05-LB006 | P05 | `orchestration.ts spawnAcpAgent` | Runtime resolves to subagent | Model/runtime | Use subagent runtime and suppress ACP-specific thinking/agent fields | Keeps gateway semantics distinct. |
| P05-LB007 | P05/RV-14 | `orchestration.ts killAcpAgent` | Graceful flag, missing session, termination result | Inputs/tracked entry/termination controller | Wait idle/skip; terminate through shared controller; untrack only when `confirmed` | Prevents split-brain teardown and premature cleanup. |
| P05-LB008 | P05 | `orchestration.ts buildBusterPayload` | `taskType` module/gate/other | Task type/progress | Build module schema, gate schema, or generic message | Buster task contract routing. |
| P05-LB009 | P05/RV-14 | `reviewer-lifecycle.js spawnReviewerAgent/killReviewerAgent` | Runtime and graceful/termination result | Reviewer/model/controller output | Spawn ACP/subagent reviewer; terminate through shared controller; untrack only if `confirmed` | Echo reviewer lifecycle without secondary post-kill monitor checks. |
| P06-LB001 | P06 | `runPipeline` | Single module vs full run | `opts.module` | Single-module path or prep+loop | Top-level route. |
| P06-LB002 | P06 | `planPipelineStep` / `runPipelineStateMachine` | Done/blocked/validator/gate/module next step | Scheduler result from `findNextStep` | Complete, halt, run validator/gate/module | Explicit main-loop state-machine dispatch authority; scheduler selection and terminal side effects stay delegated. |
| P06-LB003 | P06 | `findNextStep` | Validator/gate/module execution-order item | Progress and read models | Inline validator, gate scheduler, module scheduler, done | Top-level scheduling. |
| P06-LB004 | P06 | `findNextStep` | Gate consumed/completed and review full-lint owner | Gate projection/plugin registry | Skip consumed gate or insert mandatory full-lint | Prevents duplicate gates and enforces lint. |
| P06-LB005 | P06 | `findNextStep` | Module PASS/BLOCKED/FAIL/other | Module scheduler projection | Skip, halt blocked, retry fail, resume other | Module progression authority. |
| P06-LB006 | P06 | `maybeRunArchitectureValidation` | Arch enabled/not skipped/fresh-or-before-work | Config/progress/opts/module started state | Run validator or skip | Pre-module architecture validation decision. |
| P06-LB007 | P06 | `finalizeTerminalHalt` | Exit code classes | Typed pipeline-step result | Inject needs-Nova, escalate, rate-limit fields, summaries | Terminal side effects by exit class. |
| P06-LB008 | P06 | `completePipeline` | Already completed/terminal lifecycle | Lifecycle read model/append error | Return OK idempotently | Resume-safe completion. |
| P06-LB009 | P06 | `reconcileStaleModuleState` | Active session, stale no-session age, stop confirmed | Status/monitor/kill | Reset, kill orphan, or block recovery | Safe startup recovery. |
| P06-LB010 | P06 | `acquirePipelineRunLock` | Lock absent/active leased/expired leased/malformed or non-lease | Strict lock schema plus `lease_expires_at`/`stale_at` | Create leased owner with heartbeat, throw with CRITICAL alert/manual cleanup, reclaim expired leased lock, or fail closed | Per-swarm concurrency limit without PID-only reclaim authority. |
| P07-LB001 | P07/RV-17 | `runModule` | Attempt requests retry | `executeModuleAttempt` result plus caller budget/signal | Emit retry telemetry, perform abortable 5000 ms wait, rerun | Public retry-loop authority; abort/budget exhaustion propagates instead of becoming another retry. |
| P07-LB002 | P07 | `runModuleForgePhase` | Preflight terminal or Forge prompt/plugin/worker result classes | Preflight/prompt/worker/poll result | Return terminal, retry via `handleFail`, rate-limit exit, or continue | Forge outcome routing. |
| P07-LB003 | P07 | `runModuleForgePhase` | Worker ok but status not READY_FOR_TESTING | Status after worker | Force READY_FOR_TESTING and WARN Discord | Keeps pipeline moving after successful changes. |
| P07-LB004 | P07 | `finalizeForgeOnlyPass` | Module has no Buster stage | Stages/status | Soft git push, emit caller-owned soft-fail degraded telemetry when persistence fails, transition PASS, emit pass telemetry | Forge-only completion. |
| P07-LB005 | P07 | `prepareModuleForBuster` | Buster-only module in PENDING/FAIL | Stages/status | Promote to READY_FOR_TESTING | Allows buster-only modules to skip Forge. |
| P07-LB006 | P07 | `prepareModuleForBuster` | Delivery lint/pre-check not passed | `status.validation` | Run validator, pass marker, block, or retry | Mandatory pre-Buster validation. |
| P07-LB007 | P07 | `prepareModuleForBuster` | Validation milestones missing or Git sync failure | Status/Git sync | Terminal `EXIT_ERROR` fail-closed | Handoff invariant before Buster. |
| P07-LB008 | P07 | `executeBusterWorkerAttempt` | Worker plugin throws/invalid | Error/diagnostics | Terminal `EXIT_ERROR` with diagnostics | Buster worker fail-closed boundary. |
| P07-LB009 | P07 | `buildWorkerPluginEffects` | Stage id is Buster vs Forge | `stageId` | Dispatch injected/default Buster or Forge worker | Worker plugin effect routing. |
| P08-LB001 | P08 | `executeModuleAttempt` / `planLoadedModuleStatus` | Dependency check/status missing/PASS/BLOCKED/PENDING/active phase | Dependency state/status read model | Fail, terminal pass, terminal blocked, blueprint release/init, or continue | Protects state before phases while making loaded-status routing explicit. |
| P08-LB002 | P08 | `planModuleAttemptPhase` / `runModuleAttemptStateMachine` | Forge/Buster stage mix and status/current phase | Stages/status/current phase | Run Forge, finalize forge-only PASS, prepare for Buster, run Buster, return retry/terminal, or unexpected fallback | Central per-attempt state-machine phase routing with phase side effects delegated. |
| P08-LB003 | P08 | `executeBusterAttemptDispatch` | Prompt/config validation failure | Prompt result/config validator | Terminal `EXIT_ERROR` or `EXIT_NEEDS_NOVA` | Pre-dispatch fail-fast. |
| P08-LB004 | P08 | `runModuleBusterPhase` | Worker spawn_failed, poll ok, terminal status | Worker result/status | Spawn failure, poll-failure, PASS, FAIL/BLOCKED, retry | Buster loop routing. |
| P08-LB005 | P08 | `handleFailedPollResult` | Rate-limit/git/conflict/crash budget | Poll reason/attempt | Rate-limit, fail-closed, block, retry, or crash-exhausted block | Non-ok poll authority. |
| P08-LB006 | P08 | `handleBusterFailOrBlockedStatus` | Redis source/verdict/pre-test class/repeated suite | Redis entry and status fail summaries | Infra crash, operator issue, repeated pre-test, code retry | Buster failure semantic routing. |
| P08-LB007 | P08 | `runModulePreflight` | Preflight pass/fail | Validation result | Continue or Discord+handleFail | Avoids spawning Forge on contract mismatch. |
| P09-LB001 | P09 | `runGate` | Missing `progress.gates`, missing gate, unknown gate type | Progress/registry | Dispatch failure terminal error step result | Fail-closed gate dispatch. |
| P09-LB002 | P09 | `requireGateControlAdapter` | Adapter missing/invalid mode/missing methods | Gate type owner adapter | Throw execution failure | Ensures gate type owners implement contract. |
| P09-LB003 | P09 | `runScheduledRegistryGate` | Registry `gateControl` strategy mode standard/remediable/waitable | `adapter.mode` | Standard plugin, remediable loop, or waitable loop | Generic GateRunner route selection; no review/Buster/approval dispatch table. |
| P09-LB004 | P09 | `normalizeGateControlResultForAdapter` | Remediable vs standard/waitable | Adapter mode | Remediable or standard typed normalizer | Enforces correct control-result contract. |
| P09-LB005 | P09 | `runGateForgeFixCycle` | Spawn failure/health failure/rate-limit/no changes/success | Scaffold/session result | Retry request, terminal, or re-evaluate | Shared fix-cycle outcome routing. |
| P09-LB006 | P09 | `runRemediableGateControlLoopResult` | `request_fix`, invalid cycle, terminal/retry/re-evaluate | Control result remediation policy/fix outcome | Exhausted, terminal, bump cycle, evaluate | Remediation loop authority. |
| P09-LB007 | P09 | `runWaitableGateControlLoopResult` | `nextAction === 'wait'` | Control result | Wait for signal and normalize resolved result | Generic wait gate authority. |
| P09-LB008 | P09 | `buildGateActiveSessionRecoveryPolicy` | Lifecycle strong identity and file/tracked conflicts | Active-session evidence | Lifecycle authoritative, file/tracked evidence-only, conflict flags | Prevents stale gate file authority. |
| P09-LB009 | P09 | `startGateForgeFixCycleScaffold` | Spawn/health success/failure | Agent spawn/health result | Active-session persist, spawn failure, health failure, OK | Shared Forge fix startup. |
| P10-LB001 | P10 | `parseReviewOutputContent` | Invalid JSON/non-object/status | Output content | Invalid contract result | Fail-closed parser. |
| P10-LB002 | P10 | `parseReviewOutputContent` | Status GO/PASS vs NO-GO/FAIL | `reviewResult.status` | GO pass or NO-GO fail facts | Review decision authority. |
| P10-LB003 | P10 | `runReviewGateEvaluation` | Existing output GO/PASS | `gate.output_file` JSON | Skip review with OK control result | Resume idempotence. |
| P10-LB004 | P10 | `runReviewGateEvaluation` | Existing output NO-GO/FAIL plus bounded operator directive | Output JSON and `opts.novaPrompt` | Skip initial Echo and enter Forge fix | Manual remediation guidance can fix existing NO-GO, but it remains fenced/untrusted in the fix prompt. |
| P10-LB005 | P10 | `runReviewGateEvaluation` | No reviewers | `reviewConfig.reviewers` | Terminal error result | Misconfig fail-closed. |
| P10-LB006 | P10 | `runReviewGateEvaluation` | Rate-limit exhausted | Review task result | Terminal rate-limit control result | Preserves Echo cooldown exhaustion. |
| P10-LB007 | P10 | `runReviewGateEvaluation` | Invalid output, failure, GO, NO-GO | Review task result | Error, request-fix, pass, needs-Nova, or request-fix | Main review decision routing. |
| P10-LB008 | P10 | `performReviewGateFixAttempt` | NO-GO with no extractable issues | Remediation diagnostics issues | Exhausted terminal control result | Avoids spawning Forge without target. |
| P10-LB009 | P10 | `createReviewGateRemediationController` | Fix/evaluate callbacks | Remediation loop callbacks | Re-review after successful fix or request another fix | Shared loop integration. |
| P11-LB001 | P11 | `waitBusterGateCompletionEvidence` | Redis completion, local evidence, or fatal event arrives | P17 controller result plus active gate dispatch identity | Map controller result to existing gate poll result | P11 is a thin messenger; no re-adjudication or local re-read occurs while mapping. |
| P11-LB002 | P11 | `mapRedisControllerCompletion` | P17 reports conflict/rate-limited/timeout/PASS/FAIL | Controller-provided `completion` and `redis_entry` | Completion conflict, terminal rate-limit, pause, PASS, FAIL poll result | Deterministic projection of P17 authority output. |
| P11-LB003 | P11 | `mapLocalControllerCompletion` | P17 reports local invalid output/parse/done state | Controller-provided `local_completion` | Terminal invalid, parse marker, poll result, or continue | Deterministic projection of P17/P15 local evidence output. |
| P11-LB004 | P11 | `_runBusterGateOnce` | First attempt config invalid/archive failed/spawn failed | Attempt/config/Redis archive/spawn | Return failing poll result before polling | Pre-dispatch fail-fast. |
| P11-LB005 | P11 | `runBusterGateEvaluation` | Existing canonical PASS output on attempt 1 | `readBusterGateCompletion` | Skip Buster dispatch with OK control result | Resume idempotence. |
| P11-LB006 | P11 | `runBusterGateEvaluation` | Stale output/status on attempt 1 | Existing completion artifacts | Archive/delete before dispatch | Prevent stale completion from winning. |
| P11-LB007 | P11 | `handleBusterGateEvaluationResult` | `result.ok` | Poll result | PASS artifacts, telemetry, OK control result | PASS terminal projection. |
| P11-LB008 | P11 | `handleBusterGateEvaluationResult` | `config_invalid`, `spawn_failed`, `invalid_contract`, `parse_corrupted`, `timeout`, `git_error`, `rate_limit_exhausted` | `result.reason` | Typed terminal failure by class | Buster terminal semantics. |
| P11-LB009 | P11 | `handleBusterGateEvaluationResult` | Verdict FAIL with `hasFixLoop` | `gate.on_fail` and extracted issues | Build `request_fix` control result | Remediation handoff. |
| P11-LB010 | P11 | `performBusterGateFixAttempt` | Successful fix before retest | Gate output/status paths | Archive/delete stale outputs/status | Retest must observe fresh Buster evidence. |
| P12-LB001 | P12 | `normalizeApprovalTimeoutPolicy` | Input is `BLOCK`/`CONTINUE` vs invalid | Raw policy and fallback | Valid policy or fallback clamped to BLOCK/CONTINUE | Timeout authority. |
| P12-LB002 | P12 | `runApprovalGateEvaluation` | Corrupted/invalid persisted state | Loaded gate-state JSON | Fail closed typed control result | Prevents unsafe reset/reopen. |
| P12-LB003 | P12 | `runApprovalGateEvaluation` | Existing APPROVED/REJECTED/CANCELLED/TIMED_OUT/PENDING | Persisted status | Replay terminal telemetry, re-resolve timeout, wait, or fail | Resume idempotence. |
| P12-LB004 | P12 | `runApprovalGateEvaluation` | Fresh start | No state | Create PENDING_APPROVAL, write artifacts, emit request, return WAIT | New approval request authority. |
| P12-LB005 | P12/RV-16 | `waitForApprovalSignalFlow` / `resolveObservedApprovalState` | `approval.signal` or startup state reports APPROVED/REJECTED/CANCELLED/invalid | Current persisted status reloaded after each signal | Pass, block, cancel block, or fail closed | Operator decision routing without runner polling. |
| P12-LB006 | P12/RV-16 | `waitForApprovalSignalFlow` / `resolveObservedApprovalState` | EventBus wait times out at current deadline or pending signal updates deadline | `Date.now()` vs `state.deadline` | Save TIMED_OUT, write decision, resolve timeout | Timeout resolution via deadline-bound EventBus wait. |
| P12-LB007 | P12 | `resolveTimeout` | Timeout policy CONTINUE vs BLOCK | Normalized timeout policy | Pass/continue or needs-Nova block | Approval timeout semantics. |
| P12-LB008 | P12 | `getApprovalGateControlAdapter.extraValidate` | Timed-out continued result not PASS | Control metadata/action | Adapter validation error | Prevents invalid timeout-continue mapping. |
| P13-LB001 | P13 | built-in gate typed decisions | Gate type review/buster/approval | Review result, Buster failure class, approval status | Pass/block/request policy mapping | Gate controls now build typed decisions directly; shared compatibility mapping was deleted. |
| P13-LB002 | P13 | `validateGateActionSemantics` | Action pass/block/request_fix/wait | Gate run status, metadata, typed wait | Semantic validation errors | Prevents contradictory gate results. |
| P13-LB003 | P13 | `normalizeGateControlResult` | Coerce or validate errors | Raw gate result | `ContractInvalidError` | Fail-closed plugin boundary. |
| P13-LB004 | P13 | `validateRemediableTypedGateControlResult` | `request_fix` without remediation or non-code issue type | Typed result | Validation errors | Remediation contract authority. |
| P13-LB005 | P13 | `inferOutcomeFromControlResult` | Explicit outcome, typed outcome class, summary/issue fallback | Control result/action | Pipeline-step outcome | Central terminal action mapping. |
| P13-LB006 | P13 | `validatePipelineStepResult` | Schema/action/outcome/compatibility mismatch | Step result | Validation errors | Typed step result integrity. |
| P13-LB007 | P13 | `mapModuleValidatorResultToControl` | Execution failed/blocked, passed, failed | Validator result/opts | block/pass/request_fix | Validator control bridge. |
| P13-LB008 | P13 | built-in worker typed decisions | Worker type/pass/reason/failure class | Explicit worker control inputs | pass/retry/request_fix/block | Worker controls now build typed decisions directly; backend compatibility mapping was deleted. |
| P14-LB001 | P14 | `loadStatus` | Lifecycle read model present/absent | lifecycle module read model | lifecycle-projected status or null | Reads lifecycle projections only. |
| P14-LB002 | P14 | `assertLifecycleGuardAllowsSave` | Pending lifecycle mutation absent and guarded fields changed | Previous vs next guarded fields | Throw `STATUS_LIFECYCLE_GUARD_VIOLATION` | Forces lifecycle transition helpers for authority fields. |
| P14-LB003 | P14 | `appendLifecycleEvent` | Existing idempotency key | Events JSONL/cache | Return existing event `deduped:true` | Prevents duplicate canonical events. |
| P14-LB004 | P14 | `ensureLifecycleEventLegal` | Pipeline start/completion/halt state | Pipeline read model | Allow or throw duplicate/unstarted/terminal errors | Pipeline lifecycle legality. |
| P14-LB005 | P14 | `ensureLifecycleEventLegal` | Wait/signal/cooldown/recovery/module state | Refs/data/read models | Allow or throw illegal transition | Canonical state machine guard. |
| P14-LB006 | P14 | `mapGate/wait/resume/cooldown projections` | Event type | Event type/refs/data | Update gates/waits/signals/cooldowns | Event-specific read-model routing. |
| P14-LB007 | P14 | `applyLifecycleEventToReadModels` | Module event type | `module_attempt.*` | Set status/current phase/completion/fail fields | Module scheduler authority projection. |
| P14-LB008 | P14 | `buildLifecycleIdempotencyKey` | Known event type vs default | Event type/refs/data | Stable explicit key or hash fallback | Dedupe semantics. |
| P14-LB009 | P14 | `buildCooldownRefs` | Module vs gate vs missing target | Input target ids | Module refs, gate refs, or throw | Cooldown event identity. |
| P15-LB001 | P15 | typed result validation | Object/array returns typed control/result schema | Schema/action/outcome/diagnostics fields | Validation errors or accepted typed result | The shared compatibility-authority helper was deleted after projection removal. |
| P15-LB002 | P15 | typed diagnostics cloning | Diagnostics metadata supplied by typed builders | Serializable clone | Typed diagnostics without projection stripping | Edge compatibility projection safety helper was deleted with the projection layer. |
| P15-LB003 | P15 | `buildActiveSessionAuthorityPolicy` | Missing/weak/mismatched/gateway-required identities | Lifecycle active session, diagnostic evidence, gateway/monitor evidence | Explicit policy code/role/confirmed flags plus `allow_evidence_hydration:false` | Lifecycle read model is the only authority; file/status/tracked evidence cannot hydrate authority. |
| P15-LB005 | P15 | `getAuthoritativeModuleState` | Canonical read model present vs legacy status | Read model and legacy status | Canonical state, bootstrap legacy projection, pending, or parse error | Module scheduler truth selection. |
| P15-LB007 | P15 | `projectGateLegacyEvidenceIntoReadModel` | Gate type and completion/output/status state | Gate config, read model, output/status/completion | Approval wait sync, canonical output projection, or pending diagnostic projection | Gate scheduler truth selection; non-approval `gate-status.json` cannot advance scheduler/dependency/restart or rate-limit state. |
| P15-LB008 | P15 | `projectGateCompletionState` | Output invalid/fail/pass/missing vs gate-status status | Gate output and gate-status | Terminal completion from typed output or pending diagnostic outcome | Completion polling semantics; `gate-status.json` RATE_LIMITED remains diagnostic and never starts a domain cooldown. |
| P15-LB009 | P15 | `readBusterGateCompletion` | Output PASS vs all other states | Canonical output file | PASS only from output file | Buster resume authority. |
| P15-LB010 | P15 | `project*TruthDrift` | Drift lists from scheduler/adjudicator | Projection/adjudication output | Tagged drift report | Operator diagnostics. |
| P16-LB001 | P16 | `observeAcpMonitorSurfaces` | Gateway/transcript state still active vs restored | Monitor state each poll | Emit degraded/restored updates; break when both inactive | Bounded observability polling. |
| P16-LB002 | P16 | `appendStructuredEvent` | Missing log dir vs write success/failure | `projectLogDir(config)`, `resolvePipelineRunLogDir(config)`, fs result | Skip, append both mirrors, or return error | Disk mirror nonblocking behavior. |
| P16-LB003 | P16/RV-25 | `appendStructuredEventMirror` | Structured append failed/restored | Central observability health state | Emit degraded/restored only on central health transitions | Visibility of disk mirror health without a mirror-local map. |
| P16-LB004 | P16 | `checkBudgetThresholds` | Cost/tokens exceed configured thresholds | Aggregated usage and budget config | Warning/exceeded event objects | Budget semantics. |
| P16-LB005 | P16 | `buildTelemetrySinkInput` | ids/refs explicit vs derived | ctx, payload, options | Canonical sink input with refs/ids/event | Sink contract identity. |
| P16-LB006 | P16 | `validateTelemetrySinkInput` | Missing run/ref/event/timestamp | Sink input object | Error list or valid | Sink boundary validation. |
| P16-LB007 | P16 | `dispatchTelemetrySinks` | Registry missing/disabled/no listeners | Plugin registry/listeners | Degraded registry event and no listeners | Sink availability authority. |
| P16-LB008 | P16 | `dispatchTelemetrySinks` | Listener succeeds/fails | Sink observe result/error | Per-listener result; failure degraded once | Sink failure isolation. |
| P16-LB009 | P16 | `emitTelemetryStreamEvent` and `emitSystemIoWarning` | Disabled/missing identity/Redis unavailable/emit ok/fail; warning payload missing required local I/O fields; stream failure fallback | Config, env, Redis result, warning payload | Skipped, error result, Redis event, bare stderr fallback on stream failure, or helper `false` for invalid warning inputs | Redis stream nonblocking path; `system.io_warning` remains point-in-time and has no restored state; helper and stream path avoid `core/logger.js` to prevent recursion during logger failures. |
| P16-LB010 | P16 | `emitEvent` | Sink dispatch throws vs succeeds | Dispatch result/error | Report degraded then append disk event | Core telemetry spine resiliency. |
| P16-LB011 | P16 | `updateObservabilitySurface` | New degraded/restored/no-change | State active flag and current degradation | Emit only transition events | Suppresses duplicate observability events. |
| P17-LB001 | P17 | `adjudicateCompletionEvidence` | Redis terminal vs local terminal vs weak identity | Redis/status completion and expected identity | Conflict, local authority, Redis candidate/authority, or pending | Completion authority boundary. |
| P17-LB002 | P17 | `buildCompletionDrift` | Weak identity/status mismatch/Redis requires dispatch | Expected identity and projected completions | Drift entries | Operator diagnostics. |
| P17-LB003 | P17 | `waitForModuleBusterCompletion` | Redis completion event or fatal event resolves | Completion controller/adjudicator plus durable alert writer | conflict/rate_limited/timeout/pass/blocked/invalid/fatal mapped to poll result; fatal/timeout writes operator-alert JSONL | Active Buster module wait is event-driven and terminal alert evidence is local-first. |
| P17-LB004 | P17 | `pollGeneric` | Check result shape | `done`, `parse_error`, `rate_limited`, pending | Return terminal, parse threshold, rate-limit, or progress | Common loop semantics. |
| P17-LB005 | P17 | `pollForFile` | File exists before ACP terminal | Output path and ACP state | Success wins; otherwise session no-output/rate-limit/pending; no-output terminal transcript is sanitized before return | Gate output authority. |
| P17-LB006 | P17 | `pollStatus` | lifecycle status target/BLOCKED/RATE_LIMITED vs ACP terminal | lifecycle read model and ACP state | Terminal, rate-limit, auto-advance, crash/no changes, pending; no-change terminal transcript/detail is sanitized before return | Module status polling is lifecycle-backed. |
| P17-LB007 | P17 | `pollForSessionEnd` | HEAD moved vs session terminal vs timeout | HEAD hashes, ACP state, transcript state, durable alert writer | Session ended with changes/no changes, git error, rate-limit, timeout; final timeout writes operator-alert JSONL; returned transcript evidence is always redacted summary | ACP session completion. |
| P17-LB008 | P17 | `scanLatestCompletionFromTail` | Completion entry matching identity/source/outcome and Redis completion schema | Redis stream entries | Select latest, conflict, duplicate diagnostics, ignored diagnostics, or invalid-entry fail-closed diagnostics | Redis completion selection. |
| P17-LB009 | P17 | `archiveCompletionsChunked` | Active identity match | Redis stream entries | Preserve active entry, archive old matching entries | Prevent stale completions. |
| OI42-LB001 | OI-42 phase 1 | `pipeline-event-contract.js` wait matching | Event type is in requested set and event identity contains all requested identity fields | Normalized event type and identity map | Resolve wait with normalized event, otherwise keep listener active until abort/timeout | In-process event route now backs active Buster module/gate completion waits and is verified for abort/race/timeout cleanup. |
| OI42-LB002 | OI-42 phase 2/5 | `completion-event-adapters.js` Redis event mapping | XREAD returns stream entries whose `type` is absent or `completion` | Redis stream entry fields decoded through transport helper and Redis envelope normalizer | Emit `completion.evidence` with Redis id/entry payload and normalized module/gate identity | Keeps Redis wait mechanics at the edge; active controller owns adjudication; Phase 5 verifies dedicated-client blocking behavior. |
| OI42-LB003 | OI-42 phase 2 | `completion-event-adapters.js` local watcher mapping | fs.watch reports matching leaf filename or unknown filename | Watched output paths and nearest existing parent directories | Debounce changed paths and emit `local.evidence.updated` | Avoids deep `.swarm` watching and shields controller from duplicate filesystem events; Phase 5 verifies debounce and watcher cleanup. |
| OI42-LB004 | OI-42 phase 3/5 | `buster-completion-controller.js` event resolution | Event type is Redis completion, local evidence update, or fatal error | Pipeline event plus target/identity/local resolver inputs | Redis branch validates completion entry then calls `adjudicateCompletionEvidence`; fatal resolves error; local evidence resolves only via provided gate-output resolver | Enforces Redis-first race policy without a mandatory local filesystem catch-up wait for active module/gate waits; Phase 5 verifies stale-event, timeout, and wrapper behavior. |
| P18a-LB001 | P18a | `normalizeFailureClass` | Timeout/infra/validation/test/forge regex precedence | phase, reason, opts | Normalized failure class | Shared class semantics. |
| P18a-LB002 | P18a | `classifyMonitorFailureFact` | ACP monitor reason | `RATE_LIMITED`, `UNKNOWN_STALE_TIMEOUT`, `TRANSCRIPT_ERROR`, `SESSION_TERMINAL` | Retryable/nonretryable failure fact or null | Monitor failure authority. |
| P18a-LB003 | P18a | `classifyFailPattern` | Regex match order | Failure text | Pattern code or `unknown` | Operator guidance and retry summary. |
| P18a-LB004 | P18a | `classifyGitPushError` | Rejection/auth/network/sync patterns | Git error message | Git failure pattern | Git escalation classification. |
| P18a-LB005 | P18a | `classifyPreTestFailure` | Config patterns before infra patterns before code fallback | Redis pre-test verdict/reason | config/infra/code result | Actionable owner precedence. |
| P18a-LB006 | P18a | `injectNeedsNova` | Missing channel, gateway abort, gateway failure | channel/env, gateway error text | skipped, ok/ok_aborted, failed plus Discord alert | Nova escalation delivery semantics. |
| P18a-LB007 | P18a | `resolveAutoRetryThreshold` | Module/gate/project/config/default precedence | progress/config ids | Threshold value | Retry branch threshold. |
| P18a-LB008 | P18a | `handleFail` | `fail_count >= maxFails`, `canAutoRetry`, timeout | status, maxFails, threshold, isTimeout | BLOCKED, `_retry:true`, or Nova/TIMEOUT escalation | Terminal failure policy. |

## State mutations / merge behavior

| ID | Batch | File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- | --- | --- |
| P00a-LS001 | P00a | `skills/nova/pipeline/cli.ts main` | `flags` aliases | Parsed dashed flags | Copies dashed names to camelCase aliases | Later code uses camelCase convenience fields. |
| P00a-LS002 | P00a | `skills/nova/pipeline/cli.ts main` | `flags.project`, `flags.novaChannel` | CLI flags; env | CLI wins; env fills only absent values | Explicit operator input has precedence. |
| P00a-LS003 | P00a | `skills/nova/pipeline/cli.ts main` | `config._runtimeOverrides` | Runtime model/thinking flags | Set only if at least one override exists; missing side stored as `null` | Single override record for policy resolver. |
| P00a-LS004 | P00a | `skills/nova/pipeline/cli.ts main` | Context temp dir | `tempManager.dir`; context shape | Prefer `ctx.setTempDir`, else legacy `ctx._tmpDir` | Supports both context APIs. |
| P00a-LS005 | P00a | `skills/common/pipeline/cli-args.ts parseCliArgs` | Parser `values` object | Schema defaults and argv | Defaults first; parsed argv overwrites | Returned values include defaults and parsed inputs. |
| P00b-LS001 | P00b | Scoped P00b shim files | None found in scoped files | None | Static re-export only | Shims do not own mutable state. |
| P01-LS001 | P01 | `core/config.js loadConfig` | Config object | Platform config, project, repo root, progress | Spread swarm config first, then set project/repo/paths | Runtime config has canonical repo/project paths. |
| P01-LS002 | P01 | `core/config.js validateConfig` | Buster agent config | Existing config | Force `dispatch='redis'`; default `redis_js_path` if nullish | Buster dispatch normalized to Redis. |
| P01-LS003 | P01 | `core/config.ts validateConfig` | Config defaults and plugin fields | Missing fields, registry build | `??=` defaults; normalized plugin config replaces input; registry returns as explicit `pluginRegistry` | Startup config is normalized without runtime mirror backwrites. |
| P01-LS004 | P01 | `core/context.js PipelineContext.syncConfigRuntimeFields` | Config compatibility fields | Context runtime state | Bind run id/stats always; only copy registry/test/runtime overrides if config lacks them | ctx-first state remains legacy-compatible. |
| P01-LS005 | P01 | `core/context.js buildPluginInvocationEnvelope` | Read-only plugin input | Input, plugin context, extras | Capability-narrow base, add plugin info and extras, expose nested `input` | Immutable scoped plugin contract. |
| P01-LS006 | P01 | `core/logger.js log/createLogger.log` | `ctx.stats.errors` | ERROR entries | Append while length < 50 | Bounded stats errors list. |
| P01-LS007 | P01 | `core/runtime.js setRunState` / `bindRunContext` | Fallback run state and config run fields | runId/stats/context | Update live exports or config `_runId`/`run_id`/`_runStats` | Run identity projection is explicit. |
| P01-LS008 | P01 | `core/temp.js createTempManager` | Closure `_dir` | init/file/cleanup | init creates, file lazy-inits, cleanup removes but keeps last path | Temp manager owns scratch dir lifecycle. |
| P02-LS001 | P02 | `core/registry.js getBuiltinPluginDefinitions` | Returned definition objects | Frozen built-ins | Clone manifest arrays/config schema and implementation object | Callers cannot mutate source builtins. |
| P02-LS002 | P02 | `core/registry.js buildPluginRegistry` | Registry records | Definitions and normalized overrides | Override trust/config/enabled over manifest defaults; freeze record | Registry records are immutable. |
| P02-LS003 | P02 | `registry/validation.js resolveModuleConfig` | Resolved module config | Schema defaults and override config | Defaults first, override second | Returned config is schema-validated merged config. |
| P02-LS004 | P02 | `registry/indexes.js buildStageOwnerIndex` | `stageOwners` map | Enabled records and explicit selections | Explicit owner wins if valid; otherwise single candidate auto-selected | Decision stages have one owner or error. |
| P02-LS005 | P02 | `registry/indexes.js buildHookIndex` | `hookIndex` map | All records | Append records by hookFamily/stageId | Listener lookup sees all claimed records. |
| P02-LS006 | P02 | `services/adapter-registry.js buildRegistry` | Static alias map | Alias lists | Set normalized aliases to adapter; duplicates overwrite | Registry aliases resolve to static adapters. |
| P02-LS007 | P02 | `services/validation.js run*Validation` | Local failures array | Validation rules | Append deterministic failure objects | Return `{ passed, failures }`; no files mutated. |
| P03-LS001 | P03/RV-25 | `integrations/discord.js` | Central observability health map | Project/run/component/surface/reason/scope transitions | First degraded wins until central restored; Discord only supplies formatted detail/correlation | Health state is owned by `observability.js`, not Discord. |
| P03-LS002 | P03 | `integrations/discord.js` | Run stats `discord_notifications_sent` | Successful webhook delivery | Increment if stats available | Best-effort delivery count. |
| P03-LS003 | P03 | `git-worktree.ts gitSyncBeforeBuster` | Module status object | Commit hash/diff/Git sync | Set `forge_commit_hash`, `forge_diff_stat`, transition to `READY_FOR_TESTING` | Buster handoff records Forge commit. |
| P03-LS004 | P03 | `tools/redis.ts` | `_redis` singleton | Redis env/config | Lazy instantiate once; `disconnect` clears | Reuses Redis client per process. |
| P03-LS005 | P03 | `tools/redis.ts` | `_logCallback` | `setLogCallback(fn)` | Replace callback | Caller can mirror Redis ops. |
| P04-LS001 | P04 | Common `publishTranscriptDelta` | `_transcriptRateLimits` map | Agent label and new transcript lines | Reset 1s window; bundle excess or emit per line | At most 5 emitted transcript events/sec per label window. |
| P04-LS002 | P04 | Common `readAcpTranscriptState` | Transcript monitor state object | Previous state and appended file bytes | Preserve offsets/counters, reset on truncation, append parsed line effects | Incremental transcript state. |
| P04-LS003 | P04/OI-41 | Common `tracked-agents.js trackAgent` | `_trackedAgents` map | Label/session metadata/extra | Base fields then spread `extra` | Tracked entry stores telemetry/runtime metadata; lifecycle re-exports this facade for compatibility. |
| P04-LS004 | P04 | Common lifecycle active session | `_activeSession` and optional JSON file | Session data | Copy data then persist atomically to configured path | Active session recovery surface. |
| P04-LS005 | P04 | `shutdown.js _shutdownState` | Shutdown context | Register/set/clear/signal | Store config/statusDir/currentLabel; duplicate signal guard | Single in-flight graceful shutdown. |
| P04-LS006 | P04 | `shutdown.js performSignalShutdown` | Module status object | Current status file and signal | Transition non-PASS/BLOCKED status to FAIL with interrupted note | Interrupted module is terminalized. |
| P04-LS007 | P04 | `orchestration-healthcheck.js readTrackedTranscriptState` | Tracked entry `transcriptState` | Existing entry transcript state and stream path | ACP monitor state replaces entry field | Health checks reuse transcript offset. |
| P04-LS008 | P04 | `orchestration-healthcheck.js updateHealthCheckObservability` | Tracked entry `healthCheckObservability` | Issue/restoration | First issue marks active; success emits restore and deletes state | One degrade/restore cycle per active issue. |
| P05-LS001 | P05 | `module-worker-control-results.ts` | Typed worker metadata object | Config, worker input, result, opts | IDs/refs first, config/run fallback, result status/poll cloned | Metadata is serializable and source-attributed. |
| P05-LS002 | P05 | `module-workers.js` | Module stream-log status projection | `saveStreamLog` inputs | Save after final status/callback via `finally` | Status store records worker transcript path. |
| P05-LS003 | P05 | `module-workers.js` | Final Buster stream/session authority | Dispatch, Redis poll entry, status active agent | Confirm status active-agent identity before trusting; otherwise fallback | Avoids stale active session fields. |
| P05-LS004 | P05 | `orchestration.ts _redisDispatchModules` | Adapter cache | Registered adapter key | Cache unless adapter result has `cacheable:false` | Static Redis adapter loaded once per process. |
| P05-LS005 | P05 | `orchestration.ts trackAgent` call | Shared lifecycle tracked entry | Spawn result and opts | Base lifecycle fields plus telemetry module/gate/attempt/dispatch extras | Healthcheck/kill/shutdown can correlate sessions. |
| P05-LS006 | P05 | `orchestration.ts captureBaselineFiles` | Tracked entry `_baselineFiles` | `git diff --name-only HEAD` | Store Set only when cwd is Git worktree and entry exists | Kill telemetry can report changed files. |
| P05-LS007 | P05/OI-41 | `reviewer-lifecycle.js trackAgent` call | Shared tracked-agent registry through lifecycle facade | Reviewer spawn result and opts | Base lifecycle fields plus reviewer/gate telemetry extras | Reviewer kill/telemetry can correlate Echo session while the registry owner stays neutral. |
| P06-LS001 | P06 | `getPipelineRunnerDeps` | Dependency object | Defaults and invocation-scoped `pipelineRunner` deps | Defaults first, explicit verification DI second | Tests can replace runner dependencies only within the call scope. |
| P06-LS002 | P06 | `validatorRunState` | `config._validatorRunState` | Existing config cache/durable file | Initialize cache, normalize Set, load durable once | Scheduled validator completion cache. |
| P06-LS003 | P06 | `markScheduledValidatorComplete` | Completion Set and JSON file | Schedule key | Add key then atomic write sorted completion records | Resume idempotence. |
| P06-LS004 | P06 | `startPipelineRun` | `config._progress`, log dirs | Config/progress | Attach progress; derive `projectLogDir(config)`/`resolvePipelineRunLogDir(config)` if absent | Programmatic calls get run log dirs. |
| P06-LS005 | P06 | `maybeRunArchitectureValidation` | Arch validator runtime policy | Progress arch override/defaults plus platform fallback model | Resolve model/thinking through policy without mutating config role models | Progress supplies arch validator model/thinking before platform fallback. |
| P06-LS006 | P06 | `reconcileStaleModuleState` | Module status object | Monitor/kill/no-session recovery | Append event, transition, optional lifecycle intent, save | Stale state reset safely. |
| P06-LS007 | P06/RV-14 | `reconcileStaleGateSessions` | Gate active-session file | Monitor/canonical termination result | Append recovery event then remove file | Stale gate session cleared only after controller confirmation. |
| P06-LS008 | P06 | `finalizeTerminalHalt` | Lifecycle/summary/cost/generator artifacts | Typed step result | Normalize, correlate, append halt lifecycle, emit side effects | Terminal state projected once. |
| P07-LS001 | P07/RV-17 | `runModule` | None directly | Attempt result | Non-retry returns typed step result; retry wait consumes caller budget/signal | Attempt helper remains status authority. |
| P07-LS002 | P07 | Forge/Buster dispatch callbacks | `status.active_agent` | Worker dispatch result | Dispatch fields override fallbacks; save immediately | Recovery/shutdown can see live worker. |
| P07-LS003 | P07 | Worker finalize callbacks | `status.active_agent` | Finalized status/session | Reload status, clear active agent, save | Active-agent cleared after worker finalization. |
| P07-LS004 | P07 | `ensureValidationState` | `status.validation` | Current attempt | Reinitialize when missing or attempt changes | Validation milestones are per-attempt. |
| P07-LS005 | P07 | `markValidationPassed` | `status.validation` | milestone key | Set boolean and timestamp | Validator completion preserved in status. |
| P07-LS006 | P07 | `ensureModulePluginLogDirs` | `projectLogDir(config)`, `resolvePipelineRunLogDir(config)` | paths/run id | Fill missing fields and mkdir run dir | Plugin logs have run-scoped directory. |
| P07-LS007 | P07 | `buildModuleStepResult` | Module attempt terminal result | Typed step result or terminal module facts | Typed pass-through or typed step construction with correlation | Module output is typed step result. |
| P08-LS001 | P08 | `getModuleRunnerDeps` | Dependency object | Defaults and invocation-scoped `moduleRunner` deps | Defaults first, explicit verification DI second | Test seams override services only within the call scope. |
| P08-LS002 | P08 | `runModuleAttemptStateMachine` | Module status | Missing/PENDING/PASS/BLOCKED/phase-ready state | Init only when no status exists; existing status drives explicit terminal or phase routing | Keeps loaded-status routing visible before side-effect phases. |
| P08-LS003 | P08 | `dispatch.js` | `completionIdentity` | Run id, status attempt, generated id, worker dispatch | Worker may update dispatch/gateway later | Correlation flows through Buster attempt. |
| P08-LS004 | P08 | `dispatch.js` | Status phase fields | `startModulePhase` inputs | Lifecycle helper mutates phase/status fields then saves | Buster attempt marked TESTING. |
| P08-LS005 | P08 | `handleFailedPollResult` | Status on crash retry/block | Poll reason and retry budget | READY_FOR_TESTING for retry; BLOCKED on exhaustion | Forge output preserved for infra crash. |
| P08-LS006 | P08 | `terminal-failure.js` | Status on infra/config/pre-test outcomes | Redis source/classification | READY_FOR_TESTING, BLOCKED, or handleFail mutation | Separates infra/operator/code failure authority. |
| P08-LS007 | P08 | `terminal-pass.js` | Status terminal fields/cost | Completed time and prior timestamps | Finalize terminal state then compute durations | PASS status persisted before telemetry. |
| P08-LS008 | P08 | `terminal-results.js` | Result envelope | Fail/status/result fields | Correlation helpers fill ids from explicit result/status | Outer runner can project typed step result. |
| P09-LS001 | P09 | `ensureGatePluginLogDirs` | `projectLogDir(config)`, `resolvePipelineRunLogDir(config)` | `paths.swarm_dir` and run id | Fill missing fields, mkdir run dir | Plugin logs have run-scoped directory. |
| P09-LS002 | P09 | `buildGateRunInput` | Gate input object | Gate config/status/lifecycle/completion reads | Config copy plus existing artifact refs and state snapshot | Plugin receives deterministic structured envelope. |
| P09-LS003 | P09 | gate step result construction | Typed gate control result | Gate id/type/correlation | Typed pipeline step result | Legacy gate compatibility projection finalization was deleted. |
| P09-LS004 | P09 | `runRemediableGateControlLoopResult` | Loop control result | Fix outcome | Terminal returns, retry bumps cycle, re-evaluate replaces control result | Loop ends on non-remediation control result. |
| P09-LS005 | P09 | `persistGateActiveSession` | Gate active-session JSON | Tracked entry and extra fields | Extra/run entry fallbacks; writes atomically | Recovery evidence persisted after spawn. |
| P09-LS006 | P09 | `buildGateActiveSessionRecoveryPolicy` | Recovery policy object | Lifecycle/file/tracked evidence | Lifecycle strong identity outranks file/tracked; conflicts recorded | File/tracked never authoritative. |
| P09-LS007 | P09/RV-14 | `finishGateForgeFixCycleScaffold` | Transcript artifact/active-session file | Stream path and canonical termination boolean from `killAgent` | Copy if source exists; clear only when termination confirms true | Fix session cleanup evidence. |
| P10-LS001 | P10 | `buildReviewGateControlResult` | Typed control metadata | Compatibility result and opts | Result fields first, rate-limit fallback, opts attempt fallback | Review metadata has correlation/attempt fields. |
| P10-LS002 | P10 | `buildReviewRequestFixControlResult` | Remediation request diagnostics | Review result/remediation opts | Explicit opts correlation first, result correlation fallback | Fix loop receives issues and last review. |
| P10-LS003 | P10 | `cleanupReviewFiles` | Review output files and Git commit | Reviewer labels and merged output path | Delete reviewer outputs/merged output then `git add -A`/commit | Worktree clean before re-review. |
| P10-LS004 | P10 | `runReviewGateOnce` | Gate active-session JSON | Tracked Echo agent | Clear stale file before spawn; persist after spawn; clear only if kill succeeds | Recovery evidence tracks live Echo. |
| P10-LS005 | P10 | `runReviewGateOnce` | Review output artifact | Echo output from `reviewGateOutputPath` and merged output from `gateOutputPath` | Archive previous, delete before spawn, copy reviewer output to merged gate output | Gate output mirrors reviewer JSON. |
| OI39-L001 | OI-39 | `resolveSwarmArtifactPath` | Unsafe or missing swarm-relative artifact input | Raw gate/review/instruction path | Reject empty/non-string/null-byte/absolute/parent-escape paths; otherwise resolve under `swarmRoot(config)` | Prevents each runner/service from reimplementing path-boundary checks. |
| OI39-L002 | OI-39 | `approvalGateArtifactPaths` / `approvalGateArtifactRefPaths` | Approval artifact reference construction | `projectLogDir(config)`, `gateId`, `repo_root` | Build concrete write paths once, derive portable operator/governance refs from the same paths | Keeps approval request/decision/transition write paths and summaries aligned. |
| OI39-L003 | OI-39 | `redisLogArtifactTargets` | Missing log dirs or invalid file name | `projectLogDir(config)`, `resolvePipelineRunLogDir(config)`, file name | Return zero, one, or two append targets; reject nested/absolute file names | Keeps project/run Redis JSONL mirrors consistent. |
| P10-LS006 | P10 | `buildReviewRemediationExhaustedControlResult` | Run stats/telemetry | Remediation spec and control metadata | Remediation diagnostics first, metadata fallback | Exhausted fix loop preserves latest correlation. |
| P11-LS001 | P11 | `applyTrackedBusterGateIdentity` | `completionIdentity` | Generated identity and tracked agent | Tracked dispatch/gateway/session override generated fallback | Poll identity matches spawned agent. |
| P11-LS002 | P11 | `syncBusterGateRateLimitStatusOptions` | Rate-limit status options | Updated completion identity | Dispatch/gateway/session fallbacks copied from identity | Cooldown telemetry preserves correlation. |
| P11-LS003 | P11 | `_runBusterGateOnce` | Gate active-session JSON | Tracked Buster agent | Persist after spawn; clear only when kill succeeds | Restart recovery can find live Buster. |
| P11-LS004 | P11 | `buildBusterGateControlResult` | Typed control metadata | Compatibility result/config/gate/opts | Result fields first, rate-limit fallback, opts attempt fallback | Control result carries Buster failure class and correlation. |
| P11-LS005 | P11 | `buildBusterRequestFixControlResult` | Remediation diagnostics | Result status/issues/opts | Opt correlation first, status correlation fallback | Fix cycle receives issues and previous dispatch identity. |
| P11-LS006 | P11 | `patchBusterRemediationControlResult` | Cloned remediation control result | New correlation/diagnostics/metadata | Deep clone then shallow merge typed remediation subobjects | Next control result preserves updated fix correlation. |
| P11-LS007 | P11 | `handleBusterGateEvaluationResult` | PASS status/output artifacts | Poll result/gate config | Write `gate-status.json`; write output file only if missing | PASS persistence is best-effort. |
| P12-LS001 | P12 | `normalizeApprovalGateState` | State identity/policy fields | State and identity fallback | Existing state first, identity fills missing; timeout policy normalized | State has canonical gate/project/type/policy. |
| P12-LS002 | P12 | `saveApprovalGateState` | Gate-status JSON | State plus config identity | Normalize, set `updated_at`, write tmp then rename | Atomic persisted approval evidence. |
| P12-LS003 | P12 | `runApprovalGateEvaluation` | Fresh pending state | Gate/config timeout and identity | Gate timeout overrides config/default; run/project from config | PENDING_APPROVAL state synchronized to wait lifecycle. |
| P12-LS004 | P12/RV-16 | `resolveObservedApprovalState` | Terminal decision state after `approval.signal` | Current persisted state | Sync wait lifecycle, append transition, write decision | Terminal operator evidence persisted. |
| P12-LS005 | P12/RV-16 | `resolveObservedApprovalState` | Timed-out state after deadline-bound EventBus wait | Pending state and timeout policy | Copy state, set TIMED_OUT/resolved_at/decision_via/continued/reason | Timeout decision evidence persisted. |
| P12-LS006 | P12 | `writeApprovalRequest` | Request JSON/Markdown | Normalized pending state | State identity plus gate title/project | Operator-facing request artifacts. |
| P13-LS001 | P13 | `buildTypedGateControlResult` | Control result object | Builder args | Required typed gate node plus optional wait clone | v1 typed gate schema. |
| P13-LS002 | P13 | `buildPipelineStepResult` | Step result object | Diagnostics/control/remediation/wait | Explicit diagnostics first, control fallback; terminal exit derived from typed outcome | v1 typed step schema. |
| P13-LS003 | P13 | `validatePipelineStepResult` | Step result object | Schema/action/outcome/terminal fields | Validation errors or accepted typed result | Typed step authority is schema/action/outcome only. |
| P13-LS004 | P13 | `buildModuleValidatorControlResult` | Validator control metadata/findings | Result/config/opts | Result fields, opts fallback, run id fallback; lint/failure findings merged | Typed validator result. |
| P13-LS005 | P13 | typed worker result builders | Worker control result | Explicit worker action/issue/outcome metadata | Typed worker control result | Worker compatibility projections were deleted. |
| P13-LS006 | P13 | `buildGeneratorResult` / `normalizeGeneratorResult` | Generator result object | Producer, outputs, artifacts, diagnostics | Falsey artifacts filtered by builder; validator requires v1 generator kind, non-empty producer type, object outputs, valid artifact refs, and object diagnostics | v1 generator result shape; no fallback accepted. |
| P14-LS001 | P14 | `initLogDir` | Log dir fields and lifecycle store | Config/context | Create global/run dirs; set config/context streams; reset lifecycle store | Fresh run starts with empty read models. |
| P14-LS002 | P14 | `saveStatus` | Lifecycle event log and read-model projections | Status with pending mutation | Peek guard, consume mutation, append lifecycle, sync read models | Guarded fields only change with lifecycle event. |
| P14-LS003 | P14 | `appendLifecycleEvent` | Events cache/JSONL and read models | Proposal refs/data | Dedupe first, legality check, clone event, append, project, save | Event log and read model advance together. |
| P14-LS004 | P14 | `saveLifecycleReadModels` | Read-model cache/file | Read models | Add new `generated_at`, clone cache, atomic JSON write | Durable v1 read model. |
| P14-LS005 | P14 | `applyWaitEventToReadModels` | waits/gates maps | wait event and existing entries | Existing identity preserved, event data fills current state; close updates terminal fields | Gate wait projection mirrors wait lifecycle. |
| P14-LS006 | P14 | `applyResumeSignalToReadModels` | signals/waits/gates maps | signal event | Signal record written, wait latest signal updated, gate derived status updated | Signal can resolve approval semantics. |
| P14-LS007 | P14 | `applyCooldownEventToReadModels` | cooldown maps | cooldown event | Started opens entry; completed preserves prior identity and closes | Cooldown state is explicit open/closed. |
| P14-LS008 | P14 | `applyLifecycleEventToReadModels` | module map/progression | module event | Existing module entry merged; event type owns status/phase/timestamps | Progression counts recomputed after every event. |
| P14-LS009 | P14 | `readJsonIfPresent`/`writeJsonAtomic` | JSON files | File path/value | Missing returns fallback; write tmp then rename | Simple atomic persistence. |
| P15-LS001 | P15 | `buildActiveSessionConfirmation` | Confirmation object | Expected/observed identity | Required fields missing/mismatched first; optional gateway mismatch separate | Strong identity requires run/attempt/dispatch/session. |
| P15-LS003 | P15 | `getAuthoritativeModuleState` | Projection object | Canonical read model plus optional explicit diagnostic evidence | Canonical lifecycle read model wins; absent lifecycle yields pending/no authority | Scheduler never reads or trusts local module status files. |
| P15-LS004 | P15 | `projectGateLegacyEvidenceIntoReadModel` | Gate projection object | Read model/output/status/completion/approval state | Approval state special-case; canonical read model then output/completion diagnostics | Gate source/authority roles explicit. |
| P15-LS005 | P15 | `syncApprovalWaitState` | Lifecycle wait/signal event log | Approval state/status | Pending opens wait; approved/rejected/cancelled/timed out closes wait and appends signal | Approval state projected to lifecycle. |
| P15-LS006 | P15 | `projectModuleTruthDrift` / `projectGateTruthDrift` | Drift report object | Scheduler projection and Redis adjudication | Concatenate tagged drift arrays, include artifact refs | Report-only, no authority mutation. |
| P16-LS001 | P16 | `recordUsageSnapshot` | `usage-snapshots.jsonl` | Agent/module/gate/cost fields | Include optional identity fields only when present | One JSON line per usage snapshot. |
| P16-LS002 | P16 | `aggregateUsage` | Aggregate object | Snapshot JSONL | Sum run, by_module, by_gate, by_agent; partial ORs | Usage aggregate shape. |
| P16-LS003 | P16 | `writeCostReport` | Cost report JSON | Aggregate and thresholds | Availability full/partial/tokens_only/unavailable by cost/token fields | Operator-readable cost report. |
| P16-LS004 | P16 | `dispatchTelemetrySinks` | `telemetrySinkState` object | Sink plugin side effects | Shared hidden object accumulates Redis result/event/key | Later sinks/dispatch can inspect stream metadata. |
| P16-LS005 | P16 | `emitEvent` | Disk telemetry event | Sink result and original payload | Prefer Redis sanitized event when present; otherwise source/emitter-enriched original payload | Disk event mirrors stream identity when stream succeeded. |
| P16-LS006 | P16 | `onAgentKilled` | `ctx.stats` token counters | Agent kill metadata | Add input/output tokens to existing counters | Module summary token accumulation. |
| P16-LS007 | P16 | `updateObservabilitySurface` | Caller observability state | Degraded/restored spec and identity data | Set active/degradedAt on degrade; clear on restore | One open degradation interval per state object. |
| P17-LS001 | P17 | `pollResult` | Poll result object | ok/reason/status/extra | Shallow merge extra over base fields | Common poll result shape. |
| P17-LS002 | P17 | `pollStatus` | Module status object/file | ACP rate limit or terminal HEAD move | Rate-limit enriches status then transition; HEAD move auto-advances READY_FOR_TESTING and saves | Guarded status lifecycle path used. |
| P17-LS003 | P17 | `pollForSessionEnd` | Local repo and transcript artifact | HEAD/session state | Add/commit local changes defensively after completion; mirror subagent transcript redacted | Session output preservation. |
| P17-LS004 | P17 | `updateAcpPollObservability` | Observability state | ACP state and identity | Gateway/transcript states update independently | Degraded/restored dedupe owned by telemetry. |
| P17-LS005 | P17 | `archiveCompletionsChunked` | Redis active/archive streams | Stream entries and active identity | XADD old matching entries to archive, XDEL originals, XTRIM archive | Active completion preserved. |
| P17-LS006 | P17 | `attach*Diagnostics` | Redis completion entry object | matched/ignored entries | Add duplicate/ignored diagnostic fields without changing base status | Diagnostics are non-authority additions. |
| P18a-LS001 | P18a | `buildFailureFact` | Failure fact object | layer/code/source/retryable/detail/rest | Defaults then detail then rest fields | Normalized fact shape. |
| P18a-LS002 | P18a | `extractPreTestFailReason` | Reason string | Redis entry verdict/reason | Base reason plus up to failed suite summaries | Forge-actionable pre-test reason. |
| P18a-LS003 | P18a | `injectNeedsNova` | Injection log entry | Result/correlation/artifact bundle | Build skipped entry then mutate status to ok/ok_aborted/failed | Log entry always appended in finally. |
| P18a-LS004 | P18a | `handleFail` | Module status object/file | Failure reason/options | Increment fail_count, append fail summary, transition status, save | Status reflects current failure outcome. |
| P18a-LS005 | P18a | `handleFail` | Runtime stats | Terminal branch | Push module id to blocked or failed arrays when stats exist | Aggregate failure stats. |
| P18a-LS006 | P18a | `buildNovaEscalation` | Escalation result object | Status/fail summaries/options | Correlation from opts/status, fail history normalized | Exit 10/30 payload with resume command. |

## Loops / polling / timeout mechanics

| ID | Batch | File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- | --- | --- |
| P00a-LL001 | P00a | None found in scoped files | None | None | None | None |
| P00b-LL001 | P00b | None found in scoped files | None | None | None | None |
| P01-LL001 | P01 | `core/config.js validateConfig` | Iterate required fields, agents, top-level config keys, gates, Redis paths | None | None | Completes validation then throws once if errors exist. |
| P01-LL002 | P01 | `core/platform-config.js discoverSwarmConfigPath` | Iterate normalized candidates until existing file | None | None | Return first existing candidate; if none, first candidate. |
| P01-LL003 | P01 | `core/policy.js resolvePolicy` | Iterate model then thinking candidates | None | None | Stop at first non-empty candidate; skip thinking loop on unsupported dispatch. |
| P01-LL004 | P01 | `core/logger.js writeEntry` | Iterate log targets | Failed mkdir/append emits `system.io_warning` | None | Best-effort append each target; per-target errors remain non-terminal but are surfaced through logger-independent warning telemetry. |
| P02-LL001 | P02 | `core/registry.js buildPluginRegistry` | Iterate built-in modules, normalized config keys, discovered definitions | None | None | Completes checks; may throw after registry assembly. |
| P02-LL002 | P02 | `core/registry.js resolveHookListeners` | Sort enabled listener records | None | None | Priority/moduleId deterministic order. |
| P02-LL003 | P02 | `registry/config-normalization.js` | Iterate plugin config maps/arrays | None | None | Converts valid entries and records errors for invalid ones. |
| P02-LL004 | P02 | `registry/indexes.js` | Iterate records/stages/gate types | None | None | Build indexes and errors in one pass per index type. |
| P02-LL005 | P02 | `registry/validation.js validateJsonSchemaValue` | Recursive object/array schema traversal | None | None | Exhaustive traversal for supported schema subset. |
| P02-LL006 | P02 | `services/dependencies.js checkDependencies` | Iterate `mod.depends_on` in order | None | None | Returns at first unmet dependency; returns met when all pass. |
| P02-LL007 | P02 | `services/validation.js parseDockerfileCopies` | Iterate Dockerfile lines | None | None | Collect COPY pairs; no shell execution. |
| P03-LL001 | P03 | `git-worktree.ts tryAutoResolveRebaseForRuntimeState` | While Git rebase dirs exist | None | None | Break when no rebase dirs; classify Git `--name-only` relative conflicts via `isRuntimeStatePath`; throw on non-runtime/new conflict. |
| P03-LL002 | P03/RV-17 | `git-worktree.ts gitPushWithRetry` | `attempt <= maxRetries` | `sleep(delayMs, { budget, signal })`, default 5000 ms | Git push timeout 60000 ms per attempt; optional caller budget/signal interrupts between attempts | Return on success; throw on final failure, caller abort, or budget exhaustion. |
| P03-LL003 | P03 | `services/redis-log.js appendRedisArtifactRecord` | Iterate log targets | None | None | Return `ok:false` if any target failed. |
| P03-LL005 | P03 | `tools/redis.ts publishTask` (`sendTask` compatibility alias) | Wait once for Redis `ready` when not ready, then publish via TaskQueue | Redis client retryStrategy min(times*50,2000) | `maxRetriesPerRequest=3` | Continue after ready event; Redis/TaskQueue errors reject caller. |
| P03-LL006 | P03/RV-17 | Common gateway invoke | `attempt <= maxRetries` | `sleep(retryDelayMs, { budget, signal })`, default 5000 ms | Per-attempt AbortController timeout default 30000 ms, capped by optional caller budget; caller signal is bridged to fetch | Return parsed/raw response; throw non-network/final error, caller abort, or budget exhaustion. |
| P04-LL001 | P04/RV-11 | Common `waitForSessionIdle` | Shared budget has remaining time | `waitForAny(acp.session.state/acp.transcript.delta)` with budget-bound timeout | `totalTimeoutMs`; inactive grace is an event wait timeout | Return on terminal/unreachable inactive/inactive grace; timeout logs and proceeds; no caller-owned ACP polling loop. |
| P04-LL002 | P04 | Common lifecycle `waitForSessionStop` | `Date.now() <= deadline` | `sleep(min(confirmPollMs, remaining))` | `confirmTimeoutMs` | Confirm stopped state or return last unconfirmed state. |
| P04-LL003 | P04/RV-17 | Common lifecycle `spawnSession` | `attempt <= maxRetries` | `sleep(retryDelayMs, { budget, signal })` between failures | Gateway spawn timeout 30000 ms per attempt, bounded by optional caller budget/signal | Return accepted session; throw after attempts, caller abort, or budget exhaustion. |
| P04-LL004 | P04 | `shutdown.js reaperAfterKill` | Victim list iteration | Initial 2000 ms wait; 1000 ms between SIGTERM/SIGKILL | No explicit deadline beyond waits | Signals victims and returns; errors swallowed/logged. |
| P04-LL005 | P04 | `shutdown.js collectDescendants` | Recursive children traversal | None | None | Stops when descendant already seen. |
| P04-LL006 | P04 | `shutdown.js performSignalShutdown` | Iterate `listTrackedAgents()` | Await each stop sequentially | Kill/confirm timings delegated to lifecycle | Continues after per-session failures. |
| P04-LL007 | P04 | `orchestration-healthcheck.js verifyAgentAlive` | Single health check | Initial `sleep(waitMs)`, default 8000 ms | Gateway call timeout 10000 ms | Return boolean; no retry loop. |
| P05-LL001 | P05 | `module-workers.js runModuleForgeWorker` | Polling delegated to `pollWithRateLimitRecovery` | Delegated | `timeoutMinutes` input | Finally kills and returns/propagates after poll. |
| P05-LL002 | P05 | `module-workers.js runModuleBusterWorker` | Completion wait delegated through `pollDualWithRateLimitRecovery` to event-driven Buster wait | Delegated | `timeoutMinutes` input | Finally kills and returns/propagates after wait. |
| P05-LL003 | P05 | `orchestration.ts captureBaselineFiles/computeFilesChanged` | Git command once each | None | Git timeout 5000 ms | Debug log and continue on errors. |
| P05-LL004 | P05/RV-14 | `orchestration.ts killAcpAgent`; `reviewer-lifecycle.js killReviewerAgent` | Idle wait then controller termination | `waitForSessionIdle`, `terminateSession` | Controller grace cap from P04 | Return boolean based solely on canonical `confirmed`. |
| P06-LL001 | P06 | `runPipelineStateMachine` | `while (true)` | Scheduler/validator callbacks and step runners delegated | None locally | Return on done, blocked, or non-continuing step. |
| P06-LL002 | P06 | `acquirePipelineRunLock` | `while (true)` until exclusive create, expired lease reclaim, or fail-closed error | Lease heartbeat timer after create | Timer stopped by release or self-expiry/owner-loss/failure | Return on create; throw active/malformed/non-lease/unreclaimable lock after durable CRITICAL alert. |
| P06-LL003 | P06 | `reconcileStaleModuleState` | Iterate progress modules | KillSession polling delegated | Stop confirm timeout default 15000 ms, poll 2000 ms | Continue or throw on unconfirmed active session. |
| P06-LL004 | P06 | `reconcileStaleGateSessions` | Iterate progress gates | KillSession polling delegated | Stop confirm timeout default 15000 ms, poll 2000 ms | Continue or throw on unconfirmed active session. |
| P06-LL005 | P06 | Scheduled validator completion load | Load once per config cache | None | None | `durableLoaded` prevents repeated disk reads. |
| P07-LL001 | P07/RV-17 | `runModule` | `while (true)` retry loop | `deps.sleep(5000, { budget, signal })` between retries | Retry budget delegated to attempt/handleFail plus caller budget/signal for wait preemption | Breaks on non-retry attempt; abort/budget errors propagate upward immediately. |
| P07-LL002 | P07 | Forge/Buster worker execution | No local poll loop | Worker helpers downstream poll | Deadline encoded as `timeoutMinutes * 60 * 1000` | Worker result returned by plugin/default worker. |
| P07-LL003 | P07 | Pre-Buster validators | Sequential delivery lint then pre-check | None | None local | Stop on block/retry/error; continue only after pass markers. |
| P08-LL001 | P08 | `runModuleBusterPhase` | `for busterAttempt <= maxBusterCrashRetries + 1` | None locally | Crash retry budget from module/config default 2 | Return terminal, continue on crash retry, break unexpected. |
| P08-LL002 | P08 | `runModuleAttemptStateMachine` | No local loop | Retry loop belongs to public runner | Timeout passed to phase helpers | Returns terminal/retry envelope. |
| P08-LL003 | P08 | Worker/polling | Delegated to worker backend | Delegated | `timeout` propagated to worker/poll handlers | Worker result drives handlers. |
| P09-LL001 | P09 | `runRemediableGateControlLoopResult` | While control result is remediation request | None locally | Cycle bounds from remediation policy | Terminal, exhausted, non-remediation result. |
| P09-LL002 | P09 | `runGateForgeFixCycle` | Single fix cycle invocation | None locally | Rate-limit max fallback from config, timeout passed to scaffold | Returns retry/terminal/re-evaluate mode. |
| P09-LL003 | P09/RV-14 | `finishGateForgeFixCycleScaffold` | Polling delegated to `deps.pollForSessionEnd`; termination delegated to `deps.killAgent` | Delegated | `timeoutMinutes` input plus termination controller grace | Returns session result then terminates agent through canonical controller path. |
| P09-LL004 | P09 | `runWaitableGateControlLoopResult` | One wait resolution | Wait controller owns sleep/backoff | Wait controller owns timeout | Returns normalized resolved control result. |
| P10-LL001 | P10 | `runReviewGateOnce` | Poll for output file via `pollForFile` | Polling service owns sleep | `reviewConfig.timeout` | Returns when file appears, timeout/error/rate-limit. |
| P10-LL002 | P10 | `withSessionRateLimitRecovery` review wrapper | Rate-limit pause recovery | Rate-limit service sleep | `config.rate_limit.max_pauses_per_module` default 5 | Returns exhausted result after pause budget. |
| P10-LL003 | P10 | `runReviewGateStage` / review adapter | One evaluation returns typed control result; remediation controller supplied to generic route | Generic GateRunner/remediable engine | `reviewConfig.maxFixCycles`/default max fails | Registry path uses stage evaluation plus adapter; no direct review scheduler helper remains. |
| P10-LL004 | P10 | `performReviewGateFixAttempt` | One fix cycle | Generic gate Forge fix cycle | `reviewConfig.timeout`/default timeout | Returns terminal/retry/re-evaluate mode. |
| P11-LL001 | P11 | `_runBusterGateOnce` | Event-driven `waitBusterGateCompletionEvidence` call | Redis/local adapters and controller wait | `timeout` from gate/config | Break on mapped completion evidence, rate-limit, timeout, or fatal adapter result. |
| P11-LL002 | P11 | `runBusterGateEvaluation` | Rate-limit wrapper around one attempt | Rate-limit service sleep/resume | `max_pauses_per_module` default 5 | Exhaustion returns rate-limit result; attempt count unchanged. |
| P11-LL003 | P11 | `runBusterGateStage` / Buster adapter | One evaluation returns typed control result; remediation controller supplied to generic route | Generic GateRunner/remediable engine | `max_fix_cycles`/default max fails | Registry path uses stage evaluation plus adapter; no direct Buster scheduler helper remains. |
| P11-LL004 | P11 | `performBusterGateFixAttempt` | One Forge fix cycle | Generic gate fix cycle | Gate timeout/default timeout | Returns retry/re-evaluate/terminal mode. |
| P12-LL001 | P12/RV-16 | `waitForApprovalSignalFlow` | Wait until `approval.signal`/`fatal.error` or current deadline timeout | `waitForAny(eventBus, ['approval.signal', 'fatal.error'])`; adapter emits pending/terminal changes | State `deadline` reloaded after each signal; no runner sleep or poll interval exists | Approved/rejected/cancelled/invalid/timeout. |
| P12-LL002 | P12 | `runApprovalGateStage` / approval adapter | No scheduler-level wait loop in registry stage | Returns WAIT for core-owned wait handling | Fresh deadline = now + timeout minutes | Registry path uses stage evaluation plus waitable adapter; existing terminal/pending routes return immediately. |
| P12-LL003 | P12/RV-16 | `waitForApprovalGateSignal` | Delegates wait to EventBus signal flow | Internal EventBus plus filesystem edge adapter | State timeout policy/deadline | Returns resolved control result; deterministic adapter stop in `finally`. |
| P13-LL001 | P13 | P13 scoped files | None found in scoped files | None found in scoped files | None found in scoped files | Contract helpers are synchronous builders/validators. |
| P14-LL001 | P14 | P14 scoped files | None found in scoped files | None found in scoped files | None found in scoped files | Lifecycle helpers are synchronous append/read/project helpers. |
| P15-LL001 | P15 | P15 scoped files | None found in scoped files | None found in scoped files | None found in scoped files | Compatibility helpers are synchronous projection/adjudication helpers. |
| P16-LL001 | P16 | `observeAcpMonitorSurfaces` | `poll < maxPolls` | `sleep(pollMs)` when pollMs > 0 and more polls remain | No absolute deadline; `maxPolls` default 3, `pollMs` default 250 | Both gateway/transcript inactive or max polls reached. |
| P16-LL002 | P16 | `dispatchTelemetrySinks` | Iterate enabled listeners | No sleep/backoff | None | All listeners attempted; failures isolated. |
| P16-LL003 | P16 | `aggregateUsage` | Iterate snapshot lines | No sleep/backoff | None | End of file. |
| P16-LL004 | P16 | `emitBudgetWarnings` | Iterate warning array | No sleep/backoff | None | All warnings attempted in one try. |
| P17-LL001 | P17/RV-23 | `pollGeneric` | Shared budget has remaining time | `sleep(config.poll_interval_seconds*1000, { budget })` after first cycle | `createBudgetFromMinutes(timeoutMinutes)` unless caller supplies parent budget | `done`, parse threshold 10, rate limit, git error, timeout with `BudgetExhaustedError`; no internal extensions. |
| P17-LL002 | P17/RV-11/RV-23 | `pollForSessionEnd` | Shared budget has remaining time | `waitForAny(acp.session.state/acp.transcript.delta/fatal.error)` with bounded housekeeping timeout; ACP adapter sleeps with budget | `createBudgetFromMinutes(timeoutMinutes)` unless caller supplies parent budget | HEAD grace, session end grace, rate-limit exhaustion, git error, timeout with `BudgetExhaustedError`; transcript/internal activity does not extend the budget. |
| P17-LL003 | P17 | `pollForSessionEnd` | Timeout nudge threshold | No retry; one gateway send attempt | `percentElapsed >= session_nudge_threshold` | Nudge sent once unless session already detected ended; nudge send failure writes durable operator-alert JSONL and polling continues. |
| P17-LL004 | P17 | `scanLatestCompletionFromTail` | `scanned < scanLimit` | Redis call pacing only | `batchSize` default 100, `scanLimit` default 1000 | Empty/short batch, match return without identity, scan limit/truncated. |
| P17-LL005 | P17 | `archiveCompletionsChunked` | `while true` Redis XRANGE batches | Redis transaction only | `batchSize` default 100; archive trim `maxLen` default caller | Empty/short batch then optional XTRIM. |
| P17-LL006 | P17 | `maybeEmitAcpPollProgress` | Interval gate | None | default interval 30000 ms | Returns prior timestamp until interval elapsed. |
| OI42-LL001 | OI-42/RV-11/RV-23 | `waitForEvent` / `waitForAny` | No active loop; EventEmitter listener plus optional timer | None | caller `timeoutMs` bounded by optional `budget.remainingMs()`; mandatory `AbortSignal` | Listener and timer are removed on match, timeout, abort, or `BudgetExhaustedError`. Completion and ACP adapter phases connect teardown to the same abort path. |
| OI42-LL002 | OI-42 phase 2 | Redis completion adapter loop | `while (!signal.aborted)` around blocking XREAD | Redis blocks, no sleep | `blockMs` default `0`; abort disconnects client | Emits completion events until stopped. |
| OI42-LL003 | OI-42 phase 2 | Local evidence adapter debounce | fs.watch callback schedules timer | `setTimeout(emitChanged, debounceMs)` | debounce default 100 ms | Stop clears timer and closes watchers. |
| OI42-LL004 | OI-42 phase 3/5/RV-23 | `waitForBusterCompletion` | Wait for completion/local/fatal events until terminal controller result | EventBus wait, optional local status/resolver | caller `timeoutMs` bounded by optional shared budget; mandatory `AbortSignal` | Pending local/module evidence loops back to wait for next event; Redis terminal evidence resolves immediately; budget exhaustion is loud and trackable. |
| P18a-LL001 | P18a | `buildPreTestDiscordFields` | Iterate pre-test suites | None | None | All suites classified into passed/failed/skipped field groups. |
| P18a-LL002 | P18a | `extractPreTestFailReason` | Iterate failed suites | None | None | Up to available failed suites summarized. |
| P18a-LL003 | P18a | `handleFail` | None | None | None | Branches directly to blocked, retry, or escalation. |
| P18b-L001 | P18b/RV-23 | `handleSessionRateLimit` | Append lifecycle event only when `module_id` or `gate_id` exists; optionally suppress telemetry/Discord; extend budget only when supplied | `status`, `options.suppressPausePresentation`, `options.budget` | Explicitly authorized rate-limit cooldown extension (`cooldownMs + buffer`) then budget-aware cooldown sleep and resume path | Prevents duplicate presentation, preserves durable cooldown for owned steps, and keeps domain cooldowns from consuming healthy pipeline budget. |
| P18b-L002 | P18b/RV-24 | `withSessionRateLimitRecovery` | Loop until poll result is not `reason:'rate_limited'`; exhaust when incremented count exceeds cap | Poll result, pause state, config max | Return non-rate-limited result or finalizer-owned terminal exhausted result | Generic ACP rate-limit recovery algorithm; terminal evidence is not caller-optional. |
| P18b-L003 | P18b | `syncModuleRateLimitResume` | Resume only if fresh persisted status is `RATE_LIMITED`; forge resumes to `IN_PROGRESS`, otherwise `TESTING` | Raw status/current phase | Status transition/save plus telemetry | Avoids overwriting newer non-paused status. |
| P18b-L004 | P18b | `resumeDurableCooldownForStep` | If lifecycle cooldown is open and has future `resume_at`, sleep remaining time then append completion | Lifecycle read model | Durable cooldown replay | Allows restart-safe rate-limit pauses. |
| P18b-L005 | P18b | Status builders | Correlation precedence: status/resolver values over tracked correlation, then caller fallbacks; tracked factories remember dispatch/gateway | Status and fallback options | Normalized `RATE_LIMITED` status/result and summary Discord fields | Defines correlation authority consistently for module, gate, and summary rate-limit paths. |
| P18b-L006 | P18b/RV-24 | `finalizeSessionRateLimitExhaustion` | Build exit result, append durable local operator alert, then run guarded hooks (`beforeReturn`, retry telemetry, summary telemetry, Discord) and log | Config plus hook options | Terminal side effects in fixed local-first order; hook failures append delivery-failure alerts and do not throw past finalizer | Centralizes terminal exhaustion behavior. |
| P19-L001 | P19 | `checkProgress` | Missing project/execution/modules, malformed execution-order entries, undefined refs, gate review_name, validator schedule refs | Progress fields | Blocking findings or early return | Non-string/blank execution-order entries emit `EXEC_ORDER_ENTRY_INVALID` and remaining entries continue scanning. |
| P19-L002 | P19 | `checkModuleFiles` / `checkTestSpec` | Missing `FORGE.md`, buster `BUSTER.md`, invalid/mismatched test spec | Module dir/stages/files | Blocking or warn findings | Prevents agent dispatch without required docs. |
| P19-L003 | P19 | `checkGateFiles` | Missing gate `instructions_file` | Absolute/relative gate path | Blocking finding | Gate instruction path authority. |
| P19-L004 | P19 | `checkDependencyGraph` | Self/unknown dependencies | Module `depends_on` | Blocking findings | Scheduler dependency validity. |
| P19-L005 | P19 | `runArchValidator` | Deterministic + agent findings, catch-all errors | Config/progress/gateway | Pass/block report; internal errors fail closed | Architecture validation orchestration. |
| P19-L006 | P19 | `buildArchitectureValidatorControlResult` | Execution/contract invalid/blocking findings | Result and opts | Typed `pass` or `block` result with counts/artifacts | Validator stage contract projection. |
| P19-L007 | P19 | `classifyFullLintResult` | Missing report, failed tools, total errors | Lint report summary | Block/request-fix/pass classification | Full-lint terminal adapter logic. |
| P20-L001 | P20 | `classifyPipelineArtifactSurface` / authority policy | Surface membership, fallback flags, expected id matches | Artifact surface and ids | Role/drift/fallback/operator booleans | Artifact evidence authority. |
| P20-L002 | P20 | `validatePersistArtifactRequest` / `persist` | Request format/content/source validity | Plugin artifact request | Throw or write data and append index | Plugin artifact schema and lane write. |
| P20-L003 | P20 | `releaseBlueprint` | Existing status, required files, dirty checkout | Module status/stages/branch | Skip, throw, selected-path commit, no-op | Architecture materialization guard. |
| P20-L004 | P20 | `syncControlFiles` | Local content differs from architecture branch | Module/gate control files | Checkout changed files and commit selected paths once | Control-file drift sync. |
| P20-L009 | P20 | `commitSelectedPaths` | Staged paths after selected add | Git index and selected pathspecs | Return no-op when empty; throw on staged paths outside selection; commit with `-- <paths>` | Prevents blueprint/control-file commits from absorbing unrelated pre-staged work. |
| P20-L005 | P20 | `writeSummary` / `emitPipelineSummaryLifecycle` | `projectLogDir(config)`, cost/build failures, cumulative availability, terminal exit context | Config/run stats/status files | No-op, failed object, or summary/latest writes; terminal lifecycle maps internal `failed` to telemetry `status` and strips the flag | Pipeline summary algorithm and summary telemetry lifecycle. |
| P20-L006 | P20 | `generatePipelineReview` / `generateCaseStudy` | Disabled/rate-limited/no-output/post failure | Config/progress/poll result | Skipped/terminal/failed/ok generator result | Post-run generator routing. |
| P20-L007 | P20 | `checkBudgetThresholds` | Token totals >= stop/warning | Run stats/budget config | Emit budget telemetry and return hard-stop `ok` | Budget policy. |
| P20-L008 | P20 | `buildInvocationRefs` | Hook family and available refs | Invocation refs/ids | Primary ref precedence and canonical prefixes | Plugin correlation. |
| P21-L001 | P21 | `recordArchValidatorResult` | Execution failed, blocked, findings length | Extracted report | Governance outcome enum | Arch governance classification. |
| P21-L002 | P21 | `buildGovernanceSummary` | Arch error/block and approval rejected/cancelled/timeout/continued/all approved | Governance context | Overall governance outcome enum | Summary-level governance semantics. |
| P21-L003 | P21 | `generateLintReport` / `runPreCheck` | Missing tool, crash/output/parse, disabled/no report/errors | Lint tool output and config | Report/error or pass/fail pre-check | Lint/pre-check classification. |
| P21-L004 | P21 | `validateNotificationEventInput` | Hook/stage/run/ref/time/event/presentation shape | Notification input | Error list or valid input | Notification plugin schema gate. |
| P21-L005 | P21/RV-25 | `observeTelemetryNotification` | Redis emit failed/skipped/restored | Telemetry result plus central observability health map | Central degraded transition then throw, central restored transition only after prior degradation, or success | Sink health observability without local health state. |
| P21-L006 | P21/RV-25 | `dispatchNotificationHook` | No listeners, listeners restored, listener throws/succeeds | Registry/listeners plus central observability health map | Missing-listener result, per-listener results, and central transition-gated degraded/restored observability | Notification dispatch isolation without local incident state. |
| P21-L007 | P21 | `remediation-handoff.js` contract helpers | request_fix build/validate/read/controller resolution | Control result/controller shape | Valid contract or validation error | Contract support only; shared remediation loop execution lives in P09 `runRemediableGateControlLoopResult`. |
| P22-L001 | P22 | `readForgeInstructions` | Module has `substeps` | Module config/filesystem | Read root FORGE or concatenate existing substep FORGE files | Base implementation instruction selection. |
| P22-L002 | P22 | `buildForgePrompt` | Retry fail summaries and bounded operator directive presence | Status and `novaPrompt` | Add anti-patterns, XML-fenced untrusted operator directive, priority header | Operator guidance is visible remediation context, not an override of safety/tool/path/output contracts. |
| P22-L003 | P22 | `buildBusterModulePrompt` | Missing BUSTER and forge diff stat | Instruction read/status | Return `{error}` or include changed-files block | Prompt setup and test context. |
| P22-L004 | P22 | Shared completion sections | Static restrictions and status choices | None | Forge/Buster sections define exact raw-JSON schemas, forbid Markdown/fences, and retain tool/workspace/no-Redis-completion guidance | Completion remains artifact-driven without shell/Node writer snippets. |
| P22-L005 | P22 | `buildReviewFixPrompt` / `buildGateFixPrompt` | Fix history present | Fix history/issues | Adds previous-attempt anti-patterns, final stop instruction, and explicit no-status/no-completion/no-gate-output/no-Redis/no-git-finalization action contract | Remediation prompt guidance; pipeline owns git sync after session end. |
| P22-L006 | P22 | `buildReviewerPrompt` | Static reviewer contract | Reviewer/instructions/lint output | Exact raw-JSON output schema with Markdown/fenced-output prohibition | Review gate parser expectations. |
| P23a-L001 | P23a | `resolveRepoDir` / `resolveProjectPaths` | Explicit repo/env/current Git root and platform `projects_root` | Options/env/config | Git repo dir or throw; project root path | Project-summary keeps the shared strict Git-root contract. |
| P23a-L002 | P23a | `collectCodeStats` | Git tracked project files empty; binary/large/skipped files | Git/fs scan within a valid Git root | Git stats or project filesystem fallback | Code metrics; fallback is for empty tracked project files, not non-git repo roots. |
| P23a-L003 | P23a | `collectPipelineStats` | Normalized status PASS/BLOCKED/other | Module status files | Completed/blocked/pending counts and attempts; hardest modules sorted by `failCount` | Lifecycle projection. |
| P23a-L004 | P23a | `collectReviewStats` / `collectAgentInvocations` | Review filename and prompt filename prefixes | Echo/prompt dirs | Review and spawn counters | Report inputs. |
| P23a-L005 | P23a | Summary formatters | Current collector fields present or legacy aliases only | Unit census/API census/hardest modules | Test totals prefer nested `python.functions` / `frontend.functions`; hardest failures prefer `failCount`; legacy aliases are fallback only | Markdown, Discord, and case-study JSON stay aligned. |
| P23a-L006 | P23a | `postToDiscord` | Webhook missing/send failure/success | Env/options | false/false/true | Standalone Discord path. |
| P23a-L007 | P23a | `lint-report buildContext` / `main` | Missing repo, unknown tier, changed-files, total errors, failed tools | CLI flags/report | Exit 1 or 0 with output | Lint CLI terminal contract. |
| P23b-L001 | P23b | `detectProjectTypes` / `resolveScope` | Marker files, changed files, module path | Repo/module filesystem and context | Project types, markers, effective scope | Tool applicability and target selection. |
| P23b-L002 | P23b | `runAllTools` / `runTool` | Tier, detect, binary availability, tool throw | Lint context and registry | skipped/ok/error results and summary | Sequential execution plan. |
| P23b-L003 | P23b | Tool config resolution | tsconfig/eslint/semgrep present | Filesystem/candidates | Warning or tool run | Avoids implicit unsafe fallback. |
| P23b-L004 | P23b | Changed-file filtering in tools | Extension-specific changed files | `ctx.changedFiles` | Zero findings or narrowed args | Avoids irrelevant tool runs. |
| P23b-L005 | P23b | Entry `main` exit mapping | `summary.total_errors > 0 || summary.tools_failed > 0` | Lint report summary | Exit 1 for findings or tool failures, else 0 | `lintReportExitCode` is the explicit mapping owner. |
| B00a-L001 | B00a | README suite decision and completion | Critical verdict, task type | Suite results/task payload | no-spawn/spawn and artifact read path | Task lifecycle policy. |
| B00a-L002 | B00a | `shutdown` | `shuttingDown`, opts flags | Signal/options | Idempotent cleanup and optional gateway diagnostic | Runtime shutdown. |
| B00a-L003 | B00a | `main` startup | Gateway health, orphan recovery, platform-capability-gated base images, Redis group | Imported services/Redis errors | Ready loop or startup error; BUSYGROUP tolerated; image warmup is skipped unless `image_prepull` is explicitly configured | Buster startup. |
| B00a-L004 | B00a | `main` task loop | `!shuttingDown` and task errors | Module flag/errors | Process one task; on error log and sleep 3000 ms | Queue loop resilience. |
| B00a-L005 | B00a | CLI entry | Direct execution and `--status` | `process.argv` | Print `{lastRunLogDir}` or start main | Status surface. |
| B00b-L001 | B00b | None found in scoped files | N/A | N/A | N/A | Six shim files only star re-export common helpers. |
| B01-L001 | B01 | `gateway-health.js waitForGateway` | Health check succeeds before 120s deadline or timeout | Gateway health boolean | Startup returns or structured shutdown | Prevents queue loop before gateway readiness. |
| B01-L002 | B01 | `gateway-health.js startGatewayHealthMonitor` | Increment unhealthy count, reset on success, shutdown at 3 failures | Health check result and `isShuttingDown()` | Periodic process shutdown policy | Avoids one-off transient health failure termination. |
| B01-L003 | B01 | `logger.js sanitizeLoggerValue` | Value type and secret-key regex | Data object keys/values | Recursive sanitized log data | Prevents obvious secret values in JSONL logs. |
| B01-L004 | B01 | `logger.js write` | File append failure/restoration | `logPath`, append result, telemetry hook | Degraded/restored state transition | Observes log file health without blocking stdout logs. |
| B01-L006 | B01 | `runtime-diagnostics.js normalizeDiagnosticDetail` | Detail type branches | string, error message, JSON stringify, fallback string | Safe diagnostic detail | Diagnostics never expose raw unsanitized objects. |
| B01-L007 | B01/RV-11 | `session-monitor.js monitorSession` | Hard deadline, gateway unreachable, transcript delta, rate-limit, terminal state events | ACP EventBus state and payload/meta timing/rate config | Continue, emit telemetry, recover, or return terminal monitor result | Main child-session monitor algorithm; ACP polling delegated to edge adapter. |
| B01-L008 | B01/RV-11/RV-14 | `session-monitor.js enforceHardTimeout` | Canonical termination result | `terminateSession` output with isolated grace budget | Return confirmed/unconfirmed timeout result with embedded termination schema | Bounds stuck sessions without local kill-state synthesis or secondary confirmation polling. |
| B01-L009 | B01 | `session-monitor.js rate-limit resume merge` | Recovery action `resume` | State plus recovery gateway flags | Clears local `rateLimited` and continues with merged state | Avoids immediate re-processing after cooldown. |
| B02a-L001 | B02a | `suite-runner.ts runSuites` | Sort suites, reject unknown names, skip dependency-blocked suites, assert required capabilities, timeout/execute each, record critical failures | suites/config/capabilities/results | Missing capability becomes loud ERROR verdict plus durable operator alert with who/what/why | Pre-agent default-deny gate. |
| B02a-L002 | B02a | `discord.js sendDiscord` / `deliverDiscordWebhookRequest` | Normalize message or raw request, append actionability/correlation, persist JSON audit only for `sendDiscord`, optionally webhook | message/request/context/env | audit payload for JSON messages; shared webhook degraded/restored delivery state for JSON and multipart/raw requests | Operator notification contract; visual-reg multipart payloads do not duplicate telemetry state. |
| B02a-L003 | B02a/RV-17 | `git-workflows.ts gitSync/gitPushWithRetry` | fetch/reset or pull-rebase/push retry; optional commit requires explicit `addPaths` and stages with `git add --` | repo/hash/branch/options plus optional budget/signal | synced hash, pushed hash/error, or propagated abort/budget exhaustion | Git boundary with scoped commit mode and abortable exponential backoff. |
| B02a-L004 | B02a | `orphan-recovery.js recoverOrphanedActiveSession` | Inspect active-session file, remove invalid, recover/kill/clear or preserve | active-session JSON/options | startup recovery result | Crash recovery evidence handling. |
| B02a-L005 | B02a | `pipeline-helpers.js resolveBusterAgentResult` | rate-limit/nonterminal first, otherwise required `output_file` JSON with `status: PASS\|FAIL` | payload/session result | outcome/reason/summary/source | Child result authority routing with no status/result-artifact fallback. |
| B02a-L006 | B02a | `sandbox-cleanup.js cleanupSandboxResources` | Resolve policy, discover run-scope labels, clean state files/resources, bounded outputs, nginx | stage/payload/options | cleanup result with errors/policy denials | Destructive cleanup guardrail runs with maximum platform authority and is never reduced by task capabilities. |
| B02a-L007 | B02a | `task-completion.js ensureTaskTerminalBeforeAck` | already completed, completion precondition error dead-letters, no stream, fallback completion, dead-letter, fail closed | process result/payload/error | ACK permission mode | Completion-before-ACK invariant; verify/push failure does not emit normal completion. |
| B02a-L008 | B02a | `task-lifecycle.js processTask` | Validate required `output_file` and capability names, pre-clean, git sync, suite capability gates/suites, decision, spawn/monitor/kill/outcome, finally cleanup, ensure output_file, verify-task push, completion | task payload/options | task result and terminal signal | Top-level Buster task state machine with default-deny suite execution and push-before-Redis completion. |
| B02b-L001 | B02b | `completion-signal.js sendTaskCompletionSignal` | Missing stream, spawned-subagent flag, Redis success/failure | payload/completion state/suite summary | Return, emit completion, or record error | Terminal signal projection. |
| B02b-L002 | B02b | `session.js spawnTaskSession` | Spawn success/throw | payload/session options | update telemetry context/status or return spawn failure | Session launch boundary. |
| B02b-L003 | B02b/RV-14 | `session.js monitorTaskSession` | Monitor throw vs result | monitor result/error | terminate through shared controller, clear active state from `unconfirmed`, and return failure or normal monitor result | Monitor resiliency with canonical teardown schema. |
| B02b-L004 | B02b/RV-14 | `session.js killTaskSession` | Monitor already returned termination vs normal completion | session result/session data | reuse monitor `termination` or call shared controller once; clear active state from `unconfirmed` | Avoids duplicate terminal kill and local result synthesis. |
| B02b-L005 | B02b | `task-queue.js readNextTaskEntry` | pending reclaimed before new read | XAUTOCLAIM/XREADGROUP result | one reclaimed/new task or null | Crash recovery ordering. |
| B02b-L006 | B02b | `task-queue.js processOneQueuedTask` | malformed JSON/type/validation/process error | Redis fields and process result | dead-letter before ACK or terminal guarantee | Poison-message and ACK algorithm. |
| B02b-L007 | B02b | `task-validation.js validateBusterTaskPayload` | missing required identity or gate id | payload fields | throw `MalformedBusterTaskError` | Fail-closed validation. |
| B02b-L008 | B02b | `verdict-schema.ts createRunnerVerdict` | fail/error and critical fail | suite verdict statuses | PASS/FAIL and SPAWN/NO_SUBAGENT recommendation | Suite decision authority. |
| B02b-L009 | B02b | `verdict-schema.ts truncateForPrompt` | findings length exceeds max | runner verdict and maxFindings | cloned verdict with synthetic overflow finding | Prompt-size control without mutating original. |
| B03-L001 | B03 | `api.ts apiSuite` | Missing spec/file/tests, parse error, thresholds | API config/spec/tests | FAIL for missing tests, ERROR for structural failures, PASS, or threshold FAIL | API informational/enforced semantics. |
| B03-L002 | B03 | `api.ts runHttpTest/runWsTest` | Expected status/body/time/WS checks | per-test `expect` | Passed boolean and failures | Assertion semantics. |
| B03-L003 | B03 | `build.ts buildSuite/buildServer` | serve type, capability preflight, optional Dockerfile | serve config + task capabilities | static build/nginx or server podman path | Static mode requires `static_web_server`; server/container mode requires `container_runtime`. |
| B03-L004 | B03 | `e2e.ts e2eSuite` | tests_dir discovery, structural error, thresholds | E2E config and parsed output | FAIL for missing tests, ERROR for structural failures, PASS, or threshold FAIL | Playwright verdict routing. |
| B03-L005 | B03 | `k8s.ts k8sSuite` | suite capability preflight, required config, cleanup-safe namespace prefix, and `criticalFailed` per step | k8s config, task capabilities, command results | Missing capability ERROR before kubectl/podman; otherwise SKIP, preflight FAIL, short-circuit FAIL, or PASS | K8s deployment gate. |
| B03-L006 | B03 | `k8s.ts renderManifestForK8sSuite` | cluster-scoped kind vs namespaced doc, matching image name | YAML docs/image/tag/ns | namespace normalization and image rewrites | Safe manifest projection. |
| B03-L007 | B03 | `manifest.ts manifestSuite` | critical findings or threshold exceeded | normalized manifest and thresholds | PASS/FAIL and critical flag | Static K8s validation gate. |
| B03-L008 | B03 | `unit.ts unitSuite` | custom command, no tests, timeout, thresholds | unit config/package/output | FAIL for missing tests, ERROR for structural failures, PASS, or threshold FAIL | Unit runner semantics. |
| B03-L009 | B03 | `unit.ts parseOutput` | First matching framework regex | test output/exit code | framework counts or exit-code fallback | Deterministic parser order. |
| B04-L001 | B04 | `a11y.ts a11ySuite` threshold route | `a11y.thresholds` | No thresholds => evidence-only PASS with findings; thresholds => FAIL when violation counts exceed configured severity caps | Accessibility enforcement split. | None. |
| B04-L002 | B04 | `health.ts healthSuite` retry loop | `serve.health_retries/base_delay/timeout` | Exponential retry, first OK breaks, exhaustion returns critical FAIL | App readiness gate. | None. |
| B04-L003 | B04 | `health.ts smokeNavigate` route | configured/autodetected smoke paths + task capabilities | Optional Playwright navigation requires `browser_automation`; serious/critical findings fail non-critical suite | Frontend runtime error detection. | None. |
| B04-L004 | B04 | `perf.ts resolvePerfReportPaths` path guard | `perf.output_path` plus suite capability preflight | Missing `lighthouse` capability ERROR before CLI; otherwise throws because reports must use scratch plus tests-log artifact | Prevents task-controlled output path and unauthorized Lighthouse runs. | None. |
| B04-L005 | B04 | `security.ts securitySuite` checks | paths/header/cookie/CORS state | Per-path fetch then header checks, cookie checks, optional CORS; enforced threshold decides FAIL | Header audit semantics. | None. |
| B04-L006 | B04 | `visual-reg.ts runVisualReg` mode detection and Discord context | `paths.json`, HTML previews, `baseline.png`, telemetry/run context, task capabilities | Explicit multi-path `paths.json` plus reviewed baseline PNGs after `browser_automation`; missing baseline evidence fails closed; Discord helpers run only with `discord_media` when webhook configured | Visual-reg authority with explicit reviewed-baseline policy; multipart Discord delivery inherits shared Buster webhook health telemetry. | None. |
| B04-L007 | B04 | `visual-reg.ts compareImages` canvas merge | baseline/actual PNG dimensions | Max canvas dimensions; smaller image padded transparent before pixelmatch | Size mismatch remains comparable. | None. |
| B04-L008 | B04 | `screenshot.ts generateBaselines` route algorithm | HTML `data-routes` | Validate routes; setup route without auth bypass; other routes click by nav label; write paths JSON | Prism preview to baseline conversion. | None. |
| B04-L009 | B04 | `visual-audit.ts visualAudit` mode branch | `mode` + CLI/env capabilities | Requires `browser_automation` and `discord_media`; `video` records webm after scroll/wait; otherwise screenshot PNG | Operator media selection. | None. |
| B05-L001 | B05 | `base-images.ts ensureBaseImages` capability/Podman branch | `image_prepull` platform capability, then `podman image exists` exit result | Missing capability writes durable alert and returns blocked without Podman; success logs cached; code `1` pulls; other errors log and continue | Safe default-deny cache warmup semantics. | None. |
| B05-L002 | B05 | `rate-limit.ts handleRateLimit` canonical signal route | `ownsCanonicalSignal` | True emits telemetry/Discord; false suppresses duplicate signal | Prevents duplicate pause authority. | None. |
| B05-L003 | B05 | `rate-limit.ts handleRateLimit` gate identity route | `taskType === 'gate_test'` | Treats module id as gate id and clears module id | Preserves gate-scoped rate-limit identity. | None. |
| B05-L004 | B05 | `rate-limit.ts handleRateLimit` liveness decision | ACP monitor `sessionActive`, `gatewayUnreachable` | Gateway unreachable or active => resume; inactive reachable => kill | Terminal child-session recovery decision. | None. |
| B05-L005 | B05 | `telemetry.ts createTelemetryContext` enable/identity route | `enabled`, project/run id | Disabled drops events; missing identity returns unavailable context | Prevents bad stream keys and supports intentional disable. | None. |
| B05-L006 | B05 | `telemetry.ts emitEvent` degraded/restored loop | Redis availability and `_health.redis.degraded` | First failure writes degraded fallback; later success backfills restored | Non-blocking observability continuity. | None. |
| B05-L007 | B05 | `redis.ts` action route | `--action` | send/read/complete/unknown branches; complete always errors | Legacy completion path removal. | None. |
| B05-L008 | B05 | `verify-task.ts verifyAndPush` scope firewall | Git changed paths vs project/swarm roots | Revert/delete forbidden paths, then call `gitPushWithRetry` with `addPaths:[swarmRoot]` | Scope authority independent of agent role. | None. |
| C00a-L001 | C00a | `discord-purge.js deepPurge` age/count route | Fetched Discord message timestamps/count | No messages or old-only messages break; single eligible uses DELETE; multiple use bulk-delete | Discord bulk-delete constraints. | None. |
| C00a-L002 | C00a | `cli-args.ts parseCliArgs` token route | argv token/schema | Unknown flags/positionals rejected unless schema allows | Strict CLI semantics. | None. |
| C00a-L003 | C00a | `git-primitives.ts getCurrentBranch` fallback | branch/ref Git outputs | Detached/failure uses origin refs then `main` | Stable branch display fallback. | None. |
| C00a-L004 | C00a | `lifecycle-state.ts transitionModuleStatus` status route | new status/options | Updates phase/timestamps/summary and pending mutation according to status | Shared lifecycle semantics. | None. |
| C00a-L005 | C00a | `redaction.js sanitizeTelemetryPayload` recursive route | key names and value types | Secrets/content summarized or redacted, safe identifiers preserved in summaries | Telemetry hygiene. | None. |
| C00a-L006 | C00a | `security.ts` shell/env guards | command string chars and requested child env | Reject shell metacharacters; parse quotes/escapes into argv; build child env from an allowlist and deny known secret keys even when present in parent env | Shell-boundary and subprocess-env hardening. | None. |
| C00b-L001 | C00b | `acp-monitor.js publishTranscriptDelta` rate route | per-label count/window and new line count | More than 5/sec emits one aggregated info event | Transcript telemetry throttling. | None. |
| C00b-L002 | C00b | `acp-monitor.js buildMonitorState` terminal precedence | transcript/session/poll counters | rate-limit, hard transcript, terminal session, unknown+stale in order | Monitor terminal authority. | None. |
| C00b-L003 | C00b | `acp-monitor.js getAcpMonitorState` signature route | argument shape | Nova label lookup or direct child session monitor | Current public monitor API accepts explicit label/config and direct child-session callers, then returns the same validated monitor state. | None. |
| C00b-L004 | C00b/RV-17 | `lifecycle.js spawnSession` runtime route | resolved runtime/model plus optional budget/signal | Subagent omits ACP-only fields; ACP includes agentId/streamTo/thinking; spawn retry waits and gateway calls receive caller abort controls | Gateway spawn payload correctness with preemptible retry waits. | None. |
| C00b-L005 | C00b/RV-14 | `lifecycle.js killSession` escalation route | stopped/runtime/request/confirmation | already stopped, subagent kill, `/stop`, list confirm, ACP `acpx` fallback | Low-level stop escalation sequence behind `terminateSession`. | Runtime result normalization is owned by the termination controller. |
| C00b-L006 | C00b | `runtime.js resolveRuntime` dispatch route | runtime/dispatch/model strings | explicit acp/subagent wins; otherwise model-derived default | Shared dispatch selection. | None. |
| C00b-L007 | C00b | `gateway.js invokeGatewayTool` retry/result classifier | network-like error vs HTTP error vs parsed/non-object body | Network errors retry; HTTP errors throw normalized errors; non-object/non-JSON success bodies become `{raw}` | Gateway retry and result-shape semantics. | None. |
| C00b-L008 | C00b | `rate-limit-contract.js resolveRateLimitRecoveryAction` | gateway unreachable/session alive | Resume if unknown/alive; otherwise kill | Shared rate-limit recovery action. | None. |
| S00-L001 | S00 | `SKILL.md` suite selection | `test_suites` and module type | Documents backend/frontend suite matrix and requirements | Project setup guidance. | None. |
| S00-L002 | S00 | `module-files.md` visual-reg mode detection | baseline artifacts in derived module directory | Multi-path, auto-generate, single-path, or SKIP | Mirrors B04 source intent and current tool names. | None. |
| S00-L003 | S00 | `prism-conventions.md` route capture | `data-routes` route `name`/`nav` | Setup captured without auth bypass; other routes with `?baselines=true` and nav click | Baseline generator behavior. | None. |
| S00-L004 | S00 | `progress-json.md` gate routing | gate `type` | Review, Buster, or approval field set | Project schema guidance. | None. |
| V00-L001 | V00 | `run-fast-verification.sh` prerequisite route | PATH commands | Missing node/python exits; python3 creates temp shim | Local verifier prerequisites. | None. |
| V00-L002 | V00 | `run-fast-verification.sh` behavior route | `SKIP_FAST_BEHAVIOR` | Run selected behavior areas or skip | Fast feedback tunability. | None. |
| V00-L003 | V00 | `run-full-verification.sh` prerequisite route | PATH commands | Missing node/helm/kubeconform/python exits; python3 shim fallback | Full lane dependency gate. | None. |
| V00-L004 | V00 | `run-full-verification.sh` ACP route | static wrapper logic | Excludes ACP launch and prints local-only notice | Default clean-checkout lane independence. | None. |
| V00-L005 | V00 | `run-local-acp-verification.sh` route | PATH node and forwarded args | Missing node exits; otherwise forwards to ACP smoke | Explicit local ACP lane. | None. |
| V01a-L001 | V01a | `verify.mjs resolveSelectedAreas` | no/known/unknown area args | default all; selected unique list; unknown throws supported list | Behavior selection authority. | None. |
| V01a-L002 | V01a | `verify.mjs` help/list route | `--help`, `--list-areas` | print usage or JSON `{areas}` and exit 0 | Operator discovery. | None. |
| V01a-L003 | V01a | `verify.mjs record` logging route | verbose flag/env | buffer logs by default; stream and include checks when verbose | Quiet success / diagnostic failure behavior. | None. |
| V01a-L004 | V01a | `verify.mjs cleanup` | process cwd/sourceRoot | de-dupe roots and remove each `.swarm` before/after run | Generated artifact hygiene. | None. |
| V01a-L005 | V01a | `docs-surface.mjs` docs/artifact assertions | doc text and generated latest/summary fields | record fails on drift | Docs/runtime artifact parity. | None. |
| V01a-L006 | V01a | `foundations.mjs` runtime fixtures | invalid registry/status/lock/worker/generator cases | expected throw/result assertions | Foundational boundary pinning. | None. |
| V01a-L007 | V01a | `repo-docs.mjs` source-text assertions | docs/source text | record fails on stale or missing canonical wording | Documentation drift prevention. | None. |
| V01b-L001 | V01b | `governance.mjs` approval route | `on_timeout` block/continue | exit 10 vs exit 0 with `continued:true`; summary outcome differs | Approval timeout semantics stay replayable. | None. |
| V01b-L002 | V01b | `migrated-seams.mjs` fake worker route | fixture mode/owner options | pass, invalid compatibility shape, missing owner, or forbidden compatibility authority | Fail-closed plugin migration seams. | None. |
| V01b-L003 | V01b | `models.mjs` runtime dispatch | model provider string | OpenAI/Codex => subagent/codex; Claude => ACP/claude | Runtime dispatch defaults. | None. |
| V01b-L004 | V01b | `operator-surface.mjs` delivery route | webhook mute/fail/recover and audit path | audit-only, degraded, restored, or noncritical visual-reg log | Operator delivery is observable and non-authoritative. | None. |
| V01b-L005 | V01b | `runtime-surface.mjs` gateway route | OpenClaw vs legacy env | OpenClaw URL/token precedence over legacy | Gateway config precedence. | None. |
| V01b-L006 | V01b | `runtime-surface.mjs` notification route | listener priority/module/failure/missing | ordered dispatch, continue past failure, listener-missing degraded event | Notification registry authority. | None. |
| V01b-L007 | V01b | `runtime-surface.mjs` ACP launch route | session status visibility and cleanup | PASS only with session-status evidence and confirmed cleanup | Prevents stream-log-only launch PASS. | None. |
| V02a1-L001 | V02a1 | `approvals.mjs` stage-owner route | typed control result | PASS timeout-continue, rejection exit 10, fail-closed error exit 1 | Validates approval stage contract. | None. |
| V02a1-L002 | V02a1 | `approvals.mjs` persisted state route | approved/rejected/timed-out/corrupt/unknown status | Continue, block, or critical fail-closed without reopening wait | Restart safety. | None. |
| V02a1-L003 | V02a1 | `approvals.mjs` timeout policy route | `on_timeout` and helper input | Uppercase `BLOCK`/`CONTINUE` in state/telemetry | Stable telemetry/schema. | None. |
| V02a1-L004 | V02a1 | `fix-cycles.mjs` scenario route | spawn/health/no-output/rate-limit/rereview failures | Gate NO-GO/retry exhausted or exit 40 rate-limit exhausted | Fix-cycle interruption semantics. | None. |
| V02a1-L005 | V02a1 | `gate-session-persistence.mjs` marker route | runtime source text | Record passes/fails on restart marker drift | Guards restart correlation fields. | None. |
| V02a1-L006 | V02a1 | `lifecycle-state-surface.mjs` prompt route | prompt strings and helper exports | Record fails on forbidden status mutation authority | Agents must not own status mutation. | None. |
| V02a2-L001 | V02a2 | `gates.mjs` stage-owner pass/block route | typed gate control result | pass => continue/exit 0; block => halt/exit 10 with correlation fields | Core gate contract semantics. | None. |
| V02a2-L002 | V02a2 | `gates.mjs` missing owner/registry/dispatch route | absent registry/gate/type/owner | exit 1 and `gate.verdict` NO-GO plus Discord in alert records | Dispatch fails closed. | None. |
| V02a2-L003 | V02a2 | `gates.mjs` plugin contract route | legacy/contradictory/missing diagnostics/compatibility authority | exit 1, `contract_invalid`, gate verdict reason | Prevents compatibility outputs from becoming authority. | None. |
| V02a2-L004 | V02a2 | `gates.mjs` output contract route | non-JSON, missing status, unknown status, stale gate-status PASS | invalid output or dependency not met | Canonical output file authority. | None. |
| V02a2-L005 | V02a2 | `gates.mjs` review runtime route | setup failure, post-start error, malformed output, no output | gate verdict/Discord/no-output detail | Review gate fail-closed behavior. | None. |
| V02a2-L006 | V02a2 | `gates.mjs` Buster runtime route | setup failure, unexpected loop, invalid output, rate-limit exhaustion/pause | gate verdict/Discord/retry exhaustion or pass after pause | Buster gate fail-closed/recovery behavior. | None. |
| V02a3-L001 | V02a3 | `module-failures.mjs` worker stage route | typed worker result | pass continues; invalid returns exit 1 with contract diagnostic | Worker plugin boundary authority. | None. |
| V02a3-L002 | V02a3 | `module-failures.mjs` Forge no-change route | transcript active vs stale plus terminal detail | Different operator reason wording while preserving terminal detail | ACP no-output diagnosis. | None. |
| V02a3-L003 | V02a3 | `module-failures.mjs` terminal stop route | BLOCKED, blueprint, validation, git, prompt, spawn, unexpected status | Terminal stop payload with preserved session/gateway/dispatch correlation | Operator/debug continuity. | None. |
| V02a3-L004 | V02a3 | `module-failures.mjs` pre-test route | infra/code/repeated pre-test outcomes | infra stop, repeated stop, or code-side retry | Buster pre-test failure semantics. | None. |
| V02a3-L005 | V02a3 | `module-failures.mjs` retry exhaustion route | fail counts and max retry/crash budgets | FAIL then BLOCKED plus retry.exhausted | Retry terminal authority. | None. |
| V02a3-L006 | V02a3 | `module-failures.mjs` rate-limit route | Forge/Buster exhausted or pause/resume | exit 40 with retry.exhausted or pause/resume back to phase | Rate-limit ownership/correlation. | None. |

## V02b branch / routing conditions

| ID | Batch | File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- | --- | --- |
| V02b-L001 | V02b | `pipeline.mjs stepOutcomeForExit` | exit code `0/10/20/30/40/default` | numeric exit | maps to continue/pass or halt needs_nova/blocked/timeout/rate_limited/error | Builds typed step fixtures and verifies raw exit fallback is rejected. |
| V02b-L002 | V02b | `pipeline.mjs runPipeline records` | step result `nextAction` and `outcome` | typed module/gate/validator result | scheduler continues, halts, or blocks; terminal finalizer emits telemetry/summary | Typed step result authority. |
| V02b-L003 | V02b | `pipeline.mjs` gate/validator registry routes | missing stage owner or validator `request_fix`/`block`/`error` | registry, validator result | fail closed, halt before review, or continue | Registry and validation fail-closed behavior. |
| V02b-L004 | V02b | `pipeline.mjs` generator schedule routes | full pipeline passed, module blocked, arch validation block, single-module mode | pipeline mode/outcome | all generators, project-summary only, none, or none | Prevents post-terminal over-scheduling. |
| V02b-L005 | V02b | `restart-recovery.mjs` stale recovery routes | gateway reachable/running/closed, no session, unconfirmed stop, weak identity | active-agent and gateway state | reset status, emit degraded/restored, block recovery, or skip stop | Restart safety for orphan ACP sessions. |
| V02b-L006 | V02b | `resume-idempotence.mjs` resume route | module already completed vs pending approval vs module not started | persisted status/gate state | skip redispatch, reuse approval, skip/run arch validation | Resume idempotence and core-owned timing. |
| V02b-L007 | V02b | `seq-restart.mjs` telemetry identity route | project/run id present or missing | telemetry context/config identity | publish to stream with Redis seq or reject/disable unknown stream | Prevents local seq fallback and unknown streams. |
| V02b-L008 | V02b | `stops.mjs` Buster terminal route | terminal reason | `config_invalid`, `spawn_failed`, `parse_corrupted`, `timeout`, `git_error`, `rate_limited`, `gate_fail` | deterministic exit/reason/telemetry/Discord | Gate operator consistency. |

## V02b state mutations / merge behavior

| ID | Batch | File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- | --- | --- |
| V02b-LS001 | V02b | `pipeline.mjs makeStepResult` | typed step fixture result | exit/reason/status/projection/correlation | exit maps to `nextAction`/`outcome`; projection and correlation are copied into compatibility metadata | Scheduler uses typed fields, not raw exit. |
| V02b-LS002 | V02b | `pipeline.mjs` lifecycle seed helpers | module lifecycle fixtures | lifecycle helpers plus overrides | canonical lifecycle transitions first, then correlation/status overrides | Status correlation may be provenance but not authoritative top-level correlation unless typed result supplies it. |
| V02b-LS003 | V02b | `restart-recovery.mjs` recovery fixtures | module/gate active-session state and lifecycle events | active-agent records, gateway responses | confirmed stale sessions clear/reset; unconfirmed or weak identities remain active and emit blocked evidence | No unsafe orphan clearing. |
| V02b-LS004 | V02b | `resume-idempotence.mjs` repeated resume harness | module status, approval state, telemetry, Discord calls | interrupted first run plus resumed runs | completed module and pending approval artifacts are reused | No duplicate PASS/request telemetry or Discord delivery. |
| V02b-LS005 | V02b | `seq-restart.mjs` telemetry seq state | Redis seq counter and durable artifacts | Nova/Buster events across materialized runtimes | Redis counter increments globally per project/run; artifacts mirror emitted seq | Monotonic seq across restart. |
| V02b-LS006 | V02b | `stops.mjs` Buster gate result projection | gate result and telemetry payload | scenario terminal result | runner maps reason/status/correlation into exit/reason and gate verdict | Correlation preserved for terminal gate stops. |

## V02b loops / polling / timeout mechanics

| ID | Batch | File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- | --- | --- |
| V02b-LL001 | V02b | `pipeline.mjs` behavior records | sequential records through harness | none at area level | none | first failing record aborts selected area. |
| V02b-LL002 | V02b | `pipeline.mjs` generator/validator schedules | progress execution order and completion finalizer | none in fixtures | validator/gate timeout values supplied but not waited | schedules explicit stage owners or halts. |
| V02b-LL003 | V02b | `restart-recovery.mjs` gateway recovery | active module/gate sessions during startup | fake gateway calls, no real sleep | no real deadline in fixtures | confirmed stop/reset, terminal reset, no-session reset, blocked unconfirmed/weak identity. |
| V02b-LL004 | V02b | `resume-idempotence.mjs runRepeatedResumeScenario` | repeated `runPipeline(..., { resume: true })` after simulated interruption | no real sleep | approval timeout configured, not waited | first run rejects; repeated resumes reuse state. |
| V02b-LL005 | V02b | `seq-restart.mjs` telemetry stream caps | stream/artifact event retention | Redis fake XADD behavior | stream cap from telemetry config/runtime | durable artifacts retain capped replay with Redis-owned seq. |
| V02b-LL006 | V02b | `stops.mjs` scenario matrix | `for (const scenario of scenarios)` | none | timeout scenario supplied by fake result, no real wait | each terminal reason emits expected result/telemetry. |

## V03a branch / routing conditions

| ID | Batch | File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- | --- | --- |
| V03a-L001 | V03a | `agent-lifecycle.mjs` spawn/kill/dispatch | gateway accept/reject, runtime type, adapter registered | session/runtime/adapter config | spawn/kill/dispatch or fail closed | Agent lifecycle authority. |
| V03a-L002 | V03a | `buster-runtime-normalization.mjs` payload/queue/recovery | canonical identity, terminal evidence, orphan confirmation | payload, Redis outcomes, gateway state | malformed/complete/dead-letter/preserve/delete | Buster identity and ACK safety. |
| V03a-L003 | V03a | `discord-correlation.mjs` identity fields | canonical identity surface vs custom field list; display label vs gateway label | `DISCORD_IDENTITY_SURFACES`, Discord field names | lifecycle/gate/module/pipeline/rate-limit callers build fields through `buildDiscordIdentitySurfaceFields`; audit correlation only trusts gateway/session/dispatch fields | Prevents operator display and field-selection drift. |
| V03a-L004 | V03a | `many-module-soak.mjs` workers | retry module and attempt | stage inputs/status | request-fix/retry once then PASS | Exercises scheduler retry. |
| V03a-L005 | V03a | `polling.mjs` polling/adjudication | immediate result, Redis/local conflict, session/rate-limit status | callbacks, Redis completion, status, gateway | done/timeout/conflict/rate-limited/degraded | Polling authority. |
| V03a-L006 | V03a | `redaction-surface.mjs assertNoLeaks` | artifact text contains seeded secret | recursive artifacts | assertion failure on leak | Secret hygiene. |

## V03a state mutations / merge behavior

| ID | Batch | File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- | --- | --- |
| V03a-LS001 | V03a | `agent-lifecycle.mjs` lifecycle records | tracked agents, Discord JSONL, Redis telemetry | gateway accepted session details | gateway/session key canonical; display label remains display-only | Shared correlation. |
| V03a-LS002 | V03a | `buster-runtime-normalization.mjs` queue/recovery | Redis call log, active-session files | payload/failure options/gateway state | completion then dead-letter; delete active only on proof/malformed | Terminal evidence before ACK. |
| V03a-LS003 | V03a | `many-module-soak.mjs` stage owners | status files and call arrays | worker/validator/generator inputs | lifecycle status first, retry failures recorded, generators appended | Final PASS order. |
| V03a-LS004 | V03a | `polling.mjs` correlation builders | result/status objects, tracked agents | observed and fallback correlation | observed strong fields win; tracked fallback fills sparse fields | Stable telemetry/Discord correlation. |
| V03a-LS005 | V03a | `redaction-surface.mjs` redaction writers | telemetry/log/Discord/prompt/transcript artifacts | raw secret-bearing detail | redact/hash/summarize before write | No seeded secret in artifacts. |

## V03a loops / polling / timeout mechanics

| ID | Batch | File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- | --- | --- |
| V03a-LL001 | V03a | `polling.mjs pollGeneric` | callback not done | `poll_interval_seconds`; progress throttles | timeout seconds | done or timeout. |
| V03a-LL002 | V03a | `polling.mjs pollDual` | Redis/local completion not authoritative | `poll_interval_seconds` | timeout seconds/minutes | accepted completion, conflict, rate-limit, timeout. |
| V03a-LL003 | V03a | `polling.mjs pollForSessionEnd/File/Status` | session/file/status not terminal | poll interval plus session/progress throttles | timeout plus grace/nudge thresholds | target, no-output/no-change, rate-limit, timeout, degraded. |
| V03a-LL004 | V03a | `buster-runtime-normalization.mjs` queue | one fake `xreadgroup` delivery | none in fake | none | completion/dead-letter/ACK branch completes or throws. |
| V03a-LL005 | V03a | `many-module-soak.mjs` pipeline | modules in execution order | no real sleeps | configured timeouts not waited | completion after modules/generators/retries. |

## V03b branch / routing conditions

| ID | Batch | File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- | --- | --- |
| V03b-L001 | V03b | `runtime-monitor.mjs getAcpMonitorState` | gateway running/closed/unreachable/transcript rate-limited | gateway state and transcript lines | running, terminal, active degraded, or rate-limited | Keeps gateway outage explicit. |
| V03b-L002 | V03b | `shell-boundary.mjs` suite/cleanup records | shell metacharacter/path/resource policy and K8s namespace prefix | source text, paths, cleanup policy, task config | reject, literal argv execution, preflight FAIL, or scoped cleanup | Prevents command injection/destructive cleanup/resource leaks. |
| V03b-L003 | V03b | `summaries.mjs` summary flows | rate-limited, no-output, poll exception, success/halt | poll result, session/correlation, output artifacts | retry exhausted, failure, cleanup, summary telemetry | Summary terminal authority. |
| V03b-L004 | V03b | `telemetry.mjs` completion selection | identity match/source/status plus Redis completion schema | run/attempt/dispatch/source/status/outcome/envelope | select, ignore, conflict, invalid fail-closed, or idempotent duplicate | Redis completion authority. |
| V03b-L005 | V03b | `telemetry.mjs` transport failures | Redis unavailable/import/read/archive fails | Redis adapter/fake Redis errors | fallback artifact or degraded/restored event | Observability on transport failures. |
| V03b-L006 | V03b | `transcript-monitor.mjs verifyAgentAlive` | unknown gateway with transcript progress vs none | tracked transcript delta state | alive with degraded/restored or false with degraded | ACP health fallback semantics. |

## V03b state mutations / merge behavior

| ID | Batch | File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- | --- | --- |
| V03b-LS001 | V03b | `summaries.mjs` summary generators | summary artifacts, Discord JSONL, Redis telemetry | summary output/poll status/session identity | canonical summary started/completed events and run/top-level artifact paths | Joinable summary artifacts. |
| V03b-LS002 | V03b | `telemetry.mjs` completion archive | active and archive Redis streams | module/gate identity and active dispatch | move only matching stale entries; preserve active identity | Bounded archive and active dispatch preservation. |
| V03b-LS003 | V03b | `shell-boundary.mjs` cleanup | sandbox tracked resource state | cleanup phase/policy/resources | task-scoped, startup sweep, disabled, failure-preserve | No sibling/untracked cleanup. |
| V03b-LS004 | V03b | `transcript-monitor.mjs` transcript state | tracked agent transcript state | byte offset/event count/new lines | only appended lines update state | No duplicate transcript processing. |

## V03b loops / polling / timeout mechanics

| ID | Batch | File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- | --- | --- |
| V03b-LL001 | V03b | `runtime-monitor.mjs monitorSession` | Buster ACP monitor state queue | explicit `acp_monitor.monitor_poll_ms`/camelCase monitor config in fixtures | required unknown/stale/transcript/poll limits | closed terminal or rate-limit/degraded/restored flow. |
| V03b-LL002 | V03b | `summaries.mjs` summary polling | `pollForFile` returns rate limit/no output/throws | fixture `sleep` is no-op | max pauses from rate-limit config | output, no-output, rate-limit exhausted, exception cleanup. |
| V03b-LL003 | V03b | `telemetry.mjs` Redis completion tail/archive | scan batches until limit/end with schema validation per matched entry | none | `batchSize`, `scanLimit`, archive maxlen | match/conflict/invalid/end of stream/archive complete. |
| V03b-LL004 | V03b | `transcript-monitor.mjs waitForSessionIdle` | gateway unavailable but transcript active | `pollMs`, transcript grace | `totalTimeoutMs`, `extraGraceMs`, `transcriptGraceMs`, max extensions | idle/grace exhausted. |

## V04a branch / routing conditions

| ID | Batch | File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- | --- | --- |
| V04a-L001 | V04a | `check-pipeline-complexity-budgets.mjs/listJsFiles` | entry type and name | dir/file, `node_modules`, `.git`, `.js` suffix | recurse/count/skip | Keeps complexity scan scoped. |
| V04a-L002 | V04a | `check-gate-active-session-surface.mjs` fixture | lifecycle read-model conflicts/file-only gate file | session/dispatch/gateway identity | lifecycle identity wins; file-only evidence returns no active identity | Prevents stale gate file authority. |
| V04a-L003 | V04a | `check-gate-control-result-surface.mjs` typed controls | gate type/exit/failure class | review/Buster/approval facts | typed nextAction/issueType/outcomeClass | Guards against reintroducing gate compatibility projections. |
| V04a-L004 | V04a | `check-module-runner-slice-surface.mjs` status-only correlation | only `status.active_agent` has identity | status fields | authoritative correlation null; provenance retained | Prevents stale status identity authority. |
| V04a-L005 | V04a | `check-module-runner-slice-surface.mjs` validator fixture | malformed plugin result | missing diagnostics object | terminal `plugin_contract_invalid` before git sync/Buster | Fail-closed plugin contracts. |

## V04a state mutations / merge behavior

| ID | Batch | File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- | --- | --- |
| V04a-LS001 | V04a | gate active-session fixture | temp lifecycle read-model and stale active-session file | lifecycle/file identities | lifecycle read-model overrides file conflict | active session from lifecycle; file remains evidence. |
| V04a-LS002 | V04a | module-runner malformed validator fixture | temp dirs and terminal result | malformed validator output | build diagnostic without side-effect handlers | terminal contract diagnostic preserved. |
| V04a-LS003 | V04a | contract scripts generally | no production state | source/API assertions | assertion-only | source tree not modified. |

## V04a loops / polling / timeout mechanics

| ID | Batch | File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- | --- | --- |
| V04a-LL001 | V04a | `check-pipeline-complexity-budgets.mjs/listJsFiles` | directory entries remain | none | none | all eligible `.js` files scanned. |
| V04a-LL002 | V04a | V04a scripts generally | no polling loops | None found in scoped files | None found in scoped files | assertion pass/fail. |

## V04b branch / routing conditions

| ID | Batch | File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- | --- | --- |
| V04b-L001 | V04b | observability catch contract | banned regex match | source text | assertion failure | Prevents silent failure swallowing. |
| V04b-L002 | V04b | operator alert contract | telemetry disabled but presentation provided | fixture config/presentation | Discord sink plugin dispatch | Operator alerts stay plugin-owned. |
| V04b-L003 | V04b | entrypoint shim contract | shim imports/exports | source/API shape | index re-export and CLI import only | Prevents entrypoint regrowth. |
| V04b-L004 | V04b | pipeline runner correlation fixture | raw nested status identity only | status/module_status fields | null authoritative correlation | Prevents stale status authority. |
| V04b-L005 | V04b | step-result helpers | typed outcome and terminal derivation | typed result/control | typed result owns terminal exit | Core terminal authority boundary without compatibility projection. |
| V04b-L006 | V04b | step-result helpers | retry/request_fix action | typed control action | nonterminal result with null exit | Avoids premature terminal projection. |
| V04b-L007 | V04b | remediation handoff | `nextAction:'request_fix'` | typed control result | shared remediation loop | Centralizes fix-cycle mechanics. |

## V04b state mutations / merge behavior

| ID | Batch | File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- | --- | --- |
| V04b-LS001 | V04b | operator alert fixture | callback arrays | Discord sink callbacks | one sink call per presentation | Exactly one alert delivery. |
| V04b-LS002 | V04b | step-result builders | in-memory result object | typed control/result and compatibility | strip/reject compatibility authority | Canonical typed projection. |
| V04b-LS003 | V04b | remediation handoff fixture | control result object | gate/run/remediation policy/findings | typed `request_fix` contract | Valid remediation control. |

## V04b loops / polling / timeout mechanics

| ID | Batch | File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- | --- | --- |
| V04b-LL001 | V04b | observability catch contract | each file and banned pattern | none | none | all combinations checked. |
| V04b-LL002 | V04b | V04b scripts generally | no polling loops | None found in scoped files | None found in scoped files | assertion pass/fail. |

## V04c branch / routing conditions

| ID | Batch | File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- | --- | --- |
| V04c-L001 | V04c | session authority policy | lifecycle/evidence/gateway identity present, weak, missing, mismatched, or unconfirmed | `run_id`, `attempt`, `dispatch_id`, `session_key`, gateway/monitor evidence | confirmed, incomplete, mismatch, or requires gateway confirmation | Lifecycle-only active-session authority boundary with diagnostic evidence hydration prohibited. |
| V04c-L002 | V04c | stage envelope primitives | ref spec empty/raw/prefixed | ref specs | omit empty, preserve raw, build prefixed refs | Centralizes stage envelope refs. |
| V04c-L003 | V04c | status-store legacy policy | bootstrap mode/purpose | compatibility mode and purpose | disabled, migration allowed, or fail-closed unknown | Prevents legacy status authority leakage. |
| V04c-L004 | V04c | status-store gate policy | gate PASS/FAIL/RATE_LIMITED/APPROVED with or without canonical output/active dispatch | gate type/status/evidence | diagnostic evidence, wait sync, rate-limit candidate/confirmed | Prevents legacy gate status terminal authority. |
| V04c-L005 | V04c | completion adjudicator | Redis terminal identity match/conflict/invalid diagnostic | expected identity, schema-validated Redis entry, local status, `preferRedis` | candidate, confirmed authority, conflict/invalid fail-closed, or no apply | Redis completion authority. |
| V04c-L006 | V04c | telemetry contract | event/schema/source/stream drift | docs/schema/events/stream keys | assertion failure or canonical shared stream | Telemetry contract parity. |
| V04c-L007 | V04c | validator control | pass/fail/execution failure/malformed plugin result | validator result facts | pass, request_fix, block, or contract-invalid block | Typed validator decisions. |
| V04c-L008 | V04c | worker control | backend reason/failure class | Forge/Buster backend facts | retry, request_fix, pass/block mapping | Typed worker decisions. |

## V04c state mutations / merge behavior

| ID | Batch | File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- | --- | --- |
| V04c-LS001 | V04c | status-store fixture | lifecycle events/read models and stale status JSON | lifecycle events plus stale status JSON | `loadStatus` ignores stale status JSON and projects lifecycle only | `status_authority_source: lifecycle_read_model`; no status-file read. |
| V04c-LS002 | V04c | status-store migration bootstrap | lifecycle read models | legacy status and explicit migration purpose | migration-only may seed read model, not active sessions | No runtime projection authority. |
| V04c-LS003 | V04c | telemetry contract fake Redis | shared telemetry stream | Buster then Nova events | canonical run stream with monotonic Redis seq | One stream, no legacy custom stream. |
| V04c-LS004 | V04c | validator lint fixture | lint output/trace paths | missing `fail_count` | normalize attempt to 1 | No `NaN` artifact names. |
| V04c-LS005 | V04c | worker Forge fixture | in-memory worker result | default dependency path and fake deps | typed worker control result returned | No injected `getTrackedAgent` required. |

## V04c loops / polling / timeout mechanics

| ID | Batch | File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- | --- | --- |
| V04c-LL001 | V04c | telemetry contract emitter scan | effective emitter files remain | none | none | all emitted event names checked against contract. |
| V04c-LL002 | V04c | status-store source/API assertions | fixed assertion sequence | none | none | first assertion failure exits. |
| V04c-LL003 | V04c | V04c scripts generally | no live polling loops | None found in scoped files | None found in scoped files | assertion pass/fail. |

## V05 branch / routing conditions

| ID | Batch | File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- | --- | --- |
| V05-L001 | V05 | Buster operator surface | canonical vs legacy embed marker | source text occurrences | exactly one canonical call; legacy forbidden | Prevents duplicate/legacy operator messaging. |
| V05-L002 | V05 | Buster active-agent helpers | mark/clear identity matches or mismatches | run/attempt/dispatch/session | mark, preserve mismatch, clear match | Active-session authority. |
| V05-L003 | V05 | Buster result resolver | required `output_file` | task type/status | missing/invalid output fails closed; valid PASS/FAIL becomes completion result | Single Buster output authority. |
| V05-L004 | V05 | repo path resolver | absolute/traversal/null/sibling paths | candidate/base/scope/repo | reject or resolve inside repo/scope | Prevents path escape. |
| V05-L005 | V05 | verify-task scope | project slug and git path relation | project id/git paths | valid scope or reject | Limits staging to project `.swarm`. |
| V05-L006 | V05 | common helper inventory | common inventory vs shim files | effective files/imports | require Nova/Buster shims and local imports | Shared helper ownership. |
| V05-L007 | V05 | strict CLI parser | unknown/missing/required/positional flags | argv + declared schema | parsed values or parser error | Deterministic CLI behavior. |

## V05 state mutations / merge behavior

| ID | Batch | File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- | --- | --- |
| V05-LS001 | V05 | Buster active-agent fixture | lifecycle-backed active-session fixture | active session identity | helper writes identity; mismatched clear preserved; matched clear nulls | No direct `status.active_agent` mutation in main source. |
| V05-LS002 | V05 | Buster result fixture | temp output/status artifacts | task payload `output_file` | `output_file` is required; stale status JSON alone is ignored | Canonical outcome/source. |
| V05-LS003 | V05 | common git primitive fixture | temp repos and head cache | repo A/B heads/invalidation | cache scoped per repo; invalidation refreshes selected repo only | No cross-repo head hash bleed. |
| V05-LS004 | V05 | strict CLI lint fixture | temp lint report JSON | changed-files list with missing file | filter existing files before report generation | Report includes only existing changed file. |

## V05 loops / polling / timeout mechanics

| ID | Batch | File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- | --- | --- |
| V05-LL001 | V05 | `runSuiteWithTimeout` fixture | suite callback races timeout | configured timeout ms | 1234 ms in fixture | fast suite returns PASS and clears timeout. |
| V05-LL002 | V05 | source inventory scans | file lists remain | none | none | all declared files checked or assertion fails. |
| V05-LL003 | V05 | V05 scripts generally | no live polling loops | None found in scoped files | None found in scoped files | assertion pass/fail. |

## V06a branch / routing conditions

| ID | Batch | File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- | --- | --- |
| V06a-L001 | V06a | deployment truth | rendered Nova/Buster manifest has expected services/deployments/config | Helm output/templates/files | pass or terminal assertion | Pins deployable chart truth. |
| V06a-L002 | V06a | deployment truth | broad silent fallback markers appear | deploy/setup source | terminal assertion failure | Prevents swallowed operator failures. |
| V06a-L003 | V06a | lifecycle packaging helpers | image general/sandbox/unknown | image argument | build manifest or throw | Runtime materialization authority. |
| V06a-L004 | V06a | shared helper overwrite | shared helper dest path with common final owner | manifest owners | allowed intentional overwrite | Common helper replaces shims. |
| V06a-L005 | V06a | telemetry contract path | JS/non-md/missing/markdown | `--contract` path | descriptive throw or accepted path | Prevents verifier-as-contract mistakes. |
| V06a-L006 | V06a | quiet console | verbose requested | `--verbose`, `VERIFICATION_VERBOSE` | no capture or buffered capture | Clean JSON by default. |
| V06a-L007 | V06a | live Redis smoke | enable env and `REDIS_HOST` present | env vars | skip or live run | Avoids accidental live dependency. |
| V06a-L008 | V06a | live Redis cleanup | cleanup operations fail | Redis/disconnect/fs operations | warn and continue | Best-effort fixture cleanup. |

## V06a state mutations / merge behavior

| ID | Batch | File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- | --- | --- |
| V06a-LS001 | V06a | deployment truth | no repo state | Helm renders/source reads | source artifacts must equal rendered literal blocks | Repo-only verifier is read-only. |
| V06a-LS002 | V06a | `buildManifest` | in-memory manifest/owners | image packaging layers | later layer overwrites destination; common helper overwrite is intentional | deterministic runtime ownership. |
| V06a-LS003 | V06a | `materializeRuntimeTree` | temp runtime tree | manifest owner paths | copy final owner to runtime tree | isolated import fixture. |
| V06a-LS004 | V06a | fake Redis | fake node module/global stores | runtime root/fake calls | write fake `ioredis`; append operation calls | test transport call log. |
| V06a-LS005 | V06a | live Redis smoke | live streams/temp Git repo | generated ids/task payload | dispatch, process, read matching completion, cleanup | live identity verified. |

## V06a loops / polling / timeout mechanics

| ID | Batch | File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- | --- | --- |
| V06a-LL001 | V06a | `walkFiles`/`effectiveFiles` | directory entries remain | none | none | all files collected. |
| V06a-LL002 | V06a | markdown table extraction | table lines remain | none | none | first table/field map extracted. |
| V06a-LL003 | V06a | live Redis ready wait | Redis not ready | event listeners | 10s timeout | ready or timeout/error. |
| V06a-LL004 | V06a | fake async flush | single event-loop tick | `setTimeout(0)` | none | promise resolves after tick. |

## V06b branch / routing conditions

| ID | Batch | File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- | --- | --- |
| V06b-L001 | V06b | `parseLaunchArgs` | numeric flag malformed/out of range | timeout/poll values | throw | Prevents weakened launch checks. |
| V06b-L002 | V06b | `observeSessionLaunch` | status success/not-found/non-not-found error | gateway status/error kind | visible, retry, or degraded error result | Launch visibility semantics. |
| V06b-L003 | V06b | `assessLaunchVerification` | contradictory observation | visible/active/state | invalid observation and fail closed | Prevents contradictory evidence. |
| V06b-L004 | V06b | `assessLaunchVerification` | terminal/stopped/keep-session flags | wrapper flags and observed state | stream-log degraded evidence, stopped cleanup, or cleanup null | Runtime-specific acceptance. |
| V06b-L005 | V06b | pipeline lock hardening | existing lock owner vs rightful owner | lock token/pid/run | reject contention or release | Single active owner. |
| V06b-L006 | V06b | runtime collisions | collisions/owner/import/common drift | manifests/import scans | JSON report and exit 1 on drift | Runtime image integrity. |
| V06b-L007 | V06b | startup smokes | syntax/import/help/status failure | subprocess/import results | assertion failure | Entrypoint integrity. |

## V06b state mutations / merge behavior

| ID | Batch | File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- | --- | --- |
| V06b-LS001 | V06b | final gate lock fixture | temp leased `active-run.lock.json` | lock config/module/token/lease fields | only rightful token releases; wrong token preserves file and throws | single-owner leased-lock invariant. |
| V06b-LS002 | V06b | runtime collision materialization | temp effective skills/runtime trees | source/overlay files | overlay effective tree and final image owners | importable runtime surface. |
| V06b-LS003 | V06b | session launch verification | remote session lifecycle | spawn options and cleanup flag | spawn, observe, optional kill, assess | JSON launch result with evidence/reasons. |

## V06b loops / polling / timeout mechanics

| ID | Batch | File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- | --- | --- |
| V06b-LL001 | V06b/RV-11 | `observeSessionLaunch` | launch-observation budget has remaining time | `waitForAny(acp.session.state/fatal.error)` while adapter owns gateway polling | wrapper/default attempts/ms converted to budget | success, degraded status error, or budget exhausted. |
| V06b-LL002 | V06b | `killSession` cleanup | common lifecycle cleanup confirm | 500ms poll | 30s confirm and cleanup timeouts | cleanup confirmed or not. |
| V06b-LL003 | V06b | startup subprocesses | process timeout | none | 10s default timeout | process exits or timeout. |
| V06b-LL004 | V06b | runtime collision scans | files remain | none | none | all files/imports scanned. |
