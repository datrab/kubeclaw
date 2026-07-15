# End-To-End Pipeline Flow

Status: current
Audience: operator, developer, maintainer

## Purpose

Explain what runs when a KubeClaw pipeline starts, why the runtime is split across Nova, Buster, Redis, artifacts, gates, validators, and telemetry, and how to trace one run from `progress.json` to terminal summary.

Use this page when you need the narrative view. Use [runtime flow](runtime-flow.md) for the compact operational sequence, [modules and gates](modules-and-gates.md) for the lifecycle pieces, and [progress JSON interpretation](progress-json.md) for the project contract.

## Why The Pipeline Is Built This Way

KubeClaw separates intent, scheduling, execution, and evidence so long-running autonomous work can be resumed and audited:

- `progress.json` is the project contract. It says what should happen, in which order, and with which gates or suites.
- Nova is the scheduler. It owns lifecycle state, retry policy, gate decisions, terminal outcomes, and the decision to continue or stop.
- Forge agents build or fix code. Their work is controlled by module/gate prompts and persisted status.
- Buster workers validate typed tasks. They run deterministic suites behind a Redis task boundary and return completion evidence.
- Redis is transport and live telemetry, not the source of scheduler truth.
- `.swarm/logs/**` and status files are durable evidence. Operators can inspect them after a pod restart or interrupted run.
- Gates are explicit control points. They keep review, approval, and system-test policy visible in the project contract instead of hiding them in agent prompts.

This shape avoids a common failure mode in agent pipelines: one chat transcript or one worker message becoming the only truth. Nova only advances from source-backed state, typed gate/module control results, or validated completion evidence.

## One Run At A Glance

```text
operator command
  -> Nova CLI parses flags and loads config
  -> platform config selects runtime defaults and paths
  -> progress.json selects project order, modules, gates, suites, and generators
  -> run logging starts and latest.json points to this run
  -> pipeline lock prevents a second writer
  -> stale module/gate sessions are reconciled
  -> startup telemetry and observer services start
  -> scheduler walks execution_order
       -> optional validators
       -> module lifecycle
       -> gate lifecycle
  -> terminal summary and generator artifacts are written
```

The important mental model: `execution_order` is not just a list to print. It is the scheduler input. The scheduler repeatedly asks "what is the next unfinished source-backed step?" and projects that answer from module status, gate status, validator completion markers, and configured schedules.

## Start And Config Load

A normal run starts with:

```bash
node /app/skills/pipeline.ts --project my-project --nova-channel 1513577188899946506
```

Nova resolves these inputs before it does work:

- project name: `--project` or `CURRENT_PROJECT`
- repository root: `--repo`, `REPO_ROOT`, or Git discovery
- platform config: `/home/node/.openclaw/swarm.config.json`, with `SWARM_CONFIG` as a secondary candidate
- project contract: `Projects/<project>/src/.swarm/progress.json`
- run ID and log paths under `.swarm/logs/pipeline/runs/<run_id>/`

Why this happens first: the pipeline must know the project, repository, runtime policy, and durable artifact paths before any agent is spawned. A run that cannot load these inputs should fail before mutating project state.

## Run Lock And Reconciliation

After config load, Nova acquires the pipeline run lock and starts observer services. It then reconciles stale module and gate state:

- module state is projected from persisted status files
- gate sessions are checked against gate read models and active-session evidence
- old in-flight state can be continued, skipped if already terminal, or surfaced for recovery

Why this exists: an operator can restart a pod, resume a stuck run, or recover from a gateway interruption without trusting a stale chat message. The lock protects the project from two Nova runners writing lifecycle state at the same time.

## Scheduling: How `execution_order` Becomes Work

The scheduler walks `progress.execution_order` from left to right. Each item can be:

- `validator:<id>` for an inline validator
- `<module-id>` or `module:<module-id>` for a module
- `gate:<id>` for a review, approval, or Buster gate

For each item, Nova asks:

1. Is this validator already marked complete?
2. Is this gate already consumed or complete?
3. Is there a configured validator scheduled before or after this gate/module?
4. Is this module already `PASS`?
5. Is this module `BLOCKED`?
6. If not complete, should this module or gate run now?

Review gates also get a mandatory full-lint validator before the gate when the validator owner is available. That makes the review prompt source-backed by deterministic findings instead of only agent judgment.

Why this is explicit: operators can reason from `execution_order` to the next action. If the next action is surprising, the mismatch is usually visible in module state, gate projection, validator completion markers, or a dependency rule.

## Module Lifecycle

A module is the normal "build something, optionally test it" unit. Its behavior is controlled by `modules.<id>` in `progress.json`.

Typical full module flow:

```text
dependency check
  -> release blueprint / required module files
  -> initialize status if missing
  -> Forge phase
  -> pre-Buster preparation
  -> Buster phase
  -> PASS, retry, BLOCKED, TIMEOUT, RATE_LIMITED, or NEEDS_NOVA
```

