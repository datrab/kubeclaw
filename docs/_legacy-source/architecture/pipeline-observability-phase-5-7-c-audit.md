# Pipeline Observability Phase 5.7-C Audit

Status: complete

## Outcome

The shared foundation now provides a bounded durable producer outbox and an
embedded durable admission store.

## Guarantees

- A record is stored before delivery starts.
- Admission is acknowledged only after an atomic file write and directory
  sync.
- Replay keeps the original identity and cursor.
- Duplicate delivery does not duplicate normalized facts.
- Invalid and conflicting raw bytes enter durable quarantine.
- A full outbox returns an explicit error.
- Only acknowledged records can be compacted.
- The Linux kernel `flock` lock serializes writers and releases on crash.
- Each store has its own lock file. A transaction can safely hold an attempt
  lock while it admits the matching completion record.
- Newly created store directories and their parents are synced before an
  acknowledgement can return.
- Admission and quarantine use explicit record and byte limits.
- Quarantine overflow keeps bounded metadata instead of unbounded raw bytes.
- This phase exposes no admission compaction. Phase 5.7-D must first provide a
  durable consumer checkpoint.
- Raw ingress has a byte limit before parsing and base64 encoding.
- Admission can return its durable record snapshot in the same locked
  operation. Closure creation does not need a second, racy read.

## Architecture audit

Nova does not process raw telemetry. Workers can publish attempt-scoped facts.
Admission does not change pipeline state. Redis and WebSocket delivery remain
non-authoritative live views.

The file profile supplies a small first deployment. The storage boundary can
use PostgreSQL later without changing the producer contract.

The focused proof passes. The final Terra high-reasoning review is clean. No
accepted or actionable finding remains.
