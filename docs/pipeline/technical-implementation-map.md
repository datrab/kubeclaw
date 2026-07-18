# Technical Implementation Map

Status: current
Audience: maintainer, developer

## Purpose

This page maps the moving and static parts of the pipeline to the current source tree. It is the technical companion to [end-to-end flow](end-to-end-flow.md): that page explains the run as an operator story; this page explains which code owns each behavior, what happens, why it exists, and when it is active.

The current implementation is TypeScript-first. Nova source lives mainly under `skills/nova/pipeline/`, shared contracts live under `skills/common/pipeline/`, and Buster worker source lives under `skills/buster/`.

## Static Parts

Static parts describe intended work and platform policy. They are read at startup or at stage boundaries; they do not by themselves advance the pipeline.

- Project intent: `Projects/<project>/src/.swarm/progress.json`. This declares `execution_order`, modules, gates, defaults, validators, generators, suite choices, and per-stage timeouts/retry limits.
- Platform config: `/home/node/.openclaw/swarm.config.json`, normally rendered from `charts/kubeclaw/files/config/swarm.config.json`. This supplies global defaults, model policy, Redis/Discord/runtime settings, rate-limit policy, and plugin/observer settings.
- Startup registry: `skills/nova/pipeline/core/registry/`. Built-in validators, generators, gates, workers, telemetry sinks, and notifications are loaded once for the run. Gate and stage dispatch uses this registry instead of switch statements scattered through the scheduler.
- Source path policy: `skills/nova/pipeline/core/paths.ts`, `skills/nova/pipeline/core/config.ts`, and Buster task validation helpers reject unsafe project paths, parent traversal, and ambiguous runtime locations.
- Typed contracts: `skills/nova/pipeline/services/contracts/`, `skills/common/pipeline/services/*-contract.ts`, and Buster's `pipeline/services/*-contract.ts` define what a stage result, Redis message, telemetry event, task queue adapter, and terminal decision must look like. `skills/common/pipeline/agent-artifact.ts` owns immutable identity and atomic publication for semantic artifacts produced by agents.
- Built-in Buster suites: `skills/buster/pipeline/suites/*.ts`. Suite code is deterministic evidence. It may stop a Buster task before any child agent is spawned.
- Prompt builders: `skills/nova/pipeline/prompts/*.ts`. These shape Forge, Buster, review, and fix prompts, but prompts are not lifecycle authority.

## Moving Parts

### 1. CLI Entrypoint

Source: `skills/nova/pipeline.ts`, `skills/nova/pipeline/cli.ts`.

The CLI parses operator flags, chooses the repo/project, loads config, initializes runtime paths, and calls `runPipeline(...)`. Commands such as `--status` and `--dry-run` use the same loaders but do not run the scheduler.

Why: this keeps operator commands and real runs on the same config path, so status/dry-run expose the same project that a run would execute.

### 2. Config Loader And Runtime Context

Source: `skills/nova/pipeline/core/config.ts`, `core/runtime.ts`, `core/platform-config.ts`, `core/context.ts`.

The loader merges platform defaults, project settings, environment variables, and runtime flags. It also initializes run identity and constructs plugin contexts.

Why: stages need stable IDs, paths, telemetry context, and registry state. They should not rediscover config independently.

### 3. Run ID, Log Directories, And Artifact Bundle

Source: `skills/nova/pipeline/core/paths.ts`, `services/artifact-bundle.ts`, `services/summary.ts`.

Each run gets a run ID and a run-scoped directory under `.swarm/logs/pipeline/runs/<run_id>/`. `latest.json` points operators and automation to the current or latest run.

Why: pipeline evidence must survive pod restarts and must be traceable after Discord/Redis history has moved on.

### 4. Pipeline Run Lock

Source: `runners/pipeline-runner.ts`, `runners/pipeline-runner-lock.ts`, `runners/pipeline-runner-recovery.ts`.

Nova acquires a run lock before advancing state. The lock has heartbeat/abort behavior. If the lock is lost, in-flight steps are aborted and given a short settle period.

Why: two Nova runners writing lifecycle state for the same project would corrupt scheduler truth. The lock makes concurrent execution fail closed.

