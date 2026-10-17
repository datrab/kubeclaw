# Pipeline Observability Phase 5.7-B Audit

Status: complete

## Outcome

A small producer-ingress contract now exists beside the admitted
`telemetry_envelope.v1` contract.

It defines producer identity, local sequence, durable acknowledgement, replay,
gap reports, producer closure, and completeness.

## Boundaries

- Producer records do not assign Nova state.
- Producer records do not assign the ClawDeck canonical run cursor.
- Acknowledgement means durable admission, not live Redis delivery.
- Attempt and claim identities remain explicit.
- Duplicate identity with the same content can be acknowledged as a duplicate.
- Conflicting content is rejected by the admission implementation in Phase
  5.7-C.
- Sequence ranges are scoped to one producer boot and one pipeline run.
- RFC 8785 canonical JSON and SHA-256 bind each immutable record and closure.
- A `complete` state cannot contain a gap, missing evidence, or quarantine.

## Proof

- Strict JSON Schema validation rejects unknown fields.
- Relation checks validate full-record digests, closure digests, run sequence
  ranges, and completeness.
- TypeScript and Go validate the same RFC 8785 digest fixture. The fixture
  includes key ordering, HTML-sensitive text, Unicode, and numbers.
- The existing admitted telemetry contract remains unchanged.

## Independent review

The first Terra high-reasoning review found four contract defects. All four
were accepted and fixed:

- `complete` could contain missing evidence.
- sequence closure was not run-scoped.
- the digest covered only the payload.
- the digest algorithm had no Go implementation.

The required focused checks pass. The final Terra high-reasoning review is
clean. No accepted or actionable finding remains.
