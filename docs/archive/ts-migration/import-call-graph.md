# Import and Call Graph

Purpose: record what calls what for each Phase 0 batch.

## Phase 9 unpaired JavaScript inventory

`tests/verification/contracts/check-phase9-unpaired-js-surface.mjs` locks the current unpaired `.js` inventory after Phase 8. New unpaired `.js` files under `skills/*` must be added to a Phase 9 classification or removed.

- Phase 9 is complete. The final retained unpaired `.js` inventory is 18 files: 16 pure shared facades, 1 direct runtime delegate, and 1 explicit out-of-scope operator utility.
- Pure facade import shape: the Buster/Nova `pipeline/agents/*.js`, `git-primitives.ts`, and `lifecycle-state.ts` files have no side effects beyond loading their Common TypeScript owner. They export only `export * from ...`.
- Direct runtime delegate shape: `skills/nova/pipeline.ts` re-exports `pipeline/index.ts` and dynamically imports `pipeline/cli.ts` only for direct CLI execution.
- P9-B03 migrated these Buster support-service owners to TypeScript and updated active imports: `capabilities.ts`, `gateway-health.ts`, `orphan-recovery.ts`, `pipeline-helpers.ts`, `runtime.ts`, and `session-monitor.ts`.
- P9-B04 migrated the Buster task completion, lifecycle, and queue spine to TypeScript and updated active imports: `task-completion.ts`, `task-lifecycle.ts`, `task-lifecycle/cleanup.ts`, `task-lifecycle/completion-signal.ts`, `task-queue.ts`, and `task-validation.ts`.
- P9-B05 migrated the final Buster behavior-bearing suite path helper to TypeScript: `suites/repo-paths.ts`.
- `skills/common/discord-purge.ts` is inventoried as an explicit non-pipeline operator utility outside the current migration scope.

## Phase 10 paired JavaScript inventory

`tests/verification/contracts/check-phase10-paired-facade-surface.mjs` locks all 100 paired `.js` files under `skills/*` whose same-path `.ts` owners already exist.

- Pure facade import shape after P10-B06: 86 files contain only exact `.ts` re-exports, with packaging comments allowed only on Common production facades and default re-exports allowed only where locked by the contract.
- Executable delegate shape: `skills/buster/buster-pipeline.ts`, `skills/nova/pipeline/cli.ts`, `skills/nova/pipeline/tools/lint-report.ts`, `skills/nova/pipeline/tools/project-summary.ts`, and `skills/nova/pipeline/tools/redis.ts` may inspect direct-entry state and then import the typed owner. They cannot own runtime behavior beyond delegation.
- Incoming callers/importers to paired `.js` files are now Phase 10 cleanup targets unless they are production packaging paths, operator command entrypoints, or contract tests of the facade itself.
- Outgoing edges from retained paired `.js` files must point at the same-path `.ts` owner. Any edge that reaches legacy behavior directly is a Phase 10 failure.
- P10-B02 removed active `/app/skills/lint-report.ts`, `/app/skills/redis.ts`, and `/app/skills/project-summary.ts` references. Active runtime/config/docs now point at `/app/skills/pipeline/tools/lint-report.ts`, `/app/skills/pipeline/tools/redis.ts`, and `/app/skills/pipeline/tools/project-summary.ts`.
- P10-B03 kept role-local Buster/Nova imports through shared `.js` facades only where those files are exact Common `.ts` re-exports. Runtime `/app/skills/pipeline/**` imports continue to resolve to Common owners through packaging verification, not role-local behavior.
- P10-B04 kept Nova agent/prompt/runner `.js` imports as facade edges only. The outgoing edge of every retained scoped facade is the same-path `.ts` owner.
- P10-B05 kept Nova service `.js` imports as facade edges only. Every retained service facade has exactly one outgoing edge to its same-path `.ts` owner.
- P10-B06 removed non-executable Nova tool helper `.js` edges. Active tests/docs now reach lint-report internals and project-summary formatters through `.ts` owners; the remaining tool `.js` edges are only executable operator delegates.
- P10-B07 locks active reference edges so deleted root tool aliases and deleted tool-helper facades cannot reappear in docs/deployment/source reference surfaces outside historical migration records and guard contracts.
- P10-B08 finalizes the graph: no unclassified JavaScript edges remain under `skills/*`, and retained `.js` edges either re-export a typed owner or directly delegate operator/runtime execution to a typed owner.

## Buster runtime entrypoint and repo-local shared facades

### `skills/buster/buster-pipeline.ts` / `skills/buster/buster-pipeline.ts`
- Incoming callers/importers: runtime deployment starts `node /app/skills/buster-pipeline.ts` from `my-values/buster-values.yaml`; the `.js` file is an executable-only compatibility shim that dynamically delegates direct execution to `./buster-pipeline.ts`; runtime smoke and behavior verification import/check the typed entrypoint and helper-owning modules directly; Nova completion/polling code treats Redis completion `source=buster-pipeline` as canonical evidence but does not import this file.
- Outgoing static imports from `buster-pipeline.ts`: Node `fs`, `url.fileURLToPath`; `./pipeline/agents/session-termination.js`; `./pipeline/integrations/gateway.ts`; Buster services `runtime-diagnostics.ts`, `base-images.ts`, `capabilities.ts`, `pipeline-helpers.ts`, `task-queue.ts`, `gateway-health.ts`, `orphan-recovery.ts`, `task-lifecycle.ts`.
- Dynamic imports: `buster-pipeline.ts` dynamically imports `./buster-pipeline.ts` only for direct execution; `buster-pipeline.ts` has no dynamic imports.
- Exports: `buster-pipeline.ts` exposes only the narrow runtime API: `getBusterStatus`, `shutdown`, `main`, and `handleBusterEntrypoint`; the old broad root helper barrel was deleted. Callers/tests import helpers from their owning modules (`pipeline-helpers.ts`, `session-monitor.ts`, `task-validation.ts`, `task-queue.ts`, runtime diagnostics, base images, capabilities, and task lifecycle).
- Side effects: `buster-pipeline.ts` installs `SIGTERM`/`SIGINT` handlers; when executed directly through the compatibility shim or typed file, either prints `--status` JSON and exits or starts gateway wait, orphan recovery, sandbox cleanup, base-image preload gate, Redis consumer-group setup, health monitor, and polling loop.
- Globals/coupling: module-global `shuttingDown`; direct `process.env`, `process.argv`, `process.on`, and `process.exit`; runtime coupling to Redis task stream constants, OpenClaw gateway URL, active ACP session termination, sandbox cleanup, base-image capabilities, and process diagnostic reporting.

### `skills/buster/pipeline/agent-observability/src/index.ts`
- Incoming callers/importers: contract verification imports the Buster shim; no runtime caller found in pipeline source.
- Outgoing static imports: re-exports `../../../../common/pipeline/agent-observability/src/index.ts`.
- Dynamic imports: none.
- Exports: all exports from the shared TypeScript agent-observability contract index.
- Side effects: none beyond module re-export loading.
- Globals/coupling: TypeScript source imports another `.ts` file directly; Buster path is a role-local facade over common ownership.

### `skills/buster/pipeline/agents/acp-monitor.ts`
- Incoming callers/importers: packaging/runtime verification imports the production `/app/skills/pipeline/agents/acp-monitor.ts` surface; the Buster root entrypoint no longer re-exports ACP monitor helpers.
- Outgoing static imports: re-exports `../../../common/pipeline/agents/acp-monitor.ts`.
- Dynamic imports: none.
- Exports: all shared ACP monitor exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: compatibility shim; common ACP monitor owns implementation.

### `skills/buster/pipeline/agents/lifecycle.ts`
- Incoming callers/importers: packaging/runtime/behavior verification imports the production `/app/skills/pipeline/agents/lifecycle.ts` surface; the Buster root entrypoint no longer re-exports lifecycle helpers.
- Outgoing static imports: re-exports `../../../common/pipeline/agents/lifecycle.ts`.
- Dynamic imports: none.
- Exports: all shared lifecycle exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: compatibility shim; common lifecycle owns active-session state and gateway lifecycle operations.

### `skills/buster/pipeline/agents/runtime.ts`
- Incoming callers/importers: packaging/runtime verification and session-launch helpers import the production runtime/harness surface; no direct import from `buster-pipeline.ts` found.
- Outgoing static imports: re-exports `../../../common/pipeline/agents/runtime.ts`.
- Dynamic imports: none.
- Exports: all shared runtime/harness classification exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: compatibility shim; common runtime owns model/harness classification.

### `skills/buster/pipeline/agents/session-semantics.ts`
- Incoming callers/importers: packaging/foundation/lifecycle-audit verification references the production path; no direct import from `buster-pipeline.ts` found.
- Outgoing static imports: re-exports `../../../common/pipeline/agents/session-semantics.ts`.
- Dynamic imports: none.
- Exports: all shared session semantic exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: compatibility shim; common session semantics owns session-state vocabulary/parsing.

### `skills/buster/pipeline/agents/session-termination.ts`
- Incoming callers/importers: `skills/buster/buster-pipeline.ts` imports `terminateActiveSession` for shutdown; behavior/contract verification imports/checks the production surface directly; the Buster root entrypoint no longer re-exports termination helpers.
- Outgoing static imports: re-exports `../../../common/pipeline/agents/session-termination.ts`.
- Dynamic imports: none.
- Exports: all shared session termination exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: compatibility shim; common termination owns kill/confirmation result shape.

### `skills/buster/pipeline/agents/tracked-agents.ts`
- Incoming callers/importers: packaging/foundation/lifecycle-audit verification references the production tracked-agents path; no direct import from `buster-pipeline.ts` found.
- Outgoing static imports: re-exports `../../../common/pipeline/agents/tracked-agents.ts`.
- Dynamic imports: none.
- Exports: all shared tracked-agent registry exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: compatibility shim; common tracked-agents owns process-local diagnostic registry.

### `skills/buster/pipeline/cli-args.ts`
- Incoming callers/importers: lifecycle-audit/contract docs and role-local consumers reference the Buster facade; no direct import from `buster-pipeline.ts` found.
- Outgoing static imports: re-exports `../../common/pipeline/cli-args.ts`.
- Dynamic imports: none.
- Exports: all shared CLI parser exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: compatibility shim; common CLI parser owns strict parser behavior.

### `skills/buster/pipeline/git-primitives.ts`
- Incoming callers/importers: lifecycle-audit/contract docs and role-local consumers reference the Buster facade; no direct import from `buster-pipeline.ts` found.
- Outgoing static imports: re-exports `../../common/pipeline/git-primitives.ts`.
- Dynamic imports: none.
- Exports: all shared Git primitive exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: compatibility shim; common Git primitives own repo-root/Git command behavior.


## Buster shared facades, suite orchestration, and base-image preparation

### `skills/buster/pipeline/integrations/discord-webhook.ts`
- Incoming callers/importers: `skills/buster/pipeline/services/discord.ts` and `skills/buster/pipeline/tools/redis.ts` import `postDiscordWebhook`; lifecycle/foundation verification references the production pipeline surface.
- Outgoing static imports: re-exports `../../../common/pipeline/integrations/discord-webhook.ts`.
- Dynamic imports: none.
- Exports: all shared Discord webhook integration exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: compatibility facade; common integration owns webhook behavior and external Discord coupling.

### `skills/buster/pipeline/integrations/gateway.ts`
- Incoming callers/importers: `skills/buster/buster-pipeline.ts` imports `resolveGatewayInvokeUrl`; Buster `gateway-health.ts` imports `checkGatewayHealth`; Buster `session-monitor.ts` imports Gateway URL/token helpers; lifecycle/foundation verification references this production surface.
- Outgoing static imports: re-exports `../../../common/pipeline/integrations/gateway.ts`.
- Dynamic imports: none.
- Exports: all shared Gateway integration exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: compatibility facade; common integration owns Gateway URL/token resolution and typed Gateway operation wrappers.

### `skills/buster/pipeline/lifecycle-state.ts`
- Incoming callers/importers: no Buster runtime source import found in this slice; behavior/packaging verification imports the production `/app/skills/pipeline/lifecycle-state.ts` surface.
- Outgoing static imports: re-exports `../../common/pipeline/lifecycle-state.ts`.
- Dynamic imports: none.
- Exports: all shared lifecycle-state exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: compatibility facade; common lifecycle-state owns status transition/mutation helper semantics.

### `skills/buster/pipeline/noncritical-reporting.ts`
- Incoming callers/importers: Buster `logger.ts`, `telemetry.ts`, `runtime-diagnostics.ts`, and `discord.ts` import noncritical reporting/sanitization helpers; verification references the production surface.
- Outgoing static imports: re-exports `../../common/pipeline/noncritical-reporting.ts`.
- Dynamic imports: none.
- Exports: all shared noncritical reporting exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: compatibility facade; common helper owns process-local incident de-dupe and nonblocking incident formatting.

### `skills/buster/pipeline/redaction.ts`
- Incoming callers/importers: Buster `telemetry.ts`, `capabilities.ts`, `discord.ts`, and `tools/redis.ts` import redaction/Discord summary helpers; verification references the production surface.
- Outgoing static imports: re-exports `../../common/pipeline/redaction.ts`.
- Dynamic imports: none.
- Exports: all shared redaction exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: compatibility facade; common redaction owns telemetry/Discord/artifact egress sanitization policy.

### `skills/buster/pipeline/redis-transport.ts`
- Incoming callers/importers: no direct Buster runtime source import found; lifecycle/transport verification references the production shared Redis transport surface.
- Outgoing static imports: re-exports `../../common/pipeline/redis-transport.ts`.
- Dynamic imports: none.
- Exports: all shared Redis transport exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: compatibility facade; common Redis transport owns `ioredis` loading and secure transport policy.

### `skills/buster/pipeline/runners/suite-runner.ts`
- Incoming callers/importers: `skills/buster/pipeline/services/task-lifecycle.ts` imports `runSuites`; Buster docs and verification harnesses import/read the runner surface.
- Outgoing static imports: Node `path`, `fs`; `../services/verdict-schema.ts`; `../services/telemetry.ts`; `../services/capabilities.ts`; suite modules `a11y.ts`, `api.js`, `build.js`, `bundle.ts`, `e2e.ts`, `health.js`, `k8s.js`, `manifest.js`, `perf.ts`, `security.ts`, `unit.ts`, and `visual-reg.ts`.
- Dynamic imports: none.
- Exports: `runSuiteWithTimeout`, `runSuites`, `EXECUTION_ORDER`, `DEPENDENCIES`.
- Side effects: builds the frozen suite registry at module load; `runSuites` emits `suite_started`/`suite_completed` telemetry, writes verdict JSON/JSONL artifacts, logs nonblocking warnings, and executes imported suite functions.
- Globals/coupling: constants `RESULTS_DIR=/sandbox/results`, `SUITE_TIMEOUT_MS=300000`, frozen `SUITE_REGISTRY`, execution-order/dependency arrays; coupled to task payload shape, Buster capability policy, suite verdict schema, telemetry context, and filesystem artifact paths.

### `skills/buster/pipeline/security.ts`
- Incoming callers/importers: Buster `pipeline-helpers.ts`, `sandbox-cleanup.ts`, `task-validation.ts`, `base-images.ts`, and build/bundle/unit/repo-paths/k8s/e2e/perf suites import security helpers; verification references the production surface.
- Outgoing static imports: re-exports `../../common/pipeline/security.ts`.
- Dynamic imports: none.
- Exports: all shared security exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: compatibility facade; common security owns path, command tokenization, and subprocess environment guards.

### `skills/buster/pipeline/services/acp-gateway-contract.ts`
- Incoming callers/importers: no Buster runtime source import found; contract verification and shared common Gateway/agent modules reference the common owner surface.
- Outgoing static imports: re-exports `../../../common/pipeline/services/acp-gateway-contract.ts`.
- Dynamic imports: none.
- Exports: all shared ACP Gateway contract exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: compatibility facade; common contract owns typed Gateway request/result validation shapes.

### `skills/buster/pipeline/services/base-images.ts`
- Incoming callers/importers: `skills/buster/buster-pipeline.ts` imports startup pre-pull helpers.
- Outgoing static imports: Node `child_process.execFile`, `util.promisify`; local `./runtime-diagnostics.ts`, `./capabilities.ts`, and `../security.ts`.
- Dynamic imports: none.
- Exports: `BASE_IMAGES_STATIC`, `validateBaseImageRef`, `ensureBaseImages`.
- Side effects: initializes `execFileAsync` and a private typed `BASE_IMAGES` set at module load; `ensureBaseImages` reads `process.env.BUSTER_PLATFORM_CAPABILITIES`, checks capabilities, runs `podman image exists/pull`, and logs to console.
- Globals/coupling: coupled to Buster capability constants, `BUSTER_PLATFORM_CAPABILITIES`, Podman CLI, fully qualified Docker image reference grammar, shared subprocess environment security policy, and typed degraded image-level pre-pull results.


## Buster service capabilities, Discord, gateway/git/logger/orphan helpers, pipeline helpers, and rate limiting

### `skills/buster/pipeline/services/capabilities.ts`
- Incoming callers/importers: `buster-pipeline.ts` imports/re-exports capability constants/helpers; `services/base-images.ts`, `services/task-validation.ts`, `runners/suite-runner.ts`, `suites/health.js`, `suites/visual-reg.ts`, and `tools/visual-audit.ts` import capability checks/parsers; contract verification reads this surface.
- Outgoing static imports: Node `fs`, `path`; Buster redaction facade `../redaction.ts`.
- Dynamic imports: none.
- Exports: `BUSTER_CAPABILITIES`, `KNOWN_BUSTER_CAPABILITIES`, `BusterCapabilityDeniedError`, capability normalization/parsing/query helpers, suite requirement resolver, durable operator alert builder/writer, and `assertBusterCapabilities`.
- Side effects: freezes capability constants and creates private `KNOWN` set at module load; denied assertions append sanitized operator-alert JSONL records to all discovered targets.
- Globals/coupling: coupled to Buster suite names/actions, context/payload capability shapes, `.swarm/logs/pipeline/operator-alerts.jsonl`, process stderr fallback, and redaction policy.

### `skills/buster/pipeline/services/discord.ts`
- Incoming callers/importers: `services/task-lifecycle.ts` and `services/rate-limit.ts` call `sendDiscord`; `suites/visual-reg-discord.ts` calls `deliverDiscordWebhookRequest`; behavior/contract verification imports `/app/skills/pipeline/services/discord.ts`.
- Outgoing static imports: Node `fs`, `path`; local `./runtime.ts`, `./telemetry.ts`; Buster/common facades `../noncritical-reporting.ts`, `../redaction.ts`, `../integrations/discord-webhook.ts`.
- Dynamic imports: none.
- Exports: `sendDiscord`, `deliverDiscordWebhookRequest`.
- Side effects: initializes module-local webhook/audit degradation maps; `sendDiscord` writes Discord audit JSONL, may create telemetry contexts, emits degraded/restored events, and sends webhook delivery fire-and-forget.
- Globals/coupling: reads `KUBECLAW_DISABLE_DISCORD_WEBHOOKS`; depends on Discord webhook URL resolution, run/log directory conventions, telemetry event names, noncritical reporter, and Discord embed field limits.

### `skills/buster/pipeline/services/gateway-health.ts`
- Incoming callers/importers: `buster-pipeline.ts` imports `waitForGateway` and `startGatewayHealthMonitor` and re-exports gateway health helpers; contract verification checks common Gateway health boundary.
- Outgoing static imports: `checkGatewayHealth` from the Buster Gateway integration facade.
- Dynamic imports: none.
- Exports: readiness/health constants, `checkGatewayHealth`, `waitForGateway`, `startGatewayHealthMonitor`.
- Side effects: `waitForGateway` logs and sleeps until readiness or invokes caller shutdown; `startGatewayHealthMonitor` installs a `setInterval` liveness loop.
- Globals/coupling: fixed 120s readiness timeout, 3s readiness interval, 60s health interval, 3-failure threshold; caller-provided shutdown owns process exit/diagnostic emission.

### `skills/buster/pipeline/services/git-workflows.ts`
- Incoming callers/importers: `services/orphan-recovery.ts`, `services/pipeline-helpers.ts`, `services/task-validation.ts`, `suites/k8s.js`, and `tools/verify-task.ts`; verification imports `gitPushWithRetry` directly.
- Outgoing static imports: Buster Git primitives facade `../git-primitives.ts`; timing facade `../timing.ts`.
- Dynamic imports: none.
- Exports: re-exports `getRepoRoot`, `gitExec`, `getCurrentBranch`; exports `gitSync`, `gitPushWithRetry`.
- Side effects: none at module load beyond imports; functions run destructive Git commands (`fetch`, deterministic `reset --hard <targetHash>`, optional scoped add/commit, pull rebase, push) through shared primitives.
- Globals/coupling: tied to origin remote, explicit typed target commit identity, caller logger interface, retry budget/signal options, typed Git sync failure metadata, fail-closed final rebase handling, and strict scoped pathspec policy for commit mode.

### `skills/buster/pipeline/services/logger.ts`
- Incoming callers/importers: `services/task-lifecycle.ts` and `services/session-monitor.ts` call `createLogger`; behavior verification imports `/app/skills/pipeline/services/logger.ts`.
- Outgoing static imports: Node `fs.appendFileSync`, `fs.mkdirSync`, `path.dirname`; Buster/common noncritical reporting facade.
- Dynamic imports: none.
- Exports: `createLogger`.
- Side effects: none at module load; created loggers mkdir once, write every entry to stdout and optionally append JSONL synchronously, and may emit degraded/restored telemetry through caller hook.
- Globals/coupling: process stderr fallback, secret-key regex, Buster JSONL entry shape, caller-provided `logPath`, module/task/correlation options, and noncritical reporting sanitizer.

### `skills/buster/pipeline/services/orphan-recovery.ts`
- Incoming callers/importers: `buster-pipeline.ts` imports/re-exports startup recovery; behavior/contract verification reads the Buster runtime recovery surface.
- Outgoing static imports: Node `fs`; local `./git-workflows.ts`, `./pipeline-helpers.ts`, `./runtime-diagnostics.ts`.
- Dynamic imports: none.
- Exports: `recoverOrphanedActiveSession`.
- Side effects: reads persisted active-session JSON when present and emits a runtime diagnostic; intentionally does not hydrate local state, kill sessions, or delete files.
- Globals/coupling: `.swarm/logs/buster/active-session.json` evidence path, runtime diagnostic service, and explicit lifecycle-authority fence fields.

### `skills/buster/pipeline/services/pipeline-event-contract.ts`
- Incoming callers/importers: `services/session-monitor.ts` imports `createPipelineEventBus`/`waitForAny`; lifecycle-audit and event-contract verification check the Buster shim.
- Outgoing static imports: re-exports `../../../common/pipeline/services/pipeline-event-contract.ts`.
- Dynamic imports: none.
- Exports: all shared pipeline event contract exports.
- Side effects: none beyond re-export loading.
- Globals/coupling: role-local compatibility shim for production `/app/skills/pipeline/services/pipeline-event-contract.ts`; common module owns implementation.

### `skills/buster/pipeline/services/pipeline-helpers.ts`
- Incoming callers/importers: `buster-pipeline.ts` imports/re-exports cleanup/rate-limit helpers; `services/orphan-recovery.ts`, `services/task-lifecycle.ts`, `services/task-queue.ts`, and `services/task-completion.ts` import helpers; verification reads the helper surface.
- Outgoing static imports: Node `fs`, `path`; local `./git-workflows.ts`, `./verdict-schema.ts`, `./sandbox-cleanup.ts`; Buster security facade `../security.ts`.
- Dynamic imports: none.
- Exports: active-session path resolver, completion identity builder, rate-limit pause resolver, output-file read/write/ensure/result helpers, pre-test verdict builder, suite/session/timeout/task-failure embed builders, and `doSandboxCleanup`.
- Side effects: no module-load side effects beyond constants; functions perform scoped path resolution, atomic JSON writes, output file reads, and sandbox cleanup delegation.
- Globals/coupling: `.swarm/logs/buster/active-session.json`, repo root, task payload/output contract, session monitor result shape, Discord embed conventions, runner verdict schema, and sandbox cleanup policy.

### `skills/buster/pipeline/services/rate-limit-contract.ts`
- Incoming callers/importers: Buster `services/rate-limit.ts`; lifecycle-audit and rate-limit contract verification check the Buster shim.
- Outgoing static imports: re-exports `../../../common/pipeline/services/rate-limit-contract.ts`.
- Dynamic imports: none.
- Exports: all shared rate-limit contract exports.
- Side effects: none beyond re-export loading.
- Globals/coupling: role-local compatibility shim for production `/app/skills/pipeline/services/rate-limit-contract.ts`; common module owns payload/embed/action semantics.

### `skills/buster/pipeline/services/rate-limit.ts`
- Incoming callers/importers: `services/session-monitor.ts` imports `createRateLimitState`, `shouldRetryAfterRateLimit`, and `handleRateLimit`; behavior/contract verification imports `/app/skills/pipeline/services/rate-limit.ts`.
- Outgoing static imports: Buster ACP monitor facade, local `./discord.ts`, `./telemetry.ts`, `./rate-limit-contract.ts`, and timing facade `../timing.ts`.
- Dynamic imports: none.
- Exports: `createRateLimitState`, `shouldRetryAfterRateLimit`, `handleRateLimit`.
- Side effects: none at module load; `handleRateLimit` mutates caller-owned state, emits telemetry, sends Discord, sleeps, probes ACP monitor liveness, and returns typed liveness evidence plus resume/kill action.
- Globals/coupling: Buster child-session monitor loop, rate-limit telemetry event contract, Discord operator surface, ACP Gateway liveness through `getAcpMonitorState`, cooldown/backoff state, gate-vs-module identity mapping, and the invariant that only confirmed closed sessions move to kill.


## Buster Redis/runtime diagnostics, cleanup, session monitor, completion, and task lifecycle helpers

### `skills/buster/pipeline/services/redis-message-contract.ts`
- Incoming callers/importers: Buster `services/task-queue.ts`, `services/task-completion.ts`, and `tools/redis.ts`; Redis contract/lifecycle verification checks the Buster shim.
- Outgoing static imports: re-exports `../../../common/pipeline/services/redis-message-contract.ts`.
- Dynamic imports: none.
- Exports: all shared Redis message contract exports.
- Side effects: none beyond re-export loading.
- Globals/coupling: role-local production-path facade; common pipeline owns Redis envelope/task/completion validation.

### `skills/buster/pipeline/services/runtime-diagnostics.ts`
- Incoming callers/importers: `buster-pipeline.ts`, `services/orphan-recovery.ts`, `services/task-lifecycle.ts`, `services/task-queue.ts`, `services/task-completion.ts`, `services/base-images.ts`, and task-lifecycle helper modules import sanitized diagnostic helpers.
- Outgoing static imports: Node `fs`, `path.join`; Buster/common noncritical reporting facade; local `./task-validation.ts`.
- Dynamic imports: none.
- Exports: `sanitizeBusterRuntimeDetail`, `safeErrorMessage`, `buildBusterProcessDiagnosticRecord`, `appendMalformedTaskArtifact`, `appendBusterProcessDiagnostic`, `reportBusterRuntimeDiagnostic`.
- Side effects: functions write `.swarm/logs/buster/malformed-tasks.jsonl` and `process-health.jsonl` best-effort and log warnings; no module-load side effects.
- Globals/coupling: reads `BUSTER_PROJECT`; uses process stderr for artifact write failures; diagnostic shape is `observability.degraded` with `diagnostic_only:true`.

### `skills/buster/pipeline/services/runtime.ts`
- Incoming callers/importers: Buster `services/discord.ts`, `suites/visual-reg.ts`, and `tools/redis.ts` import `resolveDiscordWebhookUrl`.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: `resolveDiscordWebhookUrl`.
- Side effects: none.
- Globals/coupling: reads `DISCORD_WEBHOOK_URL` and legacy `DISCORD_WEBHOOK`; caller override has priority.

### `skills/buster/pipeline/services/sandbox-cleanup.ts`
- Incoming callers/importers: `services/pipeline-helpers.ts` delegates cleanup; Buster build/k8s suites import cleanup labels and resource tracking; shell-boundary verification imports the production cleanup service.
- Outgoing static imports: Node `child_process.execFile`, `util.promisify`, `crypto`, `fs`, `path`; Buster security facade `../security.ts`.
- Dynamic imports: none.
- Exports: sandbox path constants, `CLEANUP_SCOPE_LABEL`, `CLEANUP_POLICY`, cleanup label/state helpers, `trackSandboxResources`, `cleanupSandboxResources`.
- Side effects: initializes promisified execFile and frozen policies at module load; functions write cleanup state JSON, distinguish missing/corrupt cleanup state files, discover/delete Podman containers/images and Kubernetes namespaces, clear `/sandbox/www` and `/sandbox/results`, and stop nginx.
- Globals/coupling: fixed `/sandbox` layout, `.buster-cleanup` state dir, Podman/Kubectl/Nginx CLIs, `openclaw.io/buster-scope` labels, safe namespace prefix policy, subprocess env guard, task identity fields, and typed cleanup-state diagnostics.

### `skills/buster/pipeline/services/session-monitor.ts`
- Incoming callers/importers: `buster-pipeline.ts` re-exports `monitorSession`; task-lifecycle `session.js` calls it; runtime/contract verification reads/imports the monitor.
- Outgoing static imports: Buster/common ACP monitor and session-termination facades, Gateway integration facade, local telemetry, rate-limit, logger, timing, pipeline-event, and ACP Gateway contract modules.
- Dynamic imports: none.
- Exports: `monitorSession`.
- Side effects: creates ACP monitor event adapter and event bus, emits telemetry/plugin events, publishes transcript deltas, sends rate-limit signals through `handleRateLimit`, sleeps during cooldown, and can explicitly terminate child sessions on hard timeout.
- Globals/coupling: ACP event names, Gateway URL/token env resolution via facade, rate-limit config payload, Buster telemetry context, hard timeout budget, session termination contract, and payload/session identity fields.

### `skills/buster/pipeline/services/task-completion.ts`
- Incoming callers/importers: `services/task-queue.ts`, `services/task-lifecycle.ts`, and task-lifecycle `completion-signal.ts`; completion/normalization verification reads the service.
- Outgoing static imports: local `./pipeline-helpers.ts`, `./runtime-diagnostics.ts`, `./redis-message-contract.ts`, `./task-transport-contract.ts`.
- Dynamic imports: none.
- Exports: `DEFAULT_DEAD_LETTER_SUFFIX`, `createTaskCompletionState`, completion record/field builders, `emitTaskCompletion`, dead-letter stream/field/write helpers, `didProcessResultEmitTerminalCompletion`, `ensureTaskTerminalBeforeAck`.
- Side effects: functions publish Redis completion/dead-letter entries through a Redis event bus; no module-load side effects.
- Globals/coupling: Redis message schema version/contract, completion stream payload field, dead-letter stream env `BUSTER_TASK_DEAD_LETTER_STREAM`, `source=buster-pipeline`, and ACK precondition semantics.

### `skills/buster/pipeline/services/task-lifecycle/cleanup.ts`
- Incoming callers/importers: Buster `services/task-lifecycle.ts` imports `runSandboxCleanupStage`.
- Outgoing static imports: local telemetry and pipeline helper cleanup modules.
- Dynamic imports: none.
- Exports: `runSandboxCleanupStage`.
- Side effects: emits `sandbox_cleanup` plugin events before/after cleanup and delegates to `doSandboxCleanup`.
- Globals/coupling: Buster plugin event schema and cleanup stage names.

### `skills/buster/pipeline/services/task-lifecycle/completion-signal.ts`
- Incoming callers/importers: Buster `services/task-lifecycle.ts` imports `sendTaskCompletionSignal`; completion-signal surface verification reads it.
- Outgoing static imports: local pipeline helpers, runtime diagnostics, task queue, task completion, and `../../tools/verify-task.ts`.
- Dynamic imports: none.
- Exports: `sendTaskCompletionSignal`.
- Side effects: ensures/writes Buster output file, runs verify-and-push, gets Redis client, publishes completion, and mutates caller-provided completion state.
- Globals/coupling: required `payload.output_file`, Git push/verify task side effect before completion, Redis singleton client, pre-test verdict shape, rate-limit max pause extraction, completion stream contract.

