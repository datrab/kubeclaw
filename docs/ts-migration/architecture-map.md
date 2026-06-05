# Pipeline Architecture Map

Purpose: create a practical human/agent navigation map of the pipeline, based on fully reading each Phase 0 batch.

## Phase 9 unpaired JavaScript cleanup baseline

After Phase 8, the active cleanup target is no longer the broad historical ledger row count. The concrete Phase 9 surface is the 31 unpaired `.js` files under `skills/*`, locked by `tests/verification/contracts/check-phase9-unpaired-js-surface.mjs`.

- Phase 9 is complete. The final contract-retained inventory is 18 unpaired `.js` files: 16 pure shared facades, 1 direct runtime delegate, and 1 explicit out-of-scope operator utility.
- The Buster and Nova `pipeline/agents/*.js`, `git-primitives.ts`, and `lifecycle-state.ts` files are pure shared production-path facades over `skills/common/pipeline/**`. They are package/import compatibility surfaces only, not behavior owners.
- `skills/nova/pipeline.ts` is a direct runtime entry delegate over typed Nova owners. It does not own runner/service behavior.
- P9-B03 migrated the Buster support-service implementation owners to TypeScript: `capabilities.ts`, `gateway-health.ts`, `orphan-recovery.ts`, `pipeline-helpers.ts`, `runtime.ts`, and `session-monitor.ts`.
- P9-B04 migrated the Buster task completion, lifecycle, and queue spine to TypeScript: `task-completion.ts`, `task-lifecycle.ts`, `task-lifecycle/cleanup.ts`, `task-lifecycle/completion-signal.ts`, `task-queue.ts`, and `task-validation.ts`.
- P9-B05 migrated the remaining Buster behavior-bearing suite path helper to TypeScript: `suites/repo-paths.ts`.
- `skills/common/discord-purge.ts` is a standalone operator utility outside the pipeline migration scope. It remains inventoried so it cannot hide as an unclassified `.js` file.

## Phase 10 paired JavaScript cleanup baseline

Phase 10 owns the 100 paired `.js` files under `skills/*` where a same-path `.ts` owner exists. `tests/verification/contracts/check-phase10-paired-facade-surface.mjs` locks the starting inventory so paired files cannot remain hidden or grow behavior during final cleanup.

- Retained pure facade baseline after P10-B06: 86 files, including Common packaging facades, Nova agents/prompts/runners/services facades, and default-preserving facades where the TypeScript owner exports a default. The nine Nova tool helper facades were deleted because active callers can import the typed owners directly.
- Retained executable/runtime delegate baseline: `skills/buster/buster-pipeline.ts`, `skills/nova/pipeline/cli.ts`, `skills/nova/pipeline/tools/lint-report.ts`, `skills/nova/pipeline/tools/project-summary.ts`, and `skills/nova/pipeline/tools/redis.ts`.
- Behavior authority remains in the paired `.ts` owners. The paired `.js` files are package/import compatibility surfaces or direct operator entry delegates only.
- P10-B01 did not delete files; it created the reclutcher baseline that later Phase 10 batches must use when deleting obsolete facades or documenting retained runtime adapters.
- P10-B02 settled executable delegates: production Nova/Buster entrypoints remain `.js` compatibility paths, Nova tool delegates remain under `/app/skills/pipeline/tools/*.ts`, and obsolete root tool aliases under `/app/skills/{lint-report,redis,project-summary}.js` were removed from active config/docs.
- P10-B03 settled shared production facades: Common `.js` runtime packaging facades and Buster/Nova role-local shared facades remain only as exact `.ts` re-export adapters. Their comments and contracts now name the retained reason directly.
- P10-B04 settled Nova agent, prompt, and runner facades: scoped `.js` files remain only as pure re-export package paths over same-path TypeScript owners and are locked by a Phase 10 subset contract.
- P10-B05 settled Nova service facades: 52 paired service `.js` files remain only as pure same-path `.ts` re-export package paths and are locked by a service-specific Phase 10 contract.
- P10-B06 settled Nova tool adapters: retained only the three executable operator delegates under `/app/skills/pipeline/tools/{lint-report,project-summary,redis}.ts` and deleted the non-executable lint-report/project-summary helper `.js` facades.
- P10-B07 locked active docs/deployment references: deleted root tool aliases and deleted tool-helper facade paths may appear only in historical migration/open-issue records, not in active operator docs, deployment values, package metadata, or implementation maps.
- P10-B08 records final completion: 109 JavaScript files remain under `skills/*`, all classified as pure facades, runtime/operator delegates, or the explicit out-of-scope utility. Zero migration phases remain.

## Buster task-processing runtime

`skills/buster/buster-pipeline.ts` is the Buster pod runtime entrypoint. Deployment starts it as a background process beside the OpenClaw gateway. Its flow is:

1. install process signal handlers;
2. wait for the gateway;
3. recover/validate orphaned active-session evidence;
4. run startup sandbox cleanup;
5. start gateway health monitoring;
6. optionally preload base images when `BUSTER_PLATFORM_CAPABILITIES` includes image pre-pull;
7. ensure the Redis task consumer group;
8. poll Redis tasks with `processOneQueuedTask(processTask)` until shutdown.

The file is intentionally thin: task execution lives in `pipeline/services/task-lifecycle.ts`, Redis queue ownership in `pipeline/services/task-queue.ts`, session monitoring in `pipeline/services/session-monitor.ts`, shutdown session teardown in the shared session-termination facade, and startup/health concerns in gateway/orphan/base-image/cleanup services.

## Buster role facades over common pipeline code

The Buster `pipeline/agents/*.js`, `pipeline/cli-args.ts`, `pipeline/git-primitives.ts`, and `pipeline/agent-observability/src/index.ts` files in this slice are repo-local facades. They keep Buster-local import paths stable while delegating implementation authority to `skills/common/pipeline/**`. Production packaging also treats the `/app/skills/pipeline/**` surfaces as shared runtime paths, so these facades are adapters rather than independent pipeline modules.


## Buster shared surfaces and pre-agent suite flow

The Buster integration/helper files in this slice are role-local facades over common pipeline authorities: Discord webhook posting, Gateway operations, lifecycle-state mutation helpers, noncritical reporting, redaction, Redis transport, security, and ACP Gateway contracts. Buster services import these local paths so the repo layout matches the production `/app/skills/pipeline/**` shared surface while implementation remains under `skills/common/pipeline/**`.

`skills/buster/pipeline/runners/suite-runner.ts` sits inside the Buster task lifecycle before agent execution. `task-lifecycle.ts` calls `runSuites`, which sorts requested suites by `EXECUTION_ORDER`, skips dependency-blocked suites using `DEPENDENCIES`, gates each suite through Buster capabilities, runs each suite with a per-suite timeout, emits suite telemetry, and writes runner/suite verdict artifacts under `/sandbox/results` and `<logDir>/tests`.

`skills/buster/pipeline/services/base-images.ts` is a startup support service used by `buster-pipeline.ts`. It seeds a static typed base-image set, requires fully qualified image refs, capability-gates pre-pull, then checks/pulls images through Podman using the shared subprocess environment guard. It no longer mines `.swarm/progress.json` or normalizes bare image names; pre-pull remains non-authoritative cache warmup but inspect/pull failures now return typed degraded image-level evidence.


## Buster service contracts and operator-control helpers

This service slice is the support layer between the Buster entrypoint/task lifecycle and shared common pipeline contracts.

- `services/capabilities.ts` is the default-deny capability boundary used before tool-heavy suites, visual audit, and base-image pre-pull. It normalizes task/platform capability inputs and turns missing capability checks into durable operator alerts plus typed errors.
- `services/discord.ts` is Buster's operator-notification adapter. Task lifecycle, rate-limit recovery, and visual-reg media delivery pass through it for sanitized Discord audit JSONL, webhook delivery, and degraded/restored observability.
- `services/gateway-health.ts` keeps gateway readiness and periodic liveness policy outside the entrypoint. It delegates health probing to the common Gateway integration and calls the entrypoint shutdown hook when readiness or health thresholds fail.
- `services/git-workflows.ts` wraps common Git primitives with Buster-owned deterministic sync/reset and fail-closed push-with-rebase policy. Task validation, k8s suite helpers, and verify-task tooling consume this boundary.
- `services/logger.ts` creates per-task structured Buster loggers for task lifecycle and session monitor flows. stdout remains the runtime fallback while JSONL file output is best-effort observability.
- `services/orphan-recovery.ts` is startup evidence fencing: it inspects persisted active-session files as diagnostics only and reports that lifecycle authority is absent instead of hydrating/killing from stale files.
- `services/pipeline-helpers.ts` centralizes Buster task/result glue: output-file resolution and terminal outcome derivation, completion identity fields, Discord embed builders, active-session path resolution, pre-test verdict shaping, and cleanup policy selection.
- `services/rate-limit.ts` owns the Buster child-session cooldown loop. When Buster is the process actually sleeping, it emits the canonical pause signal, sends operator Discord, waits, probes typed session liveness, advances cooldown, and returns `kill` only for confirmed closed sessions; gateway/probe degradation resumes monitoring with evidence.
- `services/pipeline-event-contract.ts` and `services/rate-limit-contract.ts` are role-local production-path facades; common pipeline modules own the actual event and rate-limit contracts.


