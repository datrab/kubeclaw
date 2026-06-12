# Authority Registry

Purpose: define one canonical owner for every pipeline truth surface before TypeScript migration.

## Phase 9 unpaired JavaScript reclutcher baseline

Phase 9 starts from 31 unpaired `.js` files under `skills/*`; this exact inventory is locked by `tests/verification/contracts/check-phase9-unpaired-js-surface.mjs`.

- Phase 9 is complete. The final retained unpaired `.js` inventory is 18 files: 16 pure shared facades, 1 direct runtime delegate, and 1 explicit out-of-scope operator utility. No behavior-bearing unpaired `.js` pipeline file remains in Phase 9 scope.
- Pure Buster shared production-path facades: `skills/buster/pipeline/agents/acp-monitor.ts`, `lifecycle.js`, `runtime.js`, `session-semantics.js`, `session-termination.js`, `tracked-agents.js`, `skills/buster/pipeline/git-primitives.ts`, and `skills/buster/pipeline/lifecycle-state.ts`. These files have no authority and must stay exact `.ts` re-exports over Common owners until final facade cleanup deletes or accepts them.
- Pure Nova shared production-path facades: `skills/nova/pipeline/agents/acp-monitor.ts`, `lifecycle.js`, `runtime.js`, `session-semantics.js`, `session-termination.js`, `tracked-agents.js`, `skills/nova/pipeline/git-primitives.ts`, and `skills/nova/pipeline/lifecycle-state.ts`. These files have no authority and must stay exact `.ts` re-exports over Common owners until final facade cleanup deletes or accepts them.
- Direct runtime delegate: `skills/nova/pipeline.ts` owns no pipeline behavior; it re-exports the typed Nova index and delegates direct CLI execution to `pipeline/cli.ts`.
- Phase 9 behavior-bearing Buster owners migrated in P9-B03: `services/capabilities.ts`, `services/gateway-health.ts`, `services/orphan-recovery.ts`, `services/pipeline-helpers.ts`, `services/runtime.ts`, and `services/session-monitor.ts`.
- Phase 9 behavior-bearing Buster owners migrated in P9-B04: `services/task-completion.ts`, `services/task-lifecycle.ts`, `services/task-lifecycle/cleanup.ts`, `services/task-lifecycle/completion-signal.ts`, `services/task-queue.ts`, and `services/task-validation.ts`.
- Phase 9 behavior-bearing Buster owners migrated in P9-B05: `suites/repo-paths.ts`.
- Explicit non-pipeline utility outside current migration scope: `skills/common/discord-purge.ts`; it remains inventoried as an operator utility, not a pipeline behavior owner.

## Phase 10 paired JavaScript reclutcher baseline

Phase 10 starts from 100 paired `.js` files under `skills/*`; this exact inventory is locked by `tests/verification/contracts/check-phase10-paired-facade-surface.mjs`.

- Pure paired facades after P10-B06: 86 files. They have no independent authority and must stay exact `.ts` re-export files until a later Phase 10 batch either deletes them or explicitly retains them as package/import compatibility surfaces.
- Executable/runtime delegates: `skills/buster/buster-pipeline.ts`, `skills/nova/pipeline/cli.ts`, `skills/nova/pipeline/tools/lint-report.ts`, `skills/nova/pipeline/tools/project-summary.ts`, and `skills/nova/pipeline/tools/redis.ts`. These may retain direct-entry code only to delegate execution to typed owners.
- Canonical behavior authority for every paired file is the same-path `.ts` owner. A paired `.js` file cannot own fallback policy, compatibility normalization, status authority, Redis authority, or runner/service behavior.
- P10-B01 resolved no `DELETE_LEGACY` row by deletion because it was an inventory and contract batch. Later batches must delete any facade or delegate that the reclutcher marks delete and update all source/test/docs/deployment references in the same batch.
- P10-B02 retained executable `.js` entry/delegate paths only for operator/runtime compatibility and deleted active references to removed root tool aliases. `tests/verification/contracts/check-phase10-executable-delegate-surface.mjs` now locks `/app/skills/pipeline/tools/{lint-report,redis,project-summary}.ts` as the canonical runtime tool locations.
- P10-B03 kept Common runtime packaging facades plus Buster/Nova role-local shared facades as explicit external adapters. Common TypeScript owners remain the only behavior authorities for ACP monitor/lifecycle/runtime/session semantics/session termination/tracked agents, Git primitives, and lifecycle-state.
- P10-B04 kept Nova agent, prompt, and runner `.js` files only as package/import facades. The same-path `.ts` owners remain the behavior authorities, and retained runner facades do not preserve Phase 8 deleted behavior.
- P10-B05 kept Nova service `.js` files only as package/import facades. Status-store, Redis completion/log, rate-limit, telemetry, notification, failure, remediation, session, artifact, and validation behavior authority remains in the paired TypeScript owners.
- P10-B06 deleted the nine non-executable Nova tool helper `.js` facades. Lint-report helper authority and project-summary formatter authority are now reached through `.ts` owners; only the top-level operator CLI `.js` delegates remain.
- P10-B07 adds final reference authority: active docs, deployment values, skill docs, and implementation maps may mention JavaScript only for retained runtime/operator adapters or retained pure package facades. Historical migration/open-issue records remain historical evidence, not active authority.
- P10-B08 closes the migration with zero unclassified JavaScript files under `skills/*`. TypeScript owners are canonical; retained JavaScript has no behavior authority beyond pure package/import compatibility or direct runtime/operator delegation.

## Buster runtime and shared facade authorities

- Buster runtime startup/shutdown loop: `skills/buster/buster-pipeline.ts` owns process signals, direct-entry dispatch, startup sequencing, Redis polling loop, and `--status` output; `skills/buster/buster-pipeline.ts` is an executable-only compatibility shim for `node /app/skills/buster-pipeline.ts`.
- Buster task lifecycle: `skills/buster/pipeline/services/task-lifecycle.ts` owns `processTask` and `getLastRunLogDir`; the entrypoint imports them for runtime polling/status only and does not re-export the helper surface.
- Redis task queue: `skills/buster/pipeline/services/task-queue.ts` owns stream constants, consumer group setup, task dequeue/reclaim, and Redis disconnect; the entrypoint drives the loop through that boundary and importers use the owning module directly.
- Buster completion source: `source=buster-pipeline` is the canonical completion identity consumed by Nova status/completion code; the entrypoint itself delegates emission to task lifecycle/completion services.
- ACP session termination result: `skills/common/pipeline/agents/session-termination.ts` is the authority, reached through the Buster facade during shutdown.
- ACP monitor state/transcript: `skills/common/pipeline/agents/acp-monitor.ts` is the authority; Buster role-local facades re-export it for production shared-path packaging, not through the Buster root entrypoint.
- Active session lifecycle and tracked agents: `skills/common/pipeline/agents/lifecycle.ts` plus `tracked-agents.ts` own shared lifecycle/diagnostic state; Buster role-local facades re-export them for production shared-path packaging, not through the Buster root entrypoint.
- Runtime/harness classification: `skills/common/pipeline/agents/runtime.ts` owns runtime/model classification; Buster facade re-exports it.
- Session state vocabulary: `skills/common/pipeline/agents/session-semantics.ts` owns parsing and terminal-state vocabulary; Buster facade re-exports it.
- CLI parsing policy: `skills/common/pipeline/cli-args.ts` owns strict parser behavior; Buster facade re-exports it.
- Git primitives: `skills/common/pipeline/git-primitives.ts` owns repo-root/Git primitive behavior; Buster facade re-exports it.
- Agent-observability read contract: `skills/common/pipeline/agent-observability/src/index.ts` owns the TypeScript contract; Buster TypeScript index is a role-local facade.


## Buster shared helper, suite, and image authorities

- Discord webhook posting: `skills/common/pipeline/integrations/discord-webhook.ts` owns webhook behavior; the Buster integration file is a role-local facade.
- Gateway operation boundary: `skills/common/pipeline/integrations/gateway.ts` owns Gateway URL/token resolution and typed Gateway calls; the Buster integration facade preserves local import paths.
- Lifecycle-state mutation helpers: `skills/common/pipeline/lifecycle-state.ts` owns transition/mutation helper semantics; the Buster lifecycle-state file is a facade only.
- Noncritical incident reporting: `skills/common/pipeline/noncritical-reporting.ts` owns process-local de-dupe, sanitization, and incident-line formatting; the Buster file is a facade only.
- Redaction policy: `skills/common/pipeline/redaction.ts` owns telemetry/Discord/artifact egress sanitization; the Buster file is a facade only.
- Redis transport policy: `skills/common/pipeline/redis-transport.ts` owns native `ioredis` loading and secure Redis transport option construction; the Buster file is a facade only.
- Shared security helpers: `skills/common/pipeline/security.ts` owns path, command tokenization, and subprocess environment guards; the Buster security file is a facade only.
- ACP Gateway contract validation: `skills/common/pipeline/services/acp-gateway-contract.ts` owns typed Gateway contract shapes; the Buster service file is a facade only.
- Buster suite orchestration/verdict evidence: `skills/buster/pipeline/runners/suite-runner.ts` owns suite ordering, dependency skip behavior, per-suite timeout wrapping, capability preflight conversion to suite verdicts, telemetry emission, and suite/runner verdict artifact writes.
- Buster base-image cache preparation: `skills/buster/pipeline/services/base-images.ts` owns the static typed base-image allowlist, fully qualified image-ref validation, capability-gated Podman pre-pull orchestration, and typed degraded image-level pre-pull evidence; it no longer owns progress-derived discovery or bare-name normalization.


