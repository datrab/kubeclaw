# Pipeline Observability Phase 5.7-F Audit

Status: complete

## Outcome

The shared foundation now produces one ClawDeck observation view.

The view contains:

- Raw admitted records with their durable cursor.
- Normalized attempt results.
- Evidence identities and storage references.
- Producer closure identities.
- Missing ranges and unresolved items.
- One explicit completeness state.

Live mode reads the tail of the same durable record. It is not a separate
history. ClawDeck does not schedule work and does not make gate decisions.

## Proof

The focused proof covers duplicate delivery, out-of-order arrival, clock skew,
cursor replay, missing ranges, quarantine, and live-tail recovery. Phase C,
Phase D, and Phase E proofs cover storage pressure, worker restart, collector
restart, Nova restart, and 20 concurrent worker results.

This implements the pipeline side of Decisions D-106 and D-107.
