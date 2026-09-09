# Attempt resource accountability: remaining atomic boundary

Reviewed source: `bbc36de` (2026-09-09). Scope: D09,
PCR-PRISM-WORKER-002/-003 and PCR-BUSTER-ENGINE-001. This is a static
source/dependency review and a read-only local environment check. No functional
fix or native execution pass is claimed. These findings still have code work
and native verification outstanding. Earlier CPU-window and cancellation fixes
remain useful but do not close the resource-accountability findings.

## Confirmed ownership and measurement gaps

| Source | Actual boundary | Consequence |
| --- | --- | --- |
| `skills/prism/server/worker-operation.ts`, `prepare`, `execute`, `measure` | CPU delta belongs to the shared Node process; RSS is its current RSS; process count is the literal `1`. CPU freezes when `execute` settles. | Concurrent attempts contaminate CPU attribution. Browser descendants are omitted. RSS is not an attempt peak. The process count does not describe a capture tree. |
| `skills/prism/server/worker.ts`, `worker-attempt.ts` | Requests use a shared engine and artifact client; each invokes the same Core executor in that service process. | There is no process boundary to which one attempt's parent-side allocations and browser work can be charged exclusively. |
| `skills/buster/engine/test-gates/runner.ts`, operation `execute` and `#context` | Provider execution crosses to its child, but capability invocation, validation, JSON encoding and evidence staging execute in the runner process. | Provider-child counters do not include those costs. Adding shared-parent counters would charge concurrent attempts and unrelated service work. |
| `skills/buster/engine/test-gates/provider-loader.ts`, `ProviderProcessSession`, `processFacts` | `/proc` sampling covers the provider and its then-visible descendants. | It does not cover parent-side RPC, sibling capability processes or report adapters. Samples can miss short-lived children and completed-child CPU. Constants/default zeros are not evidence of an empty whole-attempt scope. |
| `skills/worker/core/worker/attempt-executor.ts`, `#execute` measurement section | `operation.measure()` and `assessWorkerResources()` run before cleanup, evidence collection, full-log storage and result finalization. The returned receipt uses this assessment. | Even a correct execution-tree counter would omit work in these later phases. Buster report adaptation runs in `finalizeResult`, after this sole assessment. |
| `skills/buster/engine/test-gates/runner.ts`, `finalizeResult`; `report-adapter-runtime.ts`, `adapt` | Adapter process limits are separately allocated; source reads, package hashing/copying and result validation also execute in the runner. `adapt` returns a report, not an aggregate resource receipt. | Limits cannot be summed as measured usage; adapter processing has neither the same attempt owner nor a final aggregate check. |

The existing `IsolationCgroup` in
`skills/common/plugin-runtime/foundation/isolation/cgroup.ts` owns an isolated
plugin invocation and validates actual delegated cgroup v2 storage. Its current
API creates a memory-bounded child group and kills/drains it on close; it does
not supply a complete attempt CPU/memory/process receipt. The Buster Playwright
and command-runner resource scopes are also individual operations. None owns the
shared runner JavaScript that orchestrates those operations.

## Why a bounded local counter patch cannot close these findings

A process-wide CPU baseline can remove earlier process lifetime, but cannot
separate concurrent JavaScript work. RSS is a process property, not an
AsyncLocalStorage/request property. Sampling a shared process and its tree
cannot attribute its siblings to individual attempts. Summing sampled maxima
also does not recover the simultaneous aggregate memory peak, and can double
count nested trees. A constant process count or an absent-counter zero hides the
missing observation. Serializing admission alone still misses browser and later
phase resources and changes concurrency behavior.

Moving the existing measurement call later is necessary for terminal phase
coverage but insufficient: its underlying owner remains wrong. It also needs a
separate early assessment so a known execution overrun does not start optional
finalization. A second assessment must preserve cleanup, claim-deadline,
termination, evidence and failure precedence semantics. It cannot safely be
implemented as an isolated reordering without coverage of those paths.

