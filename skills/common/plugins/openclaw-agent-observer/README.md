# OpenClaw Agent Observer

This OpenClaw plugin converts agent hook events into the KubeClaw agent-observability contract. It writes bounded control and telemetry records to Redis.

The plugin validates configuration before startup. It limits payload size, queue size, command duration, retry behavior, and stream retention.

Run its verification with:

```bash
npm test --prefix skills/common/plugins/openclaw-agent-observer
```
