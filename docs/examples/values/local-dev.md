# Local/Dev Values Example

Status: example, not production default
Audience: operators, developers

## Purpose

Show a small local/dev shape for trying the deployment flow while disabling optional components that require external setup.

Use this when you need to test namespace setup, core infrastructure, agent rendering, agent rollout, NetworkPolicies, and smoke checks without proving provider, LiteLLM, Qdrant memory, PostgreSQL, or Tailscale behavior.

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
- Nova and Buster still render from the shared Helm chart and should expose their internal gateway Services according to current values.

## Source Of Truth

- `scripts/deploy.sh` owns component flags, `infra`, `agents`, and `smoke`.
- `charts/kubeclaw/templates/deployment.yaml` owns agent runtime environment, config overlays, and dependency probes.
- `my-values/infra/network-policies.yaml` owns the portable NetworkPolicy baseline.
- `tests/verification/deployment/check-deployment-truth.mjs` asserts rendered deployment and smoke contracts.

## Verify

```bash
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
kubectl -n "$NAMESPACE" get pods,svc,pvc,networkpolicy
```

## Failure Signals

- `./scripts/deploy.sh infra` still trying to wait for Qdrant, PostgreSQL, LiteLLM, or Tailscale means the component flags were not exported or normalized as expected.
- `./scripts/deploy.sh smoke` failure points at agent rollout, in-pod OpenClaw gateway status, deployed code bundle, or runtime swarm config.
- Missing NetworkPolicies means the core infra/security baseline did not apply even though optional services were disabled.

## When Not To Use This

Do not use this shape for final previews, provider/proxy validation, Qdrant memory validation, PostgreSQL-backed LiteLLM validation, or production-like readiness testing.
