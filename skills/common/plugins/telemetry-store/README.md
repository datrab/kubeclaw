# Telemetry store

Provides a local append-only telemetry evidence journal for v2 lifecycle
observers. Records receive monotonic sequence numbers and core idempotency
keys, are fsynced before acknowledgement, redact secret-bearing fields
recursively, validate on replay, and enforce size and cancellation bounds.

This package is local v2 foundation; it does not claim Redis stream parity.
