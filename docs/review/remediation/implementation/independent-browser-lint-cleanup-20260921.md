# Independent review: browser and image-input lint cleanup

The fresh reviewer accepted the bounded BL1–BL5 cleanup on 2026-09-21. No production code or original tests were changed by this reviewer. This approves the cleanup, not completion of IFR-21, CONFIG, Docker builds or browser execution.

## Reviewed behavior and policy

The comparison baseline was the source snapshot retained by the previous independent browser review, not the much older repository HEAD. The archive identity predicate and its exception moved unchanged into `validateArchiveIdentity`; architecture completeness, archive membership/order and size limits remain enforced by the same conditions. The actual literal `createRequire` path resolves to the same installed Playwright bundle as the former absolute expression and exposes its real `utils.extractZip` function.

The GitHub entrypoint's early returns preserve manual dispatch, missing previous revision, all-zero previous revision and real digest comparison. An independent probe executed both previous and current entrypoints against an actual temporary Git repository for those branches, unchanged and changed inputs, and pull-request base precedence. Their output bytes matched, including expected boolean output values. This checks the entrypoint rather than a copied decision expression.

The canonical ESLint diff adds exactly two file paths to the existing environment adapter declaration. Both modules perform the documented infrastructure boundary work: browser metadata subprocess environment forwarding and GitHub workflow input/output. Effective ESLint configuration confirms direct environment access alone is exempted for those two files; complexity, environment defaults, dynamic loading and fallback-chain rules remain errors. An unlisted sibling module remains subject to direct-environment-access enforcement. No baseline or broad disable was introduced.

## Independent evidence

- [Canonical lint output](../../evidence/browser-lint-independent-20260921/lint.txt): exit 0 for both production modules and their associated tests. The empty file reflects a successful silent ESLint run.
- [Original combined regression suite](../../evidence/browser-lint-independent-20260921/tests.txt): **30/30 passed**, zero failed, skipped, cancelled or todo tests; exit 0. Command: `node --test scripts/tests/trivy-database-lock.test.mjs scripts/tests/browser-archive-lock.test.mjs tests/verification/deployment/versions.test.mjs tests/verification/deployment/runtime-input-locks.test.mjs`.
- [Independent probe source](../../evidence/browser-lint-independent-20260921/probe.mjs) and [raw results](../../evidence/browser-lint-independent-20260921/probe.txt): 14 archive validator cases compare results and error messages with the previous reviewed source, including minimum/maximum sizes, invalid size/hash/URL/path/extra field, wrong order and missing architecture. A private-copy mutant removing the 1 GiB upper bound demonstrably accepts the oversized case rejected by production; this independent oracle detects that regression. This is a probe mutation, not a claim that the original combined suite alone detects it.
- [Source hashes and retained snapshots](../../evidence/browser-lint-independent-20260921/source-identities.json) bind the reviewed current modules, lint policy, original test files and implementation note. The probe creates and deletes only its private temporary fixture directory.

The implementation note accurately states the refactor, exact policy adjustment and local validation limits. Its “independent review remains required” records the state before this review; this document supplies that review. No unresolved finding remains within this cleanup scope. Full container installation, archive extraction, browser launch and host-native behavior were not re-proven by this cleanup review; earlier evidence retains its original limits.
