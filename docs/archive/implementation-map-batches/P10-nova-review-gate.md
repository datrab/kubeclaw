# Batch P10 — Nova review gate

Status: completed
Date started: 2026-05-08
Date completed: 2026-05-08
Reviewer: Nova

## Scope

```text
skills/nova/pipeline/runners/review-gate*.js
```

Scope expansion verified live: 5 files, under the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/nova/pipeline/runners/review-gate-control.js
kubeclaw-main/skills/nova/pipeline/runners/review-gate-fix-cycle.js
kubeclaw-main/skills/nova/pipeline/runners/review-gate-output.js
kubeclaw-main/skills/nova/pipeline/runners/review-gate-runner.js
kubeclaw-main/skills/nova/pipeline/runners/review-gate-task.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/contracts/check-gate-control-result-surface.mjs
kubeclaw-main/tests/verification/contracts/check-gate-active-session-surface.mjs
kubeclaw-main/tests/verification/contracts/check-remediation-handoff-surface.mjs
kubeclaw-main/tests/verification/contracts/check-gate-fix-scaffold-surface.mjs
kubeclaw-main/tests/verification/behavior/areas/gates.mjs
kubeclaw-main/tests/verification/behavior/areas/fix-cycles.mjs
kubeclaw-main/tests/verification/behavior/areas/gate-session-persistence.mjs
kubeclaw-main/tests/verification/behavior/areas/polling.mjs
```

## Per-file map

### `skills/nova/pipeline/runners/review-gate-control.js`

Role: Typed review gate control-result and remediation request builder.

Imports/dependencies: Exit constants, runtime run id, gate-control contract helpers, remediation-handoff builder, correlation helpers, review output parsers/findings.

Exports/public surface: `buildReviewGateControlResult`, `isReviewGateControlResult`, `coerceReviewGateControlResult`, `buildReviewRequestFixControlResult`.

Defines: Compatibility-to-typed result summary/metadata mapping and typed `request_fix` control result construction.

Important variables/state: No mutable module state.

Calls out to: `mapGateCompatibilityResultToControl`, `buildTypedGateControlResult`, `coerceTypedGateControlResult`, `buildGateRemediationRequestControlResult`, `extractReviewIssues`, `buildReviewGateFindings`, correlation resolvers.

Called by / expected callers: Review runner, review fix-cycle rate-limit path, remediable gate engine/generic gate control adapter.

Environment variables / CLI inputs / config fields: Reads `config.default_max_fails`, run id fields, gate `type`, `reviewers`, remediation opts.

Paths built/read/written: No filesystem paths. Remediation diagnostics may carry `merged_file_path` from review result.

Authority behavior: Owns review producer-type typed control-result schema boundary; generic gate runner owns pipeline-step projection.

Error/retry/terminal behavior: No local catch; contract coercion can throw. `request_fix` policy uses max fix cycles from review config or `config.default_max_fails`.

Verification coverage: Gate-control and remediation-handoff contract tests assert extracted control helper and shared remediation request contract.

Findings: None.

### `skills/nova/pipeline/runners/review-gate-fix-cycle.js`

Role: Review-specific adapter around generic Forge gate fix-cycle engine.

Imports/dependencies: Logger, runtime run id, failure truncation helper, remediation spec reader, review prompt builder, generic gate Forge fix-cycle runner.

Exports/public surface: `performReviewGateFixAttempt`.

Defines: Review fix-cycle prompt assembly, NO-GO issue guard, active-session extra metadata, Discord message templates, success cleanup hook, rate-limit control-result conversion.

Important variables/state: Uses caller-provided `fixHistory` array; generic fix-cycle appends cycle history. No module-global state.

Calls out to: `readGateRemediationSpec`, `buildReviewFixPrompt`, `runGateForgeFixCycle`, callback `buildReviewRemediationExhaustedControlResult`, callback `cleanupReviewFiles`.

Called by / expected callers: `runReviewGateFixAttempt` in review runner.

Environment variables / CLI inputs / config fields: Reads remediation policy, `reviewConfig.maxFixCycles`, `reviewConfig.timeout`, `reviewConfig.reviewers`, `config.default_max_fails`, `config.default_timeout_minutes`, `opts.novaPrompt`.

Paths built/read/written: Prompt artifact path delegated to `gate-fix-scaffold.js`; cleanup files delegated to callback.

Authority behavior: Owns review-specific fix prompt and message policy; generic fix-cycle owns ACP session lifecycle and no-change/rate-limit classification.

Error/retry/terminal behavior: Missing gate throws. NO-GO with no extractable issues returns exhausted terminal control result. Nova prompt is injected only on cycle 1. Spawn/health/no-change/rate-limit/success semantics delegated to generic engine.

Verification coverage: Fix-cycle behavior tests and gate-fix-scaffold contract tests.

Findings: None.

### `skills/nova/pipeline/runners/review-gate-output.js`

Role: Pure review output parsing and findings extraction helpers.

Imports/dependencies: None.

Exports/public surface: `extractReviewIssues`, `summarizeReviewNoGoReason`, `buildReviewGateFindings`, `parseReviewOutputContent`.

Defines: Critical issue/blocker extraction, NO-GO reason summarizer, typed finding mapper, strict JSON/status parser.

Important variables/state: None.

Calls out to: `JSON.parse` only.

Called by / expected callers: Review task parser and review control/remediation builders.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: None.

Authority behavior: Owns review output contract interpretation for GO/PASS vs NO-GO/FAIL; side-effect-free by design.

Error/retry/terminal behavior: Invalid JSON/object/status returns `{ ok:false, decision:'invalid_contract', invalid_contract:true, error }`; no throw for malformed content.

Verification coverage: Gates behavior tests include malformed output fail-closed regression.

Findings: None.

### `skills/nova/pipeline/runners/review-gate-runner.js`

Role: Review gate lifecycle orchestrator: completion skip, Echo review, NO-GO handling, fix-and-rereview loop, telemetry, and control adapter.

Imports/dependencies: Node `fs`/`path`; logger/constants/runtime/config/path/git/Discord; status-store archive; failures truncation; polling/lint/prompts/orchestration/lifecycle/telemetry/rate-limit/correlation/Discord fields/remediation/contracts; review control/output/task/fix-cycle helpers; remediable gate engine.

Exports/public surface: `projectReviewGateCompatibilityResult`, `buildReviewRemediationExhaustedControlResult`, `runReviewGateEvaluation`, `runReviewGateFixAttempt`, `createReviewGateRemediationController`, `getReviewGateControlAdapter`, `runReviewGate`, `runReviewGateStage`.

Defines: Dependency seam, review config resolver, cleanup routine, NO-GO field builder, exhausted remediation result, evaluation route, remediation controller, remediable adapter.

Important variables/state: Mutates run stats `gates_failed`/`gates_completed`; `cleanupReviewFiles` deletes review artifacts and commits deletions; `runReviewGate` creates per-run `fixHistory`.

Calls out to: `runReviewGateOnce`, `finalizeGateSessionRateLimitExit`, `onGateStarted`, `onGatePass`, `onGateFail`, `emitGateRetryExhausted`, `runRemediableGateControlLoop`, `performReviewGateFixAttempt`, git cleanup commands.

Called by / expected callers: Gate registry/generic gate runner, direct review-gate tests, legacy review gate callers.

Environment variables / CLI inputs / config fields: Reads `config.review_defaults`, progress `defaults.reviewers`, `default_timeout_minutes`, `default_max_fails`, `_testOverrides.reviewGate`, `rate_limit.max_pauses_per_module`, gate `reviewers`, `timeout_minutes`, `max_fix_cycles`, `lint_tier`, `on_nogo`, `output_file`, `review_name`, `review_output_dir`, `opts.novaPrompt`.

Paths built/read/written: Reads existing `gate.output_file`; cleanup deletes per-reviewer output files and merged output; commits cleanup with Git; review task handles output/prompt/transcript paths.

Authority behavior: Owns review gate terminal semantics and remediable adapter. Generic gate runner owns registry dispatch; generic remediable engine owns loop mechanics.

Error/retry/terminal behavior: Missing gate throws. Completed GO output skips. Existing NO-GO plus Nova prompt skips Echo and enters fix. Missing reviewers returns terminal `EXIT_ERROR` with gate fail telemetry. Rate-limit returns `EXIT_RATE_LIMITED`. Invalid review output and initial post-start failures return `EXIT_ERROR`. Re-review failures become `request_fix` using previous remediation diagnostics. NO-GO without `fix_and_rereview` returns `EXIT_NEEDS_NOVA`; with fix-and-rereview emits request-fix. Exhausted fix cycles returns typed BLOCK with retry-exhausted telemetry.

Verification coverage: Gates, fix-cycles, polling, gate-session-persistence behavior tests plus gate-control/remediation contract tests.

Findings: None.

### `skills/nova/pipeline/runners/review-gate-task.js`

Role: One Echo review task: lint report, reviewer prompt, Echo spawn/poll/kill, active-session evidence, artifact archive, output copy, and parsing.

Imports/dependencies: Node `fs`/`path`; logger; rate-limit recovery helpers; correlation, redaction, ACP transcript progress classifier, gate active-session helpers, review output parser.

Exports/public surface: `reviewOutputPath`, `describeReviewTranscriptActivityState`, `runReviewGateOnce`.

Defines: Review output path builder, poll failure formatter, transcript activity summarizer, full single-review cycle.

Important variables/state: Mutates run stats `total_echo_reviews`; local Echo correlation fields; persists/clears gate active-session file.

Calls out to: Lint report deps, prompt deps, `spawnReviewerAgent`, `pollForFile`, `withSessionRateLimitRecovery`, `killReviewerAgent`, redacted artifact writers, Git commit/push, output parser.

Called by / expected callers: `runReviewGateEvaluation`.

Environment variables / CLI inputs / config fields: Reads reviewer `label`, `model`, `thinking_level`, `dispatch`; gate `review_output_dir`, `review_name`, `output_file`, `type`, `title`; review config `timeout`, `lintTier`; `config.rate_limit.max_pauses_per_module`, `_logDir`.

Paths built/read/written: Builds `<swarmRoot>/<review_output_dir>/<reviewer.label>-<gate.review_name>.json`, gate lint log traces, `gates/<gateId>/echo-prompt-attempt-<n>.md`, `gates/<gateId>/echo-transcript-attempt-<n>.jsonl`, optional `gate.output_file`. Archives/deletes prior review output and copies parsed output to merged gate output.

Authority behavior: Owns Echo review task side effects and active-session evidence for review gates. Output parser owns content validation.

Error/retry/terminal behavior: No reviewers returns error. Lint report failure degrades to warning prompt block. Instruction read or spawn failure returns error. Rate-limit recovery can return exhausted result. Finally always attempts reviewer kill and transcript archive. Poll no-output returns error with session/transcript. Git commit uses `softFail:true`. Invalid/missing output returns error or invalid contract result.

Verification coverage: Gates, polling, gate-session-persistence and active-session contract tests.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `review-gate-runner.js` | `review-gate-task.js` | `runReviewGateOnce`, `reviewOutputPath`, `describeReviewTranscriptActivityState` | Echo review task and output path. |
| `review-gate-runner.js` | `review-gate-control.js` | control result and request-fix builders | Typed review gate result authority. |
| `review-gate-control.js` | `review-gate-output.js` | issue extraction/findings/summary | Reuses output facts for control metadata. |
| `review-gate-runner.js` | `review-gate-fix-cycle.js` | `performReviewGateFixAttempt` | Review-specific fix adapter. |
| `review-gate-fix-cycle.js` | `gate-forge-fix-cycle.js` | `runGateForgeFixCycle` | Shared Forge fix session mechanics. |
| `review-gate-runner.js` | `remediable-gate-engine.js` | `runRemediableGateControlLoop` | Generic request-fix loop. |
| `review-gate-task.js` | `gate-active-session.js` | `persistGateActiveSession`, `clearGateActiveSession` | Echo active-session recovery evidence. |
| `review-gate-task.js` | `review-gate-output.js` | `parseReviewOutputContent` | Strict review JSON/status parser. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `parseReviewOutputContent` | Invalid JSON/non-object/status | Output content | Invalid contract result | Fail-closed parser. |
| `parseReviewOutputContent` | Status GO/PASS vs NO-GO/FAIL | `reviewResult.status` | GO pass or NO-GO fail facts | Review decision authority. |
| `runReviewGateEvaluation` | Existing output GO/PASS | `gate.output_file` JSON | Skip review with OK control result | Resume idempotence. |
| `runReviewGateEvaluation` | Existing output NO-GO/FAIL plus Nova prompt | Output JSON and `opts.novaPrompt` | Skip initial Echo and enter Forge fix | Manual guidance can fix existing NO-GO. |
| `runReviewGateEvaluation` | No reviewers | `reviewConfig.reviewers` | Terminal error result | Misconfig fail-closed. |
| `runReviewGateEvaluation` | Rate-limit exhausted | Review task result | Terminal rate-limit control result | Preserves Echo cooldown exhaustion. |
| `runReviewGateEvaluation` | Invalid output, initial failure, re-review failure, GO, NO-GO | Review task result | Error, request-fix, pass, needs-Nova, or request-fix | Main review decision routing. |
| `performReviewGateFixAttempt` | NO-GO with no extractable issues | Remediation diagnostics issues | Exhausted terminal control result | Avoids spawning Forge without target. |
| `createReviewGateRemediationController` | Fix/evaluate callbacks | Remediation loop callbacks | Re-review after successful fix or request another fix | Shared loop integration. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `buildReviewGateControlResult` | Typed control metadata | Compatibility result and opts | Result fields first, rate-limit fields fallback, opts attempt fallback | Review metadata has correlation/attempt fields. |
| `buildReviewRequestFixControlResult` | Remediation request diagnostics | Review result/remediation opts | Explicit opts correlation first, result correlation fallback | Fix loop receives issues and last review. |
| `cleanupReviewFiles` | Review output files and Git commit | Reviewer labels and merged output path | Delete existing reviewer outputs and merged output, then `git add -A`/commit | Worktree clean before re-review. |
| `runReviewGateOnce` | Gate active-session JSON | Tracked Echo agent | Clear stale file before spawn; persist after spawn; clear only if kill succeeds | Recovery evidence tracks live Echo. |
| `runReviewGateOnce` | Review output artifact | Echo output and gate output path | Archive previous, delete before spawn, copy reviewer output to merged gate output | Gate output mirrors reviewer JSON. |
| `buildReviewRemediationExhaustedControlResult` | Run stats/telemetry | Remediation spec and control metadata | Remediation diagnostics first, metadata fallback | Exhausted fix loop preserves latest correlation. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `runReviewGateOnce` | Poll for output file via `pollForFile` | Polling service owns sleep | `reviewConfig.timeout` | Returns when file appears, timeout/error/rate-limit. |
| `withSessionRateLimitRecovery` review wrapper | Rate-limit pause recovery | Rate-limit service sleep | `config.rate_limit.max_pauses_per_module` default 5 | Returns exhausted result after pause budget. |
| `runReviewGate` | Remediation loop delegated | Generic remediable engine | `reviewConfig.maxFixCycles`/default max fails | Stops on pass/block/error/exhausted. |
| `performReviewGateFixAttempt` | One fix cycle | Generic gate Forge fix cycle | `reviewConfig.timeout`/default timeout | Returns terminal/retry/re-evaluate mode. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| gate `reviewers`, `progress.defaults.reviewers` | Progress/gate field | `resolveReviewConfig`, task runner | Gate overrides project defaults | Echo reviewer list; first reviewer is used. |
| `config.review_defaults.timeout_minutes`, gate `timeout_minutes`, `config.default_timeout_minutes` | Config/gate field | Review config/task/fix cycle | Gate/default fallback | Echo poll and fix timeout minutes. |
| `config.review_defaults.max_fix_cycles`, gate `max_fix_cycles`, `config.default_max_fails` | Config/gate field | Review config/remediation policy | Gate/default fallback | Fix-and-rereview cycle budget. |
| `config.review_defaults.lint_tier`, gate `lint_tier` | Config/gate field | Review config/task | required platform default, gate may override | Lint report tier. |
| `gate.on_nogo` | Gate field | `runReviewGateEvaluation` | `fix_and_rereview` | NO-GO route selection. |
| `gate.review_output_dir`, `gate.review_name`, `gate.output_file` | Gate fields | Review task/runner | `echo-reviews` for output dir | Review output and merged gate output paths. |
| `reviewer.label/model/thinking_level/dispatch` | Reviewer config | Review task | label required by path | Echo spawn policy and output filename. |
| `config._testOverrides.reviewGate` | Test override | `getReviewGateRunnerDeps` | `{}` | Replaces review gate dependencies. |
| `opts.novaPrompt` | Run option | Review evaluation/fix cycle | null | Can skip existing NO-GO review and inject into first fix prompt. |
| `config.rate_limit.max_pauses_per_module` | Config field | Review task/evaluation | `5` fallback | Echo/review fix cooldown pause budget. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| `<swarmRoot>/<gate.review_output_dir \|\| 'echo-reviews'>/<reviewer.label>-<gate.review_name>.json` | `reviewOutputPath` | Review parser/runner skip/cleanup | Echo reviewer, archive/delete/copy logic | Primary Echo review output. |
| `<swarmRoot>/<gate.output_file>` | `runReviewGateEvaluation`, `runReviewGateOnce`, cleanup | Completion skip and gate consumers | Copy from reviewer output; cleanup deletes | Merged gate output mirror. |
| `<gateLintLogDir>/full-trace-attempt-<n>.jsonl` | `runReviewGateOnce` | Lint report generator | Lint service | Deterministic lint trace artifact. |
| `<gateLintLogDir>/full-attempt-<n>.json` | `runReviewGateOnce` | Operators/tests | Review task | Best-effort lint JSON artifact. |
| `gates/<gateId>/echo-prompt-attempt-<n>.md` | `runReviewGateOnce` via `gateLogDir` | Operators/debugging | `writeRedactedPromptArtifact` | Redacted Echo prompt archive. |
| `gates/<gateId>/echo-transcript-attempt-<n>.jsonl` | `runReviewGateOnce` via `gateLogDir` | Operators/debugging | `copyRedactedTranscriptArtifact` | Redacted Echo transcript archive. |
| Gate active-session file | `persistGateActiveSession` in review task/fix scaffold | Restart recovery | Review task and fix scaffold | Evidence only; lifecycle read model remains authority. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Review JSON status contract | `review-gate-output.js parseReviewOutputContent` | Review task/runner/control builders | None. |
| Review gate typed control result | `review-gate-control.js` | Generic gate runner/remediable engine | None. |
| Review gate lifecycle and terminal routing | `review-gate-runner.js` | Gate registry/pipeline runner | None. |
| Echo review task side effects | `review-gate-task.js` | Review runner/operators/recovery | None. |
| Review fix prompt and adapter policy | `review-gate-fix-cycle.js` | Generic Forge fix cycle engine | None. |
| Review active-session recovery evidence | `review-gate-task.js` plus shared `gate-active-session.js` | Restart recovery | Lifecycle read model remains authoritative. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Review output JSON | Echo reviewer | Object with `status`; accepted statuses `GO`, `PASS`, `NO-GO`, `FAIL`; optional `critical_issues`, `critical_blockers` arrays | `parseReviewOutputContent` | Review runner/control/fix prompt. |
| Review issue object | `extractReviewIssues` | `module`, `location`, `description`, `recommended_fix` | Extractor defaults description | Review findings and fix prompts. |
| Review finding | `buildReviewGateFindings` | `code`, `severity:'error'`, `message`, `category:'review'`, `target`, `retryable:false`, `environmentIssue:false`, `metadata.recommended_fix` | Gate control contract | Gate telemetry/typed result. |
| Review typed control result | `buildReviewGateControlResult` | producer `review`, action/issue/outcome from compatibility mapping, summary, findings, metadata, metrics | Gate control contract helpers | Generic gate runner/remediable engine. |
| Review remediation request | `buildReviewRequestFixControlResult` | producer `review`, remediation policy `{ maxFixCycles, nextFixCycle, rerunStageId:'gate:review' }`, targetRef, diagnostics issues/last_review/merged_file_path | Remediation handoff contract | Remediable gate engine/fix adapter. |
| Review task result | `runReviewGateOnce` | `{ ok, mergedResult?, mergedFilePath?, error?, invalid_contract?, gateway_label?, session_key?, transcript?, rate_limit_exhausted? }` | Review runner branch logic | Review evaluation. |
| Review remediation exhausted result | `buildReviewRemediationExhaustedControlResult` | Typed BLOCK result, metadata fix_cycles/last_review/gateway/session, metrics issues_count | Gate control contract | Generic gate runner terminal projection. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Echo reviewer prompt | `deps.buildReviewerPrompt` with instructions, lint block, relative output path | `gates/<gateId>/echo-prompt-attempt-<n>.md` redacted copy | Prompt body built in `prompts/review.js`; P10 injects lint report and output path | Echo reviewer agent via `spawnReviewerAgent` | JSON file at `reviewOutputPath` with status GO/PASS/NO-GO/FAIL. |
| Review fix prompt | `buildReviewFixPrompt` with current issues, cycle budget, history; optional Nova override on cycle 1 | Gate Forge scaffold prompt artifact | Prompt body built in `prompts/review.js`; P10 prepends Nova override when provided | Forge fix agent via generic gate fix cycle | File changes, no changes, rate-limit, or session result for re-review. |
| Lint report reviewer context | `generateLintReport` + `formatLintReportForReviewer` | Lint JSON/trace artifacts | Static analysis block injected into Echo prompt; failure injects warning block | Deterministic lint service | Reviewer uses report as context only. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `parseReviewOutputContent` | Invalid JSON/object/status | No | No retry | Returns invalid-contract result | None. |
| `runReviewGateEvaluation` | Existing invalid output | Yes by rerun | No local sleep | Logs WARN and re-runs review | None. |
| `runReviewGateEvaluation` | No reviewers | No | No retry | Terminal `EXIT_ERROR` | None. |
| `runReviewGateEvaluation` | Echo rate-limit exhausted | No | Pause/retry handled by rate-limit service; max default 5 | Terminal `EXIT_RATE_LIMITED` | None. |
| `runReviewGateEvaluation` | Invalid output contract | No | No retry | Terminal `EXIT_ERROR` | Diagnostics include parser error. |
| `runReviewGateEvaluation` | Re-review execution failure | Yes via remediation cycle | No local sleep | Returns `request_fix` using previous diagnostics | Error included. |
| `runReviewGateEvaluation` | Initial review execution failure | No | No retry | Terminal `EXIT_ERROR` | Transcript summary only. |
| `runReviewGateEvaluation` | NO-GO with `on_nogo` not fix | No | No retry | Terminal `EXIT_NEEDS_NOVA` | Last review metadata included. |
| `buildReviewRemediationExhaustedControlResult` | Fix cycle exhausted | No | No retry | Terminal BLOCK control result | Last review cloned. |
| `performReviewGateFixAttempt` | No extractable issues | No | No retry | Exhausted terminal control result | None. |
| `runReviewGateOnce` | Lint report generation failure | Soft | No retry | Reviewer prompt includes warning block | None. |
| `runReviewGateOnce` | Instruction read failure | No | No retry | Returns error | Error message included. |
| `runReviewGateOnce` | Reviewer spawn failure | No | No retry | Returns error | Error message included. |
| `runReviewGateOnce` | Poll timeout/no output | No local retry | Poll service timeout `reviewConfig.timeout` | Returns error with session/transcript | Transcript summarized later. |
| `runReviewGateOnce` | Cleanup/archival/prompt artifact/lint artifact copy failures | Soft | No retry | Swallowed or DEBUG log | Prompt/transcript artifact writers redact when successful. |
| `runReviewGateOnce` | Git commit/push failure | Soft | `softFail:true` | Continues parsing | None. |
| `runReviewGateOnce` | Copy to gate output/read output failure | Partial | No retry | Copy logs WARN; read returns error | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `parseReviewOutputContent` | Invalid output | Indirect | Review runner gate fail telemetry | `gate.failed` invalid output | `runReviewGateEvaluation` | Parser itself is pure. |
| `runReviewGateEvaluation` | Existing invalid output | Yes | Core log | WARN re-running | `log` | Then review executes. |
| `runReviewGateEvaluation` | No reviewers | Yes | Gate telemetry/Discord/core log | `gate.started` if needed, `gate.failed`, CRITICAL Discord | `onGateStarted`, `onGateFail`, `log` | Missing await on `onGateFail` call but event invoked. |
| `runReviewGateEvaluation` | Rate-limit exhausted | Yes | Rate-limit telemetry/Discord/gate fail stats | rate-limit terminal event | `finalizeGateSessionRateLimitExit` | Preserves dispatch/gateway/session. |
| `runReviewGateEvaluation` | Invalid output contract | Yes | Gate telemetry/Discord/core log | `gate.failed`, CRITICAL Discord | `onGateFail`, `log` | Terminal error control result. |
| `runReviewGateEvaluation` | Re-review execution failure | Yes | Core log and gate fail telemetry | ERROR log; `gate.failed` | `onGateFail`, `log` | Returns request-fix. |
| `runReviewGateEvaluation` | Initial review execution failure | Yes | Gate telemetry/Discord/core log | `gate.failed`, CRITICAL Discord | `onGateFail`, `log` | Transcript state field when available. |
| `runReviewGateEvaluation` | NO-GO non-fix | Yes | Gate fail telemetry/Discord/core log | WARN NO-GO; `gate.failed` WARN Discord | `onGateFail`, `log` | Terminal needs-Nova result. |
| `buildReviewRemediationExhaustedControlResult` | Fix exhausted | Yes | Gate telemetry, retry-exhausted telemetry, Discord/core log | `gate.failed`, `retry.exhausted`, CRITICAL Discord | `onGateFail`, `emitGateRetryExhausted`, `log` | Stats updated. |
| `performReviewGateFixAttempt` | No issues | Yes via exhausted builder | Gate telemetry/retry exhausted | exhausted control result | `buildReviewRemediationExhaustedControlResult` | No Forge spawn. |
| `runReviewGateOnce` | Lint report unavailable | Yes | Core log and prompt content | WARN log, warning block in Echo prompt | `log` | Soft degradation. |
| `runReviewGateOnce` | Instruction read failure | Indirect | Review evaluation gate fail telemetry | `gate.failed` initial failure | caller | Caller handles returned error. |
| `runReviewGateOnce` | Reviewer spawn failure | Indirect | Core log then review evaluation gate fail telemetry | ERROR log; `gate.failed` | `log`, caller | Returns error. |
| `runReviewGateOnce` | Poll timeout/no output | Indirect | Core log then review evaluation gate fail telemetry | WARN log; `gate.failed` | `log`, caller | Transcript state attached. |
| `runReviewGateOnce` | Artifact cleanup/write/copy soft failures | Partial | none or DEBUG log | DEBUG transcript save failure only | Local catches | Prompt/lint artifact write failures are silent. |
| `runReviewGateOnce` | Git commit/push failure | Indirect | Git helper may report | soft-fail Git helper | `deps.gitCommitAndPush` | P10 does not inspect result. |
| `runReviewGateOnce` | Copy/read output failure | Partial | WARN/ERROR core log and caller gate fail telemetry | WARN copy failure; ERROR read failure | `log`, caller | Read failure returned to caller. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js runtime | `node` binary | Observed `v24.14.0` during review | All P10 modules | ESM, sync fs/path, async control flow | No package pin in scoped files. |
| Node `fs`/`path` built-ins | Runtime built-ins | Node major 24 observed | Review runner/task | Output cleanup, artifact dirs/files, JSON read/write/copy | Sync IO used; several artifact failures soft. |
| Git CLI via `gitExec`/`gitCommitAndPush` | System Git through internal helpers | Internal | Cleanup commits and review output commits | Keep worktree/artifacts synchronized | Cleanup commit failures DEBUG; review commit soft-fail. |
| Echo/reviewer ACP runtime | Agent orchestration helpers | Internal gateway/session | Review task | Spawn/poll/kill Echo reviewer | Rate-limit recovery wraps output polling. |
| Forge fix ACP runtime | Generic gate fix cycle | Internal gateway/session | Review fix-cycle | Spawn Forge to fix review issues | Shared P09 scaffold owns session side effects. |
| Lint service | Internal deterministic service | Internal | Review task | Static analysis block for Echo prompt | Failure degrades to warning prompt block. |
| Gate-control/remediation contracts | Internal source | Internal | Review control/runner | Typed review control and remediation request validation | Contract errors propagate to generic gate runner. |
| Telemetry/Discord/rate-limit services | Internal/external | Internal/external | Review runner/task/fix | Operator alerts, cooldown handling, gate events | Sink behavior reviewed elsewhere. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Echo reviewer selection | Single reviewer only | First element of `reviewers` | No parallel review fanout | Reviewer label in Discord/events | None. |
| Echo output polling | One poll loop through `pollForFile` | `reviewConfig.timeout` | Timeout/no-output returns error | Gate fail telemetry includes transcript state | None. |
| Rate-limit pause recovery | Pause budget | `config.rate_limit.max_pauses_per_module` default 5 | Exhaustion terminal `EXIT_RATE_LIMITED` | Rate-limit telemetry/Discord | None. |
| Fix-and-rereview loop | Sequential fix then re-review | `max_fix_cycles`/default max fails | Exhaustion returns BLOCK | Gate fail and retry-exhausted telemetry | None. |
| Active-session persistence | Single gate active-session file | One Echo/fix session at a time | Stale cleared before spawn; clear only after kill succeeds | Recovery evidence file | None. |
| Lint/report artifacts | Synchronous artifact writes | No retry | Lint generation degrades prompt; artifact write swallowed | WARN for lint generation | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Echo reviewer spawn | `spawnReviewerAgent(config, progress, gateId, reviewer, reviewerPrompt, { thinking, gate_type, attempt })` | Review task | Agent orchestration/gateway | Backend spawn semantics | Tracked agent key `echo-<reviewer>-<gateId>`. |
| Echo active-session record | Gate active-session JSON from tracked agent plus phase/reviewer/gate_type/attempt | `persistGateActiveSession` in review task | Restart recovery | Atomic write; cleared on successful kill | Session key/dispatch/gateway evidence. |
| Echo output polling | `pollForFile(config, outputFilePath, timeout, label, echoTrackingKey)` wrapped by rate-limit recovery | Review task | Polling/rate-limit service | Rate-limit wrapper sleeps/resumes until pause budget exhausted | Returns transcript/session evidence on failure. |
| Echo transcript artifact | Redacted copy of tracked agent stream log | Review task finally block | Operators/debugging | Copied once after poll/kill | `echo-transcript-attempt-<n>.jsonl`. |
| Review fix Forge session | Generic gate fix cycle with review-specific prompt/session extras | Review fix adapter | Gate fix scaffold/Forge runtime | Shared P09 fix-cycle semantics | Fix prompt and active-session evidence. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Review typed-control extraction | `tests/verification/contracts/check-gate-control-result-surface.mjs` | Strong source/delegation coverage | Behavior covered in gates/fix-cycles. |
| Review active-session extraction | `tests/verification/contracts/check-gate-active-session-surface.mjs`, `gate-session-persistence.mjs` | Good persistence/delegation coverage | Full recovery covered elsewhere. |
| Review remediation handoff | `tests/verification/contracts/check-remediation-handoff-surface.mjs`, `fix-cycles.mjs` | Strong request-fix/fix-loop coverage | None. |
| Review malformed output/no-output/rate-limit/correlation | `tests/verification/behavior/areas/gates.mjs`, `polling.mjs` | Strong targeted regressions | None. |
| Review prompt/fix scaffold split | `tests/verification/contracts/check-gate-fix-scaffold-surface.mjs`, `fix-cycles.mjs` | Good delegation coverage | Prompt body reviewed in P22. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- None yet.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
