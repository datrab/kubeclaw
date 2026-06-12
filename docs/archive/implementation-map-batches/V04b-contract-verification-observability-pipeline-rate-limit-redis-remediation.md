# Batch V04b — Contract verification observability, pipeline, rate-limit, Redis, and remediation

Status: completed
Date started: 2026-05-09
Date completed: 2026-05-09
Reviewer: Nova

## Scope

```text
tests/verification/contracts/check-observability-catch-reporting.mjs
tests/verification/contracts/check-operator-alert-surface.mjs
tests/verification/contracts/check-pipeline-entrypoint-shim-surface.mjs
tests/verification/contracts/check-pipeline-runner-slice-surface.mjs
tests/verification/contracts/check-pipeline-step-result-surface.mjs
tests/verification/contracts/check-rate-limit-slice-surface.mjs
tests/verification/contracts/check-redis-completion-service-surface.mjs
tests/verification/contracts/check-redis-log-ownership.mjs
tests/verification/contracts/check-remediation-handoff-surface.mjs
```

Scope expansion verified live: 9 files, under the 10-file maximum. All scoped files were read end to end before conclusions were written.

## Sources checked

Implementation files:

```text
kubeclaw-main/tests/verification/contracts/check-observability-catch-reporting.mjs
kubeclaw-main/tests/verification/contracts/check-operator-alert-surface.mjs
kubeclaw-main/tests/verification/contracts/check-pipeline-entrypoint-shim-surface.mjs
kubeclaw-main/tests/verification/contracts/check-pipeline-runner-slice-surface.mjs
kubeclaw-main/tests/verification/contracts/check-pipeline-step-result-surface.mjs
kubeclaw-main/tests/verification/contracts/check-rate-limit-slice-surface.mjs
kubeclaw-main/tests/verification/contracts/check-redis-completion-service-surface.mjs
kubeclaw-main/tests/verification/contracts/check-redis-log-ownership.mjs
kubeclaw-main/tests/verification/contracts/check-remediation-handoff-surface.mjs
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/docs/pipeline/implementation-map/README.md
kubeclaw-main/docs/pipeline/implementation-map/batch-template.md
kubeclaw-main/docs/open-issues.md
```

## Per-file map

### `tests/verification/contracts/check-observability-catch-reporting.mjs`

Role: Contract guard preventing silent catch/no-op error handling in observability, telemetry, Discord, notification, and Buster logging surfaces.

Imports/dependencies: Quiet runtime console, Node assert/fs/path.

Exports/public surface: CLI script; supports generic `--source-root` parsing; prints checked source count.

Defines: `parseArgs`, `scopedFiles`, `bannedPatterns` for bare catch, empty promise catch, and noop error listener.

Important variables/state: 14 scoped source file paths and regex patterns.

Calls out to: Filesystem source reads only.

Called by / expected callers: Contract verification wrappers/operators.

Environment variables / CLI inputs / config fields: `--source-root`, defaulting to cwd.

Paths built/read/written: Reads common redaction/noncritical reporting, Nova telemetry/observability/failures/notification/Discord, and Buster telemetry/Discord/logger sources; no writes.

Authority behavior: Ensures error handling paths do not silently drop observability.

Error/retry/terminal behavior: Any banned pattern causes terminal assertion failure.

Verification coverage: Broad source-text guard for silent error handling.

Findings: None found.

### `tests/verification/contracts/check-operator-alert-surface.mjs`

Role: Contract guard that operator-only alerts flow through `emitOperatorAlert` and registry-owned Discord telemetry sink, not direct telemetry fallback paths.

Imports/dependencies: Quiet runtime console, Node fs/path/assert/url, imports telemetry, registry, runtime modules.

Exports/public surface: CLI script; supports `--source-root`; prints `{ ok: true, checked: 7 }` on success.

Defines: `parseArgs`, source assertions, and two runtime alert delivery fixtures.

Important variables/state: Source text for module runner, Buster phase/spawn failure, pipeline runner/terminal, telemetry, sink contract; `directCalls`, `fallbackCalls` arrays.