### `skills/buster/pipeline/services/task-lifecycle/git-sync.ts`
- Incoming callers/importers: Buster `services/task-lifecycle.ts` imports `syncTaskRepo`.
- Outgoing static imports: local Git workflow and telemetry modules.
- Dynamic imports: none.
- Exports: `syncTaskRepo`.
- Side effects: resolves repo root, runs Buster Git sync against an explicit task commit hash, emits `git_sync` plugin telemetry, and logs typed result metadata.
- Globals/coupling: payload `session.cwd`, process cwd fallback, required deterministic task commit hash, Git workflow policy, and Buster telemetry schema.

### `skills/buster/pipeline/services/task-lifecycle/session.ts`
- Incoming callers/importers: Buster `services/task-lifecycle.ts` imports spawn/monitor/kill/outcome helpers; telemetry/operator-surface verification reads it.
- Outgoing static imports: Buster/common lifecycle and session-termination facades; local ACP Gateway contract, Git workflow, telemetry, pipeline helpers, session monitor, runtime diagnostics.
- Dynamic imports: none.
- Exports: `spawnTaskSession`, `monitorTaskSession`, `killTaskSession`, `publishTaskOutcome`.
- Side effects: spawns ACP child sessions with explicit typed runtime/model/agent identity, writes active-session state through lifecycle facade, emits agent telemetry, sends Discord embeds via caller, mutates telemetry context identity, terminates sessions on monitor errors/timeouts, and clears active-session state.
- Globals/coupling: active-session evidence path, Buster prompt/session payload shape, required explicit session model, session termination contract, Discord embed helpers, and output-file based task outcome authority.

## Buster task lifecycle, queue, validation, telemetry, verdict schema, and a11y/api suites

### `skills/buster/pipeline/services/task-lifecycle.ts`
- Incoming callers/importers: `skills/buster/buster-pipeline.ts` imports/re-exports `getLastRunLogDir` and `processTask`; the entrypoint passes `processTask` to `processOneQueuedTask`.
- Outgoing static imports: Node `path.join`; local telemetry, suite-runner, logger, Discord, pipeline helpers, task validation, runtime diagnostics, task completion, and task-lifecycle cleanup/git-sync/completion-signal/session stages.
- Dynamic imports: none.
- Exports: `getLastRunLogDir`, `processTask`.
- Side effects: `processTask` updates last-run log state, writes JSONL logs, emits plugin telemetry, sends Discord embeds, runs sandbox cleanup, syncs Git, executes suites, spawns/monitors/kills ACP child sessions, writes/pushes output, emits Redis completion, and closes telemetry in `finally`.
- Globals/coupling: module-global `TASK_LIFECYCLE_STATE`; coupled to Buster task payload identity, `.swarm/logs/buster/<module>/attempt-<n>`, `payload.output_file`, Redis completion streams, suite verdicts, Gateway/ACP session lifecycle, Discord notification context, and task type to stage/worker inference.

### `skills/buster/pipeline/services/task-queue.ts`
- Incoming callers/importers: `skills/buster/buster-pipeline.ts` imports Redis queue constants/helpers; `task-lifecycle/completion-signal.ts` imports `getRedisClient`; verification reads the queue surface.
- Outgoing static imports: Node `os.hostname`; Buster telemetry facade, pipeline cleanup helper, Redis message contract shim, task transport contract shim, task validation, runtime diagnostics, and task completion.
- Dynamic imports: none.
- Exports: `AGENT_NAME`, `STREAM_KEY`, `GROUP_NAME`, `CONSUMER_NAME`, `POLL_INTERVAL`, `STREAM_MAX_LEN`, `PENDING_RECLAIM_IDLE_MS`, `getRedisClient`, `disconnectRedisClient`, `ensureTaskConsumerGroup`, `reclaimPendingTask`, `readNextTaskEntry`, `processOneQueuedTask`.
- Side effects: initializes environment-derived stream constants at module load; lazily creates a process-wide Redis singleton with event listeners; queue processing parses/validates task entries, writes malformed dead letters, invokes `processTask`, runs error cleanup, enforces terminal evidence before ACK, ACKs, and trims the stream.
- Globals/coupling: `AGENT_NAME`, `BUSTER_TASK_STREAM`, `BUSTER_PENDING_RECLAIM_IDLE_MS`, host-derived consumer name, Redis singleton, common Redis task transport contract, canonical task envelope validation, and terminal-before-ACK guarantee.

### `skills/buster/pipeline/services/task-transport-contract.ts`
- Incoming callers/importers: Buster `task-queue.ts`, `task-completion.ts`, and `tools/redis.ts`; Nova task tooling uses its own matching facade.
- Outgoing static imports: re-exports `../../../common/pipeline/services/task-transport-contract.ts`.
- Dynamic imports: none.
- Exports: all shared task transport contract exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: production-path compatibility shim; common pipeline owns Redis stream task transport/event-bus implementation.

### `skills/buster/pipeline/services/task-validation.ts`
- Incoming callers/importers: `task-lifecycle.ts` validates process payloads; `task-queue.ts` imports task type constants; `runtime-diagnostics.ts` imports `normalizeRequiredIdentity`; root Buster module re-exports validation helpers.
- Outgoing static imports: Node `path`; Buster capabilities, Git workflow repo-root helper, and security facade.
- Dynamic imports: none.
- Exports: `PIPELINE_TASK_TYPES`, `MalformedBusterTaskError`, `normalizeRequiredIdentity`, `validateBusterTaskPayload`.
- Side effects: none at module load; validation may resolve repo-scoped paths and throw typed malformed-task errors.
- Globals/coupling: valid task types are `module_test` and `gate_test`; required identity fields, forbidden `status_json_path`, capability vocabulary, repo-root path scope, and task-type-specific path fields.

### `skills/buster/pipeline/services/telemetry/payload-schema.ts`
- Incoming callers/importers: `services/telemetry.ts` imports telemetry payload validators/builders through this path.
- Outgoing static imports: re-exports `../../../../common/pipeline/services/telemetry/payload-schema.ts`.
- Dynamic imports: none.
- Exports: all shared telemetry payload schema exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: production-path facade; common pipeline owns telemetry event payload validation.

### `skills/buster/pipeline/services/telemetry.ts`
- Incoming callers/importers: `buster-pipeline.ts` re-exports core telemetry helpers; task lifecycle, suite runner, Discord service, rate-limit/session/cleanup/git-sync helpers, and visual-reg call telemetry functions.
- Outgoing static imports: Node `fs`, `path`; Buster telemetry root facade for Redis constants/client loading; noncritical reporting facade; redaction facade; telemetry payload-schema facade.
- Dynamic imports: none.
- Exports: `resolveTelemetryStreamKey`, `createTelemetryContext`, `emitEvent`, `emitPluginEvent`, `closeTelemetry`.
- Side effects: no module-load side effects beyond imports; functions create Redis clients, append fallback/pipeline JSONL artifacts, emit Redis stream events with sequence keys, report nonblocking incidents, and close Redis clients.
- Globals/coupling: canonical stream/key builders from shared telemetry facade, Redis stream maxlen/TTL, `process.stderr` fallback, Buster source/emitter names, project/run identity, pipeline log mirror paths, and telemetry payload validation/redaction.

### `skills/buster/pipeline/services/verdict-schema.ts`
- Incoming callers/importers: suite runner, pipeline helpers, and all Buster suites import verdict constants/factories; Buster subagent and Nova consume the JSON shapes through files/completion streams rather than importing this module.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: `STATUS`, `SEVERITY`, `RECOMMENDATION`, `createSuiteVerdict`, `createFinding`, `createRunnerVerdict`, `truncateForPrompt`.
- Side effects: freezes exported constant objects at module load.
- Globals/coupling: authoritative Buster suite verdict JSON shape, status/severity/recommendation vocabulary, prompt truncation file reference convention `/sandbox/results/<suite>-verdict.json`, and timestamped runner `run_id` generation.

### `skills/buster/pipeline/suites/a11y.ts`
- Incoming callers/importers: `runners/suite-runner.ts` imports the default suite and registers it as `a11y`.
- Outgoing static imports: Buster verdict schema.
- Dynamic imports: `playwright`, `@axe-core/playwright`.
- Exports: default async `a11ySuite(context)`.
- Side effects: logs to console and optional suite log sink; launches Chromium, navigates to the local app, runs axe, and closes browser best-effort.
- Globals/coupling: mutable module log sink, default ports/path/tags/finding cap/timeout, local app URL from serve config, axe impact vocabulary, and suite-runner context shape.

### `skills/buster/pipeline/suites/api.ts`
- Incoming callers/importers: `runners/suite-runner.ts` imports the default suite and registers it as `api`.
- Outgoing static imports: Node `fs`; Buster verdict schema; suite repo-path helpers.
- Dynamic imports: `ws` package for WebSocket tests, with global WebSocket fallback.
- Exports: default async `apiSuite(context)`.
- Side effects: logs to console and optional suite log sink; reads/parses JSON spec files, performs HTTP fetches, optional auth setup, optional WebSocket connections, and response assertions.
- Globals/coupling: mutable module log sink, repo-scoped spec resolution, local app base URL, JSON spec schema, native `fetch`/`AbortController`, optional `ws` package/global WebSocket, and suite-runner context config.

## Buster build, bundle, e2e, health, and Kubernetes suites

### `skills/buster/pipeline/suites/build.ts`
- Incoming callers/importers: `skills/buster/pipeline/runners/suite-runner.ts` imports the default suite and registers it as `build`.
- Outgoing static imports: Node `child_process.execFile`, `util.promisify`, `fs`, `path`, `buffer.Buffer`; Buster verdict schema; suite repo-path helpers; sandbox-cleanup labels/resource tracker; security subprocess env.
- Dynamic imports: `js-yaml` for deployment env extraction and secret YAML parsing, with regex fallbacks.
- Exports: default async `buildSuite(context)`.
- Side effects: logs to console/optional log sink; runs `sandbox-build`, `nginx`, `du`, and `podman`; starts static nginx or server container; optionally builds Dockerfile images; injects env vars from manifests/secrets; tracks Podman resources.
- Globals/coupling: mutable `_logSink`; defaults for serve type/image/build/start/port/project/timeout; coupled to `/sandbox/www`, `/run/nginx.pid`, `/sandbox` bind mount, `/src` container workdir, Podman/nginx/sandbox-build CLIs, Kubernetes manifest env shapes, REPO_DIR path scoping, and sandbox cleanup labels.

### `skills/buster/pipeline/suites/bundle.ts`
- Incoming callers/importers: `skills/buster/pipeline/runners/suite-runner.ts` imports the default suite and registers it as `bundle`.
- Outgoing static imports: Node `child_process.execFileSync`, `fs`, `path`; Buster verdict schema; security path/env helpers.
- Dynamic imports: none.
- Exports: default async `bundleSuite(context)`.
- Side effects: logs to console/optional log sink; reads `/sandbox/www`, runs `du -sk`, recursively stats files, and returns size/count findings.
- Globals/coupling: mutable `_logSink`; default `www_dir=/sandbox/www`; coupled to build suite output, allowed-path security policy, filesystem traversal, and bundle threshold config.

### `skills/buster/pipeline/suites/e2e.ts`
- Incoming callers/importers: `skills/buster/pipeline/runners/suite-runner.ts` imports the default suite and registers it as `e2e`.
- Outgoing static imports: Node `child_process.execFileSync`, `fs`, `path`; Buster verdict schema; suite repo-path helpers; security subprocess env.
- Dynamic imports: none.
- Exports: default async `e2eSuite(context)`.
- Side effects: logs to console/optional log sink; discovers Playwright tests under configured repo-scoped directories; runs `npx playwright test`; parses line reporter output into verdict findings.
- Globals/coupling: mutable `_logSink`; default test filename patterns, timeout, and finding cap; `BASE_URL`, `/ms-playwright`, and `CI=true` environment; dependency on tests written under `.swarm/modules/...`; repo/project path prefix handling.

### `skills/buster/pipeline/suites/health.ts`
- Incoming callers/importers: `skills/buster/pipeline/runners/suite-runner.ts` imports the default suite and registers it as `health`.
- Outgoing static imports: Node `fs`, `path`; Buster verdict schema; suite repo-path helpers; Buster timing facade; Buster capability checks.
- Dynamic imports: `playwright` for optional smoke navigation.
- Exports: default async `healthSuite(context)`.
- Side effects: logs to console/optional log sink; performs HTTP fetch retries with abort timeouts; optionally reads visual-reg smoke paths and launches browser smoke navigation.
- Globals/coupling: mutable `_logSink`; default static/server ports, health path, retry/backoff/timeout; native `fetch`/`AbortController`; `.swarm/modules/<module>/baselines/paths.json`; browser automation capability; Playwright runtime.

### `skills/buster/pipeline/suites/k8s.ts`
- Incoming callers/importers: `skills/buster/pipeline/runners/suite-runner.ts` imports the default suite and registers it as `k8s`; helper exports are used internally and may be imported by verification.
- Outgoing static imports: Node `child_process.execFile`, `util.promisify`, `fs`, `os`, `path`; Buster verdict schema, Git repo-root helper, sandbox cleanup labels/resource tracker, manifest YAML helpers, repo-path resolver, and security subprocess env.
- Dynamic imports: none.
- Exports: `validateK8sNamespacePrefix`, `renderManifestForK8sSuite`, default async `k8sSuite(context)`.
- Side effects: logs to console/optional log sink; runs `podman build/tag/push`, `kubectl create/label/get/apply/wait`, and `curl`; creates ephemeral namespaces; copies secrets; rewrites manifests; tracks images/namespaces for cleanup; writes temp rendered manifests.
- Globals/coupling: constants `REGISTRY_LOCAL=registry-local.kubeclaw.svc.cluster.local:5001`, `KUBECLAW_NS=kubeclaw`, safe namespace prefixes `buster|test`, default ports/timeouts; coupled to cluster-local registry, Kubernetes service DNS, manifest object shapes, cluster-scoped kind list, sandbox cleanup tracked-resource state, and real Kubernetes/Podman/Curl CLIs.

## Buster manifest, performance, security, unit, visual-reg suites and facades

### `skills/buster/pipeline/suites/manifest.ts`
- Incoming callers/importers: `runners/suite-runner.ts` imports the default suite as `manifest`; `suites/k8s.js` imports `loadYamlDocuments`/`dumpYamlDocuments` for manifest rendering.
- Outgoing static imports: Node `fs`, `path`, `module.createRequire`; Buster verdict schema; suite repo-path helper.
- Dynamic imports: none; `js-yaml` is loaded at runtime through `createRequire`.
- Exports: `loadJsYamlModule`, `loadYamlDocuments`, `dumpYamlDocuments`, default async `manifestSuite(context)`.
- Side effects: mutable suite log sink; reads deployment/secret YAML files; logs to console; parses YAML and builds verdict findings.
- Globals/coupling: hard repo path scoping through `repo-paths.ts`, Kubernetes Deployment/Secret object shapes, optional `context.config.manifest`, health path probe expectations, and `js-yaml` availability.

### `skills/buster/pipeline/suites/perf.ts`
- Incoming callers/importers: `runners/suite-runner.ts` imports the default suite as `perf`.
- Outgoing static imports: Node `child_process.execFileSync`, `fs`, `path`; Buster verdict schema; Buster security facade.
- Dynamic imports: none.
- Exports: `resolvePerfReportPaths`, default async `perfSuite(context)`.
- Side effects: runs `lighthouse`, creates report directories, writes/copies Lighthouse JSON reports, logs to console/optional log sink.
- Globals/coupling: `/sandbox/results/lighthouse-report.json`, optional `context.testsLogDir`, local app URL from serve config, Lighthouse CLI, subprocess environment guard, and perf threshold config.

### `skills/buster/pipeline/suites/repo-paths.ts`
- Incoming callers/importers: Buster suites `api`, `build`, `e2e`, `health`, `k8s`, `manifest`, `unit`, and `visual-reg` import repo-scope helpers.
- Outgoing static imports: Node `path`; Buster security facade `isPathInside`/`resolveScopedPath`.
- Dynamic imports: none.
- Exports: `isPathInside`, `REPO_DIR`, `resolveRepoDir`, `resolveRepoScopedPath`, `stripRepoDirPrefix`.
- Side effects: none.
- Globals/coupling: fixed repo root `/home/node/.openclaw/workspace/git-repo`; delegates path-boundary enforcement to shared security.

### `skills/buster/pipeline/suites/security.ts`
- Incoming callers/importers: `runners/suite-runner.ts` imports the default suite as `security`.
- Outgoing static imports: Buster verdict schema only.
- Dynamic imports: none.
- Exports: default async `securitySuite(context)`.
- Side effects: performs HTTP `fetch` requests with abort timers, inspects response headers/cookies/CORS, logs to console/optional log sink.
- Globals/coupling: native `fetch`/`AbortController`, local app URL from serve config, header/cookie policy defaults, and security threshold config.

### `skills/buster/pipeline/suites/unit.ts`
- Incoming callers/importers: `runners/suite-runner.ts` imports the default suite as `unit`.
- Outgoing static imports: Node `child_process.execFileSync`, `fs`, `path`; Buster verdict schema; suite repo-path helper; Buster security facade.
- Dynamic imports: none.
- Exports: default async `unitSuite(context)`.
- Side effects: reads `package.json`, tokenizes/runs test command, parses stdout/stderr, logs to console/optional log sink.
- Globals/coupling: repo-scoped project directory, `npm test` default, Jest/Vitest/Mocha/TAP/pytest text formats, subprocess environment guard, and unit threshold config.

### `skills/buster/pipeline/suites/visual-reg-discord.ts`
- Incoming callers/importers: `suites/visual-reg.ts` imports `discordSingle` and `discordSummary`.
- Outgoing static imports: Node `fs`; Buster verdict schema `STATUS`; Buster Discord delivery service.
- Dynamic imports: none.
- Exports: `discordSummary`, `discordSingle`.
- Side effects: reads screenshot/diff PNG files, builds multipart webhook payloads, sends raw Discord webhook requests, logs delivery results through caller logger.
- Globals/coupling: Discord multipart limits, Buster Discord transport/audit context, visual-reg page result shape, and attachment file existence.

### `skills/buster/pipeline/suites/visual-reg.ts`
- Incoming callers/importers: `runners/suite-runner.ts` imports `runVisualReg`; screenshot tooling comments reference visual-reg as a consumer, but no other runtime importer was found in pipeline source.
- Outgoing static imports: Node `fs`, `path`; Buster verdict schema; screenshot tools; Buster telemetry service; Buster runtime webhook helper; suite repo-path helper; visual-reg Discord helper; Buster capabilities.
- Dynamic imports: `pngjs` and `pixelmatch` inside image comparison.
- Exports: `summarizeDiscordDelivery`, `resolveVisualRegProjectDir`, `resolveVisualRegBaselineDir`, `runVisualReg`.
- Side effects: resolves webhook URL at module load; reads explicit `paths.json` metadata plus baseline/actual/diff image files; takes screenshots through tooling; emits plugin telemetry; may upload media to Discord.
- Globals/coupling: derived `.swarm/modules/<module>/baselines`, `/sandbox/results` fallback artifacts, `context.screenshotsDir/testsLogDir`, screenshot tool contracts, Pixelmatch/PNG APIs, Buster capability policy, and Discord webhook env.

### `skills/buster/pipeline/telemetry.ts`
- Incoming callers/importers: `services/telemetry.ts` imports Redis helpers from the facade; `task-queue.ts` and `tools/redis.ts` import `createRedisClient`/`loadRedisCtor`; production shared-surface docs/verification reference the facade.
- Outgoing static imports: re-exports `../../common/pipeline/telemetry.ts`.
- Dynamic imports: none.
- Exports: all shared telemetry helper exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: repo/dev compatibility facade for the production `/app/skills/pipeline` shared telemetry surface; common pipeline owns implementation.

### `skills/buster/pipeline/timing.ts`
- Incoming callers/importers: Buster `services/git-workflows.ts`, `services/rate-limit.ts`, `services/session-monitor.ts`, and `suites/health.js` import timing helpers.
- Outgoing static imports: re-exports `../../common/pipeline/timing.ts`.
- Dynamic imports: none.
- Exports: all shared timing helper exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: repo/dev compatibility facade for shared timing/budget helpers; common pipeline owns implementation.

## Buster CLI tools and common agent-observability contract island

### `skills/buster/pipeline/tools/redis.ts`
- Incoming callers/importers: Nova `services/adapter-registry.ts` imports the default redis tool; direct CLI invocation supports `--action send|read`; docs reference the production runtime path.
- Outgoing static imports: Node `url.fileURLToPath`, `fs`; Buster CLI args facade; Buster telemetry facade; Buster runtime webhook helper; Buster Discord webhook facade; Buster redaction facade; Buster Redis message contract facade; Buster task transport contract facade.
- Dynamic imports: none.
- Exports: default `lib` object with `client`, `publishTask`, `sendTask`, `readMyTasks`, and `disconnect`.
- Side effects: creates a lazy module-global Redis client and error listener; resolves Discord webhook URL at module load; direct execution parses CLI flags, publishes/reads tasks, prints JSON, disconnects Redis, and exits.
- Globals/coupling: `process.env.AGENT_NAME`, `REDIS_CONSUMER_NAME` / `AGENT_CONSUMER_NAME`, Redis task stream names, Redis readiness/status, Discord webhook env, canonical Redis task envelope/queue contract, and process argv/exit.

### `skills/buster/pipeline/tools/screenshot.ts`
- Incoming callers/importers: `suites/visual-reg.ts` imports `takeScreenshotBatch`; direct CLI supports single screenshot and `--generate-baselines`; Prism docs reference the runtime tool path for explicit reviewed baseline generation.
- Outgoing static imports: Node `fs`, `path`, `url.fileURLToPath`; Buster CLI args facade.
- Dynamic imports: `playwright` inside `launchBrowser`.
- Exports: `takeScreenshot`, `takeScreenshotBatch`, `generateBaselines`.
- Side effects: may set `process.env.PLAYWRIGHT_BROWSERS_PATH`; launches Chromium; reads HTML previews; writes screenshots and `paths.json`; logs to stdout; direct CLI parses positionals/flags, prints JSON, and exits.
- Globals/coupling: Playwright browser installation paths, Chromium sandbox args, Prism preview `data-routes`/`?baselines=true` contract, output directory file-name guard, process argv/env/exit.

### `skills/buster/pipeline/tools/verify-task.ts`
- Incoming callers/importers: `services/task-lifecycle/completion-signal.ts` imports default `verifyAndPush`; direct CLI supports `--role`, `--project`, and `--message`.
- Outgoing static imports: Node `process`, `fs`, `path`, `url.fileURLToPath`; Buster CLI args facade; Buster Git workflow service.
- Dynamic imports: none.
- Exports: `validateProjectSlug`, `normalizeGitPath`, `isGitPathInside`, `buildSwarmScope`, default `verifyAndPush`.
- Side effects: reads Git status, selectively reverts/deletes out-of-scope files, commits/pushes scoped `.swarm` changes through `gitPushWithRetry`, logs result JSON in CLI mode, and exits.
- Globals/coupling: fixed project scope `Projects/<project>/src/.swarm`, Git porcelain format, current branch/remote push behavior, CLI/env role/project inputs, process argv/env/exit.

### `skills/buster/pipeline/tools/visual-audit.ts`
- Incoming callers/importers: no runtime source importer found; direct CLI captures image/video media and uploads to Discord.
- Outgoing static imports: Node `fs`, `path`, `url.fileURLToPath`; Buster CLI args facade; `playwright` chromium; Buster capabilities service.
- Dynamic imports: none.
- Exports: default `visualAudit`.
- Side effects: checks capabilities, creates/removes temporary audit media directories, launches Chromium, captures screenshot/video, builds `FormData` upload, posts to Discord API, logs to stderr, and exits in CLI mode.
- Globals/coupling: `BUSTER_CAPABILITIES`, `BUSTER_CAPABILITIES` env parsing, `DISCORD_CHANNEL`, `DISCORD_TOKEN`, global `fetch`/`FormData`/`Blob`, Discord 25 MB limit, `/tmp` default output root, process argv/env/exit.

### `skills/common/pipeline/agent-observability/src/constants.ts`
- Incoming callers/importers: common agent-observability `index.ts`, `routing.ts`, `masking.ts`, `types.ts`, and `validation.ts`; role facades re-export via common index; Nova ingester/evidence code imports through role/common index.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: schema/source constants, Redis stream keys, Redis data field, masking profile/marker, event byte limits/reason, ingress event type tuple, diagnostics tuple, and hook tuple.
- Side effects: none beyond `Object.freeze` constant initialization.
- Globals/coupling: canonical agent-observability schema version, stream naming, size limits, hook/event vocabulary, and masking profile.

### `skills/common/pipeline/agent-observability/src/index.ts`
- Incoming callers/importers: Buster and Nova role-local agent-observability facades; Nova agent-observability ingester/evidence modules; contract/docs reference this as the shared contract surface.
- Outgoing static imports: re-exports `constants.ts`, `types.ts`, `validation.ts`, `masking.ts`, `routing.ts`, and `mapping.ts`.
- Dynamic imports: none.
- Exports: all common agent-observability contract, validation, masking, routing, and mapping exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: central TypeScript source surface for agent-observability read-side contract.

### `skills/common/pipeline/agent-observability/src/mapping.ts`
- Incoming callers/importers: common `index.ts`; Nova ingester mapper imports through the index; docs reference mapping table.
- Outgoing static imports: type-only `AgentObservabilityTelemetryMappingV1` from `types.ts`.
- Dynamic imports: none.
- Exports: `AGENT_OBSERVABILITY_TELEMETRY_MAPPINGS`, `getAgentObservabilityTelemetryMapping`.
- Side effects: none beyond frozen mapping table initialization.
- Globals/coupling: ingress event names, OpenClaw hook names, current/future telemetry type vocabulary, and promotion policy.

### `skills/common/pipeline/agent-observability/src/masking.ts`
- Incoming callers/importers: common `index.ts`; validation/plugin/ingester consumers import through the index.
- Outgoing static imports: masking constants; type-only JSON/masking types.
- Dynamic imports: none.
- Exports: `createFullContentMinimalMasking`, `applyMinimalApiKeyMask`.
- Side effects: none.
- Globals/coupling: minimal API-key/token/secret/authorization regex and masking marker vocabulary.

### `skills/common/pipeline/agent-observability/src/routing.ts`
- Incoming callers/importers: common `index.ts`; Nova ingester/consumer imports through the index; docs reference stream routing and size fuse behavior.
- Outgoing static imports: stream/size constants; type-only ingress event and routing types.
- Dynamic imports: none.
- Exports: `selectAgentObservabilityStreamKind`, `selectAgentObservabilityStreamKey`, `normalizeAgentObservabilityMaxEventBytes`, `measureAgentObservabilityEventBytes`, `checkAgentObservabilityPayloadSize`.
- Side effects: none beyond frozen payload-stream event set initialization.
- Globals/coupling: control/payload stream split, TextEncoder byte measurement, default/absolute max event byte limits, and oversize reason shape.

### `skills/common/pipeline/agent-observability/src/types.ts`
- Incoming callers/importers: common `index.ts`, `mapping.ts`, `masking.ts`, `routing.ts`, `validation.ts`; Nova ingester/evidence imports through index.
- Outgoing static imports: type-only constants for event/hook/masking tuple-derived types.
- Dynamic imports: none.
- Exports: all agent-observability TypeScript types/interfaces for ingress events, identity, payload variants, masking, telemetry mappings, payload-size checks, and validation results.
- Side effects: none.
- Globals/coupling: canonical event payload schema and identity vocabulary for agent observability.

## Common agent-observability validation, agent lifecycle, CLI/Git primitives, and Discord transport

### `skills/common/pipeline/agent-observability/src/validation.ts`
- Incoming callers/importers: common agent-observability `index.ts` re-exports it; Nova ingester consumer imports `assertAgentObservabilityIngressEvent` through the Nova/common index; evidence/mapper code imports contract types through the same island.
- Outgoing static imports: local `constants.ts`; type-only local `types.ts`.
- Dynamic imports: none.
- Exports: `AgentObservabilityContractError`, `validateAgentObservabilityIngressEvent`, `assertAgentObservabilityIngressEvent`, `isAgentObservabilityIngressEvent`, `expectedHookForIngressType`, `knownAgentObservabilityHooks`.
- Side effects: initializes frozen ingress-type-to-hook map and allowed identity fields.
- Globals/coupling: coupled to schema version/source/masking constants, allowed identity-field vocabulary, event payload shapes, JSON-safe content rules, and hook naming.

### `skills/common/pipeline/agents/acp-monitor.ts`
- Incoming callers/importers: Buster and Nova role facades re-export it; Buster session monitor and rate-limit service call monitor state/adapter helpers; Nova polling, polling-session-end, failure semantics, polling observability, acp-observability, forge/review/module runners import through the Nova facade; Buster root re-exports monitor helpers.
- Outgoing static imports: Node `fs`; common Gateway integration; session semantics; tracked-agents; timing; pipeline-event contract; ACP Gateway contract validators.
- Dynamic imports: none.
- Exports: `publishTranscriptDelta`, `getAcpMonitorConfig`, `classifyTranscriptText`, `readAcpTranscriptState`, `transcriptShowsProgress`, `getAcpMonitorState`, `createAcpMonitorEventAdapter`, `monitorStateFromAcpEvent`, `isSessionTerminal`, `waitForSessionIdle`, plus re-exported session semantic helpers/constants.
- Side effects: initializes process-local transcript rate-limit map and constants; runtime calls read transcript files, poll Gateway session status, emit pipeline events, and log monitor messages.
- Globals/coupling: coupled to ACP Gateway status/result shapes, transcript JSONL format, event-bus event names, monitor threshold config, process-local tracked-agent registry, Gateway URL/token resolution, and rate-limit/error text classification.

### `skills/common/pipeline/agents/lifecycle.ts`
- Incoming callers/importers: Buster and Nova role facades re-export it; Buster task-lifecycle session stage imports spawn/session helpers; Nova case-study/summary services, polling, polling-session-end, gate/module runners, and git-worktree imports use lifecycle/tracked-agent helpers through the Nova facade; Buster root re-exports lifecycle helpers.
- Outgoing static imports: Node `child_process.execFileSync`, `fs`, `os`, `path`; common security, Gateway integration, session semantics, runtime, timing, ACP Gateway contract validators; re-exports tracked-agent helpers.
- Dynamic imports: none.
- Exports: tracked-agent helper re-exports, `getActiveSession`, `clearActiveSession`, `resolveSubagentTranscriptPath`, `resolveSpawnTranscriptPath`, `acpxCleanup`, `spawnSession`, `killSession`, `killActiveSession`.
- Side effects: maintains process-local `_activeSession`; may write/remove active-session JSON; may spawn/kill Gateway sessions, send `/stop`, list subagents, run `acpx sessions close`, read OpenClaw session metadata, and log lifecycle messages.
- Globals/coupling: coupled to OpenClaw gateway tools, `~/.openclaw/agents/<agent>/sessions`, active-session evidence file shape, model/runtime heuristics, subprocess env policy, and session lifecycle contract validators.

### `skills/common/pipeline/agents/runtime.ts`
- Incoming callers/importers: Buster and Nova role facades re-export it; common lifecycle imports runtime resolution; Nova summary/case-study/module-runner code imports model/harness helpers through the Nova facade.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: `modelToHarness`, `isSubagentModel`, `resolveRuntime`.
- Side effects: none.
- Globals/coupling: coupled to model-id substring/prefix conventions for Claude, Codex/OpenAI, Gemini, OpenCode, Kimi, and subagent-vs-ACP runtime selection.

