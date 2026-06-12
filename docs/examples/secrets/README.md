# Secret Examples

Status: examples
Audience: operators, developers

## Purpose

Provide placeholder-only secret examples. Never commit real credentials.

Use this directory when you need to see command shapes for required Kubernetes Secrets. For real setup, prefer `../../deployment/secrets.md` and `my-values/setup-secrets.sh`; this page is a teaching aid and fallback reference, not a replacement for the helper.

## Placeholder Template

- [Placeholder secrets](placeholder-secrets.md)

## Source Of Truth

| Secret area | Source owner | Required when | Notes |
| --- | --- | --- | --- |
| Shared OpenClaw credentials | `my-values/setup-secrets.sh`; `charts/kubeclaw/templates/secret.yaml`; `charts/kubeclaw/templates/deployment.yaml` | agent pods and gateway runtime | Includes gateway tokens, provider keys, Discord token/webhook, and LiteLLM API key when used. |
| Redis | `my-values/setup-secrets.sh`; Redis infra values | pipeline/Buster task, completion, and telemetry streams | `redis-secrets` must contain `redis-password`. |
| GHCR image pull | `my-values/setup-secrets.sh`; `charts/kubeclaw/templates/deployment.yaml` | pulling configured GHCR images | `ghcr-secret` is wired through image pull secrets. |
| PostgreSQL and LiteLLM | `my-values/setup-secrets.sh`; `my-values/infra/litellm-config.yaml`; `my-values/infra/litellm-deployment.yaml` | `KUBECLAW_DEPLOY_POSTGRESQL=true` and `KUBECLAW_DEPLOY_LITELLM=true` | Uses `postgresql-secrets`, `litellm-secrets`, and optional `google-sa-key`. |
| Tailscale operator | `scripts/deploy.sh`; `my-values/setup-secrets.sh` | `TAILSCALE_OPERATOR_ENABLED=true` | `operator-oauth` lives in the Tailscale operator namespace, default `tailscale`. |

## Apply

Preferred setup:

```bash
export NAMESPACE=kubeclaw
./scripts/deploy.sh secrets
```

Manual placeholder review:

```bash
sed -n '1,220p' docs/examples/secrets/placeholder-secrets.md
```

## Verify

```bash
npm run docs:inventory:check
kubectl -n "$NAMESPACE" get secret openclaw-shared-secrets redis-secrets ghcr-secret
kubectl -n "$NAMESPACE" get secret postgresql-secrets litellm-secrets google-sa-key
kubectl -n tailscale get secret operator-oauth
```

## Failure Signals

- `./scripts/deploy.sh secrets` reports a missing or partial Secret in noninteractive mode.
- LiteLLM rollout fails because `litellm-secrets`, `postgresql-secrets`, `google-sa-key`, or provider credentials are missing.
- Buster or Nova pod startup fails because gateway tokens, Redis password, or provider keys are missing.
- A placeholder such as `<generated-token>` appears in a live Secret. Replace it before running agents.

## Limits

The examples do not validate provider accounts, Discord permissions, GHCR token scopes, or Tailscale OAuth grants. They only document local Kubernetes Secret names and key shapes.
