# Canonical Pipeline Compatibility Inventory

Status: phase 0 inventory
Owner: Nova / maintainers
Created: 2026-06-06
Plan: `docs/archive/pipeline-plans/canonical-pipeline-compat-removal-plan.md`

## Purpose

Map every known compatibility, legacy, alias, and fallback authority surface before cleanup starts.

Phase 0 has three jobs:

1. Make the remaining debt visible.
2. Keep a snapshot inventory for triage.
3. Make the deterministic verification suite fail until known compatibility debt is gone.

## Search Scope

Runtime and active verification/docs scan:

- `skills/nova/pipeline`
- `skills/common/pipeline`
- `skills/buster/pipeline`
- `tests/verification/contracts`
- `tests/verification/behavior/areas`
- active `docs/` excluding `docs/archive/**`

Search terms:

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
- `legacy_gate_status`
- `legacy_evidence_source`
- `legacyRecords`
- `normalizeLegacy`
- `DiagnosticFallback`
- `diagnostic fallback`
- `migration`
- `backfill`
- `dual`
- `bridge`
- `old`
- `previous`
- `coerce`
- `coercion`
- `compatibility-shaped`

Operator audit:

- every `||` in runtime pipeline code is scanned
- high-risk fallback operators are the subset whose line also mentions identity, scheduler, completion, status, config alias, stream, module/gate, payload, context, source, session, dispatch, legacy, or fallback wording

## Current Runtime Counts

These counts are a snapshot from Phase 0. Later phases should reduce them.

- `legacy`: 87 runtime hits
- `compat`: 45 runtime hits
- `fallback`: 217 runtime hits
- `deprecated`: 1 runtime hit
- `shim`: 28 runtime hits
- `alias`: 10 runtime hits
- status/status-json family: 39 runtime hits
- `sendTask`: 0 runtime hits after task transport alias removal
- legacy gateway env aliases: 0 runtime hits after gateway config alias removal
- stream-key family: 25 runtime hits
- agent observability legacy comparison: 7 runtime hits
- diagnostic correlation fallback resolvers: 29 runtime hits
- replay/operator shape compatibility comments: 4 runtime hits
- typed-result coercion / compatibility-shaped boundary language: 28 focused runtime hits
- active docs/readmes with compatibility guidance markers: 56 focused hits
- all runtime `||`: 5072 hits
- high-risk runtime `||`: 1101 hits

The broad `||` count includes harmless validation, display text, and boolean checks. The high-risk count is the one frozen by the Phase 0 contract.

Not every new broad-term hit is pipeline compatibility debt. `fallback_model` is the accepted canonical model-policy bottom rung, noncritical telemetry fallback artifacts are observability durability, and TypeScript `migration island` ambient-type comments are build/tooling debt rather than alternate pipeline authority. They are recorded by the broad search, but not targeted by this canonical-pipeline cleanup unless they start acting as authority.

## Accepted Exception

### Repo-local common shims

Accepted because runtime materialization and verification need stable repo-local import paths.

Rules:

- must be a pure re-export of a canonical `skills/common/pipeline` owner
- must not contain fallback logic
- must not contain compatibility readers
- must not coerce old shapes
- must not create alternate authority paths

Current accepted facade families:

- `skills/nova/pipeline/agents/*` common facades
- `skills/buster/pipeline/agents/*` common facades
- `skills/nova/pipeline/integrations/*` common facades
- `skills/buster/pipeline/integrations/*` common facades
- `skills/nova/pipeline/services/*-contract.ts` common facades
- `skills/buster/pipeline/services/*-contract.ts` common facades
- `skills/nova/pipeline/services/telemetry/payload-schema.ts`
- `skills/buster/pipeline/services/telemetry/payload-schema.ts`
- `skills/nova/pipeline/agent-observability/src/index.ts`
- `skills/buster/pipeline/agent-observability/src/index.ts`
- `skills/nova/pipeline/{cli-args,git-primitives,lifecycle-state,noncritical-reporting,redaction,redis-transport,security,telemetry,timing}.ts`
- `skills/buster/pipeline/{cli-args,git-primitives,lifecycle-state,noncritical-reporting,redaction,redis-transport,security,telemetry,timing}.ts`

