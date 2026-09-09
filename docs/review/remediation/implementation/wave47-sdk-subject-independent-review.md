# Independent review: Source/Subject, Snapshot and Project recovery cutover

Reviewed SDK WIP based on `b6b2b1b`. Final production scope is identified by the
19 SHA-256 entries in `wave47-sdk-subject-final-source-hashes.txt` under
`docs/review/evidence/`. The initial 15-file freeze is separately retained.

**No remaining blocking source finding in the reviewed boundary.** One additional
Project CLI recovery defect was identified during independent review, corrected
by the author, and verified with an original-consumer negative/positive comparison.
No production source was changed by the reviewer.

## Authority and compatibility checks

The compiler explicitly tags new Source and SourceBinding contracts. The subject
signature includes its tag. Capture and input verification select the declared
codec, and SourcePreflight requires exact binding/subject codec agreement before
granting admission. Untagged historical contracts retain their original algorithm;
unsupported tags and unverified locale-dependent identities reject. Existing
artifact byte/reference checks and Git revision checks remain active.

The full enclosing identities are also versioned: run-snapshot v2 and
execution-graph-snapshot v3 have portable digests, while historical v1/v2 retain
their old digest algorithms and ordering. V3 sorts only the snapshot representation;
the real scheduler's ordering remains unchanged. Recovery reconstructs the graph
using its stored version. Before adapters start, executePrepared verifies the
graph and passes that exact version to the runner, overriding any option supplied
by a caller. Historical graphDigest/run identity and stored bytes are preserved.

The initially proposed compiler change still broke the original Project CLI:
`--recover` and `--signal` recompiled a historical project with new Source tags,
producing different nodes even when the snapshot digest codec was selected
correctly. Successful direct-Core resume tests used the old definition and could
not catch this consumer conflict.

The author's correction adds compileProjectRecovery. It reads the verified actual
run snapshot, parses its sole Source-preflight contract, and selects the recorded
source codec for recompilation. It then verifies the entire resulting graph.
Changed project authoring is still rejected; the implementation does not replace
user input with trusted snapshot fields or rewrite existing authority. The new
helper uses explicit nova-core package exports for run-snapshots/run-root, avoiding
a source-layout-only relative import in extracted production packages. Extracted
bundle validation remains the orchestrator's separate gate.

## Independently executed evidence

- **9/9** new Source/Subject/Snapshot cases: real subprocess locale changes,
  actual disk waits, journals, artifact stores, Git operations and original
  plugin/adapter consumers; portable directions succeed, historical compatible
  identities remain readable, mismatches and mixed codecs reject, and all five
  closed schema positions reject unknown tags.
- **14/14** original report-evidence, decisions-and-snapshots, and adapter
  dependency-identity tests. The real report reader accepts the new snapshot
  envelope while retaining its original evidence guards.
- Original Project compiler/CLI compilation contract passes.
- **1/1** independent rerun of the author's actual historical-Core run to current
  Core resume harness. Historical en-US execution writes a real v1/v2 snapshot;
  current sv-SE continuation completes the bounded approval/Blueprint/two-module
  graph with identical run identity/graphDigest and unchanged snapshot bytes.
  Each of the four archived historical Core files was independently compared
  byte-for-byte with `git show b6b2b1b:<path>` before execution.
- **2/2** new actual Project recovery compiler tests: stored portable and legacy
  definitions recompile identically across processes/locales; changed authoring
  rejects without rewriting snapshots.
- Additional independent **full 13-stage historical Project CLI comparison**:
  original old compiler + original old Core create a real run with Source-preflight
  and Blueprint-sync succeeded and the first implementation stage admitted. No
  agent token is supplied, so the actual external boundary terminally blocks.
  The unmodified old CLI file with the new compiler reproduces
  `RECOVERY_GRAPH_DIGEST_MISMATCH`. The fixed original pipeline.ts passes graph
  verification and preserves the correct `RECOVERY_RUN_TERMINAL:…:run.blocked`
  rejection. Snapshot and journal bytes remain identical. This is a compatibility
  and failure-priority proof, not permission to reopen terminal runs.

The historical Source/approval graph fixture uses its documented deterministic
local transport peer to exercise original consumers; it establishes no model
quality, remote provider or complete application claim. The additional full
Project CLI comparison uses no model response or replacement provider at all.

## Raw files and precise remaining limits

All following files are under `docs/review/evidence/`:

- `wave47-sdk-subject-independent.txt`
- `wave47-sdk-subject-original-consumers.txt`
- `wave47-sdk-subject-compiler.txt`
- `wave47-sdk-subject-independent-historical.txt`
- `wave47-sdk-subject-project-recovery.txt`
- `wave47-project-legacy-resume-cutover.txt`
- `wave47-project-legacy-resume-cutover-probe.mjs`
- `wave47-sdk-subject-final-source-hashes.txt`

The retained `wave47-project-legacy-resume-cutover-initial.txt` was not a valid
negative control: the author had already changed the CLI before that subprocess
started. The final probe avoids the race by creating a separate byte-identical
historical CLI entry beside the current compiler, and comparing it to the fixed
real launcher on the same disk run. It removes temporary test/CLI files afterward.

Native isolation, remote provider acceptance, full application delivery and broad
SDK canonical-identity migration remain outside this review. T01-F01 original
CLI entry has its own separate evidence in `wave47-project-cli-execution-entry.md`.
The new source version does not silently make other still-legacy identity domains
portable. The author's Phase6 fixture marker correction is separate from the
production cutover; this review does not treat the fixture as native evidence.
