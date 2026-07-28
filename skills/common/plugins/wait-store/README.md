# Wait store

Creates durable typed waits in an append-only, fsync-backed journal. Creation
is idempotent under the core-issued idempotency key; replay with different
content fails closed. The adapter validates expiry timestamps, rejects
symlinked journals, bounds entries, supports inspection, and honors
cancellation.

Core remains responsible for signal authorization, expiry enforcement, and
lifecycle resumption. This adapter persists wait intent; it does not accept or
authorize resume signals.
