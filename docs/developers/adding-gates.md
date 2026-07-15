# Adding Gates

Status: current
Audience: developer, maintainer

## Purpose

Use this page when adding or changing gate behavior in Nova. Gates are control points in `execution_order`; they must preserve Nova's lifecycle authority, artifact evidence, and operator escalation behavior.

## Current Gate Lifecycle

1. `progress.json` contains `execution_order` entry `gate:<id>`.
2. `gates.<id>.type` selects a gate owner.
3. The plugin registry resolves a `gate.execute` stage owner.
4. The gate runner reads gate config and current state.
5. The gate writes output artifacts and telemetry.
6. The gate returns a typed control result.
7. Nova updates gate/pipeline state from that typed result.

Built-in gate types:

- `review`: reviewer sessions that stop on failure.
- `approval`: operator request/decision and timeout policy.
- `buster`: Redis-backed Buster test task and optional fix-and-retest.

## Config Shape

Example Buster gate:

```json
{
  "gates": {
    "final-buster": {
      "type": "buster",
      "title": "Final system test",
      "on_fail": "fix_and_retest",
      "instructions_file": "buster-test/FINAL-BUSTER.md",
      "output_file": "buster-test/FINAL-BUSTER-RESULT.json",
      "timeout_minutes": 90,
      "max_fix_cycles": 3,
      "test_suites": ["build", "health", "unit"],
      "test_config": {}
    }
  }
}
```

Gate artifact paths are relative to `.swarm`; path helpers reject absolute paths, parent traversal, and escaped realpaths.

## Implementation Shape

Follow existing runners under `skills/nova/pipeline/runners/`:

- read gate config from `progress.gates[gateId]`
- validate gate type and required fields before side effects
- create stable refs such as run, gate evaluation, dispatch, and attempt
- write artifacts before returning a control result
- emit telemetry and notification hooks as evidence
- return typed `nextAction`, `outcomeClass`, `issueType`, and terminal metadata where relevant
- keep Discord and logs as outputs, not inputs

If the gate dispatches external work, validate the external result before mutating lifecycle state.

## Plugin Registry Contract

Gate plugins use:

- kind: `gate`
- hook family: `gate.execute`
- allowed stage IDs: `gate:review`, `gate:approval`, `gate:buster`, or a configured custom stage owner
- required capabilities: `read.state`, `read.artifacts`, `emit.stream`, `emit.telemetry`, `write.artifacts`
- optional capabilities: `notify.operator`, `request.wait`, `request.signal`
- forbidden capability: `dispatch.worker_runtime`

Only workers dispatch worker runtimes. Gate plugins can request/wait/signal if they declare the right optional capabilities.

## Operator Impact

Every gate must make these questions easy to answer:

- Is the gate waiting, running, passed, failed, blocked, or timed out?
- Which artifact explains the current decision?
- Is operator input required?
- Is it safe to resume?
- Which command or external action should the operator take next?

Write gate artifacts under predictable `.swarm` paths and include enough summary for `docs/operators/running-the-pipeline.md` to remain accurate.

## Failure Modes

- Invalid config: fail before dispatch and report an actionable config error.
- Invalid external output: block or request fix; do not parse untrusted output into success.
- Timeout: return typed timeout evidence and trigger operator escalation when required.
- Rate limit: preserve cooldown/resume metadata.
- Missing artifact write: treat as gate execution failure if the artifact is required for recovery.
- Unknown gate type: reject through registry validation instead of falling through.

## Tests And Checks

Add or update behavior tests for:

- pass
- fail
- invalid config
- invalid external output
- timeout
- rate limit
- resume/recovery
- artifact creation
- telemetry/control result shape

Useful existing area:

```bash
node --test tests/verification/e2e/*.test.mjs
```

## Sources

- `skills/nova/pipeline/runners/approval-gate-runner.ts`
- `skills/nova/pipeline/runners/review-gate-runner.ts`
- `skills/nova/pipeline/runners/buster-gate-task.ts`
- `skills/nova/pipeline/runners/buster-gate-terminal.ts`
- `skills/nova/pipeline/core/constants.ts`
- `tests/verification/e2e/*.test.mjs`

## Gate Contract Checklist

| Gate responsibility | Source owner | Required evidence |
| --- | --- | --- |
| Stage ownership | `skills/nova/pipeline/core/registry.ts`; `core/registry/*.ts`; `core/constants.ts` | plugin registry accepts the gate owner and rejects conflicts, unknown stage IDs, or missing implementation |
| Execution result | `skills/nova/pipeline/services/contracts/pipeline-step-result.ts` | gate returns `pipeline_step_result` with `stepType: gate`, `nextAction`, `outcome`, diagnostics, and terminal mapping when needed |
| Terminal decision | `skills/nova/pipeline/services/contracts/terminal-decision.ts` | blocking/error/rate-limit outcomes map to explicit terminal status and operator action |
| Artifacts | gate runner and `skills/nova/pipeline/core/paths.ts` | output files, instructions, review outputs, and approval artifacts resolve inside `.swarm` |
| Telemetry and Discord | telemetry builders and Discord field helpers | gate status is correlated with run, gate, attempt, dispatch, and session identity |

## Recovery Boundaries

A gate that waits for approval, requests a fix, or blocks must preserve enough identity for resume. Do not clear active-session identity, dispatch IDs, or gate artifacts as a cleanup shortcut. If a gate cannot prove terminal evidence, prefer `action_required` or `blocked` with artifacts over silent success.

Run `node --test tests/verification/e2e/*.test.mjs` plus the terminal/step-result contract checks when the gate result shape changes.
