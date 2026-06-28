# Adding Verification

Status: current
Audience: developer

## Purpose

Show where to add tests when behavior or documentation changes.

## Verification layers

- Real E2E scenarios: `tests/verification/e2e/*.test.mjs`
- Real E2E harness: `tests/verification/e2e/run-real-pipeline-e2e.mjs`
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

## Claim-To-Test Additions

When a documentation change adds or strengthens an operational claim, add or update the narrowest proof:

- docs inventory/generated-reference claims: `scripts/docs-check.mjs`, `scripts/docs-inventory.mjs`, `scripts/docs-generate.mjs`, or `scripts/docs-check.mjs`
- deployment/chart/security/storage claims: `tests/verification/deployment/check-deployment-truth.mjs`
- lifecycle/status/recovery claims: `tests/verification/contracts/check-status-store-slice-surface.mjs` or `tests/verification/e2e/real-run-evidence.test.mjs`
- Buster task/suite/ACK/dead-letter claims: `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs` and focused Buster service tests
- telemetry/observability claims: `tests/verification/contracts/check-telemetry-contract.mjs` and telemetry contract tests

Update `../reference/verification-commands.md` when a new command becomes part of the operator/developer proof surface.

## Worked Pattern

1. Pick the narrowest verifier that owns the claim. Use real E2E scenarios for runnable behavior, contract checks for API/surface invariants, deployment truth for rendered Kubernetes/deploy-script claims, and docs checks for generated/reference drift.
2. Add a fixture or overlay that proves one reader-visible claim. Avoid a broad "contains text" assertion when a structured parser can inspect JSON, YAML, Helm output, or exported constants.
3. Make failure output point to the source owner and the broken invariant.
4. Add the command to the page that made the claim, not just to the test file.

Example claim-to-proof mapping:

| Claim | Good proof target | Bad proof target |
| --- | --- | --- |
| a Secret key is required by deployment | `check-deployment-truth.mjs` plus generated inventory | prose-only mention in `docs/deployment/secrets.md` |
| Buster rejects unsafe paths | `tests/skills/buster/pipeline/services/task-validation.test.mjs` | a pipeline end-to-end run that happens not to escape paths |
| telemetry event names are stable | `check-telemetry-contract.mjs` and `telemetry-docs` area | manual list in a doc with no source check |
| docs generated output is current | `npm run docs:generate:check` | editing generated Markdown directly |

If a verifier needs live cluster state, name the limitation. Repo-only checks should not pretend to prove provider credentials, tailnet policy, CNI behavior, or external webhook delivery.