Calls out to: `emitOperatorAlert`, `onGateFail`, `buildPluginRegistry`, `createRunStats`.

Called by / expected callers: Contract verification wrappers/operators.

Environment variables / CLI inputs / config fields: `--source-root`; fixture configs use `project`, `telemetry.enabled:false`, `_runId`, `run_id`, `_runStats`, `_pluginRegistry`, `_testOverrides.moduleRunner.discord`, `_testOverrides.busterGate.discord`.

Paths built/read/written: Reads runtime source files; no writes.

Authority behavior: Operator presentation is delivered by telemetry sink plugins; telemetry spine must not keep ambiguous direct Discord fallback wording.

Error/retry/terminal behavior: Source/API drift or missing sink dispatch fails the script.

Verification coverage: Source and runtime fixture coverage for operator alert sink routing.

Findings: None found.

### `tests/verification/contracts/check-pipeline-entrypoint-shim-surface.mjs`

Role: Contract guard keeping `skills/nova/pipeline.js` a thin executable compatibility shim over `pipeline/index.js` and `pipeline/cli.js`.

Imports/dependencies: Quiet runtime console, Node fs/path/assert/url.

Exports/public surface: CLI script; supports `--source-root`; prints `{ ok: true, checked: 14 }` on success.

Defines: `parseArgs`, source/API assertions.

Important variables/state: Entry, index, and verification README source text.

Calls out to: Dynamic imports of entry and index modules.

Called by / expected callers: Contract verification wrappers/operators.

Environment variables / CLI inputs / config fields: `--source-root`.

Paths built/read/written: Reads `skills/nova/pipeline.js`, `skills/nova/pipeline/index.js`, `tests/verification/README.md`; no writes.

Authority behavior: Entry shim re-exports index default/runPipeline and does not expose CLI-only `main` or import runners/services directly.

Error/retry/terminal behavior: Shim growth or doc drift fails the script.

Verification coverage: Focused source/API guard.

Findings: None found.

### `tests/verification/contracts/check-pipeline-runner-slice-surface.mjs`

Role: Contract guard for pipeline-runner extraction surfaces, typed step-result terminal authority, scheduler/recovery helper exports, and raw compatibility authority rejection.

Imports/dependencies: Quiet runtime console, Node fs/path/assert/url, imports runner helpers.

Exports/public surface: CLI script; supports `--source-root`; prints `{ ok: true, checked: 56 }` on success.

Defines: `parseArgs` and source/API/correlation assertions.

Important variables/state: Source text for main/shared/scheduling/recovery/deps/start/loop/terminal runner files; imported modules; raw nested status correlation fixture.

Calls out to: `runPipeline`, `runScheduledGenerator`, `findNextStep`, `normalizeStepResultForPipeline`, `finalizeTerminalHalt`, `buildResultWithStepCorrelation`, lock/recovery exports.

Called by / expected callers: Contract verification wrappers/operators.

Environment variables / CLI inputs / config fields: `--source-root`; fixture config includes project and module path data.

Paths built/read/written: Reads runner sources; no writes.

Authority behavior: Main runner delegates to slices, preserves `PIPELINE_RUN_CONCURRENCY_LIMIT = 1`, scheduler no longer branches on concrete gate types, terminal halt reads typed step-result authority, and raw nested status identity is not authoritative correlation.

Error/retry/terminal behavior: Source/API drift fails; terminal helper must reject compatibility authority and use typed operator reason/rate-limit authority.

Verification coverage: Strong source/API fixture for pipeline runner slice.

Findings: None found.

### `tests/verification/contracts/check-pipeline-step-result-surface.mjs`

Role: Contract guard for canonical pipeline step-result schema, compatibility projection boundaries, authority policy, exit/outcome mappings, rate-limit details, retry/request-fix nonterminal states, and typed diagnostics sanitization.

Imports/dependencies: Quiet runtime console, Node fs/path/assert/url, imports `pipeline-step-result.js`.

Exports/public surface: CLI script; supports `--source-root`; prints `{ ok: true, checked: 92 }` on success.

