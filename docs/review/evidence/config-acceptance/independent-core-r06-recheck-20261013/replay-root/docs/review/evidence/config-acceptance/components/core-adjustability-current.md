# ICD001–004 corrected C0 component definition (review pending)

Supersedes const-only *tunability closure* in `core-policy-domains.md`. The latter
and its checks remain historical value-preserving migration evidence. No scope
reduction, implementation, F-EFFECT or C0 acceptance is inferred. All original
requirements remain active in the machine case ledger.

## Supported target domains and complete profiles

Required sole worker-core owner policies have the following **bounded adjustable
proposal**. Current code still uses literals: these are not claims that today's
CONFIG loader accepts the new fields. Complete six-owner A/B generations are in
`core-adjustable-profiles.json`, validated by the separate proposed-definition
check. Numeric cap reductions only tighten existing comparisons and cannot
increase clone/stack/log/file/state allocation beyond the current supported cap.
Positive current-reader controls and relevant schema/capacity relations are linked;
no universal safe-integer, Buffer, stack or host-capacity range is inferred.

| Policy | Target supported domain | A / B and meaningful real-boundary witness |
|---|---|---|
| input_bytes | integer12582912..16777216 |16MiB/12MiB; same14MiB encoded valid Core envelope rejects lower BYTE_LIMIT before clone, passes upper constructor; role ingress/journal bounds independently above witness or separately tested, never attributed to Core if they reject first. |
| json_nodes | integer75000..100000 |100000/75000; same87500 visited values in nested arrays each<=1024, depth below48, bytes below12MiB; lower NODE_LIMIT, upper admitted. No100000-item invalid schema array. |
| json_depth | integer48..64, root0 |64/48; same valid deepest depth56, node/bytes below both; lower DEPTH_LIMIT, upper accepted before recursive freeze/hash/schema. |
| log_parts | integer7500..10000 |10000/7500; same7501 one-char context.log calls produce7501 split wire chunks under both byte budgets; lower terminates WORKER_LOG_LIMIT, upper completes. Also one65537-unit callback splits into2chunks: counting is wire chunks, not callbacks. Real Buster providerContext forwards provider logs into Core. |
| drain_poll_ms | integer10..20 |10/20; actual NativeWorkerResourceScope uses delay=min(selected cadence, remaining absolute monotonic deadline). Both far below real signed32 timer ceiling;20 reduces polling work, does not extend deadline or relax kernel-empty proof. Genuine delayed owned child/drain timestamps distinguish cadence; no fake cgroup. |
| pool_file_bytes | integer32768..65536 |65536/32768; identical root/nonwritable/nofollow valid generated policy padded49152bytes; actual FD reader upper parses, lower rejects NOT_TRUSTED before parse. Positive minimal generated document below32768 reaches same parser. No kernel capacity/placement claim from parser. |
| runtime_identity_file_bytes | integer2048..4096 |4096/2048; identical actual boot/ns identity document padded3072bytes; upper actual /proc compare passes, lower preparse NOT_TRUSTED. Minimal genuine identity below2048 positive. |
| node_identity_file_bytes | integer64..128 |128/64; identical root UUID file padded96bytes, upper trim/domain passes, lower rejects NOT_TRUSTED. Actual32/36-char UUID+newline fits64. No physical Kubernetes node proof. |
| journal_record_bytes | integer32768..65536 **with terminal projection relation** |65536/32768; B also uses journal diagnostic2048 so maximal future payload fits32768. Behavioral witness is **admission reservation**, not impossible oversized new payload: identical retained crash blobs leave available total between input+output+result+recordBytes+2state totals; A rejects CAPACITY_EXCEEDED, B admits. Actual record cap/store/future reservation all same author. |
| journal_diagnostic_units | integer2048..4096, UTF16 |4096/2048; terminal reservation differs (two possibly6bytes/unit escaped diagnostics). Select same80000-byte state budget: first admission valid both; second pending admission lower admits, upper METADATA_CAPACITY_EXCEEDED. At process/state API,3072-unit diagnostic accepted upper/rejected lower. Never reject retained upper history merely because latest is lower. |
| ownership_diagnostic_units | integer2048..4096, UTF16 |4096/2048; new actual diagnosis3072units clips only lower. At actual storage-component boundary, same two reserved ownership records/40000-byte store between exact terminal projections admits lower/rejects upper; no full journal/pool admission claim. Producer slice/toWellFormed, retained validator and capacity projection use one selected author; original uncertainty remains. |
| journalLockHexDigits | enum1,2 **versioned service/root routing** |2/1; keys ending different2hex/same1hex may overlap under2, serialize under1.1 has16 potential stripes vs2 has256, both bounded by current cardinality. Width never changes while old peers/accepted work can overlap. Detailed transition below; no arbitrary1..64 domain. |
| retain_logs | required six-instance boolean projection |Current native=true, agent=true, provider/preparation/historical/cleanup=false. Two complete A/B profiles toggle native+agent true/false with their actual writers/claim slack. Four Buster dormant/no-full-writer paths retain explicitfalse controls; toggling retention cannot invent a writer, logs or claim slack. Boolean API supports true/false, but no dormant host EFFECT claim. |

