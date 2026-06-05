# Result Compatibility Removal Changelog

## Phase 1: Worker Results Typed-Only

Status: complete

Summary:

- Removed worker compatibility projection helpers from the typed worker contract.
- Converted built-in Forge and Buster module workers to produce typed worker control results directly.
- Updated module runner paths to consume typed worker control fields and treat poll output as diagnostic metadata only.
- Inverted the worker control contract verification so compatibility helpers are forbidden instead of required.

Changed files:

- `skills/nova/pipeline/services/contracts/worker-control-result.ts`
  - Deleted `WORKER_CONTROL_RESULT_MAPPINGS`.
  - Deleted `mapWorkerBackendResultToControl`.
  - Deleted `projectTypedWorkerCompatibilityResult`.
  - Deleted `projectModuleForgeWorkerCompatibilityResult`.
  - Deleted `projectModuleBusterWorkerCompatibilityResult`.
  - Removed the dependency on `../compatibility-authority.ts`.
  - Preserved strict rejection of legacy worker authority fields through local typed validation.
- `skills/nova/pipeline/agents/module-worker-control-results.ts`
  - Replaced loose backend-result mapping with explicit typed worker control builder inputs.
  - Stopped using `result.ok` and `poll_result.ok` as worker authority.
  - Kept poll/final status/session details as diagnostics metadata.
- `skills/nova/pipeline/agents/module-workers.ts`
  - Added explicit Forge/Buster decision mapping before constructing typed worker controls.
  - Moved poll evidence into diagnostics metadata.
  - Preserved Buster timeout/failure classification as typed fields.
- `skills/nova/pipeline/runners/module-runner-forge.ts`
  - Removed Forge worker compatibility projection usage.
  - Uses `forgeWorkerControlResult.nextAction`, diagnostics, and typed metadata as authority.
- `skills/nova/pipeline/runners/module-runner-buster-worker.ts`
  - Removed Buster worker compatibility projection usage.
  - Returns typed Buster worker control results directly.
- `skills/nova/pipeline/runners/module-runner/buster-phase.ts`
  - Reads typed Buster worker control diagnostics metadata.
  - Keeps Buster polling evidence semantics scoped to diagnostics and phase handling.
- `skills/nova/pipeline/runners/module-runner/buster-phase/poll-failure.ts`
  - Updated failure helpers to read typed Buster worker control metadata.
- `skills/nova/pipeline/runners/module-runner/buster-phase/spawn-failure.ts`
  - Updated spawn failure helpers to read typed Buster worker control metadata.
  - Removed unused result alias helpers.
- `skills/nova/pipeline/agents/orchestration.ts`
  - Removed worker compatibility projection re-exports.
- `tests/verification/contracts/check-worker-control-result-surface.mjs`
  - Replaced compatibility-helper assertions with typed-only assertions.
  - Added guards that worker projection helpers remain absent.

Deleted compatibility surface:

- `WORKER_CONTROL_RESULT_MAPPINGS`
- `mapWorkerBackendResultToControl`
- `projectTypedWorkerCompatibilityResult`
- `projectModuleForgeWorkerCompatibilityResult`
- `projectModuleBusterWorkerCompatibilityResult`

Verification:

- `./scripts/typecheck-ts-migration.sh`
- `node tests/verification/contracts/check-worker-control-result-surface.mjs`
- `node tests/verification/contracts/check-module-runner-slice-surface.mjs`
- `./tests/verification/run-fast-verification.sh`
- `git diff --check`

Residual compatibility intentionally left for later phases:

- Pipeline step compatibility projections remain for Phase 2.
- Gate compatibility projections remain for Phase 3.
- `skills/nova/pipeline/services/compatibility-authority.ts` remains until Phase 4.

## Phase 2: Pipeline Step Results Typed-Only

Status: complete

Summary:

- Removed pipeline step compatibility projection construction from the typed step result contract.
- Replaced `result.compatibility.exitCode` with typed `result.terminal.exitCode` and `result.terminal.exitLabel`.
- Removed pipeline step projection helper exports and updated callers to consume typed step results directly.
- Updated terminal halt, single-module, scheduler, module bridge, blocked-module, and gate-step bridge paths to derive process output from typed step fields.
- Inverted the pipeline step contract verification so projection helpers are forbidden.