Defines: `parseArgs` plus extensive source/API result assertions.

Important variables/state: Helper source, runner projection file list, imported helper module, typed pass/needs-Nova/rate-limit/retry/request-fix fixtures.

Calls out to: `buildPipelineStepResult`, `buildPipelineStepResultFromControlResult`, `buildPipelineStepResultFromCompatibilityResult`, `projectPipelineStepCompatibilityResult`, `attachPipelineStepCompatibilityProjection`, `buildPipelineStepResultAuthorityPolicy`, validators and mappers.

Called by / expected callers: Contract verification wrappers/operators.

Environment variables / CLI inputs / config fields: `--source-root`.

Paths built/read/written: Reads step-result helper and runner projection sources; no writes.

Authority behavior: Typed step result is authoritative; compatibility exit/status/reason/rate-limit/lifecycle fields are rejected authority and only edge projection evidence. Typed outcomes override conflicting compatibility metadata.

Error/retry/terminal behavior: Invalid typed action/outcome contradictions throw. Nonterminal retry/request_fix do not project exit codes. Rate-limit details come from typed diagnostics.

Verification coverage: Very strong schema/API coverage.

Findings: None found.

### `tests/verification/contracts/check-rate-limit-slice-surface.mjs`

Role: Contract guard for rate-limit service split between main surface, builders, exhaustion options, and exit helpers.

Imports/dependencies: Quiet runtime console, Node fs/path/assert/url.

Exports/public surface: CLI script; supports `--source-root`; prints `{ ok: true, checked: 21 }` on success.

Defines: `parseArgs` and source/API assertions.

Important variables/state: Source text for `rate-limit.js`, `rate-limit-builders.js`, `rate-limit-builders/exhaustion-options.js`, and `rate-limit-exit.js`.

Calls out to: Imported main/builders/exit module exports.

Called by / expected callers: Contract verification wrappers/operators.

Environment variables / CLI inputs / config fields: `--source-root`.

Paths built/read/written: Reads rate-limit source files; no writes.

Authority behavior: Main rate-limit surface re-exports/imports extracted helpers and does not retain extracted implementations locally.

Error/retry/terminal behavior: Source/API drift fails the script.

Verification coverage: Focused slice contract.

Findings: None found.

### `tests/verification/contracts/check-redis-completion-service-surface.mjs`

Role: Contract guard that Redis completion identity normalization, tail scanning, stream decoding, and chunked archival live in `services/redis-completion.js`, while `tools/redis.js` re-exports for compatibility.

Imports/dependencies: Quiet runtime console, Node assert/fs/path/url.

Exports/public surface: CLI script; supports `--source-root`; prints `{ ok: true, checked: 18 }` on success.

Defines: `parseArgs` and source/API assertions.

Important variables/state: Source text for Redis tool and completion service.

Calls out to: Imported Redis tool and completion service exports.

Called by / expected callers: Contract verification wrappers/operators.

Environment variables / CLI inputs / config fields: `--source-root`.

Paths built/read/written: Reads Redis source files; no writes.

Authority behavior: Completion service owns helper implementations; Redis tool keeps adapter methods and compatibility re-exports only.

Error/retry/terminal behavior: Duplicate helper implementations or missing exports fail the script.

Verification coverage: Focused source/API guard.

Findings: None found.

### `tests/verification/contracts/check-redis-log-ownership.mjs`

Role: Contract guard that Redis exchange logging belongs to `services/redis-log.js`, not `observability.js`.

Imports/dependencies: Quiet runtime console, Node fs/path/assert/url.

Exports/public surface: CLI script; supports `--source-root`; prints `{ ok: true, checked: 8 }` on success.

Defines: `parseArgs` and source/API assertions.

Important variables/state: Observability and Redis log source/imported modules.

Calls out to: Imported modules for export checks.

Called by / expected callers: Contract verification wrappers/operators.

Environment variables / CLI inputs / config fields: `--source-root`.

Paths built/read/written: Reads observability and Redis log sources; no writes.