### 5. Agent Observer And Ingester

Source: `services/openclaw-plugin-runtime.ts`, `services/agent-observability-runtime.ts`, `services/agent-observability-ingester/`.

At run start Nova can start the OpenClaw agent observer plugin controller and a Redis-backed ingester. These observe child session events and usage pressure.

Why: child agent state is an external moving part. The scheduler still owns lifecycle, but observability gives it and operators better evidence for stale sessions, degraded streams, and token/cost attribution.

### 6. Stale Recovery

Source: `runners/pipeline-runner-recovery.ts`, `services/session-authority.ts`, `agents/session-termination.ts`, `services/failure-semantics.ts`.

Before the state machine advances, Nova checks modules in `IN_PROGRESS` or `TESTING` and gates with active sessions. It confirms session identity, observes gateway/session surfaces, terminates orphaned sessions when allowed, and appends recovery events.

Why: a restarted pod can leave local state that says "active" while the actual child session is gone, or the inverse. Recovery must prove identity before it resets anything.

### 7. Lifecycle Event Log And Read Models

Source: `services/status-store-lifecycle/storage.ts`, `appenders.ts`, `read-models.ts`, `projections.ts`, `legality.ts`, `idempotency.ts`.

Nova appends lifecycle events to `canonical-events.jsonl` and rebuilds `read-models.json`. Appends are protected by an append lock, idempotency key, and legality checks.

Why: module status JSON is too easy to mutate incorrectly. The append-only lifecycle log gives a replayable source of truth, while read models give fast scheduler/operator projections.

### 7a. Completion Reducer

Source: `skills/common/pipeline/completion.ts`, `services/status-store-lifecycle/appenders.ts`.

Phase and gate runners submit small completion records to the lifecycle reducer. The reducer validates target, phase, attempt, status, and evidence authority, then appends the lifecycle event that updates read models. Runtime session data is carried as observation only.

Why: Forge, Buster, validators, gates, future agents, and human approvals need one completion boundary. Without it, Redis output, local artifacts, child-session metadata, and telemetry hooks can each accidentally become competing state authorities.

### 8. Pipeline Start Event

Source: `runners/pipeline-runner-start.ts`, `services/status-store.ts`, `services/telemetry.ts`.

Start writes pipeline lifecycle and telemetry events with run mode, execution order, modules, gates, model defaults, and whether a Nova prompt was supplied.

Why: the first event captures the plan the scheduler saw. Later debugging can compare actual behavior against this startup snapshot.

### 9. Scheduler And `execution_order`

Source: `runners/pipeline-runner-state-machine.ts`, `runners/pipeline-runner-scheduling.ts`, `runners/pipeline-runner-loop.ts`.

`findNextStep(...)` projects module/gate/validator state and returns a typed next step: done, blocked, validator, gate, or module. `planPipelineStep(...)` converts that into an action. The loop runs the action and normalizes the result into a canonical pipeline step result.

Why: the scheduler does not execute arbitrary JSON entries. It executes typed steps with typed outcomes, so every stop/continue decision passes through one normalization boundary.

### 10. Validators

Source: `runners/pipeline-runner-scheduling.ts`, `services/arch-validator.ts`, `services/module-validators.ts`, `services/contracts/validator-control-result.ts`.

Validators run as scheduled registry stages. They receive stage refs, state snapshots, config, and artifact refs. Results are normalized to validator control results and then pipeline step results.

Why: validation failures and validator execution failures mean different things. Typed validator results let Nova distinguish "code must change" from "tool/runtime broke."

### 11. Generators

Source: `runners/pipeline-runner-scheduling.ts`, `services/summary.ts`, `services/case-study.ts`, `services/blueprint.ts`.

Generators run from registry-owned stages, usually at terminal or milestone moments. They receive state snapshots and artifact refs, then emit generated artifacts such as summaries, pipeline review, and case study output.

Why: generated documentation/reporting is downstream of scheduler state. It should not mutate module/gate truth.

### 12. Module Retry Loop

Source: `runners/module-runner.ts`, `runners/module-runner/attempt.ts`, `services/failures/retry-policy.ts`.