## Buster task execution, monitoring, cleanup, and Redis terminal guarantees

This slice is the operational core under the Buster task lifecycle and queue ACK boundary.

- `services/redis-message-contract.ts` keeps Buster on the common Redis envelope/task/completion contract while preserving the production `/app/skills/pipeline/services/*` path.
- `services/task-completion.ts` is the terminal-signal guard before Redis ACK. It builds canonical completion records, emits completion to `payload.completion_stream`, writes dead-letter entries when completion cannot be guaranteed, and exposes the `ensureTaskTerminalBeforeAck` precondition for the task queue.
- `services/session-monitor.ts` converts ACP monitor events into Buster session outcomes. It runs an event adapter, emits plugin telemetry/transcript deltas, handles gateway degraded/restored visibility, owns hard-timeout termination, and delegates cooldown recovery to the Buster rate-limit service.
- `services/task-lifecycle/session.ts`, `cleanup.ts`, `git-sync.ts`, and `completion-signal.ts` are extracted task-lifecycle stages: spawn/monitor/kill/outcome publication, sandbox cleanup telemetry, deterministic repo sync telemetry, output-file verification/push, and final Redis completion.
- `services/sandbox-cleanup.ts` owns cleanup enforcement for tracked Podman/Kubernetes resources, sandbox output directories, and nginx. It is policy-driven so task-scoped cleanup cannot silently become a broad sweep, and cleanup-state loading distinguishes missing files from corrupt persisted state with typed diagnostics.
- `services/runtime-diagnostics.ts` is the sanitized diagnostic side channel for malformed tasks and Buster process/runtime degradation. Its writes are intentionally nonblocking so diagnostics never block poison-message handling or shutdown.
- `services/runtime.ts` is a tiny Buster runtime helper for Discord webhook URL resolution used by Discord delivery, visual-reg, and Redis tooling.

## Buster task queue, lifecycle spine, telemetry, and noncritical suites

This slice spans the path from a Redis task entry to pre-agent suite evidence and final task completion. `services/task-queue.ts` owns Redis consumer mechanics and poison-message handling. It validates the canonical Redis envelope, normalizes the effective task type, invokes `processTask`, and refuses to ACK unless `services/task-completion.ts` reports terminal completion or dead-letter evidence.

`services/task-lifecycle.ts` is the high-level per-task spine. It validates Buster payload identity and path boundaries, opens telemetry/log contexts, runs pre-cleanup, Git sync, suite execution, spawn decision, ACP child-session spawn/monitor/kill/outcome publication, final cleanup, `task_completed` telemetry, output verification/push, and Redis completion signal emission. Extracted stage modules continue to own cleanup, Git sync, completion emission, and session lifecycle details.

`services/telemetry.ts` is Buster's Redis telemetry adapter. It validates plugin/core payloads through the common telemetry schema facade, emits run-scoped Redis stream events with sequence keys, mirrors events into pipeline log artifacts, and writes fallback degraded/restored artifacts when Redis or payload validation fails. `services/telemetry/payload-schema.ts` and `services/task-transport-contract.ts` are production-path facades over common pipeline contracts.

`services/verdict-schema.ts` is the JSON evidence contract for Buster suites and runner decisions. `suites/a11y.ts` and `suites/api.ts` are noncritical pre-agent suites under `suite-runner.ts`: they require a running app from build/health, return deterministic suite verdicts, and use explicit evidence-only PASS mode unless thresholds make findings enforceable.

## Buster foundational and deployment-oriented suites

This slice contains the suite-runner's core environment-establishment checks. `suites/build.ts` is the first critical suite: it compiles static frontends into `/sandbox/www` and serves them through nginx, or starts backend/server workloads in tracked Podman containers. Later suites and the Buster subagent depend on this running application.

`suites/health.ts` is the second critical runtime gate. It checks the app's HTTP endpoint with retry/backoff and can optionally run browser smoke navigation from explicit typed `serve.smoke_paths`; it no longer infers smoke paths from visual-reg artifacts. Smoke failures become noncritical investigation evidence, while HTTP failure, capability denial, or missing Playwright for requested smoke blocks spawn.

`suites/bundle.ts` and `suites/e2e.ts` are noncritical evidence suites over the build output/running app. Bundle requires build output, reports degraded unknown-size metadata for probe failures, and inspects `/sandbox/www` size and file counts. E2E requires typed `tests_dir` plus at least one persisted Playwright test and re-runs it deterministically. Both use explicit evidence-only PASS mode unless thresholds are provided.

`suites/k8s.ts` is the production-like deployment suite. It builds and pushes an image to the cluster-local registry, creates a tracked ephemeral namespace, rewrites manifests to that namespace and image tag, waits for pods, and health-checks the in-cluster service. Requested config, manifest paths, and secret propagation fail typed validation/execution instead of falling back to SKIP or best-effort success. Cleanup authority stays in sandbox cleanup tracked-resource state.

## Buster static-analysis, quality, and visual evidence suites

This slice completes the Buster suite-runner's pre-agent evidence set. `suites/manifest.ts` validates Kubernetes deployment/secret YAML before production-like deployment; requested deployment YAML must exist and secret refs require present parseable secret YAML. Its exported YAML helpers are reused by `suites/k8s.ts` when rendering manifests into ephemeral namespaces.

`suites/perf.ts`, `suites/security.ts`, and `suites/unit.ts` are noncritical quality gates over the running app or project code. Perf runs Lighthouse, persists the report into the task log directory, and fails enforced thresholds when a requested category is missing. Security fetches configured paths and audits response headers, cookies, and CORS. Unit resolves a repo-scoped project directory, requires a real test script unless `unit.test_cmd` is explicit, runs the command, and normalizes common test-runner output into suite verdicts. All three use explicit evidence-only PASS mode unless thresholds enforce failure.

`suites/visual-reg.ts` owns visual baseline comparison for Buster. It derives baseline directories from module identity, requires explicit multi-path baselines via `paths.json` plus reviewed baseline PNGs, fails closed when that metadata/evidence is missing, captures actual screenshots, compares images with Pixelmatch, copies artifacts, emits `visual_reg` telemetry, and delegates Discord media delivery to `suites/visual-reg-discord.ts`. Discord delivery remains an operator-notification side effect; visual-reg verdict status is based on screenshot/comparison results and thresholds.

`suites/repo-paths.ts` is the Buster suite path boundary helper used throughout suites. `pipeline/telemetry.ts` and `pipeline/timing.js` are repo/dev facades over `skills/common/pipeline` shared helpers, preserving Buster-local import paths for services that need Redis telemetry client helpers or sleep/budget utilities.

## Buster operator tools and agent-observability contracts

The Buster tool files in this slice are direct operator/runtime utilities around the suite and completion flow. `tools/redis.ts` is a task transport CLI/library: Nova's adapter registry can import it through the canonical runtime adapter slot, and operators can publish/read Redis tasks, but completion emission is intentionally removed and remains owned by Buster task lifecycle/completion services.

`tools/screenshot.ts` supports visual-reg and Prism baseline setup. Visual-reg imports only screenshot capture helpers; the CLI is the explicit baseline-generation surface that can create a single screenshot or derive reviewed baseline PNGs plus `paths.json` from a Prism HTML preview. It is browser/tooling support, not a suite verdict authority by itself.

`tools/verify-task.ts` is Buster's scoped completion push helper. The task lifecycle completion stage calls it to enforce the project `.swarm` write boundary, clean up forbidden changes, and commit/push only the allowed `.swarm` path.

`tools/visual-audit.ts` is a standalone Discord media capture utility. It capability-gates browser automation and Discord media, captures image/video evidence, uploads it to Discord, and always cleans its temp media directory.

