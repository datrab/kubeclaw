# Native aggregate attempt topology

Pre-edit acceptance, 2026-09-21. This is the generic ownership prerequisite from
[the Buster integration seam](buster-native-integration-seam-20260921.md), not a
completed Buster host integration or acceptance of its 71 native cases.

- NT1: All newly admitted ownership records use an explicitly versioned aggregate
  topology. The original production host and helper launch paths use owned leaves
  beneath the attempt parent. Historic leaf records remain readable only for
  drain/recovery; they cannot become new launches.
- NT2: Child names, limits and reservations are durable before creation; actual
  boot/device/inode bindings are durable before launch. Concurrent helper starts
  and finish cannot bypass the launch fence or lose a metadata CAS. All retained
  child metadata counts against the existing store byte limit.
- NT3: The parent stays empty of processes and enables controllers only inside
  newly owned groups. Pool limits, root ownership and root controller settings
  are unchanged. Trusted helper sublimits are positive and cannot exceed parent
  limits. Existing required capability restrictions are not made optional.
- NT4: The trusted launcher validates parent and leaf identities, attaches itself
  before exec, and preserves credential drop and parent-death fencing. Paths and
  executable authority do not become worker-controlled IPC inputs.
- NT5: Resource observations and terminal receipts use actual aggregate parent
  counters. Shutdown closes admission, settles pending launches, kills/drains the
  full subtree, durably retains final counters, then removes only owned leaves
  before the parent. Unknown, replaced, or unexpected nested groups fail closed.
- NT6: Recovery covers reserved/unbound empty leaves, bound leaves, and crashes
  during removal. Missing bound leaves before durable quiescence, foreign host
  identities and stale metadata cannot authorize adoption or deletion.
- NT7: Original filesystem/ownership/launcher tests run with meaningful new
  adversarial cases. Real-host tests exercise aggregate accounting, child limits,
  launch membership, full-subtree drain and partial-removal recovery. An ordinary
  directory is never evidence of cgroup enforcement; unavailable native gates
  remain failing/unverified rather than skipped or replaced.
- NT-DOC: Document the final topology, launch/recovery ordering, historical format
  handling, metadata growth and exact evidence limits. Obtain independent review.

