# SDK export and contract inventory

Status: generated current SDK reference
Audience: plugin author, runtime maintainer
Owner: documentation automation
Evidence: contracts/pipeline-test-gate/v1/schemas/e2e-result.v1.schema.json; skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts; skills/nova/core/execution/graph.ts; skills/nova/core/execution/graph-build.ts; skills/nova/core/effects/dependency-identity.ts; skills/nova/core/execution/adapter-invocation-phase.ts; skills/nova/core/execution/adapter-support.ts; skills/nova/core/effects/coordinator.ts; skills/nova/core/effects/contracts.ts; skills/nova/core/effects/journal.ts; skills/nova/core/effects/durable-invocation.ts; skills/nova/core/effects/dependency-journal.ts; skills/nova/core/effects/resource-acquisition.ts; skills/nova/core/effects/memory-locks.ts; skills/nova/core/execution/lease.ts; skills/nova/core/execution/authorization.ts; skills/nova/core/execution/engine-snapshots.ts; skills/common/plugins/runtime-dispatch/src/workspace-target.ts; skills/common/plugins/git-workspace/src/workspace-ownership.ts; skills/common/plugins/runtime-dispatch/src/openclaw.ts; skills/nova/plugins/review/src/repository-audit-cache.ts; skills/nova/plugins/review/src/review-content-cache.ts; skills/buster/engine/test-gates/provider-child.mjs; skills/buster/engine/test-gates/provider-loader.ts; skills/buster/engine/test-gates/runner.ts; contracts/pipeline-test-gate/v1/src/validation.ts; contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json; contracts/pipeline-test-gate/v1/src/types.ts; scripts/generate-plugin-sdk-types.mjs; skills/buster/engine/test-gates/provider-capabilities.ts; skills/buster/engine/test-gates/report-adapter-child.mjs; skills/buster/engine/test-gates/report-adapter-runtime.ts; skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json; skills/common/plugin-runtime/foundation/registry/schema.ts; skills/common/plugin-runtime/sdk/package.json; skills/common/plugin-runtime/sdk/src/artifact-json.ts; skills/common/plugin-runtime/sdk/src/generated/contracts.ts; skills/common/plugin-runtime/sdk/src/index.ts; skills/common/plugin-runtime/sdk/src/review-cache-profile.ts; skills/common/plugin-runtime/sdk/src/review-subject.ts; skills/common/plugin-runtime/sdk/src/runtime-agent-task.ts; skills/common/plugin-runtime/sdk/src/runtime-dispatch-profile.ts; skills/common/plugin-runtime/sdk/src/runtime-workspace.ts; skills/common/plugin-runtime/sdk/src/runtime.ts; skills/common/plugin-runtime/sdk/src/source-approval.ts; skills/common/plugin-runtime/sdk/src/source-preflight.ts; skills/common/plugin-runtime/sdk/src/source-revision.ts; skills/common/plugin-runtime/sdk/src/testing/index.ts; skills/common/plugin-runtime/sdk/src/values.ts; skills/common/plugin-runtime/sdk/tests/values.test.ts; skills/common/plugin-runtime/sdk/tsconfig.build.json; skills/common/plugins/artifact-store/src/adapter.ts; skills/nova/core/effects/identity.ts; skills/nova/core/execution/adapter-startup.ts; skills/nova/core/execution/adapters.ts; skills/nova/core/execution/context.ts; tests/verification/reliability/sdk-json-portable.test.mts; tests/verification/reliability/source-snapshot-version.test.mjs
Applies to: current private workspace SDK entrypoints and plugin-system v2 schema
Last verified: generated from source revision 586f1f558a673c4df51c0afb9ea535c814b933b1
Generator: scripts/docs-sdk-reference.mjs

<!-- BEGIN GENERATED: source-backed reference -->

Mechanical signatures and field rules come from the TypeScript compiler and the owning JSON Schema. Consumer explanations are authored separately. A TypeScript declaration does not execute validation. Use the [SDK reference](sdk.md) for the request path, compatibility rules, JSON domain and error handling.

Every example below is a source-only fragment. It is not a claim of activation, external effects, live deployment or successful end-to-end execution. Supply the variables shown in each fragment from the owning runtime or contract.

Source revision: `586f1f558a673c4df51c0afb9ea535c814b933b1`. Package: `@kubeclaw/plugin-sdk` (private workspace package).

## Entrypoints

| Import | Source |
| --- | --- |
| `@kubeclaw/plugin-sdk` | [.](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/index.ts#L1-L33) |
| `@kubeclaw/plugin-sdk/testing` | [./testing](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/testing/index.ts#L1-L3) |

## Export index

Select an exact name below. Every named export from the discovered package entrypoints is included; support declarations remain in their separate section. Examples in each entry are source-only fragments.

| Export | Import | Kind |
| --- | --- | --- |
| [`AdapterActivationContext`](#adapteractivationcontext) | `@kubeclaw/plugin-sdk` | type |
| [`AdapterActivationId`](#adapteractivationid) | `@kubeclaw/plugin-sdk` | type |
| [`AdapterCleanupContext`](#adaptercleanupcontext) | `@kubeclaw/plugin-sdk` | type |
| [`AdapterDependencyOptions`](#adapterdependencyoptions) | `@kubeclaw/plugin-sdk` | type |
| [`AdapterFactory`](#adapterfactory) | `@kubeclaw/plugin-sdk` | type |
| [`AdapterInstance`](#adapterinstance) | `@kubeclaw/plugin-sdk` | type |
| [`AdapterInvocation`](#adapterinvocation) | `@kubeclaw/plugin-sdk` | type |
| [`AdapterLifecycle`](#adapterlifecycle) | `@kubeclaw/plugin-sdk` | type |
| [`AdapterRegistration`](#adapterregistration) | `@kubeclaw/plugin-sdk` | type |
| [`AdministrativeReopenDecision`](#administrativereopendecision) | `@kubeclaw/plugin-sdk` | type |
| [`ArtifactRef`](#artifactref) | `@kubeclaw/plugin-sdk` | type |
| [`AttemptIdentity`](#attemptidentity) | `@kubeclaw/plugin-sdk` | type |
| [`CURRENT_REVIEW_CACHE_PROFILE`](#current_review_cache_profile) | `@kubeclaw/plugin-sdk` | constant |
| [`CURRENT_RUNTIME_DISPATCH_PROFILE`](#current_runtime_dispatch_profile) | `@kubeclaw/plugin-sdk` | constant |
| [`CapabilityGrant`](#capabilitygrant) | `@kubeclaw/plugin-sdk` | type |
| [`CapabilityInvocation`](#capabilityinvocation) | `@kubeclaw/plugin-sdk` | type |
| [`DecisionFacts`](#decisionfacts) | `@kubeclaw/plugin-sdk` | type |
| [`EffectAttemptIdentity`](#effectattemptidentity) | `@kubeclaw/plugin-sdk` | type |
| [`EffectDeliveryId`](#effectdeliveryid) | `@kubeclaw/plugin-sdk` | type |
| [`EffectIdempotencyKey`](#effectidempotencykey) | `@kubeclaw/plugin-sdk` | type |
| [`EffectJournal`](#effectjournal) | `@kubeclaw/plugin-sdk` | type |
| [`EffectReceipt`](#effectreceipt) | `@kubeclaw/plugin-sdk` | type |
| [`EffectRequest`](#effectrequest) | `@kubeclaw/plugin-sdk` | type |
| [`EventIdentity`](#eventidentity) | `@kubeclaw/plugin-sdk` | type |
| [`InvocationLease`](#invocationlease) | `@kubeclaw/plugin-sdk` | type |
| [`JsonObject`](#jsonobject) | `@kubeclaw/plugin-sdk` | type |
| [`LifecycleEvent`](#lifecycleevent) | `@kubeclaw/plugin-sdk` | type |
| [`LocalId`](#localid) | `@kubeclaw/plugin-sdk` | type |
| [`NamespacedId`](#namespacedid) | `@kubeclaw/plugin-sdk` | type |
| [`ObserverCheckpoint`](#observercheckpoint) | `@kubeclaw/plugin-sdk` | type |
| [`ObserverDelivery`](#observerdelivery) | `@kubeclaw/plugin-sdk` | type |
| [`ObserverHandler`](#observerhandler) | `@kubeclaw/plugin-sdk` | type |
| [`ObserverRegistration`](#observerregistration) | `@kubeclaw/plugin-sdk` | type |
| [`OpaqueId`](#opaqueid) | `@kubeclaw/plugin-sdk` | type |
| [`OptionalAbsenceReader`](#optionalabsencereader) | `@kubeclaw/plugin-sdk` | type |
| [`PLUGIN_API_VERSION`](#plugin_api_version) | `@kubeclaw/plugin-sdk` | constant |
| [`PORTABLE_JSON_ENCODING`](#portable_json_encoding) | `@kubeclaw/plugin-sdk` | constant |
| [`PackageIdentity`](#packageidentity) | `@kubeclaw/plugin-sdk` | type |
| [`PackageProvenance`](#packageprovenance) | `@kubeclaw/plugin-sdk` | type |
| [`PackageResolution`](#packageresolution) | `@kubeclaw/plugin-sdk` | type |
| [`PipelineDefinition`](#pipelinedefinition) | `@kubeclaw/plugin-sdk` | type |
| [`PluginContext`](#plugincontext) | `@kubeclaw/plugin-sdk` | type |
| [`PluginDomainEvent`](#plugindomainevent) | `@kubeclaw/plugin-sdk` | type |
| [`PluginInvocationContext`](#plugininvocationcontext) | `@kubeclaw/plugin-sdk` | type |
| [`PluginManifest`](#pluginmanifest) | `@kubeclaw/plugin-sdk` | type |
| [`PluginManifest1`](#pluginmanifest1) | `@kubeclaw/plugin-sdk` | type |
| [`PluginStateEntry`](#pluginstateentry) | `@kubeclaw/plugin-sdk` | type |
| [`PluginSystemV2`](#pluginsystemv2) | `@kubeclaw/plugin-sdk` | type |
| [`RUNTIME_RESULT_FILE_MAX_BYTES`](#runtime_result_file_max_bytes) | `@kubeclaw/plugin-sdk` | constant |
| [`Reason`](#reason) | `@kubeclaw/plugin-sdk` | type |
| [`RegistrationProvenance`](#registrationprovenance) | `@kubeclaw/plugin-sdk` | type |
| [`RelativeModulePath`](#relativemodulepath) | `@kubeclaw/plugin-sdk` | type |
| [`RelativeSchemaPath`](#relativeschemapath) | `@kubeclaw/plugin-sdk` | type |
| [`ReportAdapterFunction`](#reportadapterfunction) | `@kubeclaw/plugin-sdk` | type |
| [`ReportAdapterInput`](#reportadapterinput) | `@kubeclaw/plugin-sdk` | type |
| [`ReportAdapterLimits`](#reportadapterlimits) | `@kubeclaw/plugin-sdk` | type |
| [`ReportAdapterOutput`](#reportadapteroutput) | `@kubeclaw/plugin-sdk` | type |
| [`ReportAdapterRegistration`](#reportadapterregistration) | `@kubeclaw/plugin-sdk` | type |
| [`ResourceIdentity`](#resourceidentity) | `@kubeclaw/plugin-sdk` | type |
| [`ResourceLock`](#resourcelock) | `@kubeclaw/plugin-sdk` | type |
| [`ResultBase`](#resultbase) | `@kubeclaw/plugin-sdk` | type |
| [`ResumeSignal`](#resumesignal) | `@kubeclaw/plugin-sdk` | type |
| [`ReviewCacheProfile`](#reviewcacheprofile) | `@kubeclaw/plugin-sdk` | type |
| [`ReviewSource`](#reviewsource) | `@kubeclaw/plugin-sdk` | type |
| [`ReviewSubject`](#reviewsubject) | `@kubeclaw/plugin-sdk` | type |
| [`RuntimeDispatchProfile`](#runtimedispatchprofile) | `@kubeclaw/plugin-sdk` | type |
| [`RuntimeRunEdge`](#runtimerunedge) | `@kubeclaw/plugin-sdk` | type |
| [`RuntimeRunGraph`](#runtimerungraph) | `@kubeclaw/plugin-sdk` | type |
| [`RuntimeRunSnapshot`](#runtimerunsnapshot) | `@kubeclaw/plugin-sdk` | type |
| [`RuntimeRunSnapshotV4`](#runtimerunsnapshotv4) | `@kubeclaw/plugin-sdk` | type |
| [`RuntimeWorkspaceReference`](#runtimeworkspacereference) | `@kubeclaw/plugin-sdk` | type |
| [`SourceBinding`](#sourcebinding) | `@kubeclaw/plugin-sdk` | type |
| [`StageAttempt`](#stageattempt) | `@kubeclaw/plugin-sdk` | type |
| [`StageDefinition`](#stagedefinition) | `@kubeclaw/plugin-sdk` | type |
| [`StageRegistration`](#stageregistration) | `@kubeclaw/plugin-sdk` | type |
| [`StageResult`](#stageresult) | `@kubeclaw/plugin-sdk` | type |
| [`TestContractId`](#testcontractid) | `@kubeclaw/plugin-sdk` | type |
| [`TestEvidencePolicy`](#testevidencepolicy) | `@kubeclaw/plugin-sdk` | type |
| [`TestProviderCapabilityRequest`](#testprovidercapabilityrequest) | `@kubeclaw/plugin-sdk` | type |
| [`TestProviderExecutionContext`](#testproviderexecutioncontext) | `@kubeclaw/plugin-sdk` | type |
| [`TestProviderFactory`](#testproviderfactory) | `@kubeclaw/plugin-sdk` | type |
| [`TestProviderInstance`](#testproviderinstance) | `@kubeclaw/plugin-sdk` | type |
| [`TestProviderPort`](#testproviderport) | `@kubeclaw/plugin-sdk` | type |
| [`TestProviderRegistration`](#testproviderregistration) | `@kubeclaw/plugin-sdk` | type |
| [`ValueRecord`](#valuerecord) | `@kubeclaw/plugin-sdk` | type |
| [`WaitRequest`](#waitrequest) | `@kubeclaw/plugin-sdk` | type |
| [`approvedSource`](#approvedsource) | `@kubeclaw/plugin-sdk` | function |
| [`arrayValue`](#arrayvalue) | `@kubeclaw/plugin-sdk` | function |
| [`buildRuntimeAgentTask`](#buildruntimeagenttask) | `@kubeclaw/plugin-sdk` | function |
| [`canonicalJson`](#canonicaljson) | `@kubeclaw/plugin-sdk` | function |
| [`captureReviewSubject`](#capturereviewsubject) | `@kubeclaw/plugin-sdk` | function |
| [`objectRecord`](#objectrecord) | `@kubeclaw/plugin-sdk` | function |
| [`parseReviewCacheProfile`](#parsereviewcacheprofile) | `@kubeclaw/plugin-sdk` | function |
| [`parseReviewSource`](#parsereviewsource) | `@kubeclaw/plugin-sdk` | function |
| [`parseReviewSubject`](#parsereviewsubject) | `@kubeclaw/plugin-sdk` | function |
| [`parseRuntimeDispatchProfile`](#parseruntimedispatchprofile) | `@kubeclaw/plugin-sdk` | function |
| [`parseRuntimeWorkspace`](#parseruntimeworkspace) | `@kubeclaw/plugin-sdk` | function |
| [`parseSourceBinding`](#parsesourcebinding) | `@kubeclaw/plugin-sdk` | function |
| [`portableJson`](#portablejson) | `@kubeclaw/plugin-sdk` | function |
| [`readBoundArtifact`](#readboundartifact) | `@kubeclaw/plugin-sdk` | function |
| [`redactStructuredValue`](#redactstructuredvalue) | `@kubeclaw/plugin-sdk` | function |
| [`resolveImplementationRevisions`](#resolveimplementationrevisions) | `@kubeclaw/plugin-sdk` | function |
| [`resolveSourceRevision`](#resolvesourcerevision) | `@kubeclaw/plugin-sdk` | function |
| [`reviewCacheProfileFromContext`](#reviewcacheprofilefromcontext) | `@kubeclaw/plugin-sdk` | function |
| [`reviewIdentityDigest`](#reviewidentitydigest) | `@kubeclaw/plugin-sdk` | function |
| [`runtimeDispatchProfileFields`](#runtimedispatchprofilefields) | `@kubeclaw/plugin-sdk` | function |
| [`runtimeWorkspaceGeneration`](#runtimeworkspacegeneration) | `@kubeclaw/plugin-sdk` | function |
| [`runtimeWorkspaceOwnerFile`](#runtimeworkspaceownerfile) | `@kubeclaw/plugin-sdk` | function |
| [`selectDefinedValue`](#selectdefinedvalue) | `@kubeclaw/plugin-sdk` | function |
| [`selectPresentValue`](#selectpresentvalue) | `@kubeclaw/plugin-sdk` | function |
| [`selectTruthyValue`](#selecttruthyvalue) | `@kubeclaw/plugin-sdk` | function |
| [`sha256Bytes`](#sha256bytes) | `@kubeclaw/plugin-sdk` | function |
| [`sha256Text`](#sha256text) | `@kubeclaw/plugin-sdk` | function |
| [`sourcePreflight`](#sourcepreflight) | `@kubeclaw/plugin-sdk` | function |
| [`textValue`](#textvalue) | `@kubeclaw/plugin-sdk` | function |
| [`verifiedArtifactJsonText`](#verifiedartifactjsontext) | `@kubeclaw/plugin-sdk` | function |
| [`verifyReviewSubject`](#verifyreviewsubject) | `@kubeclaw/plugin-sdk` | function |
| [`withRuntimeDispatchProfile`](#withruntimedispatchprofile) | `@kubeclaw/plugin-sdk` | function |
| [`assertNever`](#assertnever) | `@kubeclaw/plugin-sdk/testing` | function |

## AdapterActivationContext

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Adapter factory input. registration identifies the resolved package and registration; config is the validated adapter configuration. invoke and invokeConfidential use existing dependency grants. emit must use the plugin event namespace. Optional withCleanup provides one bounded cleanup phase, not extra permissions.

```ts
AdapterActivationContext
```

**Consumer example — source-only fragment:**

```ts
const factory = (context: AdapterActivationContext) => ({ ready: async () => {}, invoke: async () => ({}), shutdown: async () => {} });
```

Source: [AdapterActivationContext](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L82-L102).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| registration | no | yes | `readonly registration: RegistrationProvenance;` | [registration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L83-L83) |
| config | no | yes | `readonly config: Readonly<Record<string, unknown>>;` | [config](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L84-L84) |
| invoke | no | no | `invoke(     capability: string,     request: CapabilityInvocation,     options?: AdapterDependencyOptions,   ): Promise<Readonly<Record<string, unknown>>>;` | [invoke](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L85-L89) |
| invokeConfidential | no | no | `invokeConfidential(     capability: string,     request: CapabilityInvocation,     options?: AdapterDependencyOptions,   ): Promise<Readonly<Record<string, unknown>>>;` | [invokeConfidential](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L90-L94) |
| withCleanup | yes | no | `withCleanup?<T>(operation: (context: AdapterCleanupContext) => Promise<T>): Promise<T>;` | [withCleanup](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L96-L96) |
| emit | no | no | `emit(     type: string,     identity: EventIdentity,     payload: Readonly<Record<string, unknown>>,   ): Promise<void>;` | [emit](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L97-L101) |

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `AdapterCleanupContext`
- `AdapterDependencyOptions`
- `CapabilityInvocation`
- `EventIdentity`
- `Promise`
- `Readonly`
- `Record`
- `RegistrationProvenance`
- `T`

## AdapterActivationId

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Historical adapter activation owner token. It contains the package and registration names, not a stage run ID. The schema limits each part and the whole token; do not invent a stage attempt from this string.

```ts
string
```

**Consumer example — source-only fragment:**

```ts
const owner: AdapterActivationId = 'adapter:example.adapter:main';
```

Source: [AdapterActivationId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L42-L42).

Owning schema: [#/$defs/adapterActivationId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/adapterActivationId | `{"type":"string","pattern":"^adapter:(?=[^:]{1,160}:)[a-z0-9]+(?:[._-][a-z0-9]+)+:(?=[^:]{1,96}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$","maxLength":265}` | [#/$defs/adapterActivationId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L126-L130) |

## AdapterCleanupContext

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Cleanup receives its own AbortSignal and dependency invocation methods. The runtime requires a current invocation owned by the adapter before it enters cleanup. Lifecycle revocation and existing capability grants still apply.

```ts
AdapterCleanupContext
```

**Consumer example — source-only fragment:**

```ts
await context.withCleanup?.(async cleanup => { if (cleanup.signal.aborted) return; });
```

Source: [AdapterCleanupContext](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L76-L80).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| signal | no | yes | `readonly signal: AbortSignal;` | [signal](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L77-L77) |
| invoke | no | no | `invoke(capability: string, request: CapabilityInvocation, options?: AdapterDependencyOptions): Promise<Readonly<Record<string, unknown>>>;` | [invoke](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L78-L78) |
| invokeConfidential | no | no | `invokeConfidential(capability: string, request: CapabilityInvocation, options?: AdapterDependencyOptions): Promise<Readonly<Record<string, unknown>>>;` | [invokeConfidential](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L79-L79) |

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `AbortSignal`
- `AdapterDependencyOptions`
- `CapabilityInvocation`
- `Promise`
- `Readonly`
- `Record`

## AdapterDependencyOptions

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Optional signal joins the lifecycle and parent signals. deliveryId is optional; when present, the runtime requires a nonblank string of at most 512 UTF-16 code units and a parent invocation. It does not create an observer delivery or grant permission.

```ts
AdapterDependencyOptions
```

**Consumer example — source-only fragment:**

```ts
const options: AdapterDependencyOptions = { signal: controller.signal };
```

Source: [AdapterDependencyOptions](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L75-L75).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| signal | yes | yes | `readonly signal?: AbortSignal;` | [signal](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L75-L75) |
| deliveryId | yes | yes | `readonly deliveryId?: string` | [deliveryId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L75-L75) |

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `AbortSignal`

## AdapterFactory

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Factory receives an activation context and returns an adapter, directly or through a Promise. The runtime starts required dependency adapters before this factory, then calls ready. A factory rejection stops startup and triggers rollback.

```ts
(context: AdapterActivationContext): Promise<AdapterInstance> | AdapterInstance
```

**Consumer example — source-only fragment:**

```ts
const factory: AdapterFactory = context => ({ ready: async () => {}, invoke: async () => ({}), shutdown: async () => {} });
```

Source: [AdapterFactory](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L104-L106).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `AdapterActivationContext`
- `AdapterInstance`
- `Promise`

## AdapterInstance

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Implement ready, invoke and shutdown. Optional receipt looks up an earlier external result for an EffectRequest and may return undefined. An invoke Promise is not proof of durable completion: the effect coordinator owns receipts, locking and recovery. Honor the supplied abort signals.

```ts
AdapterInstance
```

**Consumer example — source-only fragment:**

```ts
const instance: AdapterInstance = { ready: async () => {}, invoke: async ({signal}) => { signal.throwIfAborted(); return {}; }, shutdown: async () => {} };
```

Source: [AdapterInstance](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L68-L73).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| ready | no | no | `ready(): Promise<void>;` | [ready](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L69-L69) |
| invoke | no | no | `invoke(invocation: AdapterInvocation): Promise<Readonly<Record<string, unknown>>>;` | [invoke](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L70-L70) |
| receipt | yes | no | `receipt?(request: EffectRequest): Promise<Readonly<Record<string, unknown>> \| undefined>;` | [receipt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L71-L71) |
| shutdown | no | no | `shutdown(signal: AbortSignal): Promise<void>;` | [shutdown](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L72-L72) |

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `AbortSignal`
- `AdapterInvocation`
- `EffectRequest`
- `Promise`
- `Readonly`
- `Record`

## AdapterInvocation

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Discriminated union. confidential: true excludes lock and fence. Otherwise lock and fence are required and confidential may be absent or false. request carries the admitted effect and signal bounds cancellation. The reachable fence and variant interfaces are not named exports from the SDK entrypoint.

```ts
FencedAdapterInvocation | ConfidentialAdapterInvocation
```

**Consumer example — source-only fragment:**

```ts
if (invocation.confidential !== true) invocation.fence.assertCurrent();
```

Source: [AdapterInvocation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L66-L66).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| request | no | yes | `request: { [k: string]: any; } & { runtimeDispatchProfile?: RuntimeDispatchProfile; schemaVersion: "effect-request.v2"; effectId: OpaqueId; idempotencyKey: EffectIdempotencyKey; deliveryId?: EffectDeliveryId; attempt: EffectAttemptIdentity; capability: NamespacedId; operation: LocalId; resource: ResourceIdentity; payload: JsonObject; requestedAt: string; }` | [request](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L51-L51) |
| signal | no | yes | `signal: AbortSignal` | [signal](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L52-L52) |
| confidential | yes | yes | `confidential?: boolean` | [confidential](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L53-L53) |
| lock | yes | yes | `lock?: ResourceLock` | [lock](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L54-L54) |
| fence | yes | yes | `fence?: AdapterResourceFence` | [fence](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L55-L55) |

**Union variants — read required/optional members within each branch, not only the merged member list:**

Branch 1:

```typescript
FencedAdapterInvocation
```

| Member | Optional in this branch | Type | Source |
| --- | --- | --- | --- |
| request | no | `{ [k: string]: any; } & { runtimeDispatchProfile?: RuntimeDispatchProfile; schemaVersion: "effect-request.v2"; effectId: OpaqueId; idempotencyKey: EffectIdempotencyKey; deliveryId?: EffectDeliveryId; attempt: EffectAttemptIdentity; capability: NamespacedId; operation: LocalId; resource: ResourceIdentity; payload: JsonObject; requestedAt: string; }` | [request](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L51-L51) |
| signal | no | `AbortSignal` | [signal](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L52-L52) |
| confidential | yes | `false` | [confidential](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L53-L53) |
| lock | no | `ResourceLock` | [lock](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L54-L54) |
| fence | no | `AdapterResourceFence` | [fence](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L55-L55) |

Branch 2:

```typescript
ConfidentialAdapterInvocation
```

| Member | Optional in this branch | Type | Source |
| --- | --- | --- | --- |
| request | no | `{ [k: string]: any; } & { runtimeDispatchProfile?: RuntimeDispatchProfile; schemaVersion: "effect-request.v2"; effectId: OpaqueId; idempotencyKey: EffectIdempotencyKey; deliveryId?: EffectDeliveryId; attempt: EffectAttemptIdentity; capability: NamespacedId; operation: LocalId; resource: ResourceIdentity; payload: JsonObject; requestedAt: string; }` | [request](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L59-L59) |
| signal | no | `AbortSignal` | [signal](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L60-L60) |
| confidential | no | `true` | [confidential](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L61-L61) |
| lock | yes | `never` | [lock](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L62-L62) |
| fence | yes | `never` | [fence](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L63-L63) |


No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `ConfidentialAdapterInvocation`
- `FencedAdapterInvocation`

## AdapterLifecycle

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Records adapter startup, readiness, degradation and shutdown state with provider provenance and change time. degraded or failed requires a reason at schema validation. This record describes state; it does not start or stop an adapter.

```ts
{ [k: string]: any; } & { schemaVersion: "adapter-lifecycle.v2"; provider: RegistrationProvenance; status: "activating" | "ready" | "degraded" | "stopping" | "stopped" | "failed"; changedAt: string; reason?: Reason; }
```

**Consumer example — source-only fragment:**

```ts
const status: AdapterLifecycle['status'] = 'ready';
```

Source: [AdapterLifecycle](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L228-L236).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| [index] | no | no | `[k: string]: any;` | [skills/common/plugin-runtime/sdk/src/generated/contracts.ts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L229-L229) |
| schemaVersion | no | no | `schemaVersion: 'adapter-lifecycle.v2';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L231-L231) |
| provider | no | no | `provider: RegistrationProvenance;` | [provider](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L232-L232) |
| status | no | no | `status: 'activating' \| 'ready' \| 'degraded' \| 'stopping' \| 'stopped' \| 'failed';` | [status](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L233-L233) |
| changedAt | no | no | `changedAt: string;` | [changedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L234-L234) |
| reason | yes | no | `reason?: Reason;` | [reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L235-L235) |

Owning schema: [#/$defs/adapterLifecycle](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/adapterLifecycle | `{"type":"object","additionalProperties":false,"required":["schemaVersion","provider","status","changedAt"]}` | [#/$defs/adapterLifecycle](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1117-L1135) |
| #/$defs/adapterLifecycle/properties/schemaVersion | `{"const":"adapter-lifecycle.v2"}` | [#/$defs/adapterLifecycle/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1122-L1122) |
| #/$defs/adapterLifecycle/properties/provider | `{"$ref":"#/$defs/registrationProvenance"}` | [#/$defs/adapterLifecycle/properties/provider](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1123-L1123) |
| #/$defs/adapterLifecycle/properties/status | `{"enum":["activating","ready","degraded","stopping","stopped","failed"]}` | [#/$defs/adapterLifecycle/properties/status](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1124-L1124) |
| #/$defs/adapterLifecycle/properties/changedAt | `{"type":"string","format":"date-time"}` | [#/$defs/adapterLifecycle/properties/changedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1125-L1125) |
| #/$defs/adapterLifecycle/properties/reason | `{"$ref":"#/$defs/reason"}` | [#/$defs/adapterLifecycle/properties/reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1126-L1126) |
| #/$defs/adapterLifecycle/allOf/0 | `{}` | [#/$defs/adapterLifecycle/allOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1128-L1134) |
| #/$defs/adapterLifecycle/allOf/0/if | `{"required":["status"]}` | [#/$defs/adapterLifecycle/allOf/0/if](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1129-L1132) |
| #/$defs/adapterLifecycle/allOf/0/if/properties/status | `{"enum":["degraded","failed"]}` | [#/$defs/adapterLifecycle/allOf/0/if/properties/status](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1130-L1130) |
| #/$defs/adapterLifecycle/allOf/0/then | `{"required":["reason"]}` | [#/$defs/adapterLifecycle/allOf/0/then](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1133-L1133) |
| #/$defs/adapterLifecycle/allOf/0/then/properties/reason | `true` | [#/$defs/adapterLifecycle/allOf/0/then/properties/reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1133-L1133) |

Referenced types:

- `Reason`
- `RegistrationProvenance`

## AdapterRegistration

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Manifest entry connects a module/export and config schema to provided and required capabilities. At least one provided capability is required; capability arrays must have unique items. Declaring a requirement is not the same as receiving a grant.

```ts
AdapterRegistration
```

**Consumer example — source-only fragment:**

```ts
const provided: AdapterRegistration['providesCapabilities'] = ['example.read'];
```

Source: [AdapterRegistration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L375-L385).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| id | no | no | `id: LocalId;` | [id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L376-L376) |
| module | no | no | `module: RelativeModulePath;` | [module](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L377-L377) |
| export | no | no | `export: string;` | [export](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L378-L378) |
| providesCapabilities | no | no | `providesCapabilities: [NamespacedId, ...NamespacedId[]];` | [providesCapabilities](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L382-L382) |
| requiredCapabilities | no | no | `requiredCapabilities: NamespacedId[];` | [requiredCapabilities](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L383-L383) |
| configSchema | no | no | `configSchema: RelativeSchemaPath;` | [configSchema](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L384-L384) |

Owning schema: [#/$defs/adapterRegistration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/adapterRegistration | `{"type":"object","additionalProperties":false,"required":["id","module","export","providesCapabilities","requiredCapabilities","configSchema"]}` | [#/$defs/adapterRegistration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L255-L279) |
| #/$defs/adapterRegistration/properties/id | `{"$ref":"#/$defs/localId"}` | [#/$defs/adapterRegistration/properties/id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L263-L263) |
| #/$defs/adapterRegistration/properties/module | `{"$ref":"#/$defs/relativeModulePath"}` | [#/$defs/adapterRegistration/properties/module](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L264-L264) |
| #/$defs/adapterRegistration/properties/export | `{"type":"string","pattern":"^[A-Za-z_$][A-Za-z0-9_$]*$"}` | [#/$defs/adapterRegistration/properties/export](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L265-L265) |
| #/$defs/adapterRegistration/properties/providesCapabilities | `{"type":"array","minItems":1,"uniqueItems":true}` | [#/$defs/adapterRegistration/properties/providesCapabilities](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L266-L271) |
| #/$defs/adapterRegistration/properties/providesCapabilities/items | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/adapterRegistration/properties/providesCapabilities/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L270-L270) |
| #/$defs/adapterRegistration/properties/requiredCapabilities | `{"type":"array","uniqueItems":true}` | [#/$defs/adapterRegistration/properties/requiredCapabilities](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L272-L276) |
| #/$defs/adapterRegistration/properties/requiredCapabilities/items | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/adapterRegistration/properties/requiredCapabilities/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L274-L274) |
| #/$defs/adapterRegistration/properties/configSchema | `{"$ref":"#/$defs/relativeSchemaPath"}` | [#/$defs/adapterRegistration/properties/configSchema](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L277-L277) |

Referenced types:

- `LocalId`
- `NamespacedId`
- `RelativeModulePath`
- `RelativeSchemaPath`

## AdministrativeReopenDecision

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Administrative continuation record for a run and stage. remediation requires remediationStageId. retry or cancel may contain package upgrades. Actor is an operator or administrator. A well-typed record does not itself authorize or execute reopening.

```ts
{ schemaVersion: "administrative-reopen.v2"; decisionId: OpaqueId; idempotencyKey: OpaqueId; runId: OpaqueId; stageId: LocalId; actor: { type: "operator" | "administrator"; id: OpaqueId; }; reason: Reason; continuation: "remediation"; remediationStageId: LocalId; decidedAt: string; } | { schemaVersion: "administrative-reopen.v2"; decisionId: OpaqueId; idempotencyKey: OpaqueId; runId: OpaqueId; stageId: LocalId; actor: { type: "operator" | "administrator"; id: OpaqueId; }; reason: Reason; continuation: "retry" | "cancel"; packageUpgrades?: [{ pluginId: NamespacedId; from: PackageIdentity; to: PackageIdentity; }, ...{ pluginId: NamespacedId; from: PackageIdentity; to: PackageIdentity; }[]]; decidedAt: string; }
```

**Consumer example — source-only fragment:**

```ts
const continuation: AdministrativeReopenDecision['continuation'] = 'retry';
```

Source: [AdministrativeReopenDecision](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L164-L208).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| schemaVersion | no | no | `schemaVersion: 'administrative-reopen.v2';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L166-L166) |
| decisionId | no | no | `decisionId: OpaqueId;` | [decisionId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L167-L167) |
| idempotencyKey | no | no | `idempotencyKey: OpaqueId;` | [idempotencyKey](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L168-L168) |
| runId | no | no | `runId: OpaqueId;` | [runId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L169-L169) |
| stageId | no | no | `stageId: LocalId;` | [stageId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L170-L170) |
| actor | no | no | `actor: {         type: 'operator' \| 'administrator';         id: OpaqueId;       };` | [actor](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L171-L174) |
| actor.type | no | no | `type: 'operator' \| 'administrator';` | [type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L172-L172) |
| actor.id | no | no | `id: OpaqueId;` | [id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L173-L173) |
| reason | no | no | `reason: Reason;` | [reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L175-L175) |
| continuation | no | no | `continuation: 'remediation';` | [continuation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L176-L176) |
| remediationStageId | no | no | `remediationStageId: LocalId;` | [remediationStageId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L177-L177) |
| decidedAt | no | no | `decidedAt: string;` | [decidedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L178-L178) |
| schemaVersion | no | no | `schemaVersion: 'administrative-reopen.v2';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L181-L181) |
| decisionId | no | no | `decisionId: OpaqueId;` | [decisionId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L182-L182) |
| idempotencyKey | no | no | `idempotencyKey: OpaqueId;` | [idempotencyKey](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L183-L183) |
| runId | no | no | `runId: OpaqueId;` | [runId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L184-L184) |
| stageId | no | no | `stageId: LocalId;` | [stageId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L185-L185) |
| actor | no | no | `actor: {         type: 'operator' \| 'administrator';         id: OpaqueId;       };` | [actor](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L186-L189) |
| actor.type | no | no | `type: 'operator' \| 'administrator';` | [type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L187-L187) |
| actor.id | no | no | `id: OpaqueId;` | [id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L188-L188) |
| reason | no | no | `reason: Reason;` | [reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L190-L190) |
| continuation | no | no | `continuation: 'retry' \| 'cancel';` | [continuation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L191-L191) |
| packageUpgrades | yes | no | `packageUpgrades?: [         {           pluginId: NamespacedId;           from: PackageIdentity;           to: PackageIdentity;         },         ...{           pluginId: NamespacedId;           from: PackageIdentity;           to: PackageIdentity;         }[]       ];` | [packageUpgrades](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L195-L206) |
| packageUpgrades.pluginId | no | no | `pluginId: NamespacedId;` | [pluginId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L197-L197) |
| packageUpgrades.from | no | no | `from: PackageIdentity;` | [from](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L198-L198) |
| packageUpgrades.to | no | no | `to: PackageIdentity;` | [to](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L199-L199) |
| packageUpgrades.pluginId | no | no | `pluginId: NamespacedId;` | [pluginId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L202-L202) |
| packageUpgrades.from | no | no | `from: PackageIdentity;` | [from](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L203-L203) |
| packageUpgrades.to | no | no | `to: PackageIdentity;` | [to](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L204-L204) |
| decidedAt | no | no | `decidedAt: string;` | [decidedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L207-L207) |

**Union variants — read required/optional members within each branch, not only the merged member list:**

Branch 1:

```typescript
{ schemaVersion: "administrative-reopen.v2"; decisionId: OpaqueId; idempotencyKey: OpaqueId; runId: OpaqueId; stageId: LocalId; actor: { type: "operator" | "administrator"; id: OpaqueId; }; reason: Reason; continuation: "remediation"; remediationStageId: LocalId; decidedAt: string; }
```

| Member | Optional in this branch | Type | Source |
| --- | --- | --- | --- |
| schemaVersion | no | `"administrative-reopen.v2"` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L166-L166) |
| decisionId | no | `string` | [decisionId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L167-L167) |
| idempotencyKey | no | `string` | [idempotencyKey](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L168-L168) |
| runId | no | `string` | [runId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L169-L169) |
| stageId | no | `string` | [stageId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L170-L170) |
| actor | no | `{ type: "operator" \| "administrator"; id: OpaqueId; }` | [actor](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L171-L174) |
| reason | no | `Reason` | [reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L175-L175) |
| continuation | no | `"remediation"` | [continuation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L176-L176) |
| remediationStageId | no | `string` | [remediationStageId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L177-L177) |
| decidedAt | no | `string` | [decidedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L178-L178) |

Branch 2:

```typescript
{ schemaVersion: "administrative-reopen.v2"; decisionId: OpaqueId; idempotencyKey: OpaqueId; runId: OpaqueId; stageId: LocalId; actor: { type: "operator" | "administrator"; id: OpaqueId; }; reason: Reason; continuation: "retry" | "cancel"; packageUpgrades?: [{ pluginId: NamespacedId; from: PackageIdentity; to: PackageIdentity; }, ...{ pluginId: NamespacedId; from: PackageIdentity; to: PackageIdentity; }[]]; decidedAt: string; }
```

| Member | Optional in this branch | Type | Source |
| --- | --- | --- | --- |
| schemaVersion | no | `"administrative-reopen.v2"` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L181-L181) |
| decisionId | no | `string` | [decisionId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L182-L182) |
| idempotencyKey | no | `string` | [idempotencyKey](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L183-L183) |
| runId | no | `string` | [runId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L184-L184) |
| stageId | no | `string` | [stageId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L185-L185) |
| actor | no | `{ type: "operator" \| "administrator"; id: OpaqueId; }` | [actor](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L186-L189) |
| reason | no | `Reason` | [reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L190-L190) |
| continuation | no | `"retry" \| "cancel"` | [continuation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L191-L191) |
| packageUpgrades | yes | `[{ pluginId: NamespacedId; from: PackageIdentity; to: PackageIdentity; }, ...{ pluginId: NamespacedId; from: PackageIdentity; to: PackageIdentity; }[]]` | [packageUpgrades](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L195-L206) |
| decidedAt | no | `string` | [decidedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L207-L207) |


Owning schema: [#/$defs/administrativeReopenDecision](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/administrativeReopenDecision | `{}` | [#/$defs/administrativeReopenDecision](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L803-L873) |
| #/$defs/administrativeReopenDecision/oneOf/0 | `{"type":"object","additionalProperties":false,"required":["schemaVersion","decisionId","idempotencyKey","runId","stageId","actor","reason","continuation","remediationStageId","decidedAt"]}` | [#/$defs/administrativeReopenDecision/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L805-L832) |
| #/$defs/administrativeReopenDecision/oneOf/0/properties/schemaVersion | `{"const":"administrative-reopen.v2"}` | [#/$defs/administrativeReopenDecision/oneOf/0/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L813-L813) |
| #/$defs/administrativeReopenDecision/oneOf/0/properties/decisionId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/administrativeReopenDecision/oneOf/0/properties/decisionId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L814-L814) |
| #/$defs/administrativeReopenDecision/oneOf/0/properties/idempotencyKey | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/administrativeReopenDecision/oneOf/0/properties/idempotencyKey](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L815-L815) |
| #/$defs/administrativeReopenDecision/oneOf/0/properties/runId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/administrativeReopenDecision/oneOf/0/properties/runId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L816-L816) |
| #/$defs/administrativeReopenDecision/oneOf/0/properties/stageId | `{"$ref":"#/$defs/localId"}` | [#/$defs/administrativeReopenDecision/oneOf/0/properties/stageId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L817-L817) |
| #/$defs/administrativeReopenDecision/oneOf/0/properties/actor | `{"type":"object","additionalProperties":false,"required":["type","id"]}` | [#/$defs/administrativeReopenDecision/oneOf/0/properties/actor](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L818-L826) |
| #/$defs/administrativeReopenDecision/oneOf/0/properties/actor/properties/type | `{"enum":["operator","administrator"]}` | [#/$defs/administrativeReopenDecision/oneOf/0/properties/actor/properties/type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L823-L823) |
| #/$defs/administrativeReopenDecision/oneOf/0/properties/actor/properties/id | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/administrativeReopenDecision/oneOf/0/properties/actor/properties/id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L824-L824) |
| #/$defs/administrativeReopenDecision/oneOf/0/properties/reason | `{"$ref":"#/$defs/reason"}` | [#/$defs/administrativeReopenDecision/oneOf/0/properties/reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L827-L827) |
| #/$defs/administrativeReopenDecision/oneOf/0/properties/continuation | `{"const":"remediation"}` | [#/$defs/administrativeReopenDecision/oneOf/0/properties/continuation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L828-L828) |
| #/$defs/administrativeReopenDecision/oneOf/0/properties/remediationStageId | `{"$ref":"#/$defs/localId"}` | [#/$defs/administrativeReopenDecision/oneOf/0/properties/remediationStageId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L829-L829) |
| #/$defs/administrativeReopenDecision/oneOf/0/properties/decidedAt | `{"type":"string","format":"date-time"}` | [#/$defs/administrativeReopenDecision/oneOf/0/properties/decidedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L830-L830) |
| #/$defs/administrativeReopenDecision/oneOf/1 | `{"type":"object","additionalProperties":false,"required":["schemaVersion","decisionId","idempotencyKey","runId","stageId","actor","reason","continuation","decidedAt"]}` | [#/$defs/administrativeReopenDecision/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L833-L871) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/schemaVersion | `{"const":"administrative-reopen.v2"}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L841-L841) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/decisionId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/decisionId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L842-L842) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/idempotencyKey | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/idempotencyKey](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L843-L843) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/runId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/runId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L844-L844) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/stageId | `{"$ref":"#/$defs/localId"}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/stageId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L845-L845) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/actor | `{"type":"object","additionalProperties":false,"required":["type","id"]}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/actor](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L846-L854) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/actor/properties/type | `{"enum":["operator","administrator"]}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/actor/properties/type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L851-L851) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/actor/properties/id | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/actor/properties/id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L852-L852) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/reason | `{"$ref":"#/$defs/reason"}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L855-L855) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/continuation | `{"enum":["retry","cancel"]}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/continuation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L856-L856) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/packageUpgrades | `{"type":"array","minItems":1,"uniqueItems":true}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/packageUpgrades](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L857-L868) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/packageUpgrades/items | `{"type":"object","additionalProperties":false,"required":["pluginId","from","to"]}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/packageUpgrades/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L859-L867) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/packageUpgrades/items/properties/pluginId | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/packageUpgrades/items/properties/pluginId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L863-L863) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/packageUpgrades/items/properties/from | `{"$ref":"#/$defs/packageIdentity"}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/packageUpgrades/items/properties/from](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L864-L864) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/packageUpgrades/items/properties/to | `{"$ref":"#/$defs/packageIdentity"}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/packageUpgrades/items/properties/to](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L865-L865) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/decidedAt | `{"type":"string","format":"date-time"}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/decidedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L869-L869) |

Referenced types:

- `LocalId`
- `NamespacedId`
- `OpaqueId`
- `PackageIdentity`
- `Reason`

## ArtifactRef

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Reference to exact stored bytes: artifactId, namespace, mediaType, digest, sizeBytes and producer belong together. Optional encoding selects portable JSON only when explicitly present. Absence preserves the historical producer bytes. A digest proves byte agreement, not producer authority or permission.

```ts
ArtifactRef
```

**Consumer example — source-only fragment:**

```ts
const encoding: ArtifactRef['encoding'] = PORTABLE_JSON_ENCODING;
```

Source: [ArtifactRef](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L497-L505).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| encoding | yes | no | `encoding?: 'kubeclaw-json.utf16.v1';` | [encoding](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L498-L498) |
| artifactId | no | no | `artifactId: OpaqueId;` | [artifactId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L499-L499) |
| namespace | no | no | `namespace: NamespacedId;` | [namespace](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L500-L500) |
| mediaType | no | no | `mediaType: string;` | [mediaType](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L501-L501) |
| digest | no | no | `digest: string;` | [digest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L502-L502) |
| sizeBytes | no | no | `sizeBytes: number;` | [sizeBytes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L503-L503) |
| producer | no | no | `producer: AttemptIdentity;` | [producer](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L504-L504) |

Owning schema: [#/$defs/artifactRef](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/artifactRef | `{"type":"object","additionalProperties":false,"required":["artifactId","namespace","mediaType","digest","sizeBytes","producer"]}` | [#/$defs/artifactRef](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L564-L577) |
| #/$defs/artifactRef/properties/encoding | `{"const":"kubeclaw-json.utf16.v1"}` | [#/$defs/artifactRef/properties/encoding](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L569-L569) |
| #/$defs/artifactRef/properties/artifactId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/artifactRef/properties/artifactId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L570-L570) |
| #/$defs/artifactRef/properties/namespace | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/artifactRef/properties/namespace](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L571-L571) |
| #/$defs/artifactRef/properties/mediaType | `{"type":"string","pattern":"^[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+$"}` | [#/$defs/artifactRef/properties/mediaType](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L572-L572) |
| #/$defs/artifactRef/properties/digest | `{"type":"string","pattern":"^sha256:[a-f0-9]{64}$"}` | [#/$defs/artifactRef/properties/digest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L573-L573) |
| #/$defs/artifactRef/properties/sizeBytes | `{"type":"integer","minimum":0}` | [#/$defs/artifactRef/properties/sizeBytes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L574-L574) |
| #/$defs/artifactRef/properties/producer | `{"$ref":"#/$defs/attemptIdentity"}` | [#/$defs/artifactRef/properties/producer](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L575-L575) |

Referenced types:

- `AttemptIdentity`
- `NamespacedId`
- `OpaqueId`

## AttemptIdentity

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Identifies one numbered stage attempt in a run. attemptNumber is an integer of at least one in the schema. Keep run, stage, attempt token and number together when comparing producer ownership.

```ts
AttemptIdentity
```

**Consumer example — source-only fragment:**

```ts
const attempt: AttemptIdentity = {runId:'run1',stageId:'build',attemptId:'attempt1',attemptNumber:1};
```

Source: [AttemptIdentity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L326-L331).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| runId | no | no | `runId: OpaqueId;` | [runId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L327-L327) |
| stageId | no | no | `stageId: LocalId;` | [stageId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L328-L328) |
| attemptId | no | no | `attemptId: OpaqueId;` | [attemptId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L329-L329) |
| attemptNumber | no | no | `attemptNumber: number;` | [attemptNumber](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L330-L330) |

Owning schema: [#/$defs/attemptIdentity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/attemptIdentity | `{"type":"object","additionalProperties":false,"required":["runId","stageId","attemptId","attemptNumber"]}` | [#/$defs/attemptIdentity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L530-L540) |
| #/$defs/attemptIdentity/properties/runId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/attemptIdentity/properties/runId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L535-L535) |
| #/$defs/attemptIdentity/properties/stageId | `{"$ref":"#/$defs/localId"}` | [#/$defs/attemptIdentity/properties/stageId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L536-L536) |
| #/$defs/attemptIdentity/properties/attemptId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/attemptIdentity/properties/attemptId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L537-L537) |
| #/$defs/attemptIdentity/properties/attemptNumber | `{"type":"integer","minimum":1}` | [#/$defs/attemptIdentity/properties/attemptNumber](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L538-L538) |

Referenced types:

- `LocalId`
- `OpaqueId`

## CURRENT_REVIEW_CACHE_PROFILE

Import: `@kubeclaw/plugin-sdk`. Kind: constant.

Frozen generated constant: review-cache-profile.v1, review-content-cache.v2 and json-utf16-v1. It selects the current cache producer only when the run context explicitly carries it. Artifact encoding, runtime transport and other digest versions do not imply this profile.

```ts
{ readonly schemaVersion: "review-cache-profile.v1"; readonly recordVersion: "review-content-cache.v2"; readonly encoding: "json-utf16-v1"; }
```

**Consumer example — source-only fragment:**

```ts
const profile = CURRENT_REVIEW_CACHE_PROFILE;
```

Source: [CURRENT_REVIEW_CACHE_PROFILE](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L699-L699).

Owning schema: [#/$defs/reviewCacheProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/reviewCacheProfile | `{"description":"Explicit immutable run-owned review cache producer profile. Historical absence preserves review-content-cache.v1 and its original effect operations.","const":{"schemaVersion":"review-cache-profile.v1","recordVersion":"review-content-cache.v2","encoding":"json-utf16-v1"}}` | [#/$defs/reviewCacheProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L6-L9) |

## CURRENT_RUNTIME_DISPATCH_PROFILE

Import: `@kubeclaw/plugin-sdk`. Kind: constant.

Frozen generated constant: runtime-dispatch-profile.v1 with json-utf16-v1. Producers explicitly bind this run-owned transport choice; historical absence keeps the legacy producer. It is not inferred from a review cache or artifact version.

```ts
{ readonly schemaVersion: "runtime-dispatch-profile.v1"; readonly encoding: "json-utf16-v1"; }
```

**Consumer example — source-only fragment:**

```ts
const profile = CURRENT_RUNTIME_DISPATCH_PROFILE;
```

Source: [CURRENT_RUNTIME_DISPATCH_PROFILE](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L698-L698).

Owning schema: [#/$defs/runtimeDispatchProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/runtimeDispatchProfile | `{"description":"Explicit current runtime transport producer profile. Absence in historical contexts preserves the legacy producer; no profile is inferred from another digest version.","const":{"schemaVersion":"runtime-dispatch-profile.v1","encoding":"json-utf16-v1"}}` | [#/$defs/runtimeDispatchProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L10-L13) |

## CapabilityGrant

Import: `@kubeclaw/plugin-sdk`. Kind: type.

A lease grant selects a capability, resolved provider and constraint object. Constraint meaning belongs to the capability authorization implementation. Possession of a TypeScript object is not a grant from the runtime.

```ts
CapabilityGrant
```

**Consumer example — source-only fragment:**

```ts
const name: CapabilityGrant['capability'] = 'example.read';
```

Source: [CapabilityGrant](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L576-L580).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| capability | no | no | `capability: NamespacedId;` | [capability](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L577-L577) |
| provider | no | no | `provider: PackageResolution;` | [provider](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L578-L578) |
| constraints | no | no | `constraints: JsonObject;` | [constraints](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L579-L579) |

Owning schema: [#/$defs/capabilityGrant](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/capabilityGrant | `{"type":"object","additionalProperties":false,"required":["capability","provider","constraints"]}` | [#/$defs/capabilityGrant](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L932-L941) |
| #/$defs/capabilityGrant/properties/capability | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/capabilityGrant/properties/capability](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L937-L937) |
| #/$defs/capabilityGrant/properties/provider | `{"$ref":"#/$defs/packageResolution"}` | [#/$defs/capabilityGrant/properties/provider](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L938-L938) |
| #/$defs/capabilityGrant/properties/constraints | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/capabilityGrant/properties/constraints](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L939-L939) |

Referenced types:

- `JsonObject`
- `NamespacedId`
- `PackageResolution`

## CapabilityInvocation

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Public named type is the readonly runtime interface, not the wider generated alias of the same name. Supply operation, resource.type, resource.canonicalId and payload. Optional runtimeDispatchProfile is control metadata; the owning schema restricts it to dispatch on runtime.agent. The helper that binds a profile does not itself enforce operation/resource rules; core validates the tagged request.

```ts
CapabilityInvocation
```

**Consumer example — source-only fragment:**

```ts
const request: CapabilityInvocation = {operation:'get',resource:{type:'example.object',canonicalId:'item1'},payload:{}};
```

Source: [CapabilityInvocation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L21-L29).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| runtimeDispatchProfile | yes | yes | `readonly runtimeDispatchProfile?: RuntimeDispatchProfile;` | [runtimeDispatchProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L22-L22) |
| operation | no | yes | `readonly operation: string;` | [operation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L23-L23) |
| resource | no | yes | `readonly resource: {     readonly type: string;     readonly canonicalId: string;   };` | [resource](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L24-L27) |
| resource.type | no | yes | `readonly type: string;` | [type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L25-L25) |
| resource.canonicalId | no | yes | `readonly canonicalId: string;` | [canonicalId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L26-L26) |
| payload | no | yes | `readonly payload: Readonly<Record<string, unknown>>;` | [payload](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L28-L28) |

Owning schema: [#/$defs/capabilityInvocation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/capabilityInvocation | `{"type":"object","additionalProperties":false,"required":["operation","resource","payload"]}` | [#/$defs/capabilityInvocation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L14-L27) |
| #/$defs/capabilityInvocation/properties/operation | `{"type":"string","minLength":1}` | [#/$defs/capabilityInvocation/properties/operation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L18-L18) |
| #/$defs/capabilityInvocation/properties/resource | `{"$ref":"#/$defs/resourceIdentity"}` | [#/$defs/capabilityInvocation/properties/resource](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L19-L19) |
| #/$defs/capabilityInvocation/properties/payload | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/capabilityInvocation/properties/payload](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L20-L20) |
| #/$defs/capabilityInvocation/properties/runtimeDispatchProfile | `{"$ref":"#/$defs/runtimeDispatchProfile"}` | [#/$defs/capabilityInvocation/properties/runtimeDispatchProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L21-L21) |
| #/$defs/capabilityInvocation/allOf/0 | `{}` | [#/$defs/capabilityInvocation/allOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L23-L26) |
| #/$defs/capabilityInvocation/allOf/0/if | `{"required":["runtimeDispatchProfile"]}` | [#/$defs/capabilityInvocation/allOf/0/if](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L24-L24) |
| #/$defs/capabilityInvocation/allOf/0/if/properties/runtimeDispatchProfile | `true` | [#/$defs/capabilityInvocation/allOf/0/if/properties/runtimeDispatchProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L24-L24) |
| #/$defs/capabilityInvocation/allOf/0/then | `{}` | [#/$defs/capabilityInvocation/allOf/0/then](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L25-L25) |
| #/$defs/capabilityInvocation/allOf/0/then/properties/operation | `{"const":"dispatch"}` | [#/$defs/capabilityInvocation/allOf/0/then/properties/operation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L25-L25) |
| #/$defs/capabilityInvocation/allOf/0/then/properties/resource | `{"type":"object"}` | [#/$defs/capabilityInvocation/allOf/0/then/properties/resource](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L25-L25) |
| #/$defs/capabilityInvocation/allOf/0/then/properties/resource/properties/type | `{"const":"runtime.agent"}` | [#/$defs/capabilityInvocation/allOf/0/then/properties/resource/properties/type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L25-L25) |

Referenced types:

- `Readonly`
- `Record`
- `RuntimeDispatchProfile`

## DecisionFacts

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Stage decision facts use namespaced keys and scalar string, number, boolean or null values. A downstream activation condition refers to one fact and compares its value. Nested objects and arrays are outside the schema.

```ts
DecisionFacts
```

**Consumer example — source-only fragment:**

```ts
const facts: DecisionFacts = {'example.ready':true};
```

Source: [DecisionFacts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L506-L508).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| [index] | no | no | `[k: string]: string \| number \| boolean \| null;` | [skills/common/plugin-runtime/sdk/src/generated/contracts.ts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L507-L507) |

Owning schema: [#/$defs/decisionFacts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/decisionFacts | `{"type":"object","additionalProperties":{"oneOf":[{"type":"string"},{"type":"number"},{"type":"boolean"},{"type":"null"}]}}` | [#/$defs/decisionFacts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L597-L608) |
| #/$defs/decisionFacts/propertyNames | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/decisionFacts/propertyNames](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L599-L599) |
| #/$defs/decisionFacts/additionalProperties | `{}` | [#/$defs/decisionFacts/additionalProperties](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L600-L607) |
| #/$defs/decisionFacts/additionalProperties/oneOf/0 | `{"type":"string"}` | [#/$defs/decisionFacts/additionalProperties/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L602-L602) |
| #/$defs/decisionFacts/additionalProperties/oneOf/1 | `{"type":"number"}` | [#/$defs/decisionFacts/additionalProperties/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L603-L603) |
| #/$defs/decisionFacts/additionalProperties/oneOf/2 | `{"type":"boolean"}` | [#/$defs/decisionFacts/additionalProperties/oneOf/2](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L604-L604) |
| #/$defs/decisionFacts/additionalProperties/oneOf/3 | `{"type":"null"}` | [#/$defs/decisionFacts/additionalProperties/oneOf/3](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L605-L605) |

## EffectAttemptIdentity

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Either a normal AttemptIdentity or the exact historical adapter activation shape. The latter has stageId adapter-activation and attemptNumber 1; core also checks that runId and attemptId name the actual activation owner. The union alone does not make those strings equal.

```ts
AttemptIdentity | { runId: AdapterActivationId; stageId: "adapter-activation"; attemptId: AdapterActivationId; attemptNumber: 1; }
```

**Consumer example — source-only fragment:**

```ts
const number: EffectAttemptIdentity['attemptNumber'] = 1;
```

Source: [EffectAttemptIdentity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L33-L40).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| runId | no | no | `runId: AdapterActivationId;` | [runId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L36-L36) |
| stageId | no | no | `stageId: 'adapter-activation';` | [stageId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L37-L37) |
| attemptId | no | no | `attemptId: AdapterActivationId;` | [attemptId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L38-L38) |
| attemptNumber | no | no | `attemptNumber: 1;` | [attemptNumber](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L39-L39) |

**Union variants — read required/optional members within each branch, not only the merged member list:**

Branch 1:

```typescript
AttemptIdentity
```

| Member | Optional in this branch | Type | Source |
| --- | --- | --- | --- |
| runId | no | `string` | [runId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L327-L327) |
| stageId | no | `string` | [stageId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L328-L328) |
| attemptId | no | `string` | [attemptId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L329-L329) |
| attemptNumber | no | `number` | [attemptNumber](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L330-L330) |

Branch 2:

```typescript
{ runId: AdapterActivationId; stageId: "adapter-activation"; attemptId: AdapterActivationId; attemptNumber: 1; }
```

| Member | Optional in this branch | Type | Source |
| --- | --- | --- | --- |
| runId | no | `string` | [runId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L36-L36) |
| stageId | no | `"adapter-activation"` | [stageId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L37-L37) |
| attemptId | no | `string` | [attemptId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L38-L38) |
| attemptNumber | no | `1` | [attemptNumber](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L39-L39) |


Owning schema: [#/$defs/effectAttemptIdentity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/effectAttemptIdentity | `{}` | [#/$defs/effectAttemptIdentity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L109-L125) |
| #/$defs/effectAttemptIdentity/anyOf/0 | `{"$ref":"#/$defs/attemptIdentity"}` | [#/$defs/effectAttemptIdentity/anyOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L111-L111) |
| #/$defs/effectAttemptIdentity/anyOf/1 | `{"description":"Exact historical adapter-activation producer domain. Core additionally checks equal runId and attemptId against the actual activation owner.","type":"object","additionalProperties":false,"required":["runId","stageId","attemptId","attemptNumber"]}` | [#/$defs/effectAttemptIdentity/anyOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L112-L123) |
| #/$defs/effectAttemptIdentity/anyOf/1/properties/runId | `{"$ref":"#/$defs/adapterActivationId"}` | [#/$defs/effectAttemptIdentity/anyOf/1/properties/runId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L118-L118) |
| #/$defs/effectAttemptIdentity/anyOf/1/properties/stageId | `{"const":"adapter-activation"}` | [#/$defs/effectAttemptIdentity/anyOf/1/properties/stageId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L119-L119) |
| #/$defs/effectAttemptIdentity/anyOf/1/properties/attemptId | `{"$ref":"#/$defs/adapterActivationId"}` | [#/$defs/effectAttemptIdentity/anyOf/1/properties/attemptId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L120-L120) |
| #/$defs/effectAttemptIdentity/anyOf/1/properties/attemptNumber | `{"const":1}` | [#/$defs/effectAttemptIdentity/anyOf/1/properties/attemptNumber](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L121-L121) |

Referenced types:

- `AdapterActivationId`
- `AttemptIdentity`

## EffectDeliveryId

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Adapter dependency delivery token: schema maxLength is 512 Unicode code points; the runtime separately requires nonblank text of at most 512 UTF-16 code units. This is not the stricter observer delivery ID grammar. Runtime checks require a parent owner when a dependency call supplies it.

```ts
string
```

**Consumer example — source-only fragment:**

```ts
const delivery: EffectDeliveryId = 'delivery-1';
```

Source: [EffectDeliveryId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L32-L32).

Owning schema: [#/$defs/effectDeliveryId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/effectDeliveryId | `{"description":"The original public adapter dependency delivery token: nonblank and at most 512 characters. Observer delivery contracts remain opaque IDs.","type":"string","minLength":1,"maxLength":512,"pattern":"\\S"}` | [#/$defs/effectDeliveryId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L102-L108) |

## EffectIdempotencyKey

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Key used to detect a repeated effect request. The schema accepts compact opaque IDs and the exact historical adapter dependency key grammar. New dependency producers use compact opaque IDs. Reuse with different request identity or payload is a conflict, not permission to perform another effect.

```ts
string
```

**Consumer example — source-only fragment:**

```ts
const key: EffectIdempotencyKey = 'effect1';
```

Source: [EffectIdempotencyKey](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L28-L28).

Owning schema: [#/$defs/effectIdempotencyKey](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/effectIdempotencyKey | `{"description":"Existing opaque keys, plus the exact historical adapter dependency producer grammar. Package/capability names retain their 160-character bounds and registration its 96-character bound. New dependency keys are compact opaque IDs."}` | [#/$defs/effectIdempotencyKey](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L82-L91) |
| #/$defs/effectIdempotencyKey/anyOf/0 | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/effectIdempotencyKey/anyOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L85-L85) |
| #/$defs/effectIdempotencyKey/anyOf/1 | `{"type":"string","pattern":"^adapter:(?=[^:]{1,160}:)[a-z0-9]+(?:[._-][a-z0-9]+)+:(?=[^:]{1,96}:)[a-z0-9]+(?:[._-][a-z0-9]+)*:(?=[^:]{1,160}:)[a-z0-9]+(?:[._-][a-z0-9]+)+:[a-f0-9]{64}(?::parent:[a-f0-9]{64})?$"}` | [#/$defs/effectIdempotencyKey/anyOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L86-L89) |

Referenced types:

- `OpaqueId`

## EffectJournal

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Persistence interface: record requested effects, atomically accept them with a boolean result, record completed receipts and look up requests/receipts by idempotencyKey. Missing lookups resolve to undefined. This interface supplies no storage backend, retention policy or universal retry safety.

```ts
EffectJournal
```

**Consumer example — source-only fragment:**

```ts
const prior = await journal.receipt(key);
```

Source: [EffectJournal](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L113-L119).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| requested | no | no | `requested(request: EffectRequest): Promise<void>;` | [requested](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L114-L114) |
| accepted | no | no | `accepted(request: EffectRequest): Promise<boolean>;` | [accepted](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L115-L115) |
| completed | no | no | `completed(receipt: EffectReceipt): Promise<void>;` | [completed](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L116-L116) |
| request | no | no | `request(idempotencyKey: string): Promise<EffectRequest \| undefined>;` | [request](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L117-L117) |
| receipt | no | no | `receipt(idempotencyKey: string): Promise<EffectReceipt \| undefined>;` | [receipt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L118-L118) |

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `EffectReceipt`
- `EffectRequest`
- `Promise`

## EffectReceipt

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Durable effect status and resolved adapter provenance. accepted has neither result nor error; failed requires error and forbids result; completed forbids error and may contain result. These conditional rules are in the schema even though the TypeScript interface allows optional members.

```ts
{ [k: string]: any; } & { schemaVersion: "effect-receipt.v2"; effectId: OpaqueId; idempotencyKey: EffectIdempotencyKey; adapter: PackageResolution; status: "accepted" | "completed" | "failed"; result?: JsonObject; error?: Reason; recordedAt: string; }
```

**Consumer example — source-only fragment:**

```ts
const status: EffectReceipt['status'] = 'completed';
```

Source: [EffectReceipt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L152-L163).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| [index] | no | no | `[k: string]: any;` | [skills/common/plugin-runtime/sdk/src/generated/contracts.ts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L153-L153) |
| schemaVersion | no | no | `schemaVersion: 'effect-receipt.v2';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L155-L155) |
| effectId | no | no | `effectId: OpaqueId;` | [effectId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L156-L156) |
| idempotencyKey | no | no | `idempotencyKey: EffectIdempotencyKey;` | [idempotencyKey](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L157-L157) |
| adapter | no | no | `adapter: PackageResolution;` | [adapter](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L158-L158) |
| status | no | no | `status: 'accepted' \| 'completed' \| 'failed';` | [status](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L159-L159) |
| result | yes | no | `result?: JsonObject;` | [result](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L160-L160) |
| error | yes | no | `error?: Reason;` | [error](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L161-L161) |
| recordedAt | no | no | `recordedAt: string;` | [recordedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L162-L162) |

Owning schema: [#/$defs/effectReceipt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/effectReceipt | `{"type":"object","additionalProperties":false,"required":["schemaVersion","effectId","idempotencyKey","adapter","status","recordedAt"]}` | [#/$defs/effectReceipt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L704-L746) |
| #/$defs/effectReceipt/properties/schemaVersion | `{"const":"effect-receipt.v2"}` | [#/$defs/effectReceipt/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L712-L712) |
| #/$defs/effectReceipt/properties/effectId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/effectReceipt/properties/effectId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L713-L713) |
| #/$defs/effectReceipt/properties/idempotencyKey | `{"$ref":"#/$defs/effectIdempotencyKey"}` | [#/$defs/effectReceipt/properties/idempotencyKey](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L714-L714) |
| #/$defs/effectReceipt/properties/adapter | `{"$ref":"#/$defs/packageResolution"}` | [#/$defs/effectReceipt/properties/adapter](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L715-L715) |
| #/$defs/effectReceipt/properties/status | `{"enum":["accepted","completed","failed"]}` | [#/$defs/effectReceipt/properties/status](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L716-L716) |
| #/$defs/effectReceipt/properties/result | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/effectReceipt/properties/result](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L717-L717) |
| #/$defs/effectReceipt/properties/error | `{"$ref":"#/$defs/reason"}` | [#/$defs/effectReceipt/properties/error](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L718-L718) |
| #/$defs/effectReceipt/properties/recordedAt | `{"type":"string","format":"date-time"}` | [#/$defs/effectReceipt/properties/recordedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L719-L719) |
| #/$defs/effectReceipt/allOf/0 | `{}` | [#/$defs/effectReceipt/allOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L722-L729) |
| #/$defs/effectReceipt/allOf/0/if | `{"required":["status"]}` | [#/$defs/effectReceipt/allOf/0/if](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L723-L723) |
| #/$defs/effectReceipt/allOf/0/if/properties/status | `{"const":"failed"}` | [#/$defs/effectReceipt/allOf/0/if/properties/status](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L723-L723) |
| #/$defs/effectReceipt/allOf/0/then | `{"required":["error"]}` | [#/$defs/effectReceipt/allOf/0/then](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L724-L728) |
| #/$defs/effectReceipt/allOf/0/then/properties/error | `{}` | [#/$defs/effectReceipt/allOf/0/then/properties/error](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L725-L725) |
| #/$defs/effectReceipt/allOf/0/then/not | `{"required":["result"]}` | [#/$defs/effectReceipt/allOf/0/then/not](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L727-L727) |
| #/$defs/effectReceipt/allOf/0/then/not/properties/result | `{}` | [#/$defs/effectReceipt/allOf/0/then/not/properties/result](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L727-L727) |
| #/$defs/effectReceipt/allOf/1 | `{}` | [#/$defs/effectReceipt/allOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L730-L733) |
| #/$defs/effectReceipt/allOf/1/if | `{"required":["status"]}` | [#/$defs/effectReceipt/allOf/1/if](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L731-L731) |
| #/$defs/effectReceipt/allOf/1/if/properties/status | `{"const":"completed"}` | [#/$defs/effectReceipt/allOf/1/if/properties/status](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L731-L731) |
| #/$defs/effectReceipt/allOf/1/then | `{}` | [#/$defs/effectReceipt/allOf/1/then](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L732-L732) |
| #/$defs/effectReceipt/allOf/1/then/not | `{"required":["error"]}` | [#/$defs/effectReceipt/allOf/1/then/not](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L732-L732) |
| #/$defs/effectReceipt/allOf/1/then/not/properties/error | `{}` | [#/$defs/effectReceipt/allOf/1/then/not/properties/error](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L732-L732) |
| #/$defs/effectReceipt/allOf/2 | `{}` | [#/$defs/effectReceipt/allOf/2](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L734-L744) |
| #/$defs/effectReceipt/allOf/2/if | `{"required":["status"]}` | [#/$defs/effectReceipt/allOf/2/if](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L735-L735) |
| #/$defs/effectReceipt/allOf/2/if/properties/status | `{"const":"accepted"}` | [#/$defs/effectReceipt/allOf/2/if/properties/status](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L735-L735) |
| #/$defs/effectReceipt/allOf/2/then | `{}` | [#/$defs/effectReceipt/allOf/2/then](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L736-L743) |
| #/$defs/effectReceipt/allOf/2/then/not | `{}` | [#/$defs/effectReceipt/allOf/2/then/not](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L737-L742) |
| #/$defs/effectReceipt/allOf/2/then/not/anyOf/0 | `{"required":["result"]}` | [#/$defs/effectReceipt/allOf/2/then/not/anyOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L739-L739) |
| #/$defs/effectReceipt/allOf/2/then/not/anyOf/0/properties/result | `{}` | [#/$defs/effectReceipt/allOf/2/then/not/anyOf/0/properties/result](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L739-L739) |
| #/$defs/effectReceipt/allOf/2/then/not/anyOf/1 | `{"required":["error"]}` | [#/$defs/effectReceipt/allOf/2/then/not/anyOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L740-L740) |
| #/$defs/effectReceipt/allOf/2/then/not/anyOf/1/properties/error | `{}` | [#/$defs/effectReceipt/allOf/2/then/not/anyOf/1/properties/error](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L740-L740) |

Referenced types:

- `EffectIdempotencyKey`
- `JsonObject`
- `OpaqueId`
- `PackageResolution`
- `Reason`

## EffectRequest

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Admitted effect envelope binds idempotency, attempt, capability, operation, resource and payload with a request time. Optional deliveryId belongs to dependency identity. Tagged runtime dispatch restricts capability, operation and resource type. Do not manufacture a request to bypass lease admission or fencing.

```ts
{ [k: string]: any; } & { runtimeDispatchProfile?: RuntimeDispatchProfile; schemaVersion: "effect-request.v2"; effectId: OpaqueId; idempotencyKey: EffectIdempotencyKey; deliveryId?: EffectDeliveryId; attempt: EffectAttemptIdentity; capability: NamespacedId; operation: LocalId; resource: ResourceIdentity; payload: JsonObject; requestedAt: string; }
```

**Consumer example — source-only fragment:**

```ts
const operation: EffectRequest['operation'] = 'dispatch';
```

Source: [EffectRequest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L137-L151).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| [index] | no | no | `[k: string]: any;` | [skills/common/plugin-runtime/sdk/src/generated/contracts.ts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L138-L138) |
| runtimeDispatchProfile | yes | no | `runtimeDispatchProfile?: RuntimeDispatchProfile;` | [runtimeDispatchProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L140-L140) |
| schemaVersion | no | no | `schemaVersion: 'effect-request.v2';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L141-L141) |
| effectId | no | no | `effectId: OpaqueId;` | [effectId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L142-L142) |
| idempotencyKey | no | no | `idempotencyKey: EffectIdempotencyKey;` | [idempotencyKey](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L143-L143) |
| deliveryId | yes | no | `deliveryId?: EffectDeliveryId;` | [deliveryId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L144-L144) |
| attempt | no | no | `attempt: EffectAttemptIdentity;` | [attempt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L145-L145) |
| capability | no | no | `capability: NamespacedId;` | [capability](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L146-L146) |
| operation | no | no | `operation: LocalId;` | [operation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L147-L147) |
| resource | no | no | `resource: ResourceIdentity;` | [resource](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L148-L148) |
| payload | no | no | `payload: JsonObject;` | [payload](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L149-L149) |
| requestedAt | no | no | `requestedAt: string;` | [requestedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L150-L150) |

Owning schema: [#/$defs/effectRequest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/effectRequest | `{"type":"object","additionalProperties":false,"required":["schemaVersion","effectId","idempotencyKey","attempt","capability","operation","resource","payload","requestedAt"]}` | [#/$defs/effectRequest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L679-L703) |
| #/$defs/effectRequest/properties/runtimeDispatchProfile | `{"$ref":"#/$defs/runtimeDispatchProfile"}` | [#/$defs/effectRequest/properties/runtimeDispatchProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L687-L687) |
| #/$defs/effectRequest/properties/schemaVersion | `{"const":"effect-request.v2"}` | [#/$defs/effectRequest/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L688-L688) |
| #/$defs/effectRequest/properties/effectId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/effectRequest/properties/effectId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L689-L689) |
| #/$defs/effectRequest/properties/idempotencyKey | `{"$ref":"#/$defs/effectIdempotencyKey"}` | [#/$defs/effectRequest/properties/idempotencyKey](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L690-L690) |
| #/$defs/effectRequest/properties/deliveryId | `{"$ref":"#/$defs/effectDeliveryId"}` | [#/$defs/effectRequest/properties/deliveryId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L691-L691) |
| #/$defs/effectRequest/properties/attempt | `{"$ref":"#/$defs/effectAttemptIdentity"}` | [#/$defs/effectRequest/properties/attempt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L692-L692) |
| #/$defs/effectRequest/properties/capability | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/effectRequest/properties/capability](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L693-L693) |
| #/$defs/effectRequest/properties/operation | `{"$ref":"#/$defs/localId"}` | [#/$defs/effectRequest/properties/operation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L694-L694) |
| #/$defs/effectRequest/properties/resource | `{"$ref":"#/$defs/resourceIdentity"}` | [#/$defs/effectRequest/properties/resource](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L695-L695) |
| #/$defs/effectRequest/properties/payload | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/effectRequest/properties/payload](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L696-L696) |
| #/$defs/effectRequest/properties/requestedAt | `{"type":"string","format":"date-time"}` | [#/$defs/effectRequest/properties/requestedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L697-L697) |
| #/$defs/effectRequest/allOf/0 | `{}` | [#/$defs/effectRequest/allOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L699-L702) |
| #/$defs/effectRequest/allOf/0/if | `{"required":["runtimeDispatchProfile"]}` | [#/$defs/effectRequest/allOf/0/if](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L700-L700) |
| #/$defs/effectRequest/allOf/0/if/properties/runtimeDispatchProfile | `true` | [#/$defs/effectRequest/allOf/0/if/properties/runtimeDispatchProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L700-L700) |
| #/$defs/effectRequest/allOf/0/then | `{}` | [#/$defs/effectRequest/allOf/0/then](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L701-L701) |
| #/$defs/effectRequest/allOf/0/then/properties/capability | `{"const":"runtime.dispatch"}` | [#/$defs/effectRequest/allOf/0/then/properties/capability](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L701-L701) |
| #/$defs/effectRequest/allOf/0/then/properties/operation | `{"const":"dispatch"}` | [#/$defs/effectRequest/allOf/0/then/properties/operation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L701-L701) |
| #/$defs/effectRequest/allOf/0/then/properties/resource | `{"type":"object"}` | [#/$defs/effectRequest/allOf/0/then/properties/resource](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L701-L701) |
| #/$defs/effectRequest/allOf/0/then/properties/resource/properties/type | `{"const":"runtime.agent"}` | [#/$defs/effectRequest/allOf/0/then/properties/resource/properties/type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L701-L701) |

Referenced types:

- `EffectAttemptIdentity`
- `EffectDeliveryId`
- `EffectIdempotencyKey`
- `JsonObject`
- `LocalId`
- `NamespacedId`
- `OpaqueId`
- `ResourceIdentity`
- `RuntimeDispatchProfile`

## EventIdentity

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Run ID is required; stage, attempt, effect, wait and artifact IDs are optional links. Omission means the event does not carry that link. It does not mean that a missing value should be copied from an unrelated event.

```ts
EventIdentity
```

**Consumer example — source-only fragment:**

```ts
const identity: EventIdentity = {runId:'run1'};
```

Source: [EventIdentity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L597-L604).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| runId | no | no | `runId: OpaqueId;` | [runId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L598-L598) |
| stageId | yes | no | `stageId?: LocalId;` | [stageId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L599-L599) |
| attemptId | yes | no | `attemptId?: OpaqueId;` | [attemptId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L600-L600) |
| effectId | yes | no | `effectId?: OpaqueId;` | [effectId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L601-L601) |
| waitId | yes | no | `waitId?: OpaqueId;` | [waitId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L602-L602) |
| artifactId | yes | no | `artifactId?: OpaqueId;` | [artifactId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L603-L603) |

Owning schema: [#/$defs/eventIdentity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/eventIdentity | `{"type":"object","additionalProperties":false,"required":["runId"]}` | [#/$defs/eventIdentity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1013-L1025) |
| #/$defs/eventIdentity/properties/runId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/eventIdentity/properties/runId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1018-L1018) |
| #/$defs/eventIdentity/properties/stageId | `{"$ref":"#/$defs/localId"}` | [#/$defs/eventIdentity/properties/stageId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1019-L1019) |
| #/$defs/eventIdentity/properties/attemptId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/eventIdentity/properties/attemptId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1020-L1020) |
| #/$defs/eventIdentity/properties/effectId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/eventIdentity/properties/effectId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1021-L1021) |
| #/$defs/eventIdentity/properties/waitId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/eventIdentity/properties/waitId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1022-L1022) |
| #/$defs/eventIdentity/properties/artifactId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/eventIdentity/properties/artifactId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1023-L1023) |

Referenced types:

- `LocalId`
- `OpaqueId`

## InvocationLease

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Core-owned active or revoked invocation authority. Contains attempt, registration, grants, resource limits and issue/expiry times. Revoked leases require revokedAt and revocationReason in the schema. An active status string is not sufficient: runtime checks the current revocable lease before calls.

```ts
{ [k: string]: any; } & { schemaVersion: "invocation-lease.v2"; leaseId: OpaqueId; attempt: AttemptIdentity; registration: RegistrationProvenance; status: "active" | "revoked"; grants: CapabilityGrant[]; limits: { wallTimeMs: number; memoryBytes: number; cpuMillis: number; }; issuedAt: string; expiresAt: string; revokedAt?: string; revocationReason?: Reason; }
```

**Consumer example — source-only fragment:**

```ts
const status: InvocationLease['status'] = 'active';
```

Source: [InvocationLease](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L209-L227).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| [index] | no | no | `[k: string]: any;` | [skills/common/plugin-runtime/sdk/src/generated/contracts.ts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L210-L210) |
| schemaVersion | no | no | `schemaVersion: 'invocation-lease.v2';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L212-L212) |
| leaseId | no | no | `leaseId: OpaqueId;` | [leaseId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L213-L213) |
| attempt | no | no | `attempt: AttemptIdentity;` | [attempt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L214-L214) |
| registration | no | no | `registration: RegistrationProvenance;` | [registration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L215-L215) |
| status | no | no | `status: 'active' \| 'revoked';` | [status](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L216-L216) |
| grants | no | no | `grants: CapabilityGrant[];` | [grants](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L217-L217) |
| limits | no | no | `limits: {     wallTimeMs: number;     memoryBytes: number;     cpuMillis: number;   };` | [limits](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L218-L222) |
| limits.wallTimeMs | no | no | `wallTimeMs: number;` | [wallTimeMs](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L219-L219) |
| limits.memoryBytes | no | no | `memoryBytes: number;` | [memoryBytes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L220-L220) |
| limits.cpuMillis | no | no | `cpuMillis: number;` | [cpuMillis](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L221-L221) |
| issuedAt | no | no | `issuedAt: string;` | [issuedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L223-L223) |
| expiresAt | no | no | `expiresAt: string;` | [expiresAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L224-L224) |
| revokedAt | yes | no | `revokedAt?: string;` | [revokedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L225-L225) |
| revocationReason | yes | no | `revocationReason?: Reason;` | [revocationReason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L226-L226) |

Owning schema: [#/$defs/invocationLease](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/invocationLease | `{"type":"object","additionalProperties":false,"required":["schemaVersion","leaseId","attempt","registration","status","grants","limits","issuedAt","expiresAt"]}` | [#/$defs/invocationLease](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L942-L982) |
| #/$defs/invocationLease/properties/schemaVersion | `{"const":"invocation-lease.v2"}` | [#/$defs/invocationLease/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L950-L950) |
| #/$defs/invocationLease/properties/leaseId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/invocationLease/properties/leaseId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L951-L951) |
| #/$defs/invocationLease/properties/attempt | `{"$ref":"#/$defs/attemptIdentity"}` | [#/$defs/invocationLease/properties/attempt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L952-L952) |
| #/$defs/invocationLease/properties/registration | `{"$ref":"#/$defs/registrationProvenance"}` | [#/$defs/invocationLease/properties/registration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L953-L953) |
| #/$defs/invocationLease/properties/status | `{"enum":["active","revoked"]}` | [#/$defs/invocationLease/properties/status](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L954-L954) |
| #/$defs/invocationLease/properties/grants | `{"type":"array","uniqueItems":true}` | [#/$defs/invocationLease/properties/grants](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L955-L959) |
| #/$defs/invocationLease/properties/grants/items | `{"$ref":"#/$defs/capabilityGrant"}` | [#/$defs/invocationLease/properties/grants/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L957-L957) |
| #/$defs/invocationLease/properties/limits | `{"type":"object","additionalProperties":false,"required":["wallTimeMs","memoryBytes","cpuMillis"]}` | [#/$defs/invocationLease/properties/limits](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L960-L969) |
| #/$defs/invocationLease/properties/limits/properties/wallTimeMs | `{"type":"integer","minimum":1}` | [#/$defs/invocationLease/properties/limits/properties/wallTimeMs](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L965-L965) |
| #/$defs/invocationLease/properties/limits/properties/memoryBytes | `{"type":"integer","minimum":1}` | [#/$defs/invocationLease/properties/limits/properties/memoryBytes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L966-L966) |
| #/$defs/invocationLease/properties/limits/properties/cpuMillis | `{"type":"integer","minimum":1}` | [#/$defs/invocationLease/properties/limits/properties/cpuMillis](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L967-L967) |
| #/$defs/invocationLease/properties/issuedAt | `{"type":"string","format":"date-time"}` | [#/$defs/invocationLease/properties/issuedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L970-L970) |
| #/$defs/invocationLease/properties/expiresAt | `{"type":"string","format":"date-time"}` | [#/$defs/invocationLease/properties/expiresAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L971-L971) |
| #/$defs/invocationLease/properties/revokedAt | `{"type":"string","format":"date-time"}` | [#/$defs/invocationLease/properties/revokedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L972-L972) |
| #/$defs/invocationLease/properties/revocationReason | `{"$ref":"#/$defs/reason"}` | [#/$defs/invocationLease/properties/revocationReason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L973-L973) |
| #/$defs/invocationLease/allOf/0 | `{}` | [#/$defs/invocationLease/allOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L975-L981) |
| #/$defs/invocationLease/allOf/0/if | `{"required":["status"]}` | [#/$defs/invocationLease/allOf/0/if](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L976-L976) |
| #/$defs/invocationLease/allOf/0/if/properties/status | `{"const":"revoked"}` | [#/$defs/invocationLease/allOf/0/if/properties/status](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L976-L976) |
| #/$defs/invocationLease/allOf/0/then | `{"required":["revokedAt","revocationReason"]}` | [#/$defs/invocationLease/allOf/0/then](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L977-L980) |
| #/$defs/invocationLease/allOf/0/then/properties/revokedAt | `true` | [#/$defs/invocationLease/allOf/0/then/properties/revokedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L978-L978) |
| #/$defs/invocationLease/allOf/0/then/properties/revocationReason | `true` | [#/$defs/invocationLease/allOf/0/then/properties/revocationReason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L978-L978) |

Referenced types:

- `AttemptIdentity`
- `CapabilityGrant`
- `OpaqueId`
- `Reason`
- `RegistrationProvenance`

## JsonObject

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Generated open object shape. Arbitrary property values remain any in TypeScript; this does not guarantee the strict JSON value domain used by canonicalJson and portableJson. Validate at the owning boundary before serialization.

```ts
JsonObject
```

**Consumer example — source-only fragment:**

```ts
const payload: JsonObject = {enabled:true};
```

Source: [JsonObject](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L295-L297).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| [index] | no | no | `[k: string]: any;` | [skills/common/plugin-runtime/sdk/src/generated/contracts.ts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L296-L296) |

Owning schema: [#/$defs/jsonObject](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/jsonObject | `{"type":"object"}` | [#/$defs/jsonObject](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L146-L148) |

## LifecycleEvent

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Core lifecycle event with a closed event-type enum, sequence, identity, time, payload and nullable causationId. Sequence starts at one in the schema. null causation is allowed; omission is not. Observer code receives this or PluginDomainEvent, not an unversioned message.

```ts
LifecycleEvent
```

**Consumer example — source-only fragment:**

```ts
const type: LifecycleEvent['type'] = 'stage.started';
```

Source: [LifecycleEvent](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L605-L645).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| schemaVersion | no | no | `schemaVersion: 'lifecycle-event.v2';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L606-L606) |
| eventId | no | no | `eventId: OpaqueId;` | [eventId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L607-L607) |
| sequence | no | no | `sequence: number;` | [sequence](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L608-L608) |
| type | no | no | `type:     \| 'run.created'     \| 'run.started'     \| 'run.resumed'     \| 'run.waiting'     \| 'run.paused'     \| 'run.succeeded'     \| 'run.failed'     \| 'run.blocked'     \| 'run.cancelled'     \| 'stage.scheduled'     \| 'stage.started'     \| 'stage.waiting'     \| 'stage.retrying'     \| 'stage.skipped'     \| 'stage.succeeded'     \| 'stage.failed'     \| 'stage.blocked'     \| 'stage.cancelled'     \| 'attempt.created'     \| 'attempt.dispatched'     \| 'attempt.completed'     \| 'attempt.timed_out'     \| 'attempt.cancelled'     \| 'effect.requested'     \| 'effect.accepted'     \| 'effect.completed'     \| 'effect.failed'     \| 'artifact.created'     \| 'wait.created'     \| 'wait.resolved'     \| 'orchestrator.required';` | [type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L609-L640) |
| identity | no | no | `identity: EventIdentity;` | [identity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L641-L641) |
| occurredAt | no | no | `occurredAt: string;` | [occurredAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L642-L642) |
| causationId | no | no | `causationId: OpaqueId \| null;` | [causationId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L643-L643) |
| payload | no | no | `payload: JsonObject;` | [payload](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L644-L644) |

Owning schema: [#/$defs/lifecycleEvent](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/lifecycleEvent | `{"type":"object","additionalProperties":false,"required":["schemaVersion","eventId","sequence","type","identity","occurredAt","causationId","payload"]}` | [#/$defs/lifecycleEvent](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1026-L1057) |
| #/$defs/lifecycleEvent/properties/schemaVersion | `{"const":"lifecycle-event.v2"}` | [#/$defs/lifecycleEvent/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1034-L1034) |
| #/$defs/lifecycleEvent/properties/eventId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/lifecycleEvent/properties/eventId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1035-L1035) |
| #/$defs/lifecycleEvent/properties/sequence | `{"type":"integer","minimum":1}` | [#/$defs/lifecycleEvent/properties/sequence](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1036-L1036) |
| #/$defs/lifecycleEvent/properties/type | `{"enum":["run.created","run.started","run.resumed","run.waiting","run.paused","run.succeeded","run.failed","run.blocked","run.cancelled","stage.scheduled","stage.started","stage.waiting","stage.retrying","stage.skipped","stage.succeeded","stage.failed","stage.blocked","stage.cancelled","attempt.created","attempt.dispatched","attempt.completed","attempt.timed_out","attempt.cancelled","effect.requested","effect.accepted","effect.completed","effect.failed","artifact.created","wait.created","wait.resolved","orchestrator.required"]}` | [#/$defs/lifecycleEvent/properties/type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1037-L1049) |
| #/$defs/lifecycleEvent/properties/identity | `{"$ref":"#/$defs/eventIdentity"}` | [#/$defs/lifecycleEvent/properties/identity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1050-L1050) |
| #/$defs/lifecycleEvent/properties/occurredAt | `{"type":"string","format":"date-time"}` | [#/$defs/lifecycleEvent/properties/occurredAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1051-L1051) |
| #/$defs/lifecycleEvent/properties/causationId | `{}` | [#/$defs/lifecycleEvent/properties/causationId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1052-L1054) |
| #/$defs/lifecycleEvent/properties/causationId/oneOf/0 | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/lifecycleEvent/properties/causationId/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1053-L1053) |
| #/$defs/lifecycleEvent/properties/causationId/oneOf/1 | `{"type":"null"}` | [#/$defs/lifecycleEvent/properties/causationId/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1053-L1053) |
| #/$defs/lifecycleEvent/properties/payload | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/lifecycleEvent/properties/payload](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1055-L1055) |

Referenced types:

- `EventIdentity`
- `JsonObject`
- `OpaqueId`

## LocalId

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Local registration/stage identifier. Schema permits lowercase alphanumeric segments separated by dot, underscore or hyphen, at most 96 characters. Unlike NamespacedId, a separator is not required.

```ts
string
```

**Consumer example — source-only fragment:**

```ts
const id: LocalId = 'main';
```

Source: [LocalId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L41-L41).

Owning schema: [#/$defs/localId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/localId | `{"type":"string","pattern":"^[a-z0-9]+(?:[._-][a-z0-9]+)*$","maxLength":96}` | [#/$defs/localId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L73-L77) |

## NamespacedId

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Namespaced identifier such as a capability or stage type. The schema requires at least two lowercase alphanumeric segments separated by dot, underscore or hyphen, at most 160 characters. The TypeScript string alias does not enforce this.

```ts
string
```

**Consumer example — source-only fragment:**

```ts
const name: NamespacedId = 'example.read';
```

Source: [NamespacedId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L23-L23).

Owning schema: [#/$defs/namespacedId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/namespacedId | `{"type":"string","pattern":"^[a-z0-9]+(?:[._-][a-z0-9]+)+$","maxLength":160}` | [#/$defs/namespacedId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L68-L72) |

## ObserverCheckpoint

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Observer progress record binds registration, run, sequence, event ID and update time. Sequence may be zero; eventId may be null but is required. The type does not persist or advance the checkpoint.

```ts
ObserverCheckpoint
```

**Consumer example — source-only fragment:**

```ts
const sequence: ObserverCheckpoint['sequence'] = 0;
```

Source: [ObserverCheckpoint](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L665-L672).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| schemaVersion | no | no | `schemaVersion: 'observer-checkpoint.v2';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L666-L666) |
| observer | no | no | `observer: RegistrationProvenance;` | [observer](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L667-L667) |
| runId | no | no | `runId: OpaqueId;` | [runId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L668-L668) |
| sequence | no | no | `sequence: number;` | [sequence](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L669-L669) |
| eventId | no | no | `eventId: OpaqueId \| null;` | [eventId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L670-L670) |
| updatedAt | no | no | `updatedAt: string;` | [updatedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L671-L671) |

Owning schema: [#/$defs/observerCheckpoint](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/observerCheckpoint | `{"type":"object","additionalProperties":false,"required":["schemaVersion","observer","runId","sequence","eventId","updatedAt"]}` | [#/$defs/observerCheckpoint](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1100-L1116) |
| #/$defs/observerCheckpoint/properties/schemaVersion | `{"const":"observer-checkpoint.v2"}` | [#/$defs/observerCheckpoint/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1107-L1107) |
| #/$defs/observerCheckpoint/properties/observer | `{"$ref":"#/$defs/registrationProvenance"}` | [#/$defs/observerCheckpoint/properties/observer](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1108-L1108) |
| #/$defs/observerCheckpoint/properties/runId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/observerCheckpoint/properties/runId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1109-L1109) |
| #/$defs/observerCheckpoint/properties/sequence | `{"type":"integer","minimum":0}` | [#/$defs/observerCheckpoint/properties/sequence](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1110-L1110) |
| #/$defs/observerCheckpoint/properties/eventId | `{}` | [#/$defs/observerCheckpoint/properties/eventId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1111-L1113) |
| #/$defs/observerCheckpoint/properties/eventId/oneOf/0 | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/observerCheckpoint/properties/eventId/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1112-L1112) |
| #/$defs/observerCheckpoint/properties/eventId/oneOf/1 | `{"type":"null"}` | [#/$defs/observerCheckpoint/properties/eventId/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1112-L1112) |
| #/$defs/observerCheckpoint/properties/updatedAt | `{"type":"string","format":"date-time"}` | [#/$defs/observerCheckpoint/properties/updatedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1114-L1114) |

Referenced types:

- `OpaqueId`
- `RegistrationProvenance`

## ObserverDelivery

Import: `@kubeclaw/plugin-sdk`. Kind: type.

One observer delivery attempt links observer provenance and a lifecycle or plugin event. attemptNumber is at least one. Observer handlers must account for at-least-once delivery; this envelope is not an exactly-once guarantee.

```ts
ObserverDelivery
```

**Consumer example — source-only fragment:**

```ts
const attempt: ObserverDelivery['attemptNumber'] = 1;
```

Source: [ObserverDelivery](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L657-L664).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| schemaVersion | no | no | `schemaVersion: 'observer-delivery.v2';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L658-L658) |
| deliveryId | no | no | `deliveryId: OpaqueId;` | [deliveryId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L659-L659) |
| observer | no | no | `observer: RegistrationProvenance;` | [observer](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L660-L660) |
| attemptNumber | no | no | `attemptNumber: number;` | [attemptNumber](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L661-L661) |
| event | no | no | `event: LifecycleEvent \| PluginDomainEvent;` | [event](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L662-L662) |
| deliveredAt | no | no | `deliveredAt: string;` | [deliveredAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L663-L663) |

Owning schema: [#/$defs/observerDelivery](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/observerDelivery | `{"type":"object","additionalProperties":false,"required":["schemaVersion","deliveryId","observer","attemptNumber","event","deliveredAt"]}` | [#/$defs/observerDelivery](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1079-L1099) |
| #/$defs/observerDelivery/properties/schemaVersion | `{"const":"observer-delivery.v2"}` | [#/$defs/observerDelivery/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1087-L1087) |
| #/$defs/observerDelivery/properties/deliveryId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/observerDelivery/properties/deliveryId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1088-L1088) |
| #/$defs/observerDelivery/properties/observer | `{"$ref":"#/$defs/registrationProvenance"}` | [#/$defs/observerDelivery/properties/observer](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1089-L1089) |
| #/$defs/observerDelivery/properties/attemptNumber | `{"type":"integer","minimum":1}` | [#/$defs/observerDelivery/properties/attemptNumber](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1090-L1090) |
| #/$defs/observerDelivery/properties/event | `{}` | [#/$defs/observerDelivery/properties/event](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1091-L1096) |
| #/$defs/observerDelivery/properties/event/oneOf/0 | `{"$ref":"#/$defs/lifecycleEvent"}` | [#/$defs/observerDelivery/properties/event/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1093-L1093) |
| #/$defs/observerDelivery/properties/event/oneOf/1 | `{"$ref":"#/$defs/pluginDomainEvent"}` | [#/$defs/observerDelivery/properties/event/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1094-L1094) |
| #/$defs/observerDelivery/properties/deliveredAt | `{"type":"string","format":"date-time"}` | [#/$defs/observerDelivery/properties/deliveredAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1097-L1097) |

Referenced types:

- `LifecycleEvent`
- `OpaqueId`
- `PluginDomainEvent`
- `RegistrationProvenance`

## ObserverHandler

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Async callback receives delivery and plugin invocation context and resolves with no result. A thrown or rejected error is an observer failure for the runtime policy. Use the context for granted effects; a callback does not create its own lease.

```ts
(delivery: ObserverDelivery, context: PluginInvocationContext): Promise<void>
```

**Consumer example — source-only fragment:**

```ts
const handler: ObserverHandler = async (delivery, context) => { const run = delivery.event.identity.runId; };
```

Source: [ObserverHandler](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L108-L111).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `ObserverDelivery`
- `PluginInvocationContext`
- `Promise`

## ObserverRegistration

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Manifest callback entry declares subscriptions, at_least_once delivery, per_run ordering, failure mode and bounded attempts/backoff/timeout. At least one subscription is required. Checkpoint/config schemas and required capabilities are explicit; no failure policy default is declared here.

```ts
ObserverRegistration
```

**Consumer example — source-only fragment:**

```ts
const ordering: ObserverRegistration['ordering'] = 'per_run';
```

Source: [ObserverRegistration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L355-L374).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| id | no | no | `id: LocalId;` | [id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L356-L356) |
| module | no | no | `module: RelativeModulePath;` | [module](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L357-L357) |
| export | no | no | `export: string;` | [export](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L358-L358) |
| subscriptions | no | no | `subscriptions: [NamespacedId, ...NamespacedId[]];` | [subscriptions](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L362-L362) |
| delivery | no | no | `delivery: 'at_least_once';` | [delivery](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L363-L363) |
| ordering | no | no | `ordering: 'per_run';` | [ordering](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L364-L364) |
| failurePolicy | no | no | `failurePolicy: {     mode: 'best_effort' \| 'required';     maxAttempts: number;     backoffMs: number;     timeoutMs: number;   };` | [failurePolicy](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L365-L370) |
| failurePolicy.mode | no | no | `mode: 'best_effort' \| 'required';` | [mode](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L366-L366) |
| failurePolicy.maxAttempts | no | no | `maxAttempts: number;` | [maxAttempts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L367-L367) |
| failurePolicy.backoffMs | no | no | `backoffMs: number;` | [backoffMs](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L368-L368) |
| failurePolicy.timeoutMs | no | no | `timeoutMs: number;` | [timeoutMs](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L369-L369) |
| requiredCapabilities | no | no | `requiredCapabilities: NamespacedId[];` | [requiredCapabilities](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L371-L371) |
| configSchema | no | no | `configSchema: RelativeSchemaPath;` | [configSchema](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L372-L372) |
| checkpointSchema | no | no | `checkpointSchema: RelativeSchemaPath;` | [checkpointSchema](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L373-L373) |

Owning schema: [#/$defs/observerRegistration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/observerRegistration | `{"type":"object","additionalProperties":false,"required":["id","module","export","subscriptions","requiredCapabilities","configSchema","checkpointSchema","delivery","ordering","failurePolicy"]}` | [#/$defs/observerRegistration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L216-L254) |
| #/$defs/observerRegistration/properties/id | `{"$ref":"#/$defs/localId"}` | [#/$defs/observerRegistration/properties/id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L224-L224) |
| #/$defs/observerRegistration/properties/module | `{"$ref":"#/$defs/relativeModulePath"}` | [#/$defs/observerRegistration/properties/module](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L225-L225) |
| #/$defs/observerRegistration/properties/export | `{"type":"string","pattern":"^[A-Za-z_$][A-Za-z0-9_$]*$"}` | [#/$defs/observerRegistration/properties/export](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L226-L226) |
| #/$defs/observerRegistration/properties/subscriptions | `{"type":"array","minItems":1,"uniqueItems":true}` | [#/$defs/observerRegistration/properties/subscriptions](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L227-L232) |
| #/$defs/observerRegistration/properties/subscriptions/items | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/observerRegistration/properties/subscriptions/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L231-L231) |
| #/$defs/observerRegistration/properties/delivery | `{"const":"at_least_once"}` | [#/$defs/observerRegistration/properties/delivery](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L233-L233) |
| #/$defs/observerRegistration/properties/ordering | `{"const":"per_run"}` | [#/$defs/observerRegistration/properties/ordering](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L234-L234) |
| #/$defs/observerRegistration/properties/failurePolicy | `{"type":"object","additionalProperties":false,"required":["mode","maxAttempts","backoffMs","timeoutMs"]}` | [#/$defs/observerRegistration/properties/failurePolicy](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L235-L245) |
| #/$defs/observerRegistration/properties/failurePolicy/properties/mode | `{"enum":["best_effort","required"]}` | [#/$defs/observerRegistration/properties/failurePolicy/properties/mode](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L240-L240) |
| #/$defs/observerRegistration/properties/failurePolicy/properties/maxAttempts | `{"type":"integer","minimum":1}` | [#/$defs/observerRegistration/properties/failurePolicy/properties/maxAttempts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L241-L241) |
| #/$defs/observerRegistration/properties/failurePolicy/properties/backoffMs | `{"type":"integer","minimum":0}` | [#/$defs/observerRegistration/properties/failurePolicy/properties/backoffMs](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L242-L242) |
| #/$defs/observerRegistration/properties/failurePolicy/properties/timeoutMs | `{"type":"integer","minimum":1}` | [#/$defs/observerRegistration/properties/failurePolicy/properties/timeoutMs](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L243-L243) |
| #/$defs/observerRegistration/properties/requiredCapabilities | `{"type":"array","uniqueItems":true}` | [#/$defs/observerRegistration/properties/requiredCapabilities](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L246-L250) |
| #/$defs/observerRegistration/properties/requiredCapabilities/items | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/observerRegistration/properties/requiredCapabilities/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L248-L248) |
| #/$defs/observerRegistration/properties/configSchema | `{"$ref":"#/$defs/relativeSchemaPath"}` | [#/$defs/observerRegistration/properties/configSchema](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L251-L251) |
| #/$defs/observerRegistration/properties/checkpointSchema | `{"$ref":"#/$defs/relativeSchemaPath"}` | [#/$defs/observerRegistration/properties/checkpointSchema](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L252-L252) |

Referenced types:

- `LocalId`
- `NamespacedId`
- `RelativeModulePath`
- `RelativeSchemaPath`

## OpaqueId

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Schema identifier begins with an ASCII letter or digit and then permits letters, digits, dot, underscore, colon and hyphen, to 192 characters total. Treat its meaning as owner-defined; do not parse a run or producer from arbitrary text.

```ts
string
```

**Consumer example — source-only fragment:**

```ts
const id: OpaqueId = 'run:1';
```

Source: [OpaqueId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L24-L24).

Owning schema: [#/$defs/opaqueId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/opaqueId | `{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$"}` | [#/$defs/opaqueId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L78-L81) |

## OptionalAbsenceReader

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Zero-argument value reader used by the selector helpers. Readers run in order until the selector accepts a value. Reader exceptions propagate; the alias provides no asynchronous waiting or exception suppression.

```ts
(): T
```

**Consumer example — source-only fragment:**

```ts
const reader: OptionalAbsenceReader<string | undefined> = () => undefined;
```

Source: [OptionalAbsenceReader](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/values.ts#L4-L4).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `T`

## PLUGIN_API_VERSION

Import: `@kubeclaw/plugin-sdk`. Kind: constant.

Literal pipeline-plugin-v2 token for the plugin manifest API version. It is not the package version, Node version, effect schema version or transport encoding.

```ts
"pipeline-plugin-v2"
```

**Consumer example — source-only fragment:**

```ts
const apiVersion = PLUGIN_API_VERSION;
```

Source: [PLUGIN_API_VERSION](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/index.ts#L27-L27).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

## PORTABLE_JSON_ENCODING

Import: `@kubeclaw/plugin-sdk`. Kind: constant.

Exact artifact/source identity tag kubeclaw-json.utf16.v1. It differs from the profile encoding field json-utf16-v1. Select it explicitly for the owning contract; never attach it to historical bytes after the fact.

```ts
"kubeclaw-json.utf16.v1"
```

**Consumer example — source-only fragment:**

```ts
const encoding = PORTABLE_JSON_ENCODING;
```

Source: [PORTABLE_JSON_ENCODING](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/values.ts#L60-L60).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

## PackageIdentity

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Immutable package identity includes plugin ID, pipeline-plugin-v2 API version, package version and content digest. Package version follows the schema version grammar. Identity records exact content; it does not assert a trust decision.

```ts
PackageIdentity
```

**Consumer example — source-only fragment:**

```ts
const api: PackageIdentity['apiVersion'] = PLUGIN_API_VERSION;
```

Source: [PackageIdentity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L332-L337).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| pluginId | no | no | `pluginId: NamespacedId;` | [pluginId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L333-L333) |
| apiVersion | no | no | `apiVersion: 'pipeline-plugin-v2';` | [apiVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L334-L334) |
| packageVersion | no | no | `packageVersion: string;` | [packageVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L335-L335) |
| contentDigest | no | no | `contentDigest: string;` | [contentDigest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L336-L336) |

Owning schema: [#/$defs/packageIdentity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/packageIdentity | `{"type":"object","additionalProperties":false,"required":["pluginId","apiVersion","packageVersion","contentDigest"]}` | [#/$defs/packageIdentity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L159-L175) |
| #/$defs/packageIdentity/properties/pluginId | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/packageIdentity/properties/pluginId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L164-L164) |
| #/$defs/packageIdentity/properties/apiVersion | `{"const":"pipeline-plugin-v2"}` | [#/$defs/packageIdentity/properties/apiVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L165-L165) |
| #/$defs/packageIdentity/properties/packageVersion | `{"type":"string","pattern":"^(0\|[1-9][0-9]*)\\.(0\|[1-9][0-9]*)\\.(0\|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$"}` | [#/$defs/packageIdentity/properties/packageVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L166-L169) |
| #/$defs/packageIdentity/properties/contentDigest | `{"type":"string","pattern":"^sha256:[a-f0-9]{64}$"}` | [#/$defs/packageIdentity/properties/contentDigest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L170-L173) |

Referenced types:

- `NamespacedId`

## PackageProvenance

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Resolved package source, canonical path and explicit trust evidence. Publisher attestation requires attestationDigest. trustScope is a recorded classification, not permission that plugin code can assign to itself. The registry, not this interface, resolves and verifies packages.

```ts
PackageProvenance
```

**Consumer example — source-only fragment:**

```ts
const scope: PackageProvenance['trustScope'] = 'isolated_external';
```

Source: [PackageProvenance](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L556-L569).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| schemaVersion | no | no | `schemaVersion: 'package-provenance.v2';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L557-L557) |
| package | no | no | `package: PackageIdentity;` | [package](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L558-L558) |
| source | no | no | `source: {     type: 'builtin' \| 'local' \| 'git' \| 'registry';     canonicalReference: string;   };` | [source](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L559-L562) |
| source.type | no | no | `type: 'builtin' \| 'local' \| 'git' \| 'registry';` | [type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L560-L560) |
| source.canonicalReference | no | no | `canonicalReference: string;` | [canonicalReference](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L561-L561) |
| canonicalPath | no | no | `canonicalPath: string;` | [canonicalPath](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L563-L563) |
| trustScope | no | no | `trustScope: 'trusted_first_party' \| 'isolated_external';` | [trustScope](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L564-L564) |
| trustEvidence | no | no | `trustEvidence: {     [k: string]: any;   };` | [trustEvidence](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L565-L567) |
| trustEvidence.[index] | no | no | `[k: string]: any;` | [skills/common/plugin-runtime/sdk/src/generated/contracts.ts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L566-L566) |
| resolvedAt | no | no | `resolvedAt: string;` | [resolvedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L568-L568) |

Owning schema: [#/$defs/packageProvenance](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/packageProvenance | `{"type":"object","additionalProperties":false,"required":["schemaVersion","package","source","canonicalPath","trustScope","trustEvidence","resolvedAt"]}` | [#/$defs/packageProvenance](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L874-L920) |
| #/$defs/packageProvenance/properties/schemaVersion | `{"const":"package-provenance.v2"}` | [#/$defs/packageProvenance/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L882-L882) |
| #/$defs/packageProvenance/properties/package | `{"$ref":"#/$defs/packageIdentity"}` | [#/$defs/packageProvenance/properties/package](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L883-L883) |
| #/$defs/packageProvenance/properties/source | `{"type":"object","additionalProperties":false,"required":["type","canonicalReference"]}` | [#/$defs/packageProvenance/properties/source](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L884-L892) |
| #/$defs/packageProvenance/properties/source/properties/type | `{"enum":["builtin","local","git","registry"]}` | [#/$defs/packageProvenance/properties/source/properties/type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L889-L889) |
| #/$defs/packageProvenance/properties/source/properties/canonicalReference | `{"type":"string","minLength":1,"maxLength":2048}` | [#/$defs/packageProvenance/properties/source/properties/canonicalReference](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L890-L890) |
| #/$defs/packageProvenance/properties/canonicalPath | `{"type":"string","pattern":"^/","maxLength":4096}` | [#/$defs/packageProvenance/properties/canonicalPath](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L893-L893) |
| #/$defs/packageProvenance/properties/trustScope | `{"enum":["trusted_first_party","isolated_external"]}` | [#/$defs/packageProvenance/properties/trustScope](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L894-L894) |
| #/$defs/packageProvenance/properties/trustEvidence | `{"type":"object","additionalProperties":false,"required":["method","verifier","verifiedAt"]}` | [#/$defs/packageProvenance/properties/trustEvidence](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L895-L917) |
| #/$defs/packageProvenance/properties/trustEvidence/properties/method | `{"enum":["builtin_allowlist","source_digest_allowlist","publisher_attestation"]}` | [#/$defs/packageProvenance/properties/trustEvidence/properties/method](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L900-L902) |
| #/$defs/packageProvenance/properties/trustEvidence/properties/verifier | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/packageProvenance/properties/trustEvidence/properties/verifier](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L903-L903) |
| #/$defs/packageProvenance/properties/trustEvidence/properties/verifiedAt | `{"type":"string","format":"date-time"}` | [#/$defs/packageProvenance/properties/trustEvidence/properties/verifiedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L904-L904) |
| #/$defs/packageProvenance/properties/trustEvidence/properties/attestationDigest | `{"type":"string","pattern":"^sha256:[a-f0-9]{64}$"}` | [#/$defs/packageProvenance/properties/trustEvidence/properties/attestationDigest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L905-L905) |
| #/$defs/packageProvenance/properties/trustEvidence/allOf/0 | `{}` | [#/$defs/packageProvenance/properties/trustEvidence/allOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L907-L916) |
| #/$defs/packageProvenance/properties/trustEvidence/allOf/0/if | `{"required":["method"]}` | [#/$defs/packageProvenance/properties/trustEvidence/allOf/0/if](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L908-L911) |
| #/$defs/packageProvenance/properties/trustEvidence/allOf/0/if/properties/method | `{"const":"publisher_attestation"}` | [#/$defs/packageProvenance/properties/trustEvidence/allOf/0/if/properties/method](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L909-L909) |
| #/$defs/packageProvenance/properties/trustEvidence/allOf/0/then | `{"required":["attestationDigest"]}` | [#/$defs/packageProvenance/properties/trustEvidence/allOf/0/then](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L912-L915) |
| #/$defs/packageProvenance/properties/trustEvidence/allOf/0/then/properties/attestationDigest | `true` | [#/$defs/packageProvenance/properties/trustEvidence/allOf/0/then/properties/attestationDigest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L913-L913) |
| #/$defs/packageProvenance/properties/resolvedAt | `{"type":"string","format":"date-time"}` | [#/$defs/packageProvenance/properties/resolvedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L918-L918) |

Referenced types:

- `PackageIdentity`

## PackageResolution

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Package identity plus registrationId selects the exact implementation surface. The same package may contain several registrations; preserve this field in provider/receipt ownership comparisons.

```ts
PackageResolution
```

**Consumer example — source-only fragment:**

```ts
const registration: PackageResolution['registrationId'] = 'main';
```

Source: [PackageResolution](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L338-L344).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| pluginId | no | no | `pluginId: NamespacedId;` | [pluginId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L339-L339) |
| apiVersion | no | no | `apiVersion: 'pipeline-plugin-v2';` | [apiVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L340-L340) |
| packageVersion | no | no | `packageVersion: string;` | [packageVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L341-L341) |
| contentDigest | no | no | `contentDigest: string;` | [contentDigest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L342-L342) |
| registrationId | no | no | `registrationId: LocalId;` | [registrationId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L343-L343) |

Owning schema: [#/$defs/packageResolution](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/packageResolution | `{"type":"object","additionalProperties":false,"required":["pluginId","apiVersion","packageVersion","contentDigest","registrationId"]}` | [#/$defs/packageResolution](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L176-L193) |
| #/$defs/packageResolution/properties/pluginId | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/packageResolution/properties/pluginId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L181-L181) |
| #/$defs/packageResolution/properties/apiVersion | `{"const":"pipeline-plugin-v2"}` | [#/$defs/packageResolution/properties/apiVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L182-L182) |
| #/$defs/packageResolution/properties/packageVersion | `{"type":"string","pattern":"^(0\|[1-9][0-9]*)\\.(0\|[1-9][0-9]*)\\.(0\|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$"}` | [#/$defs/packageResolution/properties/packageVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L183-L186) |
| #/$defs/packageResolution/properties/contentDigest | `{"type":"string","pattern":"^sha256:[a-f0-9]{64}$"}` | [#/$defs/packageResolution/properties/contentDigest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L187-L190) |
| #/$defs/packageResolution/properties/registrationId | `{"$ref":"#/$defs/localId"}` | [#/$defs/packageResolution/properties/registrationId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L191-L191) |

Referenced types:

- `LocalId`
- `NamespacedId`

## PipelineDefinition

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Versioned pipeline definition requires an ID, positive maximum concurrency and a nonempty stage list. Individual dependencies, activation and retry settings belong to StageDefinition. The schema shape alone does not validate graph cycles or execute the pipeline.

```ts
PipelineDefinition
```

**Consumer example — source-only fragment:**

```ts
const version: PipelineDefinition['schemaVersion'] = 'pipeline-definition.v2';
```

Source: [PipelineDefinition](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L475-L483).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| schemaVersion | no | no | `schemaVersion: 'pipeline-definition.v2';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L476-L476) |
| id | no | no | `id: OpaqueId;` | [id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L477-L477) |
| maxConcurrency | no | no | `maxConcurrency: number;` | [maxConcurrency](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L478-L478) |
| stages | no | no | `stages: [StageDefinition, ...StageDefinition[]];` | [stages](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L482-L482) |

Owning schema: [#/$defs/pipelineDefinition](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/pipelineDefinition | `{"type":"object","additionalProperties":false,"required":["schemaVersion","id","maxConcurrency","stages"]}` | [#/$defs/pipelineDefinition](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L515-L529) |
| #/$defs/pipelineDefinition/properties/schemaVersion | `{"const":"pipeline-definition.v2"}` | [#/$defs/pipelineDefinition/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L520-L520) |
| #/$defs/pipelineDefinition/properties/id | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/pipelineDefinition/properties/id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L521-L521) |
| #/$defs/pipelineDefinition/properties/maxConcurrency | `{"type":"integer","minimum":1}` | [#/$defs/pipelineDefinition/properties/maxConcurrency](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L522-L522) |
| #/$defs/pipelineDefinition/properties/stages | `{"type":"array","minItems":1}` | [#/$defs/pipelineDefinition/properties/stages](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L523-L527) |
| #/$defs/pipelineDefinition/properties/stages/items | `{"$ref":"#/$defs/stageDefinition"}` | [#/$defs/pipelineDefinition/properties/stages/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L526-L526) |

Referenced types:

- `OpaqueId`
- `StageDefinition`

## PluginContext

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Serialized invocation input contains the lease, resolved config, input and visible artifacts. Optional guidance/lifecycle fields carry caller information; their absence is permitted. Optional runtime and cache profiles are explicit independent producer selections. The runtime wraps this contract in PluginInvocationContext methods.

```ts
PluginContext
```

**Consumer example — source-only fragment:**

```ts
const version: PluginContext['schemaVersion'] = 'plugin-context.v2';
```

Source: [PluginContext](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L581-L596).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| schemaVersion | no | no | `schemaVersion: 'plugin-context.v2';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L582-L582) |
| runtimeDispatchProfile | yes | no | `runtimeDispatchProfile?: RuntimeDispatchProfile;` | [runtimeDispatchProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L583-L583) |
| lease | no | no | `lease: InvocationLease;` | [lease](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L584-L584) |
| reviewCacheProfile | yes | no | `reviewCacheProfile?: ReviewCacheProfile;` | [reviewCacheProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L585-L585) |
| config | no | no | `config: JsonObject;` | [config](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L586-L586) |
| input | no | no | `input: JsonObject;` | [input](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L587-L587) |
| guidance | yes | no | `guidance?: JsonObject;` | [guidance](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L588-L588) |
| stageLifecycle | yes | no | `stageLifecycle?: {     attemptsUsed: number;     remediationCyclesUsed: number;     maxAttempts: number;     maxRemediationCycles: number;   };` | [stageLifecycle](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L589-L594) |
| stageLifecycle.attemptsUsed | no | no | `attemptsUsed: number;` | [attemptsUsed](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L590-L590) |
| stageLifecycle.remediationCyclesUsed | no | no | `remediationCyclesUsed: number;` | [remediationCyclesUsed](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L591-L591) |
| stageLifecycle.maxAttempts | no | no | `maxAttempts: number;` | [maxAttempts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L592-L592) |
| stageLifecycle.maxRemediationCycles | no | no | `maxRemediationCycles: number;` | [maxRemediationCycles](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L593-L593) |
| artifacts | no | no | `artifacts: ArtifactRef[];` | [artifacts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L595-L595) |

Owning schema: [#/$defs/pluginContext](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/pluginContext | `{"type":"object","additionalProperties":false,"required":["schemaVersion","lease","config","input","artifacts"]}` | [#/$defs/pluginContext](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L983-L1012) |
| #/$defs/pluginContext/properties/schemaVersion | `{"const":"plugin-context.v2"}` | [#/$defs/pluginContext/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L988-L988) |
| #/$defs/pluginContext/properties/runtimeDispatchProfile | `{"$ref":"#/$defs/runtimeDispatchProfile"}` | [#/$defs/pluginContext/properties/runtimeDispatchProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L989-L989) |
| #/$defs/pluginContext/properties/lease | `{"$ref":"#/$defs/invocationLease"}` | [#/$defs/pluginContext/properties/lease](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L990-L990) |
| #/$defs/pluginContext/properties/reviewCacheProfile | `{"$ref":"#/$defs/reviewCacheProfile"}` | [#/$defs/pluginContext/properties/reviewCacheProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L991-L991) |
| #/$defs/pluginContext/properties/config | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/pluginContext/properties/config](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L992-L992) |
| #/$defs/pluginContext/properties/input | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/pluginContext/properties/input](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L993-L993) |
| #/$defs/pluginContext/properties/guidance | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/pluginContext/properties/guidance](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L994-L994) |
| #/$defs/pluginContext/properties/stageLifecycle | `{"type":"object","additionalProperties":false,"required":["attemptsUsed","remediationCyclesUsed","maxAttempts","maxRemediationCycles"]}` | [#/$defs/pluginContext/properties/stageLifecycle](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L995-L1005) |
| #/$defs/pluginContext/properties/stageLifecycle/properties/attemptsUsed | `{"type":"integer","minimum":0}` | [#/$defs/pluginContext/properties/stageLifecycle/properties/attemptsUsed](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1000-L1000) |
| #/$defs/pluginContext/properties/stageLifecycle/properties/remediationCyclesUsed | `{"type":"integer","minimum":0}` | [#/$defs/pluginContext/properties/stageLifecycle/properties/remediationCyclesUsed](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1001-L1001) |
| #/$defs/pluginContext/properties/stageLifecycle/properties/maxAttempts | `{"type":"integer","minimum":1}` | [#/$defs/pluginContext/properties/stageLifecycle/properties/maxAttempts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1002-L1002) |
| #/$defs/pluginContext/properties/stageLifecycle/properties/maxRemediationCycles | `{"type":"integer","minimum":0}` | [#/$defs/pluginContext/properties/stageLifecycle/properties/maxRemediationCycles](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1003-L1003) |
| #/$defs/pluginContext/properties/artifacts | `{"type":"array","uniqueItems":true}` | [#/$defs/pluginContext/properties/artifacts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1006-L1010) |
| #/$defs/pluginContext/properties/artifacts/items | `{"$ref":"#/$defs/artifactRef"}` | [#/$defs/pluginContext/properties/artifacts/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1008-L1008) |

Referenced types:

- `ArtifactRef`
- `InvocationLease`
- `JsonObject`
- `ReviewCacheProfile`
- `RuntimeDispatchProfile`

## PluginDomainEvent

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Plugin-produced event includes registration provenance and a plugin-prefixed type, unlike the core closed lifecycle enum. It retains required sequence, run identity, nullable causation and time. Runtime emission checks the plugin namespace and current run; typing the payload does not bypass those checks.

```ts
PluginDomainEvent
```

**Consumer example — source-only fragment:**

```ts
const type: PluginDomainEvent['type'] = 'plugin.example.plugin.changed';
```

Source: [PluginDomainEvent](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L646-L656).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| schemaVersion | no | no | `schemaVersion: 'plugin-domain-event.v2';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L647-L647) |
| eventId | no | no | `eventId: OpaqueId;` | [eventId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L648-L648) |
| sequence | no | no | `sequence: number;` | [sequence](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L649-L649) |
| type | no | no | `type: string;` | [type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L650-L650) |
| producer | no | no | `producer: RegistrationProvenance;` | [producer](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L651-L651) |
| identity | no | no | `identity: EventIdentity;` | [identity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L652-L652) |
| occurredAt | no | no | `occurredAt: string;` | [occurredAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L653-L653) |
| causationId | no | no | `causationId: OpaqueId \| null;` | [causationId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L654-L654) |
| payload | no | no | `payload: JsonObject;` | [payload](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L655-L655) |

Owning schema: [#/$defs/pluginDomainEvent](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/pluginDomainEvent | `{"type":"object","additionalProperties":false,"required":["schemaVersion","eventId","sequence","type","producer","identity","occurredAt","causationId","payload"]}` | [#/$defs/pluginDomainEvent](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1058-L1078) |
| #/$defs/pluginDomainEvent/properties/schemaVersion | `{"const":"plugin-domain-event.v2"}` | [#/$defs/pluginDomainEvent/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1066-L1066) |
| #/$defs/pluginDomainEvent/properties/eventId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/pluginDomainEvent/properties/eventId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1067-L1067) |
| #/$defs/pluginDomainEvent/properties/sequence | `{"type":"integer","minimum":1}` | [#/$defs/pluginDomainEvent/properties/sequence](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1068-L1068) |
| #/$defs/pluginDomainEvent/properties/type | `{"type":"string","pattern":"^plugin\\.[a-z0-9]+(?:[._-][a-z0-9]+)+\\.[a-z0-9]+(?:[._-][a-z0-9]+)*$"}` | [#/$defs/pluginDomainEvent/properties/type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1069-L1069) |
| #/$defs/pluginDomainEvent/properties/producer | `{"$ref":"#/$defs/registrationProvenance"}` | [#/$defs/pluginDomainEvent/properties/producer](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1070-L1070) |
| #/$defs/pluginDomainEvent/properties/identity | `{"$ref":"#/$defs/eventIdentity"}` | [#/$defs/pluginDomainEvent/properties/identity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1071-L1071) |
| #/$defs/pluginDomainEvent/properties/occurredAt | `{"type":"string","format":"date-time"}` | [#/$defs/pluginDomainEvent/properties/occurredAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1072-L1072) |
| #/$defs/pluginDomainEvent/properties/causationId | `{}` | [#/$defs/pluginDomainEvent/properties/causationId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1073-L1075) |
| #/$defs/pluginDomainEvent/properties/causationId/oneOf/0 | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/pluginDomainEvent/properties/causationId/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1074-L1074) |
| #/$defs/pluginDomainEvent/properties/causationId/oneOf/1 | `{"type":"null"}` | [#/$defs/pluginDomainEvent/properties/causationId/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1074-L1074) |
| #/$defs/pluginDomainEvent/properties/payload | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/pluginDomainEvent/properties/payload](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1076-L1076) |

Referenced types:

- `EventIdentity`
- `JsonObject`
- `OpaqueId`
- `RegistrationProvenance`

## PluginInvocationContext

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Runtime wrapper exposes contract, invoke, emit and artifact. Core checks the active lease on each call. invoke requires a grant and capability authorization; emit requires the plugin event namespace and same run. artifact returns a visible reference or undefined and can fail when the lease is inactive. No method grants arbitrary host access.

```ts
PluginInvocationContext
```

**Consumer example — source-only fragment:**

```ts
const ref = context.artifact(artifactId);
```

Source: [PluginInvocationContext](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L31-L43).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| contract | no | yes | `readonly contract: PluginContext;` | [contract](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L32-L32) |
| invoke | no | no | `invoke(     capability: string,     request: CapabilityInvocation,   ): Promise<Readonly<Record<string, unknown>>>;` | [invoke](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L33-L36) |
| emit | no | no | `emit(     type: string,     identity: EventIdentity,     payload: Readonly<Record<string, unknown>>,   ): Promise<void>;` | [emit](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L37-L41) |
| artifact | no | no | `artifact(id: string): ArtifactRef \| undefined;` | [artifact](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L42-L42) |

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `ArtifactRef`
- `CapabilityInvocation`
- `EventIdentity`
- `PluginContext`
- `Promise`
- `Readonly`
- `Record`

## PluginManifest

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Package manifest declares stages, observers and adapters as required arrays; testProviders/reportAdapters are optional. At least one of the five arrays must be nonempty. API version is pipeline-plugin-v2. The registry validates JSON, then resolves modules and referenced schemas; the type does not activate a package.

```ts
PluginManifest1 & { id: NamespacedId; apiVersion: "pipeline-plugin-v2"; packageVersion: string; stages: StageRegistration[]; observers: ObserverRegistration[]; adapters: AdapterRegistration[]; testProviders?: TestProviderRegistration[]; reportAdapters?: ReportAdapterRegistration[]; }
```

**Consumer example — source-only fragment:**

```ts
const manifest: PluginManifest = {id:'example.plugin',apiVersion:PLUGIN_API_VERSION,packageVersion:'1.0.0',stages:[],observers:[],adapters:[registration]};
```

Source: [PluginManifest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L64-L73).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| id | no | no | `id: NamespacedId;` | [id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L65-L65) |
| apiVersion | no | no | `apiVersion: 'pipeline-plugin-v2';` | [apiVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L66-L66) |
| packageVersion | no | no | `packageVersion: string;` | [packageVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L67-L67) |
| stages | no | no | `stages: StageRegistration[];` | [stages](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L68-L68) |
| observers | no | no | `observers: ObserverRegistration[];` | [observers](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L69-L69) |
| adapters | no | no | `adapters: AdapterRegistration[];` | [adapters](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L70-L70) |
| testProviders | yes | no | `testProviders?: TestProviderRegistration[];` | [testProviders](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L71-L71) |
| reportAdapters | yes | no | `reportAdapters?: ReportAdapterRegistration[];` | [reportAdapters](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L72-L72) |

**Union variants — read required/optional members within each branch, not only the merged member list:**

Branch 1:

```typescript
{ [k: string]: any; stages: [any, ...any[]]; } & { id: NamespacedId; apiVersion: "pipeline-plugin-v2"; packageVersion: string; stages: StageRegistration[]; observers: ObserverRegistration[]; adapters: AdapterRegistration[]; testProviders?: TestProviderRegistration[]; reportAdapters?: ReportAdapterRegistration[]; }
```

| Member | Optional in this branch | Type | Source |
| --- | --- | --- | --- |
| stages | no | `[any, ...any[]] & StageRegistration[]` | [stages](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L79-L79) |
| id | no | `string` | [id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L65-L65) |
| apiVersion | no | `"pipeline-plugin-v2"` | [apiVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L66-L66) |
| packageVersion | no | `string` | [packageVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L67-L67) |
| observers | no | `ObserverRegistration[]` | [observers](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L69-L69) |
| adapters | no | `AdapterRegistration[]` | [adapters](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L70-L70) |
| testProviders | yes | `TestProviderRegistration[]` | [testProviders](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L71-L71) |
| reportAdapters | yes | `ReportAdapterRegistration[]` | [reportAdapters](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L72-L72) |

Branch 2:

```typescript
{ [k: string]: any; observers: [any, ...any[]]; } & { id: NamespacedId; apiVersion: "pipeline-plugin-v2"; packageVersion: string; stages: StageRegistration[]; observers: ObserverRegistration[]; adapters: AdapterRegistration[]; testProviders?: TestProviderRegistration[]; reportAdapters?: ReportAdapterRegistration[]; }
```

| Member | Optional in this branch | Type | Source |
| --- | --- | --- | --- |
| observers | no | `[any, ...any[]] & ObserverRegistration[]` | [observers](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L86-L86) |
| id | no | `string` | [id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L65-L65) |
| apiVersion | no | `"pipeline-plugin-v2"` | [apiVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L66-L66) |
| packageVersion | no | `string` | [packageVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L67-L67) |
| stages | no | `StageRegistration[]` | [stages](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L68-L68) |
| adapters | no | `AdapterRegistration[]` | [adapters](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L70-L70) |
| testProviders | yes | `TestProviderRegistration[]` | [testProviders](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L71-L71) |
| reportAdapters | yes | `ReportAdapterRegistration[]` | [reportAdapters](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L72-L72) |

Branch 3:

```typescript
{ [k: string]: any; adapters: [any, ...any[]]; } & { id: NamespacedId; apiVersion: "pipeline-plugin-v2"; packageVersion: string; stages: StageRegistration[]; observers: ObserverRegistration[]; adapters: AdapterRegistration[]; testProviders?: TestProviderRegistration[]; reportAdapters?: ReportAdapterRegistration[]; }
```

| Member | Optional in this branch | Type | Source |
| --- | --- | --- | --- |
| adapters | no | `[any, ...any[]] & AdapterRegistration[]` | [adapters](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L93-L93) |
| id | no | `string` | [id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L65-L65) |
| apiVersion | no | `"pipeline-plugin-v2"` | [apiVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L66-L66) |
| packageVersion | no | `string` | [packageVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L67-L67) |
| stages | no | `StageRegistration[]` | [stages](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L68-L68) |
| observers | no | `ObserverRegistration[]` | [observers](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L69-L69) |
| testProviders | yes | `TestProviderRegistration[]` | [testProviders](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L71-L71) |
| reportAdapters | yes | `ReportAdapterRegistration[]` | [reportAdapters](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L72-L72) |

Branch 4:

```typescript
{ [k: string]: any; testProviders: [any, ...any[]]; } & { id: NamespacedId; apiVersion: "pipeline-plugin-v2"; packageVersion: string; stages: StageRegistration[]; observers: ObserverRegistration[]; adapters: AdapterRegistration[]; testProviders?: TestProviderRegistration[]; reportAdapters?: ReportAdapterRegistration[]; }
```

| Member | Optional in this branch | Type | Source |
| --- | --- | --- | --- |
| testProviders | no | `[any, ...any[]] & TestProviderRegistration[]` | [testProviders](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L100-L100) |
| id | no | `string` | [id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L65-L65) |
| apiVersion | no | `"pipeline-plugin-v2"` | [apiVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L66-L66) |
| packageVersion | no | `string` | [packageVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L67-L67) |
| stages | no | `StageRegistration[]` | [stages](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L68-L68) |
| observers | no | `ObserverRegistration[]` | [observers](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L69-L69) |
| adapters | no | `AdapterRegistration[]` | [adapters](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L70-L70) |
| reportAdapters | yes | `ReportAdapterRegistration[]` | [reportAdapters](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L72-L72) |

Branch 5:

```typescript
{ [k: string]: any; reportAdapters: [any, ...any[]]; } & { id: NamespacedId; apiVersion: "pipeline-plugin-v2"; packageVersion: string; stages: StageRegistration[]; observers: ObserverRegistration[]; adapters: AdapterRegistration[]; testProviders?: TestProviderRegistration[]; reportAdapters?: ReportAdapterRegistration[]; }
```

| Member | Optional in this branch | Type | Source |
| --- | --- | --- | --- |
| reportAdapters | no | `[any, ...any[]] & ReportAdapterRegistration[]` | [reportAdapters](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L107-L107) |
| id | no | `string` | [id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L65-L65) |
| apiVersion | no | `"pipeline-plugin-v2"` | [apiVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L66-L66) |
| packageVersion | no | `string` | [packageVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L67-L67) |
| stages | no | `StageRegistration[]` | [stages](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L68-L68) |
| observers | no | `ObserverRegistration[]` | [observers](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L69-L69) |
| adapters | no | `AdapterRegistration[]` | [adapters](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L70-L70) |
| testProviders | yes | `TestProviderRegistration[]` | [testProviders](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L71-L71) |


Owning schema: [#/$defs/pluginManifest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/pluginManifest | `{"type":"object","additionalProperties":false,"required":["id","apiVersion","packageVersion","stages","observers","adapters"]}` | [#/$defs/pluginManifest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L410-L449) |
| #/$defs/pluginManifest/properties/id | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/pluginManifest/properties/id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L415-L415) |
| #/$defs/pluginManifest/properties/apiVersion | `{"const":"pipeline-plugin-v2"}` | [#/$defs/pluginManifest/properties/apiVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L416-L416) |
| #/$defs/pluginManifest/properties/packageVersion | `{"type":"string","pattern":"^(0\|[1-9][0-9]*)\\.(0\|[1-9][0-9]*)\\.(0\|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$"}` | [#/$defs/pluginManifest/properties/packageVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L417-L420) |
| #/$defs/pluginManifest/properties/stages | `{"type":"array"}` | [#/$defs/pluginManifest/properties/stages](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L421-L424) |
| #/$defs/pluginManifest/properties/stages/items | `{"$ref":"#/$defs/stageRegistration"}` | [#/$defs/pluginManifest/properties/stages/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L423-L423) |
| #/$defs/pluginManifest/properties/observers | `{"type":"array"}` | [#/$defs/pluginManifest/properties/observers](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L425-L428) |
| #/$defs/pluginManifest/properties/observers/items | `{"$ref":"#/$defs/observerRegistration"}` | [#/$defs/pluginManifest/properties/observers/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L427-L427) |
| #/$defs/pluginManifest/properties/adapters | `{"type":"array"}` | [#/$defs/pluginManifest/properties/adapters](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L429-L432) |
| #/$defs/pluginManifest/properties/adapters/items | `{"$ref":"#/$defs/adapterRegistration"}` | [#/$defs/pluginManifest/properties/adapters/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L431-L431) |
| #/$defs/pluginManifest/properties/testProviders | `{"type":"array"}` | [#/$defs/pluginManifest/properties/testProviders](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L433-L436) |
| #/$defs/pluginManifest/properties/testProviders/items | `{"$ref":"#/$defs/testProviderRegistration"}` | [#/$defs/pluginManifest/properties/testProviders/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L435-L435) |
| #/$defs/pluginManifest/properties/reportAdapters | `{"type":"array"}` | [#/$defs/pluginManifest/properties/reportAdapters](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L437-L440) |
| #/$defs/pluginManifest/properties/reportAdapters/items | `{"$ref":"#/$defs/reportAdapterRegistration"}` | [#/$defs/pluginManifest/properties/reportAdapters/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L439-L439) |
| #/$defs/pluginManifest/anyOf/0 | `{"required":["stages"]}` | [#/$defs/pluginManifest/anyOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L443-L443) |
| #/$defs/pluginManifest/anyOf/0/properties/stages | `{"type":"array","minItems":1}` | [#/$defs/pluginManifest/anyOf/0/properties/stages](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L443-L443) |
| #/$defs/pluginManifest/anyOf/1 | `{"required":["observers"]}` | [#/$defs/pluginManifest/anyOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L444-L444) |
| #/$defs/pluginManifest/anyOf/1/properties/observers | `{"type":"array","minItems":1}` | [#/$defs/pluginManifest/anyOf/1/properties/observers](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L444-L444) |
| #/$defs/pluginManifest/anyOf/2 | `{"required":["adapters"]}` | [#/$defs/pluginManifest/anyOf/2](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L445-L445) |
| #/$defs/pluginManifest/anyOf/2/properties/adapters | `{"type":"array","minItems":1}` | [#/$defs/pluginManifest/anyOf/2/properties/adapters](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L445-L445) |
| #/$defs/pluginManifest/anyOf/3 | `{"required":["testProviders"]}` | [#/$defs/pluginManifest/anyOf/3](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L446-L446) |
| #/$defs/pluginManifest/anyOf/3/properties/testProviders | `{"type":"array","minItems":1}` | [#/$defs/pluginManifest/anyOf/3/properties/testProviders](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L446-L446) |
| #/$defs/pluginManifest/anyOf/4 | `{"required":["reportAdapters"]}` | [#/$defs/pluginManifest/anyOf/4](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L447-L447) |
| #/$defs/pluginManifest/anyOf/4/properties/reportAdapters | `{"type":"array","minItems":1}` | [#/$defs/pluginManifest/anyOf/4/properties/reportAdapters](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L447-L447) |

Referenced types:

- `AdapterRegistration`
- `NamespacedId`
- `ObserverRegistration`
- `PluginManifest1`
- `ReportAdapterRegistration`
- `StageRegistration`
- `TestProviderRegistration`

## PluginManifest1

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Generated auxiliary union captures the manifest requirement that at least one registration array is nonempty. It is exported because the generated contracts entrypoint uses export star. Do not use it alone as a complete manifest; PluginManifest adds identity and required arrays.

```ts
{ [k: string]: any; stages: [any, ...any[]]; } | { [k: string]: any; observers: [any, ...any[]]; } | { [k: string]: any; adapters: [any, ...any[]]; } | { [k: string]: any; testProviders: [any, ...any[]]; } | { [k: string]: any; reportAdapters: [any, ...any[]]; }
```

**Consumer example — source-only fragment:**

```ts
const nonempty: PluginManifest1 = {adapters:[registration]};
```

Source: [PluginManifest1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L74-L109).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| stages | no | no | `stages: [any, ...any[]];` | [stages](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L79-L79) |
| [index] | no | no | `[k: string]: any;` | [skills/common/plugin-runtime/sdk/src/generated/contracts.ts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L80-L80) |
| observers | no | no | `observers: [any, ...any[]];` | [observers](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L86-L86) |
| [index] | no | no | `[k: string]: any;` | [skills/common/plugin-runtime/sdk/src/generated/contracts.ts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L87-L87) |
| adapters | no | no | `adapters: [any, ...any[]];` | [adapters](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L93-L93) |
| [index] | no | no | `[k: string]: any;` | [skills/common/plugin-runtime/sdk/src/generated/contracts.ts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L94-L94) |
| testProviders | no | no | `testProviders: [any, ...any[]];` | [testProviders](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L100-L100) |
| [index] | no | no | `[k: string]: any;` | [skills/common/plugin-runtime/sdk/src/generated/contracts.ts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L101-L101) |
| reportAdapters | no | no | `reportAdapters: [any, ...any[]];` | [reportAdapters](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L107-L107) |
| [index] | no | no | `[k: string]: any;` | [skills/common/plugin-runtime/sdk/src/generated/contracts.ts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L108-L108) |

**Union variants — read required/optional members within each branch, not only the merged member list:**

Branch 1:

```typescript
{ [k: string]: any; stages: [any, ...any[]]; }
```

| Member | Optional in this branch | Type | Source |
| --- | --- | --- | --- |
| stages | no | `[any, ...any[]]` | [stages](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L79-L79) |

Branch 2:

```typescript
{ [k: string]: any; observers: [any, ...any[]]; }
```

| Member | Optional in this branch | Type | Source |
| --- | --- | --- | --- |
| observers | no | `[any, ...any[]]` | [observers](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L86-L86) |

Branch 3:

```typescript
{ [k: string]: any; adapters: [any, ...any[]]; }
```

| Member | Optional in this branch | Type | Source |
| --- | --- | --- | --- |
| adapters | no | `[any, ...any[]]` | [adapters](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L93-L93) |

Branch 4:

```typescript
{ [k: string]: any; testProviders: [any, ...any[]]; }
```

| Member | Optional in this branch | Type | Source |
| --- | --- | --- | --- |
| testProviders | no | `[any, ...any[]]` | [testProviders](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L100-L100) |

Branch 5:

```typescript
{ [k: string]: any; reportAdapters: [any, ...any[]]; }
```

| Member | Optional in this branch | Type | Source |
| --- | --- | --- | --- |
| reportAdapters | no | `[any, ...any[]]` | [reportAdapters](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L107-L107) |


Owning schema: [#/$defs/pluginManifest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/pluginManifest | `{"type":"object","additionalProperties":false,"required":["id","apiVersion","packageVersion","stages","observers","adapters"]}` | [#/$defs/pluginManifest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L410-L449) |
| #/$defs/pluginManifest/properties/id | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/pluginManifest/properties/id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L415-L415) |
| #/$defs/pluginManifest/properties/apiVersion | `{"const":"pipeline-plugin-v2"}` | [#/$defs/pluginManifest/properties/apiVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L416-L416) |
| #/$defs/pluginManifest/properties/packageVersion | `{"type":"string","pattern":"^(0\|[1-9][0-9]*)\\.(0\|[1-9][0-9]*)\\.(0\|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$"}` | [#/$defs/pluginManifest/properties/packageVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L417-L420) |
| #/$defs/pluginManifest/properties/stages | `{"type":"array"}` | [#/$defs/pluginManifest/properties/stages](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L421-L424) |
| #/$defs/pluginManifest/properties/stages/items | `{"$ref":"#/$defs/stageRegistration"}` | [#/$defs/pluginManifest/properties/stages/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L423-L423) |
| #/$defs/pluginManifest/properties/observers | `{"type":"array"}` | [#/$defs/pluginManifest/properties/observers](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L425-L428) |
| #/$defs/pluginManifest/properties/observers/items | `{"$ref":"#/$defs/observerRegistration"}` | [#/$defs/pluginManifest/properties/observers/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L427-L427) |
| #/$defs/pluginManifest/properties/adapters | `{"type":"array"}` | [#/$defs/pluginManifest/properties/adapters](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L429-L432) |
| #/$defs/pluginManifest/properties/adapters/items | `{"$ref":"#/$defs/adapterRegistration"}` | [#/$defs/pluginManifest/properties/adapters/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L431-L431) |
| #/$defs/pluginManifest/properties/testProviders | `{"type":"array"}` | [#/$defs/pluginManifest/properties/testProviders](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L433-L436) |
| #/$defs/pluginManifest/properties/testProviders/items | `{"$ref":"#/$defs/testProviderRegistration"}` | [#/$defs/pluginManifest/properties/testProviders/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L435-L435) |
| #/$defs/pluginManifest/properties/reportAdapters | `{"type":"array"}` | [#/$defs/pluginManifest/properties/reportAdapters](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L437-L440) |
| #/$defs/pluginManifest/properties/reportAdapters/items | `{"$ref":"#/$defs/reportAdapterRegistration"}` | [#/$defs/pluginManifest/properties/reportAdapters/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L439-L439) |
| #/$defs/pluginManifest/anyOf/0 | `{"required":["stages"]}` | [#/$defs/pluginManifest/anyOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L443-L443) |
| #/$defs/pluginManifest/anyOf/0/properties/stages | `{"type":"array","minItems":1}` | [#/$defs/pluginManifest/anyOf/0/properties/stages](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L443-L443) |
| #/$defs/pluginManifest/anyOf/1 | `{"required":["observers"]}` | [#/$defs/pluginManifest/anyOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L444-L444) |
| #/$defs/pluginManifest/anyOf/1/properties/observers | `{"type":"array","minItems":1}` | [#/$defs/pluginManifest/anyOf/1/properties/observers](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L444-L444) |
| #/$defs/pluginManifest/anyOf/2 | `{"required":["adapters"]}` | [#/$defs/pluginManifest/anyOf/2](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L445-L445) |
| #/$defs/pluginManifest/anyOf/2/properties/adapters | `{"type":"array","minItems":1}` | [#/$defs/pluginManifest/anyOf/2/properties/adapters](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L445-L445) |
| #/$defs/pluginManifest/anyOf/3 | `{"required":["testProviders"]}` | [#/$defs/pluginManifest/anyOf/3](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L446-L446) |
| #/$defs/pluginManifest/anyOf/3/properties/testProviders | `{"type":"array","minItems":1}` | [#/$defs/pluginManifest/anyOf/3/properties/testProviders](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L446-L446) |
| #/$defs/pluginManifest/anyOf/4 | `{"required":["reportAdapters"]}` | [#/$defs/pluginManifest/anyOf/4](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L447-L447) |
| #/$defs/pluginManifest/anyOf/4/properties/reportAdapters | `{"type":"array","minItems":1}` | [#/$defs/pluginManifest/anyOf/4/properties/reportAdapters](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L447-L447) |

## PluginStateEntry

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Versioned plugin state record links namespace, registration, entry type, sequence, idempotency key, time and payload. attempt may be omitted or null. entrySchemaVersion is optional. The shape does not define a persistence backend or removal schedule.

```ts
PluginStateEntry
```

**Consumer example — source-only fragment:**

```ts
const type: PluginStateEntry['entryType'] = 'example.state';
```

Source: [PluginStateEntry](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L684-L696).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| schemaVersion | no | no | `schemaVersion: 'plugin-state-entry.v2';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L685-L685) |
| entryId | no | no | `entryId: OpaqueId;` | [entryId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L686-L686) |
| sequence | no | no | `sequence: number;` | [sequence](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L687-L687) |
| namespace | no | no | `namespace: NamespacedId;` | [namespace](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L688-L688) |
| registration | no | no | `registration: RegistrationProvenance;` | [registration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L689-L689) |
| attempt | yes | no | `attempt?: AttemptIdentity \| null;` | [attempt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L690-L690) |
| entryType | no | no | `entryType: NamespacedId;` | [entryType](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L691-L691) |
| entrySchemaVersion | yes | no | `entrySchemaVersion?: NamespacedId;` | [entrySchemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L692-L692) |
| idempotencyKey | no | no | `idempotencyKey: OpaqueId;` | [idempotencyKey](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L693-L693) |
| occurredAt | no | no | `occurredAt: string;` | [occurredAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L694-L694) |
| payload | no | no | `payload: JsonObject;` | [payload](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L695-L695) |

Owning schema: [#/$defs/pluginStateEntry](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/pluginStateEntry | `{"type":"object","additionalProperties":false,"required":["schemaVersion","entryId","sequence","namespace","registration","entryType","idempotencyKey","occurredAt","payload"]}` | [#/$defs/pluginStateEntry](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1155-L1177) |
| #/$defs/pluginStateEntry/properties/schemaVersion | `{"const":"plugin-state-entry.v2"}` | [#/$defs/pluginStateEntry/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1163-L1163) |
| #/$defs/pluginStateEntry/properties/entryId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/pluginStateEntry/properties/entryId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1164-L1164) |
| #/$defs/pluginStateEntry/properties/sequence | `{"type":"integer","minimum":1}` | [#/$defs/pluginStateEntry/properties/sequence](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1165-L1165) |
| #/$defs/pluginStateEntry/properties/namespace | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/pluginStateEntry/properties/namespace](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1166-L1166) |
| #/$defs/pluginStateEntry/properties/registration | `{"$ref":"#/$defs/registrationProvenance"}` | [#/$defs/pluginStateEntry/properties/registration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1167-L1167) |
| #/$defs/pluginStateEntry/properties/attempt | `{}` | [#/$defs/pluginStateEntry/properties/attempt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1168-L1170) |
| #/$defs/pluginStateEntry/properties/attempt/oneOf/0 | `{"$ref":"#/$defs/attemptIdentity"}` | [#/$defs/pluginStateEntry/properties/attempt/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1169-L1169) |
| #/$defs/pluginStateEntry/properties/attempt/oneOf/1 | `{"type":"null"}` | [#/$defs/pluginStateEntry/properties/attempt/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1169-L1169) |
| #/$defs/pluginStateEntry/properties/entryType | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/pluginStateEntry/properties/entryType](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1171-L1171) |
| #/$defs/pluginStateEntry/properties/entrySchemaVersion | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/pluginStateEntry/properties/entrySchemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1172-L1172) |
| #/$defs/pluginStateEntry/properties/idempotencyKey | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/pluginStateEntry/properties/idempotencyKey](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1173-L1173) |
| #/$defs/pluginStateEntry/properties/occurredAt | `{"type":"string","format":"date-time"}` | [#/$defs/pluginStateEntry/properties/occurredAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1174-L1174) |
| #/$defs/pluginStateEntry/properties/payload | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/pluginStateEntry/properties/payload](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1175-L1175) |

Referenced types:

- `AttemptIdentity`
- `JsonObject`
- `NamespacedId`
- `OpaqueId`
- `RegistrationProvenance`

## PluginSystemV2

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Generated wrapper interface exposes optional contract examples for type generation. It is not a runnable plugin manifest or a runtime dispatcher. Its members refer to individual owning schema definitions; omission of all wrapper members does not create a usable package.

```ts
PluginSystemV2
```

**Consumer example — source-only fragment:**

```ts
const wrapper: PluginSystemV2 = {};
```

Source: [PluginSystemV2](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L238-L287).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| reviewCacheProfile | yes | no | `reviewCacheProfile?: ReviewCacheProfile;` | [reviewCacheProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L239-L239) |
| runtimeDispatchProfile | yes | no | `runtimeDispatchProfile?: RuntimeDispatchProfile;` | [runtimeDispatchProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L240-L240) |
| capabilityInvocation | yes | no | `capabilityInvocation?: CapabilityInvocation;` | [capabilityInvocation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L241-L241) |
| runtimeRunGraph | yes | no | `runtimeRunGraph?: RuntimeRunGraph;` | [runtimeRunGraph](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L242-L242) |
| runtimeRunEdge | yes | no | `runtimeRunEdge?: RuntimeRunEdge;` | [runtimeRunEdge](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L243-L243) |
| runtimeRunSnapshot | yes | no | `runtimeRunSnapshot?: RuntimeRunSnapshot;` | [runtimeRunSnapshot](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L244-L244) |
| runtimeRunSnapshotV4 | yes | no | `runtimeRunSnapshotV4?: RuntimeRunSnapshotV4;` | [runtimeRunSnapshotV4](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L245-L245) |
| effectIdempotencyKey | yes | no | `effectIdempotencyKey?: EffectIdempotencyKey;` | [effectIdempotencyKey](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L246-L246) |
| resourceIdentity | yes | no | `resourceIdentity?: ResourceIdentity;` | [resourceIdentity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L247-L247) |
| effectDeliveryId | yes | no | `effectDeliveryId?: EffectDeliveryId;` | [effectDeliveryId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L248-L248) |
| effectAttemptIdentity | yes | no | `effectAttemptIdentity?: EffectAttemptIdentity;` | [effectAttemptIdentity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L249-L249) |
| adapterActivationId | yes | no | `adapterActivationId?: AdapterActivationId;` | [adapterActivationId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L250-L250) |
| testContractId | yes | no | `testContractId?: TestContractId;` | [testContractId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L251-L251) |
| packageIdentity | yes | no | `packageIdentity?: PackageIdentity;` | [packageIdentity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L252-L252) |
| packageResolution | yes | no | `packageResolution?: PackageResolution;` | [packageResolution](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L253-L253) |
| stageRegistration | yes | no | `stageRegistration?: StageRegistration;` | [stageRegistration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L254-L254) |
| observerRegistration | yes | no | `observerRegistration?: ObserverRegistration;` | [observerRegistration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L255-L255) |
| adapterRegistration | yes | no | `adapterRegistration?: AdapterRegistration;` | [adapterRegistration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L256-L256) |
| testProviderPort | yes | no | `testProviderPort?: TestProviderPort;` | [testProviderPort](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L257-L257) |
| testEvidencePolicy | yes | no | `testEvidencePolicy?: TestEvidencePolicy;` | [testEvidencePolicy](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L258-L258) |
| testProviderRegistration | yes | no | `testProviderRegistration?: TestProviderRegistration;` | [testProviderRegistration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L259-L259) |
| reportAdapterRegistration | yes | no | `reportAdapterRegistration?: ReportAdapterRegistration;` | [reportAdapterRegistration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L260-L260) |
| pluginManifest | yes | no | `pluginManifest?: PluginManifest;` | [pluginManifest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L261-L261) |
| stageDefinition | yes | no | `stageDefinition?: StageDefinition;` | [stageDefinition](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L262-L262) |
| pipelineDefinition | yes | no | `pipelineDefinition?: PipelineDefinition;` | [pipelineDefinition](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L263-L263) |
| attemptIdentity | yes | no | `attemptIdentity?: AttemptIdentity;` | [attemptIdentity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L264-L264) |
| stageAttempt | yes | no | `stageAttempt?: StageAttempt;` | [stageAttempt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L265-L265) |
| artifactRef | yes | no | `artifactRef?: ArtifactRef;` | [artifactRef](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L266-L266) |
| decisionFacts | yes | no | `decisionFacts?: DecisionFacts;` | [decisionFacts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L267-L267) |
| stageResult | yes | no | `stageResult?: StageResult;` | [stageResult](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L268-L268) |
| effectRequest | yes | no | `effectRequest?: EffectRequest;` | [effectRequest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L269-L269) |
| effectReceipt | yes | no | `effectReceipt?: EffectReceipt;` | [effectReceipt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L270-L270) |
| waitRequest | yes | no | `waitRequest?: WaitRequest;` | [waitRequest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L271-L271) |
| resumeSignal | yes | no | `resumeSignal?: ResumeSignal;` | [resumeSignal](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L272-L272) |
| administrativeReopenDecision | yes | no | `administrativeReopenDecision?: AdministrativeReopenDecision;` | [administrativeReopenDecision](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L273-L273) |
| packageProvenance | yes | no | `packageProvenance?: PackageProvenance;` | [packageProvenance](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L274-L274) |
| registrationProvenance | yes | no | `registrationProvenance?: RegistrationProvenance;` | [registrationProvenance](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L275-L275) |
| capabilityGrant | yes | no | `capabilityGrant?: CapabilityGrant;` | [capabilityGrant](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L276-L276) |
| invocationLease | yes | no | `invocationLease?: InvocationLease;` | [invocationLease](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L277-L277) |
| pluginContext | yes | no | `pluginContext?: PluginContext;` | [pluginContext](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L278-L278) |
| eventIdentity | yes | no | `eventIdentity?: EventIdentity;` | [eventIdentity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L279-L279) |
| lifecycleEvent | yes | no | `lifecycleEvent?: LifecycleEvent;` | [lifecycleEvent](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L280-L280) |
| pluginDomainEvent | yes | no | `pluginDomainEvent?: PluginDomainEvent;` | [pluginDomainEvent](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L281-L281) |
| observerDelivery | yes | no | `observerDelivery?: ObserverDelivery;` | [observerDelivery](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L282-L282) |
| observerCheckpoint | yes | no | `observerCheckpoint?: ObserverCheckpoint;` | [observerCheckpoint](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L283-L283) |
| adapterLifecycle | yes | no | `adapterLifecycle?: AdapterLifecycle;` | [adapterLifecycle](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L284-L284) |
| resourceLock | yes | no | `resourceLock?: ResourceLock;` | [resourceLock](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L285-L285) |
| pluginStateEntry | yes | no | `pluginStateEntry?: PluginStateEntry;` | [pluginStateEntry](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L286-L286) |

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `AdapterActivationId`
- `AdapterLifecycle`
- `AdapterRegistration`
- `AdministrativeReopenDecision`
- `ArtifactRef`
- `AttemptIdentity`
- `CapabilityGrant`
- `CapabilityInvocation`
- `DecisionFacts`
- `EffectAttemptIdentity`
- `EffectDeliveryId`
- `EffectIdempotencyKey`
- `EffectReceipt`
- `EffectRequest`
- `EventIdentity`
- `InvocationLease`
- `LifecycleEvent`
- `ObserverCheckpoint`
- `ObserverDelivery`
- `ObserverRegistration`
- `PackageIdentity`
- `PackageProvenance`
- `PackageResolution`
- `PipelineDefinition`
- `PluginContext`
- `PluginDomainEvent`
- `PluginManifest`
- `PluginStateEntry`
- `RegistrationProvenance`
- `ReportAdapterRegistration`
- `ResourceIdentity`
- `ResourceLock`
- `ResumeSignal`
- `ReviewCacheProfile`
- `RuntimeDispatchProfile`
- `RuntimeRunEdge`
- `RuntimeRunGraph`
- `RuntimeRunSnapshot`
- `RuntimeRunSnapshotV4`
- `StageAttempt`
- `StageDefinition`
- `StageRegistration`
- `StageResult`
- `TestContractId`
- `TestEvidencePolicy`
- `TestProviderPort`
- `TestProviderRegistration`
- `WaitRequest`

## RUNTIME_RESULT_FILE_MAX_BYTES

Import: `@kubeclaw/plugin-sdk`. Kind: constant.

2048-byte UTF-8 path limit enforced by buildRuntimeAgentTask. It limits the result path string, not the result JSON size and not a filesystem allocation.

```ts
2048
```

**Consumer example — source-only fragment:**

```ts
const maximum = RUNTIME_RESULT_FILE_MAX_BYTES;
```

Source: [RUNTIME_RESULT_FILE_MAX_BYTES](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime-agent-task.ts#L1-L1).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

## Reason

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Structured reason requires a namespaced code. Optional message is 1–4096 characters and details is an object. Omitted message is permitted; callers must not assume every reason has user-facing prose.

```ts
Reason
```

**Consumer example — source-only fragment:**

```ts
const reason: Reason = {code:'example.invalid'};
```

Source: [Reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L526-L530).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| code | no | no | `code: NamespacedId;` | [code](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L527-L527) |
| message | yes | no | `message?: string;` | [message](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L528-L528) |
| details | yes | no | `details?: JsonObject;` | [details](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L529-L529) |

Owning schema: [#/$defs/reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/reason | `{"type":"object","additionalProperties":false,"required":["code"]}` | [#/$defs/reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L149-L158) |
| #/$defs/reason/properties/code | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/reason/properties/code](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L154-L154) |
| #/$defs/reason/properties/message | `{"type":"string","minLength":1,"maxLength":4096}` | [#/$defs/reason/properties/message](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L155-L155) |
| #/$defs/reason/properties/details | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/reason/properties/details](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L156-L156) |

Referenced types:

- `JsonObject`
- `NamespacedId`

## RegistrationProvenance

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Registration origin binds package provenance, surface and registration ID. Surface is one of stage, observer, adapter, test_provider or report_adapter. Keep it with lifecycle and state records; its schema does not verify the package evidence.

```ts
RegistrationProvenance
```

**Consumer example — source-only fragment:**

```ts
const surface: RegistrationProvenance['surface'] = 'adapter';
```

Source: [RegistrationProvenance](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L570-L575).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| schemaVersion | no | no | `schemaVersion: 'registration-provenance.v2';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L571-L571) |
| package | no | no | `package: PackageProvenance;` | [package](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L572-L572) |
| surface | no | no | `surface: 'stage' \| 'observer' \| 'adapter' \| 'test_provider' \| 'report_adapter';` | [surface](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L573-L573) |
| registrationId | no | no | `registrationId: LocalId;` | [registrationId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L574-L574) |

Owning schema: [#/$defs/registrationProvenance](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/registrationProvenance | `{"type":"object","additionalProperties":false,"required":["schemaVersion","package","surface","registrationId"]}` | [#/$defs/registrationProvenance](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L921-L931) |
| #/$defs/registrationProvenance/properties/schemaVersion | `{"const":"registration-provenance.v2"}` | [#/$defs/registrationProvenance/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L926-L926) |
| #/$defs/registrationProvenance/properties/package | `{"$ref":"#/$defs/packageProvenance"}` | [#/$defs/registrationProvenance/properties/package](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L927-L927) |
| #/$defs/registrationProvenance/properties/surface | `{"enum":["stage","observer","adapter","test_provider","report_adapter"]}` | [#/$defs/registrationProvenance/properties/surface](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L928-L928) |
| #/$defs/registrationProvenance/properties/registrationId | `{"$ref":"#/$defs/localId"}` | [#/$defs/registrationProvenance/properties/registrationId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L929-L929) |

Referenced types:

- `LocalId`
- `PackageProvenance`

## RelativeModulePath

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Schema path must be relative, exclude parent path segments, end in mjs/mts/js/ts and have at most 512 characters. A matching string does not prove a regular file or containment after filesystem resolution; the registry checks module resolution.

```ts
string
```

**Consumer example — source-only fragment:**

```ts
const module: RelativeModulePath = 'src/stage.ts';
```

Source: [RelativeModulePath](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L44-L44).

Owning schema: [#/$defs/relativeModulePath](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/relativeModulePath | `{"type":"string","pattern":"^(?!/)(?!.*(?:^\|/)\\.\\.(?:/\|$)).+\\.(?:mjs\|mts\|js\|ts)$","maxLength":512}` | [#/$defs/relativeModulePath](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L131-L135) |

## RelativeSchemaPath

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Schema path must be relative, exclude parent segments, end in json and have at most 512 characters. Registry owns reading/compiling the actual schema. The string type does not establish that a file exists or contains valid JSON Schema.

```ts
string
```

**Consumer example — source-only fragment:**

```ts
const schema: RelativeSchemaPath = 'schemas/config.json';
```

Source: [RelativeSchemaPath](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L45-L45).

Owning schema: [#/$defs/relativeSchemaPath](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/relativeSchemaPath | `{"type":"string","pattern":"^(?!/)(?!.*(?:^\|/)\\.\\.(?:/\|$)).+\\.json$","maxLength":512}` | [#/$defs/relativeSchemaPath](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L136-L140) |

## ReportAdapterFunction

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Callback accepts report bytes/media type and limits, and returns counts/cases/findings plus required duration/truncation metadata, directly or asynchronously. It does not own adapter provenance or sourceArtifact fields; Buster adds those and validates the result. Rejection is a failed report adaptation, not a passing test.

```ts
(input: ReportAdapterInput): Promise<ReportAdapterOutput> | ReportAdapterOutput
```

**Consumer example — source-only fragment:**

```ts
const adapt: ReportAdapterFunction = input => ({counts:{passed:0,failed:0,skipped:0,errored:0,total:0},durationMs:0,cases:[],casesTruncated:false,omittedCaseCount:0,findings:[],findingsTruncated:false,omittedFindingCount:0});
```

Source: [ReportAdapterFunction](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L182-L184).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `Promise`
- `ReportAdapterInput`
- `ReportAdapterOutput`

## ReportAdapterInput

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Input has report-adapter-input.v1, media type, Uint8Array bytes and three count limits. The report runtime verifies source digest/size and allowed media type before adaptation. No filesystem path or capability context is part of this callback input.

```ts
ReportAdapterInput
```

**Consumer example — source-only fragment:**

```ts
const version: ReportAdapterInput['schemaVersion'] = 'report-adapter-input.v1';
```

Source: [ReportAdapterInput](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L162-L167).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| schemaVersion | no | yes | `readonly schemaVersion: 'report-adapter-input.v1';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L163-L163) |
| mediaType | no | yes | `readonly mediaType: string;` | [mediaType](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L164-L164) |
| bytes | no | yes | `readonly bytes: Uint8Array;` | [bytes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L165-L165) |
| limits | no | yes | `readonly limits: ReportAdapterLimits;` | [limits](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L166-L166) |

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `ReportAdapterLimits`
- `Uint8Array`

## ReportAdapterLimits

Import: `@kubeclaw/plugin-sdk`. Kind: type.

maximumCases, maximumFindings and maximumCaseFindings bound returned detail. This interface contains no default values or process/memory/time limits. Buster checks its wider runtime limits and rejects output arrays above these bounds.

```ts
ReportAdapterLimits
```

**Consumer example — source-only fragment:**

```ts
const limits: ReportAdapterLimits = {maximumCases:100,maximumFindings:100,maximumCaseFindings:10};
```

Source: [ReportAdapterLimits](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L156-L160).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| maximumCases | no | yes | `readonly maximumCases: number;` | [maximumCases](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L157-L157) |
| maximumFindings | no | yes | `readonly maximumFindings: number;` | [maximumFindings](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L158-L158) |
| maximumCaseFindings | no | yes | `readonly maximumCaseFindings: number;` | [maximumCaseFindings](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L159-L159) |

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

## ReportAdapterOutput

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Counts, case list and finding list are required; duration and truncation metadata are required by the test-gate contract. This is the callback-owned subset, not the final provenance-bearing ReportAdapterResultV1. Buster adds adapter/source fields, validates the full contract and count limits.

```ts
Pick<ReportAdapterResultV1, "durationMs" | "casesTruncated" | "omittedCaseCount" | "findingsTruncated" | "omittedFindingCount"> & { readonly counts: ReportCountsV1; readonly cases: ReportCaseV1[]; readonly findings: FindingV1[]; }
```

**Consumer example — source-only fragment:**

```ts
const cases: ReportAdapterOutput['cases'] = [];
```

Source: [ReportAdapterOutput](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L169-L180).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| counts | no | yes | `readonly counts: ReportCountsV1;` | [counts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L177-L177) |
| cases | no | yes | `readonly cases: ReportCaseV1[];` | [cases](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L178-L178) |
| findings | no | yes | `readonly findings: FindingV1[];` | [findings](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L179-L179) |
| durationMs | no | no | `durationMs: number` | [durationMs](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L367-L367) |
| casesTruncated | no | no | `casesTruncated: boolean` | [casesTruncated](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L369-L369) |
| omittedCaseCount | no | no | `omittedCaseCount: number` | [omittedCaseCount](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L370-L370) |
| findingsTruncated | no | no | `findingsTruncated: boolean` | [findingsTruncated](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L372-L372) |
| omittedFindingCount | no | no | `omittedFindingCount: number` | [omittedFindingCount](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L373-L373) |

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `FindingV1`
- `Pick`
- `ReportAdapterResultV1`
- `ReportCaseV1`
- `ReportCountsV1`

## ReportAdapterRegistration

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Manifest report parser registration identifies format, positive contract version, module/export and 1–32 unique media types. It is distinct from a capability adapter registration. Registering it does not give an invoke context.

```ts
ReportAdapterRegistration
```

**Consumer example — source-only fragment:**

```ts
const media: ReportAdapterRegistration['mediaTypes'] = ['application/xml'];
```

Source: [ReportAdapterRegistration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L434-L445).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| id | no | no | `id: LocalId;` | [id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L435-L435) |
| format | no | no | `format: LocalId;` | [format](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L436-L436) |
| contractVersion | no | no | `contractVersion: number;` | [contractVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L437-L437) |
| module | no | no | `module: RelativeModulePath;` | [module](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L438-L438) |
| export | no | no | `export: string;` | [export](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L439-L439) |
| mediaTypes | no | no | `mediaTypes: [string, ...string[]];` | [mediaTypes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L444-L444) |

Owning schema: [#/$defs/reportAdapterRegistration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/reportAdapterRegistration | `{"type":"object","additionalProperties":false,"required":["id","format","contractVersion","module","export","mediaTypes"]}` | [#/$defs/reportAdapterRegistration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L391-L409) |
| #/$defs/reportAdapterRegistration/properties/id | `{"$ref":"#/$defs/localId"}` | [#/$defs/reportAdapterRegistration/properties/id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L396-L396) |
| #/$defs/reportAdapterRegistration/properties/format | `{"$ref":"#/$defs/localId"}` | [#/$defs/reportAdapterRegistration/properties/format](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L397-L397) |
| #/$defs/reportAdapterRegistration/properties/contractVersion | `{"type":"integer","minimum":1}` | [#/$defs/reportAdapterRegistration/properties/contractVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L398-L398) |
| #/$defs/reportAdapterRegistration/properties/module | `{"$ref":"#/$defs/relativeModulePath"}` | [#/$defs/reportAdapterRegistration/properties/module](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L399-L399) |
| #/$defs/reportAdapterRegistration/properties/export | `{"type":"string","pattern":"^[A-Za-z_$][A-Za-z0-9_$]*$"}` | [#/$defs/reportAdapterRegistration/properties/export](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L400-L400) |
| #/$defs/reportAdapterRegistration/properties/mediaTypes | `{"type":"array","minItems":1,"maxItems":32,"uniqueItems":true}` | [#/$defs/reportAdapterRegistration/properties/mediaTypes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L401-L407) |
| #/$defs/reportAdapterRegistration/properties/mediaTypes/items | `{"type":"string","minLength":1,"maxLength":256}` | [#/$defs/reportAdapterRegistration/properties/mediaTypes/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L406-L406) |

Referenced types:

- `LocalId`
- `RelativeModulePath`

## ResourceIdentity

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Capability-owned resource type and nonempty canonical ID. Canonical IDs can be URLs, absolute paths, dot or catalogue keys; this schema does not apply a universal path grammar. The selected capability implementation checks its own resource and authorization rules.

```ts
ResourceIdentity
```

**Consumer example — source-only fragment:**

```ts
const resource: ResourceIdentity = {type:'example.object',canonicalId:'item1'};
```

Source: [ResourceIdentity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L291-L294).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| type | no | no | `type: NamespacedId;` | [type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L292-L292) |
| canonicalId | no | no | `canonicalId: string;` | [canonicalId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L293-L293) |

Owning schema: [#/$defs/resourceIdentity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/resourceIdentity | `{"description":"Capability-owned resource names include URLs, absolute paths, dot and catalog keys. Capability implementations retain their own URL, path and authorization constraints.","type":"object","additionalProperties":false,"required":["type","canonicalId"]}` | [#/$defs/resourceIdentity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L92-L101) |
| #/$defs/resourceIdentity/properties/type | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/resourceIdentity/properties/type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L98-L98) |
| #/$defs/resourceIdentity/properties/canonicalId | `{"type":"string","minLength":1}` | [#/$defs/resourceIdentity/properties/canonicalId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L99-L99) |

Referenced types:

- `NamespacedId`

## ResourceLock

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Core lock record binds resource, owner lease/activation ID and positive fencingToken with state and expiry. A fence rejects operations whose lock is no longer current. The record alone does not acquire/renew a lock; check the invocation fence at the external-effect boundary.

```ts
ResourceLock
```

**Consumer example — source-only fragment:**

```ts
const status: ResourceLock['status'] = 'active';
```

Source: [ResourceLock](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L673-L683).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| schemaVersion | no | no | `schemaVersion: 'resource-lock.v2';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L674-L674) |
| lockId | no | no | `lockId: OpaqueId;` | [lockId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L675-L675) |
| resource | no | no | `resource: ResourceIdentity;` | [resource](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L676-L676) |
| ownerLeaseId | no | no | `ownerLeaseId: OpaqueId \| AdapterActivationId;` | [ownerLeaseId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L677-L677) |
| fencingToken | no | no | `fencingToken: number;` | [fencingToken](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L678-L678) |
| status | no | no | `status: 'active' \| 'released' \| 'expired';` | [status](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L679-L679) |
| acquiredAt | no | no | `acquiredAt: string;` | [acquiredAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L680-L680) |
| expiresAt | no | no | `expiresAt: string;` | [expiresAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L681-L681) |
| releasedAt | yes | no | `releasedAt?: string;` | [releasedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L682-L682) |

Owning schema: [#/$defs/resourceLock](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/resourceLock | `{"type":"object","additionalProperties":false,"required":["schemaVersion","lockId","resource","ownerLeaseId","fencingToken","status","acquiredAt","expiresAt"]}` | [#/$defs/resourceLock](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1136-L1154) |
| #/$defs/resourceLock/properties/schemaVersion | `{"const":"resource-lock.v2"}` | [#/$defs/resourceLock/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1144-L1144) |
| #/$defs/resourceLock/properties/lockId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/resourceLock/properties/lockId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1145-L1145) |
| #/$defs/resourceLock/properties/resource | `{"$ref":"#/$defs/resourceIdentity"}` | [#/$defs/resourceLock/properties/resource](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1146-L1146) |
| #/$defs/resourceLock/properties/ownerLeaseId | `{}` | [#/$defs/resourceLock/properties/ownerLeaseId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1147-L1147) |
| #/$defs/resourceLock/properties/ownerLeaseId/anyOf/0 | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/resourceLock/properties/ownerLeaseId/anyOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1147-L1147) |
| #/$defs/resourceLock/properties/ownerLeaseId/anyOf/1 | `{"$ref":"#/$defs/adapterActivationId"}` | [#/$defs/resourceLock/properties/ownerLeaseId/anyOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1147-L1147) |
| #/$defs/resourceLock/properties/fencingToken | `{"type":"integer","minimum":1}` | [#/$defs/resourceLock/properties/fencingToken](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1148-L1148) |
| #/$defs/resourceLock/properties/status | `{"enum":["active","released","expired"]}` | [#/$defs/resourceLock/properties/status](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1149-L1149) |
| #/$defs/resourceLock/properties/acquiredAt | `{"type":"string","format":"date-time"}` | [#/$defs/resourceLock/properties/acquiredAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1150-L1150) |
| #/$defs/resourceLock/properties/expiresAt | `{"type":"string","format":"date-time"}` | [#/$defs/resourceLock/properties/expiresAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1151-L1151) |
| #/$defs/resourceLock/properties/releasedAt | `{"type":"string","format":"date-time"}` | [#/$defs/resourceLock/properties/releasedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1152-L1152) |

Referenced types:

- `AdapterActivationId`
- `OpaqueId`
- `ResourceIdentity`

## ResultBase

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Generated shared stage-result base shape requires version, outcome and artifact array; reason is optional at this base level. It is intentionally broader than the outcome-specific StageResult union and must not replace final stage result validation.

```ts
ResultBase
```

**Consumer example — source-only fragment:**

```ts
const outcome: ResultBase['outcome'] = 'passed';
```

Source: [ResultBase](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L509-L525).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| schemaVersion | no | no | `schemaVersion: 'stage-result.v2';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L510-L510) |
| outcome | no | no | `outcome:     \| 'passed'     \| 'retry'     \| 'request_fix'     \| 'wait'     \| 'orchestrator_required'     \| 'blocked'     \| 'failed'     \| 'timed_out'     \| 'rate_limited'     \| 'cancelled';` | [outcome](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L511-L521) |
| reason | yes | no | `reason?: Reason;` | [reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L522-L522) |
| artifacts | no | no | `artifacts: ArtifactRef[];` | [artifacts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L523-L523) |
| [index] | no | no | `[k: string]: any;` | [skills/common/plugin-runtime/sdk/src/generated/contracts.ts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L524-L524) |

Owning schema: [#/$defs/resultBase](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/resultBase | `{"type":"object","required":["schemaVersion","outcome","artifacts"]}` | [#/$defs/resultBase](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L578-L596) |
| #/$defs/resultBase/properties/schemaVersion | `{"const":"stage-result.v2"}` | [#/$defs/resultBase/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L582-L582) |
| #/$defs/resultBase/properties/outcome | `{"enum":["passed","retry","request_fix","wait","orchestrator_required","blocked","failed","timed_out","rate_limited","cancelled"]}` | [#/$defs/resultBase/properties/outcome](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L583-L588) |
| #/$defs/resultBase/properties/reason | `{"$ref":"#/$defs/reason"}` | [#/$defs/resultBase/properties/reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L589-L589) |
| #/$defs/resultBase/properties/artifacts | `{"type":"array","uniqueItems":true}` | [#/$defs/resultBase/properties/artifacts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L590-L594) |
| #/$defs/resultBase/properties/artifacts/items | `{"$ref":"#/$defs/artifactRef"}` | [#/$defs/resultBase/properties/artifacts/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L592-L592) |

Referenced types:

- `ArtifactRef`
- `Reason`

## ResumeSignal

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Versioned signal binds idempotency, wait ID, signal type, authorized issuer identity, time and payload. Matching the shape is not authorization; the runtime compares it to the selected wait and issuer before continuation.

```ts
ResumeSignal
```

**Consumer example — source-only fragment:**

```ts
const version: ResumeSignal['schemaVersion'] = 'resume-signal.v2';
```

Source: [ResumeSignal](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L543-L555).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| schemaVersion | no | no | `schemaVersion: 'resume-signal.v2';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L544-L544) |
| signalId | no | no | `signalId: OpaqueId;` | [signalId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L545-L545) |
| idempotencyKey | no | no | `idempotencyKey: OpaqueId;` | [idempotencyKey](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L546-L546) |
| waitId | no | no | `waitId: OpaqueId;` | [waitId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L547-L547) |
| signalType | no | no | `signalType: NamespacedId;` | [signalType](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L548-L548) |
| issuer | no | no | `issuer: {     type: 'orchestrator' \| 'operator' \| 'adapter';     id: OpaqueId;   };` | [issuer](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L549-L552) |
| issuer.type | no | no | `type: 'orchestrator' \| 'operator' \| 'adapter';` | [type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L550-L550) |
| issuer.id | no | no | `id: OpaqueId;` | [id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L551-L551) |
| issuedAt | no | no | `issuedAt: string;` | [issuedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L553-L553) |
| payload | no | no | `payload: JsonObject;` | [payload](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L554-L554) |

Owning schema: [#/$defs/resumeSignal](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/resumeSignal | `{"type":"object","additionalProperties":false,"required":["schemaVersion","signalId","idempotencyKey","waitId","signalType","issuer","issuedAt","payload"]}` | [#/$defs/resumeSignal](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L777-L802) |
| #/$defs/resumeSignal/properties/schemaVersion | `{"const":"resume-signal.v2"}` | [#/$defs/resumeSignal/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L785-L785) |
| #/$defs/resumeSignal/properties/signalId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/resumeSignal/properties/signalId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L786-L786) |
| #/$defs/resumeSignal/properties/idempotencyKey | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/resumeSignal/properties/idempotencyKey](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L787-L787) |
| #/$defs/resumeSignal/properties/waitId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/resumeSignal/properties/waitId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L788-L788) |
| #/$defs/resumeSignal/properties/signalType | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/resumeSignal/properties/signalType](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L789-L789) |
| #/$defs/resumeSignal/properties/issuer | `{"type":"object","additionalProperties":false,"required":["type","id"]}` | [#/$defs/resumeSignal/properties/issuer](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L790-L798) |
| #/$defs/resumeSignal/properties/issuer/properties/type | `{"enum":["orchestrator","operator","adapter"]}` | [#/$defs/resumeSignal/properties/issuer/properties/type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L795-L795) |
| #/$defs/resumeSignal/properties/issuer/properties/id | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/resumeSignal/properties/issuer/properties/id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L796-L796) |
| #/$defs/resumeSignal/properties/issuedAt | `{"type":"string","format":"date-time"}` | [#/$defs/resumeSignal/properties/issuedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L799-L799) |
| #/$defs/resumeSignal/properties/payload | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/resumeSignal/properties/payload](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L800-L800) |

Referenced types:

- `JsonObject`
- `NamespacedId`
- `OpaqueId`

## ReviewCacheProfile

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Finite current cache producer contract. recordVersion is review-content-cache.v2 and encoding is json-utf16-v1. Historical absence retains review-content-cache.v1 and its original operations. No other encoding/profile/version selects it implicitly.

```ts
{ schemaVersion: "review-cache-profile.v1"; recordVersion: "review-content-cache.v2"; encoding: "json-utf16-v1"; }
```

**Consumer example — source-only fragment:**

```ts
const profile: ReviewCacheProfile = CURRENT_REVIEW_CACHE_PROFILE;
```

Source: [ReviewCacheProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L6-L10).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| schemaVersion | no | no | `schemaVersion: 'review-cache-profile.v1';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L7-L7) |
| recordVersion | no | no | `recordVersion: 'review-content-cache.v2';` | [recordVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L8-L8) |
| encoding | no | no | `encoding: 'json-utf16-v1';` | [encoding](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L9-L9) |

Owning schema: [#/$defs/reviewCacheProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/reviewCacheProfile | `{"description":"Explicit immutable run-owned review cache producer profile. Historical absence preserves review-content-cache.v1 and its original effect operations.","const":{"schemaVersion":"review-cache-profile.v1","recordVersion":"review-content-cache.v2","encoding":"json-utf16-v1"}}` | [#/$defs/reviewCacheProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L6-L9) |

## ReviewSource

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Source selection binds project, absolute repository root, architecture ref and relative paths. For dense plain-JSON input, optional identityEncoding selects portable and omission selects legacy. The local parseReviewSource checks text/path bounds but is not strict validation of arbitrary unknown objects. Its entry describes limits for inherited fields, getters/proxies and sparse paths.

```ts
ReviewSource
```

**Consumer example — source-only fragment:**

```ts
const source: ReviewSource = {projectId:'project1',repositoryRoot:'/repo',architectureRef:'main',paths:['design.md']};
```

Source: [ReviewSource](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L4-L10).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| identityEncoding | yes | yes | `readonly identityEncoding?: typeof PORTABLE_JSON_ENCODING;` | [identityEncoding](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L5-L5) |
| projectId | no | yes | `readonly projectId: string;` | [projectId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L6-L6) |
| repositoryRoot | no | yes | `readonly repositoryRoot: string;` | [repositoryRoot](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L7-L7) |
| architectureRef | no | yes | `readonly architectureRef: string;` | [architectureRef](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L8-L8) |
| paths | no | yes | `readonly paths: readonly string[];` | [paths](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L9-L9) |

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

## ReviewSubject

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Frozen review identity extends ReviewSource with current run, source/architecture revisions, input digest, ordered file content/mode/digest/size and subject digest. File bytes come from the architecture revision, not necessarily current HEAD. parse validates content binding; verify also checks current repository revisions.

```ts
ReviewSubject
```

**Consumer example — source-only fragment:**

```ts
const mode: ReviewSubject['files'][number]['mode'] = '100644';
```

Source: [ReviewSubject](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L11-L18).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| runId | no | yes | `readonly runId: string;` | [runId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L12-L12) |
| sourceRevision | no | yes | `readonly sourceRevision: string;` | [sourceRevision](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L13-L13) |
| architectureRevision | no | yes | `readonly architectureRevision: string;` | [architectureRevision](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L14-L14) |
| inputDigest | no | yes | `readonly inputDigest: string;` | [inputDigest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L15-L15) |
| files | no | yes | `readonly files: readonly { readonly path: string; readonly mode: '100644' \| '100755'; readonly content: string; readonly digest: string; readonly sizeBytes: number }[];` | [files](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L16-L16) |
| files.path | no | yes | `readonly path: string;` | [path](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L16-L16) |
| files.mode | no | yes | `readonly mode: '100644' \| '100755';` | [mode](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L16-L16) |
| files.content | no | yes | `readonly content: string;` | [content](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L16-L16) |
| files.digest | no | yes | `readonly digest: string;` | [digest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L16-L16) |
| files.sizeBytes | no | yes | `readonly sizeBytes: number` | [sizeBytes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L16-L16) |
| digest | no | yes | `readonly digest: string;` | [digest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L17-L17) |
| identityEncoding | yes | yes | `identityEncoding?: "kubeclaw-json.utf16.v1"` | [identityEncoding](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L5-L5) |
| projectId | no | yes | `projectId: string` | [projectId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L6-L6) |
| repositoryRoot | no | yes | `repositoryRoot: string` | [repositoryRoot](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L7-L7) |
| architectureRef | no | yes | `architectureRef: string` | [architectureRef](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L8-L8) |
| paths | no | yes | `paths: readonly string[]` | [paths](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L9-L9) |

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

## RuntimeDispatchProfile

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Finite runtime transport contract with runtime-dispatch-profile.v1 and json-utf16-v1. Context absence preserves historical transport. It is not an artifact encoding token or a review-cache profile.

```ts
{ schemaVersion: "runtime-dispatch-profile.v1"; encoding: "json-utf16-v1"; }
```

**Consumer example — source-only fragment:**

```ts
const profile: RuntimeDispatchProfile = CURRENT_RUNTIME_DISPATCH_PROFILE;
```

Source: [RuntimeDispatchProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L14-L14).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| schemaVersion | no | no | `schemaVersion: 'runtime-dispatch-profile.v1';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L14-L14) |
| encoding | no | no | `encoding: 'json-utf16-v1'` | [encoding](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L14-L14) |

Owning schema: [#/$defs/runtimeDispatchProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/runtimeDispatchProfile | `{"description":"Explicit current runtime transport producer profile. Absence in historical contexts preserves the legacy producer; no profile is inferred from another digest version.","const":{"schemaVersion":"runtime-dispatch-profile.v1","encoding":"json-utf16-v1"}}` | [#/$defs/runtimeDispatchProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L10-L13) |

## RuntimeRunEdge

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Graph edge connects from/to node identifiers. Schema requires strings but does not impose LocalId grammar here or check that the nodes exist. Graph compilation owns that adjacent check.

```ts
RuntimeRunEdge
```

**Consumer example — source-only fragment:**

```ts
const edge: RuntimeRunEdge = {from:'build',to:'test'};
```

Source: [RuntimeRunEdge](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L307-L310).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| from | no | no | `from: string;` | [from](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L308-L308) |
| to | no | no | `to: string;` | [to](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L309-L309) |

Owning schema: [#/$defs/runtimeRunEdge](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/runtimeRunEdge | `{"type":"object","additionalProperties":false,"required":["from","to"]}` | [#/$defs/runtimeRunEdge](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L41-L44) |
| #/$defs/runtimeRunEdge/properties/from | `{"type":"string"}` | [#/$defs/runtimeRunEdge/properties/from](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L43-L43) |
| #/$defs/runtimeRunEdge/properties/to | `{"type":"string"}` | [#/$defs/runtimeRunEdge/properties/to](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L43-L43) |

## RuntimeRunGraph

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Frozen execution graph snapshot accepts v2 or v3, includes pipeline ID, positive concurrency, nodes, ordinary/remediation edges and digest. JsonObject nodes are not a fully validated node model in this SDK type. Snapshot verification belongs to the runtime.

```ts
RuntimeRunGraph
```

**Consumer example — source-only fragment:**

```ts
const version: RuntimeRunGraph['schemaVersion'] = 'execution-graph-snapshot.v3';
```

Source: [RuntimeRunGraph](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L298-L306).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| schemaVersion | no | no | `schemaVersion: 'execution-graph-snapshot.v2' \| 'execution-graph-snapshot.v3';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L299-L299) |
| pipelineId | no | no | `pipelineId: OpaqueId;` | [pipelineId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L300-L300) |
| maxConcurrency | no | no | `maxConcurrency: number;` | [maxConcurrency](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L301-L301) |
| nodes | no | no | `nodes: JsonObject[];` | [nodes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L302-L302) |
| ordinaryEdges | no | no | `ordinaryEdges: RuntimeRunEdge[];` | [ordinaryEdges](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L303-L303) |
| remediationEdges | no | no | `remediationEdges: RuntimeRunEdge[];` | [remediationEdges](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L304-L304) |
| digest | no | no | `digest: string;` | [digest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L305-L305) |

Owning schema: [#/$defs/runtimeRunGraph](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/runtimeRunGraph | `{"type":"object","additionalProperties":false,"required":["schemaVersion","pipelineId","maxConcurrency","nodes","ordinaryEdges","remediationEdges","digest"]}` | [#/$defs/runtimeRunGraph](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L28-L40) |
| #/$defs/runtimeRunGraph/properties/schemaVersion | `{"enum":["execution-graph-snapshot.v2","execution-graph-snapshot.v3"]}` | [#/$defs/runtimeRunGraph/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L32-L32) |
| #/$defs/runtimeRunGraph/properties/pipelineId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/runtimeRunGraph/properties/pipelineId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L33-L33) |
| #/$defs/runtimeRunGraph/properties/maxConcurrency | `{"type":"integer","minimum":1}` | [#/$defs/runtimeRunGraph/properties/maxConcurrency](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L34-L34) |
| #/$defs/runtimeRunGraph/properties/nodes | `{"type":"array"}` | [#/$defs/runtimeRunGraph/properties/nodes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L35-L35) |
| #/$defs/runtimeRunGraph/properties/nodes/items | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/runtimeRunGraph/properties/nodes/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L35-L35) |
| #/$defs/runtimeRunGraph/properties/ordinaryEdges | `{"type":"array"}` | [#/$defs/runtimeRunGraph/properties/ordinaryEdges](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L36-L36) |
| #/$defs/runtimeRunGraph/properties/ordinaryEdges/items | `{"$ref":"#/$defs/runtimeRunEdge"}` | [#/$defs/runtimeRunGraph/properties/ordinaryEdges/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L36-L36) |
| #/$defs/runtimeRunGraph/properties/remediationEdges | `{"type":"array"}` | [#/$defs/runtimeRunGraph/properties/remediationEdges](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L37-L37) |
| #/$defs/runtimeRunGraph/properties/remediationEdges/items | `{"$ref":"#/$defs/runtimeRunEdge"}` | [#/$defs/runtimeRunGraph/properties/remediationEdges/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L37-L37) |
| #/$defs/runtimeRunGraph/properties/digest | `{"type":"string","pattern":"^sha256:[a-f0-9]{64}$"}` | [#/$defs/runtimeRunGraph/properties/digest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L38-L38) |

Referenced types:

- `JsonObject`
- `OpaqueId`
- `RuntimeRunEdge`

## RuntimeRunSnapshot

Import: `@kubeclaw/plugin-sdk`. Kind: type.

run-snapshot.v3 binds graph, registry, digest and required runtime dispatch profile. It has no review cache profile field in this schema. Do not interpret the snapshot version as selecting a cache encoding.

```ts
RuntimeRunSnapshot
```

**Consumer example — source-only fragment:**

```ts
const version: RuntimeRunSnapshot['schemaVersion'] = 'run-snapshot.v3';
```

Source: [RuntimeRunSnapshot](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L311-L317).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| schemaVersion | no | no | `schemaVersion: 'run-snapshot.v3';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L312-L312) |
| graph | no | no | `graph: RuntimeRunGraph;` | [graph](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L313-L313) |
| registry | no | no | `registry: JsonObject;` | [registry](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L314-L314) |
| digest | no | no | `digest: string;` | [digest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L315-L315) |
| runtimeDispatchProfile | no | no | `runtimeDispatchProfile: RuntimeDispatchProfile;` | [runtimeDispatchProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L316-L316) |

Owning schema: [#/$defs/runtimeRunSnapshot](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/runtimeRunSnapshot | `{"type":"object","additionalProperties":false,"required":["schemaVersion","graph","registry","digest","runtimeDispatchProfile"]}` | [#/$defs/runtimeRunSnapshot](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L45-L55) |
| #/$defs/runtimeRunSnapshot/properties/schemaVersion | `{"const":"run-snapshot.v3"}` | [#/$defs/runtimeRunSnapshot/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L49-L49) |
| #/$defs/runtimeRunSnapshot/properties/graph | `{"$ref":"#/$defs/runtimeRunGraph"}` | [#/$defs/runtimeRunSnapshot/properties/graph](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L50-L50) |
| #/$defs/runtimeRunSnapshot/properties/registry | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/runtimeRunSnapshot/properties/registry](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L51-L51) |
| #/$defs/runtimeRunSnapshot/properties/digest | `{"type":"string","pattern":"^sha256:[a-f0-9]{64}$"}` | [#/$defs/runtimeRunSnapshot/properties/digest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L52-L52) |
| #/$defs/runtimeRunSnapshot/properties/runtimeDispatchProfile | `{"$ref":"#/$defs/runtimeDispatchProfile"}` | [#/$defs/runtimeRunSnapshot/properties/runtimeDispatchProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L53-L53) |

Referenced types:

- `JsonObject`
- `RuntimeDispatchProfile`
- `RuntimeRunGraph`

## RuntimeRunSnapshotV4

Import: `@kubeclaw/plugin-sdk`. Kind: type.

run-snapshot.v4 requires both independent runtime dispatch and review cache profiles with graph, registry and digest. The version does not authorize deriving either from artifact encoding. Both explicit profiles must satisfy their finite contracts.

```ts
RuntimeRunSnapshotV4
```

**Consumer example — source-only fragment:**

```ts
const version: RuntimeRunSnapshotV4['schemaVersion'] = 'run-snapshot.v4';
```

Source: [RuntimeRunSnapshotV4](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L318-L325).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| schemaVersion | no | no | `schemaVersion: 'run-snapshot.v4';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L319-L319) |
| graph | no | no | `graph: RuntimeRunGraph;` | [graph](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L320-L320) |
| registry | no | no | `registry: JsonObject;` | [registry](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L321-L321) |
| digest | no | no | `digest: string;` | [digest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L322-L322) |
| runtimeDispatchProfile | no | no | `runtimeDispatchProfile: RuntimeDispatchProfile;` | [runtimeDispatchProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L323-L323) |
| reviewCacheProfile | no | no | `reviewCacheProfile: ReviewCacheProfile;` | [reviewCacheProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L324-L324) |

Owning schema: [#/$defs/runtimeRunSnapshotV4](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/runtimeRunSnapshotV4 | `{"type":"object","additionalProperties":false,"required":["schemaVersion","graph","registry","digest","runtimeDispatchProfile","reviewCacheProfile"]}` | [#/$defs/runtimeRunSnapshotV4](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L56-L67) |
| #/$defs/runtimeRunSnapshotV4/properties/schemaVersion | `{"const":"run-snapshot.v4"}` | [#/$defs/runtimeRunSnapshotV4/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L60-L60) |
| #/$defs/runtimeRunSnapshotV4/properties/graph | `{"$ref":"#/$defs/runtimeRunGraph"}` | [#/$defs/runtimeRunSnapshotV4/properties/graph](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L61-L61) |
| #/$defs/runtimeRunSnapshotV4/properties/registry | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/runtimeRunSnapshotV4/properties/registry](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L62-L62) |
| #/$defs/runtimeRunSnapshotV4/properties/digest | `{"type":"string","pattern":"^sha256:[a-f0-9]{64}$"}` | [#/$defs/runtimeRunSnapshotV4/properties/digest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L63-L63) |
| #/$defs/runtimeRunSnapshotV4/properties/runtimeDispatchProfile | `{"$ref":"#/$defs/runtimeDispatchProfile"}` | [#/$defs/runtimeRunSnapshotV4/properties/runtimeDispatchProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L64-L64) |
| #/$defs/runtimeRunSnapshotV4/properties/reviewCacheProfile | `{"$ref":"#/$defs/reviewCacheProfile"}` | [#/$defs/runtimeRunSnapshotV4/properties/reviewCacheProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L65-L65) |

Referenced types:

- `JsonObject`
- `ReviewCacheProfile`
- `RuntimeDispatchProfile`
- `RuntimeRunGraph`

## RuntimeWorkspaceReference

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Git adapter-issued workspace record binds repository/workspace roots, path, branch, source revision and attempt owner under runtime-workspace.v1. parse checks shape and owner equality; runtime separately checks the protected owner record. A supplied object is not proof that the workspace belongs to the caller.

```ts
RuntimeWorkspaceReference
```

**Consumer example — source-only fragment:**

```ts
const version: RuntimeWorkspaceReference['schemaVersion'] = 'runtime-workspace.v1';
```

Source: [RuntimeWorkspaceReference](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime-workspace.ts#L5-L13).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| schemaVersion | no | yes | `readonly schemaVersion: 'runtime-workspace.v1';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime-workspace.ts#L6-L6) |
| repositoryRoot | no | yes | `readonly repositoryRoot: string;` | [repositoryRoot](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime-workspace.ts#L7-L7) |
| workspaceRoot | no | yes | `readonly workspaceRoot: string;` | [workspaceRoot](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime-workspace.ts#L8-L8) |
| workspacePath | no | yes | `readonly workspacePath: string;` | [workspacePath](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime-workspace.ts#L9-L9) |
| branch | no | yes | `readonly branch: string;` | [branch](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime-workspace.ts#L10-L10) |
| sourceRevision | no | yes | `readonly sourceRevision: string;` | [sourceRevision](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime-workspace.ts#L11-L11) |
| owner | no | yes | `readonly owner: AttemptIdentity;` | [owner](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime-workspace.ts#L12-L12) |

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `AttemptIdentity`

## SourceBinding

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Select a preflight stage and exact input digest, optionally a review stage. Optional identityEncoding selects the source identity codec and must agree with the preflight subject. This binding is selection data, not an approval artifact or capability grant.

```ts
SourceBinding
```

**Consumer example — source-only fragment:**

```ts
const binding: SourceBinding = {stageId:'preflight',inputDigest:sha256Text('{}')};
```

Source: [SourceBinding](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/source-preflight.ts#L6-L11).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| identityEncoding | yes | yes | `readonly identityEncoding?: typeof PORTABLE_JSON_ENCODING;` | [identityEncoding](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/source-preflight.ts#L7-L7) |
| stageId | no | yes | `readonly stageId: string;` | [stageId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/source-preflight.ts#L8-L8) |
| inputDigest | no | yes | `readonly inputDigest: string;` | [inputDigest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/source-preflight.ts#L9-L9) |
| reviewStageId | yes | yes | `readonly reviewStageId?: string;` | [reviewStageId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/source-preflight.ts#L10-L10) |

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

## StageAttempt

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Core attempt state links identity, owner registration, stage type and lease with retry/remediation counters and timestamps. Status values: created/dispatched/completed/timed_out/cancelled. Optional finish/dispatch times are data, not timers. The shape alone does not establish successful stage outcome.

```ts
StageAttempt
```

**Consumer example — source-only fragment:**

```ts
const status: StageAttempt['status'] = 'created';
```

Source: [StageAttempt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L484-L496).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| schemaVersion | no | no | `schemaVersion: 'stage-attempt.v2';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L485-L485) |
| identity | no | no | `identity: AttemptIdentity;` | [identity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L486-L486) |
| owner | no | no | `owner: PackageResolution;` | [owner](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L487-L487) |
| stageType | no | no | `stageType: NamespacedId;` | [stageType](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L488-L488) |
| leaseId | no | no | `leaseId: OpaqueId;` | [leaseId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L489-L489) |
| status | no | no | `status: 'created' \| 'dispatched' \| 'completed' \| 'timed_out' \| 'cancelled';` | [status](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L490-L490) |
| retryBudgetUsed | no | no | `retryBudgetUsed: number;` | [retryBudgetUsed](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L491-L491) |
| remediationBudgetUsed | no | no | `remediationBudgetUsed: number;` | [remediationBudgetUsed](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L492-L492) |
| createdAt | no | no | `createdAt: string;` | [createdAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L493-L493) |
| dispatchedAt | yes | no | `dispatchedAt?: string;` | [dispatchedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L494-L494) |
| finishedAt | yes | no | `finishedAt?: string;` | [finishedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L495-L495) |

Owning schema: [#/$defs/stageAttempt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/stageAttempt | `{"type":"object","additionalProperties":false,"required":["schemaVersion","identity","owner","stageType","leaseId","status","retryBudgetUsed","remediationBudgetUsed","createdAt"]}` | [#/$defs/stageAttempt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L541-L563) |
| #/$defs/stageAttempt/properties/schemaVersion | `{"const":"stage-attempt.v2"}` | [#/$defs/stageAttempt/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L549-L549) |
| #/$defs/stageAttempt/properties/identity | `{"$ref":"#/$defs/attemptIdentity"}` | [#/$defs/stageAttempt/properties/identity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L550-L550) |
| #/$defs/stageAttempt/properties/owner | `{"$ref":"#/$defs/packageResolution"}` | [#/$defs/stageAttempt/properties/owner](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L551-L551) |
| #/$defs/stageAttempt/properties/stageType | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/stageAttempt/properties/stageType](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L552-L552) |
| #/$defs/stageAttempt/properties/leaseId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/stageAttempt/properties/leaseId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L553-L553) |
| #/$defs/stageAttempt/properties/status | `{"enum":["created","dispatched","completed","timed_out","cancelled"]}` | [#/$defs/stageAttempt/properties/status](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L554-L556) |
| #/$defs/stageAttempt/properties/retryBudgetUsed | `{"type":"integer","minimum":0}` | [#/$defs/stageAttempt/properties/retryBudgetUsed](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L557-L557) |
| #/$defs/stageAttempt/properties/remediationBudgetUsed | `{"type":"integer","minimum":0}` | [#/$defs/stageAttempt/properties/remediationBudgetUsed](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L558-L558) |
| #/$defs/stageAttempt/properties/createdAt | `{"type":"string","format":"date-time"}` | [#/$defs/stageAttempt/properties/createdAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L559-L559) |
| #/$defs/stageAttempt/properties/dispatchedAt | `{"type":"string","format":"date-time"}` | [#/$defs/stageAttempt/properties/dispatchedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L560-L560) |
| #/$defs/stageAttempt/properties/finishedAt | `{"type":"string","format":"date-time"}` | [#/$defs/stageAttempt/properties/finishedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L561-L561) |

Referenced types:

- `AttemptIdentity`
- `NamespacedId`
- `OpaqueId`
- `PackageResolution`

## StageDefinition

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Pipeline stage selection includes dependencies, config/input and execution budgets. Optional activation compares a source-stage fact; optional request_fix route chooses remediation. Required maxAttempts/timeout are positive; maxRemediationCycles permits zero. Optional technical retry/repair settings have schema limits; no SDK default is supplied.

```ts
StageDefinition
```

**Consumer example — source-only fragment:**

```ts
const dependencies: StageDefinition['dependsOn'] = [];
```

Source: [StageDefinition](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L446-L474).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| id | no | no | `id: LocalId;` | [id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L447-L447) |
| type | no | no | `type: NamespacedId;` | [type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L448-L448) |
| dependsOn | no | no | `dependsOn: LocalId[];` | [dependsOn](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L449-L449) |
| config | no | no | `config: JsonObject;` | [config](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L450-L450) |
| input | no | no | `input: JsonObject;` | [input](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L451-L451) |
| activation | yes | no | `activation?: {     sourceStage: LocalId;     fact: NamespacedId;     equals: string \| number \| boolean \| null;   };` | [activation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L452-L456) |
| activation.sourceStage | no | no | `sourceStage: LocalId;` | [sourceStage](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L453-L453) |
| activation.fact | no | no | `fact: NamespacedId;` | [fact](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L454-L454) |
| activation.equals | no | no | `equals: string \| number \| boolean \| null;` | [equals](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L455-L455) |
| execution | no | no | `execution: {     maxAttempts: number;     maxRemediationCycles: number;     maxTechnicalRetries?: number;     repairCategory?: LocalId;     repairBudget?: {       categories: {         [k: string]: number;       };       maximumOrchestratorOrders: number;     };     orchestratorAfterAttempt?: number;     timeoutMs: number;   };` | [execution](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L457-L470) |
| execution.maxAttempts | no | no | `maxAttempts: number;` | [maxAttempts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L458-L458) |
| execution.maxRemediationCycles | no | no | `maxRemediationCycles: number;` | [maxRemediationCycles](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L459-L459) |
| execution.maxTechnicalRetries | yes | no | `maxTechnicalRetries?: number;` | [maxTechnicalRetries](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L460-L460) |
| execution.repairCategory | yes | no | `repairCategory?: LocalId;` | [repairCategory](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L461-L461) |
| execution.repairBudget | yes | no | `repairBudget?: {       categories: {         [k: string]: number;       };       maximumOrchestratorOrders: number;     };` | [repairBudget](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L462-L467) |
| execution.repairBudget.categories | no | no | `categories: {         [k: string]: number;       };` | [categories](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L463-L465) |
| execution.repairBudget.categories.[index] | no | no | `[k: string]: number;` | [skills/common/plugin-runtime/sdk/src/generated/contracts.ts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L464-L464) |
| execution.repairBudget.maximumOrchestratorOrders | no | no | `maximumOrchestratorOrders: number;` | [maximumOrchestratorOrders](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L466-L466) |
| execution.orchestratorAfterAttempt | yes | no | `orchestratorAfterAttempt?: number;` | [orchestratorAfterAttempt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L468-L468) |
| execution.timeoutMs | no | no | `timeoutMs: number;` | [timeoutMs](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L469-L469) |
| on | yes | no | `on?: {     request_fix?: LocalId;   };` | [on](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L471-L473) |
| on.request_fix | yes | no | `request_fix?: LocalId;` | [request_fix](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L472-L472) |

Owning schema: [#/$defs/stageDefinition](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/stageDefinition | `{"type":"object","additionalProperties":false,"required":["id","type","dependsOn","config","input","execution"]}` | [#/$defs/stageDefinition](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L450-L514) |
| #/$defs/stageDefinition/properties/id | `{"$ref":"#/$defs/localId"}` | [#/$defs/stageDefinition/properties/id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L455-L455) |
| #/$defs/stageDefinition/properties/type | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/stageDefinition/properties/type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L456-L456) |
| #/$defs/stageDefinition/properties/dependsOn | `{"type":"array","uniqueItems":true}` | [#/$defs/stageDefinition/properties/dependsOn](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L457-L461) |
| #/$defs/stageDefinition/properties/dependsOn/items | `{"$ref":"#/$defs/localId"}` | [#/$defs/stageDefinition/properties/dependsOn/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L459-L459) |
| #/$defs/stageDefinition/properties/config | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/stageDefinition/properties/config](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L462-L462) |
| #/$defs/stageDefinition/properties/input | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/stageDefinition/properties/input](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L463-L463) |
| #/$defs/stageDefinition/properties/activation | `{"type":"object","additionalProperties":false,"required":["sourceStage","fact","equals"]}` | [#/$defs/stageDefinition/properties/activation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L464-L480) |
| #/$defs/stageDefinition/properties/activation/properties/sourceStage | `{"$ref":"#/$defs/localId"}` | [#/$defs/stageDefinition/properties/activation/properties/sourceStage](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L469-L469) |
| #/$defs/stageDefinition/properties/activation/properties/fact | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/stageDefinition/properties/activation/properties/fact](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L470-L470) |
| #/$defs/stageDefinition/properties/activation/properties/equals | `{}` | [#/$defs/stageDefinition/properties/activation/properties/equals](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L471-L478) |
| #/$defs/stageDefinition/properties/activation/properties/equals/oneOf/0 | `{"type":"string"}` | [#/$defs/stageDefinition/properties/activation/properties/equals/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L473-L473) |
| #/$defs/stageDefinition/properties/activation/properties/equals/oneOf/1 | `{"type":"number"}` | [#/$defs/stageDefinition/properties/activation/properties/equals/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L474-L474) |
| #/$defs/stageDefinition/properties/activation/properties/equals/oneOf/2 | `{"type":"boolean"}` | [#/$defs/stageDefinition/properties/activation/properties/equals/oneOf/2](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L475-L475) |
| #/$defs/stageDefinition/properties/activation/properties/equals/oneOf/3 | `{"type":"null"}` | [#/$defs/stageDefinition/properties/activation/properties/equals/oneOf/3](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L476-L476) |
| #/$defs/stageDefinition/properties/execution | `{"type":"object","additionalProperties":false,"required":["maxAttempts","maxRemediationCycles","timeoutMs"]}` | [#/$defs/stageDefinition/properties/execution](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L481-L505) |
| #/$defs/stageDefinition/properties/execution/properties/maxAttempts | `{"type":"integer","minimum":1}` | [#/$defs/stageDefinition/properties/execution/properties/maxAttempts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L486-L486) |
| #/$defs/stageDefinition/properties/execution/properties/maxRemediationCycles | `{"type":"integer","minimum":0}` | [#/$defs/stageDefinition/properties/execution/properties/maxRemediationCycles](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L487-L487) |
| #/$defs/stageDefinition/properties/execution/properties/maxTechnicalRetries | `{"type":"integer","minimum":0,"maximum":100}` | [#/$defs/stageDefinition/properties/execution/properties/maxTechnicalRetries](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L488-L488) |
| #/$defs/stageDefinition/properties/execution/properties/repairCategory | `{"$ref":"#/$defs/localId"}` | [#/$defs/stageDefinition/properties/execution/properties/repairCategory](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L489-L489) |
| #/$defs/stageDefinition/properties/execution/properties/repairBudget | `{"type":"object","additionalProperties":false,"required":["categories","maximumOrchestratorOrders"]}` | [#/$defs/stageDefinition/properties/execution/properties/repairBudget](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L490-L501) |
| #/$defs/stageDefinition/properties/execution/properties/repairBudget/properties/categories | `{"type":"object","minProperties":1,"maxProperties":32,"additionalProperties":{"type":"integer","minimum":0,"maximum":100}}` | [#/$defs/stageDefinition/properties/execution/properties/repairBudget/properties/categories](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L494-L498) |
| #/$defs/stageDefinition/properties/execution/properties/repairBudget/properties/categories/propertyNames | `{"$ref":"#/$defs/localId"}` | [#/$defs/stageDefinition/properties/execution/properties/repairBudget/properties/categories/propertyNames](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L496-L496) |
| #/$defs/stageDefinition/properties/execution/properties/repairBudget/properties/categories/additionalProperties | `{"type":"integer","minimum":0,"maximum":100}` | [#/$defs/stageDefinition/properties/execution/properties/repairBudget/properties/categories/additionalProperties](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L497-L497) |
| #/$defs/stageDefinition/properties/execution/properties/repairBudget/properties/maximumOrchestratorOrders | `{"type":"integer","minimum":0,"maximum":1}` | [#/$defs/stageDefinition/properties/execution/properties/repairBudget/properties/maximumOrchestratorOrders](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L499-L499) |
| #/$defs/stageDefinition/properties/execution/properties/orchestratorAfterAttempt | `{"type":"integer","minimum":1}` | [#/$defs/stageDefinition/properties/execution/properties/orchestratorAfterAttempt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L502-L502) |
| #/$defs/stageDefinition/properties/execution/properties/timeoutMs | `{"type":"integer","minimum":1}` | [#/$defs/stageDefinition/properties/execution/properties/timeoutMs](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L503-L503) |
| #/$defs/stageDefinition/properties/on | `{"type":"object","additionalProperties":false}` | [#/$defs/stageDefinition/properties/on](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L506-L512) |
| #/$defs/stageDefinition/properties/on/properties/request_fix | `{"$ref":"#/$defs/localId"}` | [#/$defs/stageDefinition/properties/on/properties/request_fix](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L510-L510) |

Referenced types:

- `JsonObject`
- `LocalId`
- `NamespacedId`

## StageRegistration

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Manifest stage entry selects module/export and config/input/result schemas plus required capabilities. All listed members are required, including an empty capabilities array when none are needed. It is separate from a pipeline StageDefinition that selects type and execution budgets.

```ts
StageRegistration
```

**Consumer example — source-only fragment:**

```ts
const capabilities: StageRegistration['requiredCapabilities'] = [];
```

Source: [StageRegistration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L345-L354).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| id | no | no | `id: LocalId;` | [id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L346-L346) |
| type | no | no | `type: NamespacedId;` | [type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L347-L347) |
| module | no | no | `module: RelativeModulePath;` | [module](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L348-L348) |
| export | no | no | `export: string;` | [export](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L349-L349) |
| requiredCapabilities | no | no | `requiredCapabilities: NamespacedId[];` | [requiredCapabilities](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L350-L350) |
| configSchema | no | no | `configSchema: RelativeSchemaPath;` | [configSchema](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L351-L351) |
| inputSchema | no | no | `inputSchema: RelativeSchemaPath;` | [inputSchema](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L352-L352) |
| resultSchema | no | no | `resultSchema: RelativeSchemaPath;` | [resultSchema](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L353-L353) |

Owning schema: [#/$defs/stageRegistration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/stageRegistration | `{"type":"object","additionalProperties":false,"required":["id","type","module","export","requiredCapabilities","configSchema","inputSchema","resultSchema"]}` | [#/$defs/stageRegistration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L194-L215) |
| #/$defs/stageRegistration/properties/id | `{"$ref":"#/$defs/localId"}` | [#/$defs/stageRegistration/properties/id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L202-L202) |
| #/$defs/stageRegistration/properties/type | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/stageRegistration/properties/type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L203-L203) |
| #/$defs/stageRegistration/properties/module | `{"$ref":"#/$defs/relativeModulePath"}` | [#/$defs/stageRegistration/properties/module](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L204-L204) |
| #/$defs/stageRegistration/properties/export | `{"type":"string","pattern":"^[A-Za-z_$][A-Za-z0-9_$]*$"}` | [#/$defs/stageRegistration/properties/export](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L205-L205) |
| #/$defs/stageRegistration/properties/requiredCapabilities | `{"type":"array","uniqueItems":true}` | [#/$defs/stageRegistration/properties/requiredCapabilities](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L206-L210) |
| #/$defs/stageRegistration/properties/requiredCapabilities/items | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/stageRegistration/properties/requiredCapabilities/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L208-L208) |
| #/$defs/stageRegistration/properties/configSchema | `{"$ref":"#/$defs/relativeSchemaPath"}` | [#/$defs/stageRegistration/properties/configSchema](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L211-L211) |
| #/$defs/stageRegistration/properties/inputSchema | `{"$ref":"#/$defs/relativeSchemaPath"}` | [#/$defs/stageRegistration/properties/inputSchema](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L212-L212) |
| #/$defs/stageRegistration/properties/resultSchema | `{"$ref":"#/$defs/relativeSchemaPath"}` | [#/$defs/stageRegistration/properties/resultSchema](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L213-L213) |

Referenced types:

- `LocalId`
- `NamespacedId`
- `RelativeModulePath`
- `RelativeSchemaPath`

## StageResult

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Outcome-specific stage result. passed allows facts without reason; retry/request_fix/blocked/failed/timed_out/cancelled requires reason; wait/orchestrator_required also requires wait; rate_limited requires retryAt. Artifact array is required in every variant and may be empty. Runtime handles continuation, not this type.

```ts
(ResultBase & { schemaVersion: "stage-result.v2"; outcome: "passed"; artifacts: ArtifactRef[]; facts?: DecisionFacts; }) | (ResultBase & { schemaVersion: "stage-result.v2"; outcome: "retry" | "request_fix" | "blocked" | "failed" | "timed_out" | "cancelled"; reason: Reason; artifacts: ArtifactRef[]; }) | (ResultBase & { schemaVersion: "stage-result.v2"; outcome: "wait" | "orchestrator_required"; reason: Reason; artifacts: ArtifactRef[]; wait: WaitRequest; }) | (ResultBase & { schemaVersion: "stage-result.v2"; outcome: "rate_limited"; reason: Reason; artifacts: ArtifactRef[]; retryAt: string; })
```

**Consumer example — source-only fragment:**

```ts
const result: StageResult = {schemaVersion:'stage-result.v2',outcome:'passed',artifacts:[]};
```

Source: [StageResult](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L110-L136).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| schemaVersion | no | no | `schemaVersion: 'stage-result.v2';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L112-L112) |
| outcome | no | no | `outcome: 'passed';` | [outcome](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L113-L113) |
| artifacts | no | no | `artifacts: ArtifactRef[];` | [artifacts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L114-L114) |
| facts | yes | no | `facts?: DecisionFacts;` | [facts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L115-L115) |
| schemaVersion | no | no | `schemaVersion: 'stage-result.v2';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L118-L118) |
| outcome | no | no | `outcome: 'retry' \| 'request_fix' \| 'blocked' \| 'failed' \| 'timed_out' \| 'cancelled';` | [outcome](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L119-L119) |
| reason | no | no | `reason: Reason;` | [reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L120-L120) |
| artifacts | no | no | `artifacts: ArtifactRef[];` | [artifacts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L121-L121) |
| schemaVersion | no | no | `schemaVersion: 'stage-result.v2';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L124-L124) |
| outcome | no | no | `outcome: 'wait' \| 'orchestrator_required';` | [outcome](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L125-L125) |
| reason | no | no | `reason: Reason;` | [reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L126-L126) |
| artifacts | no | no | `artifacts: ArtifactRef[];` | [artifacts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L127-L127) |
| wait | no | no | `wait: WaitRequest;` | [wait](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L128-L128) |
| schemaVersion | no | no | `schemaVersion: 'stage-result.v2';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L131-L131) |
| outcome | no | no | `outcome: 'rate_limited';` | [outcome](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L132-L132) |
| reason | no | no | `reason: Reason;` | [reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L133-L133) |
| artifacts | no | no | `artifacts: ArtifactRef[];` | [artifacts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L134-L134) |
| retryAt | no | no | `retryAt: string;` | [retryAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L135-L135) |

**Union variants — read required/optional members within each branch, not only the merged member list:**

Branch 1:

```typescript
ResultBase & { schemaVersion: "stage-result.v2"; outcome: "passed"; artifacts: ArtifactRef[]; facts?: DecisionFacts; }
```

| Member | Optional in this branch | Type | Source |
| --- | --- | --- | --- |
| schemaVersion | no | `"stage-result.v2"` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L510-L510) |
| outcome | no | `"passed"` | [outcome](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L511-L521) |
| reason | yes | `Reason` | [reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L522-L522) |
| artifacts | no | `ArtifactRef[]` | [artifacts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L523-L523) |
| facts | yes | `DecisionFacts` | [facts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L115-L115) |

Branch 2:

```typescript
ResultBase & { schemaVersion: "stage-result.v2"; outcome: "retry" | "request_fix" | "blocked" | "failed" | "timed_out" | "cancelled"; reason: Reason; artifacts: ArtifactRef[]; }
```

| Member | Optional in this branch | Type | Source |
| --- | --- | --- | --- |
| schemaVersion | no | `"stage-result.v2"` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L510-L510) |
| outcome | no | `"retry" \| "request_fix" \| "blocked" \| "failed" \| "timed_out" \| "cancelled"` | [outcome](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L511-L521) |
| reason | no | `Reason` | [reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L522-L522) |
| artifacts | no | `ArtifactRef[]` | [artifacts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L523-L523) |

Branch 3:

```typescript
ResultBase & { schemaVersion: "stage-result.v2"; outcome: "wait" | "orchestrator_required"; reason: Reason; artifacts: ArtifactRef[]; wait: WaitRequest; }
```

| Member | Optional in this branch | Type | Source |
| --- | --- | --- | --- |
| schemaVersion | no | `"stage-result.v2"` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L510-L510) |
| outcome | no | `"wait" \| "orchestrator_required"` | [outcome](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L511-L521) |
| reason | no | `Reason` | [reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L522-L522) |
| artifacts | no | `ArtifactRef[]` | [artifacts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L523-L523) |
| wait | no | `WaitRequest` | [wait](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L128-L128) |

Branch 4:

```typescript
ResultBase & { schemaVersion: "stage-result.v2"; outcome: "rate_limited"; reason: Reason; artifacts: ArtifactRef[]; retryAt: string; }
```

| Member | Optional in this branch | Type | Source |
| --- | --- | --- | --- |
| schemaVersion | no | `"stage-result.v2"` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L510-L510) |
| outcome | no | `"rate_limited"` | [outcome](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L511-L521) |
| reason | no | `Reason` | [reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L522-L522) |
| artifacts | no | `ArtifactRef[]` | [artifacts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L523-L523) |
| retryAt | no | `string` | [retryAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L135-L135) |


Owning schema: [#/$defs/stageResult](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/stageResult | `{}` | [#/$defs/stageResult](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L609-L678) |
| #/$defs/stageResult/oneOf/0 | `{}` | [#/$defs/stageResult/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L611-L626) |
| #/$defs/stageResult/oneOf/0/allOf/0 | `{"$ref":"#/$defs/resultBase"}` | [#/$defs/stageResult/oneOf/0/allOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L613-L613) |
| #/$defs/stageResult/oneOf/0/allOf/1 | `{"type":"object","additionalProperties":false,"required":["schemaVersion","outcome","artifacts"]}` | [#/$defs/stageResult/oneOf/0/allOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L614-L624) |
| #/$defs/stageResult/oneOf/0/allOf/1/properties/schemaVersion | `{"const":"stage-result.v2"}` | [#/$defs/stageResult/oneOf/0/allOf/1/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L619-L619) |
| #/$defs/stageResult/oneOf/0/allOf/1/properties/outcome | `{"const":"passed"}` | [#/$defs/stageResult/oneOf/0/allOf/1/properties/outcome](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L620-L620) |
| #/$defs/stageResult/oneOf/0/allOf/1/properties/artifacts | `{"type":"array","uniqueItems":true}` | [#/$defs/stageResult/oneOf/0/allOf/1/properties/artifacts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L621-L621) |
| #/$defs/stageResult/oneOf/0/allOf/1/properties/artifacts/items | `{"$ref":"#/$defs/artifactRef"}` | [#/$defs/stageResult/oneOf/0/allOf/1/properties/artifacts/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L621-L621) |
| #/$defs/stageResult/oneOf/0/allOf/1/properties/facts | `{"$ref":"#/$defs/decisionFacts"}` | [#/$defs/stageResult/oneOf/0/allOf/1/properties/facts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L622-L622) |
| #/$defs/stageResult/oneOf/1 | `{}` | [#/$defs/stageResult/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L627-L642) |
| #/$defs/stageResult/oneOf/1/allOf/0 | `{"$ref":"#/$defs/resultBase"}` | [#/$defs/stageResult/oneOf/1/allOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L629-L629) |
| #/$defs/stageResult/oneOf/1/allOf/1 | `{"type":"object","additionalProperties":false,"required":["schemaVersion","outcome","reason","artifacts"]}` | [#/$defs/stageResult/oneOf/1/allOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L630-L640) |
| #/$defs/stageResult/oneOf/1/allOf/1/properties/schemaVersion | `{"const":"stage-result.v2"}` | [#/$defs/stageResult/oneOf/1/allOf/1/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L635-L635) |
| #/$defs/stageResult/oneOf/1/allOf/1/properties/outcome | `{"enum":["retry","request_fix","blocked","failed","timed_out","cancelled"]}` | [#/$defs/stageResult/oneOf/1/allOf/1/properties/outcome](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L636-L636) |
| #/$defs/stageResult/oneOf/1/allOf/1/properties/reason | `{"$ref":"#/$defs/reason"}` | [#/$defs/stageResult/oneOf/1/allOf/1/properties/reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L637-L637) |
| #/$defs/stageResult/oneOf/1/allOf/1/properties/artifacts | `{"type":"array","uniqueItems":true}` | [#/$defs/stageResult/oneOf/1/allOf/1/properties/artifacts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L638-L638) |
| #/$defs/stageResult/oneOf/1/allOf/1/properties/artifacts/items | `{"$ref":"#/$defs/artifactRef"}` | [#/$defs/stageResult/oneOf/1/allOf/1/properties/artifacts/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L638-L638) |
| #/$defs/stageResult/oneOf/2 | `{}` | [#/$defs/stageResult/oneOf/2](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L643-L659) |
| #/$defs/stageResult/oneOf/2/allOf/0 | `{"$ref":"#/$defs/resultBase"}` | [#/$defs/stageResult/oneOf/2/allOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L645-L645) |
| #/$defs/stageResult/oneOf/2/allOf/1 | `{"type":"object","additionalProperties":false,"required":["schemaVersion","outcome","reason","artifacts","wait"]}` | [#/$defs/stageResult/oneOf/2/allOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L646-L657) |
| #/$defs/stageResult/oneOf/2/allOf/1/properties/schemaVersion | `{"const":"stage-result.v2"}` | [#/$defs/stageResult/oneOf/2/allOf/1/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L651-L651) |
| #/$defs/stageResult/oneOf/2/allOf/1/properties/outcome | `{"enum":["wait","orchestrator_required"]}` | [#/$defs/stageResult/oneOf/2/allOf/1/properties/outcome](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L652-L652) |
| #/$defs/stageResult/oneOf/2/allOf/1/properties/reason | `{"$ref":"#/$defs/reason"}` | [#/$defs/stageResult/oneOf/2/allOf/1/properties/reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L653-L653) |
| #/$defs/stageResult/oneOf/2/allOf/1/properties/artifacts | `{"type":"array","uniqueItems":true}` | [#/$defs/stageResult/oneOf/2/allOf/1/properties/artifacts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L654-L654) |
| #/$defs/stageResult/oneOf/2/allOf/1/properties/artifacts/items | `{"$ref":"#/$defs/artifactRef"}` | [#/$defs/stageResult/oneOf/2/allOf/1/properties/artifacts/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L654-L654) |
| #/$defs/stageResult/oneOf/2/allOf/1/properties/wait | `{"$ref":"#/$defs/waitRequest"}` | [#/$defs/stageResult/oneOf/2/allOf/1/properties/wait](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L655-L655) |
| #/$defs/stageResult/oneOf/3 | `{}` | [#/$defs/stageResult/oneOf/3](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L660-L676) |
| #/$defs/stageResult/oneOf/3/allOf/0 | `{"$ref":"#/$defs/resultBase"}` | [#/$defs/stageResult/oneOf/3/allOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L662-L662) |
| #/$defs/stageResult/oneOf/3/allOf/1 | `{"type":"object","additionalProperties":false,"required":["schemaVersion","outcome","reason","artifacts","retryAt"]}` | [#/$defs/stageResult/oneOf/3/allOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L663-L674) |
| #/$defs/stageResult/oneOf/3/allOf/1/properties/schemaVersion | `{"const":"stage-result.v2"}` | [#/$defs/stageResult/oneOf/3/allOf/1/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L668-L668) |
| #/$defs/stageResult/oneOf/3/allOf/1/properties/outcome | `{"const":"rate_limited"}` | [#/$defs/stageResult/oneOf/3/allOf/1/properties/outcome](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L669-L669) |
| #/$defs/stageResult/oneOf/3/allOf/1/properties/reason | `{"$ref":"#/$defs/reason"}` | [#/$defs/stageResult/oneOf/3/allOf/1/properties/reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L670-L670) |
| #/$defs/stageResult/oneOf/3/allOf/1/properties/artifacts | `{"type":"array","uniqueItems":true}` | [#/$defs/stageResult/oneOf/3/allOf/1/properties/artifacts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L671-L671) |
| #/$defs/stageResult/oneOf/3/allOf/1/properties/artifacts/items | `{"$ref":"#/$defs/artifactRef"}` | [#/$defs/stageResult/oneOf/3/allOf/1/properties/artifacts/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L671-L671) |
| #/$defs/stageResult/oneOf/3/allOf/1/properties/retryAt | `{"type":"string","format":"date-time"}` | [#/$defs/stageResult/oneOf/3/allOf/1/properties/retryAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L672-L672) |

Referenced types:

- `ArtifactRef`
- `DecisionFacts`
- `Reason`
- `ResultBase`
- `WaitRequest`

## TestContractId

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Provider contract/schema identifier has lowercase path-like characters and an @ suffix with a positive version number, at most 256 characters. This is distinct from namespaced capability and local registration ID grammars.

```ts
string
```

**Consumer example — source-only fragment:**

```ts
const contract: TestContractId = 'example/check@1';
```

Source: [TestContractId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L43-L43).

Owning schema: [#/$defs/testContractId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/testContractId | `{"type":"string","pattern":"^[a-z0-9][a-z0-9._/-]*@[1-9][0-9]*$","maxLength":256}` | [#/$defs/testContractId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L141-L145) |

## TestEvidencePolicy

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Explicit evidence selections for pass, fail and error outcomes. Each required array may be empty, has at most 128 unique local IDs, and refers to provider evidence types. The SDK declares no default evidence list.

```ts
TestEvidencePolicy
```

**Consumer example — source-only fragment:**

```ts
const evidence: TestEvidencePolicy = {onPass:[],onFail:[],onError:[]};
```

Source: [TestEvidencePolicy](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L386-L399).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| onPass | no | no | `onPass: LocalId[];` | [onPass](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L390-L390) |
| onFail | no | no | `onFail: LocalId[];` | [onFail](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L394-L394) |
| onError | no | no | `onError: LocalId[];` | [onError](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L398-L398) |

Owning schema: [#/$defs/testEvidencePolicy](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/testEvidencePolicy | `{"type":"object","additionalProperties":false,"required":["onPass","onFail","onError"]}` | [#/$defs/testEvidencePolicy](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L313-L337) |
| #/$defs/testEvidencePolicy/properties/onPass | `{"type":"array","maxItems":128,"uniqueItems":true}` | [#/$defs/testEvidencePolicy/properties/onPass](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L318-L323) |
| #/$defs/testEvidencePolicy/properties/onPass/items | `{"$ref":"#/$defs/localId"}` | [#/$defs/testEvidencePolicy/properties/onPass/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L322-L322) |
| #/$defs/testEvidencePolicy/properties/onFail | `{"type":"array","maxItems":128,"uniqueItems":true}` | [#/$defs/testEvidencePolicy/properties/onFail](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L324-L329) |
| #/$defs/testEvidencePolicy/properties/onFail/items | `{"$ref":"#/$defs/localId"}` | [#/$defs/testEvidencePolicy/properties/onFail/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L328-L328) |
| #/$defs/testEvidencePolicy/properties/onError | `{"type":"array","maxItems":128,"uniqueItems":true}` | [#/$defs/testEvidencePolicy/properties/onError](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L330-L335) |
| #/$defs/testEvidencePolicy/properties/onError/items | `{"$ref":"#/$defs/localId"}` | [#/$defs/testEvidencePolicy/properties/onError/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L334-L334) |

Referenced types:

- `LocalId`

## TestProviderCapabilityRequest

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Provider dependency request includes operation, typed resource and payload but no runtimeDispatchProfile member. It does not grant a capability; the provider execution context owns the permitted call. This shape is distinct from plugin CapabilityInvocation.

```ts
TestProviderCapabilityRequest
```

**Consumer example — source-only fragment:**

```ts
const request: TestProviderCapabilityRequest = {operation:'get',resource:{type:'example.object',canonicalId:'item1'},payload:{}};
```

Source: [TestProviderCapabilityRequest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L121-L128).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| operation | no | yes | `readonly operation: string;` | [operation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L122-L122) |
| resource | no | yes | `readonly resource: {     readonly type: string;     readonly canonicalId: string;   };` | [resource](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L123-L126) |
| resource.type | no | yes | `readonly type: string;` | [type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L124-L124) |
| resource.canonicalId | no | yes | `readonly canonicalId: string;` | [canonicalId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L125-L125) |
| payload | no | yes | `readonly payload: Readonly<Record<string, unknown>>;` | [payload](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L127-L127) |

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `Readonly`
- `Record`

## TestProviderExecutionContext

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Provider receives cancellation signal, mutable workspace root, log(stdout/stderr, text/bytes) and granted invoke with an optional call signal. Output logging is separate from ProviderResultV1. The local capability broker combines cancellation signals and returns failures; no unrestricted host access is part of the type.

```ts
TestProviderExecutionContext
```

**Consumer example — source-only fragment:**

```ts
context.log('stdout', 'check started');
```

Source: [TestProviderExecutionContext](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L130-L139).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| signal | no | yes | `readonly signal: AbortSignal;` | [signal](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L131-L131) |
| workspaceRoot | no | yes | `readonly workspaceRoot: string;` | [workspaceRoot](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L132-L132) |
| log | no | no | `log(stream: 'stdout' \| 'stderr', value: string \| Uint8Array): void;` | [log](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L133-L133) |
| invoke | no | no | `invoke(     capability: string,     request: TestProviderCapabilityRequest,     signal?: AbortSignal,   ): Promise<Readonly<Record<string, unknown>>>;` | [invoke](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L134-L138) |

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `AbortSignal`
- `Promise`
- `Readonly`
- `Record`
- `TestProviderCapabilityRequest`
- `Uint8Array`

## TestProviderFactory

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Factory receives ProviderInvocationV1 and returns TestProviderInstance directly or asynchronously. The invocation/result types belong to the separate pipeline-test-gate contract package; they are not named SDK exports. Factory failure is not a passing test.

```ts
(invocation: ProviderInvocationV1): Promise<TestProviderInstance> | TestProviderInstance
```

**Consumer example — source-only fragment:**

```ts
const factory: TestProviderFactory = invocation => ({execute: async (invocation, context) => result});
```

Source: [TestProviderFactory](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L152-L154).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `Promise`
- `ProviderInvocationV1`
- `TestProviderInstance`

## TestProviderInstance

Import: `@kubeclaw/plugin-sdk`. Kind: type.

execute receives the invocation plus execution context and returns ProviderResultV1. Optional cleanup receives the same argument shapes and returns void. Honor cancellation and use explicit cleanup for resources your provider owns; this interface guarantees no automatic rollback of external effects.

```ts
TestProviderInstance
```

**Consumer example — source-only fragment:**

```ts
await instance.cleanup?.(invocation, context);
```

Source: [TestProviderInstance](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L141-L150).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| execute | no | no | `execute(     invocation: ProviderInvocationV1,     context: TestProviderExecutionContext,   ): Promise<ProviderResultV1>;` | [execute](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L142-L145) |
| cleanup | yes | no | `cleanup?(     invocation: ProviderInvocationV1,     context: TestProviderExecutionContext,   ): Promise<void>;` | [cleanup](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L146-L149) |

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `Promise`
- `ProviderInvocationV1`
- `ProviderResultV1`
- `TestProviderExecutionContext`

## TestProviderPort

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Value port requires schemaId; artifact port requires 1–32 unique media types and may omit schemaId. Both declare name and required. A required:false port can be absent at the consuming boundary; it is not a JavaScript default value.

```ts
{ name: LocalId; kind: "value"; required: boolean; schemaId: TestContractId; } | { name: LocalId; kind: "artifact"; required: boolean; schemaId?: TestContractId; mediaTypes: [string, ...string[]]; }
```

**Consumer example — source-only fragment:**

```ts
const port: TestProviderPort = {name:'input',kind:'value',required:true,schemaId:'example/data@1'};
```

Source: [TestProviderPort](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L46-L63).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| name | no | no | `name: LocalId;` | [name](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L48-L48) |
| kind | no | no | `kind: 'value';` | [kind](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L49-L49) |
| required | no | no | `required: boolean;` | [required](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L50-L50) |
| schemaId | no | no | `schemaId: TestContractId;` | [schemaId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L51-L51) |
| name | no | no | `name: LocalId;` | [name](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L54-L54) |
| kind | no | no | `kind: 'artifact';` | [kind](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L55-L55) |
| required | no | no | `required: boolean;` | [required](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L56-L56) |
| schemaId | yes | no | `schemaId?: TestContractId;` | [schemaId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L57-L57) |
| mediaTypes | no | no | `mediaTypes: [string, ...string[]];` | [mediaTypes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L62-L62) |

**Union variants — read required/optional members within each branch, not only the merged member list:**

Branch 1:

```typescript
{ name: LocalId; kind: "value"; required: boolean; schemaId: TestContractId; }
```

| Member | Optional in this branch | Type | Source |
| --- | --- | --- | --- |
| name | no | `string` | [name](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L48-L48) |
| kind | no | `"value"` | [kind](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L49-L49) |
| required | no | `boolean` | [required](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L50-L50) |
| schemaId | no | `string` | [schemaId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L51-L51) |

Branch 2:

```typescript
{ name: LocalId; kind: "artifact"; required: boolean; schemaId?: TestContractId; mediaTypes: [string, ...string[]]; }
```

| Member | Optional in this branch | Type | Source |
| --- | --- | --- | --- |
| name | no | `string` | [name](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L54-L54) |
| kind | no | `"artifact"` | [kind](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L55-L55) |
| required | no | `boolean` | [required](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L56-L56) |
| schemaId | yes | `string` | [schemaId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L57-L57) |
| mediaTypes | no | `[string, ...string[]]` | [mediaTypes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L62-L62) |


Owning schema: [#/$defs/testProviderPort](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/testProviderPort | `{}` | [#/$defs/testProviderPort](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L280-L312) |
| #/$defs/testProviderPort/oneOf/0 | `{"type":"object","additionalProperties":false,"required":["name","kind","required","schemaId"]}` | [#/$defs/testProviderPort/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L282-L292) |
| #/$defs/testProviderPort/oneOf/0/properties/name | `{"$ref":"#/$defs/localId"}` | [#/$defs/testProviderPort/oneOf/0/properties/name](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L287-L287) |
| #/$defs/testProviderPort/oneOf/0/properties/kind | `{"const":"value"}` | [#/$defs/testProviderPort/oneOf/0/properties/kind](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L288-L288) |
| #/$defs/testProviderPort/oneOf/0/properties/required | `{"type":"boolean"}` | [#/$defs/testProviderPort/oneOf/0/properties/required](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L289-L289) |
| #/$defs/testProviderPort/oneOf/0/properties/schemaId | `{"$ref":"#/$defs/testContractId"}` | [#/$defs/testProviderPort/oneOf/0/properties/schemaId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L290-L290) |
| #/$defs/testProviderPort/oneOf/1 | `{"type":"object","additionalProperties":false,"required":["name","kind","required","mediaTypes"]}` | [#/$defs/testProviderPort/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L293-L310) |
| #/$defs/testProviderPort/oneOf/1/properties/name | `{"$ref":"#/$defs/localId"}` | [#/$defs/testProviderPort/oneOf/1/properties/name](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L298-L298) |
| #/$defs/testProviderPort/oneOf/1/properties/kind | `{"const":"artifact"}` | [#/$defs/testProviderPort/oneOf/1/properties/kind](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L299-L299) |
| #/$defs/testProviderPort/oneOf/1/properties/required | `{"type":"boolean"}` | [#/$defs/testProviderPort/oneOf/1/properties/required](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L300-L300) |
| #/$defs/testProviderPort/oneOf/1/properties/schemaId | `{"$ref":"#/$defs/testContractId"}` | [#/$defs/testProviderPort/oneOf/1/properties/schemaId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L301-L301) |
| #/$defs/testProviderPort/oneOf/1/properties/mediaTypes | `{"type":"array","minItems":1,"maxItems":32,"uniqueItems":true}` | [#/$defs/testProviderPort/oneOf/1/properties/mediaTypes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L302-L308) |
| #/$defs/testProviderPort/oneOf/1/properties/mediaTypes/items | `{"type":"string","minLength":1,"maxLength":256}` | [#/$defs/testProviderPort/oneOf/1/properties/mediaTypes/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L307-L307) |

Referenced types:

- `LocalId`
- `TestContractId`

## TestProviderRegistration

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Manifest provider/fixture entry declares contract, module/export/config, input/output ports, required capabilities, retrySafe, matrix fields, report formats, evidence types and explicit outcome evidence defaults. retrySafe is a declaration for the test engine, not a proof that every external operation can repeat.

```ts
TestProviderRegistration
```

**Consumer example — source-only fragment:**

```ts
const safe: TestProviderRegistration['retrySafe'] = false;
```

Source: [TestProviderRegistration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L400-L433).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| id | no | no | `id: LocalId;` | [id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L401-L401) |
| contractId | no | no | `contractId: TestContractId;` | [contractId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L402-L402) |
| kind | no | no | `kind: 'test' \| 'fixture';` | [kind](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L403-L403) |
| module | no | no | `module: RelativeModulePath;` | [module](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L404-L404) |
| export | no | no | `export: string;` | [export](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L405-L405) |
| configSchema | no | no | `configSchema: RelativeSchemaPath;` | [configSchema](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L406-L406) |
| inputs | no | no | `inputs: TestProviderPort[];` | [inputs](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L410-L410) |
| outputs | no | no | `outputs: TestProviderPort[];` | [outputs](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L414-L414) |
| requiredCapabilities | no | no | `requiredCapabilities: NamespacedId[];` | [requiredCapabilities](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L418-L418) |
| retrySafe | no | no | `retrySafe: boolean;` | [retrySafe](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L419-L419) |
| matrixFields | no | no | `matrixFields: LocalId[];` | [matrixFields](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L423-L423) |
| reportFormats | no | no | `reportFormats: LocalId[];` | [reportFormats](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L427-L427) |
| evidenceTypes | no | no | `evidenceTypes: LocalId[];` | [evidenceTypes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L431-L431) |
| evidenceDefaults | no | no | `evidenceDefaults: TestEvidencePolicy;` | [evidenceDefaults](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L432-L432) |

Owning schema: [#/$defs/testProviderRegistration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/testProviderRegistration | `{"type":"object","additionalProperties":false,"required":["id","contractId","kind","module","export","configSchema","inputs","outputs","requiredCapabilities","retrySafe","matrixFields","reportFormats","evidenceTypes","evidenceDefaults"]}` | [#/$defs/testProviderRegistration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L338-L390) |
| #/$defs/testProviderRegistration/properties/id | `{"$ref":"#/$defs/localId"}` | [#/$defs/testProviderRegistration/properties/id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L347-L347) |
| #/$defs/testProviderRegistration/properties/contractId | `{"$ref":"#/$defs/testContractId"}` | [#/$defs/testProviderRegistration/properties/contractId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L348-L348) |
| #/$defs/testProviderRegistration/properties/kind | `{"enum":["test","fixture"]}` | [#/$defs/testProviderRegistration/properties/kind](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L349-L349) |
| #/$defs/testProviderRegistration/properties/module | `{"$ref":"#/$defs/relativeModulePath"}` | [#/$defs/testProviderRegistration/properties/module](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L350-L350) |
| #/$defs/testProviderRegistration/properties/export | `{"type":"string","pattern":"^[A-Za-z_$][A-Za-z0-9_$]*$"}` | [#/$defs/testProviderRegistration/properties/export](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L351-L351) |
| #/$defs/testProviderRegistration/properties/configSchema | `{"$ref":"#/$defs/relativeSchemaPath"}` | [#/$defs/testProviderRegistration/properties/configSchema](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L352-L352) |
| #/$defs/testProviderRegistration/properties/inputs | `{"type":"array","maxItems":128}` | [#/$defs/testProviderRegistration/properties/inputs](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L353-L357) |
| #/$defs/testProviderRegistration/properties/inputs/items | `{"$ref":"#/$defs/testProviderPort"}` | [#/$defs/testProviderRegistration/properties/inputs/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L356-L356) |
| #/$defs/testProviderRegistration/properties/outputs | `{"type":"array","maxItems":128}` | [#/$defs/testProviderRegistration/properties/outputs](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L358-L362) |
| #/$defs/testProviderRegistration/properties/outputs/items | `{"$ref":"#/$defs/testProviderPort"}` | [#/$defs/testProviderRegistration/properties/outputs/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L361-L361) |
| #/$defs/testProviderRegistration/properties/requiredCapabilities | `{"type":"array","maxItems":128,"uniqueItems":true}` | [#/$defs/testProviderRegistration/properties/requiredCapabilities](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L363-L368) |
| #/$defs/testProviderRegistration/properties/requiredCapabilities/items | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/testProviderRegistration/properties/requiredCapabilities/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L367-L367) |
| #/$defs/testProviderRegistration/properties/retrySafe | `{"type":"boolean"}` | [#/$defs/testProviderRegistration/properties/retrySafe](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L369-L369) |
| #/$defs/testProviderRegistration/properties/matrixFields | `{"type":"array","maxItems":64,"uniqueItems":true}` | [#/$defs/testProviderRegistration/properties/matrixFields](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L370-L375) |
| #/$defs/testProviderRegistration/properties/matrixFields/items | `{"$ref":"#/$defs/localId"}` | [#/$defs/testProviderRegistration/properties/matrixFields/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L374-L374) |
| #/$defs/testProviderRegistration/properties/reportFormats | `{"type":"array","maxItems":32,"uniqueItems":true}` | [#/$defs/testProviderRegistration/properties/reportFormats](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L376-L381) |
| #/$defs/testProviderRegistration/properties/reportFormats/items | `{"$ref":"#/$defs/localId"}` | [#/$defs/testProviderRegistration/properties/reportFormats/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L380-L380) |
| #/$defs/testProviderRegistration/properties/evidenceTypes | `{"type":"array","maxItems":128,"uniqueItems":true}` | [#/$defs/testProviderRegistration/properties/evidenceTypes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L382-L387) |
| #/$defs/testProviderRegistration/properties/evidenceTypes/items | `{"$ref":"#/$defs/localId"}` | [#/$defs/testProviderRegistration/properties/evidenceTypes/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L386-L386) |
| #/$defs/testProviderRegistration/properties/evidenceDefaults | `{"$ref":"#/$defs/testEvidencePolicy"}` | [#/$defs/testProviderRegistration/properties/evidenceDefaults](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L388-L388) |

Referenced types:

- `LocalId`
- `NamespacedId`
- `RelativeModulePath`
- `RelativeSchemaPath`
- `TestContractId`
- `TestEvidencePolicy`
- `TestProviderPort`

## ValueRecord

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Permissive Record<string, any> used by objectRecord. It does not constrain JSON values, prototypes, property descriptors or capability payloads. Prefer the owning contract when a stronger shape is required.

```ts
{ [x: string]: any; }
```

**Consumer example — source-only fragment:**

```ts
const record: ValueRecord = {count:1};
```

Source: [ValueRecord](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/values.ts#L5-L5).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `Record`

## WaitRequest

Import: `@kubeclaw/plugin-sdk`. Kind: type.

Versioned continuation wait names kind, signal type, authorized issuer and required expiry. expiresAt may be null for no declared expiry; omission is invalid. Optional request carries continuation data. This type does not install a timer or accept a resume signal.

```ts
WaitRequest
```

**Consumer example — source-only fragment:**

```ts
const expiry: WaitRequest['expiresAt'] = null;
```

Source: [WaitRequest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L531-L542).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| schemaVersion | no | no | `schemaVersion: 'wait-request.v2';` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L532-L532) |
| waitId | no | no | `waitId: OpaqueId;` | [waitId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L533-L533) |
| kind | no | no | `kind: 'signal' \| 'orchestrator';` | [kind](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L534-L534) |
| signalType | no | no | `signalType: NamespacedId;` | [signalType](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L535-L535) |
| authorizedIssuer | no | no | `authorizedIssuer: {     type: 'orchestrator' \| 'operator' \| 'adapter';     id: OpaqueId;   };` | [authorizedIssuer](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L536-L539) |
| authorizedIssuer.type | no | no | `type: 'orchestrator' \| 'operator' \| 'adapter';` | [type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L537-L537) |
| authorizedIssuer.id | no | no | `id: OpaqueId;` | [id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L538-L538) |
| expiresAt | no | no | `expiresAt: string \| null;` | [expiresAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L540-L540) |
| request | yes | no | `request?: JsonObject;` | [request](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L541-L541) |

Owning schema: [#/$defs/waitRequest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). The rules below are schema facts, not checks performed by this TypeScript type.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/waitRequest | `{"type":"object","additionalProperties":false,"required":["schemaVersion","waitId","kind","signalType","authorizedIssuer","expiresAt"]}` | [#/$defs/waitRequest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L747-L776) |
| #/$defs/waitRequest/properties/schemaVersion | `{"const":"wait-request.v2"}` | [#/$defs/waitRequest/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L755-L755) |
| #/$defs/waitRequest/properties/waitId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/waitRequest/properties/waitId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L756-L756) |
| #/$defs/waitRequest/properties/kind | `{"enum":["signal","orchestrator"]}` | [#/$defs/waitRequest/properties/kind](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L757-L757) |
| #/$defs/waitRequest/properties/signalType | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/waitRequest/properties/signalType](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L758-L758) |
| #/$defs/waitRequest/properties/authorizedIssuer | `{"type":"object","additionalProperties":false,"required":["type","id"]}` | [#/$defs/waitRequest/properties/authorizedIssuer](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L759-L767) |
| #/$defs/waitRequest/properties/authorizedIssuer/properties/type | `{"enum":["orchestrator","operator","adapter"]}` | [#/$defs/waitRequest/properties/authorizedIssuer/properties/type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L764-L764) |
| #/$defs/waitRequest/properties/authorizedIssuer/properties/id | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/waitRequest/properties/authorizedIssuer/properties/id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L765-L765) |
| #/$defs/waitRequest/properties/expiresAt | `{}` | [#/$defs/waitRequest/properties/expiresAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L768-L773) |
| #/$defs/waitRequest/properties/expiresAt/oneOf/0 | `{"type":"string","format":"date-time"}` | [#/$defs/waitRequest/properties/expiresAt/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L770-L770) |
| #/$defs/waitRequest/properties/expiresAt/oneOf/1 | `{"type":"null"}` | [#/$defs/waitRequest/properties/expiresAt/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L771-L771) |
| #/$defs/waitRequest/properties/request | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/waitRequest/properties/request](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L774-L774) |

Referenced types:

- `JsonObject`
- `NamespacedId`
- `OpaqueId`

## approvedSource

Import: `@kubeclaw/plugin-sdk`. Kind: function.

Resolve the source revision from visible same-run artifacts. With expected binding, require its preflight and optional selected review. Without it, absent report and approval returns undefined; an approval without a report fails. Passed reports with findings require report-bound human approval. Select the latest unique attempt per stage; reject competing stages or tied artifacts. Apply bound blueprint sync, then one unambiguous implementation lineage; reject cycles and forks. Reads artifacts but does not mutate Git or grant a general trust scope.

```ts
(context: PluginInvocationContext, expected?: SourceBinding): Promise<{ subject: ReviewSubject; sourceRevision: string; } | undefined>
```

**Consumer example — source-only fragment:**

```ts
const approved = await approvedSource(context, binding);
```

Source: [approvedSource](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/source-approval.ts#L27-L44).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| return.subject | no | no | `subject: ReviewSubject;` | [subject](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/source-approval.ts#L27-L27) |
| return.sourceRevision | no | no | `sourceRevision: string` | [sourceRevision](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/source-approval.ts#L27-L27) |

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `PluginInvocationContext`
- `Promise`
- `ReviewSubject`
- `SourceBinding`

## arrayValue

Import: `@kubeclaw/plugin-sdk`. Kind: function.

Return the input array by reference; for non-array values that native Array.isArray can classify, including null and undefined, return a new empty array. A revoked proxy throws TypeError during classification. No element validation or copy occurs. The generic type is a cast, not a runtime check.

```ts
<T = any>(value: unknown): T[]
```

**Consumer example — source-only fragment:**

```ts
arrayValue<number>(null); // []
```

Source: [arrayValue](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/values.ts#L27-L29).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `T`

## buildRuntimeAgentTask

Import: `@kubeclaw/plugin-sdk`. Kind: function.

Build instruction text that describes its serialized input envelope as immutable; it also includes atomic result-file instructions. It does not freeze the supplied payload. resultFile is limited to 2048 UTF-8 bytes; longer paths throw RUNTIME_RESULT_FILE_PATH_TOO_LONG. Native JSON.stringify serializes the payload once: undefined/function/symbol object fields are omitted, their array elements become null, and nonfinite numbers become null. Enumerable getters and toJSON can execute and transform output; their exceptions propagate, as can cycles/BigInt errors. Use trusted, already-JSON data when executable object effects are not intended. This is not the strict portableJson domain. This helper neither writes the file nor validates path containment or the returned agent result.

```ts
(payload: Readonly<Record<string, unknown>>, resultFile: string): string
```

**Consumer example — source-only fragment:**

```ts
buildRuntimeAgentTask({task:'Return the declared fields',outputContract:{required:['status']}}, 'result.json');
```

Source: [buildRuntimeAgentTask](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime-agent-task.ts#L14-L25).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `Readonly`
- `Record`

## canonicalJson

Import: `@kubeclaw/plugin-sdk`. Kind: function.

Legacy JSON codec sorts object keys with localeCompare. Preserve it for existing identities; its collation is locale-sensitive and must not be relabelled portable. Accepted values and rejection codes are the same as portableJson. It returns text, writes no file and does not hash.

```ts
(value: unknown): string
```

**Consumer example — source-only fragment:**

```ts
canonicalJson({z:1,a:2}); // '{"a":2,"z":1}'
```

Source: [canonicalJson](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/values.ts#L45-L47).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

## captureReviewSubject

Import: `@kubeclaw/plugin-sdk`. Kind: function.

Parse and sort the source paths; freeze clean HEAD and the architecture reference through git.repository.read; read regular files at that architecture revision. Verify each response path, mode, digest and UTF-8 size. Bind the input digest and current run, then verify both frozen revisions again. Calls Git read capabilities; does not commit or write source. Any capability rejection propagates.

```ts
(sourceInput: unknown, input: unknown, context: PluginInvocationContext): Promise<ReviewSubject>
```

**Consumer example — source-only fragment:**

```ts
const subject = await captureReviewSubject(source, input, context);
```

Source: [captureReviewSubject](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L59-L76).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `PluginInvocationContext`
- `Promise`
- `ReviewSubject`

## objectRecord

Import: `@kubeclaw/plugin-sdk`. Kind: function.

Return a truthy non-array object by reference when native Array.isArray can classify it; otherwise return a new empty object. Class instances, live proxies and accessor-bearing records can pass. A revoked proxy throws TypeError during classification. It is a permissive convenience cast, not strict JSON validation.

```ts
(value: unknown): ValueRecord
```

**Consumer example — source-only fragment:**

```ts
objectRecord(null); // {}
```

Source: [objectRecord](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/values.ts#L31-L33).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `ValueRecord`

## parseReviewCacheProfile

Import: `@kubeclaw/plugin-sdk`. Kind: function.

Compare the complete strict portable serialization to the one generated current cache profile. Return the generated frozen constant on equality; otherwise throw REVIEW_CACHE_PROFILE_INVALID. Extra/missing fields, null and unknown versions fail. Strict JSON failures can occur before the profile-specific error.

```ts
(value: unknown): ReviewCacheProfile
```

**Consumer example — source-only fragment:**

```ts
parseReviewCacheProfile(CURRENT_REVIEW_CACHE_PROFILE);
```

Source: [parseReviewCacheProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-cache-profile.ts#L7-L10).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `ReviewCacheProfile`

## parseReviewSource

Import: `@kubeclaw/plugin-sdk`. Kind: function.

For dense plain-JSON input, check project ID, absolute repository root, architecture reference and 1–128 unique safe relative paths. Text fields are nonempty, at most 4096 UTF-16 code units and exclude NUL/CR/LF. Paths exclude absolute paths, backslashes and empty/dot/parent segments. Only an own identityEncoding is guarded and must be portable. Property reads can inherit values or execute getters/proxy traps; a truthy inherited encoding is copied into an own output field, including an unknown tag. Array.some skips holes: a single-hole paths array passes and copies to [undefined]. Return a new object with sorted copied paths and discard unrelated fields. This is a limited local parser, not strict unknown-input validation; no Git access occurs.

```ts
(value: unknown): ReviewSource
```

**Consumer example — source-only fragment:**

```ts
parseReviewSource({projectId:'project1',repositoryRoot:'/repo',architectureRef:'main',paths:['design.md']});
```

Source: [parseReviewSource](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L28-L35).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `ReviewSource`

## parseReviewSubject

Import: `@kubeclaw/plugin-sdk`. Kind: function.

Validate the source, current run ID, two 40- or 64-character lowercase hex revisions, input digest and ordered files. Every file must match a sorted source path, executable/regular Git mode, content hash and UTF-8 size. Recompute the unsigned subject digest with the selected identity codec. Return the original subject. No repository freshness check occurs here.

```ts
(value: unknown, runId: string): ReviewSubject
```

**Consumer example — source-only fragment:**

```ts
const parsed = parseReviewSubject(subject, runId);
```

Source: [parseReviewSubject](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L36-L49).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `ReviewSubject`

## parseRuntimeDispatchProfile

Import: `@kubeclaw/plugin-sdk`. Kind: function.

Strict portable serialization must exactly match the generated current profile; return its frozen constant. Wrong shape/version throws RUNTIME_DISPATCH_PROFILE_INVALID; invalid JSON domain can throw a CANONICAL_JSON error first. This parser does not dispatch an agent.

```ts
(value: unknown): RuntimeDispatchProfile
```

**Consumer example — source-only fragment:**

```ts
parseRuntimeDispatchProfile(CURRENT_RUNTIME_DISPATCH_PROFILE);
```

Source: [parseRuntimeDispatchProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime-dispatch-profile.ts#L8-L11).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `RuntimeDispatchProfile`

## parseRuntimeWorkspace

Import: `@kubeclaw/plugin-sdk`. Kind: function.

Require an object with exactly the seven declared enumerable string keys and runtime-workspace.v1. Require a 40/64 lowercase hex revision. Require nonempty path/branch strings to 4096 UTF-16 code units without controls. Compare owner using legacy canonical JSON. Return the original reference. It does not prove containment, branch existence or a protected owner-file record; runtime performs that adjacent check.

```ts
(value: unknown, owner: AttemptIdentity): RuntimeWorkspaceReference
```

**Consumer example — source-only fragment:**

```ts
const parsed = parseRuntimeWorkspace(reference, attempt);
```

Source: [parseRuntimeWorkspace](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime-workspace.ts#L23-L34).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `AttemptIdentity`
- `RuntimeWorkspaceReference`

## parseSourceBinding

Import: `@kubeclaw/plugin-sdk`. Kind: function.

Check enumerable own string keys against stageId, inputDigest, optional reviewStageId and optional identityEncoding; this does not reject hidden/symbol keys or inherited fields. Stage names must be nonempty strings; digest must have sha256 and 64 lowercase hex digits. An own identityEncoding must be the portable token. Inherited encodings are not guarded and the original reference retains them; inherited required fields can pass. Reads can execute getters/proxy traps, so use trusted dense plain-JSON input for the stated contract, not this parser as strict unknown-input validation. Omitted reviewStageId is allowed; a present undefined value also passes this local parser. Return the original binding. Throws SOURCE_PREFLIGHT_BINDING_INVALID for failed checks.

```ts
(value: unknown): SourceBinding
```

**Consumer example — source-only fragment:**

```ts
parseSourceBinding({stageId:'preflight',inputDigest:sha256Text('{}')});
```

Source: [parseSourceBinding](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/source-preflight.ts#L13-L23).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `SourceBinding`

## portableJson

Import: `@kubeclaw/plugin-sdk`. Kind: function.

Serialize strict JSON with object keys sorted by UTF-16 code units, independently of locale. Accept null, strings, booleans, finite numbers, plain/null-prototype records and dense standard arrays of enumerable data properties. Reject undefined, functions, symbols, BigInt, nonfinite numbers, proxies, cycles, exotic prototypes, hidden/symbol/accessor properties and extra/sparse array entries. Error codes are listed in the JSON section. Shared noncyclic objects are allowed; negative zero becomes 0. No getters, toJSON or proxy traps execute.

```ts
(value: unknown): string
```

**Consumer example — source-only fragment:**

```ts
portableJson({Z:1,a:2}); // '{"Z":1,"a":2}'
```

Source: [portableJson](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/values.ts#L61-L63).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

## readBoundArtifact

Import: `@kubeclaw/plugin-sdk`. Kind: function.

Require same-run producer, application/json media type and size at most 4 MiB; then invoke artifacts.read/get_json_bytes with the full reference. Verify exact byte/reference/value binding and repeat digest/size checks. Return response.value by cast, not a validated record schema. Byte agreement is not blanket producer trust; approval/preflight helpers impose their own selection rules.

```ts
(artifact: ArtifactRef, context: PluginInvocationContext): Promise<Record<string, unknown>>
```

**Consumer example — source-only fragment:**

```ts
const value = await readBoundArtifact(ref, context);
```

Source: [readBoundArtifact](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/source-approval.ts#L8-L17).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `ArtifactRef`
- `PluginInvocationContext`
- `Promise`
- `Record`

## redactStructuredValue

Import: `@kubeclaw/plugin-sdk`. Kind: function.

Build a bounded redacted value: sensitive object keys matching authorization/cookie/password/secret/token/api-key/credential become [redacted]. Keep at most 1000 array entries or object entries; truncate beyond depth 16 and strings after a 65536-UTF-16-code-unit prefix, followed by `[truncated]` (65547 output units). No comprehensive secret detection is promised. Object enumeration may execute getters/proxy traps; cyclic graphs terminate through the depth bound, not cycle identity detection.

```ts
(value: unknown): unknown
```

**Consumer example — source-only fragment:**

```ts
redactStructuredValue({token:'value',count:1}); // {token:'[redacted]',count:1}
```

Source: [redactStructuredValue](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/values.ts#L126-L128).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

## resolveImplementationRevisions

Import: `@kubeclaw/plugin-sdk`. Kind: function.

Select earliest and latest unique implementation attempts for the named stage in the current run. Read and verify both exact JSON artifacts; require ready_for_testing and a valid source revision. First headBefore must be a valid 40/64 lowercase hex revision. Return base/head; do not use ambient repository HEAD or compare lexical revisions. Calls artifacts.read and propagates failures.

```ts
(sourceStageId: string, context: PluginInvocationContext): Promise<{ base: string; head: string; }>
```

**Consumer example — source-only fragment:**

```ts
const {base, head} = await resolveImplementationRevisions(stageId, context);
```

Source: [resolveImplementationRevisions](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/source-revision.ts#L42-L50).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| return.base | no | no | `base: string;` | [base](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/source-revision.ts#L42-L42) |
| return.head | no | no | `head: string` | [head](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/source-revision.ts#L42-L42) |

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `PluginInvocationContext`
- `Promise`

## resolveSourceRevision

Import: `@kubeclaw/plugin-sdk`. Kind: function.

Supply exactly one of revision and sourceStageId. An explicit revision must be 40/64 lowercase hex. Otherwise select the latest unique matching implementation artifact attempt in the same run/stage and read its ready_for_testing revision. Empty candidate sets and tied attempts fail; no fallback to HEAD occurs. Explicit revision needs no capability call.

```ts
(input: { readonly revision?: string; readonly sourceStageId?: string; }, context: PluginInvocationContext): Promise<string>
```

**Consumer example — source-only fragment:**

```ts
resolveSourceRevision({revision:'a'.repeat(40)}, context);
```

Source: [resolveSourceRevision](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/source-revision.ts#L31-L39).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| argument:input.revision | yes | yes | `readonly revision?: string;` | [revision](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/source-revision.ts#L31-L31) |
| argument:input.sourceStageId | yes | yes | `readonly sourceStageId?: string` | [sourceStageId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/source-revision.ts#L31-L31) |

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `PluginInvocationContext`
- `Promise`

## reviewCacheProfileFromContext

Import: `@kubeclaw/plugin-sdk`. Kind: function.

First validate strict portable JSON for the complete contract. If the own reviewCacheProfile key is absent, return undefined. If present, parse exactly the current profile. Present undefined is rejected by strict JSON, not treated as legacy absence; null or unknown profile also fails. No context mutation occurs.

```ts
(contract: object): ReviewCacheProfile | undefined
```

**Consumer example — source-only fragment:**

```ts
reviewCacheProfileFromContext({}); // undefined
```

Source: [reviewCacheProfileFromContext](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-cache-profile.ts#L13-L17).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `ReviewCacheProfile`

## reviewIdentityDigest

Import: `@kubeclaw/plugin-sdk`. Kind: function.

Guard only an own identityEncoding: an own different value, including undefined, throws REVIEW_IDENTITY_ENCODING_INVALID. Then ordinary property lookup selects portable JSON for the portable tag, including an inherited tag; an inherited unknown tag selects legacy canonical JSON. Dense plain-JSON input without the key selects legacy. Reads can execute getters/proxy traps. Does not add a version tag to the returned sha256 digest, mutate source or normalize historical identities.

```ts
(value: unknown, source: Pick<ReviewSource, "identityEncoding">): string
```

**Consumer example — source-only fragment:**

```ts
reviewIdentityDigest({a:1}, {});
```

Source: [reviewIdentityDigest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L21-L24).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `Pick`
- `ReviewSource`

## runtimeDispatchProfileFields

Import: `@kubeclaw/plugin-sdk`. Kind: function.

Validate strict portable JSON for the whole request. Missing own profile key returns a new empty object. Present profile with a provided capability other than runtime.dispatch throws RUNTIME_DISPATCH_PROFILE_CAPABILITY_INVALID; otherwise parse the profile and return only that metadata. An omitted capability does not check capability identity. Same-named nested payload/model fields are ordinary data.

```ts
(request: object, capability?: string): Readonly<{ runtimeDispatchProfile?: RuntimeDispatchProfile; }>
```

**Consumer example — source-only fragment:**

```ts
runtimeDispatchProfileFields({payload:{runtimeDispatchProfile:null}}); // {}
```

Source: [runtimeDispatchProfileFields](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime-dispatch-profile.ts#L25-L30).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| return.runtimeDispatchProfile | yes | no | `runtimeDispatchProfile?: RuntimeDispatchProfile` | [runtimeDispatchProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime-dispatch-profile.ts#L25-L25) |

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `Readonly`
- `RuntimeDispatchProfile`

## runtimeWorkspaceGeneration

Import: `@kubeclaw/plugin-sdk`. Kind: function.

Hash legacy canonical JSON of owner, repositoryRoot and branch, then remove sha256: from the result. Output is 64 hex characters. Does not create a workspace, validate those typed arguments or bind portable identity.

```ts
(owner: AttemptIdentity, scope: Readonly<{ repositoryRoot: string; branch: string; }>): string
```

**Consumer example — source-only fragment:**

```ts
runtimeWorkspaceGeneration(attempt, {repositoryRoot:'/repo',branch:'work'});
```

Source: [runtimeWorkspaceGeneration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime-workspace.ts#L15-L17).

| Member path | Optional | Readonly | TypeScript shape | Source |
| --- | --- | --- | --- | --- |
| argument:scope.repositoryRoot | no | no | `repositoryRoot: string;` | [repositoryRoot](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime-workspace.ts#L15-L15) |
| argument:scope.branch | no | no | `branch: string` | [branch](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime-workspace.ts#L15-L15) |

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `AttemptIdentity`
- `Readonly`

## runtimeWorkspaceOwnerFile

Import: `@kubeclaw/plugin-sdk`. Kind: function.

Hash the supplied workspacePath UTF-8 bytes and return .kubeclaw-workspace-owners/<hex>.json. No path normalization, validation, read or write occurs. Different JavaScript strings can encode to identical UTF-8 bytes: distinct lone surrogates become the same replacement bytes. No universal textual uniqueness or hash-collision exclusion is promised.

```ts
(workspacePath: string): string
```

**Consumer example — source-only fragment:**

```ts
runtimeWorkspaceOwnerFile('work');
```

Source: [runtimeWorkspaceOwnerFile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime-workspace.ts#L19-L21).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

## selectDefinedValue

Import: `@kubeclaw/plugin-sdk`. Kind: function.

Run readers in order; return the first value other than undefined or null. The selector accepts false, zero and empty text. If none qualifies, return the last value; no readers returns undefined despite generic T. Exceptions propagate; readers after selection do not execute.

```ts
<T>(...readers: Array<OptionalAbsenceReader<T>>): T
```

**Consumer example — source-only fragment:**

```ts
selectDefinedValue(() => null, () => 0, () => 1); // 0
```

Source: [selectDefinedValue](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/values.ts#L7-L15).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `Array`
- `OptionalAbsenceReader`
- `T`

## selectPresentValue

Import: `@kubeclaw/plugin-sdk`. Kind: function.

Return the first nonempty string from the values, or empty text when none matches. Whitespace-only strings are nonempty and accepted. Other types, null and undefined are skipped; this helper does not trim or execute readers.

```ts
(...values: unknown[]): string
```

**Consumer example — source-only fragment:**

```ts
selectPresentValue(undefined, '', ' '); // ' '
```

Source: [selectPresentValue](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/values.ts#L39-L41).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

## selectTruthyValue

Import: `@kubeclaw/plugin-sdk`. Kind: function.

Run readers in order and return the first truthy value. False, zero, empty text, null, undefined and NaN are skipped. If all fail, return the last value; no readers returns undefined despite generic T. Exceptions propagate and later readers do not execute after selection.

```ts
<T>(...readers: Array<OptionalAbsenceReader<T>>): T
```

**Consumer example — source-only fragment:**

```ts
selectTruthyValue(() => 0, () => 'ok'); // 'ok'
```

Source: [selectTruthyValue](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/values.ts#L17-L25).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `Array`
- `OptionalAbsenceReader`
- `T`

## sha256Bytes

Import: `@kubeclaw/plugin-sdk`. Kind: function.

Hash the exact Uint8Array bytes and return sha256: followed by 64 lowercase hex digits. No JSON codec, encoding tag or trust check is applied. Wrong runtime argument types can cause Node crypto errors; this is not an unknown-input validator.

```ts
(value: Uint8Array): `sha256:${string}`
```

**Consumer example — source-only fragment:**

```ts
sha256Bytes(new Uint8Array([65]));
```

Source: [sha256Bytes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/values.ts#L103-L105).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `Uint8Array`

## sha256Text

Import: `@kubeclaw/plugin-sdk`. Kind: function.

Hash the supplied text with Node crypto default UTF-8 and return sha256: plus 64 lowercase hex digits. Does not canonicalize JSON or version the identity. Byte size elsewhere must use UTF-8, not JavaScript string length.

```ts
(value: string): `sha256:${string}`
```

**Consumer example — source-only fragment:**

```ts
sha256Text('A');
```

Source: [sha256Text](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/values.ts#L99-L101).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

## sourcePreflight

Import: `@kubeclaw/plugin-sdk`. Kind: function.

Parse binding, select the latest unique source-preflight artifact from its explicit stage and current run, then read exact bound bytes. Require source-preflight.v1 and passed. Validate the subject and match identityEncoding, inputDigest and digest of the returned contract. Return binding/subject/contract. No artifact or failed/mismatched artifact rejects; never use an unrelated ancestor as fallback.

```ts
(value: unknown, context: PluginInvocationContext): Promise<{ binding: SourceBinding; subject: ReviewSubject; contract: Readonly<Record<string, unknown>>; }>
```

**Consumer example — source-only fragment:**

```ts
const preflight = await sourcePreflight(binding, context);
```

Source: [sourcePreflight](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/source-preflight.ts#L26-L39).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `PluginInvocationContext`

## textValue

Import: `@kubeclaw/plugin-sdk`. Kind: function.

Return a string unchanged; every other value becomes empty text. Empty input text remains empty. This helper does not trim, convert, parse or validate.

```ts
(value: unknown): string
```

**Consumer example — source-only fragment:**

```ts
textValue(1); // ''
```

Source: [textValue](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/values.ts#L35-L37).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

## verifiedArtifactJsonText

Import: `@kubeclaw/plugin-sdk`. Kind: function.

Verify artifact-json-bytes.v1, original UTF-8 byte size and digest; parse original text, compare strict portable value serialization, and compare the complete returned reference with expected. Digest and size must also agree with that reference. An explicitly encoded artifact must use the portable tag and its original bytes must equal portable serialization. Untagged historical JSON is not recanonicalized. Return original text, not reserialized text. Errors distinguish bytes/value/reference/encoding mismatch; JSON.parse and strict JSON errors propagate. No capability call, producer authorization or schema validation occurs.

```ts
(response: Readonly<Record<string, unknown>>, expected: ArtifactRef): string
```

**Consumer example — source-only fragment:**

```ts
const originalText = verifiedArtifactJsonText(response, expectedRef);
```

Source: [verifiedArtifactJsonText](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/artifact-json.ts#L5-L20).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `ArtifactRef`
- `Readonly`
- `Record`

## verifyReviewSubject

Import: `@kubeclaw/plugin-sdk`. Kind: function.

Parse the subject for the current run, freeze clean HEAD and the architecture ref again, and compare with subject revisions. Optional expectedSourceRevision replaces only the expected current HEAD; architecture must still match. Throw REVIEW_SUBJECT_STALE on revision mismatch. Calls git.repository.read but performs no source mutation.

```ts
(value: unknown, context: PluginInvocationContext, expectedSourceRevision?: string): Promise<ReviewSubject>
```

**Consumer example — source-only fragment:**

```ts
const subject = await verifyReviewSubject(candidate, context);
```

Source: [verifyReviewSubject](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/review-subject.ts#L78-L84).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `PluginInvocationContext`
- `Promise`
- `ReviewSubject`

## withRuntimeDispatchProfile

Import: `@kubeclaw/plugin-sdk`. Kind: function.

If profile is undefined, return the original request unchanged without validating it. Otherwise parse current profile and validate strict JSON of the request. Reject any existing own runtimeDispatchProfile key. Return a shallow frozen copy with the selected profile. It does not validate dispatch operation/resource or deeply freeze payload.

```ts
(request: CapabilityInvocation, profile?: RuntimeDispatchProfile): CapabilityInvocation
```

**Consumer example — source-only fragment:**

```ts
const tagged = withRuntimeDispatchProfile(request, CURRENT_RUNTIME_DISPATCH_PROFILE);
```

Source: [withRuntimeDispatchProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime-dispatch-profile.ts#L14-L22).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

Referenced types:

- `CapabilityInvocation`
- `RuntimeDispatchProfile`

## assertNever

Import: `@kubeclaw/plugin-sdk/testing`. Kind: function.

Testing entrypoint only. Exhaustiveness helper accepts never and always throws Unexpected contract variant followed by JSON.stringify(value). It does not return or validate a runtime union. Serialization errors such as cyclic input or BigInt can occur before the intended error if typing is bypassed.

```ts
(value: never): never
```

**Consumer example — source-only fragment:**

```ts
default: return assertNever(variant);
```

Source: [assertNever](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/testing/index.ts#L1-L3).

No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.

## Reachable support types

These finite KubeClaw-owned declarations are reachable through the public callback and wrapper types. Source-qualified names distinguish identically named declarations. They are not additional named SDK exports. Follow qualified references to other support rows or the exact-source public export above; upstream Node and TypeScript utility APIs are not reproduced.

### ArtifactRefV1 — contracts/pipeline-test-gate/v1/src/types.ts

Qualified declaration: `contracts/pipeline-test-gate/v1/src/types.ts#ArtifactRefV1`.

[ArtifactRefV1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L104-L111)

```ts
export interface ArtifactRefV1 {
  artifactId: string;
  type: string;
  mediaType: string;
  contentDigest: string;
  sizeBytes: number;
  storageUrl: string;
}
```

| Resolved member | Optional | Readonly | Type | Source |
| --- | --- | --- | --- | --- |
| artifactId | no | no | `string` | [artifactId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L105-L105) |
| type | no | no | `string` | [type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L106-L106) |
| mediaType | no | no | `string` | [mediaType](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L107-L107) |
| contentDigest | no | no | `string` | [contentDigest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L108-L108) |
| sizeBytes | no | no | `number` | [sizeBytes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L109-L109) |
| storageUrl | no | no | `string` | [storageUrl](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L110-L110) |

Owning schema: `#/$defs/artifactRef` in [contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json). Read its rows in the owning rule index below.

### DeclaredEvidenceV1 — contracts/pipeline-test-gate/v1/src/types.ts

Qualified declaration: `contracts/pipeline-test-gate/v1/src/types.ts#DeclaredEvidenceV1`.

[DeclaredEvidenceV1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L197-L202)

```ts
export interface DeclaredEvidenceV1 {
  evidenceId: string;
  type: string;
  file: string;
  mediaType: string;
}
```

| Resolved member | Optional | Readonly | Type | Source |
| --- | --- | --- | --- | --- |
| evidenceId | no | no | `string` | [evidenceId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L198-L198) |
| type | no | no | `string` | [type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L199-L199) |
| file | no | no | `string` | [file](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L200-L200) |
| mediaType | no | no | `string` | [mediaType](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L201-L201) |

Owning schema: `#/$defs/declaredEvidence` in [contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json). Read its rows in the owning rule index below.

### EvidencePolicyV1 — contracts/pipeline-test-gate/v1/src/types.ts

Qualified declaration: `contracts/pipeline-test-gate/v1/src/types.ts#EvidencePolicyV1`.

[EvidencePolicyV1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L31-L35)

```ts
export interface EvidencePolicyV1 {
  onPass: string[];
  onFail: string[];
  onError: string[];
}
```

| Resolved member | Optional | Readonly | Type | Source |
| --- | --- | --- | --- | --- |
| onPass | no | no | `string[]` | [onPass](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L32-L32) |
| onFail | no | no | `string[]` | [onFail](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L33-L33) |
| onError | no | no | `string[]` | [onError](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L34-L34) |

Owning schema: `#/$defs/evidencePolicy` in [contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json). Read its rows in the owning rule index below.

### ExecutionLimitsV1 — contracts/pipeline-test-gate/v1/src/types.ts

Qualified declaration: `contracts/pipeline-test-gate/v1/src/types.ts#ExecutionLimitsV1`.

[ExecutionLimitsV1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L37-L44)

```ts
export interface ExecutionLimitsV1 {
  cpuMillis: number;
  memoryBytes: number;
  logBytes: number;
  artifactBytes: number;
  artifactFiles: number;
  processes: number;
}
```

| Resolved member | Optional | Readonly | Type | Source |
| --- | --- | --- | --- | --- |
| cpuMillis | no | no | `number` | [cpuMillis](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L38-L38) |
| memoryBytes | no | no | `number` | [memoryBytes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L39-L39) |
| logBytes | no | no | `number` | [logBytes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L40-L40) |
| artifactBytes | no | no | `number` | [artifactBytes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L41-L41) |
| artifactFiles | no | no | `number` | [artifactFiles](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L42-L42) |
| processes | no | no | `number` | [processes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L43-L43) |

Owning schema: `#/$defs/executionLimits` in [contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json). Read its rows in the owning rule index below.

### FindingV1 — contracts/pipeline-test-gate/v1/src/types.ts

Qualified declaration: `contracts/pipeline-test-gate/v1/src/types.ts#FindingV1`.

[FindingV1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L224-L231)

```ts
export interface FindingV1 {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  message: string;
  rule?: string;
  file?: string;
  line?: number;
}
```

| Resolved member | Optional | Readonly | Type | Source |
| --- | --- | --- | --- | --- |
| id | no | no | `string` | [id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L225-L225) |
| severity | no | no | `"critical" \| "high" \| "medium" \| "low" \| "info"` | [severity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L226-L226) |
| message | no | no | `string` | [message](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L227-L227) |
| rule | yes | no | `string` | [rule](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L228-L228) |
| file | yes | no | `string` | [file](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L229-L229) |
| line | yes | no | `number` | [line](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L230-L230) |

Owning schema: `#/$defs/finding` in [contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json). Read its rows in the owning rule index below.

### JsonValue — contracts/pipeline-test-gate/v1/src/types.ts

Qualified declaration: `contracts/pipeline-test-gate/v1/src/types.ts#JsonValue`.

[JsonValue](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L2-L2)

```ts
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
```

Owning schema: `#/$defs/jsonValue` in [contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json). Read its rows in the owning rule index below.

Qualified local references: `contracts/pipeline-test-gate/v1/src/types.ts#JsonValue`.

### MetricV1 — contracts/pipeline-test-gate/v1/src/types.ts

Qualified declaration: `contracts/pipeline-test-gate/v1/src/types.ts#MetricV1`.

[MetricV1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L233-L237)

```ts
export interface MetricV1 {
  name: string;
  value: number;
  unit?: string;
}
```

| Resolved member | Optional | Readonly | Type | Source |
| --- | --- | --- | --- | --- |
| name | no | no | `string` | [name](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L234-L234) |
| value | no | no | `number` | [value](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L235-L235) |
| unit | yes | no | `string` | [unit](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L236-L236) |

Owning schema: `#/$defs/metric` in [contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json). Read its rows in the owning rule index below.

### PackageRefV1 — contracts/pipeline-test-gate/v1/src/types.ts

Qualified declaration: `contracts/pipeline-test-gate/v1/src/types.ts#PackageRefV1`.

[PackageRefV1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L11-L15)

```ts
export interface PackageRefV1 {
  packageId: string;
  packageVersion: string;
  contentDigest: string;
}
```

| Resolved member | Optional | Readonly | Type | Source |
| --- | --- | --- | --- | --- |
| packageId | no | no | `string` | [packageId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L12-L12) |
| packageVersion | no | no | `string` | [packageVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L13-L13) |
| contentDigest | no | no | `string` | [contentDigest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L14-L14) |

Owning schema: `#/$defs/packageRef` in [contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json). Read its rows in the owning rule index below.

### PlanNodeKind — contracts/pipeline-test-gate/v1/src/types.ts

Qualified declaration: `contracts/pipeline-test-gate/v1/src/types.ts#PlanNodeKind`.

[PlanNodeKind](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L5-L5)

```ts
export type PlanNodeKind = 'test' | 'fixture';
```

Owning schema: `#/$defs/providerInvocation/properties/nodeKind` in [contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json). Read its rows in the owning rule index below.

### ProviderConfigurationV1 — contracts/pipeline-test-gate/v1/src/types.ts

Qualified declaration: `contracts/pipeline-test-gate/v1/src/types.ts#ProviderConfigurationV1`.

[ProviderConfigurationV1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L70-L75)

```ts
export interface ProviderConfigurationV1 {
  schemaVersion: 'provider-configuration.v1';
  contractId: string;
  schemaDigest: string;
  values: Record<string, JsonValue>;
}
```

| Resolved member | Optional | Readonly | Type | Source |
| --- | --- | --- | --- | --- |
| schemaVersion | no | no | `"provider-configuration.v1"` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L71-L71) |
| contractId | no | no | `string` | [contractId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L72-L72) |
| schemaDigest | no | no | `string` | [schemaDigest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L73-L73) |
| values | no | no | `{ [x: string]: JsonValue; }` | [values](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L74-L74) |

Owning schema: `#/$defs/providerConfiguration` in [contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json). Read its rows in the owning rule index below.

Qualified local references: `contracts/pipeline-test-gate/v1/src/types.ts#JsonValue`.

### ProviderDetailsV1 — contracts/pipeline-test-gate/v1/src/types.ts

Qualified declaration: `contracts/pipeline-test-gate/v1/src/types.ts#ProviderDetailsV1`.

[ProviderDetailsV1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L46-L50)

```ts
export interface ProviderDetailsV1 {
  schemaId: string;
  schemaDigest: string;
  values: Record<string, JsonValue>;
}
```

| Resolved member | Optional | Readonly | Type | Source |
| --- | --- | --- | --- | --- |
| schemaId | no | no | `string` | [schemaId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L47-L47) |
| schemaDigest | no | no | `string` | [schemaDigest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L48-L48) |
| values | no | no | `{ [x: string]: JsonValue; }` | [values](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L49-L49) |

Owning schema: `#/$defs/providerDetails` in [contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json). Read its rows in the owning rule index below.

Qualified local references: `contracts/pipeline-test-gate/v1/src/types.ts#JsonValue`.

### ProviderInvocationV1 — contracts/pipeline-test-gate/v1/src/types.ts

Qualified declaration: `contracts/pipeline-test-gate/v1/src/types.ts#ProviderInvocationV1`.

[ProviderInvocationV1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L77-L102)

```ts
export interface ProviderInvocationV1 {
  schemaVersion: 'provider-invocation.v1';
  planId: string;
  runId: string;
  moduleId: string | null;
  gateId: string | null;
  suiteInstanceId: string | null;
  nodeId: string;
  executionId: string;
  testIdentity: string;
  nodeKind: PlanNodeKind;
  attemptId: string;
  attemptNumber: number;
  provider: ProviderRefV1;
  configuration: ProviderConfigurationV1;
  inputs: ResolvedInputV1[];
  evidence: EvidencePolicyV1;
  grantedCapabilities: string[];
  timeoutMs: number;
  limits: ExecutionLimitsV1;
  workspace: {
    repository: string;
    scratch: string;
    evidence: string;
  };
}
```

| Resolved member | Optional | Readonly | Type | Source |
| --- | --- | --- | --- | --- |
| schemaVersion | no | no | `"provider-invocation.v1"` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L78-L78) |
| planId | no | no | `string` | [planId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L79-L79) |
| runId | no | no | `string` | [runId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L80-L80) |
| moduleId | no | no | `string \| null` | [moduleId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L81-L81) |
| gateId | no | no | `string \| null` | [gateId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L82-L82) |
| suiteInstanceId | no | no | `string \| null` | [suiteInstanceId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L83-L83) |
| nodeId | no | no | `string` | [nodeId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L84-L84) |
| executionId | no | no | `string` | [executionId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L85-L85) |
| testIdentity | no | no | `string` | [testIdentity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L86-L86) |
| nodeKind | no | no | `"test" \| "fixture"` | [nodeKind](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L87-L87) |
| attemptId | no | no | `string` | [attemptId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L88-L88) |
| attemptNumber | no | no | `number` | [attemptNumber](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L89-L89) |
| provider | no | no | `ProviderRefV1` | [provider](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L90-L90) |
| configuration | no | no | `ProviderConfigurationV1` | [configuration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L91-L91) |
| inputs | no | no | `ResolvedInputV1[]` | [inputs](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L92-L92) |
| evidence | no | no | `EvidencePolicyV1` | [evidence](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L93-L93) |
| grantedCapabilities | no | no | `string[]` | [grantedCapabilities](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L94-L94) |
| timeoutMs | no | no | `number` | [timeoutMs](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L95-L95) |
| limits | no | no | `ExecutionLimitsV1` | [limits](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L96-L96) |
| workspace | no | no | `{ repository: string; scratch: string; evidence: string; }` | [workspace](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L97-L101) |

Owning schema: `#/$defs/providerInvocation` in [contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json). Read its rows in the owning rule index below.

Qualified local references: `contracts/pipeline-test-gate/v1/src/types.ts#EvidencePolicyV1`, `contracts/pipeline-test-gate/v1/src/types.ts#ExecutionLimitsV1`, `contracts/pipeline-test-gate/v1/src/types.ts#PlanNodeKind`, `contracts/pipeline-test-gate/v1/src/types.ts#ProviderConfigurationV1`, `contracts/pipeline-test-gate/v1/src/types.ts#ProviderRefV1`, `contracts/pipeline-test-gate/v1/src/types.ts#ResolvedInputV1`.

### ProviderOutputV1 — contracts/pipeline-test-gate/v1/src/types.ts

Qualified declaration: `contracts/pipeline-test-gate/v1/src/types.ts#ProviderOutputV1`.

[ProviderOutputV1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L121-L123)

```ts
export type ProviderOutputV1 =
  | { name: string; kind: 'value'; schemaId: string; value: JsonValue }
  | { name: string; kind: 'artifact'; evidenceId: string };
```

| Resolved member | Optional | Readonly | Type | Source |
| --- | --- | --- | --- | --- |
| name | no | no | `string` | [name](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L122-L122) |
| kind | no | no | `"value" \| "artifact"` | [kind](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L122-L122) |

Owning schema: `#/$defs/providerOutput` in [contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json). Read its rows in the owning rule index below.

Qualified local references: `contracts/pipeline-test-gate/v1/src/types.ts#JsonValue`.

### ProviderRefV1 — contracts/pipeline-test-gate/v1/src/types.ts

Qualified declaration: `contracts/pipeline-test-gate/v1/src/types.ts#ProviderRefV1`.

[ProviderRefV1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L17-L20)

```ts
export interface ProviderRefV1 extends PackageRefV1 {
  registrationId: string;
  contractId: string;
}
```

| Resolved member | Optional | Readonly | Type | Source |
| --- | --- | --- | --- | --- |
| registrationId | no | no | `string` | [registrationId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L18-L18) |
| contractId | no | no | `string` | [contractId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L19-L19) |
| packageId | no | no | `string` | [packageId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L12-L12) |
| packageVersion | no | no | `string` | [packageVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L13-L13) |
| contentDigest | no | no | `string` | [contentDigest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L14-L14) |

Owning schema: `#/$defs/providerRef` in [contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json). Read its rows in the owning rule index below.

Qualified local references: `contracts/pipeline-test-gate/v1/src/types.ts#PackageRefV1`.

### ProviderReportV1 — contracts/pipeline-test-gate/v1/src/types.ts

Qualified declaration: `contracts/pipeline-test-gate/v1/src/types.ts#ProviderReportV1`.

[ProviderReportV1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L261-L264)

```ts
export interface ProviderReportV1 {
  evidenceId: string;
  format: string;
}
```

| Resolved member | Optional | Readonly | Type | Source |
| --- | --- | --- | --- | --- |
| evidenceId | no | no | `string` | [evidenceId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L262-L262) |
| format | no | no | `string` | [format](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L263-L263) |

Owning schema: `#/$defs/providerReport` in [contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json). Read its rows in the owning rule index below.

### ProviderResultV1 — contracts/pipeline-test-gate/v1/src/types.ts

Qualified declaration: `contracts/pipeline-test-gate/v1/src/types.ts#ProviderResultV1`.

[ProviderResultV1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L246-L259)

```ts
export interface ProviderResultV1 {
  schemaVersion: 'provider-result.v1';
  outcome: Exclude<TestOutcome, null>;
  summary: string;
  counts: TestCountsV1;
  findings: FindingV1[];
  metrics: MetricV1[];
  evidenceFiles: DeclaredEvidenceV1[];
  reports: ProviderReportV1[];
  outputs: ProviderOutputV1[];
  exitCode: number | null;
  signal: string | null;
  providerDetails: ProviderDetailsV1 | null;
}
```

| Resolved member | Optional | Readonly | Type | Source |
| --- | --- | --- | --- | --- |
| schemaVersion | no | no | `"provider-result.v1"` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L247-L247) |
| outcome | no | no | `"passed" \| "failed" \| "skipped"` | [outcome](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L248-L248) |
| summary | no | no | `string` | [summary](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L249-L249) |
| counts | no | no | `TestCountsV1` | [counts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L250-L250) |
| findings | no | no | `FindingV1[]` | [findings](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L251-L251) |
| metrics | no | no | `MetricV1[]` | [metrics](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L252-L252) |
| evidenceFiles | no | no | `DeclaredEvidenceV1[]` | [evidenceFiles](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L253-L253) |
| reports | no | no | `ProviderReportV1[]` | [reports](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L254-L254) |
| outputs | no | no | `ProviderOutputV1[]` | [outputs](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L255-L255) |
| exitCode | no | no | `number \| null` | [exitCode](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L256-L256) |
| signal | no | no | `string \| null` | [signal](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L257-L257) |
| providerDetails | no | no | `ProviderDetailsV1 \| null` | [providerDetails](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L258-L258) |

Owning schema: `#/$defs/providerResult` in [contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json). Read its rows in the owning rule index below.

Qualified local references: `contracts/pipeline-test-gate/v1/src/types.ts#DeclaredEvidenceV1`, `contracts/pipeline-test-gate/v1/src/types.ts#FindingV1`, `contracts/pipeline-test-gate/v1/src/types.ts#MetricV1`, `contracts/pipeline-test-gate/v1/src/types.ts#ProviderDetailsV1`, `contracts/pipeline-test-gate/v1/src/types.ts#ProviderOutputV1`, `contracts/pipeline-test-gate/v1/src/types.ts#ProviderReportV1`, `contracts/pipeline-test-gate/v1/src/types.ts#TestCountsV1`, `contracts/pipeline-test-gate/v1/src/types.ts#TestOutcome`.

### ReportAdapterRefV1 — contracts/pipeline-test-gate/v1/src/types.ts

Qualified declaration: `contracts/pipeline-test-gate/v1/src/types.ts#ReportAdapterRefV1`.

[ReportAdapterRefV1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L333-L338)

```ts
export interface ReportAdapterRefV1 {
  adapterId: string;
  format: string;
  contractVersion: number;
  package: PackageRefV1;
}
```

| Resolved member | Optional | Readonly | Type | Source |
| --- | --- | --- | --- | --- |
| adapterId | no | no | `string` | [adapterId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L334-L334) |
| format | no | no | `string` | [format](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L335-L335) |
| contractVersion | no | no | `number` | [contractVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L336-L336) |
| package | no | no | `PackageRefV1` | [package](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L337-L337) |

Owning schema: `#/$defs/reportAdapterRef` in [contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json). Read its rows in the owning rule index below.

Qualified local references: `contracts/pipeline-test-gate/v1/src/types.ts#PackageRefV1`.

### ReportAdapterResultV1 — contracts/pipeline-test-gate/v1/src/types.ts

Qualified declaration: `contracts/pipeline-test-gate/v1/src/types.ts#ReportAdapterResultV1`.

[ReportAdapterResultV1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L362-L374)

```ts
export interface ReportAdapterResultV1 {
  schemaVersion: 'report-adapter-result.v1';
  adapter: ReportAdapterRefV1;
  sourceArtifact: ArtifactRefV1;
  counts: ReportCountsV1;
  durationMs: number;
  cases: ReportCaseV1[];
  casesTruncated: boolean;
  omittedCaseCount: number;
  findings: FindingV1[];
  findingsTruncated: boolean;
  omittedFindingCount: number;
}
```

| Resolved member | Optional | Readonly | Type | Source |
| --- | --- | --- | --- | --- |
| schemaVersion | no | no | `"report-adapter-result.v1"` | [schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L363-L363) |
| adapter | no | no | `ReportAdapterRefV1` | [adapter](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L364-L364) |
| sourceArtifact | no | no | `ArtifactRefV1` | [sourceArtifact](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L365-L365) |
| counts | no | no | `ReportCountsV1` | [counts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L366-L366) |
| durationMs | no | no | `number` | [durationMs](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L367-L367) |
| cases | no | no | `ReportCaseV1[]` | [cases](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L368-L368) |
| casesTruncated | no | no | `boolean` | [casesTruncated](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L369-L369) |
| omittedCaseCount | no | no | `number` | [omittedCaseCount](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L370-L370) |
| findings | no | no | `FindingV1[]` | [findings](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L371-L371) |
| findingsTruncated | no | no | `boolean` | [findingsTruncated](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L372-L372) |
| omittedFindingCount | no | no | `number` | [omittedFindingCount](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L373-L373) |

Owning schema: `#/$defs/reportAdapterResult` in [contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json). Read its rows in the owning rule index below.

Qualified local references: `contracts/pipeline-test-gate/v1/src/types.ts#ArtifactRefV1`, `contracts/pipeline-test-gate/v1/src/types.ts#FindingV1`, `contracts/pipeline-test-gate/v1/src/types.ts#ReportAdapterRefV1`, `contracts/pipeline-test-gate/v1/src/types.ts#ReportCaseV1`, `contracts/pipeline-test-gate/v1/src/types.ts#ReportCountsV1`.

### ReportCaseOutcome — contracts/pipeline-test-gate/v1/src/types.ts

Qualified declaration: `contracts/pipeline-test-gate/v1/src/types.ts#ReportCaseOutcome`.

[ReportCaseOutcome](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L340-L340)

```ts
export type ReportCaseOutcome = 'passed' | 'failed' | 'errored' | 'skipped';
```

Owning schema: `#/$defs/reportCase/properties/outcome` in [contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json). Read its rows in the owning rule index below.

### ReportCaseV1 — contracts/pipeline-test-gate/v1/src/types.ts

Qualified declaration: `contracts/pipeline-test-gate/v1/src/types.ts#ReportCaseV1`.

[ReportCaseV1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L350-L360)

```ts
export interface ReportCaseV1 {
  id: string;
  name: string;
  suitePath: string[];
  className: string | null;
  outcome: ReportCaseOutcome;
  durationMs: number;
  findings: FindingV1[];
  findingsTruncated: boolean;
  omittedFindingCount: number;
}
```

| Resolved member | Optional | Readonly | Type | Source |
| --- | --- | --- | --- | --- |
| id | no | no | `string` | [id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L351-L351) |
| name | no | no | `string` | [name](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L352-L352) |
| suitePath | no | no | `string[]` | [suitePath](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L353-L353) |
| className | no | no | `string \| null` | [className](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L354-L354) |
| outcome | no | no | `"passed" \| "failed" \| "skipped" \| "errored"` | [outcome](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L355-L355) |
| durationMs | no | no | `number` | [durationMs](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L356-L356) |
| findings | no | no | `FindingV1[]` | [findings](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L357-L357) |
| findingsTruncated | no | no | `boolean` | [findingsTruncated](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L358-L358) |
| omittedFindingCount | no | no | `number` | [omittedFindingCount](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L359-L359) |

Owning schema: `#/$defs/reportCase` in [contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json). Read its rows in the owning rule index below.

Qualified local references: `contracts/pipeline-test-gate/v1/src/types.ts#FindingV1`, `contracts/pipeline-test-gate/v1/src/types.ts#ReportCaseOutcome`.

### ReportCountsV1 — contracts/pipeline-test-gate/v1/src/types.ts

Qualified declaration: `contracts/pipeline-test-gate/v1/src/types.ts#ReportCountsV1`.

[ReportCountsV1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L342-L348)

```ts
export interface ReportCountsV1 {
  total: number;
  passed: number;
  failed: number;
  errored: number;
  skipped: number;
}
```

| Resolved member | Optional | Readonly | Type | Source |
| --- | --- | --- | --- | --- |
| total | no | no | `number` | [total](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L343-L343) |
| passed | no | no | `number` | [passed](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L344-L344) |
| failed | no | no | `number` | [failed](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L345-L345) |
| errored | no | no | `number` | [errored](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L346-L346) |
| skipped | no | no | `number` | [skipped](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L347-L347) |

Owning schema: `#/$defs/reportCounts` in [contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json). Read its rows in the owning rule index below.

### ResolvedInputV1 — contracts/pipeline-test-gate/v1/src/types.ts

Qualified declaration: `contracts/pipeline-test-gate/v1/src/types.ts#ResolvedInputV1`.

[ResolvedInputV1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L113-L115)

```ts
export type ResolvedInputV1 =
  | { name: string; kind: 'value'; schemaId: string; value: JsonValue }
  | { name: string; kind: 'artifact'; artifact: ArtifactRefV1 };
```

| Resolved member | Optional | Readonly | Type | Source |
| --- | --- | --- | --- | --- |
| name | no | no | `string` | [name](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L114-L114) |
| kind | no | no | `"value" \| "artifact"` | [kind](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L114-L114) |

Owning schema: `#/$defs/resolvedInput` in [contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json). Read its rows in the owning rule index below.

Qualified local references: `contracts/pipeline-test-gate/v1/src/types.ts#ArtifactRefV1`, `contracts/pipeline-test-gate/v1/src/types.ts#JsonValue`.

### TestCountsV1 — contracts/pipeline-test-gate/v1/src/types.ts

Qualified declaration: `contracts/pipeline-test-gate/v1/src/types.ts#TestCountsV1`.

[TestCountsV1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L217-L222)

```ts
export interface TestCountsV1 {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}
```

| Resolved member | Optional | Readonly | Type | Source |
| --- | --- | --- | --- | --- |
| total | no | no | `number` | [total](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L218-L218) |
| passed | no | no | `number` | [passed](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L219-L219) |
| failed | no | no | `number` | [failed](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L220-L220) |
| skipped | no | no | `number` | [skipped](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L221-L221) |

Owning schema: `#/$defs/testCounts` in [contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json). Read its rows in the owning rule index below.

### TestOutcome — contracts/pipeline-test-gate/v1/src/types.ts

Qualified declaration: `contracts/pipeline-test-gate/v1/src/types.ts#TestOutcome`.

[TestOutcome](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/types.ts#L8-L8)

```ts
export type TestOutcome = 'passed' | 'failed' | 'skipped' | null;
```

No one-to-one owning schema definition: read this TypeScript support declaration and the schema at its consuming field. For example, ProviderResultV1 narrows TestOutcome with Exclude<TestOutcome, null>.

### CapabilityInvocation — skills/common/plugin-runtime/sdk/src/generated/contracts.ts

Qualified declaration: `skills/common/plugin-runtime/sdk/src/generated/contracts.ts#CapabilityInvocation`.

[CapabilityInvocation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L15-L22)

```ts
export type CapabilityInvocation = {
  [k: string]: any;
} & {
  operation: string;
  resource: ResourceIdentity;
  payload: JsonObject;
  runtimeDispatchProfile?: RuntimeDispatchProfile;
};
```

| Resolved member | Optional | Readonly | Type | Source |
| --- | --- | --- | --- | --- |
| operation | no | no | `string` | [operation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L18-L18) |
| resource | no | no | `ResourceIdentity` | [resource](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L19-L19) |
| payload | no | no | `JsonObject` | [payload](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L20-L20) |
| runtimeDispatchProfile | yes | no | `{ schemaVersion: "runtime-dispatch-profile.v1"; encoding: "json-utf16-v1"; }` | [runtimeDispatchProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L21-L21) |

Owning schema: `#/$defs/capabilityInvocation` in [skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). Read its rows in the owning rule index below.

Qualified local references: `skills/common/plugin-runtime/sdk/src/generated/contracts.ts#JsonObject`, `skills/common/plugin-runtime/sdk/src/generated/contracts.ts#ResourceIdentity`, `skills/common/plugin-runtime/sdk/src/generated/contracts.ts#RuntimeDispatchProfile`.

### AdapterResourceFence — skills/common/plugin-runtime/sdk/src/runtime.ts

Qualified declaration: `skills/common/plugin-runtime/sdk/src/runtime.ts#AdapterResourceFence`.

[AdapterResourceFence](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L45-L48)

```ts
export interface AdapterResourceFence {
  readonly contract: ResourceLock;
  assertCurrent(): ResourceLock;
}
```

| Resolved member | Optional | Readonly | Type | Source |
| --- | --- | --- | --- | --- |
| contract | no | yes | `ResourceLock` | [contract](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L46-L46) |
| assertCurrent | no | no | `() => ResourceLock` | [assertCurrent](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L47-L47) |

No one-to-one owning schema definition: read this TypeScript support declaration and the schema at its consuming field. For example, ProviderResultV1 narrows TestOutcome with Exclude<TestOutcome, null>.

Qualified local references: `skills/common/plugin-runtime/sdk/src/generated/contracts.ts#ResourceLock`.

### ConfidentialAdapterInvocation — skills/common/plugin-runtime/sdk/src/runtime.ts

Qualified declaration: `skills/common/plugin-runtime/sdk/src/runtime.ts#ConfidentialAdapterInvocation`.

[ConfidentialAdapterInvocation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L58-L64)

```ts
export interface ConfidentialAdapterInvocation {
  readonly request: EffectRequest;
  readonly signal: AbortSignal;
  readonly confidential: true;
  readonly lock?: never;
  readonly fence?: never;
}
```

| Resolved member | Optional | Readonly | Type | Source |
| --- | --- | --- | --- | --- |
| request | no | yes | `{ [k: string]: any; } & { runtimeDispatchProfile?: RuntimeDispatchProfile; schemaVersion: "effect-request.v2"; effectId: OpaqueId; idempotencyKey: EffectIdempotencyKey; deliveryId?: EffectDeliveryId; attempt: EffectAttemptIdentity; capability: NamespacedId; operation: LocalId; resource: ResourceIdentity; payload: JsonObject; requestedAt: string; }` | [request](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L59-L59) |
| signal | no | yes | `AbortSignal` | [signal](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L60-L60) |
| confidential | no | yes | `true` | [confidential](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L61-L61) |
| lock | yes | yes | `never` | [lock](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L62-L62) |
| fence | yes | yes | `never` | [fence](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L63-L63) |

No one-to-one owning schema definition: read this TypeScript support declaration and the schema at its consuming field. For example, ProviderResultV1 narrows TestOutcome with Exclude<TestOutcome, null>.

Qualified local references: `skills/common/plugin-runtime/sdk/src/generated/contracts.ts#EffectRequest`.

### FencedAdapterInvocation — skills/common/plugin-runtime/sdk/src/runtime.ts

Qualified declaration: `skills/common/plugin-runtime/sdk/src/runtime.ts#FencedAdapterInvocation`.

[FencedAdapterInvocation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L50-L56)

```ts
export interface FencedAdapterInvocation {
  readonly request: EffectRequest;
  readonly signal: AbortSignal;
  readonly confidential?: false;
  readonly lock: ResourceLock;
  readonly fence: AdapterResourceFence;
}
```

| Resolved member | Optional | Readonly | Type | Source |
| --- | --- | --- | --- | --- |
| request | no | yes | `{ [k: string]: any; } & { runtimeDispatchProfile?: RuntimeDispatchProfile; schemaVersion: "effect-request.v2"; effectId: OpaqueId; idempotencyKey: EffectIdempotencyKey; deliveryId?: EffectDeliveryId; attempt: EffectAttemptIdentity; capability: NamespacedId; operation: LocalId; resource: ResourceIdentity; payload: JsonObject; requestedAt: string; }` | [request](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L51-L51) |
| signal | no | yes | `AbortSignal` | [signal](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L52-L52) |
| confidential | yes | yes | `false` | [confidential](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L53-L53) |
| lock | no | yes | `ResourceLock` | [lock](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L54-L54) |
| fence | no | yes | `AdapterResourceFence` | [fence](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/sdk/src/runtime.ts#L55-L55) |

No one-to-one owning schema definition: read this TypeScript support declaration and the schema at its consuming field. For example, ProviderResultV1 narrows TestOutcome with Exclude<TestOutcome, null>.

Qualified local references: `skills/common/plugin-runtime/sdk/src/generated/contracts.ts#EffectRequest`, `skills/common/plugin-runtime/sdk/src/generated/contracts.ts#ResourceLock`, `skills/common/plugin-runtime/sdk/src/runtime.ts#AdapterResourceFence`.

## Callback contract rules

These owning test-gate schemas cover provider invocation, provider result and the assembled report result. Callback ReportAdapterOutput selects only its declared fields; Buster adds adapter and sourceArtifact. `$ref` targets are included recursively, including JSON value recursion. Parent required arrays, unions, defaults/absence and bounds apply independently of TypeScript. JSON Schema string lengths measure Unicode code points.

Owning validation first applies the selected JSON Schema without default insertion or coercion. providerInvocation and providerResult have no extra semantic branch in checkPipelineTestGateContract. reportAdapterResult additionally requires outcome counts to sum to total and unique case IDs. Complete cases require zero omittedCaseCount, exact total length and exact outcome counts. Truncated cases require positive omittedCaseCount, listed plus omitted equal total, and listed outcomes no greater than exact counts. Report and case findingsTruncated must be true exactly when omittedFindingCount is positive. Buster supplies adapter/sourceArtifact provenance before this validation. Failure returns errors from checkPipelineTestGateContract; validatePipelineTestGateContract throws PipelineTestGateContractError. Shape acceptance does not authorize provider execution.

Semantic validator: [reportAdapterResultErrors](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/validation.ts#L100-L145).

| Owning JSON pointer | Declared rules | Source |
| --- | --- | --- |
| #/$defs/artifactRef | `{"type":"object","additionalProperties":false,"required":["artifactId","type","mediaType","contentDigest","sizeBytes","storageUrl"]}` | [#/$defs/artifactRef](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L769-L781) |
| #/$defs/artifactRef/properties/artifactId | `{"$ref":"#/$defs/stableId"}` | [#/$defs/artifactRef/properties/artifactId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L774-L774) |
| #/$defs/artifactRef/properties/type | `{"$ref":"#/$defs/stableId"}` | [#/$defs/artifactRef/properties/type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L775-L775) |
| #/$defs/artifactRef/properties/mediaType | `{"$ref":"#/$defs/nonEmptyString"}` | [#/$defs/artifactRef/properties/mediaType](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L776-L776) |
| #/$defs/artifactRef/properties/contentDigest | `{"$ref":"#/$defs/digest"}` | [#/$defs/artifactRef/properties/contentDigest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L777-L777) |
| #/$defs/artifactRef/properties/sizeBytes | `{"type":"integer","minimum":0}` | [#/$defs/artifactRef/properties/sizeBytes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L778-L778) |
| #/$defs/artifactRef/properties/storageUrl | `{"$ref":"#/$defs/nonEmptyString"}` | [#/$defs/artifactRef/properties/storageUrl](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L779-L779) |
| #/$defs/contractId | `{"type":"string","pattern":"^[a-z0-9][a-z0-9._/-]*@[1-9][0-9]*$","maxLength":256}` | [#/$defs/contractId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L16-L20) |
| #/$defs/declaredEvidence | `{"type":"object","additionalProperties":false,"required":["evidenceId","type","file","mediaType"]}` | [#/$defs/declaredEvidence](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1373-L1383) |
| #/$defs/declaredEvidence/properties/evidenceId | `{"$ref":"#/$defs/stableId"}` | [#/$defs/declaredEvidence/properties/evidenceId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1378-L1378) |
| #/$defs/declaredEvidence/properties/type | `{"$ref":"#/$defs/stableId"}` | [#/$defs/declaredEvidence/properties/type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1379-L1379) |
| #/$defs/declaredEvidence/properties/file | `{"$ref":"#/$defs/relativePath"}` | [#/$defs/declaredEvidence/properties/file](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1380-L1380) |
| #/$defs/declaredEvidence/properties/mediaType | `{"$ref":"#/$defs/nonEmptyString"}` | [#/$defs/declaredEvidence/properties/mediaType](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1381-L1381) |
| #/$defs/digest | `{"type":"string","pattern":"^sha256:[a-f0-9]{64}$"}` | [#/$defs/digest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L21-L24) |
| #/$defs/evidencePolicy | `{"type":"object","additionalProperties":false,"required":["onPass","onFail","onError"]}` | [#/$defs/evidencePolicy](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L123-L147) |
| #/$defs/evidencePolicy/properties/onPass | `{"type":"array","maxItems":128,"uniqueItems":true}` | [#/$defs/evidencePolicy/properties/onPass](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L128-L133) |
| #/$defs/evidencePolicy/properties/onPass/items | `{"$ref":"#/$defs/stableId"}` | [#/$defs/evidencePolicy/properties/onPass/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L131-L131) |
| #/$defs/evidencePolicy/properties/onFail | `{"type":"array","maxItems":128,"uniqueItems":true}` | [#/$defs/evidencePolicy/properties/onFail](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L134-L139) |
| #/$defs/evidencePolicy/properties/onFail/items | `{"$ref":"#/$defs/stableId"}` | [#/$defs/evidencePolicy/properties/onFail/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L137-L137) |
| #/$defs/evidencePolicy/properties/onError | `{"type":"array","maxItems":128,"uniqueItems":true}` | [#/$defs/evidencePolicy/properties/onError](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L140-L145) |
| #/$defs/evidencePolicy/properties/onError/items | `{"$ref":"#/$defs/stableId"}` | [#/$defs/evidencePolicy/properties/onError/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L143-L143) |
| #/$defs/executionLimits | `{"type":"object","additionalProperties":false,"required":["cpuMillis","memoryBytes","logBytes","artifactBytes","artifactFiles","processes"]}` | [#/$defs/executionLimits](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L148-L167) |
| #/$defs/executionLimits/properties/cpuMillis | `{"type":"integer","minimum":1}` | [#/$defs/executionLimits/properties/cpuMillis](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L160-L160) |
| #/$defs/executionLimits/properties/memoryBytes | `{"type":"integer","minimum":1}` | [#/$defs/executionLimits/properties/memoryBytes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L161-L161) |
| #/$defs/executionLimits/properties/logBytes | `{"type":"integer","minimum":0}` | [#/$defs/executionLimits/properties/logBytes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L162-L162) |
| #/$defs/executionLimits/properties/artifactBytes | `{"type":"integer","minimum":0}` | [#/$defs/executionLimits/properties/artifactBytes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L163-L163) |
| #/$defs/executionLimits/properties/artifactFiles | `{"type":"integer","minimum":0}` | [#/$defs/executionLimits/properties/artifactFiles](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L164-L164) |
| #/$defs/executionLimits/properties/processes | `{"type":"integer","minimum":1}` | [#/$defs/executionLimits/properties/processes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L165-L165) |
| #/$defs/finding | `{"type":"object","additionalProperties":false,"required":["id","severity","message"]}` | [#/$defs/finding](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L953-L965) |
| #/$defs/finding/properties/id | `{"$ref":"#/$defs/stableId"}` | [#/$defs/finding/properties/id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L958-L958) |
| #/$defs/finding/properties/severity | `{"enum":["critical","high","medium","low","info"]}` | [#/$defs/finding/properties/severity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L959-L959) |
| #/$defs/finding/properties/message | `{"$ref":"#/$defs/nonEmptyString"}` | [#/$defs/finding/properties/message](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L960-L960) |
| #/$defs/finding/properties/rule | `{"$ref":"#/$defs/nonEmptyString"}` | [#/$defs/finding/properties/rule](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L961-L961) |
| #/$defs/finding/properties/file | `{"$ref":"#/$defs/relativePath"}` | [#/$defs/finding/properties/file](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L962-L962) |
| #/$defs/finding/properties/line | `{"type":"integer","minimum":1}` | [#/$defs/finding/properties/line](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L963-L963) |
| #/$defs/jsonObject | `{"type":"object","maxProperties":256,"additionalProperties":{"$ref":"#/$defs/jsonValue"}}` | [#/$defs/jsonObject](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L47-L51) |
| #/$defs/jsonObject/additionalProperties | `{"$ref":"#/$defs/jsonValue"}` | [#/$defs/jsonObject/additionalProperties](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L50-L50) |
| #/$defs/jsonValue | `{}` | [#/$defs/jsonValue](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L31-L46) |
| #/$defs/jsonValue/oneOf/0 | `{"type":"null"}` | [#/$defs/jsonValue/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L33-L33) |
| #/$defs/jsonValue/oneOf/1 | `{"type":"boolean"}` | [#/$defs/jsonValue/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L34-L34) |
| #/$defs/jsonValue/oneOf/2 | `{"type":"number"}` | [#/$defs/jsonValue/oneOf/2](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L35-L35) |
| #/$defs/jsonValue/oneOf/3 | `{"type":"string"}` | [#/$defs/jsonValue/oneOf/3](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L36-L36) |
| #/$defs/jsonValue/oneOf/4 | `{"type":"array"}` | [#/$defs/jsonValue/oneOf/4](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L37-L40) |
| #/$defs/jsonValue/oneOf/4/items | `{"$ref":"#/$defs/jsonValue"}` | [#/$defs/jsonValue/oneOf/4/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L39-L39) |
| #/$defs/jsonValue/oneOf/5 | `{"type":"object","additionalProperties":{"$ref":"#/$defs/jsonValue"}}` | [#/$defs/jsonValue/oneOf/5](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L41-L44) |
| #/$defs/jsonValue/oneOf/5/additionalProperties | `{"$ref":"#/$defs/jsonValue"}` | [#/$defs/jsonValue/oneOf/5/additionalProperties](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L43-L43) |
| #/$defs/metric | `{"type":"object","additionalProperties":false,"required":["name","value"]}` | [#/$defs/metric](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L966-L975) |
| #/$defs/metric/properties/name | `{"$ref":"#/$defs/stableId"}` | [#/$defs/metric/properties/name](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L971-L971) |
| #/$defs/metric/properties/value | `{"type":"number"}` | [#/$defs/metric/properties/value](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L972-L972) |
| #/$defs/metric/properties/unit | `{"$ref":"#/$defs/nonEmptyString"}` | [#/$defs/metric/properties/unit](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L973-L973) |
| #/$defs/nonEmptyString | `{"type":"string","minLength":1,"maxLength":4096}` | [#/$defs/nonEmptyString](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L6-L10) |
| #/$defs/packageRef | `{"type":"object","additionalProperties":false,"required":["packageId","packageVersion","contentDigest"]}` | [#/$defs/packageRef](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L52-L61) |
| #/$defs/packageRef/properties/packageId | `{"$ref":"#/$defs/stableId"}` | [#/$defs/packageRef/properties/packageId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L57-L57) |
| #/$defs/packageRef/properties/packageVersion | `{"$ref":"#/$defs/nonEmptyString"}` | [#/$defs/packageRef/properties/packageVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L58-L58) |
| #/$defs/packageRef/properties/contentDigest | `{"$ref":"#/$defs/digest"}` | [#/$defs/packageRef/properties/contentDigest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L59-L59) |
| #/$defs/providerConfiguration | `{"type":"object","additionalProperties":false,"required":["schemaVersion","contractId","schemaDigest","values"]}` | [#/$defs/providerConfiguration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L252-L262) |
| #/$defs/providerConfiguration/properties/schemaVersion | `{"const":"provider-configuration.v1"}` | [#/$defs/providerConfiguration/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L257-L257) |
| #/$defs/providerConfiguration/properties/contractId | `{"$ref":"#/$defs/contractId"}` | [#/$defs/providerConfiguration/properties/contractId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L258-L258) |
| #/$defs/providerConfiguration/properties/schemaDigest | `{"$ref":"#/$defs/digest"}` | [#/$defs/providerConfiguration/properties/schemaDigest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L259-L259) |
| #/$defs/providerConfiguration/properties/values | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/providerConfiguration/properties/values](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L260-L260) |
| #/$defs/providerDetails | `{"type":"object","additionalProperties":false,"required":["schemaId","schemaDigest","values"]}` | [#/$defs/providerDetails](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L168-L177) |
| #/$defs/providerDetails/properties/schemaId | `{"$ref":"#/$defs/nonEmptyString"}` | [#/$defs/providerDetails/properties/schemaId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L173-L173) |
| #/$defs/providerDetails/properties/schemaDigest | `{"$ref":"#/$defs/digest"}` | [#/$defs/providerDetails/properties/schemaDigest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L174-L174) |
| #/$defs/providerDetails/properties/values | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/providerDetails/properties/values](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L175-L175) |
| #/$defs/providerInvocation | `{"type":"object","additionalProperties":false,"required":["schemaVersion","planId","runId","moduleId","gateId","suiteInstanceId","nodeId","executionId","testIdentity","nodeKind","attemptId","attemptNumber","provider","configuration","inputs","evidence","grantedCapabilities","timeoutMs","limits","workspace"]}` | [#/$defs/providerInvocation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L877-L952) |
| #/$defs/providerInvocation/properties/schemaVersion | `{"const":"provider-invocation.v1"}` | [#/$defs/providerInvocation/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L903-L903) |
| #/$defs/providerInvocation/properties/planId | `{"$ref":"#/$defs/stableId"}` | [#/$defs/providerInvocation/properties/planId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L904-L904) |
| #/$defs/providerInvocation/properties/runId | `{"$ref":"#/$defs/stableId"}` | [#/$defs/providerInvocation/properties/runId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L905-L905) |
| #/$defs/providerInvocation/properties/moduleId | `{}` | [#/$defs/providerInvocation/properties/moduleId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L906-L908) |
| #/$defs/providerInvocation/properties/moduleId/oneOf/0 | `{"$ref":"#/$defs/stableId"}` | [#/$defs/providerInvocation/properties/moduleId/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L907-L907) |
| #/$defs/providerInvocation/properties/moduleId/oneOf/1 | `{"type":"null"}` | [#/$defs/providerInvocation/properties/moduleId/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L907-L907) |
| #/$defs/providerInvocation/properties/gateId | `{}` | [#/$defs/providerInvocation/properties/gateId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L909-L911) |
| #/$defs/providerInvocation/properties/gateId/oneOf/0 | `{"$ref":"#/$defs/stableId"}` | [#/$defs/providerInvocation/properties/gateId/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L910-L910) |
| #/$defs/providerInvocation/properties/gateId/oneOf/1 | `{"type":"null"}` | [#/$defs/providerInvocation/properties/gateId/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L910-L910) |
| #/$defs/providerInvocation/properties/suiteInstanceId | `{}` | [#/$defs/providerInvocation/properties/suiteInstanceId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L912-L914) |
| #/$defs/providerInvocation/properties/suiteInstanceId/oneOf/0 | `{"$ref":"#/$defs/stableId"}` | [#/$defs/providerInvocation/properties/suiteInstanceId/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L913-L913) |
| #/$defs/providerInvocation/properties/suiteInstanceId/oneOf/1 | `{"type":"null"}` | [#/$defs/providerInvocation/properties/suiteInstanceId/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L913-L913) |
| #/$defs/providerInvocation/properties/nodeId | `{"$ref":"#/$defs/stableId"}` | [#/$defs/providerInvocation/properties/nodeId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L915-L915) |
| #/$defs/providerInvocation/properties/executionId | `{"$ref":"#/$defs/stableId"}` | [#/$defs/providerInvocation/properties/executionId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L916-L916) |
| #/$defs/providerInvocation/properties/testIdentity | `{"type":"string","pattern":"^test:[a-f0-9]{64}$"}` | [#/$defs/providerInvocation/properties/testIdentity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L917-L917) |
| #/$defs/providerInvocation/properties/nodeKind | `{"enum":["test","fixture"]}` | [#/$defs/providerInvocation/properties/nodeKind](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L918-L918) |
| #/$defs/providerInvocation/properties/attemptId | `{"$ref":"#/$defs/stableId"}` | [#/$defs/providerInvocation/properties/attemptId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L919-L919) |
| #/$defs/providerInvocation/properties/attemptNumber | `{"type":"integer","minimum":1}` | [#/$defs/providerInvocation/properties/attemptNumber](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L920-L920) |
| #/$defs/providerInvocation/properties/provider | `{"$ref":"#/$defs/providerRef"}` | [#/$defs/providerInvocation/properties/provider](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L921-L921) |
| #/$defs/providerInvocation/properties/configuration | `{"$ref":"#/$defs/providerConfiguration"}` | [#/$defs/providerInvocation/properties/configuration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L922-L922) |
| #/$defs/providerInvocation/properties/inputs | `{"type":"array","maxItems":128}` | [#/$defs/providerInvocation/properties/inputs](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L923-L927) |
| #/$defs/providerInvocation/properties/inputs/items | `{"$ref":"#/$defs/resolvedInput"}` | [#/$defs/providerInvocation/properties/inputs/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L926-L926) |
| #/$defs/providerInvocation/properties/evidence | `{"$ref":"#/$defs/evidencePolicy"}` | [#/$defs/providerInvocation/properties/evidence](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L928-L928) |
| #/$defs/providerInvocation/properties/grantedCapabilities | `{"type":"array","maxItems":128,"uniqueItems":true}` | [#/$defs/providerInvocation/properties/grantedCapabilities](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L929-L934) |
| #/$defs/providerInvocation/properties/grantedCapabilities/items | `{"$ref":"#/$defs/stableId"}` | [#/$defs/providerInvocation/properties/grantedCapabilities/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L932-L932) |
| #/$defs/providerInvocation/properties/timeoutMs | `{"type":"integer","minimum":1}` | [#/$defs/providerInvocation/properties/timeoutMs](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L935-L935) |
| #/$defs/providerInvocation/properties/limits | `{"$ref":"#/$defs/executionLimits"}` | [#/$defs/providerInvocation/properties/limits](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L936-L936) |
| #/$defs/providerInvocation/properties/workspace | `{"type":"object","additionalProperties":false,"required":["repository","scratch","evidence"]}` | [#/$defs/providerInvocation/properties/workspace](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L937-L946) |
| #/$defs/providerInvocation/properties/workspace/properties/repository | `{"$ref":"#/$defs/relativePath"}` | [#/$defs/providerInvocation/properties/workspace/properties/repository](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L942-L942) |
| #/$defs/providerInvocation/properties/workspace/properties/scratch | `{"$ref":"#/$defs/relativePath"}` | [#/$defs/providerInvocation/properties/workspace/properties/scratch](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L943-L943) |
| #/$defs/providerInvocation/properties/workspace/properties/evidence | `{"$ref":"#/$defs/relativePath"}` | [#/$defs/providerInvocation/properties/workspace/properties/evidence](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L944-L944) |
| #/$defs/providerInvocation/anyOf/0 | `{}` | [#/$defs/providerInvocation/anyOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L949-L949) |
| #/$defs/providerInvocation/anyOf/0/properties/moduleId | `{"type":"string"}` | [#/$defs/providerInvocation/anyOf/0/properties/moduleId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L949-L949) |
| #/$defs/providerInvocation/anyOf/1 | `{}` | [#/$defs/providerInvocation/anyOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L950-L950) |
| #/$defs/providerInvocation/anyOf/1/properties/gateId | `{"type":"string"}` | [#/$defs/providerInvocation/anyOf/1/properties/gateId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L950-L950) |
| #/$defs/providerOutput | `{"type":"object","additionalProperties":false,"required":["name","kind"]}` | [#/$defs/providerOutput](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L845-L876) |
| #/$defs/providerOutput/properties/name | `{"$ref":"#/$defs/stableId"}` | [#/$defs/providerOutput/properties/name](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L850-L850) |
| #/$defs/providerOutput/properties/kind | `{"enum":["value","artifact"]}` | [#/$defs/providerOutput/properties/kind](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L851-L851) |
| #/$defs/providerOutput/properties/schemaId | `{"$ref":"#/$defs/nonEmptyString"}` | [#/$defs/providerOutput/properties/schemaId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L852-L852) |
| #/$defs/providerOutput/properties/value | `{"$ref":"#/$defs/jsonValue"}` | [#/$defs/providerOutput/properties/value](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L853-L853) |
| #/$defs/providerOutput/properties/evidenceId | `{"$ref":"#/$defs/stableId"}` | [#/$defs/providerOutput/properties/evidenceId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L854-L854) |
| #/$defs/providerOutput/oneOf/0 | `{"required":["schemaId","value"]}` | [#/$defs/providerOutput/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L857-L865) |
| #/$defs/providerOutput/oneOf/0/properties/kind | `{"const":"value"}` | [#/$defs/providerOutput/oneOf/0/properties/kind](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L859-L859) |
| #/$defs/providerOutput/oneOf/0/properties/schemaId | `{"$ref":"#/$defs/nonEmptyString"}` | [#/$defs/providerOutput/oneOf/0/properties/schemaId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L860-L860) |
| #/$defs/providerOutput/oneOf/0/properties/value | `{"$ref":"#/$defs/jsonValue"}` | [#/$defs/providerOutput/oneOf/0/properties/value](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L861-L861) |
| #/$defs/providerOutput/oneOf/0/properties/evidenceId | `false` | [#/$defs/providerOutput/oneOf/0/properties/evidenceId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L862-L862) |
| #/$defs/providerOutput/oneOf/1 | `{"required":["evidenceId"]}` | [#/$defs/providerOutput/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L866-L874) |
| #/$defs/providerOutput/oneOf/1/properties/kind | `{"const":"artifact"}` | [#/$defs/providerOutput/oneOf/1/properties/kind](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L868-L868) |
| #/$defs/providerOutput/oneOf/1/properties/schemaId | `false` | [#/$defs/providerOutput/oneOf/1/properties/schemaId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L869-L869) |
| #/$defs/providerOutput/oneOf/1/properties/value | `false` | [#/$defs/providerOutput/oneOf/1/properties/value](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L870-L870) |
| #/$defs/providerOutput/oneOf/1/properties/evidenceId | `{"$ref":"#/$defs/stableId"}` | [#/$defs/providerOutput/oneOf/1/properties/evidenceId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L871-L871) |
| #/$defs/providerRef | `{"type":"object","additionalProperties":false,"required":["packageId","packageVersion","contentDigest","registrationId","contractId"]}` | [#/$defs/providerRef](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L62-L73) |
| #/$defs/providerRef/properties/packageId | `{"$ref":"#/$defs/stableId"}` | [#/$defs/providerRef/properties/packageId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L67-L67) |
| #/$defs/providerRef/properties/packageVersion | `{"$ref":"#/$defs/nonEmptyString"}` | [#/$defs/providerRef/properties/packageVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L68-L68) |
| #/$defs/providerRef/properties/contentDigest | `{"$ref":"#/$defs/digest"}` | [#/$defs/providerRef/properties/contentDigest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L69-L69) |
| #/$defs/providerRef/properties/registrationId | `{"$ref":"#/$defs/stableId"}` | [#/$defs/providerRef/properties/registrationId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L70-L70) |
| #/$defs/providerRef/properties/contractId | `{"$ref":"#/$defs/contractId"}` | [#/$defs/providerRef/properties/contractId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L71-L71) |
| #/$defs/providerReport | `{"type":"object","additionalProperties":false,"required":["evidenceId","format"]}` | [#/$defs/providerReport](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1008-L1016) |
| #/$defs/providerReport/properties/evidenceId | `{"$ref":"#/$defs/stableId"}` | [#/$defs/providerReport/properties/evidenceId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1013-L1013) |
| #/$defs/providerReport/properties/format | `{"$ref":"#/$defs/stableId"}` | [#/$defs/providerReport/properties/format](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1014-L1014) |
| #/$defs/providerResult | `{"type":"object","additionalProperties":false,"required":["schemaVersion","outcome","summary","counts","findings","metrics","evidenceFiles","reports","outputs","exitCode","signal","providerDetails"]}` | [#/$defs/providerResult](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1017-L1080) |
| #/$defs/providerResult/properties/schemaVersion | `{"const":"provider-result.v1"}` | [#/$defs/providerResult/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1035-L1035) |
| #/$defs/providerResult/properties/outcome | `{"enum":["passed","failed","skipped"]}` | [#/$defs/providerResult/properties/outcome](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1036-L1036) |
| #/$defs/providerResult/properties/summary | `{"type":"string","maxLength":4096}` | [#/$defs/providerResult/properties/summary](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1037-L1037) |
| #/$defs/providerResult/properties/counts | `{"$ref":"#/$defs/testCounts"}` | [#/$defs/providerResult/properties/counts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1038-L1038) |
| #/$defs/providerResult/properties/findings | `{"type":"array","maxItems":10000}` | [#/$defs/providerResult/properties/findings](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1039-L1043) |
| #/$defs/providerResult/properties/findings/items | `{"$ref":"#/$defs/finding"}` | [#/$defs/providerResult/properties/findings/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1042-L1042) |
| #/$defs/providerResult/properties/metrics | `{"type":"array","maxItems":1000}` | [#/$defs/providerResult/properties/metrics](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1044-L1048) |
| #/$defs/providerResult/properties/metrics/items | `{"$ref":"#/$defs/metric"}` | [#/$defs/providerResult/properties/metrics/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1047-L1047) |
| #/$defs/providerResult/properties/evidenceFiles | `{"type":"array","maxItems":1000}` | [#/$defs/providerResult/properties/evidenceFiles](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1049-L1053) |
| #/$defs/providerResult/properties/evidenceFiles/items | `{"$ref":"#/$defs/declaredEvidence"}` | [#/$defs/providerResult/properties/evidenceFiles/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1052-L1052) |
| #/$defs/providerResult/properties/reports | `{"type":"array","maxItems":1000}` | [#/$defs/providerResult/properties/reports](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1054-L1058) |
| #/$defs/providerResult/properties/reports/items | `{"$ref":"#/$defs/providerReport"}` | [#/$defs/providerResult/properties/reports/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1057-L1057) |
| #/$defs/providerResult/properties/outputs | `{"type":"array","maxItems":128}` | [#/$defs/providerResult/properties/outputs](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1059-L1063) |
| #/$defs/providerResult/properties/outputs/items | `{"$ref":"#/$defs/providerOutput"}` | [#/$defs/providerResult/properties/outputs/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1062-L1062) |
| #/$defs/providerResult/properties/exitCode | `{}` | [#/$defs/providerResult/properties/exitCode](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1064-L1066) |
| #/$defs/providerResult/properties/exitCode/oneOf/0 | `{"type":"integer"}` | [#/$defs/providerResult/properties/exitCode/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1065-L1065) |
| #/$defs/providerResult/properties/exitCode/oneOf/1 | `{"type":"null"}` | [#/$defs/providerResult/properties/exitCode/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1065-L1065) |
| #/$defs/providerResult/properties/signal | `{}` | [#/$defs/providerResult/properties/signal](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1067-L1072) |
| #/$defs/providerResult/properties/signal/oneOf/0 | `{"$ref":"#/$defs/nonEmptyString"}` | [#/$defs/providerResult/properties/signal/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1069-L1069) |
| #/$defs/providerResult/properties/signal/oneOf/1 | `{"type":"null"}` | [#/$defs/providerResult/properties/signal/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1070-L1070) |
| #/$defs/providerResult/properties/providerDetails | `{}` | [#/$defs/providerResult/properties/providerDetails](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1073-L1078) |
| #/$defs/providerResult/properties/providerDetails/oneOf/0 | `{"$ref":"#/$defs/providerDetails"}` | [#/$defs/providerResult/properties/providerDetails/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1075-L1075) |
| #/$defs/providerResult/properties/providerDetails/oneOf/1 | `{"type":"null"}` | [#/$defs/providerResult/properties/providerDetails/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1076-L1076) |
| #/$defs/relativePath | `{"type":"string","minLength":1,"maxLength":4096,"pattern":"^(?!/)(?!.*(?:^\|/)\\.\\.(?:/\|$)).+$"}` | [#/$defs/relativePath](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L25-L30) |
| #/$defs/reportAdapterRef | `{"type":"object","additionalProperties":false,"required":["adapterId","format","contractVersion","package"]}` | [#/$defs/reportAdapterRef](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1462-L1472) |
| #/$defs/reportAdapterRef/properties/adapterId | `{"$ref":"#/$defs/stableId"}` | [#/$defs/reportAdapterRef/properties/adapterId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1467-L1467) |
| #/$defs/reportAdapterRef/properties/format | `{"$ref":"#/$defs/stableId"}` | [#/$defs/reportAdapterRef/properties/format](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1468-L1468) |
| #/$defs/reportAdapterRef/properties/contractVersion | `{"type":"integer","minimum":1}` | [#/$defs/reportAdapterRef/properties/contractVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1469-L1469) |
| #/$defs/reportAdapterRef/properties/package | `{"$ref":"#/$defs/packageRef"}` | [#/$defs/reportAdapterRef/properties/package](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1470-L1470) |
| #/$defs/reportAdapterResult | `{"type":"object","additionalProperties":false,"required":["schemaVersion","adapter","sourceArtifact","counts","durationMs","cases","casesTruncated","omittedCaseCount","findings","findingsTruncated","omittedFindingCount"]}` | [#/$defs/reportAdapterResult](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1517-L1554) |
| #/$defs/reportAdapterResult/properties/schemaVersion | `{"const":"report-adapter-result.v1"}` | [#/$defs/reportAdapterResult/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1534-L1534) |
| #/$defs/reportAdapterResult/properties/adapter | `{"$ref":"#/$defs/reportAdapterRef"}` | [#/$defs/reportAdapterResult/properties/adapter](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1535-L1535) |
| #/$defs/reportAdapterResult/properties/sourceArtifact | `{"$ref":"#/$defs/artifactRef"}` | [#/$defs/reportAdapterResult/properties/sourceArtifact](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1536-L1536) |
| #/$defs/reportAdapterResult/properties/counts | `{"$ref":"#/$defs/reportCounts"}` | [#/$defs/reportAdapterResult/properties/counts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1537-L1537) |
| #/$defs/reportAdapterResult/properties/durationMs | `{"type":"number","minimum":0}` | [#/$defs/reportAdapterResult/properties/durationMs](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1538-L1538) |
| #/$defs/reportAdapterResult/properties/cases | `{"type":"array","maxItems":5000}` | [#/$defs/reportAdapterResult/properties/cases](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1539-L1543) |
| #/$defs/reportAdapterResult/properties/cases/items | `{"$ref":"#/$defs/reportCase"}` | [#/$defs/reportAdapterResult/properties/cases/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1542-L1542) |
| #/$defs/reportAdapterResult/properties/casesTruncated | `{"type":"boolean"}` | [#/$defs/reportAdapterResult/properties/casesTruncated](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1544-L1544) |
| #/$defs/reportAdapterResult/properties/omittedCaseCount | `{"type":"integer","minimum":0}` | [#/$defs/reportAdapterResult/properties/omittedCaseCount](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1545-L1545) |
| #/$defs/reportAdapterResult/properties/findings | `{"type":"array","maxItems":5000}` | [#/$defs/reportAdapterResult/properties/findings](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1546-L1550) |
| #/$defs/reportAdapterResult/properties/findings/items | `{"$ref":"#/$defs/finding"}` | [#/$defs/reportAdapterResult/properties/findings/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1549-L1549) |
| #/$defs/reportAdapterResult/properties/findingsTruncated | `{"type":"boolean"}` | [#/$defs/reportAdapterResult/properties/findingsTruncated](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1551-L1551) |
| #/$defs/reportAdapterResult/properties/omittedFindingCount | `{"type":"integer","minimum":0}` | [#/$defs/reportAdapterResult/properties/omittedFindingCount](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1552-L1552) |
| #/$defs/reportCase | `{"type":"object","additionalProperties":false,"required":["id","name","suitePath","className","outcome","durationMs","findings","findingsTruncated","omittedFindingCount"]}` | [#/$defs/reportCase](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1473-L1504) |
| #/$defs/reportCase/properties/id | `{"$ref":"#/$defs/stableId"}` | [#/$defs/reportCase/properties/id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1481-L1481) |
| #/$defs/reportCase/properties/name | `{"$ref":"#/$defs/nonEmptyString"}` | [#/$defs/reportCase/properties/name](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1482-L1482) |
| #/$defs/reportCase/properties/suitePath | `{"type":"array","maxItems":64}` | [#/$defs/reportCase/properties/suitePath](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1483-L1487) |
| #/$defs/reportCase/properties/suitePath/items | `{"$ref":"#/$defs/nonEmptyString"}` | [#/$defs/reportCase/properties/suitePath/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1486-L1486) |
| #/$defs/reportCase/properties/className | `{}` | [#/$defs/reportCase/properties/className](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1488-L1493) |
| #/$defs/reportCase/properties/className/oneOf/0 | `{"$ref":"#/$defs/nonEmptyString"}` | [#/$defs/reportCase/properties/className/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1490-L1490) |
| #/$defs/reportCase/properties/className/oneOf/1 | `{"type":"null"}` | [#/$defs/reportCase/properties/className/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1491-L1491) |
| #/$defs/reportCase/properties/outcome | `{"enum":["passed","failed","errored","skipped"]}` | [#/$defs/reportCase/properties/outcome](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1494-L1494) |
| #/$defs/reportCase/properties/durationMs | `{"type":"number","minimum":0}` | [#/$defs/reportCase/properties/durationMs](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1495-L1495) |
| #/$defs/reportCase/properties/findings | `{"type":"array","maxItems":100}` | [#/$defs/reportCase/properties/findings](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1496-L1500) |
| #/$defs/reportCase/properties/findings/items | `{"$ref":"#/$defs/finding"}` | [#/$defs/reportCase/properties/findings/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1499-L1499) |
| #/$defs/reportCase/properties/findingsTruncated | `{"type":"boolean"}` | [#/$defs/reportCase/properties/findingsTruncated](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1501-L1501) |
| #/$defs/reportCase/properties/omittedFindingCount | `{"type":"integer","minimum":0}` | [#/$defs/reportCase/properties/omittedFindingCount](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1502-L1502) |
| #/$defs/reportCounts | `{"type":"object","additionalProperties":false,"required":["total","passed","failed","errored","skipped"]}` | [#/$defs/reportCounts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1505-L1516) |
| #/$defs/reportCounts/properties/total | `{"type":"integer","minimum":0}` | [#/$defs/reportCounts/properties/total](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1510-L1510) |
| #/$defs/reportCounts/properties/passed | `{"type":"integer","minimum":0}` | [#/$defs/reportCounts/properties/passed](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1511-L1511) |
| #/$defs/reportCounts/properties/failed | `{"type":"integer","minimum":0}` | [#/$defs/reportCounts/properties/failed](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1512-L1512) |
| #/$defs/reportCounts/properties/errored | `{"type":"integer","minimum":0}` | [#/$defs/reportCounts/properties/errored](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1513-L1513) |
| #/$defs/reportCounts/properties/skipped | `{"type":"integer","minimum":0}` | [#/$defs/reportCounts/properties/skipped](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L1514-L1514) |
| #/$defs/resolvedInput | `{"type":"object","additionalProperties":false,"required":["name","kind"]}` | [#/$defs/resolvedInput](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L782-L812) |
| #/$defs/resolvedInput/properties/name | `{"$ref":"#/$defs/stableId"}` | [#/$defs/resolvedInput/properties/name](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L787-L787) |
| #/$defs/resolvedInput/properties/kind | `{"enum":["value","artifact"]}` | [#/$defs/resolvedInput/properties/kind](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L788-L788) |
| #/$defs/resolvedInput/properties/value | `{"$ref":"#/$defs/jsonValue"}` | [#/$defs/resolvedInput/properties/value](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L789-L789) |
| #/$defs/resolvedInput/properties/schemaId | `{"$ref":"#/$defs/nonEmptyString"}` | [#/$defs/resolvedInput/properties/schemaId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L790-L790) |
| #/$defs/resolvedInput/properties/artifact | `{"$ref":"#/$defs/artifactRef"}` | [#/$defs/resolvedInput/properties/artifact](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L791-L791) |
| #/$defs/resolvedInput/oneOf/0 | `{"required":["value","schemaId"]}` | [#/$defs/resolvedInput/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L794-L802) |
| #/$defs/resolvedInput/oneOf/0/properties/kind | `{"const":"value"}` | [#/$defs/resolvedInput/oneOf/0/properties/kind](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L796-L796) |
| #/$defs/resolvedInput/oneOf/0/properties/schemaId | `{"$ref":"#/$defs/nonEmptyString"}` | [#/$defs/resolvedInput/oneOf/0/properties/schemaId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L797-L797) |
| #/$defs/resolvedInput/oneOf/0/properties/value | `{"$ref":"#/$defs/jsonValue"}` | [#/$defs/resolvedInput/oneOf/0/properties/value](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L798-L798) |
| #/$defs/resolvedInput/oneOf/0/properties/artifact | `false` | [#/$defs/resolvedInput/oneOf/0/properties/artifact](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L799-L799) |
| #/$defs/resolvedInput/oneOf/1 | `{"required":["artifact"]}` | [#/$defs/resolvedInput/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L803-L810) |
| #/$defs/resolvedInput/oneOf/1/properties/kind | `{"const":"artifact"}` | [#/$defs/resolvedInput/oneOf/1/properties/kind](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L805-L805) |
| #/$defs/resolvedInput/oneOf/1/properties/artifact | `{"$ref":"#/$defs/artifactRef"}` | [#/$defs/resolvedInput/oneOf/1/properties/artifact](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L806-L806) |
| #/$defs/resolvedInput/oneOf/1/properties/value | `false` | [#/$defs/resolvedInput/oneOf/1/properties/value](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L807-L807) |
| #/$defs/stableId | `{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9._:/-]*$","maxLength":256}` | [#/$defs/stableId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L11-L15) |
| #/$defs/testCounts | `{"type":"object","additionalProperties":false,"required":["total","passed","failed","skipped"]}` | [#/$defs/testCounts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L976-L986) |
| #/$defs/testCounts/properties/total | `{"type":"integer","minimum":0}` | [#/$defs/testCounts/properties/total](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L981-L981) |
| #/$defs/testCounts/properties/passed | `{"type":"integer","minimum":0}` | [#/$defs/testCounts/properties/passed](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L982-L982) |
| #/$defs/testCounts/properties/failed | `{"type":"integer","minimum":0}` | [#/$defs/testCounts/properties/failed](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L983-L983) |
| #/$defs/testCounts/properties/skipped | `{"type":"integer","minimum":0}` | [#/$defs/testCounts/properties/skipped](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json#L984-L984) |

### Provider result admission

After providerResult schema validation, Buster requires total = passed + failed + skipped, and a passed outcome cannot have failed > 0. Evidence IDs and file paths must each be unique; runner-log is reserved; evidence types must be registered. Report evidence IDs must be unique, report formats registered, and each report must refer to declared test-report evidence.

Source: [validateCounts / validateEvidenceDeclarations / validateProviderReports](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/buster/engine/test-gates/runner.ts#L326-L373).

Before admission, native JSON.stringify output must fit the configured provider-result UTF-8 byte budget. Buster applies schema, counts, selected details, evidence and report checks before freezing a clone. Artifact outputs must refer to declared evidence IDs. These runtime checks do not run merely because a callback has the TypeScript signature.

Source: [provider result admission](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/buster/engine/test-gates/runner.ts#L1224-L1253).

### Selected provider-details rules

Buster selects these extra rules for kubeclaw.playwright@1, or whenever providerDetails.schemaId is kubeclaw.e2e-result.v1. Other provider-specific details remain governed by their owning provider contract, not a universal E2E requirement.

Require the exact E2E schema ID and SHA-256 of the owning schema bytes, then validate values against that schema. Total must equal passed plus failed plus skipped plus unexecuted and the number of test cases. IDs must be unique; the number of cases with each status must equal its count. Failure throws TEST_PROVIDER_E2E_DETAILS_INVALID.

Source: [validateE2eProviderDetails](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/src/validation.ts#L56-L69).

| Owning E2E JSON pointer | Declared rules | Source |
| --- | --- | --- |
| # | `{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://kubeclaw.dev/contracts/pipeline-test-gate/e2e-result.v1.schema.json","title":"KubeClaw common end-to-end provider result","type":"object","additionalProperties":false,"required":["schemaVersion","provider","targetOrigin","workers","browserProjects","testCases","counts","reportFormat","resourceEnforcement"]}` | [#](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/e2e-result.v1.schema.json#L1-L57) |
| #/properties/schemaVersion | `{"const":"e2e-result.v1"}` | [#/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/e2e-result.v1.schema.json#L9-L9) |
| #/properties/provider | `{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"}` | [#/properties/provider](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/e2e-result.v1.schema.json#L10-L10) |
| #/properties/targetOrigin | `{"type":"string","format":"uri","maxLength":2048}` | [#/properties/targetOrigin](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/e2e-result.v1.schema.json#L11-L11) |
| #/properties/workers | `{"type":"integer","minimum":1,"maximum":1024}` | [#/properties/workers](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/e2e-result.v1.schema.json#L12-L12) |
| #/properties/browserProjects | `{"type":"array","maxItems":256,"uniqueItems":true}` | [#/properties/browserProjects](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/e2e-result.v1.schema.json#L13-L18) |
| #/properties/browserProjects/items | `{"type":"string","minLength":1,"maxLength":256}` | [#/properties/browserProjects/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/e2e-result.v1.schema.json#L17-L17) |
| #/properties/testCases | `{"type":"array","minItems":1,"maxItems":100000}` | [#/properties/testCases](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/e2e-result.v1.schema.json#L19-L41) |
| #/properties/testCases/items | `{"type":"object","additionalProperties":false,"required":["id","title","project","status","attempts","errors"]}` | [#/properties/testCases/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/e2e-result.v1.schema.json#L23-L40) |
| #/properties/testCases/items/properties/id | `{"type":"string","pattern":"^sha256:[a-f0-9]{64}$"}` | [#/properties/testCases/items/properties/id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/e2e-result.v1.schema.json#L28-L28) |
| #/properties/testCases/items/properties/title | `{"type":"string","minLength":1,"maxLength":2048}` | [#/properties/testCases/items/properties/title](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/e2e-result.v1.schema.json#L29-L29) |
| #/properties/testCases/items/properties/project | `{"type":["string","null"],"maxLength":256}` | [#/properties/testCases/items/properties/project](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/e2e-result.v1.schema.json#L30-L30) |
| #/properties/testCases/items/properties/browser | `{"type":["string","null"],"maxLength":128}` | [#/properties/testCases/items/properties/browser](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/e2e-result.v1.schema.json#L31-L31) |
| #/properties/testCases/items/properties/status | `{"enum":["passed","failed","skipped","unexecuted"]}` | [#/properties/testCases/items/properties/status](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/e2e-result.v1.schema.json#L32-L32) |
| #/properties/testCases/items/properties/attempts | `{"type":"integer","minimum":0,"maximum":1000}` | [#/properties/testCases/items/properties/attempts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/e2e-result.v1.schema.json#L33-L33) |
| #/properties/testCases/items/properties/errors | `{"type":"array","maxItems":1000}` | [#/properties/testCases/items/properties/errors](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/e2e-result.v1.schema.json#L34-L38) |
| #/properties/testCases/items/properties/errors/items | `{"type":"string","minLength":1,"maxLength":4096}` | [#/properties/testCases/items/properties/errors/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/e2e-result.v1.schema.json#L37-L37) |
| #/properties/counts | `{"type":"object","additionalProperties":false,"required":["total","passed","failed","skipped","unexecuted"]}` | [#/properties/counts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/e2e-result.v1.schema.json#L42-L53) |
| #/properties/counts/properties/total | `{"type":"integer","minimum":1}` | [#/properties/counts/properties/total](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/e2e-result.v1.schema.json#L47-L47) |
| #/properties/counts/properties/passed | `{"type":"integer","minimum":0}` | [#/properties/counts/properties/passed](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/e2e-result.v1.schema.json#L48-L48) |
| #/properties/counts/properties/failed | `{"type":"integer","minimum":0}` | [#/properties/counts/properties/failed](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/e2e-result.v1.schema.json#L49-L49) |
| #/properties/counts/properties/skipped | `{"type":"integer","minimum":0}` | [#/properties/counts/properties/skipped](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/e2e-result.v1.schema.json#L50-L50) |
| #/properties/counts/properties/unexecuted | `{"type":"integer","minimum":0}` | [#/properties/counts/properties/unexecuted](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/e2e-result.v1.schema.json#L51-L51) |
| #/properties/reportFormat | `{"type":"string","minLength":1,"maxLength":128}` | [#/properties/reportFormat](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/e2e-result.v1.schema.json#L54-L54) |
| #/properties/resourceEnforcement | `{"enum":["cgroup-v2","sampled"]}` | [#/properties/resourceEnforcement](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/contracts/pipeline-test-gate/v1/schemas/e2e-result.v1.schema.json#L55-L55) |

## Complete schema rule index

This index includes recursive property, item, alternative and conditional rules. A `$ref` points to another row; read both rules. An absent `default` is not an SDK default. Parent `required` arrays determine which properties must be present. Conditional `if`/`then` and `not` rows retain rules that TypeScript cannot express.

| JSON pointer | Declared rules | Source |
| --- | --- | --- |
| # | `{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json","title":"KubeClaw plugin system v2 contracts"}` | [#](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1-L1179) |
| #/$defs/reviewCacheProfile | `{"description":"Explicit immutable run-owned review cache producer profile. Historical absence preserves review-content-cache.v1 and its original effect operations.","const":{"schemaVersion":"review-cache-profile.v1","recordVersion":"review-content-cache.v2","encoding":"json-utf16-v1"}}` | [#/$defs/reviewCacheProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L6-L9) |
| #/$defs/runtimeDispatchProfile | `{"description":"Explicit current runtime transport producer profile. Absence in historical contexts preserves the legacy producer; no profile is inferred from another digest version.","const":{"schemaVersion":"runtime-dispatch-profile.v1","encoding":"json-utf16-v1"}}` | [#/$defs/runtimeDispatchProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L10-L13) |
| #/$defs/capabilityInvocation | `{"type":"object","additionalProperties":false,"required":["operation","resource","payload"]}` | [#/$defs/capabilityInvocation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L14-L27) |
| #/$defs/capabilityInvocation/properties/operation | `{"type":"string","minLength":1}` | [#/$defs/capabilityInvocation/properties/operation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L18-L18) |
| #/$defs/capabilityInvocation/properties/resource | `{"$ref":"#/$defs/resourceIdentity"}` | [#/$defs/capabilityInvocation/properties/resource](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L19-L19) |
| #/$defs/capabilityInvocation/properties/payload | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/capabilityInvocation/properties/payload](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L20-L20) |
| #/$defs/capabilityInvocation/properties/runtimeDispatchProfile | `{"$ref":"#/$defs/runtimeDispatchProfile"}` | [#/$defs/capabilityInvocation/properties/runtimeDispatchProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L21-L21) |
| #/$defs/capabilityInvocation/allOf/0 | `{}` | [#/$defs/capabilityInvocation/allOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L23-L26) |
| #/$defs/capabilityInvocation/allOf/0/if | `{"required":["runtimeDispatchProfile"]}` | [#/$defs/capabilityInvocation/allOf/0/if](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L24-L24) |
| #/$defs/capabilityInvocation/allOf/0/if/properties/runtimeDispatchProfile | `true` | [#/$defs/capabilityInvocation/allOf/0/if/properties/runtimeDispatchProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L24-L24) |
| #/$defs/capabilityInvocation/allOf/0/then | `{}` | [#/$defs/capabilityInvocation/allOf/0/then](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L25-L25) |
| #/$defs/capabilityInvocation/allOf/0/then/properties/operation | `{"const":"dispatch"}` | [#/$defs/capabilityInvocation/allOf/0/then/properties/operation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L25-L25) |
| #/$defs/capabilityInvocation/allOf/0/then/properties/resource | `{"type":"object"}` | [#/$defs/capabilityInvocation/allOf/0/then/properties/resource](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L25-L25) |
| #/$defs/capabilityInvocation/allOf/0/then/properties/resource/properties/type | `{"const":"runtime.agent"}` | [#/$defs/capabilityInvocation/allOf/0/then/properties/resource/properties/type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L25-L25) |
| #/$defs/runtimeRunGraph | `{"type":"object","additionalProperties":false,"required":["schemaVersion","pipelineId","maxConcurrency","nodes","ordinaryEdges","remediationEdges","digest"]}` | [#/$defs/runtimeRunGraph](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L28-L40) |
| #/$defs/runtimeRunGraph/properties/schemaVersion | `{"enum":["execution-graph-snapshot.v2","execution-graph-snapshot.v3"]}` | [#/$defs/runtimeRunGraph/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L32-L32) |
| #/$defs/runtimeRunGraph/properties/pipelineId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/runtimeRunGraph/properties/pipelineId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L33-L33) |
| #/$defs/runtimeRunGraph/properties/maxConcurrency | `{"type":"integer","minimum":1}` | [#/$defs/runtimeRunGraph/properties/maxConcurrency](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L34-L34) |
| #/$defs/runtimeRunGraph/properties/nodes | `{"type":"array"}` | [#/$defs/runtimeRunGraph/properties/nodes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L35-L35) |
| #/$defs/runtimeRunGraph/properties/nodes/items | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/runtimeRunGraph/properties/nodes/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L35-L35) |
| #/$defs/runtimeRunGraph/properties/ordinaryEdges | `{"type":"array"}` | [#/$defs/runtimeRunGraph/properties/ordinaryEdges](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L36-L36) |
| #/$defs/runtimeRunGraph/properties/ordinaryEdges/items | `{"$ref":"#/$defs/runtimeRunEdge"}` | [#/$defs/runtimeRunGraph/properties/ordinaryEdges/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L36-L36) |
| #/$defs/runtimeRunGraph/properties/remediationEdges | `{"type":"array"}` | [#/$defs/runtimeRunGraph/properties/remediationEdges](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L37-L37) |
| #/$defs/runtimeRunGraph/properties/remediationEdges/items | `{"$ref":"#/$defs/runtimeRunEdge"}` | [#/$defs/runtimeRunGraph/properties/remediationEdges/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L37-L37) |
| #/$defs/runtimeRunGraph/properties/digest | `{"type":"string","pattern":"^sha256:[a-f0-9]{64}$"}` | [#/$defs/runtimeRunGraph/properties/digest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L38-L38) |
| #/$defs/runtimeRunEdge | `{"type":"object","additionalProperties":false,"required":["from","to"]}` | [#/$defs/runtimeRunEdge](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L41-L44) |
| #/$defs/runtimeRunEdge/properties/from | `{"type":"string"}` | [#/$defs/runtimeRunEdge/properties/from](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L43-L43) |
| #/$defs/runtimeRunEdge/properties/to | `{"type":"string"}` | [#/$defs/runtimeRunEdge/properties/to](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L43-L43) |
| #/$defs/runtimeRunSnapshot | `{"type":"object","additionalProperties":false,"required":["schemaVersion","graph","registry","digest","runtimeDispatchProfile"]}` | [#/$defs/runtimeRunSnapshot](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L45-L55) |
| #/$defs/runtimeRunSnapshot/properties/schemaVersion | `{"const":"run-snapshot.v3"}` | [#/$defs/runtimeRunSnapshot/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L49-L49) |
| #/$defs/runtimeRunSnapshot/properties/graph | `{"$ref":"#/$defs/runtimeRunGraph"}` | [#/$defs/runtimeRunSnapshot/properties/graph](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L50-L50) |
| #/$defs/runtimeRunSnapshot/properties/registry | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/runtimeRunSnapshot/properties/registry](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L51-L51) |
| #/$defs/runtimeRunSnapshot/properties/digest | `{"type":"string","pattern":"^sha256:[a-f0-9]{64}$"}` | [#/$defs/runtimeRunSnapshot/properties/digest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L52-L52) |
| #/$defs/runtimeRunSnapshot/properties/runtimeDispatchProfile | `{"$ref":"#/$defs/runtimeDispatchProfile"}` | [#/$defs/runtimeRunSnapshot/properties/runtimeDispatchProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L53-L53) |
| #/$defs/runtimeRunSnapshotV4 | `{"type":"object","additionalProperties":false,"required":["schemaVersion","graph","registry","digest","runtimeDispatchProfile","reviewCacheProfile"]}` | [#/$defs/runtimeRunSnapshotV4](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L56-L67) |
| #/$defs/runtimeRunSnapshotV4/properties/schemaVersion | `{"const":"run-snapshot.v4"}` | [#/$defs/runtimeRunSnapshotV4/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L60-L60) |
| #/$defs/runtimeRunSnapshotV4/properties/graph | `{"$ref":"#/$defs/runtimeRunGraph"}` | [#/$defs/runtimeRunSnapshotV4/properties/graph](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L61-L61) |
| #/$defs/runtimeRunSnapshotV4/properties/registry | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/runtimeRunSnapshotV4/properties/registry](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L62-L62) |
| #/$defs/runtimeRunSnapshotV4/properties/digest | `{"type":"string","pattern":"^sha256:[a-f0-9]{64}$"}` | [#/$defs/runtimeRunSnapshotV4/properties/digest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L63-L63) |
| #/$defs/runtimeRunSnapshotV4/properties/runtimeDispatchProfile | `{"$ref":"#/$defs/runtimeDispatchProfile"}` | [#/$defs/runtimeRunSnapshotV4/properties/runtimeDispatchProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L64-L64) |
| #/$defs/runtimeRunSnapshotV4/properties/reviewCacheProfile | `{"$ref":"#/$defs/reviewCacheProfile"}` | [#/$defs/runtimeRunSnapshotV4/properties/reviewCacheProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L65-L65) |
| #/$defs/namespacedId | `{"type":"string","pattern":"^[a-z0-9]+(?:[._-][a-z0-9]+)+$","maxLength":160}` | [#/$defs/namespacedId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L68-L72) |
| #/$defs/localId | `{"type":"string","pattern":"^[a-z0-9]+(?:[._-][a-z0-9]+)*$","maxLength":96}` | [#/$defs/localId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L73-L77) |
| #/$defs/opaqueId | `{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$"}` | [#/$defs/opaqueId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L78-L81) |
| #/$defs/effectIdempotencyKey | `{"description":"Existing opaque keys, plus the exact historical adapter dependency producer grammar. Package/capability names retain their 160-character bounds and registration its 96-character bound. New dependency keys are compact opaque IDs."}` | [#/$defs/effectIdempotencyKey](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L82-L91) |
| #/$defs/effectIdempotencyKey/anyOf/0 | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/effectIdempotencyKey/anyOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L85-L85) |
| #/$defs/effectIdempotencyKey/anyOf/1 | `{"type":"string","pattern":"^adapter:(?=[^:]{1,160}:)[a-z0-9]+(?:[._-][a-z0-9]+)+:(?=[^:]{1,96}:)[a-z0-9]+(?:[._-][a-z0-9]+)*:(?=[^:]{1,160}:)[a-z0-9]+(?:[._-][a-z0-9]+)+:[a-f0-9]{64}(?::parent:[a-f0-9]{64})?$"}` | [#/$defs/effectIdempotencyKey/anyOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L86-L89) |
| #/$defs/resourceIdentity | `{"description":"Capability-owned resource names include URLs, absolute paths, dot and catalog keys. Capability implementations retain their own URL, path and authorization constraints.","type":"object","additionalProperties":false,"required":["type","canonicalId"]}` | [#/$defs/resourceIdentity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L92-L101) |
| #/$defs/resourceIdentity/properties/type | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/resourceIdentity/properties/type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L98-L98) |
| #/$defs/resourceIdentity/properties/canonicalId | `{"type":"string","minLength":1}` | [#/$defs/resourceIdentity/properties/canonicalId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L99-L99) |
| #/$defs/effectDeliveryId | `{"description":"The original public adapter dependency delivery token: nonblank and at most 512 characters. Observer delivery contracts remain opaque IDs.","type":"string","minLength":1,"maxLength":512,"pattern":"\\S"}` | [#/$defs/effectDeliveryId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L102-L108) |
| #/$defs/effectAttemptIdentity | `{}` | [#/$defs/effectAttemptIdentity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L109-L125) |
| #/$defs/effectAttemptIdentity/anyOf/0 | `{"$ref":"#/$defs/attemptIdentity"}` | [#/$defs/effectAttemptIdentity/anyOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L111-L111) |
| #/$defs/effectAttemptIdentity/anyOf/1 | `{"description":"Exact historical adapter-activation producer domain. Core additionally checks equal runId and attemptId against the actual activation owner.","type":"object","additionalProperties":false,"required":["runId","stageId","attemptId","attemptNumber"]}` | [#/$defs/effectAttemptIdentity/anyOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L112-L123) |
| #/$defs/effectAttemptIdentity/anyOf/1/properties/runId | `{"$ref":"#/$defs/adapterActivationId"}` | [#/$defs/effectAttemptIdentity/anyOf/1/properties/runId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L118-L118) |
| #/$defs/effectAttemptIdentity/anyOf/1/properties/stageId | `{"const":"adapter-activation"}` | [#/$defs/effectAttemptIdentity/anyOf/1/properties/stageId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L119-L119) |
| #/$defs/effectAttemptIdentity/anyOf/1/properties/attemptId | `{"$ref":"#/$defs/adapterActivationId"}` | [#/$defs/effectAttemptIdentity/anyOf/1/properties/attemptId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L120-L120) |
| #/$defs/effectAttemptIdentity/anyOf/1/properties/attemptNumber | `{"const":1}` | [#/$defs/effectAttemptIdentity/anyOf/1/properties/attemptNumber](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L121-L121) |
| #/$defs/adapterActivationId | `{"type":"string","pattern":"^adapter:(?=[^:]{1,160}:)[a-z0-9]+(?:[._-][a-z0-9]+)+:(?=[^:]{1,96}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$","maxLength":265}` | [#/$defs/adapterActivationId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L126-L130) |
| #/$defs/relativeModulePath | `{"type":"string","pattern":"^(?!/)(?!.*(?:^\|/)\\.\\.(?:/\|$)).+\\.(?:mjs\|mts\|js\|ts)$","maxLength":512}` | [#/$defs/relativeModulePath](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L131-L135) |
| #/$defs/relativeSchemaPath | `{"type":"string","pattern":"^(?!/)(?!.*(?:^\|/)\\.\\.(?:/\|$)).+\\.json$","maxLength":512}` | [#/$defs/relativeSchemaPath](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L136-L140) |
| #/$defs/testContractId | `{"type":"string","pattern":"^[a-z0-9][a-z0-9._/-]*@[1-9][0-9]*$","maxLength":256}` | [#/$defs/testContractId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L141-L145) |
| #/$defs/jsonObject | `{"type":"object"}` | [#/$defs/jsonObject](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L146-L148) |
| #/$defs/reason | `{"type":"object","additionalProperties":false,"required":["code"]}` | [#/$defs/reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L149-L158) |
| #/$defs/reason/properties/code | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/reason/properties/code](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L154-L154) |
| #/$defs/reason/properties/message | `{"type":"string","minLength":1,"maxLength":4096}` | [#/$defs/reason/properties/message](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L155-L155) |
| #/$defs/reason/properties/details | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/reason/properties/details](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L156-L156) |
| #/$defs/packageIdentity | `{"type":"object","additionalProperties":false,"required":["pluginId","apiVersion","packageVersion","contentDigest"]}` | [#/$defs/packageIdentity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L159-L175) |
| #/$defs/packageIdentity/properties/pluginId | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/packageIdentity/properties/pluginId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L164-L164) |
| #/$defs/packageIdentity/properties/apiVersion | `{"const":"pipeline-plugin-v2"}` | [#/$defs/packageIdentity/properties/apiVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L165-L165) |
| #/$defs/packageIdentity/properties/packageVersion | `{"type":"string","pattern":"^(0\|[1-9][0-9]*)\\.(0\|[1-9][0-9]*)\\.(0\|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$"}` | [#/$defs/packageIdentity/properties/packageVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L166-L169) |
| #/$defs/packageIdentity/properties/contentDigest | `{"type":"string","pattern":"^sha256:[a-f0-9]{64}$"}` | [#/$defs/packageIdentity/properties/contentDigest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L170-L173) |
| #/$defs/packageResolution | `{"type":"object","additionalProperties":false,"required":["pluginId","apiVersion","packageVersion","contentDigest","registrationId"]}` | [#/$defs/packageResolution](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L176-L193) |
| #/$defs/packageResolution/properties/pluginId | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/packageResolution/properties/pluginId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L181-L181) |
| #/$defs/packageResolution/properties/apiVersion | `{"const":"pipeline-plugin-v2"}` | [#/$defs/packageResolution/properties/apiVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L182-L182) |
| #/$defs/packageResolution/properties/packageVersion | `{"type":"string","pattern":"^(0\|[1-9][0-9]*)\\.(0\|[1-9][0-9]*)\\.(0\|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$"}` | [#/$defs/packageResolution/properties/packageVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L183-L186) |
| #/$defs/packageResolution/properties/contentDigest | `{"type":"string","pattern":"^sha256:[a-f0-9]{64}$"}` | [#/$defs/packageResolution/properties/contentDigest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L187-L190) |
| #/$defs/packageResolution/properties/registrationId | `{"$ref":"#/$defs/localId"}` | [#/$defs/packageResolution/properties/registrationId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L191-L191) |
| #/$defs/stageRegistration | `{"type":"object","additionalProperties":false,"required":["id","type","module","export","requiredCapabilities","configSchema","inputSchema","resultSchema"]}` | [#/$defs/stageRegistration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L194-L215) |
| #/$defs/stageRegistration/properties/id | `{"$ref":"#/$defs/localId"}` | [#/$defs/stageRegistration/properties/id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L202-L202) |
| #/$defs/stageRegistration/properties/type | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/stageRegistration/properties/type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L203-L203) |
| #/$defs/stageRegistration/properties/module | `{"$ref":"#/$defs/relativeModulePath"}` | [#/$defs/stageRegistration/properties/module](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L204-L204) |
| #/$defs/stageRegistration/properties/export | `{"type":"string","pattern":"^[A-Za-z_$][A-Za-z0-9_$]*$"}` | [#/$defs/stageRegistration/properties/export](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L205-L205) |
| #/$defs/stageRegistration/properties/requiredCapabilities | `{"type":"array","uniqueItems":true}` | [#/$defs/stageRegistration/properties/requiredCapabilities](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L206-L210) |
| #/$defs/stageRegistration/properties/requiredCapabilities/items | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/stageRegistration/properties/requiredCapabilities/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L208-L208) |
| #/$defs/stageRegistration/properties/configSchema | `{"$ref":"#/$defs/relativeSchemaPath"}` | [#/$defs/stageRegistration/properties/configSchema](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L211-L211) |
| #/$defs/stageRegistration/properties/inputSchema | `{"$ref":"#/$defs/relativeSchemaPath"}` | [#/$defs/stageRegistration/properties/inputSchema](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L212-L212) |
| #/$defs/stageRegistration/properties/resultSchema | `{"$ref":"#/$defs/relativeSchemaPath"}` | [#/$defs/stageRegistration/properties/resultSchema](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L213-L213) |
| #/$defs/observerRegistration | `{"type":"object","additionalProperties":false,"required":["id","module","export","subscriptions","requiredCapabilities","configSchema","checkpointSchema","delivery","ordering","failurePolicy"]}` | [#/$defs/observerRegistration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L216-L254) |
| #/$defs/observerRegistration/properties/id | `{"$ref":"#/$defs/localId"}` | [#/$defs/observerRegistration/properties/id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L224-L224) |
| #/$defs/observerRegistration/properties/module | `{"$ref":"#/$defs/relativeModulePath"}` | [#/$defs/observerRegistration/properties/module](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L225-L225) |
| #/$defs/observerRegistration/properties/export | `{"type":"string","pattern":"^[A-Za-z_$][A-Za-z0-9_$]*$"}` | [#/$defs/observerRegistration/properties/export](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L226-L226) |
| #/$defs/observerRegistration/properties/subscriptions | `{"type":"array","minItems":1,"uniqueItems":true}` | [#/$defs/observerRegistration/properties/subscriptions](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L227-L232) |
| #/$defs/observerRegistration/properties/subscriptions/items | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/observerRegistration/properties/subscriptions/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L231-L231) |
| #/$defs/observerRegistration/properties/delivery | `{"const":"at_least_once"}` | [#/$defs/observerRegistration/properties/delivery](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L233-L233) |
| #/$defs/observerRegistration/properties/ordering | `{"const":"per_run"}` | [#/$defs/observerRegistration/properties/ordering](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L234-L234) |
| #/$defs/observerRegistration/properties/failurePolicy | `{"type":"object","additionalProperties":false,"required":["mode","maxAttempts","backoffMs","timeoutMs"]}` | [#/$defs/observerRegistration/properties/failurePolicy](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L235-L245) |
| #/$defs/observerRegistration/properties/failurePolicy/properties/mode | `{"enum":["best_effort","required"]}` | [#/$defs/observerRegistration/properties/failurePolicy/properties/mode](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L240-L240) |
| #/$defs/observerRegistration/properties/failurePolicy/properties/maxAttempts | `{"type":"integer","minimum":1}` | [#/$defs/observerRegistration/properties/failurePolicy/properties/maxAttempts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L241-L241) |
| #/$defs/observerRegistration/properties/failurePolicy/properties/backoffMs | `{"type":"integer","minimum":0}` | [#/$defs/observerRegistration/properties/failurePolicy/properties/backoffMs](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L242-L242) |
| #/$defs/observerRegistration/properties/failurePolicy/properties/timeoutMs | `{"type":"integer","minimum":1}` | [#/$defs/observerRegistration/properties/failurePolicy/properties/timeoutMs](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L243-L243) |
| #/$defs/observerRegistration/properties/requiredCapabilities | `{"type":"array","uniqueItems":true}` | [#/$defs/observerRegistration/properties/requiredCapabilities](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L246-L250) |
| #/$defs/observerRegistration/properties/requiredCapabilities/items | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/observerRegistration/properties/requiredCapabilities/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L248-L248) |
| #/$defs/observerRegistration/properties/configSchema | `{"$ref":"#/$defs/relativeSchemaPath"}` | [#/$defs/observerRegistration/properties/configSchema](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L251-L251) |
| #/$defs/observerRegistration/properties/checkpointSchema | `{"$ref":"#/$defs/relativeSchemaPath"}` | [#/$defs/observerRegistration/properties/checkpointSchema](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L252-L252) |
| #/$defs/adapterRegistration | `{"type":"object","additionalProperties":false,"required":["id","module","export","providesCapabilities","requiredCapabilities","configSchema"]}` | [#/$defs/adapterRegistration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L255-L279) |
| #/$defs/adapterRegistration/properties/id | `{"$ref":"#/$defs/localId"}` | [#/$defs/adapterRegistration/properties/id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L263-L263) |
| #/$defs/adapterRegistration/properties/module | `{"$ref":"#/$defs/relativeModulePath"}` | [#/$defs/adapterRegistration/properties/module](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L264-L264) |
| #/$defs/adapterRegistration/properties/export | `{"type":"string","pattern":"^[A-Za-z_$][A-Za-z0-9_$]*$"}` | [#/$defs/adapterRegistration/properties/export](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L265-L265) |
| #/$defs/adapterRegistration/properties/providesCapabilities | `{"type":"array","minItems":1,"uniqueItems":true}` | [#/$defs/adapterRegistration/properties/providesCapabilities](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L266-L271) |
| #/$defs/adapterRegistration/properties/providesCapabilities/items | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/adapterRegistration/properties/providesCapabilities/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L270-L270) |
| #/$defs/adapterRegistration/properties/requiredCapabilities | `{"type":"array","uniqueItems":true}` | [#/$defs/adapterRegistration/properties/requiredCapabilities](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L272-L276) |
| #/$defs/adapterRegistration/properties/requiredCapabilities/items | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/adapterRegistration/properties/requiredCapabilities/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L274-L274) |
| #/$defs/adapterRegistration/properties/configSchema | `{"$ref":"#/$defs/relativeSchemaPath"}` | [#/$defs/adapterRegistration/properties/configSchema](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L277-L277) |
| #/$defs/testProviderPort | `{}` | [#/$defs/testProviderPort](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L280-L312) |
| #/$defs/testProviderPort/oneOf/0 | `{"type":"object","additionalProperties":false,"required":["name","kind","required","schemaId"]}` | [#/$defs/testProviderPort/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L282-L292) |
| #/$defs/testProviderPort/oneOf/0/properties/name | `{"$ref":"#/$defs/localId"}` | [#/$defs/testProviderPort/oneOf/0/properties/name](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L287-L287) |
| #/$defs/testProviderPort/oneOf/0/properties/kind | `{"const":"value"}` | [#/$defs/testProviderPort/oneOf/0/properties/kind](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L288-L288) |
| #/$defs/testProviderPort/oneOf/0/properties/required | `{"type":"boolean"}` | [#/$defs/testProviderPort/oneOf/0/properties/required](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L289-L289) |
| #/$defs/testProviderPort/oneOf/0/properties/schemaId | `{"$ref":"#/$defs/testContractId"}` | [#/$defs/testProviderPort/oneOf/0/properties/schemaId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L290-L290) |
| #/$defs/testProviderPort/oneOf/1 | `{"type":"object","additionalProperties":false,"required":["name","kind","required","mediaTypes"]}` | [#/$defs/testProviderPort/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L293-L310) |
| #/$defs/testProviderPort/oneOf/1/properties/name | `{"$ref":"#/$defs/localId"}` | [#/$defs/testProviderPort/oneOf/1/properties/name](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L298-L298) |
| #/$defs/testProviderPort/oneOf/1/properties/kind | `{"const":"artifact"}` | [#/$defs/testProviderPort/oneOf/1/properties/kind](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L299-L299) |
| #/$defs/testProviderPort/oneOf/1/properties/required | `{"type":"boolean"}` | [#/$defs/testProviderPort/oneOf/1/properties/required](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L300-L300) |
| #/$defs/testProviderPort/oneOf/1/properties/schemaId | `{"$ref":"#/$defs/testContractId"}` | [#/$defs/testProviderPort/oneOf/1/properties/schemaId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L301-L301) |
| #/$defs/testProviderPort/oneOf/1/properties/mediaTypes | `{"type":"array","minItems":1,"maxItems":32,"uniqueItems":true}` | [#/$defs/testProviderPort/oneOf/1/properties/mediaTypes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L302-L308) |
| #/$defs/testProviderPort/oneOf/1/properties/mediaTypes/items | `{"type":"string","minLength":1,"maxLength":256}` | [#/$defs/testProviderPort/oneOf/1/properties/mediaTypes/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L307-L307) |
| #/$defs/testEvidencePolicy | `{"type":"object","additionalProperties":false,"required":["onPass","onFail","onError"]}` | [#/$defs/testEvidencePolicy](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L313-L337) |
| #/$defs/testEvidencePolicy/properties/onPass | `{"type":"array","maxItems":128,"uniqueItems":true}` | [#/$defs/testEvidencePolicy/properties/onPass](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L318-L323) |
| #/$defs/testEvidencePolicy/properties/onPass/items | `{"$ref":"#/$defs/localId"}` | [#/$defs/testEvidencePolicy/properties/onPass/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L322-L322) |
| #/$defs/testEvidencePolicy/properties/onFail | `{"type":"array","maxItems":128,"uniqueItems":true}` | [#/$defs/testEvidencePolicy/properties/onFail](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L324-L329) |
| #/$defs/testEvidencePolicy/properties/onFail/items | `{"$ref":"#/$defs/localId"}` | [#/$defs/testEvidencePolicy/properties/onFail/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L328-L328) |
| #/$defs/testEvidencePolicy/properties/onError | `{"type":"array","maxItems":128,"uniqueItems":true}` | [#/$defs/testEvidencePolicy/properties/onError](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L330-L335) |
| #/$defs/testEvidencePolicy/properties/onError/items | `{"$ref":"#/$defs/localId"}` | [#/$defs/testEvidencePolicy/properties/onError/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L334-L334) |
| #/$defs/testProviderRegistration | `{"type":"object","additionalProperties":false,"required":["id","contractId","kind","module","export","configSchema","inputs","outputs","requiredCapabilities","retrySafe","matrixFields","reportFormats","evidenceTypes","evidenceDefaults"]}` | [#/$defs/testProviderRegistration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L338-L390) |
| #/$defs/testProviderRegistration/properties/id | `{"$ref":"#/$defs/localId"}` | [#/$defs/testProviderRegistration/properties/id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L347-L347) |
| #/$defs/testProviderRegistration/properties/contractId | `{"$ref":"#/$defs/testContractId"}` | [#/$defs/testProviderRegistration/properties/contractId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L348-L348) |
| #/$defs/testProviderRegistration/properties/kind | `{"enum":["test","fixture"]}` | [#/$defs/testProviderRegistration/properties/kind](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L349-L349) |
| #/$defs/testProviderRegistration/properties/module | `{"$ref":"#/$defs/relativeModulePath"}` | [#/$defs/testProviderRegistration/properties/module](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L350-L350) |
| #/$defs/testProviderRegistration/properties/export | `{"type":"string","pattern":"^[A-Za-z_$][A-Za-z0-9_$]*$"}` | [#/$defs/testProviderRegistration/properties/export](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L351-L351) |
| #/$defs/testProviderRegistration/properties/configSchema | `{"$ref":"#/$defs/relativeSchemaPath"}` | [#/$defs/testProviderRegistration/properties/configSchema](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L352-L352) |
| #/$defs/testProviderRegistration/properties/inputs | `{"type":"array","maxItems":128}` | [#/$defs/testProviderRegistration/properties/inputs](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L353-L357) |
| #/$defs/testProviderRegistration/properties/inputs/items | `{"$ref":"#/$defs/testProviderPort"}` | [#/$defs/testProviderRegistration/properties/inputs/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L356-L356) |
| #/$defs/testProviderRegistration/properties/outputs | `{"type":"array","maxItems":128}` | [#/$defs/testProviderRegistration/properties/outputs](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L358-L362) |
| #/$defs/testProviderRegistration/properties/outputs/items | `{"$ref":"#/$defs/testProviderPort"}` | [#/$defs/testProviderRegistration/properties/outputs/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L361-L361) |
| #/$defs/testProviderRegistration/properties/requiredCapabilities | `{"type":"array","maxItems":128,"uniqueItems":true}` | [#/$defs/testProviderRegistration/properties/requiredCapabilities](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L363-L368) |
| #/$defs/testProviderRegistration/properties/requiredCapabilities/items | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/testProviderRegistration/properties/requiredCapabilities/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L367-L367) |
| #/$defs/testProviderRegistration/properties/retrySafe | `{"type":"boolean"}` | [#/$defs/testProviderRegistration/properties/retrySafe](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L369-L369) |
| #/$defs/testProviderRegistration/properties/matrixFields | `{"type":"array","maxItems":64,"uniqueItems":true}` | [#/$defs/testProviderRegistration/properties/matrixFields](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L370-L375) |
| #/$defs/testProviderRegistration/properties/matrixFields/items | `{"$ref":"#/$defs/localId"}` | [#/$defs/testProviderRegistration/properties/matrixFields/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L374-L374) |
| #/$defs/testProviderRegistration/properties/reportFormats | `{"type":"array","maxItems":32,"uniqueItems":true}` | [#/$defs/testProviderRegistration/properties/reportFormats](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L376-L381) |
| #/$defs/testProviderRegistration/properties/reportFormats/items | `{"$ref":"#/$defs/localId"}` | [#/$defs/testProviderRegistration/properties/reportFormats/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L380-L380) |
| #/$defs/testProviderRegistration/properties/evidenceTypes | `{"type":"array","maxItems":128,"uniqueItems":true}` | [#/$defs/testProviderRegistration/properties/evidenceTypes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L382-L387) |
| #/$defs/testProviderRegistration/properties/evidenceTypes/items | `{"$ref":"#/$defs/localId"}` | [#/$defs/testProviderRegistration/properties/evidenceTypes/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L386-L386) |
| #/$defs/testProviderRegistration/properties/evidenceDefaults | `{"$ref":"#/$defs/testEvidencePolicy"}` | [#/$defs/testProviderRegistration/properties/evidenceDefaults](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L388-L388) |
| #/$defs/reportAdapterRegistration | `{"type":"object","additionalProperties":false,"required":["id","format","contractVersion","module","export","mediaTypes"]}` | [#/$defs/reportAdapterRegistration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L391-L409) |
| #/$defs/reportAdapterRegistration/properties/id | `{"$ref":"#/$defs/localId"}` | [#/$defs/reportAdapterRegistration/properties/id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L396-L396) |
| #/$defs/reportAdapterRegistration/properties/format | `{"$ref":"#/$defs/localId"}` | [#/$defs/reportAdapterRegistration/properties/format](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L397-L397) |
| #/$defs/reportAdapterRegistration/properties/contractVersion | `{"type":"integer","minimum":1}` | [#/$defs/reportAdapterRegistration/properties/contractVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L398-L398) |
| #/$defs/reportAdapterRegistration/properties/module | `{"$ref":"#/$defs/relativeModulePath"}` | [#/$defs/reportAdapterRegistration/properties/module](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L399-L399) |
| #/$defs/reportAdapterRegistration/properties/export | `{"type":"string","pattern":"^[A-Za-z_$][A-Za-z0-9_$]*$"}` | [#/$defs/reportAdapterRegistration/properties/export](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L400-L400) |
| #/$defs/reportAdapterRegistration/properties/mediaTypes | `{"type":"array","minItems":1,"maxItems":32,"uniqueItems":true}` | [#/$defs/reportAdapterRegistration/properties/mediaTypes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L401-L407) |
| #/$defs/reportAdapterRegistration/properties/mediaTypes/items | `{"type":"string","minLength":1,"maxLength":256}` | [#/$defs/reportAdapterRegistration/properties/mediaTypes/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L406-L406) |
| #/$defs/pluginManifest | `{"type":"object","additionalProperties":false,"required":["id","apiVersion","packageVersion","stages","observers","adapters"]}` | [#/$defs/pluginManifest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L410-L449) |
| #/$defs/pluginManifest/properties/id | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/pluginManifest/properties/id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L415-L415) |
| #/$defs/pluginManifest/properties/apiVersion | `{"const":"pipeline-plugin-v2"}` | [#/$defs/pluginManifest/properties/apiVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L416-L416) |
| #/$defs/pluginManifest/properties/packageVersion | `{"type":"string","pattern":"^(0\|[1-9][0-9]*)\\.(0\|[1-9][0-9]*)\\.(0\|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$"}` | [#/$defs/pluginManifest/properties/packageVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L417-L420) |
| #/$defs/pluginManifest/properties/stages | `{"type":"array"}` | [#/$defs/pluginManifest/properties/stages](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L421-L424) |
| #/$defs/pluginManifest/properties/stages/items | `{"$ref":"#/$defs/stageRegistration"}` | [#/$defs/pluginManifest/properties/stages/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L423-L423) |
| #/$defs/pluginManifest/properties/observers | `{"type":"array"}` | [#/$defs/pluginManifest/properties/observers](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L425-L428) |
| #/$defs/pluginManifest/properties/observers/items | `{"$ref":"#/$defs/observerRegistration"}` | [#/$defs/pluginManifest/properties/observers/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L427-L427) |
| #/$defs/pluginManifest/properties/adapters | `{"type":"array"}` | [#/$defs/pluginManifest/properties/adapters](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L429-L432) |
| #/$defs/pluginManifest/properties/adapters/items | `{"$ref":"#/$defs/adapterRegistration"}` | [#/$defs/pluginManifest/properties/adapters/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L431-L431) |
| #/$defs/pluginManifest/properties/testProviders | `{"type":"array"}` | [#/$defs/pluginManifest/properties/testProviders](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L433-L436) |
| #/$defs/pluginManifest/properties/testProviders/items | `{"$ref":"#/$defs/testProviderRegistration"}` | [#/$defs/pluginManifest/properties/testProviders/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L435-L435) |
| #/$defs/pluginManifest/properties/reportAdapters | `{"type":"array"}` | [#/$defs/pluginManifest/properties/reportAdapters](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L437-L440) |
| #/$defs/pluginManifest/properties/reportAdapters/items | `{"$ref":"#/$defs/reportAdapterRegistration"}` | [#/$defs/pluginManifest/properties/reportAdapters/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L439-L439) |
| #/$defs/pluginManifest/anyOf/0 | `{"required":["stages"]}` | [#/$defs/pluginManifest/anyOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L443-L443) |
| #/$defs/pluginManifest/anyOf/0/properties/stages | `{"type":"array","minItems":1}` | [#/$defs/pluginManifest/anyOf/0/properties/stages](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L443-L443) |
| #/$defs/pluginManifest/anyOf/1 | `{"required":["observers"]}` | [#/$defs/pluginManifest/anyOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L444-L444) |
| #/$defs/pluginManifest/anyOf/1/properties/observers | `{"type":"array","minItems":1}` | [#/$defs/pluginManifest/anyOf/1/properties/observers](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L444-L444) |
| #/$defs/pluginManifest/anyOf/2 | `{"required":["adapters"]}` | [#/$defs/pluginManifest/anyOf/2](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L445-L445) |
| #/$defs/pluginManifest/anyOf/2/properties/adapters | `{"type":"array","minItems":1}` | [#/$defs/pluginManifest/anyOf/2/properties/adapters](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L445-L445) |
| #/$defs/pluginManifest/anyOf/3 | `{"required":["testProviders"]}` | [#/$defs/pluginManifest/anyOf/3](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L446-L446) |
| #/$defs/pluginManifest/anyOf/3/properties/testProviders | `{"type":"array","minItems":1}` | [#/$defs/pluginManifest/anyOf/3/properties/testProviders](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L446-L446) |
| #/$defs/pluginManifest/anyOf/4 | `{"required":["reportAdapters"]}` | [#/$defs/pluginManifest/anyOf/4](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L447-L447) |
| #/$defs/pluginManifest/anyOf/4/properties/reportAdapters | `{"type":"array","minItems":1}` | [#/$defs/pluginManifest/anyOf/4/properties/reportAdapters](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L447-L447) |
| #/$defs/stageDefinition | `{"type":"object","additionalProperties":false,"required":["id","type","dependsOn","config","input","execution"]}` | [#/$defs/stageDefinition](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L450-L514) |
| #/$defs/stageDefinition/properties/id | `{"$ref":"#/$defs/localId"}` | [#/$defs/stageDefinition/properties/id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L455-L455) |
| #/$defs/stageDefinition/properties/type | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/stageDefinition/properties/type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L456-L456) |
| #/$defs/stageDefinition/properties/dependsOn | `{"type":"array","uniqueItems":true}` | [#/$defs/stageDefinition/properties/dependsOn](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L457-L461) |
| #/$defs/stageDefinition/properties/dependsOn/items | `{"$ref":"#/$defs/localId"}` | [#/$defs/stageDefinition/properties/dependsOn/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L459-L459) |
| #/$defs/stageDefinition/properties/config | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/stageDefinition/properties/config](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L462-L462) |
| #/$defs/stageDefinition/properties/input | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/stageDefinition/properties/input](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L463-L463) |
| #/$defs/stageDefinition/properties/activation | `{"type":"object","additionalProperties":false,"required":["sourceStage","fact","equals"]}` | [#/$defs/stageDefinition/properties/activation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L464-L480) |
| #/$defs/stageDefinition/properties/activation/properties/sourceStage | `{"$ref":"#/$defs/localId"}` | [#/$defs/stageDefinition/properties/activation/properties/sourceStage](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L469-L469) |
| #/$defs/stageDefinition/properties/activation/properties/fact | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/stageDefinition/properties/activation/properties/fact](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L470-L470) |
| #/$defs/stageDefinition/properties/activation/properties/equals | `{}` | [#/$defs/stageDefinition/properties/activation/properties/equals](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L471-L478) |
| #/$defs/stageDefinition/properties/activation/properties/equals/oneOf/0 | `{"type":"string"}` | [#/$defs/stageDefinition/properties/activation/properties/equals/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L473-L473) |
| #/$defs/stageDefinition/properties/activation/properties/equals/oneOf/1 | `{"type":"number"}` | [#/$defs/stageDefinition/properties/activation/properties/equals/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L474-L474) |
| #/$defs/stageDefinition/properties/activation/properties/equals/oneOf/2 | `{"type":"boolean"}` | [#/$defs/stageDefinition/properties/activation/properties/equals/oneOf/2](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L475-L475) |
| #/$defs/stageDefinition/properties/activation/properties/equals/oneOf/3 | `{"type":"null"}` | [#/$defs/stageDefinition/properties/activation/properties/equals/oneOf/3](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L476-L476) |
| #/$defs/stageDefinition/properties/execution | `{"type":"object","additionalProperties":false,"required":["maxAttempts","maxRemediationCycles","timeoutMs"]}` | [#/$defs/stageDefinition/properties/execution](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L481-L505) |
| #/$defs/stageDefinition/properties/execution/properties/maxAttempts | `{"type":"integer","minimum":1}` | [#/$defs/stageDefinition/properties/execution/properties/maxAttempts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L486-L486) |
| #/$defs/stageDefinition/properties/execution/properties/maxRemediationCycles | `{"type":"integer","minimum":0}` | [#/$defs/stageDefinition/properties/execution/properties/maxRemediationCycles](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L487-L487) |
| #/$defs/stageDefinition/properties/execution/properties/maxTechnicalRetries | `{"type":"integer","minimum":0,"maximum":100}` | [#/$defs/stageDefinition/properties/execution/properties/maxTechnicalRetries](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L488-L488) |
| #/$defs/stageDefinition/properties/execution/properties/repairCategory | `{"$ref":"#/$defs/localId"}` | [#/$defs/stageDefinition/properties/execution/properties/repairCategory](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L489-L489) |
| #/$defs/stageDefinition/properties/execution/properties/repairBudget | `{"type":"object","additionalProperties":false,"required":["categories","maximumOrchestratorOrders"]}` | [#/$defs/stageDefinition/properties/execution/properties/repairBudget](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L490-L501) |
| #/$defs/stageDefinition/properties/execution/properties/repairBudget/properties/categories | `{"type":"object","minProperties":1,"maxProperties":32,"additionalProperties":{"type":"integer","minimum":0,"maximum":100}}` | [#/$defs/stageDefinition/properties/execution/properties/repairBudget/properties/categories](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L494-L498) |
| #/$defs/stageDefinition/properties/execution/properties/repairBudget/properties/categories/propertyNames | `{"$ref":"#/$defs/localId"}` | [#/$defs/stageDefinition/properties/execution/properties/repairBudget/properties/categories/propertyNames](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L496-L496) |
| #/$defs/stageDefinition/properties/execution/properties/repairBudget/properties/categories/additionalProperties | `{"type":"integer","minimum":0,"maximum":100}` | [#/$defs/stageDefinition/properties/execution/properties/repairBudget/properties/categories/additionalProperties](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L497-L497) |
| #/$defs/stageDefinition/properties/execution/properties/repairBudget/properties/maximumOrchestratorOrders | `{"type":"integer","minimum":0,"maximum":1}` | [#/$defs/stageDefinition/properties/execution/properties/repairBudget/properties/maximumOrchestratorOrders](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L499-L499) |
| #/$defs/stageDefinition/properties/execution/properties/orchestratorAfterAttempt | `{"type":"integer","minimum":1}` | [#/$defs/stageDefinition/properties/execution/properties/orchestratorAfterAttempt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L502-L502) |
| #/$defs/stageDefinition/properties/execution/properties/timeoutMs | `{"type":"integer","minimum":1}` | [#/$defs/stageDefinition/properties/execution/properties/timeoutMs](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L503-L503) |
| #/$defs/stageDefinition/properties/on | `{"type":"object","additionalProperties":false}` | [#/$defs/stageDefinition/properties/on](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L506-L512) |
| #/$defs/stageDefinition/properties/on/properties/request_fix | `{"$ref":"#/$defs/localId"}` | [#/$defs/stageDefinition/properties/on/properties/request_fix](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L510-L510) |
| #/$defs/pipelineDefinition | `{"type":"object","additionalProperties":false,"required":["schemaVersion","id","maxConcurrency","stages"]}` | [#/$defs/pipelineDefinition](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L515-L529) |
| #/$defs/pipelineDefinition/properties/schemaVersion | `{"const":"pipeline-definition.v2"}` | [#/$defs/pipelineDefinition/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L520-L520) |
| #/$defs/pipelineDefinition/properties/id | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/pipelineDefinition/properties/id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L521-L521) |
| #/$defs/pipelineDefinition/properties/maxConcurrency | `{"type":"integer","minimum":1}` | [#/$defs/pipelineDefinition/properties/maxConcurrency](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L522-L522) |
| #/$defs/pipelineDefinition/properties/stages | `{"type":"array","minItems":1}` | [#/$defs/pipelineDefinition/properties/stages](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L523-L527) |
| #/$defs/pipelineDefinition/properties/stages/items | `{"$ref":"#/$defs/stageDefinition"}` | [#/$defs/pipelineDefinition/properties/stages/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L526-L526) |
| #/$defs/attemptIdentity | `{"type":"object","additionalProperties":false,"required":["runId","stageId","attemptId","attemptNumber"]}` | [#/$defs/attemptIdentity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L530-L540) |
| #/$defs/attemptIdentity/properties/runId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/attemptIdentity/properties/runId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L535-L535) |
| #/$defs/attemptIdentity/properties/stageId | `{"$ref":"#/$defs/localId"}` | [#/$defs/attemptIdentity/properties/stageId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L536-L536) |
| #/$defs/attemptIdentity/properties/attemptId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/attemptIdentity/properties/attemptId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L537-L537) |
| #/$defs/attemptIdentity/properties/attemptNumber | `{"type":"integer","minimum":1}` | [#/$defs/attemptIdentity/properties/attemptNumber](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L538-L538) |
| #/$defs/stageAttempt | `{"type":"object","additionalProperties":false,"required":["schemaVersion","identity","owner","stageType","leaseId","status","retryBudgetUsed","remediationBudgetUsed","createdAt"]}` | [#/$defs/stageAttempt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L541-L563) |
| #/$defs/stageAttempt/properties/schemaVersion | `{"const":"stage-attempt.v2"}` | [#/$defs/stageAttempt/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L549-L549) |
| #/$defs/stageAttempt/properties/identity | `{"$ref":"#/$defs/attemptIdentity"}` | [#/$defs/stageAttempt/properties/identity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L550-L550) |
| #/$defs/stageAttempt/properties/owner | `{"$ref":"#/$defs/packageResolution"}` | [#/$defs/stageAttempt/properties/owner](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L551-L551) |
| #/$defs/stageAttempt/properties/stageType | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/stageAttempt/properties/stageType](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L552-L552) |
| #/$defs/stageAttempt/properties/leaseId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/stageAttempt/properties/leaseId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L553-L553) |
| #/$defs/stageAttempt/properties/status | `{"enum":["created","dispatched","completed","timed_out","cancelled"]}` | [#/$defs/stageAttempt/properties/status](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L554-L556) |
| #/$defs/stageAttempt/properties/retryBudgetUsed | `{"type":"integer","minimum":0}` | [#/$defs/stageAttempt/properties/retryBudgetUsed](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L557-L557) |
| #/$defs/stageAttempt/properties/remediationBudgetUsed | `{"type":"integer","minimum":0}` | [#/$defs/stageAttempt/properties/remediationBudgetUsed](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L558-L558) |
| #/$defs/stageAttempt/properties/createdAt | `{"type":"string","format":"date-time"}` | [#/$defs/stageAttempt/properties/createdAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L559-L559) |
| #/$defs/stageAttempt/properties/dispatchedAt | `{"type":"string","format":"date-time"}` | [#/$defs/stageAttempt/properties/dispatchedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L560-L560) |
| #/$defs/stageAttempt/properties/finishedAt | `{"type":"string","format":"date-time"}` | [#/$defs/stageAttempt/properties/finishedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L561-L561) |
| #/$defs/artifactRef | `{"type":"object","additionalProperties":false,"required":["artifactId","namespace","mediaType","digest","sizeBytes","producer"]}` | [#/$defs/artifactRef](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L564-L577) |
| #/$defs/artifactRef/properties/encoding | `{"const":"kubeclaw-json.utf16.v1"}` | [#/$defs/artifactRef/properties/encoding](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L569-L569) |
| #/$defs/artifactRef/properties/artifactId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/artifactRef/properties/artifactId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L570-L570) |
| #/$defs/artifactRef/properties/namespace | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/artifactRef/properties/namespace](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L571-L571) |
| #/$defs/artifactRef/properties/mediaType | `{"type":"string","pattern":"^[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+$"}` | [#/$defs/artifactRef/properties/mediaType](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L572-L572) |
| #/$defs/artifactRef/properties/digest | `{"type":"string","pattern":"^sha256:[a-f0-9]{64}$"}` | [#/$defs/artifactRef/properties/digest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L573-L573) |
| #/$defs/artifactRef/properties/sizeBytes | `{"type":"integer","minimum":0}` | [#/$defs/artifactRef/properties/sizeBytes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L574-L574) |
| #/$defs/artifactRef/properties/producer | `{"$ref":"#/$defs/attemptIdentity"}` | [#/$defs/artifactRef/properties/producer](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L575-L575) |
| #/$defs/resultBase | `{"type":"object","required":["schemaVersion","outcome","artifacts"]}` | [#/$defs/resultBase](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L578-L596) |
| #/$defs/resultBase/properties/schemaVersion | `{"const":"stage-result.v2"}` | [#/$defs/resultBase/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L582-L582) |
| #/$defs/resultBase/properties/outcome | `{"enum":["passed","retry","request_fix","wait","orchestrator_required","blocked","failed","timed_out","rate_limited","cancelled"]}` | [#/$defs/resultBase/properties/outcome](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L583-L588) |
| #/$defs/resultBase/properties/reason | `{"$ref":"#/$defs/reason"}` | [#/$defs/resultBase/properties/reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L589-L589) |
| #/$defs/resultBase/properties/artifacts | `{"type":"array","uniqueItems":true}` | [#/$defs/resultBase/properties/artifacts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L590-L594) |
| #/$defs/resultBase/properties/artifacts/items | `{"$ref":"#/$defs/artifactRef"}` | [#/$defs/resultBase/properties/artifacts/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L592-L592) |
| #/$defs/decisionFacts | `{"type":"object","additionalProperties":{"oneOf":[{"type":"string"},{"type":"number"},{"type":"boolean"},{"type":"null"}]}}` | [#/$defs/decisionFacts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L597-L608) |
| #/$defs/decisionFacts/propertyNames | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/decisionFacts/propertyNames](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L599-L599) |
| #/$defs/decisionFacts/additionalProperties | `{}` | [#/$defs/decisionFacts/additionalProperties](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L600-L607) |
| #/$defs/decisionFacts/additionalProperties/oneOf/0 | `{"type":"string"}` | [#/$defs/decisionFacts/additionalProperties/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L602-L602) |
| #/$defs/decisionFacts/additionalProperties/oneOf/1 | `{"type":"number"}` | [#/$defs/decisionFacts/additionalProperties/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L603-L603) |
| #/$defs/decisionFacts/additionalProperties/oneOf/2 | `{"type":"boolean"}` | [#/$defs/decisionFacts/additionalProperties/oneOf/2](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L604-L604) |
| #/$defs/decisionFacts/additionalProperties/oneOf/3 | `{"type":"null"}` | [#/$defs/decisionFacts/additionalProperties/oneOf/3](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L605-L605) |
| #/$defs/stageResult | `{}` | [#/$defs/stageResult](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L609-L678) |
| #/$defs/stageResult/oneOf/0 | `{}` | [#/$defs/stageResult/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L611-L626) |
| #/$defs/stageResult/oneOf/0/allOf/0 | `{"$ref":"#/$defs/resultBase"}` | [#/$defs/stageResult/oneOf/0/allOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L613-L613) |
| #/$defs/stageResult/oneOf/0/allOf/1 | `{"type":"object","additionalProperties":false,"required":["schemaVersion","outcome","artifacts"]}` | [#/$defs/stageResult/oneOf/0/allOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L614-L624) |
| #/$defs/stageResult/oneOf/0/allOf/1/properties/schemaVersion | `{"const":"stage-result.v2"}` | [#/$defs/stageResult/oneOf/0/allOf/1/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L619-L619) |
| #/$defs/stageResult/oneOf/0/allOf/1/properties/outcome | `{"const":"passed"}` | [#/$defs/stageResult/oneOf/0/allOf/1/properties/outcome](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L620-L620) |
| #/$defs/stageResult/oneOf/0/allOf/1/properties/artifacts | `{"type":"array","uniqueItems":true}` | [#/$defs/stageResult/oneOf/0/allOf/1/properties/artifacts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L621-L621) |
| #/$defs/stageResult/oneOf/0/allOf/1/properties/artifacts/items | `{"$ref":"#/$defs/artifactRef"}` | [#/$defs/stageResult/oneOf/0/allOf/1/properties/artifacts/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L621-L621) |
| #/$defs/stageResult/oneOf/0/allOf/1/properties/facts | `{"$ref":"#/$defs/decisionFacts"}` | [#/$defs/stageResult/oneOf/0/allOf/1/properties/facts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L622-L622) |
| #/$defs/stageResult/oneOf/1 | `{}` | [#/$defs/stageResult/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L627-L642) |
| #/$defs/stageResult/oneOf/1/allOf/0 | `{"$ref":"#/$defs/resultBase"}` | [#/$defs/stageResult/oneOf/1/allOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L629-L629) |
| #/$defs/stageResult/oneOf/1/allOf/1 | `{"type":"object","additionalProperties":false,"required":["schemaVersion","outcome","reason","artifacts"]}` | [#/$defs/stageResult/oneOf/1/allOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L630-L640) |
| #/$defs/stageResult/oneOf/1/allOf/1/properties/schemaVersion | `{"const":"stage-result.v2"}` | [#/$defs/stageResult/oneOf/1/allOf/1/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L635-L635) |
| #/$defs/stageResult/oneOf/1/allOf/1/properties/outcome | `{"enum":["retry","request_fix","blocked","failed","timed_out","cancelled"]}` | [#/$defs/stageResult/oneOf/1/allOf/1/properties/outcome](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L636-L636) |
| #/$defs/stageResult/oneOf/1/allOf/1/properties/reason | `{"$ref":"#/$defs/reason"}` | [#/$defs/stageResult/oneOf/1/allOf/1/properties/reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L637-L637) |
| #/$defs/stageResult/oneOf/1/allOf/1/properties/artifacts | `{"type":"array","uniqueItems":true}` | [#/$defs/stageResult/oneOf/1/allOf/1/properties/artifacts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L638-L638) |
| #/$defs/stageResult/oneOf/1/allOf/1/properties/artifacts/items | `{"$ref":"#/$defs/artifactRef"}` | [#/$defs/stageResult/oneOf/1/allOf/1/properties/artifacts/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L638-L638) |
| #/$defs/stageResult/oneOf/2 | `{}` | [#/$defs/stageResult/oneOf/2](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L643-L659) |
| #/$defs/stageResult/oneOf/2/allOf/0 | `{"$ref":"#/$defs/resultBase"}` | [#/$defs/stageResult/oneOf/2/allOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L645-L645) |
| #/$defs/stageResult/oneOf/2/allOf/1 | `{"type":"object","additionalProperties":false,"required":["schemaVersion","outcome","reason","artifacts","wait"]}` | [#/$defs/stageResult/oneOf/2/allOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L646-L657) |
| #/$defs/stageResult/oneOf/2/allOf/1/properties/schemaVersion | `{"const":"stage-result.v2"}` | [#/$defs/stageResult/oneOf/2/allOf/1/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L651-L651) |
| #/$defs/stageResult/oneOf/2/allOf/1/properties/outcome | `{"enum":["wait","orchestrator_required"]}` | [#/$defs/stageResult/oneOf/2/allOf/1/properties/outcome](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L652-L652) |
| #/$defs/stageResult/oneOf/2/allOf/1/properties/reason | `{"$ref":"#/$defs/reason"}` | [#/$defs/stageResult/oneOf/2/allOf/1/properties/reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L653-L653) |
| #/$defs/stageResult/oneOf/2/allOf/1/properties/artifacts | `{"type":"array","uniqueItems":true}` | [#/$defs/stageResult/oneOf/2/allOf/1/properties/artifacts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L654-L654) |
| #/$defs/stageResult/oneOf/2/allOf/1/properties/artifacts/items | `{"$ref":"#/$defs/artifactRef"}` | [#/$defs/stageResult/oneOf/2/allOf/1/properties/artifacts/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L654-L654) |
| #/$defs/stageResult/oneOf/2/allOf/1/properties/wait | `{"$ref":"#/$defs/waitRequest"}` | [#/$defs/stageResult/oneOf/2/allOf/1/properties/wait](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L655-L655) |
| #/$defs/stageResult/oneOf/3 | `{}` | [#/$defs/stageResult/oneOf/3](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L660-L676) |
| #/$defs/stageResult/oneOf/3/allOf/0 | `{"$ref":"#/$defs/resultBase"}` | [#/$defs/stageResult/oneOf/3/allOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L662-L662) |
| #/$defs/stageResult/oneOf/3/allOf/1 | `{"type":"object","additionalProperties":false,"required":["schemaVersion","outcome","reason","artifacts","retryAt"]}` | [#/$defs/stageResult/oneOf/3/allOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L663-L674) |
| #/$defs/stageResult/oneOf/3/allOf/1/properties/schemaVersion | `{"const":"stage-result.v2"}` | [#/$defs/stageResult/oneOf/3/allOf/1/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L668-L668) |
| #/$defs/stageResult/oneOf/3/allOf/1/properties/outcome | `{"const":"rate_limited"}` | [#/$defs/stageResult/oneOf/3/allOf/1/properties/outcome](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L669-L669) |
| #/$defs/stageResult/oneOf/3/allOf/1/properties/reason | `{"$ref":"#/$defs/reason"}` | [#/$defs/stageResult/oneOf/3/allOf/1/properties/reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L670-L670) |
| #/$defs/stageResult/oneOf/3/allOf/1/properties/artifacts | `{"type":"array","uniqueItems":true}` | [#/$defs/stageResult/oneOf/3/allOf/1/properties/artifacts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L671-L671) |
| #/$defs/stageResult/oneOf/3/allOf/1/properties/artifacts/items | `{"$ref":"#/$defs/artifactRef"}` | [#/$defs/stageResult/oneOf/3/allOf/1/properties/artifacts/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L671-L671) |
| #/$defs/stageResult/oneOf/3/allOf/1/properties/retryAt | `{"type":"string","format":"date-time"}` | [#/$defs/stageResult/oneOf/3/allOf/1/properties/retryAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L672-L672) |
| #/$defs/effectRequest | `{"type":"object","additionalProperties":false,"required":["schemaVersion","effectId","idempotencyKey","attempt","capability","operation","resource","payload","requestedAt"]}` | [#/$defs/effectRequest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L679-L703) |
| #/$defs/effectRequest/properties/runtimeDispatchProfile | `{"$ref":"#/$defs/runtimeDispatchProfile"}` | [#/$defs/effectRequest/properties/runtimeDispatchProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L687-L687) |
| #/$defs/effectRequest/properties/schemaVersion | `{"const":"effect-request.v2"}` | [#/$defs/effectRequest/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L688-L688) |
| #/$defs/effectRequest/properties/effectId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/effectRequest/properties/effectId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L689-L689) |
| #/$defs/effectRequest/properties/idempotencyKey | `{"$ref":"#/$defs/effectIdempotencyKey"}` | [#/$defs/effectRequest/properties/idempotencyKey](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L690-L690) |
| #/$defs/effectRequest/properties/deliveryId | `{"$ref":"#/$defs/effectDeliveryId"}` | [#/$defs/effectRequest/properties/deliveryId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L691-L691) |
| #/$defs/effectRequest/properties/attempt | `{"$ref":"#/$defs/effectAttemptIdentity"}` | [#/$defs/effectRequest/properties/attempt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L692-L692) |
| #/$defs/effectRequest/properties/capability | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/effectRequest/properties/capability](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L693-L693) |
| #/$defs/effectRequest/properties/operation | `{"$ref":"#/$defs/localId"}` | [#/$defs/effectRequest/properties/operation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L694-L694) |
| #/$defs/effectRequest/properties/resource | `{"$ref":"#/$defs/resourceIdentity"}` | [#/$defs/effectRequest/properties/resource](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L695-L695) |
| #/$defs/effectRequest/properties/payload | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/effectRequest/properties/payload](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L696-L696) |
| #/$defs/effectRequest/properties/requestedAt | `{"type":"string","format":"date-time"}` | [#/$defs/effectRequest/properties/requestedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L697-L697) |
| #/$defs/effectRequest/allOf/0 | `{}` | [#/$defs/effectRequest/allOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L699-L702) |
| #/$defs/effectRequest/allOf/0/if | `{"required":["runtimeDispatchProfile"]}` | [#/$defs/effectRequest/allOf/0/if](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L700-L700) |
| #/$defs/effectRequest/allOf/0/if/properties/runtimeDispatchProfile | `true` | [#/$defs/effectRequest/allOf/0/if/properties/runtimeDispatchProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L700-L700) |
| #/$defs/effectRequest/allOf/0/then | `{}` | [#/$defs/effectRequest/allOf/0/then](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L701-L701) |
| #/$defs/effectRequest/allOf/0/then/properties/capability | `{"const":"runtime.dispatch"}` | [#/$defs/effectRequest/allOf/0/then/properties/capability](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L701-L701) |
| #/$defs/effectRequest/allOf/0/then/properties/operation | `{"const":"dispatch"}` | [#/$defs/effectRequest/allOf/0/then/properties/operation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L701-L701) |
| #/$defs/effectRequest/allOf/0/then/properties/resource | `{"type":"object"}` | [#/$defs/effectRequest/allOf/0/then/properties/resource](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L701-L701) |
| #/$defs/effectRequest/allOf/0/then/properties/resource/properties/type | `{"const":"runtime.agent"}` | [#/$defs/effectRequest/allOf/0/then/properties/resource/properties/type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L701-L701) |
| #/$defs/effectReceipt | `{"type":"object","additionalProperties":false,"required":["schemaVersion","effectId","idempotencyKey","adapter","status","recordedAt"]}` | [#/$defs/effectReceipt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L704-L746) |
| #/$defs/effectReceipt/properties/schemaVersion | `{"const":"effect-receipt.v2"}` | [#/$defs/effectReceipt/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L712-L712) |
| #/$defs/effectReceipt/properties/effectId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/effectReceipt/properties/effectId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L713-L713) |
| #/$defs/effectReceipt/properties/idempotencyKey | `{"$ref":"#/$defs/effectIdempotencyKey"}` | [#/$defs/effectReceipt/properties/idempotencyKey](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L714-L714) |
| #/$defs/effectReceipt/properties/adapter | `{"$ref":"#/$defs/packageResolution"}` | [#/$defs/effectReceipt/properties/adapter](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L715-L715) |
| #/$defs/effectReceipt/properties/status | `{"enum":["accepted","completed","failed"]}` | [#/$defs/effectReceipt/properties/status](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L716-L716) |
| #/$defs/effectReceipt/properties/result | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/effectReceipt/properties/result](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L717-L717) |
| #/$defs/effectReceipt/properties/error | `{"$ref":"#/$defs/reason"}` | [#/$defs/effectReceipt/properties/error](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L718-L718) |
| #/$defs/effectReceipt/properties/recordedAt | `{"type":"string","format":"date-time"}` | [#/$defs/effectReceipt/properties/recordedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L719-L719) |
| #/$defs/effectReceipt/allOf/0 | `{}` | [#/$defs/effectReceipt/allOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L722-L729) |
| #/$defs/effectReceipt/allOf/0/if | `{"required":["status"]}` | [#/$defs/effectReceipt/allOf/0/if](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L723-L723) |
| #/$defs/effectReceipt/allOf/0/if/properties/status | `{"const":"failed"}` | [#/$defs/effectReceipt/allOf/0/if/properties/status](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L723-L723) |
| #/$defs/effectReceipt/allOf/0/then | `{"required":["error"]}` | [#/$defs/effectReceipt/allOf/0/then](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L724-L728) |
| #/$defs/effectReceipt/allOf/0/then/properties/error | `{}` | [#/$defs/effectReceipt/allOf/0/then/properties/error](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L725-L725) |
| #/$defs/effectReceipt/allOf/0/then/not | `{"required":["result"]}` | [#/$defs/effectReceipt/allOf/0/then/not](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L727-L727) |
| #/$defs/effectReceipt/allOf/0/then/not/properties/result | `{}` | [#/$defs/effectReceipt/allOf/0/then/not/properties/result](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L727-L727) |
| #/$defs/effectReceipt/allOf/1 | `{}` | [#/$defs/effectReceipt/allOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L730-L733) |
| #/$defs/effectReceipt/allOf/1/if | `{"required":["status"]}` | [#/$defs/effectReceipt/allOf/1/if](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L731-L731) |
| #/$defs/effectReceipt/allOf/1/if/properties/status | `{"const":"completed"}` | [#/$defs/effectReceipt/allOf/1/if/properties/status](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L731-L731) |
| #/$defs/effectReceipt/allOf/1/then | `{}` | [#/$defs/effectReceipt/allOf/1/then](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L732-L732) |
| #/$defs/effectReceipt/allOf/1/then/not | `{"required":["error"]}` | [#/$defs/effectReceipt/allOf/1/then/not](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L732-L732) |
| #/$defs/effectReceipt/allOf/1/then/not/properties/error | `{}` | [#/$defs/effectReceipt/allOf/1/then/not/properties/error](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L732-L732) |
| #/$defs/effectReceipt/allOf/2 | `{}` | [#/$defs/effectReceipt/allOf/2](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L734-L744) |
| #/$defs/effectReceipt/allOf/2/if | `{"required":["status"]}` | [#/$defs/effectReceipt/allOf/2/if](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L735-L735) |
| #/$defs/effectReceipt/allOf/2/if/properties/status | `{"const":"accepted"}` | [#/$defs/effectReceipt/allOf/2/if/properties/status](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L735-L735) |
| #/$defs/effectReceipt/allOf/2/then | `{}` | [#/$defs/effectReceipt/allOf/2/then](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L736-L743) |
| #/$defs/effectReceipt/allOf/2/then/not | `{}` | [#/$defs/effectReceipt/allOf/2/then/not](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L737-L742) |
| #/$defs/effectReceipt/allOf/2/then/not/anyOf/0 | `{"required":["result"]}` | [#/$defs/effectReceipt/allOf/2/then/not/anyOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L739-L739) |
| #/$defs/effectReceipt/allOf/2/then/not/anyOf/0/properties/result | `{}` | [#/$defs/effectReceipt/allOf/2/then/not/anyOf/0/properties/result](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L739-L739) |
| #/$defs/effectReceipt/allOf/2/then/not/anyOf/1 | `{"required":["error"]}` | [#/$defs/effectReceipt/allOf/2/then/not/anyOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L740-L740) |
| #/$defs/effectReceipt/allOf/2/then/not/anyOf/1/properties/error | `{}` | [#/$defs/effectReceipt/allOf/2/then/not/anyOf/1/properties/error](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L740-L740) |
| #/$defs/waitRequest | `{"type":"object","additionalProperties":false,"required":["schemaVersion","waitId","kind","signalType","authorizedIssuer","expiresAt"]}` | [#/$defs/waitRequest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L747-L776) |
| #/$defs/waitRequest/properties/schemaVersion | `{"const":"wait-request.v2"}` | [#/$defs/waitRequest/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L755-L755) |
| #/$defs/waitRequest/properties/waitId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/waitRequest/properties/waitId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L756-L756) |
| #/$defs/waitRequest/properties/kind | `{"enum":["signal","orchestrator"]}` | [#/$defs/waitRequest/properties/kind](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L757-L757) |
| #/$defs/waitRequest/properties/signalType | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/waitRequest/properties/signalType](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L758-L758) |
| #/$defs/waitRequest/properties/authorizedIssuer | `{"type":"object","additionalProperties":false,"required":["type","id"]}` | [#/$defs/waitRequest/properties/authorizedIssuer](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L759-L767) |
| #/$defs/waitRequest/properties/authorizedIssuer/properties/type | `{"enum":["orchestrator","operator","adapter"]}` | [#/$defs/waitRequest/properties/authorizedIssuer/properties/type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L764-L764) |
| #/$defs/waitRequest/properties/authorizedIssuer/properties/id | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/waitRequest/properties/authorizedIssuer/properties/id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L765-L765) |
| #/$defs/waitRequest/properties/expiresAt | `{}` | [#/$defs/waitRequest/properties/expiresAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L768-L773) |
| #/$defs/waitRequest/properties/expiresAt/oneOf/0 | `{"type":"string","format":"date-time"}` | [#/$defs/waitRequest/properties/expiresAt/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L770-L770) |
| #/$defs/waitRequest/properties/expiresAt/oneOf/1 | `{"type":"null"}` | [#/$defs/waitRequest/properties/expiresAt/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L771-L771) |
| #/$defs/waitRequest/properties/request | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/waitRequest/properties/request](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L774-L774) |
| #/$defs/resumeSignal | `{"type":"object","additionalProperties":false,"required":["schemaVersion","signalId","idempotencyKey","waitId","signalType","issuer","issuedAt","payload"]}` | [#/$defs/resumeSignal](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L777-L802) |
| #/$defs/resumeSignal/properties/schemaVersion | `{"const":"resume-signal.v2"}` | [#/$defs/resumeSignal/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L785-L785) |
| #/$defs/resumeSignal/properties/signalId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/resumeSignal/properties/signalId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L786-L786) |
| #/$defs/resumeSignal/properties/idempotencyKey | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/resumeSignal/properties/idempotencyKey](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L787-L787) |
| #/$defs/resumeSignal/properties/waitId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/resumeSignal/properties/waitId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L788-L788) |
| #/$defs/resumeSignal/properties/signalType | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/resumeSignal/properties/signalType](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L789-L789) |
| #/$defs/resumeSignal/properties/issuer | `{"type":"object","additionalProperties":false,"required":["type","id"]}` | [#/$defs/resumeSignal/properties/issuer](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L790-L798) |
| #/$defs/resumeSignal/properties/issuer/properties/type | `{"enum":["orchestrator","operator","adapter"]}` | [#/$defs/resumeSignal/properties/issuer/properties/type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L795-L795) |
| #/$defs/resumeSignal/properties/issuer/properties/id | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/resumeSignal/properties/issuer/properties/id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L796-L796) |
| #/$defs/resumeSignal/properties/issuedAt | `{"type":"string","format":"date-time"}` | [#/$defs/resumeSignal/properties/issuedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L799-L799) |
| #/$defs/resumeSignal/properties/payload | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/resumeSignal/properties/payload](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L800-L800) |
| #/$defs/administrativeReopenDecision | `{}` | [#/$defs/administrativeReopenDecision](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L803-L873) |
| #/$defs/administrativeReopenDecision/oneOf/0 | `{"type":"object","additionalProperties":false,"required":["schemaVersion","decisionId","idempotencyKey","runId","stageId","actor","reason","continuation","remediationStageId","decidedAt"]}` | [#/$defs/administrativeReopenDecision/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L805-L832) |
| #/$defs/administrativeReopenDecision/oneOf/0/properties/schemaVersion | `{"const":"administrative-reopen.v2"}` | [#/$defs/administrativeReopenDecision/oneOf/0/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L813-L813) |
| #/$defs/administrativeReopenDecision/oneOf/0/properties/decisionId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/administrativeReopenDecision/oneOf/0/properties/decisionId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L814-L814) |
| #/$defs/administrativeReopenDecision/oneOf/0/properties/idempotencyKey | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/administrativeReopenDecision/oneOf/0/properties/idempotencyKey](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L815-L815) |
| #/$defs/administrativeReopenDecision/oneOf/0/properties/runId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/administrativeReopenDecision/oneOf/0/properties/runId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L816-L816) |
| #/$defs/administrativeReopenDecision/oneOf/0/properties/stageId | `{"$ref":"#/$defs/localId"}` | [#/$defs/administrativeReopenDecision/oneOf/0/properties/stageId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L817-L817) |
| #/$defs/administrativeReopenDecision/oneOf/0/properties/actor | `{"type":"object","additionalProperties":false,"required":["type","id"]}` | [#/$defs/administrativeReopenDecision/oneOf/0/properties/actor](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L818-L826) |
| #/$defs/administrativeReopenDecision/oneOf/0/properties/actor/properties/type | `{"enum":["operator","administrator"]}` | [#/$defs/administrativeReopenDecision/oneOf/0/properties/actor/properties/type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L823-L823) |
| #/$defs/administrativeReopenDecision/oneOf/0/properties/actor/properties/id | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/administrativeReopenDecision/oneOf/0/properties/actor/properties/id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L824-L824) |
| #/$defs/administrativeReopenDecision/oneOf/0/properties/reason | `{"$ref":"#/$defs/reason"}` | [#/$defs/administrativeReopenDecision/oneOf/0/properties/reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L827-L827) |
| #/$defs/administrativeReopenDecision/oneOf/0/properties/continuation | `{"const":"remediation"}` | [#/$defs/administrativeReopenDecision/oneOf/0/properties/continuation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L828-L828) |
| #/$defs/administrativeReopenDecision/oneOf/0/properties/remediationStageId | `{"$ref":"#/$defs/localId"}` | [#/$defs/administrativeReopenDecision/oneOf/0/properties/remediationStageId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L829-L829) |
| #/$defs/administrativeReopenDecision/oneOf/0/properties/decidedAt | `{"type":"string","format":"date-time"}` | [#/$defs/administrativeReopenDecision/oneOf/0/properties/decidedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L830-L830) |
| #/$defs/administrativeReopenDecision/oneOf/1 | `{"type":"object","additionalProperties":false,"required":["schemaVersion","decisionId","idempotencyKey","runId","stageId","actor","reason","continuation","decidedAt"]}` | [#/$defs/administrativeReopenDecision/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L833-L871) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/schemaVersion | `{"const":"administrative-reopen.v2"}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L841-L841) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/decisionId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/decisionId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L842-L842) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/idempotencyKey | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/idempotencyKey](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L843-L843) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/runId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/runId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L844-L844) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/stageId | `{"$ref":"#/$defs/localId"}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/stageId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L845-L845) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/actor | `{"type":"object","additionalProperties":false,"required":["type","id"]}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/actor](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L846-L854) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/actor/properties/type | `{"enum":["operator","administrator"]}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/actor/properties/type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L851-L851) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/actor/properties/id | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/actor/properties/id](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L852-L852) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/reason | `{"$ref":"#/$defs/reason"}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L855-L855) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/continuation | `{"enum":["retry","cancel"]}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/continuation](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L856-L856) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/packageUpgrades | `{"type":"array","minItems":1,"uniqueItems":true}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/packageUpgrades](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L857-L868) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/packageUpgrades/items | `{"type":"object","additionalProperties":false,"required":["pluginId","from","to"]}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/packageUpgrades/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L859-L867) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/packageUpgrades/items/properties/pluginId | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/packageUpgrades/items/properties/pluginId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L863-L863) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/packageUpgrades/items/properties/from | `{"$ref":"#/$defs/packageIdentity"}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/packageUpgrades/items/properties/from](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L864-L864) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/packageUpgrades/items/properties/to | `{"$ref":"#/$defs/packageIdentity"}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/packageUpgrades/items/properties/to](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L865-L865) |
| #/$defs/administrativeReopenDecision/oneOf/1/properties/decidedAt | `{"type":"string","format":"date-time"}` | [#/$defs/administrativeReopenDecision/oneOf/1/properties/decidedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L869-L869) |
| #/$defs/packageProvenance | `{"type":"object","additionalProperties":false,"required":["schemaVersion","package","source","canonicalPath","trustScope","trustEvidence","resolvedAt"]}` | [#/$defs/packageProvenance](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L874-L920) |
| #/$defs/packageProvenance/properties/schemaVersion | `{"const":"package-provenance.v2"}` | [#/$defs/packageProvenance/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L882-L882) |
| #/$defs/packageProvenance/properties/package | `{"$ref":"#/$defs/packageIdentity"}` | [#/$defs/packageProvenance/properties/package](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L883-L883) |
| #/$defs/packageProvenance/properties/source | `{"type":"object","additionalProperties":false,"required":["type","canonicalReference"]}` | [#/$defs/packageProvenance/properties/source](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L884-L892) |
| #/$defs/packageProvenance/properties/source/properties/type | `{"enum":["builtin","local","git","registry"]}` | [#/$defs/packageProvenance/properties/source/properties/type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L889-L889) |
| #/$defs/packageProvenance/properties/source/properties/canonicalReference | `{"type":"string","minLength":1,"maxLength":2048}` | [#/$defs/packageProvenance/properties/source/properties/canonicalReference](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L890-L890) |
| #/$defs/packageProvenance/properties/canonicalPath | `{"type":"string","pattern":"^/","maxLength":4096}` | [#/$defs/packageProvenance/properties/canonicalPath](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L893-L893) |
| #/$defs/packageProvenance/properties/trustScope | `{"enum":["trusted_first_party","isolated_external"]}` | [#/$defs/packageProvenance/properties/trustScope](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L894-L894) |
| #/$defs/packageProvenance/properties/trustEvidence | `{"type":"object","additionalProperties":false,"required":["method","verifier","verifiedAt"]}` | [#/$defs/packageProvenance/properties/trustEvidence](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L895-L917) |
| #/$defs/packageProvenance/properties/trustEvidence/properties/method | `{"enum":["builtin_allowlist","source_digest_allowlist","publisher_attestation"]}` | [#/$defs/packageProvenance/properties/trustEvidence/properties/method](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L900-L902) |
| #/$defs/packageProvenance/properties/trustEvidence/properties/verifier | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/packageProvenance/properties/trustEvidence/properties/verifier](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L903-L903) |
| #/$defs/packageProvenance/properties/trustEvidence/properties/verifiedAt | `{"type":"string","format":"date-time"}` | [#/$defs/packageProvenance/properties/trustEvidence/properties/verifiedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L904-L904) |
| #/$defs/packageProvenance/properties/trustEvidence/properties/attestationDigest | `{"type":"string","pattern":"^sha256:[a-f0-9]{64}$"}` | [#/$defs/packageProvenance/properties/trustEvidence/properties/attestationDigest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L905-L905) |
| #/$defs/packageProvenance/properties/trustEvidence/allOf/0 | `{}` | [#/$defs/packageProvenance/properties/trustEvidence/allOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L907-L916) |
| #/$defs/packageProvenance/properties/trustEvidence/allOf/0/if | `{"required":["method"]}` | [#/$defs/packageProvenance/properties/trustEvidence/allOf/0/if](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L908-L911) |
| #/$defs/packageProvenance/properties/trustEvidence/allOf/0/if/properties/method | `{"const":"publisher_attestation"}` | [#/$defs/packageProvenance/properties/trustEvidence/allOf/0/if/properties/method](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L909-L909) |
| #/$defs/packageProvenance/properties/trustEvidence/allOf/0/then | `{"required":["attestationDigest"]}` | [#/$defs/packageProvenance/properties/trustEvidence/allOf/0/then](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L912-L915) |
| #/$defs/packageProvenance/properties/trustEvidence/allOf/0/then/properties/attestationDigest | `true` | [#/$defs/packageProvenance/properties/trustEvidence/allOf/0/then/properties/attestationDigest](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L913-L913) |
| #/$defs/packageProvenance/properties/resolvedAt | `{"type":"string","format":"date-time"}` | [#/$defs/packageProvenance/properties/resolvedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L918-L918) |
| #/$defs/registrationProvenance | `{"type":"object","additionalProperties":false,"required":["schemaVersion","package","surface","registrationId"]}` | [#/$defs/registrationProvenance](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L921-L931) |
| #/$defs/registrationProvenance/properties/schemaVersion | `{"const":"registration-provenance.v2"}` | [#/$defs/registrationProvenance/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L926-L926) |
| #/$defs/registrationProvenance/properties/package | `{"$ref":"#/$defs/packageProvenance"}` | [#/$defs/registrationProvenance/properties/package](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L927-L927) |
| #/$defs/registrationProvenance/properties/surface | `{"enum":["stage","observer","adapter","test_provider","report_adapter"]}` | [#/$defs/registrationProvenance/properties/surface](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L928-L928) |
| #/$defs/registrationProvenance/properties/registrationId | `{"$ref":"#/$defs/localId"}` | [#/$defs/registrationProvenance/properties/registrationId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L929-L929) |
| #/$defs/capabilityGrant | `{"type":"object","additionalProperties":false,"required":["capability","provider","constraints"]}` | [#/$defs/capabilityGrant](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L932-L941) |
| #/$defs/capabilityGrant/properties/capability | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/capabilityGrant/properties/capability](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L937-L937) |
| #/$defs/capabilityGrant/properties/provider | `{"$ref":"#/$defs/packageResolution"}` | [#/$defs/capabilityGrant/properties/provider](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L938-L938) |
| #/$defs/capabilityGrant/properties/constraints | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/capabilityGrant/properties/constraints](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L939-L939) |
| #/$defs/invocationLease | `{"type":"object","additionalProperties":false,"required":["schemaVersion","leaseId","attempt","registration","status","grants","limits","issuedAt","expiresAt"]}` | [#/$defs/invocationLease](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L942-L982) |
| #/$defs/invocationLease/properties/schemaVersion | `{"const":"invocation-lease.v2"}` | [#/$defs/invocationLease/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L950-L950) |
| #/$defs/invocationLease/properties/leaseId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/invocationLease/properties/leaseId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L951-L951) |
| #/$defs/invocationLease/properties/attempt | `{"$ref":"#/$defs/attemptIdentity"}` | [#/$defs/invocationLease/properties/attempt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L952-L952) |
| #/$defs/invocationLease/properties/registration | `{"$ref":"#/$defs/registrationProvenance"}` | [#/$defs/invocationLease/properties/registration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L953-L953) |
| #/$defs/invocationLease/properties/status | `{"enum":["active","revoked"]}` | [#/$defs/invocationLease/properties/status](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L954-L954) |
| #/$defs/invocationLease/properties/grants | `{"type":"array","uniqueItems":true}` | [#/$defs/invocationLease/properties/grants](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L955-L959) |
| #/$defs/invocationLease/properties/grants/items | `{"$ref":"#/$defs/capabilityGrant"}` | [#/$defs/invocationLease/properties/grants/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L957-L957) |
| #/$defs/invocationLease/properties/limits | `{"type":"object","additionalProperties":false,"required":["wallTimeMs","memoryBytes","cpuMillis"]}` | [#/$defs/invocationLease/properties/limits](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L960-L969) |
| #/$defs/invocationLease/properties/limits/properties/wallTimeMs | `{"type":"integer","minimum":1}` | [#/$defs/invocationLease/properties/limits/properties/wallTimeMs](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L965-L965) |
| #/$defs/invocationLease/properties/limits/properties/memoryBytes | `{"type":"integer","minimum":1}` | [#/$defs/invocationLease/properties/limits/properties/memoryBytes](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L966-L966) |
| #/$defs/invocationLease/properties/limits/properties/cpuMillis | `{"type":"integer","minimum":1}` | [#/$defs/invocationLease/properties/limits/properties/cpuMillis](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L967-L967) |
| #/$defs/invocationLease/properties/issuedAt | `{"type":"string","format":"date-time"}` | [#/$defs/invocationLease/properties/issuedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L970-L970) |
| #/$defs/invocationLease/properties/expiresAt | `{"type":"string","format":"date-time"}` | [#/$defs/invocationLease/properties/expiresAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L971-L971) |
| #/$defs/invocationLease/properties/revokedAt | `{"type":"string","format":"date-time"}` | [#/$defs/invocationLease/properties/revokedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L972-L972) |
| #/$defs/invocationLease/properties/revocationReason | `{"$ref":"#/$defs/reason"}` | [#/$defs/invocationLease/properties/revocationReason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L973-L973) |
| #/$defs/invocationLease/allOf/0 | `{}` | [#/$defs/invocationLease/allOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L975-L981) |
| #/$defs/invocationLease/allOf/0/if | `{"required":["status"]}` | [#/$defs/invocationLease/allOf/0/if](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L976-L976) |
| #/$defs/invocationLease/allOf/0/if/properties/status | `{"const":"revoked"}` | [#/$defs/invocationLease/allOf/0/if/properties/status](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L976-L976) |
| #/$defs/invocationLease/allOf/0/then | `{"required":["revokedAt","revocationReason"]}` | [#/$defs/invocationLease/allOf/0/then](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L977-L980) |
| #/$defs/invocationLease/allOf/0/then/properties/revokedAt | `true` | [#/$defs/invocationLease/allOf/0/then/properties/revokedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L978-L978) |
| #/$defs/invocationLease/allOf/0/then/properties/revocationReason | `true` | [#/$defs/invocationLease/allOf/0/then/properties/revocationReason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L978-L978) |
| #/$defs/pluginContext | `{"type":"object","additionalProperties":false,"required":["schemaVersion","lease","config","input","artifacts"]}` | [#/$defs/pluginContext](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L983-L1012) |
| #/$defs/pluginContext/properties/schemaVersion | `{"const":"plugin-context.v2"}` | [#/$defs/pluginContext/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L988-L988) |
| #/$defs/pluginContext/properties/runtimeDispatchProfile | `{"$ref":"#/$defs/runtimeDispatchProfile"}` | [#/$defs/pluginContext/properties/runtimeDispatchProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L989-L989) |
| #/$defs/pluginContext/properties/lease | `{"$ref":"#/$defs/invocationLease"}` | [#/$defs/pluginContext/properties/lease](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L990-L990) |
| #/$defs/pluginContext/properties/reviewCacheProfile | `{"$ref":"#/$defs/reviewCacheProfile"}` | [#/$defs/pluginContext/properties/reviewCacheProfile](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L991-L991) |
| #/$defs/pluginContext/properties/config | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/pluginContext/properties/config](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L992-L992) |
| #/$defs/pluginContext/properties/input | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/pluginContext/properties/input](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L993-L993) |
| #/$defs/pluginContext/properties/guidance | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/pluginContext/properties/guidance](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L994-L994) |
| #/$defs/pluginContext/properties/stageLifecycle | `{"type":"object","additionalProperties":false,"required":["attemptsUsed","remediationCyclesUsed","maxAttempts","maxRemediationCycles"]}` | [#/$defs/pluginContext/properties/stageLifecycle](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L995-L1005) |
| #/$defs/pluginContext/properties/stageLifecycle/properties/attemptsUsed | `{"type":"integer","minimum":0}` | [#/$defs/pluginContext/properties/stageLifecycle/properties/attemptsUsed](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1000-L1000) |
| #/$defs/pluginContext/properties/stageLifecycle/properties/remediationCyclesUsed | `{"type":"integer","minimum":0}` | [#/$defs/pluginContext/properties/stageLifecycle/properties/remediationCyclesUsed](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1001-L1001) |
| #/$defs/pluginContext/properties/stageLifecycle/properties/maxAttempts | `{"type":"integer","minimum":1}` | [#/$defs/pluginContext/properties/stageLifecycle/properties/maxAttempts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1002-L1002) |
| #/$defs/pluginContext/properties/stageLifecycle/properties/maxRemediationCycles | `{"type":"integer","minimum":0}` | [#/$defs/pluginContext/properties/stageLifecycle/properties/maxRemediationCycles](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1003-L1003) |
| #/$defs/pluginContext/properties/artifacts | `{"type":"array","uniqueItems":true}` | [#/$defs/pluginContext/properties/artifacts](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1006-L1010) |
| #/$defs/pluginContext/properties/artifacts/items | `{"$ref":"#/$defs/artifactRef"}` | [#/$defs/pluginContext/properties/artifacts/items](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1008-L1008) |
| #/$defs/eventIdentity | `{"type":"object","additionalProperties":false,"required":["runId"]}` | [#/$defs/eventIdentity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1013-L1025) |
| #/$defs/eventIdentity/properties/runId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/eventIdentity/properties/runId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1018-L1018) |
| #/$defs/eventIdentity/properties/stageId | `{"$ref":"#/$defs/localId"}` | [#/$defs/eventIdentity/properties/stageId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1019-L1019) |
| #/$defs/eventIdentity/properties/attemptId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/eventIdentity/properties/attemptId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1020-L1020) |
| #/$defs/eventIdentity/properties/effectId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/eventIdentity/properties/effectId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1021-L1021) |
| #/$defs/eventIdentity/properties/waitId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/eventIdentity/properties/waitId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1022-L1022) |
| #/$defs/eventIdentity/properties/artifactId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/eventIdentity/properties/artifactId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1023-L1023) |
| #/$defs/lifecycleEvent | `{"type":"object","additionalProperties":false,"required":["schemaVersion","eventId","sequence","type","identity","occurredAt","causationId","payload"]}` | [#/$defs/lifecycleEvent](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1026-L1057) |
| #/$defs/lifecycleEvent/properties/schemaVersion | `{"const":"lifecycle-event.v2"}` | [#/$defs/lifecycleEvent/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1034-L1034) |
| #/$defs/lifecycleEvent/properties/eventId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/lifecycleEvent/properties/eventId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1035-L1035) |
| #/$defs/lifecycleEvent/properties/sequence | `{"type":"integer","minimum":1}` | [#/$defs/lifecycleEvent/properties/sequence](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1036-L1036) |
| #/$defs/lifecycleEvent/properties/type | `{"enum":["run.created","run.started","run.resumed","run.waiting","run.paused","run.succeeded","run.failed","run.blocked","run.cancelled","stage.scheduled","stage.started","stage.waiting","stage.retrying","stage.skipped","stage.succeeded","stage.failed","stage.blocked","stage.cancelled","attempt.created","attempt.dispatched","attempt.completed","attempt.timed_out","attempt.cancelled","effect.requested","effect.accepted","effect.completed","effect.failed","artifact.created","wait.created","wait.resolved","orchestrator.required"]}` | [#/$defs/lifecycleEvent/properties/type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1037-L1049) |
| #/$defs/lifecycleEvent/properties/identity | `{"$ref":"#/$defs/eventIdentity"}` | [#/$defs/lifecycleEvent/properties/identity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1050-L1050) |
| #/$defs/lifecycleEvent/properties/occurredAt | `{"type":"string","format":"date-time"}` | [#/$defs/lifecycleEvent/properties/occurredAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1051-L1051) |
| #/$defs/lifecycleEvent/properties/causationId | `{}` | [#/$defs/lifecycleEvent/properties/causationId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1052-L1054) |
| #/$defs/lifecycleEvent/properties/causationId/oneOf/0 | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/lifecycleEvent/properties/causationId/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1053-L1053) |
| #/$defs/lifecycleEvent/properties/causationId/oneOf/1 | `{"type":"null"}` | [#/$defs/lifecycleEvent/properties/causationId/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1053-L1053) |
| #/$defs/lifecycleEvent/properties/payload | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/lifecycleEvent/properties/payload](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1055-L1055) |
| #/$defs/pluginDomainEvent | `{"type":"object","additionalProperties":false,"required":["schemaVersion","eventId","sequence","type","producer","identity","occurredAt","causationId","payload"]}` | [#/$defs/pluginDomainEvent](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1058-L1078) |
| #/$defs/pluginDomainEvent/properties/schemaVersion | `{"const":"plugin-domain-event.v2"}` | [#/$defs/pluginDomainEvent/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1066-L1066) |
| #/$defs/pluginDomainEvent/properties/eventId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/pluginDomainEvent/properties/eventId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1067-L1067) |
| #/$defs/pluginDomainEvent/properties/sequence | `{"type":"integer","minimum":1}` | [#/$defs/pluginDomainEvent/properties/sequence](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1068-L1068) |
| #/$defs/pluginDomainEvent/properties/type | `{"type":"string","pattern":"^plugin\\.[a-z0-9]+(?:[._-][a-z0-9]+)+\\.[a-z0-9]+(?:[._-][a-z0-9]+)*$"}` | [#/$defs/pluginDomainEvent/properties/type](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1069-L1069) |
| #/$defs/pluginDomainEvent/properties/producer | `{"$ref":"#/$defs/registrationProvenance"}` | [#/$defs/pluginDomainEvent/properties/producer](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1070-L1070) |
| #/$defs/pluginDomainEvent/properties/identity | `{"$ref":"#/$defs/eventIdentity"}` | [#/$defs/pluginDomainEvent/properties/identity](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1071-L1071) |
| #/$defs/pluginDomainEvent/properties/occurredAt | `{"type":"string","format":"date-time"}` | [#/$defs/pluginDomainEvent/properties/occurredAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1072-L1072) |
| #/$defs/pluginDomainEvent/properties/causationId | `{}` | [#/$defs/pluginDomainEvent/properties/causationId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1073-L1075) |
| #/$defs/pluginDomainEvent/properties/causationId/oneOf/0 | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/pluginDomainEvent/properties/causationId/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1074-L1074) |
| #/$defs/pluginDomainEvent/properties/causationId/oneOf/1 | `{"type":"null"}` | [#/$defs/pluginDomainEvent/properties/causationId/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1074-L1074) |
| #/$defs/pluginDomainEvent/properties/payload | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/pluginDomainEvent/properties/payload](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1076-L1076) |
| #/$defs/observerDelivery | `{"type":"object","additionalProperties":false,"required":["schemaVersion","deliveryId","observer","attemptNumber","event","deliveredAt"]}` | [#/$defs/observerDelivery](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1079-L1099) |
| #/$defs/observerDelivery/properties/schemaVersion | `{"const":"observer-delivery.v2"}` | [#/$defs/observerDelivery/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1087-L1087) |
| #/$defs/observerDelivery/properties/deliveryId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/observerDelivery/properties/deliveryId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1088-L1088) |
| #/$defs/observerDelivery/properties/observer | `{"$ref":"#/$defs/registrationProvenance"}` | [#/$defs/observerDelivery/properties/observer](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1089-L1089) |
| #/$defs/observerDelivery/properties/attemptNumber | `{"type":"integer","minimum":1}` | [#/$defs/observerDelivery/properties/attemptNumber](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1090-L1090) |
| #/$defs/observerDelivery/properties/event | `{}` | [#/$defs/observerDelivery/properties/event](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1091-L1096) |
| #/$defs/observerDelivery/properties/event/oneOf/0 | `{"$ref":"#/$defs/lifecycleEvent"}` | [#/$defs/observerDelivery/properties/event/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1093-L1093) |
| #/$defs/observerDelivery/properties/event/oneOf/1 | `{"$ref":"#/$defs/pluginDomainEvent"}` | [#/$defs/observerDelivery/properties/event/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1094-L1094) |
| #/$defs/observerDelivery/properties/deliveredAt | `{"type":"string","format":"date-time"}` | [#/$defs/observerDelivery/properties/deliveredAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1097-L1097) |
| #/$defs/observerCheckpoint | `{"type":"object","additionalProperties":false,"required":["schemaVersion","observer","runId","sequence","eventId","updatedAt"]}` | [#/$defs/observerCheckpoint](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1100-L1116) |
| #/$defs/observerCheckpoint/properties/schemaVersion | `{"const":"observer-checkpoint.v2"}` | [#/$defs/observerCheckpoint/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1107-L1107) |
| #/$defs/observerCheckpoint/properties/observer | `{"$ref":"#/$defs/registrationProvenance"}` | [#/$defs/observerCheckpoint/properties/observer](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1108-L1108) |
| #/$defs/observerCheckpoint/properties/runId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/observerCheckpoint/properties/runId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1109-L1109) |
| #/$defs/observerCheckpoint/properties/sequence | `{"type":"integer","minimum":0}` | [#/$defs/observerCheckpoint/properties/sequence](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1110-L1110) |
| #/$defs/observerCheckpoint/properties/eventId | `{}` | [#/$defs/observerCheckpoint/properties/eventId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1111-L1113) |
| #/$defs/observerCheckpoint/properties/eventId/oneOf/0 | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/observerCheckpoint/properties/eventId/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1112-L1112) |
| #/$defs/observerCheckpoint/properties/eventId/oneOf/1 | `{"type":"null"}` | [#/$defs/observerCheckpoint/properties/eventId/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1112-L1112) |
| #/$defs/observerCheckpoint/properties/updatedAt | `{"type":"string","format":"date-time"}` | [#/$defs/observerCheckpoint/properties/updatedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1114-L1114) |
| #/$defs/adapterLifecycle | `{"type":"object","additionalProperties":false,"required":["schemaVersion","provider","status","changedAt"]}` | [#/$defs/adapterLifecycle](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1117-L1135) |
| #/$defs/adapterLifecycle/properties/schemaVersion | `{"const":"adapter-lifecycle.v2"}` | [#/$defs/adapterLifecycle/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1122-L1122) |
| #/$defs/adapterLifecycle/properties/provider | `{"$ref":"#/$defs/registrationProvenance"}` | [#/$defs/adapterLifecycle/properties/provider](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1123-L1123) |
| #/$defs/adapterLifecycle/properties/status | `{"enum":["activating","ready","degraded","stopping","stopped","failed"]}` | [#/$defs/adapterLifecycle/properties/status](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1124-L1124) |
| #/$defs/adapterLifecycle/properties/changedAt | `{"type":"string","format":"date-time"}` | [#/$defs/adapterLifecycle/properties/changedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1125-L1125) |
| #/$defs/adapterLifecycle/properties/reason | `{"$ref":"#/$defs/reason"}` | [#/$defs/adapterLifecycle/properties/reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1126-L1126) |
| #/$defs/adapterLifecycle/allOf/0 | `{}` | [#/$defs/adapterLifecycle/allOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1128-L1134) |
| #/$defs/adapterLifecycle/allOf/0/if | `{"required":["status"]}` | [#/$defs/adapterLifecycle/allOf/0/if](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1129-L1132) |
| #/$defs/adapterLifecycle/allOf/0/if/properties/status | `{"enum":["degraded","failed"]}` | [#/$defs/adapterLifecycle/allOf/0/if/properties/status](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1130-L1130) |
| #/$defs/adapterLifecycle/allOf/0/then | `{"required":["reason"]}` | [#/$defs/adapterLifecycle/allOf/0/then](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1133-L1133) |
| #/$defs/adapterLifecycle/allOf/0/then/properties/reason | `true` | [#/$defs/adapterLifecycle/allOf/0/then/properties/reason](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1133-L1133) |
| #/$defs/resourceLock | `{"type":"object","additionalProperties":false,"required":["schemaVersion","lockId","resource","ownerLeaseId","fencingToken","status","acquiredAt","expiresAt"]}` | [#/$defs/resourceLock](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1136-L1154) |
| #/$defs/resourceLock/properties/schemaVersion | `{"const":"resource-lock.v2"}` | [#/$defs/resourceLock/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1144-L1144) |
| #/$defs/resourceLock/properties/lockId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/resourceLock/properties/lockId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1145-L1145) |
| #/$defs/resourceLock/properties/resource | `{"$ref":"#/$defs/resourceIdentity"}` | [#/$defs/resourceLock/properties/resource](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1146-L1146) |
| #/$defs/resourceLock/properties/ownerLeaseId | `{}` | [#/$defs/resourceLock/properties/ownerLeaseId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1147-L1147) |
| #/$defs/resourceLock/properties/ownerLeaseId/anyOf/0 | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/resourceLock/properties/ownerLeaseId/anyOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1147-L1147) |
| #/$defs/resourceLock/properties/ownerLeaseId/anyOf/1 | `{"$ref":"#/$defs/adapterActivationId"}` | [#/$defs/resourceLock/properties/ownerLeaseId/anyOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1147-L1147) |
| #/$defs/resourceLock/properties/fencingToken | `{"type":"integer","minimum":1}` | [#/$defs/resourceLock/properties/fencingToken](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1148-L1148) |
| #/$defs/resourceLock/properties/status | `{"enum":["active","released","expired"]}` | [#/$defs/resourceLock/properties/status](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1149-L1149) |
| #/$defs/resourceLock/properties/acquiredAt | `{"type":"string","format":"date-time"}` | [#/$defs/resourceLock/properties/acquiredAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1150-L1150) |
| #/$defs/resourceLock/properties/expiresAt | `{"type":"string","format":"date-time"}` | [#/$defs/resourceLock/properties/expiresAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1151-L1151) |
| #/$defs/resourceLock/properties/releasedAt | `{"type":"string","format":"date-time"}` | [#/$defs/resourceLock/properties/releasedAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1152-L1152) |
| #/$defs/pluginStateEntry | `{"type":"object","additionalProperties":false,"required":["schemaVersion","entryId","sequence","namespace","registration","entryType","idempotencyKey","occurredAt","payload"]}` | [#/$defs/pluginStateEntry](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1155-L1177) |
| #/$defs/pluginStateEntry/properties/schemaVersion | `{"const":"plugin-state-entry.v2"}` | [#/$defs/pluginStateEntry/properties/schemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1163-L1163) |
| #/$defs/pluginStateEntry/properties/entryId | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/pluginStateEntry/properties/entryId](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1164-L1164) |
| #/$defs/pluginStateEntry/properties/sequence | `{"type":"integer","minimum":1}` | [#/$defs/pluginStateEntry/properties/sequence](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1165-L1165) |
| #/$defs/pluginStateEntry/properties/namespace | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/pluginStateEntry/properties/namespace](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1166-L1166) |
| #/$defs/pluginStateEntry/properties/registration | `{"$ref":"#/$defs/registrationProvenance"}` | [#/$defs/pluginStateEntry/properties/registration](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1167-L1167) |
| #/$defs/pluginStateEntry/properties/attempt | `{}` | [#/$defs/pluginStateEntry/properties/attempt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1168-L1170) |
| #/$defs/pluginStateEntry/properties/attempt/oneOf/0 | `{"$ref":"#/$defs/attemptIdentity"}` | [#/$defs/pluginStateEntry/properties/attempt/oneOf/0](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1169-L1169) |
| #/$defs/pluginStateEntry/properties/attempt/oneOf/1 | `{"type":"null"}` | [#/$defs/pluginStateEntry/properties/attempt/oneOf/1](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1169-L1169) |
| #/$defs/pluginStateEntry/properties/entryType | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/pluginStateEntry/properties/entryType](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1171-L1171) |
| #/$defs/pluginStateEntry/properties/entrySchemaVersion | `{"$ref":"#/$defs/namespacedId"}` | [#/$defs/pluginStateEntry/properties/entrySchemaVersion](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1172-L1172) |
| #/$defs/pluginStateEntry/properties/idempotencyKey | `{"$ref":"#/$defs/opaqueId"}` | [#/$defs/pluginStateEntry/properties/idempotencyKey](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1173-L1173) |
| #/$defs/pluginStateEntry/properties/occurredAt | `{"type":"string","format":"date-time"}` | [#/$defs/pluginStateEntry/properties/occurredAt](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1174-L1174) |
| #/$defs/pluginStateEntry/properties/payload | `{"$ref":"#/$defs/jsonObject"}` | [#/$defs/pluginStateEntry/properties/payload](https://github.com/datrab/kubeclaw/blob/586f1f558a673c4df51c0afb9ea535c814b933b1/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1175-L1175) |

<!-- END GENERATED -->
