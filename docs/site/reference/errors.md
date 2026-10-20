# Errors and Safe Diagnostic Routing

Status: bounded reference; discovery limitations stated below
Audience: operator, developer, plugin author, maintainer
Owner: documentation; named components own diagnostic and delivery semantics
Evidence: skills/common/plugin-runtime/foundation/registry/errors.ts; skills/nova/core/execution/stage-executor.ts; skills/worker/core/worker/attempt-executor.ts; skills/worker/core/worker/phase-deadline.ts; skills/prism/server/worker-service.ts; scripts/generate-buster-error-reference.mjs
Applies to: the named diagnostic representations, families and current source boundaries below
Last verified: 2026-10-15; current source behavior checked; no live diagnostic or recovery executed

## Start with the first owning boundary

An error tells you where a boundary rejected or lost confidence in work. It
does not, by itself, prove that no external action occurred. A timeout can
follow a completed remote action whose acknowledgement was lost. A failed
result can also retain cleanup work that has not finished.

Use this page when you have a code, reason, failed result or HTTP error:

1. Preserve the first diagnostic and its cause chain, exact target, time window
   and non-secret run/attempt/job/effect identity. Keep partial output too.
2. Identify the representation in the table below. Do not search only the
   beginning of the human message.
3. Select the owning component and its detailed procedure. Establish whether
   work was rejected, accepted, completed, or remains uncertain before retry.
4. Stop if the owner, terminal receipt, cleanup or target identity cannot be
   established. Preserve the current state for the responsible component owner.

A terminal receipt is the durable record of an operation's final outcome.
A cause chain preserves the underlying failure even when another component
wraps or translates it. Neither a success-shaped HTTP response nor a closed
connection replaces the owning operation's bound result and cleanup evidence.
For the incident setup and independently reachable administration conditions,
use [Diagnose](../use/diagnose.md). For retained-state procedures, use
[Recovery](../use/recovery.md); this hub does not authorize a reset or replay.

## Identify the representation

| What you received | Stable identity | Preserve with it | Interpretation limit |
| --- | --- | --- | --- |
| Foundation `RegistryError` | Its `code` property, not necessarily its message prefix | `details`, message, package/registration/source identity | A type name or valid schema does not grant a capability or activate a package |
| Colon-qualified message | Exact owning prefix and its source-defined suffix rule | Complete original message and cause | A colon does not universally mean the same kind of parameter across components |
| Nova `stage-result.v2` | `outcome` plus lower-case `reason.code` | `reason.message`, run/stage/attempt and original error | A translated `retry` reason is not proof that repeating the external action is safe |
| HTTP JSON error or readiness response | Status, exact JSON `error`, responding service and route | Target/time, response, request/operation identity with secrets removed | Not-ready is not a completed attempt result; a transport failure can leave work uncertain |
| Worker terminal result | Bound result state and its `error.code`/message | Claim/generation, attempt identity, resources, evidence and cleanup | Progress and log text are not terminal authority |
| Buster provider assertion failure | Normal test outcome and findings | Executed/skipped case evidence and provider result | A failed assertion is not automatically an engine exception or unavailable authority |
| External dependency error | Dependency-specific code and underlying cause | Selected dependency/version/endpoint and operation identity | No global KubeClaw meaning or universal retry rule is inferred |

