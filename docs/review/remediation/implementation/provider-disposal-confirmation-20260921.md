# Provider disposal confirmation — 2026-09-21

Status as of 2026-09-24: bounded local positive tests and semantic controls passed; [fresh independent final review](../../evidence/independent-cleanup-scheduler-final-20260924/review.md) accepted this bounded local scope. See the [current verification checkpoint](buster-cleanup-scheduler-verification-20260924.md). No whole original finding, CONFIG or live closure is claimed.

## Historical integration and verification checkpoints

The following records earlier implementation/review steps. Statements that checks were pending or failed describe those checkpoints; the linked current verification report records the subsequent runs.


A provider session now confirms disposal only after actual process close and successful capability drain. A signal diagnostic can remain an error even after these facts are confirmed. The loader adopts each replacement as its current owned session before initialization; a close or drain timeout cannot authorize another replacement. Confirmed session resources are accounted once, including overlapping terminate calls. Cleanup and subsequent stop errors retain both causes and diagnostic text in the public failure path.

The [preimplementation criteria](../../evidence/provider-disposal-confirmation-20260921/criteria-before-code.md), [V1 review](../../evidence/provider-disposal-confirmation-20260921/root-source-review-v1.json), [V2 review](../../evidence/provider-disposal-confirmation-20260921/root-source-review-v2.json), [V3 review](../../evidence/provider-disposal-confirmation-20260921/root-source-review-v3.json) and [integration](../../evidence/provider-disposal-confirmation-20260921/integration-result.json) preserve the rejected intermediate designs and exact accepted sources. The [behavioral reference](../../../architecture/buster-fixture-cleanup.md) also states snapshot deletion and remaining historical boundaries.

The maintained cleanup command now includes both new Loader modules. Their eleven cases cover confirmed replacement, combined errors, overlapping accounting and refusal after current/replacement close or drain failure. Five Runner cases correct the earlier wrong summary and replacement assumptions while retaining actual error IPC, retry blocking, completed-fixture authority and later successful retention requirements. Original ownership assertions remain, with additive confirmation checks. Test fault injection models precise local boundaries; no actual cluster or kernel permission failure is claimed.

Next required evidence: all four affected type projects, complete canonical affected lint, maintained cleanup and scheduler commands, the full affected original suites and semantic controls against the intended behavioral assertions. All those runtime claims remain pending for this integrated V3 stand. No deadline, lint rule or original assertion was weakened.