The common `agent-observability/src/*.ts` files are a TypeScript-first shared contract island. They define the read-side event vocabulary, payload/identity types, minimal masking, stream routing/size fuses, and telemetry mapping table consumed through Nova/Buster role facades and Nova agent-observability ingester/evidence modules. They do not perform Redis IO or lifecycle changes in this slice.

## Common agent lifecycle and monitor flow

The common `agents/*` files are the shared implementation behind both Buster and Nova role-local facades. Nova owns most orchestration callers, while Buster uses the same primitives during task session spawn/monitor/termination.

`agents/runtime.ts` first classifies model/runtime intent. `agents/lifecycle.ts` uses that classification to spawn Gateway sessions, resolve transcript paths, persist process-local active-session evidence, track sessions, stop/kill sessions, and optionally close ACP harness sessions through `acpx`. `agents/acp-monitor.ts` then polls Gateway session status and transcript JSONL files, emits `acp.session.state` and `acp.transcript.delta` events through the common event bus, and provides idle/terminal helpers for polling and Buster session monitoring. `agents/session-termination.ts` wraps lifecycle kill behavior with a bounded grace period and canonical termination result shape. `agents/session-semantics.ts` centralizes status-text parsing and terminal/stopped/unreachable vocabularies. `agents/tracked-agents.ts` is the process-local registry used by lifecycle, monitor, and higher-level Nova/Buster polling flows.

Persisted active-session JSON is diagnostic evidence only; restart recovery is expected to consult Gateway/lifecycle read models rather than hydrate process-local state from that file.

## Common utility surfaces used by role pipelines

`cli-args.ts` is the strict shared parser used by Buster and Nova CLI/tool entrypoints through role-local facades. `git-primitives.ts` is the shared Git subprocess/repo-root helper used by Buster Git workflow policy and Nova Git context code. `integrations/discord-webhook.ts` is the common HTTP transport for Discord webhook delivery, while role-specific services own audit/degradation policy around it.

`agent-observability/src/validation.ts` completes the existing common TypeScript contract island by validating ingress event schema/version/source, identity fields, masking metadata, hook/type pairing, and JSON-safe payload content before Nova ingests agent-observability stream records.

## Common Gateway, lifecycle state, reporting, redaction, Redis/security, and event contracts

This common slice is the shared substrate under both Buster and Nova role-local facades. Role pipelines import local paths, but implementation authority lives in `skills/common/pipeline/**`.

- `integrations/gateway.ts` is the HTTP boundary to the OpenClaw Gateway. Common ACP monitor/lifecycle code and Nova/Buster orchestration wrappers use it for session status, spawn/send/kill/list, prompt completion, and health probes. It normalizes Gateway base/invoke/health URLs, bridges caller abort signals and timing budgets, retries transient network failures, and validates invoke results through the ACP Gateway contract.
- `lifecycle-state.ts` is Nova's mutable module-status transition helper layer. Runners/polling/recovery mutate in-memory status objects and pass explicit lifecycle transition results into status-store lifecycle appenders/projectors.
- `noncritical-reporting.ts` and `redaction.ts` are the shared hygiene path for observability side effects. They sanitize arbitrary errors, prompt/transcript/content payloads, Discord messages, telemetry payloads, and redacted artifacts so logger/telemetry/Discord failures do not leak secrets or block orchestration.
- `redis-transport.ts` centralizes secure Redis client construction and ioredis loading. It is below telemetry, task transport, and agent-observability consumers, and enforces password/TLS/network-isolation requirements except for explicit localhost verification mode.
- `security.ts` is the generic subprocess/path firewall used by common lifecycle/Git primitives plus Buster/Nova suites, tooling, and services. It prevents denied env secrets from reaching subprocesses, enforces path scopes, and rejects shell metacharacters in direct command strings.
- `services/acp-gateway-contract.ts` validates the shapes exchanged between Gateway polling/lifecycle/session termination and pipeline consumers.
- `services/pipeline-event-contract.ts` is the in-process event bus and wait contract used by Buster session monitoring and Nova event adapters/polling/completion controllers. Edge adapters normalize transport-specific signals into v1 pipeline events; orchestrators wait on typed events by identity instead of owning polling loops.
- `services/rate-limit-contract.ts` is the shared presentation/payload contract for rate-limit pause evidence, Discord identity fields, and post-cooldown recovery action selection.


## Common Redis/task/telemetry contracts and Nova module-worker flow

This slice defines shared contracts beneath both role pipelines and the Nova worker adapter layer above agent orchestration.

- `services/redis-message-contract.ts` is the common Redis envelope authority. Buster and Nova role facades consume it so task dispatch, completion records, target identity, strong run/attempt/dispatch identity, and completion source validation stay consistent across Redis task and completion streams.
- `services/task-transport-contract.ts` is the Redis-backed task queue/event bus adapter contract. It keeps callers behind publish/read/reclaim/ack/trim and publish-only event bus methods instead of raw Redis stream commands.
- `services/telemetry/payload-schema.ts` is the shared telemetry payload registry. Buster/Nova telemetry services validate event-specific payload shapes here before emitting or recording telemetry; plugin telemetry is normalized into canonical top-level fields plus `details`.
- `telemetry.ts` is the small shared telemetry key/helper surface layered above Redis transport construction. Role facades use it to get Redis client helpers and canonical stream/sequence keys.
- `timing.js` supplies shared budget/sleep primitives for Gateway retries, event waits, polling loops, and rate-limit-aware sleeps. It has no runtime authority beyond deadline/abort semantics.
- Nova `agent-observability/src/index.ts`, `agents/acp-monitor.js`, and `agents/lifecycle.js` are Nova-local facades over common typed contract/lifecycle code, matching the same production shared-surface pattern as Buster.
- `agents/module-worker-control-results.ts` converts Forge session outcomes and Buster Redis-dispatch outcomes into typed worker-control results consumed by Nova orchestration. Buster failure control is strict: explicit typed `failure_class` is required for failures, and reason/status/source compatibility fields cannot classify failures.
- `agents/module-workers.js` runs the two module worker backends: Forge spawns/polls a direct ACP session, while Buster archives old completions, dispatches a Buster task session, polls Redis/status evidence, validates final active-session authority, and returns the typed Buster control result. Worker identity is normalized to typed `ids`, `refs`, and `executionContext` before backend logic consumes it.


## Nova orchestration lifecycle, healthcheck, and shutdown flow

This slice is Nova's agent orchestration layer between runners/module workers and shared common session primitives. `agents/orchestration.ts` chooses ACP/subagent versus Redis dispatch from `config.agents[*].dispatch`, spawns Forge-style ACP/subagent sessions through the common lifecycle facade, dispatches Buster work through the registered Redis adapter, tracks session identity, sends lifecycle telemetry/Discord notices, and exposes common worker/reviewer helpers to runners.

`agents/orchestration-healthcheck.js` is the post-spawn liveness guard. It treats Redis agents as alive, checks Gateway session state for ACP/subagent agents, and falls back to transcript progress only when Gateway status is unknown, unreachable, or failing. Degraded/restored telemetry is emitted around Gateway health visibility, while tracked-agent transcript state is updated in-place.

`agents/reviewer-lifecycle.js` is the Echo reviewer-specific sibling of normal agent spawn/kill. It resolves reviewer model/runtime, tracks reviewer sessions by gate/reviewer label, and reports lifecycle telemetry/Discord events through the same lifecycle-event payload builders.

`agents/shutdown.js` owns Nova signal cleanup. Registered hooks stop all tracked sessions, best-effort reap ACP wrapper processes linked by session/env evidence, mark interrupted module status as `FAIL` unless already PASS/BLOCKED, close telemetry Redis, and exit nonzero. `setShutdownContext`/`clearShutdownContext` give module-runner attempts a scoped current session placeholder so signal cleanup can find in-flight non-Redis work.

`agents/runtime.js`, `session-semantics.js`, `session-termination.js`, `tracked-agents.js`, and `cli-args.ts` are Nova role-local facades over common pipeline authorities, preserving Nova-local imports while common code remains canonical.

## Nova CLI and core configuration/context foundations

This slice is the front door and shared foundation for Nova pipeline execution. `skills/nova/pipeline/cli.ts` is the operator/runtime CLI: it parses canonical flags, validates thinking overrides, loads platform/project config, creates a `PipelineContext`, binds it into the logger `AsyncLocalStorage`, initializes status/log dirs and shutdown hooks, then dispatches blueprint, status, dry-run, or full `runPipeline` flows.