### `skills/common/pipeline/agents/session-semantics.ts`
- Incoming callers/importers: Buster and Nova role facades re-export it; common ACP monitor and lifecycle import state parsing; Nova failure semantics imports stopped-state helper through ACP monitor re-export.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: `ACP_MONITOR_REASONS`, `parseSessionState`, `isSessionTerminalState`, `isStoppedSessionState`, `isUnreachableSessionState`.
- Side effects: initializes frozen reason constants.
- Globals/coupling: coupled to Gateway `acp.state`, `state`, `status`, `statusText`/raw text formats, queue/task status strings, and terminal/stopped/unreachable regex vocabularies.

### `skills/common/pipeline/agents/session-termination.ts`
- Incoming callers/importers: Buster and Nova role facades re-export it; Buster entrypoint shutdown, Buster session monitor, Buster task-lifecycle session stage, Nova case-study/summary services, and Nova pipeline-runner recovery call termination through role facades; Buster root re-exports termination helpers.
- Outgoing static imports: common lifecycle active-session/kill helpers; ACP Gateway contract validator.
- Dynamic imports: none.
- Exports: `DEFAULT_TERMINATION_GRACE_MS`, `MAX_TERMINATION_GRACE_MS`, `terminateSession`, `terminateActiveSession`.
- Side effects: races kill operations against timers, invokes optional cleanup callbacks, clears process-local active session state, and may preserve active-session evidence when termination is unconfirmed.
- Globals/coupling: coupled to lifecycle kill-result shape, termination result contract, grace/poll defaults, and active-session state ownership.

### `skills/common/pipeline/agents/tracked-agents.ts`
- Incoming callers/importers: Buster and Nova role facades re-export it; common ACP monitor reads tracked entries; common lifecycle re-exports helpers; Nova polling/gate/module services use tracked-agent lookups through lifecycle/facade imports.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: `trackAgent`, `untrackAgent`, `getTrackedAgent`, `getTrackedAgentCount`, `listTrackedAgents`.
- Side effects: maintains process-local `_trackedAgents` map.
- Globals/coupling: coupled to label-keyed session metadata, project/session/gateway/stream-log identity, and process-local lifecycle diagnostics.

### `skills/common/pipeline/cli-args.ts`
- Incoming callers/importers: Buster and Nova role facades re-export it; Buster Redis/screenshot/verify-task/visual-audit tools and Nova CLI/Redis/lint-report/project-summary tools import through facades.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: `parseCliArgs`, `parseCliFlagValues`.
- Side effects: none.
- Globals/coupling: coupled to repo-local CLI schema objects, strict `--flag`/`--flag=value` parsing, boolean/value flag behavior, required flags, and positional min/max validation.

### `skills/common/pipeline/git-primitives.ts`
- Incoming callers/importers: Buster and Nova role facades re-export it; Buster git-workflows imports repo-root/Git helpers; Nova git-context imports repo-root/head helpers through facade.
- Outgoing static imports: Node `child_process.execFileSync`, `path`; common security `buildSubprocessEnv`.
- Dynamic imports: none.
- Exports: `getRepoRoot`, `gitExec`, `getCurrentBranch`, `setRepoRoot`, `headHash`, `invalidateHeadHash`.
- Side effects: maintains repo-root and HEAD-hash caches plus mutable default repo root; executes Git subprocesses when called; unavailable HEAD metadata returns typed `null`.
- Globals/coupling: coupled to Git CLI availability, current working directory default, origin remote branch fallback, secure subprocess env, default timeouts/buffers, and external adapter config aliases `repo_root`/`repoRoot`/`repo`.

### `skills/common/pipeline/integrations/discord-webhook.ts`
- Incoming callers/importers: Buster and Nova role facades re-export it; Buster Discord service and Redis tool call `postDiscordWebhook`; Nova role facade exists for shared surface.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: `DiscordWebhookDeliveryError`, `postDiscordWebhook`.
- Side effects: performs HTTP POST through injected/global `fetch` when called and may create `AbortSignal.timeout` signals.
- Globals/coupling: coupled to global `fetch`, `AbortSignal.timeout`, Discord webhook HTTP semantics, canonical caller-supplied `body`, default 10s timeout, and 500-character error body previews.

## Common Gateway, lifecycle state, reporting, redaction, Redis/security, and shared contracts

### `skills/common/pipeline/integrations/gateway.ts`
- Incoming callers/importers: Buster and Nova `pipeline/integrations/gateway.ts` facades re-export it; common ACP monitor and lifecycle import Gateway helpers directly; Buster gateway-health/session-monitor and Nova shutdown/orchestration/arch-validator/polling/failure-presentation import through role facades.
- Outgoing static imports: common timing `BudgetExhaustedError`/`sleep`; common ACP Gateway contract validators and HTTP-error builder.
- Dynamic imports: none.
- Exports: Gateway URL/token resolvers, `gatewayInvoke`, session status/spawn/send/kill/list/complete wrappers, and `checkGatewayHealth`.
- Side effects: none at module load; runtime functions read Gateway env vars, call global `fetch`, create abort timers/controllers, retry network errors, and validate/normalize Gateway responses.
- Globals/coupling: coupled to `OPENCLAW_GATEWAY_URL`/`GATEWAY_URL`, `OPENCLAW_GATEWAY_TOKEN`/`GATEWAY_TOKEN`, default localhost Gateway port `18789`, Gateway `/tools/invoke` and `/health` endpoints, global `fetch`/`AbortController`, and timing budget semantics.

### `skills/common/pipeline/lifecycle-state.ts`
- Incoming callers/importers: Buster and Nova lifecycle-state facades re-export it; Nova module/gate/pipeline runners, polling, rate-limit, git-worktree, shutdown, project-summary, and recovery code import through the Nova facade.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: module status transition/normalization/phase/terminal/block/retry/active-agent/intent helpers returning explicit `{ status, lifecycleMutation }` transition data.
- Side effects: mutates caller-provided status objects; no hidden Symbol metadata and no module-load side effects beyond constants.
- Globals/coupling: coupled to Nova module status vocabulary, forge/buster phase names, lifecycle event type names, history record shape, completion/active-agent fields, and status-store appenders that receive explicit lifecycle mutations.

### `skills/common/pipeline/noncritical-reporting.ts`
- Incoming callers/importers: Buster and Nova noncritical-reporting facades re-export it; Buster logger/telemetry/runtime-diagnostics/Discord and Nova Redis log/observability/telemetry/system warning/failure/Discord/durable-alert services import through facades; common redaction imports it directly.
- Outgoing static imports: Node `crypto`.
- Dynamic imports: none.
- Exports: nonblocking detail sanitizer, incident-key builder, error-detail normalizer, and classified nonblocking reporter.
- Side effects: initializes a process-local de-dupe `Set`; reporting writes to caller log/fallback or `process.stderr`.
- Globals/coupling: coupled to secret regexes, SHA-256 fingerprints, process-local incident suppression, logger callback shape, and stderr fallback.

### `skills/common/pipeline/redaction.ts`
- Incoming callers/importers: Buster and Nova redaction facades re-export it; Buster telemetry/capabilities/Discord/Redis tool and many Nova runtime, polling, summary, status-store, contract, Discord, alert, gate, arch-validator, and tool modules import through facades; Nova Redis tool dynamically imports the facade.
- Outgoing static imports: Node `crypto`, `fs`; common noncritical reporting helpers.
- Dynamic imports: none.
- Exports: hash/secret redaction helpers, transcript evidence summarizers, structured/JSON/markdown/telemetry/Discord sanitizers, payload summaries, redacted prompt artifact writer, and redacted transcript artifact copier.
- Side effects: artifact functions synchronously write redacted prompt/transcript files; transcript summary parse failures report a nonblocking incident; no module-load side effects beyond constants.
- Globals/coupling: coupled to shared secret/content-key regexes, safe identity key allowlist, transcript JSONL line shape, Discord embed/file policy, artifact Markdown/JSONL shapes, and filesystem writes.

### `skills/common/pipeline/redis-transport.ts`
- Incoming callers/importers: Buster and Nova redis-transport facades re-export it; Nova agent-observability ingester imports Redis construction helpers through the Nova facade; Buster/Nova telemetry and tools use the shared telemetry facade/client path that depends on this policy.
- Outgoing static imports: Node `module.createRequire`.
- Dynamic imports: none; `loadRedisCtor` uses CommonJS `require('ioredis')` through `createRequire`.
- Exports: Redis defaults/error codes, `RedisTransportPolicyError`, `MissingDependencyError`, `loadRedisCtor`, Redis transport/client option resolvers, and client factory.
- Side effects: none until called; runtime calls may load `ioredis` and validate env/options.
- Globals/coupling: coupled to Redis env vars, default cluster host/port, secure Redis policy, localhost-only insecure verification, ioredis constructor shape, and TLS/password/network-isolation transport options.

### `skills/common/pipeline/security.ts`
- Incoming callers/importers: Buster and Nova security facades re-export it; common lifecycle/git-primitives import it directly; Buster base-image/sandbox/task-validation/suites/helpers and Nova shutdown/orchestration/git-worktree/blueprint/lint/project-summary/lint-report modules import through facades.
- Outgoing static imports: Node `path`.
- Dynamic imports: none.
- Exports: denied-env predicate, subprocess env builder, path-inside/scoped/allowed-prefix validators, and safe command string tokenizer.
- Side effects: none.
- Globals/coupling: coupled to allowed path prefixes, subprocess env allowlist/denylist, process env, repo/sandbox path boundaries, and direct-executable command policy.

### `skills/common/pipeline/services/acp-gateway-contract.ts`
- Incoming callers/importers: Buster and Nova ACP Gateway contract facades re-export it; common Gateway integration, ACP monitor, lifecycle, and session termination import validators directly; Buster/Nova session-monitor/summary-session-cleanup paths import through role facades.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: ACP transcript/monitor/session event validators/assertions, session lifecycle/kill/termination result validators, Gateway invoke result/error validators, result normalizer, and HTTP-error builder.
- Side effects: none.
- Globals/coupling: coupled to exact ACP monitor/transcript/session lifecycle record shapes, termination invariants, Gateway invoke raw-result shape, and TypeError validation failure semantics.

### `skills/common/pipeline/services/pipeline-event-contract.ts`
- Incoming callers/importers: Buster and Nova pipeline-event-contract facades re-export it; Buster session monitor and Nova approval adapter, polling-dual, polling-session-end, buster-completion-controller, and completion-event adapters import through facades.
- Outgoing static imports: Node `events.EventEmitter`; common timing `BudgetExhaustedError`; common ACP Gateway contract payload validators.
- Dynamic imports: none.
- Exports: schema/type/source/identity constants, event contract/wait errors, approval payload validator, event identity/event normalizers and validators, event wait/emit helpers, event bus factory, and adapter assertion.
- Side effects: `createPipelineEventBus` creates an in-process `EventEmitter`; waits install/remove listeners and timers; no module-load side effects beyond constants.
- Globals/coupling: coupled to in-process event channel `pipeline:event`, v1 event schema, ACP and approval payload validators, abort-signal/budget wait semantics, and normalized identity fields.

### `skills/common/pipeline/services/rate-limit-contract.ts`
- Incoming callers/importers: Buster and Nova rate-limit-contract facades re-export it; Buster rate-limit service and Nova rate-limit/rate-limit-builders/discord-fields/failure presentation import through role facades.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: Discord field specs/surfaces/field sets, Discord identity field builders, rate-limit detected payload builder, rate-limit embed formatter, and recovery-action resolver.
- Side effects: none beyond frozen constant initialization.
- Globals/coupling: coupled to Discord embed field limits, run/module/gate/session identity vocabulary, Anthropic default provider label, rate-limit pause metadata fields, and resume-vs-kill recovery policy.


## Common Redis/task/telemetry contracts and Nova module-worker adapters

### `skills/common/pipeline/services/redis-message-contract.ts`
- Incoming callers/importers: Buster and Nova `services/redis-message-contract.ts` facades re-export it; Buster task queue/completion/Redis tool and Nova Redis completion/completion-event adapters/buster-completion-controller import through role facades.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: Redis schema/source/status/outcome constants; target inference, task entry builder, envelope normalizer, task/completion validators, boolean validators, assertion helpers, and `RedisPipelineMessageInvalidError`.
- Side effects: none beyond frozen constant initialization; assertion helpers throw typed validation errors when called.
- Globals/coupling: coupled to Redis stream-id syntax, canonical v1 envelope fields, module/gate/pipeline target vocabulary, Buster/Nova completion source names, strong identity fields `run_id`/`attempt`/`dispatch_id`, JSON payload/verdict string fields, and camelCase/snake_case envelope aliases.

### `skills/common/pipeline/services/task-transport-contract.ts`
- Incoming callers/importers: Buster and Nova `services/task-transport-contract.ts` facades re-export it; Buster task queue/completion/Redis tool and Nova Redis tool/completion-event adapters import through role facades.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: `PipelineTransportContractError`, adapter assertion helpers, `flattenTransportFields`, `decodeRedisStreamEntry`, `createRedisEventBus`, `createRedisTaskQueue`.
- Side effects: none at module load; created Redis adapters call `xadd`, `xgroup`, `XAUTOCLAIM`, `xreadgroup`, `xack`, and `xtrim` when used.
- Globals/coupling: coupled to ioredis command method names, Redis stream/group entry tuple shape, consumer-group semantics, default poll/reclaim/maxlen timings, and object-or-array field transport encoding.

### `skills/common/pipeline/services/telemetry/payload-schema.ts`
- Incoming callers/importers: Buster and Nova `services/telemetry/payload-schema.ts` facades re-export it; Buster telemetry and Nova telemetry/observability import through role facades.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: `TelemetryPayloadInvalidError`, `TELEMETRY_PAYLOAD_SCHEMAS`, `TELEMETRY_PAYLOAD_EVENT_TYPES`, `validateTelemetryEventPayload`, `assertTelemetryEventPayload`, `buildPluginTelemetryPayload`.
- Side effects: none beyond schema/constant construction; assertions throw typed validation errors when called.
- Globals/coupling: coupled to the full pipeline telemetry event vocabulary, strict allowed-field validation, JSON-safe payload rules, plugin top-level field projection, `source`/`emitter` common fields, and event-specific identity/status fields.

### `skills/common/pipeline/telemetry.ts`
- Incoming callers/importers: Buster and Nova `pipeline/telemetry.ts` facades re-export it; Buster telemetry/task queue/Redis tool and many Nova telemetry, polling, summary, rate-limit, artifact, completion, and Redis tool modules import through role facades.
- Outgoing static imports: re-exports Redis transport helpers from `./redis-transport.ts`.
- Dynamic imports: none.
- Exports: Redis transport helper re-exports plus telemetry stream/sequence constants and `getTelemetryStreamKey`, `getTelemetrySeqKey`.
- Side effects: none.
- Globals/coupling: coupled to shared Redis telemetry key names, seven-day sequence TTL, stream max length, and `unknown` fallback key segments for missing project/run identity.

### `skills/common/pipeline/timing.ts`
- Incoming callers/importers: Buster and Nova `pipeline/timing.js` facades re-export it; common Gateway and pipeline-event contracts import it directly; Buster rate-limit/session/git/health and Nova polling/rate-limit/Gateway/wait flows import through role facades.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: `BudgetExhaustedError`, `isBudgetExhaustedError`, `createBudget`, `createBudgetFromMinutes`, `sleep`.
- Side effects: none; created budgets allocate `AbortController` instances and register/remove abort listeners during sleeps.
- Globals/coupling: coupled to `Date.now`, `setTimeout`/`clearTimeout`, `AbortController`/abort signals, timeout/deadline field aliases, rate-limit budget-extension authorization, and `BUDGET_EXHAUSTED` error semantics.

### `skills/nova/pipeline/agent-observability/src/index.ts`
- Incoming callers/importers: no direct Nova runtime importer found in pipeline source; Nova agent-observability services import the common/role contract island elsewhere and verification/docs reference the role facade.
- Outgoing static imports: re-exports `../../../../common/pipeline/agent-observability/src/index.ts`.
- Dynamic imports: none.
- Exports: all shared agent-observability TypeScript contract exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: TypeScript source imports another `.ts` file directly; Nova path is a role-local facade over common ownership.

### `skills/nova/pipeline/agents/acp-monitor.ts`
- Incoming callers/importers: Nova polling, polling observability/session-end, ACP observability, failure semantics, review/buster gate runners, and module Forge runner import ACP monitor helpers through this facade.
- Outgoing static imports: re-exports `../../../common/pipeline/agents/acp-monitor.ts`.
- Dynamic imports: none.
- Exports: all shared ACP monitor exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: compatibility shim for the production `/app/skills/pipeline` surface; common ACP monitor owns implementation.

### `skills/nova/pipeline/agents/lifecycle.ts`
- Incoming callers/importers: Nova summary, case study, polling, polling session-end, git-worktree, buster-gate runner, and review-gate runner import lifecycle/tracked-agent helpers through this facade.
- Outgoing static imports: re-exports `../../../common/pipeline/agents/lifecycle.ts`.
- Dynamic imports: none.
- Exports: all shared lifecycle exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: compatibility shim for the production `/app/skills/pipeline` surface; common lifecycle owns active-session/tracked-agent state and Gateway session operations.

### `skills/nova/pipeline/agents/module-worker-control-results.ts`
- Incoming callers/importers: `skills/nova/pipeline/agents/orchestration.ts` imports and re-exports module worker control-result builders/guards/coercers; `module-workers.js` imports Forge/Buster builders.
- Outgoing static imports: Nova `../core/constants.ts`, worker-control-result contract helpers, and `../services/failures/classification.js`.
- Dynamic imports: none.
- Exports: `buildModuleForgeWorkerControlResult`, `isModuleForgeWorkerControlResult`, `coerceModuleForgeWorkerControlResult`, `buildModuleBusterWorkerControlResult`, `isModuleBusterWorkerControlResult`, `coerceModuleBusterWorkerControlResult`.
- Side effects: none.
- Globals/coupling: coupled to typed worker-control-result producer types, Nova status constants, pre-test failure classifier, Redis completion entry shape, worker input `ids`/`refs`/execution context, status-store final status shape, and Buster completion source naming.

### `skills/nova/pipeline/agents/module-workers.ts`
- Incoming callers/importers: `skills/nova/pipeline/agents/orchestration.ts` imports and re-exports `runModuleForgeWorker` and `runModuleBusterWorker`.
- Outgoing static imports: Nova status constants; polling/completion archival services; status-store load/save; session-authority; orchestration healthcheck; module worker control-result builders; lifecycle facade; orchestration spawn/kill.
- Dynamic imports: none.
- Exports: `runModuleForgeWorker`, `runModuleBusterWorker`.
- Side effects: none at module load; worker functions spawn/poll/kill agents, archive Redis completions, load/save module status/stream logs, invoke lifecycle callbacks, and clear shutdown context.
- Globals/coupling: coupled to Nova module Forge/Buster worker input shape, ACP labels, tracked-agent records, status-store active-agent evidence, Redis dispatch identity, rate-limit-aware polling results, and injected dependency seams used by callers/tests.


## Nova orchestration healthcheck, lifecycle, shutdown, and facades

### `skills/nova/pipeline/agents/orchestration-healthcheck.ts`
- Incoming callers/importers: `agents/orchestration.ts` imports/re-exports `verifyAgentAlive`; `agents/module-workers.js` imports it for Forge/Buster worker spawn health checks.
- Outgoing static imports: Nova logger, telemetry, Gateway facade, ACP monitor facade, lifecycle facade, and timing facade.
- Dynamic imports: none.
- Exports: `healthCheckIdentity`, `verifyAgentAlive`.
- Side effects: waits before probing; calls Gateway session status; mutates tracked-agent transcript/health-check fields; emits observability degraded/restored telemetry; logs health outcomes.
- Globals/coupling: coupled to `config.agents`, tracked-agent entries, Gateway status shape, transcript fallback state, telemetry identity fields, and process-local active logger context.

### `skills/nova/pipeline/agents/orchestration-lifecycle-events.ts`
- Incoming callers/importers: `agents/orchestration.ts` and `agents/reviewer-lifecycle.js` import spawn/kill telemetry payload builders.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: `telemetryModuleId`, `buildSpawnTelemetryPayload`, `buildKillTelemetryPayload`.
- Side effects: none.
- Globals/coupling: Nova lifecycle telemetry payload field names, module/gate/dispatch/session identity, timeout-minute derivation, and optional changed-file evidence.

### `skills/nova/pipeline/agents/orchestration.ts`
- Incoming callers/importers: Nova buster-gate runner, review-gate runner, module-runner attempt, module-runner shared code, and `agents/module-workers.js` import orchestration helpers; it re-exports module worker and reviewer helpers.
- Outgoing static imports: Node `child_process.execFileSync`, `path`; Nova constants, paths, logger, telemetry, Discord fields/service, adapter registry, Gateway facade, security facade, shutdown, ACP monitor, runtime/lifecycle/session-termination facades, module-worker helpers, healthcheck, lifecycle-event builders, reviewer lifecycle, and module workers.
- Dynamic imports: none.
- Exports: worker compatibility-result projections; module worker control-result helpers; `verifyAgentAlive`; `runModuleBusterWorker`; `runModuleForgeWorker`; `killReviewerAgent`; `spawnReviewerAgent`; `acpLabel`; `spawnAcpAgent`; `killAcpAgent`; `buildBusterPayload`; `dispatchRedisTask`; `spawnAgent`; `killAgent`; `steerAgent`.
- Side effects: maintains process-local Redis adapter cache; runs Git subprocesses for baseline/change detection; spawns/tracks/kills/steers ACP/subagent sessions; sends Redis tasks; emits lifecycle telemetry and Discord notices; may call process reaper after kills.
- Globals/coupling: coupled to Nova config agent dispatch modes, model/runtime heuristics, Gateway labels/session keys, tracked-agent registry, Redis adapter registry, Buster Redis payload contract, `.swarm` path refs, Git working tree state, Discord identity surfaces, and process cwd fallback.

### `skills/nova/pipeline/agents/reviewer-lifecycle.ts`
- Incoming callers/importers: `agents/orchestration.ts` imports/re-exports reviewer spawn/kill helpers; review-gate runner imports them through orchestration.
- Outgoing static imports: Nova config model resolver, logger, telemetry, Discord fields/service, shutdown, ACP monitor, runtime/lifecycle/session-termination facades, and lifecycle-event builders.
- Dynamic imports: none.
- Exports: `spawnReviewerAgent`, `killReviewerAgent`.
- Side effects: spawns/tracks/kills reviewer sessions; waits for idle on graceful kill; emits lifecycle telemetry; sends Discord notices; invokes process reaper after termination.
- Globals/coupling: coupled to echo reviewer config, reviewer label/gate identity, model/runtime resolution, tracked-agent registry, Gateway labels/session keys, Discord identity fields, and active logger context.

### `skills/nova/pipeline/agents/runtime.ts`
- Incoming callers/importers: Nova orchestration, reviewer lifecycle, summary, case-study, and module-runner attempt import runtime/model helpers through this facade.
- Outgoing static imports: re-exports `../../../common/pipeline/agents/runtime.ts`.
- Dynamic imports: none.
- Exports: all common runtime helper exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: compatibility shim for Nova-local imports; common pipeline owns runtime/model classification.

### `skills/nova/pipeline/agents/session-semantics.ts`
- Incoming callers/importers: no direct Nova-local caller found in this slice; common ACP monitor/lifecycle use the canonical common module directly.
- Outgoing static imports: re-exports `../../../common/pipeline/agents/session-semantics.ts`.
- Dynamic imports: none.
- Exports: all common session semantic exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: compatibility shim for Nova-local imports; common pipeline owns session-state parsing.

### `skills/nova/pipeline/agents/session-termination.ts`
- Incoming callers/importers: Nova shutdown, orchestration, reviewer lifecycle, summary, case-study, pipeline-runner recovery, plus Buster session paths through their own facades, import termination helpers.
- Outgoing static imports: re-exports `../../../common/pipeline/agents/session-termination.ts`.
- Dynamic imports: none.
- Exports: all common session termination exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: compatibility shim for Nova-local imports; common pipeline owns bounded termination behavior.

### `skills/nova/pipeline/agents/shutdown.ts`
- Incoming callers/importers: `agents/orchestration.ts` and `agents/reviewer-lifecycle.js` import `reaperAfterKill`; module-runner attempt imports shutdown-context helpers; pipeline-runner recovery imports `reaperAfterKill`.
- Outgoing static imports: Node `fs`, `child_process.execFileSync`; Nova status store, logger, Gateway facade, telemetry, lifecycle-state facade, lifecycle facade, session-termination facade, and security facade.
- Dynamic imports: none.
- Exports: `reaperAfterKill`, `registerShutdownHooks`, `setShutdownContext`, `clearShutdownContext`.
- Side effects: registers SIGTERM/SIGINT handlers when called; maintains module-global shutdown context; scans `ps`/`/proc`; sends SIGTERM/SIGKILL to linked ACP wrapper processes; stops tracked sessions; mutates/saves module status on interrupt; closes telemetry Redis; tracks/untracks placeholder current labels.
- Globals/coupling: coupled to process signals, Linux `/proc`, ACP wrapper command/env conventions, tracked-agent registry, Gateway URL/token env, status-store status vocabulary, telemetry Redis, and process exit code `1`.

### `skills/nova/pipeline/agents/tracked-agents.ts`
- Incoming callers/importers: no direct Nova-local caller found for this facade; common lifecycle/ACP monitor use the canonical common module directly.
- Outgoing static imports: re-exports `../../../common/pipeline/agents/tracked-agents.ts`.
- Dynamic imports: none.
- Exports: all common tracked-agent registry exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: compatibility shim for Nova-local imports; common pipeline owns process-local tracked-agent state.

### `skills/nova/pipeline/cli-args.ts`
- Incoming callers/importers: Nova CLI, Redis tool, lint-report tool, project-summary tool, and Buster tools through their own facade import shared CLI parsers.
- Outgoing static imports: re-exports `../../common/pipeline/cli-args.ts`.
- Dynamic imports: none.
- Exports: all common CLI arg parser exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: Nova-local compatibility facade; common pipeline owns strict CLI parser behavior.

## Nova CLI and core configuration/context foundations

### `skills/nova/pipeline/cli.ts`
- Incoming callers/importers: direct CLI/runtime execution via `node skills/nova/pipeline/cli.ts` or root wrapper exports; no in-scope source import found for `main`, but `normalizeNovaCliFlags` is exported for harness/library callers.
- Outgoing static imports: Node `url.fileURLToPath`, `fs`; `agents/shutdown.js`; `core/config.ts`; `core/constants.ts`; `services/blueprint.ts`; `core/context.ts`; `core/logger.ts`; `core/temp.ts`; `services/status-store.js`; `core/runtime.ts`; `runners/pipeline-runner.ts`; `core/policy.ts`; `cli-args.ts`; `redaction.ts`; `services/prompt-ingress.js`.
- Dynamic imports: none.
- Exports: `normalizeNovaCliFlags`, `main`.
- Side effects: when executed directly, parses `process.argv`, writes JSON stdout/stderr, creates/cleans temp dir, loads config/progress, binds active context, initializes log dirs and shutdown hooks, dispatches blueprint/status/dry-run/full pipeline commands, and exits via `process.exit`.
- Globals/coupling: coupled to `process.argv`, `process.env` (`CURRENT_PROJECT`, `NOVA_CHANNEL`), exit code constants, temp/log/status-store lifecycle, prompt ingress limits, Nova channel escalation, blueprint release/listing, and pipeline runner dispatch.

### `skills/nova/pipeline/core/config.ts`
- Incoming callers/importers: `pipeline/index.ts` re-exports `loadConfig`; Nova CLI imports `loadConfig`; arch validator, reviewer/gate runners import model/policy helpers; Buster gate runner imports `validateBusterConfig`.
- Outgoing static imports: Node `fs`, `path`; `./logger.ts`; `./platform-config.ts`; `./paths.ts`; `./git-context.ts`; `./policy.ts`; `./registry.js`.
- Dynamic imports: none.
- Exports: `loadConfig`, `validateConfig`, `validateBusterConfig`; re-exports policy helpers/constants and platform config discovery/load helpers.
- Side effects: reads platform swarm config and project `.swarm/progress.json`; validates and normalizes numeric config fields in-place; builds and stores plugin registry on `config._pluginRegistry`; stores validation errors on failure; sets repo root for Git primitives.
- Globals/coupling: coupled to `process.env.REPO_ROOT`, `DISCORD_WEBHOOK`, platform config location, project `.swarm` layout, plugin registry schema, gate type registry, safe-path policy, and mutable `config._*` runtime/plugin fields.

### `skills/nova/pipeline/core/constants.ts`
- Incoming callers/importers: `pipeline/index.ts`, many Nova services/runners/contracts import status, exit, and plugin contract constants.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: `STATUS`, exit code constants, plugin contract/schema constants, plugin kind/hook/stage/capability sets, plugin rejection code constants.
- Side effects: constructs frozen plugin config schema/object maps and Set constants at module load.
- Globals/coupling: canonical vocabulary for pipeline status, process exits, and plugin registry capability validation.

### `skills/nova/pipeline/core/context.ts`
- Incoming callers/importers: Nova CLI imports `createPipelineContext`; notification/telemetry dispatch and runner plugin paths import plugin context/envelope/capability helpers.
- Outgoing static imports: `./runtime.ts`; `./registry.js`; `../services/correlation.js`; `../services/artifact-bundle.js`; `../services/observability.js`; `../services/telemetry-stream.js`; `../services/serialization.ts`; `../integrations/discord.js`.
- Dynamic imports: none.
- Exports: `PipelineContext`, `isPipelineContext`, `createPipelineContext`, `narrowPluginInputForCapabilities`, `buildPluginInvocationEnvelope`, `createPluginContext`.
- Side effects: no startup side effects; created contexts mutate runtime mirror fields on `config`, and plugin effect defaults can append structured events, emit telemetry, persist artifacts, or notify Discord when invoked.
- Globals/coupling: coupled to plugin registry ownership, capability vocabulary, invocation snapshots, artifact API, telemetry/observability side effects, Discord operator notifications, and `config._*` compatibility fields.

### `skills/nova/pipeline/core/deps.ts`
- Incoming callers/importers: Nova services and runners use `selectDeps` for explicit scoped dependency injection.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: `selectDeps`.
- Side effects: none.
- Globals/coupling: owns the recognized DI scope names and flat-vs-scoped merge rule for harness/runtime options.

### `skills/nova/pipeline/core/git-context.ts`
- Incoming callers/importers: Git worktree integration, Buster/review gate runners, and project-summary tool import repo-root/Git helpers through this Nova facade.
- Outgoing static imports: re-exports `../git-primitives.ts`.
- Dynamic imports: none.
- Exports: `getRepoRoot`, `gitExec`, `getCurrentBranch`, `headHash`, `invalidateHeadHash`, `setRepoRoot`.
- Side effects: none beyond loading the shared Git primitive module.
- Globals/coupling: Nova-local facade; Git primitive authority remains in `skills/nova/pipeline/git-primitives.ts`.

### `skills/nova/pipeline/core/logger.ts`
- Incoming callers/importers: Nova CLI uses active-context setters; status-store initializes log streams; many services/runners import `log` or `getActiveContext`.
- Outgoing static imports: Node `fs`, `path`, `async_hooks.AsyncLocalStorage`; `../redaction.ts`; `../services/system-io-warning.js`.
- Dynamic imports: none.
- Exports: `setActiveContext`, `clearActiveContext`, `getActiveContext`, `createLogger`, `initContextLogging`, `log`.
- Side effects: creates process-local `AsyncLocalStorage`; logging writes sanitized JSON to stderr and best-effort appends to pipeline JSONL targets.
- Globals/coupling: coupled to active pipeline context shape, `ctx._pipelineLogPath`, `ctx._runPipelineLogPath`, `config._runLogDir`, redaction, system I/O warning emission, and run stats error collection.

