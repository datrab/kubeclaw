# Codebase Tour

Status: current
Audience: developer

## Purpose

Map the source tree to the runtime behaviors documented elsewhere.

## Nova

`skills/nova/pipeline.ts` is the public Nova entrypoint. It delegates to `skills/nova/pipeline/cli.ts` for flags and then into the pipeline runner. `core/config.ts` validates project, repository, swarm config, and progress JSON inputs. Runner modules under `skills/nova/pipeline/runners/` execute modules, gates, polling, terminal handling, and Buster dispatch paths. Service modules own lifecycle, status, telemetry, artifacts, Redis completion, Discord notifications, redaction, summaries, and validation.

## Buster

`skills/buster/buster-pipeline.ts` starts the Buster worker. It waits for OpenClaw gateway health, recovers pending work, starts a Redis consumer group, validates task payloads, runs deterministic suites or subagent tests, writes artifacts, and acknowledges only after completion or dead-letter handling.

## Shared contracts

`skills/common/pipeline/` contains shared contracts for Redis task/completion messages, lifecycle events, telemetry payloads, task transport, redaction, runtime paths, and logging. Prefer these helpers over ad hoc schemas when adding new behavior.

## Deployment and verification

The Helm chart under `charts/kubeclaw/` controls pod shape. `my-values/` provides production values and infrastructure manifests. `tests/verification/` keeps behavior and deployment surfaces from drifting.

## Fast Ownership Map

- Config loading and validation: start in `skills/nova/pipeline/core/config.ts`, then `core/platform-config.ts` for `SWARM_CONFIG` discovery and `core/paths.ts` for repository/artifact path safety.
- Plugin and stage ownership: use `skills/nova/pipeline/core/registry/*.ts`; built-ins are bridged in `core/registry/builtins.ts`, and config overrides are normalized in `core/registry/config-normalization.ts`.
- Nova lifecycle/state: use `skills/nova/pipeline/services/status-store.ts`, `services/status-store-lifecycle/**`, and `services/artifact-bundle.ts`; do not make Redis or Discord the scheduler authority.
- Module/gate execution: use `skills/nova/pipeline/runners/module-runner.ts`, `buster-gate-runner.ts`, `review-gate-runner.ts`, and `approval-gate-runner.ts`.
- Buster worker runtime: use `skills/buster/buster-pipeline.ts`, `pipeline/services/task-queue.ts`, `task-validation.ts`, `task-completion.ts`, and `pipeline/runners/suite-runner.ts`.
- Observability: use `skills/nova/pipeline/services/telemetry*.ts` for pipeline events and `plugins/openclaw-agent-observer/src/**` for OpenClaw hook ingestion.
- Deployment shape: use `charts/kubeclaw/templates/deployment.yaml`, `pvc.yaml`, `configmap-swarm-config.yaml`, `my-values/nova-values.yaml`, `my-values/buster-values.yaml`, and `my-values/infra/network-policies.yaml`.

Before extending one of these areas, find the matching verification surface. Common anchors are `tests/skills/nova/pipeline/core/config-plugin-registry.test.mjs`, `tests/skills/nova/pipeline/core/path-segments.test.mjs`, `tests/verification/contracts/check-status-store-slice-surface.mjs`, `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs`, `tests/verification/contracts/check-telemetry-contract.mjs`, and `tests/verification/deployment/check-deployment-truth.mjs`.

## Change-To-Check Map

| You are changing | Inspect first | Run first |
| --- | --- | --- |
| platform config or plugin registry | `skills/nova/pipeline/core/config.ts`; `core/platform-config.ts`; `core/registry/*.ts`; `charts/kubeclaw/files/config/swarm.config.json` | config/plugin registry tests and `node --test tests/verification/e2e/*.test.mjs` |
| lifecycle, status, or recovery | `skills/nova/pipeline/services/status-store*.ts`; `session-authority.ts`; `pipeline-runner-recovery.ts` | `check-status-store-slice-surface.mjs`; `restart-recovery` behavior area |
| Buster task or suite behavior | `skills/buster/pipeline/services/task-*.ts`; `pipeline/runners/suite-runner.ts`; `pipeline/suites/*.ts` | Buster service/suite tests and `check-buster-pipeline-slice-surface.mjs` |
| deployment, values, secrets, images | `scripts/deploy.sh`; `my-values/setup-secrets.sh`; `charts/kubeclaw/templates/*.yaml`; Dockerfiles | deployment truth and Helm render commands |
| docs inventory or generated references | `scripts/docs-inventory.mjs`; `scripts/docs-generate.mjs`; `docs/generated/inventory/*.json` | `npm run docs:check` |

If you cannot identify the source owner, stop and search by runtime artifact name, env var, or test name before editing. The repo has multiple docs for the same broad topic; source ownership decides which one should change.
