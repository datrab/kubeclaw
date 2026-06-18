# Verification harness migration plan

This directory is the canonical home for the repo's verification entrypoints and verification docs.

## Quick run

Run the fast local tier from the repo root with:

```bash
./tests/verification/run-fast-verification.sh
```

It avoids Helm, kubeconform, live subagent, ACP, Redis, and cluster dependencies. It runs Nova/Buster startup smokes, local runtime guards, contract checks, and selected fast behavior areas. Override behavior areas with `BEHAVIOR_AREAS=a,b` or set `SKIP_FAST_BEHAVIOR=1` for contract/runtime-only feedback.

Verification wrappers are quiet by default: passing step output is captured and discarded, warning output is printed, and failed steps print their buffered output before exiting. Use `--verbose` or `VERIFICATION_VERBOSE=1` when you need full runtime logs for passing checks.

Run the full verification suite with:

```bash
./tests/verification/run-full-verification.sh
```

It runs deployment truth, runtime guards, Nova/Buster startup smokes, live subagent and ACP launch smokes, required live Redis smoke, the deterministic contract suite, docs checks, whitespace checks, and the full behavior harness.
ACP launch reachability can still be checked directly with:

```bash
./tests/verification/run-local-acp-verification.sh
```

Current gate expectations:
- `tests/verification/run-fast-verification.sh` is the default local no-cluster/no-live-agent feedback loop
- `tests/verification/run-full-verification.sh` is intentionally exhaustive and fail-fast; it exits on the first red surface
- fast/full wrappers are silent on clean passes unless a step emits warning output; `--verbose` or `VERIFICATION_VERBOSE=1` restores step banners and pass output
- if you need the full downstream failure set after a red wrapper run, rerun the canonical entrypoints directly
- subagent and ACP launch are part of the full wrapper
- live Redis backend smoke is part of the full wrapper and fails when `REDIS_HOST` is not configured

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
- keep `skills/nova/pipeline.ts` explicitly bounded as the thin compatibility entrypoint shim for `node /app/skills/pipeline.ts`

## Definition of done for the migration slice

- verification implementations live under `tests/verification/`
- deprecated small verifier shims are retired once callers and docs are clean
- behavior-harness command output stays equivalent
- docs and layout no longer imply that verification harnesses are deployment scripts

## Verifier prerequisites

- direct behavior-harness runs at `tests/verification/behavior/verify.mjs` require `python` on `PATH`
- the default wrapper `tests/verification/run-full-verification.sh` provides a local verification convenience shim from `python` to `python3` when only `python3` is installed; this is not runtime behavior
- on Debian or Ubuntu, prefer installing `python3` plus `python-is-python3`
- `docker/Dockerfile.general` is the canonical general environment and should satisfy that prerequisite

## Current cleanup status

- `docs/archive/lifecycle-unification/TELEMETRY_CONTRACT_V1.md` remains the authoritative telemetry contract for canonical inventory, stream identity, and compatibility boundaries
- `docs/archive/legacy-root-docs/telemetry-event-schema.md` remains the event-by-event payload reference and stays in inventory parity with that contract
- `tests/verification/runtime/check-runtime-collisions.mjs` is the canonical runtime guard entrypoint
- `tests/verification/runtime/check-nova-startup-smoke.mjs` is the canonical Nova import/CLI startup smoke entrypoint
- `tests/verification/runtime/check-buster-startup-smoke.mjs` is the canonical Buster import/CLI startup smoke entrypoint
- `tests/verification/runtime/check-subagent-launch.mjs` is the canonical live subagent launch smoke entrypoint
- `tests/verification/runtime/check-acp-launch.mjs` is the canonical ACP launch-reachability smoke entrypoint and is run by both `tests/verification/run-full-verification.sh` and `tests/verification/run-local-acp-verification.sh`
- `tests/verification/lib/run-contract-suite.sh` is the shared deterministic contract-suite helper used by fast/full wrappers
- `tests/verification/contracts/check-telemetry-contract.mjs` is the canonical telemetry contract guard entrypoint
- `tests/verification/deployment/check-deployment-truth.mjs` is the canonical deployment-surface guard entrypoint
- `tests/verification/behavior-verification.md` is the canonical behavior verification explainer
- `tests/verification/packaging-verification.md` is the canonical packaging verification explainer
- `tests/verification/behavior/verify.mjs` is the canonical behavior-harness entrypoint
- `tests/verification/run-fast-verification.sh` is the canonical convenience wrapper for running local runtime smoke, contract, and selected fast behavior checks without cluster/live-agent dependencies
- `tests/verification/run-full-verification.sh` is the canonical exhaustive wrapper for running all verification surfaces in one command
- `tests/verification/run-local-acp-verification.sh` is the direct ACP/provider smoke wrapper
- there is no remaining `scripts/*.mjs` verifier wrapper surface in this repo
- `scripts/` remains the home for operator utilities like `deploy.sh` and `setup.sh`, not the canonical verification entrypoints
- `scripts/deploy.sh build-local-images [tag]`, `scripts/deploy.sh verify-live [tag]`, and `scripts/deploy.sh smoke` / `scripts/deploy.sh smoke-agent <nova|buster>` are the canonical live deployment command surface
- `scripts/deploy.sh` remains tracked executable so that the canonical live deployment commands are directly runnable from the repo checkout
- `.swarm/logs/pipeline/latest.json` is the canonical pointer into the run-scoped replay bundle under `.swarm/logs/pipeline/runs/<run_id>/`
- `.swarm/logs/pipeline/runs/<run_id>/{pipeline.jsonl,discord.jsonl,nova-injections.jsonl,buster-telemetry-fallback.jsonl,redis/redis-exchanges.jsonl,redis/redis-ops.jsonl,summary.json}` is the canonical replay/audit bundle for deploy, replay, and operator handoff evidence
- `.swarm/logs/redis/{redis-exchanges.jsonl,redis-ops.jsonl}` plus `.swarm/logs/pipeline/runs/<run_id>/redis/` remain the canonical Redis audit artifact layout
- `skills/nova/pipeline.ts` is the bounded compatibility entrypoint for `node /app/skills/pipeline.ts`; it should stay a thin shim that re-exports `pipeline/index.ts` and dispatches CLI to `pipeline/cli.js`, not a place where runtime logic regrows
