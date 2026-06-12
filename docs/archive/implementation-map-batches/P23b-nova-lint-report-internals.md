# Batch P23b — Nova lint-report internals

Status: completed
Date started: 2026-05-08
Date completed: 2026-05-08
Reviewer: Nova

## Scope

```text
skills/nova/pipeline/tools/lint-report/constants.js
skills/nova/pipeline/tools/lint-report/container-yaml-tools.js
skills/nova/pipeline/tools/lint-report/discovery.js
skills/nova/pipeline/tools/lint-report/execution.js
skills/nova/pipeline/tools/lint-report/output.js
skills/nova/pipeline/tools/lint-report/parsers.js
skills/nova/pipeline/tools/lint-report/report.js
skills/nova/pipeline/tools/lint-report/tool-registry.js
```

Scope expansion verified live: 8 files, under the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/nova/pipeline/tools/lint-report/constants.js
kubeclaw-main/skills/nova/pipeline/tools/lint-report/container-yaml-tools.js
kubeclaw-main/skills/nova/pipeline/tools/lint-report/discovery.js
kubeclaw-main/skills/nova/pipeline/tools/lint-report/execution.js
kubeclaw-main/skills/nova/pipeline/tools/lint-report/output.js
kubeclaw-main/skills/nova/pipeline/tools/lint-report/parsers.js
kubeclaw-main/skills/nova/pipeline/tools/lint-report/report.js
kubeclaw-main/skills/nova/pipeline/tools/lint-report/tool-registry.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/skills/nova/pipeline/tools/lint-report.js
kubeclaw-main/skills/nova/pipeline/services/lint.js
kubeclaw-main/tests/verification/contracts/check-strict-cli-args-surface.mjs
kubeclaw-main/tests/verification/contracts/check-validator-control-result-surface.mjs
kubeclaw-main/tests/verification/behavior/areas/repo-docs.mjs
```

## Per-file map

### `skills/nova/pipeline/tools/lint-report/constants.js`

Role: Lint-report static constants.

Imports/dependencies: None.

Exports/public surface: `DEFAULT_TIER`, `DEFAULT_TOOL_TIMEOUT`, `TIERS`, `VERSION`.

Defines: Version `1.0.0`, default per-tool timeout 30000 ms, default tier `full`, tier descriptions.

Important variables/state: Frozen-by-convention constants only.

Calls out to: None.

Called by / expected callers: Entry point, execution helper, output help, tool registry defaults.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: None.

Authority behavior: Owns lint-report tier/default timeout labels.

Error/retry/terminal behavior: None.

Verification coverage: Strict CLI/import checks indirectly.

Findings: None.

### `skills/nova/pipeline/tools/lint-report/container-yaml-tools.js`

Role: Registers Docker/Helm/Kubernetes/YAML lint tools into the lint-report registry.

Imports/dependencies: Node `fs`/`path`, `safeExec`, `findFiles`, `tryParseJson`, report warning/parse helpers.

Exports/public surface: `registerContainerYamlTools`.

Defines: Tool registrations for `hadolint`, `helm-lint`, `kubeconform`, and `yamllint`.

Important variables/state: Mutates caller-supplied registry through `registerTool` callback only.

Calls out to: External binaries `hadolint`, `helm`, `kubeconform`, `yamllint`; filesystem chart/docker/yaml discovery.

Called by / expected callers: `tool-registry.js` at module load.

Environment variables / CLI inputs / config fields: Uses lint context `repoRoot`, `modulePath`, `projectTypes`, `changedFiles`.

Paths built/read/written: Scans Dockerfiles, `Chart.yaml`, YAML/YML files. No writes.

Authority behavior: Owns container/yaml tool detection/run/parse behavior.

Error/retry/terminal behavior: External command failures captured by `safeExec`; parse failures become warnings; empty scoped files return zero findings.

Verification coverage: Lint wrapper/validator behavior; detailed tool parsing not heavily covered.

Findings: None.

### `skills/nova/pipeline/tools/lint-report/discovery.js`

Role: Project type/config/file discovery and lint scope resolution.

Imports/dependencies: Node `fs`/`path`, platform config candidate discovery, output logger.

Exports/public surface: `detectProjectTypes`, `discoverPlatformEslintConfigCandidates`, `discoverPlatformSemgrepConfigCandidates`, `discoverPlatformSwarmConfigCandidates`, `findFiles`, `findNearestTsconfigDir`, `listPolicySourceFiles`, `resolveScope`.

Defines: Platform semgrep/eslint config search order, TypeScript config ancestor search, source-policy ignore rules, marker-file project type detection, bounded recursive file search, changed-file/module/full scope resolution.

Important variables/state: Pure functions, no module state.

Calls out to: `discoverPlatformSwarmConfigCandidates`, filesystem existence/read-dir checks, `log`.

Called by / expected callers: Lint-report entrypoint and tool registry.

Environment variables / CLI inputs / config fields: Platform config candidate discovery may read platform env/config outside P23b; lint context includes `repoRoot`, `modulePath`, `changedFiles`.

Paths built/read/written: Looks for `tsconfig.json`, `package.json`, `pyproject.toml`, `requirements.txt`, `setup.py`, `Chart.yaml`, Dockerfiles, shell/YAML/source files, platform `.semgrep.yml` and `eslint.config.mjs` candidates.

Authority behavior: Owns static-analysis scope/project type detection.

Error/retry/terminal behavior: `findFiles` returns empty on missing/unreadable dirs. Scope resolution drops nonexistent changed files.

Verification coverage: Repo-docs and lint wrapper tests indirectly.

Findings: None.

### `skills/nova/pipeline/tools/lint-report/execution.js`

Role: Safe synchronous external command executor and binary availability checker.

Imports/dependencies: Node `child_process.execFileSync`, default timeout.

Exports/public surface: `commandExists`, `safeExec`.

Defines: No-throw command result shape `{ok, stdout, stderr, exitCode, timedOut?, error?}` and `which` binary check.

Important variables/state: None.

Calls out to: External binaries via `execFileSync`, `which`.

Called by / expected callers: Report runner and tool registry/tool registrations.

Environment variables / CLI inputs / config fields: Merges `process.env` with `opts.env`.

Paths built/read/written: Optional `cwd` only.

Authority behavior: Owns external process execution normalization.

Error/retry/terminal behavior: Command failures do not throw; stdout/stderr captured; timeout reported as result error. Binary check returns false on `which` failure.

Verification coverage: Lint behavior indirect.

Findings: None.

### `skills/nova/pipeline/tools/lint-report/output.js`

Role: JSONL-style stderr logger, optional dual-write log file, help text, report writer.

Imports/dependencies: Node `fs`/`path`, version constant.

Exports/public surface: `log`, `printHelp`, `setLintLogPath`, `writeReport`.

Defines: Module-local lint trace path, JSON log entry shape, CLI help, JSON report output writer.

Important variables/state: Mutable module-local `lintLogPath`, set once or multiple times by CLI `--log-path`.

Calls out to: `console.error`, `process.stdout.write`, filesystem mkdir/append/write.

Called by / expected callers: Entry point, discovery/report/tool registry.

Environment variables / CLI inputs / config fields: CLI `--log-path`, `--output` via entrypoint.

Paths built/read/written: Creates log-path parent; appends JSONL trace; writes report output path or stdout.

Authority behavior: Owns lint-report observability/log/report emission.

Error/retry/terminal behavior: Trace append failures are swallowed. Report write failures throw to CLI catch.

Verification coverage: Lint wrapper/CLI indirect.

Findings: None.

### `skills/nova/pipeline/tools/lint-report/parsers.js`

Role: Safe JSON parser and lightweight public export name extractor for repo policy.

Imports/dependencies: None.

Exports/public surface: `extractPublicExportNames`, `tryParseJson`.

Defines: Comment stripping, line-number calculation, regex extraction for ESM/TS/CommonJS export names and export blocks.

Important variables/state: Per-call arrays/sets only.

Calls out to: JSON.parse and regex scanning.

Called by / expected callers: Tool registry, container/yaml tools, report helpers.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: None.

Authority behavior: Owns parse diagnostics and repo-policy export extraction heuristic.

Error/retry/terminal behavior: JSON parse returns `{ok:false,error}`; export extractor does not throw for ordinary strings.

Verification coverage: Repo-policy indirect.

Findings: None.

### `skills/nova/pipeline/tools/lint-report/report.js`

Role: Tool execution orchestration, standard warning/parse result builders, report summary builder.

Imports/dependencies: Node `path`, binary executor, logger.

Exports/public surface: `makeConfigMissingResult`, `makeParseFailureResult`, `makeWarningResult`, `runAllTools`.

Defines: Finding shape, missing-config warning, parse-failure warning, tool applicability by tier/detect, sequential tool run loop, report schema.

Important variables/state: Local report objects only.

Calls out to: `commandExists`, each tool `detect` and `run`, `log`.

Called by / expected callers: Lint-report entrypoint and tool registry helpers.

Environment variables / CLI inputs / config fields: Uses lint context `project`, `repoRoot`, `modulePath`, `tier`, `changedFiles`, `projectTypes`.

Paths built/read/written: No direct writes; path joins for warning target files and report fields.

Authority behavior: Owns aggregate lint report schema and per-tool failure classification.

Error/retry/terminal behavior: Missing binary returns `status:'skipped'`; tool.run throws become `status:'error'`; no retry; loop continues. Summary counts `tools_failed` separately from `total_errors`.

Verification coverage: Validator control-result surface and lint wrapper behavior.

Findings: `P23b-ISSUE-001`.

### `skills/nova/pipeline/tools/lint-report/tool-registry.js`

Role: Registers JS/TS/Python/security/policy/static-analysis tools and imports container/yaml registrations.

Imports/dependencies: Node `fs`/`path`, constants, `safeExec`, discovery helpers, parser helpers, report helpers, logger, container/yaml tool registrar.

Exports/public surface: `TOOL_REGISTRY`.

Defines: `registerTool`; tools `tsc`, `repo-policy`, `ruff`, `shellcheck`, `eslint`, `knip`, `madge`, `npm-audit`, `mypy`, `pip-audit`, `semgrep`, plus container/yaml tools.

Important variables/state: Module-local mutable `TOOL_REGISTRY` populated at import time.

Calls out to: External binaries `node`, `tsc`, `ruff`, `shellcheck`, `eslint`, `knip`, `madge`, `npm`, `mypy`, `pip-audit`, `semgrep`, and container/yaml tools; filesystem reads for repo policy/config.

Called by / expected callers: Lint-report entrypoint.

Environment variables / CLI inputs / config fields: Uses context fields `repoRoot`, `modulePath`, `projectTypes`, `changedFiles`, `semgrepConfig`, `eslintConfig`.

Paths built/read/written: Reads TS/JS files for repo policy; discovers platform ESLint/Semgrep config; passes repo/module/changed file paths to tools. No writes.

Authority behavior: Owns built-in lint tool definitions and parse mappings.

Error/retry/terminal behavior: Missing config returns warnings instead of falling back to implicit local/registry modes. Tool output parse failures become warnings. `safeExec` nonzero finding output is parsed as tool findings.

Verification coverage: Lint wrapper and docs-surface semgrep config behavior.

Findings: `P23b-ISSUE-001` via report/entrypoint interaction.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `lint-report.js` | `report.js` | `runAllTools` | Entrypoint execution. |
| `report.js` | `execution.js` | `commandExists` | Binary availability gate. |
| Tool definitions | `execution.js` | `safeExec` | No-throw external command execution. |
| Tool definitions | `discovery.js` | project type/scope/config helpers | Tool detection and target selection. |
| Tool definitions | `parsers.js` | `tryParseJson`, `extractPublicExportNames` | Tool output parsing and repo policy. |
| `tool-registry.js` | `container-yaml-tools.js` | `registerContainerYamlTools` | Adds Docker/Helm/K8s/YAML tools. |
| All internals | `output.js` | `log`, `writeReport`, `setLintLogPath` | Observability/output. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `detectProjectTypes` | Marker files and discovered Docker/shell/YAML files | Repo/module filesystem | Set project types and markers | Determines applicable tools. |
| `resolveScope` | Changed files, module path, full repo | Lint context | Existing changed files or empty scoped/full marker | Narrows tool targets. |
| `runAllTools` | Tier order and tool `detect(ctx)` | `ctx.tier`, `ctx.projectTypes` | Applicable tool list | Tool execution plan. |
| `runTool` | Missing binary, tool success, tool throw | Binary PATH, tool.run | skipped/ok/error tool result | Per-tool terminal classification. |
| Tool definitions | Config missing vs found | tsconfig/eslint/semgrep configs | Warning result or command run | Avoids implicit config fallback. |
| Tool definitions | Changed-file filters empty | Changed files by extension | Return zero findings | Avoids irrelevant tool runs. |
| Entry `main` | `summary.total_errors > 0` | Report summary | process exit 1 else 0 | P23b issue: ignores `tools_failed`. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `registerTool` | `TOOL_REGISTRY` | Tool definitions | Default timeout then tool overrides; append order preserved | Registry execution order. |
| `setLintLogPath` | module-local `lintLogPath` | CLI log path | mkdir parent then replace path | Subsequent logs dual-write. |
| `runAllTools` | `toolResults` and summary totals | Applicable tool results | Sequentially assign by tool id; summary totals count ok/skipped/failed separately | Complete lint report. |
| Tool parsers | Findings arrays | Tool stdout/stderr/parsed JSON | Map external schema into `{file,line,column,severity,code,message}` | Standard finding shape. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `findFiles` | Recursive directory traversal | None | Max depth argument; skips dot dirs and `node_modules` | Returns matches or empty on missing/unreadable. |
| `runAllTools` | Sequential applicable tools | None | Tool-specific `safeExec` timeouts | Runs all tools even after errors. |
| `safeExec` | One process per call | None | Default 30000 ms, tool override 60000/120000/etc | Returns captured result, never throws. |
| Tool parsers | Iterate lines/results/findings | None | No local cap except command maxBuffer 10 MiB | Finish parsed output. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `ctx.repoRoot`, `ctx.modulePath`, `ctx.project`, `ctx.tier` | Lint context | All internals/tools | Built by P23a entrypoint | Scope/project/tier authority. |
| `ctx.changedFiles` | Lint context | `resolveScope`, tool definitions | CLI `--changed-files`; nonexistent files dropped | Changed-file scoping. |
| `ctx.semgrepConfig`, `ctx.eslintConfig` | Lint context | Semgrep/ESLint tools | CLI flags then platform candidates | Explicit config resolution. |
| Platform swarm config candidates | Config discovery | Semgrep/ESLint discovery helpers | `discoverPlatformSwarmConfigCandidates` plus `/home/node/.openclaw` | Platform config fallback. |
| `PATH` / `process.env` | Environment | `commandExists`, `safeExec` | Current process env plus `opts.env` | External binary availability/execution. |
| `--log-path` / `--output` | CLI inputs | `output.js` via entrypoint | optional | JSONL trace and report output paths. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| Platform `.semgrep.yml` candidates | `discoverPlatformSemgrepConfigCandidates` | Semgrep tool | None | CLI flag first, then platform candidates. |
| Platform `eslint.config.mjs` candidates | `discoverPlatformEslintConfigCandidates` | ESLint tool | None | No repo-local implicit fallback. |
| `tsconfig.json` nearest ancestor | `findNearestTsconfigDir` | tsc/repo-policy/madge | None | Search stops at repo root. |
| Source files for repo policy | `listPolicySourceFiles` | Repo-policy tool | None | Ignores tests/plugins/registries/loaders/migrations/minified files. |
| Dockerfile/Chart/YAML/shell files | `findFiles` and container/yaml tools | Tool definitions | None | Bounded depth. |
| Lint report JSON output | `writeReport` | Operators/lint wrapper | `writeReport` | Report schema authority. |
| Lint trace JSONL path | `setLintLogPath` | Operators/tests | `log` append | Best-effort dual-write trace. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Lint project type/scope | `discovery.js` | Tool registry/report | None. |
| External command result shape | `safeExec` | Tool definitions | None. |
| Lint tool registry | `tool-registry.js`, `container-yaml-tools.js` | `runAllTools` | None. |
| Lint report schema | `runAllTools` / `writeReport` | `lint.js` wrapper, CLI operators | P23b issue: CLI exit ignores tool failures. |
| Lint trace logs | `output.js` | Operators/tests | Append failures swallowed. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Safe exec result | `safeExec` | `{ok, stdout, stderr, exitCode, timedOut?, error?}` | Try/catch around exec | Tool definitions. |
| Tool definition | Registry files | `{id,name,binary,tier,detect(ctx),run(ctx),timeout?}` | `registerTool` default merge only | `runAllTools`. |
| Finding | Tool definitions/report helpers | `{file, line:null\|number, column:null\|number, severity:'error'\|'warning', code, message}` | Tool parsers/helpers | Lint report/validator adapter. |
| Tool result | `runTool` | skipped `{status,reason,duration_ms}`; ok `{status,errors,warnings,findings,duration_ms}`; error `{status,error,duration_ms}` | `runTool` | Report summary. |
| Lint report | `runAllTools` | `{project, scope, timestamp, tier, changed_files, detected_types, tools, summary:{total_errors,total_warnings,tools_ok,tools_skipped,tools_failed}}` | Builder only | CLI/wrapper/operators. |
| Log entry | `log` | `{ts,level,component:'lint-report',msg,data?}` | Builder only | stderr and optional JSONL trace. |

## Prompt and agent behavior updates

None found in scoped files.

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `findFiles` | Missing/unreadable directory | No | None | Returns empty list | None. |
| `resolveScope` | Changed file no longer exists | No | None | Drops file and logs requested/existing count | None. |
| `safeExec` | Command nonzero/timeout | No | Default 30000 ms or tool override; 10 MiB maxBuffer | Returns captured result | None. |
| `commandExists` | Binary missing | No | 5000 ms `which` timeout | Tool marked skipped | None. |
| `runTool` | Tool run throws | No | None | Returns `status:'error'` and loop continues | None. |
| `makeParseFailureResult` | Tool output parse failure | No | None | Warning finding, not tool error | Output preview capped at 200 chars. |
| Tool config missing | Missing tsconfig/eslint/semgrep config | No | None | Warning finding, not implicit fallback | None. |
| `log` | Trace append failure | No | None | Swallowed noncritical | None. |
| `writeReport` | Report output write failure | No | None | Throws to entrypoint catch | None. |
| CLI exit mapping | Tools failed but no findings | No | None | Can exit 0 because only `total_errors` controls exit | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `findFiles` | Missing/unreadable directory | None locally | None | none | N/A | Empty discovery can hide unavailable dirs. |
| `resolveScope` | Dropped changed files | Yes | stderr/log path | INFO scope log | `log` | Counts only, no file list. |
| `safeExec` | Command nonzero/timeout | Yes through tool result/report; no immediate log | JSON report | Tool result/finding | Tool parser/report | Timeout only visible if parser surfaces it. |
| `commandExists` | Binary missing | Yes | JSON report and logs | `status:'skipped'` plus INFO log | `runTool`, `runAllTools` | Expected on optional tools. |
| `runTool` | Tool throws | Yes | stderr/log path and JSON report | WARN log and `status:'error'` | `log`, `runTool` | P23b issue for CLI exit mapping. |
| `makeParseFailureResult` | Parse failure | Yes | stderr/log path and report finding | WARN log + `<tool>-parse-failed` warning | `log`, report helper | Preview capped. |
| Tool config missing | Missing configs | Yes | stderr/log path and report finding | `<config>-missing` warning | Tool definitions/report helper | Intentionally avoids unsafe fallback. |
| `log` | Trace append failure | None | None | none | N/A | Stderr still emitted before append attempt. |
| `writeReport` | Output write failure | Yes via entrypoint catch/log | stderr | ERROR from entrypoint catch | `main().catch` | No report artifact. |
| CLI exit mapping | Tools failed but no findings | Yes but weak | JSON report `tools_failed`; process exit can be 0 | `tools_failed` | `runAllTools` | P23b-ISSUE-001. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js runtime | `node` binary | Observed `v24.14.0` during review | All P23b modules and repo-policy binary check | ESM/fs/path/exec | No package pin in scoped files. |
| `which` | System binary | System | `commandExists` | PATH availability check | Missing binary skips tool. |
| TypeScript `tsc` | External binary | PATH | tsc/repo-policy | Type checking and tsconfig policy | Missing config warning; missing binary skipped. |
| JS tools `eslint`, `knip`, `madge`, `npm` | External binaries | PATH | JS/TS full lint tools | Lint/security/dependency checks | Config missing warnings for ESLint/Semgrep. |
| Python tools `ruff`, `mypy`, `pip-audit` | External binaries | PATH | Python lint/security/type checks | Static analysis | Missing binaries skipped. |
| Container/YAML tools `hadolint`, `helm`, `kubeconform`, `yamllint` | External binaries | PATH | Container/yaml tools | Docker/Helm/K8s/YAML checks | Missing binaries skipped; parse issues warnings. |
| Semgrep | External binary/config | PATH plus config | Semgrep tool | Pattern scanning | Missing config warning; no registry auto fallback. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Tool execution loop | Sequential, no parallelism | Applicable tools only | Slow tools block overall report | STEP/OK/WARN logs and durations | None. |
| External process output | `execFileSync` maxBuffer | 10 MiB per command | Exceeding buffer becomes captured command failure/result | Tool result/report | Parser may turn no/partial output into warning. |
| Tool timeouts | Per-command sync timeout | 30000 ms default; 60000/120000 for heavy tools | Timeout captured by `safeExec`; no retry | Report/log if surfaced | None. |
| Recursive discovery | Bounded depth | Depth 2-12 depending helper | Large/deep trees beyond depth not scanned | None or logs | None. |
| Logging | Synchronous stderr and optional append | No cap | Trace append failure swallowed; stderr always attempted | JSON log lines | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Lint report artifact | JSON report schema with tools and summary | `runAllTools` / `writeReport` | `lint.js` wrapper, module validators, operators | One synchronous report generation; no ACP streaming | Lint JSON output file/stdout. |
| Lint trace stream | JSONL entries `{ts,level,component,msg,data?}` | `log` | Operators/tests | Sync append, best-effort, no flush callback | Optional `--log-path` trace. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Lint-report CLI flags strict parser | `check-strict-cli-args-surface.mjs` | Good | None. |
| Validator/lint adapter report interpretation | `check-validator-control-result-surface.mjs` and P21 tests | Good for wrapper | Direct CLI exit on tools_failed not covered. |
| Semgrep config docs behavior | repo-docs behavior | Good | None. |
| Individual tool parsers | Indirect only | Weak | No focused tests for every parser/tool. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- `P23b-ISSUE-001` — lint-report CLI exits 0 when tools fail but emit no findings.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
