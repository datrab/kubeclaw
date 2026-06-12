# Pipeline Simplification Execution Checklist

Date: 2026-05-29

Source review: `docs/reviews/2026-05-29-pipeline-simplification-review.md`

## Goal

Work through the simplification review in controlled batches, prioritizing code deletion, explicit typed contracts, and removal of hidden default fallbacks. Each batch should reduce compatibility surface or strengthen verification without weakening the existing pipeline intent.

## Operating Rules

- Do not implement the full review in one large change.
- Prefer deletions over new abstractions.
- Add or tighten verification before removing behavior that may still be relied on.
- Commit after every completed phase or coherent sub-phase.
- Include a detailed changelog in each commit message.
- Track net LOC delta for every phase.
- Keep a running list of items that need an explicit product or policy decision.
- Do not remove authority surfaces that the review marks as intentionally retained.

## Status Legend

- `[todo]`: not started
- `[active]`: currently being changed
- `[blocked]`: waiting for decision or missing evidence
- `[keep]`: intentionally retained
- `[done]`: completed and verified

## Phase A - No-Regret Deletions

Purpose: remove stale compatibility leftovers and dead defaults with low behavioral risk.

- `[done]` Delete `skills/nova/pipeline/runners/module-runner-buster.ts` compatibility re-export after updating all refs.
  - Review refs: `B2-F04`, high-confidence deletion 1.
  - Why: pure compatibility shim, not a typed runtime authority.
  - Expected blast radius: imports, docs, verification scripts.

- `[done]` Remove stale `.js` Buster suite artifact references.
  - Review refs: `B2-F05`, high-confidence deletion 2.
  - Primary file: `skills/nova/pipeline/runners/module-runner-shared.ts`.
  - Why: violates the no-JS migration goal and can mislead future work.
  - Expected blast radius: docs, verification checks, artifact naming tests.

- `[done]` Remove dead Buster suite dependency fallback.
  - Review refs: `B6-F02`, high-confidence deletion 3.
  - Primary file: `skills/buster/pipeline/runners/suite-runner.ts`.
  - Why: known suites already declare dependencies; fallback hides malformed suite registration.
  - Expected blast radius: Buster suite runner tests.

- `[done]` Delete unused approval timeout constant surface if import audit confirms no use.
  - Review refs: `B3-F02`, high-confidence deletion 4.
  - Primary file: `skills/nova/pipeline/runners/approval-gate-shared.ts`.
  - Why: timeout authority should be explicit and singular.
  - Expected blast radius: approval gate imports/tests.

- `[done]` Clean stale docs references listed in `B7-F01`.
  - Review refs: `B7-F01`, high-confidence deletion 5.
  - Why: docs should stop preserving JS-era and compatibility shim language.
  - Expected blast radius: docs only, plus docs grep checks if present.

Verification target:

- targeted import/typecheck checks
- targeted contract checks touched by the deleted surface
- full verification harness after the phase

## Phase B - Verification Ratchet

Purpose: make removed compatibility hard to reintroduce.

- `[done]` Add temporary checks for stale `.js` references in pipeline/Buster surfaces during migration.
  - Review refs: `B7-F02`.
  - Why: prevents migration regression while cleanup is active.
  - Exit: delete the narrow migration check, or fold it into a broader durable policy check, once stale refs are gone.

- `[done]` Add temporary checks for deleted compatibility imports and re-export paths during migration.
  - Review refs: `B2-F04`, `B7-F02`.
  - Why: prevents shim reintroduction while deletion work is active.
  - Exit: delete the narrow migration check, or fold it into a broader durable policy check, once compatibility paths are gone.

- `[done]` Replace tests that bless legacy fallback behavior with canonical typed assertions.
  - Review refs: `B7-F02`.
  - Why: tests should enforce the target architecture, not preserve compatibility debt.

- `[done]` Add search/check coverage for hidden fallback literals where practical.
  - Review refs: default fallback removal list.
  - Why: fallback deletion should become a ratchet, not a one-time cleanup.

Verification target:

