# C0 preparation policy and cleanup binding definition

Evidence-only definition; C3/C5 implementation and fresh acceptance remain required.
Source identities and numbered readers: `preparation-policy-source-read.log`.

## Current authority and proposed policies

The sole proposed author remains `config/components/buster-engine.config.json`,
selected by the single `pipeline.config.json` generation. Add four preparation
fields to that owner, not a separate Core/cleanup author:

| ID / target settings field | Current source | Supported domain and reason | Productive projections |
|---|---|---|---|
| CMP-buster-engine-preparation.attemptLogBytes / preparation.attemptLogBytes | preparation-envelope.ts `limits.logBytes:1` | Current v3 schema integer0..16777216; actual WorkerLogDecoder counts UTF-8 bytes before decode and rejects `WORKER_LOG_LIMIT`. No requirement for1. | preparationEnvelope for stage/extract/historical and preparationCleanupEnvelope; actual WorkerAttemptExecutor and terminal native binding compare accepted limit. |
| CMP-buster-engine-preparation.attemptEvidenceBytes / preparation.attemptEvidenceBytes | preparation-envelope.ts `limits.evidenceBytes:1` | Current v3 schema integer>=0, **no schema upper bound**. Proposed loader additionally requires exact nonnegative safe integer because shared evidence collector sums numeric artifact byte counters; this is numeric precision, not a physical pool size or invented Buffer maximum. Aggregate addition must remain safe or reject, never wrap/round. | Same producers; executor checkEvidence compares aggregate artifact bytes; checkWorkerNativeResultBinding checks reported sum and accepted evidence limit. |
| CMP-buster-engine-preparation.attemptEvidenceFiles / preparation.attemptEvidenceFiles | preparation-envelope.ts `limits.evidenceFiles:1` | Current v3 schema integer>=0, **no schema upper bound**. Proposed exact nonnegative safe integer as a numeric count ceiling; consumer only compares evidence array length, not an allocation request. Do not invent host capacity. | Same producers; executor checkEvidence and terminal native binding compare length, reject duplicate evidence IDs. |
| CMP-buster-engine-preparation.completionPhaseAllowance / preparation.completionPhaseAllowance | preparation-envelope.ts, preparation-native-phase.ts, preparation-cleanup-execution.ts all `8*cleanupTimeoutMs` | Proposed integer>=4 for **the enumerated three host operations only**, coupled `timeoutMs + allowance*cleanupTimeoutMs <= 2147483647` and exact safe arithmetic/date.4 derives actual WorkerAttemptExecutor base3+cleanup1; retainLogs=false, no collectEvidence/finalizeResult in these three operations.8 is current operator headroom, not a contract-required phase count. Upper allowance is `floor((2147483647-timeoutMs)/cleanupTimeoutMs)` from actual native process timer validator; no arbitrary count maximum. Any added hook changes the relation and requires review. | One computed total alias used for claim expiresAt, queueDeadline and parent native process timeout for normal/historical and source cleanup. Existing timeoutMs/cleanupTimeoutMs remain sole CMP authors; do not copy either into a new default. |

The two safe-integer proposed predicates apply only to comparison/count thresholds
and precise aggregate accounting; they do not revive the removed universal
safe-integer domain for buffers, recursion, node traversal, timers, or journal
metadata. Current contracts may schema-accept unsafe integral Numbers; proposed
settings validation must reject them before construction and materialization.

Current stage/extract, historical-import and source-cleanup hosts all explicitly
pass `retainLogs:false`, implement cleanup/measure, do not implement
collectEvidence/finalizeResult/storeFullLog, do not call context.log and return
`evidence:[]`. Therefore the three1 quotas are **currently dormant policy
ceilings**, not evidence/log enablement switches and not measurable host behavior
knobs. Changing1 to0 produces the same current empty output, not F-EFFECT proof.
Migration must retain selected1 if adding explicit authors. Future productive
logging/evidence behavior cannot be claimed until an actual emitting operation is
approved/implemented and measured; latent Core predicate checks are separately
labelled C0 definitions. No invented logging adapter is presented as current code.

All accepted envelope fields and copied preparation settings are captured at
admission. Stage/extract/historical consumption uses envelope.operation.values.settings;
cleanup consumption uses its durable association.settings. Three hosts' false
retention is an explicit role API projection, not an omitted Core default. A future
required retention author must choose and pass explicit policy; current role false
must not accidentally become Core's omitted true.

## C5 cleanup module and state transition

Define one **source-cleanup module per original preparation effect**. The original
stage/extract attempt/module remains separate. Fresh cleanup successor attempts
are retries inside this cleanup module, not permission to pick a new generation.
No reset of the original attempt, run grants, consumed budgets, published source,
uncertain-effects state or original claim occurs. Current retry creates new claim
identity intentionally; it is not recovery-renewal of the original claim.

1. **Original closure O/G_A:** retain exact original envelope (including claim),
   accepted profile/grants/budgets, archived native process, sealed result R_A and
   receipt. Original cleanup must be failed, result binding valid, ownership
   disposed with bound final observation `populated:false`. Code boundary:
   `reconcileNativeCleanup`/`quiescentOwner`. Published/released/ineligible source
   cannot become a cleanup target. Source effect E retains originalEnvelopeDigest,
   admissionId, exact gate device/inode/slot/marker and data device/inode/uid.
2. **Eligible but not bound:** while root lifetime/publication fence holds, choose
   a complete valid generation G_B for the *first* cleanup module only. Normal mode
   may use the selected active valid generation, fixed Eval must use fixed G_A.
   Host trust paths/node/cgroup/slot and durable store capacity remain service/run
   bindings; a module cannot repoint physical source authority or reduce storage
   beneath retained closure. Compatible supported cleanup engine/profile identity
   must be captured; no latest engine substitution for historical receipt recovery.
