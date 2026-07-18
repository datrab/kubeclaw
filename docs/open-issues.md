# Open Issues

Status: current
Audience: maintainers, operators, developers

## Purpose

This page contains only unresolved, source-backed project issues. Completed work is removed rather than retained as an implementation diary. Candidate improvements that are not current defects belong in [future implementation ideas](future-implementation-ideas.md) or the [roadmap](ROADMAP.md).

## Current Issues

### Public security disclosure contact is not selected

Area: security
Priority: low
Type: maintainer decision

This hobby project documents private maintainer coordination for collaborators but does not publish a dedicated disclosure address or response-time commitment. This is not a deployment blocker; it becomes useful if the project gains external users or contributors.

Next step: publish the chosen disclosure channel and update `SECURITY.md`.

### Buster sandbox remains privileged

Area: deployment security
Priority: high
Type: accepted operational risk requiring hardening

Broker mode removed broad cluster authority from the Buster agent. Buster requests disposable test namespaces through `BusterNamespaceLease`, and the separate namespace controller owns cluster-scoped namespace, namespaced RBAC, secret-copy, and final-preview ingress operations. This isolates test workloads and Kubernetes authority correctly. It does not sandbox the Buster pod itself: both Buster containers still run privileged Podman-in-Pod with an unconfined security profile and elevated capabilities on their node.

Sources:

- `charts/kubeclaw/templates/deployment.yaml`
- `charts/kubeclaw/templates/rbac.yaml`
- `charts/kubeclaw/templates/buster-namespace-controller.yaml`
- `cmd/buster-namespace-controller/main.go`
- `docs/deployment/rbac-and-sandbox.md`

Next step: design a narrower container-build/test isolation model without restoring cluster authority to the Buster agent.

### Temporary NodePort exposure remains

Area: deployment networking
Priority: medium
Type: operational risk

LiteLLM and the Nova Prism preview still use explicitly allowlisted NodePort exposure in the current deployment values. NetworkPolicy limits pod traffic but does not make a NodePort private by itself.

Sources:

- `my-values/infra/litellm-service.yaml`
- `my-values/nova-values.yaml`
- `my-values/infra/network-policies.yaml`
- `tests/verification/deployment/check-deployment-truth.mjs`

Next step: select the intended private access path and remove NodePorts that are no longer required.

### Runtime image references are not release-pinned consistently

Area: image supply chain
Priority: medium
Type: reproducibility risk

Deployment values use moving runtime image tags while image builds and base-image checks have separate pinning rules. A redeploy can therefore resolve a different runtime image without a values change.

Sources:

- `docker/Dockerfile.general`
- `docker/Dockerfile.sandbox`
- `.github/workflows/build-images.yaml`
- `my-values/nova-values.yaml`
- `my-values/buster-values.yaml`

Next step: choose one release versioning and digest-pinning policy for build outputs and deployed values.

## Adding An Issue

Add only an unresolved current defect, risk, decision, or verification gap. Include exact source paths, operational impact, and the smallest next action. Remove the entry when the issue is resolved; use Git history for completed implementation detail.
