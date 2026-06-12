# Batch B00a — Buster root runtime entry and docs

Status: completed
Date started: 2026-05-08
Date completed: 2026-05-08
Reviewer: Nova

## Scope

```text
skills/buster/README.md
skills/buster/CONVENTIONS.md
skills/buster/package.json
skills/buster/buster-pipeline.js
skills/buster/pipeline/cli-args.js
skills/buster/pipeline/git-primitives.js
```

Scope expansion verified live: 6 files, under the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/buster/README.md
kubeclaw-main/skills/buster/CONVENTIONS.md
kubeclaw-main/skills/buster/package.json
kubeclaw-main/skills/buster/buster-pipeline.js
kubeclaw-main/skills/buster/pipeline/cli-args.js
kubeclaw-main/skills/buster/pipeline/git-primitives.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/runtime/check-buster-startup-smoke.mjs
kubeclaw-main/tests/verification/contracts/check-buster-pipeline-slice-surface.mjs
kubeclaw-main/tests/verification/contracts/check-critical-dynamic-imports.mjs
kubeclaw-main/tests/verification/contracts/check-buster-repo-scoped-paths.mjs
```

## Per-file map

### `skills/buster/README.md`

Role: Buster public docs for task flow, suite order, config/env/task payload schema, result artifacts, and process diagnostics.

Imports/dependencies: Documentation only.

Exports/public surface: User/operator-facing Buster contract.

Defines: Directory inventory, Redis→suite→subagent→completion flow, suite dependency/criticality model, test config schema, environment variables, Redis task payload fields, suite reference, subagent completion rules, process-health diagnostic rules.

Important variables/state: Documents required task identity fields and process env vars; no runtime state.

Calls out to: N/A.

Called by / expected callers: Operators, maintainers, prompt/docs readers.

Environment variables / CLI inputs / config fields: Documents `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `DISCORD_WEBHOOK_URL`, `DISCORD_WEBHOOK`, `BUSTER_PROJECT`, `GATEWAY_URL`, `GATEWAY_TOKEN`, `AGENT_NAME`, `HOSTNAME`, task payload `test_config`/`config`.

Paths built/read/written: Documents `.swarm/logs/buster/process-health.jsonl`, module `result_artifact_path`, legacy `status_json_path` read-model, gate `output_file`, `pipeline_log_path`, `pipeline_run_log_path`.

Authority behavior: Correctly states task payload `project`/`run_id`/`dispatch_id` are authority and `BUSTER_PROJECT` is diagnostic only; completion authority belongs to Buster pipeline artifact read and `source=buster-pipeline` completion.

Error/retry/terminal behavior: Documents critical suite no-spawn, session monitoring, cleanup, rate-limit and completion emission at a high level.

Verification coverage: Buster pipeline slice, telemetry, Redis completion, repo-scoped path checks.

Findings: None.

### `skills/buster/CONVENTIONS.md`

Role: Operational conventions for Buster subagents writing/running tests.

Imports/dependencies: Documentation only.

Exports/public surface: Subagent convention reference.

Defines: JSON test output format, naming, test timeouts, error report shape, exit codes, sandbox rules, cleanup, browser testing commands, workflow order.

Important variables/state: No runtime state.

Calls out to: N/A.

Called by / expected callers: Buster prompts/subagents/operators.

Environment variables / CLI inputs / config fields: Mentions URL/port/module/commit in bug reports; no direct envs.

Paths built/read/written: Documents `.swarm/<module>/` result placement and persistent `.spec.js`/`.test.js` tests.

Authority behavior: Mostly aligns with Buster-owned completion, but workflow step 5 still says update `status.json`, conflicting with README/result-artifact authority.

Error/retry/terminal behavior: Documents timeout/error reporting and exit codes.

Verification coverage: Indirect docs/contracts; no direct convention drift check.

Findings: `B00a-ISSUE-001`.

### `skills/buster/package.json`

Role: Buster package metadata and runtime dependency declaration.

Imports/dependencies: Declares package type `module`, dependencies `ioredis` `^5.4.1` and `js-yaml` `^4.1.0`.

Exports/public surface: npm/package metadata only.

Defines: Package name `buster-pipeline`, private package flag.

Important variables/state: None.

Calls out to: N/A.

Called by / expected callers: Node/package/runtime environment.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: None.

Authority behavior: Owns Buster package module mode/dependency declaration.

Error/retry/terminal behavior: None.

Verification coverage: Buster startup/import smoke indirectly.

Findings: None.

### `skills/buster/buster-pipeline.js`

Role: Buster runtime entrypoint, public export facade, startup loop, status CLI, and structured shutdown owner.

