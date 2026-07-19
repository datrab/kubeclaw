# RBAC and Sandbox

Status: current
Audience: operator, security reviewer

## Purpose

Document Buster's current Kubernetes and sandbox authority.

## Current Behavior

### Broker Mode Buster Agent RBAC

When `busterNamespaceBroker.enabled` is true, the chart renders `ServiceAccount/agent-buster` with a namespace-local lease-client Role. Buster can create and inspect `BusterNamespaceLease` objects in the release namespace, but it does not receive direct namespace create/delete permissions.

This is the production Buster path. In this mode the chart must not render the legacy broad `ClusterRole/agent-buster-k8s-tester`, and it must not grant `pods/exec` to the agent runtime.

### Namespace Controller RBAC

The separate `agent-buster-namespace-controller` ServiceAccount receives cluster-scoped authority to create/delete namespaces and to create the namespace-local resources required for a lease. The namespace controller also binds Buster only inside the leased namespace. Review this controller as the higher-authority Kubernetes component in broker-mode deployments.

The Buster namespace fence is a ValidatingAdmissionPolicy and binding. It denies direct namespace CREATE/DELETE operations by `system:serviceaccount:kubeclaw:agent-buster`, and it limits `system:serviceaccount:kubeclaw:agent-buster-namespace-controller` to labeled KubeClaw-managed namespaces beginning with `test-`.

### Broker Required For Kubernetes Suites

When broker mode is disabled, the chart does not render Kubernetes tester RBAC. Kubernetes suites must use `busterNamespaceBroker.enabled=true`, lease-client RBAC, and the namespace controller. Missing broker permissions should fail verification instead of silently falling back to broad namespace authority.

Buster splits the non-privileged OpenClaw gateway from a dedicated non-root pipeline sidecar. The gateway drops every Linux capability and cannot build images. The pipeline sidecar runs rootless BuildKit locally, stores only transient BuildKit state, and receives lease-client rather than cluster-wide workload authority.

Buster runtime code adds a separate default-deny suite capability boundary. Suites require capabilities such as `image_build`, `kubernetes`, `browser_automation`, or `lighthouse` depending on suite and serve config.

## Why Buster Is Different

Nova coordinates work and does not need Kubernetes write authority. Buster executes deterministic verification, builds images with rootless BuildKit, asks the broker for ephemeral test namespaces, and runs browser, performance, security, and Kubernetes suites. The deployment gives only the Buster pipeline sidecar lease-client Kubernetes permissions; workload authority is restricted to controller-issued namespaces.

That authority is intentional for the current Buster role, but it is still a high-risk surface. The namespace fence constrains the controller's namespace create/delete authority, and Buster suite capabilities narrow which suite behaviors are allowed by task payload, but neither control is equivalent to full network isolation.

## Operator Checklist

- Run `./scripts/deploy.sh buildkit-preflight` on every new node pool used by Buster.
- Run `./scripts/deploy.sh buster-buildkit-smoke` after deploying a new Buster pipeline image.
- Apply `my-values/infra/buster-namespace-fence.yaml` before running Kubernetes suites.
- Confirm `agent-buster` has only lease-client RBAC in broker mode.
- Confirm `agent-buster-namespace-controller` is covered by the namespace fence.
- Review Buster task payload capabilities before enabling new suite classes.
- Treat Buster gateway and Discord command approval secrets as sensitive control-plane credentials.

## Open Issues

- The namespace fence does not constrain namespaced resource writes in existing namespaces.
- Buster's pipeline sidecar uses rootless BuildKit with an unconfined BuildKit AppArmor/seccomp posture and setuid UID/GID mapping helpers, but it remains non-root and non-privileged.

## Rootless BuildKit Prerequisite

Image construction runs in the existing `buster-pipeline` container through rootless BuildKit. Kubernetes does not create the required Linux user namespace as a resource; the scheduled node must permit unprivileged user namespaces and the AppArmor/seccomp posture required by BuildKit's rootless OCI worker.

Verify the real node capability before deploying Buster:

```bash
./scripts/deploy.sh buildkit-preflight
```

The command creates a temporary non-privileged `moby/buildkit:rootless` pod, waits for its worker, verifies it with `buildctl debug workers`, and deletes it. It does not modify node configuration. If the probe fails, host bootstrap or Ansible owns any required `kernel.unprivileged_userns_clone`, `user.max_user_namespaces`, or AppArmor change; Helm must not silently mutate those host policies.

## Verification And Recovery

| Surface | Command | Expected result |
| --- | --- | --- |
| Rendered RBAC | `node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"` | Buster broker RBAC and sandbox posture match production values |
| Lease client authority | `kubectl -n "$NAMESPACE" auth can-i create busternamespaceleases --as system:serviceaccount:"$NAMESPACE":agent-buster` | allowed when broker mode is enabled |
| Namespace controller authority | `kubectl auth can-i create namespaces --as system:serviceaccount:"$NAMESPACE":agent-buster-namespace-controller` | allowed, with namespace-fence policy required for prefix restriction |
| Nova write authority | `kubectl -n "$NAMESPACE" auth can-i create pods --as system:serviceaccount:"$NAMESPACE":agent-nova` | should not be broadly allowed by the agent chart |
| Rootless image builder | `./scripts/deploy.sh buildkit-preflight` | temporary pod reaches Ready, reports an OCI worker, and is deleted |
| Production build path | `./scripts/deploy.sh buster-buildkit-smoke` | gateway tool invocation, image build/push, immutable-digest deployment, health check, and namespace cleanup all pass |

If Buster suites fail with Kubernetes authorization errors, identify whether the failing pod is `agent-buster` or `agent-buster-namespace-controller`. The first should only request leases and run workloads inside controller-issued namespaces; the controller-created namespace Role grants workload operations and pod port-forward only within that leased namespace. The controller owns test namespace creation/deletion. Preserve the failed task payload because capabilities and requested suite type decide which authority was expected.
