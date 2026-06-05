# Batch V05 — Contract verification for Buster/common support surfaces

Status: completed
Date started: 2026-05-09
Date completed: 2026-05-09
Reviewer: Nova

## Scope

```text
tests/verification/contracts/check-buster-operator-surface.mjs
tests/verification/contracts/check-buster-pipeline-slice-surface.mjs
tests/verification/contracts/check-buster-repo-scoped-paths.mjs
tests/verification/contracts/check-buster-verify-task-scope.mjs
tests/verification/contracts/check-common-helper-import-surface.mjs
tests/verification/contracts/check-strict-cli-args-surface.mjs
```

Scope expansion verified live: 6 files, under the 10-file maximum. All scoped files were read end to end before conclusions were written.

## Sources checked

Implementation files:

```text
kubeclaw-main/tests/verification/contracts/check-buster-operator-surface.mjs
kubeclaw-main/tests/verification/contracts/check-buster-pipeline-slice-surface.mjs
kubeclaw-main/tests/verification/contracts/check-buster-repo-scoped-paths.mjs
kubeclaw-main/tests/verification/contracts/check-buster-verify-task-scope.mjs
kubeclaw-main/tests/verification/contracts/check-common-helper-import-surface.mjs
kubeclaw-main/tests/verification/contracts/check-strict-cli-args-surface.mjs
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/docs/pipeline/implementation-map/README.md
kubeclaw-main/docs/pipeline/implementation-map/batch-template.md
kubeclaw-main/docs/open-issues.md
```

## Per-file map

### `tests/verification/contracts/check-buster-operator-surface.mjs`

Role: Contract guard for canonical Buster operator Discord embed/message surfaces and removal of legacy operator wording/surfaces.

Imports/dependencies: Quiet runtime console, Node fs/path/assert.

Exports/public surface: CLI script; supports `--source-root`; prints `{ ok: true, checked: 13 }` on success.

Defines: `parseArgs`, `countOccurrences`, canonical surface list, retired legacy marker list.

Important variables/state: Source text for `skills/buster/buster-pipeline.js`, `pipeline/services/task-lifecycle.js`, and `pipeline/services/task-lifecycle/session.js`.

Calls out to: Filesystem reads and string assertions only.

Called by / expected callers: Contract verification wrappers/operators.

Environment variables / CLI inputs / config fields: `--source-root`, defaulting to cwd.

Paths built/read/written: Reads Buster pipeline/task lifecycle source; no writes.

Authority behavior: Canonical Buster operator surface is the five explicit embed builders: suite results, session spawn, session complete, task failure, and timeout. Legacy operator markers are forbidden.

Error/retry/terminal behavior: Missing canonical surface, duplicate Discord surface call, or legacy marker causes terminal assertion failure; no retry.

Verification coverage: Focused source-text surface check.

Findings: None found.

### `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs`

Role: Contract guard for Buster pipeline slice extraction, active-agent helper boundaries, monitor identity, rate-limit ownership, structured gateway shutdown, sandbox cleanup, canonical result artifact precedence, and suite timeout cleanup.

Imports/dependencies: Quiet runtime console, Node fs/os/path/assert/url, imports Buster main/helper/monitor/suite-runner modules.

Exports/public surface: CLI script; supports `--source-root`; prints `{ ok: true, checked: 75 }` on success.

Defines: `parseArgs`, source/API assertions, active-agent temp fixture, canonical artifact result fixture, timeout wrapper fixture.

Important variables/state: Source text for Buster main, pipeline helpers, session monitor, task lifecycle/session/completion-signal, rate-limit, gateway-health, suite-runner. Temp status JSON and artifact result files.

Calls out to: `markBusterActiveAgent`, `clearBusterActiveAgent`, `resolveBusterRateLimitMaxPauses`, `resolveBusterAgentResult`, `runSuiteWithTimeout`, `monitorSession` export checks.

Called by / expected callers: Contract verification wrappers/operators.

Environment variables / CLI inputs / config fields: `--source-root`; fixture payload/config objects include run/attempt/dispatch/session identity and Buster rate-limit fields.

Paths built/read/written: Reads Buster runtime source. Writes temp status JSON and temp result/status/output artifacts under a repo/temp root, then removes artifact temp root.

