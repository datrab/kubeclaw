# Buster legacy stop producer: proposed executable contract

Proposal for coordinator review before implementation. No host action has run.
This selects one path: stop proven local writers, lock the original store, and
permanently make the original ext4 tree immutable. It does not create a second
snapshot or accept caller-supplied stopped-state attestations.

## Maintained interface and authority

Provide one root-only CLI, `scripts/buster-legacy-stop.py`, with three explicit
commands: `capture`, `seal`, and `resume`. Inputs are a root-owned fixed policy
file containing cluster context/namespace, expected Deployment/PVC/PV/Node UIDs,
expected K3s service and CLI/runtime identities, the exact backing-volume root,
and explicit byte/entry/container/operation-time limits. A policy cannot replace
observations with booleans. The service namespace remains fixed at
`/var/lib/buster-v2/plan-jobs`; new writes belong to sibling `plan-jobs-v2`.
Unsupported topology or missing evidence fails before mutation.

Transactions live under root-owned `/var/lib/kubeclaw/buster-legacy-migration/`,
with no symlink/writable ancestors. An exclusive GNU flock serializes the entire
transaction. Capture/intent/phase/receipt files are bounded, atomically replaced
and fsynced with their directory. Full immutable terminal receipt bytes must fit
the declared metadata quota before mutation. Stdout contains one strict JSON
receipt only on completed durable sealing; diagnostics and failed phases go to
stderr. Neither `capture` nor a failed `seal` prints an import-authorizing receipt.

Initially support the normal installed systemd `k3s.service` on a single K3s
server node, bundled containerd at its pinned Unix socket, and a local-path PVC
whose backing filesystem is ext4. Reject external containerd, custom service
aliases/drop-ins, multi-node/shared/RWX storage, overlay/FUSE/NFS, unverified
mounts, privileged/host-PID/host-device workloads and unknown cgroup-v2 layouts. The old browser delegation outside the Pod is part
of the supported scope, as specified below, not an optional extra.
A declared RWO access mode alone is insufficient. Node/PVC identity and complete
consumer discovery must corroborate this restricted topology.

## Capture: read-only actual observations

Use absolute, policy-bound `k3s` and `systemctl` executables. Record their hashes
and version outputs. Capture full JSON from `k3s kubectl get node`, `get pvc`,
`get pv`, `get deployment` and the complete namespaced Pod list, binding every
UID/resourceVersion/generation and all PVC consumers. Reject continuation,
unknown consumers, conflicting controller ownership and transient generations.

Use `k3s crictl version`, `pods -o json`, `ps -a -o json`, `inspectp ID` and
`inspect ID` against the exact bundled endpoint. Reconcile complete sandbox and
container IDs with Pod UIDs and image digests, not just names or labels. Inspect
runtime mounts and prove their original backing directory matches the expected
PVC device/inode and fixed namespace. Unsupported/missing inspect fields fail;
JSON shape support must be established against the selected real runtime before
claiming integration acceptance.

For every running captured container, bind init PID plus `/proc/PID/stat` start
time, boot ID, exact `/proc/PID/cgroup` v2 path, and cgroup device/inode. Retain
opened directory/events handles for `seal`'s current observation. A saved capture
file is only an expected-identity input: `seal` must recapture and require exact
agreement before stopping anything. Unknown non-running or vanished ownership
is not silently treated as positively drained.

The real old Buster configuration additionally mounts host
`/sys/fs/cgroup/kubeclaw-buster-browser` at
`/var/run/kubeclaw-browser-cgroup`. Browser tasks may therefore leave the Pod
subtree. Capture this exact allowlisted mapping from the actual Pod hostPath and
runtime mount, verify the dedicated host root's device/inode and trusted ancestry,
and retain its cgroup/events handles before stopping. Reconcile all consumers of
that hostPath; reject another workload, alternate mapping, shared/unknown owner,
nested mount or unknown external delegation. Capture the dedicated subtree's
process identities as well as the CRI container subtrees. The policy cannot name
an arbitrary host cgroup to adopt. Pod-only quiescence is insufficient.

Capture the host machine/boot identity, filesystem/mount identity, fixed store
root identity, exact installed K3s unit bytes/mode/owner and its systemd unit
properties. Do not hash changing store contents as a final seal before writers
are stopped and original locks acquired.

## Seal: restart exclusion, stop, original locks, immutable tree

1. Durably record `captured` with all identities and the bounded restoration copy
   of the supported original unit. Reject existing masks or unexpected unit paths.
2. Establish persistent restart exclusion for the exact service, preserving its
   original file under the transaction and installing the `/dev/null` mask
   atomically in its authoritative system-unit path. Reload systemd and require
   actual `LoadState=masked`. A runtime-only mask is not assumed to override an
   existing `/etc/systemd/system` unit. Record `restart-fenced` durably. No
   unrelated unit or global networking reset is performed.
