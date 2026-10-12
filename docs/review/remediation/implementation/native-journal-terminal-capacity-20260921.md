# Native journal terminal metadata capacity

Preimplementation criteria (JC), before source edits:

- JC1: New admission reserves the whole actual durable metadata representation for every pending row under the existing admission lock, before input blob/identity publication. Fixed maximumStateBytes and 65,536-byte payload ceilings remain unchanged.
- JC2: Bound both 4,096 UTF16-unit signal/fault strings with valid maximally escaped controls, final safe-integer counters, dates, blob references and immutable original identities. Sealed records and all other retained store metadata remain charged at actual bytes. Projection is accounting only, never persisted as measured results.
- JC3: Historical accepted/sealed records remain readable and replayable; overcommit rejects growth without preventing existing lifecycle attempts. No automatic pruning, quota increase or original receipt rewrite.
- JC4: Preserve an actual-filesystem reproduction of admission followed by valid terminal-write failure. Prove preadmission rejection with no new blob, exact-fit/one-short, multiple pending records, concurrent admissions and independent missing-field negative controls.
- JC5: Original journal tests/assertions/deadlines stay unchanged. Run maintained filesystem tests, scoped types/lint and fresh independent review; no kernel proof from metadata tests.
- JC-DOC: Explain actual capacity cost, old-store limitations, physical I/O failure limits and unresolved Buster reconciliation requirements.

Implementation and author verification completed after VM3 terminated. Fresh
independent acceptance is pending. This does not close native/Buster acceptance.


## Implementation and limits

The existing admission fence now reads and validates the complete actual durable
store document before input blob publication. One bounded helper projects each
pending native row, preserves any already archived process metadata, charges
sealed rows and other retained metadata at actual bytes, and preserves all store
framing/retirement fields. It checks both the unchanged 65,536-byte payload limit
and configured whole-store limit. New record header owner/key/sequence use their
actual immutable values; future committed/process timestamps use the longest ISO
Date form. Digest lengths remain exact. Shared diagnostic-length constants keep
the validator and reservation aligned. No projection is written as observed data.

The per-field envelope charges both output references at their individual
configured maximum, even though their joint byte sum is also bounded. This is an
explicit conservative envelope, not a claim of minimum necessary capacity.
UTF16 diagnostics use 4,096 valid NUL units each, which consume 24,578 JSON bytes per
string. Safe integer counters, nullable exit code and final unpopulated state
are charged at their longest valid representations. All pending rows count
under the same admission fence; the helper serializes one projected row at a
time and stops at the configured ceiling.

Historical duplicate/read paths remain unchanged and do not re-admit. A historical
store can be readable yet overcommitted; it may still fail terminal writes and
must reject new growth. This change does not repair old saturation, provide
physical storage, retire records or authorize source deletion. Buster still needs
its separately reserved root-ledger proof and reconciliation authority.

## Actual evidence

`reproduce-before.mjs` loads the preserved original journal module and performs
real filesystem/flock operations: an 8,192-byte state limit admits a 1,238-byte row,
then a valid process archive containing both maximal diagnostic strings fails
`DURABLE_RECORD_STORE_FULL`, with the identity retained. The corrected maintained
case rejects that 8,192-byte profile before any input data directory/blob or identity.

Final original six journal cases plus four maintained cases pass **10/10**, zero
skips/cancellations. Coverage includes exact bound/one byte short, real terminal
writes with both maximal diagnostics and counters, actual persisted byte versus
canonical serialization equality, concurrent independent journal instances,
multiple pending rows, historical overcommit replay and retained foreign metadata.
Original SIGKILL, contention and replay assertions/deadlines are unchanged.
Native scoped TypeScript and canonical ESLint pass. Two private loader mutations
omit respectively signal or fault headroom; each fails the maintained exact-fit
case at the actual durable terminal write with `DURABLE_RECORD_STORE_FULL`.

Raw before/final logs, exact serial runner and mutation hooks are in
`../../evidence/native-journal-terminal-capacity-20260921/`. They use the cached
actual GNU flock through proot because the workspace lacks `/usr/bin/flock`;
these are filesystem/concurrency proofs, not cgroup/kernel or deployed image
proof. Original VM3 snapshot predates this journal change.