`core/config.ts` sits immediately behind the CLI and owns config/progress loading and validation. It merges platform `swarm.config.json` with project `.swarm/progress.json`, enforces platform-owned fields, builds the startup plugin registry, and sets the repo root for Git helpers before runners/services execute.

`core/constants.ts`, `core/paths.ts`, and `core/policy.ts` are broad shared vocabulary layers used throughout Nova runners and services: status/exit/plugin contract constants, canonical `.swarm`/module/gate/log/artifact paths, and deterministic model/thinking policy resolution. `core/platform-config.ts` isolates platform config discovery, while `core/git-context.ts` preserves a Nova-local facade over repo-scoped Git primitives.

`core/context.ts` is the runtime and plugin context bridge. `PipelineContext` carries run id, log dirs, plugin registry, stats, Nova channel, and temporary runtime state while mirroring existing `config._*` fields for current callers. The plugin context builder narrows input by declared capabilities and wires default artifact, stream, telemetry, wait/signal, worker-runtime, and Discord notification surfaces.

`core/logger.ts` is the process-local logging boundary. It uses active context when present, otherwise falls back to sanitized stderr, and appends sanitized JSONL entries to project/run pipeline logs when available. `core/deps.ts` keeps explicit dependency injection scoped and out of mutable config.


## Nova plugin registry, runtime context, and public adapter surfaces

This slice is the startup registry and run-context foundation beneath Nova execution. `core/config.ts` builds the plugin registry through `core/registry.ts`; the registry clones built-in definitions, normalizes `config.plugins`, validates manifests/config/capabilities/trust policy, freezes records, and builds hook/stage/gate-type indexes. Runners then require decision-stage handlers from this registry, while notification and telemetry sink dispatchers resolve ordered listener records.

`core/registry/builtins.ts` is the bridge between the PluginContextV1 registry seam and current built-in implementations: module workers dispatch through `ctx.workerRuntime`, gates call existing gate runners, validators call module/architecture validators, generators call summary/case-study services, and notification/telemetry sink definitions are appended from their service contracts.

`core/runtime.ts` is the run identity/statistics utility layer used across CLI, context, paths, policy, runners, polling, status-store, telemetry, summaries, integrations, and validators. It resolves run state from explicit context, config projections, active logger context, or a module fallback, and it also owns JSON stdout and progress loading helpers.

`core/temp.ts` is CLI-only temp-directory lifecycle support. `git-primitives.ts` and `integrations/discord-webhook.ts` are Nova-local facades over common pipeline authorities. `pipeline/index.ts` is the public Nova module barrel used by the root `pipeline.ts` facade and the CLI; it should stay a thin export surface rather than owning runtime behavior.


## Nova Discord/Gateway/Git integrations and prompt construction flow

This slice sits at Nova's boundary between runner control flow, shared common integrations, and agent prompt payloads.

`integrations/discord.js` is Nova's operator notification adapter. Runners and services pass embed fields through this module so messages are sanitized, audit JSONL is written under both pipeline/run log locations when available, delivery can be dependency-injected, webhook failures become observability degraded/restored records, and Discord remains a nonblocking side effect.

`integrations/gateway.ts`, `lifecycle-state.ts`, and `noncritical-reporting.ts` are Nova-local facades over common pipeline authorities. They preserve role-local import paths while common code owns Gateway IO, lifecycle mutation semantics, and noncritical incident reporting.

`integrations/git-worktree.ts` is Nova's Git worktree policy layer above Git primitives. Polling uses it to pull only when the shared worktree is safe. Forge/Buster handoff and gate/review runners use it to commit, stash only `.swarm` runtime artifacts around pull-before-push, reject unsafe source/config conflicts, retry pushes, and record Forge commit metadata back onto module status before Buster testing. Phase 0 reading found a risk in the already-committed Forge handoff branch: it references `budget` and `signal` without local bindings.

The prompt builders convert project progress/config state into agent instructions. Forge prompts read one module `FORGE.md` or substep `FORGE.md` files, add retry anti-patterns and bounded operator remediation, then require a typed Forge completion artifact. Buster module and gate prompts read `BUSTER.md`/gate instructions, add Git sync/tool/test-workspace sections, and append shared completion protocols. Gate-fix prompts are narrower remediation prompts for fixes after Buster findings and explicitly leave git/status/completion finalization to the pipeline.


## Nova prompt contracts, shared facades, approval gate, and Buster-gate completion/control

This slice covers prompt contracts, shared facades, and two gate-control seams inside the Nova pipeline runner flow.

- `prompts/shared.js` is the prompt-contract utility layer. Forge, module Buster, Buster gate, gate-fix, and review prompts use it to build common Git/tool/workspace sections and exact JSON artifact contracts. `makePromptResult` is the transitional return shape used by prompt builders while old string callers still exist.
- `prompts/review.js` is the review-gate prompt builder. Review gate execution asks reviewers to write strict JSON, and the review fix cycle uses the companion fix prompt to constrain Forge to listed review issues only.
- `redaction.ts` and `redis-transport.ts` are Nova role-local shared-surface facades. They keep Nova imports stable while common pipeline modules own sanitization and Redis transport implementation.
- Phase 8 starts with a runner facade baseline: remaining `.js` files under `skills/nova/pipeline/runners/**` are pure re-export facades to their paired `.ts` owners. The facade names remain runtime/package paths only; runner authority belongs to the TypeScript implementation files and the fallback ledger decisions for those owners.
- The approval gate flow is registry-driven, not a CLI. `core/registry/builtins.ts` dispatches to `runApprovalGateStage`, which initializes or resumes approval wait state, writes operator/audit artifacts, emits governance/telemetry, and returns a wait control result. Core wait handling later calls the wait controller to consume approval signal events and resolve approved/rejected/cancelled/timed-out outcomes.
- The Buster-gate completion/control helpers sit under `buster-gate-runner.ts`. The completion adapter waits for Redis or canonical output-file local evidence events and maps controller outcomes into poll results; it no longer maps legacy `gate-status.json` as completion evidence. The control helper converts Buster gate outcomes and remaining issues into typed gate-control or remediation-request results.

## Nova gate dispatch, Buster remediation, and module Buster attempt flow

This slice is the registry-dispatched gate execution layer plus the Buster-specific gate/module adapters under it.

`runners/gate-runner.js` is the generic gate dispatcher used by the pipeline runner. It resolves a gate type owner from the startup plugin registry, builds a stage invocation envelope with artifact refs and a state snapshot from status-store/lifecycle evidence, requires a `gateControl` adapter, then runs standard, remediable, or waitable gate scheduling. It maps every gate result back into a canonical typed pipeline step result.

`runners/buster-gate-runner.ts` is the built-in remediable Buster gate implementation registered from `core/registry/builtins.ts`. It checks canonical completion through `gate.output_file`, archives stale local/Redis evidence, builds the Buster gate prompt, validates Buster config, archives stale completions, dispatches Buster, waits for Redis/local completion evidence, applies session rate-limit recovery, and delegates terminal mapping to `buster-gate-terminal.js`. When a Buster gate is configured for `fix_and_retest`, it exposes a remediation controller that asks `buster-gate-fix-cycle.js` to run Forge fixes and then re-evaluates the gate.

`buster-gate-task.js` is the pure identity/payload helper layer for gate-scoped Buster dispatch: dispatch ids, archive identities, spawn options, active-session metadata, and rate-limit status fallbacks. `buster-gate-terminal.js` maps pass/fail/config/spawn/contract/parse/timeout/git/rate-limit outcomes into Buster gate control results, telemetry, Discord presentation, and PASS fallback evidence files.

`gate-forge-fix-cycle.js` is shared by Buster and review gates. Gate-specific adapters provide prompt text, correlation, messages, and cleanup policy, while the shared engine starts Forge, health-checks it through the scaffold, waits for completion, handles no-change and rate-limit outcomes, attempts Git publication as a non-authoritative persistence side effect, surfaces commit/push failures as typed degraded fix outcome evidence, and returns scheduler modes for retest or terminal handling.

The module attempt files in this slice sit on the module-runner path. `module-runner/attempt.ts` resolves module config/defaults, prepares dependency injection, blocks on unmet module dependencies, and delegates the attempt state machine. `module-runner/buster-phase/dispatch.ts` is the Buster phase dispatch step inside that state machine: it builds/saves the Buster module prompt, validates config on the first crash retry, marks module status as Buster-active, sets shutdown context, sends operator notification, and invokes the Buster worker. `module-runner/buster-phase/identity.ts` centralizes completion correlation precedence for downstream Buster phase failure/terminal modules.

