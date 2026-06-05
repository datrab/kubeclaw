# Batch V03b — Behavior verification runtime monitor, shutdown, summaries, telemetry, and transcripts

Status: completed
Date started: 2026-05-09
Date completed: 2026-05-09
Reviewer: Nova

## Scope

```text
tests/verification/behavior/areas/runtime-monitor.mjs
tests/verification/behavior/areas/shell-boundary.mjs
tests/verification/behavior/areas/shutdown-integration.mjs
tests/verification/behavior/areas/summaries.mjs
tests/verification/behavior/areas/telemetry-docs.mjs
tests/verification/behavior/areas/telemetry-schema.mjs
tests/verification/behavior/areas/telemetry.mjs
tests/verification/behavior/areas/transcript-monitor.mjs
```

Scope expansion verified live: 8 files, under the 10-file maximum. The scoped files were read end to end in the main session before conclusions were written.

## Sources checked

Implementation files:

```text
kubeclaw-main/tests/verification/behavior/areas/runtime-monitor.mjs
kubeclaw-main/tests/verification/behavior/areas/shell-boundary.mjs
kubeclaw-main/tests/verification/behavior/areas/shutdown-integration.mjs
kubeclaw-main/tests/verification/behavior/areas/summaries.mjs
kubeclaw-main/tests/verification/behavior/areas/telemetry-docs.mjs
kubeclaw-main/tests/verification/behavior/areas/telemetry-schema.mjs
kubeclaw-main/tests/verification/behavior/areas/telemetry.mjs
kubeclaw-main/tests/verification/behavior/areas/transcript-monitor.mjs
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/docs/pipeline/implementation-map/README.md
kubeclaw-main/docs/pipeline/implementation-map/batch-template.md
kubeclaw-main/docs/open-issues.md
kubeclaw-main/skills/nova/pipeline/tools/project-summary.js
```

## Per-file map

### `tests/verification/behavior/areas/runtime-monitor.mjs`

Role: Behavior area for ACP monitor state classification, gateway-unreachable observability, Nova/Buster consumers of explicit monitor state, and Buster rate-limit recovery across gateway outages.

Imports/dependencies: Injected behavior harness deps, fake gateway, fake Redis, runtime materializer/importer, monitor service, Buster rate-limit/telemetry/pipeline modules, source readers, and filesystem/temp helpers.

Exports/public surface: `registerRuntimeMonitorArea(deps)`.

Defines: 3 records covering running/closed/unreachable/rate-limited monitor states, source-text consumer wiring, and Buster rate-limit recovery telemetry.

Important variables/state: Fake gateway state responses; transcript JSONL files; `global.fetch` override for 503 cooldown liveness probe; Buster telemetry context; fake Redis stream events.

Calls out to: `monitorMod.getAcpMonitorState`, Buster `handleRateLimit`, Buster `monitorSession`, telemetry `closeTelemetry`, and source-text assertions for polling, telemetry, Buster session monitor, and orchestration files.

Called by / expected callers: `tests/verification/behavior/verify.mjs` when `runtime-monitor` is selected.

Environment variables / CLI inputs / config fields: No direct env reads in scoped file; fixture configs use `project`, `module_id`, `task_type`, `dispatch_id`, `attempt`, `rate_limit.max_pauses`, `acp_monitor.poll_ms`, `unknown_poll_limit`, `stale_poll_limit`, telemetry context, and gateway URL options.

Paths built/read/written: Temp transcript JSONL files; temp Buster log dir with `discord.jsonl`; fake Redis stream `pipeline:telemetry:<project>:<runId>`.

Authority behavior: Gateway-unreachable state remains explicit and does not silently convert to terminal session death. Buster rate-limit recovery resumes monitoring with degraded/restored telemetry instead of killing the session on gateway outage.

Error/retry/terminal behavior: Unreachable gateway with transcript progress remains active; rate-limited transcript marks rate-limited; Buster cooldown probe 503 returns `action:'resume'` with `gatewayUnreachable:true`; later closed session restores observability.

Verification coverage: Strong runtime behavior and source wiring checks for monitor state and Buster gateway outage recovery.

Findings: None found in scoped file.

### `tests/verification/behavior/areas/shell-boundary.mjs`

Role: Behavior area for shell-injection boundaries, argv-safe command execution, Kubernetes manifest structural rewrites, Buster base image validation, and sandbox cleanup policy/resource scoping.

Imports/dependencies: Injected harness deps, runtime materializer/importer, source reader, `execFileSync`, temp filesystem, and a local js-yaml shim backed by Python `yaml`.

Exports/public surface: `registerShellBoundaryArea(deps)`.

Defines: `installPyYamlBackedJsYaml(runtimeRoot)` and 13 records covering high-risk suite command source checks, k8s manifest transforms, unit/bundle path rejection, project-summary git `-C` literal paths, podman base-image calls, and sandbox cleanup policies.

Important variables/state: Fake command call arrays for podman/kubectl/nginx; sandbox cleanup state files; temp git repos and semicolon-bearing paths; Kubernetes YAML documents; tracked sandbox resources.