All integer values in the stated cap intervals are at or below an already used
cap; examples at endpoints/midpoints are source safety controls, not proof every
new CONFIG projection is implemented. File limits operate before read/parse on
trusted immutable files; authorized host producers/readers must consume matching
selected projections. Buffer/string ceilings are separate runtime identities.
Drain interval is the only increased cadence value: bounded20ms remains a timer
comparison/clamp with fewer reads and identical absolute deadline/empty oracle.
The journal cap reduction is coupled, not a standalone32KiB+4096diag profile.

### Exact record/diagnostic safety relation

For each admitted identity, use actual canonical future terminal metadata
projection (maximum valid contract identity fields, selected output/result sizes,
selected diagnostic units, maximal numeric/date representations) and require
`byteLength(futurePayload)<=journal_record_bytes`, then framed record/state/foreign
rows within captured state cap. Charge actual crash leftovers+pending reservations+
input+maxOutput+maxResult+selectedRecordBytes+twoStateCopies within total and safe
sum. Stage complete-profile checking uses a conservative maximal ASCII stableId256,
two escaped diagnostic strings, numeric/blob/date fields; it does not persist
synthetic observations. A32KiB record profile with4096-unit diagnostics is rejected
if its projection does not fit; the B32KiB/2048 pair has positive control.

Diagnostic caps govern **new** accepted instance/record closures. Reading,
recovery, retry and terminal sealing use the original closure. Publication cannot
invalidate4096-unit retained rows or lower reserved capacity silently. Exact C5
history/budget cases remain active. No current upper-bound field is relabelled
protocol invariant to bypass meaningful tuning.

## Journal routing transition (required versioned contract)

Persist an immutable generated `native-journal-routing.v1` root record with root
binding, epoch, config-generation digest, width1/2, digest algorithm/key grammar
and routing digest. It is a projection of the sole Core width author, not another
settings file. Current legacy implementation is known width2 only: migrate it
explicitly under quiescent exclusive root ownership; missing arbitrary history
is never filled from current config.

1. All productive journal participants obtain/verify the root routing closure
   before selecting a stripe; no request/module can choose a different width.
   NativeWorkerOwnership.supervise already holds FileWorkerOwnershipStore
   `supervisor/lifetime` flock across recovery/admission. Journal `admission/lifetime`
   fence is the actual reservation/publication serialization point. Extend these
   existing responsibilities, not HTTP/stage reload or an independent lock owner.
2. Width epoch remains S/R-stable while the supervisor, any participant/stripe
   lock, unresolved ownership or accepted nonterminal attempt exists. Started
   modules retain original closure; ordinary config publication cannot split
   same-key serialization across old/new paths.
3. Transition after admission fenced, old participants stopped/excluded and real
   ownership/journal recovery proves no live/unresolved/nonterminal work needing
   old execution. Hold exclusive supervisor+admission fences, validate new complete
   generation and width, persist/fsync routing epoch **before** any new stripe
   entry/admission. Existing terminal receipts/keys/claims/grants/budgets unchanged.
4. Mixed legacy/new images or an old actor holding a lock blocks transition. Every
   new actor must verify epoch before effect; stale/mismatched manifest fails
   `WORKER_NATIVE_JOURNAL_ROUTING_CONFLICT`. No simultaneous old-width and
   new-width same-attempt dispatch. Crash before publication retains old epoch;
   crash after fsync reopens exact new epoch, not latest profile.
5. Record/claim identity hashes do not change with width. Terminal historical
   replay resolves original config/receipt history without reexecution. Old lock
   directories may be retained/count toward disk capacity; removal requires proof
   no holder, not pathname presence alone. Recovery requiring old nonterminal
   execution postpones migration rather than borrowing new routing/policy.
