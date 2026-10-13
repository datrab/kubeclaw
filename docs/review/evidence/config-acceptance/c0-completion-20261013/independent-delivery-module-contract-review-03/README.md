# Independent material recheck: delivery/module contracts 03

Reviewer `/root/delivery_module_contract_review`, 2026-10-13. Bounded independent static material recheck of R02-01..03, no author/implementation responsibility. Inspected frozen03 README/active-contract-overlay/case-oracles/source-pins and actual productive sources; preserved02 and review remain inputs to challenge, not instructions to agree. Only this review-03 directory written. No source/schema/test edits, tests/validators, API/credentials, native/OS inheritance experiment, image build or Eval.

**Verdict: NOT ACCEPTED as a closed proposal yet — one material synchronous lock-ownership contradiction remains (R03-01).** R02-01 and R02-02 are corrected at bounded proposal scope. R02-03's typed authority propagation and receiver mapping are substantially corrected, but its overlapping outer/receiver guards need one explicit coherent owner. No whole-C0/package/native/runtime acceptance follows.

## Identity / preserved obligations

Companion identity-and-conservation.json records exact head/tree/read identities; worktree-status.txt records the shared dirty/untracked checkout. **63/63 source pins and 4/4 frozen prior artifacts match.** Read-only comparisons verified 10 original case pins, all148 original EFFECT mapping bodies/IDs/results and all296 translated A/B entries. Every entry retains original non-binding root metadata/settings-digest map, has nine unique root tuples and five exact consumed-owner caller projections, with matching parent/child Buster profile. Case-ID order/count remains148. Original229 cases,14 canonical C5 refs and19 additive C5 bodies still match prior pins and lifecycle. Canonical2,409 inventory rows/6,845 cases and all original/native obligations (including original50-case obligation) unchanged/not executed; canonical gates all not-run, implementationAuthorization null.

Concurrent-input limitation: shared `c1-package-draft/scope.json` changed after the initial read from overlay baseline `86edcbc5500f69d603765fa1dd6682534cd41692c3ab446906cae675ab21159c` to final observed `77169de90e57af0cfbe68386c95629fba94597d8c5c79809a6551eca2b31d53c`. Its final evidence map adds entrySelectionBindingSupersession to translated03, but the immutable03 overlay still pins the earlier baseline. This review records both identities and closes R02-01 only against the explicit frozen overlay/translation; final current-scope integration/concordance is not accepted here. R03-01 and all63 productive/source pins are unaffected. No shared input was written by this reviewer.

These are identity/conservation observations, not runtime PASS. Substantive actual-source observations follow.

## R03-01 — P1: outer raw-adapter guard and receiver's final primitive guard conflict

03 correctly requires non-reentrant synchronous metadata guards, separate run/effect manager roots and no mutex held across await. It also states:

- `#invokeAdapter enters joint run+effect guard before raw adapter entry`;
- `acceptEntrySync` enters run metadata then durable effect metadata and invokes final adapter/I/O start;
- every raw adapter must use `runFence` again at its final actual primitive, including secret-resolver's process.env read and network-http's fetch.

Under an outer held guard around raw adapter entry, those requirements re-enter the **same run metadata mutex** on the valid immediate path. Actual `secret-resolver/src/adapter.ts:invoke` is async but has no await before the named process.env read. Actual `network-http/src/adapter.ts:invoke` calls performRequest, whose async body reaches fetch synchronously before its first await. Actual `AdapterStarter.#wrap` calls raw.invoke synchronously inside AsyncLocalStorage.run. Returning a Promise does not defer those prefixes. A receiver's acceptEntrySync therefore executes before the outer guard can release. For durable branches, the effect metadata mutex is nested twice too.

Current `state/file-mutex.ts:withLock` opens a separate descriptor and takes a synchronous **non-reentrant** flock; same-root re-entry waits until timeout (or the proposed explicit reentrancy rejection fires). This is not a hypothetical race or a request to execute tests: the proposed valid call path contradicts its lock ownership rules by inspection. The confidential coordinator raw-invoke path has the same risk if its immediate raw entry is performed under run guard, as prescribed for final adapter entry.

