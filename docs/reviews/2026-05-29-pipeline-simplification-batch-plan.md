# Pipeline Simplification Review Batch Plan

Date: 2026-05-29

## Goal

Review `skills/nova/pipeline`, `skills/buster`, and `skills/common/pipeline` adversarially for simplification opportunities before implementation. The main target is to remove default fallbacks, compatibility leftovers, duplicate layers, ambiguous authority paths, and low-value defensive code while preserving current behavior and keeping the verification harness green.

This plan is for the review and planning session. It should produce a detailed review report with file/line evidence and implementation batches. It should not implement code changes directly.

## Recommended Shape

Do this as one coordinated review with multiple focused passes. A single broad pass over roughly 60k LOC is likely to become shallow and miss authority boundaries. The coordinating session should maintain one global finding list, but each batch should inspect a bounded subsystem and produce concrete deletion/simplification candidates.

## Review Rules

- Read code directly; do not rely on memory.
- Record exact file and line references for each finding.
- Prefer deletions and simpler authority paths over new abstractions.
- Mark anything uncertain as a hypothesis, not a recommendation.
- Do not weaken repo policy:
  - no JS reintroduction
  - typed result contracts remain authority
  - lifecycle/read-model authority remains intact
  - no silent fallback to legacy status/result shapes
  - no hidden default model/config/session behavior
  - verification harness must remain green after implementation
- Separate "delete now" from "phase carefully" and from "keep despite complexity".

## Batch 0 - Architecture And Policy Map

Scope:

- `skills/nova/pipeline.ts`
- `skills/nova/pipeline/index.ts`
- `skills/nova/pipeline/core`
- `skills/nova/pipeline/core/registry*`
- `skills/common/pipeline`
- current verification contracts under `tests/verification/contracts`

Questions:

- What are the true entrypoints?
- Which modules own pipeline authority, lifecycle authority, session authority, and telemetry authority?
- Which policies are enforced by verification contracts?
- Which "defaults" are policy-approved platform defaults, and which are hidden fallbacks?

Output:

- Architecture map.
- Policy map.
- A list of files that should not be simplified casually because they enforce authority boundaries.

Done when:

- The later batches can reference one shared map of owners and invariants.

## Batch 1 - Typed Contracts And Result Authority

Scope:

- `skills/nova/pipeline/services/contracts`
- `skills/nova/pipeline/runners/*control*`
- `skills/nova/pipeline/runners/*terminal*`
- worker/gate/validator/generator result builders
- result-related verification checks

Review focus:

- Remove remaining compatibility-shaped thinking.
- Identify duplicate normalization layers.
- Find result metadata copied into multiple places.
- Find places where raw result/status fields still compete with typed contract fields.
- Find fallback outcome/issueType inference that can be explicit instead.

Likely findings to look for:

- `rawResult.*` pass-throughs that exist only to emulate older payloads.
- aliases like `status`, `exit`, `reason`, `module`, `module_id` being accepted in too many places.
- validators that recursively tolerate or infer old shapes.

Expected implementation shape:

- Small, contract-first PRs.
- Each PR should run targeted contract checks plus full behavior harness.

Verification:

- `node tests/verification/contracts/check-gate-control-result-surface.mjs`
- `node tests/verification/contracts/check-worker-control-result-surface.mjs`
- `node tests/verification/contracts/check-pipeline-step-result-surface.mjs`
- `node tests/verification/behavior/verify.mjs --areas gates,module-failures,migrated-seams`

## Batch 2 - Module Runner Stack

Scope:

- `skills/nova/pipeline/runners/module-runner.ts`
- `skills/nova/pipeline/runners/module-runner-*`
- `skills/nova/pipeline/runners/module-runner/**`
- module runner tests in behavior areas

Review focus:

- Reduce orchestration layers between module runner, forge phase, pre-buster validators, buster phase, and failure handling.
- Remove hidden defaults around model, thinking, timeout, retry, phase, and status.
- Identify duplicated correlation assembly.
- Identify duplicated terminal result creation.
- Find paths that still rely on implicit status values instead of lifecycle transitions.

Likely findings to look for:

