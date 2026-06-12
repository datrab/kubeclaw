# Security Decisions

Status: current
Audience: operator, maintainer

## Separate Sandbox Posture For Buster

Decision: Buster runs with sandbox-specific image, service account, RBAC, and privileged container settings.

Reason: Buster performs browser, container, Kubernetes, and destructive test work that the general Nova image does not perform.

Source proof: `my-values/buster-values.yaml` sets the Buster role values, `docker/Dockerfile.sandbox` defines the sandbox image, and `charts/kubeclaw/templates/deployment.yaml` renders Buster's privileged sandbox mounts and gateway/pipeline containers. `charts/kubeclaw/templates/rbac.yaml` and `charts/kubeclaw/templates/serviceaccount.yaml` render role-specific Kubernetes permissions and service accounts.

Verification:

```bash
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
```

Failure signal: deployment truth fails if Buster loses its sandbox storage mounts, gateway separation, conservative liveness budget, expected RBAC/service account shape, or required secret wiring.

## Custom Skills As Extension-Only

Decision: Helm `customSkills` cannot override protected core runtime paths.

Reason: The deployment init script rejects protected custom skill paths, and the ConfigMap template documents the extension-only boundary.

Source proof: `charts/kubeclaw/templates/configmap-skills.yaml` renders custom skill material, while `charts/kubeclaw/templates/deployment.yaml` contains the init-time copy/guard logic that keeps protected core paths from being replaced.

Verification: deployment truth checks the rendered init flow and protected runtime surfaces.

Failure signal: a custom skill path that can replace `skills/nova/`, `skills/buster/`, `skills/common/`, or packaged plugin/runtime files would be a security regression and should block the change.

## Secret Redaction And Runtime Persistence

Decision: runtime code redacts common secret keys from logs and subprocess environments, while deployment avoids writing literal runtime secrets into source ConfigMaps.

Reason: Redaction reduces accidental disclosure in runtime artifacts. Runtime-only overlays let Kubernetes Secret rotation feed the pod without making source ConfigMaps the secret store.

Current refinement: source config is seeded without literal runtime secrets, and pod startup renders secret-backed runtime config under `/runtime-config/openclaw.json`. Existing retained PVC config can still preserve older material, so operators should treat config PVCs as sensitive.

Source proof: `charts/kubeclaw/templates/configmap-gateway.yaml`, `charts/kubeclaw/templates/deployment.yaml`, `my-values/setup-secrets.sh`, `skills/common/pipeline/redaction.ts`, and `skills/common/pipeline/security.ts`.

Verification:

```bash
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
node --test tests/skills/common/pipeline/security.test.mjs tests/skills/common/pipeline/redaction.test.mjs
```

Failure signals:

- literal provider keys or Discord tokens appear in rendered source ConfigMaps
- gateway config on a retained PVC contains stale or unintended secret material
- log or subprocess output includes values for known secret-like keys

## NetworkPolicy Model

Decision: KubeClaw ships portable Kubernetes `NetworkPolicy` resources instead of CNI-specific FQDN policies.

Reason: `NetworkPolicy` works across common Kubernetes environments, while hostname-aware egress requires Cilium-style policy or an egress proxy that is not currently in this repo.

Source proof: `my-values/infra/network-policies.yaml` defines 13 policies and explicitly documents the FQDN limitation. `scripts/deploy.sh` applies the file during `infra` and removes it during destructive teardown.

Verification:

```bash
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
kubectl -n "$NAMESPACE" get networkpolicy
```

Open limit: live CNI enforcement is not proven by repository-only checks. The repo verifies policy presence and rendered intent, not packet-level behavior in a real cluster.