### `skills/nova/pipeline/core/paths.ts`
- Incoming callers/importers: Nova prompts, services, status-store compat/lifecycle modules, agents, runners, and tools import path/ref helpers throughout the pipeline.
- Outgoing static imports: Node `fs`, `path`; `./runtime.ts`.
- Dynamic imports: none.
- Exports: safe-path validator, project/swarm/module/gate/log/artifact/ref path helpers, Redis completion/log path helpers, approval artifact helpers, repo-realpath helpers, and `pipelineRunLogDir`.
- Side effects: none; helpers throw on unsafe path input and may call `fs.realpathSync` for realpath validation.
- Globals/coupling: canonicalizes `.swarm`, module, gate, approval, Redis, cost, lint, and run log layouts; coupled to allowed absolute prefixes `/app/`, `/opt/`, `/home/`, `config.paths`, `config._logDir`, `config._runLogDir`, and run id resolution.

### `skills/nova/pipeline/core/platform-config.ts`
- Incoming callers/importers: `core/config.ts` imports and re-exports platform config discovery/loading; project-summary tool imports `loadPlatformSwarmConfig` directly.
- Outgoing static imports: Node `fs`, `path`.
- Dynamic imports: none.
- Exports: `DEFAULT_SWARM_CONFIG_PATH`, `discoverPlatformSwarmConfigCandidates`, `discoverSwarmConfigPath`, `loadPlatformSwarmConfig`.
- Side effects: reads and parses swarm config only when `loadPlatformSwarmConfig` is called.
- Globals/coupling: coupled to `/home/node/.openclaw/swarm.config.json` and `process.env.SWARM_CONFIG` fallback.

### `skills/nova/pipeline/core/policy.ts`
- Incoming callers/importers: Nova CLI validates `--thinking`; `core/config.ts` re-exports resolver/logging helpers; gate/module runners and arch/gate-fix services consume policy resolution through config exports.
- Outgoing static imports: Node `fs`, `path`; `./logger.ts`; `./runtime.ts`; `../services/system-io-warning.js`.
- Dynamic imports: none.
- Exports: `VALID_THINKING_LEVELS`, `THINKING_SUPPORTED_PATHS`, `THINKING_UNSUPPORTED_PATHS`, `validateThinkingLevel`, `resolvePolicy`, `logEffectivePolicy`.
- Side effects: `logEffectivePolicy` best-effort appends `.swarm/logs/pipeline/model-policy.jsonl` and reports append warnings.
- Globals/coupling: canonical model/thinking precedence authority; coupled to `config._runtimeOverrides`, `progress.defaults`, `config.fallback_model`, dispatch path support boundaries, `config._logDir`, and run id.


## Nova plugin registry, runtime context, public index, and facades

### `skills/nova/pipeline/core/registry/builtins.ts`
- Incoming callers/importers: `core/registry.ts` imports `BUILTIN_PLUGIN_DEFINITIONS` during startup registry assembly.
- Outgoing static imports: `../constants.ts`; gate runners `buster-gate-runner.ts`, `review-gate-runner.js`, `approval-gate-runner.js`; services `arch-validator.js`, `module-validators.js`, `summary.js`, `case-study.js`, `notification-contract.ts`, `telemetry-sink-contract.ts`.
- Dynamic imports: none.
- Exports: `BUILTIN_PLUGIN_DEFINITIONS` frozen array.
- Side effects: builds a frozen in-memory definition list at module load; handlers emit bridge trace events and call existing worker/gate/validator/generator implementations only when invoked.
- Globals/coupling: coupled to PluginContextV1 private `ctx.coreRuntime` bridge methods, `ctx.workerRuntime.dispatch`, stream/telemetry emitters, plugin contract constants, and existing implementation refs.

### `skills/nova/pipeline/core/registry/config-normalization.ts`
- Incoming callers/importers: `core/registry.ts` imports `normalizePluginConfig`; `core/registry/validation.ts` imports `allKnownCapabilities`.
- Outgoing static imports: Node `path`; `../constants.ts`; `../paths.ts`; `../../services/validation.js`.
- Dynamic imports: none.
- Exports: `normalizePluginConfig`, `allKnownCapabilities`.
- Side effects: none.
- Globals/coupling: owns `config.plugins` normalization for enabled flags, module overrides, stage owners, restricted capability allowlists, and reserved absolute custom module paths; coupled to known capability constants and safe-path validation.

### `skills/nova/pipeline/core/registry/indexes.ts`
- Incoming callers/importers: `core/registry.ts` imports all three index builders.
- Outgoing static imports: `../constants.ts`.
- Dynamic imports: none.
- Exports: `buildStageOwnerIndex`, `buildHookIndex`, `buildGateTypeIndex`.
- Side effects: none.
- Globals/coupling: owns startup-time indexes for hook/stage listeners, decision-stage owners, and gate-type owners; notification/telemetry listeners are multi-listener surfaces rather than exclusive decision owners.

### `skills/nova/pipeline/core/registry/validation.ts`
- Incoming callers/importers: `core/registry.ts` imports method mapping and validation/resolution helpers.
- Outgoing static imports: `../constants.ts`; `../../services/validation.js`; `../../services/serialization.ts`; `./config-normalization.js`.
- Dynamic imports: none.
- Exports: `PLUGIN_METHOD_BY_KIND`, `validateManifestConfigSchema`, `resolveModuleConfig`, `validateCapabilities`, `validateTrustPolicy`, `validateManifest`, `validateImplementation`.
- Side effects: none.
- Globals/coupling: canonicalizes plugin manifest validation, config-schema envelope checks, JSON-schema-lite module config validation, gate type/stage matching, trust policy, capability policy, and required implementation method names.

### `skills/nova/pipeline/core/registry.ts`
- Incoming callers/importers: `core/config.ts` assembles the registry; runners import `requireStageHandler`/`requireGateTypeOwner`; notification and telemetry sink dispatchers import listener helpers; services/runners read registry through config.
- Outgoing static imports: `./constants.ts`; `../services/serialization.ts`; registry modules `builtins.js`, `config-normalization.js`, `validation.js`, `indexes.js`.
- Dynamic imports: none.
- Exports: `getBuiltinPluginDefinitions`, `formatPluginRegistryErrors`, `buildPluginRegistry`, `getPluginRegistry`, `requirePluginRegistry`, `resolveStageOwner`, `requireStageOwner`, `resolveGateTypeOwner`, `requireGateTypeOwner`, `resolveStageHandler`, `requireStageHandler`, `resolveHookListeners`.
- Side effects: none at import; `buildPluginRegistry` clones, validates, deep-freezes records/indexes, and throws unless `opts.throwOnError === false`.
- Globals/coupling: uses `config._pluginRegistry` as the runtime registry projection; owns startup-frozen plugin records, stage owners, gate-type owners, hook listeners, and registry error formatting.

### `skills/nova/pipeline/core/runtime.ts`
- Incoming callers/importers: Nova CLI, `core/context.ts`, `core/paths.ts`, `core/policy.ts`, pipeline runner/deps, gate/module runners, status-store lifecycle modules, polling, telemetry, summaries, integrations, validators, failure/rate-limit services, and artifact/alert services.
- Outgoing static imports: Node `fs`, `path`; `./logger.ts`; `../redaction.ts`.
- Dynamic imports: none.
- Exports: `createRunId`, `createRunStats`, `bindRunContext`, `resolveRunContext`, `getRunId`, `getRunStats`, `getRunState`, `isoNow`, `createOpaqueId`, `createEffectReceipt`, `runLogDir`, `output`, `loadProgress`.
- Side effects: no run identity is created at module load; `output` writes sanitized JSON to stdout; `loadProgress` reads/parses progress when called.
- Globals/coupling: resolves context from explicit PipelineContext-like input, config projection, or active logger context; coupled to `config._runId`, `config.run_id`, `config._runStats`, `config._logDir`, and `config.paths.progress_file`. No module-global fallback run identity is exported.

### `skills/nova/pipeline/core/temp.ts`
- Incoming callers/importers: Nova CLI imports `createTempManager` for direct-run temp lifecycle.
- Outgoing static imports: Node `fs`, `os`, `path`.
- Dynamic imports: none.
- Exports: `createTempManager`.
- Side effects: none at import; `init()` creates an OS temp directory and registers an `exit` cleanup handler; `cleanup()` best-effort removes the directory.
- Globals/coupling: coupled to `process.on('exit')`, `os.tmpdir()`, and `swarm-pipeline-*` temp directory naming.

### `skills/nova/pipeline/git-primitives.ts`
- Incoming callers/importers: `core/git-context.ts` re-exports selected Git helpers through this Nova facade.
- Outgoing static imports: re-exports `../../common/pipeline/git-primitives.ts`.
- Dynamic imports: none.
- Exports: all shared Git primitive exports.
- Side effects: none beyond loading the common module.
- Globals/coupling: compatibility facade; common Git primitives own repo-root and Git subprocess behavior.

### `skills/nova/pipeline/index.ts`
- Incoming callers/importers: root `skills/nova/pipeline.ts` re-exports it; README examples import from this surface.
- Outgoing static imports: `./core/config.ts`; `./agents/shutdown.js`; `./core/constants.ts`; `./runners/pipeline-runner.ts`.
- Dynamic imports: none.
- Exports: `loadConfig`, `registerShutdownHooks`, status/exit constants, `runPipeline`, and default pipeline runner.
- Side effects: none beyond loading re-exported modules.
- Globals/coupling: narrow public Nova pipeline API for root imports; telemetry/notification/service helpers stay behind owning module imports.

### `skills/nova/pipeline/integrations/discord-webhook.ts`
- Incoming callers/importers: Nova `integrations/discord.js` imports `postDiscordWebhook`; production image layout may overwrite this path with the common implementation.
- Outgoing static imports: re-exports `../../../common/pipeline/integrations/discord-webhook.ts`.
- Dynamic imports: none.
- Exports: all shared Discord webhook integration exports.
- Side effects: none beyond loading the common module.
- Globals/coupling: role-local facade; common Discord webhook integration owns HTTP transport behavior.


## Nova Discord/Gateway/Git integrations and prompt builders

### `skills/nova/pipeline/integrations/discord.ts`
- Incoming callers/importers: `core/context.ts`; Nova `agents/orchestration.ts` and `agents/reviewer-lifecycle.js`; runners `buster-gate-runner.ts`, `review-gate-runner.js`, `approval-gate-state.js`, `pipeline-runner-deps.js`, `pipeline-runner-recovery.js`, and `module-runner/attempt.ts`; services `blueprint.ts`, `case-study.js`, `notification-contract.ts`, `rate-limit*.js`, `summary*.js`, `telemetry-sink-contract.ts`, and `failures/presentation.js`; `tools/project-summary.ts`; `tools/redis.ts` dynamically imports it.
- Outgoing static imports: Node `fs`, `path`; Nova logger/runtime/deps; observability degraded/restored helpers; Nova noncritical-reporting and redaction facades; Discord webhook facade.
- Dynamic imports: none.
- Exports: `discord`, `discordEmbeds`.
- Side effects: none at import; exported functions sanitize/audit Discord embeds, append JSONL audit entries, call injected or webhook delivery, record observability degradation/restoration, and increment run stats when invoked.
- Globals/coupling: reads `process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS`; coupled to `config.discord_webhook_url`, `config.discord_alerts`, `_disable_discord_webhooks`, `_runId`/`run_id`, `_logDir`/`_runLogDir`, project/run stats, and scoped dependency injection names.

### `skills/nova/pipeline/integrations/gateway.ts`
- Incoming callers/importers: Nova `agents/orchestration.ts`, `agents/orchestration-healthcheck.js`, `agents/shutdown.js`; services `arch-validator.js`, `polling-session-end.js`, and `failures/presentation.js`.
- Outgoing static imports: re-exports `../../../common/pipeline/integrations/gateway.ts`.
- Dynamic imports: none.
- Exports: all shared Gateway integration symbols.
- Side effects: none beyond loading the common module.
- Globals/coupling: compatibility facade for Nova-local imports and production `/app/skills/pipeline` layout; common Gateway integration owns URL/token/env/retry behavior.

### `skills/nova/pipeline/integrations/git-worktree.ts`
- Incoming callers/importers: services `agent-observability-forge-completion.js`, `blueprint.ts`, `polling.js`, `polling-session-end.js`; runners `buster-gate-runner.ts`, `review-gate-runner.js`, and `module-runner/attempt.ts`.
- Outgoing static imports: Node `fs`, `path`; Nova logger/runtime/constants/Git context; failure classification; lifecycle tracked-agent facade; lifecycle-state facade; timing facade; security facade.
- Dynamic imports: none.
- Exports: Git context re-exports `getRepoRoot`, `gitExec`, `headHash`, `invalidateHeadHash`, `setRepoRoot`; `classifyGitPushError`; `assessPollingPullSafety`; `isRuntimeStatePath`; `gitPullForPolling`; `gitPullBeforePush`; `gitPushWithRetry`; `gitCommitAndPush`; `gitSyncBeforeBuster`.
- Side effects: none at import; exported functions run Git subprocesses, inspect/stash worktree state, resolve rebase/stash conflicts for runtime artifacts, commit/pull/push, mutate module status with Forge commit metadata, and update run stats when invoked.
- Globals/coupling: coupled to `config.repo_root`, `config.project`, `.git/rebase-*` layout, Git upstream state, `.swarm` runtime artifact path patterns, active tracked-agent count, mutable module `status`, `STATUS.READY_FOR_TESTING`, and subprocess env policy.

### `skills/nova/pipeline/lifecycle-state.ts`
- Incoming callers/importers: Nova status-store, rate-limit, polling, failures retry policy, git-worktree, shutdown, project-summary, pipeline recovery, module-runner Forge/Buster/prebuster helpers, and Buster-phase helpers.
- Outgoing static imports: re-exports `../../common/pipeline/lifecycle-state.ts`.
- Dynamic imports: none.
- Exports: all shared lifecycle-state symbols.
- Side effects: none beyond loading the common module.
- Globals/coupling: compatibility facade; common lifecycle-state owns mutation/history/pending-lifecycle metadata.

### `skills/nova/pipeline/noncritical-reporting.ts`
- Incoming callers/importers: Nova Redis log, failures incidents, system I/O warning, observability, telemetry stream/dispatch, durable operator alert, and Discord integration; Buster services import their own role-local facade to the same common owner.
- Outgoing static imports: re-exports `../../common/pipeline/noncritical-reporting.ts`.
- Dynamic imports: none.
- Exports: all shared noncritical-reporting symbols.
- Side effects: none beyond loading the common module.
- Globals/coupling: compatibility facade; common noncritical-reporting owns incident de-dupe and sanitized fallback logging.

### `skills/nova/pipeline/prompts/buster-gate.ts`
- Incoming callers/importers: `runners/buster-gate-runner.ts` imports `readGateInstructions` and `buildBusterGatePrompt`; `runners/review-gate-runner.js` imports `readGateInstructions`.
- Outgoing static imports: Node `fs`, `path`; Nova path helpers; prompt shared helpers.
- Dynamic imports: none.
- Exports: `readGateInstructions`, `buildBusterGatePrompt`.
- Side effects: none at import; `readGateInstructions` reads gate instruction files and throws when absent.
- Globals/coupling: coupled to gate output/instruction path helpers, `gate.output_file`, artifact refs, Buster completion identity, and prompt shared completion/tool/workspace sections.

### `skills/nova/pipeline/prompts/buster-instructions.ts`
- Incoming callers/importers: `prompts/buster-module.js` imports `readBusterInstructions`.
- Outgoing static imports: Node `fs`, `path`; Nova `modulePath` helper.
- Dynamic imports: none.
- Exports: `readBusterInstructions`.
- Side effects: none at import; exported reader reads module `BUSTER.md` and throws when absent.
- Globals/coupling: coupled to module directory layout and `modulePath(config, moduleDir)`.

### `skills/nova/pipeline/prompts/buster-module.ts`
- Incoming callers/importers: `runners/module-runner/attempt.ts` imports `buildBusterModulePrompt`.
- Outgoing static imports: Nova path helpers; prompt shared helpers; `./buster-instructions.js`.
- Dynamic imports: none.
- Exports: `buildBusterModulePrompt`.
- Side effects: none at import; prompt building reads `BUSTER.md` through `readBusterInstructions`.
- Globals/coupling: coupled to module status shape (`fail_count`, `forge_commit_hash`, `forge_diff_stat`), max-fail policy, module output/workspace path refs, and Buster completion identity.

### `skills/nova/pipeline/prompts/forge.ts`
- Incoming callers/importers: `runners/module-runner/attempt.ts` imports `buildForgePrompt`.
- Outgoing static imports: Node `fs`, `path`; Nova path helpers and logger; prompt shared completion-artifact helpers; prompt-ingress remediation formatter.
- Dynamic imports: none.
- Exports: `readForgeInstructions`, `buildForgePrompt`.
- Side effects: none at import; prompt building reads `FORGE.md` files and logs when an operator remediation directive is injected.
- Globals/coupling: coupled to module config `substeps`, agent Forge cwd config, backend package presence, status retry/failure summary shape, optional operator remediation text, and Forge completion artifact contract.

### `skills/nova/pipeline/prompts/gate-fix.ts`
- Incoming callers/importers: `runners/buster-gate-runner.ts` imports `buildGateFixPrompt`.
- Outgoing static imports: Nova path helpers; prompt shared result helper.
- Dynamic imports: none.
- Exports: `buildGateFixPrompt`.
- Side effects: none.
- Globals/coupling: coupled to gate issue/fix-history shape, gate title/id, max attempt policy, project/source/swarm path helpers, and a strict final-action contract that forbids commits/status/completion writes by the fixer.


## Nova prompt contracts, shared facades, approval gate, and Buster-gate completion/control

### `skills/nova/pipeline/prompts/review.ts`
- Incoming callers/importers: `runners/review-gate-runner.js` imports `buildReviewerPrompt`; `runners/review-gate-fix-cycle.js` imports `buildReviewFixPrompt`.
- Outgoing static imports: `../core/paths.ts`; `./shared.js`.
- Dynamic imports: none.
- Exports: `buildReviewFixPrompt`, `buildReviewerPrompt`.
- Side effects: none at module load; functions only build prompt strings and wrap reviewer prompts in `makePromptResult`.
- Globals/coupling: coupled to project path helpers, gate/reviewer/lint issue shapes, review JSON output contract, and the Forge/fixer final-action contract.

### `skills/nova/pipeline/prompts/shared.ts`
- Incoming callers/importers: Nova prompt builders `buster-module.js`, `buster-gate.js`, `forge.js`, `gate-fix.js`, and `review.js`.
- Outgoing static imports: Node `path`; `../core/paths.ts`.
- Dynamic imports: none.
- Exports: `makePromptResult`, Git/tool/workspace section builders, Forge/Buster artifact contract builders, `forgeCompletionArtifactPath`, `buildBusterCompletionProtocol`, `buildBusterGateCompletionProtocol`.
- Side effects: none at module load; exported helpers return prompt line arrays/strings or prompt result objects.
- Globals/coupling: prompt return shape includes metadata defaults and a `.toString()` compatibility shim; artifact contracts are coupled to `.swarm` output paths and exact JSON schemas.

### `skills/nova/pipeline/redaction.ts`
- Incoming callers/importers: Nova CLI, logger/runtime, telemetry stream, summary/status/case-study/validator/polling/gate-fix/review/buster-gate services, durable operator alerts, Discord integration, project-summary and Redis tools; Buster also has its own sibling facade.
- Outgoing static imports: re-exports `../../common/pipeline/redaction.ts`.
- Dynamic imports: none in this file.
- Exports: all common redaction exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: role-local compatibility facade for the production `/app/skills/pipeline` shared surface; common redaction owns sanitization policy.

### `skills/nova/pipeline/redis-transport.ts`
- Incoming callers/importers: `services/agent-observability-ingester/consumer.ts` imports Redis client helpers through this Nova facade; its tsconfig includes the facade.
- Outgoing static imports: re-exports `../../common/pipeline/redis-transport.ts`.
- Dynamic imports: none.
- Exports: all common Redis transport exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: role-local compatibility facade for shared Redis transport policy and `ioredis` loading.

### `skills/nova/pipeline/runners/approval-gate-control.ts`
- Phase 8 facade baseline: this `.js` file is a pure re-export of `approval-gate-control.ts`. Runtime ownership and fallback-ledger decisions attach to the `.ts` owner.
- Incoming callers/importers: `runners/approval-gate-runner.js` imports the control-result builders/coercers.
- Outgoing static imports: `../core/constants.ts`; `../services/contracts/gate-control-result.ts`; `./approval-gate-shared.js`.
- Dynamic imports: none.
- Exports: `buildApprovalGateControlResult`, `buildApprovalGateWaitControlResult`, `isApprovalGateControlResult`, `coerceApprovalGateControlResult`.
- Side effects: none at module load.
- Globals/coupling: coupled to typed gate-control contract, approval status/timeout vocabulary, run identity fields, and scheduler consumption metadata.

### `skills/nova/pipeline/runners/approval-gate-runner.ts`
- Incoming callers/importers: `core/registry/builtins.ts` imports `runApprovalGateStage` and `getApprovalGateControlAdapter` for gate dispatch.
- Outgoing static imports: deps/logger/constants; status store; governance context; telemetry; gate-control contract; Discord identity fields; `approval-gate-shared.js`; `approval-gate-control.js`; `approval-gate-state.js`; pipeline event contract; approval signal adapter.
- Dynamic imports: none.
- Exports: approval constants/control helpers re-exported from sibling modules; `buildApprovalEmbed`, `runApprovalGateEvaluation`, `waitForApprovalGateSignal`, `createApprovalGateWaitController`, `runApprovalGateStage`, `getApprovalGateControlAdapter`.
- Side effects: none at module load; runtime calls write approval state/audit artifacts, sync wait-state projections, emit governance/telemetry/Discord presentations, create event buses/adapters, and wait for approval/fatal events.
- Globals/coupling: coupled to `progress.gates`, `progress.execution_order`, `.swarm/<gate>-gate-status.json`, approval wait lifecycle/read model state, pipeline event names, `Date.now()`, `AbortController`, and operator command vocabulary.

### `skills/nova/pipeline/runners/approval-gate-shared.ts`
- Incoming callers/importers: `services/approval-signal-event-adapter.js`, `approval-gate-control.js`, `approval-gate-runner.js`, and `approval-gate-state.js`.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: `APPROVAL_STATUS`, `APPROVAL_TIMEOUT_POLICY`, `APPROVAL_TERMINAL_OR_WAIT_STATUSES`, `DEFAULT_TIMEOUT_MINUTES`, `normalizeApprovalTimeoutPolicy`, `isApprovalTimeoutContinue`, `normalizeApprovalGateState`, `buildApprovalIdentity`.
- Side effects: creates the terminal/wait status `Set` at module load.
- Globals/coupling: owns approval status strings, timeout policy strings, default timeout, and identity normalization across snake/camel-case gate fields.

### `skills/nova/pipeline/runners/approval-gate-state.ts`
- Incoming callers/importers: `runners/approval-gate-runner.js` imports default deps and state/audit/fail-closed helpers.
- Outgoing static imports: Node `fs`; logger/constants/paths; Nova Discord integration; approval shared helpers; Discord identity fields.
- Dynamic imports: none.
- Exports: `loadApprovalGateState`, `failClosedOnCorruptedApprovalState`, `failClosedOnInvalidApprovalState`, `saveApprovalGateState`, `appendApprovalTransition`, `writeApprovalRequest`, `writeApprovalDecision`, `DEFAULT_APPROVAL_GATE_DEPS`.
- Side effects: builds default dependency object at module load; exported functions read/write gate status, request, decision, and transition artifacts and may send critical Discord notifications.
- Globals/coupling: coupled to `.swarm` gate-status path, `.swarm/logs/gates/<gate>/` audit paths, atomic temp-file rename, JSON parse previews, operator repair instructions, and Discord notification behavior.

### `skills/nova/pipeline/runners/buster-gate-completion.ts`
- Incoming callers/importers: `runners/buster-gate-runner.ts` imports `waitBusterGateCompletionEvidence`.
- Outgoing static imports: deps/logger/constants/paths; telemetry durable alerts; status-store projection; pipeline event contract; Redis/local completion event adapters; Buster completion controller; rate-limit helpers; `./buster-gate-task.ts`.
- Dynamic imports: none.
- Exports: `waitBusterGateCompletionEvidence`.
- Side effects: exported wait function creates event bus/adapters, watches Redis and canonical output-file local evidence, appends durable operator alerts on fatal adapter failure or timeout, starts/stops adapters, and aborts wait controllers.
- Globals/coupling: coupled to Redis completion identity, canonical output-file evidence, rate-limit terminal ownership, Buster completion authority policy, and `AbortController`. Legacy `gate-status.json` is not mapped as a runner completion source.

### `skills/nova/pipeline/runners/buster-gate-control.ts`
- Incoming callers/importers: `runners/buster-gate-runner.ts` imports Buster gate control/result/remediation helpers.
- Outgoing static imports: core constants/runtime; typed gate-control contract; remediation handoff; correlation helpers.
- Dynamic imports: none.
- Exports: `buildBusterIssueFindings`, `buildBusterGateControlResult`, `isBusterGateControlResult`, `coerceBusterGateControlResult`, `extractGateIssues`, `buildBusterRequestFixControlResult`.
- Side effects: none at module load.
- Globals/coupling: coupled to Buster result status shapes from Redis/output-file/gate-status, typed gate-control contract, failure-class inference strings, remediation policy fields, correlation identity aliases, and default Nova fix-cycle counts.

## Nova Buster/review gate runners and module-runner Buster dispatch/identity

### `skills/nova/pipeline/runners/buster-gate-fix-cycle.ts`
- Incoming callers/importers: `runners/buster-gate-runner.ts` imports `performBusterGateFixAttempt` for remediable Buster gate fix cycles.
- Outgoing static imports: Node `fs`; Nova logger/runtime/path helpers; Discord identity fields; remediation handoff reader; typed gate-control cloning; shared `gate-forge-fix-cycle.js` engine.
- Dynamic imports: none.
- Exports: `performBusterGateFixAttempt`.
- Side effects: none at module load; exported function reads remediation specs, builds Forge fix prompts, sends Discord through injected deps, archives/deletes stale gate output/status artifacts before retest, and patches remediation diagnostics.
- Globals/coupling: coupled to Buster gate remediation metadata/correlation, gate output/status paths, `config.default_max_fails`, `gate.max_fix_cycles`, `Date.now()`, and injected Buster gate deps/callbacks.

### `skills/nova/pipeline/runners/buster-gate-runner.ts`
- Incoming callers/importers: `core/registry/builtins.ts` imports `runBusterGateStage` and `getBusterGateControlAdapter`; `gate-runner.js` reaches it through the startup plugin registry.
- Outgoing static imports: Node `fs`/`path`; deps/logger/constants/runtime/config/paths/Git context; Discord/Git integrations; status-store, polling, rate-limit, Buster gate/gate-fix prompts, orchestration/lifecycle, telemetry, Discord fields, redaction, remediation/gate-active-session services; typed gate-control contract; Buster gate task/completion/fix/terminal/control helpers.
- Dynamic imports: none.
- Exports: `buildBusterRemediationExhaustedControlResult`, `runBusterGateEvaluation`, `runBusterGateFixAttempt`, `createBusterGateRemediationController`, `getBusterGateControlAdapter`, `runBusterGateStage`.
- Side effects: builds default dependency table at module load; runtime writes redacted prompt artifacts, archives stale gate output/status/completions, spawns/kills Buster sessions, persists/clears gate active-session evidence, emits telemetry/Discord, and drives retry/remediation controller flows.
- Globals/coupling: coupled to `progress.gates`, plugin gate-control adapter shape, Redis completion identity, Buster active-session files, rate-limit pause state, gate output/status authority, run stats, and `Date.now()` dispatch IDs.

### `skills/nova/pipeline/runners/buster-gate-task.ts`
- Incoming callers/importers: `runners/buster-gate-completion.js` imports `buildBusterGateActiveCompletionIdentity`; `runners/buster-gate-runner.ts` imports all helper exports for gate dispatch identity/archive/spawn/rate-limit state.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: Buster gate identity/archive/spawn/active-session helpers: `createBusterGateCompletionIdentity`, `buildBusterGateRateLimitStatusOptions`, `buildBusterGateArchiveIdentity`, `buildBusterGateArchiveTarget`, `buildBusterGateSpawnOptions`, `buildBusterGateActiveSessionMetadata`, `buildBusterGateActiveCompletionIdentity`, `applyTrackedBusterGateIdentity`, `syncBusterGateRateLimitStatusOptions`.
- Side effects: none; pure object construction/mutation helpers only.
- Globals/coupling: uses `Date.now()` by default for dispatch id generation and depends on tracked-agent field names `telemetry_dispatch_id`, `dispatch_id`, `gatewayLabel`, and `sessionKey`.

### `skills/nova/pipeline/runners/buster-gate-terminal.ts`
- Incoming callers/importers: `runners/buster-gate-runner.ts` imports `handleBusterGateEvaluationResult`.
- Outgoing static imports: logger/constants/runtime; telemetry; Discord fields; rate-limit finalizer; correlation resolvers.
- Dynamic imports: none.
- Exports: `handleBusterGateEvaluationResult`.
- Side effects: none at module load; exported function emits gate pass/fail telemetry/Discord presentations, finalizes rate-limit exits, and maps poll reasons into typed Buster gate control results.
- Globals/coupling: coupled to Buster poll-result reason strings (`config_invalid`, `spawn_failed`, `invalid_contract`, `parse_corrupted`, `timeout`, `git_error`, `rate_limit_exhausted`), canonical completion result evidence, correlation aliases, run stats, and gate fix-loop policy.

### `skills/nova/pipeline/runners/gate-forge-fix-cycle.ts`
- Incoming callers/importers: `runners/buster-gate-fix-cycle.js` and `runners/review-gate-fix-cycle.js` import `runGateForgeFixCycle`.
- Outgoing static imports: logger/constants/runtime; Discord fields; Git soft-fail observability; rate-limit finalizer; gate-fix scaffold start/finish helpers.
- Dynamic imports: none.
- Exports: `runGateForgeFixCycle`.
- Side effects: none at module load; exported engine sends Discord start/working/result notices, starts/finishes Forge fix scaffold, updates caller-provided fix history, attempts Git publication as a non-authoritative persistence side effect, emits typed degraded evidence for Git persistence failures, emits telemetry callbacks, and returns remediation scheduler modes.
- Globals/coupling: coupled to caller-provided message/callback contract, Forge scaffold result shape, typed file-change evidence, rate-limit result shape, `config.rate_limit.max_pauses_per_module`, Git persistence degradation shape, and gate correlation fields.

### `skills/nova/pipeline/runners/gate-runner.ts`
- Incoming callers/importers: `runners/pipeline-runner-deps.js` imports `runGate`; pipeline runner executes gates through that dependency.
- Outgoing static imports: Node `fs`/`path`; logger/deps/constants/runtime/context/registry/paths; telemetry; Discord fields; status-store read helpers; remediable/waitable gate schedulers; stage-envelope primitives; typed gate-control and pipeline-step-result contracts.
- Dynamic imports: none.
- Exports: `runGate` and default `runGate`.
- Side effects: none at module load; runtime may create run log dirs, read gate output/status/lifecycle/completion evidence snapshots, build plugin invocation envelopes, emit dispatch/execution failure telemetry/Discord, and dispatch registered gate handlers through the startup registry.
- Globals/coupling: coupled to `progress.gates`, plugin registry gate owner and `gateControl` adapter contract, `.swarm` gate artifacts, typed pipeline step results, active logger context, and `config._logDir`/`config._runLogDir` compatibility fields.

### `skills/nova/pipeline/runners/module-runner/attempt.ts`
- Incoming callers/importers: `runners/module-runner.ts` imports/re-exports module-attempt helpers for module lifecycle execution.
- Outgoing static imports: deps/constants/logger/config/Git context; status-store; blueprint; failure classification/presentation; polling; runtime/lifecycle/orchestration/shutdown agents; Discord and Git integrations; Forge/Buster prompt builders; dependency and validation services; module-runner shared telemetry; module state-machine and terminal result helpers.
- Dynamic imports: none.
- Exports: `getModuleRunnerDeps`, `resolveModuleRunContext`, `executeModuleAttempt`, and default `executeModuleAttempt`.
- Side effects: builds default dependency table at module load; exported execution loads/saves status through downstream state machine, emits terminal failure telemetry on dependency failure, releases blueprints, starts/stops shutdown context through deps, and delegates Forge/Buster phases.
- Globals/coupling: coupled to `progress.modules`, module status files, dependency graph, max fail/timeout defaults, Buster config validation, active Git HEAD cache, and injected dependency scopes.