## Nova module attempt Buster phase and worker dispatch

This slice is the middle of Nova's per-module attempt flow. `runners/module-runner/attempt.ts` enters `runModuleAttemptStateMachine`, which skips already terminal modules, releases blueprints for new modules, runs Forge when needed, finalizes Forge-only modules, prepares Buster inputs, and then delegates to `runModuleBusterPhase`.

`runners/module-runner/preflight.js` is the Forge-side contract gate invoked before Forge spawn. It converts validation failures into the normal module failure/retry path instead of letting malformed Forge instructions reach an agent.

`runners/module-runner/buster-phase.ts` owns the Buster retry loop after Forge output is ready. It resolves Buster policy, tracks phase telemetry, dispatches Buster worker attempts, handles spawn/poll failures, reconciles trusted Redis completion evidence with local status through the shared completion adjudicator, and routes PASS/FAIL/BLOCKED terminal statuses to extracted handlers.

The extracted Buster handlers separate terminal policy:
- `poll-failure.js` handles rate-limit exhaustion, polling Git failures, Redis/local completion conflicts, crash retries, and crash-retry exhaustion.
- `spawn-failure.js` turns worker spawn failure into operator alert plus terminal module failure telemetry.
- `terminal-failure.js` classifies Buster terminal failures as infrastructure crash, pre-test suite failure, repeated pre-test failure, or normal agent test failure before deciding Nova escalation versus Forge retry.
- `terminal-pass.js` finalizes module status, pass telemetry, log scope, and run stats.

`runners/module-runner-buster-worker.ts` is the plugin-registry bridge for the `worker:module_buster` owner. It builds the typed worker input and plugin invocation context, exposes lifecycle callbacks that keep active-agent status current, normalizes the registered worker's control result, and returns typed Buster worker controls to the surrounding phase.

`runners/module-runner/terminal-results.ts` centralizes the small terminal/retry envelopes shared by Forge, pre-Buster, Buster, and module-attempt error paths. The old Buster phase compatibility re-export has been deleted; `runners/module-runner/buster-phase.ts` is the canonical implementation surface.

## Nova module Forge/pre-Buster phases and pipeline runner control loop

This slice connects the already-mapped module attempt state machine to Forge execution, pre-Buster validation, and the top-level pipeline loop.

`runners/module-runner.ts` is the public module lifecycle facade used by pipeline runner dependencies. It resolves module context, loops over `executeModuleAttempt`, emits retry telemetry, sleeps briefly between retries, and projects the final module result into the canonical pipeline-step envelope.

`runners/module-runner-forge.ts` owns the Forge phase inside a module attempt. It runs preflight, resolves Forge policy, builds/saves the Forge prompt, marks Forge active, invokes the registered `worker:module_forge` plugin through PluginContextV1, interprets worker poll results, handles no-change/timeout/rate-limit/parse/git failure paths, accepts valid Forge completion evidence into `READY_FOR_TESTING`, and finalizes Forge-only modules as PASS only after durable Git persistence succeeds.

`runners/module-runner-prebuster.ts` is the guard between Forge and Buster. It promotes Buster-only modules to `READY_FOR_TESTING`, runs registry validators for delivery lint and pre-check on Forge+Buster modules, converts validator block/retry outcomes into normal module terminal/retry envelopes, fail-closes when validation milestones are missing, and performs Git sync before Buster dispatch.

`runners/module-runner-shared.ts` is the common helper layer for module phases and worker bridges. It builds plugin refs/invocations/run inputs for Forge, Buster, and validators; owns module timing/attempt/validation helper logic; normalizes typed worker-control results; builds typed module pipeline-step results; and supplies worker runtime effects for built-in worker dispatch.

`runners/pipeline-runner-deps.js` is the top-level dependency table for the pipeline runner. `runners/pipeline-runner-loop.js` obtains those deps, routes scheduled validator steps through the scheduling runner/projection path, and delegates the main iteration to `pipeline-runner-state-machine.js`.

`runners/pipeline-runner-lock.js` serializes full pipeline runs per `swarm_dir` with a leased lock file and heartbeat. `runners/pipeline-runner-recovery.js` re-exports that lock boundary and reconciles stale module/gate active sessions before normal scheduling continues: it confirms identity, observes ACP monitor state, terminates live stale sessions when confirmed, blocks unconfirmed identity/kill cases, resets stale module statuses only when typed session evidence permits recovery, refuses age-only resets with durable operator evidence, and clears stale gate active-session files.

`runners/pipeline-runner-scheduling/snapshots.js` is a small scheduling helper for status counts and generator artifact refs under the pipeline log directory.


## Nova pipeline runner scheduling, terminal flow, and review remediation

This slice is the top-level Nova pipeline control plane after module/gate primitives have been extracted. `pipeline-runner.ts` is the public runner facade used by `pipeline/index.ts` and `cli.ts`; it serializes runs with the pipeline lock, starts observability/plugin sidecars, reconciles stale state, starts lifecycle telemetry, and then dispatches either a single-module run or the full pipeline loop.

`pipeline-runner-start.js` owns run startup preparation: run-scoped log-dir compatibility setup, config-validation snapshotting, started telemetry, single-module terminal handling, and pre-run architecture validation. It delegates control-file preparation and scheduled validator execution to `pipeline-runner-scheduling.js`.

`pipeline-runner-scheduling.js` decides what work is next. It projects module and gate read models, injects configured validators before/after refs, supports inline validators in `execution_order`, rejects unknown execution-order targets that cannot resolve to a typed module/gate/validator, inserts mandatory `validator:full_lint` before review gates when registered, and builds typed plugin envelopes for validators and generators. `pipeline-runner-scheduling/validator-completions.js` is the durable idempotency store for scheduled validators so completed mandatory validators are not rerun on resume; corrupt completion state fails closed and requires repair instead of being treated as empty.

`pipeline-runner-state-machine.js` is the small execution loop: plan the next scheduler result, require an explicit typed step kind, resume durable cooldown for that step, run a validator/gate/module through injected deps, and hand terminal outcomes to `pipeline-runner-terminal.js`. Unknown or missing next-step kinds fail validation instead of defaulting to module execution. The terminal module is the typed pipeline-step boundary: invalid old-shape results fail closed, halts emit operator/Discord/summary/cost artifacts, blocked halts can schedule a project summary, and successful completion emits summary/review/case-study generators idempotently.

`pipeline-runner-shared.js` is the narrow shared projection layer for this control plane. It centralizes gate type resolution, module/gate scheduler state projection, blocked-module result construction, and the limited terminal correlation backfill from named read models.

`remediable-gate-engine.js` is the generic gate remediation loop used under gate runners. It invokes registered `gate.execute` plugins, normalizes typed control results, then repeats request-fix/evaluate cycles through a remediation controller until pass, terminal halt, or exhausted policy. Fix attempts must return the typed outcome union (`terminal`, `retry_request_fix`, or `re_evaluate`); legacy control-result-only fix outcomes fail validation.

`review-gate-control.js` and `review-gate-fix-cycle.js` are the review-gate adapter over that generic mechanism. Review control maps review compatibility results and extracted issues into typed gate-control/remediation requests; the fix-cycle adapter builds review-specific Forge prompts, preserves review correlation, and delegates actual Forge fix mechanics to the shared gate Forge fix-cycle engine.

## Nova review gate execution, waitable gate dispatch, adapter resolution, and observability comparison

This slice fills the bridge between the previously mapped generic gate/remediation control plane and concrete review-gate execution.