- relevant `tests/verification/contracts/*`
- behavior harness areas touched by tightened assertions
- full verification harness if checks are broad

## Phase C - Typed Result Producer Migration

Purpose: make producers emit canonical typed result shapes directly, then delete reconstruction/inference.

- `[done]` Instrument or inventory `PipelineStepResult` fallback source usage before deleting inference.
  - Review refs: `B1-F01`.
  - Why: identify active callers still depending on legacy fields.

- `[done]` Require canonical outcome/terminal reason at producer boundaries.
  - Review refs: `B1-F01`, `B2-F01`.
  - Why: typed result contracts should be the authority.

- `[done]` Convert module terminal return paths to create `PipelineStepResult` directly.
  - Review refs: `B2-F01`.
  - Why: removes terminal envelope reconstruction.

- `[done]` Delete `buildModuleStepResult` compatibility reconstruction after all callers are migrated.
  - Review refs: `B2-F01`.
  - Why: highest-value result-contract simplification.

- `[done]` Remove outcome inference from `exit`, `status`, `issueType`, metadata, and summary-adjacent fields.
  - Review refs: `B1-F01`.
  - Why: hidden inference competes with the typed contract.

- `[done]` Tighten worker/gate typed control aliases only after producer audit.
  - Review refs: `B1-F02`, `B1-F03`.
  - Why: avoid deleting aliases still needed by live producers.

Verification target:

- `check-pipeline-step-result-surface.mjs`
- `check-worker-control-result-surface.mjs`
- `check-gate-control-result-surface.mjs`
- behavior areas for module failures, gates, pipeline, migrated seams

## Phase D - Explicit Runtime Config And Defaults

Purpose: remove hidden production defaults while preserving explicit local/test policy defaults.

- `[done]` Delete permissive plugin normalization and make plugin config strict everywhere.
  - Review refs: `B0-F01`.
  - Why: config should not silently normalize missing required fields, including in local/test fixtures.

- `[done]` Require plugin manifest `defaultEnabled` where policy expects it.
  - Review refs: `B0-F03`.
  - Why: plugin enablement should be explicit.

- `[done]` Replace ACP monitor numeric defaults with validated explicit config.
  - Review refs: `B4-F01`.
  - Why: runtime behavior should not depend on hidden numeric defaults.

- `[done]` Remove gateway localhost/empty-token/default retry behavior from production paths.
  - Review refs: `B4-F02`.
  - Why: local-dev defaults should be named and scoped.

- `[done]` Remove rate-limit detail/status fallback fields after canonical producer migration.
  - Review refs: `B4-F03`.
  - Why: rate-limit diagnostics should be typed and explicit.

- `[done]` Tighten session termination defaults into explicit policy.
  - Review refs: `B4-F05`.
  - Why: termination behavior must not be implicit.

Verification target:

- runtime monitor tests
- transcript monitor tests
- rate-limit contract checks
- gateway/config validation tests

## Phase E - Gate And Approval Consolidation

Purpose: reduce duplicate gate invocation and timeout authority paths.

- `[done]` Consolidate standard, waitable, and remediable gate invocation flow.
  - Review refs: `B3-F01`.
  - Why: duplicated invocation paths increase behavioral drift.

- `[done]` Collapse approval timeout policy to one authority.
  - Review refs: `B3-F02`.
  - Why: timeout fallback chains are hard to reason about.

- `[done]` Remove review/Buster gate unknown-failure inference from text/status fields.
  - Review refs: `B3-F03`.
  - Why: typed gate control results should own failure class and outcome.

Verification target:

- gate behavior areas
- fix-cycle behavior areas
- approval behavior areas
- gate active-session and gate-control contract checks

## Phase F - Telemetry, Discord, And Correlation

Purpose: stop reconstructing structured state from rendered output.

- `[done]` Pass structured correlation into Discord/audit sinks.
  - Review refs: `B5-F01`.
  - Why: rendered Discord fields should not be parsed back into authority data.

- `[done]` Remove telemetry builder inference from step ids where typed context is available.
  - Review refs: `B5-F02`.
  - Why: step-id parsing is another hidden compatibility path.

