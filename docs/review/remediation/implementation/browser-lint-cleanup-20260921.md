# Browser installer and image-input adapter lint cleanup

## Acceptance criteria recorded before editing

- BL1: Split archive identity validation into a named operation without changing the accepted lock identities, size bounds, archive order or failure messages.
- BL2: Resolve the existing Playwright core bundle through a literal module path relative to this script; do not add a dynamic-loader exemption.
- BL3: Declare only the browser metadata subprocess adapter and the GitHub image-input entrypoint as environment boundaries in the canonical lint policy. Keep all other rules and the existing baseline unchanged.
- BL4: Express the image-input change decision with explicit early returns, preserving manual dispatch, absent/all-zero previous revision and digest comparison behavior.
- BL5: Canonical lint for both production modules and both associated tests passes, and the original combined archive/input/version tests pass. Record actual results and limitations below. A fresh independent review is required; this note is not an approval.

These two modules already serve infrastructure boundaries: the browser adapter forwards the invoking environment to a subprocess with two explicit Playwright platform overrides, and the GitHub entrypoint consumes workflow metadata and writes the workflow output file. The declarations are exact file paths, not directory patterns. No environment default or alternate configuration authority is added.

## Implementation and verification

`browser-archive-lock.mjs` now calls `validateArchiveIdentity` for each entry. The unchanged predicate and exception move together; architecture completeness and ordered browser membership stay in `browserLock`. The literal `../node_modules/playwright-core/lib/coreBundle.js` resolves from the same `createRequire(import.meta.url)` location as the previous absolute expression.

`runtime-inputs.mjs` now returns early for manual dispatch, an absent previous revision, or an all-zero revision, then compares digests. This removes a boolean expression incorrectly caught by the fallback-chain rule without changing that rule. The canonical policy adds only `scripts/browser-archive-lock.mjs` and `scripts/updates/runtime-inputs.mjs` to the existing exact environment-adapter list. It does not exempt either file from complexity, dynamic imports, fallback chains or environment defaults.

Canonical ESLint on the two modules and their two associated tests exited 0: [raw output](../../evidence/browser-archive-lock-20260921/lint-cleanup.txt). The unchanged combined suite for Trivy locks, browser locks, version generation and image-input classification passed **30/30**, with zero skipped/cancelled tests: [raw output](../../evidence/browser-archive-lock-20260921/combined-input-locks-lint-cleanup.txt). These are local regressions, not a new Docker build or browser launch proof. The subsequent [fresh independent review](independent-browser-lint-cleanup-20260921.md) repeats these checks and adds validator parity, bounds mutation and actual workflow-entrypoint probes; no finding remains within BL1–BL5.
