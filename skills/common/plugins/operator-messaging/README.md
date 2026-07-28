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
