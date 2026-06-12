# Install and Upgrade

Status: current
Audience: operator

## Purpose

Install or update the current KubeClaw deployment.

## Current Behavior

Set `NAMESPACE` for automation, or let `setup` ask for the workspace namespace interactively:

```bash
export NAMESPACE=kubeclaw
```

Prepare namespace and Helm repos:

```bash
./scripts/deploy.sh setup
```

When `NAMESPACE` is not set and a terminal is available, `setup` asks:

```text
How would you like to name the workspace namespace? [kubeclaw]:
```

The answer is stored in `my-values/.workspace-namespace`. Later interactive setup/secrets runs still ask for the namespace; the remembered value becomes the default, so pressing Enter reuses it and typing a different namespace targets a second deployment. Use `KUBECLAW_WORKSPACE_PROMPT=false` to suppress the prompt or `KUBECLAW_WORKSPACE_PROMPT=true` to require it.

When run from a terminal, `setup` also runs the secret setup helper. The helper reuses existing Kubernetes Secrets when their required keys are present, creates from SOPS when available, copies from `SRC_NS` when available, and otherwise prompts for the missing values. If a Secret already exists but is missing required keys, it prompts only for those keys and patches them into the existing Secret. Operators can paste external credentials and let the helper generate internal Redis/PostgreSQL/LiteLLM/gateway values when those prompt fields are left blank.

`TTY` means an interactive terminal where prompts can be shown. `SRC_NS` is the source namespace for copying existing Secrets; the default is `default`.

Run or rerun secret setup directly with:

```bash
./scripts/deploy.sh secrets
```

Useful controls:

```bash
KUBECLAW_SECRET_SETUP_MODE=interactive ./scripts/deploy.sh secrets
KUBECLAW_SECRET_SETUP_MODE=noninteractive ./scripts/deploy.sh setup
KUBECLAW_RUN_SECRET_SETUP=false ./scripts/deploy.sh setup
KUBECLAW_SECRETS_OVERWRITE=true ./scripts/deploy.sh secrets
```

Optional component switches control both deployment and secret prompts:

```bash
KUBECLAW_DEPLOY_LITELLM=false ./scripts/deploy.sh secrets
KUBECLAW_DEPLOY_POSTGRESQL=false ./scripts/deploy.sh secrets
KUBECLAW_DEPLOY_QDRANT=false ./scripts/deploy.sh infra
```

Redis, registries, the Buster namespace fence, agents, GHCR pull credentials, Git deploy keys, and Tailscale OAuth are required for the normal deployment path. PostgreSQL, Qdrant, and LiteLLM are optional and enabled by default. When an optional component is disabled, its component-specific Secrets are skipped. For example, `KUBECLAW_DEPLOY_LITELLM=false` skips `litellm-secrets` and `google-sa-key` prompts, while `KUBECLAW_DEPLOY_POSTGRESQL=false` skips `postgresql-secrets`.

For final-preview Tailscale ingress, the same helper creates `tailscale/operator-oauth` by prompting for the Tailscale OAuth client ID and secret. Non-interactive operators can still pre-create that Secret manually or provide temporary `TAILSCALE_OAUTH_CLIENT_ID` and `TAILSCALE_OAUTH_CLIENT_SECRET` env vars.

Deploy infrastructure:

```bash
./scripts/deploy.sh infra
```

This deploys required Redis, registry resources, Buster namespace fence, and the Tailscale Kubernetes Operator, plus optional PostgreSQL, Qdrant, and LiteLLM when enabled. To force only the Tailscale operator install:

```bash
TAILSCALE_OPERATOR_ENABLED=true ./scripts/deploy.sh tailscale
```

`infra` exits nonzero when an enabled component fails to become ready. For deliberate troubleshooting only, `ALLOW_PARTIAL_INFRA=1 ./scripts/deploy.sh infra` keeps going after raw-manifest rollout failures and prints the underlying rollout error.

Deploy both agents:

```bash
./scripts/deploy.sh agents
```

Deploy one agent:

```bash
./scripts/deploy.sh agent nova
./scripts/deploy.sh agent buster
```

Full deployment path:

```bash
./scripts/deploy.sh all
```

For upgrades, the agent commands use `helm upgrade --install`. Infra also uses Helm upgrade for Redis, PostgreSQL, Qdrant, and the Tailscale Kubernetes Operator, and `kubectl apply` for LiteLLM, registry resources, and the namespace fence.

## Upgrade Checklist

1. Run `npm run docs:check` and `node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"` before changing live resources.
2. Snapshot current live state with `kubectl -n "$NAMESPACE" get pods,svc,pvc,secret` and rendered Helm output.
3. Confirm `my-values/setup-secrets.sh` still owns required Secret names/keys if values changed.
4. Run `./scripts/deploy.sh infra` only when infra values/manifests changed.
5. Run `./scripts/deploy.sh agents` for agent/chart/image/config changes.
6. Run `./scripts/deploy.sh smoke` and inspect init-container logs for config/Git/skill overlay failures.

## Rollback Boundaries

The repo has teardown commands and Helm upgrade paths, but it does not include a full backup/restore automation for persistent PVC contents. Treat workspace/config PVCs and Secrets as stateful resources. Before destructive maintenance, preserve the current rendered values, relevant Secrets, and `.swarm/logs/pipeline` artifacts.