Calls out to: Buster suite modules `build.js`, `k8s.js`, `unit.js`, `bundle.js`, Buster `ensureBaseImages`/`validateBaseImageRef`, project-summary `generateSummary`, and sandbox cleanup `trackSandboxResources`/`cleanupSandboxResources`/`getCleanupStatePath`.

Called by / expected callers: `tests/verification/behavior/verify.mjs` when `shell-boundary` is selected.

Environment variables / CLI inputs / config fields: No direct env reads. Fixture configs use `bundle.www_dir`, `unit.test_cmd`, project summary `configPath`, Buster cleanup `cleanupPolicy`, and payload fields `project`, `module_id`, `attempt`, `run_id`.

Paths built/read/written: Temp repos/dirs under `os.tmpdir()`; YAML manifests; sandbox `www`, `results`, cleanup state files; tracked resource state under sandbox root.

Authority behavior: Shell boundaries are argv-based, not shell-string based. K8s namespace/image rewrites are structural. Sandbox cleanup acts only on tracked resources or bounded startup output dirs depending on cleanup policy.

Error/retry/terminal behavior: Shell metacharacter test commands and disallowed bundle output paths reject before execution. Base image inspect/system errors do not pull. Cleanup policy denial returns evidence without destructive calls. Cleanup failure preserves tracked resources for retry.

Verification coverage: Strong source and behavior assertions for argv safety and cleanup scope.

Findings: None found in scoped file.

### `tests/verification/behavior/areas/shutdown-integration.mjs`

Role: Behavior area for Nova shutdown/reaper integration and single lifecycle tracking authority.

Imports/dependencies: Injected harness deps, runtime materializer/importer, source reader, orchestration/lifecycle/shutdown modules.

Exports/public surface: `registerShutdownIntegrationArea(deps)`.

Defines: One record, `Nova shutdown/reaper integration stays wired through orchestration`.

Important variables/state: Source text checks and imported shutdown/lifecycle module exports.

Calls out to: `importRuntimeModule(.../agents/shutdown.js)` and lifecycle module functions.

Called by / expected callers: `tests/verification/behavior/verify.mjs` when `shutdown-integration` is selected.

Environment variables / CLI inputs / config fields: Source assertions reject legacy `GATEWAY_URL`/`GATEWAY_TOKEN` strings in shutdown; no direct env mutation in scoped file.

Paths built/read/written: Reads orchestration/shutdown/lifecycle source through overlay reader; no writes.

Authority behavior: Agent tracking belongs to lifecycle, while shutdown owns reaper/kill integration. Legacy sync cleanup exports and direct curl execution are absent.

Error/retry/terminal behavior: Source/import drift fails the behavior record; no runtime retry logic in scoped file.

Verification coverage: Focused source/API surface coverage for shutdown wiring.

Findings: None found in scoped file.

### `tests/verification/behavior/areas/summaries.mjs`

Role: Behavior area for project summary, pipeline review, case study, and pipeline summary lifecycle telemetry, Discord audit mirroring, artifact paths, rate-limit/no-output/poll-exception handling, and stale lifecycle normalization.

Imports/dependencies: Node fs/os/path/assert, fake Redis helpers, runtime materializer/importer, summary/case-study/rate-limit/pipeline runner/runtime modules, built-in registry, and typed pipeline step result helpers.

Exports/public surface: `registerSummariesArea(deps)`.

Defines: `buildBuiltInRegistry(runtimeRoot)`, `withStubbedGeneratorStages(registry)`, `getFieldValue(fields, name)`, `makeStepResult(...)`, and 22 records.

Important variables/state: Temp `.swarm/logs`; run log dirs; fake Redis stream events; Discord call arrays and audit JSONL; summary/case-study/pipeline-review test overrides; module status fixtures; run summary artifacts; tracked/killed/untracked session arrays.

Calls out to: `generatePipelineReview`, `generateCaseStudy`, `generateProjectSummary`, `finalizeSummarySessionRateLimitExit`, `buildSessionRateLimitExhaustedResult`, and `runPipeline`.

Called by / expected callers: `tests/verification/behavior/verify.mjs` when `summaries` is selected.

Environment variables / CLI inputs / config fields: Temporarily sets/restores `DISCORD_WEBHOOK` in one project-summary tool record. Fixture configs use `project`, `repo_root`, `paths.swarm_dir`, `paths.project_summary_js`, `telemetry.enabled`, `_runId`/`run_id`, `_runStats`, `_pluginRegistry`, `_logDir`, `_runLogDir`, `_disable_discord_webhooks`, `discord_webhook_url`, `rate_limit.max_pauses_per_module`, `case_study.enabled`, `pipeline_review.model`, and `_testOverrides` for summary surfaces.

Paths built/read/written: `.swarm/logs/pipeline/project-summary.md`, `project-summary.json`, `case-study.base.json`, `case-study.md`, `summary.json`, `latest.json`, run-scoped `summary.json`, `discord.jsonl`, pipeline review transcript archives under `.swarm/logs/pipeline-review`, and module `status.json` files.

