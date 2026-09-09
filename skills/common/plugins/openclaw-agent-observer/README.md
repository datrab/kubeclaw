# OpenClaw Agent Observer

This OpenClaw plugin converts agent hook events into the KubeClaw agent-observability contract. It writes bounded control and telemetry records to Redis.

The plugin validates configuration before startup. It limits payload size, queue size, command duration, retry behavior, and stream retention.

Run its verification with:

```bash
npm test --prefix skills/common/plugins/openclaw-agent-observer
```

Runtime duplicate detection uses source run/stream/sequence. Cross-hook LLM
matching also requires model-call identity and complete normalized content;
distinct outputs and runtime sequences remain distinct. Dedupe is recorded only
after queue admission. Missing source identity does not justify suppression.

Normalization marks cycles explicitly and rejects excessive depth, nodes or
bytes before an unbounded traversal. Ordinary getters/proxies are rejected.
Large valid diagnostic content is not silently shortened. These changes retain
the existing raw-channel trust policy and do not add automatic log deletion.
The package tests prove observer and queue behavior with a recording client;
they do not prove deployment against OpenClaw or real Redis.