The existing explicit V2 resource contract supports unavailable measurements and
unrequested budgets for local Prism agent jobs. Switching these V1 worker paths
to that policy would be a contract/policy migration, not fulfillment of their
existing budgets. V1 missing observations must still fail. No change to limits,
profiles, registration, transport, deployment permissions or status is made here.

## Minimal coherent design, preserving the shared Core

Use one generic **attempt resource owner** in Worker Core. Keep Nova orchestration
and all Prism/Buster business logic in their existing engines. The owner needs a
trusted attempt identity, an exclusively delegated local process scope, bounded
termination/drain, live and terminal observations, and explicit disposal state.
It must be installed before specialist input decoding/allocation begins. A
process must enter that scope before executing untrusted or specialist work;
moving an already-running shared parent into it is incorrect.

For each engine, run the attempt-specific execution host inside the owned scope.
Place capability dispatch, browser/command client subprocesses, adapter execution,
result validation and attempt-specific evidence/log preparation there too.
The long-lived service retains authenticated admission, durable claim authority
and bounded transport. Shared storage/remote service costs remain a separately
declared scope; do not claim local CPU counters measure remote BuildKit,
Kubernetes or artifact-service resource use. Give the result a precise local
scope without silently weakening a previously required aggregate policy.

Local child scopes must descend from the attempt scope or yield unambiguous
nonoverlapping accounting with equivalent whole-attempt limits. Aggregate parent
cgroup counters are preferable to summing independent sampled peaks. Preserve
separate sandbox privileges and filesystem/network permissions; an ownership
change does not authorize broader execution rights.

CPU rate controls are not cumulative CPU-time limits. The implementation must
distinguish `cpu.max` from measured cumulative `cpu.stat` usage and document
sampling/enforcement latency. Likewise, cgroup pids counts tasks/threads, so it
must not silently redefine a contract that counts processes. Verify the intended
unit and supported kernel peak counters before certifying a V1 observation.
Where the kernel cannot supply the declared observation, fail the required
measurement or perform an explicitly reviewed V2 migration; never fabricate it.

Keep an early budget check plus a final assessment after owned cleanup,
evidence/log work and report finalization, before publishing the terminal result.
Take the terminal counters before disposing the empty group. Receipt construction
and transport need a documented boundary and a separately bounded trusted path;
no receipt can measure work performed after its own measurement. Drain failure,
missing counters and leaked ownership must block successful completion.

Buster retained fixtures require an explicit ownership transition. An execution
attempt cannot simultaneously certify an empty process scope and silently retain
a provider within it. Persist the transition to the fixture's existing durable
cleanup lifecycle, define which local processes/resources remain live, and charge
later cleanup to its own accepted claim. Preserve D06 external demo lifetime and
D07 durable evidence; never kill retained external fixtures merely to empty a
local process scope. Recovery must reconcile owned scopes by claim/fence before
admitting retries or removing snapshots.

## Affected interfaces and atomic integration steps

1. **Core contract and owner.** Review `WorkerAttemptOperation.prepare`,
   `execute`, `measure`, `terminate`, completion hooks and
   `WorkerAttemptExecutorOptions.storeFullLog` in
   `skills/worker/core/worker/attempt-executor.ts`. Introduce generic ownership
   semantics once, with no concrete plugin imports. Update
   `resource-accounting.ts` and, only where semantics need it,
   `contracts/pipeline-worker-core/v1/src` types/validators/generated schemas.
   Keep strict V1 missing-metric failure and exact V2 policy/digest binding.
2. **Real local execution boundary.** Implement and natively verify trusted
   process admission, aggregate observations and reaping before activating an
   engine path. Reuse the existing sandbox/cgroup primitives where their actual
   semantics fit; do not add a second generic worker or fake filesystem adapter.
   Fail preflight if required delegation/counters are unavailable.
3. **Prism vertical slice.** Integrate the owner through `worker-operation.ts`,
   `worker-attempt.ts`, service construction in `worker.ts`,
   `worker-artifacts.ts`, engine `worker-binding.ts` and `browser-capture.ts`.
   Account for input hydration, browser execution, uploads and full-log work.
   Preserve engine idempotency, cancellation ownership and durable Control
   authority. Changes to the current in-memory engine cache need explicit
   behavioral tests when moving execution into a child.
