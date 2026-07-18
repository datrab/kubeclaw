# Real E2E Matrix Status

Status: current
Audience: maintainers, pipeline developers

## Current Result

The canonical real E2E matrix contains 46 cases owned exactly once by eight suites. As of 2026-07-18, every case has a green latest result, including the full-pipeline smoke, failure/retry contracts, human gates, final deployment, Git authority, infrastructure degradation, module graphs, and crash/resume recovery.

This page records current matrix truth. Git history and ignored `.swarm/real-e2e/` run artifacts retain investigation detail when needed.

## Execution Model

- Suites are the aggregate execution and reporting boundary.
- Cases remain independently selectable for focused diagnosis.
- Each case restores a declared checkpoint hook, mutates only its owned fault surface, executes only its declared boundary, and stops when its evidence contract is satisfied.
- `auto` and `reuse` never silently fall back to a full lifecycle when a checkpoint is missing or invalid.
- Expected-failure cases prove typed terminal authority; they are not considered successful merely because the process exits nonzero.
- Full pipeline work is reserved for cases whose contract requires it.

## Commands

Run one case:

```bash
node tests/verification/e2e/run-real-pipeline-failure-matrix.mjs \
  --mode full \
  --scenario multi-module-independent-success \
  --keep-artifacts
```

Resume a suite from a case:

```bash
node tests/verification/e2e/run-real-pipeline-failure-matrix.mjs \
  --mode full \
  --suite module-graph \
  --from-scenario multi-module-independent-success \
  --keep-artifacts
```

Run the eight-suite matrix:

```bash
node tests/verification/e2e/run-real-pipeline-failure-matrix.mjs \
  --mode full \
  --continue-on-failure \
  --keep-artifacts
```

## Authorities

- Scenario and suite registry: `tests/verification/e2e/failure-scenarios.mjs`
- Runner: `tests/verification/e2e/run-real-pipeline-failure-matrix.mjs`
- Checkpoint restore/validation: `tests/verification/e2e/checkpoints.mjs`
- Hook and mutation contracts: `tests/verification/e2e/failure-scenarios.mjs`
- Evidence: `tests/verification/e2e/real-run-evidence.mjs`
- Contract audit: `tests/verification/contracts/check-checkpoint-hook-contracts.mjs`

The matrix is a verification surface, not production state authority. If a run exposes a mismatch, fix the harness when its contract is wrong and production code when runtime behavior is wrong.