3. Request `systemctl stop k3s.service`, require the service to become inactive,
   and confirm its process lifetime ended. This does **not** prove container
   stop: K3s deliberately leaves containers running on service stop. The captured
   runtime identities remain essential, even if the socket is now unavailable.
4. Revalidate each retained cgroup identity before kernel action. Kill each full
   captured legacy container subtree and the separately captured fixed browser
   delegation subtree using cgroup-v2 `cgroup.kill`, then wait
   under the configured deadline for hierarchical `populated=0`. Verify captured
   PID/start-time identities are gone. Do not remove/adopt foreign cgroups or
   count a missing/replaced group as quiescence. Require every possible captured
   local PVC writer to be covered, including browser descendants outside the
   Pod cgroup. Both classes require positive empty-subtree observations. Persist `writers-quiescent` only after positive
   observations. Privileged escape or incomplete discovery is unsupported.
5. Acquire the actual original GNU flock files, in original admission order:
   `plan-jobs/.write-lock`, `plan-jobs/records/.write-lock`, then
   `plan-jobs/results/.write-lock`. These follow the real job-admission,
   FileDurableRecordStore and blob-budget lock paths. Open existing single-link
   regular files without symlink following; never replace a lock inode. A valid
   accepted-only store may lack lazily created result storage. After proven
   writer stop, create only a missing required lock/directory with O_EXCL and
   parent fsync, record that creation, and charge it to the tree limits. Hold all descriptors until durable sealing is complete.
6. Under restart exclusion and locks, preflight the bounded complete tree and
   establish its final root-owned read permissions. Reject symlinks, special
   files, multiple hardlinks, nested mounts, cross-filesystem entries and changed
   identities. Preserve all data; do not prune historical records or results.
7. Set `FS_IMMUTABLE_FL` on every retained regular file and directory, deepest
   entries first and namespace root last. Include existing writer lock files.
   Read back flags and fsync. A partial seal is a failed in-progress transaction,
   not an import receipt. Store bytes themselves are not rewritten. Independently inventory and seal the
   retained `runs` root too: the old recursive chown targets both roots. Keep its
   artifact bytes and separate digest/counts in the receipt; unsupported types
   fail closed rather than being discarded.
8. Invoke the maintained read-only immutable-tree verifier under actual root with
   the narrow importer capability set (including no CAP_LINUX_IMMUTABLE). Bind
   its full inventory/store digest and counts to this producer's stop identities.
   Persist and fsync the completed receipt, and publish its exact bounded bytes
   to the fixed PVC sibling `legacy-migration/<transaction-id>/receipt.json`
   under trusted root-owned ancestors. Verify both copies before completion. Only then may original locks close
   and the exact original service unit be restored with daemon reload. Do not
   automatically start the service. A restarted old entrypoint must fail its
   recursive chown against the immutable namespace in a real guest regression.

Holding an old FD or mapping is not assumed harmless merely because flags were
set: positive stop is a prerequisite. Conversely, actual immutable flags prevent
new writers after the maintenance exclusion ends only under the verified runtime
capability bounding set. Old/new container profiles must exclude immutable,
mount/raw-device and equivalent bypass authority. The importer rechecks flags,
identity and digest rather than trusting the receipt in isolation.

## Strict receipt shape

`buster-legacy-stop-seal.v1` contains producer version/digest, transaction ID,
node machine/boot identity, runtime endpoint/version identity, workload/PVC/PV
UIDs and capture digest, the exact bounded writer identity/quiescence array (including the fixed external
browser delegation mount and cgroup identity),
original lock inode identities, fixed store root device/inode/mount identity,
original `records/store.json` digest/device/inode/bytes, full immutable-tree
inventory digest and counts plus separate retained `runs` inventory and counts, terminal timestamp and receipt digest. It also
binds the original service-unit digest and restart-fence transaction generation.
No `ok`, `stopped`, hand-edited receipt or stdout from a failed command is accepted.
Exact field/string/array limits are validated before capture persistence and
again by the importer. The root-protected producer directory supplies authority;
the receipt digest supplies integrity, not a cryptographic claim about a person.

## Crash resume and supported failures

`resume` accepts only an existing root-owned transaction ID. It verifies boot,
unit/fence, original store and captured runtime identities before continuing.
While no terminal receipt exists, it leaves the persistent restart mask in place.
It may repeat identity-checked kernel drain and idempotently finish setting flags
on the same preflighted entries; it cannot rescan a changed tree and reuse an old
capture identity. A changed boot, disappeared/replaced unproved cgroup, missing
lock inode, changed inventory or unexpected service restart remains fenced and
requires a new explicitly planned recovery, not inferred success.