Phase 4 locks the 53 approved repo-local common facades with `check-common-pipeline-facades-surface.mjs`.

## Debt Map

### P1: Status-store compatibility and gate status evidence

Runtime surfaces:

- `skills/nova/pipeline/services/status-store-compat.ts`
- `skills/nova/pipeline/services/status-store-compat/common.ts`
- `skills/nova/pipeline/services/status-store-compat/gate-projection.ts`
- `skills/nova/pipeline/services/status-store-compat/module-projection.ts`
- `skills/nova/pipeline/services/status-store.ts`
- `skills/nova/pipeline/services/dependencies.ts`
- `skills/nova/pipeline/services/truth-drift.ts`
- `skills/nova/pipeline/runners/gate-runner.ts`
- `skills/nova/pipeline/runners/pipeline-runner-deps.ts`

Markers:

- `status-store-compat`
- `readGateStatusJson`
- `legacy_gate_status`
- `legacy_gate_status_path`
- `legacy_evidence_source`
- `legacy_status:gate-status.json`
- `status_json`

Why it is debt:

- Gate status JSON can still appear in projection/read-model surfaces.
- Dependency logic still knows about `legacy_gate_status`.
- Runtime imports still route through `status-store-compat`.
- It keeps a second mental model next to lifecycle/read-model truth.

Modern replacement:

- lifecycle gate read model
- typed gate result artifacts/events
- typed Redis completion evidence where Buster owns completion

Notes:

- Gate status JSON may remain as operator evidence only if never read by scheduler, dependency, or completion logic.

### P2: Completion legacy sources and local evidence fallback

Runtime surfaces:

- removed from `skills/nova/pipeline/services/completion-adjudicator.ts`
- removed from `skills/nova/pipeline/services/completion-event-adapters.ts`
- removed from `skills/nova/pipeline/services/buster-completion-controller.ts`
- `skills/nova/pipeline/services/polling-dual.ts`
- removed from `skills/nova/pipeline/runners/buster-gate-completion.ts`

Markers:

- `status_json`
- `legacy_status:status_json`
- fallback identity in completion event construction
- local evidence terminal paths

Why it is debt:

- Removed from the completion controller/adapters/adjudicator pass; keep this marker here so archive readers understand what was cut.
- Remaining completion-adjacent cleanup belongs to broader status-store and ACP/git completion inference phases.

Modern replacement:

- typed Redis completion event
- complete active dispatch identity
- invalid/missing identity fails closed
- local evidence as diagnostic/event wakeup and Redis conflict context only

### P3: ACP polling and agent-side git completion inference

Runtime surfaces:

- `skills/nova/pipeline/services/polling-session-end.ts` (git completion inference removed in Phase 3 pass)
- `skills/nova/pipeline/services/polling.ts` (git polling pull and HEAD terminal auto-advance removed in Phase 3 pass)
- `skills/nova/pipeline/services/polling*.ts`
- `skills/nova/pipeline/integrations/git-worktree.ts` (polling-specific git pull helper removed in Phase 3 pass)
- `skills/nova/pipeline/agents/orchestration-healthcheck.ts`

Markers:

- `legacy agent-side commit/push` (removed from `polling-session-end.ts`)
- final git sync/pull for legacy remote update (removed from session/generic polling)
- `transcript_fallback`
- HEAD movement as completion signal (removed from session/generic polling)

Why it is debt:

- Completion could be inferred from git movement instead of ACP terminal state.
- Polling could hide an old agent-side commit/push model.
- Transcript fallback can blur liveness authority.

Modern replacement:

- ACP monitor terminal event is session authority.
- Git/worktree evidence is sampled after terminal/timeout only to classify local changes.
- Caller owns commit/push after session close.
- Transcript observation enriches diagnostics only.

### P5: Task transport aliases

Runtime surfaces:

- removed from `skills/nova/pipeline/tools/redis.ts`
- removed from `skills/buster/pipeline/tools/redis.ts`

Active tests/docs:

- updated `tests/verification/contracts/check-redis-completion-service-surface.mjs`
- updated `tests/verification/behavior/areas/operator-surface.mjs`

Markers:

- `sendTask(...)`
- compatibility alias comments

Why it is debt:

- Removed in the task transport alias pass; keep this marker here so archive readers understand what was cut.

Modern replacement:

- `TaskQueue.publishTask(...)`
- Redis tooling should expose canonical publish semantics only.

### P6: Legacy config and environment aliases

Runtime surfaces:

- `skills/nova/pipeline/core/config.ts`
- `skills/nova/pipeline/services/agent-observability-forge-completion.ts`

Active docs/tests:

- `skills/nova/project_setup/progress-json.md`
- `tests/verification/behavior/areas/runtime-surface.mjs`
- `tests/verification/behavior/areas/telemetry-docs.mjs`
- `tests/verification/contracts/check-telemetry-contract.mjs`

Markers:

- `telemetry.stream_key`
- legacy-compatible `stream_key` docs

Why it is debt:

- `telemetry.stream_key` still behaves as an old enablement affordance even though canonical stream names are derived from project/run identity.

Modern replacement:

- canonical telemetry enablement config
- derived run-scoped telemetry stream names only

### P7: Agent observability legacy comparison mode

Runtime surfaces:

- `skills/nova/pipeline/services/agent-observability-evidence/types.ts`
- `skills/nova/pipeline/services/agent-observability-evidence/comparator.ts`

Active tests:

- `tests/verification/contracts/check-agent-observability-parallel-run-evidence.mjs`

Markers:

- `legacyRecords`
- `normalizeLegacyRecord`
- `legacy_counts`
- `missing_legacy`

Why it is debt:

- Active observability validation still compares canonical observed records against old migration evidence.

Modern replacement:

- canonical agent observability ingested event stream validation
- archive or delete the migration comparator

### P8: Diagnostic correlation and replay-shape compatibility

Runtime surfaces:

- `skills/nova/pipeline/services/correlation.ts`
- `skills/nova/pipeline/services/summary.ts`
- `skills/nova/pipeline/services/agent-observability-forge-completion.ts`
- `skills/nova/pipeline/core/platform-config.ts`
- `skills/nova/pipeline/cli.ts`

Markers:

- `resolve*WithDiagnosticFallback`
- `resolveFallbackField`
- `family: 'fallback'`
- top-level summary fields kept for "backward compat for readers"
- agent-side `forge-completion.json` readable for migration diagnostics
- `SWARM_CONFIG fallback` as active operator wording

Why it is debt:

- Correlation helpers can repair missing identity from fallback context, which is useful for diagnostics but must not become authority-bearing identity.
- Summary output still preserves top-level compatibility fields for older readers.
- Migration-readable artifacts and config-discovery fallback wording keep old mental models visible in current runtime/docs.

Modern replacement:

- diagnostic-only provenance helpers must either be clearly isolated from authority paths or removed
- summary/replay schema should have one canonical shape
- config discovery docs should describe the single current source path plus the bounded `SWARM_CONFIG` secondary candidate, not broad compatibility auto-discovery

### P9: Active docs and tests that still protect old surfaces

Surfaces:

- tests that seed or assert `legacy_gate_status`
- docs that mention legacy `stream_key` as active configuration
- `docs/architecture/lifecycle-and-state.md` still says scheduler truth includes compatibility projections
- `docs/open-issues.md` still carries active tracker entries for old status files and compatibility shims
- `skills/nova/pipeline/README.md` now describes repo-local common facades as runtime/test import scaffolding
- `skills/nova/pipeline/services/contracts/README.md` now points new contract work at canonical contract owners only

