# Phase 0 Batch Plan — Pipeline TypeScript Migration
Generated: `2026-05-18 20:49 UTC`
Scope: pipeline-relevant code under `kubeclaw-main/skills/*`.

Included code targets:
- `kubeclaw-main/skills/nova/pipeline.ts`
- `kubeclaw-main/skills/nova/pipeline/**/*.{js,ts}`
- `kubeclaw-main/skills/buster/buster-pipeline.ts`
- `kubeclaw-main/skills/buster/pipeline/**/*.{js,ts}`
- `kubeclaw-main/skills/common/pipeline/**/*.{js,ts}`

Excluded from this migration batch plan:
- tests and verification code
- docs, package manifests, tsconfig files, and other non-runtime code metadata
- non-pipeline utility `kubeclaw-main/skills/common/discord-purge.ts`

Batch constraints:
- max 10 files per batch
- max 2,500 source lines per batch
- every file in a batch must be read fully during Phase 0 before migration work starts for that slice

Action meanings:
- `migrate JS→TS`: JavaScript source that must be converted during the migration.
- `review existing TS`: TypeScript source that already exists and must be mapped/read, but does not need JS→TS conversion.

Summary:
- Code files to read in Phase 0: `311`
- Total source lines to read: `60132`
- JS migration targets: `294` files / `57765` lines
- Existing TS review-only targets: `17` files / `2367` lines
- Planned batches: `34`

## Batch 01 — DONE — 10 files, 261 lines

| Lines | Action | File |
|---:|---|---|
| 238 | migrate JS→TS | `kubeclaw-main/skills/buster/buster-pipeline.ts` |
| 1 | review existing TS | `kubeclaw-main/skills/buster/pipeline/agent-observability/src/index.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/agents/acp-monitor.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/agents/lifecycle.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/agents/runtime.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/agents/session-semantics.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/agents/session-termination.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/agents/tracked-agents.ts` |
| 2 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/cli-args.ts` |
| 2 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/git-primitives.ts` |

### Phase 0 slice review — Buster runtime entrypoint and repo-local facades

```text
Slice: Buster runtime entrypoint and repo-local facades
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/buster/buster-pipeline.ts
  - kubeclaw-main/skills/buster/pipeline/agent-observability/src/index.ts
  - kubeclaw-main/skills/buster/pipeline/agents/acp-monitor.ts
  - kubeclaw-main/skills/buster/pipeline/agents/lifecycle.ts
  - kubeclaw-main/skills/buster/pipeline/agents/runtime.ts
  - kubeclaw-main/skills/buster/pipeline/agents/session-semantics.ts
  - kubeclaw-main/skills/buster/pipeline/agents/session-termination.ts
  - kubeclaw-main/skills/buster/pipeline/agents/tracked-agents.ts
  - kubeclaw-main/skills/buster/pipeline/cli-args.ts
  - kubeclaw-main/skills/buster/pipeline/git-primitives.ts
Runtime entrypoints affected: skills/buster/buster-pipeline.ts direct runtime/CLI; deployment starts node /app/skills/buster-pipeline.ts; --status prints {lastRunLogDir}.
Incoming callers: deployment command, runtime/contract/behavior verification, root-module import harnesses; Buster facades are reached by buster-pipeline re-exports or production /app/skills/pipeline/* shared-surface imports.
Outgoing dependencies: buster-pipeline imports Node fs/url plus Buster task queue, task lifecycle, gateway health, orphan recovery, base-image, capability, runtime diagnostic, cleanup, gateway, and session termination modules; facades re-export common pipeline modules.
Dynamic imports: none found.
Exported symbols: buster-pipeline re-exports helper, monitor, validation, diagnostic, base-image, capability, task-queue, gateway-health, orphan-recovery, lifecycle/termination, and telemetry symbols; facades export all shared module symbols.
Canonical authority used: Buster entrypoint owns process startup/shutdown/poll loop; task lifecycle, task queue, completion, session lifecycle/termination/monitor, CLI parser, Git primitives, and agent-observability authority are delegated to service/common modules.
Fallback/legacy/shim hits found: nine role-local compatibility/type facades; buster-pipeline defensive argv entry check; broad root public re-export surface.
Fallback decision:
  - deleted: none.
  - renamed as canonical: none.
  - kept as external adapter: role-local facades and defensive argv check.
  - needs user decision: whether the broad buster-pipeline root re-export surface remains public API after TS migration.
Behavior invariants: do not start main on module import; direct --status exits after JSON; shutdown attempts active-session termination, sandbox cleanup, Redis disconnect; gateway wait/recovery happen before task polling; queue loop delegates task execution through processTask.
Simplifications/optimizations: preserve thin entrypoint; migrate facades as adapters only or replace with explicit package export mapping later; avoid duplicating common helper types in Buster-local files.
Tests/checks run: out of scope; only source/docs inspection and git diff/status.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, entrypoint-inventory.md, existing-typescript-islands.md, phase-0-batch-plan.md.
Deleted files: none.
Open questions: Is buster-pipeline's broad root helper re-export surface a committed public API, or can callers move to service/common imports after migration?
```

## Batch 02 — DONE — 10 files, 473 lines

| Lines | Action | File |
|---:|---|---|
| 2 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/integrations/discord-webhook.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/integrations/gateway.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/lifecycle-state.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/noncritical-reporting.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/redaction.ts` |
| 2 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/redis-transport.ts` |
| 320 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/runners/suite-runner.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/security.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/services/acp-gateway-contract.ts` |
| 131 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/services/base-images.ts` |

### Phase 0 slice review — Buster shared facades, suite orchestration, and base-image preparation

```text
Slice: Buster shared facades, suite orchestration, and base-image preparation
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/buster/pipeline/integrations/discord-webhook.ts
  - kubeclaw-main/skills/buster/pipeline/integrations/gateway.ts
  - kubeclaw-main/skills/buster/pipeline/lifecycle-state.ts
  - kubeclaw-main/skills/buster/pipeline/noncritical-reporting.ts
  - kubeclaw-main/skills/buster/pipeline/redaction.ts
  - kubeclaw-main/skills/buster/pipeline/redis-transport.ts
  - kubeclaw-main/skills/buster/pipeline/runners/suite-runner.ts
  - kubeclaw-main/skills/buster/pipeline/security.ts
  - kubeclaw-main/skills/buster/pipeline/services/acp-gateway-contract.ts
  - kubeclaw-main/skills/buster/pipeline/services/base-images.ts
Runtime entrypoints affected: none; suite-runner is imported by task-lifecycle and base-images is called by buster-pipeline startup, but no batch file is a direct CLI/runtime/tool entrypoint.
Incoming callers: Buster task-lifecycle imports runSuites; buster-pipeline imports base-image startup helpers and Gateway facade; Buster services/suites import local common facades for Discord webhook, Gateway, noncritical reporting, redaction, security; verification imports production shared-surface facades.
Outgoing dependencies: facades re-export skills/common pipeline owners; suite-runner imports Node fs/path, verdict schema, telemetry, capabilities, and all Buster suite modules; base-images imports Node child_process/util/fs/path plus git-workflows, runtime-diagnostics, capabilities, and security.
Dynamic imports: none found.
Exported symbols: facades export all shared owner symbols; suite-runner exports runSuiteWithTimeout, runSuites, EXECUTION_ORDER, DEPENDENCIES; base-images exports BASE_IMAGES_STATIC, normaliseImage, validateBaseImageRef, loadBaseImagesFromProgress, ensureBaseImages.
Canonical authority used: common pipeline owns webhook, Gateway, lifecycle-state, noncritical reporting, redaction, Redis transport, security, and ACP Gateway contracts; suite-runner owns Buster suite order/dependencies/timeouts/verdict artifacts; base-images owns Buster image-ref validation, progress discovery, and capability-gated Podman pre-pull orchestration.
Fallback/legacy/shim hits found: eight Buster role-local common facades; suite-runner payload config/capability fallbacks, unknown-suite SKIP, default timeout, ERROR verdict conversion, and best-effort artifact writes; base-images bare-name normalization, optional progress scan, invalid/local image skip, capability-denied nonthrowing result, and best-effort Podman failures.
Fallback decision:
  - deleted: none.
  - renamed as canonical: suite timeout default; suite throw/timeout to ERROR verdict; optional progress scan; invalid/local image skip; capability-denied pre-pull result.
  - kept as external adapter: all role-local facades; payload config/capability old-shape fallbacks until callers canonicalize on test_config/capabilities.
  - needs user decision: unknown suite SKIP vs fail-fast; suite artifact write failures remaining nonterminal; bare image normalization vs FQN-only; Podman inspect/pull failures returning overall ok.
Behavior invariants: no batch file should become a direct entrypoint; facade files remain side-effect-light re-export adapters; suite execution must preserve deterministic ordering, dependency skips, capability preflight, suite telemetry, and verdict shape; base-image pre-pull must stay startup-only and capability-gated.
Simplifications/optimizations: later TS migration can keep facades as explicit adapters, type suite payload/context/verdict shapes, and split base-image candidate discovery from Podman execution without changing behavior.
Tests/checks run: out of scope; only source/docs inspection and git diff/status.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, phase-0-batch-plan.md.
Deleted files: none.
Open questions: Should unknown suites and best-effort artifact/image-prepull failures stay nonterminal, and should bare image names remain accepted after canonical payload typing?
```

## Batch 03 — DONE — 10 files, 1649 lines

| Lines | Action | File |
|---:|---|---|
| 173 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/services/capabilities.ts` |
| 383 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/services/discord.ts` |
| 58 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/services/gateway-health.ts` |
| 131 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/services/git-workflows.ts` |
| 198 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/services/logger.ts` |
| 55 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/services/orphan-recovery.ts` |
| 2 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/services/pipeline-event-contract.ts` |
| 374 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/services/pipeline-helpers.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/services/rate-limit-contract.ts` |
| 272 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/services/rate-limit.ts` |


### Phase 0 slice review — Buster service capabilities, Discord, gateway/git/logger/orphan helpers, pipeline helpers, and rate limiting

```text
Slice: Buster service capabilities, Discord, gateway/git/logger/orphan helpers, pipeline helpers, and rate limiting
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/buster/pipeline/services/capabilities.ts
  - kubeclaw-main/skills/buster/pipeline/services/discord.ts
  - kubeclaw-main/skills/buster/pipeline/services/gateway-health.ts
  - kubeclaw-main/skills/buster/pipeline/services/git-workflows.ts
  - kubeclaw-main/skills/buster/pipeline/services/logger.ts
  - kubeclaw-main/skills/buster/pipeline/services/orphan-recovery.ts
  - kubeclaw-main/skills/buster/pipeline/services/pipeline-event-contract.ts
  - kubeclaw-main/skills/buster/pipeline/services/pipeline-helpers.ts
  - kubeclaw-main/skills/buster/pipeline/services/rate-limit-contract.ts
  - kubeclaw-main/skills/buster/pipeline/services/rate-limit.ts
Runtime entrypoints affected: none; Buster entrypoint imports gateway health, orphan recovery, capabilities, and pipeline helpers, but no batch file is a direct CLI/runtime/tool entrypoint.
Incoming callers: buster-pipeline root imports/re-exports capabilities, gateway health, orphan recovery, and helpers; task lifecycle/session monitor/task queue/task completion import Discord, logger, rate-limit, event contract, and helpers; base-images/task-validation/suites/tools import capabilities and Git workflows; visual-reg Discord imports raw webhook delivery.
Outgoing dependencies: Node fs/path built-ins; local runtime, telemetry, verdict, sandbox cleanup, security, timing, git primitives, ACP monitor, runtime diagnostics, common facade modules, and shared common pipeline-event/rate-limit contracts.
Dynamic imports: none found.
Exported symbols: capability constants/error/helpers and durable alert helpers; Discord send/delivery helpers; gateway readiness/health constants and functions; Git primitive re-exports plus gitSync/gitPushWithRetry; createLogger; recoverOrphanedActiveSession; all common event/rate-limit contract exports through shims; Buster output/result/completion/embed/cleanup helpers; rate-limit state/retry/handler functions.
Canonical authority used: Buster owns capability policy, Discord operator adapter, gateway readiness thresholds, Git workflow policy, task JSONL logger, orphan evidence fence, task/result helper boundary, and child-session cooldown loop; common owns webhook transport, Gateway health probe implementation, Git primitives, pipeline event contract, and rate-limit contract payload/embed/action semantics.
Fallback/legacy/shim hits found: capability and config old-shape fields; best-effort durable alerts; Discord message/context aliases, mute/missing-webhook skips, degraded-map suppression, fire-and-forget delivery; gateway retry thresholds; gitSync branch fallback/null return; gitPush retry/final push-after-rebase behavior; logger stdout-only/optional telemetry fallback; active-session file diagnostic-only fence; two common contract shims; rate-limit max-pause old shapes; output/result fail-closed helpers; cleanup policy guard; rate-limit default opts, duplicate-signal suppression, gate-test identity mapping, and liveness failure behavior.
Fallback decision:
  - deleted: none.
  - renamed as canonical: Discord mute/missing-webhook/degraded behavior; gateway health retry thresholds; gitSync null failure result; logger stdout-only/optional telemetry fallback; output_file ensure/result fail-closed behavior; embed partial-context rendering; cleanup policy guard; duplicate-signal suppression.
  - kept as external adapter: capability/config old-shape inputs, Discord legacy message/context aliases, active-session evidence fence pending lifecycle authority, event/rate-limit contract shims, rate-limit max-pause old shapes, rate-limit partial opts and gate-test identity mapping.
  - needs user decision: durable alert writes as best-effort; fire-and-forget Discord delivery; gitSync without expected hash resetting to origin/currentBranch; gitPush final push after rebase failure; rate-limit liveness failure/gateway-unreachable resume behavior.
Behavior invariants: no batch file becomes an entrypoint; capability denial writes sanitized operator alerts before throwing; Discord audit persists before webhook attempt; gateway readiness/health failure delegates structured shutdown to entrypoint; Git commit mode requires explicit safe addPaths; logger must not block task execution on file/telemetry failures; orphan recovery must not use persisted files as lifecycle authority; output_file remains required for child result authority; Buster-owned rate-limit cooldown emits canonical pause only when `ownsCanonicalSignal` is true.
Simplifications/optimizations: TS migration should type Buster capability/context payload shapes and collapse old aliases at external boundaries; keep common contract shims as explicit adapters; consider typed Discord correlation context and rate-limit handler opts; avoid moving gateway shutdown or Git destructive policy into generic helpers without preserving Buster-specific decisions.
Tests/checks run: out of scope; only source/docs inspection and git diff/status.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, phase-0-batch-plan.md.
Deleted files: none.
Open questions: Should optional Discord/file-alert side effects remain nonblocking; should Buster allow branch reset without expected commit; should final push after failed rebase remain allowed; and should liveness probe errors/gateway-unreachable states keep resuming instead of killing/exhausting?
```

## Batch 04 — DONE — 10 files, 1453 lines

| Lines | Action | File |
|---:|---|---|
| 2 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/services/redis-message-contract.ts` |
| 93 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/services/runtime-diagnostics.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/services/runtime.ts` |
| 432 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/services/sandbox-cleanup.ts` |
| 362 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/services/session-monitor.ts` |
| 212 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/services/task-completion.ts` |
| 29 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/services/task-lifecycle/cleanup.ts` |
| 84 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/services/task-lifecycle/completion-signal.ts` |
| 28 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/services/task-lifecycle/git-sync.ts` |
| 208 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/services/task-lifecycle/session.ts` |


### Phase 0 slice review — Buster Redis/runtime diagnostics, cleanup, session monitor, completion, and task lifecycle helpers

```text
Slice: Buster Redis/runtime diagnostics, cleanup, session monitor, completion, and task lifecycle helpers
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/buster/pipeline/services/redis-message-contract.ts
  - kubeclaw-main/skills/buster/pipeline/services/runtime-diagnostics.ts
  - kubeclaw-main/skills/buster/pipeline/services/runtime.ts
  - kubeclaw-main/skills/buster/pipeline/services/sandbox-cleanup.ts
  - kubeclaw-main/skills/buster/pipeline/services/session-monitor.ts
  - kubeclaw-main/skills/buster/pipeline/services/task-completion.ts
  - kubeclaw-main/skills/buster/pipeline/services/task-lifecycle/cleanup.ts
  - kubeclaw-main/skills/buster/pipeline/services/task-lifecycle/completion-signal.ts
  - kubeclaw-main/skills/buster/pipeline/services/task-lifecycle/git-sync.ts
  - kubeclaw-main/skills/buster/pipeline/services/task-lifecycle/session.ts
Runtime entrypoints affected: none; these are imported by the Buster entrypoint/task lifecycle, suites, and tools, but no batch file is a direct CLI/runtime/tool entrypoint.
Incoming callers: buster-pipeline re-exports session monitor and imports runtime diagnostics through services; task-lifecycle imports all four task-lifecycle helper modules plus completion state; task-queue uses Redis contract/completion guard; pipeline-helpers delegates sandbox cleanup; suites/build and suites/k8s track cleanup resources; Buster Discord/visual-reg/Redis tool use runtime webhook URL; verification imports/read these production surfaces.
Outgoing dependencies: Node fs/path/crypto/child_process/util; common Redis contract facade; Buster/common noncritical, security, lifecycle, session-termination, Gateway, ACP monitor, timing, telemetry, pipeline-event, ACP gateway, Git workflow, task queue, task completion, pipeline-helper, runtime diagnostic, and verify-task modules.
Dynamic imports: none found.
Exported symbols: Redis contract re-export; sanitized diagnostic builders/writers; Discord webhook URL resolver; sandbox constants/policies/label/state/cleanup functions; monitorSession; completion/dead-letter state/build/publish/ACK-guard helpers; lifecycle cleanup/git-sync/completion-signal/session orchestration helpers.
Canonical authority used: common Redis message contract is canonical; Buster owns runtime diagnostics, webhook env helper, sandbox cleanup policy/enforcement, ACP session monitoring behavior, Redis terminal completion/dead-letter precondition, lifecycle cleanup telemetry, completion signal write/verify/publish stage, lifecycle git-sync result shaping, and task-level spawn/monitor/kill/outcome orchestration.
Fallback/legacy/shim hits found: Redis contract shim; diagnostic detail/env/stderr fallbacks; legacy Discord webhook env; malformed cleanup-state empty fallback; best-effort labeled discovery; missing-resource ignore patterns; cleanup policy aliases/inference; safe namespace prefix; monitor default meta and dispatch identity fallback; gateway degraded/restored suppression; hard-timeout nonterminal returns; rate-limit nonthrowing exhaustion; missing completion stream skips; module/gate identity aliases; dead-letter stream fallback; fallback completion before dead-letter; optional cleanup log; completion error capture; suite-only pre-test verdict gating; fast-forward git sync without commit; default child-session model; spawn/monitor error conversion; session dispatch/cwd fallbacks; outcome summary fallback.
Fallback decision:
  - deleted: none.
  - renamed as canonical: diagnostic normalization/write nonblocking behavior; cleanup malformed-state/discovery/missing-resource/idempotency/safety behavior; inferred cleanup policy; monitor gateway suppression, hard-timeout returns, rate-limit exhaustion; dead-letter stream fallback; fallback completion/dead-letter guarantee; completion error capture; pre-test verdict gating; spawn/monitor error conversion; outcome source fallback.
  - kept as external adapter: Redis contract shim; legacy webhook env until env is canonicalized; cleanup policy snake_case aliases; monitor/session identity and partial-meta fallbacks; missing completion stream support if task contract remains mixed; module/gate identity aliases.
  - needs user decision: whether tasks may omit deterministic commit hashes and use fast-forward sync; whether `anthropic/claude-sonnet-4-6` remains the default Buster child-session model; whether all tasks should require completion_stream after contract canonicalization.
Behavior invariants: no batch file becomes an entrypoint; diagnostics and logger-style artifact writes must not block poison-message ACK or shutdown; cleanup must stay policy-gated and sandbox-root constrained; queue ACK requires terminal completion or dead-letter evidence unless the task contract has no completion stream and no error; monitor hard timeout explicitly terminates sessions; unconfirmed termination preserves active-session evidence; completion signal verifies/pushes output before Redis completion; output_file remains Buster child-result authority.
Simplifications/optimizations: Type cleanup policy and resource state explicitly; type monitor metadata/rate-limit config so required values are visible; keep Redis/common contract shims as adapters; consider moving legacy env/identity aliases to external parsing boundaries; make completion_stream requirement explicit before TS conversion.
Tests/checks run: out of scope; only source/docs inspection and git diff/status.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, phase-0-batch-plan.md.
Deleted files: none.
Open questions: Should Buster continue fast-forward syncing when no expected commit hash is provided; should the hardcoded default child-session model remain canonical; and should completion_stream become mandatory for all Buster task payloads?
```

## Batch 05 — DONE — 9 files, 2233 lines

| Lines | Action | File |
|---:|---|---|
| 386 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/services/task-lifecycle.ts` |
| 310 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/services/task-queue.ts` |
| 2 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/services/task-transport-contract.ts` |
| 153 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/services/task-validation.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/services/telemetry/payload-schema.ts` |
| 406 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/services/telemetry.ts` |
| 207 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/services/verdict-schema.ts` |
| 219 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/suites/a11y.ts` |
| 547 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/suites/api.ts` |


### Phase 0 slice review — Buster task lifecycle, queue/validation, telemetry/verdict schema, and a11y/api suites

