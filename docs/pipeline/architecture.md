# Pipeline Architecture

Status: current
Audience: operator, maintainer, developer

## Overview

KubeClaw's pipeline is a Nova-owned scheduler with Buster workers behind a Redis task boundary. Nova decides what should run next, owns project state, starts and monitors agent work, evaluates gates, writes run artifacts, and emits telemetry. Buster accepts typed test tasks, validates them before doing work, runs deterministic suites, writes evidence, and publishes completion or dead-letter evidence back to Redis.

The important operational boundary is that Discord messages, logs, and Redis completions are evidence surfaces, not scheduler authority. Nova only turns validated control results into lifecycle state.

For the source-by-source implementation map, see [technical implementation map](technical-implementation-map.md).

## Core Technical Model

The runtime has three authority layers:

- Lifecycle authority: Nova appends scheduler events to `canonical-events.jsonl` and rebuilds lifecycle read models. This is the replayable source of truth for module, gate, wait, cooldown, recovery, and pipeline terminal state.
- Transport evidence: Redis task/completion streams move work between Nova and Buster. Redis completions can unblock work only after Nova validates strong run/attempt/dispatch/session identity and adjudicates them against local lifecycle/status evidence.
- Observability evidence: telemetry streams, Discord notifications, JSONL logs, summaries, and Buster artifacts explain what happened. They are read by humans and dashboards, but they do not directly advance the scheduler.

This separation is why the pipeline can recover after restarts and stale sessions. The scheduler does not ask "what did Discord say?" or "what was the last Redis status?" It asks "what lifecycle state is legal now, and which external evidence is allowed to influence the next lifecycle event?"

## Components

- Nova CLI: `skills/nova/pipeline/cli.ts`. Parses flags, loads platform and project config, initializes run logging, handles blueprint/status/dry-run commands, and calls `runPipeline(...)`.
- Platform config loader: `skills/nova/pipeline/core/config.ts`. Loads `/home/node/.openclaw/swarm.config.json`, validates platform fields, derives repo/project paths, and builds the startup-frozen plugin registry.
- Pipeline runner: `skills/nova/pipeline/runners/pipeline-runner.ts`. Acquires the run lock, starts observer/ingester services, reconciles stale state, and runs the state machine.
- Module runners: `skills/nova/pipeline/runners/module-runner.ts` and related Forge/Buster phase files. Move modules through Forge, validation, Buster, retry, and terminal states.
- Gate runners: review, approval, and Buster gate runners under `skills/nova/pipeline/runners/`.
- Plugin registry: built-in workers, gates, validators, generators, notifications, and telemetry sinks are registered through `skills/nova/pipeline/core/registry/builtins.ts`.
- Buster worker: `skills/buster/buster-pipeline.ts`. Waits for gateway readiness, prepares the sandbox, consumes Redis tasks, validates payloads, runs suites, and guarantees completion/dead-letter evidence before ACK.

## Scheduler Boundary

`runPipeline(...)` owns run-level concerns: run lock, observer startup, stale recovery, pipeline start, single-module mode, full-loop mode, and cleanup. The loop itself is delegated to `runPipelineStateMachine(...)`, which repeatedly asks scheduling for the next typed step and executes one of four actions:

- run a scheduled validator
- run a gate
- run a module
- complete or halt the pipeline

Every action returns a canonical pipeline step result. The terminal layer normalizes old compatibility shapes before deciding whether the loop continues or halts.

## Registry Boundary

Gates, validators, generators, workers, notifications, and telemetry sinks are resolved through the startup-frozen registry. That means a gate type such as `approval`, `review`, or `buster` is not just a string in `progress.json`; it must have a registered owner and a control adapter that can coerce and validate its output.

Why it is built this way:

- source ownership is explicit
- plugin/stage results can be validated before scheduler state changes
- scheduled stages receive consistent refs, IDs, state snapshots, artifacts, and execution context
- future plugin work can extend the pipeline without rewriting the scheduler loop

## Runtime Flow

For the long-form operator narrative, see [end-to-end flow](end-to-end-flow.md).

1. The operator starts Nova with `node /app/skills/pipeline.ts --project <name> --nova-channel <id>`.
2. Nova selects the repo, project, platform config, and project `.swarm/progress.json`.
3. Nova creates a run ID, initializes `.swarm/logs/pipeline`, writes `latest.json`, and acquires the pipeline lock.
4. Nova starts the OpenClaw agent observer plugin controller and agent observability ingester when enabled in `swarm.config.json`.
5. Nova reconciles stale module/gate state so a resumed run can continue from durable evidence.
6. The state machine walks `execution_order`, runs modules and `gate:<id>` entries, and schedules validators/generators through registry-owned stages.
7. Forge work dispatches through the configured OpenClaw runtime. Buster work dispatches as a typed Redis task.
8. Terminal completion writes summaries, cost/artifact records, and optional generators such as project summary, pipeline review, and case study.

## State And Ownership

Project intent lives in `<repo>/Projects/<project>/src/.swarm/progress.json`. Platform behavior lives in `/home/node/.openclaw/swarm.config.json`, rendered from `charts/kubeclaw/files/config/swarm.config.json` unless overridden at runtime.

Nova-owned state includes module status JSON, gate status JSON, run summaries, run-scoped JSONL logs, Redis audit artifacts, and telemetry sequence state. Buster-owned evidence includes suite verdicts, task output JSON, Buster task logs, screenshots/diffs where configured, and dead-letter records for invalid or failed task payloads.

## Failure Behavior

Nova has typed terminal statuses: `succeeded`, `failed`, `action_required`, `blocked`, `timed_out`, and `rate_limited`. Shell exit codes are only process-boundary adapters. Replay, telemetry, and artifacts use typed terminal fields such as `terminal_status`, `terminal_decision`, and `reason_code`.

Buster rejects malformed work before execution, dead-letters invalid payloads before ACK, and raises a terminal guarantee error if a process failure cannot produce completion or dead-letter evidence. Gateway health failures intentionally stop Buster so Kubernetes restarts the pod.

## Operator Implications

- Use `--status` first when a run looks stuck; it reads Nova's state instead of Discord history.
- Inspect `.swarm/logs/pipeline/latest.json` to find the current run directory.
- Treat Redis dead-letter entries as task contract failures, not ordinary test failures.
- Resume with `--resume --prompt "<operator decision>"` after `action_required` or timeout, once the missing decision or external condition is fixed.
- Escalate when terminal artifacts say `blocked`, when Buster repeatedly dead-letters valid-looking tasks, or when the observer/ingester reports degraded telemetry.

## Related Tasks

- [Run the pipeline](../operators/running-the-pipeline.md)
- [Technical implementation map](technical-implementation-map.md)
- [Runtime flow](runtime-flow.md)
- [Modules and gates](modules-and-gates.md)
- [Workers and Buster](workers-and-buster.md)
- [Failure and recovery](failure-and-recovery.md)
- [Telemetry and artifacts](telemetry-and-artifacts.md)
- [Configuration](configuration.md)

## Sources

- `skills/nova/pipeline/cli.ts`
- `skills/nova/pipeline/core/config.ts`
- `skills/nova/pipeline/core/registry/builtins.ts`
- `skills/nova/pipeline/runners/pipeline-runner.ts`
- `skills/nova/pipeline/runners/pipeline-runner-state-machine.ts`
- `skills/nova/pipeline/runners/pipeline-runner-scheduling.ts`
- `skills/nova/pipeline/services/completion-adjudicator.ts`
- `skills/buster/buster-pipeline.ts`
