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

Before redaction, the sink validates the complete JSON graph with a maximum
nesting depth of 64, 100,000 visited values, and the configured `maxRecordBytes`
input byte budget. Cycles, accessors, proxies, non-JSON values, and invalid
prototypes fail explicitly before any record is written. Shared noncyclic
objects are valid and each occurrence counts toward the budget. Oversized
records fail with `TELEMETRY_RECORD_SIZE_EXCEEDED`; no content is silently cut.
The durable store also checks the final redacted record size.

The field projection protects authorization/cookie/password/secret/token,
API-key and credential aliases, private/access keys and connection strings,
and explicitly named personal-data fields such as email, phone and userData.
A plain `key` is not treated as evidence of credential provenance. This adapter
has no trusted mechanism to establish pipeline-generated demo credentials, so
self-declared demo labels never exempt protected fields. It does not classify
arbitrary diagnostic text as safe or detect every possible secret embedded in
free text; producers remain responsible for safe source content.

Canonical diagnostic files remain owned by their existing producers/artifact
stores and ultimately Clawdeck's log collection. This stream is a protected
telemetry projection, not another canonical log store. Diagnostic text within
budget, source artifact references, and explicit display truncation metadata
are preserved in full. The sink never rewrites a referenced source artifact and
cannot restore details already redacted or shortened by an upstream observer.
