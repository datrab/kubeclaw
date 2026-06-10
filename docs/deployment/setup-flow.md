# Setup Flow

Status: current with documented gaps
Audience: operator

This page helps an operator run the source-backed KubeClaw platform setup sequence and understand what each step changes.

## When to use this

Use this when preparing a namespace for KubeClaw, creating or refreshing required Secrets, deploying infrastructure, deploying agents, or checking whether an existing namespace is ready for operation.

For a clean live cluster, this page is the current setup map, not yet a complete five-minute production quickstart. The missing fully source-verified clean-cluster quickstart remains tracked in `../open-issues.md`.

## Before you begin

Run commands from the repository root.

Required local tools:

- `kubectl`
- `helm`
- `node`
- `npm` for docs inventory/check commands
- `docker` only for local image build or live image verification commands

Required access:

- Kubernetes context pointed at the target cluster
- permission to create the target namespace
- permission to create Secrets in the target namespace
- permission to install Helm releases and apply infrastructure manifests
- permission to create the Tailscale operator namespace and `operator-oauth` Secret when final previews are enabled

Decide these values before setup:

```bash
export NAMESPACE=kubeclaw
export KUBECLAW_DEPLOY_POSTGRESQL=true
export KUBECLAW_DEPLOY_QDRANT=true
export KUBECLAW_DEPLOY_LITELLM=true
export TAILSCALE_OPERATOR_ENABLED=true
```

## What happens

`./scripts/deploy.sh setup` creates or verifies the namespace, adds the Bitnami, Qdrant, and Tailscale Helm repositories, updates Helm repo metadata, and runs secret setup when a TTY is available or when `KUBECLAW_RUN_SECRET_SETUP=true`.

`./scripts/deploy.sh secrets` runs `my-values/setup-secrets.sh`. The helper resolves each Secret by reusing complete target Secrets, patching missing keys interactively, reading SOPS for the shared Secret when available, copying from `SRC_NS`, or prompting/generating values when interactive mode is enabled.

`./scripts/deploy.sh infra` deploys Redis, optional PostgreSQL, optional Qdrant, optional LiteLLM, registry mirror, registry-local, Buster namespace fence, NetworkPolicies, and Tailscale Kubernetes Operator when enabled.

`./scripts/deploy.sh agents` deploys `agent-nova` and `agent-buster` from the shared Helm chart.

`scripts/setup.sh` is a guarded legacy Git repository bootstrap. It is not the normal platform deployment flow.

## Procedure

Prepare the namespace and Helm repositories:

```bash
./scripts/deploy.sh setup
```

If setup skipped Secrets because no TTY was available, or if you intentionally want to rerun secret setup:

```bash
./scripts/deploy.sh secrets
```

Deploy infrastructure:

```bash
./scripts/deploy.sh infra
```

Deploy agents:

```bash
./scripts/deploy.sh agents
```

Run pod-level smoke checks:

```bash
./scripts/deploy.sh smoke
```

Check the namespace state at any point:

```bash
./scripts/deploy.sh status
```

## Verify the result

Verify expected generated inventory is current:

```bash
npm run docs:inventory:check
```

Verify the deployment truth surface locally:

```bash
helm template agent-nova charts/kubeclaw -n "$NAMESPACE" -f my-values/nova-values.yaml >/tmp/kubeclaw-nova-render.yaml
helm template agent-buster charts/kubeclaw -n "$NAMESPACE" -f my-values/buster-values.yaml >/tmp/kubeclaw-buster-render.yaml
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
```

Verify the live namespace:

```bash
kubectl -n "$NAMESPACE" get pods,svc,pvc
kubectl -n "$NAMESPACE" rollout status deployment/agent-nova --timeout=180s
kubectl -n "$NAMESPACE" rollout status deployment/agent-buster --timeout=180s
```

## Expected output or state

After setup and secrets, the target namespace exists and required Secrets are present or clearly reported missing by the helper.