Why it is debt:

- Verification currently protects some compatibility surfaces instead of protecting their deletion.
- Active docs can send maintainers back to old authority models even after runtime is cut over.

Modern replacement:

- tests assert absence of compatibility APIs
- behavior tests cover the modern authority replacing each old surface
- current docs describe accepted repo-local common shims as test/runtime import scaffolding only, and never as compatibility authority

## High-Risk `||` Audit

The broad operator scan found 5072 runtime `||` occurrences. Phase 0 does not claim all are bad.

Classification rules:

- harmless display/log default: allowed
- boolean predicate: allowed
- explicit config default with documented authority: allowed
- nullish default that should use `??`: cleanup candidate
- old field-name alias: cleanup candidate
- identity fallback: cleanup candidate when authority-bearing
- status/completion fallback: cleanup candidate
- env alias fallback: cleanup candidate
- stream-key fallback: cleanup candidate

High-risk examples to review in later phases:

- `dependencies.ts`: projection status plus `legacy_gate_status`
- `status-store-compat/gate-projection.ts`: gate output/status projection fallback chains
- `polling-session-end.ts`: session/git completion fallback paths
- `common/pipeline/integrations/gateway.ts`: `OPENCLAW_* || GATEWAY_*`
- `tools/redis.ts`: command mode aliases around `sendTask(...)`
- `agent-observability-evidence/comparator.ts`: legacy comparison fallback records

The Phase 0 contract freezes high-risk `||` counts by file. Later cleanup phases can reduce those counts; new high-risk fallback lines require inventory and contract updates.

## `||` Triage Method

The raw `||` number is intentionally noisy. Triage works by separating boolean logic from value fallback.

Keep first:

- boolean predicates such as `status === 'PASS' || status === 'FAIL'`
- guard clauses such as `!value || typeof value !== 'object'`
- explicit error/output resilience where fallback is not authority
- documented canonical policy defaults, such as `fallback_model`

Review first:

- assignments/defaults such as `const x = a || b`
- object fields such as `{ dispatch_id: event.dispatch_id || fallback.dispatch_id }`
- returns such as `return primary || secondary`
- function args that select alternate identity/status/config values

Remove first:

- old field-name aliases, especially snake/camel pairs where one is historical
- identity fallbacks for `run_id`, `module_id`, `gate_id`, `dispatch_id`, `session_key`, or `gateway_label`
- completion/status fallbacks such as status JSON or local evidence
- env aliases such as `OPENCLAW_* || GATEWAY_*`
- stream-key aliases
- any `||` that lets an inferred scheduler/completion/session state stand in for canonical evidence

After each cleanup phase, recalculate the raw and high-risk counts. The eventual target is not literally zero `||`; it is zero authority-bearing fallback `||` and a much smaller set of boring boolean/default cases.

## Phase 0 Contract Gates

Inventory/freeze contract:

- `tests/verification/contracts/check-canonical-pipeline-compat-freeze.mjs`

The inventory contract enforces:

- known debt markers may only appear in currently inventoried runtime files
- marker counts may go down, but not up
- new runtime files may not introduce known compatibility markers
- accepted repo-local common shims must remain pure re-exports
- high-risk `||` counts may go down, but not up
- focused active doc/readme compatibility markers may go down, but not up

Strict debt-free contract:

- `tests/verification/contracts/check-canonical-pipeline-compat-debt-free.mjs`

The strict contract is part of the deterministic contract suite and is expected to fail until the cleanup phases remove the debt. It enforces:

- no known compatibility debt markers in runtime code, excluding accepted pure common re-export shims
- no active docs/readmes teaching compatibility paths as current architecture
- accepted common shims remain pure common-pipeline re-exports

This means a fully green verification run is only possible after the debt is removed. Final deletion proof is Phase 10.
