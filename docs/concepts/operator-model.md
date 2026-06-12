# Operator Model

Status: current
Audience: operators

## Overview

Operators prepare prerequisites, create or verify secrets, deploy infrastructure, deploy agents, verify health, run pipeline tasks, inspect status and artifacts, recover failures, and maintain the platform.

## Operating Loop

1. Prepare cluster and upstream prerequisites.
2. Run setup and secret creation.
3. Deploy infrastructure.
4. Deploy Nova and Buster.
5. Verify pods, services, PVCs, gateway status, and smoke checks.
6. Run or resume pipeline work.
7. Inspect logs, status, telemetry, artifacts, and final previews.
8. Recover or escalate when checks fail.

## Source-Backed Operator Responsibilities

| Responsibility | Owner in repo | Inputs | Outputs and state | Verification |
| --- | --- | --- | --- | --- |
| Namespace, secrets, Helm repos | `scripts/deploy.sh`; `my-values/setup-secrets.sh` | `NAMESPACE`, `SRC_NS`, `KUBECLAW_SECRET_SETUP_MODE`, `KUBECLAW_SECRETS_OVERWRITE`, `TAILSCALE_OPERATOR_ENABLED` | namespace, required Kubernetes Secrets, Helm repo state | `./scripts/deploy.sh setup`; `./scripts/deploy.sh secrets`; `kubectl -n "$NAMESPACE" get secret ...` |
| Infrastructure | `scripts/deploy.sh`; `my-values/infra/*.yaml`; `my-values/infra/network-policies.yaml` | `KUBECLAW_DEPLOY_POSTGRESQL`, `KUBECLAW_DEPLOY_QDRANT`, `KUBECLAW_DEPLOY_LITELLM`, `ALLOW_PARTIAL_INFRA` | Redis, PostgreSQL, Qdrant, LiteLLM, registries, namespace fence, 13 NetworkPolicies | `./scripts/deploy.sh infra`; deployment truth check |
| Agent rollout | `charts/kubeclaw/templates/deployment.yaml`; `my-values/nova-values.yaml`; `my-values/buster-values.yaml` | `agentRole`, image values, secrets, workspace/config PVCs, service account settings | `agent-nova` and `agent-buster` Deployments, Services, PVCs, runtime config overlays | `./scripts/deploy.sh agents`; `./scripts/deploy.sh smoke`; Helm render checks |
| Pipeline operation | `skills/nova/pipeline/cli.ts`; `skills/nova/pipeline/runners/pipeline-runner.ts` | `CURRENT_PROJECT`, `REPO_ROOT`, `SWARM_CONFIG`, `.swarm/progress.json`, `--nova-channel` | lifecycle events, module/gate status, run artifacts, terminal decision | `node /app/skills/pipeline.ts --project "$CURRENT_PROJECT" --resume --nova-channel "$NOVA_CHANNEL"` in pod; pipeline behavior tests in repo |
| Failure recovery | `skills/nova/pipeline/runners/pipeline-runner-recovery.ts`; `skills/nova/pipeline/services/status-store.ts`; `skills/buster/pipeline/services/task-completion.ts` | active sessions, Redis completions/dead letters, `canonical-events.jsonl`, `read-models.json` | recovered read models, action-required or terminal status, diagnostic artifacts | `node tests/verification/behavior/verify.mjs --source-root "$PWD" --area restart-recovery`; `../operators/recovery-runbook.md` |

## Operator Commands

```bash
./scripts/deploy.sh status
./scripts/deploy.sh smoke
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
npm run docs:check
```

Use `ALLOW_PARTIAL_INFRA=true` only for explicit troubleshooting. The default infra path fails closed when required rollout checks fail.

## Limits

This page models the operator workflow; exact procedures live in `../deployment/`, `../operators/`, and `../reference/`. Provider account setup, live CNI enforcement, and backup/restore automation are not fully proven by repository-only checks.

## Related Tasks

- `../getting-started/first-deployment.md`
- `../deployment/setup-flow.md`
- `../operators/running-the-platform.md`
- `../operators/debugging.md`
- `../operators/recovery-runbook.md`
