# Independent native aggregate topology review

Reviewer: `native_topology_fresh_review`, 2026-09-21. Review against NT1–NT7/NT-DOC,
B1–B5/W1–W5 and D13/D14/D16. This reviews the generic ownership prerequisite,
not full Buster integration or acceptance of its 71 cases.

## Finding and verified correction

**P1 — Metadata exhaustion prevented subtree drain; the live-descendant failure is corrected.**
In the preserved **pre-correction** source,
`FileWorkerOwnershipStore.reserveChild`/`bindChild` charge only the current
serialized state. A successful child binding can consume the available byte
ceiling without leaving room for `running` → `quiescing`, final observation or
failure diagnosis. `NativeWorkerOwnershipLease.#finish` persists `quiescing`
before calling `terminateAndDrain`. If that transition exceeds the byte quota,
it exits without invoking the subtree kill. Its attempted `unresolved` record
also exceeds the quota. Reaping directly registered launchers does not establish
that their descendants have exited. Restart encounters the same metadata limit.

Reproduction: the independent probe configures a fixed 826-byte metadata ceiling
**before admission**, then successfully runs the actual durable store through
reservation, allocation, running, host reservation and binding. `finish()` rejects
with `WORKER_NATIVE_RECONCILIATION_RECORD_FAILED`; the scope's drain method is
never invoked and the persisted record remains running. This historical reproduction is an explicit
scope-method/process model around the real store and real GNU flock, proving JS
control flow, not a pretend native host. No production limit was changed. The
existing finish ordering already had this general weakness; retaining new child
records adds a new path that consumes the headroom of a running attempt.

The corrected `#drainOwnedSubtree` accumulates launcher/persistence errors, verifies
known child identities, and still attempts subtree termination. Any error prevents
successful final observation publication, deletion and pool release. Unknown or
replaced inventory still stops mutation. This resolves the reproduced failure to
reach the drain operation; the new native descendant test remains unexecuted here.

The correction deliberately does **not** solve terminal metadata capacity.
Admission can still fill the unchanged byte quota; repeated recovery reaches drain
but cannot persist a terminal observation or dispose/release the owner. Terminal
headroom/admission policy and successful recovery at unchanged saturated capacity
remain unresolved. Neither an increased quota nor history pruning was performed
or accepted as a fix. Therefore this is narrow acceptance of the drain-on-failure
correction, not complete NT2/NT5 lifecycle acceptance.

## Independent evidence

Raw commands, logs, probes, private mutation hooks and pre-correction source
snapshots are under `docs/review/evidence/native-topology-independent-20260921`.
The exact final reviewed bytes and SHA-256 values are in
[reviewed-fixed-identities.json](../../evidence/native-topology-independent-20260921/reviewed-fixed-identities.json),
with complete source snapshots beside it. Markdown evidence uses `.md.snapshot`
so copied relative links are not interpreted as live documentation. The manifests
map original source paths to their snapshot paths; all original bytes and SHA-256
values were verified unchanged in
[snapshot-packaging-verification.json](../../evidence/native-topology-independent-20260921/snapshot-packaging-verification.json).
The fixed
`skills/worker/core/worker/native-worker-ownership.ts` SHA-256 is
`b13dcae622c5aef5a533d659e0671ef923ae7138fbfbcaa827af8bed24a700f8`.
Original defective bytes remain separately preserved in
`reviewed-identities-before-quota-fix.json` and `reviewed-before-quota-fix/`;
`probes-before-quota-fix.mts` preserves the confirming diagnostic.

- Five fresh probes pass: genuinely concurrent same-revision CAS, finish during
  host reservation, finish during helper binding with a queued helper, six
  concurrent helpers retaining all bindings, and historical launch rejection
  before any scope access. They use real metadata/files/locking and explicitly
  model scope/process methods; they establish no kernel enforcement.
- Four semantic negative controls fail at the intended assertions: removing the
  post-bind closing fence, removing helper serialization, removing metadata CAS,
  and allowing `pids_localevents`. Production sources were never mutated.
- Original node-pools package gate: initial **25/27**, then final corrected-source
  **28/30**, both exit 1. Both failures are unchanged root-owned pool-policy
  prerequisites under actual uid1000. The final run includes the three maintained
  quiescence regressions (`original-node-pools-final.txt`).
- Original ownership/observation/launcher supplement: **17/19**, exit 1. Actual
  GCC compiles the production C launcher with its original hardening flags; the
  launcher authority test then fails the unchanged root-owned binary check. The
  host identity test fails because `/etc/machine-id` is absent. Neither is a pass.
  The command accidentally included one nonexistent cancellation filename; the
  subsequent explicit cancellation/launcher run below covers the real modules.
- Original cancellation, process-launch lifetime and child metadata suites:
  **12/12**, including actual child processes and both cooperative/unresponsive
  cancellation. These do not establish cgroup membership.
- Original native-scope package gate: typecheck completed, both real-host modules
  fail explicitly for missing delegated-host configuration; **0/2**, no skips.
- A sixth diagnostic probe reproduces the quota finding, explicitly expecting
  the defective behavior so it can be preserved as review evidence. Its green
  assertion is evidence of the defect, not acceptance of the implementation.

## Source and test assessment

The implementation otherwise keeps the intended boundary: new v3 aggregate
records, durable child reservation and immutable binding, serialized helper CAS,
parent-authoritative counters and pool reservation, parent/leaf launcher identity
checks before exec, credential drop and parent-death fencing, retained child
inventory, and legacy records restricted to drain/recovery. No production root
limit, root ownership, root controller setup or executable authorization rule was
relaxed. The removed direct leaf launch path has no remaining production caller.

The first live test revision only read back helper limits. Review requested actual
helper memory/task exhaustion and parent event propagation. The refreshed tests
use actual memory touching and fork pressure, check leaf-local events against
aggregate events, preserve unrelated leaves and drain afterward. Added
replaced-inode and unexpected nested-child cases assert failed admission and
preservation of the foreign group. Review inspected these prepared tests; their
kernel behavior remains unverified. The final gate also includes an actual
long-lived descendant under an injected
quiescing-persistence failure: it asserts parent population zero, retained groups
and missing final receipt, then restores storage and runs original recovery.
These assertions are inspected/prepared, not executed in this workspace.

Final independent correction probes: **9/9** pass against the fixed source.
Beyond the five original races, they check fixed pre-admission byte saturation and
same-limit retry; complete storage EIO followed by recovery after storage returns;
launcher-drain failure still reaching the owned subtree; and unknown-child refusal
still preventing mutation. Failure retains metadata, marks settlement failed and
never removes children/parent. A fifth private semantic mutant restores the
pre-drain early throw and fails the quota, EIO and launcher-failure assertions.
These remain explicitly modeled-scope control-flow tests with the real durable
store, not kernel proof. Raw evidence: `probes-final.txt`,
`mutant-drain-on-metadata-error.txt`, `final-probe-commands.json`.

**Disposition: the live-descendant drain blocker is corrected at the reviewed
source/control-flow boundary. Terminal-capacity/admission at unchanged quota
remains unresolved. Kernel enforcement, real-host recovery, supervisor-loss
behavior and full NT7 acceptance remain unverified.** No host installation,
cgroup-root change, deployment or privileged
host action was performed. Buster dispatcher/capabilities, retained fixtures,
progress reservation, external BuildKit and all 71 original cases remain open.
