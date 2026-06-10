# Runtime Topology

Status: current
Audience: operator, maintainer

## Purpose

Describe the pod, service, config, and gateway topology rendered by the current chart and production values.

## Current Behavior

Nova render:

- ConfigMaps: `agent-nova-config`, `agent-nova-swarm-config`
- PVCs: `agent-nova-config`, `agent-nova-workspace`
- Service: `agent-nova`, ClusterIP for gateway/bridge
- Service: `agent-nova-prism-preview`, temporary NodePort `30456` for Prism preview
- Deployment: `agent-nova`
- Main image: `ghcr.io/forgestackai/kubeclaw-general:latest`
- Extra container: `prism-preview` on container port `3456`
- Gateway URL env: `OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789` by default

Buster render:

- ServiceAccount: `agent-buster`
- ConfigMaps: `agent-buster-config`, `agent-buster-podman-registries`, `agent-buster-swarm-config`
- PVCs: `agent-buster-config`, `agent-buster-workspace`
- Lease-client Role and RoleBinding: `agent-buster-namespace-lease-client`
- CRD: `BusterNamespaceLease`
- Controller Deployment and ServiceAccount: `agent-buster-namespace-controller`
- Service: `agent-buster`, ClusterIP for gateway/bridge
- Deployment: `agent-buster`
- Main image: `ghcr.io/forgestackai/kubeclaw-sandbox:latest`
- Gateway URL env: `OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789` by default
- Sandbox volumes: Podman storage at `/var/lib/containers`, sandbox workspace at `/sandbox`

The namespace controller is a separate one-replica pod rendered by the Buster chart when `busterNamespaceBroker.enabled` is true. Buster itself can create/read/delete lease objects in the release namespace; the controller creates the actual test namespace, namespaced Role/RoleBinding, copied secrets, and final-preview Tailscale Ingress.

Tailscale render is owned by `scripts/deploy.sh`, not the agent chart. The deploy script installs the official `tailscale/tailscale-operator` Helm chart with `my-values/infra/tailscale-operator-values.yaml`, expecting `Secret/operator-oauth` in namespace `tailscale`.

The init container runs before the main container. It sets up SSH, clones the configured Git repo into `/workspace/git-repo`, or safely fast-forwards an existing clean checkout while preserving local edits. It syncs workspace markdown files when enabled, initializes or preserves secret-free source config under `/config`, renders the pod-local runtime config under `/runtime-config`, maps `DISCORD_WEBHOOK` only into the runtime `swarm.config.json`, merges packaged and custom skills, and blocks `customSkills` overlays from replacing protected runtime paths.

The same init flow writes `/runtime-config/kubeclaw-health.mjs`. Kubernetes probes call that script through exec probes. Startup/readiness verify the local runtime surface and required dependencies; liveness checks only local gateway health to avoid restart loops during external dependency outages.

## Open Issues

- LiteLLM and Prism preview still use temporary NodePorts.
