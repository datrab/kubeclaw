# Deployment Overview

Status: current
Audience: operator

## Purpose

Explain the source-backed deployment path before the detailed setup pages.

## Current Deployment Shape

KubeClaw deploys infrastructure first, then two agent releases from the shared Helm chart:

- `agent-nova` uses `my-values/nova-values.yaml`.
- `agent-buster` uses `my-values/buster-values.yaml`.
- Redis, PostgreSQL, Qdrant, LiteLLM, registry services, network policies, and the Buster namespace fence are deployed by `scripts/deploy.sh infra`.
- Tailscale Kubernetes Operator is installed by `scripts/deploy.sh tailscale` or as part of `scripts/deploy.sh infra` when enabled.

## Normal Command Order

```bash
./scripts/deploy.sh setup
./scripts/deploy.sh infra
./scripts/deploy.sh agents
./scripts/deploy.sh smoke
```

`scripts/setup.sh` is a guarded legacy Git repository bootstrap. It is not the normal platform deployment flow.

## Related Pages

- `setup-flow.md`
- `secrets.md`
- `infrastructure.md`
- `agent-deployments.md`
- `deployment-verification.md`
