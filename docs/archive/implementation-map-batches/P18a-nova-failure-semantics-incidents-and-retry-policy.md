# Batch P18a — Nova failure semantics, incidents, and retry policy

Status: completed
Date started: 2026-05-08
Date completed: 2026-05-08
Reviewer: Nova

## Scope

```text
skills/nova/pipeline/services/failure-semantics.js
skills/nova/pipeline/services/failures.js
skills/nova/pipeline/services/failures/classification.js
skills/nova/pipeline/services/failures/incidents.js
skills/nova/pipeline/services/failures/presentation.js
skills/nova/pipeline/services/failures/retry-policy.js
```

Scope expansion verified live: 6 files, under the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/nova/pipeline/services/failure-semantics.js
kubeclaw-main/skills/nova/pipeline/services/failures.js
kubeclaw-main/skills/nova/pipeline/services/failures/classification.js
kubeclaw-main/skills/nova/pipeline/services/failures/incidents.js
kubeclaw-main/skills/nova/pipeline/services/failures/presentation.js
kubeclaw-main/skills/nova/pipeline/services/failures/retry-policy.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/contracts/check-observability-catch-reporting.mjs
kubeclaw-main/tests/verification/contracts/check-telemetry-contract.mjs
kubeclaw-main/tests/verification/behavior/areas/discord-correlation.mjs
kubeclaw-main/tests/verification/behavior/areas/foundations.mjs
kubeclaw-main/tests/verification/behavior/areas/lifecycle-state-surface.mjs
kubeclaw-main/tests/verification/behavior/areas/module-failures.mjs
kubeclaw-main/tests/verification/behavior/areas/pipeline.mjs
```

## Per-file map

### `skills/nova/pipeline/services/failure-semantics.js`

Role: Normalized failure vocabulary, failure-class classifier, ACP monitor failure fact mapping, and stale recovery description/evidence helpers.

Imports/dependencies: ACP monitor constants and stopped-session predicate.

Exports/public surface: `FAILURE_LAYERS`, `FAILURE_SOURCES`, `NORMALIZED_FAILURE_CODES`, `NORMALIZED_FAILURE_CLASSES`, `STALE_RECOVERY_ACTIONS`, `normalizeFailureClass`, `buildFailureFact`, `classifyMonitorFailureFact`, `isDefinitivelyStoppedMonitorState`, `buildStaleRecoveryEvidence`, `describeStaleRecovery`.

Defines: Regex pattern groups for timeout/validation/infra/test/forge failure classes; normalized fact shape builder; stale recovery action descriptions.

Important variables/state: Frozen enum objects only.

Calls out to: `isStoppedSessionState`.

Called by / expected callers: Failure presentation/retry modules, lifecycle/recovery services, tests.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: None.

Authority behavior: Owns shared normalized failure class/code language used by lifecycle, telemetry, and retry logic.

Error/retry/terminal behavior: Pure helpers; no throw paths in scoped source. Unknown inputs fall back to `unknown` class or null monitor fact.

Verification coverage: Behavior `foundations`, `lifecycle-state-surface`, telemetry contract tests.

Findings: None.

### `skills/nova/pipeline/services/failures.js`

Role: Public facade for failure semantics, classification, presentation, and retry policy helpers.

Imports/dependencies: Failure submodules and `failure-semantics.js`.

Exports/public surface: Re-exports all public helpers used by pipeline/module runners and tests.

Defines: Stable import boundary only.

Important variables/state: None.

Calls out to: Re-exports only.

Called by / expected callers: Module runner, pipeline runner, behavior/contract tests, pipeline public surfaces.

Environment variables / CLI inputs / config fields: Delegated.

Paths built/read/written: Delegated.

Authority behavior: Public failure surface; authority lives in submodules.

Error/retry/terminal behavior: Delegated.

Verification coverage: Behavior `foundations`, `module-failures`, `pipeline`, telemetry contract.

Findings: None.

### `skills/nova/pipeline/services/failures/classification.js`

Role: Failure-pattern classifiers, operator guidance map, git push classification, Buster pre-test verdict summarization/classification.

Imports/dependencies: Failure class normalizer and nonblocking incident reporter.

Exports/public surface: `FAIL_PATTERNS`, `FAILURE_CLASS_MAP`, `describeFailure`, `classifyFailPattern`, `classifyGitPushError`, `extractAgentFailReason`, `extractPreTestFailReason`, `parsePreTestVerdict`, `getSuiteFailureDetail`, `classifyPreTestFailure`, `getPassedSuiteNames`, `getFailedSuiteNames`.

Defines: Regex routing for failure pattern codes; structured metadata per failure pattern; Buster pre-test infra/config/code precedence.

Important variables/state: Frozen by convention constants/maps; no mutable module state.

Calls out to: `normalizeFailureClass`, `reportFailureSurfaceIncident`.

Called by / expected callers: Retry policy, module runner Buster phase, behavior tests.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: None.

Authority behavior: Owns string-to-failure-pattern classification and pre-test actionable owner selection. Config/progress pre-test evidence is checked before broad infra regexes.

Error/retry/terminal behavior: Parse failures in pre-test verdict reporting are caught, reported nonblocking, and return empty suite summaries.

Verification coverage: Behavior `foundations`, `module-failures`.

Findings: None.

### `skills/nova/pipeline/services/failures/incidents.js`

Role: Failure-surface nonblocking incident reporter.

Imports/dependencies: Logger, run id helper, noncritical reporting helper.

Exports/public surface: `reportFailureSurfaceIncident`.

Defines: Incident key construction for failure-surface internal diagnostics.

Important variables/state: None.

Calls out to: `reportClassifiedNonBlockingError`, `buildNonBlockingIncidentKey`, `log`, `getRunId`.

Called by / expected callers: Failure classification and presentation helpers.

Environment variables / CLI inputs / config fields: Reads `config.project`, run id fields.

Paths built/read/written: Noncritical reporter/logging delegated.

Authority behavior: Centralizes failure-surface soft error telemetry/reporting keys.

Error/retry/terminal behavior: No local catch; reporter owns nonblocking behavior.

Verification coverage: `check-observability-catch-reporting.mjs`.

Findings: None.

### `skills/nova/pipeline/services/failures/presentation.js`

Role: Discord/operator field presentation, rate-limit embed facade, Nova injection, and module-failure telemetry payload helpers.

Imports/dependencies: Node `fs`/`path`; logger/context; runtime; Discord/gateway integrations; artifact bundle; correlation resolvers; Discord field helper; failure normalizer; rate-limit contract; pre-test classifiers; failure incident reporter.

Exports/public surface: `buildPreTestDiscordFields`, `truncateForDiscord`, `formatRateLimitEmbed`, `injectNeedsNova`, plus internal exports `buildFailureDiscordFields`, `buildModuleFailureTelemetry`, `telemetryCtx`.

Defines: Discord field construction, safe truncation, Nova escalation injection log append, sessions_send payload construction, injection failure Discord alert.

Important variables/state: `EXIT_TIMEOUT = 30`; otherwise local per-call injection log entry.

Calls out to: `gatewayInvoke('sessions_send')`, `discord`, `getPipelineArtifactBundle`, correlation helpers, `reportFailureSurfaceIncident`, `fs.appendFileSync`.

Called by / expected callers: Retry policy, pipeline runner escalation, behavior tests.

Environment variables / CLI inputs / config fields: Reads `process.env.NOVA_CHANNEL`, `config.project`, run id fields, artifact bundle paths.

Paths built/read/written: Appends global and run `nova-injections.jsonl` artifact paths from artifact bundle.

Authority behavior: Operator presentation only; does not decide failure retry policy except injection target/status reporting.

Error/retry/terminal behavior: Missing Nova channel skips injection and writes skipped log entry. Gateway abort during shutdown is treated as delivered. Gateway failure logs WARN and sends CRITICAL Discord alert. Injection log write failures are reported as nonblocking incidents.

Verification coverage: Behavior `discord-correlation`, `pipeline`, telemetry contract.

Findings: None.

### `skills/nova/pipeline/services/failures/retry-policy.js`

Role: Module failure retry policy, max-failure blocking, auto-retry threshold resolution, escalation result construction.

Imports/dependencies: Logger, runtime stats, lifecycle-state transitions, correlation helpers, failure normalizer/classifier, status store, telemetry builders, presentation helpers.

Exports/public surface: `resolveAutoRetryThreshold`, `handleFail`, `buildNovaEscalation`.

Defines: Failure count increment, fail summary append, blocked branch, auto-retry branch, NEEDS_NOVA/TIMEOUT escalation branch.

Important variables/state: Mutates module `status` object: `fail_count`, `fail_summaries`, optional `dispatch_id`, lifecycle status/BLOCKED fields; mutates run stats arrays.

Calls out to: `transitionModuleStatus`, `markModuleBlocked`, `saveStatus`, `onModuleFail`, `onRetryExhausted`, `onModuleBlocked`, `classifyFailPattern`, `buildFailureDiscordFields`, `buildModuleFailureTelemetry`.

Called by / expected callers: Module runner and gate/remediation failure paths.

Environment variables / CLI inputs / config fields: Reads `auto_retry_threshold` from module/gate progress, progress root, config root; `config.project` for resume command; run id fields.

Paths built/read/written: Writes module status through `saveStatus`; no direct path construction.

Authority behavior: Owns module failure terminal decision: block when `fail_count >= maxFails`, auto-retry while below resolved threshold and not timeout, otherwise escalate to Nova/TIMEOUT.

Error/retry/terminal behavior: Save/telemetry failures propagate from awaited calls. Auto-retry returns `_retry:true`; blocked returns exit 20; escalation returns exit 10 or 30.

Verification coverage: `check-telemetry-contract.mjs`, behavior `module-failures`, `pipeline`.

Findings: `P07-ISSUE-001` later resolved the observed guarded status save failure in module failure behavior; no new P18a issue.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `failures.js` | `failure-semantics.js` | constants and normalized helpers | Public facade. |
| `failures.js` | `failures/classification.js` | classifier helpers | Public facade. |
| `failures.js` | `failures/presentation.js` | Discord/Nova presentation helpers | Public facade. |
| `failures.js` | `failures/retry-policy.js` | retry/escalation helpers | Public facade. |
| `classification.js` | `failure-semantics.js` | `normalizeFailureClass` | Pre-test and fail summary classification. |
| `classification.js` | `incidents.js` | `reportFailureSurfaceIncident` | Pre-test verdict parse/summarize soft failures. |
| `presentation.js` | gateway/Discord integrations | `gatewayInvoke`, `discord` | Nova injection and failure alerts. |
| `presentation.js` | artifact/correlation helpers | artifact paths and identity fields | Injection logs and operator fields. |
| `retry-policy.js` | lifecycle/status store | `transitionModuleStatus`, `markModuleBlocked`, `saveStatus` | Failure status authority mutation. |
| `retry-policy.js` | telemetry facade | `onModuleFail`, `onRetryExhausted`, `onModuleBlocked` | Failure telemetry/operator presentation. |
| `retry-policy.js` | `presentation.js` | failure Discord fields and telemetry payloads | Shared presentation payloads. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `normalizeFailureClass` | Timeout/infra/validation/test/forge regex precedence | phase, reason, opts | Normalized failure class | Shared class semantics. |
| `classifyMonitorFailureFact` | ACP monitor reason | `RATE_LIMITED`, `UNKNOWN_STALE_TIMEOUT`, `TRANSCRIPT_ERROR`, `SESSION_TERMINAL` | Retryable/nonretryable failure fact or null | Monitor failure authority. |
| `classifyFailPattern` | Regex match order | Failure text | Pattern code or `unknown` | Operator guidance and retry summary. |
| `classifyGitPushError` | Rejection/auth/network/sync patterns | Git error message | Git failure pattern | Git escalation classification. |
| `classifyPreTestFailure` | Config patterns before infra patterns before code fallback | Redis pre-test verdict/reason | config/infra/code result | Actionable owner precedence. |
| `injectNeedsNova` | Missing channel, gateway abort, gateway failure | channel/env, gateway error text | skipped, ok/ok_aborted, failed plus Discord alert | Nova escalation delivery semantics. |
| `resolveAutoRetryThreshold` | Module/gate/project/config/default precedence | progress/config ids | Threshold value | Retry branch threshold. |
| `handleFail` | `fail_count >= maxFails`, `canAutoRetry`, timeout | status, maxFails, threshold, isTimeout | BLOCKED, `_retry:true`, or Nova/TIMEOUT escalation | Terminal failure policy. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `buildFailureFact` | Failure fact object | layer/code/source/retryable/detail/rest | Defaults then detail then rest fields | Normalized fact shape. |
| `extractPreTestFailReason` | Reason string | Redis entry verdict/reason | Base reason plus up to failed suite summaries | Forge-actionable pre-test reason. |
| `injectNeedsNova` | Injection log entry | Result/correlation/artifact bundle | Build skipped entry then mutate status to ok/ok_aborted/failed | Log entry always appended in finally. |
| `handleFail` | Module status object/file | Failure reason/options | Increment fail_count, append fail summary, transition status, save | Status reflects current failure outcome. |
| `handleFail` | Runtime stats | Terminal branch | Push module id to blocked or failed arrays when stats exist | Aggregate failure stats. |
| `buildNovaEscalation` | Escalation result object | Status/fail summaries/options | Correlation from opts/status, fail history normalized | Exit 10/30 payload with resume command. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `buildPreTestDiscordFields` | Iterate pre-test suites | None | None | All suites classified into passed/failed/skipped field groups. |
| `extractPreTestFailReason` | Iterate failed suites | None | None | Up to available failed suites summarized. |
| `handleFail` | None | None | None | Branches directly to blocked, retry, or escalation. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `process.env.NOVA_CHANNEL` | Environment variable | `injectNeedsNova` | fallback when `novaChannel` argument missing | Target Discord channel for Nova injection. |
| `config.project` | Config field | `injectNeedsNova`, `buildFullPipelineResumeCommand` | Required project id | Injection/resume display. |
| `config._runId`, `config.run_id`, `getRunId(config)` | Runtime id | failure incidents/presentation/retry | Runtime helper fallback | Incident keys, fields, escalation result. |
| `config.auto_retry_threshold` | Config field | `resolveAutoRetryThreshold` | default 2 | Project-level retry threshold. |
| `progress.auto_retry_threshold` | Progress field | `resolveAutoRetryThreshold` | falls back to config/default | Progress-level retry threshold. |
| `progress.modules[id].auto_retry_threshold` | Module field | `resolveAutoRetryThreshold` | highest precedence | Module-specific threshold. |
| `progress.gates[id].auto_retry_threshold` | Gate field | `resolveAutoRetryThreshold` | highest precedence for gate id | Gate-specific threshold. |
| `maxFails` | Runtime input | `handleFail`, `buildNovaEscalation` | Caller-provided | Hard block threshold. |
| `opts.isTimeout`, `opts.autoRetryThreshold`, `opts.progress`, correlation opts | Runtime options | `handleFail`, `buildNovaEscalation` | Caller-provided | Retry/escalation and telemetry context. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| Module `status.json` | status-store path helpers | Module runner/operators | `handleFail` via `saveStatus` | Failure status authority mutation. |
| Global/run `nova-injections.jsonl` | `getPipelineArtifactBundle` | Operators/tests | `injectNeedsNova` | Injection audit log. |
| Discord messages | `injectNeedsNova`, telemetry presentation | Operators | Discord integration | Operator-facing failure/injection notification. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Normalized failure classes/codes | `failure-semantics.js` | Retry policy, lifecycle, telemetry | None. |
| Failure pattern guidance map | `classification.js` | Retry/presentation/operator docs | None. |
| Pre-test failure owner classification | `classifyPreTestFailure` | Buster/module failure paths | None. |
| Module retry/block/escalation decision | `handleFail` | Module runner/pipeline runner | Existing P07 issue for one guarded save behavior path. |
| Nova injection audit | `injectNeedsNova` | Operators/tests | None. |
| Failure-surface nonblocking incidents | `incidents.js` | Core logs/operators | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Failure fact | `buildFailureFact`, `classifyMonitorFailureFact` | `layer`, `code`, `source`, `retryable`, optional `detail` and identity fields | Enum constants/default builder | Lifecycle/recovery/telemetry callers. |
| Failure class/pattern metadata | `FAILURE_CLASS_MAP` | `class`, `recoverability`, `escalation`, `summary`, `guidance` | `describeFailure` fallback | Operator presentation/retry diagnostics. |
| Pre-test classification result | `classifyPreTestFailure` | `kind`, `code`, `summary`, `failureClass`, `detail` | Pre-test regex precedence and `normalizeFailureClass` | Buster/module failure handling. |
| Discord field | `buildPreTestDiscordFields`, `buildFailureDiscordFields` | `name`, `value`, optional `inline` | `truncateForDiscord`; field specs helper | Discord integration. |
| Nova injection log entry | `injectNeedsNova` | `ts`, `run_id`, `status`, `channel`, `step_type`, `step_id`, `module`, optional gate/correlation/fail fields, `error` | Local construction only | Operators/tests. |
| Module failure telemetry payload | `buildModuleFailureTelemetry` | title/status/attempt/correlation/phase/model/duration/cost/session/commit/failure_class/reason | `normalizeFailureClass` | Telemetry builders/sinks. |
| Failure summary entry | `handleFail` | `attempt`, `timestamp`, `summary`, `phase`, `failPattern`, `failure_class`, `is_timeout`, `files_changed` | `classifyFailPattern`, `normalizeFailureClass` | Status file/escalation result. |
| Nova escalation result | `buildNovaEscalation` | `exit`, `run_id`, `module`, `module_dir`, timeout flag, attempt/correlation, reason, fail counts/history, `module_status`, `resume_command` | Local construction/class normalization | Pipeline runner/Nova injection. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Nova Discord/session injection | `injectNeedsNova` | `nova-injections.jsonl` audit paths | Cronjob injected notice with project, module/gate, exit, run/correlation/reason/resume fields | Gateway `sessions_send` to `agent:main:discord:channel:<channelId>` | Best-effort escalation message; log status `ok`, `ok_aborted`, `failed`, or skipped. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `normalizeFailureClass` / classifiers | Unknown/unmatched input | Not error | No retry | Fallback `unknown` or default pattern | None. |
| `parsePreTestVerdict` | Invalid JSON verdict | Soft | No retry | Nonblocking incident; returns empty suites | None. |
| `extractPreTestFailReason` | Failed suite summary generation error | Soft | No retry | Nonblocking incident; base reason returned | None. |
| `injectNeedsNova` | Missing channel | Not error | No retry | Logs INFO, writes skipped entry, returns | None. |
| `injectNeedsNova` | Injection log write failure | Soft | No retry | Nonblocking incident; continues | None. |
| `injectNeedsNova` | Gateway aborted response | Treated as delivered | No retry | Status `ok_aborted`; logs OK | None. |
| `injectNeedsNova` | Gateway send failure | Soft but operator-critical | No retry | Status failed; WARN log; CRITICAL Discord alert attempted | Error message truncated/split first line. |
| `injectNeedsNova` | Discord alert failure | No local catch inside catch branch | No retry | Propagates out before finally append completes? `finally` still appends log | Discord integration owns redaction. |
| `handleFail` | `fail_count >= maxFails` | Terminal | No retry | BLOCKED status, telemetry, exit 20 | Reason truncated for Discord. |
| `handleFail` | Auto-retry allowed | Retryable | No sleep/backoff here | Returns `_retry:true` | Reason truncated for Discord. |
| `handleFail` | Auto-retry exhausted or timeout | Terminal to Nova/operator | No retry here | Telemetry then exit 10/30 escalation | Reason truncated for Discord. |
| `handleFail` | `saveStatus`/telemetry failure | No local catch | No retry | Propagates to caller | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| Classifiers | Unknown/unmatched input | Yes as data | Return value/status payload | `unknown` pattern/class | Classifier | Expected fallback. |
| `parsePreTestVerdict` | Invalid JSON verdict | Yes | Noncritical incident reporter/core log | classification `pretest_verdict_parse_failed` | `reportFailureSurfaceIncident` | Empty suite summary returned. |
| `extractPreTestFailReason` | Summary generation error | Yes | Noncritical incident reporter/core log | classification `pretest_failed_suite_summary_failed` | `reportFailureSurfaceIncident` | Base reason retained. |
| `injectNeedsNova` | Missing channel | Yes | Core log and injection log artifact | INFO skip; `nova-injections.jsonl` status `skipped_no_channel` | `log`, appendInjectionLog | Expected when no channel configured. |
| `injectNeedsNova` | Injection log write failure | Yes | Noncritical incident reporter/core log | classification `nova_injection_log_write_failed` | `reportFailureSurfaceIncident` | Incident key scoped to path. |
| `injectNeedsNova` | Gateway aborted response | Yes | Core log and injection log artifact | status `ok_aborted` | `log`, appendInjectionLog | Treated as delivered. |
| `injectNeedsNova` | Gateway send failure | Yes | Core log, injection log, Discord alert | WARN, status `failed`, CRITICAL Discord | `log`, `discord` | Alert attempt can itself throw. |
| `injectNeedsNova` | Discord alert failure | Indirect | thrown error plus finally injection log | thrown Discord error | Discord integration/caller | No local second-order alert. |
| `handleFail` | Max failures blocked | Yes | Status file, telemetry sink, core log/stats | `module.status_changed`, `retry.exhausted`, `module.blocked`, ERROR | `saveStatus`, telemetry helpers, `log` | Exit 20 result. |
| `handleFail` | Auto-retry | Yes | Status file, telemetry sink, core log | `module.status_changed`, `module.fail`, INFO auto-retry | `saveStatus`, `onModuleFail`, `log` | Returns `_retry:true`. |
| `handleFail` | Escalation/timeout | Yes | Status file, telemetry sink/result | `module.status_changed`, `module.fail`, exit 10/30 result | `saveStatus`, `onModuleFail` | Pipeline may call `injectNeedsNova`. |
| `handleFail` | Save/telemetry failure | Indirect | thrown error | caller-owned | Caller | No local catch. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js runtime | `node` binary | Observed `v24.14.0` during review | All P18a JS modules | ESM, sync fs/path in presentation | No package pin in scoped files. |
| Node `fs`/`path` built-ins | Runtime built-ins | Node major 24 observed | `presentation.js` | Append Nova injection audit logs | Write failures nonblocking incidents. |
| ACP gateway integration | Internal/external Gateway API | Internal | `injectNeedsNova` | `sessions_send` escalation message | Send failure logs/alerts. |
| Discord integration | Internal/external Discord webhook | Internal | `injectNeedsNova`, telemetry presentation | Operator alerts and embeds | Alert failure can propagate. |
| Status store/lifecycle | Internal source | Internal | `handleFail` | Durable module status transition/save | Existing guarded-save issue remains documented. |
| Telemetry facade | Internal source | Internal | `handleFail` | Module fail/retry/block events | Awaited; failures propagate. |
| Noncritical reporting | Internal source | Internal | `incidents.js`, classifiers/presentation | Soft internal failures | Incident-key dedupe/reporting. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Failure classification | Synchronous regex scans | Pattern order fixed in source | Unknown fallback | Return data | None. |
| Discord field truncation | Hard truncation | Caller max/default 1024 | Adds ellipsis | Field value | None. |
| Nova injection log append | Synchronous writes per path | Artifact bundle path count | Write failure reported nonblocking | Incident/log; may continue other path attempts | None. |
| Auto retry threshold | Static threshold check | default 2 | `_retry:true` until exhausted/non-timeout | Status/telemetry/result | None. |
| Max failure threshold | `fail_count >= maxFails` | Caller maxFails | BLOCKED terminal | Status/telemetry/exit 20 | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Nova injection session send | `sessionKey: agent:main:discord:channel:<channelId>`, message lines with project/step/exit/run/correlation/reason/resume | `injectNeedsNova` | Gateway ACP session bridge | One awaited send with 15000 ms gateway timeout | `nova-injections.jsonl`, Discord alert/logs. |
| Failure correlation fields | `dispatch_id`, `gateway_label`, `session_key`, `attempt` | Status/result correlation helpers | Discord fields, telemetry payloads, escalation result | Synchronous field resolution | Telemetry/status/injection artifacts. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Failure public surface exports | behavior `foundations` | Good export coverage | None. |
| Failure semantics and pre-test classification | behavior `foundations`, `module-failures` | Strong behavior coverage | Existing P07 can affect full module-failures rerun. |
| Module failure telemetry/retry/block branches | `check-telemetry-contract.mjs`, behavior `module-failures` | Good targeted coverage | Existing P07 issue. |
| Nova injection correlation/Discord behavior | behavior `discord-correlation`, `pipeline` | Good correlation/pipeline coverage | None. |
| Nonblocking failure-surface incidents | `check-observability-catch-reporting.mjs` | Good source coverage | None. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- `P07-ISSUE-001` was later resolved for the observed guarded `saveStatus` failure path; no new P18a issue.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
