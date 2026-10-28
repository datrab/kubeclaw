# Recover an Accepted Native Worker Attempt or Retain the Stop

Status: source-backed native recovery procedure. Local journal/lock crash controls are separate from delegated-host execution
Audience: worker, Prism service and storage operators
Owner: Worker Core and native worker host maintainers
Evidence: skills/worker/core/worker/native-attempt-executor.ts; skills/worker/core/worker/native-attempt-recovery.ts; skills/worker/core/worker/native-attempt-journal.ts; skills/worker/core/worker/native-worker-ownership.ts; skills/prism/server/worker.ts; skills/prism/server/native-worker-execution.ts; tests/verification/reliability/worker-native-journal.test.mts
Applies to: native Worker v3 attempt/result path, not Buster Worker v1 or the portable executor
Last verified: 2026-10-21. Source and actual local journal/ownership crash tests. No delegated-cgroup live recovery execution

## Bind the attempt before interruption

The native supervisor owns process termination and the final Worker result. The
specialist's output alone cannot establish safe cleanup, final resource usage
or a sealed result. Select the exact [Worker contract/version](../../understand/worker-core.md#contract-and-version-model)
and [native launch boundary](../../understand/worker-core.md#native-launch-and-trust-boundary)
before using this procedure. A portable executor result or Buster v1 attempt is
not interchangeable with Prism's native v3 path.

For an actual controlled native-host exercise, first register one disposable
non-production attempt. The registration must include its original worker ID,
attempt ID, claim ID, generation, profile digest, attempt-spec digest and complete input envelope.
The owning service must submit through its supported authenticated dispatch
path. There is no generic `worker recover` or arbitrary raw-result import CLI
in this procedure. Do not handcraft an HTTP request or copy a fixture envelope
to bypass that service's source, claim or authorization checks.

Require the host operator to identify each of these actual prerequisites:

- The cgroup-v2 root, private ownership root and attempt-journal root.
- The trusted node-identity file and pool policy.
- The launcher and UID/GID.
- The engine content identity, storage quotas and exclusive supervisor.
Use the current [native configuration and version contracts](../../understand/worker-core.md#host-and-runtime-identity)
and the owning deployment configuration reference. Retain paths and logical
secret references, not credential values. An ordinary writable directory is
not a cgroup. A persistent volume mounted on another node does not prove that
processes on the old node stopped.

If any authority or required host resource is unavailable, stop. This is a
specific safe stop: host/node owner must establish delegated kernel scope and
stable identity. Worker/storage owner must establish exclusive original stores.
Calling-service owner must bind the submitted envelope and its accepted state.
Do not call a storage-only test native workload execution.

## Follow the durable boundaries

1. **Accepted input:** the journal persists canonical input and immutable
   accepted identity before launch. Record the exact acceptance, not merely an
   HTTP response or a queued task. Admission failure before acceptance is not
   the accepted-attempt interruption scenario.
2. **Ownership:** the supervisor reserves capacity and binds the exact attempt
   to a kernel scope. Preserve ownership phase, scope name, node/boot identity,
   device and inode. Do not infer ownership from a PID or matching directory
   name. Unknown or conflicting ownership stops admission.
3. **In-flight output:** the supervisor spools original binary stdout/stderr
   under the journal output root. Output can contain confidential original
   diagnostics. Preserve its permissions and full byte identity. Rendered logs
   are not a replacement. A provisional specialist result is not sealed.
4. **Controlled interruption:** only the registered host owner may stop the
   selected supervisor/workload in its approved window. Use that deployment's
   actual process control and confirm observed exit. This procedure supplies
   no universal kill command because a host PID alone does not bind a kernel
   scope or external cleanup. Keep the caller's original claim/input and any
   connection loss, without creating a new generation to evade contention.
5. **Preserve:** stop new admission and preserve complete original ownership,
   journal, input, spool and any result/process blobs with the owning stores
   fenced. Keep startup/error output and actual exit observations. Do not edit
   phase, counters, input identity, output bytes or result digest to force
   recovery. An integrity failure retains the original bytes and stops.
6. **Owned restart:** the owning service starts one supervisor with the same
   host identity, scope root and stores. Prism's actual worker startup enters
   `NativeWorkerOwnership.supervise`, then runs journal reconciliation before
   it exposes HTTP admission. Do not start a second supervisor or move the
   stores to make readiness green.
7. **Evaluate recovery:** compare the exact cases below. A service that remains
   fenced has not recovered admission merely because its process is running.
   Observe its retained diagnosis and original-attempt result through the
   owning caller. Do not synthesize or submit a replacement result.

## Interpret the original-attempt result

Ownership recovery first kills and drains a current matching scope and retains
final counters. After validating the root-managed host identity, recovery moves
an `empty` record with no scope to `disposed`. A missing scope with no binding
or a prior-boot binding becomes `abandoned`, with its retained diagnosis. An
unexplained missing scope for a same-boot bound nonempty record stops recovery.
An unrecorded scope, reappearing retired scope or changed binding also stops it. The full state map remains in
[Restart and Reconciliation](../../understand/worker-core.md#restart-and-reconciliation).
After that ownership boundary:

- **A sealed result already exists:** exact replay returns that result without
  new admission or re-execution. Verify full envelope/result binding and digest
  through the owning caller. Same attempt identity with changed content is a
  conflict, not a new job.
- **A durable process result exists:** reconstruction requires ownership phase
  `disposed` and exact equality between stored final ownership observation and
  process resource counters. The journal also verifies original spool bytes.
  Only then may the supervisor finalize and seal the original attempt result.
- **Accepted input exists but no process result:** quiescent or never-launched
  ownership must be established. Recovery seals `state: errored` with
  `WORKER_NATIVE_INTERRUPTED_RESULT_UNAVAILABLE`, not a fictional successful
  specialist result and not the portable executor's `interrupted` state.
  Proven never-launched work has `cleanup.state: not_required`. Otherwise
  cleanup is `failed`: killing the process tree cannot prove cleanup of
  specialist external effects. Failed cleanup fences new admission.
- **Ownership/output cannot be proved:** errors such as
  `WORKER_NATIVE_JOURNAL_OWNERSHIP_UNPROVEN`,
  `WORKER_NATIVE_RECOVERY_NOT_QUIESCENT`, output corruption or a journal conflict
  retain the stop. Preserve both stores and obtain the host/storage/specialist
  owners' reconciliation. Do not delete the journal, clear its lock or relabel
  it as a new generation.

A seal proves a bound terminal Worker receipt, not application success. An
`errored` sealed result and an explicit fenced stop are legitimate recovery
outcomes. Before new work, reconcile specialist side effects under their owning
contract and retain the prior receipt and cleanup decision. No generic command
here clears an unresolved admission fence.

## Reproduce the local storage/crash controls

From a selected checkout with Node.js 24, GNU `flock` and locked development
dependencies, run the actual local journal/ownership suites:

```bash
env -u NODE_ENV node --test \
  tests/verification/reliability/worker-native-journal.test.mts \
  tests/verification/reliability/worker-ownership-store.test.mts
```

This command explicitly selects the development fixture environment. It is not
a way to weaken a running production worker's identity checks. In production,
missing `PRISM_ENGINE_CONTENT_DIGEST` correctly rejects before Prism profile
imports. Use the real installed engine image identity, not an invented digest.

The local journal tests start real writer children, wait for durable accepted
or sealed state, contend on the production `flock`, then send `SIGKILL` to those
owned writers. Original identity and binary diagnostic output survive. Exact
sealed replay returns the original result. Changing an already sealed receipt
rejects. A separate accepted-without-result case remains accepted with no
invented result.

The tests also reject changed envelope identity, retained disk
overflow, changed spool bytes and live contention. Ownership tests verify
convergence, durable phases, conflicts, unresolved stops and a real supervisor
lock. Their ordinary-directory bindings test storage only, not kernel scope.

Expected actual local result is 15 passing tests, zero failed or skipped cases
for this source revision. The fixtures own and remove their temporary trees.
Keep terminal logs/revision separately. These tests do not execute a real
native cgroup workload or demonstrate supervisor recovery of such a workload.

For actual kernel scope/launcher checks, the registered host owner supplies the
real `KUBECLAW_WORKER_TEST_CGROUP_ROOT`, absolute production
`KUBECLAW_WORKER_TEST_LAUNCHER`, trusted
`KUBECLAW_WORKER_TEST_NODE_IDENTITY_FILE` and
`KUBECLAW_WORKER_TEST_POOL_LIMITS_FILE`, then runs:

```bash
npm run verify:worker-core:native-scope
```

That suite requires its real delegated host resources and does not skip missing
prerequisites. The npm command first requires the native-scope TypeScript check
to exit zero, then runs **two** native tests. Require command exit zero, both
tests passing, and zero failed, cancelled or skipped tests. They check actual
scope accounting and final counters after drain, production-launcher UID/GID
and group restrictions, durable ownership, pool admission and exact replay
fencing. Retain the selected revision, actual host-resource identities, complete
terminal output and exit status outside the suite's disposable directories.
This is the expected result, not a report that this guide's author ran it.

A compiler error, missing host input, unexpected child exit, assertion failure,
drain timeout or `Native scope test cleanup failed` is a failed check. Preserve
the first error and the original host/ownership evidence. Have the registered
host owner inspect the exact test scopes and remaining children before retrying.
Do not replace a delegated cgroup with an ordinary directory, relax launcher or
pool restrictions, or count only the tests that reached their assertions.

The scope test's finalizer attempts to kill its own remaining children, drain
its created scopes with a five-second bound, and dispose them. Cleanup failure
is reported, not a successful result. The launcher/ownership test removes its
private `worker-native-live-*` state tree in its finalizer, but an early host-input
error can occur before that finalizer is installed.

On failure, confirm actual
quiescence and identify any retained owned scope or temporary tree with the host
owner. Do not assume that a process exit proves cleanup. Retain necessary failure
evidence before retiring only those confirmed private leftovers. Never remove
the delegated cgroup root, trusted node identity, pool policy, production launcher
or unrelated supervisor stores. The suite does not retire a real service's
specialist effects or incident evidence.

Do not treat even a successful suite as a complete live
supervisor-abort→specialist-result recovery exercise. Record the original-attempt
chronology above for the actual service.

## Cleanup and change

Only retire owned journal/spool records through the supported retention contract
after original caller reconciliation, retention obligations and external-effect
cleanup pass. Do not remove evidence to relieve quota pressure automatically.
The supervisor owns scope disposal only after quiescence. A disposed scope does
not authorize deleting original specialist evidence or external resources.

For a change, update producer envelope/profile/resource policy and consumer
result binding together. Keep old pinned accepted work readable. Run the
storage/crash and actual delegated-host checks matched to the changed boundary.
Never reuse a changed generation or edited store to make an old interrupted
attempt appear successful. Where the owning deployment offers no supported
control or reconciliation path, retain that explicit stop and its named owner.

## Source authority

- [Prism enters ownership supervision before native execution/listen](https://github.com/datrab/kubeclaw/blob/ce7740252864a9b547bee8a35260d6ab10c9f05e/skills/prism/server/worker.ts#L1-L50).
- [Native execution reconciles the journal before admission](https://github.com/datrab/kubeclaw/blob/ce7740252864a9b547bee8a35260d6ab10c9f05e/skills/prism/server/native-worker-execution.ts#L9-L49).
- [Native executor orders accepted input, spool, process archive and seal](https://github.com/datrab/kubeclaw/blob/ce7740252864a9b547bee8a35260d6ab10c9f05e/skills/worker/core/worker/native-attempt-executor.ts#L19-L72).
- [Attempt recovery returns cached results or proves ownership before reconstruction](https://github.com/datrab/kubeclaw/blob/ce7740252864a9b547bee8a35260d6ab10c9f05e/skills/worker/core/worker/native-attempt-recovery.ts#L1-L41).
- [Actual journal writer kill, lock exclusion, original bytes and sealed replay](https://github.com/datrab/kubeclaw/blob/ce7740252864a9b547bee8a35260d6ab10c9f05e/tests/verification/reliability/worker-native-journal.test.mts#L39-L79).