```text
Slice: Buster task lifecycle, queue/validation, telemetry/verdict schema, and a11y/api suites
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/buster/pipeline/services/task-lifecycle.ts
  - kubeclaw-main/skills/buster/pipeline/services/task-queue.ts
  - kubeclaw-main/skills/buster/pipeline/services/task-transport-contract.ts
  - kubeclaw-main/skills/buster/pipeline/services/task-validation.ts
  - kubeclaw-main/skills/buster/pipeline/services/telemetry/payload-schema.ts
  - kubeclaw-main/skills/buster/pipeline/services/telemetry.ts
  - kubeclaw-main/skills/buster/pipeline/services/verdict-schema.ts
  - kubeclaw-main/skills/buster/pipeline/suites/a11y.ts
  - kubeclaw-main/skills/buster/pipeline/suites/api.ts
Runtime entrypoints affected: none; task-lifecycle and task-queue are driven by buster-pipeline, and a11y/api suites are driven by suite-runner, but no batch file is a direct CLI/runtime/tool entrypoint.
Incoming callers: buster-pipeline imports task queue and task lifecycle surfaces; task-lifecycle/completion-signal imports queue Redis access; task-lifecycle imports task validation and telemetry; suite-runner imports verdict schema and a11y/api suites; pipeline helpers and all Buster suites consume verdict schema; Buster telemetry callers include task lifecycle, suite runner, Discord/rate-limit/session helpers, and visual-reg.
Outgoing dependencies: Node path/os/fs; Buster/common telemetry root facade, noncritical reporting, redaction, task transport/telemetry schema facades, Redis message contract, task completion, pipeline helpers, runtime diagnostics, capabilities, Git workflows, security, repo-paths, logger, Discord, suite-runner, and task-lifecycle stage modules.
Dynamic imports: a11y dynamically imports `playwright` and `@axe-core/playwright`; api dynamically imports `ws` with `globalThis.WebSocket` fallback.
Exported symbols: task lifecycle exports `getLastRunLogDir` and `processTask`; task queue exports stream constants, Redis lifecycle helpers, queue read/reclaim/group helpers, and `processOneQueuedTask`; task transport and telemetry payload schema facades export common symbols; task validation exports task types/error/normalizers/validator; telemetry exports stream-key/context/emit/close helpers; verdict schema exports status/severity/recommendation constants and verdict/finding/runner/truncation factories; suites export default suite functions.
Canonical authority used: Buster owns task lifecycle sequencing, Redis queue ACK boundary, task payload validation, telemetry adapter/fallback behavior, verdict schema, a11y suite, and API suite behavior; common owns task transport and telemetry payload schema through facades.
Fallback/legacy/shim hits found: task lifecycle payload/stage/context defaults; queue env defaults, task type fallback, malformed dead-letter paths, and cleanup fallback; task transport and telemetry schema shims; validation capability alias and forbidden legacy `status_json_path`; telemetry disabled/missing identity, invalid payload, Redis/artifact/close fallbacks; verdict default/summary/truncation behavior; a11y config/informational/dependency/cleanup fallbacks; api spec/config/informational/auth/interpolation/WebSocket fallbacks.
Fallback decision:
  - deleted: none now; `status_json_path` remains rejected and can be deleted from producer contracts after producers are confirmed clean.
  - renamed as canonical: final cleanup/completion guarantee; queue env defaults/terminal dead-letter behavior/error cleanup; telemetry nonblocking degraded/restored fallbacks; verdict defaults/summaries/truncation; a11y config/dependency/cleanup behavior; API config/runtime protocol fallbacks.
  - kept as external adapter: task lifecycle stage/worker/context aliases; queue effective task type fallback; task transport and telemetry schema facades; task validation identity/capability aliases; API auth/interpolation permissiveness.
  - needs user decision: a11y and API informational PASS mode when thresholds are absent; API SKIP on no/missing/empty spec.
Behavior invariants: no batch file should become a direct entrypoint; queue ACK must remain gated on terminal completion/dead-letter evidence; `processTask` must always run final cleanup, task_completed telemetry, completion signal, logger flush, and telemetry close; telemetry must never block task orchestration; suite verdict JSON shapes must stay deterministic; a11y/api remain noncritical and only FAIL when thresholds enforce failures.
Simplifications/optimizations: Type task payload identity/defaults and Redis queue results before conversion; keep common facades explicit; move legacy aliases to boundary parsers; type telemetry context health state; consider typed JSON specs for API suite and explicit informational/enforced suite mode.
Tests/checks run: out of scope; only source/docs inspection and git diff/status.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, phase-0-batch-plan.md.
Deleted files: none.
Open questions: Should missing thresholds continue making a11y/api informational PASS, and should missing/missing-file/empty API specs remain SKIP instead of FAIL after task contracts are canonicalized?
```

## Batch 06 — DONE — 5 files, 2023 lines

| Lines | Action | File |
|---:|---|---|
| 549 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/suites/build.ts` |
| 183 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/suites/bundle.ts` |
| 339 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/suites/e2e.ts` |
| 320 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/suites/health.ts` |
| 632 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/suites/k8s.ts` |


### Phase 0 slice review — Buster build, bundle, e2e, health, and Kubernetes suites

```text
Slice: Buster build, bundle, e2e, health, and Kubernetes suites
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/buster/pipeline/suites/build.ts
  - kubeclaw-main/skills/buster/pipeline/suites/bundle.ts
  - kubeclaw-main/skills/buster/pipeline/suites/e2e.ts
  - kubeclaw-main/skills/buster/pipeline/suites/health.ts
  - kubeclaw-main/skills/buster/pipeline/suites/k8s.ts
Runtime entrypoints affected: none; all files are suite-runner imports, not direct CLI/runtime/tool entrypoints.
Incoming callers: suite-runner imports and registers all five default suite functions; k8s helper exports are used internally and may be imported by verification; downstream Buster lifecycle consumes their verdicts through suite-runner.
Outgoing dependencies: Node child_process/util/fs/path/buffer/os; Buster verdict schema, repo-path helpers, sandbox-cleanup resource tracking/labels, security subprocess env/path guards, timing, capabilities, git-workflows, and manifest YAML helpers.
Dynamic imports: build dynamically imports `js-yaml` for manifest/secret env parsing; health dynamically imports `playwright` for smoke navigation; bundle/e2e/k8s have no dynamic imports.
Exported symbols: build/bundle/e2e/health each export one default async suite; k8s exports `validateK8sNamespacePrefix`, `renderManifestForK8sSuite`, and a default async suite.
Canonical authority used: build owns static/server app establishment; bundle owns bundle size/file-count evidence; e2e owns persisted Playwright replay; health owns HTTP/smoke readiness; k8s owns production-like image build/push/deploy/readiness checks and ephemeral namespace/image manifest rewriting.
Fallback/legacy/shim hits found: build config/image/error/env/nginx/Dockerfile/start_cmd/crash fallbacks; bundle missing output/informational/probe fallbacks; e2e missing tests/project-dir prefix/informational/output-parser fallbacks; health defaults/smoke auto-detection/Playwright unavailable/smoke criticality/cleanup fallbacks; k8s missing config/defaults/safe prefix/secret copy/missing manifests/manifest rewrite/temp cleanup/pod status fallbacks.
Fallback decision:
  - deleted: none.
  - renamed as canonical: suite config defaults; build error parsing, nginx reuse, optional Dockerfile pre-build, crash diagnostics; bundle scan best-effort behavior; E2E parser behavior; health retry/smoke path behavior and criticality split; k8s namespace prefix validation, manifest rewrites, temp cleanup, and pod-status diagnostics.
  - kept as external adapter: build image shorthand and start_cmd path normalization; build YAML regex parsing until parser dependency is canonical; E2E project-dir prefix resolver; k8s missing-manifest tolerance.
  - needs user decision: unresolved secret placeholders in build; bundle/e2e informational PASS and missing-output/tests SKIP; health Playwright-unavailable moderate finding; k8s missing config SKIP and best-effort secret copy.
Behavior invariants: build and health remain critical environment gates; bundle/e2e are noncritical unless thresholds enforce failure; k8s configured failures are critical and tracked resources must be registered for cleanup; no suite should become an entrypoint; all subprocesses use guarded env/path helpers.
Simplifications/optimizations: define typed suite config/result contracts; isolate legacy path/image normalization at config boundaries; make informational/enforced mode explicit; type manifest rewrite helpers and Kubernetes check records; consider making unknown bundle size distinct from zero.
Tests/checks run: out of scope; only source/docs inspection and git diff/status.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, phase-0-batch-plan.md.
Deleted files: none.
Open questions: Should optional/noncritical evidence suites continue to SKIP/PASS by default, and should build/k8s best-effort secret behavior fail earlier when deployment config declares secrets?
```

## Batch 07 — DONE — 9 files, 2462 lines

| Lines | Action | File |
|---:|---|---|
| 522 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/suites/manifest.ts` |
| 241 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/suites/perf.ts` |
| 27 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/suites/repo-paths.ts` |
| 378 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/suites/security.ts` |
| 410 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/suites/unit.ts` |
| 185 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/suites/visual-reg-discord.ts` |
| 693 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/suites/visual-reg.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/telemetry.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/timing.ts` |

### Phase 0 slice review — Buster manifest/perf/security/unit/visual-reg suites and common facades

```text
Slice: Buster manifest/perf/security/unit/visual-reg suites and common facades
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/buster/pipeline/suites/manifest.ts
  - kubeclaw-main/skills/buster/pipeline/suites/perf.ts
  - kubeclaw-main/skills/buster/pipeline/suites/repo-paths.ts
  - kubeclaw-main/skills/buster/pipeline/suites/security.ts
  - kubeclaw-main/skills/buster/pipeline/suites/unit.ts
  - kubeclaw-main/skills/buster/pipeline/suites/visual-reg-discord.ts
  - kubeclaw-main/skills/buster/pipeline/suites/visual-reg.ts
  - kubeclaw-main/skills/buster/pipeline/telemetry.ts
  - kubeclaw-main/skills/buster/pipeline/timing.ts
Runtime entrypoints affected: none; suites are imported by suite-runner and facades by services/tools, but no batch file is a direct CLI/runtime/tool entrypoint.
Incoming callers: suite-runner imports manifest, perf, security, unit, and runVisualReg; k8s imports manifest YAML helpers; visual-reg imports visual-reg Discord helpers; Buster suites import repo-path helpers; Buster services/task queue/tools import telemetry/timing facades.
Outgoing dependencies: Node fs/path/child_process/module; Buster verdict schema, repo-path/security facades, screenshot tools, telemetry/runtime/Discord/capability services, and common telemetry/timing modules through facades.
Dynamic imports: visual-reg imports pngjs and pixelmatch during comparison; manifest loads js-yaml through createRequire; no other dynamic imports found.
Exported symbols: manifest YAML helpers plus default suite; perf resolvePerfReportPaths plus default suite; repo-path constants/helpers; security/unit default suites; visual-reg Discord summary/single senders; visual-reg delivery summary, path resolvers, and runVisualReg; telemetry/timing facades re-export all common symbols.
Canonical authority used: manifest validation, Lighthouse report policy, suite repo path boundary, HTTP header/cookie audit, unit test runner parsing, visual-reg baseline/comparison/telemetry, and visual-reg Discord media adapter; common owns telemetry and timing implementations behind Buster facades.
Fallback/legacy/shim hits found: YAML/secret regex parser fallbacks; optional/missing manifest and baseline skips; informational modes; Lighthouse output_path legacy rejection; config defaults; cookie header API fallback; test-output parser fallback; custom unit command bypass; no-webhook/noncritical Discord delivery; visual-reg legacy baseline path rejection, module/context aliases, artifact/path fallbacks, HTML baseline generation, single-path compatibility; telemetry/timing shims.
Fallback decision:
  - deleted: legacy perf.output_path and visual-reg baseline_dir/baseline_file path authority remain rejected and should be deleted from producer contracts.
  - renamed as canonical: suite config defaults, fetch/tool error-to-verdict conversion, envFrom uncertainty behavior, artifact/log/report path defaults, cookie delivery caps, noncritical copy/delivery failures, and parser/failure-summary fallbacks.
  - kept as external adapter: js-yaml regex fallback until parser dependency is canonical, mixed module/run/telemetry context aliases, custom unit command bypass, single-path visual-reg compatibility, and telemetry/timing facades.
  - needs user decision: missing deployment/baseline/test assets as SKIP; informational PASS mode for perf/security/unit/visual-reg/manifest findings; optional secret parse behavior; HTML baseline auto-generation as canonical behavior.
Behavior invariants: no batch file becomes an entrypoint; suite paths remain repo-scoped; external tool/network/browser/media failures stay inside suite verdicts; visual-reg rejects caller-controlled baseline directories; Discord media delivery must not decide suite verdict; common telemetry/timing ownership remains behind explicit facades.
Simplifications/optimizations: type suite configs and context identity at boundaries; remove producer support for rejected legacy paths; make evidence-only versus enforced mode explicit; prefer structured YAML parser as canonical; keep facades as adapters only.
Tests/checks run: out of scope; only source/docs inspection, grep caller discovery, wc line verification, and git diff/status.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, phase-0-batch-plan.md.
Deleted files: none.
Open questions: Should missing optional evidence continue to SKIP; should informational PASS mode remain default across these quality suites; and should visual-reg HTML baseline auto-generation/single-path compatibility remain after producers canonicalize multi-path baselines?
```

## Batch 08 — DONE — 10 files, 1584 lines

| Lines | Action | File |
|---:|---|---|
| 192 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/tools/redis.ts` |
| 497 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/tools/screenshot.ts` |
| 219 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/tools/verify-task.ts` |
| 154 | migrate JS→TS | `kubeclaw-main/skills/buster/pipeline/tools/visual-audit.ts` |
| 53 | review existing TS | `kubeclaw-main/skills/common/pipeline/agent-observability/src/constants.ts` |
| 6 | review existing TS | `kubeclaw-main/skills/common/pipeline/agent-observability/src/index.ts` |
| 120 | review existing TS | `kubeclaw-main/skills/common/pipeline/agent-observability/src/mapping.ts` |
| 61 | review existing TS | `kubeclaw-main/skills/common/pipeline/agent-observability/src/masking.ts` |
| 62 | review existing TS | `kubeclaw-main/skills/common/pipeline/agent-observability/src/routing.ts` |
| 220 | review existing TS | `kubeclaw-main/skills/common/pipeline/agent-observability/src/types.ts` |

### Phase 0 slice review — Buster operator tools and common agent-observability contract island

```text
Slice: Buster operator tools and common agent-observability contract island
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/buster/pipeline/tools/redis.ts
  - kubeclaw-main/skills/buster/pipeline/tools/screenshot.ts
  - kubeclaw-main/skills/buster/pipeline/tools/verify-task.ts
  - kubeclaw-main/skills/buster/pipeline/tools/visual-audit.ts
  - kubeclaw-main/skills/common/pipeline/agent-observability/src/constants.ts
  - kubeclaw-main/skills/common/pipeline/agent-observability/src/index.ts
  - kubeclaw-main/skills/common/pipeline/agent-observability/src/mapping.ts
  - kubeclaw-main/skills/common/pipeline/agent-observability/src/masking.ts
  - kubeclaw-main/skills/common/pipeline/agent-observability/src/routing.ts
  - kubeclaw-main/skills/common/pipeline/agent-observability/src/types.ts
Runtime entrypoints affected: Buster Redis task tool, screenshot/baseline tool, verify-task scoped push tool, and visual-audit Discord media tool are direct CLI/tool entrypoints; common agent-observability TS files are not entrypoints.
Incoming callers: Nova adapter registry imports the Redis tool; visual-reg imports screenshot helpers; task-lifecycle completion imports verify-task; no runtime source importer found for visual-audit; Buster/Nova role agent-observability facades and Nova ingester/evidence services import the common TS contract through index paths.
Outgoing dependencies: Buster tools import Node fs/path/url/process, CLI arg facades, Redis telemetry/transport/message contracts, Discord/redaction/runtime helpers, Git workflows, Playwright, and Buster capabilities; TS contract files import only local constants/types and re-export validation/masking/routing/mapping.
Dynamic imports: screenshot dynamically imports Playwright; no other dynamic imports found.
Exported symbols: Redis default lib with publish/read/complete/disconnect helpers; screenshot capture/batch/baseline helpers; verify-task scope helpers plus default verifyAndPush; visual-audit default function; agent-observability constants, types, masking, routing/size, mapping, and index re-export surface.
Canonical authority used: Buster Redis send/read tool, screenshot/baseline tool, .swarm verification push helper, visual-audit media upload tool, and common agent-observability contract/masking/routing/mapping/type authorities.
Fallback/legacy/shim hits found: removed Redis complete path, legacy Redis send/read aliases and target aliases, optional Discord notification, Playwright path fallback, single-screenshot backwards-compat helper, local file URL fallback, nonblocking browser cleanup, Prism setup special case, page JS warning behavior, role/env CLI defaults, selective revert fallback, cleanup/no-change outcomes, visual-audit injection/token/mode/temp cleanup behaviors, temporary plugin.event mappings, LLM non-promotion, size defaults/caps, and minimal masking.
Fallback decision:
  - deleted: Redis `complete` compatibility path remains rejected and should be removed from producers.
  - renamed as canonical: Redis BUSYGROUP/ready behavior, optional Discord notification, Playwright path detection, local-file screenshot support, deterministic batch failure shaping, Prism setup route handling, child filename guard, role-nonauthoritative verify scope, selective revert, visual-audit mode/temp cleanup, LLM non-promotion, and size fuse defaults/caps.
  - kept as external adapter: Redis send/read aliases and role target aliases, defensive direct-entry checks, single-screenshot helper, role/env CLI defaults, injectable visual-audit dependencies, token prefix normalization, and role facades over the common TS contract.
  - needs user decision: sender `unknown` fallback, page JS errors as warnings, no-change/all-bad verify success, cleanup failure nonterminal behavior, temporary plugin.event mappings, and minimal masking scope.
Behavior invariants: tools may remain CLI entrypoints; Redis completion stays owned by pipeline completion services; screenshot output names must not escape output dirs; verify-task may only stage `.swarm`; visual-audit must cleanup temp media; common TS contract files remain side-effect-light and do not perform Redis IO.
Simplifications/optimizations: type CLI flag/result shapes, make Redis target aliases explicit adapters, type Playwright capture results, split verify-task firewall result from Git push result, and keep the agent-observability contract island as canonical TS rather than converting through JS facades.
Tests/checks run: out of scope; only source/docs inspection, grep caller discovery, wc line verification, and git diff/status.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, entrypoint-inventory.md, existing-typescript-islands.md, phase-0-batch-plan.md.
Deleted files: none.
Open questions: Should Redis publish permit unknown sender, should page JS errors fail baseline generation, should verify-task no-op/all-bad cleanup be success, should cleanup failures remain nonterminal, and when should temporary plugin.event mappings/minimal masking policy be replaced or expanded?
```

## Batch 09 — DONE — 10 files, 1908 lines

| Lines | Action | File |
|---:|---|---|
| 310 | review existing TS | `kubeclaw-main/skills/common/pipeline/agent-observability/src/validation.ts` |
| 667 | migrate JS→TS | `kubeclaw-main/skills/common/pipeline/agents/acp-monitor.ts` |
| 434 | migrate JS→TS | `kubeclaw-main/skills/common/pipeline/agents/lifecycle.ts` |
| 32 | migrate JS→TS | `kubeclaw-main/skills/common/pipeline/agents/runtime.ts` |
| 44 | migrate JS→TS | `kubeclaw-main/skills/common/pipeline/agents/session-semantics.ts` |
| 163 | migrate JS→TS | `kubeclaw-main/skills/common/pipeline/agents/session-termination.ts` |
| 33 | migrate JS→TS | `kubeclaw-main/skills/common/pipeline/agents/tracked-agents.ts` |
| 63 | migrate JS→TS | `kubeclaw-main/skills/common/pipeline/cli-args.ts` |
| 91 | migrate JS→TS | `kubeclaw-main/skills/common/pipeline/git-primitives.ts` |
| 71 | migrate JS→TS | `kubeclaw-main/skills/common/pipeline/integrations/discord-webhook.ts` |


### Phase 0 slice review — Common agent-observability validation and shared agent primitives

```text
Slice: Common agent-observability validation and shared agent primitives
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/common/pipeline/agent-observability/src/validation.ts
  - kubeclaw-main/skills/common/pipeline/agents/acp-monitor.ts
  - kubeclaw-main/skills/common/pipeline/agents/lifecycle.ts
  - kubeclaw-main/skills/common/pipeline/agents/runtime.ts
  - kubeclaw-main/skills/common/pipeline/agents/session-semantics.ts
  - kubeclaw-main/skills/common/pipeline/agents/session-termination.ts
  - kubeclaw-main/skills/common/pipeline/agents/tracked-agents.ts
  - kubeclaw-main/skills/common/pipeline/cli-args.ts
  - kubeclaw-main/skills/common/pipeline/git-primitives.ts
  - kubeclaw-main/skills/common/pipeline/integrations/discord-webhook.ts
Runtime entrypoints affected: none; all batch files are shared libraries/contract code imported through Buster/Nova facades or services.
Incoming callers: Buster and Nova role facades re-export common agent, CLI, Git, Discord, and agent-observability surfaces; Buster task/session services consume monitor/lifecycle/termination/Git/Discord helpers; Nova polling, runner, summary/case-study, CLI/tool, Git-context, and agent-observability ingester/evidence code consume them through role facades/common TS index.
Outgoing dependencies: Node fs/os/path/child_process, common Gateway integration, security, timing, pipeline-event contract, ACP Gateway contract validators, local session semantics/tracked-agent/runtime modules, agent-observability constants/types, and global fetch/AbortSignal for Discord transport.
Dynamic imports: none found.
Exported symbols: agent-observability validation error/assertion/type-guard/hook helpers; ACP monitor config/transcript/state/event/idle helpers plus session semantics re-exports; lifecycle spawn/kill/active-session/transcript/acpx helpers plus tracked-agent re-exports; runtime model/harness/runtime classifiers; session semantic constants/parsers; termination constants and wrappers; tracked-agent registry helpers; CLI parsers; Git repo/exec/branch/hash helpers; Discord webhook error and post helper.
Canonical authority used: common agent-observability validation, ACP monitor, session lifecycle, runtime selection, session semantics, termination wrapper, tracked-agent registry, CLI parsing, Git primitives, and Discord webhook transport.
Fallback/legacy/shim hits found: optional/nullable validation fields, unknown-type validation behavior, transcript rate coalescing, monitor snake/camel config aliases, transcript parsing/truncation/reset fallbacks, Gateway-unreachable transcript-progress inference, dual monitor signatures, idle positional args, diagnostic-only active-session file, best-effort cleanup, subagent transcript discovery fallback, spawn defaults/retries, layered stop/acpx/list confirmation, model substring heuristics, text status parser, termination grace defaults/cap/no-session/grace-expired behavior, tracked-agent no-op missing labels, repo-root config aliases, detached branch fallback, empty hash fallback, Discord timeout API fallback, and error body preview cap; Discord payload shorthand was deleted in P4-B02.
Fallback decision:
  - deleted: Discord payload shorthand (P4-B02).
  - renamed as canonical: unknown-type validation error behavior, transcript rate coalescing, transcript reset/classification truncation, Gateway-unreachable transcript-progress inference, adapter fatal-error emission, diagnostic-only active-session evidence, best-effort cleanup, spawn defaults/retries, layered stop/acpx/list confirmation, termination grace/no-session/grace-expired/cleanup-result behavior, tracked-agent no-op missing labels, strict CLI parser behavior, empty hash fallback, and error body preview cap.
  - kept as external adapter: optional producer payload fields, monitor snake/camel config aliases, dual monitor signatures, idle positional args, subagent transcript metadata lookup, model substring heuristics, text status parser, repo-root config aliases, detached branch fallback, and Discord timeout API fallback.
  - needs user decision: whether agent-observability producers must become fully required/typed per event subtype; whether model/runtime and session-state text heuristics may be removed after callers emit explicit structured fields.
