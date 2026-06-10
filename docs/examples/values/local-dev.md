# Local/Dev Values Example

Status: example, not production default
Audience: operators

## Purpose

Show a small local/dev shape for trying the deployment flow while disabling optional components that require external setup.

## Example Commands

```bash
export NAMESPACE=kubeclaw-dev
export KUBECLAW_DEPLOY_LITELLM=false
export KUBECLAW_DEPLOY_POSTGRESQL=false
export KUBECLAW_DEPLOY_QDRANT=false
export TAILSCALE_OPERATOR_ENABLED=false

./scripts/deploy.sh setup
./scripts/deploy.sh infra
./scripts/deploy.sh agents
./scripts/deploy.sh smoke
```

## Expected Shape

- Redis, registry mirror, registry-local, NetworkPolicies, and the Buster namespace fence are still deployed.
- PostgreSQL, Qdrant, LiteLLM, and Tailscale operator are skipped.
- Agent dependency probes for LiteLLM and Qdrant are disabled by `deploy_agent` when the matching component flags are false.

## When Not To Use This

Do not use this shape for final previews, provider/proxy validation, Qdrant memory validation, or production-like readiness testing.
