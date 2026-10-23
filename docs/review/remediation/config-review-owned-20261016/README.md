# Review-owned decision profiles — 2026-10-16

## Implemented scope
141 original inventory rows (including protocol/generated bindings) now have an explicit central owner at `config/plugins/kubeclaw.review/profiles/standard.config.json`; exact original IDs/pointers are in `field-mapping.json`. Original gate/lean/audit values are unchanged. The separate 87 repository-grade rows remain open.

The canonical Core standard profile explicitly selects `review-policy-selection.v1`. Loader resolves the sole referenced owner relative to the canonical Core author, validates every profile, generates an immutable `review-policy-capture.v1`, and rejects authored captures. Partial captures, malformed siblings and competing stage policy authors are rejected. Core execution, validation and registration all receive the same snapshot. Review and repository-audit resolve the selected complete policy as one source, without built-in merging. Revalidation retains its existing baseline policy semantics; it does not newly resolve decision policy.

Original captures without the feature continue to use the exact original built-in profile reader. Recovery reads the retained snapshot, never a current author. The integration test deletes both current author files before original run A resumes; B changes actual received values without changing A. Actual Review execution dispatches different selected context counts (1/2); actual repository audit observes selected lens restrictions. No external LLM or paid Eval is involved.

## Delivery and verification
- `node --test tests/verification/reliability/nova-review-owned-policy.test.mjs`: 4/4, actual Core receiving/resume A/B, owner validation and image author layout.
- Original Core/compiler/semantic/recovery group: 14/14 (`original-recovery-tests.txt`).
- Actual Review and audit unit suites: `stage-selected-tests.txt`, `audit-selected-tests.txt`.
- Full strict runtime typecheck and Review build passed (empty typecheck log means exit 0).
- Schema generators check the foundation and plugin projections; bundle assembly requires exact schema parity.
- Actual source CLI and built/extracted role-bundle CLI passed (`source-cli-contract.txt`, `packaged-cli-contract.txt`). Bundle content came from the dirty reviewed worktree, not a claim that the prior HEAD already contained this change.
- Both production Dockerfiles copy the same review owner tree alongside Core config. The materialized image-layout loader test passes; no actual Docker build/native run is claimed.
- Independent autoreview, engine Codex: no actionable findings (`review.json`). Complete current source datasets and hashes supplied; reviewer could not execute local shell, so this is source-only independent review, not independent test/native acceptance. No findings accepted/rejected.

No deployment/main merge. Full historical C0–C6/native acceptance remains open. Existing unrelated WIP/evidence preserved.

Full Review package `npm test --prefix skills/nova/plugins/review` including pretest, main suite, coverage and posttest completed with exit 0. No assertions or time limits weakened.
