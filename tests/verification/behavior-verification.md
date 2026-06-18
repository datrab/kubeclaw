# Behavior Verification

Behavior verification is source-backed and repo-root based. The runnable harness lives under `tests/verification/`, and the active source tree is the authority for verifier behavior.

## Policy

- use the live repo root as the source of truth
- run verifiers against current source
- treat `docs/archive/lifecycle-unification/TELEMETRY_CONTRACT_V1.md` as the authoritative inventory, stream-identity, and contract-boundary spec
- treat `docs/archive/legacy-root-docs/telemetry-event-schema.md` as the authoritative event-by-event payload reference, kept in exact inventory parity with that contract
- treat `.swarm/logs/pipeline/latest.json` plus `.swarm/logs/pipeline/runs/<run_id>/{pipeline.jsonl,discord.jsonl,nova-injections.jsonl,buster-telemetry-fallback.jsonl,redis/redis-exchanges.jsonl,redis/redis-ops.jsonl,summary.json}` as the canonical replay/audit bundle, with Redis audit artifacts also mirrored under `.swarm/logs/redis/{redis-exchanges.jsonl,redis-ops.jsonl}`
- take pass totals from the live JSON output of `tests/verification/behavior/verify.mjs`

Current source root:

```text
<repo-root>
```

Current telemetry contract:

```text
<repo-root>/docs/archive/lifecycle-unification/TELEMETRY_CONTRACT_V1.md
```

Canonical telemetry stream is `pipeline:telemetry:<project>:<run_id>`:

```text
pipeline:telemetry:<project>:<run_id>
```

## Wrappers

Fast local verification:

```bash
./tests/verification/run-fast-verification.sh
```

Full verification:

```bash
./tests/verification/run-full-verification.sh
```

ACP launch reachability:

```bash
./tests/verification/run-local-acp-verification.sh
```

`tests/verification/run-full-verification.sh` is the canonical exhaustive fail-fast local wrapper. It includes deployment truth, runtime collision, live subagent and ACP launch smokes, required live Redis smoke, telemetry contract, focused contract guards, docs checks, whitespace checks, and the default behavior harness.

`tests/verification/run-fast-verification.sh` is the default local feedback wrapper. It includes startup smokes, runtime guards, deterministic contracts, docs checks, and selected behavior areas without Helm, kubeconform, live subagent, ACP, Redis, or cluster dependencies.

Fast/full wrappers are silent on clean passes unless a step emits warning output. Use `--verbose` or `VERIFICATION_VERBOSE=1` to stream step banners and passing output. A failed step prints its buffered output and exits red. Rerun underlying entrypoints directly when you need the full downstream failure set after a red wrapper run.

`scripts/deploy.sh verify-live [tag]` plus `scripts/deploy.sh smoke` and `scripts/deploy.sh smoke-agent <nova|buster>` are operator-run live-cluster surfaces. They require Docker plus cluster access and are not executed by the repo-only deployment truth guard.

## Direct Commands

```bash
cd <repo-root>

node tests/verification/runtime/check-runtime-collisions.mjs \
  --source-root <repo-root>

node tests/verification/contracts/check-telemetry-contract.mjs \
  --source-root <repo-root>

node tests/verification/behavior/verify.mjs \
  --source-root <repo-root>

node tests/verification/behavior/verify.mjs \
  --source-root <repo-root> \
  --list-areas

node tests/verification/behavior/verify.mjs \
  --source-root <repo-root> \
  --areas foundations,fix-cycles
```

Both `tests/verification/contracts/check-telemetry-contract.mjs` and `tests/verification/behavior/verify.mjs` default `--contract` to `<repo-root>/docs/archive/lifecycle-unification/TELEMETRY_CONTRACT_V1.md`. Pass `--contract` only when intentionally checking a different markdown contract file.

## Prerequisites

- `node`
- `git`
- `python` on `PATH`; Python 3 is fine, but the executable name must be `python` because representative pipeline fixtures invoke `python -m ...`

Debian/Ubuntu setup:

```bash
apt-get install -y python3 python-is-python3
```

`docker/Dockerfile.general` satisfies this prerequisite for the general verifier environment.

## Coverage

The default behavior harness covers the registered areas reported by:

```bash
node tests/verification/behavior/verify.mjs --list-areas
```

Coverage includes:

- packaged runtime ownership and entrypoint loadability
- polling cadence, cooldown ownership, rate-limit recovery, and transcript/progress telemetry
- degraded-observability signaling for transcript, gateway, Redis, webhook, and audit-log surfaces
- telemetry identity, payload shape, contract inventory, and event schema parity
- Discord correlation and audit-artifact integrity with generic verification webhook delivery muted
- lifecycle state transitions, restart recovery, spawn/kill telemetry, and session-correlation preservation
- repo-root portability for active suite paths, summary defaults, generated references, and verifier artifacts
- Buster task envelope, Redis task lifecycle, completion selection, ACK/dead-letter guarantees, and output artifact authority
- module and gate terminal result identity, including `run_id`, `module_id`, `gate_id`, `attempt`, `dispatch_id`, `gateway_label`, and `session_key`
- approval, Buster, review, pipeline-review, case-study, project-summary, and operator alert surfaces

The behavior harness output is the source for current pass counts:

```json
{
  "passed": "<live count>",
  "failed": 0
}
```