## Buster service contract and support authorities

- Buster capability policy: `skills/buster/pipeline/services/capabilities.ts` owns the Buster capability vocabulary, normalization, suite requirement mapping, default-deny assertion, and durable operator-alert record for denied actions.
- Buster Discord operator adapter: `skills/buster/pipeline/services/discord.ts` owns Buster Discord audit artifacts, webhook degradation/restoration tracking, actionability field enrichment, webhook mute handling, and raw webhook request delivery; common webhook transport owns HTTP posting.
- Buster gateway readiness/liveness policy: `skills/buster/pipeline/services/gateway-health.ts` owns readiness/periodic thresholds and shutdown triggers; common Gateway integration owns the health probe implementation.
- Buster Git workflow policy: `skills/buster/pipeline/services/git-workflows.ts` owns deterministic target-commit fetch/reset and fail-closed rebase-before-push retry semantics while common Git primitives own repo-root and Git execution.
- Buster structured task logging: `skills/buster/pipeline/services/logger.ts` owns Buster JSONL/stdout log entry shape, redaction, and logger degraded/restored hooks.
- Buster orphaned active-session evidence fence: `skills/buster/pipeline/services/orphan-recovery.ts` owns startup inspection and diagnostics for persisted active-session files; it explicitly does not own lifecycle state or session termination authority.
- Shared pipeline event contract: `skills/common/pipeline/services/pipeline-event-contract.ts` is canonical; Buster `services/pipeline-event-contract.ts` is a production-path facade.
- Buster task/result helper boundary: `skills/buster/pipeline/services/pipeline-helpers.ts` owns Buster output-file resolution, terminal outcome derivation, completion identity fields, embed builders, active-session evidence path, and cleanup policy selection.
- Shared rate-limit contract: `skills/common/pipeline/services/rate-limit-contract.ts` is canonical; Buster `services/rate-limit-contract.ts` is a production-path facade.
- Buster child-session rate-limit recovery: `skills/buster/pipeline/services/rate-limit.ts` owns mutable cooldown state, owned canonical pause emission, cooldown sleep, typed post-cooldown liveness states, and resume/kill action return for Buster session monitor; only confirmed closed sessions map to kill.


## Buster task execution, cleanup, and terminal-signal authorities

- Shared Redis task/completion contract: `skills/common/pipeline/services/redis-message-contract.ts` is canonical; Buster `services/redis-message-contract.ts` is a production-path facade.
- Buster runtime diagnostics: `skills/buster/pipeline/services/runtime-diagnostics.ts` owns sanitized process diagnostics, malformed-task artifacts, process-health artifacts, and diagnostic-only degraded records.
- Buster Discord webhook URL resolution: `skills/buster/pipeline/services/runtime.ts` owns the Buster env/override helper consumed by Buster Discord-related callers.
- Buster sandbox cleanup: `skills/buster/pipeline/services/sandbox-cleanup.ts` owns cleanup scope labels, tracked cleanup state and typed state-file diagnostics, cleanup policy profiles, Podman/Kubernetes/nginx cleanup orchestration, and sandbox output clearing policy.
- Buster ACP session monitor: `skills/buster/pipeline/services/session-monitor.ts` owns monitor event consumption, hard-timeout kill behavior, Buster monitor telemetry, transcript publication, gateway degraded/restored emission, and Buster rate-limit cooldown delegation.
- Buster terminal completion/dead-letter guarantee: `skills/buster/pipeline/services/task-completion.ts` owns completion record construction, Redis completion publication, dead-letter record construction, and the terminal-before-ACK precondition.
- Buster lifecycle cleanup stage: `skills/buster/pipeline/services/task-lifecycle/cleanup.ts` owns task-lifecycle cleanup telemetry around `doSandboxCleanup`.
- Buster completion signal stage: `skills/buster/pipeline/services/task-lifecycle/completion-signal.ts` owns output-file ensuring, verify-and-push before completion, Redis completion emission, and completion-state mutation.
- Buster Git sync stage: `skills/buster/pipeline/services/task-lifecycle/git-sync.ts` owns lifecycle-stage repo root resolution, typed sync-result shaping, and `git_sync` telemetry; destructive Git behavior remains in `git-workflows.ts`.
- Buster session lifecycle stage: `skills/buster/pipeline/services/task-lifecycle/session.ts` owns task-level spawn/monitor/kill/outcome publication orchestration while shared lifecycle/termination facades own ACP session primitives.

## Buster task queue, lifecycle, telemetry, and suite evidence authorities

- Buster per-task lifecycle spine: `skills/buster/pipeline/services/task-lifecycle.ts` owns `processTask`, last-run log-dir state, stage ordering, task-level telemetry/log context setup, suite decision orchestration, and final completion cleanup semantics.
- Buster Redis task queue/ACK boundary: `skills/buster/pipeline/services/task-queue.ts` owns Redis stream constants, Redis singleton lifecycle, consumer-group/read/reclaim helpers, malformed-task dead-letter handling, error cleanup, and the terminal-before-ACK policy.
- Shared task transport contract: `skills/common/pipeline/services/task-transport-contract.ts` is canonical; Buster `services/task-transport-contract.ts` is a production-path facade.
- Buster task payload validation: `skills/buster/pipeline/services/task-validation.ts` owns allowed Buster task types, required identity normalization, forbidden legacy field rejection, capability validation, and repo-scoped task path validation.
- Shared telemetry payload schema: `skills/common/pipeline/services/telemetry/payload-schema.ts` is canonical; Buster `services/telemetry/payload-schema.ts` is a production-path facade.
- Buster telemetry adapter: `skills/buster/pipeline/services/telemetry.ts` owns Buster Redis telemetry emission, fallback artifact emission, pipeline artifact mirroring, degraded/restored reporting, and telemetry Redis client lifecycle.
- Buster suite verdict schema: `skills/buster/pipeline/services/verdict-schema.ts` owns Buster suite status/severity/recommendation vocabulary, suite finding/verdict factories, runner verdict aggregation, and prompt truncation shape.
- Buster accessibility suite: `skills/buster/pipeline/suites/a11y.ts` owns axe/playwright accessibility verdict mapping and threshold-vs-informational behavior.
- Buster API suite: `skills/buster/pipeline/suites/api.ts` owns JSON-spec HTTP/WebSocket test execution, auth setup token interpolation, and threshold-vs-informational behavior.

## Buster foundational suite authorities

- Buster build/start authority: `skills/buster/pipeline/suites/build.ts` owns static build serving, server container startup, optional Dockerfile pre-build, deployment env injection, start command path normalization, and build error parsing.
- Buster bundle-size authority: `skills/buster/pipeline/suites/bundle.ts` owns `/sandbox/www` bundle size/file-count scanning and threshold interpretation.
- Buster E2E replay authority: `skills/buster/pipeline/suites/e2e.ts` owns persisted Playwright test discovery, execution, output parsing, and informational/enforced failure interpretation.
- Buster health/smoke authority: `skills/buster/pipeline/suites/health.ts` owns app HTTP health retry behavior, visual-reg smoke path auto-detection, Playwright smoke navigation, and health verdict criticality.
- Buster Kubernetes deployment authority: `skills/buster/pipeline/suites/k8s.ts` owns production-like image build/push/deploy checks, ephemeral namespace naming/prefix validation, manifest namespace/image rewriting, optional secret copying, pod readiness, in-cluster service health checks, and cleanup resource tracking.

## Buster static-analysis, quality, visual-reg, and facade authorities

- Buster manifest validation authority: `skills/buster/pipeline/suites/manifest.ts` owns Kubernetes Deployment/Secret manifest parsing, required env checks, secret-key checks, imagePullSecret checks, probe/resource-limit findings, and shared YAML document load/dump helpers consumed by the k8s suite.
- Buster performance audit authority: `skills/buster/pipeline/suites/perf.ts` owns Lighthouse invocation, report path policy, score extraction, and informational/enforced threshold interpretation.
- Buster suite repo path authority: `skills/buster/pipeline/suites/repo-paths.ts` owns the Buster suite repo-root constant and repo-scoped path resolution boundary, while shared security owns generic scoped-path enforcement.
- Buster HTTP security audit authority: `skills/buster/pipeline/suites/security.ts` owns response header, cookie flag, CORS, path, timeout, and threshold interpretation for the security suite.
- Buster unit-test runner authority: `skills/buster/pipeline/suites/unit.ts` owns package test-script discovery, command execution, common test-output parsing, failure extraction, and unit threshold interpretation.
- Buster visual-reg Discord media adapter: `skills/buster/pipeline/suites/visual-reg-discord.ts` owns visual-reg summary/single multipart payload formatting and delivery-result shape; Buster Discord service owns raw webhook transport/audit.
- Buster visual-reg authority: `skills/buster/pipeline/suites/visual-reg.ts` owns baseline directory derivation, legacy baseline config rejection, explicit `paths.json` plus per-route baseline requirement enforcement, screenshot/baseline/diff artifact paths, Pixelmatch comparison, typed Discord delivery telemetry projection, and threshold interpretation.
- Shared telemetry helpers: `skills/common/pipeline/telemetry.ts` is canonical; Buster `pipeline/telemetry.ts` is a repo/dev production-path facade.
- Shared timing/budget helpers: `skills/common/pipeline/timing.ts` is canonical; Buster `pipeline/timing.js` is a repo/dev production-path facade.

## Buster operator tool and agent-observability contract authorities

