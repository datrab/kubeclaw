export type ScenarioSuite =
  | 'full-pipeline-smoke'
  | 'human-gates'
  | 'module-failure-retry'
  | 'final-deployment-buster'
  | 'infrastructure-observability'
  | 'git-authority'
  | 'module-graph'
  | 'crash-resume';

export type ExpectedExit = 'zero' | 'nonzero';

export interface MatrixScenario {
  readonly id: string;
  readonly description: string;
  readonly suite: ScenarioSuite;
  readonly checkpoint: string;
  readonly faultSurface: string;
  readonly expectedExit: ExpectedExit;
  readonly expectedEvidence: string;
  readonly requires: readonly ('gateway' | 'discord' | 'redis' | 'kubernetes' | 'buildkit')[];
}

const definitions = [
  ['success', 'Canonical successful production pipeline.', 'full-pipeline-smoke', 'fresh', 'baseline', 'zero', 'success', ['gateway', 'discord', 'redis']],
  ['approval-deny', 'Operator rejects a real approval wait.', 'human-gates', 'post-module-review', 'operator-approval', 'nonzero', 'approval_rejected', ['discord']],
  ['approval-timeout-block', 'Approval expires under block policy.', 'human-gates', 'post-module-review', 'operator-approval', 'nonzero', 'approval_timeout_block', ['discord']],
  ['buster-module-failure', 'Module test command fails.', 'module-failure-retry', 'pre-module-buster', 'module-buster', 'nonzero', 'buster_module_failure', ['gateway']],
  ['buster-module-infra-failure', 'Module test infrastructure is unavailable.', 'module-failure-retry', 'pre-module-buster', 'module-buster', 'nonzero', 'buster_module_infra_failure', ['gateway']],
  ['forge-retry-then-success', 'Implementation fails once and succeeds after remediation.', 'module-failure-retry', 'pre-forge', 'forge', 'zero', 'success_after_retry', ['gateway']],
  ['retry-budget-exhausted', 'Repeated module failure exhausts attempts.', 'module-failure-retry', 'pre-module-buster', 'module-buster', 'nonzero', 'retry_budget_exhausted', ['gateway']],
  ['retry-fix-malformed-output', 'Malformed first implementation result is repaired.', 'module-failure-retry', 'pre-forge', 'forge', 'zero', 'retry_fix_malformed_output', ['gateway']],
  ['retry-buster-pass-echo-rejects', 'Recovered tests pass and review rejects.', 'module-failure-retry', 'pre-module-review', 'module-review', 'nonzero', 'retry_buster_pass_echo_rejects', ['gateway']],
  ['needs-nova-code-failure', 'Exhausted automatic repair requests orchestration.', 'module-failure-retry', 'pre-module-buster', 'module-buster', 'nonzero', 'needs_nova', ['gateway']],
  ['forge-malformed-output', 'Malformed implementation completion is rejected.', 'module-failure-retry', 'pre-forge', 'forge', 'nonzero', 'forge_malformed_output', ['gateway']],
  ['architecture-validator-block', 'Architecture validation blocks before implementation.', 'infrastructure-observability', 'fresh', 'architecture-validator', 'nonzero', 'architecture_validator_block', ['gateway']],
  ['echo-malformed-output', 'Malformed review completion is rejected.', 'human-gates', 'pre-module-review', 'module-review', 'nonzero', 'echo_malformed_output', ['gateway']],
  ['buster-invalid-completion-identity', 'Test completion with the wrong identity is rejected.', 'module-failure-retry', 'pre-module-buster', 'module-buster', 'nonzero', 'buster_invalid_completion_identity', ['gateway']],
  ['buster-gate-failure', 'Final quality evaluation fails.', 'final-deployment-buster', 'pre-final-buster', 'final-buster', 'nonzero', 'buster_gate_failure', ['gateway']],
  ['k8s-pod-never-ready', 'Kubernetes deployment never becomes ready.', 'final-deployment-buster', 'pre-final-buster', 'final-buster', 'nonzero', 'k8s_pod_never_ready', ['kubernetes']],
  ['namespace-lease-denied', 'Namespace lease authority rejects the request.', 'final-deployment-buster', 'pre-final-buster', 'final-buster', 'nonzero', 'namespace_lease_denied', ['kubernetes']],
  ['tailscale-preview-url-unreachable', 'Published preview URL is unreachable.', 'final-deployment-buster', 'pre-final-buster', 'final-buster', 'nonzero', 'tailscale_preview_url_unreachable', ['kubernetes']],
  ['tailscale-preview-wrong-deployment', 'Preview serves the wrong deployment marker.', 'final-deployment-buster', 'pre-final-buster', 'final-buster', 'nonzero', 'tailscale_preview_wrong_deployment', ['kubernetes']],
  ['pipeline-summary-failure', 'Project summary generation fails.', 'infrastructure-observability', 'post-final-review', 'pipeline-summary', 'nonzero', 'pipeline_summary_failure', []],
  ['redis-unavailable', 'Redis transport is unavailable.', 'infrastructure-observability', 'fresh', 'runtime-config.redis', 'nonzero', 'redis_unavailable', ['redis']],
  ['discord-unavailable', 'Required Discord delivery fails.', 'infrastructure-observability', 'pre-terminal-delivery', 'observability.discord', 'nonzero', 'discord_unavailable', ['discord']],
  ['k8s-context-invalid', 'Kubernetes context is invalid.', 'final-deployment-buster', 'pre-final-buster', 'final-buster', 'nonzero', 'k8s_context_invalid', ['kubernetes']],
  ['registry-pull-failure', 'Image build cannot pull its base image.', 'final-deployment-buster', 'pre-final-buster', 'final-buster', 'nonzero', 'registry_pull_failure', ['buildkit']],
  ['git-credential-failure', 'Git push authentication is unavailable.', 'git-authority', 'post-forge', 'git-sync', 'nonzero', 'git_credential_failure', []],
  ['git-non-fast-forward', 'Remote rejects a non-fast-forward push.', 'git-authority', 'post-forge', 'git-sync', 'nonzero', 'git_non_fast_forward', []],
  ['git-merge-conflict', 'Real divergent branches conflict during rebase.', 'git-authority', 'post-forge', 'git-sync', 'nonzero', 'git_merge_conflict', []],
  ['git-commit-failure', 'Git cannot update its index.', 'git-authority', 'post-forge', 'git-sync', 'nonzero', 'git_commit_failure', []],
  ['git-dirty-worktree-preserved', 'Out-of-scope dirty files survive synchronization.', 'git-authority', 'post-forge', 'git-sync', 'zero', 'success_dirty_worktree_preserved', []],
  ['forge-timeout', 'Implementation exceeds its deadline.', 'module-failure-retry', 'pre-forge', 'forge', 'nonzero', 'forge_timeout', ['gateway']],
  ['buster-module-timeout', 'Module testing exceeds its deadline.', 'module-failure-retry', 'pre-module-buster', 'module-buster', 'nonzero', 'buster_module_timeout', ['gateway']],
  ['echo-gate-timeout', 'Module review exceeds its deadline.', 'human-gates', 'pre-module-review', 'module-review', 'nonzero', 'echo_gate_timeout', ['gateway']],
  ['final-review-timeout', 'Final review exceeds its deadline.', 'human-gates', 'pre-final-review', 'final-review', 'nonzero', 'final_review_timeout', ['gateway']],
  ['pipeline-review-timeout', 'Pipeline review exceeds its deadline.', 'human-gates', 'post-final-review', 'pipeline-review', 'nonzero', 'pipeline_review_timeout', ['gateway']],
  ['pipeline-cancelled', 'Cancellation propagates through core and adapters.', 'infrastructure-observability', 'fresh', 'pipeline-signal', 'nonzero', 'pipeline_cancelled', []],
  ['multi-module-independent-success', 'Independent modules execute concurrently.', 'module-graph', 'fresh', 'module-graph', 'zero', 'multi_module_success', ['gateway']],
  ['multi-module-dependent-success', 'Dependent modules execute in order.', 'module-graph', 'fresh', 'module-graph', 'zero', 'multi_module_dependency_success', ['gateway']],
  ['multi-module-dependency-blocked', 'A failed dependency blocks its consumer.', 'module-graph', 'fresh', 'module-graph', 'nonzero', 'multi_module_dependency_blocked', ['gateway']],
  ['crash-before-buster-handoff', 'Recovery resumes before test handoff.', 'crash-resume', 'pre-module-buster', 'crash-resume.before_buster_handoff', 'zero', 'success_after_crash_resume', ['gateway']],
  ['crash-after-buster-task-enqueue', 'Recovery deduplicates accepted test dispatch.', 'crash-resume', 'pre-module-buster', 'crash-resume.after_buster_task_enqueue', 'zero', 'success_after_crash_resume', ['gateway']],
  ['crash-during-buster-wait', 'Recovery continues an in-flight test wait.', 'crash-resume', 'during-module-buster-wait', 'crash-resume.during_buster_wait', 'zero', 'success_after_crash_resume', ['gateway']],
  ['crash-after-failed-gate-before-retry', 'Recovery preserves retry state and budgets.', 'crash-resume', 'pre-module-review', 'crash-resume.after_failed_gate_before_retry', 'zero', 'success_after_crash_resume_retry', ['gateway']],
  ['crash-during-git-operation', 'Recovery fences an interrupted Git effect.', 'crash-resume', 'post-forge', 'crash-resume.during_git_operation', 'zero', 'success_after_crash_resume', []],
  ['crash-after-final-review-before-summary', 'Recovery resumes reporting after final review.', 'crash-resume', 'post-final-review', 'crash-resume.after_final_review_before_summary', 'zero', 'success_after_crash_resume', ['gateway']],
  ['crash-during-cleanup', 'Cleanup recovery is idempotent.', 'crash-resume', 'during-cleanup', 'crash-resume.during_cleanup', 'zero', 'success_after_crash_resume', []],
  ['git-cleanup-failure', 'Cleanup reports a real Git blocker and later removes it.', 'git-authority', 'during-cleanup', 'git-sync', 'zero', 'git_cleanup_failure', []],
] as const;

