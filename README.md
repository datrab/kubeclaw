# KubeClaw

KubeClaw is a Kubernetes-deployed OpenClaw swarm for orchestrated software delivery. The current repository contains the Helm chart, production values, runtime images, Nova pipeline skills, Buster test skills, infrastructure manifests, and verification scripts used to operate the swarm.

Nova is the orchestrator. Buster is the sandboxed tester. Redis carries task, completion, and telemetry traffic. Qdrant stores OpenClaw memory. LiteLLM provides an OpenAI-compatible model proxy. PostgreSQL backs LiteLLM state. The registry manifests support local image publishing and pull-through caching.

## Start here

- [Documentation home](docs/README.md)
- [Getting started](docs/getting-started/README.md)
- [Architecture](docs/architecture/README.md)
- [Deployment](docs/deployment/README.md)
- [Pipeline](docs/pipeline/README.md)
- [Operator guides](docs/operators/README.md)
- [Developer guides](docs/developers/README.md)
- [Reference](docs/reference/README.md)
- [Decision records](docs/decisions/README.md)
- [Open issues](docs/open-issues.md)

## 5-Minute Verification Quickstart

This repository has a source-verified local quickstart for validating the deployment surface without installing into a cluster. From the repository root:

```bash
helm template agent-nova charts/kubeclaw -n kubeclaw -f my-values/nova-values.yaml >/tmp/kubeclaw-nova-render.yaml
helm template agent-buster charts/kubeclaw -n kubeclaw -f my-values/buster-values.yaml >/tmp/kubeclaw-buster-render.yaml
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
```

Expected result: the deployment truth command prints JSON with all checks passed and kubeconform summaries for Nova and Buster. In this pass it validated 6 Nova resources and 10 Buster resources.

## Live Cluster Path

The live operator path is implemented by `scripts/deploy.sh`:

```bash
./scripts/deploy.sh setup
./scripts/deploy.sh infra
./scripts/deploy.sh agents
./scripts/deploy.sh smoke
```

This requires a real Kubernetes/K3s cluster, Helm, kubectl, Docker for local image verification, selected secrets, and the k3s registry configuration when the Buster Kubernetes suite must pull from `registry-local`. A complete clean-cluster quickstart is not source-verified yet; the gap is tracked in [docs/open-issues.md](docs/open-issues.md).

## Repository shape

- `charts/kubeclaw/` - shared Helm chart for agent releases.
- `my-values/` - production values and infrastructure manifests.
- `docker/` - general and sandbox runtime images.
- `skills/nova/` - Nova pipeline orchestration.
- `skills/buster/` - Buster task worker and suites.
- `skills/common/` - shared contracts and support services.
- `tests/verification/` - behavior, contract, runtime, and deployment verification.
- `docs/` - active documentation and archived historical material.

## Current Deployment Facts

- The Helm chart renders one agent per release. Production values define `agent-nova` and `agent-buster`.
- Nova uses the general image and exposes the gateway on NodePort `30073`; its Prism preview sidecar exposes NodePort `30456`.
- Buster uses the sandbox image, runs `buster-pipeline.ts` and the OpenClaw gateway in one container, exposes gateway NodePort `30074`, and enables privileged Podman-in-Pod plus a service account.
- Infrastructure is deployed separately: Redis, PostgreSQL, Qdrant, LiteLLM, registry mirror, writable registry-local, the Buster namespace fence, and the portable Kubernetes NetworkPolicy baseline in `my-values/infra/network-policies.yaml`.
- `scripts/deploy.sh infra` applies that NetworkPolicy baseline after shared infrastructure. `tests/verification/deployment/check-deployment-truth.mjs` verifies 13 policy objects, including namespace default-deny ingress/egress, DNS egress, agent service egress, Clawdeck Redis access, LiteLLM PostgreSQL/provider egress, registry-mirror upstream egress, and temporary ingress allowances for current exposed ports.
- The repository does not currently include Prometheus, Loki, Fluent Bit, OpenTelemetry, ServiceMonitor, PodMonitor, or Cilium/FQDN egress policy manifests. NetworkPolicy egress remains portable and port-based until a Kubernetes-native observability and hostname-aware egress layer is added.

## Community and security

- Contribution guidance: [CONTRIBUTING.md](CONTRIBUTING.md)
- Code of conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- Security policy: [SECURITY.md](SECURITY.md)
- License: not selected in this repository yet. This is tracked in [docs/open-issues.md](docs/open-issues.md).
