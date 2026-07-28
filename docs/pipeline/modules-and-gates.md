# Modules And Gates

Status: current
Audience: operator, developer

## Overview

Modules and gates are the project-level workflow units in `progress.json`. Modules produce or change repository content. Gates evaluate, pause, approve, or test the work between modules. Nova owns the lifecycle for both and records state under the project `.swarm` tree.

## Module Definition

A module is declared under `modules` and referenced by ID in `execution_order`:

```json
{
  "execution_order": ["01-scaffold", "02-api", "gate:midpoint-review"],
  "modules": {
    "02-api": {
      "title": "REST API",
      "dir": "02-api",
      "depends_on": ["01-scaffold"],
      "stages": ["forge", "buster"],
      "timeout_minutes": 300,
      "max_fails": 3,
      "thinking_level": "adaptive",
      "test_suites": ["build", "health", "unit", "api"],
      "test_config": {}
    }
  }
}
```

Important fields:

- `dir`: directory under `.swarm/modules/`; path helpers reject absolute paths and parent traversal.
- `depends_on`: module IDs that should already be `PASS`.
- `stages`: explicit module phases, usually `["forge", "buster"]`. Use `["forge"]` for modules tested later by a gate.
- `timeout_minutes`: explicit module attempt timeout.
- `max_fails`: retry ceiling before the module becomes blocked.
- `forge_model` and `thinking_level`: per-module overrides for Forge.
- `test_suites` and `test_config`: Buster suite selection and suite config.

## Module Lifecycle

1. Nova verifies dependencies and reads module config.
2. Forge starts and moves the module to `IN_PROGRESS`.
3. The agent submits semantic completion through the Forge writer; Nova injects immutable run/module/attempt/schema/timestamp/path identity and atomically publishes the completion artifact.
4. Preflight and delivery lint validators check declared artifacts and produced output.
5. Forge success moves the module to `READY_FOR_TESTING` unless it is forge-only.
6. Buster dispatch moves the module to `TESTING`.
7. Buster completion produces a task verdict and output JSON.
8. Nova records `PASS`, retries/fix cycles, `FAIL`, or `BLOCKED` based on the typed result and retry policy.

Forge-only modules pass after Forge completion. Use that for documentation/config modules or when a later Buster gate performs system testing.

## Module Attempt State Machine

The module runner is a retry loop around one explicit attempt state machine:

```text
load projected module status
  -> already PASS: return terminal pass
  -> already BLOCKED: return blocked result
  -> missing/PENDING: release blueprint and initialize status
  -> if stages include forge: run Forge
  -> if forge-only and READY_FOR_TESTING: finalize PASS
  -> prepare Buster
  -> if preparation returned terminal/retry: stop this attempt
  -> run Buster
  -> return PASS, retry, BLOCKED, TIMEOUT, RATE_LIMITED, or error
```

This is implemented by `runModule(...)`, `executeModuleAttempt(...)`, and `runModuleAttemptStateMachine(...)`.

Important technical details:

- `depends_on` is checked before an attempt. Missing dependencies are classified separately from Forge/Buster failures.
- blueprint release failures return a `needs_nova` style result because control files need correction.
- `stages` drives the branch: `["forge"]`, `["buster"]`, and `["forge", "buster"]` do not all follow the same path.
- Buster preparation can stop before dispatch when `progress.json` or environment config is invalid.
- retry scheduling emits telemetry with attempt, max attempts, dispatch/session identity, and reason.
- the attempt returns a canonical `PipelineStepResult`; non-typed producer results are rejected at the boundary.

## Module State Fields Operators Should Read

Projected module status commonly includes:

- `status`: lifecycle state such as `PENDING`, `IN_PROGRESS`, `READY_FOR_TESTING`, `TESTING`, `PASS`, `FAIL`, `BLOCKED`, or `RATE_LIMITED`
- `current_phase`: `forge`, `buster`, `pre_check`, or another boundary where the module currently sits
- `fail_count`: retry count used against `max_fails`
- `fail_summaries`: accumulated compact failure reasons
- `active_agent`: normalized session identity when an agent is live or recoverable
- `dispatch_id`, `gateway_label`, `session_key`: correlation fields for logs, Redis completions, and gateway sessions
- `blockedReason`, `blockedPhase`, `blockedFailCount`: evidence for blocked modules
- `status_authority_source`: should point at lifecycle/read-model authority, not an ad hoc file