Behavior invariants: no batch file becomes an entrypoint; role facades stay adapters; session lifecycle must not hydrate persisted active-session JSON as authority; termination must remain bounded and result-shaped; monitor must keep emitting ACP event-bus state/delta events; Discord raw transport remains policy-light while role services own audit/degradation.
Simplifications/optimizations: type monitor config and signatures to one canonical options object, replace model/status text heuristics with explicit producer fields over time, isolate active-session evidence type from live state, and keep validation.ts inside the existing TS contract island.
Tests/checks run: out of scope; only source/docs inspection, rg caller discovery, wc line verification, and git diff/status.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, existing-typescript-islands.md, phase-0-batch-plan.md.
Deleted files: none.
Open questions: Should agent-observability event payloads require complete subtype fields, and when can model/runtime plus textual Gateway status compatibility heuristics be replaced by explicit structured contracts?
```

## Batch 10 — DONE — 9 files, 2317 lines

| Lines | Action | File |
|---:|---|---|
| 240 | migrate JS→TS | `kubeclaw-main/skills/common/pipeline/integrations/gateway.ts` |
| 341 | migrate JS→TS | `kubeclaw-main/skills/common/pipeline/lifecycle-state.ts` |
| 99 | migrate JS→TS | `kubeclaw-main/skills/common/pipeline/noncritical-reporting.ts` |
| 372 | migrate JS→TS | `kubeclaw-main/skills/common/pipeline/redaction.ts` |
| 124 | migrate JS→TS | `kubeclaw-main/skills/common/pipeline/redis-transport.ts` |
| 170 | migrate JS→TS | `kubeclaw-main/skills/common/pipeline/security.ts` |
| 337 | migrate JS→TS | `kubeclaw-main/skills/common/pipeline/services/acp-gateway-contract.ts` |
| 431 | migrate JS→TS | `kubeclaw-main/skills/common/pipeline/services/pipeline-event-contract.ts` |
| 203 | migrate JS→TS | `kubeclaw-main/skills/common/pipeline/services/rate-limit-contract.ts` |


### Phase 0 slice review — Common Gateway, lifecycle state, hygiene, Redis/security, and shared contracts

```text
Slice: Common Gateway, lifecycle state, hygiene, Redis/security, and shared contracts
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/common/pipeline/integrations/gateway.ts
  - kubeclaw-main/skills/common/pipeline/lifecycle-state.ts
  - kubeclaw-main/skills/common/pipeline/noncritical-reporting.ts
  - kubeclaw-main/skills/common/pipeline/redaction.ts
  - kubeclaw-main/skills/common/pipeline/redis-transport.ts
  - kubeclaw-main/skills/common/pipeline/security.ts
  - kubeclaw-main/skills/common/pipeline/services/acp-gateway-contract.ts
  - kubeclaw-main/skills/common/pipeline/services/pipeline-event-contract.ts
  - kubeclaw-main/skills/common/pipeline/services/rate-limit-contract.ts
Runtime entrypoints affected: none; all files are shared libraries/contracts imported directly or through Buster/Nova facades.
Incoming callers: Buster/Nova role facades re-export Gateway, lifecycle-state, noncritical-reporting, redaction, Redis transport, security, ACP Gateway contract, pipeline event contract, and rate-limit contract surfaces; common ACP monitor/lifecycle/Git primitives import Gateway/security/contracts directly; Buster services/suites/tools and Nova orchestration/polling/status/summary/telemetry/tooling import through role facades.
Outgoing dependencies: Node crypto/fs/path/module/events, common timing helpers, common noncritical reporting, common ACP Gateway contract validators, and global fetch/AbortController/EventEmitter where called.
Dynamic imports: none; Redis transport uses `createRequire` to load `ioredis`, and Nova callers may dynamically import the redaction facade but this slice has no `import()` calls.
Exported symbols: Gateway URL/token/invoke/session/health helpers; lifecycle mutation/status helpers; noncritical reporting sanitizers/reporters; redaction/hash/sanitizer/artifact helpers; Redis transport errors/config/client helpers; security env/path/command helpers; ACP Gateway validators; pipeline event bus/wait/validation helpers; rate-limit Discord/payload/embed/recovery helpers.
Canonical authority used: common Gateway integration, lifecycle-state mutation helpers, noncritical reporting, redaction policy, Redis secure transport policy, subprocess/path security helpers, ACP Gateway contract, pipeline event contract, and rate-limit presentation/recovery contract.
Fallback/legacy/shim hits found: Gateway env URL/token aliases, flexible invoke body fields, network retry/health false and raw-result normalization; lifecycle missing status/history and hidden pending mutation behavior; arbitrary noncritical error and stderr fallbacks; redaction malformed/circular/transcript/Discord/file-stripping and limited secret-regex behavior; Redis option/env aliases, secure-mode localhost exception, missing dependency wrapper; security option aliases/null path and string-command tokenization; Gateway result loose object contract; pipeline event identity/timestamp aliases and typed wait failures; rate-limit identity aliases, provider defaults, derived retry seconds, and gateway-unreachable resume action.
Fallback decision:
  - deleted: none.
  - renamed as canonical: Gateway retry/health/raw-result behavior; lifecycle status/history/default mutation behavior; noncritical de-dupe/output fallback; redaction summarization/malformed/truncation/file-stripping; Redis secure transport and missing dependency errors; subprocess env filtering; strict ACP validators; typed event wait errors; rate-limit payload defaults.
  - kept as external adapter: Gateway URL/token/body aliases; Redis option/env aliases; security scoped-path aliases and command-string adapter; loose Gateway invoke object results; pipeline event identity/timestamp aliases; rate-limit identity aliases.
  - needs user decision: redaction regex/minimal DLP scope and rate-limit `gatewayUnreachable => resume` recovery policy.
Behavior invariants: no batch file becomes an entrypoint; role facades remain adapters over common authorities; Gateway helpers must honor abort/budget semantics; lifecycle mutation metadata must stay non-enumerable; observability/redaction failures must not block orchestration; Redis clients must not allow insecure non-local transport by default; subprocess helpers must not leak denied env secrets; event waits must clean up listeners/timers.
Simplifications/optimizations: Type canonical option objects for Gateway/Redis/path/event/rate-limit identities; move alias handling to boundary adapters; consider typed per-Gateway-tool invoke results; make redaction policy scope explicit; preserve common shared-library ownership instead of duplicating through role facades.
Tests/checks run: out of scope; only source/docs inspection, rg caller discovery, wc line verification, and git diff/status.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, phase-0-batch-plan.md.
Deleted files: none.
Open questions: Should redaction expand beyond current fixed secret regexes/minimal DLP, and should rate-limit recovery continue resuming when Gateway is unreachable after cooldown?
```

## Batch 11 — DONE — 10 files, 1682 lines

| Lines | Action | File |
|---:|---|---|
| 291 | migrate JS→TS | `kubeclaw-main/skills/common/pipeline/services/redis-message-contract.ts` |
| 132 | migrate JS→TS | `kubeclaw-main/skills/common/pipeline/services/task-transport-contract.ts` |
| 634 | migrate JS→TS | `kubeclaw-main/skills/common/pipeline/services/telemetry/payload-schema.ts` |
| 22 | migrate JS→TS | `kubeclaw-main/skills/common/pipeline/telemetry.ts` |
| 150 | migrate JS→TS | `kubeclaw-main/skills/common/pipeline/timing.ts` |
| 1 | review existing TS | `kubeclaw-main/skills/nova/pipeline/agent-observability/src/index.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/agents/acp-monitor.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/agents/lifecycle.ts` |
| 162 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/agents/module-worker-control-results.ts` |
| 284 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/agents/module-workers.ts` |

### Phase 0 slice review — Common Redis/task/telemetry contracts and Nova module-worker adapters

```text
Slice: Common Redis/task/telemetry contracts and Nova module-worker adapters
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/common/pipeline/services/redis-message-contract.ts
  - kubeclaw-main/skills/common/pipeline/services/task-transport-contract.ts
  - kubeclaw-main/skills/common/pipeline/services/telemetry/payload-schema.ts
  - kubeclaw-main/skills/common/pipeline/telemetry.ts
  - kubeclaw-main/skills/common/pipeline/timing.ts
  - kubeclaw-main/skills/nova/pipeline/agent-observability/src/index.ts
  - kubeclaw-main/skills/nova/pipeline/agents/acp-monitor.ts
  - kubeclaw-main/skills/nova/pipeline/agents/lifecycle.ts
  - kubeclaw-main/skills/nova/pipeline/agents/module-worker-control-results.ts
  - kubeclaw-main/skills/nova/pipeline/agents/module-workers.ts
Runtime entrypoints affected: none; no batch file is a direct CLI/runtime/tool entrypoint.
Incoming callers: Buster/Nova role facades and Redis queue/completion/tool services consume common Redis/task/telemetry contracts; Buster/Nova telemetry services consume the common payload schema through facades; Buster/Nova telemetry/timing facades expose common Redis/timing helpers to polling, rate-limit, summary, artifact, and Gateway/event-wait callers; Nova polling/observability/runners import ACP monitor/lifecycle through facades; Nova orchestration imports/re-exports module worker runners and control-result helpers.
Outgoing dependencies: common Redis/message, task transport, telemetry schema, and timing contracts have no static imports; common telemetry re-exports Redis transport helpers; Nova facades re-export common agent-observability/ACP monitor/lifecycle implementations; module-worker-control-results imports status constants, typed worker-control-result helpers, and failure classifier; module-workers imports polling/completion archival, status-store, session-authority, orchestration healthcheck, lifecycle facade, orchestration spawn/kill, and control-result builders.
Dynamic imports: none found.
Exported symbols: Redis schema/status/source constants, envelope/task/completion validators/builders/assertions, Redis invalid error; task transport error/adapters/Redis queue and event bus factories; telemetry payload schema/error/event types/validators/plugin builder; telemetry stream/sequence helpers and Redis transport re-exports; timing budget/sleep helpers; Nova agent-observability/ACP/lifecycle facade exports; Forge/Buster module worker control-result builders/guards/coercers; `runModuleForgeWorker` and `runModuleBusterWorker`.
Canonical authority used: common Redis message contract, task transport contract, telemetry payload schema, telemetry key/helper surface, timing/budget helpers, common agent-observability TypeScript island, common ACP monitor/lifecycle implementations, Nova typed module worker control results, and Nova module worker execution orchestration.
Fallback/legacy/shim hits found: Redis envelope camelCase/snake_case and target fallback aliases; completion canonical-envelope opt-in; object-or-array Redis transport fields; idempotent BUSYGROUP handling; plugin telemetry details projection; telemetry `unknown` key segments; budget deadline aliases; Nova agent-observability/ACP/lifecycle role facades; worker input identity fallbacks; Buster failure-class inference across old source/status shapes; worker dependency/default/no-op seams; Buster dispatch/session fallback evidence.
Fallback decision:
  - deleted: none.
  - renamed as canonical: object-or-array transport field behavior; BUSYGROUP idempotency; plugin telemetry projection; budget deadline aliases; worker dependency/default/no-op seams.
  - kept as external adapter: Redis envelope/target aliases; Nova role facades; worker input identity fallbacks; Buster dispatch/session fallback evidence.
  - needs user decision: completion records remaining valid without canonical envelope/stream role; telemetry `unknown` key segments; Buster failure-class inference accepting older `orchestrator` source/status-only evidence.
Behavior invariants: no batch file becomes an entrypoint; role facades remain adapters over common implementations; Redis task validation keeps strong identity by default; Redis completion validation remains compatible unless intentionally tightened; task queues do not expose raw Redis to callers; telemetry validation rejects unknown event fields; timing sleeps respect abort signals/budgets; module workers always clear shutdown context on terminal paths and kill spawned agents in finalization; Buster worker must archive old completions before dispatch and prefer identity-confirmed active-session evidence.
Simplifications/optimizations: Type Redis envelope and telemetry payload unions; move old-shape alias handling to boundary adapters; type worker input `ids`/`refs` as canonical; keep common contracts shared instead of duplicating in role paths; make Buster completion source/failure-class compatibility a deliberate policy.
Tests/checks run: out of scope; only source/docs inspection, rg caller discovery, wc line verification, git diff/status.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, existing-typescript-islands.md, phase-0-batch-plan.md.
Deleted files: none.
Open questions: Should Redis completion validation require the full canonical envelope now? Should missing telemetry project/run identity still write to `unknown` streams? Should Buster failure inference continue accepting old `orchestrator` source/status-only evidence?
```

## Batch 12 — DONE — 10 files, 964 lines

| Lines | Action | File |
|---:|---|---|
| 139 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/agents/orchestration-healthcheck.ts` |
| 57 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/agents/orchestration-lifecycle-events.ts` |
| 381 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/agents/orchestration.ts` |
| 150 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/agents/reviewer-lifecycle.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/agents/runtime.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/agents/session-semantics.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/agents/session-termination.ts` |
| 223 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/agents/shutdown.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/agents/tracked-agents.ts` |
| 2 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/cli-args.ts` |


### Phase 0 slice review — Nova orchestration lifecycle, healthcheck, shutdown, and facades

```text
Slice: Nova orchestration lifecycle, healthcheck, shutdown, and facades
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/nova/pipeline/agents/orchestration-healthcheck.ts
  - kubeclaw-main/skills/nova/pipeline/agents/orchestration-lifecycle-events.ts
  - kubeclaw-main/skills/nova/pipeline/agents/orchestration.ts
  - kubeclaw-main/skills/nova/pipeline/agents/reviewer-lifecycle.ts
  - kubeclaw-main/skills/nova/pipeline/agents/runtime.ts
  - kubeclaw-main/skills/nova/pipeline/agents/session-semantics.ts
  - kubeclaw-main/skills/nova/pipeline/agents/session-termination.ts
  - kubeclaw-main/skills/nova/pipeline/agents/shutdown.ts
  - kubeclaw-main/skills/nova/pipeline/agents/tracked-agents.ts
  - kubeclaw-main/skills/nova/pipeline/cli-args.ts
Runtime entrypoints affected: none; shutdown registers signal hooks when called, but no batch file is a direct CLI/runtime/tool entrypoint.
Incoming callers: Nova buster/review gate runners, module-runner attempt/shared code, module workers, summary/case-study/recovery services, and Nova CLI/tool files import these surfaces; Buster tools use their own CLI/termination facades.
Outgoing dependencies: Node fs/path/child_process; Nova logger/config/constants/paths/status-store/telemetry/Discord/Gateway/security/adapter/status services; common ACP monitor/lifecycle/runtime/session-termination/tracked-agent/CLI helpers through facades; module worker and reviewer lifecycle helpers.
Dynamic imports: none found.
Exported symbols: healthcheck identity/liveness helpers; lifecycle telemetry payload builders; orchestration spawn/kill/steer/Redis dispatch/Buster payload helpers and worker/reviewer re-exports; reviewer spawn/kill helpers; shutdown reaper/hooks/context helpers; runtime/session/termination/tracked-agent/CLI facade exports.
Canonical authority used: Nova owns orchestration dispatch routing, Buster Redis payload construction, reviewer lifecycle, agent healthcheck, lifecycle telemetry payloads, shutdown/reaper context, and Redis adapter caching; common owns runtime classification, session semantics, session termination, tracked-agent registry, and CLI parsing behind facades.
Fallback/legacy/shim hits found: Redis-agent health shortcut; transcript fallback for Gateway health gaps; telemetry/tracked-entry identity aliases; lifecycle notification best-effort behavior; Git baseline evidence best-effort; spawn/reviewer/task payload defaults; Buster capability and `suites`/`test_suites` aliases; steer tolerance; five role-local facades; shutdown process/proc heuristics, mixed tracked-entry shapes, duplicate signal guard, interrupt status guard, telemetry-close fallback, and placeholder shutdown context.
Fallback decision:
  - deleted: none.
  - renamed as canonical: Redis-agent health shortcut, degraded/restored suppression, optional Git/change evidence, notification nonblocking behavior, idempotent missing-session kills, unconfirmed termination preservation, steer tolerance, process reaper best effort/heuristics, duplicate signal guard, interrupt status guard, and telemetry-close fallback.
  - kept as external adapter: transcript fallback pending Gateway status reliability, lifecycle identity aliases, spawn/reviewer/Buster payload old shapes, Buster capability and suite aliases, role-local facades, mixed tracked-entry shutdown stop, and placeholder shutdown context.
  - needs user decision: whether transcript-progress fallback should remain after Gateway liveness is reliable, and when Redis Buster task payload aliases/defaults should be tightened to one canonical contract.
Behavior invariants: no batch file becomes a CLI/runtime entrypoint; orchestration must not fail session spawn/kill because telemetry or Discord notices fail; Redis dispatch remains adapter-registered; Buster payloads keep strong run/attempt/dispatch identity; shutdown must stop tracked sessions before exit and avoid broad process kills.
Simplifications/optimizations: type agent/reviewer config and lifecycle telemetry options, isolate old Buster Redis payload aliases at producer boundaries, type tracked-agent entries so shutdown no longer accepts raw session keys, and keep common facades as explicit adapters only.
Tests/checks run: out of scope; only source/docs inspection, rg caller discovery, wc line verification, and git diff/status.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, phase-0-batch-plan.md.
Deleted files: none.
Open questions: Should Gateway transcript fallback remain a permanent health policy, and should Nova continue generating/accepting Buster Redis task defaults and aliases once Redis task producers are canonicalized?
```

## Batch 13 — DONE — 10 files, 1927 lines

| Lines | Action | File |
|---:|---|---|
| 256 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/cli.ts` |
| 392 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/core/config.ts` |
| 134 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/core/constants.ts` |
| 450 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/core/context.ts` |
| 36 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/core/deps.ts` |
| 10 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/core/git-context.ts` |
| 105 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/core/logger.ts` |
| 306 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/core/paths.ts` |
| 40 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/core/platform-config.ts` |
| 198 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/core/policy.ts` |

### Phase 0 slice review — Nova CLI and core configuration/context foundations

```text
Slice: Nova CLI and core configuration/context foundations
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/nova/pipeline/cli.ts
  - kubeclaw-main/skills/nova/pipeline/core/config.ts
  - kubeclaw-main/skills/nova/pipeline/core/constants.ts
  - kubeclaw-main/skills/nova/pipeline/core/context.ts
  - kubeclaw-main/skills/nova/pipeline/core/deps.ts
  - kubeclaw-main/skills/nova/pipeline/core/git-context.ts
  - kubeclaw-main/skills/nova/pipeline/core/logger.ts
  - kubeclaw-main/skills/nova/pipeline/core/paths.ts
  - kubeclaw-main/skills/nova/pipeline/core/platform-config.ts
  - kubeclaw-main/skills/nova/pipeline/core/policy.ts
Runtime entrypoints affected: skills/nova/pipeline/cli.ts direct CLI/runtime entrypoint for full pipeline, resume, status, dry-run, and blueprint commands.
Incoming callers: CLI is direct-executed; pipeline/index re-exports config/constants; services/runners/prompts import constants, config/policy, context/plugin helpers, deps, git context, logger, and path helpers throughout Nova.
Outgoing dependencies: CLI imports Node fs/url plus index, blueprint, context, logger, temp, status-store, runtime, pipeline-runner, policy, cli-args, redaction, prompt-ingress; core modules import Node fs/path/async_hooks plus runtime, registry, platform config, Git primitives, serialization, artifact/observability/telemetry/Discord/system-warning services.
Dynamic imports: none found.
Exported symbols: CLI exports normalizeNovaCliFlags and main; config exports load/validate/model helpers and re-exports policy/platform config helpers; constants exports status/exit/plugin constants; context exports PipelineContext/plugin context helpers; deps exports selectDeps; git-context re-exports Git primitives; logger exports active context/logging helpers; paths exports path/ref helpers; platform-config exports config discovery/loading; policy exports thinking/model policy helpers.
Canonical authority used: Nova CLI/runtime entrypoint, config/progress validation, platform config discovery, status/exit/plugin vocabulary, pipeline/plugin context surfaces, dependency injection selection, Git facade, structured logging, path/ref layout, and model/thinking policy.
Fallback/legacy/shim hits found: legacy CLI key guard; direct-entry argv fallback; env flag/config fallbacks; config._runtimeOverrides and other config._* runtime mirrors; old temp dir setter fallback; repo-root/platform config fallback chains; progress pipeline_review and DISCORD_WEBHOOK promotion; numeric coercion and unknown config ignore; broad config re-export surface; plugin request aliases; flat/scoped deps merge; git-context facade; logger stderr/file-append fallbacks; approval ref fallbacks; object model normalization; Redis thinking boundary; policy audit best-effort writes.
Fallback decision:
  - deleted: remove legacy CLI key runtime guard and temp-dir shape fallback once TS/context types enforce canonical shape; keep _testOverrides rejection as guard while deleting old override channel.
  - renamed as canonical: numeric config coercion; no-context stderr logging; best-effort log and policy audit writes; deterministic model fallback chain; Redis thinking unsupported boundary.
  - kept as external adapter: env/operator fallbacks, repo-root/platform config fallbacks, config/policy re-export surface, config._* runtime mirrors until ctx-first migration, plugin request aliases, flat/scoped deps merge, git-context facade, approval refs without full log context, object model normalization until defaults canonicalize.
  - needs user decision: whether unknown top-level config fields should remain DEBUG-only ignored or become strict validation errors.
