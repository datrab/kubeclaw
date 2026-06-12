# Persistent Storage

Status: current
Audience: operator

## Purpose

Document PVCs and ephemeral storage.

## Current Behavior

The chart can render two retained PVCs per agent from `charts/kubeclaw/templates/pvc.yaml`:

- `<release>-config`
- `<release>-workspace`

Defaults:

- config PVC: enabled, `10Gi`, `ReadWriteOnce`, cluster default storage class unless set
- workspace PVC: enabled, `20Gi`, `ReadWriteOnce`, cluster default storage class unless set

PVCs have `helm.sh/resource-policy: keep`, so Helm uninstall does not remove them automatically.

## Storage Surfaces

| Surface | Owner | Mounted at runtime | Backing store | What belongs there | Verification source |
| --- | --- | --- | --- | --- | --- |
| config PVC | Helm chart, init container | `/home/node/.openclaw`; source view at `/home/node/.openclaw-persisted`; init view at `/config` | `<release>-config` PVC, default `10Gi`, `ReadWriteOnce`, kept on uninstall | Secret-free source `openclaw.json`, `swarm.config.json`, `.semgrep.yml`, `eslint.config.mjs` | `charts/kubeclaw/templates/pvc.yaml`; `charts/kubeclaw/templates/deployment.yaml`; `tests/verification/deployment/check-deployment-truth.mjs` |
| runtime config overlay | Init container | `/home/node/.openclaw/openclaw.json`; `/home/node/.openclaw/swarm.config.json`; `/runtime-config` | pod `emptyDir` | Current secret-expanded runtime config and health script | `deployment.yaml` mounts `runtime-config`; deployment truth asserts both `subPath` overlays |
| workspace PVC | Helm chart, init container, agents | `/home/node/.openclaw/workspace`; init view at `/workspace` | `<release>-workspace` PVC, default `20Gi`, `ReadWriteOnce`, kept on uninstall | cloned Git repo at `git-repo`, `memory`, `prism/designs`, runtime workspace files, operator edits preserved across restarts | `values.yaml` `persistence.workspace`; `deployment.yaml` Git fast-forward guard |
| Nova Prism designs | Nova sidecar | `/designs` with `subPath: prism/designs` | Nova workspace PVC | rendered design previews under the workspace | `my-values/nova-values.yaml` `extraContainers` |
| Buster Podman storage | Buster gateway and pipeline containers | `/var/lib/containers` | pod `emptyDir` with `sandbox.storageSize` default/production `50Gi` | Podman images, layers, and container state for sandbox suites | `my-values/buster-values.yaml`; deployment truth checks both containers mount it |
| Buster sandbox workspace | Buster gateway and pipeline containers | `/sandbox` | pod `emptyDir`, default size limit `2Gi` in the chart unless overridden by rendered values | transient build/serve/test workspace and suite outputs before scoped artifacts are copied back | `charts/kubeclaw/templates/deployment.yaml`; deployment truth checks both containers mount it |
| pipeline artifacts | Nova/Buster runtime | `.swarm/logs/pipeline` under the project checkout | workspace PVC when running in the agent pod; local filesystem in source-only verification | `latest.json`, run-scoped summaries, status projections, Buster output files, failure evidence | `docs/reference/status-and-artifacts.md`; `skills/nova/pipeline/services/artifact-bundle.ts` |

The config PVC is intentionally not the same as runtime config. The init container normalizes persisted `openclaw.json` back to placeholders for `LITELLM_API_KEY` and `DISCORD_TOKEN`, removes `discord_webhook_url` from persisted `swarm.config.json`, then writes secret-expanded files only into the pod-local `runtime-config` `emptyDir`. `tests/verification/deployment/check-deployment-truth.mjs` asserts the placeholder normalization, the webhook removal, and the runtime `subPath` overlays.

Buster sandbox mode also uses `emptyDir` for Podman storage. Production Buster values set `sandbox.storageSize: "50Gi"` and set `ephemeral-storage` requests/limits on both the `kubeclaw` gateway container and the `buster-pipeline` container. This means Podman state is bounded and lost with the pod, while the workspace and config PVCs remain.

Buster cleanup reports before/after disk usage for `/sandbox` and `/var/lib/containers` in its sandbox cleanup result and telemetry.

Registry mirror uses a `5Gi` PVC for cache. Registry-local has no PVC and is ephemeral.

## Operator Checks

Inspect retained claims and mounts:

```bash
kubectl -n kubeclaw get pvc
kubectl -n kubeclaw describe pvc agent-nova-config agent-nova-workspace
kubectl -n kubeclaw describe pvc agent-buster-config agent-buster-workspace
kubectl -n kubeclaw get deploy agent-nova agent-buster -o yaml | rg "claimName|mountPath|/runtime-config|/var/lib/containers|/sandbox"
```

Check that retained config is secret-free and runtime config is the only secret-expanded surface:

```bash
kubectl -n kubeclaw exec deploy/agent-nova -c kubeclaw -- rg -n "discord_webhook_url|__LITELLM_API_KEY__|__DISCORD_TOKEN__" /home/node/.openclaw-persisted
kubectl -n kubeclaw exec deploy/agent-nova -c kubeclaw -- test -f /runtime-config/openclaw.json
kubectl -n kubeclaw exec deploy/agent-buster -c buster-pipeline -- df -h /sandbox /var/lib/containers /home/node/.openclaw/workspace
```

Source-only verification:

```bash
helm template agent-nova charts/kubeclaw -n kubeclaw -f my-values/nova-values.yaml >/tmp/kubeclaw-nova-render.yaml
helm template agent-buster charts/kubeclaw -n kubeclaw -f my-values/buster-values.yaml >/tmp/kubeclaw-buster-render.yaml
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
```

## Backup, Restore, And Teardown

Back up the config and workspace PVCs before upgrades that change init behavior, OpenClaw config, project checkout layout, or Buster/Nova workspace conventions. The minimum evidence to collect before destructive maintenance is:

- `kubectl -n kubeclaw get pvc -o wide`
- rendered Helm output for `agent-nova` and `agent-buster`
- current `/home/node/.openclaw-persisted` file list from each agent
- current `.swarm/logs/pipeline/latest.json` and run-scoped artifact directory for active projects

`./scripts/deploy.sh teardown-agents` and Helm uninstall preserve the agent PVCs because of `helm.sh/resource-policy: keep`. `./scripts/deploy.sh teardown` preserves namespace and secrets but attempts cleanup of leftover PVCs in the destructive infra path. `./scripts/deploy.sh teardown-all` destroys the namespace and all resources after an explicit `destroy` prompt.

Open question: the repository does not include a tested volume snapshot or restore script. Use cluster-native volume snapshots or storage-provider backups, then validate restored agents with `./scripts/deploy.sh smoke` and the deployment truth verifier.
