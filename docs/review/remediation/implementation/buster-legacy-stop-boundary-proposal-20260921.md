# Buster legacy writer stop boundary: independent design review

A stopped-state JSON file cannot independently authorize later import in a new
Pod. It records a past observation; it cannot prevent K3s recreating a legacy
writer or revoke an already open file descriptor. The smallest defensible
supported path is an external root maintenance transaction that holds restart
exclusion through positive writer quiescence and root-owned source sealing.
The new Pod consumes the sealed snapshot, not a promise that the old live PVC
will remain unchanged.

This is a proposal only. No workload, service, container or host was stopped.
The existing CLI observations and Core owned-scope primitives are useful evidence
patterns, but no existing repository producer establishes this legacy boundary.

## Supported narrow procedure

Initially support one node and a node-local PVC with a known filesystem backing
`/var/lib/buster-v2/plan-jobs`. Resolve PVC/PV UID, volume source and actual mount;
reject RWX, remote/shared filesystems, unknown additional mounts/writer nodes,
privileged or host-PID legacy containers and unknown cgroup containment. Access
mode RWO alone is not an exclusive-writer proof.

Before mutation, capture exact desired workload UID/generation/template digest,
Pod UID/node, CRI sandbox and every container ID/image digest, runtime endpoint
and version, init PID plus start time, and corresponding cgroup-v2 path/device/
inode. Bind the store's filesystem identity and original writer-lock paths.
Status and stdout must both validate; missing/unknown runtime observations do not
become empty inventories. Pending/restarting containers invalidate the snapshot.

