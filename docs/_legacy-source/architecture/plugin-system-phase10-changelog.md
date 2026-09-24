# Phase 10 Changelog

## Core delivery

- Added durable `observer-deliveries.jsonl` attempt records.
- Added stable delivery and effect identities across retries and restarts.
- Added event identity and per-run ordering validation.
- Added checkpoint owner, package-version, digest, event, subscription,
  monotonicity, and conflict validation.
- Added atomic checkpoint progression.
- Added deterministic restart attempt continuation and redelivery.
- Isolated best-effort failures by run so one failed run does not block other
  runs while preserving order inside the failed run.
- Added required-audit fail-closed behavior.
- Kept observer leases, cancellation, timeouts, grants, and revocation
  registration-specific.

## Observer packages

- Hardened telemetry and agent-observability projections against secret-bearing
  keys and oversized payloads.
- Removed delivery-attempt values from persisted sink payloads so retried
  effects remain byte-identical.
- Rewrote lifecycle notifications as deterministic severity/title/summary
  projections with suppression and compaction policy.
- Kept preview delivery metadata-only.
- Added the separately granted `audit` observer with required failure policy
  and immutable redacted audit artifacts.
- Expanded the operator transport's closed payload contract only for the new
  presentation fields; credentials and network remain adapter-owned.

## Proof and operations

- Added the TypeScript Phase 10 contract gate.
- Added paired implementation decisions and package-local replacement
  scenarios to the migration ledger.
- Added operator and author documentation for delivery guarantees,
  checkpoints, idempotency, failure modes, and required-audit policy.
- Retained legacy v1 callback paths only as recorded Phase 12 deletion targets;
  they are not v2 delivery authority.