- Buster Redis task tool authority: `skills/buster/pipeline/tools/redis.ts` owns CLI/library task publish/read behavior for Buster-compatible Redis task streams; completion remains explicitly owned by Buster task lifecycle/completion services.
- Buster screenshot/baseline tool authority: `skills/buster/pipeline/tools/screenshot.ts` owns Playwright screenshot capture and Prism HTML preview baseline generation used by visual-reg and operators.
- Buster scoped verification push authority: `skills/buster/pipeline/tools/verify-task.ts` owns the `.swarm` scope firewall, selective cleanup of forbidden changes, and controlled commit/push for Buster-side completion.
- Buster visual audit media authority: `skills/buster/pipeline/tools/visual-audit.ts` owns capability-gated image/video capture and direct Discord media upload for standalone visual audits.
- Agent-observability contract constants: `skills/common/pipeline/agent-observability/src/constants.ts` owns schema/source/stream/masking/event/hook constants.
- Agent-observability public TS surface: `skills/common/pipeline/agent-observability/src/index.ts` owns the shared export surface for the contract island.
- Agent-observability telemetry mapping: `skills/common/pipeline/agent-observability/src/mapping.ts` owns ingress-to-current/future telemetry mapping and promotion defaults.
- Agent-observability minimal masking: `skills/common/pipeline/agent-observability/src/masking.ts` owns recursive minimal API-key/token/secret masking and masking metadata.
- Agent-observability routing/size fuse: `skills/common/pipeline/agent-observability/src/routing.ts` owns control-vs-payload stream selection, event byte measurement, max-event-byte normalization, and oversize result shape.
- Agent-observability schema types: `skills/common/pipeline/agent-observability/src/types.ts` owns the TypeScript identity, payload, event, mapping, masking, and validation-result type vocabulary.

## Common agent lifecycle, monitor, utility, and validation authorities

- Agent-observability ingress validation: `skills/common/pipeline/agent-observability/src/validation.ts` owns runtime validation for schema version/source, identity fields, masking metadata, hook/type mapping, JSON-safe payloads, and assertion/error helpers.
- Shared ACP monitor: `skills/common/pipeline/agents/acp-monitor.ts` owns transcript delta rate limiting, monitor config normalization, transcript-file state, Gateway session status polling, monitor-state shaping, ACP event adapter emission, terminal checks, and idle-wait behavior.
- Shared session lifecycle primitives: `skills/common/pipeline/agents/lifecycle.ts` owns process-local active-session state, active-session evidence writes/removal, spawn/kill Gateway operations, subagent transcript path resolution, and ACP harness cleanup fallback.
- Shared runtime selection: `skills/common/pipeline/agents/runtime.ts` owns model-to-harness and model/runtime classification heuristics.
- Shared session semantics: `skills/common/pipeline/agents/session-semantics.ts` owns ACP monitor reason vocabulary plus session-state parsing and terminal/stopped/unreachable classification.
- Shared termination wrapper: `skills/common/pipeline/agents/session-termination.ts` owns bounded-grace termination result shaping and active-session termination cleanup semantics.
- Shared tracked-agent registry: `skills/common/pipeline/agents/tracked-agents.ts` owns process-local label-keyed tracked session metadata.
- Shared CLI parser: `skills/common/pipeline/cli-args.ts` owns strict repo-local flag/positional parsing used by Nova and Buster tool entrypoints.
- Shared Git primitives: `skills/common/pipeline/git-primitives.ts` owns repo-root discovery, Git command execution defaults, current-branch fallback, default repo-root mutation, and short-HEAD caching.
- Shared Discord webhook transport: `skills/common/pipeline/integrations/discord-webhook.ts` owns raw webhook POST behavior and typed delivery errors; role services own notification/audit policy.

## Common Gateway, lifecycle, hygiene, Redis/security, and contract authorities

- Shared Gateway integration: `skills/common/pipeline/integrations/gateway.ts` owns Gateway URL/token resolution, invoke/health HTTP behavior, network retry/budget handling, and typed operation wrappers.
- Shared module lifecycle-state mutation helpers: `skills/common/pipeline/lifecycle-state.ts` owns mutable module status transitions, phase/status clearing semantics, active-agent helpers, and explicit lifecycle mutation results.
- Shared noncritical incident reporting: `skills/common/pipeline/noncritical-reporting.ts` owns nonblocking incident de-dupe, error-detail normalization, and sanitized log/stderr fallback behavior.
- Shared redaction policy: `skills/common/pipeline/redaction.ts` owns secret/content sanitization, transcript/payload summaries, Discord/telemetry egress sanitization, and redacted prompt/transcript artifact shapes.
- Shared Redis transport policy: `skills/common/pipeline/redis-transport.ts` owns ioredis loading, Redis env/option normalization, secure transport enforcement, and localhost-only insecure verification mode.
- Shared subprocess/path security helpers: `skills/common/pipeline/security.ts` owns subprocess env allow/deny policy, scoped-path validation, allowed-prefix validation, and shell-free command tokenization.
- Shared ACP Gateway contract: `skills/common/pipeline/services/acp-gateway-contract.ts` owns ACP transcript/monitor/session lifecycle/termination/Gateway invoke validation shapes.
- Shared pipeline event contract: `skills/common/pipeline/services/pipeline-event-contract.ts` owns v1 event types/sources/identity normalization, approval/ACP payload validation, in-process event bus, and wait timeout/abort/budget semantics.
- Shared rate-limit presentation contract: `skills/common/pipeline/services/rate-limit-contract.ts` owns Discord identity surfaces/field formatting, canonical rate-limit detected payload construction, embed formatting, and resume-vs-kill recovery-action policy.


## Common Redis/task/telemetry and Nova module-worker authorities

- Shared Redis message envelope: `skills/common/pipeline/services/redis-message-contract.ts` owns Redis task/completion schema version, target inference, envelope normalization, task/completion validation, and typed invalid-message errors; Buster/Nova service files are facades.
- Shared task transport contract: `skills/common/pipeline/services/task-transport-contract.ts` owns Redis task queue/event bus adapter shape, stream-entry decoding, consumer-group creation idempotency, reclaim/read/ack/trim semantics, and transport contract errors.
- Shared telemetry payload schema: `skills/common/pipeline/services/telemetry/payload-schema.ts` owns pipeline telemetry event payload validation, event type registry, plugin telemetry projection, and telemetry payload invalid errors.
- Shared telemetry Redis helper surface: `skills/common/pipeline/telemetry.ts` owns telemetry stream/sequence key constants and Redis transport helper re-exports; Buster/Nova `pipeline/telemetry.ts` files are facades.
- Shared timing/budget helpers: `skills/common/pipeline/timing.ts` owns budget exhaustion errors, deadline construction, authorized budget extension, abort-aware sleep, and timeout-minute budget creation.
- Nova agent-observability facade: `skills/nova/pipeline/agent-observability/src/index.ts` is a role-local facade; common `agent-observability/src/index.ts` remains the canonical TypeScript contract island.
- Nova ACP monitor facade: `skills/nova/pipeline/agents/acp-monitor.ts` is a role-local facade; common `skills/common/pipeline/agents/acp-monitor.ts` remains the canonical monitor implementation.
- Nova lifecycle facade: `skills/nova/pipeline/agents/lifecycle.ts` is a role-local facade; common `skills/common/pipeline/agents/lifecycle.ts` remains the canonical lifecycle/tracked-agent implementation.
- Nova module worker control results: `skills/nova/pipeline/agents/module-worker-control-results.ts` owns conversion from Forge/Buster backend evidence into typed module worker control results; Buster failures require explicit typed `failure_class` evidence and do not infer from reason/status/source compatibility fields.
- Nova module worker runners: `skills/nova/pipeline/agents/module-workers.ts` owns module Forge/Buster worker execution orchestration between Nova orchestration and polling/status-store/session-authority services; it canonicalizes worker input onto `ids`, `refs`, and `executionContext` before runner logic reads identity fields.


## Nova orchestration lifecycle, healthcheck, shutdown, and facade authorities

- Nova agent orchestration boundary: `skills/nova/pipeline/agents/orchestration.ts` owns Nova spawn/kill/steer routing across ACP/subagent and Redis-dispatched agents, Buster task payload construction, Redis adapter caching, lifecycle telemetry/Discord notices, and Git baseline/change telemetry evidence.
- Nova agent healthcheck: `skills/nova/pipeline/agents/orchestration-healthcheck.ts` owns post-spawn liveness checks, Gateway-status degraded/restored telemetry, and transcript-progress fallback decisions for Nova tracked agents.
- Nova lifecycle telemetry payload builders: `skills/nova/pipeline/agents/orchestration-lifecycle-events.ts` owns the normalized spawn/kill lifecycle telemetry field set.
- Nova reviewer lifecycle: `skills/nova/pipeline/agents/reviewer-lifecycle.ts` owns Echo reviewer session spawn/kill, reviewer tracking labels, and reviewer lifecycle telemetry/Discord notices.
- Nova signal shutdown/reaper: `skills/nova/pipeline/agents/shutdown.ts` owns process signal hooks, tracked-session stop attempts, ACP wrapper process reaping, interrupted status persistence, telemetry Redis close, and module-runner shutdown context.
- Nova runtime facade: `skills/nova/pipeline/agents/runtime.ts` is role-local only; common `skills/common/pipeline/agents/runtime.ts` owns runtime/model classification.
- Nova session semantics facade: `skills/nova/pipeline/agents/session-semantics.ts` is role-local only; common `skills/common/pipeline/agents/session-semantics.ts` owns session-state parsing.
- Nova session termination facade: `skills/nova/pipeline/agents/session-termination.ts` is role-local only; common `skills/common/pipeline/agents/session-termination.ts` owns bounded termination result semantics.
- Nova tracked-agent facade: `skills/nova/pipeline/agents/tracked-agents.ts` is role-local only; common `skills/common/pipeline/agents/tracked-agents.ts` owns the process-local registry.
- Nova CLI parser facade: `skills/nova/pipeline/cli-args.ts` is role-local only; common `skills/common/pipeline/cli-args.ts` owns strict CLI parsing.

