# Concrete remaining Prism CPU ownership integration

Source: integration `268bb72`; separate `prism-cpu-direction` checkout.
Scope PCR-PRISM-WORKER-002, connected Worker-003/containment requirements.
No production source, profile, budget or runtime permissions were changed.

## New local evidence and corrected current-state assessment

The executable `docs/review/evidence/resume-84-prism-cpu/concurrent-parent-cpu.mjs`
uses two original PrismWorkerOperation instances, one original PrismEngine,
original artifact client/handler and a real temporary content-addressed store.
Both attempts wait for actual HTTP input bytes. During that overlap, an actual
unrelated PBKDF2 computation consumes parent-process CPU; releasing both reads
lets both original renders finish. No CPU value, operation, provider or metric
is mocked or replaced.

Observed raw values: unrelated CPU **134.517 ms**; actual parent interval
**170.791 ms**; attempt reports **168 ms and165 ms**, summing to **333 ms**.
Both original renders completed. This demonstrates actual double attribution of
shared-parent work, not hypothetical timing. The probe asserts both attempts
include that unrelated work and their sum exceeds1.5 times actual parent CPU.
It is a defect demonstration, **not a passed per-attempt accounting gate**.
No Chromium, procfs, cgroup, SQL, installation or blocked native action ran.

The previous `attempt-resource-accountability-boundary.md` is partly stale:
current Core already measures both early and after completion hooks
(`attempt-executor.ts`, WORKER_FINAL_RESOURCE_MEASUREMENT near550). Keep that
improvement. Prism `worker-operation.ts` still freezes `cpuTimeMs` in
`execute().finally`; both later measurements return that frozen value. Thus
completion-phase CPU still cannot be observed even though Core now asks for it.
RSS remains shared-parent RSS and maximumProcesses remains literal1.

## Smallest coherent fix: isolate the attempt execution host

A subtraction-only change cannot distinguish concurrent JavaScript work, and
moving final sampling later cannot supply child CPU. The minimum correct unit is
one generic attempt execution host, started inside a uniquely owned native
resource scope, while Prism keeps its original business engine. This is a
cross-boundary implementation package, not a safe single-function change within
this timebox. Do not serialise all HTTP requests or return unavailable-as-zero.

Use these concrete integration seams (proposed APIs, not existing functions):

| Location | Change and ownership |
| --- | --- |
| `skills/worker/core/worker/attempt-resource-owner.ts` | Add neutral owner contract: `create(identity, limits, signal)`, `start(hostSpec)`, `snapshot(signal)`, `terminate(signal)`, `awaitEmpty(signal)`, `dispose()`. Identity binds attemptId, claimId, generation, workerId, profileDigest and attemptSpecDigest. Lifecycle is created→running→quiescing→empty→disposed, with explicit unresolved state. |
| Worker Core platform module, exported through `src/index.ts` | Implement native process/cgroup owner. Host configuration chooses a delegated root; envelopes cannot choose paths/PIDs. Create the group and install limits before specialist code starts. Keep native/platform ownership generic, with no imports from Prism or Buster. |
| `skills/prism/server/worker-attempt.ts` | Replace in-process host admission with the generic owned host. Pass the already validated envelope and request cancellation. Preserve existing mandatory full-log behavior and returned neutral result. |
| New Prism attempt-host entrypoint | Instantiate the original PrismEngine, WorkerArtifactClient, `operationFor` and shared WorkerAttemptExecutor inside the owned child. Input hydration, rendering, screenshot encoding, log/evidence upload and finalisation occur within that child/group. Business logic stays in current engine/operation modules. |
| `worker-operation.ts` | Replace shared `process.cpuUsage`/RSS/constant process value with the trusted owner's live cumulative snapshot bridge. Do not freeze at execute settlement. Early and final Core calls observe the same monotonically increasing scope. |
| Core terminal result construction | Factor the existing neutral result/receipt construction into a trusted sealing boundary so the parent can bind final owner observations after child quiescence, before returning HTTP success. Preserve digest, error precedence, claim validity and result validation. Do not rewrite resource numbers in an already signed/digested receipt as an ad-hoc postprocessing step. |
| `worker-lifecycle.ts` | Existing shutdown owns/cancels the host admission. Await owner termination/empty acknowledgement as well as HTTP handler settlement; unresolved ownership remains unsafe and not-ready. |

Why the whole host: running only Chromium in a separate group misses Node-side
artifact parsing, PNG/base64 handling, validation and completion hooks. Keeping
a shared parent Core while charging its costs to each child double-counts shared
work. The parent remains a small bounded admission/transport/resource supervisor;
its non-attempt service overhead is explicitly outside the measured host scope,
as are remote Control/artifact/BuildKit service costs. Document this scope at the
profile/receipt boundary rather than silently claiming machine-wide accounting.

## Existing native mechanism to reuse, and missing capabilities

