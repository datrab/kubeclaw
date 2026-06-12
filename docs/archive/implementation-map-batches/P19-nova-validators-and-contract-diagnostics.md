# Batch P19 — Nova validators and contract diagnostics

Status: completed
Date started: 2026-05-08
Date completed: 2026-05-08
Reviewer: Nova

## Scope

```text
skills/nova/pipeline/services/arch-validator.js
skills/nova/pipeline/services/arch-validator-checks.js
skills/nova/pipeline/services/contract-diagnostics.js
skills/nova/pipeline/services/module-validators.js
```

Scope expansion verified live: 4 files, under the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/nova/pipeline/services/arch-validator.js
kubeclaw-main/skills/nova/pipeline/services/arch-validator-checks.js
kubeclaw-main/skills/nova/pipeline/services/contract-diagnostics.js
kubeclaw-main/skills/nova/pipeline/services/module-validators.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/skills/nova/pipeline/services/contracts/validator-control-result.js
kubeclaw-main/tests/verification/contracts/check-validator-control-result-surface.mjs
kubeclaw-main/tests/verification/behavior/areas/pipeline.mjs
kubeclaw-main/tests/verification/behavior/areas/module-failures.mjs
```

## Per-file map

### `skills/nova/pipeline/services/arch-validator.js`

Role: Pre-pipeline architecture validator combining deterministic progress/module/gate checks with optional agent judgment, artifact output, and typed validator control-result projection.

Imports/dependencies: Node `fs`/`path`, logger/runtime, gateway integration, policy resolver/logger, prompt redaction writer, and deterministic check helpers.

Exports/public surface: `FINDING_CODES`, `SCOPE`, `SEVERITY`, `buildValidatorPrompt`, `archValidatorLogDir`, `buildMarkdownSummary`, `buildArchitectureValidatorControlResult`, `isArchitectureValidatorControlResult`, `coerceArchitectureValidatorControlResult`, `extractArchValidatorReport`, `isBlocking`, `runArchValidator`, `runArchitectureValidatorStage`.

Defines: Architecture prompt builder, agent judgment runner, artifact writers, finding severity mapping, control-result schema builder, report extractor, and fail-closed validator execution.

Important variables/state: No module-level mutable state. Per-run `allFindings`, `agentPrompt`, timestamp/project, control-result counts, artifact paths.

Calls out to: `runDeterministicArchitectureChecks`, `gatewayInvoke('complete')`, `resolvePolicy`, `logEffectivePolicy`, `writeRedactedPromptArtifact`, filesystem writes.

Called by / expected callers: Pipeline runner preflight/scheduled validator stage, governance summary context, validator contract tests/behavior.

Environment variables / CLI inputs / config fields: Reads `config._testOverrides.archValidator.agentEnabled`, `config.arch_validation.agent_enabled`, `progress.arch_validation.model`, `progress.defaults.models.arch_validator`, `config.fallback_model` via `resolvePolicy`, `config._logDir`, `config.project`, `config._runId`, `config.run_id`, progress project/modules/gates/execution order/default models.

Paths built/read/written: Writes `architecture-validator/results.json`, `summary.md`, `validator-prompt.md` under `config._logDir`; artifact refs point to those paths.

Authority behavior: Owns architecture validation report and typed `validator` control result for `validator:architecture`; deterministic finding vocabulary lives in `arch-validator-checks.js`.

Error/retry/terminal behavior: Agent disabled/skipped returns no or WARN findings; bad/malformed agent JSON becomes WARN findings; gateway failure becomes WARN finding; unexpected deterministic/runtime errors become BLOCKING `VALIDATOR_INTERNAL_ERROR`; artifact write failures are WARN-only; blocked findings map to `nextAction:'block'`. Malformed execution-order entries are classified by deterministic checks before this catch-all.

Verification coverage: Validator control-result contract, pipeline behavior arch-validator artifacts/control mapping, governance summary behavior, and malformed execution-order entry regression.

Findings: None open.

### `skills/nova/pipeline/services/arch-validator-checks.js`

Role: Deterministic architecture checks for progress structure, module files/test specs, gate instruction references, dependency graph, and model config.

Imports/dependencies: Node `fs`/`path`, `swarmRoot` path helper.

Exports/public surface: `SEVERITY`, `SCOPE`, `FINDING_CODES`, `makeFinding`, `checkProgress`, `checkModuleFiles`, `checkTestSpec`, `checkGateFiles`, `checkDependencyGraph`, `checkModelConfig`, `runDeterministicArchitectureChecks`.

Defines: Stable architecture finding codes and finding factory; structural scans for `progress.json`, module documents, `test-spec.json`, gate instruction paths, dependencies, and model strings.

Important variables/state: Pure per-call findings arrays; no module-level mutable state.

Calls out to: `fs.existsSync`, `fs.readFileSync`, `JSON.parse`, `path.join`, `path.isAbsolute`, `swarmRoot`.

Called by / expected callers: `runArchValidator`, tests, possible direct deterministic validator callers.

Environment variables / CLI inputs / config fields: Reads `config.paths.progress_file`, `config.paths.modules_dir`, `progress.arch_validation.model`, `config.fallback_model`, `progress.validators.schedule`, module `dir/stages/depends_on/forge_model`, gate `type/review_name/instructions_file/model`.

Paths built/read/written: Reads module `FORGE.md`, `BUSTER.md`, `test-spec.json`; reads gate `instructions_file` relative to `swarmRoot(config)`; no writes.

Authority behavior: Owns deterministic architecture finding classification. It treats missing `FORGE.md`/invalid test-spec JSON as blocking, missing `BUSTER.md` and model malformation as warnings.

Error/retry/terminal behavior: Invalid `test-spec.json` parse is caught and reported as blocking. Non-string or blank execution-order entries are reported as blocking `EXEC_ORDER_ENTRY_INVALID` findings and remaining entries continue scanning.

Verification coverage: Pipeline behavior arch-validator artifact scenarios, malformed execution-order regression, and validator surface tests.

Findings: None open.

### `skills/nova/pipeline/services/contract-diagnostics.js`

Role: Shared plugin contract-invalid diagnostic and error builder.

Imports/dependencies: Serialization helpers `buildSafeJsonPreview`, `cloneSerializable`.

Exports/public surface: `cloneSerializable`, `buildSafePreview`, `inferHookFamily`, `buildContractInvalidDiagnostic`, `createContractInvalidError`, `isContractInvalidError`, `getContractInvalidDiagnostic`.

Defines: `PluginContractInvalidError` shape with code `PLUGIN_CONTRACT_INVALID` and typed diagnostic payload.

Important variables/state: `DEFAULT_PREVIEW_LIMIT = 2000`; no mutable state.

Calls out to: Serialization preview/clone helpers.

Called by / expected callers: Gate/worker/validator control-result contracts and plugin boundary normalizers.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: None.

Authority behavior: Owns plugin contract-invalid diagnostic schema and hook-family inference for `worker:`, `gate:`, `validator:`, `generator:` stage ids.

Error/retry/terminal behavior: Produces non-retryable `severity:'error'` diagnostics; does not log or throw except through explicit `createContractInvalidError` call.

Verification coverage: Control-result contract verification for validators/workers/gates; indirect coverage through contract-normalizer tests.

Findings: None.

### `skills/nova/pipeline/services/module-validators.js`

Role: Built-in module/pipeline validator stage adapters for delivery lint, pre-check, and full lint.

Imports/dependencies: Logger/runtime, delivery validation helpers, lint/pre-check service, typed validator control-result builder.

Exports/public surface: `runDeliveryLintValidatorStage`, `runPreCheckValidatorStage`, `runFullLintValidatorStage`.

Defines: Stage producer type/module id/dir/status resolvers, base validator opts, full-lint result classifier.

Important variables/state: No mutable module state; per-call `stageId`, module identity, lint tier/log path.

Calls out to: `runDeliveryLintValidation`, `formatValidationFailures`, `runPreCheck`, `generateLintReport`, `buildModuleValidatorControlResult`, `log`.

Called by / expected callers: Registry validator stages, module runner pre-Buster validation, scheduled `validator:full_lint` pipeline stages, tests.

Environment variables / CLI inputs / config fields: Reads input ids/refs/module/status/executionContext, progress module config, `input.validator.config.tier`, `opts.lintTier`, `input.validator.config.logPath`, `opts.logPath`, runtime run id.

Paths built/read/written: Delegates lint/pre-check/report paths to `lint.js` and validation helpers; no direct path construction except passing module dir/log path through.

Authority behavior: Owns built-in validator adapter conversion from compatibility lint/pre-check results to typed validator control results. Typed schema authority lives in `contracts/validator-control-result.js`.

Error/retry/terminal behavior: Missing module dir/id returns typed blocking execution-failed result. Full-lint missing report/tool failures block as environment/tool errors. Exceptions from delegated lint/pre-check helpers are not caught locally and propagate to caller/plugin boundary.

Verification coverage: `check-validator-control-result-surface.mjs`, module-failures behavior validator milestone tests, pipeline scheduled full-lint behavior.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `arch-validator.js` | `arch-validator-checks.js` | `runDeterministicArchitectureChecks`, finding constants | Phase 1 deterministic validation. |
| `arch-validator.js` | `gateway.js` | `gatewayInvoke('complete')` | Optional agent judgment. |
| `arch-validator.js` | `core/config.js` | `resolvePolicy`, `logEffectivePolicy` | Arch-validator model/thinking selection. |
| `arch-validator.js` | `redaction.js` | `writeRedactedPromptArtifact` | Prompt artifact write with redaction metadata. |
| `module-validators.js` | `validation.js` | `runDeliveryLintValidation`, `formatValidationFailures` | Delivery lint validator adapter. |
| `module-validators.js` | `lint.js` | `runPreCheck`, `generateLintReport` | Pre-check and full-lint adapters. |
| `module-validators.js` | `contracts/validator-control-result.js` | `buildModuleValidatorControlResult` | Typed validator control-result projection. |
| Control-result contracts | `contract-diagnostics.js` | `createContractInvalidError` | Invalid plugin output diagnostic/error. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `checkProgress` | Missing `project`, non-array/empty `execution_order`, missing `modules`, missing gate/module refs | `progress.json` shape | Blocking findings or early return | Defines pre-pipeline fail-fast structure rules. |
| `checkProgress` | `stepId.startsWith('gate:')`, `validator:`, otherwise module id | Execution order entries | Gate/module/validator reference validation | Non-string entries throw P19 issue. |
| `checkModuleFiles` | Missing `FORGE.md`; buster stage missing `BUSTER.md`; invalid `test-spec.json` | Module dir/stages/files | Blocking/warn findings | Prevents agent dispatch without instructions and validates test spec. |
| `checkGateFiles` | Gate `instructions_file` exists | Absolute/relative path | Blocking finding if missing | Gate prompt/config dependency validation. |
| `checkDependencyGraph` | Self or unknown deps | `depends_on` entries | Blocking dependency findings | Prevents impossible scheduler dependencies. |
| `checkModelConfig` | Malformed arch/module/gate model values | Config/progress model fields | WARN findings | Nonblocking operator config warnings. |
| `runArchValidator` | Agent disabled/skipped/failure/internal error/blocking findings | Config and findings | Skip, warn finding, blocking internal finding, or pass/block report | Fail-closed validation policy. |
| `mapFindingSeverityToDiagnosticSeverity` | Architecture severity enum | finding severity | Typed diagnostic severity | Converts blocking to `critical`. |
| `module-validators` | Missing module id/dir | Validator input | Blocking execution-failed typed result | Keeps built-in validators typed even on missing context. |
| `classifyFullLintResult` | Missing report/tool failures/total errors | Lint report summary | Block/request_fix/pass result | Distinguishes environment/tool failure from code findings. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `runArchValidator` | Local findings/result | Deterministic findings plus agent findings | Concatenate deterministic then agent findings; internal error replaces with one blocking finding | Returned report always has `blocked`, `project`, `timestamp`, `findings`. |
| `writeArtifacts` | Architecture validator artifacts | Result and prompt | Creates artifact dir, writes JSON/Markdown/prompt if `_logDir` exists | Artifact failure never changes result. |
| `buildArchitectureValidatorControlResult` | Returned typed control result | Result plus opts | Execution/contract failure force block; metadata includes counts/artifact paths/raw findings | Typed validator result for architecture stage. |
| `extractArchValidatorReport` | Returned report projection | Typed or legacy result | Typed metadata preferred; legacy object fallback | Governance/report consumers get stable report shape. |
| `baseValidatorOpts` | Returned opts object | Config/input/stage/extra | Input ids/refs plus extra overrides | Built-in module validators share typed metadata. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `checkProgress` | Iterates `execution_order`, validators schedule, modules, gates | None | None | Finishes after structural scan or returns early on missing execution/modules. |
| `checkModuleFiles` | Iterates modules and optional test spec checks | None | None | Continues per module; invalid test-spec JSON skips deeper test-spec checks for that file. |
| `checkDependencyGraph` | Iterates module dependencies | None | None | Finishes after all deps. |
| `runAgentJudgment` | Single gateway call | Gateway-level timeout only | `gatewayInvoke(..., 120000)` | JSON parse success, parse warning, or gateway failure warning. |
| `module-validators` | None found in scoped files | N/A | Delegated lint/pre-check tools may have their own timeouts | Adapter returns one typed control result or propagates delegated exception. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `config._testOverrides.archValidator.agentEnabled` | Test override | `runAgentJudgment` | enabled unless false | Skips agent judgment. |
| `config.arch_validation.agent_enabled` | Config field | `runAgentJudgment` | enabled unless false | Operator config skip for agent judgment. |
| `progress.arch_validation.model`, `progress.defaults.models.arch_validator`, `config.fallback_model` | Progress/config policy | `resolvePolicy` in `runAgentJudgment` | runtime/project before platform fallback | Arch-validator model/thinking. |
| `config._logDir` | Runtime path | `archValidatorLogDir`, artifact builders | null disables artifacts | Artifact root for architecture validator. |
| `config.paths.progress_file`, `config.paths.modules_dir` | Config paths | deterministic checks | `progress.json`; modules checks skipped if no modules dir | Source files for progress/module validation. |
| `progress.execution_order`, `progress.modules`, `progress.gates`, `progress.validators.schedule` | Progress fields | deterministic checks and prompt builder | Required shape | Architecture validation source. |
| `input.ids`, `input.refs`, `input.module`, `input.executionContext`, `input.stateSnapshot` | Validator runtime input | module validators/base opts | Registry-produced input | Module id/dir/status/validator refs. |
| `input.validator.config.tier`, `opts.lintTier`, `input.validator.config.logPath`, `opts.logPath` | Validator config/options | `runFullLintValidatorStage` | tier `full`; log path null | Full-lint adapter options. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| `architecture-validator/results.json` | `buildArtifactPaths` under `_logDir` | Operators/governance/report extractors | `writeArtifacts` | Architecture validator machine-readable report. |
| `architecture-validator/summary.md` | `buildArtifactPaths` under `_logDir` | Operators | `writeArtifacts` | Human-readable report. |
| `architecture-validator/validator-prompt.md` | `buildArtifactPaths` under `_logDir` | Operators/debug | `writeArtifacts` via `writeRedactedPromptArtifact` | Redacted agent prompt artifact. |
| Module `FORGE.md`, `BUSTER.md`, `test-spec.json` | `checkModuleFiles` from `config.paths.modules_dir` and module `dir` | `checkModuleFiles`/`checkTestSpec` | None in scoped files | Deterministic architecture inputs. |
| Gate `instructions_file` | `checkGateFiles` with absolute path or `swarmRoot(config)` prefix | `checkGateFiles` | None in scoped files | Gate instruction existence validation. |
| Full lint/pre-check report paths | Delegated to `lint.js` | `module-validators.js` via delegated results | Delegated | P19 adapters do not build these paths directly. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Architecture validation findings | `arch-validator-checks.js` and `runAgentJudgment` | `runArchValidator`, control result, artifacts, governance | Non-string execution-order issue tracked in P19. |
| Architecture validator artifacts | `writeArtifacts` | Operators/governance/report extractors | Artifact failures are WARN-only. |
| `validator:architecture` typed control result | `buildArchitectureValidatorControlResult` | Pipeline validator stage runner | None. |
| Plugin contract invalid diagnostics | `contract-diagnostics.js` | Gate/worker/validator contract normalizers | None. |
| Built-in module validator typed results | `module-validators.js` via validator-control contract | Module runner/scheduled validator pipeline | Delegated helper exceptions are caller-boundary responsibility. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Architecture finding | `makeFinding`, agent JSON parser | `{id, severity, scope, paths[], explanation, remediation}` | Builder and filtered agent findings only | Reports/artifacts/control result. |
| Architecture report | `runArchValidator` | `{blocked:boolean, project:string, timestamp:string, findings:Finding[]}` | `isBlocking` plus builder | Artifacts, pipeline, governance. |
| Architecture artifacts | `writeArtifacts` | `results.json` report JSON; `summary.md` Markdown counts/findings; `validator-prompt.md` redacted prompt | Artifact writer only | Operators/debug/governance. |
| Architecture validator control result | `buildArchitectureValidatorControlResult` | Typed v1: `schemaVersion`, `producerKind:'validator'`, `producerType`, `nextAction`, optional `issueType`, `diagnostics.summary/findings/artifacts/metadata/typed.validator` | `isArchitectureValidatorControlResult`/coercer; generic typed validator validator adjacent | Pipeline validator runner. |
| Contract invalid diagnostic | `buildContractInvalidDiagnostic` | `schemaVersion:'v1'`, `diagnosticType:'plugin_contract_invalid'`, `severity:'error'`, `retryable:false`, summary, label/stage/hook/module/producer fields, validation errors, ids/refs, invocation, raw/coerced previews | Builder only | Contract-invalid errors and callers. |
| Built-in module validator control result | `buildModuleValidatorControlResult` via `module-validators.js` | Typed validator v1 with metadata: passed/blocked/execution_failed/error/project/run/module/stage/scope/outcome/failures/report_summary | `contracts/validator-control-result.js` | Module runner, scheduled validators, telemetry. |
| Full lint classified result | `classifyFullLintResult` | `{passed, blocked?, error, tool_error?, report}` | Local classifier | Module validator control-result builder. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Architecture validator agent | `buildValidatorPrompt` | `architecture-validator/validator-prompt.md` when `_logDir` exists | System says architecture validation agent; prompt asks for module overlap, coverage gaps, dependency ordering, structural coherence; not code quality/runtime correctness | Gateway `complete` with model/thinking from arch-validator policy; no explicit tool calls | JSON array only; each finding has `id`, `severity`, `scope`, `paths`, `explanation`, `remediation`; empty array for no issues. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `runAgentJudgment` | Agent disabled by test/config | N/A | No call | Soft skip returns no findings | N/A. |
| `runAgentJudgment` | Agent response lacks JSON array or malformed JSON | No | One parse attempt | WARN finding, pipeline may continue | Prompt artifact is redacted separately. |
| `runAgentJudgment` | Gateway/agent call failure | No local retry | One `gatewayInvoke('complete', ..., 120000)` | WARN finding, pipeline may continue | Error message not locally redacted. |
| `runArchValidator` | Unexpected deterministic/runtime error | No | Catch-all around deterministic + agent phases | BLOCKING `VALIDATOR_INTERNAL_ERROR`, fail-closed | Error message not locally redacted. |
| `writeArtifacts` | Artifact mkdir/write/redaction write failure | No | Synchronous writes once | WARN log, validation result unaffected | Prompt write uses redaction helper. |
| `checkModuleFiles` | Invalid `test-spec.json` JSON | No | One parse attempt | BLOCKING finding, continues to next module | N/A. |
| `buildArchitectureValidatorControlResult` | Execution/contract invalid opts | No | No retry | Forces typed result `nextAction:'block'` | N/A. |
| `module-validators` | Missing module id/dir | No | No retry | Typed blocking execution-failed result | N/A. |
| `runFullLintValidatorStage` | Missing report or failed lint tooling | No local retry | Delegated one report generation | Missing/failed tools block as environment/tool error | Delegated lint owns redaction/logs. |
| `module-validators` | Delegated validation/lint/pre-check exception | Caller-boundary retry only | No local catch | Propagates to registry/plugin caller | Delegated/caller owns diagnostics. |
| `contract-diagnostics.js` | Invalid plugin contract | No | No retry | Builds non-retryable error diagnostic and throws when caller requests | Safe JSON previews limit output. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `runAgentJudgment` | Agent disabled | Yes, log only | Pipeline log/stdout | INFO `[arch-validator] Agent judgment skipped/disabled` | `log` | No telemetry event. |
| `runAgentJudgment` | Bad/malformed agent JSON | Yes | WARN finding in report/artifacts/control result; log for no JSON array | `AGENT_JUDGMENT_PARSE_ERROR` | `makeFinding`, `log` | Operator sees nonblocking finding. |
| `runAgentJudgment` | Gateway failure | Yes | WARN finding in report/artifacts/control result plus WARN log | `AGENT_JUDGMENT_SKIPPED` | `makeFinding`, `log` | No retry. |
| `runArchValidator` | Unexpected internal error | Yes | BLOCKING finding in report/artifacts/control result plus ERROR log | `VALIDATOR_INTERNAL_ERROR` | `makeFinding`, `log` | Fail-closed. |
| `writeArtifacts` | Artifact write failure | Yes, log only | Pipeline log/stdout | WARN `[arch-validator] Failed to write artifacts` | `log` | No artifact if write fails. |
| `checkModuleFiles` | Invalid test spec JSON | Yes | Finding in report/artifacts/control result | `MODULE_TEST_SPEC_INVALID_JSON` | `makeFinding` | Deterministic blocking evidence. |
| `buildArchitectureValidatorControlResult` | Execution/contract invalid opts | Yes | Returned typed control result diagnostics | `diagnostics.metadata.execution_failed/contract_invalid` | Control-result builder | Caller may emit validator/gate telemetry. |
| `module-validators` | Missing module id/dir | Yes | Returned typed control result diagnostics | `delivery_lint requires moduleDir`, `pre_check requires moduleId and moduleDir` | `buildModuleValidatorControlResult` | No log locally. |
| `runFullLintValidatorStage` | Missing report/tool failure | Yes | Returned typed control result diagnostics, STEP log | `Full lint validator: running tier ...` and diagnostics summary | `log`, `buildModuleValidatorControlResult` | No separate telemetry event locally. |
| `module-validators` | Delegated exception | None locally | None in scoped file | none | N/A | Plugin/caller boundary is expected to convert to contract/terminal diagnostics. |
| `contract-diagnostics.js` | Invalid plugin contract | Yes by returned/thrown error object | Error diagnostics payload | `PLUGIN_CONTRACT_INVALID` | `createContractInvalidError` | Callers decide logging/telemetry. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js runtime | `node` binary | Observed `v24.14.0` during review | All P19 JS modules | ESM, sync fs/path, JSON parse, async gateway call | No package pin in scoped files. |
| Node `fs`/`path` built-ins | Runtime built-ins | Node major 24 observed | Arch validator checks/artifacts | File existence, reads, writes, path joins | Artifact write failures WARN-only; module file read parse failure finding. |
| Gateway ACP/complete integration | Internal/external gateway | Internal | `runAgentJudgment` | Agent architecture judgment | Failure becomes WARN finding; 120s timeout. |
| Policy resolver | Internal config source | Internal | `runAgentJudgment` | Model/thinking selection | Misconfig handled by policy layer; malformed model warning from deterministic check. |
| Redaction helper | Internal source | Internal | `writeArtifacts` | Redacted prompt artifact | Failure caught by artifact writer. |
| Lint/pre-check/delivery validation services | Internal source/external tooling delegated | Internal/external | `module-validators.js` | Built-in validator execution | Exceptions propagate unless delegated helper returns result. |
| Validator control-result contract | Internal source | Internal | `module-validators.js`, adjacent schema | Typed validator result authority | Contract-invalid diagnostics use P19 diagnostic helper. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Architecture deterministic checks | Synchronous scan over progress modules/gates/schedule/deps | No explicit cap | O(progress size); malformed execution-order entries are classified as findings and scanning continues | Findings/artifacts/logs | None. |
| Architecture agent judgment | One gateway `complete` call | 120000 ms timeout | Failure degrades to WARN finding; no retry | WARN finding/log | None. |
| Architecture artifact writes | Synchronous three-file write | `_logDir` required | Write failure WARN-only | WARN log | None. |
| Built-in validators | One adapter invocation per validator stage | Pipeline registry scheduling | Missing context returns blocking typed result; delegated exceptions propagate | Typed diagnostics/logs | None. |
| Full lint tooling | Delegated single report generation | `tier` default `full` | Missing report/tool failures block | Typed diagnostics and lint report | Details in lint batch. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Gateway complete request for architecture validator | `{model, thinking, prompt, system}`; response content/text/choices/raw expected to contain JSON array | `runAgentJudgment` | Gateway ACP/session backend | Single request with 120000 ms timeout; no streaming or flush handled locally | Findings in report/artifacts/control result. |
| Validator typed control result | `schemaVersion:'v1'`, `producerKind:'validator'`, `producerType`, `nextAction`, diagnostics | Architecture/module validator builders | Pipeline validator/gate runner | Synchronous result return; no ACP streaming | Control result diagnostics and artifacts. |
| Contract-invalid diagnostic | `PluginContractInvalidError` with diagnostic payload and safe raw/coerced previews | `contract-diagnostics.js` | Plugin boundary normalizers/callers | Synchronous throw when validation fails | Error object diagnostics. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Typed validator control-result schema and built-in adapters | `check-validator-control-result-surface.mjs` | Good contract coverage | None. |
| Scheduled validators and architecture artifacts | behavior `pipeline` | Good behavior coverage, including malformed execution-order entries | None. |
| Module validator milestones | behavior `module-failures`, `migrated-seams` | Good adapter/milestone coverage | Delegated exception paths covered by caller boundary, not P19 local tests. |
| Contract invalid diagnostics | Gate/worker/validator control-result contracts | Good indirect coverage | None. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- None open; `P19-ISSUE-001` is resolved by `EXEC_ORDER_ENTRY_INVALID` deterministic findings and behavior coverage.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
