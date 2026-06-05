# Batch V01b — Behavior verification governance, models, operators, and runtime surface

Status: completed
Date started: 2026-05-09
Date completed: 2026-05-09
Reviewer: Nova

## Scope

```text
tests/verification/behavior/areas/governance.mjs
tests/verification/behavior/areas/migrated-seams.mjs
tests/verification/behavior/areas/models.mjs
tests/verification/behavior/areas/operator-surface.mjs
tests/verification/behavior/areas/runtime-surface.mjs
```

Scope expansion verified live: 5 files, under the 10-file maximum. All scoped files were read end to end.

## Sources checked

Implementation files:

```text
kubeclaw-main/tests/verification/behavior/areas/governance.mjs
kubeclaw-main/tests/verification/behavior/areas/migrated-seams.mjs
kubeclaw-main/tests/verification/behavior/areas/models.mjs
kubeclaw-main/tests/verification/behavior/areas/operator-surface.mjs
kubeclaw-main/tests/verification/behavior/areas/runtime-surface.mjs
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/behavior/verify.mjs
kubeclaw-main/tests/verification/lib/lifecycle-audit-lib.mjs
kubeclaw-main/tests/verification/lib/fake-redis-lib.mjs
kubeclaw-main/tests/verification/runtime/session-launch-lib.mjs
```

## Per-file map

### `tests/verification/behavior/areas/governance.mjs`

Role: Behavior area validating governance correlation for approval gates, approval summaries, operator-cancelled approvals, and arch-validator summary joins.

Imports/dependencies: Node `fs`/`os`/`path`/`assert`; lifecycle audit runtime materialization/import helpers; fake Redis installer supplied by harness.

Exports/public surface: `registerGovernanceArea(deps)`.

Defines: Six `record()` checks for approval gate state/audit artifacts, transition logs, governance summary approval identity, auto-continued timeouts, operator cancellation, and arch-validator summary correlation.

Important variables/state: Per-check temp `.swarm` trees, fake Redis globals, approval gate fixtures, summary artifacts, run stats.

Calls out to: Runtime `approval-gate-runner.js`, `governance-context.js`, `summary.js`, `core/runtime.js`; docs `observability-reference.md`, `pipeline-reference-v10.md`, `architecture-validator-reference.md`.

Called by / expected callers: `tests/verification/behavior/verify.mjs` when `governance` area is selected.

Environment variables / CLI inputs / config fields: Inherited harness deps only. Constructs config fields `project`, `telemetry.enabled`, `_runId`/`run_id`, `_approvalPollIntervalMs`, `_logDir`, `_runStats`, `paths.swarm_dir`, `_testOverrides.approvalGate`; progress gate fields `type`, `title`, `timeout_minutes`, `on_timeout`.

Paths built/read/written: Temp `.swarm/<gate>-gate-status.json`; `.swarm/logs/gates/<gate>/approval-request.json`, `approval-decision.json`, `approval-request.md`, `approval-transitions.jsonl`; `.swarm/logs/pipeline/summary.json`.

Authority behavior: Verifies governance summary and approval artifacts carry canonical run/gate/project correlation and distinguish continued timeouts from cancellations.

Error/retry/terminal behavior: Assertion failures fail the behavior record through harness `record()`. Fake approval sleep/Discord are no-ops. Timeout-minute zero forces immediate approval timeout in fixtures.

Verification coverage: Direct behavior coverage for approval governance/summary docs and artifacts.

Findings: None.

### `tests/verification/behavior/areas/migrated-seams.mjs`

Role: Behavior area for migrated module/pipeline seams using typed plugin workers and explicit fail-closed contract checks.

Imports/dependencies: No static imports; uses injected fake Redis, filesystem/path/os/assert helpers, runtime materialization/import helpers.

Exports/public surface: `registerMigratedSeamsArea(deps)`.

Defines: Fake module-worker registry builder, module instruction writer, no-external-overrides helper, single-module fixture builder, module config builder, and five seam records.

