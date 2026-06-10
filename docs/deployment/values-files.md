# Values Files

Status: current
Audience: operator, reference reader

## Purpose

Explain how defaults and production values differ.

## Current Behavior

`charts/kubeclaw/values.yaml` sets defaults for role, image, gateway command and ports, auth, LiteLLM, Anthropic, Stitch, Discord, Git, Redis, Qdrant, workspace files, service exposure, PVCs, probes, sandbox, service account, commands, swarm config, custom skills, scheduling, and extra containers/volumes.

`my-values/nova-values.yaml` sets:

- `agentRole: nova`
- general image `ghcr.io/forgestackai/kubeclaw-general:latest`
- GHCR pull secret `ghcr-secret`
- shared secret keys for gateway, Anthropic, Stitch, LiteLLM, Discord token, and Discord webhook
- project `clawdeck`
- Git repo `git@github.com:Ravencrypt/ForgeStack.git`
- cluster-internal gateway Service
- Prism preview temporary NodePort `30456`
- Prism preview sidecar using `node:20-alpine`
- workspace bootstrap disabled

`my-values/buster-values.yaml` sets:

- `agentRole: buster`
- sandbox image `ghcr.io/forgestackai/kubeclaw-sandbox:latest`
- two-container Buster pod with `kubeclaw` gateway and `buster-pipeline` worker containers sharing runtime config, workspace, skills, Podman storage, registry config, and `/sandbox`
- Buster-specific gateway and Discord secret keys
- Discord exec/command approver user ID
- cluster-internal gateway Service
- `sandbox.enabled: true`
- Podman registry config for registry-local and registry-mirror
- `serviceAccount.create: true`
- workspace bootstrap disabled