### `skills/nova/pipeline/runners/module-runner/buster-phase/dispatch.ts`
- Incoming callers/importers: `runners/module-runner/buster-phase.ts` imports `executeBusterAttemptDispatch`.
- Outgoing static imports: constants/logger/runtime; correlation helpers; lifecycle-state `startModulePhase`; module terminal telemetry; Buster worker executor; Discord fields.
- Dynamic imports: none.
- Exports: `executeBusterAttemptDispatch`.
- Side effects: none at module load; exported function builds/saves Buster prompt artifacts, validates Buster config on first Buster crash retry, mutates/saves module status into Buster phase, sets shutdown context, sends queued Discord notification, and delegates to `executeBusterWorkerAttempt`.
- Globals/coupling: coupled to module status `fail_count`, `mod.test_suites`, Buster prompt result shape, Discord module identity fields, lifecycle-state mutation helpers, and `Date.now()` dispatch ids.

### `skills/nova/pipeline/runners/module-runner/buster-phase/identity.ts`
- Incoming callers/importers: `runners/module-runner/buster-phase.ts`, `buster-phase/poll-failure.ts`, `buster-phase/spawn-failure.ts`, and `buster-phase/terminal-failure.ts` import completion identity resolvers.
- Outgoing static imports: correlation helpers.
- Dynamic imports: none.
- Exports: `resolveCompletionGatewayLabel`, `resolveCompletionDispatchId`, `resolveCompletionSessionKey`.
- Side effects: none; pure correlation resolution helpers.
- Globals/coupling: coupled to Redis entry/result aliases, completion identity camel/snake fields, status correlation aliases, and optional fallback session key precedence.

## Nova module-runner Buster phase state-machine and worker dispatch

### `skills/nova/pipeline/runners/module-runner/buster-phase/poll-failure.ts`
- Incoming callers/importers: `runners/module-runner/buster-phase.ts` imports `handleFailedPollResult` for Buster poll failures after worker dispatch.
- Outgoing static imports: Nova constants, logger, runtime run-id helper, rate-limit finalizer, lifecycle-state mutation helpers, module-runner shared crash telemetry/current-attempt helpers, terminal result builders, Buster-phase identity helpers, and Discord identity field helpers.
- Dynamic imports: none.
- Exports: `handleFailedPollResult`.
- Side effects: none at module load; runtime calls may reload/save module status, finalize rate-limit exits, emit Discord alerts, mark modules blocked, and emit terminal Buster crash telemetry.
- Globals/coupling: coupled to Buster worker poll result reasons (`rate_limit_exhausted`, `git_error`, `completion_conflict`, `timeout`, `parse_corrupted`), module status mutation shape, rate-limit config, Discord identity surfaces, and crash retry budget semantics.

### `skills/nova/pipeline/runners/module-runner/buster-phase/spawn-failure.ts`
- Incoming callers/importers: `runners/module-runner/buster-phase.ts` imports `handleBusterSpawnFailure` when the worker result reports `reason === 'spawn_failed'`.
- Outgoing static imports: Nova constants/logger/runtime; correlation result helpers; telemetry operator alert; module-runner shared telemetry/current-attempt helpers; Buster-phase identity helpers; Discord identity field helpers.
- Dynamic imports: none.
- Exports: `handleBusterSpawnFailure`.
- Side effects: none at module load; runtime emits an operator alert and terminal module-fail telemetry, then returns an `EXIT_ERROR` terminal result.
- Globals/coupling: coupled to Buster worker result error/identity fields, current attempt numbering, Discord presentation shape, and terminal fail telemetry contract.

### `skills/nova/pipeline/runners/module-runner/buster-phase/terminal-failure.ts`
- Incoming callers/importers: `runners/module-runner/buster-phase.ts` imports `handleBusterFailOrBlockedStatus` for terminal `FAIL`/`BLOCKED` statuses after Buster polling.
- Outgoing static imports: Nova constants/logger/runtime; correlation helpers; lifecycle-state mutation/block helpers; module-runner shared crash/module fail telemetry helpers; Buster-phase identity helpers; Discord identity field helpers.
- Dynamic imports: none.
- Exports: `handleBusterFailOrBlockedStatus`.
- Side effects: none at module load; runtime may mutate/save module status, send Discord notices, emit terminal telemetry, call `handleModuleFail`, and return retry or terminal results.
- Globals/coupling: coupled to Redis completion `_redis_entry.source`/`verdict` shape, Buster pipeline source naming, suite verdict helper deps, `status.fail_summaries` text prefixes, Forge retry handoff via `handleModuleFail`, and Buster crash retry budget.

### `skills/nova/pipeline/runners/module-runner/buster-phase/terminal-pass.ts`
- Incoming callers/importers: `runners/module-runner/buster-phase.ts` imports `handleBusterPassStatus` for terminal PASS handling.
- Outgoing static imports: Nova status constant, logger, lifecycle finalizer, telemetry phase/module pass helpers, module-runner shared duration/stats/log-scope helpers, terminal pass result builder, and Discord identity field helpers.
- Dynamic imports: none.
- Exports: `handleBusterPassStatus`.
- Side effects: none at module load; runtime finalizes module status, saves status, emits phase/pass telemetry, clears log scope, and appends to run module-completion stats.
- Globals/coupling: coupled to mutable status cost fields, module run stats, Discord module-session identity fields, and terminal PASS result shape.

### `skills/nova/pipeline/runners/module-runner/buster-phase.ts`
- Incoming callers/importers: `runners/module-runner/state-machine.ts` imports `runModuleBusterPhase` directly.
- Outgoing static imports: Nova status constants/logger; completion adjudicator; lifecycle transition helper; phase-start telemetry; module-runner shared telemetry/stats/log-scope helpers; Buster-phase identity/spawn/poll/pass/failure/dispatch helpers.
- Dynamic imports: none.
- Exports: `runModuleBusterPhase` and default `runModuleBusterPhase`.
- Side effects: none at module load; runtime sets log scope, resolves/logs Buster policy, increments Buster attempt stats, emits phase-start telemetry, dispatches Buster worker attempts, applies trusted Redis terminal completions to local status, saves status, and returns retry/terminal results.
- Globals/coupling: coupled to module statuses `READY_FOR_TESTING`/`TESTING`/`PASS`/`FAIL`/`BLOCKED`, `mod.max_buster_crash_retries`, `config.max_buster_crash_retries`, Redis completion adjudication identity, and the worker result/poll result contract.

### `skills/nova/pipeline/runners/module-runner/preflight.ts`
- Incoming callers/importers: `runners/module-runner-forge.ts` imports `runModulePreflight` before Forge spawn.
- Outgoing static imports: Nova logger/runtime, status gateway-label correlation, module-runner shared current-attempt helper, terminal retry result builder, and Discord identity field helpers.
- Dynamic imports: none.
- Exports: `runModulePreflight` and default `runModulePreflight`.
- Side effects: none at module load; runtime calls injected validation/format/Discord/failure deps and can route preflight contract failures into retry or terminal results.
- Globals/coupling: coupled to injected `deps.runPreflightValidation`, `formatValidationFailures`, `discord`, `handleFail`, module status attempt numbering, and Forge preflight contract failure code `preflight_contract`.

### `skills/nova/pipeline/runners/module-runner/state-machine.ts`
- Incoming callers/importers: `runners/module-runner/attempt.ts` imports `runModuleAttemptStateMachine`; no other production import found.
- Outgoing static imports: Nova constants/logger; status correlation helpers; module-runner shared telemetry/validation/log-scope helpers; Forge phase/finalizer; pre-Buster preparation; Buster phase; terminal result builders.
- Dynamic imports: none.
- Exports: `MODULE_ATTEMPT_ACTIONS`, `planLoadedModuleStatus`, `planModuleAttemptPhase`, `planAfterBusterPreparation`, `planAfterBusterPhase`, `runModuleAttemptStateMachine`.
- Side effects: freezes `MODULE_ATTEMPT_ACTIONS` at module load; runtime may release blueprints, initialize/save status, run Forge/pre-Buster/Buster phases, emit terminal fail telemetry, and return unexpected-status terminal errors.
- Globals/coupling: coupled to module status vocabulary, default stage list `['forge','buster']`, blueprint release/init deps, Forge/Buster phase contracts, retry-result shape, and resume command construction.

### `skills/nova/pipeline/runners/module-runner/terminal-results.ts`
- Incoming callers/importers: `runners/module-runner/attempt.ts`, `module-runner-forge.ts`, `module-runner-prebuster.ts`, `module-runner/preflight.js`, `module-runner/state-machine.ts`, `buster-phase/poll-failure.ts`, and `buster-phase/terminal-pass.ts` import terminal/retry builders.
- Outgoing static imports: Nova constants and correlation result/status helpers.
- Dynamic imports: none.
- Exports: `buildRetryResult`, `buildPassTerminalResult`, `buildFailTerminalResult`, `buildBlockedTerminalResult`, `buildRateLimitTerminalResult`.
- Side effects: none; pure result-shaping helpers.
- Globals/coupling: coupled to correlation alias resolution, existing result envelopes (`retry`, `result.exit`), status blocked fields/fail summary shape, and rate-limit exit result projection.

### `skills/nova/pipeline/runners/module-runner-buster-worker.ts`
- Incoming callers/importers: `runners/module-runner/buster-phase/dispatch.ts` imports `executeBusterWorkerAttempt`.
- Outgoing static imports: Nova plugin context/envelope helpers; constants/logger/registry; worker-control result compatibility projector; lifecycle-state active-agent helpers; module-runner shared Buster worker input/invocation/effects/telemetry/log-dir/normalization helpers.
- Dynamic imports: none.
- Exports: `executeBusterWorkerAttempt` and default `executeBusterWorkerAttempt`.
- Side effects: none at module load; runtime requires the registered `worker:module_buster` stage handler, ensures plugin log dirs, creates plugin context/effects, mutates active-agent status on dispatch/finalize, saves status, executes the worker, normalizes/projects control results, and emits terminal fail telemetry on execution errors.
- Globals/coupling: coupled to plugin registry owner `worker.execute`/`worker:module_buster`, PluginContextV1 envelope/effects, mutable `completionIdentity`, module active-agent status shape, worker-control compatibility result shape, and diagnostics on thrown contract errors.

## Nova module Forge/pre-Buster phases and pipeline runner control loop

### `skills/nova/pipeline/runners/module-runner-forge.ts`
- Incoming callers/importers: `runners/module-runner/state-machine.ts` imports `runModuleForgePhase` and `finalizeForgeOnlyPass` for Forge and Forge-only module attempts.
- Outgoing static imports: Nova plugin context/envelope, constants/logger/runtime/registry, ACP monitor transcript progress helper, correlation helpers, rate-limit finalizer, validator-control contract, lifecycle-state mutation helpers, telemetry hooks, Git soft-fail observability, module-runner shared helpers, worker-control contract, Forge preflight, terminal result builders, and Discord identity fields.
- Dynamic imports: none.
- Exports: `runModuleForgePhase`, `finalizeForgeOnlyPass`.
- Side effects: none at module load; runtime mutates module status/validation/active-agent state, saves prompts/status, dispatches `worker:module_forge`, emits module/phase/operator telemetry and Discord, commits Forge-only output in soft-fail mode, and updates run stats.
- Globals/coupling: coupled to plugin registry owner `worker:module_forge`, Forge worker poll reasons, status validation shape, ACP transcript semantics, module retry budget, rate-limit pause policy, Discord identity surfaces, Git commit/push side effects, and typed worker-control result shapes.

### `skills/nova/pipeline/runners/module-runner-prebuster.ts`
- Incoming callers/importers: `runners/module-runner/state-machine.ts` imports `prepareModuleForBuster` between Forge and Buster phases.
- Outgoing static imports: Nova plugin context/envelope, constants/logger/runtime/registry, status correlation helpers, contract diagnostics, validator-control contract, lifecycle-state transition helper, telemetry operator alert, module-runner shared validator helpers, terminal retry builder, and Discord identity fields.
- Dynamic imports: none.
- Exports: `prepareModuleForBuster`.
- Side effects: none at module load; runtime may promote Buster-only modules to `READY_FOR_TESTING`, invoke registry validators, emit Discord warnings, mutate validation milestones, save status, call failure/retry handling, and run Git sync before Buster.
- Globals/coupling: coupled to `validator:delivery_lint` and `validator:pre_check` stage owners, module status/validation milestone fields, `mod.stages`, Buster-only run semantics, Git sync dependency, and validator-control result diagnostics.

### `skills/nova/pipeline/runners/module-runner-shared.ts`
- Incoming callers/importers: Forge/pre-Buster/Buster module phases, module-attempt state-machine, Buster worker bridge, and Buster-phase terminal handlers import telemetry, timing, validation, plugin-input, and result-normalization helpers.
- Outgoing static imports: Node `fs`/`path`; active logger context, constants/runtime/path helpers, correlation helpers, worker-control and pipeline-step contracts, serialization, orchestration worker functions/coercers, telemetry hooks, and stage-envelope primitives.
- Dynamic imports: none.
- Exports: telemetry context/timing/current-attempt/validation/log-scope helpers; terminal telemetry builders; module step-result builder; worker plugin effects; Forge/Buster/validator run-input and plugin-invocation builders; Forge/Buster worker result normalizers.
- Side effects: none at module load; runtime can create plugin log directories and mutate config `_logDir`/`_runLogDir` compatibility fields.
- Globals/coupling: coupled to mutable config runtime fields, status path layout, typed PipelineStepResult construction, worker-control normalization/coercion contracts, artifact ref existence filtering, default module stages, and active logger context.

### `skills/nova/pipeline/runners/module-runner.ts`
- Incoming callers/importers: `pipeline-runner-deps.js` imports `runModule`; public module-runner imports may use the default export.
- Outgoing static imports: Nova logger, retry-scheduled telemetry, module-runner shared telemetry/step/log helpers, and module-attempt context/dependency/execution helpers.
- Dynamic imports: none.
- Exports: named/default `runModule`.
- Side effects: none at module load; runtime logs module banner, runs the module attempt retry loop, emits retry-scheduled telemetry, sleeps between retries, and projects final results to a pipeline step result.
- Globals/coupling: coupled to module attempt retry envelopes, `max_fails`, module title/stages, scoped dependency overrides, sleep budget/signal opts, and typed module step-result construction.

### `skills/nova/pipeline/runners/pipeline-runner-deps.ts`
- Incoming callers/importers: `pipeline-runner.ts`, `pipeline-runner-start.js`, `pipeline-runner-terminal.js`, and `pipeline-runner-loop.js` import `getPipelineRunnerDeps`.
- Outgoing static imports: dependency selector, status-store readers, failure injection, Discord integration, runtime output, module/gate runners, blueprint control helpers, and summary/case-study generators.
- Dynamic imports: none.
- Exports: `DEFAULT_PIPELINE_RUNNER_DEPS`, `getPipelineRunnerDeps`.
- Side effects: none; defines default dependency table.
- Globals/coupling: central injection seam for pipeline runner behavior and tests/harnesses; couples runner orchestration to module/gate runners, status-store, blueprint, output, Discord, and summary generation.

### `skills/nova/pipeline/runners/pipeline-runner-lock.ts`
- Incoming callers/importers: `pipeline-runner-recovery.js` re-exports `PIPELINE_RUN_CONCURRENCY_LIMIT`, `acquirePipelineRunLock`, and `releasePipelineRunLock`.
- Outgoing static imports: Node `fs`/`os`/`path`; Nova logger; durable operator alert telemetry.
- Dynamic imports: none.
- Exports: `PIPELINE_RUN_CONCURRENCY_LIMIT`, `acquirePipelineRunLock`, `releasePipelineRunLock`.
- Side effects: none at module load; runtime creates/removes `active-run.lock.json`, writes heartbeat updates, reclaims expired locks, and appends durable operator alerts for conflicts, malformed locks, lost ownership, and release errors.
- Globals/coupling: coupled to `config.paths.swarm_dir`, process pid/hostname/cwd, schema-versioned lock JSON, lease/heartbeat config values, filesystem atomic rename semantics, and manual cleanup operator workflow.

### `skills/nova/pipeline/runners/pipeline-runner-loop.ts`
- Incoming callers/importers: `pipeline-runner.ts` imports `runPipelineLoop` and re-exports loop helpers.
- Outgoing static imports: scheduled validator runner/projection/completion/find-next helpers, pipeline runner deps, and pipeline state machine.
- Dynamic imports: none.
- Exports: `runValidatorStep`, `runPipelineLoop`.
- Side effects: none at module load; runtime executes scheduled validators, marks successful scheduled validators complete, and delegates the main loop to the state machine.
- Globals/coupling: coupled to scheduling metadata shape, validator-control-to-step projection, scheduled validator completion records, and pipeline state-machine contract.

### `skills/nova/pipeline/runners/pipeline-runner-recovery.ts`
- Incoming callers/importers: `pipeline-runner.ts` imports stale module/gate reconciliation and re-exports lock helpers from this file.
- Outgoing static imports: Node `fs`/`path`; Discord identity fields; logger; status-store load/save/lifecycle appenders; gate active-session recovery evidence; Discord integration; telemetry durable/module-status hooks; ACP observability; session termination; shutdown reaper; lifecycle-state retry/intent/transition helpers; failure semantics; pipeline runner shared gate-type helper; correlation helpers; session authority policy; re-exports pipeline-runner-lock.
- Dynamic imports: none.
- Exports: lock helper re-exports, `reconcileStaleModuleState`, `reconcileStaleGateSessions`.
- Side effects: none at module load; runtime inspects module statuses and gate active-session evidence, monitors or terminates stale sessions, records blocked or recovered lifecycle events, mutates/saves module status, removes stale gate active-session files, emits Discord notices, and may throw to block unsafe recovery.
- Globals/coupling: coupled to persisted module status/active-agent shape, gate active-session files, ACP monitor states, session authority confirmation policy, stale age threshold, lifecycle event schema, Discord operator presentation, and cleanup confirmation timeouts. Age alone is diagnostic only; module retry recovery requires typed session evidence and otherwise leaves status unchanged with durable operator evidence.

### `skills/nova/pipeline/runners/pipeline-runner-scheduling/snapshots.ts`
- Incoming callers/importers: `pipeline-runner-scheduling.js` imports `countByStatus` and `buildGeneratorArtifactRefs` for scheduling/generator snapshots.
- Outgoing static imports: Node `path`; stage-envelope `collectExistingArtifactRefs`.
- Dynamic imports: none.
- Exports: `countByStatus`, `buildGeneratorArtifactRefs`.
- Side effects: none; pure counting/artifact-ref helpers.
- Globals/coupling: coupled to pipeline log directory layout and summary artifact names `summary.json`/`latest.json`.


## Nova pipeline runner scheduling, terminal flow, remediable gates, and review fix-cycle

### `skills/nova/pipeline/runners/pipeline-runner-scheduling/validator-completions.ts`
- Incoming callers/importers: `pipeline-runner-scheduling.js` imports and re-exports `isScheduledValidatorComplete` and `markScheduledValidatorComplete`.
- Outgoing static imports: Node `fs`, `path`; Nova `core/logger.ts`, `core/runtime.ts`.
- Dynamic imports: none.
- Exports: `scheduledValidatorCompletionPath`, `markScheduledValidatorComplete`, `isScheduledValidatorComplete`.
- Side effects: reads/writes `scheduled-validator-completions.json` through atomic temp/rename when completion markers are loaded or saved; mutates `config._validatorRunState` cache. JSON read/parse failures throw a repair-required error rather than returning an empty completion set.
- Globals/coupling: coupled to mutable config run/log-dir aliases, run id resolution, JSON completion schema `v1`, and filesystem durability for scheduled validator idempotency.

### `skills/nova/pipeline/runners/pipeline-runner-scheduling.ts`
- Incoming callers/importers: behavior/contract harnesses import scheduling helpers directly; `pipeline-runner-loop.js` imports scheduled validator projection/completion/find-next helpers; `pipeline-runner-start.js` imports `preparePipeline` and scheduled architecture validator runner; `pipeline-runner-terminal.js` imports scheduled generator runner.
- Outgoing static imports: Nova logger, plugin context/envelope, constants/runtime/registry, contract diagnostics, architecture/module validator contracts, generator contract, blueprint control files, pipeline-step contract, pipeline-runner shared helpers, stage-envelope primitives, scheduling snapshots, and validator-completion store.
- Dynamic imports: none.
- Exports: re-exported scheduled validator completion helpers; `projectValidatorControlResultToStepResult`, `validateGeneratorExecutionResult`, `runScheduledValidator`, `runScheduledGenerator`, `resolveConfiguredValidatorSchedule`, `findNextStep`, `preparePipeline`.
- Side effects: runtime invokes registered validator/generator plugins, logs degraded registry/execution failures, marks no state itself except via called completion helpers, and performs non-authoritative gate-file release/control-file sync in `preparePipeline` while preserving failures in typed startup degraded evidence.
- Globals/coupling: coupled to `progress.execution_order`, `progress.validators.schedule`, plugin registry stage owners, typed validator/generator contracts, typed pipeline-step results, gate scheduler read models, mandatory review full-lint policy, and blueprint control files. Unknown execution-order targets fail validation unless they resolve to a typed module, gate, or validator.

### `skills/nova/pipeline/runners/pipeline-runner-shared.ts`
- Incoming callers/importers: `pipeline-runner.ts`, `pipeline-runner-scheduling.js`, `pipeline-runner-start.js`, `pipeline-runner-terminal.js`, and `pipeline-runner-recovery.js` import gate/module projection, telemetry context, and halt/escalation helpers.
- Outgoing static imports: active logger context; status-store read-model projectors; constants; pipeline-step contract; correlation helpers.
- Dynamic imports: none.
- Exports: `_telemetryCtx`, gate-type resolvers, halt/escalation payload builders, scheduler state projectors, module status/read-model helpers, started-module detection, blocked-module step result builder, and `buildResultWithStepCorrelation`.
- Side effects: none at module load; helper calls may load module status through injected/default status-store readers.
- Globals/coupling: coupled to active logger context, status-store scheduler read models, legacy module status fields, rate-limit correlation aliases, typed pipeline-step results, and the pipeline halt correlation boundary.

### `skills/nova/pipeline/runners/pipeline-runner-start.ts`
- Incoming callers/importers: `pipeline-runner.ts` imports and re-exports `startPipelineRun`, `runSingleModulePipeline`, and `preparePipelineStart`.
- Outgoing static imports: Node `fs`, `path`; Discord identity fields, logger, status-store lifecycle appender, path/runtime constants, architecture validator, telemetry/observability/governance/rate-limit/correlation services, pipeline-runner shared helpers, scheduling helpers, terminal helpers, and runner dependency table.
- Dynamic imports: none.
- Exports: `startPipelineRun`, `runSingleModulePipeline`, `preparePipelineStart`.
- Side effects: initializes run log directories for programmatic callers, writes config-validation snapshots, logs pipeline banner, appends lifecycle events, emits telemetry/Discord/operator alerts, records governance architecture validation results, outputs terminal JSON, writes summaries/cost reports, and may run a single module.
- Globals/coupling: coupled to mutable config `_logDir`/`_runLogDir`/`_progress`, pipeline run log layout, Discord identity surfaces, architecture validation policy, single-module mode, and runner dependency injection.

### `skills/nova/pipeline/runners/pipeline-runner-state-machine.ts`
- Incoming callers/importers: `pipeline-runner-loop.js` imports `runPipelineStateMachine`.
- Outgoing static imports: durable rate-limit cooldown service and pipeline terminal helpers.
- Dynamic imports: none.
- Exports: `PIPELINE_RUNNER_ACTIONS`, `planPipelineStep`, `runPipelineStateMachine`.
- Side effects: none at module load; runtime resumes durable cooldown and dispatches planned validator/gate/module work through injected dependencies until complete or halt.
- Globals/coupling: coupled to `findNextStep` result shape, runner dependency table, and terminal result normalization. The state machine requires explicit `done`/`blocked`/`validator`/`gate`/`module` step kinds and rejects unknown or missing kinds.

### `skills/nova/pipeline/runners/pipeline-runner-terminal.ts`
- Incoming callers/importers: `pipeline-runner.ts`, `pipeline-runner-start.js`, and `pipeline-runner-state-machine.js` import terminal normalization/finalization helpers.
- Outgoing static imports: Node `path`; Discord identity fields, logger, status-store lifecycle/read models, constants, telemetry/observability/correlation services, pipeline-step contract, pipeline-runner shared helpers, scheduling generator runner, and runner dependency table.
- Dynamic imports: none.
- Exports: `normalizeStepResultForPipeline`, `emitPipelineSummaryLifecycle`, `finalizeTerminalHalt`, `completePipeline`, `haltPipeline`.
- Side effects: appends terminal lifecycle events, emits operator alerts/escalation/pipeline summary telemetry, injects NEEDS_NOVA for selected exits, writes summaries/cost reports, outputs terminal JSON, and runs project summary/review/case-study generators on terminal states.
- Globals/coupling: coupled to typed `pipeline_step_result` authority, terminal exit derivation, Discord/operator presentation, terminal lifecycle idempotency, scheduled generators, status-store read models, and exit-code label policy.

### `skills/nova/pipeline/runners/pipeline-runner.ts`
- Incoming callers/importers: `pipeline/index.ts` re-exports `runPipeline` and default; `cli.ts` imports `runPipeline`, `printStatus`, and `dryRun`.
- Outgoing static imports: logger/runtime output/constants, pipeline-runner shared/scheduling/recovery/deps/start/loop helpers, agent-observability ingester, and OpenClaw plugin controller.
- Dynamic imports: none.
- Exports: lock helper re-exports, terminal/start/loop helper re-exports, `validateGeneratorExecutionResult`, `runScheduledGenerator`, `findNextStep`, `runPipeline`, `printStatus`, `dryRun`, and default `runPipeline`.
- Side effects: runtime acquires/releases pipeline run lock, starts/stops OpenClaw agent observer plugin and observability ingester, reconciles stale module/gate state, starts pipeline lifecycle, runs single-module or full loop, prints status, and logs dry-run output.
- Globals/coupling: public runner facade coupled to CLI/index surfaces, lock/recovery policy, plugin observer lifecycle, progress execution order, status-store projections, and fallback model resolution for dry-run display.

### `skills/nova/pipeline/runners/remediable-gate-engine.ts`
- Incoming callers/importers: `gate-runner.js` imports `runScheduledRemediableGate`.
- Outgoing static imports: Node `fs`, `path`; plugin context/registry, pipeline paths, and remediation handoff helpers.
- Dynamic imports: none.
- Exports: `runRemediableGateControlLoopResult`, `runScheduledRemediableGate`.
- Side effects: ensures run log dirs for gate plugin execution, invokes registered `gate.execute` plugin handlers, and runs remediation/fix/evaluate loops through the resolved controller.
- Globals/coupling: coupled to mutable config log-dir aliases, `gate.execute` registry, typed gate remediation control results, typed fix outcome union, remediation policy cycle counters, degraded fix outcome evidence, and gate id/type identity fields.

### `skills/nova/pipeline/runners/review-gate-control.ts`
- Incoming callers/importers: `review-gate-runner.ts` imports review typed-control builders/coercers and remediation request helper.
- Outgoing static imports: constants, runtime run-id helper, typed gate-control contract, remediation handoff, correlation helpers, and review output parsing/summarization.
- Dynamic imports: none.
- Exports: `buildReviewGateControlResult`, `isReviewGateControlResult`, `coerceReviewGateControlResult`, `buildReviewRequestFixControlResult`.
- Side effects: none; pure projection helpers.
- Globals/coupling: coupled to review compatibility result shape, `rate_limit_status` aliases, review issue extraction, explicit reviewer identity, typed primary-reviewer policy, remediation max-cycle policy, and typed gate-control/remediation contracts.

### `skills/nova/pipeline/runners/review-gate-fix-cycle.ts`
- Incoming callers/importers: `review-gate-runner.ts` imports `performReviewGateFixAttempt`.
- Outgoing static imports: logger, runtime run-id helper, Discord identity surface constants, failure truncation, remediation handoff reader, review prompt builder, prompt-ingress formatting, and shared gate Forge fix-cycle runner.
- Dynamic imports: none.
- Exports: `performReviewGateFixAttempt`.
- Side effects: logs review fix-cycle progress, optionally injects operator remediation directive into Forge prompt, delegates Forge spawning/polling/Git/Discord side effects to `runGateForgeFixCycle`, and runs review cleanup callback after a successful fix.
- Globals/coupling: coupled to review gate config, remediation diagnostics/correlation, Forge fix-cycle policy, Discord gate-session presentation, prompt format, rate-limit typed-control mapping, and review cleanup callbacks.

## Nova review gate execution, waitable gate helpers, shared facades, adapter registry, and agent-observability evidence comparator

### `skills/nova/pipeline/runners/review-gate-output.ts`
- Incoming callers/importers: `runners/review-gate-runner.ts`, `runners/review-gate-task.ts`, and `runners/review-gate-control.ts` import review issue extraction, findings, summaries, and output parsing helpers.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: `extractReviewIssues`, `summarizeReviewNoGoReason`, `buildReviewGateFindings`, `parseReviewOutputContent`.
- Side effects: none; module is intentionally pure and owns only normalization/parsing.
- Globals/coupling: review output contract status is canonical `GO`/`NO-GO` at the typed runner boundary, while issue arrays (`critical_issues`, `critical_blockers`) still normalize at the adapter edge for gate-control finding shape.

### `skills/nova/pipeline/runners/review-gate-runner.ts`
- Incoming callers/importers: `core/registry/builtins.ts` imports `runReviewGateStage` and `getReviewGateControlAdapter`; previous review remediation/fix-cycle modules feed control results back through exported helpers; docs reference it as the review gate lifecycle module.
- Outgoing static imports: Node `fs`, `path`; Nova deps/logger/constants/runtime/config/paths/git-context; Discord and Git worktree integrations; status-store, failures, polling, lint, telemetry, rate-limit, correlation, Discord fields, remediation-handoff, gate-control contract; review prompts; agent orchestration/lifecycle; review output/control/fix-cycle/task modules.
- Dynamic imports: none.
- Exports: `buildReviewRemediationExhaustedControlResult`, `runReviewGateEvaluation`, `runReviewGateFixAttempt`, `createReviewGateRemediationController`, `getReviewGateControlAdapter`, `runReviewGateStage`.
- Side effects: during execution reads/deletes/commits review output files, emits telemetry/Discord, spawns or delegates Echo/Forge gate work, updates run stats, archives stale gate output, and may return terminal gate-control results.
- Globals/coupling: coupled to `progress.gates`, typed review defaults (`timeout_minutes`, `max_fix_cycles`, `lint_tier`, `lint_required`), explicit/single primary-reviewer policy, gate output paths, run stats, ACP session correlation, typed gate-control/remediation contracts, Echo reviewer behavior, Forge fix-cycle policy, and Git worktree cleanliness for re-review polling.

### `skills/nova/pipeline/runners/review-gate-task.ts`
- Incoming callers/importers: `runners/review-gate-runner.ts` imports `runReviewGateOnce`, `reviewOutputPath`, and `describeReviewTranscriptActivityState`.
- Outgoing static imports: Node `fs`, `path`; Nova logger/constants/runtime/paths; rate-limit recovery, correlation, redaction, ACP monitor, gate-active-session, Discord fields, Git soft-fail observability, durable operator alerts; review output parser.
- Dynamic imports: none.
- Exports: `reviewOutputPath`, `describeReviewTranscriptActivityState`, `runReviewGateOnce`.
- Side effects: creates review/lint log dirs, writes lint and redacted prompt artifacts, archives/unlinks stale review output, spawns/polls/kills Echo reviewer sessions, persists/clears gate active-session evidence, copies redacted transcripts, sends Discord completion messages, commits/pushes review output with soft-fail handling that fails/degrades review publication, copies merged gate output, and parses the reviewer JSON file.
- Globals/coupling: typed primary reviewer is used; required review lint failures become `review_lint_setup_failed`, review artifact fan-out failures emit `review_artifact_write_failed` without overriding verdicts, and the task remains coupled to `config._logDir`, gate lint/log/output paths, rate-limit cooldown config, tracked-agent keys (`echo-<label>-<gateId>`), ACP monitor transcript shape, Git soft-fail observability, and review JSON contract.

