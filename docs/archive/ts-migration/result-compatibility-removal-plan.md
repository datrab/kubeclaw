# Result Compatibility Projection Removal Plan

## Goal

Remove the typed result compatibility projection layer now that the repository no longer keeps JavaScript source files.

The target state is:

- Pipeline, gate, validator, and worker execution paths use typed result contracts only.
- Runtime control flow reads typed fields such as `nextAction`, `outcome`, `issueType`, `diagnostics`, `correlation`, `remediation`, and `wait`.
- Process exit codes are derived from typed pipeline step outcomes, not from projected `{ exit, status, reason }` objects.
- Gate adapters no longer expose `projectCompatibilityResult`.
- Module workers no longer project typed control results back into `{ ok, status, poll_result }` envelopes.
- `skills/nova/pipeline/services/compatibility-authority.ts` is deleted at the end of the refactor.

This plan does not remove repo-local TypeScript path shims under `skills/nova/pipeline/...` or `skills/buster/pipeline/...`. Those are packaging/runtime import surfaces, not result compatibility projections.

## Blast Radius

Runtime blast radius is limited to the Nova pipeline execution layer:

- Module execution: Forge worker, Buster worker, module terminal result building, retries, and single-module runs.
- Gate execution: review, approval, Buster, generic gate runner, remediable gate loop, and waitable gate loop.
- Pipeline terminal handling: halt/continue decisions, process exit code calculation, operator alerts, summaries, and escalation telemetry.
- Contract validation: typed gate/worker/validator/step result validators.
- Verification: contract tests that currently assert compatibility helpers exist must be inverted to assert typed-only behavior.
- Documentation: migration docs, implementation maps, and fallback ledger entries that currently describe compatibility projections as retained.

External compatibility blast radius:

- Existing plugins or test harnesses that return old result shapes like `{ exit, status }` for gates or `{ ok, poll_result, status }` for workers will fail typed contract validation.
- Built-in worker/gate adapters must be migrated first so the built-in pipeline remains green before making the contract strict.
- Persisted historical status files may still contain old fields. This refactor should not require rewriting historical files, but runtime authority must not depend on those fields.

Non-goals:

- Do not remove stable runtime file paths such as `/app/skills/pipeline.ts`, `/app/skills/buster-pipeline.ts`, or `/app/skills/pipeline/tools/redis.ts`.
- Do not remove common helper shims that re-export `skills/common/pipeline/...`.
- Do not remove status-store read models unless a specific old result projection is the only reason they exist.

## Phase 1: Worker Results Become Typed-Only

### `skills/nova/pipeline/services/contracts/worker-control-result.ts`

Change:

- Delete `mapWorkerBackendResultToControl`.
- Delete `projectTypedWorkerCompatibilityResult`.
- Delete `projectModuleForgeWorkerCompatibilityResult`.
- Delete `projectModuleBusterWorkerCompatibilityResult`.
- Remove the import from `../compatibility-authority.ts`.
- Replace compatibility-authority validation with typed schema validation:
  - reject unknown top-level authority fields through an explicit allowed-field check, or
  - rely on `schemaVersion`, `producerKind`, `producerType`, and `nextAction` plus typed diagnostics shape.

Why:

- This file should own typed worker control contracts only.
- Mapping `{ ok, reason, poll_result, status }` into typed control results belongs at the backend edge while backend APIs still exist. After this phase, built-in workers should produce typed control results directly.

Delete:

- `WORKER_CONTROL_RESULT_MAPPINGS` if no longer needed after worker builders become explicit.
- `workerResultPassed`.
- `normalizeWorkerReason`.
- `mapWorkerBackendResultToControl`.
- `projectTypedWorkerCompatibilityResult`.
- `projectModuleForgeWorkerCompatibilityResult`.
- `projectModuleBusterWorkerCompatibilityResult`.

### `skills/nova/pipeline/agents/module-worker-control-results.ts`

Change:

- Stop accepting a loose legacy backend result object as the primary input.
- Replace `buildModuleForgeWorkerControlResult(config, workerInput, result, opts)` with typed constructors that accept explicit outcome fields:
  - `nextAction`
  - `issueType`
  - `summary`
  - `reason`
  - `dispatch`
  - `finalStatus`
  - `pollResult` as typed diagnostic metadata only, if still needed
- Replace `buildModuleBusterWorkerControlResult` similarly.
- Make failure classification explicit. Buster failures should require typed `failureClass` before this helper is called.

Why:

- This file currently adapts old worker backend facts into typed results. The new role should be to build typed worker results from explicit worker decisions.

Delete:

- Import of `mapWorkerBackendResultToControl`.
- Reads of `result.ok` and `result.poll_result.ok` as authority.
- Loose result-shape inference for pass/fail.

### `skills/nova/pipeline/agents/module-workers.ts`

Change:

- Return typed worker control results directly from Forge and Buster worker execution.
- Replace internal calls that build legacy-shaped temporary objects with explicit typed constructor inputs.
- Preserve diagnostic metadata for poll output, final status, gateway/session identity, stream log path, and dispatch id.
- Ensure `onFinalized` payloads remain typed or clearly diagnostic-only.

Why:

- Built-in module workers are the main source of old `{ ok, poll_result, status }` envelopes. They must be migrated before the surrounding module runner can drop projections.

Delete:

- Temporary return objects that use `ok`, `poll_result`, and loose `status` as authority.
- Any reliance on `pollResult.ok` outside explicit typed outcome mapping.

### `skills/nova/pipeline/agents/orchestration.ts`

Change:

- Remove re-exports of `projectModuleForgeWorkerCompatibilityResult` and `projectModuleBusterWorkerCompatibilityResult`.
- Keep exports for typed worker builders and built-in worker implementations.

Why:

- Orchestration should not expose compatibility projection helpers after worker phases are typed-only.

Delete:

- Compatibility projection re-export block from `../services/contracts/worker-control-result.ts`.

### `skills/nova/pipeline/runners/module-runner-forge.ts`

Change:

- Stop calling `projectModuleForgeWorkerCompatibilityResult`.
- Keep `controlResult` as the phase result authority.
- Update downstream phase logic to read typed fields:
  - `controlResult.nextAction`
  - `controlResult.issueType`
  - `controlResult.diagnostics.summary`
  - `controlResult.diagnostics.metadata`
  - `controlResult.diagnostics.typed.worker`
- Convert the returned module phase result through `buildModuleStepResult` using typed control data only.

Why:

- This file currently normalizes a typed worker control result, then immediately converts it back to a legacy worker envelope.

Delete:

- Import of `projectModuleForgeWorkerCompatibilityResult`.
- Assignment of `forgeWorkerResult` from the projection helper.
- Any branch that treats projected `ok`, `poll_result`, or `status` as authority.

### `skills/nova/pipeline/runners/module-runner-buster-worker.ts`

Change:

- Stop calling `projectModuleBusterWorkerCompatibilityResult`.
- Use typed Buster worker control result fields directly.
- Carry `dispatch_id`, `failure_class`, `session_key`, and final status through diagnostics metadata.

Why:

- This is the Buster equivalent of the Forge projection site.

Delete:

- Import of `projectModuleBusterWorkerCompatibilityResult`.
- Assignment of `busterWorkerResult` from the projection helper.
- Any phase authority checks based on projected `ok`, `poll_result`, or `status`.

### `skills/nova/pipeline/runners/module-runner-shared.ts`

Change:

- Make `buildModuleStepResult` accept only typed `PipelineStepResult` or typed worker/control result inputs.
- Remove fallback conversion from loose compatibility result objects.
- Build module step correlation from typed diagnostics/correlation, not from legacy result aliases.

Why:

- This is the shared module terminal bridge. It currently keeps old module result envelopes alive by converting them with `buildPipelineStepResultFromCompatibilityResult`.

Delete:

