# State store adapter

Provides registration-scoped append-only state streams. Each accepted record
has a namespace-local sequence and the core-issued idempotency key, is fsynced
before acknowledgement, and is validated during replay. Duplicate keys return
the original record rather than appending a second mutation.

Namespaces are logical resource identifiers rather than filesystem paths.
Entry size and cancellation are enforced at the adapter boundary.

The adapter uses the shared pipeline durable-record interface. `root` selects
the embedded file driver. The old namespace-specific JSONL files are removed.
