# Batch V04a — Contract verification docs, artifacts, imports, gates, generators, and modules

Status: completed
Date started: 2026-05-09
Date completed: 2026-05-09
Reviewer: Nova

## Scope

```text
tests/verification/contracts/README.md
tests/verification/contracts/check-artifact-authority-slice-surface.mjs
tests/verification/contracts/check-critical-dynamic-imports.mjs
tests/verification/contracts/check-pipeline-complexity-budgets.mjs
tests/verification/contracts/check-gate-active-session-surface.mjs
tests/verification/contracts/check-gate-control-result-surface.mjs
tests/verification/contracts/check-gate-fix-scaffold-surface.mjs
tests/verification/contracts/check-generator-result-surface.mjs
tests/verification/contracts/check-module-runner-slice-surface.mjs
```

Scope expansion verified live: 9 files, under the 10-file maximum. All scoped files were read end to end before conclusions were written.

## Sources checked

Implementation files:

```text
kubeclaw-main/tests/verification/contracts/README.md
kubeclaw-main/tests/verification/contracts/check-artifact-authority-slice-surface.mjs
kubeclaw-main/tests/verification/contracts/check-critical-dynamic-imports.mjs
kubeclaw-main/tests/verification/contracts/check-pipeline-complexity-budgets.mjs
kubeclaw-main/tests/verification/contracts/check-gate-active-session-surface.mjs
kubeclaw-main/tests/verification/contracts/check-gate-control-result-surface.mjs
kubeclaw-main/tests/verification/contracts/check-gate-fix-scaffold-surface.mjs
kubeclaw-main/tests/verification/contracts/check-generator-result-surface.mjs
kubeclaw-main/tests/verification/contracts/check-module-runner-slice-surface.mjs
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/docs/pipeline/implementation-map/README.md
kubeclaw-main/docs/pipeline/implementation-map/batch-template.md
kubeclaw-main/docs/open-issues.md
```

## Per-file map

### `tests/verification/contracts/README.md`

Role: Documents the canonical contract-verification entrypoint and default telemetry contract path.

Imports/dependencies: None; markdown only.

Exports/public surface: Human-facing contract verification guidance.

Defines: Default `check-telemetry-contract.mjs` entrypoint and `docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md` contract path.

Important variables/state: None.

Calls out to: None.

Called by / expected callers: Operators and maintainers running contract verification.

Environment variables / CLI inputs / config fields: `--contract` is documented as optional and must point to markdown when supplied.

Paths built/read/written: Documents the canonical markdown contract path; no writes.

Authority behavior: Markdown contract, not the verifier script, owns the default contract document.

Error/retry/terminal behavior: Invalid `--contract` target is documented as caller error; no runtime logic here.

Verification coverage: Guidance only.

Findings: None found.

### `tests/verification/contracts/check-artifact-authority-slice-surface.mjs`

Role: Contract guard for pipeline artifact authority roles, surface constants, projection helpers, latest pointers, fallback telemetry, and summary bundles.

Imports/dependencies: Quiet runtime console, Node assert/fs/path/url, `skills/nova/pipeline/services/artifact-bundle.js` imported via `pathToFileURL`.

Exports/public surface: CLI script; prints `{ ok: true, checked: 81 }` on success.

Defines: Source-text export checks and runtime assertions over artifact authority helper functions.

Important variables/state: `repoRoot`, `helperPath`, `helperSource`, imported `helperMod`, policy samples for run replay, latest pointer, stale latest, mismatched session artifacts, fallback telemetry, plugin index, pipeline bundle, and summary bundle.

Calls out to: `buildPipelineArtifactAuthorityPolicy`, `projectPipelineArtifactEvidence`, `getPipelineArtifactBundle`, `buildLatestPointer`, `buildSummaryArtifactBundle`.

Called by / expected callers: Contract verification wrappers/operators.

Environment variables / CLI inputs / config fields: None beyond script cwd-derived repo root.

Paths built/read/written: Reads `skills/nova/pipeline/services/artifact-bundle.js`; no writes.

