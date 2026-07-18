# Deployment Decisions

Status: current
Audience: operator, maintainer

## Shared Helm chart

Decision: Nova and Buster use one chart with role-specific values.

Reason: The chart renders common ConfigMaps, PVCs, services, deployments, and optional RBAC while values decide image, command, ports, sandboxing, service account, and sidecars.

Source proof: `charts/kubeclaw/templates/deployment.yaml`, `charts/kubeclaw/templates/service.yaml`, `charts/kubeclaw/templates/pvc.yaml`, `charts/kubeclaw/templates/rbac.yaml`, `my-values/nova-values.yaml`, and `my-values/buster-values.yaml`.

Verification:

```bash
helm template kubeclaw charts/kubeclaw -f my-values/nova-values.yaml
helm template kubeclaw charts/kubeclaw -f my-values/buster-values.yaml
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
```

## NodePort exposure

Decision: Production values expose gateway and supporting services through NodePorts where configured.

Reason: Current values set NodePorts for Nova, Buster, LiteLLM, registry-local, and Nova's Prism preview sidecar. This is documented as current behavior and tracked as a risk in `../open-issues.md`.

Current refinement: the rendered Nova and Buster gateway Services stay `ClusterIP`; Nova's Prism preview is exposed by an extra NodePort Service on `30456`, and LiteLLM uses NodePort `30050` in `my-values/infra/litellm-deployment.yaml`. Registry exposure is handled by registry infra manifests, not the agent chart.

Failure signal: any new unexpected NodePort should fail the structured exposure assertions in `tests/verification/deployment/check-deployment-truth.mjs`.

## Legacy processor removal

Decision: The former processor deployment surface is not part of current rendered manifests.

Reason: Deployment verification asserts that no stream-processor sidecar, processor ConfigMap, `.Values.processor`, or production `processor:` values remain.

## Secret-Free Persistent Config

Decision: retained config PVCs store source config without literal runtime secrets; pods render current secrets into `emptyDir` runtime config at startup.

Reason: persistent config survives rollouts, so it must not become a stale secret store. Runtime-only overlays let Kubernetes Secret rotation feed the pod without writing live tokens into the retained PVC source.

Source proof: `charts/kubeclaw/templates/configmap-gateway.yaml`, `charts/kubeclaw/templates/configmap-swarm-config.yaml`, and the init container in `charts/kubeclaw/templates/deployment.yaml`.

Verification: deployment truth includes "Rendered init flow keeps persistent config secret-free and renders secrets only into runtime config".

## Deploy Mode Split

Decision: the operator deploy surface should split runtime image deploys from code-bundle deploys, and local deploy must not build images.

Reason: normal redeploy speed matters more than keeping a local image-build verification loop in the operator path. `scripts/deploy.sh image [target]` now refreshes mutable runtime tags through rollout restart, while `scripts/deploy.sh code [target]` updates explicit bundle inputs and waits for the Helm-driven rollout. Omitting the code target deploys all agents by default, matching the `agents` command shape.

Source proof: `scripts/deploy.sh` functions `deploy_agent`, `cmd_image`, `cmd_code`, `restart_agent_deployment`, and `wait_for_agent_rollout`.

## Agent Code Bundle Storage

Decision: the Nova and Buster code-only deploy path uses GitHub release assets as the durable bundle store, with one predictable asset per agent per commit SHA under the `agent-code-bundles` release tag.

Reason: the current pod loader consumes plain archive URLs, and the runtime contract must preserve the existing `/app/skills` surface. GitHub release assets are the simplest durable GitHub-native distribution path that fits the current fetch model without adding OCI pull tooling inside the pod.

Current contract:

- Nova bundle = final `/app/skills` tree built from `skills/nova` then `skills/common`
- Buster bundle = final `/app/skills` tree built from `skills/buster` then `skills/common`
- `scripts/deploy.sh code` derives the GitHub release URL from repository + commit by default
- explicit bundle URLs still override the derived path when needed