- Imports of `attachPipelineStepCompatibilityProjection` and `buildPipelineStepResultFromCompatibilityResult`.
- Fallback branch that treats arbitrary objects as compatibility results.
- Reads of `compatibilityResult.status`, `compatibilityResult.phase`, `compatibilityResult.module_dir`, and similar legacy alias fields as authority.

## Phase 2: Pipeline Step Results Become Typed-Only

### `skills/nova/pipeline/services/contracts/pipeline-step-result.ts`

Change:

- Remove `compatibilityResult` from `buildPipelineStepResult` and `buildPipelineStepResultFromControlResult`.
- Replace the `compatibility` field with a typed terminal/process field, for example:
  - `terminal.exitCode`
  - `terminal.exitLabel`
- Keep `pipelineStepExitCodeForOutcome`, `pipelineStepExitLabelForCode`, `pipelineStepOutcomeForExitCode` only if they are still useful.
- Update `pipelineStepExitCode(result)` and `pipelineStepExitLabel(result)` to derive from `result.outcome` or `result.terminal`, not `result.compatibility`.
- Keep strict validation that typed `nextAction` and `outcome` are coherent.

Why:

- This is the core projection owner. Removing projections here prevents old `{ exit, status, reason }` fields from being attached to typed step results.

Delete:

- Import of `findCompatibilityAuthorityKeys` and `stripCompatibilityAuthority`.
- `LEGACY_RESULT_AUTHORITY_KEYS`.
- `findLegacyResultAuthorityKeys`.
- `buildPipelineStepResultAuthorityPolicy`.
- `normalizeCompatibility`.
- `buildPipelineStepResultFromCompatibilityResult`.
- `projectPipelineStepCompatibilityResult`.
- `attachPipelineStepCompatibilityProjection`.
- `compatibility` field construction and validation.

### `skills/nova/pipeline/runners/pipeline-runner-terminal.ts`

Change:

- Update `normalizeStepResultForPipeline` to return:
  - `stepResult`
  - `exitCode`
  - `exitLabel`
  - `shouldContinue`
- Remove `compatibilityProjection`.
- Build halt/operator payloads from typed step result diagnostics and correlation.
- Keep process exit code derivation, but derive only from typed step outcome.

Why:

- This file fans projection data into pipeline halted events, summaries, operator alerts, and escalation payloads.

Delete:

- Import of `projectPipelineStepCompatibilityResult`.
- Use of `normalizedResult.compatibilityProjection`.
- Projection spread into `buildResultWithStepCorrelation`.
- Compatibility-shaped invalid result payloads.

### `skills/nova/pipeline/runners/pipeline-runner-state-machine.ts`

Change:

- Keep using `normalizeStepResultForPipeline`, but consume only `shouldContinue` and typed step result.
- Ensure halt path receives typed result without attached projection fields.

Why:

- This is the main loop decision point. It should decide from typed `nextAction`, not from projected exit/status fields.

Delete:

- No file-level deletion expected. Remove any compatibility assumptions introduced by the terminal helper change.

### `skills/nova/pipeline/runners/pipeline-runner-start.ts`

Change:

- Remove `resultProjection` usage in single-module execution.
- Build single-module halted/completed lifecycle events from typed step result fields.
- Resolve attempt/dispatch/gateway/session from typed correlation/diagnostics metadata.

Why:

- Single-module runs currently still use projected result fields for lifecycle event payloads.

Delete:

- `const resultProjection = normalizedResult.compatibilityProjection || {};`.
- Projection spread into result correlation payloads.

### `skills/nova/pipeline/runners/pipeline-runner-shared.ts`

Change:

- Replace `buildBlockedModuleResult` compatibility projection with a typed `PipelineStepResult`.
- Put blocked metadata under `diagnostics.metadata` and correlation under `correlation`.

Why:

- Blocked modules still construct a compatibility projection and attach it to a typed result.

Delete:

- Import/use of `attachPipelineStepCompatibilityProjection`.
- Local `compatibilityProjection` object as an output shape.
- `compatibilityResult` passed to `buildPipelineStepResult`.

