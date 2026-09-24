# Echo review Phase 8 plan

Phase 8 adds a deterministic scope and repair-cycle governor. It prevents an
Echo-to-Nova repair loop from expanding beyond its certified starting scope
without moving lifecycle authority out of core.

## Fixed decisions

1. Core certifies attempt and remediation-cycle state; Echo and Nova cannot supply or change it.
2. The first completed review attempt freezes the governor baseline.
3. Retries do not consume repair cycles.
4. At most two repair cycles are allowed by the review governor by default.
5. File and non-test LOC growth use both relative limits and small absolute allowances.
6. Ownership crossing, scope growth, or cycle exhaustion requires orchestration.
7. Invalid or missing governor state after remediation blocks safely.
8. Ranking and report limits cannot change governor authority.
9. Core remains the only lifecycle and remediation scheduler; the review plugin returns canonical `stage-result.v2`.

## Sequential implementation

1. Audit existing lifecycle, artifact, scope, and ownership authority.
2. Define and certify the immutable governor snapshot.
3. Add closed policy controls and profile defaults.
4. Supply certified lifecycle state and prior immutable artifacts from core.
5. Measure file, non-test LOC, and ownership growth deterministically.
6. Classify review work as `in_scope_blocker`, `follow_up`, or `scope_break`.
7. Apply bounded governor decisions without weakening blocker authority.
8. Persist governor state in the immutable report and expose bounded evaluation facts.
9. Add real integration and adversarial tests, run complete verification and Terra/high review, document, commit, and push.

## Completion criteria

- remediation-cycle state comes only from core;
- the baseline survives repair attempts through immutable reports;
- retries cannot advance the repair-cycle count;
- growth and ownership checks are deterministic and input-order independent;
- every repairable finding has one governor classification;
- overflow requests orchestration rather than silently passing or starting another repair;
- malformed governor state blocks safely;
- reports contain complete governor counts and decisions;
- the plugin returns only `stage-result.v2`;
- focused verification and Terra/high review pass;
- documentation is complete and the worktree is clean.
