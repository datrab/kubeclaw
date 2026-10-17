# Finite journal-envelope reservation definition (partial C0-D)

This supplement concretizes the initial binding proposal's codec-derived bound.
It does not implement a reservation, SDK event, provider, grant or module loader.
Use the [corrected object codec](../codec-correction-04/README.md). Historical
FileJournal hash/framing and entry-key insertion ordering stay unchanged.

## Exact two-step sizing contract

Before reservation, freeze the complete prepared binding-event JSON value:
eventId, occurredAt, identity, all original foundation/owner/content references,
dependencies and policy. No getter/proxy/toJSON/undefined extension is allowed
in target strict records; validate then use existing `snapshotJson`. Only the
following fields remain to be supplied: receipt reference digest/byte count,
binding's internal digest, inner/outer committed sequence and outer previous/hash.
The receipt reference's encoding/schema identity is already fixed by the captured
store receipt codec; it cannot later become an arbitrary string or inline payload.

Build a **sizing copy**, never a business record: set both sequence fields and
receipt object byte count to `Number.MAX_SAFE_INTEGER` (supported numeric domain,
not an operator limit); put a71-ASCII-character sha256 identity in each unresolved
hash slot, including previousHash. Other fields must be byte-for-byte preserved.
Compute `snapshotJson(event)`, then the actual FileJournal envelope order
`{sequence, previousHash, hash, entry}`, `JSON.stringify(record) + '\n'`, and
`Buffer.byteLength(...,'utf8')`. This yields upper encoded-record bytes U for
**that complete frozen prepared event**, including both sequences/hash/newline.
Hash contents have fixed width; null previousHash is shorter; supported safe
positive integers have at most16 decimal digits. Escaping/unicode bytes of every
other string are measured exactly, not assigned a guessed per-character cost.
This bound is not universal across newly added fields, more dependencies,
another codec or mutations to the candidate: those invalidate preparation.

Reserve U logical journal bytes under the original authenticated store authority,
and separately its provider-computed bounded physical/metadata/inode allocation.
The receipt does not hash or authorize a future binding digest. It binds original
run/group/store reservation identity and U. Capture the **actual** receipt object,
verify its codec/schema/digest/size and permission/quota attestation, then compute
binding internal unsigned digest and complete JSON object identity. In the final
synchronous journal callback, get synchronized position n; reject unless n+1 is
a safe supported positive integer. Set inner and outer sequence=n+1, hash actual
entry with current previousHash, measure the whole exact encoded record once
more, and require size≤U **and** original journal/storage policy before append.
Equal inner/outer sequence is a semantic predicate; standalone event shape alone
does not prove it. No await, lock acquisition, new reservation or business
activation is permitted inside that callback. Race winners retain their original
record; loser candidates reconcile their reservations idempotently.

On acceptance, reconcile slack U−actual bytes only after actual journal commit
is authenticated. Crash before reconciliation retains U; replay cannot release
accepted usage twice. Reservation failure never raises the original ceiling.
First-file directory durability still precedes view/dispatch; current file-only
fsync behavior is not a passed directory-durability case.

**Physical metadata is not derivable from JSON.** The captured provider must
support an authenticated bounded allocation/reservation contract, original
principal/root/volume and complete sharing writer set (or a real enforced quota
that excludes unaccounted writers). Capacity/readback/free-space strings are not
such a guarantee. Unknown filesystem metadata, unauthorized writers or missing
provider quota capability deny new admission and stay explicit live input gates.
No synthetic metadata multiplier or increased operator limit is introduced here.
This is store accounting, not a second attempts/remediation/claim budget ledger.

## Observed source controls and future obligations

`check-current-envelope.mjs` executes real unchanged FileJournal appendSequenced
for two synthetic generic records, comparing exact on-disk bytes, original
hash-parser readback and inner/outer sequence. Seven sequence-width cases plus
two sizing/conservation controls produce11 observed passed controls. Bound-record
bytes are retained with Unicode and fixed SDK marker. These generic records are
**not schema-valid bindings or SDK lifecycle events**; their byte proof must not
be promoted to dispatch, grant, crash or quota acceptance.

Required future exact cases supplement `C5-COMPLETE-JOURNAL-ACCOUNTING`: complete
real binding admission at original byte ceiling and1byte over; sequence width
9→10 and previousHash null→hash; pending receipt bytes reaching maximum width;
Unicode escaped content; reject prepared-candidate mutation; reject sequence
overflow; concurrent same-group acceptance; crash after reservation/beforeappend,
afterappend/beforeusage reconciliation; no double release; authentic external
writer/quota denial; whole-record-not-entry-only and reservation-skip mutants.
Use actual SDK-generated binding schema, real journal/store provider, original
foundation and exact complete A/B fixture. Runtime cases remain **not-run**, and
their complete provider/harness joins remain C0 work, not waived by these controls.