Read these through:

```bash
node /app/skills/pipeline.ts --project my-project --status
```

The status output is safer than guessing from one artifact because it is projected from lifecycle state.

## Gate Definition

`execution_order` references gates as `gate:<id>`. The gate config lives under `gates`:

```json
{
  "execution_order": ["02-api", "gate:operator-approval", "03-frontend"],
  "gates": {
    "operator-approval": {
      "type": "approval",
      "title": "Operator Approval",
      "timeout_minutes": 60,
      "on_timeout": "block"
    }
  }
}
```

Current gate types:

- `review`: Echo/reviewer sessions evaluate artifacts. `on_fail` is `stop`.
- `approval`: Nova writes approval request artifacts and waits for an operator decision or timeout policy.
- `buster`: Buster runs a gate-level test task. `on_fail` can stop or trigger fix-and-retest cycles.

## Gate Execution Internals

All gate types return typed gate control results. The generic gate runner translates those into pipeline step results.

Review gate internals:

```text
completion check
  -> resolve reviewers and lint policy
  -> run required lint evidence
  -> spawn reviewer
  -> parse output as PASS/FAIL
  -> on FAIL: request Forge fix when policy allows
  -> rerun until PASS or max fix cycles exhausted
```

Buster gate internals:

```text
read instructions
  -> validate Buster config on first attempt
  -> archive stale gate completions
  -> dispatch gate_test task with run/attempt/dispatch identity
  -> wait for completion/output evidence
  -> on FAIL: extract issues and run Forge fix when policy allows
  -> retest until PASS or max fix cycles exhausted
```

Approval gate internals:

```text
write approval request
  -> wait for APPROVE/REJECT signal
  -> on timeout apply on_timeout policy
  -> write decision evidence
```

The technical reason gates are separate from modules is that they often evaluate cross-module state. A final Buster gate or review gate should not be forced into one module's retry counter or artifact directory.

## Approval Behavior

Approval gates are the explicit human-control surface. They persist approval state in `.swarm/<gate_id>-gate-status.json`, write request and decision evidence under `.swarm/logs/gates/<gate_id>/`, and Nova projects scheduler state from lifecycle/read-model authority. Use them before destructive operations, public previews, or expensive model/test stages.

If the approval times out and `on_timeout` is `block`, the pipeline stops with operator-visible evidence. Resume only after recording the intended decision path.

## Validators And Generators

Validators and generators are registry stages, not `execution_order` IDs. Built-ins include:

- `validator:architecture`
- `validator:delivery_lint`
- `validator:pre_check`
- `validator:full_lint`
- `generator:project_summary`
- `generator:pipeline_review`
- `generator:case_study`

Validator failures return typed control results. Execution failures block as environment/tooling issues; validation failures request fixes as code issues.

## Operator Checks

Read current module/gate status:

```bash
node /app/skills/pipeline.ts --project my-project --status
```

Find gate artifacts:

```bash
find Projects/my-project/src/.swarm/logs/gates -maxdepth 3 -type f | sort
```

Find module Buster output:

```bash
find Projects/my-project/src/.swarm/modules -name 'buster-output.json' -print
```

## Failure Modes

- A module remains `PENDING`: dependency is not `PASS`, `execution_order` has not reached it, or the run never started.
- A module stays `IN_PROGRESS`: check Forge session status and `.swarm/logs/pipeline/runs/<run_id>/pipeline.jsonl`.
- A module stays `TESTING`: check Buster pod logs, Redis task stream, and Buster task output path.
- A gate blocks: inspect its request/output artifact before resuming.
- Validators block before Buster: fix tool setup if the result says execution failed; fix source output if the result says validation failed.

## Sources

- `skills/nova/project_setup/progress-json.md`
- `skills/nova/pipeline/runners/module-runner.ts`
- `skills/nova/pipeline/runners/module-runner/attempt.ts`
- `skills/nova/pipeline/runners/module-runner/state-machine.ts`
- `skills/nova/pipeline/runners/gate-runner.ts`
- `skills/nova/pipeline/runners/review-gate-runner.ts`
- `skills/nova/pipeline/runners/buster-gate-runner.ts`
- `skills/nova/pipeline/runners/approval-gate-runner.ts`
- `skills/nova/pipeline/services/module-lint-validators.ts`
- `skills/nova/pipeline/core/paths.ts`
