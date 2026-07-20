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
| config PVC | Helm chart, init container | `/home/node/.openclaw`; source view at `/home/node/.openclaw-persisted`; init view at `/config` | `<release>-config` PVC, default `10Gi`, `ReadWriteOnce`, kept on uninstall | Writable `openclaw.json` with SecretRefs, external plugin npm cache, `swarm.config.json`, `.semgrep.yml`, `eslint.config.mjs`, OpenClaw state | `charts/kubeclaw/templates/pvc.yaml`; `charts/kubeclaw/templates/deployment.yaml`; `tests/verification/deployment/check-deployment-truth.mjs` |
| runtime config overlay | Init container | `/home/node/.openclaw/openclaw.json`; `/home/node/.openclaw/swarm.config.json`; `/runtime-config` | pod `emptyDir` | Webhook-expanded `swarm.config.json`, runtime-mounted `openclaw.json`, and health script | `deployment.yaml` mounts `runtime-config`; deployment truth asserts the `openclaw.json` staged overlay and startup-doctor sync path |
| workspace PVC | Helm chart, init container, agents | gateway: `/home/node/.openclaw/workspace`; Buster pipeline and init: `/workspace` | `<release>-workspace` PVC, default `20Gi`, `ReadWriteOnce`, kept on uninstall | cloned Git repo at `git-repo`, `memory`, `prism/designs`, runtime workspace files, operator edits preserved across restarts | `values.yaml` `persistence.workspace`; `deployment.yaml` Git fast-forward and shared-group guards |
| Nova Prism designs | Nova sidecar | `/designs` with `subPath: prism/designs` | Nova workspace PVC | rendered design previews under the workspace | `my-values/nova-values.yaml` `extraContainers` |
| Buster BuildKit state | Buster pipeline sidecar | `/home/builder/.local/share/buildkit` | pod `emptyDir`, default `25Gi` | transient rootless BuildKit cache and layers | `busterPipeline.storageSize`; deployment truth checks only the pipeline sidecar mounts it |
| Buster results | Buster pipeline sidecar | `/home/builder/.openclaw/results` | pod `emptyDir`, default `2Gi` | transient suite evidence before scoped artifacts are copied back | `charts/kubeclaw/templates/deployment.yaml` |
| pipeline artifacts | Nova/Buster runtime | `.swarm/logs/pipeline` under the project checkout | workspace PVC when running in the agent pod; local filesystem in source-only verification | `latest.json`, run-scoped summaries, status projections, Buster output files, failure evidence | `docs/reference/status-and-artifacts.md`; `skills/nova/pipeline/services/artifact-bundle.ts` |

The config PVC stores the durable OpenClaw home. The init container normalizes persisted `openclaw.json` to canonical model refs and env SecretRefs for `LITELLM_API_KEY` and `DISCORD_TOKEN`, removes `discord_webhook_url` from persisted `swarm.config.json`, seeds official external plugins from the image cache only when the baked cache-version stamp changes, and writes the webhook-expanded `swarm.config.json` only into the pod-local `runtime-config` `emptyDir`. `openclaw.json` is overlaid from `/runtime-config/openclaw.json` through `subPath`, and the startup doctor syncs repaired config back into both the persistent source and the runtime copy after gateway health. `tests/verification/deployment/check-deployment-truth.mjs` asserts the SecretRef normalization, incremental plugin seeding, webhook removal, and the staged runtime-config overlay behavior.

Buster's gateway and non-root pipeline mount the workspace PVC at separate runtime paths so OpenClaw home permission hardening cannot block the worker. The init container owns workspace entries as group `1000`, grants group read/write access, and sets the directory setgid bit so both containers retain access across restarts. BuildKit cache and result staging are pod-local and disappear with the pod. Durable source, pipeline artifacts, and configuration remain on their existing PVCs. Task cleanup deletes tracked namespace leases; the namespace controller owns the corresponding namespace teardown.

Registry mirror uses a `5Gi` PVC for cache. Registry-local has no PVC and is ephemeral.

## Operator Checks

Inspect retained claims and mounts:

```bash
kubectl -n kubeclaw get pvc
kubectl -n kubeclaw describe pvc agent-nova-config agent-nova-workspace
kubectl -n kubeclaw describe pvc agent-buster-config agent-buster-workspace
kubectl -n kubeclaw get deploy agent-nova agent-buster -o yaml | rg "claimName|mountPath|/runtime-config|buildkit-state|buster-results"
```

Check that retained config uses SecretRefs and the webhook remains runtime-only:

```bash
kubectl -n kubeclaw exec deploy/agent-nova -c kubeclaw -- jq '.models.providers.litellm.apiKey,.channels.discord.token' /home/node/.openclaw/openclaw.json
kubectl -n kubeclaw exec deploy/agent-nova -c kubeclaw -- rg -n "discord_webhook_url" /home/node/.openclaw-persisted
kubectl -n kubeclaw exec deploy/agent-nova -c kubeclaw -- test -f /runtime-config/openclaw.json
kubectl -n kubeclaw exec deploy/agent-buster -c buster-pipeline -- df -h /home/builder/.local/share/buildkit /home/builder/.openclaw/results /workspace
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
