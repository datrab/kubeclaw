# First Deployment

Status: current with documented gaps
Audience: operator

## Purpose

Describe the source-backed path toward a first KubeClaw deployment without inventing missing live-cluster steps.

## What the repository proves

The repository proves that the Nova and Buster Helm releases render and pass deployment truth validation with production values:

```bash
helm template agent-nova charts/kubeclaw -n kubeclaw -f my-values/nova-values.yaml
helm template agent-buster charts/kubeclaw -n kubeclaw -f my-values/buster-values.yaml
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
```

The deployment truth check validates rendered Kubernetes resources, confirms expected service exposure, verifies Buster RBAC/sandbox resources, and rejects legacy processor surfaces.

## Live deployment shape

The chart expects a Kubernetes namespace such as `kubeclaw`, a shared secret named `openclaw-shared-secrets`, Redis/Qdrant/LiteLLM infrastructure, and agent PVCs. `scripts/deploy.sh` is the deployment helper for applying production values, and `my-values/setup-secrets.sh` is the local secret setup helper.

The implemented command sequence is:

```bash
./scripts/deploy.sh setup
./scripts/deploy.sh infra
./scripts/deploy.sh agents
./scripts/deploy.sh smoke
```

`setup` creates or verifies the namespace, adds Bitnami/Qdrant/Tailscale Helm repos, runs the secret setup helper when a TTY is available, and notes that local-image verification needs an explicit private registry pull path. If `NAMESPACE` is unset, it asks for a workspace namespace and stores the answer in `my-values/.workspace-namespace`.

`infra` installs required Redis, registry mirror, registry-local, the Buster namespace fence, and the Tailscale operator. It also installs optional PostgreSQL, Qdrant, and LiteLLM unless their switches are disabled. `agents` installs Nova and Buster with production values. `smoke` waits for both agent deployments, checks dependency-aware pod readiness, runs `openclaw gateway status` in the `kubeclaw` container, and verifies `/app/skills` plus `/home/node/.openclaw/swarm.config.json`.

Operators can rerun only the guided secret setup with:

```bash
./scripts/deploy.sh secrets
```

For live image verification, the script also supports:

```bash
./scripts/deploy.sh build-local-images
./scripts/deploy.sh verify-live
```

`verify-live` builds the general and sandbox images, pushes them to `registry-local`, redeploys agents with those image tags, disables image pull secrets for that verification run, and then runs smoke checks.

## Required live inputs

Before running the live path, an operator must supply source-backed prerequisites that cannot be invented by the docs:

- Kubernetes/K3s cluster reachable through `kubectl`
- Helm with Bitnami and Qdrant chart access
- `openclaw-shared-secrets` keys for gateway tokens, Anthropic, Discord, webhook, Stitch, and LiteLLM when optional LiteLLM is deployed
- `redis-secrets` for required Redis
- `postgresql-secrets` when optional PostgreSQL is deployed
- `litellm-secrets` and `google-sa-key` when optional LiteLLM is deployed
- `git-deploy-key-nova` and `git-deploy-key-buster`
- `tailscale/operator-oauth` for final-preview Tailscale ingress
- k3s registry mirror config copied from `my-values/infra/k3s-registries.yaml` to every node when Buster Kubernetes tests need local image pulls

Before a live install, review:

- `../deployment/infrastructure.md`
- `../deployment/secrets.md`
- `../deployment/networking.md`
- `../deployment/rbac-and-sandbox.md`
- `../operators/install-and-upgrade.md`

## Current gap

A complete source-verified five-minute clean-cluster quickstart is not present. The command surface exists, but the docs cannot promise a timed live install until maintainer-selected prerequisites, secret provisioning, cluster profile, and rollback guarantees are verified end to end. The missing quickstart is tracked in `../open-issues.md`.
