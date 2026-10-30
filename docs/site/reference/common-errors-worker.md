# Worker processes, resources and isolation — error catalogue

Status: generated source-backed reference
Audience: operator, developer, maintainer
Owner: documentation automation
Evidence: docs/config/common-error-catalogue.json; scripts/docs-common-error-catalogue.mjs
Applies to: current workspace-owned diagnostic families; source-bound descriptions, not execution evidence
Last verified: generation checks the declared source digests
Generator: scripts/docs-common-error-catalogue.mjs

<!-- BEGIN GENERATED: common error catalogue -->

[All component families](common-errors.md) · [Diagnostic routing](errors.md)

Search for the exact diagnostic or constructor. Each entry distinguishes its identity from effects and recovery; source links are representative, not a complete call graph.

## Families

- [`WORKER_NATIVE_LAUNCH_IDENTITY_INVALID`](#native-launcher-worker-native-launch-identity-invalid)
- [`WORKER_NATIVE_LAUNCH_SCOPE_INVALID`](#native-launcher-worker-native-launch-scope-invalid)
- [`WORKER_NATIVE_LAUNCH_ARGUMENTS_INVALID`](#native-launcher-worker-native-launch-arguments-invalid)
- [`WORKER_NATIVE_SUPERVISOR_IDENTITY_REQUIRED`](#native-launcher-worker-native-supervisor-identity-required)
- [`WORKER_NATIVE_LAUNCH_PARENT_REQUIRED`](#native-launcher-worker-native-launch-parent-required)
- [`WORKER_NATIVE_LAUNCH_PARENT_LOST`](#native-launcher-worker-native-launch-parent-lost)
- [`WORKER_NATIVE_LAUNCH_MEMBERSHIP_INVALID`](#native-launcher-worker-native-launch-membership-invalid)
- [`WORKER_NATIVE_LAUNCH_ATTACH_FAILED`](#native-launcher-worker-native-launch-attach-failed)
- [`WORKER_NATIVE_LAUNCH_CLOSE_FAILED`](#native-launcher-worker-native-launch-close-failed)
- [`WORKER_NATIVE_LAUNCH_ENVIRONMENT_FAILED`](#native-launcher-worker-native-launch-environment-failed)
- [`WORKER_NATIVE_LAUNCH_DROP_PRIVILEGE_FAILED`](#native-launcher-worker-native-launch-drop-privilege-failed)
- [`WORKER_NATIVE_LAUNCH_PRIVILEGE_RETAINED`](#native-launcher-worker-native-launch-privilege-retained)
- [`WORKER_NATIVE_LAUNCH_EXEC_FAILED`](#native-launcher-worker-native-launch-exec-failed)
- [AttemptFault](#js-shared-attemptfault)
- [NativeAdmissionRejected](#js-shared-nativeadmissionrejected)
- [NativeWorkerAttemptBusy](#js-shared-nativeworkerattemptbusy)
- [WorkerPhaseUnresolved](#js-shared-workerphaseunresolved)
- [NativeWorkerCapacityExceeded](#js-shared-nativeworkercapacityexceeded)
- [positiveTimer — skills/worker/core/worker/local-runtime.ts](#j15-helper-10)
- [sandbox-c:filesystem-rule](#sandbox-c-filesystem-rule)
- [sandbox-c:network-rule](#sandbox-c-network-rule)
- [sandbox-c:seccomp-policy-install](#sandbox-c-seccomp-policy-install)
- [sandbox-c:resource-limit](#sandbox-c-resource-limit)
- [sandbox-c:cgroup-join](#sandbox-c-cgroup-join)
- [sandbox-c:termination-and-reaping](#sandbox-c-termination-and-reaping)
- [sandbox-c:supervisor-child](#sandbox-c-supervisor-child)
- [sandbox-c:supervisor-status](#sandbox-c-supervisor-status)
- [sandbox-c:page-size](#sandbox-c-page-size)
- [sandbox-c:parent-death-and-usage](#sandbox-c-parent-death-and-usage)
- [sandbox-c:options-and-main-setup](#sandbox-c-options-and-main-setup)

<a id="native-launcher-worker-native-launch-identity-invalid"></a>

## `WORKER_NATIVE_LAUNCH_IDENTITY_INVALID`

**Representation:** literal

**Identity / construction:** `WORKER_NATIVE_LAUNCH_IDENTITY_INVALID`

**Trigger:** identity rejects strtoul conversion errors, empty or trailing text, zero, a value at or above 4294967295, or a minus sign in the first character. The same converter validates supervisor PID, child UID and child GID.

**Effect:** fail writes this exact code followed by a newline to stderr and calls `_exit`(125).

**Retry boundary:** No retry loop in the launcher. Its caller ownership and reconciliation protocol governs a later attempt. the code alone does not establish retry safety.

**Safe next action:** Retain the first diagnostic, requested identity, scope and attempt identity. Inspect the exact failed guard and the supervisor ownership state before a new launch. do not treat exit125 as proof of cleanup.

**Retained evidence:** The C program writes stderr, not a durable failure record. The caller captures bounded stderr, exit or signal and fault state. ownership cleanup can fail and preserve unresolved diagnosis.

**Consumer / translation:** NativeProcessLaunches tracks the child. runNativeWorkerProcess can turn nonzero exit without an earlier fault into `WORKER_NATIVE_PROCESS_FAILED`. it does not parse this stderr code into that fault. Its finally path kills the child and finishes the lease, without a blanket cleanup-success guarantee.

**Owning / consuming source:**

- [skills/worker/core/worker/native-worker-launcher.c:1](../../../skills/worker/core/worker/native-worker-launcher.c#L1)
- [skills/worker/core/worker/native-worker-process.ts:1](../../../skills/worker/core/worker/native-worker-process.ts#L1)
- [skills/worker/core/worker/native-process-launches.ts:1](../../../skills/worker/core/worker/native-process-launches.ts#L1)

<a id="native-launcher-worker-native-launch-scope-invalid"></a>

## `WORKER_NATIVE_LAUNCH_SCOPE_INVALID`

**Representation:** literal

**Identity / construction:** `WORKER_NATIVE_LAUNCH_SCOPE_INVALID`

**Trigger:** The scope must resolve to its identical canonical path. Its final component must pass the exact worker UUID length/character checks. The no-follow directory must pass cgroup-v2, ownership and mode checks.

**Effect:** fail writes this exact code followed by a newline to stderr and calls `_exit`(125).

**Retry boundary:** No retry loop in the launcher. Its caller ownership and reconciliation protocol governs a later attempt. the code alone does not establish retry safety.

**Safe next action:** Retain the first diagnostic, requested identity, scope and attempt identity. Inspect the exact failed guard and the supervisor ownership state before a new launch. do not treat exit125 as proof of cleanup.

**Retained evidence:** The C program writes stderr, not a durable failure record. The caller captures bounded stderr, exit or signal and fault state. ownership cleanup can fail and preserve unresolved diagnosis.

**Consumer / translation:** NativeProcessLaunches tracks the child. runNativeWorkerProcess can turn nonzero exit without an earlier fault into `WORKER_NATIVE_PROCESS_FAILED`. it does not parse this stderr code into that fault. Its finally path kills the child and finishes the lease, without a blanket cleanup-success guarantee.

**Owning / consuming source:**

- [skills/worker/core/worker/native-worker-launcher.c:1](../../../skills/worker/core/worker/native-worker-launcher.c#L1)
- [skills/worker/core/worker/native-worker-process.ts:1](../../../skills/worker/core/worker/native-worker-process.ts#L1)
- [skills/worker/core/worker/native-process-launches.ts:1](../../../skills/worker/core/worker/native-process-launches.ts#L1)

<a id="native-launcher-worker-native-launch-arguments-invalid"></a>

## `WORKER_NATIVE_LAUNCH_ARGUMENTS_INVALID`

**Representation:** literal

**Identity / construction:** `WORKER_NATIVE_LAUNCH_ARGUMENTS_INVALID`

**Trigger:** main receives fewer than five arguments, or the scope path or executable path does not start with a slash.

**Effect:** fail writes this exact code followed by a newline to stderr and calls `_exit`(125).

**Retry boundary:** No retry loop in the launcher. Its caller ownership and reconciliation protocol governs a later attempt. the code alone does not establish retry safety.

**Safe next action:** Retain the first diagnostic, requested identity, scope and attempt identity. Inspect the exact failed guard and the supervisor ownership state before a new launch. do not treat exit125 as proof of cleanup.

**Retained evidence:** The C program writes stderr, not a durable failure record. The caller captures bounded stderr, exit or signal and fault state. ownership cleanup can fail and preserve unresolved diagnosis.

**Consumer / translation:** NativeProcessLaunches tracks the child. runNativeWorkerProcess can turn nonzero exit without an earlier fault into `WORKER_NATIVE_PROCESS_FAILED`. it does not parse this stderr code into that fault. Its finally path kills the child and finishes the lease, without a blanket cleanup-success guarantee.

**Owning / consuming source:**

- [skills/worker/core/worker/native-worker-launcher.c:1](../../../skills/worker/core/worker/native-worker-launcher.c#L1)
- [skills/worker/core/worker/native-worker-process.ts:1](../../../skills/worker/core/worker/native-worker-process.ts#L1)
- [skills/worker/core/worker/native-process-launches.ts:1](../../../skills/worker/core/worker/native-process-launches.ts#L1)

<a id="native-launcher-worker-native-supervisor-identity-required"></a>

## `WORKER_NATIVE_SUPERVISOR_IDENTITY_REQUIRED`

**Representation:** literal

**Identity / construction:** `WORKER_NATIVE_SUPERVISOR_IDENTITY_REQUIRED`

**Trigger:** The launcher real UID or effective UID is not zero.

**Effect:** fail writes this exact code followed by a newline to stderr and calls `_exit`(125).

**Retry boundary:** No retry loop in the launcher. Its caller ownership and reconciliation protocol governs a later attempt. the code alone does not establish retry safety.

**Safe next action:** Retain the first diagnostic, requested identity, scope and attempt identity. Inspect the exact failed guard and the supervisor ownership state before a new launch. do not treat exit125 as proof of cleanup.

**Retained evidence:** The C program writes stderr, not a durable failure record. The caller captures bounded stderr, exit or signal and fault state. ownership cleanup can fail and preserve unresolved diagnosis.

**Consumer / translation:** NativeProcessLaunches tracks the child. runNativeWorkerProcess can turn nonzero exit without an earlier fault into `WORKER_NATIVE_PROCESS_FAILED`. it does not parse this stderr code into that fault. Its finally path kills the child and finishes the lease, without a blanket cleanup-success guarantee.

**Owning / consuming source:**

- [skills/worker/core/worker/native-worker-launcher.c:1](../../../skills/worker/core/worker/native-worker-launcher.c#L1)
- [skills/worker/core/worker/native-worker-process.ts:1](../../../skills/worker/core/worker/native-worker-process.ts#L1)
- [skills/worker/core/worker/native-process-launches.ts:1](../../../skills/worker/core/worker/native-process-launches.ts#L1)

<a id="native-launcher-worker-native-launch-parent-required"></a>

## `WORKER_NATIVE_LAUNCH_PARENT_REQUIRED`

**Representation:** literal

**Identity / construction:** `WORKER_NATIVE_LAUNCH_PARENT_REQUIRED`

**Trigger:** getenv returns no `KUBECLAW_NATIVE_SUPERVISOR_PID` value.

**Effect:** fail writes this exact code followed by a newline to stderr and calls `_exit`(125).

**Retry boundary:** No retry loop in the launcher. Its caller ownership and reconciliation protocol governs a later attempt. the code alone does not establish retry safety.

**Safe next action:** Retain the first diagnostic, requested identity, scope and attempt identity. Inspect the exact failed guard and the supervisor ownership state before a new launch. do not treat exit125 as proof of cleanup.

**Retained evidence:** The C program writes stderr, not a durable failure record. The caller captures bounded stderr, exit or signal and fault state. ownership cleanup can fail and preserve unresolved diagnosis.

**Consumer / translation:** NativeProcessLaunches tracks the child. runNativeWorkerProcess can turn nonzero exit without an earlier fault into `WORKER_NATIVE_PROCESS_FAILED`. it does not parse this stderr code into that fault. Its finally path kills the child and finishes the lease, without a blanket cleanup-success guarantee.

**Owning / consuming source:**

- [skills/worker/core/worker/native-worker-launcher.c:1](../../../skills/worker/core/worker/native-worker-launcher.c#L1)
- [skills/worker/core/worker/native-worker-process.ts:1](../../../skills/worker/core/worker/native-worker-process.ts#L1)
- [skills/worker/core/worker/native-process-launches.ts:1](../../../skills/worker/core/worker/native-process-launches.ts#L1)

<a id="native-launcher-worker-native-launch-parent-lost"></a>

## `WORKER_NATIVE_LAUNCH_PARENT_LOST`

**Representation:** literal

**Identity / construction:** `WORKER_NATIVE_LAUNCH_PARENT_LOST`

**Trigger:** The supervisor value exceeds `INT_MAX`, parent-death signal installation fails, or the current parent PID differs. The signal and PID checks run again after credential changes.

**Effect:** fail writes this exact code followed by a newline to stderr and calls `_exit`(125).

**Retry boundary:** No retry loop in the launcher. Its caller ownership and reconciliation protocol governs a later attempt. the code alone does not establish retry safety.

**Safe next action:** Retain the first diagnostic, requested identity, scope and attempt identity. Inspect the exact failed guard and the supervisor ownership state before a new launch. do not treat exit125 as proof of cleanup.

**Retained evidence:** The C program writes stderr, not a durable failure record. The caller captures bounded stderr, exit or signal and fault state. ownership cleanup can fail and preserve unresolved diagnosis.

**Consumer / translation:** NativeProcessLaunches tracks the child. runNativeWorkerProcess can turn nonzero exit without an earlier fault into `WORKER_NATIVE_PROCESS_FAILED`. it does not parse this stderr code into that fault. Its finally path kills the child and finishes the lease, without a blanket cleanup-success guarantee.

**Owning / consuming source:**

- [skills/worker/core/worker/native-worker-launcher.c:1](../../../skills/worker/core/worker/native-worker-launcher.c#L1)
- [skills/worker/core/worker/native-worker-process.ts:1](../../../skills/worker/core/worker/native-worker-process.ts#L1)
- [skills/worker/core/worker/native-process-launches.ts:1](../../../skills/worker/core/worker/native-process-launches.ts#L1)

<a id="native-launcher-worker-native-launch-membership-invalid"></a>

## `WORKER_NATIVE_LAUNCH_MEMBERSHIP_INVALID`

**Representation:** literal

**Identity / construction:** `WORKER_NATIVE_LAUNCH_MEMBERSHIP_INVALID`

**Trigger:** The no-follow cgroup.procs open fails, or its fstat, root ownership or non-group/world-writable mode check fails.

**Effect:** fail writes this exact code followed by a newline to stderr and calls `_exit`(125).

**Retry boundary:** No retry loop in the launcher. Its caller ownership and reconciliation protocol governs a later attempt. the code alone does not establish retry safety.

**Safe next action:** Retain the first diagnostic, requested identity, scope and attempt identity. Inspect the exact failed guard and the supervisor ownership state before a new launch. do not treat exit125 as proof of cleanup.

**Retained evidence:** The C program writes stderr, not a durable failure record. The caller captures bounded stderr, exit or signal and fault state. ownership cleanup can fail and preserve unresolved diagnosis.

**Consumer / translation:** NativeProcessLaunches tracks the child. runNativeWorkerProcess can turn nonzero exit without an earlier fault into `WORKER_NATIVE_PROCESS_FAILED`. it does not parse this stderr code into that fault. Its finally path kills the child and finishes the lease, without a blanket cleanup-success guarantee.

**Owning / consuming source:**

- [skills/worker/core/worker/native-worker-launcher.c:1](../../../skills/worker/core/worker/native-worker-launcher.c#L1)
- [skills/worker/core/worker/native-worker-process.ts:1](../../../skills/worker/core/worker/native-worker-process.ts#L1)
- [skills/worker/core/worker/native-process-launches.ts:1](../../../skills/worker/core/worker/native-process-launches.ts#L1)

<a id="native-launcher-worker-native-launch-attach-failed"></a>

## `WORKER_NATIVE_LAUNCH_ATTACH_FAILED`

**Representation:** literal

**Identity / construction:** `WORKER_NATIVE_LAUNCH_ATTACH_FAILED`

**Trigger:** Writing the single byte zero to cgroup.procs does not return exactly one.

**Effect:** fail writes this exact code followed by a newline to stderr and calls `_exit`(125).

**Retry boundary:** No retry loop in the launcher. Its caller ownership and reconciliation protocol governs a later attempt. the code alone does not establish retry safety.

**Safe next action:** Retain the first diagnostic, requested identity, scope and attempt identity. Inspect the exact failed guard and the supervisor ownership state before a new launch. do not treat exit125 as proof of cleanup.

**Retained evidence:** The C program writes stderr, not a durable failure record. The caller captures bounded stderr, exit or signal and fault state. ownership cleanup can fail and preserve unresolved diagnosis.

**Consumer / translation:** NativeProcessLaunches tracks the child. runNativeWorkerProcess can turn nonzero exit without an earlier fault into `WORKER_NATIVE_PROCESS_FAILED`. it does not parse this stderr code into that fault. Its finally path kills the child and finishes the lease, without a blanket cleanup-success guarantee.

**Owning / consuming source:**

- [skills/worker/core/worker/native-worker-launcher.c:1](../../../skills/worker/core/worker/native-worker-launcher.c#L1)
- [skills/worker/core/worker/native-worker-process.ts:1](../../../skills/worker/core/worker/native-worker-process.ts#L1)
- [skills/worker/core/worker/native-process-launches.ts:1](../../../skills/worker/core/worker/native-process-launches.ts#L1)

<a id="native-launcher-worker-native-launch-close-failed"></a>

## `WORKER_NATIVE_LAUNCH_CLOSE_FAILED`

**Representation:** literal

**Identity / construction:** `WORKER_NATIVE_LAUNCH_CLOSE_FAILED`

**Trigger:** After the membership write, closing membership or scope returns a nonzero result.

**Effect:** fail writes this exact code followed by a newline to stderr and calls `_exit`(125).

**Retry boundary:** No retry loop in the launcher. Its caller ownership and reconciliation protocol governs a later attempt. the code alone does not establish retry safety.

**Safe next action:** Retain the first diagnostic, requested identity, scope and attempt identity. Inspect the exact failed guard and the supervisor ownership state before a new launch. do not treat exit125 as proof of cleanup.

**Retained evidence:** The C program writes stderr, not a durable failure record. The caller captures bounded stderr, exit or signal and fault state. ownership cleanup can fail and preserve unresolved diagnosis.

**Consumer / translation:** NativeProcessLaunches tracks the child. runNativeWorkerProcess can turn nonzero exit without an earlier fault into `WORKER_NATIVE_PROCESS_FAILED`. it does not parse this stderr code into that fault. Its finally path kills the child and finishes the lease, without a blanket cleanup-success guarantee.

**Owning / consuming source:**

- [skills/worker/core/worker/native-worker-launcher.c:1](../../../skills/worker/core/worker/native-worker-launcher.c#L1)
- [skills/worker/core/worker/native-worker-process.ts:1](../../../skills/worker/core/worker/native-worker-process.ts#L1)
- [skills/worker/core/worker/native-process-launches.ts:1](../../../skills/worker/core/worker/native-process-launches.ts#L1)

<a id="native-launcher-worker-native-launch-environment-failed"></a>

## `WORKER_NATIVE_LAUNCH_ENVIRONMENT_FAILED`

**Representation:** literal

**Identity / construction:** `WORKER_NATIVE_LAUNCH_ENVIRONMENT_FAILED`

**Trigger:** After attachment and closes, setenv for `KUBECLAW_NATIVE_SCOPE` fails.

**Effect:** fail writes this exact code followed by a newline to stderr and calls `_exit`(125).

**Retry boundary:** No retry loop in the launcher. Its caller ownership and reconciliation protocol governs a later attempt. the code alone does not establish retry safety.

**Safe next action:** Retain the first diagnostic, requested identity, scope and attempt identity. Inspect the exact failed guard and the supervisor ownership state before a new launch. do not treat exit125 as proof of cleanup.

**Retained evidence:** The C program writes stderr, not a durable failure record. The caller captures bounded stderr, exit or signal and fault state. ownership cleanup can fail and preserve unresolved diagnosis.

**Consumer / translation:** NativeProcessLaunches tracks the child. runNativeWorkerProcess can turn nonzero exit without an earlier fault into `WORKER_NATIVE_PROCESS_FAILED`. it does not parse this stderr code into that fault. Its finally path kills the child and finishes the lease, without a blanket cleanup-success guarantee.

**Owning / consuming source:**

- [skills/worker/core/worker/native-worker-launcher.c:1](../../../skills/worker/core/worker/native-worker-launcher.c#L1)
- [skills/worker/core/worker/native-worker-process.ts:1](../../../skills/worker/core/worker/native-worker-process.ts#L1)
- [skills/worker/core/worker/native-process-launches.ts:1](../../../skills/worker/core/worker/native-process-launches.ts#L1)

<a id="native-launcher-worker-native-launch-drop-privilege-failed"></a>

## `WORKER_NATIVE_LAUNCH_DROP_PRIVILEGE_FAILED`

**Representation:** literal

**Identity / construction:** `WORKER_NATIVE_LAUNCH_DROP_PRIVILEGE_FAILED`

**Trigger:** setgroups, setresgid, setresuid or `PR_SET_NO_NEW_PRIVS` returns a nonzero result. earlier operations in this short-circuit chain may already have completed.

**Effect:** fail writes this exact code followed by a newline to stderr and calls `_exit`(125).

**Retry boundary:** No retry loop in the launcher. Its caller ownership and reconciliation protocol governs a later attempt. the code alone does not establish retry safety.

**Safe next action:** Retain the first diagnostic, requested identity, scope and attempt identity. Inspect the exact failed guard and the supervisor ownership state before a new launch. do not treat exit125 as proof of cleanup.

**Retained evidence:** The C program writes stderr, not a durable failure record. The caller captures bounded stderr, exit or signal and fault state. ownership cleanup can fail and preserve unresolved diagnosis.

**Consumer / translation:** NativeProcessLaunches tracks the child. runNativeWorkerProcess can turn nonzero exit without an earlier fault into `WORKER_NATIVE_PROCESS_FAILED`. it does not parse this stderr code into that fault. Its finally path kills the child and finishes the lease, without a blanket cleanup-success guarantee.

**Owning / consuming source:**

- [skills/worker/core/worker/native-worker-launcher.c:1](../../../skills/worker/core/worker/native-worker-launcher.c#L1)
- [skills/worker/core/worker/native-worker-process.ts:1](../../../skills/worker/core/worker/native-worker-process.ts#L1)
- [skills/worker/core/worker/native-process-launches.ts:1](../../../skills/worker/core/worker/native-process-launches.ts#L1)

<a id="native-launcher-worker-native-launch-privilege-retained"></a>

## `WORKER_NATIVE_LAUNCH_PRIVILEGE_RETAINED`

**Representation:** literal

**Identity / construction:** `WORKER_NATIVE_LAUNCH_PRIVILEGE_RETAINED`

**Trigger:** The real or effective user/group identity differs from the requested child identity after the credential calls.

**Effect:** fail writes this exact code followed by a newline to stderr and calls `_exit`(125).

**Retry boundary:** No retry loop in the launcher. Its caller ownership and reconciliation protocol governs a later attempt. the code alone does not establish retry safety.

**Safe next action:** Retain the first diagnostic, requested identity, scope and attempt identity. Inspect the exact failed guard and the supervisor ownership state before a new launch. do not treat exit125 as proof of cleanup.

**Retained evidence:** The C program writes stderr, not a durable failure record. The caller captures bounded stderr, exit or signal and fault state. ownership cleanup can fail and preserve unresolved diagnosis.

**Consumer / translation:** NativeProcessLaunches tracks the child. runNativeWorkerProcess can turn nonzero exit without an earlier fault into `WORKER_NATIVE_PROCESS_FAILED`. it does not parse this stderr code into that fault. Its finally path kills the child and finishes the lease, without a blanket cleanup-success guarantee.

**Owning / consuming source:**

- [skills/worker/core/worker/native-worker-launcher.c:1](../../../skills/worker/core/worker/native-worker-launcher.c#L1)
- [skills/worker/core/worker/native-worker-process.ts:1](../../../skills/worker/core/worker/native-worker-process.ts#L1)
- [skills/worker/core/worker/native-process-launches.ts:1](../../../skills/worker/core/worker/native-process-launches.ts#L1)

<a id="native-launcher-worker-native-launch-exec-failed"></a>

## `WORKER_NATIVE_LAUNCH_EXEC_FAILED`

**Representation:** literal

**Identity / construction:** `WORKER_NATIVE_LAUNCH_EXEC_FAILED`

**Trigger:** execv returns instead of replacing the process with the requested role executable.

**Effect:** fail writes this exact code followed by a newline to stderr and calls `_exit`(125).

**Retry boundary:** No retry loop in the launcher. Its caller ownership and reconciliation protocol governs a later attempt. the code alone does not establish retry safety.

**Safe next action:** Retain the first diagnostic, requested identity, scope and attempt identity. Inspect the exact failed guard and the supervisor ownership state before a new launch. do not treat exit125 as proof of cleanup.

**Retained evidence:** The C program writes stderr, not a durable failure record. The caller captures bounded stderr, exit or signal and fault state. ownership cleanup can fail and preserve unresolved diagnosis.

**Consumer / translation:** NativeProcessLaunches tracks the child. runNativeWorkerProcess can turn nonzero exit without an earlier fault into `WORKER_NATIVE_PROCESS_FAILED`. it does not parse this stderr code into that fault. Its finally path kills the child and finishes the lease, without a blanket cleanup-success guarantee.

**Owning / consuming source:**

- [skills/worker/core/worker/native-worker-launcher.c:1](../../../skills/worker/core/worker/native-worker-launcher.c#L1)
- [skills/worker/core/worker/native-worker-process.ts:1](../../../skills/worker/core/worker/native-worker-process.ts#L1)
- [skills/worker/core/worker/native-process-launches.ts:1](../../../skills/worker/core/worker/native-process-launches.ts#L1)

<a id="js-shared-attemptfault"></a>

## AttemptFault

**Representation:** constructor family

**Identity / construction:** code: Argument2. can be fixed literal, forwarded detail(error)/error.message/assessment.error.code.. message: Argument3 defaults to argument2.. state: Argument1 typed noncompleted WorkerAttemptResult state. call expressions and actual result precedence remain authoritative.

**Trigger:** Actual admission/deadline/cancel/resource/evidence/result/cleanup or forwarded failure branch selects fault.

**Effect:** Final result projects fault.state and code/message, nulls specialist result. measurement/termination/cleanup/unresolved precedence can override earlier fault.

**Retry boundary:** Not a blanket retry class. unresolved hook/effect requires reconciliation.

**Safe next action:** Inspect final bound result, cleanup and ownership evidence before another attempt.

**Retained evidence:** Fault details plus actual collected evidence/logs. earlier effects may remain. successful cancellation/termination not implied.

**Consumer / translation:** AttemptFault state/code/message are separate arguments with message defaultcode. code may itself forward arbitrary detail(error). Consumer #result projects error.code/message and lifecycle state, nulls specialist result when fault. Resource measurement-invalid can override earlier fault. termination/cleanup/unresolved precedence matters. Phase `_TIMEOUT` is constructed from phase. `_COMPLETE` abort reason is completion control. Unsettled JS hook -&gt; WorkerPhaseUnresolved, not proof of process termination.

**Representative source constructions (not executed by this reference):**

```text
new AttemptFault('errored', 'WORKER_EVIDENCE_FILE_LIMIT')
```

```text
new AttemptFault('errored', 'WORKER_EVIDENCE_ID_DUPLICATE')
```

**Owning / consuming source:**

- [skills/worker/core/worker/attempt-executor.ts:95](../../../skills/worker/core/worker/attempt-executor.ts#L95)
- [skills/worker/core/worker/phase-deadline.ts:1](../../../skills/worker/core/worker/phase-deadline.ts#L1)
- [skills/worker/core/worker/resource-accounting.ts:1](../../../skills/worker/core/worker/resource-accounting.ts#L1)

<a id="js-shared-nativeadmissionrejected"></a>

## NativeAdmissionRejected

**Representation:** constructor family

**Identity / construction:** code: Empty Error subclass. inherited constructor, not .code.. message: Inherited Error message/options. two actual constructions supply `WORKER_NATIVE_ACCEPTED_LIMIT_MISMATCH` and `WORKER_NATIVE_CLAIM_NOT_ACTIVE`. Observed calls, not global constructor domain.

**Trigger:** Accepted-limit mismatch or claim inactive at exact guard.

**Effect:** Before journal admission rethrows. after admission and proven no ownership can seal never-launched result.

**Retry boundary:** No automatic retry from rejection class.

**Safe next action:** Preserve admission/ownership proof. do not claim never launched unless actual no-owner branch holds.

**Retained evidence:** Journal and ownership records, not class name, establish retained state.

**Consumer / translation:** No Error suffix required. NativeAdmissionRejected is internal class for accepted-limit/claim guards. before admission rethrows, after journal admission+no ownership can seal never-launched result. Capacity rejection only seals interrupted result if actual ownership absence holds. otherwise conflict. Busy lock translation and public503 differ from generic errorfence. Native result fault is structured result and may be forwarded. not class .code.

**Representative source constructions (not executed by this reference):**

```text
new NativeAdmissionRejected('WORKER_NATIVE_ACCEPTED_LIMIT_MISMATCH')
```

```text
new NativeAdmissionRejected('WORKER_NATIVE_CLAIM_NOT_ACTIVE')
```

**Owning / consuming source:**

- [skills/worker/core/worker/native-attempt-executor.ts:18](../../../skills/worker/core/worker/native-attempt-executor.ts#L18)
- [skills/worker/core/worker/native-attempt-journal.ts:1](../../../skills/worker/core/worker/native-attempt-journal.ts#L1)

<a id="js-shared-nativeworkerattemptbusy"></a>

## NativeWorkerAttemptBusy

**Representation:** constructor family

**Identity / construction:** code: No .code assignment.. message: Fixed message.

**Trigger:** Native journal lock acquisition detects busy attempt.

**Effect:** Worker service maps busy to503. no duplicate ownership granted.

**Retry boundary:** No safe blind duplicate execution promise.

**Safe next action:** Reconcile existing attempt/lock authority.

**Retained evidence:** Existing journal/owner remains authoritative.

**Consumer / translation:** No Error suffix required. NativeAdmissionRejected is internal class for accepted-limit/claim guards. before admission rethrows, after journal admission+no ownership can seal never-launched result. Capacity rejection only seals interrupted result if actual ownership absence holds. otherwise conflict. Busy lock translation and public503 differ from generic errorfence. Native result fault is structured result and may be forwarded. not class .code.

**Representative source constructions (not executed by this reference):**

```text
new NativeWorkerAttemptBusy()
```

**Owning / consuming source:**

- [skills/worker/core/worker/native-attempt-journal.ts:14](../../../skills/worker/core/worker/native-attempt-journal.ts#L14)
- [skills/worker/core/worker/native-attempt-executor.ts:1](../../../skills/worker/core/worker/native-attempt-executor.ts#L1)
- [skills/worker/core/worker/native-result.ts:1](../../../skills/worker/core/worker/native-result.ts#L1)

<a id="js-shared-workerphaseunresolved"></a>

## WorkerPhaseUnresolved

**Representation:** constructor family

**Identity / construction:** code: No .code assignment.. message: `WORKER_PHASE_UNRESOLVED`: plus argument1 phase. `_COMPLETE` abort reason elsewhere is separate completion control.

**Trigger:** Aborted asynchronous phase does not settle within drain path.

**Effect:** Signals unresolved work. attempt result may use `WORKER_PHASE_UNRESOLVED` with prior fault context.

**Retry boundary:** No proof of process termination or retry safety.

**Safe next action:** Reconcile outstanding work/effects and ownership.

**Retained evidence:** Phase and prior fault context retained by actual caller. `_COMPLETE` is separate success cleanup control.

**Consumer / translation:** AttemptFault state/code/message are separate arguments with message defaultcode. code may itself forward arbitrary detail(error). Consumer #result projects error.code/message and lifecycle state, nulls specialist result when fault. Resource measurement-invalid can override earlier fault. termination/cleanup/unresolved precedence matters. Phase `_TIMEOUT` is constructed from phase. `_COMPLETE` abort reason is completion control. Unsettled JS hook -&gt; WorkerPhaseUnresolved, not proof of process termination.

**Representative source constructions (not executed by this reference):**

```text
new WorkerPhaseUnresolved(phase)
```

**Owning / consuming source:**

- [skills/worker/core/worker/phase-deadline.ts:2](../../../skills/worker/core/worker/phase-deadline.ts#L2)
- [skills/worker/core/worker/attempt-executor.ts:1](../../../skills/worker/core/worker/attempt-executor.ts#L1)
- [skills/worker/core/worker/resource-accounting.ts:1](../../../skills/worker/core/worker/resource-accounting.ts#L1)

<a id="js-shared-nativeworkercapacityexceeded"></a>

## NativeWorkerCapacityExceeded

**Representation:** constructor family

**Identity / construction:** code: No .code assignment.. message: Fixed message.

**Trigger:** Resource reservation cannot admit requested capacity.

**Effect:** Native attempt seals interrupted only with proven absence of ownership. otherwise conflict branch.

**Retry boundary:** No automatic rescheduling/retry guaranteed.

**Safe next action:** Check reservation and ownership state before a new attempt.

**Retained evidence:** Reservation/journal ownership evidence. no class-only never-launched conclusion.

**Consumer / translation:** No Error suffix required. NativeAdmissionRejected is internal class for accepted-limit/claim guards. before admission rethrows, after journal admission+no ownership can seal never-launched result. Capacity rejection only seals interrupted result if actual ownership absence holds. otherwise conflict. Busy lock translation and public503 differ from generic errorfence. Native result fault is structured result and may be forwarded. not class .code.

**Representative source constructions (not executed by this reference):**

```text
new NativeWorkerCapacityExceeded()
```

**Owning / consuming source:**

- [skills/worker/core/worker/resource-reservations.ts:3](../../../skills/worker/core/worker/resource-reservations.ts#L3)
- [skills/worker/core/worker/native-attempt-executor.ts:1](../../../skills/worker/core/worker/native-attempt-executor.ts#L1)
- [skills/worker/core/worker/native-attempt-journal.ts:1](../../../skills/worker/core/worker/native-attempt-journal.ts#L1)

<a id="j15-helper-10"></a>

## positiveTimer — skills/worker/core/worker/local-runtime.ts

**Representation:** failure

**Identity / construction:** code: absent. parameter named code becomes Error message. message: Helper argument2 forwarded unchanged to new Error(code).. domain: symbolic-open at helper. exact supplied caller arguments retained below. no global closed domain

**Trigger:** Value is not positive safe integer or exceeds `MAX_TIMER_MS`.

**Effect:** Throws before the guarded helper returns. Callers decide any later store/admission/prompt/repository/runtime effect.

**Retry boundary:** No retry behavior in helper. input rejection and OS error are not interchangeable.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** No durable mutation inside these validation helpers. surrounding caller may already have effects.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/worker/core/worker/local-runtime.ts:47](../../../skills/worker/core/worker/local-runtime.ts#L47)

<a id="sandbox-c-filesystem-rule"></a>

## sandbox-c:filesystem-rule

**Representation:** native-status-errno-policy-or-child-propagation

**Identity / construction:** perror(label) combines owned literal label with errno-derived upstream diagnostic. numeric exits and helper -1 are separate fields. No one-to-one reverse cause from64/70/71. `DENY_SYSCALL` names are policy members, not catalogue codes.

**Trigger:** `add_path_rule/restrict_filesystem` return status. ABI&lt;2 sets ENOTSUP. main labels failure landlock and returns70. File descriptors close only at the exact reached branches.

**Effect:** `add_path_rule/restrict_filesystem/restrict_network/install_filter/limit_resource/join_cgroup/supervise` use -1 or errno. caller emits selected perror label and returns70. Some branches return64/70 without a diagnostic.

**Retry boundary:** No automatic restart or recovery policy established by sandbox C. wait/reap EINTR continuation and termination grace are not operation retry.

**Safe next action:** No weakening of isolation or destructive cleanup recommended. preserve exact diagnostic/consumer context.

**Retained evidence:** No blanket process cleanup success or filesystem/cgroup rollback claim. use exact reached setup and supervision branches.

**Consumer / translation:** runner spawns trusted sandbox with child-cgroup and child module. session captures bounded stderr, unexpected close constructs `ISOLATED_PLUGIN_EXITED`:code:signal:first4096stderr. protocol error/fatal separately becomes `ISOLATED_PLUGIN_FAILED`:detail. Termination failure/cleanup timeout can supersede current error. Other declared Buster sandbox callers remain separate JS consumer obligations.

**Owning / consuming source:**

- [skills/common/plugin-runtime/foundation/isolation/sandbox.c:1](../../../skills/common/plugin-runtime/foundation/isolation/sandbox.c#L1)
- [skills/common/plugin-runtime/foundation/isolation/memory-limit.ts:1](../../../skills/common/plugin-runtime/foundation/isolation/memory-limit.ts#L1)
- [skills/common/plugin-runtime/foundation/isolation/runner.ts:1](../../../skills/common/plugin-runtime/foundation/isolation/runner.ts#L1)

<a id="sandbox-c-network-rule"></a>

## sandbox-c:network-rule

**Representation:** native-status-errno-policy-or-child-propagation

**Identity / construction:** perror(label) combines owned literal label with errno-derived upstream diagnostic. numeric exits and helper -1 are separate fields. No one-to-one reverse cause from64/70/71. `DENY_SYSCALL` names are policy members, not catalogue codes.

**Trigger:** ABI&lt;4 sets ENOTSUP. ruleset and TCP port policy installation failures return -1. main labels landlock network and returns70.

**Effect:** `add_path_rule/restrict_filesystem/restrict_network/install_filter/limit_resource/join_cgroup/supervise` use -1 or errno. caller emits selected perror label and returns70. Some branches return64/70 without a diagnostic.

**Retry boundary:** No automatic restart or recovery policy established by sandbox C. wait/reap EINTR continuation and termination grace are not operation retry.

**Safe next action:** No weakening of isolation or destructive cleanup recommended. preserve exact diagnostic/consumer context.

**Retained evidence:** No blanket process cleanup success or filesystem/cgroup rollback claim. use exact reached setup and supervision branches.

**Consumer / translation:** runner spawns trusted sandbox with child-cgroup and child module. session captures bounded stderr, unexpected close constructs `ISOLATED_PLUGIN_EXITED`:code:signal:first4096stderr. protocol error/fatal separately becomes `ISOLATED_PLUGIN_FAILED`:detail. Termination failure/cleanup timeout can supersede current error. Other declared Buster sandbox callers remain separate JS consumer obligations.

**Owning / consuming source:**

- [skills/common/plugin-runtime/foundation/isolation/sandbox.c:1](../../../skills/common/plugin-runtime/foundation/isolation/sandbox.c#L1)
- [skills/common/plugin-runtime/foundation/isolation/memory-limit.ts:1](../../../skills/common/plugin-runtime/foundation/isolation/memory-limit.ts#L1)
- [skills/common/plugin-runtime/foundation/isolation/runner.ts:1](../../../skills/common/plugin-runtime/foundation/isolation/runner.ts#L1)

<a id="sandbox-c-seccomp-policy-install"></a>

## sandbox-c:seccomp-policy-install

**Representation:** native-status-errno-policy-or-child-propagation

**Identity / construction:** perror(label) combines owned literal label with errno-derived upstream diagnostic. numeric exits and helper -1 are separate fields. No one-to-one reverse cause from64/70/71. `DENY_SYSCALL` names are policy members, not catalogue codes.

**Trigger:** `DENY_SYSCALL` macro emits BPF EPERM policy, not named catalogue errors. Wrong architecture kills process. Browser network filter has explicit family/type restrictions. `perf_event_open` is a syscall policy member, not an event or error code. Installation failure maps perror seccomp/70. successful installation is not an emitted error.

**Effect:** `add_path_rule/restrict_filesystem/restrict_network/install_filter/limit_resource/join_cgroup/supervise` use -1 or errno. caller emits selected perror label and returns70. Some branches return64/70 without a diagnostic.

**Retry boundary:** No automatic restart or recovery policy established by sandbox C. wait/reap EINTR continuation and termination grace are not operation retry.

**Safe next action:** No weakening of isolation or destructive cleanup recommended. preserve exact diagnostic/consumer context.

**Retained evidence:** No blanket process cleanup success or filesystem/cgroup rollback claim. use exact reached setup and supervision branches.

**Consumer / translation:** runner spawns trusted sandbox with child-cgroup and child module. session captures bounded stderr, unexpected close constructs `ISOLATED_PLUGIN_EXITED`:code:signal:first4096stderr. protocol error/fatal separately becomes `ISOLATED_PLUGIN_FAILED`:detail. Termination failure/cleanup timeout can supersede current error. Other declared Buster sandbox callers remain separate JS consumer obligations.

**Owning / consuming source:**

- [skills/common/plugin-runtime/foundation/isolation/sandbox.c:1](../../../skills/common/plugin-runtime/foundation/isolation/sandbox.c#L1)
- [skills/common/plugin-runtime/foundation/isolation/memory-limit.ts:1](../../../skills/common/plugin-runtime/foundation/isolation/memory-limit.ts#L1)
- [skills/common/plugin-runtime/foundation/isolation/runner.ts:1](../../../skills/common/plugin-runtime/foundation/isolation/runner.ts#L1)

<a id="sandbox-c-resource-limit"></a>

## sandbox-c:resource-limit

**Representation:** native-status-errno-policy-or-child-propagation

**Identity / construction:** perror(label) combines owned literal label with errno-derived upstream diagnostic. numeric exits and helper -1 are separate fields. No one-to-one reverse cause from64/70/71. `DENY_SYSCALL` names are policy members, not catalogue codes.

**Trigger:** setrlimit returns native status. main short-circuits AS/CPU/NOFILE/CORE setup and emits setrlimit/70. Earlier successful changes are not rolled back. optional address-space exemption does not remove other limits.

**Effect:** `add_path_rule/restrict_filesystem/restrict_network/install_filter/limit_resource/join_cgroup/supervise` use -1 or errno. caller emits selected perror label and returns70. Some branches return64/70 without a diagnostic.

**Retry boundary:** No automatic restart or recovery policy established by sandbox C. wait/reap EINTR continuation and termination grace are not operation retry.

**Safe next action:** No weakening of isolation or destructive cleanup recommended. preserve exact diagnostic/consumer context.

**Retained evidence:** No blanket process cleanup success or filesystem/cgroup rollback claim. use exact reached setup and supervision branches.

**Consumer / translation:** runner spawns trusted sandbox with child-cgroup and child module. session captures bounded stderr, unexpected close constructs `ISOLATED_PLUGIN_EXITED`:code:signal:first4096stderr. protocol error/fatal separately becomes `ISOLATED_PLUGIN_FAILED`:detail. Termination failure/cleanup timeout can supersede current error. Other declared Buster sandbox callers remain separate JS consumer obligations.

**Owning / consuming source:**

- [skills/common/plugin-runtime/foundation/isolation/sandbox.c:1](../../../skills/common/plugin-runtime/foundation/isolation/sandbox.c#L1)
- [skills/common/plugin-runtime/foundation/isolation/memory-limit.ts:1](../../../skills/common/plugin-runtime/foundation/isolation/memory-limit.ts#L1)
- [skills/common/plugin-runtime/foundation/isolation/runner.ts:1](../../../skills/common/plugin-runtime/foundation/isolation/runner.ts#L1)

<a id="sandbox-c-cgroup-join"></a>

## sandbox-c:cgroup-join

**Representation:** native-status-errno-policy-or-child-propagation

**Identity / construction:** perror(label) combines owned literal label with errno-derived upstream diagnostic. numeric exits and helper -1 are separate fields. No one-to-one reverse cause from64/70/71. `DENY_SYSCALL` names are policy members, not catalogue codes.

**Trigger:** Join formats cgroup.procs, opens/writes current PID, closes descriptor and returns native status. Parent cgroup label versus child cgroup label depend on caller. separate child cgroup.kill setup can return64 or perror/70.

**Effect:** `add_path_rule/restrict_filesystem/restrict_network/install_filter/limit_resource/join_cgroup/supervise` use -1 or errno. caller emits selected perror label and returns70. Some branches return64/70 without a diagnostic.

**Retry boundary:** No automatic restart or recovery policy established by sandbox C. wait/reap EINTR continuation and termination grace are not operation retry.

**Safe next action:** No weakening of isolation or destructive cleanup recommended. preserve exact diagnostic/consumer context.

**Retained evidence:** No blanket process cleanup success or filesystem/cgroup rollback claim. use exact reached setup and supervision branches.

**Consumer / translation:** runner spawns trusted sandbox with child-cgroup and child module. session captures bounded stderr, unexpected close constructs `ISOLATED_PLUGIN_EXITED`:code:signal:first4096stderr. protocol error/fatal separately becomes `ISOLATED_PLUGIN_FAILED`:detail. Termination failure/cleanup timeout can supersede current error. Other declared Buster sandbox callers remain separate JS consumer obligations.

**Owning / consuming source:**

- [skills/common/plugin-runtime/foundation/isolation/sandbox.c:1](../../../skills/common/plugin-runtime/foundation/isolation/sandbox.c#L1)
- [skills/common/plugin-runtime/foundation/isolation/memory-limit.ts:1](../../../skills/common/plugin-runtime/foundation/isolation/memory-limit.ts#L1)
- [skills/common/plugin-runtime/foundation/isolation/runner.ts:1](../../../skills/common/plugin-runtime/foundation/isolation/runner.ts#L1)

<a id="sandbox-c-termination-and-reaping"></a>

## sandbox-c:termination-and-reaping

**Representation:** native-status-errno-policy-or-child-propagation

**Identity / construction:** perror(label) combines owned literal label with errno-derived upstream diagnostic. numeric exits and helper -1 are separate fields. No one-to-one reverse cause from64/70/71. `DENY_SYSCALL` names are policy members, not catalogue codes.

**Trigger:** Signal handler records request. `signal_children` ignores individual kill results and can return0 on missing/unreadable child list. Reaper distinguishes children pending, ECHILD completion, EINTR continue and -1. These are internal controls, not stable codes.

**Effect:** `add_path_rule/restrict_filesystem/restrict_network/install_filter/limit_resource/join_cgroup/supervise` use -1 or errno. caller emits selected perror label and returns70. Some branches return64/70 without a diagnostic.

**Retry boundary:** No automatic restart or recovery policy established by sandbox C. wait/reap EINTR continuation and termination grace are not operation retry.

**Safe next action:** No weakening of isolation or destructive cleanup recommended. preserve exact diagnostic/consumer context.

**Retained evidence:** No blanket process cleanup success or filesystem/cgroup rollback claim. use exact reached setup and supervision branches.

**Consumer / translation:** runner spawns trusted sandbox with child-cgroup and child module. session captures bounded stderr, unexpected close constructs `ISOLATED_PLUGIN_EXITED`:code:signal:first4096stderr. protocol error/fatal separately becomes `ISOLATED_PLUGIN_FAILED`:detail. Termination failure/cleanup timeout can supersede current error. Other declared Buster sandbox callers remain separate JS consumer obligations.

**Owning / consuming source:**

- [skills/common/plugin-runtime/foundation/isolation/sandbox.c:1](../../../skills/common/plugin-runtime/foundation/isolation/sandbox.c#L1)
- [skills/common/plugin-runtime/foundation/isolation/memory-limit.ts:1](../../../skills/common/plugin-runtime/foundation/isolation/memory-limit.ts#L1)
- [skills/common/plugin-runtime/foundation/isolation/runner.ts:1](../../../skills/common/plugin-runtime/foundation/isolation/runner.ts#L1)

<a id="sandbox-c-supervisor-child"></a>

## sandbox-c:supervisor-child

**Representation:** native-status-errno-policy-or-child-propagation

**Identity / construction:** perror(label) combines owned literal label with errno-derived upstream diagnostic. numeric exits and helper -1 are separate fields. No one-to-one reverse cause from64/70/71. `DENY_SYSCALL` names are policy members, not catalogue codes.

**Trigger:** Subreaper or fork failure returns -1 to main perror supervise/70. Pre-fork termination returns70. child parent-death setup/parent mismatch exits70 silently. child cgroup failure perror/70. failed execv perror/71.

**Effect:** `add_path_rule/restrict_filesystem/restrict_network/install_filter/limit_resource/join_cgroup/supervise` use -1 or errno. caller emits selected perror label and returns70. Some branches return64/70 without a diagnostic.

**Retry boundary:** No automatic restart or recovery policy established by sandbox C. wait/reap EINTR continuation and termination grace are not operation retry.

**Safe next action:** No weakening of isolation or destructive cleanup recommended. preserve exact diagnostic/consumer context.

**Retained evidence:** No blanket process cleanup success or filesystem/cgroup rollback claim. use exact reached setup and supervision branches.

**Consumer / translation:** runner spawns trusted sandbox with child-cgroup and child module. session captures bounded stderr, unexpected close constructs `ISOLATED_PLUGIN_EXITED`:code:signal:first4096stderr. protocol error/fatal separately becomes `ISOLATED_PLUGIN_FAILED`:detail. Termination failure/cleanup timeout can supersede current error. Other declared Buster sandbox callers remain separate JS consumer obligations.

**Owning / consuming source:**

- [skills/common/plugin-runtime/foundation/isolation/sandbox.c:1](../../../skills/common/plugin-runtime/foundation/isolation/sandbox.c#L1)
- [skills/common/plugin-runtime/foundation/isolation/memory-limit.ts:1](../../../skills/common/plugin-runtime/foundation/isolation/memory-limit.ts#L1)
- [skills/common/plugin-runtime/foundation/isolation/runner.ts:1](../../../skills/common/plugin-runtime/foundation/isolation/runner.ts#L1)

<a id="sandbox-c-supervisor-status"></a>

## sandbox-c:supervisor-status

**Representation:** native-status-errno-policy-or-child-propagation

**Identity / construction:** perror(label) combines owned literal label with errno-derived upstream diagnostic. numeric exits and helper -1 are separate fields. No one-to-one reverse cause from64/70/71. `DENY_SYSCALL` names are policy members, not catalogue codes.

**Trigger:** On termination or main completion, attempt TERM, bounded reaping, optional cgroup kill, then KILL. Failures can return -1. Main exit is propagated. signal is reset/default raised, with128+signal fallback. Unrecognized status returns70.

**Effect:** `add_path_rule/restrict_filesystem/restrict_network/install_filter/limit_resource/join_cgroup/supervise` use -1 or errno. caller emits selected perror label and returns70. Some branches return64/70 without a diagnostic.

**Retry boundary:** No automatic restart or recovery policy established by sandbox C. wait/reap EINTR continuation and termination grace are not operation retry.

**Safe next action:** No weakening of isolation or destructive cleanup recommended. preserve exact diagnostic/consumer context.

**Retained evidence:** No blanket process cleanup success or filesystem/cgroup rollback claim. use exact reached setup and supervision branches.

**Consumer / translation:** runner spawns trusted sandbox with child-cgroup and child module. session captures bounded stderr, unexpected close constructs `ISOLATED_PLUGIN_EXITED`:code:signal:first4096stderr. protocol error/fatal separately becomes `ISOLATED_PLUGIN_FAILED`:detail. Termination failure/cleanup timeout can supersede current error. Other declared Buster sandbox callers remain separate JS consumer obligations.

**Owning / consuming source:**

- [skills/common/plugin-runtime/foundation/isolation/sandbox.c:1](../../../skills/common/plugin-runtime/foundation/isolation/sandbox.c#L1)
- [skills/common/plugin-runtime/foundation/isolation/memory-limit.ts:1](../../../skills/common/plugin-runtime/foundation/isolation/memory-limit.ts#L1)
- [skills/common/plugin-runtime/foundation/isolation/runner.ts:1](../../../skills/common/plugin-runtime/foundation/isolation/runner.ts#L1)

<a id="sandbox-c-page-size"></a>

## sandbox-c:page-size

**Representation:** native-status-errno-policy-or-child-propagation

**Identity / construction:** perror(label) combines owned literal label with errno-derived upstream diagnostic. numeric exits and helper -1 are separate fields. No one-to-one reverse cause from64/70/71. `DENY_SYSCALL` names are policy members, not catalogue codes.

**Trigger:** --page-size returns decimal/0 on success. sysconf&lt;=0 emits perror page size/70. hostPageSize translates subprocess error/status/invalid stdout to UNAVAILABLE. unsafe/nonpositive/non-power-of-two parsed numeric result to INVALID as exact consumer defines.

**Effect:** `add_path_rule/restrict_filesystem/restrict_network/install_filter/limit_resource/join_cgroup/supervise` use -1 or errno. caller emits selected perror label and returns70. Some branches return64/70 without a diagnostic.

**Retry boundary:** No automatic restart or recovery policy established by sandbox C. wait/reap EINTR continuation and termination grace are not operation retry.

**Safe next action:** No weakening of isolation or destructive cleanup recommended. preserve exact diagnostic/consumer context.

**Retained evidence:** No blanket process cleanup success or filesystem/cgroup rollback claim. use exact reached setup and supervision branches.

**Consumer / translation:** runner spawns trusted sandbox with child-cgroup and child module. session captures bounded stderr, unexpected close constructs `ISOLATED_PLUGIN_EXITED`:code:signal:first4096stderr. protocol error/fatal separately becomes `ISOLATED_PLUGIN_FAILED`:detail. Termination failure/cleanup timeout can supersede current error. Other declared Buster sandbox callers remain separate JS consumer obligations.

**Owning / consuming source:**

- [skills/common/plugin-runtime/foundation/isolation/sandbox.c:1](../../../skills/common/plugin-runtime/foundation/isolation/sandbox.c#L1)
- [skills/common/plugin-runtime/foundation/isolation/memory-limit.ts:1](../../../skills/common/plugin-runtime/foundation/isolation/memory-limit.ts#L1)
- [skills/common/plugin-runtime/foundation/isolation/runner.ts:1](../../../skills/common/plugin-runtime/foundation/isolation/runner.ts#L1)

<a id="sandbox-c-parent-death-and-usage"></a>

## sandbox-c:parent-death-and-usage

**Representation:** native-status-errno-policy-or-child-propagation

**Identity / construction:** perror(label) combines owned literal label with errno-derived upstream diagnostic. numeric exits and helper -1 are separate fields. No one-to-one reverse cause from64/70/71. `DENY_SYSCALL` names are policy members, not catalogue codes.

**Trigger:** Signal/PDEATHSIG setup failure perror parent death signal/70. changed parent returns70 silently. argc&lt;5 prints usage/64. Numeric argument checks return64 silently. Opening task children fails perror/70.

**Effect:** `add_path_rule/restrict_filesystem/restrict_network/install_filter/limit_resource/join_cgroup/supervise` use -1 or errno. caller emits selected perror label and returns70. Some branches return64/70 without a diagnostic.

**Retry boundary:** No automatic restart or recovery policy established by sandbox C. wait/reap EINTR continuation and termination grace are not operation retry.

**Safe next action:** No weakening of isolation or destructive cleanup recommended. preserve exact diagnostic/consumer context.

**Retained evidence:** No blanket process cleanup success or filesystem/cgroup rollback claim. use exact reached setup and supervision branches.

**Consumer / translation:** runner spawns trusted sandbox with child-cgroup and child module. session captures bounded stderr, unexpected close constructs `ISOLATED_PLUGIN_EXITED`:code:signal:first4096stderr. protocol error/fatal separately becomes `ISOLATED_PLUGIN_FAILED`:detail. Termination failure/cleanup timeout can supersede current error. Other declared Buster sandbox callers remain separate JS consumer obligations.

**Owning / consuming source:**

- [skills/common/plugin-runtime/foundation/isolation/sandbox.c:1](../../../skills/common/plugin-runtime/foundation/isolation/sandbox.c#L1)
- [skills/common/plugin-runtime/foundation/isolation/memory-limit.ts:1](../../../skills/common/plugin-runtime/foundation/isolation/memory-limit.ts#L1)
- [skills/common/plugin-runtime/foundation/isolation/runner.ts:1](../../../skills/common/plugin-runtime/foundation/isolation/runner.ts#L1)

<a id="sandbox-c-options-and-main-setup"></a>

## sandbox-c:options-and-main-setup

**Representation:** native-status-errno-policy-or-child-propagation

**Identity / construction:** perror(label) combines owned literal label with errno-derived upstream diagnostic. numeric exits and helper -1 are separate fields. No one-to-one reverse cause from64/70/71. `DENY_SYSCALL` names are policy members, not catalogue codes.

**Trigger:** Exact option parser, argument checks, cgroup/identity/read-root/write-root/network/filter/supervisor sequence determines failure.64 checks can be silent. errno diagnostics use owned labels plus upstream strerror text. Partial limits/cgroup/identity changes precede later possible failures. no blanket pre-execution rollback claim.

**Effect:** `add_path_rule/restrict_filesystem/restrict_network/install_filter/limit_resource/join_cgroup/supervise` use -1 or errno. caller emits selected perror label and returns70. Some branches return64/70 without a diagnostic.

**Retry boundary:** No automatic restart or recovery policy established by sandbox C. wait/reap EINTR continuation and termination grace are not operation retry.

**Safe next action:** No weakening of isolation or destructive cleanup recommended. preserve exact diagnostic/consumer context.

**Retained evidence:** No blanket process cleanup success or filesystem/cgroup rollback claim. use exact reached setup and supervision branches.

**Consumer / translation:** runner spawns trusted sandbox with child-cgroup and child module. session captures bounded stderr, unexpected close constructs `ISOLATED_PLUGIN_EXITED`:code:signal:first4096stderr. protocol error/fatal separately becomes `ISOLATED_PLUGIN_FAILED`:detail. Termination failure/cleanup timeout can supersede current error. Other declared Buster sandbox callers remain separate JS consumer obligations.

**Owning / consuming source:**

- [skills/common/plugin-runtime/foundation/isolation/sandbox.c:1](../../../skills/common/plugin-runtime/foundation/isolation/sandbox.c#L1)
- [skills/common/plugin-runtime/foundation/isolation/memory-limit.ts:1](../../../skills/common/plugin-runtime/foundation/isolation/memory-limit.ts#L1)
- [skills/common/plugin-runtime/foundation/isolation/runner.ts:1](../../../skills/common/plugin-runtime/foundation/isolation/runner.ts#L1)

<!-- END GENERATED: common error catalogue -->
