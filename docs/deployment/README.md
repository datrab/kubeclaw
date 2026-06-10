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

## Operator Path

For a normal deployment, read these pages in order:

1. [Deployment overview](deployment-overview.md)
2. [Setup flow](setup-flow.md)
3. [Secrets](secrets.md)
4. [Infrastructure](infrastructure.md)
5. [LiteLLM](litellm.md), if enabled
6. [Tailscale operator](tailscale-operator.md), if final previews are enabled
7. [Agent deployments](agent-deployments.md)
8. [Deployment verification](deployment-verification.md)
