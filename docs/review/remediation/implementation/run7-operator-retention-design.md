# Operator delivery duplicate request retention: design and genuine prerequisite

Status: DESIGN / NO PRODUCTION PROJECTION IMPLEMENTED. PCR-OBS-002 remains open.
Base: remote `1d7e6f8834b6e3f3f477a5af48832f74f5321757`, exact tree
`d02787ad9732aa20139cf575dafd6fdf7bd65252`. This bounded proposal does not close
the original growth/backpressure finding or any native provider gate.

## Executed prerequisite, not a projection acceptance test

`tests/verification/reliability/operator-retention-authority-fixture.test.mjs`
runs only installed original human-approval, wait-store, operator-messaging,
network-http and secret-resolver producers through original Nova Core. A real
loopback HTTP receiver accepts exactly one signed POST. Actual File journals
record the first waiting attempt, delivery receipt and original wait. A wrong
issuer is rejected without writing the signal journal; a trusted local caller
then submits the exact issuer-authorized original resume signal. Core completes
a DIFFERENT approved attempt and succeeds without another POST.

This is NOT proof of authenticated external operator ingress: resumePipelineV2
has no authentication callback. Original Core checks the claimed issuer against
the persisted wait, signal schema/type/time and single-use rules. No external
service, paid model, fake adapter, synthetic journal, mocked filesystem or native
provider substitution is involved. Generic JSON receipt fields are those the
original adapter actually produced, not invented Discord receipt fields.

Actual producer nuance: this run does not emit a separate `wait.created` event.
The original `recoverWaitCreation` reducer returns the first committed
`attempt.completed` carrying the wait. The fixture checks that owning record,
the real subsequent `wait.resolved` and later approved completion. An initial
assertion demanding a nonexistent `wait.created` failed and was corrected by
using the owning original API, not inserting an event or changing production.

The existing delivery store retains two records and about 10 KB in this fixture.
The test proves exact duplicate `reserveDelivery` returns its original receipt,
changed payload still conflicts, and legacy `lookupDelivery` remains refused.
No bytes are retired and no quota improvement is claimed by this test.

## Proposed narrow format and owning consumer changes (not implemented)

Only `notification-delivery-request.v1` produced by the original JSON-target
human-approval stage, with one fully proven terminal receipt and a resolved,
approved, terminal Core run, is initially eligible. Explicit deliveryId/v2,
Discord transformations, confidential/unverifiable requests, waiting/active or
uncertain histories, and incomplete/multiple/mismatched receipts stay refused.

Proposed `notification-delivery-request-projected.v1` retains the original
request record's full canonical payloadDigest, external delivery identity,
target, selected terminal record key/digest, exact owning effect/attempt IDs,
and a bounded manual retirement receipt (operation/actor, canonical run identity,
snapshot and journal head, authority digest). It removes only the duplicated
payload object from the request record. Original Core effect request/result,
all delivery receipts, wait-store value, signal journal and Core history remain.
Projection is not a tombstone, log deletion, record-count release, or new delivery
authority. Do not copy summary, endpoint secrets, HMAC or transport body into the
new audit receipt. Exact schema is pending original consumer implementation review.

Keep original `reserveDelivery` append-before-return behavior for full legacy
records. Its projected-record branch must construct the ORIGINAL v1 candidate
from the actual supplied original request + transport payload, compute using
the ORIGINAL RecordStore payloadDigest codec, and require equality with the
retained original digest before returning the still-present exact receipt.
It must not append/reinflate the full payload or call any receiver lookup/POST.
`deliveryReceipt` must apply the same original candidate check for projected
v1 replay; current legacy-v1 receipt lookup deliberately lacks that body check.
`lookupDelivery` must continue refusing v1, including projected v1. Do not invent
owner authority or upgrade v1 into v2 handoff lookup semantics.

The original canonical object digest is NOT SHA256(JSON.stringify(payload)) and
is NOT the HTTP HMAC's exact wire-byte digest. Sorted object storage cannot prove
the original insertion-order serialization by itself. The existing original
effect/network request evidence remains the retained wire evidence; no new
claim about reconstructing original byte order from canonical storage is made.

## Exact causal authority required before mutation

1. Under the original Core run mutation fence, validate canonical runRoot,
   snapshot, current pinned graph/packages/adapter registration, terminal run
   and original bounded journal evidence. A matching caller runId is insufficient.
   Resolve original configured operator deliveryRoot and wait-store root from
   the pinned runtime, not arbitrary caller stores. Reject equal/nested/aliased
   actual store roots before acquiring store locks.