Important variables/state: `workerCalls`, `generatorCalls`, fake plugin registries, temp module trees, status artifacts, fake Redis stream state.

Calls out to: Runtime registry, module runner, pipeline runner, lifecycle-state, status-store, runtime core.

Called by / expected callers: `verify.mjs` when `migrated-seams` area is selected.

Environment variables / CLI inputs / config fields: Constructs config with project, repo root, timeout/fail limits, telemetry enabled, pre-check disabled, models, run id/stats, plugin registry, log dir, swarm/modules paths, module runner overrides. Progress fixtures use module `stages`, `test_suites`, `execution_order`.

Paths built/read/written: Temp repo `src/.swarm/modules/<module>/FORGE.md` and `BUSTER.md`; `.swarm/logs`; module status artifacts read through worker input artifact refs; lifecycle/status artifacts written by runtime under test.

Authority behavior: Verifies typed worker/generator registry owners are required, compatibility-shaped worker outputs cannot become authority, and canonical status-store/telemetry events are authoritative for module PASS.

Error/retry/terminal behavior: Invalid backend-style worker result, missing forge owner, and compatibility-authority metadata all produce `pipeline_step_result` errors/halt and must not emit PASS status telemetry. No retry/backoff in area; runtime under test controls step behavior.

Verification coverage: Direct migrated seam behavior coverage for module happy path, many-module pipeline path, and ugly fail-closed paths.

Findings: None.

### `tests/verification/behavior/areas/models.mjs`

Role: Behavior area validating runtime model dispatch and model policy telemetry.

Imports/dependencies: Node `fs`/`os`/`path`/`assert`; lifecycle audit runtime helpers; fake Redis helpers via harness.

Exports/public surface: `registerModelsArea(deps)`.

Defines: Built-in registry helper and four records for Codex/OpenAI runtime, Claude runtime, legacy `progress.models` policy ignore, and `pipeline.started` effective model defaults.

Important variables/state: Materialized runtime root; fake Redis globals for telemetry record.

Calls out to: Runtime `agents/runtime.js`, `core/policy.js`, `services/telemetry.js`, `core/runtime.js`, plugin registry.

Called by / expected callers: `verify.mjs` when `models` area is selected.

Environment variables / CLI inputs / config fields: Constructs policy config/progress with `models` and `defaults.models`; telemetry config uses project/run/log dirs and plugin registry.

Paths built/read/written: Reads materialized `core/policy.js` source to assert stale legacy text is absent; temp `.swarm/logs` for telemetry fixture.

Authority behavior: Verifies runtime dispatch maps OpenAI/Codex to `subagent` and Claude to ACP, and project defaults authority is `progress.defaults.models`, not legacy `progress.models`.

Error/retry/terminal behavior: Assertion failures fail record. No retry/backoff.

Verification coverage: Direct behavior assertions.

Findings: None.

### `tests/verification/behavior/areas/operator-surface.mjs`

Role: Behavior area for operator-facing Discord, Redis-dispatch Discord mirroring, Buster operator alerts, degraded/restored observability events, visual-reg Discord failure handling, Buster logger degradation, and observability documentation/budget artifacts.

Imports/dependencies: No static imports; uses shared behavior deps including fake Redis, fake gateway server, runtime modules, source/doc readers, temp filesystem helpers, Buster sandbox runtime.

Exports/public surface: `registerOperatorSurfaceArea(deps)`.

Defines: Built-in registry helper and eighteen records covering Nova Discord audit correlation, gate type extraction, approval gate fields, verification webhook mute, webhook degraded/restored telemetry, Redis task alert audit mirroring, Discord audit-log degraded/restored telemetry, Buster Discord correlation/actionability/mirroring/webhook failure telemetry, visual-reg Discord HTTP noncritical logs, Buster logger degraded telemetry, observability docs, and budget artifact fields.

