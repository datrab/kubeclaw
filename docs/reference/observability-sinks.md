# Observability Sinks

Status: current
Audience: reference reader, developer

## Summary

KubeClaw has notification sinks and telemetry sinks. Notification sinks handle lifecycle hook presentation. Telemetry sinks handle event stream output.

## Notification Hooks

- `pipeline.started`
- `pipeline.completed`
- `module.started`
- `module.completed`
- `gate.started`
- `gate.completed`

Built-in notification sinks:

- telemetry
- structured event artifact
- Discord

## Telemetry Sink Stage

- hook family: `telemetry.sink`
- stage ID: `telemetry.sink`

Built-in telemetry sinks:

- `builtin.telemetry.redis`
- `builtin.telemetry.discord`

## Telemetry Sink Input

Required:

- `ids.runId`
- `ids.stageId`
- `refs.runRef`
- `refs.primaryRef`
- `event.type`
- `event.payload`
- `occurredAt`

Optional identity:

- `ids.moduleId`
- `ids.gateId`
- `ids.gateType`
- `ids.attempt`
- `refs.moduleAttemptRef`
- `refs.gateEvaluationRef`

Discord presentation supports:

- `level`
- `title`
- `description`
- `fields`

Raw embeds are rejected by the telemetry sink contract.

## Failure Behavior

- Redis telemetry failures can degrade observability and use fallback artifacts.
- Discord telemetry is filtered and should not affect scheduler truth.
- Invalid sink input should fail loudly in the emitter/plugin path.
- Structured event artifact failures are observability failures, not module success/failure authority.

## Generated From

This page is manually maintained from:

- `skills/nova/pipeline/services/notification-contract.ts`
- `skills/nova/pipeline/services/telemetry-sink-contract.ts`
- `skills/nova/pipeline/services/observability.ts`