## Nova CLI and core foundation authorities

- Nova CLI/runtime entrypoint: `skills/nova/pipeline/cli.ts` owns operator flag normalization, direct-entry dispatch, temp-dir lifecycle around CLI runs, mandatory Nova channel enforcement for real pipeline runs, and top-level blueprint/status/dry-run/pipeline command routing.
- Nova config/progress loading and validation: `skills/nova/pipeline/core/config.ts` owns platform config + project progress loading, runtime config validation, plugin registry bootstrap, and Buster agent config validation. Policy resolution is re-exported from `core/policy.ts`.
- Platform swarm config discovery: `skills/nova/pipeline/core/platform-config.ts` owns default path and `SWARM_CONFIG` fallback discovery/parsing.
- Pipeline status/exit/plugin vocabulary: `skills/nova/pipeline/core/constants.ts` owns canonical status constants, exit codes, plugin kinds/hooks/stage ids/capability sets, and plugin rejection code constants.
- Pipeline runtime context and plugin context surfaces: `skills/nova/pipeline/core/context.ts` owns `PipelineContext`, runtime state snapshots, plugin invocation envelopes, capability-based input narrowing, and default plugin side-effect surfaces.
- Explicit dependency injection selection: `skills/nova/pipeline/core/deps.ts` owns scoped/flat dependency merge semantics for runtime/harness options.
- Nova Git context facade: `skills/nova/pipeline/core/git-context.ts` is a Nova-local adapter; `skills/common/pipeline/git-primitives.ts` remains the Git primitive authority behind the Nova facade.
- Nova structured logging context: `skills/nova/pipeline/core/logger.ts` owns active context binding, sanitized stderr logging, project/run pipeline JSONL append routing, and run-stats error capture.
- Nova path/ref layout: `skills/nova/pipeline/core/paths.ts` owns safe path validation and canonical `.swarm`, module, gate, approval, Redis, lint, cost, and run-log path/ref helpers.
- Model/thinking policy: `skills/nova/pipeline/core/policy.ts` owns model/thinking precedence, thinking support boundaries by dispatch path, and model-policy audit artifact shape.


## Nova plugin registry, run context, and public facade authorities

- Nova startup plugin registry: `skills/nova/pipeline/core/registry.ts` owns registry assembly, validation orchestration, deep-frozen records/indexes, registry summaries, stage/gate owner lookup, stage handler resolution, hook listener ordering, and registry error formatting.
- Built-in plugin bridge definitions: `skills/nova/pipeline/core/registry/builtins.ts` owns the built-in worker/gate/validator/generator/notification/telemetry module definitions and bridges PluginContextV1 calls to current implementation functions.
- Plugin config normalization: `skills/nova/pipeline/core/registry/config-normalization.ts` owns `config.plugins` defaults, module overrides, stage owner config, restricted capability allowlists, known capability aggregation, and reserved custom discovery path validation.
- Plugin owner indexes: `skills/nova/pipeline/core/registry/indexes.ts` owns hook index, decision-stage owner selection, gate-type owner validation, and notification/telemetry multi-listener treatment.
- Plugin manifest/config/capability validation: `skills/nova/pipeline/core/registry/validation.ts` owns manifest schema checks, config-schema envelope validation, module config default merging and JSON-schema-lite validation, gate-type/stage matching, trust policy, capability policy, and implementation method requirements.
- Nova run context/runtime helpers: `skills/nova/pipeline/core/runtime.ts` owns run id/stat creation, run context binding/resolution, effect receipt/id helpers, sanitized JSON stdout, run log dir derivation, and progress-file loading.
- Nova CLI temp manager: `skills/nova/pipeline/core/temp.ts` owns process-local temp directory creation and best-effort exit cleanup for CLI runs.
- Nova Git primitive facade: `skills/nova/pipeline/git-primitives.ts` is role-local only; common `skills/common/pipeline/git-primitives.ts` owns Git primitive behavior.
- Nova public pipeline barrel: `skills/nova/pipeline/index.ts` owns the selected public export surface for root/CLI imports but not implementation authority for exported services.
- Nova Discord webhook facade: `skills/nova/pipeline/integrations/discord-webhook.ts` is role-local only; common `skills/common/pipeline/integrations/discord-webhook.ts` owns webhook HTTP transport.


## Nova Discord/Gateway/Git and prompt-builder authorities

- Nova Discord notification/audit adapter: `skills/nova/pipeline/integrations/discord.ts` owns sanitized Nova Discord embed delivery, audit JSONL projection, notification dependency-injection, webhook mute policy, delivery degradation/restoration telemetry, and nonblocking Discord failure handling.
- Nova Gateway facade: `skills/nova/pipeline/integrations/gateway.ts` is role-local only; common `skills/common/pipeline/integrations/gateway.ts` owns Gateway IO behavior.
- Nova Git worktree policy: `skills/nova/pipeline/integrations/git-worktree.ts` owns polling-pull safety, runtime-state dirty/stash allowlist handling, pull-before-push conflict policy, push retry defaults, commit-and-push orchestration, and Forge-to-Buster commit metadata mutation.
- Nova lifecycle-state facade: `skills/nova/pipeline/lifecycle-state.ts` is role-local only; common `skills/common/pipeline/lifecycle-state.ts` owns lifecycle mutation semantics.
- Nova noncritical-reporting facade: `skills/nova/pipeline/noncritical-reporting.ts` is role-local only; common `skills/common/pipeline/noncritical-reporting.ts` owns nonblocking incident reporting.
- Buster gate prompt builder: `skills/nova/pipeline/prompts/buster-gate.ts` owns gate-instruction file loading and Buster gate test prompt assembly.
- Buster module prompt builder: `skills/nova/pipeline/prompts/buster-instructions.ts` and `skills/nova/pipeline/prompts/buster-module.ts` own module `BUSTER.md` loading and Buster module prompt assembly.
- Forge prompt builder: `skills/nova/pipeline/prompts/forge.ts` owns module/substep `FORGE.md` aggregation, Forge retry anti-pattern framing, bounded operator remediation precedence, and Forge completion artifact instruction placement.
- Gate fix prompt builder: `skills/nova/pipeline/prompts/gate-fix.ts` owns gate remediation prompt assembly and the fixer final-action contract.


## Nova prompt contracts, shared facades, approval gate, and Buster-gate completion/control

- Nova prompt return contract: `skills/nova/pipeline/prompts/shared.ts` owns `makePromptResult` and shared prompt section/artifact-contract builders; individual prompt files own phase-specific prompt text.
- Review-gate prompt text: `skills/nova/pipeline/prompts/review.ts` owns reviewer output JSON instructions and review-fix prompt constraints.
- Nova redaction facade: `skills/common/pipeline/redaction.ts` remains canonical; `skills/nova/pipeline/redaction.ts` is a role-local adapter only.
- Nova Redis transport facade: `skills/common/pipeline/redis-transport.ts` remains canonical; `skills/nova/pipeline/redis-transport.ts` is a role-local adapter only.
- Phase 8 runner facade baseline: the remaining JavaScript files under `skills/nova/pipeline/runners/**` are pure `.ts` re-export facades only. Runtime behavior is owned by the paired TypeScript files. The retained facade list is `approval-gate-control.js`, `approval-gate-shared.js`, `buster-gate-completion.js`, `buster-gate-control.js`, `buster-gate-fix-cycle.js`, `buster-gate-runner.ts`, `buster-gate-task.js`, `buster-gate-terminal.js`, `module-runner/preflight.js`, `pipeline-runner-deps.js`, `pipeline-runner-shared.js`, and `pipeline-runner.js`; `tests/verification/contracts/check-runner-facade-surface.mjs` fails if any retained facade grows behavior or an unclassified runner `.js` file appears.
- Approval gate status/timeout vocabulary and identity normalization: `skills/nova/pipeline/runners/approval-gate-shared.ts` is canonical for approval status strings, timeout policy strings, and gate identity normalization.
- Approval gate persistence/audit artifacts: `skills/nova/pipeline/runners/approval-gate-state.ts` owns gate-status loading/saving, corrupted/invalid fail-closed behavior, request/decision/transition artifacts, and default approval gate dependencies.
- Approval gate runtime flow: `skills/nova/pipeline/runners/approval-gate-runner.ts` owns approval gate initialization/resume, timeout resolution, approval signal waiting, operator presentation, and wait-controller adapter shape; status-store approval wait state is delegated to `services/status-store.js`.
- Approval gate typed-control projection: `skills/nova/pipeline/runners/approval-gate-control.ts` owns approval control-result construction/coercion while the shared typed gate-control contract owns the envelope.
- Buster gate completion evidence wait: `skills/nova/pipeline/runners/buster-gate-completion.ts` owns Nova-side mapping of Redis/canonical output-file Buster gate completion events into poll results; completion authority validation is delegated to `services/buster-completion-controller.js` and status projections to `services/status-store.js`. Legacy `gate-status.json` remains diagnostic in status projections but is not a runner completion source.
- Buster gate typed-control and remediation projection: `skills/nova/pipeline/runners/buster-gate-control.ts` owns failure-class inference, issue extraction, Buster gate control-result construction, and remediation request payload shaping.

