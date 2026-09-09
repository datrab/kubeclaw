# WP09 operator delivery and notification projection

## Findings and implemented boundary

PCR-NOTIFY-001 is corrected in the original observer-to-operator path. Multiline
summary text and tabs are accepted in human-readable message fields; identity
and label controls remain rejected or normalized. Ellipses count within the
limit, including reason codes at 256/257 characters and combined role/stage
titles. Discord display truncation now marks shortened text. Full canonical
diagnostics stay in the original event journal; this does not replace Clawdeck
collection or introduce another log store. Platform secrets remain protected.

PCR-OPERATOR-001 is corrected for the explicitly supported operator provider at
the core/sink boundary, but remains **partial for the intended deployment**:
no intended external receiver has been shown to implement the recovery protocol.
Other observer telemetry/transport providers keep their previous retry semantics
until their own stable delivery/reconciliation contracts are implemented.

The original defect combined three identities: the observer reused one execution
attempt and key, the core replayed its failed receipt, and a sink/network receipt
could remain cached even if only the outer attempt changed. An optional
`effectRequest.deliveryId` now carries stable external identity independently of
the execution `idempotencyKey` and attempt. It is preserved into durable and
confidential invocation requests and included in identity/conflict validation.
When absent, legacy effect IDs and child keys remain byte-for-byte unchanged.

Only `operator.request` resolved to `kubeclaw.operator-messaging` receives fresh
observer execution attempts and durable keys. Each still carries the original
stable delivery ID. Its child network keys bind parent execution ownership so a
failed POST receipt cannot silently answer the next attempt. Core failure
receipts stay immutable, and durable observer history retains consumed retry
budget across reconstruction. Sink receipt lookup reconciles locally completed
deliveries without another send.

## Actual receiver contract and uncertainty

There was no matching operator receipt endpoint contract found in repository
charts, skills or contracts. Existing senders supply an idempotency header, which
alone is not proof of receiver deduplication. The new optional `receiptEndpoint`
therefore selects an explicit `kubeclaw.operator-delivery.v1` protocol documented
in the operator README. It is constrained to the same configured origin and uses
a fresh authorized, signed GET. It must echo the exact delivery ID and payload
digest, and report either absent or an accepted message ID. Accepted reconciles;
absent authorizes POST only under the receiver's atomic durable dedup contract.
An unsupported response cannot authorize even the first POST.

No external endpoint is enabled automatically. A target without that protocol
may make its initial send, but a previous uncertain reservation/failure prevents
another send and returns `OPERATOR_DELIVERY_UNRESOLVED:receiver_receipt_required`.
HTTP 5xx is conservatively treated as possibly executed. This satisfies D08's
integrity boundary instead of interpreting a configuration flag or lost ACK as
proof of safe replay. Intended receiver implementation, verification and operator
handling of unresolved delivery remain deployment prerequisites; no external
messages or deployment were performed.

## Evidence on the frozen source

- `node --test tests/verification/reliability/operator-delivery.test.mts`: five
  cases passed, none skipped. They run the actual registry, notification observer,
  AdapterRuntime, effect journal/locks, secret resolver, network adapter and
  operator sink against a real localhost HTTP receiver with a fsynced file ledger.
  The receiver validates HMAC and implements dedup/receipt behavior; no adapter or
  network outcome is replaced by a mock in these regressions.
- Transient HTTP503 then full adapter/observer reconstruction: second real POST,
  one stable external identity, distinct durable effect IDs/attempts and checkpoint.
- Lost ACK after receiver ledger commit: original receipt GET recovers, one POST
  and one external delivery. Permanent HTTP503: five sends then exhaustion after
  reconstruction. Unknown receiver: one POST, explicit unresolved outcome, no
  blind resend. Invalid receipt contract: zero POSTs.
- Original notification live-function test delivers multiline summary, exact
  256/257-character reasons, maximum role/stage/model/pipeline labels, a marked
  oversized summary and a following event through the original operator/network
  path. All checkpoints advance. Original unit/parity/package-boundary tests pass.
- Both plugins' original test commands and TypeScript builds pass. Existing
  operator direct-test retry expectation was changed from unsafe blind resend to
  explicit unresolved; cancellation accepts the current core resource-wait
  cancellation code. Those older direct dependency substitutes are not counted
  as the new real HTTP evidence.
- Canonical ESLint passed all changed source/test files with no suppression or
  rule changes. Nova TypeScript check passed.
- Existing effect-journal ownership, effect-lock lifetime and observer recovery
  regressions: eight tests passed, none skipped.
- Negative control: a read-only Node source hook loaded only the original
  `observer-delivery.ts` from commit `2f265ae` while retaining the new regression
  and actual receiver. The transient-restart case failed with delivered=0 and
  the original cached HTTP503 effect receipt, instead of the required checkpoint.
  This is a targeted negative control, not a claim that the whole old revision
  supports the new optional receiver configuration.

## Review scope

Shared contracts: effectRequest schema plus generated SDK contracts. Core:
`effects/{contracts,identity,durable-invocation,coordinator}.ts`,
`execution/{adapters,adapter-startup}.ts`, `telemetry/observer-delivery.ts`.
Operator: README, config schema, source adapter/config/payload, new
`delivery-records.ts` and `receiver.ts`, original live-function test.
Notification: README, observer source, live-function and parity tests.
Regression: `tests/verification/reliability/operator-delivery.test.mts`.
No repair budget, lifecycle, Redis, transport/telemetry sink, CI or deployment
source was changed for this pair.
