# Buster Task Config

Status: current
Audience: reference reader, developer

## Summary

Buster accepts typed Redis task payloads for module and gate testing. Payloads are validated before suite execution. Invalid payloads are dead-lettered before Redis ACK.

## Task Types

- `module_test`
- `gate_test`

## Required Payload Fields

- `task_type`
- `module_id`
- `project`
- `run_id`
- `attempt`
- `dispatch_id`
- `commit_hash`
- `output_file`
- `stage_id`
- `timeout_seconds`
- `session.runtime`
- `session.model`
- `session.agentId` or `session.agent_id`
- `session.cwd`
- `session.label`
- `suites`

Additional requirements:

- `worker_type` must be `module_buster` for `module_test`.
- `gate_id` is required for `gate_test`.
- `suites` must be a non-empty string array.
- capabilities must be known Buster capabilities.

## Path Fields

These fields must stay inside the repository boundary and must not use parent traversal:

- `output_file`
- `module_path`
- `buster_md_path`
- `work_dir`
- `instructions_file`
- `session.cwd`

## Known Capabilities

- `static_web_server`
- `container_runtime`
- `kubernetes_api`
- `browser_automation`
- `lighthouse`
- `discord_media`
- `image_prepull`

## Output And Completion

Buster writes task output JSON to the configured `output_file` and publishes completion to the provided completion stream. Process failures must still produce completion or dead-letter evidence before ACK; otherwise Buster raises a terminal guarantee error.

Valid task output status values normalize to:

- `PASS`
- `FAIL`

Suite-level statuses can include `ERROR` and `SKIP`, but the task completion normalizes the overall outcome.

## Generated From

This page is manually maintained from:

- `skills/buster/pipeline/services/task-validation.ts`
- `skills/buster/pipeline/services/capabilities.ts`
- `skills/buster/pipeline/services/task-completion.ts`
- `skills/buster/pipeline/runners/suite-runner.ts`