### `skills/nova/pipeline/runners/pipeline-runner-scheduling.ts`

Change:

- Remove `attachPipelineStepCompatibilityProjection` from validator/generator step results.
- Remove `compatibilityResult` payloads passed into `buildPipelineStepResult` and `buildPipelineStepResultFromControlResult`.
- Put validator/generator identity and reason fields into typed correlation and diagnostics metadata.

Why:

- Scheduled validator/generator steps still attach projection fields for terminal compatibility.

Delete:

- Import/use of `attachPipelineStepCompatibilityProjection`.
- `compatibilityResult` arguments.

## Phase 3: Gate Results Become Typed-Only

### `skills/nova/pipeline/services/contracts/gate-control-result.ts`

Change:

- Delete compatibility mapping and projection helpers.
- Keep typed gate result builders, coercion, normalization, action validation, and remediation result validation.
- Replace compatibility-authority validation with strict typed schema validation or remove it if unknown legacy fields are no longer accepted anywhere.

Why:

- Gate compatibility currently exists in both directions:
  - old `{ exit, status }` to typed gate control
  - typed gate control back to old `{ exit, status }`

Delete:

- `GATE_COMPATIBILITY_CONTROL_MAPPINGS`.
- `mapGateCompatibilityResultToControl`.
- `projectTypedGateCompatibilityResult`.
- `projectReviewGateCompatibilityResult`.
- `projectBusterGateCompatibilityResult`.
- `projectApprovalGateCompatibilityResult`.
- Import from `../compatibility-authority.ts`.

### `skills/nova/pipeline/runners/gate-runner.ts`

Change:

- Remove `projectCompatibilityResult` from the required gate adapter shape.
- Stop building `compatibilityProjection` in standard, remediable, and waitable paths.
- `buildGateStepResultFromControl` should pass only typed control result, remediation, wait, diagnostics, and correlation into `buildPipelineStepResultFromControlResult`.
- Runtime error handling should build typed error step results without `{ exit, reason, gate }` compatibility payloads.

Why:

- This is the generic gate dispatch layer and currently requires every gate adapter to preserve compatibility output.

Delete:

- Import/use of `attachPipelineStepCompatibilityProjection`.
- `projectGateStepResult`.
- `compatibilityProjection` parameter in `buildGateStepResultFromControl`.
- Adapter validation for `projectCompatibilityResult`.
- Calls to `adapter.projectCompatibilityResult`.

### `skills/nova/pipeline/runners/remediable-gate-engine.ts`

Change:

- Remove `projectCompatibilityResult` from remediation controller validation and loop inputs.
- Return only `{ controlResult }` from `runRemediableGateControlLoopResult` and `runScheduledRemediableGate`.
- Keep typed remediation controller behavior.

Why:

- Remediable gates currently project every terminal loop result into a legacy gate result.

Delete:

- `finalizeGateCompatibilityResult`.
- `projectCompatibilityResult` parameter/default.
- `compatibilityProjection` returned from loop functions.

### `skills/nova/pipeline/runners/waitable-gate-engine.ts`

Change:

- Remove `projectCompatibilityResult` from waitable gate control loop inputs.
- Return only typed `controlResult`.
- Remove dependency on `finalizeGateCompatibilityResult`.

Why:

- Approval/waitable gates currently use compatibility projection after signal resolution.

Delete:

- Import of `finalizeGateCompatibilityResult`.
- `projectCompatibilityResult` parameters.
- `compatibilityProjection` return fields.

### `skills/nova/pipeline/services/remediation-handoff.ts`

Change:

- Remove `projectCompatibilityResult` from remediation controller validation and returned controller object.
- Keep typed remediation fields:
  - `performFix`
  - `evaluateGate`
  - `buildExhaustedControlResult`

Why:

- This service currently enforces the old projection callback as part of remediation controller shape.

Delete:

- `projectCompatibilityResult` validation and passthrough.

### `skills/nova/pipeline/runners/review-gate-control.ts`

