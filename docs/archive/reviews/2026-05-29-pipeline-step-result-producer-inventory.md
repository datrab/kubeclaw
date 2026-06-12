# Pipeline Step Result Producer Inventory

Date: 2026-05-29

Purpose: identify active `PipelineStepResult` producers and fallback sources before removing compatibility inference.

## Direct Step Result Producers

- `skills/nova/pipeline/services/contracts/pipeline-step-result.ts`
  - Owns `buildPipelineStepResult` and `buildPipelineStepResultFromControlResult`.
  - Current risk: both still allow non-canonical outcome paths. `buildPipelineStepResult` can fall back from `nextAction`; `buildPipelineStepResultFromControlResult` can infer from typed fields, legacy fields, metadata, issue type, and action defaults.

- `skills/nova/pipeline/runners/gate-runner.ts`
  - Projects gate control results into `PipelineStepResult`.
  - Standard gate path uses `buildPipelineStepResultFromControlResult`.
  - Remediation/request-fix path creates a typed step result directly with `PIPELINE_STEP_OUTCOMES.NEEDS_NOVA`.

- `skills/nova/pipeline/runners/pipeline-runner-scheduling.ts`
  - Projects validator control results into `PipelineStepResult`.
  - Request-fix path creates a typed step result directly.
  - Non-request-fix validator path still uses `buildPipelineStepResultFromControlResult`.

- `skills/nova/pipeline/runners/pipeline-runner-shared.ts`
  - Creates typed waiting steps directly.
  - Already supplies explicit waiting outcome.

- `skills/nova/pipeline/runners/pipeline-runner-terminal.ts`
  - Creates terminal pipeline step results directly.
  - Already supplies explicit outcome for the terminal state it builds.

- `skills/nova/pipeline/runners/module-runner.ts`
  - Still converts module attempt results through `buildModuleStepResult`.
  - This is the main terminal-envelope compatibility surface to remove in Phase C.

## Compatibility Fallback Sources

- `pipeline-step-result.ts`
  - `defaultOutcomeForAction` maps action to outcome when no canonical outcome is provided.
  - `inferOutcomeFromControlResult` accepts outcome data from:
    - explicit projection option;
    - typed diagnostics `outcomeClass`;
    - top-level `outcome` / `outcomeClass`;
    - metadata outcome aliases;
    - approval status aliases;
    - `issueType`;
    - final action default.
  - Removal target: require canonical producer-owned outcome and delete legacy inference.

- `skills/nova/pipeline/runners/module-runner-shared.ts`
  - `buildModuleStepResult` reconstructs typed step results from legacy module envelopes.
  - It infers outcome from `exit`, status payloads, and diagnostics.
  - Removal target: make module terminal paths create `PipelineStepResult` directly, then delete this helper.

- `skills/nova/pipeline/services/contracts/module-worker-control-results.ts`
  - Worker result builders still contain defaulting for missing issue/outcome fields.
  - Removal target: require module worker producers to provide typed outcome and issue data explicitly before tightening aliases.

- `skills/nova/pipeline/services/contracts/validator-control-result.ts`
  - Validator control result creation can synthesize outcome class from action/failure fields.
  - Removal target: require validator producers to pass canonical outcome class explicitly before removing projection inference.

- `skills/nova/pipeline/services/contracts/gate-control-result.ts`
  - Gate control normalization still accepts broad status/outcome aliases.
  - Removal target: tighten after confirming live gate producers emit canonical typed outcome classes.

## Producer Readiness

- Gate producers are mostly typed already, but review and Buster gates still contain unknown-failure inference that should be removed in Phase E.
- Worker producers emit typed `outcomeClass`, but contract helpers still preserve legacy fallback behavior. Tightening belongs after module terminal migration.
- Module terminal paths are the biggest active dependency on compatibility reconstruction.
- Validator projection needs explicit outcome-class production before `buildPipelineStepResultFromControlResult` inference can be deleted.

## Recommended Phase C Order

1. Require direct `buildPipelineStepResult` callers to supply a valid canonical outcome.
2. Make validator and gate projection callers pass canonical outcome explicitly instead of relying on contract inference.
3. Convert module terminal return paths to create `PipelineStepResult` directly.
4. Delete `buildModuleStepResult`.
5. Remove outcome inference from `pipeline-step-result.ts`.
6. Tighten worker/gate result aliases after producers are canonical.

## Verification Notes

- Static inventory commands used:
  - `rg "buildPipelineStepResultFromControlResult\\(|buildPipelineStepResult\\(|buildModuleStepResult\\(" skills tests`
  - `rg "outcomeClass:|outcome:|issueType:|nextAction:" skills/nova/pipeline`
- No runtime behavior changed by this inventory.