The kernel requires leaf process placement when distributing domain controllers;
`cgroup.events` population and `cgroup.kill` cover descendants. These properties
inform the topology, but do not substitute for running its real-host tests.
[Linux cgroup v2 documentation](https://docs.kernel.org/admin-guide/cgroup-v2.html).

Before-source snapshots are in
`../../evidence/native-aggregate-topology-20260921/before-identities.json`.
Implementation is frozen for independent review; validation and its limits are recorded below. No native acceptance is claimed.

## Implemented boundary

New reservations write `worker-ownership-store.v3` with `aggregate.v1` topology.
`NativeWorkerOwnershipLease.launch` reserves/binds `host` before starting it;
`launchAuthority` serializes each uniquely reserved helper through the same lease.
The launcher accepts parent and child device/inode identities, validates their
actual relationship, attaches to the child before exec, and preserves the original
UID/GID/no-new-privileges/parent-death sequence. `KUBECLAW_NATIVE_SCOPE` identifies
the aggregate for existing host consumers.

The parent alone owns the pool reservation and authoritative observations. Child
limits are optional stricter trusted memory/task limits capped by the parent's
values; capability-specific policies are not replaced. Child records and empty
child groups remain until parent finalization. Every retained child record counts
against the original metadata byte ceiling; no new capacity or pruning is added.
Finish serializes outstanding starts, drains launchers, validates the complete
child inventory, kills/drains the parent subtree, persists the final observation,
then removes the known children before the parent. A durable empty phase permits
recovery after partial child removal. Before that phase, a missing bound child
is unresolved. Unknown/nested/replaced groups are not recursively removed.

V1/v2 readers normalize to explicit `legacy-leaf` topology. Only recovery can use
that layout; new allocation and launch reject it. Historical records are not
rewritten merely by reading them. Recovery does not enable controllers on old
leaves or adopt a live host/channel.

Kernel-documentation inspection added one necessary NT5 refinement before its
implementation: aggregate observations require hierarchical memory/task events.
The read-only covering-mount parser rejects `memory_localevents` and
`pids_localevents` before aggregate creation and during aggregate identity checks.
Legacy leaf drain is unaffected. This uses the documented mount semantics, not
summed child counters or a remount. Parser vectors are explicitly not host proof.

## Validation and case mapping

| Evidence | Actual result and scope |
| --- | --- |
| `metadata-final.txt` | 16/16 pass: original durable ownership tests plus child CAS/immutable binding/quota, strict topology, historical readers, mountinfo vectors. Real GNU flock, files and original supervisor SIGKILL test; synthetic binding values only in metadata tests. |
| `core-tests.txt` | 32/34 pass before the final mount-event guard: original reservation, journal, cancellation, launcher-lifetime and ownership cases plus the then-three new metadata cases. Two unchanged deployment authority tests fail under uid1000 because policy files must actually be root-owned. This is not a green complete node-pools gate. |
| `child-limit-mutant.txt` | Removing only strict child-limit validation in a private loader mutation causes the strict decoder case to fail with a missing expected exception. Production files were not mutated. |
| `native-typecheck-final.txt`, `prism-typecheck-final.txt`, `lint-final.txt` | Native test/production consumer typechecks and complete changed TypeScript-file canonical lint; see command manifest for final status. No rule changes or baselines added. |
| `launcher-initial.txt`, `launcher-cached.txt`, `launcher-sysroot.txt` | Initial missing compiler and extracted-sysroot setup failures retained. Actual cached GCC then compiled the original source with the original hardening flags; the test subsequently stopped at the unchanged root-owned launcher requirement. It did not prove privileged execution. |
| `native-gate-final.txt` | Original package gate executes both real-host modules and fails explicitly because required delegated-host configuration is unavailable. No successful skips or ordinary-directory substitute. |

The new real-host module maps NT1–6 to production lease launches: host and two
concurrent helpers, exact child membership, parent-empty invariant, parent task
count equal to the sum of live leaf tasks, child limit readback, wrong parent/child
launcher identity refusal, whole-subtree drain with persisted counters and removal,
unchanged root policy, interrupted child removal recovery, unknown child refusal,
unbound empty child recovery and missing-bound-child refusal. Removal interruption
is a deliberately persisted boundary, not falsely described as process SIGKILL.
The original host/accounting/capacity test remains in the gate. Old v1 fixture
construction now omits the new topology field, and its rewrite expectation is v3;
the historical readability and no-invented-observation assertions remain.

The operator runbook is updated at
[Native worker host pools](../../../operations/native-worker-host-pools.md).
The Buster dispatcher, capability routing, durable fixture transfer, progress
capacity, external BuildKit accounting and all original 71-case acceptance remain
open. No native host installation, cgroup-root mutation, cluster action or deploy
was performed. The [fresh independent review](independent-native-topology-20260921.md) verifies
the bounded lifecycle correction and retains the limits below; this is not full
NT acceptance. Positive kernel enforcement/recovery remains unverified here.

Final available checks: metadata 16/16, both typechecks exit 0 and canonical lint exit 0. The native package gate still exits 1 for missing host prerequisites. A newly added real-host negative probe initially required an explicit `SpawnSyncReturns<string>` annotation; its TS7022 failure is retained as `before-spawn-type-*`, and the corrected test retains all assertions.


## Fresh-review blocker and correction

The independent reviewer found a fixed-quota failure: an 826-byte store selected
before admission could accept the host reservation/binding, but the next
quiescing write exceeded that quota. The initial finish implementation then never
reached subtree drain. Reaping the direct launcher is insufficient to terminate
all descendants. The original failing reviewer evidence is retained separately.

The corrected `#drainOwnedSubtree` validates the owned inventory, collects launcher
or quiescing-persistence errors, and still attempts authorized subtree drain.
It propagates those errors afterward. No final receipt, deletion or successful
reservation release can follow such failure. Unknown/replaced inventory still
prevents subtree mutation. Three maintained original-store/model tests cover
fixed-capacity retry, injected I/O failure followed by restored persistence, and
unknown inventory refusal. They are JS lifecycle evidence, not kernel evidence.
The independent reviewer additionally checks launcher-drain failure and detects a
private mutation that restores the unsafe early exit.

Prepared real-host cases now include actual helper memory/task exhaustion,
leaf-local versus aggregate events, survival of unrelated leaves, pinned-inode
replacement, unexpected nested cgroups and an actual long-lived descendant drained
despite an injected quiescing persistence failure. All remain unexecuted here.

**Remaining NT2/F6 capacity-policy gap:** current-state charging does not reserve
future terminal metadata. A drained owner can remain impossible to finalize under
an unchanged saturated ceiling. Restart alone is not a resolution, and this slice
provides no safe metadata-retirement or manual editing procedure. No automatic
quota increase, record trimming, fabricated observation or capacity release is
introduced. A separately reviewed admission/headroom policy is still required;
therefore the complete topology acceptance and broader finding stay open.
