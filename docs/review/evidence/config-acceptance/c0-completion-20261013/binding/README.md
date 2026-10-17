# C0 completion work: durable binding target contract

Author-side proposal, not reviewed/accepted; no production or SDK changes.
Read the original [goal](../../../../remediation/OPENCLAW-CONFIG-GOAL.md),
[source seam map](../../author/nova-current-binding-seam-map-20261013.json) and
[original-first correction](../../author/nova-carrier-01-correction-20261013.json).
The schemas here describe new generated target records, not current accepted
SDK events. They are never a second editable configuration author.

## Actual producer, consumer and migration boundaries

`project/compiler.ts::compileProject/moduleStages`, `source.ts::sourceStages`,
`coverage.ts::cumulativeStages` and `demo.ts::demoStages` generate membership.
Every actual executable stage is assigned once to foundation, implementation,
integration or delivery group. Optional stages are enumerated only if generated.
Explicit graphs must provide the same exact membership declaration. Membership
is authenticated by the original task graph digest, not guessed from stage IDs.
`on.request_fix` stays within its declared group; an explicit cross-group repair
relation must name an existing original group and cannot recreate it as unstarted.

The current `pipeline-definition.v2` is not silently rewritten. The target adds a
new explicit `pipeline-definition.v3` with task graph, membership and per-stage
owner instance references; its graph digest covers task input, dependencies,
activation, remediation and field partition. `config` values in v2 and historical
snapshot v1–v4 remain pinned values, not profile references. The new target
`run-snapshot.v5` records the complete original R/S/H closure and task graph v4
codec; actual schemas/readers/generated SDK contracts need a coordinated C2/C5
implementation. Old graph/snapshot/SDK codec hashes are preserved byte-for-byte.
These target version names are proposed new contracts, not current support.

`engine-run.ts::runNewPipeline/recoverPipeline/resumePipeline` must resolve the
authenticated original run locator and snapshot before activating packages.
`engine-runtime.ts::prepareRuntime` is split into effect-free discover/validate
and actual activation; merely calling current prepareRuntime then checking
snapshot equality is insufficient. Run discovery/storage authority is bootstrap
S/H configuration, not module B. A storage-root change requires explicit drain/
relocation with verified retained-run mapping, never a fallback search in B.

`pipeline-loop.ts` resolves first binding before `stage.started`, `stage.skipped`
or observer delivery for its group. `stage-executor.ts` receives a frozen stage
consumer projection from that binding, not a mutated pinned graph. Every
`definition.config`/execution limit reader must choose its explicitly partitioned
source; no spread/overlay retaining an alternate task-authored operator value.
Adapters/observers remain R-scoped. Their package config cannot reload per stage.
Actual plugin target selection still uses its real adapter configuration, not
the SDK's two-field RuntimeDispatchProfile encoding marker.

## Strict records and referenced payloads

`target-contracts.schema.json` has separate strict definitions for membership,
object identity, physical-store grant, retained foundation and binding acceptance.
It describes all allowed fields with no generic extension object. Referenced
owner payloads use the captured real owner/registration schema digest and exact
validation map. Content bytes, schema identity, length and declared codec are
verified, not trusted because a digest-shaped string parsed.
Names are opaque identities; storage paths derive from SHA-256, never from an
untrusted supplied filename. References cannot escape the original storage root.
Secret bytes are forbidden; an exact store/secret/revision/access-policy reference
is bound and must be resolvable without selecting latest. Missing backend support
is a live capability gate, not permission to fabricate revision identity.

Structural schema alone does not prove semantics. Acceptance also requires:
membership exact coverage/no duplicates, graph/partition equality, all object
digests and schemas, authentic allowed owner/instance/registration mapping,
grant/provider/role/capacity provenance, generation file-set conservation,
fixed-mode equality and original run-budget/history compatibility. Schema-valid
but missing/mismatched references reject before activation with no effect.

## Accounted durability and physical authority

Generated immutable objects reside below the original run-owned storage root.
Publishing uses exclusive temporary writes, file fsync, no-replace hardlink and
directory fsync as the existing snapshot writer does. Complete candidate closure
is durably published before binding append. Orphan candidates have no business
authorization; their separately journalled reservation survives crash and is
released only after confirmed no binding/reference/uncertain effect uses them.