Once a durable completed receipt exists, resume revalidates the immutable tree
and original unit restoration identity, then can finish restoring the exact unit
without starting it. Conflicting receipts or changed unit files fail closed.
A failure after mask installation can therefore leave intentional maintenance
unavailability. This contract does not promise automatic recovery from evidence
loss; it promises no fabricated import authority or unsafe restart.

Fresh acceptance requires actual ext4 flags, old writable-FD descendants, actual
service restart exclusion, exact-capability old-entrypoint restart failure,
partial-seal crashes, lock contention and malformed/foreign runtime observations.
CLI fixtures establish rejection behavior only. No production stop action will
be used as a test, and no actual K3s/containerd stop integration is claimed until
its bounded real-runtime proof exists.

## Implementation acceptance declared before edits

| ID | Required boundary |
| --- | --- |
| LP1 | Strict bounded root-owned policy; fixed namespace/receipt paths; unknown fields/topologies/states rejected before mutation. |
| LP2 | Actual CLI capture binds node/PVC/workload/container and fixed external browser cgroup identities. No absence-as-stop inference. |
| LP3 | Durable restart exclusion precedes stop/drain; positive identity-checked quiescence for every captured root; failed stop leaves exclusion. |
| LP4 | Original lock inodes preserved; valid lazy absence handled only after stop; all created entries charged. Both historical roots preserved and independently sealed. |
| LP5 | No receipt until complete inode/flags/digest verification; host and fixed PVC receipt copies identical; quotas checked before publication. |
| LP6 | Resume never recaptures changed identity under an old transaction; historical failures retained; real filesystem/protocol tests distinct from unrun privileged integration. |
| LP-DOC | Operator procedure states fixed support, maintenance impact, partial-failure recovery and exact unproved kernel/CRI/systemd boundaries. |

The initial implementation is not full runtime acceptance. Actual systemd/CRI,
container-to-external-cgroup and ext4 mutation tests remain mandatory in a
separately reviewed disposable environment. No production host command is run
while implementing or locally testing this producer.

## Implementation checkpoint (not accepted)

The current Python implementation is still under construction. Its unprivileged
suite has 14 passing filesystem/protocol cases. These cover strict policy inputs,
child status/output bounds, original lock inode preservation and lazy lock
creation, inert runtime-link inventory, byte limits, private abandoned scratch
recovery, terminal metadata capacity, and rejection of a non-root CLI invocation.
They do not execute systemd, CRI, cgroup kill, ownership changes or immutable flags.

Completed-tree identity uses the verifier's nonzero filesystem UUID and inode /
inventory digest. Captured device and mount IDs remain provenance and current
traversal checks; they are not compared across completed-import mount namespaces.
Runtime symlink target text is inventoried and charged without traversing or
claiming protection of its target. The link itself is assigned root ownership
before its parent is made immutable. Plan-store symlinks remain unsupported.

Before sealing, the implementation reserves metadata from the serialized final
state framing and the separately enforced receipt byte ceiling, including old
and replacement state/receipt coexistence during atomic writes. It does not raise
the configured transaction quota. All captured cgroup directories are opened and
identity-checked before the first kill, and kernel files are accessed relative to
those retained descriptors.

Outstanding author work includes full capture/restart-exclusion validation,
crash-state and partial-publication tests, exact final field validation, and the
operator runbook. The current source must not be treated as an accepted migration
producer. LP1–LP6 and privileged integration remain open pending completed source,
fresh independent review, and the actual runtime proofs described above.

The draft additionally compares the complete captured CRI sandbox/container ID
inventory after K3s is inactive, before draining. Newly created or missing runtime
identities therefore reject the stale capture; unrelated runtime churn can also
require a new maintenance capture. This conservative single-node restriction is
not evidence that an unavailable CRI endpoint is safe: endpoint failure rejects.

## Selected-runtime blocker found during source investigation

The current post-stop CRI inventory requirement cannot be presented as a working
success path for the recorded K3s `v1.36.4+k3s1` installation. In that exact upstream
version, bundled containerd is started with a context-bound command, and its Linux
child process receives a parent-death SIGKILL setting. The installed unit template's
`KillMode=process` therefore does not establish that containerd or its CRI socket
survives K3s exit. See the versioned [containerd launch source](https://raw.githubusercontent.com/k3s-io/k3s/v1.36.4%2Bk3s1/pkg/agent/containerd/containerd.go)
and [Linux parent-death configuration](https://raw.githubusercontent.com/k3s-io/k3s/v1.36.4%2Bk3s1/pkg/agent/containerd/command.go).

This is a concrete lifecycle incompatibility in the draft success protocol, not
an absence-as-quiescence allowance. The existing check stays fail-closed. No
mocked CRI response is substituted, and no actual K3s stop was executed. Before
further implementation or acceptance, the stop ordering needs a reviewed,
version-specific way to close the capture-to-stop writer race without depending
on an endpoint whose owning process is terminated. Source snapshots and hashes
are retained under the producer evidence's `k3s-lifecycle` directory.
