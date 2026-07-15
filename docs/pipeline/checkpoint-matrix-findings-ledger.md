# Checkpoint Matrix Findings Ledger

Source report: `.swarm/real-e2e/failure-matrix-reports/2026-07-12T22-35-50-827Z-full.md`

Generated from the full checkpoint-matrix launch that requested all 64 scenarios:

- Requested scenarios: 64
- Completed scenarios: 64
- Passed scenarios: 12
- Failed scenarios: 52
- Skipped scenarios: 0
- Checkpoint mode: reuse
- Concrete finding entries: 84

This ledger classifies the 84 concrete report entries by likely root cause. It is intentionally an audit ledger, not a fix plan. A finding marked as a likely test/checkpoint mismatch still needs source inspection before deletion or rewrite.

## Summary

- 66 contract failures
- 5 cleanup failures
- 13 harness failures

Working classification:

- 18 checkpoint retry fixture / assertion mismatches
- 14 terminal contract vocabulary mismatches
- 13 harness setup / reporting failures
- 12 final-Buster fault injection mismatches
- 11 infra fault contract mismatches
- 5 cleanup authority / verification failures
- 4 checkpoint runtime-config contamination findings
- 4 uncategorized findings requiring inspection
- 2 scenario expectation mismatches affecting grouped scenario sets
- 1 multi-module scenario model mismatch

High-level judgment: most findings look like checkpoint/scenario/harness mismatches rather than product pipeline bugs. The product cannot be cleared from this ledger yet because some categories may hide real behavior gaps, especially retry, fault-injection, crash/resume, and multi-module scenarios.

## Resolution Pass 1: Findings 1-20

Status: fixed in scenario/checkpoint contracts.

- Finding 1: confirmed as a test assumption issue. Canonical product behavior is `terminal_status=blocked` with `failure_class=infra_error` for delivery-lint infrastructure failures.
- Finding 2: retained delivery-lint read-model authority and focused tests. The scenario must assert `blocked_phase=delivery_lint`, failed delivery-lint validation, and the missing Dockerfile marker.
- Findings 3-19: fixed as retry/checkpoint contract issues. Retry scenarios now use hook points that can actually produce their required evidence, approval is automated for retry scenarios that must pass through the operator gate, and retry lifecycle evidence accepts a checkpoint boundary only for the attempt-1 start event that the checkpoint intentionally skips.
- Finding 20: retained the policy-derived `needs_nova` contract. The scenario remains a Nova handoff policy check, separate from max-fail `blocked/test_failure` exhaustion.

## Root Buckets

### B1. Checkpoint Retry Fixture / Assertion Mismatch

Finding IDs: 3-19, 23

Affected scenarios:

- `retry-budget-exhausted`
- `retry-fix-malformed-output`
- `retry-buster-pass-echo-rejects`
- `retry-stale-forge-output`
- `retry-reuses-previous-success-artifact`
- `forge-malformed-output`

Reasons observed:

- `REAL_E2E_RETRY_FIX_CYCLE_EVIDENCE_FAILED`
- `REAL_E2E_MALFORMED_OUTPUT_RAW_PAYLOAD_MISMATCH`
- `REAL_E2E_MALFORMED_OUTPUT_TERMINAL_REJECTION_MISMATCH`
- `REAL_E2E_MALFORMED_OUTPUT_DOWNSTREAM_SUCCESS_OBSERVED`
- terminal contract mismatches inside retry scenarios

Likely root cause:

The retry scenarios appear coupled to old full-run lifecycle order and stale checkpoint identity. Several checks expect attempt-1 lifecycle/task-stream events using the outer seed/workspace id while the restored checkpoint carries a production `run-...` pipeline id. Some malformed-output payload hashes also suggest the scenario fixture is not injecting exactly the payload the assertion expects.

Canonical proposal:

- Define one retry hook point contract per retry scenario.
- Checkpoints must restore the exact module/gate attempt state needed by that scenario.
- Fault injection should be owned by the scenario fixture and recorded as a typed event/artifact.
- Retry evidence assertions should read canonical completion/retry events, not infer from stale stream ordering.
- Merge overlapping retry scenarios into one recovery-chain scenario when they prove the same behavior.

### B2. Terminal Contract Vocabulary Mismatch

Finding IDs: 1, 20-22, 24-25, 30, 55, 58-62, 65

Affected scenarios:

- `buster-module-infra-failure`
- `needs-nova-code-failure`
- `forge-spawn-gateway-failure`
- `forge-malformed-output`
- `pipeline-review-config-contract-failure`
- `echo-gate-config-failure`
- `buster-gate-failure`
- `git-merge-conflict`
- `forge-timeout`
- `buster-module-timeout`
- `echo-gate-timeout`
- `final-review-timeout`
- `pipeline-review-timeout`
- `pipeline-cancelled`

Reasons observed:

- mostly `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH`

Likely root cause:

Many scenarios expect terminal values such as `failed`, `action_required`, or `needs_nova`, while current production emits values like `blocked`, `verdict_fail`, or a different failure class. Some of this is likely real vocabulary drift after completion-authority cleanup; some may be bad scenario expectations.

Canonical proposal:

- Define the terminal failure taxonomy once: `failed`, `blocked`, `action_required`, `needs_nova`, `infra_error`, `verdict_fail`, timeout classes, and config classes.
- Scenarios should assert taxonomy-level outcomes, not legacy strings.
- If `needs_nova` is policy-derived, assert the policy decision separately from the raw failure evidence.

### B3. Harness Setup / Reporting Failure

Finding IDs: 72-84

Affected scenarios:

- `pipeline-summary-failure`
- `git-credential-failure`
- `git-remote-push-failure`
- `git-non-fast-forward`
- `git-commit-failure`
- `multi-module-dependent-success`
- `multi-module-concurrency-stress`

Reasons observed:

- `REAL_E2E_RUNNER_FAILED`
- `REAL_E2E_HARNESS_ABORTED_BEFORE_PIPELINE_RESULT`
- `REAL_E2E_FAILURE_UNCLASSIFIED`

Likely root cause:

These failed before producing a useful pipeline result, or were reported without a typed failure. Git scenarios are especially suspicious because setup pushes to intentionally invalid remotes before the pipeline can own and classify the failure.

Canonical proposal:

- Fault setup must not abort before pipeline authority begins unless the scenario is explicitly a harness-contract test.
- Git failure scenarios should inject faults at the Git authority boundary, not by breaking checkpoint restoration/setup.
- Any scenario that aborts before a pipeline result must emit a typed harness failure with setup phase, command, and expected ownership.
- `REAL_E2E_FAILURE_UNCLASSIFIED` should be treated as a harness bug.

### B4. Final-Buster Fault Injection Mismatch

Finding IDs: 31-39, 52-54

Affected scenarios:

- `namespace-lease-denied`
- `k8s-pod-never-ready`
- `tailscale-ingress-creation-failure`
- `tailscale-preview-url-unreachable`
- `tailscale-preview-wrong-deployment`
- `tailscale-unavailable`
- `k8s-context-invalid`
- `tailscale-preview-credentials-missing`

Reasons observed:

- `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH`
- `REAL_E2E_BUSTER_FAILURE_ARTIFACT_NOT_FAIL`
- `REAL_E2E_BUSTER_FAILURE_CHECK_MISMATCH`

Likely root cause:

The scenario fault may not be injected at the same authority that final Buster now uses. Some assertions expect a Tailscale/public-preview failure while final Buster now uses k8s service metadata for content proof and treats public preview as exposure metadata.

Canonical proposal:

- Final-Buster scenarios must inject faults into the canonical suite authority: namespace controller, k8s suite metadata, registry auth, or preview metadata.
- Each scenario should assert the specific suite finding, not an old global terminal string.
- Do not create alternate URL/service resolution paths for tests.

### B5. Infra Fault Contract Mismatch

Finding IDs: 41-51

Affected scenarios:

- `redis-unavailable`
- `redis-transport-policy-failure`
- `discord-unavailable`
- `discord-webhook-missing`

Reasons observed:

- `REAL_E2E_PIPELINE_FAILURE_CONTRACT_INCOMPLETE`
- `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH`
- `REAL_E2E_FATAL_CONFIG_DOWNSTREAM_SUCCESS_OBSERVED`
- `REAL_E2E_OBSERVABILITY_DEGRADED_CONTRACT_MISSING`

Likely root cause:

These scenarios blur fatal configuration, degraded observability, and downstream success behavior. Some may now be expected degraded-mode behavior rather than fatal failure, especially Discord-related cases.

Canonical proposal:

- Classify infra dependencies as `required`, `degraded-but-allowed`, or `optional`.
- Scenarios should assert that policy explicitly.
- Fatal config scenarios must prove no downstream success occurs.
- Degraded observability scenarios must prove degraded events are emitted and restored when recovered.

### B6. Cleanup Authority / Verification Failure

Finding IDs: 67-71

Affected scenarios:

- `pipeline-summary-failure`
- `multi-module-concurrency-stress`

Cleanup surfaces:

- `redis`
- `kubernetes`
- `git_worktree`
- `git_branch`
- `git_remote_branch`

Likely root cause:

These were tied to harness-aborted scenarios. Cleanup verification still needs to be controller-authoritative, especially Kubernetes namespace cleanup.

Canonical proposal:

- Cleanup assertions must be driven through the same cleanup controller authority used by production/harness.
- A scenario that aborts during setup must still emit cleanup ownership and completion evidence.
- Namespace cleanup should be verified by controller status, not by deleting or guessing directly from the harness.

### B7. Checkpoint Runtime-Config Contamination

Finding IDs: 26-29

Affected scenarios:

- `buster-invalid-completion-identity`
- `buster-missing-output-file`

Reasons observed:

- terminal expected module Buster failure, actual halted at `pipeline:runtime_config`
- missing module Buster artifact / dead-letter mismatch

Likely root cause:

The checkpoint or scenario mutation corrupted runtime configuration before the intended Buster failure point. The scenario never reached the authority it was supposed to test.

Canonical proposal:

- Runtime config must be immutable checkpoint state unless the scenario explicitly owns a config-failure test.
- Buster-output corruption scenarios should mutate only Buster output/task artifacts at the Buster boundary.
- If a mutation causes `runtime_config`, the scenario should fail as invalid setup, not as the intended Buster scenario.

### B8. Scenario Expectation Mismatch

Finding IDs: 40, 56

Affected scenarios:

- `pipeline-summary-failure`
- `git-credential-failure`
- `git-remote-push-failure`
- `git-non-fast-forward`
- `git-commit-failure`
- `multi-module-concurrency-stress`
- `git-dirty-worktree-preserved`
- `multi-module-independent-success`
- `multi-module-retry-unlocks-dependent`
- `crash-before-buster-handoff`
- `crash-after-buster-task-enqueue`
- `crash-during-buster-wait`
- `crash-after-failed-gate-before-retry`
- `crash-during-retry-cycle`
- `crash-during-git-operation`
- `crash-after-final-review-before-summary`
- `crash-during-cleanup`

Reason observed:

- `REAL_E2E_PIPELINE_EXPECTATION_NOT_MET`

Likely root cause:

These are broad expectation failures with grouped scenario names. They need per-scenario inspection, but the grouping strongly suggests test harness expectations are not aligned with checkpointed start points.

Canonical proposal:

- Split grouped expectation failures into typed scenario-level checks.
- Each scenario must declare its hook point, expected terminal state, and proof artifact.
- Crash/resume scenarios should use dedicated checkpoint states near the crash point, not generic post-forge/pre-terminal snapshots.

### B9. Multi-Module Scenario Model Mismatch

Finding ID: 66

Affected scenario:

- `multi-module-dependency-blocked`

Reason observed:

- `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH`

Likely root cause:

The scenario likely expects a dependency block shape that the canonical four-module seed no longer expresses exactly.

Canonical proposal:

- Decide whether multi-module variants deserve their own fixture family.
- If yes, create minimal fixture/checkpoints for independent, dependent, blocked, retry-unlocks-dependent, and concurrency.
- If no, move most multi-module cases to contract tests and keep only one full E2E scenario.

### B10. Uncategorized / Inspect

Finding IDs: 2, 57, 63, 64

Affected scenarios:

- `buster-module-infra-failure`
- `forge-timeout`
- `pipeline-review-timeout`
- `pipeline-cancelled`

Reasons observed:

- `REAL_E2E_DELIVERY_LINT_READ_MODEL_MISMATCH`
- `REAL_E2E_PIPELINE_FAILURE_CONTRACT_INCOMPLETE`
- `REAL_E2E_FATAL_CONFIG_DOWNSTREAM_SUCCESS_OBSERVED`

Canonical proposal:

- Inspect individually before changing code.
- These may collapse into B2 or B5 after terminal taxonomy and infra policy are clarified.

## Finding Index