const scenarios = new Map<string, MatrixScenario>(definitions.map((item) => {
  const [id, description, suite, checkpoint, faultSurface, expectedExit, expectedEvidence, requires] = item;
  return [id, Object.freeze({
    id,
    description,
    suite,
    checkpoint,
    faultSurface,
    expectedExit,
    expectedEvidence,
    requires: Object.freeze([...requires]),
  }) as MatrixScenario];
}));

export function resolveRealE2EScenario(id: string): MatrixScenario {
  const scenario = scenarios.get(id);
  if (!scenario) throw new Error(`REAL_E2E_SCENARIO_UNKNOWN:${id}`);
  return scenario;
}

export function listRealE2EScenarioIds(): readonly string[] {
  return Object.freeze([...scenarios.keys()]);
}

export function listFailureMatrixSuiteIds(): readonly ScenarioSuite[] {
  return Object.freeze([...new Set([...scenarios.values()].map((scenario) => scenario.suite))]);
}

export function resolveFailureMatrixSuite(id: string): readonly MatrixScenario[] {
  if (!listFailureMatrixSuiteIds().includes(id as ScenarioSuite)) {
    throw new Error(`REAL_E2E_SUITE_UNKNOWN:${id}`);
  }
  return Object.freeze([...scenarios.values()].filter((scenario) => scenario.suite === id));
}

export function listFailureMatrixSuiteScenarioIds(id: string): readonly string[] {
  return Object.freeze(resolveFailureMatrixSuite(id).map((scenario) => scenario.id));
}
