# Runtime profile selector: genuine no-trap boundary counterexample

Status: **incomplete; independent counterexample, no production correction yet**.

Baseline: freshly read remote `9c5bdcb21c8fcd50fb38d2a1c4988213db2b3ecb`, tree `a62bf2f01e77e3a5e51765eac64bc2581f77efb7`, exactly local committed `e98d2bd9c64807a1d2ca0a031546ccdce7e5b8b6`. Own isolated checkout `run9-runtime-profile-audit`; current-source workspace dependencies, no author checkout writes.

The original SDK `runtimeDispatchProfileFields` calls `Object.hasOwn(request, 'runtimeDispatchProfile')` before `portableJson(request)`, and returns immediately when the profile is absent. The descriptor trap of a transparent Proxy therefore executes before rejection when present and bypasses validation entirely when absent. A payload getter on an absent-profile request also bypasses validation. The owning JSON serializer already rejects Proxy and accessors without executing their traps; it is not invoked on the absent path.

The additive test `tests/verification/reliability/runtime-profile-no-trap.test.mjs` uses the actual original human-approval fixture, installed operator/network/secret/wait adapters, signed local HTTP receiver, original adapter activation and original effect journal. It additionally invokes the original `createPluginInvocationContext` and registered `AdapterRuntime` entry APIs with valid ordinary lease/config/attempt inputs from that fixture. The direct-entry lease is test-supplied; this is not claimed as a second Core-produced lease or a new complete pipeline history. No replacement stores, transports or successful provider histories are constructed.

Executed baseline command:

```
node --test --test-name-pattern='runtime profile selector|original plugin context' tests/verification/reliability/runtime-profile-no-trap.test.mjs
```

Result: **0/2 pass, 2 fail, zero skips**, intentional red regression. In each of four real entry cases (context/adapter crossed with Proxy/payload getter), the trap or getter executes once, no error is returned, one actual HTTP POST occurs, and `effects.jsonl` changes. Raw diagnostics and assertion failures: `../evidence/run9-runtime-profile-before.txt`. The counterexample is not a failed setup or a synthetic adapter acceptance.

Caller review: context invokes the selector before grant authorization or request field reads; AdapterRuntime invokes it before provider selection or plain internal invocation construction. AdapterStarter's dependency entry already runs `portableJson` and `structuredClone` first, so it is not the same exposed path. Internal `EffectInvocation` contains JSON request/attempt/resource/payload plus optional profile/delivery/dependency identity. Original builders omit absent optional properties conditionally; dependency parent consists of original JSON EffectRequest and boolean, with no AbortSignal/functions. AbortSignal, locks, callbacks and adapter implementations are passed separately. Original Review helpers also use the selector on JSON PluginContext, not the runtime method-bearing context object.

Smallest proposed correction: move the existing `portableJson(request)` before `Object.hasOwn` in this one SDK helper. Keep both original codecs and all persisted request/effect digests unchanged; do not add a second validator, broaden allowed values, alter profile absence, or change `withRuntimeDispatchProfile` semantics. Explicit `undefined` is not a legitimate JSON metadata value; the original builders omit it. Before approval, rerun actual original profile/native/dependency/confidential consumers and add positive JSON/conditional-metadata coverage. Root authorization and independent review are required before source integration; no finding is closed by these two red tests.

Next action: obtain bounded helper correction authorization, preserve this baseline raw evidence, implement only that ordering change, and run the same tests unchanged plus original positive consumer regressions against the latest integration head.
