# Telemetry observer

Consumes immutable canonical events with at-least-once per-run ordering and
maps them into a stable telemetry envelope before invoking `telemetry.emit`.
The envelope preserves core-issued event identity, sequence, causation, and
registration provenance without allowing the observer to mutate lifecycle
state. Delivery-attempt metadata remains in the core journal so retried sink
payloads stay byte-identical and idempotent.
