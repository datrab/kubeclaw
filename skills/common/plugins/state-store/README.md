# State store adapter

Provides registration-scoped append-only state journals. Each accepted record
has a namespace-local sequence and the core-issued idempotency key, is fsynced
before acknowledgement, and is validated during replay. Duplicate keys return
the original record rather than appending a second mutation.

Namespaces are logical resource identifiers rather than filesystem paths.
Entry size and cancellation are enforced at the adapter boundary.