- repeated `{ dispatch_id, gateway_label, session_key, attempt }` assembly
- duplicated fail/retry/block code across Forge and Buster paths
- fallback phase/status detection after the caller already knows the phase
- "best effort" status handling that can fail closed instead

Expected implementation shape:

- Split into Forge, pre-Buster, Buster, and shared terminal result phases.
- Avoid one giant module-runner PR.

Verification:

- `node tests/verification/behavior/verify.mjs --areas module-failures,pipeline,many-module-soak,migrated-seams`
- `node tests/verification/contracts/check-module-runner-slice-surface.mjs`

## Batch 3 - Gate, Review, And Approval Runners

Scope:

- `skills/nova/pipeline/runners/gate-*`
- `skills/nova/pipeline/runners/buster-gate-*`
- `skills/nova/pipeline/runners/review-gate-*`
- `skills/nova/pipeline/runners/approval-gate-*`
- gate session persistence and approval behavior tests

Review focus:

- Remove duplicated gate session/correlation handling.
- Remove implicit fallback from gate status files or legacy status projections.
- Clarify which gate result owns pass/fail/block/request-fix outcomes.
- Identify whether review and buster gate fix-cycle logic can share less code or delete wrappers.

Likely findings to look for:

- duplicated fix-cycle result shaping
- manual Discord field construction instead of shared identity surfaces
- fallback gate identity inference
- stale gate status compatibility branches

Expected implementation shape:

- Keep approval separate from automated gates.
- Review and Buster gate simplification may be separate passes.

Verification:

- `node tests/verification/behavior/verify.mjs --areas gates,fix-cycles,approvals,governance,gate-session-persistence`
- `node tests/verification/contracts/check-gate-active-session-surface.mjs`
- `node tests/verification/contracts/check-gate-control-result-surface.mjs`

## Batch 4 - Session, Runtime, And Rate Limit Authority

Scope:

- `skills/common/pipeline/agents`
- `skills/nova/pipeline/agents`
- `skills/buster/pipeline/agents`
- `skills/nova/pipeline/services/rate-limit*`
- `skills/buster/pipeline/services/rate-limit.ts`
- runtime monitor and transcript monitor tests

Review focus:

- Remove fallback session identity behavior.
- Make gateway unreachable, stopped, terminal, and rate-limited states explicit.
- Reduce duplicated session termination logic between Nova, Buster, and common.
- Identify broad catch blocks that should be typed failure paths.
- Identify default monitor config fallbacks that should be explicit platform config.

Likely findings to look for:

- fallback gateway URL/token logic
- ambiguous "unknown" and "unreachable" handling
- session cleanup best-effort branches that hide failures
- repeated rate-limit Discord/telemetry assembly

Expected implementation shape:

- Phase carefully; session/runtime behavior has high blast radius.
- Prefer tests before deletions.

Verification:

- `node tests/verification/behavior/verify.mjs --areas transcript-monitor,runtime-monitor,agent-lifecycle,restart-recovery,shutdown-integration,buster-runtime-normalization`
- `node tests/verification/contracts/check-session-authority-slice-surface.mjs`
- `node tests/verification/contracts/check-time-budget-surface.mjs`
- `node tests/verification/contracts/check-rate-limit-slice-surface.mjs`

## Batch 5 - Telemetry, Discord, And Operator Surfaces

Scope:

- `skills/nova/pipeline/services/telemetry*`
- `skills/common/pipeline/telemetry.ts`
- `skills/nova/pipeline/integrations/discord.ts`
- `skills/nova/pipeline/services/discord-fields.ts`
- Buster Discord/telemetry surfaces
- observability docs and schema tests

Review focus:

- Remove duplicate telemetry event builders.
- Eliminate unregistered plugin-specific event names if `plugin.event` is canonical.
- Remove multiple Discord identity assembly paths.
- Ensure degraded/restored observability is explicit, not log-only.
- Identify operator surfaces with duplicated run/module/gate/session fields.

Likely findings to look for:

- `plugin.*.bridge_invoked` payloads rejected by schema while tests only tolerate them
- repeated field arrays for Run ID, Module, Dispatch, Gateway Label, Session
- local audit/write failure branches that only warn
- multiple telemetry sinks with overlapping responsibility

