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
- Main image: `ghcr.io/datrab/kubeclaw-general:latest`
- Extra container: `prism-preview` from `ghcr.io/datrab/kubeclaw-prism-preview:latest` on container port `3456`
- Gateway URL env: `OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789` by default

Buster render:

- ServiceAccount: `agent-buster`
- ConfigMaps: `agent-buster-config`, `agent-buster-swarm-config`
- PVCs: `agent-buster-config`, `agent-buster-workspace`
- Lease-client Role and RoleBinding: `agent-buster-namespace-lease-client`
- CRD: `BusterNamespaceLease`
- Controller Deployment and ServiceAccount: `agent-buster-namespace-controller`
- Service: `agent-buster`, ClusterIP for gateway/bridge
- Deployment: `agent-buster`
- Gateway image: `ghcr.io/datrab/kubeclaw-buster-gateway:latest`
- Worker image: `ghcr.io/datrab/kubeclaw-buster-pipeline:latest`
- Namespace controller image: `ghcr.io/datrab/kubeclaw-namespace-controller:latest`
- Gateway URL env: `OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789` by default
- Pipeline-only transient volumes: BuildKit state at `/home/builder/.local/share/buildkit`, results at `/home/builder/.openclaw/results`

The namespace controller is a separate one-replica pod rendered by the Buster chart when `busterNamespaceBroker.enabled` is true. It runs from the lightweight `kubeclaw-namespace-controller` image, not from an OpenClaw agent image. Buster itself can create/read/delete lease objects in the release namespace; the controller creates the actual test namespace, namespaced Role/RoleBinding, copied secrets, and final-preview Tailscale Ingress.

Tailscale render is owned by `scripts/deploy.sh`, not the agent chart. The deploy script installs the official `tailscale/tailscale-operator` Helm chart with `my-values/infra/tailscale-operator-values.yaml`, expecting `Secret/operator-oauth` in namespace `tailscale`.

The init container runs before the main container. It sets up SSH, clones the configured Git repo into `/workspace/git-repo`, or safely fast-forwards an existing clean checkout while preserving local edits. Runtime containers mount the same workspace PVC at `/home/node/.openclaw/workspace`, and `REPO_ROOT` points to `/home/node/.openclaw/workspace/git-repo` so pipeline code does not rely on Git discovery from `/app`. It syncs workspace markdown files when enabled, initializes or preserves secret-free source config under `/config`, renders the pod-local runtime config under `/runtime-config`, maps `DISCORD_WEBHOOK` only into the runtime `swarm.config.json`, merges packaged and custom skills, and blocks `customSkills` overlays from replacing protected runtime paths.

The same init flow writes `/runtime-config/kubeclaw-health.mjs`. Kubernetes probes call that script through exec probes. Startup/readiness verify the local runtime surface and required dependencies; liveness checks only local gateway health to avoid restart loops during external dependency outages.

## Skills Bundle Contract

Nova and Buster do not consume the repository root directly as their runtime
skill tree. `scripts/package-agent-skill-bundle.sh` materializes the final
`/app/skills` tree for each role:

1. copy `skills/nova` or `skills/buster`
2. overlay `skills/common`
3. replace the agent-observability facade with the canonical checked-in
   contract source
4. publish the resulting tree and manifest as the role's immutable code bundle

This order is part of the runtime contract. Common owns every intentionally
shared path that collides with a role-local facade. The bundle must retain role
entrypoints, required `SKILL.md` files, and all imports needed after the source
directories have been flattened into `/app/skills`.

The plugin-system migration must preserve this materialized runtime surface.
Generic v2 infrastructure belongs in the planned Common plugin-runtime
directory; shared packages belong in the planned Common plugin root; and
concrete role packages belong in the planned Nova or Buster plugin root shown
in the implementation plan. Top-level development trees are not deployable
substitutes for these role-aware sources.

Verify the contract with:

```bash
node tests/verification/runtime/check-agent-skill-bundles.mjs \
  --source-root "$PWD"

node tests/verification/runtime/check-runtime-collisions.mjs \
  --source-root "$PWD"
```

## Open Issues

- LiteLLM and Prism preview still use temporary NodePorts.

## Source Owners And Commands

| Topology surface | Source of truth | Expected resource or file | Check |
| --- | --- | --- | --- |
| Agent pod shape | `charts/kubeclaw/templates/deployment.yaml`; `my-values/nova-values.yaml`; `my-values/buster-values.yaml` | `Deployment/agent-nova`, `Deployment/agent-buster`, init container, gateway sidecar, main container, Buster pipeline container | `helm template agent-nova charts/kubeclaw -n kubeclaw -f my-values/nova-values.yaml` |
| Agent skill bundles | `scripts/package-agent-skill-bundle.sh`; `skills/nova`; `skills/buster`; `skills/common` | role-first, Common-second immutable `/app/skills` bundle | `node tests/verification/runtime/check-agent-skill-bundles.mjs --source-root "$PWD"` |
| Services and NodePorts | `charts/kubeclaw/templates/service.yaml`; `service-extra-nodeports.yaml`; values files | ClusterIP gateway/bridge Services plus explicit extra NodePorts such as Prism preview | `./scripts/deploy.sh status` |
| Persistent runtime state | `charts/kubeclaw/templates/pvc.yaml`; `charts/kubeclaw/templates/deployment.yaml` | workspace and config PVCs mounted under `/home/node/.openclaw/workspace`, `/config`, and `/home/node/.openclaw-persisted` | `kubectl -n "$NAMESPACE" get pvc -o wide` |
| Buster namespace broker | `charts/kubeclaw/templates/buster-namespace-*.yaml`; `my-values/infra/buster-namespace-fence.yaml` | `BusterNamespaceLease` CRD, lease client RBAC, controller Deployment, namespace fence policy | `node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"` |
| Tailscale operator | `scripts/deploy.sh`; `my-values/infra/tailscale-operator-values.yaml`; `my-values/setup-secrets.sh` | `tailscale/operator-oauth`, operator pods, `IngressClass/tailscale` | `./scripts/deploy.sh tailscale` |

Repo verification proves rendered manifests, expected resource wiring, and static policy counts. It does not prove live DNS, node firewall rules, Tailscale tailnet policy, or CNI enforcement. Use live `kubectl describe`, pod logs, and operator-specific logs for those surfaces.