**Source — typed identity and result translation:**
[RegistryError / RegistryErrorCode](../../../skills/common/plugin-runtime/foundation/registry/errors.ts#L1-L38) (`skills/common/plugin-runtime/foundation/registry/errors.ts:1–38`, current-checkout SHA-256 `148025829782ddac5d15ea25736b4ec7a3faefcfabdce152809baf8ed807ce25`). [StageExecutor failure translation and result event](../../../skills/nova/core/execution/stage-executor.ts#L128-L141) (`skills/nova/core/execution/stage-executor.ts:128–141`, current-checkout SHA-256 `4c846993c679c9ce663f7dda0e8de78fd26101e83948dd17211e62f83ea2eafb`).

## Choose the owner and detailed reference

The following is a finite routing index, not an exhaustive code catalogue.
Use the exact emitting site for the condition and the detailed page for its
procedure; do not copy one component's recovery rule to a similar prefix.

| Owner / namespace | First boundary to establish | Detailed route | Retry condition |
| --- | --- | --- | --- |
| Foundation `REGISTRY_*` | Canonical package files, schema, trust, enabled registration and capability selection | [Configuration errors](configuration-errors.md), [plugin use](../use/plugins.md) | Correct the owning rejection; do not widen unrelated grants or bypass trust |
| Platform / project / graph / plan | Exact artifact/version and loader/compiler/resolver condition | [Configuration](configuration.md), [configuration errors](configuration-errors.md) | Invalid unchanged input must be corrected; compiled input is not execution proof |
| Nova run, effect, wait and recovery | Original run/graph/package/effect identity and durable state | [Nova failure families](../understand/nova-core.md), [diagnosis](../use/diagnose.md) | Reconcile uncertain accepted effects before starting a replacement |
| Buster engine/provider/remote result | Stored job, request key, provider result, cleanup and evidence-import state | [Buster error codes](buster-error-codes.md), [Buster recovery](../understand/buster.md) | Use the same existing job/import authority; evidence import failure is not a reason to rerun tests |
| Worker `WORKER_*` and phase families | Envelope, phase, claim expiry, termination and cleanup | [Worker Core](../understand/worker-core.md), [worker profiles](worker-profiles-and-roles.md) | Unsettled work fences new execution; a timeout alone does not prove quiescence |
| Prism `PRISM_*`, service readiness and operation state | Exact responding service, native readiness, profile/budget and durable operation binding | [Prism runtime](../understand/prism-runtime.md), [host configuration](host-and-prism-configuration.md) | Restore required authority without bypassing replay protection or native reconciliation |
| Observer `OBSERVER_*` / `REQUIRED_OBSERVER_*` | Actual subscription, delivery attempts, sink receipt and checkpoint | [Events and delivery](events.md), [telemetry](../understand/telemetry.md) | Use bounded policy and retained identities; do not advance checkpoints manually |
| Audit `AUDIT_*` and journal failures | Correct event file/run, possible acquisition changes, chain integrity | [Audit acquisition](events.md#audit-acquisition-can-change-the-journal) | Preserve original evidence before deciding retry; no unchanged-byte assumption |
| OpenClaw Redis transport | Exact typed transport-policy or dependency error | [Telemetry](../understand/telemetry.md), [environment](environment-variables.md) | Correct the actual dependency/transport condition; do not disable protection to hide the failure |
| Dependency / unknown component | Original cause and actual owner, not a guessed family | [Diagnosis](../use/diagnose.md) | Stop until the operation's outcome and supported recovery are known |

The Buster code page remains the owner of its generated mechanical rows. Its
current generator selects engine JS/TS and plugin `src` JS/TS, excludes tests
and declarations, and follows supported finite local constructions. That scope
is not a global Core, Prism, Worker, Go, C, Python or shell error inventory.
This hub is authored routing and consequence explanation, not another copied
Buster code table or a new generator output.

**Source — bounded Buster discovery:**
[productionFiles / stableCode / valuesFor](../../../scripts/generate-buster-error-reference.mjs#L15-L69) (`scripts/generate-buster-error-reference.mjs:15–69`, current-checkout SHA-256 `83a7b3d025d684b0ebf321362885aaf0094a709efb8dca3a3765539a6f934000`).

## Dynamic families and detail parameters

A stable family can be constructed from a finite prefix/suffix set. Preserve
that construction and the call site: a list of uppercase string literals can
miss typed codes, translated reasons and interpolated families.

| Exact family / parameters | Actual trigger and phase | Effect and safe action |
| --- | --- | --- |
| `WORKER_ATTEMPT_INPUT_{BYTE_LIMIT,NODE_LIMIT,DEPTH_LIMIT,TYPE_INVALID,CYCLE}` | `preflightJson` checks the constructor envelope with the `WORKER_ATTEMPT_INPUT` prefix | Correct the rejected representation and retain the exact limit/detail. This check precedes that executor's operation; do not generalize that ordering to result checks |
| `WORKER_RESULT_{BYTE_LIMIT,NODE_LIMIT,DEPTH_LIMIT,TYPE_INVALID,CYCLE}` | The same helper checks the specialist result after operation and again after optional result finalization | Work can already have happened. Preserve result/attempt/cleanup evidence; changing input and rerunning is not a substitute for resolving the original outcome |
| `${phase}_TIMEOUT` | Deadline helper reaches the named phase limit; non-maintenance claim expiry can instead emit `WORKER_CLAIM_EXPIRED` | Find the actual phase call and its settlement/termination evidence before deciding retry |
| `WORKER_PHASE_UNRESOLVED:${phase}` | Aborted work does not settle within the drain interval, or a later phase is already fenced | Quiescence is unproved. Reconcile owned work; do not treat cancellation as a successful kill |
| `PRISM_NATIVE_BUDGET_NOT_ACCEPTED:{cpuTimeMs,maximumMemoryBytes,maximumTasks}` | Budget is not requested, or a new unrecovered attempt exceeds the host maximum | Correct producer envelope/policy. Recovery status affects the comparison; do not raise host policy inside the Worker to force acceptance |
| `SECURE_REDIS_TRANSPORT_POLICY_VIOLATION` / `MISSING_DEPENDENCY` | Typed transport-policy or dependency constructor | Preserve code/details/dependency/cause separately from the English message; neither is a successful delivery |

In the JSON preflight, `TYPE_INVALID` covers unsupported representations such
as non-plain objects or accessor/non-enumerable properties. `CYCLE` is the
helper's diagnostic for repeated object identity in its traversal; do not
infer a different serializer's behavior from that label. Size/node/depth
checks apply at their actual caller, not at a universal product boundary.

**Source — the two real preflight callers and finite suffixes:**
[preflightJson](../../../skills/worker/core/worker/attempt-executor.ts#L144-L183) (`skills/worker/core/worker/attempt-executor.ts:144–183`, current-checkout SHA-256 `2ae7f5897a79042c601d58da5af682baba0e416e0c4ab302108386e3b619db42`). [constructor input preflight](../../../skills/worker/core/worker/attempt-executor.ts#L218-L223) (`skills/worker/core/worker/attempt-executor.ts:218–223`, current-checkout SHA-256 `2ae7f5897a79042c601d58da5af682baba0e416e0c4ab302108386e3b619db42`). [post-operation result preflight](../../../skills/worker/core/worker/attempt-executor.ts#L421-L425) (`skills/worker/core/worker/attempt-executor.ts:421–425`, current-checkout SHA-256 `2ae7f5897a79042c601d58da5af682baba0e416e0c4ab302108386e3b619db42`). [post-finalization result preflight](../../../skills/worker/core/worker/attempt-executor.ts#L538-L543) (`skills/worker/core/worker/attempt-executor.ts:538–543`, current-checkout SHA-256 `2ae7f5897a79042c601d58da5af682baba0e416e0c4ab302108386e3b619db42`).

**Source — timeout, unresolved work and native budget conditions:**
[WorkerPhaseDeadline settlement, expiry and timeout rules](../../../skills/worker/core/worker/phase-deadline.ts#L17-L54) (`skills/worker/core/worker/phase-deadline.ts:17–54`, current-checkout SHA-256 `13ead2817f0277f8bb7a45b09f42df228bc62e8a0d43e26eabbcbc4f2365e456`). [native profile and budget acceptance](../../../skills/prism/server/native-worker-execution.ts#L28-L40) (`skills/prism/server/native-worker-execution.ts:28–40`, current-checkout SHA-256 `c6618f0f1dfdf61b2c2a126700f3aded99519b20a7ce3b553f21c27f53f3a406`). [RedisTransportPolicyError / MissingDependencyError](../../../skills/common/plugins/openclaw-agent-observer/src/redis-transport.ts#L7-L43) (`skills/common/plugins/openclaw-agent-observer/src/redis-transport.ts:7–43`, current-checkout SHA-256 `cc49831a1ff6eef51642fd47a0e4a1d00d6ad6bb6337c09f709d7cfd5a5f46da`).

## Translation changes the reader's decision

`StageExecutor` turns an `EFFECT_OUTCOME_UNRESOLVED` or `EFFECT_RECOVERY_*`
message into outcome `blocked`, reason `core.effect_reconciliation_required`,
empty artifacts and the preserved original message. Other failures can become
`core.attempt_cancelled`, `core.attempt_timed_out` or
`core.plugin_runtime_failed`. The result is then recorded as an attempt event;
a result's reason and the event's type are different fields.

Do not erase the first error when a wrapper translates it. In particular,
`core.effect_reconciliation_required` means the original effect must be
reconciled, not that no effect occurred. The Worker also promotes unsettled
phase/execution state to `WORKER_PHASE_UNRESOLVED` unless termination itself
failed; the original fault context remains part of its diagnostic.

**Source — unresolved work overrides a misleading terminal interpretation:**
[termination and unresolved result mapping](../../../skills/worker/core/worker/attempt-executor.ts#L573-L582) (`skills/worker/core/worker/attempt-executor.ts:573–582`, current-checkout SHA-256 `2ae7f5897a79042c601d58da5af682baba0e416e0c4ab302108386e3b619db42`).

Readiness is a separate boundary. The selected Prism worker returns HTTP 503
and `PRISM_NATIVE_RECONCILIATION_REQUIRED` while native readiness is false.
In HMAC mode, a failed nonce-database check returns HTTP 503 and
`PRISM_NONCE_DATABASE_UNAVAILABLE`. HMAC is a shared-secret authentication
mechanism. This readiness probe checks nonce-table availability only; it does
not authenticate a request or consume its nonce. Separate per-request
authentication verifies HMAC and consumes the nonce to reject replayed requests.
These readiness errors
do not describe a successful attempt result or authorize bypassing replay
checks. A ready service can still reject a later envelope or budget.

**Source — actual readiness and dispatch branches:**
[serveReadiness / dispatchAttempt](../../../skills/prism/server/worker-service.ts#L72-L93) (`skills/prism/server/worker-service.ts:72–93`, current-checkout SHA-256 `90174f5edf19c85ef1642da95a51aac46854f9a1ce7172d876045a5bac1595e4`).

**Source — availability probe versus per-request authentication:**
[checkWorkerNonceTable availability-only query](../../../skills/prism/server/worker-readiness.ts#L8-L10) (`skills/prism/server/worker-readiness.ts:8–10`, current-checkout SHA-256 `b760fe315ee28b214d1309cb6ac85e16256581168d1bb27070de29ac956d233e`). [WorkerNonceDatabase.run / check / authenticate](../../../skills/prism/server/worker-readiness.ts#L87-L103) (`skills/prism/server/worker-readiness.ts:87–103`, current-checkout SHA-256 `b760fe315ee28b214d1309cb6ac85e16256581168d1bb27070de29ac956d233e`). [PostgresNonceStore.consume conflict detection](../../../skills/prism/server/internal-auth.ts#L26-L49) (`skills/prism/server/internal-auth.ts:26–49`, current-checkout SHA-256 `e0662a6b5237bc081fa346a35739fd2a388bdf20e93fff88ab866f8839b3fc72`). [verifyInternalRequest signature and replay rejection](../../../skills/prism/server/internal-auth.ts#L52-L87) (`skills/prism/server/internal-auth.ts:52–87`, current-checkout SHA-256 `e0662a6b5237bc081fa346a35739fd2a388bdf20e93fff88ab866f8839b3fc72`). [actual worker request authentication before dispatch](../../../skills/prism/server/worker-service.ts#L55-L60) (`skills/prism/server/worker-service.ts:55–60`, current-checkout SHA-256 `90174f5edf19c85ef1642da95a51aac46854f9a1ce7172d876045a5bac1595e4`).

## Runtime target configuration rejection

`RUNTIME_CONFIG_UNKNOWN_TARGET_FIELD:<key>` is an error message, not a typed
`RegistryError.code`. The suffix is the exact unsupported target property name.
For example, `RUNTIME_CONFIG_UNKNOWN_TARGET_FIELD:extraOption` identifies
`extraOption`; it does not identify the target or a failed remote operation.
Preserve the selected target identity separately, without secret values.

For the OpenClaw runtime adapter, `targetsFrom` validates each target against
its explicit allowed-key set. It throws on the first unknown own enumerable
property. `activate` calls this parser before creating the dispatch adapter.
This rejection prevents that activation from returning a usable adapter; it is
not an HTTP response or evidence of a dispatched request. It does not establish
the outcome of work submitted by another adapter instance or an earlier run.

Stop activation retries with unchanged input. Compare the selected target
configuration with the OpenClaw configuration schema and parser for that release.
Correct the misspelled property, or remove an unsupported property after checking
its intended behavior. Do not disable exact-key validation or assume that another
runtime adapter accepts the same fields. Revalidate before activation; a corrected
configuration alone does not prove host readiness or successful task execution.
Reconcile any earlier uncertain operation separately before resubmitting work.

**Source — OpenClaw target keys, exact suffix, parser and activation order:**
[openclaw-config.ts:4–7](https://github.com/datrab/kubeclaw/blob/f99aecbb00cb399b46dfbbeb3ddb375fba6218e7/skills/common/plugins/runtime-dispatch/src/openclaw-config.ts#L4-L7) [openclaw-config.ts:51–54](https://github.com/datrab/kubeclaw/blob/f99aecbb00cb399b46dfbbeb3ddb375fba6218e7/skills/common/plugins/runtime-dispatch/src/openclaw-config.ts#L51-L54) [openclaw-config.ts:82–86](https://github.com/datrab/kubeclaw/blob/f99aecbb00cb399b46dfbbeb3ddb375fba6218e7/skills/common/plugins/runtime-dispatch/src/openclaw-config.ts#L82-L86) [openclaw-adapter.ts:18–24](https://github.com/datrab/kubeclaw/blob/f99aecbb00cb399b46dfbbeb3ddb375fba6218e7/skills/common/plugins/runtime-dispatch/src/openclaw-adapter.ts#L18-L24)

## Diagnose uncertainty before retry

| Observation | First distinction | Preserve / next decision |
| --- | --- | --- |
| Schema or trust rejection | Which validator/owner rejected which exact bytes? | Input/version/package identity and error details; correct only that authority |
| Timeout, disconnected client or lost acknowledgement | Was work accepted, and does a terminal receipt exist? | Original request key/job/effect/attempt; reconcile before a new submission |
| Report or evidence import failed | Did execution already finish while import remained incomplete? | Original result and evidence digests/import state; repair import, not test execution |
| Cleanup or termination unresolved | Can the current owner prove all owned work stopped? | Native scope/process/claim, cleanup and fault evidence; keep new admission fenced |
| Normal failed assertion | Did the required test actually execute and produce findings? | Executed/skipped/missing case data; do not hide an engine failure as a finding |
| Unknown external error | Which dependency and operation own it? | Full first cause and selected version/target; unsupported recovery stays explicit |

For an interrupted diagnostic, retain the first error and partial output
before deciding another attempt. For audit specifically, do not assume the
journal stayed byte-identical: use the [audit acquisition conditions](events.md#audit-acquisition-can-change-the-journal),
including the correctly bound inactive-copy rule when originals must be retained.

Expected completion of diagnosis is an identified owner and cause class, a
supported next action with its stop condition, and the bound evidence needed
to prove recovery and cleanup. A new green status without those identities
does not resolve the original uncertain operation.

## Coverage and maintenance limits

This page covers the selected current Foundation, Nova, Worker, Prism,
Buster-generator and OpenClaw transport sources above. Product-wide emitting,
wrapping, HTTP and result-translation paths across every language and package
have not all been discovered. Dynamic families need their complete callers,
parameters and effect states; a string count is not that proof. Unknown
external codes and unsupported recovery routes remain owned by the relevant
component, not silently assigned a generic retry rule.

Use [Documentation maintenance](../extend/documentation-maintenance.md) when
an error's code, trigger, representation, owner or retry behavior changes.
Keep generated facts separate from authored interpretation; update the affected
reader route as well as the exact source identity. The existing Buster generator
does not generate this central hub. We ran no extractor, diagnostic, audit, restart,
retry, repair or live recovery command for this page.
