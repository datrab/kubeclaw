# Notification observer

Publishes selected immutable lifecycle events without scheduler authority.
The `notifications` registration owns stable lifecycle summaries; the
`preview-delivery` registration exposes only bounded artifact identity and
metadata rather than forwarding arbitrary artifact bodies. Each registration
has independent grants, delivery attempts, and checkpoints.

The `audit` registration consumes all canonical lifecycle/effect/wait events,
writes one immutable redacted artifact per event, and uses the required
failure policy. It has only the `artifacts.write` grant for the
`kubeclaw.pipeline-audit` namespace.
