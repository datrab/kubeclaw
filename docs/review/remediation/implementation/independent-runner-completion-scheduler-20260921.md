# Private Runner completion/scheduler review

Status: bounded nonauthor source review of a private work-in-progress snapshot. No runtime, lint, full Runner or integration acceptance. The exact reviewed modules, original runner and underlying store operations are preserved in [source identities](../../evidence/independent-runner-completion-scheduler-20260921/source-identities-with-store.json). Subsequent private edits require separate review.

## Finding: pending admission is still discarded

`runner-completion.ts` catches `resumeCompletion` failures and returns `{ state: 'durable-pending-admission', cause }`. Its caller in `runner-attempt-execution.ts` reads only `completion.result`; it never reads `completion.admission` or its cause. The new tagged outcome therefore does not constitute an actual handler for pending admission. This retains the original deliberately successful durable-result behavior, so the observation is a quality/ownership defect rather than evidence of a newly introduced provider replay.

The author acknowledged the finding and proposed verifying the existing durable result/intent under the existing store fence before preserving success. That proposal is not part of this reviewed snapshot. Any new verification failure must explicitly avoid provider re-execution after committed completion: a throw currently enters the outer execution catch, sets `workerRuntimeFault`, and can reach the node retry decision. Do not claim no replay without testing that actual failure path. A logger, unused callback or another ignored tagged value would not settle the finding.

## Preserved completion behavior in the inspected snapshot

Worker attempt/claim/generation/worker identity checks and producer ID derivation are retained. Managed evidence is copied into the durable attempt store before constructing the re-digested/re-receipted result. The completion record and closure intent are built from that durable result. `storeResult` persists result and intent before `resumeCompletion` is attempted.

The underlying maintained `attempt-results.ts` checks the committed result/intent under its existing serial fence, calls `admitAndRead`, and only then calls `storeClosureUnlocked`. Constructing the closure object earlier is not publication of a closure. The refactor does not move closure storage ahead of admission or execute a provider during recovery.

Recovery retains its run/plan filtering, latest-claim-generation selection, already-closed and uncommitted handling. The count still includes existing matching completed results; public `run()` raises `TEST_RUNNER_RECOVERY_OWNED_BY_NOVA` before constructing a scheduler when that count is nonzero. Thus admission repair does not by itself re-execute the plan in this snapshot.

The execution wrapper still compares the runtime result to the executor result, retains the completed result on execution errors, and removes the staging directory in `finally`. Retained-fixture cleanup remains in the finalizer and scheduler-owned completion path. No concrete new cleanup omission was identified in this bounded extraction comparison.

## Scheduler and public wiring

The new scheduler preserves the original order: lexical node sorting; explicit skip before caller cancellation; dependency completion and accepted-result checks; global concurrency; group capacity; group increment; pending removal; task registration. The task's `finally` releases its group count. `Promise.race` still selects one result, removes that running entry, records attempts/outputs and transfers successful retained fixtures to the Runner owner. The scheduler's outer `finally` invokes the same cleanup owner; cleanup failures still replace eligible node results with errored results, and final attempts/nodes are sorted.

Public wiring uses arrow adapters for private Runner methods and passes the same fixture/error owners. Provider execution remains delegated to the same attempt path. Reverse retained-fixture cleanup and termination/path checks match the before implementation.

This is parity, not a new universal settlement guarantee: in both versions an unexpected task rejection exits through `finally` without first joining every other running promise; a fixture not yet transferred by a completed race is not magically in the retained list. No new regression was found in that unchanged behavior, but a claim that all exceptional concurrent cleanup cases are solved would exceed this review.

## Required decisive tests

Run the original real Runner/provider suite and existing admission-outage/closure recovery cases unchanged. Exercise actual store quotas and crashes between durable result, admission and closure; assert durable byte/intent identity, eventual one closure and no provider replay. For any pending-handler change, include lost/corrupt/replaced durable authority and verify that a completed external operation is not executed again by the node retry loop.

Scheduler tests should retain two overlapping nodes in one group plus another group, dependency acceptance/rejection, caller cancellation, lexical launch ordering, finally-based count release, retained fixture reverse cleanup, cleanup failure projection and an unexpected rejection while another task remains pending. Use actual owned cleanup/provider boundaries where those assertions claim real cessation. Source extraction and type/lint checks alone cannot establish these behaviors.

No rule or deadline change is recommended. The pending-outcome finding remains open at this snapshot; no full quality acceptance is given.


## Subsequent design decision: use the existing durable recovery consumer

Further source review identifies an existing real consumer rather than a missing status framework: `skills/nova/core/observability/reconciler.ts` reads the persisted completion intent, invokes `resumeCompletion`, evaluates completeness, and journals `imported`, `continue-degraded` or `blocked-incomplete`. The durable representation of pending admission is already the committed result/intent without its admitted closure. The temporary new admission object is redundant; ignoring that object does not make the existing durable recovery state invisible.

Recommend removing that unused result wrapper and retaining a narrowly documented completion contract: return means result+intent committed, not closure admitted. Admission is opportunistic at this boundary; the existing recovery/completeness consumer owns further progress. Do not add a reread, new throw, duplicate status schema or logger merely to satisfy a quality heuristic. Any remaining intentional-catch lint finding must be reported and resolved as the actual architectural boundary, without suppression or a fake handler. This recommendation does not assert a code change has occurred.

Required evidence is the unchanged outage test's successful provider outcome, one invocation, durable result and absent closure; actual one-record/two-record quota recovery producing exactly one closure without provider replay; continued outage yielding the real reconciler's blocked/degraded decision and recovery yielding imported. Failures before committed storeResult still propagate, and closure must never precede admission. The existing Runner recovery ownership guard remains mandatory even after the closure is complete.
