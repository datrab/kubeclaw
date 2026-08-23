# Telemetry store

Provides a bounded telemetry stream for v2 lifecycle observers. Records use
the shared pipeline durable-record interface. They receive monotonic sequence
numbers and core idempotency keys. The embedded driver makes each update
durable before acknowledgement. It also enforces size and cancellation bounds.

`root` selects the embedded file driver. The former `journalPath` JSONL file
is removed. Secret-bearing fields remain redacted by this adapter.

An identical idempotency key and sanitized payload is a duplicate. The same
key with different content is an idempotency conflict and fails closed.

This package is a pipeline-side storage foundation. ClawDeck ingestion and
high-volume telemetry drivers are later work.
