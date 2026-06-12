# Authority map

Status: P00a-P23b, B00a-B05, C00a-C00b, S00, V00-V01b, V02a1-V03a, OI-39, OI-41 completed; OI-42 phase 6 cleanup complete; OI-43 phase 5 updated; RV-04/RV-06/RV-23/RV-28/RV-30/RV-32/RV-34 resolved; OI-47 resolved

RV-28 precedence: lifecycle/read-models are gate scheduler, restart, dependency, and approval wait authority; typed gate output is Buster terminal completion authority; `gate-status.json` is only approval wait-source evidence for approval gates or diagnostic evidence elsewhere. Local `gate-status.json` never grants completion, scheduler, dependency, restart, or domain rate-limit authority.

| ID | Batch | State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- | --- | --- |
| AO6-A001 | AO6 | Exclusive agent observability and lifecycle authority | OpenClaw hook observer plugin -> `pipeline:agent-observability:{control,payload}:v1` -> agent-observability ingester -> canonical `agent.*` telemetry where promoted | Forge readiness, module/gate lifecycle projections, ClawDeck canonical timeline/raw debug views | The hook plugin path is the only authority for agent runtime observability facts and lifecycle. ACP/Gateway polling, transcript/session monitor state, and `forge-completion.json` cannot decide agent lifecycle/readiness or act as competing observability truth. Missing hook evidence is degraded/fail-closed, not fallback. |
| AO6-A002 | AO6 | Gateway command/control boundary | Gateway wrappers for spawn, stop/kill, steer/nudge, and health checks | Orchestration command callers | Gateway responses are command acknowledgements or platform-health evidence only; they are not lifecycle truth and must not be promoted to completion authority. |
| AO5-A001 | AO5 | Forge completion authority | `skills/nova/pipeline/services/agent-observability-forge-completion.ts`, `pollForgeCompletion(...)`, `runModuleForgeWorker(...)` dispatch identity | Module Forge runner | Canonical `agent.ended` telemetry plus meaningful git diff evidence replaces `forge-completion.json` as active readiness authority; no-work evidence fails/retries. Phase 6 removes the temporary ACP session-monitor fallback. |
| AO5-A002 | AO5 | Forge quality authority boundary | Buster/reviewer/lint/test stages after Forge readiness | Module runner, Buster, review gates, validators | Phase 5 only decides whether Forge produced meaningful work ready for testing; it does not grant PASS or quality approval. |
| AO4-A001 | AO4 | Agent-observability parallel-run evidence authority | `skills/nova/pipeline/services/agent-observability-evidence/{types,comparator,index}.ts` | Operators, contract tests, historical cutover review | Observe-only comparison output; it correlates hook records with legacy ACP/Gateway evidence and Redis pressure snapshots but does not mutate lifecycle or telemetry mappings. Phase 6 makes this evidence historical/test-only, not a runtime fallback. |
| AO4-A002 | AO4 | ClawDeck raw/debug agent-observability rendering expectation | `docs/clawdeck-v4.html` prototype | ClawDeck/debug developers | Renders parallel evidence, stream pressure, coverage, and span warnings as debug visibility only; canonical timeline authority remains existing telemetry. |
| AO3-A001 | AO3 | First-class agent-observability telemetry schema authority | `docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md`, `docs/telemetry-event-schema.md`, `skills/common/pipeline/services/telemetry/payload-schema.ts`, `skills/nova/pipeline/services/agent-observability-ingester/mapper.ts` | Existing telemetry spine, ClawDeck canonical telemetry readers, agent-observability ingester | Defines stable `agent.*` schemas and maps promoted control events to them; does not change lifecycle control authority, consume raw payload stream by default, replace Forge completion, or retire legacy polling. |
| AO2-A001 | AO2 | Agent-observability control-stream ingester | `skills/nova/pipeline/services/agent-observability-ingester/{config,consumer,mapper,index}.ts` | Existing telemetry spine, Redis control/dead-letter streams, operator health surfaces | Disabled by default; validates Phase 0 events and emits only promoted control events through `emitEvent(...)`; does not consume payload stream, create first-class schemas, replace Forge completion, or retire polling paths. |
| AO1-A001 | AO1 | Standalone OpenClaw hook observer Redis writer | `plugins/openclaw-agent-observer/src/{index,hook-normalizers,redis-writer,redis-transport,config}.ts` plus plugin-local `src/agent-observability/` | OpenClaw plugin runtime hooks, raw/debug Redis readers, kubeclaw ingester | Plugin is observe-only and writes only `pipeline:agent-observability:{control,payload}:v1`; it is self-contained and does not import from `/app/skills`, emit canonical telemetry, decide lifecycle, replace Forge completion, or consume Redis. |
| AO0-A001 | AO0 | Agent-observability ingress contract and routing vocabulary | Read-side contract: `skills/common/pipeline/agent-observability/src/{constants,types,validation,masking,routing,mapping}.ts`; role shims: `skills/{nova,buster}/pipeline/agent-observability/src/index.ts`; plugin-local write-side mirror: `plugins/openclaw-agent-observer/src/agent-observability/` | Kubeclaw ingester, ClawDeck/debug readers, contract verification, plugin writer mirror | None. Phase 0 defined contracts only; runtime Redis writer authority is AO1 and does not consume streams, emit telemetry, or alter lifecycle authority. |
| P00a-A001 | P00a | Nova public API export surface | `skills/nova/pipeline/index.ts` | `skills/nova/pipeline.ts`, runtime importers, verification tests | None. |
| P00a-A002 | P00a | Executable compatibility entrypoint | `skills/nova/pipeline.ts` | Operators invoking `/app/skills/pipeline.ts`; verification tests | None. |
| P00a-A003 | P00a | CLI command routing and terminal exit at entrypoint | `skills/nova/pipeline/cli.ts main` | Operators; wrapper shim | Includes targeted strict-parser error presentation before command routing; invalid argv exits through the CLI JSON error envelope. |
| P00a-A004 | P00a | Runtime model/thinking override attachment | `skills/nova/pipeline/cli.ts normalizeNovaCliFlags` owns frozen canonical `runtimeModel`/`runtimeThinking`; `main` mutates `config._runtimeOverrides` from those fields only | `core/policy.js` resolver outside scoped files | None. Raw parser `model`/`thinking` keys are deleted at the CLI anti-corruption boundary. |
| P00a-A005 | P00a | Approval gate lifecycle/read-model authority | Documented by `skills/nova/pipeline/README.md`; implementation outside P00a | Operators/docs | Later approval/status batches must verify doc and implementation agree. |
| P00a-A006 | P00a | Operator remediation prompt ingress boundary | `skills/nova/pipeline/services/prompt-ingress.ts` | CLI, Forge prompt builder, review fix prompt builder, contract verification | None. This is the sole runtime boundary for `--prompt`/`--prompt-file` size, file realpath, placeholder redaction, and XML-fenced directive formatting. |
| P00b-A001 | P00b | Nova top-level shared helper shim files | `skills/nova/pipeline/*.ts` shim files in P00b as static facades only | Nova production-local imports and verification tests | None. |
| P00b-A002 | P00b/RV-23 | Shared helper implementation authority | `skills/common/pipeline/{git-primitives,lifecycle-state,noncritical-reporting,redaction,security,telemetry,timing}.ts` | Nova/Buster compatibility shims and runtime `/app/skills/pipeline/*` overwrite | Common timing owns `BudgetExhaustedError`, abortable sleep, and authorized budget extensions; P00b confirms Nova shim surface. |
| P00b-A003 | P00b | Production-local import boundary | Nova runtime modules importing `../<helper>.js` or equivalent local shim path | `check-common-helper-import-surface.mjs` | None. Contract forbids direct `common/pipeline` imports outside shims. |
| P01-A001 | P01 | Startup config/progress validation | `core/config.js validateConfig` | CLI/runners/services | None. |
| P01-A002 | P01 | Platform swarm config discovery order | `core/platform-config.js` | `core/config.js`, lint discovery/docs | None. |
| P01-A003 | P01 | Status/exit/plugin constants vocabulary | `core/constants.js` | Registry/contracts/public index | None. |
| P01-A004 | P01 | Pipeline runtime state bridge | `core/context.js PipelineContext`; `core/runtime.js bindRunContext` | Logger/runtime/services | Compatibility config mutation remains until callers migrate ctx-first. |
| P01-A005 | P01 | Plugin context capability surface | `core/context.js createPluginContext` | Plugin runners/dispatch services | None. |
| P01-A006 | P01 | Structured logger active context | `core/logger.js` | Runtime resolver and callers of `log` | None. |
| P01-A007 | P01 | Canonical path builders | `core/paths.js` | Status/gate/module/telemetry/services | Includes OI-39 durable artifact resolvers plus RV-30 module/gate Buster payload refs; helpers use resolved-root prefix boundaries and reject absolute/traversal inputs. |
| P01-A008 | P01 | Model/thinking policy resolution | `core/policy.js resolvePolicy`; `VALID_THINKING_LEVELS` enum | Runners, telemetry, and Nova CLI help | None; CLI help renders the thinking enum from policy. |
| P01-A009 | P01 | Run identity/stats | `core/runtime.js` | Context/logger/services | None. |
| P01-A010 | P01 | Temp scratch lifecycle | `core/temp.js` | CLI/downstream temp users | None. |
| P02-A001 | P02 | Startup plugin registry | `core/registry.js buildPluginRegistry` | Config/context/runners/plugin dispatch | Invalid manifest kind now fails through formatted registry validation errors. |
| P02-A002 | P02 | Built-in plugin catalogue | `core/registry/builtins.js` | Registry assembly | Notification/telemetry sink details reviewed later. |
| P02-A003 | P02 | Plugin config normalized shape | `registry/config-normalization.js` | Registry assembly and validation | Custom discovery intentionally reserved. |
| P02-A004 | P02 | Plugin v1 manifest/config/capability/trust validation | `registry/validation.js` | Registry assembly | Unknown `manifest.kind` is recorded as `REGISTRY_MANIFEST_INVALID`; capability policy maps default to empty arrays so validation errors aggregate without `TypeError`. |
| P02-A005 | P02 | Stage owner/hook/gate type indexes | `registry/indexes.js` | Registry lookups and gate config validation | None. |
| P02-A006 | P02 | Static critical adapter registry | `services/adapter-registry.js` | Orchestration, polling, summary | None. Registry accepts only canonical keys and active runtime tool paths; removed aliases throw `UnknownAdapterError`. |
| P02-A007 | P02 | Module dependency readiness | `services/dependencies.js` | Module scheduler/runners | Status-store projection authority reviewed later. |
| P02-A008 | P02 | Preflight/delivery validation result schema | `services/validation.js` | Validator stages/control-result conversion | None. |
| P03-A001 | P03 | Discord webhook delivery state | `integrations/discord.js` | Telemetry degraded/restored events, operators | None. |
| P03-A002 | P03 | Discord audit JSONL | `integrations/discord.js appendDiscordAuditEntries` | Operators/tests | Audit entries are presentation/evidence only and are sanitized through `sanitizeJsonEgress` even when webhook delivery is disabled. |
| P03-A003 | P03 | Gateway endpoint/token resolution | `skills/common/pipeline/integrations/gateway.ts` via Nova shim | Gateway callers | None. |
| P03-A004 | P03 | Nova Git worktree policy | `integrations/git-worktree.ts` | Module runners/polling/gate fix/blueprint flows | Runtime-state classification uses the single `.swarm` path segment and normalizes Git-relative, slash-prefixed, and repo-prefixed paths without stripping the dot. |
| P03-A005 | P03 | Shared Discord identity field schema and surface sets | `skills/common/pipeline/services/rate-limit-contract.ts`, re-exported by `skills/nova/pipeline/services/discord-fields.ts` | Lifecycle, gate, approval, module, pipeline, failure, and rate-limit Discord callers | `DISCORD_IDENTITY_SURFACES`/`DISCORD_IDENTITY_FIELD_SETS` own field selection; callers use `buildDiscordIdentitySurfaceFields` directly instead of local wrapper helpers. |
| P03-A006 | P03 | Redis exchange and ops JSONL artifacts | `services/redis-log.js` writer; path targets from `core/paths.js redisLogArtifactTargets` | Redis services/operators | None. |
| P03-A007 | P03 | Nova Redis adapter surface | `tools/redis.ts`, selected by `services/adapter-registry.js` | Orchestration/polling/completion services | Completion algorithm authority is `services/redis-completion.js`; task publish authority is the common TaskQueue transport contract. |
| P04-A001 | P04 | ACP monitor state and transcript delta schema | `skills/common/pipeline/agents/acp-monitor.ts` via Nova/Buster shims | Polling, orchestration healthcheck, Buster monitor/rate-limit | None. |
| P04-A002 | P04/OI-41 | Active session record and lifecycle facade | `skills/common/pipeline/agents/lifecycle.ts` via shims; tracked-agent functions re-export the neutral registry | Nova orchestration, reviewer lifecycle, current-process shutdown | Tracked-agent map is process-local diagnostic evidence only; lifecycle remains the facade for existing callers and never hydrates restart authority from persisted files. |
| P04-A003 | P04 | Runtime/harness classification | `skills/common/pipeline/agents/runtime.ts` via shims | Lifecycle spawn/kill and verification launch helper | None. |
| P04-A004 | P04 | Session state semantic vocabulary | `skills/common/pipeline/agents/session-semantics.ts` via shims | ACP monitor, lifecycle, downstream monitors | None. |
| P04-A008 | P04/RV-14 | Runtime session termination result | `skills/common/pipeline/agents/session-termination.ts` plus `assertValidSessionTerminationResult` | Nova orchestration/reviewer/shutdown/recovery/summary and Buster monitor/task lifecycle | Sole authority for confirmed/unconfirmed/terminal/cleanup teardown result shape and isolated grace-period confirmation. |
| P04-A005 | P04 | Shutdown signal handling and reaper | `skills/nova/pipeline/agents/shutdown.ts` | CLI/module runner/orchestration | None. |
| P04-A006 | P04 | Agent health degraded/restored state | `skills/nova/pipeline/agents/orchestration-healthcheck.ts` on tracked entry | Telemetry/observability sinks and worker health callers | None. |
| P04-A007 | P04 | Interrupted module status transition on process signal | `shutdown.js` plus lifecycle-state/status-store | Status readers | Full status-store authority reviewed in P14/P15. |
| P05-A001 | P05 | Module worker typed control result | `module-worker-control-results.ts` with shared contract helper | Module runners, registry built-ins, verification contracts | None. |
| P05-A002 | P05 | Module worker execution envelope | `module-workers.js` | Module runners/orchestration exports | Polling/status-store authority reviewed later. |
| P05-A003 | P05 | Agent dispatch route | `orchestration.ts spawnAgent/killAgent/steerAgent` | Module/gate runners and registry built-ins | None. |
| P05-A004 | P05 | Redis Buster task payload schema | `orchestration.ts buildBusterPayload` plus `core/paths.js` refs; Buster `validateBusterTaskPayload` preflight | Buster task pipeline, Redis dispatch, tests | Payload path fields are produced by named boundary helpers and fail closed on absolute/traversal values before task execution. |
| P05-A005 | P05 | Redis dispatch adapter process cache | `orchestration.ts _redisDispatchModules` | `dispatchRedisTask` | None. |
| P05-A006 | P05 | Agent/reviewer tracked lifecycle metadata | `orchestration.ts`, `reviewer-lifecycle.js` through shared lifecycle | Healthcheck, shutdown, telemetry, kill paths | Shared lifecycle map authority reviewed in P04. |
| P05-A007 | P05 | Lifecycle telemetry/Discord payload builders | `orchestration-lifecycle-events.js` | Orchestration and reviewer lifecycle | Full Discord field schema reviewed in rate-limit contract batch. |
| P06-A001 | P06 | Pipeline run concurrency lock | `pipeline-runner-lock.js` re-exported by `pipeline-runner-recovery.js` | Runner start/tests/operators | Strict leased-lock authority with heartbeat/expiry; stale leased locks can be reclaimed, malformed/non-lease records fail closed with CRITICAL durable operator evidence. |
| P06-A002 | P06 | Top-level run sequence | `pipeline-runner.js runPipeline` | CLI/public skill surface | None. |
| P06-A003 | P06 | Scheduler next-step decision | `pipeline-runner-scheduling.js findNextStep` | Pipeline loop/dry-run/status tests | Status-store read-model authority reviewed in P14/P15. |
| P06-A009 | P06 | Pipeline loop state-machine action routing | `pipeline-runner-state-machine.js` | Pipeline loop/terminal handling | Owns done/blocked/validator/gate/module action dispatch; scheduler selection and terminal side effects stay in their existing authorities. |
| P06-A004 | P06 | Scheduled validator completion state | `validator-completions.js` | Scheduler/loop/resume | None. |
| P06-A005 | P06 | Pre-pipeline architecture validation decision | `pipeline-runner-start.js` | Pipeline start | Full validator implementation reviewed in P19. |
| P06-A006 | P06 | Terminal exit mapping and pipeline halt/completion side effects | `pipeline-runner-terminal.js` | CLI exit/public outputs/telemetry | None. |
| P06-A007 | P06 | Pipeline runner dependency injection seam | `pipeline-runner-deps.js` | Tests and helper modules | None. |
| P06-A008 | P06 | Stale session recovery decisions | `pipeline-runner-recovery.js` with session authority and ACP monitor | Startup recovery and operators | None. |
| P07-A001 | P07 | Public module retry loop | `module-runner.ts` | Pipeline runner loop | Attempt internals reviewed in P08. |
| P07-A002 | P07 | Forge phase status transition/outcome mapping | `module-runner-forge.ts` | Attempt orchestrator, telemetry, status-store | None. |
| P07-A003 | P07 | Pre-Buster validation milestones | `module-runner-prebuster.ts` and `status.validation` | Buster handoff and recovery | None. |
| P07-A004 | P07 | Buster worker plugin execution boundary | `module-runner-buster-worker.ts` | Buster phase internals | Full Buster phase reviewed in P08. |
| P07-A005 | P07 | Module worker/validator plugin input schemas | `module-runner-shared.ts` | Plugin handlers/contracts/tests | None. |
| P07-A006 | P07 | Module runner typed pipeline-step projection | `module-runner-shared.ts` with pipeline-step contract | Pipeline loop/terminal handling | None. |
| P08-A001 | P08 | One-attempt module phase sequence | `module-runner/state-machine.ts` | `attempt.js`, public retry loop, pipeline runner | Owns loaded-status, blueprint/init, Forge, forge-only, pre-Buster, Buster, retry/terminal, and unexpected-status action routing; phase side effects remain in narrow collaborators. |
| P08-A002 | P08 | Buster phase crash retry budget and routing | `buster-phase.ts`, `poll-failure.js`, `terminal-failure.js` | Module runner/status/telemetry | Existing `P07-ISSUE-001` for guarded status save failure. |
| P08-A003 | P08 | Buster completion correlation precedence | `buster-phase/identity.ts` | Buster terminal/poll handlers | None. |
| P08-A004 | P08 | Buster prompt/config validation dispatch boundary | `buster-phase/dispatch.ts` | Buster worker adapter | None beyond P07 issue. |
| P08-A005 | P08 | Module terminal/retry envelope | `terminal-results.js` | Public module runner typed projection | None. |
| P08-A006 | P08 | Preflight contract gate | `preflight.js` | Forge phase | None. |
| P09-A001 | P09 | Generic gate dispatch/orchestration envelope | `gate-runner.js` | Plugin handlers and tests | Sole scheduler-facing GateRunner entrypoint; no concrete gate-type dispatch table. |
| P09-A002 | P09 | Gate strategy mode, coercion, and adapter validation | Registry `gateControl` adapter | `gate-runner.js` | Gate-specific files provide evaluation/controller factories only; adapters reviewed in P10-P12. |
| P09-A003 | P09 | Remediable gate loop mechanics | `remediable-gate-engine.js` | Review/Buster gate adapters and remediation contract helpers | None. |
| P09-A004 | P09 | Waitable gate loop mechanics | `waitable-gate-engine.js` and gate wait controller | Approval gate adapters | None. |
| P09-A005 | P09 | Gate Forge fix side effects | `gate-fix-scaffold.js` | Generic fix-cycle engine/gate recovery | None. |
| P09-A006 | P09 | Gate active-session recovery evidence | `gate-active-session.js` | Restart recovery/gate fix scaffold/tests | Lifecycle read model remains authoritative; file/tracked are evidence only. |
| P09-A007 | P09 | Stage ref/envelope primitives | `stage-envelope-primitives.js` | Module/gate/generator input builders | None. |
| P10-A001 | P10 | Review JSON status contract | `review-gate-output.js parseReviewOutputContent` | Review task/runner/control builders | None. |
| P10-A002 | P10 | Review gate typed control result | `review-gate-control.js` | Generic gate runner/remediable engine | None. |
| P10-A003 | P10 | Review gate evaluation and remediation controller factory | `review-gate-runner.js` | Registry stage handler and generic GateRunner | Scheduler orchestration stays in `gate-runner.js`; `runReviewGateStage` is the registry path. |
| P10-A004 | P10 | Echo review task side effects | `review-gate-task.js` | Review runner/operators/recovery | None. |
| P10-A005 | P10 | Review fix prompt and adapter policy | `review-gate-fix-cycle.js` | Generic Forge fix cycle engine | None. |
| P10-A006 | P10 | Review active-session recovery evidence | `review-gate-task.js` plus shared `gate-active-session.js` | Restart recovery | Lifecycle read model remains authoritative. |
| P11-A001 | P11 | Buster gate completion adapter | `buster-gate-completion.js` maps `buster-completion-controller.js` results | Generic gate runner terminal handling | Thin adapter only; P17 owns Redis/local completion authority and adjudication. |
| P11-A002 | P11 | Buster typed control and remediation request | `buster-gate-control.js` | Generic gate runner/remediable engine | None. |
| P11-A003 | P11 | Buster gate dispatch identity | `buster-gate-task.js` | Runner/completion/rate-limit/telemetry | None. |
| P11-A004 | P11 | Buster gate evaluation and remediation controller factory | `buster-gate-runner.ts` | Registry stage handler and generic GateRunner | Scheduler orchestration stays in `gate-runner.js`; `runBusterGateStage` is the registry path. |
| P11-A005 | P11 | Buster terminal outcome mapping | `buster-gate-terminal.js` | Runner/generic gate projection | None. |
| P11-A006 | P11 | Buster fix prompt/retest cleanup policy | `buster-gate-fix-cycle.js` | Generic Forge fix cycle | None. |
| P12-A001 | P12 | Approval typed control/wait result | `approval-gate-control.js` | Waitable gate engine/generic runner | None. |
| P12-A002 | P12 | Approval timeout-policy normalization | `approval-gate-shared.js` | Runner/control/state helpers | None. |
| P12-A003 | P12 | Approval persisted state and audit artifacts | `approval-gate-state.js` | Runner/approval signal adapter/operators | None. |
| P12-A004 | P12 | Approval lifecycle/read-model sync | `syncApprovalWaitState` called by `approval-gate-runner.js` | Status-store read models/gate runner | Full status-store authority reviewed P14/P15. |
| P12-A005 | P12 | Approval operator wait resolution and controller factory | `approval-gate-runner.js waitForApprovalSignalFlow` plus `approval-signal-event-adapter.js` | Waitable gate engine, EventBus, and generic GateRunner | Scheduler orchestration stays in `gate-runner.js`; runner waits only on canonical `approval.signal`/`fatal.error` events. |
| P13-A001 | P13 | Typed gate control results | `gate-control-result.js` | Gate runners/generic gate runner/pipeline-step projection | None. |
| P13-A002 | P13 | Typed pipeline-step results | `pipeline-step-result.js` | Pipeline runner/exit mapping/compat projection | None. |
| P13-A003 | P13 | Typed validator control results | `validator-control-result.js` | Validator services/pipeline scheduling | None. |
| P13-A004 | P13 | Typed worker control results | `worker-control-result.js` | Module runner worker phases | None. |
| P13-A005 | P13 | Generator result contract | `generator-result.js` | Generator services/tests | Builder, artifact refs, validator, coercer, and normalizer own the sole accepted v1 generator result shape. |
| P13-A006 | P13 | Contract namespace surface | `index.js` | Import consumers | None. |
| P14-A001 | P14 | Canonical lifecycle event log | `appendLifecycleEvent` | Read-model projector, tests/operators | None. |
| P14-A002 | P14 | Lifecycle read models | `applyLifecycleEventToReadModels` + `saveLifecycleReadModels` | Scheduler/status compatibility/gate and module readers | P15 covers compatibility overlays. |
| P14-A003 | P14 | Module guarded lifecycle fields | `saveStatus` only with explicit lifecycle mutation and `appendModuleLifecycleEvent` | Module status readers/scheduler | `P07-ISSUE-001` resolved the observed caller save violation; `saveStatus` remains the guard authority. |
| P14-A004 | P14 | Lifecycle transition legality | `ensureLifecycleEventLegal` | All appenders through `appendLifecycleEvent` | None. |
| P14-A005 | P14 | Lifecycle idempotency | `buildLifecycleIdempotencyKey` | `appendLifecycleEvent` | None. |
| P14-A006 | P14 | Lifecycle refs | `refs.js` builders | Events, read models, correlation consumers | None. |
| P14-A007 | P14 | Prompt/transcript artifacts | `savePrompt`, `saveStreamLog` | Operators/debugging and `system.io_warning` evidence on prompt write failure | Non-authoritative artifacts; prompt write failure warnings are diagnostic telemetry, not lifecycle authority. |
| P14-A008 | P14 | Module lifecycle read models | lifecycle appenders/storage | status readers, scheduler, recovery, and operator tooling | Canonical pipeline authority for module state. |
| P15-A001 | P15 | Compatibility authority key list | `compatibility-authority.js` | Contract validators/pipeline-step builder | None. |
| P15-A002 | P15 | Active-session authority policy | `session-authority.js` | Module status snapshot authority | None. |
| P15-A003 | P15 | Module scheduler state projection | `module-projection.js` | Pipeline/dependency/truth-drift/status readers | None. |
| P15-A004 | P15 | Gate scheduler state projection | lifecycle read models plus `gate-projection.js` output projection | Gate runners/dependency/truth-drift/status readers | RV-28: lifecycle/read-models and typed gate output take precedence; `gate-status.json` cannot become scheduler/dependency/restart or rate-limit authority. |
| P15-A005 | P15 | Buster gate completion evidence | `readBusterGateCompletion` | Buster gate runner/resume/dependency checks | None. |
| P15-A006 | P15 | Truth drift report | `truth-drift.js` | Operators/tests | Diagnostic only; not scheduler authority. |
| P15-A007 | P15 | Legacy status/gate-status artifacts | Status/gate writers | Compatibility projections | Explicitly downgraded to module diagnostic/bootstrap, approval wait-source evidence, or non-approval gate diagnostic evidence only. |
| OI39-A001 | OI-39/RV-30 | Durable artifact path construction | `core/paths.js` | Gate/review runners, approval state/governance, Redis log service, prompts/orchestration/status projections, Buster payload refs | No open question; helpers reject unsafe swarm-relative/repo-relative paths, Redis nested file names, and module/gate Buster path escapes. |
| OI39-A002 | OI-39 | Gate output path authority | `core/paths.js gateOutputPath` | Buster/review runners, gate runner refs, prompts, orchestration, status-store gate projection | Output file content authority remains the typed gate output contract; this row owns path resolution only. |
| OI39-A003 | OI-39 | Approval audit artifact path authority | `core/paths.js approvalGateArtifactPaths` and `approvalGateArtifactRefPaths` | Approval state writer and governance summary context | Approval lifecycle/read-model authority remains status-store; these artifacts are audit/operator evidence. |
| P16-A001 | P16 | Durable disk telemetry event mirror | `appendStructuredEvent` via `emitEvent` | Operators/tests/replay | None. |
| P16-A002 | P16 | Telemetry sink input contract | `telemetry-sink-contract.js` | Sink dispatch and sink plugins | None. |
| P16-A003 | P16 | Telemetry sink listener registry | Startup-frozen plugin registry consumed by `dispatchTelemetrySinks` | Telemetry dispatch | None. |
| P16-A004 | P16 | Redis telemetry stream | `emitTelemetryStreamEvent` | Live consumers/ClawDeck/tests | Non-authoritative projection. |
| P16-A005 | P16 | Discord telemetry sink | `observeDiscordTelemetrySink` | Operators/Discord audit integration | Explicit presentation only. |
| P16-A006 | P16 | Usage/cost artifacts | `observability.js` | Cost report/summary/operators | None. |
| P16-A007 | P16/RV-25 | Observability degraded/restored state | Central `observability.js` health map via `recordObservabilityDegraded` / `recordObservabilityRestored` | Operators/tests | One run-scoped circuit-breaker state machine controls dedupe; callers and sinks keep no local health history. |
| P16-A008 | P16 | Core telemetry event payload schemas | common `services/telemetry/payload-schema.js` via Nova/Buster shims | Telemetry builders/progress/observability dispatch, Buster producer, consumers/tests | Central registry validates core canonical payloads and the generic `plugin.event` extension surface before sink dispatch/disk projection/emission. |
| P16-A009 | P16 | Durable local operator alert evidence | `services/durable-operator-alert.js appendDurableOperatorAlert` | Terminal alert producers, operators, verification | Local JSONL is written before Redis/Discord/sink dispatch and is diagnostic/operator evidence, not lifecycle state authority. |
| OI43-A001 | OI-43 phase 2 | Git commit/push soft-fail degraded payload | `skills/nova/pipeline/services/git-soft-fail-observability.ts` | Module/gate orchestration callers that intentionally use `gitCommitAndPush(..., { softFail:true })` | Stable payload owner for `git_worktree` / `commit_push` / `git_commit_push_soft_failed`; callers retain module/gate correlation authority and low-level git retry helpers remain telemetry-free. |
| OI43-A002 | OI-43 phase 3 | Point-in-time system I/O warning payload | `skills/nova/pipeline/services/system-io-warning.ts` | `core/policy.js logEffectivePolicy`, `core/logger.js writeEntry`, and `status-store.js savePrompt` | Generic helper owns `system.io_warning` emission contract; specializations own stable component/surface/reason/path-role values for model-policy, pipeline JSONL, and redacted prompt artifact failures while callers retain file-write context. |
| P17-A001 | P17 | Generic poll terminal result | `pollGeneric` plus caller check function | Polling callers | None. |
| P17-A002 | P17 | File poll completion | Output file writer external to polling | `pollForFile` | None. |
| P17-A003 | P17 | Module status poll completion | Status store/lifecycle authority | `pollStatus` | P07 existing issue covers one guarded save caller path. |
| P17-A004 | P17 | Buster Redis completion evidence | Buster pipeline EventBus producer through normalized Redis pipeline envelope | event-driven Buster completion controller/adapters, common Redis message contract, common transport contract, adjudicator | Active Buster module/gate waits consume schema-validated completion events; P11 only maps controller results to public gate poll-result shape. |
| OI42-A001 | OI-42/RV-11/RV-12 | In-process pipeline event envelope and wait contract | `skills/common/pipeline/services/pipeline-event-contract.ts`; `skills/common/pipeline/services/acp-gateway-contract.ts`; `skills/common/pipeline/agents/acp-monitor.ts` | Redis/local completion adapters, Buster completion controllers, ACP monitor event adapter, Nova/Buster compatibility shims | Normalizes event identity, validates event envelopes, requires `AbortSignal` cleanup for waits, and synchronously rejects malformed ACP session/transcript payloads. ACP monitor adapter is the authority for canonical `acp.session.state`/`acp.transcript.delta` emission and emits only changed state/new deltas. |
| OI42-A002 | OI-42 phase 2/5/6 | Completion evidence edge adapter emission | `skills/nova/pipeline/services/completion-event-adapters.ts` | Active Buster module/gate completion waits via `pipeline-event-contract.js` | Redis emits `completion.evidence` from a verified dedicated blocking client; local filesystem emits verified debounced `local.evidence.updated`. |
| OI42-A003 | OI-42 phase 3/5 | Buster event-driven completion wait decision | `skills/nova/pipeline/services/buster-completion-controller.ts` delegates Redis authority to `adjudicateCompletionEvidence` | Active Buster module/gate runner completion waits | Waits on completion/local/fatal events, resolves Redis terminal evidence immediately through existing adjudication, preserves gate local-output terminal fallback, and has Phase 5 module/gate wrapper coverage. |
| P17-A005 | P17 | Redis/local completion authority | `adjudicateCompletionEvidence` plus controller-provided local completion projection | `buster-completion-controller.js`, truth drift/status surfaces, P11 terminal adapter | Event-driven controller is the sole active Buster module/gate completion authority; downstream adapters do not re-adjudicate. |
| P17-A006 | P17/RV-11 | ACP session completion | ACP monitor EventBus state plus Git HEAD movement | `pollForSessionEnd`, `pollStatus`, `pollForFile` | `pollForSessionEnd` consumes ACP state/delta events; direct ACP polling authority lives in the common edge adapter. |
| P17-A007 | P17 | Redis completion archival | Redis adapter/service helpers | Buster dispatch and tests | None. |
| P17-A008 | P17 | Polling observability | Telemetry builders | Operators/tests | Observability only. |
| P18a-A001 | P18a | Normalized failure classes/codes | `failure-semantics.js` | Retry policy, lifecycle, telemetry | None. |
| P18a-A002 | P18a | Failure pattern guidance map | `classification.js` | Retry/presentation/operator docs | None. |
| P18a-A003 | P18a | Pre-test failure owner classification | `classifyPreTestFailure` | Buster/module failure paths | None. |
| P18a-A004 | P18a | Module retry/block/escalation decision | `handleFail` | Module runner/pipeline runner | Existing P07 issue for one guarded save behavior path. |
| P18a-A005 | P18a | Nova injection audit | `injectNeedsNova` | Operators/tests | None. |
| P18a-A006 | P18a | Failure-surface nonblocking incidents | `incidents.js` | Core logs/operators | None. |
| P18b-A001 | P18b/RV-23 | Rate-limit cooldown lifecycle and budget extension | `handleSessionRateLimit`, `resumeDurableCooldownForStep` | Pipeline loop/start, polling budgets, and lifecycle read models | None. Only recognized rate-limit handling may extend a shared budget, by exact cooldown plus configured buffer. |
| P18b-A002 | P18b | Module `RATE_LIMITED` status | `syncModuleRateLimitPause`, `syncModuleRateLimitResume` | Module runner, scheduler, telemetry | Existing P07 guarded-save issue remains relevant. |
| P18b-A003 | P18b | Terminal `rate_limit_exhausted` result | `rate-limit-exit.js` builders/finalizers | Polling/module/gate/summary terminal callers | None. |
| P18b-A004 | P18b | Rate-limit detected telemetry payload | `handleSessionRateLimit` using shared contract and common telemetry payload schema | Telemetry sinks/operators | Runtime payload validation is covered by common `services/telemetry/payload-schema.js`. |
| P18b-A005 | P18b | Redis-owned rate-limit terminal projection | `build*TerminalOwnedRedisRateLimitExitResult` | Polling/gate/module terminal handlers | Redis entry validation tracked by P17. |
| P19-A001 | P19 | Architecture validation findings | `arch-validator-checks.js`, `runAgentJudgment` | `runArchValidator`, artifacts, control result, governance | `EXEC_ORDER_ENTRY_INVALID` owns malformed execution-order entry classification before prefix routing. |
| P19-A002 | P19 | Architecture validator artifacts | `writeArtifacts` | Operators/governance/report extractors | Artifact failures are WARN-only. |
| P19-A003 | P19 | `validator:architecture` typed control result | `buildArchitectureValidatorControlResult` | Pipeline validator stage runner | None. |
| P19-A004 | P19 | Plugin contract-invalid diagnostics | `contract-diagnostics.js` with central redaction facade | Gate/worker/validator/generator contract normalizers | Raw/coerced objects are never diagnostic authority; redacted summaries and safe ids are. |
| P19-A005 | P19 | Built-in module validator typed results | `module-validators.js` through validator-control contract | Module runner/scheduled validator pipeline | Delegated exceptions handled by caller/plugin boundary. |
| P20-A001 | P20 | Pipeline artifact authority policy | `artifact-bundle.js` | Summary, status store, failure presentation, tests | None. |
| P20-A002 | P20 | Latest pointer | `writeSummary` / `buildLatestPointer` | Operators/status surfaces | Pointer only; not lifecycle authority. |
| P20-A003 | P20 | Plugin artifact index/data | `createPluginArtifactsApi.persist` | Plugin context/API callers | No locking in scoped files; concurrency risk not confirmed. |
| P20-A004 | P20 | Architecture branch materialized files | `blueprint.ts` | Module/gate runner and operators | Blueprint commits reject staged paths outside the selected architecture/control-file pathspecs and commit with explicit pathspecs. |
| P20-A005 | P20 | Pipeline summary JSON | `writeSummary` | Operators/governance/docs/tests | Filesystem summary/latest mirrors are sanitized through `sanitizeJsonEgress` before write. |
| P20-A006 | P20 | Pipeline review/case-study generator results | `summary.js` / `case-study.js` | Generator registry/pipeline terminal | Markdown instructions/results are scrubbed with `sanitizeMarkdownText`; P18b summary gateway fallback issue remains. |
| P20-A007 | P20 | Cost/token usage aggregate | OpenClaw `model.usage` snapshots via agent-observability ingester | Cost report, summary, budget checks, ClawDeck `cost.update` | None; no Gateway/runtime-stat fallback. |
| P20-A008 | P20 | Correlation bundle/provenance | `correlation.js` | Context, telemetry, failures, summaries | None. |
| P21-A001 | P21 | Governance summary context | `governance-context.js` | Summary and approval embeds | Ephemeral only; artifacts remain authoritative elsewhere. |
| P21-A002 | P21 | Lint/pre-check execution result | `lint.js` wrapper and lint-report tool | Module validators/review gate | P21 temp-file cleanup issue. |
| P21-A003 | P21 | Notification input schema and built-in sinks | `notification-contract.js` | Registry/dispatcher/listeners | None. |
| P21-A004 | P21 | Notification listener dispatch | `notification-dispatch.js` | Pipeline hook callers | Listener failures are log/result only by design/test. |
| P21-A005 | P21 | Gate remediation request schema/loop | `remediation-handoff.js` | Remediable gate engine, gate controls | None. |
| P22-A001 | P22 | Prompt result shape | `makePromptResult` | Module/gate runners | None. |
| P22-A002 | P22 | Historical Forge completion prompt/artifact contract | `shared.js`, `forge.js`, `forge-completion.js`, `polling.js` | Historical Forge agent/module runner compatibility surface | Superseded by AO6. `forge-completion.json` must not grant readiness or lifecycle authority; Phase 6 removes active prompt/parser/poller use. |
| P22-A003 | P22 | Buster result prompt contract | `shared.js` / Buster prompts | Buster agent and runner | Agent writes raw JSON `output_file` under exact schema/no-Markdown contract; runner/completion reader validates after write. |
| P22-A004 | P22 | Reviewer JSON prompt contract | `buildReviewerPrompt` | Echo/review agent and review gate parser | Reviewer writes raw JSON under exact schema/no-Markdown contract; parser validates after write. |
| P22-A005 | P22 | Gate/review fix prompts | `gate-fix.js`, `review.js`, `polling-session-end.js`, gate fix runners | Forge fix agents and pipeline git sync | Fix agents may only edit required project files, must not write status/completion/gate-output/Redis signals, and stop after local edits; pipeline session polling reports changed worktree and caller-owned git sync commits/pushes. |
| P23a-A001 | P23a | Project summary data object | `generateSummary` collectors | Summary service, CLI JSON output | Unit census uses nested `python.functions` / `frontend.functions`; module complexity uses `failCount`; structured data is sanitized through `sanitizeJsonEgress` before output. |
| P23a-A002 | P23a | Project summary markdown/embeds | `project-summary-formatters.ts` plus redaction facade | CLI/Discord/summary service | Hardest-module fail counts are normalized from collector `failCount`; Markdown is scrubbed with `sanitizeMarkdownText` to preserve tables/lists/headings. |
| P23a-A003 | P23a | Case-study base JSON | `buildCaseStudyBase` plus redaction facade | Case-study generator prompt/input | Test totals read collector-shaped unit census fields with legacy flattened-key fallback; hardest modules read `failCount` with `fails` fallback; JSON is sanitized with `sanitizeJsonEgress`. |
| P23a-A004 | P23a | Lint-report entry context | `lint-report.ts` | P23b report internals | Detailed tool authority in P23b. |
| P23b-A001 | P23b | Lint project type/scope | `discovery.ts` | Tool registry/report | None. |
| P23b-A002 | P23b | External command result shape | `safeExec` | Tool definitions | None. |
| P23b-A003 | P23b | Lint tool registry | `tool-registry.ts`, `container-yaml-tools.ts` | `runAllTools` | None. |
| P23b-A004 | P23b | Lint report schema and CLI cleanliness | `runAllTools` / `writeReport` / `lintReportExitCode` | `lint.js` wrapper, CLI operators | Tool failures remain `summary.tools_failed`; direct CLI exits nonzero for findings or failed tools. |
| P23b-A005 | P23b | Lint trace logs | `output.js` | Operators/tests | Append failures swallowed. |
| B00a-A001 | B00a | Buster runtime startup/shutdown | `buster-pipeline.ts` | Operators/tests | None. |
| B00a-A002 | B00a | Buster task completion signal | Task lifecycle services, not root entrypoint | Nova Redis completion event adapter | Agent docs align: module/gate agents write `output_file`; Buster Pipeline runs verify-task push before emitting completion. |
| B00a-A003 | B00a | Buster task identity | Validated Redis task payload | Telemetry/completion/logs | Env `BUSTER_PROJECT` diagnostic only. |
| B00a-A004 | B00a | Common CLI/Git helpers | `skills/common/pipeline/*` | Buster compatibility shims | None. |
| B00b-A001 | B00b | Buster top-level shared helper behavior | `skills/common/pipeline/*` | Buster shim surfaces | None. |
| B00b-A002 | B00b | Production `/app/skills/pipeline` helper path | Image build/overlay | Buster runtime imports | Comments state common implementation overwrites shim path in images. |
| B01-A001 | B01 | Buster gateway readiness/health process decision | `gateway-health.ts` via structured `shutdown` call | `buster-pipeline.ts` startup/health monitor | None. |
| B01-A002 | B01 | Buster structured task log entries | `logger.js createLogger/write` | Operators/tests | Observability only, not task authority. |
| B01-A003 | B01 | Buster process diagnostic records | `runtime-diagnostics.js` | Operators/tests/startup diagnostics | Diagnostic-only; no run `seq` authority. |
| B01-A004 | B01 | Buster child-session monitor result | `session-monitor.js monitorSession` | Task lifecycle/completion finalization | Completion authority remains task lifecycle/artifact readers. |
| B01-A005 | B01 | Common ACP/gateway/lifecycle helper behavior | `skills/common/pipeline/*` | Buster shims/services | Details deferred to C00b. |
| B02a-A001 | B02a | Buster suite verdict evidence | `suite-runner.ts` | task lifecycle/operators | None. |
| B02a-A002 | B02a | Buster Discord audit artifacts | `discord.js` | operators/tests | Notification evidence only. |
| B02a-A003 | B02a | Buster repo sync/reset/push state | `git-workflows.ts gitSync` / `gitPushWithRetry` / `verify-task.ts` | task lifecycle | Commit mode requires explicit `addPaths`; Buster completion push is verify-task scoped to `.swarm`. |
| B02a-A004 | B02a | Buster active-agent status projection | `pipeline-helpers.js` via lifecycle-state helper | Nova/status readers/recovery | None. |
| B02a-A005 | B02a | Buster result outcome from child agent | `pipeline-helpers.js resolveBusterAgentResult` | task lifecycle/completion | Required `output_file` only; no orchestrator state-file or alternate result-path fallback. |
| B02a-A006 | B02a | Buster sandbox cleanup state | `sandbox-cleanup.js` | cleanup service/startup sweeps | Maximum-platform-privilege cleanup authority; task capability limits do not restrict cleanup sweeps. |
| B02a-A007 | B02a | Buster terminal completion/dead-letter EventBus publish | `completion-signal.js`, `task-completion.js`, and lifecycle internals | Nova poller/task queue | Completion is emitted only after `output_file` is ready and verify-task push succeeds; push failure dead-letters instead. |
| B02a-A008 | B02a | Buster task lifecycle orchestration | `task-lifecycle.js` | task queue/Nova completion stream/operators | Internals mapped in B02b. |
| B02a-A009 | B02a | Buster task capability contract | `capabilities.js` | suite runner/tool boundaries/operators | Default-deny authority; explicit payload/platform capabilities are required for destructive/tool-heavy execution, and denials emit durable operator alerts. |
| B02b-A001 | B02b | TaskQueue task ACK | `task-queue.js` through common TaskQueue contract | Redis consumer group | None; guarded by completion/dead-letter result. |
| B02b-A002 | B02b | Pending task reclaim | `task-queue.js` | Buster queue loop | None. |
| B02b-A003 | B02b | Buster task identity validation | `task-validation.js` | task lifecycle/queue | None. |
| B02b-A004 | B02b | Buster terminal completion state | `completion-signal.js` and queue fallback | task queue/Nova poller | None. |
| B02b-A005 | B02b | Buster session active marker | `session.js` through helpers/common lifecycle | recovery/status readers | None. |
| B02b-A006 | B02b | Suite verdict schema | `verdict-schema.ts` | suite runner/prompts/completion | None. |
| B03-A001 | B03 | Buster primary suite verdicts | B03 suite default exports | suite runner, Discord/completion/prompt consumers | None. |
| B03-A002 | B03 | Repo-scoped suite path boundary | `repo-paths.js` via common security helper | all B03 suites | None. |
| B03-A003 | B03 | Static/server app runtime for downstream suites | `build.ts` behind `capabilities.js` | health/API/E2E/Buster agent | `static_web_server` or `container_runtime` capability required before runtime start. |
| B03-A004 | B03 | K8s test namespace/resource deployment | `k8s.ts` behind `capabilities.js`; namespace prefix validated before tracking/build/deploy | cleanup service/operators/Buster agent | `container_runtime` + `kubernetes_api` capabilities required; namespace prefixes are limited to cleanup-safe `buster`/`test`; generated resources carry cleanup scope labels. |
| B03-A005 | B03 | Manifest YAML structural rewrite | `k8s.ts renderManifestForK8sSuite` | kubectl apply, tests | None. |
| B03-A006 | B03 | Unit/E2E/API enforcement mode | suite thresholds in task config | suite verdict consumers | None. |
| B04-A001 | B04 | Specialized suite verdicts | B04 suite functions | Buster suite runner, completion, Discord surfaces | None. |
| B04-A002 | B04 | Visual-reg baseline path authority | `visual-reg.ts resolveVisualRegBaselineDir`, `screenshot.ts generateBaselines` | Visual-reg comparison, health smoke autodetection | None. |
| B04-A003 | B04 | Visual-reg Discord delivery status | `visual-reg-discord.ts` returns `{status:'skipped_no_webhook'|'sent'|'failed_noncritical', sent:boolean, error?}`; `services/discord.js deliverDiscordWebhookRequest` owns HTTP delivery health | `visual-reg.ts` aggregates helper results into truthful `plugin.event` (`plugin_id: buster`, `plugin_event: visual_reg`) Discord telemetry details; shared Buster Discord emits webhook degraded/restored telemetry | `browser_automation` capability gates visual-reg execution; `discord_media` gates media upload when a webhook is configured. |
| B04-A004 | B04 | Visual-audit temp artifact lifecycle | `visual-audit.ts` behind `capabilities.js` | Operators/Discord upload | Requires `browser_automation` + `discord_media`; temp `/tmp/audit-*` media directory is removed in `finally` across success, validation errors, browser failures, HTTP errors, and thrown uploads. |
| B04-A005 | B04 | Lighthouse report artifact | `perf.ts` behind `capabilities.js` | Operators/suite metadata | `lighthouse` capability required before suite execution. |
| B05-A001 | B05 | Base image pre-pull candidate set | `base-images.ts` behind platform capability `image_prepull` | Podman pre-pull loop/startup logs | Startup only calls pre-pull when platform capability is configured; direct denied pre-pull requests emit durable operator alerts and perform no Podman calls. |
| B05-A002 | B05 | Buster child-session cooldown state | `rate-limit.ts` caller-owned state mutated by `handleRateLimit` | Session monitor / completion status | None. |
| B05-A003 | B05 | Canonical Buster rate-limit pause signal | `rate-limit.ts handleRateLimit` when `ownsCanonicalSignal` | Redis telemetry, Discord operators, monitor loop | None. |
| B05-A004 | B05 | Buster telemetry event envelope and validation | `skills/buster/pipeline/services/telemetry.ts` using common `services/telemetry/payload-schema.js` | Redis stream consumers, run artifact replay | Core/shared events are schema-validated; plugin-owned Buster details use `plugin.event` with `details` for plugin fields. |
| B05-A005 | B05 | Legacy Redis task publish/read streams | `tools/redis.ts` through common TaskQueue contract | Swarm agents/operators | Completion emission explicitly removed; `sendTask` remains a compatibility alias. |
| B05-A006 | B05 | Verify-task `.swarm` commit scope | `tools/verify-task.ts` | Git remote / Buster completion users | Uses `gitPushWithRetry` commit mode with explicit `addPaths: [swarmRoot]`; no broad staging. |
| C00a-A001 | C00a | Discord purge deletion action | `skills/common/discord-purge.ts` | Discord channel state/operators | Single-delete non-429 handling tracked as `C00a-ISSUE-001`. |
| C00a-A002 | C00a | CLI parsing policy | `skills/common/pipeline/cli-args.ts` | Nova/Buster tools | None. |
| C00a-A003 | C00a | Common lifecycle mutation semantics | `skills/common/pipeline/lifecycle-state.ts` | Nova/Buster status facades/stores | Canonical persistence remains in caller stores; mutation intent is returned explicitly. |
| C00a-A004 | C00a | Noncritical incident de-dupe | `skills/common/pipeline/noncritical-reporting.ts` | Telemetry/redaction/observability callers | Process-local only by design. |
| C00a-A005 | C00a | Common redaction policy | `skills/common/pipeline/redaction.ts` | Telemetry, Discord, prompt/transcript artifacts, stdout/stderr, status snapshots, summaries | `sanitizeJsonEgress` is the required structured JSON egress choke point; `sanitizeMarkdownText` is the required string/Markdown scrubber. |
| C00a-A006 | C00a | Common path/command safety policy | `skills/common/pipeline/security.ts` | Nova/Buster shell/path boundaries | None. |
| C00a-A007 | C00a | Telemetry key constants | `skills/common/pipeline/telemetry.ts` | Nova/Buster telemetry transports | None. |
| C00b-A001 | C00b/RV-12 | ACP monitor and ACP event payload contracts | `acp-monitor.js buildMonitorState` plus `services/acp-gateway-contract.js` | Nova/Buster polling, rate-limit, lifecycle callers, pipeline EventBus producers | `assertValidAcpMonitorState` validates the shared result shape at the builder boundary; ACP session/transcript event payload validators define exact producer-side schemas and reject undocumented fields such as legacy transcript-delta `offset`. |
| C00b-A002 | C00b | Process-local active child-session record | `lifecycle.js` plus `services/acp-gateway-contract.js` | `getActiveSession`, `killActiveSession`, current-process shutdown | `assertValidSessionLifecycleRecord` validates spawn/persist shape; persisted JSON is diagnostic evidence only and never hydrates restart authority. Lifecycle read models plus gateway confirmation own recovery authority. |
| C00b-A003 | C00b/OI-41 | Tracked agent registry | `tracked-agents.js trackAgent` | `lifecycle.js` facade exports, `acp-monitor.js` static lookup, shutdown/healthcheck | Process-local diagnostic/health evidence only; neutral owner prevents ACP monitor/lifecycle import cycles and never rehydrates lifecycle authority. |
| C00b-A004 | C00b | Runtime dispatch choice | `runtime.js resolveRuntime` | lifecycle/session spawn callers | None. |
| C00b-A005 | C00b/OI-47 | Gateway request/response boundary | `gateway.js` typed operation wrappers plus `services/acp-gateway-contract.js` | lifecycle/monitor/Nova/Buster Gateway callers through facades | Raw `gatewayInvoke` and OpenClaw tool names live only in the common owner; typed wrappers (`getGatewaySessionStatus`, `spawnGatewaySession`, `sendGatewaySessionMessage`, `killGatewaySubagent`, `listGatewaySubagents`, `completeGatewayPrompt`, `checkGatewayHealth`) own operation access, while `normalizeGatewayInvokeResult`, `assertValidGatewayInvokeResult`, and `buildGatewayInvokeHttpError` own success/error shape normalization. |
| C00b-A006 | C00b | Rate-limit payload and Discord field contract | `rate-limit-contract.js` | Nova/Buster rate-limit services | None. |
| C00b-A007 | C00b | Discord webhook delivery result/error | `discord-webhook.js` | Nova/Buster Discord callers | None. |
| S00-A001 | S00 | Project setup documentation | `skills/nova/project_setup/*` | Operators/agents configuring pipeline projects | Visual-reg docs use module-derived baseline paths; ACP monitor is documented as platform-owned `swarm.config.json` config, not `progress.json`. |
| S00-A002 | S00 | Prism preview conventions | `skills/prism/prism-conventions.md` | Prism preview authors, screenshot generator expectations | Documents current screenshot generator source and runtime-image entrypoints. |
| S00-A003 | S00 | Frontend design behavior guidance | `skills/prism/frontend-design.md` | Frontend generation agents | None. |
| S00-A004 | S00 | Empty Prism `tmp` file | None found in scoped files | None found in scoped files | Could be removed if confirmed unused; no runtime impact found in scoped files. |
| V00-A001 | V00 | Fast verification lane | `run-fast-verification.sh` | README and maintainers | None. |
| V00-A002 | V00 | Full clean-checkout verification lane | `run-full-verification.sh` | README/behavior docs and maintainers | Requires helm/kubeconform/live subagent readiness. |
| V00-A003 | V00 | Local ACP verification lane | `run-local-acp-verification.sh` | README/behavior docs and maintainers | Local/provider-specific by design. |
| V00-A004 | V00 | Packaging verification policy | `packaging-verification.md` plus runtime collision guard | Maintainers | None. |
| V00-A005 | V00 | Behavior verification policy | `behavior-verification.md` plus behavior harness | Maintainers | Static rerun summary can age; doc tells users to trust live JSON for exact counts. |
| V01a-A001 | V01a | Behavior area inventory and order | `verify.mjs AREA_ORDER` and `areaRegistrars` | `--list-areas`, wrappers, area README | Areas README is manual inventory; no explicit parity assertion found. |
| V01a-A002 | V01a | Behavior check result summary | `verify.mjs` | wrapper/operator logs | None. |
| V01a-A003 | V01a | Generic behavior Discord suppression | `verify.mjs` env assignment | Discord runtime integrations during tests | None. |
| V01a-A004 | V01a | Docs-surface expectations | `docs-surface.mjs` | docs maintainers | None. |
| V01a-A005 | V01a | Foundational runtime behavior coverage | `foundations.mjs` | implementation-map and maintainers | None. |
| V01a-A006 | V01a | Repo-docs expectations | `repo-docs.mjs` | docs maintainers | None. |
| V01b-A001 | V01b | Governance approval summary entries | approval/governance/summary runtime modules | `governance.mjs` | None. |
| V01b-A002 | V01b | Migrated typed worker control results | plugin registry owners and module runner validators | `migrated-seams.mjs` | None. |
| V01b-A003 | V01b | Model defaults in telemetry | policy + telemetry runtime | `models.mjs` | None. |
| V01b-A004 | V01b | Operator Discord/Redis/Buster audit artifacts | Discord/Redis/Buster services | `operator-surface.mjs` | Evidence only, not lifecycle authority. |
| V01b-A005 | V01b | Runtime helper public surface | gateway/lifecycle/runtime modules | `runtime-surface.mjs` | None. |
| V01b-A006 | V01b | Notification dispatch authority | plugin registry + notification-dispatch | `runtime-surface.mjs` | None. |
| V01b-A007 | V01b | ACP launch PASS assessment | `session-launch-lib.mjs assessLaunchVerification` | `runtime-surface.mjs` | None. |
| V02a1-A001 | V02a1 | Approval gate lifecycle/read model | approval runner/status-store runtime | scheduler, dependency checks, telemetry, V02a1 tests | None. |
| V02a1-A002 | V02a1 | Approval stage control result contract | gate stage owner + gate runner validator | telemetry/result callers | None. |
| V02a1-A003 | V02a1 | Review/Buster fix-cycle telemetry | review/Buster gate runners | operator telemetry, V02a1 tests | None. |
| V02a1-A004 | V02a1 | Gate active-session restart markers | gate fix scaffold/runners | restart recovery behavior | Source-marker tests only; deeper runtime coverage in other areas. |
| V02a1-A005 | V02a1 | Module status mutation authority | lifecycle-state/status runtime helpers | prompts and agent outputs | None. |
| V02a2-A001 | V02a2 | Typed gate control result | gate stage owner + gate runner validator | gate result/telemetry callers | None. |
| V02a2-A002 | V02a2 | Gate failure telemetry | gate/review/Buster runners | fake Redis/operators | None. |
| V02a2-A003 | V02a2 | Gate operator Discord alerts | gate/review/Buster runners and Discord audit service | operators/replay/tests | Audit artifact only; not lifecycle authority. |
| V02a2-A004 | V02a2 | Gate output contract projection | status-store/runtime gate output readers | scheduler/dependencies/tests | None. |
| V02a2-A005 | V02a2 | Rate-limit pause/exhaustion correlation | review/Buster gate runners | telemetry/Discord/tests | None. |
| V02a2-A006 | V02a2 | Buster gate dependency completion | canonical `output_file` | dependency checker/tests | Gate-status PASS alone intentionally insufficient. |
| V02a3-A001 | V02a3 | Module lifecycle status | status-store/lifecycle-state runtime | module runner, failure service, rate-limit service | None. |
| V02a3-A002 | V02a3 | Worker control results | typed worker stage owner + module runner validator | module runner result/telemetry | None. |
| V02a3-A003 | V02a3 | Module failure telemetry | module runner/failure/rate-limit services | fake Redis/operators | None. |
| V02a3-A004 | V02a3 | Module operator Discord alerts | module runner/failure/rate-limit services and Discord audit | operators/replay/tests | Audit artifact only; not lifecycle authority. |
| V02a3-A005 | V02a3 | Active agent/session correlation | module runner/status/Redis result caches | terminal payloads, telemetry, Discord | None. |
| V02a3-A006 | V02a3 | Rate-limit pause/resume ownership | shared rate-limit service | module runner and direct compatibility path | None. |
| V02b-A001 | V02b | Pipeline step outcome | typed `pipeline_step_result` producer/validator | scheduler/finalizer/tests | None. |
| V02b-A002 | V02b | Pipeline halt telemetry/finalizer | pipeline runner finalizer | Redis stream, Discord halt notice, summary schedule | None. |
| V02b-A003 | V02b | Architecture validator control result | validator stage owner / architecture validator | scheduler/governance context/report artifacts | Behavior coverage now asserts malformed `execution_order` entries become structured architecture findings, not internal errors. |
| V02b-A004 | V02b | Generator schedule | pipeline scheduler stage owners | generator stage stubs/tests | None. |
| V02b-A005 | V02b | Restart stale recovery state | pipeline runner recovery/lifecycle services | module/gate status, lifecycle events, Discord/telemetry | None. |
| V02b-A006 | V02b | Approval gate pending state | approval gate runner | resume scheduler, telemetry, Discord | None. |
| V02b-A007 | V02b | Telemetry seq | Redis sequence key | Redis stream and durable artifacts | None. |
| V02b-A008 | V02b | Buster gate terminal result | Buster gate runner | gate verdict telemetry, Discord, pipeline result | None. |
| V03a-A001 | V03a | Agent spawn/kill lifecycle | Nova orchestration/lifecycle services | telemetry, Discord audit, tracked agents | None. |
| V03a-A002 | V03a | Redis task dispatch | registered TaskQueue-capable Redis adapter selected per config | orchestration and tests | Dispatch uses `publishTask`; `sendTask` remains compatibility-only. |
| V03a-A003 | V03a | Buster canonical task identity | Buster task payload validator/lifecycle | monitor, queue, completion, diagnostics | None. |
| V03a-A004 | V03a | Buster terminal queue guarantee | Buster task queue | Redis completion/dead-letter/ACK streams | None. |
| V03a-A005 | V03a | Deployment truth | `check-deployment-truth.mjs` | behavior deployment bridge | None. |
| V03a-A006 | V03a | Discord canonical correlation | `discord-fields.js` surface field sets and correlation service | operator Discord/audit/failure/blueprint surfaces | Lifecycle/gate/module/pipeline callers use canonical surface sets; audit parsing still trusts Dispatch/Gateway Label/Session fields only. |
| V03a-A007 | V03a | Many-module module status | status-store/lifecycle + typed worker results | pipeline scheduler/telemetry/tests | None. |
| V03a-A008 | V03a | Polling completion authority | polling/completion adjudicator/rate-limit services plus common Redis message and transport contracts | module runner/gates/telemetry | Completion and task/work stream entries are schema-validated by the common Redis contract; task/work transport uses TaskQueue/EventBus. |
| V03a-A009 | V03a | Telemetry event payloads | Common `services/telemetry/payload-schema.js` | fake Redis, JSONL artifacts, tests | Shared schema validates core events and the generic `plugin.event` extension surface for Buster/future plugins. |
| V03a-A010 | V03a | Secret redaction | common redaction helpers and runtime artifact writers | telemetry/log/Discord/artifact consumers | None. |
| V03b-A001 | V03b | ACP monitor state | monitor service | Nova polling/orchestration, Buster session monitor | None. |
| V03b-A002 | V03b | Shell/cleanup execution boundary | suite modules and sandbox cleanup service | behavior tests/operators | None. |
| V03b-A003 | V03b | Shutdown tracked agents | lifecycle service; shutdown only reaps/kills | orchestration/shutdown | None. |
| V03b-A004 | V03b | Summary lifecycle/artifacts | summary services and pipeline finalizer | Redis telemetry, Discord, artifact readers | Structured artifacts use `sanitizeJsonEgress`; Markdown artifacts use `sanitizeMarkdownText`; existing P18b gateway-label fallback remains applicable. |
| V03b-A005 | V03b | Telemetry event docs/schema | lifecycle contract, telemetry-event schema, common `services/telemetry/payload-schema.js` | docs/tests/operators | Runtime schema registry is verified against docs/source for core events plus `plugin.event`. |
| V03b-A006 | V03b | Redis completion identity/archive | Redis completion services plus common Redis message and transport contracts | polling/gate/module runtime | Completion schema owner is explicit; task/work streams share the same envelope validator and transport boundary. |
| V03b-A007 | V03b | Transcript delta state | monitor/lifecycle services | orchestration health checks | None. |
| V04a-A001 | V04a | Pipeline artifact authority roles | `artifact-bundle.js` | contract checks/operators | None. |
| V04a-A002 | V04a | Critical import/adapter topology | static source imports and adapter registry | dynamic-import contract | None. |
| V04a-A003 | V04a | Complexity budget | contract script with 700-line default | operators/CI | None. |
| V04a-A004 | V04a | Gate active-session authority | lifecycle read-model | gate active-session recovery helper | File-only `active-session.json` is diagnostic evidence, not recovery identity. |
| V04a-A005 | V04a | Gate control result schema | `gate-control-result.js` helpers | gate runners/gate-runner/contracts | None. |
| V04a-A006 | V04a | Gate Forge fix scaffold | `gate-fix-scaffold.js` | review/Buster fix-cycle adapters | None. |
| V04a-A007 | V04a | Generator result schema | `generator-result.js` | summary/case-study services | Shared builder plus validator/normalizer own v1 generator schema. |
| V04a-A008 | V04a | Module runner phase/result contracts | extracted helpers and registry | module runner/validators/contracts | None. |
| V04b-A001 | V04b | Operator alert delivery | telemetry sink registry / Discord sink plugin | module/gate/pipeline alert callers | None. |
| V04b-A002 | V04b | Pipeline entrypoint public API | `pipeline/index.js`; shim re-exports | CLI/operators/importers | None. |
| V04b-A003 | V04b | Pipeline runner terminal authority | typed pipeline step result contract | pipeline terminal helper | None. |
| V04b-A004 | V04b | Pipeline step result | `pipeline-step-result.js` | gate/module/pipeline runners | None. |
| V04b-A005 | V04b | Rate-limit helper ownership | builders and exit helper modules | rate-limit main/callers | None. |
| V04b-A006 | V04b | Redis completion helpers | `services/redis-completion.js` and common Redis message contract | Redis tool/polling/gates | Helper surface now includes envelope/completion schema validation. |
| V04b-A007 | V04b | Redis exchange logging | `services/redis-log.js` | Redis callers/operators | None. |
| V04b-A008 | V04b | Remediation handoff | `remediation-handoff.js` and remediable gate engine | gate/review/Buster runners | None. |
| V04c-A001 | V04c | Active session identity | lifecycle read-model identity plus gateway confirmation | session authority/correlation/status compat | Persisted active-session files, status active-agent snapshots, and tracked-agent entries are diagnostic evidence only; `allow_evidence_hydration:false`. |
| V04c-A002 | V04c | Stage envelope refs/invocations | `stage-envelope-primitives.js` | module/gate/pipeline builders | None. |
| V04c-A003 | V04c | Module/gate lifecycle status | lifecycle event/read-model store | status-store compat/scheduler/truth drift | None. |
| V04c-A004 | V04c | Module lifecycle projections | runtime lifecycle writers | status/recovery/truth-drift readers | Canonical runtime state with no module status-file compatibility branch. |
| V04c-A005 | V04c | Redis completion evidence | completion adjudicator with active dispatch confirmation and Redis completion schema validation | polling/pollDual/module runner | Malformed current-identity entries fail closed as invalid completion diagnostics. |
| V04c-A006 | V04c | Telemetry event inventory/stream identity | telemetry contract markdown, schema docs, common `services/telemetry/payload-schema.js` | Nova/Buster/common telemetry runtimes | One payload registry is exhaustive for core inventory plus the generic plugin extension event. |
| V04c-A007 | V04c | Validator control result | `validator-control-result.js` | module validators/scheduling | None. |
| V04c-A008 | V04c | Worker control result | `worker-control-result.js` and module worker helper | orchestration/module runner | None. |
| V05-A001 | V05 | Buster operator Discord surfaces | canonical embed builders in Buster pipeline surface | task lifecycle/operator sinks | None. |
| V05-A002 | V05 | Buster active-agent status | shared lifecycle-state helper via Buster helper module | Buster lifecycle/monitor | None. |
| V05-A003 | V05 | Buster task result | required `output_file` artifact | Buster lifecycle/completion | No status JSON fallback. |
| V05-A004 | V05 | Buster task-controlled filesystem paths | repo-scoped/common security helpers | Buster suite runners | None. |
| V05-A005 | V05 | Verify-task git staging scope | `buildSwarmScope`/git path helpers | verify-task CLI | None. |
| V05-A006 | V05 | Common pipeline helpers | `skills/common/pipeline` plus repo-local shims | Nova/Buster production code | None. |
| V05-A007 | V05 | CLI argument parsing | `skills/common/pipeline/cli-args.ts` | migrated CLI tools | None. |
| V06a-A001 | V06a | Deployment manifest truth | Helm chart/templates/values | deployment truth verifier/operators | None. |
| V06a-A002 | V06a | Runtime config ConfigMap content | chart files under `charts/kubeclaw/files/config` | Helm render/runtime pod | None. |
| V06a-A003 | V06a | Deployment operator commands | executable `scripts/deploy.sh` | operators/live verification | None. |
| V06a-A004 | V06a | Packaged runtime helper ownership | lifecycle audit packaging rules and common helper list | contract/behavior runtime materializers | None. |
| V06a-A005 | V06a | Fake Redis call log | fake `ioredis` module | verification assertions | None. |
| V06a-A006 | V06a | Quiet verification output | verification console wrapper | verification scripts/CI | None. |
| V06a-A007 | V06a | Live Redis completion | real Redis completion stream when explicitly enabled | Nova Redis reader/Buster pipeline | None. |
| V06b-A001 | V06b | Nova runtime public API | Nova pipeline entrypoint/index/CLI | startup smoke/operators | None. |
| V06b-A002 | V06b | Buster runtime public API/status | Buster pipeline entrypoint | startup smoke/operators | None. |
| V06b-A003 | V06b | Pipeline active run lock | pipeline runner lock helpers | final gate hardening/pipeline runner | None. |
| V06b-A004 | V06b | Runtime packaging ownership | lifecycle audit manifest rules | runtime collisions/materializers | None. |
| V06b-A005 | V06b | Launch evidence | gateway session status primarily; stream log only degraded fallback | session launch verifier | None. |
| V06b-A006 | V06b | Cleanup confirmation | kill result or allowed stopped state | launch verifier | None. |