Change:

- Stop importing `mapGateCompatibilityResultToControl`.
- Build typed review control result directly from review outcome facts:
  - pass
  - rate limited
  - needs Nova/code issue
  - environment/error
- Prefer explicit typed review outcome fields over `exit` code checks.

Why:

- This file currently maps old review `{ exit }` values into typed action/outcome.

Delete:

- Import/use of `mapGateCompatibilityResultToControl`.
- Any summary/action branch where `result.exit` is the primary authority after the runner can provide typed outcome facts.

### `skills/nova/pipeline/runners/buster-gate-control.ts`

Change:

- Stop importing `mapGateCompatibilityResultToControl`.
- Require explicit `failure_class` or typed outcome class before building the typed result.
- Keep issue extraction if it reads actual Buster evidence, but do not infer control action from old exit codes.

Why:

- Buster gate control still maps old exit/failure-class combinations.

Delete:

- Import/use of `mapGateCompatibilityResultToControl`.
- Exit-code-based pass/fail authority.
- Reason-text failure-class inference once Buster terminal paths provide explicit failure class.

### `skills/nova/pipeline/runners/approval-gate-control.ts`

Change:

- Stop importing and exporting `projectApprovalGateCompatibilityResult`.
- Stop importing `mapGateCompatibilityResultToControl`.
- Build typed approval control result directly from approval state/outcome.

Why:

- Approval gates are waitable typed gates; keeping an old `{ exit, status, continued }` projection only preserves legacy terminal shape.

Delete:

- `export { projectApprovalGateCompatibilityResult }`.
- Import/use of `mapGateCompatibilityResultToControl`.
- Exit/status compatibility mapping.

### `skills/nova/pipeline/runners/review-gate-runner.ts`

Change:

- Remove `projectReviewGateCompatibilityResult` import and export.
- Update `getReviewGateControlAdapter()` to omit `projectCompatibilityResult`.
- Ensure `runReviewGateStage` returns typed review control results only.

Why:

- Built-in registry currently exposes review compatibility projection through the adapter.

Delete:

- `projectReviewGateCompatibilityResult` references.
- `projectCompatibilityResult` adapter property.

### `skills/nova/pipeline/runners/buster-gate-runner.ts`

Change:

- Remove `projectBusterGateCompatibilityResult` import and export.
- Update `getBusterGateControlAdapter()` to omit `projectCompatibilityResult`.
- Ensure Buster gate stage functions return typed Buster gate control results only.

Why:

- Built-in Buster gate keeps legacy gate output projection alive through the adapter contract.

Delete:

- `projectBusterGateCompatibilityResult` references.
- `projectCompatibilityResult` adapter property.

### `skills/nova/pipeline/runners/approval-gate-runner.ts`

Change:

- Remove `projectApprovalGateCompatibilityResult` import/export usage.
- Update `getApprovalGateControlAdapter()` to omit `projectCompatibilityResult`.
- Ensure waitable approval flow returns typed control results only.

Why:

- Approval gate runtime should be waitable typed control, not typed control plus legacy projection.

Delete:

- `projectApprovalGateCompatibilityResult` references.
- `projectCompatibilityResult` adapter property.

### `skills/nova/pipeline/core/registry/builtins.ts`

Change:

- No direct logic change expected if the gate adapter objects are updated in the runner files.
- Re-run registry contract checks because built-in gate adapter shape changes.

Why:

- Builtins are the registry source that wires the changed gate adapters into runtime.

Delete:

- No direct deletion expected.

## Phase 4: Delete `compatibility-authority.ts`

### `skills/nova/pipeline/services/contracts/validator-control-result.ts`

Change:

- Remove import/use of `findCompatibilityAuthorityKeys`.
- Replace with strict typed validator result validation if needed.

Why:

- Once compatibility fields are not accepted anywhere, this file should not depend on compatibility-specific rejection helpers.

Delete:

- Compatibility-authority import.
- Compatibility-authority error branch.

### `skills/nova/pipeline/services/contracts/gate-control-result.ts`