- `[keep]` Preserve durable operator alert before external sinks.
  - Review refs: `B5-F03`.
  - Why: reliability property, not technical debt.

- `[done]` Tighten Buster telemetry identity while preserving degraded/fallback observability.
  - Review refs: `B5-F04`.
  - Why: degradation reporting is valuable; ambiguous identity is not.

Verification target:

- operator alert surface checks
- telemetry/Discord behavior tests
- observability docs/schema checks

## Phase G - Buster Runtime And Suite Cleanup

Purpose: simplify Buster-specific runtime defaults and diagnostics after shared result/config cleanup.

- `[done]` Replace raw sleep/minimal diagnostics in Buster runtime loop where actionable.
  - Review refs: `B6-F01`.
  - Why: runtime waiting should produce structured, useful diagnostics.

- `[done]` Remove suite timeout and unknown identity defaults.
  - Review refs: `B6-F02`.
  - Why: suite identity and timeout policy should be explicit.

- `[done]` Audit Buster strict task validation and legacy `status_json_path` rejection for remaining value.
  - Review refs: `B6-F03`.
  - Why: strict validation should stay only where it protects a live boundary; explicit `status_json_path` rejection can be deleted if no producer or accepted external payload path can still emit it.

- `[done]` Replace hardcoded Buster repo root with config/shared root resolution.
  - Review refs: `B6-F04`.
  - Why: hardcoded workspace assumptions make runtime behavior brittle.

- `[keep]` Preserve non-blocking suite result writes, but structure diagnostics.
  - Review refs: `B6-F05`.
  - Why: result write failures should not mask primary suite outcomes.
  - Verified: non-blocking semantics are preserved and write failures now emit structured degraded diagnostics.

Verification target:

- Buster suite tests
- buster runtime normalization tests
- restart/recovery behavior
- full verification harness

## Phase H - Final Sweep

Purpose: prove the cleanup landed and document what changed.

- `[done]` Run full verification harness.
  - 2026-05-30: full wrapper passed with explicit local gateway URL:
    `OPENCLAW_GATEWAY_URL=http://127.0.0.1:${OPENCLAW_GATEWAY_PORT:-18789} ./tests/verification/run-full-verification.sh`.
  - Result: deterministic contracts passed, startup smokes passed, live subagent launch passed, and behavior harness passed with `416` passed / `0` failed.
  - Changelog: `docs/reviews/2026-05-30-phase-h-final-sweep-changelog.md`.
- `[done]` Grep for deleted compatibility names and stale `.js` suite paths.
  - 2026-05-30: live pipeline source directories contain no `.js` files.
  - No runtime producer remains for `status_json_path` or `buster_capabilities`; active hits are negative tests/contract guards or historical docs.
  - Updated current-facing docs and source comments that still described obsolete `.js` suite/runner paths or removed compatibility fields.
  - Changelog: `docs/reviews/2026-05-30-phase-h-final-sweep-changelog.md`.
- `[done]` Grep for newly introduced hidden fallback literals in touched surfaces.
  - 2026-05-30: no new hidden producer was found for removed weak-evidence, Buster alias/status-file, stale suite-path, or compatibility-result surfaces.
  - Remaining matching literals are explicit forbidden-key lists, negative contract/behavior fixtures, or the explicit local-development gateway helper.
  - Changelog: `docs/reviews/2026-05-30-phase-h-final-sweep-changelog.md`.
- `[done]` Record total LOC delta.
  - 2026-05-30: primary execution delta from `30d3f04a8..HEAD` is `125` files, `2908` insertions, `1063` deletions, net `+1845`.
  - Contextual review-doc baseline from `a9c28cb1a..HEAD` is `125` files, `3184` insertions, `1023` deletions.
  - Changelog: `docs/reviews/2026-05-30-phase-h-final-sweep-changelog.md`.
- `[done]` Update this checklist statuses.
  - 2026-05-30: Phase H points are marked done with verification/changelog notes.
  - Changelog: `docs/reviews/2026-05-30-phase-h-final-sweep-changelog.md`.
