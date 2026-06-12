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

## Local Registry Verification

Decision: local image verification has separate host-visible push and cluster-visible pull targets.

Reason: `registry-local` is internal to the cluster by default, so `./scripts/deploy.sh build-local-images [tag]` needs `LOCAL_REGISTRY_PUSH` while `./scripts/deploy.sh verify-live [tag]` needs `LOCAL_REGISTRY_PULL`.

Source proof: `scripts/deploy.sh` functions `cmd_build_local_images`, `verify_cluster_image_pull`, and `cmd_verify_live`; values files consume the rendered overrides during live verification.
