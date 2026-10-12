# Manual Attempt closure projection

Status: bounded functional implementation and original-suite verification complete;
fresh independent review accepted the bounded functional scope. AC7 full-file
lint remains outstanding. Acceptance below was recorded before production edits on
2026-09-21. This bounded PCR-OBS-002
slice does not close the whole finding or authorize cleanup of operational data.
D07 and the global planner's non-executable result remain unchanged.

## Acceptance recorded before production edits

- AC1: A real small resident-closure quota fills before the operation and admits
  exactly one additional resident closure afterwards. Measured net persisted
  metadata bytes must decrease; references/receipts remain charged to the original
  maximumMetadataBytes, with explicit backpressure on exhaustion.
- AC2: Only the selected confirmed/imported Nova completion is eligible. Active,
  waiting, uncertain, foreign and unmatched closures remain protected. No logs,
  evidence, completion intents or retained journal history are deleted.
- AC3: Reopen, duplicate closure/completion delivery, Admission ACK/cursor,
  completeness, Clawdeck and import replay preserve exact original identities.
  A later claim generation remains forbidden after finalized completion.
- AC4: Missing/changed completion source, malformed/unknown/duplicate projection,
  owner/digest mismatch, corrupted checkpoint and stale CAS fail closed without
  mutation. References resolve the full retained completion closure, never another
  closure reference; prior result projection must remain valid.
- AC5: V1/V2 stores remain readable. Regular writes preserve all references and
  never reinsert retired resident payloads. Exact duplicate retirement releases
  zero; a changed retirement intent conflicts.
- AC6: Actual competing writer and process death around atomic commit prove old
  or new complete state and no double release. Run/store/journal fences and a
  synchronous final identity/CAS recheck protect authorization.
- AC7: Original related suites, relevant type/lint checks and fresh independent
  review are required. Failures and environmental limits are recorded honestly.
- AC-DOC: Retention documentation and this evidence record describe the operator
  scope, actual released units, retained authorities, bounded reference metadata,
  replay guarantees and remaining unreleasable classes.

## Implementation and evidence

Attempt-v3 replaces only the redundant closure array entry, and only after the
selected result already has a valid Attempt-v2 imported-result projection. The
full completion intent (including closure) remains in the same bounded snapshot.
The closure reference directly names that result identity; it never resolves
another closure reference. Original replay validation runs on the reconstructed
logical state before any consumer sees it.

The reference retains operation/actor plus a SHA-256 digest of the complete
retirement intent. This digest binds exact repeated requests; it is not a claim
of cryptographic authentication of an operator. Source authority continues to be
the full validated completion and retained hash-chained import checkpoint. All
reference bytes count toward `maximumMetadataBytes`. The original resident
closure quota excludes only successfully validated projected copies; metadata
exhaustion still stops writes. The natural original single-evidence closure
releases 130 bytes and one resident slot in the author fixture. No closure was
padded to manufacture savings. A valid large operator identity instead produces
an explicit no-saving failure with unchanged store bytes and no released slot.

`retire-attempt-closure.mjs --plan` is advisory and read-only: no store constructor,
lock creation, staging cleanup or journal-tail repair. `--apply` reuses the
existing result operator's canonical-root checks, run mutation fence, Attempt
writer lock, and synchronous import-journal fence. Full inspection and CAS are
rechecked before the single durable snapshot replacement. The closure projection
map is staged separately and installed only after successful commit. Temporary
reference quota is never credited on a rejected no-saving request.

The shared fixture extraction preserves all 14 original Admission/result test
bodies and all four helper bodies byte-for-byte (ignoring the helper's new export
keyword). Existing independent result-review and new closure tests import the
support module directly, avoiding implicit registration of the original tests.
`check-fixture-extraction.mjs` and `fixture-equivalence.txt` record that comparison.

### Executed checks and retained limitations

Evidence directory: `docs/review/evidence/attempt-closure-projection-20260921/`.
`source-identities.json` and `source/` bind the changed source/doc files. The
original scope and constructor/decoder consumers are included; these snapshots
are not a claim of live-cluster or power-loss verification.

- Initial 15/15: 14 original Admission/result tests plus the first closure test.
  This initial fixture import registered the original tests implicitly; subsequent
  combined executions use disjoint modules.
- All six expanded closure cases pass. They cover actual small quota/net-byte release,
  complete consumer replay, CLI plan/apply, forbidden higher generation, bounded
  metadata, invalid limits, stale CAS, waiting owner, malformed/foreign/recursive
  references, real writer exclusion, and actual child-process SIGKILL before
  rename, after rename, and after completed commit. These test process-death
  recovery; they do not simulate a power failure or missing filesystem fsync.
