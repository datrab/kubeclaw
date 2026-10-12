# Proposed replacement for the unavailable post-stop CRI endpoint

Status: design only, not an implemented or accepted stop procedure. No host
mutation was performed. The existing producer remains fail-closed and unusable
as a successful bundled-K3s migration until this boundary is implemented and
proved with the actual supported runtime.

## Decision and scope

Do not replace CRI with an after-the-fact search for Buster process names or Pod
UIDs. Newly created Pods can be absent from the initial capture, and a `/proc`
scan is not atomic or a future-admission fence. The smallest defensible kernel
boundary is the **entire pre-bound Kubernetes workload parent**, together with
`/sys/fs/cgroup/kubeclaw-buster-browser`. This interrupts all Pod workloads on the
single node, not just Buster. That maintenance scope must be explicit in policy
and the operator procedure; the current Buster-only policy does not imply it.

Initially support only the systemd cgroup driver, cgroups-per-QOS enabled, and
an actual validated `/sys/fs/cgroup/kubepods.slice` parent. Do not infer this from
a directory name: bind the effective kubelet configuration, every observed CRI
sandbox/container's host cgroup, and the parent's device/inode/type. Reject custom
roots, threaded topology, foreign delegation, inaccessible observations and any
workload running outside that parent except the explicitly bound browser tree.
The producer, K3s daemon, and its runtime supervisor must be outside both targets.
No host-root cgroup or arbitrary user-supplied ancestor is eligible for adoption.

## Proposed ordering

1. Before disruption, capture the current single-node API/CRI volume/workload
   identities and effective kubelet layout; open and retain both aggregate root
   descriptors. Record the actual K3s/containerd process identities as well.
   Capture mounts and capabilities that establish Buster's only writable cgroup
   delegation is the fixed browser tree. Unknown writable host/cgroup paths or
   an existing unexplained volume writer reject the supported topology.
2. Persist the transaction and install the durable K3s restart exclusion. Freeze
   both held workload roots and wait for actual `frozen=1`. This is a kernel
   state observation, not a sleep. New descendants of these parents inherit the
   freeze, while the separate K3s/containerd control processes remain runnable.
3. Stop K3s and prove the captured control processes have exited (PID identity,
   not numeric PID alone), with the restart mask still effective. The CRI socket
   is allowed to disappear here; its disappearance is never an emptiness proof.
   An outstanding container-creation operation must not retain an unfenced
   creator capable of admitting writers after this point. Actual runtime tests
   must establish that boundary, including shim/runc processes; uncertainty
   rejects rather than inventing a successful stop receipt.
4. Kill and drain both retained aggregate roots using descriptor-relative
   `cgroup.kill` and recursive `cgroup.events populated=0`, rechecking identities.
   This includes Pods created after initial capture beneath the same parent.
   It does not rely on enumerating each descendant in advance. Keep the freeze
   and restart exclusion until both legacy trees and the receipt are sealed.
5. Acquire the original writer locks; inventory and seal the actual original
   trees under the existing quotas. Flush filesystem writes and verify exact
   immutable flags, UUID/inodes and digests. Publish and seal the fixed receipt.
   Restore only transaction-owned temporary freeze state after positive drain
   and seal, then restore the exact unit without starting it. Crash recovery
   retains the freeze/mask and must revalidate the same roots and boot identity.

A frozen parent can still have processes explicitly migrated out by a privileged
host actor. Therefore this procedure assumes the trusted host administrator does
not concurrently defeat the fence; it cannot prove safety against hostile host
root. It must verify the container authority/delegation boundary rather than
substitute that assumption for restrictions on Buster or other workload actors.

## Open descriptors, mappings and asynchronous writes

Killing every process in the complete writer domain removes those processes'
open descriptors and mappings; closing only the initial PID list would not.
A writable `MAP_SHARED` mapping can outlive its originating file descriptor,
so an FD-only scan is insufficient. A bounded host `/proc` FD plus `maps` /
`map_files` diagnostic can detect unexplained surviving access to retained
inodes, but cannot replace the aggregate admission fence. Permission failures,
PID churn that prevents a complete bounded observation, or unexplained writers
must reject. Host services outside the declared writer domain cannot be silently
adopted or killed.

