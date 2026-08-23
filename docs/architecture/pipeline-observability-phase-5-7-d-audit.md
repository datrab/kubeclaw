# Pipeline Observability Phase 5.7-D Audit

Status: complete

## Outcome

The shared foundation now stores attempt results, evidence, and producer
closures outside the worker Pod.

## Guarantees

- Evidence uses content-addressed files and verified SHA-256 digests.
- Evidence metadata and attempt results use durable atomic state writes.
- A result is accepted only after all referenced evidence is present and
  verified.
- The same attempt generation is idempotent.
- A conflicting result for the same generation is rejected.
- An older claim generation cannot replace a newer result.
- A producer closure is accepted only when its complete record sequence and
  required evidence are present.
- Completeness reports identify the producer for each missing closure.
- Bounded object, byte, result, closure, and metadata limits fail explicitly.
- Temporary and unreferenced crash artifacts are removed under the store lock.
- A new store instance can read the result and evidence after worker loss.
- The live Buster test-plan runner persists evidence, the terminal worker
  result, one admitted completion record, and its closure before it returns.
- Closure evidence uses an attempt, claim-generation, and evidence identity.
- Completeness also matches the required producer identity.
- Completeness reads each required evidence object again. Missing or changed
  bytes make the evidence state partial.
- Provider outputs point to the durable evidence object, not to a temporary
  provider workspace.
- A stale completion cannot be admitted after a newer claim result exists.
- Once an attempt closure is durable, the store rejects a later claim
  generation for that same attempt. The two possible race orders are fenced.
- The result becomes durable only after the worker runtime accepts that exact
  terminal result.
- The durable observability root cannot be inside the provider-writable
  workspace. Store paths and parent paths cannot be symbolic links.
- Durable results record their test-plan and node owner. Recovery for one plan
  cannot claim results from another plan in the same pipeline run.
- Result publication uses a two-step durable commit marker. The lease time is
  recorded only after the result is already durable.

## Architecture audit

Buster stores attempt facts. It does not make a pipeline decision. Nova can
read the durable result after a restart. Large evidence stays outside Nova.
The store keeps the identities required by Decisions D-106 and D-107.

The focused proof covers restart recovery, evidence verification, closure
completeness, idempotency, stale claims, conflicting results, and the live
Buster completion path.

Terra review found and drove fixes for the live wiring, scoped identities,
crash-recoverable completion intent, late records, bounded evidence reads, and
cross-run closure handling. The remaining symlink-root comment did not apply:
the runner stores the canonical root before it checks containment.