Behavior invariants: CLI must not run on import; real pipeline runs require Nova channel unless status/dry-run/blueprint; invalid thinking fails before config load; config validation builds plugin registry before gate validation; safe path helpers reject traversal/unsafe roots; policy resolver must preserve precedence and not forward thinking on Redis dispatch; logging and audit append failures remain nonterminal.
Simplifications/optimizations: TS migration should type canonical CLI flags, move runtime mutable state toward PipelineContext, narrow plugin request aliases to typed adapters, and preserve thin CLI/service boundaries.
Tests/checks run: out of scope; used source/docs inspection plus grep/wc/git verification only.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, entrypoint-inventory.md, phase-0-batch-plan.md.
Deleted files: none.
Open questions: Should unknown platform config keys continue to be ignored for forward compatibility, or should TS migration make config validation strict?
```


## Batch 14 — DONE — 10 files, 1517 lines

| Lines | Action | File |
|---:|---|---|
| 402 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/core/registry/builtins.ts` |
| 213 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/core/registry/config-normalization.ts` |
| 143 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/core/registry/indexes.ts` |
| 325 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/core/registry/validation.ts` |
| 224 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/core/registry.ts` |
| 158 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/core/runtime.ts` |
| 29 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/core/temp.ts` |
| 2 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/git-primitives.ts` |
| 19 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/index.ts` |
| 2 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/integrations/discord-webhook.ts` |


### Phase 0 slice review — Nova registry/runtime public surfaces and adapters

```text
Slice: Nova registry/runtime public surfaces and adapters
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/nova/pipeline/core/registry/builtins.ts
  - kubeclaw-main/skills/nova/pipeline/core/registry/config-normalization.ts
  - kubeclaw-main/skills/nova/pipeline/core/registry/indexes.ts
  - kubeclaw-main/skills/nova/pipeline/core/registry/validation.ts
  - kubeclaw-main/skills/nova/pipeline/core/registry.ts
  - kubeclaw-main/skills/nova/pipeline/core/runtime.ts
  - kubeclaw-main/skills/nova/pipeline/core/temp.ts
  - kubeclaw-main/skills/nova/pipeline/git-primitives.ts
  - kubeclaw-main/skills/nova/pipeline/index.ts
  - kubeclaw-main/skills/nova/pipeline/integrations/discord-webhook.ts
Runtime entrypoints affected: none; index.js is a public module barrel and core/temp is used by the CLI, but no batch file is a direct CLI/runtime/tool entrypoint.
Incoming callers: registry submodules are imported by core/registry.ts; core/registry.ts feeds core/config startup and runner/dispatcher stage lookup; core/runtime.js is imported broadly by CLI, context, paths, policy, runners, polling, status-store, telemetry, summaries, integrations, validators, failures, and artifacts; core/temp.js is imported by CLI; git-primitives and discord-webhook are Nova-local facades; index.js is imported by root pipeline.ts and CLI.
Outgoing dependencies: builtins imports current gate/validator/generator/notification/telemetry implementations; registry assembly imports serialization, config normalization, validation, and index builders; runtime imports logger/redaction plus Node fs/path; temp imports Node fs/os/path; facades re-export common Git/Discord surfaces; index.js re-exports selected config, shutdown, constants, telemetry, notification, and runner APIs.
Dynamic imports: none found.
Exported symbols: built-in plugin definition list; plugin config/index/validation helpers; registry assembly/lookup/handler/listener helpers; run id/stat/context/effect/output/progress helpers; temp manager factory; common Git and Discord webhook facade exports; Nova public barrel exports for loadConfig, shutdown hooks, status/exit constants, telemetry helpers, notification helpers, runPipeline, and default runner.
Canonical authority used: startup plugin registry, built-in plugin bridge definitions, plugin config normalization, plugin manifest/config/capability/trust validation, stage/hook/gate indexes, run context helpers, CLI temp manager, common Git primitives, common Discord webhook transport, and Nova public barrel surface.
Fallback/legacy/shim hits found: built-in PluginContext bridge to current implementations; required private coreRuntime readers; plugin-config safe defaults; reserved custom module discovery path; invalid config-schema raw-config return when collecting errors; registry test/inspection seams; runtime RUN_ID/_runStats live bindings; config-projection and fallback run context; best-effort temp cleanup; Git and Discord webhook facades; broad public index barrel.
Fallback decision:
  - deleted: none.
  - renamed as canonical: private reader failure behavior, missing plugin config safe defaults, temp cleanup best-effort behavior.
  - kept as external adapter: built-in bridge handlers until native plugin implementations exist; registry harness seams; RUN_ID/_runStats and config-projection compatibility during context migration; Git and Discord facades.
  - needs user decision: whether reserved custom module discovery remains in config before implementation, whether invalid-schema raw config should survive when not throwing, whether fallback run context should remain outside bound PipelineContext, and whether the broad public index barrel is committed API.
Behavior invariants: registry remains startup-frozen and throws on validation errors by default; decision-bearing stages require registry ownership; notification/telemetry are listener surfaces; built-ins must not read public PluginContext state that is not exposed; runtime helpers must preserve sanitized stdout and existing config/context projections; temp cleanup must not mask process exit.
Simplifications/optimizations: TS migration can type plugin manifests/records/errors and run-context shapes, keep facades as explicit adapters, and narrow index.js exports only after API decision.
Tests/checks run: out of scope; only source/docs inspection plus git diff/status.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, phase-0-batch-plan.md.
Deleted files: none.
Open questions: Should public plugin custom discovery config be hidden until implemented, should raw module config survive invalid schemas under nonthrowing registry builds, should fallback run state remain available outside PipelineContext, and is index.js a stable public API?
```

## Batch 15 — DONE — 10 files, 1351 lines

| Lines | Action | File |
|---:|---|---|
| 353 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/integrations/discord.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/integrations/gateway.ts` |
| 603 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/integrations/git-worktree.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/lifecycle-state.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/noncritical-reporting.ts` |
| 60 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/prompts/buster-gate.ts` |
| 11 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/prompts/buster-instructions.ts` |
| 74 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/prompts/buster-module.ts` |
| 175 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/prompts/forge.ts` |
| 66 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/prompts/gate-fix.ts` |


### Phase 0 slice review — Nova Discord/Gateway/Git integrations and prompt builders

```text
Slice: Nova Discord/Gateway/Git integrations and prompt builders
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/nova/pipeline/integrations/discord.ts
  - kubeclaw-main/skills/nova/pipeline/integrations/gateway.ts
  - kubeclaw-main/skills/nova/pipeline/integrations/git-worktree.ts
  - kubeclaw-main/skills/nova/pipeline/lifecycle-state.ts
  - kubeclaw-main/skills/nova/pipeline/noncritical-reporting.ts
  - kubeclaw-main/skills/nova/pipeline/prompts/buster-gate.ts
  - kubeclaw-main/skills/nova/pipeline/prompts/buster-instructions.ts
  - kubeclaw-main/skills/nova/pipeline/prompts/buster-module.ts
  - kubeclaw-main/skills/nova/pipeline/prompts/forge.ts
  - kubeclaw-main/skills/nova/pipeline/prompts/gate-fix.ts
Runtime entrypoints affected: none; no batch file is a direct CLI/runtime/tool entrypoint.
Incoming callers: Discord is imported by Nova context, agents, runners, notification/rate-limit/summary/failure/blueprint/case-study/telemetry services, and tools; Gateway/lifecycle/noncritical facades are imported by Nova agents/services/runners; Git worktree policy is imported by polling/blueprint/Forge-completion services and Buster/review/module runners; prompt builders are imported by module-runner attempt and gate runners.
Outgoing dependencies: Node fs/path; Nova core logger/runtime/deps/constants/paths/Git context; common-backed facades for Gateway, lifecycle-state, noncritical-reporting, Discord webhook, timing/security; observability, redaction, failure classification, prompt-ingress, and prompt shared helpers.
Dynamic imports: none inside the batch files; `tools/redis.ts` dynamically imports the Discord integration as an incoming caller.
Exported symbols: `discord`, `discordEmbeds`; Gateway/lifecycle/noncritical facade re-exports; Git context/failure re-exports plus polling safety, runtime-state path, pull, push, commit, and Forge sync helpers; gate/Buster/Forge instruction readers and prompt builders; gate fix prompt builder.
Canonical authority used: Nova owns Discord notification/audit policy, Git worktree/push policy, and prompt construction contracts; common owns Gateway IO, lifecycle-state mutation, noncritical reporting, webhook transport, timing, and security through facades.
Fallback/legacy/shim hits found: role-local common facades; Discord identity/log/run aliases, webhook mute/no-op behavior, dependency injection search, and nonblocking delivery/audit/stat failures; Git runtime-state allowlist, fail-closed dirty checks, active-session/runtime-only polling skips, runtime-conflict auto-resolution, dormant destructive recovery branch, retry/soft-fail/already-committed/diff-stat fallbacks; prompt workspace/instruction error/substep/backend-package/memory-disabled/fix-history fallbacks.
Fallback decision:
  - deleted: dormant destructive Git recovery if no approved caller needs it; disabled Forge memory recall code if recall is not being restored.
  - renamed as canonical: Discord nonblocking side effects; Git runtime-state safety, polling skips, runtime conflict auto-resolution, push retry defaults, diff-stat null fallback; prompt missing-instruction error results, backend package conditional context, and gate-fix no-change history wording.
  - kept as external adapter: role-local facades; Discord field/run/log/deps/env aliases; Git soft-fail and already-committed Forge handoff; gate workspace fallback pending canonical artifact contract.
  - needs user decision: Git upstream lookup failure treating ahead-of-upstream as false; whether partial substep FORGE.md trees are valid; whether disabled memory recall will return or be removed.
Behavior invariants: no batch file becomes an entrypoint; Discord and noncritical reporting remain nonblocking; Gateway/lifecycle/reporting common authorities stay behind facades; Git must never discard non-runtime source/config work without explicit destructive approval; Buster/Forge prompts must keep Git sync, workspace, completion artifact/protocol, and final-action ownership boundaries.
Simplifications/risks/open questions: Type Discord embed/correlation identity and dependency injection options; type Git safety/result/status mutation shapes and remove unused destructive branches; make prompt builder return types explicit; isolate legacy alias handling at config/prompt boundaries. Risk: `gitSyncBeforeBuster`'s already-committed branch calls `gitPushWithRetry(config, 3, 5000, { budget, signal })` although `budget` and `signal` are not defined in that function scope.
Tests/checks run: out of scope; only source/docs inspection, rg caller discovery, dynamic-import search, git diff/status.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, phase-0-batch-plan.md.
Deleted files: none.
Open questions: Should Git upstream lookup errors fail closed, should substep modules require every listed `FORGE.md`, and should the disabled Forge memory recall path be deleted or redesigned?
```

## Batch 16 — DONE — 10 files, 2041 lines

| Lines | Action | File |
|---:|---|---|
| 114 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/prompts/review.ts` |
| 206 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/prompts/shared.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/redaction.ts` |
| 2 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/redis-transport.ts` |
| 155 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/approval-gate-control.ts` |
| 680 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/approval-gate-runner.ts` |
| 60 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/approval-gate-shared.ts` |
| 240 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/approval-gate-state.ts` |
| 339 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/buster-gate-completion.ts` |
| 242 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/buster-gate-control.ts` |


### Phase 0 slice review — Nova prompt contracts, shared facades, approval gate, and Buster-gate completion/control

```text
Slice: Nova prompt contracts, shared facades, approval gate, and Buster-gate completion/control
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/nova/pipeline/prompts/review.ts
  - kubeclaw-main/skills/nova/pipeline/prompts/shared.ts
  - kubeclaw-main/skills/nova/pipeline/redaction.ts
  - kubeclaw-main/skills/nova/pipeline/redis-transport.ts
  - kubeclaw-main/skills/nova/pipeline/runners/approval-gate-control.ts
  - kubeclaw-main/skills/nova/pipeline/runners/approval-gate-runner.ts
  - kubeclaw-main/skills/nova/pipeline/runners/approval-gate-shared.ts
  - kubeclaw-main/skills/nova/pipeline/runners/approval-gate-state.ts
  - kubeclaw-main/skills/nova/pipeline/runners/buster-gate-completion.ts
  - kubeclaw-main/skills/nova/pipeline/runners/buster-gate-control.ts
Runtime entrypoints affected: none; files are imported prompt/gate helpers and registry-dispatched runner modules, not direct CLI/runtime/tool entrypoints.
Incoming callers: review gate runner/fix-cycle import review prompts; Nova prompt builders import shared prompt helpers; Nova CLI/services/tools import redaction; agent-observability ingester imports Redis transport; built-in gate registry imports approval runner; buster-gate runner imports Buster completion/control helpers.
Outgoing dependencies: prompt helpers import core path helpers; redaction/Redis files re-export common shared surfaces; approval gate imports status-store, governance, telemetry, typed gate-control, Discord fields, pipeline events, approval signal adapter, and approval state helpers; Buster gate completion/control import event adapters, completion controller, rate-limit, typed control, remediation, and correlation helpers.
Dynamic imports: none in the batch files.
Exported symbols: review prompt builders; shared prompt/result/artifact contract builders; redaction and Redis common exports; approval status/control/state/runner helpers; Buster gate completion wait, typed-control, issue extraction, and remediation request helpers.
Canonical authority used: common redaction and Redis transport; Nova prompt contract helpers; approval status/timeout vocabulary, persistence/audit artifacts, runtime wait flow, and typed-control projection; Buster completion event wait mapping; Buster gate issue/remediation projection.
Fallback/legacy/shim hits found: prompt `.toString()` shim; redaction/Redis facades; approval compatibility control projection and timeout/state normalization; fail-closed corrupted/invalid approval state; approval resume/replay and timeout continue; noncritical approval audit writes; legacy gate-status completion source; Redis verdict parse fallback; local parse-error mapping; Buster failure-class inference, multi-shape issue extraction, correlation aliases, and default remediation policy.
Fallback decision:
  - deleted: none.
  - renamed as canonical: approval timeout policy default to BLOCK; corrupted/invalid approval fail-closed; approval resume/replay; Redis verdict parse fallback; completion adapter fatal/timeout alerts; default Buster remediation limits.
  - kept as external adapter: prompt string `.toString()` shim until callers use prompt metadata; Nova redaction/Redis facades; approval compatibility control projection; mixed approval identity/state aliases; legacy gate-status completion source; local parse-error reason mapping; Buster reason-text failure inference, multi-shape issue extraction, and correlation aliases.
  - needs user decision: approval audit artifact writes staying nonterminal; approval timeout CONTINUE auto-pass policy; whether reason-text failure inference should remain after typed Buster results are canonical.
Behavior invariants: prompt builders must not write files; no batch file is a direct entrypoint; redaction/Redis facades stay side-effect-light; approval gates must never overwrite corrupted/invalid human decision state automatically; pending approval resume must avoid duplicate operator requests; Buster gate completion must stop adapters and map every terminal evidence path to a poll result.
Simplifications/optimizations: type prompt result metadata and artifact contracts; make approval persisted-state and signal-event types explicit; centralize approval timeout policy ownership; prefer explicit Buster `failure_class` and canonical issue/correlation shapes after migration.
Tests/checks run: out of scope; only source/docs inspection plus git diff/status verification.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, phase-0-batch-plan.md.
Deleted files: none.
Open questions: Should approval timeout CONTINUE remain a pass/proceed outcome, should approval audit artifact failures stay nonterminal, and when can Buster gate evidence callers drop legacy/reason-text/correlation alias adapters?
```

## Batch 17 — DONE — 9 files, 2353 lines

| Lines | Action | File |
|---:|---|---|
| 158 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/buster-gate-fix-cycle.ts` |
| 558 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/buster-gate-runner.ts` |
| 84 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/buster-gate-task.ts` |
| 456 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/buster-gate-terminal.ts` |
| 312 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/gate-forge-fix-cycle.ts` |
| 481 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/gate-runner.ts` |
| 143 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/module-runner/attempt.ts` |
| 129 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/module-runner/buster-phase/dispatch.ts` |
| 32 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/module-runner/buster-phase/identity.ts` |

### Phase 0 slice review — Nova Buster/review gate runners and module-runner Buster dispatch/identity

```text
Slice: Nova Buster/review gate runners and module-runner Buster dispatch/identity
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/nova/pipeline/runners/buster-gate-fix-cycle.ts
  - kubeclaw-main/skills/nova/pipeline/runners/buster-gate-runner.ts
  - kubeclaw-main/skills/nova/pipeline/runners/buster-gate-task.ts
  - kubeclaw-main/skills/nova/pipeline/runners/buster-gate-terminal.ts
  - kubeclaw-main/skills/nova/pipeline/runners/gate-forge-fix-cycle.ts
  - kubeclaw-main/skills/nova/pipeline/runners/gate-runner.ts
  - kubeclaw-main/skills/nova/pipeline/runners/module-runner/attempt.ts
  - kubeclaw-main/skills/nova/pipeline/runners/module-runner/buster-phase/dispatch.ts
  - kubeclaw-main/skills/nova/pipeline/runners/module-runner/buster-phase/identity.ts
Runtime entrypoints affected: none; these files are imported by pipeline runners/registry/state-machine code and are not direct CLI/runtime/tool entrypoints.
Incoming callers: core/registry/builtins imports Buster gate stage/control adapter; pipeline-runner-deps imports generic runGate; module-runner.js imports module attempt helpers; module-runner/buster-phase.js and failure/terminal modules import Buster dispatch/identity helpers; Buster/review gate fix adapters use the shared Forge fix-cycle engine.
Outgoing dependencies: Node fs/path; Nova core deps/logger/constants/runtime/config/paths/context/registry/Git context; Discord/Git integrations; status-store, polling, rate-limit, telemetry, Discord identity, remediation, gate-active-session, gate-fix scaffold, gate-control/pipeline-step contracts; Buster gate prompts/control/completion/task/fix/terminal helpers; module state-machine, validation, dependency, failure, blueprint, orchestration/lifecycle/shutdown, and Buster worker helpers.
Dynamic imports: none found.
Exported symbols: Buster gate evaluation/fix/remediation adapter exports, pure Buster gate identity helpers, Buster terminal handler, shared runGateForgeFixCycle, generic runGate default/named export, module attempt helpers/default, Buster attempt dispatch, and completion correlation resolvers.
Authorities used: generic gate dispatch and plugin gate-control adapter validation; Buster gate evaluation/remediation/terminal mapping; Buster gate dispatch identity; shared gate Forge fix-cycle engine; module attempt coordination; module Buster phase dispatch and completion correlation precedence.
Fallback/legacy/shim hits found: remediation policy/correlation fallbacks; output_file vs legacy gate-status handling; best-effort stale artifact/prompt/PASS evidence writes; dependency override seams; rate-limit identity fallbacks; tracked-agent identity aliases; poll-reason/failure-class compatibility mapping; config/log-dir compatibility fields; mixed gate evidence snapshots; pipeline-step compatibility projection; module defaults/dependency short-circuit; Buster module prompt/config/queued-notification fallbacks; completion identity alias precedence.
Fallback decision:
  - deleted: none.
  - renamed as canonical: output_file completion authority with gate-status rerun, stale artifact cleanup best effort, prompt/PASS evidence write behavior, config validation as structured result, Redis archive fail-closed, dispatch-id timestamp defaults, fix-loop request_fix handoff, transcript no-change classification, missing gate/adapter failure mapping, module defaults and dependency short-circuit, Buster prompt/config validation/queued suite fallbacks.
  - kept as external adapter: remediation/correlation old-shape support, dependency override seams, rate-limit/tracked-agent/correlation aliases, poll-reason/failure-class compatibility mapping, `_logDir`/`_runLogDir` config field fill, mixed gate evidence snapshot, step compatibility projection, broad module deps table, completion identity aliases.
  - needs user decision: whether gate fix-cycle soft-fail Git commit should allow retest/proceed when push fails.
Behavior invariants: generic gates must dispatch only through registered owners; adapter contract failures fail closed into pipeline step results; Buster gate completion authority remains output_file/validated completion evidence, not legacy gate-status alone; stale completions are archived before active dispatch; rate-limit cooldown keeps attempt number stable; fix-and-retest uses shared remediation handoff; module Buster phase saves prompt/status and sets shutdown context before worker execution.
Simplifications/optimizations: type the gate-control adapter and remediation controller contracts early; make correlation identity a single typed object; keep Buster gate task helpers pure; split compatibility projections from canonical step results; reduce module-runner dependency table once state-machine phases are typed.
Tests/checks run: out of scope; only source/docs inspection and git diff/status.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, phase-0-batch-plan.md.
Deleted files: none.
Open questions: Should a Forge gate-fix session that changes files but fails soft Git commit/push still proceed to retest, or should that become terminal/degraded requiring Nova?
```

## Batch 18 — DONE — 10 files, 1306 lines

| Lines | Action | File |
|---:|---|---|
| 179 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/module-runner/buster-phase/poll-failure.ts` |
| 78 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/module-runner/buster-phase/spawn-failure.ts` |
| 260 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/module-runner/buster-phase/terminal-failure.ts` |
| 70 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/module-runner/buster-phase/terminal-pass.ts` |
| 209 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/module-runner/buster-phase.ts` |
| 51 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/module-runner/preflight.ts` |
| 223 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/module-runner/state-machine.ts` |
| 76 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/module-runner/terminal-results.ts` |
| 157 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/module-runner-buster-worker.ts` |


### Phase 0 slice review — Nova module-runner Buster phase state-machine and worker dispatch

```text
Slice: Nova module-runner Buster phase state-machine and worker dispatch
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/nova/pipeline/runners/module-runner/buster-phase/poll-failure.ts
  - kubeclaw-main/skills/nova/pipeline/runners/module-runner/buster-phase/spawn-failure.ts
  - kubeclaw-main/skills/nova/pipeline/runners/module-runner/buster-phase/terminal-failure.ts
  - kubeclaw-main/skills/nova/pipeline/runners/module-runner/buster-phase/terminal-pass.ts
  - kubeclaw-main/skills/nova/pipeline/runners/module-runner/buster-phase.ts
  - kubeclaw-main/skills/nova/pipeline/runners/module-runner/preflight.ts
  - kubeclaw-main/skills/nova/pipeline/runners/module-runner/state-machine.ts
  - kubeclaw-main/skills/nova/pipeline/runners/module-runner/terminal-results.ts
  - kubeclaw-main/skills/nova/pipeline/runners/module-runner-buster-worker.ts
Runtime entrypoints affected: none; no batch file is a direct CLI/runtime/tool entrypoint. The old Buster phase compatibility facade has been deleted.
Incoming callers: module attempt execution imports the state machine and terminal result helpers; Forge imports preflight and retry helpers; pre-Buster imports retry helpers; the state machine calls the Buster phase; the Buster phase calls poll/spawn/pass/failure handlers and Buster dispatch; dispatch calls the Buster worker bridge.
Outgoing dependencies: Nova constants/logger/runtime/correlation/lifecycle-state/telemetry/completion-adjudicator/rate-limit/Discord fields, module-runner shared helpers, Forge/pre-Buster/Buster dispatch helpers, plugin registry/context contracts, worker-control compatibility projector, and injected deps for status persistence, Discord, validation, suite classification, and failure handling.
Dynamic imports: none found.
Exported symbols: Buster poll/spawn/terminal failure/pass handlers; `runModuleBusterPhase`; `runModulePreflight`; `MODULE_ATTEMPT_ACTIONS` and module attempt planning/state-machine helpers; terminal/retry result builders; `executeBusterWorkerAttempt`.
Canonical authority used: module attempt state-machine order; Forge preflight failure routing; Buster phase crash retry and Redis-completion reconciliation; Buster spawn/poll/pass/failure terminal policy; module terminal result envelope shaping; registry-backed `worker:module_buster` plugin invocation and active-agent lifecycle updates.
Fallback/legacy/shim hits found: status reload precedence; identity alias fallback chains; rate-limit fallback fields; polling Git fail-closed details fallback; Redis/local conflict fail-closed; crash retry classification; Redis source aliases; pre-test verdict heuristic; repeated pre-test detection from text summaries; Buster retry/stage defaults; Redis terminal reconciliation; retry/blocked/rate-limit result compatibility projections; worker-control compatibility projection; finalized status reload fallback.
Fallback decision:
  - deleted: none.
  - renamed as canonical: status reload precedence; polling Git fail-closed; completion conflict fail-closed; poll crash retry classification; pre-test verdict heuristic; infra/config pre-test Nova escalation; normal agent failure Forge handoff; Buster crash retry and stage defaults; loaded-terminal skip; blueprint release Nova escalation; thrown diagnostics passthrough.
  - kept as external adapter: identity alias fallback chains; rate-limit fallback fields until exit input is typed; Redis source aliases until source enum is canonical; repeated pre-test text-summary detection until typed history exists; Redis terminal reconciliation while completion authority projections coexist; default empty preflight args; retry/blocked/rate-limit result compatibility; worker-control compatibility projection; finalized status reload fallback.
  - needs user decision: none.
