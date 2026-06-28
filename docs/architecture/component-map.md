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

`skills/common/pipeline/**` contains shared security, gateway, Discord webhook, Redis transport, telemetry, lifecycle, and contract helpers. Code bundles materialize role-local skills first and common skills second, so shared implementations overwrite matching `/app/skills/pipeline` facades in the runtime `/app/skills` tree. Runtime images intentionally do not bake these fast-changing skills.

The shared runtime is where cross-role contracts should live. Examples include telemetry payload schema, Redis message contracts, Discord field contracts, lifecycle-state helpers, and security utilities. Keep role-specific policy in Nova or Buster, and keep shared message validation in common code so both sides fail consistently.

### Prism

`skills/prism/**` is a design skill and convention set. The Nova values add the `ghcr.io/datrab/kubeclaw-prism-preview:latest` `prism-preview` sidecar, which serves `/designs` on port `3456` from the image entrypoint and mounts the workspace PVC at `/designs` with `subPath: prism/designs`.

### Infrastructure

Redis, Qdrant, PostgreSQL, LiteLLM, registry mirror, registry-local, and the Buster namespace fence are deployed by `scripts/deploy.sh infra`.

## Ownership And Contract Matrix

| Component or service | Behavior owner | Runtime role | Config keys or env | Outputs and artifacts | Verification |
| --- | --- | --- | --- | --- | --- |
| Nova pipeline CLI/config | `skills/nova/pipeline/cli.ts`; `skills/nova/pipeline/core/config.ts`; `skills/nova/pipeline/core/platform-config.ts` | parses operator intent, locates repo/project, loads `swarm.config.json`, validates `.swarm/progress.json` | `CURRENT_PROJECT`, `REPO_ROOT`, `SWARM_CONFIG`, `fallback_model`, `agents.*`, `plugins.*` | derived `config.paths.swarm_dir`, `config.paths.modules_dir`, plugin registry summary | `tests/skills/nova/pipeline/core/config-plugin-registry.test.mjs`; `tests/skills/nova/pipeline/core/path-segments.test.mjs`; `tests/verification/e2e/run-real-pipeline-e2e.test.mjs` |
| Nova scheduler/run loop | `skills/nova/pipeline/runners/pipeline-runner.ts`; `pipeline-runner-loop.ts`; `pipeline-runner-scheduling.ts` | owns run lock, stale reconciliation, next-step selection, terminal completion | `polling.*`, `pipeline_defaults.*`, `rate_limit.*` | `.swarm/logs/pipeline/latest.json`, lifecycle events, terminal shell status | `tests/skills/nova/pipeline/runners/pipeline-runner.test.mjs`; restart-recovery behavior area |
| Module Forge worker | `skills/nova/pipeline/runners/module-runner.ts`; `module-runner/**`; `core/registry/builtins.ts` | dispatches Forge work through gateway/subagent runtime and projects module state | `agents.forge.dispatch`, `agents.forge.acp_agent_id`, module `stages` | module status, FORGE output, summaries, lifecycle events | module runner tests; plugin registry tests |
| Buster dispatch and completion | `skills/nova/pipeline/runners/buster-gate-runner.ts`; `buster-gate-completion.ts`; `skills/buster/pipeline/services/task-queue.ts`; `task-completion.ts` | sends Redis tasks, waits for completion/dead-letter evidence, leaves Nova as lifecycle authority | `agents.buster.dispatch: redis`, `agents.buster.redis_js_path`, `BUSTER_TASK_STREAM` | Redis task/completion streams, Buster output files, dead-letter entries | `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs`; Buster service tests |
| Status and artifacts | `skills/nova/pipeline/services/status-store.ts`; `status-store-lifecycle/**`; `artifact-bundle.ts` | persists read models, latest pointer, lifecycle append log, run-scoped artifacts | `config.paths.swarm_dir`, run id, project id | `.swarm/logs/pipeline/<run-id>/`, `latest.json`, status projection files | `tests/verification/contracts/check-status-store-slice-surface.mjs`; lifecycle real E2E scenarios |
| Telemetry and notifications | `skills/nova/pipeline/services/telemetry*.ts`; `services/telemetry-sink-contract.ts`; `skills/common/pipeline/services/telemetry/payload-schema.ts` | emits canonical pipeline events to Redis/local fallback/sinks and operator notifications | `telemetry.enabled`, `discord_alerts.*`, `discord_webhook_url`, sink plugin config | telemetry stream entries, fallback JSONL, Discord/webhook messages | `tests/verification/contracts/check-telemetry-contract.mjs`; telemetry contract tests |
| OpenClaw observer plugin | `plugins/openclaw-agent-observer/src/index.ts`; `hook-normalizers.ts`; `redis-writer.ts`; `redis-transport.ts` | normalizes OpenClaw hook/model usage events and writes observer streams | `agent_observability.plugin_control.*`, `agent_observability.ingester.*`, Redis env | `openclaw.agent.*`, `openclaw.llm.*`, `openclaw.tool.*`, dead-letter stream | observer plugin tests; deployment truth verifies plugin source is packaged |
| Helm deployment surface | `charts/kubeclaw/templates/deployment.yaml`; `pvc.yaml`; `configmap-swarm-config.yaml`; production values | renders agent pods, retained config/workspace PVCs, runtime config overlays, Buster sandbox | `persistence.*`, `sandbox.*`, `gateway.url`, `service.*`, Secret refs | Kubernetes Deployments, PVCs, ConfigMaps, Services, NetworkPolicies | `tests/verification/deployment/check-deployment-truth.mjs` |
| Docs and generated references | `scripts/docs-check.mjs`; `scripts/docs-generate.mjs`; `scripts/docs-inventory.mjs` | keeps active docs inventory and generated reference slices current | docs inventory generated from `docs/**` and script/chart sources | `docs/generated/**`, inventory checks, docs-surface behavior evidence | `npm run docs:check`; `scripts/docs-check.mjs` |

Extension invariant: add new behavior at the smallest owning boundary. Platform config validation belongs in `core/config.ts`; registry/module ownership belongs under `core/registry/**`; lifecycle authority belongs in `status-store*`; Buster task contracts belong in `skills/buster/pipeline/services/**` and common task transport contracts; OpenClaw hook routing belongs in the observer plugin.
