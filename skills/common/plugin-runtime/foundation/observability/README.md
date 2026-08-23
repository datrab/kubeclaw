# Durable observability delivery

This package is the embedded, single-writer storage profile.

- A producer appends a canonical record before it sends the record.
- Admission acknowledges a record only after an atomic durable write.
- A duplicate identity and digest returns the original cursor.
- A conflicting or invalid record enters quarantine.
- An acknowledged outbox record remains until explicit compaction.
- Redis and WebSocket delivery remain live views. They are not admission.

The embedded profile uses the Linux kernel `flock` interprocess lock. A process
crash releases the lock automatically.
Admission records and quarantine have explicit
record and byte limits. Quarantine overflow keeps a count, reason, byte size,
and digest without retaining more raw bytes. Phase 5.7-C exposes no admission
compaction. Phase 5.7-D can add it only after a durable consumer checkpoint
exists. Raw ingress also has a byte limit before parsing or encoding.

The interfaces permit a PostgreSQL admission driver later.

The durable attempt store adds content-addressed evidence, normalized attempt
results, and producer closures. It accepts a result only after its declared
evidence is durable and verified.
