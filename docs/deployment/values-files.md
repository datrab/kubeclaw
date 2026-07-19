# Values Files

Status: current
Audience: operator, reference reader

## Purpose

Explain how defaults and production values differ.

## Current Behavior

`charts/kubeclaw/values.yaml` sets defaults for role, image, gateway command and ports, auth, LiteLLM, Anthropic, Stitch, Discord, Git, Redis, Qdrant, workspace files, service exposure, PVCs, probes, sandbox, service account, commands, swarm config, custom skills, scheduling, and extra containers/volumes.

`my-values/nova-values.yaml` sets:

- `agentRole: nova`
- general image `ghcr.io/datrab/kubeclaw-general:latest`
- GHCR pull secret `ghcr-secret`
- shared secret keys for gateway, Anthropic, Stitch, LiteLLM, Discord token, and Discord webhook
- project `clawdeck`
- Git repo `git@github.com:Ravencrypt/ForgeStack.git`
- cluster-internal gateway Service
- Prism preview temporary NodePort `30456`
- Prism preview sidecar using `ghcr.io/datrab/kubeclaw-prism-preview:latest`
- workspace bootstrap disabled

`my-values/buster-values.yaml` sets:

- `agentRole: buster`
- gateway image `ghcr.io/datrab/kubeclaw-buster-gateway:latest`
- pipeline image `ghcr.io/datrab/kubeclaw-buster-pipeline:latest`
- namespace controller image `ghcr.io/datrab/kubeclaw-namespace-controller:latest`
- two-container Buster pod with dedicated gateway and rootless-BuildKit pipeline images sharing runtime config, workspace, skills, and localhost networking
- Buster-specific gateway and Discord secret keys
- Discord exec/command approver user ID
- cluster-internal gateway Service
- `busterPipeline.platformCapabilities: [rootless_buildkit]`
- `serviceAccount.create: true`
- workspace bootstrap disabled

## Values Ownership Table

| Values area | Default owner | Nova override | Buster override | Rendered effect |
| --- | --- | --- | --- | --- |
| Agent identity | `agentRole` in `charts/kubeclaw/values.yaml` | `agentRole: nova` | `agentRole: buster` | labels, deployment name, `AGENT_NAME`, role-specific service account/RBAC decisions |
| Images | `image.repository`, `image.tag`, `image.pullPolicy`, `imagePullSecrets`, `busterPipeline.image.*`, `busterNamespaceBroker.controller.image.*` | `ghcr.io/datrab/kubeclaw-general:latest`; `ghcr-secret` | gateway `ghcr.io/datrab/kubeclaw-buster-gateway:latest`; worker `ghcr.io/datrab/kubeclaw-buster-pipeline:latest`; controller `ghcr.io/datrab/kubeclaw-namespace-controller:latest`; `ghcr-secret` | role-specific gateway image, dedicated Buster worker image, namespace controller image, and pull Secret wiring |
| Secrets | `auth.*`, `anthropic.*`, `stitch.*`, `litellm.*`, `discord.*`, `discordWebhook.*`, `agent.git.secretName` | Nova-specific gateway and Discord keys from `openclaw-shared-secrets`; `git-deploy-key-nova` | Buster-specific gateway and Discord keys from `openclaw-shared-secrets`; `git-deploy-key-buster` | env vars and mounted SSH key in `charts/kubeclaw/templates/deployment.yaml` |
| Services | `service.type`, `service.gatewayPort`, `service.bridgePort`, `service.extraPorts` | Prism preview extra port `3456` with NodePort `30456` | internal gateway/bridge only | `charts/kubeclaw/templates/service.yaml` and dedicated extra-port NodePort behavior checked by deployment truth |
| Persistence | `persistence.config.*`, `persistence.workspace.*`, `busterPipeline.storageSize`, `busterPipeline.resultsSize` | defaults unless overridden | defaults plus transient BuildKit/result storage | kept PVCs from `charts/kubeclaw/templates/pvc.yaml`; pipeline-only `emptyDir` mounts |
| Buster pipeline | `busterPipeline.*`, `serviceAccount.*`, `busterNamespaceBroker.*` | disabled by default | dedicated pipeline image enabled, rootless BuildKit capability, service account and namespace broker enabled | non-privileged two-container Buster pod and lease-client RBAC |
| Runtime config | `swarmConfigJson`, `semgrepConfigYaml`, `eslintConfigMjs`, `customSkills` | chart-bundled config unless overridden | chart-bundled config unless overridden | ConfigMaps copied to the retained config PVC and runtime overlay |

## Verification And Diff Commands

```bash
helm template kubeclaw charts/kubeclaw -f my-values/nova-values.yaml >/tmp/kubeclaw-nova.yaml
helm template kubeclaw charts/kubeclaw -f my-values/buster-values.yaml >/tmp/kubeclaw-buster.yaml
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
npm run docs:generate:check
```

Use the generated reference `../reference/helm-values.md` for top-level keys and Secret references extracted from values/manifests. If a value is changed and the generated reference becomes stale, run `npm run docs:inventory` then `npm run docs:generate`.

## Known Limits

- Production values still use mutable `latest` image tags.
- Existing config PVC contents are preserved across chart changes; values that alter source config may not affect a pod until the retained source config is migrated or reset.
- `my-values/nova-values.yaml` and `my-values/buster-values.yaml` are current audited production values for this repository, not generic examples for every environment.
