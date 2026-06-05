# Batch P01 — Nova core config/runtime/path/policy

Status: completed
Date started: 2026-05-08
Date completed: 2026-05-08
Reviewer: Nova

## Scope

```text
skills/nova/pipeline/core/config.js
skills/nova/pipeline/core/constants.js
skills/nova/pipeline/core/context.js
skills/nova/pipeline/core/git-context.js
skills/nova/pipeline/core/logger.js
skills/nova/pipeline/core/paths.js
skills/nova/pipeline/core/platform-config.js
skills/nova/pipeline/core/policy.js
skills/nova/pipeline/core/runtime.js
skills/nova/pipeline/core/temp.js
```

Scope expansion verified: 10 files, at the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/nova/pipeline/core/config.js
kubeclaw-main/skills/nova/pipeline/core/constants.js
kubeclaw-main/skills/nova/pipeline/core/context.js
kubeclaw-main/skills/nova/pipeline/core/git-context.js
kubeclaw-main/skills/nova/pipeline/core/logger.js
kubeclaw-main/skills/nova/pipeline/core/paths.js
kubeclaw-main/skills/nova/pipeline/core/platform-config.js
kubeclaw-main/skills/nova/pipeline/core/policy.js
kubeclaw-main/skills/nova/pipeline/core/runtime.js
kubeclaw-main/skills/nova/pipeline/core/temp.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/behavior/areas/foundations.mjs
kubeclaw-main/tests/verification/behavior/areas/runtime-surface.mjs
kubeclaw-main/tests/verification/behavior/areas/models.mjs
kubeclaw-main/tests/verification/behavior/areas/repo-docs.mjs
```

## Per-file map

### `skills/nova/pipeline/core/config.js`

Role: Config/progress loader, validator, plugin registry bootstrapper, and model policy facade.

Imports/dependencies: Node `fs`, `path`; core `logger`, `platform-config`, `paths`, `git-context`, `policy`, and `registry`.

Exports/public surface: `loadConfig`, `validateConfig`, `validateBusterConfig`, `resolveModel`; re-exports platform-config discovery/load functions and policy resolver/validation/logging constants.

Defines: Required config/progress validation, defaults, Wave 3 field validation, gate config validation, plugin registry build, Buster dispatch enforcement.

Important variables/state: Mutates `config` with `project`, `repo_root`, `paths`, defaults, `agents.buster.dispatch = 'redis'`, `agents.buster.redis_js_path ??= '/app/skills/pipeline/tools/redis.js'`, normalized `plugins`, `_pluginRegistry`, and `_validationErrors` on failure; calls `setRepoRoot(config.repo_root)`.

Calls out to: `loadPlatformSwarmConfig`, `getRepoRoot`, `setRepoRoot`, `validateSafePath`, `buildPluginRegistry`, `resolvePolicy`, `log`.

Called by / expected callers: CLI `loadConfig`; config/tool docs and behavior tests import config core directly.

Environment variables / CLI inputs / config fields: Reads `process.env.REPO_ROOT` if `opts.repoRoot` absent; reads `process.env.DISCORD_WEBHOOK` if config lacks `discord_webhook_url`; `loadPlatformSwarmConfig` reads platform config path selection; validates config/progress fields listed in schema tables below.

Paths built/read/written: Reads platform swarm config; builds `<repo>/Projects/<project>/src/.swarm`, `progress.json`, `modules`; reads progress JSON; validates agent Redis tool paths; writes no files.

Authority behavior: Owns startup config/progress validation and plugin registry attachment. Buster dispatch is forcibly normalized to Redis before agent validation.

Error/retry/terminal behavior: Throws on missing project, invalid repo root, repo detection failure, missing progress, invalid JSON via `JSON.parse`, validation failures, invalid Buster config. No retry/backoff. Validation error list is stored on `config._validationErrors` before throwing.

Verification coverage: `foundations.mjs` validates plugin gate registry config behavior; `repo-docs.mjs` validates platform swarm config discovery; CLI startup covers `loadConfig` indirectly.

Findings: `P01-ISSUE-001` added for `adaptive` thinking being accepted by policy but omitted from CLI help.

### `skills/nova/pipeline/core/constants.js`

Role: Shared status, exit code, and plugin registry contract constants.

Imports/dependencies: None.

Exports/public surface: `STATUS`, exit constants, plugin contract/schema constants, plugin kind/hook/source/trust/stage/capability sets, rejection code enums.

Defines: Pipeline status enum, terminal exit mapping, plugin capability policy constants and rejection codes.

Important variables/state: Frozen objects/Sets only; no mutation after module evaluation.

Calls out to: None.

Called by / expected callers: Public index exports selected statuses/exits; registry and contract services consume plugin constants.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: None.

Authority behavior: Owns canonical status strings and exit codes plus plugin contract vocabulary.

Error/retry/terminal behavior: None.

Verification coverage: Startup smoke verifies selected exit constants; foundations/registry behavior tests exercise plugin constants indirectly.

Findings: None.

### `skills/nova/pipeline/core/context.js`

Role: Runtime `PipelineContext`, plugin context v1, capability-mediated plugin surfaces, invocation envelopes, and default plugin side-effect handlers.

Imports/dependencies: Runtime helpers, registry owner lookup, correlation, artifact bundle API, observability, telemetry stream, serialization, Discord integration.

Exports/public surface: `PipelineContext`, `isPipelineContext`, `createPipelineContext`, `narrowPluginInputForCapabilities`, `buildPluginInvocationEnvelope`, `createPluginContext`.

Defines: Pipeline context state bridge, plugin module config symbol, missing-surface errors, effect receipt wrapper, default stream/telemetry/notify handlers, plugin read/artifacts/stream/telemetry/waits/signals/notify/workerRuntime surfaces.

Important variables/state: `PipelineContext` mirrors runtime state from config compatibility fields and syncs back through `syncConfigRuntimeFields`; plugin context stores read-only module config under non-enumerable symbol; builtin plugins get non-enumerable `coreRuntime` access.

Calls out to: `bindRunContext`, `createRunId`, `createRunStats`, `createEffectReceipt`, `resolveStageOwner`, `buildInvocationSnapshot`, `createPluginArtifactsApi`, `appendStructuredEvent`, `emitTelemetryStreamEvent`, serialization helpers, `discord`.

Called by / expected callers: CLI creates pipeline context; plugin dispatchers create plugin context/envelopes; tests exercise runtime/plugin context behavior.

Environment variables / CLI inputs / config fields: No env reads. Consumes config `_runId`, `run_id`, `_runStats`, `_logDir`, `_runLogDir`, `_pluginRegistry`, `_testOverrides`, `_runtimeOverrides`, project and plugin registry records.

Paths built/read/written: No direct filesystem paths except log path fields held on context. Default artifact surface delegates path construction to artifact bundle service.

Authority behavior: Owns ctx-first runtime state and plugin capability gating. Public `index.js` intentionally does not re-export this lower-level surface.

Error/retry/terminal behavior: Throws for missing config/hookFamily/stageId, missing stage owner, scaffolded missing surfaces, required handler returning undefined, and downstream default handler failures. No retry/backoff. Default stream emits filesystem observability via `appendStructuredEvent`; default telemetry emits Redis/filesystem telemetry through `emitTelemetryStreamEvent`; default notify sends Discord.

Verification coverage: `foundations.mjs` covers pipeline context compatibility bridge, plugin context surfaces, read-only envelopes, artifact lane, effects, and capability narrowing.

Findings: None.

### `skills/nova/pipeline/core/git-context.js`

Role: Nova facade for shared repo-scoped Git primitives.

Imports/dependencies: Static re-export from `../git-primitives.js`.

Exports/public surface: `getRepoRoot`, `gitExec`, `getCurrentBranch`, `headHash`, `invalidateHeadHash`, `setRepoRoot`.

Defines: No local functions or state.

Important variables/state: None locally; common helper owns caches.

Calls out to: Static re-export only.

Called by / expected callers: `core/config.js` imports `getRepoRoot`/`setRepoRoot`; Git integrations import repo helpers elsewhere.

Environment variables / CLI inputs / config fields: None directly.

Paths built/read/written: Static import only.

Authority behavior: Facade; common Git helper owns implementation.

Error/retry/terminal behavior: No local handling; common helper behavior documented in P00b/C00a.

Verification coverage: Common-helper import contract and startup behavior indirectly.

Findings: None.

### `skills/nova/pipeline/core/logger.js`

Role: AsyncLocalStorage active context and structured stderr/filesystem logger.

Imports/dependencies: Node `fs`, `path`, `async_hooks.AsyncLocalStorage`.

Exports/public surface: `setActiveContext`, `clearActiveContext`, `getActiveContext`, `createLogger`, `initContextLogging`, `log`.

Defines: `_asyncContext`; `writeEntry`; context-scoped logger object with module/phase scoping.

Important variables/state: Active async context; context log path fields; `ctx.stats.errors` capped at 50 entries for `ERROR` logs.

Calls out to: `console.error`, `fs.mkdirSync`, `fs.appendFileSync`.

Called by / expected callers: CLI sets active context; config/policy/services use `log`; runtime resolves active context.

Environment variables / CLI inputs / config fields: None. Reads `ctx.config._runLogDir` fallback when explicit paths absent.

Paths built/read/written: Writes JSON lines to `ctx._pipelineLogPath`, `ctx._runPipelineLogPath`, or `<ctx.config._runLogDir>/pipeline.jsonl`; creates parent directories.

Authority behavior: Owns low-level structured log writes and active context access, not telemetry event schemas.

Error/retry/terminal behavior: `writeEntry` swallows filesystem append errors as non-critical with no telemetry; no retry. No-context logs go to stderr only.

Verification coverage: Runtime context tests cover active context resolution; logging path behavior is exercised indirectly by telemetry/runtime tests.

Findings: None.

### `skills/nova/pipeline/core/paths.js`

Role: Canonical pipeline path and Redis completion stream key builders plus safe-path validation.

Imports/dependencies: Node `path`; `getRunId` from runtime.

Exports/public surface: `validateSafePath`, `modulePath`, `statusPath`, `swarmRoot`, `projectSrcPath`, `relPath`, `completionStreamKey`, gate/module/log path builders, `pipelineRunLogDir`.

Defines: `ALLOWED_PATH_PREFIXES = ['/app/', '/opt/', '/home/']`.

Important variables/state: None mutable.

Calls out to: `path.resolve`, `path.join`, `path.dirname`, `path.relative`, `getRunId`.

Called by / expected callers: Config validation, status/gate/module/log/summary services, runners.

Environment variables / CLI inputs / config fields: Reads path fields from config: `paths.modules_dir`, `paths.swarm_dir`, `repo_root`, `_logDir`.

Paths built/read/written: Builds module/status/gate/log/cost/redis/architecture-validator/pipeline-run log paths and completion stream key. Writes none.

Authority behavior: Owns canonical path construction helpers for core pipeline artifacts; status-store and services own actual writes.

Error/retry/terminal behavior: `validateSafePath` throws for empty/non-string or resolved path outside allowed prefixes. No telemetry.

Verification coverage: Foundations tests assert helper exports remain non-public from index and present in runtime modules.

Findings: None.

### `skills/nova/pipeline/core/platform-config.js`

Role: Platform-level `swarm.config.json` discovery and loading.

Imports/dependencies: Node `fs`, `path`.

Exports/public surface: `DEFAULT_SWARM_CONFIG_PATH`, `discoverPlatformSwarmConfigCandidates`, `discoverSwarmConfigPath`, `loadPlatformSwarmConfig`.

Defines: Default path `/home/node/.openclaw/swarm.config.json` with `SWARM_CONFIG` fallback.

Important variables/state: None.

Calls out to: `process.env.SWARM_CONFIG`, `fs.existsSync`, `fs.readFileSync`, `JSON.parse`, `path.resolve`.

Called by / expected callers: `core/config.js`; lint report discovery references candidate discovery.

Environment variables / CLI inputs / config fields: Reads `SWARM_CONFIG` as fallback candidate.

Paths built/read/written: Candidate list is default path then `SWARM_CONFIG` if set, resolved and deduped; reads selected config JSON; writes none.

Authority behavior: Owns platform config discovery order. If no candidate exists, returns the first normalized candidate so loader can emit a deterministic missing-file error.

Error/retry/terminal behavior: `loadPlatformSwarmConfig` throws `Swarm config missing` if selected file absent and `Swarm config invalid` if read/parse fails. No retry/backoff/telemetry.

Verification coverage: `repo-docs.mjs` asserts discovery order/docs and candidate fallback behavior.

Findings: None.

### `skills/nova/pipeline/core/policy.js`

Role: Deterministic model/thinking resolution and policy artifact logging.

Imports/dependencies: Node `fs`, `path`; core `logger`; runtime `getRunId`.

Exports/public surface: `VALID_THINKING_LEVELS`, `THINKING_SUPPORTED_PATHS`, `THINKING_UNSUPPORTED_PATHS`, `validateThinkingLevel`, `resolvePolicy`, `logEffectivePolicy`.

Defines: Model/thinking precedence, thinking support boundary for Redis, model-policy JSONL record.

Important variables/state: None mutable.

Calls out to: `fs.appendFileSync`, `log`, `getRunId`.

Called by / expected callers: Config exports policy helpers; CLI validates runtime `--thinking`; runners/services resolve/log effective policy per spawn path.

Environment variables / CLI inputs / config fields: Reads `config._runtimeOverrides.model/thinking`, `progress.defaults.models/thinking[agentName]`, `config.fallback_model`, `opts.scopeModel`, `opts.scopeThinking`, `opts.dispatchPath`.

Paths built/read/written: Writes `<config._logDir>/pipeline/model-policy.jsonl` when `_logDir` exists.

Authority behavior: Owns model precedence: runtime override > scope policy > project default > platform fallback > null. Thinking is runtime/scope/project only and is suppressed on unsupported dispatch paths (`redis`) with `thinking_source = not_supported_on_redis`.

Error/retry/terminal behavior: Invalid thinking values throw. `logEffectivePolicy` is non-blocking: returns if no `_logDir`; catches append errors and logs DEBUG. No retry/backoff.

Verification coverage: `models.mjs` verifies project defaults ignore legacy `progress.models`; docs-surface checks model policy doc presence; runtime tests cover downstream telemetry summaries.

Findings: `P01-ISSUE-001` documents CLI help omitting accepted `adaptive` value.

### `skills/nova/pipeline/core/runtime.js`

Role: Run identity/statistics helpers, context/config/fallback run context resolution, effect receipts, JSON output, and progress loading.

Imports/dependencies: Node `fs`, `path`; active context from logger.

Exports/public surface: live `RUN_ID`, `_runStats`; `setRunState`, `createRunId`, `createRunStats`, `bindRunContext`, `resolveRunContext`, `getRunId`, `getRunStats`, `getRunState`, `isoNow`, `createOpaqueId`, `createEffectReceipt`, `runLogDir`, `output`, `loadProgress`.

Defines: fallback run context and run stats schema.

Important variables/state: `FALLBACK_RUN_CONTEXT`; live legacy exports updated by `setRunState`; `bindRunContext` mutates config `_runId`, `run_id`, `_runStats`.

Calls out to: `getActiveContext`, `Date`, `Math.random`, `fs.existsSync`, `fs.readFileSync`, `JSON.parse`, `console.log`.

Called by / expected callers: Context, paths, policy, runners, services, CLI.

Environment variables / CLI inputs / config fields: None. Reads config `_runId`, `run_id`, `_runStats`, paths progress file.

Paths built/read/written: Builds run log dir `<config._logDir>/pipeline/runs/<run_id>`; reads `config.paths.progress_file`; writes none.

Authority behavior: Owns run identity resolution order: explicit context object > config projection > active logger context > fallback legacy global.

Error/retry/terminal behavior: `isoNow` can throw on invalid date inputs; `loadProgress` throws if progress file missing or JSON invalid. No telemetry/retry.

Verification coverage: `runtime-surface.mjs` verifies per-context/config run identity isolation and fallback behavior; foundations covers exported helpers.

Findings: None.

### `skills/nova/pipeline/core/temp.js`

Role: Lazy temporary directory lifecycle manager.

Imports/dependencies: Node `fs`, `os`, `path`.

Exports/public surface: `createTempManager`.

Defines: Manager with `init`, `file`, `cleanup`, and `dir` getter.

Important variables/state: Closure `_dir`; process exit cleanup handler added on `init()`.

Calls out to: `fs.mkdtempSync`, `os.tmpdir`, `process.on('exit')`, `Date.now`, `Math.random`, `fs.existsSync`, `fs.rmSync`.

Called by / expected callers: CLI creates temp manager and stores dir on context; services use generated temp files indirectly.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: Creates temp dirs under `<os.tmpdir()>/swarm-pipeline-*`; generates files named `<prefix>-<moduleId>-<timestamp>-<rand><ext>` inside owned dir; removes owned dir recursively.

Authority behavior: Owns process-local scratch lifecycle; not persistent artifact authority.

Error/retry/terminal behavior: `mkdtempSync` errors propagate; cleanup swallow `rmSync` errors as non-critical with no telemetry; repeated `init()` adds additional exit handlers.

Verification coverage: `foundations.mjs` covers lazy creation, generated file location, recursive cleanup, and idempotent cleanup.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `core/config.js` | `core/platform-config.js` | `loadPlatformSwarmConfig`, discovery re-exports | Platform config is loaded before project progress validation. |
| `core/config.js` | `core/git-context.js` | `getRepoRoot`, `setRepoRoot` | Repo detection fallback and Git helper default repo binding. |
| `core/config.js` | `core/paths.js` | `validateSafePath` | Validates agent Redis tool path. |
| `core/config.js` | `core/policy.js` | re-export and `resolveModel` wrapper | Config module is policy facade for legacy imports. |
| `core/config.js` | `core/registry.js` | `buildPluginRegistry` | Builds startup plugin registry and validates gate types from registry ownership. |
| `core/context.js` | `core/runtime.js` | `bindRunContext`, `createRunId`, `createRunStats`, `createEffectReceipt` | Runtime context bridge and default effect receipts. |
| `core/context.js` | `core/registry.js` | `resolveStageOwner` | Resolves plugin record when caller does not pass one. |
| `core/context.js` | `services/correlation.js` | `buildInvocationSnapshot` | Shared plugin invocation/correlation snapshot. |
| `core/context.js` | `services/artifact-bundle.js` | `createPluginArtifactsApi` | Default plugin artifact get/find/persist API. |
| `core/context.js` | `services/observability.js` | `appendStructuredEvent` | Default plugin stream emit sink. |
| `core/context.js` | `services/telemetry-stream.js` | `emitTelemetryStreamEvent` | Default plugin telemetry emit sink. |
| `core/context.js` | `integrations/discord.js` | `discord` | Default plugin notify.operator sink. |
| `core/logger.js` | `core/context.js` callers | active context object shape | Logger writes based on context fields set by `PipelineContext`. |
| `core/paths.js` | `core/runtime.js` | `getRunId` | Run-scoped pipeline log directory uses runtime identity. |
| `core/policy.js` | `core/runtime.js` | `getRunId` | Model-policy records use canonical run id. |
| `core/runtime.js` | `core/logger.js` | `getActiveContext` | Run context fallback uses AsyncLocalStorage active context. |
| `core/temp.js` | Node process | `process.on('exit')` | Registers temp cleanup handler on init. |
| `core/git-context.js` | `../git-primitives.js` | `export { ... }` | Facade to shared common Git primitives. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `core/config.js loadConfig` | Missing `projectName` | Function argument | Throw project-required error | CLI/project selection must be explicit or env-backed by caller. |
| `core/config.js loadConfig` | `opts.repoRoot \|\| process.env.REPO_ROOT` present | CLI/env repo root | Resolve, require `.git`, log source | Explicit repo root path wins over Git discovery. |
| `core/config.js loadConfig` | No explicit repo root | Current working tree via `getRepoRoot()` | Use Git to discover repo root or throw remediation text | Enables running from inside repo without flags. |
| `core/config.js loadConfig` | `progress.pipeline_review && !config.pipeline_review` | Progress/config | Copy progress review config into config | Progress can backfill missing platform config field. |
| `core/config.js loadConfig` | Missing `config.discord_webhook_url` and `DISCORD_WEBHOOK` present | Config/env | Set `config.discord_webhook_url` | Env fallback for Discord webhook. |
| `core/config.js validateConfig` | Agent lacks `dispatch`, or Redis agent lacks `redis_js_path` | `config.agents.*` | Accumulate validation errors | Dispatch path completeness before runtime. |
| `core/config.js validateConfig` | Wave 3 fields invalid type/range | `acp_monitor`, `telemetry`, `case_study` fields | Accumulate errors or normalize numeric defaults | Prevents invalid runtime settings. |
| `core/config.js validateConfig` | Gate type not registered in startup registry | `progress.gates.*.type`; plugin registry | Accumulate gate owner error | Gate validity is registry-owned, not hardcoded only. |
| `core/config.js validateConfig` | Review/Buster/Approval gate-specific required/enum fields | Gate config | Accumulate field-specific errors | Gate behavior requires valid control fields. |
| `core/context.js createPluginContext` | Missing config/hookFamily/stageId or no stage owner | Required args and registry | Throw | Plugin context cannot run without ownership metadata. |
| `core/context.js createPluginContext` | Manifest sourceType is `builtin` | Plugin record | Add non-enumerable `coreRuntime` | Builtins can read mutable config/progress; restricted plugins cannot. |
| `core/context.js createPluginContext` | Capability includes surface capability | `capabilities` array | Add artifacts/stream/telemetry/waits/signals/notify/workerRuntime surfaces selectively | Enforces plugin least privilege. |
| `core/context.js narrowPluginInputForCapabilities` | No `read.artifacts` / no `notify.operator` | Capabilities | Remove artifact/summaries/priorResults and/or presentation | Prevents plugins from seeing data beyond capability grant. |
| `core/platform-config.js discoverSwarmConfigPath` | First existing candidate found | Candidate list | Return it; else return first normalized candidate | Deterministic discovery and missing-path error. |
| `core/policy.js resolvePolicy` | Candidate precedence | Runtime/scope/project/config model/thinking values | First non-empty normalized value wins | Central model/thinking authority. |
| `core/policy.js resolvePolicy` | `dispatchPath` unsupported for thinking | `redis` | Do not set thinking; source `not_supported_on_redis` | Makes Redis/Buster thinking boundary explicit. |
| `core/runtime.js resolveRunContext` | Explicit context vs config projection vs active context vs fallback | Input, config fields, AsyncLocalStorage | Return first available run context in that order | Prevents active context from overriding explicit config. |
| `core/paths.js validateSafePath` | Path empty/non-string or outside allowed prefixes | `filePath`, `ALLOWED_PATH_PREFIXES` | Throw | Restricts configured executable/tool paths. |
| `core/temp.js file` | `_dir` absent | Manager state | Lazy `init()` then build file path | Scratch dir created only on first use. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `core/config.js loadConfig` | `config` object | Platform swarm config, project name, repo root, progress | Spread swarm config first, then set project/repo/paths | Runtime config has canonical repo/project paths. |
| `core/config.js validateConfig` | `config.agents.buster` | Existing config | Force `dispatch = 'redis'`; default `redis_js_path` only if nullish | Buster dispatch is normalized to Redis. |
| `core/config.js validateConfig` | Config defaults | Missing fields | `??=` defaults for models/poll/timeout/fails/acp_monitor values | Defaults are set before downstream runtime. |
| `core/config.js validateConfig` | `config.plugins`, `_pluginRegistry`, `_validationErrors` | Registry build result/errors | Normalized plugin config replaces input; registry stored only on success; errors stored before throw | Startup plugin registry becomes config authority. |
| `core/context.js PipelineContext.syncConfigRuntimeFields` | Config compatibility fields | Context state | Bind run id/stats always; only copy plugin/test/runtime overrides if config lacks them | ctx-first state remains compatible with legacy config consumers. |
| `core/context.js setLogDirs` | Context and config log dirs | New dirs | Non-null inputs replace context fields, then sync to config | Config projection mirrors context. |
| `core/context.js setPipelineLogStreams` | Context log fd/path fields | fd-like objects | Store fd and `.path` fields; set legacy aliases | Logger can write by path. |
| `core/context.js buildPluginInvocationEnvelope` | Read-only envelope | Input, plugin context, extras | Capability-narrow base, add plugin info, add safe extras, expose nested `input` | Plugin receives immutable, scoped input. |
| `core/logger.js log/createLogger.log` | `ctx.stats.errors` | ERROR log entries | Append only while length < 50 | Prevents unbounded in-memory error stats. |
| `core/runtime.js setRunState` | Fallback run context and live exports | runId/stats | Defaults when absent; update `RUN_ID` and `_runStats` bindings | Legacy run state remains available. |
| `core/runtime.js bindRunContext` | Config run fields | Context | Set `_runId`, `run_id`, `_runStats` | Config projection points to context run state. |
| `core/temp.js createTempManager` | Closure `_dir` | init/file/cleanup | `init` creates dir; `file` lazily initializes; cleanup removes but does not reset `_dir` | `dir` remains last owned path even after cleanup. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `core/config.js validateConfig` | Iterates required-field keys, agents, top-level config keys, gates, and agent Redis paths | None | None | Completes all validation and throws once if any errors accumulated. |
| `core/platform-config.js discoverSwarmConfigPath` | Iterate normalized candidates until existing file | None | None | Return first existing candidate; if none exist, return first candidate. |
| `core/policy.js resolvePolicy` | Iterate model candidates then thinking candidates | None | None | Stop at first non-empty candidate; unsupported thinking path skips candidate loop. |
| `core/logger.js writeEntry` | Iterate log targets | None | None | Best-effort append each target; swallow per-target errors. |
| `core/temp.js cleanup` | None | None | None | Remove owned dir if it exists; errors swallowed. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `REPO_ROOT` | Environment variable | `core/config.js loadConfig` | Used when `opts.repoRoot` absent | Explicit repo root path; must contain `.git` directory. |
| `DISCORD_WEBHOOK` | Environment variable | `core/config.js loadConfig` | Used when config lacks `discord_webhook_url` | Backfills Discord webhook URL. |
| `SWARM_CONFIG` | Environment variable | `core/platform-config.js discoverPlatformSwarmConfigCandidates` | Fallback after `/home/node/.openclaw/swarm.config.json` | Candidate is resolved and deduped. |
| `/home/node/.openclaw/swarm.config.json` | Platform config path default | `core/platform-config.js` | `DEFAULT_SWARM_CONFIG_PATH` | First swarm config candidate. |
| `opts.repoRoot` | Function input | `core/config.js loadConfig` | Highest repo-root source | Logged as `--repo flag`; must contain `.git`. |
| `projectName` | Function input | `core/config.js loadConfig` | Required | Builds project `.swarm` paths. |
| `config.agents.*.dispatch` | Config field | `core/config.js validateConfig`; `core/policy.js` callers pass dispatchPath | Required; Buster forced to `redis` | Dispatch drives validation and thinking support. |
| `config.agents.*.redis_js_path` | Config field/path | `core/config.js validateConfig`, `validateBusterConfig` | Buster default `/app/skills/pipeline/tools/redis.js` | Validated by `validateSafePath`. |
| `config.poll_interval_seconds` | Config field | `core/config.js validateConfig` | `30` | Defaulted if nullish. |
| `config.default_timeout_minutes` | Config field | `core/config.js validateConfig` | `45` | Defaulted if nullish. |
| `config.default_max_fails` | Config field | `core/config.js validateConfig` | `3` | Defaulted if nullish. |
| `config.acp_monitor.unknown_poll_limit` | Config field | `core/config.js validateConfig` | `10` | Defaulted if nullish. |
| `config.acp_monitor.stale_poll_limit` | Config field | `core/config.js validateConfig` | `10` | Defaulted if nullish. |
| `config.acp_monitor.max_transcript_extensions` | Config field | `core/config.js validateConfig` | `3`; non-negative number | Converted with `Number()`. |
| `config.acp_monitor.transcript_grace_ms` | Config field | `core/config.js validateConfig` | `300000`; non-negative number | Converted with `Number()`. |
| `config.telemetry.enabled` | Config field | `core/config.js validateConfig` | Optional boolean | Type checked if present. |
| `config.telemetry.stream_key` | Config field | `core/config.js validateConfig` | Optional string | Type checked if present. |
| `config.case_study.enabled/model/output_file` | Config fields | `core/config.js validateConfig` | Optional | Type checked if present. |
| `config.plugins` | Config field | `core/config.js validateConfig` | Optional | Normalized by `buildPluginRegistry`. |
| `progress.project`, `progress.execution_order`, `progress.modules` | Progress fields | `core/config.js validateConfig` | Required | Missing values are validation errors. |
| `progress.gates.*` | Progress fields | `core/config.js validateConfig` | Optional | Gate type/fields validated against plugin registry and gate type. |
| `config._runtimeOverrides.model/thinking` | Runtime config field | `core/policy.js resolvePolicy`; `PipelineContext` | Set by CLI when runtime overrides present | Highest policy precedence. |
| `progress.defaults.models/thinking[agent]` | Progress defaults | `core/policy.js resolvePolicy` | Project default policy | Used after scope policy and before platform fallback. |
| `config.fallback_model` | Platform fallback | `core/policy.js resolvePolicy` | Lowest non-null model source | Thinking has no platform fallback; it comes from runtime/scope/project only. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| `<repo>/Projects/<project>/src/.swarm` | `core/config.js loadConfig` | Config consumers | None in scoped files | Canonical `config.paths.swarm_dir`. |
| `<repo>/Projects/<project>/src/.swarm/progress.json` | `core/config.js loadConfig` | `loadConfig`, `runtime.loadProgress` | None in scoped files | Canonical progress file path. |
| `<repo>/Projects/<project>/src/.swarm/modules` | `core/config.js loadConfig` | Module path builders | None in scoped files | Canonical module root. |
| `/home/node/.openclaw/swarm.config.json` | `core/platform-config.js` | `loadPlatformSwarmConfig` | None | Default platform config. |
| `SWARM_CONFIG` resolved path | `core/platform-config.js` | `loadPlatformSwarmConfig` if selected | None | Fallback platform config candidate. |
| Module `status.json` | `core/paths.js statusPath` | Status services/runners outside P01 | Status services outside P01 | Built as `<modules_dir>/<dir>/status.json`. |
| Gate status file | `core/paths.js gateStatusPath` | Approval/gate services outside P01 | Gate services outside P01 | Built as `<swarm_dir>/<gateId>-gate-status.json`. |
| Module/gate log dirs | `core/paths.js moduleLogDir`, `gateLogDir`, test/lint variants | Services/runners outside P01 | Services outside P01 | Rooted under `config._logDir`. |
| Run log dir | `core/paths.js pipelineRunLogDir`; `core/runtime.js runLogDir` | Logger/telemetry/services | Services outside P01 | Built as `<_logDir>/pipeline/runs/<run_id>`. |
| Pipeline JSONL log paths | `core/logger.js writeEntry` | Operators/services | `core/logger.js` | Explicit ctx paths preferred; fallback `<_runLogDir>/pipeline.jsonl`. |
| Model policy log | `core/policy.js logEffectivePolicy` | Operators/docs | `core/policy.js` | `<_logDir>/pipeline/model-policy.jsonl`, best-effort. |
| Temp dir/files | `core/temp.js createTempManager` | CLI/downstream temp users | `core/temp.js` creates/removes dir | `<os.tmpdir()>/swarm-pipeline-*`. |
| Completion stream key | `core/paths.js completionStreamKey` | Redis completion services outside P01 | Redis services outside P01 | `swarm:pipeline:<project>:completions`. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Startup config/progress validation | `core/config.js validateConfig` | CLI/runners/services | None. |
| Platform swarm config discovery order | `core/platform-config.js` | `core/config.js`, lint discovery/docs | None. |
| Plugin status/exit/constants vocabulary | `core/constants.js` | Registry/contracts/public index | None. |
| Pipeline runtime state bridge | `core/context.js PipelineContext` and `core/runtime.js bindRunContext` | Logger/runtime/services | Compatibility config mutation remains until callers migrate ctx-first. |
| Plugin context capability surface | `core/context.js createPluginContext` | Plugin runner/dispatch services | None. |
| Structured logger active context | `core/logger.js` | Runtime resolver and callers of `log` | None. |
| Canonical path builders | `core/paths.js` | Status/gate/module/telemetry/services | Later batches verify writers/readers for each artifact. |
| Model/thinking policy resolution | `core/policy.js resolvePolicy` | Runners and telemetry | CLI help drift captured as `P01-ISSUE-001`. |
| Run identity/stats | `core/runtime.js` | Context/logger/services | None. |
| Temp scratch lifecycle | `core/temp.js` | CLI/downstream temp users | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Config object after `loadConfig` | `core/config.js loadConfig` | Platform config plus `project`, `repo_root`, `paths: { swarm_dir, modules_dir, progress_file }`, optional `pipeline_review`, `discord_webhook_url`, defaults, `_pluginRegistry` | `validateConfig` | CLI/runners/services. |
| Progress minimum schema | Project setup/progress file, validated by `core/config.js` | Required `project`, `execution_order`, `modules`; optional `gates`, `defaults`, `pipeline_review` | `validateConfig` required-field checks | Pipeline scheduler/runners. |
| Gate config schema slice | `progress.gates` validated by `core/config.js` | Common `type`; review requires `review_name`, `instructions_file`, optional `on_nogo=fix_and_rereview`; buster optional `on_fail=fix_and_retest`; approval requires `title`, optional `on_timeout=block\|continue`, positive `timeout_minutes` | Registry gate type ownership plus field checks | Gate runners. |
| Run stats object | `core/runtime.js createRunStats` | `started_at`, module/gate completed/failed arrays, attempt/review counters, `errors`, notification/Git counters, `config_validation_issues` | Constructor only | Logger/runners/summary. |
| Pipeline context runtime snapshot | `core/context.js runtimeStateSnapshot` | `schemaVersion`, `runId`, `novaChannel`, `logDir`, `runLogDir`, booleans for registries/overrides, cloned `stats` | `createReadonlySnapshot` | Diagnostics/tests. |
| Plugin context v1 | `core/context.js createPluginContext` | `schemaVersion: 'v1'`, `moduleId`, `hookFamily`, `stageId`, `capabilities`, `read.*`, optional surfaces by capability | Capability checks and registry owner resolution | Plugin dispatchers. |
| Plugin invocation envelope | `core/context.js buildPluginInvocationEnvelope` | Read-only input; optional `plugin: { schemaVersion:'v1', moduleId, hookFamily, stageId, config }`; top-level `input` reference; extras | `narrowPluginInputForCapabilities`, readonly snapshots | Plugin implementations. |
| Effect receipt | `core/runtime.js createEffectReceipt`; `core/context.js buildReceiptMethod` defaults | `{ accepted: boolean, requestId: string, recordedAt: ISO string, dedupeKey? }` | Constructor/default receipt wrapper | Plugin effect callers. |
| Model policy resolution result | `core/policy.js resolvePolicy` | `{ model, thinking, model_source, thinking_source, thinking_supported }` | `validateThinkingLevel`, precedence resolver | Runners/telemetry/policy logger. |
| Model policy JSONL record | `core/policy.js logEffectivePolicy` | `ts`, `run_id`, `project`, `scope`, `agent`, optional `module_id`/`gate_id`, `model`, `model_source`, `thinking`, `thinking_source`, `thinking_supported` | Best-effort writer, no schema validator | Operators/audit docs. |
| Plugin constants schema | `core/constants.js` | Status enum, exit codes, plugin kind/hook/stage/capability/rejection-code sets | Static constants | Registry/contracts. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| None found in scoped files | None | None | None | None | None |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `core/config.js loadConfig` | Missing project, bad explicit repo, repo discovery failure, missing/invalid progress JSON, platform config failure | No | No retry/backoff | Throws terminal setup error | None. |
| `core/config.js validateConfig` | Missing/invalid config/progress/gate/plugin fields | No | Accumulates all validation errors before throwing once | Sets `config._validationErrors`, then throws terminal config error | None. |
| `core/config.js validateBusterConfig` | Buster config missing/not Redis/path invalid | No | No retry/backoff | Throws | None. |
| `core/context.js createPluginContext` | Missing args or plugin owner | No | No retry/backoff | Throws | None. |
| `core/context.js plugin surfaces` | Missing scaffolded surface, missing required handler result, downstream effect failure | No in scoped file | No retry/backoff | Throws to plugin caller; default receipt only for undefined optional receipt paths | Request/result deep-cloned, not redacted. |
| `core/logger.js writeEntry` | Filesystem append/mkdir failure | No | No retry/backoff | Swallows as non-critical; stderr still emitted by caller before file write | None. |
| `core/paths.js validateSafePath` | Empty/non-string/disallowed path | No | No retry/backoff | Throws | None. |
| `core/platform-config.js loadPlatformSwarmConfig` | Missing config file or invalid JSON/read | No | No retry/backoff | Throws | None. |
| `core/policy.js validateThinkingLevel/resolvePolicy` | Invalid thinking level | No | No retry/backoff | Throws clear validation error | None. |
| `core/policy.js logEffectivePolicy` | Missing `_logDir` or append failure | No | No retry/backoff | Missing log dir returns; append failure logs DEBUG and does not throw | None. |
| `core/runtime.js isoNow/loadProgress` | Invalid date input; missing/invalid progress JSON | No | No retry/backoff | Throws | None. |
| `core/temp.js init/cleanup` | Temp create failure; cleanup failure | No | No retry/backoff | Create failure throws; cleanup failure swallowed | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `core/config.js loadConfig` | Setup/config/progress load failures | Partial when caller catches/logs; none in function | none in scoped function | none | Function throws | CLI P00a catches many setup failures and emits stderr/stdout JSON. |
| `core/config.js validateConfig` | Validation errors | No direct telemetry | none | `config._validationErrors` in memory | Function itself | Caller logs terminal error. |
| `core/config.js validateBusterConfig` | Buster invalid | No direct telemetry | none | none | Function throws | Caller owns logging. |
| `core/context.js createPluginContext` | Missing args/owner | No direct telemetry | none | none | Function throws | Caller/plugin dispatcher owns logging. |
| `core/context.js plugin surfaces` | Default stream/telemetry/notify effect failures | Yes on success path; failure telemetry depends on downstream sink | Filesystem/logs via observability; Redis/filesystem via telemetry stream; Discord via integration | `plugin.stream`, plugin telemetry type, Discord notification | `appendStructuredEvent`, `emitTelemetryStreamEvent`, `discord` | Exceptions propagate if sink fails. |
| `core/logger.js writeEntry` | File append failure | Partial | stderr only from surrounding log call; file sink failure swallowed | none for file failure | `console.error` before `writeEntry` | No observability for lost file writes in logger itself. |
| `core/paths.js validateSafePath` | Path rejected | No | none | none | Function throws | Caller owns logging. |
| `core/platform-config.js loadPlatformSwarmConfig` | Missing/invalid platform config | No direct telemetry | none | none | Function throws | Caller owns logging. |
| `core/policy.js validateThinkingLevel/resolvePolicy` | Invalid thinking | No direct telemetry | none | none | Function throws | CLI catches runtime `--thinking`; service callers own telemetry. |
| `core/policy.js logEffectivePolicy` | Append failure | Partial | stderr/file through core logger if active | DEBUG log `[policy] logEffectivePolicy failed...` | `logEffectivePolicy` | Non-blocking; no model-policy row written on failure. |
| `core/runtime.js isoNow/loadProgress` | Invalid date/progress load | No direct telemetry | none | none | Function throws | Caller owns logging. |
| `core/temp.js cleanup` | Cleanup failure | No | none | none | Function swallows | Scratch cleanup failure is silent. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js runtime | `node` binary | Observed `v24.14.0` during review | All P01 core modules | ESM, sync fs/path, AsyncLocalStorage, process hooks | No package pin in scoped files. |
| Git binary | System `git` through shared helper | Observed `2.39.5` during review | `core/config.js` via `getRepoRoot`; `core/git-context.js` facade | Repo discovery and repo helper defaults | Explicit repo root path check requires `.git` directory in `loadConfig`. |
| Node `fs` built-in | Runtime built-in | Node major 24 observed | `config.js`, `logger.js`, `platform-config.js`, `policy.js`, `runtime.js`, `temp.js` | Config/progress/log/policy/temp IO | Mostly synchronous; failures throw except logger/temp cleanup best-effort paths. |
| Node `path` built-in | Runtime built-in | Node major 24 observed | `config.js`, `logger.js`, `paths.js`, `platform-config.js`, `policy.js`, `runtime.js`, `temp.js` | Canonical path construction | Path validation limited to configured safe path helper. |
| Node `async_hooks.AsyncLocalStorage` | Runtime built-in | Node major 24 observed | `core/logger.js`; `core/runtime.js` indirectly | Active context propagation | `clearActiveContext` uses `enterWith(null)`. |
| Node `os` built-in | Runtime built-in | Node major 24 observed | `core/temp.js` | Temp root selection | Uses `os.tmpdir()`. |
| Internal plugin registry | `skills/nova/pipeline/core/registry.js` | Internal source | `core/config.js`, `core/context.js` | Plugin config normalization and stage owner lookup | Full registry implementation reviewed in P02. |
| Internal observability/telemetry/Discord/artifact/correlation services | `skills/nova/pipeline/services/*`, `integrations/discord.js` | Internal source | `core/context.js` default plugin effect surfaces | Stream, telemetry, notification, artifacts, correlation | Full sink behavior reviewed in later batches. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Logger in-memory error capture | Error stats cap | 50 errors per context stats object | Further ERROR logs still emit but are not appended to `stats.errors` | Stderr/log JSON still emitted | None. |
| Logger file append | Synchronous append per log target | No explicit queue; target list max observed 2 plus fallback | Append failure swallowed | stderr only | None. |
| Temp manager process exit hooks | One `process.on('exit')` handler per `init()` call | No cap in scoped file | Repeated init can register multiple cleanup handlers | None | None. |
| Git/config filesystem reads | Synchronous | No queue | Throws or blocks caller | Caller-level logging | None. |
| Plugin default effect surfaces | Await downstream handlers | No local timeout/throttle | Sink failure propagates to caller | Sink-dependent | Later telemetry/Discord/artifact batches own sink limits. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| None found in scoped files | None | None | None | None | None |

`core/policy.js` names `acp` as a thinking-supported dispatch path, and plugin invocation snapshots may carry session identifiers from callers, but P01 scoped files define no ACP transcript, monitor, delta, flush, or projection protocol.

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Temp manager lazy scratch lifecycle and cleanup | `tests/verification/behavior/areas/foundations.mjs` | Good behavior coverage | Does not cover `mkdtempSync` failure. |
| Core helpers are not public index exports | `tests/verification/behavior/areas/foundations.mjs` | Good public-boundary coverage | Static public API only. |
| Config validation derives gate types from plugin registry | `tests/verification/behavior/areas/foundations.mjs` | Good registry/config integration coverage | Does not cover all validation fields. |
| Pipeline context compatibility bridge and runtime snapshot | `tests/verification/behavior/areas/foundations.mjs` | Strong behavior coverage | Does not cover file logging failures. |
| Plugin context surfaces, capability narrowing, artifacts, effects | `tests/verification/behavior/areas/foundations.mjs` | Strong behavior coverage | Default Discord/telemetry sink failure behavior covered later. |
| Runtime run identity context/config/fallback order | `tests/verification/behavior/areas/runtime-surface.mjs` | Strong in-process isolation coverage | None found. |
| Model policy ignores legacy `progress.models` and uses `progress.defaults.models` | `tests/verification/behavior/areas/models.mjs` | Good policy precedence slice | Does not check CLI help values; see issue. |
| Platform swarm config discovery/docs | `tests/verification/behavior/areas/repo-docs.mjs` | Good source/docs/candidate coverage | None found. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- `P01-ISSUE-001` — Runtime `--thinking adaptive` is accepted by policy but omitted from Nova CLI help.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