Important variables/state: Temp log trees, process env overrides for webhook mute and Redis tool (`PATH`, `DISCORD_WEBHOOK`, `KUBECLAW_DISABLE_DISCORD_WEBHOOKS`, `AGENT_NAME`), fake Redis globals, fake HTTP webhook servers, captured visual-reg logs.

Calls out to: Nova Discord integration, Redis tool, Buster Discord service, Buster visual-reg Discord helpers, Buster logger/telemetry, observability service, runtime core, registry, docs.

Called by / expected callers: `verify.mjs` when `operator-surface` area is selected.

Environment variables / CLI inputs / config fields: Reads/mutates `PATH`, `DISCORD_WEBHOOK`, `KUBECLAW_DISABLE_DISCORD_WEBHOOKS`, `AGENT_NAME`; uses config fields for project, run/log dirs, Discord webhook URL/alerts, telemetry enabled, module/gate/session/dispatch/attempt identity, Buster pipeline log paths, observability budget thresholds.

Paths built/read/written: `.swarm/logs/pipeline/discord.jsonl`; run-scoped `discord.jsonl`; Buster task-local `discord.jsonl`; pipeline JSONL paths; cost `budget-events.jsonl` and `usage-snapshots.jsonl`; temp fake `curl` and image file.

Authority behavior: Verifies operator artifacts are correlated evidence, not lifecycle authority, and degraded/restored observability events preserve operator correlation when Discord/log sinks fail and recover.

Error/retry/terminal behavior: Fake webhook HTTP 500 triggers degraded telemetry; later success triggers restored. Audit-log path-as-file triggers audit degradation/restoration. Verification mute prevents live curl/webhook while preserving audit artifacts. Visual-reg Discord helper logs HTTP failures as non-critical. Buster logger append failure emits canonical degraded telemetry. Assertions fail the record.

Verification coverage: Direct operator behavior coverage.

Findings: None.

### `tests/verification/behavior/areas/runtime-surface.mjs`

Role: Behavior area for runtime helper surfaces: gateway env resolution, explicit run identity, transcript path resolution, Redis artifact paths, structured observability mirrors, artifact authority projection, notification registry/dispatch, structured sink degradation/restoration, and ACP launch result assessment.

Imports/dependencies: No static imports; uses shared behavior deps, fake Redis, source readers, runtime modules, session-launch-lib import.

Exports/public surface: `registerRuntimeSurfaceArea(deps)`.

Defines: JSON-schema helper, built-in registry helper, and eighteen records for gateway/env, context run identity, gateway public surface, transcript path, Redis logs, observability mirrors, artifact authority, notification ordering/failure, structured sink degraded/restored, and ACP launch verification assessment.

Important variables/state: Env snapshots for gateway/HOME, temp `.openclaw` sessions metadata, temp logs, fake Redis globals, custom notification plugin calls/snapshots, launch assessment inputs.

Calls out to: Gateway, lifecycle, Redis log, observability, artifact-bundle, telemetry, registry, notification-dispatch, runtime core/context/logger, session-launch-lib.

Called by / expected callers: `verify.mjs` when `runtime-surface` area is selected.

Environment variables / CLI inputs / config fields: Reads/mutates `OPENCLAW_GATEWAY_URL`, `OPENCLAW_GATEWAY_TOKEN`, `GATEWAY_URL`, `GATEWAY_TOKEN`, `HOME`; constructs runtime configs with project/run/log dirs, telemetry, registry, observability budget, and notification hook inputs.

Paths built/read/written: Temp `HOME/.openclaw/agents/main/sessions/sessions.json` and transcript files; Redis audit logs under `redis/`; pipeline/run-scoped `pipeline.jsonl`; latest pointer/fallback evidence fixtures; cost artifacts.

Authority behavior: Verifies public helper surface narrowing, explicit run identity precedence, artifact evidence has no lifecycle/session authority, notification hooks are registry-owned, and ACP launch PASS requires session-status reachability plus confirmed cleanup.

