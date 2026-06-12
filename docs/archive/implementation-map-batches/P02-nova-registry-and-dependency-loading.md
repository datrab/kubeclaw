# Batch P02 — Nova registry and dependency loading

Status: completed
Date started: 2026-05-08
Date completed: 2026-05-08
Reviewer: Nova

## Scope

```text
skills/nova/pipeline/core/registry.js
skills/nova/pipeline/core/registry/*.js
skills/nova/pipeline/services/adapter-registry.js
skills/nova/pipeline/services/dependencies.js
skills/nova/pipeline/services/validation.js
```

Scope expansion verified: 8 files, under the 10-file maximum. Wildcard expansion was verified live and all scoped code files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/nova/pipeline/core/registry.js
kubeclaw-main/skills/nova/pipeline/core/registry/builtins.js
kubeclaw-main/skills/nova/pipeline/core/registry/config-normalization.js
kubeclaw-main/skills/nova/pipeline/core/registry/indexes.js
kubeclaw-main/skills/nova/pipeline/core/registry/validation.js
kubeclaw-main/skills/nova/pipeline/services/adapter-registry.js
kubeclaw-main/skills/nova/pipeline/services/dependencies.js
kubeclaw-main/skills/nova/pipeline/services/validation.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/behavior/areas/foundations.mjs
kubeclaw-main/tests/verification/contracts/check-critical-dynamic-imports.mjs
kubeclaw-main/tests/verification/contracts/check-module-runner-slice-surface.mjs
kubeclaw-main/tests/verification/contracts/check-validator-control-result-surface.mjs
kubeclaw-main/tests/verification/behavior/areas/approvals.mjs
kubeclaw-main/tests/verification/behavior/areas/gates.mjs
```

## Per-file map

### `skills/nova/pipeline/core/registry.js`

Role: Startup plugin registry assembly, registry freezing, owner/handler lookup, and hook listener ordering.

Imports/dependencies: Plugin constants; serialization `cloneSerializable`/`deepFreeze`; builtin plugin definitions; plugin config normalization; manifest/config/capability validation; registry index builders.

Exports/public surface: `getBuiltinPluginDefinitions`, `formatPluginRegistryErrors`, `buildPluginRegistry`, `getPluginRegistry`, `requirePluginRegistry`, `resolveStageOwner`, `requireStageOwner`, `resolveGateTypeOwner`, `requireGateTypeOwner`, `resolveStageHandler`, `requireStageHandler`, `resolveHookListeners`.

Defines: Manifest cloning, error formatting, registry assembly loop, startup summary, registry object resolver.

Important variables/state: No module-global mutable runtime state. `buildPluginRegistry` creates `errors`, `normalizedConfig`, `discoveredDefinitions`, `records`, `stageOwners`, `gateTypes`, `hookIndex`, then freezes the registry and records.

Calls out to: `normalizePluginConfig`, `validateManifest`, `validateImplementation`, `resolveModuleConfig`, `validateTrustPolicy`, `validateCapabilities`, `buildStageOwnerIndex`, `buildGateTypeIndex`, `buildHookIndex`, `deepFreeze`.

Called by / expected callers: `core/config.js` builds startup registry; `core/context.js` resolves stage owners; runners/services require gate/stage handlers; tests exercise registry contract.

Environment variables / CLI inputs / config fields: Reads plugin config input passed by `config.plugins`: `enabled`, `allowCustomModules`, `extraModulePaths`, `modules`, `stageOwners`, `restrictedCapabilityAllowlist`.

Paths built/read/written: None directly; delegates plugin `extraModulePaths` validation to config-normalization. Writes no filesystem artifacts.

Authority behavior: Owns startup-frozen registry authority. Disabled registry returns no owners/listeners and `requirePluginRegistry` throws.

Error/retry/terminal behavior: Accumulates validation errors and throws formatted registry error by default. Lookup `require*` methods throw when registry/owner/handler missing. No retry/backoff. `P02-ISSUE-001` captures a TypeError path when malformed manifest kind reaches capability validation.

Verification coverage: `foundations.mjs` verifies deterministic built-in assembly, gate type ownership, capability/trust failures, config-schema validation, stage-owner errors, immutable plugin envelopes, and config validation deriving gate types from registry.

Findings: `P02-ISSUE-001` added for invalid plugin kind causing `TypeError` instead of accumulated registry validation error.

### `skills/nova/pipeline/core/registry/builtins.js`

Role: Built-in plugin definition catalogue and bridge implementations for worker, gate, validator, generator, notification, and telemetry plugin modules.

Imports/dependencies: Plugin contract constants; gate runners and control adapters; architecture and module validators; summary/case-study generators; notification and telemetry sink built-in definitions.

Exports/public surface: `BUILTIN_PLUGIN_DEFINITIONS` frozen array.

Defines: `readPluginConfig`, `readPluginProgress`, `emitBuiltinBridgeTrace`, and built-in plugin records for `builtin.worker.module_forge`, `builtin.worker.module_buster`, review/approval/buster gates, architecture/delivery/pre-check/full validators, project-summary/pipeline-review/case-study generators, plus notification/telemetry sink definitions from service modules.

Important variables/state: Frozen definition array. Bridge functions read live config/progress from builtin-only `ctx.coreRuntime` when invoked.

Calls out to: Gate runners, validator services, summary/case-study services, notification/telemetry builtin factories, plugin stream/telemetry context surfaces, `ctx.workerRuntime.dispatch`.

Called by / expected callers: `registry.js getBuiltinPluginDefinitions` and registry assembly.

Environment variables / CLI inputs / config fields: No env reads. Built-in execution consumes plugin `input.ids` and `input.executionContext.novaPrompt` where applicable, and `ctx.coreRuntime` config/progress.

Paths built/read/written: None directly. Downstream runners/services own paths and artifacts.

Authority behavior: Owns canonical built-in module manifest records and their source/implementation references. Built-in bridge blocks public plugin contexts from exposing raw config/progress unless `coreRuntime` is supplied.

Error/retry/terminal behavior: `readPluginConfig`/`readPluginProgress` throw if `ctx.coreRuntime` lacks accessors. Bridge trace awaits stream and telemetry emits before calling downstream implementation; trace/sink or downstream errors propagate. No retry/backoff in scoped file.

Verification coverage: Registry tests assert expected built-in owners and handlers exist; context tests assert restricted plugins lack `coreRuntime` and builtin context envelope behavior.

Findings: None.

### `skills/nova/pipeline/core/registry/config-normalization.js`

Role: Normalize and validate `config.plugins` registry input before registry assembly.

Imports/dependencies: Node `path`; plugin constants; core `validateSafePath`; shared `isPlainObject`.

Exports/public surface: `normalizePluginConfig`, `allKnownCapabilities`.

Defines: Boolean assertion, module overrides normalization, stage owner normalization, restricted capability allowlist normalization, custom module path normalization.

Important variables/state: None mutable beyond local normalized objects and error arrays supplied by caller.

Calls out to: `path.isAbsolute`, `validateSafePath`, `isPlainObject`.

Called by / expected callers: `registry.js buildPluginRegistry`; validation code imports `allKnownCapabilities`.

Environment variables / CLI inputs / config fields: Reads `config.plugins.enabled`, `allowCustomModules`, `extraModulePaths`, `modules.*.enabled`, `modules.*.config`, `modules.*.trustOverride`, `stageOwners`, `restrictedCapabilityAllowlist`.

Paths built/read/written: Validates `config.plugins.extraModulePaths[]` as non-empty absolute paths under safe prefixes. Does not read/write files. Custom discovery paths are still rejected as reserved/not implemented.

Authority behavior: Owns normalized plugin config shape and capability name universe.

Error/retry/terminal behavior: Does not throw directly; pushes structured errors into caller-provided `errors`. Path validation errors are caught and converted to registry discovery-path errors. No retry/backoff.

Verification coverage: `foundations.mjs` covers unknown module references, unknown capabilities, restricted capability allowlists, trust overrides, and custom config validation.

Findings: None.

### `skills/nova/pipeline/core/registry/indexes.js`

Role: Build stage-owner, hook-listener, and gate-type indexes from resolved plugin records.

Imports/dependencies: Plugin rejection codes and valid stage-id sets.

Exports/public surface: `buildStageOwnerIndex`, `buildHookIndex`, `buildGateTypeIndex`.

Defines: Candidate grouping by hook/stage, explicit stage-owner validation, default single-owner selection, conflict/missing-owner errors, gate-type owner cross-checks.

Important variables/state: None beyond local index objects.

Calls out to: None outside constants.

Called by / expected callers: `registry.js buildPluginRegistry`.

Environment variables / CLI inputs / config fields: Reads normalized `config.plugins.enabled` and `config.plugins.stageOwners`.

Paths built/read/written: None.

Authority behavior: Owns decision-stage ownership and gate-type ownership indexes. Notification and telemetry records are hook listeners only, not decision-stage owners.

Error/retry/terminal behavior: Pushes errors for unknown/disabled/non-claiming explicit owner, invalid stage id, owner conflict, missing owner, gate-type conflict/missing owner. Does not throw directly. No retry/backoff.

Verification coverage: `foundations.mjs` covers stage owner lookup, duplicate gate owner conflict, missing/unknown owners, and gate type ownership.

Findings: None.

### `skills/nova/pipeline/core/registry/validation.js`

Role: Plugin manifest, implementation, trust, capability, config-schema, and module-config validator.

Imports/dependencies: Plugin constants; `isPlainObject`; serialization clone; `allKnownCapabilities`.

Exports/public surface: `PLUGIN_METHOD_BY_KIND`, `validateManifestConfigSchema`, `resolveModuleConfig`, `validateCapabilities`, `validateTrustPolicy`, `validateManifest`, `validateImplementation`.

Defines: Minimal JSON schema value checker for object/array/string/number/integer/boolean/null/enum/required/additionalProperties, gate type validation, capability policy validation, trust policy validation, manifest and implementation validation.

Important variables/state: None mutable beyond caller-provided `errors` array.

Calls out to: `cloneSerializable`, `allKnownCapabilities`, `isPlainObject`.

Called by / expected callers: `registry.js buildPluginRegistry`.

Environment variables / CLI inputs / config fields: Reads manifest fields and plugin module config override values from registry assembly. No env reads.

Paths built/read/written: None.

Authority behavior: Owns plugin v1 contract validation and implementation method mapping: worker/gate `execute`, validator/generator/notification/telemetry `run` or `observe` as mapped.

Error/retry/terminal behavior: Pushes validation errors for most malformed inputs. Does not retry. Invalid kind can still cause `TypeError` in `validateCapabilities` because kind-indexed capability maps are accessed after `validateManifest` records an unknown kind; see `P02-ISSUE-001`.

Verification coverage: `foundations.mjs` covers invalid contract, malformed arrays, invalid config schema, restricted capability, forbidden capability, trust override, config defaults, and module config schema failures.

Findings: `P02-ISSUE-001`.

### `skills/nova/pipeline/services/adapter-registry.js`

Role: Static fail-closed adapter registry for Redis and project-summary extension points.

Imports/dependencies: Node `path`, `fileURLToPath`; static Redis tool import; static project-summary generator import.

Exports/public surface: `resolveRegisteredRedisAdapter`, `resolveRegisteredProjectSummaryGenerator`, `listRegisteredAdapters`.

Defines: Canonical source paths, alias normalization, map builder, registry lookup, required method validation.

Important variables/state: Static `REDIS_ADAPTERS` and `PROJECT_SUMMARY_GENERATORS` maps.

Calls out to: Static adapter functions only; no dynamic import.

Called by / expected callers: Orchestration Redis dispatch, polling Redis completion, summary services, tests.

Environment variables / CLI inputs / config fields: Reads `config._testOverrides.adapters.redis`, `config._testOverrides.adapters.projectSummaryGenerator`, `config.agents[agentType].redis_adapter`, `redis_adapter_id`, `redis_js_path`, and `config.paths.project_summary_generator/project_summary_adapter/project_summary_js`.

Paths built/read/written: Builds canonical adapter paths using `new URL(..., import.meta.url)` and `fileURLToPath`; normalizes path aliases with `path.resolve`. Reads/writes no files.

Authority behavior: Owns allowed adapter aliases and fail-closed boundary for critical runtime adapters.

Error/retry/terminal behavior: Unknown adapter key throws and lists registered keys; missing required methods throw; invalid project-summary test adapter or resolved adapter throws. Test overrides bypass static map after method validation. No retry/backoff.

Verification coverage: `check-critical-dynamic-imports.mjs` verifies static imports, no dynamic imports, and fail-closed text; behavior tests cover unregistered Redis adapter failures.

Findings: None.

### `skills/nova/pipeline/services/dependencies.js`

Role: Module dependency checker for module and gate dependencies.

Imports/dependencies: Core logger and statuses; status-store projections for gate/module scheduler state.

Exports/public surface: `checkDependencies`.

Defines: Gate consumed check, dependency gate label, gate dependency evaluator, dependency loop.

Important variables/state: None.

Calls out to: `projectGateSchedulerState`, `projectModuleSchedulerState`, `log`.

Called by / expected callers: Module orchestration runners and tests.

Environment variables / CLI inputs / config fields: Reads `progress.modules[moduleId].depends_on`, dependent `progress.modules`, `progress.gates`, status-store projection outputs.

Paths built/read/written: None directly; status-store projection helpers may read project state files outside this scoped file.

Authority behavior: Owns dependency-met decision before module execution using canonical read-model completion for gates and `STATUS.PASS` for modules.

Error/retry/terminal behavior: Missing module/gate/dependency returns `{ met:false, reason }` with WARN/ERROR logs; not-complete dependencies return false with INFO logs; no throws in normal path; no retry/backoff.

Verification coverage: Approval/gate behavior tests assert gate dependency consumption and rejected approval handling; module runner tests inject/check dependency behavior.

Findings: None.

### `skills/nova/pipeline/services/validation.js`

Role: Preflight contract and delivery lint validation helpers plus operator-facing failure formatter.

Imports/dependencies: Node `fs`, `path`; core logger; path builders `modulePath`, `projectSrcPath`.

Exports/public surface: `isPlainObject`, `VALIDATION_CODES`, `runPreflightValidation`, `runDeliveryLintValidation`, `formatValidationFailures`.

Defines: Validation failure codes, Dockerfile COPY parser, FORGE.md reader, test config path resolver, preflight and delivery lint rules.

Important variables/state: None.

Calls out to: `fs.readFileSync`, `fs.existsSync`, `path.join`, `path.basename`, `path.isAbsolute`, `log`, `modulePath`, `projectSrcPath`.

Called by / expected callers: Module validator services and runner flow through registry-controlled validator stages.

Environment variables / CLI inputs / config fields: Reads module `test_config.serve.dockerfile`, `test_config.serve.static_path`, `test_config.api.spec_file`, module directory, and config paths.

Paths built/read/written: Reads `<modulePath>/FORGE.md`; resolves relative test config paths against `projectSrcPath(config)`; checks/reads Dockerfile; writes no files.

Authority behavior: Owns preflight/delivery validation failure schema and text formatting, while registry/module-validators own stage dispatch/control-result conversion.

Error/retry/terminal behavior: Missing/unreadable FORGE.md skips preflight as pass-through; missing Dockerfile returns failure; Dockerfile read error logs WARN and passes; no retry/backoff. Validation failures are returned, not thrown.

Verification coverage: Validator control-result contract verifies failure code shape for delivery lint; module-runner slice contract prevents direct delivery-lint bypass around registry.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `core/registry.js` | `core/registry/config-normalization.js` | `normalizePluginConfig` | Normalizes `config.plugins` before discovery/indexing. |
| `core/registry.js` | `core/registry/builtins.js` | `BUILTIN_PLUGIN_DEFINITIONS` via `getBuiltinPluginDefinitions` | Built-in definitions are cloned before validation. |
| `core/registry.js` | `core/registry/validation.js` | manifest/config/trust/capability/implementation validators | Validation errors accumulate into one registry error by default. |
| `core/registry.js` | `core/registry/indexes.js` | `buildStageOwnerIndex`, `buildGateTypeIndex`, `buildHookIndex` | Creates frozen lookup surfaces. |
| `core/registry/builtins.js` | gate/validator/generator services | `run*Stage`, `generate*`, control adapters | Built-in plugins bridge registry dispatch to existing implementations. |
| `core/registry/builtins.js` | plugin context surfaces | `ctx.stream.emit`, `ctx.telemetry.emit`, `ctx.workerRuntime.dispatch` | Bridge trace and worker dispatch. |
| `core/registry/config-normalization.js` | `core/paths.js` | `validateSafePath` | Validates configured extra plugin paths, then rejects custom discovery as unimplemented. |
| `core/registry/validation.js` | `core/registry/config-normalization.js` | `allKnownCapabilities` | Shared capability universe. |
| `services/adapter-registry.js` | `tools/redis.js` | static default import | Redis runtime adapter source. |
| `services/adapter-registry.js` | `tools/project-summary.js` | static `generateSummary` import | Project-summary generator source. |
| `services/dependencies.js` | `services/status-store.js` | `projectGateSchedulerState`, `projectModuleSchedulerState` | Canonical dependency read models. |
| `services/validation.js` | `core/paths.js` | `modulePath`, `projectSrcPath` | Validation input path construction. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `core/registry.js buildPluginRegistry` | Duplicate discovered moduleId | Built-in/custom definitions | Push `REGISTRY_MANIFEST_INVALID` and skip duplicate | Prevents ambiguous module records. |
| `core/registry.js buildPluginRegistry` | Config references undiscovered module/allowlist | Normalized config keys vs discovered IDs | Push module config error | Config cannot target missing modules. |
| `core/registry.js buildPluginRegistry` | Errors present and `throwOnError !== false` | Accumulated errors | Throw formatted error | Startup fails closed by default. |
| `core/registry.js resolve*` | Registry missing or disabled | Config/registry | Return null/empty for resolve, throw for require | Separates optional lookup from decision-stage enforcement. |
| `core/registry.js resolveHookListeners` | Multiple listeners | Enabled records | Sort by numeric priority then moduleId | Deterministic listener order. |
| `registry/config-normalization.js` | Invalid plugin config field types | `config.plugins.*` | Push structured errors and omit invalid value | Maintains normalized shape despite bad input. |
| `registry/config-normalization.js` | `extraModulePaths` present | Path list and `allowCustomModules` | Validate path then push reserved/not-implemented errors | Custom discovery is explicitly fail-closed. |
| `registry/indexes.js buildStageOwnerIndex` | One enabled candidate vs many vs none | Records per hook/stage | Auto-select single, require explicit selection for conflict, error on missing | Registry owns decision-stage single writer. |
| `registry/indexes.js buildGateTypeIndex` | Gate type candidate mismatch/conflict | Gate record and stage owner | Push missing/conflict errors | Gate type must match stage owner. |
| `registry/validation.js validateJsonSchemaValue` | Schema type/enum/required/additionalProperties | Resolved module config | Push config errors | Minimal config schema enforcement. |
| `registry/validation.js validateCapabilities` | Unknown/duplicate/forbidden/missing/restricted capability | Manifest, trust tier, allowlist | Push capability errors | Capability policy enforcement. |
| `registry/validation.js validateTrustPolicy` | Non-builtin trusted or external elevated to trusted | Manifest and resolved trust | Push trust override errors | External/local trust elevation is controlled. |
| `services/adapter-registry.js` | Test override present | `config._testOverrides.adapters.*` | Validate methods/type, return non-cacheable or test key | Test seam bypasses static map safely. |
| `services/adapter-registry.js` | Unknown adapter key | Config adapter key/alias | Throw fail-closed error listing registered keys | Prevents config-path dynamic imports. |
| `services/dependencies.js checkDependencies` | Dependency starts `gate:` | `depends_on` entry | Evaluate gate projection | Gate dependencies use canonical gate read model. |
| `services/dependencies.js checkDependencies` | Module dependency projection not `PASS` | Module projection | Return unmet reason | Modules advance only after dependencies pass. |
| `services/validation.js runPreflightValidation` | FORGE.md missing/unreadable | Module directory | Skip checks and pass | Preflight is non-blocking without blueprint. |
| `services/validation.js runDeliveryLintValidation` | No `serve.dockerfile` | Test config | Skip checks and pass | Delivery lint is active only for configured Dockerfile. |
| `services/validation.js runDeliveryLintValidation` | Dockerfile missing | Resolved Dockerfile path | Return `SERVE_DOCKERFILE_MISSING` failure | Forge must produce declared Dockerfile. |
| `services/validation.js runDeliveryLintValidation` | Dockerfile unreadable | Read error | Log WARN and pass | Read failure is soft in scoped helper. |
| `services/validation.js runDeliveryLintValidation` | COPY destination mismatch | Dockerfile COPY destinations, `static_path` | Return `STATIC_PATH_MISMATCH` failure | Prevents static asset path drift. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `core/registry.js getBuiltinPluginDefinitions` | Returned definitions | Frozen builtins | Clone manifest arrays/config schema and implementation object | Callers cannot mutate source builtins. |
| `core/registry.js buildPluginRegistry` | Registry records | Definitions and normalized overrides | Override trust/config/enabled over manifest defaults; freeze record | Registry records are immutable. |
| `registry/validation.js resolveModuleConfig` | Resolved module config object | Schema defaults and override config | Defaults first, override config second | Returned config is schema-validated merged config. |
| `registry/indexes.js buildStageOwnerIndex` | `stageOwners` map | Enabled records and explicit selections | Explicit owner wins if valid; otherwise single candidate auto-selected | Decision stages have one owner or validation error. |
| `registry/indexes.js buildHookIndex` | `hookIndex` map | All records | Append records by hookFamily/stageId | Listener lookup sees all claimed stage records. |
| `services/adapter-registry.js buildRegistry` | Static alias map | Alias lists | Later duplicate aliases overwrite earlier map entry | Registry aliases resolve to static adapters. |
| `services/validation.js run*Validation` | Local failures array | Validation rules | Append deterministic failure objects | Return `{ passed, failures }`; no files mutated. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `core/registry.js buildPluginRegistry` | Iterate built-in modules, normalized config keys, discovered definitions | None | None | Completes all checks; may throw after registry assembly. |
| `core/registry.js resolveHookListeners` | Sort enabled listener records | None | None | Priority and moduleId deterministic order. |
| `registry/config-normalization.js` | Iterate config maps/arrays | None | None | Converts valid entries, records errors for invalid entries. |
| `registry/indexes.js` | Iterate records/stages/gate types | None | None | Build indexes and errors in one pass per index type. |
| `registry/validation.js validateJsonSchemaValue` | Recurses over object properties/array entries | None | None | Exhaustive schema traversal for supported schema subset. |
| `services/dependencies.js checkDependencies` | Iterate `mod.depends_on` in order | None | None | Returns at first unmet dependency; returns met when all pass. |
| `services/validation.js parseDockerfileCopies` | Iterate Dockerfile lines | None | None | Collect COPY pairs; no shell execution. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `config.plugins.enabled` | Config field | `registry/config-normalization.js`; `registry/indexes.js`; `registry.js` | `true` | Disabled registry returns no owners/listeners; require path throws. |
| `config.plugins.allowCustomModules` | Config field | `registry/config-normalization.js` | `false` | Required for extra paths, but custom discovery remains reserved/not implemented. |
| `config.plugins.extraModulePaths[]` | Config path list | `registry/config-normalization.js` | `[]` | Must be absolute safe paths; then rejected as reserved. |
| `config.plugins.modules.<moduleId>.enabled` | Config field | `registry/config-normalization.js`; `registry.js` | Manifest `defaultEnabled ?? true` | Controls enabled module records. |
| `config.plugins.modules.<moduleId>.config` | Config object | `registry/config-normalization.js`; `registry/validation.js` | Manifest config schema defaults | Merged and schema-validated. |
| `config.plugins.modules.<moduleId>.trustOverride` | Config field | `registry/config-normalization.js`; `registry/validation.js` | Manifest trust tier | Only trusted/restricted; external cannot be elevated in v1. |
| `config.plugins.stageOwners.<stageId>` | Config map | `registry/config-normalization.js`; `registry/indexes.js` | Auto-select only when one owner | Explicit decision-stage owner selection. |
| `config.plugins.restrictedCapabilityAllowlist.<moduleId>[]` | Config map | `registry/config-normalization.js`; `registry/validation.js` | `{}` | Grants restricted plugins optional gated capabilities. |
| `config._testOverrides.adapters.redis` | Test override | `services/adapter-registry.js` | None | Bypasses static Redis map after method validation; `cacheable:false`. |
| `config._testOverrides.adapters.projectSummaryGenerator` | Test override | `services/adapter-registry.js` | None | Must be a function. |
| `config.agents.<agent>.redis_adapter`, `redis_adapter_id`, `redis_js_path` | Config fields | `services/adapter-registry.js` | `pipeline-redis` | Adapter alias lookup, fail-closed for unknown values. |
| `config.paths.project_summary_generator`, `project_summary_adapter`, `project_summary_js` | Config fields | `services/adapter-registry.js` | `pipeline-project-summary` | Project-summary generator alias lookup. |
| `progress.modules.<moduleId>.depends_on[]` | Progress field | `services/dependencies.js` | `[]` | Supports module IDs and `gate:<gateId>` dependencies. |
| `progress.gates.<gateId>` | Progress field | `services/dependencies.js` | Required for gate dependencies | Gate projection decides dependency readiness. |
| `mod.test_config.serve.dockerfile` | Progress module test config | `services/validation.js` | Optional | Preflight declaration check and delivery lint Dockerfile path. |
| `mod.test_config.serve.static_path` | Progress module test config | `services/validation.js` | Optional | Delivery lint COPY destination check. |
| `mod.test_config.api.spec_file` | Progress module test config | `services/validation.js` | Optional | Preflight declaration check. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| `config.plugins.extraModulePaths[]` | User config; normalized by `registry/config-normalization.js` | None in scoped files | None | Must be absolute safe path; custom plugin discovery is rejected as unimplemented. |
| Canonical Redis adapter path | `services/adapter-registry.js` from `new URL('../tools/redis.js', import.meta.url)` | Adapter registry alias lookup | None | Static import owns adapter authority, not dynamic config path. |
| Canonical project-summary adapter path | `services/adapter-registry.js` from `new URL('../tools/project-summary.js', import.meta.url)` | Adapter registry alias lookup | None | Static import owns generator authority. |
| `/app/skills/pipeline/tools/redis.js`, `/app/skills/redis.js` | Static adapter alias list | Adapter registry | None | Legacy aliases map to static Redis adapter. |
| `/app/skills/pipeline/tools/project-summary.js`, `/app/skills/project-summary.js` | Static adapter alias list | Adapter registry | None | Legacy aliases map to static project-summary generator. |
| `<modulePath(config,moduleDir)>/FORGE.md` | `services/validation.js readForgeBlueprint` | Preflight validation | None | Missing/unreadable blueprint skips preflight checks. |
| `test_config.serve.dockerfile` resolved path | `services/validation.js resolveTestConfigPath` | Delivery lint | None | Relative paths resolve under `projectSrcPath(config)`; absolute paths pass through. |
| `test_config.api.spec_file` basename | `services/validation.js runPreflightValidation` | FORGE.md content check | None | Only basename declaration is checked in FORGE.md. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Startup plugin registry | `core/registry.js buildPluginRegistry` | Config/context/runners/plugin dispatch | Invalid manifest kind TypeError tracked as `P02-ISSUE-001`. |
| Built-in plugin catalogue | `core/registry/builtins.js` | Registry assembly | Notification/telemetry sink details reviewed in later batches. |
| Plugin config normalized shape | `registry/config-normalization.js` | Registry assembly and validation | Custom discovery intentionally reserved. |
| Plugin v1 manifest/config/capability/trust validation | `registry/validation.js` | Registry assembly | Needs guard for unknown `manifest.kind`. |
| Stage owner/hook/gate type indexes | `registry/indexes.js` | Registry lookups and gate config validation | None. |
| Static critical adapter registry | `services/adapter-registry.js` | Orchestration, polling, summary | None. |
| Module dependency readiness | `services/dependencies.js` | Module scheduler/runners | Status-store projection authority reviewed later. |
| Preflight/delivery validation result schema | `services/validation.js` | Validator stages/control-result conversion | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Plugin manifest v1 | Built-in/external plugin definitions | Required `moduleId`, `contractVersion`, `kind`, `hookFamily`, `stageIds`, `capabilities`, `configSchema`, `sourceType`, `trustTier`; optional `gateTypes`, `displayName`, `description`, `defaultEnabled`, `priority` | `registry/validation.js validateManifest` | Registry assembly. |
| Plugin definition | `registry/builtins.js` and test/custom discovery input | `{ manifest, implementation, sourceRef?, implementationRef? }` | `validateManifest`, `validateImplementation` | Registry records. |
| Normalized plugin config | `registry/config-normalization.js` | `{ enabled, allowCustomModules, extraModulePaths, modules, stageOwners, restrictedCapabilityAllowlist }` | `normalizePluginConfig` | `buildPluginRegistry`. |
| Registry record | `core/registry.js buildPluginRegistry` | Frozen `{ manifest, enabled, resolvedTrustTier, resolvedStageIds, sourceRef, implementationRef, implementation, config }` | Manifest/config/capability/trust validation | Stage/gate/hook indexes and plugin context. |
| Registry object | `core/registry.js buildPluginRegistry` | Frozen `{ contractVersion, enabled, config, records, hookIndex, stageOwners, gateTypes, summary }` | Index builders and deep freeze | Config `_pluginRegistry`, context/runners. |
| Registry error | Registry helpers | `{ code, message, ...details }` | Local `pushError` helpers | Formatted startup error and tests. |
| Gate type index entry | `registry/indexes.js buildGateTypeIndex` | `{ gateType, hookFamily:'gate.execute', stageId, moduleId, owner }` | Gate/stage owner cross-check | Gate config validation and runner owner lookup. |
| Adapter resolution result | `services/adapter-registry.js` | Redis `{ adapter, key, cacheable? }`; project summary `{ generateSummary, key }` | Alias lookup and method/type checks | Orchestration/polling/summary. |
| Dependency result | `services/dependencies.js checkDependencies` | `{ met: boolean, reason?: string }` | Projection/status checks | Module scheduler/runners. |
| Validation failure | `services/validation.js` | `{ stage: 'preflight_contract'\|'delivery_lint', code, explanation, next_step }` | Deterministic validation rules | Validator control result and formatter. |
| Validation result | `services/validation.js run*Validation` | `{ passed: boolean, failures: ValidationFailure[] }` | Rule functions | Validator stages/runners. |
| Formatted validation failure summary | `services/validation.js formatValidationFailures` | String header `VALIDATION FAILED (<n> issue(s)):` plus per-failure stage/code/why/fix lines | Formatter only | Operators/logs. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| None found in scoped files | None | None | None | None | None |

P02 built-in registry records bridge to worker/gate/generator implementations, but scoped files do not build prompts or define agent prompt text. `builtin.gate.review` forwards `input.executionContext.novaPrompt` to the review gate runner; the prompt itself is built outside P02.

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `core/registry.js buildPluginRegistry` | Registry/config/manifest validation errors | No | No retry/backoff | Throws formatted terminal startup error by default; returns errors if `throwOnError:false` | None. |
| `core/registry.js requirePluginRegistry/require*` | Missing/disabled registry or missing owner/handler | No | No retry/backoff | Throws | None. |
| `core/registry/builtins.js readPluginConfig/readPluginProgress` | Missing builtin `coreRuntime` accessors | No | No retry/backoff | Throws | None. |
| `core/registry/builtins.js emitBuiltinBridgeTrace` | Stream or telemetry emit failure | No local retry | No retry/backoff in scoped file | Awaited exception propagates before downstream bridge call | Payload contains IDs only in scoped bridge traces. |
| `registry/config-normalization.js normalize*` | Invalid plugin config field/path | No | No retry/backoff | Pushes errors; caller decides throw | None. |
| `registry/indexes.js build*Index` | Owner/gate conflicts or missing owner | No | No retry/backoff | Pushes errors; caller decides throw | None. |
| `registry/validation.js validate*` | Invalid manifest/config/capability/trust/implementation | No | No retry/backoff | Pushes errors; caller decides throw; unknown kind currently can TypeError | None. |
| `services/adapter-registry.js resolve*` | Unknown adapter or missing required method/type | No | No retry/backoff | Throws fail-closed error | None. |
| `services/dependencies.js checkDependencies` | Missing module/gate/dependency or unmet dependency | No | No retry/backoff | Returns `{ met:false, reason }` and logs; does not throw | None. |
| `services/validation.js readForgeBlueprint` | FORGE.md missing/unreadable | No | No retry/backoff | Returns null; preflight passes with INFO log | None. |
| `services/validation.js runDeliveryLintValidation` | Dockerfile missing | No | No retry/backoff | Returns failed validation result | None. |
| `services/validation.js runDeliveryLintValidation` | Dockerfile read failure | No | No retry/backoff | Logs WARN and returns pass-through success | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `core/registry.js buildPluginRegistry` | Registry validation errors | No direct telemetry | none | none | Function throws/returns errors | Caller config load logs terminal setup failure. |
| `core/registry.js requirePluginRegistry/require*` | Missing/disabled registry/owner/handler | No direct telemetry | none | none | Function throws | Caller owns logging. |
| `core/registry/builtins.js readPluginConfig/readPluginProgress` | Missing builtin coreRuntime accessor | No direct telemetry | none | none | Function throws | Caller/plugin dispatcher owns logging. |
| `core/registry/builtins.js emitBuiltinBridgeTrace` | Bridge trace success path | Yes | Plugin stream and telemetry sinks | `plugin.*.bridge_invoked` event types | `emitBuiltinBridgeTrace` | Trace failure propagates and may prevent downstream execution. |
| `registry/config-normalization.js normalize*` | Invalid config/path | No direct telemetry | none | registry error array | `pushError` | Startup error formatter surfaces errors. |
| `registry/indexes.js build*Index` | Ownership/gate index errors | No direct telemetry | none | registry error array | `pushError` | Startup error formatter surfaces errors. |
| `registry/validation.js validate*` | Validation errors or unknown-kind TypeError | No direct telemetry | none | registry error array when no TypeError | Validator functions | TypeError path tracked as `P02-ISSUE-001`. |
| `services/adapter-registry.js resolve*` | Unknown adapter/method/type failure | No direct telemetry | none | none | Function throws | Behavior tests show upstream records adapter errors in telemetry elsewhere. |
| `services/dependencies.js checkDependencies` | Missing/unmet dependencies | Yes | Core logger stderr/file if active | INFO/WARN/ERROR log lines | `log` calls in dependency checker | Return value is primary scheduler signal. |
| `services/validation.js readForgeBlueprint` | Missing/unreadable FORGE.md | Yes | Core logger stderr/file if active | INFO `Preflight: no FORGE.md...` | `runPreflightValidation` | Soft pass. |
| `services/validation.js runDeliveryLintValidation` | Dockerfile missing | Yes | Core logger stderr/file if active | WARN `Delivery lint: SERVE_DOCKERFILE_MISSING...` | `runDeliveryLintValidation` | Also returns validation failure. |
| `services/validation.js runDeliveryLintValidation` | Dockerfile read failure | Yes | Core logger stderr/file if active | WARN `Delivery lint: could not read Dockerfile...` | `runDeliveryLintValidation` | Soft pass after warning. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js runtime | `node` binary | Observed `v24.14.0` during review | All P02 modules | ESM, static imports, sync fs/path | No package pin in scoped files. |
| Node `fs` built-in | Runtime built-in | Node major 24 observed | `services/validation.js` | FORGE.md and Dockerfile checks | Read errors are soft in preflight/read-failure paths. |
| Node `path` built-in | Runtime built-in | Node major 24 observed | Config normalization, adapter registry, validation service | Absolute/safe path checks and artifact path resolution | Absolute Dockerfile paths pass through validation helper. |
| Node `url.fileURLToPath` | Runtime built-in | Node major 24 observed | `services/adapter-registry.js` | Canonical static adapter path aliases | No dynamic import path execution. |
| Internal serialization helpers | `services/serialization.js` | Internal source | `core/registry.js`, `registry/validation.js` | Clone/freeze registry records and config defaults | Full serialization behavior reviewed later. |
| Internal plugin constants | `core/constants.js` | Internal source | Registry modules | Contract vocabulary and policy constants | Constants reviewed in P01. |
| Internal runners/services | Gate runners, validators, summary/case-study, notification/telemetry contracts | Internal source | `registry/builtins.js` | Built-in bridge implementations | Downstream behavior reviewed in later batches. |
| Internal status-store projections | `services/status-store.js` | Internal source | `services/dependencies.js` | Gate/module scheduler read model | Projection behavior reviewed later. |
| Static Redis adapter | `tools/redis.js` | Internal source | `services/adapter-registry.js` | Redis dispatch/completion adapter | Unknown config aliases fail closed. |
| Static project-summary generator | `tools/project-summary.js` | Internal source | `services/adapter-registry.js` | Project summary generation | Unknown config aliases fail closed. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Registry assembly | Synchronous loops over discovered modules/config maps | Built-ins plus opts-supplied modules | Blocks startup until complete; throws on accumulated errors | No direct telemetry | None. |
| Hook listener dispatch ordering | Sort by priority/moduleId only | Priority defaults to `0` | No throttling; dispatcher decides invocation concurrency | Registry returns sorted list | Dispatcher behavior reviewed later. |
| Built-in bridge trace | Awaits stream emit then telemetry emit | No timeout/backoff | Slow/failing sink delays or prevents downstream bridge call | Emits `plugin.*.bridge_invoked` on success | Sink backpressure reviewed in telemetry/observability batches. |
| Dependency checker | Stops at first unmet dependency | `depends_on` order from progress | Later dependencies not evaluated once one is unmet | Logs first unmet reason | None. |
| Validation service filesystem checks | Synchronous reads/exists | No queue | Blocks caller; read failure soft in selected paths | Core logger WARN/INFO | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| None found in scoped files | None | None | None | None | None |

P02 registry surfaces include generic worker/gate/validator/generator plugin dispatch, but scoped files define no ACP protocol records, deltas, monitor state, or flush behavior.

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Startup registry assembles built-ins and rejects malformed registry inputs | `tests/verification/behavior/areas/foundations.mjs` | Strong registry behavior coverage | Does not cover unknown manifest kind TypeError; see `P02-ISSUE-001`. |
| Registry-derived gate type validation | `tests/verification/behavior/areas/foundations.mjs` | Good config/registry integration coverage | None found. |
| Static critical adapter registry, no dynamic imports | `tests/verification/contracts/check-critical-dynamic-imports.mjs` | Strong source contract | Behavior coverage for project-summary aliases not exhaustive. |
| Delivery lint routes through registry/control-result path | `tests/verification/contracts/check-module-runner-slice-surface.mjs`, `check-validator-control-result-surface.mjs` | Good dispatch/control-result contract | Direct `services/validation.js` unit coverage is limited. |
| Gate dependencies consume canonical read model | `tests/verification/behavior/areas/approvals.mjs`, `gates.mjs` | Good approval/gate behavior coverage | Full status-store projection review later. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- `P02-ISSUE-001` — Registry validation can throw `TypeError` for unknown plugin `manifest.kind` instead of returning accumulated registry validation errors.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