- `runners/review-gate-output.ts` is the pure contract-normalization leaf. It translates Echo reviewer JSON into canonical GO/NO-GO decisions only, extracted issue lists, no-go summaries, and typed findings used by the review gate-control adapter.
- `runners/review-gate-task.ts` owns one Echo review attempt: generate lint evidence, build prompt, spawn/poll/kill Echo, preserve redacted prompt/transcript artifacts, publish Discord completion, commit review output with typed Git degradation evidence, copy the merged gate output, and parse the result. Required review lint failures now fail review setup with durable operator evidence, while explicitly optional lint remains warning-only. Review artifact fan-out failures remain non-authoritative but emit durable `review_artifact_write_failed` evidence.
- `runners/review-gate-runner.ts` owns review-gate stage policy: normalize typed review config, select a primary reviewer through explicit or single-reviewer policy, skip already-GO output, optionally start Forge from an existing NO-GO plus Nova prompt, handle missing reviewers/invalid contracts/rate-limit exhaustion, emit gate telemetry, request Forge remediation, and expose the registry adapter used by `core/registry/builtins.ts`.
- `runners/stage-envelope-primitives.ts` is a small shared stage-envelope helper used by module, gate, scheduler, and snapshot builders to create stable refs/invocation payloads and to include only artifact refs that exist. Malformed stage refs now fail typed validation instead of being silently omitted, while missing optional artifact paths remain materialized-only observability refs.
- `runners/waitable-gate-engine.ts` is the scheduled waitable gate bridge. It wraps registered `gate.execute` plugin handlers in PluginContext envelopes, validates wait controllers for `nextAction: wait`, resolves the wait signal, tags wait-loop errors with stage-started evidence, and returns typed control results.
- `pipeline/security.js` and `services/acp-gateway-contract.ts` are Nova role-local facades over common pipeline authorities so Nova callers use stable local paths while implementation remains shared.
- `services/acp-observability.js` is used during pipeline-runner stale recovery to poll ACP monitor state a few times and feed gateway/transcript degraded/restored telemetry surfaces before deciding how to handle active-session evidence.
- `services/adapter-registry.ts` is the fail-closed adapter allowlist for critical runtime extension points. Redis dispatch/completion and project-summary generation resolve here instead of loading arbitrary config paths.
- `services/agent-observability-evidence/comparator.ts` is an existing TypeScript evidence-analysis island. It compares new hook/ingress observability events against legacy ACP gateway polling evidence and reports coverage, span completeness, session timing, identity gaps, and Redis pressure.

## Nova agent-observability ingestion, Forge completion, and approval signal flow

This slice maps three runtime side channels around the main pipeline runner.

- `services/agent-observability-runtime.ts` is the runner-started sidecar wrapper. `runners/pipeline-runner.ts` starts it after the OpenClaw observer plugin and stops it in `finally`; it is not a CLI entrypoint. When `config.agent_observability.ingester.enabled` is true, it loops over the ingester, pressure checks, and stream trimming.
- `services/agent-observability-ingester/*` is a TypeScript island that consumes validated agent-observability control events from Redis, maps promoted hook events into legacy/current telemetry events, ACKs or dead-letters each control entry, and updates model usage snapshots for `model_usage` hooks. The index file is the package surface used by the JS runtime wrapper.
- `services/agent-observability-evidence/{index,types}.ts` expands the existing evidence comparator island. It is a type/reporting surface for hook-vs-legacy observability evidence and is not on the active pipeline control path in the source search.
- `services/agent-observability-forge-completion.js` is the Forge completion authority used by `services/polling.js`. `pollForgeCompletion` first waits for canonical `agent.ended` telemetry, then accepts completion only when Git diff/status contains meaningful non-control changes. ACP session end remains a degraded fallback signal when hook telemetry is unavailable or degraded.
- `services/approval-signal-event-adapter.js` is a filesystem edge adapter under `runners/approval-gate-runner.js`. It watches the approval gate state file, converts local file updates into canonical `approval.signal` EventBus events, and emits `fatal.error` for adapter/state contract failures instead of making the runner parse filesystem noise directly.

## Nova architecture validation, artifact, blueprint, and Buster completion flow

This slice spans Nova startup validation, artifact authority metadata, blueprint/control-file synchronization, and event-driven Buster completion waits.

`services/arch-validator-checks.js` is the deterministic pre-run structure validator. It checks `progress.json`, module `FORGE.md`/`BUSTER.md`, optional `test-spec.json`, gate instruction files, dependency references, validator schedules, and model config before module work starts.

`services/arch-validator.js` wraps those deterministic checks in the registered `validator:architecture` stage. It optionally asks the Gateway for agent judgment, writes `architecture-validator/{results.json,summary.md,validator-prompt.md}`, and projects results into the typed validator control-result shape consumed by scheduler/start/governance code. Blocking findings halt before module execution; artifact write failures are nonterminal.

`services/artifact-bundle.js` is the read/write map for pipeline artifact surfaces. It classifies run-scoped replay logs, latest pointers, operator mirrors, diagnostic fallbacks, summary views, and plugin artifact indexes so callers can display evidence without granting lifecycle, scheduler, or completion authority to artifact files. `PipelineContext` uses its plugin artifact API to give plugin handlers scoped artifact persistence under the current run log directory.

`services/blueprint.ts` sits before and around module/gate execution. CLI blueprint commands call it directly; the module state machine releases a module blueprint from the architecture branch before Forge/Buster; the pipeline scheduler releases gate files and synchronizes control files from architecture after startup. Its Git operations intentionally stage only selected module/gate/control paths.

`services/buster-completion-controller.js` is the shared event wait controller under Nova polling and Buster-gate completion. It waits for completion/local/fatal events, validates Redis completion entries, delegates terminal evidence decisions to the completion adjudicator, and lets gate callers project output-file evidence through a local resolver.

## Nova case-study, completion evidence, and typed plugin contracts

This slice maps Nova's generator side output and several contract/edge authority layers used by the runner and gate system.

- `services/case-study.js` is the registered `generator:case_study` implementation. It writes agent instructions from pipeline artifacts, spawns an Echo/summary agent, polls the configured markdown output, archives redacted transcripts when ACP is used, emits summary telemetry/Discord notices, and returns a typed generator result. Failures are noncritical generator failures rather than direct pipeline process errors.
- `services/completion-adjudicator.js` is the in-process truth policy between Redis completion entries and local status projections. It normalizes identity, detects drift/conflicts, permits Redis terminal authority only when active dispatch identity is confirmed, and tells callers whether Redis completion may be applied to status.
- `services/completion-event-adapters.js` is the edge adapter layer for event-driven completion waits. Redis completion entries and local filesystem evidence are converted into EventBus events; adapter failures become `fatal.error` events instead of direct status decisions.
- `services/contract-diagnostics.js` guards typed plugin boundaries by turning invalid plugin returns into redacted `PLUGIN_CONTRACT_INVALID` diagnostics. The old `services/compatibility-authority.ts` helper was deleted after result projections were removed.
- `services/contracts/gate-control-result.ts` owns typed gate control results and validation. Built-in review/Buster/approval controls now make explicit typed decisions in their owning control modules.
- `services/contracts/generator-result.ts` owns typed generator results consumed by case study, project summary, and scheduler generator dispatch. `services/contracts/index.js` was deleted as a legacy broad namespace barrel; consumers import owning contract modules directly.

## Nova typed result contracts, correlation, dependency, alert, and failure-taxonomy flow

This slice is a cross-cutting service layer used by Nova runners after registry dispatch and before old compatibility consumers are fully removed.

- `services/contracts/pipeline-step-result.ts` is the typed envelope that generic gate/module/validator scheduling code returns upward to the pipeline runner. It converts typed control results into canonical step actions/outcomes and derives terminal exit metadata from typed outcomes.
- `services/contracts/validator-control-result.ts` and `worker-control-result.ts` are typed plugin-boundary contracts. Deterministic validators and module workers build `nextAction`/`issueType` control results directly; compatibility projection helpers were removed.
- `services/correlation.js` is the shared identity resolver used by runners, status-store, polling, rate-limit, summaries, and plugin context. It keeps status/result/read-model identity extraction in one place and records provenance for mixed active-agent/read-model sources.
- `services/dependencies.js` is the module scheduler dependency gate. It reads canonical scheduler projections for modules/gates and deliberately refuses legacy gate PASS/APPROVED status when canonical completion output is missing.
- `services/discord-fields.js` is a Nova-local facade for shared Discord identity/rate-limit field builders so runners can present consistent identity fields without owning the field contract.
- `services/durable-operator-alert.js` is the local-first alert writer below observability/telemetry: it writes sanitized JSONL records before any network/sink delivery and reports write failures as nonblocking incidents.
- `services/failure-semantics.js`, `services/failures/classification.js`, and `services/failures/incidents.js` define failure taxonomy, text/pre-test/git classification, stale-recovery descriptions, and nonblocking incident reporting used by recovery, retry policy, presentation, and status-store appenders.


## Nova failure retry, gate-remediation scaffolds, governance, and validator support

This slice is the support layer used after registry/runners have delegated to concrete module, gate, validator, or governance flows.

