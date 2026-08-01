# Adding Verification

Use TypeScript or the component's native language.

- Package behavior: a package-local TypeScript live-function test.
- Package boundary: a package-local boundary test.
- Core contract: `tests/verification/contracts/`.
- Real system run: `tests/verification/e2e/run-real-pipeline-e2e.mts`.

Every plugin must prove pass, control-result failure, denied authority,
timeout/cancellation, crash containment, and relevant recovery/idempotency.
