# Plan and Install

Status: source-backed deployment path; current runtime selection is absent, so a new runtime installation must stop before mutation
Audience: Kubernetes platform operator, security operator
Owner: platform operations
Evidence: scripts/deploy.sh; docs/generated/inventory/deploy-script.json
Applies to: current selected runtime release
Last verified: 2026-10-11; local extracted-command and release-boundary checks only; no live cluster result is available

## Objective

Prepare one KubeClaw environment without hiding a missing platform dependency.
Finish with ready workloads, smoke results, and an independent recovery route.

This procedure does not install a host, K3s, a storage driver, or a
[CNI (Container Networking Interface)](https://www.cni.dev/docs/) implementation.
CNI defines how the container runtime calls network plugins to connect containers.
It starts with an existing Kubernetes cluster.

## Canonical Install and Preflight Procedure
<!-- operator-task: install-preflight -->

This page is the sole authority for `install-preflight`. Run it from the
administration machine with one dedicated absolute `<kubeconfig-path>` bound to
one exact `<context>`. The supported start state is an existing Kubernetes
cluster with independently recoverable API and host access. `scripts/deploy.sh`,
the selected release receipts, Helm values, and the named cluster/storage
authorities are the implementation and configuration sources.

Before any cluster mutation, complete [Planning Record](#planning-record),
[Supported Versions](#supported-versions), the
[reviewed release checkout](maintenance.md#acquire-a-reviewed-runtime-selection),
[Bind Cluster Authority](#bind-cluster-authority),
[Select Configuration](#select-configuration), the read-only
[Prerequisites](#prerequisites), [Preflight Without Mutation](#preflight-without-mutation),
[Check authority for the selected scope](#check-authority-for-the-selected-scope),
and [Prepare Independent Access](#prepare-independent-access), in that order.
Before the first mutation, also complete the linked Worker Trust
[receipt-authority preparation](worker-trust.md#prepare-the-production-receipt-authority)
and [live-execution boundary check](worker-trust.md#3-check-the-live-execution-boundary).
The current verifier does not provide the durable-request and resource-identity
evidence required for safe reconciliation and cleanup. If the intended result
is a completed installation or operational approval, stop before the disposable
probe even with Prism selected. Keep the read-only plan and wait for the owning
operators to resolve that boundary; do not deploy first and discover it later.
Every source, release-selection, render, access, and read-only dependency gate
must pass. An absent runtime selection stops this installation here, including
the disposable probe. Only then run [Prove DNS and disposable storage](#prove-dns-and-disposable-storage).
That probe is the first controlled cluster mutation. It creates only the exact
disposable resources declared there. After its cleanup succeeds, use
[Install in Dependency Order](#install-in-dependency-order). Stop and retain
the exact failed command before correcting an input. Do not continue with a
partial dependency set.

Final proof requires the selected release identity, four readiness levels from
the [canonical readiness procedure](operate.md#canonical-start-readiness-and-observation-procedure),
functional smoke results, an independent administration check, cleanup of any
approved probes, and the evidence listed at the end of this page.
Select Prism before mutation and read the [profile and trust boundary](#select-prism-and-check-the-trust-boundary).
The implemented live trust exercise requires Prism. A selection without Prism
cannot currently complete that final proof.

## Supported Topology and Limits

The repository deploys one application namespace plus separate identity namespaces.
It can also deploy a separate Ops Pod namespace.

The default application namespace is `kubeclaw`.
SPIRE uses `spire-server` and `spire-system`.
The default Ops Pod namespace is `kubeclaw-ops`.

The deployment path can install these components:

- SPIRE and its [CSI (Container Storage Interface)](https://kubernetes.io/docs/concepts/storage/volumes/#csi) driver. CSI defines how Kubernetes uses external volume drivers; SPIRE uses its driver to deliver the workload-identity socket to Pods.
- Redis, PostgreSQL, and LiteLLM.
- Nova and Buster role deployments.
- Prism and its PostgreSQL, Control, Studio, Worker, and agent workloads.
- The Tailscale operator for the complete showcase baseline.

The deployment path does not establish these platform services:

- Host operating system and K3s installation.
- CNI installation or a CNI migration.
- StorageClass creation and external backup storage.
- An [OCI (Open Container Initiative)](https://opencontainers.org/about/overview/) registry or BuildKit client configuration for production use. OCI defines container image and distribution formats; the registry stores and serves those images.
- Argo CD ownership transfer for existing Helm resources.
- Independent host, KVM, or SSH administration.

Stop if the environment depends on an item in the second list and no operator owns it.

| Platform layer | Repository role | Required operator proof |
| --- | --- | --- |
| Host and K3s | Existing prerequisite | Independent login, API recovery, version, and restart procedure |
| CNI | Existing cluster dependency; Flannel and Cilium are separate architecture choices | Selected implementation, DNS, policy enforcement, and rollback path |
| Argo CD | Optional deployment owner | Repository access, tracking mode, revision, health, and exclusive ownership |
| Storage | Existing StorageClass and CSI | Binding, reclaim behavior, capacity, snapshot or backup, and restore |
| Redis and PostgreSQL | Required showcase data services | Authentication, TLS where selected, persistence, capacity, backup, migration, and restore |
| Registry, mirror, and BuildKit | Required showcase services | Authenticated push, uncached pull, cache behavior, storage, isolation, and garbage collection |
| DNS and Tailscale | Required showcase access and exposure layers | Positive and negative identity checks plus independent recovery |
| Monitoring | Optional platform evidence layer | Metric retention, log delivery, dashboard access, capacity, and recovery |
| SPIRE | Required showcase workload-identity service | Server persistence, agents, CSI, [SVID](../reference/glossary.md#svid) issuance, and expiry ownership |

An SVID (SPIFFE Verifiable Identity Document) is a workload credential. On these
deployed paths, it is a short-lived X.509 certificate that contains the workload's
SPIFFE identity. Successful identity verification does not grant application
permission; the receiving application's allowlist must also permit that identity.

Use the [GitOps operation](maintenance.md#gitops-operation) when Argo owns deployment.
Use [Registry and BuildKit maintenance](maintenance.md#registry-and-buildkit-maintenance) for client preparation.

Helm and Argo must not manage the same resource at the same time.
Complete an explicit ownership transfer before enabling reconciliation.

> **Source evidence — deployment ownership**
>
> **Claim:** `setup` owns application namespace creation, Helm repository preparation, and optional Secret preparation. `infra` owns the ordered identity and stateful-service deployment.
>
> **Implementation:** [`cmd_setup()` creates the namespace and prepares chart repositories](https://github.com/datrab/kubeclaw/blob/2a8558d795054d25aa4b72dbdc296c9321ba38f6/scripts/deploy.sh#L878-L903).
> It then [selects the configured Secret setup](https://github.com/datrab/kubeclaw/blob/2a8558d795054d25aa4b72dbdc296c9321ba38f6/scripts/deploy.sh#L921-L947).
> [`cmd_infra()` runs the stateful preflight and installs SPIRE](https://github.com/datrab/kubeclaw/blob/2a8558d795054d25aa4b72dbdc296c9321ba38f6/scripts/deploy.sh#L1101-L1140).
> It next [installs the selected Redis and PostgreSQL services](https://github.com/datrab/kubeclaw/blob/2a8558d795054d25aa4b72dbdc296c9321ba38f6/scripts/deploy.sh#L1143-L1160) and [the optional LiteLLM service](https://github.com/datrab/kubeclaw/blob/2a8558d795054d25aa4b72dbdc296c9321ba38f6/scripts/deploy.sh#L1166-L1185).
>
> **Contract or setting:** [Deployment variables select the namespace, optional components, Secret mode, and partial-infrastructure behavior](https://github.com/datrab/kubeclaw/blob/2a8558d795054d25aa4b72dbdc296c9321ba38f6/scripts/deploy.sh#L37-L64).
>
> **Test evidence:** [The deployment truth check reads the deploy script and checks immutable-image and network-policy safety](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/deployment/check-deployment-truth.mjs#L41-L69). The check passed on 2026-09-16. It does not represent a cluster deployment.
>
> **Revision:** Deployment source checked at `2a8558d795054d25aa4b72dbdc296c9321ba38f6`; unchanged test and release sources at `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`.
>
> **Limit:** These commands do not install or prove the host, K3s, CNI, durable storage, or independent external access.

## Execution Locations

Use two separate administration locations.

| Location | Purpose | Required access |
| --- | --- | --- |
| Existing administration machine | First install, cluster recovery, and lockout recovery | Repository, `kubectl`, `helm`, Node.js, npm, Go for source checks, and cluster bootstrap rights |
| Ops Pod | Routine observation and reviewed Git changes | Running cluster, its PVCs, and configured observer rights |

The Ops Pod is not an independent recovery path.
It depends on cluster scheduling, networking, DNS, storage, and the API.

Keep the existing host or KVM path before installation.
[Independent recovery outside the Ops Pod](../status/open-issues.md#independent-recovery-outside-the-ops-pod-is-unproved) tracks the missing proof.

## Planning Record

Create an operator record before any mutation.
Record these values:

| Subject | Record |
| --- | --- |
| Source | Full repository commit and clean-worktree result |
| Release | Runtime selection file and every selected image digest |
| Cluster | Absolute dedicated kubeconfig path, exact context, independently supplied API server and `kube-system` namespace UID, Kubernetes version, nodes, and CNI |
| Storage | StorageClass, binding mode, reclaim policy, free capacity, and backup destination |
| Network | Cluster DNS, service ranges, egress route, Tailnet owner, and recovery route |
| Identity | Cluster administrator, SPIRE owner, service-account owner, and emergency credential owner |
| Trust verification | Approved isolated target, data/agent owner, resource cleanup owner, and the live verifier's retained-identity and cleanup procedure |
| Production receipts | Production-operator signing owner, external private-key path, fixed trusted-public-key installation, independently approved fingerprint, and key qualification result |
| Data | Existing PVCs, databases, queues, journals, artifacts, and their owners |
| Change | Maintenance window, rollback owner, evidence directory, and stop decision owner |

Do not invent capacity values.
[Combined node and disk capacity](../status/open-issues.md#combined-node-and-disk-capacity-is-not-fully-budgeted-and-measured) tracks the missing proof.

## Supported Versions

Use the [shared version rules](README.md#version-and-tool-boundary).
This procedure has no accepted Kubernetes or K3s compatibility range.
Record the actual server, kubectl, and Helm versions and obtain platform-owner acceptance before the first mutation.
Use only the selected runtime receipt and generated values for workload images.

## Bind Cluster Authority

`scripts/deploy.sh` invokes `kubectl` and Helm without a context argument. The
script therefore inherits `KUBECONFIG` and its current context; its command
interface has no context flag
([command interface](https://github.com/datrab/kubeclaw/blob/2a8558d795054d25aa4b72dbdc296c9321ba38f6/scripts/deploy.sh#L7-L35);
[raw cluster clients in setup](https://github.com/datrab/kubeclaw/blob/2a8558d795054d25aa4b72dbdc296c9321ba38f6/scripts/deploy.sh#L878-L903)).
Do not rely on the user's default kubeconfig or on printing its current context.

Obtain the following values from the platform authority through a channel
independent of the kubeconfig being tested: a dedicated kubeconfig file, its
exact context name, the expected API server URL, the existing
`kube-system` namespace UID, and the application and Prism namespace names. Start a new restricted shell in
`<repository-root>`, replace every placeholder, and keep that same shell for
the entire procedure:

```bash
set -euo pipefail
umask 077
export KUBECONFIG="<kubeconfig-path>"
export EXPECTED_CONTEXT="<context>"
export EXPECTED_CLUSTER_SERVER="<cluster-server>"
export EXPECTED_KUBE_SYSTEM_UID="<kube-system-uid>"
export NAMESPACE="<namespace>"
export PRISM_NAMESPACE="<prism-namespace>"
for target_namespace in "$NAMESPACE" "$PRISM_NAMESPACE"; do
  test "${#target_namespace}" -le 63
  [[ $target_namespace =~ ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ ]] || exit 1
done
case "$KUBECONFIG" in /*) ;; *) printf '%s\n' 'KUBECONFIG must be absolute' >&2; exit 1 ;; esac
test -f "$KUBECONFIG" && test ! -L "$KUBECONFIG"
chmod 600 -- "$KUBECONFIG"
kubectl config use-context "$EXPECTED_CONTEXT" >/dev/null
chmod 400 -- "$KUBECONFIG"

assert_cluster_binding() {
  test "$(kubectl config current-context)" = "$EXPECTED_CONTEXT" &&
  test "$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}')" = "$EXPECTED_CLUSTER_SERVER" &&
  test "$(kubectl get namespace kube-system -o jsonpath='{.metadata.uid}')" = "$EXPECTED_KUBE_SYSTEM_UID"
}
bound_kubectl() {
  assert_cluster_binding || { printf '%s\n' 'CLUSTER_BINDING_MISMATCH' >&2; return 1; }
  env KUBECONFIG="$KUBECONFIG" kubectl "$@"
}
bound_helm() {
  assert_cluster_binding || { printf '%s\n' 'CLUSTER_BINDING_MISMATCH' >&2; return 1; }
  env KUBECONFIG="$KUBECONFIG" helm "$@"
}
bound_deploy() {
  assert_cluster_binding || { printf '%s\n' 'CLUSTER_BINDING_MISMATCH' >&2; return 1; }
  env KUBECONFIG="$KUBECONFIG" NAMESPACE="$NAMESPACE" PRISM_NAMESPACE="$PRISM_NAMESPACE" ./scripts/deploy.sh "$@"
}
readonly KUBECONFIG EXPECTED_CONTEXT EXPECTED_CLUSTER_SERVER EXPECTED_KUBE_SYSTEM_UID NAMESPACE PRISM_NAMESPACE
assert_cluster_binding
printf 'context=%s\nserver=%s\nkube-system-uid=%s\nnamespace=%s\nprism-namespace=%s\n' \
  "$EXPECTED_CONTEXT" "$EXPECTED_CLUSTER_SERVER" "$EXPECTED_KUBE_SYSTEM_UID" "$NAMESPACE" "$PRISM_NAMESPACE"
```

Expected observation: `use-context` succeeds, the assertion exits zero, and
the five printed values exactly match the independently supplied record.
`<namespace>` is the application namespace; `<prism-namespace>` is the Prism
namespace. Use the same name for both when Prism shares the application
namespace. Both must be Kubernetes namespace names: 1 to 63 lowercase letters,
digits, or hyphens, starting and ending with a letter or digit. The exported
read-only values bind raw script clients as well as the wrappers.
The script otherwise [defaults `NAMESPACE` to `kubeclaw` and `PRISM_NAMESPACE`
to `NAMESPACE`](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/scripts/deploy.sh#L81-L98).
From this point onward, use only `bound_kubectl`, `bound_helm`, and
`bound_deploy` from this shell for every cluster read or mutation on this page.
The read-only kubeconfig prevents an accidental context rewrite after binding.

Stop on an absent or symbolic-link kubeconfig, unknown context, server
mismatch, UID mismatch, certificate or authentication failure, or
`CLUSTER_BINDING_MISMATCH`. Do not repair the user's default kubeconfig and do
not retry a mutating command. Obtain or repair the dedicated file through the
platform authority, independently confirm the expected server and UID, rerun
this entire section in a new shell, and then restart preflight. If a mutation
had already begun, preserve its output and inspect only the recorded target
before selecting recovery or rollback.

## Prerequisites

Run these read-only checks from `<repository-root>` on the administration machine:

```bash
assert_cluster_binding
git status --short
git rev-parse HEAD
node --version
npm --version
helm version
bound_kubectl version
bound_kubectl get nodes -o wide
bound_kubectl get storageclass
bound_kubectl cluster-info
bound_kubectl -n kube-system get pods
bound_kubectl -n kube-system get service kube-dns --ignore-not-found
bound_kubectl -n kube-system get endpointslice -l k8s-app=kube-dns
```

Expected observations:

- The worktree has no unreviewed change.
- The checkout commit equals the accepted `<selection-commit>` from
  [release acquisition](maintenance.md#obtain-and-verify-the-selected-checkout),
  or its explicitly approved documentation-only successor. Receipt source
  commits remain separately recorded and checked.
- Every required node reports `Ready`.
- The selected StorageClass and its owned provisioner exist.
- The API responds through the intended context; the DNS Service has ready
  endpoints. This does not yet prove a Pod can resolve a name.
- Every required authorization check prints `yes`.

Stop for any unexpected context, missing node, unknown StorageClass, missing
DNS endpoint or unowned existing data. The complete scope and ownership
checks follow; these initial observations do not yet authorize mutation.

## Select Configuration

Repository values are examples and public defaults.
Private operator values must use separate files.

Use these references before editing values:

- [Environment Variables](../reference/environment-variables.md).
- [Helm Values](../reference/helm-values.md).
- [Secrets](../reference/secrets.md).
- [Version Authorities](maintenance.md#version-authorities).

The effective order for runtime role values is:

1. Chart defaults.
2. Source-bound generated release values.
3. Private operator overlay.
4. Supported command overrides.

The release materializer reads the role-specific `my-values` file and binds its
images and code bundle to the selected release before it writes the generated
values. That repository file is therefore an input to step 2. The deploy script
does not apply it again as a separate override.
[Release value construction](https://github.com/datrab/kubeclaw/blob/f0995c544af41dcd5de5990820bc2c4e97bdafe3/scripts/updates/materialize-release.mjs#L23-L40)
and [the deploy script's values order](https://github.com/datrab/kubeclaw/blob/f0995c544af41dcd5de5990820bc2c4e97bdafe3/scripts/deploy.sh#L1409-L1417)
define these stages.

Do not select a different image in a private overlay.
Image identity belongs to the reviewed release receipt.

### Select Prism and check the trust boundary

`KUBECLAW_DEPLOY_PRISM` selects whether the deploy script includes Prism.
Unset or empty selects the default `true`. The script accepts `true`, `1`,
`yes`, `on`, and `enabled`, or `false`, `0`, `no`, `off`, and `disabled`,
without regard to letter case. Other nonempty values do not enable Prism and
are not validated as errors. Use exactly `true` or `false` here to avoid that
ambiguity. `<prism-selection>` is your reviewed choice:

```bash
export KUBECLAW_DEPLOY_PRISM="<prism-selection>"
case "$KUBECLAW_DEPLOY_PRISM" in true|false) ;; *) exit 1 ;; esac
readonly KUBECLAW_DEPLOY_PRISM
printf 'prism-selection=%s\n' "$KUBECLAW_DEPLOY_PRISM"
```

Record that value with the selected release and render digests. Keep it for
render, setup, deployment, status, and smoke. To change it, start a new bound
shell and repeat the read-only planning and preflight checks.

| Selection | Implemented deployment behavior | Final trust proof |
| --- | --- | --- |
| `true` | Render and install Prism as well as Nova and Buster; include its selected namespace, Secrets, storage, and health checks. | Follow the complete [Worker Trust procedure](worker-trust.md#canonical-worker-trust-procedure), whose start state requires Nova, Buster, and Prism. |
| `false` | Render and install Nova and Buster; skip Prism installation and its separate namespace creation. This does not uninstall an existing Prism release. | The current live verifier has no route for this selection. Component smoke and source checks cannot replace positive and negative live trust proof. |

For a selection without Prism, the exact blocked step is
[Prove Worker Trust](#6-prove-worker-trust). Before the disposable probe or any
namespace, Secret, or workload mutation, stop if the intended result requires
a completed installation or operational release approval. Keep the reviewed
configuration and read-only evidence. Platform operations and the
workload-identity owner must resolve this boundary. They can select the complete
profile through a new reviewed plan, or maintain a verifier for the reduced
profile. Do not enable Prism only to obtain a test result, disable trust,
broaden allowlists, or admit work with an unverified trust boundary.

This is a verification limit, not a prohibition on the implemented reduced
deployment choice. An explicitly approved isolated deployment can follow the
selected deployment steps, but must remain recorded as incomplete and must not
receive operational work. To remove the limit, the owners must provide a
maintained reduced-profile procedure and verifier that name the selected
identities and paths, prove authorized access and paired denials (including
plaintext, wrong SVID, and forged forwarded identity), verify source signing
where used, and verify test-resource cleanup. Retain an actual successful live
result for the exact release and cluster before declaring that installation
complete. No such reduced-profile result is established here.

> **Source evidence — Prism selection and live verification**
>
> **Claim:** Prism can be omitted from deployment, but the current live verifier requires its Control and Worker deployments.
>
> **Implementation:** [The default selection](https://github.com/datrab/kubeclaw/blob/d68da902c174574d1186ffd4a3ff29e95b63474e/scripts/deploy.sh#L96-L98), [accepted boolean spellings](https://github.com/datrab/kubeclaw/blob/d68da902c174574d1186ffd4a3ff29e95b63474e/scripts/deploy.sh#L964-L972), and [the Prism function's early return](https://github.com/datrab/kubeclaw/blob/d68da902c174574d1186ffd4a3ff29e95b63474e/scripts/deploy.sh#L1684-L1687) control selection. Even an explicit `render prism` calls that guarded function. [The `all` and `status` branches also condition Prism work](https://github.com/datrab/kubeclaw/blob/d68da902c174574d1186ffd4a3ff29e95b63474e/scripts/deploy.sh#L2965-L2987).
>
> **Contract or setting:** `KUBECLAW_DEPLOY_PRISM` is exported in the bound shell; the [live verifier always waits for and inspects all four deployments](https://github.com/datrab/kubeclaw/blob/d68da902c174574d1186ffd4a3ff29e95b63474e/tests/verification/live/worker-trust-cluster-e2e.sh#L69-L84).
>
> **Test evidence:** [The live verifier declares its positive and negative paths](https://github.com/datrab/kubeclaw/blob/d68da902c174574d1186ffd4a3ff29e95b63474e/tests/verification/live/worker-trust-cluster-e2e.sh#L190-L199). No live result for either selection is established here.
>
> **Revision:** `d68da902c174574d1186ffd4a3ff29e95b63474e`.
>
> **Limit:** Source inspection establishes selection and the verifier's prerequisites; it does not establish live trust or a reduced-profile verifier.

The application and Prism namespaces are already exported and read-only in
the bound shell. Inspect those exact targets without changing either value:

```bash
assert_cluster_binding
bound_kubectl get namespace "$NAMESPACE" --ignore-not-found
bound_kubectl get namespace "$PRISM_NAMESPACE" --ignore-not-found
```

The last command may return no namespace before the first setup.
It must not return an unexpected environment with the same name.

## Preflight Without Mutation

Complete [production-receipt authority preparation](worker-trust.md#prepare-the-production-receipt-authority)
on this administration machine, and identify the current
[live-execution boundary](worker-trust.md#3-check-the-live-execution-boundary).
Missing or unqualified signing authority forbids the first probe or workload
mutation. A qualified keypair does not remove the verifier's lifecycle limit.

This section makes no cluster change. First complete the canonical
[Locked Dependency Installation](quickstart.md#locked-dependency-installation)
in this disposable checkout. Install Go and make `go` available on `PATH`;
the configuration inventory uses it to inspect Go producers. The repository
does not declare an accepted Go version range. Record the observed version before
running the source checks:

```bash
command -v go
go version
npm run versions:check
npm run docs:check:generated
npm run verify:prism:deploy-script
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
```

On 2026-10-09, `npm run verify:prism:deploy-script` passed at revision `e3fa70c3fe3a1a4a32af503201a19e0b5df14c61` with Node.js `v24.21.0`.
It checks workflow YAML, the deployment contract, and deployment-script syntax.
This local result does not establish successful cluster deployment.
Run every source check above for your selected checkout and stop on a nonzero exit.

Render each selected role before mutation:

```bash
bound_deploy render nova
bound_deploy render buster
if [[ $KUBECLAW_DEPLOY_PRISM == true ]]; then
  bound_deploy render prism
fi
```

Runtime rendering requires `releases/runtime-images.json` and its generated values.
The current source revision does not contain that runtime selection.

If the selection is absent, stop before any cluster mutation, including the
DNS and storage probe, namespace creation, and Secret setup.
Complete [release acquisition](maintenance.md#acquire-a-reviewed-runtime-selection)
and resume from its accepted clean selection checkout. That task names the
workflow inputs, receipt checks, permissions, PR/merge boundary and local checks.
Never invent the file or substitute mutable image tags.

Treat rendered output as sensitive configuration.
Review images, Secrets, service accounts, PVCs, ports, and network policies.

Complete [client preparation](maintenance.md#prepare-the-client-projections)
from the reviewed Buster render. If a new node configuration is required, the
platform owner must supply its installation, cold-pull, and rollback procedure
before this installation can proceed. Complete
[Check authority for the selected scope](#check-authority-for-the-selected-scope)
against the exact rendered configuration before the first probe mutation. Local projection generation does not
prove node readiness.

Stop if the selected release is absent, client preparation or node prerequisites
are incomplete, or the render changes an unowned resource.

## Check authority for the selected scope

Authorization means that the API permits this identity to perform a verb on a
resource in a scope. A namespaced grant applies to one namespace; a
cluster-scoped grant applies to resources such as namespaces or PVs. A PV
(PersistentVolume) represents the storage backing a PVC (PersistentVolumeClaim,
which requests that storage). Permission in the application namespace does not
establish permission in the probe, Prism, SPIRE or Tailscale namespaces.
[`auth can-i` checks the particular verb, resource and scope](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_auth/kubectl_auth_can-i/).
It does not prove admission, quota, node capacity or provider permission.

Before the first namespace creation, the platform/security owner must approve
an authorization plan for the exact selected release and private overlays.
Use the following inventory to prepare it. Include every selected rendered
kind, Helm hook and optional branch; remove a row only when its operation is
not selected and record that reason. Inspect the role renders below, the
selected infrastructure chart install **and** upgrade renders, and the
`infra` manifests before approving it. The chart staging and offline render
[check both installation and upgrade before deployment](https://github.com/datrab/kubeclaw/blob/b6e4a0d774434b8c39b2575322436e3fba708914/scripts/infrastructure-release.mjs#L32-L44).
SPIRE chart versions and values, application and Prism names, Secret source
namespace, Tailscale namespace and native-node policy must match the plan.
Never use an unreviewed default namespace to fill a missing plan entry.

| Operation | Resources and verbs to include | Scope |
| --- | --- | --- |
| Initial discovery and binding | `get` named namespaces, nodes, DNS Service, StorageClass and Argo CRD; `list` nodes, StorageClasses, kube-system Pods and DNS EndpointSlices | Cluster; `kube-system` for DNS/Pods |
| Disposable probe | Namespace `create`, named `get`, `delete`, `list`, `watch`; Pod and PVC `get`, `list`, `watch`, `create`, `patch` for apply; event `list`; Pod log `get`; named StorageClass/PV `get`, PV `list`/`watch` for observation | Exact future probe namespace; namespaces/StorageClass/PVs are cluster-scoped |
| Namespace and Secret setup | Namespace `get`, `create`, `patch`; Secret `get`, `list`, `create`, `patch` including key checks/copy | Application, separately selected Prism and Tailscale namespaces; source Secret `get` in `SRC_NS` (default `default`) when copy is selected |
| Helm release storage, waits and atomic cleanup | Secret `get`, `list`, `create`, `update`, `patch`, `delete`; workload/Pod/Job `get`, `list`, `watch`; `get`, `create`, `update`, `patch`, `delete` for each selected chart resource and hook | Every selected release namespace; cluster scope for cluster-scoped chart resources |
| Selected chart/manifests | Deployments, StatefulSets, DaemonSets, ReplicaSets, Jobs, CronJobs, Pods, Services, ConfigMaps, Secrets, ServiceAccounts, PVCs, Ingresses, NetworkPolicies, CiliumNetworkPolicies, PodDisruptionBudgets and Roles/RoleBindings as actually rendered | Their rendered namespaces; includes `spire-server`, `spire-system` and selected Tailscale namespace |
| Identity, broker and admission resources | Selected ClusterRoles/ClusterRoleBindings, CRDs, CSIDrivers, IngressClasses, ValidatingAdmissionPolicies/Bindings, webhook configurations and SPIRE custom resources; each rendered object's apply/Helm verbs | Actual cluster or namespaced scope from the rendered kind; RBAC `bind`/`escalate` or equivalent existing grants must authorize the selected role contents |
| Imperative ownership guards | Named Argo CRD `get`; Application `list` across **all namespaces** if that CRD exists; Deployment, StatefulSet and CronJob `list` in every target runtime namespace, even when the Argo CRD is absent | Cluster discovery; application and Prism namespaces |
| Reconciliation, rollout and smoke | Deployment/Service `get`, Deployment `patch` for selected reconciliations/restart; Pod `get`/`list`/`watch`, Pod log `get`, Pod exec `create`; Job/StatefulSet/CronJob observations and selected hook resources | Application and Prism namespaces |
| Native-worker host preflight | Named Node `get`, node `proxy` subresource `get` for kubelet `configz`, plus separately owned host/pool files and independent node access | Selected native node, not a Pod in the administration namespace |
| Provider disposition | Read-only backing-volume lookup and provisioner reconciliation/cancellation authority | Selected storage provider account, granted by its owner outside Kubernetes RBAC |

The [actual Secret setup reads/copies from its selected source](https://github.com/datrab/kubeclaw/blob/b6e4a0d774434b8c39b2575322436e3fba708914/my-values/setup-secrets.sh#L313-L339),
[infra applies SPIRE namespace policies before its chart installs](https://github.com/datrab/kubeclaw/blob/b6e4a0d774434b8c39b2575322436e3fba708914/scripts/deploy.sh#L1120-L1135),
and [native preflight reads the Node and kubelet](https://github.com/datrab/kubeclaw/blob/b6e4a0d774434b8c39b2575322436e3fba708914/scripts/native-worker-node-preflight.mjs#L26-L52)
explain why those authorities are separate. Verify custom-resource availability
and the selected platform owner's RBAC/admission decision before proceeding.
A CRD that will be installed later is not proof that today's identity can create
its instances. Do not install a CRD or grant permission as part of this check.

Choose the future probe name now. Define `<authorization-plan-file>` as a
private, reviewed UTF-8 file outside Git, with one space-separated row
`VERB RESOURCE SCOPE` per permitted operation from the table. `RESOURCE` is
Kubernetes' plural API resource name, optionally qualified by its API group,
or `resource/name` for a named check. Subresources use `pods/log`, `pods/exec`
or `nodes/proxy`. `SCOPE` is an exact namespace, `cluster`, or `all-namespaces`.
Include distinct rows for distinct verbs; no wildcard grants or blank rows.
The owner must confirm its completeness against the selected manifests and
script branches before providing it. Record the owner, plan digest, selected
render digests and provider observation procedure in the planning record.
If that inventory or any prerequisite authority is unavailable, stop here.

```bash
export PREFLIGHT_NAMESPACE="kubeclaw-preflight-<unique-id>"
export PREFLIGHT_AUTHORIZATION_PLAN="<authorization-plan-file>"
test "${#PREFLIGHT_NAMESPACE}" -le 63
[[ $PREFLIGHT_NAMESPACE =~ ^kubeclaw-preflight-[a-z0-9]([-a-z0-9]*[a-z0-9])?$ ]] || exit 1
test -f "$PREFLIGHT_AUTHORIZATION_PLAN" && test -s "$PREFLIGHT_AUTHORIZATION_PLAN" &&
  test ! -L "$PREFLIGHT_AUTHORIZATION_PLAN" || exit 1
require_authority() {
  local verb="$1" resource="$2" scope="$3" result
  local subresource_flags=()
  case "$resource" in
    pods/log|pods/exec|nodes/proxy)
      subresource_flags=(--subresource="${resource#*/}"); resource="${resource%/*}" ;;
  esac
  case "$scope" in
    cluster) result="$(bound_kubectl auth can-i "$verb" "$resource" "${subresource_flags[@]}")" || return 1 ;;
    all-namespaces) result="$(bound_kubectl auth can-i "$verb" "$resource" "${subresource_flags[@]}" --all-namespaces)" || return 1 ;;
    *) result="$(bound_kubectl auth can-i "$verb" "$resource" "${subresource_flags[@]}" -n "$scope")" || return 1 ;;
  esac
  test "$result" = yes || { printf 'AUTHORITY_DENIED: %s %s %s\n' "$verb" "$resource" "$scope" >&2; return 1; }
}
while IFS= read -r auth_row || [[ -n $auth_row ]]; do
  read -r auth_verb auth_resource auth_scope auth_extra <<< "$auth_row"
  test -n "$auth_verb" && test -n "$auth_resource" && test -n "$auth_scope" && test -z "$auth_extra" || exit 1
  [[ $auth_verb =~ ^(get|list|watch|create|update|patch|delete|bind|escalate)$ ]] || exit 1
  [[ $auth_resource =~ ^[a-z0-9./-]+$ ]] || exit 1
  [[ $auth_scope =~ ^[a-z0-9-]+$ ]] || exit 1
  require_authority "$auth_verb" "$auth_resource" "$auth_scope" || exit 1
done < "$PREFLIGHT_AUTHORIZATION_PLAN"
# These probe reads are required regardless of which runtime options are selected.
for auth_verb in get list watch create delete; do require_authority "$auth_verb" namespaces cluster; done
for auth_resource in pods persistentvolumeclaims; do
  for auth_verb in get list watch create patch; do require_authority "$auth_verb" "$auth_resource" "$PREFLIGHT_NAMESPACE"; done
done
require_authority list events "$PREFLIGHT_NAMESPACE"
require_authority get pods/log "$PREFLIGHT_NAMESPACE"
require_authority get persistentvolumes cluster
require_authority list persistentvolumes cluster
require_authority watch persistentvolumes cluster
require_authority get storageclasses.storage.k8s.io cluster
require_authority get customresourcedefinitions.apiextensions.k8s.io/applications.argoproj.io cluster
argo_application_crd="$(bound_kubectl get crd applications.argoproj.io --ignore-not-found -o name)"
if [[ -n $argo_application_crd ]]; then
  require_authority list applications.argoproj.io all-namespaces
else
  printf '%s\n' 'ARGO_APPLICATION_CRD_ABSENT: optional Argo ownership is unavailable'
fi
for owner_namespace in "$NAMESPACE" "$PRISM_NAMESPACE"; do
  for owner_resource in deployments.apps statefulsets.apps cronjobs.batch; do
    require_authority list "$owner_resource" "$owner_namespace"
  done
  assert_cluster_binding
  node scripts/gitops-owner.mjs "$owner_namespace" '*'
done
sha256sum "$PREFLIGHT_AUTHORIZATION_PLAN"
```

Expected observation: each required check succeeds with `yes`; both ownership
checks exit zero. The exact [ownership guard lists all Applications and checks
retained workload metadata](https://github.com/datrab/kubeclaw/blob/b6e4a0d774434b8c39b2575322436e3fba708914/scripts/gitops-owner.mjs#L14-L26).
This catches an Application outside `argocd` and workloads retained after an
Application was deleted. It runs here before probe/setup/infra effects because
[role rendering returns before the later guard](https://github.com/datrab/kubeclaw/blob/b6e4a0d774434b8c39b2575322436e3fba708914/scripts/deploy.sh#L1419-L1429).
The deployment script repeats the guard for both agents and the Prism and
Prism-agent releases; passing it now does not waive a later conflict.
A successfully empty named CRD lookup is optional absence. A denied lookup,
malformed Application annotation, claimed namespace or retained ownership is
a stop. Do not remove metadata to make the check pass. Follow the
[GitOps ownership boundary](maintenance.md#gitops-operation) instead.

Check the actual named StorageClass again in the probe preparation below.
Permission for any existing namespace is not a substitute for the future probe
namespace's grants. Those grants must already return `yes` before creation;
repeat them after creation to detect a changed authorization policy. Provider
lookup authority must already have a named owner and an approved exact command.
Neither namespace creation nor a successful Kubernetes `can-i` grants access to
the provider. Retain the plan and sanitized outcomes; never save Secret contents.


## Prepare Independent Access

Before setup, prove that the administration machine can reach the cluster API.
Record a second route to the host or control plane.

Do not count Tailscale inside the target cluster as the only second route.
A CNI or cluster failure can remove that route.

The optional Ops Pod supports routine operations after cluster readiness.
The [platform boundary](../understand/platform-and-operations.md#ops-pod-tool-policy-is-not-kubernetes-authority) explains the optional Ops Pod. Treat its installation and credentials as a separate administrative surface.

[Automated host bootstrap and restore](../status/open-issues.md#automated-host-bootstrap-and-restore-prerequisites-are-incomplete) tracks the missing prerequisites.

## Prove DNS and disposable storage

Complete every earlier nonmutating gate before this probe. The runtime
selection and every selected role render must pass; a failure forbids probe
creation. This probe is the first cluster mutation. It creates one unique namespace, one
PVC, and one Pod. The cluster administrator authorizes those resources. The
StorageClass controller owns provisioning, and cluster DNS owns name
resolution. Run it from the bound administration shell.

The probe uses the digest-pinned Alpine-based Node.js image recorded as
[`OPS_NODE_BASE` in `versions.json`](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/versions.json#L28-L29).
The repository also uses that value as
[the Ops image build input](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/ops/pod/Dockerfile#L1-L3).
Its BusyBox `nslookup` client is the DNS probe. This check proves the selected
cluster can pull that exact image; it does not prove that later workload images
are available.

Choose `<unique-id>` and the future probe namespace during authorization
preflight, not after mutation. `<storage-request>` is a positive Kubernetes
quantity accepted by the selected class and quota, such as `64Mi` when the
storage owner supports it. A UID is an object's unique identity; reusing its
name creates a different object. Keep the bound shell and its identity record
through capture and cleanup. `<evidence-dir>` is a new private directory
outside Git. Do not use a production namespace for this probe.

Before creation, the storage owner must provide the exact provider lookup and
reconciliation procedure. It must cover a bound PV **and** a Pending claim
whose controller may still allocate storage without a PV visible in the API.
A CSI `volumeHandle` identifies the provider asset when present. For another
provisioner, the owner supplies that identity from its own records. A missing
PV does not prove that no backing asset was allocated. If the owner cannot
identify or reconcile in-progress provisioning, stop before this probe.
A `Delete` reclaim policy requests provisioner deletion; it is not a deletion
receipt. A `Retain` or unknown policy requires a separately approved exact
provider cleanup procedure, so stop this default probe before claim creation.

```bash
export PREFLIGHT_STORAGE_CLASS="<storage-class>"
export PREFLIGHT_STORAGE_REQUEST="<storage-request>"
export PREFLIGHT_EVIDENCE_DIR="<evidence-dir>"
export PREFLIGHT_IMAGE="$(node -e '
const value = require("./versions.json").buildArgs.OPS_NODE_BASE;
if (!/^[^@]+@sha256:[a-f0-9]{64}$/.test(value)) process.exit(1);
process.stdout.write(value);
')"
: "${PREFLIGHT_NAMESPACE:?Complete the authorization preflight first}"
test -n "$PREFLIGHT_STORAGE_CLASS" && test -n "$PREFLIGHT_STORAGE_REQUEST"
test ! -e "$PREFLIGHT_EVIDENCE_DIR"
mkdir -m 0700 "$PREFLIGHT_EVIDENCE_DIR"
readonly PREFLIGHT_NAMESPACE PREFLIGHT_STORAGE_CLASS PREFLIGHT_STORAGE_REQUEST PREFLIGHT_IMAGE PREFLIGHT_EVIDENCE_DIR
PREFLIGHT_NAMESPACE_UID=''
PREFLIGHT_PVC_UID=''
PREFLIGHT_POD_UID=''
PREFLIGHT_PV_NAME=''
PREFLIGHT_PV_UID=''
PREFLIGHT_PROVIDER_ASSET_ID=''
PROBE_CAPTURE_STATUS=not-run
PROBE_RUN_STATUS=not-run
probe_snapshot() {
  local resource="$1" name="$2" file="$3" namespace="${4:-}" status
  local arguments=(get "$resource" "$name" --ignore-not-found -o json)
  [[ -z $namespace ]] || arguments+=(-n "$namespace")
  if bound_kubectl "${arguments[@]}" > "$PREFLIGHT_EVIDENCE_DIR/$file" \
    2> "$PREFLIGHT_EVIDENCE_DIR/$file.stderr"; then
    printf '%s\n' 0 > "$PREFLIGHT_EVIDENCE_DIR/$file.exit"
  else
    status=$?
    printf '%s\n' "$status" > "$PREFLIGHT_EVIDENCE_DIR/$file.exit"
    printf 'PROBE_READ_FAILED: %s/%s\n' "$resource" "$name" >&2
    return "$status"
  fi
}
probe_field() {
  node - "$PREFLIGHT_EVIDENCE_DIR/$1" "$2" <<'NODE'
const fs = require('node:fs');
const bytes = fs.readFileSync(process.argv[2], 'utf8');
let value = bytes.trim() ? JSON.parse(bytes) : null;
for (const field of process.argv[3].split('.')) value = value?.[field];
process.stdout.write(value === undefined || value === null ? '' : String(value));
NODE
}
probe_capture() {
  PROBE_CAPTURE_STATUS=failed
  probe_snapshot namespace "$PREFLIGHT_NAMESPACE" namespace.json || return 1
  SNAPSHOT_NAMESPACE_UID="$(probe_field namespace.json metadata.uid)" || return 1
  if [[ -n $PREFLIGHT_NAMESPACE_UID && $SNAPSHOT_NAMESPACE_UID != "$PREFLIGHT_NAMESPACE_UID" ]]; then
    printf '%s\n' 'PROBE_NAMESPACE_IDENTITY_CHANGED_OR_ABSENT' >&2; return 1
  fi
  probe_snapshot pod dependency-probe pod.json "$PREFLIGHT_NAMESPACE" || return 1
  probe_snapshot pvc dependency-probe pvc.json "$PREFLIGHT_NAMESPACE" || return 1
  probe_snapshot storageclass "$PREFLIGHT_STORAGE_CLASS" storageclass.json || return 1
  local observed_pvc_uid observed_pv_name observed_pv_uid observed_pod_uid
  observed_pod_uid="$(probe_field pod.json metadata.uid)" || return 1
  if [[ -n ${PREFLIGHT_POD_UID:-} && $observed_pod_uid != "$PREFLIGHT_POD_UID" ]]; then
    printf '%s\n' 'PROBE_POD_IDENTITY_CHANGED_OR_ABSENT' >&2; return 1
  fi
  PREFLIGHT_POD_UID="$observed_pod_uid"
  observed_pvc_uid="$(probe_field pvc.json metadata.uid)" || return 1
  observed_pv_name="$(probe_field pvc.json spec.volumeName)" || return 1
  if [[ -n $PREFLIGHT_PVC_UID && $observed_pvc_uid != "$PREFLIGHT_PVC_UID" ]]; then
    printf '%s\n' 'PROBE_PVC_IDENTITY_CHANGED_OR_ABSENT' >&2; return 1
  fi
  if [[ -n $PREFLIGHT_PV_NAME && $observed_pv_name != "$PREFLIGHT_PV_NAME" ]]; then
    printf '%s\n' 'PROBE_PV_BINDING_CHANGED' >&2; return 1
  fi
  PREFLIGHT_PVC_UID="$observed_pvc_uid"
  PREFLIGHT_PV_NAME="$observed_pv_name"
  PREFLIGHT_PROVISIONER="$(probe_field storageclass.json provisioner)" || return 1
  PREFLIGHT_RECLAIM_POLICY="$(probe_field storageclass.json reclaimPolicy)" || return 1
  if [[ -n $PREFLIGHT_PV_NAME ]]; then
    probe_snapshot pv "$PREFLIGHT_PV_NAME" pv.json || return 1
    observed_pv_uid="$(probe_field pv.json metadata.uid)" || return 1
    test -n "$observed_pv_uid" || return 1
    if [[ -n $PREFLIGHT_PV_UID && $observed_pv_uid != "$PREFLIGHT_PV_UID" ]]; then return 1; fi
    PREFLIGHT_PV_UID="$observed_pv_uid"
    PREFLIGHT_RECLAIM_POLICY="$(probe_field pv.json spec.persistentVolumeReclaimPolicy)" || return 1
    PREFLIGHT_PROVIDER_ASSET_ID="$(probe_field pv.json spec.csi.volumeHandle)" || return 1
  else
    printf '%s\n' 'NO_PV_VISIBLE: provider allocation is not established' > "$PREFLIGHT_EVIDENCE_DIR/pv-state.txt"
  fi
  if bound_kubectl -n "$PREFLIGHT_NAMESPACE" get events --sort-by=.metadata.creationTimestamp \
    > "$PREFLIGHT_EVIDENCE_DIR/events.txt" 2> "$PREFLIGHT_EVIDENCE_DIR/events.stderr"; then
    printf '%s\n' 0 > "$PREFLIGHT_EVIDENCE_DIR/events.exit"
  else printf '%s\n' "$?" > "$PREFLIGHT_EVIDENCE_DIR/events.exit"; return 1; fi
  if node - "$PREFLIGHT_EVIDENCE_DIR/pod.json" <<'NODE'
const fs = require('node:fs');
const bytes = fs.readFileSync(process.argv[2], 'utf8');
const pod = bytes.trim() ? JSON.parse(bytes) : null;
const state = pod?.status?.containerStatuses?.find(item => item.name === 'probe')?.state;
process.exit(state?.running || state?.terminated ? 0 : 1);
NODE
  then
    if bound_kubectl -n "$PREFLIGHT_NAMESPACE" logs pod/dependency-probe \
      > "$PREFLIGHT_EVIDENCE_DIR/probe.log" 2> "$PREFLIGHT_EVIDENCE_DIR/probe-log.stderr"; then
      printf '%s\n' 0 > "$PREFLIGHT_EVIDENCE_DIR/probe-log.exit"
    else printf '%s\n' "$?" > "$PREFLIGHT_EVIDENCE_DIR/probe-log.exit"; return 1; fi
  else
    printf '%s\n' 'NOT_AVAILABLE: Pod absent or probe container has not started' > "$PREFLIGHT_EVIDENCE_DIR/probe-log-status.txt"
  fi
  printf '%s\n' "namespace_uid=$PREFLIGHT_NAMESPACE_UID" "observed_namespace_uid=$SNAPSHOT_NAMESPACE_UID" \
    "pod_uid=$PREFLIGHT_POD_UID" "pvc_uid=$PREFLIGHT_PVC_UID" "pv_name=$PREFLIGHT_PV_NAME" "pv_uid=$PREFLIGHT_PV_UID" \
    "provisioner=$PREFLIGHT_PROVISIONER" "provider_asset_id=$PREFLIGHT_PROVIDER_ASSET_ID" \
    "reclaim_policy=$PREFLIGHT_RECLAIM_POLICY" "run_status=$PROBE_RUN_STATUS" \
    > "$PREFLIGHT_EVIDENCE_DIR/identities.txt"
  PROBE_CAPTURE_STATUS=complete
}
assert_cluster_binding
probe_snapshot storageclass "$PREFLIGHT_STORAGE_CLASS" storageclass-before.json
PREFLIGHT_PROVISIONER="$(probe_field storageclass-before.json provisioner)"
test -n "$PREFLIGHT_PROVISIONER"
test "$(probe_field storageclass-before.json reclaimPolicy)" = Delete
probe_snapshot namespace "$PREFLIGHT_NAMESPACE" namespace-before.json
test -z "$(probe_field namespace-before.json metadata.uid)"
for auth_resource in pods persistentvolumeclaims; do
  for auth_verb in get list watch create patch; do require_authority "$auth_verb" "$auth_resource" "$PREFLIGHT_NAMESPACE"; done
done
require_authority get pods/log "$PREFLIGHT_NAMESPACE"
require_authority list events "$PREFLIGHT_NAMESPACE"
if bound_kubectl create namespace "$PREFLIGHT_NAMESPACE" \
  > "$PREFLIGHT_EVIDENCE_DIR/namespace-create.stdout" 2> "$PREFLIGHT_EVIDENCE_DIR/namespace-create.stderr"; then
  PROBE_RUN_STATUS=namespace-created
  if probe_snapshot namespace "$PREFLIGHT_NAMESPACE" namespace-created.json; then
    if PREFLIGHT_NAMESPACE_UID="$(probe_field namespace-created.json metadata.uid)"; then :;
    else PROBE_RUN_STATUS=namespace-identity-read-failed; fi
  fi
else
  PROBE_RUN_STATUS="namespace-create-uncertain-exit-$?"
fi
printf '%s\n' "$PROBE_RUN_STATUS" > "$PREFLIGHT_EVIDENCE_DIR/run-status.txt"
```

Proceed to claim/Pod apply only when `PROBE_RUN_STATUS=namespace-created` and
`PREFLIGHT_NAMESPACE_UID` is nonempty. Namespace creation success alone does
not prove the subsequent UID read succeeded. If either condition fails, run
`probe_capture` in a guarded `if` as shown below, retain the creation/read exit
records, and ask the cluster owner to reconcile the uncertain creation. Do not
adopt an existing namespace or delete one whose creating UID is unknown.
After creation, the run block repeats the probe authorization checks in guarded calls.
If any check fails, it records `authorization-changed`, skips apply and captures
the namespace for partial-state recovery. A changed
grant must not lead directly to an unobserved cleanup write.


### Run the probe and capture every outcome

The block applies only with the known creating namespace UID; otherwise it
captures the uncertain namespace state and makes no further write. Each nonzero apply
or wait result is recorded without closing the bound shell. An apply failure
can leave only some objects; a wait failure does not remove them. Do not repeat
apply to conceal that partial result.

```bash
if [[ $PROBE_RUN_STATUS == namespace-created && -n $PREFLIGHT_NAMESPACE_UID ]]; then
assert_cluster_binding
for auth_resource in pods persistentvolumeclaims; do
  for auth_verb in get list watch create patch; do
    require_authority "$auth_verb" "$auth_resource" "$PREFLIGHT_NAMESPACE" || PROBE_RUN_STATUS=authorization-changed
  done
done
require_authority get pods/log "$PREFLIGHT_NAMESPACE" || PROBE_RUN_STATUS=authorization-changed
require_authority list events "$PREFLIGHT_NAMESPACE" || PROBE_RUN_STATUS=authorization-changed
if [[ $PROBE_RUN_STATUS == namespace-created ]]; then
if bound_kubectl -n "$PREFLIGHT_NAMESPACE" apply -f - \
  > "$PREFLIGHT_EVIDENCE_DIR/apply.stdout" 2> "$PREFLIGHT_EVIDENCE_DIR/apply.stderr" <<EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: dependency-probe
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: ${PREFLIGHT_STORAGE_CLASS}
  resources:
    requests:
      storage: ${PREFLIGHT_STORAGE_REQUEST}
---
apiVersion: v1
kind: Pod
metadata:
  name: dependency-probe
spec:
  restartPolicy: Never
  dnsPolicy: ClusterFirst
  securityContext:
    fsGroup: 1000
    seccompProfile: {type: RuntimeDefault}
  containers:
    - name: probe
      image: ${PREFLIGHT_IMAGE}
      imagePullPolicy: IfNotPresent
      command: ["/bin/sh", "-ec"]
      args:
        - >-
          command -v nslookup;
          nslookup kubernetes.default.svc.cluster.local;
          printf '%s\n' kubeclaw-storage-probe > /probe/value;
          sync;
          test "\$(cat /probe/value)" = kubeclaw-storage-probe;
          printf '%s\n' DNS_AND_STORAGE_PROBE_PASSED
      securityContext:
        allowPrivilegeEscalation: false
        capabilities: {drop: ["ALL"]}
        readOnlyRootFilesystem: true
        runAsNonRoot: true
        runAsUser: 1000
      volumeMounts:
        - {name: probe, mountPath: /probe}
  volumes:
    - name: probe
      persistentVolumeClaim: {claimName: dependency-probe}
EOF
then
  PROBE_RUN_STATUS=applied
  printf '%s\n' 0 > "$PREFLIGHT_EVIDENCE_DIR/apply.exit"
else
  probe_exit=$?
  printf '%s\n' "$probe_exit" > "$PREFLIGHT_EVIDENCE_DIR/apply.exit"
  PROBE_RUN_STATUS="apply-failed-exit-$probe_exit"
fi
if [[ $PROBE_RUN_STATUS == applied ]]; then
  if bound_kubectl -n "$PREFLIGHT_NAMESPACE" wait pvc/dependency-probe \
    --for=jsonpath='{.status.phase}'=Bound --timeout=180s \
    > "$PREFLIGHT_EVIDENCE_DIR/pvc-wait.stdout" 2> "$PREFLIGHT_EVIDENCE_DIR/pvc-wait.stderr"; then
    PROBE_RUN_STATUS=pvc-bound
    printf '%s\n' 0 > "$PREFLIGHT_EVIDENCE_DIR/pvc-wait.exit"
  else
    probe_exit=$?; printf '%s\n' "$probe_exit" > "$PREFLIGHT_EVIDENCE_DIR/pvc-wait.exit"
    PROBE_RUN_STATUS="pvc-wait-failed-exit-$probe_exit"
  fi
fi
if [[ $PROBE_RUN_STATUS == pvc-bound ]]; then
  if bound_kubectl -n "$PREFLIGHT_NAMESPACE" wait pod/dependency-probe \
    --for=jsonpath='{.status.phase}'=Succeeded --timeout=180s \
    > "$PREFLIGHT_EVIDENCE_DIR/pod-wait.stdout" 2> "$PREFLIGHT_EVIDENCE_DIR/pod-wait.stderr"; then
    PROBE_RUN_STATUS=pod-succeeded
    printf '%s\n' 0 > "$PREFLIGHT_EVIDENCE_DIR/pod-wait.exit"
  else
    probe_exit=$?; printf '%s\n' "$probe_exit" > "$PREFLIGHT_EVIDENCE_DIR/pod-wait.exit"
    PROBE_RUN_STATUS="pod-wait-failed-exit-$probe_exit"
  fi
fi
fi
fi
printf '%s\n' "$PROBE_RUN_STATUS" > "$PREFLIGHT_EVIDENCE_DIR/run-status.txt"
if probe_capture; then
  printf '%s\n' "$PROBE_CAPTURE_STATUS" > "$PREFLIGHT_EVIDENCE_DIR/capture-status.txt"
else
  printf '%s\n' 'CAPTURE_FAILED: retain resources and recover read authority' > "$PREFLIGHT_EVIDENCE_DIR/capture-status.txt"
fi
```

Expected success: `run-status.txt` says `pod-succeeded`; capture is `complete`;
the recorded claim is `Bound`, PV identity and provider asset are known, the
PV's actual reclaim policy is `Delete`, and the last line of `probe.log` is
`DNS_AND_STORAGE_PROBE_PASSED`. Verify that result explicitly:

```bash
test "$PROBE_RUN_STATUS" = pod-succeeded
test "$PROBE_CAPTURE_STATUS" = complete
test "$(probe_field pvc.json status.phase)" = Bound
test -n "$PREFLIGHT_PVC_UID" && test -n "$PREFLIGHT_PV_UID"
test "$PREFLIGHT_RECLAIM_POLICY" = Delete
test "$(tail -n 1 "$PREFLIGHT_EVIDENCE_DIR/probe.log")" = DNS_AND_STORAGE_PROBE_PASSED
```

Skip this success-only block on failure; continue with recovery below. It
must not replace capture or delete failure evidence.

### Recover an early or partial probe failure

| Captured state | Exact safe next action |
| --- | --- |
| Namespace creation failed or UID read failed | Run the guarded `probe_capture` call above. Preserve `namespace-create.*` and named-read exits. A present namespace with no known creating UID stays untouched. Cluster owner reconciles the create request, checks its audit record and confirms the creating identity; do not adopt its UID from a later name lookup. |
| Apply failed; PVC or Pod absent | Successful empty named snapshots establish API absence of that object. Retain the other present object and its UID. Send the captured apply result and PVC/Pod state to the cluster/storage owners before any retry or cleanup. An absent Pod has no required log stream. |
| PVC Pending, unbound or binding timed out | `pvc.json`, `storageclass.json` and `events.txt` show the exact claim UID, conditions and provisioner. No PV name or provider ID is assumed. Storage owner reconciles that claim with provisioner operations and identifies any allocated asset before authorizing cleanup. Do not call `get pv` with an empty name. |
| Pod Pending, Failed, image pull or mount failure | Read captured Pod status and events. Capture logs only when the probe container has actually started. No started container is recorded as `NOT_AVAILABLE`, not as a successful DNS/storage result. Resolve the named scheduler, registry, mount or DNS owner; do not substitute a different image or class merely to pass. |
| Capture denied, API failure, changed namespace/Pod/PVC/PV identity | The corresponding `.exit`/`.stderr` files identify the failed observation. Keep the namespace, claim and any volume. Restore the bound read authority through the platform owner, then repeat `probe_capture` in the guarded form. Never interpret a denied read as absence or run deletion from stale snapshots. |
| PV visible but provider ID, reclaim policy or provider lookup is unknown | Retain all objects. Storage owner supplies the provisioner-specific asset identity and cleanup/disposition procedure. A missing CSI handle is not evidence of an empty volume. |

Recovery never proceeds to installation on a failed probe. Repeating the
probe requires a corrected owned prerequisite, complete cleanup/disposition of
the previous run, a new namespace name and a new evidence directory. Keep the
old failure record.

### Clean only the owned probe namespace

Before deletion, the cluster and storage owners must reconcile the current
captured state and approve cleanup of this exact disposable namespace. The
storage owner supplies a private `<probe-cleanup-clearance-json>` outside Git,
with these fields: `namespaceUID`, `pvcUID`, `pvUID` (empty strings for
successfully observed absent/unbound objects), `providerAssetId` (the known
asset, or empty only after an owned provider reconciliation proves no allocated
asset), `safeToDeleteNamespace: true`, `approvedBy`, and `reconciliationReceipt`.
The receipt identifies the provider lookup, any in-progress allocation and its
cancellation/quiescence result, and the asset's current disposition. Verify the
owner's approval through the independent planning-record authority; checking
JSON shape is not authentication of that approval. This applies to a Pending
PVC too. Without that reconciliation, keep the namespace and escalate using
the exact claim UID; there is no universal provider cleanup command.

Use the same bound shell. Capture again before matching the approval, because
a Pending claim can bind while the owners investigate. If identities changed
or a previously unbound claim acquired a PV, obtain a new clearance. For a
non-CSI PV, the approved `providerAssetId` supplies the external identity;
for a CSI PV it must agree with the observed handle.

```bash
export PREFLIGHT_CLEANUP_CLEARANCE="<probe-cleanup-clearance-json>"
probe_archive="$(mktemp -d "$PREFLIGHT_EVIDENCE_DIR/capture-before-cleanup.XXXXXX")"
for probe_file in namespace.json pod.json pvc.json pv.json storageclass.json events.txt probe.log probe-log-status.txt identities.txt; do
  if [[ -f $PREFLIGHT_EVIDENCE_DIR/$probe_file ]]; then cp -- "$PREFLIGHT_EVIDENCE_DIR/$probe_file" "$probe_archive/$probe_file"; fi
done
if probe_capture; then :; else printf '%s\n' 'RETAIN_PROBE: capture incomplete' >&2; exit 1; fi
test "$PROBE_CAPTURE_STATUS" = complete
test -n "$PREFLIGHT_NAMESPACE_UID"
test "$SNAPSHOT_NAMESPACE_UID" = "$PREFLIGHT_NAMESPACE_UID"
test -s "$PREFLIGHT_CLEANUP_CLEARANCE" && test ! -L "$PREFLIGHT_CLEANUP_CLEARANCE"
export PREFLIGHT_NAMESPACE_UID PREFLIGHT_PVC_UID PREFLIGHT_PV_UID PREFLIGHT_PROVIDER_ASSET_ID
node - "$PREFLIGHT_CLEANUP_CLEARANCE" "$PREFLIGHT_EVIDENCE_DIR/namespace-delete-options.json" <<'NODE'
const fs = require('node:fs');
const clearance = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
for (const [field, env] of [['namespaceUID', 'PREFLIGHT_NAMESPACE_UID'],
  ['pvcUID', 'PREFLIGHT_PVC_UID'], ['pvUID', 'PREFLIGHT_PV_UID']]) {
  if (typeof clearance[field] !== 'string' || clearance[field] !== process.env[env]) {
    throw new Error('PROBE_CLEARANCE_IDENTITY_MISMATCH:' + field);
  }
}
if (clearance.safeToDeleteNamespace !== true || !clearance.approvedBy || !clearance.reconciliationReceipt
  || typeof clearance.providerAssetId !== 'string'
  || (clearance.pvUID && !clearance.providerAssetId)
  || (process.env.PREFLIGHT_PROVIDER_ASSET_ID && clearance.providerAssetId !== process.env.PREFLIGHT_PROVIDER_ASSET_ID)) {
  throw new Error('PROBE_PROVIDER_RECONCILIATION_REQUIRED');
}
fs.writeFileSync(process.argv[3], JSON.stringify({apiVersion: 'v1', kind: 'DeleteOptions',
  preconditions: {uid: clearance.namespaceUID}}) + '\n', {flag: 'wx', mode: 0o600});
NODE
PREFLIGHT_PROVIDER_ASSET_ID="$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).providerAssetId)' "$PREFLIGHT_CLEANUP_CLEARANCE")"
cp -- "$PREFLIGHT_CLEANUP_CLEARANCE" "$PREFLIGHT_EVIDENCE_DIR/cleanup-clearance.json"
assert_cluster_binding
if bound_kubectl delete --raw "/api/v1/namespaces/$PREFLIGHT_NAMESPACE" \
  -f "$PREFLIGHT_EVIDENCE_DIR/namespace-delete-options.json" \
  > "$PREFLIGHT_EVIDENCE_DIR/delete.stdout" 2> "$PREFLIGHT_EVIDENCE_DIR/delete.stderr"; then
  printf '%s\n' 0 > "$PREFLIGHT_EVIDENCE_DIR/delete.exit"
else printf '%s\n' "$?" > "$PREFLIGHT_EVIDENCE_DIR/delete.exit"; exit 1; fi
if bound_kubectl wait --for=delete "namespace/$PREFLIGHT_NAMESPACE" --timeout=180s \
  > "$PREFLIGHT_EVIDENCE_DIR/delete-wait.stdout" 2> "$PREFLIGHT_EVIDENCE_DIR/delete-wait.stderr"; then
  printf '%s\n' 0 > "$PREFLIGHT_EVIDENCE_DIR/delete-wait.exit"
else printf '%s\n' "$?" > "$PREFLIGHT_EVIDENCE_DIR/delete-wait.exit"; exit 1; fi
probe_snapshot namespace "$PREFLIGHT_NAMESPACE" namespace-after.json
test -z "$(probe_field namespace-after.json metadata.uid)"
if [[ -n $PREFLIGHT_PV_NAME ]]; then
  for attempt in $(seq 1 60); do
    probe_snapshot pv "$PREFLIGHT_PV_NAME" pv-after.json
    [[ -n $(probe_field pv-after.json metadata.uid) ]] || break
    sleep 2
  done
  test -z "$(probe_field pv-after.json metadata.uid)"
fi
printf '%s\n' 'namespace-absent; recorded PV absent or no PV was bound; provider proof still required' \
  > "$PREFLIGHT_EVIDENCE_DIR/kubernetes-disposition.txt"
```

The raw DELETE sends a [UID precondition](https://kubernetes.io/docs/reference/kubernetes-api/definitions/delete-options-v1-meta/)
to the API, so a different namespace with the same name must not be deleted.
[`kubectl` accepts a single local request-body file for raw DELETE](https://github.com/kubernetes/kubectl/blob/v0.34.0/pkg/cmd/delete/delete.go#L275-L307).
The local raw-request interface was checked with kubectl `v1.34.11` against
an isolated HTTP fixture; this is not a supported-cluster-version or live
delete result. The platform owner must confirm that the selected client supports
these exact flags before the probe. There is no PV deletion command in this
block. A namespace deletion failure or
timeout is not permission to force deletion or strip finalizers. Preserve the
exact exit and snapshots; let the named cluster/storage owner reconcile
finalizers and provider operations before another write. The deletion body is
created once; on a failed/uncertain delete, retain it and its receipt rather
than rerunning this block as a fresh deletion attempt.

After Kubernetes observations, the storage owner must run the approved exact
provider lookup for `PREFLIGHT_PROVIDER_ASSET_ID`, or the recorded claim-based
reconciliation when no asset ever existed. Save the sanitized command, time,
exit status and result as `provider-disposition.txt` in the evidence directory.
Only that owner can prove provider absence and that provisioning will not later
create an orphan. Unknown provider disposition leaves the probe incomplete.
Retain the image digest, class/request, approval, all creating and observed UIDs,
API snapshots, events, logs or explicit no-log state, commands/exits and both
Kubernetes and provider disposition records. Do not remove the evidence directory.
A failed probe remains failed after cleanup; correct its cause and rerun with
new identities before installing workloads.

## Install in Dependency Order

### 1. Create Namespace and Secrets

`infra` requires the SPIRE namespaces to exist; `setup` creates only the
application namespace. Create the application and identity namespaces explicitly after preflight
succeeds. When Prism is selected and has a separate namespace, create that exact namespace too:

```bash
namespace_manifests="$(mktemp -d)"
trap 'rm -rf -- "$namespace_manifests"' EXIT
bound_kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml \
  > "$namespace_manifests/application.yaml"
bound_kubectl create namespace spire-server --dry-run=client -o yaml \
  > "$namespace_manifests/spire-server.yaml"
bound_kubectl create namespace spire-system --dry-run=client -o yaml \
  > "$namespace_manifests/spire-system.yaml"
bound_kubectl apply -f "$namespace_manifests/application.yaml"
bound_kubectl apply -f "$namespace_manifests/spire-server.yaml"
bound_kubectl apply -f "$namespace_manifests/spire-system.yaml"
if [[ $KUBECLAW_DEPLOY_PRISM == true && $PRISM_NAMESPACE != "$NAMESPACE" ]]; then
  bound_kubectl create namespace "$PRISM_NAMESPACE" --dry-run=client -o yaml \
    > "$namespace_manifests/prism.yaml"
  bound_kubectl apply -f "$namespace_manifests/prism.yaml"
fi
rm -rf -- "$namespace_manifests"
trap - EXIT
bound_kubectl get namespace "$NAMESPACE" spire-server spire-system
if [[ $KUBECLAW_DEPLOY_PRISM == true && $PRISM_NAMESPACE != "$NAMESPACE" ]]; then
  bound_kubectl get namespace "$PRISM_NAMESPACE"
fi
```

Expected observation: each apply reports `created`, `configured`, or
`unchanged`, and the final command reports each selected namespace `Active`.
Stop if the binding assertion fails or an existing
namespace has another owner or policy.

Interactive installation:

```bash
export KUBECLAW_RUN_SECRET_SETUP=true
export KUBECLAW_SECRET_SETUP_MODE=interactive
bound_deploy setup
```

Noninteractive installation must pre-create or copy every required Secret.
Then use:

```bash
export KUBECLAW_RUN_SECRET_SETUP=true
export KUBECLAW_SECRET_SETUP_MODE=noninteractive
bound_deploy setup
```

Expected observation: `setup` reports the namespace and Helm repositories as ready.
Secret setup must report no missing required value.

Do not replace `setup` with `secrets` on a new administration machine.
The `secrets` command prepares Secrets but does not prepare Helm repositories.

Never save Secret contents in the change record.
Record names, key names, owners, and creation times only.

### 2. Install Infrastructure

```bash
bound_deploy infra
```

The command installs SPIRE before protected workloads.
It then installs Redis and selected stateful services.
It applies network policies after the service setup.

Expected observation: every selected Helm operation and rollout completes.
The command fails closed by default.

Do not set `ALLOW_PARTIAL_INFRA=true` for acceptance.
That option changes required failures into warnings during diagnosis.

### 3. Verify Infrastructure

Observe the infrastructure installed in step 2. Nova, Buster and Prism are
installed in the following steps. Run the comprehensive status command only
in [Record the First Verification](#7-record-the-first-verification), after all
selected workloads are installed.

```bash
bound_helm list -n "$NAMESPACE"
bound_kubectl -n "$NAMESPACE" get pods,svc,pvc
bound_kubectl -n spire-server get pods
bound_kubectl -n spire-system get pods
```

Expected observation: selected infrastructure releases are listed, their
workloads run, PVCs bind, and SPIRE agents are ready. Each read must succeed;
a failed API or Helm read is a stop, not an empty inventory.

Check events before continuing:

```bash
bound_kubectl -n "$NAMESPACE" get events --sort-by=.metadata.creationTimestamp
```

Stop for recurring mount, scheduling, image, DNS, or readiness failures.

### 4. Install Nova and Buster

```bash
bound_deploy agents
bound_deploy smoke-agent nova
bound_deploy smoke-agent buster
```

The deploy command uses atomic Helm upgrades.
It waits for both role deployments.

The smoke commands check the gateway, startup state, readiness, skills, and runtime configuration.

> **Source evidence — role readiness**
>
> **Claim:** A role deployment renders the selected immutable release before mutation. It uses an atomic Helm change, waits for readiness, and supports a role-specific smoke check.
>
> **Implementation:** [`deploy_agent()` renders, applies an atomic upgrade, and waits for the selected role](https://github.com/datrab/kubeclaw/blob/2a8558d795054d25aa4b72dbdc296c9321ba38f6/scripts/deploy.sh#L1419-L1455). [`cmd_smoke_agent()` checks the deployed gateway and runtime health](https://github.com/datrab/kubeclaw/blob/2a8558d795054d25aa4b72dbdc296c9321ba38f6/scripts/deploy.sh#L1557-L1580).
>
> **Contract or setting:** [The release materializer binds role values to the selected runtime receipt and code bundle](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/scripts/updates/materialize-release.mjs#L5-L40).
>
> **Test evidence:** [The deployment release test exercises render and fail-closed selection paths](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/deployment/deployment-release.test.mjs#L48-L80). No recent result is available for that test. The deployment truth check passed on 2026-09-16. The Prism deployment source check passed on 2026-10-09 at `e3fa70c3fe3a1a4a32af503201a19e0b5df14c61`. No live Prism deployment is established.
>
> **Revision:** Deployment source checked at `2a8558d795054d25aa4b72dbdc296c9321ba38f6`; unchanged test and release sources at `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`.
>
> **Limit:** Source tests do not prove image pulls, scheduling, dependencies, or readiness in the target cluster.

### 5. Install Prism When Selected

Run this step only when `KUBECLAW_DEPLOY_PRISM=true`. With `false`, proceed to
the explicit verification boundary in step 6; do not create Prism resources.

Complete the [Prism deployment phase](prism-studio.md#deploy-prism): render,
platform and Secret setup, deployment, and status and smoke checks. Do not
continue to Worker Trust until the selected-checkout source checks and these
deployment and health checks pass. The deployment phase does not require a Nova
approval wait or a Studio design session.

After installation and Worker Trust verification, use
[the complete Studio journey](prism-studio.md#the-complete-studio-journey) for
human design and approval. That later phase requires a successful Nova
architecture dispatch and its durable `prism.approval.resolved` wait. Stop if
the dispatch result is missing or uncertain; do not invent a project or wait to
complete installation.

The [Prism stage dispatches the architecture before it creates the approval
wait](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/nova/plugins/prism-design/src/stage.ts#L21-L34).
This is source evidence; no live dispatch result is established here.

### 6. Prove Worker Trust

With `KUBECLAW_DEPLOY_PRISM=false`, stop here and record this step as blocked
by the [reduced-profile verification limit](#select-prism-and-check-the-trust-boundary).
Do not run the full-profile verifier against missing Prism workloads or record
the installation as complete. The stop before first mutation applies when
completed installation or operational approval is required.

With `KUBECLAW_DEPLOY_PRISM=true`, verify that Nova, Buster, Prism Control, and
Prism Worker meet the linked procedure's start state.
Use the [canonical Worker Trust procedure](worker-trust.md#canonical-worker-trust-procedure).
Run all three source checks there for the selected checkout and stop on the
first actual nonzero exit. The recorded local Prism source check passed; it does
not prove live trust. The current live command's retained-request and cleanup
limit blocks complete verification even for this full profile. Follow its
[pre-execution stop](worker-trust.md#3-check-the-live-execution-boundary);
do not run the live command until the owners supply the maintained evidence and
reconciliation path described there. Final proof still requires both positive
and negative live trust results, a separate signed Nova unit production receipt,
and resolved request/resource cleanup. None can be replaced by source or smoke
checks. Do not claim live peer authorization or complete installation without
all those results.

### 7. Record the First Verification

Record complete installation only after all required trust checks pass. For an
approved isolated deployment without Prism, retain the same observations with
the blocked trust step and no operational approval.

Capture these nonsecret outputs in `<evidence-dir>`:

```bash
git rev-parse HEAD
bound_deploy status
bound_helm list -n "$NAMESPACE"
bound_kubectl -n "$NAMESPACE" get pods,svc,pvc -o wide
bound_kubectl -n "$NAMESPACE" get events --sort-by=.metadata.creationTimestamp
```

Also record each image from Pod status.
Compare its `imageID` with the selected digest.

## Failed First Installation

Use this order after the first failing command:

| Observation | Check | Action |
| --- | --- | --- |
| API or authorization error | Current context and `kubectl auth can-i` | Correct the context or obtain the required operator right |
| Pod remains Pending | Events, node selectors, taints, requests, PVC binding | Correct capacity or scheduling before retry |
| PVC remains Pending | StorageClass, binding mode, provisioner events | Repair storage outside KubeClaw |
| `ImagePullBackOff` | Selected digest and `ghcr-secret` | Repair pull identity; do not replace the digest |
| Init container fails | Init logs, code bundle commit, Secret mounts | Correct the named input and redeploy the affected role |
| SPIFFE mount fails | CSI driver and SPIRE agents | Repair identity infrastructure before agents |
| Readiness fails | Pod logs, dependency endpoints, runtime health | Repair the first failing dependency |
| Helm reports pending operation | Helm status and local Helm owners | Finish or roll back the existing operation first |

Use [Observe and Diagnose](diagnose.md) for evidence commands and symptom details.

## Recovery and Rollback

Do not run `teardown-all` to repair a failed first install.
It destroys the namespace and its retained state.

For a failed atomic agent upgrade, inspect Helm history:

```bash
bound_helm history agent-nova -n "$NAMESPACE"
bound_helm history agent-buster -n "$NAMESPACE"
```

Use a Helm rollback only when the previous release matches current data formats.
Do not roll back a database after an incompatible migration.

For a platform access failure, leave the cluster-dependent Ops Pod path.
Use the previously recorded host or control-plane route.

If the cluster itself is absent, stop here.
The repository has no complete host bootstrap procedure.

## Cleanup

Remove only temporary DNS, storage, or access probes through the platform
procedure that created them, and verify their exact names are absent. Keep
failed workload resources until their events, logs, Helm state, PVC ownership,
and recovery decision are retained. Do not use `teardown`, `teardown-all`, or a
broad namespace deletion as first-install cleanup. After a successful install,
remove restricted temporary files and credentials from the administration
machine while retaining non-secret hashes and command output.

## Product Boundary

This procedure establishes a source-backed installation path. It does not prove
that a target cluster is production-ready. A live installation still needs a
recorded deployment, independent recovery exercise, capacity result, and
security verification for that exact cluster. See
[Operational and Live Acceptance](../status/acceptance.md).

## Evidence to Retain

- Source commit and selected release manifests.
- Private overlay digest, without secret values.
- Context, namespaces, cluster version, CNI, and StorageClass facts.
- Rendered manifests in protected storage.
- Helm history, Pod image IDs, events, and smoke output.
- Failed output and the successful retry as separate records.
- Independent access owner and the last successful access check.
