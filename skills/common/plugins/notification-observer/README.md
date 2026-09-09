# Notification observer

Publishes selected immutable lifecycle events without scheduler authority.
The `notifications` registration owns stable lifecycle summaries; the
`preview-delivery` registration exposes only bounded artifact identity and
metadata rather than forwarding arbitrary artifact bodies. Each registration
has independent grants, delivery attempts, and checkpoints.

Audit is derived from Nova's authoritative event journal with `readPipelineAudit` or the core CLI's `--platform <file> --audit <run-id>` command. The redundant required audit observer and artifact writes were removed. Journal integrity is checked before producing redacted output; rebuilding requires no observer delivery or writable artifact store. Existing runs that enabled the retired registration must drain with their pinned runtime.

Lifecycle summaries preserve line breaks and tabs accepted by operator-messaging.
Presentation labels normalize control whitespace, and every shortening marker
counts within the configured limit. Combined stage/role titles stay within 512
characters. The original event journal retains the complete diagnostic; the
notification is its marked display projection and carries the event identity.