## Nova gate dispatch, Buster gate remediation, and module Buster attempt authorities

- Generic Nova gate dispatch: `skills/nova/pipeline/runners/gate-runner.ts` owns gate type lookup through the startup plugin registry, gate invocation envelopes/state snapshots, gate-control adapter validation, gate execution failure mapping, and typed pipeline-step result construction.
- Buster gate runtime/remediation adapter: `skills/nova/pipeline/runners/buster-gate-runner.ts` owns Buster gate evaluation orchestration, stale evidence archival, Buster prompt dispatch, session rate-limit recovery wrapping, active-session persistence, remediation controller creation, and Buster gate registry adapter exposure.
- Buster gate dispatch identity helpers: `skills/nova/pipeline/runners/buster-gate-task.ts` owns gate-scoped Buster dispatch/archive/spawn/active-session/rate-limit identity construction.
- Buster gate terminal mapping: `skills/nova/pipeline/runners/buster-gate-terminal.ts` owns mapping Buster gate poll outcomes into telemetry/Discord/operator presentation and typed Buster gate control results.
- Buster gate fix adapter: `skills/nova/pipeline/runners/buster-gate-fix-cycle.ts` owns Buster-specific remediation prompt/correlation/cleanup policy around the shared Forge fix-cycle engine.
- Shared gate Forge fix-cycle engine: `skills/nova/pipeline/runners/gate-forge-fix-cycle.ts` owns shared Forge fix session orchestration for gate remediation, including spawn/health/no-change/rate-limit/commit/retest scheduler outcomes; Buster/review adapters own gate-specific content and terminal policy.
- Module attempt coordinator: `skills/nova/pipeline/runners/module-runner/attempt.ts` owns per-attempt module context/default resolution, dependency failure short-circuiting, module-runner dependency table, and handoff to the module attempt state machine.
- Module Buster phase dispatch: `skills/nova/pipeline/runners/module-runner/buster-phase/dispatch.ts` owns Buster module prompt save, pre-dispatch Buster config validation, Buster phase lifecycle mutation, shutdown context setup, queued Discord notice, and Buster worker invocation.
- Module Buster completion correlation: `skills/nova/pipeline/runners/module-runner/buster-phase/identity.ts` owns gateway/dispatch/session correlation precedence across Redis entry, completion identity, status aliases, and fallback session keys.

## Nova module attempt Buster-phase authorities

- Nova module attempt state machine: `skills/nova/pipeline/runners/module-runner/state-machine.ts` owns per-module attempt action planning, blueprint release entry, stage defaulting, Forge/pre-Buster/Buster ordering, and unexpected-status terminal handling.
- Nova Forge preflight contract gate: `skills/nova/pipeline/runners/module-runner/preflight.ts` owns converting pre-Forge contract validation failures into the standard module retry/terminal result path.
- Nova module terminal result envelopes: `skills/nova/pipeline/runners/module-runner/terminal-results.ts` owns retry/pass/fail/blocked/rate-limit result projection for module-runner phases.
- Nova Buster phase orchestration: `skills/nova/pipeline/runners/module-runner/buster-phase.ts` owns Buster policy logging, crash retry loop orchestration, worker dispatch result interpretation, Redis completion adjudication application, and routing to terminal handlers; Buster terminal classification is driven by explicit typed failure-class evidence rather than verdict/source heuristics.
- Nova Buster poll-failure policy: `skills/nova/pipeline/runners/module-runner/buster-phase/poll-failure.ts` owns rate-limit exhaustion finalization, poll Git fail-closed results with operator-visible Git evidence, Redis/local completion conflict blocking, Buster crash retry, and crash-retry exhaustion handling.
- Nova Buster spawn-failure policy: `skills/nova/pipeline/runners/module-runner/buster-phase/spawn-failure.ts` owns spawn-failure operator alerting and terminal module fail telemetry.
- Nova Buster terminal failure policy: `skills/nova/pipeline/runners/module-runner/buster-phase/terminal-failure.ts` owns Buster terminal failure classification across infra crash, pre-test suite failure, repeated pre-test failure, and normal agent-test failure routing.
- Nova Buster terminal pass policy: `skills/nova/pipeline/runners/module-runner/buster-phase/terminal-pass.ts` owns module PASS finalization, Buster phase/pass telemetry, run stats update, and pass terminal result shaping.
- Nova Buster worker plugin bridge: `skills/nova/pipeline/runners/module-runner-buster-worker.ts` owns registry-backed `worker:module_buster` invocation, Buster worker plugin context/effects construction, active-agent status lifecycle callbacks, and typed worker-control normalization.
- Nova module Buster phase authority: `skills/nova/pipeline/runners/module-runner/buster-phase.ts` is the canonical Buster phase implementation; the old compatibility re-export has been deleted.

## Nova module Forge/pre-Buster and pipeline runner control authorities

- Nova module public retry facade: `skills/nova/pipeline/runners/module-runner.ts` owns the per-module retry loop and final module step-result projection; per-attempt behavior stays in `module-runner/attempt.ts` and phase files.
- Nova module Forge phase: `skills/nova/pipeline/runners/module-runner-forge.ts` owns Forge policy logging, prompt persistence handoff, `worker:module_forge` plugin invocation, Forge poll-result interpretation, Forge completion acceptance into `READY_FOR_TESTING`, Forge no-change/rate-limit/parse/git failure routing, and Forge-only PASS finalization with required durable Git persistence.
- Nova pre-Buster validation/sync gate: `skills/nova/pipeline/runners/module-runner-prebuster.ts` owns Buster-only promotion, delivery-lint/pre-check validator invocation for Forge+Buster modules, validation milestone enforcement, and Git sync-before-Buster terminal behavior.
- Nova module phase shared helper layer: `skills/nova/pipeline/runners/module-runner-shared.ts` owns module attempt timing/validation helpers, module worker/validator PluginContext input construction, module worker-control normalization, worker-runtime effect selection, and typed module pipeline-step construction.
- Pipeline runner dependency table: `skills/nova/pipeline/runners/pipeline-runner-deps.ts` owns the default dependency set and scoped override merge for the pipeline runner.
- Pipeline run concurrency lock: `skills/nova/pipeline/runners/pipeline-runner-lock.ts` owns the leased `active-run.lock.json` schema, heartbeat, stale reclamation, release validation, and durable operator alerts for lock conflicts.
- Pipeline loop validator bridge: `skills/nova/pipeline/runners/pipeline-runner-loop.ts` owns scheduled-validator step execution/projection/completion before delegating iteration to `pipeline-runner-state-machine.js`.
- Pipeline stale recovery: `skills/nova/pipeline/runners/pipeline-runner-recovery.ts` owns startup stale module/gate reconciliation policy; session identity authority is delegated to `services/session-authority.js`, ACP observation to `services/acp-observability.js`, and session termination to `agents/session-termination.js`. Stale module statuses with no typed active-session evidence are left unchanged and emit durable operator evidence instead of resetting from age alone.
- Pipeline scheduling snapshot helpers: `skills/nova/pipeline/runners/pipeline-runner-scheduling/snapshots.ts` owns simple status counting and summary artifact-ref discovery for generator/scheduling snapshots.


## Nova pipeline runner scheduling and terminal authorities

- Scheduled validator completion state: `skills/nova/pipeline/runners/pipeline-runner-scheduling/validator-completions.ts` owns the durable `scheduled-validator-completions.json` marker file and in-memory `config._validatorRunState` cache for scheduler idempotency. Unreadable durable completion state fails closed with an operator-repair error and is not treated as an empty completion set.
- Pipeline scheduling and plugin envelopes: `skills/nova/pipeline/runners/pipeline-runner-scheduling.ts` owns next-step selection, configured validator schedule normalization, mandatory full-lint-before-review insertion, scheduled validator/generator PluginContext input construction, and generator/validator contract normalization. Unknown `execution_order` targets fail validation unless they resolve to an explicit typed module, gate, or validator target.
- Pipeline shared scheduler projections: `skills/nova/pipeline/runners/pipeline-runner-shared.ts` owns runner-local projection helpers and halt/escalation payload shaping; canonical module/gate read-model authority remains in `services/status-store.js`.
- Pipeline run startup: `skills/nova/pipeline/runners/pipeline-runner-start.ts` owns run-scoped startup telemetry, single-module mode, pre-run architecture validation dispatch, and startup log/config snapshot preparation.
- Pipeline loop state machine: `skills/nova/pipeline/runners/pipeline-runner-state-machine.ts` owns the action plan from scheduler output to validator/gate/module execution and terminal delegation. It requires explicit typed next-step kinds and fails unknown/missing kinds instead of defaulting them to module work.
- Pipeline terminal finalization: `skills/nova/pipeline/runners/pipeline-runner-terminal.ts` owns typed pipeline-step result acceptance, terminal lifecycle/telemetry/Discord/summary/cost side effects, terminal idempotency, blocked summary scheduling, and completion generators.
- Public Nova pipeline runner facade: `skills/nova/pipeline/runners/pipeline-runner.ts` owns the public `runPipeline` orchestration wrapper, observer sidecar lifecycle, stale-state reconciliation sequencing, status output, and dry-run display.
- Generic remediable gate engine: `skills/nova/pipeline/runners/remediable-gate-engine.ts` owns registry-backed remediable gate plugin execution and request-fix loop mechanics; gate-specific controllers own fix/evaluate policy details. Fix outcomes must use the typed `terminal`/`retry_request_fix`/`re_evaluate` union, and degraded fix evidence is carried into re-evaluation context.
- Review gate typed-control construction: `skills/nova/pipeline/runners/review-gate-control.ts` owns explicit review typed-control decisions and review remediation request construction.
- Review gate Forge fix adapter: `skills/nova/pipeline/runners/review-gate-fix-cycle.ts` owns review-specific Forge fix prompt/correlation/cleanup policy while `gate-forge-fix-cycle.js` owns shared Forge cycle mechanics.