- There is no public `services/failures.js` namespace. Callers import leaf failure authorities directly: `failure-semantics.js` for taxonomy/stale-recovery descriptions, `failures/classification.js` for text/git/pre-test classifiers, `failures/presentation.js` for Discord/Nova-injection surfaces, and `failures/retry-policy.js` for module retry/escalation outcomes.
- `services/forge-completion.js` is the legacy reader/validator for agent-written `forge-completion.json`. It is not the newer hook authority, but remains a narrow artifact contract reader for migration compatibility.
- `services/gate-active-session.js` fences gate active-session truth. Status-store lifecycle read models are authoritative; per-gate active-session JSON and tracked-agent records are recovery/diagnostic evidence only. Gate runners and gate fix scaffolds persist/clear these files, while recovery reads them to decide whether stale gate work can be trusted.
- `services/gate-fix-scaffold.js` extracts the common Forge-fix session setup/teardown used by gate remediation. It writes redacted prompts/transcripts, uses injected orchestration deps for policy/spawn/poll/kill, and keeps gate active-session evidence in sync around remediation cycles.
- `services/git-soft-fail-observability.ts` is a tiny telemetry adapter for caller-owned Git commit/push degradation. It lets module/gate runners record nonterminal Git persistence soft-fails without changing terminal decisions.
- `services/governance-context.js` is an in-memory run context that summarizes architecture-validator and approval-gate outcomes for approval embeds and final summaries. It does not replace the canonical governance artifacts written under `.swarm/logs`.
- `services/lint.js` is the lint-report subprocess boundary used by pre-check, review gates, and validator stages. It translates lint-report CLI output into structured reports and reviewer/pre-check text, while treating missing tooling as skipped in pre-check.
- `services/module-validators.js` bridges built-in registry validator stages to existing lint/delivery checks and returns typed validator-control results for scheduler consumption.

## Nova notification, observability, plugin runtime, and polling support

This slice covers cross-cutting side-effect services under the Nova runner and polling flows.

- `services/notification-contract.ts` defines canonical notification hook ids and built-in registry plugin definitions for telemetry, structured-event artifact mirroring, and Discord notification sinks. It builds the immutable notification input envelope used by dispatch and normalizes refs/ids around run/module/gate/stage identity.
- `services/notification-dispatch.js` is the registry-driven notification runner. It resolves enabled listeners from the startup-frozen plugin registry, narrows input by listener capabilities, invokes each listener through `PluginContext`, and reports missing or failed listeners through observability without making notification delivery pipeline-authoritative.
- `services/observability.js` is the local-first observability and cost side-effect layer. It tracks degraded/restored transitions in memory, writes durable operator alerts and `pipeline.jsonl` mirrors, emits telemetry stream events, records usage snapshots, aggregates cost/token data, evaluates budget thresholds, and writes cost reports for runner start/terminal/summary flows.
- `services/openclaw-plugin-runtime.ts` is the `runPipeline` sidecar controller for the external OpenClaw agent-observer plugin. It conditionally enables the plugin before agent-observability ingestion and disables it during runner cleanup.
- `services/pipeline-event-contract.ts` is a Nova production-path facade over the common EventBus contract used by approval, completion, ACP monitor, and polling adapters.
- `services/polling-dual.js` is the event-driven Nova wait path for Buster module completion. It combines Redis completion events and local output-file evidence through EventBus adapters, delegates truth policy to the Buster completion controller/completion adjudicator, then projects results back into the module polling envelope.
- `services/polling-identity.js` and `services/polling-observability.js` are pure/support leaves for ACP polling. Identity helpers normalize tracked-agent/status/session identities; observability helpers update gateway/transcript health, publish transcript deltas, and emit periodic progress.
- `services/polling-redis-completion.js` prepares a new Buster dispatch by archiving stale Redis completion entries through the registered Redis adapter. Archive failures are recorded as degraded evidence instead of silently allowing stale completions.
- `services/polling-session-end.js` is the ACP session end poller used through the polling facade. It waits on ACP monitor EventBus events, performs safe Git pulls and HEAD/worktree change detection, handles session terminal grace periods, sends timeout nudges, delegates rate-limit cooldowns, and returns session completion/no-change/timeout/git-error envelopes to callers. It does not stage or commit files; callers own final Git policy.

## Nova polling, prompt ingress, and rate-limit result/finalizer flow

This slice sits under Nova's runtime CLI, module/gate runners, and post-run summary paths.

- `services/polling.js` is the public polling facade. It provides the shared budgeted polling loop, file/status polling, Forge completion polling, Buster completion waiting, stale Redis completion archive re-export, session-end re-export, completion-adjudicator re-exports, and rate-limit recovery wrappers. Forge completion first prefers `agent.ended` telemetry plus meaningful Git diff evidence; ACP session monitoring remains a degraded fallback. Buster completion delegates to the event-driven `polling-dual.js` path and completion adjudicator.
- `services/prompt-ingress.js` is the Nova CLI/operator prompt ingress boundary. The CLI resolves bounded inline/file operator remediation text through this module; Forge/review prompts only receive the redacted XML-fenced directive.
- `services/rate-limit-builders.js` and `services/rate-limit-builders/exhaustion-options.js` are the rate-limit shape/factory layer consumed by `services/rate-limit.js` and polling wrappers. They normalize module/gate/summary RATE_LIMITED status, preserve tracked dispatch/gateway correlation across pause cycles, build Discord identity fields, and assemble recovery/exhaustion hook options.
- `services/rate-limit-exit.js` is the terminal exhaustion finalizer layer. It turns cooldown exhaustion or terminal-owned Redis rate-limit entries into canonical exit results, writes durable local operator alerts before network delivery hooks, emits retry/summary telemetry when configured, and sends Discord presentations through injected/default notifiers.
- `services/rate-limit-contract.ts` is a Nova role-local facade over the common rate-limit contract so Nova presentation/builders use a stable local import path while the common module owns payload/embed/field semantics.

## Nova rate-limit, Redis completion, remediation, serialization, session authority, and compatibility projection flow

This slice spans Nova's cross-cutting runtime support after polling and typed-result helpers.

- `services/rate-limit.js` is the orchestration layer over the rate-limit builder/finalizer modules. Polling, module runners, gate runners, summaries, and scheduler startup use it to pause, emit cooldown lifecycle/telemetry/Discord evidence, sleep or replay durable cooldowns, mutate old module status snapshots for operator visibility, then resume or return exhausted exit results.
- `services/redis-completion.js` is the Redis completion stream policy leaf. It validates completion entries through the common Redis contract, requires strong expected dispatch identity by default, accepts only canonical `source=buster-pipeline`, detects conflicts, annotates same-outcome duplicates/ignored sources, scans from stream tail, and archives stale completion entries without deleting the active identity.
- `services/redis-log.js` is the local Redis observability side channel. It writes bounded JSONL exchange/operation records to global and run-scoped Redis log targets, with all write/serialization failures reported as nonblocking incidents.
- `services/redis-message-contract.ts` is a Nova role-local facade over the common Redis envelope/task/completion schema so Nova services and tools can keep local import paths while common owns the schema.
- `services/remediation-handoff.js` is the typed gate remediation handoff helper between gate-control adapters and generic remediable gate/fix-cycle engines. It builds and validates `request_fix` control results and enforces the remediation controller method contract.
- `services/serialization.ts` is the shared JSON-safe clone/freeze primitive layer used by plugin context, typed contracts, telemetry/notification dispatch, remediation, and status-store projections.
- `services/session-authority.js` makes active-session authority explicit: lifecycle read models are authoritative; status `active_agent`, active-session files, and tracked-agent registries are diagnostic evidence only.
- `services/status-store-compat/common.js`, `gate-projection.js`, and `module-projection.js` are the compatibility projection bridge between legacy artifact evidence and lifecycle read models. Gate projection keeps `output_file` canonical and `gate-status.json` diagnostic except approval wait synchronization. Module projection keeps lifecycle module state canonical, allowing legacy status JSON to bootstrap only in explicit migration mode and otherwise projecting it as operator evidence/drift.

## Nova status-store lifecycle and diagnostic status flow

This slice is Nova's durable run/module/gate state backbone. It makes lifecycle read models canonical while keeping legacy status artifacts available only as diagnostics or compatibility projections.

