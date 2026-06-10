# Adding Observability Sinks

Status: current
Audience: developer, maintainer

## Purpose

Use this page when adding or adapting telemetry output paths. Observability sinks should preserve the event contract, redact sensitive data, and fail in a way operators can diagnose.

## Current Sinks

Built-in telemetry sinks:

- Redis telemetry sink: full-firehose stream for live consumers.
- Discord telemetry sink: filtered notification surface for events with explicit Discord presentation data.

Built-in notification sinks:

- telemetry mirror
- structured event artifact mirror
- Discord notification delivery

## Telemetry Sink Lifecycle

1. A pipeline component emits an event and payload.
2. Nova builds a telemetry sink input with IDs, refs, event, presentation, state snapshot, execution context, and timestamp.
3. The sink input is validated.
4. The sink plugin observes the event.
5. Success, degradation, or failure is recorded through telemetry and artifacts.

Required input fields include:

- `ids.runId`
- `ids.stageId: "telemetry.sink"`
- `refs.runRef`
- `refs.primaryRef`
- `event.type`
- `event.payload`
- `occurredAt`

## Event Schema Compatibility

The shared telemetry payload schema validates known event families and allows structured JSON payloads. A new sink should not invent a new envelope. Add new event types to the schema when the event is part of the pipeline contract; use `plugin.event` with `plugin_id`, `plugin_event`, and `details` for plugin-local events.

## Masking And Redaction

Sinks must treat these as sensitive:

- provider API keys
- Discord tokens/webhooks
- Redis passwords
- Kubernetes Secret values
- app-under-test credentials unless explicitly allowlisted for Buster prompt context
- session transcripts that may contain secrets

Redact before writing to Redis, Discord, local JSONL, or external sinks.

## Failure Behavior

Preferred behavior:

- local artifact failure: emit degraded observability and continue if scheduler truth is preserved
- Redis sink failure: write fallback artifacts where supported and mark observability degraded
- Discord sink failure: write audit artifacts and do not change pipeline outcome by itself
- invalid sink input: fail loudly in the plugin path; fix the emitter contract

Do not let optional observability failures convert a successful module into `PASS` or `FAIL`; they should affect observability state unless the artifact is required for recovery.

## Adding A Sink

1. Add a plugin with kind `telemetry` and hook family `telemetry.sink`.
2. Validate the sink input with the existing telemetry sink contract.
3. Preserve the standard envelope and add sink-specific fields only inside sink output.
4. Add redaction tests.
5. Add degradation/restoration handling.
6. Document operator checks and failure symptoms.

Example config shape:

```json
{
  "plugins": {
    "enabled": true,
    "allowCustomModules": true,
    "extraModulePaths": ["/home/node/.openclaw/plugins"],
    "modules": {
      "local.telemetry.http": {
        "enabled": true,
        "config": {
          "endpoint": "https://observability.example.invalid/kubeclaw"
        }
      }
    }
  }
}
```

## Verification

Run telemetry-related behavior checks:

```bash
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area telemetry
```

Then verify docs and generated references:

```bash
npm run docs:inventory:check
npm run docs:generate:check
```

## Sources

- `skills/nova/pipeline/services/telemetry-sink-contract.ts`
- `skills/nova/pipeline/services/notification-contract.ts`
- `skills/common/pipeline/services/telemetry/payload-schema.ts`
- `skills/nova/pipeline/services/observability.ts`
- `skills/buster/pipeline/services/telemetry.ts`