### Dependency Check

Before a module attempt starts, Nova checks `depends_on`.

If dependencies are missing, the module does not start. The failure is classified as dependency or configuration evidence, not as a Forge or Buster failure.

Why this matters: it prevents a later module from building on incomplete work and keeps dependency problems distinct from implementation bugs.

### Blueprint Release

If module state is new or pending, Nova releases module control files such as `FORGE.md` and `BUSTER.md` from the project setup area into the working `.swarm/modules/<dir>` shape.

If release fails, Nova returns a `needs_nova` style terminal result because the architecture/control files need correction before autonomous work can continue.

Why this exists: module prompts should come from repo-visible control files, not from hidden runtime state.

### Forge Phase

Forge runs when the module stages include `forge` and the module is pending, in progress, failed, or resuming before Buster.

Forge phase responsibilities:

- resolve model policy from module, project defaults, or platform fallback
- build the Forge prompt from project/module context
- include operator resume guidance when present
- spawn the configured Forge runtime
- verify the agent is alive
- poll with rate-limit recovery
- persist status transitions and prompt/log artifacts

Successful Forge work moves the module toward `READY_FOR_TESTING`. Forge-only modules can pass after Forge completes.

Why Forge is separate from Buster: the builder and tester have different authority. Forge can change implementation. Buster should validate and produce evidence, not silently rewrite the project contract.

### Pre-Buster Preparation

Before Buster runs, Nova prepares the module:

- confirms the stages include `buster`
- runs preflight validation where configured
- validates Buster config and suite requirements
- syncs Git state before dispatch
- archives stale completions so old Redis messages cannot satisfy the new attempt

Why this exists: Buster tasks should fail fast on invalid `progress.json` or environment prerequisites instead of spending a worker attempt on a task that was never valid.

### Buster Phase

Buster runs when a module includes `buster`.

Nova builds a typed Buster task with:

- module ID and run correlation
- test suite list
- suite config
- workspace/project paths
- expected completion identity

Then Nova dispatches through Redis and waits for completion evidence. Buster validates the task before doing work, runs suites, writes artifacts, and publishes completion or dead-letter evidence.

Why Redis is used here: Nova and Buster are separate runtime authorities. Redis gives a typed queue and completion surface without requiring Nova to run tests directly inside its own process.

## Gate Lifecycle

Gates are entries in `execution_order` that point to `gates.<id>`.

Current gate types:

- `review`: deterministic lint plus reviewer session; failures stop for explicit follow-up
- `buster`: system or final test, with optional fix-and-retest
- `approval`: waits for operator approve/reject signals

Gate output paths are resolved inside `.swarm`. Absolute paths and parent traversal are rejected by path helpers.

### Review Gate

Review gates do four important things:

1. check whether the gate has already completed
2. generate deterministic lint evidence when required
3. spawn the configured reviewer
4. parse PASS/FAIL output into typed gate control results

If the result is FAIL and policy allows remediation, Forge gets a fix prompt, commits/pushes changes when successful, and the reviewer runs again. The loop stops at the configured max fix cycles.

Why this exists: review gates let the project insert judgment checkpoints without turning every module into a human approval point.

### Buster Gate

Buster gates are similar to module Buster phases but are scoped to a gate. They are usually used for broader integration or final-preview tests.

Flow:

```text
read gate instructions
  -> validate Buster config
  -> archive stale gate completions
  -> dispatch typed Buster gate task
  -> wait for output_file and completion evidence
  -> PASS or request Forge fix
  -> retest until pass or fix-cycle exhaustion
```

Why this exists: some verification only makes sense after several modules are complete, such as full system, final preview, or Kubernetes deployment validation.

### Approval Gate

Approval gates intentionally pause automation. Operators respond with:

```text
APPROVE gate:<id>
REJECT gate:<id> reason: <reason>
```

Why this exists: some decisions are policy or product calls, not test outcomes. Encoding them as gates keeps the pause explicit and auditable.

## Terminal Completion

When every scheduled module, gate, and validator is complete, Nova writes terminal evidence:

- run-scoped `summary.json`
- global `summary.json`
- `latest.json` pointing at the last run
- `pipeline.jsonl` and run-scoped event logs
- optional post-pipeline generator outputs such as pipeline review and case study

Terminal status is typed:

- `succeeded`
- `failed`
- `action_required`
- `blocked`
- `timed_out`
- `rate_limited`

Why typed terminal status matters: process exit code is only an adapter for shells. Operators, dashboards, and recovery logic need reasoned status and `reason_code`, not just `0` or `1`.

## Happy Path Walkthrough

Example `execution_order`:

```json
[
  "01-scaffold",
  "02-api",
  "gate:midpoint-review",
  "03-frontend",
  "gate:final-buster",
  "gate:release-approval"
]
```

What happens:

1. Nova loads config and starts run logging.
2. `01-scaffold` has no dependencies, so Forge runs.
3. If `01-scaffold.stages` is `["forge"]`, the module passes after Forge.
4. `02-api` depends on `01-scaffold`, so it starts only after `01-scaffold` is `PASS`.
5. Forge builds API work.
6. Pre-Buster preparation validates suite config and archives stale completions.
7. Buster runs `build`, `health`, `unit`, or whatever suites are configured.
8. `gate:midpoint-review` runs full lint plus reviewer judgment.
9. `03-frontend` runs its module lifecycle.
10. `gate:final-buster` runs broad integration suites.
11. `gate:release-approval` waits for an operator decision.
12. Nova writes terminal summary and optional generator artifacts.

## Failure Path Walkthroughs

### Forge Times Out

```text
Forge active
  -> poll reaches timeout
  -> handleFail records timeout evidence
  -> fail_count increments
  -> retry if policy allows
  -> otherwise terminal timed_out/action_required evidence
```

Operator action:

```bash
node /app/skills/pipeline.ts --project my-project --status
jq . Projects/my-project/src/.swarm/logs/pipeline/latest.json
```

Resume only after deciding whether to increase timeout, simplify scope, or provide a focused prompt.

### Buster Rejects Config Before Testing

```text
pre-dispatch validation
  -> test_suites or test_config invalid
  -> task is not treated as an app test failure
  -> Nova records config/tooling failure evidence
  -> operator fixes progress.json or environment
```

This is why `progress.json` suite config should be precise. Missing `serve.start_cmd`, wrong manifest paths, or empty typed suites can block before any real test runs.

### Review Gate Returns FAIL

```text
full lint evidence
  -> reviewer output says FAIL
  -> issues are extracted
  -> Forge receives fix prompt with issue context
  -> changes are committed/pushed
  -> reviewer reruns
  -> pass or fix-cycle exhaustion
```

If fix cycles are exhausted, the gate blocks with evidence rather than pretending the review passed.

### Redis Telemetry Is Missing But Artifacts Exist

```text
local artifacts written
  -> Redis stream unavailable or degraded
  -> degraded observability event/fallback artifact may exist
  -> scheduler truth still comes from local status and typed completions
```

Operator implication: do not conclude the run vanished because a Redis telemetry stream is empty. Check `.swarm/logs/pipeline/latest.json`, run-scoped `pipeline.jsonl`, and Buster fallback artifacts.

## Operator Trace Checklist

When someone asks "where is the run stuck?", trace in this order:

1. `node /app/skills/pipeline.ts --project <project> --status`
2. `Projects/<project>/src/.swarm/progress.json`
3. `Projects/<project>/src/.swarm/logs/pipeline/latest.json`
4. run-scoped `summary.json` and `pipeline.jsonl`
5. module status under `.swarm/modules/<dir>`
6. gate output/status files if the active item is `gate:<id>`
7. Buster output/dead-letter/fallback artifacts if the active phase is Buster
8. Redis telemetry only after local artifacts are understood
9. pod logs and gateway status if runtime health is suspect

This order follows authority: project contract, Nova state, gate/module evidence, worker evidence, live transport, then infrastructure.

## Relation To The Archived HTML Flow

The archived `docs/archive/static-artifacts/pipeline-flow.html` is useful as a visual inspiration because it showed full run, happy path, failure scenarios, module detail, and gate detail. It is not current behavior authority. This page preserves the useful explanatory shape while using the current runner files and verification-backed docs as sources.

## Related Pages

- [Pipeline architecture](architecture.md)
- [Runtime flow](runtime-flow.md)
- [Modules and gates](modules-and-gates.md)
- [Workers and Buster](workers-and-buster.md)
- [Failure and recovery](failure-and-recovery.md)
- [Telemetry and artifacts](telemetry-and-artifacts.md)
- [Progress JSON interpretation](progress-json.md)
- [Progress JSON reference](../reference/progress-json.md)

## Sources

- `skills/nova/pipeline/cli.ts`
- `skills/nova/pipeline/runners/pipeline-runner.ts`
- `skills/nova/pipeline/runners/pipeline-runner-scheduling.ts`
- `skills/nova/pipeline/runners/module-runner.ts`
- `skills/nova/pipeline/runners/module-runner/state-machine.ts`
- `skills/nova/pipeline/runners/review-gate-runner.ts`
- `skills/nova/pipeline/runners/buster-gate-runner.ts`
- `skills/nova/pipeline/runners/approval-gate-runner.ts`
- `skills/nova/pipeline/services/status-store.ts`
- `skills/nova/pipeline/services/contracts/terminal-decision.ts`
- `skills/buster/buster-pipeline.ts`
