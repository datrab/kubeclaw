# Runner settlement before fixture cleanup — 2026-09-21

Status: four independently source-reviewed V2 files integrated; runtime, canonical type/lint, original-suite reruns and semantic controls pending. No whole Buster finding, durable ownership or CONFIG closure is claimed.

Previously a rejected Promise.race moved directly into fixture cleanup while peer nodes could still run. A peer fixture finishing later was not registered for cleanup. A cleanup rejection in finally could also replace the primary execution failure.

The scheduler now stops starting pending nodes after observing an exception, settles its already-started tasks, registers late successful fixtures and then cleans fixtures. It preserves single-error identity and aggregates distinct execution/cleanup failures. Existing per-node deadlines, concurrency, dependencies, retries and cancellation policies are unchanged.

[Required cases](../../evidence/runner-scheduler-drain-20260921/criteria-before-code.md) and the [independent clarifications](../../evidence/runner-scheduler-drain-20260921/criteria-addendum-before-code.md) preceded implementation. [Source review](../../evidence/runner-scheduler-drain-20260921/independent-draft-source-review.json), [test V2 review](../../evidence/runner-scheduler-drain-20260921/independent-tests-source-review-v2.json), and [integration identities](../../evidence/runner-scheduler-drain-20260921/integration-result.json) bind this change. V1 and its corrected missing-barrier-release finding remain retained.

Five direct scheduler cases cover settlement, late retention, multiple failures, a synchronous reservation failure and cleanup-only identity. The actual Runner regression uses normal package discovery, loader and real provider children; an injected third repository-copy failure must reject the real executeNode path while its peer remains running. These tests have not yet been executed at this checkpoint. The [behavioral reference](../../../architecture/buster-runner-failure-drain.md) describes usage and boundaries.

Required next evidence: types and canonical affected lint, all new cases, full original Runner/real-provider modules, an old-scheduler semantic control that fails at the intended ordering oracle, documentation review and exact source binding. No omitted original deadlines or assertions may be used to obtain a pass.
