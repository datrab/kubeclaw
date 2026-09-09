# Operator messaging

`kubeclaw.operator-messaging` is the bounded provider for
`operator.request`.

Each configured logical target resolves to exactly one HTTP endpoint and one
secret name. The invocation resource must be an authorized
`operator.target`, and its `canonicalId` must exactly match a configured
target. Arbitrary URLs, headers, methods, credentials, and payload fields are
not accepted from callers.

Messages are closed JSON envelopes with a required `type`. Payloads are
validated recursively, bounded per target, and sent through the selected
`network.http` adapter as a `POST`. Delivery errors fail the capability
invocation; they are not reported as successful requests.

`deliveryRoot` selects the embedded durable-record driver. The adapter saves
the request before it sends the message. It then saves a delivery receipt or
failure. A retry uses the same external delivery identity (`deliveryId`, falling back to
`idempotencyKey` for legacy callers), with a distinct durable execution key. A stored receipt prevents a
second send after restart.
Internal record identities use a fixed-length digest of that key. Caller keys
at the contract maximum length remain valid.

The adapter reserves the terminal record before it starts the network action.
It does not send when the durable store cannot hold the receipt or failure.
The request is compared before a saved receipt is returned, so changed content
with the same key fails as an idempotency conflict.

## Confidential authentication

The adapter resolves its target secret through the confidential
`secrets.read` capability. It never places the resolved secret in a
`network.http` request, result, event, or receipt. Instead it signs the exact
serialized JSON body with:

```text
HMAC-SHA256(secret, "<idempotency-key>.<json-body>")
```

The request contains:

- `idempotency-key: <stable external delivery identity>`
- `x-kubeclaw-signature: v1=<lowercase hex digest>`

The downstream endpoint must verify both values and deduplicate the
idempotency key. This preserves retry identity without persisting the secret
in the effect journal.

## Scope

This package provides the generic v2 target, payload, confidentiality, and
delivery boundary. It does not yet claim parity with the legacy Discord
presentation layer, which also owns compaction, alert gating, mute behavior,
rate-limit notices, audit evidence, and degraded/restored telemetry. Those
behaviors remain migration requirements for their owning observer and
presentation packages.

## Explicit receiver recovery contract

An optional target `receiptEndpoint` must share the delivery endpoint origin.
The existing `network.http` grant must permit that origin and GET. The sender
performs a fresh authorized confidential GET with `deliveryId` and `payloadDigest`
query parameters. The digest is lowercase SHA-256 of the exact POST JSON bytes.
The GET signature is HMAC-SHA256(secret, `deliveryId.payloadDigest`).

The receiver must return HTTP 200 and JSON with `protocol` exactly
`kubeclaw.operator-delivery.v1`, the matching `deliveryId` and `payloadDigest`,
and `status` either `absent` or `accepted`. Accepted requires a nonempty
`messageId` of at most 512 characters. Accepted recovers the saved receipt without
another POST. Absent permits POST only under this receiver contract: atomically
persist delivery identity, payload digest and result before acknowledging; replay
an equal identity without repeating the external effect; reject changed content;
retain dedup records until explicit coordinated delivery retirement. Concurrent
POSTs and receipt reads must observe that atomic state. Configuring a URL does
not implement this contract in an external receiver.

A missing, invalid or unavailable receipt protocol never authorizes a retry of an
uncertain send. Without a receipt endpoint, a prior reservation or possible-send
failure reports `OPERATOR_DELIVERY_UNRESOLVED:receiver_receipt_required`. It stays
unresolved until real receiver evidence is supplied; HTTP 5xx does not prove that
no remote effect occurred. Locally stored accepted receipts still reconcile.
No external endpoint has been migrated or enabled by this change.

Human message, summary, footer and field values permit tab, LF and CR while other
control bytes and identity-field controls remain rejected. Display shortening
uses an ellipsis inside its length limit. Original canonical event diagnostics
remain in the event journal under the message's event identity.
