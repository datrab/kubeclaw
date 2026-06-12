# Module `status.json` Removal Plan

## Scope

This plan is for the per-module `.swarm/modules/<dir>/status.json` artifact only.

It does not remove gate operator evidence files such as `.swarm/<gate-id>-gate-status.json`.
Those are a separate artifact family and should be handled in a different pass.

## Goal

Delete all module `status.json` logic safely:

- no runtime reads
- no runtime writes
- no path construction
- no compat projection
- no prompt/doc references
- no tests that seed or assert it

The replacement authority must remain the existing lifecycle/read-model pipeline state.

## Current State

What is already canonical in the pipeline:

- Module status, phase, attempts, fail count, and terminal progression come from lifecycle read models and canonical lifecycle events.
- Polling already uses `loadStatus()` backed by lifecycle read models, not raw `status.json`.
- Dispatch/session/gateway correlation is already projected into lifecycle module state and active-session authority.
- Cooldown and rate-limit state are already lifecycle-backed.
- Terminal completion summaries are already projected from lifecycle events for normal pass/fail flows.

What still depends on the module `status.json` path or file:

- `saveStatus()` still writes the file after syncing read models.
- Legacy compat code can still read and project `status.json` in migration/bootstrap mode.
- Some drift and adjudication surfaces still name `status.json` as local evidence.
- Some runner diagnostics still talk about `status.json corrupted`.
- Prompt builders still show the path and instruct agents not to edit it.
- `project-summary.ts` still scans module `status.json` files directly.
- Several verification suites still seed `status.json` fixtures or assert `status.json` wording.

## Safe Removal Strategy

### Phase 1: Rewire before deletion

The first pass is not broad deletion. It is making sure every useful field currently mirrored through `saveStatus()` still lands in lifecycle/read-model state without needing the file.

#### 1. Keep `saveStatus()` API short-term, but make it lifecycle-only

Files:

- `skills/nova/pipeline/services/status-store.ts`

Plan:

- Remove the filesystem write/rename path from `saveStatus()`.
- Keep lifecycle guard enforcement.
- Keep lifecycle event append behavior.
- Keep runtime snapshot sync behavior, but make that sync the only effect.

Why first:

- This preserves most callers unchanged while deleting the file writer.
- It gives a narrow first runtime change and keeps the public status-store seam stable.

#### 2. Make runtime snapshot sync an explicit lifecycle concern

Files:

- `skills/nova/pipeline/services/status-store.ts`
- `skills/nova/pipeline/services/status-store-lifecycle/projections.ts`
- possibly `skills/nova/pipeline/services/status-store-lifecycle/appenders.ts`

Fields to verify and preserve via lifecycle/read models:

- `validation`
- `cost`
- `fail_summaries`
- any nonterminal `completion_summary` updates that do not already flow from canonical lifecycle events

Important note:

- `current_attempt`, `dispatch_id`, `session_key`, and `gateway_label` are already covered.
- Strong active-session authority is already covered under `readModels.active_sessions.modules`.

#### 3. Replace remaining path-based module artifact references

Files:

- `skills/nova/pipeline/core/paths.ts`
- `skills/nova/pipeline/runners/module-runner-shared.ts`
- `skills/nova/pipeline/prompts/forge.ts`
- `skills/nova/pipeline/prompts/buster-module.ts`

Plan:

- Remove `statusPath()`.
- Stop exposing module `status.json` as an artifact ref or prompt surface.
- Replace prompt language with generic lifecycle ownership wording, not file-specific wording.

Why first:

- If the file stops existing, these become broken paths immediately.

#### 4. Repoint summary/reporting surfaces to lifecycle/read-model data

Files:

- `skills/nova/pipeline/tools/project-summary.ts`
- `skills/nova/pipeline/services/summary.ts`

Plan:

- Make project summary collect module state from lifecycle/read-model artifacts instead of scanning `modules/*/status.json`.
- Remove any operator guidance that tells people to inspect module `status.json`.

Why first:

- `project-summary.ts` is the biggest remaining live consumer of the file.

### Phase 2: Delete runtime module `status.json` logic

After Phase 1 is green, delete the module-file logic itself.

#### Delete path construction and writer logic

Files:

- `skills/nova/pipeline/core/paths.ts`
- `skills/nova/pipeline/services/status-store.ts`

Delete:

- `statusPath()`
- all file-backed module status write logic
- comments describing module status as file-backed state

#### Delete legacy module compat readers and projection policy

Files:

- `skills/nova/pipeline/services/status-store-compat/module-projection.ts`
- `skills/nova/pipeline/services/status-store-compat/common.ts`
- `skills/nova/pipeline/services/status-store.ts`

Delete:

- `readModuleStatusJson()`
- `projectModuleLegacyStatusIntoReadModel()`
- `resolveLegacyModuleStatusProjectionPolicy()`
- module `legacy_status_*` evidence fields
- module `status_json_*` role/authority/drift fields
- module migration-bootstrap handling for `status.json`

Keep:

- gate compat logic only

#### Delete module `status.json` drift/adjudication wording

Files:

- `skills/nova/pipeline/services/completion-adjudicator.ts`
- `skills/nova/pipeline/services/truth-drift.ts`
- `skills/nova/pipeline/runners/module-runner/buster-phase.ts`
- `skills/nova/pipeline/runners/module-runner/buster-phase/poll-failure.ts`
- `skills/nova/pipeline/services/failures/classification.ts`

Delete or rewrite:

- default local authority source strings of `'status.json'`
- module drift artifact field `status_path`
- log lines comparing Redis to `status.json`
- failure reasons like `status.json corrupted`
- operator guidance telling people to inspect `status.json`

Replace with:

- `lifecycle_read_model`
- `module_state`
- `lifecycle snapshot unavailable`
- `local module state unavailable/corrupt` only if there is a real remaining typed surface

#### Remove `status.json` from forge diff ignore rules

Files:

- `skills/nova/pipeline/services/agent-observability-forge-completion.ts`

Plan:

- Remove module `status.json` from ignored control paths.
- Keep ignoring `forge-completion.json` and `.swarm/` runtime paths.

Why:

- Once the file is gone, keeping it in control-path logic is dead policy.

### Phase 3: Clean prompts, docs, and conventions

Files to update:

- `skills/nova/pipeline/prompts/shared.ts`
- `skills/buster/CONVENTIONS.md`
- `skills/buster/README.md`
- `docs/SKILLS.md`
- `docs/PIPELINE-CONFIG-REFERENCE.md`
- `tests/verification/behavior-verification.md`
- any active docs still describing module `status.json` as readable or writable state

Rewrite policy language from:

- do not edit `status.json`

to:

- do not mutate pipeline lifecycle state or orchestrator-owned control artifacts

## Runtime File Kill List

These are the primary runtime files that should change in the removal PR:

- `skills/nova/pipeline/services/status-store.ts`
- `skills/nova/pipeline/core/paths.ts`
- `skills/nova/pipeline/services/status-store-compat/module-projection.ts`
- `skills/nova/pipeline/services/status-store-compat/common.ts`
- `skills/nova/pipeline/services/completion-adjudicator.ts`
- `skills/nova/pipeline/services/truth-drift.ts`
- `skills/nova/pipeline/services/agent-observability-forge-completion.ts`
- `skills/nova/pipeline/services/summary.ts`
- `skills/nova/pipeline/tools/project-summary.ts`
- `skills/nova/pipeline/runners/module-runner-shared.ts`
- `skills/nova/pipeline/runners/module-runner/buster-phase.ts`
- `skills/nova/pipeline/runners/module-runner/buster-phase/poll-failure.ts`
- `skills/nova/pipeline/services/failures/classification.ts`
- `skills/nova/pipeline/prompts/shared.ts`
- `skills/nova/pipeline/prompts/forge.ts`
- `skills/nova/pipeline/prompts/buster-module.ts`

## Tests To Change

### Unit and slice tests

- `skills/nova/pipeline/services/agent-observability-forge-completion.test.mjs`
- `skills/nova/pipeline/runners/module-runner-worker-lifecycle.test.mjs`
- `skills/nova/pipeline/prompts/forge-prompts.test.mjs`
- any direct `saveStatus()` or prompt-surface unit tests that assert `status.json` wording

### Contract verification

- `tests/verification/contracts/check-status-store-slice-surface.mjs`
- `tests/verification/contracts/check-telemetry-contract.mjs`
- `tests/verification/contracts/check-agent-observability-forge-completion-surface.mjs`
- `tests/verification/contracts/check-session-authority-slice-surface.mjs`
- `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs`

Expected changes:

- remove assertions that `saveStatus()` is a `status.json` writer
- remove fixtures that write module `status.json`
- rename local authority expectations from `status.json` to lifecycle/read-model authority
- update prompt/conventions assertions to generic lifecycle wording

### Behavior verification

- `tests/verification/behavior/areas/lifecycle-state-surface.mjs`
- `tests/verification/behavior/areas/polling.mjs`
- `tests/verification/behavior/areas/foundations.mjs`
- `tests/verification/behavior/areas/summaries.mjs`
- `tests/verification/behavior/areas/telemetry.mjs`
- `tests/verification/behavior/areas/module-failures.mjs`
- `tests/verification/behavior/areas/many-module-soak.mjs`
- `tests/verification/behavior/areas/repo-docs.mjs`

Expected changes:

- replace seeded `status.json` fixtures with lifecycle/read-model fixtures
- replace raw file reads with `loadStatus()` or direct lifecycle read-model inspection
- update docs assertions that still mention the file

## Recommended PR Order

1. Make `saveStatus()` lifecycle-only and keep callers stable.
2. Move `project-summary.ts` and summary/operator messaging off module `status.json`.
3. Remove `statusPath()` and all prompt/artifact-ref path exposure.
4. Delete module compat reader/projection code.
5. Delete module-specific `status.json` wording from drift, polling, and failure diagnostics.
6. Rewrite tests and active docs.
7. Add a final grep guard that module runtime source no longer contains `status.json`.

## Verification Checklist

- `loadStatus()` still returns correct lifecycle-backed module state for pass, fail, blocked, rate-limited, and retry flows.
- `validation`, `cost`, and `fail_summaries` still survive normal runtime transitions without any file write.
- project summary still reports module attempts, durations, summaries, and failure patterns correctly.
- forge diff classification still ignores control/runtime artifacts without relying on `status.json`.
- no runtime source under `skills/nova/pipeline` contains module `status.json` references after the delete pass, except intentional gate `gate-status.json` surfaces.
- verification suites no longer seed or assert module `status.json`.

## Exit Condition

This effort is done when all of the following are true:

- module `status.json` is never written
- module `status.json` is never read
- module `status.json` paths are never constructed
- module prompts/docs no longer mention it
- summaries and telemetry no longer depend on it
- tests no longer seed it
- lifecycle/read-model state fully covers the operational data that mattered
