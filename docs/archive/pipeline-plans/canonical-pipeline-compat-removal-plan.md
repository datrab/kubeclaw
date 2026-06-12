# Canonical Pipeline Compatibility Removal Plan

Status: planned
Owner: Nova / maintainers
Created: 2026-06-06

## Goal

Remove pipeline compatibility debt until each pipeline concern has exactly one canonical runtime path.

The target is not "new path plus old fallback." The target is:

- one state authority
- one completion authority
- one task transport API
- one terminal result contract
- one import surface for shared code
- one operator/replay/telemetry shape
- no compatibility readers, aliases, projections, or fallback authority paths

Troubleshooting should not require knowing which historical shape, file, alias, or adapter happened to win.

## Non-Goals

These are not compatibility debt by themselves:

- POSIX process exit status at CLI/tool boundaries.
- Model fallback policy through `config.fallback_model`, which is the canonical model policy bottom rung.
- Noncritical telemetry/degraded-output mirrors used only for observability durability, as long as they do not become scheduler truth.
- Edge polling inside an adapter when the external API has no push/SSE/webhook boundary.
- Repo-local common shims that re-export canonical `skills/common/pipeline` owners and are required to reliably test runtime behavior. These shims are accepted only when they stay thin, ownership-neutral, and do not add fallback logic.

If one of those starts acting as pipeline authority, it becomes in scope.

## Canonical Authorities

| Concern | Canonical path |
| --- | --- |
| Module lifecycle and scheduler state | lifecycle events plus lifecycle read models |
| Gate lifecycle and scheduler state | lifecycle gate read model plus typed gate result artifacts/events |
| Active session identity | active-session read model/session authority |
| Buster module/gate completion | typed Redis completion event validated against active dispatch identity |
| ACP session observation | ACP monitor event adapter output |
| Terminal halt semantics | `pipeline_terminal_decision` and typed `pipeline_step_result` |
| Task publishing | `TaskQueue.publishTask(...)` through the transport contract |
| Telemetry | typed payload schema on canonical run-scoped streams |
| Shared code | canonical common owners, with repo-local common shims allowed only as thin runtime/test import scaffolding |
| Runtime configuration | canonical `OPENCLAW_*` env/config fields only |

## Current Debt Inventory

### Status-store compatibility projections

Live surfaces:

- `skills/nova/pipeline/services/status-store-compat.ts`
- `skills/nova/pipeline/services/status-store-compat/gate-projection.ts`
- `skills/nova/pipeline/services/status-store-compat/module-projection.ts`
- `skills/nova/pipeline/services/status-store-compat/common.ts`
- re-exports from `skills/nova/pipeline/services/status-store.ts`
- consumers such as `services/dependencies.ts`, `services/truth-drift.ts`, `runners/gate-runner.ts`, and `runners/pipeline-runner-deps.ts`

Debt:

- `legacy_gate_status`, `legacy_gate_status_path`, and `legacy_evidence_source` still exist as read-model/projection fields.
- `readGateStatusJson(...)` still exists and can make old gate status files look like part of current runtime.
- The module side is mostly cut over, but the compatibility facade still exists and keeps the old mental model alive.

Canonical replacement:

- Gate completion/readiness must be represented by lifecycle gate read models and typed gate output/completion events.
- Operator-only files may exist only if they are explicitly named as diagnostic artifacts and are never read by scheduler/dependency/completion logic.

### Completion legacy sources and local evidence fallback

Live surfaces:

- `skills/nova/pipeline/services/completion-adjudicator.ts`
- `skills/nova/pipeline/services/completion-event-adapters.ts`
- `skills/nova/pipeline/services/buster-completion-controller.ts`
- `skills/nova/pipeline/services/polling-dual.ts`
- `skills/nova/pipeline/runners/buster-gate-completion.ts`

Debt:

- `completion-adjudicator.ts` still knows `status.json`, `status_json`, and `legacy_status:status_json`.
- Completion event identity still accepts fallback identity when envelope fields are missing.
- Local file evidence still participates in Buster completion wakeups/context.

Canonical replacement:

- Redis completion event entries must carry complete typed identity.
- Missing identity is invalid, not repaired from fallback context.
- Local evidence can be an artifact mirror, but not terminal completion authority.

