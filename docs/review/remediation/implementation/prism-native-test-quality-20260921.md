# Prism native test quality follow-up — 2026-09-21

Pre-implementation criteria. This resolves baseline lint errors encountered by the
resource-policy slice without suppressions or relaxed rules. Existing resource
review evidence remains immutable and records the previous source state.

| Criterion | Required observation |
| --- | --- |
| NQ1 | Rename all three Prism `*.native.mts` tests to canonical `*-native.mts`; update both active package globs; exact original test membership preserved. |
| NQ2 | Extract controlled artifact HTTP service setup from the oversized native-attribution callback into a coherent helper; preserve every assertion, deadline, CPU burn, native harness and lifecycle ordering. |
| NQ3 | All resource-slice changed TS/JS sources, renamed native tests and extraction pass canonical lint and Prism typecheck, without exclusions or rule weakening. |
| NQ4 | Attempt original native suite; unavailable host requirements remain explicit failures, never skipped or replaced by fabricated execution. Mechanical renames require identical bytes; extraction requires semantic source comparison and unchanged assertion/deadline inventory. |
| NQ-DOC | Update active paths and historical-prose clarification without rewriting archived evidence; report exact checks and limitations. Fresh independent follow-up review required. |

Implementation and bounded independent review are complete; native host execution
remains unverified. No host, launcher, cgroup or database prerequisite is
fabricated to make the original native suite pass.

## Implementation and checks

All three native modules are now `worker-http-cancellation-native.mts`,
`worker-process-shutdown-native.mts` and `worker-readiness-native.mts` under
`skills/prism/tests/`. Their bytes are identical to the pre-rename snapshots.
Both `skills/prism/package.json:test:worker:native` and root
`package.json:verify:prism:native-worker` select `*-native.mts`; the attribution
integration module remains explicitly selected. No old native glob remains.

`startControlledArtifactService` contains the existing artifact HTTP handler,
auth assertions, read-start/release barriers, listener setup and server cleanup.
The original test awaits it at the same point after storing the input. The CPU
burn, native harness, dispatch, receipt assertions and timeout remain in the test.
No assertion or runtime prerequisite was removed or replaced.

Evidence is in
[`prism-native-test-quality-20260921`](../../evidence/prism-native-test-quality-20260921/).

- `before-identities.json` and `before/` preserve the exact six pre-change files.
- `verify-equivalence.mjs` and `equivalence.json` prove identical renamed-file
  SHA-256 values, a complete bijection between old and new native glob members,
  and that package-file bytes differ only in those glob strings. Inlining the
  extracted helper restores every original parsed non-trivia token; assertions,
  test names, numeric constants and deadlines remain identical. This comparison
  establishes the mechanical transformation, not actual kernel behavior.
- `lint-final.txt`: canonical lint **exit 0** across all resource-slice changed
  TS/JS files, the three renamed modules and extracted integration test. No rule,
  exclusion or maximum was changed. This final list also explicitly includes
  `swarm-resource-operation.test.mts`, omitted from the earlier author lint list
  although its real tests and typecheck had executed. The previous omission is
  not relabeled as earlier lint coverage.
- `typecheck.txt`: original Prism typecheck **exit 0**.
- `native-suite.txt` and `native-suite-run.json`: the original root native command
  was attempted and **did not pass**. It fails the unchanged requirement for
  `PRISM_NATIVE_ISOLATED_TEST_POOL=true`; no isolated host was configured. The
  runner terminated only its own process group after 35 seconds when pending
  native-test activity kept the suite open. Later serial modules were interrupted,
  so this is not an executed full native suite or a kernel proof.

The first equivalence checker used a standalone lexical scanner that did not
handle template-literal context correctly. That checker failure remains in
`equivalence-initial-checker-failure.txt`. The corrected checker traverses the
actual TypeScript parse tree's tokens; product/test code was not adjusted to make
that comparison pass.

The configuration inventory now links current filenames while preserving its
historical lint observations. Archived evidence, source hashes and snapshot paths
remain unchanged; generated ledger entries referring to old-named **snapshot**
files remain valid. Current full changed-set lint is green, while native runtime
acceptance still requires a real isolated host. The [fresh independent follow-up review](independent-prism-native-test-quality-20260921.md)
accepted this bounded maintenance change; it does not close native runtime acceptance.