- `services/status-store.js` is the public state facade used by CLI startup, module/gate runners, polling, scheduler dependencies, retry/rate-limit flows, and terminal handling. It creates run log directories, resets lifecycle read models for a run, reads module state from lifecycle read models, guards writes to lifecycle-controlled status fields, and writes redacted legacy `status.json` only as a diagnostic artifact.
- `services/status-store-lifecycle.js` is the public lifecycle facade. It exposes canonical event appenders/read-model operations plus selected ref and approval helpers to status-store, gate active-session recovery, and compatibility projection modules.
- `services/status-store-lifecycle/appenders.js` is the event-ingress layer. It turns pipeline, module-attempt, wait/resume, cooldown, and stale-recovery proposals into idempotent canonical events, validates transition legality, appends `canonical-events.jsonl`, and saves projected read models.
- `idempotency.js`, `legality.js`, `refs.js`, `storage.js`, `read-models.js`, and `projections.js` are lifecycle leaves: they respectively define event de-dupe keys, legal transition checks, canonical run/module/gate/wait/cooldown refs, run-scoped file storage, read-model defaults/progression, and event-to-read-model projection.
- `services/status-store-compat.js` is the compatibility bridge over legacy module and gate projection leaves. It lets scheduler/truth-drift callers read old `status.json`/`gate-status.json` evidence without restoring those files as scheduler or completion authority.


## Nova summary and telemetry finalization flow

This slice covers Nova's post-run generator/reporting layer and the telemetry spine used throughout orchestration.

- `services/summary.js` is the pipeline summary and pipeline-review service. Terminal runner code calls `writeSummary` to publish sanitized run summaries and `latest.json`; built-in generator stages call `generatePipelineReview` through the registry to spawn an Echo review session, poll its output, archive transcripts, and return a generator result. It re-exports case-study helpers and `generateProjectSummary` so runner deps can keep one summary surface.
- `services/summary/project-summary.ts` is the registry-backed project summary generator adapter. It resolves the configured project-summary generator from the adapter registry, writes sanitized project summary artifacts under the pipeline log dir, emits summary telemetry, and optionally posts Discord embeds containing artifact references.
- `services/summary-session-cleanup.ts` is a small finalization helper shared by pipeline-review and case-study sessions. It guarantees one cleanup pass, terminates the tracked ACP session when present, untracks the diagnostic entry, and returns cleanup diagnostics instead of throwing.
- `services/system-io-warning.js` is the nonblocking local-I/O warning path for logging, policy audit, and prompt-artifact writes. It emits `system.io_warning` telemetry and falls back to sanitized stderr JSON if even telemetry emission fails.
- `services/task-transport-contract.ts` and `services/telemetry/payload-schema.ts` are Nova role-local facades over common task transport and telemetry payload schema contracts.
- `services/telemetry/dispatch.js` is Nova's core event emitter. It validates payloads through the common schema, dispatches registry-owned telemetry sinks, appends disk audit events, records degraded observability on failures, and keeps operator alerts durable before Discord delivery.
- `services/telemetry/builders.js` is the ergonomic event-builder layer used by runners, gates, agents, summaries, rate-limit handling, and observability surfaces. It shapes pipeline/module/gate/agent/retry/summary/budget/approval/cost/rate-limit events and tracks degraded/restored gateway/transcript/Redis surfaces.
- `services/telemetry/progress.js` is the polling progress adapter for transcript/progress events.
- `services/telemetry/sinks.js` exposes shutdown cleanup for the telemetry Redis stream connection.

## Nova telemetry sink spine, validation drift reporting, and lint-report container/YAML tools

This slice completes Nova's telemetry public surface around the registry-owned sink model. `services/telemetry.js` is the broad service facade consumed by runners, agents, gates, summaries, shutdown, and the public `pipeline/index.ts`. Event builders and dispatch live in `services/telemetry/*`; sink dispatch then enters `services/telemetry-sink-dispatch.js`, which resolves startup-frozen plugin listeners for the `telemetry.sink` hook, narrows input by capabilities, creates plugin contexts, and isolates per-sink failures as observability degradation.

`services/telemetry-sink-contract.ts` defines the built-in Redis and Discord telemetry sink plugin records. The Redis sink writes the full telemetry firehose through `services/telemetry-stream.js`; the Discord sink only sends events with explicit presentation payloads. `services/telemetry-stream.js` is the Redis stream writer: it gates on telemetry config, derives project/run stream keys, allocates per-run sequence numbers, sanitizes payloads, and closes its lazy Redis singleton through the telemetry sink close path.

`services/truth-drift.js` is a read/projection layer used by status-store diagnostics. It compares scheduler compatibility projections and completion-adjudicator evidence for modules/gates, returning drift reports plus legacy artifact references; it does not own scheduler or completion authority.

`services/validation.js` provides Nova's pre-Buster validation checks. Preflight validation compares `test_config` file references against module `FORGE.md` deliverables before Forge. Delivery lint validates generated Dockerfile/static path consistency before Buster dispatch and formats failures for module runners.

`pipeline/telemetry.ts` and `pipeline/timing.js` are Nova repo/dev facades over common pipeline helpers, preserving production-style local import paths for Redis telemetry/timing clients.

`tools/lint-report/constants.ts` and `tools/lint-report/container-yaml-tools.ts` are part of the lint-report toolchain. The constants file owns CLI/report defaults; the container/YAML registration file adds hadolint, Helm lint, kubeconform, and yamllint runners to the tool registry for full-tier static analysis.


## Nova lint-report and project-summary tool flow

This slice covers two operator/tool surfaces that are called by Nova services but remain outside scheduler authority.

`tools/lint-report.ts` is the static-analysis aggregator executed by `services/lint.js` for pre-check and review/validator flows, and it can also run as a direct CLI. The entrypoint parses flags, resolves repo/module/changed-file scope, detects project types, loads the static `TOOL_REGISTRY`, runs applicable tools sequentially, writes a normalized JSON report, and returns a nonzero exit code when findings or tool failures are present. `lint-report/discovery.ts` owns project-type/scope/config discovery, `execution.ts` owns safe subprocess execution, `output.ts` owns JSON logging/report emission, `parsers.ts` owns JSON/export parsing helpers, `report.ts` owns per-tool orchestration and summary aggregation, and `tool-registry.ts` owns the concrete tool definitions for TypeScript, repo policy, Python, shell, JS/TS, dependency/security, Semgrep, and registered container/YAML tools.

`tools/project-summary.ts` is the canonical project-summary generator registered through `services/adapter-registry.ts` and also exposed as a direct CLI. It resolves the repo/project `.swarm` paths, collects Git/source/code stats, unit/API test census, module/gate status, runner verdicts, Echo reviews, and structured agent.spawned telemetry counts, then passes sanitized data into `project-summary-formatters.ts` for Markdown, Discord embeds, and case-study JSON projections. The service adapter owns where summary artifacts are written in pipeline logs; this tool owns collection/formatting and optional direct Discord posting only.


## Nova Redis adapter and executable compatibility shim flow

`tools/redis.ts` is Nova's registered Redis adapter at the boundary between Nova orchestration and Buster task/completion streams. The adapter registry imports it statically and exposes only registered aliases to orchestration and completion archival callers. Module Buster dispatch uses `publishTask` to build and validate a canonical Redis task envelope, then sends it through the shared task-transport queue to the Buster task stream. Polling preparation uses `archiveCompletions` to move stale completion entries out of the active completion stream while preserving the active dispatch identity. Completion read helpers are retained for direct operator/tool use and enforce strong expected identity before scanning from the stream tail.

The Redis tool is also a direct operator CLI for `send`, `read-completion`, and `archive-completions`. Discord task notification is optional and nonauthoritative; Redis stream publication and completion archive/read behavior remain the meaningful side effects. Redis completion policy itself lives in `services/redis-completion.js`; the tool is an adapter and re-export surface.

`skills/nova/pipeline.ts` is the production compatibility entrypoint for `node /app/skills/pipeline.ts`. It must stay a shim: importers receive the public `pipeline/index.ts` API, while direct execution is detected by realpath comparison and delegated to `pipeline/cli.ts`. Pipeline runtime logic belongs in the CLI, runner, and service modules, not in this shim.

## Phase 6 completion audit note

Phase 6 moved the remaining Nova orchestration/runtime authority in scope to native Node TypeScript owners while preserving only named external-adapter and observability policies. The completion audit records:

- no obsolete Nova/Common declaration shims for owners now implemented as `.ts`;
- no stale runtime import/export specifiers to deleted Phase 6 `.js` owners;
- native Node type-stripping compatibility and native import success for all `62` migrated Phase 6 `.ts` files;
- remaining unresolved pass3 rows deferred to Phase 7+ status-store/validation/tool/prompt owners or explicitly named future policy work.
