# Helm Chart

Status: current
Audience: operator, reference reader

## Purpose

Document the shared chart that renders KubeClaw agent releases.

## Current Behavior

The chart lives in `charts/kubeclaw`. It renders one agent per Helm release and uses values to decide whether the release behaves like Nova or Buster.

The chart templates own these surfaces:

- `configmap-gateway.yaml` renders `openclaw.json` and model/provider settings.
- `configmap-swarm-config.yaml` renders `swarm.config.json`, `.semgrep.yml`, and `eslint.config.mjs`.
- `configmap-workspace.yaml` renders optional workspace bootstrap files when workspace sync is enabled.
- `configmap-skills.yaml` renders optional `customSkills`, but runtime-protected skill paths are rejected by the init container.
- `configmap-podman-registries.yaml` renders the Buster Podman registry overlay only when sandbox registries are configured.
- `deployment.yaml` owns init sync, OpenClaw config migration, skills merge, main container env, probes, sandbox security context, and extra sidecars.
- `service.yaml`, `pvc.yaml`, `secret.yaml`, `serviceaccount.yaml`, and `rbac.yaml` own network, persistence, credentials, and optional Buster Kubernetes authority.

Rendered Nova resources from `my-values/nova-values.yaml`:

- `ConfigMap/agent-nova-config`
- `ConfigMap/agent-nova-swarm-config`
- `PersistentVolumeClaim/agent-nova-config`
- `PersistentVolumeClaim/agent-nova-workspace`
- `Service/agent-nova`
- `Deployment/agent-nova`

Rendered Buster resources from `my-values/buster-values.yaml`:

- `ServiceAccount/agent-buster`
- `ConfigMap/agent-buster-config`
- `ConfigMap/agent-buster-podman-registries`
- `ConfigMap/agent-buster-swarm-config`
- `PersistentVolumeClaim/agent-buster-config`
- `PersistentVolumeClaim/agent-buster-workspace`
- `ClusterRole/agent-buster-k8s-tester`
- `ClusterRoleBinding/agent-buster-k8s-tester`
- `Service/agent-buster`
- `Deployment/agent-buster`

Resource counts verified by `check-deployment-truth.mjs` and kubeconform:

- Nova: 6 rendered resources, all valid.
- Buster: 10 rendered resources, all valid.

Render commands:

```bash
helm template agent-nova charts/kubeclaw -n kubeclaw -f my-values/nova-values.yaml
helm template agent-buster charts/kubeclaw -n kubeclaw -f my-values/buster-values.yaml
```

The chart no longer exposes a current `processor.enabled` path. Deployment verification asserts that no legacy stream processor sidecar, processor ConfigMap, `.Values.processor`, or `processor:` values remain.

The rendered services include gateway and bridge ports for each agent. Nova adds `prism-preview` as an extra service port from production values. Buster adds the Podman registries ConfigMap and sandbox volumes because `sandbox.enabled` is true.
