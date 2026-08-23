# Test-Suite Migration Workflow v2 Final Audit

Status: implementation complete; final independent review pending

## Scope

This change hardens the reusable implementation, parity, and cutover workflow.
It does not change provider runtime behavior or gate authority.

The work started from `b03d159a0822d2d095719df4034798e81996c053`.

## Changes

- Added hard entry and exit gates for each migration phase.
- Added reusable migration document templates.
- Defined one checked JSON baseline format for new migrations.
- Added one machine-readable status record for 13 legacy suites.
- Added a generated human-readable status page.
- Added generic baseline, parity, and cutover checks.
- Added package ownership and import-boundary checks.
- Added schema-field documentation checks.
- Added stable-error documentation checks.
- Added real JSON Schema validation for documented provider examples.
- Added controlled-language checks for selected migration guides.
- Added proof-limit rules for unavailable external facilities.
- Added exact post-rebase verification requirements.
- Expanded container-build user and operator documentation.
- Added container-build configuration, error, and security references.
- Corrected stale container-build phase status.
- Added positive, dual-authority, and absence-test records to cutover inventories.
- Added execution of declared cutover tests to the workflow gate.
- Added direct checks for deleted legacy files and required replacement files.

## Mock and Wrapper Use

This hardening change adds no product mock or runtime wrapper. Documentation
examples are checked with the real provider JSON Schema. Error coverage reads
real production source files. Cutover evidence cites executable repository
tests. The workflow gate runs each test and checks each concrete deletion target.

The existing contained BuildKit contract emulator remains documented. It is
used only because the Nova pod has no BuildKit daemon. The guides state what it
proves and what remains for the final external proof.

## Verification

These checks passed:

- `npm run verify:migration:workflow`
- `npm run verify:migration:package-boundaries`
- `npm run verify:docs:schema-fields`
- `npm run verify:docs:error-codes`
- `npm run verify:docs:examples`
- `npm run verify:docs:controlled-language`
- `npm run verify:migration:status`
- `npm run docs:check`
- `npm run verify:test-gate:phase10`
- `npm run verify:test-gate:manifest-lint-cutover`
- `npm run verify:test-gate:container-build-cutover`
- `npm run verify:test-gate:container-build-parity`
- `npm run verify:test-gate:traceability`
- `npm audit --omit=dev`
- `git diff --check`

The production dependency audit reported zero vulnerabilities.

## Pre-Existing Main-Branch Failures

The complete `verify:contracts` command stops in `knip:check`. The current main
branch has incomplete Prism Studio dependency and usage records. The same main
branch also fails `typecheck:skills` because the Prism contract TypeScript
configuration does not extend the required base configuration.

These failures existed before this workflow branch. This change does not edit
Prism. The focused migration, documentation, package-boundary, and retained
test-gate checks pass.

## Review

The review used Codex with `gpt-5.6-terra` and high reasoning.

Nine findings were accepted and fixed:

1. Documentation examples now use the real provider JSON Schema.
2. The `buildctl` path rules are consistent in both operator references.
3. Parity checks now reject invalid dispositions and empty proof.
4. Cutover inventories now require concrete deletion and verification evidence.
5. Cutover checks now run the tests and check deletion and replacement files.
6. The main workflow gate now runs package ownership and boundary checks.
7. Executed cutover test paths must remain inside the repository.
8. Executed cutover tests cannot escape through symbolic links.
9. Baseline checks now validate content, item identity, and required records.

No finding was rejected. All nine findings were corrected and the affected
checks passed. A final review attempt then reached the Terra account usage
limit before it could inspect the corrected patch. The independent closeout
gate must run again before merge.

## Result

Workflow v2 is technically ready for the bundle-to-size-budget migration.
Future migrations must use the templates and machine gates. Manual
migration-count paragraphs are no longer authoritative. Merge remains blocked
until the final independent review completes.
