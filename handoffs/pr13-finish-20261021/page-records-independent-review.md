# Independent A91211 eight-target candidate review

**NOT_READY: exactly two material finding families.** Main and frozen candidate untouched. This is complete bounded implementation/content review, not gate acceptance.

## F1 — Declared Source dirty guard can miss real drift

`scripts/docs-reader/page-records.mjs:51–58` compares the revision to the effective worktree via `git diff revision`, plus nonignored untracked files. That is not an independent index comparison, and it trusts assume-unchanged/skip-worktree index suppression for tree descendants.

Actual original fixture and normal `verifyReaderPageRecords` API counterexamples:

- Mark `src/tree/item.txt` assume-unchanged, change actual physical bytes: verification succeeds.
- Same with skip-worktree: verification succeeds.
- Stage changed `src/declared.txt`, restore committed physical bytes without restoring index: verification succeeds although cached diff lists the change.
- Same staged/restored change for `src/tree/item.txt`: verification succeeds.

The committed tree-object hash remains correctly labelled; the defect is the separate advertised current declared-path/index drift guard. Reproduction and actual observations: `page-records-independent-indexflags-probe.mjs/.json`. Finite repair: independently compare index against revision and reject masking flags within declared tracked scopes (or physically verify the exact finite Git-owned descendants). Do not clear user flags, scan an inferred implementation closure, or alter runtime. Maintain all four negative controls.

## F2 — Normal production checker can downgrade itself to fixture compatibility

`scripts/docs-reader/check-artifact.mjs:56–58` uses artifact-controlled presence of `pageRecords` or `build-report.json` to decide whether the new consumer guard runs. A real mapped artifact passes normal CLI; removing both pageRecords and the unbound build report, without changing any mapped output bytes/hash, makes the same normal CLI succeed again. Current missing-record negative keeps the report and therefore misses this bypass.

Actual reproduction: `page-records-independent-production-sentinel-probe.mjs/.json` (baseline0, stripped0). Make the normal production CLI require pageRecords; preserve isolated legacy renderer compatibility through an explicit caller-selected fixture mode/API, not absence of files controlled by the artifact. Add actual CLI deletion-of-both negative and explicit fixture positive. This does not demand an authenticated manifest or impossible proof against coordinated replacement of every Source/output; it only prevents silently skipping the intended normal consumer.

## Complete remaining scope

Read complete new page-record API and14 owning tests, artifact checker, renderer/layout/shared assets, redirects/continuity, publication assets/metadata/governance, full public chapter and workflow. Read publisher eager imports/input initialization and exact build/caller/mode handoff; reused unchanged original whole-family publication and redirect proofs rather than claim a fresh unrelated catalogue-generator review. The8 target hashes and11 packet hashes match. Six existing targets equal their declared baseline in actual main; both new targets remain absent. Eight support module/test bytes match main exactly, recorded in `page-records-independent-hashes.json`.

The remaining implementation is bounded and coherent: four committed authority inputs; exact positive pages/owner routes; file versus Git-tree object hash representations; external unacquired references; immutable commit object reads; path/type/symlink rejection; current nonignored untracked detection; no inferred transitive closure. Page/dependency cache is per compilation only. Imports use normal exported layout/shared/fallback APIs and do not execute scanned product Source. Shared CSS/JS and exact fallback/home contents are checked against real Source-owned bytes, not only renewed manifest digests. The original emit compiler keeps unconditional existing-output rejection; verifyExisting cannot relax it. Readonly verification checks canonical/search/home/asset-directory reserved layout and retained target fragments, plus exact fallback bytes. Current real empty history stays empty; old route fixtures are explicit synthetic data. CI adds only one native suite to the existing read-only command, not triggers, permissions, deployment or pushes.

The whole chapter retains existing anchors/search/Source/diagram/preview/mode/cleanup scopes and old links. New prose accurately distinguishes artifact-local canonical paths, owner declarations versus closure, unacquired external content, fixture determinism versus actual production determinism, and deployment/hosting boundaries. Its unconditional drift/production-check statements require F1/F2 correction before full Source/semantic Reader/Quality PASS. No other material finding established in this bounded candidate.

## Actual checks and limits

Independent original command:56/56 native PASS,0skip, terminal0 (`page-records-independent-tests.txt`). This includes14 new tests and42 unchanged controls, meaningful actual selector/copy/renderer/readonly consumer and hash-renewed HTML/fallback/home/shared-output failures. The extra probes above run actual original public APIs/CLI in disposable real Git fixtures. They expose gaps despite those56 passes.

Author initial missing-test launch and55/56 continuity-failure iteration were read and retained as failures; the corrected fixture retains the old route before testing collision. Author syntax/YAML/single-page boundary results were read, not relabelled as independent global runs. No target product Source execution, main/register edits, current generator/DATA acquisition, fresh rendered production Reader, or two original production builds. Parent owns integration, exact Source-purpose bindings/current graph and full production determinism/Reader checks. No A91211/global/compound acceptance.