Change:

- Remove remaining compatibility-authority import/use.

Why:

- Gate result validation should be typed-schema validation only.

Delete:

- Compatibility-authority import.
- Compatibility-authority error branch.

### `skills/nova/pipeline/services/contracts/worker-control-result.ts`

Change:

- Remove remaining compatibility-authority import/use.

Why:

- Worker result validation should be typed-schema validation only.

Delete:

- Compatibility-authority import.
- Compatibility-authority error branch.

### `skills/nova/pipeline/services/contracts/pipeline-step-result.ts`

Change:

- Remove remaining compatibility-authority import/use.

Why:

- Pipeline step results should not sanitize compatibility projections if projections no longer exist.

Delete:

- Compatibility-authority import.
- Calls to `stripCompatibilityAuthority`.
- Calls to `findCompatibilityAuthorityKeys`.

### `skills/nova/pipeline/services/compatibility-authority.ts`

Change:

- Delete the file after all imports are gone.

Why:

- Its only responsibility is detecting/stripping compatibility authority keys. After the projection layer is removed and typed validators reject old shapes directly, this helper becomes obsolete.

Delete:

- Entire file.

## Phase 5: Verification and Documentation

### Contract tests to invert

Change these from "compatibility helpers must exist" to "compatibility helpers must be absent and typed-only behavior works":

- `tests/verification/contracts/check-pipeline-step-result-surface.mjs`
- `tests/verification/contracts/check-gate-control-result-surface.mjs`
- `tests/verification/contracts/check-worker-control-result-surface.mjs`
- `tests/verification/contracts/check-validator-control-result-surface.mjs`
- `tests/verification/contracts/check-stage-envelope-primitives-surface.mjs`
- `tests/verification/contracts/check-remediation-handoff-surface.mjs`
- `tests/verification/contracts/check-pipeline-runner-slice-surface.mjs`
- `tests/verification/contracts/check-module-runner-slice-surface.mjs`

Why:

- Several current contracts intentionally lock in projection helpers. Those need to become guardrails against reintroducing them.

Delete:

- Assertions requiring `projectPipelineStepCompatibilityResult`, `attachPipelineStepCompatibilityProjection`, `buildPipelineStepResultFromCompatibilityResult`, `mapGateCompatibilityResultToControl`, `project*GateCompatibilityResult`, `mapWorkerBackendResultToControl`, and `project*WorkerCompatibilityResult`.
- Test fixtures that use `compatibilityResult` as accepted input.

### Behavior tests to update

Likely affected behavior areas:

- `tests/verification/behavior/areas/gates.mjs`
- `tests/verification/behavior/areas/governance.mjs`
- `tests/verification/behavior/areas/module-failures.mjs`
- `tests/verification/behavior/areas/many-module-soak.mjs`
- `tests/verification/behavior/areas/resume-idempotence.mjs`
- `tests/verification/behavior/areas/pipeline.mjs`
- `tests/verification/behavior/areas/stops.mjs`
- `tests/verification/behavior/areas/telemetry.mjs`
- `tests/verification/behavior/areas/foundations.mjs`
- `tests/verification/behavior/areas/runtime-surface.mjs`

Change:

- Replace expectations on top-level `result.exit`, `result.status`, `result.ok`, or `poll_result` when those refer to pipeline/gate/worker control authority.
- Assert typed fields:
  - `stepResult.nextAction`
  - `stepResult.outcome`
  - `stepResult.issueType`
  - `diagnostics.summary`
  - `diagnostics.metadata`
  - `correlation`
  - derived process exit code where process exit is actually the tested behavior.

Why:

- Behavior tests should validate user-visible behavior and typed runtime authority, not legacy envelope fields.

Delete:

- Fixtures that pass `compatibilityResult` to typed result builders.
- Assertions that old projection fields are attached to typed results.

### Documentation to update

Change:

- `docs/ts-migration/fallback-ledger.md`
- `docs/ts-migration/authority-registry.md`
- `docs/ts-migration/import-call-graph.md`
- `docs/ts-migration/architecture-map.md`
- `docs/pipeline/implementation-map/data-schemas.md`
- `docs/pipeline/implementation-map/env-vars-and-inputs.md`
- `docs/pipeline/implementation-map/logic-and-algorithms-map.md`

Why:

- These docs currently describe compatibility projections as retained external adapters.

Delete:

- Entries that say the result compatibility projections are kept.
- References to `compatibility-authority.ts` as an active owner after the file is deleted.

## Recommended Execution Order

1. Worker path:
   - `worker-control-result.ts`
   - `module-worker-control-results.ts`
   - `module-workers.ts`
   - `module-runner-forge.ts`
   - `module-runner-buster-worker.ts`
   - `module-runner-shared.ts`
   - focused worker/module contracts

2. Pipeline step path:
   - `pipeline-step-result.ts`
   - `pipeline-runner-terminal.ts`
   - `pipeline-runner-state-machine.ts`
   - `pipeline-runner-start.ts`
   - `pipeline-runner-shared.ts`
   - `pipeline-runner-scheduling.ts`
   - focused step/terminal contracts

3. Gate path:
   - `gate-control-result.ts`
   - `gate-runner.ts`
   - `remediable-gate-engine.ts`
   - `waitable-gate-engine.ts`
   - `remediation-handoff.ts`
   - review/Buster/approval gate controls and runners
   - focused gate/remediation contracts

4. Delete compatibility authority:
   - remove remaining imports
   - delete `compatibility-authority.ts`
   - update validator/contract tests

5. Full verification:
   - `./scripts/typecheck-ts-migration.sh`
   - focused contracts:
     - `node tests/verification/contracts/check-worker-control-result-surface.mjs`
     - `node tests/verification/contracts/check-pipeline-step-result-surface.mjs`
     - `node tests/verification/contracts/check-gate-control-result-surface.mjs`
     - `node tests/verification/contracts/check-remediation-handoff-surface.mjs`
   - `./tests/verification/run-fast-verification.sh`
   - behavior areas touched by updated fixtures

## Final Deletion Checklist

Delete functions/helpers:

- `mapWorkerBackendResultToControl`
- `projectTypedWorkerCompatibilityResult`
- `projectModuleForgeWorkerCompatibilityResult`
- `projectModuleBusterWorkerCompatibilityResult`
- `mapGateCompatibilityResultToControl`
- `projectTypedGateCompatibilityResult`
- `projectReviewGateCompatibilityResult`
- `projectBusterGateCompatibilityResult`
- `projectApprovalGateCompatibilityResult`
- `buildPipelineStepResultAuthorityPolicy`
- `buildPipelineStepResultFromCompatibilityResult`
- `projectPipelineStepCompatibilityResult`
- `attachPipelineStepCompatibilityProjection`
- `normalizeCompatibility`
- `finalizeGateCompatibilityResult`

Delete callback/adapter fields:

- `gateControl.projectCompatibilityResult`
- remediation controller `projectCompatibilityResult`
- waitable gate `projectCompatibilityResult`

Delete file:

- `skills/nova/pipeline/services/compatibility-authority.ts`

Delete or rewrite tests that require:

- `compatibilityResult` accepted by typed builders
- top-level projected `exit`
- top-level projected `status`
- top-level projected `reason`
- worker projected `ok`
- worker projected `poll_result`

## Completion Criteria

The refactor is complete when:

- `rg "CompatibilityResult|CompatibilityProjection|compatibilityProjection|compatibilityResult|projectCompatibilityResult|mapGateCompatibilityResultToControl|mapWorkerBackendResultToControl|compatibility-authority" skills/nova/pipeline` returns no runtime projection references.
- No source imports `skills/nova/pipeline/services/compatibility-authority.ts`.
- `git ls-files 'skills/nova/pipeline/services/compatibility-authority.ts'` returns nothing.
- Contract tests assert typed-only boundaries.
- Fast verification passes.
