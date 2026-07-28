# Plugin system contract v2

This directory is the canonical machine-readable contract for the target plugin runtime. `plugin-system-v2.schema.json` uses JSON Schema 2020-12. Its `$defs` are the authoritative contracts for:

- manifests and stage, observer, and adapter registrations
- configured stages, attempts, results, effects, receipts, waits, signals, and artifacts
- package and registration provenance
- capability grants, invocation leases, and bounded plugin contexts
- canonical lifecycle events and namespaced plugin-domain events
- observer deliveries and replay checkpoints
- adapter lifecycle/readiness and fenced resource locks
- append-only plugin-state entries

Rules:

- All protocol objects are closed; unknown fields fail validation.
- `pipeline-plugin-v2` is the only accepted manifest API version.
- Plugin and stage types are open-ended, globally namespaced identifiers.
- Registration capabilities are required, independently authorized, and never inherited from sibling registrations.
- Manifests contain inert paths and metadata only. Provenance, trust, canonical paths, and package digests are computed by core.
- Artifact references are logical immutable identities. They never expose host filesystem paths.
- Effect and wait identities are core-issued. Plugins cannot commit lifecycle transitions or claim effect completion.
- Result variants are discriminated by `outcome`; fields from another variant fail validation.
- Invocation contexts are backed by expiring, permanently revocable leases and explicit resource limits.
- Core lifecycle events use a closed vocabulary; plugin events must use the producing plugin's namespace.
- Observer delivery is at-least-once and checkpoints are journal-sequence based.
- Adapter locks carry monotonically increasing fencing tokens over canonical resource identities.
- Plugin state is append-only, registration-owned, digest-pinned through provenance, and idempotency-keyed.
- `needs_nova`, `action_required`, package-level `capabilities`, kinds, hook families, and fixed built-in stage identifiers are not part of this contract.

Cross-record invariants such as unique registration IDs, package/registration identity consistency, plugin-event namespace ownership, unique stage-type ownership, graph acyclicity, remediation-target existence, attempt timestamp ordering, capability completeness, lease expiry/revocation enforcement, signal authorization, digest availability, monotonic journal/checkpoint sequences, fencing-token progression, and effect receipt matching require registry or state-aware validation in addition to JSON Schema.