6. Repeated concurrent same-key admissions serialize under each epoch; keys with
   same trailing1 but different trailing2 demonstrate materially different
   concurrency. Publish/crash/stale-peer/history/Eval cases separately prove no
   split routing. Fixed Eval cannot select different routing while active.

This is an implementation contract, not existing manifest/epoch support or a live
migration claim. Width1/2 both have exact task-preserving positive definitions.

## Six real retention constructors and phase relations

| Instance | Actual constructor | Current retain / writer | Actual Core nominal completion phases |
|---|---|---|---|
| prism-native | skills/prism/server/native-worker-host.ts | omitted=>true; artifacts.upload full log |base3+fullLog1=4; operation has no cleanup/collect/finalize |
| prism-agent | skills/prism/server/agent-job-runner.mjs | omitted=>true; artifacts.upload full log |base3+fullLog1=4; actual AgentProcess measure/terminate, no cleanup/collect/finalize |
| buster-provider | skills/buster/engine/test-gates/runner-attempt-execution.ts | false; no Core full-log callback |base3+cleanup+collectEvidence+finalizeResult=6 for current runner operation |
| buster-preparation | skills/buster/engine/test-gates/preparation-host.ts | false; no log calls/writer/evidence |base3+cleanup1=4 |
| buster-historical-import | skills/buster/engine/test-gates/preparation-historical-host.ts | false; no log calls/writer/evidence |base3+cleanup1=4 |
| buster-source-cleanup | skills/buster/engine/test-gates/preparation-cleanup-host.ts | false; no log calls/writer/evidence |base3+cleanup1=4 |

Author `worker-core.settings.runtime.retain_logs` is an explicit per-instance map,
not blanket currentValue=true. No absent role key gets omitted API true. Two
Prism writers reach actual artifact store/log evidence; false still enforces
UTF8/framed bytes/wire chunk count. Full-log phase exists only with true AND real
storeFullLog callback. Claim window must cover startup elapsed time plus actual
operation timeout+completion phases*cleanup; nominal minimum alone is not enough.
Agent claim16min and900000ms operation/10000cleanup are distinct parent policy
IDs; native Prism claim10min and its separate phase allowance likewise retain
original authority. Buster claims use own producer formulas, not a Core default.
Four Buster no-writer/empty-feature cases specify current dormant controls;
future output/sink enablement requires real registered writer and sufficient
captured envelope/claim budgets, never a test-only emitter declared production.

## Corrected case lifecycle and remaining gate

Every case has machine `lifecycle.state`, required flag, supersession links and
preserved requirement IDs.39 finite-only future proposals are superseded; old
numeric A/B EFFECT IDs remain active with the new supported complete pairs.
Actual definition checks remain narrow active C0 observations, not future runtime
acceptance. Exact structured proposed executable+argv/environment, case selector,
boundary/input/prior-state/oracles are in `active-case-specifications.json`.
Future harness paths are explicit implementation prerequisites (not created in C0);
no empty/skipped/missing harness can PASS. Unsupported old numeric profiles and
raw failures remain historical artifacts.

Additional roots total **75**, not the report's85:21+9+13+13+12+7=75. Direct
registry/reference enumeration exactly matches the independent expected-coordinate
file; no ten fields invented. Registration/health actual Buster runtime and log
Core callers are linked. Progress is generated only with callback (six current
constructors omit it). Trust/cancellation wrappers are exported contract-only
surfaces with audited no service caller; current SPIFFE auth and local cancellation
policy are different contracts. Existing unchanged contract tests passed all12
root definitions; this does not manufacture productive trust endpoints.

Nits corrected: diagnostic wire `$defs.nonEmptyString`, receiptId `$defs.stableId`
versus distinct optional receiptNamespace predicate; split-wire chunks; current
evidence min0/no max versus **proposed** safe precision. Independent material
recheck still required. No C0 acceptance, implementation or scope waiver.


### Exact source-order and future serialization limitations

Drain observation precedes the remaining-time test in the actual loop: a genuinely
empty scope observed after nominal deadline can return successfully. The proposed
10/20ms policy preserves that source-order contract; it is not a strict wall-clock
termination guarantee. Both retain the same monotonic deadline variable and real
empty proof.

The current terminal-payload definition controls serialize the present native
record shape only. New immutable CONFIG/source bindings must be included by the
approved future full serializer before admission; the active record/projection
cases require complete future payload size to fit the selected quota, including
those bindings. The26 definition positives do not prove that future representation.
No historical binding may be inferred merely from schemaVersion; missing original
closure or uncertain nonterminal legacy state blocks routing migration/recovery.
