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

Admission and attempt snapshots are revalidated on every read under the store
lock, before duplicate acknowledgement, recovery, or mutation. The configured
metadata byte limit applies before JSON parsing. Admission checks record contract
and digest, the original wire bytes against the stored record, identity uniqueness,
contiguous canonical cursors and the next cursor. Attempt replay checks worker
result and closure contracts/digests, wrapper identities and generations,
completion-intent bindings, evidence metadata paths and result references.
Pending result commit markers remain recoverable.

Malformed existing snapshots fail explicitly and remain on disk for diagnosis;
missing envelope fields are not silently restored with defaults. A missing file
still initializes a new store. Blob-byte corruption continues to appear through
the existing result-ingress and completeness checks. These unkeyed digests detect
inconsistent stored facts; they do not authenticate a complete rewritten store.
Store roots must remain protected. Replay validation adds no log deletion,
retention deadline or automatic history repair.

The [operator retention and manual cleanup contract](../../../../../docs/operations/observability-retention.md)
documents actual roots and quotas under D01/D07. Safe confirmed-history retirement
remains unimplemented (PCR-OBS-002); the policy does not authorize ad hoc deletion
of admission, result, journal or artifact records.