- `[done]` Add final summary under `docs/reviews/`.
  - 2026-05-30: added `docs/reviews/2026-05-30-pipeline-simplification-final-summary.md`.
  - Changelog: `docs/reviews/2026-05-30-phase-h-final-sweep-changelog.md`.

## Decisions

- `[done]` Plugin manifest/config strictness should be strict everywhere, including local/test fixtures.
  - Review refs: `B0-F01`, `B0-F03`.
  - Decision: missing plugin config or missing enablement policy should fail instead of being normalized into permissive defaults.

- `[done]` `status-store-compat` should be categorized before deletion.
  - Review refs: `B0-F02`.
  - Decision: move/rename used diagnostic projection helpers out of compatibility-shaped surfaces, then delete unused compatibility exports.

- `[done]` Worker/gate control aliases should be removed after producer audit.
  - Review refs: `B1-F02`, `B1-F03`.
  - Decision: audit current producers first, migrate them to canonical fields, then remove aliases/defaults.

- `[done]` Pipeline result fallback removal should start with test/static inventory.
  - Review refs: `B1-F01`, implementation sequence step 3.
  - Decision: inventory producers with search and targeted tests first; use temporary runtime instrumentation only if static/test coverage cannot prove fallback usage.

- `[done]` Gateway/runtime defaults should be explicit production config, with local-dev defaults only through named local-dev config/helpers.
  - Review refs: `B4-F01`, `B4-F02`, `B7-F03`.
  - Decision: production paths should fail fast without validated config; local conveniences must not live as hidden shared-runtime literals.

- `[done]` Buster `buster_capabilities` alias should be removed after producer audit.
  - Review refs: high-confidence deletion 6.
  - Decision: confirm all producers emit canonical `capabilities`, then delete the alias.

- `[done]` Weak-evidence active-session guards are not unconditional keep items.
  - Review refs: `B4-F04`, `B3-F04`.
  - Decision: audit whether any code still produces weak file/status evidence for active session or active gate session. If no live producer remains, delete the obsolete guard/diagnostic compatibility code instead of preserving it.

- `[done]` Legacy `status_json_path` rejection is not an unconditional keep item.
  - Review refs: `B6-F03`.
  - Decision: keep strict Buster task validation only where it protects current canonical payloads. Delete explicit `status_json_path` handling if no producer or accepted external payload path can still emit it.

## Items Marked Keep

- `[done]` Audit lifecycle read model active-session authority for remaining weak-evidence producers; delete obsolete weak-evidence guards if none remain.
  - 2026-05-30 audit: `saveStatus()` was the remaining lifecycle read-model weak producer. It now writes `active_sessions.modules` only when `status.active_agent` has complete run/attempt/dispatch/session identity, and status-level session fallback no longer creates active-session authority records.
  - 2026-05-30 cleanup: deleted the obsolete `lifecycle_active_session_identity_incomplete` policy branch for module lifecycle active-session authority.
  - Verification: `check-session-authority-slice-surface.mjs`, `check-status-store-slice-surface.mjs`, and focused `restart-recovery`.
- `[done]` Audit gate active-session lifecycle authority for remaining weak-evidence producers; delete obsolete weak-evidence guards if none remain.
  - 2026-05-30 audit: `persistGateActiveSession()` was the remaining gate active-session weak producer. It now writes `active-session.json` only when run/attempt/dispatch/session identity is complete, and gate recovery ignores incomplete lifecycle/file/tracked identities.
  - 2026-05-30 cleanup: deleted the obsolete gate `lifecycle_active_session_identity_incomplete` policy branch.
  - Verification: `check-gate-active-session-surface.mjs`, `gate-session-persistence`, and focused `restart-recovery`.
- `[keep]` Contract-invalid raw diagnostics.
- `[keep]` Redis completion adjudication while Redis remains an external completion source.
- `[keep]` Durable operator alert before external sinks.
- `[done]` Audit Buster strict task validation and legacy `status_json_path` rejection; delete `status_json_path` handling if obsolete.
- `[keep]` Suite result writes remaining non-blocking.