**Required correction:** choose one exact ownership protocol. For example, coordinator/StageExecutor perform non-held authority validation and supply runFence, while **only the actual receiver's final primitive** enters the joint run/effect metadata guards. Alternatively define a strictly scoped already-held guard token with verified association and explicit nested reuse that never reacquires the same mutex; do not merely add generic reentrancy. State whether raw adapter/factory invocation occurs inside or outside held guards. Distinguish preparatory entry from authorized actual I/O-start, retain final post-await revalidation, durable versus confidential distinction and all existing effect/grant/budget/uncertainty rules. No await/network completion inside guards.

Extend existing proposed oracle IDs with successful same-boundary positive controls for immediate secret read and network fetch as well as stale authority negatives. A lock timeout or setup rejection on every invocation is not semantic lease-loss rejection. Keep accepted-before-loss intent unresolved/uncertain as appropriate; do not “fix” the overlap by removing receiver final checks or issuing a new idempotency key.

## R02-01 — corrected at bounded definition scope

active-contract-overlay.json pins the original entry-profile JSON and C1 scope, refines binding.instanceId to exact consumer-service identity for an owner contribution, and explicitly supersedes only `/currentCaseDefinitionEvidence/entrySelections` fixture interpretation with translated03 entries. Original pairs02/profile documents/current-wire observations remain unchanged. Current entry/status integration is explicitly still parent work after review, not falsely claimed done.

Verified every296 entry against old02: five callers are actual Control2/Worker3/Studio1/Buster parent1/Buster child2 contributions, root tuples unique, rolebuster WorkerCore present for child, all contributions use their caller serviceInstanceId, receipt projections select only consumed owners, original full six-owner digest maps preserved. Control/Worker dependencies match `loadControlServerConfig`/`loadWorkerConfig`; Studio and Buster parent/child match `loadStudioConfig`/`preparation-supervisor`/`remote-plan-cli`. Same parent/child Buster selection is explicit, not inferred from equal instance IDs.

Fixture projections are expressly not pipeline-service-selection.v1 boot receipts: missing authentic package/image/Chart/release/installation authority and portable-codec receipts are stated. Conservation UTF8 hashes are not substituted for startup receipts. All-profile/intrinsic validation, root-only profile choice, case-sensitive profile IDs and whole-profile/no-merge rules remain intact. This closes the specific active-fixture contradiction; it does not establish deployed caller identities or actual v3 startup.

## R02-02 — corrected at bounded definition scope

Actual entrypoint explicitly closes9 in current parent spawns; actual preparation-supervisor currently maps only0..3. 03 labels both as current facts and proposes removal of9>&-, explicit stdio9 mapping through setpriv to child, fstat/same trusted stable inode validation, no fallback descriptor, no LOCK_UN/inode replacement and full lifetime retention. Attempt hosts/providers explicitly do not inherit9. Source `NativeProcessLaunches.spawn` maps pipe descriptors only (0..2 or0..3), providing the actual attempt-launch isolation seam; no untrusted attempt is relied on to hold lifetime authority.

03 does not claim flock alone proves native quiescence. Recovery-only boot retains old runtime/handoff and uses authentic archived image/reader/pool/node/store closure, then actual NativeWorkerOwnership.supervise/store.withSupervisor recovery plus native-attempt/preparation-ledger reconciliation before new runtime emission. The required split of nativeBusterPreparationConfig's generated runtime read versus trust capture is a stated C1 delta, not an available current API.

Actual native-worker-ownership.ts `#recover` inventories cgroup scopes, rejects unknown names, binds node/host+boot identity and reconciles recorded owners; terminal scopes reappearing reject, owned same-boot missing scope rejects, identity-proved scopes finish via durable empty/final observation/disposal, and authentic unlaunched/old-boot records use existing abandoned semantics. `ownership-store.ts:bindHostIdentity` explicitly prevents treating a changed boot on a different host as quiescence. `lease.finish` drains launched children and identity-checked scope, persists final counters before disposal. 03 explicitly requires disposed populated=false evidence or authentic abandoned-record semantics/scope absence; owner.isReady alone is insufficient. No prior file absence/PID cache substitutes for these observations.

SIGKILL entrypoint/parent with surviving fd9 holder blocks entrant before rewrite. Once holders are gone, unknown claim/unavailable cgroup or missing archive still blocks. Empty first boot requires no prior records/scopes, not merely missing handoff. Old job archives survive transport retirement; retained bytes/retirement receipts remain accounted. Corrected crash/holder/native-quiescence oracles name actual shell/native-parent/setpriv/store/cgroup paths, not PID mocks.