1. `buster-module-infra-failure` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B2
2. `buster-module-infra-failure` - `REAL_E2E_DELIVERY_LINT_READ_MODEL_MISMATCH` - B10
3. `retry-budget-exhausted` - `REAL_E2E_RETRY_FIX_CYCLE_EVIDENCE_FAILED` - B1
4. `retry-fix-malformed-output` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B1
5. `retry-fix-malformed-output` - `REAL_E2E_RETRY_FIX_CYCLE_EVIDENCE_FAILED` - B1
6. `retry-fix-malformed-output` - `REAL_E2E_MALFORMED_OUTPUT_RAW_PAYLOAD_MISMATCH` - B1
7. `retry-fix-malformed-output` - `REAL_E2E_MALFORMED_OUTPUT_TERMINAL_REJECTION_MISMATCH` - B1
8. `retry-fix-malformed-output` - `REAL_E2E_MALFORMED_OUTPUT_DOWNSTREAM_SUCCESS_OBSERVED` - B1
9. `retry-buster-pass-echo-rejects` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B1
10. `retry-buster-pass-echo-rejects` - `REAL_E2E_RETRY_FIX_CYCLE_EVIDENCE_FAILED` - B1
11. `retry-stale-forge-output` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B1
12. `retry-stale-forge-output` - `REAL_E2E_RETRY_FIX_CYCLE_EVIDENCE_FAILED` - B1
13. `retry-stale-forge-output` - `REAL_E2E_MALFORMED_OUTPUT_RAW_PAYLOAD_MISMATCH` - B1
14. `retry-stale-forge-output` - `REAL_E2E_MALFORMED_OUTPUT_TERMINAL_REJECTION_MISMATCH` - B1
15. `retry-reuses-previous-success-artifact` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B1
16. `retry-reuses-previous-success-artifact` - `REAL_E2E_RETRY_FIX_CYCLE_EVIDENCE_FAILED` - B1
17. `retry-reuses-previous-success-artifact` - `REAL_E2E_MALFORMED_OUTPUT_RAW_PAYLOAD_MISMATCH` - B1
18. `retry-reuses-previous-success-artifact` - `REAL_E2E_MALFORMED_OUTPUT_TERMINAL_REJECTION_MISMATCH` - B1
19. `retry-reuses-previous-success-artifact` - `REAL_E2E_MALFORMED_OUTPUT_DOWNSTREAM_SUCCESS_OBSERVED` - B1
20. `needs-nova-code-failure` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B2
21. `forge-spawn-gateway-failure` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B2
22. `forge-malformed-output` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B2
23. `forge-malformed-output` - `REAL_E2E_MALFORMED_OUTPUT_TERMINAL_REJECTION_MISMATCH` - B1
24. `pipeline-review-config-contract-failure` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B2
25. `echo-gate-config-failure` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B2
26. `buster-invalid-completion-identity` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B7
27. `buster-invalid-completion-identity` - `REAL_E2E_MISSING_ARTIFACT` - B7
28. `buster-missing-output-file` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B7
29. `buster-missing-output-file` - `REAL_E2E_BUSTER_DEAD_LETTER_CONTRACT_MISSING` - B7
30. `buster-gate-failure` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B2
31. `namespace-lease-denied` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B4
32. `k8s-pod-never-ready` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B4
33. `k8s-pod-never-ready` - `REAL_E2E_BUSTER_FAILURE_ARTIFACT_NOT_FAIL` - B4
34. `tailscale-ingress-creation-failure` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B4
35. `tailscale-ingress-creation-failure` - `REAL_E2E_BUSTER_FAILURE_CHECK_MISMATCH` - B4
36. `tailscale-preview-url-unreachable` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B4
37. `tailscale-preview-url-unreachable` - `REAL_E2E_BUSTER_FAILURE_ARTIFACT_NOT_FAIL` - B4
38. `tailscale-preview-wrong-deployment` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B4
39. `tailscale-unavailable` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B4
40. grouped six scenarios - `REAL_E2E_PIPELINE_EXPECTATION_NOT_MET` - B8
41. `redis-unavailable` - `REAL_E2E_PIPELINE_FAILURE_CONTRACT_INCOMPLETE` - B5
42. `redis-unavailable` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B5
43. `redis-transport-policy-failure` - `REAL_E2E_PIPELINE_FAILURE_CONTRACT_INCOMPLETE` - B5
44. `redis-transport-policy-failure` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B5
45. `discord-unavailable` - `REAL_E2E_PIPELINE_FAILURE_CONTRACT_INCOMPLETE` - B5
46. `discord-unavailable` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B5
47. `discord-unavailable` - `REAL_E2E_FATAL_CONFIG_DOWNSTREAM_SUCCESS_OBSERVED` - B5
48. `discord-unavailable` - `REAL_E2E_OBSERVABILITY_DEGRADED_CONTRACT_MISSING` - B5
49. `discord-webhook-missing` - `REAL_E2E_PIPELINE_FAILURE_CONTRACT_INCOMPLETE` - B5
50. `discord-webhook-missing` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B5
51. `discord-webhook-missing` - `REAL_E2E_OBSERVABILITY_DEGRADED_CONTRACT_MISSING` - B5
52. `k8s-context-invalid` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B4
53. `k8s-context-invalid` - `REAL_E2E_BUSTER_FAILURE_ARTIFACT_NOT_FAIL` - B4
54. `tailscale-preview-credentials-missing` - `REAL_E2E_BUSTER_FAILURE_CHECK_MISMATCH` - B4
55. `git-merge-conflict` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B2
56. grouped eleven scenarios - `REAL_E2E_PIPELINE_EXPECTATION_NOT_MET` - B8
57. `forge-timeout` - `REAL_E2E_PIPELINE_FAILURE_CONTRACT_INCOMPLETE` - B10
58. `forge-timeout` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B2
59. `buster-module-timeout` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B2
60. `echo-gate-timeout` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B2
61. `final-review-timeout` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B2
62. `pipeline-review-timeout` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B2
63. `pipeline-review-timeout` - `REAL_E2E_FATAL_CONFIG_DOWNSTREAM_SUCCESS_OBSERVED` - B10
64. `pipeline-cancelled` - `REAL_E2E_PIPELINE_FAILURE_CONTRACT_INCOMPLETE` - B10
65. `pipeline-cancelled` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B2
66. `multi-module-dependency-blocked` - `REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH` - B9
67. grouped two scenarios - `cleanup:redis` - B6
68. grouped two scenarios - `cleanup:kubernetes` - B6
69. grouped two scenarios - `cleanup:git_worktree` - B6
70. grouped two scenarios - `cleanup:git_branch` - B6
71. grouped two scenarios - `cleanup:git_remote_branch` - B6
72. `pipeline-summary-failure` - `REAL_E2E_RUNNER_FAILED` - B3
73. `pipeline-summary-failure` - `REAL_E2E_HARNESS_ABORTED_BEFORE_PIPELINE_RESULT` - B3
74. `git-credential-failure` - `REAL_E2E_RUNNER_FAILED` - B3
75. `git-credential-failure` - `REAL_E2E_HARNESS_ABORTED_BEFORE_PIPELINE_RESULT` - B3
76. `git-remote-push-failure` - `REAL_E2E_RUNNER_FAILED` - B3
77. `git-remote-push-failure` - `REAL_E2E_HARNESS_ABORTED_BEFORE_PIPELINE_RESULT` - B3
78. `git-non-fast-forward` - `REAL_E2E_RUNNER_FAILED` - B3
79. `git-non-fast-forward` - `REAL_E2E_HARNESS_ABORTED_BEFORE_PIPELINE_RESULT` - B3
80. `git-commit-failure` - `REAL_E2E_RUNNER_FAILED` - B3
81. `git-commit-failure` - `REAL_E2E_HARNESS_ABORTED_BEFORE_PIPELINE_RESULT` - B3
82. `multi-module-dependent-success` - `REAL_E2E_FAILURE_UNCLASSIFIED` - B3
83. `multi-module-concurrency-stress` - `REAL_E2E_RUNNER_FAILED` - B3
84. `multi-module-concurrency-stress` - `REAL_E2E_HARNESS_ABORTED_BEFORE_PIPELINE_RESULT` - B3

## Recommended Next Step

Do not rerun the full matrix before the following are done:

1. Build a scenario inventory and mark duplicate/merge candidates.
2. Redesign checkpoint hook contracts by phase boundary.
3. Fix harness setup failures so setup cannot masquerade as product failure.
4. Reconcile terminal taxonomy and update scenarios to assert canonical terms.
5. Run a category canary matrix before another full 64-scenario launch.
