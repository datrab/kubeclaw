# Telemetry Events

Status: current
Audience: reference reader, maintainer

## Summary

Telemetry events use a structured envelope and run-scoped Redis stream. Known event payloads are validated by `skills/common/pipeline/services/telemetry/payload-schema.ts`.

## Envelope Fields

- `v`
- `type`
- `ts`
- `run_id`
- `project`
- `seq`
- `source`
- `emitter`

## Redis Keys

- stream: `pipeline:telemetry:<project>:<run_id>`
- sequence key: `pipeline:telemetry:seq:<project>:<run_id>`
- default max stream length: `10000`
- sequence TTL: seven days

## Event Families

Common current families include:

- `pipeline.started`
- `pipeline.completed`
- `pipeline.halted`
- `pipeline.operator_alert`
- `module.started`
- `module.completed`
- `module.failed`
- `module.blocked`
- `module.retry_scheduled`
- `module.status_changed`
- `gate.started`
- `gate.completed`
- `approval.requested`
- `approval.resolved`
- `rate_limit.detected`
- `retry.scheduled`
- `retry.exhausted`
- `observability.degraded`
- `observability.restored`
- `agent.spawn.requested`
- `agent.spawned`
- `agent.progress`
- `agent.killed`
- `agent.ended`
- `agent.llm.input.summary`
- `agent.llm.output.summary`
- `agent.tool.started`
- `agent.tool.finished`
- `plugin.event`

## Terminal Fields

Terminal events use:

- `terminal_status`
- `terminal_decision`
- `reason_code`

Do not add numeric process exit fields as replay state.

## Failure Behavior

Telemetry write failures are non-blocking for scheduler truth when local artifacts preserve recovery evidence. Degraded/restored events and fallback artifacts make the observability failure visible.

## Event Build Path

Nova pipeline event helpers are exported by `skills/nova/pipeline/services/telemetry.ts`. The detailed owners are:

- builders: `skills/nova/pipeline/services/telemetry/builders.ts`
- dispatch: `skills/nova/pipeline/services/telemetry/dispatch.ts`
- sink input validation: `skills/nova/pipeline/services/telemetry-sink-contract.ts`
- Redis stream emission: `skills/nova/pipeline/services/telemetry-stream.ts`
- payload schema validation: `skills/common/pipeline/services/telemetry/payload-schema.ts`

Agent status, transcript, progress, model, tool, and LLM events are observer-owned. The OpenClaw agent observer plugin writes raw hook evidence to the agent-observability streams, and the ingester promotes that evidence into canonical `agent.*` telemetry. Gateway/HTTP polling is diagnostic only and must not be used as the authority for whether an agent started, is still running, or ended successfully.

The envelope is flat. Event-specific fields live beside `v`, `type`, `ts`, `run_id`, `project`, `seq`, `source`, and `emitter`; do not wrap canonical payloads in legacy nested `data` or `refs` objects.

Verification:

```bash
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area telemetry-docs
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area docs-surface
```

## Generated From

This page is manually maintained from:

- `skills/common/pipeline/telemetry.ts`
- `skills/common/pipeline/services/telemetry/payload-schema.ts`
- `skills/nova/pipeline/services/telemetry-stream.ts`
- `skills/nova/pipeline/services/telemetry.ts`
- `skills/buster/pipeline/services/telemetry.ts`
