# CONFIG C0 evidence — incremental, not accepted

Baseline application/test source: `9452d35524192f8665bc87254b3c63a361e7bd4a`,
tree `89fa8e4d683cf442deb189d60ce8b7cc1ff05327`.
The CONFIG worktree is isolated from the existing dirty documentation checkout.
No production source, original tests or historical raw evidence is changed here.

## Reading and reproduction

- `author/source-boundary.json` enumerates all tracked inputs; candidate locations
  are navigation obligations, not resolved semantic fields.
- `components/`, `runtime/`, `delivery/` contain author fragments and reproducible
  source readings. Count of schemas/fields/markers is not semantic acceptance.
- `author/main-fragment.json` records individually read Prism residual policies;
  dormant provider composition and remaining scope are explicitly open.
- `author/verification.json` records current commands, dependency/test/config
  identities and raw failed attempts. Historical verification remains separate.
- `independent/` and the independent report under remediation are reviewer-owned
  evidence. Author summaries do not substitute for independent source enumeration.

From repo root:

```sh
python docs/review/evidence/config-acceptance/author/collect-source-boundary.py
python docs/review/evidence/config-acceptance/author/consolidate.py
python docs/review/evidence/config-acceptance/author/check-matrix.py --structural
python docs/review/evidence/config-acceptance/author/check-matrix.py
```

The first two commands generate documentation evidence only; they never load
operator secrets, execute component code or create accepted cases. Structural
mode checks draft identities/links only. **Strict mode must fail while open
fields, candidates, source dispositions, case specifications or independent
reviews remain.** A successful structural check is not C0 completion.
`author/checker-negatives.json` proves detection of injected documentation-matrix
defects only, not F-MUT production behavior. Full implementation cases remain
`not-run` before explicit approval and implementation.

## Current unchanged suite observations

Root npm cache was readonly; retry used a task-specific writable cache. Ambient
`NODE_ENV=production` omitted development dependencies, and ambient `SWARM_CONFIG`
selected the host entry instead of the test fixture. Failed setup/later runs are
retained rather than promoted. With full locked dev dependencies and both ambient
variables removed, the actual unchanged suite collected **649 tests: 644 passed,
5 failed, 0 skipped**. Four are the known Helm diagnostic assertions; the fifth
requires real UID/GID 1000 but this tool environment runs as UID 0. An isolated
git-archive checkout attempt using `setpriv` was rejected before test execution
(`setresuid: Operation not permitted`). No identity spoof or weakened assertion.
This environment limitation does not waive C0's code-based semantic work, and
these logs cannot close future C1 runtime acceptance.

## Remaining work and safe resumption

The consolidated inventory/acceptance matrix are working artifacts. Preserve
all IDs and obligations while completing exact productive readers, dynamic refs,
field-level classification/activation and complete-profile case oracles. Record
superseded observations without rewriting historical failures. Correct reviewer
findings, regenerate consolidation, freeze exact application/test/evidence bytes,
then have a fresh independent reviewer confirm the whole C0 gate. Only then is
the bounded C1 package ready for the user's implementation decision.
