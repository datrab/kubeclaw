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
failure. A retry uses the same idempotency key. A stored receipt prevents a
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

- `idempotency-key: <effect idempotency key>`
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