Expected implementation shape:

- First align schema/event names.
- Then dedupe builders.
- Keep behavior checks strict.

Verification:

- `node tests/verification/behavior/verify.mjs --areas telemetry,discord-correlation,operator-surface,telemetry-docs,telemetry-schema,runtime-surface`
- `node tests/verification/contracts/check-operator-alert-surface.mjs`
- `node tests/verification/contracts/check-observability-catch-reporting.mjs`
- `node tests/verification/contracts/check-agent-observability-contract.mjs`

## Batch 6 - Buster Runtime And Suite Surface

Scope:

- `skills/buster/buster-pipeline.ts`
- `skills/buster/pipeline`
- `skills/buster/pipeline/suites`
- `skills/buster/pipeline/services`
- Buster runtime normalization tests

Review focus:

- Remove duplicated runtime helpers now available from common.
- Remove hardcoded path fallbacks.
- Remove suite-specific default behavior that hides missing config.
- Ensure Buster task/result authority is typed and explicit.

Likely findings to look for:

- suite-local fallback config defaults
- repo-root/path handling duplicated across suites
- Buster-specific copies of common runtime/session logic
- silent "skip" behavior that should be explicit verdict metadata

Expected implementation shape:

- Separate runtime/service cleanup from suite cleanup.
- Suite behavior can have user-facing implications; avoid broad rewrites.

Verification:

- `node tests/verification/behavior/verify.mjs --areas buster-runtime-normalization,operator-surface,shell-boundary,redaction-surface`
- `node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs`
- `node tests/verification/contracts/check-buster-operator-surface.mjs`
- `node tests/verification/contracts/check-buster-repo-scoped-paths.mjs`

## Batch 7 - Docs, Verification Harness, And Dead Policy References

Scope:

- `tests/verification`
- `docs`
- `charts/kubeclaw/files/config`
- implementation maps and behavior docs

Review focus:

- Remove stale JS-era assertions.
- Remove docs that encode obsolete fallback behavior.
- Identify verification checks that enforce accidental complexity.
- Ensure simplification work updates docs and maps once, not piecemeal.

Likely findings to look for:

- tests asserting strings rather than behavior when string assertion is stale
- docs still describing deleted compatibility surfaces
- verification wrappers with outdated phase names
- policy docs that preserve obsolete fallback expectations

Expected implementation shape:

- Usually paired with implementation batches, but final cleanup should be separate.

Verification:

- `node tests/verification/behavior/verify.mjs --areas repo-docs,docs-surface,deployment-surface,telemetry-docs`
- `node tests/verification/contracts/check-phase10-final-reference-surface.mjs`
- `node tests/verification/contracts/check-verification-wrapper-surface.mjs`
- `node tests/verification/contracts/check-implementation-map-sync-surface.mjs`

## Final Review Report Output

The review session should save its detailed report as:

`kubeclaw-main/docs/reviews/2026-05-29-pipeline-simplification-review.md`

Required report sections:

1. Executive summary.
2. Reviewed scope and any exclusions.
3. Architecture and authority map.
4. High-confidence deletions.
5. Default fallback removals.
6. Simplification candidates by batch.
7. Risky changes that need phased migration.
8. Things that look complex but should stay.
9. Proposed implementation sequence.
10. Verification matrix.
11. Open questions.

Each finding should include:

- files and line references
- current behavior
- why it is complex or risky
- proposed simplification/deletion
- blast radius
- required verification
- recommended phase

## Suggested Implementation Order After Review

1. High-confidence dead code and stale verifier/doc references.
2. Typed result and contract simplification.
3. Module runner terminal/correlation simplification.
4. Gate/review/approval runner simplification.
5. Session/runtime/rate-limit simplification.
6. Telemetry/Discord dedupe.
7. Buster runtime and suite cleanup.
8. Final docs and verification map cleanup.

Do not batch all implementation into one PR unless the review finds only trivial deletions. Prefer one commit per batch with a detailed changelog and targeted verification, then run the full verification harness at the end.