Process death also is not a claim that all filesystem I/O is durably complete.
The final flush and immutable/digest verification must be tested with queued
writes and writable mappings. Pending kernel I/O or an immutable-flag failure
must not be converted into a receipt. Actual guest tests must establish the
supported kernel/filesystem behavior; no passing directory fixture can do so.

## Acceptance required before replacing the old guard

| Criterion | Required proof |
| --- | --- |
| KB1 | Actual effective kubelet configuration and all live sandbox/container memberships agree with the fixed parent; unknown roots and external delegations reject before mutation. |
| KB2 | A real workload/Pod created after capture is inside the held parent and cannot escape the freeze; it is killed despite being absent from the captured PID list. |
| KB3 | Genuine selected K3s shutdown removes containerd/CRI as expected; remaining shim/runc activity cannot admit an unfenced writer. No mocked missing-socket success. |
| KB4 | Real fork, inherited writable FD, closed-FD writable mapping and external-browser descendants all cease; positive recursive `populated=0` is required for both roots. |
| KB5 | Replaced roots, incomplete process observations, blocked kill, partial freeze, queued I/O and crash at each persistence boundary produce no receipt and retain the maintenance fence. |
| KB6 | All original data/artifacts remain readable and bound by the completed seal; old-entrypoint restart cannot reopen writes. No quota changes or historical-record deletion. |
| KB-DOC | Whole-node workload interruption, supported layout, recovery states, root trust boundary, measured limits and remaining unexecuted cases are explicit. |

## Primary-source basis and limits

The recorded K3s version starts bundled containerd with a context-bound command
and installs a Linux parent-death kill signal; see the already retained
[launch source](https://raw.githubusercontent.com/k3s-io/k3s/v1.36.4%2Bk3s1/pkg/agent/containerd/containerd.go)
and [child setup](https://raw.githubusercontent.com/k3s-io/k3s/v1.36.4%2Bk3s1/pkg/agent/containerd/command.go).
The Kubernetes [node container manager](https://raw.githubusercontent.com/kubernetes/kubernetes/v1.36.4/pkg/kubelet/cm/node_container_manager_linux.go)
defines the node-allocatable workload parent; it does not prove this node's actual
configuration. The Linux [cgroup v2 interface](https://docs.kernel.org/admin-guide/cgroup-v2.html)
documents recursive populated observations, inherited freezing, and whole-subtree
kill handling concurrent forks/migrations. Those semantics support the proposed
boundary but do not prove the concrete K3s integration or filesystem seal.

## Narrow Pod-admission alternative: barrier still unresolved

A deny policy limited to the PVC identity and fixed browser hostPath would reduce
maintenance impact, but it is not yet a replacement stop proof. Matching must use
actual namespace/claim and hostPath scope, not mutable labels or only the current
Deployment. It must cover Pod CREATE and relevant UPDATE/subresource operations,
explicit `nodeName`, pending/unscheduled Pods, init/ephemeral containers and
previously admitted Pods whose containers restart. Capture must include whole Pod
cgroups, not only currently running container PIDs.

A successful policy/binding write or a rejected dry-run does not by itself prove
that every earlier admitted request has completed storage and become visible in
the subsequent inventory. The proposed narrow path still needs a genuine
activation and in-flight admission barrier in the selected API server. This
review has not established such a maintained external CLI barrier. Polling until
nothing changes is not a substitute. Moreover, kubelet-managed static Pods are
outside normal API admission, so their root-protected configuration and access to
the relevant host paths need a separate supported-topology exclusion; merely
denying mirror Pod creation would not stop the underlying process. See the
[Kubernetes admission-policy interface](https://kubernetes.io/docs/reference/access-authn-authz/validating-admission-policy/)
and [static-Pod lifecycle](https://kubernetes.io/docs/tasks/configure-pod-container/static-pod/).

Therefore neither a new admission-policy write nor the wider aggregate proposal
is currently authorized for host execution or accepted as a working migration
procedure. No policy, cgroup or service was changed during this investigation.
