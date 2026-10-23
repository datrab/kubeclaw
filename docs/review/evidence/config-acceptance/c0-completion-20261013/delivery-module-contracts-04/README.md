# Additive single-owner receiver guard correction04

Status: proposed C5 contract, material independent recheck required. Preserves03 and rejected review03. Supersedes only the overlapping outer raw-adapter / final-primitive guard rules (R03-01). No implementation, effect execution, grant or global acceptance.

## Exactly one held guard owner

StageExecutor, AdapterRuntime, EffectCoordinator, DurableInvocation and AdapterStarter perform **non-held preflight validation** and propagate the mandatory process-local runFence plus original invocation/effect identity. Preflight may internally call the existing lock-manager assertCurrent but returns after releasing its metadata mutex. Raw adapter/factory invocation, AsyncLocalStorage.run and its synchronous async-function prefix execute **outside** any held run/effect metadata guard. No wrapper places raw.invoke or factory inside acceptEntrySync. The03 instruction that #invokeAdapter enters a joint held guard before raw entry is withdrawn, as is any confidential outer-held-entry wording.

Only the concrete receiver at the actual primitive enters runFence.acceptEntrySync: run metadata first, durable effect metadata second (confidential: run only). Existing02/03 authority identity, expiry/abort/epoch checks and request/resource/grant association remain. The receiver performs synchronous authorization and initiates the named primitive while holding this one non-reentrant guard. It returns synchronously; no network completion/await, dependency raw invocation or factory invocation runs inside it. No scoped-token reentrancy, same-root exception or new epoch ledger is introduced.

The exact receiver pattern for an asynchronous primitive is:

```ts
let completion: Promise<Response> | undefined;
runFence.acceptEntrySync(originalEffectIdentity, () => {
  completion = fetch(actualValidatedUrl, actualBoundRequestOptions);
});
// guard has released before awaiting completion
return await completion!;
```

The actual secret-resolver receiver captures process.env[validatedConfiguredName] inside its one confidential acceptEntrySync callback; subsequent confidential result construction returns outside the guard and secret bytes never enter journal/provenance. Existing authorization/name validation precedes the primitive, and stale/missing run authority rejects before read. Network-http validates origin/headers/body and emits its actual fetch inside the one receiver callback. Requests passed to dependency adapters are invoked outside held guards: their own eventual secret/network/file/enqueue receiver owns its final check. After awaited setup, retries, paced dispatch and gateway continuations, re-enter at the next actual primitive with the same captured original identity; preflight alone never authorizes it.

AdapterStarter queued factory callback validates and supplies the inherited startup/foundation-group context outside held guards. Factories cannot perform ambient I/O: any actual dependency/primitive must use the trusted receiving ABI. Installed receiver/code/ABI closure remains an explicit C4 prerequisite; a package lacking required final guards is ineligible, not silently compliant. No zero-authority dependency/startup fallback is restored.

## Durable acceptance, loss and uncertain effects

Journal/request/accept/reservation work occurs outside receiver guards with existing original authority checks and accounting; awaited work is followed by non-held preflight and **final receiver-held** authorization. Already committed accepted intent is not undone. If authority expires before the receiver primitive, no new emission is allowed, but existing accepted intent remains pending reconciliation under its original idempotency/receipt identity. No fictional failed/completed status, new idempotency key or replacement grant is synthesized.

A primitive legitimately admitted before loss may complete or remain uncertain afterward. Existing abort/effect recovery and retained original request/receipt association handle this; local metadata guards are not remote distributed fencing. No new primitive is admitted after loss. Completion/wait does not hold any mutex. Missing closure/fence fails before new effect; renewal/grants/budgets/claims and cleanup/retry inheritance remain those in02/03.

## Exact future oracle additions (existing IDs only)

Extend C5-COMPLETE-LEASE-LOSS and C5-COMPLETE-MUTATION, plus CMP-C5-BIND, without changing their bodies/results/requirements:

- Immediate real secret-resolver positive with live supplied authority: exactly one run metadata guard at process.env read, confidential output succeeds; no lock timeout/setup rejection counted as semantic proof. Native/confidential collection remains not-run.
- Immediate real network-http positive with live run authority and original durable resource fence: exactly one run→effect held guard around actual fetch initiation, completion awaited after release. Real permitted endpoint/capability/identity required; no substitute network component.
- Pause before the receiver after awaited setup and invalidate the actual run epoch: stale negative denies primitive; original accepted intent/receipt/counters remain for reconciliation. Separate durable effect-fence negative remains independently required.
- Receiver dependency path preserves parent authority but never calls raw dependency under held guard; same-boundary positive reaches its genuine final receiver.
- Mutate back to outer-held raw invocation: both immediate positives fail (non-reentrant timeout or explicit rejection). Those failures kill this exact overlap mutant only when restored positives genuinely succeed. Mutate away final receiver check: stale negative must fail for intended effect-admission reason. No setup/empty collection counted as F-MUT.

Original01/02/03 source/case/lifetime/selection/recovery contracts are unchanged except the explicit ownership supersession above. Current scope metadata evolved concurrently during03 review; this correction pins the frozen reviewed overlay rather than claiming final shared scope concordance. Parent integration requires a later exact current-ref conservation check. All native/future cases remain not-run.