Authority behavior: Artifact roles are frozen and deny lifecycle/session/scheduler/completion/ordering authority. Run JSONL can be replay evidence; latest is pointer-only; fallback telemetry is diagnostic-only; plugin indexes are artifact references.

Error/retry/terminal behavior: Assertion failure terminates the script; no retry path.

Verification coverage: Strong source/API checks for artifact authority helper.

Findings: None found.

### `tests/verification/contracts/check-critical-dynamic-imports.mjs`

Role: Contract guard ensuring active runtime paths use static imports/registries and removed dynamic/fallback import paths stay absent.

Imports/dependencies: Quiet runtime console, Node fs/path/assert.

Exports/public surface: CLI script; supports `--source-root`; prints `{ ok: true, checked: 28 }` on success.

Defines: `parseArgs`, `readSource`, `countDynamicImports`.

Important variables/state: Source text for notification, orchestration, polling Redis completion, summary services, adapter registry, Buster suite runner, cost, common ACP monitor, and Buster Redis tool.

Calls out to: Filesystem reads only.

Called by / expected callers: Contract verification wrappers/operators.

Environment variables / CLI inputs / config fields: `--source-root`, defaulting to cwd.

Paths built/read/written: Reads multiple Nova/Buster/common runtime source files; no writes.

Authority behavior: Static adapter/registry imports own runtime dependency resolution. ACP monitor has exactly one documented lazy import due lifecycle cycle. Legacy Redis direct completion and fallback commit/push paths stay absent.

Error/retry/terminal behavior: Assertion failure terminates the script; no retry path.

Verification coverage: Strong source-text checks for critical import and removed fallback contracts.

Findings: None found.

### `tests/verification/contracts/check-pipeline-complexity-budgets.mjs`

Role: Contract guard enforcing a source line-count budget over pipeline JavaScript files.

Imports/dependencies: Quiet runtime console, Node assert/fs/path.

Exports/public surface: CLI script; supports `--source-root`; prints largest files and checked count on success.

Defines: `parseArgs`, `listJsFiles`, `countLines`.

Important variables/state: `DEFAULT_MAX_LINES = 700`, roots `skills/nova/pipeline`, `skills/buster/pipeline`, `skills/common/pipeline`, `checked`, `violations`, `sortedLargest`.

Calls out to: Recursive filesystem traversal and reads.

Called by / expected callers: Contract verification wrappers/operators.

Environment variables / CLI inputs / config fields: `--source-root`, defaulting to cwd.

Paths built/read/written: Recursively reads `.js` files under configured roots; skips `node_modules` and `.git`; no writes.

Authority behavior: Complexity budget is an architectural guardrail, not runtime authority.

Error/retry/terminal behavior: Any file over 700 lines is a terminal assertion failure with a violation list; no retry path.

Verification coverage: Broad line-budget scan.

Findings: None found.

### `tests/verification/contracts/check-gate-active-session-surface.mjs`

Role: Contract guard for shared gate active-session helper ownership and recovery authority precedence.

Imports/dependencies: Quiet runtime console, Node fs/os/path/assert/url, runtime import of `gate-active-session.js`.

Exports/public surface: CLI script; supports `--source-root`; prints `{ ok: true, checked: 31 }` on success.

Defines: `parseArgs` and assertions over helper/runner source plus runtime recovery fixture.

Important variables/state: Helper/review/Buster source text, temp root, lifecycle identity, stale gate active-session file identity, lifecycle read-model path, gate active-session path.

Calls out to: `resolveGateActiveSessionRecoveryEvidence` and imported helper exports.

Called by / expected callers: Contract verification wrappers/operators.

Environment variables / CLI inputs / config fields: `--source-root`; fixture config uses `_runId`, `_logDir`, `paths.swarm_dir`.

Paths built/read/written: Reads gate helper/runners; writes temp lifecycle read-model and stale `active-session.json` fixture.

Authority behavior: Lifecycle read-model active session overrides conflicting gate active-session file; gate files remain recovery evidence and cannot be standalone authority.

