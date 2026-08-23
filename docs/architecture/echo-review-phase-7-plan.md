# Echo review Phase 7 plan

Phase 7 makes the declared `gate`, `lean`, and `audit` profiles operational
without changing lifecycle authority. The review plugin creates one immutable,
bounded report per attempt and still returns only canonical `stage-result.v2`.

## Fixed decisions

1. `gate` publishes confirmed blockers only.
2. `lean` publishes the P0 gate plus at most three high-confidence simplification advisories.
3. `audit` remains diff-focused and safety-blocking for confirmed P0 defects; whole-project audit is deferred.
4. Every review item is classified exactly once as blocker, advisory, follow-up, or ignored.
5. Classification and ordering are deterministic and independent of input order.
6. Advisories never enter Nova's repair batch.
7. Follow-ups live in immutable per-attempt reports, not a mutable cross-run database.
8. Report persistence uses the existing artifact store and fails closed.
9. Output limits affect presentation only; total and omitted counts preserve the complete result.
10. Core remains the only lifecycle, retry, and remediation authority.

## Sequential implementation

1. Audit current output paths and ownership.
2. Define and test `review-report.v1`.
3. Implement deterministic classification.
4. Build bounded advisory output.
5. Persist one immutable report per attempt.
6. Activate `gate`, `lean`, and `audit` through the same implementation.
7. Attach the report and bounded evaluation facts to canonical `StageResult`.
8. Add real integration and adversarial tests.
9. Run complete focused verification, Terra/high independent review, document, commit, and push.

## Completion criteria

- all profiles have live behavior;
- every report item has one deterministic disposition;
- advisories and follow-ups cannot start repair;
- confirmed P0 blockers retain authority in every profile;
- report limits cannot hide total counts;
- required report-write failure blocks;
- every bundle-established terminal attempt has an immutable report bound to its revision, policy, and attempt;
- the plugin returns only `stage-result.v2`;
- focused verification and Terra/high review pass;
- documentation is complete and the worktree is clean.