After infrastructure, expected resources include Redis plus enabled optional components:

- `redis`
- `postgresql` when `KUBECLAW_DEPLOY_POSTGRESQL=true`
- `qdrant` when `KUBECLAW_DEPLOY_QDRANT=true`
- `litellm` when `KUBECLAW_DEPLOY_LITELLM=true`
- `registry-mirror`
- `registry-local`
- Buster namespace fence resources
- NetworkPolicies
- Tailscale operator resources when `TAILSCALE_OPERATOR_ENABLED=true`

After agents, the namespace should have deployments for:

- `agent-nova`
- `agent-buster`

## Common failures

### Secret setup skipped

Likely cause:
`KUBECLAW_RUN_SECRET_SETUP=auto` and no interactive TTY was available.

Check:

```bash
kubectl -n "$NAMESPACE" get secrets
```

Recovery:

```bash
KUBECLAW_SECRET_SETUP_MODE=interactive ./scripts/deploy.sh secrets
```

Expected recovery state:
Required Secrets exist in the target namespace, and `operator-oauth` exists in the Tailscale operator namespace when final previews are enabled.

### LiteLLM waits or fails

Likely cause:
LiteLLM is enabled but `litellm-secrets`, `google-sa-key`, PostgreSQL, or provider credentials are incomplete.

Check:

```bash
kubectl -n "$NAMESPACE" get secret litellm-secrets google-sa-key
kubectl -n "$NAMESPACE" rollout status deployment/litellm --timeout=120s
```

Recovery:

```bash
./scripts/deploy.sh secrets
./scripts/deploy.sh infra
```

Expected recovery state:
`deployment/litellm` rolls out successfully.

### Tailscale operator install fails

Likely cause:
`TAILSCALE_OPERATOR_ENABLED=true` but `operator-oauth` is missing or incomplete.

Check:

```bash
kubectl -n tailscale get secret operator-oauth
kubectl get ingressclass tailscale
```

Recovery:

```bash
kubectl create namespace tailscale --dry-run=client -o yaml | kubectl apply -f -
kubectl create secret generic operator-oauth -n tailscale \
  --from-literal=client_id="<tailnet-client-id>" \
  --from-literal=client_secret="<tailnet-client-secret>"
./scripts/deploy.sh tailscale
```

Expected recovery state:
`IngressClass/tailscale` exists and operator pods in the Tailscale namespace are ready.

## Recovery

If agent deployment fails after infrastructure succeeds, inspect the agent rollout and logs:

```bash
kubectl -n "$NAMESPACE" describe deployment agent-nova
kubectl -n "$NAMESPACE" describe deployment agent-buster
kubectl -n "$NAMESPACE" logs deployment/agent-nova -c kubeclaw
kubectl -n "$NAMESPACE" logs deployment/agent-buster -c kubeclaw
kubectl -n "$NAMESPACE" logs deployment/agent-buster -c buster-pipeline
```

Remove only agents while keeping infrastructure and Secrets:

```bash
./scripts/deploy.sh teardown-agents
```

Remove agents and infrastructure while keeping namespace and Secrets:

```bash
./scripts/deploy.sh teardown
```

Destroy the namespace and everything in it only when you intend to recreate Secrets and infrastructure:

```bash
./scripts/deploy.sh teardown-all
```

## Related reference

- `secrets.md`
- `infrastructure.md`
- `litellm.md`
- `tailscale-operator.md`
- `agent-deployments.md`
- `deployment-verification.md`
- `../reference/secrets.md`
- `../reference/helm-values.md`
- `../reference/verification-commands.md`

## Sources

- `scripts/deploy.sh`
- `my-values/setup-secrets.sh`
- `docs/generated/inventory/deploy-script.json`
- `docs/generated/inventory/secret-setup.json`
- `docs/generated/inventory/helm-values.json`
- `tests/verification/deployment/check-deployment-truth.mjs`
