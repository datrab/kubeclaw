# Batch P13 — Nova contract result surfaces

Status: completed
Date started: 2026-05-08
Date completed: 2026-05-08
Reviewer: Nova

## Scope

```text
skills/nova/pipeline/services/contracts/README.md
skills/nova/pipeline/services/contracts/*.js
```

Scope expansion verified live: 8 files, under the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/nova/pipeline/services/contracts/README.md
kubeclaw-main/skills/nova/pipeline/services/contracts/control-result-mapping.js
kubeclaw-main/skills/nova/pipeline/services/contracts/gate-control-result.js
kubeclaw-main/skills/nova/pipeline/services/contracts/generator-result.js
kubeclaw-main/skills/nova/pipeline/services/contracts/index.js
kubeclaw-main/skills/nova/pipeline/services/contracts/pipeline-step-result.js
kubeclaw-main/skills/nova/pipeline/services/contracts/validator-control-result.js
kubeclaw-main/skills/nova/pipeline/services/contracts/worker-control-result.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/contracts/check-gate-control-result-surface.mjs
kubeclaw-main/tests/verification/contracts/check-generator-result-surface.mjs
kubeclaw-main/tests/verification/contracts/check-pipeline-step-result-surface.mjs
kubeclaw-main/tests/verification/contracts/check-validator-control-result-surface.mjs
kubeclaw-main/tests/verification/contracts/check-worker-control-result-surface.mjs
kubeclaw-main/tests/verification/behavior/areas/gates.mjs
kubeclaw-main/tests/verification/behavior/areas/pipeline.mjs
```

## Per-file map

### `skills/nova/pipeline/services/contracts/README.md`

Role: Directory-level ownership note for typed result/control contracts.

Imports/dependencies: None.

Exports/public surface: Documentation only.

Defines: Contract types owned by this directory and legacy shim guidance.

Important variables/state: None.

Calls out to: None.

Called by / expected callers: Maintainers.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: Mentions legacy `skills/nova/pipeline/services/*result*.js` compatibility shims.

Authority behavior: Declares this directory as the owner for gate, generator, pipeline-step, validator, and worker result contracts.

Error/retry/terminal behavior: None found in scoped files.

Verification coverage: Contract tests below assert implementation surfaces.

Findings: None.

### `skills/nova/pipeline/services/contracts/control-result-mapping.js`

Role: Small helper for constructing normalized control-result mapping objects.

Imports/dependencies: None.

Exports/public surface: `buildControlResultMapping`, `buildUnknownControlResultMapping`.

Defines: `{ nextAction, issueType, outcomeClass }` mapping builder with default unknown outcome class.

Important variables/state: None.

Calls out to: None.

Called by / expected callers: Gate, validator, and worker contract modules.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: None.

Authority behavior: Owns shared mapping object shape only; domain-specific mappings live in each contract module.

Error/retry/terminal behavior: No validation or throw paths.

Verification coverage: Covered indirectly by gate/validator/worker contract tests.

Findings: None.

### `skills/nova/pipeline/services/contracts/gate-control-result.js`

Role: Typed gate control-result contract, compatibility mapping, projection, and normalization authority.

Imports/dependencies: Exit/status constants; remediation-handoff validator; contract diagnostics; compatibility-authority scanner; serialization clone helper; control-result mapping helper.

Exports/public surface: Gate action constants, compatibility mappings, clone helper, mapping/projection/build/validate/normalize helpers, remediable gate validation helpers.

Defines: Gate status sets, review/Buster/approval compatibility-to-control mappings, typed gate control result schema builder, semantic validator, compatibility projectors for review/Buster/approval, normalizers with contract diagnostic errors.

Important variables/state: Frozen mapping constants; no mutable runtime state.

Calls out to: `validateGateRemediationControlResult`, `createContractInvalidError`, `findCompatibilityAuthorityKeys`, `cloneSerializableValue`.

Called by / expected callers: Gate runners/adapters, generic gate runner, pipeline-step projection, contract tests.

Environment variables / CLI inputs / config fields: None direct; consumes gate type, stage id, module id, plugin input/invocation passed by callers.

Paths built/read/written: None.

Authority behavior: Rejects compatibility authority fields inside typed gate results; validates action/status semantics and remediable request-fix payloads.

Error/retry/terminal behavior: Coercion/validation failures throw `ContractInvalidError` with hook family `gate.execute`, producer metadata, raw/coerced result, input, and invocation.

Verification coverage: `check-gate-control-result-surface.mjs`, gates/approvals/fix-cycle behavior tests.

Findings: None.

### `skills/nova/pipeline/services/contracts/generator-result.js`

Role: Generator artifact reference and result object builder.

Imports/dependencies: None.

Exports/public surface: `buildGeneratorArtifactRef`, `buildGeneratorResult`.

Defines: Generator result shape `{ schemaVersion:'v1', producerKind:'generator', producerType, outputs, artifacts?, diagnostics? }` and artifact refs `{ type, path, ...extras }`.

Important variables/state: None.

Calls out to: None.

Called by / expected callers: Generator services and generator result surface tests.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: None; accepts artifact paths supplied by callers.

Authority behavior: Owns generator result construction, but no validator/normalizer exists in the scoped file.

Error/retry/terminal behavior: `buildGeneratorArtifactRef` returns null for missing path; `buildGeneratorResult` filters falsey artifact refs. No validation/throw path.

Verification coverage: `check-generator-result-surface.mjs`.

Findings: `P13-ISSUE-001` — generator result builder lacks an explicit validator/normalizer owner.

### `skills/nova/pipeline/services/contracts/index.js`

Role: Namespace export barrel for contract modules.

Imports/dependencies: Contract modules in this directory.

Exports/public surface: Namespace exports `GateControlResult`, `GeneratorResult`, `PipelineStepResult`, `ValidatorControlResult`, `WorkerControlResult`.

Defines: Public grouped import surface.

Important variables/state: None.

Calls out to: Re-export only.

Called by / expected callers: Consumers that want grouped contract namespaces.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: None.

Authority behavior: Import surface only.

Error/retry/terminal behavior: None found in scoped files.

Verification coverage: Contract import tests cover critical surfaces.

Findings: None.

### `skills/nova/pipeline/services/contracts/pipeline-step-result.js`

Role: Typed pipeline-step result contract, control-result projection, compatibility-edge projection, authority-policy, validation, exit mapping, and rate-limit detail helpers.

Imports/dependencies: Exit constants; compatibility-authority scanner/stripper; serialization clone helper.

Exports/public surface: Step schema constants/enums, authority roles, clone helper, action/outcome/exit helpers, authority policy builder, result builders, validators/assertions, compatibility projectors, diagnostic/rate-limit helpers.

Defines: Action/outcome/exit-code mappings, legacy authority key scanner, control-action-to-step-action mapping, outcome alias normalization, step result schema builder, validation rules, compatibility projection attachment.

Important variables/state: Frozen constants and sets only.

Calls out to: `findCompatibilityAuthorityKeys`, `stripCompatibilityAuthority`, `cloneSerializableValue`.

Called by / expected callers: Pipeline runner, gate runner, module runner terminal result helpers, contract tests.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: None.

Authority behavior: Typed pipeline-step result is authority; typed control results are accepted as authority for projection; raw compatibility authority fields are rejected/marked as edge projection only.

Error/retry/terminal behavior: `buildPipelineStepResult` validates before returning and throws on invalid schema/action/outcome/compatibility mismatch. Assertion helpers throw. No retry behavior.

Verification coverage: `check-pipeline-step-result-surface.mjs`, pipeline/gate behavior tests.

Findings: None.

### `skills/nova/pipeline/services/contracts/validator-control-result.js`

Role: Typed validator control-result contract, module validator compatibility mapping, findings builder, normalizer, and validator diagnostics.

Imports/dependencies: Runtime run id, contract diagnostics, compatibility-authority scanner, serialization clone helper, control-result mapping helper.

Exports/public surface: Validator action/type constants, clone helper, module validator mapper/result builder, typed builder, type guard/coercer/validator/normalizer.

Defines: Validator summary fallback algorithm, validation failure and lint report findings mapping, pass/request-fix/block mapping, typed validator schema and validation.

Important variables/state: Frozen action/type constants only.

Calls out to: `getRunId`, `createContractInvalidError`, `findCompatibilityAuthorityKeys`, `cloneSerializableValue`.

Called by / expected callers: Validator services, pipeline runner validation steps, contract tests.

Environment variables / CLI inputs / config fields: Reads `config.project`, run id fields, caller opts module id/dir/stage/scope/input/invocation.

Paths built/read/written: None.

Authority behavior: Rejects compatibility authority fields inside typed validator results; compatibility-shaped validation results are not accepted at validator plugin boundary.

Error/retry/terminal behavior: Coercion/validation failures throw `ContractInvalidError` with hook family `validator.run`; execution failures are mapped to block/environment when caller sets `executionFailed`.

Verification coverage: `check-validator-control-result-surface.mjs`, pipeline behavior tests.

Findings: None.

### `skills/nova/pipeline/services/contracts/worker-control-result.js`

Role: Typed worker control-result contract, module Forge/Buster backend-result mapping, compatibility projection, validation, and normalizer.

Imports/dependencies: Contract diagnostics, compatibility-authority scanner, serialization clone helper, control-result mapping helper.

Exports/public surface: Worker mapping constant, clone helper, backend mapper, typed builder, type guard/coercer, Forge/Buster compatibility projectors, validator/normalizer.

Defines: Worker mapping tables for Forge and Buster, pass/reason/failure-class mapping, typed worker schema, compatibility projection to legacy backend result shape, validation and contract diagnostics.

Important variables/state: Frozen mapping constants only.

Calls out to: `createContractInvalidError`, `findCompatibilityAuthorityKeys`, `cloneSerializableValue`.

Called by / expected callers: Module runner worker control code and contract tests.

Environment variables / CLI inputs / config fields: None direct; consumes caller stage id, module id, input, invocation.

Paths built/read/written: None.

Authority behavior: Rejects compatibility authority fields inside typed worker results; compatibility-shaped backend results are not accepted at worker boundary.

Error/retry/terminal behavior: Unknown worker type maps to block/unknown. Coercion/validation failures throw `ContractInvalidError` with hook family `worker.execute`. Forge/Buster mappings distinguish retry/request_fix/block/pass.

Verification coverage: `check-worker-control-result-surface.mjs`, module/pipeline behavior tests.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `gate-control-result.js` | `control-result-mapping.js` | `buildControlResultMapping`, `buildUnknownControlResultMapping` | Gate compatibility mapping. |
| `validator-control-result.js` | `control-result-mapping.js` | `buildControlResultMapping` | Validator pass/request-fix/block mapping. |
| `worker-control-result.js` | `control-result-mapping.js` | mapping helpers | Worker backend-result mapping. |
| `pipeline-step-result.js` | `compatibility-authority.js` | `findCompatibilityAuthorityKeys`, `stripCompatibilityAuthority` | Reject/strip legacy authority. |
| Gate/worker/validator contracts | `contract-diagnostics.js` | `createContractInvalidError` | Contract-invalid error envelope. |
| `index.js` | contract modules | namespace re-exports | Public grouped contract import surface. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `mapGateCompatibilityResultToControl` | Gate type review/buster/approval/unknown | Gate type, exit/status/failure class | Pass/block/request policy mapping | Gate compatibility bridge. |
| `validateGateActionSemantics` | Action pass/block/request_fix/wait | Gate run status, metadata, typed wait | Semantic validation errors | Prevents contradictory gate results. |
| `normalizeGateControlResult` | Coerce or validate errors | Raw gate result | `ContractInvalidError` | Fail-closed plugin boundary. |
| `validateRemediableTypedGateControlResult` | `request_fix` without remediation or non-code issue type | Typed result | Validation errors | Remediation contract authority. |
| `inferOutcomeFromControlResult` | Explicit outcome, typed outcome class, summary/issue fallback | Control result/action | Pipeline-step outcome | Central terminal action mapping. |
| `validatePipelineStepResult` | Schema/action/outcome/compatibility mismatch | Step result | Validation errors | Typed step result integrity. |
| `mapModuleValidatorResultToControl` | Execution failed/blocked, passed, failed | Validator result/opts | block/pass/request_fix | Validator control bridge. |
| `mapWorkerBackendResultToControl` | Worker type/pass/reason/failure class | Backend result | pass/retry/request_fix/block | Worker control bridge. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `buildTypedGateControlResult` | Control result object | Builder args | Required typed gate node plus optional wait clone | v1 typed gate schema. |
| `buildPipelineStepResult` | Step result object | Diagnostics/control/remediation/wait/compatibility | Explicit diagnostics first, control fallback; compatibility exit normalized from outcome | v1 typed step schema. |
| `buildPipelineStepResultAuthorityPolicy` | Authority policy object | Result/control/compatibility projection | Typed step wins, then typed control, raw compatibility rejected, edge projection last | Compatibility authority is never allowed. |
| `buildModuleValidatorControlResult` | Validator control metadata/findings | Result/config/opts | Result fields, opts fallback, run id fallback; lint/failure findings merged | Typed validator result. |
| `projectModule*WorkerCompatibilityResult` | Legacy worker compatibility result | Typed metadata and control action | Metadata poll result cloned and ok/reason overlaid | Legacy backend shape at edge only. |
| `buildGeneratorResult` | Generator result object | Producer, outputs, artifacts, diagnostics | Falsey artifacts filtered; diagnostics only if non-empty | v1 generator result shape. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| P13 scoped files | None found in scoped files | None found in scoped files | None found in scoped files | Contract helpers are synchronous builders/validators. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `config.project` | Config field | `buildModuleValidatorControlResult` | `'unknown'` fallback | Validator metadata. |
| `config._runId`, `config.run_id`, runtime run id | Config/runtime fields | Validator and caller-built gate metadata | `getRunId(config)` where used | Contract metadata correlation. |
| `opts.stageId`, `opts.producerType`, `opts.moduleId`, `opts.input`, `opts.invocation` | Normalizer opts | Gate/validator/worker normalizers | Stage/type fallback strings | Contract diagnostics context. |
| Typed control-result raw inputs | Plugin/worker/validator output | Coercers/normalizers | Required typed v1 objects | Compatibility-shaped results rejected at boundaries. |

## Path map updates

None found in scoped files.

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Typed gate control results | `gate-control-result.js` | Gate runners/generic gate runner/pipeline-step projection | None. |
| Typed pipeline-step results | `pipeline-step-result.js` | Pipeline runner/exit mapping/compat projection | None. |
| Typed validator control results | `validator-control-result.js` | Validator services/pipeline scheduling | None. |
| Typed worker control results | `worker-control-result.js` | Module runner worker phases | None. |
| Generator result builder | `generator-result.js` | Generator services/tests | Needs validator/normalizer owner; see `P13-ISSUE-001`. |
| Contract namespace surface | `index.js` | Import consumers | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Typed gate control result | `buildTypedGateControlResult` | `schemaVersion:'v1'`, `producerKind:'gate'`, `producerType`, `nextAction`, optional `issueType`, `diagnostics.summary/findings/metadata/typed.gate`, optional `typed.wait` | `validateGateControlResult`, `normalizeGateControlResult`, remediable validator | Gate runner/pipeline-step projection. |
| Gate wait payload | Gate control builders | `schemaVersion:'v1'`, `waitKind`, `status`, optional deadline/ref fields | `validateGateActionSemantics` | Waitable gate engine. |
| Pipeline-step result | `buildPipelineStepResult` | `schemaVersion:'v1'`, `kind:'pipeline_step_result'`, `stepType`, `stepId`, `nextAction`, `outcome`, diagnostics, correlation, compatibility | `validatePipelineStepResult`, `assertPipelineStepResult` | Pipeline runner/exit projection. |
| Pipeline-step authority policy | `buildPipelineStepResultAuthorityPolicy` | role/code booleans, compatibility authority allow flags false, rejected path arrays | Internal scanners | Pipeline runner/operators. |
| Typed validator control result | `buildTypedValidatorControlResult` | `schemaVersion:'v1'`, `producerKind:'validator'`, `producerType`, `nextAction`, optional `issueType`, `diagnostics.typed.validator` | `validateTypedValidatorControlResult`, `normalizeTypedValidatorControlResult` | Validator services/pipeline. |
| Typed worker control result | `buildTypedWorkerControlResult` | `schemaVersion:'v1'`, `producerKind:'worker'`, `producerType`, `nextAction`, optional `issueType`, `diagnostics.typed.worker` | `validateTypedWorkerControlResult`, `normalizeTypedWorkerControlResult` | Module worker phases. |
| Generator result | `buildGeneratorResult` | `schemaVersion:'v1'`, `producerKind:'generator'`, `producerType`, `outputs`, optional `artifacts`, optional `diagnostics` | None in scoped file | Generator consumers/tests. |
| Generator artifact ref | `buildGeneratorArtifactRef` | `type`, `path`, extra keys | None in scoped file | Generator result builder. |

## Prompt and agent behavior updates

None found in scoped files.

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `coerceTypedGateControlResult` | Non-typed gate result | No | No retry | Throws boundary error | Raw result passed to contract diagnostics by normalizer. |
| `normalizeGateControlResult` | Coerce/validation failure | No | No retry | Throws `ContractInvalidError` | Diagnostic may include raw/coerced result. |
| `normalizeRemediableTypedGateControlResult` | Missing remediation/non-code request-fix | No | No retry | Throws `ContractInvalidError` | Diagnostic may include raw/coerced result. |
| `buildPipelineStepResult` | Invalid step schema/action/outcome/compatibility | No | No retry | Throws generic Error | Compatibility authority stripped before embed. |
| `assertPipelineStepResult` helpers | Invalid step result | No | No retry | Throws generic Error | None. |
| `coerceTypedValidatorControlResult` / normalizer | Non-typed or invalid validator result | No | No retry | Throws boundary error or `ContractInvalidError` | Diagnostic may include raw/coerced result. |
| `coerceTypedWorkerControlResult` / normalizer | Non-typed or invalid worker result | No | No retry | Throws boundary error or `ContractInvalidError` | Diagnostic may include raw/coerced result. |
| `buildGeneratorArtifactRef` | Missing artifact path | Not error | No retry | Returns null and caller filters | None. |
| `buildGeneratorResult` | Malformed generator fields | No explicit handling | No retry | No validation in scoped file | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| Gate coercer/normalizer | Invalid gate result | Indirect | Caller/generic gate runner telemetry | Contract-invalid gate execution failure | Caller catches `ContractInvalidError` | Contract module itself emits none. |
| Remediable gate normalizer | Invalid remediation request | Indirect | Caller/generic gate runner telemetry | Contract-invalid gate execution failure | Caller catches `ContractInvalidError` | Covered by gate behavior tests. |
| `buildPipelineStepResult` | Invalid step result | No direct telemetry | none | thrown Error | Caller | Contract module itself emits none. |
| Pipeline-step assertion helpers | Invalid step result | No direct telemetry | none | thrown Error | Caller | Contract module itself emits none. |
| Validator normalizer | Invalid validator result | Indirect | Validator/pipeline caller telemetry | Contract-invalid validator failure | Caller catches `ContractInvalidError` | Contract module itself emits none. |
| Worker normalizer | Invalid worker result | Indirect | Module runner caller telemetry | Contract-invalid worker failure | Caller catches `ContractInvalidError` | Contract module itself emits none. |
| `buildGeneratorArtifactRef` | Missing artifact path | No | none | none | Null return | Intentional filter behavior. |
| `buildGeneratorResult` | Malformed generator fields | No | none | none | No validator | See `P13-ISSUE-001`. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js runtime | `node` binary | Observed `v24.14.0` during review | All P13 JS modules | ESM and object/schema helpers | No package pin in scoped files. |
| Contract diagnostics service | Internal source | Internal | Gate/validator/worker normalizers | Structured contract-invalid errors | Caller emits telemetry. |
| Compatibility authority service | Internal source | Internal | Gate/pipeline-step/validator/worker contracts | Reject/strip legacy authority fields | Prevents raw compatibility authority. |
| Serialization clone helper | Internal source | Internal | Gate/pipeline-step/validator/worker contracts | Clone serializable diagnostics/result metadata | Clone failures not locally caught. |
| Remediation handoff validator | Internal source | Internal | Gate remediable validator | Validate request-fix payload | Errors returned as validation messages. |

## Concurrency and backpressure updates

None found in scoped files.

## ACP protocol updates

None found in scoped files.

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Gate control-result contract | `tests/verification/contracts/check-gate-control-result-surface.mjs` | Strong schema/action/remediation coverage | None. |
| Pipeline-step result contract | `tests/verification/contracts/check-pipeline-step-result-surface.mjs` | Strong authority/exit projection coverage | None. |
| Validator control-result contract | `tests/verification/contracts/check-validator-control-result-surface.mjs` | Good validator boundary coverage | None. |
| Worker control-result contract | `tests/verification/contracts/check-worker-control-result-surface.mjs` | Good worker mapping/boundary coverage | None. |
| Generator result surface | `tests/verification/contracts/check-generator-result-surface.mjs` | Builder surface coverage only | No scoped validator/normalizer; see `P13-ISSUE-001`. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- `P13-ISSUE-001` — Generator result builder lacks an explicit validator/normalizer owner.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
