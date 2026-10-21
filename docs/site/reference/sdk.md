# Plugin SDK reference

Status: current SDK API reference
Audience: plugin author, runtime maintainer
Owner: documentation automation
Evidence: skills/common/plugin-runtime/sdk/package.json; skills/common/plugin-runtime/sdk/src/index.ts; skills/common/plugin-runtime/sdk/src/values.ts; skills/common/plugin-runtime/sdk/src/runtime.ts; skills/common/plugin-runtime/sdk/src/source-revision.ts; skills/common/plugin-runtime/sdk/src/review-subject.ts; skills/common/plugin-runtime/sdk/src/source-preflight.ts; skills/common/plugin-runtime/sdk/src/source-approval.ts; skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json; scripts/docs-sdk-semantics.mjs
Applies to: current private workspace SDK entrypoints and plugin-system v2 contracts
Last verified: 2026-10-12; source and bounded pure JSON checks

The plugin SDK is the shared contract between a pipeline plugin and its runtime. Use it to type a stage, observer, capability adapter, test provider or report adapter. Use its helpers to preserve exact JSON bytes and source identity. The SDK does not activate a package, issue a capability grant, start an agent or provide a database.

A **capability** is a named operation that the runtime permits a plugin to request. A **lease** is the current, revocable authority for one invocation. An **artifact** is stored output with an exact byte digest and producer identity. A **digest** is a SHA-256 hash of selected bytes; equal digests do not prove equal authority.

Owner: Documentation automation; SDK maintainers own the product contract. Evidence: source-checked against `586f1f558a673c4df51c0afb9ea535c814b933b1`. The bounded JSON unit check is listed below. Examples that call capabilities are source-only; no activation, provider process, external effect or live deployment is claimed.

## Find the contract you need

The [complete export and field inventory](sdk-exports.md) gives every exported type, helper, constant and testing function. Each entry has its consumer meaning, compiler-discovered shape, source, schema constraints where applicable, and a source-only example. Read that entry before relying on an optional field or an unfamiliar helper.

