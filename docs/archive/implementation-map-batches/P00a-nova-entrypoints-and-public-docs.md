# Batch P00a — Nova entrypoints and public docs

Status: completed
Date started: 2026-05-08
Date completed: 2026-05-08
Reviewer: Nova

## Scope

```text
skills/nova/pipeline.js
skills/nova/pipeline/README.md
skills/nova/pipeline/SKILL.md
skills/nova/pipeline/index.js
skills/nova/pipeline/cli.js
skills/nova/pipeline/cli-args.js
```

Scope expansion verified: 6 files, under the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/nova/pipeline.js
kubeclaw-main/skills/nova/pipeline/README.md
kubeclaw-main/skills/nova/pipeline/SKILL.md
kubeclaw-main/skills/nova/pipeline/index.js
kubeclaw-main/skills/nova/pipeline/cli.js
kubeclaw-main/skills/nova/pipeline/cli-args.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/skills/common/pipeline/cli-args.js
kubeclaw-main/tests/verification/contracts/check-pipeline-entrypoint-shim-surface.mjs
kubeclaw-main/tests/verification/contracts/check-strict-cli-args-surface.mjs
kubeclaw-main/tests/verification/runtime/check-nova-startup-smoke.mjs
```

## Per-file map

### `skills/nova/pipeline.js`

Role: Thin compatibility executable for `node /app/skills/pipeline.js`; re-exports the modular public API and dispatches direct CLI execution to `pipeline/cli.js`.

Imports/dependencies: Node `url.fileURLToPath`; Node `fs`; dynamic import of `./pipeline/cli.js` only when invoked as the entry script.

Exports/public surface: `export * from './pipeline/index.js'`; default export from `./pipeline/index.js`.

Defines: `__currentPath` and `__entryPath` realpath comparison for entrypoint detection.

Important variables/state: Reads `process.argv[1]`; no persistent state mutation.

Calls out to: `fs.realpathSync`, `fs.existsSync`, `fileURLToPath`, dynamic `main()` from `pipeline/cli.js`.

Called by / expected callers: Direct Node execution at `/app/skills/pipeline.js`; module import by tests and runtime callers needing public API.

Environment variables / CLI inputs / config fields: Uses `process.argv[1]` only for direct-invocation detection.

Paths built/read/written: Realpaths of `import.meta.url` and `process.argv[1]`; imports `./pipeline/index.js` and `./pipeline/cli.js`; writes none.

Authority behavior: Entrypoint shim authority only; does not own runner/service logic. Contract test enforces no direct runner/service imports and <=20 lines.

Error/retry/terminal behavior: If direct CLI dynamic import or `main()` rejects, there is no local catch in this file; terminal handling is delegated to `pipeline/cli.js` or Node's unhandled top-level await behavior.

Verification coverage: `tests/verification/contracts/check-pipeline-entrypoint-shim-surface.mjs`; `tests/verification/runtime/check-nova-startup-smoke.mjs`.

Findings: None for this file.

### `skills/nova/pipeline/README.md`

Role: Public directory reference for the modular Nova pipeline, public API boundary, shared-helper ownership, extension guidance, governance surfaces, observability artifacts, and test command.

Imports/dependencies: Documentation only.

Exports/public surface: Documents `pipeline/index.js` supported exports: `runPipeline`, `loadConfig`, `STATUS`, exit constants, `registerShutdownHooks`, telemetry emitters, notification helpers.

Defines: Directory ownership, public API policy, non-exported helper policy, shared helper packaging expectation, governance docs, observability artifact list.

Important variables/state: Documents architecture validator outputs, approval gate state/evidence relationship, model-policy log, `.swarm/logs` tree, and deployment command surfaces.

Calls out to: Documentation references only.

Called by / expected callers: Maintainers and developers extending the pipeline or checking public API expectations.

Environment variables / CLI inputs / config fields: Mentions no direct env reads; documents approval config `on_timeout` normalized from lower-case `block|continue` to canonical uppercase `BLOCK|CONTINUE` in downstream artifacts.

Paths built/read/written: Documents `.swarm/logs/architecture-validator/results.json`, `.swarm/logs/architecture-validator/summary.md`, `.swarm/<gate-id>-gate-status.json`, `.swarm/logs/pipeline/*`, `.swarm/logs/pipeline/runs/<run-id>/*`, `.swarm/logs/cost`, `.swarm/logs/redis`, `.swarm/logs/gates/<gate-id>`, and `pipeline/tests/`.

Authority behavior: States `pipeline/index.js` is the narrow public API surface; approval wait lifecycle/read-model state is authoritative while gate-state file is operator evidence and Discord is UI only.

Error/retry/terminal behavior: Documents retry flow and governance halt behavior but implements none.

Verification coverage: Public API and shim surfaces covered by startup and entrypoint contract tests; README claims about governance artifacts require later implementation batches.

Findings: None in P00a scope.

### `skills/nova/pipeline/SKILL.md`

Role: Skill metadata and operator-facing quickstart for pipeline CLI and tools.

Imports/dependencies: Documentation metadata only.

Exports/public surface: Skill frontmatter `name: pipeline`, description, CLI examples, Redis/lint/project-summary tool examples.

Defines: High-level pipeline sequence and config location.

Important variables/state: Documents `Projects/<name>/src/.swarm/progress.json` as project config/progress location.

Calls out to: Documentation references for `node /app/skills/pipeline.js`, `pipeline/tools/redis.js`, `pipeline/tools/lint-report.js`, and `pipeline/tools/project-summary.js`.

Called by / expected callers: OpenClaw skill discovery and operators.

Environment variables / CLI inputs / config fields: Documents `--project`, `--resume`, `--status`, `--dry-run`, `--blueprint-list`, Redis tool `--action`, `--type`, `--payload`, `--stream`, `--module`, lint `--repo`, `--tier`, project summary `--project`.

Paths built/read/written: Documents `/app/skills/pipeline.js`, `/app/skills/pipeline/tools/redis.js`, `/app/skills/pipeline/tools/lint-report.js`, `/app/skills/pipeline/tools/project-summary.js`, and `Projects/<name>/src/.swarm/progress.json`.

Authority behavior: Documentation only; points to project-setup skill for full setup instructions.

Error/retry/terminal behavior: States pipeline handles failures, retries, escalation; no implementation in scoped file.

Verification coverage: Startup smoke covers CLI help markers; tool examples are covered in later tool batches.

Findings: None.

### `skills/nova/pipeline/index.js`

Role: Narrow public module API for Nova pipeline callers.

Imports/dependencies: Re-export edges to `core/config.js`, `agents/shutdown.js`, `core/constants.js`, `services/telemetry.js`, `services/notification-dispatch.js`, `services/notification-contract.js`, and `runners/pipeline-runner.js`.

Exports/public surface: `loadConfig`, `registerShutdownHooks`, `STATUS`, `EXIT_OK`, `EXIT_ERROR`, `EXIT_NEEDS_NOVA`, `EXIT_BLOCKED`, `EXIT_TIMEOUT`, `EXIT_RATE_LIMITED`, telemetry emitters (`emitEvent`, lifecycle/status emitters, cost/rate-limit/observability/transcript/progress emitters), `dispatchNotificationHook`, notification constants/builders/validator, `runPipeline`, and default export from `pipeline-runner.js`.

Defines: No local functions; export list only.

Important variables/state: None.

Calls out to: Static module export resolution only.

Called by / expected callers: `skills/nova/pipeline.js`, `skills/nova/pipeline/cli.js`, runtime importers, and verification tests.

Environment variables / CLI inputs / config fields: None directly.

Paths built/read/written: None directly beyond static import paths.

Authority behavior: Owns the stable public API allowlist; intentionally not a catch-all barrel.

Error/retry/terminal behavior: None in scoped file; import-time failures propagate to importers.

Verification coverage: `check-nova-startup-smoke.mjs` verifies exported names and types; `check-pipeline-entrypoint-shim-surface.mjs` compares entrypoint exports to index exports.

Findings: None.

### `skills/nova/pipeline/cli.js`

Role: Nova pipeline CLI entrypoint and command router.

Imports/dependencies: Node `url.fileURLToPath`, Node `fs`; public API from `./index.js`; `listBlueprints`/`releaseBlueprint`; context/logger/temp/status-store/runtime/policy helpers; `runPipeline`, `printStatus`, `dryRun`; strict parser `parseCliFlagValues`.

Exports/public surface: `main()`; direct execution guard also invokes `main()`.

Defines: CLI flag schema, help text, `output()` JSON-line writer, `log()` stderr logger, temp lifecycle wrapper, command routing.

Important variables/state: Mutates parsed `flags` to add camelCase aliases (`blueprintList`, `promptFile`, `novaChannel`, `runtimeModel`, `runtimeThinking`, `dryRun`); attaches `config._runtimeOverrides = { model, thinking }` when runtime overrides are present; creates run ID/stats/context; sets temp dir on context; activates logger context.

Calls out to: `parseCliFlagValues`, `validateThinkingLevel`, `loadConfig`, `createRunId`, `createRunStats`, `createPipelineContext`, `setActiveContext`, `initLogDir`, `registerShutdownHooks`, `listBlueprints`, `releaseBlueprint`, `printStatus`, `dryRun`, `runPipeline`, `clearActiveContext`, `process.exit`.

Called by / expected callers: Dynamic import from `skills/nova/pipeline.js`; direct `node skills/nova/pipeline/cli.js`; runtime smoke imports `main`.

Environment variables / CLI inputs / config fields: CLI flags `--project`, `--repo`, `--module`, `--blueprint`, `--blueprint-list`, `--prompt`, `--prompt-file`, `--nova-channel`, `--model`, `--thinking`, `--resume`, `--status`, `--dry-run`, `--help`; env fallbacks `CURRENT_PROJECT` and `NOVA_CHANNEL`; config loaded by `loadConfig(flags.project, { repoRoot: flags.repo })`; progress module lookup `progress.modules[flags.blueprint]`.

Paths built/read/written: Realpaths for `import.meta.url`/`process.argv[1]`; reads `flags.promptFile` with `fs.existsSync` and `fs.readFileSync`; initializes temp dir through `createTempManager`; initializes log dir through `initLogDir(config, ctx)`.

Authority behavior: Owns CLI-level command precedence: help exits before env fallback/config; nova-channel requirement applies only non-status/non-dry-run/non-blueprint commands; blueprint commands run before status/dry-run; full pipeline run passes `{ module, resume, novaPrompt, novaChannel }` to `runPipeline`.

Error/retry/terminal behavior: `--help` exits 0; missing `--nova-channel` for real runs prints stderr and exits `EXIT_ERROR`; invalid `--thinking` is caught inside the main try body and emits JSON `{ exit, error }`; missing prompt file throws and is caught by outer try; blueprint id absent from progress emits JSON error and exits `EXIT_ERROR`; outer catch logs error, emits JSON `{ exit: EXIT_ERROR, error }`, cleans temp dir, clears active context, exits `EXIT_ERROR`. Parser errors from `parseCliFlagValues` occur before the try/catch and currently surface as an uncaught stack trace.

Verification coverage: `check-nova-startup-smoke.mjs` verifies syntax, import, `main`, and `--help`; `check-strict-cli-args-surface.mjs` verifies this file uses the strict parser but does not execute a Nova unknown-flag path.

Findings: `P00a-ISSUE-001` added for uncaught strict parser errors in Nova CLI.

### `skills/nova/pipeline/cli-args.js`

Role: Repo-local compatibility shim for shared strict CLI parsing.

Imports/dependencies: Re-exports from `../../common/pipeline/cli-args.js`.

Exports/public surface: Whatever the common parser exports, currently `parseCliArgs` and `parseCliFlagValues`.

Defines: No local logic.

Important variables/state: None.

Calls out to: Static re-export only.

Called by / expected callers: `skills/nova/pipeline/cli.js` and other Nova-local direct imports that need CLI parsing.

Environment variables / CLI inputs / config fields: None directly; common parser handles argv arrays and schema objects.

Paths built/read/written: None directly beyond static relative import.

Authority behavior: Compatibility facade; parser authority is `skills/common/pipeline/cli-args.js`.

Error/retry/terminal behavior: Common parser throws `Error` for unknown flags, unexpected positionals, missing values, invalid boolean inline values, and required/positional count failures; shim adds no catch or telemetry.

Verification coverage: `check-strict-cli-args-surface.mjs` imports common parser and checks this CLI migrated to it.

Findings: None for shim; parser handling issue is carried on `cli.js`.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `skills/nova/pipeline.js` | `skills/nova/pipeline/index.js` | `export *`, default re-export | Entrypoint public API is exactly the index surface. |
| `skills/nova/pipeline.js` | `skills/nova/pipeline/cli.js` | dynamic import `{ main }`; `await main()` | Only when realpath of current module equals `process.argv[1]`. |
| `skills/nova/pipeline/cli.js` | `skills/nova/pipeline/cli-args.js` -> `skills/common/pipeline/cli-args.js` | `parseCliFlagValues(argv, schema)` | Strict flag parser; throws before CLI try/catch. |
| `skills/nova/pipeline/cli.js` | `skills/nova/pipeline/index.js` | `loadConfig`, `EXIT_*`, `registerShutdownHooks` | Uses public API for config/constants/shutdown. |
| `skills/nova/pipeline/cli.js` | `skills/nova/pipeline/services/blueprint.js` | `listBlueprints`, `releaseBlueprint` | Blueprint commands run after config/context setup and before status/dry-run. |
| `skills/nova/pipeline/cli.js` | `skills/nova/pipeline/core/context.js` | `createPipelineContext` | Builds runtime context with config/progress/runId/stats/novaChannel. |
| `skills/nova/pipeline/cli.js` | `skills/nova/pipeline/core/logger.js` | `setActiveContext`, `clearActiveContext` | Sets context before execution; clears only in outer catch. |
| `skills/nova/pipeline/cli.js` | `skills/nova/pipeline/core/temp.js` | `createTempManager().init()/cleanup()` | Temp cleanup called on handled terminal paths. |
| `skills/nova/pipeline/cli.js` | `skills/nova/pipeline/services/status-store.js` | `initLogDir(config, ctx)` | Initializes log directory after context creation. |
| `skills/nova/pipeline/cli.js` | `skills/nova/pipeline/core/runtime.js` | `createRunId`, `createRunStats` | Creates per-run identity and stats before pipeline execution. |
| `skills/nova/pipeline/cli.js` | `skills/nova/pipeline/core/policy.js` | `validateThinkingLevel` | Fails early for invalid `--thinking`. |
| `skills/nova/pipeline/cli.js` | `skills/nova/pipeline/runners/pipeline-runner.js` | `runPipeline`, `printStatus`, `dryRun` | Routes status, dry-run, or full execution. |
| `skills/nova/pipeline/index.js` | owned implementation modules | named/default re-exports | Public API allowlist only; no local behavior. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `skills/nova/pipeline.js` top-level | `__currentPath === __entryPath` | Realpath of `import.meta.url`; realpath or raw `process.argv[1]` | Import `./pipeline/cli.js` and `await main()` only for direct execution | Keeps module imports side-effect-light while preserving executable behavior. |
| `skills/nova/pipeline/cli.js main` | `flags.help` | `--help` | Print help to stderr; `process.exit(0)` before config/env fallback | Help does not require project or nova channel. |
| `skills/nova/pipeline/cli.js main` | Missing `flags.project` / `flags.novaChannel` | `CURRENT_PROJECT`; `NOVA_CHANNEL` | Fill env fallbacks | Env fallback occurs before nova-channel mandate and config load. |
| `skills/nova/pipeline/cli.js main` | `!flags.novaChannel && !flags.status && !flags.dryRun && !flags.blueprint && !flags.blueprintList` | CLI/env nova channel and command flags | Print terminal stderr error; exit `EXIT_ERROR` | Real pipeline runs must have a Discord channel for EXIT 10/TIMEOUT escalation. |
| `skills/nova/pipeline/cli.js main` | `flags.runtimeThinking` then `validateThinkingLevel` throws | `--thinking` | Emit JSON error, cleanup temp, exit `EXIT_ERROR` | Invalid policy input fails before config-dependent work. |
| `skills/nova/pipeline/cli.js main` | `flags.runtimeModel \|\| flags.runtimeThinking` | `--model`; `--thinking` | Mutate `config._runtimeOverrides = { model, thinking }` and log overrides | Runtime CLI overrides beat project defaults and platform fallback through policy resolver. |
| `skills/nova/pipeline/cli.js main` | `flags.blueprintList` | `--blueprint-list` | Output `{ status: 'success', modules }`; cleanup; exit 0 | Blueprint list has command precedence over status/dry-run. |
| `skills/nova/pipeline/cli.js main` | `flags.blueprint` and no `progress.modules[flags.blueprint]` | `--blueprint`; loaded progress | Output `{ status: 'error', error }`; cleanup; exit `EXIT_ERROR` | Prevents release for unknown module id. |
| `skills/nova/pipeline/cli.js main` | `flags.blueprint` and module exists | Progress module `dir`, `stages` | `releaseBlueprint(..., mod.stages \|\| ['forge','buster'])`; output result; exit 0 | Default blueprint stages are forge+buster when module has no stages. |
| `skills/nova/pipeline/cli.js main` | `flags.status` / `flags.dryRun` | `--status`; `--dry-run` | Print status or plan; cleanup; exit 0 | Non-spawning operator commands. |
| `skills/nova/pipeline/cli.js main` | `!novaPrompt && flags.promptFile` | `--prompt`; `--prompt-file`; file existence | Read and trim prompt file or throw if missing | Inline prompt has precedence over prompt-file. |
| `skills/common/pipeline/cli-args.js parseCliArgs` | token does not start `--` and positionals not allowed | argv token; `allowPositionals` | Throw unexpected positional | Nova CLI does not allow positionals in its schema. |
| `skills/common/pipeline/cli-args.js parseCliArgs` | flag unknown/missing value/invalid boolean\|required missing\|positionals out of bounds | argv and schema | Throw `Error` | Parser is strict; caller must catch for friendly CLI output. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `skills/nova/pipeline/cli.js main` | `flags` object aliases | Parsed dashed flags | Copies dashed flags to camelCase (`blueprintList`, `promptFile`, `novaChannel`, `runtimeModel`, `runtimeThinking`, `dryRun`) | Later code uses camelCase names while retaining original keys. |
| `skills/nova/pipeline/cli.js main` | `flags.project`, `flags.novaChannel` | CLI flags; `CURRENT_PROJECT`; `NOVA_CHANNEL` | CLI value wins; env only fills when flag absent | Explicit CLI input has precedence over environment fallback. |
| `skills/nova/pipeline/cli.js main` | `config._runtimeOverrides` | `--model`; `--thinking` | Only set when at least one override is present; missing side becomes `null` | Policy resolver has a single config-attached override record. |
| `skills/nova/pipeline/cli.js main` | Pipeline context temp dir | `tempManager.dir`; context object | Prefer `ctx.setTempDir(tempManager.dir)` when present; else set legacy `ctx._tmpDir` | Context records temp dir across old/new context shapes. |
| `skills/common/pipeline/cli-args.js parseCliArgs` | `values` object | Schema defaults and argv | Defaults seeded first; argv overwrites declared flag values | Returned `values` reflects defaults plus parsed inputs. |

### Loops / polling / timeout mechanics

None found in scoped files.

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `process.argv[1]` | Node CLI input | `skills/nova/pipeline.js`; `skills/nova/pipeline/cli.js` | Node runtime | Used for direct-entry realpath guard. |
| `process.argv.slice(2)` | CLI argv | `skills/nova/pipeline/cli.js main` via `parseCliFlagValues` | Node runtime | Strict schema rejects unknown flags, positionals, missing values. |
| `--project` | CLI string | `skills/nova/pipeline/cli.js main` | Fallback `CURRENT_PROJECT` | Passed to `loadConfig`. |
| `CURRENT_PROJECT` | Environment variable | `skills/nova/pipeline/cli.js main` | Only used when `--project` absent | Project fallback for CLI. |
| `--repo` | CLI string | `skills/nova/pipeline/cli.js main` | None in scoped file | Passed to `loadConfig` as `{ repoRoot: flags.repo }`. |
| `--module` | CLI string | `skills/nova/pipeline/cli.js main` | None | Passed to `runPipeline` options. |
| `--blueprint` | CLI string | `skills/nova/pipeline/cli.js main` | None | Selects module id for blueprint release. |
| `--blueprint-list` | CLI boolean | `skills/nova/pipeline/cli.js main` | `false` | Lists available blueprints after config/context init. |
| `--prompt` | CLI string | `skills/nova/pipeline/cli.js main` | None | Inline Nova prompt; takes precedence over `--prompt-file`. |
| `--prompt-file` | CLI string/path | `skills/nova/pipeline/cli.js main` | None | Read from filesystem and trimmed if `--prompt` absent. |
| `--nova-channel` | CLI string | `skills/nova/pipeline/cli.js main` | Fallback `NOVA_CHANNEL` | Mandatory for real pipeline runs. |
| `NOVA_CHANNEL` | Environment variable | `skills/nova/pipeline/cli.js main` | Only used when `--nova-channel` absent | Escalation channel fallback. |
| `--model` | CLI string | `skills/nova/pipeline/cli.js main` | None | Becomes `config._runtimeOverrides.model`. |
| `--thinking` | CLI string enum | `skills/nova/pipeline/cli.js main` | None | Validated by `validateThinkingLevel`; accepted levels documented as `none\|low\|medium\|high\|xhigh`. |
| `--resume` | CLI boolean | `skills/nova/pipeline/cli.js main` | `false` | Passed to `runPipeline` options. |
| `--status` | CLI boolean | `skills/nova/pipeline/cli.js main` | `false` | Prints status and exits 0. |
| `--dry-run` | CLI boolean | `skills/nova/pipeline/cli.js main` | `false` | Prints execution plan and exits 0. |
| `--help` | CLI boolean | `skills/nova/pipeline/cli.js main` | `false` | Prints help and exits 0 before config load. |
| `progress.modules[flags.blueprint]` | Config/progress field | `skills/nova/pipeline/cli.js main` | From `loadConfig` result | Existence guard for blueprint release; `mod.stages \|\| ['forge','buster']`. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| `skills/nova/pipeline.js` realpath | `fs.realpathSync(fileURLToPath(import.meta.url))` | Entrypoint guard | None | Determines whether shim dispatches CLI. |
| `process.argv[1]` realpath | `fs.realpathSync(process.argv[1])` when existing | Entrypoint guards in `pipeline.js` and `cli.js` | None | Raw argv path used when file does not exist. |
| `./pipeline/index.js` | Static import/export in `skills/nova/pipeline.js` | Runtime importer | None | Public API authority module. |
| `./pipeline/cli.js` | Dynamic import in `skills/nova/pipeline.js` | Direct CLI execution | None | CLI logic isolated from import-only API consumers. |
| `flags.promptFile` | User CLI input | `skills/nova/pipeline/cli.js main` | None | File must exist; content read as UTF-8 and trimmed. |
| Temp directory managed by `createTempManager` | `skills/nova/pipeline/cli.js main` via temp manager | Context/logger/downstream code | Temp manager | Implementation details in core temp batch. |
| Log directory initialized by `initLogDir(config, ctx)` | `skills/nova/pipeline/cli.js main` delegates | Downstream observability | Status-store service | Path construction belongs to later status-store batch. |
| `Projects/<name>/src/.swarm/progress.json` | Documented in `SKILL.md`; help shows `<repo>/Projects/<project>/src/.swarm/progress.json` | `loadConfig` outside scoped files | Project setup/pipeline services outside scoped files | P00a documents path only; config path authority is later core config batch. |
| `.swarm/logs/pipeline/runs/<run-id>/...` | Documented in `README.md` | Operators/docs | Telemetry/status services outside scoped files | P00a docs list observability artifacts; implementation authority is later service batches. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Nova public API export surface | `skills/nova/pipeline/index.js` | `skills/nova/pipeline.js`, runtime importers, verification tests | None. |
| Executable compatibility entrypoint | `skills/nova/pipeline.js` | Operators invoking `/app/skills/pipeline.js`; verification tests | None. |
| CLI command routing and exit mapping at entrypoint | `skills/nova/pipeline/cli.js main` | Operators; wrapper shim | Parser errors occur before main try/catch; see `P00a-ISSUE-001`. |
| Runtime model/thinking override attachment | `skills/nova/pipeline/cli.js main` mutates `config._runtimeOverrides` | `core/policy.js` resolver outside scoped files | Later policy batch should confirm this is the only intended CLI override path. |
| Approval gate lifecycle/read-model state | Documented by `skills/nova/pipeline/README.md`; implementation outside P00a | Operators/docs | Later approval/status batches must verify implementation matches doc authority. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Strict CLI parser schema | `skills/nova/pipeline/cli.js main` | `{ flags: { [name]: { type: 'string'\|'boolean', default?: any, required?: boolean } }, allowPositionals?: boolean, minPositionals?: number, maxPositionals?: number }` | `skills/common/pipeline/cli-args.js parseCliArgs` | `parseCliFlagValues`. |
| Strict CLI parse result | `skills/common/pipeline/cli-args.js parseCliArgs` | `{ values: object, positionals: string[] }`; `parseCliFlagValues` returns `values` only | Parser throws on undeclared/invalid/missing inputs | Nova CLI and other CLI tools. |
| Nova CLI parsed flags | `skills/nova/pipeline/cli.js main` | Strings: `project`, `repo`, `module`, `blueprint`, `prompt`, `promptFile`, `novaChannel`, `runtimeModel`, `runtimeThinking`; booleans: `blueprintList`, `resume`, `status`, `dryRun`, `help` | Strict parser plus manual alias assignment | CLI router and `runPipeline` options. |
| Runtime overrides object | `skills/nova/pipeline/cli.js main` | `config._runtimeOverrides = { model: string\|null, thinking: string\|null }` when either override provided | `validateThinkingLevel` validates thinking only | `core/policy.js` outside scoped files. |
| Pipeline context creation input | `skills/nova/pipeline/cli.js main` | `{ config, progress, runId, stats, novaChannel }` | `createPipelineContext` outside scoped files | Logger/status-store/runner. |
| Blueprint list success output | `skills/nova/pipeline/cli.js main` | JSON line `{ status: 'success', modules: <listBlueprints result> }` | None in scoped file | stdout/operator. |
| Blueprint missing output | `skills/nova/pipeline/cli.js main` | JSON line `{ status: 'error', error: "Module '<id>' not in progress.json" }` | Progress module existence check | stdout/operator. |
| Generic CLI error output | `skills/nova/pipeline/cli.js main` | JSON line `{ exit: EXIT_ERROR, error: string }` | Outer catch or thinking catch | stdout/operator. |
| Full pipeline run options | `skills/nova/pipeline/cli.js main` | `{ module: string\|undefined, resume: boolean, novaPrompt: string\|null, novaChannel: string\|undefined }` | None in scoped file | `runPipeline`. |
| Public API module namespace | `skills/nova/pipeline/index.js` | Named exports listed in file plus default `pipeline-runner` export | Verification tests assert selected names/types | Runtime importers and entrypoint shim. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Nova prompt override for Forge prompt injection | `skills/nova/pipeline/cli.js main` reads `--prompt` or `--prompt-file` | None in scoped file | No prompt template in P00a; CLI help says prompt override is injected into Forge prompt | CLI accepts inline string or UTF-8 prompt file; inline takes precedence | Passed to `runPipeline` as `novaPrompt` string or `null`. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `skills/nova/pipeline.js` direct dispatch | Dynamic import or `main()` rejection | No | No retry/backoff | Delegates to CLI catch when error occurs inside CLI try; otherwise Node top-level await terminates | None in scoped file. |
| `skills/nova/pipeline/cli.js main` before try | Strict parser errors: unknown flag, positional, missing value, invalid boolean | No | No retry/backoff | Uncaught stack trace; process exits non-zero by Node | None; see `P00a-ISSUE-001`. |
| `skills/nova/pipeline/cli.js main` | Missing `--nova-channel` for real run | No | No retry/backoff | Prints two stderr lines and exits `EXIT_ERROR`; status/dry-run/blueprint commands exempt | None. |
| `skills/nova/pipeline/cli.js main` | Invalid `--thinking` | No | No retry/backoff | Logs `[ERROR]`, outputs `{ exit: EXIT_ERROR, error }`, cleans temp dir, exits `EXIT_ERROR` | None in scoped file. |
| `skills/nova/pipeline/cli.js main` | Unknown blueprint module id | No | No retry/backoff | Outputs `{ status: 'error', error }`, cleans temp dir, exits `EXIT_ERROR` | None. |
| `skills/nova/pipeline/cli.js main` | Missing prompt file | No | No retry/backoff | Throws, outer catch logs and outputs `{ exit: EXIT_ERROR, error }`, cleans temp dir, clears active context | None. |
| `skills/nova/pipeline/cli.js main` | Any error in config/context/log/run path inside outer try | No in scoped file | No retry/backoff in CLI layer | Outer catch logs and outputs `{ exit: EXIT_ERROR, error }`, cleans temp dir, clears active context | None in scoped file. |
| `skills/common/pipeline/cli-args.js parseCliArgs` via shim | Parser validation failures | No | No retry/backoff | Throws `Error`; caller decides terminal handling | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `skills/nova/pipeline.js` direct dispatch | Dynamic import or uncaught `main()` rejection | No structured telemetry in scoped file | Node stderr if uncaught | none | Node runtime/top-level await | CLI inner catch covers many but not all paths. |
| `skills/nova/pipeline/cli.js main` before try | Strict parser error | No structured telemetry | Node stderr stack trace | none | Node runtime | Operator-risk gap captured as `P00a-ISSUE-001`. |
| `skills/nova/pipeline/cli.js main` | Missing nova channel | Partial | stderr only | none | `console.error` | No JSON or telemetry event; message is explicit and terminal. |
| `skills/nova/pipeline/cli.js main` | Invalid thinking | Partial | stderr plus stdout JSON line | none | local `log` and `output` | No pipeline telemetry because config/context are not initialized. |
| `skills/nova/pipeline/cli.js main` | Unknown blueprint id | Partial | stdout JSON line | none | local `output` | No pipeline telemetry in scoped file. |
| `skills/nova/pipeline/cli.js main` | Missing prompt file | Partial | stderr plus stdout JSON line | none | outer catch local `log` and `output` | No pipeline telemetry in scoped file. |
| `skills/nova/pipeline/cli.js main` | Config/context/log/run errors inside try | Partial | stderr plus stdout JSON line | none | outer catch local `log` and `output` | Downstream services may emit before throwing; CLI itself does not. |
| `skills/common/pipeline/cli-args.js parseCliArgs` via shim | Parser validation failures | No | none unless caller catches/logs | none | Parser throws only | Nova CLI currently does not catch this path. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js runtime | `node` binary | Observed `v24.14.0` in review environment | All scoped `.js` files | ESM execution, top-level await, `process.exit`, built-in modules | No Nova package.json in scoped tree pins Node; runtime compatibility verified by startup smoke. |
| Node `fs` built-in | Runtime built-in | Node major 24 observed | `skills/nova/pipeline.js`; `skills/nova/pipeline/cli.js` | Realpath/existence checks and prompt-file read | Synchronous filesystem errors propagate unless handled by CLI outer catch. |
| Node `url` built-in | Runtime built-in | Node major 24 observed | `skills/nova/pipeline.js`; `skills/nova/pipeline/cli.js` | Convert `import.meta.url` to path for entry guards | Import-time built-in dependency. |
| Shared CLI parser | `skills/common/pipeline/cli-args.js` via local shim | Internal source; no package version | `skills/nova/pipeline/cli.js`; `skills/nova/pipeline/cli-args.js` | Strict CLI parsing | Throws on invalid argv; Nova CLI parser call is outside catch. |
| Internal Nova modules | `skills/nova/pipeline/**` | Internal source | `skills/nova/pipeline/index.js`; `skills/nova/pipeline/cli.js` | Config, runner, telemetry, shutdown, status/log/context/policy services | Import failures are terminal; later batches own implementation details. |

## Concurrency and backpressure updates

None found in scoped files.

## ACP protocol updates

None found in scoped files.

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| `pipeline.js` is a thin compatibility shim and does not re-grow runner/service logic | `tests/verification/contracts/check-pipeline-entrypoint-shim-surface.mjs` | Strong source-shape and import/export assertions | Does not execute failure paths. |
| Nova entrypoint/index/CLI parse and import, public API exports selected constants/functions, `--help` exits 0 | `tests/verification/runtime/check-nova-startup-smoke.mjs` | Good startup smoke coverage | Does not cover invalid flags, missing prompt file, missing nova channel, or blueprint routes. |
| Common strict CLI parser behavior and CLI migration to parser | `tests/verification/contracts/check-strict-cli-args-surface.mjs` | Good parser-unit coverage; source check for Nova CLI using parser | Does not execute Nova CLI invalid-argv behavior; see `P00a-ISSUE-001`. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- `P00a-ISSUE-001` — Nova CLI strict parser errors are thrown before the CLI try/catch, producing an uncaught stack trace instead of the CLI's JSON error envelope.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