Authority behavior: `redis-log.js` owns `logRedisExchange`, `logRedisSent`, and `logRedisReceived`; observability must not duplicate/export Redis logging helper.

Error/retry/terminal behavior: Duplicate ownership or missing exports fail the script.

Verification coverage: Focused ownership guard.

Findings: None found.

### `tests/verification/contracts/check-remediation-handoff-surface.mjs`

Role: Contract guard for shared remediable gate engine, remediation handoff service, typed remediation request/exhaustion controls, and review/Buster remediation controller factories.

Imports/dependencies: Quiet runtime console, Node fs/path/assert/url, imports remediation, engine, gate, review, and Buster modules.

Exports/public surface: CLI script; supports `--source-root`; prints `{ ok: true, checked: 44 }` on success.

Defines: `parseArgs` and source/API remediation assertions.

Important variables/state: Source text for gate/review/Buster runners/control helpers, remediable gate engine, remediation-handoff service, registry; sample remediation control result.

Calls out to: `buildGateRemediationRequestControlResult`, `validateGateRemediationControlResult`, `runRemediableGateControlLoop`, `runScheduledRemediableGate`, remediation controller factories.

Called by / expected callers: Contract verification wrappers/operators.

Environment variables / CLI inputs / config fields: `--source-root`.

Paths built/read/written: Reads remediation/gate source files; no writes.

Authority behavior: Gate-runner/review/Buster delegate remediation loops to shared remediable engine and remediation-handoff service; registry no longer builds gate-specific remediation callback bundles; typed exhausted control results replace compatibility exhausted results.

Error/retry/terminal behavior: Source/API drift fails. Remediation request control validates `nextAction:'request_fix'`; exhausted paths must return typed control results.

Verification coverage: Strong source/API coverage for remediation handoff.

