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

## Ownership And Runtime Boundaries

| Variable group | Owner | Runtime effect | Verification |
| --- | --- | --- | --- |
| Namespace and workspace prompt | `scripts/deploy.sh`; `my-values/setup-secrets.sh` | selects the Kubernetes namespace and optionally records `my-values/.workspace-namespace` for local operator convenience | `./scripts/deploy.sh status`; generated inventory check |
| Component switches | `scripts/deploy.sh`; `my-values/setup-secrets.sh` | controls optional PostgreSQL, Qdrant, LiteLLM, and Tailscale setup paths; `ALLOW_PARTIAL_INFRA` changes rollout failures from fail-closed to warning | deployment truth plus live rollout status |
| Secret setup controls | `my-values/setup-secrets.sh` | chooses interactive/noninteractive/auto resolution, overwrite behavior, source namespace copies, and Tailscale OAuth bootstrap | `kubectl -n "$NAMESPACE" get secret ...`; `kubectl -n "$TAILSCALE_OPERATOR_NAMESPACE" get secret operator-oauth` |
| Local image verification | `scripts/deploy.sh` | separates host-visible image push target from cluster-visible pull target for `build-local-images` and `verify-live` | `./scripts/deploy.sh build-local-images [tag]`; `./scripts/deploy.sh verify-live [tag]` |

## Failure Modes

- Invalid boolean-like values can skip expected component paths or keep optional setup enabled; use the exact values listed in this table.
- Noninteractive secret setup warns when a required source is unavailable instead of inventing credentials.
- `ALLOW_PARTIAL_INFRA=true` is for troubleshooting only; the default infra path should fail closed on required rollout failures.
- Local image verification requires both `LOCAL_REGISTRY_PUSH` and `LOCAL_REGISTRY_PULL` when the host-visible and cluster-visible registry names differ.

## Checks

```bash
npm run docs:inventory:check
npm run docs:generate:check
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
```

## Generated from

- `../generated/inventory/deploy-script.json`
- `../generated/inventory/secret-setup.json`
- `../../scripts/docs-generate.mjs`
