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
- [Worker authority and ownership](#core-guards-10)
- [Worker process and resource completion](#core-guards-11)
- [Worker output and evidence](#core-guards-12)

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

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>error.code</code> | <code>WORKER&#95;EVIDENCE&#95;FILE&#95;LIMIT</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:199](../../../skills/worker/core/worker/attempt-executor.ts#L199) |
| <code>error.code</code> | <code>WORKER&#95;EVIDENCE&#95;ID&#95;DUPLICATE</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:204](../../../skills/worker/core/worker/attempt-executor.ts#L204) |
| <code>error.code</code> | <code>WORKER&#95;EVIDENCE&#95;BYTE&#95;LIMIT</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:207](../../../skills/worker/core/worker/attempt-executor.ts#L207) |
| <code>error.code</code> | <code>WORKER&#95;QUEUE&#95;DEADLINE&#95;EXPIRED</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:248](../../../skills/worker/core/worker/attempt-executor.ts#L248) |
| <code>error.code</code> | <code>WORKER&#95;CLAIM&#95;EXPIRED</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:254](../../../skills/worker/core/worker/attempt-executor.ts#L254) |
| <code>error.code</code> | <code>WORKER&#95;CLAIM&#95;NOT&#95;ACTIVE</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:259](../../../skills/worker/core/worker/attempt-executor.ts#L259) |
| <code>error.code</code> | <code>WORKER&#95;CLAIM&#95;WINDOW&#95;INSUFFICIENT</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:269](../../../skills/worker/core/worker/attempt-executor.ts#L269) |
| <code>error.code</code> | <code>WORKER&#95;RESOURCE&#95;MEASUREMENT&#95;UNAVAILABLE</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:276](../../../skills/worker/core/worker/attempt-executor.ts#L276) |
| <code>error.code</code> | <code>WORKER&#95;LOG&#95;LIMIT</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:308](../../../skills/worker/core/worker/attempt-executor.ts#L308) |
| <code>error.code</code> | <code>WORKER&#95;LOG&#95;LIMIT</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:320](../../../skills/worker/core/worker/attempt-executor.ts#L320) |
| <code>error.code</code> | <code>WORKER&#95;CLAIM&#95;EXPIRED</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:375](../../../skills/worker/core/worker/attempt-executor.ts#L375) |
| <code>error.code</code> | <code>WORKER&#95;ATTEMPT&#95;TIMEOUT</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:376](../../../skills/worker/core/worker/attempt-executor.ts#L376) |
| <code>error.code</code> | <code>WORKER&#95;ATTEMPT&#95;CANCELLED</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:377](../../../skills/worker/core/worker/attempt-executor.ts#L377) |
| <code>error.code</code> | <code>WORKER&#95;ATTEMPT&#95;CANCELLED</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:382](../../../skills/worker/core/worker/attempt-executor.ts#L382) |
| <code>error.code</code> | <code>WORKER&#95;PREPARATION&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:396](../../../skills/worker/core/worker/attempt-executor.ts#L396) |
| <code>error.code</code> | <code>WORKER&#95;QUEUE&#95;DEADLINE&#95;EXPIRED</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:403](../../../skills/worker/core/worker/attempt-executor.ts#L403) |
| <code>error.code</code> | <code>WORKER&#95;CLAIM&#95;WINDOW&#95;INSUFFICIENT</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:412](../../../skills/worker/core/worker/attempt-executor.ts#L412) |
| <code>error.code</code> | <code>WORKER&#95;CLAIM&#95;EXPIRED</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:419](../../../skills/worker/core/worker/attempt-executor.ts#L419) |
| <code>error.code</code> | <code>WORKER&#95;ATTEMPT&#95;TIMEOUT</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:421](../../../skills/worker/core/worker/attempt-executor.ts#L421) |
| <code>error.code</code> | <code>WORKER&#95;RESULT&#95;LIMIT</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:425](../../../skills/worker/core/worker/attempt-executor.ts#L425) |
| <code>error.code</code> | <code>WORKER&#95;TERMINATION&#95;FAILED</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:438](../../../skills/worker/core/worker/attempt-executor.ts#L438) |
| <code>error.code</code> | <code>WORKER&#95;EVIDENCE&#95;COLLECTION&#95;FAILED</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:506](../../../skills/worker/core/worker/attempt-executor.ts#L506) |
| <code>error.code</code> | <code>WORKER&#95;EVIDENCE&#95;COLLECTION&#95;FAILED</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:511](../../../skills/worker/core/worker/attempt-executor.ts#L511) |
| <code>error.code</code> | <code>WORKER&#95;LOG&#95;STORE&#95;FAILED</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:533](../../../skills/worker/core/worker/attempt-executor.ts#L533) |
| <code>error.code</code> | <code>WORKER&#95;RESULT&#95;FINALIZATION&#95;FAILED</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:546](../../../skills/worker/core/worker/attempt-executor.ts#L546) |
| <code>error.code</code> | <code>WORKER&#95;TERMINATION&#95;FAILED</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:566](../../../skills/worker/core/worker/attempt-executor.ts#L566) |
| <code>error.code</code> | <code>WORKER&#95;ATTEMPT&#95;CANCELLED</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:568](../../../skills/worker/core/worker/attempt-executor.ts#L568) |
| <code>error.code</code> | <code>WORKER&#95;ATTEMPT&#95;CANCELLED</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:571](../../../skills/worker/core/worker/attempt-executor.ts#L571) |
| <code>error.code</code> | <code>WORKER&#95;TERMINATION&#95;FAILED</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:575](../../../skills/worker/core/worker/attempt-executor.ts#L575) |
| <code>error.code</code> | <code>WORKER&#95;PHASE&#95;UNRESOLVED</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:578](../../../skills/worker/core/worker/attempt-executor.ts#L578) |
| <code>error.code</code> | <code>WORKER&#95;CLAIM&#95;EXPIRED</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:579](../../../skills/worker/core/worker/attempt-executor.ts#L579) |
| <code>error.code</code> | <code>WORKER&#95;OPERATION&#95;RESULT&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:664](../../../skills/worker/core/worker/attempt-executor.ts#L664) |
| <code>error.code</code> | <code>WORKER&#95;CLAIM&#95;EXPIRED</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:687](../../../skills/worker/core/worker/attempt-executor.ts#L687) |
| <code>error.code</code> | <code>WORKER&#95;OPERATION&#95;RESULT&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/attempt-executor.ts:693](../../../skills/worker/core/worker/attempt-executor.ts#L693) |

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

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>WORKER&#95;LOCAL&#95;DRAIN&#95;TIMEOUT&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/local-runtime.ts:93](../../../skills/worker/core/worker/local-runtime.ts#L93) |
| <code>Error.message</code> | <code>WORKER&#95;LOCAL&#95;CANCELLATION&#95;TIMEOUT&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/local-runtime.ts:94](../../../skills/worker/core/worker/local-runtime.ts#L94) |

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

<a id="core-guards-10"></a>

## Worker authority and ownership

**Representation:** own common/worker guard and message family

**Identity / construction:** Source-defined message and guard family. Exact forms below distinguish literal values from symbolic patterns. Returned/forwarded/control outcomes keep their own meanings.

**Trigger:** Trusted identity/policy files, supervisor authority, resource-pool verification, durable reservation and lifecycle transitions. Recovery fences admission on unresolved state.

**Effect:** Metadata is not kernel termination proof. Disposed identities remain reserved; a boot change alone does not prove another host terminated. No automatic ownership-file removal or identity reuse recommendation.

**Retry boundary:** Use the owning state and original identity to establish whether another attempt is safe. This family has no blanket retry rule.

**Safe next action:** Inspect the actual authority, reservation, boot/ownership state and recovery fence. Do not remove ownership files or reuse an identity to bypass unresolved work.

**Retained evidence:** Preserve the first diagnostic, target and operation identity plus existing journal, receipt, ownership or output evidence. Do not infer that a failed operation erased prior state.

**Consumer / translation:** The named implementation and its actual caller determine the resulting state. A thrown message is not itself a separate code, a terminal result or proof of successful cleanup.

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;SUPERVISOR&#95;AUTHORITY&#95;REQUIRED</code> | Use the family construction rule above. | [skills/worker/core/worker/native-supervisor-authority.ts:9](../../../skills/worker/core/worker/native-supervisor-authority.ts#L9) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;LAUNCHER&#95;PATH&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/native-supervisor-authority.ts:14](../../../skills/worker/core/worker/native-supervisor-authority.ts#L14) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;LAUNCHER&#95;NOT&#95;TRUSTED</code> | Use the family construction rule above. | [skills/worker/core/worker/native-supervisor-authority.ts:19](../../../skills/worker/core/worker/native-supervisor-authority.ts#L19) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;POOL&#95;CPU&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/native-resource-pool.ts:29](../../../skills/worker/core/worker/native-resource-pool.ts#L29) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;POOL&#95;IDENTITY&#95;CHANGED</code> | Use the family construction rule above. | [skills/worker/core/worker/native-resource-pool.ts:36](../../../skills/worker/core/worker/native-resource-pool.ts#L36) |
| <code>Error.message</code> | <code>&#96;WORKER&#95;NATIVE&#95;POOL&#95;LIMIT&#95;MISMATCH:${file}&#96;</code> | Use the family construction rule above. | [skills/worker/core/worker/native-resource-pool.ts:45](../../../skills/worker/core/worker/native-resource-pool.ts#L45) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;POOL&#95;DOMAIN&#95;REQUIRED</code> | Use the family construction rule above. | [skills/worker/core/worker/native-resource-pool.ts:49](../../../skills/worker/core/worker/native-resource-pool.ts#L49) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;POOL&#95;IDENTITY&#95;CHANGED</code> | Use the family construction rule above. | [skills/worker/core/worker/native-resource-pool.ts:57](../../../skills/worker/core/worker/native-resource-pool.ts#L57) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;LAUNCH&#95;FENCED</code> | Use the family construction rule above. | [skills/worker/core/worker/native-worker-ownership.ts:70](../../../skills/worker/core/worker/native-worker-ownership.ts#L70) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;LAUNCH&#95;FENCED</code> | Use the family construction rule above. | [skills/worker/core/worker/native-worker-ownership.ts:80](../../../skills/worker/core/worker/native-worker-ownership.ts#L80) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;LAUNCH&#95;FENCED</code> | Use the family construction rule above. | [skills/worker/core/worker/native-worker-ownership.ts:82](../../../skills/worker/core/worker/native-worker-ownership.ts#L82) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;LAUNCH&#95;FENCED</code> | Use the family construction rule above. | [skills/worker/core/worker/native-worker-ownership.ts:91](../../../skills/worker/core/worker/native-worker-ownership.ts#L91) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;TERMINAL&#95;COUNTERS&#95;CHANGED</code> | Use the family construction rule above. | [skills/worker/core/worker/native-worker-ownership.ts:125](../../../skills/worker/core/worker/native-worker-ownership.ts#L125) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;RECOVERY&#95;IDENTITY&#95;CONFLICT</code> | Use the family construction rule above. | [skills/worker/core/worker/native-worker-ownership.ts:175](../../../skills/worker/core/worker/native-worker-ownership.ts#L175) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;DRAIN&#95;LIMIT&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/native-worker-ownership.ts:182](../../../skills/worker/core/worker/native-worker-ownership.ts#L182) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;CAPACITY&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/native-worker-ownership.ts:185](../../../skills/worker/core/worker/native-worker-ownership.ts#L185) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;ADMISSION&#95;FENCED</code> | Use the family construction rule above. | [skills/worker/core/worker/native-worker-ownership.ts:214](../../../skills/worker/core/worker/native-worker-ownership.ts#L214) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;IDENTITY&#95;ALREADY&#95;USED</code> | Use the family construction rule above. | [skills/worker/core/worker/native-worker-ownership.ts:220](../../../skills/worker/core/worker/native-worker-ownership.ts#L220) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;ADMISSION&#95;FENCED</code> | Use the family construction rule above. | [skills/worker/core/worker/native-worker-ownership.ts:230](../../../skills/worker/core/worker/native-worker-ownership.ts#L230) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;UNKNOWN&#95;SCOPE</code> | Use the family construction rule above. | [skills/worker/core/worker/native-worker-ownership.ts:248](../../../skills/worker/core/worker/native-worker-ownership.ts#L248) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;RETIRED&#95;SCOPE&#95;REAPPEARED</code> | Use the family construction rule above. | [skills/worker/core/worker/native-worker-ownership.ts:259](../../../skills/worker/core/worker/native-worker-ownership.ts#L259) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;OWNED&#95;SCOPE&#95;MISSING</code> | Use the family construction rule above. | [skills/worker/core/worker/native-worker-ownership.ts:272](../../../skills/worker/core/worker/native-worker-ownership.ts#L272) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;UNBOUND&#95;SCOPE&#95;UNRESOLVED</code> | Use the family construction rule above. | [skills/worker/core/worker/native-worker-ownership.ts:278](../../../skills/worker/core/worker/native-worker-ownership.ts#L278) |
| <code>Error.message</code> | <code>WORKER&#95;OWNERSHIP&#95;REBIND&#95;FORBIDDEN</code> | Use the family construction rule above. | [skills/worker/core/worker/ownership-store.ts:43](../../../skills/worker/core/worker/ownership-store.ts#L43) |
| <code>Error.message</code> | <code>WORKER&#95;OWNERSHIP&#95;OBSERVATION&#95;REWRITE&#95;FORBIDDEN</code> | Use the family construction rule above. | [skills/worker/core/worker/ownership-store.ts:46](../../../skills/worker/core/worker/ownership-store.ts#L46) |
| <code>Error.message</code> | <code>WORKER&#95;OWNERSHIP&#95;TRANSITION&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/ownership-store.ts:47](../../../skills/worker/core/worker/ownership-store.ts#L47) |
| <code>Error.message</code> | <code>WORKER&#95;OWNERSHIP&#95;CONFIG&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/ownership-store.ts:63](../../../skills/worker/core/worker/ownership-store.ts#L63) |
| <code>Error.message</code> | <code>WORKER&#95;OWNERSHIP&#95;HOST&#95;IDENTITY&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/ownership-store.ts:76](../../../skills/worker/core/worker/ownership-store.ts#L76) |
| <code>Error.message</code> | <code>WORKER&#95;OWNERSHIP&#95;BOOT&#95;IDENTITY&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/ownership-store.ts:77](../../../skills/worker/core/worker/ownership-store.ts#L77) |
| <code>Error.message</code> | <code>WORKER&#95;OWNERSHIP&#95;DIFFERENT&#95;HOST&#95;UNRESOLVED</code> | Use the family construction rule above. | [skills/worker/core/worker/ownership-store.ts:81](../../../skills/worker/core/worker/ownership-store.ts#L81) |
| <code>Error.message</code> | <code>WORKER&#95;OWNERSHIP&#95;LEGACY&#95;HOST&#95;UNPROVEN</code> | Use the family construction rule above. | [skills/worker/core/worker/ownership-store.ts:85](../../../skills/worker/core/worker/ownership-store.ts#L85) |
| <code>Error.message</code> | <code>WORKER&#95;OWNERSHIP&#95;CONFLICT</code> | Use the family construction rule above. | [skills/worker/core/worker/ownership-store.ts:104](../../../skills/worker/core/worker/ownership-store.ts#L104) |
| <code>Error.message</code> | <code>WORKER&#95;OWNERSHIP&#95;STALE&#95;GENERATION</code> | Use the family construction rule above. | [skills/worker/core/worker/ownership-store.ts:110](../../../skills/worker/core/worker/ownership-store.ts#L110) |
| <code>Error.message</code> | <code>WORKER&#95;OWNERSHIP&#95;RECONCILIATION&#95;REQUIRED</code> | Use the family construction rule above. | [skills/worker/core/worker/ownership-store.ts:112](../../../skills/worker/core/worker/ownership-store.ts#L112) |
| <code>Error.message</code> | <code>WORKER&#95;OWNERSHIP&#95;PHASE&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/ownership-store.ts:127](../../../skills/worker/core/worker/ownership-store.ts#L127) |
| <code>Error.message</code> | <code>WORKER&#95;OWNERSHIP&#95;CAS&#95;CONFLICT</code> | Use the family construction rule above. | [skills/worker/core/worker/ownership-store.ts:132](../../../skills/worker/core/worker/ownership-store.ts#L132) |
| <code>Error.message</code> | <code>WORKER&#95;OWNERSHIP&#95;TRANSITION&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/ownership-store.ts:133](../../../skills/worker/core/worker/ownership-store.ts#L133) |
| <code>Error.message</code> | <code>WORKER&#95;OWNERSHIP&#95;CAPACITY&#95;EXCEEDED</code> | Use the family construction rule above. | [skills/worker/core/worker/ownership-store.ts:157](../../../skills/worker/core/worker/ownership-store.ts#L157) |
| <code>Error.message</code> | <code>WORKER&#95;OWNERSHIP&#95;CAPACITY&#95;EXCEEDED</code> | Use the family construction rule above. | [skills/worker/core/worker/ownership-store.ts:159](../../../skills/worker/core/worker/ownership-store.ts#L159) |
| <code>Error.message</code> | <code>WORKER&#95;OWNERSHIP&#95;CAPACITY&#95;EXCEEDED</code> | Use the family construction rule above. | [skills/worker/core/worker/ownership-store.ts:167](../../../skills/worker/core/worker/ownership-store.ts#L167) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;JOURNAL&#95;RECOVERY&#95;REQUIRED</code> | Use the family construction rule above. | [skills/worker/core/worker/native-attempt-recovery.ts:16](../../../skills/worker/core/worker/native-attempt-recovery.ts#L16) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;JOURNAL&#95;OWNERSHIP&#95;UNPROVEN</code> | Use the family construction rule above. | [skills/worker/core/worker/native-attempt-recovery.ts:31](../../../skills/worker/core/worker/native-attempt-recovery.ts#L31) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;RECOVERY&#95;NOT&#95;QUIESCENT</code> | Use the family construction rule above. | [skills/worker/core/worker/native-attempt-recovery.ts:36](../../../skills/worker/core/worker/native-attempt-recovery.ts#L36) |

**Owning / consuming source:**

- [skills/worker/core/worker/native-supervisor-authority.ts:1](../../../skills/worker/core/worker/native-supervisor-authority.ts#L1)
- [skills/worker/core/worker/native-resource-pool.ts:1](../../../skills/worker/core/worker/native-resource-pool.ts#L1)
- [skills/worker/core/worker/native-worker-ownership.ts:1](../../../skills/worker/core/worker/native-worker-ownership.ts#L1)
- [skills/worker/core/worker/ownership-store.ts:1](../../../skills/worker/core/worker/ownership-store.ts#L1)
- [skills/worker/core/worker/native-attempt-recovery.ts:1](../../../skills/worker/core/worker/native-attempt-recovery.ts#L1)

<a id="core-guards-11"></a>

## Worker process and resource completion

**Representation:** own common/worker guard and message family

**Identity / construction:** Source-defined message and guard family. Exact forms below distinguish literal values from symbolic patterns. Returned/forwarded/control outcomes keep their own meanings.

**Trigger:** Bounded launch/control/output, stop faults, aggregate resource budgets, drain and quiescence checks. Fault strings can be returned result fields rather than throws.

**Effect:** First stop usually wins, but drain timeout can overwrite it. Cleanup/flush/control failure can reject instead of returning the result. A drain timeout does not prove termination; disposal requires the actual quiescence conditions.

**Retry boundary:** Use the owning state and original identity to establish whether another attempt is safe. This family has no blanket retry rule.

**Safe next action:** Inspect the first stop, drain and quiescence state before new execution. A timeout does not prove kernel termination or successful disposal.

**Retained evidence:** Preserve the first diagnostic, target and operation identity plus existing journal, receipt, ownership or output evidence. Do not infer that a failed operation erased prior state.

**Consumer / translation:** The named implementation and its actual caller determine the resulting state. A thrown message is not itself a separate code, a terminal result or proof of successful cleanup.

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;PROCESS&#95;LIMIT&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/native-worker-process.ts:45](../../../skills/worker/core/worker/native-worker-process.ts#L45) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;PROCESS&#95;TIMER&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/native-worker-process.ts:48](../../../skills/worker/core/worker/native-worker-process.ts#L48) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;CONTROL&#95;CONFIG&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/native-worker-process.ts:66](../../../skills/worker/core/worker/native-worker-process.ts#L66) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;INPUT&#95;LIMIT</code> | Use the family construction rule above. | [skills/worker/core/worker/native-worker-process.ts:68](../../../skills/worker/core/worker/native-worker-process.ts#L68) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;LAUNCH&#95;FENCED</code> | Use the family construction rule above. | [skills/worker/core/worker/native-process-launches.ts:11](../../../skills/worker/core/worker/native-process-launches.ts#L11) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;ROOT&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/native-resource-scope.ts:16](../../../skills/worker/core/worker/native-resource-scope.ts#L16) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;ROOT&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/native-resource-scope.ts:19](../../../skills/worker/core/worker/native-resource-scope.ts#L19) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;ROOT&#95;POPULATED</code> | Use the family construction rule above. | [skills/worker/core/worker/native-resource-scope.ts:22](../../../skills/worker/core/worker/native-resource-scope.ts#L22) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;ROOT&#95;NOT&#95;DELEGATED</code> | Use the family construction rule above. | [skills/worker/core/worker/native-resource-scope.ts:26](../../../skills/worker/core/worker/native-resource-scope.ts#L26) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;LIMIT&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/native-resource-scope.ts:36](../../../skills/worker/core/worker/native-resource-scope.ts#L36) |
| <code>Error.message</code> | <code>&#96;WORKER&#95;NATIVE&#95;LIMIT&#95;MISMATCH:${name}&#96;</code> | Use the family construction rule above. | [skills/worker/core/worker/native-resource-scope.ts:44](../../../skills/worker/core/worker/native-resource-scope.ts#L44) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;LIMIT&#95;MISMATCH:memory.max</code> | Use the family construction rule above. | [skills/worker/core/worker/native-resource-scope.ts:44](../../../skills/worker/core/worker/native-resource-scope.ts#L44) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;LIMIT&#95;MISMATCH:memory.swap.max</code> | Use the family construction rule above. | [skills/worker/core/worker/native-resource-scope.ts:44](../../../skills/worker/core/worker/native-resource-scope.ts#L44) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;LIMIT&#95;MISMATCH:memory.oom.group</code> | Use the family construction rule above. | [skills/worker/core/worker/native-resource-scope.ts:44](../../../skills/worker/core/worker/native-resource-scope.ts#L44) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;LIMIT&#95;MISMATCH:pids.max</code> | Use the family construction rule above. | [skills/worker/core/worker/native-resource-scope.ts:44](../../../skills/worker/core/worker/native-resource-scope.ts#L44) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;SCOPE&#95;NAME&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/native-resource-scope.ts:77](../../../skills/worker/core/worker/native-resource-scope.ts#L77) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;SCOPE&#95;NOT&#95;EMPTY</code> | Use the family construction rule above. | [skills/worker/core/worker/native-resource-scope.ts:91](../../../skills/worker/core/worker/native-resource-scope.ts#L91) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;SCOPE&#95;NAME&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/native-resource-scope.ts:107](../../../skills/worker/core/worker/native-resource-scope.ts#L107) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;SCOPE&#95;BINDING&#95;CHANGED</code> | Use the family construction rule above. | [skills/worker/core/worker/native-resource-scope.ts:109](../../../skills/worker/core/worker/native-resource-scope.ts#L109) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;UNBOUND&#95;SCOPE&#95;POPULATED</code> | Use the family construction rule above. | [skills/worker/core/worker/native-resource-scope.ts:111](../../../skills/worker/core/worker/native-resource-scope.ts#L111) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;SCOPE&#95;BINDING&#95;CHANGED</code> | Use the family construction rule above. | [skills/worker/core/worker/native-resource-scope.ts:118](../../../skills/worker/core/worker/native-resource-scope.ts#L118) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;SCOPE&#95;BINDING&#95;CHANGED</code> | Use the family construction rule above. | [skills/worker/core/worker/native-resource-scope.ts:123](../../../skills/worker/core/worker/native-resource-scope.ts#L123) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;SCOPE&#95;QUIESCING</code> | Use the family construction rule above. | [skills/worker/core/worker/native-resource-scope.ts:136](../../../skills/worker/core/worker/native-resource-scope.ts#L136) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;DRAIN&#95;TIMEOUT</code> | Use the family construction rule above. | [skills/worker/core/worker/native-resource-scope.ts:158](../../../skills/worker/core/worker/native-resource-scope.ts#L158) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;SCOPE&#95;NOT&#95;QUIESCENT</code> | Use the family construction rule above. | [skills/worker/core/worker/native-resource-scope.ts:166](../../../skills/worker/core/worker/native-resource-scope.ts#L166) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;SCOPE&#95;DISPOSED</code> | Use the family construction rule above. | [skills/worker/core/worker/native-resource-scope.ts:172](../../../skills/worker/core/worker/native-resource-scope.ts#L172) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;SCOPE&#95;IDENTITY&#95;CHANGED</code> | Use the family construction rule above. | [skills/worker/core/worker/native-resource-scope.ts:175](../../../skills/worker/core/worker/native-resource-scope.ts#L175) |

**Owning / consuming source:**

- [skills/worker/core/worker/native-worker-process.ts:1](../../../skills/worker/core/worker/native-worker-process.ts#L1)
- [skills/worker/core/worker/native-process-launches.ts:1](../../../skills/worker/core/worker/native-process-launches.ts#L1)
- [skills/worker/core/worker/native-process-control.ts:1](../../../skills/worker/core/worker/native-process-control.ts#L1)
- [skills/worker/core/worker/native-resource-scope.ts:1](../../../skills/worker/core/worker/native-resource-scope.ts#L1)

<a id="core-guards-12"></a>

## Worker output and evidence

**Representation:** own common/worker guard and message family

**Identity / construction:** Source-defined message and guard family. Exact forms below distinguish literal values from symbolic patterns. Returned/forwarded/control outcomes keep their own meanings.

**Trigger:** Shared byte limits, UTF-8 decoding, durable output append/flush and retained-journal validation.

**Effect:** Bytes may be reserved before decoding/write; a rejected append queue stays rejected. Close does not erase retained output. Returned buffers alone do not prove durable completion.

**Retry boundary:** Use the owning state and original identity to establish whether another attempt is safe. This family has no blanket retry rule.

**Safe next action:** Retain output/journal evidence and inspect decoding, capacity and failed queue state. Closing output does not erase retained data or make an incomplete append durable.

**Retained evidence:** Preserve the first diagnostic, target and operation identity plus existing journal, receipt, ownership or output evidence. Do not infer that a failed operation erased prior state.

**Consumer / translation:** The named implementation and its actual caller determine the resulting state. A thrown message is not itself a separate code, a terminal result or proof of successful cleanup.

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>WORKER&#95;LOG&#95;LIMIT</code> | Use the family construction rule above. | [skills/worker/core/worker/log-decoder.ts:9](../../../skills/worker/core/worker/log-decoder.ts#L9) |
| <code>Error.message</code> | <code>WORKER&#95;LOG&#95;UTF8&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/log-decoder.ts:14](../../../skills/worker/core/worker/log-decoder.ts#L14) |
| <code>Error.message</code> | <code>WORKER&#95;LOG&#95;UTF8&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/log-decoder.ts:18](../../../skills/worker/core/worker/log-decoder.ts#L18) |
| <code>Error.message</code> | <code>WORKER&#95;OUTPUT&#95;SPOOL&#95;CONFIG&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/native-output-spool.ts:28](../../../skills/worker/core/worker/native-output-spool.ts#L28) |
| <code>Error.message</code> | <code>WORKER&#95;OUTPUT&#95;SPOOL&#95;CONFIG&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/native-output-spool.ts:80](../../../skills/worker/core/worker/native-output-spool.ts#L80) |
| <code>Error.message</code> | <code>WORKER&#95;OUTPUT&#95;SPOOL&#95;FILE&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/native-output-spool.ts:86](../../../skills/worker/core/worker/native-output-spool.ts#L86) |
| <code>Error.message</code> | <code>WORKER&#95;OUTPUT&#95;SPOOL&#95;LIMIT</code> | Use the family construction rule above. | [skills/worker/core/worker/native-output-spool.ts:89](../../../skills/worker/core/worker/native-output-spool.ts#L89) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;OUTPUT&#95;LIMIT&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/native-process-output.ts:7](../../../skills/worker/core/worker/native-process-output.ts#L7) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;JOURNAL&#95;BLOB&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/native-journal-state.ts:44](../../../skills/worker/core/worker/native-journal-state.ts#L44) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;JOURNAL&#95;STATE&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/native-journal-state.ts:51](../../../skills/worker/core/worker/native-journal-state.ts#L51) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;JOURNAL&#95;ENVELOPE&#95;DIGEST&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/native-journal-state.ts:55](../../../skills/worker/core/worker/native-journal-state.ts#L55) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;JOURNAL&#95;COMPLETION&#95;TIME&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/native-journal-state.ts:59](../../../skills/worker/core/worker/native-journal-state.ts#L59) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;JOURNAL&#95;COMPLETION&#95;TIME&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/native-journal-state.ts:60](../../../skills/worker/core/worker/native-journal-state.ts#L60) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;JOURNAL&#95;PROCESS&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/native-journal-state.ts:65](../../../skills/worker/core/worker/native-journal-state.ts#L65) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;JOURNAL&#95;PROCESS&#95;NOT&#95;QUIESCENT</code> | Use the family construction rule above. | [skills/worker/core/worker/native-journal-state.ts:68](../../../skills/worker/core/worker/native-journal-state.ts#L68) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;JOURNAL&#95;EXIT&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/native-journal-state.ts:69](../../../skills/worker/core/worker/native-journal-state.ts#L69) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;JOURNAL&#95;MISSING&#95;PROCESS&#95;FAILURE</code> | Use the family construction rule above. | [skills/worker/core/worker/native-journal-state.ts:70](../../../skills/worker/core/worker/native-journal-state.ts#L70) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;JOURNAL&#95;FAULT&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/native-journal-state.ts:72](../../../skills/worker/core/worker/native-journal-state.ts#L72) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;JOURNAL&#95;PATH&#95;INVALID</code> | Use the family construction rule above. | [skills/worker/core/worker/native-journal-state.ts:85](../../../skills/worker/core/worker/native-journal-state.ts#L85) |
| <code>Error.message</code> | <code>WORKER&#95;NATIVE&#95;JOURNAL&#95;CAPACITY&#95;EXCEEDED</code> | Use the family construction rule above. | [skills/worker/core/worker/native-journal-state.ts:87](../../../skills/worker/core/worker/native-journal-state.ts#L87) |

**Owning / consuming source:**

- [skills/worker/core/worker/log-decoder.ts:1](../../../skills/worker/core/worker/log-decoder.ts#L1)
- [skills/worker/core/worker/native-output-spool.ts:1](../../../skills/worker/core/worker/native-output-spool.ts#L1)
- [skills/worker/core/worker/native-process-output.ts:1](../../../skills/worker/core/worker/native-process-output.ts#L1)
- [skills/worker/core/worker/native-journal-state.ts:1](../../../skills/worker/core/worker/native-journal-state.ts#L1)

<!-- END GENERATED: common error catalogue -->
