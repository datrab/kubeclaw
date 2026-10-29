# Errors and Safe Diagnostic Routing

Status: bounded reference; discovery limitations stated below
Audience: operator, developer, plugin author, maintainer
Owner: documentation; named components own diagnostic and delivery semantics
Evidence: skills/common/plugins/transport-publisher/src/adapter.ts; skills/common/plugins/runtime-dispatch/src/adapter.ts; skills/common/plugins/network-http/src/adapter.ts; skills/nova/core/execution/adapters.ts; skills/common/plugin-runtime/foundation/registry/errors.ts; skills/nova/core/execution/stage-executor.ts; skills/worker/core/worker/attempt-executor.ts; skills/worker/core/worker/phase-deadline.ts; skills/prism/server/worker-service.ts; scripts/generate-buster-error-reference.mjs; tools/native-worker-nri/main.go; scripts/kubernetes-api-probe.mjs; scripts/render-kubernetes-api-probe.mjs
Applies to: the named diagnostic representations, families and current source boundaries below
Last verified: 2026-10-15 original topics; HTTP error chapter source and local probes 2026-10-21; NRI units and API-validator controls 2026-10-21; no live recovery

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

This is a finite routing index, not a complete code catalog.
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
| Native host `NATIVE_NRI_*` | Build/policy-check versus plugin Configure/container callback, selected binary/policy/runtime identity | [Native NRI diagnostics](#native-nri-policy-and-callback-diagnostics), [native fixture-host preparation](../extend/developer-handbook.md#prepare-a-native-worker-fixture-host) | Fix the owning rejection before admission; no automatic K3s/service restart or removal of retained pools/state |
| Kubernetes identity-path `API_PROBE_*` | Original renderer versus actual Job/Pod/origin/token/HTTPS response and matching probe JSON | [Identity-path probe diagnostics](#kubernetes-identity-path-probe-diagnostics), [network/identity boundaries](../understand/security-and-trust.md#network-segmentation-and-negative-paths) | Rendering and a positive path do not prove negative policy or controller state; preserve exact created identities before authorized cleanup |
| Dependency / unknown component | Original cause and actual owner, not a guessed family | [Diagnosis](../use/diagnose.md) | Stop until the operation's outcome and supported recovery are known |

The Buster code page remains the owner of its generated mechanical rows. Its
current generator selects engine JS/TS and plugin `src` JS/TS, excludes tests
and declarations, and follows supported finite local constructions. That scope
is not a global Core, Prism, Worker, Go, C, Python or shell error inventory.
This hub is authored routing and consequence explanation, not another copied
Buster code table or a new generator output.

**Source — bounded Buster discovery:**
[productionFiles / stableCode / valuesFor](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/scripts/generate-buster-error-reference.mjs#L15-L69).

Inspected snapshot SHA-256: `5b7f48767226cbc0a1bbcf310b879052b4aa55919bb60d52985b01f8f7b2424e`.
This identifies that committed source snapshot; recheck changed sources before reuse.

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
[openclaw-config.ts:4–7](https://github.com/datrab/kubeclaw/blob/f99aecbb00cb399b46dfbbeb3ddb375fba6218e7/skills/common/plugins/runtime-dispatch/src/openclaw-config.ts#L4-L7) [openclaw-config.ts:51–54](https://github.com/datrab/kubeclaw/blob/f99aecbb00cb399b46dfbbeb3ddb375fba6218e7/skills/common/plugins/runtime-dispatch/src/openclaw-config.ts#L51-L54) [openclaw-config.ts:82–86](https://github.com/datrab/kubeclaw/blob/f99aecbb00cb399b46dfbbeb3ddb375fba6218e7/skills/common/plugins/runtime-dispatch/src/openclaw-config.ts#L82-L85) [openclaw-adapter.ts:18–24](https://github.com/datrab/kubeclaw/blob/f99aecbb00cb399b46dfbbeb3ddb375fba6218e7/skills/common/plugins/runtime-dispatch/src/openclaw-adapter.ts#L18-L24)

## Signed HTTP publisher and generic runtime errors

These are colon-qualified `Error.message` values, not `RegistryError.code`
properties or public HTTP response schemas. First select the registration:
`kubeclaw.runtime-dispatch:runtime` is generic HTTP; `:openclaw` owns Gateway
sessions. `kubeclaw.transport-publisher:publisher` is signed HTTP, not Redis.
Read their [wire contracts](../understand/communication.md#signed-http-transport-publisher)
and [generic runtime boundary](../understand/openclaw.md#generic-http-runtime-registration)
before applying an error-specific action.

The phase matters. Activation rejection creates no usable adapter. Invocation
admission can fail before that adapter sends, although Core may already retain
an effect intent. Request serialization, Secret resolution, network response
and terminal persistence are separate phases. A response-side error does not
prove the remote operation failed or that a new key is safe.

### Publisher admission and response families

| Exact message or family | Actual trigger and phase | Effect and safe action |
| --- | --- | --- |
| `TRANSPORT_CONFIG_INVALID:unknownField` | Closed publisher configuration contains an unsupported own key. | Activation stops. Correct the selected schema/config, not the exact-key guard. |
| `TRANSPORT_CONFIG_INVALID:targets`, `TRANSPORT_CONFIG_INVALID:target:<id>` | Missing/empty/non-plain target map, invalid target ID or non-plain/extra-field target. | Activation stops. Preserve target identity and correct the configured object. `<id>` is the configured key, not a publication ID. |
| `TRANSPORT_CONFIG_INVALID:endpoint` | URL is absent, malformed, not HTTP(S), or contains credentials/fragment. | Activation stops. Correct the endpoint. This adapter admits external HTTP; HMAC does not provide confidentiality. |
| `TRANSPORT_CONFIG_INVALID:signingSecret:<id>` | Target's Secret name fails the lowercase identifier grammar. | Activation stops. Correct the Secret reference, not its raw value in public logs. |
| `TRANSPORT_CONFIG_INVALID:maxPayloadBytes` | Selected payload limit is not an integer in 1–1,048,576. | Activation stops. Correct the target limit only after checking consumer and network limits. |
| `TRANSPORT_CONFIG_INVALID:deliveryRoot` | Delivery root is absent or empty. | Activation stops. Restore the selected private store owner; do not replace an existing root to bypass history. |
| `TRANSPORT_CONFIG_INVALID:maximumDeliveryRecords`, `TRANSPORT_CONFIG_INVALID:maximumDeliveryBytes` | Selected store limit is not a positive safe integer. | Activation stops. Correct the owning count/byte bound; a larger bound is not free capacity proof. |
| `TRANSPORT_OPERATION_UNSUPPORTED`, `TRANSPORT_RESOURCE_TYPE_INVALID`, `TRANSPORT_TARGET_UNKNOWN:<id>` | Invocation capability/operation, resource type, or configured target does not match. | This publisher sends nothing for that invocation. Correct caller binding/grants/target; do not route through an unrelated adapter. |
| `TRANSPORT_PAYLOAD_UNKNOWN_FIELD`, `TRANSPORT_MESSAGE_INVALID` | Wrapper has extra keys, or `message` is not a plain object. | Rejection precedes request append. Preserve original input and fix the closed `{message: object}` contract. |
| `TRANSPORT_PAYLOAD_INVALID` | Wrapper or nested JSON representation is invalid; includes non-finite numbers, unsupported values/prototypes, control/empty/overlong/prototype keys. | Rejection precedes request append. Correct the exact value/key; do not delete semantic content silently. |
| `TRANSPORT_PAYLOAD_CYCLIC`, `TRANSPORT_PAYLOAD_DEPTH_EXCEEDED` | A container recurs in the current traversal, or message depth exceeds 64. | Rejection precedes request append. Repair the representation. Reused acyclic objects are not automatically cycles. |
| `TRANSPORT_PAYLOAD_SIZE_EXCEEDED` | UTF-8 bytes of the whole serialized `{message}` wrapper exceed the target limit. | Rejection precedes request append. Reduce/split only through a defined message contract or change approved limits; not an unchanged retry. |
| `TRANSPORT_SECRET_RESPONSE_INVALID`, `TRANSPORT_SECRET_INVALID` | Secret response has extra keys, or `value` is empty/non-string/contains CR/LF. | Request and reservation already exist; no publisher network call has started. Resolve the named Secret owner and retain private state. |
| `TRANSPORT_RESPONSE_STATUS_INVALID` | Selected network provider returns a non-integer or non-2xx status to the publisher. | Remote work may exist. Reconcile original key and receiver before retry. Common HTTP can instead throw `HTTP_<status>:<detail>` first. |
| `TRANSPORT_RESPONSE_BODY_INVALID` | Response body is non-plain or has extra keys. | Remote acceptance is uncertain. Preserve private response/effect and fix the selected receiver's ACK shape. |
| `TRANSPORT_PUBLICATION_REJECTED` | Body does not carry `accepted: true`. | No accepted receipt is committed by this branch. Reconcile receiver state; rejection does not prove absence of remote side effects. |
| `TRANSPORT_PUBLICATION_ID_INVALID` | Receiver publication ID fails its 1–256-character ASCII identifier grammar. | Do not invent a replacement ID or accept a bare HTTP 200. Repair/reconcile the receiver under the original key. |

Publisher invocation checks its fence, shutdown flag and initial cancellation
before the request append. It checks cancellation again after Secret resolution
and network completion. `ADAPTER_CANCELLED` can therefore mean before send or
after remote acceptance; `ADAPTER_SHUTTING_DOWN` denies new work, not remote
cancellation. A fence error comes from the caller's current fence authority,
not this message catalog.

After reservation, the publisher attempts to store
`transport-publication-failure.v1` for Secret/network/response/receipt errors,
then rethrows the original error. Stored failure retains a 16-hex-character
reason digest and at most 2,048 message characters, not the original error class,
stack or complete cause. The same attempt rethrows its stored bounded message
without sending; a different attempt can send again. An unresolved reservation
can also re-enter sending. These diagnostics give no evidence of automatic publisher retry or exactly-once delivery.

### Publisher persistence is a separate failure boundary

| Store error | Actual meaning here | Safe action |
| --- | --- | --- |
| `DURABLE_RECORD_IDEMPOTENCY_CONFLICT` | Same target/key request differs from retained payload or owner. Request append can reject before send. | Retain both identities and original payload; investigate the conflicting writer. Do not erase the request or force a new key. |
| `DURABLE_RECORD_SIZE_EXCEEDED`, `DURABLE_RECORD_STORE_FULL` | Record/count/whole-store capacity rejects append or transition. Request/terminal reservation admission occurs before send; a later terminal write can fail after send. | Determine which operation failed. Preserve store/effect/receiver evidence; reconcile remote acceptance before a new publication attempt. |
| `DURABLE_RECORD_TRANSITION_CONFLICT` | Terminal record's retained digest differs from the reserved digest at [compare-and-swap (CAS)](glossary.md#compare-and-swap). | Publisher rereads accepted receipt state; a racing accepted receipt can win. If conflict still escapes, reconcile the original terminal, not a copied receipt or manual digest edit. |
| `DURABLE_RECORD_NOT_FOUND`, `DURABLE_RECORD_RETIRED`, replay/IO errors | Expected state is absent, retired, corrupt or unavailable at its actual store operation. | Stop mutation and preserve the complete root. Restore through its owner or report unsupported recovery; do not construct a successful terminal by hand. |

The publisher can surface a transition error instead of its original error if
persisting the failure also fails. Core's effect receipt and the first private
exception can retain evidence that the bounded terminal alone lacks. Raw message,
remote error text and signing identity are not safe public diagnostics. No
publisher status/reconcile/retirement/backup/restore CLI exists; retain the full
store and use the receiving service's supported reconciliation route.

### Generic runtime dispatch is not Gateway cleanup

| Exact message or family | Actual trigger and phase | Effect and safe action |
| --- | --- | --- |
| `RUNTIME_CONFIG_UNKNOWN_FIELD:<key>`, `RUNTIME_CONFIG_UNKNOWN_TARGET_FIELD:<key>` | Unsupported own configuration/target property. | Activation stops. Suffix is the offending property, not target or response. Generic and OpenClaw target sets differ. |
| `RUNTIME_CONFIG_INVALID:targets`, `RUNTIME_CONFIG_INVALID:target:<id>` | Missing/empty/non-object map, or invalid target ID/value. | Correct the selected generic configuration; no dispatch instance is returned. |
| `RUNTIME_CONFIG_INVALID:endpoint:<id>` | Endpoint is not a string/HTTP(S), or contains URL credentials/fragment. Malformed URL parsing can also throw native `TypeError`. | Correct the actual target URL; preserve the first parser error without credentials. |
| `RUNTIME_CONFIG_INVALID:tokenSecret:<id>`, `RUNTIME_CONFIG_INVALID:plaintextHmac:<id>` | Invalid HMAC Secret name, or non-loopback HMAC endpoint uses plaintext HTTP. | Fix reference/HTTPS selection. Do not bypass authentication to make activation pass. |
| `RUNTIME_CONFIG_INVALID:spiffeProxy:<id>` | Proxy mode points outside loopback. | Restore the selected loopback proxy and authenticated peer policy. A mode string is not proof of mTLS. |
| `RUNTIME_CONFIG_INVALID:maxRequestBytes:<id>`, `RUNTIME_CONFIG_INVALID:maxResponseBytes:<id>` | Effective numeric limit is outside 1–8,388,608 or not a safe integer. | Correct the selected ceiling and schema-admitted value. The selected network provider can impose stricter limits. |
| `RUNTIME_OPERATION_UNSUPPORTED`, `RUNTIME_TARGET_INVALID`, `RUNTIME_TARGET_DENIED:<id>` | Wrong capability/operation/resource/ID, or valid ID absent from the captured target map. | Generic adapter sends nothing at this invocation. Correct caller/grant/configuration, then recreate validated activation if needed. |
| `RUNTIME_PAYLOAD_INVALID`, `RUNTIME_PAYLOAD_KEY_INVALID` | Unsupported JSON representation/key; finite scalars and bounded recursive containers required. | Check whether the helper was validating request or response. Request failure precedes send; response failure can follow remote work. |
| `RUNTIME_PAYLOAD_DEPTH_EXCEEDED`, `RUNTIME_PAYLOAD_ARRAY_EXCEEDED`, `RUNTIME_PAYLOAD_OBJECT_EXCEEDED` | Recursive depth exceeds 20, or one array/object has more than 1,000 entries. | Same helper validates both directions. Repair the owning payload/receiver, not a blind increase of every limit. |
| `RUNTIME_REQUEST_SIZE_EXCEEDED` | Serialized request exceeds configured UTF-8 ceiling. | No generic network call yet. Correct the request or approved limit and retain the original effect identity. |
| `RUNTIME_SECRET_UNAVAILABLE` | Resolved HMAC response has no non-empty string value. | No generic network call yet. Repair the named confidential Secret source, never print the value. |
| `RUNTIME_RESPONSE_STATUS_INVALID`, `RUNTIME_RESPONSE_BODY_INVALID`, `RUNTIME_RESPONSE_SIZE_EXCEEDED` | Provider status is not integer 2xx, body is not a non-array object, or serialized response exceeds its ceiling. | Remote work may exist. Preserve original key/effect and response; reconcile with that receiver. No `accepted` or session schema is imposed by this generic adapter. |
| `RUNTIME_DISPATCH_PROFILE_INVALID`, `RUNTIME_DISPATCH_PROFILE_CAPABILITY_INVALID`, `RUNTIME_DISPATCH_PROFILE_ALREADY_BOUND` | SDK profile object differs from its frozen contract, appears on the wrong capability, or a producer tries to bind it twice. | Correct invocation metadata at its owner. An identically named payload key is ordinary data; do not rewrite a retained run profile. |

`RUNTIME_CONFIG_INVALID:<field>:<id>` uses target identity for the suffix;
`<field>` includes endpoint, tokenSecret, plaintextHmac, spiffeProxy and the two
byte ceilings. Schema validation can reject a configuration before these parser
messages. The shared dispatcher checks cancellation and shutdown before dispatch. The
generic callback also checks cancellation after Secret and network return;
`ADAPTER_CANCELLED` does not identify one universal phase.

Unlike the OpenClaw registration, generic dispatch has no session-stop or cleanup
handshake and no durable job/session store. Lost response or response-side
validation failure requires reconciliation at the original receiver. Repair
its auth/proxy/network/shape/size owner and preserve the same effect/key. Do not
spawn a replacement agent or apply a Redis replay rule to this protocol.

### Selected common HTTP provider and Core translation

These messages belong to `kubeclaw.network-http:http`, not every provider of
`network.http`. The generic dispatcher/publisher use this dependency only when
that provider is selected and its grants/configuration admit the call.

| Exact message or family | Actual trigger and boundary | Safe decision |
| --- | --- | --- |
| `allowedOrigins is required`, `NETWORK_CONFIG_INVALID:allowedHeaders` | Origin list or header allowlist fails parser admission. | Activation cannot complete. Correct selected configuration; malformed URL/method values can produce native parser errors instead. |
| `NETWORK_CONFIG_INVALID:maxRequestBytes`, `NETWORK_CONFIG_INVALID:maxResponseBytes`, `NETWORK_CONFIG_INVALID:timeoutMs` | Numeric network bound is not a positive safe integer. | Correct that bound and consumer limits; no HTTP request by this activation failure. |
| `NETWORK_OPERATION_UNSUPPORTED`, `NETWORK_ORIGIN_DENIED:<origin>`, `NETWORK_CREDENTIALS_DENIED`, `NETWORK_METHOD_DENIED:<method>` | Wrong capability/operation, disallowed origin, URL credentials or method. | Rejection precedes fetch. Preserve normalized target/method; repair exact grants/policy, not a wildcard allowlist. |
| `NETWORK_HEADERS_INVALID`, `NETWORK_HEADER_DENIED:<name>` | Header object is invalid, name not allowed, value not a string or contains CR/LF. | Rejection precedes fetch. Publisher needs its four headers; generic HMAC needs its signature header. Do not expose credential values in a diagnostic. |
| `NETWORK_REQUEST_SIZE_EXCEEDED` | Serialized request exceeds this provider's byte ceiling. | Rejection precedes fetch. An 8 MiB generic-target setting does not override a 1 MiB selected network limit. |
| `NETWORK_REDIRECT_DENIED` | Fetch returned 3xx under manual redirect policy. | No redirect follow occurs. Initial request may already have acted; reconcile before changing target/retrying. |
| `NETWORK_RESPONSE_SIZE_EXCEEDED` | Declared or streamed/decompressed response exceeds byte ceiling. | Work may already have acted. Keep original operation and receiver evidence; body truncation is not a valid ACK. |
| `HTTP_<status>:<detail>` | Non-success response after bounded body read; detail is at most 1,000 characters. | Preserve actual status and private first cause. It can precede publisher/runtime response validation; never infer a successful ACK or safe retry from status alone. |
| `NETWORK_TIMEOUT`, `ADAPTER_CANCELLED` | Selected timeout or caller signal wins during fetch/body read; cancellation preserves signal reason as cause. | A request may have reached the receiver. Reconcile original key; timeout/cancellation proves no remote rollback. |
| Native fetch/URL/JSON exception | DNS/TLS/socket/URL parsing or JSON decoding failed without a custom prefix. | Retain original error/cause and target owner. JSON decoding can fail after remote acceptance; the finite custom-message list is not the only possible diagnostic. |

Core can fail earlier with `CAPABILITY_PROVIDER_MISSING:<capability>`,
`ADAPTER_NOT_READY:<package:registration>` or `ADAPTER_RUNTIME_STOPPING`.
A failed non-confidential effect receipt on either external capability becomes
`EFFECT_OUTCOME_UNRESOLVED:<effectId>:<original message>` in the adapter runtime.
This conservative wrapper can include pre-send validation failures; it does not
prove remote acceptance. Core blocks the stage as
`core.effect_reconciliation_required` rather than authorizing a new operation.

Confidential dependency calls have a different receipt path. A nested Secret or
network error can still emerge as the outer publication/dispatch effect's cause.
For recovery, accepted effects without a receipt can produce
`RECOVERY_EFFECT_OUTCOME_UNRESOLVED:<ids>`; interrupted attempts with retained
external receipts can produce `RECOVERY_EXTERNAL_CONTINUATION_REQUIRED:<ids>`.
These are recovery-entry errors, not HTTP statuses or permission to bypass state.

Retain run/stage/attempt/effect/key, exact provider/registration and original
private input/response/terminal evidence. Determine before-send versus unknown
remote outcome at that boundary. A stage `retry` label does not itself authorize
repeating external work. Use the owner procedure, or stop when no supported
reconciliation exists. Do not weaken canonical `effectRequest` admission merely
to make a maintained integration fixture pass.

> **Source — exact throw/helper sites and consuming translation**
>
> [Publisher exact-key, numeric and URL helpers](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugins/transport-publisher/src/adapter.ts#L25-L60).
>
> [Publisher closed configuration callers](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugins/transport-publisher/src/adapter.ts#L61-L98).
>
> [Publisher payload and Secret validation](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugins/transport-publisher/src/adapter.ts#L100-L158).
>
> [Publisher exact ACK validation](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugins/transport-publisher/src/adapter.ts#L159-L173).
>
> [Publisher admission, request append and attempt reservation](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugins/transport-publisher/src/adapter.ts#L197-L253).
>
> [Publisher network path and success CAS](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugins/transport-publisher/src/adapter.ts#L254-L312).
>
> [Publisher bounded failure and transition-error propagation](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugins/transport-publisher/src/adapter.ts#L313-L339).
>
> [Generic numeric/URL/JSON helper diagnostics](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugins/runtime-dispatch/src/adapter.ts#L14-L59).
>
> [Generic exact config and request admission](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugins/runtime-dispatch/src/adapter.ts#L60-L105).
>
> [Generic request/Secret/network/response ordering](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugins/runtime-dispatch/src/adapter.ts#L107-L147).
>
> [Shared generic fence, cancellation and target dispatch](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugins/runtime-dispatch/src/dispatch-adapter.ts#L14-L38).
>
> [Selected HTTP config/header/timeout boundary](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugins/network-http/src/adapter.ts#L18-L71).
>
> [Selected HTTP response/error and invoke preflight](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugins/network-http/src/adapter.ts#L73-L124).
>
> [Selected HTTP method/header/bytes and fetch call](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugins/network-http/src/adapter.ts#L125-L137).
>
> [SDK profile parse, capability and duplicate-binding failures](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugin-runtime/sdk/src/runtime-dispatch-profile.ts#L1-L29).
>
> [Actual provider selection and failed receipt wrapping](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/nova/core/execution/adapters.ts#L52-L68).
>
> [Actual external continuation set and recovery failures](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/nova/core/execution/effect-recovery.ts#L6-L28).
>
> [Blocked versus cancellation/timeout/retry result translation](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/nova/core/execution/stage-executor.ts#L128-L141).
>
> [Durable request conflict at existing-record lookup](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugin-runtime/foundation/observability/record-retirement.ts#L121-L136).
>
> [Durable CAS, capacity, retirement and write errors](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugin-runtime/foundation/observability/durable-records.ts#L183-L219).
>
> **Claim:** HTTP failures retain adapter-specific diagnostics; Core translates receipts and unresolved recovery into bounded lifecycle decisions.
>
> **Implementation:** The linked helpers, admission paths, network calls, durable transitions and Core consumers define distinct failure boundaries.
>
> **Contract or setting:** Closed configuration, request identity, target, Secret, fence and retained-state checks apply at their named boundaries.
>
> **Test evidence:** No new network, failed-transition or Core integration execution accompanies these throw-site and consumer links.
>
> **Limit:** An HTTP status alone does not establish admission order, a durable outcome or safe replacement work.
>
> **Revision:** `0e35889a3c4e65d5c47ba88e924611aace67eb1d`. Source bindings, not execution receipts.

## Native NRI policy and callback diagnostics

`NATIVE_NRI_*` belongs to the native Worker host integration, not the Worker
attempt/result schema or a Kubernetes HTTP response. Establish whether the
message came from a build, `--check-policy`, plugin startup, or a container
callback. Retain the complete first error, selected binary/policy identities,
node/runtime version and relevant host logs without credentials.

The original `--check-policy POLICY_JSON` mode reads and validates that file,
prints `NATIVE_NRI_POLICY_VALID` on success, and exits. Interpret that string
only after establishing the actual selected binary identity; the installer
executes a supplied bundle binary and does not attest its bytes. This mode
does **not** connect to
containerd, register NRI, create a container, or prove a worker adjustment. This
mode does not itself require real UID 0; the file must satisfy its root-owned
policy checks. Normal plugin startup separately requires real UID 0 and reads
`/etc/kubeclaw/native-nri.json`.

| Exact message | Actual rejecting boundary | Decision before retry |
| --- | --- | --- |
| `NATIVE_NRI_POLICY_NOT_TRUSTED` | Opened policy is not a regular root-owned file, permits group/world writes, exceeds 65,536 bytes, or lacks the required native stat representation. | Stop before installation/start. Verify the selected authority and owner/mode/size; do not make an arbitrary copied policy trusted merely to clear the guard. |
| `NATIVE_NRI_POLICY_TRAILING_DATA` | A first JSON value decoded, but the next decode was not end-of-file. | Inspect the exact selected bytes. Whitespace after one value is allowed; a second value or malformed trailing data is not. First-value JSON/unknown-field errors can instead remain native decoder errors. |
| `NATIVE_NRI_CONFIGURATION_INVALID` | Schema version is not 1, selected containerd version fails the checked-in 2.2-or-later-in-major 2 grammar, or the role map does not contain exactly two entries. | Reconcile the supported policy and actual runtime selection. A version-shaped string is not evidence that the runtime exists or is running it. |
| `NATIVE_NRI_SELECTION_INVALID` | Required `buster`/`prism` selection is absent, namespace/container name fails the exact lower-case label grammar, or policy digest is not 64 lower-case hexadecimal characters. | Correct the owning generated policy and selected workload binding; do not broaden selection to unrelated containers. |
| `NATIVE_NRI_SELECTION_AMBIGUOUS` | Both roles select the same namespace **and** container name. | Resolve role ownership before enabling the plugin. Do not guess which role should own the container. |
| `NATIVE_NRI_SELECTED_RUNTIME_REQUIRED` | Configure receives non-whitespace extra configuration, a runtime other than exact `containerd`, or a different complete selected version. Only a single optional leading `v` is ignored in the version comparison. | Compare the original selected/reported versions, including release/build suffixes. Correct the actual runtime/policy authority, not the comparison guard. |
| `NATIVE_NRI_SUPERVISOR_SELECTION_REJECTED` | A nonempty role annotation selects no configured role, the Pod namespace differs, or the policy annotation differs. These checks precede the container-name check. | Preserve Pod/role/policy identity and investigate the mismatch. An unannotated Pod is ignored; a different container is ignored only after the Pod's selection checks pass. |
| `NATIVE_NRI_SANDBOX_BINDING_REQUIRED` | Selected Pod ID or UID is empty, or the container's sandbox ID differs from the Pod's ID. | Stop this admission and resolve the original sandbox binding. This branch returns no adjustment; it does not prove the fate of earlier containers. |
| `NATIVE_NRI_PLUGIN_IDENTITY_INVALID` | An SDK launcher-supplied plugin name/index differs from `kubeclaw-native`/`10`. Missing values use the original fallback options. | Check the actual launcher identity and selected binary. Successful local stub construction is not plugin registration or workload-adjustment evidence. |
| `NATIVE_NRI_HOST_ROOT_REQUIRED` | Normal plugin startup has nonzero real UID. | Use the approved native-host owner/runtime setup. Do not turn an unprivileged shared developer environment into that host. |

File open/stat, JSON decode, NRI SDK construction and SDK run failures can retain
native error text rather than a `NATIVE_NRI_*` prefix. Normal main prints a
returned error to stderr and exits 1. The selected container callback returns its
error and no adjustment at the rejecting site; the SDK/container runtime owns
the upstream lifecycle. This namespace gives no universal rollback, durable attempt result or safe
restart.

The builder has separate `NATIVE_NRI_BUILD_OUTPUT_EXISTS` and
`NATIVE_NRI_SELECTED_GO_VERSION_REQUIRED` guards. It checks the PATH-selected Go
version against central `GO_VERSION`, verifies modules, and builds a new output
path. A build path printed to stdout is not proof that an installed plugin has
those bytes or that its target OS/architecture matches another host.

The initial installer validates the bundled policy before installing host files,
refuses an existing installation, and starts the pool service without activating
NRI. The AX41 activation and historical launch-repair scripts have separate,
mutating host prerequisites and restart K3s. Do **not** run either merely because
a diagnostic has this prefix. They are not a generic retry or rollback command;
a later failure can follow installed files or a service/runtime restart. Keep
the exact bundle/backup and first failure for the host owner. Do not delete live
pools, retained ownership state or installed authority files to make readiness
green. Use the [native fixture-host boundary](../extend/developer-handbook.md#prepare-a-native-worker-fixture-host)
and [native pool policy](worker-profiles-and-roles.md#native-pool-policy).

> **Source — exact emitter, entry mode and selected callers**
>
> **Claim:** Policy-check, startup and selected callback failures have the distinct
> rejecting boundaries above; build/install/activation are separate operations.
>
> **Implementation:** [Original NRI policy loader and validation](https://github.com/datrab/kubeclaw/blob/cfc97be096908c1193877d054bb80662120f1eca/tools/native-worker-nri/main.go#L36-L85),
> [Configure/container callback and launcher identity](https://github.com/datrab/kubeclaw/blob/cfc97be096908c1193877d054bb80662120f1eca/tools/native-worker-nri/main.go#L87-L132),
> [startup versus policy-check mode](https://github.com/datrab/kubeclaw/blob/cfc97be096908c1193877d054bb80662120f1eca/tools/native-worker-nri/main.go#L134-L167).
>
> **Contract/setting:** [Policy fields](https://github.com/datrab/kubeclaw/blob/cfc97be096908c1193877d054bb80662120f1eca/tools/native-worker-nri/main.go#L23-L33),
> [selected Go and SDK module versions](https://github.com/datrab/kubeclaw/blob/cfc97be096908c1193877d054bb80662120f1eca/tools/native-worker-nri/go.mod#L1-L10),
> [central Go selection](https://github.com/datrab/kubeclaw/blob/cfc97be096908c1193877d054bb80662120f1eca/versions.json#L20-L22).
> [Exact builder guards](https://github.com/datrab/kubeclaw/blob/cfc97be096908c1193877d054bb80662120f1eca/scripts/build-native-worker-nri.mjs#L8-L19),
> [initial validation and existing-install stop](https://github.com/datrab/kubeclaw/blob/cfc97be096908c1193877d054bb80662120f1eca/scripts/install-native-worker-pools-stage.sh#L7-L32),
> [installation/start and explicit remaining limits](https://github.com/datrab/kubeclaw/blob/cfc97be096908c1193877d054bb80662120f1eca/scripts/install-native-worker-pools-stage.sh#L45-L66),
> [AX41 activation prerequisites and selected-policy checks](https://github.com/datrab/kubeclaw/blob/cfc97be096908c1193877d054bb80662120f1eca/scripts/activate-native-worker-ax41.sh#L15-L59),
> [activation writes, restart and verification limits](https://github.com/datrab/kubeclaw/blob/cfc97be096908c1193877d054bb80662120f1eca/scripts/activate-native-worker-ax41.sh#L60-L102),
> [historical launch repair's exact scope](https://github.com/datrab/kubeclaw/blob/cfc97be096908c1193877d054bb80662120f1eca/scripts/repair-native-nri-launch.sh#L5-L35).
>
> **Test evidence:** The original [launcher identity tests](https://github.com/datrab/kubeclaw/blob/cfc97be096908c1193877d054bb80662120f1eca/tools/native-worker-nri/main_test.go#L19-L43),
> [Configure version-prefix test](https://github.com/datrab/kubeclaw/blob/cfc97be096908c1193877d054bb80662120f1eca/tools/native-worker-nri/main_test.go#L45-L61),
> [NRI wire/OCI serialization test](https://github.com/datrab/kubeclaw/blob/cfc97be096908c1193877d054bb80662120f1eca/tools/native-worker-nri/main_test.go#L78-L131),
> [selection tests](https://github.com/datrab/kubeclaw/blob/cfc97be096908c1193877d054bb80662120f1eca/tools/native-worker-nri/main_test.go#L133-L159) and
> [runtime/root-owned-file controls](https://github.com/datrab/kubeclaw/blob/cfc97be096908c1193877d054bb80662120f1eca/tools/native-worker-nri/main_test.go#L161-L206)
> completed with `go test -mod=readonly -count=1 -json ./...` using Go 1.26.5
> and private fresh caches: five top-level tests and six subtests passed, with
> no failures or skips. This observed unit process ran with real UID 0 and
> exercised root-owned temporary-file guards; it was not a prepared native
> Worker host or a general non-root reproduction claim. Original source and
> module-file bytes were unchanged.
>
> **Revision:** `cfc97be096908c1193877d054bb80662120f1eca`; linked program, test and
> setting bytes were checked against this revision.
>
> **Limit:** These unit checks exercise SDK construction, Configure, serialized
> OCI changes and selected policy-file controls—not SDK registration, a native
> host, kernel isolation, containerd execution or recovery. They do not execute
> installation/activation or establish every error branch.

## Kubernetes identity-path probe diagnostics

`API_PROBE_*` belongs to the standalone Kubernetes identity-path probe, not
`kubeclaw.network-http:http` or a universal HTTP error namespace. The renderer
prints a ConfigMap and Job; it does not apply or run them. Its
`API_PROBE_RUNNING_SOURCE_POD_REQUIRED` name checks Pod kind, nonempty UID,
ServiceAccount and node fields—not Pod phase or live ownership. A local Pending
Pod-shaped fixture passes this guard. Use independently observed current Pod
identity before treating a rendered probe as evidence for a workload.

The rendered probe Pod template copies that Pod's labels, ServiceAccount and selected node,
mounts the probe/options through the same-named ConfigMap, and uses the centrally
pinned Node image. It has `backoffLimit:0`, an active deadline of 600 seconds and
`restartPolicy:Never`. Its readiness probe intentionally fails. That does not
prove universal exclusion from Service traffic: selectors, policy and Service
`publishNotReadyAddresses` remain separate receiving conditions.

| Exact message or family | Actual boundary | Decision before retry |
| --- | --- | --- |
| `API_PROBE_RUNNING_SOURCE_POD_REQUIRED`, `API_PROBE_PINNED_IMAGE_REQUIRED` | Renderer lacks the named source fields, or central Node image lacks its required digest suffix. | Stop before applying rendered objects. Verify the original Pod/image selection; rendering alone is not cluster or image-acquisition proof. |
| `API_SERVICE_AND_ENDPOINT_ORIGINS_REQUIRED` | Origins are not an array of 2–32 entries distinct under the raw JavaScript `Set` comparison. This is not normalized-URL uniqueness. | Supply the approved Service origin plus selected endpoint origins. Equivalent IP-origin spellings can pass as separate entries; do not infer independent network paths or replace a rejected endpoint with an unrelated reachable host. |
| `API_PROBE_HTTPS_ORIGIN_REQUIRED` | Parsed URL is not HTTPS or includes credentials, a non-root path, query or fragment. | Correct the exact origin. URL construction can also throw a native parser error; do not print credential-bearing input. |
| `API_PROBE_SERVICE_443_REQUIRED` | First URL is not `kubernetes.default.svc` with no explicit nondefault port. | Restore the selected Service origin. Native URL normalization can remove an explicit default 443 port; the guard tests the parsed URL. |
| `API_PROBE_ENDPOINT_IP_REQUIRED` | A later URL hostname is not an IP address. | Use the actual approved endpoint IPs, not guessed DNS aliases. Origin validation is not reachability proof. |
| `API_PROBE_IDENTITY_INVALID`, `API_PROBE_WRONG_SERVICE_ACCOUNT` | Namespace/SA fails the regular-expression test after JavaScript coercion, or decoded token `sub` differs from the interpolated `system:serviceaccount:<namespace>:<SA>`. There is no preceding string-type guard. | Resolve the original workload/token binding and actual value types. Values such as `null` and `7` can pass the regex and fail later at file/token handling instead. Local payload decoding is not signature verification, RBAC validation or proof that the API accepted the token. |
| `API_PROBE_HTTP_<status>` | A selected origin returns a status other than 200; that response is destroyed rather than followed as a redirect. | Retain the actual status, origin and original probe/Pod identity. Check the selected API, authentication, authorization, transport and proxy owner; the code does not distinguish those causes. It is not a reason to widen policy or replace credentials blindly. |
| `API_PROBE_RESPONSE_LIMIT`, `API_PROBE_RESPONSE_INVALID`, `API_PROBE_NOT_KUBERNETES_SERVICE_LIST` | Response exceeds 8 MiB, JSON cannot be decoded, or body lacks `kind: ServiceList` and array `items`. | Preserve partial output/first cause. Inspect the actual responder and representation; a successful connection or 200 status is insufficient. |
| Native file/token/URL/HTTPS error | Reading token/CA, decoding token JSON, parsing URL, TLS/socket/DNS or the per-request 15-second abort failed without a custom code. | Preserve the first exception and selected identity/time. There is no probe-specific code for every native failure; do not relabel all failures as an HTTP status. |

Origin distinctness is checked before URL parsing. For example, the Service
origin followed by `https://127.0.0.1` and `https://127.0.0.1:443/` passes despite
the two endpoint strings normalizing to the same origin. The identity regex also
does not establish string types: a later missing-token-file error can occur
without `API_PROBE_IDENTITY_INVALID`. Preserve the actual input and first error;
do not infer supported typed input or authentication from these admission tests.

The child reads its projected token/CA and sequentially GETs
`/api/v1/namespaces/<namespace>/services?limit=1` at each origin. TLS uses the
provided CA and `kubernetes.default.svc` server name even for endpoint-IP URLs.
Success is one JSON object with `ok`, decoded ServiceAccount subject and checked
origins. It is not a signed receipt or continuous readiness guarantee. The
returned exclusions explicitly leave negative private-target policy, CNI drop
verdicts and controller reconciliation unproved.

This inspected standalone renderer/probe pair supplies no apply/log/cleanup
orchestrator. Rendering again creates a new random name, not a retry of
an existing Job identity. Retain the actual created Job/ConfigMap names, source
Pod UID, selected image/origins, Job conditions, Pod/container exit status and
complete logs before any authorized cleanup. Job completion without matching
probe JSON is not this check's success. The renderer sets no completed-Job TTL
and no ConfigMap owner reference; do not promise automatic cleanup of both.
Clean only owner-approved exact created objects, never source Pods, broad label
matches or unrelated policy. Use the [network/identity boundary](../understand/security-and-trust.md#network-segmentation-and-negative-paths)
when deciding what a positive path probe leaves unproved.

> **Source — standalone renderer, read-only request and actual result**
>
> **Claim:** The standalone renderer admits source fields and prints objects;
> the probe validates origins/decoded subject and reports bounded GET results,
> not universal workload, network-policy or recovery evidence.
>
> **Implementation:** [Renderer admission and source identity/options](https://github.com/datrab/kubeclaw/blob/cfc97be096908c1193877d054bb80662120f1eca/scripts/render-kubernetes-api-probe.mjs#L6-L20),
> [Job, identity/node selection and printed YAML](https://github.com/datrab/kubeclaw/blob/cfc97be096908c1193877d054bb80662120f1eca/scripts/render-kubernetes-api-probe.mjs#L21-L39),
> [Origin and decoded-subject guards](https://github.com/datrab/kubeclaw/blob/cfc97be096908c1193877d054bb80662120f1eca/scripts/kubernetes-api-probe.mjs#L7-L44),
> [HTTPS/status/bytes/body and CLI output](https://github.com/datrab/kubeclaw/blob/cfc97be096908c1193877d054bb80662120f1eca/scripts/kubernetes-api-probe.mjs#L47-L72).
>
> **Contract/setting:** [Central Node image selection](https://github.com/datrab/kubeclaw/blob/cfc97be096908c1193877d054bb80662120f1eca/versions.json#L29-L32);
> the linked renderer fixes Job retry/deadline, projected identity and node
> placement, while the linked probe supplies origin/subject and response guards.
>
> **Test evidence:** No maintained standalone test suite for this inspected
> pair was found. Eight author-owned non-live controls exercised the original
> validator/renderer (including Pending-Pod acceptance and missing-UID rejection).
> Two separate reviewer-owned controls confirmed that the validator accepts
> equivalent endpoint spellings and that coercive non-string identities reach
> missing-token `ENOENT` before HTTPS. These are bounded controls, not an invented test
> suite or a live request result.
>
> **Revision:** `cfc97be096908c1193877d054bb80662120f1eca`; linked program and
> setting bytes were checked against this revision.
>
> **Limit:** No token or CA acquisition, HTTPS request, created Job, API apply,
> CNI/kernel check or live recovery was established by these controls. The
> reviewer missing-token control invoked the original verifier but stopped at
> file acquisition; the author controls did not invoke its request path.

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
does not generate this central hub. The HTTP chapter has local bounded probes,
not a product-wide extractor. No deployed diagnostic, restart, repair or live
recovery ran for this page.