Behavior invariants: already PASS/BLOCKED modules must not rerun; missing stages default to Forge+Buster; Buster crash retries do not consume Forge fail count; completion conflicts fail closed; infra/config pre-test issues preserve Forge output and return `EXIT_NEEDS_NOVA`; Buster worker dispatch must update/clear active-agent evidence; Redis completions apply only through the shared adjudicator.
Simplifications/optimizations: type a single completion identity object, a typed pre-test failure history, and the worker-control result so alias chains and compatibility projections can shrink; keep terminal handlers small during TS migration.
Tests/checks run: out of scope; only source/docs inspection and git diff/status.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, phase-0-batch-plan.md. Entrypoint inventory and existing TypeScript islands unchanged.
Deleted files: none.
Open questions: none from this slice; main migration risk is preserving existing terminal/retry envelope compatibility while tightening types.
```

## Batch 19 — DONE — 9 files, 2491 lines

| Lines | Action | File |
|---:|---|---|
| 595 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/module-runner-forge.ts` |
| 277 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/module-runner-prebuster.ts` |
| 557 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/module-runner-shared.ts` |
| 72 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/module-runner.ts` |
| 44 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-deps.ts` |
| 315 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-lock.ts` |
| 47 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-loop.ts` |
| 543 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-recovery.ts` |
| 41 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-scheduling/snapshots.ts` |


### Phase 0 slice review — Nova module Forge/pre-Buster phases and pipeline runner control loop

```text
Slice: Nova module Forge/pre-Buster phases and pipeline runner control loop
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/nova/pipeline/runners/module-runner-forge.ts
  - kubeclaw-main/skills/nova/pipeline/runners/module-runner-prebuster.ts
  - kubeclaw-main/skills/nova/pipeline/runners/module-runner-shared.ts
  - kubeclaw-main/skills/nova/pipeline/runners/module-runner.ts
  - kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-deps.ts
  - kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-lock.ts
  - kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-loop.ts
  - kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-recovery.ts
  - kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-scheduling/snapshots.ts
Runtime entrypoints affected: none; no batch file is a direct CLI/runtime/tool entrypoint. `module-runner.js` is a public runtime facade imported by the pipeline runner dependency table, not a direct process entrypoint.
Incoming callers: module attempt state-machine imports Forge and pre-Buster phases; module Buster worker/phase handlers import shared helpers; pipeline-runner/start/terminal/loop import pipeline-runner deps; pipeline-runner imports loop and recovery; pipeline-runner-scheduling imports snapshot helpers; recovery re-exports lock helpers.
Outgoing dependencies: Nova plugin context/registry/contracts, constants/logger/runtime/paths, lifecycle-state, correlation, telemetry, Discord fields/integration, ACP monitor/observability/session termination/shutdown, status-store, gate active-session evidence, failure semantics, orchestration workers, pipeline-step and worker-control contracts, scheduling/state-machine helpers, blueprint/summary/status-store/gate/module runner deps, and Node fs/path/os.
Dynamic imports: none found.
Exported symbols: `runModuleForgePhase`, `finalizeForgeOnlyPass`, `prepareModuleForBuster`, module shared telemetry/timing/validation/plugin-input/result-normalization helpers, named/default `runModule`, `DEFAULT_PIPELINE_RUNNER_DEPS`, `getPipelineRunnerDeps`, `PIPELINE_RUN_CONCURRENCY_LIMIT`, `acquirePipelineRunLock`, `releasePipelineRunLock`, `runValidatorStep`, `runPipelineLoop`, `reconcileStaleModuleState`, `reconcileStaleGateSessions`, `countByStatus`, `buildGeneratorArtifactRefs`.
Canonical authority used: Forge phase orchestration and Forge-only finalization; pre-Buster validator/Git-sync guard; module shared PluginContext input/result projection; public module retry loop; pipeline dependency table; leased pipeline run lock; scheduled validator loop bridge; stale module/gate recovery; scheduling snapshot helpers.
Fallback/legacy/shim hits found: worker-control compatibility projection; active-agent/result/status identity aliases; finalized status reload fallback; Forge no-work and completion reason aliases; transcript no-work heuristic; rate-limit identity fallbacks; Forge-only Git soft-fail PASS; validator diagnostic shape fallbacks; Buster-only promotion; missing validation fail-closed; telemetry/time/status/log-dir compatibility fields; pipeline-step compatibility projection; worker dependency fallback; default stages/deadlines/Buster attempt; retry sleep; dependency override seam; lock timing defaults/malformed sentinel/stale reclaim/owner-lost handling; schedule metadata aliases; recovery identity aliases, log-dir fill, unconfirmed identity block, stop-confirm defaults, best-effort blocked observability, age-based reset, terminal-or-kill split, weak gate evidence block, ENOENT cleanup handling; missing log-dir snapshot refs.
Fallback decision:
  - deleted: none.
  - renamed as canonical: transcript no-work diagnostic heuristic; Buster-only promotion; validator block/retry mapping; missing validation milestone fail-closed; validation reset per attempt; default module stages/deadlines/Buster attempt; optional artifact refs; retry sleep grace; lock timing defaults, malformed-lock block, stale-lock reclaim, heartbeat owner-lost stop; session identity unconfirmed block; stop-confirm defaults; recovery blocked observability best effort; terminal-or-kill recovery split; weak gate evidence block; ENOENT cleanup handling; missing log-dir snapshot refs.
  - kept as external adapter: default empty phase args; recalled-memory fallback; active-agent/result/status identity aliases; Forge worker-control compatibility projection; finalized status reload fallback; Forge reason aliases; rate-limit identity fallbacks; validator diagnostic shape fallbacks; telemetry context/status time/commit aliases; config `_logDir`/`_runLogDir` fill; pipeline-step compatibility projection; worker dependency fallback; dependency override seam; schedule metadata aliases; recovery identity aliases and log-dir fill; lock release fallback config.
  - needs user decision: Forge-only PASS after Git commit/push soft failure; stale module status age reset after 10 minutes with no active session.
Behavior invariants: Forge dispatch must go through registered `worker:module_forge`; Forge completion must be valid `READY_FOR_TESTING` evidence or BLOCKED/terminal failure; delivery-lint and pre-check must pass before Buster on Forge+Buster modules; pipeline run lock must serialize runs per `swarm_dir`; stale session recovery must block without confirmed identity or confirmed stop; scheduled validators mark complete only on `continue`.
Simplifications/optimizations: type a single worker dispatch identity and rate-limit identity object; retire Forge reason aliases after worker-control enum migration; type validator diagnostics; separate compatibility projections from canonical module step results; move mutable config log-dir fills behind PipelineContext; make stale age threshold named config/policy.
Tests/checks run: out of scope; source/docs inspection only, plus git diff/status verification.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, phase-0-batch-plan.md. Entrypoint inventory unchanged; existing TypeScript islands unchanged.
Deleted files: none.
Open questions: Should Forge-only modules remain PASS when Git commit/push soft-fails, and should stale module statuses without active sessions auto-reset after a fixed 10-minute age threshold?
```

## Batch 20 — DONE — 10 files, 2149 lines

| Lines | Action | File |
|---:|---|---|
| 70 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-scheduling/validator-completions.ts` |
| 655 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-scheduling.ts` |
| 212 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-shared.ts` |
| 274 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-start.ts` |
| 66 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-state-machine.ts` |
| 338 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-terminal.ts` |
| 120 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner.ts` |
| 163 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/remediable-gate-engine.ts` |
| 135 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/review-gate-control.ts` |
| 116 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/review-gate-fix-cycle.ts` |


### Phase 0 slice review — Nova pipeline runner scheduling, terminal flow, remediable gates, and review fix-cycle

```text
Slice: Nova pipeline runner scheduling, terminal flow, remediable gates, and review fix-cycle
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-scheduling/validator-completions.ts
  - kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-scheduling.ts
  - kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-shared.ts
  - kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-start.ts
  - kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-state-machine.ts
  - kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner-terminal.ts
  - kubeclaw-main/skills/nova/pipeline/runners/pipeline-runner.ts
  - kubeclaw-main/skills/nova/pipeline/runners/remediable-gate-engine.ts
  - kubeclaw-main/skills/nova/pipeline/runners/review-gate-control.ts
  - kubeclaw-main/skills/nova/pipeline/runners/review-gate-fix-cycle.ts
Runtime entrypoints affected: none; no batch file is a direct CLI/runtime/tool entrypoint. `pipeline-runner.js` is the public runner facade consumed by `pipeline/index.ts` and `cli.js`, but the CLI entrypoint itself is outside this batch.
Incoming callers: `cli.js` and `pipeline/index.ts` reach `pipeline-runner.js`; runner/root modules import scheduling/start/terminal/shared helpers; `pipeline-runner-loop.js` imports the state machine and scheduled validator helpers; `gate-runner.js` and `waitable-gate-engine.js` use remediable gate compatibility/fix-loop helpers; `review-gate-runner.js` uses review control and fix-cycle adapters.
Outgoing dependencies: Node fs/path; Nova logger/runtime/constants/paths/context/registry; status-store read models and lifecycle appenders; telemetry/observability/governance/correlation/rate-limit services; validator/generator/gate/pipeline-step/remediation contracts; blueprint control files; Discord identity/prompt/failure helpers; plugin observer runtime; pipeline runner deps/recovery/loop modules; shared gate Forge fix-cycle engine.
Dynamic imports: none found.
Exported symbols: scheduled validator completion path/mark/read helpers; scheduled validator/generator runners and validators; scheduler next-step/prepare helpers; shared gate/module projection and halt payload helpers; pipeline start/single-module/prepare helpers; `PIPELINE_RUNNER_ACTIONS`, `planPipelineStep`, `runPipelineStateMachine`; terminal normalization/halt/complete helpers; public `runPipeline`, `printStatus`, `dryRun`, and runner helper re-exports; remediable gate loop/runner helpers; review gate typed-control/remediation builders; `performReviewGateFixAttempt`.
Canonical authority used: scheduled validator idempotency markers; scheduler next-step selection and plugin-envelope construction; startup architecture validation and single-module handling; typed pipeline-step terminal boundary; public runner facade and observer/recovery sequencing; generic remediable gate loop; review gate typed-control projection and review-specific Forge fix prompt/correlation policy.
Fallback/legacy/shim hits found: run-id/log-dir aliases; unreadable completion state empty fallback; old completion entry shape; validator/generator config merge aliases; validator/generator failure conversion; schedule field/ref aliases; gate read-model skip; mandatory full-lint default; control-file prep noncritical; result/gate/status identity aliases; module-started and blocked-status heuristics; bounded terminal correlation backfill; startup log-dir fill; architecture validation resume skip and execution/block split; invalid pipeline-step fail-closed; summary/cost/completion idempotency fallbacks; public runner re-export facade; dry-run model fallback; remediable gate controller/fix-outcome compatibility; review result/rate-limit aliases; review remediation default cycles/reviewer/timeout; no-issue terminal escalation; first-cycle operator directive injection.
Fallback decision:
  - deleted: none.
  - renamed as canonical: generator config merge; validator/generator failure conversion; gate read-model skip; mandatory review full-lint policy/default tier; bounded terminal correlation backfill; config snapshot/cost report best-effort behavior; architecture validation resume skip and execution-vs-block terminal split; invalid pipeline-step fail-closed; completion idempotency; NEEDS_NOVA injection subset; invalid remediation-cycle exhaustion; no-issue review terminal escalation; first-cycle operator directive injection; review first-reviewer/max-cycle/timeout defaults.
  - kept as external adapter: run-id/log-dir aliases; old completion entry shape; validator config/schema aliases; schedule metadata/ref aliases; result/gate/rate-limit identity aliases; module-started and blocked-status old fields; summary writer compatibility object; public runner re-export facade; dry-run model fallback; gate identity compatibility fill; remediable controller/fix-outcome compatibility; review compatibility result and attempt aliases; review remediation correlation/policy aliases.
  - needs user decision: corrupt scheduled-validator completion JSON treating all validators as incomplete; gate/control file preparation failures remaining nonterminal; unknown next-step types defaulting to module work.
Behavior invariants: completed scheduled validators must not rerun on resume; validators/generators execute only through registered stage owners; architecture validation runs before module work unless resumed after modules started; terminal pipeline boundary accepts only typed pipeline-step results; completed pipeline resume is idempotent; run lock and stale-state reconciliation wrap each full run; remediable gates honor max fix cycles and typed remediation control results; review fixes do not spawn Forge without extractable issues.
Simplifications/optimizations: introduce typed PipelineContext for run/log ids, typed validator schedule schema, typed lifecycle read model for module-started detection, a single correlation identity object, a typed fix-outcome union, and an explicit unknown-step scheduler error instead of implicit module fallback if approved.
Tests/checks run: out of scope; only source/docs inspection and git diff/status verification.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, phase-0-batch-plan.md. Entrypoint inventory unchanged; existing TypeScript islands unchanged.
Deleted files: none.
Open questions: Should corrupt scheduled-validator completion state fail closed instead of rerunning validators; should gate/control file sync failures halt startup; and should unknown scheduler step types fail explicitly instead of defaulting to module execution?
```

## Batch 21 — DONE — 10 files, 1759 lines

| Lines | Action | File |
|---:|---|---|
| 114 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/review-gate-output.ts` |
| 612 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/review-gate-runner.ts` |
| 295 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/review-gate-task.ts` |
| 38 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/stage-envelope-primitives.ts` |
| 113 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/runners/waitable-gate-engine.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/security.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/acp-gateway-contract.ts` |
| 73 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/acp-observability.ts` |
| 126 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/adapter-registry.ts` |
| 382 | review existing TS | `kubeclaw-main/skills/nova/pipeline/services/agent-observability-evidence/comparator.ts` |


### Phase 0 slice review — Nova review gate execution, waitable gate helpers, adapter registry, and observability evidence comparator

```text
Slice: Nova review gate execution, waitable gate helpers, adapter registry, and observability evidence comparator
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/nova/pipeline/runners/review-gate-output.ts
  - kubeclaw-main/skills/nova/pipeline/runners/review-gate-runner.ts
  - kubeclaw-main/skills/nova/pipeline/runners/review-gate-task.ts
  - kubeclaw-main/skills/nova/pipeline/runners/stage-envelope-primitives.ts
  - kubeclaw-main/skills/nova/pipeline/runners/waitable-gate-engine.ts
  - kubeclaw-main/skills/nova/pipeline/security.ts
  - kubeclaw-main/skills/nova/pipeline/services/acp-gateway-contract.ts
  - kubeclaw-main/skills/nova/pipeline/services/acp-observability.ts
  - kubeclaw-main/skills/nova/pipeline/services/adapter-registry.ts
  - kubeclaw-main/skills/nova/pipeline/services/agent-observability-evidence/comparator.ts
Runtime entrypoints affected: none; no batch file is a direct CLI/runtime/tool entrypoint.
Incoming callers: built-in registry imports review gate stage/control adapter; review gate runner imports output/task helpers; review gate control imports output helpers; gate runner imports waitable gate engine and stage-envelope helpers; scheduler/module/shared snapshot helpers import stage-envelope helpers; pipeline recovery imports ACP observability; orchestration and polling completion import Redis adapter resolution; project-summary service imports generator resolution; evidence index re-exports the TS comparator; Nova callers import shared security and ACP Gateway contract facades.
Outgoing dependencies: Node fs/path/url; Nova core deps/logger/constants/runtime/config/paths/git context/registry/context; Discord/Git integrations; status-store, failures, polling, lint, telemetry, rate-limit, correlation, remediation, redaction, ACP monitor, gate active-session, Git soft-fail observability, timing, gate-control contracts, review prompts/control/fix-cycle; common security and ACP Gateway contract facades; Nova Redis tool/project-summary generator; agent-observability TypeScript contracts.
Dynamic imports: none found.
Exported symbols: review issue/output parsing helpers; review gate stage/evaluation/fix/remediation adapter helpers and compatibility projection re-export; review task helpers; stage ref/plugin/artifact helpers; wait-controller and scheduled waitable gate helpers; shared facade exports; `observeAcpMonitorSurfaces`; adapter registry resolution/listing and `UnknownAdapterError`; `compareAgentObservabilityParallelRunEvidence`.
Canonical authority used: review output parser, Echo review attempt executor, review gate policy/registry adapter, stage-envelope primitive construction, waitable gate execution bridge, common security and ACP Gateway contract authority, ACP stale-session observability sampler, fail-closed runtime adapter allowlist, and TS agent-observability evidence comparator.
Fallback/legacy/shim hits found: review output issue/status aliases; run-id/config/correlation/remediation metadata aliases; review defaults and existing-output resume shortcuts; best-effort cleanup/artifact/Git publication; lint-unavailable reviewer continuation; gate compatibility projection; Nova role-local shared facades; ACP observability identity/detail aliases; adapter key/path/config aliases; legacy polling evidence comparison and hook taxonomy/identity heuristics; comparator default thresholds and warn/degraded issue reporting.
Fallback decision:
  - deleted: none.
  - renamed as canonical: review config defaults, existing-output resume behavior, default fix-and-rereview policy, cleanup no-op behavior, invalid output fail-closed, missing stage ref omission, existing-artifact filtering, wait-controller fail-fast/stage-started tagging, ACP observability bounded polling defaults, unknown adapter fail-closed, comparator thresholds/defaults and evidence-report warn/degraded behavior.
  - kept as external adapter: review issue/status aliases, run-id/correlation/remediation metadata aliases, re-review remediation fallbacks, gate compatibility projection, security and ACP Gateway contract facades, ACP identity aliases, Redis/project-summary adapter aliases, legacy evidence normalization, hook event/outcome/identity aliases.
  - needs user decision: whether lint-generation failure should still run Echo without static analysis; whether review artifacts/merged-output copy failures remain nonterminal; whether review output Git commit/push soft-fail should stay degraded-only after Echo output exists.
Behavior invariants: review output parser stays pure; invalid review JSON/status fails closed; existing GO/PASS output skips review; NO-GO plus Nova prompt can start at Forge fix; review gate dispatch remains registry-backed; waitable gates call only registered stage handlers and valid wait controllers; adapter registry never loads arbitrary config paths; comparator remains side-effect-free evidence reporting.
Simplifications/optimizations: type the review output and remediation metadata shapes, converge run/correlation identity into one object, isolate review artifact persistence from control decisions, replace adapter path aliases with explicit package keys when callers are canonicalized, and keep the comparator as a pure TS island while surrounding JS services migrate.
Tests/checks run: out of scope; only source/docs inspection and git diff/status verification.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, existing-typescript-islands.md, phase-0-batch-plan.md. Entrypoint inventory unchanged.
Deleted files: none.
Open questions: Should review continue when lint evidence is unavailable; should best-effort review artifact/copy failures become terminal; and should soft-failed review output Git publication halt or only emit degraded observability?
```

## Batch 22 — DONE — 10 files, 1784 lines

| Lines | Action | File |
|---:|---|---|
| 2 | review existing TS | `kubeclaw-main/skills/nova/pipeline/services/agent-observability-evidence/index.ts` |
| 151 | review existing TS | `kubeclaw-main/skills/nova/pipeline/services/agent-observability-evidence/types.ts` |
| 311 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/agent-observability-forge-completion.ts` |
| 91 | review existing TS | `kubeclaw-main/skills/nova/pipeline/services/agent-observability-ingester/config.ts` |
| 437 | review existing TS | `kubeclaw-main/skills/nova/pipeline/services/agent-observability-ingester/consumer.ts` |
| 16 | review existing TS | `kubeclaw-main/skills/nova/pipeline/services/agent-observability-ingester/index.ts` |
| 345 | review existing TS | `kubeclaw-main/skills/nova/pipeline/services/agent-observability-ingester/mapper.ts` |
| 109 | review existing TS | `kubeclaw-main/skills/nova/pipeline/services/agent-observability-ingester/usage-aggregation.ts` |
| 67 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/agent-observability-runtime.ts` |
| 255 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/approval-signal-event-adapter.ts` |


### Phase 0 slice review — Nova agent-observability ingestion, Forge completion authority, and approval signal adapter

