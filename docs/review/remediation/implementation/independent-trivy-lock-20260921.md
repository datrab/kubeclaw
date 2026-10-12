# Independent review: Trivy database input lock

Review date: 2026-09-21. Reviewer: fresh `trivy_review_resume` subagent, not
involved in implementation. Scope is the Trivy input-lock slice of IFR-21-001,
not whole-image reproducibility or the full remediation goal. The earlier
`independent-tests.txt` was produced by a different reviewer and is not claimed
as this reviewer's execution.

## Result and finding

The inspected loader and production wiring implement the intended narrow design:
`versions.json` owns both official database identities; the generated lock binds
them to the scanner version; the image invokes the actual CLI; the CLI rejects
authored/generated drift and installed-scanner mismatch before network access.
Installation requests manifest/layer digests only. Manifest, archive and extracted
file identities are checked before publishing both databases by one directory
rename. Existing destinations and competing installers fail closed. Archive
listing rejects extra, duplicate, linked and traversal members. No production
mirror/tag fallback or per-run refresh argument remains in the inspected paths.

**R-TD-DOC-1 (fixed and rechecked):**
`docs/review/remediation/implementation/trivy-freshness.md`, “Controlled refresh
route”, still describes `TRIVY_DATABASE_REFRESH`, workflow run-ID cache busting
and manual refresh arguments as current instructions. Those paths were removed.
Mark that section explicitly historical/superseded and link the current authored
lock update procedure, or update its operational prose. This matters because the
old advice no longer selects fresh data. The new operations guide correctly
explains that a workflow rerun alone retains the selected advisory bytes.

The root added an explicit historical/superseded notice before the old section,
identifying the removed argument, current authority and current operational link.
I reread the corrected text and verified the relative link target exists. This
resolves R-TD-DOC-1 without rewriting historical evidence.

No other blocking implementation defect was identified in this bounded review.
This is not proof against malicious concurrent writes to the private build staging
area, decompression resource exhaustion by a newly approved upstream artifact,
or power-loss durability. Such guarantees are not asserted by the new guide.

## Independently executed evidence

The complete requested command passed **19/19 tests, zero skipped**:

```sh
node --test scripts/tests/trivy-database-lock.test.mjs tests/verification/deployment/versions.test.mjs
```

Raw output: `docs/review/evidence/trivy-database-lock-20260921/independent-resume-tests.txt`.
The tests execute the production installer, real archive listing/extraction,
filesystem publication, SHA-256 calculations and a separately launched actual
CLI. Small database fixtures are visibly identified as fixtures and do not
masquerade as usable Trivy databases. The transport double checks content-addressed
requests; CLI negative cases use a failing curl sentinel, with a matching-version
positive control proving that the network boundary is reachable.

I independently copied the current implementation/tests into temporary directories
and removed one integrity check at a time. The manifest cases failed when raw
manifest verification was removed, archive cases failed when archive verification
was removed, and the extracted-file case failed when file verification was
removed. These are deliberately selected mutation cases, not a replacement for
the complete passing suite. Their raw outputs are
`independent-resume-mutant-{manifest,archive,extracted}.txt` in the same evidence
directory. `independent-resume-source-identities.json` records SHA-256 of the
reviewed sources and the mutation exit codes. The original files were not changed.
I also independently hashed the two preserved raw manifests and metadata files:
all four exact sizes/digests match the authored generated lock.

## Production and documentation limits

The source-wiring assertion verifies concrete Docker COPY/RUN statements and
absence of replaced workflow paths; it is correctly labelled as source evidence,
not an image build. Docker build execution, independent complete image comparison,
ARM64 execution and scanners exercised in finished images remain unproved here.

During final recheck, the root completed `native-restart.txt`: **1/1 passed**,
actual Trivy 0.74.0 returned five lodash vulnerability records. I read the native
test: it installs actual downloaded OCI bytes through the production integrity
and extraction path, invokes the real scanner with update/network-disable flags
and dead proxy endpoints, requires a real advisory lookup, and checks every
installed DB/metadata identity after scanning. This proves the bounded npm
lookup and unchanged inputs; it does not exercise Java advisory lookup or a
finished image. This is root-executed evidence inspected here, not a native scan
independently executed by this reviewer. Earlier empty `native.txt` provides no
passing evidence.

The updated operations documents give actual resolver/sync/check commands,
explicit freshness/rebuild cadence, original metadata preservation and abandoned
publication-guard handling. They preserve the open full-image gates and do not
claim IFR-21-001 closed. The corrected documentation and bounded input-lock
implementation pass this review; the explicitly listed broader gates remain open.
