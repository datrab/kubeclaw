# Pipeline Completion Authority Plan

## Goal

Make phase and gate completion a single canonical boundary:

`runner evidence -> Completion -> lifecycle reducer -> lifecycle event spine -> read models -> sinks/plugins/reports`

Runners may produce evidence and observations. They must not independently decide persisted terminal state, emit terminal sink events, or require live-session metadata as completion authority.

## Contract

The shared completion contract is intentionally small:

- `target_kind`: the completed unit kind, such as `module` or `gate`
- `target_id`: the completed unit id
- `phase`: the phase or gate name
- `attempt`: positive attempt number
- `status`: `PASS`, `FAIL`, `BLOCKED`, or `ERROR`
- `authority`: the evidence authority that proves the completion
- `reason_code`: optional typed reason
- `summary`: optional operator summary
- `observed`: optional runtime observation, such as session key or transcript path

`session_key` is observation/control metadata. It is required only for operations that control a live session. It is not required to accept terminal completion evidence.

## Single Authority

The lifecycle spine is the only state authority:

1. Phase/gate code returns or applies a `Completion`.
2. `applyModuleCompletion` or `applyGateCompletion` validates the completion and appends the lifecycle event.
3. Lifecycle read models project module/gate state from the event.
4. Discord, reports, summaries, E2E, and plugin sinks consume lifecycle events/read models.

Terminal module and gate state must not be persisted by scattered `transitionModuleStatus(... PASS/FAIL/BLOCKED ...)`, `getGateStats(...).gates_completed.push(...)`, or direct runner sink calls.

## Replacement Scope

Replace these competing authorities:

- Buster PASS status persistence in `module-runner/buster-phase.ts`; delete the stale `terminal-pass.ts` wrapper
- Buster completion identity paths that require `sessionKey` for terminal completion
- Forge ready/blocked terminal state writes in `module-runner-forge.ts`
- Forge-only PASS persistence in `module-runner-forge.ts`
- Review gate terminal PASS/FAIL telemetry and gate-completed stats writes in `review-gate-runner.ts`
- Contract tests that only validate implementation shape instead of enforcing the plan

Keep these as inputs or consumers:

- Redis/output-file/artifact readers
- session monitor and termination control
- lifecycle event store/read models
- telemetry, Discord, reports, and plugin sinks downstream of lifecycle state

## Implementation Phases

1. Add a shared completion validator under `skills/common/pipeline`.
2. Add `applyModuleCompletion` and `applyGateCompletion` to the Nova lifecycle appenders and export them through `status-store`.
3. Migrate Buster PASS to `applyModuleCompletion`; terminal PASS must accept missing session key.
4. Migrate Forge ready/blocked and forge-only PASS to `applyModuleCompletion`.
5. Add plan-shaped contract tests:
   - shared completion contract exists and rejects malformed completions
   - status-store exports `applyModuleCompletion`
   - Buster PASS and Forge terminal/ready paths use `applyModuleCompletion`
   - Buster strong completion identity does not require `sessionKey`
   - phase runners do not directly append terminal lifecycle events for migrated paths
6. Update docs to describe completion authority and the event spine.
7. Run root verification and focused lifecycle/module tests. Run a real seed only after the contract is green.

## Acceptance

- Root `npm run verify:product` is green.
- New completion-authority contract check is part of `verify:contracts`.
- Focused lifecycle and module-runner tests pass.
- Seed moves past the prior `completionIdentity.sessionKey` blocker or exposes the next typed completion issue.

## Result

Implemented on 2026-07-10:

- Added the shared completion validator and Nova facade.
- Added `applyModuleCompletion` as the lifecycle reducer entrypoint for module completion.
- Migrated Buster PASS, Redis-only PASS, Forge ready/blocked, and Forge-only PASS through the lifecycle reducer.
- Kept session identity as observed/control metadata; terminal completion no longer requires `sessionKey`.
- Added a plan-shaped contract check to root `verify:contracts`.
- Updated telemetry/artifact and implementation-map docs with completion authority.

Deletion cleanup on 2026-07-11:

- Deleted the stale Buster `terminal-pass.ts` wrapper.
- Routed Buster terminal failure, poll failure, pre-Buster validator block, Forge invalid-completion failure, max-retry BLOCKED, Nova-handoff ERROR, and retry-attempt FAIL through completion records.
- Removed direct module PASS / phase-completed telemetry calls from migrated runner paths.
- Tightened the completion-authority contract so migrated runner paths cannot use `markModuleBlocked`, direct terminal `transitionModuleStatus(... PASS/FAIL/BLOCKED ...)`, stale Buster PASS wrapper references, or direct PASS/phase-completed sink hooks.

Validation:

- `npm run verify:product`
- `npm run verify:contracts`
- `npm run verify:pipeline`
- `npm run docs:check`

Gate completion cleanup on 2026-07-11:

- Added `applyGateCompletion` as the lifecycle reducer entrypoint for gate completion.
- Routed accepted standard gate `PASS`, `FAIL`, `BLOCKED`, and `ERROR` controls through the lifecycle reducer.
- Removed review gate direct `onGatePass` / `onGateFail` terminal emissions and direct gate-completed stats mutation.
- Required standard and waitable gate adapters to declare explicit allowed next actions.
- Encoded the real E2E seed architecture as an intentional minimal fixture so the validator judges contract clarity instead of treating the small split as accidental product architecture.