## Nova review gate, waitable gate, adapter, facade, and observability-comparator authorities

- Review output parsing and findings: `skills/nova/pipeline/runners/review-gate-output.ts` owns Echo review JSON status normalization, accepts only canonical `GO`/`NO-GO`, extracts issues, summarizes NO-GO reasons, and projects review findings.
- Review attempt execution: `skills/nova/pipeline/runners/review-gate-task.ts` owns a single Echo review cycle, including typed required/optional lint setup policy, reviewer session lifecycle, non-authoritative review artifact fan-out, durable artifact-degradation alerts, output commit/copy, and output parsing. Required lint setup failures and review output publication degradation are gate failures; artifact fan-out failures are observability side effects.
- Review gate policy and registry adapter: `skills/nova/pipeline/runners/review-gate-runner.ts` owns review stage evaluation policy, typed review config normalization, explicit/single primary-reviewer policy, rate-limit/invalid-contract/missing-reviewer routing, review remediation controller creation, and the built-in review gate-control adapter.
- Stage envelope primitives: `skills/nova/pipeline/runners/stage-envelope-primitives.ts` owns typed stage ref construction, plugin invocation object creation, and existing-artifact filtering used by scheduler/module/gate callers. Malformed refs throw; optional artifact refs remain materialized-only policy.
- Waitable gate execution bridge: `skills/nova/pipeline/runners/waitable-gate-engine.ts` owns wait-controller validation and scheduled waitable gate execution through registered `gate.execute` handlers. It returns typed control results after wait resolution.
- Shared security helpers: `skills/common/pipeline/security.ts` remains canonical; Nova `pipeline/security.js` is a role-local facade.
- Shared ACP Gateway/session contract: `skills/common/pipeline/services/acp-gateway-contract.ts` remains canonical; Nova `services/acp-gateway-contract.ts` is a role-local facade.
- ACP stale-session observability sampling: `skills/nova/pipeline/services/acp-observability.ts` owns polling ACP monitor state into gateway/transcript observability surfaces during Nova recovery.
- Runtime adapter allowlist: `skills/nova/pipeline/services/adapter-registry.ts` owns canonical Redis adapter and project-summary generator resolution, alias normalization, method validation, injected-adapter test seams, and unknown-adapter fail-closed errors.
- Agent-observability evidence comparison: `skills/nova/pipeline/services/agent-observability-evidence/comparator.ts` owns parallel-run hook-vs-legacy evidence normalization, coverage/span/timing/identity/Redis-pressure summaries, and comparator status classification.

## Nova agent-observability ingestion, Forge completion, and approval signal authorities

- Agent-observability evidence report types: `skills/nova/pipeline/services/agent-observability-evidence/types.ts` owns the Nova evidence report shape used by the comparator island.
- Agent-observability ingester config: `skills/nova/pipeline/services/agent-observability-ingester/config.ts` owns ingester enablement, Redis connection option resolution, consumer group/name defaults, command timeout defaults, stream caps, and pressure thresholds.
- Agent-observability control-stream consumer: `skills/nova/pipeline/services/agent-observability-ingester/consumer.ts` owns Redis consumer-group processing, ingress validation, control-stream dead-letter/ACK policy, telemetry emission handoff, pressure reporting, trimming, and ingester loop state.
- Agent-observability telemetry mapping: `skills/nova/pipeline/services/agent-observability-ingester/mapper.ts` owns promotion from validated hook ingress events to current telemetry event payloads.
- Agent-observability model usage aggregation: `skills/nova/pipeline/services/agent-observability-ingester/usage-aggregation.ts` owns conversion of model-usage hook deltas into run aggregate projections and observability usage snapshots.
- Agent-observability ingester package surface: `skills/nova/pipeline/services/agent-observability-ingester/index.ts` owns the local TypeScript export/factory surface consumed by JS runtime code.
- Pipeline-started ingester sidecar: `skills/nova/pipeline/services/agent-observability-runtime.ts` owns enabling/disabling and lifecycle management of the ingester sidecar inside `runPipeline`.
- Forge completion authority: `skills/nova/pipeline/services/agent-observability-forge-completion.ts` owns `agent.ended` telemetry identity matching, meaningful Git diff evidence, control/runtime path exclusion, and Forge-ready/no-work status construction; ACP session monitor completion is fallback only.
- Approval signal filesystem adapter: `skills/nova/pipeline/services/approval-signal-event-adapter.ts` owns local approval state file watch/debounce/read error handling and conversion into canonical EventBus `approval.signal`/`fatal.error` events; approval gate policy remains in the runner/shared approval modules.

## Nova architecture validation, artifact, blueprint, and Buster completion authorities

- Nova deterministic architecture checks: `skills/nova/pipeline/services/arch-validator-checks.ts` owns progress/module/gate/test-spec/dependency/model finding codes and deterministic finding construction.
- Nova architecture validator stage: `skills/nova/pipeline/services/arch-validator.ts` owns the registered architecture validator execution, optional agent-judgment prompt, validator artifacts, blocking policy, and typed validator control-result projection.
- Pipeline artifact authority policy: `skills/nova/pipeline/services/artifact-bundle.ts` owns pipeline artifact surface classification, evidence authority metadata, latest/summary bundle shapes, and plugin artifact lane persistence API.
- Nova blueprint and control-file sync: `skills/nova/pipeline/services/blueprint.ts` owns architecture-branch module blueprint release, gate file release, selected-path commits, and architecture control-file synchronization.
- Nova Buster completion event controller: `skills/nova/pipeline/services/buster-completion-controller.ts` owns event-driven Buster completion wait resolution, Redis completion validation projection, default expected terminal statuses, and gate local-evidence resolver shape. Completion truth remains delegated to Redis completion schema validation and `services/completion-adjudicator.js`.

## Nova case-study, completion adjudication, event adapter, and contract authorities

- Case-study generator: `skills/nova/pipeline/services/case-study.ts` owns case-study instruction/output paths, summary-agent spawn/poll/cleanup flow, case-study summary telemetry, and typed generator result projection.
- Completion truth adjudication: `skills/nova/pipeline/services/completion-adjudicator.ts` owns identity normalization, Redis/local completion projection, drift/conflict detection, active-dispatch confirmation policy, and Redis-to-status application decisions.
- Completion event edge adapters: `skills/nova/pipeline/services/completion-event-adapters.ts` owns Redis completion stream and local filesystem evidence adapter conversion into pipeline EventBus events; downstream controllers own final decisions.
- Contract-invalid diagnostics: `skills/nova/pipeline/services/contract-diagnostics.ts` owns redacted invalid-plugin-contract diagnostic shape and `PLUGIN_CONTRACT_INVALID` error helpers.
- Control-result mapping helper: `skills/nova/pipeline/services/contracts/control-result-mapping.ts` owns the small shared mapping object shape still used by validator result mapping.
- Gate control result contract: `skills/nova/pipeline/services/contracts/gate-control-result.ts` owns typed gate-control schema/actions, gate validation, and remediable gate control validation.
- Generator result contract: `skills/nova/pipeline/services/contracts/generator-result.ts` owns typed generator result/artifact schema validation and normalization.
- Contract namespace barrel: `skills/nova/pipeline/services/contracts/index.ts` was deleted as `DELETE_LEGACY`; Nova typed contract consumers must import owning contract modules directly.

## Nova typed result, identity, dependency, alert, and failure authorities

- Pipeline step result contract: `skills/nova/pipeline/services/contracts/pipeline-step-result.ts` owns typed pipeline step schema, action/outcome/terminal-exit mapping, and validation.
- Typed validator control contract: `skills/nova/pipeline/services/contracts/validator-control-result.ts` owns module validator typed result construction, validation, normalization, and old validator-result-to-control mapping.
- Typed worker control contract: `skills/nova/pipeline/services/contracts/worker-control-result.ts` owns typed worker validation/normalization for module Forge/Buster worker controls.
- Correlation identity authority: `skills/nova/pipeline/services/correlation.ts` owns status/result/read-model identity resolution, provenance reporting, canonical invocation refs/ids, and plugin invocation correlation snapshots.
- Module dependency scheduling gate: `skills/nova/pipeline/services/dependencies.ts` owns dependency satisfaction checks for module-to-module and gate-to-module dependencies, while status-store projection modules own the read-model projections it consumes.
- Discord identity field facade: `skills/nova/pipeline/services/discord-fields.ts` is a Nova-local facade; `skills/nova/pipeline/services/rate-limit-contract.ts` owns the actual field specs/builders.
- Durable operator alert evidence: `skills/nova/pipeline/services/durable-operator-alert.ts` owns sanitized local JSONL alert persistence and nonblocking write-failure reporting for operator alerts.
- Failure semantics taxonomy: `skills/nova/pipeline/services/failure-semantics.ts` owns normalized failure layers/sources/codes/classes, monitor failure fact mapping, and stale recovery descriptions.
- Failure classification surface: `skills/nova/pipeline/services/failures/classification.ts` owns fail-pattern metadata, text/git/pre-test classifiers, and Buster pre-test verdict summarization helpers.
- Failure incident reporting: `skills/nova/pipeline/services/failures/incidents.ts` owns the failure-surface incident key/report wrapper over common noncritical reporting.


