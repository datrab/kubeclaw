# Pipeline Decisions

Status: current
Audience: developer, maintainer

## Nova lifecycle authority

Decision: Nova owns pipeline lifecycle state, scheduling, terminal decisions, and status projections.

Reason: The runner and status store write lifecycle, `latest.json`, summaries, and terminal outcomes. Redis completions and Discord artifacts are evidence surfaces, not independent scheduler truth.

Source proof: `skills/nova/pipeline/runners/pipeline-runner.ts`, `skills/nova/pipeline/runners/pipeline-runner-terminal.ts`, `skills/nova/pipeline/services/status-store.ts`, `skills/nova/pipeline/services/status-store-lifecycle/appenders.ts`, and `skills/nova/pipeline/services/artifact-bundle.ts`.

Verification: `node tests/verification/contracts/check-status-store-slice-surface.mjs --source-root "$PWD"` and `node tests/verification/behavior/verify.mjs --source-root "$PWD" --area restart-recovery`.

## Buster typed tasks

Decision: Buster receives typed Redis tasks for `module_test` and `gate_test` and validates payloads before execution.

Reason: This keeps destructive test execution outside Nova while preserving strict task identity and artifact contracts.

Source proof: `skills/buster/pipeline/services/task-validation.ts` requires task identity such as `task_type`, `module_id`, `project`, `run_id`, `attempt`, `dispatch_id`, `output_file`, `stage_id`, `session.*`, `suites`, and `test_config.suite_timeout_ms`. `skills/buster/pipeline/services/task-queue.ts` writes malformed tasks to the dead-letter path before ACK.

Verification: `node --test tests/skills/buster/pipeline/services/task-validation.test.mjs tests/skills/buster/pipeline/services/task-completion.test.mjs`.

## Typed terminal decisions as contract

Decision: Pipeline outcomes use typed terminal decisions and terminal statuses. Numeric process exits are only allowed at true process boundaries.

Reason: Runners, terminal handling, retry policy, telemetry, summaries, and replay artifacts all normalize outcomes through `terminal_status`, `terminal_decision`, and `reason_code`, avoiding magic-number behavior in pipeline domain logic.

Source proof: `skills/nova/pipeline/services/contracts/terminal-decision.ts`, `skills/nova/pipeline/runners/pipeline-runner-terminal.ts`, `skills/nova/pipeline/services/failures/retry-policy.ts`, and `skills/nova/pipeline/services/contracts/pipeline-step-result.ts`.

Verification: `node tests/verification/contracts/check-pipeline-terminal-decision-surface.mjs --source-root "$PWD"` and `node tests/verification/contracts/check-pipeline-step-result-surface.mjs --source-root "$PWD"`.

## Plugin Registry Is Startup-Time Platform Config

Decision: plugin registry validation belongs to platform config load, not to ad hoc module/gate execution.

Reason: stage owners, restricted capabilities, and plugin modules must be known before the runner selects work. This lets the pipeline fail early on invalid config rather than during a partially executed stage.

Source proof: `skills/nova/pipeline/core/config.ts` calls `buildPluginRegistry` from `skills/nova/pipeline/core/registry.ts`; registry helpers live in `skills/nova/pipeline/core/registry/builtins.ts`, `config-normalization.ts`, `indexes.ts`, and `validation.ts`.

Verification: `node --test tests/skills/nova/pipeline/core/config-plugin-registry.test.mjs`.
