# Environment Variables

Status: generated reference
Audience: reference reader, operator

## Summary

This page lists deployment and secret setup environment variables extracted from the first generated inventory slice.

<!-- BEGIN GENERATED: source-backed reference -->

Generated from: `scripts/deploy.sh`, `my-values/setup-secrets.sh`

## Variables

| Name | Description | Deploy default | Secret setup default |
| --- | --- | --- | --- |
| `ALLOW_PARTIAL_INFRA` | true\|false (default: false) | `false` |  |
| `KUBECLAW_DEPLOY_LITELLM` | true\|false (default: true) | `true` | `true` |
| `KUBECLAW_DEPLOY_POSTGRESQL` | true\|false (default: true) | `true` | `true` |
| `KUBECLAW_DEPLOY_QDRANT` | true\|false (default: true) | `true` | `true` |
| `KUBECLAW_RUN_SECRET_SETUP` | auto\|true\|false for setup/all (default: auto) |  |  |
| `KUBECLAW_SECRET_SETUP_MODE` | auto\|interactive\|noninteractive (default: auto) |  | `auto` |
| `KUBECLAW_SECRETS_OVERWRITE` | true\|false (default: false) |  | `false` |
| `KUBECLAW_WORKSPACE_PROMPT` | auto\|true\|false (default: auto) | `auto` |  |
| `LOCAL_REGISTRY_PULL` | Cluster-visible pull target for verify-live |  |  |
| `LOCAL_REGISTRY_PUSH` | Host-visible push target for build-local-images |  |  |
| `NAMESPACE` | Target namespace (default: kubeclaw) | `kubeclaw` | `kubeclaw` |
| `SRC_NS` | Namespace to copy existing app Secrets from (default: default) |  | `default` |
| `TAILSCALE_OAUTH_CLIENT_ID` | Optional bootstrap source for Secret/operator-oauth |  |  |
| `TAILSCALE_OAUTH_CLIENT_SECRET` | Optional bootstrap source for Secret/operator-oauth |  |  |
| `TAILSCALE_OPERATOR_ENABLED` | true\|false (default: true) |  | `true` |
| `TAILSCALE_OPERATOR_NAMESPACE` | Tailscale namespace (default: tailscale) |  | `tailscale` |


<!-- END GENERATED -->

## Generated from

- `../generated/inventory/deploy-script.json`
- `../generated/inventory/secret-setup.json`
- `../../scripts/docs-generate.mjs`
