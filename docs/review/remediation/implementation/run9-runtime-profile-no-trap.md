# Runtime profile selector: genuine no-trap boundary counterexample

Status: **bounded correction implemented and author-tested; independent final reconciliation/review pending; finding remains incomplete**.

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

## Authorized bounded correction and completed author gates

Root explicitly authorized the proposed ordering change. Frozen source `f505eedacada7e7168740aa27272530f62c9f47f` moves only the existing `portableJson(request)` call before `Object.hasOwn`; no serializer, persisted digest, profile contract, operation or legacy absence changes. Early source checkpoint: remote `9488fdf264ee26c9987f56a659722981e8da5835`, branch `fix/resume-47-run9-runtime-profile-fix-f505eed`, sole parent baseline9c5. The prior red-only checkpoint is remote `755d4e1e12bf99421c0d2aa638c990aeed127822`.

The original red tests run unchanged and pass: both exposed entry APIs reject transparent Proxy and getter inputs with zero traps/getters, zero additional real HTTP POSTs and byte-identical original effect journal. Additive compatibility coverage retains ordinary historical JSON, null-prototype JSON, optional JSON dependency metadata, current finite profile, nested model-owned keys and unchanged legacy/portable serialization bytes. Absent `withRuntimeDispatchProfile` still preserves object identity; explicit undefined and wrong capability remain denied.

The combined original matrix passes **48/48, zero skips/cancellations/failures**, raw `../evidence/run9-runtime-profile-final-matrix.txt`. It includes actual v1/v2/v3 original Core producers, all nine original registered HTTP requested/accepted/completed SIGKILL recoveries, preserved historical absence and current transport selection, native locale ACP503 behavior, original HMAC/confidential dependency consumers, historical/current dependency canonical ownership/corrupt receipts, failed/uncertain/ambiguous history, parent ordering, real cross-locale process races and malformed dependency results. These are bounded compatibility/admission gates, not successful external Gateway/model delivery.

First matrix raw `../evidence/run9-runtime-profile-first-matrix.txt` deliberately preserves 39 passes and nine setup failures: own workspace symlinks were absolute, violating the original historical materializer's assertion that the SDK resolve inside its fresh current-source copy. Correcting only the 64 own workspace links to relative paths made the unchanged complete48 pass. No fixture or producer assertion was removed or changed.

Direct Nova and shared plugin-runtime TypeScript checks, canonical ESLint on the helper and additive test, original SDK JSON-domain test and canonical SDK generator all pass. Raw `../evidence/run9-runtime-profile-checks.txt` also preserves an initial non-authoritative command chain whose missing npm bin/incorrect workspace and tsconfig paths failed; its final shell exit0 was only the last SDK test and is not misreported as a typecheck pass. Correct direct checks completed individually with exit0.

Independent reviewer owns a separate checkout and original native red oracle; review and latest cache/reader reconciliation are not replaced by these author results. No register status is closed by this package.

The original archived historical CLI probe also completed exit0, raw `../evidence/run9-runtime-profile-legacy-cli.txt`: genuine unfixed compiler graph mismatch counterexample, unchanged old identity and13 stages under corrected recovery, expected original terminal refusal, legacy-authoring import and original source launcher. Its two `executedStages:0` probes and `nativeAcceptance:false` remain explicit; this is not a successful native workload claim. The test-generated untracked `.legacy-resume-cutover-2.mts` is not part of this frozen package.

Next action: reconcile byte-exact helper and unchanged tests onto freshly integrated cache/reader head, rerun affected genuine gates there, complete independent review, and let root update register/evidence/resume inventory and integrate only an approved exact fresh-parent fast-forward commit.