```text
Slice: Nova agent-observability ingestion, Forge completion authority, and approval signal adapter
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/nova/pipeline/services/agent-observability-evidence/index.ts
  - kubeclaw-main/skills/nova/pipeline/services/agent-observability-evidence/types.ts
  - kubeclaw-main/skills/nova/pipeline/services/agent-observability-forge-completion.ts
  - kubeclaw-main/skills/nova/pipeline/services/agent-observability-ingester/config.ts
  - kubeclaw-main/skills/nova/pipeline/services/agent-observability-ingester/consumer.ts
  - kubeclaw-main/skills/nova/pipeline/services/agent-observability-ingester/index.ts
  - kubeclaw-main/skills/nova/pipeline/services/agent-observability-ingester/mapper.ts
  - kubeclaw-main/skills/nova/pipeline/services/agent-observability-ingester/usage-aggregation.ts
  - kubeclaw-main/skills/nova/pipeline/services/agent-observability-runtime.ts
  - kubeclaw-main/skills/nova/pipeline/services/approval-signal-event-adapter.ts
Runtime entrypoints affected: none; no batch file is a direct CLI/runtime/tool entrypoint. `agent-observability-runtime.js` is a pipeline-runner-started sidecar wrapper, not a direct entrypoint.
Incoming callers: `pipeline-runner.js` starts/stops `agent-observability-runtime.js`; that wrapper imports the ingester index/factory. The ingester index re-exports/constructs `AgentObservabilityIngester`, which imports config, mapper, and usage aggregation. The evidence index re-exports evidence types and the comparator. `polling.js` imports Forge completion authority helpers for `pollForgeCompletion`. `approval-gate-runner.js` imports `createApprovalSignalEventAdapter` as the default approval wait filesystem adapter.
Outgoing dependencies: Node `path`, `fs`; Nova constants/runtime/logger/paths/Git worktree/telemetry stream/Redis transport/telemetry dispatch/observability/reporting/approval shared/event contract; common/Nova agent-observability TypeScript contracts; status EventBus consumers through approval runner.
Dynamic imports: none found.
Exported symbols: evidence type/index exports; Forge completion source/reason constants and diff/identity/reader/settle helpers; ingester config resolver/type; `AgentObservabilityIngester` plus options/stats/pressure types; ingester index factory/re-exports; telemetry mapper API; model usage aggregate/commit/detail helpers; `startAgentObservabilityIngester`; approval debounce constant and build/emit/create signal adapter helpers.
Canonical authority used: common agent-observability ingress contract and mapping; Nova ingester control-stream consumer/dead-letter policy; Nova telemetry dispatch and observability degraded/restored surfaces; Nova usage aggregation authority; agent-ended plus meaningful Git diff Forge completion authority; approval EventBus signal contract.
Fallback/legacy/shim hits found: Forge control/runtime path exclusion, injected diff evidence aliases, no-repo-root no-work behavior, Git error typed failure, ACP session-end fallback reasons, telemetry identity aliases, telemetry reader unavailable fallback, settle config aliases; ingester env/config/defaults, disabled no-op, BUSYGROUP idempotency, reclaim unsupported fallback, poison control-entry dead-letter/ACK, unpromoted event skip, telemetry validation/emit dead-lettering, trim/close fallbacks; mapper plugin-event fallback and identity/usage aliases; usage no-op and identity/cost aliases; runtime sidecar no-op and loop failure continuation; approval timeout mapping, nullable/run-id normalization, fatal-event conversion for state/watch failures, debounce/external abort/terminal stop.
Fallback decision:
  - deleted: none.
  - renamed as canonical: Forge control/runtime path exclusion, Git-error fail-closed result, ingester defaults where not aliasing env, disabled no-op, BUSYGROUP idempotency, poison-entry dead-letter/ACK, unpromoted event skip, telemetry validation/emit dead-lettering, no-config/no-usage usage no-op, approval timeout signal mapping, fatal-event conversion for adapter/state failures, debounce/external-abort/terminal-stop behavior.
  - kept as external adapter: injected diff evidence aliases, ACP session-end fallback, telemetry identity aliases, reader-unavailable fallback during rollout, settle config alias, Redis env aliases, reclaim/trim/close client compatibility, mapper plugin fallback and identity/usage aliases, usage identity/cost aliases, approval nullable/run-id normalization.
  - needs user decision: missing repo root returning no meaningful changes; sidecar loop failures warning once and continuing indefinitely.
Behavior invariants: Forge readiness must require agent-ended telemetry plus meaningful non-control Git diff when hook telemetry is available; ACP monitor completion remains fallback-only. Ingester must ACK/dead-letter poison control entries so Redis consumer groups do not stall. Approval runner consumes EventBus signals, not raw filesystem state.
Simplifications/optimizations: converge run/session/gateway/dispatch identity into one typed object, canonicalize diff evidence and usage field names, keep the ingester as a TS island while JS wrapper migrates, and consider a bounded sidecar failure policy.
Tests/checks run: out of scope; only source/docs inspection and git diff/status verification.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, existing-typescript-islands.md, phase-0-batch-plan.md. Entrypoint inventory unchanged.
Deleted files: none.
Open questions: Should missing repo root fail closed instead of returning no meaningful Forge changes; should repeated ingester sidecar loop failures eventually halt/degrade the pipeline more strongly?
```

## Batch 23 — DONE — 5 files, 2151 lines

| Lines | Action | File |
|---:|---|---|
| 497 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/arch-validator-checks.ts` |
| 525 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/arch-validator.ts` |
| 509 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/artifact-bundle.ts` |
| 313 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/blueprint.ts` |
| 307 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/buster-completion-controller.ts` |


### Phase 0 slice review — Nova architecture validation, artifact bundles, blueprint sync, and Buster completion controller

```text
Slice: Nova architecture validation, artifact bundles, blueprint sync, and Buster completion controller
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/nova/pipeline/services/arch-validator-checks.ts
  - kubeclaw-main/skills/nova/pipeline/services/arch-validator.ts
  - kubeclaw-main/skills/nova/pipeline/services/artifact-bundle.ts
  - kubeclaw-main/skills/nova/pipeline/services/blueprint.ts
  - kubeclaw-main/skills/nova/pipeline/services/buster-completion-controller.ts
Runtime entrypoints affected: none; blueprint functions are invoked by the Nova CLI and module/pipeline runners, but no batch file is a direct CLI/runtime/tool entrypoint.
Incoming callers: architecture validator checks are imported by arch-validator; `runArchitectureValidatorStage` is registered by `core/registry/builtins.ts` and architecture reports feed scheduler/start/governance code; artifact bundles are used by PipelineContext, status-store, summary, and failure presentation; blueprint list/release is called by CLI and module attempts while gate/control sync is called by pipeline runner deps/scheduling; Buster completion wait/controller is used by polling-dual and Buster gate completion.
Outgoing dependencies: Node fs/path/child_process; Nova path/runtime/logger/config/Gateway/redaction/status/Git/Discord/security/telemetry helpers; validation/status-store/completion-adjudicator/Redis message/pipeline event contracts.
Dynamic imports: none found.
Exported symbols: architecture finding constants/checks/factory/runner; architecture validator prompt/artifact/control-result/report/run helpers; artifact authority roles/surfaces, policy/evidence projectors, bundle builders, latest pointer builder, plugin artifacts API; blueprint list/release/gate-release/control-sync helpers; Buster completion event constants, event entry builder, resolver, wait loop, and gate local-evidence resolver.
Canonical authority used: Nova deterministic architecture validation, registered architecture validator control result and artifacts, pipeline artifact authority policy and plugin artifact persistence, architecture-branch blueprint/control-file synchronization, and Buster completion event-wait resolution with Redis completion validation delegated to shared contracts/adjudicator.
Fallback/legacy/shim hits found: progress path fallback, validator schedule aliases, default module stages, optional test-spec behavior, deprecated config.models warning, skipped/disabled agent judgment, Gateway response shape parsing, agent parse/call warning behavior, nonterminal artifact writes, run-id aliases, control-result coercion, run-log dir fallback, artifact identity aliases, diagnostic fallback artifact authority, unknown artifact surface role, sanitized suggested paths, artifact lookup aliases, architecture fetch/local-cache behavior, existing-status/no-change blueprint idempotency, substep FORGE requirements, pipeline-file-only conflict recovery, gate/control sync skips and noncritical commit failures, completion identity/source aliases, default expected statuses, invalid Redis completion fail-closed projection, local-evidence pending, abort result shaping, and output-file invalid-contract handling.
Fallback decision:
  - deleted: none.
  - renamed as canonical: default module stages; optional test-spec validation; deterministic-only/disabled agent judgment; agent parse/call failure as WARN findings; diagnostic-fallback artifact authority; unknown artifact surfaces as operator mirrors; sanitized plugin suggested paths; existing-status/no-change blueprint idempotency; substep FORGE requirements; gate dir skip behavior; sync summary write fallback; target-specific default expected statuses; invalid Redis completion fail-closed projection; abort result shape; output-file invalid-contract fail-closed behavior.
  - kept as external adapter: progress path fallback; validator schedule aliases; deprecated config.models warning; loose Gateway response parsing; run-id/run-log config aliases; control-result coercion; artifact identity and lookup aliases; control-file missing/read fallback; Buster completion identity/source aliases; local-evidence pending when no resolver is supplied.
  - needs user decision: architecture validator artifact writes remaining nonterminal; architecture branch fetch failure using local cache/skipping sync; pipeline-file-only conflict auto-recovery; gate/control-file commit/push failures remaining noncritical.
Behavior invariants: no batch file becomes a direct entrypoint; architecture validation must fail closed on internal deterministic errors and block only on blocking findings; Gateway agent judgment remains advisory; artifact files never become lifecycle/session/scheduler/completion authority; plugin artifact persistence stays run-lane scoped; blueprint commits must stage only selected paths; Buster completion waits require an AbortSignal and adjudicate only validated or fail-closed Redis/local evidence.
Simplifications/optimizations: type progress validator schedule entries and architecture findings/control results, move old identity aliases to boundary adapters, type artifact surface/authority unions, centralize architecture-branch fetch policy, and make Buster completion identity a single typed object.
Tests/checks run: out of scope; only source/docs inspection, `wc -l`, `rg` caller discovery, and git diff/status verification.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, phase-0-batch-plan.md. Entrypoint inventory and existing TypeScript islands unchanged.
Deleted files: none.
Open questions: Should architecture validator artifact write failures halt or remain observability-only; should architecture branch fetch failures fail closed; should pipeline-file-only conflict auto-recovery remain allowed; should gate/control-file sync commit failures halt startup?
```

## Batch 24 — DONE — 9 files, 1959 lines

| Lines | Action | File |
|---:|---|---|
| 417 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/case-study.ts` |
| 47 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/compatibility-authority.ts` |
| 387 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/completion-adjudicator.ts` |
| 306 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/completion-event-adapters.ts` |
| 94 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/contract-diagnostics.ts` |
| 11 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/contracts/control-result-mapping.ts` |
| 560 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/contracts/gate-control-result.ts` |
| 132 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/contracts/generator-result.ts` |
| 5 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/contracts/index.ts` |


### Phase 0 slice review — Nova case-study generation, completion authority, event adapters, and typed gate/generator contracts

```text
Slice: Nova case-study generation, completion authority, event adapters, and typed gate/generator contracts
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/nova/pipeline/services/case-study.ts
  - kubeclaw-main/skills/nova/pipeline/services/compatibility-authority.ts
  - kubeclaw-main/skills/nova/pipeline/services/completion-adjudicator.ts
  - kubeclaw-main/skills/nova/pipeline/services/completion-event-adapters.ts
  - kubeclaw-main/skills/nova/pipeline/services/contract-diagnostics.ts
  - kubeclaw-main/skills/nova/pipeline/services/contracts/control-result-mapping.ts
  - kubeclaw-main/skills/nova/pipeline/services/contracts/gate-control-result.ts
  - kubeclaw-main/skills/nova/pipeline/services/contracts/generator-result.ts
  - kubeclaw-main/skills/nova/pipeline/services/contracts/index.ts
Runtime entrypoints affected: none; no batch file is a direct CLI/runtime/tool entrypoint. Case study is registry-dispatched as a generator, and completion adapters are started by polling controllers.
Incoming callers: built-in registry and summary service import case-study helpers; typed pipeline-step/validator/worker/gate contracts import compatibility-authority; polling/truth-drift/Buster completion controller import completion adjudication; polling-dual imports event adapters; contract modules import contract diagnostics and mapping helpers; gate runners/controls import gate-control contracts; summary/project-summary/case-study/scheduler import generator-result helpers; no direct source caller found for the contracts namespace barrel.
Outgoing dependencies: Node fs/path; Nova core deps/logger/paths/runtime/constants; agent lifecycle/runtime/termination facades; polling, Discord, telemetry, redaction, rate-limit, correlation, summary cleanup, serialization, Redis/task/pipeline-event contracts, remediation handoff, and control/generator contract helpers.
Dynamic imports: none found.
Exported symbols: case-study path/dispatch/instruction/generator helpers; compatibility authority constants/finder/stripper; completion identity/adjudication/drift/apply helpers; Redis/local completion event adapter factories; contract-invalid diagnostic/error helpers; control-result mapping helpers; typed gate action/build/validate/project/normalize helpers; typed generator artifact/result/build/validate/normalize helpers; contract namespace exports.
Canonical authority used: case-study generator output, compatibility-authority ban list, completion truth adjudication, completion EventBus adapter conversion, invalid contract diagnostics, typed gate control-result contract, and typed generator-result contract.
Fallback/legacy/shim hits found: case-study progress/config/model/path/log-dir/rate-limit/Discord fallbacks; compatibility authority aliases; completion identity/status/source aliases and Redis-vs-local conflict policy; Redis/local adapter abort/watch/debounce fallbacks; contract diagnostic hook-family/redaction fallbacks; unknown control mapping; gate compatibility mappings/status aliases/projections; generator artifact filtering; contract barrel.
Fallback decision:
  - deleted: none.
  - renamed as canonical: case-study path defaults, rate-limit result shaping, noncritical Discord/transcript/output sanitization, catch-to-generator-failure; compatibility strip circular guard; Redis authority active-dispatch requirement and conflict fail-closed behavior; Redis adapter abort cleanup; local watcher/debounce behavior; redacted contract diagnostics; unknown mapping fail-closed; gate compatibility authority ban; generator artifact filtering and strict typed generator boundary.
  - kept as external adapter: case-study config/model/log-dir fallbacks; compatibility authority key aliases until projections are gone; completion identity/status/source aliases; Redis event identity aliases; hook-family inference from partial metadata; gate compatibility mappings/status aliases/projection metadata aliases.
  - needs user decision: whether `services/contracts/index.js` broad namespace barrel should remain a supported public import surface.
Behavior invariants: no batch file becomes an entrypoint; case-study failure remains a typed generator failure, not pipeline lifecycle authority; Redis terminal completion applies only with confirmed active dispatch identity; contradictory Redis/local completions fail closed; adapters emit EventBus evidence/fatal events and do not decide terminal state; typed gate results must not include legacy compatibility authority; generator outputs must be v1 typed results.
Simplifications/optimizations: type one canonical completion identity object, move aliases to edge adapters, make case-study config source explicit, narrow gate compatibility projections after consumers migrate to typed contracts, and decide whether to keep or remove the contract barrel.
Tests/checks run: out of scope; only source/docs inspection, `wc -l`, `rg` caller discovery, and git diff/status verification.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, phase-0-batch-plan.md. Entrypoint inventory and existing TypeScript islands unchanged.
Deleted files: none.
Open questions: Should the broad `services/contracts/index.js` namespace barrel remain public API, or should TS migration require direct contract-module imports?
```

## Batch 25 — DONE — 10 files, 2365 lines

| Lines | Action | File |
|---:|---|---|
| 577 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/contracts/pipeline-step-result.ts` |
| 302 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/contracts/validator-control-result.ts` |
| 257 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/contracts/worker-control-result.ts` |
| 372 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/correlation.ts` |
| 91 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/dependencies.ts` |
| 8 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/discord-fields.ts` |
| 140 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/durable-operator-alert.ts` |
| 261 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/failure-semantics.ts` |
| 330 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/failures/classification.ts` |
| 27 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/failures/incidents.ts` |


### Phase 0 slice review — Nova typed step/validator/worker contracts, correlation, dependency checks, durable alerts, and failure taxonomy

```text
Slice: Nova typed step/validator/worker contracts, correlation, dependency checks, durable alerts, and failure taxonomy
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/nova/pipeline/services/contracts/pipeline-step-result.ts
  - kubeclaw-main/skills/nova/pipeline/services/contracts/validator-control-result.ts
  - kubeclaw-main/skills/nova/pipeline/services/contracts/worker-control-result.ts
  - kubeclaw-main/skills/nova/pipeline/services/correlation.ts
  - kubeclaw-main/skills/nova/pipeline/services/dependencies.ts
  - kubeclaw-main/skills/nova/pipeline/services/discord-fields.ts
  - kubeclaw-main/skills/nova/pipeline/services/durable-operator-alert.ts
  - kubeclaw-main/skills/nova/pipeline/services/failure-semantics.ts
  - kubeclaw-main/skills/nova/pipeline/services/failures/classification.ts
  - kubeclaw-main/skills/nova/pipeline/services/failures/incidents.ts
Runtime entrypoints affected: none; no batch file is a direct CLI/runtime/tool entrypoint.
Incoming callers: pipeline/gate/module runners import pipeline-step, validator, worker, correlation, dependency, and Discord field helpers; agents/orchestration and module-worker-control-results import worker contracts; module validators import validator contracts; observability/telemetry import durable alerts; recovery/retry/presentation/status-store import failure semantics/classification; failures barrel re-exports classification/semantics; contracts barrel re-exports typed contract namespaces.
Outgoing dependencies: Node fs/path; Nova core constants/logger/runtime; ACP monitor facade; status-store scheduler projections; redaction, noncritical reporting, compatibility-authority, serialization, contract diagnostics, control-result mapping, and rate-limit-contract facade.
Dynamic imports: none found.
Exported symbols: typed pipeline step constants/builders/validators/projections; typed validator and worker control constants/builders/mappers/validators/projections; correlation resolvers and invocation snapshot builders; dependency checker; Discord identity field facade exports; durable alert target/append helpers; failure taxonomy constants/classifiers/evidence/description helpers; fail-pattern metadata/text/git/pre-test classifiers and incident reporter.
Canonical authority used: typed pipeline step result authority; validator and worker control-result boundaries; canonical correlation identity/provenance; module dependency scheduling check; rate-limit-contract Discord field authority via facade; durable local operator alert evidence; normalized failure semantics and fail-pattern classification.
Fallback/legacy/shim hits found: step outcome/action/status/rate-limit compatibility aliases and projections; validator old result/report/failure mapping; worker old Forge reason/Buster failure-class mapping and backend projections; correlation status/result/read-model identity aliases; dependency legacy gate PASS rejection; Discord field facade; durable alert config/presentation fallbacks and best-effort writes; regex/text failure-classification fallbacks; pre-test verdict parse/suite-detail fallbacks; failure incident key fallbacks.
Fallback decision:
  - deleted: none.
  - renamed as canonical: compatibility authority rejection; control outcome inference; validator summaries and strict typed boundary; worker strict typed boundary; legacy gate PASS rejection; dependency result-shaped unmet behavior; durable alert write failures as nonblocking; git push default failure; non-empty agent fail reason; pre-test parse fallback and config/infra/code precedence.
  - kept as external adapter: step outcome/status/rate-limit aliases and compatibility projection; validator run/module aliases and old validator mapping; worker reason/failure-class mapping and backend projections; correlation identity/invocation aliases; Discord field facade; durable alert log-dir and presentation aliases; regex/text failure taxonomy until structured facts are canonical; failure incident config aliases.
  - needs user decision: none.
Behavior invariants: typed step/validator/worker results must reject compatibility authority fields; compatibility projections are edge outputs only; module dependencies require canonical gate completion, not legacy PASS/APPROVED status alone; durable alert writes are local-first but nonfatal; failure classification must keep operator messages non-empty and must not crash on malformed pre-test verdict JSON.
Simplifications/optimizations: define one typed correlation/invocation identity object, narrow worker/validator compatibility mappings to edge adapters after callers migrate, keep pipeline-step projections out of typed authority, and replace regex failure inference with structured failure facts as producers are typed.
Tests/checks run: out of scope; only source/docs inspection, `wc -l`, `rg` caller/export discovery, and git diff/status verification.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, phase-0-batch-plan.md. Entrypoint inventory and existing TypeScript islands unchanged.
Deleted files: none.
Open questions: none from this slice; main risk is preserving old compatibility projections while making typed contracts the only authority.
```

## Batch 26 — DONE — 10 files, 1640 lines

| Lines | Action | File |
|---:|---|---|
| 259 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/failures/presentation.ts` |
| 268 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/failures/retry-policy.ts` |
| 39 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/failures.ts` |
| 63 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/forge-completion.ts` |
| 164 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/gate-active-session.ts` |
| 137 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/gate-fix-scaffold.ts` |
| 28 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/git-soft-fail-observability.ts` |
| 266 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/governance-context.ts` |
| 237 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/lint.ts` |
| 179 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/module-validators.ts` |


### Phase 0 slice review — Nova failure presentation/retry policy, Forge/gate session helpers, governance, lint, and validator stages

```text
Slice: Nova failure presentation/retry policy, Forge/gate session helpers, governance, lint, and validator stages
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/nova/pipeline/services/failures/presentation.ts
  - kubeclaw-main/skills/nova/pipeline/services/failures/retry-policy.ts
  - kubeclaw-main/skills/nova/pipeline/services/failures.ts
  - kubeclaw-main/skills/nova/pipeline/services/forge-completion.ts
  - kubeclaw-main/skills/nova/pipeline/services/gate-active-session.ts
  - kubeclaw-main/skills/nova/pipeline/services/gate-fix-scaffold.ts
  - kubeclaw-main/skills/nova/pipeline/services/git-soft-fail-observability.ts
  - kubeclaw-main/skills/nova/pipeline/services/governance-context.ts
  - kubeclaw-main/skills/nova/pipeline/services/lint.ts
  - kubeclaw-main/skills/nova/pipeline/services/module-validators.ts
Runtime entrypoints affected: none; no batch file is a direct CLI/runtime/tool entrypoint.
Incoming callers: failure barrel is imported by Git integration, module attempts, module-worker result mapping, review gates, and pipeline deps; retry/presentation helpers are consumed through that barrel and by retry-policy; gate active-session helpers are used by Buster/review gate runners, gate fix scaffold, and recovery; gate fix scaffold is called by the shared gate Forge fix-cycle runner; Git soft-fail telemetry is called by module/gate runners; governance context is called by pipeline start, approval gate runner, and summary; lint is called by review gates and module validators; module validators are registered by core builtins.
Outgoing dependencies: Node fs/path/child_process; Nova logger/runtime/paths/security; Discord/Gateway integrations; artifact-bundle, correlation, Discord fields, failure semantics/classification/incidents, rate-limit contract, lifecycle-state, status-store, telemetry, session-authority, status-store lifecycle read models, redaction, arch-validator, validation, lint, and typed validator-control contract.
Dynamic imports: none found.
Exported symbols: failure presentation helpers, retry-policy helpers, failure barrel re-exports, Forge completion artifact constants/readers, gate active-session policy/evidence/persist/clear helpers, gate Forge-fix scaffold start/finish helpers, Git soft-fail degraded emitter, governance context record/build helpers, lint report/pre-check helpers, and built-in validator stage functions.
Canonical authority used: module retry/escalation policy, failure operator presentation, legacy Forge completion artifact validation, lifecycle-read-model gate active-session authority, common gate Forge-fix scaffolding, Git soft-fail observability projection, in-memory governance summary context, lint-report subprocess boundary, and typed built-in validator stage adapters.
Fallback/legacy/shim hits found: failure run-id/channel/result fallbacks; injection log best-effort and aborted-response handling; auto-retry threshold precedence; status dispatch/fail-history compatibility; broad failures barrel; legacy forge-completion artifact reader; gate active-session identity aliases/diagnostic evidence; gate fix correlation/tracked-agent aliases and best-effort artifacts; Git error/detail alias; governance camel/snake identity aliases; lint tooling skipped/malformed report behavior; validator input aliases and full-lint archive fallback.
Fallback decision:
  - deleted: none.
  - renamed as canonical: injection log write failures nonblocking; auto-retry threshold precedence; invalid/missing Forge artifact shaping; lifecycle read model overriding active-session file evidence; active-session parse diagnostics; gate fix artifact best-effort and failed-health cleanup; governance artifact normalization and token best-effort; nonzero lint with output as findings; lint temp/archive cleanup; validator stage producer fallback, missing-identity block, full-lint failure block, and archive failure behavior.
  - kept as external adapter: run-id/channel/result identity fallbacks; status dispatch/fail-history compatibility; failures barrel; legacy Forge completion reader; active-session/tracked-agent identity aliases; gate-fix correlation aliases; Git error/detail alias; governance identity aliases; validator input aliases.
  - needs user decision: whether Gateway aborted Nova-injection responses should remain successful, whether the human resume-command string remains part of escalation results, and whether missing/unparseable pre-check lint reports should continue to pass/skip instead of blocking.
Behavior invariants: Phase 0 only; no code migration; no batch file becomes an entrypoint; lifecycle read models remain active-session authority; retry policy mutates status before returning retry/escalation/blocked envelopes; governance context stays in-memory and non-authoritative for durable artifacts; pre-check remains distinct from stricter full-lint validator behavior.
Simplifications/optimizations: type one escalation/correlation identity object, narrow `services/failures.js` barrel usage after callers migrate, separate legacy Forge artifact reader from hook completion authority, type gate active-session evidence roles, and make validator PluginContext input canonical so alias readers can shrink.
Tests/checks run: out of scope; only source/docs inspection, `wc -l`, `rg` caller/dynamic-import discovery, and git diff/status verification.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, phase-0-batch-plan.md. Entrypoint inventory and existing TypeScript islands unchanged.
Deleted files: none.
Open questions: Should pre-check lint tooling failures remain nonblocking skips, and should aborted Gateway responses during Nova injection be considered delivered or failed?
```