`runModule(...)` wraps `executeModuleAttempt(...)` in a retry loop. Each attempt re-reads current state, checks dependencies, executes the attempt state machine, emits retry telemetry when needed, and sleeps briefly before retrying.

Why: retry accounting must use fresh durable state after `handleFail(...)` persists failure summaries and fail counts.

### 13. Module Attempt State Machine

Source: `runners/module-runner/state-machine.ts`, `module-runner-forge.ts`, `module-runner-prebuster.ts`, `module-runner-buster-worker.ts`, `module-runner/terminal-results.ts`.

One attempt decides whether to run Forge, skip Forge, run pre-Buster checks, dispatch Buster, or return terminal PASS/FAIL/BLOCKED/TIMEOUT/RATE_LIMITED. `stages` controls which phase exists for a module.

Why: `["forge"]`, `["buster"]`, and `["forge", "buster"]` have different operational semantics. A single attempt state machine makes those branches explicit.

### 14. Forge Worker

Source: `agents/orchestration.ts`, `agents/module-workers.ts`, `prompts/shared.ts`, `agents/lifecycle.ts`, `services/forge-completion.ts`, `tools/write-forge-completion.ts`, and the shared `skills/common/pipeline/agent-artifact.ts`.

Forge is spawned through OpenClaw runtime adapters. Nova persists active session identity, writes an immutable artifact-identity context, monitors the session, validates the semantic completion payload, commits produced changes when appropriate, and applies completion through the lifecycle reducer. The agent supplies status, summary, and evidence; Nova injects run/module/attempt/schema/timestamp/output identity and atomically publishes the watched artifact.

Why: Forge is nondeterministic and external. Nova wraps it with durable identity, pipeline-owned artifact publication, polling, git evidence, and lifecycle transitions so an otherwise correct implementation cannot be retried because an agent mistyped envelope metadata.

### 15. Pre-Buster Validation

Source: `runners/module-runner-prebuster.ts`, `services/validation.ts`, `services/lint.ts`, `tools/lint-report.ts`.

Before Buster dispatch, Nova can run delivery lint, pre-checks, full lint, and other validators. Some failures route back to Forge; execution failures can block as environment/tooling failures.

Why: deterministic local checks are cheaper and safer than sending broken or unprepared work into Buster.

### 16. Buster Task Dispatch

Source: `runners/module-runner/buster-phase/dispatch.ts`, `runners/buster-gate-task.ts`, `tools/redis.ts`, `services/redis-completion.ts`.

Nova builds a `module_test` or `gate_test` payload with run ID, attempt, dispatch ID, session identity, suites, output path, commit hash, timeout, and stage ID. It publishes through the task queue contract to the Buster Redis stream.

Why: Buster must receive enough identity to prove a completion belongs to the active dispatch, not a previous attempt.

### 17. Redis Task Queue

Source: `skills/common/pipeline/services/task-transport-contract.ts`, `skills/buster/pipeline/services/task-queue.ts`, `skills/nova/pipeline/tools/redis.ts`.

Production transport uses Redis Streams. Nova publishes with `XADD`. Buster ensures a consumer group, reclaims idle pending tasks with `XAUTOCLAIM`, reads with `XREADGROUP`, acknowledges with `XACK`, and trims with `XTRIM`.

Why: Redis gives durable-ish asynchronous handoff between Nova and Buster pods. The queue contract keeps stream mechanics isolated from scheduler logic.

### 18. Buster Worker Startup

Source: `skills/buster/buster-pipeline.ts`, `pipeline/services/gateway-health.ts`, `pipeline/services/orphan-recovery.ts`, `pipeline/services/sandbox-cleanup.ts`.

Buster waits for gateway readiness, recovers allowed orphan sessions, cleans the sandbox, starts gateway health monitoring, optionally prepares base images, creates the consumer group, then polls tasks.

Why: a worker should not accept tasks until the runtime surfaces it depends on are healthy.

### 19. Task Validation And Dead Letter

Source: `skills/buster/pipeline/services/task-validation.ts`, `redis-message-contract.ts`, `task-completion.ts`, `runtime-diagnostics.ts`.

Buster validates the Redis envelope and payload before work. Malformed JSON, invalid envelopes, unknown task types, missing identity, unsafe paths, unknown capabilities, or wrong worker type are dead-lettered before ACK.

