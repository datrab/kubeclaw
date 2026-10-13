# Independent Runtime review — checkpoint 21bf dirty stand

## Result

**One medium finding remains open: URUNTIME-001. No global C0, native or module-binding acceptance.** Canonical-root integration is separately tracked by the parent as UCORE-001.

URUNTIME-001: `runtime/batches/21bf51b-standalone-remote-19/integrate.py:5` inserts `sourceDefinitionHistory=[]` before evaluating `oldRowSHA256`. All 17 hashes describe that modified row, not the exact historical original. Original snapshots are intact and match checkpoint HEAD, but the recorded digest cannot authenticate those snapshots. The initial strict check failed for precisely this reason; the amended integrity check explicitly records it rather than treating the mismatch as clean provenance.

[Exact mismatch data](row-history-hash-mismatches.json), [initial failure](integrity-attempt1.stderr), and [separate recovery reproduction](recovery-verification.json) preserve the evidence. Compute a digest before mutating the row, and record a transparent correction preserving existing history/raw evidence. No author fix was made during this review.

## Verified bounded checks

- 1,248 Runtime rows and 6,320 cases checked; all 6,201 checkpoint case bodies remain identical. 4,799 cases remain not-run; 1,521 passes are existing bounded observations, not global acceptance.
- Seventeen batch19 current constructor cases replay successfully. All 102 future semantic/effect/binding/recovery/Eval/mutation cases stay not-run.
- Fifty-one historical cases remain conserved; successor requirement sets are not reduced. 2,308 immutable reference occurrences resolve.
- Eighteen actual source identities and contract readers were checked by the preserved integrity run. The recovery reviewer inspected the actual loader/producer and record-limit consumers.
- All 286 frozen dirty baseline files retain their captured hashes at recovery verification. Review outputs only were written.

## Replay identity and failures

The author test was copied solely to redirect its output into this review directory. [Replay isolation](replay-isolation.json) records both digests and the exact output-path change. Its emitted testDigests key still names the author script but hashes the reviewer copy; interpret it using replay-isolation.json, not as an author-script identity claim. Original author artifacts were not overwritten. [Commands](commands.json) retain the successful isolated replay, failing first integrity attempt, and successful finding-aware integrity attempt. [Machine report](independent-review.json) pins the existing raw artifacts.

Current loader fallbacks, late source/archive guards, constructor-only acceptance, source-vs-registered ownership, timer overflow and capacity correlations are explicitly documented observations/open obligations. They are not acceptance of installed operations or complete Runtime behavior. Whole-module original-A binding, real recovery/effects/providers/roles/grants and global C0 remain open.