Physical provider capacity and permissions are **not** obtained by aliasing a
Corpus/envelope/output ceiling. A captured authenticated store grant names the
real provider, volume, principal, permitted root, capacity/readback evidence and
required logical/temporary/final/metadata/inode ceilings. The foundation binds it
before action. Declared ceilings are required operator values satisfying actual
provider constraints; no invented deployment capacity or numerical default.
All writers sharing the store participate in one reservation/reference ledger.
Per-reference logical bytes count even on deduplication; physical bytes count
unique retained objects plus temporary writes and actual metadata separately.
Existing objects and external writers must be accounted or the grant is denied.
Refcount/release is atomic under the original store authority. Cleanup cannot
delete another run/module's referenced object. Live capacity/permission attestation
and external Secretstore revision resolution remain real environment gates.

For the binding journal, reserve the final SDK-envelope/hash-record UTF-8 size
including sequence, hash, newline and filesystem metadata before append. Sequence
comes from the synchronized committed position, not precomputed preparation.
The reservation receipt precedes the binding and must not reference its final
digest (which includes that receipt). Prepare immutable referenced objects and
event identity, then reserve a codec-derived upper bound: fixed hash/digest widths,
actual event/payload string encodings and maximum supported safe-integer sequence
width. Receipt-reference byte width is bounded by the same explicit codec, not a
guessed constant or an increased operator ceiling. Inside final acceptance compute
the actual whole record and require it to fit the retained reservation and original
limit. After durable acceptance, reconcile actual usage and release only verified
slack idempotently. Interrupted reconciliation retains reservation, never double
charges or frees accepted metadata. Overbound rejects before append.
Quota reservation and binding journal are separate durable records, not a fake
two-journal transaction: reserve under the original store mutex first, release it,
then accept under the run/journal mutex. No await or store lock acquisition inside
the journal callback. Original run ownership serializes acceptance; shared-store
reservation ownership serializes competing writers. Recovery uses receipt identity
plus original journal evidence to resolve orphan versus accepted reservation.
No operator limit is enlarged to fit binding; insufficient grant/journal policy
rejects admission. An accepted binding is retained under original R retention.
The first events.jsonl creation requires directory durability before any delivery.
Existing FileJournal.transact is synchronous exclusion, not rollback; validate
everything before one complete append and never await inside its callback.

## Original-first transition and failures

1. Under original run authority and lease, inspect original snapshot/history and
   binding before reading or validating current B. Existing A always resolves A,
   even if B is absent or malformed. Missing history after any business/uncertain
   action rejects/reconciles; it never makes that group unstarted.
2. Only genuinely unstarted groups may parse a single immutable candidate.
   Fixed Eval selects its recorded explicit generation. Validate complete schema,
   owners, delivery, R/S/H equality, field applicability and grants outside the
   synchronous append callback; no activation/business effect during preparation.
3. Durably reserve/publish closure, recheck lease and history while serialized.
   A competing accepted original wins. Append one fully validated binding at
   the final sequence, fsync and establish directory durability.
4. Deliver its view idempotently under original observer policy. Required delivery
   failure retains the binding and blocks dispatch; optional failure has an
   explicitly recorded original policy outcome. Do not discard flush outcomes.
5. Activation/stage/effects/skip notification can now consume only this closure.
   Retries, repairs, waits, reconciliation and original cleanup retain A and used
   budgets/claims/deadlines. Cleanup of a distinct preparation effect may itself
   have a separate admitted cleanup module, but its original source/grant/effect
   references and later cleanup retries never reload B.

Crash before binding permits another candidate only after original reservations
and effect history are checked. Crash after binding retains A. Crash after effect
dispatch reconciles actual external outcome before replay. Concurrent publication
is complete A or B, never mixed owners. Loss of async lease aborts before append,
view, activation or effects; TTL alone is not proof of ended work.

Legacy completed runs can replay result/evidence without new action. Pending or
uncertain v1–v4 runs retain their captured legacy runtime and original contract
until verified drain/reconciliation. They cannot gain M tuning by guessed closure.
Explicit administrative upgrades/reopens keep their existing authorization and
recorded package identity rules; ordinary B publication creates no override.

## Field partition is an explicit remaining join

Membership and typed closure are not enough: every existing field must map to
task input, original run foundation, startup/host, or eligible module/plan tuning.
The domain overlays must enumerate those mappings against actual readers before
this proposal can close C0-D. The present proposal makes no blanket claim that
all `stage.config` or all plugin policies are M-applicable. Unavailable exact
field domains/source dispositions remain C0 work, not implementation-only gaps.

`future-cases.json` records precise proposed failure windows and oracles.
All are implementation-not-run. Definition/schema controls, when run, validate
this document's shapes only and are not real F-BIND, process-kill, grant or
physical-capacity acceptance. Fresh independent whole-C0 review remains required.
