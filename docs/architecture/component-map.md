# Component Map

Status: current
Audience: maintainer, operator

## Purpose

List the active components, where they run, and what they own.

## Current Behavior

### Nova

Runtime location: `agent-nova` Deployment, `kubeclaw` container, general image.

Owns:

- pipeline CLI and run loop
- module scheduling
- built-in worker, gate, validator, generator, notification, and telemetry plugin definitions
- Forge and Echo dispatch through OpenClaw gateway helpers
- Buster task dispatch and completion polling
- lifecycle read models, run-scoped artifacts, Redis audit logs, and operator alerts

Inputs: `CURRENT_PROJECT`, `REPO_ROOT`, `SWARM_CONFIG`, `OPENCLAW_GATEWAY_URL`, `OPENCLAW_GATEWAY_TOKEN`, Redis, LiteLLM, Discord, Git repo, project `.swarm/progress.json`.

Outputs: `.swarm/logs/**`, Redis completion/telemetry streams, Discord/webhook notifications, git changes through project pipeline work.

Primary code paths:

- CLI: `skills/nova/pipeline/cli.ts`
- config loading: `skills/nova/pipeline/core/config.ts`
- run orchestration: `skills/nova/pipeline/runners/pipeline-runner.ts`
- scheduling: `skills/nova/pipeline/runners/pipeline-runner-scheduling.ts`
- module lifecycle: `skills/nova/pipeline/runners/module-runner.ts` and `skills/nova/pipeline/runners/module-runner/**`
- gate lifecycle: `skills/nova/pipeline/runners/*gate*runner.ts`
- lifecycle state/read models: `skills/nova/pipeline/services/status-store*.ts`
- terminal decisions: `skills/nova/pipeline/runners/pipeline-runner-terminal.ts`
- telemetry: `skills/nova/pipeline/services/telemetry*.ts`

Operational invariants:

- A run lock must be active while Nova mutates pipeline state.
- `progress.execution_order` is projected through persisted lifecycle state before work is selected.
- Shell exit code is not replay state; typed terminal status and reason codes are the durable boundary.
- Gateway/Redis/Discord evidence is not accepted blindly. It is normalized through contracts before scheduler state changes.

### Buster

Runtime location: `agent-buster` Deployment, `kubeclaw` gateway and `buster-pipeline` worker containers, sandbox image.

Owns:

- Redis consumer group on `swarm:buster:tasks` by default
- task validation for `module_test` and `gate_test`
- deterministic suite execution and sandbox cleanup
- gateway-side agent test execution through OpenClaw gateway helpers
- scoped output artifact push before completion
- completion or dead-letter before Redis ACK
- gateway health monitoring and structured shutdown

Inputs: Redis task messages, `OPENCLAW_GATEWAY_URL`, `OPENCLAW_GATEWAY_TOKEN`, `BUSTER_TASK_STREAM`, Git repo, suite config, capabilities.

Outputs: Buster output files, completion stream entries, dead-letter entries, run logs, telemetry/fallback artifacts, optional Discord media evidence.

Primary code paths:

- worker entrypoint: `skills/buster/buster-pipeline.ts`
- task queue: `skills/buster/pipeline/services/task-queue.ts`
- task validation: `skills/buster/pipeline/services/task-validation.ts`
- completion/dead-letter guarantee: `skills/buster/pipeline/services/task-completion.ts`
- suite runner: `skills/buster/pipeline/runners/suite-runner.ts`
- built-in suites: `skills/buster/pipeline/suites/*.ts`
- runtime diagnostics: `skills/buster/pipeline/services/runtime-diagnostics.ts`
- gateway health: `skills/buster/pipeline/services/gateway-health.ts`

Operational invariants:

- Buster ACKs a Redis task only after completion evidence or dead-letter evidence exists.
- Malformed payloads are rejected before execution.
- Path fields are scoped to the repository root and cannot use parent traversal.
- `module_test` and `gate_test` are the accepted task types.
- Buster can produce validation evidence, but Nova decides how that evidence affects lifecycle state.

### Common Runtime

`skills/common/pipeline/**` contains shared security, gateway, Discord webhook, Redis transport, telemetry, lifecycle, and contract helpers. Dockerfiles copy role-local skills first and common skills second, so shared implementations overwrite matching `/app/skills/pipeline` facades in the image.

The shared runtime is where cross-role contracts should live. Examples include telemetry payload schema, Redis message contracts, Discord field contracts, lifecycle-state helpers, and security utilities. Keep role-specific policy in Nova or Buster, and keep shared message validation in common code so both sides fail consistently.

### Prism

`skills/prism/**` is a design skill and convention set. The Nova values add a `node:20-alpine` `prism-preview` sidecar that runs `npx serve /designs -p 3456 --no-clipboard` and mounts the workspace PVC at `/designs` with `subPath: prism/designs`.

### Infrastructure

Redis, Qdrant, PostgreSQL, LiteLLM, registry mirror, registry-local, and the Buster namespace fence are deployed by `scripts/deploy.sh infra`.
