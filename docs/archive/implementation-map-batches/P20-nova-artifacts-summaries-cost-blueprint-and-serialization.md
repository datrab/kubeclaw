# Batch P20 — Nova artifacts, summaries, cost, blueprint, and serialization

Status: completed
Date started: 2026-05-08
Date completed: 2026-05-08
Reviewer: Nova

## Scope

```text
skills/nova/pipeline/services/artifact-bundle.js
skills/nova/pipeline/services/blueprint.js
skills/nova/pipeline/services/case-study.js
skills/nova/pipeline/services/correlation.js
skills/nova/pipeline/services/cost.js
skills/nova/pipeline/services/serialization.js
skills/nova/pipeline/services/summary.js
skills/nova/pipeline/services/summary/*.js
skills/nova/pipeline/services/summary-session-cleanup.js
```

Scope expansion verified live: 8 files, under the 10-file maximum. `skills/nova/pipeline/services/summary/*.js` had no live matches in this checkout. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/nova/pipeline/services/artifact-bundle.js
kubeclaw-main/skills/nova/pipeline/services/blueprint.js
kubeclaw-main/skills/nova/pipeline/services/case-study.js
kubeclaw-main/skills/nova/pipeline/services/correlation.js
kubeclaw-main/skills/nova/pipeline/services/cost.js
kubeclaw-main/skills/nova/pipeline/services/serialization.js
kubeclaw-main/skills/nova/pipeline/services/summary.js
kubeclaw-main/skills/nova/pipeline/services/summary-session-cleanup.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/contracts/check-artifact-authority-slice-surface.mjs
kubeclaw-main/tests/verification/contracts/check-generator-result-surface.mjs
kubeclaw-main/tests/verification/behavior/areas/summaries.mjs
kubeclaw-main/tests/verification/behavior/areas/docs-surface.mjs
kubeclaw-main/tests/verification/behavior/areas/governance.mjs
kubeclaw-main/tests/verification/behavior/areas/foundations.mjs
```

## Per-file map

### `skills/nova/pipeline/services/artifact-bundle.js`

Role: Canonical pipeline artifact bundle, artifact authority policy, latest pointer builder, and plugin artifact persistence API.

Imports/dependencies: Node `fs`/`path`, runtime ID/effect helpers, safe-path validation, plain-object validation, telemetry stream key helper.

Exports/public surface: `PIPELINE_ARTIFACT_AUTHORITY_ROLES`, `PIPELINE_ARTIFACT_SURFACES`, `classifyPipelineArtifactSurface`, `buildPipelineArtifactAuthorityPolicy`, `projectPipelineArtifactEvidence`, `getPipelineArtifactBundle`, `getPluginArtifactBundle`, `buildLatestPointer`, `buildSummaryArtifactBundle`, `createPluginArtifactsApi`.

Defines: Artifact role/surface enums, run-scoped replay vs pointer vs mirror vs fallback classification, plugin artifact lane layout, artifact request validation, index read/write, and persisted artifact refs/effect receipts.

Important variables/state: Frozen role/surface constants; plugin artifact lane index array in `index.json`; generated `artifact:<opaque>` request id; run identity from `_runId`/`run_id`/runtime.

Calls out to: `getRunId`, `createEffectReceipt`, `createOpaqueId`, `isoNow`, `validateSafePath`, `getTelemetryStreamKey`, filesystem reads/writes/copy.

Called by / expected callers: Summary writer, failure presentation, status store latest pointer, plugin invocation context/artifacts API, artifact authority verification.

Environment variables / CLI inputs / config fields: Reads `config._runLogDir`, `config._logDir`, `config._runId`, `config.run_id`, `config.project`, `config.repo_root`.

Paths built/read/written: `.swarm/logs/pipeline/runs/<run_id>/*` replay paths, top-level pipeline summary/latest paths, `plugin-artifacts/<module>/<hookFamily>/<stage>/data/*`, `plugin-artifacts/.../index.json`.

Authority behavior: Explicitly denies lifecycle/session/scheduler/completion/ordering authority for artifacts; run-scoped artifacts can be operator replay evidence only when run identity matches and not fallback evidence.

Error/retry/terminal behavior: Invalid artifact requests throw. Missing run log dir throws for plugin lanes. Filesystem write/copy/JSON parse errors propagate to callers.

Verification coverage: `check-artifact-authority-slice-surface.mjs`, docs/runtime-surface behavior.

Findings: None new in this file.

### `skills/nova/pipeline/services/blueprint.js`

Role: Architecture-branch blueprint and control-file release/sync service.

Imports/dependencies: Node `fs`/`path`/`child_process.spawnSync`, logger, status store, constants, runtime, path helpers, Discord, git integration.

Exports/public surface: `listBlueprints`, `releaseBlueprint`, `releaseGateFiles`, `syncControlFiles`.

Defines: Architecture branch naming (`<project>/architecture`), module/gate control-file policy, targeted checkout/commit/push helpers, conflict recovery for pipeline-file-only rebases, Discord sync notice.

Important variables/state: No module-global mutable state. Runtime `synced[]`, `checkedOut[]`, and git index/working tree state are mutated through git commands.

Calls out to: `gitExec`, `spawnSync('git', ...)`, `loadStatus`, `discord`, path helpers.

Called by / expected callers: Pipeline scheduler/startup blueprint release/sync flow and operators listing architecture branch blueprints.

Environment variables / CLI inputs / config fields: Reads `config.project`, `config.repo_root`, `config.paths.modules_dir`, `progress.modules`, `progress.gates`, module `substeps`, gate `instructions_file`/`review_output_dir`, `config._runLogDir`, `config._logDir`.

Paths built/read/written: Checks out module dirs and gate dirs from `origin/<project>/architecture`; writes `blueprint-sync.json` under run/pipeline logs; commits selected paths; sends Discord operator notification.

Authority behavior: Owns architecture-branch materialization into the repo working tree. It does not own module status except skipping releases when status is not `PENDING`.

Error/retry/terminal behavior: Blueprint release throws on missing required files/checkout/commit/push failure. Gate file release and control sync treat checkout/commit/push failures as WARN/non-critical. Push has limited rebase conflict recovery.

Verification coverage: Indirect pipeline/restart behavior; no focused contract for index-staging safety.

Findings: `P20-ISSUE-001` — `commitSelectedPaths()` can commit unrelated pre-staged files.

### `skills/nova/pipeline/services/case-study.js`

Role: Case-study generator path using an Echo/ACP/subagent session and generator-result contract.

Imports/dependencies: Node `fs`/`path`, logger/path/runtime helpers, agent runtime/lifecycle, polling/sleep, Discord, telemetry, redaction, rate-limit helpers, correlation helpers, generator-result contract, summary cleanup helper.

Exports/public surface: `caseStudyOutputPath`, `caseStudyInstructionsPath`, `caseStudyDispatchMode`, `caseStudyAgentId`, `writeCaseStudyInstructions`, `generateCaseStudy`.

Defines: Case-study prompt artifact, spawn/poll/archive/cleanup workflow, rate-limit recovery/exhaustion handling, Discord spawn/failure/success notices, generator outputs/artifacts.

Important variables/state: Per-run `sessionKey`, `trackingKey`, `dispatch`, `agentId`, `caseStudyAttempt`, last status/correlation fields.

Calls out to: `spawnSession`, `trackAgent`, `pollForFile`, `withSessionRateLimitRecovery`, `finalizeSummarySessionRateLimitExit`, `copyRedactedTranscriptArtifact`, `onSummaryStarted`, `onSummaryCompleted`, `discord`, `killSession`/`untrackAgent` via cleanup.

Called by / expected callers: Built-in generator registry and `summary.js` re-export.

Environment variables / CLI inputs / config fields: Reads `progress.case_study`, `config.case_study`, `progress.defaults.models.echo`, `config.fallback_model`, `cs.enabled`, `cs.model`, `cs.agent_id`, `cs.output_file`, `cs.timeout_minutes`, `cs.thinking_level`, rate-limit config, test overrides.

Paths built/read/written: Writes `.swarm/pipeline-review/CASE-STUDY-INSTRUCTIONS.md` by default; expects `.swarm/logs/pipeline/case-study.md`; reads pipeline/case-study base artifacts in prompt; archives ACP transcript to `.swarm/logs/case-study/case-study-transcript-<ts>.jsonl`.

Authority behavior: Owns case-study generator result shape and nonblocking post-run narrative generation. It does not own pipeline terminal status.

Error/retry/terminal behavior: Disabled returns skipped generator result. Poll rate-limit uses shared cooldown and terminal exhausted result. Missing output throws then is caught into failed generator result. Discord failures are DEBUG/WARN non-critical. Cleanup always runs finally.

Verification coverage: `check-generator-result-surface.mjs`, summaries behavior.

Findings: Inherits P18b summary gateway fallback issue for rate-limit paths.

### `skills/nova/pipeline/services/correlation.js`

Role: Canonical correlation resolution and invocation snapshot helper.

Imports/dependencies: None external.

Exports/public surface: Status/result correlation resolvers, diagnostic-fallback/provenance variants, field-specific helpers, `buildInvocationRefs`, `buildInvocationIds`, `buildInvocationCorrelation`, `buildInvocationSnapshot`.

Defines: Canonical `run:`, `module:`, `gate:`, `dispatch:`, `wait:`, `signal:`, `event:`, `session:`, `stage:` refs; result/status correlation precedence; source provenance records.

Important variables/state: Static resolver arrays only; pure functions.

Calls out to: No external calls.

Called by / expected callers: Context/invocation builders, rate-limit/failure/status/read-model/summary code, tests.

Environment variables / CLI inputs / config fields: Reads `config._runId`, `config.run_id`; invocation object ids/refs/session/dispatch/wait/signal fields.

Paths built/read/written: None.

Authority behavior: Owns correlation precedence and provenance shape for status/result/invocation data.

Error/retry/terminal behavior: No throws for malformed non-object inputs; normalizes to nulls/strings.

Verification coverage: foundations behavior and many dependent contract checks.

Findings: None.

### `skills/nova/pipeline/services/cost.js`

Role: Usage/cost snapshot artifacts, run-level cost report, budget threshold telemetry, and run-stat token accumulation.

Imports/dependencies: Node `fs`/`path`, logger, cost path helper, runtime run id/stats, gateway integration, telemetry facade.

Exports/public surface: `captureSessionSnapshot`, `writeUsageArtifact`, `writeCostReport`, `checkBudgetThresholds`, `accumulateTokens`.

Defines: Token threshold defaults, gateway `session_status` snapshot writer, per-scope usage artifact writer, run cost summary writer, hard-stop policy return, cost update telemetry.

Important variables/state: Mutates `getRunStats(config).inputTokens/outputTokens` in `accumulateTokens`.

Calls out to: `gatewayInvoke('session_status')`, `fs` writes, `onBudgetWarning`, `onBudgetExceeded`, `emitCostUpdate`, `log`.

Called by / expected callers: Pipeline start/terminal, summary writer, agent/session accounting callers.

Environment variables / CLI inputs / config fields: Reads `config._logDir`, `config.repo_root`, `config.project`, `config.budget.warning_tokens`, `config.budget.stop_tokens`, `config.budget.hard_stop`.

Paths built/read/written: `.swarm/logs/cost/<scope>/<scopeId>-snapshot-<ts>.json`, `.swarm/logs/cost/<scope>/<safeId>-usage.json`, `.swarm/logs/cost/run-usage.json`, `.swarm/logs/cost/run-cost-summary.txt`.

Authority behavior: Owns token/cost operator artifacts and budget threshold telemetry; pipeline caller owns whether a returned hard stop halts execution.

Error/retry/terminal behavior: All paths degrade non-blocking on errors; `checkBudgetThresholds` returns `{ok:true}` on internal failure; `captureSessionSnapshot` returns null on gateway/write failure.

Verification coverage: foundations, summaries, telemetry contract/docs behavior.

Findings: None.

### `skills/nova/pipeline/services/serialization.js`

Role: JSON-safe clone/preview and readonly snapshot utilities.

Imports/dependencies: None.

Exports/public surface: `sanitizeForJson`, `cloneSerializable`, `deepClone`, `deepFreeze`, `cloneReadonlySnapshot`, `createReadonlySnapshot`, `buildSafeJsonPreview`.

Defines: BigInt/function/circular normalization, JSON-clone helpers, recursive freeze, bounded JSON preview.

Important variables/state: `DEFAULT_PREVIEW_LIMIT = 2000`; WeakSet/WeakMap per call.

Calls out to: JSON stringify/parse.

Called by / expected callers: Contract diagnostics, context snapshots, tests.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: None.

Authority behavior: Owns safe diagnostic serialization but not secret redaction.

Error/retry/terminal behavior: Preview catches stringify errors and returns an unserializable preview object; clone helpers can throw if post-sanitization JSON parse/stringify fails unexpectedly.

Verification coverage: Contract-diagnostics and control-result contract checks.

Findings: None.

### `skills/nova/pipeline/services/summary.js`

Role: Pipeline summary writer and pipeline-review generator service, plus re-export of case-study/project-summary generators.

Imports/dependencies: Node `fs`/`path`, logger/path/runtime helpers, agent runtime/lifecycle, polling, cost, governance, redaction, telemetry, artifact bundle, rate-limit, correlation, generator-result contract, summary cleanup helper.

Exports/public surface: `buildCumulativeSummary`, `writeSummary`, pipeline-review path/mode/id/instruction helpers, `generatePipelineReview`, plus re-exports from `case-study.js` and project summary.

Defines: Cumulative status aggregation, run/top-level summary JSON writer, latest pointer atomic write, pipeline-review prompt generation, spawn/poll/archive/Discord/rate-limit/finalizer flow.

Important variables/state: Reads run stats; per-review `sessionKey`, `trackingKey`, dispatch/model/attempt/correlation; mutates filesystem summary/latest artifacts.

Calls out to: `writeCostReport`, `checkBudgetThresholds`, `buildGovernanceSummary`, `getPipelineArtifactBundle`, `buildLatestPointer`, `spawnSession`, `pollForFile`, `withSessionRateLimitRecovery`, `finalizeSummarySessionRateLimitExit`, `copyRedactedTranscriptArtifact`, `onSummaryStarted`, `onSummaryCompleted`, `discord`, cleanup helper.

Called by / expected callers: Pipeline terminal/start/scheduler via deps/registry; behavior tests.

Environment variables / CLI inputs / config fields: Reads `config._logDir`, `_runLogDir`, `_runId`, `project`, `repo_root`, `paths.modules_dir`, `progress.defaults.models.echo`, `config.fallback_model`, `pipeline_review` config/progress overrides, `rate_limit`, test overrides.

Paths built/read/written: Module `status.json` reads for cumulative summary; run-scoped and top-level `summary.json`; top-level `latest.json` via temp+rename; pipeline review instructions/output/JSON paths; ACP transcript archive under `.swarm/logs/pipeline-review/`.

Authority behavior: Owns pipeline summary/latest pointer artifacts and generator result projection for pipeline review. Artifact authority is delegated to `artifact-bundle.js`; governance section delegated to governance context.

Error/retry/terminal behavior: Summary writes return failed object on write error. Cost report/budget failures are DEBUG non-critical. Pipeline review rate-limit exhausted returns terminal generator+rate-limit result; no-output/failures are caught into failed generator result; Discord post failure after successful output returns ok generator result with `post_error` diagnostic.

Verification coverage: summaries, docs-surface, governance, generator contract checks.

Findings: Inherits P18b summary gateway fallback issue for rate-limit paths.

### `skills/nova/pipeline/services/summary-session-cleanup.js`

Role: Idempotent cleanup helper for tracked summary/case-study sessions.

Imports/dependencies: Logger.

Exports/public surface: `createTrackedSummarySessionCleanup`.

Defines: Lazy identity resolver and one-shot cleanup closure.

Important variables/state: Closure boolean `cleaned` prevents duplicate kill/untrack attempts.

Calls out to: Caller-provided `killSession` and `untrackAgent`.

Called by / expected callers: `summary.js`, `case-study.js`.

Environment variables / CLI inputs / config fields: None directly; identity can include `config`, runtime/model/agent/label/session/tracking values or functions.

Paths built/read/written: None.

Authority behavior: Owns cleanup idempotence for summary generator sessions; lifecycle authority remains in agent lifecycle helpers.

Error/retry/terminal behavior: Kill/untrack errors are caught, recorded in diagnostics, and WARN logged; cleanup returns diagnostics.

Verification coverage: summaries behavior through finally/post-poll cleanup scenarios.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `summary.js` | `artifact-bundle.js` | `getPipelineArtifactBundle`, `buildLatestPointer`, `buildSummaryArtifactBundle` | Summary/latest path and authority projection. |
| `summary.js` | `cost.js` | `writeCostReport`, `checkBudgetThresholds` | Cost report and budget telemetry during summary write. |
| `summary.js` / `case-study.js` | `summary-session-cleanup.js` | `createTrackedSummarySessionCleanup` | Idempotent post-poll/finally cleanup. |
| `summary.js` / `case-study.js` | `rate-limit.js` | recovery and exhaustion helpers | ACP rate-limit pause/exhaustion behavior. |
| `summary.js` / `case-study.js` | `correlation.js` | result/status resolvers | Attempt/dispatch/gateway/session preservation. |
| `case-study.js` / `summary.js` | `contracts/generator-result.js` | `buildGeneratorResult`, `buildGeneratorArtifactRef` | Typed generator result projection. |
| `blueprint.js` | Git CLI/integration | `gitExec`, `spawnSync('git', ...)` | Architecture branch materialization and push. |
| `contract-diagnostics.js` | `serialization.js` | `buildSafeJsonPreview`, `cloneSerializable` | Safe contract-invalid diagnostics. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `classifyPipelineArtifactSurface` | Surface membership/fallback evidence | Surface string, artifact flags/seq | Role enum | Defines artifact authority class. |
| `buildPipelineArtifactAuthorityPolicy` | Expected vs artifact run/session/dispatch identity | Expected ids and artifact ids | Drift/stale/fallback booleans | Prevents artifact evidence being treated as lifecycle/session authority. |
| `validatePersistArtifactRequest` | Format/type/content/source validity | Plugin persist request | Normalized request or throw | Plugin artifact schema gate. |
| `releaseBlueprint` | Existing status not `PENDING`; required files exist; dirty checkout | Module status, stages, architecture branch | Skip, throw, commit, or no-op | Prevents overwriting active modules with blueprints. |
| `syncControlFiles` | Local content differs from architecture branch | Control-file content | Checkout and commit selected files | Keeps control docs in sync after module starts. |
| `generatePipelineReview` / `generateCaseStudy` | Disabled/rate-limited/no-output/Discord-post failure | Progress/config/poll result | Skipped, terminal rate-limit, failed result, ok with diagnostic | Post-run generators are nonblocking. |
| `writeSummary` | `_logDir` missing or write failure | Config/log paths | No-op summary object or failed object | Summary artifact writes do not throw to caller. |
| `checkBudgetThresholds` | Token total over stop/warning | Run stats and budget config | Emits budget telemetry and returns hard-stop `ok` | Pipeline caller decides stop. |
| `buildInvocationRefs` | Hook family and available refs | Invocation ids/refs | Primary ref precedence | Canonical plugin invocation correlation. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `createPluginArtifactsApi.persist` | Plugin artifact data file and index | Request, invocation, lane paths | New entry appended to existing index; metadata/invocation stored | Returns effect receipt and normalized artifact ref. |
| `writeSummary` | Run and top-level summary/latest JSON | Run stats, cumulative status, governance, artifacts | Cumulative module totals override top-level module counters when available; run stats preserved under `run_stats` | Run summary and operator mirror share same JSON. |
| `buildCumulativeSummary` | Returned counters | Module status history | Counts `PASS`/`BLOCKED`/`FAIL`; history notes containing `Forge started`/`Buster started` | Cumulative project status snapshot. |
| `accumulateTokens` | Runtime run stats | Session meta | Adds input/output tokens to existing stats; optional telemetry from delta | Cumulative token stats. |
| `createTrackedSummarySessionCleanup` | Closure `cleaned` flag | Cleanup calls | First call performs kill/untrack; later calls skip | Cleanup idempotence. |
| `resolve*Correlation*` | Returned correlation bundle | Resolver arrays and fallbacks | First non-null resolver wins; fallback only after resolver miss; provenance tracks source | Stable correlation precedence. |
| `writePipelineReviewInstructions` / `writeCaseStudyInstructions` | Prompt instruction file | Config/progress output paths | Progress overrides config before prompt build | Agent receives artifact-only task. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `createPluginArtifactsApi.find` | Filters current index array | None | Optional positive integer limit | Returns normalized refs after filter/limit. |
| `generatePipelineReview` | Delegated `pollForFile` through rate-limit wrapper | Rate-limit sleeps from shared config | `timeout_minutes` default 45 | Output found, timeout/failure, or rate-limit exhausted. |
| `generateCaseStudy` | Delegated `pollForFile` through rate-limit wrapper | Rate-limit sleeps from shared config | `timeout_minutes` default 30 | Output found, timeout/failure, or rate-limit exhausted. |
| `checkModule/control sync loops` | Iterates modules/gates/control files | None | None | Checkout attempts finish; commit once if any synced. |
| `deepFreeze` / snapshot/serialization helpers | Recursive object traversal | None | WeakSet/WeakMap cycle guards | Stops on primitives, seen objects, or full traversal. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `config._runLogDir`, `config._logDir` | Runtime paths | Artifact bundle, summary, cost, blueprint sync | `_logDir/pipeline/runs/<run_id>` fallback | Artifact/cost/summary roots. |
| `config._runId`, `config.run_id` | Runtime ids | Artifact bundle, cost, summary, correlation | `getRunId(config)` fallback | Run correlation. |
| `config.repo_root`, `config.project` | Config fields | Blueprint, artifact bundle, cost, summary | Required for git/path displays | Project branch and relative paths. |
| `config.budget.warning_tokens`, `stop_tokens`, `hard_stop` | Config fields | `cost.js` | 500000, 1000000, false | Budget telemetry and caller hard-stop return. |
| `progress.case_study`, `config.case_study` | Generator config | `case-study.js` | Progress overrides config | Case-study enable/model/output/timeout/thinking. |
| `progress.pipeline_review`, `config.pipeline_review` | Generator config | `summary.js` | Progress overrides config | Pipeline-review model/output/timeout/instructions. |
| `progress.defaults.models.echo`, `config.fallback_model` | Progress/platform policy | Summary/case-study generators | generator override -> progress echo default -> platform fallback | Default post-run agent model. |
| `progress.modules`, `progress.gates` | Progress fields | Summary cumulative and blueprint sync/release | empty objects | Module status aggregation and control-file syncing. |
| Plugin artifact request fields | Runtime input | `createPluginArtifactsApi.persist` | Required by request | `type`, `format`, `content` or `sourcePath`, optional role/label/metadata/suggestedPath. |
| Invocation ids/refs | Runtime input | `correlation.js`, artifact persist | null fallback | Canonical plugin refs and persisted invocation metadata. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| `.swarm/logs/pipeline/runs/<run_id>/summary.json` | `getPipelineArtifactBundle` / `writeSummary` | Operators/docs/tests | `writeSummary` | Run-scoped replay summary. |
| `.swarm/logs/pipeline/summary.json` | `getPipelineArtifactBundle` / `writeSummary` | Operators/latest mirror | `writeSummary` | Operator mirror only. |
| `.swarm/logs/pipeline/latest.json` | `buildLatestPointer` / `writeSummary` | Operators/status store/tests | Temp write + rename in `writeSummary` | Latest pointer, not lifecycle authority. |
| `.swarm/logs/pipeline/runs/<run_id>/plugin-artifacts/<module>/<hook>/<stage>/data/*` | `createPluginArtifactsApi.persist` | Plugin artifact API callers | `createPluginArtifactsApi.persist` | Plugin artifact data lane. |
| `plugin-artifacts/.../index.json` | Artifact lane helper | Artifact API get/find | `persist` append/write | Plugin artifact reference index. |
| `.swarm/logs/cost/**` | `costLogDir` + `cost.js` | Operators/summary | `captureSessionSnapshot`, `writeUsageArtifact`, `writeCostReport` | Cost/usage evidence. |
| `.swarm/pipeline-review/PIPELINE-REVIEW-INSTRUCTIONS.md` | `writePipelineReviewInstructions` | Spawned review agent | `writePipelineReviewInstructions` | Review prompt artifact. |
| `.swarm/logs/pipeline-review/PIPELINE-REVIEW.md/.json` | Config/progress path helpers | Poller/operators | Review agent | Generator output. |
| `.swarm/pipeline-review/CASE-STUDY-INSTRUCTIONS.md` | `writeCaseStudyInstructions` | Spawned case-study agent | `writeCaseStudyInstructions` | Case-study prompt artifact. |
| `.swarm/logs/pipeline/case-study.md` | `caseStudyOutputPath` | Poller/operators | Case-study agent | Generator output. |
| Architecture branch module/gate control files | `blueprint.js` rel path helpers | Git/working tree | `git checkout origin/<project>/architecture -- <path>` | Blueprint materialization. |
| `blueprint-sync.json` | `syncControlFiles` | Operators | `syncControlFiles` | Best-effort sync summary. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Pipeline artifact authority policy | `artifact-bundle.js` | Summary, status store, failure presentation, tests | None. |
| Latest pointer | `writeSummary`/`buildLatestPointer` | Operators/status surfaces | Pointer only; not lifecycle authority. |
| Plugin artifact index/data | `createPluginArtifactsApi.persist` | Plugin context/API callers | No locking in scoped files; concurrency risk not confirmed. |
| Architecture branch materialized files | `blueprint.js` | Module/gate runner and operators | P20 issue: pre-staged unrelated files can be committed. |
| Pipeline summary JSON | `writeSummary` | Operators/governance/docs/tests | None. |
| Pipeline review/case-study generator results | `summary.js` / `case-study.js` | Generator registry/pipeline terminal | P18b summary gateway fallback issue remains. |
| Cost/token run stats | `accumulateTokens`, runtime stats owner | Cost report, summary, budget checks | None. |
| Correlation bundle/provenance | `correlation.js` | Context, telemetry, failures, summaries | None. |
| Summary session cleanup idempotence | `summary-session-cleanup.js` | Summary/case-study finally paths | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Artifact authority policy | `buildPipelineArtifactAuthorityPolicy` | `code`, `role`, `surface`, artifact/expected run/session/dispatch ids, match booleans, `fallback_evidence`, `identity_drift`, authority denial booleans, operator flags | Builder only; contract test checks surface | Artifact evidence consumers/tests. |
| Pipeline artifact bundle | `getPipelineArtifactBundle` | `run_id`, `telemetry_stream_key`, absolute paths, `relative` paths, `authority` map | Builder only | Summary/status/failure surfaces. |
| Latest pointer JSON | `buildLatestPointer` | `run_id`, `status`, `telemetry_stream_key`, `authority`, relative replay paths, `started_at`, `completed_at`, `exit_code` | Builder only | Operators/status store. |
| Plugin artifact index entry | `createPluginArtifactsApi.persist` | Artifact ref fields, `authority`, `abs_path`, `hookFamily`, `stageId`, `moduleId`, `requestId`, `recordedAt`, `format`, `metadata`, invocation ids | Request validator for input only | Plugin artifact API. |
| Summary JSON | `writeSummary` | Run id/times/exit/project/telemetry key, top-level counters, `run_stats`, optional `cumulative`, `governance`, `usage`, budget/cost path, `artifacts` | Builder only | Operators/docs/tests. |
| Cost snapshot | `captureSessionSnapshot` | `captured_at`, `run_id`, `scope`, `scope_id`, `session_key`, `status`, `usage`, `cost`, `partial`, extra | Builder only | Operators. |
| Run cost report | `writeCostReport` | Token totals, cost availability, module/gate/attempt counts, `budget.warning_tokens`, `stop_tokens`, `threshold_status`, extra | Builder only | Summary/operators. |
| Generator result | `generatePipelineReview`, `generateCaseStudy` via shared contract | `schemaVersion:'v1'`, `producerKind:'generator'`, `producerType`, `outputs`, `artifacts`, `diagnostics` | `buildGeneratorResult` | Registry/pipeline. |
| Correlation bundle | `finalizeCorrelationBundle` | Resolved fields, `provenance`, `source_family`, `source_families` | Resolver functions | Telemetry/status/result consumers. |
| Invocation snapshot | `buildInvocationSnapshot` | `{refs, ids, correlation}` with canonical ref prefixes and id fields | Builder only | Plugin invocation context. |
| Safe JSON preview | `buildSafeJsonPreview` | `{format:'json', truncated:boolean, preview:string}` or null | Sanitizer/try-catch | Contract diagnostics. |
| Cleanup diagnostics | Summary cleanup closure | `cleaned`, `reason`, `session_key`, `tracking_key`, `kill_error`, `untrack_error` | Closure only | Summary/case-study callers/logs. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Pipeline review agent | `writePipelineReviewInstructions` | `.swarm/pipeline-review/PIPELINE-REVIEW-INSTRUCTIONS.md` default | Review completed run from pipeline log, summary JSON, module statuses, saved prompts; analyze architecture, agent performance, prompt effectiveness, test quality, config recommendations, improvements | Spawned ACP/subagent session; no explicit tool schema beyond file read/write instructions | Write markdown review and structured JSON with `status`, `project`, `run_id`, architecture observations, agent performance, prompt/test/config/improvement arrays. |
| Case-study agent | `writeCaseStudyInstructions` | `.swarm/pipeline-review/CASE-STUDY-INSTRUCTIONS.md` | Use only case-study base data and project summary; do not read source code; produce publishable overview/architecture/execution/challenges/results/lessons | Spawned ACP/subagent session; no explicit tool schema beyond artifact reads and markdown write | Write one markdown file to configured output. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `createPluginArtifactsApi.persist` | Invalid request/path/filesystem/JSON index failure | No local retry | Synchronous write/copy/index update | Throws to caller | No redaction. |
| `releaseBlueprint` | Missing required architecture file or checkout/commit/push failure | Partial git retry for push/rebase conflicts | Fetch once; conflict recovery for pipeline-file-only conflicts | Throws terminal release error | None. |
| `releaseGateFiles` / `syncControlFiles` | Fetch/checkout/commit/push failure | Partial git retry via helper | Fetch once, checkout per file/dir | WARN/non-critical except some helper conflicts | None. |
| `writeSummary` | Cost report/budget failure | No retry | One attempt | DEBUG non-critical | None. |
| `writeSummary` / `emitPipelineSummaryLifecycle` | Summary/latest write failure | No retry | Direct writes; latest temp+rename | Returns failed summary object; lifecycle telemetry maps it to `status:'failed'`/`reason` without emitting internal `failed` | `summary.completed` when lifecycle caller is active. |
| `generatePipelineReview` / `generateCaseStudy` | Rate-limit pause/exhaustion | Yes until shared cap | Shared cooldown/pause policy | Exhaution returns terminal generator+rate-limit result | None local. |
| `generatePipelineReview` / `generateCaseStudy` | Poll timeout/no output/session failure | No local retry except rate-limit | `timeout_minutes` default 45/30 | Caught and returned failed generator result | Transcript copies use redaction helper. |
| `generatePipelineReview` | Discord post failure after successful output | No | One post plus warning notice attempt | Returns ok generator result with `post_error` diagnostic | None local. |
| `generateCaseStudy` | Discord success/failure notice failure | No | One notice | WARN/DEBUG non-critical; generator result still returned | None local. |
| `captureSessionSnapshot`, `writeUsageArtifact`, `writeCostReport`, `checkBudgetThresholds`, `accumulateTokens` | Gateway/write/stats/telemetry internal errors | No | One attempt | Nonblocking null/no-op/ok result | None. |
| `serialization` helpers | Circular/function/bigint/unserializable data | N/A | WeakSet/try-catch for preview | Sanitized output or fallback preview | Not secret redaction. |
| `createTrackedSummarySessionCleanup` | Kill/untrack failure | No | One attempt each; idempotent skip after first call | WARN logs and diagnostic fields, no throw | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `createPluginArtifactsApi.persist` | Invalid/write failure | None locally | None | none | N/A | Caller/plugin boundary owns diagnostics. |
| `releaseBlueprint` | Missing/checkout/commit/push failure | Exception/log only | Thrown error and logs | Error message | `throw`, `log` | Terminal to caller. |
| `releaseGateFiles` / `syncControlFiles` | Noncritical git failure | Yes, log | Pipeline log/stdout | WARN/DEBUG blueprint messages | `log` | Sync summary artifact may still be written. |
| `syncControlFiles` | Successful sync | Yes | Discord and `blueprint-sync.json` | Blueprint Sync notice/artifact | `discord`, `fs.writeFileSync` | Operator evidence. |
| `writeSummary` | Cost report/budget failure | Yes, log only | Pipeline log/stdout | DEBUG `[summary] Cost report failed` | `log` | Summary still proceeds. |
| `writeSummary` / `emitPipelineSummaryLifecycle` | Summary/latest write failure | Yes, log plus returned object and schema-valid summary telemetry | Pipeline log/stdout, returned object, `summary.completed` | WARN `Failed to write summary.json`; telemetry status/reason | `log`, telemetry payload schema | No summary artifact if write fails; internal `failed` flag stays local. |
| Summary/case-study rate-limit | Pause/exhaustion | Yes via shared helpers | Telemetry/lifecycle/Discord/result | `rate_limit.detected`, `summary.completed` finalizer when configured | rate-limit helpers, `onSummaryCompleted` | P18b gateway fallback issue applies. |
| Summary/case-study no output/failure | Poll/session failure | Yes | `summary.completed` telemetry, Discord failure/no-output notice, generator result | `summary.completed`, Discord title | `onSummaryCompleted`, `discord` | Discord failures DEBUG-only. |
| `generatePipelineReview` | Discord post failure after output | Yes | WARN log, optional warning Discord, generator diagnostic | `post_error` diagnostic | `log`, `discord`, `buildGeneratorResult` | Main output still ok. |
| `cost.js` nonblocking failures | Gateway/write/budget/stat errors | Yes for most, none for `accumulateTokens` catch | DEBUG/WARN logs or no-op | `[cost] ... failed` logs | `log` | `accumulateTokens` silently ignores internal errors. |
| `serialization` helpers | Unserializable preview | Yes by returned preview | Caller diagnostic payload | `unserializable` preview | `buildSafeJsonPreview` | No log. |
| `createTrackedSummarySessionCleanup` | Kill/untrack failure | Yes | WARN log and returned diagnostics | `kill_error`, `untrack_error` | cleanup closure | Idempotent cleanup prevents repeated attempts. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js runtime | `node` binary | Observed `v24.14.0` during review | All scoped JS modules | ESM, fs/path, child_process, JSON | No package pin in scoped files. |
| Git CLI | `git` executable via `spawnSync`/`gitExec` | System git | `blueprint.js` | Fetch/checkout/commit/pull/rebase/push architecture branch files | P20 issue for pre-staged unrelated files; conflicts partially recovered. |
| Discord integration | Internal/external webhook | Internal | Summary/case-study/blueprint | Operator notices | Many sends are best-effort. |
| Gateway ACP API | Internal/external gateway | Internal | Cost snapshots, summary/case-study sessions via lifecycle | `session_status`, spawn/poll lifecycle | Gateway failures are nonblocking for cost; generator failures return failed result. |
| Telemetry facade | Internal source | Internal | Summary/case-study/cost | Summary/budget/cost events | Some cost errors log only. |
| Status store/path helpers | Internal source | Internal | Summary/blueprint | Module status aggregation and release skip | Status read parse errors WARN in cumulative summary. |
| Generator result contract | Internal source | Internal | Summary/case-study | Typed generator output | Contract checked by verification. |
| Redaction helper | Internal source | Internal | Transcript archive | Redacted ACP transcript copy | Copy failures caught by outer generator flow. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Plugin artifact index | Append by read-modify-write `index.json` | No lock/cap in scoped file | Concurrent persists to same lane could race, but scoped files do not show concurrent callers | Artifact index entries | Needs confirmation before issue. |
| Summary/latest writes | Direct JSON writes; latest temp+rename | One write per summary call | Write failure returns failed object | WARN log/return | None. |
| Pipeline review polling | One session per generator invocation | Timeout default 45 min; rate-limit cap from config | Rate-limit cooldown/exhaustion or failed generator result | Summary telemetry/Discord/result | None. |
| Case-study polling | One session per generator invocation | Timeout default 30 min; rate-limit cap from config | Rate-limit cooldown/exhaustion or failed generator result | Summary telemetry/Discord/result | None. |
| Cost gateway snapshot | One `session_status` request | 10000 ms timeout | Null result on failure | DEBUG log | None. |
| Blueprint git operations | Sequential fetch/checkout/commit/push | No explicit queue | Git conflict/failure throws or WARNs depending caller | Logs/Discord/sync artifact | P20 issue for dirty/pre-staged index. |
| Cleanup helper | One kill/untrack attempt total | Closure idempotence | Later cleanup calls skip | Returned diagnostics/log | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Summary/case-study spawn request | `{session:{model,runtime,agentId,cwd,label}}` plus prompt and options `{runtime,model,agentId,cwd,label,thinking,trackActive:false}` | `generatePipelineReview`, `generateCaseStudy` | Agent lifecycle/gateway | One spawned session per generator; no local streaming flush | Session key, stream log path, active-agent tracking. |
| File-poll completion result | Poll result `{ok, reason, status}` plus rate-limit status/result fields | `pollForFile` and rate-limit wrapper | Summary/case-study generators | Poll timeout default 45/30 min; rate-limit cooldown between retries | Generator result/summary telemetry/Discord. |
| ACP transcript archive | JSONL stream log copied to `.swarm/logs/...-transcript-<ts>.jsonl` | ACP session stream log | Operators/debug | One copy after poll for ACP runtime only | Redacted transcript artifact. |
| Gateway `session_status` cost snapshot | Tool result with `status`, `usage`, `cost` | Gateway API | `captureSessionSnapshot` | 10000 ms timeout, no retry | Cost snapshot JSON. |
| Invocation snapshot | `{refs, ids, correlation}` | `buildInvocationSnapshot` | Plugin context/artifact consumers | Synchronous; no streaming | Context/correlation metadata. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Artifact authority roles and bundle paths | `check-artifact-authority-slice-surface.mjs`, docs-surface/runtime-surface | Good | Plugin index concurrency not covered. |
| Generator result helper use and gateway-label assumptions | `check-generator-result-surface.mjs`, summaries behavior | Good | P18b summary gateway fallback issue remains. |
| Summary/latest/cost/governance artifacts | summaries, docs-surface, governance behavior | Strong | None in scoped files. |
| Correlation helper export/snapshot | foundations behavior and dependent tests | Good | None. |
| Blueprint git staging safety | Indirect only | Weak | P20-ISSUE-001. |
| Serialization diagnostics | Contract diagnostics/control-result checks | Good indirect | No dedicated secret-redaction claim; serialization is not redaction. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- `P20-ISSUE-001` — Blueprint `commitSelectedPaths()` can commit unrelated pre-staged files.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