Authority behavior: Summary lifecycle uses canonical `summary.started`/`summary.completed` events for pipeline, pipeline-review, case-study, and project-summary. Summary artifact paths are authoritative run/top-level join points. Display labels do not become `gateway_label` where canonical gateway identity is absent.

Error/retry/terminal behavior: Covers rate-limit exhaustion, no-output/terminal-detail failures, poll exceptions with exactly-once session cleanup, project-summary failures, and pipeline halt summaries. Existing P18b gateway-label fallback behavior remains applicable because scoped records still assert null `gateway_label` despite fallback inputs.

Verification coverage: Strong behavior assertions for summary telemetry, Discord audit mirroring, session cleanup, and artifact correlation.

Findings: No new actionable issue found; P18b-ISSUE-001 remains applicable to summary gateway-label fallback behavior.

### `tests/verification/behavior/areas/telemetry-docs.mjs`

Role: Behavior area for telemetry documentation consistency across lifecycle contract, implementation checklist, observability reference, configuration docs, progress docs, and Buster docs/code.

Imports/dependencies: Injected harness deps, `contractPath`, filesystem, source reader.

Exports/public surface: `registerTelemetryDocsArea(deps)`.

Defines: 9 records covering Redis artifact paths, canonical stream naming, summary event names, reference docs envelope/event names, stream key docs, Redis outage fallback docs, and model policy docs.

Important variables/state: Read-only docs/source text.

Calls out to: `fs.readFileSync` over docs and Buster/Nova source text.

Called by / expected callers: `tests/verification/behavior/verify.mjs` when `telemetry-docs` is selected.

Environment variables / CLI inputs / config fields: No direct env reads. Checks documented fields such as `telemetry.stream_key`, canonical `pipeline:telemetry:<project>:<run_id>`, and model policy defaults.

Paths built/read/written: Reads lifecycle contract, implementation checklist, observability/pipeline/config/progress docs, project setup guide, Buster README, Buster pipeline and telemetry source. No writes.

Authority behavior: Docs preserve canonical flat telemetry envelope, event inventory, stream ownership, summary events, and fallback artifact paths.

Error/retry/terminal behavior: Documentation drift fails behavior records; no runtime retry logic.

Verification coverage: Strong source/doc text assertions for telemetry docs.

Findings: None found in scoped file.

### `tests/verification/behavior/areas/telemetry-schema.mjs`

Role: Behavior area for telemetry schema/event inventory alignment and event-specific payload field documentation.

Imports/dependencies: `assertTelemetrySchemaHotspotAuthority`, `extractContractEventNames`, `extractTelemetrySchemaEventNames` from lifecycle audit lib plus injected harness deps and source readers.

Exports/public surface: `registerTelemetrySchemaArea(deps)`.

Defines: 18 records covering canonical inventory alignment and hotspot payload sections for pipeline, error, observability, retry, module status, summary, budget, cost, approval, transcript/progress, Buster task, rate-limit, gate verdict, and retry exhaustion events.

Important variables/state: Read-only telemetry schema and lifecycle contract event-name sets; Buster source text for child-session lifecycle events.

Calls out to: lifecycle audit helpers and docs/source reads.

Called by / expected callers: `tests/verification/behavior/verify.mjs` when `telemetry-schema` is selected.

Environment variables / CLI inputs / config fields: No direct env reads. Checks documented payload fields and examples.

Paths built/read/written: Reads `docs/telemetry-event-schema.md`, lifecycle contract, and Buster source files. No writes.

Authority behavior: Lifecycle contract owns canonical event names; telemetry-event schema owns event-by-event payload fields and examples.

Error/retry/terminal behavior: Missing/stale schema events or hotspot field drift fails records; no runtime retry logic.

Verification coverage: Strong documentation contract coverage. Existing P16 remains relevant because this is documentation authority, not a centralized runtime validator.

Findings: No new actionable issue found; P16-ISSUE-001 remains applicable.

### `tests/verification/behavior/areas/telemetry.mjs`

Role: Behavior area for Redis completion identity/adjudication/archive behavior, Buster/Nova telemetry emission and fallback artifacts, ACP observability, Redis completion degraded/restored telemetry, gate rate-limit telemetry, shared sequence, terminal-owned rate-limit handling, and packaged ioredis resolution.

Imports/dependencies: Injected fake Redis/gateway/helpers, runtime materializer/importer, pipeline Redis module, orchestration, telemetry, polling, gate runner, Buster telemetry/rate-limit modules, status-store/runtime modules, and filesystem/temp helpers.

Exports/public surface: `registerTelemetryArea(deps)`.

Defines: Local `buildBuiltInRegistry(runtimeRoot)` and 18 records.

Important variables/state: Fake Redis streams and sequence counters; temp `.swarm/logs` and run log dirs; fake Redis adapter modules under `~/.openclaw/tmp`; Buster/Nova telemetry contexts; fake Redis completion entries; fake gate output files; status files; Discord call arrays.