### `skills/nova/pipeline/runners/stage-envelope-primitives.ts`
- Incoming callers/importers: `runners/gate-runner.ts`, `runners/pipeline-runner-scheduling.ts`, `runners/module-runner-shared.ts`, and `runners/pipeline-runner-scheduling/snapshots.ts` import stage ref/invocation/artifact helpers.
- Outgoing static imports: Node `fs`.
- Dynamic imports: none.
- Exports: `buildStageRefs`, `buildStagePluginInvocation`, `collectExistingArtifactRefs`.
- Side effects: `collectExistingArtifactRefs` probes filesystem existence through `fs.existsSync` by default; other helpers are pure.
- Globals/coupling: stage refs are stringly typed `prefix:part...` values but malformed ref specs now throw instead of being silently omitted; artifact refs depend on caller-provided path shape and remain materialized-only.

### `skills/nova/pipeline/runners/waitable-gate-engine.ts`
- Incoming callers/importers: `runners/gate-runner.ts` imports `runScheduledWaitableGate`; no other runtime import found in pipeline source.
- Outgoing static imports: Nova plugin context and registry.
- Dynamic imports: none.
- Exports: `validateGateWaitController`, `resolveGateWaitController`, `runWaitableGateControlLoopResult`, `runScheduledWaitableGate`.
- Side effects: dispatches registered `gate.execute` plugin handlers, may call a wait controller, and tags thrown wait-loop errors with `error.gateStageStarted = true`.
- Globals/coupling: requires registry-backed stage handlers, PluginContext envelopes, typed wait-controller contract, gate-control `nextAction === 'wait'`, and gateStageStarted error tagging.

### `skills/nova/pipeline/security.ts`
- Incoming callers/importers: Nova `agents/orchestration.ts`, `agents/shutdown.js`, `integrations/git-worktree.ts`, `services/blueprint.ts`, `services/lint.js`, `tools/project-summary.ts`, and lint-report execution import shared security helpers through this facade.
- Outgoing static imports: re-exports `../../common/pipeline/security.ts`.
- Dynamic imports: none.
- Exports: all shared security helper exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: repo-local facade over common path/command/subprocess security authority.

### `skills/nova/pipeline/services/acp-gateway-contract.ts`
- Incoming callers/importers: Nova `services/summary-session-cleanup.ts` imports session termination contract validation; common and Buster surfaces also own their own facades.
- Outgoing static imports: re-exports `../../../common/pipeline/services/acp-gateway-contract.ts`.
- Dynamic imports: none.
- Exports: all shared ACP Gateway contract exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: repo-local facade over common Gateway/session contract authority.

### `skills/nova/pipeline/services/acp-observability.ts`
- Incoming callers/importers: `runners/pipeline-runner-recovery.js` calls `observeAcpMonitorSurfaces` while reconciling stale module and gate active sessions.
- Outgoing static imports: Nova active logger context, ACP monitor state, telemetry gateway/transcript observability updaters, shared timing sleep.
- Dynamic imports: none.
- Exports: `observeAcpMonitorSurfaces`.
- Side effects: polls ACP monitor state, mutates supplied/default gateway and transcript observability state objects through telemetry updaters, and sleeps between polls.
- Globals/coupling: accepts snake_case/camelCase identity aliases, default poll budget (`maxPolls=3`, `pollMs=250`), ACP monitor detail fields, and telemetry degraded/restored state machines.

### `skills/nova/pipeline/services/adapter-registry.ts`
- Incoming callers/importers: `agents/orchestration.ts` and `services/polling-redis-completion.js` resolve Redis adapters; `services/summary/project-summary.ts` resolves the project-summary generator; tooling can call `listRegisteredAdapters`.
- Outgoing static imports: Node `path`, `url.fileURLToPath`; Nova deps selector; Nova Redis tool; Nova project-summary generator.
- Dynamic imports: none.
- Exports: `UnknownAdapterError`, `resolveRegisteredRedisAdapter`, `resolveRegisteredProjectSummaryGenerator`, `listRegisteredAdapters`.
- Side effects: computes canonical adapter paths and builds static adapter maps at module load; resolution itself validates methods and throws fail-closed for unknown adapters.
- Globals/coupling: static allowlist includes canonical keys and production `/app/skills/pipeline/...` path aliases; reads `config.agents[*].redis_*` and `config.paths.project_summary_*` adapter fields plus injected deps overrides.

### `skills/nova/pipeline/services/agent-observability-evidence/comparator.ts`
- Incoming callers/importers: `services/agent-observability-evidence/index.ts` re-exports `compareAgentObservabilityParallelRunEvidence`; no direct JS runtime importer found in this batch search.
- Outgoing static imports: Type-only agent-observability ingress contracts from the Nova role facade and comparator evidence types from `./types.ts`.
- Dynamic imports: none.
- Exports: `compareAgentObservabilityParallelRunEvidence`.
- Side effects: none; pure TypeScript comparator.
- Globals/coupling: maps OpenClaw hook event names to evidence record types, compares hook evidence with legacy ACP gateway polling records, applies fixed timing/Redis pressure defaults, and builds identity keys from run/session/dispatch/gateway/tool/model/module/gate/agent fields.

## Nova agent-observability ingester, Forge completion authority, and approval signal adapter

### `skills/nova/pipeline/services/agent-observability-evidence/index.ts`
- Incoming callers/importers: no direct JS runtime importer found in pipeline source; this is the package surface for the evidence comparator island.
- Outgoing static imports: re-exports `./types.ts` and `compareAgentObservabilityParallelRunEvidence` from `./comparator.ts`.
- Dynamic imports: none.
- Exports: all evidence types plus `compareAgentObservabilityParallelRunEvidence`.
- Side effects: none beyond re-export loading.
- Globals/coupling: direct `.ts` re-export surface for the Nova evidence TypeScript island.

### `skills/nova/pipeline/services/agent-observability-evidence/types.ts`
- Incoming callers/importers: `services/agent-observability-evidence/index.ts` re-exports it; `comparator.ts` imports these evidence types.
- Outgoing static imports: type-only `AgentObservabilityIngressEventV1` from the Nova/common agent-observability contract index.
- Dynamic imports: none.
- Exports: evidence severity/record/identity/legacy/Redis-pressure/input/options/normalized/issue/summary/report TypeScript types.
- Side effects: none; type-only module.
- Globals/coupling: evidence shape is coupled to hook ingress events, legacy ACP polling records, and Redis pressure summary fields.

### `skills/nova/pipeline/services/agent-observability-forge-completion.ts`
- Incoming callers/importers: `services/polling.js` imports Forge completion constants, diff collection, status construction, identity matching/building, telemetry-reader creation, and settle timing helpers for `pollForgeCompletion`.
- Outgoing static imports: Node `path`; Nova `STATUS`, `getRunId`, Git worktree helpers, telemetry Redis helpers, and telemetry stream-key helper.
- Dynamic imports: none.
- Exports: agent-observability Forge completion source/reason constants, `isForgeCompletionControlPath`, `collectMeaningfulForgeDiffEvidence`, `buildForgeCompletionStatusFromDiff`, `matchesForgeAgentEndedTelemetry`, `buildForgeAgentEndedIdentity`, `createAgentEndedTelemetryReader`, `shouldSettleAgentEnded`, `agentEndedSettleMs`.
- Side effects: exported helpers may invalidate/read Git HEAD and status, run Redis `XREAD`, open/close Redis clients, and suppress Redis client errors; no work starts at module load.
- Globals/coupling: canonical Forge readiness is `agent.ended` telemetry plus meaningful Git diff; ignores runtime/control paths (`.swarm/`, `logs/`, `forge-completion.json`, `status.json`); coupled to run/project telemetry stream identity and mixed camel/snake/tracked-agent identity fields.

### `skills/nova/pipeline/services/agent-observability-ingester/config.ts`
- Incoming callers/importers: `consumer.ts` imports the resolver and type; `index.ts` re-exports both.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: `AgentObservabilityIngesterConfig`, `resolveAgentObservabilityIngesterConfig`.
- Side effects: none.
- Globals/coupling: reads `process.env` by default for Redis settings; default consumer group/name, timeouts, stream caps, and pressure thresholds are embedded in the resolver.

### `skills/nova/pipeline/services/agent-observability-ingester/consumer.ts`
- Incoming callers/importers: `agent-observability-ingester/index.ts` imports/re-exports the class and types; `agent-observability-runtime.ts` reaches it through the index factory.
- Outgoing static imports: agent-observability stream constants/validation/routing, Nova Redis transport, telemetry dispatch, observability degraded/restored reporters, ingester config, mapper, and usage aggregation.
- Dynamic imports: none.
- Exports: `AgentObservabilityIngester`, `AgentObservabilityIngesterOptions`, `AgentObservabilityIngesterStats`, `AgentObservabilityPressureStatus`.
- Side effects: methods create Redis clients, create/read/reclaim consumer-group entries, emit telemetry events, ACK/dead-letter records, trim streams, report degraded/restored pressure, and can start a background loop.
- Globals/coupling: defaults to `console`, fail-closed Redis method checks, common ingress-event validation, control-vs-payload stream routing, telemetry dispatch validation response shape, and model usage snapshot side effects.

### `skills/nova/pipeline/services/agent-observability-ingester/index.ts`
- Incoming callers/importers: `services/agent-observability-runtime.ts` imports `createAgentObservabilityIngester`; no other runtime importer found in pipeline source.
- Outgoing static imports: `./consumer.ts`, `./config.ts`, `./mapper.ts`.
- Dynamic imports: none.
- Exports: config resolver/type, telemetry mapper/type, ingester class/types, and `createAgentObservabilityIngester`.
- Side effects: none beyond imported module loading; factory constructs an ingester instance.
- Globals/coupling: TypeScript package surface over the ingester implementation.

### `skills/nova/pipeline/services/agent-observability-ingester/mapper.ts`
- Incoming callers/importers: `consumer.ts` imports `mapAgentObservabilityEventToTelemetry`; `index.ts` re-exports mapper API.
- Outgoing static imports: agent-observability telemetry mapping and ingress/json types from the Nova/common contract index.
- Dynamic imports: none.
- Exports: `AgentObservabilityTelemetryEmission`, `AgentObservabilityMapperOptions`, `mapAgentObservabilityEventToTelemetry`.
- Side effects: none; pure mapping helpers.
- Globals/coupling: maps OpenClaw hook event taxonomy to current telemetry event names, uses `TextEncoder` for payload sizing, preserves identity aliases, and normalizes usage token/cost aliases.

### `skills/nova/pipeline/services/agent-observability-ingester/usage-aggregation.ts`
- Incoming callers/importers: `consumer.ts` imports `prepareModelUsageAggregate` and `commitModelUsageSnapshot`; `modelUsageAggregateDetails` has no runtime caller found in pipeline source.
- Outgoing static imports: agent-observability types and Nova observability `aggregateUsage`/`recordUsageSnapshot`.
- Dynamic imports: none.
- Exports: `ModelUsageAggregateProjection`, `prepareModelUsageAggregate`, `commitModelUsageSnapshot`, `modelUsageAggregateDetails`.
- Side effects: `commitModelUsageSnapshot` writes a usage snapshot through observability; other helpers are pure reads/projections.
- Globals/coupling: requires `ctx.config`, reads existing run aggregate usage, accepts usage token aliases, and falls back agent identity to `agent_id`/`unknown`.

### `skills/nova/pipeline/services/agent-observability-runtime.ts`
- Incoming callers/importers: `runners/pipeline-runner.ts` starts this sidecar during `runPipeline` and stops it in `finally`.
- Outgoing static imports: Nova logger and `createAgentObservabilityIngester` from the ingester TypeScript index.
- Dynamic imports: none.
- Exports: `startAgentObservabilityIngester`.
- Side effects: when enabled, starts an async polling loop, emits INFO/WARN logs, calls ingester process/pressure/trim methods, and stops/awaits ingester shutdown.
- Globals/coupling: reads `config.agent_observability.ingester`, passes `process.env`, defaults loop delay/health cadence, and returns a no-op controller when disabled.

### `skills/nova/pipeline/services/approval-signal-event-adapter.ts`
- Incoming callers/importers: `runners/approval-gate-runner.js` uses `createApprovalSignalEventAdapter` by default during approval waits; tests/deps may inject replacements through `deps.createSignalAdapter`.
- Outgoing static imports: Node `fs`, `path`; Nova gate status path, pipeline event contract, and approval gate shared status/identity/normalization helpers.
- Dynamic imports: none.
- Exports: `DEFAULT_APPROVAL_SIGNAL_DEBOUNCE_MS`, `buildApprovalSignalEvent`, `emitApprovalSignalEvent`, `createApprovalSignalEventAdapter`.
- Side effects: adapter start creates `fs.watch` watchers, debounces file changes, reads approval state JSON, emits `approval.signal` or `fatal.error` events, closes watchers/timers on stop, and respects external abort signals.
- Globals/coupling: filesystem edge adapter over canonical EventBus events; coupled to approval gate state file location, terminal approval statuses, timeout policy normalization, `AbortController`, and mixed `_runId`/`run_id` config identity.

## Nova architecture validation, artifact surfaces, blueprint sync, and Buster completion controller

### `skills/nova/pipeline/services/arch-validator-checks.ts`
- Incoming callers/importers: `services/arch-validator.js` imports constants, finding factory, and `runDeterministicArchitectureChecks`.
- Outgoing static imports: Node `fs`, `path`; Nova path helpers `gateInstructionsPath`, `moduleBusterMdPath`, `modulePath` from `../core/paths.ts`.
- Dynamic imports: none.
- Exports: `SEVERITY`, `SCOPE`, `FINDING_CODES`, `makeFinding`, deterministic check functions, and `runDeterministicArchitectureChecks`.
- Side effects: none beyond constant/object initialization; checks synchronously read module/gate/test-spec files when called.
- Globals/coupling: coupled to `progress.json` module/gate/validator schedule shapes, `.swarm` path helpers, filesystem presence/JSON parsing, deprecated model config policy, and stable finding-code strings.

### `skills/nova/pipeline/services/arch-validator.ts`
- Incoming callers/importers: `core/registry/builtins.ts` imports `runArchitectureValidatorStage`; `runners/pipeline-runner-scheduling.js` imports the architecture control-result helpers; `runners/pipeline-runner-start.js` and `services/governance-context.js` import `extractArchValidatorReport`.
- Outgoing static imports: Node `fs`, `path`; Nova `log`, `getRunId`, Gateway completion, policy resolution/audit, redacted prompt artifact writing, and `./arch-validator-checks.js`.
- Dynamic imports: none.
- Exports: finding constants plus prompt/artifact/control-result/report helpers, `isBlocking`, `runArchValidator`, and `runArchitectureValidatorStage`.
- Side effects: none at module load; execution logs, optionally calls Gateway prompt completion, writes architecture-validator artifacts, and emits fail-closed control results.
- Globals/coupling: coupled to `config._logDir`, `config._runId`/`run_id`, policy scope `arch_validator`, Gateway response shapes, typed validator control-result schema, and redaction/logging surfaces.

### `skills/nova/pipeline/services/artifact-bundle.ts`
- Incoming callers/importers: `core/context.ts` imports `createPluginArtifactsApi`; `services/status-store.js` imports `buildLatestPointer`; `services/summary.js` imports `buildLatestPointer`, `buildSummaryArtifactBundle`, and `getPipelineArtifactBundle`; `services/failures/presentation.js` imports `getPipelineArtifactBundle`.
- Outgoing static imports: Node `fs`, `path`; Nova runtime id/effect helpers, safe-path validator, plain-object validator, and telemetry stream key helper.
- Dynamic imports: none.
- Exports: artifact authority role/surface constants, artifact surface classification/policy/evidence projectors, pipeline/plugin/summary bundle builders, latest pointer builder, and plugin artifacts API factory.
- Side effects: none at module load; plugin artifact API reads/writes per-run artifact indexes and copies/persists plugin artifact payloads when called.
- Globals/coupling: coupled to `config._runId`, `_runLogDir`, `_logDir`, `repo_root`, run-scoped pipeline log layout, plugin invocation identity, telemetry stream key convention, and artifact authority policy fields.

### `skills/nova/pipeline/services/blueprint.ts`
- Incoming callers/importers: `cli.ts` imports `listBlueprints` and `releaseBlueprint`; `runners/module-runner/attempt.ts` injects `releaseBlueprint`; `runners/pipeline-runner-deps.js` and `runners/pipeline-runner-scheduling.js` import/use `releaseGateFiles` and `syncControlFiles`.
- Outgoing static imports: Node `fs`, `path`, `child_process.spawnSync`; Nova logger, status-store, status constants, run id, path helpers, Discord adapter, Git worktree `gitExec`, and subprocess env guard.
- Dynamic imports: none.
- Exports: `listBlueprints`, `releaseBlueprint`, `releaseGateFiles`, `syncControlFiles`.
- Side effects: no module-load side effects; functions fetch/check out from `origin/<project>/architecture`, stage/commit/pull/rebase/push selected paths, write `blueprint-sync.json`, and notify Discord.
- Globals/coupling: tightly coupled to the architecture branch naming convention, `origin` remote, module/gate control-file layout, pending module status, `.swarm` path refs, Git subprocess behavior, and non-destructive selected-path staging policy.

### `skills/nova/pipeline/services/buster-completion-controller.ts`
- Incoming callers/importers: `services/polling-dual.js` imports `waitForBusterCompletion`; `runners/buster-gate-completion.js` imports `waitForBusterCompletion` and `buildGateLocalEvidenceResolver`.
- Outgoing static imports: Nova `STATUS`, completion adjudicator, Redis completion contract validator, and pipeline event contract wait/error helpers.
- Dynamic imports: none.
- Exports: `BUSTER_COMPLETION_EVENT_TYPES`, `buildCompletionEventEntry`, `resolveBusterCompletionEvent`, `waitForBusterCompletion`, `buildGateLocalEvidenceResolver`.
- Side effects: none beyond frozen event-type initialization; waiting consumes in-process event-bus events and optional local status readers when called.
- Globals/coupling: coupled to `completion.evidence`, `local.evidence.updated`, and `fatal.error` event contracts, Redis completion schema/source values, module/gate expected status policy, AbortSignal/budget semantics, and status-store gate output projection.

## Nova case-study generation, completion authority, event adapters, and typed gate/generator contracts

### `skills/nova/pipeline/services/case-study.ts`
- Incoming callers/importers: `core/registry/builtins.ts` imports `generateCaseStudy`; `services/summary.js` re-exports case-study path/dispatch helpers and `generateCaseStudy`.
- Outgoing static imports: Node `fs`, `path`; Nova deps/logger/paths/runtime; agent runtime/lifecycle/session-termination facades; polling sleep/file polling; Discord, telemetry, redaction, correlation, rate-limit, generator-result, and summary-session cleanup services.
- Dynamic imports: none.
- Exports: `caseStudyOutputPath`, `caseStudyInstructionsPath`, `caseStudyDispatchMode`, `caseStudyAgentId`, `writeCaseStudyInstructions`, `generateCaseStudy`.
- Side effects: none at module load; when called, writes sanitized instructions, spawns/tracks/cleans a summary agent, polls output, copies redacted ACP transcript artifacts, sends Discord notices, emits summary telemetry, sanitizes output markdown, and returns a typed generator result.
- Globals/coupling: coupled to `config.case_study`, `progress.case_study`, `progress.defaults.models.echo`, `config.fallback_model`, `_logDir`, run id, swarm log layout, Discord optionality, ACP/subagent dispatch, rate-limit status shapes, and generator result contract.

### `skills/nova/pipeline/services/completion-adjudicator.ts`
- Incoming callers/importers: `services/polling.js`, `services/truth-drift.js`, and `services/buster-completion-controller.js` import completion adjudication helpers.
- Outgoing static imports: Nova status constants.
- Dynamic imports: none.
- Exports: identity field/status constants; identity normalization/diagnostic helpers; active-dispatch confirmation; Redis status/outcome/source helpers; completion state projection, drift building, evidence adjudication, and Redis-apply decision helpers.
- Side effects: none beyond constant initialization.
- Globals/coupling: coupled to Redis completion entry shapes, local `status.json` projections, strong identity fields `run_id/attempt/dispatch_id`, optional `session_key`, Buster-owned source naming, terminal status policy, and fail-closed conflict semantics.

### `skills/nova/pipeline/services/completion-event-adapters.ts`
- Incoming callers/importers: `services/polling-dual.js` imports Redis and local evidence adapter factories.
- Outgoing static imports: Node `fs`, `path`; completion stream path helper; telemetry Redis client helpers; task transport decoder; Redis envelope normalizer; pipeline event bus contract assertion.
- Dynamic imports: none.
- Exports: default debounce/block constants, `createDedicatedRedisCompletionClient`, `createRedisCompletionEventAdapter`, and `createLocalEvidenceEventAdapter`.
- Side effects: none at module load; adapters create Redis clients, block on XREAD, watch filesystem paths, and emit `completion.evidence`, `local.evidence.updated`, or `fatal.error` only after `start()`.
- Globals/coupling: coupled to Redis completion stream keys, ioredis client behavior, EventBus payload vocabulary, AbortSignal lifecycle, filesystem watcher limits/noise, and normalized Redis pipeline envelope identity.

### `skills/nova/pipeline/services/contract-diagnostics.ts`
- Incoming callers/importers: typed validator, worker, generator, and gate contract modules import `createContractInvalidError`; callers may inspect diagnostics through the exported helpers.
- Outgoing static imports: serialization helpers and Nova redaction helpers.
- Dynamic imports: none.
- Exports: `cloneSerializable`, hook-family inference, invalid-contract diagnostic builder/error factory, and invalid-contract error guards/readers.
- Side effects: none.
- Globals/coupling: coupled to plugin stage id prefixes, hook-family vocabulary, redaction/truncation policy, invocation/input ids/refs shapes, and contract-invalid error code `PLUGIN_CONTRACT_INVALID`.

### `skills/nova/pipeline/services/contracts/control-result-mapping.ts`
- Incoming callers/importers: validator control-result contract imports mapping helpers.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: `buildControlResultMapping`, `buildUnknownControlResultMapping`.
- Side effects: none.
- Globals/coupling: small shared helper for typed-control mapping; defaults unknown outcome class when no rule supplies one.

### `skills/nova/pipeline/services/contracts/gate-control-result.ts`
- Incoming callers/importers: review/buster/approval/generic gate runners and controls import gate action constants, normalizers, and validators directly; the deleted `contracts/index.js` barrel no longer re-exports this namespace.
- Outgoing static imports: remediation handoff validator; contract diagnostics; serialization clone helper.
- Dynamic imports: none.
- Exports: gate action constants, clone helper, typed gate result builders/guards/coercers, validators, normalizers, and remediable gate validators.
- Side effects: none beyond frozen mapping initialization.
- Globals/coupling: coupled to typed gate diagnostics schema, remediation contract, gate status semantics, wait control data, and remediable gate validation.

### `skills/nova/pipeline/services/contracts/generator-result.ts`
- Incoming callers/importers: `services/case-study.js`, `services/summary.js`, `services/summary/project-summary.ts`, and scheduler generator paths import generator result builders/normalizers directly with explicit `.ts` imports.
- Outgoing static imports: contract diagnostics.
- Dynamic imports: none.
- Exports: generator artifact/result builders, type guards/coercer, artifact/result validators, and `normalizeGeneratorResult`.
- Side effects: none.
- Globals/coupling: canonical typed generator plugin result schema (`schemaVersion:v1`, `producerKind:generator`, `outputs`) and contract-invalid error surface.

### `skills/nova/pipeline/services/contracts/index.ts`
- Deleted as `DELETE_LEGACY`; no direct runtime importer was found in pipeline source.
- Incoming callers/importers: none; use direct imports from owning contract modules.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: none.
- Side effects: none.
- Globals/coupling: broad public contract barrel removed so importing it cannot load adjacent contract modules.

## Nova typed step/worker/validator contracts, correlation, dependency checks, operator alerts, and failure taxonomy

### `skills/nova/pipeline/services/contracts/pipeline-step-result.ts`
- Incoming callers/importers: `runners/gate-runner.js`, `pipeline-runner-scheduling.js`, `pipeline-runner-shared.js`, `pipeline-runner-terminal.js`, and `module-runner-shared.ts` import typed step result helpers directly; the deleted `services/contracts/index.js` barrel no longer re-exports this namespace.
- Outgoing static imports: Nova `core/constants.ts`; `services/serialization.ts`.
- Dynamic imports: none.
- Exports: pipeline step schema/kind/type/action/outcome/exit constants; action/outcome/exit normalizers; typed step result builders from explicit input or control results; validators/assertions; diagnostic/rate-limit readers.
- Side effects: none beyond frozen constant/map initialization.
- Globals/coupling: coupled to Nova exit-code constants, typed control-result diagnostics, terminal exit derivation, and rate-limit diagnostic metadata.

### `skills/nova/pipeline/services/contracts/validator-control-result.ts`
- Incoming callers/importers: `services/module-validators.js` builds validator controls; `runners/module-runner-forge.ts`, `module-runner-prebuster.ts`, and `pipeline-runner-scheduling.js` normalize validator controls directly; the deleted `services/contracts/index.js` barrel no longer re-exports this namespace.
- Outgoing static imports: Nova `core/runtime.ts`; `contract-diagnostics.js`; `serialization.js`; `contracts/control-result-mapping.ts`.
- Dynamic imports: none.
- Exports: validator next-action/type constants; serializable clone helper; module validator compatibility mapping; typed validator result builder; module validator result builder; type guard/coercer/validator/normalizer.
- Side effects: none.
- Globals/coupling: coupled to `getRunId`/config run-id aliases, module validator result/report/failure shapes, and plugin contract-invalid diagnostics.

### `skills/nova/pipeline/services/contracts/worker-control-result.ts`
- Incoming callers/importers: `agents/orchestration.ts` and `agents/module-worker-control-results.ts` build/validate worker controls directly; module Forge/Buster runners consume typed worker controls; `module-runner-shared.ts` normalizes worker plugin outputs; the deleted `services/contracts/index.js` barrel no longer re-exports this namespace.
- Outgoing static imports: `contract-diagnostics.js`; `serialization.js`.
- Dynamic imports: none.
- Exports: serializable clone helper; typed worker result builder; guard/coercer/validator/normalizer.
- Side effects: none.
- Globals/coupling: coupled to typed worker schema, module Forge/Buster producer types, and plugin contract-invalid diagnostics.

### `skills/nova/pipeline/services/correlation.ts`
- Incoming callers/importers: broad Nova runner/service use: pipeline runner shared/start/terminal/recovery, gate runners/controls, module runner phases, polling/rate-limit/summary/status-store services, failure presentation/retry-policy, case-study, and `core/context.ts`.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: status/result/read-model correlation resolvers with provenance and diagnostic fallbacks; scalar session/dispatch/attempt/gateway/gate-type readers; invocation refs/ids/correlation/snapshot builders.
- Side effects: none.
- Globals/coupling: centralizes mixed status/result/read-model identity aliases (`session_key`, `dispatch_id`, `gateway_label`, `attempt`, `gate_type`, camelCase fallbacks), active-agent provenance, canonical `prefix:value` refs, config `_runId/run_id`, and plugin invocation identity shape.

### `skills/nova/pipeline/services/dependencies.ts`
- Incoming callers/importers: `runners/module-runner/attempt.ts` imports `checkDependencies` before module execution.
- Outgoing static imports: Nova logger, status constants, and status-store gate/module scheduler projections.
- Dynamic imports: none.
- Exports: `checkDependencies`.
- Side effects: emits dependency diagnostics through `log`.
- Globals/coupling: depends on progress `modules`/`gates`, `depends_on` strings with `gate:` prefix, status-store canonical scheduler projections, legacy gate status read-model fields, and `STATUS.PASS`.

### `skills/nova/pipeline/services/discord-fields.ts`
- Incoming callers/importers: Nova agents, gate/module runners, recovery, rate-limit builders, failure presentation, and lifecycle notices import Discord identity field helpers/surfaces through this facade.
- Outgoing static imports: re-exports selected symbols from `./rate-limit-contract.ts`.
- Dynamic imports: none.
- Exports: `DISCORD_FIELD_SPECS`, `DISCORD_IDENTITY_FIELD_SETS`, `DISCORD_IDENTITY_SURFACES`, `buildDiscordIdentityFields`, `buildDiscordIdentitySurfaceFields`, `buildSessionRateLimitDiscordFields`.
- Side effects: none beyond loading the rate-limit contract.
- Globals/coupling: role-local convenience facade over Discord identity/rate-limit field contract; importing it also loads rate-limit-contract definitions.

### `skills/nova/pipeline/services/durable-operator-alert.ts`
- Incoming callers/importers: `services/telemetry.js` re-exports alert helpers; `services/observability.js` and `services/telemetry/dispatch.js` append durable alerts.
- Outgoing static imports: Node `fs`/`path`; Nova logger/runtime; redaction helpers; noncritical-reporting incident helpers.
- Dynamic imports: none.
- Exports: `durableOperatorAlertTargets`, `appendDurableOperatorAlert`.
- Side effects: exported append function synchronously creates directories/appends JSONL alert records and reports write failures as nonblocking incidents; no module-load IO.
- Globals/coupling: writes `operator-alerts.jsonl` under pipeline and run log dirs derived from `_logDir`, `_runLogDir`, `_runId`, or `run_id`; sanitizes telemetry/Discord presentation payloads; defaults source/emitter/severity.

### `skills/nova/pipeline/services/failure-semantics.ts`
- Incoming callers/importers: `pipeline-runner-recovery.js`, failure presentation/retry-policy/classification, and status-store lifecycle appenders import failure taxonomy helpers directly.
- Outgoing static imports: Nova ACP monitor facade for monitor reasons/stopped-state parser.
- Dynamic imports: none.
- Exports: failure layer/source/code/class constants, stale recovery action constants, `normalizeFailureClass`, failure fact builder, monitor failure classifier, stopped-state guard, stale recovery evidence/description helpers.
- Side effects: none beyond regex/constant initialization.
- Globals/coupling: coupled to ACP monitor reason vocabulary, session-state stopped semantics, regex taxonomy over pipeline error text, and stale recovery action naming.

### `skills/nova/pipeline/services/failures/classification.ts`
- Incoming callers/importers: Git worktree, module-worker control results, module attempt, failure presentation, and retry-policy import classifiers directly.
- Outgoing static imports: `failure-semantics.js`; failure incident reporter.
- Dynamic imports: none.
- Exports: fail pattern constants/map, `describeFailure`, text/git/pre-test classifiers, agent/pre-test fail reason extractors, pre-test verdict parser, suite detail/pass/fail readers.
- Side effects: none beyond constant/regex initialization; parse failures are reported through nonblocking incident helper when functions run.
- Globals/coupling: coupled to Buster Redis pre-test completion shape (`reason`, `verdict.suites`), suite status/finding fields, git/podman/registry/test-config error text, and normalized failure classes.

### `skills/nova/pipeline/services/failures/incidents.ts`
- Incoming callers/importers: failure presentation and classification import `reportFailureSurfaceIncident`.
- Outgoing static imports: Nova logger/runtime and noncritical-reporting helpers.
- Dynamic imports: none.
- Exports: `reportFailureSurfaceIncident`.
- Side effects: exported reporter emits classified nonblocking incidents; no module-load side effects.
- Globals/coupling: incident keys are coupled to project/run id aliases and failure classification scope.


## Nova failure presentation/retry policy, Forge/gate session helpers, governance, lint, and validator stages

