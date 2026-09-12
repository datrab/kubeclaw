# PR 6 native scope implementation checkpoint

Status: incomplete; no finding is closed by this checkpoint.

The user approved generic ownership mechanisms in Worker Core, Buster-owned
fixture lifecycle, separate Prism attempt execution, and dedicated delegated
cgroup areas with explicit total budgets. No deployment or host mutation ran.
The central settings audit remains a separate roadmap item.

## Implemented primitive

Worker Core now exposes `NativeWorkerResourceScope`. It creates only child
scopes under an explicitly configured, empty, controller-delegated cgroup v2
root; it does not change delegation, permissions or mounts. Memory, swap and
task ceilings are verified by reading them back. Kernel counters retain their
explicit Linux-task unit, cumulative CPU microseconds and memory/task peaks.
Missing counters fail. Ordinary directories cannot emulate an accepted cgroup.

Termination uses `cgroup.kill`, waits for the subtree's `populated` counter to
clear, and keeps counters until explicit disposal. Scope operations verify the
directory device/inode. A timeout retains the scope instead of claiming it was
removed. This primitive is not a durable ownership registry, launcher, contract
migration or engine integration; it is not sufficient to establish attempt
ownership or prevent a trusted caller from reattaching a process after drain.
The eventual coordinator must fence admission/launch before drain and disposal.

## Local checks

- `node --test tests/verification/reliability/worker-native-observation.test.mts`:
  3 passed, 0 failed, 0 skipped. Reads actual test-container cgroup counters and
  executes actual CPU work; also rejects filesystem substitutes, host roots and
  invalid limits. It does not prove isolated per-attempt accounting.
- `node_modules/.bin/tsc --noEmit -p skills/worker/core/tsconfig.json`: passed.
- Canonical ESLint on both native modules and the new test: passed.
- `git diff --check`: passed.

The current test container mounts cgroup v2 read-only:
`cgroup2 on /sys/fs/cgroup type cgroup2 (ro,nosuid,nodev,noexec,relatime,nsdelegate)`.
No `KUBECLAW_WORKER_TEST_CGROUP_ROOT` is configured. Positive child-scope
allocation, native launch, aggregate enforcement, descendant termination and
restart recovery have not run. No remount, privilege escalation or substituted
kernel provider was attempted. These tests must not be reported as passing.

## Additional ownership metadata and executable native test

`FileWorkerOwnershipStore` now persists neutral claim/profile/spec identities,
reserved scope names, native identity bindings and revision-fenced lifecycle
metadata using the existing fsync/rename and kernel flock primitives. Duplicate
reservations converge; conflicting claims and stale revisions fail. Unresolved
ownership blocks a replacement generation. Disposed identity records remain
present for replay. Corrupt files and exhausted quotas fail without overwriting
existing records. This metadata API is not itself kernel ownership evidence and
is not yet wired to the native coordinator or either engine.

The combined original terminal-resource suite, native-observation suite and new
real-filesystem ownership suite pass: 16 tests, zero failures or skips. The
ownership suite includes competing store instances, reopen, caller mutation,
CAS/phase conflicts, unresolved ownership, quota atomicity and retained corrupt
bytes. These are storage tests, not a claim of native restart recovery.

`npm run verify:worker-core:native-scope` is now an executable live gate. It
requires `KUBECLAW_WORKER_TEST_CGROUP_ROOT` and fails explicitly if absent. With
a delegated test root it starts two real Node workloads in separate cgroups,
compares their CPU usage and checks forced drain, retained counters and disposal.
Its controlled test fixture joins before its CPU workload; it is not a substitute
for the production pre-execution launcher. The positive native gate remains
unexecuted here. There is no sampled or fake-cgroup fallback.

## Remaining integration work