4. **Buster vertical slice.** Integrate `runner.ts` operation hooks,
   `provider-loader.ts` and its protocol, `provider-capabilities.ts`, capability
   invoker construction in `remote-plan-service.ts`/production wiring, concrete
   browser/command capabilities, and `ReportAdapterExecutor` in
   `report-adapter-runtime.ts`. Keep fixture retention/cleanup and post-crash
   reconciliation coherent with the ownership model.
5. **Deployment and terminal lifecycle.** Wire only the verified delegated
   subtree through existing images/entrypoints and worker workload configuration.
   Coordinate Prism readiness changes in the separate workstream. V1/V2 profile,
   envelope, receiver and registration migrations, if needed, must be atomic.
   Run both engines through the same final Core phase behavior before accepting
   either as resource-bounded. Deployments remain separately unauthorized here.

These are implementation/dependency boundaries, not independently releasable
half-fixes. Unconnected scaffolding would not reduce the current exposure and is
not introduced by this report.

## Exact remaining native acceptance gates

All gates below are **open**, not performed by this source review. They must use
the original engines/providers, actual native binaries and actual delegated
cgroups. Native prerequisites must fail explicitly, never skip to a fake cgroup,
replacement browser or mocked provider.

- Two concurrent original Prism attempts: isolate their CPU/RSS/process
  observations while unrelated service CPU runs; include real Chromium capture.
  Prior process CPU and later unrelated CPU must not enter either receipt.
- Real child workloads with short lifetimes, descendants that outlive their
  leader, TERM resistance and attempted process-group escape: cumulative child
  CPU and peak memory/task semantics must match the declared contract. Verify
  drain/kill acknowledgement and no post-terminal local writes. Explicitly test
  unavailable controller/metric and read failure as fail-closed outcomes.
- Original Buster provider invoking actual parent-side browser/command capability
  with low provider CPU but material capability cost: the whole-attempt budget
  must fail when exceeded. Combine concurrent capability workloads whose
  individual limits pass but aggregate memory/process limits exceed the claim.
- Original registered report adapter, real artifact reader and original package
  snapshot path: demonstrate that source decoding/hashing, adapter subprocess
  and finalization CPU/memory are included in the terminal observation. A budget
  exceeded only during finalization must not produce `completed`.
- Cancellation separately during input read, launch, capture, evidence upload,
  provider RPC, adapter input and final cleanup: no local descendant or callback
  survives a successful drain receipt. Already-committed remote writes remain
  visible and are reconciled, not falsely described as rolled back.
- Retained fixture success, later cleanup, worker crash/restart and stale claim:
  verify persistent ownership transfer and fencing; orphan/unknown scopes block
  reuse. Preserve D06 demo lifetime and D07 evidence.
- Original Core V1/V2 contract, timeout/claim deadline, phase quarantine,
  cancellation, evidence/log integrity and exact policy-binding tests, then
  both full engine native suites. Validate the actual container/delegation
  environment before claiming deployment support.

Read-only local prerequisite evidence: `/proc/self/cgroup` returned `0::/`;
`/proc/mounts` reported `cgroup2 /sys/fs/cgroup cgroup2
ro,nosuid,nodev,noexec,relatime,nsdelegate 0 0`. This host exposes no writable
delegated scope through that mount. No mount, privilege, live workload, CI or
deployment was changed. Browser and original isolated-provider native gates
already remain open in `prism-worker-cancellation.md` and `buster-engine.md`;
their historical failures are not a fresh rerun by this review.

## Disposition

No correct complete fix is confined to the three observed counter expressions.
The root cause is missing whole-attempt process ownership combined with an early
measurement lifecycle. Implementing it requires coordinated Core, engine and
native-runtime work, and unavailable native prerequisites prevent verifying the
result here. Keep PCR-PRISM-WORKER-002/-003 and PCR-BUSTER-ENGINE-001 open for
these remaining parts. This report changes neither functional code nor the
central remediation register.