Findings: None found.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `check-observability-catch-reporting.mjs` | observability/telemetry/Discord/logger sources | banned catch/no-op patterns | Prevents silent error handling. |
| `check-operator-alert-surface.mjs` | telemetry and sink registry | `emitOperatorAlert`, `onGateFail` | Verifies Discord sink plugin delivery. |
| `check-pipeline-entrypoint-shim-surface.mjs` | pipeline shim/index | re-export/default export | Keeps top-level entrypoint thin. |
| `check-pipeline-runner-slice-surface.mjs` | pipeline runner slices | start/loop/terminal/recovery/deps helpers | Verifies extracted runner architecture. |
| `check-pipeline-step-result-surface.mjs` | pipeline step-result contract | builders/validators/projections | Verifies typed step authority. |
| `check-rate-limit-slice-surface.mjs` | rate-limit builders/exit | re-exported helper APIs | Verifies split rate-limit surface. |
| `check-redis-completion-service-surface.mjs` | Redis tool/service | completion helpers and adapter methods | Verifies service ownership/re-export compatibility. |
| `check-redis-log-ownership.mjs` | observability/redis-log | Redis exchange logging exports | Verifies single logging owner. |
| `check-remediation-handoff-surface.mjs` | remediation/gate engine/runners | remediation request/control/controller APIs | Verifies shared typed remediation handoff. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `check-observability-catch-reporting.mjs` | banned regex match | source text | assertion failure | Prevents silent failure swallowing. |
| `check-operator-alert-surface.mjs` | telemetry disabled but presentation present | fixture config/presentation | dispatch through Discord telemetry sink | Keeps operator alerts plugin-owned. |
| `check-pipeline-entrypoint-shim-surface.mjs` | entry module import/execution boundary | source/export shape | index re-export and CLI import only | Prevents entrypoint regrowth. |
| `check-pipeline-runner-slice-surface.mjs` | raw nested status correlation only | status/module_status fields | null authoritative correlation | Prevents stale compatibility/status authority. |
| `check-pipeline-step-result-surface.mjs` | typed outcome conflicts with compatibility data | typed result and compatibility projection | typed result wins; compatibility becomes projection only | Core scheduler authority boundary. |
| `check-pipeline-step-result-surface.mjs` | retry/request_fix action | typed control action | nonterminal outcome with null exit code | Avoids premature terminal projection. |
| `check-remediation-handoff-surface.mjs` | initial control result requests fix | `nextAction:'request_fix'` | shared remediation handoff loop | Centralizes remediation mechanics. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `check-operator-alert-surface.mjs` fixtures | `directCalls` / `fallbackCalls` arrays | Discord sink callbacks | one sink call per operator presentation | Exactly one operator alert emitted. |
| `check-pipeline-step-result-surface.mjs` builders | in-memory typed step result | typed control/result plus compatibility data | strip/reject compatibility authority; typed diagnostics retained | Canonical projection consistent with typed outcome. |
| `check-remediation-handoff-surface.mjs` fixture | remediation control result object | gate/run/remediation policy/findings | typed request_fix contract | Valid remediation control result. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| V04b scripts generally | no runtime polling loops in scoped contract files | None found in scoped files | None found in scoped files | assertion pass/fail. |
| `check-observability-catch-reporting.mjs` | each scoped file and each banned pattern | none | none | all file/pattern combinations checked. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `--source-root` | CLI flag | all V04b contract scripts | cwd | Resolves source tree under test. |
| Operator alert fixture config | Runtime fixture | `check-operator-alert-surface.mjs` | in-memory | `telemetry.enabled:false`, run stats, plugin registry, test Discord sinks. |
| Pipeline/step/remediation fixture objects | Runtime fixture | V04b contract scripts | in-memory | Typed result/control/remediation sample payloads. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| `skills/nova/pipeline.js` | repo source | entrypoint shim contract | source | Thin executable compatibility shim. |
| `skills/nova/pipeline/runners/pipeline-runner*.js` | repo source | pipeline runner contract | source | Runner slices and terminal authority. |
| `skills/nova/pipeline/services/contracts/pipeline-step-result.js` | repo source | step-result contract | source | Canonical typed pipeline step result schema. |
| `skills/nova/pipeline/services/rate-limit*.js` | repo source | rate-limit slice contract | source | Split rate-limit builders/exit/main surfaces. |
| `skills/nova/pipeline/services/redis-completion.js` | repo source | Redis completion contract | source | Completion helper implementation owner. |
| `skills/nova/pipeline/services/redis-log.js` | repo source | Redis log ownership contract | source | Redis exchange logging owner. |
| `skills/nova/pipeline/services/remediation-handoff.js` | repo source | remediation contract | source | Typed remediation request/handoff owner. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Operator alert delivery | telemetry sink registry / Discord sink plugin | module/gate/pipeline alert callers | None. |
| Pipeline entrypoint public API | `pipeline/index.js`; shim re-exports | CLI/operators/importers | None. |
| Pipeline runner terminal authority | typed pipeline step result contract | pipeline terminal helper | None. |
| Pipeline step result | `pipeline-step-result.js` | gate/module/pipeline runners | None. |
| Rate-limit helper ownership | builders and exit helper modules | rate-limit main surface/callers | None. |
| Redis completion helpers | `services/redis-completion.js` | `tools/redis.js`, polling/gates | Existing P17 schema-owner issue remains applicable. |
| Redis exchange logging | `services/redis-log.js` | Redis callers/operators | None. |
| Remediation handoff | `remediation-handoff.js` and remediable gate engine | gate/review/Buster runners | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Operator alert presentation | telemetry callers | `presentation.discord.level/title/description/fields` plus run/module/gate context | telemetry sink dispatch | Discord sink/test overrides. |
| Pipeline step result | `pipeline-step-result.js` | `schemaVersion`, `kind`, `stepType`, `stepId`, `nextAction`, `outcome`, `reason`, `correlation`, `diagnostics`, `compatibility` | `validatePipelineStepResult`, `assertPipelineStepResult` | pipeline terminal/gate/module runners. |
| Pipeline step authority policy | `pipeline-step-result.js` | `role`, typed authority booleans, `allow_compatibility_*_authority:false`, rejected authority paths | `buildPipelineStepResultAuthorityPolicy` | operators/contracts. |
| Rate-limit exit/result helpers | `rate-limit-exit.js` | session/module/gate/summary rate-limit terminal/result shapes | rate-limit finalizers/builders | pipeline/gate/module/summary paths. |
| Redis completion helper API | `redis-completion.js` | expected identity, completion stream entry, conflict/archive result shapes | identity normalizer/tail scanner/archive chunker | Redis tool/polling/gates. |
| Remediation request control | `remediation-handoff.js` | `nextAction:'request_fix'`, producer/gate/run/attempt/findings/remediation policy | `validateGateRemediationControlResult` | remediable gate engine and gate runners. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Operator alert Discord sink | telemetry sink registry | Discord audit/runtime sink | No prompt content in scoped files | Discord sink plugin/test override | One presentation delivery per alert. |
| Remediable gate fix loop | remediable engine + remediation handoff | gate fix artifacts owned by adjacent scaffold | Prompt content not inspected in scoped files | remediation controller factories | Typed `request_fix` / exhausted control results. |
| Pipeline/gate/module runners | typed step/control contracts | runtime artifacts not inspected | Prompt content not inspected in scoped files | stage/gate/module owners | Typed control/step outputs; compatibility only projection evidence. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `check-observability-catch-reporting.mjs` | silent catch/no-op error handler | No | none | terminal assertion failure | none. |
| `check-operator-alert-surface.mjs` | missing sink route/direct fallback drift | No | none | terminal assertion failure | none. |
| `check-pipeline-entrypoint-shim-surface.mjs` | entrypoint regrowth/API drift | No | none | terminal assertion failure | none. |
| `check-pipeline-runner-slice-surface.mjs` | compatibility/status authority drift | No | none | terminal assertion failure | none. |
| `check-pipeline-step-result-surface.mjs` | invalid typed action/outcome or compatibility authority leak | No | none | throws/terminal assertion failure | metadata compatibility authority is stripped. |
| `check-rate-limit-slice-surface.mjs` | helper ownership/export drift | No | none | terminal assertion failure | none. |
| `check-redis-completion-service-surface.mjs` | duplicate/missing completion helper owner | No | none | terminal assertion failure | none. |
| `check-redis-log-ownership.mjs` | duplicate Redis log owner | No | none | terminal assertion failure | none. |
| `check-remediation-handoff-surface.mjs` | missing typed remediation request/controller/handoff | No | none | terminal assertion failure | none. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| V04b contract scripts | assertion/source/API drift | Yes/partial | process stderr/stdout | assertion error / JSON success output | Node assert/verifier wrapper | Adequate for contract verification. |
| `check-operator-alert-surface.mjs` | operator alert delivery path | Yes | Discord sink callback fixture | direct/fallback operator alert call arrays | `emitOperatorAlert`, `onGateFail` | Exactly one sink call asserted. |
| `check-pipeline-step-result-surface.mjs` | compatibility authority leak | Yes/partial | typed result diagnostics/authority policy | rejected authority policy and stripped metadata | step-result helper | Runtime telemetry is not emitted by contract script. |
| `check-remediation-handoff-surface.mjs` | remediation request handoff | Yes/partial | typed control result object | remediation request control | remediation handoff helper | Runtime telemetry not exercised in scoped script. |
| Redis/rate-limit/entrypoint/runner ownership checks | source/API drift | Yes/partial | process stderr/stdout | assertion error | contract scripts | No runtime Redis/Discord required. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js | Runtime binary | Node runtime | all V04b contract scripts | ESM execution, assert, filesystem, dynamic imports | Required. |
| Quiet runtime console helper | local verification helper | repo source | all V04b scripts | suppress noisy runtime logs | Restored before JSON output. |
| `pathToFileURL` dynamic import | Node URL API | Node runtime | operator/entrypoint/runner/step/rate/Redis/remediation contracts | Production ESM helper import for API assertions | Contract-local only. |
| Production source modules | repo source | local tree | all V04b scripts | Source/API contract validation | Drift fails fast. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Pipeline runner | one pipeline run lock | `PIPELINE_RUN_CONCURRENCY_LIMIT = 1` | lock/recovery helper owns run concurrency | source/API assertions | None. |
| Observability catch scan | 14 source files x 3 banned pattern classes | hardcoded list | first assertion failure exits | assertion message | None. |
| Contract scripts | sequential assertions | Node process | first assertion failure exits | JSON success / stderr failure | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Pipeline step correlation | typed result correlation plus rejected/provenance compatibility projection | step-result/pipeline runner helpers | pipeline terminal/telemetry consumers | no ACP calls in scoped scripts | source/API assertions. |
| Operator alert identity | run/module/gate context in presentation payload | telemetry callers | Discord sink | no ACP calls in scoped scripts | sink callback arrays. |
| Remediation handoff | typed remediation request control with gate/run/attempt/findings/policy | remediation handoff helper | remediable gate engine/controllers | no ACP calls in scoped scripts | control result validation. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Silent catch/no-op observability prevention | `check-observability-catch-reporting.mjs` | Broad source regex guard | None found. |
| Operator alert sink routing | `check-operator-alert-surface.mjs` | Source plus runtime fixture | None found. |
| Pipeline entrypoint shim | `check-pipeline-entrypoint-shim-surface.mjs` | Source/API guard | None found. |
| Pipeline runner slice and typed terminal authority | `check-pipeline-runner-slice-surface.mjs` | High source/API guard | None found. |
| Pipeline step-result schema and authority policy | `check-pipeline-step-result-surface.mjs` | Very high API guard | None found. |
| Rate-limit slice ownership | `check-rate-limit-slice-surface.mjs` | Focused source/API guard | None found. |
| Redis completion service ownership | `check-redis-completion-service-surface.mjs` | Focused source/API guard | Existing P17 remains applicable. |
| Redis log ownership | `check-redis-log-ownership.mjs` | Focused source/API guard | None found. |
| Remediation handoff typed control | `check-remediation-handoff-surface.mjs` | High source/API guard | None found. |

