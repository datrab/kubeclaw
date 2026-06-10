# Staging-Like Values Example

Status: example, not production default
Audience: operators

## Purpose

Show a staging-like command shape that keeps the optional infrastructure enabled and requires real external credentials.

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

## Required External Inputs

- provider/model credentials
- Discord bot tokens and webhook
- GHCR pull credentials
- Git deploy keys
- Tailscale OAuth client credentials
- optional Google service account JSON for LiteLLM config
