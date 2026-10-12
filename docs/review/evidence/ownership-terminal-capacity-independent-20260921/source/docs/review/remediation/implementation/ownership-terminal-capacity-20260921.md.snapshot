# Ownership terminal metadata capacity

Pre-implementation acceptance, 2026-09-21. This follows the metadata exhaustion
finding in the [independent topology review](independent-native-topology-20260921.md).
The drain correction protects known processes when persistence fails. It does
not ensure that an admitted attempt can persist its terminal evidence within an
unchanged metadata quota. This report covers the follow-on admission correction; [independent review](independent-ownership-terminal-capacity-20260921.md) accepts this bounded correction.

## Required behavior

- TC1: New ownership and child admission reserve sufficient bytes for all
  already admitted records to reach their permitted terminal representations.
  Admission uses the same durable store lock as the write. Concurrent admissions
  cannot consume another attempt's reserved terminal capacity.
- TC2: Derive the byte bound from the actual validated representation and
  canonical serializer. Cover JSON escaping, bindings, observations, diagnosis,
  revision growth, host identity, retained children and the enclosing document.
  Do not add arbitrary padding, raise configured quotas, or shorten accepted
  identity/diagnosis inputs to make tests pass.
- TC3: All previously accepted historical formats remain readable. Existing
  records that already exceed the prospective capacity commitment can still
  attempt safe drain and valid lifecycle writes within the actual byte ceiling.
  They cannot authorize further unbudgeted admission. Do not claim that a
  previously saturated store becomes recoverable without available space.
- TC4: Terminal capacity is a byte reservation, not permission to synthesize
  counters, delete history, release a pool reservation early, or skip identity
  checks. Duplicate reservation, CAS, immutable binding and terminal replay
  behavior remain intact. Actual write failures retain the independently
  reviewed safe-drain behavior.
- TC5: Prove the boundary with the real filesystem store and real locking:
  exact-fit and one-byte-short admission; competing owners and children;
  worst-case escaped diagnosis and maximum valid numeric observations;
  reopened stores; and preexisting overcommitted records. Preserve original
  ownership/child/CAS tests and include negative controls that remove the
  reservation or omit a growing field. Scope-method models must be identified
  as such; they are not native kernel evidence.
- TC-DOC: Update the operator runbook, capacity implications, implementation
  status and independent review. Explain why effective concurrent capacity may
  be lower than the record-count ceiling. Keep legacy exhaustion, physical I/O
  failure and unavailable real-host proof explicit.

## Representation constraints inspected before implementation

The current decoder bounds diagnosis at 4,096 UTF-16 code units. JSON can encode
each unit using six ASCII bytes, so diagnosis alone may require 24,578 bytes
including quotes. Valid control characters can reach this bound; counting
characters as UTF-8 bytes is not safe for their canonical JSON representation.
The canonical serializer rejects isolated surrogates even though the diagnosis
field validator does not itself check well-formed Unicode. Preserve that
distinction when testing accepted values and rejected writes.

Bindings contain a fixed-format boot UUID, scope name and nonnegative safe
integer device/inode values. Observations contain five nonnegative safe integer
counters, the fixed `linux-tasks` unit and a boolean. Revision is a positive safe
integer. Identity and existing child names/limits are immutable and their actual
serialized sizes can be charged. A reserved child can acquire a binding later;
future children require separate admission. A null host identity may later become
up to 256 permitted ASCII characters. Historical v1/v2 data decode into the v3
in-memory representation, whose serialized size must be considered on writes.

An implementation may calculate a conservative maximal representation without
persisting it. Such a calculation is accounting only: it must never be exposed
as observed kernel identity or counters. Terminal records with no permitted
future transition need their retained actual bytes, not fictitious future growth.

The existing 64 MiB default and record-count limit are independent ceilings.
Reserving the full accepted diagnosis domain has a material concurrency cost;
that cost must be measured and documented instead of concealed by raising the
quota. Choosing a different diagnostic representation would be a separate
explicit contract change, not a shortcut in this correction.

The criteria above were declared before implementation. Current implementation and validation follow below; no complete native-host acceptance is claimed.


## Admission plan and affected original tests

The implementation will check a prospective whole-document reservation only at
new owner/child admission, inside the existing durable lock. Lifecycle writes
retain their actual byte ceiling. Projection uses validated maximal future
fields, never persisted synthetic observations. Immutable terminal records and
already immutable bindings/observations retain their actual bytes. Document
framing and a future null-to-256-character host identity are included.

