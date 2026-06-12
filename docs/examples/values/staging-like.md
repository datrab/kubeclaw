# Staging-Like Values Example

Status: example, not production default
Audience: operators, developers

## Purpose

Show a staging-like command shape that keeps the optional infrastructure enabled and requires real external credentials.

Use this when you need a near-production rehearsal of the deployment script and values stack. It still is not a production guarantee: provider accounts, live CNI enforcement, backup/restore, and SLOs remain outside repo-only verification.

## Example Commands

```bash
export NAMESPACE=kubeclaw-staging
export KUBECLAW_DEPLOY_LITELLM=true
export KUBECLAW_DEPLOY_POSTGRESQL=true
export KUBECLAW_DEPLOY_QDRANT=true
export TAILSCALE_OPERATOR_ENABLED=true

./scripts/deploy.sh setup
./scripts/deploy.sh secrets
./scripts/deploy.sh infra
./scripts/deploy.sh agents
./scripts/deploy.sh smoke
```

## Expected Shape

- Redis, PostgreSQL, Qdrant, LiteLLM, registry mirror, registry-local, NetworkPolicies, Buster namespace fence, and Tailscale operator are deployed.
- `operator-oauth` must exist in the Tailscale operator namespace.
- `litellm-secrets`, `google-sa-key`, and `postgresql-secrets` must exist when LiteLLM and PostgreSQL are enabled.
- Nova and Buster agents render from the shared chart with their role-specific values and runtime config overlays.

## Required External Inputs

- provider/model credentials
- Discord bot tokens and webhook
- GHCR pull credentials
- Git deploy keys
- Tailscale OAuth client credentials
- optional Google service account JSON for LiteLLM config

## Source Of Truth

- `scripts/deploy.sh` owns setup, infra, agents, live image verification, smoke, and teardown.
- `my-values/setup-secrets.sh` owns Secret resolution and optional component Secret rules.
- `my-values/infra/litellm-config.yaml` and `my-values/infra/litellm-deployment.yaml` own LiteLLM config/deployment surfaces.
- `my-values/infra/tailscale-operator-values.yaml` owns the Tailscale operator values file used by the deploy script.
- `tests/verification/deployment/check-deployment-truth.mjs` owns repo-side deployment assertions.

## Verify

```bash
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
kubectl -n "$NAMESPACE" get pods,svc,pvc,networkpolicy
kubectl -n "$NAMESPACE" get secret litellm-secrets google-sa-key postgresql-secrets
kubectl -n tailscale get secret operator-oauth
./scripts/deploy.sh smoke
```

## Failure Signals

- Missing `operator-oauth` blocks Tailscale operator setup or final preview behavior.
- Missing `litellm-secrets`, `postgresql-secrets`, or `google-sa-key` can block LiteLLM readiness.
- Image pull failures point at `ghcr-secret`, image tags, or local registry override settings.
- `ALLOW_PARTIAL_INFRA=true` lets rollout failures continue only for explicit troubleshooting; leave it false for staging-like readiness checks.
