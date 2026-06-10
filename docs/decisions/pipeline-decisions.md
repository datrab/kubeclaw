# Pipeline Decisions

Status: current
Audience: developer, maintainer

## Nova lifecycle authority

Decision: Nova owns pipeline lifecycle state, scheduling, terminal decisions, and status projections.

Reason: The runner and status store write lifecycle, `latest.json`, summaries, and terminal outcomes. Redis completions and Discord artifacts are evidence surfaces, not independent scheduler truth.

## Buster typed tasks

Decision: Buster receives typed Redis tasks for `module_test` and `gate_test` and validates payloads before execution.

Reason: This keeps destructive test execution outside Nova while preserving strict task identity and artifact contracts.

## Typed terminal decisions as contract

Decision: Pipeline outcomes use typed terminal decisions and terminal statuses. Numeric process exits are only allowed at true process boundaries.

Reason: Runners, terminal handling, retry policy, telemetry, summaries, and replay artifacts all normalize outcomes through `terminal_status`, `terminal_decision`, and `reason_code`, avoiding magic-number behavior in pipeline domain logic.
