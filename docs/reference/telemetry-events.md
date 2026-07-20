# Telemetry Events

Status: current
Audience: reference reader, maintainer

## Summary

Telemetry events use a structured envelope and run-scoped Redis stream. Canonical inventory and stream semantics are owned by `docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md`. Event-by-event payload fields are owned by `docs/telemetry-event-schema.md`.

Known event payloads are validated by `skills/common/pipeline/services/telemetry/payload-schema.ts`.

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
- max stream length: `telemetry.stream_max_len` in `swarm.config.json`
- sequence TTL: seven days

## Event Families

The canonical event inventory lives in `docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md`.

## Terminal Fields

Terminal events use:

- `terminal_status`
- `terminal_decision`
- `reason_code`

Do not add numeric process exit fields as replay state.

## Failure Behavior

Telemetry write failures are non-blocking for scheduler truth when local canonical artifacts preserve recovery evidence. Degraded/restored events and explicit quarantine records make the observability failure visible.

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
node tests/verification/contracts/check-telemetry-contract.mjs --source-root "$PWD"
npm run docs:check
```

## Generated From

This page is manually maintained from:

- `skills/common/pipeline/telemetry.ts`
- `skills/common/pipeline/services/telemetry/payload-schema.ts`
- `skills/nova/pipeline/services/telemetry-stream.ts`
- `skills/nova/pipeline/services/telemetry.ts`
- `skills/buster/pipeline/services/telemetry.ts`
