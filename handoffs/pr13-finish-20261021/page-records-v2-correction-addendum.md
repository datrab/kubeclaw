# Separate v2 author remediation for complete F1/F2 families

The original `../publication-page-records-author/` packet and independent review,
probe sources/results and first diagnostics remain unchanged. This v2 is a
separate author candidate, **not independent acceptance**. `F1-F2-only.patch`
contains exactly six changed targets relative to v1; `candidate.patch` is the
complete ten-target proposal against original baseline. The two additional
shipping targets are existing renderer/redirect test files whose four isolated
checker callers now choose fixture compatibility explicitly.

## F1 — index flags and index-only drift

`sourceReader.current()` still inspects only already acquired declared paths.
Before its existing revision/worktree and nonignored-untracked checks, it now:

1. Reads tracked index entries below those finite scopes with the ordinary
   `git ls-files --cached -v -z -- <declared paths>` API, with optional locks and
   fsmonitor disabled as before. Requires normal `H ` entries; masking
   assume-unchanged/skip-worktree or unsupported index states stop verification.
   It never clears flags or repairs an index.
2. Independently compares the index with the bound revision through
   `git diff --cached --no-ext-diff --no-textconv --exit-code --quiet`.
3. Retains the original revision/worktree and nonignored-untracked comparisons.

The direct file/tree object identities, physical path checks, original bytes,
per-compilation cache, four JSON authority objects, hashes, dependency scope,
external unacquired references, positive page/route and redirect/shared-output
checks are unchanged. Tree hashes still mean Git tree-object bytes; ignored
installed files and undeclared paths remain outside the binding. This is not a
claim that ordinary `git diff HEAD` alone establishes cleanliness, an inferred
repo closure, a global clean-worktree requirement or an atomic concurrent snapshot.

New maintained normal-API controls reproduce and reject both hidden physical tree
changes (`assume-unchanged`, `skip-worktree`) and both staged/restored changes
(direct declared file, declared-tree member). Each checks that the ordinary
revision/worktree diff is empty first; staged controls also prove the independent
cached diff is nonempty. Assertions ensure verification leaves flags/index alone.
An unchanged flagged declared entry still stops; a tracked flagged/changed
**undeclared** neighbor remains outside this explicit scope and passes.

## F2 — production default cannot select its mode from artifact absence

The normal checker always calls `verifyReaderPageRecords`, regardless of missing
`pageRecords` or `build-report.json`. The artifact cannot downgrade itself by
removing both. CLI argument parsing accepts at most output-root/source-checkout
and one explicit leading `--legacy-renderer-fixture` flag; unknown/extra options
fail rather than silently choosing a mode.

Only a fixture caller selecting that option may omit records. A production
build-report without records still fails in that mode. If records are present,
they are always verified, even in explicit fixture mode. All original output
hashes, links, fragments and physical file guards run before either branch. The
four existing isolated renderer/redirect test callers now pass this exact flag;
CI/production checker calls remain normal and unchanged.

The new actual CLI control first passes a complete mapped artifact, proves an
invalid mapping fails even with fixture opt-in, removes records (production and
fixture-with-report fail), then removes the report too (normal CLI still fails).
Only explicit fixture mode accepts that unmapped fixture. Changed HTML remains
rejected even in fixture mode. The page contract now explains this caller choice
and says it is not production acceptance. It also states the finite index/flag
checks and preserves the dependency-closure and production-determinism limits.

## Actual checks

Final actual combined command:

```sh
node --test scripts/tests/docs-reader-page-records.test.mjs scripts/tests/docs-reader.test.mjs scripts/tests/docs-reader-redirects.test.mjs scripts/tests/docs-publication-assets.test.mjs scripts/tests/docs-publication-links.test.mjs
```

Terminal exit0, **62/62PASS,0skip**; raw `v2-native-tests-final.txt`, actual tool
chunk `c3b89b`. The preceding v2 iteration also reached62/62; the final iteration
adds the records-present/fixture-mode negative in the same owning case. Existing
42 regressions retain their original assertions and four explicit fixture callers;
20 page-record tests cover the complete current finite candidate. V1 failures,
56-test limitations and independent four index/stripped-pair counterexamples are
not rewritten as old successes.

Original bounded one-page reader-boundary CLI: terminal0, `v2-reader-boundary.txt`.
Eight proposed JavaScript targets pass syntax (`v2-syntax-checks.json`); complete
patch dry-run check against main terminal0 (`v2-patch-check.txt`). CI source bytes
are unchanged from v1; its original YAML PASS is reused only on those exactbytes.
No production publisher, generator, current graph acquisition or actual two clean
original production builds ran. Copied original metadata-all-pages test still
sees only the candidate documentation-site page, not main's whole corpus.

## Scope and remaining independent proof

Author reviewed the whole current page-record API and artifact consumer, their
actual publisher build handoff, unchanged normal renderer layout/shared/redirect
APIs and full v1 public chapter/CI semantics; v2 changes only the six deltas above.
The two existing test files are read complete and their only v2 edits are four
explicit fixture-mode arguments. No private extraction, Source transformation,
hash-renewal bypass, flag clearing, runtime permission or history invention.

Parent owns independent nonauthor rereview of these complete F1/F2 families,
installed original suites, Source-purpose/transitive bindings and normal ownership
refresh, then two clean source-frozen original production builds and all Reader
checks. Main/register/owner/generated Source remain untouched. No A91211, current
DATA/globalgraph, production build, runtime, hosting or release PASS is granted.
