# Independent review: bounded derived-source dispatch retention

## Reviewed object and frozen scope

The reviewed remote source commit is
`588de8d5764e54980069a19951e3d00171b34f44`, tree
`ec614903fe74a834ab5304130a1ea7449e0b81ee`, with the sole parent
`1ba445125fbacfa4f0344f8bf38e68f8f0686eff`. The recursive Git tree was read
from GitHub without truncation: 4,614 entries, comprising 4,095 blobs and 519
trees. An independent checkout was assembled from the remotely read parent tree
and the six changed remote blobs; `git write-tree` reproduced
`ec614903fe74a834ab5304130a1ea7449e0b81ee` exactly.

The six remote deltas are the dispatch retirement implementation, its projection
test, one work-item update, the implementation report, and two author evidence
files. No Worker Core, role engine, schema, chart, controller or deployment file
changes in this package.

The baseline register at
`c38779c71bb92bc15c3fcb89930348e5417aa475`, current register, resume README,
work items, package checkpoints, root checkpoint and frozen scope were reread
from the remote objects. The baseline `implementiert` set, scope file and work
items contain the same exact 47 IDs. The current register remains 8 verified and
39 incomplete. `PCR-OBS-002` remains `implementiert`, correctly not verified.

Its original requirement is broader than this slice: an explicit run-scoped
retention policy must free only consumer-confirmed history with completed
evidence and required idempotency tombstones, under small real quotas with mixed
active/completed runs, while old delivery replay cannot repeat an external
action.

## Code and authority review

The change fixes a real bounded mismatch: the Project compiler and the registered
quality engine select produced source via `providerPlan.sourceStageId`, whereas
the existing manual dispatch projection accepted only a literal revision. The
new path derives the revision from the original registered implementation
attempt instead of ambient Git state.

The projection remains fail closed. Before mutation it binds all of these to the
original, bounded and no-follow inventory while the existing run/import/dispatch
fences are held:

- exactly one configured implementation stage and its pinned role-specific
  `kubeclaw.implementation-agent` owner;
- the latest completed passing producer attempt, preceding the quality attempt;
- one exact implementation ArtifactRef in run evidence and the original
  ArtifactStore record, with size and SHA-256 verified against the blob;
- the exact `ready_for_testing` value and source revision consumed by the
  quality attempt through the pinned ArtifactStore adapter;
- pinned completed `git.commit`, `git.merge` and `artifacts.write` effects in
  causal order, with the merge, stored value, Core fact and dispatched revision
  equal;
- the pre-existing terminal-run, completed-import, original decision artifact,
  CAS, distinct-store, run mutation and unchanged-inventory checks.

Only the Nova-side offline retirement inspector and its test changed. It reads
the generic Core journals, snapshots, effects and registered provider identities;
the shared Worker Core and the role-specific implementation and quality engines
remain unmodified. No compatibility shim, fallback provider or relaxed contract
was introduced.

## Independent executions

All commands ran in the independently materialized exact source tree. No test
was skipped.

- Current complete projection suite: 11/11 passed, including the registered
  two-stage derived-source path, competing writer and actual SIGKILL recovery.
- The unchanged parent test blob (`21d2fd52750581bb7fccc1b7609241896ce638fb`)
  against the new implementation: 10/10 passed. This separately establishes
  that the prior projection assertions were not weakened.
- Focused derived-source execution: 1/1 passed.
- Original retained-import authority suite: 4/4 passed.
- Nova TypeScript typecheck: exit 0.

Raw stdout and SHA-256:

- `docs/review/evidence/run25-obs-retention-independent-projection.txt`
  — `b6d28c6cf3cafb8540fe3eda1a8d980cafbdd694acd7ef4a42cbb8e5587608c6`
- `docs/review/evidence/run25-obs-retention-independent-parent-projection.txt`
  — `3fa9d1d5d2c4809fb18eadba11b08f2d5627d4baaf3df54484253c355f6de3f9`
- `docs/review/evidence/run25-obs-retention-independent-derived-focused.txt`
  — `f2a0ece1cc54a5b74239e455428e964ca7438f8e8fafde070ec3896e64a87cc7`
- `docs/review/evidence/run25-obs-retention-independent-retained-authority.txt`
  — `e2265d7e1466081ce7901de4be5e49105949c611dc9b9cc3e0e6a3928f7c0ccd`
- `docs/review/evidence/run25-obs-retention-independent-typecheck.txt`
  — `0ba3630c8c428d29a2bd44fa004a9be1052d9ffba1e308038d67e4287c9d3176`

The author evidence files are concise result summaries rather than raw test
stdout. This review therefore preserves the actual independent outputs above.
The author's phrase "new negatives" is broader than its diff: missing/corrupt
derived artifact and altered merge result are new derived-path mutations; most
foreign identity, active-run, CAS, alias and recovery assertions are retained
pre-existing cases. That wording does not change the tested code boundary.

## Verdict and remaining limits

**Accepted only as a bounded, incomplete `PCR-OBS-002` source slice.** The code
and tests establish that an otherwise complete registered derived-source chain
can safely release the redundant dispatch archive bytes without weakening the
literal-revision path or replay/recovery behavior. This review does not authorize
closing the finding and does not integrate the source into the remediation
branch.

The implementation fixture uses a deterministic local registered Forge endpoint
to drive the real PipelineRunner, Git workspace adapter and ArtifactStore. It is
not a native OpenClaw model execution. More importantly, the Buster-side provider
still returns `execution_error` with `TEST_PROVIDER_SANDBOX_NOT_BUILT`, and the
run reports `nativeHttpRequests: 0`. This is an honest retained blocker, not a
successful native provider gate.

The original finding still requires the wider connected policy and proof for
v2/Discord delivery, externalized or uncertain histories, shared blob/history
ownership, record-count release and mixed active/completed small-quota behavior
across every claimed consumer. Those gaps must stay open; no static inference or
this bounded metadata projection can substitute for them.
