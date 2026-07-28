# Transport publisher

`kubeclaw.transport-publisher` is a bounded, target-scoped HTTP implementation
of `transport.publish`.

The adapter selects an exact configured endpoint from the invocation resource's
`canonicalId`. It accepts only a closed `{ "message": { ... } }` payload,
enforces a per-target byte limit, and requires a closed acknowledgement from
the receiver.

Each request is authenticated with HMAC-SHA-256 over the target ID,
idempotency key, and exact JSON body. The signing key is obtained through the
confidential `secrets.read` capability. The raw key is never copied into the
auditable `network.http` request or the transport receipt. Receivers must
enforce the idempotency key to reject replays.

This package is an HTTP publication foundation. It does **not** claim Redis
stream compatibility, durable queueing, retry scheduling, delivery
acknowledgement beyond the immediate HTTP response, or parity with the legacy
transport.
