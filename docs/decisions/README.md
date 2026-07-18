# Decision Records

Status: current
Audience: maintainer, operator

## Purpose

This section records source-backed architecture, deployment, pipeline, and security decisions that are visible in the current repository.

Use these pages when a reader needs to know why the current implementation is shaped a certain way. Use the linked architecture, deployment, pipeline, operator, or reference pages for procedures and field-level detail.

## Records

- [Architecture decisions](architecture-decisions.md): agent split, Redis transport, lifecycle authority, and source-backed docs.
- [Deployment decisions](deployment-decisions.md): shared Helm chart, NodePort/ClusterIP exposure, persistent config, local registry verification, and removed processor surfaces.
- [Fallback cleanup decisions](fallback-cleanup-decisions.md): strict canonical-authority rules for runtime fallback cleanup after E2E fixes.
- [Fallback cleanup ledger](fallback-cleanup-ledger.md): active backlog for runtime `||`, `??`, and `firstPresent(...)` cleanup, with immutable baseline backups linked from the ledger.
- [Pipeline decisions](pipeline-decisions.md): Nova lifecycle authority, Buster typed tasks, terminal decisions, and plugin registry ownership.
- [Security decisions](security-decisions.md): Buster sandbox posture, custom skill boundary, secret/runtime config materialization, network policy model, and egress.

## Source And Verification Rules

| Decision area | Source owners | Verification |
| --- | --- | --- |
| Architecture | `skills/nova/pipeline/runners/*.ts`; `skills/nova/pipeline/services/status-store.ts`; `skills/buster/pipeline/services/task-queue.ts`; `scripts/docs-check.mjs` | `node --test tests/verification/e2e/*.test.mjs`; `npm run docs:check` |
| Deployment | `scripts/deploy.sh`; `charts/kubeclaw/templates/*.yaml`; `my-values/*.yaml`; `my-values/infra/*.yaml`; Dockerfiles and workflows | `node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"` |
| Pipeline contracts | `skills/nova/pipeline/services/contracts/*.ts`; `skills/buster/pipeline/services/task-*.ts`; `skills/nova/pipeline/core/registry.ts` | pipeline terminal/step-result contract checks; Buster and registry tests |
| Security | `charts/kubeclaw/templates/secret.yaml`; `charts/kubeclaw/templates/rbac.yaml`; `my-values/infra/network-policies.yaml`; `skills/common/pipeline/security.ts`; `skills/common/pipeline/egress.ts` | deployment truth; security and egress tests |

## Change Process

Before changing a decision page:

1. Inspect the source owner named by the decision.
2. Run the verifier tied to the affected behavior.
3. Update the decision and the procedural/reference page that readers will use next.
4. If the repository cannot prove the new behavior, write it as an open question in `../open-issues.md` or a future candidate in `../future-implementation-ideas.md`.

Failure signal: a decision page that cites no source owner or verifier is not ready to be treated as current behavior.
