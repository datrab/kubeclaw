# Progress JSON Interpretation

Status: current
Audience: operator, developer

## Overview

`progress.json` is the project workflow contract. It describes what Nova should build, in what order, which gates should run, and which Buster suites should validate the result. It is also the first file to inspect when status output does not match the operator's expectation.

Exact field reference is in [progress.json reference](../reference/progress-json.md). This page explains how to read it during operations.

## How To Think About The File

`progress.json` answers four scheduler questions:

1. What project is this?
2. Which ordered work items should Nova consider?
3. What does each module or gate mean when selected?
4. Which optional validators, telemetry, and post-run generators should run around that work?

The file is not just a manifest of tasks. It is the bridge between product intent and runtime state. Nova reads it repeatedly while scheduling, but Nova does not blindly rerun items just because they are listed. It projects each item through durable module status, gate status, validator completion markers, dependency state, and retry policy.

That means this file should be written for both machines and operators:

- machines need exact IDs, paths, stages, gates, suites, and config
- operators need readable titles, predictable ordering, clear gate names, and obvious failure boundaries
- maintainers need enough structure to add validators and generators without changing scheduler code

## Scheduler Walkthrough

Take this execution order:

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

Nova walks it as a state machine:

1. Look at `01-scaffold`.
2. Load the module definition from `modules["01-scaffold"]`.
3. Check dependencies from `depends_on`.
4. If module status is already `PASS`, skip it.
5. If it is `BLOCKED`, stop on that module.
6. Otherwise run the module lifecycle using its `stages`.
7. After the module passes, look at `02-api`.
8. When `gate:midpoint-review` is reached, load `gates["midpoint-review"]`.
9. Run scheduled validators before the gate, including mandatory review lint when enabled.
10. Run the gate lifecycle.
11. Continue until every item is consumed.

This is why the same `execution_order` can support fresh starts and resumes. A fresh run sees pending modules. A resumed run sees durable status and continues at the first unfinished item.

## Field Roles In One Example

```json
{
  "project": "my-project",
  "version": 1,
  "defaults": {
    "models": {
      "forge": "anthropic/claude-sonnet-4-6",
      "buster": "anthropic/claude-sonnet-4-6",
      "echo": "anthropic/claude-opus-4-6"
    }
  },
  "execution_order": [
    "01-scaffold",
    "02-api",
    "gate:midpoint-review",
    "03-frontend",
    "gate:final-buster"
  ],
  "modules": {
    "01-scaffold": {
      "title": "Scaffold",
      "dir": "01-scaffold",
      "depends_on": [],
      "stages": ["forge"],
      "test_suites": []
    },
    "02-api": {
      "title": "API",
      "dir": "02-api",
      "depends_on": ["01-scaffold"],
      "stages": ["forge", "buster"],
      "timeout_minutes": 300,
      "max_fails": 3,
      "test_suites": ["build", "health", "unit"],
      "test_config": {
        "serve": {
          "type": "server",
          "project_dir": "Projects/my-project/src",
          "start_cmd": "npm start",
          "port": 3000,
          "health_path": "/health"
        }
      }
    }
  },
  "gates": {
    "midpoint-review": {
      "type": "review",
      "title": "Midpoint architecture review",
      "review_name": "MIDPOINT-REVIEW",
      "on_fail": "fix_and_rereview",
      "instructions_file": "echo-review/MIDPOINT-REVIEW-INSTRUCTIONS.md",
      "output_file": "logs/echo-review/MIDPOINT-REVIEW.json",
      "lint_tier": "full",
      "max_fix_cycles": 3
    },
    "final-buster": {
      "type": "buster",
      "title": "Final system test",
      "on_fail": "fix_and_retest",
      "instructions_file": "buster-test/FINAL-BUSTER.md",
      "output_file": "buster-test/FINAL-BUSTER-RESULT.json",
      "test_suites": ["build", "health", "unit"],
      "test_config": {}
    }
  },
  "telemetry": {
    "enabled": true
  }
}
```

Read it like this:

- `project` controls project paths, memory/telemetry scoping, and Redis stream naming.
- `defaults.models` is the fallback policy for Forge, Buster, and reviewer roles.
- `execution_order` is the only scheduler ordering source. Module objects not listed there do not run.
- `modules.01-scaffold.stages = ["forge"]` means Forge can complete it without per-module Buster.
- `modules.02-api.depends_on = ["01-scaffold"]` means API work cannot start until scaffold is `PASS`.
- `modules.02-api.stages = ["forge", "buster"]` means build then validate.
- `modules.02-api.test_suites` tells Buster which deterministic suite bundle to run.
- `modules.02-api.test_config.serve` tells Buster how to start and probe the app.
- `gates.midpoint-review` inserts a review checkpoint after `02-api`.
- `gates.final-buster` runs broader validation after the listed modules complete.
- `telemetry.enabled` allows run events to publish to Redis telemetry streams.

## Why These Fields Exist

