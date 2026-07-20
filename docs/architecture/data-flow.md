# Data Flow

Status: current
Audience: maintainer, operator

## Purpose

Describe how work, state, completion, and telemetry move through the current system.

## Current Behavior

Nova loads `swarm.config.json`, then project `.swarm/progress.json`. The project name comes from `--project` or `CURRENT_PROJECT`; the repo root comes from `--repo`, `REPO_ROOT`, or Git auto-detection.

The pipeline creates a run ID and initializes `.swarm/logs/pipeline/`. It writes a global `pipeline.jsonl`, a run-scoped `runs/<run_id>/pipeline.jsonl`, and `latest.json` pointing at the active run bundle.

For module work, Nova uses built-in worker plugin definitions for `worker:module_forge` and `worker:module_buster`. Forge/Echo paths go through OpenClaw gateway session helpers. Before a Forge session starts, Nova writes the immutable completion identity context. The agent submits only semantic status, summary, and evidence; the common publisher injects identity and atomically publishes the watched completion artifact. Buster paths create typed Redis task payloads with run, module, attempt, dispatch, stage, session, suite, and output-file identity.

Buster consumes task entries from Redis, validates the canonical envelope and payload identity, rejects malformed tasks to a dead-letter path before ACK, runs suites or a subagent task lifecycle, pushes the scoped output artifact when required, emits completion to the requested completion stream, and ACKs only after terminal completion or dead-letter evidence exists.

For k8s suites, Buster creates a `BusterNamespaceLease` instead of creating namespaces directly. The namespace controller observes the lease, creates the namespace/RBAC/secret copies, and updates lease status. For final-preview leases, the controller also creates a Tailscale `Ingress`; Buster records the resulting preview URL and credential metadata in the k8s verdict. Nova reads the verdict after pipeline completion and posts the preview URL/login to Discord.

Telemetry uses Redis streams when enabled and file artifacts when Redis emission is unavailable or intentionally disabled. Pipeline artifacts are run-scoped; Discord audit artifacts mirror operator-visible notifications.

## State Stores And Artifacts

Nova writes three broad classes of state:

- lifecycle read models: module/gate state projected from canonical lifecycle events
- run logs: global and run-scoped `pipeline.jsonl`, `discord.jsonl`, and `summary.json`
- pointer files: `latest.json` points operators and tooling at the latest run bundle

The lifecycle state contains guarded fields such as `status`, `current_phase`, `fail_count`, `blockedReason`, `phase_started_at`, active session identity, dispatch identity, and latest event metadata. Those fields are projected through `status-store*.ts`, not edited as loose JSON by random pipeline stages.

Buster writes worker evidence:

- task output JSON at the requested `output_file`
- suite artifacts such as logs, screenshots, verdicts, and manifest/k8s evidence
- completion records to the requested completion stream
- dead-letter records to the task dead-letter stream when validation or terminal guarantee fails
- explicit quarantine evidence when Redis telemetry degrades

## Redis Message Flow

Module and gate Buster dispatch follow this shape:

```text
Nova
  -> archive stale completions for target/run identity
  -> publish typed task to swarm:buster:tasks
  -> wait for completion identity or output evidence

Buster
  -> read task as consumer-group member
  -> validate task_type, run_id, attempt, dispatch_id, stage_id, session, suites, paths, capabilities
  -> run suites and optional agent session
  -> publish completion to payload.completion_stream
  -> ACK task only after terminal evidence exists
```

If Buster cannot publish completion, it writes a dead-letter record before ACK. If both completion and dead-letter fail, the task terminal guarantee fails and the worker treats that as a serious runtime error.

## Authority Rules

- `progress.json` defines intended order and config, but persisted lifecycle state decides what is already complete.
- module/gate output files are evidence, but Nova projects them through typed control/result contracts before advancing.
- agents own semantic conclusions, not artifact-envelope identity. Pipeline code owns run/module/gate/attempt/dispatch/schema/timestamp/path fields and atomic publication.
- Redis telemetry streams are live observability, but local artifacts remain the durable audit trail.
- Discord messages are presentation and audit evidence; they are not scheduler truth.
- Kubernetes pod status explains runtime health, not pipeline intent.

This authority order is why the recommended stuck-run trace starts with `--status` and `latest.json`, then moves to module/gate artifacts, then Redis and pod logs.

## Source Owners And Verification

| Flow segment | Source owner | Expected artifact/state | Verification |
| --- | --- | --- | --- |
| Config and progress loading | `skills/nova/pipeline/core/config.ts`; `skills/nova/pipeline/core/platform-config.ts`; `charts/kubeclaw/files/config/swarm.config.json` | project, repo root, `.swarm/progress.json`, plugin registry summary | `node --test tests/skills/nova/pipeline/core/config-plugin-registry.test.mjs tests/skills/nova/pipeline/core/path-segments.test.mjs` |
| Pipeline lifecycle and read models | `skills/nova/pipeline/services/status-store.ts`; `skills/nova/pipeline/services/status-store-lifecycle/**` | `canonical-events.jsonl`, `read-models.json`, run-scoped `pipeline.jsonl` | `node tests/verification/contracts/check-status-store-slice-surface.mjs --source-root "$PWD"` |
| Agent semantic artifacts | `skills/common/pipeline/agent-artifact.ts`; Nova Forge writer/prompt | identity context and atomically published Forge completion | `node --test tests/skills/common/pipeline/agent-artifact.test.mjs` |
| Buster task and completion stream | `skills/buster/pipeline/services/task-queue.ts`; `task-validation.ts`; `task-completion.ts` | `swarm:<agent>:tasks`, completion stream, `:dead-letter` stream | `node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root "$PWD"` |
| Telemetry and operator mirrors | `skills/nova/pipeline/services/telemetry*.ts`; `skills/common/pipeline/telemetry.ts` | `pipeline:telemetry:<project>:<run_id>`, `discord.jsonl`, canonical run evidence and quarantine JSONL | `node tests/verification/contracts/check-telemetry-contract.mjs --source-root "$PWD"` |

## Common Breakpoints

- `Progress file not found`: `loadConfig` could not resolve `Projects/<project>/src/.swarm/progress.json`; check `CURRENT_PROJECT`, `--project`, and `REPO_ROOT`.
- `STATUS_LIFECYCLE_GUARD_VIOLATION`: code attempted to mutate guarded lifecycle fields outside the lifecycle append path.
- `BUSTER_TASK_MALFORMED`: Redis task payload lacks identity, has unsafe paths, unknown capabilities, or invalid `test_config`.
- Redis completion conflicts with lifecycle state: treat Redis as candidate evidence, then inspect run-scoped lifecycle events before retrying.
- Telemetry exists without local artifacts: keep local `pipeline.jsonl` and read models as durable audit authority.
