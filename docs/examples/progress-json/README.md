# Progress JSON Examples

Status: examples
Audience: operators, developers

## Purpose

Show safe project workflow examples and runtime-state examples for interpreting pipeline runs.

## Files

- `success.json`: minimal project config expected to complete when the app and suites pass.
- `end-to-end.json`: richer project config with staged modules, review gate, final Buster gate, approval gate, telemetry, and post-run generators.
- `in-progress.json`: status evidence shape for a module currently in Buster.
- `failed.json`: blocked pre-check/tooling failure shape.
- `partial-artifacts.json`: examples of artifact combinations after interrupted runs.

## Use

Validate example JSON:

```bash
jq . docs/examples/progress-json/success.json
jq . docs/examples/progress-json/end-to-end.json
jq . docs/examples/progress-json/in-progress.json
jq . docs/examples/progress-json/failed.json
jq . docs/examples/progress-json/partial-artifacts.json
```

Compare live project config:

```bash
jq '.execution_order, .modules, .gates' Projects/my-project/src/.swarm/progress.json
```

Compare live module state:

```bash
find Projects/my-project/src/.swarm -name '*status*.json' -o -name 'buster-output.json'
```

## Interpretation

- Use `success.json` when creating or reviewing a new project workflow.
- Use `end-to-end.json` when you need to see how modules, gates, suite config, approval, telemetry, architecture validation, pipeline review, and case study settings fit together.
- Use `in-progress.json` when status says `TESTING` and you need to verify Buster owns the current phase.
- Use `failed.json` when a module is blocked before Buster dispatch and the evidence points at lint/pre-check tooling.
- Use `partial-artifacts.json` when deciding whether to resume or recover missing integration evidence.

## Walkthrough: `end-to-end.json`

The richer example models a small product delivery pipeline:

1. `01-scaffold` is Forge-only. It creates the base app shell and shared config, then passes without per-module Buster because later modules and gates provide validation.
2. `02-api` depends on `01-scaffold` and uses Forge plus Buster. It configures `build`, `health`, `unit`, and `api` suites because API work needs deterministic runtime checks.
3. `gate:midpoint-review` runs after the API module. It gives the reviewer a stable architecture checkpoint before frontend work starts.
4. `03-frontend` depends on both the API module and the midpoint gate. It uses `build`, `health`, `e2e`, and `a11y` suites because UI work needs browser and accessibility evidence.
5. `gate:final-buster` runs broad final validation, including `k8s`, after the product-shaped modules pass.
6. `gate:release-approval` pauses automation for an operator decision before release.
7. `arch_validation`, `pipeline_review`, and `case_study` show optional validation and post-run generator shape.

The example is intentionally verbose. It is meant to teach the shape and the "why", not to be copied unchanged into production.

## What To Change First

When adapting `end-to-end.json`, change these fields before running:

- `project`: must match the project directory under `Projects/`.
- `execution_order`: should match the real delivery order and review/approval points.
- `modules.<id>.dir`: must match `.swarm/modules/<dir>`.
- `modules.<id>.depends_on`: should express real prerequisites, not just visual ordering.
- `test_config.serve.project_dir`: must point at the app root Buster should run.
- `start_cmd`, ports, health paths, and suite commands: must match the app.
- gate `instructions_file` and `output_file`: must point to safe `.swarm` relative paths.
- final `k8s` config: must match the preview/deployment path if Kubernetes validation is enabled.

## Common Misreads

- `execution_order` is the scheduler order. `phases` is informational when present.
- `depends_on` is still checked even when the order looks correct.
- `stages: ["forge"]` means no per-module Buster task should appear.
- Missing Buster artifacts are normal while a module is still in Forge.
- A Buster config validation failure is not the same as a failing app test.
- Approval gates are intentional automation pauses, not stuck modules.

## Source Owners And Verification

| Example field | Runtime owner | Check |
| --- | --- | --- |
| `project`, `repo_root`, and `paths` | `skills/nova/pipeline/core/config.ts` | config/path tests |
| `execution_order`, modules, gates | `skills/nova/pipeline/runners/pipeline-runner*.ts` | pipeline E2E behavior area |
| `test_config`, suites, paths, capabilities | `skills/buster/pipeline/services/task-validation.ts`; `suite-runner.ts` | Buster task validation and suite tests |
| gate outputs and instructions | `skills/nova/pipeline/core/paths.ts`; gate runners | gate behavior area and status-store contract |
| lifecycle status interpretation | `skills/nova/pipeline/services/status-store*.ts` | status-store contract check |

These examples are fixtures and teaching aids, not a generated schema. When you adapt one for a real project, validate the resulting project with the narrowest runtime test and then inspect `.swarm/logs/pipeline/latest.json`, run-scoped `pipeline.jsonl`, and module/gate artifacts.
