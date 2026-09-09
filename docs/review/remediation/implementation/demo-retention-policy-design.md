# D06 configured retention and explicit extension — proposed boundary

Initial controller duration implemented; explicit extension remains design only.
Existing default Ready controller is committed at e03f7dc. Retention begins at product Ready, not provisioning or acceptance.

## Existing authority inspected

`human-approval/src/stage.ts` creates a signal wait for a configured operator
issuer. Core `engine-snapshots.ts:validateSignal` checks declared issuer, wait,
type and time; `engine-run.ts` journals the signal. Neither authenticates a human.
Both current Core/project CLIs accept a caller-supplied signal JSON file. An
issuer-looking string or successful human-approval stage is therefore insufficient
independent evidence that a person requested a lease extension.

Administrative reopening has the correct separation: `engine.ts` defines a
trusted host `AdministrativeDecisionAuthenticator`; `engine-admin.ts` compares its
returned principal with the decision actor and configured issuer allowlist, then
journals the immutable decision. Its actual operations are retry/remediation/
cancel for blocked stages. It is not an existing retention authorizer, and no
production authenticated operator ingress supplying an extension decision was
found. Reusing its actor field or returning that field from a callback would be
fabricated authorization. TokenReview authenticates the Nova runtime SA only.

## First implementable part: configured initial duration

Coordinate with the demo compiler/producer owner: optional
`project.demo.retentionSeconds`, normalized default 604800, must enter the same
source contract/candidate digest as the auth protocol and delivered source.
The trusted producer obtains it from that approved contract, never from retry
guidance or a caller-owned request override.

Implemented minimal wire amendment: optional `retentionSeconds` in the existing
Ready request, default 604800 when absent. Persist the selected initial duration
in `status.demoReadiness` and return it with the committed response. Historical
`demo-readiness.v1` records without the field retain their original seven-day
meaning. New writes use `demo-readiness.v2` and require the stored field, so a
pruned new default cannot masquerade as legacy on retry.
Exact request-byte binding remains unchanged; changed duration on replay rejects.
The controller computes expiresAt from server readyAt plus this duration, and
all namespace/exposure lifecycle checks use that same stored deadline.

Accept only positive whole seconds that fit Go's duration arithmetic; do not
silently clamp a project choice. No additional operational maximum is specified
by D06. Any desired operator-controlled cap should be an explicit policy decision,
not an invented default or reuse of the pre-Ready 24-hour provisioning cap.

Implemented controller paths: demo-readiness.go, demo-readiness-lifecycle.go, its original
HTTP tests, CRD status schema and existing controller contract note. Producer
owner coordinates project schema/normalized digest, candidate, exact request
serialization and response validation before enabling a nondefault duration.

## Extension boundary: actual human authorization is still required

A separate explicit extension decision must bind decision/idempotency identity,
authenticated operator principal, nonempty reason, actual run/source/lease UID,
the original Ready request digest, current retention revision/current expiresAt,
and the exact requested later expiresAt. It must be durably recorded only after
host authentication and issuer authorization, preserving the original decision
on replay. The immutable readyAt never changes.

The controller would accept extension only after independent verification of
that authenticated decision, plus its existing trusted producer and live source
checks. CAS compares the current retention revision/deadline and increments once.
Concurrent different extensions conflict. Identical replay returns the recorded
result without adding time. Expired/deleting/changed-source leases reject; no
resurrection, retry renewal, log retention change or manual-cleanup restriction.

The missing implementable integration point is a genuine operator ingress/host
authenticator and a verifiable, durable projection of its domain-specific
extension decision into the controller. Existing generic signals and runtime SA
are not substitutes. Do not expose an extension writer that accepts merely
`actor`, `approved:true`, an artifact digest or the runtime token. Actual
authenticated channel/issuer mapping must be selected and tested before that
writer can truthfully satisfy D06. No new Clawdeck acknowledgement is proposed.

The Nova producer owner confirms its separate work normalizes the project field,
binds it in compiler stage input and the immutable candidate, serializes it in the
exact request body, and validates the selected duration in the response. Those
producer tests are still in progress. This controller follow-up does not itself establish
that compiler integration or a human extension-authorizer path. No operational
maximum was introduced; the technical upper bound is 9223372036 whole seconds.
