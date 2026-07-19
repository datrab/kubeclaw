# Platform Model

Status: current
Audience: operators, maintainers

## Overview

KubeClaw deploys an OpenClaw-based agent platform into Kubernetes. The production shape uses a shared Helm chart for agent pods, separate values files for Nova and Buster, and infrastructure manifests or upstream charts for Redis, Qdrant, PostgreSQL, LiteLLM, registries, and Tailscale.

## Current Components

- Nova is the orchestration agent.
- Buster is the sandboxed test worker.
- Redis carries task, completion, and telemetry traffic.
- Qdrant supports OpenClaw memory.
- LiteLLM can provide an OpenAI-compatible model proxy backed by PostgreSQL.
- Tailscale Kubernetes Operator can expose final previews through tailnet ingress.

## Source-Backed Platform Map

| Platform surface | Source of truth | Inputs | Runtime output | Verification |
| --- | --- | --- | --- | --- |
| Deployment script | `scripts/deploy.sh` | `NAMESPACE`, `KUBECLAW_DEPLOY_POSTGRESQL`, `KUBECLAW_DEPLOY_QDRANT`, `KUBECLAW_DEPLOY_LITELLM`, `TAILSCALE_OPERATOR_ENABLED`, `ALLOW_PARTIAL_INFRA`, `LOCAL_REGISTRY_PUSH`, `LOCAL_REGISTRY_PULL` | namespace setup, Helm installs, infra manifests, agents, smoke checks, teardown | deployment truth |
| Secret setup | `my-values/setup-secrets.sh`; `charts/kubeclaw/templates/secret.yaml` | `SRC_NS`, `KUBECLAW_SECRET_SETUP_MODE`, `KUBECLAW_SECRETS_OVERWRITE`, provider credentials, GitHub registry credentials | `openclaw-shared-secrets`, `redis-secrets`, `ghcr-secret`, optional LiteLLM/PostgreSQL/Tailscale Secrets | inventory check and live `kubectl get secrets` |
| Agent chart | `charts/kubeclaw/templates/deployment.yaml`; `service.yaml`; `pvc.yaml`; `rbac.yaml`; `configmap-gateway.yaml`; `configmap-swarm-config.yaml` | chart defaults plus `my-values/nova-values.yaml` and `my-values/buster-values.yaml` | Nova/Buster Deployments, Services, PVCs, runtime config overlays, service accounts | Helm render and deployment truth |
| Network policy | `my-values/infra/network-policies.yaml`; `scripts/deploy.sh` infra/teardown functions | target namespace, service labels, DNS/port allowances | 13 portable Kubernetes `NetworkPolicy` resources | deployment truth |
| Runtime config | `charts/kubeclaw/files/config/swarm.config.json`; `charts/kubeclaw/templates/configmap-swarm-config.yaml`; `skills/nova/pipeline/core/config.ts` | `SWARM_CONFIG`, `CURRENT_PROJECT`, `REPO_ROOT`, `.swarm/progress.json` | loaded platform config, project progress, plugin registry | config registry tests |
| Images | `docker/Dockerfile.general`; `docker/Dockerfile.buster-gateway`; `docker/Dockerfile.buster-pipeline`; `.github/workflows/build-images.yaml`; `.dockerignore` | GHCR workflow tags, local registry overrides | general agent image, dedicated Buster gateway and pipeline images, namespace controller, Prism preview | deployment truth image/build-context assertions |

## Commands

Render the two agent roles from the shared chart:

```bash
helm template agent-nova charts/kubeclaw -n kubeclaw -f my-values/nova-values.yaml >/tmp/kubeclaw-nova-render.yaml
helm template agent-buster charts/kubeclaw -n kubeclaw -f my-values/buster-values.yaml >/tmp/kubeclaw-buster-render.yaml
```

Check source truth:

```bash
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
npm run docs:inventory:check
```

Inspect a live namespace:

```bash
./scripts/deploy.sh status
kubectl -n "$NAMESPACE" get pods,svc,pvc,networkpolicy
```

## Failure Signals

- Missing or incomplete Secrets surface during `./scripts/deploy.sh secrets`, `./scripts/deploy.sh infra`, or agent rollout.
- LiteLLM readiness failures usually point at `litellm-secrets`, `postgresql-secrets`, `google-sa-key`, or provider config.
- Gateway smoke failures point at the in-pod OpenClaw gateway status, deployed code bundle, or runtime swarm config.
- Deployment truth failures mean a platform claim in docs no longer matches scripts, values, templates, Dockerfiles, or expected NetworkPolicy count.

## Limits

The repo proves rendered manifests and script behavior, not external provider account health. It also does not prove live CNI enforcement, backup/restore automation, or production SLOs. Those limits are documented in `../open-issues.md`.

## Related Tasks

- `../deployment/deployment-overview.md`
- `../deployment/setup-flow.md`
- `../operators/running-the-platform.md`
