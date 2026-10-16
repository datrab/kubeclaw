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

Lifecycle `maxMessageChars` is required at invocation and selected solely from
`config/nova/core.config.json` → `notificationPresentation`. Local registration
authors reject even equal values; retained runs keep their captured selection.
The standard value remains 8192 characters, including the shortening marker.

Title, reason-code and preview artifact display limits are also required from the selected `notificationPresentation` policy (`maxTitleChars`, `maxReasonCodeChars`, `maxArtifactIdChars`, `maxArtifactDigestChars`, `maxArtifactMediaTypeChars`, `maxArtifactLogicalNameChars`). Preview publishing uses the same captured policy and preserves its redaction allowlist; original identity fields are not truncated.