Error/retry/terminal behavior: Drift or wrong precedence assertion terminates the script; no retry path.

Verification coverage: Strong source/API/runtime fixture for gate active-session recovery authority.

Findings: None found.

### `tests/verification/contracts/check-gate-control-result-surface.mjs`

Role: Contract guard for shared gate control-result schemas, typed compatibility projection, gate-runner generic dispatch, and waitable gate control.

Imports/dependencies: Quiet runtime console, Node fs/path/assert/url, imports `control-result-mapping.js` and `gate-control-result.js`.

Exports/public surface: CLI script; supports `--source-root`; prints `{ ok: true, checked: 87 }` on success.

Defines: `parseArgs` plus source/runtime assertions over control-result helpers and runners.

Important variables/state: Source text for gate control helpers, review/Buster/approval runners and control helpers, gate-runner, remediable and waitable gate engines; imported helper modules.

Calls out to: `buildControlResultMapping`, `mapGateCompatibilityResultToControl`, `buildTypedGateControlResult`, `isGateControlResult`, validators and normalizers.

Called by / expected callers: Contract verification wrappers/operators.

Environment variables / CLI inputs / config fields: `--source-root`; no runtime config.

Paths built/read/written: Reads gate control source files; no writes.

Authority behavior: Shared gate control-result helpers own generic/typed schemas. Gate-runner resolves gate ownership through startup registry and projects typed control results to canonical pipeline step results at the edge. Compatibility-shaped plugin results are rejected even when stale callers pass `allowCompatibilityCoercion`.

Error/retry/terminal behavior: Unknown/stale compatibility coercion, source drift, or schema drift terminates the script. Remediable policy rejects `wait` until generic wait loop is active; approval timeout-continue maps to pass.

Verification coverage: Strong schema/source/API coverage for gate result contracts.

Findings: None found.

### `tests/verification/contracts/check-gate-fix-scaffold-surface.mjs`

Role: Contract guard for shared Forge fix-cycle scaffold ownership across review and Buster gates.

Imports/dependencies: Quiet runtime console, Node fs/path/assert/url, imports `gate-fix-scaffold.js`.

Exports/public surface: CLI script; supports `--source-root`; prints `{ ok: true, checked: 13 }` on success.

Defines: `parseArgs` and source/API assertions.

Important variables/state: Source text for `gate-fix-scaffold.js`, review/Buster runners, review/Buster fix-cycle adapters, shared Forge fix-cycle engine.

Calls out to: `startGateForgeFixCycleScaffold`, `finishGateForgeFixCycleScaffold` exports.

Called by / expected callers: Contract verification wrappers/operators.

Environment variables / CLI inputs / config fields: `--source-root`; no runtime config.

Paths built/read/written: Reads gate fix scaffold and runners; no writes.

Authority behavior: Shared scaffold owns Forge fix prompt artifact creation, transcript archival, and active-session persistence during fix cycles; local duplicate handling remains forbidden.

Error/retry/terminal behavior: Source/API drift terminates the script; no retry path.

Verification coverage: Focused source/API guard.

Findings: None found.

### `tests/verification/contracts/check-generator-result-surface.mjs`

Role: Contract guard for shared generator-result helper ownership and pipeline-review gateway-label identity behavior.

Imports/dependencies: Quiet runtime console, Node fs/path/assert/url, imports `generator-result.js`.

Exports/public surface: CLI script; supports `--source-root`; prints `{ ok: true, checked: 11 }` on success.

Defines: `parseArgs` and source/API assertions.

Important variables/state: Source text for generator-result helper, summary service, and case-study service.

Calls out to: `buildGeneratorArtifactRef`, `buildGeneratorResult` exports.

Called by / expected callers: Contract verification wrappers/operators.

Environment variables / CLI inputs / config fields: `--source-root`; no runtime config.

Paths built/read/written: Reads generator/summary/case-study sources; no writes.

Authority behavior: Shared generator helper owns `producerKind: 'generator'`, artifact refs, and result shape. Pipeline-review summary must resolve gateway labels through explicit identity helper and not use generic spawn labels as implicit gateway identity.

