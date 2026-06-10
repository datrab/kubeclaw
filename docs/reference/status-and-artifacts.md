# Status And Artifacts

Status: current
Audience: reference reader, operator

## Summary

This page lists current status values and key artifact paths for pipeline operation. Use [running the pipeline](../operators/running-the-pipeline.md) for procedures.

## Module Status Values

- `PENDING`
- `IN_PROGRESS`
- `READY_FOR_TESTING`
- `TESTING`
- `PASS`
- `FAIL`
- `BLOCKED`
- `RATE_LIMITED`

## Pipeline Terminal Statuses

- `succeeded`
- `failed`
- `action_required`
- `blocked`
- `timed_out`
- `rate_limited`

Terminal evidence uses:

- `terminal_status`
- `terminal_decision`
- `reason_code`

## Pipeline Artifacts

Project-global:

- `.swarm/logs/pipeline/latest.json`
- `.swarm/logs/pipeline/pipeline.jsonl`
- `.swarm/logs/pipeline/discord.jsonl`
- `.swarm/logs/pipeline/summary.json`

Run-scoped:

- `.swarm/logs/pipeline/runs/<run_id>/pipeline.jsonl`
- `.swarm/logs/pipeline/runs/<run_id>/discord.jsonl`
- `.swarm/logs/pipeline/runs/<run_id>/summary.json`
- `.swarm/logs/pipeline/runs/<run_id>/nova-injections.jsonl`
- `.swarm/logs/pipeline/runs/<run_id>/buster-telemetry-fallback.jsonl`
- `.swarm/logs/pipeline/runs/<run_id>/redis/redis-exchanges.jsonl`
- `.swarm/logs/pipeline/runs/<run_id>/redis/redis-ops.jsonl`

## Module Artifacts

Common module artifacts:

- `.swarm/modules/<module_dir>/FORGE.md`
- `.swarm/modules/<module_dir>/buster-output.json`
- `.swarm/modules/<module_dir>/tests/attempt-<attempt>/`
- `.swarm/logs/modules/<module_dir>/lint/precheck-attempt-<attempt>.json`
- `.swarm/logs/modules/<module_dir>/lint/precheck-trace-attempt-<attempt>.jsonl`

## Gate Artifacts

Approval gate:

- `.swarm/<gate_id>-gate-status.json`
- `.swarm/logs/gates/<gate_id>/approval-request.json`
- `.swarm/logs/gates/<gate_id>/approval-request.md`
- `.swarm/logs/gates/<gate_id>/approval-decision.json`
- `.swarm/logs/gates/<gate_id>/approval-transitions.jsonl`

Review/Buster gate paths come from gate `instructions_file`, `output_file`, and `review_output_dir` config, resolved relative to `.swarm`.

## Operator Commands

```bash
jq . Projects/my-project/src/.swarm/logs/pipeline/latest.json
find Projects/my-project/src/.swarm/logs/pipeline/runs -maxdepth 2 -type f | sort
find Projects/my-project/src/.swarm/modules -name 'buster-output.json' -print
find Projects/my-project/src/.swarm/logs/gates -type f | sort
```

## Generated From

This page is manually maintained from:

- `skills/nova/pipeline/core/constants.ts`
- `skills/nova/pipeline/core/paths.ts`
- `skills/nova/pipeline/services/artifact-bundle.ts`
- `skills/nova/pipeline/services/status-store.ts`
- `skills/common/pipeline/lifecycle-state.ts`