These are a coherent proposed lifetime/recovery ABI, **not** proof that Node/setpriv/Linux descriptors were exercised or that external archive/pool closure exists. No native acceptance claimed.

## R02-03 — substantive corrections verified, one overlap unresolved

03 maps actual typed internal authority through executePrepared/StageExecutor→AdapterRuntime→EffectCoordinator and AdapterStarter/AsyncLocalStorage parent/dependency routes. Run root/lock/owner/epoch/foundation/binding association is distinct from attempt-owned effect ResourceLock. Process-local guard cannot be manufactured from config strings; serialized identity is provenance only, no config author or secret bytes. Startup authority is explicit foundation-group authority; parentless dependency fallback is not treated as authorization.

The actual sources support the proposed delta:

| Actual seam inspected | Proposed correction / observation |
|---|---|
| run-mutation.ts + effects/locks.ts + state/file-mutex.ts | Existing run epoch and metadata mutex; proposed finite held guard instead of assert-then-append. Final epoch/expiry/aborted checks, original synchronous events lock order and no rollback retained. R03-01 concerns who holds that mutex while raw code is entered. |
| engine-runtime.ts/createAdapterRuntime | Actual effect manager root storageRoot/resource-locks distinct from parent run-mutation .run-mutation-locks; proposal rejects accidental same-root nesting. Real grants/registry/platform closure remains run foundation input. |
| StageExecutor/adapters.ts | Current invocation lacks run handle;03 explicitly adds mandatory internal argument/association and receiving checks before/after awaited setup, not a settings ENV or EffectRequest payload. |
| adapter-startup.ts + adapter-invocation-phase.ts | Actual dependency `await #start`, ALS wrapped invocation, startup Promise.then(factory) and cleanup contexts require propagated parent/startup authority;03 names these queued/await receiving points. Raw factory ambient I/O must not be implicitly authorized. |
| effects/contracts.ts + coordinator.ts | Current EffectInvocation lacks authority; durable/confidential paths differ.03 adds typed internal handle and versioned runFence ABI without inventing confidential resource locks or logging secrets. |
| durable-invocation.ts + effects/journal.ts | Actual requested/accepted awaits and raw invocation/receipt recovery paths;03 rechecks after awaits and retains committed-before-loss accepted intent/uncertainty, not false failed/completed rollback or new keys. |
| secret-resolver/src/adapter.ts | Actual named process.env read is synchronous; final primitive check is correctly identified but overlaps outer guard under current03 wording. |
| network-http/src/adapter.ts | Actual performRequest fetch emission after validation; manual redirect denial/body limits remain. Guard belongs at emission, completion awaits outside. Same immediate overlap described above. |
| runtime-dispatch adapter/dispatch-adapter/openclaw-session | Actual secret await, nested confidential network and paced/gateway continuations;03 correctly propagates and rechecks at later receiving primitive, not just initial adapter function entrance. |
| transport-publisher/src/adapter.ts | Actual record/reservation preparation precedes secret/network dependency calls; parent run authority must propagate after awaits. Existing durable idempotency/receipt association retained. |
| sdk/src/runtime.ts | Current durable/confidential union has only resource fence in durable branch.03 names explicit new invocation ABI rather than claiming current interfaces carry the run guard. |

Command/filesystem/Redis installed receiver coverage remains required per profile;03 does not mark uninspected adapters compliant merely by interface. No generic epoch ledger/new grant service/worker topology introduced. Emission accepted before loss may complete or be uncertain remotely; local guard is not fictitious remote distributed fencing. Authentic remote provider ABI/grant remains an activation input.

## Limits and next step

Static material recheck only. Earlier DMC-02 image delivery, DMC-05 separate cleanup membership and DMC-06 strict stored/archive-first lifecycle proposal remain carried forward; no new execution acceptance was requested or inferred. Original grants/budgets/claims/deadlines/idempotency/effect receipts remain mandatory and unchanged. External deployed roles/installation/Secretstore revision/store capacity/pool/cgroup/historical archives remain genuine missing activation facts.

Correct R03-01 additively, preserve03, and obtain a bounded independent material recheck. Continue remaining C0 work; no whole-C0 or C1–C6 approval follows from the two boundedly closed corrections.