Error/retry/terminal behavior: Source/API drift terminates the script; no retry path.

Verification coverage: Focused source/API guard.

Findings: None found.

### `tests/verification/contracts/check-module-runner-slice-surface.mjs`

Role: Contract guard for module-runner extraction surfaces, worker runtime capability rename, canonical step results, validator contract diagnostics, and status-only correlation provenance.

Imports/dependencies: Quiet runtime console, Node fs/os/path/assert/url, imports module-runner helpers and registry.

Exports/public surface: CLI script; supports `--source-root`; prints `{ ok: true, checked: 76 }` on success.

Defines: `parseArgs` and `assertMalformedPreBusterValidatorPreservesDiagnostic`.

Important variables/state: Source text for module-runner, shared/forge/prebuster/attempt/preflight/Buster phase/terminal helpers, context, registry, builtins, constants; temp validator fixture repos and configs.

Calls out to: Shared helper exports, `buildModuleStepResult`, `prepareModuleForBuster`, registry `buildPluginRegistry`.

Called by / expected callers: Contract verification wrappers/operators.

Environment variables / CLI inputs / config fields: `--source-root`; fixture config uses `project`, `repo_root`, `paths.modules_dir`, `telemetry.enabled`, `_logDir`, `_runId`, `run_id`, `_pluginRegistry`.

Paths built/read/written: Reads module-runner/core/registry source; creates temp module/log dirs for malformed validator fixtures.

Authority behavior: Module runner delegates phases to extracted helpers, returns canonical pipeline step results, does not derive authoritative correlation from `status.active_agent`, and uses explicit `workerRuntime` with capability `dispatch.worker_runtime` instead of legacy `workerBackend`.

Error/retry/terminal behavior: Malformed validator plugin output fails closed before git sync/Buster and preserves rich `plugin_contract_invalid` diagnostics with raw preview; no retry path in scoped script.

Verification coverage: Strong source/API/runtime fixture coverage for module runner slice.

