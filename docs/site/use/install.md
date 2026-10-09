# Plan and Install

Status: source-backed deployment path; current runtime selection is absent, so a new runtime installation must stop before mutation
Audience: Kubernetes platform operator, security operator
Owner: platform operations
Evidence: scripts/deploy.sh; docs/generated/inventory/deploy-script.json
Applies to: current selected runtime release
Last verified: 2026-10-09; local snippet and release-boundary checks only; no live cluster result is available

## Objective

Prepare one KubeClaw environment without hiding a missing platform dependency.
Finish with ready workloads, smoke results, and an independent recovery route.

This procedure does not install a host, K3s, a storage driver, or a CNI.
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
[Supported Versions](#supported-versions), [Bind Cluster Authority](#bind-cluster-authority),
[Select Configuration](#select-configuration), the read-only
[Prerequisites](#prerequisites), [Preflight Without Mutation](#preflight-without-mutation),
and [Prepare Independent Access](#prepare-independent-access), in that order.
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

## Supported Topology and Limits

The repository deploys one application namespace plus separate identity namespaces.
It can also deploy a separate Ops Pod namespace.

The default application namespace is `kubeclaw`.
SPIRE uses `spire-server` and `spire-system`.
The default Ops Pod namespace is `kubeclaw-ops`.

The deployment path can install these components:

- SPIRE and its CSI driver.
- Redis, PostgreSQL, and LiteLLM.
- Nova and Buster role deployments.
- Prism and its PostgreSQL, Control, Studio, Worker, and agent workloads.
- The Tailscale operator for the complete showcase baseline.

The deployment path does not establish these platform services:

- Host operating system and K3s installation.
- CNI installation or a CNI migration.
- StorageClass creation and external backup storage.
- An OCI registry or BuildKit client configuration for production use.
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
> **Implementation:** [`cmd_setup()` creates the namespace and prepares chart repositories](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/scripts/deploy.sh#L878-L903).
> It then [selects the configured Secret setup](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/scripts/deploy.sh#L921-L947).
> [`cmd_infra()` runs the stateful preflight and installs SPIRE](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/scripts/deploy.sh#L1101-L1140).
> It next [installs the selected Redis and PostgreSQL services](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/scripts/deploy.sh#L1143-L1160) and [the optional LiteLLM service](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/scripts/deploy.sh#L1166-L1185).
>
> **Contract or setting:** [Deployment variables select the namespace, optional components, Secret mode, and partial-infrastructure behavior](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/scripts/deploy.sh#L37-L64).
>
> **Test evidence:** [The deployment truth check reads the deploy script and checks immutable-image and network-policy safety](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/deployment/check-deployment-truth.mjs#L41-L69). The check passed on 2026-09-16. It does not represent a cluster deployment.
>
> **Revision:** `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`.
>
> **Limit:** These commands do not install or prove the host, K3s, CNI, durable storage, or independent external access.

## Execution Locations

Use two separate administration locations.

| Location | Purpose | Required access |
| --- | --- | --- |
| Existing administration machine | First install, cluster recovery, and lockout recovery | Repository, `kubectl`, `helm`, Node.js, npm, and cluster bootstrap rights |
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
([command interface](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/scripts/deploy.sh#L7-L35);
[raw cluster clients in setup](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/scripts/deploy.sh#L878-L903)).
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
bound_kubectl auth can-i create namespaces
bound_kubectl auth can-i delete namespaces
bound_kubectl auth can-i create clusterroles.rbac.authorization.k8s.io
bound_kubectl auth can-i create customresourcedefinitions.apiextensions.k8s.io
bound_kubectl auth can-i create secrets -n "$NAMESPACE"
bound_kubectl auth can-i create pods -n "$NAMESPACE"
bound_kubectl auth can-i get pods/log -n "$NAMESPACE"
bound_kubectl auth can-i create persistentvolumeclaims -n "$NAMESPACE"
argo_application_crd="$(bound_kubectl get crd applications.argoproj.io --ignore-not-found -o name)"
if [[ -n $argo_application_crd ]]; then
  bound_kubectl -n argocd get applications.argoproj.io
else
  printf '%s\n' 'ARGO_APPLICATION_CRD_ABSENT: optional Argo ownership is unavailable'
fi
```

Expected observations:

- The worktree has no unreviewed change.
- The commit equals `<release-commit>` or an approved documentation-only successor.
- Every required node reports `Ready`.
- The selected StorageClass and its owned provisioner exist.
- The API responds through the intended context; the DNS Service has ready
  endpoints. This does not yet prove a Pod can resolve a name.
- Every required authorization check prints `yes`.

An absent Argo Application CRD means that this optional ownership mechanism
is unavailable. An authorization or API failure during the CRD lookup or
Application query is a stop; it is not evidence that Argo is absent. This
read-only lookup requires permission to get that named CRD. The
[deployment ownership guard uses the same explicit CRD-absence distinction](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/scripts/gitops-owner.mjs#L14-L21).

Stop for any unexpected context, missing node, unknown StorageClass, `no`
authorization result, missing DNS endpoint, or unowned existing data. Continue
with source and release preflight only after these read-only checks pass.

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
3. Role-specific repository values.
4. Private operator overlay.
5. Supported command overrides.

Do not select a different image in a private overlay.
Image identity belongs to the reviewed release receipt.

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

This section makes no cluster change. First complete the canonical
[Locked Dependency Installation](quickstart.md#locked-dependency-installation)
in this disposable checkout. Then run the source checks:

```bash
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
bound_deploy render prism
```

Runtime rendering requires `releases/runtime-images.json` and its generated values.
The current source revision does not contain that runtime selection.

If the selection is absent, stop before any cluster mutation, including the
DNS and storage probe, namespace creation, and Secret setup.
Use the reviewed promotion workflow to create it from successful build receipts.
Never invent the file or substitute mutable image tags.

Treat rendered output as sensitive configuration.
Review images, Secrets, service accounts, PVCs, ports, and network policies.

Complete [client preparation](maintenance.md#prepare-the-client-projections)
from the reviewed Buster render. If a new node configuration is required, the
platform owner must supply its installation, cold-pull, and rollback procedure
before this installation can proceed. Local projection generation does not
prove node readiness.

Stop if the selected release is absent, client preparation or node prerequisites
are incomplete, or the render changes an unowned resource.

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
selection and all three role renders must pass; a failure forbids probe
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

Choose a new DNS-label suffix and a storage request accepted by the selected
StorageClass. `<unique-id>` must not identify an existing namespace.
`<storage-request>` must be a positive Kubernetes quantity within the class and
quota limits, such as `64Mi` when the storage owner supports that size.
Before creating the claim, the storage owner must also name the provider console
or CLI and exact read-only lookup that proves a backing asset absent by its
provider identity. That provider-specific command runs under the storage
owner's authority, not in the Kubernetes administration shell.

```bash
export PREFLIGHT_NAMESPACE="kubeclaw-preflight-<unique-id>"
export PREFLIGHT_STORAGE_CLASS="<storage-class>"
export PREFLIGHT_STORAGE_REQUEST="<storage-request>"
export PREFLIGHT_EVIDENCE_DIR="<evidence-dir>"
export PREFLIGHT_IMAGE="$(node -e '
const value = require("./versions.json").buildArgs.OPS_NODE_BASE;
if (!/^[^@]+@sha256:[a-f0-9]{64}$/.test(value)) process.exit(1);
process.stdout.write(value);
')"
test "${#PREFLIGHT_NAMESPACE}" -le 63
[[ $PREFLIGHT_NAMESPACE =~ ^kubeclaw-preflight-[a-z0-9]([-a-z0-9]*[a-z0-9])?$ ]] || exit 1
test -n "$PREFLIGHT_STORAGE_CLASS"
test -n "$PREFLIGHT_STORAGE_REQUEST"
test ! -e "$PREFLIGHT_EVIDENCE_DIR"
mkdir -m 0700 "$PREFLIGHT_EVIDENCE_DIR"
assert_cluster_binding
bound_kubectl create namespace "$PREFLIGHT_NAMESPACE"
export PREFLIGHT_NAMESPACE_UID="$(bound_kubectl get namespace "$PREFLIGHT_NAMESPACE" -o jsonpath='{.metadata.uid}')"
test -n "$PREFLIGHT_NAMESPACE_UID"
test "$(bound_kubectl auth can-i create pods -n "$PREFLIGHT_NAMESPACE")" = yes
test "$(bound_kubectl auth can-i get pods/log -n "$PREFLIGHT_NAMESPACE")" = yes
test "$(bound_kubectl auth can-i create persistentvolumeclaims -n "$PREFLIGHT_NAMESPACE")" = yes
```

Expected observation: namespace creation reports `created`, and the UID lookup
returns one nonempty value, and the evidence directory is new and private. All three namespace authorization checks return
`yes`. Stop if the namespace already exists, the selected image is not
digest-pinned, a value is empty, or authorization is denied. Do not adopt an
existing namespace as probe state. If an authorization check fails after
creation, capture the namespace UID, recheck that UID, and delete only that
namespace with `bound_kubectl delete namespace "$PREFLIGHT_NAMESPACE"`.

Create the exact disposable claim and Pod:

```bash
assert_cluster_binding
bound_kubectl -n "$PREFLIGHT_NAMESPACE" apply -f - <<EOF
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
bound_kubectl -n "$PREFLIGHT_NAMESPACE" wait pvc/dependency-probe \
  --for=jsonpath='{.status.phase}'=Bound --timeout=180s
export PREFLIGHT_PVC_UID="$(bound_kubectl -n "$PREFLIGHT_NAMESPACE" get pvc/dependency-probe -o jsonpath='{.metadata.uid}')"
export PREFLIGHT_PV_NAME="$(bound_kubectl -n "$PREFLIGHT_NAMESPACE" get pvc/dependency-probe -o jsonpath='{.spec.volumeName}')"
export PREFLIGHT_PV_UID="$(bound_kubectl get pv "$PREFLIGHT_PV_NAME" -o jsonpath='{.metadata.uid}')"
export PREFLIGHT_PROVISIONER="$(bound_kubectl get storageclass "$PREFLIGHT_STORAGE_CLASS" -o jsonpath='{.provisioner}')"
export PREFLIGHT_PROVIDER_ASSET_ID="${PREFLIGHT_PROVIDER_ASSET_ID:-$(bound_kubectl get pv "$PREFLIGHT_PV_NAME" -o jsonpath='{.spec.csi.volumeHandle}')}"
export PREFLIGHT_RECLAIM_POLICY="$(bound_kubectl get pv "$PREFLIGHT_PV_NAME" -o jsonpath='{.spec.persistentVolumeReclaimPolicy}')"
test -n "$PREFLIGHT_PVC_UID"
test -n "$PREFLIGHT_PV_NAME"
test -n "$PREFLIGHT_PV_UID"
test -n "$PREFLIGHT_PROVISIONER"
test -n "$PREFLIGHT_PROVIDER_ASSET_ID"
test "$PREFLIGHT_RECLAIM_POLICY" = Delete
bound_kubectl -n "$PREFLIGHT_NAMESPACE" wait pod/dependency-probe \
  --for=jsonpath='{.status.phase}'=Succeeded --timeout=180s
bound_kubectl -n "$PREFLIGHT_NAMESPACE" logs pod/dependency-probe
```

Expected observation: the PVC becomes `Bound`; the commands record the exact
PVC UID, PV name and UID, StorageClass provisioner, provider asset identity, and
`Delete` reclaim policy;
the Pod becomes `Succeeded`; and its final log line is
`DNS_AND_STORAGE_PROBE_PASSED`. Stop on a `Retain` or unknown reclaim policy,
image-pull,
scheduling, mount, DNS, write, read, or timeout failure. Capture the Pod, PVC,
events, and logs before cleanup; do not change the StorageClass or image merely
to make this preflight pass.

```bash
assert_cluster_binding
test "$(bound_kubectl get namespace "$PREFLIGHT_NAMESPACE" -o jsonpath='{.metadata.uid}')" = "$PREFLIGHT_NAMESPACE_UID"
test "$(bound_kubectl -n "$PREFLIGHT_NAMESPACE" get pvc/dependency-probe -o jsonpath='{.metadata.uid}')" = "$PREFLIGHT_PVC_UID"
test "$(bound_kubectl get pv "$PREFLIGHT_PV_NAME" -o jsonpath='{.metadata.uid}')" = "$PREFLIGHT_PV_UID"
bound_kubectl -n "$PREFLIGHT_NAMESPACE" get pod/dependency-probe pvc/dependency-probe -o yaml \
  > "$PREFLIGHT_EVIDENCE_DIR/dependency-probe-resources.yaml"
bound_kubectl get "storageclass/$PREFLIGHT_STORAGE_CLASS" "pv/$PREFLIGHT_PV_NAME" -o yaml \
  > "$PREFLIGHT_EVIDENCE_DIR/dependency-probe-storage.yaml"
bound_kubectl -n "$PREFLIGHT_NAMESPACE" get events --sort-by=.metadata.creationTimestamp \
  > "$PREFLIGHT_EVIDENCE_DIR/dependency-probe-events.txt"
bound_kubectl -n "$PREFLIGHT_NAMESPACE" logs pod/dependency-probe \
  > "$PREFLIGHT_EVIDENCE_DIR/dependency-probe.log"
printf '%s\n' \
  "namespace_uid=$PREFLIGHT_NAMESPACE_UID" \
  "pvc_uid=$PREFLIGHT_PVC_UID" \
  "pv_name=$PREFLIGHT_PV_NAME" \
  "pv_uid=$PREFLIGHT_PV_UID" \
  "provisioner=$PREFLIGHT_PROVISIONER" \
  "provider_asset_id=$PREFLIGHT_PROVIDER_ASSET_ID" \
  "reclaim_policy=$PREFLIGHT_RECLAIM_POLICY" \
  > "$PREFLIGHT_EVIDENCE_DIR/dependency-probe-identities.txt"
bound_kubectl delete namespace "$PREFLIGHT_NAMESPACE" --wait=true --timeout=180s
test -z "$(bound_kubectl get namespace "$PREFLIGHT_NAMESPACE" --ignore-not-found -o name)"
for attempt in $(seq 1 60); do
  test -z "$(bound_kubectl get pv "$PREFLIGHT_PV_NAME" --ignore-not-found -o name)" && break
  sleep 2
done
test -z "$(bound_kubectl get pv "$PREFLIGHT_PV_NAME" --ignore-not-found -o name)"
printf '%s\n' namespace-absent pv-absent \
  > "$PREFLIGHT_EVIDENCE_DIR/dependency-probe-disposition.txt"
```

For a CSI PV, the command reads the provider asset identity from
`spec.csi.volumeHandle`. For another provisioner, the storage owner must set
`PREFLIGHT_PROVIDER_ASSET_ID` to its authoritative backing-volume identity
before this block; stop if neither authority can supply it. The two absence
checks and disposition record prove Kubernetes-side cleanup.
The `Delete` reclaim policy delegates backing-volume deletion to the recorded
provisioner. After the PV is absent, have the storage owner run the approved
read-only provider lookup for `PREFLIGHT_PROVIDER_ASSET_ID`; expected output is
not found. Save its sanitized output, command identity, time, and exit status as
`$PREFLIGHT_EVIDENCE_DIR/provider-disposition.txt`. The probe is not complete
until that record proves the provider asset absent. If the platform owner
permits only a `Retain` class, stop this
default procedure before creating the claim. Proceed only with a separately
approved provider-specific cleanup procedure that names the backing-volume
identity, owner, deletion command, absence check, and retained deletion receipt;
the run is incomplete until both the PV and provider asset are proven absent.
If evidence capture fails, retain the
namespace and diagnose access before deletion. If namespace deletion times out,
record the remaining exact resources and let the cluster/storage owner resolve
finalizers; do not remove finalizers blindly. Retain the selected image digest,
StorageClass, provisioner, reclaim policy, request, namespace/PVC/PV identities,
YAML, events, log, command exit statuses, and full disposition proof.

## Install in Dependency Order

### 1. Create Namespace and Secrets

`infra` requires the SPIRE namespaces to exist; `setup` creates only the
application namespace. Create the application and identity namespaces explicitly after preflight
succeeds. When Prism has a separate namespace, create that exact namespace too:

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
if [[ $PRISM_NAMESPACE != "$NAMESPACE" ]]; then
  bound_kubectl create namespace "$PRISM_NAMESPACE" --dry-run=client -o yaml \
    > "$namespace_manifests/prism.yaml"
  bound_kubectl apply -f "$namespace_manifests/prism.yaml"
fi
rm -rf -- "$namespace_manifests"
trap - EXIT
bound_kubectl get namespace "$NAMESPACE" "$PRISM_NAMESPACE" spire-server spire-system
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

```bash
bound_deploy status
bound_kubectl -n "$NAMESPACE" get pods,svc,pvc
bound_kubectl -n spire-server get pods
bound_kubectl -n spire-system get pods
```

Expected observation: selected workloads run, PVCs bind, and SPIRE agents are ready.

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
> **Implementation:** [`deploy_agent()` renders, applies an atomic upgrade, and waits for the selected role](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/scripts/deploy.sh#L1419-L1455). [`cmd_smoke_agent()` checks the deployed gateway and runtime health](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/scripts/deploy.sh#L1557-L1580).
>
> **Contract or setting:** [The release materializer binds role values to the selected runtime receipt and code bundle](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/scripts/updates/materialize-release.mjs#L5-L40).
>
> **Test evidence:** [The deployment release test exercises render and fail-closed selection paths](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/deployment/deployment-release.test.mjs#L48-L80). No recent result is available for that test. The deployment truth check passed on 2026-09-16. The Prism deployment source check passed on 2026-10-09 at `e3fa70c3fe3a1a4a32af503201a19e0b5df14c61`. No live Prism deployment is established.
>
> **Revision:** `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`.
>
> **Limit:** Source tests do not prove image pulls, scheduling, dependencies, or readiness in the target cluster.

### 5. Install Prism When Selected

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

Use the [canonical Worker Trust procedure](worker-trust.md#canonical-worker-trust-procedure).
Run all three source checks there for the selected checkout and stop on the
first actual nonzero exit. The recorded local Prism source check passed; it does
not prove live trust. After source and deployment prerequisites pass, run and
retain the separate positive and negative live trust exercise. Do not claim live
peer authorization without both results.

### 7. Record the First Verification

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
