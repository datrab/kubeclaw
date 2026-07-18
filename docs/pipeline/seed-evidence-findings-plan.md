# Real E2E Seed Contract

Status: current
Audience: maintainers, pipeline developers

## Purpose

The seed is the canonical full-pipeline fixture used to create reusable checkpoint bundles. It proves production-shaped state and artifact boundaries once; focused cases restore only the checkpoint state their contracts declare.

## Fixture

The standard fixture contains four modules:

- `01-nginx`: foundation
- `02-nginx` and `03-nginx`: independent parallel branches
- `04-nginx`: dependent integration module

The fixture intentionally uses small deterministic source surfaces while exercising Forge, Buster, module review, approval, final deployment, final review, terminal summaries, telemetry, and cleanup when the selected boundary includes them.

## Required Properties

- Pipeline run identity is distinct from harness workspace/seed identity.
- Every watched agent artifact is atomically published through a pipeline-owned envelope.
- Module-specific checks prove each module's owned surface.
- Buster deterministic suites own test evidence and severity inputs.
- Lifecycle events and read models own scheduler state.
- Run-scoped summaries, telemetry, Discord audit, Redis audit, and cleanup evidence remain correlated by canonical identity.
- Final-preview cleanup changes lease policy to delete and waits for controller-backed lease removal.
- Terminal generators run only for boundaries that own them.

## Checkpoint Use

Checkpoint bundles carry their hook contract, fixture family, source identity, and required/forbidden state. Restore re-normalizes harness-owned runtime defaults, applies only the declared scenario mutation, and does not retain downstream artifacts outside the hook.

There is no implicit full-run fallback. Missing or incompatible checkpoint state fails before scenario execution.

## Authorities

- Fixture: `tests/verification/e2e/fixtures/nginx-project/`
- Workspace builder: `tests/verification/e2e/real-run-workspace.mjs`
- Checkpoints: `tests/verification/e2e/checkpoints.mjs`
- Hook and mutation contracts: `tests/verification/e2e/failure-scenarios.mjs`
- Evidence: `tests/verification/e2e/real-run-evidence.mjs`

## Verification

```bash
node --test tests/verification/e2e/checkpoints.test.mjs
node --test tests/verification/e2e/real-run-workspace.test.mjs
node tests/verification/contracts/check-checkpoint-hook-contracts.mjs --source-root "$PWD"
```
