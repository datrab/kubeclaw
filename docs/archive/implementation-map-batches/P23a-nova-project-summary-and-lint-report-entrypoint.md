# Batch P23a — Nova project-summary and lint-report entrypoint

Status: completed
Date started: 2026-05-08
Date completed: 2026-05-08
Reviewer: Nova

## Scope

```text
skills/nova/pipeline/tools/project-summary.js
skills/nova/pipeline/tools/project-summary-formatters.js
skills/nova/pipeline/tools/lint-report.js
```

Scope expansion verified live: 3 files, under the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/nova/pipeline/tools/project-summary.js
kubeclaw-main/skills/nova/pipeline/tools/project-summary-formatters.js
kubeclaw-main/skills/nova/pipeline/tools/lint-report.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/behavior/areas/summaries.mjs
kubeclaw-main/tests/verification/behavior/areas/repo-docs.mjs
kubeclaw-main/tests/verification/behavior/areas/shell-boundary.mjs
kubeclaw-main/tests/verification/contracts/check-strict-cli-args-surface.mjs
kubeclaw-main/tests/verification/contracts/check-critical-dynamic-imports.mjs
```

## Per-file map

### `skills/nova/pipeline/tools/project-summary.js`

Role: Standalone and adapter-importable project summary generator that collects source, pipeline, test, review, agent, case-study, markdown, JSON, and Discord summary data.

Imports/dependencies: Node `fs`/`path`/`child_process.execFileSync`/`url`, CLI parser, git-context, platform config loader, Discord integration, lifecycle status normalizer, path validator, project-summary formatter helpers.

Exports/public surface: `generateSummary`, `postToDiscord`.

Defines: Repo/config/project path resolution, git wrapper, JSON reader, code/test/API/pipeline/test-suite/review/prompt census collectors, Discord context/artifact field helpers, CLI mode.

Important variables/state: No module-global mutable state. Collector functions build aggregate objects from repository, `.swarm`, and git state. CLI reads process env/argv.

Calls out to: `git -C`, `loadPlatformSwarmConfig`, `normalizeLifecycleStatus`, `validateAllowedPath`, `discordEmbeds`, formatter helpers, filesystem reads/writes.

Called by / expected callers: Project-summary generator adapter, summary service post-run generator, standalone CLI, tests.

Environment variables / CLI inputs / config fields: Reads `REPO_ROOT`, `CURRENT_PROJECT`, `RUN_ID`, `PIPELINE_RUN_ID`, `DISCORD_WEBHOOK`, CLI `--project`, `--output`, `--repo`, `--discord`, `--json`, config path option via programmatic API, platform `projects_root`.

Paths built/read/written: Validates repo/config paths; reads `<projectRoot>/.swarm/progress.json`, module `status.json`, `runner-verdict.json`, `test-spec.json`, echo review JSONs and prompt dirs; writes CLI output path when set; Discord context reads `.swarm/logs/pipeline/latest.json` and emits through pipeline Discord integration.

Authority behavior: Generates operator/reporting summaries only; does not mutate lifecycle state. Uses normalized status projection before counting terminal module fields.

Error/retry/terminal behavior: Missing repo/project/progress/config/parse errors throw to caller or CLI exit 1. Git failures return empty strings. Data collector unreadable files are skipped. Discord skips when webhook missing and returns false on send failure.

Verification coverage: Summaries, repo-docs, shell-boundary, strict CLI args, dynamic import checks.

Findings: `P23a-ISSUE-001`, `P23a-ISSUE-002`.

### `skills/nova/pipeline/tools/project-summary-formatters.js`

Role: Project-summary markdown, Discord embed, and case-study base formatting helpers.

Imports/dependencies: None external.

Exports/public surface: `formatDuration`, `formatNum`, `pct`, `groupDeliveredScope`, `buildCaseStudyBase`, `buildMarkdown`, `buildDiscordEmbeds`.

Defines: Language/module scope grouping, case-study base JSON shape, markdown report sections, two Discord embed payloads.

Important variables/state: Pure functions; no module state.

Calls out to: Date/time formatting and local helpers only.

Called by / expected callers: `project-summary.js`, summaries behavior tests, project-summary generator service.

Environment variables / CLI inputs / config fields: None directly.

Paths built/read/written: None.

Authority behavior: Owns presentation/report schema for project summaries and case-study base artifact.

Error/retry/terminal behavior: No local catches; malformed/missing nested inputs are mostly defaulted with `||`, but some metric keys are stale/mismatched.

Verification coverage: Summaries behavior covers final telemetry and some case-study base fields; no direct regression for unit census/hardest-module field names.

Findings: `P23a-ISSUE-002`.

### `skills/nova/pipeline/tools/lint-report.js`

Role: Deterministic static-analysis aggregator CLI entrypoint and import surface for lint-report internals.

Imports/dependencies: Node `fs`/`path`/`url`, lint-report constants/discovery/output/report/tool registry, CLI flag parser.

Exports/public surface: Named exports `runAllTools`, `detectProjectTypes`, `TOOL_REGISTRY`, `TIERS`; default `main`.

Defines: CLI flag parsing, context builder, tool execution wrapper, direct-execution guard.

Important variables/state: No module-global mutable state except output logger path set by `setLintLogPath`.

Calls out to: `detectProjectTypes`, `resolveScope`, `runToolsForRegistry`, `writeReport`, `setLintLogPath`, filesystem repo existence check.

Called by / expected callers: `lint.js` wrapper and direct operators/verification.

Environment variables / CLI inputs / config fields: CLI `--repo`, `--tier`, `--module-path`, `--project`, `--output`, `--changed-files`, `--semgrep-config`, `--eslint-config`, `--log-path`, `--help`.

Paths built/read/written: Resolves `--repo`, optional module path/scope, writes report to `--output` or stdout via `writeReport`, optional log path.

Authority behavior: Entrypoint delegates tool registry/discovery/execution/report authority to P23b internals.

Error/retry/terminal behavior: Missing/unknown repo/tier exits 1. Help exits 0. Tool errors are aggregated by report internals; process exits 1 when `report.summary.total_errors > 0`.

Verification coverage: Strict CLI args and lint service/validator-adapter coverage.

Findings: None new beyond P21 temp output cleanup in wrapper.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `project-summary.js` | `project-summary-formatters.js` | `buildMarkdown`, `buildDiscordEmbeds`, `buildCaseStudyBase`, `pct` | Report formatting and case-study base schema. |
| `project-summary.js` | Git CLI | `git(repoDir,args)` | Code stats and commit/author dates. |
| `project-summary.js` | `platform-config.js` | `loadPlatformSwarmConfig` | Project root resolution. |
| `project-summary.js` | `discord.js` | `discordEmbeds` | Canonical Discord audit/mirroring path. |
| `project-summary.js` | `lifecycle-state.js` | `normalizeLifecycleStatus` | Clears stale terminal fields before pipeline stat aggregation. |
| `lint-report.js` | P23b internals | constants/discovery/output/report/tool registry | Entrypoint delegates tool execution/report authority. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `resolveRepoDir` | Explicit repo/env/current git root and `.git` existence | `opts.repoDir`, `REPO_ROOT`, `getRepoRoot()` | Return repo dir or throw | P23a issue: blocks filesystem fallback/test fixture path. |
| `resolveProjectPaths` | `projects_root` configured | Platform config | `<repo>/<projects_root>/<project>/src` else `Projects/<project>/src` | Project source and `.swarm` root authority. |
| `collectCodeStats` | `git ls-files` returns empty | Git output | Walk filesystem fallback | Supports untracked/project fixture scan, but unreachable if repo has no `.git`. |
| `collectPipelineStats` | Normalized status PASS/BLOCKED/other | Module `status.json` | Completed/blocked/pending counts and attempts | Summary lifecycle projection. |
| `collectReviewStats` | Summary review file vs detailed review file | Echo review file names | Push summary or detail records | Review gate outcome aggregation. |
| `postToDiscord` | Webhook missing, send success/failure | Env/options | Skip false, true, or false with log | Standalone Discord behavior. |
| `lint-report buildContext` | Missing repo, bad repo, unknown tier | CLI flags | Throw and exit 1 | CLI input validation. |
| `lint-report main` | Changed files present and report errors | CLI flags/report summary | Resolve scope; exit 1 if total_errors > 0 | Lint CLI terminal contract. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `generateSummary` | Returned summary object | Collectors and formatters | Collect code→unit→API→pipeline→tests→reviews→agents, then format markdown/embeds/caseStudyBase | Report has `summaryType`, markdown, embeds, caseStudyBase, raw data. |
| `collectPipelineStats` | Aggregate counters | Module status files | Sum costs/tokens/durations; count PASS/BLOCKED/other; normalize stale terminal fields first | Consistent pipeline stats. |
| `buildProjectSummaryDiscordFields` | Embed fields | Identity and existing fields | Adds Run ID before embed fields and artifact fields | Discord embeds preserve run correlation. |
| `buildCaseStudyBase` | Case-study base JSON | Project, collector outputs | Builds nested project/delivery/modules/gates/code/tests/agents/scope/highlights/outcome/timeline object | P23a issue: some field names mismatch collector output. |
| `lint-report main` | `ctx.changedFiles` | CLI flags/discovery | If changed files supplied, replaces with `resolveScope(ctx)`; otherwise calls `resolveScope(ctx)` for side effects | Tool context passed to registry. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `collectCodeStats` | Iterates git-tracked/fallback files | None | Git calls timeout 30000 ms; skips >2 MiB and binary extensions | Finishes file list; skips unreadable. |
| `collectUnitTestCensus` / API/review/agent collectors | Recursive filesystem walk | None | None | Skip known dirs/unreadable files; finish traversal. |
| `collectPipelineStats` / `collectTestResults` | Iterate progress modules/gates and suite entries | None | None | Finish configured entries. |
| `lint-report main` | One async tool registry run | Delegated to P23b | Delegated per-tool timeouts in P23b | Report written, process exit 0/1. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `REPO_ROOT` | Env var | `resolveRepoDir` | fallback after `opts.repoDir` | Project summary repo root. |
| `CURRENT_PROJECT` | Env var | `generateSummary`, CLI, Discord context | fallback after options/flags | Project id. |
| `RUN_ID`, `PIPELINE_RUN_ID` | Env vars | `resolveDiscordContext` | fallback before latest pointer | Discord run correlation. |
| `DISCORD_WEBHOOK` | Env var | `postToDiscord` | optional | Standalone Discord send target. |
| Project summary CLI flags | CLI inputs | `project-summary.js` | `--project`, `--output`, `--repo`, `--discord`, `--json` | Standalone summary generation/output. |
| Platform `projects_root` | Config field | `resolveProjectPaths` | `Projects` | Project source path prefix. |
| Lint-report CLI flags | CLI inputs | `lint-report.js` | repo required; tier default from P23b constants | Lint entrypoint context. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| `<projectRoot>/.swarm/progress.json` | `resolveProjectPaths` | `generateSummary` | None in scoped files | Required project summary source. |
| Module `status.json` | `collectPipelineStats` | Project summary | None in scoped files | Normalized lifecycle projection. |
| Module `test-results/runner-verdict.json` | `collectTestResults` | Project summary | None in scoped files | Buster suite summary source. |
| `test-spec.json` under `.swarm` | `collectApiTestCensus` | Project summary | None in scoped files | API test case census. |
| `.swarm/echo-review/*.json` | `collectReviewStats` | Project summary | None in scoped files | Review outcome census. |
| `.swarm/**/prompts/*.md` | `collectAgentInvocations` | Project summary | Prompt writers outside P23a | Agent invocation census. |
| `.swarm/logs/pipeline/latest.json` | `resolveDiscordContext` | Project-summary Discord path | Summary/status services outside P23a | Run id fallback and artifact context. |
| Lint-report `--output` | `lint-report.js` flags | Operators/lint wrapper | `writeReport` | JSON report output delegated to P23b. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Project summary raw data object | `generateSummary` collectors | Summary service, CLI JSON output | P23a case-study base metric mismatch. |
| Project summary markdown/embeds | `project-summary-formatters.js` | CLI/Discord/summary service | None. |
| Case-study base JSON | `buildCaseStudyBase` | Case-study generator prompt/input | P23a field mismatch issue. |
| Lint-report entry context | `lint-report.js` | P23b report internals | Detailed tool authority in P23b. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| `generateSummary` result | `project-summary.js` | `{summaryType:'project_summary', project, markdown, embeds, caseStudyBase, data:{code,unitCensus,apiCensus,pipeline,tests,reviews,agents}}` | Throws on missing project/progress; no schema validator | Summary service/CLI. |
| Code stats | `collectCodeStats` | Totals, `byLang`, git commit metadata, authors, first/last commit | Git/fs skip rules | Markdown/case-study/embeds. |
| Pipeline stats | `collectPipelineStats` | Counts, attempts, durations, tokens, hardest modules, fail patterns, gateStats, moduleStats | `normalizeLifecycleStatus` | Reports/case-study. |
| Case-study base | `buildCaseStudyBase` | `project`, `delivery`, `modules`, `gates`, `code`, `tests`, `agents`, `scope`, `highlights`, `quality_outcome`, `timeline` | Formatter defaults only | Case-study generator. |
| Discord embeds | `buildDiscordEmbeds` / `postToDiscord` | Two embed objects with title/color/fields/footer plus run/artifact fields | Discord integration downstream | Operators/audit mirror. |
| Lint-report context | `buildContext` | `{repoRoot,modulePath,project,tier,changedFiles,projectTypes,semgrepConfig,eslintConfig}` | Repo/tier validation | P23b tool runner. |

## Prompt and agent behavior updates

None found in scoped files.

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `resolveRepoDir` | Cannot find repo or missing `.git` | No | None | Throws; CLI exits 1 | None. |
| `git` helper | Git command failure | No | 30000 ms command timeout | Returns empty string | None. |
| Collector file reads | Missing/unreadable optional files | No | None | Skip file/entry | None. |
| `generateSummary` | Missing project/repo/progress or invalid progress JSON | No | None | Throws; CLI exits 1 | None. |
| `postToDiscord` | Missing webhook | N/A | None | Logs skip and returns false | None. |
| `postToDiscord` | Discord send failure | No | One canonical integration send | Logs failure and returns false | Discord integration owns sanitization/mirroring. |
| `lint-report buildContext` | Missing repo, nonexistent repo, unknown tier | No | None | Throws; `main` prints and exits 1 | None. |
| `lint-report main` | Tool findings/errors | Delegated | P23b per-tool behavior | Writes report then exits 1 when `total_errors > 0` | Delegated. |
| `lint-report main` | Uncaught async error | No | None | Logs ERROR and exits 1 | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `resolveRepoDir` / `generateSummary` | Missing repo/project/progress/JSON | CLI stderr or caller exception only | stderr/exception | `Error: ...` | CLI catch/throw | Summary service caller emits telemetry outside P23a. |
| `git` helper | Git failure | None locally | None | none | N/A | Empty stats can degrade report silently. |
| Collectors | Optional unreadable files | None locally | None | none | N/A | Skips are intentional but not audited. |
| `postToDiscord` | Missing webhook | Yes, stdout log | CLI/stdout | `[SUMMARY] DISCORD_WEBHOOK not set — skipping` | `log` | No Discord/audit artifact. |
| `postToDiscord` | Discord send failure | Yes, stdout log; canonical integration may mirror partial failures | CLI/stdout and downstream Discord audit if reached | `[SUMMARY] Discord post failed` | `log`, `discordEmbeds` | Returns false. |
| `lint-report buildContext` | Bad CLI inputs | Yes, stderr | stderr | error message | `main` catch | No JSON report. |
| `lint-report main` | Tool findings/errors | Yes | JSON report/stdout/stderr | lint report JSON and exit code 1 | `writeReport`, `process.exit` | Detailed telemetry delegated to P23b output/report internals. |
| `lint-report main` | Uncaught async error | Yes, lint output log | stdout/stderr/log path when set | `ERROR` | `log` | Exit 1. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js runtime | `node` binary | Observed `v24.14.0` during review | All P23a JS modules | ESM/CLI/fs/path/process | No package pin in scoped files. |
| Git CLI | `git` executable | System git | `project-summary.js` | Tracked files, commit counts, authors/dates | Failures return empty; `.git` required by resolver. |
| Discord integration | Internal/external webhook | Internal | `postToDiscord` | Canonical summary Discord delivery/audit | Missing webhook skips; failure returns false. |
| Platform config loader | Internal source | Internal | `resolveProjectPaths` | Locate projects root | Missing/bad config can throw from loader. |
| Lint-report P23b internals | Internal source | Internal | `lint-report.js` | Discovery/tool registry/output/report | Detailed dependencies deferred to P23b. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Project summary filesystem scan | Synchronous recursive walks | Skips known dirs and files >2 MiB | Blocks caller; skips unreadable files silently | Returned report only | None. |
| Project summary Git commands | Sequential sync exec | 30000 ms timeout, 50 MiB buffer | Empty output on failure/timeout | None locally | Empty git stats may be mistaken for no history. |
| Discord project summary send | One canonical integration send | Webhook required | Failure logged and returns false | Log/downstream audit when reached | None. |
| Lint-report entrypoint | One async registry run | Tool timeouts delegated to P23b | Exit 1 on errors | JSON report/exit code | P23b owns tool concurrency. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Project-summary generator result | `{summaryType, project, markdown, embeds, caseStudyBase, data}` | `generateSummary` | Summary service/generator adapter | Synchronous local generation; no ACP streaming | Project summary markdown/json/case-study base artifacts written by caller. |
| Project-summary Discord embeds | Discord embed array with run/artifact fields | `postToDiscord` | Pipeline Discord integration | One send; integration handles mirroring | Discord audit JSONL downstream. |
| Lint-report CLI result | JSON report plus process exit code 0/1 | `lint-report.js` | `lint.js` wrapper/operators | One run; no ACP/session behavior | Lint JSON output. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Project-summary telemetry/artifacts and Discord mirroring | summaries behavior | Good for service and Discord surfaces | Current no-`.git` test exposes P23a issue. |
| Project-summary shell-safe repo arg | shell-boundary behavior | Good | None. |
| Project-summary CLI strict args | strict CLI contract | Good | None. |
| Lint-report direct import/CLI surface | strict CLI/dynamic import checks and lint wrapper tests | Good for entrypoint | Detailed tool behavior deferred to P23b. |
| Case-study base metrics | summaries behavior partial | Weak | P23a issue for mismatched unit/hardest module field names. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- `P23a-ISSUE-001` — project-summary rejects non-git repo roots despite filesystem fallback and behavior fixture expectations.
- `P23a-ISSUE-002` — case-study base uses stale field names for unit-test and hardest-module metrics.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
