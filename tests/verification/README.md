# Verification harness migration plan

This directory is the canonical home for the repo's verification entrypoints and verification docs.

## Quick run

Run the full verification suite from the repo root with:

```bash
./tests/verification/run-full-verification.sh
```

It runs the deployment truth guard, runtime collision guard, live subagent launch smoke, ACP launch-reachability smoke, telemetry contract guard, and the full behavior harness.

Current gate expectations:
- `tests/verification/run-full-verification.sh` is intentionally fail-fast; it exits on the first red surface
- if you need the full downstream failure set after a red wrapper run, rerun the canonical entrypoints directly
- live launch smokes are explicit gate surfaces, not implicit proof hidden inside the repo-only behavior harness

## Target end state

```text
tests/
  verification/
    behavior-verification.md
    packaging-verification.md
    lib/
      lifecycle-audit-lib.mjs
    deployment/
      check-deployment-truth.mjs
    runtime/
      check-runtime-collisions.mjs
    contracts/
      check-telemetry-contract.mjs
    behavior/
      verify.mjs
      areas/
        approval.mjs
        governance.mjs
        observability.mjs
        lifecycle.mjs
        gates.mjs
        summaries.mjs
```

## Mechanical migration rules

1. Move implementation, not behavior.
2. Use the canonical `tests/verification/...` entrypoints:
   - `node tests/verification/deployment/check-deployment-truth.mjs`
   - `node tests/verification/runtime/check-runtime-collisions.mjs`
   - `node tests/verification/contracts/check-telemetry-contract.mjs`
   - `node tests/verification/behavior/verify.mjs`
3. Retire compatibility wrappers intentionally, one small wrapper at a time.
4. Update docs to describe the `tests/` ownership first, then remove wrapper references as each wrapper is retired.
5. Split the behavior harness by coherent verification area only after the move is stable.

## Execution order

### Phase A, structure only
- create the `tests/verification/` tree
- move shared helpers into `tests/verification/lib/`
- keep wrappers in `scripts/` only long enough to preserve compatibility during the move

### Phase B, one-file move
- move `check-runtime-collisions.mjs`
- move `check-telemetry-contract.mjs`
- move the behavior-harness verifier
- verify parity before retiring each legacy shim

### Phase C, internal behavior-harness split
- extract shared fixture/setup helpers
- split behavior checks into area files
- keep `tests/verification/behavior/verify.mjs` as the single entrypoint

### Phase D, cleanup
- update all docs to point at `tests/` as the implementation home
- remove retired verifier shims from `scripts/`
- keep `skills/nova/pipeline.js` explicitly bounded as the thin compatibility entrypoint shim for `node /app/skills/pipeline.js`

## Definition of done for the migration slice

- verification implementations live under `tests/verification/`
- deprecated small verifier shims are retired once callers and docs are clean
- behavior-harness command output stays equivalent
- docs and layout no longer imply that verification harnesses are deployment scripts

## Verifier prerequisites

- the behavior harness at `tests/verification/behavior/verify.mjs` requires `python` on `PATH`
- `python3` alone is not sufficient if the `python` executable name is missing
- on Debian or Ubuntu, install `python3` plus `python-is-python3`
- `docker/Dockerfile.general` is the canonical general environment and should satisfy that prerequisite

## Current cleanup status

- `kubeclaw-main/docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md` remains the authoritative telemetry contract for canonical inventory, stream identity, and compatibility boundaries
- `kubeclaw-main/docs/telemetry-event-schema.md` remains the event-by-event payload reference and stays in inventory parity with that contract
- `tests/verification/runtime/check-runtime-collisions.mjs` is the canonical runtime guard entrypoint
- `tests/verification/runtime/check-subagent-launch.mjs` is the canonical live subagent launch smoke entrypoint
- `tests/verification/runtime/check-acp-launch.mjs` is the canonical ACP launch-reachability smoke entrypoint
- `tests/verification/contracts/check-telemetry-contract.mjs` is the canonical contract guard entrypoint
- `tests/verification/deployment/check-deployment-truth.mjs` is the canonical deployment-surface guard entrypoint
- `tests/verification/behavior-verification.md` is the canonical behavior verification explainer
- `tests/verification/packaging-verification.md` is the canonical packaging verification explainer
- `tests/verification/behavior/verify.mjs` is the canonical behavior-harness entrypoint
- `tests/verification/run-full-verification.sh` is the canonical convenience wrapper for running the entire local verification suite in one command
- there is no remaining `scripts/*.mjs` verifier wrapper surface in this repo
- `scripts/` remains the home for operator utilities like `deploy.sh` and `setup.sh`, not the canonical verification entrypoints
- `scripts/deploy.sh build-local-images [tag]`, `scripts/deploy.sh verify-live [tag]`, and `scripts/deploy.sh smoke` / `scripts/deploy.sh smoke-agent <nova|buster>` are the canonical live deployment command surface
- `scripts/deploy.sh` remains tracked executable so that the canonical live deployment commands are directly runnable from the repo checkout
- `.swarm/logs/pipeline/latest.json` is the canonical pointer into the run-scoped replay bundle under `.swarm/logs/pipeline/runs/<run_id>/`
- `.swarm/logs/pipeline/runs/<run_id>/{pipeline.jsonl,discord.jsonl,nova-injections.jsonl,summary.json}` is the canonical replay/audit bundle for deploy, replay, and operator handoff evidence
- `.swarm/logs/redis/{redis-exchanges.jsonl,redis-ops.jsonl}` plus `.swarm/logs/pipeline/runs/<run_id>/redis/` remain the canonical Redis audit artifact layout
- `skills/nova/pipeline.js` is the bounded compatibility entrypoint for `node /app/skills/pipeline.js`; it should stay a thin shim that re-exports `pipeline/index.js` and dispatches CLI to `pipeline/cli.js`, not a place where runtime logic regrows
