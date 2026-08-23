# Pipeline Observability Contract v1

This package defines producer delivery before canonical ClawDeck admission.

It does not replace `telemetry_envelope.v1`. A producer record preserves local
order and retry identity. Admission assigns the canonical run cursor later.

The contract is language-neutral. TypeScript and Go use RFC 8785 JSON
Canonicalization Scheme bytes and SHA-256. A producer record digest covers all
immutable record fields except `recordDigest`. A closure digest covers all
closure fields except `closureDigest`.

Every wire message uses its RFC 8785 canonical JSON bytes. Strict TypeScript
and Go decode functions reject unknown fields, noncanonical number spellings,
invalid Unicode, and noncanonical member order.

Sequence values start at one for each producer boot and pipeline run. Replay,
gap, acknowledgement, and closure records identify that pipeline run. A
producer can therefore interleave several runs without mixing their order.

Each closure has a stable `closureId`. Completeness partitions all required
closure IDs into admitted or missing IDs. `complete` is valid only when every
required producer closure exists and no
unresolved range, required evidence item, or quarantined record remains.
