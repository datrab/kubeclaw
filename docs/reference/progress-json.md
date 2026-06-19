# progress.json

Status: current
Audience: reference reader, developer

## Summary

`progress.json` is the project-level pipeline contract. It lives at:

```text
Projects/<project>/src/.swarm/progress.json
```

It defines project identity, module order, gate order, module settings, gate settings, suite config, and optional post-pipeline generators.

## Top-Level Fields

- `project`: required project name used for paths, memory scoping, and Redis streams.
- `version`: schema version, commonly `1`.
- `description`: optional human-readable description.
- `notes`: optional informational notes.
- `defaults`: project defaults, commonly model defaults.
- `execution_order`: required ordered list of module IDs and `gate:<id>` entries.
- `modules`: required module definitions.
- `gates`: required gate definitions, may be empty.
- `arch_validation`: optional architecture validator config.
- `pipeline_review`: optional post-pipeline review config.
- `case_study`: optional case study generator config.
- `telemetry`: optional project telemetry enablement.
- `payload`: optional dispatch/rate-limit config.
- `phases`: optional informational grouping; pipeline ignores it for scheduling.

ACP monitor timing is platform-owned and belongs in `swarm.config.json`.

## Module Fields

- `title`: human-readable name.
- `dir`: directory under `.swarm/modules/`.
- `depends_on`: module IDs that must pass first.
- `stages`: defaults to `["forge", "buster"]`; use `["forge"]` for forge-only modules.
- `timeout_minutes`: module timeout.
- `max_fails`: retry/block threshold.
- `forge_model`: Forge model override.
- `thinking_level`: Forge thinking level.
- `substeps`: optional substep IDs. Each substep must provide `<substep>/FORGE.md`.
- `forge_subagent`: optional Forge subagent override.
- `session`: per-task runtime selection.
- `test_suites`: Buster suite names.
- `test_config`: suite-specific config.

## Gate Fields

Review gate:

- `type`: `review`
- `title`
- `review_name`
- `on_fail`: `fix_and_rereview` or `stop`
- `instructions_file`: relative to `.swarm`
- `output_file`: relative to `.swarm`
- `review_output_dir`
- `reviewers`
- `forge_model`
- `forge_thinking_level`
- `timeout_minutes`
- `max_fix_cycles`
- `lint_tier`

Buster gate:

- `type`: `buster`
- `title`
- `on_fail`
- `instructions_file`
- `output_file`
- `model`
- `forge_model`
- `timeout_minutes`
- `max_fix_cycles`
- `test_suites`
- `test_config`

Approval gate:

- `type`: `approval`
- `title`
- `on_timeout`: `block` or `continue`
- `timeout_minutes`

## Suite Config Keys

- `serve`: app build/serve behavior used by several suites.
- `api`: API spec, auth, HTTP/WebSocket expectations, thresholds.
- `unit`: test command and thresholds.
- `e2e`: test directory/command and thresholds.
- `visual-reg`: reviewed baseline metadata and thresholds.
- `a11y`: axe tags/path/exclusions/thresholds.
- `perf`: performance thresholds.
- `bundle`: build output thresholds.
- `security`: paths/header checks.
- `manifest`: deployment/secret manifest validation.
- `k8s`: final-preview/pretest Kubernetes deployment validation.

Without thresholds, many suites record evidence but do not fail the task. With thresholds, suite findings can fail the task.

## Example

```json
{
  "project": "my-project",
  "version": 1,
  "defaults": {
    "models": {
      "forge": "gpt-5.4",
      "buster": "gpt-5.4",
      "echo": "gpt-5.4"
    }
  },
  "execution_order": ["01-scaffold", "02-api", "gate:final-buster"],
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
      "test_suites": ["build", "health", "unit"]
    }
  },
  "gates": {
    "final-buster": {
      "type": "buster",
      "title": "Final Buster",
      "instructions_file": "buster-test/FINAL-BUSTER.md",
      "output_file": "buster-test/FINAL-BUSTER-RESULT.json",
      "test_suites": ["build", "health", "unit"],
      "test_config": {}
    }
  }
}
```

## Used By

- Nova config loading and state machine scheduling
- module Forge and Buster runners
- review, approval, and Buster gate runners
- validators and post-pipeline generators
- Buster task dispatch

## Generated From

This page is manually maintained from:

- `skills/nova/project_setup/progress-json.md`
- `skills/nova/pipeline/core/config.ts`
- `skills/nova/pipeline/core/paths.ts`
