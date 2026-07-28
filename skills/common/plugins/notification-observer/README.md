# Notification observer

Publishes selected immutable lifecycle events without scheduler authority.
The `notifications` registration owns stable lifecycle summaries; the
`preview-delivery` registration exposes only bounded artifact identity and
metadata rather than forwarding arbitrary artifact bodies. Each registration
has independent grants, delivery attempts, and checkpoints.