### ACP polling and agent-side git completion fallback

Live surfaces:

- `skills/nova/pipeline/services/polling-session-end.ts`
- related polling helpers under `skills/nova/pipeline/services/polling*.ts`

Debt:

- Session completion can still be inferred from HEAD movement after "legacy agent-side commit/push."
- The poller still performs final git sync/pull behavior to catch legacy remote updates.
- Transcript fallback health checks still exist as a liveness fallback path.

Canonical replacement:

- ACP session terminal state comes from the ACP monitor event adapter.
- The caller owns all commit/push behavior after session close.
- Transcript observation may enrich diagnostics, but must not replace session-state authority unless the ACP API is unavailable and the result is a hard failure/degraded condition, not a successful fallback.

### Repo-local common shims

Live surfaces include thin `export *` facades:

- `skills/nova/pipeline/agents/acp-monitor.ts`
- `skills/nova/pipeline/agents/lifecycle.ts`
- `skills/nova/pipeline/agents/runtime.ts`
- `skills/nova/pipeline/agents/session-semantics.ts`
- `skills/nova/pipeline/agents/session-termination.ts`
- `skills/nova/pipeline/agents/tracked-agents.ts`
- `skills/nova/pipeline/integrations/discord-webhook.ts`
- `skills/nova/pipeline/integrations/gateway.ts`
- `skills/nova/pipeline/lifecycle-state.ts`
- `skills/nova/pipeline/security.ts`
- shared contract facades under Nova/Buster service folders

Accepted surface:

- These shims are allowed because runtime materialization and verification need stable repo-local import paths.
- They must remain pure re-exports of canonical common owners.
- They must not contain compatibility readers, fallback logic, shape coercion, or alternate authority paths.

Cleanup target:

- Keep the accepted repo-local common shims.
- Contract-test them as thin shims, not as compatibility behavior.
- Delete or reject any shim that grows logic beyond re-exporting the canonical owner.

### Task transport aliases

Live surfaces:

- `skills/nova/pipeline/tools/redis.ts`
- `skills/buster/pipeline/tools/redis.ts`
- transport contract tests that still expect `sendTask(...)` compatibility aliases

Debt:

- `sendTask(...)` remains as an alias beside `publishTask(...)`.
- CLI/tool paths can keep teaching two names for one operation.

Canonical replacement:

- Only `publishTask(...)` exists for task dispatch.
- Redis tooling names the canonical task queue operation, not a legacy send operation.

### Legacy config and environment aliases

Live surfaces:

- `skills/common/pipeline/integrations/gateway.ts`
- telemetry config docs and tests around `telemetry.stream_key`
- `skills/nova/project_setup/progress-json.md`

Debt:

- `GATEWAY_URL` / `GATEWAY_TOKEN` are still accepted as aliases for `OPENCLAW_GATEWAY_URL` / `OPENCLAW_GATEWAY_TOKEN`.
- `telemetry.stream_key` is still documented as a legacy-compatible enable flag.

Canonical replacement:

- Only `OPENCLAW_GATEWAY_URL` and `OPENCLAW_GATEWAY_TOKEN` configure gateway access.
- Telemetry enablement uses a boolean/config object; stream names remain derived from project/run identity only.

### Agent observability legacy comparison mode

Live surfaces:

- `skills/nova/pipeline/services/agent-observability-evidence/*`
- `tests/verification/contracts/check-agent-observability-parallel-run-evidence.mjs`

Debt:

- Observability validation still compares hook/observed data against `legacyRecords`.
- Types and reports preserve `legacy_counts`, `missing_legacy`, and similar migration fields.

Canonical replacement:

- Agent observability validates the canonical ingested event stream directly.
- Historical comparison tools move to archived/offline diagnostics or are deleted from runtime verification.

### Documentation and tests that require compatibility

Live surfaces:

- contract tests that assert compatibility shims/aliases remain
- behavior tests that seed `legacy_gate_status` or call `sendTask(...)`
- docs that describe repo-local compatibility shims as active architecture

Debt:

- Tests protect the old surfaces, which blocks deletion.

Canonical replacement:

- Tests should assert the absence of compatibility APIs.
- Behavior coverage should exercise the modern authority path that replaced each old surface.

## Cleanup Phases

### Phase 0: Inventory and freeze compatibility growth

