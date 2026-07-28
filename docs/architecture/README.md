# Architecture

Status: current
Audience: maintainer, operator

## Purpose

This section explains how KubeClaw is structured at system, runtime, data, lifecycle, security, and observability levels.

For high-level mental models before architecture details, start with `../concepts/README.md`.

## Guides

- [System overview](system-overview.md)
- [Component map](component-map.md)
- [Runtime topology](runtime-topology.md)
- [Data flow](data-flow.md)
- [Lifecycle and state](lifecycle-and-state.md)
- [Security model](security-model.md)
- [Observability model](observability-model.md)
- [Plugin system vision](plugin-system-vision.md) — planned self-contained plugin architecture, not current runtime behavior
- [Plugin system implementation plan](plugin-system-implementation-plan.md) — phased cutovers, decision gates, and verification
- [Plugin system current inventory](plugin-system-current-inventory.md) — generated ownership, dependency, effect, legacy-contract, and extraction evidence

## Source Authority Map

Use this section when you need to verify an architecture claim before changing a doc or implementation file.

| Architecture area | Source owners | Runtime inputs and outputs | Verification |
| --- | --- | --- | --- |
| Deployed pod, Service, PVC, and ConfigMap shape | `charts/kubeclaw/templates/deployment.yaml`; `charts/kubeclaw/templates/service.yaml`; `charts/kubeclaw/templates/pvc.yaml`; `charts/kubeclaw/templates/configmap-gateway.yaml`; `charts/kubeclaw/templates/configmap-swarm-config.yaml` | values from `charts/kubeclaw/values.yaml`, `my-values/nova-values.yaml`, and `my-values/buster-values.yaml`; rendered Deployments, Services, PVCs, and ConfigMaps | `helm template kubeclaw charts/kubeclaw -f my-values/nova-values.yaml`; `helm template kubeclaw charts/kubeclaw -f my-values/buster-values.yaml`; `node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"` |
| Pipeline orchestration and lifecycle authority | `skills/nova/pipeline/cli.ts`; `skills/nova/pipeline/runners/pipeline-runner.ts`; `skills/nova/pipeline/runners/module-runner.ts`; `skills/nova/pipeline/runners/gate-runner.ts`; `skills/nova/pipeline/runners/pipeline-runner-terminal.ts` | `CURRENT_PROJECT`, `REPO_ROOT`, `SWARM_CONFIG`, `.swarm/progress.json`; status read models, lifecycle events, terminal decisions, pipeline artifacts | `node --test tests/verification/e2e/*.test.mjs`; `node tests/verification/contracts/check-pipeline-runner-slice-surface.mjs --source-root "$PWD"` |
| Buster worker boundary | `skills/buster/buster-pipeline.ts`; `skills/buster/pipeline/services/task-queue.ts`; `skills/buster/pipeline/services/task-validation.ts`; `skills/buster/pipeline/services/task-completion.ts`; `skills/buster/pipeline/services/runtime-policy.ts` | `BUSTER_TASK_STREAM`, Redis task/completion/dead-letter streams, Buster heartbeat file, sandbox outputs | `node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root "$PWD"`; `node --test tests/skills/buster/pipeline/services/task-validation.test.mjs tests/skills/buster/pipeline/services/task-completion.test.mjs` |
| Security and network boundary | `my-values/infra/network-policies.yaml`; `charts/kubeclaw/templates/rbac.yaml`; `my-values/infra/buster-namespace-fence.yaml`; `charts/kubeclaw/templates/deployment.yaml` | 13 portable NetworkPolicies, Buster namespace lease RBAC, sandbox security context, NodePort exposure for Prism preview and LiteLLM | deployment truth check; `kubectl auth can-i` checks from `../operators/security-operations.md` |
| Observability and artifacts | `skills/nova/pipeline/services/telemetry.ts`; `skills/nova/pipeline/services/telemetry/builders.ts`; `skills/nova/pipeline/services/telemetry/dispatch.ts`; `skills/nova/pipeline/services/artifact-bundle.ts`; `skills/common/plugins/openclaw-agent-observer/src/index.ts` | telemetry events, Redis telemetry stream entries, `pipeline.jsonl`, `latest.json`, run-scoped artifact bundle files | `node tests/verification/contracts/check-telemetry-contract.mjs --source-root "$PWD"`; `node tests/verification/contracts/check-telemetry-contract.mjs --source-root "$PWD"` |

## Failure And Change Signals

Architecture docs should be updated when any of these source-backed signals change:

- `tests/verification/deployment/check-deployment-truth.mjs` adds, removes, or renames a rendered manifest assertion.
- `charts/kubeclaw/templates/deployment.yaml` changes runtime mounts, init flow, health checks, sidecars, or sandbox security context.
- `skills/nova/pipeline/core/config.ts` changes required `swarm.config.json` keys or rejects a previously allowed config shape.
- `skills/buster/pipeline/services/task-validation.ts` changes required task identity fields or capability validation.
- `skills/nova/pipeline/services/artifact-bundle.ts` changes artifact authority roles or file surfaces.

## Limitations

This page is an architecture index. It does not replace the deeper source-backed pages listed above, and it does not claim live-cluster behavior beyond what the Helm/deployment verification checks can prove from repository source.
