# Runtime dispatch adapter

Provides bounded, target-scoped dispatch to configured runtime endpoints.
Requests and responses are closed to JSON values and bounded by depth, shape,
and bytes. Authentication uses an idempotency-bound HMAC so raw runtime secrets
never enter auditable nested effect requests or journals. Network and secret
access remain independently granted.

This package owns the transport protocol only. Legacy spawn, monitoring,
transcript, handoff, cancellation policy, and recovery behavior remain
explicitly blocked until their canonical capabilities are implemented.
