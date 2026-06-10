# Adding Verification

Status: current
Audience: developer

## Purpose

Show where to add tests when behavior or documentation changes.

## Verification layers

- Behavior areas: `tests/verification/behavior/areas/*.mjs`
- Behavior harness: `tests/verification/behavior/verify.mjs`
- Deployment truth: `tests/verification/deployment/check-deployment-truth.mjs`
- Runtime smoke checks: `tests/verification/runtime/`
- Contract checks: `tests/verification/contracts/`

## Adding a behavior check

1. Choose the narrowest existing area when one already owns the behavior.
2. Add a `record(...)` case with source-root-relative fixtures or overlay materialization as needed.
3. Assert exact behavior, not broad implementation details.
4. Keep test data isolated under temporary roots or overlay trees.
5. Run the single area before wider checks.

## Adding a deployment check

Deployment checks should compare chart/source truth with rendered manifests. Use structured parsing when possible. Avoid string-only assertions unless the checked surface is comments, command text, or a deliberate source marker.