Findings: None found.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `check-artifact-authority-slice-surface.mjs` | `services/artifact-bundle.js` | artifact authority helpers | Imports helper and validates frozen roles/surface policies. |
| `check-critical-dynamic-imports.mjs` | runtime source files | static import/source markers | Ensures active paths use static registries/imports. |
| `check-pipeline-complexity-budgets.mjs` | `skills/**/pipeline/**/*.js` | recursive line budget scan | Scans all JavaScript files under Nova/Buster/common pipeline roots. |
| `check-gate-active-session-surface.mjs` | `services/gate-active-session.js` and gate runners | active-session helpers/recovery | Validates lifecycle read-model precedence. |
| `check-gate-control-result-surface.mjs` | gate control helpers/runners | control-result mapping/validation | Validates shared typed gate result contract and generic gate-runner dispatch. |
| `check-gate-fix-scaffold-surface.mjs` | gate fix scaffold/runners | fix scaffold start/finish | Validates shared Forge fix-cycle scaffold ownership. |
| `check-generator-result-surface.mjs` | generator-result/summary/case-study | generator result helpers | Validates shared generator artifact/result helper and gateway label identity. |
| `check-module-runner-slice-surface.mjs` | module runner helpers/registry/context | module phase/result/validator helpers | Validates extracted module-runner slices and plugin runtime contract. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `check-critical-dynamic-imports.mjs` / `parseArgs` | token equals `--source-root` | argv | source root override | Makes source checks reusable outside cwd. |
| `check-pipeline-complexity-budgets.mjs` / `listJsFiles` | entry is directory/file and not `node_modules`/`.git` | filesystem entry type/name | recurse or count `.js` file | Keeps budget scan scoped to relevant source. |
| `check-gate-control-result-surface.mjs` / control mappings | gate type and exit/failure class | review/Buster/approval compatibility facts | typed nextAction/issueType/outcomeClass | Documents compatibility projection at edges only. |
| `check-module-runner-slice-surface.mjs` / `buildModuleStepResult` fixture | only status `active_agent` has identity | status-only provenance | null authoritative correlation; provenance retained | Prevents stale status from becoming authority. |
| `check-module-runner-slice-surface.mjs` / pre-Buster validator fixture | plugin result lacks required diagnostics object | malformed validator result | terminal fail with contract diagnostic before git sync/Buster | Fail-closed plugin contract enforcement. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `check-gate-active-session-surface.mjs` fixture | temp lifecycle read-model and stale gate file | lifecycle identity and stale file identity | lifecycle read-model overrides conflicting gate file | active session comes from lifecycle; stale file remains evidence. |
| `check-module-runner-slice-surface.mjs` fixture | temp module/log dirs | malformed validator plugin output | terminal diagnostic built without invoking handleFail/git sync/Buster | rich `plugin_contract_invalid` diagnostic preserved. |
| Contract scripts generally | no repo state mutation | source text/API checks | assertion-only | Production source remains unchanged. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `check-pipeline-complexity-budgets.mjs` / `listJsFiles` | recursive directory entries remain | none | none | all eligible `.js` files scanned. |
| Contract scripts generally | none found in scoped files | None found in scoped files | None found in scoped files | assertion pass/fail. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `--source-root` | CLI flag | V04a contract scripts except artifact helper and README | cwd | Resolves source tree under test. |
| `--contract` | CLI flag documented | `tests/verification/contracts/README.md` | default markdown contract | Must point to markdown contract, not verifier script. |
| `_runId`, `run_id`, `_logDir`, `paths.swarm_dir` | fixture config | `check-gate-active-session-surface.mjs` | temp dirs | Builds lifecycle read-model and gate active-session evidence. |
| `project`, `repo_root`, `paths.modules_dir`, `telemetry.enabled`, `_pluginRegistry` | fixture config | `check-module-runner-slice-surface.mjs` | temp dirs/built-in registry | Drives malformed pre-Buster validator contract fixture. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| `docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md` | documented default | contract verifier operators | docs | Canonical markdown contract path. |
| `skills/nova/pipeline/services/artifact-bundle.js` | repo source | artifact authority contract | production source | Artifact authority helper surface. |
| `skills/**/pipeline/**/*.js` | repo source | complexity budget contract | production source | Must stay at or under 700 lines/file. |
| `.swarm/logs/pipeline/runs/<run>/lifecycle/read-models.json` | fixture | gate active-session helper | fixture | Lifecycle read-model authority. |
| `.swarm/logs/gates/<gate>/active-session.json` | fixture | gate active-session helper | fixture | Recovery evidence only when lifecycle conflicts. |
| temp module/log directories | module-runner contract fixture | pre-Buster helper | fixture | Validator contract failure fixture. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Pipeline artifact authority roles | `artifact-bundle.js` helper | artifact contract/checks/operators | None. |
| Critical import/adapter topology | static source imports and adapter registry | dynamic-import contract | None. |
| Complexity budget | contract script with 700-line default | operators/CI | None. |
| Gate active-session authority | lifecycle read-model | gate active-session recovery helper | None. |
| Gate control result schema | shared `gate-control-result.js` helpers | gate runners, gate-runner, contracts | None. |
| Gate Forge fix scaffold | `gate-fix-scaffold.js` | review/Buster fix-cycle adapters | None. |
| Generator result schema | `generator-result.js` | summary/case-study services | None. |
| Module runner phase/result contracts | extracted module-runner helpers and plugin registry | module runner, validators, contracts | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Artifact authority policy | `artifact-bundle.js` | `role`, `operator_replay_authority`, `operator_pointer_only`, `diagnostic_evidence_only`, `allow_*_authority`, identity drift booleans | `buildPipelineArtifactAuthorityPolicy` | artifact bundle readers/contracts. |
| Gate active-session recovery evidence | `gate-active-session.js` | `policy.code`, `active_session_authority_source`, lifecycle/file roles, conflict flags, `active` identity | `resolveGateActiveSessionRecoveryEvidence` | gate recovery. |
| Gate control result | `gate-control-result.js` | `producerType`, `nextAction`, `issueType`, `outcomeClass`, optional typed `wait` metadata and diagnostics | `validate*GateControlResult`, `normalize*GateControlResult` | gate runners and scheduler projection. |
| Generator result | `generator-result.js` | `producerKind:'generator'`, producer type, artifact refs/result outputs | `buildGeneratorArtifactRef`, `buildGeneratorResult` | summary/case-study services. |
| Module terminal/step result | module-runner helpers | canonical pipeline step result with correlation and provenance | `buildModuleStepResult`, terminal result builders | pipeline runner. |
| Plugin contract invalid diagnostic | pre-Buster helper | `diagnosticType:'plugin_contract_invalid'`, `stageId`, `hookFamily`, `moduleId`, `producerType`, `validationErrors`, `rawResultPreview` | pre-Buster validator normalization | module terminal failure handling. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Gate Forge fix prompt scaffold | `gate-fix-scaffold.js` checked by `check-gate-fix-scaffold-surface.mjs` | `forge-fix-prompt-cycle-*` | Prompt content not inspected in scoped contract file | Forge fix-cycle runtime | Shared scaffold owns prompt artifact creation and transcript archival. |
| Pipeline review summary identity | `summary.js` checked by `check-generator-result-surface.mjs` | summary artifacts | Prompt content not inspected in scoped contract file | summary runtime | Gateway label must come from explicit identity helper, not generic label fallback. |
| Module workers/validators | module-runner shared/pre-Buster helpers checked by module contract | module runtime artifacts not directly inspected | Prompt content not inspected in scoped contract file | stage-owner registry `worker.run`/`validator.run` | Typed plugin outputs; malformed validator output fails closed with contract diagnostic. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| Contract scripts | source/API/assertion drift | No | none | terminal assertion failure | none. |
| `check-pipeline-complexity-budgets.mjs` | file exceeds 700 lines | No | none | terminal assertion with violation list | none. |
| `check-gate-active-session-surface.mjs` | stale gate active-session conflicts with lifecycle | recovery evidence only | none | lifecycle identity wins; stale file retained as evidence | none. |
| `check-gate-control-result-surface.mjs` | compatibility-shaped plugin result at plugin boundary | No | none | throws terminal contract error | none. |
| `check-module-runner-slice-surface.mjs` | malformed validator plugin output | No | none | terminal module failure before git sync/Buster; rich contract diagnostic | raw result preview is bounded by diagnostic helper. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| Contract scripts | assertion/source drift | Yes/partial | process exit/stderr | assertion error | Node assert / verifier wrapper | Adequate for contract verification. |
| `check-pipeline-complexity-budgets.mjs` | line budget exceeded | Yes/partial | assertion message/stdout context | violation list | contract script | No runtime telemetry expected. |
| `check-gate-active-session-surface.mjs` | stale gate file conflicts | Yes/partial | returned recovery policy fixture | `lifecycle_active_session_overrides_conflicting_gate_file` | gate active-session helper | Contract validates diagnostic evidence shape. |
| `check-gate-control-result-surface.mjs` | compatibility-shaped result rejected | Yes/partial | thrown error assertion | `compatibility-shaped results are not accepted...` | gate control-result helper | No Redis telemetry expected in contract script. |
| `check-module-runner-slice-surface.mjs` | malformed validator output | Yes | terminal result diagnostics | `plugin_contract_invalid` diagnostic | pre-Buster helper | Runtime diagnostic is asserted; telemetry disabled in fixture. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js | Runtime binary | Node runtime | all V04a contract scripts | ESM execution, assert, filesystem reads/imports | Required. |
| Quiet runtime console helper | local verification helper | repo source | all V04a scripts | suppress noisy runtime logs | Restored before JSON output. |
| `pathToFileURL` dynamic import | Node URL API | Node runtime | artifact/gate/generator/module contracts | Import production ESM helpers for API assertions | Contract-local dynamic import only. |
| Filesystem/temp dirs | Node fs/os/path | Node runtime | gate active-session and module-runner fixtures | Build temporary evidence/fixture repos | Clean-up not explicit in scoped files. |
| Production source modules | repo source | local tree | V04a contracts | Source text/API contracts | Drift fails fast. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Complexity scan | 700 lines per `.js` file | `DEFAULT_MAX_LINES = 700` | assertion failure with violation list | JSON output includes largest files on success | None. |
| Recursive source scan | skip `node_modules` and `.git` | hardcoded | excludes vendored/git internals | checked count/largest list | None. |
| Contract scripts generally | sequential assertions | Node process | first assertion failure exits | process stderr/stdout | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Gate active-session recovery | lifecycle read-model active session vs gate `active-session.json` evidence | lifecycle/gate active-session helper | gate recovery | no polling in scoped script | temp read-model and active-session fixture. |
| Gate control wait result | typed approval wait control with `wait.schemaVersion`, `waitKind`, `waitRef`, `status` | gate control helper | approval/waitable gate runtime | no flush in scoped script | typed result assertions. |
| Generator/pipeline-review identity | explicit gateway-label resolver, no generic label fallback | summary service | Discord/telemetry consumers | no ACP calls in scoped script | source assertions. |
| Module runner correlation | canonical step result `correlation` plus diagnostic `correlation_provenance` | module-runner helper | pipeline runner | no ACP calls in scoped script | status-only active-agent fixture. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Artifact authority roles and surfaces | `check-artifact-authority-slice-surface.mjs` | High helper API coverage | None found. |
| Critical dynamic import removal/static registry ownership | `check-critical-dynamic-imports.mjs` | High source coverage | None found. |
| Pipeline file complexity budget | `check-pipeline-complexity-budgets.mjs` | Broad source scan | None found. |
| Gate active-session recovery authority | `check-gate-active-session-surface.mjs` | High source/API/fixture coverage | None found. |
| Gate control result schema/dispatch | `check-gate-control-result-surface.mjs` | High source/API coverage | None found. |
| Gate fix scaffold ownership | `check-gate-fix-scaffold-surface.mjs` | Medium source/API coverage | None found. |
| Generator result ownership and gateway-label identity | `check-generator-result-surface.mjs` | Medium source/API coverage | None found. |
| Module-runner slice and validator contract diagnostics | `check-module-runner-slice-surface.mjs` | High source/API/fixture coverage | None found. |