Calls out to: `buildBusterPayload`, `matchesCompletionIdentity`, `selectLatestCompletion`, `scanLatestCompletionFromTail`, `archiveCompletionsChunked`, `archiveModuleCompletions`, `pollDual`, `runBusterGate`, Buster/Nova `emitEvent`, Buster `createTelemetryContext`/`closeTelemetry`, `observeAcpMonitorSurfaces`, and `isTerminalOwnedRateLimitedOutcome`.

Called by / expected callers: `tests/verification/behavior/verify.mjs` when `telemetry` is selected.

Environment variables / CLI inputs / config fields: Temporarily sets `OPENCLAW_GATEWAY_URL`, `BEHAVIOR_POLLDUAL_STATUS_PATH`, `BEHAVIOR_POLLDUAL_RUN_ID`, `BEHAVIOR_BUSTER_GATE_OUTPUT_PATH`. Fixture configs use `project`, `repo_root`, `telemetry.enabled`, `_runId`/`run_id`, `_runStats`, `_pluginRegistry`, `_logDir`, `_runLogDir`, `paths.swarm_dir`, `agents.buster.dispatch`, `agents.buster.redis_js_path`, `rate_limit.max_pauses_per_module`, and gate/module progress config.

Paths built/read/written: `.swarm/logs/pipeline/pipeline.jsonl`, run-scoped `pipeline.jsonl`, Buster `telemetry-fallback.jsonl`, run `buster-telemetry-fallback.jsonl`, fake Redis adapter modules, module `status.json`, gate output JSON, Redis completion streams and archive streams.

Authority behavior: Completion identity requires run/attempt/dispatch. Canonical completion source is `buster-pipeline`; legacy `agent` completions are ignored. Same-identity conflicting completions become conflict diagnostics; same-outcome duplicates are idempotent diagnostics. Buster/Nova share run-global Redis seq.

Error/retry/terminal behavior: Redis init/import/read/archive failures emit explicit degraded telemetry or fallback artifacts. Disabled telemetry emits no degraded fallback by design. Buster Pipeline-owned RATE_LIMITED completions are terminal ownership and do not start a second cooldown owner.

Verification coverage: Strong behavior coverage for telemetry runtime, completion authority, fallback/degraded observability, archive batching, and rate-limit terminal ownership. Existing P16/P17 remain applicable.

Findings: No new actionable issue found; P16-ISSUE-001 and P17-ISSUE-001 remain applicable.

### `tests/verification/behavior/areas/transcript-monitor.mjs`

Role: Behavior area for ACP transcript delta monitoring, idle grace, verify-agent-alive fallback behavior, duplicate warning suppression, and gateway observability restore/degrade telemetry.

Imports/dependencies: Injected harness deps, fake Redis, fake gateway, runtime materializer/importer, monitor/orchestration/lifecycle/runtime modules.

Exports/public surface: `registerTranscriptMonitorArea(deps)`.

Defines: Local `buildBuiltInRegistry(runtimeRootForRegistry)` and 5 records.

Important variables/state: Transcript JSONL files with byte offsets; fake gateway session states; lifecycle tracked agent transcript state; `console.error` capture; `OPENCLAW_GATEWAY_URL` save/restore; fake Redis streams.

Calls out to: `readAcpTranscriptState`, `waitForSessionIdle`, `verifyAgentAlive`, `trackAgent`, `getTrackedAgent`, `untrackAgent`, and source text checks for polling-session-end.

Called by / expected callers: `tests/verification/behavior/verify.mjs` when `transcript-monitor` is selected.

Environment variables / CLI inputs / config fields: Temporarily sets `OPENCLAW_GATEWAY_URL` and overrides/restores `console.error`. Fixture configs use `project`, `repo_root`, `telemetry.enabled`, `agents.forge.cwd`, `_logDir`, `_runLogDir`, `_runId`/`run_id`, `_runStats`, `_pluginRegistry`, and tracked agent metadata fields.

Paths built/read/written: Temp transcript JSONL files; temp `.swarm/logs`; fake Redis stream `pipeline:telemetry:<project>:<runId>`.

Authority behavior: Transcript monitor reads appended deltas only and preserves state. Session idle uses transcript grace on unreachable gateway. Verify-agent-alive uses tracked transcript state as fallback but emits gateway observability telemetry.

Error/retry/terminal behavior: Unknown session with transcript progress returns alive with one fallback warning and degraded/restored events; unknown session with no transcript progress emits degraded and returns false.

Verification coverage: Strong behavior coverage for transcript delta state and gateway observability around ACP health checks.