2. Select the canonical original top-level `operator.request` request, exact
   requested/accepted pair and completed receipt, with original schema validators,
   effect identity and matching attempt/run/stage/adapter. Verify ordered Core
   effect audit lies inside the original created/dispatched/completed first attempt.
   Bind original stage owner human-approval, target, full input/config-produced
   payload, signal type/issuer/expiry and original approvalId. No suffix-only or
   summary-only ownership inference, shadow schema or synthesized fields.
3. Reconstruct exact request record key `delivery:request:sha256(idempotencyKey)`
   in `notifications/<target>` and the ORIGINAL v1 candidate/digest. Legacy v1
   has no stored owner. Require exactly one matching terminal receipt key
   `delivery:attempt-<attemptNumber>-<sha256(attemptId)[0:16]>:<sha256(deliveryId)>`,
   full attempt equality and exact completed effect result equality. Inspect all
   same-delivery reservations/failures/receipts; uncertain or conflicting history
   cannot be hidden by original `completed()` first-match behavior.
4. Bind canonical original `signal.wait` request/accepted/completed chain from
   the same first attempt, waitId `wait:sha256(original wait idempotencyKey)`,
   original `wait-value.v1` in `waits/all`, full original wait receipt, first
   attempt's wait result and original `recoverWaitCreation` record. approvalId
   is not waitId. Never demand or fabricate a `wait-created` event.
5. Require one original valid single-use signal, outer issuer equal inner
   guidance issuer and configured authorized issuer, decision approved, exact
   wait/type/time, matching subsequent original `wait.resolved` signal/causation,
   and the original next attempt's approved passed completion followed by the
   terminal run. Merely receiving the notification while still waiting is not
   an eligible consumer checkpoint. This is trusted-state causal validation,
   not cryptographic authentication of coordinated rewrites of all trusted files.
   Historical timing compares the persisted issuance/creation/resolution times,
   not today's clock against an already resolved wait's expiry. Do not blindly
   reuse validateSignal if its current-time check would reject legitimate old
   completed history. Generic recovered stage state does not itself revalidate
   issuer/type/time; the selected canonical signal binding above is mandatory.

## Locking, atomicity and replay lifetime proposal

Lock order: original run mutation fence → original wait RecordStore fenced read
→ original delivery RecordStore atomic transition. Original bounded reads and
clone ownership are mandatory; never call a same-store read/transition from
inside its held fence. Read-only preflight computes full evidence and retained
receipt snapshots while fenced. Final delivery authorization must inspect the
actual locked delivery state, revalidate the selected receipt/all same-delivery
records and current candidate digest synchronously, and recheck current Core
head/snapshot before CAS write. Current transition authorize() exposes no state;
an original narrowly scoped callback state view or original owning atomic API
may be necessary. No asynchronous callback or reentrant read workaround.

Run fencing does not fence external delivery/wait stores by itself. The wait
read fence remains held until delivery transition finishes. `completeDelivery`
has a conflict fallback: tests must prove a stale completion cannot replace a
retained receipt or reauthorize projected replay. Existing original kernel
locks/serial API must be used; no new nominal mutex or stale-heartbeat claim.

All new projection/manual-receipt overhead counts in the exact serialized store
byte quota. Before write enforce record size, total bytes and positive net
savings; insufficient quota/savings fails atomically with unchanged source,
receipt, journal and no network side effects. Keep original count quota, replay
lifetime and receipt bytes unchanged. A small request that cannot pay its
projection overhead is ineligible, not a reason to loosen configured limits.

## Required implementation negatives / races before any approval

- Wrong canonical Core root with same textual runId; wrong stage, attempt number,
  effect, original payload, target, source wait-store or pinned adapter root.
- Canonical-invalid honestly rehashed selected request/accepted/receipt/signal;
  orphan or reordered effects, wrong wait/issuer/type/expiry, inner issuer mismatch,
  missing/duplicate signal, unapproved next attempt or still-waiting Core.
- Missing/corrupt/oversized original evidence; unsupported externalized result
  without exact bounded digest-checked owning reader; v2/confidential/format refusal.
- Absent/multiple/mismatched/incomplete receipt, any uncertain same-delivery
  reservation or failure; legacy lookup remains blocked before and after projection.
- True separate-store/process writer exclusion in run → wait → delivery order,
  alias/nested roots rejected before locks, stale CAS, changed receipt after
  preflight, real SIGKILL release and failure cleanup; stale original completion
  interleaving must not undo retained receipt authority.
- Exact original replay after projection has no second POST and no reinflation;
  changed replay payload rejects; repeated retirement is idempotent. Real small
  byte quota admits later genuine notification only by measured NET savings,
  while record-count exhaustion still refuses. All authority bytes remain.

Next action: independently reproduce this original fixture and audit this design;
obtain root authorization for the original owning consumer/atomic-state API slice.
No implementation, retirement execution, register closure, deployment or CI run
is authorized or represented by this checkpoint alone.