Authority behavior: Main `buster-pipeline.js` must delegate extracted helpers/monitor and not directly mutate `status.active_agent`. Shared lifecycle-state helpers own active-agent mark/clear. Canonical result artifact wins over legacy `status.json`; gate `output_file` is accepted only with valid status. Gateway failures must use structured shutdown and sandbox cleanup.

Error/retry/terminal behavior: Monitor exceptions are expected to emit `agent.killed` with `monitor_error`, clear in-memory active session, and preserve unconfirmed recovery state. Rate-limit monitor owns canonical pause telemetry while sleeping. Timeout wrapper must clear handles after completion.

Verification coverage: Strong source/API/runtime fixture coverage.

Findings: None found.

### `tests/verification/contracts/check-buster-repo-scoped-paths.mjs`

Role: Contract guard for Buster suite path scoping, common path boundary semantics, visual-reg/perf path ownership, and removed task-controlled output/baseline path fields.

Imports/dependencies: Quiet runtime console, Node assert/fs/os/path, Buster repo-paths, common security, visual-reg, perf helpers.

Exports/public surface: CLI script; supports `--source-root`; prints `{ ok: true, checked: 30 }` on success.

Defines: `parseArgs`, `assertRejectsPath`, temp repo/project fixture, suite source scan.

Important variables/state: Canonical `REPO_DIR`, temp repo/project/sibling dirs, suite file list, source text for repo-paths/common security/visual-reg/perf.

Calls out to: `resolveRepoScopedPath`, `resolveScopedPath`, `isPathInside`, `resolveVisualRegProjectDir`, `resolveVisualRegBaselineDir`, `runVisualReg`, `resolvePerfReportPaths`.

Called by / expected callers: Contract verification wrappers/operators.

Environment variables / CLI inputs / config fields: `--source-root`; fixture task config uses `project_dir`, removed `baseline_dir`, removed `perf.output_path`, module/attempt/test log metadata.

Paths built/read/written: Creates temp repo/project dirs; reads Buster suite source files; no persistent writes.

Authority behavior: `REPO_DIR` is canonical `/home/node/.openclaw/workspace/git-repo`. Task-controlled paths must resolve inside repo/scope via common boundary semantics. Visual-reg baseline path is derived from module id; perf final path is durable tests log artifact. Removed task-configured paths are rejected.

Error/retry/terminal behavior: Absolute host path, traversal, null byte, sibling scope escape, unsupported visual-reg baseline path, and unsupported perf output path fail closed by throwing/ERROR result.

Verification coverage: Strong path-boundary fixture and source scan.

Findings: None found.

### `tests/verification/contracts/check-buster-verify-task-scope.mjs`

Role: Contract guard for Buster verify-task project slug validation, git path normalization/boundary checks, and `.swarm`-only staging scope.

Imports/dependencies: Quiet runtime console, Node assert/fs/path, verify-task helper exports.

Exports/public surface: CLI script; supports `--source-root`; prints `{ ok: true, checked: 24 }` on success.

Defines: `parseArgs` plus project slug, git path, and source assertions.

Important variables/state: Scope for project `foo`, source text for `skills/buster/pipeline/tools/verify-task.js`.

Calls out to: `validateProjectSlug`, `normalizeGitPath`, `buildSwarmScope`, `isGitPathInside`.

Called by / expected callers: Contract verification wrappers/operators.

Environment variables / CLI inputs / config fields: `--source-root`; project slug CLI behavior is asserted through helper functions.

Paths built/read/written: Reads verify-task source; no writes.

Authority behavior: Only valid project slugs build project and swarm scopes. `verify-task` must stage only swarm scope and must not authorize by substring role matches such as buster/forge/test/echo.

Error/retry/terminal behavior: Invalid project ids throw; sibling project prefix matches fail boundary checks; no retry.

Verification coverage: Focused helper/source guard.

Findings: None found.

### `tests/verification/contracts/check-common-helper-import-surface.mjs`

Role: Contract guard for shared common pipeline helper inventory, Nova/Buster repo-local compatibility shims, no direct common imports outside shims, production-local imports, and repo-scoped git primitive head-hash caching.

Imports/dependencies: Quiet runtime console, Node fs/os/path/assert/child_process, lifecycle audit helper inventory, common git primitives.

Exports/public surface: CLI script; supports `--source-root` and `--overlay-root`; prints `{ ok: true, checked: 47 + commonFiles.length * 2 }` on success.

