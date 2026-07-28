# Agent observability plugin

Owns two independently authorized observers:

- `ingester` writes a bounded, redacted telemetry envelope;
- `evidence` writes immutable terminal-event evidence artifacts.

Both preserve event/delivery identity, recursively redact sensitive fields,
bound hostile payload depth and cardinality, and rely on core checkpoints for
idempotent redelivery. They share implementation but never share grants.