Original Prism supervisor consumer tests use an 8,192-byte profile. That profile
remains valid configuration but cannot admit the full existing diagnosis domain.
Its byte cases will explicitly prove rejection. Separate record-count tests will
use a predetermined budget calculated from the representation, not silently
replace the small profile. The fixed-826-byte drain regression becomes an explicit
preexisting-overcommit fixture, because new admissions must no longer reach that
state. Scope-method evidence remains labelled; no kernel proof is inferred.

Legacy null-host stores can fail the required provenance write before supervisor
recovery reaches any group. Readability or permissible lifecycle writes do not
prove complete supervisor recovery. That fence remains intact. Before-source
hashes are in `../../evidence/ownership-terminal-capacity-20260921/before-identities.json`.

## Implemented boundary and validation

`ownership-capacity.ts` projects each active record into its maximum permitted
future serialized representation, one record at a time. The store checks the
whole-document commitment under its existing durable lock before admitting a
new owner or child. Existing bindings and final observations are immutable and
charged at their actual size; unbound identities, revision growth, diagnosis and
observations reserve their complete future domain. Disposed/abandoned records
retain actual bytes. No projected values are written to the store. The actual
byte ceiling remains enforced on every write, and duplicate reservation does
not create another commitment. No quota, diagnosis bound or history was reduced.

The new maintained capacity suite covers owner exact-fit/one-byte-short writes,
concurrent owner and cross-owner child admission, future child bindings, actual
worst-case durable serialization, historical v1/v2/v3 reads and overcommit with
bound/null host provenance. Synthetic maximum numbers are metadata-domain
fixtures, not kernel observations. All filesystem operations and GNU `flock`
are real; `proot` only maps the cached lock binary into its required location.

The authored FS/consumer run passed **27/27**, including all original ownership
and child cases, the adapted historical quiescence case and original Prism
consumer scenarios. The maintained node-pools gate passed **33/35**: its two
unchanged root-owned pool-policy prerequisites fail under this workspace user.
This gate remains red. Scoped canonical lint and the native-suite TypeScript
check exit 0. Prism-wide type validation also passed after the separate Control source
freeze; the independent review records its final command and exit code.

A private import-hook mutation reserves only a one-character diagnosis. Running
the original five capacity tests against it fails at both actual maximal terminal
writes, proving the boundary tests reject a materially undercharged projection.
The independent root serialization probe separately checks 180 validated
representations and equality between the accounting and durable serializers.
It does not replace filesystem admission or the fresh review.

Evidence is in `../../evidence/ownership-terminal-capacity-20260921/`:
`tests-initial.txt`, `node-pools-final.txt`, `diagnosis-mutant.txt`,
`commands-final.json`, `lint-final.txt`, `type-native-final.txt` and final source
snapshots/hashes. Original failed native prerequisites remain visible. The new
suite is included in the node-pools script and native TypeScript project.

## Capacity consequences and remaining limits

The original 8,192-byte Prism profile now explicitly proves preadmission refusal.
Record-count cases use a separately declared representation-derived budget for
N+1 owners; a control accepts N+1 with the same bytes, proving the N-owner refusal
is the configured record limit. The original 826-byte regression now begins with
an explicitly preexisting saturated store; it no longer purports to admit new
work into a state the new policy rejects.

The complete accepted diagnosis alone can consume 24,578 bytes. A 64 MiB store
therefore cannot admit 2,731 simultaneous active owners even before identity,
counters and framing costs; actual capacity is lower and depends on retained
history and children. This is an admission consequence of the existing domain,
not a raised default or a shortened diagnostic contract.

Historical overcommit is readable but can still block terminal persistence at
unchanged quota. Null-host provenance may block supervisor recovery before any
drain. The reviewed identity-checked drain fallback remains unchanged; an I/O
failure still prevents a successful receipt/removal/release. No safe historical
retirement operation or automatic saturated-store recovery is introduced. Full
Buster integration and actual native kernel acceptance remain open. The operator
runbook describes these limits. The [fresh independent review](independent-ownership-terminal-capacity-20260921.md)
accepts TC1–TC5/TC-DOC with its own 27 maintained cases, four filesystem probes,
and two semantic negative controls. Shared Prism typing passed after the Control source freeze. Actual native
host evidence remains separately open.
