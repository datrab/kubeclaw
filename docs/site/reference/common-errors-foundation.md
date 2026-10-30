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
- [Configuration and canonical values](#core-guards-1)
- [Source approval and artifact identity](#core-guards-2)
- [Durable records and delivery](#core-guards-3)
- [Artifact, state and wait adapters](#core-guards-4)
- [Telemetry and Redis](#core-guards-5)
- [Command execution and isolation](#core-guards-6)
- [Git workspace operations](#core-guards-7)
- [Operator delivery and receipts](#core-guards-8)
- [Observer hooks and notifications](#core-guards-9)

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

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>error.code</code> | <code>SEMANTIC&#95;WORK&#95;EXCEEDED</code> | Use the family construction rule above. | [contracts/prism/v1/src/document-semantics.ts:41](../../../contracts/prism/v1/src/document-semantics.ts#L41) |
| <code>error.code</code> | <code>PATCH&#95;DEPTH&#95;EXCEEDED</code> | Use the family construction rule above. | [contracts/prism/v1/src/document-semantics.ts:50](../../../contracts/prism/v1/src/document-semantics.ts#L50) |
| <code>error.code</code> | <code>COMPONENT&#95;DEPTH&#95;EXCEEDED</code> | Use the family construction rule above. | [contracts/prism/v1/src/document-semantics.ts:102](../../../contracts/prism/v1/src/document-semantics.ts#L102) |
| <code>error.code</code> | <code>COMPONENT&#95;DEPTH&#95;EXCEEDED</code> | Use the family construction rule above. | [contracts/prism/v1/src/document-semantics.ts:106](../../../contracts/prism/v1/src/document-semantics.ts#L106) |

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

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>error.code</code> | <code>REGISTRY&#95;PACKAGE&#95;INTEGRITY&#95;MISMATCH</code> | <code>&#96;Plugin package changed after discovery: ${pkg.manifest.id}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/activation.ts:34](../../../skills/common/plugin-runtime/foundation/registry/activation.ts#L34) |
| <code>error.code</code> | <code>REGISTRY&#95;ACTIVATION&#95;FAILED</code> | <code>'External capability adapters require a persistent isolated adapter runtime'</code> | [skills/common/plugin-runtime/foundation/registry/activation.ts:57](../../../skills/common/plugin-runtime/foundation/registry/activation.ts#L57) |
| <code>error.code</code> | <code>REGISTRY&#95;ACTIVATION&#95;FAILED</code> | <code>'External registration invocation requires a bounded plugin context'</code> | [skills/common/plugin-runtime/foundation/registry/activation.ts:70](../../../skills/common/plugin-runtime/foundation/registry/activation.ts#L70) |
| <code>error.code</code> | <code>REGISTRY&#95;EXECUTOR&#95;INVALID</code> | <code>&#96;Registration export is not a function: ${entry.registration.export}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/activation.ts:92](../../../skills/common/plugin-runtime/foundation/registry/activation.ts#L92) |
| <code>error.code</code> | <code>REGISTRY&#95;ACTIVATION&#95;FAILED</code> | <code>'Plugin registration activation failed'</code> | [skills/common/plugin-runtime/foundation/registry/activation.ts:97](../../../skills/common/plugin-runtime/foundation/registry/activation.ts#L97) |
| <code>error.code</code> | <code>REGISTRY&#95;REFERENCE&#95;FORBIDDEN</code> | <code>&#96;${label} escapes plugin package&#96;</code> | [skills/common/plugin-runtime/foundation/registry/build.ts:36](../../../skills/common/plugin-runtime/foundation/registry/build.ts#L36) |
| <code>error.code</code> | <code>REGISTRY&#95;REFERENCE&#95;MISSING</code> | <code>&#96;${label} does not exist&#96;</code> | [skills/common/plugin-runtime/foundation/registry/build.ts:45](../../../skills/common/plugin-runtime/foundation/registry/build.ts#L45) |
| <code>error.code</code> | <code>REGISTRY&#95;REFERENCE&#95;FORBIDDEN</code> | <code>&#96;${label} is outside the plugin package or not a file&#96;</code> | [skills/common/plugin-runtime/foundation/registry/build.ts:51](../../../skills/common/plugin-runtime/foundation/registry/build.ts#L51) |
| <code>error.code</code> | <code>REGISTRY&#95;MANIFEST&#95;INVALID</code> | <code>&#96;Value port requires schemaId: ${port.name}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/build.ts:102](../../../skills/common/plugin-runtime/foundation/registry/build.ts#L102) |
| <code>error.code</code> | <code>REGISTRY&#95;MANIFEST&#95;INVALID</code> | <code>&#96;Artifact port requires mediaTypes: ${port.name}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/build.ts:105](../../../skills/common/plugin-runtime/foundation/registry/build.ts#L105) |
| <code>error.code</code> | <code>REGISTRY&#95;REGISTRATION&#95;CONFLICT</code> | <code>&#96;Duplicate ${label} name: ${globalId}:${value.name}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/build.ts:113](../../../skills/common/plugin-runtime/foundation/registry/build.ts#L113) |
| <code>error.code</code> | <code>REGISTRY&#95;MANIFEST&#95;INVALID</code> | <code>&#96;Report provider must support test-report evidence: ${globalId}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/build.ts:125](../../../skills/common/plugin-runtime/foundation/registry/build.ts#L125) |
| <code>error.code</code> | <code>REGISTRY&#95;MANIFEST&#95;INVALID</code> | <code>&#96;Evidence default is not supported: ${globalId}:${evidenceType}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/build.ts:133](../../../skills/common/plugin-runtime/foundation/registry/build.ts#L133) |
| <code>error.code</code> | <code>REGISTRY&#95;STAGE&#95;OWNER&#95;CONFLICT</code> | <code>&#96;Duplicate stage type owner: ${registration.type}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/build.ts:232](../../../skills/common/plugin-runtime/foundation/registry/build.ts#L232) |
| <code>error.code</code> | <code>REGISTRY&#95;PACKAGE&#95;DUPLICATE</code> | <code>&#96;Duplicate plugin ID: ${pkg.manifest.id}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/build.ts:281](../../../skills/common/plugin-runtime/foundation/registry/build.ts#L281) |
| <code>error.code</code> | <code>REGISTRY&#95;REGISTRATION&#95;CONFLICT</code> | <code>&#96;Duplicate registration ID: ${globalId}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/build.ts:290](../../../skills/common/plugin-runtime/foundation/registry/build.ts#L290) |
| <code>error.code</code> | <code>REGISTRY&#95;TEST&#95;PROVIDER&#95;CONTRACT&#95;CONFLICT</code> | <code>&#96;Duplicate test-provider contract: ${registration.contractId}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/build.ts:300](../../../skills/common/plugin-runtime/foundation/registry/build.ts#L300) |
| <code>error.code</code> | <code>REGISTRY&#95;CAPABILITY&#95;FORBIDDEN</code> | <code>&#96;Core-only capability cannot be granted: ${capability}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/capabilities.ts:59](../../../skills/common/plugin-runtime/foundation/registry/capabilities.ts#L59) |
| <code>error.code</code> | <code>REGISTRY&#95;CAPABILITY&#95;UNKNOWN</code> | <code>&#96;Unknown capability: ${capability}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/capabilities.ts:62](../../../skills/common/plugin-runtime/foundation/registry/capabilities.ts#L62) |
| <code>error.code</code> | <code>REGISTRY&#95;CAPABILITY&#95;UNKNOWN</code> | <code>&#96;Adapter provides unknown capability: ${capability}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/capabilities.ts:69](../../../skills/common/plugin-runtime/foundation/registry/capabilities.ts#L69) |
| <code>error.code</code> | <code>REGISTRY&#95;CAPABILITY&#95;UNKNOWN</code> | <code>&#96;Provider policy references unknown capability: ${capability}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/capabilities.ts:81](../../../skills/common/plugin-runtime/foundation/registry/capabilities.ts#L81) |
| <code>error.code</code> | <code>REGISTRY&#95;CAPABILITY&#95;PROVIDER&#95;INVALID</code> | <code>&#96;Invalid provider '${providerId}' for '${capability}'&#96;</code> | [skills/common/plugin-runtime/foundation/registry/capabilities.ts:88](../../../skills/common/plugin-runtime/foundation/registry/capabilities.ts#L88) |
| <code>error.code</code> | <code>REGISTRY&#95;CAPABILITY&#95;PROVIDER&#95;AMBIGUOUS</code> | <code>&#96;Required capability has multiple providers and no configured selection: ${capability}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/capabilities.ts:105](../../../skills/common/plugin-runtime/foundation/registry/capabilities.ts#L105) |
| <code>error.code</code> | <code>REGISTRY&#95;CAPABILITY&#95;PROVIDER&#95;MISSING</code> | <code>&#96;Required capability has no selected provider: ${capability}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/capabilities.ts:110](../../../skills/common/plugin-runtime/foundation/registry/capabilities.ts#L110) |
| <code>error.code</code> | <code>REGISTRY&#95;CAPABILITY&#95;PROVIDER&#95;INVALID</code> | <code>&#96;Invalid provider '${providerId}' for '${capability}'&#96;</code> | [skills/common/plugin-runtime/foundation/registry/capabilities.ts:117](../../../skills/common/plugin-runtime/foundation/registry/capabilities.ts#L117) |
| <code>error.code</code> | <code>REGISTRY&#95;ADAPTER&#95;CYCLE</code> | <code>&#96;Adapter capability cycle detected at ${id}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/capabilities.ts:139](../../../skills/common/plugin-runtime/foundation/registry/capabilities.ts#L139) |
| <code>error.code</code> | <code>REGISTRY&#95;CAPABILITY&#95;DENIED</code> | <code>&#96;Required capability denied: ${registrationId} -&gt; ${capability}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/capabilities.ts:167](../../../skills/common/plugin-runtime/foundation/registry/capabilities.ts#L167) |
| <code>error.code</code> | <code>REGISTRY&#95;CAPABILITY&#95;PROVIDER&#95;MISSING</code> | <code>&#96;Required capability has no selected provider: ${capability}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/capabilities.ts:169](../../../skills/common/plugin-runtime/foundation/registry/capabilities.ts#L169) |
| <code>error.code</code> | <code>REGISTRY&#95;CAPABILITY&#95;UNREQUESTED</code> | <code>&#96;Policy grants unrequested capability: ${registrationId} -&gt; ${capability}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/capabilities.ts:172](../../../skills/common/plugin-runtime/foundation/registry/capabilities.ts#L172) |
| <code>error.code</code> | <code>REGISTRY&#95;REGISTRATION&#95;MISSING</code> | <code>&#96;Enabled registration does not exist: ${registrationId}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/capabilities.ts:186](../../../skills/common/plugin-runtime/foundation/registry/capabilities.ts#L186) |
| <code>error.code</code> | <code>REGISTRY&#95;CAPABILITY&#95;UNREQUESTED</code> | <code>&#96;Policy grants disabled registration: ${registrationId}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/capabilities.ts:200](../../../skills/common/plugin-runtime/foundation/registry/capabilities.ts#L200) |
| <code>error.code</code> | <code>REGISTRY&#95;CAPABILITY&#95;CONSTRAINT&#95;INVALID</code> | <code>&#96;Invalid constraints for capability '${capability}'&#96;</code> | [skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts:130](../../../skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts#L130) |
| <code>error.code</code> | <code>REGISTRY&#95;CAPABILITY&#95;CONSTRAINT&#95;INVALID</code> | <code>&#96;Capability '${capability}' requires absolute paths in '${key}'&#96;</code> | [skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts:144](../../../skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts#L144) |
| <code>error.code</code> | <code>REGISTRY&#95;CAPABILITY&#95;CONSTRAINT&#95;INVALID</code> | <code>&#96;Capability '${capability}' requires absolute executable paths&#96;</code> | [skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts:146](../../../skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts#L146) |
| <code>error.code</code> | <code>REGISTRY&#95;CAPABILITY&#95;CONSTRAINT&#95;INVALID</code> | <code>&#96;Capability '${capability}' requires repository-relative path prefixes&#96;</code> | [skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts:150](../../../skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts#L150) |
| <code>error.code</code> | <code>REGISTRY&#95;CAPABILITY&#95;CONSTRAINT&#95;INVALID</code> | <code>&#96;Capability '${capability}' requires canonical HTTP origins&#96;</code> | [skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts:155](../../../skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts#L155) |
| <code>error.code</code> | <code>REGISTRY&#95;CAPABILITY&#95;UNKNOWN</code> | <code>&#96;Unknown capability: ${capability}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts:175](../../../skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts#L175) |
| <code>error.code</code> | <code>REGISTRY&#95;REGISTRATION&#95;MISSING</code> | <code>&#96;Configured stage type has no registered owner: ${stage.type}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/configuration.ts:36](../../../skills/common/plugin-runtime/foundation/registry/configuration.ts#L36) |
| <code>error.code</code> | <code>REGISTRY&#95;REGISTRATION&#95;MISSING</code> | <code>&#96;Configured stage owner is not enabled: ${registrationId}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/configuration.ts:43](../../../skills/common/plugin-runtime/foundation/registry/configuration.ts#L43) |
| <code>error.code</code> | <code>REGISTRY&#95;REGISTRATION&#95;MISSING</code> | <code>&#96;Configured observer does not exist: ${registrationId}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/configuration.ts:53](../../../skills/common/plugin-runtime/foundation/registry/configuration.ts#L53) |
| <code>error.code</code> | <code>REGISTRY&#95;REGISTRATION&#95;MISSING</code> | <code>&#96;Configured adapter does not exist: ${registrationId}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/configuration.ts:61](../../../skills/common/plugin-runtime/foundation/registry/configuration.ts#L61) |
| <code>error.code</code> | <code>REGISTRY&#95;REGISTRATION&#95;MISSING</code> | <code>&#96;Test-provider contract does not exist: ${contractId}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/configuration.ts:93](../../../skills/common/plugin-runtime/foundation/registry/configuration.ts#L93) |
| <code>error.code</code> | <code>REGISTRY&#95;REGISTRATION&#95;MISSING</code> | <code>&#96;Test-provider contract does not exist: ${contractId}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/configuration.ts:109](../../../skills/common/plugin-runtime/foundation/registry/configuration.ts#L109) |
| <code>error.code</code> | <code>REGISTRY&#95;REFERENCE&#95;FORBIDDEN</code> | <code>&#96;Plugin packages cannot contain symlinks: ${child}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/digest.ts:11](../../../skills/common/plugin-runtime/foundation/registry/digest.ts#L11) |
| <code>error.code</code> | <code>REGISTRY&#95;ROOT&#95;INVALID</code> | <code>&#96;Invalid plugin installation root: ${root}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/discovery.ts:19](../../../skills/common/plugin-runtime/foundation/registry/discovery.ts#L19) |
| <code>error.code</code> | <code>REGISTRY&#95;PACKAGE&#95;DUPLICATE</code> | <code>&#96;${label} contains duplicate canonical roots: ${previous} and ${original}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/discovery.ts:47](../../../skills/common/plugin-runtime/foundation/registry/discovery.ts#L47) |
| <code>error.code</code> | <code>REGISTRY&#95;PACKAGE&#95;UNTRUSTED</code> | <code>&#96;Plugin package is not trusted: ${manifest.id}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/discovery.ts:98](../../../skills/common/plugin-runtime/foundation/registry/discovery.ts#L98) |
| <code>error.code</code> | <code>REGISTRY&#95;PACKAGE&#95;DUPLICATE</code> | <code>&#96;Plugin package discovered more than once: ${root}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/discovery.ts:123](../../../skills/common/plugin-runtime/foundation/registry/discovery.ts#L123) |
| <code>error.code</code> | <code>REGISTRY&#95;MANIFEST&#95;INVALID</code> | <code>&#96;Invalid JSON in ${manifestPath}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/schema.ts:67](../../../skills/common/plugin-runtime/foundation/registry/schema.ts#L67) |
| <code>error.code</code> | <code>REGISTRY&#95;MANIFEST&#95;INVALID</code> | <code>&#96;Invalid v2 plugin manifest ${manifestPath}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/schema.ts:73](../../../skills/common/plugin-runtime/foundation/registry/schema.ts#L73) |
| <code>error.code</code> | <code>REGISTRY&#95;RESULT&#95;INVALID</code> | <code>&#96;Value failed schema ${schemaPath}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/schema.ts:99](../../../skills/common/plugin-runtime/foundation/registry/schema.ts#L99) |
| <code>error.code</code> | <code>REGISTRY&#95;MANIFEST&#95;INVALID</code> | <code>&#96;Invalid JSON Schema in ${schemaPath}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/schema.ts:113](../../../skills/common/plugin-runtime/foundation/registry/schema.ts#L113) |
| <code>error.code</code> | <code>REGISTRY&#95;RESULT&#95;INVALID</code> | <code>&#96;Value failed canonical contract ${definition}&#96;</code> | [skills/common/plugin-runtime/foundation/registry/schema.ts:143](../../../skills/common/plugin-runtime/foundation/registry/schema.ts#L143) |
| <code>error.code</code> | <code>REGISTRY&#95;IMPORT&#95;SIDE&#95;EFFECT</code> | <code>&#96;Trusted registration import is not side-effect-free: ${entry.package.manifest.id}:${entry.registration.id}&#96;</code><br>Audit status is nonzero or success marker absent; selected cause lacks `REGISTRY_EXECUTOR_INVALID`. Cause details retained, not proof every plugin performed a side effect. | [skills/common/plugin-runtime/foundation/registry/import-audit.ts:63](../../../skills/common/plugin-runtime/foundation/registry/import-audit.ts#L63) |

**Declared vocabulary without an identified own construction:**

<code>error.code</code>: <code>REGISTRY&#95;ADAPTER&#95;PROVIDER&#95;CONFLICT</code> — Declared in RegistryErrorCode. No current own construction is identified in the qualified caller list; do not invent a cause or treat the declaration as emission proof. A caller supplies message and details.

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
- [skills/common/plugin-runtime/foundation/registry/capabilities.ts:59](../../../skills/common/plugin-runtime/foundation/registry/capabilities.ts#L59)
- [skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts:130](../../../skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts#L130)
- [skills/common/plugin-runtime/foundation/registry/configuration.ts:36](../../../skills/common/plugin-runtime/foundation/registry/configuration.ts#L36)
- [skills/common/plugin-runtime/foundation/registry/digest.ts:11](../../../skills/common/plugin-runtime/foundation/registry/digest.ts#L11)
- [skills/common/plugin-runtime/foundation/registry/discovery.ts:19](../../../skills/common/plugin-runtime/foundation/registry/discovery.ts#L19)
- [skills/common/plugin-runtime/foundation/registry/schema.ts:67](../../../skills/common/plugin-runtime/foundation/registry/schema.ts#L67)
- [skills/common/plugin-runtime/foundation/registry/import-audit.ts:63](../../../skills/common/plugin-runtime/foundation/registry/import-audit.ts#L63)

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

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>error.code</code> | <code>SECURE&#95;REDIS&#95;TRANSPORT&#95;POLICY&#95;VIOLATION</code> | Use the family construction rule above. | [skills/common/plugins/openclaw-agent-observer/src/redis-transport.ts:16](../../../skills/common/plugins/openclaw-agent-observer/src/redis-transport.ts#L16) |

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

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>error.code</code> | <code>MISSING&#95;DEPENDENCY</code> | Use the family construction rule above. | [skills/common/plugins/openclaw-agent-observer/src/redis-transport.ts:27](../../../skills/common/plugins/openclaw-agent-observer/src/redis-transport.ts#L27) |

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

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>error.code</code> | <code>OPENCLAW&#95;TOOL&#95;REJECTED</code> | Use the family construction rule above. | [skills/common/plugins/runtime-dispatch/src/openclaw-response.ts:5](../../../skills/common/plugins/runtime-dispatch/src/openclaw-response.ts#L5) |

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

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;PIPELINE&#95;RUN&#95;ID&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-attempts.ts:282](../../../skills/common/plugin-runtime/foundation/observability/durable-attempts.ts#L282) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;ATTEMPT&#95;ID&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-attempts.ts:286](../../../skills/common/plugin-runtime/foundation/observability/durable-attempts.ts#L286) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;EVIDENCE&#95;ID&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-attempts.ts:287](../../../skills/common/plugin-runtime/foundation/observability/durable-attempts.ts#L287) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;EVIDENCE&#95;TYPE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-attempts.ts:288](../../../skills/common/plugin-runtime/foundation/observability/durable-attempts.ts#L288) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;EVIDENCE&#95;MEDIA&#95;TYPE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-attempts.ts:289](../../../skills/common/plugin-runtime/foundation/observability/durable-attempts.ts#L289) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;PIPELINE&#95;RUN&#95;ID&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-attempts.ts:372](../../../skills/common/plugin-runtime/foundation/observability/durable-attempts.ts#L372) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;PLAN&#95;ID&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-attempts.ts:377](../../../skills/common/plugin-runtime/foundation/observability/durable-attempts.ts#L377) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;NODE&#95;ID&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-attempts.ts:378](../../../skills/common/plugin-runtime/foundation/observability/durable-attempts.ts#L378) |

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

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>DURABLE&#95;RECORD&#95;LIMIT&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-records.ts:62](../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts#L62) |
| <code>Error.message</code> | <code>DURABLE&#95;RECORD&#95;LIMIT&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-records.ts:63](../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts#L63) |
| <code>Error.message</code> | <code>DURABLE&#95;RECORD&#95;LIMIT&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-records.ts:64](../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts#L64) |
| <code>Error.message</code> | <code>DURABLE&#95;BLOB&#95;LIMIT&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-records.ts:235](../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts#L235) |
| <code>Error.message</code> | <code>DURABLE&#95;BLOB&#95;TOTAL&#95;LIMIT&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-records.ts:236](../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts#L236) |

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

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>DURABLE&#95;RECORD&#95;STREAM&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-records.ts:80](../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts#L80) |
| <code>Error.message</code> | <code>DURABLE&#95;RECORD&#95;IDEMPOTENCY&#95;KEY&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-records.ts:81](../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts#L81) |
| <code>Error.message</code> | <code>DURABLE&#95;RECORD&#95;STREAM&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-records.ts:120](../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts#L120) |
| <code>Error.message</code> | <code>DURABLE&#95;RECORD&#95;STREAM&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-records.ts:129](../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts#L129) |
| <code>Error.message</code> | <code>DURABLE&#95;RECORD&#95;STREAM&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-records.ts:183](../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts#L183) |
| <code>Error.message</code> | <code>DURABLE&#95;RECORD&#95;IDEMPOTENCY&#95;KEY&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-records.ts:184](../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts#L184) |

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

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>PROMPT&#95;LIMIT&#95;INVALID:maxBytes</code> | Use the family construction rule above. | [skills/common/plugins/prompt-contract/src/index.ts:119](../../../skills/common/plugins/prompt-contract/src/index.ts#L119) |
| <code>Error.message</code> | <code>PROMPT&#95;LIMIT&#95;INVALID:maxDepth</code> | Use the family construction rule above. | [skills/common/plugins/prompt-contract/src/index.ts:120](../../../skills/common/plugins/prompt-contract/src/index.ts#L120) |
| <code>Error.message</code> | <code>PROMPT&#95;LIMIT&#95;INVALID:maxEntries</code> | Use the family construction rule above. | [skills/common/plugins/prompt-contract/src/index.ts:121](../../../skills/common/plugins/prompt-contract/src/index.ts#L121) |

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

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>PROMPT&#95;TASK&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/prompt-contract/src/index.ts:143](../../../skills/common/plugins/prompt-contract/src/index.ts#L143) |
| <code>Error.message</code> | <code>PROMPT&#95;GUIDANCE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/prompt-contract/src/index.ts:146](../../../skills/common/plugins/prompt-contract/src/index.ts#L146) |

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

<a id="core-guards-1"></a>

## Configuration and canonical values

**Representation:** own common/worker guard and message family

**Identity / construction:** Source-defined message and guard family. Exact forms below distinguish literal values from symbolic patterns. Returned/forwarded/control outcomes keep their own meanings.

**Trigger:** Platform file/schema/path validation; canonical JSON rejects unsupported values, prototypes, accessors and cycles. Schema details and caller labels can vary.

**Effect:** A validation failure is not evidence of a repair or a runtime retry. File/JSON failures may propagate separately.

**Retry boundary:** Use the owning state and original identity to establish whether another attempt is safe. This family has no blanket retry rule.

**Safe next action:** Correct the selected configuration or unsupported value. Use the exact schema/guard; do not treat validation failure as automatic repair.

**Retained evidence:** Preserve the first diagnostic, target and operation identity plus existing journal, receipt, ownership or output evidence. Do not infer that a failed operation erased prior state.

**Consumer / translation:** The named implementation and its actual caller determine the resulting state. A thrown message is not itself a separate code, a terminal result or proof of successful cleanup.

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>&#96;PLATFORM&#95;CONFIG&#95;INVALID:${canonical}:${JSON.stringify(validate.errors ?? &#91;&#93;)}&#96;</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/config/platform.ts:67](../../../skills/common/plugin-runtime/foundation/config/platform.ts#L67) |
| <code>Error.message</code> | <code>CANONICAL&#95;JSON&#95;PROPERTY&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/values.ts:52](../../../skills/common/plugin-runtime/sdk/src/values.ts#L52) |
| <code>Error.message</code> | <code>CANONICAL&#95;JSON&#95;NUMBER&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/values.ts:68](../../../skills/common/plugin-runtime/sdk/src/values.ts#L68) |
| <code>Error.message</code> | <code>CANONICAL&#95;JSON&#95;VALUE&#95;UNSUPPORTED</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/values.ts:71](../../../skills/common/plugin-runtime/sdk/src/values.ts#L71) |
| <code>Error.message</code> | <code>CANONICAL&#95;JSON&#95;PROXY&#95;UNSUPPORTED</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/values.ts:72](../../../skills/common/plugin-runtime/sdk/src/values.ts#L72) |
| <code>Error.message</code> | <code>CANONICAL&#95;JSON&#95;CYCLE</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/values.ts:73](../../../skills/common/plugin-runtime/sdk/src/values.ts#L73) |
| <code>Error.message</code> | <code>CANONICAL&#95;JSON&#95;PROTOTYPE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/values.ts:79](../../../skills/common/plugin-runtime/sdk/src/values.ts#L79) |
| <code>Error.message</code> | <code>CANONICAL&#95;JSON&#95;PROPERTY&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/values.ts:80](../../../skills/common/plugin-runtime/sdk/src/values.ts#L80) |
| <code>Error.message</code> | <code>CANONICAL&#95;JSON&#95;PROTOTYPE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/values.ts:90](../../../skills/common/plugin-runtime/sdk/src/values.ts#L90) |
| <code>Error.message</code> | <code>CANONICAL&#95;JSON&#95;ARRAY&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/values.ts:91](../../../skills/common/plugin-runtime/sdk/src/values.ts#L91) |

**Owning / consuming source:**

- [skills/common/plugin-runtime/foundation/config/platform.ts:1](../../../skills/common/plugin-runtime/foundation/config/platform.ts#L1)
- [skills/common/plugin-runtime/sdk/src/values.ts:1](../../../skills/common/plugin-runtime/sdk/src/values.ts#L1)

<a id="core-guards-2"></a>

## Source approval and artifact identity

**Representation:** own common/worker guard and message family

**Identity / construction:** Source-defined message and guard family. Exact forms below distinguish literal values from symbolic patterns. Returned/forwarded/control outcomes keep their own meanings.

**Trigger:** Explicit revision/artifact selection, latest-attempt uniqueness, byte/digest/profile/subject matching and approval lineage.

**Effect:** Missing optional evidence differs from missing required evidence. Do not substitute ambient HEAD, recapture Source or infer approval after a guard fails.

**Retry boundary:** Use the owning state and original identity to establish whether another attempt is safe. This family has no blanket retry rule.

**Safe next action:** Recover the original approved revision/artifact and inspect its lineage. Do not substitute ambient HEAD or mint replacement approval for a failed guard.

**Retained evidence:** Preserve the first diagnostic, target and operation identity plus existing journal, receipt, ownership or output evidence. Do not infer that a failed operation erased prior state.

**Consumer / translation:** The named implementation and its actual caller determine the resulting state. A thrown message is not itself a separate code, a terminal result or proof of successful cleanup.

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>SOURCE&#95;IMPLEMENTATION&#95;ARTIFACT&#95;MISSING&#95;OR&#95;AMBIGUOUS</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/source-revision.ts:14](../../../skills/common/plugin-runtime/sdk/src/source-revision.ts#L14) |
| <code>Error.message</code> | <code>SOURCE&#95;IMPLEMENTATION&#95;ARTIFACT&#95;CORRUPT</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/source-revision.ts:23](../../../skills/common/plugin-runtime/sdk/src/source-revision.ts#L23) |
| <code>Error.message</code> | <code>SOURCE&#95;IMPLEMENTATION&#95;REVISION&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/source-revision.ts:26](../../../skills/common/plugin-runtime/sdk/src/source-revision.ts#L26) |
| <code>Error.message</code> | <code>SOURCE&#95;REVISION&#95;SELECTION&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/source-revision.ts:32](../../../skills/common/plugin-runtime/sdk/src/source-revision.ts#L32) |
| <code>Error.message</code> | <code>SOURCE&#95;REVISION&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/source-revision.ts:34](../../../skills/common/plugin-runtime/sdk/src/source-revision.ts#L34) |
| <code>Error.message</code> | <code>SOURCE&#95;IMPLEMENTATION&#95;BASE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/source-revision.ts:48](../../../skills/common/plugin-runtime/sdk/src/source-revision.ts#L48) |
| <code>Error.message</code> | <code>SOURCE&#95;APPROVAL&#95;ARTIFACT&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/source-approval.ts:10](../../../skills/common/plugin-runtime/sdk/src/source-approval.ts#L10) |
| <code>Error.message</code> | <code>SOURCE&#95;APPROVAL&#95;ARTIFACT&#95;CORRUPT</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/source-approval.ts:15](../../../skills/common/plugin-runtime/sdk/src/source-approval.ts#L15) |
| <code>Error.message</code> | <code>SOURCE&#95;APPROVAL&#95;AMBIGUOUS</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/source-approval.ts:20](../../../skills/common/plugin-runtime/sdk/src/source-approval.ts#L20) |
| <code>Error.message</code> | <code>SOURCE&#95;APPROVAL&#95;AMBIGUOUS</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/source-approval.ts:23](../../../skills/common/plugin-runtime/sdk/src/source-approval.ts#L23) |
| <code>Error.message</code> | <code>SOURCE&#95;APPROVAL&#95;REQUIRED</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/source-approval.ts:33](../../../skills/common/plugin-runtime/sdk/src/source-approval.ts#L33) |
| <code>Error.message</code> | <code>SOURCE&#95;APPROVAL&#95;BINDING&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/source-approval.ts:35](../../../skills/common/plugin-runtime/sdk/src/source-approval.ts#L35) |
| <code>Error.message</code> | <code>SOURCE&#95;APPROVAL&#95;REQUIRED</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/source-approval.ts:37](../../../skills/common/plugin-runtime/sdk/src/source-approval.ts#L37) |
| <code>Error.message</code> | <code>SOURCE&#95;APPROVAL&#95;BINDING&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/source-approval.ts:40](../../../skills/common/plugin-runtime/sdk/src/source-approval.ts#L40) |
| <code>Error.message</code> | <code>SOURCE&#95;APPROVAL&#95;REQUIRED</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/source-approval.ts:51](../../../skills/common/plugin-runtime/sdk/src/source-approval.ts#L51) |
| <code>Error.message</code> | <code>SOURCE&#95;APPROVAL&#95;BINDING&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/source-approval.ts:54](../../../skills/common/plugin-runtime/sdk/src/source-approval.ts#L54) |
| <code>Error.message</code> | <code>SOURCE&#95;APPROVAL&#95;REQUIRED</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/source-approval.ts:57](../../../skills/common/plugin-runtime/sdk/src/source-approval.ts#L57) |
| <code>Error.message</code> | <code>SOURCE&#95;APPROVAL&#95;BINDING&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/source-approval.ts:60](../../../skills/common/plugin-runtime/sdk/src/source-approval.ts#L60) |
| <code>Error.message</code> | <code>SOURCE&#95;APPROVAL&#95;SYNC&#95;BINDING&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/source-approval.ts:74](../../../skills/common/plugin-runtime/sdk/src/source-approval.ts#L74) |
| <code>Error.message</code> | <code>SOURCE&#95;APPROVAL&#95;IMPLEMENTATION&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/source-approval.ts:86](../../../skills/common/plugin-runtime/sdk/src/source-approval.ts#L86) |
| <code>Error.message</code> | <code>SOURCE&#95;APPROVAL&#95;LINEAGE&#95;AMBIGUOUS</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/source-approval.ts:93](../../../skills/common/plugin-runtime/sdk/src/source-approval.ts#L93) |
| <code>Error.message</code> | <code>REVIEW&#95;IDENTITY&#95;ENCODING&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/review-subject.ts:22](../../../skills/common/plugin-runtime/sdk/src/review-subject.ts#L22) |
| <code>Error.message</code> | <code>REVIEW&#95;SOURCE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/review-subject.ts:33](../../../skills/common/plugin-runtime/sdk/src/review-subject.ts#L33) |
| <code>Error.message</code> | <code>REVIEW&#95;SUBJECT&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/review-subject.ts:41](../../../skills/common/plugin-runtime/sdk/src/review-subject.ts#L41) |
| <code>Error.message</code> | <code>REVIEW&#95;SUBJECT&#95;FILE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/review-subject.ts:44](../../../skills/common/plugin-runtime/sdk/src/review-subject.ts#L44) |
| <code>Error.message</code> | <code>REVIEW&#95;SUBJECT&#95;DIGEST&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/review-subject.ts:47](../../../skills/common/plugin-runtime/sdk/src/review-subject.ts#L47) |
| <code>Error.message</code> | <code>REVIEW&#95;REPOSITORY&#95;IDENTITY&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/review-subject.ts:55](../../../skills/common/plugin-runtime/sdk/src/review-subject.ts#L55) |
| <code>Error.message</code> | <code>REVIEW&#95;SOURCE&#95;BYTES&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/review-subject.ts:68](../../../skills/common/plugin-runtime/sdk/src/review-subject.ts#L68) |
| <code>Error.message</code> | <code>REVIEW&#95;SUBJECT&#95;STALE</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/review-subject.ts:82](../../../skills/common/plugin-runtime/sdk/src/review-subject.ts#L82) |
| <code>Error.message</code> | <code>ARTIFACT&#95;JSON&#95;BYTES&#95;UNBOUND</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/artifact-json.ts:8](../../../skills/common/plugin-runtime/sdk/src/artifact-json.ts#L8) |
| <code>Error.message</code> | <code>ARTIFACT&#95;JSON&#95;VALUE&#95;UNBOUND</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/artifact-json.ts:11](../../../skills/common/plugin-runtime/sdk/src/artifact-json.ts#L11) |
| <code>Error.message</code> | <code>ARTIFACT&#95;JSON&#95;REFERENCE&#95;UNBOUND</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/artifact-json.ts:14](../../../skills/common/plugin-runtime/sdk/src/artifact-json.ts#L14) |
| <code>Error.message</code> | <code>ARTIFACT&#95;JSON&#95;ENCODING&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/sdk/src/artifact-json.ts:17](../../../skills/common/plugin-runtime/sdk/src/artifact-json.ts#L17) |

**Owning / consuming source:**

- [skills/common/plugin-runtime/sdk/src/source-revision.ts:1](../../../skills/common/plugin-runtime/sdk/src/source-revision.ts#L1)
- [skills/common/plugin-runtime/sdk/src/source-approval.ts:1](../../../skills/common/plugin-runtime/sdk/src/source-approval.ts#L1)
- [skills/common/plugin-runtime/sdk/src/review-subject.ts:1](../../../skills/common/plugin-runtime/sdk/src/review-subject.ts#L1)
- [skills/common/plugin-runtime/sdk/src/artifact-json.ts:1](../../../skills/common/plugin-runtime/sdk/src/artifact-json.ts#L1)

<a id="core-guards-3"></a>

## Durable records and delivery

**Representation:** own common/worker guard and message family

**Identity / construction:** Source-defined message and guard family. Exact forms below distinguish literal values from symbolic patterns. Returned/forwarded/control outcomes keep their own meanings.

**Trigger:** Identity/idempotency, capacity, journal and retirement checks; invalid ingress may be quarantined; acknowledgement and matching duplicate results are control outcomes.

**Effect:** A write can fail after rename/commit. Quarantine-capacity failure can supersede the initial failure. Pending delivery does not establish an automatic retry guarantee.

**Retry boundary:** Use the owning state and original identity to establish whether another attempt is safe. This family has no blanket retry rule.

**Safe next action:** Reconcile the original record, delivery identity and journal state before repeating a write. Preserve quarantine and retirement evidence.

**Retained evidence:** Preserve the first diagnostic, target and operation identity plus existing journal, receipt, ownership or output evidence. Do not infer that a failed operation erased prior state.

**Consumer / translation:** The named implementation and its actual caller determine the resulting state. A thrown message is not itself a separate code, a terminal result or proof of successful cleanup.

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;STORE&#95;PATH&#95;SYMLINK</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:143](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L143) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;STORE&#95;PATH&#95;NOT&#95;DIRECTORY</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:145](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L145) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;STORE&#95;PATH&#95;SYMLINK</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:156](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L156) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;STORE&#95;PATH&#95;NOT&#95;DIRECTORY</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:158](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L158) |
| <code>Error.message</code> | <code>&#96;OBSERVABILITY&#95;STORE&#95;UNLOCK&#95;FAILED:${code}:${error.trim()}&#96;</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:225](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L225) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;STORE&#95;LOCK&#95;FILE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:255](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L255) |
| <code>Error.message</code> | <code>&#96;OBSERVABILITY&#95;STORE&#95;LOCK&#95;FAILED:${file}:${error instanceof Error ? error.message : String(error)}&#96;</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:263](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L263) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;OUTBOX&#95;LIMIT&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:339](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L339) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;OUTBOX&#95;IDENTITY&#95;CONFLICT</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:373](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L373) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;OUTBOX&#95;FULL</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:387](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L387) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;ACK&#95;MISMATCH</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:424](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L424) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;ADMISSION&#95;LIMIT&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:450](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L450) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;ADMISSION&#95;FULL</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:493](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L493) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;ADMISSION&#95;FULL</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:505](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L505) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;INGRESS&#95;TOO&#95;LARGE</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:561](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L561) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;ADMISSION&#95;IDENTITY&#95;CONFLICT</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:568](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L568) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;ADMISSION&#95;IDENTITY&#95;CONFLICT</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:605](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L605) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;ADMISSION&#95;FULL</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:613](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L613) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;CURSOR&#95;EXHAUSTED</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:615](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L615) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;ADMISSION&#95;FULL</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:632](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L632) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;RETIREMENT&#95;OPERATION&#95;CONFLICT</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:652](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L652) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;RETIREMENT&#95;RECORD&#95;MISSING</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:657](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L657) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;RETIREMENT&#95;PRODUCER&#95;NOT&#95;CLOSED</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:660](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L660) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;RETIREMENT&#95;INCOMPLETE</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:661](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L661) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;RETIREMENT&#95;RECORD&#95;CHANGED</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:663](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L663) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;RETIREMENT&#95;NO&#95;CAPACITY&#95;GAIN</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:667](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L667) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;CURSOR&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:734](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L734) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;GAP&#95;RESTORATION&#95;UNDECLARED</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:769](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L769) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;GAP&#95;RESTORATION&#95;UNPROVED</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:788](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L788) |
| <code>Error.message</code> | <code>OBSERVABILITY&#95;ADMISSION&#95;FULL</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:795](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L795) |
| <code>Error.message</code> | <code>&#96;JOURNAL&#95;RECORD&#95;INCOMPLETE:${file}&#96;</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/hash-journal.ts:18](../../../skills/common/plugin-runtime/foundation/observability/hash-journal.ts#L18) |
| <code>Error.message</code> | <code>&#96;JOURNAL&#95;RECORD&#95;EMPTY:${file}:${sequence}&#96;</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/hash-journal.ts:22](../../../skills/common/plugin-runtime/foundation/observability/hash-journal.ts#L22) |
| <code>Error.message</code> | <code>&#96;JOURNAL&#95;CHAIN&#95;INVALID:${file}:${sequence}&#96;</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/hash-journal.ts:25](../../../skills/common/plugin-runtime/foundation/observability/hash-journal.ts#L25) |
| <code>Error.message</code> | <code>&#96;JOURNAL&#95;HASH&#95;INVALID:${file}:${sequence}&#96;</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/hash-journal.ts:26](../../../skills/common/plugin-runtime/foundation/observability/hash-journal.ts#L26) |
| <code>Error.message</code> | <code>DURABLE&#95;RETIREMENT&#95;INTENT&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/record-retirement.ts:57](../../../skills/common/plugin-runtime/foundation/observability/record-retirement.ts#L57) |
| <code>Error.message</code> | <code>DURABLE&#95;RETIREMENT&#95;INTENT&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/record-retirement.ts:64](../../../skills/common/plugin-runtime/foundation/observability/record-retirement.ts#L64) |
| <code>Error.message</code> | <code>DURABLE&#95;RECORD&#95;STORE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/record-retirement.ts:69](../../../skills/common/plugin-runtime/foundation/observability/record-retirement.ts#L69) |
| <code>Error.message</code> | <code>DURABLE&#95;RECORD&#95;STORE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/record-retirement.ts:72](../../../skills/common/plugin-runtime/foundation/observability/record-retirement.ts#L72) |
| <code>Error.message</code> | <code>DURABLE&#95;RECORD&#95;STORE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/record-retirement.ts:77](../../../skills/common/plugin-runtime/foundation/observability/record-retirement.ts#L77) |
| <code>Error.message</code> | <code>DURABLE&#95;RETIREMENT&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/record-retirement.ts:87](../../../skills/common/plugin-runtime/foundation/observability/record-retirement.ts#L87) |
| <code>Error.message</code> | <code>DURABLE&#95;TOMBSTONE&#95;INCOMPLETE</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/record-retirement.ts:92](../../../skills/common/plugin-runtime/foundation/observability/record-retirement.ts#L92) |
| <code>Error.message</code> | <code>DURABLE&#95;TOMBSTONE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/record-retirement.ts:100](../../../skills/common/plugin-runtime/foundation/observability/record-retirement.ts#L100) |
| <code>Error.message</code> | <code>DURABLE&#95;RECORD&#95;SEQUENCE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/record-retirement.ts:107](../../../skills/common/plugin-runtime/foundation/observability/record-retirement.ts#L107) |
| <code>Error.message</code> | <code>DURABLE&#95;RECORD&#95;SEQUENCE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/record-retirement.ts:113](../../../skills/common/plugin-runtime/foundation/observability/record-retirement.ts#L113) |
| <code>Error.message</code> | <code>DURABLE&#95;RECORD&#95;IDENTITY&#95;DUPLICATE</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/record-retirement.ts:116](../../../skills/common/plugin-runtime/foundation/observability/record-retirement.ts#L116) |
| <code>Error.message</code> | <code>DURABLE&#95;RECORD&#95;IDEMPOTENCY&#95;CONFLICT</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/record-retirement.ts:126](../../../skills/common/plugin-runtime/foundation/observability/record-retirement.ts#L126) |
| <code>Error.message</code> | <code>DURABLE&#95;RECORD&#95;IDEMPOTENCY&#95;CONFLICT</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/observability/record-retirement.ts:131](../../../skills/common/plugin-runtime/foundation/observability/record-retirement.ts#L131) |

**Owning / consuming source:**

- [skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:1](../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L1)
- [skills/common/plugin-runtime/foundation/observability/hash-journal.ts:1](../../../skills/common/plugin-runtime/foundation/observability/hash-journal.ts#L1)
- [skills/common/plugin-runtime/foundation/observability/record-retirement.ts:1](../../../skills/common/plugin-runtime/foundation/observability/record-retirement.ts#L1)

<a id="core-guards-4"></a>

## Artifact, state and wait adapters

**Representation:** own common/worker guard and message family

**Identity / construction:** Source-defined message and guard family. Exact forms below distinguish literal values from symbolic patterns. Returned/forwarded/control outcomes keep their own meanings.

**Trigger:** Exact capability/resource/record checks and specific durable-store error translations. Artifact lookup skips only the exact missing-artifact condition.

**Effect:** Artifact metadata can precede blob persistence. Matching idempotent continuation differs from retrying corruption. Duplicate success is not a failure; no general reset/rollback rule follows.

**Retry boundary:** Use the owning state and original identity to establish whether another attempt is safe. This family has no blanket retry rule.

**Safe next action:** Inspect the existing artifact/state/wait record and exact missing-versus-corrupt condition. Preserve idempotency identity; do not reset a store to clear a failure.

**Retained evidence:** Preserve the first diagnostic, target and operation identity plus existing journal, receipt, ownership or output evidence. Do not infer that a failed operation erased prior state.

**Consumer / translation:** The named implementation and its actual caller determine the resulting state. A thrown message is not itself a separate code, a terminal result or proof of successful cleanup.

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>&#96;ARTIFACT&#95;${label}&#95;INVALID&#96;</code> | Use the family construction rule above. | [skills/common/plugins/artifact-store/src/adapter.ts:22](../../../skills/common/plugins/artifact-store/src/adapter.ts#L22) |
| <code>Error.message</code> | <code>ARTIFACT&#95;DIGEST&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/artifact-store/src/adapter.ts:22](../../../skills/common/plugins/artifact-store/src/adapter.ts#L22) |
| <code>Error.message</code> | <code>ARTIFACT&#95;ID&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/artifact-store/src/adapter.ts:22](../../../skills/common/plugins/artifact-store/src/adapter.ts#L22) |
| <code>Error.message</code> | <code>ARTIFACT&#95;NAMESPACE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/artifact-store/src/adapter.ts:22](../../../skills/common/plugins/artifact-store/src/adapter.ts#L22) |
| <code>Error.message</code> | <code>ARTIFACT&#95;MEDIA&#95;TYPE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/artifact-store/src/adapter.ts:22](../../../skills/common/plugins/artifact-store/src/adapter.ts#L22) |
| <code>Error.message</code> | <code>ARTIFACT&#95;DIGEST&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/artifact-store/src/adapter.ts:29](../../../skills/common/plugins/artifact-store/src/adapter.ts#L29) |
| <code>Error.message</code> | <code>ARTIFACT&#95;NAMESPACE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/artifact-store/src/adapter.ts:34](../../../skills/common/plugins/artifact-store/src/adapter.ts#L34) |
| <code>Error.message</code> | <code>ARTIFACT&#95;REFERENCE&#95;CORRUPT</code> | Use the family construction rule above. | [skills/common/plugins/artifact-store/src/adapter.ts:59](../../../skills/common/plugins/artifact-store/src/adapter.ts#L59) |
| <code>Error.message</code> | <code>ARTIFACT&#95;NOT&#95;FOUND</code> | Use the family construction rule above. | [skills/common/plugins/artifact-store/src/adapter.ts:72](../../../skills/common/plugins/artifact-store/src/adapter.ts#L72) |
| <code>Error.message</code> | <code>ARTIFACT&#95;NOT&#95;FOUND</code> | Use the family construction rule above. | [skills/common/plugins/artifact-store/src/adapter.ts:85](../../../skills/common/plugins/artifact-store/src/adapter.ts#L85) |
| <code>Error.message</code> | <code>ARTIFACT&#95;INTEGRITY&#95;FAILED</code> | Use the family construction rule above. | [skills/common/plugins/artifact-store/src/adapter.ts:86](../../../skills/common/plugins/artifact-store/src/adapter.ts#L86) |
| <code>Error.message</code> | <code>ARTIFACT&#95;ENCODING&#95;UNSUPPORTED</code> | Use the family construction rule above. | [skills/common/plugins/artifact-store/src/adapter.ts:97](../../../skills/common/plugins/artifact-store/src/adapter.ts#L97) |
| <code>Error.message</code> | <code>ARTIFACT&#95;REFERENCE&#95;REQUIRED</code> | Use the family construction rule above. | [skills/common/plugins/artifact-store/src/adapter.ts:104](../../../skills/common/plugins/artifact-store/src/adapter.ts#L104) |
| <code>Error.message</code> | <code>ADAPTER&#95;CANCELLED</code> | Use the family construction rule above. | [skills/common/plugins/artifact-store/src/adapter.ts:116](../../../skills/common/plugins/artifact-store/src/adapter.ts#L116) |
| <code>Error.message</code> | <code>&#96;ARTIFACT&#95;OPERATION&#95;UNSUPPORTED:${request.capability}:${request.operation}&#96;</code> | Use the family construction rule above. | [skills/common/plugins/artifact-store/src/adapter.ts:130](../../../skills/common/plugins/artifact-store/src/adapter.ts#L130) |
| <code>Error.message</code> | <code>ARTIFACT&#95;MEDIA&#95;TYPE&#95;UNSUPPORTED</code> | Use the family construction rule above. | [skills/common/plugins/artifact-store/src/adapter.ts:134](../../../skills/common/plugins/artifact-store/src/adapter.ts#L134) |
| <code>Error.message</code> | <code>ARTIFACT&#95;SIZE&#95;EXCEEDED</code> | Use the family construction rule above. | [skills/common/plugins/artifact-store/src/adapter.ts:136](../../../skills/common/plugins/artifact-store/src/adapter.ts#L136) |
| <code>Error.message</code> | <code>artifactRoot is required</code> | Use the family construction rule above. | [skills/common/plugins/artifact-store/src/adapter.ts:161](../../../skills/common/plugins/artifact-store/src/adapter.ts#L161) |
| <code>Error.message</code> | <code>maxArtifactBytes is invalid</code> | Use the family construction rule above. | [skills/common/plugins/artifact-store/src/adapter.ts:163](../../../skills/common/plugins/artifact-store/src/adapter.ts#L163) |
| <code>Error.message</code> | <code>maximumStoreBytes is invalid</code> | Use the family construction rule above. | [skills/common/plugins/artifact-store/src/adapter.ts:166](../../../skills/common/plugins/artifact-store/src/adapter.ts#L166) |
| <code>Error.message</code> | <code>maximumRecords is invalid</code> | Use the family construction rule above. | [skills/common/plugins/artifact-store/src/adapter.ts:167](../../../skills/common/plugins/artifact-store/src/adapter.ts#L167) |
| <code>Error.message</code> | <code>&#96;STATE&#95;NAMESPACE&#95;INVALID:${namespace}&#96;</code> | Use the family construction rule above. | [skills/common/plugins/state-store/src/adapter.ts:21](../../../skills/common/plugins/state-store/src/adapter.ts#L21) |
| <code>Error.message</code> | <code>state root is required</code> | Use the family construction rule above. | [skills/common/plugins/state-store/src/adapter.ts:28](../../../skills/common/plugins/state-store/src/adapter.ts#L28) |
| <code>Error.message</code> | <code>maxEntryBytes is invalid</code> | Use the family construction rule above. | [skills/common/plugins/state-store/src/adapter.ts:32](../../../skills/common/plugins/state-store/src/adapter.ts#L32) |
| <code>Error.message</code> | <code>maximumRecords is invalid</code> | Use the family construction rule above. | [skills/common/plugins/state-store/src/adapter.ts:33](../../../skills/common/plugins/state-store/src/adapter.ts#L33) |
| <code>Error.message</code> | <code>maximumStoreBytes is invalid</code> | Use the family construction rule above. | [skills/common/plugins/state-store/src/adapter.ts:34](../../../skills/common/plugins/state-store/src/adapter.ts#L34) |
| <code>Error.message</code> | <code>ADAPTER&#95;CANCELLED</code> | Use the family construction rule above. | [skills/common/plugins/state-store/src/adapter.ts:51](../../../skills/common/plugins/state-store/src/adapter.ts#L51) |
| <code>Error.message</code> | <code>STATE&#95;OPERATION&#95;UNSUPPORTED</code> | Use the family construction rule above. | [skills/common/plugins/state-store/src/adapter.ts:54](../../../skills/common/plugins/state-store/src/adapter.ts#L54) |
| <code>Error.message</code> | <code>STATE&#95;OPERATION&#95;UNSUPPORTED</code> | Use the family construction rule above. | [skills/common/plugins/state-store/src/adapter.ts:58](../../../skills/common/plugins/state-store/src/adapter.ts#L58) |
| <code>Error.message</code> | <code>STATE&#95;VALUE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/state-store/src/adapter.ts:61](../../../skills/common/plugins/state-store/src/adapter.ts#L61) |
| <code>Error.message</code> | <code>STATE&#95;IDEMPOTENCY&#95;CONFLICT</code> | Use the family construction rule above. | [skills/common/plugins/state-store/src/adapter.ts:67](../../../skills/common/plugins/state-store/src/adapter.ts#L67) |
| <code>Error.message</code> | <code>STATE&#95;ENTRY&#95;SIZE&#95;EXCEEDED</code> | Use the family construction rule above. | [skills/common/plugins/state-store/src/adapter.ts:77](../../../skills/common/plugins/state-store/src/adapter.ts#L77) |
| <code>Error.message</code> | <code>STATE&#95;IDEMPOTENCY&#95;CONFLICT</code> | Use the family construction rule above. | [skills/common/plugins/state-store/src/adapter.ts:78](../../../skills/common/plugins/state-store/src/adapter.ts#L78) |
| <code>Error.message</code> | <code>WAIT&#95;REQUEST&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/wait-store/src/adapter.ts:86](../../../skills/common/plugins/wait-store/src/adapter.ts#L86) |
| <code>Error.message</code> | <code>WAIT&#95;REQUEST&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/wait-store/src/adapter.ts:90](../../../skills/common/plugins/wait-store/src/adapter.ts#L90) |
| <code>Error.message</code> | <code>WAIT&#95;REQUEST&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/wait-store/src/adapter.ts:98](../../../skills/common/plugins/wait-store/src/adapter.ts#L98) |
| <code>Error.message</code> | <code>WAIT&#95;REQUEST&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/wait-store/src/adapter.ts:103](../../../skills/common/plugins/wait-store/src/adapter.ts#L103) |
| <code>Error.message</code> | <code>WAIT&#95;REQUEST&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/wait-store/src/adapter.ts:108](../../../skills/common/plugins/wait-store/src/adapter.ts#L108) |
| <code>Error.message</code> | <code>WAIT&#95;EXPIRY&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/wait-store/src/adapter.ts:109](../../../skills/common/plugins/wait-store/src/adapter.ts#L109) |
| <code>Error.message</code> | <code>WAIT&#95;REQUEST&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/wait-store/src/adapter.ts:115](../../../skills/common/plugins/wait-store/src/adapter.ts#L115) |
| <code>Error.message</code> | <code>WAIT&#95;REQUEST&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/wait-store/src/adapter.ts:119](../../../skills/common/plugins/wait-store/src/adapter.ts#L119) |
| <code>Error.message</code> | <code>WAIT&#95;REQUEST&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/wait-store/src/adapter.ts:124](../../../skills/common/plugins/wait-store/src/adapter.ts#L124) |
| <code>Error.message</code> | <code>WAIT&#95;RECORD&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/wait-store/src/adapter.ts:152](../../../skills/common/plugins/wait-store/src/adapter.ts#L152) |
| <code>Error.message</code> | <code>WAIT&#95;RECORD&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/wait-store/src/adapter.ts:154](../../../skills/common/plugins/wait-store/src/adapter.ts#L154) |
| <code>Error.message</code> | <code>WAIT&#95;RECORD&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/wait-store/src/adapter.ts:163](../../../skills/common/plugins/wait-store/src/adapter.ts#L163) |
| <code>Error.message</code> | <code>RESOURCE&#95;FENCE&#95;REQUIRED</code> | Use the family construction rule above. | [skills/common/plugins/wait-store/src/adapter.ts:182](../../../skills/common/plugins/wait-store/src/adapter.ts#L182) |
| <code>Error.message</code> | <code>ADAPTER&#95;CANCELLED</code> | Use the family construction rule above. | [skills/common/plugins/wait-store/src/adapter.ts:185](../../../skills/common/plugins/wait-store/src/adapter.ts#L185) |
| <code>Error.message</code> | <code>root is required</code> | Use the family construction rule above. | [skills/common/plugins/wait-store/src/adapter.ts:190](../../../skills/common/plugins/wait-store/src/adapter.ts#L190) |
| <code>Error.message</code> | <code>maxEntryBytes is invalid</code> | Use the family construction rule above. | [skills/common/plugins/wait-store/src/adapter.ts:194](../../../skills/common/plugins/wait-store/src/adapter.ts#L194) |
| <code>Error.message</code> | <code>maximumRecords is invalid</code> | Use the family construction rule above. | [skills/common/plugins/wait-store/src/adapter.ts:195](../../../skills/common/plugins/wait-store/src/adapter.ts#L195) |
| <code>Error.message</code> | <code>maximumStoreBytes is invalid</code> | Use the family construction rule above. | [skills/common/plugins/wait-store/src/adapter.ts:196](../../../skills/common/plugins/wait-store/src/adapter.ts#L196) |
| <code>Error.message</code> | <code>WAIT&#95;OPERATION&#95;UNSUPPORTED</code> | Use the family construction rule above. | [skills/common/plugins/wait-store/src/adapter.ts:207](../../../skills/common/plugins/wait-store/src/adapter.ts#L207) |
| <code>Error.message</code> | <code>WAIT&#95;OPERATION&#95;UNSUPPORTED</code> | Use the family construction rule above. | [skills/common/plugins/wait-store/src/adapter.ts:213](../../../skills/common/plugins/wait-store/src/adapter.ts#L213) |
| <code>Error.message</code> | <code>WAIT&#95;IDEMPOTENCY&#95;CONFLICT</code> | Use the family construction rule above. | [skills/common/plugins/wait-store/src/adapter.ts:218](../../../skills/common/plugins/wait-store/src/adapter.ts#L218) |
| <code>Error.message</code> | <code>WAIT&#95;ENTRY&#95;SIZE&#95;EXCEEDED</code> | Use the family construction rule above. | [skills/common/plugins/wait-store/src/adapter.ts:234](../../../skills/common/plugins/wait-store/src/adapter.ts#L234) |
| <code>Error.message</code> | <code>WAIT&#95;IDEMPOTENCY&#95;CONFLICT</code> | Use the family construction rule above. | [skills/common/plugins/wait-store/src/adapter.ts:235](../../../skills/common/plugins/wait-store/src/adapter.ts#L235) |

**Owning / consuming source:**

- [skills/common/plugins/artifact-store/src/adapter.ts:1](../../../skills/common/plugins/artifact-store/src/adapter.ts#L1)
- [skills/common/plugins/state-store/src/adapter.ts:1](../../../skills/common/plugins/state-store/src/adapter.ts#L1)
- [skills/common/plugins/wait-store/src/adapter.ts:1](../../../skills/common/plugins/wait-store/src/adapter.ts#L1)

<a id="core-guards-5"></a>

## Telemetry and Redis

**Representation:** own common/worker guard and message family

**Identity / construction:** Source-defined message and guard family. Exact forms below distinguish literal values from symbolic patterns. Returned/forwarded/control outcomes keep their own meanings.

**Trigger:** Bounded/redacted telemetry projection, append checks, Redis configuration/protocol bounds and stream identity checks. Server error text remains upstream.

**Effect:** Redaction and duplicate results are control values. Redis XADD followed by SET does not imply rollback if a later operation fails. Incomplete RESP input is not itself an emitted failure.

**Retry boundary:** Use the owning state and original identity to establish whether another attempt is safe. This family has no blanket retry rule.

**Safe next action:** Inspect the configured projection/Redis boundary and retained stream state. Do not infer rollback or repeat delivery merely from a later failure.

**Retained evidence:** Preserve the first diagnostic, target and operation identity plus existing journal, receipt, ownership or output evidence. Do not infer that a failed operation erased prior state.

**Consumer / translation:** The named implementation and its actual caller determine the resulting state. A thrown message is not itself a separate code, a terminal result or proof of successful cleanup.

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>TELEMETRY&#95;RECORD&#95;SIZE&#95;EXCEEDED</code> | Use the family construction rule above. | [skills/common/plugins/telemetry-store/src/projection.ts:22](../../../skills/common/plugins/telemetry-store/src/projection.ts#L22) |
| <code>Error.message</code> | <code>TELEMETRY&#95;RECORD&#95;SIZE&#95;EXCEEDED</code> | Use the family construction rule above. | [skills/common/plugins/telemetry-store/src/projection.ts:25](../../../skills/common/plugins/telemetry-store/src/projection.ts#L25) |
| <code>Error.message</code> | <code>TELEMETRY&#95;JSON&#95;UNICODE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/telemetry-store/src/projection.ts:26](../../../skills/common/plugins/telemetry-store/src/projection.ts#L26) |
| <code>Error.message</code> | <code>TELEMETRY&#95;JSON&#95;PROTOTYPE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/telemetry-store/src/projection.ts:33](../../../skills/common/plugins/telemetry-store/src/projection.ts#L33) |
| <code>Error.message</code> | <code>TELEMETRY&#95;JSON&#95;NODE&#95;LIMIT</code> | Use the family construction rule above. | [skills/common/plugins/telemetry-store/src/projection.ts:36](../../../skills/common/plugins/telemetry-store/src/projection.ts#L36) |
| <code>Error.message</code> | <code>TELEMETRY&#95;JSON&#95;ARRAY&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/telemetry-store/src/projection.ts:37](../../../skills/common/plugins/telemetry-store/src/projection.ts#L37) |
| <code>Error.message</code> | <code>TELEMETRY&#95;JSON&#95;PROPERTY&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/telemetry-store/src/projection.ts:41](../../../skills/common/plugins/telemetry-store/src/projection.ts#L41) |
| <code>Error.message</code> | <code>TELEMETRY&#95;JSON&#95;PROPERTY&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/telemetry-store/src/projection.ts:43](../../../skills/common/plugins/telemetry-store/src/projection.ts#L43) |
| <code>Error.message</code> | <code>TELEMETRY&#95;JSON&#95;PROXY&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/telemetry-store/src/projection.ts:47](../../../skills/common/plugins/telemetry-store/src/projection.ts#L47) |
| <code>Error.message</code> | <code>TELEMETRY&#95;JSON&#95;CYCLE</code> | Use the family construction rule above. | [skills/common/plugins/telemetry-store/src/projection.ts:48](../../../skills/common/plugins/telemetry-store/src/projection.ts#L48) |
| <code>Error.message</code> | <code>TELEMETRY&#95;JSON&#95;PROPERTY&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/telemetry-store/src/projection.ts:57](../../../skills/common/plugins/telemetry-store/src/projection.ts#L57) |
| <code>Error.message</code> | <code>TELEMETRY&#95;JSON&#95;NODE&#95;LIMIT</code> | Use the family construction rule above. | [skills/common/plugins/telemetry-store/src/projection.ts:67](../../../skills/common/plugins/telemetry-store/src/projection.ts#L67) |
| <code>Error.message</code> | <code>TELEMETRY&#95;JSON&#95;DEPTH&#95;LIMIT</code> | Use the family construction rule above. | [skills/common/plugins/telemetry-store/src/projection.ts:68](../../../skills/common/plugins/telemetry-store/src/projection.ts#L68) |
| <code>Error.message</code> | <code>TELEMETRY&#95;JSON&#95;NUMBER&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/telemetry-store/src/projection.ts:72](../../../skills/common/plugins/telemetry-store/src/projection.ts#L72) |
| <code>Error.message</code> | <code>TELEMETRY&#95;JSON&#95;TYPE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/telemetry-store/src/projection.ts:75](../../../skills/common/plugins/telemetry-store/src/projection.ts#L75) |
| <code>Error.message</code> | <code>TELEMETRY&#95;JSON&#95;ROOT&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/telemetry-store/src/projection.ts:91](../../../skills/common/plugins/telemetry-store/src/projection.ts#L91) |
| <code>Error.message</code> | <code>root is required</code> | Use the family construction rule above. | [skills/common/plugins/telemetry-store/src/adapter.ts:7](../../../skills/common/plugins/telemetry-store/src/adapter.ts#L7) |
| <code>Error.message</code> | <code>maxRecordBytes is invalid</code> | Use the family construction rule above. | [skills/common/plugins/telemetry-store/src/adapter.ts:11](../../../skills/common/plugins/telemetry-store/src/adapter.ts#L11) |
| <code>Error.message</code> | <code>maximumRecords is invalid</code> | Use the family construction rule above. | [skills/common/plugins/telemetry-store/src/adapter.ts:12](../../../skills/common/plugins/telemetry-store/src/adapter.ts#L12) |
| <code>Error.message</code> | <code>maximumStoreBytes is invalid</code> | Use the family construction rule above. | [skills/common/plugins/telemetry-store/src/adapter.ts:13](../../../skills/common/plugins/telemetry-store/src/adapter.ts#L13) |
| <code>Error.message</code> | <code>TELEMETRY&#95;OPERATION&#95;UNSUPPORTED</code> | Use the family construction rule above. | [skills/common/plugins/telemetry-store/src/adapter.ts:24](../../../skills/common/plugins/telemetry-store/src/adapter.ts#L24) |
| <code>Error.message</code> | <code>ADAPTER&#95;CANCELLED</code> | Use the family construction rule above. | [skills/common/plugins/telemetry-store/src/adapter.ts:25](../../../skills/common/plugins/telemetry-store/src/adapter.ts#L25) |
| <code>Error.message</code> | <code>TELEMETRY&#95;RECORD&#95;SIZE&#95;EXCEEDED</code> | Use the family construction rule above. | [skills/common/plugins/telemetry-store/src/adapter.ts:36](../../../skills/common/plugins/telemetry-store/src/adapter.ts#L36) |
| <code>Error.message</code> | <code>REDIS&#95;CONFIG&#95;UNKNOWN&#95;FIELD</code> | Use the family construction rule above. | [skills/common/plugins/redis-transport/src/adapter.ts:25](../../../skills/common/plugins/redis-transport/src/adapter.ts#L25) |
| <code>Error.message</code> | <code>REDIS&#95;CONFIG&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/redis-transport/src/adapter.ts:27](../../../skills/common/plugins/redis-transport/src/adapter.ts#L27) |
| <code>Error.message</code> | <code>REDIS&#95;CONFIG&#95;INVALID:url</code> | Use the family construction rule above. | [skills/common/plugins/redis-transport/src/adapter.ts:31](../../../skills/common/plugins/redis-transport/src/adapter.ts#L31) |
| <code>Error.message</code> | <code>REDIS&#95;CONFIG&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/redis-transport/src/adapter.ts:34](../../../skills/common/plugins/redis-transport/src/adapter.ts#L34) |
| <code>Error.message</code> | <code>&#96;REDIS&#95;CONFIG&#95;INVALID:${label}&#96;</code> | Use the family construction rule above. | [skills/common/plugins/redis-transport/src/adapter.ts:37](../../../skills/common/plugins/redis-transport/src/adapter.ts#L37) |
| <code>Error.message</code> | <code>REDIS&#95;CONFIG&#95;INVALID:maxLen</code> | Use the family construction rule above. | [skills/common/plugins/redis-transport/src/adapter.ts:37](../../../skills/common/plugins/redis-transport/src/adapter.ts#L37) |
| <code>Error.message</code> | <code>REDIS&#95;CONFIG&#95;INVALID:dedupTtlMs</code> | Use the family construction rule above. | [skills/common/plugins/redis-transport/src/adapter.ts:37](../../../skills/common/plugins/redis-transport/src/adapter.ts#L37) |
| <code>Error.message</code> | <code>REDIS&#95;CONFIG&#95;INVALID:timeoutMs</code> | Use the family construction rule above. | [skills/common/plugins/redis-transport/src/adapter.ts:37](../../../skills/common/plugins/redis-transport/src/adapter.ts#L37) |
| <code>Error.message</code> | <code>REDIS&#95;STREAM&#95;ID&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/redis-transport/src/adapter.ts:51](../../../skills/common/plugins/redis-transport/src/adapter.ts#L51) |
| <code>Error.message</code> | <code>ADAPTER&#95;SHUTTING&#95;DOWN</code> | Use the family construction rule above. | [skills/common/plugins/redis-transport/src/adapter.ts:60](../../../skills/common/plugins/redis-transport/src/adapter.ts#L60) |
| <code>Error.message</code> | <code>ADAPTER&#95;SHUTTING&#95;DOWN</code> | Use the family construction rule above. | [skills/common/plugins/redis-transport/src/adapter.ts:64](../../../skills/common/plugins/redis-transport/src/adapter.ts#L64) |
| <code>Error.message</code> | <code>REDIS&#95;OPERATION&#95;UNSUPPORTED</code> | Use the family construction rule above. | [skills/common/plugins/redis-transport/src/adapter.ts:69](../../../skills/common/plugins/redis-transport/src/adapter.ts#L69) |
| <code>Error.message</code> | <code>REDIS&#95;SECRET&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/redis-transport/src/adapter.ts:76](../../../skills/common/plugins/redis-transport/src/adapter.ts#L76) |
| <code>Error.message</code> | <code>REDIS&#95;PAYLOAD&#95;SIZE&#95;EXCEEDED</code> | Use the family construction rule above. | [skills/common/plugins/redis-transport/src/adapter.ts:78](../../../skills/common/plugins/redis-transport/src/adapter.ts#L78) |
| <code>Error.message</code> | <code>REDIS&#95;RESPONSE&#95;UTF8&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/redis-transport/src/resp.ts:8](../../../skills/common/plugins/redis-transport/src/resp.ts#L8) |
| <code>Error.message</code> | <code>REDIS&#95;RESPONSE&#95;HEADER&#95;LIMIT</code> | Use the family construction rule above. | [skills/common/plugins/redis-transport/src/resp.ts:14](../../../skills/common/plugins/redis-transport/src/resp.ts#L14) |
| <code>Error.message</code> | <code>REDIS&#95;RESPONSE&#95;HEADER&#95;LIMIT</code> | Use the family construction rule above. | [skills/common/plugins/redis-transport/src/resp.ts:17](../../../skills/common/plugins/redis-transport/src/resp.ts#L17) |
| <code>Error.message</code> | <code>REDIS&#95;RESPONSE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/redis-transport/src/resp.ts:20](../../../skills/common/plugins/redis-transport/src/resp.ts#L20) |
| <code>Error.message</code> | <code>&#96;REDIS&#95;ERROR:${header}&#96;</code> | Use the family construction rule above. | [skills/common/plugins/redis-transport/src/resp.ts:22](../../../skills/common/plugins/redis-transport/src/resp.ts#L22) |
| <code>Error.message</code> | <code>REDIS&#95;RESPONSE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/redis-transport/src/resp.ts:24](../../../skills/common/plugins/redis-transport/src/resp.ts#L24) |
| <code>Error.message</code> | <code>REDIS&#95;RESPONSE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/redis-transport/src/resp.ts:27](../../../skills/common/plugins/redis-transport/src/resp.ts#L27) |
| <code>Error.message</code> | <code>REDIS&#95;RESPONSE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/redis-transport/src/resp.ts:32](../../../skills/common/plugins/redis-transport/src/resp.ts#L32) |
| <code>Error.message</code> | <code>REDIS&#95;RESPONSE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/redis-transport/src/resp.ts:35](../../../skills/common/plugins/redis-transport/src/resp.ts#L35) |
| <code>Error.message</code> | <code>REDIS&#95;RESPONSE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/redis-transport/src/resp.ts:38](../../../skills/common/plugins/redis-transport/src/resp.ts#L38) |
| <code>Error.message</code> | <code>REDIS&#95;RESPONSE&#95;SIZE&#95;EXCEEDED</code> | Use the family construction rule above. | [skills/common/plugins/redis-transport/src/resp.ts:49](../../../skills/common/plugins/redis-transport/src/resp.ts#L49) |
| <code>Error.message</code> | <code>REDIS&#95;AUTH&#95;RESPONSE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/redis-transport/src/resp.ts:62](../../../skills/common/plugins/redis-transport/src/resp.ts#L62) |
| <code>Error.message</code> | <code>REDIS&#95;RESPONSE&#95;TRAILING&#95;DATA</code> | Use the family construction rule above. | [skills/common/plugins/redis-transport/src/resp.ts:64](../../../skills/common/plugins/redis-transport/src/resp.ts#L64) |

**Owning / consuming source:**

- [skills/common/plugins/telemetry-store/src/projection.ts:1](../../../skills/common/plugins/telemetry-store/src/projection.ts#L1)
- [skills/common/plugins/telemetry-store/src/adapter.ts:1](../../../skills/common/plugins/telemetry-store/src/adapter.ts#L1)
- [skills/common/plugins/redis-transport/src/adapter.ts:1](../../../skills/common/plugins/redis-transport/src/adapter.ts#L1)
- [skills/common/plugins/redis-transport/src/resp.ts:1](../../../skills/common/plugins/redis-transport/src/resp.ts#L1)

<a id="core-guards-6"></a>

## Command execution and isolation

**Representation:** own common/worker guard and message family

**Identity / construction:** Source-defined message and guard family. Exact forms below distinguish literal values from symbolic patterns. Returned/forwarded/control outcomes keep their own meanings.

**Trigger:** Confidentiality, operation, executable, argument, path and resource checks; IPC framing, child failure and termination handling.

**Effect:** TERM/KILL escalation is process cleanup, not command retry. Cleanup can fail or supersede an earlier failure. Child detail, status, signal and stderr are not a closed local-code list.

**Retry boundary:** Use the owning state and original identity to establish whether another attempt is safe. This family has no blanket retry rule.

**Safe next action:** Stop new work and inspect child/process-group quiescence and the first diagnostic. Escalation is cleanup, not permission to retry the command.

**Retained evidence:** Preserve the first diagnostic, target and operation identity plus existing journal, receipt, ownership or output evidence. Do not infer that a failed operation erased prior state.

**Consumer / translation:** The named implementation and its actual caller determine the resulting state. A thrown message is not itself a separate code, a terminal result or proof of successful cleanup.

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>&#96;${label} must be a non-empty string array&#96;</code> | Use the family construction rule above. | [skills/common/plugins/command-runner/src/adapter.ts:8](../../../skills/common/plugins/command-runner/src/adapter.ts#L8) |
| <code>Error.message</code> | <code>allowedExecutables must be a non-empty string array</code> | Use the family construction rule above. | [skills/common/plugins/command-runner/src/adapter.ts:8](../../../skills/common/plugins/command-runner/src/adapter.ts#L8) |
| <code>Error.message</code> | <code>allowedWorkingRoots must be a non-empty string array</code> | Use the family construction rule above. | [skills/common/plugins/command-runner/src/adapter.ts:8](../../../skills/common/plugins/command-runner/src/adapter.ts#L8) |
| <code>Error.message</code> | <code>&#96;${label} must be a positive integer&#96;</code> | Use the family construction rule above. | [skills/common/plugins/command-runner/src/adapter.ts:14](../../../skills/common/plugins/command-runner/src/adapter.ts#L14) |
| <code>Error.message</code> | <code>maxOutputBytes must be a positive integer</code> | Use the family construction rule above. | [skills/common/plugins/command-runner/src/adapter.ts:14](../../../skills/common/plugins/command-runner/src/adapter.ts#L14) |
| <code>Error.message</code> | <code>maxExecutionMs must be a positive integer</code> | Use the family construction rule above. | [skills/common/plugins/command-runner/src/adapter.ts:14](../../../skills/common/plugins/command-runner/src/adapter.ts#L14) |
| <code>Error.message</code> | <code>terminationGraceMs must be a positive integer</code> | Use the family construction rule above. | [skills/common/plugins/command-runner/src/adapter.ts:14](../../../skills/common/plugins/command-runner/src/adapter.ts#L14) |
| <code>Error.message</code> | <code>&#96;COMMAND&#95;WORKING&#95;DIRECTORY&#95;INVALID:${canonical}&#96;</code> | Use the family construction rule above. | [skills/common/plugins/command-runner/src/adapter.ts:20](../../../skills/common/plugins/command-runner/src/adapter.ts#L20) |
| <code>Error.message</code> | <code>&#96;COMMAND&#95;EXECUTABLE&#95;INVALID:${canonical}&#96;</code> | Use the family construction rule above. | [skills/common/plugins/command-runner/src/adapter.ts:26](../../../skills/common/plugins/command-runner/src/adapter.ts#L26) |
| <code>Error.message</code> | <code>COMMAND&#95;ARGUMENTS&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/command-runner/src/adapter.ts:32](../../../skills/common/plugins/command-runner/src/adapter.ts#L32) |
| <code>Error.message</code> | <code>executableCatalog must be an object</code> | Use the family construction rule above. | [skills/common/plugins/command-runner/src/adapter.ts:38](../../../skills/common/plugins/command-runner/src/adapter.ts#L38) |
| <code>Error.message</code> | <code>executableCatalog is invalid</code> | Use the family construction rule above. | [skills/common/plugins/command-runner/src/adapter.ts:41](../../../skills/common/plugins/command-runner/src/adapter.ts#L41) |
| <code>Error.message</code> | <code>&#96;COMMAND&#95;OPERATION&#95;UNSUPPORTED:${request.capability}:${request.operation}&#96;</code> | Use the family construction rule above. | [skills/common/plugins/command-runner/src/adapter.ts:47](../../../skills/common/plugins/command-runner/src/adapter.ts#L47) |
| <code>Error.message</code> | <code>COMMAND&#95;RESOURCE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/command-runner/src/adapter.ts:48](../../../skills/common/plugins/command-runner/src/adapter.ts#L48) |
| <code>Error.message</code> | <code>&#96;COMMAND&#95;EXECUTABLE&#95;DENIED:${request.resource.canonicalId}&#96;</code> | Use the family construction rule above. | [skills/common/plugins/command-runner/src/adapter.ts:52](../../../skills/common/plugins/command-runner/src/adapter.ts#L52) |
| <code>Error.message</code> | <code>&#96;COMMAND&#95;EXECUTABLE&#95;DENIED:${request.resource.canonicalId}&#96;</code> | Use the family construction rule above. | [skills/common/plugins/command-runner/src/adapter.ts:53](../../../skills/common/plugins/command-runner/src/adapter.ts#L53) |
| <code>Error.message</code> | <code>&#96;COMMAND&#95;EXECUTABLE&#95;DENIED:${executable}&#96;</code> | Use the family construction rule above. | [skills/common/plugins/command-runner/src/adapter.ts:54](../../../skills/common/plugins/command-runner/src/adapter.ts#L54) |
| <code>Error.message</code> | <code>COMMAND&#95;WORKING&#95;DIRECTORY&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/command-runner/src/adapter.ts:55](../../../skills/common/plugins/command-runner/src/adapter.ts#L55) |
| <code>Error.message</code> | <code>&#96;COMMAND&#95;WORKING&#95;DIRECTORY&#95;DENIED:${cwd}&#96;</code> | Use the family construction rule above. | [skills/common/plugins/command-runner/src/adapter.ts:57](../../../skills/common/plugins/command-runner/src/adapter.ts#L57) |
| <code>Error.message</code> | <code>COMMAND&#95;ENVIRONMENT&#95;DENIED</code> | Use the family construction rule above. | [skills/common/plugins/command-runner/src/adapter.ts:58](../../../skills/common/plugins/command-runner/src/adapter.ts#L58) |
| <code>Error.message</code> | <code>ADAPTER&#95;SHUTTING&#95;DOWN</code> | Use the family construction rule above. | [skills/common/plugins/command-runner/src/adapter.ts:74](../../../skills/common/plugins/command-runner/src/adapter.ts#L74) |
| <code>Error.message</code> | <code>ADAPTER&#95;SHUTTING&#95;DOWN</code> | Use the family construction rule above. | [skills/common/plugins/command-runner/src/adapter.ts:80](../../../skills/common/plugins/command-runner/src/adapter.ts#L80) |
| <code>Error.message</code> | <code>ADAPTER&#95;CANCELLED</code> | Use the family construction rule above. | [skills/common/plugins/command-runner/src/adapter.ts:81](../../../skills/common/plugins/command-runner/src/adapter.ts#L81) |
| <code>Error.message</code> | <code>COMMAND&#95;PROCESS&#95;GROUP&#95;IDENTITY&#95;UNAVAILABLE</code> | Use the family construction rule above. | [skills/common/plugins/command-runner/src/process-group.ts:49](../../../skills/common/plugins/command-runner/src/process-group.ts#L49) |
| <code>Error.message</code> | <code>COMMAND&#95;PROCESS&#95;GROUP&#95;CLEANUP&#95;TIMEOUT</code> | Use the family construction rule above. | [skills/common/plugins/command-runner/src/process-group.ts:52](../../../skills/common/plugins/command-runner/src/process-group.ts#L52) |
| <code>Error.message</code> | <code>COMMAND&#95;PROCESS&#95;GROUP&#95;STATUS&#95;FAILED</code> | Use the family construction rule above. | [skills/common/plugins/command-runner/src/process-group.ts:74](../../../skills/common/plugins/command-runner/src/process-group.ts#L74) |
| <code>Error.message</code> | <code>&#96;ISOLATION&#95;${label}&#95;NOT&#95;SERIALIZABLE&#96;</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/isolation/session.ts:8](../../../skills/common/plugin-runtime/foundation/isolation/session.ts#L8) |
| <code>Error.message</code> | <code>ISOLATION&#95;INVOCATION&#95;NOT&#95;SERIALIZABLE</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/isolation/session.ts:8](../../../skills/common/plugin-runtime/foundation/isolation/session.ts#L8) |
| <code>Error.message</code> | <code>ISOLATION&#95;RESPONSE&#95;NOT&#95;SERIALIZABLE</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/isolation/session.ts:8](../../../skills/common/plugin-runtime/foundation/isolation/session.ts#L8) |
| <code>Error.message</code> | <code>ISOLATION&#95;RESULT&#95;NOT&#95;SERIALIZABLE</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/isolation/session.ts:8](../../../skills/common/plugin-runtime/foundation/isolation/session.ts#L8) |
| <code>Error.message</code> | <code>&#96;ISOLATION&#95;${label}&#95;NOT&#95;SERIALIZABLE&#96;</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/isolation/session.ts:9](../../../skills/common/plugin-runtime/foundation/isolation/session.ts#L9) |
| <code>Error.message</code> | <code>ISOLATION&#95;INVOCATION&#95;NOT&#95;SERIALIZABLE</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/isolation/session.ts:9](../../../skills/common/plugin-runtime/foundation/isolation/session.ts#L9) |
| <code>Error.message</code> | <code>ISOLATION&#95;RESPONSE&#95;NOT&#95;SERIALIZABLE</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/isolation/session.ts:9](../../../skills/common/plugin-runtime/foundation/isolation/session.ts#L9) |
| <code>Error.message</code> | <code>ISOLATION&#95;RESULT&#95;NOT&#95;SERIALIZABLE</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/isolation/session.ts:9](../../../skills/common/plugin-runtime/foundation/isolation/session.ts#L9) |
| <code>Error.message</code> | <code>&#96;ISOLATION&#95;${label}&#95;TOO&#95;LARGE&#96;</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/isolation/session.ts:10](../../../skills/common/plugin-runtime/foundation/isolation/session.ts#L10) |
| <code>Error.message</code> | <code>ISOLATION&#95;INVOCATION&#95;TOO&#95;LARGE</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/isolation/session.ts:10](../../../skills/common/plugin-runtime/foundation/isolation/session.ts#L10) |
| <code>Error.message</code> | <code>ISOLATION&#95;RESPONSE&#95;TOO&#95;LARGE</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/isolation/session.ts:10](../../../skills/common/plugin-runtime/foundation/isolation/session.ts#L10) |
| <code>Error.message</code> | <code>ISOLATION&#95;RESULT&#95;TOO&#95;LARGE</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/isolation/session.ts:10](../../../skills/common/plugin-runtime/foundation/isolation/session.ts#L10) |
| <code>Error.message</code> | <code>ISOLATION&#95;SESSION&#95;CLOSED</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/isolation/session.ts:86](../../../skills/common/plugin-runtime/foundation/isolation/session.ts#L86) |
| <code>Error.message</code> | <code>ISOLATION&#95;SANDBOX&#95;NOT&#95;BUILT</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/isolation/runner.ts:19](../../../skills/common/plugin-runtime/foundation/isolation/runner.ts#L19) |
| <code>Error.message</code> | <code>ISOLATION&#95;MODULE&#95;OUTSIDE&#95;PACKAGE</code> | Use the family construction rule above. | [skills/common/plugin-runtime/foundation/isolation/runner.ts:25](../../../skills/common/plugin-runtime/foundation/isolation/runner.ts#L25) |

**Owning / consuming source:**

- [skills/common/plugins/command-runner/src/adapter.ts:1](../../../skills/common/plugins/command-runner/src/adapter.ts#L1)
- [skills/common/plugins/command-runner/src/process-group.ts:1](../../../skills/common/plugins/command-runner/src/process-group.ts#L1)
- [skills/common/plugin-runtime/foundation/isolation/session.ts:1](../../../skills/common/plugin-runtime/foundation/isolation/session.ts#L1)
- [skills/common/plugin-runtime/foundation/isolation/runner.ts:1](../../../skills/common/plugin-runtime/foundation/isolation/runner.ts#L1)

<a id="core-guards-7"></a>

## Git workspace operations

**Representation:** own common/worker guard and message family

**Identity / construction:** Source-defined message and guard family. Exact forms below distinguish literal values from symbolic patterns. Returned/forwarded/control outcomes keep their own meanings.

**Trigger:** Capability, workspace ownership and approved-Source checks around actual Git mutations; process failures include upstream status/signal/stderr.

**Effect:** Commit, checkout, merge, push or removal can precede a later failure. Do not claim repository rollback or recommend a blind repeat from the message alone.

**Retry boundary:** Use the owning state and original identity to establish whether another attempt is safe. This family has no blanket retry rule.

**Safe next action:** Inspect the actual workspace, Git state and approved Source before retrying. Earlier commits, checkouts, merges or pushes may already have happened.

**Retained evidence:** Preserve the first diagnostic, target and operation identity plus existing journal, receipt, ownership or output evidence. Do not infer that a failed operation erased prior state.

**Consumer / translation:** The named implementation and its actual caller determine the resulting state. A thrown message is not itself a separate code, a terminal result or proof of successful cleanup.

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>GIT&#95;RESOURCE&#95;MISMATCH</code> | Use the family construction rule above. | [skills/common/plugins/git-workspace/src/operations.ts:15](../../../skills/common/plugins/git-workspace/src/operations.ts#L15) |
| <code>Error.message</code> | <code>&#96;GIT&#95;PATH&#95;DENIED:${canonical}&#96;</code> | Use the family construction rule above. | [skills/common/plugins/git-workspace/src/operations.ts:22](../../../skills/common/plugins/git-workspace/src/operations.ts#L22) |
| <code>Error.message</code> | <code>SOURCE&#95;APPROVAL&#95;WORKSPACE&#95;MISMATCH</code> | Use the family construction rule above. | [skills/common/plugins/git-workspace/src/operations.ts:25](../../../skills/common/plugins/git-workspace/src/operations.ts#L25) |
| <code>Error.message</code> | <code>GIT&#95;RESOURCE&#95;MISMATCH</code> | Use the family construction rule above. | [skills/common/plugins/git-workspace/src/operations.ts:35](../../../skills/common/plugins/git-workspace/src/operations.ts#L35) |
| <code>Error.message</code> | <code>GIT&#95;WORKSPACE&#95;RESOURCE&#95;MISMATCH</code> | Use the family construction rule above. | [skills/common/plugins/git-workspace/src/operations.ts:39](../../../skills/common/plugins/git-workspace/src/operations.ts#L39) |
| <code>Error.message</code> | <code>&#96;GIT&#95;PATH&#95;DENIED:${String(workspace)}&#96;</code> | Use the family construction rule above. | [skills/common/plugins/git-workspace/src/operations.ts:41](../../../skills/common/plugins/git-workspace/src/operations.ts#L41) |
| <code>Error.message</code> | <code>GIT&#95;SYNC&#95;TREE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/git-workspace/src/operations.ts:55](../../../skills/common/plugins/git-workspace/src/operations.ts#L55) |
| <code>Error.message</code> | <code>&#96;GIT&#95;SYNC&#95;NOT&#95;A&#95;FILE:${file}&#96;</code> | Use the family construction rule above. | [skills/common/plugins/git-workspace/src/operations.ts:62](../../../skills/common/plugins/git-workspace/src/operations.ts#L62) |
| <code>Error.message</code> | <code>GIT&#95;WORKSPACE&#95;RESOURCE&#95;MISMATCH</code> | Use the family construction rule above. | [skills/common/plugins/git-workspace/src/operations.ts:82](../../../skills/common/plugins/git-workspace/src/operations.ts#L82) |
| <code>Error.message</code> | <code>&#96;GIT&#95;OPERATION&#95;UNSUPPORTED:${request.capability}:${request.operation}&#96;</code> | Use the family construction rule above. | [skills/common/plugins/git-workspace/src/operations.ts:117](../../../skills/common/plugins/git-workspace/src/operations.ts#L117) |
| <code>Error.message</code> | <code>SOURCE&#95;APPROVAL&#95;BINDING&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/git-workspace/src/review-source.ts:9](../../../skills/common/plugins/git-workspace/src/review-source.ts#L9) |
| <code>Error.message</code> | <code>SOURCE&#95;APPROVAL&#95;REPOSITORY&#95;MISMATCH</code> | Use the family construction rule above. | [skills/common/plugins/git-workspace/src/review-source.ts:12](../../../skills/common/plugins/git-workspace/src/review-source.ts#L12) |
| <code>Error.message</code> | <code>REVIEW&#95;SUBJECT&#95;STALE</code> | Use the family construction rule above. | [skills/common/plugins/git-workspace/src/review-source.ts:18](../../../skills/common/plugins/git-workspace/src/review-source.ts#L18) |
| <code>Error.message</code> | <code>REVIEW&#95;SUBJECT&#95;PATHS&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/git-workspace/src/review-source.ts:19](../../../skills/common/plugins/git-workspace/src/review-source.ts#L19) |
| <code>Error.message</code> | <code>SOURCE&#95;APPROVAL&#95;WORKSPACE&#95;MODE&#95;MISMATCH</code> | Use the family construction rule above. | [skills/common/plugins/git-workspace/src/review-source.ts:29](../../../skills/common/plugins/git-workspace/src/review-source.ts#L29) |
| <code>Error.message</code> | <code>SOURCE&#95;APPROVAL&#95;WORKSPACE&#95;BYTES&#95;MISMATCH</code> | Use the family construction rule above. | [skills/common/plugins/git-workspace/src/review-source.ts:32](../../../skills/common/plugins/git-workspace/src/review-source.ts#L32) |
| <code>Error.message</code> | <code>SOURCE&#95;APPROVAL&#95;TRANSITION&#95;PARENT&#95;MISMATCH</code> | Use the family construction rule above. | [skills/common/plugins/git-workspace/src/review-source.ts:40](../../../skills/common/plugins/git-workspace/src/review-source.ts#L40) |
| <code>Error.message</code> | <code>GIT&#95;WORKSPACE&#95;COMMIT&#95;BINDING&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/git-workspace/src/review-source.ts:49](../../../skills/common/plugins/git-workspace/src/review-source.ts#L49) |
| <code>Error.message</code> | <code>GIT&#95;WORKSPACE&#95;SOURCE&#95;MOVED</code> | Use the family construction rule above. | [skills/common/plugins/git-workspace/src/review-source.ts:51](../../../skills/common/plugins/git-workspace/src/review-source.ts#L51) |
| <code>Error.message</code> | <code>GIT&#95;MERGE&#95;REVISION&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/git-workspace/src/review-source.ts:57](../../../skills/common/plugins/git-workspace/src/review-source.ts#L57) |
| <code>Error.message</code> | <code>GIT&#95;MERGE&#95;SOURCE&#95;MOVED</code> | Use the family construction rule above. | [skills/common/plugins/git-workspace/src/review-source.ts:58](../../../skills/common/plugins/git-workspace/src/review-source.ts#L58) |
| <code>Error.message</code> | <code>ADAPTER&#95;SHUTTING&#95;DOWN</code> | Use the family construction rule above. | [skills/common/plugins/git-workspace/src/runner.ts:16](../../../skills/common/plugins/git-workspace/src/runner.ts#L16) |
| <code>Error.message</code> | <code>ADAPTER&#95;CANCELLED</code> | Use the family construction rule above. | [skills/common/plugins/git-workspace/src/runner.ts:17](../../../skills/common/plugins/git-workspace/src/runner.ts#L17) |
| <code>Error.message</code> | <code>GIT&#95;WORKSPACE&#95;ROOT&#95;MISMATCH</code> | Use the family construction rule above. | [skills/common/plugins/git-workspace/src/workspace-ownership.ts:24](../../../skills/common/plugins/git-workspace/src/workspace-ownership.ts#L24) |
| <code>Error.message</code> | <code>GIT&#95;WORKSPACE&#95;OWNER&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/git-workspace/src/workspace-ownership.ts:30](../../../skills/common/plugins/git-workspace/src/workspace-ownership.ts#L30) |
| <code>Error.message</code> | <code>GIT&#95;WORKSPACE&#95;OWNER&#95;MISMATCH</code> | Use the family construction rule above. | [skills/common/plugins/git-workspace/src/workspace-ownership.ts:31](../../../skills/common/plugins/git-workspace/src/workspace-ownership.ts#L31) |

**Owning / consuming source:**

- [skills/common/plugins/git-workspace/src/operations.ts:1](../../../skills/common/plugins/git-workspace/src/operations.ts#L1)
- [skills/common/plugins/git-workspace/src/review-source.ts:1](../../../skills/common/plugins/git-workspace/src/review-source.ts#L1)
- [skills/common/plugins/git-workspace/src/runner.ts:1](../../../skills/common/plugins/git-workspace/src/runner.ts#L1)
- [skills/common/plugins/git-workspace/src/workspace-ownership.ts:1](../../../skills/common/plugins/git-workspace/src/workspace-ownership.ts#L1)

<a id="core-guards-8"></a>

## Operator delivery and receipts

**Representation:** own common/worker guard and message family

**Identity / construction:** Source-defined message and guard family. Exact forms below distinguish literal values from symbolic patterns. Returned/forwarded/control outcomes keep their own meanings.

**Trigger:** Payload validation, target/secret binding, delivery reservation, response status and receipt identity/digest matching. Receipt queries distinguish absent from accepted.

**Effect:** Reservation precedes sending. The sent marker precedes network invocation. A failed receipt check does not prove that no delivery occurred; no blind resend rule. Receiver deduplication is a receiver contract, not proved by a local GET.

**Retry boundary:** Use the owning state and original identity to establish whether another attempt is safe. This family has no blanket retry rule.

**Safe next action:** Query the original receipt/reservation with its original identity. A sent marker or failed receipt check is not proof that delivery did not occur; do not blindly resend.

**Retained evidence:** Preserve the first diagnostic, target and operation identity plus existing journal, receipt, ownership or output evidence. Do not infer that a failed operation erased prior state.

**Consumer / translation:** The named implementation and its actual caller determine the resulting state. A thrown message is not itself a separate code, a terminal result or proof of successful cleanup.

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>OPERATOR&#95;ENDPOINT&#95;UNAVAILABLE</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/adapter.ts:17](../../../skills/common/plugins/operator-messaging/src/adapter.ts#L17) |
| <code>Error.message</code> | <code>OPERATOR&#95;SECRET&#95;ENDPOINT&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/adapter.ts:21](../../../skills/common/plugins/operator-messaging/src/adapter.ts#L21) |
| <code>Error.message</code> | <code>OPERATOR&#95;SECRET&#95;ENDPOINT&#95;DENIED</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/adapter.ts:23](../../../skills/common/plugins/operator-messaging/src/adapter.ts#L23) |
| <code>Error.message</code> | <code>OPERATOR&#95;DELIVERY&#95;INVALID&#95;RESPONSE</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/adapter.ts:29](../../../skills/common/plugins/operator-messaging/src/adapter.ts#L29) |
| <code>Error.message</code> | <code>OPERATOR&#95;SECRET&#95;UNAVAILABLE</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/adapter.ts:45](../../../skills/common/plugins/operator-messaging/src/adapter.ts#L45) |
| <code>Error.message</code> | <code>ADAPTER&#95;CANCELLED</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/adapter.ts:47](../../../skills/common/plugins/operator-messaging/src/adapter.ts#L47) |
| <code>Error.message</code> | <code>ADAPTER&#95;CANCELLED</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/adapter.ts:61](../../../skills/common/plugins/operator-messaging/src/adapter.ts#L61) |
| <code>Error.message</code> | <code>ADAPTER&#95;SHUTTING&#95;DOWN</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/adapter.ts:76](../../../skills/common/plugins/operator-messaging/src/adapter.ts#L76) |
| <code>Error.message</code> | <code>ADAPTER&#95;SHUTTING&#95;DOWN</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/adapter.ts:80](../../../skills/common/plugins/operator-messaging/src/adapter.ts#L80) |
| <code>Error.message</code> | <code>ADAPTER&#95;CANCELLED</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/adapter.ts:81](../../../skills/common/plugins/operator-messaging/src/adapter.ts#L81) |
| <code>Error.message</code> | <code>&#96;OPERATOR&#95;TARGET&#95;DENIED:${request.resource.canonicalId}&#96;</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/adapter.ts:89](../../../skills/common/plugins/operator-messaging/src/adapter.ts#L89) |
| <code>Error.message</code> | <code>&#96;OPERATOR&#95;TARGET&#95;DENIED:${request.resource.canonicalId}&#96;</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/adapter.ts:96](../../../skills/common/plugins/operator-messaging/src/adapter.ts#L96) |
| <code>Error.message</code> | <code>OPERATOR&#95;RECEIPT&#95;OPERATION&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/adapter.ts:108](../../../skills/common/plugins/operator-messaging/src/adapter.ts#L108) |
| <code>Error.message</code> | <code>OPERATOR&#95;RECEIPT&#95;TARGET&#95;DENIED</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/adapter.ts:109](../../../skills/common/plugins/operator-messaging/src/adapter.ts#L109) |
| <code>Error.message</code> | <code>OPERATOR&#95;RECEIPT&#95;QUERY&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/adapter.ts:113](../../../skills/common/plugins/operator-messaging/src/adapter.ts#L113) |
| <code>Error.message</code> | <code>&#96;${error}:${key}&#96;</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:12](../../../skills/common/plugins/operator-messaging/src/payload.ts#L12) |
| <code>Error.message</code> | <code>&#96;OPERATOR&#95;PAYLOAD&#95;INVALID:${label}&#96;</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:20](../../../skills/common/plugins/operator-messaging/src/payload.ts#L20) |
| <code>Error.message</code> | <code>OPERATOR&#95;PAYLOAD&#95;INVALID:authorizedIssuer.id</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:20](../../../skills/common/plugins/operator-messaging/src/payload.ts#L20) |
| <code>Error.message</code> | <code>&#96;OPERATOR&#95;PAYLOAD&#95;INVALID:${label}:key&#96;</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:28](../../../skills/common/plugins/operator-messaging/src/payload.ts#L28) |
| <code>Error.message</code> | <code>&#96;OPERATOR&#95;PAYLOAD&#95;INVALID:${label}:depth&#96;</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:33](../../../skills/common/plugins/operator-messaging/src/payload.ts#L33) |
| <code>Error.message</code> | <code>OPERATOR&#95;PAYLOAD&#95;INVALID:artifact:depth</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:33](../../../skills/common/plugins/operator-messaging/src/payload.ts#L33) |
| <code>Error.message</code> | <code>OPERATOR&#95;PAYLOAD&#95;INVALID:payload:depth</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:33](../../../skills/common/plugins/operator-messaging/src/payload.ts#L33) |
| <code>Error.message</code> | <code>&#96;OPERATOR&#95;PAYLOAD&#95;INVALID:${label}:array&#96;</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:38](../../../skills/common/plugins/operator-messaging/src/payload.ts#L38) |
| <code>Error.message</code> | <code>OPERATOR&#95;PAYLOAD&#95;INVALID:artifact:array</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:38](../../../skills/common/plugins/operator-messaging/src/payload.ts#L38) |
| <code>Error.message</code> | <code>OPERATOR&#95;PAYLOAD&#95;INVALID:payload:array</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:38](../../../skills/common/plugins/operator-messaging/src/payload.ts#L38) |
| <code>Error.message</code> | <code>&#96;OPERATOR&#95;PAYLOAD&#95;INVALID:${label}:json&#96;</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:42](../../../skills/common/plugins/operator-messaging/src/payload.ts#L42) |
| <code>Error.message</code> | <code>OPERATOR&#95;PAYLOAD&#95;INVALID:artifact:json</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:42](../../../skills/common/plugins/operator-messaging/src/payload.ts#L42) |
| <code>Error.message</code> | <code>OPERATOR&#95;PAYLOAD&#95;INVALID:payload:json</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:42](../../../skills/common/plugins/operator-messaging/src/payload.ts#L42) |
| <code>Error.message</code> | <code>&#96;OPERATOR&#95;PAYLOAD&#95;INVALID:${label}:object&#96;</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:44](../../../skills/common/plugins/operator-messaging/src/payload.ts#L44) |
| <code>Error.message</code> | <code>OPERATOR&#95;PAYLOAD&#95;INVALID:artifact:object</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:44](../../../skills/common/plugins/operator-messaging/src/payload.ts#L44) |
| <code>Error.message</code> | <code>OPERATOR&#95;PAYLOAD&#95;INVALID:payload:object</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:44](../../../skills/common/plugins/operator-messaging/src/payload.ts#L44) |
| <code>Error.message</code> | <code>OPERATOR&#95;PAYLOAD&#95;INVALID:fields</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:53](../../../skills/common/plugins/operator-messaging/src/payload.ts#L53) |
| <code>Error.message</code> | <code>&#96;OPERATOR&#95;PAYLOAD&#95;INVALID:fields&#91;${index}&#93;&#96;</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:55](../../../skills/common/plugins/operator-messaging/src/payload.ts#L55) |
| <code>Error.message</code> | <code>&#96;OPERATOR&#95;PAYLOAD&#95;INVALID:fields&#91;${index}&#93;.inline&#96;</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:60](../../../skills/common/plugins/operator-messaging/src/payload.ts#L60) |
| <code>Error.message</code> | <code>&#96;OPERATOR&#95;PAYLOAD&#95;INVALID:${label}&#96;</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:68](../../../skills/common/plugins/operator-messaging/src/payload.ts#L68) |
| <code>Error.message</code> | <code>OPERATOR&#95;PAYLOAD&#95;INVALID:occurredAt</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:68](../../../skills/common/plugins/operator-messaging/src/payload.ts#L68) |
| <code>Error.message</code> | <code>OPERATOR&#95;PAYLOAD&#95;INVALID:expiresAt</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:68](../../../skills/common/plugins/operator-messaging/src/payload.ts#L68) |
| <code>Error.message</code> | <code>OPERATOR&#95;PAYLOAD&#95;INVALID:authorizedIssuer</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:73](../../../skills/common/plugins/operator-messaging/src/payload.ts#L73) |
| <code>Error.message</code> | <code>OPERATOR&#95;PAYLOAD&#95;INVALID:authorizedIssuer.type</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:75](../../../skills/common/plugins/operator-messaging/src/payload.ts#L75) |
| <code>Error.message</code> | <code>OPERATOR&#95;PAYLOAD&#95;INVALID:root</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:94](../../../skills/common/plugins/operator-messaging/src/payload.ts#L94) |
| <code>Error.message</code> | <code>OPERATOR&#95;PAYLOAD&#95;INVALID:type</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:96](../../../skills/common/plugins/operator-messaging/src/payload.ts#L96) |
| <code>Error.message</code> | <code>OPERATOR&#95;PAYLOAD&#95;SIZE&#95;EXCEEDED</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:99](../../../skills/common/plugins/operator-messaging/src/payload.ts#L99) |
| <code>Error.message</code> | <code>OPERATOR&#95;OPERATION&#95;UNSUPPORTED</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:104](../../../skills/common/plugins/operator-messaging/src/payload.ts#L104) |
| <code>Error.message</code> | <code>OPERATOR&#95;RESOURCE&#95;TYPE&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:105](../../../skills/common/plugins/operator-messaging/src/payload.ts#L105) |
| <code>Error.message</code> | <code>OPERATOR&#95;TARGET&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:106](../../../skills/common/plugins/operator-messaging/src/payload.ts#L106) |
| <code>Error.message</code> | <code>OPERATOR&#95;SECRET&#95;UNAVAILABLE</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/payload.ts:111](../../../skills/common/plugins/operator-messaging/src/payload.ts#L111) |
| <code>Error.message</code> | <code>OPERATOR&#95;DISCORD&#95;RECEIPT&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/discord-receipt.ts:34](../../../skills/common/plugins/operator-messaging/src/discord-receipt.ts#L34) |
| <code>Error.message</code> | <code>OPERATOR&#95;DISCORD&#95;RECEIPT&#95;UNBOUND:reconciliation&#95;required</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/discord-receipt.ts:44](../../../skills/common/plugins/operator-messaging/src/discord-receipt.ts#L44) |
| <code>Error.message</code> | <code>OPERATOR&#95;RECEIVER&#95;CONTRACT&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/receiver.ts:14](../../../skills/common/plugins/operator-messaging/src/receiver.ts#L14) |
| <code>Error.message</code> | <code>OPERATOR&#95;RECEIVER&#95;RECEIPT&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/operator-messaging/src/receiver.ts:17](../../../skills/common/plugins/operator-messaging/src/receiver.ts#L17) |

**Owning / consuming source:**

- [skills/common/plugins/operator-messaging/src/adapter.ts:1](../../../skills/common/plugins/operator-messaging/src/adapter.ts#L1)
- [skills/common/plugins/operator-messaging/src/payload.ts:1](../../../skills/common/plugins/operator-messaging/src/payload.ts#L1)
- [skills/common/plugins/operator-messaging/src/discord-receipt.ts:1](../../../skills/common/plugins/operator-messaging/src/discord-receipt.ts#L1)
- [skills/common/plugins/operator-messaging/src/receiver.ts:1](../../../skills/common/plugins/operator-messaging/src/receiver.ts#L1)

<a id="core-guards-9"></a>

## Observer hooks and notifications

**Representation:** own common/worker guard and message family

**Identity / construction:** Source-defined message and guard family. Exact forms below distinguish literal values from symbolic patterns. Returned/forwarded/control outcomes keep their own meanings.

**Trigger:** Configuration and SDK/hook availability checks; bounded normalization and lifecycle-error projections. External error fields can become event data.

**Effect:** A projected error label is not a new thrown code or delivery proof. Subscription cleanup can fail; SDK callbacks and release errors remain upstream.

**Retry boundary:** Use the owning state and original identity to establish whether another attempt is safe. This family has no blanket retry rule.

**Safe next action:** Correct the selected hook/SDK/configuration boundary and retain lifecycle diagnostics. Do not treat an event projection as a newly thrown error or delivery receipt.

**Retained evidence:** Preserve the first diagnostic, target and operation identity plus existing journal, receipt, ownership or output evidence. Do not infer that a failed operation erased prior state.

**Consumer / translation:** The named implementation and its actual caller determine the resulting state. A thrown message is not itself a separate code, a terminal result or proof of successful cleanup.

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>openclaw/plugin-sdk/diagnostic-runtime onDiagnosticEvent is unavailable</code> | Use the family construction rule above. | [skills/common/plugins/openclaw-agent-observer/src/diagnostics.ts:33](../../../skills/common/plugins/openclaw-agent-observer/src/diagnostics.ts#L33) |
| <code>Error.message</code> | <code>&#96;unsupported OpenClaw agent observability hook: ${hook}&#96;</code> | Use the family construction rule above. | [skills/common/plugins/openclaw-agent-observer/src/hook-payloads.ts:206](../../../skills/common/plugins/openclaw-agent-observer/src/hook-payloads.ts#L206) |
| <code>Error.message</code> | <code>AGENT&#95;EVENT&#95;HOOKS&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/openclaw-agent-events/src/adapter.ts:70](../../../skills/common/plugins/openclaw-agent-events/src/adapter.ts#L70) |
| <code>Error.message</code> | <code>&#96;AGENT&#95;EVENT&#95;HOOK&#95;UNSUPPORTED:${String(hook)}&#96;</code> | Use the family construction rule above. | [skills/common/plugins/openclaw-agent-events/src/adapter.ts:72](../../../skills/common/plugins/openclaw-agent-events/src/adapter.ts#L72) |
| <code>Error.message</code> | <code>AGENT&#95;EVENT&#95;HOOK&#95;DUPLICATE</code> | Use the family construction rule above. | [skills/common/plugins/openclaw-agent-events/src/adapter.ts:75](../../../skills/common/plugins/openclaw-agent-events/src/adapter.ts#L75) |
| <code>Error.message</code> | <code>OPENCLAW&#95;HOOK&#95;API&#95;UNAVAILABLE</code> | Use the family construction rule above. | [skills/common/plugins/openclaw-agent-events/src/adapter.ts:83](../../../skills/common/plugins/openclaw-agent-events/src/adapter.ts#L83) |
| <code>Error.message</code> | <code>ADAPTER&#95;CANCELLED</code> | Use the family construction rule above. | [skills/common/plugins/openclaw-agent-events/src/adapter.ts:102](../../../skills/common/plugins/openclaw-agent-events/src/adapter.ts#L102) |
| <code>Error.message</code> | <code>AGENT&#95;EVENT&#95;SOURCE&#95;OPERATION&#95;UNSUPPORTED</code> | Use the family construction rule above. | [skills/common/plugins/openclaw-agent-events/src/adapter.ts:104](../../../skills/common/plugins/openclaw-agent-events/src/adapter.ts#L104) |
| <code>Error.message</code> | <code>NOTIFICATION&#95;TARGET&#95;INVALID</code> | Use the family construction rule above. | [skills/common/plugins/notification-observer/src/observer.ts:50](../../../skills/common/plugins/notification-observer/src/observer.ts#L50) |

**Owning / consuming source:**

- [skills/common/plugins/openclaw-agent-observer/src/diagnostics.ts:1](../../../skills/common/plugins/openclaw-agent-observer/src/diagnostics.ts#L1)
- [skills/common/plugins/openclaw-agent-observer/src/hook-payloads.ts:1](../../../skills/common/plugins/openclaw-agent-observer/src/hook-payloads.ts#L1)
- [skills/common/plugins/openclaw-agent-events/src/adapter.ts:1](../../../skills/common/plugins/openclaw-agent-events/src/adapter.ts#L1)
- [skills/common/plugins/notification-observer/src/observer.ts:1](../../../skills/common/plugins/notification-observer/src/observer.ts#L1)

<!-- END GENERATED: common error catalogue -->