Why: task payloads are untrusted transport data. Invalid work must become durable evidence and must not run arbitrary filesystem/session operations.

### 20. Buster Suite Runner

Source: `skills/buster/pipeline/runners/suite-runner.ts`, `skills/buster/pipeline/suites/*.ts`.

Suites run in dependency order, enforce capabilities, emit telemetry, write result artifacts, and produce critical/noncritical verdicts. Critical suite failures prevent child session spawn.

Why: deterministic evidence should gate agent work. If a build, health check, or manifest check already proves failure, spawning another agent is waste.

### 21. Buster Child Session

Source: `skills/buster/pipeline/services/task-lifecycle/session.ts`, `pipeline/agents/runtime.ts`, `pipeline/agents/acp-monitor.ts`, `pipeline/agents/lifecycle.ts`.

When deterministic suites allow it, Buster spawns the requested ACP/subagent session, monitors it, kills/cleans it at completion or timeout, and publishes the task outcome.

Why: Buster agents are used after concrete evidence exists, not as the first source of truth.

### 22. Completion Signal

Source: `skills/buster/pipeline/services/task-lifecycle/completion-signal.ts`, `task-completion.ts`, `skills/nova/pipeline/services/redis-completion.ts`.

Buster writes completion records to the completion stream with schema version, stream role, target kind, module/gate identity, status/outcome, run ID, attempt, dispatch ID, session key, reason, and timestamps.

Why: Nova polls completions asynchronously. Strong identity prevents stale PASS/FAIL from unblocking the wrong attempt.

### 23. Completion Adjudication

Source: `skills/nova/pipeline/services/completion-adjudicator.ts`, `polling-redis-completion.ts`, `polling-dual.ts`, `buster-completion-controller.ts`.

Nova projects Redis completion and local lifecycle/status evidence, checks active dispatch identity, detects drift/conflicts, and decides whether Redis is allowed to update local status.

Why: Redis is evidence, not absolute authority. A terminal Redis completion can be applied only when it matches the active dispatch policy.

### 24. Gates

Source: `runners/gate-runner.ts`, `review-gate-runner.ts`, `approval-gate-runner.ts`, `buster-gate-runner.ts`, `remediable-gate-engine.ts`, `waitable-gate-engine.ts`, `services/status-store-lifecycle/appenders.ts`.

The gate runner resolves gate type ownership through the startup registry, builds a stage envelope, normalizes typed gate control results, and maps accepted terminal controls to lifecycle completions before producing pipeline step results. Remediable gates can run Forge fix cycles. Waitable gates open waits and close them from resume signals.

Why: gates evaluate cross-module policy and operator decisions. Keeping them separate from module attempts avoids hiding global policy inside module retry counters.

### 25. Approval And Wait Signals

Source: `approval-gate-control.ts`, `approval-gate-state.ts`, `approval-signal-event-adapter.ts`, lifecycle wait appenders.

Approval gates write wait lifecycle events, request artifacts, timeout policy, and decision evidence. Resume signals must match open waits and supported signal kinds.

Why: human decisions are part of runtime state. They need durable refs and legality checks just like module attempts.

### 26. Review And Fix Cycles

Source: `review-gate-control.ts`, `review-gate-fix-cycle.ts`, `gate-forge-fix-cycle.ts`, `services/gate-fix-scaffold.ts`, `prompts/gate-fix.ts`.

Review and Buster gates can produce FAIL/FAIL findings, spawn Forge fix sessions, monitor them, then rerun the gate until pass or configured fix limits are exhausted.

Why: gate failures often need targeted remediation without rerunning the whole pipeline from the beginning.

### 27. Rate-Limit Handling

Source: `services/rate-limit.ts`, `rate-limit-builders.ts`, `rate-limit-exit.ts`, `failures/retry-policy.ts`, lifecycle cooldown appenders.

Rate-limit detection can start durable cooldowns with resume times. The scheduler checks cooldowns before running a step and resumes them when due.

Why: provider rate limits are not code failures. Treating them as cooldowns prevents burning retry attempts on temporary capacity issues.

### 28. Terminal Result And Exit