`execution_order` exists because dependency graphs alone are not enough for operator-grade autonomous work. Operators often want deliberate review points between groups of modules. The ordered list makes those checkpoints explicit.

`depends_on` exists because an ordered list alone is not enough to prove correctness. A module can be moved later, resumed, or run individually. Dependencies make prerequisites explicit at the module boundary.

`stages` exists because not every module deserves the same validation cost. Documentation-only or scaffold-only work can be Forge-only, while runtime or API modules can require Buster.

`test_suites` and `test_config` exist because Buster should receive typed test intent. A natural-language prompt alone is too ambiguous for deterministic validation.

Gate `instructions_file` and `output_file` exist because gates need durable, inspectable inputs and outputs. The pipeline should not depend on a hidden chat transcript to know why a review or final test passed.

`max_fails` and `max_fix_cycles` exist because autonomous retry loops need a hard stop. Repeating the same bad approach should produce operator evidence, not infinite work.

## Complete Healthy Shape

```json
{
  "project": "my-project",
  "version": 1,
  "description": "Example application",
  "defaults": {
    "models": {
      "forge": "gpt-5.5",
      "buster": "gpt-5.5",
      "echo": "gpt-5.5"
    }
  },
  "execution_order": ["01-scaffold", "02-api", "gate:final-review", "gate:final-buster"],
  "modules": {
    "01-scaffold": {
      "title": "Scaffold",
      "dir": "01-scaffold",
      "depends_on": [],
      "stages": ["forge"],
      "test_suites": []
    },
    "02-api": {
      "title": "API",
      "dir": "02-api",
      "depends_on": ["01-scaffold"],
      "stages": ["forge", "buster"],
      "timeout_minutes": 300,
      "max_fails": 3,
      "test_suites": ["build", "health", "unit"],
      "test_config": {
        "serve": {
          "type": "server",
          "project_dir": "Projects/my-project/src",
          "start_cmd": "npm start",
          "port": 3000,
          "health_path": "/health"
        }
      }
    }
  },
  "gates": {
    "final-review": {
      "type": "review",
      "title": "Final review",
      "review_name": "FINAL-REVIEW",
      "instructions_file": "echo-review/FINAL-REVIEW-INSTRUCTIONS.md",
      "output_file": "logs/echo-review/FINAL-REVIEW.json"
    },
    "final-buster": {
      "type": "buster",
      "title": "Final Buster",
      "instructions_file": "buster-test/FINAL-BUSTER.md",
      "output_file": "buster-test/FINAL-BUSTER-RESULT.json",
      "test_suites": ["build", "health", "unit"],
      "test_config": {}
    }
  },
  "telemetry": {
    "enabled": true
  }
}
```

## In-Progress Interpretation

When status says a module is `IN_PROGRESS`, inspect:

- `execution_order`: confirms the module should be active now.
- `modules.<id>.dir`: maps status to `.swarm/modules/<dir>`.
- `modules.<id>.stages`: confirms whether Buster should run after Forge.
- `modules.<id>.timeout_minutes`: tells whether a timeout is expected soon.
- `modules.<id>.max_fails`: tells how many fix cycles are allowed.

Example:

```json
{
  "status": "IN_PROGRESS",
  "current_phase": "forge",
  "fail_count": 2,
  "active_agent": {
    "runtime": "subagent",
    "label": "forge:02-api"
  }
}
```

Interpretation: Forge is still the active authority. Do not inspect Buster output yet. Check agent/session telemetry and Forge logs.

Why: `current_phase = "forge"` means the module has not reached Buster authority. A missing Buster artifact at this point is expected, not a failure.

## Testing Interpretation

When status says `TESTING`, inspect:

- `test_suites`: confirms the requested deterministic suites.
- `test_config`: confirms suite prerequisites and thresholds.
- Buster output path under `.swarm/modules/<dir>/buster-output.json`.

Example:

```json
{
  "status": "TESTING",
  "current_phase": "buster",
  "fail_count": 1,
  "phase_started_at": "2026-06-08T20:40:00.000Z"
}
```

Interpretation: Buster has task authority. Check Buster logs, Redis task/completion streams, and suite artifacts.

Why: `current_phase = "buster"` means Nova has already accepted Forge completion and dispatched or is waiting for typed validation evidence.

## Failed Or Blocked Interpretation

`FAIL` means a required check produced terminal failure. `BLOCKED` means policy stopped further automatic progress, usually after retry exhaustion, invalid metadata, or an environment/tooling issue.

Example failed module evidence:

```json
{
  "status": "BLOCKED",
  "current_phase": null,
  "blockedReason": "PRE-CHECK SETUP FAILED: lint-report.ts not found",
  "blockedPhase": "pre_check",
  "blockedFailCount": 8
}
```

Interpretation: this is not an app test failure. It is an environment/tooling failure. Recover the lint tool path before resuming.

Why: `blockedPhase` and `blockedReason` tell you which boundary stopped progress. Treat `pre_check`, `dependency_check`, and config validation failures differently from test-suite failures.

## Partial Artifact State