Imports/dependencies: Node `fs`/`url`, shared Buster lifecycle/gateway/runtime diagnostics/base-images/sandbox/task-queue/gateway-health/orphan-recovery/task-lifecycle services.

Exports/public surface: Re-exports embed builders, rate-limit/result helpers, monitor/session validation/runtime diagnostic/base-image/task-queue/gateway/orphan/session/telemetry helpers plus `getLastRunLogDir` and `processTask`.

Defines: `shuttingDown` guard, gateway-degraded diagnostic helper, `shutdown(signal, opts)`, signal handlers, `main()` startup/poll loop, `--status` CLI.

Important variables/state: Module-local `shuttingDown`; Redis consumer group constants imported; process signal handlers; process exit.

Calls out to: `waitForGateway`, `recoverOrphanedActiveSession`, `doSandboxCleanup`, `startGatewayHealthMonitor`, `loadBaseImagesFromProgress`, `ensureBaseImages`, Redis `xgroup CREATE`, `processOneQueuedTask(processTask)`, `killActiveSession`, `disconnectRedisClient`, runtime diagnostic writers.

Called by / expected callers: Direct Node entrypoint, startup smoke tests, live Redis smoke, contract tests, imports from other runtime/verification modules.

Environment variables / CLI inputs / config fields: Imports queue/gateway constants derived from env in services; direct CLI supports `--status`; logs gateway URL via integration.

Paths built/read/written: `--status` returns `getLastRunLogDir()`; diagnostics/cleanup/log paths delegated to services.

Authority behavior: Entrypoint owns runtime startup/shutdown loop and public Buster facade; task/completion authority delegated to task lifecycle and helper services.

Error/retry/terminal behavior: Shutdown is idempotent; kill/cleanup/redis disconnect failures are reported as runtime diagnostics; gateway degradation can be emitted before structured shutdown; main loop catches task-loop errors, logs, sleeps 3000 ms, and continues while not shutting down.

Verification coverage: `check-buster-startup-smoke.mjs`, `check-buster-pipeline-slice-surface.mjs`, live Redis backend smoke.

Findings: None.

### `skills/buster/pipeline/cli-args.js`

Role: Repo-local compatibility facade for shared pipeline CLI argument parsing.

Imports/dependencies: Re-exports `../../common/pipeline/cli-args.js`.

Exports/public surface: All exports from common CLI args helper.

Defines: No local logic.

Important variables/state: None.

Calls out to: Common shared helper.

Called by / expected callers: Buster code importing repo-local CLI args surface.

Environment variables / CLI inputs / config fields: Delegated to common helper.

Paths built/read/written: None.

Authority behavior: Compatibility shim only; common helper owns implementation.

Error/retry/terminal behavior: Delegated.

Verification coverage: Common helper import surface/strict CLI tests.

Findings: None.

### `skills/buster/pipeline/git-primitives.js`

Role: Repo-local compatibility facade for shared Git primitives.

Imports/dependencies: Re-exports `../../common/pipeline/git-primitives.js`.

Exports/public surface: All exports from common Git primitives helper.

Defines: No local logic.

Important variables/state: None.

Calls out to: Common shared helper.

Called by / expected callers: Buster services importing repo-local Git primitive surface.

Environment variables / CLI inputs / config fields: Delegated to common helper.

Paths built/read/written: Delegated.

Authority behavior: Compatibility shim only; common helper owns implementation.

Error/retry/terminal behavior: Delegated.