Findings: None found in scoped file.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `verify.mjs` | V03b areas | `register*Area(sharedAreaDeps)` | Registers the eight selected behavior areas. |
| `runtime-monitor.mjs` | monitor/Buster runtime | `getAcpMonitorState`, `handleRateLimit`, `monitorSession` | Gateway-unreachable and rate-limit recovery behavior. |
| `shell-boundary.mjs` | suites/cleanup/runtime | `renderManifestForK8sSuite`, `unit`, `bundle`, `ensureBaseImages`, `cleanupSandboxResources` | Shell-safe execution and cleanup scope. |
| `shutdown-integration.mjs` | shutdown/lifecycle/orchestration | `reaperAfterKill`, `killSession`, lifecycle tracking exports | Shutdown wiring contract. |
| `summaries.mjs` | summary/case-study/rate-limit/pipeline | `generatePipelineReview`, `generateCaseStudy`, `generateProjectSummary`, `runPipeline` | Summary telemetry/artifact/Discord behavior. |
| `telemetry-docs.mjs` / `telemetry-schema.mjs` | docs/contracts/source | text/schema helper checks | Documentation authority checks. |
| `telemetry.mjs` | telemetry/Redis/polling/gate runtime | Redis completion selection/archive, `emitEvent`, `pollDual`, `runBusterGate` | Telemetry runtime authority. |
| `transcript-monitor.mjs` | monitor/orchestration/lifecycle | `readAcpTranscriptState`, `waitForSessionIdle`, `verifyAgentAlive` | Transcript fallback and observability. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `runtime-monitor.mjs getAcpMonitorState` | gateway running/closed/unreachable/transcript rate-limited | gateway state, transcript lines | running, terminal, active degraded, or rate-limited | Keeps gateway outage explicit. |
| `shell-boundary.mjs` suite/cleanup records | shell metacharacter/path/resource policy | source text, paths, cleanup policy | reject, literal argv execution, or scoped cleanup | Prevents command injection/destructive cleanup. |
| `summaries.mjs` summary flows | rate-limited, no-output, poll exception, success/halt | poll result, session/correlation, output artifacts | retry exhausted, failure, cleanup, summary telemetry | Summary terminal authority. |
| `telemetry.mjs` completion selection | identity match/source/conflict/duplicates | run/attempt/dispatch/source/status | select, ignore, conflict, or idempotent duplicate | Redis completion authority. |
| `telemetry.mjs` telemetry init/read/archive | Redis unavailable/import/read/archive fails | Redis adapter/fake Redis errors | fallback artifact or degraded/restored event | Observability on transport failures. |
| `transcript-monitor.mjs` verifyAgentAlive | unknown gateway with transcript progress vs none | tracked transcript delta state | alive with degraded/restored or false with degraded | ACP health fallback semantics. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `summaries.mjs` summary generators | summary artifacts, Discord JSONL, Redis telemetry | summary output/poll status/session identity | canonical summary started/completed events and run/top-level artifact paths | Joinable summary artifacts. |
| `telemetry.mjs` completion archive | active and archive Redis streams | module/gate identity and active dispatch | move only matching stale entries; preserve active identity | Bounded archive and active dispatch preservation. |
| `shell-boundary.mjs` cleanup | sandbox tracked resource state | cleanup phase/policy/resources | task-scoped, startup sweep, disabled, failure-preserve | No sibling/untracked cleanup. |
| `transcript-monitor.mjs` transcript state | tracked agent transcript state | byte offset/event count/new lines | only appended lines update state | No duplicate transcript processing. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `runtime-monitor.mjs monitorSession` | Buster ACP monitor state queue | `acp_monitor.poll_ms` in fixture | unknown/stale limits | closed terminal or rate-limit/degraded/restored flow. |
| `summaries.mjs` summary polling | `pollForFile` returns rate limit/no output/throws | fixture `sleep` is no-op | max pauses from rate-limit config | output, no-output, rate-limit exhausted, exception cleanup. |
| `telemetry.mjs` Redis completion tail/archive | scan batches until limit/end | none | `batchSize`, `scanLimit`, archive maxlen | match/conflict/end of stream/archive complete. |
| `transcript-monitor.mjs waitForSessionIdle` | gateway unavailable but transcript active | `pollMs`, transcript grace | `totalTimeoutMs`, `extraGraceMs`, `transcriptGraceMs`, max extensions | idle/grace exhausted. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `OPENCLAW_GATEWAY_URL` | Env var | `telemetry.mjs`, `transcript-monitor.mjs` via gateway runtime | fake gateway URL | Temporarily set/restored. |
| `DISCORD_WEBHOOK` | Env var | project-summary tool Discord path | example invalid webhook | Temporarily set/restored. |
| `BEHAVIOR_POLLDUAL_STATUS_PATH`, `BEHAVIOR_POLLDUAL_RUN_ID`, `BEHAVIOR_BUSTER_GATE_OUTPUT_PATH` | Env vars | fake Redis adapter modules in `telemetry.mjs` | temp paths/run id | Test-only adapter coordination. |
| `telemetry.enabled`, `_runId`/`run_id`, `_runStats`, `_pluginRegistry`, `_logDir`, `_runLogDir` | Runtime config | runtime-monitor/summaries/telemetry/transcript areas | per fixture | Telemetry identity and artifact roots. |
| `rate_limit.max_pauses_per_module`, `cooldown_hours`, Buster `max_pauses` | Config | runtime-monitor/summaries/telemetry | per fixture | Rate-limit recovery/exhaustion. |
| `agents.buster.dispatch`, `agents.buster.redis_js_path` | Config | telemetry/polling runtime | per fixture | Redis completion adapter boundary. |
| `acp_monitor.poll_ms`, `unknown_poll_limit`, `stale_poll_limit` | Config | runtime monitor/Buster monitor | per fixture | Monitor loop classification. |
| `cleanupPolicy` | Cleanup option | shell-boundary cleanup records | per record | Disabled/task-scoped/startup sweep behavior. |
| `bundle.www_dir`, `unit.test_cmd` | Suite config | shell-boundary suite records | per record | Shell/path rejection behavior. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| `.swarm/logs/pipeline/pipeline.jsonl` and run-scoped `pipeline.jsonl` | telemetry runtime | V03b assertions | Nova/Buster telemetry | Canonical telemetry mirrors. |
| `.swarm/logs/pipeline/runs/<run_id>/summary.json`, top-level `summary.json`, `latest.json` | pipeline summary finalizer | summaries tests/operators | pipeline runner | Pipeline summary join points. |
| `project-summary.md`, `project-summary.json`, `case-study.base.json`, `case-study.md` | summary generators | summaries tests/operators | summary/case-study services | Summary output artifacts. |
| `discord.jsonl` top/run | Discord runtime | summaries/runtime monitor tests | runtime | Operator audit evidence. |
| `telemetry-fallback.jsonl` and `buster-telemetry-fallback.jsonl` | Buster telemetry fallback | telemetry tests/operators | Buster telemetry | Degraded fallback artifacts. |
| Redis completion streams and archives | Redis completion services | telemetry tests | Redis fake/runtime | Completion authority and archive history. |
| Transcript JSONL files | ACP/runtime fixtures | monitor/transcript/redaction services | fixtures/runtime | Transcript delta state. |
| Sandbox cleanup state files | sandbox cleanup service | shell-boundary tests | cleanup runtime | Resource cleanup authority. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| ACP monitor state | monitor service | Nova polling/orchestration, Buster session monitor | None. |
| Shell/cleanup execution | suite modules and sandbox cleanup service | behavior tests/operators | None. |
| Shutdown tracked agents | lifecycle service; shutdown only reaps/kills | orchestration/shutdown | None. |
| Summary lifecycle/artifacts | summary services and pipeline finalizer | Redis telemetry, Discord, artifact readers | Existing P18b for summary gateway-label fallback. |
| Telemetry event docs/schema | lifecycle contract and telemetry-event schema | docs/tests/operators | Existing P16 for runtime payload validator owner. |
| Redis completion identity/archive | Redis completion services | polling/gate/module runtime | Existing P17 for explicit entry schema owner. |
| Transcript delta state | monitor/lifecycle services | orchestration health checks | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| ACP monitor state | monitor service | `sessionState`, `sessionActive`, `terminal`, `reason`, `gatewayUnreachable`, `gatewayDetail`, `rateLimited`, transcript state | monitor normalizers | polling/Buster/orchestration. |
| Summary lifecycle telemetry | summary/pipeline services | `summary.started`/`summary.completed` with `summary_type`, `status`, `reason`, `attempt`, `model`, `runtime`, `session_key`, `dispatch_id`, `output_dir`, `output`, project-summary artifacts, and pipeline exit/artifact join fields | telemetry payload schema/builders/docs | Redis/operators/tests; internal `failed` flag is not emitted. |
| Pipeline summary artifact | pipeline finalizer | `completed_at`, `telemetry_stream_key`, `artifacts.pipeline_jsonl`, `discord_jsonl`, `summary_json`, `nova_injections_jsonl`, `buster_telemetry_fallback_jsonl`, Redis artifact paths | pipeline summary writer | operators/tests. |
| Redis completion entry | Buster/polling Redis services | `_id`, `type:'completion'`, module/gate id, status/outcome/source, `run_id`, `attempt`, `dispatch_id`, optional session/detail fields | selection/adjudication logic | polling/gates/tests. |
| Observability degraded/restored | telemetry/observability services | `type`, `component`, `surface`, `reason`, `detail`, module/gate/session/dispatch fields, stream key when Redis completion related | telemetry builders | Redis/logs/tests. |
| Transcript state | monitor service | `byteOffset`, `eventCount`, `newLines`, `lastActivityPoll`, `rateLimited` | `readAcpTranscriptState` | orchestration/polling. |
| Sandbox cleanup result | sandbox cleanup | `ok`, `cleanup_policy`, `cleaned`, `policy_denied`, `errors` | cleanup service | Buster/operators/tests. |
| Telemetry docs/schema event inventory | lifecycle contract + schema docs | canonical event sections and event-specific field tables | lifecycle audit helpers | documentation tests. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Pipeline review summary agent | summary service fixtures | pipeline-review transcript archive/Discord/telemetry | pipeline review prompt not inspected in scoped file | ACP/subagent spawn/poll/kill overrides | summary lifecycle result or explicit failure. |
| Case study agent | case-study service fixtures | `case-study.md`, Discord/telemetry | case-study prompt not inspected in scoped file | ACP spawn/poll/kill overrides | summary lifecycle result or explicit failure. |
| Buster gate/task monitor | Buster telemetry/gate runtime | Redis completion/fallback artifacts | no prompt in scoped file | Redis completion adapter, ACP monitor | terminal completion/rate-limit/telemetry result. |
| Project summary generator | summary/tool adapters | `project-summary.md/json`, `case-study.base.json`, Discord audit | generator adapter output fixture | project summary adapter | markdown/data/case-study base/embeds. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `runtime-monitor.mjs` monitor | gateway unreachable/rate-limited transcript | Yes via monitor loop | monitor poll config | active degraded or rate-limited, not silent kill | runtime redaction only. |
| `shell-boundary.mjs` suite/cleanup | shell metacharacters, disallowed paths, inspect failure, cleanup policy/failure | cleanup failure can retry by preserved state | none in scoped file | reject/deny/preserve resources | runtime redaction only. |
| `shutdown-integration.mjs` source/API drift | missing wiring or legacy exports | No | none | behavior record fails | n/a. |
| `summaries.mjs` summary flows | rate-limit exhausted, no output, poll exception, project-summary missing script, pipeline halt | rate-limit cooldown/exhaustion only | max pauses/cooldown; fixture sleep no-op | explicit summary failure/completed telemetry and cleanup | runtime redaction only. |
| `telemetry-docs.mjs` / `telemetry-schema.mjs` docs drift | stale/missing docs/schema fields | No | none | behavior record fails | n/a. |
| `telemetry.mjs` telemetry/Redis | Redis init/import/read/archive failure, completion conflict, terminal-owned RATE_LIMITED | degraded/restored for read recovery | scan/archive batch sizes and poll configs | fallback artifact, degraded event, conflict diagnostic, or terminal rate-limit | runtime redaction only. |
| `transcript-monitor.mjs` health checks | gateway unknown/unreachable with/without transcript progress | monitor can recover | transcript grace/poll ms/timeout | alive fallback with degraded/restored or false with degraded | runtime redaction only. |

