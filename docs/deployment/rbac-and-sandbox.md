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

### Legacy Non-Broker Fallback

When broker mode is disabled, the chart still contains a legacy fallback ClusterRole that can create/delete namespaces and work with workload resources, including `pods/exec`. Do not treat that fallback as the production Buster RBAC model. Production values should keep `busterNamespaceBroker.enabled=true` so Buster uses lease-client RBAC and the namespace controller owns namespace lifecycle.

Buster sandbox mode renders privileged security context, unconfined AppArmor/seccomp, privilege escalation, and added capabilities. It mounts Podman storage and `/sandbox` `emptyDir` volumes.

Buster runtime code adds a separate default-deny suite capability boundary. Suites require capabilities such as `container_runtime`, `kubernetes_api`, `browser_automation`, `lighthouse`, or `static_web_server` depending on suite and serve config.

## Why Buster Is Different

Nova coordinates work and should not need Kubernetes write authority. Buster executes destructive verification, builds and runs containers, asks the broker for ephemeral test namespaces, and can run browser, performance, security, and Kubernetes suites. The deployment therefore gives Buster a privileged container posture and lease-scoped Kubernetes API permissions.

That authority is intentional for the current Buster role, but it is still a high-risk surface. The namespace fence constrains the controller's namespace create/delete authority, and Buster suite capabilities narrow which suite behaviors are allowed by task payload, but neither control is equivalent to full network isolation.

## Operator Checklist

- Deploy Buster only in a namespace and cluster profile where privileged Podman-in-Pod is acceptable.
- Apply `my-values/infra/buster-namespace-fence.yaml` before running Kubernetes suites.
- Confirm `agent-buster` has only lease-client RBAC in broker mode.
- Confirm `agent-buster-namespace-controller` is covered by the namespace fence.
- Review Buster task payload capabilities before enabling new suite classes.
- Treat Buster gateway and Discord command approval secrets as sensitive control-plane credentials.

## Open Issues

- The namespace fence does not constrain namespaced resource writes in existing namespaces.
- Buster combines privileged container execution with namespace-lease permissions in production values.
