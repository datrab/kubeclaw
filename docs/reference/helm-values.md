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
| `charts/kubeclaw/values.yaml` | `agentRole`, `image`, `imagePullSecrets`, `gateway`, `busterPipeline`, `replicaCount`, `auth`, `litellm`, `anthropic`, `stitch`, `discord`, `discordWebhook`, `agent`, `redis`, `qdrant`, `workspace`, `service`, `persistence`, `resources`, `runAsRoot`, `probes`, `shutdown`, `sandbox`, `serviceAccount`, `busterNamespaceBroker`, `commands`, `swarmConfig`, `swarmConfigJson`, `semgrepConfigYaml`, `eslintConfigMjs`, `customSkills`, `nodeSelector`, `tolerations`, `podAnnotations`, `extraEnv`, `extraContainers`, `extraVolumes`, `extraVolumeMounts` | `secretName: redis-secrets` at line 167 |
| `my-values/nova-values.yaml` | `agentRole`, `image`, `imagePullSecrets`, `auth`, `anthropic`, `stitch`, `litellm`, `discord`, `discordWebhook`, `agent`, `service`, `resources`, `extraContainers`, `workspace` | `existingSecret: openclaw-shared-secrets` at line 16<br>`existingSecret: openclaw-shared-secrets` at line 20<br>`existingSecret: openclaw-shared-secrets` at line 24<br>`existingSecret: openclaw-shared-secrets` at line 28<br>`existingSecret: openclaw-shared-secrets` at line 33<br>`secretName: openclaw-shared-secrets` at line 38<br>`secretName: git-deploy-key-nova` at line 45 |
| `my-values/buster-values.yaml` | `agentRole`, `anthropic`, `busterPipeline`, `gateway`, `image`, `imagePullSecrets`, `auth`, `litellm`, `discord`, `commands`, `discordWebhook`, `probes`, `agent`, `sandbox`, `serviceAccount`, `busterNamespaceBroker`, `resources`, `workspace` | `existingSecret: openclaw-shared-secrets` at line 12<br>`existingSecret: openclaw-shared-secrets` at line 39<br>`existingSecret: openclaw-shared-secrets` at line 43<br>`existingSecret: openclaw-shared-secrets` at line 48<br>`secretName: openclaw-shared-secrets` at line 60<br>`secretName: git-deploy-key-buster` at line 76 |
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

- `../deployment/helm-chart.md`
- `../deployment/values-files.md`
- `../deployment/secrets.md`
- `../deployment/agent-deployments.md`

## Generated from

- `../generated/inventory/helm-values.json`
- `../../scripts/docs-generate.mjs`
