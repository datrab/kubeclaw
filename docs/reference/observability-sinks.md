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

## Built-In Sink Ownership

| Sink | Module owner | Input contract | Output |
| --- | --- | --- | --- |
| Redis telemetry | `skills/nova/pipeline/services/telemetry-sink-contract.ts` calling `emitTelemetryStreamEvent()` in `telemetry-stream.ts` | `validateTelemetrySinkInput()` requires run ID, run ref, primary ref, event type, object payload, and ISO timestamp | `pipeline:telemetry:<project>:<run_id>` |
| Discord telemetry | `observeDiscordTelemetrySink()` in `telemetry-sink-contract.ts` | only `level`, `title`, `description`, and string `fields`; raw embeds rejected | webhook delivery and `discord.jsonl` audit evidence |
| Structured notification artifact | `skills/nova/pipeline/services/notification-contract.ts` | lifecycle hook presentation events | run-scoped structured event artifacts |
| OpenClaw agent observer | `plugins/openclaw-agent-observer/src/index.ts` and `redis-writer.ts` | normalized OpenClaw hook events from `hook-normalizers.ts` | observer Redis streams and dead-letter attempts |

Failure invariant: sink delivery never upgrades a module/gate to PASS or FAIL. It can only emit observability evidence or degrade/restored signals.

Verification:

```bash
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area telemetry-docs
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
```

## Generated From

This page is manually maintained from:

- `skills/nova/pipeline/services/notification-contract.ts`
- `skills/nova/pipeline/services/telemetry-sink-contract.ts`
- `skills/nova/pipeline/services/observability.ts`
