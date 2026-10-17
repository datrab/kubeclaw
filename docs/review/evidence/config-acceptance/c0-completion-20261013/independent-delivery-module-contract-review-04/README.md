# Independent bounded R03-01 recheck — delivery-module contracts04

Reviewer `/root/delivery_module_contract_review`, 2026-10-13. Independent static material recheck of **R03-01 only**, no author/implementation responsibility. Read correction04 README/references, frozen03/review and actual immediate secret/network/adaptor/lock call paths. Only this review04 directory written. No production/schema/test edits, tests/validators, API/credentials, actual secret/environment-value read, native process/OS inheritance experiment, image build or Eval.

**Verdict: R03-01 CLOSED at bounded static proposal scope.** Correction04 makes held-lock ownership coherent at the named productive boundaries. No remaining actionable material contradiction found within this exact recheck. This is not whole-C0 acceptance, implementation/package/native acceptance or runtime proof. Canonical C0 flags remain all not-run; implementationAuthorization null.

## Exact correction verified against sources

04 expressly withdraws03's joint-held guard around raw adapter entry and any confidential outer-held-entry wording. StageExecutor/AdapterRuntime/EffectCoordinator/DurableInvocation/AdapterStarter perform non-held preflight and propagate typed internal runFence/original identity. Raw.invoke, queued factory and AsyncLocalStorage.run execute outside any held run/effect metadata mutex. Only the concrete actual I/O-start receiver acquires run metadata then distinct durable effect metadata (confidential: run only), performs synchronous final authorization and initiates the primitive. No wrapper/dependency/factory invocation occurs inside that guard.

This resolves the actual source conflict identified in03 review:

| Actual productive source | Independent observation / corrected meaning |
|---|---|
| secret-resolver/src/adapter.ts:invoke | Named process.env read occurs synchronously before any await. Under04, raw async prefix is outside locks; only that read uses the receiver guard. No immediate re-acquisition of an outer-held mutex. Original capability/name mapping/signal/grant association retained; secret result constructed outside guard and never journaled as proof. |
| network-http/src/adapter.ts:invoke→performRequest | Origin/method/headers/body validation precedes fetch; performRequest reaches fetch before first await.04 assigns fetch Promise to outer local variable in a synchronous void guard callback, releases metadata locks, then awaits completion. Actual fetch initiation—not promise completion or raw function entry—is the specified receiver boundary. Manual redirect denial/request-response limits remain. |
| adapter-startup.ts:#wrap/#activate/#invokeDependency | ALS raw invocation and Promise.then(factory) execute outside guards; inherited startup/parent authority is retained and final receiving dependency owns its check after any await. No raw dependency called while parent holds metadata. Raw factory ambient I/O remains forbidden by required installed receiver/ABI closure, not implicitly authorized. |
| adapters.ts / coordinator.ts | Runtime and durable/confidential coordinator calls perform released preflight and transport internal authority to receiver; preflight alone cannot authorize I/O. Confidential branch acquires no invented effect resource lock and logs no secret values. |
| durable-invocation.ts:#invokeAdapter | Existing attempt-owned resource fence remains distinct from run owner/epoch. Proposed04 outer path does not hold those metadata guards across adapter.invoke; final receiver jointly verifies actual run and durable effect identity/expiry. Awaited journal/setup work followed by receiver check; old entrance assertCurrent is not accepted as final fencing. |
| effects/locks.ts:assertCurrent / state/file-mutex.ts:withLock | assertCurrent releases mutex on return; FileMutex is synchronous/non-reentrant.04 chooses exactly one held receiver owner and retains separate roots/lock order, no scoped reentrancy or same-root exception. Mutex not retained over Promise/network completion. |
| run-mutation.ts | Actual lock owner/epoch, TTL/renewal signal remain captured authority. New typed receiving ABI/manager held guard are proposed C5 deltas, not present APIs or a new configurable epoch ledger. |

The receiver pattern does not make raw async code safe merely because it returned a Promise: later queued/awaited continuation must reach its own final guarded primitive. Installed code lacking that ABI remains ineligible under C4/profile closure. This is a coherent definition boundary, not proof that all installed adapters have been migrated or that arbitrary plugin code cannot bypass ambient I/O.

## Original effect/authorization semantics retained

Accepted journal intent is not rolled back when run authority subsequently expires. A stale final receiver cannot emit, but an already accepted original request remains pending reconciliation under its original idempotency/receipt association; no fictional completion/failure, replacement key or grant is synthesized. Legitimately pre-loss emitted work can complete or be uncertain remotely and uses existing abort/recovery/receipt handling. Local guard is not asserted to be distributed remote fencing.

Run/effect lock identities remain distinct; confidential route remains run-only; grants/budgets/claims/deadlines/cleanup-retry inheritance do not enlarge or reset. Receiver check after awaited setup and secret→network dependencies uses captured original association. No settings author, generic epoch ledger or new service introduced.

## Corrective future oracles / conservation

04 names exactly **three** existing IDs: C5-COMPLETE-LEASE-LOSS, C5-COMPLETE-MUTATION and CMP-C5-BIND. Read-only body-digest comparison against prior01 canonical/additive pins confirms all three bodies, requirements and not-run results remain unchanged. Added oracles require genuine same-boundary secret/network positives, stale final receiver negative, separate effect-fence negative and nested dependency positive. Outer-held mutant must fail immediate positives for the intended non-reentrant overlap only after restored positives genuinely succeed; removing receiver check must fail the stale-effect negative. Setup/timeout/empty collection is not semantic acceptance. No commands executed or future test digests invented.

Exact receipt in identity-and-conservation.json records head/tree, read input hashes, source/frozen checks and unchanged case metadata. All **3/3 direct frozen04 references**, **63/63 preserved03 source pins** and **4/4 preserved03 historical artifact pins** match. worktree-status.txt records shared dirty/untracked state. Existing original229/native/canonical obligations are unchanged; this recheck neither replaces nor executes them.

## Limits / current scope distinction

The frozen03 overlay and rejected03 review are preserved, including the recorded concurrent scope evolution during03. Current shared C1 scope identity is captured as a read input only; this R03-01 recheck does **not** certify final current scope/entry/status reference concordance or integration. A separate exact current-ref check remains parent work. Earlier bounded corrections are not promoted to global acceptance by this report.

R03-01 needs no further corrective proposal within this checked scope. Continue current-ref integration and remaining C0 coverage/package/gates, preserving all original cases and external installation/Secretstore/store/provider/archive facts. No C1–C6 authorization follows.
