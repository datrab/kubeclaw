# Telemetry ownership

Canonical lifecycle and domain events are immutable journal records. Observer
checkpoints are append-only and registration/run scoped. Restarting the
observer runtime deterministically redelivers only events beyond each
checkpoint; required audit sinks fail closed and best-effort sinks cannot
alter scheduler truth.
