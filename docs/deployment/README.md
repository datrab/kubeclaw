# Deployment

Status: current
Audience: operator, maintainer

## Purpose

This section documents the deployable KubeClaw platform from chart, values, infrastructure manifests, images, secrets, networking, RBAC, storage, CI, and verification.

## Guides

- [Deployment overview](deployment-overview.md)
- [Setup flow](setup-flow.md)
- [Model provider prerequisites](model-provider-prerequisites.md)
- [Helm chart](helm-chart.md)
- [Values files](values-files.md)
- [Agent deployments](agent-deployments.md)
- [Startup and health checks](startup-and-health.md)
- [Infrastructure](infrastructure.md)
- [LiteLLM](litellm.md)
- [Tailscale operator](tailscale-operator.md)
- [Docker images](docker-images.md)
- [Secrets](secrets.md)
- [Networking](networking.md)
- [RBAC and sandbox](rbac-and-sandbox.md)
- [Persistent storage](persistent-storage.md)
- [CI and image publishing](ci-and-image-publishing.md)
- [Deployment verification](deployment-verification.md)

## Required deployment truth commands

```bash
helm template agent-nova charts/kubeclaw -n kubeclaw -f my-values/nova-values.yaml
helm template agent-buster charts/kubeclaw -n kubeclaw -f my-values/buster-values.yaml
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
```

## Deployment Source Map

| Surface | Source files | Runtime inputs | Outputs and artifacts | Failure signals |
| --- | --- | --- | --- | --- |
| Operator entrypoint | `scripts/deploy.sh` | `NAMESPACE`, `KUBECLAW_RUN_SECRET_SETUP`, `KUBECLAW_DEPLOY_POSTGRESQL`, `KUBECLAW_DEPLOY_QDRANT`, `KUBECLAW_DEPLOY_LITELLM`, `ALLOW_PARTIAL_INFRA` | namespace, secrets, infra resources, Helm releases, smoke output | missing `kubectl`/`helm`, rollout timeout, failed image pull preflight, smoke failure |
| Secret setup | `my-values/setup-secrets.sh` | `SRC_NS`, `KUBECLAW_SECRET_SETUP_MODE`, `KUBECLAW_SECRETS_OVERWRITE`, `TAILSCALE_OAUTH_CLIENT_ID`, `TAILSCALE_OAUTH_CLIENT_SECRET` | app namespace Secrets and `operator-oauth` in the Tailscale namespace | missing keys, noninteractive mode without source Secret/SOPS value, Tailscale OAuth Secret missing |
| Agent chart | `charts/kubeclaw/templates/deployment.yaml`; `service.yaml`; `pvc.yaml`; `configmap-gateway.yaml`; `configmap-swarm-config.yaml`; `rbac.yaml` | chart defaults plus `my-values/nova-values.yaml` and `my-values/buster-values.yaml` | Nova/Buster Deployments, Services, PVCs, ConfigMaps, optional RBAC | deployment truth render assertion failure, pod readiness failure, gateway health failure |
| Infra manifests | `my-values/infra/*.yaml`; `my-values/infra/network-policies.yaml` | component flags and namespace | Redis/PostgreSQL/Qdrant/LiteLLM/registries/Tailscale resources, namespace fence, 13 NetworkPolicies | failed rollout unless `ALLOW_PARTIAL_INFRA=true`, failed kubeconform validation |
| Images and skill bundles | `docker/Dockerfile.general`; `docker/Dockerfile.buster-gateway`; `docker/Dockerfile.buster-pipeline`; `docker/Dockerfile.prism-preview`; `.github/workflows/build-images.yaml`; `scripts/package-agent-skill-bundle.sh` | GHCR owner, image tag, bundle release tag, commit SHA | GHCR runtime images plus GitHub release `/app/skills` bundles | Docker build failure, bundle packaging failure, pushed image or bundle unavailable to cluster, mutable `latest` drift |

## Operator Path

For a normal deployment, read these pages in order:

1. [Deployment overview](deployment-overview.md)
2. [Setup flow](setup-flow.md)
3. [Secrets](secrets.md)
4. [Infrastructure](infrastructure.md)
5. [LiteLLM](litellm.md), if enabled
6. [Tailscale operator](tailscale-operator.md), if final previews are enabled
7. [Agent deployments](agent-deployments.md)
8. [Startup and health checks](startup-and-health.md)
9. [Deployment verification](deployment-verification.md)

## What Repository Checks Prove

`node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"` renders both production values files, validates the agent chart, checks expected Service exposure, validates Buster sandbox/RBAC surfaces, verifies the generated config/skills merge paths, checks image workflow and Dockerfile policy, and validates the 13 NetworkPolicy resources. It does not prove that a live cluster has a working CNI, a reachable model provider, or a valid backup/restore path.
