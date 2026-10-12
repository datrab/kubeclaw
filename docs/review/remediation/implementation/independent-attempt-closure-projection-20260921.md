# Independent Attempt closure projection review — 2026-09-21

Accepted for the bounded manual closure-projection behavior and inventory digest
guard. This reviewer implemented neither change. AC1–AC6/AC-DOC and IG1–IG4/IG-DOC
are supported by the checks below; AC7's full-file lint debt and the broader
observability-retirement finding remain open.
Evidence: [`attempt-closure-projection-independent-20260921`](../../evidence/attempt-closure-projection-independent-20260921/).

## Production boundary reviewed

The new V3 decoder first resolves and validates the existing imported-result
references, including the retained journal prefix/hash/owner/completeness. Only
that validated projection map may supply a full completion closure to a closure
reference. Strict keys/version checks reject unknown or mixed shapes; the original
closure/evidence replay checks run on the reconstructed state. References never
resolve through another closure reference. V1 and V2 remain readable.

The store prepares a separate reference map, checks the canonical encoded
metadata budget and positive actual byte difference, rechecks authority, then
uses the original fsync/atomic-replace helper. Only successful replacement installs
the in-memory closure map. Resident quota subtracts only validated references;
regular writes encode them again without reinstating duplicate payloads. Full
completion intents, imported results, evidence identities and journal authority
remain retained. All references and compact receipt fields consume metadata bytes.
The retained intent digest is an exact duplicate-operation comparison token, not
a separately authenticated signature or an external archival receipt.

The manual CLI preserves run/store/journal fences, immutable checkpoints and
store CAS. Its advisory `--plan` does not commit authority; `--apply` repeats the
checks. Review identified that the initial advisory path could bypass constructor
validation of limit values; shared positive-safe-integer validation was added and
plan/apply invalid-limit parity cases now execute. The global planner remains
non-executable and D07-protected evidence/history is not deleted.

## Independent checks

- Fourteen original Admission/result test bodies are byte-identical to their
  pre-edit snapshot. Four moved fixture functions are also byte-identical apart
  from their export modifier (`test-preservation.txt`). Moving fixtures out of a
  test module avoids accidental test registration without reducing coverage.
- Own disk decoder probe rejects 13 malformed variants: unknown version, extra or
  mixed fields, foreign result key, wrong closure digest, absent completion,
  unprojected result source, recursive source, duplicate references, duplicate
  full/reference closure, missing/invalid receipt digest, and empty V3 references.
  Every rejection preserves the exact file bytes. Restoring the source recovers
  the complete original logical state. The explicitly constructed V3 reference
  in this probe is decoder input, not claimed proof of authorized retirement.
- Own real operator probe uses original result retirement and the actual closure
  CLI implementation. Valid maximum-length identities produce a no-saving
  reference and are rejected without mutation or lost quota. The unchanged,
  unpadded positive closure then releases **127 bytes** (the author's shorter
  operation ID releases 130). Exactly one extra closure fits; the next is denied.
  A finalized later generation remains rejected. Both own tests pass after the
  inventory correction (`final-probes.txt`).
- Runtime-only double-slot mutant changes both writer and replay accounting from
  one released slot to two. The third closure actually becomes admissible and
  the independent oracle fails with `Missing expected rejection` (`quota-mutant.txt`).
  A first single-guard mutation was still blocked by replay validation; that
  defense-in-depth result is preserved separately. Neither mutates shared source.
- Original durable Attempt, Nova reconciliation and Clawdeck contract programs,
  replay tests and planner tests passed **21/21** before the inventory correction
  (`consumers.txt`). The corrected-import Admission/result/closure/review suites
  passed **25/25** before that correction (`original-tests.txt`). Final combined
  execution against the new guard passes **40/40**, with zero skips/cancellations
  (`final-combined-tests.txt`): Admission retirement, result/closure projection,
  replay review and original retirement planner, including actual CLI, writer
  exclusion and all three SIGKILL boundaries. The dedicated guard tests pass
  **8/8** and independent final probes **2/2**.
- Nova and common plugin-runtime typechecks pass. New/changed bounded modules have
  no new lint violations; the entire `durable-attempts.ts` file still has its ten
  existing violations. Own baseline/current JSON comparison verifies the same
  rule set, but does not hide the file's increased size or claim whole-file lint
  is green. Broad quality completion remains outstanding.

## Inventory guard found and checked independently

The original final inventory check compared metadata only. An independent loop
of 1,000 real same-size file rewrites produced **807 actual metadata collisions**;
all 807 escaped that old final check. No filesystem metadata was mocked in this
reproduction. The exact loaded old method and counts remain in
`inventory-before-probe.json`.

The first root correction calls the existing bounded streaming hasher for every
previously hashed file and compares its original digest. Repeating the same
real-filesystem probe produced **759 collisions and zero misses**
(`inventory-after-probe.json`). Its eight dedicated guard tests pass. A
runtime-only restoration of the old condition makes the changed-content test
fail (`inventory-mutant.txt`).

Review then identified that a full-buffer read could exceed the claimed I/O
budget if a file grew after its initial descriptor check. Root tightened the
read length to the minimum of buffer capacity and remaining inventoried bytes;
the final descriptor check still rejects growth. On this final reader the same
1,000-write loop observes **796 collisions and zero misses**
(`inventory-final-probe.json`). All nine current guard tests plus two independent
reader probes pass **11/11** (`final-inventory-tests.txt`). The independent growth
probe appends actual bytes immediately after the initial descriptor check and
measures exactly **8 bytes read** from a file now containing **65,544 bytes**;
the changed file is rejected. The empty-file probe remains valid. Restoring the
old full-chunk read in a runtime-only mutant reads 65,536 bytes and fails this
oracle (`inventory-read-mutant.txt`). This declared scheduling injection changes
real bytes; it does not fake a read or digest. The original added growth test
also uses an actual competing writer process.

Manual inspection confirms no limits increase or content-sized allocation: the
hasher retains its 64 KiB buffer, checks inode/type metadata, bounds every read
by remaining original bytes and checks final size/stamp. A failed/unhashable initial
inventory stays blocked. `bytesHashed` still records unique initial-scan bytes;
each final verification incurs another bounded pass, not free I/O. Directory,
replacement, shrink, growth, deletion and no-follow checks remain. This operates
within existing writer fences and does not promise a transaction against arbitrary
writers ignoring those fences. The actual root CLI/closure tests are rerun against
this final dependency, rather than accepting only the isolated helper test.
The earlier 40/40 combined run covers the first digest guard; the final exact-read
closure/planner run passes **21/21** (`exact-bound-closure-planner.txt`), and the
own decoder/operator rerun passes **2/2** (`exact-bound-probes.txt`). Counts are
kept separate; the current Inventory source and current documentation are bound
in `source-identities.json`.

## Honest failures and limits

The first independent expanded run caught two missing imports in the author's
fixture extraction; the imports were restored without changing any original test
body. That failure remains in `original-tests-before-import-fix.txt`. The first
own generation probe expected a generic error-name pattern instead of the actual
`OBSERVABILITY_ATTEMPT_ALREADY_COMPLETED`; the raw failure remains in
`probes-initial.txt`, and only that expected name was corrected. No production
behavior was changed to make either probe pass.

Real locks use **util-linux flock 2.42.3**, bound through the recorded local proot
invocation, never a fake lock. SIGKILL probes terminate actual child processes at
before-rename, after-rename and after-return points and reopen real files. They
establish those process-death boundaries, not every instruction-level power-loss
window or kernel/fsync failure. There was no live deployment, operational-data
retirement, fake positive padding, raised quota or whole-finding closure.
