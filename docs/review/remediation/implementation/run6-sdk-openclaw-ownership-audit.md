# PCR-SDK-001: bounded OpenClaw transport ownership audit

Incomplete repair; read-only product audit. Fresh remote
`0c3ab36434020730b326bb2aa5c84ea0210f9d6d` exactly matched all 3,402
tracked file blobs, modes and types in isolated local
`46f66a573c905d3eecf6ed0b66eddbc33a9a977b`. The four mandatory resume files,
current register, original finding requirements and partial scope were freshly
read remotely. Original baseline `c38779c71bb92bc15c3fcb89930348e5417aa475`
again yields exactly the same 47 `implementiert` IDs as partial-47-scope.json.
This audit does not reclassify any finding or approve a production change.

## Demonstrated accepted-input boundary

`architecture-validator/schemas/input.schema.json` explicitly permits an open
`architecture` object. Original `buildArchitectureRequest` preserves it, and
the original architecture stage sends that builder result via runtime.dispatch.
The accepted input `{task: "Review the named component scores.", architecture:
{ä: 1, z: 2}}` is therefore a real schema-admitted production input, not an
invented HTTP header or an unsupported extra top-level field.

Run `node docs/review/evidence/run6-openclaw-identity-audit.mjs`.
Raw output is `docs/review/evidence/run6-openclaw-identity-audit.txt`.
Native en-US and sv-SE Node processes validate that original schema, run the
original builder, registry, registered OpenClaw adapter, network adapter, Core
EffectCoordinator, FileEffectJournal and FileResourceLockManager. An actual
loopback HTTP receiver returns a deliberate 503; it is **not a Gateway** and
never fabricates a session, model response, cancellation or receipt. This is
not execution of the complete architecture stage pipeline.

For the identical accepted payload, parent idempotency key and parent portable
effect identity, the original ACP `session-v1` producer emits two different
`sessions_spawn` idempotency keys, full labels and result paths across locales.
The digest hashes `{dispatchId, payload: modelPayload}` with legacy canonicalJson.
The same code uses `collector-v5` for collector mode, but the executable probe
uses ACP only. A digest discrepancy in collector mode is a source inference,
not an executed collector/Gateway result.

Reopening the first failed journal in sv-SE sends **no additional HTTP** and
keeps the entire journal byte-identical. Thus this demonstrates outgoing
identity non-portability, **not a repeated accepted Gateway session on restart**.

## Complete in-repository caller and authority classification

| Route | Owner and journal boundary | Cutover implication |
| --- | --- | --- |
| Normal stages, including architecture/review/implementation and other runtime.dispatch stage callers | PluginInvocationContext exposes only invoke. StageExecutor routes through AdapterRuntime.invoke; runtime.dispatch is durable (only secrets.read is automatically confidential). | The parent is accepted before entering OpenClaw. Existing failed/completed receipts do not invoke again. Accepted-without-receipt recovery calls receipt, but this adapter does not implement it, so recovery fails closed. |
| Observer capability invocation | deliverObserver also routes to AdapterRuntime.invoke; runtime.dispatch is not the special operator.request delivery retry path. | Same durable parent fence. No current observer dispatchOpenClaw direct caller was found. |
| Adapter activation or nested ordinary context.invoke | AdapterStarter authorizes the granted capability and uses durable EffectCoordinator.invoke. Activation has its own attempt owner; nested calls have their actual invocation parent. | Approved Adapter dependency identity work is relevant to this upstream owner, but does not change OpenClaw's downstream transport codec. |
| Explicit context.invokeConfidential, including activation/cleanup | Public SDK permits any granted capability here. AdapterStarter selects invokeConfidential unconditionally for the explicit flag; Core does not write a durable effect journal for it. No built-in adapter currently explicitly calls runtime.dispatch confidentially. | An unconditional transport migration cannot infer an accepted durable parent for this legal SDK route. Original createDispatchAdapter accepts confidential invocation and omits the fence for it. |
| Direct AdapterInstance invocation / imported factory | The manifest exposes activate; the private package has no public exports map. Still, SDK AdapterInstance's invocation union includes confidential mode, and the factory result accepts it. | No durable Core ownership can be inferred merely from calling the adapter or supplying a dispatch ID. Not a current built-in direct production caller. |
| Shared Worker Core, role-specific engines and remote test-gate dispatcher | No dispatchOpenClaw call or runtime.dispatch bridge was found in these paths. Their Worker/test-gate contract digests use separate ordinal/raw formats. | They are not another consumer of this SDK legacy open-payload hash. Do not migrate their closed formats or invent a native Worker gate for this SDK finding. |

Across current production source, the **only direct dispatchOpenClaw caller**
is `runtime-dispatch/src/openclaw-adapter.ts`, via createDispatchAdapter. Its
dispatch ID is request.idempotencyKey. createDispatchAdapter has ready/invoke/
shutdown and no receipt method. The public helper in openclaw.ts alone also
does not authenticate a persisted parent. Network/secrets/result operations
inside OpenClaw are deliberately confidential; that does not make the normal
outer runtime.dispatch call confidential.

## Legacy session lookup is not a migration receipt

For subagents, spawnSession first looks up the computed full label and validates
one unambiguous complete run/session identity and matching model. Then it checks
the historical eight-hex label and fails closed on any old match or unresolved
binding. Both labels are derived from the **currently computed transport ID**.
Consequently a new version/hash would not itself discover another locale's
old transport label. ACP has no list-based reattachment; absent accepted identity
remains explicitly unresolved. None of this authorizes reconstructing old
identity from current locale or adopting an old session using a guessed digest.

## Bounded conclusion and durable next action

The approved Adapter repair resolves its genuine duplicate dependency action,
but does not alter this demonstrably valid downstream open-payload producer.
Do not close PCR-SDK-001 on the assertion that every remaining legacy call uses
closed ASCII keys. Conversely, this audit does not impose a native Gateway
availability gate: original serializer negatives, real ArtifactStore put/get,
EffectJournal replay and explicit compatibility remain the finding's required
tests; local outgoing identity/ownership checks can test this narrow producer.

Before implementation, the root must approve the **owning transport cutover
policy**: which genuine durable new admissions may produce a new explicit
portable transport version, and how non-durable/confidential/direct invocations
and historical session bindings remain fail-closed. A blanket switch of
canonicalJson or an unconditional generation bump has not been approved.
Do not silently reject an existing SDK mode, invent a receipt, infer producer
version from parent portable encoding, or grant lookup fallback by current
locale. Persisted package/source identity and historical CLI preflight must
remain coupled to any eventual source change. No production source was edited.