Persist and reconcile scope ownership under service/claim fences; implement the
trusted pre-execution launcher and host protocol; migrate task contracts and
profiles explicitly; seal terminal observations after quiescence. Integrate
Prism input/render/upload work and Buster capability/adapter work, then add the
Buster fixture lifecycle and restart cleanup. Implement and verify the remaining
cross-store history-retirement operation. Charts and operating instructions for
the full native host path are also still pending. PCR-BUSTER-ENGINE-001,
PCR-BUSTER-ENGINE-004, PCR-PRISM-WORKER-002 and PCR-OBS-002 remain open.

## Continued native execution implementation

This checkpoint is still **WIP, not closure of any of the four findings**.
The production Prism entry point and Control producer have not switched to V3.

The native scope now supports durable reserved names, native directory identity
and boot identity reconciliation. The ownership coordinator holds a real flock
for its lifetime, reconciles old scopes before exposing admission, fences launch
against shutdown and duplicate identities, and records abandoned reservations
without claiming successful execution. Confirmed-empty disposal recovery keeps
its durable proof when the final metadata update fails.

A compiled C pre-exec launcher joins the reserved kernel scope before starting
the Node host, drops supplementary groups and root identity, and sets
no-new-privileges. Ordinary filesystems, host-root paths, malformed scope names
and retained privilege are rejected. The process supervisor bounds input/output,
polls cumulative kernel counters, stops the native tree on deadline or budget
failure, and obtains final counters after quiescence. Explicit native V3
envelopes and receipts name `maximumTasks` with unit `linux-tasks`; V1/V2 remain
separate historical protocols. The neutral executor supports V3 and the outer
native executor reseals provisional host results after the complete host exits.

Prism has a native host entry, shared producer/worker policy, a V3 envelope
producer, and a native HTTP execution boundary. It reuses the original Prism
operation, cancellation, browser closure and full-log upload lifecycle. All four
Prism Dockerfiles now copy the Worker Core's transitive Foundation/SDK runtime
dependencies. The current production startup remains unchanged pending the
complete deployment and lifecycle integration; no automatic legacy fallback
has been added to the native execution boundary.

Local verification: 48 tests passed, zero failed/skipped, using the command below.
The new coverage includes real durable files, a real supervisor SIGKILL and
kernel flock release, compilation and fail-closed execution of the original C
launcher, original kernel resource observations, and strict version/unit
validation. Existing Prism HTTP, artifact, CPU, cancellation and shutdown
regressions also passed. Worker Core and Prism TypeScript checks passed. Both
generated resource schemas matched their generators. New modules pass canonical
ESLint; the old monolithic attempt executor still has its existing complexity,
size/depth and catch-policy debt. No successful global lint gate is claimed.

```sh
node --test tests/verification/reliability/worker-terminal-resources.test.mts tests/verification/reliability/worker-native-observation.test.mts tests/verification/reliability/worker-ownership-store.test.mts tests/verification/reliability/worker-native-launcher.test.mts tests/verification/reliability/worker-native-contract.test.mts skills/prism/tests/worker-service.test.mts skills/prism/tests/worker-http-cancellation.test.mts skills/prism/tests/worker-cancellation.test.mts skills/prism/tests/worker-shutdown-boundaries.test.mts skills/prism/tests/agent-resource-contract.test.mts
```

The native live gate additionally exercises the original production launcher and
durable coordinator. It requires both `KUBECLAW_WORKER_TEST_CGROUP_ROOT` and
`KUBECLAW_WORKER_TEST_LAUNCHER`; it does not substitute ordinary directories or
skip missing delegation. Positive delegated-scope execution remains for the
operator's final live run and is not claimed by the local negative tests.

Remaining implementation includes production V3 activation and historical-cache
read support; persistent host outcome/log recovery; delegated-node preparation,
aggregate resource budgets and charts; Buster's full per-attempt host integration
and ownership of its nested capability processes; durable retained-fixture
lifecycle and terminal workspace reconciliation; and connected cross-store
retirement. In particular Buster currently persists a successful fixture setup
attempt before dependent nodes run, retains the provider instance, and cleans
it up only after the plan. That existing lifecycle must be reconciled explicitly
with native resource ownership, rather than killed by the generic process
supervisor as soon as setup returns.
