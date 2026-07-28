# Telemetry observer

Consumes immutable canonical events with at-least-once per-run ordering and
maps them into a stable telemetry envelope before invoking `telemetry.emit`.
The envelope preserves core-issued event identity, sequence, causation,
registration provenance, and delivery attempt without allowing the observer
to mutate lifecycle state.
