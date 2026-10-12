# Wait store

Creates durable typed waits through the shared pipeline durable-record
interface. Creation
is idempotent under the core-issued idempotency key; replay with different
content fails closed. The adapter validates expiry timestamps, rejects
invalid durable stores, bounds entries, supports inspection, and honors
cancellation.

`root` selects the embedded file driver. The former `journalPath` and
`waits.jsonl` storage path are removed.
Wait records accept the full 256-character pipeline idempotency-key limit.

Core remains responsible for signal authorization, expiry enforcement, and
lifecycle resumption. This adapter persists wait intent; it does not accept or
authorize resume signals.