Source: `runners/pipeline-runner-terminal.ts`, `services/contracts/terminal-decision.ts`, `services/contracts/pipeline-step-result.ts`.

Every step result is normalized. Continue results let the loop advance. Halt/block/error/timeout/rate-limit results produce typed terminal evidence, summaries, and process exit mapping.

Why: shell exit codes are too small to describe scheduler state. Typed terminal evidence is what operators and future automation should read.

### 29. Telemetry

Source: `services/telemetry.ts`, `services/telemetry/*`, `services/telemetry-sink-contract.ts`, `skills/common/pipeline/services/telemetry/payload-schema.ts`, Buster `pipeline/services/telemetry.ts`.

Nova and Buster emit pipeline, module, gate, task, suite, plugin, notification, rate-limit, and observability events. Sinks validate payloads before writing to Redis or Discord.

Why: telemetry is for live observers and dashboards. Validation prevents sinks from becoming a second inconsistent event format.

### 30. Discord Notifications

Source: `services/notification-contract.ts`, `notification-dispatch.ts`, `integrations/discord.ts`, `integrations/discord-webhook.ts`, Buster `pipeline/services/discord.ts`.

Discord receives selected presentation events with identity fields and bounded summaries. Local `discord.jsonl` artifacts capture sent notification context.

Why: Discord is for humans. It must include enough identity to correlate with artifacts, but it is not the scheduler source of truth.

### 31. Security And Boundary Checks

Source: `core/paths.ts`, `security.ts`, Buster `task-validation.ts`, `pipeline/security.ts`, suite capability checks.

The pipeline rejects unsafe paths, unknown capabilities, invalid task types, ambiguous config, and invalid contract results before those inputs mutate state or run work.

Why: the pipeline crosses trust boundaries: project JSON, Redis, child agents, Kubernetes, and filesystem writes. Every boundary needs validation before execution.

## Event-Driven Architecture

The pipeline is event-driven in three layers:

- Scheduler events: lifecycle events in `canonical-events.jsonl` are the replayable authority for pipeline/module/gate state.
- Transport events: Redis task and completion streams decouple Nova scheduling from Buster execution.
- Observability events: telemetry streams, Discord notifications, JSONL logs, and artifact files describe what happened for humans and dashboards.

These layers intentionally do not have equal authority. Lifecycle events decide scheduler state. Redis completions can influence lifecycle only after identity/adjudication checks. Telemetry and Discord explain behavior but do not advance the scheduler.

## When To Read Which Surface

- Need current scheduler truth: use `node /app/skills/pipeline.ts --project <project> --status`.
- Need the latest run directory: read `.swarm/logs/pipeline/latest.json`.
- Need replayable lifecycle history: read `runs/<run_id>/lifecycle/canonical-events.jsonl`.
- Need projected module/gate state: read `runs/<run_id>/lifecycle/read-models.json` or the CLI status projection.
- Need Buster task status: inspect Buster task output, `buster-pipeline.jsonl`, Redis completion/dead-letter streams, and Buster pod logs.
- Need notification history: read `discord.jsonl`.
- Need live dashboards: read `pipeline:telemetry:<project>:<run_id>`.

## Sources Checked

- `skills/nova/pipeline/cli.ts`
- `skills/nova/pipeline/runners/pipeline-runner.ts`
- `skills/nova/pipeline/runners/pipeline-runner-state-machine.ts`
- `skills/nova/pipeline/runners/pipeline-runner-scheduling.ts`
- `skills/nova/pipeline/runners/module-runner.ts`
- `skills/nova/pipeline/runners/module-runner/attempt.ts`
- `skills/nova/pipeline/runners/gate-runner.ts`
- `skills/nova/pipeline/services/status-store-lifecycle/*`
- `skills/nova/pipeline/services/completion-adjudicator.ts`
- `skills/nova/pipeline/tools/redis.ts`
- `skills/common/pipeline/services/task-transport-contract.ts`
- `skills/buster/buster-pipeline.ts`
- `skills/buster/pipeline/services/task-queue.ts`
- `skills/buster/pipeline/services/task-lifecycle.ts`
- `skills/buster/pipeline/runners/suite-runner.ts`