### Mandatory telemetry / observability rows

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `runtime-monitor.mjs` | gateway outage during monitor/rate-limit recovery | Yes | fake Redis and Discord JSONL | `observability.degraded`, `observability.restored`, rate-limit pause Discord | monitor/Buster telemetry | Gateway outage remains explicit. |
| `shell-boundary.mjs` | cleanup denial/failure | Yes/partial | cleanup result object/state file | `policy_denied`, `errors`, preserved cleanup state | sandbox cleanup | No Redis assertion in scoped file. |
| `shutdown-integration.mjs` | source/API drift | Yes/partial | behavior harness failure | failed record | behavior harness | No runtime telemetry path. |
| `summaries.mjs` | rate-limit/no-output/poll/project-summary/pipeline halt failures | Yes | fake Redis, Discord audit, summary artifacts | `rate_limit.detected`, `retry.exhausted`, `summary.completed`, `discord.jsonl`, `summary.json` | summary/pipeline services | P18b still tracks gateway-label fallback. |
| `telemetry-docs.mjs` / `telemetry-schema.mjs` | documentation/schema drift | Yes/partial | behavior harness failure | failed record | behavior harness | Documentation-only checks. |
| `telemetry.mjs` | Redis init/import/read/archive failures | Yes | fallback JSONL, fake Redis, pipeline JSONL | `observability.degraded/restored`, `telemetry-fallback.jsonl`, `buster-telemetry-fallback.jsonl` | telemetry/polling services | P16/P17 still track schema-owner gaps. |
| `telemetry.mjs` | completion conflict/terminal-owned RATE_LIMITED | Yes | completion diagnostics and Redis gate telemetry | conflict record, `gate.verdict`, `retry.exhausted` | Redis completion/gate runner | Terminal-owned rate limit avoids second cooldown. |
| `transcript-monitor.mjs` | unknown session state | Yes | fake Redis and stderr fallback warning | `observability.degraded`, `observability.restored`, one fallback warning | orchestration/monitor | No transcript progress returns false after degraded event. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js | Runtime binary | Node runtime | all V03b areas | ESM execution, filesystem, `execFileSync` | Required by harness. |
| Fake Redis helpers | verification helper | local source | runtime-monitor/summaries/telemetry/transcript | Telemetry streams and seq/fallback assertions | Globals reset per record. |
| Fake gateway server | verification helper | local HTTP server | runtime-monitor/telemetry/transcript | ACP session state/failure simulation | Controlled outages. |
| Materialized runtime tree | lifecycle-audit helper | local source copy | runtime-heavy areas | Imports Nova/Buster runtime modules | Import drift fails records. |
| Git binary | host binary | host version | `shell-boundary.mjs` | Literal `git -C` project-summary test | Temp repo only. |
| Python `yaml` via shim | host Python/PyYAML | host package | `shell-boundary.mjs` | `js-yaml` shim for k8s manifest parsing | Fixture boundary. |
| Podman/kubectl/nginx command names | external binaries mocked by execFileAsync | not executed live | shell cleanup/base-image tests | Assert argv-safe calls | Fake calls only. |
| Documentation contract/schema helpers | lifecycle-audit lib | local source | telemetry-docs/schema | Docs event inventory validation | Docs drift fails records. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| ACP monitor/session | poll intervals and unknown/stale limits | `acp_monitor.*`, transcript grace | degraded/rate-limited/no-output classifications | observability events/transcript state | None. |
| Summary rate-limit flows | max pauses/cooldown | `rate_limit.max_pauses_per_module`, `cooldown_hours` | cooldown then `retry.exhausted`/summary failure | Redis/Discord summary evidence | P18b gateway-label fallback. |
| Redis completion tail/archive | batch size/scan limit/archive maxlen | explicit options | conflict/idempotent/ignored source diagnostics; archive preserves active identity | Redis diagnostics | P17 schema owner. |
| Buster/Nova telemetry seq | Redis counter per run stream | fake Redis counter | run-global monotonic seq across Nova/Buster | seq assertions | None. |
| Sandbox cleanup | task-scoped vs startup sweep vs disabled | cleanup policy/phase | deny, clean scoped resources, preserve failed resources | cleanup result/state file | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Monitor state lookup | `session_status` mapped to running/closed/unknown/unreachable plus transcript state | monitor service/fake gateway | polling/Buster/orchestration | poll limits/grace configs | monitor state assertions and observability events. |
| Summary session lifecycle | spawn/poll/kill overrides with `session_key`, `attempt`, `dispatch_id`, `gateway_label` | summary services | ACP/subagent runtime | rate-limit/no-output/poll exception branches | Discord/telemetry/cleanup arrays. |
| Shutdown/reaper kill | lifecycle tracked session passed to `killSession`/`reaperAfterKill` | orchestration/shutdown | lifecycle/gateway runtime | no retry in scoped file | source/import assertions. |
| Transcript health fallback | tracked session with `streamLogPath` and transcript delta state | lifecycle/orchestration | monitor service | transcript grace and progress fallback | `observability.degraded/restored`. |
| Redis completion transport | completion entries keyed by run/attempt/dispatch/session | Buster/polling Redis adapters | module/gate polling | tail scan/archive batches | Redis fake stream diagnostics. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Runtime monitor gateway outage semantics | `tests/verification/behavior/areas/runtime-monitor.mjs` | High | None found. |
| Shell/cleanup boundary safety | `tests/verification/behavior/areas/shell-boundary.mjs` | High | None found. |
| Shutdown/lifecycle wiring | `tests/verification/behavior/areas/shutdown-integration.mjs` | Medium source/API coverage | None found. |
| Summary lifecycle/artifacts/Discord | `tests/verification/behavior/areas/summaries.mjs` | High | Existing P18b. |
| Telemetry documentation/schema authority | `tests/verification/behavior/areas/telemetry-docs.mjs`, `telemetry-schema.mjs` | High docs coverage | Existing P16 runtime validator gap. |
| Telemetry runtime and Redis completion | `tests/verification/behavior/areas/telemetry.mjs` | High | Existing P16/P17. |
| Transcript monitor fallback | `tests/verification/behavior/areas/transcript-monitor.mjs` | High | None found. |

