# Batch P21 — Nova notifications, governance, remediation, and lint service

Status: completed
Date started: 2026-05-08
Date completed: 2026-05-08
Reviewer: Nova

## Scope

```text
skills/nova/pipeline/services/governance-context.js
skills/nova/pipeline/services/lint.js
skills/nova/pipeline/services/notification-contract.js
skills/nova/pipeline/services/notification-dispatch.js
skills/nova/pipeline/services/remediation-handoff.js
```

Scope expansion verified live: 5 files, under the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/nova/pipeline/services/governance-context.js
kubeclaw-main/skills/nova/pipeline/services/lint.js
kubeclaw-main/skills/nova/pipeline/services/notification-contract.js
kubeclaw-main/skills/nova/pipeline/services/notification-dispatch.js
kubeclaw-main/skills/nova/pipeline/services/remediation-handoff.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/contracts/check-observability-catch-reporting.mjs
kubeclaw-main/tests/verification/contracts/check-remediation-handoff-surface.mjs
kubeclaw-main/tests/verification/contracts/check-validator-control-result-surface.mjs
kubeclaw-main/tests/verification/behavior/areas/runtime-surface.mjs
kubeclaw-main/tests/verification/behavior/areas/governance.mjs
```

## Per-file map

### `skills/nova/pipeline/services/governance-context.js`

Role: In-memory governance signal store and summary/embed projection helper for architecture validator and approval gates.

Imports/dependencies: Node `path`, logger, runtime run id/stats, architecture validator report extractor.

Exports/public surface: `initGovernanceCtx`, `getGovernanceCtx`, `recordArchValidatorResult`, `recordApprovalGateOutcome`, `buildGovernanceSummary`, `buildGovernanceEmbedFields`.

Defines: `config._governanceCtx` shape, approval timeout policy normalization, swarm-relative governance artifact path normalization, overall governance outcome precedence.

Important variables/state: Mutates `config._governanceCtx.arch_validator` and appends to `config._governanceCtx.approval_gates`.

Calls out to: `extractArchValidatorReport`, `getRunId`, `getRunStats`, `log`.

Called by / expected callers: Pipeline runner start/arch validation, approval gate runner, summary writer, approval embed builder.

Environment variables / CLI inputs / config fields: Reads `config.project`, `config.paths.swarm_dir`, runtime run id/stats, approval identity fields `gate_type`, `run_id`, `project`, `decision_via`, `timeout_policy`, `continued`.

Paths built/read/written: No filesystem writes. Stores summary references for architecture validator, model policy, cost report, pipeline events, approval gate state/request/decision/transitions.

Authority behavior: Owns run-local governance summary projection only; authoritative artifacts remain the validator/approval files referenced in summary.

Error/retry/terminal behavior: No throws for ordinary inputs; token stats embed catch is silent noncritical.

Verification coverage: governance behavior checks for approval timeout/cancelled and arch-validator correlation.

Findings: None.

### `skills/nova/pipeline/services/lint.js`

Role: Wrapper around lint-report.js plus reviewer formatting and pre-check static analysis service.

Imports/dependencies: Node `child_process.execFileSync`, `fs`, `path`, logger, safe path/path helpers.

Exports/public surface: `generateLintReport`, `formatLintReportForReviewer`, `runPreCheck`.

Defines: Node script runner, `/tmp/swarm-pipeline-*` output file naming, changed-file extraction from forge diff stat, lint report parser/logger, reviewer prompt formatter, pre-check pass/fail routing result.

Important variables/state: No module-level mutable state; creates temp output files and optional module lint artifacts.

Calls out to: `node <lint-report.js>`, filesystem reads/writes, `moduleLintLogDir`, `log`.

Called by / expected callers: Module validator adapters, review gate task, tests.

Environment variables / CLI inputs / config fields: Reads `config.pre_check.lint_report_path`, `config.pre_check.semgrep_config_path`, `config.pre_check.enabled`, `config.pre_check.timeout_seconds`, `config.repo_root`, `config.project`, `config._logDir`, module dir/id/status `forge_diff_stat`.

Paths built/read/written: Validates lint report script path; writes temp `/tmp/swarm-pipeline-lint-<tier>-<module>-<ts>-<rand>.json`; optional trace path and `precheck-attempt-<n>.json` under module lint log dir.

Authority behavior: Owns lint/pre-check adapter behavior but not lint-report internals/tool registry.

Error/retry/terminal behavior: Missing lint-report returns `{report:null,error}`. Nonzero lint-report with output is accepted as findings. Crash with no output returns error. Unparseable output returns error. Pre-check disabled passes. Missing report skips pre-check as pass with warning. Errors in report block pre-check with formatted anti-pattern summary.

Verification coverage: validator control-result surface, gates behavior stubs, module-failures behavior.

Findings: `P21-ISSUE-001` — lint temp output files are never removed.

### `skills/nova/pipeline/services/notification-contract.js`

Role: Built-in notification plugin contract/input builder and telemetry/structured-event/Discord sink implementations.

Imports/dependencies: Runtime run id, plugin constants, Discord integration, observability artifact writers, telemetry stream emitter, serialization deep clone.

Exports/public surface: `NOTIFICATION_HOOK_IDS`, `buildNotificationEventInput`, `validateNotificationEventInput`, `assertNotificationEventInput`, `observeTelemetryNotification`, `observeStructuredEventNotification`, `observeDiscordNotification`, `getBuiltinNotificationPluginDefinitions`.

Defines: Canonical notification hook ids, notification input ids/refs/snapshot schema, validation, telemetry sink health map/degraded/restored observability events, built-in plugin definitions for three sinks per hook.

Important variables/state: `_telemetrySinkHealth` map keyed by project/run tracks Redis telemetry degradation/restoration state.

Calls out to: `emitTelemetryStreamEvent`, `appendStructuredEvent`, `appendStructuredEventMirror`, `discord`, `discordEmbeds`, `ctx.coreRuntime.readConfig`.

Called by / expected callers: Plugin registry builtins, notification dispatcher, contract tests.

Environment variables / CLI inputs / config fields: Reads runtime config through `ctx.coreRuntime.readConfig`; event envelope ids/refs/payload/presentation; config project/run id.

Paths built/read/written: Structured event mirror writes via observability service; no direct path construction.

Authority behavior: Owns notification event input schema and built-in notification sink plugin definitions. Telemetry sink health observability is local to this module.

Error/retry/terminal behavior: Invalid inputs throw. Missing plugin context config throws. Telemetry sink failure emits `observability.degraded` once then throws; subsequent success emits `observability.restored`. Structured mirror failure throws. Discord failures propagate to dispatcher.

Verification coverage: critical dynamic imports, runtime-surface notification behavior, observability catch-reporting.

Findings: None.

### `skills/nova/pipeline/services/notification-dispatch.js`

Role: Registry-driven notification hook dispatcher with immutable input snapshots and degraded missing-listener reporting.

Imports/dependencies: Logger, plugin context/capability narrowing, plugin registry resolver, notification contract, observability, telemetry stream, serialization.

Exports/public surface: `dispatchNotificationHook`.

Defines: Notification invocation projection, missing-listener incident keying/deduplication, no-listener degraded event emission, per-listener observe loop.

Important variables/state: `_notificationDispatchIncidents` set deduplicates missing-listener degraded incidents per project/run/stage/reason.

Calls out to: `resolveHookListeners`, `createPluginContext`, `narrowPluginInputForCapabilities`, `appendStructuredEvent`, `emitTelemetryStreamEvent`, listener `implementation.observe`.

Called by / expected callers: Pipeline notification surfaces and runtime behavior tests.

Environment variables / CLI inputs / config fields: Reads `ctx.config`, `ctx.progress`, startup-frozen plugin registry, notification envelope.

Paths built/read/written: No direct path construction; degraded reports use observability/telemetry services.

Authority behavior: Owns notification dispatch ordering and listener failure isolation. It does not own sink internals.

Error/retry/terminal behavior: Invalid input throws before dispatch. Missing listeners emit degraded observability/telemetry once and return `listenerMissing:true`. Listener failures are caught, WARN logged, recorded in results, and dispatch continues to later listeners.

Verification coverage: runtime-surface notification dispatch ordering/failure isolation/missing-listener tests.

Findings: None.

### `skills/nova/pipeline/services/remediation-handoff.js`

Role: Shared gate `request_fix` remediation control-result contract and remediation handoff loop.

Imports/dependencies: `STATUS` constant and serializable clone helper.

Exports/public surface: `buildGateRemediationRequestControlResult`, `readGateRemediationSpec`, `isGateRemediationControlResult`, `validateGateRemediationControlResult`, `validateGateRemediationController`, `resolveGateRemediationController`, `bumpGateRemediationControlResult`, `runGateRemediationHandoff`.

Defines: Typed remediation payload under `diagnostics.typed.remediation`, controller interface contract, retry/fix/evaluate loop.

Important variables/state: Local `controlResult` evolves through loop; no module global state.

Calls out to: Controller callbacks `performFix`, `evaluateGate`, `projectCompatibilityResult`, `buildExhaustedControlResult`.

Called by / expected callers: Shared remediable gate engine, review/Buster gate controls and fix cycles, gate-control-result contract validator.

Environment variables / CLI inputs / config fields: None directly; all policy data arrives in control result/controller arguments.

Paths built/read/written: None.

Authority behavior: Owns gate remediation request schema and loop semantics, while concrete controllers own fix/evaluate/exhausted behavior.

Error/retry/terminal behavior: Invalid controller shape throws. Invalid or exhausted cycle calls typed exhausted control-result builder. Terminal fix outcome without `controlResult` throws. `retry_request_fix` bumps next cycle and continues. Controller errors propagate.

Verification coverage: remediation handoff contract and gate behavior.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| Pipeline runner / approval gate | `governance-context.js` | record/build governance helpers | Summary/embed governance projection. |
| `summary.js` | `governance-context.js` | `buildGovernanceSummary` | Embeds governance section in summary JSON. |
| Module validators / review gate | `lint.js` | `generateLintReport`, `runPreCheck`, formatter | Lint report execution and prompt injection. |
| Registry builtins | `notification-contract.js` | `getBuiltinNotificationPluginDefinitions` | Built-in telemetry/artifact/Discord listeners. |
| `notification-dispatch.js` | `notification-contract.js` | input builder/assertion | Dispatch input schema. |
| `notification-dispatch.js` | Registry/context services | listener resolution and plugin context creation | Registry-driven notification loop. |
| Gate controls/engine | `remediation-handoff.js` | request_fix contract and handoff loop | Shared review/Buster remediation semantics. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `recordArchValidatorResult` | execution failed, blocked, findings length | Extracted report | `ERROR`, `BLOCKED`, `PASSED_WITH_FINDINGS`, `PASSED` | Governance outcome classification. |
| `buildGovernanceSummary` | Arch error/block, approval rejected/cancelled/timeout/continued/all approved | Governance context | Overall governance outcome enum | Summary-level governance semantics. |
| `generateLintReport` | Missing tool, nonzero without output, parse failure | Lint tool path/output file | Report or error object | Lint wrapper failure classification. |
| `runPreCheck` | disabled, no report, zero errors, errors | Config/report summary | Pass, skipped pass, or fail with anti-pattern summary | Pre-Buster static-analysis gate. |
| `validateNotificationEventInput` | Hook/stage/run/ref/time/event/presentation checks | Notification input | Error list or valid input | Notification plugin schema gate. |
| `observeTelemetryNotification` | Redis emit failed/skipped/restored | Telemetry stream result and health map | Degraded throw, restored event, or success | Sink health observability. |
| `dispatchNotificationHook` | No listeners vs listeners; listener throws | Registry/listeners | Degraded missing-listener result or per-listener results | Notification dispatch isolation. |
| `runGateRemediationHandoff` | request_fix, exhausted cycle, terminal fix, retry fix, evaluate | Control result/controller outputs | Continue, exhaust, terminal, or project compatibility | Shared remediation loop. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `initGovernanceCtx` | `config._governanceCtx` | Config | Initialize once; preserve existing | Context has `arch_validator` and `approval_gates`. |
| `recordApprovalGateOutcome` | `approval_gates[]` | Gate identity/status/reason | Append normalized entry; identity overrides config/run fallbacks | Summary has one entry per resolved gate. |
| `buildNotificationEventInput` | Returned input | Envelope/context | Explicit ids/refs beat payload/context fallbacks; deep clones mutable fields | Listener input can be frozen safely. |
| `observeTelemetryNotification` | `_telemetrySinkHealth` | Emit result | First failure records degraded; first success after degraded records restored | One degraded/restored transition per project/run. |
| `dispatchNotificationHook` | Results array and incident set | Listener records/errors | Continue after caught listener failure; missing-listener incidents dedup by key | Later listeners still run. |
| `bumpGateRemediationControlResult` | Cloned control result | Existing result + next cycle | Clone then update remediation policy and gate metric if present | Original result not mutated. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `formatLintReportForReviewer` | Iterate tools/findings | None | Caps rendered findings to 30 per tool | Finishes after tools. |
| `formatLintErrors` | Iterate tools/error findings | None | Caps errors to 20 per tool | Finishes after tools. |
| `generateLintReport` | One external process | None | Timeout 30s pre-check, 120s buster/default full unless `opts.timeoutMs` | Report parsed, missing output, or parse failure. |
| `dispatchNotificationHook` | For each enabled listener | None | None | Always attempts all listeners; catches individual failures. |
| `runGateRemediationHandoff` | While current result is gate `request_fix` | None in service | Cycle compared to `maxFixCycles`; no time deadline | Exhausted, terminal fix, non-request-fix evaluation, or propagated error. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `config._governanceCtx` | Runtime in-memory state | Governance helpers | initialized object | Ephemeral governance projection store. |
| `config.paths.swarm_dir` | Config path | Governance artifact path normalizer | Raw artifact path fallback | Makes validator artifact paths swarm-relative. |
| `config.pre_check.lint_report_path` | Config path | `generateLintReport` | `/app/skills/lint-report.js` | Validated as safe path. |
| `config.pre_check.semgrep_config_path` | Config path | `generateLintReport` | unset | Passed through to lint-report CLI. |
| `config.pre_check.enabled`, `timeout_seconds` | Config fields | `runPreCheck` | enabled, 30s | Pre-check policy. |
| `opts.moduleDir`, `moduleId`, `forgeDiffStat`, `timeoutMs`, `logPath` | Runtime options | `generateLintReport` | optional | Module scoping, changed-files, timeout, trace. |
| Notification envelope `ids`, `refs`, `event`, `presentation`, snapshots | Runtime input | Notification contract/dispatch | Hook/context fallbacks | Notification plugin input schema. |
| Plugin registry `_pluginRegistry` | Runtime config | `notification-dispatch.js` | startup-frozen registry | Listener resolution. |
| Remediation `diagnostics.typed.remediation.policy` | Control result data | `remediation-handoff.js` | Required for request_fix | Fix-cycle policy. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| Architecture validator governance paths | `normalizeGovernanceArtifactPath` | Summary/governance | Validator service, not P21 | P21 stores references only. |
| Approval gate state/request/decision/transitions paths | `recordApprovalGateOutcome` | Summary/governance | Approval gate service, not P21 | P21 stores conventional references. |
| `/tmp/swarm-pipeline-lint-<tier>-<module>-<ts>-<rand>.json` | `tmpFile` | `generateLintReport` | lint-report CLI | P21 issue: not removed after parse. |
| Module lint `precheck-trace-attempt-<n>.jsonl` | `runPreCheck` via `moduleLintLogDir` | Operators/tests | lint-report CLI when log path passed | Trace path. |
| Module lint `precheck-attempt-<n>.json` | `runPreCheck` | Operators | `runPreCheck` | Centralized pre-check report copy. |
| Structured event artifacts | Observability service | Operators | Notification structured-event sink/missing-listener reporter | P21 delegates path authority. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Governance summary context | `governance-context.js` | Summary and approval embeds | Ephemeral only; artifacts remain authoritative elsewhere. |
| Lint/pre-check execution result | `lint.js` wrapper and lint-report tool | Module validators/review gate | P21 temp-file cleanup issue. |
| Notification input schema and built-in sinks | `notification-contract.js` | Registry/dispatcher/listeners | None. |
| Notification listener dispatch | `notification-dispatch.js` | Pipeline hook callers | Listener failures are log/result only by design/test. |
| Gate remediation request schema/loop | `remediation-handoff.js` | Remediable gate engine, gate controls | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Governance context | `initGovernanceCtx` and recorders | `{arch_validator, approval_gates[]}` | Recorder normalization | Summary/embed builders. |
| Arch governance entry | `recordArchValidatorResult` | `ran`, `blocked`, `execution_failed`, `error`, `run_id`, `project`, timestamp, finding counts, `outcome`, artifact paths | `extractArchValidatorReport` plus local counts | Summary governance. |
| Approval governance entry | `recordApprovalGateOutcome` | Gate id/type/title/status, decision fields, timeout policy, continued, paths, recorded time | Local timeout policy normalizer | Summary governance. |
| Lint report wrapper result | `generateLintReport` | `{report: object\|null, error: string\|null}` | JSON parse and lint-report summary assumptions | Module validators/review gate. |
| Pre-check result | `runPreCheck` | `{passed:boolean, report:object\|null, error:string\|null}` | Local report summary check | Module validator adapter. |
| Notification event input | `buildNotificationEventInput` | `refs`, `ids`, `snapshot`, `artifacts`, `summaries`, `stateSnapshot`, `executionContext`, `event`, `presentation`, `occurredAt` | `validateNotificationEventInput` | Notification listeners. |
| Built-in notification plugin definition | `getBuiltinNotificationPluginDefinitions` | `manifest` with moduleId/kind/hookFamily/stageIds/capabilities/defaultEnabled/priority plus `implementation.observe` | Registry plugin validation | Plugin registry. |
| Dispatch result | `dispatchNotificationHook` | `{input,listeners,results,listenerMissing,reason?}`; result entries `{moduleId,ok,error?}` | Dispatcher | Hook callers/tests. |
| Remediation request control result | `buildGateRemediationRequestControlResult` | Typed gate result with `nextAction:'request_fix'`, diagnostics findings/metadata, `typed.gate`, `typed.remediation` policy/correlation/diagnostics | `validateGateRemediationControlResult` | Remediable gate engine. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Reviewer lint block | `formatLintReportForReviewer` | Injected into review gate prompt by caller; no file written here | Static analysis summary with tool sections, changed files, findings capped at 30 per tool | N/A in scoped file | Markdown block beginning `## 📊 STATIC ANALYSIS REPORT (Automated)`. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `buildGovernanceEmbedFields` | Run stats read failure | No | None | Silent non-critical catch | None. |
| `generateLintReport` | Missing lint-report script | No | None | Returns `{report:null,error}` and WARN log | None. |
| `generateLintReport` | Lint-report process crash without output | No local retry | 30s/120s/opts timeout | Returns error and WARN log | None. |
| `generateLintReport` | Nonzero lint-report with output | N/A | Same process timeout | Treats as expected findings and parses report | None. |
| `generateLintReport` | Unparseable output | No | None | Returns error and WARN log | None. |
| `runPreCheck` | Disabled/missing report | N/A | Config timeout if run | Disabled passes; missing report passes with WARN | None. |
| `runPreCheck` | Static analysis errors | No | One lint report run | Returns `passed:false` with formatted error summary | None. |
| `assertNotificationEventInput` | Invalid notification input | No | None | Throws before dispatch | Deep clone only, no redaction. |
| `observeTelemetryNotification` | Redis telemetry emit failure | No local retry | One emit attempt | Emits degraded artifact, throws to dispatcher | None. |
| `observeTelemetryNotification` | Redis telemetry restored | N/A | One restore emit | Emits restored artifact/telemetry | None. |
| `observeStructuredEventNotification` | Artifact mirror failure | No | One append attempt | Throws to dispatcher | None. |
| `observeDiscordNotification` | Discord failure | No | One send attempt | Throws to dispatcher | Discord integration owns sanitization. |
| `dispatchNotificationHook` | Missing listeners | No | One degraded report; deduped by key | Returns `listenerMissing:true`; no fallback direct lifecycle emission | None. |
| `dispatchNotificationHook` | Listener failure | No | No retry; continues next listener | WARN log and per-listener `{ok:false}` result | None. |
| `resolveGateRemediationController` | Invalid controller shape | No | None | Throws | None. |
| `runGateRemediationHandoff` | Exhausted/invalid cycle | No | Cycle cap from remediation policy | Calls typed exhausted result builder | None. |
| `runGateRemediationHandoff` | Terminal fix outcome without control result | No | None | Throws | None. |
| `runGateRemediationHandoff` | Controller callback failure | Caller-boundary retry only | No local retry | Propagates | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `buildGovernanceEmbedFields` | Stats read failure | None locally | None | none | N/A | Silent by design. |
| `generateLintReport` | Missing/crashed/unparseable tool | Yes, log only | Pipeline stdout/log | WARN lint messages | `log` | Caller sees returned error. |
| `runPreCheck` | Disabled/missing report/errors | Yes, log and returned result; report artifact when available | Logs and module lint JSON | INFO/WARN/OK messages; `precheck-attempt-<n>.json` | `log`, `fs.writeFileSync` | Missing report passes intentionally. |
| `assertNotificationEventInput` | Invalid input | None locally | Thrown error | none | N/A | Caller/plugin boundary owns telemetry. |
| `observeTelemetryNotification` | Redis emit failure | Yes | Structured event artifact | `observability.degraded` | `appendStructuredEvent` | Throws after degraded evidence. |
| `observeTelemetryNotification` | Redis restored | Yes | Structured event artifact and telemetry stream | `observability.restored` | `appendStructuredEvent`, `emitTelemetryStreamEvent` | Restoration evidence. |
| `observeStructuredEventNotification` | Mirror failure | None locally beyond thrown error | Thrown error to dispatcher | none | N/A | Dispatcher logs listener degraded. |
| `observeDiscordNotification` | Discord failure | None locally beyond thrown error | Thrown error to dispatcher | none | N/A | Dispatcher logs listener degraded. |
| `dispatchNotificationHook` | Missing listeners | Yes | Structured event artifact, telemetry stream, WARN log | `observability.degraded` | `appendStructuredEvent`, `emitTelemetryStreamEvent`, `log` | Deduped by incident key. |
| `dispatchNotificationHook` | Listener failure | Yes, log and result only | Pipeline stdout/log and returned result | WARN `[notification] listener ... degraded` | `log` | Runtime behavior test expects degrade-past-failure. |
| `resolveGateRemediationController` / handoff | Invalid controller/exhausted/terminal/controller errors | None locally | Thrown/returned control result | none | N/A | Gate engine/caller owns telemetry. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js runtime | `node` binary | Observed `v24.14.0` during review | All P21 JS modules | ESM, child_process, fs/path, object freeze/clone | No package pin in scoped files. |
| Lint-report Node script | `config.pre_check.lint_report_path` default `/app/skills/lint-report.js` | Internal CLI script | `lint.js` | Static analysis JSON report | Missing/crash returns nonterminal error; temp output cleanup issue. |
| Git/FS workspace | Filesystem | Internal | `lint.js`, governance paths | Lint artifacts and governance references | Lint tool output files left in `/tmp`. |
| Redis telemetry stream | Internal/external Redis | Internal | Notification telemetry sink/dispatch degraded reports | Notification telemetry and observability | Failures produce degraded observability. |
| Discord integration | Internal/external webhook | Internal | Notification Discord sink | Operator notifications | Failures become listener degraded results. |
| Plugin registry/context | Internal source | Internal | Notification dispatch | Listener resolution/capability narrowing | Missing listeners produce degraded incident. |
| Gate remediation controllers | Internal gate runner factories | Internal | Remediation handoff | Concrete fix/evaluate behavior | Controller errors propagate. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Lint-report execution | One synchronous child process per call | 30s pre-check, 120s buster/default full, override `opts.timeoutMs`; maxBuffer 50 MiB | Blocks caller until completion/timeout; crash without output returns error | Logs/result/report | Temp output files accumulate: P21-ISSUE-001. |
| Reviewer lint formatting | Caps findings in prompt | 30 findings per tool; 20 errors/tool for pre-check summary | Extra findings summarized as count | Prompt text | None. |
| Notification listeners | Sequential loop sorted by registry priority/module id | Registry priority | Listener failure logged and loop continues | Result array/WARN log | None. |
| Missing notification listener incidents | Dedup set in process memory | Key project/run/stage/reason | First emits degraded event; repeats suppressed | `observability.degraded` | Set not persisted across restart. |
| Telemetry sink health | In-memory map by project/run | Process lifetime | First failure degraded; later success restored | Observability events | None. |
| Remediation handoff loop | `while request_fix` | `maxFixCycles` and `nextFixCycle` in control result | Exhausted builder when cycle invalid or over cap | Gate control result/caller telemetry | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Notification hook input | `{refs, ids, snapshot, artifacts, summaries, stateSnapshot, executionContext, event, presentation, occurredAt}` | `buildNotificationEventInput` | Notification listener plugins | Synchronous dispatch; frozen input per hook | Listener result array. |
| Telemetry notification stream event | Event type and payload from notification input; options `emittedAt`, `emitter`, `runId` | `observeTelemetryNotification` | Redis telemetry stream | One emit attempt; degraded/restored health events | Telemetry stream event and structured artifacts. |
| Structured event mirror | Event payload plus `seq`, `ts`, `run_id`, `project`, `source`, `emitter` | `observeStructuredEventNotification` | Pipeline JSONL artifact | One append attempt | Structured event artifact. |
| Notification degraded incident | `observability.degraded` payload with component/surface/reason/detail/hook/stage/module/gate/attempt | `notification-dispatch.js` | Observability artifacts/telemetry stream | Deduped by in-memory key | Degraded event/log. |
| Gate remediation control result | Typed gate result with `diagnostics.typed.remediation` policy/correlation | Gate controls via remediation helper | Remediable gate engine/controllers | Loop bounded by max fix cycles | Control result projection. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Notification dispatch ordering/failure/missing-listener behavior | runtime-surface behavior | Good | No regression for every built-in sink failure path, but contract catch-reporting covers patterns. |
| Notification contract static imports/no dynamic active path | `check-critical-dynamic-imports.mjs` | Good | None. |
| Observability catch-reporting patterns | `check-observability-catch-reporting.mjs` | Broad pattern check | Does not assert lint temp cleanup. |
| Remediation handoff surface and typed request_fix contract | `check-remediation-handoff-surface.mjs` | Good | None. |
| Pre-check/module validator adapter | `check-validator-control-result-surface.mjs`, module-failures behavior | Good | Temp file cleanup not covered. |
| Governance summary outcomes/correlation | governance behavior | Good | None. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- `P21-ISSUE-001` — lint-report temp output files are never removed.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