Validation evidence:

```text
node --check tests/verification/contracts/check-observability-catch-reporting.mjs
node --check tests/verification/contracts/check-operator-alert-surface.mjs
node --check tests/verification/contracts/check-pipeline-entrypoint-shim-surface.mjs
node --check tests/verification/contracts/check-pipeline-runner-slice-surface.mjs
node --check tests/verification/contracts/check-pipeline-step-result-surface.mjs
node --check tests/verification/contracts/check-rate-limit-slice-surface.mjs
node --check tests/verification/contracts/check-redis-completion-service-surface.mjs
node --check tests/verification/contracts/check-redis-log-ownership.mjs
node --check tests/verification/contracts/check-remediation-handoff-surface.mjs
node tests/verification/contracts/check-observability-catch-reporting.mjs --source-root "$PWD" # {"ok":true,"checked":14}
node tests/verification/contracts/check-operator-alert-surface.mjs --source-root "$PWD" # {"ok":true,"checked":7}
node tests/verification/contracts/check-pipeline-entrypoint-shim-surface.mjs --source-root "$PWD" # {"ok":true,"checked":14}
node tests/verification/contracts/check-pipeline-runner-slice-surface.mjs --source-root "$PWD" # {"ok":true,"checked":56}
node tests/verification/contracts/check-pipeline-step-result-surface.mjs --source-root "$PWD" # {"ok":true,"checked":92}
node tests/verification/contracts/check-rate-limit-slice-surface.mjs --source-root "$PWD" # {"ok":true,"checked":21}
node tests/verification/contracts/check-redis-completion-service-surface.mjs --source-root "$PWD" # {"ok":true,"checked":18}
node tests/verification/contracts/check-redis-log-ownership.mjs --source-root "$PWD" # {"ok":true,"checked":8}
node tests/verification/contracts/check-remediation-handoff-surface.mjs --source-root "$PWD" # {"ok":true,"checked":44}
git diff --check
```

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- None yet.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