## Nova failure/retry, gate-remediation, governance, lint, and validator authorities

- Failure presentation and Nova injection: `skills/nova/pipeline/services/failures/presentation.ts` owns Discord field shaping for failure surfaces, rate-limit embed delegation, Nova-channel injection message/log records, and pre-test suite Discord fields; Gateway/Discord integrations own transport.
- Module retry/escalation policy: `skills/nova/pipeline/services/failures/retry-policy.ts` owns fail-count mutation, auto-retry threshold resolution, max-fail blocking, telemetry emission, and Nova escalation result construction for module failures.
- Failure helpers have no public barrel authority: callers import `skills/nova/pipeline/services/failure-semantics.ts`, `skills/nova/pipeline/services/failures/classification.ts`, `skills/nova/pipeline/services/failures/presentation.ts`, and `skills/nova/pipeline/services/failures/retry-policy.ts` directly.
- Legacy Forge completion artifact reader: `skills/nova/pipeline/services/forge-completion.ts` owns validation/reading of agent-side `forge-completion.json`; agent-observability Forge completion remains the newer completion authority for hook-based completion evidence.
- Gate active-session recovery authority: `skills/nova/pipeline/services/gate-active-session.ts` owns the policy that lifecycle read models are authoritative and gate active-session files/tracked agents are diagnostic recovery evidence only.
- Gate Forge-fix scaffold authority: `skills/nova/pipeline/services/gate-fix-scaffold.ts` owns common Forge fix-cycle spawn/health/poll/cleanup scaffolding around gate remediation; caller adapters own gate-specific prompt and terminal policy.
- Git soft-fail observability: `skills/nova/pipeline/services/git-soft-fail-observability.ts` owns the telemetry projection for nonterminal Git commit/push degradation. Gate Forge fix cycles may re-evaluate local typed file changes after Git persistence degradation, but the degraded publication state must remain visible and must not be described as durable success.
- Governance run context: `skills/nova/pipeline/services/governance-context.ts` owns in-memory aggregation of architecture-validator and approval-gate outcomes for summaries/embeds; individual governance modules own durable artifacts.
- Lint report subprocess boundary: `skills/nova/pipeline/services/lint.ts` owns invoking lint-report tooling, parsing report JSON, formatting reviewer/pre-check summaries, and archiving pre-check reports.
- Built-in validator stage bridge: `skills/nova/pipeline/services/module-validators.ts` owns delivery/pre-check/full-lint validator stage adapters and typed validator-control result construction through the contract builder.

## Nova notification, observability, plugin runtime, and polling authorities

- Notification hook contract: `skills/nova/pipeline/services/notification-contract.ts` owns Nova notification hook ids, notification input envelope validation, built-in notification sink plugin manifests, and sink observer behavior for telemetry, structured-event artifacts, and Discord presentations.
- Notification dispatch authority: `skills/nova/pipeline/services/notification-dispatch.ts` owns registry listener resolution, per-listener PluginContext invocation, listener-missing degraded evidence, and per-listener failure isolation for notification hooks.
- Nova observability transition and cost authority: `skills/nova/pipeline/services/observability.ts` owns in-process degraded/restored dedupe state, structured event artifact appends, durable observability transition emission, usage snapshot aggregation, budget warning/exceeded evaluation, and cost report writing.
- OpenClaw observer plugin sidecar authority: `skills/nova/pipeline/services/openclaw-plugin-runtime.ts` owns enable/disable command invocation and local started state for the external agent-observer plugin controller used by `runPipeline`.
- Shared pipeline event contract: `skills/common/pipeline/services/pipeline-event-contract.ts` remains canonical; Nova `services/pipeline-event-contract.ts` is a role-local facade.
- Buster module completion wait bridge: `skills/nova/pipeline/services/polling-dual.ts` owns module-level Redis+local completion waiting and projection to the caller poll result; completion truth remains delegated to `services/buster-completion-controller.js` and `services/completion-adjudicator.js`.
- ACP polling identity helpers: `skills/nova/pipeline/services/polling-identity.ts` owns pure polling identity/log-key normalization for file, session, and status polling surfaces.
- ACP polling observability helpers: `skills/nova/pipeline/services/polling-observability.ts` owns gateway/transcript progress payload shaping, transcript delta publication scheduling, and periodic agent progress emission for polling loops.
- Redis completion archive authority: `skills/nova/pipeline/services/polling-redis-completion.ts` owns pre-dispatch stale completion archiving through the registered Redis adapter and degraded evidence for archive failures.
- ACP session end polling authority: `skills/nova/pipeline/services/polling-session-end.ts` owns session-end wait policy, terminal grace period, timeout nudges, ACP monitor adapter lifecycle, rate-limit cooldown delegation, final Git pull/change detection, and subagent transcript mirroring; caller-owned flows decide terminal pipeline outcomes and Git persistence.

## Nova polling, prompt ingress, and rate-limit authorities

- Nova polling facade and poll-result envelope: `skills/nova/pipeline/services/polling.ts` owns generic budgeted polling, status/file poll envelopes, Forge/Buster polling wrapper selection, and rate-limit recovery wrapper composition.
- Forge completion polling authority: `skills/nova/pipeline/services/polling.ts` delegates canonical completion evidence to `agent.ended` telemetry plus meaningful Git diff collection in `agent-observability-forge-completion.js`; ACP monitor terminal state is fallback evidence only.
- Buster module completion waiting: `skills/nova/pipeline/services/polling.ts` delegates event-driven Redis/local Buster completion authority to `services/polling-dual.js`, `services/buster-completion-controller.js`, and `services/completion-adjudicator.js`.
- Nova operator prompt ingress: `skills/nova/pipeline/services/prompt-ingress.ts` owns inline/file prompt path policy, bounded size enforcement, secret redaction, and untrusted directive formatting for CLI-provided remediation prompts.
- Nova rate-limit status builder authority: `skills/nova/pipeline/services/rate-limit-builders.ts` owns normalized module/gate/summary RATE_LIMITED status shapes, tracked correlation helper state, retry-exhausted telemetry payloads, and recovery option construction.
- Rate-limit exhaustion option scaffolding: `skills/nova/pipeline/services/rate-limit-builders/exhaustion-options.ts` owns reusable gate/summary exhaustion hook construction and tracked module status merging over persisted status-store state.
- Shared rate-limit contract: `skills/common/pipeline/services/rate-limit-contract.ts` remains canonical; Nova `services/rate-limit-contract.ts` is a role-local facade.
- Rate-limit terminal exit/finalizer authority: `skills/nova/pipeline/services/rate-limit-exit.ts` owns canonical exhausted exit-result construction, terminal-owned Redis rate-limit projection, durable local operator alert writing before delivery hooks, and module/gate/summary finalizer wrappers.

## Nova rate-limit, Redis completion, remediation, serialization, session authority, and compatibility projection authorities

- Nova rate-limit orchestration: `skills/nova/pipeline/services/rate-limit.ts` owns pause/resume/exhaustion control flow, durable cooldown replay, lifecycle cooldown event emission, and legacy module status pause/resume synchronization; builder and finalizer details remain in `rate-limit-builders.js` and `rate-limit-exit.js`.
- Redis completion stream selection/archive: `skills/nova/pipeline/services/redis-completion.ts` owns strong expected completion identity matching, canonical Buster completion-source filtering, conflict/duplicate/ignored-source diagnostics, tail scanning, and stale completion archival policy.
- Redis exchange/operation artifact logging: `skills/nova/pipeline/services/redis-log.ts` owns bounded local Redis JSONL artifacts and nonblocking incident reporting for logging failures.
- Shared Redis message contract: `skills/common/pipeline/services/redis-message-contract.ts` remains canonical; Nova `services/redis-message-contract.ts` is a production-path facade.
- Gate remediation handoff contract: `skills/nova/pipeline/services/remediation-handoff.ts` owns typed gate `request_fix` remediation diagnostics and remediation controller validation/resolution.
- Serialization helpers: `skills/nova/pipeline/services/serialization.ts` owns JSON-safe clone/sanitize and read-only snapshot/freeze helpers used by typed contract and plugin-context boundaries.
- Active-session authority policy: `skills/nova/pipeline/services/session-authority.ts` owns the policy that lifecycle read models are active-session authority and status files/active-session JSON/tracked agents are diagnostic evidence only.
- Status-store compatibility projection metadata: `skills/nova/pipeline/services/status-store-compat/common.ts` owns projection source labels shared by legacy evidence projections.
- Gate scheduler/read-model compatibility projection: `skills/nova/pipeline/services/status-store-compat/gate-projection.ts` owns gate output-file reading, legacy gate-status diagnostic classification, approval wait synchronization into lifecycle events, gate scheduler projection, and gate scheduler drift metadata.
- Module scheduler/read-model compatibility projection: `skills/nova/pipeline/services/status-store-compat/module-projection.ts` owns explicit legacy module status bootstrap policy, authoritative module-state projection into status snapshots, legacy status JSON reading, scheduler projection, and module scheduler drift metadata.

## Nova status-store lifecycle, read-model, and diagnostic status authorities

