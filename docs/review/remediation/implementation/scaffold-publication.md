# PCR-SCAFFOLD-001 — coherent scaffold publication

Resume review on 2026-09-09, base `bbc36de5c288e3a3b6c53f98e72c19291cab45d8`
plus the existing working-tree implementation. This supplements the earlier
provider-plan preservation fix; it does not rewrite historical review findings.

The earlier sequential writes could expose new progress with old pipeline when
the second write failed. The existing resumed implementation publishes two
fsynced generation members and commits their digests through one durable pointer.
Original pipeline test and lint readers validate both materialized members against
that committed generation. A partial publication is rejected before plan use;
explicit scaffold `--apply` reconciles it. Regeneration reads the committed pair
without silently adopting incomplete loose files. Legacy projects without a
publication directory retain their original authored JSON path.

Independent review checked the original CLI, discovery and both pipeline readers,
file admission, generation digest, pointer validation and writer serialization.
The change retains the existing provider-plan semantics. No compatibility shim or
replacement filesystem was introduced. Failed writes may leave temporary
files/generations; there is no automatic evidence deletion.

## Actual local verification

- All scaffold suites plus original Discord and operator recovery regressions:
  41 passed, zero failures/skips (`docs/review/evidence/resume-20260909/remaining/tests.txt`).
- Added a genuine filesystem regression for concurrent publication and initial
  uncommitted-directory reconciliation. All four publication tests passed
  (`publication-tests.txt` in the same directory).
- The original SIGKILL test kills the actual scaffold CLI after first-member
  materialization, checks that plan consumption fails, and recovers with the
  actual CLI. Other cases cover second-member EISDIR without first-member change,
  corrupt/missing pointer, traversal, symlinks, oversized members and divergence.
- Project-setup and operator TypeScript checks passed. Canonical ESLint passed
  new publication code, pipeline consumer, CLI, operator code and regression.
  Discovery still has six existing canonical lint violations (complexity/size),
  reproduced against HEAD with the same config. This is not a clean whole-file
  lint claim; `lint.txt` and `discovery-head-lint.txt` retain the comparison.

No deployment, CI, external message or full pipeline execution was performed.
