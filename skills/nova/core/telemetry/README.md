# Telemetry ownership

Canonical lifecycle and domain events are immutable journal records. Observer
checkpoints are append-only and registration/run scoped. Restarting the
observer runtime deterministically redelivers only events beyond each
checkpoint; required audit sinks fail closed and best-effort sinks cannot
alter scheduler truth.

Every delivery attempt is fsync-backed in `observer-deliveries.jsonl`.
Checkpoints are accepted only when their observer provenance, run, sequence,
event identity, and subscription match the canonical event journal. A failed
best-effort delivery blocks later events only for that observer/run. Required
observers fail the host operation after their bounded retry policy.

Externally visible effects derive idempotency from stable delivery identity.
Retry-varying attempt data belongs in the delivery journal, not sink payloads.