- Nova public status-store facade: `skills/nova/pipeline/services/status-store.ts` owns log directory initialization, public status/lifecycle/projection export surface, diagnostic `status.json` writes, guarded status-field enforcement, redacted prompt/transcript persistence, and gate output archive copies. Canonical module state comes from lifecycle read models, not status files.
- Lifecycle facade: `skills/nova/pipeline/services/status-store-lifecycle.ts` owns the stable import surface for canonical lifecycle events/read models/refs while delegating authority to leaf modules.
- Lifecycle event appender: `skills/nova/pipeline/services/status-store-lifecycle/appenders.ts` owns canonical lifecycle event construction, idempotent append behavior, event data normalization, stale-recovery/cooldown/wait/module append policy, and read-model projection save handoff.
- Lifecycle idempotency: `skills/nova/pipeline/services/status-store-lifecycle/idempotency.ts` owns deterministic lifecycle event idempotency keys and duplicate event fingerprinting.
- Lifecycle legality: `skills/nova/pipeline/services/status-store-lifecycle/legality.ts` owns legal transition checks for pipeline terminality, waits/resume signals, cooldowns, stale recovery, and module attempt sequencing.
- Lifecycle projections: `skills/nova/pipeline/services/status-store-lifecycle/projections.ts` owns canonical event-to-read-model projection for pipeline, module, gate, wait, signal, cooldown, progression, scheduler-consumed approval state, and stale active-session clearing.
- Lifecycle read models: `skills/nova/pipeline/services/status-store-lifecycle/read-models.ts` owns lifecycle read-model schema defaults, load/save/cache behavior, event log reads, and progression recomputation.
- Lifecycle refs: `skills/nova/pipeline/services/status-store-lifecycle/refs.ts` owns canonical run/module-attempt/gate-evaluation/wait/resume-signal/cooldown ref construction and module identity/attempt/commit resolution.
- Lifecycle storage: `skills/nova/pipeline/services/status-store-lifecycle/storage.ts` owns run-scoped lifecycle directory/file paths and atomic JSON/JSONL storage primitives.
- Status-store compatibility facade: `skills/nova/pipeline/services/status-store-compat.ts` owns the public compatibility re-export surface for legacy module/gate projections; canonical authority remains in lifecycle read models and gate output evidence.


## Nova summary, local I/O warning, task transport, and telemetry authorities

- Nova pipeline summary authority: `skills/nova/pipeline/services/summary.ts` owns final summary JSON/latest pointer writing, cumulative status aggregation, pipeline-review prompt/output paths, Echo review dispatch/poll/finalization, and summary generator result shaping.
- Nova project summary adapter authority: `skills/nova/pipeline/services/summary/project-summary.ts` owns registry-backed project summary invocation, sanitized artifact writes, summary telemetry, and optional Discord project-summary embeds.
- Summary session cleanup authority: `skills/nova/pipeline/services/summary-session-cleanup.ts` owns one-shot cleanup for tracked summary/case-study/review sessions, including termination-result validation and untracking diagnostics.
- System I/O warning authority: `skills/nova/pipeline/services/system-io-warning.ts` owns nonblocking warning payloads for policy audit, pipeline JSONL, and prompt artifact write failures plus bare-metal stderr fallback.
- Shared task transport contract: `skills/common/pipeline/services/task-transport-contract.ts` is canonical; Nova `services/task-transport-contract.ts` is a role-local production-path facade.
- Nova telemetry event dispatch authority: `skills/nova/pipeline/services/telemetry/dispatch.ts` owns validation-before-dispatch, telemetry sink fanout, disk audit append, operator alert durability, and degraded-observability reporting for telemetry failures.
- Shared telemetry payload schema: `skills/common/pipeline/services/telemetry/payload-schema.ts` is canonical; Nova `services/telemetry/payload-schema.ts` is a role-local production-path facade.
- Nova telemetry builder authority: `skills/nova/pipeline/services/telemetry/builders.ts` owns pipeline/module/gate/agent/retry/escalation/summary/budget/approval/cost/rate-limit event shape builders and observability degraded/restored state transitions.
- Nova transcript/progress telemetry authority: `skills/nova/pipeline/services/telemetry/progress.ts` owns `agent.transcript` and `agent.progress` event projection from polling observation data.
- Nova telemetry sink shutdown authority: `skills/nova/pipeline/services/telemetry/sinks.ts` owns graceful close delegation for the telemetry Redis stream singleton.

## Nova telemetry sink, validation, truth-drift, and lint-report authorities

- Nova telemetry public facade: `skills/nova/pipeline/services/telemetry.ts` owns the public telemetry service export surface for dispatch, builders, progress, schema, observability, durable alerts, and close helpers.
- Telemetry sink plugin contract: `skills/nova/pipeline/services/telemetry-sink-contract.ts` owns the `telemetry.sink` hook/stage ids, sink input contract, and built-in Redis/Discord sink plugin definitions.
- Telemetry sink dispatch: `skills/nova/pipeline/services/telemetry-sink-dispatch.ts` owns registry listener resolution, capability-narrowed sink invocation, and per-sink degradation/restoration isolation.
- Nova Redis telemetry stream writer: `skills/nova/pipeline/services/telemetry-stream.ts` owns project/run stream-key derivation, sequence allocation, sanitized Redis `XADD` emission, and the telemetry Redis singleton lifecycle.
- Truth drift projection: `skills/nova/pipeline/services/truth-drift.ts` owns diagnostic scheduler/completion drift reports; lifecycle projections and completion adjudication remain the underlying authorities.
- Nova preflight/delivery validation: `skills/nova/pipeline/services/validation.ts` owns FORGE deliverable checks, Dockerfile/static-path delivery lint, validation codes, and operator formatting.
- Shared telemetry helper facade: `skills/common/pipeline/telemetry.ts` is canonical; Nova `pipeline/telemetry.ts` is a repo/dev production-path facade.
- Shared timing/budget facade: `skills/common/pipeline/timing.ts` is canonical; Nova `pipeline/timing.js` is a repo/dev production-path facade.
- Lint-report defaults: `skills/nova/pipeline/tools/lint-report/constants.ts` owns lint-report version, default tier, timeout, and tier descriptions.
- Lint-report container/YAML tool registration: `skills/nova/pipeline/tools/lint-report/container-yaml-tools.ts` owns hadolint, Helm lint, kubeconform, and yamllint registration/result mapping within the lint-report tool registry.


## Nova lint-report and project-summary authorities

- Lint-report CLI/tool entrypoint: `skills/nova/pipeline/tools/lint-report.ts` owns lint-report CLI parsing, context construction, scope resolution handoff, report execution, JSON output, and lint-report process exit semantics.
- Lint-report discovery: `skills/nova/pipeline/tools/lint-report/discovery.ts` owns project-type marker detection, platform ESLint/Semgrep config candidate discovery, tsconfig nearest-directory lookup, policy source-file discovery, and changed-file scope filtering.
- Lint-report subprocess boundary: `skills/nova/pipeline/tools/lint-report/execution.ts` owns safe external command execution and command-availability checks for lint-report tools.
- Lint-report output/logging: `skills/nova/pipeline/tools/lint-report/output.ts` owns lint-report structured stderr logs, optional dual-write log path, help text, and JSON report output.
- Lint-report parser helpers: `skills/nova/pipeline/tools/lint-report/parsers.ts` owns tool JSON parse diagnostics and repo-policy public export-name extraction.
- Lint-report orchestration/report shape: `skills/nova/pipeline/tools/lint-report/report.ts` owns applicable-tool selection, per-tool status normalization, warning/config/parse-failure finding builders, and aggregate summary counts.
- Lint-report tool registry: `skills/nova/pipeline/tools/lint-report/tool-registry.ts` owns built-in static-analysis tool definitions, arguments, parsing, and standardized findings; container/YAML registration remains delegated to `container-yaml-tools.ts`.
- Project summary formatter authority: `skills/nova/pipeline/tools/project-summary-formatters.ts` owns Markdown, Discord embed, case-study JSON, scope grouping, and display formatting projections for project-summary data.
- Project summary generator authority: `skills/nova/pipeline/tools/project-summary.ts` owns project-summary data collection from Git/source/`.swarm` artifacts and direct CLI/Discord behavior; `services/summary/project-summary.ts` remains the pipeline artifact-writing adapter.


## Nova Redis adapter and entrypoint shim authorities

- Nova Redis adapter authority: `skills/nova/pipeline/tools/redis.ts` owns the registered Redis tool adapter for Buster task publication, strong-identity completion reads, stale completion archival, Redis operation callback logging, and direct Redis operator CLI behavior. Redis completion selection/archive policy remains in `services/redis-completion.js`; task queue mechanics remain in the common task transport contract.
- Nova executable compatibility entrypoint: `skills/nova/pipeline.ts` owns the `/app/skills/pipeline.ts` compatibility shim and public re-export surface delegation. `pipeline/index.ts` owns public API exports and `pipeline/cli.ts` owns runtime CLI behavior.

## Phase 6 completion audit note

Phase 6 completed the Nova/Common orchestration authority cleanup audited in `docs/ts-migration/phase-6-completion-audit.md`. The final Phase 6 authority state is:

- Broad Nova contract namespace authority remains deleted; callers use direct owning contract modules.
- Nova runner authority for module workers, scheduling/recovery, gates/review, polling/completion, validation, observability, and agent-observability sidecars now lives in the migrated `.ts` owners named in the Phase 6 changelogs.
- Remaining JavaScript files in Nova/Common are either role-local facades, external adapters, or out-of-scope future owners; they are not alternate authority for migrated Phase 6 `.ts` owners.
- Phase 6 audit found no stale runtime import/export specifiers resolving to deleted Phase 6 `.js` owners and no obsolete Nova/Common `.d.ts` shims for newly typed owners.
