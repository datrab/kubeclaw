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
```

Live smoke requires a cluster and checks rollout, pod readiness, in-pod `openclaw gateway status`, persisted startup verification status, in-pod readiness, `/app/skills`, and `/home/node/.openclaw/swarm.config.json`. Startup verification now owns the deep first-boot checks such as Redis stream writes, registry reachability, and enabled LiteLLM/Qdrant validation. Readiness stays cheaper with drain state, startup marker, gateway health, Redis `PING`, and Buster heartbeat freshness.

Deploy modes:

- `./scripts/deploy.sh image [nova|buster|both]` refreshes mutable runtime tags through `kubectl rollout restart` after Helm apply.
- `./scripts/deploy.sh code [nova|buster|both]` updates bundle inputs and waits for the Helm-driven rollout. The default path derives GitHub release asset URLs from the repository and expected commit; explicit archive URLs still override it.

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

The local deployment truth check does not prove secret values, external Vertex AI access, Discord delivery, live PVC mutation/rotation behavior, dependency outage readiness behavior, node firewall rules, Tailscale exposure, or real Buster suite execution. Use `./scripts/deploy.sh smoke`, the `image` or `code` deploy paths, and behavior/runtime tests for those surfaces.

## Common Failures

- Helm render fails: fix values/schema/template syntax before applying to a cluster.
- Deployment truth check fails: inspect the failing resource class in the JSON output and update either chart behavior or docs.
- Local check passes but live rollout fails: switch to deployment/operator verification commands because the issue is runtime dependency, credentials, or cluster state.

## Claim-To-Check Map

| Claim type | Source owner | Command | Expected signal |
| --- | --- | --- | --- |
| Chart renders for Nova and Buster | `charts/kubeclaw/templates/*.yaml`; `my-values/nova-values.yaml`; `my-values/buster-values.yaml` | `node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"` | render, kubeconform, and deployment-shape checks pass |
| Secrets and config are wired, not literal runtime values | `charts/kubeclaw/templates/secret.yaml`; `configmap-gateway.yaml`; `deployment.yaml`; `my-values/setup-secrets.sh` | deployment truth plus `kubectl -n "$NAMESPACE" get secret ...` in live cluster | rendered manifests reference expected Secret names and keys |
| Agent pods can start locally enough for smoke | `scripts/deploy.sh`; `charts/kubeclaw/templates/deployment.yaml` | `./scripts/deploy.sh smoke` or `./scripts/deploy.sh smoke-agent nova` | health script reports gateway/config/dependency checks |
| Image deploy refreshes mutable runtime tags cleanly | `scripts/deploy.sh` | `./scripts/deploy.sh image [target]` | Helm apply succeeds, rollout restart completes, smoke checks pass |
| Code deploy applies the selected bundle cleanly | `scripts/deploy.sh`; `charts/kubeclaw/templates/deployment.yaml`; `.github/workflows/build-images.yaml` | `./scripts/deploy.sh code [target]` with expected commit envs | omitting the target rolls all agents; init downloads and validates the GitHub-published `/app/skills` bundle, rollout completes, smoke checks pass |

Preserve failed render output and live `kubectl describe pod` output when escalating. They identify whether the failure belongs to source templates, values, credentials, image pulls, runtime config, or external providers.