### `skills/nova/pipeline/services/failures/presentation.ts`
- Incoming callers/importers: `services/failures/retry-policy.js` imports Discord field, telemetry, context, and truncation helpers; module attempt code imports `buildPreTestDiscordFields` directly; pipeline-runner deps import `injectNeedsNova` directly; review gate runners import `truncateForDiscord` directly; rate-limit services import `formatRateLimitEmbed` directly.
- Outgoing static imports: Node `fs`, `path`; Nova logger/runtime, Discord and Gateway integrations, artifact-bundle, correlation, Discord field facade, failure semantics, rate-limit contract, failure classification, and failure incident reporter.
- Dynamic imports: none.
- Exports: `buildPreTestDiscordFields`, `truncateForDiscord`, `formatRateLimitEmbed`, `injectNeedsNova`, plus named exports `buildFailureDiscordFields`, `buildModuleFailureTelemetry`, `telemetryCtx`.
- Side effects: none at module load; exported functions parse pre-test verdicts, append Nova injection JSONL artifacts, send Gateway session messages, emit Discord notices, and report nonblocking write/parse incidents.
- Globals/coupling: reads `process.env.NOVA_CHANNEL`; falls back across `config._runId`/`run_id`, result correlation/read-model projections, and artifact-bundle paths; coupled to Discord field limits, Gateway session key format, and failure/pre-test verdict shapes.

### `skills/nova/pipeline/services/failures/retry-policy.ts`
- Incoming callers/importers: module attempt/preflight/Buster-phase code imports `handleFail`, `buildNovaEscalation`, and `resolveAutoRetryThreshold` directly from retry-policy.
- Outgoing static imports: Nova logger/runtime, shared lifecycle-state mutation helpers, correlation, failure semantics, status-store, telemetry, fail-pattern classification, and failure presentation helpers.
- Dynamic imports: none.
- Exports: `resolveAutoRetryThreshold`, `handleFail`, `buildNovaEscalation`.
- Side effects: no module-load side effects; `handleFail` mutates module status, increments fail counts, appends failure summaries, saves status, emits telemetry, mutates run stats, and returns retry/escalation/blocked envelopes.
- Globals/coupling: coupled to mutable module `status.json` shape, `config.auto_retry_threshold`, `progress.modules/gates`, exit codes 10/20/30, status constants `FAIL`/`BLOCKED`, correlation aliases on status/options, and full-pipeline resume command format.

### `skills/nova/pipeline/services/failures.ts`
- Deleted in Phase 6 P6-B02; no runtime owner remains.
- Callers import the owning failure modules directly: `services/failure-semantics.js`, `services/failures/classification.js`, `services/failures/presentation.js`, and `services/failures/retry-policy.js`.
- Dynamic imports: none.
- Exports: none.
- Side effects: none.
- Globals/coupling: the broad failure namespace was removed so leaf failure modules own their public surfaces directly.

### `skills/nova/pipeline/services/forge-completion.ts`
- Incoming callers/importers: no direct runtime import found in pipeline source; prompt code references the `forge-completion.json` artifact path textually, and `agent-observability-forge-completion.js` owns the newer completion authority path separately.
- Outgoing static imports: Node `fs`, `path`; Nova status constants and `modulePath` helper.
- Dynamic imports: none.
- Exports: `FORGE_COMPLETION_ARTIFACT_TYPE`, `FORGE_COMPLETION_STATUSES`, `forgeCompletionArtifactFile`, `validateForgeCompletionArtifact`, `readForgeCompletionArtifact`.
- Side effects: none at module load; read helper synchronously checks/parses `forge-completion.json` when called.
- Globals/coupling: coupled to module directory layout and the legacy agent-written `forge-completion.json` shape with statuses `READY_FOR_TESTING` or `BLOCKED`.

### `skills/nova/pipeline/services/gate-active-session.ts`
- Incoming callers/importers: Buster gate runner and review gate task persist/clear active gate session evidence; pipeline-runner recovery resolves gate active-session recovery evidence; gate-fix scaffold persists/clears Forge fix active-session files.
- Outgoing static imports: Node `fs`, `path`; Nova active-session path helper, logger, status-store lifecycle read models, and session-authority identity/confirmation helpers.
- Dynamic imports: none.
- Exports: `GATE_ACTIVE_SESSION_EVIDENCE_ROLES`, `buildGateActiveSessionRecoveryPolicy`, `resolveGateActiveSessionRecoveryEvidence`, `persistGateActiveSession`, `clearGateActiveSession`.
- Side effects: no module-load side effects; helpers read lifecycle read models and active-session JSON, atomically write recovery evidence files, and unlink active-session files.
- Globals/coupling: lifecycle read model is the only active-session authority; gate active-session files and tracked-agent records are diagnostic/recovery evidence; accepts mixed tracked-agent/session identity field names and depends on `config._logDir` for persistence.

### `skills/nova/pipeline/services/gate-fix-scaffold.ts`
- Incoming callers/importers: shared gate Forge fix-cycle runner imports `startGateForgeFixCycleScaffold` and `finishGateForgeFixCycleScaffold`.
- Outgoing static imports: Node `fs`, `path`; Nova logger/path helpers, redaction artifact helpers, and gate active-session persistence helpers.
- Dynamic imports: none.
- Exports: `startGateForgeFixCycleScaffold`, `finishGateForgeFixCycleScaffold`.
- Side effects: no module-load side effects; start writes redacted Forge fix prompts, resolves/logs policy through injected deps, spawns/health-checks Forge agents, and persists active-session evidence; finish polls session end, copies redacted transcript artifacts, kills agents, and clears active-session files.
- Globals/coupling: depends on a broad injected `deps` contract, gate log layout, ACP label conventions, tracked-agent identity shape, and gate remediation cycle numbering.

### `skills/nova/pipeline/services/git-soft-fail-observability.ts`
- Incoming callers/importers: Buster gate terminal, review gate task, module Forge phase, and shared gate Forge fix-cycle runner emit Git commit/push soft-fail degradation through this helper.
- Outgoing static imports: Nova telemetry `emitObservabilityDegraded`.
- Dynamic imports: none.
- Exports: `emitGitCommitPushSoftFailDegraded`.
- Side effects: none at module load; exported helper emits degraded observability telemetry when an error/detail is present.
- Globals/coupling: coupled to telemetry degraded payload vocabulary and caller-provided module/gate/session identity fields.

### `skills/nova/pipeline/services/governance-context.ts`
- Incoming callers/importers: pipeline-runner start initializes governance context and records architecture validator results; approval gate runner records approval outcomes and builds embed fields; summary service builds governance summary.
- Outgoing static imports: Node `path`; Nova logger/path/runtime helpers and architecture validator report extractor.
- Dynamic imports: none.
- Exports: `initGovernanceCtx`, `getGovernanceCtx`, `recordArchValidatorResult`, `recordApprovalGateOutcome`, `buildGovernanceSummary`, `buildGovernanceEmbedFields`.
- Side effects: no module-load side effects; functions mutate in-memory `config._governanceCtx`, normalize artifact refs, read run stats, and log governance debug entries.
- Globals/coupling: explicitly in-memory per run; authoritative artifacts remain with governance modules under `.swarm/logs`; coupled to arch-validator report shape, approval gate artifact ref paths, timeout policy strings, and token stats fields.

### `skills/nova/pipeline/services/lint.ts`
- Incoming callers/importers: review gate runner imports `generateLintReport` and `formatLintReportForReviewer`; module validator stages import `runPreCheck` and `generateLintReport`; module-runner pre-Buster path uses pre-check through validators.
- Outgoing static imports: Node `child_process.execFileSync`, `fs`, `path`; Nova logger/path helpers and security subprocess environment helper.
- Dynamic imports: none.
- Exports: `generateLintReport`, `formatLintReportForReviewer`, `runPreCheck`.
- Side effects: none at module load; generation runs `node lint-report.ts`, creates temp JSON files under `/tmp`, optionally writes execution trace paths, parses/deletes report files, and pre-check archives reports under module lint log dirs.
- Globals/coupling: coupled to `config.pre_check.*`, lint-report CLI arguments, repo/module path helpers, `/tmp` temp naming, lint report summary/tool schema, and Forge diff-stat parsing.

### `skills/nova/pipeline/services/module-validators.ts`
- Incoming callers/importers: built-in registry imports delivery/pre-check/full-lint validator stage functions and registers them as built-in validator stages.
- Outgoing static imports: Node `fs`, `path`; Nova logger/path/runtime helpers, delivery validation service, lint service, and typed validator-control result builder.
- Dynamic imports: none.
- Exports: `runDeliveryLintValidatorStage`, `runPreCheckValidatorStage`, `runFullLintValidatorStage`.
- Side effects: no module-load side effects; validators run delivery lint/pre-check/full lint, archive full lint reports, and return typed module validator control results.
- Globals/coupling: accepts old and typed PluginContext input shapes for ids/module/status/gate/config; coupled to registry stage ids, validator result refs, lint report archiving layout, and validator-control result contract.

## Nova notification, observability, plugin runtime, and polling support

### `skills/nova/pipeline/services/notification-contract.ts`
- Incoming callers/importers: `services/notification-dispatch.js` imports input builders/assertion; `core/registry/builtins.ts` imports built-in notification plugin definitions.
- Outgoing static imports: Nova runtime/constants, Discord integration, observability helpers, telemetry stream emitter, and serialization `deepClone`.
- Dynamic imports: none.
- Exports: `NOTIFICATION_HOOK_IDS`, notification input builders/validators/assertion, telemetry/structured-event/Discord observer implementations, and `getBuiltinNotificationPluginDefinitions`.
- Side effects: none at module load; observer functions emit Redis telemetry, mirror `pipeline.jsonl` structured events, send Discord presentations, and record observability degraded/restored transitions when called.
- Globals/coupling: uses current time for `occurredAt`; normalizes config/run identity across `ctx`, `envelope.ids`, event payload, `_runId`, and `run_id`; requires `ctx.coreRuntime.readConfig()` rather than public PluginContext config reads; plugin manifests couple to `PLUGIN_CONTRACT_VERSION`, hook ids, priorities, and capability names.

### `skills/nova/pipeline/services/notification-dispatch.ts`
- Incoming callers/importers: notification dispatch is reached through direct owning-module imports rather than the public Nova pipeline API.
- Outgoing static imports: Nova logger, PluginContext creation/capability narrowing, plugin registry hook resolution, notification contract builders/assertion, observability degraded/restored helpers, and serialization clone/freeze helpers.
- Dynamic imports: none.
- Exports: `dispatchNotificationHook`.
- Side effects: none at module load; dispatch resolves startup-frozen hook listeners, reports missing-listener incidents, creates per-listener PluginContexts, shares hidden `notificationState`, invokes `implementation.observe`, and records per-listener degradation/restoration.
- Globals/coupling: coupled to startup-frozen plugin registry state, notification hook/stage ids, PluginContext capability filtering, observability incident vocabulary, and listener manifests/implementation shape.

### `skills/nova/pipeline/services/observability.ts`
- Incoming callers/importers: summary and runner terminal/start paths write cost reports; telemetry facades/builders/dispatch, notification contract/dispatch, Discord integration, plugin context, and agent-observability ingester import degraded/restored, structured-event, or usage helpers; `services/telemetry.js` re-exports degraded/restored.
- Outgoing static imports: Node `fs`, `path`; Nova logger/runtime; common noncritical reporting; durable operator alerts; telemetry stream emitter; telemetry payload schema validation/error.
- Dynamic imports: none.
- Exports: `recordObservabilityDegraded`, `recordObservabilityRestored`, `appendStructuredEvent`, `appendStructuredEventMirror`, `recordUsageSnapshot`, `aggregateUsage`, `checkBudgetThresholds`, `isBudgetExceeded`, `emitBudgetWarnings`, `writeCostReport`.
- Side effects: module-global `_observabilityHealth` map; functions append durable alerts, `pipeline.jsonl`, usage snapshots, budget events, and cost reports, emit telemetry stream events, log warnings/debug entries, and suppress duplicate degraded events until restored.
- Globals/coupling: coupled to `_logDir`/`_runLogDir`, `config.project`, run id resolution, telemetry event schema, Redis stream availability, local cost artifact layout, in-memory health keys, and budget threshold config under `config.observability.budget`.

### `skills/nova/pipeline/services/openclaw-plugin-runtime.ts`
- Incoming callers/importers: `runners/pipeline-runner.ts` creates the OpenClaw agent observer plugin controller around the pipeline run.
- Outgoing static imports: Node `child_process.spawnSync`; Nova logger.
- Dynamic imports: none.
- Exports: `createOpenClawAgentObserverPluginController`.
- Side effects: none at module load; enabled controllers synchronously run `openclaw plugins enable|disable <pluginId>` and log start/stop results when called.
- Globals/coupling: coupled to `config.agent_observability.plugin_control`, default command `openclaw`, default plugin id `kubeclaw-agent-observer`, command timeout, and `disableOnStop` policy; keeps controller-local `started` state.

### `skills/nova/pipeline/services/pipeline-event-contract.ts`
- Incoming callers/importers: approval signal adapter, Buster completion controller, completion adapters, polling-dual, polling-session-end, Buster gate completion, approval gate runner, and common ACP monitor import EventBus contract helpers through this Nova path.
- Outgoing static imports: re-exports `../../../common/pipeline/services/pipeline-event-contract.ts`.
- Dynamic imports: none.
- Exports: all common pipeline event contract exports.
- Side effects: none beyond loading the common re-export target.
- Globals/coupling: Nova role-local production-path facade; common pipeline event contract owns EventBus and adapter semantics.

### `skills/nova/pipeline/services/polling-dual.ts`
- Incoming callers/importers: `services/polling.js` imports `waitForModuleBusterCompletion`.
- Outgoing static imports: Nova deps/logger/runtime/paths, status store, rate-limit result builders, telemetry durable alert facade, pipeline event contract facade, completion event adapters, Buster completion controller, and timing budget error helper.
- Dynamic imports: none.
- Exports: `waitForModuleBusterCompletion`.
- Side effects: none at module load; waits start Redis/local completion adapters, create an EventBus and AbortController, load local module status, emit durable module completion alerts, and stop adapters in `finally`.
- Globals/coupling: coupled to Redis completion stream adapters, module Buster output path, local lifecycle status, completion adjudication result fields, expected identity fields, rate-limit status builders, budget/timeout semantics, and caller-supplied `pollResult` envelope shape.

### `skills/nova/pipeline/services/polling-identity.ts`
- Incoming callers/importers: `services/polling.js` and `services/polling-session-end.js` import polling identity/log-key helpers.
- Outgoing static imports: Nova correlation identity resolvers.
- Dynamic imports: none.
- Exports: `sessionLabelAgentType`, `resolveFilePollIdentity`, `resolveSessionPollIdentity`, `resolveStatusPollIdentity`, `buildAcpPollLogKey`, `buildSessionProgressStateKey`.
- Side effects: none; pure identity/log-key helpers.
- Globals/coupling: coupled to tracked-agent telemetry field names, session label vocabulary (`Pipeline Review`, `Case Study`), status-store/correlation aliases, ACP session/transcript state fields, and session progress state labels.

### `skills/nova/pipeline/services/polling-observability.ts`
- Incoming callers/importers: `services/polling.js` and `services/polling-session-end.js` import ACP polling observability helpers.
- Outgoing static imports: common/Nova ACP monitor transcript publisher facade, Nova logger, and telemetry transcript/progress/gateway/transcript observability emitters.
- Dynamic imports: none.
- Exports: `buildAcpObservabilityData`, `updateAcpPollObservability`, `publishAcpTranscriptDelta`, `maybeEmitAcpPollProgress`.
- Side effects: none at module load; helpers emit gateway/transcript observability, schedule fire-and-forget transcript delta publication, and emit periodic agent progress when called.
- Globals/coupling: coupled to ACP monitor state shape, telemetry identity fields, progress interval defaults, and agent type defaults.

### `skills/nova/pipeline/services/polling-redis-completion.ts`
- Incoming callers/importers: `services/polling.js` re-exports `archiveModuleCompletions` for callers that prepare new Buster dispatches.
- Outgoing static imports: Nova logger, completion stream key helper, Redis operation logger, telemetry degraded facade, and adapter registry.
- Dynamic imports: none.
- Exports: `archiveModuleCompletions`.
- Side effects: none at module load; archive calls resolve the registered Redis adapter, optionally install a Redis operation log callback, move active completions to `<stream>:log`, log archive results, and emit degraded observability on adapter/archive failure.
- Globals/coupling: coupled to adapter registry allowlist, Redis adapter `archiveCompletions` method, completion stream naming, active identity aliases, target kind/module/gate projection, and archive max length `1000`.

### `skills/nova/pipeline/services/polling-session-end.ts`
- Incoming callers/importers: `services/polling.js` re-exports `pollForSessionEnd`.
- Outgoing static imports: Node `fs`, `path`; Nova logger/runtime; common ACP monitor/lifecycle/gateway/redaction facades; Git worktree integration; rate-limit processor/builders; polling identity/observability helpers; telemetry durable alert facade; timing budget helpers; and pipeline EventBus facade.
- Dynamic imports: none.
- Exports: `pollForSessionEnd`.
- Side effects: none at module load; polling starts/stops ACP monitor adapters, repeatedly pulls Git, checks HEAD/worktree changes, publishes transcript/progress observability, sends timeout nudges, handles rate-limit cooldowns, mirrors subagent transcripts, and emits durable operator alerts for timeout/nudge failures.
- Globals/coupling: coupled to tracked-agent registry state, ACP session keys, Git repo root/HEAD/status, worktree ignore paths, session timeout/nudge/grace config, rate-limit policy, transcript redaction, Gateway message delivery, EventBus wait semantics, and legacy agent-side commit/push completion detection.

## Nova polling, prompt ingress, and rate-limit result/finalizer helpers

### `skills/nova/pipeline/services/polling.ts`
- Incoming callers/importers: module worker adapters import Forge/Buster polling wrappers and stale completion archiving; module attempt runner imports `pollWithRateLimitRecovery`, `pollDualWithRateLimitRecovery`, `archiveModuleCompletions`, and `sleep`; review/Buster gate runners import file/session polling helpers; case-study and summary services import `pollForFile`/`sleep`; rate-limit builders import `sleep` through a noted circular function-reference edge.
- Outgoing static imports: Node `fs`; Nova logger/runtime, status-store, ACP monitor/lifecycle, rate-limit recovery/builders, correlation, Git worktree, lifecycle-state, redaction, polling identity/observability, polling-dual, agent-observability Forge completion, and timing budget helpers.
- Dynamic imports: none.
- Exports: `pollResult`, `pollGeneric`, `pollForFile`, `pollStatus`, `pollForgeCompletion`, `pollDual`, rate-limit recovery wrappers, stale completion archive re-export, timing helper re-exports, session-end poller re-export, and completion-adjudicator re-exports.
- Side effects: none at module load beyond re-export loading; polling functions perform sleeps, Git pulls/head reads, status loads/saves/transitions, ACP monitor polling, transcript/progress telemetry, Redis/local completion waits, and hook-reader close cleanup.
- Globals/coupling: coupled to lifecycle read-model status vocabulary, ACP monitor/tracked-agent state, Git HEAD/worktree evidence, agent-observability `agent.ended` telemetry, Buster Redis completion authority, rate-limit recovery owner, budget deadlines, and caller-provided poll result envelope.

### `skills/nova/pipeline/services/prompt-ingress.ts`
- Incoming callers/importers: Nova CLI imports `resolveNovaPromptIngress` and `PROMPT_INGRESS_MAX_BYTES`; Forge/review prompt builders import `formatOperatorRemediationDirective`.
- Outgoing static imports: Node `fs`, `path`.
- Dynamic imports: none.
- Exports: prompt ingress byte/char constants, redacted placeholder constant, `resolvePromptFilePath`, `resolveNovaPromptIngress`, `formatOperatorRemediationDirective`.
- Side effects: none at module load; resolver functions realpath/stat/read prompt files, enforce repo containment/size/null-byte policy, trim input, redact common secret patterns, and format an XML-fenced untrusted operator directive.
- Globals/coupling: coupled to repository root realpath policy, prompt size limits, secret redaction regexes, CLI inline-vs-file precedence, and prompt text contracts consumed by Forge/review agents.

### `skills/nova/pipeline/services/rate-limit-builders/exhaustion-options.ts`
- Incoming callers/importers: `services/rate-limit-builders.js` imports and re-exports all helper factories.
- Outgoing static imports: Nova logger/runtime, Discord integration, status-store `loadStatus`, telemetry `onGateFail`, correlation resolvers, and parent `rate-limit-builders.js` helpers.
- Dynamic imports: none.
- Exports: gate/summary exhaustion option factories, session rate-limit Discord notifier factory, and tracked module status builder.
- Side effects: none at module load; returned hooks emit gate failure/retry-exhausted telemetry, send Discord notices, catch Discord pause/resume failures as DEBUG logs, and merge persisted/caller status when invoked.
- Globals/coupling: coupled to Discord field shape, telemetry context shape, status-store module status, correlation aliases, current run id fallback, and a circular parent-builder import that is only used inside function bodies.

### `skills/nova/pipeline/services/rate-limit-builders.ts`
- Incoming callers/importers: `services/rate-limit.js`, `services/rate-limit-exit.js`, and exhaustion-options helpers import builder/factory utilities; rate-limit module re-exports this public surface.
- Outgoing static imports: Nova logger/runtime, status-store lifecycle/cooldown helpers, Discord integration, failure presentation, telemetry, lifecycle-state, Discord field facade, rate-limit contract facade, correlation resolvers, `sleep` from polling, and exhaustion-options helper module.
- Dynamic imports: none.
- Exports: status constants; module telemetry, Discord field, retry-exhausted, detail/result resolver, gate/module/summary rate-limit status builders; tracked correlation builders; summary/gate notifier and recovery option factories; tracked outcome resolver; exhaustion-options re-exports.
- Side effects: none at module load; helper outputs can update tracked in-memory correlation, build Discord fields, emit retry-exhausted telemetry, and provide cooldown recovery options when consumed by `rate-limit.ts`.
- Globals/coupling: coupled to current lifecycle status shapes, active-agent identity, status/result correlation alias vocabulary, Discord/rate-limit field contracts, cooldown state in status-store, and polling sleep via a documented circular import.

### `skills/nova/pipeline/services/rate-limit-contract.ts`
- Incoming callers/importers: Nova rate-limit service/builders, failure presentation, and Discord field facade import rate-limit payload/embed/field helpers through this path.
- Outgoing static imports: re-exports `../../../common/pipeline/services/rate-limit-contract.ts`.
- Dynamic imports: none.
- Exports: all common rate-limit contract exports.
- Side effects: none beyond loading the common re-export target.
- Globals/coupling: Nova role-local production-path facade; common pipeline rate-limit contract owns payload, embed, and Discord field contract semantics.

### `skills/nova/pipeline/services/rate-limit-exit.ts`
- Incoming callers/importers: `services/rate-limit.js` imports finalizers and terminal-owned Redis exit builders; rate-limit module re-exports this public surface.
- Outgoing static imports: Nova logger, Discord integration, telemetry/durable alert helpers, rate-limit builders, and correlation result resolvers.
- Dynamic imports: none.
- Exports: generic session rate-limit exit builder, terminal-owned Redis/module/gate exit builders, generic finalizer, post-run summary/summary/gate/module finalizers, and summary/module exhaustion option factories.
- Side effects: none at module load; finalizers append durable operator alerts, run optional telemetry/Discord/before-return hooks, append delivery-failure alerts for hook failures, and log exhausted messages when invoked.
- Globals/coupling: coupled to rate-limit exhausted result shape, Redis completion entry aliases, Discord/telemetry presentation contracts, durable operator alert schema, module/gate/summary identity fields, and caller-supplied exit codes/reasons.

## Nova rate-limit, Redis completion, remediation, serialization, session authority, and status-store compatibility projections

### `skills/nova/pipeline/services/rate-limit.ts`
- Incoming callers/importers: summary, polling, polling-dual, polling-session-end, case-study, module Forge/Buster runners, gate runners/completion/terminal/fix-cycle, pipeline-runner start/state-machine, and review-gate task/runner import rate-limit recovery, durable cooldown, and finalizer helpers.
- Outgoing static imports: Nova logger/runtime, status-store load/save/cooldown helpers, Discord integration, failure rate-limit presentation, telemetry, lifecycle-state, shared rate-limit contract facade, timing sleep, `rate-limit-builders.js`, and `rate-limit-exit.js`.
- Dynamic imports: none.
- Exports: re-exports rate-limit builders and exit helpers; exports pause-state creation, session pause/exhaustion processing, tracked-module recovery option factory, durable cooldown replay, recovery wrappers, and legacy `handleRateLimit`.
- Side effects: none at module load; functions append cooldown lifecycle events, emit telemetry/Discord, sleep for cooldowns, extend budgets, mutate legacy module status snapshots during pause/resume, and finalize exhausted results.
- Globals/coupling: coupled to `config.rate_limit`, status-store/lifecycle cooldown read models, module/gate identity fields, Discord/rate-limit field contracts, injected notifier/sleep/test seams, and legacy status JSON mutation via `loadStatus`/`saveStatus`.

### `skills/nova/pipeline/services/redis-completion.ts`
- Incoming callers/importers: Nova Redis CLI tool imports completion selection/archive helpers; polling Redis-completion path uses adapter methods backed by this logic; Redis completion schema exports are surfaced here for callers needing the completion contract.
- Outgoing static imports: `./redis-message-contract.ts` normalization/validation and re-exported Redis message contract symbols.
- Dynamic imports: none.
- Exports: Redis task/completion contract re-exports; completion conflict/duplicate/ignored-source diagnostics, expected-identity normalization, identity matching, latest completion selection, tail scanning, and chunked archive helpers.
- Side effects: none at module load; functions call Redis `xrevrange`, `xrange`, `multi().xadd/xdel/exec`, and `xtrim` when scanning/archiving.
- Globals/coupling: coupled to canonical `source=buster-pipeline`, Redis stream entry field arrays, strong identity fields `run_id/attempt/dispatch_id`, target aliases (`module`, `module_id`, `gate_id`, envelope target), and archive stream retention.

### `skills/nova/pipeline/services/redis-log.ts`
- Incoming callers/importers: polling Redis-completion imports `logRedisOperation`; Redis exchange helpers are the local artifact logging surface for Redis adapters/tools.
- Outgoing static imports: Node `fs`, `path`; common noncritical reporting; Nova path targets; runtime run-id resolver.
- Dynamic imports: none.
- Exports: Redis log target resolver, artifact append helper, exchange/operation/sent/received loggers, and `closeRedisLog`.
- Side effects: none at module load; functions synchronously create directories and append JSONL records, sanitize/truncate payloads, and report write/serialization failures as nonblocking incidents.
- Globals/coupling: coupled to `.swarm/logs/redis`/run-scoped artifact target resolution, run id, noncritical incident keys, bounded 2KB payload logging, and sync JSONL write policy.

### `skills/nova/pipeline/services/redis-message-contract.ts`
- Incoming callers/importers: Nova Redis completion, Buster completion controller, completion event adapters, and Buster-side task queue/completion/tools import Redis schema helpers through role-local facades.
- Outgoing static imports: re-exports `../../../common/pipeline/services/redis-message-contract.ts`.
- Dynamic imports: none.
- Exports: all shared Redis message contract exports.
- Side effects: none beyond loading the common re-export target.
- Globals/coupling: Nova role-local production-path facade; common pipeline owns Redis envelope/task/completion schema authority.

### `skills/nova/pipeline/services/remediation-handoff.ts`
- Incoming callers/importers: gate-control contract validation, Buster/review gate control adapters, Buster/review gate runners/fix-cycles, generic remediable-gate engine, and Buster gate runner import remediation request/read/validate/controller helpers.
- Outgoing static imports: Nova status constants and serialization clone helper.
- Dynamic imports: none.
- Exports: gate remediation control-result builder, remediation spec reader, remediation result/controller validators, controller resolver, and fix-cycle bump helper.
- Side effects: none; pure typed-control construction/validation/cloning.
- Globals/coupling: coupled to gate-control `request_fix` typed diagnostics shape, remediation controller method contract, `STATUS.FAIL`, and cloned JSON-safe diagnostics/findings.

### `skills/nova/pipeline/services/serialization.ts`
- Incoming callers/importers: core registry/context, notification contracts/dispatch, contract diagnostics, status-store lifecycle, remediation handoff, telemetry sink contracts/dispatch, module-runner shared, and other typed-contract code use clone/freeze helpers.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: `sanitizeForJson`, `cloneSerializable`, `deepClone`, `deepFreeze`, `cloneReadonlySnapshot`, `createReadonlySnapshot`.
- Side effects: none; pure object traversal/clone/freeze helpers.
- Globals/coupling: coupled to JSON serialization semantics, WeakSet/WeakMap cycle guards, function-to-string/undefined handling, and read-only PluginContext snapshot expectations.

### `skills/nova/pipeline/services/session-authority.ts`
- Incoming callers/importers: Nova module worker orchestration, gate active-session helpers, and pipeline-runner recovery import active-session authority policy and identity helpers.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: strong/optional identity field constants, evidence role constants, active-session identity normalization, missing/strong identity checks, confirmation builder, and authority policy builder.
- Side effects: none; pure policy helpers.
- Globals/coupling: coupled to lifecycle read-model active-session authority, diagnostic evidence roles, strong identity fields `run_id/attempt/dispatch_id/session_key`, optional `gateway_label`, and explicit denial of status/active-session-file/tracked-agent authority.

### `skills/nova/pipeline/services/status-store-compat/common.ts`
- Incoming callers/importers: status-store compatibility facade and gate/module projection leaves import shared projection source constants/builders.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: canonical/pending/legacy evidence source constants and `buildProjectionSourceFields`.
- Side effects: none; pure constants/helper.
- Globals/coupling: coupled to lifecycle read-model projection metadata names and legacy evidence source labels used by scheduler/operator projections.

### `skills/nova/pipeline/services/status-store-compat/gate-projection.ts`
- Incoming callers/importers: status-store compatibility facade re-exports gate projection helpers; status-store and scheduler/dependency paths consume them through that facade.
- Outgoing static imports: Node `fs`; Nova gate path helpers; status-store lifecycle wait/read-model helpers; status-store compatibility common constants.
- Dynamic imports: none.
- Exports: gate-status authority roles/policy, legacy-evidence projection into read models, approval wait sync, output/status readers, gate output existence check, gate completion state/evidence readers, and scheduler projection.
- Side effects: none at module load; projection functions read/write lifecycle read models, append wait lifecycle events for approval states, and read gate output/legacy status JSON from disk.
- Globals/coupling: coupled to canonical gate `output_file` authority, legacy `gate-status.json` diagnostic evidence, approval wait lifecycle read models, pass/fail status vocabularies, scheduler drift metadata, and config-derived gate artifact paths.

### `skills/nova/pipeline/services/status-store-compat/module-projection.ts`
- Incoming callers/importers: status-store compatibility facade re-exports module projection helpers; status-store and scheduler/dependency paths consume them through that facade.
- Outgoing static imports: Node `fs`; Nova status path helper; correlation identity resolvers; status-store lifecycle progress/read-model helpers; status-store compatibility common constants.
- Dynamic imports: none.
- Exports: legacy projection modes/purposes, module snapshot authority roles, legacy projection policy resolver, authoritative module state getter, legacy status projector/reader, snapshot authority resolver, and scheduler projection.
- Side effects: none at module load; migration-bootstrap projection can save lifecycle read models and recompute progression; readers read legacy status JSON from disk.
- Globals/coupling: coupled to lifecycle module read-model authority, optional `config.compatibility.legacy_module_status_bootstrap_mode`, legacy `.swarm/status.json` evidence, scheduler drift metadata, and correlation alias resolvers for dispatch/gateway/session fields.

