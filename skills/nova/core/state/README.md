# State ownership

Core journals are append-only, fsync-backed, hash chained, and protected
against concurrent cross-process appends. Registration state uses the exact
`plugin.<plugin-id>.<registration-id>` namespace, stable idempotency identity,
monotonic sequence numbers, and deterministic projection reducers.

Signal resume is single-use and validates wait identity, signal type,
authorized issuer, expiry, and freshness relative to the canonical
`wait.created` event. Resume creates a new stage attempt.
