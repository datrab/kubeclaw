# Replacing Or Adapting The Agent Runtime

Status: current with future extension guidance
Audience: developer, maintainer

## Purpose

KubeClaw currently runs agent work through OpenClaw surfaces. This page separates what is OpenClaw-specific from the pipeline contracts another runtime would need to preserve.

Runtime replacement is not a one-file switch today. It is an architectural extension path that must keep Nova's scheduler, artifacts, telemetry, and recovery semantics intact.

## OpenClaw-Specific Today

Current runtime-specific behavior includes:

- dispatching Forge/Echo sessions through OpenClaw gateway or subagent helpers
- requiring `--nova-channel` for operator escalation on real runs
- using OpenClaw agent observer plugin control
- ingesting OpenClaw agent observability events
- carrying model/thinking/runtime labels into session metadata
- using OpenClaw/ACP gateway readiness and health for Buster session behavior

Provider credentials and model availability belong to OpenClaw setup. KubeClaw references model IDs and dispatch settings; it does not own provider-specific credential setup.

## Pipeline-Generic Contracts

Any replacement runtime must preserve:

- run ID and project identity
- module/gate attempt identity
- status transitions and lifecycle history
- dispatch IDs and session keys where external work is tracked
- bounded prompt/operator input handling
- timeout and retry semantics
- terminal status contract
- artifact creation before lifecycle mutation
- telemetry and notification event shape
- redaction/masking for logs and telemetry
- deterministic completion or dead-letter evidence for worker tasks

## Worker Runtime Contract

Workers are the only plugin kind allowed to declare `dispatch.worker_runtime`. A replacement runtime should integrate at the worker layer first, preserving the `worker.execute` hook family and returning the same control result shape that module runners expect.

Minimum worker behavior:

1. accept module ID, attempt, run ID, and runtime config
2. launch work in a bounded working directory
3. write or reference artifacts
4. expose progress and terminal result
5. report rate-limit/timeout/action-required states explicitly
6. allow resume or reconciliation after process restart

## Session Monitoring Contract

The current pipeline expects session monitoring to answer:

- did the session start?
- is it still alive?
- did it produce usable output?
- did it time out?
- was it killed?
- is there enough transcript or progress evidence to continue?

If another runtime cannot provide transcript-style evidence, it must provide equivalent status and artifact evidence so operators can debug without source-code inspection.

## Operator Escalation Contract

OpenClaw/Discord escalation is current behavior. A replacement runtime may use another notification surface, but it must still preserve:

- explicit `action_required` terminal status
- operator-visible reason and next step
- durable local artifacts
- a resume path with an operator note
- no dependence on ephemeral chat history as scheduler truth

## Integration Path

Recommended sequence:

1. Implement a new worker plugin for a non-critical module stage.
2. Keep gate, validator, generator, notification, and telemetry plugins unchanged.
3. Run behavior verification for module lifecycle and terminal outcomes.
4. Add a runtime-specific artifact lane under `.swarm/logs`.
5. Add operator docs and recovery checks for the new runtime.
6. Only then consider replacing Forge/Echo defaults.

## Failure Modes

- runtime launches but cannot report completion: block and preserve artifacts
- runtime reports success without artifacts: reject or mark action required
- runtime cannot be resumed: document it as non-resumable and force explicit rerun semantics
- runtime timeout lacks reason: record timeout with unknown reason and require operator inspection
- runtime logs include secrets: block adoption until redaction is fixed

## Sources

- `skills/nova/pipeline/core/registry/builtins.ts`
- `skills/nova/pipeline/runners/module-runner.ts`
- `skills/nova/pipeline/runners/pipeline-runner.ts`
- `skills/common/pipeline/services/acp-gateway-contract.ts`
- `plugins/openclaw-agent-observer/`

## Runtime Replacement Contract

| Contract area | Current owner | Replacement must provide |
| --- | --- | --- |
| Launch/session identity | `skills/nova/pipeline/agents/orchestration.ts`; common ACP lifecycle helpers | stable `run_id`, `attempt`, `dispatch_id`, `session_key`, model/runtime labels, and stream log path where available |
| Completion signal | module/gate runners and `pipeline-step-result.ts` | typed step result, terminal mapping, diagnostics, and artifacts before status advancement |
| Gateway/status health | `skills/common/pipeline/services/acp-gateway-contract.ts`; chart health script | readiness/status command with explicit failure reasons, not silent timeout |
| Observability | telemetry builders, Discord identity fields, observer plugin | event identity and redaction compatible with current telemetry contracts |
| Recovery | `session-authority.ts`; `pipeline-runner-recovery.ts` | strong active-session identity or explicit non-resumable semantics |

## Verification Path

Run these before making a runtime adapter the default:

```bash
node --test tests/verification/e2e/*.test.mjs
node --test tests/verification/e2e/*.test.mjs
node tests/verification/contracts/check-acp-gateway-contract-surface.mjs --source-root "$PWD"
node tests/verification/contracts/check-pipeline-step-result-surface.mjs --source-root "$PWD"
```

If a replacement runtime cannot support resume, document that as a boundary and force explicit rerun semantics rather than projecting weak state into lifecycle read models.