3. **Durable pre-dispatch binding B:** existing `reserveCleanup` association is the
   correct persistence boundary to extend with immutable config generation/file
   hashes/complete selected policy closure, cleanup module ID, original O/R_A/E
   digests, engine/profile closure, predecessor pointers and accepted counters.
   Association.settings is a projection of G_B; all envelope limits/resource
   budgets and command/channel settings must match that same projection. Validate
   entire closure before fsync. No second CONFIG author. Runtime parsing does not
   select config. A missing/invalid generation/history fails closed.
4. **Crash before B:** no cleanup process may launch; retry can select a valid
   permissible generation. A bad concurrently published generation cannot create
   a partial association. **Crash after B/before dispatch:** reopen B/G_B and
   dispatch that exact envelope/settings/host closure, never current G_C. Current
   `reconcileSource` already executes a previous association when no journal
   attempt exists; C5 must load its bound closure rather than options.settings.
5. **Accepted cleanup C0:** fresh random attempt/claim generated once from captured
   G_B, not copied from original claim. `nativeSourceCleanupOperation` carries
   original full-envelope digest, attempt/spec/profile, worker/claim/generation,
   resultDigest/receipt and effectsDigest. `preparationCleanupEnvelope` binds this
   operation and new profile. Full-envelope digest matters because specDigest
   excludes claim. Journal accepts before launch; `acceptedLimits` matches exact
   resource budgets and original C0 claim/queue. Assigned cleanup environment is
   immutable generated `{effects,settings}`, not an ENV author.
6. **Crash during/after launch:** existing journal/owner/archive lookup and
   `recoverPreparationCleanup` recover C0; a cached/sealed receipt is reused;
   unknown/alive/unquiescent ownership cannot launch C1. Started C0 stays G_B.
   Fences remain until exact recovery/reconciliation proof; no config change
   unfences admission or manufactures final kernel observations.
7. **Failed quiescent predecessor C0:** persist its original failed receipt
   write-once using recordCleanupResult, verify disposed/empty owner or proven
   never-launched+not_required. If retry is permitted under captured policy,
   construct fresh C1 claim/attempt using **same G_B** (not G_C), with exact same E
   and original O/R_A plus previousEnvelopeDigest/resultDigest. Append association
   and charge its additional metadata/record/storage use before dispatch.
   Retry number/allowance and any run/module budget consumption remain persisted;
   no retry resets them. Existing resourcePolicy is **per native attempt tree**:
   CPU counter is per attempt, memory/tasks are peaks, not invented cumulative
   limits. Keep each attempt's observations/ceilings and recorded run-level
   consumption; do not silently reinterpret peaks as additive budgets or invent
   missing global amounts. No current retry-count CONFIG is inferred from this
   definition; current maximumRecords/metadata/source reservation are real bounds.
8. **Deadline distinctions:** recovered C0 keeps exact claim/queue. C1 receives a
   fresh claim because it is a distinct admitted attempt; this does not extend
   O's original claim, cancel run deadline or reset retry/run budgets. A configured
   module/run absolute deadline (if present in the selected owner) caps new claim
   before dispatch; no absent deadline is invented. Fixed Eval uses captured
   generation for C0 and C1 alike. Publish G_C may affect only a different
   eligible unstarted module, never this retry sequence.
9. **Successful cleanup receipt Cn:** verify archived process exit0/no signal/no
   fault, valid bound native result `completed`, cleanup `completed`, exact owner
   final observation equal archived kernel observation, and specialist result
   `reconciliationDigest=hash(cleanup.operation.values)` through
   verifyNativeSourceCleanupResult. Reuse actual finalizer and compare result
   digest; child exit, pathname absence or separate forged success is insufficient.
10. **Release:** only after proof above remove exact empty gate/marker and persist
    ledger phase released, slotReleased, zero reserved source bytes/entries.
    Record O/R_A and every failed predecessor unchanged. Successful cleanup is
    additional proof, not rewriting original failure to success. Replay of a
    released source returns retained result/proof without another process.
11. **Cleanup-of-cleanup resolution:** resolveFailedNativeCleanup is lookup-only;
    locate successful successor with same E and different fresh identity, verify
    original+failed+successful bindings/quiescence and exact success. Never
    recursively launch cleanup of cleanup. Missing pointers, changed effects,
    receipt mismatch or version incompatibility fails closed without current
    config filling a gap.

### Current versus target validation limits

Existing validatePreparationCleanupChain checks original identities, effects/gate,
predecessor pointers, distinct attempts, valid complete settings and envelope;
Core admission checks selected process CPU/memory/tasks against accepted budgets.
It does **not** prove every association setting is the same original generation
projection, nor durable generation/Eval/module/retry policy binding. A valid but
changed maximumOpenFiles in association.settings can pass current chain schema:
C5 must compare the recorded projection/closure before command construction.
This is a current CONFIG-binding gap with an exact target case, not a claim that
old code validates more than it does. No production repair occurs in C0.

### Concrete acceptance partition

C0 actual source/definition checks exercise real existing producer/schema/decoder/
cleanup-chain functions only; no child/DB/kernel dispatch. Proposed C3 policy
VAL/projection/current-dormant cases and C5 crash/publish/recovery/retry/release
cases are in preparation-policy-binding.json and residual-fragment.json, all
not-run until approved implementation. Host cases require genuine disposable
root/delegated cgroup/source authority; synthetic identities are never live PASS.
