# Concepts

Status: current
Audience: operators, developers, maintainers

## Purpose

Concept pages explain KubeClaw's mental model without turning into procedures or exact reference tables.

Use this section when you need to understand which part of the system owns a behavior before you choose a deployment guide, pipeline guide, or reference page. The current source of truth is active repository code, rendered manifests, generated inventory, and verification output, not archived design material.

## Guides

- [Platform model](platform-model.md): Kubernetes/Helm shape, upstream services, runtime config, and cluster boundaries.
- [Operator model](operator-model.md): setup, deployment, inspection, recovery, and maintenance responsibilities.
- [Pipeline model](pipeline-model.md): Nova/Buster ownership, module and gate flow, Redis task handoff, lifecycle state, artifacts, and telemetry.
- [Intent-driven pipeline](intent-driven-pipeline.md): why work is represented as intent, stages, gates, and evidence instead of one-off shell automation.
- [Extensibility model](extensibility-model.md): where to add pipeline modules, gates, Buster suites, verification, docs generation, and observability sinks.

## Source Of Truth

| Concept | Current owner | Main artifacts or state | Verification |
| --- | --- | --- | --- |
| Platform deployment | `scripts/deploy.sh`; `my-values/setup-secrets.sh`; `charts/kubeclaw/templates/*.yaml`; `my-values/*.yaml`; `my-values/infra/*.yaml` | Kubernetes namespace, Secrets, Helm releases, PVCs, ConfigMaps, NetworkPolicies, Services | `node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"` |
| Pipeline orchestration | `skills/nova/pipeline/cli.ts`; `skills/nova/pipeline/core/config.ts`; `skills/nova/pipeline/runners/*.ts` | `.swarm/progress.json`, module/gate lifecycle, terminal decisions | `node tests/verification/behavior/verify.mjs --source-root "$PWD" --area pipeline` |
| Buster worker boundary | `skills/buster/buster-pipeline.ts`; `skills/buster/pipeline/services/task-*.ts`; `skills/buster/pipeline/runners/suite-runner.ts` | Redis task/completion/dead-letter streams, suite verdicts, diagnostics | `node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root "$PWD"` |
| State and evidence | `skills/nova/pipeline/services/status-store.ts`; `skills/nova/pipeline/services/artifact-bundle.ts`; `skills/nova/pipeline/services/telemetry*.ts` | `canonical-events.jsonl`, `read-models.json`, `latest.json`, run-scoped `pipeline.jsonl`, telemetry streams | `node tests/verification/contracts/check-status-store-slice-surface.mjs --source-root "$PWD"` |
| Documentation and reference generation | `scripts/docs-check.mjs`; `scripts/docs-inventory.mjs`; `scripts/docs-generate.mjs` | `docs/generated/inventory/*.json`, generated sections in reference docs | `npm run docs:check` |

## Quick Checks

From the repository root:

```bash
npm run docs:check
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area pipeline
```

Failure signals:

- A docs check failure means a link, generated reference, diagram metadata, or required operator-doc section drifted.
- A deployment truth failure means a claim about Helm, images, NetworkPolicies, runtime config, Services, RBAC, or smoke checks no longer matches source.
- A pipeline behavior or contract failure means concept text about lifecycle, task handoff, status, or telemetry needs to be rechecked before publishing.

## Known Limits

Concept pages summarize current behavior. They do not replace `../deployment/`, `../operators/`, `../pipeline/`, or `../reference/` for procedures and field-level detail.

Repository-only checks do not prove provider account readiness, live CNI enforcement, or backup/restore behavior. Those gaps are tracked in `../open-issues.md` and future candidates live in `../future-implementation-ideas.md`.

## Current Boundary

Concepts describe current source-backed behavior at a high level. Planned capabilities belong in `../ROADMAP.md` or `../future-implementation-ideas.md`.
