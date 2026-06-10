# Deployment Verification

Status: current
Audience: operator, developer

## Purpose

List source-verified deployment checks.

## Current Behavior

Render checks:

```bash
helm template agent-nova charts/kubeclaw -n kubeclaw -f my-values/nova-values.yaml
helm template agent-buster charts/kubeclaw -n kubeclaw -f my-values/buster-values.yaml
```

Deployment truth:

```bash
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
```

This local gate renders Nova and Buster, parses the rendered Kubernetes objects, validates them with `kubeconform -strict -summary -ignore-missing-schemas`, and validates local Kubernetes infra manifests where schemas are available. It checks Service exposure with structured NodePort allowlists, key env/secret wiring, Buster lease-only agent RBAC, bounded Buster sandbox storage, split gateway/pipeline container behavior, protected skills overlay behavior, dependency-aware exec probes, NetworkPolicy selectors/ports, the Buster namespace broker, guided secret setup, Tailscale operator deployment surfaces, and absence of the legacy processor surface.

Live smoke through `scripts/deploy.sh`:

```bash
./scripts/deploy.sh smoke
./scripts/deploy.sh smoke-agent nova
./scripts/deploy.sh smoke-agent buster
./scripts/deploy.sh verify-live
```

Live smoke requires a cluster and checks rollout, pod readiness, in-pod `openclaw gateway status`, `/app/skills`, and `/home/node/.openclaw/swarm.config.json`. Pod readiness now includes gateway health, Redis ping plus a health stream write, configured registry endpoints, and enabled LiteLLM/Qdrant checks. Buster readiness also checks the Buster process heartbeat.

`verify-live` is stronger than `smoke`: it builds local general and sandbox images, pushes them to the configured push registry, proves the cluster can pull both pushed runtime images with temporary pods, redeploys agents with those images, and then runs the same pod smoke checks. It requires Docker, Helm, kubectl, a deployed registry-local service, and an explicit cluster-visible pull path.

Final-preview Tailscale ingress also requires the Tailscale Kubernetes Operator. `./scripts/deploy.sh infra` installs it by default, waits for the operator pod to be Ready, and fails closed if `tailscale/operator-oauth` is missing; `TAILSCALE_OPERATOR_ENABLED=false` is only for non-preview development setups.

## Procedure

Render manifests and run the deployment truth check from the repo root:

```bash
helm template agent-nova charts/kubeclaw -n kubeclaw -f my-values/nova-values.yaml >/tmp/kubeclaw-nova-render.yaml
helm template agent-buster charts/kubeclaw -n kubeclaw -f my-values/buster-values.yaml >/tmp/kubeclaw-buster-render.yaml
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
```

## Verification Run

During this documentation pass, `node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"` passed with kubeconform summaries:

- Nova: `7 resources found ... Valid: 7, Invalid: 0, Errors: 0, Skipped: 0`
- Buster: `15 resources found ... Valid: 14, Invalid: 0, Errors: 0, Skipped: 1`
- NetworkPolicies: `12 resources found ... Valid: 12, Invalid: 0, Errors: 0, Skipped: 0`
- Local infra manifests: Buster namespace fence, LiteLLM, registry-local, registry-mirror, and NetworkPolicies are validated with `Invalid: 0` and `Errors: 0`; unsupported schemas may be skipped.

## What Is Not Verified Locally

The local deployment truth check does not prove secret values, external Vertex AI access, Discord delivery, live PVC mutation/rotation behavior, dependency outage readiness behavior, node firewall rules, Tailscale exposure, or real Buster suite execution. Use `./scripts/deploy.sh smoke`, `./scripts/deploy.sh verify-live`, and behavior/runtime tests for those surfaces.

## Common Failures

- Helm render fails: fix values/schema/template syntax before applying to a cluster.
- Deployment truth check fails: inspect the failing resource class in the JSON output and update either chart behavior or docs.
- Local check passes but live rollout fails: switch to deployment/operator verification commands because the issue is runtime dependency, credentials, or cluster state.
