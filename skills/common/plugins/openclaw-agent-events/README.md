# OpenClaw agent-event source

Bridges an explicit allowlist of OpenClaw agent hooks into canonical namespaced
plugin events. It normalizes run/stage/attempt identity, serializes emission
to provide backpressure, counts failed emissions, rejects duplicate or unknown
hooks, and drains queued delivery during shutdown.

The adjacent dual-host OpenClaw observer remains the concrete host integration
and contract fixture. Final no-duplicate-source behavior is a system E2E gate.
