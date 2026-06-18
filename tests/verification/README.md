# Verification

This directory is the canonical home for repo verification entrypoints and verification docs.

## Fast Local Check

```bash
./tests/verification/run-fast-verification.sh
```

The fast wrapper avoids Helm, kubeconform, live subagent, ACP, Redis, and cluster dependencies. It runs Nova/Buster startup smokes, local runtime guards, contract checks, docs checks, and selected fast behavior areas.

Controls:

- `BEHAVIOR_AREAS=a,b` selects fast behavior areas
- `SKIP_FAST_BEHAVIOR=1` runs contract/runtime-only feedback
- `--verbose` or `VERIFICATION_VERBOSE=1` streams step banners and passing output

## Full Verification

```bash
./tests/verification/run-full-verification.sh
```

The full wrapper is exhaustive and fail-fast. It runs deployment truth, runtime guards, Nova/Buster startup smokes, live subagent and ACP launch smokes, required live Redis smoke, the deterministic contract suite, docs checks, whitespace checks, and the full behavior harness.

Wrapper output:

- clean pass: no output
- warning output from a passing step: warning lines only
- failed step: failed step name plus buffered output
- verbose mode: step banners and passing output

ACP launch reachability can also be checked directly:

```bash
./tests/verification/run-local-acp-verification.sh
```

## Canonical Entrypoints

- `tests/verification/run-fast-verification.sh`: fast local wrapper
- `tests/verification/run-full-verification.sh`: exhaustive local wrapper
- `tests/verification/run-local-acp-verification.sh`: direct ACP/provider smoke wrapper
- `tests/verification/runtime/check-runtime-collisions.mjs`: runtime/package collision guard
- `tests/verification/runtime/check-nova-startup-smoke.mjs`: Nova import/CLI startup smoke
- `tests/verification/runtime/check-buster-startup-smoke.mjs`: Buster import/CLI startup smoke
- `tests/verification/runtime/check-subagent-launch.mjs`: live subagent launch smoke
- `tests/verification/runtime/check-acp-launch.mjs`: ACP launch-reachability smoke
- `tests/verification/deployment/check-deployment-truth.mjs`: deployment-surface guard
- `tests/verification/contracts/check-telemetry-contract.mjs`: telemetry contract guard
- `tests/verification/lib/run-contract-suite.sh`: deterministic contract-suite helper
- `tests/verification/behavior/verify.mjs`: behavior harness

## Direct Behavior Harness

```bash
node tests/verification/behavior/verify.mjs --source-root "$PWD"
node tests/verification/behavior/verify.mjs --source-root "$PWD" --list-areas
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area repo-docs
node tests/verification/behavior/verify.mjs --source-root "$PWD" --areas foundations,polling
```

Passing checks are quiet by default and print the final JSON summary. Runtime logs for a check are buffered and printed if that check fails. Use `--verbose` or `VERIFICATION_VERBOSE=1` to stream runtime logs and include passed check names.

## Prerequisites

- direct behavior-harness runs require `python` on `PATH`
- the fast/full wrappers provide a local verification convenience shim from `python` to `python3` when only `python3` is installed
- on Debian or Ubuntu, install `python3` plus `python-is-python3`
- `docker/Dockerfile.general` satisfies the general verifier environment

## Current Authority

- `skills/nova/pipeline.ts` is the bounded compatibility entrypoint and thin compatibility entrypoint shim for the modular Nova pipeline implementation under `skills/nova/pipeline/`
- `docs/archive/lifecycle-unification/TELEMETRY_CONTRACT_V1.md` is the authoritative telemetry contract for canonical inventory, stream identity, and compatibility boundaries
- `docs/archive/legacy-root-docs/telemetry-event-schema.md` is the event-by-event payload reference and stays in inventory parity with that contract
- `tests/verification/behavior-verification.md` is the behavior verification explainer
- `tests/verification/packaging-verification.md` is the packaging verification explainer
- `scripts/` is the home for operator utilities like `deploy.sh` and `setup.sh`
- `scripts/deploy.sh build-local-images [tag]`, `scripts/deploy.sh verify-live [tag]`, `scripts/deploy.sh smoke`, and `scripts/deploy.sh smoke-agent <nova|buster>` are the live deployment command surface

## Replay And Audit Artifacts

- `.swarm/logs/pipeline/latest.json` is the canonical pointer into the run-scoped replay bundle under `.swarm/logs/pipeline/runs/<run_id>/`
- `.swarm/logs/pipeline/runs/<run_id>/{pipeline.jsonl,discord.jsonl,nova-injections.jsonl,buster-telemetry-fallback.jsonl,redis/redis-exchanges.jsonl,redis/redis-ops.jsonl,summary.json}` is the replay/audit bundle for deploy, replay, and operator handoff evidence
- `.swarm/logs/redis/{redis-exchanges.jsonl,redis-ops.jsonl}` plus `.swarm/logs/pipeline/runs/<run_id>/redis/` is the Redis audit artifact layout