`foundation/isolation/sandbox.c` already provides `--child-cgroup`: the child joins
`cgroup.procs` before `execv`, while the supervisor owns a kill descriptor. That
is a useful pre-execution placement primitive. Do not move the shared service PID
into a group after startup. Its current plugin `runner.ts` wraps a plugin surface,
uses Node permission/no-addons flags and different package authority; it cannot
be reused unchanged for Playwright's subprocess/filesystem needs. Compose the
launcher under a reviewed worker-host configuration, preserving UID/GID,
filesystem and network restrictions; no broader permissions are implied.

`IsolationCgroup` currently requires memory delegation, sets memory limits and
kills/removes the group on `close()`. It does not provide CPU accounting or a
snapshot-after-empty/before-remove phase. Refactor the low-level native ownership
primitive for both callers, or provide an equivalent generic owner in Core
without importing role code. Required capability additions:

- Monotonic aggregate `cpu.stat` usage for the whole group, including exited
  descendants; use cumulative microseconds converted with a documented integer
  rule. `cpu.max` controls rate, not total CPU-time budget.
- `memory.peak`, OOM events and empty-state observation retained until terminal
  sealing; deletion comes last. Missing required counters fail admission or
  measurement, never produce a default zero.
- Explicit process/task unit. `pids.current`/`pids.peak` count tasks/threads and
  cannot silently stand in for the V1 maximumProcesses contract. A correct
  process observation or separately reviewed contract/profile migration is
  required. Do not falsely close all resource metrics from CPU support alone.
- A bounded monitoring loop may stop work after cumulative CPU crosses budget;
  its sampling/enforcement overshoot must be declared and tested. Final
  cumulative usage remains authoritative even if the process exited first.

The current V1 `assessWorkerResources` requires all three valid observations and
rejects regressing cumulative values. Preserve that fail-closed rule. V2 supports
explicit unavailable observations, but switching profiles/budgets is a separate
policy migration and does not repair the currently required V1 budget.

## Ordering, cancellation, retries and durable authority

1. Authenticate/validate bounded envelope in service; check current claim and
   owner collision before allocating any attempt host. Register the owner with
   service lifecycle before launch. Establish delegated scope and limits.
2. Launch only through pre-exec scope placement, then receive a bounded handshake
   binding the host and full attempt identity. Failure before handshake is a
   failed admission that still requires scope cleanup.
3. Relay cancellation only to the owned attempt. Keep early resource assessment
   and the current Core absolute claim/completion rules. No new lease renewal is
   invented. Browser children inherit the attempt group and cannot escape it.
4. Complete hooks inside the owned host, then quiesce it. Parent samples terminal
   cumulative counters while the group still exists, verifies emptiness/exit and
   seals the neutral result. Any unresolved work, missing counter, exceeded limit
   or expired claim blocks completed. Never delete counters before this boundary.
5. Dispose the empty group after authoritative evidence/receipt preparation.
   A receipt cannot account for work performed after its own measurement; bound
   that trusted sealing/transport overhead separately and document it.
6. Preserve existing duplicate ownership semantics. Parent admission must bind
   execution identity/fingerprint and owner, rejecting foreign-owner conflicts;
   do not accidentally execute duplicate same-key requests in separate hosts.
   Child RAM cache becomes host-local. Control's existing transaction/result store
   remains durable replay authority; never claim a dead child's cache is durable.
7. Persist enough trusted owner identity for crash reconciliation before admitting
   a retry: claim generation/fence plus supervisor-owned scope identity. Do not
   identify surviving work by guessed PID or caller path. Reconcile old ownership
   before deleting or reusing a scope. This is part of the atomic host change.

## Required acceptance before promotion

Use actual concurrent owned hosts: one expensive and one small attempt; each must
report only its own cumulative CPU. Include real Chromium captures with exited
renderer children, repeated service work exceeding the prior4-second lifetime
threshold, and actual completion-phase work after engine execution. Verify early
budget denial, terminal overrun, OOM/limits, cancellation during launch/capture/
upload, SIGTERM and crash/restart with surviving scope, duplicate claim/fingerprint
conflicts, missing counters, and truthful unresolved failure. Test existing shared
Core and original role engines, not substituted metrics. Run native cgroup/proc/
Chromium gates only in an authorized delegated environment.

Implementation order: (A) generic owner/counter contract plus native lifecycle;
(B) trusted host protocol and terminal sealing; (C) Prism operation integration
and service/claim ownership; (D) original concurrent/native acceptance. Each
intermediate change remains unpromoted until its dependent boundary is complete.
No source fix is proposed for immediate merge from this report; the actual probe
and exact seams make the next package concrete without weakening current rules.

Final exact probe rerun after adding the bounded contact wait also passed: 137.428 ms unrelated CPU, 172.468 ms actual parent interval, 341 ms summed attempt reports. Raw final output is `concurrent-parent-cpu-final.txt`; initial output above is retained.
