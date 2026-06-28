# Diagrams

Status: current
Audience: maintainers, docs contributors

This directory contains editable SVG diagrams embedded from active Markdown pages. Keep diagrams operational and source-backed: use current component names, avoid target-state behavior unless labeled, and update the related docs page when a diagram changes.

## Diagram Index

| Diagram | Use when | Source-backed owners to check | Related page |
| --- | --- | --- | --- |
| `deployment-topology.svg` | explaining Nova/Buster agents, Services, PVCs, config, and cluster exposure | `charts/kubeclaw/templates/deployment.yaml`; `service.yaml`; `pvc.yaml`; `my-values/nova-values.yaml`; `my-values/buster-values.yaml` | `../architecture/runtime-topology.md`; `../deployment/deployment-overview.md` |
| `infrastructure-dependencies.svg` | explaining Redis, PostgreSQL, Qdrant, LiteLLM, registry, and optional Tailscale dependencies | `scripts/deploy.sh`; `my-values/infra/*.yaml`; `my-values/setup-secrets.sh` | `../deployment/infrastructure.md` |
| `secret-flow.svg` | explaining setup/copy/prompt Secret flow and runtime config materialization | `my-values/setup-secrets.sh`; `charts/kubeclaw/templates/secret.yaml`; `charts/kubeclaw/templates/configmap-gateway.yaml`; `charts/kubeclaw/templates/deployment.yaml` | `../deployment/secrets.md`; `../reference/secrets.md` |
| `pipeline-runtime-flow.svg` | explaining Nova config load, scheduling, modules, gates, status, artifacts, and telemetry | `skills/nova/pipeline/cli.ts`; `skills/nova/pipeline/core/config.ts`; `skills/nova/pipeline/runners/*.ts`; `skills/nova/pipeline/services/status-store.ts` | `../pipeline/runtime-flow.md`; `../concepts/pipeline-model.md` |
| `buster-worker-flow.svg` | explaining Redis task intake, validation, suite execution, completion, and dead letter handling | `skills/buster/buster-pipeline.ts`; `skills/buster/pipeline/services/task-queue.ts`; `task-validation.ts`; `task-completion.ts`; `runners/suite-runner.ts` | `../pipeline/workers-and-buster.md` |
| `final-preview-tailscale-flow.svg` | explaining final preview exposure through the Tailscale operator | `scripts/deploy.sh`; `my-values/infra/tailscale-operator-values.yaml`; `charts/kubeclaw/templates/service-extra-nodeports.yaml` | `../operators/final-preview-tailscale.md` |
| `failure-recovery-decision-flow.svg` | explaining lifecycle evidence, Redis completion/dead-letter signals, recovery, and escalation | `skills/nova/pipeline/runners/pipeline-runner-recovery.ts`; `skills/nova/pipeline/services/session-authority.ts`; `skills/buster/pipeline/services/task-completion.ts` | `../operators/recovery-runbook.md`; `../pipeline/failure-and-recovery.md` |

## Edit Checklist

Before changing or adding a diagram:

1. Inspect the source owners in the table.
2. Update the Markdown page that embeds or explains the diagram.
3. Keep the SVG accessible with `<title>` and `<desc>` elements.
4. Avoid showing future behavior unless the diagram label says it is future or planned.
5. Run the diagram and docs checks.

## Verification

```bash
npm run docs:check
npm run docs:check
```

`scripts/docs-check.mjs` verifies that every SVG in this directory has an `<svg>` root, a `<title>`, and a `<desc>`. It does not verify that the diagram content matches source, so content changes still require manual source inspection.

Failure signals:

- missing `<title>` or `<desc>` fails `npm run docs:check`
- a diagram that mentions removed components should be corrected or moved to an archived/historical page
- a diagram change that affects deployment, secrets, runtime flow, or recovery should trigger the verifier tied to that behavior, not only the docs check
