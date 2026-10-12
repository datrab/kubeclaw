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

`deliveryRoot` selects the embedded durable-record driver. The adapter saves
the publication request before the network action. It then saves the accepted
receipt or a failure record. A stored receipt is replayed without a second
network action.
Internal record identities use a fixed-length digest of the caller key. Keys
at the contract maximum length remain valid.

The adapter reserves the terminal record before it starts the network action.
It does not publish when the durable store cannot hold the receipt or failure.
The request is compared before a saved receipt is returned, so changed content
with the same key fails as an idempotency conflict.

This package is an HTTP publication foundation. It does **not** claim Redis
stream compatibility, retry scheduling, or parity with the legacy transport.
