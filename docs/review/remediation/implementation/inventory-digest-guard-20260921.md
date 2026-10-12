# Retirement inventory final digest verification

Pre-edit criteria, 2026-09-21. The original retirement-plan test observed a
same-size rewrite for which `text()` rejected the changed digest but the final
`verifyUnchanged()` failed to add its blocker. Final verification currently trusts
file timestamps and identity without comparing the inventoried content digest.
A matching metadata stamp is not proof of unchanged bytes.

| Criterion | Required observation |
| --- | --- |
| IG1 | Final verification rereads each previously hashed regular file and compares its original digest; a same-size rewrite with matching metadata is rejected. |
| IG2 | Unchanged content passes; growth, shrinkage, disappearance, path replacement and existing directory/scan protections remain enforced. |
| IG3 | Reads remain bounded by the original inventoried byte size; no configured quota increases and no unbounded content allocation. An already unhashable inventory remains blocked. |
| IG4 | Original planner/retirement callers and a deterministic metadata-collision probe execute; restoring the old stat-only guard fails the probe. No sleeps are used to hide timing sensitivity. |
| IG-DOC | Describe repeated digest verification, its bounded I/O cost and its role inside the existing writer fences. No claim of a transaction against arbitrary writers ignoring those fences. Fresh independent review required. |

Implementation and [fresh independent review](independent-attempt-closure-projection-20260921.md) are complete for this bounded guard. The final combined caller regression is recorded below.

`verifyUnchanged()` now uses the existing `hashFile()` for each previously hashed
regular file and compares its original digest. The existing 64 KiB streaming
buffer, exact inventoried-size bound, descriptor checks/closure and parent checks
remain in use. No quota or scan limit changes. Files lacking an initial hash
retain their original inventory blocker. Each verification can reread at most
the original scan's configured total byte budget; `bytesHashed` continues to
count unique initial-scan bytes rather than cumulative verification I/O.

Eight focused tests pass, including a deterministic metadata-collision model
with actual file mutation and content reads. All fifteen original retirement-plan
tests pass using actual GNU flock; canonical lint for the module and new test
passes. Restoring the old production module in a private copy fails exactly the
new collision assertion (seven other cases still pass). Reproduction and raw
logs: `docs/review/evidence/inventory-digest-guard-20260921/`.

The independent reviewer additionally ran 1,000 real same-size rewrites before
and after without metadata mocking. Before: 807 actual stamp collisions, all
807 changes missed. After: 759 actual stamp collisions, zero missed changes.
The differing collision count reflects observed filesystem timing, not a tuned
limit. Both raw observations and the captured old method are retained under
`docs/review/evidence/attempt-closure-projection-independent-20260921/`.

The retention runbook describes repeated digest verification and its cost inside
the existing writer fences. This correction is not a filesystem transaction
against a writer that ignores those fences; no such guarantee is claimed. The deterministic probe models
coarse metadata while mutating and rereading real file bytes; it does not claim
to configure the filesystem timestamp resolution.

## Final exact read bound

Independent review identified that the old fixed-size read could consume an extra
chunk if another process grew a file after its initial descriptor check. Each
read now requests at most the remaining originally inventoried size. The final
focused suite passes 9/9, including a real competing writer with a controlled
interleaving. Separate final mutations restore only the stat-only verification
or only the oversized read: each fails exactly its targeted assertion, with the
other eight tests passing. Earlier eight-test evidence is retained unchanged.

The reviewer independently repeated the real-file collision loop on this final
reader: 796 actual metadata collisions in 1,000 writes, zero missed changes.
Its real-growth and empty-file probes also pass; this is separate from the
deterministic metadata model. Canonical module/test lint passes. An initial lint
invocation omitted the repository's explicit config and failed before linting;
its output is retained alongside the corrected canonical invocation.

Final combined regression on this exact reader: **43/43 pass, zero skips** across
original Admission retirement, independent result-projection checks, closure
projection, replay and retirement planner. Scoped source hashes before and after
are identical; the archive, command, environment and result are retained as
`final-source.tar.gz`, `final-source-{before,after}.json`,
`final-combined-command.json`, `final-combined-result.json` and
`final-combined.txt` in the guard evidence directory. This uses real GNU flock
via the documented tool binding and does not prove privileged kernel isolation.