## Batch 27 — DONE — 10 files, 2026 lines

| Lines | Action | File |
|---:|---|---|
| 270 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/notification-contract.ts` |
| 141 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/notification-dispatch.ts` |
| 562 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/observability.ts` |
| 80 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/openclaw-plugin-runtime.ts` |
| 2 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/pipeline-event-contract.ts` |
| 230 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/polling-dual.ts` |
| 84 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/polling-identity.ts` |
| 83 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/polling-observability.ts` |
| 99 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/polling-redis-completion.ts` |
| 475 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/polling-session-end.ts` |


### Phase 0 slice review — Nova notification, observability, plugin runtime, and polling support

```text
Slice: Nova notification, observability, plugin runtime, and polling support
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/nova/pipeline/services/notification-contract.ts
  - kubeclaw-main/skills/nova/pipeline/services/notification-dispatch.ts
  - kubeclaw-main/skills/nova/pipeline/services/observability.ts
  - kubeclaw-main/skills/nova/pipeline/services/openclaw-plugin-runtime.ts
  - kubeclaw-main/skills/nova/pipeline/services/pipeline-event-contract.ts
  - kubeclaw-main/skills/nova/pipeline/services/polling-dual.ts
  - kubeclaw-main/skills/nova/pipeline/services/polling-identity.ts
  - kubeclaw-main/skills/nova/pipeline/services/polling-observability.ts
  - kubeclaw-main/skills/nova/pipeline/services/polling-redis-completion.ts
  - kubeclaw-main/skills/nova/pipeline/services/polling-session-end.ts
Runtime entrypoints affected: none; no batch file is a direct CLI/runtime/tool entrypoint.
Incoming callers: pipeline index exports notification APIs; registry builtins import notification definitions; pipeline runner imports OpenClaw plugin runtime; polling facade imports/re-exports polling helpers; Buster completion, approval, completion-adapter, ACP monitor, and gate runners use the Nova pipeline-event facade; telemetry/summary/Discord/plugin-context/agent-observability callers use observability helpers.
Outgoing dependencies: Node fs/path/child_process; Nova logger/runtime/constants/paths/deps/context/registry; Discord/Gateway/Git/redaction/common agent facades; status-store, rate-limit, telemetry, telemetry-stream, durable-alert, completion adapters/controller, adapter-registry, serialization, telemetry payload schema, noncritical reporting, pipeline event contract facade, and timing budget helpers.
Dynamic imports: none found.
Exported symbols: notification hook ids/builders/validators/sink observers/definitions; notification dispatcher; observability degraded/restored, structured-event, usage, budget, and cost helpers; OpenClaw observer plugin controller; common pipeline event contract re-export; module Buster completion waiter; polling identity/observability helpers; Redis completion archiver; ACP session-end poller.
Canonical authority used: notification hook envelope and dispatch; observability transition/cost artifact authority; external OpenClaw observer plugin sidecar control; common EventBus contract facade; module Buster completion wait bridge; pure polling identity/progress helpers; stale Redis completion archive; ACP session-end wait/change-detection policy.
Fallback/legacy/shim hits found: notification id/ref aliases and optional Discord presentation; missing-listener and per-listener notification degradation; nonthrowing/no-log-dir observability and cost behavior; budget-check failure returns not-exceeded; disabled/default plugin-control behavior; pipeline-event facade; completion fail-closed/projection and weak identity drift tolerance; polling identity aliases/defaults; fire-and-forget transcript/progress defaults; Redis archive option aliases and failure result; no-session-key, legacy HEAD movement completion, Git polling fallbacks, best-effort transcript/nudge behavior, and session-closed-no-changes success envelope.
Fallback decision:
  - deleted: none.
  - renamed as canonical: notification missing/failing listener degradation; observability nonthrowing artifact/cost writes, duplicate suppression, disabled/default plugin control, completion adapter fail-closed behavior, polling log defaults, transcript fire-and-forget, Redis archive failure evidence, no-session-key fail-closed, transcript mirror and timeout nudge best-effort behavior.
  - kept as external adapter: notification id/ref/presentation aliases; pipeline-event facade; weak completion identity drift tolerance and old poll-result/rate-limit projections; tracked/status polling identity aliases; progress agent-type default; Redis archive option aliases; legacy HEAD movement completion signal.
  - needs user decision: budget-check errors returning not-exceeded, Git worktree signature errors collapsing to empty signature, and session closed with no file changes returning `completed:true`.
Behavior invariants: notification listeners are side effects and isolated from each other; observability must remain local-first/nonblocking; plugin sidecar cleanup must not mask pipeline terminal results; EventBus contract authority stays common; Buster completion waits fail closed on adapter/conflict/unresolved evidence; session poller does not stage or commit files and callers own final Git policy.
Simplifications/optimizations: type notification ids/refs and polling identity as single canonical objects, move aliases to edge adapters, separate legacy HEAD-movement completion from canonical session/hook completion, and make cost/budget failure policy explicit before TS strictness.
Tests/checks run: out of scope; only source/docs inspection, `wc -l`, `rg` caller/export/dynamic-import discovery, and git diff/status verification.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, phase-0-batch-plan.md. Entrypoint inventory and existing TypeScript islands unchanged.
Deleted files: none.
Open questions: Should budget-read failures ever block as exceeded, should Git change-signature errors be fail-closed instead of empty, and should an ACP session that closes with no file changes remain `completed:true`?
```

## Batch 28 — DONE — 6 files, 2342 lines

| Lines | Action | File |
|---:|---|---|
| 684 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/polling.ts` |
| 130 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/prompt-ingress.ts` |
| 204 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/rate-limit-builders/exhaustion-options.ts` |
| 640 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/rate-limit-builders.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/rate-limit-contract.ts` |
| 681 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/rate-limit-exit.ts` |

### Phase 0 slice review — Nova polling, prompt ingress, and rate-limit result/finalizer helpers

```text
Slice: Nova polling, prompt ingress, and rate-limit result/finalizer helpers
Files read/migrated: Read fully end to end; no migration performed.
  - kubeclaw-main/skills/nova/pipeline/services/polling.ts
  - kubeclaw-main/skills/nova/pipeline/services/prompt-ingress.ts
  - kubeclaw-main/skills/nova/pipeline/services/rate-limit-builders/exhaustion-options.ts
  - kubeclaw-main/skills/nova/pipeline/services/rate-limit-builders.ts
  - kubeclaw-main/skills/nova/pipeline/services/rate-limit-contract.ts
  - kubeclaw-main/skills/nova/pipeline/services/rate-limit-exit.ts
Runtime entrypoints affected: none; no batch file is a direct CLI/runtime/tool entrypoint. `prompt-ingress.js` is consumed by the Nova CLI but is not itself an entrypoint.
Incoming callers: module workers, module attempt runner, review/Buster gate runners, case-study/summary services, Nova CLI, Forge/review prompt builders, `services/rate-limit.js`, and rate-limit builder/finalizer helper cross-imports.
Outgoing dependencies: Node fs/path; Nova logger/runtime/status-store/telemetry/lifecycle-state/Git worktree/redaction/correlation/Discord/failure presentation/durable alert helpers; ACP monitor/lifecycle; polling identity/observability/dual/session-end/Redis-completion/agent-observability Forge completion; timing budget helpers; common rate-limit contract facade.
Dynamic imports: none found.
Exported symbols: polling result and wrapper functions plus timing/session/completion re-exports; prompt ingress constants/path/prompt/directive helpers; rate-limit status/telemetry/Discord/recovery/exhaustion builders; common rate-limit contract re-export; generic, Redis-owned, module/gate/summary rate-limit exit/finalizer helpers.
Authorities used: Nova polling facade and poll-result envelope; hook-first Forge completion with ACP fallback; event-driven Buster completion delegation; bounded/redacted operator prompt ingress; normalized module/gate/summary RATE_LIMITED status builders; shared common rate-limit contract facade; exhausted exit-result construction and durable local alert finalization.
Fallback/legacy/shim hits found: no-repo Git polling skip; Git error result envelopes; parse-corruption tolerance; status/tracked-agent identity aliases; ACP terminal HEAD-movement completion; ACP no-output/no-change envelopes; Forge `agent.ended` reader fallback to ACP monitor; diff-evidence injection seam; legacy status-backed rate-limit wrapper; inline prompt precedence/redaction/empty directive behavior; optional telemetry/Discord hooks; persisted/caller status merges and run-id aliases; commit/phase/identity aliases; tracked in-memory correlation; exhausted result and Redis entry aliases; Nova rate-limit contract facade; durable alert and hook-failure nonthrowing finalization.
Fallback decision:
  - deleted: none.
  - renamed as canonical: Git error envelopes, parse-corruption threshold, lifecycle read-model precedence over status-file diagnostics, ACP no-output/no-change envelopes, inline prompt precedence and redaction behavior, optional hook no-ops, Discord failures as nonblocking, function-valued fallback options, durable alert-before-delivery, hook delivery-failure alerts.
  - kept as external adapter: status/tracked-agent identity aliases, ACP terminal HEAD-movement completion until hook evidence is canonical, Forge ACP fallback while hook reader can be unavailable, diff-evidence injection seam, legacy/non-Forge polling wrapper, persisted/caller status/run-id aliases, commit/phase/rate-limit status aliases, tracked correlation fallback, exhausted result aliases, Redis rate-limit entry aliases, Nova rate-limit-contract facade.
  - needs user decision: whether polling without `repo_root` should continue to skip Git sync or become invalid configuration.
Behavior invariants: Phase 0 only; no code migration; no batch file becomes an entrypoint; polling budgets still own timeout; Buster completion remains delegated to event-driven completion/adjudication; Forge hook telemetry remains preferred over ACP fallback; durable rate-limit exhaustion evidence is written before Discord/telemetry hooks; prompt ingress keeps repo containment, size bounds, redaction, and untrusted fencing.
Simplifications/optimizations: type one polling/rate-limit correlation identity object, move aliases to edge adapters, decide no-repo Git policy, keep `rate-limit-contract.js` as a facade only, and avoid expanding the documented circular polling/rate-limit builder import during TS migration.
Tests/checks run: out of scope; only source/docs inspection, `wc -l`, `rg` caller/export/dynamic-import discovery, and git diff/status verification.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, phase-0-batch-plan.md. Entrypoint inventory and existing TypeScript islands unchanged.
Deleted files: none.
Open questions: Should polling without a repository root remain a successful skipped Git sync, or should typed config validation reject it for these paths?
```

## Batch 29 — DONE — 10 files, 2350 lines

| Lines | Action | File |
|---:|---|---|
| 525 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/rate-limit.ts` |
| 328 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/redis-completion.ts` |
| 158 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/redis-log.ts` |
| 2 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/redis-message-contract.ts` |
| 155 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/remediation-handoff.ts` |
| 72 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/serialization.ts` |
| 170 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/session-authority.ts` |
| 28 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/status-store-compat/common.ts` |
| 562 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/status-store-compat/gate-projection.ts` |
| 350 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/status-store-compat/module-projection.ts` |

### Phase 0 slice review — Nova rate-limit, Redis completion, remediation, serialization, session authority, and status-store compatibility projections

```text
Slice: Nova rate-limit, Redis completion, remediation, serialization, session authority, and status-store compatibility projections
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/nova/pipeline/services/rate-limit.ts
  - kubeclaw-main/skills/nova/pipeline/services/redis-completion.ts
  - kubeclaw-main/skills/nova/pipeline/services/redis-log.ts
  - kubeclaw-main/skills/nova/pipeline/services/redis-message-contract.ts
  - kubeclaw-main/skills/nova/pipeline/services/remediation-handoff.ts
  - kubeclaw-main/skills/nova/pipeline/services/serialization.ts
  - kubeclaw-main/skills/nova/pipeline/services/session-authority.ts
  - kubeclaw-main/skills/nova/pipeline/services/status-store-compat/common.ts
  - kubeclaw-main/skills/nova/pipeline/services/status-store-compat/gate-projection.ts
  - kubeclaw-main/skills/nova/pipeline/services/status-store-compat/module-projection.ts
Runtime entrypoints affected: none; no batch file is a direct CLI/runtime/tool entrypoint.
Incoming callers: polling, polling-dual, polling-session-end, case-study, summary, module Forge/Buster runners, Buster/review gate runners/completion/terminal/fix-cycle, pipeline-runner start/state-machine/recovery, module workers, gate active-session, status-store/status-store-compat facade, Redis CLI/adapter paths, Buster completion controller, completion event adapters, core context/registry, notification/telemetry/contract diagnostics, and gate-control contracts import these helpers or their facades.
Outgoing dependencies: Nova logger/runtime/paths/status-store/status-store-lifecycle/correlation/lifecycle-state/telemetry/failures/Discord/rate-limit contract/builders/exit/timing; common Redis message contract facade; Node fs/path; noncritical reporting; status constants; and pure serialization/session-authority helpers.
Dynamic imports: none found.
Exported symbols: rate-limit recovery/pause/exhaustion/durable-cooldown helpers and rate-limit builder/exit re-exports; Redis completion schema re-exports plus identity/select/scan/archive helpers; Redis log append/exchange/operation helpers; Redis message contract facade exports; gate remediation request/read/validate/controller/bump helpers; serialization clone/freeze/snapshot helpers; active-session identity/authority constants and helpers; status-store compatibility source constants; gate/module legacy evidence projection, reader, authority, drift, and scheduler helpers.
Canonical authority used: rate-limit cooldown lifecycle events and exhausted exit finalizers; Redis completion schema and canonical `source=buster-pipeline`; Redis JSONL observability artifacts; common Redis message contract; typed gate remediation request_fix diagnostics; JSON-safe serialization boundary; lifecycle read-model active-session authority; gate output_file authority with gate-status diagnostic evidence; lifecycle module read-model authority with legacy status bootstrap disabled unless explicit migration mode.
Fallback/legacy/shim hits found: rate-limit identity/config/default/hook/status-sync fallbacks; Redis target/identity/status/outcome aliases, invalid/conflict/duplicate/ignored-source projections, active-identity archive exclusion; Redis log best-effort/truncated/no-op behavior; role-local Redis contract facade; remediation defaults and controller function fallback; serialization non-JSON/cycle/function handling; active-session identity aliases and diagnostic-authority denial; projection source legacy labels; gate-status diagnostic and approval exception behavior; invalid gate output shaping and drift records; module legacy projection policy, compatibility fallback snapshot, canonical-control preservation, parse/drift handling, and legacy cooldown projection.
Fallback decision:
  - deleted: none.
  - renamed as canonical: rate-limit defaults, nonblocking notification behavior, durable cooldown replay, invalid/ignored/duplicate/conflict Redis completion handling, active-identity archive exclusion, Redis log bounded/best-effort behavior, remediation field defaults, serialization non-JSON handling, session authority denial of diagnostic evidence, gate-status diagnostic-only policy, invalid output/drift shaping, module projection disabled-by-default/canonical-control preservation, and parse/drift records.
  - kept as external adapter: mixed rate-limit identity/result/status fields, legacy module status pause/resume sync, resume coarse status mapping, exhausted result option variants, Redis target/expected identity/outcome aliases, Redis log close no-op, Redis contract facade, remediation direct-function controller wiring, session identity aliases, legacy projection source labels, approval gate-status synchronization, module status compatibility fallback, and legacy cooldown bootstrap.
  - needs user decision: none.
Behavior invariants: no code migration; no batch file becomes an entrypoint; cooldown lifecycle events remain durable pause/resume evidence; Discord/telemetry/logging failures stay nonblocking; Redis completion matching requires strong active dispatch identity unless explicitly disabled; only `buster-pipeline` completions are authoritative; conflicting completions fail closed; active completion identity is not archived as stale; lifecycle read models remain active-session/module authority; gate `output_file` remains gate completion authority except approval wait compatibility sync.
Simplifications/optimizations: define one typed rate-limit identity/result object, one Redis completion target/envelope type, one active-session identity type, and explicit adapter boundaries for legacy status/gate-status projections; after callers migrate, narrow aliases and remove legacy status mutation from core cooldown flow.
Tests/checks run: out of scope; only source/docs inspection, `wc -l`, `rg` caller/export discovery, and git diff/status verification.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, phase-0-batch-plan.md. Entrypoint inventory and existing TypeScript islands unchanged.
Deleted files: none.
Open questions: none from this slice; main migration risk is preserving diagnostic legacy projections while preventing them from regaining scheduler/completion/session authority.
```

## Batch 30 — DONE — 10 files, 1921 lines

| Lines | Action | File |
|---:|---|---|
| 39 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/status-store-compat.ts` |
| 385 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/status-store-lifecycle/appenders.ts` |
| 62 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/status-store-lifecycle/idempotency.ts` |
| 142 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/status-store-lifecycle/legality.ts` |
| 440 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/status-store-lifecycle/projections.ts` |
| 86 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/status-store-lifecycle/read-models.ts` |
| 165 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/status-store-lifecycle/refs.ts` |
| 57 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/status-store-lifecycle/storage.ts` |
| 91 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/status-store-lifecycle.ts` |
| 454 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/status-store.ts` |


### Phase 0 slice review — Nova status-store lifecycle and diagnostic status facade

```text
Slice: Nova status-store lifecycle and diagnostic status facade
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/nova/pipeline/services/status-store-compat.ts
  - kubeclaw-main/skills/nova/pipeline/services/status-store-lifecycle/appenders.ts
  - kubeclaw-main/skills/nova/pipeline/services/status-store-lifecycle/idempotency.ts
  - kubeclaw-main/skills/nova/pipeline/services/status-store-lifecycle/legality.ts
  - kubeclaw-main/skills/nova/pipeline/services/status-store-lifecycle/projections.ts
  - kubeclaw-main/skills/nova/pipeline/services/status-store-lifecycle/read-models.ts
  - kubeclaw-main/skills/nova/pipeline/services/status-store-lifecycle/refs.ts
  - kubeclaw-main/skills/nova/pipeline/services/status-store-lifecycle/storage.ts
  - kubeclaw-main/skills/nova/pipeline/services/status-store-lifecycle.ts
  - kubeclaw-main/skills/nova/pipeline/services/status-store.ts
Runtime entrypoints affected: none; these are service/facade modules imported by Nova CLI/runners/polling/recovery, but no batch file is a direct CLI/runtime/tool entrypoint.
Incoming callers: Nova CLI imports initLogDir; polling/rate-limit/dependencies/blueprint/retry policy/pipeline-runner/module-runner/gate-runner/approval/review/Buster paths import status-store functions and projections; gate-active-session and compatibility projection leaves import lifecycle read-model helpers; truth-drift imports the status-store-compat facade; lifecycle leaf modules are imported by the lifecycle facade and appenders.
Outgoing dependencies: Node fs/path/crypto; Nova core paths/logger/runtime, redaction, system IO warnings, artifact bundle, lifecycle-state pending mutation helpers, correlation, failure semantics, serialization, status-store compatibility leaves, truth-drift, and lifecycle storage/idempotency/refs/read-model/projection/legality leaves.
Dynamic imports: none found.
Exported symbols: status-store compatibility re-export surface; lifecycle event/read-model/ref/projection facade; lifecycle append/get/reset functions; idempotency key builder; legality checker; approval resolution/event projection helpers; read-model defaults/load/save/events/progression; ref builders/resolvers; storage helpers; status-store init/load/save/initStatus, guarded-field diff helpers, prompt/transcript persistence, and gate output archive helpers.
Canonical authority used: lifecycle read models and canonical-events JSONL are canonical module/pipeline/gate/wait/cooldown state; status-store owns diagnostic status snapshot writes and guarded compatibility facade; lifecycle leaves own append legality, idempotency, refs, storage, read-model schema, and projections; legacy status/gate projection authority remains compatibility-only.
Fallback/legacy/shim hits found: status-store-compat facade; idempotent duplicate append; partial event-data defaults; stale recovery identity fallback; cooldown timestamp fallback; unknown-ref/default hash idempotency; retry attempt bridge; approval timeout synthetic signals; unknown approval signal null projection; projection from missing read model; sparse module event projections; read-model cache/default fallback; progress/module lookup aliases; attempt/commit/run/identity aliases; null path storage no-op; lifecycle facade wrapper; status-store lifecycle-to-legacy status DTO; guarded status write retry bridge; runtime active-agent snapshot sync; legacy initStatus shape; prompt/transcript best-effort; gate archive no-op.
Fallback decision:
  - deleted: none.
  - renamed as canonical: lifecycle duplicate dedupe; approval timeout signal behavior; projection rebuild defaults; stale recovery clearing active sessions; RATE_LIMITED progression active status; status lifecycle guard; prompt/transcript best-effort artifacts; gate archive missing-source no-op.
  - kept as external adapter: status-store-compat facade; partial event defaults; stale recovery mixed input; cooldown timestamp fallback; retry attempt bridge; sparse module projections; read-model cache before log-dir init; progress/config/module lookup aliases; attempt/commit/run/identity aliases; lifecycle facade wrapper; lifecycle-read-model-to-legacy-status DTO; runtime snapshot sync via status writes; legacy initStatus shape.
  - needs user decision: whether lifecycle events should require primary refs for all event types; whether malformed canonical approval signals should fail closed during projection; whether canonical lifecycle writes should require initialized run log dirs instead of null-path no-op/cache fallback.