Enter externally managed node maintenance with a root-owned restart fence held
by the producer. Stop K3s reconciliation and prevent its restart for the entire
transaction. This is deliberately a maintenance operation, not a new Pod's
self-declared state. K3s explicitly documents that
[containers keep running when its service stops](https://docs.k3s.io/upgrades/killall).
Its killall script also resets networking and runtime state, so invoking it is
not the minimal Buster-only stop proof.

While the captured runtime remains inspectable, request stop of each exact
legacy container through the pinned CRI endpoint. Positive completion still
requires identity-checked kernel quiescence: hold/open the captured cgroup
identity, stop/kill the full subtree when necessary, wait for hierarchical
`cgroup.events populated=0`, and confirm captured process identities are gone.
A successful CLI exit, missing Pod or missing cgroup is not a substitute.
Containerd's [versioned task kill implementation](https://raw.githubusercontent.com/containerd/containerd/v2.2.0/cmd/ctr/commands/tasks/kill.go)
provides task signaling; it does not by itself prove an empty owned subtree.
Reuse Core's identity-before-drain principle, not its ownership registration for
foreign legacy groups. Unknown/replaced groups must not be adopted or removed.

After quiescence, retain restart exclusion and acquire the original writer locks.
Read the complete store under those locks, verify no unexpected file types/hard
links, and bind the inventory digest to actual directory/file identities. Seal
or complete the offline import before releasing exclusion: a fresh root-owned
snapshot with trusted ancestors, inaccessible write authority for legacy/service
UIDs, fsynced content and atomically published manifest. The root producer's
receipt references that sealed snapshot and original store identity. The original
PVC is preserved. Existing V1 data is not deleted by this stop transaction.

If cgroup capture/containment cannot be positively proved, fail the online-stop
path. The simpler stronger fallback is a separately planned reboot into a
maintenance boot where K3s and the legacy runtime never start, followed by
host-side sealing/import before normal startup. A changed boot kills prior
process lifetimes, but it does not prove remote writers absent; the single-node,
local-volume restriction remains. Do not infer a completed stop from an
arbitrary changed boot without the maintained boot fence and source binding.

## Minimal receipt and consumption

A strict versioned receipt should contain only these bound facts:

- `schemaVersion`, producer/tool digest, unique transaction ID and transaction mode.
- Node identity and boot ID; runtime endpoint identity and exact CLI/runtime versions.
- Workload/Pod/sandbox/container identities, image digests and captured PID/start-time
  and cgroup device/inode observations, with terminal observations or the explicit
  maintenance-boot transition evidence.
- PVC/PV identity, original canonical store identity and complete inventory digest.
- Sealed snapshot directory device/inode, manifest digest and bounded bytes/records.
- Original writer-lock set digest, maintenance-fence generation, durable seal time,
  and receipt digest excluding its own digest field.

There is no `ok`, `stopped` or caller-supplied boolean authority. A checksum alone
is not authentication: producer and receipt live under root-protected ancestors
with strict ownership/link checks. The new importer revalidates the sealed
snapshot digest and exact receipt/source association under its root-owned ledger
CAS, then records consumption idempotently. A receipt for the mutable original
store alone is insufficient. If the chosen design insists on importing that
original in a new Pod, it additionally needs a live authenticated host fence
held through import; that is more machinery than the sealed-snapshot path.

## Mandatory rejection and evidence boundaries

Reject unknown writer nodes, changed Pod/container generation, missing prior
cgroup identity, PID reuse, replaced/nested-unknown groups, nonempty final subtree,
CLI failure/malformed response, restarted controller, changed boot during an
online transaction, changed store/inventory, stale fence/CAS, missing locks,
foreign receipt, duplicate conflicting consumption and unsealed crash states.
A crash before seal leaves no importable proof. A crash after durable seal allows
idempotent replay of the exact snapshot; it never authorizes recapturing mutable
data under the old receipt.

Fresh tests must use actual kernel descendants holding writable FDs, demonstrate
that stop removes them and that attempted restart is fenced until sealing, and
exercise crash points around manifest publication. Real CRI/containerd fixture
execution must validate the pinned output shapes and stop behavior; fake CLI
fixtures can test rejection only. Current disposable native-scope proofs do not
establish this K3s legacy-producer integration. No existing D12/Buster acceptance
is closed by this design.

## Smaller permanent ext4 fence candidate

A permanent `FS_IMMUTABLE_FL` seal is a viable narrower alternative to holding
runtime exclusion until the entire import finishes. It still requires the real
stop and original writer locks before sealing. For a fixed local ext4 namespace
whose legacy contents become read-only, it can avoid both a second snapshot copy
and a live host-fence protocol between the importer Pod and the maintenance host.
It is not yet an implemented or kernel-tested acceptance claim.

The Linux [VFS flag-change implementation](https://raw.githubusercontent.com/torvalds/linux/v6.12/fs/ioctl.c)
requires `CAP_LINUX_IMMUTABLE` to alter the immutable flag, and
[attribute changes](https://raw.githubusercontent.com/torvalds/linux/v6.12/fs/attr.c)
reject ownership/mode changes on immutable inodes with EPERM. Consequently an
old entrypoint's recursive chown should fail when it reaches the sealed legacy
root, even if its UID is zero and it has CAP_CHOWN. That is a useful restart
negative control, not the entire security argument.

The seal must cover **every retained regular file and directory**, including
record/tombstone files and the namespace root. An immutable directory prevents
entry changes but does not make existing children immutable. A tombstone-only
flag, immutable parent alone, or reliance on chown failing before arbitrary old
writer code runs is insufficient. Reject symlinks, unexpected mounts/filesystem
boundaries and ambiguous hardlinks. Keep trusted ancestors fixed against rename
or replacement; bind actual mount, directory and inode identities in the receipt.
Set final ownership and read permissions before flags, then flush and verify
flags plus the full inventory digest before ending restart exclusion.

This depends on actual old and new runtime capability bounding sets excluding
CAP_LINUX_IMMUTABLE, not merely a configured effective set. UID switching through
the old file-capability helper must not regain it. Exclude privileged containers,
CAP_SYS_ADMIN mount substitution, raw block-device access and other host-root
writers from this narrow support contract. A container-local mount hiding the
fenced tree must never be accepted as the original volume identity. Test the
real rendered capability profile rather than an unrestricted guest-root process.

Read-only result retrieval can continue if the read ACL/mode is established
before sealing. Retention, compaction, deletion, lock-file replacement and result
updates beneath this tree cannot continue. New V2 records, mutable locks,
receipts and results belong in a separate sibling namespace; the importer must
not clear immutable flags or resume recursive chown. If current result handlers
still update the legacy tree, this option shifts that migration work rather than
removing it. It is therefore simpler only when permanent read-only legacy
semantics are acceptable. Operational reclamation later requires a separate
host maintenance procedure; do not present automatic old-data deletion as solved.

Required guest evidence is actual ext4 ioctl flag readback, failed flag clearing
under the exact container capabilities, unchanged bytes after writes/truncate/
rename/unlink/chown attempts, and the actual old entrypoint refusing restart.
Keep writable-FD and mmap holders in explicit negative tests: the flag must not
be assumed to revoke existing writable mappings. Real stop/quiescence is still
a prerequisite. Prove no old writer survives, then prove the permanent seal
prevents a newly started legacy writer from reopening mutation. Test interrupted
partial sealing and missing-file flags; neither may publish a completion receipt.
The importer must recheck exact store identity, all required flags and the bound
digest; a receipt alone cannot replace those checks. Unsupported filesystem,
RWX/multi-node writer authority or incomplete flag coverage fails closed.