Partial artifacts are normal after interruption:

- `FORGE.md` exists but no status: blueprint exists, pipeline may not have started.
- module status is `READY_FOR_TESTING` but no Buster output: Forge completed; Buster did not finish.
- Buster output exists but module status still `TESTING`: Nova may not have processed completion yet, or completion publish failed.
- gate request exists but no decision: approval or review is waiting.
- run logs exist but summary is missing: terminal completion did not finish.

Use `latest.json` and run-scoped `pipeline.jsonl` to decide whether to resume or recover a missing integration.

## Richer Examples

### Forge-Only Module

```json
{
  "title": "Repository documentation",
  "dir": "10-docs",
  "depends_on": ["09-ci"],
  "stages": ["forge"],
  "timeout_minutes": 120,
  "max_fails": 2,
  "test_suites": []
}
```

This is a good fit when a later review gate or final Buster gate covers the result. The module passes after Forge completes because no per-module Buster phase is configured.

### Runtime Module With Local Server Tests

```json
{
  "title": "API service",
  "dir": "02-api",
  "depends_on": ["01-scaffold"],
  "stages": ["forge", "buster"],
  "timeout_minutes": 300,
  "max_fails": 3,
  "test_suites": ["build", "health", "unit", "api"],
  "test_config": {
    "serve": {
      "type": "server",
      "project_dir": "Projects/my-project/src",
      "start_cmd": "npm start",
      "port": 3000,
      "health_path": "/health"
    },
    "api": {
      "base_url": "http://127.0.0.1:3000",
      "spec_file": ".swarm/modules/02-api/test-spec.json"
    },
    "unit": {
      "command": "npm test"
    }
  }
}
```

This shape tells Buster how to build, start, probe, and test the app. If `serve` is wrong, the failure is usually a `progress.json` or environment problem, not necessarily a product bug.

### Review Gate

```json
{
  "type": "review",
  "title": "Midpoint architecture review",
  "review_name": "MIDPOINT-REVIEW",
  "on_fail": "fix_and_rereview",
  "instructions_file": "echo-review/MIDPOINT-REVIEW-INSTRUCTIONS.md",
  "output_file": "logs/echo-review/MIDPOINT-REVIEW.json",
  "lint_tier": "full",
  "max_fix_cycles": 3
}
```

This gate asks for reviewer judgment after deterministic lint evidence is available. If the reviewer returns FAIL, Forge gets a focused fix prompt and the gate can rerun.

### Final Buster Gate

```json
{
  "type": "buster",
  "title": "Final Buster",
  "on_fail": "fix_and_retest",
  "instructions_file": "buster-test/FINAL-BUSTER.md",
  "output_file": "buster-test/FINAL-BUSTER-RESULT.json",
  "timeout_minutes": 90,
  "max_fix_cycles": 3,
  "test_suites": ["build", "health", "unit", "k8s"],
  "test_config": {
    "k8s": {
      "namespace": "preview-my-project",
      "manifest_dir": "deploy/k8s"
    }
  }
}
```

This gate should be used for broad validation that only makes sense after many modules have landed. If it fails, the fix loop is gate-scoped rather than tied to one module.

## Operator Commands

Validate that every `execution_order` item resolves:

```bash
jq -r '.execution_order[]' Projects/my-project/src/.swarm/progress.json
```

List configured suites:

```bash
jq -r '.modules[]?.test_suites[]?, .gates[]?.test_suites[]?' \
  Projects/my-project/src/.swarm/progress.json | sort -u
```

Find gate references:

```bash
jq '.gates' Projects/my-project/src/.swarm/progress.json
```

Find the next unfinished item by comparing order with status:

```bash
node /app/skills/pipeline.ts --project my-project --status
jq -r '.execution_order[]' Projects/my-project/src/.swarm/progress.json
```

Inspect one module contract:

```bash
jq '.modules["02-api"]' Projects/my-project/src/.swarm/progress.json
```

Inspect one gate contract:

```bash
jq '.gates["final-buster"]' Projects/my-project/src/.swarm/progress.json
```

Check for common shape mistakes:

```bash
jq -e '.execution_order | type == "array" and length > 0' Projects/my-project/src/.swarm/progress.json
jq -e '.modules | type == "object"' Projects/my-project/src/.swarm/progress.json
jq -r '.execution_order[] | select(startswith("gate:")) | sub("^gate:";"")' \
  Projects/my-project/src/.swarm/progress.json
```

## Related Pages

- [End-to-end flow](end-to-end-flow.md)
- [Runtime flow](runtime-flow.md)
- [Modules and gates](modules-and-gates.md)
- [Failure and recovery](failure-and-recovery.md)
- [Progress JSON reference](../reference/progress-json.md)
- [Status and artifacts reference](../reference/status-and-artifacts.md)

## Sources

- `skills/nova/project_setup/progress-json.md`
- `skills/nova/pipeline/core/config.ts`
- `skills/nova/pipeline/core/paths.ts`
- `skills/common/pipeline/lifecycle-state.ts`