Validation evidence:

```text
node --check tests/verification/contracts/check-artifact-authority-slice-surface.mjs
node --check tests/verification/contracts/check-critical-dynamic-imports.mjs
node --check tests/verification/contracts/check-pipeline-complexity-budgets.mjs
node --check tests/verification/contracts/check-gate-active-session-surface.mjs
node --check tests/verification/contracts/check-gate-control-result-surface.mjs
node --check tests/verification/contracts/check-gate-fix-scaffold-surface.mjs
node --check tests/verification/contracts/check-generator-result-surface.mjs
node --check tests/verification/contracts/check-module-runner-slice-surface.mjs
node tests/verification/contracts/check-artifact-authority-slice-surface.mjs # {"ok":true,"checked":81}
node tests/verification/contracts/check-critical-dynamic-imports.mjs --source-root "$PWD" # {"ok":true,"checked":28}
node tests/verification/contracts/check-pipeline-complexity-budgets.mjs --source-root "$PWD" # {"ok":true,"defaultMaxLines":700,"checked":253}
node tests/verification/contracts/check-gate-active-session-surface.mjs --source-root "$PWD" # {"ok":true,"checked":31}
node tests/verification/contracts/check-gate-control-result-surface.mjs --source-root "$PWD" # {"ok":true,"checked":87}
node tests/verification/contracts/check-gate-fix-scaffold-surface.mjs --source-root "$PWD" # {"ok":true,"checked":13}
node tests/verification/contracts/check-generator-result-surface.mjs --source-root "$PWD" # {"ok":true,"checked":11}
node tests/verification/contracts/check-module-runner-slice-surface.mjs --source-root "$PWD" # {"ok":true,"checked":76}
git diff --check
```

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- None yet.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
