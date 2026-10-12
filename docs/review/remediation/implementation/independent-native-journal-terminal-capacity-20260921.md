# Independent native journal capacity review

Bounded acceptance: JC1–JC5 and JC-DOC pass. This review did not author the
production change or maintained tests. It proves metadata admission and actual
filesystem behavior; VM3 predates this change and provides no kernel or Buster
acceptance for it.

The authoritative admission fence checks the actual durable store document
before writing a new input blob. The projection retains immutable identities,
whole-store framing, retirement metadata and foreign rows, charging every pending
row rather than only the arriving attempt. Completed process metadata remains
at its actual representation; sealed rows cannot later gain a process archive.
The maximal pending shape includes both independently bounded diagnostic fields,
valid six-byte JSON escapes, longest valid dates, maximum safe counters, output
and result references, and record headers. `null` is longer than the supported
0–255 exit codes. The unchanged 65,536-byte payload and configured whole-store
ceilings are both checked. Projection data is never persisted as measurements.

Fresh execution passed all six unchanged journal cases and four maintained
capacity cases. Two additional independent probes passed separately: seven
concurrent instances competing for one slot admitted exactly one, then retained
its exact result/replay; a previously archived process with nonempty maximum
output, two maximal valid escaped diagnostics, exit 255, maximum counters and an
extended negative-year timestamp sealed under its computed exact bound without
rewriting the archived process. Actual file bytes equal canonical serialization.
The maintained cases additionally cover one-byte-short rejection without an
input blob, historical overcommit/replay and retained foreign metadata.

A private mutation removes only the admission reservation call. The independent
seven-way assertion then fails with seven admitted versus one expected. This is
an actual semantic/concurrency failure, not an import or prerequisite error.
Scoped native TypeScript and canonical ESLint passed. Original journal test
bytes, assertions and deadlines match the VM3 snapshot exactly.

An initial independent probe used an invalid lone surrogate and correctly failed
with `RFC8785_INVALID_UNICODE`. That raw failure is retained. The final probe
explicitly checks this rejection and unchanged metadata, then persists valid
six-byte escaped controls; neither validator nor canonical serializer changed.
The ten maintained cases had already passed in that initial combined run; the
final two independent probes passed after correcting the invalid test input.

The runbook and final author report explain conservative reservation cost,
historical saturation, physical-I/O limits and unresolved Buster reconciliation.
Readable spacing and numbers were corrected before final binding. Historical
accepted work can remain readable yet fail a terminal write when already
underprovisioned; no quota increase, receipt rewrite or automatic deletion is
claimed. Separate writers bypassing the journal admission protocol are outside
its reservation guarantee.

Evidence: `docs/review/evidence/native-journal-terminal-capacity-independent-20260921/`:
exact runner/commands, preserved initial log, final probes, actual failing private
mutation, type/lint output and final source identities. The four unresolved VM3
cancellations remain separately diagnosed; host readiness with inherited/cleared
`NODE_TEST_CONTEXT` did not reproduce them and is not guest timeout proof.
