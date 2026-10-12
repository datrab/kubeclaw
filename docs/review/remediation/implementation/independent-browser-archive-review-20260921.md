# Independent browser archive review

Reviewer: fresh `browser_locks_fresh_review` agent, uninvolved in implementation.
Scope: the BA01–BA08 matrix in `browser-archive-lock-20260921.md`, its actual
production consumers and update documentation. This is not complete IFR21 image
acceptance. Production source was not modified by this review.

**Current result: the three findings below are corrected and independently
rechecked.** This accepts the bounded browser archive implementation, not complete
IFR21 image acceptance. The initial review required changes because production
COPY inputs were excluded and script changes were invisible to image selection.

## Findings

1. **High — required COPY inputs excluded from Docker context.** Original root
   `.dockerignore` excludes `versions.json` and both new installer scripts, which
   the Dockerfiles explicitly COPY. The initial review incorrectly included the
   two lockfiles in this finding: actual Moby evaluation establishes that
   `!docker/` already included them and arbitrary files below that directory.
   This correction is independently reproduced in
   `original-context-correction.txt`, retaining the original reviewed source.
   BA06's passing test
   checks COPY strings only and cannot establish context availability. Add the
   exact required inputs and a regression covering the effective build context;
   preserve exclusion of local state, node_modules and secrets. A Docker build
   was unavailable here; this finding is derived from the actual exclusion rules
   and required COPY sources, not an invented build execution.
2. **High — production verifier changes do not trigger image rebuilds.** Actual
   `isImageInput` and `isDeploymentInput` both return false for
   `scripts/browser-archive-lock.mjs` and `scripts/trivy-database-lock.mjs`.
   Generated lock updates are covered through `docker/`, but a verifier-only
   correction can retain the previously selected image. Classify both production
   scripts and test the classification/selection consequence.
3. **Medium — contradictory operator documentation.** The paragraph immediately
   before “Playwright browser archives” still says independently verified archive
   hashes remain unfinished. The new section correctly describes implemented
   authored hashes and outstanding image/runtime proof. Reconcile the earlier
   sentence without claiming image reproducibility or browser launch.

## Independently obtained evidence

Raw outputs and reviewed source snapshots are under
`../../evidence/independent-browser-archives-20260921/`.

- `tests.txt`: original browser and version regression suites, 11 passed,
  0 failed/skipped. `versions.txt`: actual generator check passes.
- `archive-hashes.txt`: independent Python streaming SHA-256 and byte counts for
  all ten cached upstream archives equal authored/generated identities. All ten
  existing extracted executable hashes, sizes, permissions and markers match
  the implementation's extraction receipts.
- `zip-executable-comparison.txt`: independently decompress each ZIP executable
  with Python's ZIP reader and compare its SHA-256 with the actual extracted
  file. All ten match. This substantiates archive-to-extraction identity, not
  executable compatibility or a browser launch.
- `metadata.txt`: both architecture layouts, first upstream URLs and executable
  paths agree with the installed pinned Playwright registry. Package lock and
  installed Playwright version agree.
- `mutant-digest.txt`: a temporary copy removes only SHA-256 comparison; the
  original corruption test fails. Actual production source remains unchanged.
- `wrong-architecture.txt`: actual CLI rejects arm64 on this x64 Linux process
  before download. Platform override is set internally only for metadata lookup;
  it does not bypass the CLI's actual architecture gate.
- `runtime-inputs.txt`: direct production predicate calls reproduce finding 2.
- `source-identities.json` maps complete source snapshots to their hashes.

## Design and remaining limits

The installer is small and direct: one authoring source, generated identity lock,
installed metadata agreement, size/hash verification before original extraction,
exclusive staging directory and absent-destination publication. Existing and
dangling-symlink destinations are rejected. The updater emits a separate proposal
and does not silently modify production authority. Strict entry keys reject extra
archive fields. The Dockerfiles remove the unverified Playwright install command
and retain original OS dependency installation. Prism's Playwright dependency is
a production dependency, so its prune step retains the core extractor.

No actual image was built, no browser was launched, and neither native ARM64
execution nor complete I2/I3 image comparisons are established. The original
extractor execution receipt is corroborated by real cached bytes and ZIP payloads;
this reviewer did not rerun all ten extraction operations. No finding/register
closure is authorized by this report.

## Independent re-review of corrections

The same independent reviewer inspected the corrected source and obtained fresh
results, without changing production implementation:

- `.dockerignore` now permits versions and both installers. `docker/*` makes the
  intended directory allowlist effective; both locks are explicitly permitted.
  Nested `.env` exclusions close a real omission exposed by the new tests.
  `context-corrected.txt` records the three passing Go test groups, using pinned
  official Moby patternmatcher/ignorefile v0.6.0, all currently explicit local
  COPY sources, protected-path exclusions and five allow-rule removal cases.
  An independent temporary mutant removing `!versions.json` makes the actual
  COPY-source assertion fail (`mutant-context-corrected.txt`). Whole-context COPY
  and internal stage contents still require actual image build acceptance.
- The production selector now recognizes both installers and includes authored
  browser/database identities in the versions digest projection. The new tests
  create real Git commits, prove both identities alter input digests, prove
  installer changes/deletions alter them, and preserve infrastructure-only reuse.
  `tests-corrected.txt` contains 13 passing browser/version/selection tests with
  no skips. Independent temporary classifier-removal and projection-removal
  mutants each fail (`mutant-classifier-corrected.txt` and
  `mutant-projection-corrected.txt`).
- The contradictory operator paragraph now describes verified byte identities
  and continues to distinguish unresolved complete image comparisons and runtime
  checks. Update and interrupted-installer recovery instructions remain clear.

These corrections resolve this review's three findings. A broader parent-run
suite reported a separate chart-symlink release-verification failure; this review
does not convert the focused passing tests into a pass for that broader gate.
Docker image builds, browser launches and complete I2/I3 evidence remain open.
