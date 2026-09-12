# Historical branch acceptance harnesses

These 15 files preserve independent acceptance and reproduction harnesses from the branch cleanup of 2026-09-12. Their original branches, paths and blob IDs are recorded in `docs/review/branch-cleanup-20260912/historical-test-imports.json`. The consolidation commit also preserves the exact original source commits.

These are explicitly invoked historical checks, outside the default current reliability glob. Some reproduce historical failures; a passing current product does not imply that every historical reproducer should pass. Original assertions and prerequisites remain mandatory. Relative child paths were adjusted for this directory.

Run selected harnesses against the immutable candidate and historical evidence they request. Several require absolute `KUBECLAW_REVIEW_SOURCE_ROOT`, `KUBECLAW_REVIEW_BASELINE_ROOT` and/or `KUBECLAW_REVIEW_V2_PROOF_ROOT`. The semantic producer accepts `KUBECLAW_SEMANTIC_PRODUCER_MODE`. Read the selected test before execution. Do not substitute generated evidence for missing historical originals.

`npm run test:historical-branch-acceptance` invokes the complete historical group when all prerequisites are supplied. This group was syntax-checked but not executed during consolidation. See the cleanup validation record for the current Delivery v3 and semantic checks that were executed successfully. Open native/live acceptance remains open after branch deletion.