Validation note: the V03b behavior run exposed two project-summary fixtures in `tests/verification/behavior/areas/summaries.mjs` that invoked `project-summary.js` with temp repo roots lacking `.git`. The fixtures now seed minimal `.git` directories because `resolveRepoDir` explicitly requires repo roots to be Git repositories; this is test fixture alignment, not a production behavior change.

Validation evidence:

```text
node --check tests/verification/behavior/areas/runtime-monitor.mjs
node --check tests/verification/behavior/areas/shell-boundary.mjs
node --check tests/verification/behavior/areas/shutdown-integration.mjs
node --check tests/verification/behavior/areas/summaries.mjs
node --check tests/verification/behavior/areas/telemetry-docs.mjs
node --check tests/verification/behavior/areas/telemetry-schema.mjs
node --check tests/verification/behavior/areas/telemetry.mjs
node --check tests/verification/behavior/areas/transcript-monitor.mjs
node tests/verification/behavior/verify.mjs --source-root "$PWD" --areas runtime-monitor,shell-boundary,shutdown-integration,summaries,telemetry-docs,telemetry-schema,telemetry,transcript-monitor
# result: passed 97, failed 0
git diff --check
```

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- P16-ISSUE-001 remains open and applicable to telemetry runtime payload schema ownership.
- P17-ISSUE-001 remains open and applicable to Redis completion entry schema ownership.
- P18b-ISSUE-001 remains open and applicable to summary gateway-label fallback behavior.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
