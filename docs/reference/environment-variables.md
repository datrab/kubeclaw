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
| `AGENT_HELM_TIMEOUT` | Helm wait timeout for agent upgrades (default: 45m) | `45m` |  |
| `AGENT_ROLLOUT_TIMEOUT` | Pod/deployment readiness timeout for agents (default: 45m) | `45m` |  |
| `ALLOW_PARTIAL_INFRA` | true\|false (default: false) | `false` |  |
| `BUILDKIT_ROOTLESS_PREFLIGHT_IMAGE` | Rootless BuildKit probe image (default: moby/buildkit:rootless) | `moby/buildkit:rootless` |  |
| `BUSTER_CODE_BUNDLE_ARCHIVE_URL` | Resolved Buster bundle archive URL for code deploy |  |  |
| `BUSTER_CODE_BUNDLE_EXPECTED_COMMIT` | Expected Buster source commit for code deploy |  |  |
| `CODE_BUNDLE_DEFAULT_REF` | Git ref to resolve when code deploy omits an explicit expected commit (default: refs/heads/main) | `refs/heads/main` |  |
| `CODE_BUNDLE_GITHUB_REPOSITORY` | owner/repo override for derived GitHub release bundle URLs |  |  |
| `CODE_BUNDLE_PREFLIGHT_SKIP` | true\|false to skip bundle URL existence checks before code deploy (default: false) | `false` |  |
| `CODE_BUNDLE_RELEASE_TAG` | GitHub release tag for published bundles (default: agent-code-bundles) | `agent-code-bundles` |  |
| `KUBECLAW_DEPLOY_LITELLM` | true\|false (default: true) | `true` | `true` |
| `KUBECLAW_DEPLOY_POSTGRESQL` | true\|false (default: true) | `true` | `true` |
| `KUBECLAW_DEPLOY_QDRANT` | true\|false (default: true) | `true` | `true` |
| `KUBECLAW_RUN_SECRET_SETUP` | auto\|true\|false for setup/all (default: auto) |  |  |
| `KUBECLAW_SECRET_SETUP_MODE` | auto\|interactive\|noninteractive (default: auto) |  | `auto` |
| `KUBECLAW_SECRETS_OVERWRITE` | true\|false (default: false) |  | `false` |
| `KUBECLAW_WORKSPACE_PROMPT` | auto\|true\|false (default: auto) | `auto` |  |
| `NAMESPACE` | Target namespace (default: kubeclaw) | `kubeclaw` | `kubeclaw` |
| `NOVA_CODE_BUNDLE_ARCHIVE_URL` | Resolved Nova bundle archive URL for code deploy |  |  |
| `NOVA_CODE_BUNDLE_EXPECTED_COMMIT` | Expected Nova source commit for code deploy |  |  |
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
| Code bundle selection | `scripts/deploy.sh` | derives GitHub release bundle URLs from repository + commit unless explicit archive URLs are provided | `NOVA_CODE_BUNDLE_EXPECTED_COMMIT=<sha> ./scripts/deploy.sh code nova`; `BUSTER_CODE_BUNDLE_EXPECTED_COMMIT=<sha> ./scripts/deploy.sh code buster` |

## Failure Modes

- Invalid boolean-like values can skip expected component paths or keep optional setup enabled; use the exact values listed in this table.
- Noninteractive secret setup warns when a required source is unavailable instead of inventing credentials.
- `ALLOW_PARTIAL_INFRA=true` is for troubleshooting only; the default infra path should fail closed on required rollout failures.
- Code deploy requires the expected commit for each targeted agent and, for private repositories, a bundle auth Secret the pod can use to fetch GitHub release assets.

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