Behavior invariants: no code is migrated; status JSON remains diagnostic and cannot bypass lifecycle guarded fields; lifecycle appends must be idempotent and legal before write; read models remain canonical for module state, active-session recovery, cooldown, waits, and progression; compatibility projections must not restore legacy status/gate files as scheduler/completion authority; prompt/transcript/archive writes stay non-authoritative.
Simplifications/risks/open questions: Type lifecycle event proposal/data/ref unions before conversion; move alias/default handling to boundary adapters; make retry and active-session updates explicit lifecycle events; decide log-dir requirement for lifecycle writes. Main risk is preserving old status consumers while preventing diagnostic status writes from mutating canonical lifecycle state.
Tests/checks run: out of scope; only source/docs inspection, `wc -l`, `rg` caller discovery, and git diff/status verification.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, phase-0-batch-plan.md. Entrypoint inventory and existing TypeScript islands unchanged.
Deleted files: none.
Open questions: Should canonical lifecycle event proposals require non-null primary refs and fully typed data; should malformed canonical approval signals fail closed instead of projecting null; and should lifecycle writes fail unless run log directories are initialized?
```

## Batch 31 — DONE — 10 files, 1839 lines

| Lines | Action | File |
|---:|---|---|
| 109 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/summary/project-summary.ts` |
| 72 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/summary-session-cleanup.ts` |
| 675 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/summary.ts` |
| 147 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/system-io-warning.ts` |
| 2 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/task-transport-contract.ts` |
| 652 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/telemetry/builders.ts` |
| 122 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/telemetry/dispatch.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/telemetry/payload-schema.ts` |
| 45 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/telemetry/progress.ts` |
| 12 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/telemetry/sinks.ts` |


### Phase 0 slice review — Nova summary generation, system I/O warnings, task transport facade, and telemetry spine

```text
Slice: Nova summary generation, system I/O warnings, task transport facade, and telemetry spine
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/nova/pipeline/services/summary/project-summary.ts
  - kubeclaw-main/skills/nova/pipeline/services/summary-session-cleanup.ts
  - kubeclaw-main/skills/nova/pipeline/services/summary.ts
  - kubeclaw-main/skills/nova/pipeline/services/system-io-warning.ts
  - kubeclaw-main/skills/nova/pipeline/services/task-transport-contract.ts
  - kubeclaw-main/skills/nova/pipeline/services/telemetry/builders.ts
  - kubeclaw-main/skills/nova/pipeline/services/telemetry/dispatch.ts
  - kubeclaw-main/skills/nova/pipeline/services/telemetry/payload-schema.ts
  - kubeclaw-main/skills/nova/pipeline/services/telemetry/progress.ts
  - kubeclaw-main/skills/nova/pipeline/services/telemetry/sinks.ts
Runtime entrypoints affected: none; all files are imported services/facades used by runner, registry, polling, shutdown, and telemetry callers, not direct CLI/runtime/tool entrypoints.
Incoming callers: built-in registry and pipeline-runner deps import summary generators; terminal runner calls writeSummary via deps; pipeline-review/case-study use summary-session cleanup; logger/policy/status-store call system I/O warning helpers; Nova completion adapters/tools import the task-transport facade; services/telemetry.js and Nova index re-export telemetry builders/dispatch/progress/sinks; runners, gates, agents, polling, observability, approval, summaries, and agent-observability ingester call those telemetry surfaces.
Outgoing dependencies: Node fs/path plus Nova deps/logger/paths/runtime, runtime/lifecycle/session-termination facades, polling, Discord, observability, governance, redaction, artifact-bundle, rate-limit, correlation, generator-result contracts, adapter registry, noncritical reporting, telemetry stream/sink dispatch, durable operator alerts, and common task-transport/telemetry payload-schema facades.
Dynamic imports: none found.
Exported symbols: project summary generator; summary cleanup factory; cumulative summary writer, pipeline-review path/dispatch/agent/instruction helpers, pipeline review generator, case-study and project-summary re-exports; system I/O warning helpers; common task transport exports; telemetry event builders/updaters, dispatch functions, common payload-schema exports, progress emitters, and closeTelemetryRedis.
Authorities used: Nova summary JSON/latest pointer and pipeline-review authority; project-summary registry adapter; tracked summary session cleanup; nonblocking system I/O warning telemetry; common task-transport and telemetry payload schemas; Nova telemetry dispatch/sink/disk-audit authority; Nova telemetry builder/progress event projection; telemetry Redis shutdown delegation.
Fallback/legacy/shim hits found: run-id/config identity aliases; optional generator outputs; noncritical summary/generator/Discord failures; one-shot lazy cleanup; cumulative summary status-file tolerance; flat top-level summary compatibility fields; cost-report best effort; pipeline-review config merge, model/agent/path defaults, Discord nonblocking, rate-limit recovery, optional transcript copy, Discord post failure success; system I/O required-field drop, stderr fallback, metadata aliases; task-transport and payload-schema facades; telemetry exit-code mapping, mixed identity aliases, nonblocking emission, approval timeout default, degraded/restored suppression, invalid-payload/sink/disk fallbacks, durable-first operator alerts; progress event defaults; Redis close delegation.
Fallback decision:
  - deleted: none.
  - renamed as canonical: optional project-summary outputs; noncritical project-summary and summary write/cost behavior; one-shot cleanup and captured cleanup diagnostics; cumulative status tolerance; pipeline-review path defaults, config override, rate-limit recovery, optional transcript copy, nonblocking Discord notices; system I/O stderr fallback; telemetry exit-code mapping, nonblocking emission, approval BLOCK default, transition suppression, validation/sink/disk failure handling, durable-first alerts; Redis close delegation.
  - kept as external adapter: run-id/config identity aliases; lazy cleanup identity functions until cleanup identity is typed; flat top-level summary fields; review model/agent defaults; summary service barrel re-exports; system I/O metadata aliases; task-transport/payload-schema facades; telemetry identity aliases; progress defaults.
  - needs user decision: whether pipeline-review Discord post failure should continue returning a successful generator result when artifacts exist.
Behavior invariants: no batch file becomes an entrypoint; summary/generator/telemetry/Discord side effects remain nonblocking where currently caught; summary artifacts are sanitized before writing; pipeline review output file remains the review authority; telemetry validates payloads before sink dispatch; disk audit append remains core telemetry evidence; transition-style observability should not spam repeated degraded/restored events.
Simplifications/optimizations: Type PipelineContext/run identity and summary generator outputs; separate compatibility summary fields from canonical `run_stats`/`cumulative`; type pipeline-review config/session identity/rate-limit result; keep common facades explicit; centralize telemetry identity as one typed object; type system I/O warning entry shape and progress event payloads.
Tests/checks run: out of scope; only source/docs inspection, rg caller discovery, dynamic-import search, wc line verification, and git diff/status.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, phase-0-batch-plan.md. Entrypoint inventory unchanged; existing TypeScript islands unchanged.
Deleted files: none.
Open questions: Should pipeline-review Discord post failure stay a degraded-but-successful generator result after the review artifacts exist?
```

## Batch 32 — DONE — 10 files, 1196 lines

| Lines | Action | File |
|---:|---|---|
| 191 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/telemetry-sink-contract.ts` |
| 159 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/telemetry-sink-dispatch.ts` |
| 178 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/telemetry-stream.ts` |
| 60 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/telemetry.ts` |
| 93 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/truth-drift.ts` |
| 290 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/services/validation.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/telemetry.ts` |
| 3 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/timing.ts` |
| 15 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/tools/lint-report/constants.ts` |
| 204 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/tools/lint-report/container-yaml-tools.ts` |


### Phase 0 slice review — Nova telemetry sink/stream, validation, truth-drift, and lint-report container tools

```text
Slice: Nova telemetry sink/stream, validation, truth-drift, and lint-report container tools
Files read/migrated: Read fully end to end; no migration performed.
  - kubeclaw-main/skills/nova/pipeline/services/telemetry-sink-contract.ts
  - kubeclaw-main/skills/nova/pipeline/services/telemetry-sink-dispatch.ts
  - kubeclaw-main/skills/nova/pipeline/services/telemetry-stream.ts
  - kubeclaw-main/skills/nova/pipeline/services/telemetry.ts
  - kubeclaw-main/skills/nova/pipeline/services/truth-drift.ts
  - kubeclaw-main/skills/nova/pipeline/services/validation.ts
  - kubeclaw-main/skills/nova/pipeline/telemetry.ts
  - kubeclaw-main/skills/nova/pipeline/timing.ts
  - kubeclaw-main/skills/nova/pipeline/tools/lint-report/constants.ts
  - kubeclaw-main/skills/nova/pipeline/tools/lint-report/container-yaml-tools.ts
Runtime entrypoints affected: none; files are service/facade/tool-registry helpers. Lint-report constants/container tools are used by the lint-report CLI/toolchain, but neither file is a direct CLI entrypoint.
Incoming callers: built-in registry imports telemetry sink definitions; telemetry dispatch imports sink input contract and dispatches through the registry; telemetry stream is called by notification/system I/O/observability/core context/sinks and sink contract paths; status-store uses truth-drift projections; module preflight/validators and registry validation use validation helpers; Nova services/tools import telemetry/timing facades; lint-report CLI/tool registry imports constants/container tool registration.
Outgoing dependencies: Node fs/path; Nova runtime/constants/logger/context/registry/Discord/observability/status-store/completion/redaction/noncritical/serialization/core path helpers; common telemetry/timing facades; lint-report discovery/execution/parser/report helpers.
Dynamic imports: none found.
Exported symbols: telemetry sink hook/stage constants, sink input builders/validators/assertion, Redis/Discord sink observers, built-in sink definitions, telemetry sink dispatcher, Redis telemetry stream emit/key/close helpers, telemetry service facade exports, module/gate truth-drift projectors, validation codes/preflight/delivery/formatter helpers, Nova telemetry/timing facade exports, lint-report constants, and container/YAML tool registrar.
Canonical authority used: Nova telemetry public facade, registry-owned telemetry sink contract/dispatch, Redis telemetry stream writer, truth-drift diagnostic projection, preflight/delivery validation, common telemetry/timing through facades, and lint-report container/YAML tool registration.
Fallback/legacy/shim hits found: telemetry run/ref identity aliases, default emitter/source/time, private coreRuntime config requirement, Redis-disabled skip, presentation-only Discord sink, missing-listener/per-sink nonblocking degradation, telemetry enabled/run-id aliases, Redis init/emit/close nonthrowing results, broad telemetry barrel, truth-drift artifact aliases, missing FORGE preflight skip, optional serve.dockerfile/static path skips, Nova telemetry/timing facades, lint-report default tier/timeout, absent-file clean lint results, parse-failure findings, and changed-file yamllint narrowing.
Fallback decision:
  - deleted: none.
  - renamed as canonical: default telemetry sink metadata, private coreRuntime config boundary, Redis disabled/non-skipped failure behavior, Discord presentation-only sink, missing/per-sink telemetry degradation, Redis nonblocking stream errors, gate completion adjudication guard, optional serve.dockerfile/static path behavior, lint-report default tier/timeout, absent-file clean results, parser-failure findings, and changed-file yamllint narrowing.
  - kept as external adapter: telemetry identity/ref aliases, telemetry enabled/run-id aliases, broad telemetry service barrel, truth-drift legacy artifact aliases, Nova telemetry/timing facades.
  - needs user decision: whether missing/unreadable module FORGE.md should continue passing preflight contract validation.
Behavior invariants: Phase 0 only; no code migration; no batch file becomes an entrypoint; telemetry sinks remain side-effect plugins isolated by registry/capabilities; telemetry failures stay observability-only; Redis stream payloads are sanitized and sequenced; truth-drift does not own scheduler/completion state; validation returns structured failures instead of throwing for normal contract issues; lint-report tools map external output into findings without aborting the whole report.
Simplifications/optimizations: type one telemetry identity/ref object, narrow the telemetry service barrel after public API decisions, move alias handling to edge adapters, type validation failure/result and lint-report tool result contracts, and remove the unused container tool `fs` import during actual migration if confirmed unused.
Tests/checks run: out of scope; only source/docs inspection, `wc -l`, `rg` caller/dynamic-import discovery, and git diff/status verification.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, phase-0-batch-plan.md. Entrypoint inventory unchanged; existing TypeScript islands unchanged.
Deleted files: none.
Open questions: Should missing or unreadable module `FORGE.md` continue making preflight validation pass, or should typed module contracts require it and fail closed?
```

## Batch 33 — DONE — 9 files, 2293 lines

| Lines | Action | File |
|---:|---|---|
| 182 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/tools/lint-report/discovery.ts` |
| 53 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/tools/lint-report/execution.ts` |
| 71 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/tools/lint-report/output.ts` |
| 74 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/tools/lint-report/parsers.ts` |
| 162 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/tools/lint-report/report.ts` |
| 598 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/tools/lint-report/tool-registry.ts` |
| 149 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/tools/lint-report.ts` |
| 367 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/tools/project-summary-formatters.ts` |
| 637 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/tools/project-summary.ts` |


### Phase 0 slice review — Nova lint-report toolchain and project-summary generator

```text
Slice: Nova lint-report toolchain and project-summary generator
Files read/migrated: Read fully; no migration performed.
  - kubeclaw-main/skills/nova/pipeline/tools/lint-report/discovery.ts
  - kubeclaw-main/skills/nova/pipeline/tools/lint-report/execution.ts
  - kubeclaw-main/skills/nova/pipeline/tools/lint-report/output.ts
  - kubeclaw-main/skills/nova/pipeline/tools/lint-report/parsers.ts
  - kubeclaw-main/skills/nova/pipeline/tools/lint-report/report.ts
  - kubeclaw-main/skills/nova/pipeline/tools/lint-report/tool-registry.ts
  - kubeclaw-main/skills/nova/pipeline/tools/lint-report.ts
  - kubeclaw-main/skills/nova/pipeline/tools/project-summary-formatters.ts
  - kubeclaw-main/skills/nova/pipeline/tools/project-summary.ts
Runtime entrypoints affected: `tools/lint-report.ts` direct static-analysis CLI/subprocess entrypoint; `tools/project-summary.ts` direct project-summary CLI and registry-backed generator import surface.
Incoming callers: `services/lint.js` executes lint-report as a subprocess; lint-report internals call discovery/execution/output/parsers/report/tool-registry helpers; `services/adapter-registry.js` imports project-summary `generateSummary`; built-in registry exposes the project-summary generator; operators can run both tool files directly.
Outgoing dependencies: Node fs/path/child_process/url; Nova CLI parser, core Git context and platform config, Discord integration, lifecycle-state normalization, redaction, security, lint-report constants/discovery/execution/output/parsers/report/container-YAML registration, and external static-analysis/Git subprocesses.
Dynamic imports: none found.
Exported symbols: lint-report discovery/execution/output/parser/report helpers, `TOOL_REGISTRY`, `lintReportExitCode`, `runAllTools`, lint-report default `main`, project-summary formatters, `generateSummary`, and `postToDiscord`.
Canonical authority used: lint-report CLI/context/report aggregation, lint-report project/config/tool discovery, lint-report subprocess/result normalization, tool registry definitions, project-summary source/`.swarm`/Git data collection, project-summary Markdown/Discord/case-study formatting, and direct CLI/Discord behavior.
Fallback/legacy/shim hits found: platform config candidate fallbacks; marker-based project detection; changed-file deletion filtering; nonthrowing subprocess result mapping; skipped missing tools; parse/config failures as warning findings; platform-only ESLint/Semgrep config policy; regex export parsing; old unit/fail field aliases; repo/project/env fallback chains; Git/filesystem/JSON read fallbacks; lifecycle status normalization; gate PENDING defaults; review artifact shape compatibility; prompt filename agent census; Discord env/run-id/config aliases.
Fallback decision:
  - deleted: none.
  - renamed as canonical: marker-based detection, unreadable discovery dirs as empty, changed-file deletion filtering, nonthrowing subprocess/timeout behavior, dual-write log best effort, tool exceptions as report errors, parse/config warning findings, missing tsconfig warnings, platform-only ESLint/Semgrep config behavior, changed-file language filtering, partial mypy parse warnings, lint-report exit-code mapping, Git/filesystem/JSON read fallbacks, gate PENDING defaults, Discord skip/failure nonterminal behavior.
  - kept as external adapter: platform config candidate fallbacks, command availability skips, npm audit message-shape fallback, lint-report direct-entry guard, unit/fail aliases, repo/project fallback chains, lifecycle status normalization, review artifact compatibility, Discord env/run-id/config aliases.
  - needs user decision: regex-only public export parsing for repo-policy duplicate warnings, title-regex delivered-scope grouping, prompt filename agent invocation census.
Behavior invariants: Phase 0 only; no code migration; lint-report remains deterministic/no-LLM and should not crash the whole report for one tool; missing static-analysis tools/configs surface as report evidence; project-summary collection is read-only except explicit output/Discord side effects; pipeline summary artifact placement stays in the service adapter.
Simplifications/optimizations: type lint-report context/tool/result/finding shapes early; keep external-tool parsing isolated behind registry adapters; replace regex export and prompt filename census with structured data if authorities are added; make project-summary collector output a typed object before formatter calls.
Tests/checks run: out of scope; only source/docs inspection, `wc -l`, `rg` caller/dynamic-import/export discovery, and git diff/status verification.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, entrypoint-inventory.md, phase-0-batch-plan.md. Existing TypeScript islands unchanged.
Deleted files: none.
Open questions: Should repo-policy duplicate export detection keep regex parsing or use an AST parser, should delivered-scope grouping remain title-regex based, and should project-summary agent invocation counts come from prompt filenames or a structured lifecycle/telemetry source?
```

## Batch 34 — DONE — 2 files, 363 lines

| Lines | Action | File |
|---:|---|---|
| 346 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline/tools/redis.ts` |
| 17 | migrate JS→TS | `kubeclaw-main/skills/nova/pipeline.ts` |


### Phase 0 slice review — Nova Redis adapter/operator tool and root pipeline compatibility shim

```text
Slice: Nova Redis adapter/operator tool and root pipeline compatibility shim
Files read/migrated: Read fully end to end; no migration performed.
  - kubeclaw-main/skills/nova/pipeline/tools/redis.ts
  - kubeclaw-main/skills/nova/pipeline.ts
Runtime entrypoints affected: `tools/redis.ts` direct Redis send/read/archive CLI and registered adapter; `skills/nova/pipeline.ts` production/source Nova pipeline CLI compatibility shim.
Incoming callers: `services/adapter-registry.js` imports Redis adapter; `agents/orchestration.ts` resolves Redis adapter and calls `publishTask`; `services/polling-redis-completion.js` resolves Redis adapter, sets `setLogCallback`, and calls `archiveCompletions`; operators/deployment/docs invoke `/app/skills/pipeline.ts` and Redis tool paths; verification imports/checks the root shim.
Outgoing dependencies: Node fs/path/url; Nova CLI parser; telemetry Redis client helpers; common task transport via Nova facade; Redis completion policy helpers; root shim re-exports `pipeline/index.ts` and dynamically delegates direct CLI execution to `pipeline/cli.js`.
Dynamic imports: `tools/redis.ts` dynamically imports Discord integration and redaction helpers for optional task notification; `skills/nova/pipeline.ts` dynamically imports `./pipeline/cli.js` only on direct execution.
Exported symbols: Redis tool default library (`client`, `setLogCallback`, `publishTask`, `sendTask`, `readCompletion`, `archiveCompletions`, `disconnect`) plus Redis completion constants/helpers re-exported from `services/redis-completion.js`; root shim exports all named/default symbols from `pipeline/index.ts`.
Canonical authority used: Nova Redis adapter/operator tool authority for Buster task dispatch and completion archive/read adapter behavior; Redis completion policy in `services/redis-completion.js`; task queue contract in common task transport; root executable compatibility authority in `skills/nova/pipeline.ts`; public API authority in `pipeline/index.ts`; runtime CLI authority in `pipeline/cli.js`.
Fallback/legacy/shim hits found: Redis env/stream/sender defaults; `sendTask` alias; Discord snake_case/camelCase payload fields and best-effort notification; strong-identity read returning null; archive `${stream}:log`/1000 defaults; Redis tool and root shim symlink-aware direct-entry guards; root public compatibility re-export/delegation shim.
Fallback decision:
  - deleted: none.
  - renamed as canonical: Redis lazy singleton/env defaults, Buster stream default, Discord best-effort/nonblocking presentation, strong completion identity fail-closed behavior, archive stream/maxLen defaults.
  - kept as external adapter: `sendTask` alias, Discord payload identity aliases, Redis tool direct-entry guard, root `pipeline.ts` compatibility shim and direct-entry guard.
  - needs user decision: whether direct Redis `read-completion` should remain operator-supported after event-driven completion adapters fully own runtime completion waiting.
Behavior invariants: Phase 0 only; no code migration; root shim must not grow runtime logic or execute CLI on import; Redis publishing must build/validate canonical task envelopes; completion reads must not match weak/stale identities; stale completion archival must preserve active identity; Redis/Discord/logging side effects stay adapter-level and nonauthoritative except Redis stream operations.
Simplifications/optimizations: Type Redis task payload/expected identity and adapter method contracts; move Discord identity aliasing to presentation boundary; keep `sendTask` as an explicit deprecated adapter alias; preserve root shim as tiny TS/JS wrapper while migrating real CLI/API modules separately.
Tests/checks run: out of scope; only source/docs inspection, `wc -l`, `rg` caller/export discovery, and git diff/status verification.
Docs updated: import-call-graph.md, architecture-map.md, authority-registry.md, fallback-ledger.md, entrypoint-inventory.md, phase-0-batch-plan.md. Existing TypeScript islands unchanged.
Deleted files: none.
Open questions: Should direct Redis `read-completion` remain a supported operator action after runtime completion waiting is entirely event-driven and adapter-owned?
```
