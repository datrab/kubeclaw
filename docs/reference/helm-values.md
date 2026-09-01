# Helm Values

Status: generated reference
Audience: reference reader, operator

## Summary

This page lists top-level keys and Secret references from the chart defaults, Nova/Buster values, and infrastructure values/manifests. Deeper per-value defaults will be added in later inventory slices.

<!-- BEGIN GENERATED: source-backed reference -->

Generated from: `charts/kubeclaw/values.yaml`, `my-values/nova-values.yaml`, `my-values/buster-values.yaml`, `my-values/infra/redis-values.yaml`, `my-values/infra/postgresql-values.yaml`, `my-values/infra/qdrant-values.yaml`, `my-values/infra/litellm-values.yaml`, `my-values/infra/litellm-config.yaml`, `my-values/infra/litellm-deployment.yaml`, `my-values/infra/tailscale-operator-values.yaml`, `my-values/infra/registry-mirror.yaml`, `my-values/infra/registry-local.yaml`, `my-values/infra/network-policies.yaml`, `my-values/infra/buster-namespace-fence.yaml`

## Values And Manifest Files

| File | Top-level keys | Secret references |
| --- | --- | --- |
| `charts/kubeclaw/values.yaml` | `agentRole`, `image`, `imagePullSecrets`, `codeBundle`, `runtimeInfrastructure`, `gateway`, `initSetup`, `capabilityProviders`, `replicaCount`, `workerTrust`, `auth`, `litellm`, `anthropic`, `stitch`, `discord`, `discordWebhook`, `agent`, `redis`, `qdrant`, `workspace`, `service`, `persistence`, `resources`, `runAsRoot`, `probes`, `shutdown`, `serviceAccount`, `busterNamespaceBroker`, `commands`, `swarmConfig`, `swarmConfigJson`, `semgrepConfigYaml`, `eslintConfigMjs`, `customSkills`, `nodeSelector`, `tolerations`, `podAnnotations`, `extraEnv`, `extraContainers`, `extraVolumes`, `extraVolumeMounts` | `secretName: redis-secrets` at line 228 |
| `my-values/nova-values.yaml` | `agentRole`, `image`, `imagePullSecrets`, `codeBundle`, `auth`, `anthropic`, `stitch`, `litellm`, `discord`, `discordWebhook`, `commands`, `agent`, `serviceAccount`, `busterNamespaceBroker`, `service`, `capabilityProviders`, `workerTrust`, `extraEnv`, `resources`, `probes`, `extraContainers`, `extraVolumes`, `extraVolumeMounts`, `workspace` | `existingSecret: github-bundle-reader` at line 21<br>`existingSecret: openclaw-shared-secrets` at line 25<br>`existingSecret: openclaw-shared-secrets` at line 29<br>`existingSecret: openclaw-shared-secrets` at line 33<br>`existingSecret: openclaw-shared-secrets` at line 37<br>`existingSecret: openclaw-shared-secrets` at line 42<br>`secretName: openclaw-shared-secrets` at line 47<br>`secretName: git-deploy-key-nova` at line 61 |
| `my-values/buster-values.yaml` | `agentRole`, `anthropic`, `gateway`, `initSetup`, `image`, `imagePullSecrets`, `codeBundle`, `auth`, `litellm`, `discord`, `commands`, `discordWebhook`, `agent`, `serviceAccount`, `workerTrust`, `service`, `extraContainers`, `extraVolumes`, `busterNamespaceBroker`, `resources`, `workspace` | `existingSecret: openclaw-shared-secrets` at line 6<br>`existingSecret: github-bundle-reader` at line 37<br>`existingSecret: openclaw-shared-secrets` at line 41<br>`existingSecret: openclaw-shared-secrets` at line 45<br>`existingSecret: openclaw-shared-secrets` at line 50<br>`secretName: openclaw-shared-secrets` at line 64<br>`secretName: git-deploy-key-buster` at line 71 |
| `my-values/infra/redis-values.yaml` | `architecture`, `auth`, `master` | `existingSecret: redis-secrets` at line 4 |
| `my-values/infra/postgresql-values.yaml` | `architecture`, `auth`, `primary` | `existingSecret: postgresql-secrets` at line 5 |
| `my-values/infra/qdrant-values.yaml` | `replicaCount`, `persistence`, `resources` |  |
| `my-values/infra/litellm-values.yaml` | `extraVolumes`, `extraVolumeMounts`, `extraEnv` | `secretName: google-sa-key` at line 4 |
| `my-values/infra/litellm-config.yaml` | `model_list`, `general_settings`, `litellm_settings` |  |
| `my-values/infra/litellm-deployment.yaml` | `apiVersion`, `kind`, `metadata`, `spec` | `secretName: google-sa-key` at line 66 |
| `my-values/infra/tailscale-operator-values.yaml` | `oauth`, `installCRDs`, `ingressClass`, `operatorConfig`, `proxyConfig` |  |
| `my-values/infra/registry-mirror.yaml` | `apiVersion`, `kind`, `metadata`, `spec` |  |
| `my-values/infra/registry-local.yaml` | `apiVersion`, `kind`, `metadata`, `spec` |  |
| `my-values/infra/network-policies.yaml` | `apiVersion`, `kind`, `metadata`, `spec` |  |
| `my-values/infra/buster-namespace-fence.yaml` | `apiVersion`, `kind`, `metadata`, `spec` |  |


<!-- END GENERATED -->

## Used by

- `../deployment/README.md`
- `../deployment/secrets.md`
- `../deployment/agent-deployments.md`

## Runtime Meaning

| Value group | Runtime effect | Expected proof |
| --- | --- | --- |
| image and pull secrets | selects agent and sidecar images, tags, pull policy, and GHCR pull Secret | rendered Deployments include expected image refs and `imagePullSecrets` |
| auth/provider/Discord/Stitch/LiteLLM | selects direct values or existing Secret name/key references | rendered env refs point to expected Secret keys and generated secrets reference lists those keys |
| persistence | creates workspace/config PVCs for gateway and plugin-runtime state | rendered PVCs and security contexts match production values |
| service and extra ports | exposes gateway/bridge ClusterIP ports plus explicit extra NodePorts | rendered Services contain only documented ports |
| buster namespace broker | adds lease CRD/RBAC/controller and controller env vars | Buster render includes CRD, lease client RBAC, controller Deployment, and namespace fence docs |
| probes, startup doctor, and dependency checks | configures gateway, Redis, and LiteLLM health checks; `gateway.startupDoctor` runs `openclaw doctor --fix` as a blocking init migration while the gateway is stopped | rendered init container, env vars, and smoke commands exercise the health and doctor surfaces |

## Failure Signals

- A top-level value appears in this page but has no rendered effect: add deployment truth coverage or remove the stale value.
- Rendered Secret refs do not match `my-values/setup-secrets.sh`: update values, helper, inventory, and docs together.
- Buster values disable sandbox/broker behavior unexpectedly: inspect `my-values/buster-values.yaml` before changing chart templates.
- A live pod keeps old config after values change: remember the init container preserves persisted config unless override flags request replacement.

## Generated from

- `../generated/inventory/helm-values.json`
- `../../scripts/docs-generate.mjs`