Verification coverage: Buster repo-scoped paths/common import surface.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `buster-pipeline.js` | `task-lifecycle.js` | `processTask`, `getLastRunLogDir` | Task processing and status CLI. |
| `buster-pipeline.js` | `task-queue.js` | Redis client/group/task loop helpers | Runtime Redis queue loop. |
| `buster-pipeline.js` | Gateway/orphan/base-image/cleanup services | startup and health helpers | Startup readiness and recovery. |
| `buster-pipeline.js` | Runtime diagnostics | diagnostic record/report helpers | Structured shutdown/startup evidence. |
| Buster local shims | Common helpers | CLI args and Git primitives | Compatibility facade. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| README suite decision | Critical failure after suites | Suite verdict critical flag | `NO_SPAWN` or spawn subagent | Task lifecycle policy. |
| README completion | `module_test` vs `gate_test` | Task type and artifact path | Read `result_artifact_path` or `output_file` | Buster completion authority. |
| `shutdown` | Already shutting down | `shuttingDown` | Return or perform cleanup | Idempotent signal handling. |
| `shutdown` | Gateway degraded requested | `opts.emitGatewayDegraded` | Append process diagnostic | Health shutdown observability. |
| `main` | Redis group exists | Redis `xgroup CREATE` error contains `BUSYGROUP` | Continue instead of throw | Startup idempotence. |
| `main` loop | `!shuttingDown` | Module flag | Process one queued task, catch/log/sleep on error | Runtime poll loop. |
| CLI entry | Direct execution with `--status` | `process.argv[2]` | Print JSON status and exit | Status surface. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `shutdown` | `shuttingDown` flag | signal/options | First caller sets true; later calls no-op | Cleanup runs once. |
| Redis startup | Consumer group | `STREAM_KEY`, `GROUP_NAME` | Create with `MKSTREAM`; BUSYGROUP tolerated | Queue consumer group exists. |
| README task payload | Validated task identity | Redis payload | Task payload `project`/`run_id`/`dispatch_id` is authoritative; env hints are diagnostic only | Canonical telemetry/completion identity. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `main` task loop | `while (!shuttingDown)` | 3000 ms after caught loop error | Task queue helpers own Redis blocking timing | Breaks when shutdown flag true. |
| README health suite | Health check retry | 3 attempts, exponential backoff documented | Suite implementation owns exact timing | PASS/FAIL verdict. |
| CONVENTIONS test scripts | Per tool/request timeouts documented | HTTP 5-10s, WS 5s, Playwright 15/60s, k6 120s, script 120s | Test author contract | Timeout reports ERROR. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | Env vars | Buster task queue/runtime services | README defaults host/6379 | Redis queue connectivity. |
| `DISCORD_WEBHOOK_URL`, `DISCORD_WEBHOOK` | Env vars | Buster Discord/redis tool surfaces | unset | Operator webhook. |
| `BUSTER_PROJECT` | Env var | Runtime diagnostics | unset | Diagnostic project hint only. |
| `GATEWAY_URL`, `GATEWAY_TOKEN` | Env vars | Gateway integration/health/lifecycle | unset | ACP gateway access. |
| `AGENT_NAME`, `HOSTNAME` | Env vars | Task queue service | `unknown`, pod hostname | Consumer identity. |
| Buster task payload fields | Redis task input | Task validation/lifecycle | Required per README | Module/gate identity, suites, artifacts, model, timeout, prompt, test config. |
| CLI `--status` | CLI input | `buster-pipeline.js` | optional | Prints `{lastRunLogDir}`. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| Module `result_artifact_path` | Nova task payload | Buster task lifecycle | Buster subagent | Module completion authority. |
| Legacy `status_json_path` | Nova task payload | Buster task lifecycle read-model | Nova/status-store, not Buster agent | README says not child-agent completion target. |
| Gate `output_file` | Nova task payload | Buster task lifecycle | Buster subagent | Gate completion authority. |
| `.swarm/logs/buster/process-health.jsonl` | Runtime diagnostics service | Operators | Buster process diagnostics | Diagnostic-only, not run authority. |
| `pipeline_log_path`, `pipeline_run_log_path` | Nova task payload | Buster telemetry/log mirror services | Buster telemetry/log services | Canonical operator/run mirrors. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Buster runtime startup/shutdown | `buster-pipeline.js` | Operators/tests | None. |
| Buster task completion signal | Task lifecycle services, not root entrypoint | Nova Redis completion event adapter | README aligns; CONVENTIONS drift issue. |
| Buster task identity | Validated Redis task payload | Telemetry/completion/logs | Env `BUSTER_PROJECT` diagnostic only. |
| Common CLI/Git helpers | `skills/common/pipeline/*` | Buster compatibility shims | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Buster task payload | Nova Redis dispatch | Required `module_id`, `task_type`, `attempt`, `suites`, `project`, `run_id`, `dispatch_id`, prompt/artifact/config fields | `validateBusterTaskPayload` outside B00a | Buster task lifecycle. |
| Module result artifact | Buster subagent | `status: PASS\|FAIL`, `summary` documented | Task lifecycle/completion reader outside B00a | Buster/Nova completion. |
| Gate output artifact | Buster subagent | `status: PASS\|FAIL`, `summary` documented | Gate completion reader outside B00a | Buster/Nova gate completion. |
| Process diagnostic record | Runtime diagnostics service | Diagnostic-only process health JSONL, may include `project_hint` | Runtime diagnostics builder outside B00a | Operators. |
| `--status` output | `buster-pipeline.js` | `{lastRunLogDir}` | None | Operators/tests. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Buster subagent conventions | `CONVENTIONS.md` | `.swarm/<module>/` and prompt-provided artifact paths | JSON test output, naming, timeout/error report rules, browser commands, sandbox restrictions | `agent-browser`, Playwright, k6, curl-like HTTP/WS scripts | JSON test script output and task result artifact; stale status.json instruction tracked in B00a issue. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `shutdown` | kill active session failure | No | One attempt | Runtime diagnostic, continue cleanup | `safeErrorMessage`. |
| `shutdown` | sandbox cleanup incomplete/failure | No | One attempt | Runtime diagnostic, continue cleanup | Diagnostic service sanitization. |
| `shutdown` | Redis disconnect failure | No | One attempt | Runtime diagnostic, exit anyway | Diagnostic service sanitization. |
| `main` | Gateway unavailable during wait | Gateway health service controls | Delegates shutdown path | Structured shutdown via callback | Runtime diagnostics. |
| `main` | Orphan recovery blocked | No | Startup recovery helper attempt | Throw startup error | Error message only. |
| `main` | Redis consumer group already exists | N/A | One `xgroup CREATE` | BUSYGROUP tolerated | `safeErrorMessage`. |
| `main` loop | Task loop error | Yes | Sleep 3000 ms then continue | Soft loop recovery | `safeErrorMessage`. |
| `--status` | Direct status command | N/A | No retry | Prints JSON and exits 0 | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `shutdown` | kill/cleanup/redis failure | Yes | Runtime diagnostic artifact/log | `buster_session`, `buster_cleanup`, `buster_redis` diagnostics | `reportBusterRuntimeDiagnostic` | Cleanup continues. |
| `main` | Gateway unavailable | Yes | Process diagnostic artifact/log | gateway degraded diagnostic | `emitGatewayHealthDegraded`, gateway health service | Before structured shutdown when requested. |
| `main` | Orphan recovery blocked | Yes, stderr/error only here | stderr; caller/process logs | `[RECOVERY]` error | `console.error`, thrown error | Recovery helper may emit deeper diagnostics. |
| `main` | Redis BUSYGROUP | Yes | stdout | `[REDIS] Consumer group exists` | `console.log` | Startup continues. |
| `main` loop | Task loop error | Yes | stderr | `[LOOP]` | `console.error` | Sleeps and continues. |
| `--status` | Status command | Yes | stdout JSON | `{lastRunLogDir}` | CLI branch | No error path in scoped code. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js runtime | `node` binary | Observed `v24.14.0` during review | Buster entrypoint/shims | ESM runtime/signals/process | No engines field. |
| `ioredis` | npm package | `^5.4.1` | Buster Redis services | Task queue/telemetry | Declared in package.json. |
| `js-yaml` | npm package | `^4.1.0` | Buster suite/config services | YAML parsing | Declared in package.json. |
| Redis | External service | Env-configured | Task queue/completion | Buster work dispatch | Queue internals in later batch. |
| ACP Gateway | External service | `GATEWAY_URL`/`GATEWAY_TOKEN` | Gateway health/lifecycle | Subagent sessions | Entry waits for health before polling. |
| Common helper modules | Internal source | Internal | CLI args/Git shims | Compatibility import surface | Shim-only in B00a. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Buster task polling | One process loop over Redis tasks | Redis group/consumer constants | Loop errors sleep 3000 ms and continue | stderr/logs | Queue batch has details. |
| Pending reclaim | Redis pending reclaim | README logs `PENDING_RECLAIM_IDLE_MS` | Delegated to task queue | Startup log | Later batch. |
| Shutdown | Idempotent single cleanup | `shuttingDown` flag | Repeated signals no-op | stdout/diagnostics | None. |
| Suite execution | Sequential suite order documented | Task payload `suites` | Critical manifest/build failures block spawn | Telemetry delegated | Suite batches cover details. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Buster task payload | Redis task fields listed in README | Nova dispatch | Buster validation/task lifecycle | Redis stream consumer group, pending reclaim | Task payload and telemetry. |
| Buster child session | Prompt/model/timeout/session data in task payload | Buster task lifecycle/lifecycle helpers | ACP gateway | Monitor loop delegated to session monitor | Transcript/telemetry outside B00a. |
| Buster completion | `source=buster-pipeline` completion signal after artifact read | Task lifecycle | Nova Redis completion event adapter | Emitted after cleanup | Module/gate result artifact plus Redis completion. |
| Process health diagnostic | Diagnostic JSONL, no canonical run seq | Runtime diagnostics | Operators | Written on process health failures | `.swarm/logs/buster/process-health.jsonl`. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Buster startup/status CLI and defined shutdown bindings | `check-buster-startup-smoke.mjs` | Good | None. |
| Buster public facade and helper extraction | `check-buster-pipeline-slice-surface.mjs` | Good | None. |
| Direct completion removal and no broad Redis fallback | `check-critical-dynamic-imports.mjs` | Good | Does not catch CONVENTIONS stale status text. |
| Repo-scoped path helper compatibility | `check-buster-repo-scoped-paths.mjs` | Good | None. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- `B00a-ISSUE-001` — `CONVENTIONS.md` still tells Buster subagents to update `status.json` directly.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