Search and map every remaining compatibility surface before deletion work starts, then add verification gates that make the debt visible and make the deterministic suite fail until the debt is gone.

Inventory search terms:

- `legacy`
- `compat`
- `compatibility`
- `fallback`
- `backward`
- `deprecated`
- `shim`
- `alias`
- `status_json`
- `status.json`
- `statusJson`
- `gateStatusJson`
- `gate-status.json`
- `readGateStatusJson`
- `sendTask`
- `GATEWAY_URL`
- `GATEWAY_TOKEN`
- `stream_key`
- old shape fields such as `legacy_gate_status`, `legacy_evidence_source`, `legacyRecords`, and `normalizeLegacy`
- diagnostic/replay shape markers such as `DiagnosticFallback`, `backfill`, `migration`, `dual`, `bridge`, `old`, `previous`, `coerce`, `coercion`, and `compatibility-shaped`

Operator audit:

- Search every `||` in runtime pipeline code.
- Classify each use as one of:
  - boolean predicate, such as `a === x || a === y`
  - guard clause, such as `!value || typeof value !== 'object'`
  - harmless defaulting for display/log text
  - explicit required config default
  - typed null/undefined coalescing that should become `??`
  - hidden authority fallback that must be removed
  - legacy alias/fallback that must be removed
- Pay special attention to `a || b` where `b` is an older field name, fallback identity, status file, env alias, stream key, or inferred scheduler/completion state.
- Prefer explicit required-field validation over fallback chains for authority-bearing data.
- Do not chase every boolean `||` first. Start with value-selection `||` in assignments, returns, object fields, and function arguments, because that is where old fallback authority hides.

Mapping buckets:

- runtime authority path
- scheduler/dependency decision
- completion decision
- session/liveness decision
- task transport API
- config/env alias
- telemetry/replay/artifact shape
- operator/docs wording
- test fixture/assertion
- guard assertion that intentionally blocks regression
- accepted repo-local common shim

Initial deny patterns:

- `compatibility shim` outside accepted repo-local common shims
- `compatibility alias`
- `legacy_gate_status`
- `legacy_evidence_source`
- `readGateStatusJson`
- `legacy_status:`
- `status_json`
- `sendTask(`
- `legacyRecords`
- `normalizeLegacy`
- `GATEWAY_URL`
- `GATEWAY_TOKEN`
- `telemetry.stream_key`
- `resolve*WithDiagnosticFallback`
- `backward compat`
- `SWARM_CONFIG fallback`

Allowed exceptions must be explicit and temporary in the plan file. Guard tests may mention denied strings only to assert absence.

Acceptance:

- A compatibility inventory exists beside this plan and maps each found surface to a cleanup phase or an accepted exception.
- The inventory distinguishes real runtime debt from guard tests, historical archived docs, and accepted repo-local common shims.
- `check-canonical-pipeline-compat-freeze.mjs` inventories current exceptions by phase and prevents growth.
- `check-canonical-pipeline-compat-debt-free.mjs` is part of the deterministic contract suite and fails while any known compatibility debt remains.
- No full verification run is green until compatibility debt is removed.

### Phase 1: Delete status-store compatibility as scheduler/dependency authority

Steps:

1. Move any useful gate fields out of `status-store-compat/gate-projection.ts` into lifecycle gate read models or typed gate result readers.
2. Replace `projectGateSchedulerState(...)` with a lifecycle-only projection.
3. Replace `dependencies.ts` checks that mention `legacy_gate_status` with canonical gate completion checks.
4. Delete `readGateStatusJson(...)` from runtime dependencies.
5. Stop exporting compatibility projection helpers from `status-store.ts`.
6. Delete `status-store-compat/module-projection.ts` once no module runtime imports remain.

Acceptance:

- Scheduler and dependency logic do not import `status-store-compat`.
- No runtime source contains `legacy_gate_status`, `legacy_gate_status_path`, or `legacy_evidence_source`.
- Gate status JSON, if still written, is documented and tested as diagnostic-only, not read by runtime decisions.
- Behavior coverage proves gates, dependencies, restart/recovery, and pipeline scheduling still use lifecycle/read-model truth.

### Phase 2: Make Buster completion event-only

Steps:

1. Remove status JSON source recognition from `completion-adjudicator.ts`.
2. Require complete identity in Redis completion entries; do not backfill identity from fallback context.
3. Remove local evidence as terminal completion authority.
4. Keep local evidence adapters only if they serve nonterminal wakeups or diagnostics; otherwise delete them.
5. Update Buster module and gate completion tests to assert invalid/missing identity fails closed.

Acceptance:

- `completion-adjudicator.ts` contains no `status_json` or `legacy_status` logic.
- Completion controller accepts terminal completion only from validated Redis completion evidence tied to active dispatch identity.
- Local evidence cannot produce PASS/FAIL/BLOCKED completion by itself.
- Behavior coverage proves module and gate Buster completion, conflict, invalid identity, timeout, and rate-limit paths.

### Phase 3: Remove agent-side git completion inference

Steps:

1. Remove HEAD-movement completion from `polling-session-end.ts`.
2. Remove final "catch legacy remote update" git pull behavior from session polling.
3. Make ACP terminal session state the sole completion signal.
4. Keep post-terminal filesystem change detection only as local result classification after session close.
5. Convert transcript fallback liveness to a degraded/error path, not successful liveness authority.

Acceptance:

- `polling-session-end.ts` no longer says "legacy agent-side commit/push."
- Session completion cannot be inferred from git movement.
- Caller-owned commit/push remains explicit and test-covered.
- Polling/session behavior tests cover session closed with changes, closed without changes, monitor adapter failure, rate limit, and timeout.

### Phase 4: Lock repo-local common shims to thin re-exports

Steps:

1. Inventory the accepted repo-local common shims.
2. Assert each accepted shim is a pure `export *` or named re-export of its canonical common owner.
3. Reject shim-local fallback logic, shape coercion, compatibility readers, or alternate authority paths.
4. Update docs to describe these as runtime/test import scaffolding, not pipeline compatibility behavior.
5. Delete any non-common or logic-bearing shim.

Acceptance:

- Repo-local common shims remain only for canonical common owners required by runtime verification.
- Contract tests fail if an accepted shim gains logic beyond re-exporting the canonical owner.
- Contract tests fail if a new non-approved compatibility shim appears.
- Runtime and behavior suites pass from canonical imports.

### Phase 5: Delete task transport aliases

Steps:

1. Replace every `sendTask(...)` call with `publishTask(...)`.
2. Rename CLI/tool action wording if it exposes "send" as the old task API.
3. Delete `sendTask(...)` aliases from Nova and Buster Redis tools.
4. Update contract tests that currently expect the alias.

Acceptance:

- No runtime source contains `sendTask(`.
- Task dispatch coverage proves Nova publishes typed tasks through `TaskQueue.publishTask(...)`.
- Buster queue consumption and completion ACK behavior remain green.

### Phase 6: Remove legacy config aliases

Steps:

1. Stop accepting `GATEWAY_URL` and `GATEWAY_TOKEN`.
2. Require `OPENCLAW_GATEWAY_URL` and `OPENCLAW_GATEWAY_TOKEN`.
3. Replace `telemetry.stream_key` as an enable flag with canonical telemetry config.
4. Remove project setup docs that describe `stream_key` as legacy-compatible.
5. Update Helm/config docs and runtime-surface tests.

Acceptance:

- Common gateway integration contains no `process.env.GATEWAY_URL` or `process.env.GATEWAY_TOKEN`.
- Telemetry stream key cannot be configured by project progress JSON.
- Docs teach one gateway config and one telemetry enablement path.

### Phase 7: Retire agent observability legacy comparison mode

Steps:

1. Decide whether the parallel-run comparator is still needed as an archived migration tool.
2. If not needed, delete `legacyRecords` input and legacy coverage fields.
3. If still needed for offline audits, move it out of active pipeline services and verification.
4. Update observability contracts to assert canonical event validation only.

Acceptance:

- Active pipeline observability code contains no `legacyRecords`, `legacy_counts`, `missing_legacy`, or `normalizeLegacy`.
- Canonical agent observability ingestion tests still cover spawn, progress, transcript, model, tool, and session-end events.

### Phase 8: Remove diagnostic/replay-shape compatibility

Steps:

1. Review `services/correlation.ts` diagnostic fallback helpers and prove whether every call site is diagnostic-only.
2. Delete any identity fallback used by authority-bearing paths; missing identity should fail closed.
3. Replace summary top-level compatibility fields with one canonical summary/replay shape.
4. Remove migration-readable `forge-completion.json` wording from active Forge completion authority once replacement diagnostics exist.
5. Align `SWARM_CONFIG` operator wording with the single current config source plus bounded secondary-candidate behavior.

Acceptance:

- No authority-bearing path calls `resolve*WithDiagnosticFallback(...)`.
- Correlation provenance reports one canonical source for scheduler/completion decisions.
- Summary/replay docs and output teach one canonical shape.
- Config docs do not present discovery as compatibility fallback behavior.

### Phase 9: Documentation and operator language cleanup

Steps:

1. Remove active docs that describe compatibility shims, aliases, legacy status files, or old fallback authority paths.
2. Archive historical notes under `docs/archive/` only.
3. Update architecture docs to say lifecycle/read-model, event completion, and typed terminal decisions are the only authorities.
4. Update developer docs to say compatibility code is rejected.

Acceptance:

- Active docs contain no compatibility debt as current architecture.
- Any remaining `legacy`/`compatibility` wording in active docs is either a denial rule or non-pipeline dependency compatibility.

### Phase 10: Final denylist and deletion proof

Add one final verification command that proves the cutover.

Required checks:

- no `status-store-compat` runtime imports
- no `readGateStatusJson`
- no `legacy_gate_status`
- no `legacy_status:`
- no `status_json`
- no `sendTask(`
- no repo-local common shim with fallback/coercion/compatibility logic
- no `legacyRecords`
- no `GATEWAY_URL` / `GATEWAY_TOKEN` fallback reads
- no `resolve*WithDiagnosticFallback(...)` on authority-bearing paths
- no summary/replay compatibility shape
- no active docs/readmes teaching compatibility as current architecture
- no docs that teach active compatibility paths

Acceptance:

- Contract checks pass.
- Focused behavior packs pass for scheduling, gates, dependencies, restart/recovery, polling/session, Buster completion, telemetry, and operator surface.
- Full verification matrix is updated so compatibility cannot drift back in silently.

## Suggested Execution Order

1. Phase 0 guard inventory
2. Phase 1 status-store compatibility removal
3. Phase 2 Buster completion event-only cutover
4. Phase 3 ACP/session polling cleanup
5. Phase 5 task transport aliases
6. Phase 6 config aliases
7. Phase 4 repo-local facades
8. Phase 7 observability legacy comparison
9. Phase 8 diagnostic/replay-shape compatibility
10. Phase 9 docs
11. Phase 10 final proof

This order removes runtime authority ambiguity first, then API aliases, then import cleanup and docs.

## Verification Packs

Run focused packs after each phase:

```bash
node tests/verification/contracts/check-status-store-slice-surface.mjs
node tests/verification/contracts/check-buster-completion-controller-surface.mjs
node tests/verification/contracts/check-redis-completion-service-surface.mjs
node tests/verification/contracts/check-common-helper-import-surface.mjs
node tests/verification/contracts/check-telemetry-contract.mjs
node tests/verification/contracts/check-canonical-pipeline-compat-freeze.mjs
node tests/verification/contracts/check-canonical-pipeline-compat-debt-free.mjs
node tests/verification/behavior/verify.mjs --areas gates,approvals,module-failures,pipeline,stops,restart-recovery,polling,telemetry,operator-surface
git diff --check
```

`check-canonical-pipeline-compat-debt-free.mjs` is intentionally red until the cleanup is complete.

Add new phase-specific contract checks when an existing check currently protects the old compatibility surface.

## Completion Definition

This plan is complete when a maintainer can answer each troubleshooting question from one canonical source:

- "What state is this module in?" -> lifecycle read model.
- "Is this gate done?" -> lifecycle gate read model / typed gate result.
- "Did Buster finish?" -> validated Redis completion event with active dispatch identity.
- "Did ACP finish?" -> ACP monitor terminal event.
- "Why did the pipeline stop?" -> terminal decision.
- "What task was sent?" -> TaskQueue publish record.
- "Where is telemetry?" -> canonical run stream.

No answer should require checking old status JSON, compatibility projections, alias APIs, or fallback authority paths.
