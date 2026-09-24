# Suite 12 E2E Phase 10 cutover plan

## Purpose

Delete the legacy E2E authority and make the provider plan the only source authority.

## Required work

1. Delete the old `e2e.ts` runtime.
2. Remove `e2e` from the legacy protocol and suite registry.
3. Mark the bridge migrated only after implementation and parity proof pass.
4. Reject all retired E2E selectors and configuration in project setup.
5. Package the Playwright provider in Buster.
6. Add the provider to the real production workspace.
7. Add a digest-bound deployed production preflight and signed receipt.
8. Verify sole-path, dual-authority, and legacy-absence checks.

## Deletion inventory

Delete the legacy E2E runtime. Remove the legacy protocol value, suite-runner branch, capability mapping, production-pipeline selector, progress examples, and live Prism consumer. Project setup must reject `test_suites: ["e2e"]` and `test_config.e2e`; it must not translate them. Runtime bundles must exclude generated `test-results`, `playwright-report`, and `.playwright` directories.

## Production route

The only accepted route is project declaration → Nova resolution → signed immutable archive → authenticated Buster job → isolated provider → `browser.playwright` → real browser → common E2E result → admitted evidence → Nova decision. The preflight must use a digest-bound deployment image and store a suite-specific signed receipt. A contained run cannot satisfy production acceptance.

## Rollback rule

Rollback can restore the previous signed Nova and Buster images only when they do not restore the deleted legacy E2E authority. A failed deployed proof keeps production acceptance pending. It does not change source-cutover truth. Store the failed receipt and cleanup evidence.

## Final checks

Run the Phase 8 and 9 gates again, project-scaffold negative tests, legacy runtime tests, package ownership, runtime bundle construction, migration workflow, documentation publication, TypeScript checks, the fresh-context architecture audit, and Terra/high autoreview. Fix each valid finding and repeat review until clean.

## Exit criteria

The replacement is the sole source authority, every required replacement file is packaged, every legacy surface is absent, and all source gates and reviews are clean. Production acceptance stays pending until the final controlled deployment cycle.
