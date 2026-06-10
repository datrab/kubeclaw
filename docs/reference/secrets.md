# Secrets Reference

Status: generated reference
Audience: reference reader, operator

## Summary

This page lists Kubernetes Secrets created, reused, copied, or checked by the KubeClaw secret setup helper.

<!-- BEGIN GENERATED: source-backed reference -->

Generated from: `my-values/setup-secrets.sh`

## Secret Resolution Order

1. reuse complete target Secret unless KUBECLAW_SECRETS_OVERWRITE is true
2. patch missing keys interactively when a target Secret exists and a TTY is available
3. create openclaw-shared-secrets from SOPS file when present
4. copy source namespace Secret from SRC_NS when present
5. prompt or generate values interactively when allowed
6. warn in noninteractive mode when required input is unavailable

## Secret Setup Order

1. setup_shared_secret
2. setup_redis_secret
3. setup_postgresql_secret when KUBECLAW_DEPLOY_POSTGRESQL is enabled
4. setup_litellm_secret when KUBECLAW_DEPLOY_LITELLM is enabled
5. rewrite_litellm_database_url_namespace when KUBECLAW_DEPLOY_LITELLM is enabled
6. setup_google_sa_key when KUBECLAW_DEPLOY_LITELLM is enabled
7. setup_ghcr_secret
8. setup_git_deploy_key git-deploy-key-nova Nova
9. setup_git_deploy_key git-deploy-key-buster Buster
10. setup_tailscale_oauth_secret

## Secrets

| Secret | Namespace | Required when | Keys | Setup source |
| --- | --- | --- | --- | --- |
| `openclaw-shared-secrets` | `NAMESPACE` | always; litellmApiKey is required when KUBECLAW_DEPLOY_LITELLM is enabled | `gatewayToken-forge`, `gatewayToken-echo`, `gatewayToken-buster`, `gatewayToken-nova`, `anthropicApiKey`, `stitchApiKey`, `discordToken-forge`, `discordToken-echo`, `discordToken-buster`, `discordToken-nova`, `discordWebhook`, `litellmApiKey` | setup_shared_secret, line 533 |
| `redis-secrets` | `NAMESPACE` | always | `redis-password` | setup_redis_secret, line 597 |
| `postgresql-secrets` | `NAMESPACE` | KUBECLAW_DEPLOY_POSTGRESQL is enabled | `postgres-password`, `litellm-password` | setup_postgresql_secret, line 632 |
| `litellm-secrets` | `NAMESPACE` | KUBECLAW_DEPLOY_LITELLM is enabled | `LITELLM_MASTER_KEY`, `DATABASE_URL` | setup_litellm_secret, line 687 |
| `google-sa-key` | `NAMESPACE` | KUBECLAW_DEPLOY_LITELLM is enabled | `credentials.json` | setup_google_sa_key, line 786 |
| `ghcr-secret` | `NAMESPACE` | always when imagePullSecrets reference GHCR | `.dockerconfigjson` | setup_ghcr_secret, line 821 |
| `git-deploy-key-nova` | `NAMESPACE` | Nova git checkout is enabled | `id_rsa` | setup_git_deploy_key git-deploy-key-nova Nova, line 1007 |
| `git-deploy-key-buster` | `NAMESPACE` | Buster git checkout is enabled | `id_rsa` | setup_git_deploy_key git-deploy-key-buster Buster, line 1008 |
| `operator-oauth` | `TAILSCALE_OPERATOR_NAMESPACE` | TAILSCALE_OPERATOR_ENABLED is enabled | `client_id`, `client_secret` | setup_tailscale_oauth_secret, line 908 |


<!-- END GENERATED -->

## Examples

Check required app namespace Secrets:

```bash
kubectl -n "$NAMESPACE" get secret openclaw-shared-secrets redis-secrets ghcr-secret git-deploy-key-nova git-deploy-key-buster
```

Check Tailscale OAuth Secret:

```bash
kubectl -n tailscale get secret operator-oauth
```

## Generated from

- `../generated/inventory/secret-setup.json`
- `../../scripts/docs-generate.mjs`
