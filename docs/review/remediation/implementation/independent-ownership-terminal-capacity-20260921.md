# Independent ownership terminal-capacity review

Accepted for the bounded metadata correction TC1–TC5 and TC-DOC on 2026-09-21.
No actionable defect was found in the frozen implementation. The reviewer did
not modify production or author tests. This does not accept the native-host gate,
complete saturated historical-store recovery, or broader NT2/F6 integration.
Prism-wide TypeScript validation also passed after the concurrent Control author
confirmed a coherent source freeze (`prism-types.txt`); the native-suite check
remains separately recorded.

The [preimplementation criteria and author report](ownership-terminal-capacity-20260921.md)
were read before review. Independent evidence and exact commands are in
[`ownership-terminal-capacity-independent-20260921`](../../evidence/ownership-terminal-capacity-independent-20260921/).

## Fresh execution

- Maintained ownership, child, quiescence, terminal-capacity and Prism supervisor
  consumer suites: **27/27 passed**, no failures, skips or cancellations
  (`maintained27.txt`). This includes global competing-owner and cross-owner
  child admission, historical v1/v2/v3 reads, replay/CAS behavior and the explicit
  8,192-byte downstream refusal.
- Four separately authored filesystem/consumer probes: **4/4 passed**, no skips
  (`independent-filesystem.txt`). Their expected maximum documents do not call
  the production capacity function. They independently cover maximum escaped
  identity strings, exact-fit and one-byte-short owner admission, actual maximal
  lifecycle persistence and reopen, two separate Node processes competing for
  one owner's capacity, and child admission/binding exact-fit and one-byte-short.
- The fourth independent probe exercises actual supervisor ordering against a
  preexisting saturated null-host store. Scope inventory and pool verification
  are explicitly mocked. The real durable provenance write fails before the
  admission callback or recovery mutation, leaving original bytes unchanged.
  This is a consumer-ordering model, not evidence of kernel recovery or drain.
- Private loader mutations removing admission reservations or omitting future
  observation growth both fail the independent one-byte-short assertion with
  `ERR_ASSERTION: Missing expected rejection` for `CAPACITY_EXCEEDED`
  (`mutant-admission.txt`, `mutant-observation.txt`). These are semantic assertion
  failures, not import/setup failures. No source file was mutated.
- The native-suite TypeScript project and canonical ESLint over the three changed
  production modules and directly relevant maintained tests pass
  (`native-scope-types.txt`, `lint.txt`).

The tests use the original filesystem store and actual GNU flock via the cached
proot binary binding, with concurrency serialized. Exact command arguments,
environment additions, timing and exit codes are in `results.json` and the
reproducible runner. The independent probe and loader received conventional
formatting after their initial pass; both positive and negative runs were then
repeated on the final bytes. Earlier outputs are retained with `-preformat` names.

## Source and contract review

TC1: Both new-owner and new-child admission perform the whole-document capacity
check while holding the existing durable store lock and before the write. The
check includes every retained owner. Duplicate reservation returns its existing
record without a second commitment; child CAS and binding identity checks remain
in place. The cross-process probe confirms that two competing admissions cannot
both consume the same byte headroom.

TC2: The bound uses canonical serialization, including document delimiters and
record separators. Existing identity strings, scope/child names, limits and
immutable bindings/observations retain their actual encoded size. Future fields
include the full 4,096-unit diagnosis at six JSON bytes per unit, 16-digit safe
integer revision/counters/device/inode, fixed boot identity, future child binding
and a 256-character null-to-bound host identity. `populated: false` is the longer
permitted terminal boolean representation. Terminal disposed/abandoned records
cannot transition and retain actual bytes. Future observations and bindings are
accounting objects only; the original state is written without those synthetic
values. Per-record serialization avoids constructing one huge maximum document.

The independent exact-fit tests attain the expected maximum through the actual
writer. Explicit valid near-maximum historical revisions avoid billions of
transitions; numeric values are metadata-domain fixtures and never represented
as observed kernel counters. Input identity and diagnosis domains were not
shortened, and the configured 64 MiB default and record ceiling were not raised.
The parent's 180-case serialization probe and author's diagnosis mutation are
additional evidence; neither substitutes for this review's filesystem checks.

TC3/TC4: Prospective commitments apply to admission, while lifecycle writes keep
the original actual-byte ceiling. Historical overcommit remains readable and
replayable, but cannot fund a new owner/child. It may still be impossible to
persist a terminal representation at unchanged quota. Null-host provenance can
fail even before supervisor recovery reaches drain. Original safe-drain ordering,
no removal/release after a retained drain or quiescing-write failure, immutable
final observations, identity
checks and terminal replay remain intact. The child validator and native ownership
consumer are byte-identical to their preimplementation snapshots.

TC5: The original ownership-store and owned-child test files are byte-identical
to their preimplementation snapshots. Quiescence assertions remain in place;
its former newly admitted 826-byte saturation fixture is now explicitly installed
as a preexisting historical store, as required by the predeclared plan. The Prism
8,192-byte profile is retained and now proves refusal. Record-count tests use a
separate representation-sized budget for N+1 records and an N+1 success control,
so their rejection still establishes the record ceiling. These changes expose
the intended new admission behavior rather than weaken its checks.

TC-DOC: The frozen runbook replaces the former no-reservation claim with the
actual lock/reservation behavior, capacity cost, historical provenance failure
and physical-I/O limits. The implementation record explains that diagnosis alone
prevents 2,731 active owners fitting in 64 MiB even before other metadata, despite
a higher record-count ceiling. It retains the red native prerequisites and
integration limits instead of treating byte accounting as native acceptance.

## Source binding and open gates

`source-identities.json` independently verifies the author's final manifest and
frozen snapshots. Production and maintained tests stayed byte-identical across
all review runs. The implementation report finished during execution and was
then read and separately bound to its final bytes. Independent source snapshots
include that final report/runbook, serializer/lock dependencies and test files;
probe/loader hashes bind this review's own final evidence.

The author's maintained node-pools gate remains **33/35**, with the same two
root-owned pool-policy prerequisites failing in this workspace. This reviewer
did not convert those failures into skips or passes, fabricate root/cgroups, or
repeat them as a claim of native execution. Full native kernel proof and Buster
integration remain open. Shared Prism-wide typing was rerun after the separate Control source freeze and
passed; `results.json` records the exact command and exit code. No earlier pass
was substituted.