Changed files:

- `skills/nova/pipeline/services/contracts/pipeline-step-result.ts`
  - Deleted `buildPipelineStepResultAuthorityPolicy`.
  - Deleted `buildPipelineStepResultFromCompatibilityResult`.
  - Deleted `projectPipelineStepCompatibilityResult`.
  - Deleted `attachPipelineStepCompatibilityProjection`.
  - Deleted `normalizeCompatibility`.
  - Removed `compatibilityResult` builder inputs.
  - Removed `compatibility` output construction.
  - Added typed `terminal.exitCode` and `terminal.exitLabel` output.
  - Kept `pipelineStepExitCode`, `pipelineStepExitLabel`, and outcome-to-exit helpers as typed terminal derivation helpers.
- `skills/nova/pipeline/runners/module-runner-shared.ts`
  - Stopped attaching step compatibility projections.
  - Returns typed `PipelineStepResult` unchanged when already typed.
  - Converts remaining module terminal objects into typed step results at the module bridge while downstream module terminal producers are migrated.
- `skills/nova/pipeline/runners/pipeline-runner-terminal.ts`
  - Removed `compatibilityProjection` normalization.
  - Builds halt/operator/escalation payloads from typed step fields and typed rate-limit diagnostics.
- `skills/nova/pipeline/runners/pipeline-runner-start.ts`
  - Removed single-module `resultProjection` usage.
  - Uses typed step correlation and diagnostics for single-module completion payloads.
- `skills/nova/pipeline/runners/pipeline-runner-shared.ts`
  - Replaced blocked-module compatibility projection construction with typed diagnostics metadata and correlation.
- `skills/nova/pipeline/runners/pipeline-runner-scheduling.ts`
  - Removed validator step compatibility projection attachment.
  - Removed `compatibilityResult` inputs to typed step builders.
- `skills/nova/pipeline/runners/gate-runner.ts`
  - Stopped attaching pipeline step compatibility projections at the gate-step bridge.
  - Gate control compatibility removal remains Phase 3, but gate step output is now typed.
- `tests/verification/contracts/check-pipeline-step-result-surface.mjs`
  - Rewritten to require typed terminal fields and forbid pipeline step projection helpers.
- `tests/verification/contracts/check-gate-control-result-surface.mjs`
  - Updated gate-runner expectation so it forbids pipeline step projection attachment.

Deleted compatibility surface:

- `buildPipelineStepResultAuthorityPolicy`
- `buildPipelineStepResultFromCompatibilityResult`
- `projectPipelineStepCompatibilityResult`
- `attachPipelineStepCompatibilityProjection`
- `normalizeCompatibility`
- `compatibilityResult` inputs on pipeline step builders
- `compatibility` projection output on typed pipeline step results

Verification:

- `./scripts/typecheck-ts-migration.sh`
- `node tests/verification/contracts/check-pipeline-step-result-surface.mjs`
- `node tests/verification/contracts/check-pipeline-runner-slice-surface.mjs`
- `node tests/verification/contracts/check-module-runner-slice-surface.mjs`
- `node tests/verification/contracts/check-gate-control-result-surface.mjs`

Residual compatibility intentionally left for later phases:

- Gate control compatibility mappings/projections remain for Phase 3.
- Remediable/waitable gate engines still carry gate compatibility projections until Phase 3.
- `skills/nova/pipeline/services/compatibility-authority.ts` remains until Phase 4.

## Phase 3: Gate Results Typed-Only

Status: complete

Summary:

- Removed gate compatibility mapping and projection helpers from the shared gate control contract.
- Converted built-in review, Buster, and approval gate controls to make explicit typed decisions locally.
- Removed `projectCompatibilityResult` from gate adapters, remediation controllers, remediable loops, and waitable loops.
- Updated gate contract verification to forbid gate compatibility projection symbols.

Changed files:

- `skills/nova/pipeline/services/contracts/gate-control-result.ts`
  - Deleted `GATE_COMPATIBILITY_CONTROL_MAPPINGS`.
  - Deleted `mapGateCompatibilityResultToControl`.
  - Deleted `projectTypedGateCompatibilityResult`.
  - Deleted `projectReviewGateCompatibilityResult`.
  - Deleted `projectBusterGateCompatibilityResult`.
  - Deleted `projectApprovalGateCompatibilityResult`.
  - Removed dependency on `compatibility-authority.ts`.
- `skills/nova/pipeline/runners/review-gate-control.ts`
  - Replaced shared compatibility mapping with explicit review typed decision mapping.
- `skills/nova/pipeline/runners/buster-gate-control.ts`
  - Replaced shared compatibility mapping with explicit Buster typed decision mapping from failure class.
- `skills/nova/pipeline/runners/approval-gate-control.ts`
  - Replaced shared compatibility mapping with explicit approval typed decision mapping from approval status and timeout policy.
  - Removed projection re-export.
- `skills/nova/pipeline/runners/review-gate-runner.ts`
  - Removed review gate projection import/export.
  - Removed remediation controller and adapter `projectCompatibilityResult`.
- `skills/nova/pipeline/runners/buster-gate-runner.ts`
  - Removed Buster gate projection import/export.
  - Removed remediation controller and adapter `projectCompatibilityResult`.
- `skills/nova/pipeline/runners/approval-gate-runner.ts`
  - Removed approval gate projection import/export.
  - Removed waitable adapter `projectCompatibilityResult`.
- `skills/nova/pipeline/runners/gate-runner.ts`
  - Removed adapter requirement for `gateControl.projectCompatibilityResult`.
  - Removed waitable gate projection callback wiring.
- `skills/nova/pipeline/runners/remediable-gate-engine.ts`
  - Deleted `finalizeGateCompatibilityResult`.
  - Remediable loops now return only typed `controlResult`.
- `skills/nova/pipeline/runners/waitable-gate-engine.ts`
  - Removed dependency on `finalizeGateCompatibilityResult`.
  - Waitable loops now return only typed `controlResult`.
- `skills/nova/pipeline/services/remediation-handoff.ts`
  - Removed remediation controller validation/passthrough for `projectCompatibilityResult`.
- `tests/verification/contracts/check-gate-control-result-surface.mjs`
  - Rewritten to assert gate compatibility mappings/projections are absent.
  - Added direct typed-decision checks for review, Buster, and approval gate controls.
- `tests/verification/contracts/check-stage-envelope-primitives-surface.mjs`
  - Updated waitable gate assertion to forbid compatibility projection finalization.

Deleted compatibility surface:

- `GATE_COMPATIBILITY_CONTROL_MAPPINGS`
- `mapGateCompatibilityResultToControl`
- `projectTypedGateCompatibilityResult`
- `projectReviewGateCompatibilityResult`
- `projectBusterGateCompatibilityResult`
- `projectApprovalGateCompatibilityResult`
- gate adapter `projectCompatibilityResult`
- remediation controller `projectCompatibilityResult`
- waitable gate `projectCompatibilityResult`
- `finalizeGateCompatibilityResult`
- remediable/waitable `compatibilityProjection` loop returns

Verification:

- `./scripts/typecheck-ts-migration.sh`
- `node tests/verification/contracts/check-gate-control-result-surface.mjs`
- `node tests/verification/contracts/check-stage-envelope-primitives-surface.mjs`
- `node tests/verification/contracts/check-remediation-handoff-surface.mjs`
- `node tests/verification/contracts/check-pipeline-runner-slice-surface.mjs`
- `git diff --check`

Residual compatibility intentionally left for later phases:

- `skills/nova/pipeline/services/compatibility-authority.ts` remains for validator cleanup in Phase 4.
- Generic status-store compatibility read models are not part of result projection deletion.

## Phase 4: Delete Compatibility Authority Helper

Status: complete

Summary:

- Removed the last runtime import of `compatibility-authority.ts`.
- Deleted `skills/nova/pipeline/services/compatibility-authority.ts`.
- Updated validator contract verification so validator controls validate through typed schema/action rules without the compatibility-authority helper.

Changed files:

- `skills/nova/pipeline/services/contracts/validator-control-result.ts`
  - Removed import/use of `findCompatibilityAuthorityKeys`.
  - Removed the compatibility-authority error branch from typed validator validation.
- `skills/nova/pipeline/services/compatibility-authority.ts`
  - Deleted the obsolete helper file.
- `tests/verification/contracts/check-validator-control-result-surface.mjs`
  - Updated assertions to forbid `findCompatibilityAuthorityKeys`.
  - Removed stale embedded compatibility-authority validator fixture.

Deleted compatibility surface:

- `skills/nova/pipeline/services/compatibility-authority.ts`
- `findCompatibilityAuthorityKeys`
- `stripCompatibilityAuthority`
- validator compatibility-authority rejection branch

Verification:

- `./scripts/typecheck-ts-migration.sh`
- `node tests/verification/contracts/check-validator-control-result-surface.mjs`
- `node tests/verification/contracts/check-worker-control-result-surface.mjs`
- `node tests/verification/contracts/check-gate-control-result-surface.mjs`
- `node tests/verification/contracts/check-pipeline-step-result-surface.mjs`

## Phase 5: Verification and Documentation

Status: complete

Summary:

- Updated migration/implementation documentation that still described result compatibility projections as active runtime owners.
- Tightened final runtime search criteria so removed compatibility projection symbols no longer appear in `skills/nova/pipeline/**/*.ts`.
- Updated the telemetry contract to assert typed `terminal.exitCode` for `runModule` results instead of the removed top-level `exit` projection.
- Ran the full fast verification suite.

Changed files:

- `docs/pipeline/implementation-map/data-schemas.md`
  - Removed `projectCompatibilityResult` from the gate strategy adapter schema.
  - Updated gate step and review control result descriptions to typed-only wording.
- `docs/pipeline/implementation-map/env-vars-and-inputs.md`
  - Removed `projectCompatibilityResult` from gate adapter fields.
- `docs/pipeline/implementation-map/logic-and-algorithms-map.md`
  - Replaced deleted compatibility helper entries with typed decision/terminal derivation entries.
  - Updated verification rows to describe guardrails against reintroducing compatibility projections.
- `docs/ts-migration/architecture-map.md`
  - Updated gate runner, worker bridge, module shared, waitable gate, and typed contract sections.
  - Marked `compatibility-authority.ts` as deleted instead of active.
- `docs/ts-migration/authority-registry.md`
  - Updated ownership entries for gate dispatch, module worker bridges, module shared helpers, waitable gates, typed contracts, and control-result mapping.
  - Removed the active compatibility-authority owner entry.
- `docs/ts-migration/fallback-ledger.md`
  - Marked removed result compatibility surfaces as `DONE`.
  - Reworded typed contract rows to reflect typed-only authority.
- `docs/ts-migration/import-call-graph.md`
  - Removed active references to deleted projection exports/imports.
  - Updated contract module exports and couplings.
- `tests/verification/contracts/check-telemetry-contract.mjs`
  - Updated terminal Buster crash exhaustion assertion from `result.exit` to `result.terminal.exitCode`.
- `skills/nova/pipeline/services/contracts/worker-control-result.ts`
  - Removed remaining camelCase compatibility authority key literals so the final runtime projection-symbol search is clean.

Verification:

- `./scripts/typecheck-ts-migration.sh`
- `./tests/verification/run-fast-verification.sh`
- `rg "CompatibilityResult|CompatibilityProjection|compatibilityProjection|compatibilityResult|projectCompatibilityResult|mapGateCompatibilityResultToControl|mapWorkerBackendResultToControl|compatibility-authority" skills/nova/pipeline --glob '*.ts'`
- `git ls-files 'skills/nova/pipeline/services/compatibility-authority.ts'`
- `git diff --check`

Final state:

- Runtime result compatibility projection helpers are removed.
- `skills/nova/pipeline/services/compatibility-authority.ts` is deleted.
- Contract tests now guard typed-only worker, gate, and pipeline step result surfaces.
- Status-store compatibility read models remain documented separately because they are diagnostic/scheduler read-model surfaces, not typed result projection helpers.
