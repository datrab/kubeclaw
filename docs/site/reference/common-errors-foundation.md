# Foundation, plugins and shared contracts — error catalogue

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

- [AgentObservabilityContractError](#js-shared-agentobservabilitycontracterror)
- [PipelineTestGateContractError](#js-shared-pipelinetestgatecontracterror)
- [PipelineWorkerCoreContractError](#js-shared-pipelineworkercorecontracterror)
- [PrismContractError](#js-shared-prismcontracterror)
- [RegistryError](#js-shared-registryerror)
- [CommandRunError](#js-shared-commandrunerror)
- [RedisTransportPolicyError](#js-shared-redistransportpolicyerror)
- [MissingDependencyError](#js-shared-missingdependencyerror)
- [OpenClawToolRejectedError](#js-shared-openclawtoolrejectederror)
- [requireIdentity — skills/common/plugin-runtime/foundation/observability/durable-attempts.ts](#j15-helper-1)
- [positiveInteger — skills/common/plugin-runtime/foundation/observability/durable-records.ts](#j15-helper-2)
- [identity — skills/common/plugin-runtime/foundation/observability/durable-records.ts](#j15-helper-3)
- [positiveInteger — skills/common/plugins/prompt-contract/src/index.ts](#j15-helper-4)
- [text — skills/common/plugins/prompt-contract/src/index.ts](#j15-helper-5)
- [Published pair guard failure construction](#j16-published-pair)
- [Operator configuration URL/key error factories](#j16-operator-config)
- [HTTP request failure/cancellation and bounded upstream response](#j17-network-request)
- [Redis socket exchange failure settlement](#j17-redis-exchange)
- [Notification delivery reservation, persisted failure and receipt reconciliation](#j17-notification-durable-replay)
- [Transport publication persisted failure forwarding](#j17-transport-publication-replay)
- [Agent event queue capacity and emission diagnostics](#j18-ingress-capacity)
- [Ingress drain cancellation and deadline](#j18-ingress-drain)

<a id="js-shared-agentobservabilitycontracterror"></a>

## AgentObservabilityContractError

**Representation:** constructor family

**Identity / construction:** code: No .code assignment.. message: Invalid agent observability ingress event: plus argument1 errors joined by semicolon-space.. errors: Copy argument1. current validator manual arrays and complexity errors. Not code enumeration.

**Trigger:** assert wrapper receives failed manual/complexity validation.

**Effect:** Throws before normalized ingress event returns. check/is wrappers return data/boolean instead.

**Retry boundary:** No retry in validation owner.

**Safe next action:** Use the exact errors array to identify rejected fields. no automatic normalization acceptance.

**Retained evidence:** Copied errors. invalid event is not a valid returned ingress event.

**Consumer / translation:** No separate code field. Super message formats definition and joined validation errors. errors copy retained. check functions return ok/errors. validate/assert wrappers throw. AJV instancePath/message data and authored semantic errors differ. Generated observer copies reuse canonical Source provenance, not duplicate authority.

**Representative source constructions (not executed by this reference):**

```text
new AgentObservabilityContractError(result.errors)
```

**Owning / consuming source:**

- [contracts/agent-observability/v1/src/validation.ts:56](../../../contracts/agent-observability/v1/src/validation.ts#L56)
- [contracts/agent-observability/v1/src/complexity.ts:1](../../../contracts/agent-observability/v1/src/complexity.ts#L1)
- [contracts/pipeline-test-gate/v1/src/coverage-result.ts:1](../../../contracts/pipeline-test-gate/v1/src/coverage-result.ts#L1)

<a id="js-shared-pipelinetestgatecontracterror"></a>

## PipelineTestGateContractError

**Representation:** constructor family

**Identity / construction:** code: No .code assignment.. message: Invalid pipeline test-gate plus argument1 definition and argument2 joined errors.. definition: Public constructor string. current validate wrapper uses exported definition union, not closed arbitrary construction domain.. errors: Copy argument2. AJV formatted errors plus semantic relation arrays.

**Trigger:** validate wrapper receives failed schema/relation check.

**Effect:** Throws. check function can instead return ok:false/errors.

**Retry boundary:** No retry in validation owner.

**Safe next action:** Correct according to bound definition/schema/relation errors. upstream AJV strings remain diagnostic.

**Retained evidence:** definition and copied errors. no caller rollback implied.

**Consumer / translation:** No separate code field. Super message formats definition and joined validation errors. errors copy retained. check functions return ok/errors. validate/assert wrappers throw. AJV instancePath/message data and authored semantic errors differ. Generated observer copies reuse canonical Source provenance, not duplicate authority.

**Representative source constructions (not executed by this reference):**

```text
new PipelineTestGateContractError(definition, result.errors)
```

**Owning / consuming source:**

- [contracts/pipeline-test-gate/v1/src/validation.ts:71](../../../contracts/pipeline-test-gate/v1/src/validation.ts#L71)
- [contracts/agent-observability/v1/src/complexity.ts:1](../../../contracts/agent-observability/v1/src/complexity.ts#L1)
- [contracts/agent-observability/v1/src/validation.ts:1](../../../contracts/agent-observability/v1/src/validation.ts#L1)

<a id="js-shared-pipelineworkercorecontracterror"></a>

## PipelineWorkerCoreContractError

**Representation:** constructor family

**Identity / construction:** code: No .code assignment.. message: Invalid pipeline worker-core plus argument1 definition and argument2 joined errors.. definition: Public constructor string. V1 definition union, V2/V3 three definitions plus explicit .v2/.v3 suffix.. errors: Copy argument2. V1 formatted AJV/relation errors. V2/V3 JSON-stringified AJV errors and accounting/binding checks.

**Trigger:** V1/V2/V3 validate wrapper receives failed corresponding check.

**Effect:** Throws with exact definition or version suffix. binding checks themselves return diagnostic data.

**Retry boundary:** No retry in validation owner.

**Safe next action:** Use actual version/schema/accounting/binding predicates. do not substitute V1 diagnostics for V2/V3.

**Retained evidence:** definition/errors. resource unknown/unavailable must not become fabricated numeric zero.

**Consumer / translation:** No separate code field. Super message formats definition and joined validation errors. errors copy retained. check functions return ok/errors. validate/assert wrappers throw. AJV instancePath/message data and authored semantic errors differ. Generated observer copies reuse canonical Source provenance, not duplicate authority.

**Representative source constructions (not executed by this reference):**

```text
new PipelineWorkerCoreContractError(`${definition}.v2`,checked.errors)
```

```text
new PipelineWorkerCoreContractError(`${definition}.v3`, checked.errors)
```

**Owning / consuming source:**

- [contracts/pipeline-worker-core/v1/src/validation.ts:33](../../../contracts/pipeline-worker-core/v1/src/validation.ts#L33)
- [contracts/pipeline-worker-core/v1/src/resource-validation-v2.ts:42](../../../contracts/pipeline-worker-core/v1/src/resource-validation-v2.ts#L42)
- [contracts/pipeline-worker-core/v1/src/resource-validation-v3.ts:51](../../../contracts/pipeline-worker-core/v1/src/resource-validation-v3.ts#L51)

<a id="js-shared-prismcontracterror"></a>

## PrismContractError

**Representation:** constructor family

**Identity / construction:** code: Argument1. local Admission.fail and direct semantic guards have observed literals. exported constructor accepts string.. scope: Argument2 scope.. message: scope + colon-space + code.

**Trigger:** JSON complexity Admission or semantic-document bound guard fails.

**Effect:** Rejects guarded contract work. code and scope remain distinct.

**Retry boundary:** No retry policy supplied.

**Safe next action:** Inspect violated exact complexity/semantic guard. increasing limits is not prescribed.

**Retained evidence:** scope/code/message. no claimed mutation rollback.

**Consumer / translation:** code and scope separate. message scope:code. Shared Admission.fail forwards actual local finite literals through object/primitive/run. scope is caller-provided string. `JSON_BYTES/NODES/DEPTH/PROPERTIES/CYCLE/ARRAY/PROPERTY/VALUE` conditions are exact checks, not retryable status.

**Representative source constructions (not executed by this reference):**

```text
new PrismContractError(code, this.scope)
```

```text
new PrismContractError('SEMANTIC_WORK_EXCEEDED', 'PRISM_INPUT_INVALID: designDocument')
```

**Owning / consuming source:**

- [contracts/prism/v1/src/complexity.ts:3](../../../contracts/prism/v1/src/complexity.ts#L3)
- [contracts/prism/v1/src/document-semantics.ts:41](../../../contracts/prism/v1/src/document-semantics.ts#L41)
- [contracts/prism/v1/src/index.ts:2](../../../contracts/prism/v1/src/index.ts#L2)

<a id="js-shared-registryerror"></a>

## RegistryError

**Representation:** constructor family

**Identity / construction:** code: Argument1 typed RegistryErrorCode union. Allowed vocabulary is not emitted-domain or runtime membership proof.. message: Argument2, separate from code.. details: Shallow frozen copy of argument3, default empty object.

**Trigger:** Registry discovery/build/configuration/capability/schema/import/activation guard fails at actual selected call.

**Effect:** Throw before that guarded operation continues. activation preserves RegistryError and wraps other caught errors as `REGISTRY_ACTIVATION_FAILED`.

**Retry boundary:** No automatic retry policy assigned by this class.

**Safe next action:** Resolve the exact failed guard. no blanket retry or repair command established.

**Retained evidence:** details preserved, possibly original cause message. no rollback proof for earlier activation/reads.

**Consumer / translation:** code is typed RegistryErrorCode argument1. message argument2. immutable shallow-copied details argument3. Neither message nor class name is code. Declaration union is allowed vocabulary, not evidence each member is emitted. Activation preserves RegistryError and wraps other causes as `REGISTRY_ACTIVATION_FAILED` with context.

**Representative source constructions (not executed by this reference):**

```text
new RegistryError(
        'REGISTRY_PACKAGE_INTEGRITY_MISMATCH',
        `Plugin package changed after discovery: ${pkg.manifest.id}`,
        {
          pluginId: pkg.manifest.id,
          expectedDigest: pkg.provenance.package.contentDigest,
          actualDigest: currentDigest,
        },
      )
```

```text
new RegistryError(
        'REGISTRY_ACTIVATION_FAILED',
        'External capability adapters require a persistent isolated adapter runtime',
      )
```

**Owning / consuming source:**

- [skills/common/plugin-runtime/foundation/registry/errors.ts:28](../../../skills/common/plugin-runtime/foundation/registry/errors.ts#L28)
- [skills/common/plugin-runtime/foundation/registry/activation.ts:34](../../../skills/common/plugin-runtime/foundation/registry/activation.ts#L34)
- [skills/common/plugin-runtime/foundation/registry/build.ts:36](../../../skills/common/plugin-runtime/foundation/registry/build.ts#L36)

<a id="js-shared-commandrunerror"></a>

## CommandRunError

**Representation:** constructor family

**Identity / construction:** code: Parameter named code is passed to super. no .code property.. message: Argument1. current #settle forwards error.message.. output: Argument2 result output facts retained.. cause: Argument3 ErrorOptions supplies cause.

**Trigger:** CommandExecution settles a pending operational/cleanup fault, not merely child nonzero exit.

**Effect:** Rejects with output/cause. child nonzero without pending error can resolve result.

**Retry boundary:** No automatic retry from class.

**Safe next action:** Inspect output/cause and actual cleanup outcome before any new execution.

**Retained evidence:** Output facts and original cause retained. rejection does not prove command made no changes.

**Consumer / translation:** Argument named code is message, not .code property. #settle(error) forwards arbitrary error.message plus output facts and cause. Pending operational fault vs cleanup error differs. exit status alone without error resolves output, including nonzero child code. No blanket command-nonzero=throw.

**Representative source constructions (not executed by this reference):**

```text
new CommandRunError(error.message, result, { cause: error })
```

**Owning / consuming source:**

- [skills/common/plugins/command-runner/src/types.ts:45](../../../skills/common/plugins/command-runner/src/types.ts#L45)
- [skills/common/plugins/command-runner/src/execution.ts:79](../../../skills/common/plugins/command-runner/src/execution.ts#L79)
- [skills/buster/engine/test-gates/direct-command-runtime.ts:4](../../../skills/buster/engine/test-gates/direct-command-runtime.ts#L4)

<a id="js-shared-redistransportpolicyerror"></a>

## RedisTransportPolicyError

**Representation:** constructor family

**Identity / construction:** code: `REDIS_TRANSPORT_POLICY_ERROR_CODE` constant.. message: Secure Redis transport policy violation: plus argument1.. details: Argument2 or empty object. not immutable copy.

**Trigger:** Redis port/host/security policy guard rejects config.

**Effect:** Client factory throws. writer catches factory error, records diagnostic and unavailable client.

**Retry boundary:** No promise of recovery by retrying same invalid configuration.

**Safe next action:** Inspect exact rejected configuration and transport authority.

**Retained evidence:** details. shifted queued item may become droppedWriteFailure, separate from deadletter branch.

**Consumer / translation:** Redis policy .code constant `SECURE_REDIS_TRANSPORT_POLICY_VIOLATION` differs from formatted message and details. MissingDependencyError .code `MISSING_DEPENDENCY` with dependency and optional cause. actual loader ioredis/export check wrapped. withTimeout message argument supplied by callers. race timeout is not cancellation of original operation.

**Representative source constructions (not executed by this reference):**

```text
new RedisTransportPolicyError('REDIS_PORT is required for agent observability Redis clients', { port: value })
```

```text
new RedisTransportPolicyError('REDIS_PORT must be an integer between 1 and 65535', { port: value })
```

**Owning / consuming source:**

- [skills/common/plugins/openclaw-agent-observer/src/redis-transport.ts:16](../../../skills/common/plugins/openclaw-agent-observer/src/redis-transport.ts#L16)
- [skills/common/plugins/openclaw-agent-observer/src/redis-writer.ts:1](../../../skills/common/plugins/openclaw-agent-observer/src/redis-writer.ts#L1)

<a id="js-shared-missingdependencyerror"></a>

## MissingDependencyError

**Representation:** constructor family

**Identity / construction:** code: `MISSING_DEPENDENCY_ERROR_CODE` constant.. message: Missing required dependency: plus argument1. current loader passes ioredis.. dependency: Argument1.. cause: Argument2 retained if truthy, default null.

**Trigger:** ioredis loading/export resolution fails in actual loader.

**Effect:** Throws with dependency/cause. writer factory catch records client unavailable.

**Retry boundary:** No automatic dependency repair policy.

**Safe next action:** Inspect dependency/cause. source does not prescribe installation or retry.

**Retained evidence:** Dependency/cause and writer lastError. no queue delivery guarantee.

**Consumer / translation:** Redis policy .code constant `SECURE_REDIS_TRANSPORT_POLICY_VIOLATION` differs from formatted message and details. MissingDependencyError .code `MISSING_DEPENDENCY` with dependency and optional cause. actual loader ioredis/export check wrapped. withTimeout message argument supplied by callers. race timeout is not cancellation of original operation.

**Representative source constructions (not executed by this reference):**

```text
new MissingDependencyError('ioredis', error)
```

**Owning / consuming source:**

- [skills/common/plugins/openclaw-agent-observer/src/redis-transport.ts:27](../../../skills/common/plugins/openclaw-agent-observer/src/redis-transport.ts#L27)
- [skills/common/plugins/openclaw-agent-observer/src/redis-writer.ts:1](../../../skills/common/plugins/openclaw-agent-observer/src/redis-writer.ts#L1)

<a id="js-shared-openclawtoolrejectederror"></a>

## OpenClawToolRejectedError

**Representation:** constructor family

**Identity / construction:** code: Own constant .code.. message: OPENCLAW_ + tool.toUpperCase() + `_REJECTED`: + status + optional :governingCap.. context: Arguments tool/status/governingCap retained separately.

**Trigger:** Response envelope ok=false/isError=true or rejected status branch.

**Effect:** Throws with stable code and dynamic tool/status/cap context.

**Retry boundary:** No blanket retry rule supplied by this class.

**Safe next action:** Inspect actual tool status/governing cap. do not infer retry from rejection code.

**Retained evidence:** Tool/status/cap retained. no external-effect absence proof.

**Consumer / translation:** Stable .code `OPENCLAW_TOOL_REJECTED` vs dynamic OPENCLAW_&lt;UPPERTOOL&gt;`_REJECTED`:status&#91;:cap&#93; message. Envelope ok=false/isError=true or six lowercased statuses trigger. tool/cap remain symbolic. failure(cause) creates fixed `OPENCLAW_RESULT_PATH_INVALID` preserving cause. readResult ENOENT returns undefined. nested size/read failures can become causes, not final outward code.

**Representative source constructions (not executed by this reference):**

```text
new OpenClawToolRejectedError(tool, status.toLowerCase(), governingCap)
```

**Owning / consuming source:**

- [skills/common/plugins/runtime-dispatch/src/openclaw-response.ts:5](../../../skills/common/plugins/runtime-dispatch/src/openclaw-response.ts#L5)
- [skills/common/plugins/runtime-dispatch/src/result-persistence.ts:1](../../../skills/common/plugins/runtime-dispatch/src/result-persistence.ts#L1)

<a id="j15-helper-1"></a>

## requireIdentity — skills/common/plugin-runtime/foundation/observability/durable-attempts.ts

**Representation:** failure

**Identity / construction:** code: absent. parameter named code becomes Error message. message: Helper argument2 forwarded unchanged to new Error(code).. domain: symbolic-open at helper. exact supplied caller arguments retained below. no global closed domain

**Trigger:** Value is not a string or length is outside1..512. this helper does not use the durable-records IDENTITY regex.

**Effect:** Throws before the guarded helper returns. Callers decide any later store/admission/prompt/repository/runtime effect.

**Retry boundary:** No retry behavior in helper. input rejection and OS error are not interchangeable.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** No durable mutation inside these validation helpers. surrounding caller may already have effects.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/common/plugin-runtime/foundation/observability/durable-attempts.ts:95](../../../skills/common/plugin-runtime/foundation/observability/durable-attempts.ts#L95)

<a id="j15-helper-2"></a>

## positiveInteger — skills/common/plugin-runtime/foundation/observability/durable-records.ts

**Representation:** failure

**Identity / construction:** code: absent. parameter named code becomes Error message. message: Helper argument2 forwarded unchanged to new Error(code).. domain: symbolic-open at helper. exact supplied caller arguments retained below. no global closed domain

**Trigger:** Value is not a positive safe integer.

**Effect:** Throws before the guarded helper returns. Callers decide any later store/admission/prompt/repository/runtime effect.

**Retry boundary:** No retry behavior in helper. input rejection and OS error are not interchangeable.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** No durable mutation inside these validation helpers. surrounding caller may already have effects.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/common/plugin-runtime/foundation/observability/durable-records.ts:47](../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts#L47)

<a id="j15-helper-3"></a>

## identity — skills/common/plugin-runtime/foundation/observability/durable-records.ts

**Representation:** failure

**Identity / construction:** code: absent. parameter named code becomes Error message. message: Helper argument2 forwarded unchanged to new Error(code).. domain: symbolic-open at helper. exact supplied caller arguments retained below. no global closed domain

**Trigger:** Identity string fails IDENTITY regex.

**Effect:** Throws before the guarded helper returns. Callers decide any later store/admission/prompt/repository/runtime effect.

**Retry boundary:** No retry behavior in helper. input rejection and OS error are not interchangeable.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** No durable mutation inside these validation helpers. surrounding caller may already have effects.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/common/plugin-runtime/foundation/observability/durable-records.ts:51](../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts#L51)

<a id="j15-helper-4"></a>

## positiveInteger — skills/common/plugins/prompt-contract/src/index.ts

**Representation:** failure

**Identity / construction:** code: absent. parameter named code becomes Error message. message: Helper argument4 forwarded unchanged to new Error(code).. domain: symbolic-open at helper. exact supplied caller arguments retained below. no global closed domain

**Trigger:** Resolved value/fallback is not safe integer between1 and maximum.

**Effect:** Throws before the guarded helper returns. Callers decide any later store/admission/prompt/repository/runtime effect.

**Retry boundary:** No retry behavior in helper. input rejection and OS error are not interchangeable.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** No durable mutation inside these validation helpers. surrounding caller may already have effects.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/common/plugins/prompt-contract/src/index.ts:34](../../../skills/common/plugins/prompt-contract/src/index.ts#L34)

<a id="j15-helper-5"></a>

## text — skills/common/plugins/prompt-contract/src/index.ts

**Representation:** failure

**Identity / construction:** code: absent. parameter named code becomes Error message. message: Helper argument2 forwarded unchanged to new Error(code).. domain: symbolic-open at helper. exact supplied caller arguments retained below. no global closed domain

**Trigger:** Value is not a string, trimmed value is empty, length exceeds maximum, or value contains NUL. accepted value returns unchanged, not trimmed.

**Effect:** Throws before the guarded helper returns. Callers decide any later store/admission/prompt/repository/runtime effect.

**Retry boundary:** No retry behavior in helper. input rejection and OS error are not interchangeable.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** No durable mutation inside these validation helpers. surrounding caller may already have effects.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/common/plugins/prompt-contract/src/index.ts:40](../../../skills/common/plugins/prompt-contract/src/index.ts#L40)

<a id="j16-published-pair"></a>

## Published pair guard failure construction

**Representation:** failure

**Identity / construction:** code: absent. plain Error message. message: `PUBLISHED_PAIR_`&lt;code&gt;: reconcile explicitly with scaffold --apply. domain: local helper suffix calls retained, construction symbolic. no all-uppercase scan

**Trigger:** Named guards reject names/directory/file/manifest/member identity, changed pins, uncommitted pointer, divergent copies, targets, generation conflicts or size.

**Effect:** Rejects read/publish operation. A present damaged publication never falls back to loose authored files. Prior immutable or materialized files may already exist before later failure.

**Retry boundary:** No automatic repair/retry in helper.

**Safe next action:** Source message directs explicit reconciliation with scaffold --apply. this candidate does not execute or automatically authorize it.

**Retained evidence:** Current pointer and immutable generation/copies remain actual authority. failed publish is not blanket no-file-change.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/common/plugin-runtime/foundation/config/published-pair.ts:13](../../../skills/common/plugin-runtime/foundation/config/published-pair.ts#L13)

<a id="j16-operator-config"></a>

## Operator configuration URL/key error factories

**Representation:** failure

**Identity / construction:** code: absent. message: parseUrl forwards supplied error. exactKeys appends :&lt;unknownKey&gt;. explicit endpoint/target/format/secret/limit guards retain their exact constructions. domain: symbolic-open targetId/key. literal prefixes are not closed complete message values

**Trigger:** Unexpected keys, wrong URL type/parse, endpoint/origin/security/target/secret/limits violate exact guards.

**Effect:** Throws while constructing configuration. parseUrl catches URL parse error and substitutes owning supplied message, not OS/network proof.

**Retry boundary:** No automatic retry or external connectivity inference.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** Config diagnostic only. secret value not established from secret name.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/common/plugins/operator-messaging/src/config.ts:27](../../../skills/common/plugins/operator-messaging/src/config.ts#L27)

<a id="j17-network-request"></a>

## HTTP request failure/cancellation and bounded upstream response

**Representation:** failure

**Identity / construction:** code: absent. message: `NETWORK_TIMEOUT` vs `ADAPTER_CANCELLED` selected by combined signal reason identity. non-ok HTTP_&lt;status&gt;:&lt;first1000 chars&gt;. redirect/size and invocation guards distinct. domain: upstream-open body/cause, symbolic status/origin/method. fixed local guard messages

**Trigger:** Fetch/body operation rejects, request signal aborts, redirect/size/non-ok status, or invocation authority/size guard fails.

**Effect:** Throws. response reader cleanup attempts preserve original error if cancellation cleanup fails. Completed/partially delivered HTTP request may exist.

**Retry boundary:** No retry in adapter. timeout/abort does not prove remote operation absent.

**Safe next action:** Use effect/receiver reconciliation authority before repeating a possibly transmitted request.

**Retained evidence:** Cause retains signal.reason. body diagnostic bounded1000chars. upstream effects remain unknown.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/common/plugins/network-http/src/adapter.ts:54](../../../skills/common/plugins/network-http/src/adapter.ts#L54)

<a id="j17-redis-exchange"></a>

## Redis socket exchange failure settlement

**Representation:** failure

**Identity / construction:** code: absent. message: `ADAPTER_CANCELLED`, `REDIS_TIMEOUT`, `REDIS_CONNECTION_FAILED`:&lt;cause.message&gt;, `REDIS_CONNECTION_ENDED/CLOSED`. parser Error preserved or String(error) wrapped. domain: upstream-open socket/parser/cause

**Trigger:** Abort, timeout, socket error/end/close, or parser rejection before finish.

**Effect:** finish settles once, clears timeout/listener and destroys socket. rejects with error.

**Retry boundary:** No automatic resend. socket destruction is not proof Redis command had no effect.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** Original cause where supplied, parser message. successful result vs failure settlement distinct.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/common/plugins/redis-transport/src/exchange.ts:1](../../../skills/common/plugins/redis-transport/src/exchange.ts#L1)

<a id="j17-notification-durable-replay"></a>

## Notification delivery reservation, persisted failure and receipt reconciliation

**Representation:** failure

**Identity / construction:** code: absent for thrown Error. durable failure.reasonId is hash diagnostic identity, not semantic error code. message: String(reserved.payload.error) for stored failure. error stored bounded2048 chars with reasonId hash. fixed unbound/unresolved guards separate. domain: upstream-open persisted error

**Trigger:** Conflicting request identity, uncertain prior reservation/failure without receiver support, replay of terminal failure, transition conflict or unbound receipt lookup.

**Effect:** reserve reuses projected/completed receipt if available. uncertain outcome requires receiver support. failDelivery records possible vs `not_sent` then rethrows original. Transition failure can replace thrown error unless accepted receipt wins conflict reconciliation. Lookup never reserves/transmits.

**Retry boundary:** No blind resend when outcome possible. `not_sent` and bound receiver receipt differ.

**Safe next action:** Use bound receiver receipt/reconciliation for the same delivery identity. do not infer a failure means nothing was sent.

**Retained evidence:** Request/reservation/failure/receipt records retain exact identity/owner/payload proof. bounded error text and reasonId retained.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/common/plugins/operator-messaging/src/delivery-records.ts:16](../../../skills/common/plugins/operator-messaging/src/delivery-records.ts#L16)

<a id="j17-transport-publication-replay"></a>

## Transport publication persisted failure forwarding

**Representation:** failure

**Identity / construction:** code: absent on replay Error. message: String(reservation.record.payload.error). new failures stored reason.slice(0,2048) plus SHA256 reasonId prefix16, original error rethrown. domain: upstream-open persisted message. receipt accepted/publicationId is success data

**Trigger:** Existing same reservation has failure schema, or secret/network/response/transition branch fails.

**Effect:** Existing receipt returns. existing failure throws. Successful network response still needs durable receipt transition. conflict may resolve through accepted receipt or current terminal digest. Failure transition conflict may also return an accepted receipt.

**Retry boundary:** No new retry policy from replayed message. Do not transplant notification `possible/not_sent` fields into this different schema.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** Persisted request/reservation/failure/receipt, signature identity and bounded error. external network action can precede local failure.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/common/plugins/transport-publisher/src/adapter.ts:235](../../../skills/common/plugins/transport-publisher/src/adapter.ts#L235)
- [skills/common/plugins/operator-messaging/src/delivery-records.ts:1](../../../skills/common/plugins/operator-messaging/src/delivery-records.ts#L1)

<a id="j18-ingress-capacity"></a>

## Agent event queue capacity and emission diagnostics

**Representation:** failure

**Identity / construction:** code: absent on capacity Error. lastError is diagnostic state. message: `AGENT_EVENT_INGRESS_CAPACITY` fixed. emit catch stores `AGENT_EVENT_EMIT_FAILED`:&lt;Error.message or String(error)&gt; without throwing that diagnostic. domain: fixed capacity plus upstream-open emit diagnostic. limits keys finite local object

**Trigger:** Queue count/bytes would exceed accepted limit. asynchronously emit rejects.

**Effect:** Capacity increments rejected and throws before enqueue. Emit failure increments failures, records lastError, then removes item and decrements bytes. not automatic item retry.

**Retry boundary:** No item retry in flush. do not claim enqueue success proves delivery.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** Remaining queued items and status counts remain. failed item removed. no durable delivery receipt claimed.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/common/plugins/openclaw-agent-events/src/ingress-queue.ts:1](../../../skills/common/plugins/openclaw-agent-events/src/ingress-queue.ts#L1)

<a id="j18-ingress-drain"></a>

## Ingress drain cancellation and deadline

**Representation:** failure

**Identity / construction:** code: absent. message: `ADAPTER_CANCELLED` with signal.reason cause. `AGENT_EVENT_DRAIN_TIMEOUT`:pending=&lt;queue.length&gt;. domain: symbolic pending count/open abort cause

**Trigger:** Already aborted signal, later abort or drain timer wins race.

**Effect:** Rejects drain. finally clears timer/listener. Does not cancel the underlying emitter promise itself.

**Retry boundary:** No claim timeout drains/drops/retries queue.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** Queue/pending operation may remain. status is separate from completion proof.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/common/plugins/openclaw-agent-events/src/ingress-queue.ts:63](../../../skills/common/plugins/openclaw-agent-events/src/ingress-queue.ts#L63)

<!-- END GENERATED: common error catalogue -->
