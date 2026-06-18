# Process Exits And Terminal Status

Status: current
Audience: reference reader, operator

## Summary

Nova pipeline replay, telemetry, and artifacts use typed terminal fields. Numeric process exit codes are only shell/process-boundary adapters.

## Nova Terminal Contract

Typed terminal statuses:

- `succeeded`
- `failed`
- `action_required`
- `blocked`
- `timed_out`
- `rate_limited`

Terminal fields:

- `terminal_status`
- `terminal_decision`
- `reason_code`

## Nova CLI Process Codes

- `0`: success / completed
- `1`: non-success terminal status, config error, or system error

The constants file still defines additional historical/specialized numeric constants, but current terminal process adaptation maps success to `0` and non-success to `1`.

## Buster Process Conventions

- `0`: PASS
- `1`: FAIL
- `2`: ERROR, script error, timeout, or configuration problem

## Operator Guidance

Use the numeric process code for shell automation only. For recovery, inspect terminal artifacts and status JSON.

## Generated From

This page is manually maintained from:

- `skills/nova/pipeline/services/contracts/terminal-decision.ts`
- `skills/nova/pipeline/cli.ts`
- `skills/buster/CONVENTIONS.md`

## Terminal Status Mapping

Pipeline control should prefer typed terminal decisions over numeric exit codes. Current terminal statuses are `succeeded`, `failed`, `paused`, `blocked`, `action_required`, `timed_out`, `rate_limited`, and `cancelled`; actions are `none`, `stop`, `pause`, `notify_operator`, `request_handoff`, and `retry_later`.

Step outcomes map to terminal status through `terminal-decision.ts`:

| Step outcome | Terminal status |
| --- | --- |
| `passed` | `succeeded` |
| `error` | `failed` |
| `needs_nova` | `action_required` |
| `blocked` | `blocked` |
| `timeout` | `timed_out` |
| `rate_limited` | `rate_limited` |

Run `node tests/verification/contracts/check-pipeline-step-result-surface.mjs --source-root "$PWD"` and `node tests/verification/contracts/check-manual-degraded-terminal-acceptance.mjs --source-root "$PWD"` when changing terminal behavior.
