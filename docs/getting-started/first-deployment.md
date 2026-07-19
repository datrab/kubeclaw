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

The deployment truth check validates rendered Kubernetes resources, confirms expected service exposure, verifies Buster RBAC and isolation resources, and rejects legacy processor surfaces.

## Live deployment shape

The chart expects a Kubernetes namespace such as `kubeclaw`, a shared secret named `openclaw-shared-secrets`, Redis/Qdrant/LiteLLM infrastructure, and agent PVCs. `scripts/deploy.sh` is the deployment helper for applying production values, and `my-values/setup-secrets.sh` is the local secret setup helper.

The implemented image-based command sequence is:

```bash
./scripts/deploy.sh setup
./scripts/deploy.sh infra
./scripts/deploy.sh agents
./scripts/deploy.sh smoke
```

`setup` creates or verifies the namespace, adds Bitnami/Qdrant/Tailscale Helm repos, and runs the secret setup helper when a TTY is available. If `NAMESPACE` is unset and a TTY is available, it asks for a workspace namespace every time. Press Enter to use the remembered/default namespace, or type a new namespace to deploy another pipeline namespace and remember that value.

`infra` installs required Redis, registry mirror, registry-local, the Buster namespace fence, and the Tailscale operator. It also installs optional PostgreSQL, Qdrant, and LiteLLM unless their switches are disabled. `agents` installs Nova and Buster with production values. `smoke` waits for both agent deployments, checks dependency-aware pod readiness, runs `openclaw gateway status` in the `kubeclaw` container, and verifies `/app/skills` plus `/home/node/.openclaw/swarm.config.json`.

Operators can rerun only the guided secret setup with:

```bash
./scripts/deploy.sh secrets
```

For code-only redeploys, the default path is:

```bash
./scripts/deploy.sh code
```

It resolves the latest published remote `main` bundles automatically.

The script also supports explicit pinning:

```bash
NOVA_CODE_BUNDLE_ARCHIVE_URL=... \
NOVA_CODE_BUNDLE_EXPECTED_COMMIT=<sha> \
./scripts/deploy.sh code nova
```

`code` updates the selected bundle input for the targeted agent and waits for the Helm-driven rollout. It does not build images locally.

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

## First Live Run Sequence

Use this sequence when the prerequisites above are satisfied. It is source-backed by `scripts/deploy.sh`, but external credentials and cluster readiness are still live responsibilities.

```bash
export NAMESPACE=kubeclaw
./scripts/deploy.sh setup
./scripts/deploy.sh infra
./scripts/deploy.sh agents
./scripts/deploy.sh status
./scripts/deploy.sh smoke
```

Expected resources include Redis, optional PostgreSQL/Qdrant/LiteLLM, `Deployment/agent-nova`, `Deployment/agent-buster`, Services for both agents, PVCs for workspace/config storage, and Secrets from `my-values/setup-secrets.sh`.

If this fails:

- setup/secrets failure: inspect missing Secret names and rerun with `KUBECLAW_SECRET_SETUP_MODE=interactive`.
- infra rollout failure: keep `ALLOW_PARTIAL_INFRA=false` unless intentionally troubleshooting, then inspect the specific deployment.
- agent pod not ready: inspect init-container logs before main container logs.
- smoke fails after pod readiness: inspect `/runtime-config/openclaw.json`, `SWARM_CONFIG`, Redis, and gateway health.

Run `node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"` before live changes to confirm the repo still renders the expected deployment shape.