Defines: `parseArgs`, recursive `walk`, `expectedShimSource`, temp git repo fixture.

Important variables/state: Effective common files inventory, expected shared helper inventory, Nova/Buster skill file list, production-local import marker list, temp git repos A/B.

Calls out to: `effectiveFiles`, `getRepoRoot`, `gitExec`, `headHash`, `invalidateHeadHash`, `setRepoRoot`, host `git` binary via `execFileSync`.

Called by / expected callers: Contract verification wrappers/operators.

Environment variables / CLI inputs / config fields: `--source-root`, `--overlay-root`; no runtime config.

Paths built/read/written: Reads common/Nova/Buster source and `skills/nova/pipeline/README.md`. Creates temp git repos and commits fixture files, then removes them.

Authority behavior: `skills/common/pipeline` owns shared helpers; Nova/Buster must expose repo-local shim files re-exporting the common owner. Production code should import production-local shim paths, not `/app/common/pipeline` or direct common paths outside shims. Git primitive head hash cache is repo-scoped and invalidation is repo-scoped.

Error/retry/terminal behavior: Inventory drift, missing shim, direct common import, missing production-local import marker, or bad git head cache behavior fails the script; no retry.

Verification coverage: Broad inventory/source plus temp git behavior fixture.

Findings: None found.

### `tests/verification/contracts/check-strict-cli-args-surface.mjs`

Role: Contract guard for shared strict CLI argument parsing, migrated CLI tools, unknown flag rejection, Buster Redis direct CLI parser import, and lint-report changed-file filtering.

Imports/dependencies: Quiet runtime console, Node assert/fs/os/path/child_process/url, imports shared CLI parser.

Exports/public surface: CLI script; supports `--source-root`; prints `{ ok: true, checked: 22 }` on success.

Defines: `parseArgs`, shared parser assertions, migrated CLI source scan, Buster Redis unknown-flag subprocess fixture, lint-report temp fixture.

Important variables/state: Parser module path, migrated CLI file list, temp lint repo/output paths.

Calls out to: `parseCliArgs`, `parseCliFlagValues`, `spawnSync` for Buster Redis CLI, `execFileSync` for lint-report CLI.

Called by / expected callers: Contract verification wrappers/operators.

Environment variables / CLI inputs / config fields: Shared CLI parser declarations for string/boolean/required flags and positionals; tool CLIs with `--repo`, `--tier`, `--changed-files`, `--output`.

Paths built/read/written: Reads migrated CLI source files. Creates temp lint repo and output JSON, then removes temp root.

Authority behavior: Shared strict parser owns CLI flag parsing for migrated tools; manual `args.indexOf('--...')` parsing is forbidden. Lint-report applies existing-file changed scope before reporting.

Error/retry/terminal behavior: Unknown flags, missing string values, unexpected positionals, missing required flags throw/fail. Buster Redis CLI must reject unknown flags through strict parser rather than missing import failure.

Verification coverage: Strong parser API/source/subprocess fixture coverage.