| Task | Entry or section |
| --- | --- |
| Implement a stage or observer | [`PluginInvocationContext`](sdk-exports.md#plugininvocationcontext), [`StageResult`](sdk-exports.md#stageresult), [`ObserverHandler`](sdk-exports.md#observerhandler) |
| Implement a capability adapter | [`AdapterFactory`](sdk-exports.md#adapterfactory), [`AdapterInstance`](sdk-exports.md#adapterinstance), [`AdapterInvocation`](sdk-exports.md#adapterinvocation), [`AdapterActivationContext`](sdk-exports.md#adapteractivationcontext) |
| Implement a test provider | [`TestProviderFactory`](sdk-exports.md#testproviderfactory), [`TestProviderInstance`](sdk-exports.md#testproviderinstance), [`TestProviderExecutionContext`](sdk-exports.md#testproviderexecutioncontext) |
| Parse a test report | [`ReportAdapterFunction`](sdk-exports.md#reportadapterfunction), [`ReportAdapterInput`](sdk-exports.md#reportadapterinput), [`ReportAdapterOutput`](sdk-exports.md#reportadapteroutput) |
| Serialize or hash data | [JSON and digest rules](#json-and-digest-rules) |
| Read exact artifact bytes | [Artifact-byte verification](#artifact-byte-verification) |
| Select source, preflight and approval | [Source selection and approval](#source-selection-and-approval) |
| Preserve an old encoding | [Version and absence rules](#version-and-absence-rules) |
| Add a testing exhaustiveness check | [Testing entrypoint](#testing-entrypoint) |

For package layout, manifest registration, activation and disablement, use [extension contracts](../extend/contracts.md) and the [Extend entry](../extend/README.md). This page owns SDK API behavior; those pages own the extension task. The [developer handbook](../extend/developer-handbook.md) explains the contributor change/check route.

## Package and import boundary

`@kubeclaw/plugin-sdk` is a private workspace package. Its package manifest exports exactly `.` and `./testing`. The main entrypoint exports contracts, values, runtime helpers, source helpers and selected runtime interfaces. The testing entrypoint exports `assertNever` only. Do not assume that a source file is a supported package subpath.

```ts
import {
  PLUGIN_API_VERSION,
  portableJson,
  sha256Text,
  type PluginInvocationContext,
  type StageResult,
} from '@kubeclaw/plugin-sdk';
import { assertNever } from '@kubeclaw/plugin-sdk/testing';
```

The package points to TypeScript source in this workspace. Its build configuration emits declarations, not a separate JavaScript SDK implementation. Use the repository's supported Node/TypeScript setup; do not assume this private package is published for installation from a registry.

`PLUGIN_API_VERSION` is `pipeline-plugin-v2`. It is the manifest API token, not a package version, transport encoding or artifact version. `ProviderInvocationV1`, `ProviderResultV1`, `ReportAdapterResultV1`, `ReportCountsV1`, `ReportCaseV1` and `FindingV1` belong to `@kubeclaw/pipeline-test-gate-contract`. SDK callback signatures refer to them, but the SDK does not re-export them as named types.

The public `CapabilityInvocation` is the readonly interface selected by the main entrypoint's explicit type export. A generated contract with the same name is not the public named shape. `AdapterInvocation` reaches the fenced/confidential variants and `AdapterResourceFence`, but those three support declarations are not named exports from the main entrypoint. Use the union and its discriminator instead of importing an internal support type. `PluginSystemV2.capabilityInvocation` refers to the generated, mutable `CapabilityInvocation` with a string index of `any`, not the same-named public readonly runtime interface. The [qualified support closure](sdk-exports.md#reachable-support-types) preserves that separate declaration and all reachable KubeClaw callback types without adding named SDK exports.

| Source field | Evidence |
| --- | --- |
| Claim | The manifest selects two TypeScript entrypoints; explicit runtime type exports determine the public invocation shape. |
| Implementation | [Main exports](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/index.ts#L1-L33), [testing export](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/testing/index.ts#L1-L3), [runtime interfaces](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L22-L66) |
| Contract or setting | [Package exports](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/package.json#L1-L16), [declaration build](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/tsconfig.build.json#L1-L21) |
| Test evidence | Compiler enumeration of both actual entrypoints is a documentation fact check; it does not execute plugin code. |
| Revision | `586f1f558a673c4df51c0afb9ea535c814b933b1` |
| Limit | Import visibility and type discovery do not prove module activation or a live plugin run. |

## From plugin request to adapter result

1. The registry validates a plugin manifest and its referenced schemas. A registration names the module, exported function, schemas and required capabilities. An adapter registration also declares the capabilities it provides.
2. The runtime supplies a `PluginContext` contract and wraps it in `PluginInvocationContext`. The contract carries a lease, resolved input/configuration and visible artifact references. Optional producer profiles remain explicit data.
3. A plugin calls `context.invoke(capability, request)`. The runtime checks its active lease, the capability grant and the capability's constraints. For a tagged runtime dispatch request, it also validates the closed invocation schema. The request's `resource.canonicalId` has capability-specific meaning; it is not always a relative path.
4. The adapter runtime chooses the granted provider. For an ordinary durable effect, the effect coordinator owns request identity, the journal, resource locking and receipts. A repeated idempotency key must still match the original request and payload. The adapter receives an `AdapterInvocation`, not an arbitrary unadmitted payload.
5. The adapter checks cancellation and, for a nonconfidential invocation, the current fence before the external effect. A **fence** rejects work whose lock is no longer current. The adapter returns a record; the coordinator determines durable completion and the runtime returns the completed result.

A typed object does not create permission. The SDK interfaces provide no authorization shortcut. A plugin's `emit` also requires an active lease, its own `plugin.<pluginId>.` event namespace and the current run ID. `artifact(id)` returns only a visible reference, or `undefined`; it also checks the lease.

This source-only stage fragment has no external effect. It returns the passed variant with the required empty artifact list:

```ts
import type { PluginInvocationContext, StageResult } from '@kubeclaw/plugin-sdk';

export async function execute(context: PluginInvocationContext): Promise<StageResult> {
  return { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts: [] };
}
```

The fragment alone does not register or activate the stage. A manifest, matching schemas and the runtime's supported execution route are still required. For other outcomes, use the [StageResult entry](sdk-exports.md#stageresult): failure/continuation variants have different required fields.

### Adapter lifecycle and cleanup

`AdapterFactory` can return an instance directly or through a Promise. Core starts required adapter dependencies first, calls the factory, then calls `ready()`. A dependency cycle, missing provider, factory rejection or readiness failure stops startup. Core rolls back started instances and aborts their lifecycle controllers. It bounds activation and readiness with the configured shutdown timeout.

Implement `ready`, `invoke` and `shutdown`. `receipt` is optional and can return `undefined` when the adapter cannot find an earlier external result. Do not turn an uncertain external outcome into a new effect merely because a caller rejected or lost its response.

In `AdapterInvocation`, `confidential: true` excludes `lock` and `fence`. The other variant requires both and permits absent or false `confidential`. Confidential invocation is a separate core path; it is not permission for an adapter to ignore its grants or cancellation.

`AdapterActivationContext.invoke` and `invokeConfidential` use dependency grants. `AdapterDependencyOptions.signal` joins the lifecycle and parent signals. A supplied `deliveryId` must be a nonblank string of at most 512 UTF-16 code units and requires a parent invocation. It is not an observer-delivery ID.

Optional `withCleanup` gives the current adapter invocation one bounded cleanup phase. It does not extend capability grants. Core rejects cleanup without a current parent owned by that adapter. Cleanup receives its own signal; lifecycle revocation still applies. Await cleanup and honor its signal. There is no SDK-wide promise that cleanup rolls back every external effect.

| Source field | Evidence |
| --- | --- |
| Claim | Runtime methods enforce lease/grant/namespace boundaries; adapter startup and dependency calls retain lifecycle, cancellation and cleanup ownership. |
| Implementation | [Plugin context methods](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/nova/core/execution/context.ts#L34-L80), [adapter dependency calls](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/nova/core/execution/adapter-startup.ts#L57-L98), [cleanup ownership](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/nova/core/execution/adapter-startup.ts#L127-L142), [adapter runtime result handling](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/nova/core/execution/adapters.ts#L47-L63) |
| Contract or setting | [SDK runtime methods and variants](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L22-L117), [effect identity comparison](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/nova/core/effects/identity.ts#L20-L48) |
| Test evidence | Source-only for this invocation sequence. No provider or external capability was called for this page. |
| Revision | `586f1f558a673c4df51c0afb9ea535c814b933b1` |
| Limit | These interfaces and source checks do not prove live timeout, rollback or exactly-once external execution. |

## TypeScript shapes and schema checks

The generated contracts come from the owning plugin-system v2 JSON Schema. The product generator compiles a wrapper called `PluginSystemV2` and appends the two frozen current profile constants. Its exported auxiliary `PluginManifest1` expresses the nonempty-registration alternatives; it is not a complete manifest by itself.

TypeScript cannot express every runtime constraint. A string alias such as `NamespacedId` does not check a pattern or maximum length. A number member does not enforce integer or minimum rules. Some generated open shapes use `any`; strict JSON serializers can reject values that those types accept. `EffectReceipt` needs conditional status rules, and `StageResult` needs outcome-specific fields. Read the schema rows and consumer explanation together.

The [inventory](sdk-exports.md) preserves recursive rules, including required arrays, enums/constants, patterns, bounds, references and conditional branches. Parent `required` arrays determine presence. Follow `$ref` to its target. An absent `default` means that the schema declares no default; it does not establish a fallback in a separate consumer.

Registry `parsePluginManifest` parses JSON and applies the manifest validator. `validateContractValue` validates a named canonical definition; its profile cases first apply strict profile parsing. Referenced schemas have separate `validate` and `resolve` paths: `validate` does not apply defaults, while `resolve` clones the input and uses its schema defaults. This is foundation behavior, not a validator automatically attached to each SDK type.

JSON Schema `minLength`/`maxLength` measure Unicode code points. Runtime string `.length` and `.slice` measure UTF-16 code units. For example, 512 emoji meet the `EffectDeliveryId` schema maximum of 512 code points but occupy 1024 code units and fail the adapter dependency runtime maximum. Result-file paths have a separate UTF-8 byte limit. Do not substitute one measurement for another.

Schema acceptance also does not prove a resource exists, a path is contained, a graph is acyclic or a producer is authorized. The component that owns that boundary must perform its additional checks.

| Source field | Evidence |
| --- | --- |
| Claim | Types are generated from schema; runtime validation and default resolution are separate operations. |
| Implementation | [Type generation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/scripts/generate-plugin-sdk-types.mjs#L1-L33), [manifest validation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/foundation/registry/schema.ts#L66-L86), [referenced schema resolution](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/foundation/registry/schema.ts#L90-L117), [canonical validation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/foundation/registry/schema.ts#L133-L148) |
| Contract or setting | [Plugin-system schema definitions](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L5-L1178) and the narrow definition/field rows in the [inventory](sdk-exports.md) |
| Test evidence | Source-only for schema validation; no validator success is inferred from a TypeScript signature. |
| Revision | `586f1f558a673c4df51c0afb9ea535c814b933b1` |
| Limit | A valid shape is not proof of authorization, filesystem containment or successful activation. |

## JSON and digest rules

A **canonical JSON codec** gives one serialized text for the same accepted data under its ordering rules. The SDK has two codecs because existing stored identities must keep their original bytes.

`canonicalJson` is the legacy codec. It sorts object keys with JavaScript `localeCompare`; collation can differ between locales. Preserve this codec where an untagged historical identity uses it. `portableJson` sorts keys by UTF-16 code units with `<` and `>` comparisons. Its ordering is independent of locale. It is not a claim of compliance with an unrelated JSON canonicalization standard.

Both codecs accept:

- `null`, strings and booleans;
- finite numbers, with negative zero serialized as `0`;
- plain records with `Object.prototype` or null prototype;
- dense arrays with the standard `Array.prototype`;
- enumerable own data properties whose values remain inside this same domain.

They reject unsupported values instead of silently dropping or converting them. They do not call accessors, `toJSON` or proxy traps. Repeated references to the same object are permitted when they do not form a cycle. Object keys are sorted; array order stays unchanged. No Unicode normalization is performed.

| Rejection | Error |
| --- | --- |
| NaN, Infinity or negative Infinity | `CANONICAL_JSON_NUMBER_INVALID` |
| undefined, function, symbol, BigInt or another unsupported scalar | `CANONICAL_JSON_VALUE_UNSUPPORTED` |
| Proxy | `CANONICAL_JSON_PROXY_UNSUPPORTED` |
| A cycle on the current traversal path | `CANONICAL_JSON_CYCLE` |
| A nonplain object or nonstandard array prototype | `CANONICAL_JSON_PROTOTYPE_INVALID` |
| Symbol keys, hidden properties, accessors or missing/nonenumerable array entries | `CANONICAL_JSON_PROPERTY_INVALID` |
| Array keys/count inconsistent with a dense standard array, including extra entries | `CANONICAL_JSON_ARRAY_INVALID` |

The exact first error depends on the first failed check. A sparse array can fail the key-count check or the data-property check. Do not require one error for every malformed array.

### A safe local example

This complete example uses only pure SDK values. Use Node.js 24 and the existing workspace dependencies. Follow [Prepare a clean checkout](../extend/developer-handbook.md#prepare-a-clean-checkout) for the repository preparation route. Run this example from the prepared repository root. This pure-value exercise does not prove a fresh lockfile install or completion of the full developer bootstrap. Save it as `sdk-json-example.ts` inside that workspace so the private package can resolve. Run `node sdk-json-example.ts`, then remove only that example file when finished. It makes no capability call and writes no product state.

```ts
import assert from 'node:assert/strict';
import { canonicalJson, portableJson, sha256Text } from '@kubeclaw/plugin-sdk';

const value = { Z: 1, a: [null, true], 'é': 2 };
const portable = portableJson(value);
assert.equal(portable, '{"Z":1,"a":[null,true],"é":2}');
assert.equal(sha256Text(portable), sha256Text('{"Z":1,"a":[null,true],"é":2}'));
assert.throws(() => portableJson({ omitted: undefined }), /CANONICAL_JSON_VALUE_UNSUPPORTED/);
// The legacy ordering depends on the current locale. Do not relabel these bytes.
const legacy = canonicalJson(value);
console.log({ portable, legacy });
```

The expected portable string and rejection above are source-checked. This displayed example passed twice on Node.js 24.21.0 in an isolated local checkout with copied existing dependencies. Those runs do not prove a fresh locked installation or the full developer bootstrap. The existing SDK JSON regression below was also executed locally. The printed legacy string is deliberately not assigned a universal cross-locale expectation.

`sha256Text` hashes text as UTF-8. `sha256Bytes` hashes the exact `Uint8Array`. Both return `sha256:` followed by 64 lowercase hex digits. Neither helper selects a JSON codec, inserts a version marker or validates producer authority. Choose the bytes first. JavaScript string length is not UTF-8 byte size.

The legacy codec's source comment records the reason for retaining it: those bytes already identify durable artifacts and effect payloads. A portable ordering requires a separately versioned change. The cost is that historical identity verification can depend on the original locale-sensitive serialization. Do not claim that attaching a new tag repairs old evidence.

| Source field | Evidence |
| --- | --- |
| Claim | Both codecs enforce a strict JSON domain; only object-key ordering differs. Hashes apply to exact UTF-8 text or supplied bytes. |
| Implementation | [Codecs and rejection checks](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/values.ts#L34-L97), [hash helpers](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/values.ts#L99-L105) |
| Contract or setting | [Portable encoding token and key order](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/values.ts#L49-L54) |
| Test evidence | [SDK JSON regression](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/tests/values.test.ts#L1-L30): locally passed with `node skills/common/plugin-runtime/sdk/tests/values.test.ts`. |
| Revision | `586f1f558a673c4df51c0afb9ea535c814b933b1` |
| Limit | The bounded check covers JSON domain and expected bytes, not live artifact storage, all host locales or producer authorization. |

## Version and absence rules

A missing tag means the owner retains historical behavior. It does not mean “select the newest encoding.” Present `undefined` is not always equivalent to omission. For strict JSON serialization, `undefined` is invalid even before a profile parser compares its value.

| Contract | Explicit current selection | Absence and rejection |
| --- | --- | --- |
| Portable artifact/reference encoding | `encoding: 'kubeclaw-json.utf16.v1'` | An untagged artifact preserves original historical bytes. A different explicit encoding fails; never recanonicalize it and keep its old digest. |
| Review/source identity | `identityEncoding: 'kubeclaw-json.utf16.v1'` | For dense plain-JSON records, omission uses legacy `canonicalJson`; an own different value, including undefined, fails. Ordinary property lookup can select an inherited portable tag; an inherited unknown tag is not rejected and selects legacy. See the local-parser limits below. |
| Runtime dispatch profile | `{schemaVersion:'runtime-dispatch-profile.v1', encoding:'json-utf16-v1'}` | Historical absence preserves the legacy producer. Exact finite profile only; no inferred fallback. |
| Review cache profile | `{schemaVersion:'review-cache-profile.v1', recordVersion:'review-content-cache.v2', encoding:'json-utf16-v1'}` | Historical absence preserves review-content-cache.v1 and its original effect operations. Other transport/artifact versions imply nothing. |
| Run snapshots | v3 requires runtime profile; v4 requires runtime and cache profiles | Read the selected snapshot schema. An absent cache member in the v3 shape does not select the current cache producer. |

The artifact/identity token `kubeclaw-json.utf16.v1` and profile encoding value `json-utf16-v1` are different exact strings. Use the exported constants and current profile values at their own boundaries.

`parseRuntimeDispatchProfile` and `parseReviewCacheProfile` compare the complete portable serialization to their generated constants. Extra fields, missing fields or unknown versions fail. Strict JSON rejection can occur before the profile-specific error.

`withRuntimeDispatchProfile(request, undefined)` returns the original request without validating it. With a profile, it validates the profile and strict JSON request, rejects an already-owned top-level profile key, and returns a shallow frozen copy. It does not deep-freeze payload or check dispatch operation/resource.

`runtimeDispatchProfileFields` first validates strict JSON. Missing own profile key returns `{}`. If a profile is present and a supplied capability is not `runtime.dispatch`, it rejects. With the capability argument omitted, that capability check does not run. Core also validates the tagged invocation schema: operation must be `dispatch` and resource type must be `runtime.agent`. A nested payload key with the same name is ordinary data.

`reviewCacheProfileFromContext` validates strict JSON of the whole context before checking the own profile key. Missing key returns `undefined`. Present undefined, null or malformed data does not select historical absence.

| Source field | Evidence |
| --- | --- |
| Claim | Profiles are independent, explicit finite contracts; helper omission paths differ from present malformed values. |
| Implementation | [Runtime profile helpers](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime-dispatch-profile.ts#L1-L30), [cache profile helpers](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-cache-profile.ts#L1-L17), [review identity selection](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L22-L26) |
| Contract or setting | [Finite profiles and tagged invocation condition](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L6-L27), [run snapshot shapes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L47-L67) |
| Test evidence | [Original snapshot/identity cases](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/tests/verification/reliability/source-snapshot-version.test.mjs#L20-L61) were inspected, not executed for this page. |
| Revision | `586f1f558a673c4df51c0afb9ea535c814b933b1` |
| Limit | A parser checks finite data; it does not establish a live producer, cache hit or transport completion. |

## Artifact-byte verification

`verifiedArtifactJsonText(response, expected)` verifies the producer's original text. Use a `get_json_bytes` response, not a response that contains only a parsed value. A parsed object alone cannot preserve the original byte order or whitespace.

The helper checks these boundaries in order:

1. Require `artifact-json-bytes.v1`, a string `jsonBytes`, its UTF-8 byte size and its SHA-256 digest to agree with the response.
2. Parse the original bytes. Compare portable serialization of the parsed value with `response.value`.
3. Compare the complete returned artifact reference with `expected`, including namespace, ID, media type, producer, digest, size and optional encoding. Also bind reference digest/size to response digest/size.
4. If encoding is defined, require the portable tag and require the original bytes to equal portable serialization. If encoding is absent, retain the verified original historical text without recanonicalizing it.
5. Return the original `jsonBytes` string.

A self-consistent different producer reference is not equal to the expected reference even when both producers wrote identical bytes. This helper checks reference equality, not a general trust policy. It neither calls a capability nor validates the application's value schema. Invalid JSON parsing and strict JSON-domain errors also propagate.

`readBoundArtifact` adds the current run, `application/json` and a maximum size of 4,194,304 bytes before requesting `artifacts.read/get_json_bytes`. It verifies binding and returns the parsed value by a TypeScript cast. It does not guarantee that the value is a record at runtime. The source approval helpers then impose their own artifact namespace, ID, stage, attempt and subject rules.

This source-only call requires a real runtime context with the `artifacts.read` grant and an expected visible reference:

```ts
const value = await readBoundArtifact(expectedRef, context);
```

Do not substitute a model-generated reference or an arbitrary same-digest artifact. If binding fails, stop and inspect the expected reference and stored original bytes. Do not “repair” the digest by reserializing the parsed object. The artifact-store adapter selects exact references and preserves the historical codec on untagged writes; explicitly tagged writes use portable JSON.

| Source field | Evidence |
| --- | --- |
| Claim | Verification binds original bytes, parsed value and full expected reference without recanonicalizing untagged artifacts. |
| Implementation | [Byte verifier](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/artifact-json.ts#L1-L20), [bound artifact reader](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/source-approval.ts#L9-L19), [store byte read and codec selection](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugins/artifact-store/src/adapter.ts#L78-L114) |
| Contract or setting | [Artifact reference fields](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L564-L577) |
| Test evidence | [Exact reference and cross-locale artifact cases](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/tests/verification/reliability/sdk-json-portable.test.mts#L33-L79) were inspected, not executed for this page. |
| Revision | `586f1f558a673c4df51c0afb9ea535c814b933b1` |
| Limit | Pure byte checks are not proof of producer authorization, value-schema acceptance or live storage durability. |

## Source selection and approval

### Select an implementation revision

`resolveSourceRevision` requires exactly one defined selector: `revision` or `sourceStageId`. An explicit revision must be 40 or 64 lowercase hexadecimal characters. It causes no artifact read. The stage selector filters visible artifacts to the current run, selected stage, implementation namespace and `implementation:` ID prefix; it chooses the latest attempt and requires exactly one artifact at that attempt.

The helper reads exact bound bytes and requires `status: 'ready_for_testing'` with a valid `sourceRevision`. It does not fall back to ambient Git HEAD when a result is absent or ambiguous.

`resolveImplementationRevisions(stageId, context)` also selects the earliest attempt. Its `headBefore` becomes `base`; the latest committed candidate becomes `head`. With one artifact, the helper reads it once. Both values must match the revision grammar. This preserves the first implementation baseline across repairs.

### Capture and verify a review subject

`parseReviewSource` selects project, absolute repository root, architecture reference and unique safe relative paths. It sorts a copied path list. For dense plain-JSON input, text excludes NUL/CR/LF and has a 4096-UTF-16-code-unit maximum, and paths exclude absolute paths, backslashes and empty/dot/parent segments. There must be 1–128 paths. The parser returns only its declared source fields; it does not read Git.

A dense array has a value at every index. Here, plain-JSON input means data records without inherited contract fields, custom prototypes, getters or proxies. The local parser is not strict validation of arbitrary unknown objects. Required values can be inherited. Only an own `identityEncoding` is guarded; a truthy inherited tag is copied into an own output field, even when unknown. `Array.some` skips holes, so a one-hole paths array passes and becomes `[undefined]`. Require dense plain-JSON input before relying on the safe-path description. Getters and proxy traps can execute during local property reads. This is why the input precondition matters.

`captureReviewSubject` calls `git.repository.read` to freeze clean HEAD and the architecture reference. It reads the selected regular files at the architecture revision, verifies their returned path/mode/content digest/UTF-8 size, and binds current run plus input digest. It then verifies repository freshness again. The file content is architecture-revision content, not an implied copy of current HEAD.

`parseReviewSubject` verifies run/revision/digest fields and ordered file content. It checks the unsigned subject digest with the selected identity codec and returns the original subject. It does not contact Git. `verifyReviewSubject` adds clean-HEAD and architecture-reference checks. Optional `expectedSourceRevision` changes only the expected current source HEAD, not the architecture revision.

These helpers read repository data through a granted capability; they do not commit, modify source or approve a design. Capability errors propagate. A stale subject requires a newly selected/captured subject at the intended revisions, not a rewritten digest on old content.

### Require preflight and bound approval

A **source binding** names the selected preflight stage and input digest, with optional selected review stage and explicit identity codec. It is selection data, not an approval token. `parseSourceBinding` checks enumerable own string keys, not hidden/symbol keys or inherited properties, and returns the original reference. Its required fields can be inherited. Only an own encoding is guarded; an inherited unknown encoding can pass. A present `reviewStageId: undefined` also passes this parser, although it is outside strict JSON. Use trusted dense plain-JSON input and the owning contract; this helper is not a general unknown-input validator.

`sourcePreflight` selects the latest unique `source-preflight` artifact from the binding's stage and current run. It requires `source-preflight.v1` and `outcome: 'passed'`, parses the subject, and checks identity codec, input digest and returned contract digest. It returns the binding, subject and contract. Missing, failed or mismatched preflight is a rejection; an unrelated ancestor is not a fallback.

`approvedSource(context, expected)` uses that preflight. If its binding names a review stage, the matching report must pass and refer to the same subject. A report with findings needs a human approval that names the exact report digest/stage and same subject. With no expected binding, the helper searches the visible current-run architecture report/approval artifacts. If neither exists it returns `undefined`; an approval without a report fails. Multiple producer stages or tied latest attempts are ambiguous.

The helper then follows a bound blueprint synchronization result and implementation results for the same subject. A synchronization result for a different subject does not advance the revision. Matching synchronization must bind the old revision, repository and architecture. Implementation lineage must have one next edge per revision and no cycle. This function does not itself prove the current worktree equals the returned revision; use the caller's separate repository verification where its task requires it.

| Source field | Evidence |
| --- | --- |
| Claim | Source selection uses exact current-run artifacts; subject capture binds architecture file bytes; preflight and approval preserve explicit selection and subject lineage. |
| Implementation | [Revision selection](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/source-revision.ts#L6-L49), [source/subject parsing](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L28-L49), [capture/freshness](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L51-L84), [preflight](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/source-preflight.ts#L13-L39), [approval and lineage](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/source-approval.ts#L29-L96) |
| Contract or setting | `ReviewSource`, `ReviewSubject` and `SourceBinding` entries in the [inventory](sdk-exports.md) define the local source helper contract, separate from plugin-system generated types. |
| Test evidence | Source-only for approval/preflight/capture; artifact/identity regression sources were inspected, not run as a live approval workflow. |
| Revision | `586f1f558a673c4df51c0afb9ea535c814b933b1` |
| Limit | Correct artifact selection does not establish a universal trust decision, a commit operation or current repository freshness beyond checks the specific helper performs. |

## Workspace and agent-task helpers

`RuntimeWorkspaceReference` is the Git adapter's workspace record. `parseRuntimeWorkspace` requires its seven declared enumerable string keys, version, path/branch text bounds of 4096 UTF-16 code units, revision and exact canonical owner equality. It returns the original object. It does not normalize paths or verify repository containment, branch existence or the protected owner file. Those are adjacent runtime checks.

`runtimeWorkspaceGeneration(owner, scope)` hashes legacy canonical JSON of owner, repository root and branch, then returns only the 64 hex digits. `runtimeWorkspaceOwnerFile(workspacePath)` hashes that exact text into a relative owner-file name. Neither creates a workspace or reads/writes its owner record. Different textual paths can hash differently even when a filesystem resolves them to the same place. The hash applies to supplied UTF-8 bytes, without normalization: distinct lone-surrogate strings can encode to the same replacement bytes and therefore have the same owner-file name. It is not a universal text-uniqueness guarantee.

`buildRuntimeAgentTask(payload, resultFile)` builds instruction text and serializes the payload once. It limits the result-file path to 2048 UTF-8 bytes and instructs atomic temporary-file/rename output. It does not write a file, validate path containment or validate the agent's response. The instructions state that runtime/core owns invocation identity and session evidence; the agent returns only declared result fields. The helper uses native `JSON.stringify`, not strict `portableJson`: undefined/function/symbol object fields are omitted, corresponding array entries become null, and nonfinite numbers become null. Enumerable getters and `toJSON` can execute during serialization and can transform the output or throw. Cycles and BigInt can throw. Use trusted, already-JSON data when these executable object effects are not intended. The instruction text does not freeze the original payload. JSON serialization errors propagate.

Source: [workspace helpers](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime-workspace.ts#L4-L32), [agent-task text and path check](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime-agent-task.ts#L1-L25). These statements are source-only and do not prove protected workspace admission or agent execution.

## Convenience values are not validators

| Helper | Selection and absence | Consequence |
| --- | --- | --- |
| `selectDefinedValue` | First reader result other than null/undefined; otherwise last result; no readers returns undefined | false, zero and empty text are accepted. Later readers do not execute after selection. |
| `selectTruthyValue` | First truthy reader result; otherwise last result; no readers returns undefined | false, zero, empty text, NaN, null and undefined are skipped. |
| `selectPresentValue` | First nonempty string, otherwise empty text | Whitespace-only text is accepted; no trim occurs. |
| `arrayValue` | Input array by reference, otherwise a new empty array when native classification succeeds | No element validation; the generic type is a cast. Revoked proxies throw TypeError during `Array.isArray`. |
| `objectRecord` | Truthy non-array object by reference, otherwise a new empty object | Class instances/live proxies/accessors can pass; revoked proxies throw during native classification. Not strict JSON validation. |
| `textValue` | String unchanged, otherwise empty text | No conversion, trimming or parsing. |

Reader exceptions propagate from both reader-based selectors. `OptionalAbsenceReader<T>` is synchronous; it does not wait for an asynchronous absence check. `ValueRecord` is permissive and uses `any`; do not substitute it for a stronger owning contract.

`redactStructuredValue` replaces sensitive-key values with `[redacted]`, limits arrays/object entries to 1000, retains a 65,536-UTF-16-code-unit text prefix and appends `[truncated]` (65,547 output units) and returns `[truncated]` beyond depth 16. The sensitive-key match includes authorization, cookie, password, secret, token, API-key and credential forms. This is a bounded presentation helper, not comprehensive secret detection. Object enumeration can execute getters or proxy traps. Do not pass hostile executable objects or assume a nonmatching value is safe to publish.

Source: [selectors and casts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/values.ts#L4-L32), [bounded redaction](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/values.ts#L107-L128). The exhaustive [inventory](sdk-exports.md) gives each helper's exact signature and source-only example.

## Test providers and report adapters

Test provider factories receive `ProviderInvocationV1` and return `TestProviderInstance`. `execute` receives the invocation plus `TestProviderExecutionContext` and resolves to `ProviderResultV1`; optional `cleanup` resolves to void. The context gives the cancellation signal, workspace root, output logging and granted capability invocation. Its request shape does not carry a runtime dispatch profile. Logging output is not the provider result. Read the [callback contract rules](sdk-exports.md#callback-contract-rules) for its nested fields and required/optional schema rules. Buster applies separate result admission checks: counts must sum to total, passed cannot contain failed tests, evidence IDs and paths must be unique, and evidence types/report formats must match registration. A report must refer to declared test-report evidence; artifact outputs must refer to declared evidence IDs. The configured serialized result budget measures UTF-8 bytes. `providerDetails` uses the extra common E2E schema and exact schema digest only for `kubeclaw.playwright@1` or a details object naming `kubeclaw.e2e-result.v1`; its case IDs and status totals must agree. The generated callback section gives the complete selected E2E fields and validators. These checks run in Buster, not in a TypeScript type.

The capability broker joins provider/call cancellation, limits pending requests and rejects duplicate request IDs. The SDK's context type does not grant arbitrary host access or prove that a declared `retrySafe` provider can repeat every external action. Register explicit evidence defaults and honor cleanup/cancellation in the actual provider.

A report adapter is a parser, not a capability adapter. `ReportAdapterInput` contains bytes, media type and case/finding limits; no invoke context is included. `ReportAdapterOutput` requires counts, duration, cases, findings and truncation/omitted-count fields from the test-gate contract. Buster adds adapter provenance and the source artifact; the callback must not manufacture those owner fields.

The [callback contract rules](sdk-exports.md#callback-contract-rules) contain the recursively resolved provider invocation, provider result and report result schemas, including nested input/output/evidence/finding/case fields. Read required arrays, union variants, bounds and referenced definitions together. These owning rules do not become SDK named exports.

After Buster adds provenance, report validation also requires outcome counts to sum to total and case IDs to be unique. For complete lists, omittedCaseCount must be zero and the list length and each outcome count must match the report totals. For truncated lists, omittedCaseCount must be positive, listed plus omitted must equal total, and listed outcomes cannot exceed exact totals. At report and case level, findingsTruncated must be true exactly when omittedFindingCount is positive. These are semantic validator rules, not TypeScript checks. Source: [report semantic validation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/validation.ts#L100-L145).

Buster verifies report media type, bytes, digest, package snapshot and result contract. It rejects output arrays above the selected count limits. `ReportAdapterLimits` has no SDK defaults and contains no process, memory or timeout fields; those belong to the wider report runtime configuration.

Source: [provider/report callback types](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L119-L184), [provider capability broker](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/buster/engine/test-gates/provider-capabilities.ts#L3-L44), [report input wrapper](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/buster/engine/test-gates/report-adapter-child.mjs#L21-L40), [result binding and limits](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/buster/engine/test-gates/report-adapter-runtime.ts#L269-L320), [required report fields](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L342-L375). These are source-only statements; no provider or report child was started for this page.

## Testing entrypoint

`assertNever(value: never): never` is the only export from `@kubeclaw/plugin-sdk/testing`. Use it in the default branch of an exhaustive discriminated-union switch. It always throws `Unexpected contract variant: <JSON>`. It does not validate an unknown runtime value. If typing is bypassed, `JSON.stringify` can itself fail on cycles or BigInt before the intended error.

```ts
import { assertNever } from '@kubeclaw/plugin-sdk/testing';
type Choice = {kind:'yes'} | {kind:'no'};
function selected(choice: Choice): boolean {
  switch (choice.kind) {
    case 'yes': return true;
    case 'no': return false;
    default: return assertNever(choice);
  }
}
```

This is a source-only example, not a testing framework or live plugin harness. Source: [assertNever](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/testing/index.ts#L1-L3).

## Error handling and retry boundary

| Error family | Meaning and next check |
| --- | --- |
| `CANONICAL_JSON_*` | Input is outside the strict JSON domain. Remove unsupported values only according to the owning contract; never silently drop evidence fields. |
| `RUNTIME_DISPATCH_PROFILE_INVALID`, `RUNTIME_DISPATCH_PROFILE_ALREADY_BOUND`, `RUNTIME_DISPATCH_PROFILE_CAPABILITY_INVALID` | Wrong finite profile, duplicate top-level binding or profile on another capability. Check explicit run selection and request metadata. |
| `REVIEW_CACHE_PROFILE_INVALID` | Present cache profile is not the exact current finite contract. Do not fall back to historical absence. |
| `ARTIFACT_JSON_BYTES_UNBOUND`, `ARTIFACT_JSON_VALUE_UNBOUND`, `ARTIFACT_JSON_REFERENCE_UNBOUND`, `ARTIFACT_JSON_ENCODING_INVALID` | Original bytes, parsed value, full expected reference or explicit encoding disagrees. Stop; inspect producer/reference/original bytes. |
| `SOURCE_IMPLEMENTATION_ARTIFACT_MISSING_OR_AMBIGUOUS`, `SOURCE_IMPLEMENTATION_ARTIFACT_CORRUPT`, `SOURCE_IMPLEMENTATION_REVISION_INVALID`, `SOURCE_IMPLEMENTATION_BASE_INVALID` | Selected implementation result is absent, tied, corrupt or has invalid head/base data. Inspect same-run selected-stage artifacts, not ambient HEAD. |
| `SOURCE_REVISION_SELECTION_INVALID`, `SOURCE_REVISION_INVALID` | Exactly-one selector or explicit revision grammar failed. Fix selection input before retry. |
| `REVIEW_IDENTITY_ENCODING_INVALID`, `REVIEW_SOURCE_INVALID`, `REVIEW_SUBJECT_INVALID`, `REVIEW_SUBJECT_FILE_INVALID`, `REVIEW_SUBJECT_DIGEST_INVALID` | Source/subject identity or file evidence failed. Check codec selection, ordered paths and exact file bytes. |
| `REVIEW_REPOSITORY_IDENTITY_INVALID`, `REVIEW_SOURCE_BYTES_INVALID`, `REVIEW_SUBJECT_STALE` | Git capability response or current revisions disagree. Recheck selected repository and references; capture a new subject when intended source changes. |
| `SOURCE_PREFLIGHT_BINDING_INVALID`, `SOURCE_PREFLIGHT_REQUIRED`, `SOURCE_PREFLIGHT_FAILED`, `SOURCE_PREFLIGHT_INPUT_MISMATCH` | Selected immutable preflight is not available, passed or bound to this input. Do not select an unrelated result. |
| `SOURCE_APPROVAL_ARTIFACT_INVALID`, `SOURCE_APPROVAL_ARTIFACT_CORRUPT`, `SOURCE_APPROVAL_AMBIGUOUS`, `SOURCE_APPROVAL_REQUIRED`, `SOURCE_APPROVAL_BINDING_INVALID` | Artifact admission/bytes, unique selection or exact report/approval binding failed. Preserve selected evidence and inspect the specific relationship. |
| `SOURCE_APPROVAL_SYNC_BINDING_INVALID`, `SOURCE_APPROVAL_IMPLEMENTATION_INVALID`, `SOURCE_APPROVAL_LINEAGE_AMBIGUOUS` | Source advancement is invalid, forked or cyclic. Resolve the actual lineage; do not choose an arbitrary edge. |
| `RUNTIME_WORKSPACE_REFERENCE_INVALID`, `RUNTIME_WORKSPACE_OWNER_MISMATCH` | Workspace shape/text/revision or attempt owner disagrees. This is not a signal to overwrite the protected owner record. |
| `RUNTIME_RESULT_FILE_PATH_TOO_LONG` | UTF-8 result path exceeds 2048 bytes. Select a shorter supported path; the helper has not written a file. |

Errors from reader callbacks, JSON parsing/stringifying, Node crypto or capability implementations can also propagate. Do not expect every rejection to have an SDK-prefixed code. Async helpers can reject after a read capability has run; a Promise rejection does not establish that every downstream operation had no effect.

Pure serialization and local parsing have no intended external mutation. Capability-backed reads can involve the runtime's own effect/journal path. The adapter invocation path can perform external effects. Before retrying an uncertain external outcome, inspect its original idempotency identity and receipt; a fresh key is a new effect, not recovery of the old one. Use the owning component's recovery procedure rather than a universal SDK retry loop.

## Maintain this reference

The canonical explanation is this page. The export/field inventory is generated; do not edit it by hand. Documentation tooling uses the actual package export map and TypeScript compiler, then joins separately authored consumer explanations with source dependencies. A new, removed or renamed export, a missing explanation or changed bound semantic source must fail the check. Hash equality is a drift guard, not proof of explanation quality.

When an API changes, review its caller, provider, validator, schema and tests. Update its consumer meaning, optional/absence behavior, errors, side effects and version limits together. Do not refresh a source digest without reading the affected behavior. The SDK's own type generator remains responsible for product contract declarations; the documentation inventory does not replace it or execute product modules.

Run the read-only reference check from the repository root:

```bash
npm run docs:sdk:check
```

Exit zero means that the inventory and export page match the current discovered surface and bound consumer explanations. A source or output drift error stops the check. Review the named source and its consumer behavior before updating the explanation or regenerating; do not edit the generated page to conceal drift. This check does not activate plugins or prove live capability behavior.