- Three runtime-only loader mutants restore the old full closure count, remove
  finalized-generation rejection, and remove the positive-byte guard. Each is
  detected by a behavioral assertion. No shared production file is mutated.
  `run-mutants.py`, `mutation-hook.mjs`, `mutants.json` and raw logs are retained.
- Nova and common plugin-runtime TypeScript checks pass (raw typecheck logs).
- Full changed-set canonical lint is **not green**. Baseline and final logs retain
  exactly the ten existing `durable-attempts.ts` violations. The same existing
  functions retain the same measured metrics: `storeEvidence` 89 lines;
  `storeResult` 126 lines, its callback 109 lines/complexity 24;
  `evaluateCompleteness` 140 lines, its callback 112 lines/nesting depths 4 and 5;
  plus the same forbidden import-type annotation. File length increases from
  799 to 844 logical lines. No new function violates those rules; the added
  closure method is below the configured function thresholds. This file-size
  increase is explicitly not hidden by an unchanged error count. AC7's clean
  lint requirement remains outstanding for a separate coherent extraction.

Retained intermediate failures: the initial typecheck selected a nonexistent
Core tsconfig path and was corrected to the actual Nova tsconfig before compile
verification. The first child-writer probe had a JavaScript
newline-escaping error before acquiring its lock; only that harness string was
corrected. Fixture extraction initially removed three imports still used by two
original mixed-run cases; only imports were restored, with original test bodies
unchanged. The first combined run also exposed the original inventory's
same-size/same-timestamp snapshot-check limitation: `inventory.json` rejected the
changed hash, but `verifyUnchanged` did not always add `SNAPSHOT_CHANGED` because
it compared stat stamps only. This was reported separately to the root agent;
no planner test or planner implementation was changed by this slice.

After correcting the fixture imports, the pre-inventory-fix combined rerun is
42/43: all 14 original Admission/result cases, six closure cases, five independent
result cases and three replay cases pass; the same original inventory
`verifyUnchanged` blocker assertion remains the only failure. That raw log is
preserved as `tests-before-inventory-fix.txt`. The root agent owns a separate
bounded content-digest verification fix. The author combined run on the first frozen inventory digest guard passes **43/43**,
with zero skips/cancellations (`tests-final.txt`, exit 0, 174.3 seconds). Changed
production/test files and ten relevant dependencies are hash-identical before
and after that run (`source-stability.json`, `dependency-identities.json`).
Frozen Markdown copies use `.md.snapshot` so they are evidence rather than active
documentation pages. After this run, the root agent selected a separate refinement
that limits each hash read to the remaining inventoried bytes, preserving the
predeclared exact read budget even during concurrent growth. The root agent owns
the final combined rerun on that refinement; the preceding 43-case result and
dependency snapshot bind the first digest guard and do not claim to test later
source bytes. The [fresh independent review](independent-attempt-closure-projection-20260921.md)
accepts the bounded functional scope and the separate inventory guard while
explicitly leaving AC7/full-file lint and the overall finding open. Its separate
runs include 40 final original/closure/planner cases, two independent probe cases
(including 13 malformed-reference variants), and eight inventory guard cases;
these are not added to the author's 43 as disjoint coverage. Its unsafe double-slot
mutation is rejected by a behavioral quota oracle. R1–R4 as a whole remain open: this does not release evidence/blob quotas,
permanent completion/reference history, Buster job slots or shared artifacts.
D07 retention and the global planner's non-executable status remain unchanged.


### Reproduction

Run the five original/new modules with the actual cached GNU flock binding:

```sh
LD_LIBRARY_PATH="$PWD/node_modules/.cache/native-host-tools/root/usr/lib:$PWD/node_modules/.cache/native-host-tools/root/lib" \
node_modules/.cache/native-host-tools/root/usr/bin/proot \
-b "$PWD/node_modules/.cache/native-host-tools/root/usr/bin/flock:/usr/bin/flock!" \
/usr/local/bin/node --test \
tests/verification/reliability/admission-retirement.test.mjs \
tests/verification/reliability/attempt-projection-review.test.mjs \
tests/verification/reliability/attempt-closure-projection.test.mjs \
tests/verification/reliability/observability-replay.test.mjs \
tests/verification/reliability/observability-retirement-plan.test.mjs
node_modules/.bin/tsc --noEmit -p skills/nova/tsconfig.json
node_modules/.bin/tsc --noEmit -p skills/common/plugin-runtime/tsconfig.json
```

Lint uses the unchanged canonical
`charts/kubeclaw/files/config/eslint.config.mjs` against all eleven changed
TypeScript/JavaScript source, CLI and test files listed in `source-identities.json`.
Raw `lint.txt` and exact-source `lint-baseline.txt` preserve the nonzero status;
no suppression, rule change or narrowed full-check success is claimed.