### `skills/nova/pipeline/services/status-store-compat.ts`
- Incoming callers/importers: `services/status-store.js` re-exports compatibility projections; `services/truth-drift.js` imports module/gate projection helpers directly from this facade.
- Outgoing static imports: re-exports `./status-store-compat/common.js`, `module-projection.js`, and `gate-projection.js`.
- Dynamic imports: none.
- Exports: projection source constants/builders; legacy module projection modes/purposes, module snapshot authority helpers, legacy module readers/projectors; gate authority policy, output/evidence readers, scheduler/completion projectors, and approval wait sync.
- Side effects: none beyond loading re-export targets.
- Globals/coupling: role-local compatibility facade coupled to lifecycle read-model migration, legacy module `status.json`, legacy `gate-status.json`, canonical gate `output_file`, scheduler projections, and truth-drift diagnostics.

### `skills/nova/pipeline/services/status-store-lifecycle/appenders.ts`
- Incoming callers/importers: `services/status-store-lifecycle.js` facade delegates all append/get/reset calls to this module.
- Outgoing static imports: Node `path`; Nova runtime opaque ids; lifecycle storage, idempotency, refs, read-models, projections, legality; correlation identity resolvers; failure semantics; serialization clone helper.
- Dynamic imports: none.
- Exports: lifecycle event appenders for pipeline, wait/resume, cooldown, stale recovery, and module attempts; lifecycle gate/module/cooldown getters; lifecycle store reset.
- Side effects: none at module load; functions append JSONL lifecycle records, mutate `config._lifecycleEventsCache`, save lifecycle read models, and derive event data from status/progress/config.
- Globals/coupling: coupled to run-scoped lifecycle files, pending module lifecycle mutations, progress modules/gates, status active-agent identity, failure-class normalization, and idempotency over refs/data.

### `skills/nova/pipeline/services/status-store-lifecycle/idempotency.ts`
- Incoming callers/importers: only lifecycle appenders call `buildLifecycleIdempotencyKey`.
- Outgoing static imports: Node `crypto`.
- Dynamic imports: none.
- Exports: `buildLifecycleIdempotencyKey`.
- Side effects: none; pure stable stringify/hash/slug helper logic.
- Globals/coupling: coupled to lifecycle event type vocabulary, ref names (`run_ref`, `module_attempt_ref`, `wait_ref`, `resume_signal_ref`), and selected failure fields used to fingerprint duplicate failures.

### `skills/nova/pipeline/services/status-store-lifecycle/legality.ts`
- Incoming callers/importers: lifecycle appenders call `ensureLifecycleEventLegal` before writing non-deduped events.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: `ensureLifecycleEventLegal`.
- Side effects: none; throws structured `Error` messages for illegal lifecycle transitions.
- Globals/coupling: coupled to lifecycle read-model pipeline/module/wait/gate/cooldown state, approval signal vocabulary, module status vocabulary, and retry attempt-bridge policy.

### `skills/nova/pipeline/services/status-store-lifecycle/projections.ts`
- Incoming callers/importers: lifecycle appenders apply events to read models; `services/status-store-lifecycle.js` re-exports approval resolution derivation.
- Outgoing static imports: serialization clone helper and lifecycle read-model defaults/progression recompute.
- Dynamic imports: none.
- Exports: `deriveApprovalResolutionFromState`, `applyLifecycleEventToReadModels`.
- Side effects: none; returns cloned/mutated read-model objects without writing files.
- Globals/coupling: coupled to canonical lifecycle event types, module/gate/wait/signal/cooldown read-model shape, approval timeout/pass-block semantics, scheduler-consumed flags, active-session clearing on stale recovery, and module status/history projection.

### `skills/nova/pipeline/services/status-store-lifecycle/read-models.ts`
- Incoming callers/importers: lifecycle facade, appenders, and projections load/save/default/recompute lifecycle read models.
- Outgoing static imports: Nova runtime run-id helper, serialization clone helper, and lifecycle storage helpers.
- Dynamic imports: none.
- Exports: default read-model factory, load/save/read events, and progression recompute.
- Side effects: none at module load; save writes `read-models.json` atomically and updates `config._lifecycleReadModelsCache`.
- Globals/coupling: coupled to run id aliases, run-scoped lifecycle file paths, in-memory cache fallback when no log dir exists, and progression status buckets including `RATE_LIMITED` as active.

### `skills/nova/pipeline/services/status-store-lifecycle/refs.ts`
- Incoming callers/importers: lifecycle facade re-exports selected ref helpers; appenders build pipeline/module/gate/wait/resume/cooldown refs through this module.
- Outgoing static imports: active logger context, runtime run-id helper, and correlation identity resolvers.
- Dynamic imports: none.
- Exports: active progress/module config/attempt/commit resolvers plus pipeline, module-attempt, gate-evaluation, wait, resume-signal, and cooldown ref builders.
- Side effects: none; pure ref construction and identity fallback logic.
- Globals/coupling: coupled to active context progress, `config._progress`, run-id aliases, module dir lookup, active-agent identity, commit field aliases, and canonical ref string formats.

### `skills/nova/pipeline/services/status-store-lifecycle/storage.ts`
- Incoming callers/importers: lifecycle read-models and appenders use storage path/read/write helpers.
- Outgoing static imports: Node `fs`, `path`; Nova pipeline run log path helper.
- Dynamic imports: none.
- Exports: run/lifecycle directory resolution, lifecycle events/read-models paths, JSON read/write, JSONL append/read helpers.
- Side effects: none at module load; functions create run/lifecycle directories, set `config._runLogDir`, write temp files then rename, and append JSONL.
- Globals/coupling: coupled to `config._logDir`, `config._runLogDir`, pipeline run log directory layout, and null-path no-op behavior for pre-log-dir contexts.

### `skills/nova/pipeline/services/status-store-lifecycle.ts`
- Incoming callers/importers: `services/status-store.js`, status-store compatibility projection leaves, and `services/gate-active-session.js` import lifecycle read-model/event/ref helpers.
- Outgoing static imports: lifecycle read-models, appenders, refs/projections, and serialization clone helper.
- Dynamic imports: none.
- Exports: public lifecycle read-model/event append/get/reset API, selected ref builders/resolvers, approval resolution derivation, and `cloneSerializable` compatibility export.
- Side effects: none beyond loading delegated modules.
- Globals/coupling: canonical lifecycle facade coupled to Nova status-store, scheduler/recovery projections, gate active-session authority, and compatibility consumers that still import from one service path.

### `skills/nova/pipeline/services/status-store.ts`
- Incoming callers/importers: Nova CLI initializes logs; polling, rate-limit, dependencies, blueprint, retry policy, pipeline-runner shared/recovery/deps/start/terminal, module attempt/worker/shutdown, gate/review/Buster/approval runners import status, lifecycle, archive, and projection helpers.
- Outgoing static imports: Node `fs`, `path`; Nova path/logger/redaction/system-io/artifact-bundle/lifecycle-state helpers; lifecycle facade; status-store compatibility facade; truth-drift facade.
- Dynamic imports: none.
- Exports: log-dir init, lifecycle/status compatibility re-exports, truth-drift re-exports, module status load/save/init, guarded-field diff helpers, prompt/transcript persistence, and gate output archive helpers.
- Side effects: none at module load; functions create log trees/streams/latest pointer, reset lifecycle store, initialize context logging, write diagnostic `status.json`, persist redacted prompt/transcript artifacts, and copy gate outputs to archive.
- Globals/coupling: coupled to `.swarm/logs` and run-log layout, lifecycle read models as canonical status authority, legacy diagnostic `status.json`, explicit lifecycle transition mutation data, active-agent/session identity, redaction policy, context logging streams, and gate artifact directories.


## Nova summary, system I/O warning, task transport facade, and telemetry spine

### `skills/nova/pipeline/services/summary/project-summary.ts`
- Incoming callers/importers: `services/summary.js` re-exports `generateProjectSummary`; `core/registry/builtins.ts` invokes it through the built-in project-summary generator stage; `runners/pipeline-runner-deps.js` exposes it in default runner deps.
- Outgoing static imports: Node `fs`, `path`; Nova logger, paths/runtime, Discord integration, redaction facade, telemetry summary builders, generator-result contract, and adapter registry.
- Dynamic imports: none.
- Exports: `generateProjectSummary`.
- Side effects: creates pipeline log directory, writes sanitized markdown/JSON/case-study base artifacts, emits summary telemetry, optionally posts Discord embeds, and logs success/failure.
- Globals/coupling: depends on `config._logDir`, `config._runId`/`run_id`, `config.project`, `config.discord_webhook_url`, registry-resolved generator key, and redaction policy.

### `skills/nova/pipeline/services/summary-session-cleanup.ts`
- Incoming callers/importers: `services/summary.js` and `services/case-study.js` create tracked summary cleanup callbacks.
- Outgoing static imports: Nova logger and ACP Gateway session-termination contract validator.
- Dynamic imports: none.
- Exports: `createTrackedSummarySessionCleanup`.
- Side effects: returned cleanup callback may terminate an ACP session, untrack an agent, and log cleanup warnings/debug messages.
- Globals/coupling: closure state prevents double cleanup; dependency-injected `terminateSession` and `untrackAgent`; identity values may be functions resolved at cleanup time.

### `skills/nova/pipeline/services/summary.ts`
- Incoming callers/importers: `core/registry/builtins.ts` calls `generateProjectSummary` and `generatePipelineReview`; `runners/pipeline-runner-deps.js` imports `writeSummary`, `generateProjectSummary`, and `generatePipelineReview`; `pipeline-runner-terminal.js` calls `writeSummary` via deps; public surfaces may reach exports through runner deps.
- Outgoing static imports: Node `fs`, `path`; Nova deps/logger/paths/runtime; common-backed runtime/lifecycle/session-termination facades; polling, Discord, observability, governance, redaction, telemetry, artifact bundle, rate-limit, correlation, generator-result contract, summary cleanup, case-study, and project-summary modules.
- Dynamic imports: none.
- Exports: `buildCumulativeSummary`, `writeSummary`, pipeline-review path/dispatch/agent/instruction helpers, `generatePipelineReview`, case-study helper re-exports, and `generateProjectSummary` re-export.
- Side effects: reads module status JSON; writes sanitized pipeline summary/latest pointer and pipeline-review instructions; spawns/tracks/terminates review sessions; polls output files; copies redacted transcripts; sends Discord notices; emits summary/budget telemetry; writes cost report through observability helpers.
- Globals/coupling: depends on `.swarm` path layout, config `_logDir`/`_runLogDir`, run stats globals, progress `pipeline_review` overrides, default models/fallback model, rate-limit config, Gateway dispatch identity, and output-file authority.

### `skills/nova/pipeline/services/system-io-warning.ts`
- Incoming callers/importers: `core/logger.ts` emits pipeline JSONL append warnings; `core/policy.ts` emits model-policy audit append warnings; `services/status-store.js` emits prompt-artifact write warnings.
- Outgoing static imports: noncritical-reporting sanitizer and telemetry stream emitter.
- Dynamic imports: none.
- Exports: `emitSystemIoWarning`, `emitPolicyAuditAppendWarning`, `emitPipelineLogAppendWarning`, `emitPromptArtifactWriteWarning`.
- Side effects: asynchronously emits `system.io_warning` telemetry; on telemetry failure writes sanitized warning JSON to stderr/console as a bare-metal fallback.
- Globals/coupling: uses `console.error`, `process.stderr`, timestamps, and mixed camel/snake entry metadata aliases.

### `skills/nova/pipeline/services/task-transport-contract.ts`
- Incoming callers/importers: `services/completion-event-adapters.js` decodes Redis stream entries; `tools/redis.ts` creates Redis task queues; role consumers may import the Nova-local facade.
- Outgoing static imports: re-exports `../../../common/pipeline/services/task-transport-contract.ts`.
- Dynamic imports: none.
- Exports: all common task transport contract exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: role-local production-path facade; common pipeline owns the contract.

### `skills/nova/pipeline/services/telemetry/builders.ts`
- Incoming callers/importers: `services/telemetry.js` re-exports all builder functions; Nova index re-exports most telemetry builders; pipeline runner, module/gate runners, approval gates, rate-limit, observability, summaries, agents, polling, and other services call through the root telemetry facade.
- Outgoing static imports: Nova runtime stats, observability degraded/restored helpers, and local telemetry dispatch.
- Dynamic imports: none.
- Exports: pipeline/module/gate/agent/phase/retry/escalation/summary/budget/approval/cost/rate-limit/observability builder functions and gateway/transcript/Redis observability updaters.
- Side effects: emits typed telemetry events through `emitEvent`/`emitEventNonBlocking`; `onAgentKilled` mutates `ctx.stats` token totals; observability updaters mutate caller-provided state objects.
- Globals/coupling: event payloads depend on shared telemetry schema, run stats globals, exit-code vocabulary, mixed snake/camel identity aliases, and in-memory degraded/restored state objects.

### `skills/nova/pipeline/services/telemetry/dispatch.ts`
- Incoming callers/importers: `services/telemetry.js`, telemetry builders/progress, `services/system-io-warning.js` indirectly through telemetry stream, and the agent-observability ingester import or call dispatch functions.
- Outgoing static imports: Nova logger/runtime, noncritical reporting, observability, telemetry sink dispatch, durable operator alert, and telemetry payload schema facade.
- Dynamic imports: none.
- Exports: `emitEventNonBlocking`, `emitEvent`, `emitOperatorAlert`.
- Side effects: validates telemetry payloads, dispatches registry-owned telemetry sinks, appends durable disk audit events, appends durable operator alerts, and records degraded observability on validation/sink failures.
- Globals/coupling: depends on `ctx.config`, run id resolution, sink registry behavior, durable alert paths, and nonblocking incident de-dupe keys.

### `skills/nova/pipeline/services/telemetry/payload-schema.ts`
- Incoming callers/importers: `services/telemetry.js`, `services/telemetry/dispatch.js`, `services/observability.js`, and any consumers of the Nova telemetry facade.
- Outgoing static imports: re-exports `../../../../common/pipeline/services/telemetry/payload-schema.ts`.
- Dynamic imports: none.
- Exports: all common telemetry payload schema exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: role-local production-path facade; common pipeline owns telemetry schema validation.

### `skills/nova/pipeline/services/telemetry/progress.ts`
- Incoming callers/importers: `services/telemetry.js` re-exports progress helpers; `services/polling-observability.js` emits transcript and progress events through them; Nova index re-exports both helpers.
- Outgoing static imports: local telemetry dispatch.
- Dynamic imports: none.
- Exports: `emitTranscriptLine`, `emitAgentProgress`.
- Side effects: nonblocking telemetry emission for `agent.transcript` and `agent.progress`.
- Globals/coupling: depends on telemetry schema, optional gate/module/session identity, transcript offset/count, and caller-supplied polling status.

### `skills/nova/pipeline/services/telemetry/sinks.ts`
- Incoming callers/importers: `services/telemetry.js` re-exports `closeTelemetryRedis`; `agents/shutdown.js` calls it during shutdown.
- Outgoing static imports: `closeTelemetryStreamRedis` from Nova telemetry stream service.
- Dynamic imports: none.
- Exports: `closeTelemetryRedis`.
- Side effects: closes the telemetry Redis stream connection when called.
- Globals/coupling: Redis telemetry stream singleton owned by `services/telemetry-stream.js`.

## Nova telemetry sink/stream, validation, truth-drift, and lint-report container tools

### `skills/nova/pipeline/services/telemetry-sink-contract.ts`
- Incoming callers/importers: `core/registry/builtins.ts` imports `getBuiltinTelemetrySinkPluginDefinitions`; `services/telemetry-sink-dispatch.js` imports sink family/stage constants and input builders/assertions.
- Outgoing static imports: Nova runtime/config constants, Discord integration, `telemetry-stream.js`, and serialization helpers.
- Dynamic imports: none.
- Exports: telemetry sink hook/stage constants, input build/validate/assert helpers, Redis/Discord sink observers, and built-in sink plugin definitions.
- Side effects: observer functions read private coreRuntime config, emit Redis stream events or Discord messages, and may update non-enumerable `ctx.telemetrySinkState`; no direct side effects at module load.
- Globals/coupling: couples telemetry sinks to startup plugin manifests, `PluginContext` private coreRuntime readers, Redis stream emission, Discord presentation payloads, current run-id fallbacks, and wall-clock `Date` timestamps.

### `skills/nova/pipeline/services/telemetry-sink-dispatch.ts`
- Incoming callers/importers: `services/telemetry/dispatch.js` calls `dispatchTelemetrySinks` for blocking and nonblocking telemetry dispatch.
- Outgoing static imports: logger, plugin context/capability narrowing, plugin registry resolution, observability degraded/restored helpers, telemetry sink contract helpers, and serialization helpers.
- Dynamic imports: none.
- Exports: `dispatchTelemetrySinks`.
- Side effects: resolves registry listeners, records missing/failing sink degradation and restoration, creates plugin contexts, invokes each sink observer, logs sink warnings.
- Globals/coupling: depends on startup-frozen plugin registry, hook-family/stage ids, capability-narrowed plugin input, per-dispatch mutable `telemetrySinkState`, and nonblocking observability policy.

### `skills/nova/pipeline/services/telemetry-stream.ts`
- Incoming callers/importers: `notification-contract.ts`, `system-io-warning.js`, `observability.js`, `core/context.ts`, `telemetry-sink-contract.ts`, `agent-observability-forge-completion.js`, and `telemetry/sinks.js` use stream key, emit, or close helpers.
- Outgoing static imports: noncritical reporting, redaction, and Nova telemetry facade Redis constants/client helpers from `../telemetry.ts`.
- Dynamic imports: none.
- Exports: `isTelemetryEnabled`, `getTelemetryStreamKeyForRun`, `emitTelemetryStreamEvent`, `closeTelemetryStreamRedis`.
- Side effects: lazy module-global Redis client creation, Redis error listener registration, Redis `INCR`/`EXPIRE` sequence allocation, Redis `XADD`, and best-effort client close.
- Globals/coupling: module-global `_redis`; depends on `config.telemetry`, `project`, `_runId`/`run_id`, common Redis client construction, stream maxlen/TTL constants, and sanitized event payload shape.

### `skills/nova/pipeline/services/telemetry.ts`
- Incoming callers/importers: Nova index, shutdown, agents, runners, polling/rate-limit/failure/summary services, and project-summary/telemetry callers import telemetry builders, dispatchers, progress, durable alert, observability, schema, and close helpers.
- Outgoing static imports: re-exports from `telemetry/dispatch.js`, `durable-operator-alert.js`, `observability.js`, `telemetry/builders.js`, `telemetry/progress.js`, `telemetry/payload-schema.ts`, and `telemetry/sinks.js`.
- Dynamic imports: none.
- Exports: public Nova telemetry facade: event dispatch, operator alerts, observability degraded/restored, all builder/progress helpers, payload schema validators/constants, and `closeTelemetryRedis`.
- Side effects: none at module load; re-exported functions perform telemetry, alert, sink, and close side effects.
- Globals/coupling: broad public service facade over local-first operator evidence and registry-owned sink dispatch.

### `skills/nova/pipeline/services/truth-drift.ts`
- Incoming callers/importers: `services/status-store.js` re-exports/calls module and gate truth-drift projection helpers.
- Outgoing static imports: status-store compatibility projections and completion adjudicator.
- Dynamic imports: none.
- Exports: `projectModuleTruthDrift`, `projectGateTruthDrift`.
- Side effects: none; pure projection/adjudication wrapper.
- Globals/coupling: couples lifecycle scheduler projections with Redis/local completion adjudication and legacy artifact path aliases for drift reporting only.

### `skills/nova/pipeline/services/validation.ts`
- Incoming callers/importers: module attempt/preflight code imports preflight validation and formatting; module validators import delivery lint; registry config normalization/validation imports `isPlainObject`.
- Outgoing static imports: Node `fs`/`path`, Nova logger, and core path boundary helpers.
- Dynamic imports: none.
- Exports: `isPlainObject`, `VALIDATION_CODES`, `runPreflightValidation`, `runDeliveryLintValidation`, `formatValidationFailures`.
- Side effects: reads `FORGE.md`, Dockerfile/static paths, checks file existence/realpaths, and logs validation pass/fail/skip messages.
- Globals/coupling: coupled to module `FORGE.md` deliverable text, `test_config.serve` and `test_config.api` shape, repo-root path jail helpers, and Dockerfile `COPY` text parsing.

### `skills/nova/pipeline/telemetry.ts`
- Incoming callers/importers: Nova root-level Redis/tool paths import common telemetry helpers via `../telemetry.ts`, including `tools/redis.ts`, completion event adapters, artifact bundle, telemetry stream, and agent-observability completion.
- Outgoing static imports: re-exports `../../common/pipeline/telemetry.ts`.
- Dynamic imports: none.
- Exports: all common telemetry helper exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: repo/dev production-path facade over common telemetry authority.

### `skills/nova/pipeline/timing.ts`
- Incoming callers/importers: Nova polling, rate-limit, Git worktree, ACP observability, Gateway/polling helpers, and orchestration healthcheck import sleep/budget helpers through this facade.
- Outgoing static imports: re-exports `../../common/pipeline/timing.ts`.
- Dynamic imports: none.
- Exports: all common timing/budget helper exports.
- Side effects: none beyond module re-export loading.
- Globals/coupling: repo/dev production-path facade over common timing authority.

### `skills/nova/pipeline/tools/lint-report/constants.ts`
- Incoming callers/importers: `tools/lint-report.ts` imports default tier and tier descriptions.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: `DEFAULT_TIER`, `DEFAULT_TOOL_TIMEOUT`, `TIERS`, `VERSION`.
- Side effects: none.
- Globals/coupling: lint-report CLI/tool default vocabulary and timeout constants.

### `skills/nova/pipeline/tools/lint-report/container-yaml-tools.ts`
- Incoming callers/importers: `tools/lint-report/tool-registry.ts` imports and calls `registerContainerYamlTools`.
- Outgoing static imports: Node `fs`/`path`, lint-report `safeExec`, file discovery, JSON parser, and report result helpers.
- Dynamic imports: none.
- Exports: `registerContainerYamlTools`.
- Side effects: no module-load side effects; when called, registers hadolint, Helm lint, kubeconform, and yamllint tool definitions whose runners execute external binaries and scan repo/module files.
- Globals/coupling: coupled to lint-report context (`repoRoot`, `modulePath`, `projectTypes`, `changedFiles`), external tool availability, file discovery depth, and parser/report helper result shapes.


## Nova lint-report and project-summary tools

### `skills/nova/pipeline/tools/lint-report/discovery.ts`
- Incoming callers/importers: `tools/lint-report.ts` imports project type detection and scope resolution; `tools/lint-report/tool-registry.ts` imports config discovery, file discovery, tsconfig lookup, and policy source listing; container/YAML tool registration also uses file discovery helpers.
- Outgoing static imports: Node `fs`, `path`; `../../core/platform-config.ts`; `./output.js`.
- Dynamic imports: none.
- Exports: `detectProjectTypes`, platform ESLint/Semgrep config discovery helpers, `discoverPlatformSwarmConfigCandidates`, `findFiles`, `findNearestTsconfigDir`, `listPolicySourceFiles`, `resolveScope`.
- Side effects: reads directories/files during detection and scope resolution; logs detected project types and selected scope.
- Globals/coupling: coupled to platform swarm config discovery, `/home/node/.openclaw` config defaults, repo/module path layout, policy ignore patterns, changed-file deletion handling, and lint-report context shape.

### `skills/nova/pipeline/tools/lint-report/execution.ts`
- Incoming callers/importers: `tools/lint-report/report.ts` imports `commandExists`; `tools/lint-report/tool-registry.ts` and container/YAML tool registration import `safeExec`.
- Outgoing static imports: Node `child_process.execFileSync`; `./constants.ts`; `../../security.ts`.
- Dynamic imports: none.
- Exports: `commandExists`, `safeExec`.
- Side effects: executes external binaries with bounded timeout/buffer and sanitized subprocess environment.
- Globals/coupling: coupled to PATH lookup via `which`, default lint timeout, subprocess environment policy, and result shape `{ok, stdout, stderr, exitCode, timedOut, error}`.

### `skills/nova/pipeline/tools/lint-report/output.ts`
- Incoming callers/importers: lint-report discovery, report runner, tool registry, and CLI entrypoint use logging/help/report writing helpers.
- Outgoing static imports: Node `fs`, `path`; `./constants.ts`.
- Dynamic imports: none.
- Exports: `log`, `printHelp`, `setLintLogPath`, `writeReport`.
- Side effects: writes structured JSON logs to stderr and optionally a dual-write log file; writes report JSON to stdout or an output path.
- Globals/coupling: module-global `lintLogPath`; coupled to lint-report report summary fields and CLI help text.

### `skills/nova/pipeline/tools/lint-report/parsers.ts`
- Incoming callers/importers: `tools/lint-report/tool-registry.ts` imports JSON parsing and export-name extraction; container/YAML tool registration uses JSON parsing.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: `extractPublicExportNames`, `tryParseJson`.
- Side effects: none; pure parsing helpers.
- Globals/coupling: regex-based JS/TS/CJS export detection and JSON diagnostics are coupled to repo-policy duplicate export checks and tool output parsing.

### `skills/nova/pipeline/tools/lint-report/report.ts`
- Incoming callers/importers: `tools/lint-report.ts` imports `runAllTools`; `tools/lint-report/tool-registry.ts` and container/YAML registration import warning/config/parse-failure result builders.
- Outgoing static imports: Node `path`; `./execution.js`; `./output.js`.
- Dynamic imports: none.
- Exports: `makeConfigMissingResult`, `makeParseFailureResult`, `makeWarningResult`, `runAllTools`.
- Side effects: checks binary availability, runs applicable tool definitions sequentially, logs per-tool status, and builds report timestamps.
- Globals/coupling: coupled to tier order `pre-check`/`full`, lint-report context (`repoRoot`, `modulePath`, `projectTypes`, `changedFiles`), and standardized report/result shape.

### `skills/nova/pipeline/tools/lint-report/tool-registry.ts`
- Incoming callers/importers: `tools/lint-report.ts` imports `TOOL_REGISTRY`; registry is populated at module load.
- Outgoing static imports: Node `fs`, `path`; lint-report constants, execution, discovery, parser, report, output, and container/YAML registration helpers.
- Dynamic imports: none.
- Exports: `TOOL_REGISTRY`.
- Side effects: registers tool definitions at module load, including TypeScript, repo-policy, Python, shell, JS/TS, dependency/security, Semgrep, and container/YAML tools; individual runners execute external binaries and read source/config files.
- Globals/coupling: mutable module-global registry; coupled to external tools (`tsc`, `ruff`, `shellcheck`, `eslint`, `knip`, `madge`, `npm`, `mypy`, `pip-audit`, `semgrep`), platform config locations, TypeScript policy, file discovery, and standardized finding severity shape.

### `skills/nova/pipeline/tools/lint-report.ts`
- Incoming callers/importers: `services/lint.js` executes it as a subprocess; operators can run it directly; exports are available to pipeline callers/import harnesses.
- Outgoing static imports: Node `fs`, `path`, `url.fileURLToPath`; lint-report constants, discovery, output, report runner, tool registry; shared CLI flag parser.
- Dynamic imports: none.
- Exports: `lintReportExitCode`, `runAllTools`, `detectProjectTypes`, `TOOL_REGISTRY`, `TIERS`, default `main`.
- Side effects: direct execution parses CLI flags, validates repo/tier, resolves scope, runs tools, writes JSON report, and exits nonzero when findings or tool failures are present.
- Globals/coupling: direct `process.argv`, `process.env` through called helpers, `process.exit`; coupled to `services/lint.js` subprocess contract and lint-report JSON schema.

### `skills/nova/pipeline/tools/project-summary-formatters.ts`
- Incoming callers/importers: `tools/project-summary.ts` imports case-study base, Markdown, Discord embed, and percentage helpers.
- Outgoing static imports: none.
- Dynamic imports: none.
- Exports: `formatDuration`, `formatNum`, `pct`, `groupDeliveredScope`, `buildCaseStudyBase`, `buildMarkdown`, `buildDiscordEmbeds`.
- Side effects: none; pure formatting/projection helpers except wall-clock timestamps in generated payloads.
- Globals/coupling: coupled to project-summary collector shapes, module/gate status vocabulary, Discord embed limits by convention, and legacy test/unit census field aliases.

### `skills/nova/pipeline/tools/project-summary.ts`
- Incoming callers/importers: `services/adapter-registry.ts` imports `generateSummary` as canonical project-summary generator; built-in registry exposes the generator through startup wiring; operators can run the file directly.
- Outgoing static imports: Node `fs`, `path`, `child_process.execFileSync`, `url.fileURLToPath`; Nova CLI parser, Git context, platform config, Discord integration, lifecycle-state normalization, redaction, security, and project-summary formatters.
- Dynamic imports: none.
- Exports: `generateSummary`, `postToDiscord`.
- Side effects: direct CLI execution reads Git/project `.swarm` artifacts and source files, writes Markdown/JSON output when requested, optionally posts Discord embeds, and exits; library calls run Git subprocesses, read project status/test/review artifacts, sanitize egress, and may send Discord.
- Globals/coupling: coupled to `CURRENT_PROJECT`, `REPO_ROOT`, `RUN_ID`, `PIPELINE_RUN_ID`, `DISCORD_WEBHOOK`, platform `projects_root`, `.swarm` artifact layout, Git history, status normalization, redaction policy, and allowed-path security checks.


## Nova Redis adapter and root pipeline shim

### `skills/nova/pipeline/tools/redis.ts`
- Incoming callers/importers: `services/adapter-registry.ts` imports the default Redis adapter; `agents/orchestration.ts` resolves it for Buster task dispatch and calls `publishTask`; `services/polling-redis-completion.js` resolves it for stale completion archival and sets `setLogCallback`; operators can run the file directly for Redis send/read/archive actions.
- Outgoing static imports: Node `url.fileURLToPath`, `fs`, `path`; Nova CLI parser, telemetry Redis client helpers, task transport contract, and Redis completion policy helpers.
- Dynamic imports: `logToDiscord` dynamically imports `../integrations/discord.js` and `../redaction.ts` only on task publish notification.
- Exports: default Redis tool library with `client`, `setLogCallback`, `publishTask`, `sendTask`, `readCompletion`, `archiveCompletions`, and `disconnect`; re-exports Redis completion constants, validators, envelope helpers, identity helpers, conflict/duplicate helpers, scan/archive helpers, and `RedisPipelineMessageInvalidError` from `services/redis-completion.js`.
- Side effects: captures `DISCORD_WEBHOOK` and `BUSTER_TASK_STREAM` at module load; lazily creates a Redis singleton and error listener when used; direct CLI execution parses flags, performs Redis operations, writes JSON/stdout or JSON stderr, disconnects Redis, and exits.
- Globals/coupling: module globals `_redis` and `_logCallback`; coupled to Redis env handled by `createRedisClient`, Buster task stream default `swarm:buster:tasks`, canonical task envelope requirement, strong completion identity fields, Discord/redaction payload summary shape, and adapter-registry method contracts.

### `skills/nova/pipeline.ts`
- Incoming callers/importers: production/operator path `node /app/skills/pipeline.ts`; local/source path `node skills/nova/pipeline.ts`; deployment values and skill docs reference this compatibility entrypoint; verification checks keep it as a thin shim; runtime importers can use it as the public pipeline API surface.
- Outgoing static imports: Node `url.fileURLToPath`, `fs`; static re-export and default re-export from `./pipeline/index.ts`.
- Dynamic imports: direct execution dynamically imports `{ main }` from `./pipeline/cli.ts` and awaits it.
- Exports: all named exports plus default export from `pipeline/index.ts`.
- Side effects: import-only use performs realpath checks but does not run CLI; direct execution calls CLI `main()` through top-level await.
- Globals/coupling: coupled to `process.argv[1]`, filesystem realpath/symlink behavior, public API authority in `pipeline/index.ts`, and runtime CLI authority in `pipeline/cli.ts`.

## Phase 6 completion audit note

The Phase 6 completion audit re-scanned source import/export and dynamic-import specifiers after P6-B01 through P6-B09. Result: `62` migrated Phase 6 TypeScript owners, `445` source files scanned, and `0` stale import specifiers resolving to deleted Phase 6 `.js` owners. Native Node imported all `62` migrated Phase 6 `.ts` owners successfully. See `docs/ts-migration/phase-6-completion-audit.md` for the exact evidence.