Error/retry/terminal behavior: Redis append path-as-file failure returns `{ok:false, errors}` and reports stderr noncritical incident. Missing notification listener emits `observability.degraded` instead of fallback lifecycle emission. Structured event mirror failure emits degraded; later good path emits restored. ACP launch assessment returns non-pass reasons for stream-log-only, degraded visibility, and cleanup-unconfirmed cases.

Verification coverage: Direct runtime surface behavior coverage.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `verify.mjs` | V01b area modules | `register*Area(sharedAreaDeps)` | Area selection/orchestration. |
| `governance.mjs` | approval/summary/governance runtime modules | `runApprovalGate`, `writeSummary`, governance recorders | Approval/arch governance correlation fixtures. |
| `migrated-seams.mjs` | module/pipeline runners and registry | `runModule`, `runPipeline`, fake `stageOwners` | Typed worker seam traversal and fail-closed contracts. |
| `models.mjs` | runtime/policy/telemetry modules | `resolveRuntime`, `modelToHarness`, `resolvePolicy`, `onPipelineStarted` | Model dispatch/default policy checks. |
| `operator-surface.mjs` | Discord/Redis/Buster/observability modules | Discord audit/webhook, Redis task send, Buster Discord/logger, budget APIs | Operator evidence and degraded/restored observability. |
| `runtime-surface.mjs` | gateway/lifecycle/redis/observability/notification/session launch modules | helper resolvers, artifact logging, notification dispatch, launch assessment | Runtime public surface and authority checks. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `governance.mjs approval fixtures` | `on_timeout` is block vs continue | gate config | exit 10 vs exit 0 with `continued:true`; summary outcome differs | Approval timeout semantics stay replayable. |
| `migrated-seams.mjs fake workers` | `forgeMode`/`busterMode`/owner omission | fixture options | pass, invalid compatibility shape, missing owner, or forbidden compatibility authority | Tests fail-closed plugin migration seams. |
| `models.mjs` | model provider string | `openai`, `openai-codex`, `anthropic/claude` | subagent/codex vs acp/claude | Runtime dispatch defaults. |
| `operator-surface.mjs` | webhook muted/failing/restored | env and fake webhook | audit-only, degraded event, restored event | Operator delivery is observable and non-authoritative. |
| `runtime-surface.mjs gateway` | OpenClaw env present vs legacy env | env vars | OpenClaw URL/token precedence over legacy | Gateway config precedence. |
| `runtime-surface.mjs notification` | listeners ordered/missing/failing | registry hook index | priority/module order, degraded result, or listener-missing degraded event | Notification registry is explicit authority. |
| `runtime-surface.mjs ACP launch` | session status visibility and cleanup confirmation | launch assessment input | PASS only with session-status evidence and confirmed cleanup | Prevents stream-log-only launch PASS. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| V01b fake Redis setup | `globalThis.__fakeRedisCalls` / counters | per-check reset | Reset before telemetry fixtures | Stream assertions see only fixture events. |
| `migrated-seams.mjs buildRegistryWithFakeModuleWorkers` | registry `stageOwners` | built-in registry plus fake overrides | Shallow merge built-ins, override worker owners, optionally delete owners/add generators | Typed worker calls are controlled by fixture. |
| `operator-surface.mjs env fixtures` | process env `PATH`, Discord, agent vars | previous values | Save previous, mutate for test, restore in `finally` | No persistent env mutation. |
| `runtime-surface.mjs env fixtures` | process env gateway/HOME vars | previous values | Save previous, mutate, restore in `finally` | Gateway/HOME tests isolated. |
| `runtime-surface.mjs runtime identity` | legacy run state and active logger context | context/config inputs | Explicit context/config wins over active context; active context wins over legacy no-arg fallback | Run identity remains per context/config. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `migrated-seams.mjs many-module fixture` | `for index=1..9` | None | None | Creates 9 modules, then pipeline runner processes in order. |
| `operator-surface.mjs` fake async telemetry | Await `flushAsync()` once/twice | Fake Redis flush only | None | Events available for assertions. |
| V01b area modules generally | Sequential `record()` calls | None in area code | Timeout behavior delegated to runtime under test | First assertion failure aborts selected area through harness. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `OPENCLAW_GATEWAY_URL`, `OPENCLAW_GATEWAY_TOKEN` | Env vars under test | `runtime-surface.mjs` through gateway module | Prefer over legacy gateway vars | Gateway URL/token precedence assertions. |
| `GATEWAY_URL`, `GATEWAY_TOKEN` | Env vars under test | `runtime-surface.mjs` through gateway module | Legacy fallback | Used when OpenClaw vars absent. |
| `HOME` | Env var under test | `runtime-surface.mjs` through lifecycle transcript resolver | temp home in fixture | Locates `.openclaw/agents/.../sessions.json`. |
| `PATH` | Env var under test | `operator-surface.mjs` | temp fake curl prepended | Ensures verification mute does not invoke curl. |
| `DISCORD_WEBHOOK`, `KUBECLAW_DISABLE_DISCORD_WEBHOOKS`, `AGENT_NAME` | Env vars under test | `operator-surface.mjs` Redis/Discord fixtures | saved/restored | Redis task alert and webhook mute behavior. |
| Model policy inputs | Runtime config/progress | `models.mjs` | platform fallback and `progress.defaults.models` | Legacy `progress.models` intentionally ignored. |
| V01b fixture configs | Runtime config objects | area modules | temp project/run/log/registry fields | Feed runtime modules under test. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| `.swarm/logs/gates/<gate>/approval-*` | approval runner in governance fixtures | `governance.mjs` | runtime approval gate | Approval governance artifacts with run/gate correlation. |
| `.swarm/logs/pipeline/summary.json` | summary runtime | `governance.mjs` | summary runtime | Governance summary joins approvals/arch validation. |
| temp `src/.swarm/modules/<module>/FORGE.md` / `BUSTER.md` | `migrated-seams.mjs` | module runner | fixture | Module task inputs for seam traversal. |
| `pipeline:telemetry:<project>:<run>` | telemetry runtime/fake Redis | V01b assertions | runtime modules under test | Stream event evidence for telemetry/degraded/restored checks. |
| `.swarm/logs/pipeline/discord.jsonl` and run `discord.jsonl` | Discord/Buster services | `operator-surface.mjs` | runtime services | Operator audit artifacts, evidence only. |
| `.swarm/logs/redis/*` and run `redis/*` | Redis log service | `runtime-surface.mjs` | redis log service | Canonical Redis audit artifact paths. |
| `$HOME/.openclaw/agents/main/sessions/sessions.json` | `runtime-surface.mjs` fixture | lifecycle resolver | fixture | Transcript path resolution source. |
| `cost/budget-events.jsonl`, `cost/usage-snapshots.jsonl` | observability budget runtime | `operator-surface.mjs` | observability runtime/fixture | Budget event and threshold evidence. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Governance approval summary entries | approval/governance/summary runtime modules | `governance.mjs` | None. |
| Migrated typed worker control results | plugin registry owners and module runner validators | `migrated-seams.mjs` | None. |
| Model defaults in telemetry | policy + telemetry runtime | `models.mjs` | None. |
| Operator Discord/Redis/Buster audit artifacts | Discord/Redis/Buster services | `operator-surface.mjs` | Evidence only, not lifecycle authority. |
| Runtime helper public surface | gateway/lifecycle/runtime modules | `runtime-surface.mjs` | None. |
| Notification dispatch authority | plugin registry + notification-dispatch | `runtime-surface.mjs` | None. |
| ACP launch PASS assessment | `session-launch-lib.mjs assessLaunchVerification` | `runtime-surface.mjs` | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Approval gate state/request/decision | approval runner | `gate_id`, `gate_type`, `run_id`, `project`, state/status fields | Runtime approval gate | Governance summary/docs. |
| Approval transition entry | approval runner | `run_id`, `project`, `gate_id`, `gate_type`, `from`, `to`, `note` | Runtime writer | Offline replay/governance docs. |
| Governance summary approval entry | summary runtime | `gate_id`, `gate_type`, `run_id`, `project`, state/request/decision/transition paths, `decision_via`, `timeout_policy`, `continued` | Summary runtime | Operators/replay. |
| Typed worker result | fake workers/runtime validator | `{schemaVersion:'v1', producerKind:'worker', producerType, nextAction, diagnostics:{summary,metadata}}` | Module runner control-result validation | Module runner/status telemetry. |
| Pipeline step result | module/pipeline runner | `kind:'pipeline_step_result'`, `step_type`, `step_id`, `next_action`, `outcome`, `exit`, `reason?`, `diagnostics?` | Runtime step result helpers | Seam assertions/callers. |
| `pipeline.started` model event | telemetry runtime | `type:'pipeline.started'`, `models:{buster?,forge?}` with effective defaults | Telemetry runtime | Fake Redis stream assertions. |
| Discord audit entry | Discord services | project/run/module/gate/gate_type/attempt/dispatch/session/actionability/fields | Discord services | Operator/replay assertions. |
| Observability degraded/restored event | runtime services | `type`, `component`, `surface`, `reason`, correlation fields, `detail`, `restored_after_ms?` | Runtime telemetry/observability | Fake Redis/pipeline JSONL assertions. |
| Redis audit record | Redis log service | object JSONL with `ts`, `run_id`, `direction`, `type`, `scope`, `scope_id`, `payload` | Redis log service | Runtime-surface assertions. |
| ACP launch assessment | session-launch-lib | `ok`, `launchConfirmed`, `launchEvidence`, `degradedVisibility`, `cleanupConfirmed`, `nonPassReasons[]` | `assessLaunchVerification` | Runtime verification. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Migrated seam module task fixtures | `migrated-seams.mjs writeModuleInstructions` | temp `.swarm/modules/<module>/FORGE.md`, `BUSTER.md` | Minimal `# Forge` / `# Buster` instructions for fixture modules | Module runner worker plugins | Typed worker result contract, no real agent invocation. |
| V01b other scoped files | None found in scoped files | None found in scoped files | None found in scoped files | None found in scoped files | None found in scoped files |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| V01b area records | Assertion/runtime failure | No wrapper retry | None | Harness record fails selected area | No area redaction. |
| `governance.mjs` approval timeout fixtures | Immediate timeout | No | `timeout_minutes:0`; fake sleep no-op | Block exits 10; continue exits 0 | None. |
| `migrated-seams.mjs` invalid/missing worker authority | Invalid control result, missing owner, forbidden compatibility metadata | No | None | Runtime returns halt/error and must not PASS status/telemetry | None. |
| `operator-surface.mjs` webhook/audit/log failures | HTTP 500 webhook, audit path failure, Buster logger append failure | Recovery tested for some paths | Fake webhook success after failure; fixed run log path after failure | Degraded telemetry, later restored where applicable; visual-reg logs noncritical | Runtime redaction only; area none. |
| `runtime-surface.mjs` Redis/structured sink failures | path-as-file append failures, missing notification listener, structured mirror failure | Structured sink recovery tested | Change bad path to good path | Nonblocking `{ok:false}`/stderr or degraded telemetry; no lifecycle mutation | Noncritical reporter may sanitize; area captures assertions only. |
| `runtime-surface.mjs` ACP launch weak evidence | stream-log-only, gateway degraded, cleanup unconfirmed | No | None | `assessLaunchVerification` returns `ok:false` with reasons | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| V01b area records | Assertion/runtime failure | Yes/partial | behavior harness stderr/buffered logs | `[behavior] FAILED: <record>` | `verify.mjs record` | Area modules rely on harness observability. |
| `governance.mjs` | Approval timeout fixtures | Partial | gate artifacts and summary | approval state/request/decision/transitions, `summary.json` | approval/summary runtime | Telemetry disabled in governance fixtures. |
| `migrated-seams.mjs` | Invalid/missing worker authority | Yes | fake Redis stream and status artifacts | absence of PASS `module.status_changed`; error step result | module runner/telemetry runtime | Negative telemetry assertion. |
| `operator-surface.mjs` | Discord/Buster webhook and audit failures | Yes | fake Redis stream, Discord audit JSONL, logs | `observability.degraded`, `observability.restored`, `discord.jsonl`, visual-reg log lines | Discord/Buster services | Main operator observability coverage. |
| `runtime-surface.mjs` | Redis/structured sink failures | Yes/partial | stderr, fake Redis, pipeline JSONL | `redis_artifact_append_failed`, `observability.degraded/restored` | redis-log/observability runtime | Nonblocking evidence only. |
| `runtime-surface.mjs` | ACP launch weak evidence | Partial | returned assessment object | `nonPassReasons[]` | `assessLaunchVerification` | No telemetry; runtime verification result is the evidence. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js | Runtime binary | Node runtime | all V01b area modules | Behavior area execution and runtime imports | Required by harness. |
| Fake Redis lib | repo verification library | local source | governance/models/operator/runtime/migrated fixtures | Telemetry stream capture | Global fake state reset per fixture. |
| Materialized general/sandbox runtime trees | verification fixture | runtime copy | all V01b areas | Runtime module behavior under packaged paths | Materialization/import failure fails record. |
| Local fake HTTP server | Node `http` via harness | runtime built-in | operator webhook fixtures | HTTP 500/success webhook simulation | Handler failures become HTTP 500 JSON. |
| Filesystem temp dirs | Node `fs`/`os`/`path` | runtime built-ins | all V01b areas | Artifact/status/log fixtures | Path-as-file failures intentionally tested. |
| Session launch lib | repo runtime verification helper | local source | runtime-surface ACP records | Assess launch PASS/FAIL semantics | No live ACP calls in V01b. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| V01b area execution | Sequential records | harness-selected areas | First failed record aborts | harness failure output | None. |
| Migrated many-module fixture | 9 sequential modules | hard-coded loop 1..9 | Pipeline runner must reuse typed workers in order | workerCalls/generatorCalls and telemetry | None. |
| Fake Redis telemetry | Async fake flush | explicit `flushAsync()` | Assertions wait for emitted events | fake Redis event arrays | None. |
| Notification dispatch | Listener order by priority then moduleId | registry priority/moduleId | Failing listener does not stop later listener; missing listeners degrade | results array and telemetry | None. |
| Webhook/audit recovery | Failure then success/fixed path | fake servers/path mutation | Degraded then restored events | telemetry events | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Runtime dispatch model choice | model string to runtime/harness | runtime module under test | `models.mjs` | None | `resolveRuntime`, `modelToHarness` assertions. |
| Transcript metadata lookup | sessions map `{sessionFile, sessionId}` | `.openclaw` sessions fixture | lifecycle resolver | None | `resolveSubagentTranscriptPath` path assertion. |
| ACP launch assessment | observed `{visible, active, state, degradedVisibility}`, `streamLogExists`, cleanup, flags | session-launch-lib | runtime verification callers | None | `ok`, evidence, cleanup, nonPass reasons. |
| Gateway env resolution | gateway URL/token env vars | gateway helper | runtime-surface assertions | None | URL/invoke/health/token results. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Governance correlation and summary outcomes | `governance.mjs` | Good behavior coverage | Does not run live approval operator input. |
| Migrated typed worker seams | `migrated-seams.mjs` | Good happy/ugly seam coverage | Fake workers, not live agents. |
| Model policy/runtime dispatch | `models.mjs` | Focused coverage | Limited provider examples. |
| Operator Discord/Buster/observability | `operator-surface.mjs` | Broad behavior coverage | Uses fake webhook/Redis, not live Discord. |
| Runtime helper surfaces/ACP launch assessment | `runtime-surface.mjs` | Broad behavior coverage | ACP assessment only, no live launch here. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- None yet.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