Findings: None found.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `check-buster-operator-surface.mjs` | Buster pipeline/task lifecycle sources | canonical Discord embeds | Ensures one canonical operator surface each. |
| `check-buster-pipeline-slice-surface.mjs` | Buster helpers/monitor/rate-limit/gateway/suite runner | active-agent, monitor, rate-limit, result artifact, timeout APIs | Validates extracted Buster pipeline architecture. |
| `check-buster-repo-scoped-paths.mjs` | Buster repo paths/common security/visual-reg/perf | path scoping helpers | Validates repo-scoped path authority and removed task path fields. |
| `check-buster-verify-task-scope.mjs` | verify-task helpers/source | project/git scope helpers | Validates `.swarm` staging and strict slug/path checks. |
| `check-common-helper-import-surface.mjs` | lifecycle audit inventory/common git primitives | common helper shims and repo-scoped head hash | Validates shared helper ownership. |
| `check-strict-cli-args-surface.mjs` | shared CLI parser and migrated CLIs | parser API and CLI subprocess fixtures | Validates strict flag parsing. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| Buster operator surface | canonical vs legacy embed marker | source text occurrences | exactly one canonical call; legacy markers forbidden | Prevents duplicate/legacy operator messaging. |
| Buster active-agent helpers | mark/clear identity matches or mismatches | run/attempt/dispatch/session key | mark, preserve on mismatch, clear on match | Preserves active-session authority. |
| Buster result resolver | result artifact, legacy status JSON, gate output file | task type and artifact status | canonical artifact preferred; invalid output fails closed | Result artifact precedence. |
| Repo path resolver | absolute/traversal/null/sibling inputs | candidate/base/scope/repo paths | reject or resolve inside repo/scope | Prevents host/sibling path escape. |
| Verify-task scope | project slug and git path relation | project id, git paths | valid scope or reject | Limits git staging to project `.swarm`. |
| Common helper inventory | common file inventory vs shim files | effective source files | require Nova/Buster shims and local imports | Shared helper ownership. |
| Strict CLI parser | unknown/missing/required/positional flags | argv + declared schema | parsed values or thrown parser error | Deterministic CLI behavior. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| Buster active-agent fixture | temp `status.json` | active session identity | helper writes exact identity; mismatched clear preserved; matched clear nulls | No direct `status.active_agent` mutation in main/helper source. |
| Buster result fixture | temp result/status/output artifacts | task payload artifact paths | result artifact beats stale legacy status; gate output accepted only when valid | Canonical outcome/source. |
| Common git primitive fixture | temp repos and head-hash cache | repo A/B heads and invalidation | cache scoped per repo; invalidation refreshes only requested repo | No cross-repo head hash bleed. |
| Strict CLI lint fixture | temp lint report JSON | changed-files list with missing file | existing-file filter before report generation | Report includes only existing changed file. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `runSuiteWithTimeout` fixture | suite callback racing timeout | `setTimeout` configured ms | passed `1234` in fixture | fast suite returns PASS and clears timeout. |
| Source inventory scans | file lists remain | none | none | all declared files checked or first assertion fails. |
| V05 scripts generally | no live polling loops | None found in scoped files | None found in scoped files | assertion pass/fail. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `--source-root` | CLI flag | all V05 contract scripts | cwd | Resolves source tree under test. |
| `--overlay-root` | CLI flag | common helper import contract | null | Optional overlay source for effective common inventory. |
| Buster rate-limit payload/config | Runtime fixture | Buster pipeline slice contract | in-memory | `rate_limit.max_pauses`, monitor `rate_limit_status.max_rate_limit_pauses`. |
| Buster task path config | Runtime fixture | repo-scoped path contract | in-memory | `project_dir`, removed `baseline_dir`, removed `perf.output_path`. |
| Strict CLI parser flag schemas | Runtime fixture | strict CLI contract | in-memory | string/boolean/default/required/positional behavior. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| `skills/buster/buster-pipeline.js` | repo source | V05 Buster contracts | source | Thin main surface delegating helpers/monitor. |
| `skills/buster/pipeline/services/pipeline-helpers.js` | repo source | Buster pipeline slice contract | source | Active-agent/result/operator helper owner. |
| `skills/buster/pipeline/services/session-monitor.js` | repo source | Buster pipeline slice contract | source | Buster child-session monitor owner. |
| `skills/buster/pipeline/suites/repo-paths.js` | repo source | repo-scoped path contract | source | Buster repo-scope helper; delegates common security. |
| `/home/node/.openclaw/workspace/git-repo` | constant `REPO_DIR` | repo-scoped path contract/Buster suites | source/runtime | Canonical repo root. |
| `Projects/<project>/src/.swarm` | verify-task scope builder | verify-task contract | verify-task runtime | Git staging scope for Buster verification. |
| `skills/common/pipeline/**` | common helper owner | common helper import contract | source | Shared helper owner behind Nova/Buster shims. |
| temp git repos | common helper contract | git primitive fixture | contract script | Repo-scoped head-hash cache fixture only. |
| temp lint report JSON | lint-report CLI fixture | strict CLI contract | lint-report CLI | Existing changed-file scope evidence. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Buster operator Discord surfaces | canonical embed builders in Buster pipeline surface | task lifecycle/operator sinks | None. |
| Buster active-agent status | shared lifecycle-state helper via Buster helper module | Buster lifecycle/monitor | None. |
| Buster task result | canonical result artifact/output file, then legacy status fallback | Buster lifecycle/completion | None. |
| Buster task-controlled filesystem paths | repo-scoped/common security helpers | Buster suite runners | None. |
| Verify-task git staging scope | `buildSwarmScope`/git path helpers | verify-task CLI | None. |
| Common pipeline helpers | `skills/common/pipeline` plus repo-local shims | Nova/Buster production code | None. |
| CLI argument parsing | `skills/common/pipeline/cli-args.js` | migrated CLI tools | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Buster active agent | `markBusterActiveAgent` | `session_key`, `dispatch_id`, `stream_log_path`, `label`, `gateway_label`, `run_id`, `attempt`, `runtime`, `model`, `agent_id`, `phase`, `started_at` | lifecycle-state helper boundary | Buster lifecycle/status consumers. |
| Buster agent result | `resolveBusterAgentResult` | `outcome`, `reason`, `summary`, `source` | Buster helper artifact/status/output readers | completion and operator surfaces. |
| Repo-scoped path result | repo/common path helpers | absolute path inside repo/scope | `resolveRepoScopedPath`, `resolveScopedPath`, `isPathInside` | Buster suite runners. |
| Verify-task swarm scope | `buildSwarmScope` | `project`, `projectRoot`, `swarmRoot` | slug/git path validators | verify-task staging. |
| Strict CLI parser result | `parseCliArgs` | `values`, `positionals`; typed string/boolean/default/required values | parser schema | migrated CLI tools. |
| Lint report changed scope | lint-report CLI | `changed_files` existing file list | CLI existing-file filter | pipeline lint consumers. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Buster child session monitor | `session-monitor.js` checked by V05 | transcript/telemetry surfaces not directly inspected | No prompt content in scoped files | ACP/session monitor runtime | Explicit identity object with `session_key`, label, module id. |
| Buster verify-task CLI | `verify-task.js` checked by V05 | `.swarm` git staging scope | No prompt content | git CLI via tool runtime | Stage only `Projects/<project>/src/.swarm`. |
| Migrated CLI tools | shared strict parser | tool outputs such as lint report JSON | No prompt content | Node CLI flags | Declared flags only; unknown flags rejected. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| Buster operator surface contract | missing/duplicate/legacy operator surface | No | none | terminal assertion failure | none. |
| Buster monitor/task lifecycle | monitor exception before finalization | No in contract | none | emits monitor-error kill and preserves unconfirmed recovery state | runtime redaction not inspected. |
| Buster gateway health path | gateway failure | No in contract | none | structured shutdown plus sandbox cleanup | runtime redaction not inspected. |
| Buster suite timeout | suite timeout handle leak/timeout | Timeout possible | configured suite timeout ms | fast suite clears timeout; timeout wrapper owns rejection path | none. |
| Repo-scoped paths | absolute host/traversal/null/sibling/removable config paths | No | none | throw or ERROR result | none. |
| Verify-task scope | invalid project slug or path outside scope | No | none | throw/report `[SWARM-SCOPE]` violation | none. |
| Common helper inventory/imports | missing shim/direct common import/head-hash cache bleed | No | none | terminal assertion failure | none. |
| Strict CLI parser | unknown flag/missing value/unexpected positional/missing required flag | No | none | parser throws/subprocess exits nonzero | none. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| V05 contract scripts | assertion/source/API drift | Yes/partial | process stderr/stdout | assertion error / JSON success | Node assert/verifier wrapper | Adequate for contract verification. |
| Buster monitor/task lifecycle | monitor exception | Yes | runtime telemetry/operator surfaces | `agent.killed` with `reason: monitor_error` | task lifecycle session handler | Source markers asserted. |
| Buster gateway health path | gateway failure | Yes | structured runtime telemetry/shutdown path | gateway degraded signal and `shutdown('GATEWAY_HEALTH_FAILED')` | gateway health/main pipeline | Source markers asserted. |
| Buster suite timeout | timeout/fast completion | Yes/partial | returned suite result / timeout wrapper behavior | timeout wrapper result | `runSuiteWithTimeout` | Fast completion cleanup asserted; no live telemetry emitted by contract. |
| Repo-scoped path rejection | host/traversal/sibling path | Yes/partial | thrown error or visual-reg ERROR result | path scope rejection message | path helpers/visual-reg/perf | No runtime Redis telemetry expected. |
| Verify-task scope violation | invalid slug/out-of-scope git path | Yes/partial | thrown error/source marker | `[SWARM-SCOPE]` | verify-task CLI | Source marker asserted. |
| Common helper import drift | inventory/import/cache failure | Yes/partial | assertion stderr/stdout | assertion error | contract script | Temp git fixture validates behavior. |
| Strict CLI parser | flag parse failure | Yes/partial | thrown error or subprocess stderr | `Unknown flag`, `Missing value`, `Missing required flag` | strict parser / CLI process | Buster Redis unknown flag stderr asserted. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js | Runtime binary | Node runtime | all V05 scripts | ESM, assert, filesystem, subprocess tests | Required. |
| Quiet runtime console helper | local verification helper | repo source | all V05 scripts | suppress noisy logs | Restored before JSON output. |
| Host `git` binary | system binary | host version | common helper contract | temp repo init/commit/head-hash cache tests | Required for that contract. |
| `pathToFileURL` dynamic import | Node URL API | Node runtime | Buster pipeline/strict CLI contracts | import production ESM helpers | Contract-local only. |
| Temp filesystem | Node fs/os/path | Node runtime | Buster active-agent/artifact, repo path, git, lint fixtures | isolated fixtures | Removed where scripted. |
| Production source modules | repo source | local tree | all V05 contracts | source/API validation | Drift fails fast. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Buster suite timeout | one timeout handle per suite run | configured timeout ms | timeout wrapper should reject and clear handles | fake timer cleanup assertion | None. |
| Buster rate-limit monitor | max pauses | monitor status, payload `rate_limit.max_pauses`, default 3 | terminal pause budget resolver returns configured/default value | helper assertions | None. |
| Common git head-hash cache | cache per repo root | repo-scoped cache | invalidation refreshes only selected repo | temp repo fixture | None. |
| Contract scripts | sequential assertions | Node process | first assertion failure exits | stderr/stdout JSON | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Buster monitor transcript identity | explicit object with `label`, `moduleId`, `session_key` | Buster session monitor | transcript telemetry publisher | monitor poll/rate-limit runtime not exercised live | source marker assertions. |
| Buster active session | run/attempt/dispatch/session identity plus gateway label | Buster helper/lifecycle | status/monitor/completion | clear preserves unconfirmed state on monitor errors | temp status fixture/source assertions. |
| Buster rate-limit canonical pause | `rate_limit_status` with max pause budget and ownership flag | monitor/rate-limit service | task lifecycle/completion telemetry | local sleep owns canonical signal | source markers/helper assertions. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Canonical Buster operator surface | `check-buster-operator-surface.mjs` | Focused source-text guard | None found. |
| Buster pipeline slices/monitor/rate-limit/artifacts | `check-buster-pipeline-slice-surface.mjs` | Strong source/API/runtime fixtures | None found. |
| Buster repo-scoped paths | `check-buster-repo-scoped-paths.mjs` | Strong path-boundary fixture/source scan | None found. |
| Buster verify-task scope | `check-buster-verify-task-scope.mjs` | Focused helper/source guard | None found. |
| Common helper shim/import ownership | `check-common-helper-import-surface.mjs` | Broad inventory/source/temp git fixture | None found. |
| Strict CLI parser migration | `check-strict-cli-args-surface.mjs` | Strong parser/source/subprocess fixture | None found. |

Validation evidence:

```text
node --check tests/verification/contracts/check-buster-operator-surface.mjs
node --check tests/verification/contracts/check-buster-pipeline-slice-surface.mjs
node --check tests/verification/contracts/check-buster-repo-scoped-paths.mjs
node --check tests/verification/contracts/check-buster-verify-task-scope.mjs
node --check tests/verification/contracts/check-common-helper-import-surface.mjs
node --check tests/verification/contracts/check-strict-cli-args-surface.mjs
node tests/verification/contracts/check-buster-operator-surface.mjs --source-root "$PWD" # {"ok":true,"checked":13}
node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root "$PWD" # {"ok":true,"checked":75}
node tests/verification/contracts/check-buster-repo-scoped-paths.mjs --source-root "$PWD" # {"ok":true,"checked":30}
node tests/verification/contracts/check-buster-verify-task-scope.mjs --source-root "$PWD" # {"ok":true,"checked":24}
node tests/verification/contracts/check-common-helper-import-surface.mjs --source-root "$PWD" # {"ok":true,"checked":77}
node tests/verification/contracts/check-strict-cli-args-surface.mjs --source-root "$PWD" # {"ok":true,"checked":22}
git diff --check
```

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- None yet.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
