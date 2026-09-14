import fs from 'node:fs';
import path from 'node:path';
import { realE2ERegistryTarget } from './registry-target.mjs';

const SCENARIOS = Object.freeze({
  success: Object.freeze({
    id: 'success',
    description: 'Canonical successful production-like pipeline run.',
    expectedPipelineExit: 'zero',
    approvalDecision: 'approve',
    expectedEvidence: 'success',
  }),
  'approval-deny': Object.freeze({
    id: 'approval-deny',
    description: 'Real approval gate receives an explicit operator rejection and blocks.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'deny',
    expectedEvidence: 'approval_rejected',
  }),
  'approval-timeout-block': Object.freeze({
    id: 'approval-timeout-block',
    description: 'Real approval gate times out under BLOCK policy and halts.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: null,
    expectedEvidence: 'approval_timeout_block',
  }),
  'buster-module-failure': Object.freeze({
    id: 'buster-module-failure',
    description: 'Real Buster module suite fails through the unit test command.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'buster_module_failure',
  }),
  'buster-module-infra-failure': Object.freeze({
    id: 'buster-module-infra-failure',
    description: 'Real Buster infrastructure failure blocks the module without routing the issue to Forge.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'buster_module_infra_failure',
  }),
  'forge-retry-then-success': Object.freeze({
    id: 'forge-retry-then-success',
    description: 'Real module code failure triggers the production retry path and then succeeds.',
    expectedPipelineExit: 'zero',
    approvalDecision: 'approve',
    expectedEvidence: 'success_after_retry',
  }),
  'retry-budget-exhausted': Object.freeze({
    id: 'retry-budget-exhausted',
    description: 'Real module code failure retries once, records both failed attempts, and blocks when retry budget is exhausted.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'retry_budget_exhausted',
  }),
  'retry-fix-malformed-output': Object.freeze({
    id: 'retry-fix-malformed-output',
    description: 'Real module retry reaches the Forge fix attempt, then deterministic Forge completion normalization repairs a missing envelope.',
    expectedPipelineExit: 'zero',
    approvalDecision: 'approve',
    expectedEvidence: 'retry_fix_malformed_output',
  }),
  'retry-buster-pass-echo-rejects': Object.freeze({
    id: 'retry-buster-pass-echo-rejects',
    description: 'Real module retry recovers and passes Buster, then the following Echo gate rejects its exact production contract.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'retry_buster_pass_echo_rejects',
  }),
  'needs-nova-code-failure': Object.freeze({
    id: 'needs-nova-code-failure',
    description: 'Real module failure exhausts auto-retry before max_fails and requests Nova handoff.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'needs_nova',
  }),
  'forge-malformed-output': Object.freeze({
    id: 'forge-malformed-output',
    description: 'Deterministic real E2E publisher writes malformed Forge completion output, Nova rejects attempt 1, and retry recovery preserves the rejection evidence.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: null,
    expectedEvidence: 'forge_malformed_output',
  }),
  'architecture-validator-block': Object.freeze({
    id: 'architecture-validator-block',
    description: 'Real deterministic architecture validator finding blocks the run before module execution.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: null,
    expectedEvidence: 'architecture_validator_block',
  }),
  'echo-malformed-output': Object.freeze({
    id: 'echo-malformed-output',
    description: 'Deterministic real E2E publisher writes malformed Echo review output and Nova blocks on the review contract.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: null,
    expectedEvidence: 'echo_malformed_output',
  }),
  'buster-invalid-completion-identity': Object.freeze({
    id: 'buster-invalid-completion-identity',
    description: 'Contained Buster worker emits a real completion with wrong identity and Nova rejects it.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'buster_invalid_completion_identity',
  }),
  'buster-gate-failure': Object.freeze({
    id: 'buster-gate-failure',
    description: 'Real final Buster gate fails through the gate unit suite.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'buster_gate_failure',
  }),
  'k8s-pod-never-ready': Object.freeze({
    id: 'k8s-pod-never-ready',
    description: 'Real Kubernetes deployment is created but readiness never succeeds.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'k8s_pod_never_ready',
  }),
  'namespace-lease-denied': Object.freeze({
    id: 'namespace-lease-denied',
    description: 'Real Buster namespace lease is denied by the namespace safety/CRD contract.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'namespace_lease_denied',
  }),
  'tailscale-exposure-url-unreachable': Object.freeze({
    id: 'tailscale-exposure-url-unreachable',
    description: 'Real Tailscale preview URL is created but the served path is not reachable.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'tailscale_exposure_url_unreachable',
  }),
  'tailscale-exposure-wrong-content': Object.freeze({
    id: 'tailscale-exposure-wrong-content',
    description: 'Real Tailscale preview URL serves content that does not match the run-scoped nginx deployment marker.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'tailscale_exposure_wrong_content',
  }),
  'pipeline-summary-failure': Object.freeze({
    id: 'pipeline-summary-failure',
    description: 'Real project summary generator failure must not allow a clean successful verification run.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'pipeline_summary_failure',
  }),
  'redis-unavailable': Object.freeze({
    id: 'redis-unavailable',
    description: 'Real pipeline Redis transport failure blocks the run as infrastructure unavailable.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: null,
    expectedEvidence: 'redis_unavailable',
  }),
  'discord-unavailable': Object.freeze({
    id: 'discord-unavailable',
    description: 'Real Discord delivery failure records degraded observability and blocks clean completion until operator handoff.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'discord_unavailable',
  }),
  'k8s-context-invalid': Object.freeze({
    id: 'k8s-context-invalid',
    description: 'Real Kubernetes validation fails with an invalid kubeconfig context during final Buster.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'k8s_context_invalid',
  }),
  'registry-pull-failure': Object.freeze({
    id: 'registry-pull-failure',
    description: 'Real image build path fails when the fixture cannot pull its configured base image.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'registry_pull_failure',
  }),
  'git-credential-failure': Object.freeze({
    id: 'git-credential-failure',
    description: 'Real Git sync fails when push authentication is unavailable.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'git_credential_failure',
  }),
  'git-non-fast-forward': Object.freeze({
    id: 'git-non-fast-forward',
    description: 'Real Git sync fails when the remote rejects a non-fast-forward push.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'git_non_fast_forward',
  }),
  'git-merge-conflict': Object.freeze({
    id: 'git-merge-conflict',
    description: 'Real Git sync fails when pull-rebase observes a true divergent merge conflict.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'git_merge_conflict',
  }),
  'git-commit-failure': Object.freeze({
    id: 'git-commit-failure',
    description: 'Real Git sync fails when the commit/index operation cannot write its index.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'git_commit_failure',
  }),
  'git-dirty-worktree-preserved': Object.freeze({
    id: 'git-dirty-worktree-preserved',
    description: 'Real Git sync preserves an out-of-scope dirty worktree file while the pipeline succeeds.',
    expectedPipelineExit: 'zero',
    approvalDecision: 'approve',
    expectedEvidence: 'success_dirty_worktree_preserved',
  }),
  'forge-timeout': Object.freeze({
    id: 'forge-timeout',
    description: 'Real Forge module execution times out and halts with a typed timeout contract.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: null,
    expectedEvidence: 'forge_timeout',
  }),
  'buster-module-timeout': Object.freeze({
    id: 'buster-module-timeout',
    description: 'Real Nova Buster wait times out while the contained real task consumer is delayed.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'buster_module_timeout',
  }),
  'echo-gate-timeout': Object.freeze({
    id: 'echo-gate-timeout',
    description: 'Real Echo module review gate times out and halts with a typed timeout contract.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: null,
    expectedEvidence: 'echo_gate_timeout',
  }),
  'final-review-timeout': Object.freeze({
    id: 'final-review-timeout',
    description: 'Real final Echo review gate times out and halts with a typed timeout contract.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'final_review_timeout',
  }),
  'pipeline-review-timeout': Object.freeze({
    id: 'pipeline-review-timeout',
    description: 'Real pipeline review timeout halts with a typed terminal generator timeout without invalidating upstream final review artifacts.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'pipeline_review_timeout',
  }),
  'pipeline-cancelled': Object.freeze({
    id: 'pipeline-cancelled',
    description: 'Real pipeline process receives SIGTERM and records a typed user cancellation terminal event.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: null,
    expectedEvidence: 'pipeline_cancelled',
    cancelAtCheckpoint: 'before_buster_handoff',
  }),
  'multi-module-independent-success': Object.freeze({
    id: 'multi-module-independent-success',
    description: 'Two independent modules run as a dependency-ready batch, then shared final gates wait for both.',
    expectedPipelineExit: 'zero',
    approvalDecision: 'approve',
    expectedEvidence: 'multi_module_success',
  }),
  'multi-module-dependent-success': Object.freeze({
    id: 'multi-module-dependent-success',
    description: 'Module 02 depends on module 01 and runs only after module 01 passes.',
    expectedPipelineExit: 'zero',
    approvalDecision: 'approve',
    expectedEvidence: 'multi_module_dependency_success',
  }),
  'multi-module-dependency-blocked': Object.freeze({
    id: 'multi-module-dependency-blocked',
    description: 'Module 01 fails and prevents dependent module 02 from starting.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'multi_module_dependency_blocked',
  }),
  'crash-before-buster-handoff': Object.freeze({
    id: 'crash-before-buster-handoff',
    description: 'Real pipeline crashes after Forge/git preparation and resumes before Buster handoff.',
    expectedPipelineExit: 'zero',
    approvalDecision: 'approve',
    expectedEvidence: 'success_after_crash_resume',
    crashResume: true,
    crashPoint: 'before_buster_handoff',
  }),
  'crash-after-buster-task-enqueue': Object.freeze({
    id: 'crash-after-buster-task-enqueue',
    description: 'Real pipeline crashes after Buster task enqueue and resumes without double-consuming queued work.',
    expectedPipelineExit: 'zero',
    approvalDecision: 'approve',
    expectedEvidence: 'success_after_crash_resume',
    crashResume: true,
    crashPoint: 'after_buster_task_enqueue',
  }),
  'crash-during-buster-wait': Object.freeze({
    id: 'crash-during-buster-wait',
    description: 'Real pipeline crashes while waiting for Buster completion and resumes from the in-flight Buster state.',
    expectedPipelineExit: 'zero',
    approvalDecision: 'approve',
    expectedEvidence: 'success_after_crash_resume',
    crashResume: true,
    crashPoint: 'during_buster_wait',
  }),
  'crash-after-failed-gate-before-retry': Object.freeze({
    id: 'crash-after-failed-gate-before-retry',
    description: 'Real pipeline crashes after a failed Buster gate is recorded and resumes into the Forge retry path.',
    expectedPipelineExit: 'zero',
    approvalDecision: 'approve',
    expectedEvidence: 'success_after_crash_resume_retry',
    crashResume: true,
    crashPoint: 'after_failed_gate_before_retry',
  }),
  'crash-during-git-operation': Object.freeze({
    id: 'crash-during-git-operation',
    description: 'Real pipeline crashes after durable git sync status and resumes without corrupting git/module state.',
    expectedPipelineExit: 'zero',
    approvalDecision: 'approve',
    expectedEvidence: 'success_after_crash_resume',
    crashResume: true,
    crashPoint: 'during_git_operation',
  }),
  'crash-after-final-review-before-summary': Object.freeze({
    id: 'crash-after-final-review-before-summary',
    description: 'Real pipeline crashes after the terminal completed event and resumes missing terminal summaries.',
    expectedPipelineExit: 'zero',
    approvalDecision: 'approve',
    expectedEvidence: 'success_after_crash_resume',
    crashResume: true,
    crashPoint: 'after_final_review_before_summary',
  }),
  'crash-during-cleanup': Object.freeze({
    id: 'crash-during-cleanup',
    description: 'Real pipeline crashes during runner cleanup and resumes idempotently against the completed run.',
    expectedPipelineExit: 'zero',
    approvalDecision: 'approve',
    expectedEvidence: 'success_after_crash_resume',
    crashResume: true,
    crashPoint: 'during_cleanup',
  }),
  'git-cleanup-failure': Object.freeze({
    id: 'git-cleanup-failure',
    description: 'Real Git branch cleanup fails because the disposable branch is still checked out in another worktree.',
    expectedPipelineExit: 'zero',
    expectedCleanupOk: false,
    approvalDecision: 'approve',
    expectedEvidence: 'git_cleanup_failure',
  }),
});

const FAILURE_MATRIX_SUITES = Object.freeze({
  'full-pipeline-smoke': Object.freeze({
    id: 'full-pipeline-smoke',
    description: 'Canonical full pipeline smoke path.',
    scenarios: Object.freeze(['success']),
  }),
  'module-failure-retry': Object.freeze({
    id: 'module-failure-retry',
    description: 'Module Forge, Buster, retry, timeout, identity, and needs-Nova authority cases.',
    scenarios: Object.freeze([
      'forge-retry-then-success',
      'retry-budget-exhausted',
      'retry-fix-malformed-output',
      'retry-buster-pass-echo-rejects',
      'needs-nova-code-failure',
      'buster-module-failure',
      'buster-module-infra-failure',
      'buster-invalid-completion-identity',
      'buster-module-timeout',
      'forge-malformed-output',
      'forge-timeout',
    ]),
  }),
  'human-gates': Object.freeze({
    id: 'human-gates',
    description: 'Operator approval, module review, final review, and pipeline review gate cases.',
    scenarios: Object.freeze([
      'approval-deny',
      'approval-timeout-block',
      'echo-malformed-output',
      'echo-gate-timeout',
      'final-review-timeout',
      'pipeline-review-timeout',
    ]),
  }),
  'final-deployment-buster': Object.freeze({
    id: 'final-deployment-buster',
    description: 'Final Buster, Kubernetes, registry, namespace, and preview authority cases.',
    scenarios: Object.freeze([
      'buster-gate-failure',
      'namespace-lease-denied',
      'k8s-pod-never-ready',
      'k8s-context-invalid',
      'registry-pull-failure',
      'tailscale-exposure-url-unreachable',
      'tailscale-exposure-wrong-content',
    ]),
  }),
  'git-authority': Object.freeze({
    id: 'git-authority',
    description: 'Git sync and cleanup authority cases.',
    scenarios: Object.freeze([
      'git-credential-failure',
      'git-non-fast-forward',
      'git-merge-conflict',
      'git-commit-failure',
      'git-dirty-worktree-preserved',
      'git-cleanup-failure',
    ]),
  }),
  'infrastructure-observability': Object.freeze({
    id: 'infrastructure-observability',
    description: 'Runtime infrastructure, observability, summary, architecture, and cancellation cases.',
    scenarios: Object.freeze([
      'redis-unavailable',
      'discord-unavailable',
      'pipeline-summary-failure',
      'architecture-validator-block',
      'pipeline-cancelled',
    ]),
  }),
  'module-graph': Object.freeze({
    id: 'module-graph',
    description: 'Independent and dependent module graph cases.',
    scenarios: Object.freeze([
      'multi-module-independent-success',
      'multi-module-dependent-success',
      'multi-module-dependency-blocked',
    ]),
  }),
  'crash-resume': Object.freeze({
    id: 'crash-resume',
    description: 'Crash and resume idempotency cases across pipeline checkpoints.',
    scenarios: Object.freeze([
      'crash-before-buster-handoff',
      'crash-after-buster-task-enqueue',
      'crash-during-buster-wait',
      'crash-after-failed-gate-before-retry',
      'crash-during-git-operation',
      'crash-after-final-review-before-summary',
      'crash-during-cleanup',
    ]),
  }),
});

const FAILURE_MATRIX_SUITE_IDS = Object.freeze(Object.keys(FAILURE_MATRIX_SUITES));

const SUITE_SCENARIO_IDS = Object.freeze([
  ...new Set(FAILURE_MATRIX_SUITE_IDS.flatMap((suiteId) => FAILURE_MATRIX_SUITES[suiteId].scenarios)),
]);

const FAILURE_MATRIX_SUITE_BOUNDARIES = Object.freeze({
  'full-pipeline-smoke': Object.freeze({ default: 'full' }),
  'module-failure-retry': Object.freeze({
    default: 'modules',
    cases: Object.freeze({
      'retry-buster-pass-echo-rejects': 'module-review',
    }),
  }),
  'human-gates': Object.freeze({
    default: 'module-review',
    cases: Object.freeze({
      'approval-deny': 'full',
      'approval-timeout-block': 'full',
      'final-review-timeout': 'full',
      'pipeline-review-timeout': 'full',
    }),
  }),
  'final-deployment-buster': Object.freeze({ default: 'final-buster' }),
  'git-authority': Object.freeze({ default: 'modules' }),
  'infrastructure-observability': Object.freeze({
    default: 'full',
    cases: Object.freeze({
      'architecture-validator-block': 'modules',
      'pipeline-cancelled': 'modules',
      'redis-unavailable': 'modules',
      'discord-unavailable': 'final-buster',
    }),
  }),
  'module-graph': Object.freeze({ default: 'modules' }),
  'crash-resume': Object.freeze({
    default: 'full',
    cases: Object.freeze({
      'crash-before-buster-handoff': 'modules',
      'crash-after-buster-task-enqueue': 'modules',
      'crash-during-buster-wait': 'modules',
      'crash-after-failed-gate-before-retry': 'modules',
      'crash-during-git-operation': 'modules',
      'crash-after-final-review-before-summary': 'final-review',
      'crash-during-cleanup': 'final-review',
    }),
  }),
});

export function failureMatrixExecutionBoundary({ suite = null, scenario = null } = {}) {
  const suiteId = typeof suite === 'string' ? suite : suite?.id;
  const scenarioId = typeof scenario === 'string' ? scenario : scenario?.id;
  const boundary = FAILURE_MATRIX_SUITE_BOUNDARIES[suiteId || ''];
  return boundary?.cases?.[scenarioId || ''] || boundary?.default || 'full';
}

const FULL_GRAPH_SCENARIOS = Object.freeze(new Set([
  'success',
  'multi-module-independent-success',
  'multi-module-dependent-success',
  'multi-module-dependency-blocked',
]));

export function realE2EScenarioModuleIds(scenario = null) {
  const scenarioId = typeof scenario === 'string' ? scenario : scenario?.id;
  if (FULL_GRAPH_SCENARIOS.has(scenarioId || '')) {
    return Object.freeze(['01-nginx', '02-nginx', '03-nginx', '04-nginx']);
  }
  return Object.freeze(['01-nginx']);
}

export const DEFAULT_CHECKPOINT_FIXTURE_FAMILY = 'standard-4-module';

const SCENARIO_REQUIRED_HOOKS = Object.freeze({
  success: 'pre-forge',
  'forge-retry-then-success': 'pre-forge',

  'buster-module-failure': 'pre-module-buster',
  'buster-module-infra-failure': 'pre-module-buster',
  'buster-invalid-completion-identity': 'pre-module-buster',
  'buster-module-timeout': 'pre-module-buster',
  'retry-budget-exhausted': 'pre-module-buster',
  'retry-fix-malformed-output': 'pre-forge',
  'needs-nova-code-failure': 'pre-module-buster',
  'git-credential-failure': 'post-forge',
  'git-non-fast-forward': 'post-forge',
  'git-merge-conflict': 'post-forge',
  'git-commit-failure': 'post-forge',
  'git-dirty-worktree-preserved': 'post-forge',
  'git-cleanup-failure': 'post-forge',
  'crash-before-buster-handoff': 'pre-module-buster',
  'crash-after-buster-task-enqueue': 'during-module-buster-wait',
  'crash-during-buster-wait': 'during-module-buster-wait',
  'crash-after-failed-gate-before-retry': 'pre-module-buster',
  'crash-during-git-operation': 'post-forge',

  'echo-malformed-output': 'pre-module-review',
  'echo-gate-timeout': 'pre-module-review',
  'retry-buster-pass-echo-rejects': 'pre-forge',

  'approval-deny': 'post-module-review',
  'approval-timeout-block': 'post-module-review',

  'buster-gate-failure': 'pre-final-buster',
  'k8s-pod-never-ready': 'pre-forge',
  'namespace-lease-denied': 'pre-final-buster',
  'tailscale-exposure-url-unreachable': 'pre-final-buster',
  'tailscale-exposure-wrong-content': 'pre-final-buster',
  'k8s-context-invalid': 'pre-final-buster',
  'registry-pull-failure': 'pre-final-buster',

  'final-review-timeout': 'pre-final-review',

  'pipeline-summary-failure': 'post-final-review',
  'discord-unavailable': 'pre-terminal-delivery',
  'pipeline-review-timeout': 'pre-terminal-delivery',
  'crash-after-final-review-before-summary': 'post-final-review',
  'crash-during-cleanup': 'during-cleanup',

  'forge-malformed-output': 'pre-forge',
  'architecture-validator-block': 'pre-forge',
  'redis-unavailable': 'pre-forge',
  'forge-timeout': 'pre-forge',
  'pipeline-cancelled': 'pre-forge',
  'multi-module-independent-success': 'pre-forge',
  'multi-module-dependent-success': 'pre-forge',
  'multi-module-dependency-blocked': 'pre-forge',
});

function checkpointFaultSurface(scenario) {
  const id = scenario.id;
  if (id === 'success') return 'baseline';
  if (id === 'retry-budget-exhausted' || id === 'needs-nova-code-failure') return 'module-buster';
  if (id === 'retry-buster-pass-echo-rejects') return 'module-review';
  if (id.startsWith('approval-')) return 'operator-approval';
  if (id.startsWith('architecture-validator')) return 'architecture-validator';
  if (id.startsWith('redis-')) return 'runtime-config.redis';
  if (id.startsWith('discord-')) return 'observability.discord';
  if (id.startsWith('git-')) return 'git-sync';
  if (id.startsWith('crash-')) return `crash-resume.${scenario.crashPoint || 'unknown'}`;
  if (id.startsWith('multi-module-')) return 'module-graph';
  if (id === 'pipeline-cancelled') return 'pipeline-signal';
  if (id.includes('pipeline-review')) return 'pipeline-review';
  if (id.includes('pipeline-summary')) return 'pipeline-summary';
  if (id.includes('final-review')) return 'final-review';
  if (id.includes('echo') || id.includes('module-review')) return 'module-review';
  if (id.includes('buster') || id.startsWith('k8s-') || id.startsWith('tailscale-')
    || id.startsWith('namespace-') || id.startsWith('registry-') || id.startsWith('required-env-')) {
    return id.includes('module') || id.includes('completion') || id.includes('missing-output')
      ? 'module-buster'
      : 'final-buster';
  }
  if (id.includes('forge') || id.includes('retry') || id.includes('needs-nova')) return 'forge';
  return 'pipeline';
}

function checkpointDedupeGroup(scenario) {
  const id = scenario.id;
  if (id.startsWith('retry-')) return 'retry-recovery-contract';
  if (id.startsWith('git-')) return 'git-sync-fault-contract';
  if (id.startsWith('crash-')) return 'crash-resume-contract';
  if (id.startsWith('multi-module-')) return 'module-graph-contract';
  if (id.startsWith('tailscale-')) return 'final-preview-contract';
  if (id.startsWith('registry-')) return 'registry-contract';
  if (id.startsWith('approval-')) return 'approval-contract';
  return null;
}

const MUTATION_CHANNELS_BY_SURFACE = Object.freeze({
  baseline: Object.freeze(['operator-controller']),
  'architecture-validator': Object.freeze(['progress']),
  forge: Object.freeze(['progress', 'malformed-output']),
  'module-buster': Object.freeze(['progress', 'buster-worker-api', 'fixture-contract']),
  'module-review': Object.freeze(['progress', 'malformed-output']),
  'operator-approval': Object.freeze(['progress', 'operator-controller']),
  'pipeline-review': Object.freeze(['progress', 'config']),
  'final-buster': Object.freeze(['progress', 'file', 'fixture-contract']),
  'final-review': Object.freeze(['progress']),
  'terminal-delivery': Object.freeze([]),
  'pipeline-summary': Object.freeze(['config']),
  'runtime-config.redis': Object.freeze(['progress', 'config', 'env']),
  'observability.discord': Object.freeze(['config', 'env']),
  'git-sync': Object.freeze(['git-shim', 'workspace-file', 'cleanup-blocker']),
  'pipeline-signal': Object.freeze(['signal-controller']),
  'module-graph': Object.freeze(['progress']),
  cleanup: Object.freeze(['cleanup-blocker']),
});

const BASELINE_SETUP_CHANNELS = Object.freeze(['operator-controller']);

const PROGRESS_MUTATION_SCENARIOS = Object.freeze(new Set([
  'approval-deny',
  'approval-timeout-block',
  'buster-module-failure',
  'buster-module-infra-failure',
  'forge-retry-then-success',
  'crash-after-failed-gate-before-retry',
  'retry-budget-exhausted',
  'retry-fix-malformed-output',
  'retry-buster-pass-echo-rejects',
  'needs-nova-code-failure',
  'forge-malformed-output',
  'architecture-validator-block',
  'echo-malformed-output',
  'buster-invalid-completion-identity',
  'buster-gate-failure',
  'k8s-pod-never-ready',
  'namespace-lease-denied',
  'tailscale-exposure-url-unreachable',
  'tailscale-exposure-wrong-content',
  'redis-unavailable',
  'k8s-context-invalid',
  'registry-pull-failure',
  'forge-timeout',
  'buster-module-timeout',
  'echo-gate-timeout',
  'final-review-timeout',
  'pipeline-review-timeout',
  'multi-module-independent-success',
  'multi-module-dependent-success',
  'multi-module-dependency-blocked',
]));

const CONFIG_MUTATION_SCENARIOS = Object.freeze(new Set([
  'pipeline-summary-failure',
  'discord-unavailable',
  'redis-unavailable',
]));

const ENV_MUTATION_SCENARIOS = Object.freeze(new Set([
  'redis-unavailable',
  'discord-unavailable',
]));

const FILE_MUTATION_SCENARIOS = Object.freeze(new Set([
  'registry-pull-failure',
  'k8s-pod-never-ready',
]));

function allowedMutationChannelsForSurface(surface) {
  if (String(surface || '').startsWith('crash-resume.')) return ['crash-controller', 'progress'];
  return [...(MUTATION_CHANNELS_BY_SURFACE[surface] || [])];
}

export function scenarioMutationContractForScenario(id = 'success') {
  const scenario = requireScenario(id || 'success');
  const faultSurface = checkpointFaultSurface(scenario);
  return Object.freeze({
    scenario_id: scenario.id,
    fault_injection_surface: faultSurface,
    allowed_mutation_channels: Object.freeze(allowedMutationChannelsForSurface(faultSurface)),
  });
}

export function assertScenarioMutationChannel(scenarioOrId, channel) {
  const scenario = typeof scenarioOrId === 'string' ? requireScenario(scenarioOrId) : requireScenario(scenarioOrId?.id);
  const contract = scenarioMutationContractForScenario(scenario.id);
  if (contract.allowed_mutation_channels.includes(channel)) return true;
  const error = new Error(`real E2E scenario '${scenario.id}' cannot mutate channel '${channel}' from surface '${contract.fault_injection_surface}'`);
  error.code = 'REAL_E2E_SCENARIO_MUTATION_SCOPE_VIOLATION';
  error.scenario_mutation_contract = contract;
  error.channel = channel;
  throw error;
}

export function assertScenarioSetupChannel(scenarioOrId, channel) {
  const scenario = typeof scenarioOrId === 'string' ? requireScenario(scenarioOrId) : requireScenario(scenarioOrId?.id);
  const contract = scenarioMutationContractForScenario(scenario.id);
  if (contract.allowed_mutation_channels.includes(channel)) return true;
  if (BASELINE_SETUP_CHANNELS.includes(channel)) return true;
  const error = new Error(`real E2E scenario '${scenario.id}' cannot use setup channel '${channel}' from surface '${contract.fault_injection_surface}'`);
  error.code = 'REAL_E2E_SCENARIO_SETUP_SCOPE_VIOLATION';
  error.scenario_mutation_contract = contract;
  error.channel = channel;
  throw error;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function failingApiSpecPath(message) {
  return `.swarm/fixtures/${String(message).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
}

function setFailingApi(mod, specPath) {
  mod.test_config ||= {};
  mod.test_suites = [...new Set([...(mod.test_suites || []), 'api'])];
  mod.test_config.api = { spec_file: specPath };
}

function setFailOnceRetryFixture(mod) {
  mod.real_e2e_command_suites = [{ kind: 'fail-once', suite: 'retry-fixture' }];
}

function requireScenario(id) {
  const scenario = SCENARIOS[id];
  if (!scenario) {
    throw new Error(`unknown real E2E scenario: ${id}`);
  }
  return scenario;
}

function readPathValue(value, dottedPath) {
  const parts = String(dottedPath).split('.');
  const resolve = (current, index) => {
    if (current == null) return undefined;
    if (index >= parts.length) return current;
    if (Array.isArray(current) && /^\d+$/.test(parts[index])) return resolve(current[Number(parts[index])], index + 1);
    if (typeof current !== 'object') return undefined;
    for (let end = parts.length; end > index; end--) {
      const key = parts.slice(index, end).join('.');
      if (Object.hasOwn(current, key)) return resolve(current[key], end);
    }
    return undefined;
  };
  return resolve(value, 0);
}

function setupFieldFailures(source, expected = {}) {
  return Object.entries(expected)
    .map(([field, expectedValue]) => {
      const actual = readPathValue(source, field);
      return JSON.stringify(actual) === JSON.stringify(expectedValue)
        ? null
        : { field, expected: expectedValue, actual: actual ?? null };
    })
    .filter(Boolean);
}

function setupAbsentFailures(source, fields = []) {
  return fields
    .map((field) => {
      const actual = readPathValue(source, field);
      return actual === undefined
        ? null
        : { field, expected_absent: true, actual };
    })
    .filter(Boolean);
}

function setupPathSuffixFailures(source, expected = {}) {
  return Object.entries(expected)
    .map(([field, expectedSuffix]) => {
      const actual = readPathValue(source, field);
      return typeof actual === 'string' && actual.endsWith(expectedSuffix)
        ? null
        : { field, expected_path_suffix: expectedSuffix, actual: actual ?? null };
    })
    .filter(Boolean);
}

const SETUP_CONTRACTS = Object.freeze({
  'approval-deny': Object.freeze({
    progress: Object.freeze({
      'execution_order.0': 'gate:operator-approval',
      'real_e2e.approval_before_modules': true,
    }),
  }),
  'approval-timeout-block': Object.freeze({
    progress: Object.freeze({
      'execution_order.0': 'gate:operator-approval',
      'real_e2e.approval_before_modules': true,
    }),
  }),
  'buster-module-failure': Object.freeze({
    progress: Object.freeze({
      'modules.01-nginx.test_config.api.spec_file': failingApiSpecPath('REAL_E2E_EXPECTED_BUSTER_MODULE_FAILURE'),
    }),
  }),
  'needs-nova-code-failure': Object.freeze({
    progress: Object.freeze({
      'modules.01-nginx.test_config.api.spec_file': failingApiSpecPath('REAL_E2E_EXPECTED_NEEDS_NOVA_CODE_FAILURE'),
    }),
  }),
  'retry-budget-exhausted': Object.freeze({
    progress: Object.freeze({
      'modules.01-nginx.max_fails': 2,
      'modules.01-nginx.auto_retry_threshold': 1,
      'modules.01-nginx.test_config.api.spec_file': failingApiSpecPath('REAL_E2E_EXPECTED_RETRY_BUDGET_EXHAUSTED'),
    }),
  }),
  'retry-fix-malformed-output': Object.freeze({
    progress: Object.freeze({
      'modules.01-nginx.max_fails': 3,
      'modules.01-nginx.auto_retry_threshold': 1,
      'modules.01-nginx.timeout_minutes': Number(process.env.REAL_E2E_RETRY_FIX_MALFORMED_TIMEOUT_MINUTES || 15),
      'modules.01-nginx.real_e2e_command_suites.0.kind': 'fail-once',
      'modules.01-nginx.real_e2e_command_suites.0.suite': 'retry-fixture',
    }),
  }),
  'retry-buster-pass-echo-rejects': Object.freeze({
    progress: Object.freeze({
      'modules.01-nginx.max_fails': 2,
      'modules.01-nginx.auto_retry_threshold': 1,
      'modules.01-nginx.real_e2e_command_suites.0.kind': 'fail-once',
      'modules.01-nginx.real_e2e_command_suites.0.suite': 'retry-fixture',
      'gates.module-review.primary_reviewer': 'echo-codex',
      'gates.module-review.instructions_file': 'echo-review/MODULE-REVIEW-REJECT-INSTRUCTIONS.md',
      'gates.module-review.output_file': 'logs/echo-review/MODULE-REVIEW.json',
    }),
    swarm_file_exact_line: Object.freeze({
      'echo-review/MODULE-REVIEW-REJECT-INSTRUCTIONS.md': 'This is the canonical retry-buster-pass-echo-rejects fixture: return status "FAIL" with at least one critical issue after confirming the module retry recovered and reached module review.',
    }),
  }),
  'forge-malformed-output': Object.freeze({
    progress: Object.freeze({
      'modules.01-nginx.timeout_minutes': Number(process.env.REAL_E2E_FORGE_MALFORMED_TIMEOUT_MINUTES || 15),
    }),
  }),
  'architecture-validator-block': Object.freeze({
    progress: Object.freeze({
      'execution_order.0': 'REAL_E2E_EXPECTED_ARCH_VALIDATOR_UNKNOWN_MODULE',
    }),
  }),
  'echo-malformed-output': Object.freeze({
    progress: Object.freeze({
      'gates.module-review.timeout_minutes': Number(process.env.REAL_E2E_ECHO_MALFORMED_TIMEOUT_MINUTES || 0.1),
    }),
  }),
  'buster-invalid-completion-identity': Object.freeze({
    progress: Object.freeze({
      'modules.01-nginx.timeout_minutes': Number(process.env.REAL_E2E_BUSTER_IDENTITY_FAILURE_TIMEOUT_MINUTES || 1),
    }),
  }),
  'buster-gate-failure': Object.freeze({
    progress: Object.freeze({
      'gates.final-buster.test_config.api.spec_file': failingApiSpecPath('REAL_E2E_EXPECTED_BUSTER_GATE_FAILURE'),
    }),
  }),
  'namespace-lease-denied': Object.freeze({
    progress: Object.freeze({
      'real_e2e.kubernetes_fixture.namespace_prefix': 'prod',
    }),
  }),
  'tailscale-exposure-url-unreachable': Object.freeze({
    progress: Object.freeze({
      'real_e2e.public_http_url_override': 'http://127.0.0.1:1',
      'real_e2e.public_http_timeout_ms': 1000,
    }),
  }),
  'tailscale-exposure-wrong-content': Object.freeze({
    progress: Object.freeze({
      'real_e2e.public_http_expected_text': 'REAL_E2E_EXPECTED_DIFFERENT_DEPLOYMENT_MARKER',
    }),
  }),
  'k8s-pod-never-ready': Object.freeze({
    progress: Object.freeze({
      'real_e2e.kubernetes_fixture.readiness_timeout_seconds': 30,
    }),
    source_file_exact_line: Object.freeze({
      'k8s/deployment.yaml': '              command: ["/bin/sh", "-c", "exit 1"]',
    }),
  }),
  'k8s-context-invalid': Object.freeze({
    progress: Object.freeze({
      'real_e2e.intentional_config_failure.component': 'kubernetes',
      'real_e2e.intentional_config_failure.error_code': 'KUBERNETES_FIXTURE_NAMESPACE_PREFIX_DENIED',
      'real_e2e.kubernetes_fixture.namespace_prefix': 'prod',
    }),
  }),
  'pipeline-summary-failure': Object.freeze({
    config: Object.freeze({
      'plugins.modules.builtin.generator.project_summary.enabled': false,
    }),
  }),
  'redis-unavailable': Object.freeze({
    progress: Object.freeze({
      'real_e2e.intentional_config_failure.component': 'redis',
      'real_e2e.intentional_config_failure.error_code': 'REDIS_CONNECTION_UNAVAILABLE',
    }),
  }),
  'forge-timeout': Object.freeze({
    progress: Object.freeze({
      'modules.01-nginx.timeout_minutes': Number(process.env.REAL_E2E_FORGE_TIMEOUT_MINUTES || 0.001),
    }),
  }),
  'buster-module-timeout': Object.freeze({
    progress: Object.freeze({
      'modules.01-nginx.timeout_minutes': Number(process.env.REAL_E2E_BUSTER_MODULE_TIMEOUT_MINUTES || 0.001),
    }),
  }),
  'echo-gate-timeout': Object.freeze({
    progress: Object.freeze({
      'gates.module-review.timeout_minutes': Number(process.env.REAL_E2E_ECHO_GATE_TIMEOUT_MINUTES || 0.001),
    }),
  }),
  'final-review-timeout': Object.freeze({
    progress: Object.freeze({
      'gates.final-review.timeout_minutes': Number(process.env.REAL_E2E_FINAL_REVIEW_TIMEOUT_MINUTES || 0.001),
    }),
  }),
  'pipeline-review-timeout': Object.freeze({
    config: Object.freeze({
      'pipeline_review.timeout_minutes': Number(process.env.REAL_E2E_PIPELINE_REVIEW_TIMEOUT_MINUTES || 0.001),
    }),
  }),
  'multi-module-dependency-blocked': Object.freeze({
    progress: Object.freeze({
      'modules.01-nginx.max_fails': 1,
      'modules.01-nginx.test_config.api.spec_file': failingApiSpecPath('REAL_E2E_EXPECTED_MULTI_MODULE_DEPENDENCY_BLOCKED'),
      'modules.02-nginx.depends_on.0': '01-nginx',
      'real_e2e.multi_module.modules.0': '01-nginx',
      'real_e2e.multi_module.modules.1': '02-nginx',
    }),
  }),
});

export function realE2EScenarioSetupContract(scenarioId) {
  const scenario = requireScenario(scenarioId);
  if (scenario.id === 'registry-pull-failure') return Object.freeze({ progress: Object.freeze({
    'real_e2e.kubernetes_fixture.image.reference': `${realE2ERegistryTarget().host}/real-e2e-intentional-missing@sha256:${'f'.repeat(64)}`,
    'real_e2e.kubernetes_fixture.image.digest': `sha256:${'f'.repeat(64)}`,
  }) });
  return SETUP_CONTRACTS[scenario.id] || Object.freeze({});
}

function setupFileLineFailures({ rootDir, contract, label }) {
  const failures = [];
  for (const [relativePath, expectedLine] of Object.entries(contract || {})) {
    const filePath = rootDir ? path.join(rootDir, relativePath) : null;
    const text = filePath && fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
    const lines = text == null ? [] : text.split(/\r?\n/);
    if (!lines.includes(expectedLine)) {
      failures.push({
        field: `${label}:${relativePath}`,
        expected_line: expectedLine,
        actual: text == null ? null : 'present_without_expected_line',
      });
    }
  }
  return failures;
}

export function validateRealE2EScenarioSetup({ progress, config = {}, projectSrc, swarmDir, scenarioId }) {
  const scenario = requireScenario(scenarioId);
  const baseExpected = {
    'real_e2e.scenario_id': scenario.id,
    'real_e2e.expected_pipeline_exit': scenario.expectedPipelineExit,
    'real_e2e.expected_evidence': scenario.expectedEvidence,
  };
  const contract = realE2EScenarioSetupContract(scenario.id);
  const failures = [
    ...setupFieldFailures(progress, baseExpected),
    ...setupFieldFailures(progress, contract.progress || {}),
    ...setupFieldFailures(config, contract.config || {}),
    ...setupAbsentFailures(progress, contract.progress_absent || []),
    ...setupAbsentFailures(config, contract.config_absent || []),
    ...setupPathSuffixFailures(progress, contract.progress_path_suffix || {}),
    ...setupPathSuffixFailures(config, contract.config_path_suffix || {}),
  ];
  failures.push(...setupFileLineFailures({ rootDir: projectSrc, contract: contract.source_file_exact_line, label: 'source_file' }));
  failures.push(...setupFileLineFailures({ rootDir: swarmDir, contract: contract.swarm_file_exact_line, label: 'swarm_file' }));
  if (failures.length > 0) {
    const error = new Error(`real E2E scenario setup contract failed for ${scenario.id}`);
    error.failures = failures;
    throw error;
  }
  return true;
}

function scenarioFixtureContract(scenario) {
  const fixtures = {
    'namespace-lease-denied': {
      owner: 'final-buster',
      intent: 'namespace_safety_rejection',
      preserve: ['real_e2e.kubernetes_fixture.namespace_prefix'],
      evidence: ['namespace_prefix=prod'],
    },
    'buster-module-infra-failure': {
      owner: 'module-buster',
      intent: 'buster_infrastructure_unavailable',
      preserve: ['modules.01-nginx.test_config'],
      evidence: ['REAL_E2E_BUSTER_INFRA_UNAVAILABLE'],
    },
    'k8s-pod-never-ready': {
      owner: 'final-buster',
      intent: 'pod_readiness_timeout',
      preserve: ['k8s/deployment.yaml:readinessProbe.exec.command'],
      evidence: ['readinessProbe.exec.command=/bin/sh -c exit 1'],
    },
  };
  const fixture = fixtures[scenario.id];
  if (!fixture) return null;
  return {
    schema_version: 1,
    scenario_id: scenario.id,
    expected_evidence: scenario.expectedEvidence,
    intentional_fixture: fixture,
  };
}

function writeScenarioFixtureContract(projectSrc, scenario) {
  const contract = scenarioFixtureContract(scenario);
  if (!contract) return;
  const contractPath = path.join(projectSrc, '.swarm', 'real-e2e-scenario-contract.json');
  fs.mkdirSync(path.dirname(contractPath), { recursive: true });
  fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`);
}

export function gitFaultForScenario(scenarioId) {
  const scenario = requireScenario(scenarioId);
  if (scenarioId === 'git-credential-failure') {
    assertScenarioMutationChannel(scenario, 'git-shim');
    return {
      component: 'git',
      surface: 'push_auth',
      error_code: 'GIT_PUSH_AUTH_FAILED',
    };
  }
  if (scenarioId === 'git-non-fast-forward') {
    assertScenarioMutationChannel(scenario, 'git-shim');
    return {
      component: 'git',
      surface: 'non_fast_forward',
      error_code: 'GIT_PUSH_REJECTED',
    };
  }
  if (scenarioId === 'git-merge-conflict') {
    assertScenarioMutationChannel(scenario, 'git-shim');
    return {
      component: 'git',
      surface: 'merge_conflict',
      error_code: 'GIT_REBASE_CONFLICT',
    };
  }
  if (scenarioId === 'git-commit-failure') {
    assertScenarioMutationChannel(scenario, 'git-shim');
    return {
      component: 'git',
      surface: 'commit_index',
      error_code: 'GIT_COMMIT_FAILED',
    };
  }
  return null;
}

function approvalGate(progress) {
  const gate = progress?.gates?.['operator-approval'];
  if (!gate) throw new Error('real E2E progress must define operator-approval gate');
  return gate;
}

function moveOperatorApprovalBeforeModules(progress) {
  const approvalRef = 'gate:operator-approval';
  const order = Array.isArray(progress.execution_order) ? progress.execution_order : [];
  if (!order.includes(approvalRef)) throw new Error('real E2E execution_order must include operator approval gate');
  progress.execution_order = [
    approvalRef,
    ...order.filter((entry) => entry !== approvalRef),
  ];
  progress.real_e2e.approval_before_modules = true;
}

function moduleConfig(progress) {
  const mod = progress?.modules?.['01-nginx'];
  if (!mod) throw new Error('real E2E progress must define 01-nginx module');
  return mod;
}

function configureSecondModule(progress, { dependsOn = [], apiSpecPath = null } = {}) {
  if (!progress.modules?.['02-nginx'] || !progress.modules?.['03-nginx'] || !progress.modules?.['04-nginx']) {
    throw new Error('multi-module real E2E scenarios require the canonical four-module seed graph');
  }
  progress.modules['02-nginx'].depends_on = dependsOn.length ? [...dependsOn] : progress.modules['02-nginx'].depends_on;
  if (apiSpecPath) setFailingApi(progress.modules['02-nginx'], apiSpecPath);
  progress.real_e2e.multi_module = {
    modules: ['01-nginx', '02-nginx', '03-nginx', '04-nginx'],
    dependencies: {
      '01-nginx': [...(progress.modules['01-nginx']?.depends_on || [])],
      '02-nginx': [...(progress.modules['02-nginx']?.depends_on || [])],
      '03-nginx': [...(progress.modules['03-nginx']?.depends_on || [])],
      '04-nginx': [...(progress.modules['04-nginx']?.depends_on || [])],
    },
  };
}

function finalBusterGate(progress) {
  const gate = progress?.gates?.['final-buster'];
  if (!gate) throw new Error('real E2E progress must define final-buster gate');
  return gate;
}

export function listRealE2EScenarioIds() {
  return Object.keys(SCENARIOS);
}

export function listFailureMatrixSuiteIds() {
  return [...FAILURE_MATRIX_SUITE_IDS];
}

export function listFailureMatrixSuiteScenarioIds() {
  return [...SUITE_SCENARIO_IDS];
}

export function resolveFailureMatrixSuite(id) {
  const suite = FAILURE_MATRIX_SUITES[id];
  if (!suite) throw new Error(`unknown real E2E failure matrix suite: ${id || '<missing>'}`);
  return Object.freeze({
    id: suite.id,
    description: suite.description,
    scenarios: Object.freeze([...suite.scenarios]),
  });
}

export function suiteForFailureMatrixScenario(scenarioId) {
  for (const suiteId of FAILURE_MATRIX_SUITE_IDS) {
    const suite = FAILURE_MATRIX_SUITES[suiteId];
    if (suite.scenarios.includes(scenarioId)) return suite.id;
  }
  return null;
}

export function failureMatrixScenarioDecision(id) {
  const scenario = requireScenario(id || 'success');
  const suiteId = suiteForFailureMatrixScenario(scenario.id);
  if (suiteId) {
    return Object.freeze({
      scenario_id: scenario.id,
      decision: 'suite-case',
      replacement_scenario: suiteId,
      coverage: 'failure-matrix-suite',
      reason: 'covered by canonical failure matrix suite',
    });
  }
  return Object.freeze({
    scenario_id: scenario.id,
    decision: 'manual',
    replacement_scenario: null,
    coverage: 'run-real-pipeline-e2e.mjs --scenario',
    reason: 'not part of the negative failure matrix',
  });
}

export function checkpointContractForScenario(id = 'success') {
  const scenario = requireScenario(id || 'success');
  const requiredHook = SCENARIO_REQUIRED_HOOKS[scenario.id];
  if (!requiredHook) {
    throw new Error(`real E2E scenario '${scenario.id}' has no checkpoint hook contract`);
  }
  return Object.freeze({
    required_hook: requiredHook,
    fixture_family: DEFAULT_CHECKPOINT_FIXTURE_FAMILY,
    fault_injection_surface: checkpointFaultSurface(scenario),
    expected_terminal_authority: scenario.expectedEvidence,
    dedupe_group: checkpointDedupeGroup(scenario),
    mutation_contract: scenarioMutationContractForScenario(scenario.id),
  });
}

export function resolveRealE2EScenario(id = 'success') {
  const scenario = requireScenario(id || 'success');
  return Object.freeze({
    ...scenario,
    checkpointContract: checkpointContractForScenario(scenario.id),
  });
}

export function applyRealE2EScenario(progress, scenarioId) {
  const scenario = requireScenario(scenarioId);
  if (PROGRESS_MUTATION_SCENARIOS.has(scenario.id)) {
    assertScenarioMutationChannel(scenario, 'progress');
  }
  const next = cloneJson(progress);

  next.real_e2e = {
    ...(next.real_e2e || {}),
    scenario_id: scenario.id,
    scenario_description: scenario.description,
    expected_pipeline_exit: scenario.expectedPipelineExit,
    expected_evidence: scenario.expectedEvidence,
  };
  next.evidence = {
    ...(next.evidence || {}),
    require_discord_delivery_receipt: true,
  };

  if (scenario.id === 'approval-deny'
    || scenario.id === 'approval-timeout-block') {
    moveOperatorApprovalBeforeModules(next);
  }

  if (scenario.id === 'approval-timeout-block') {
    const gate = approvalGate(next);
    gate.on_timeout = 'block';
    gate.timeout_minutes = Number(process.env.REAL_E2E_APPROVAL_TIMEOUT_MINUTES || 0.02);
  }

  if (scenario.id === 'buster-module-failure') {
    const mod = moduleConfig(next);
    setFailingApi(mod, failingApiSpecPath('REAL_E2E_EXPECTED_BUSTER_MODULE_FAILURE'));
  }

  if (scenario.id === 'forge-retry-then-success') {
    const mod = moduleConfig(next);
    mod.max_fails = 2;
    mod.auto_retry_threshold = 1;
    setFailOnceRetryFixture(mod);
  }

  if (scenario.id === 'crash-after-failed-gate-before-retry') {
    const mod = moduleConfig(next);
    mod.max_fails = 2;
    mod.auto_retry_threshold = 1;
    setFailOnceRetryFixture(mod);
  }

  if (scenario.id === 'retry-budget-exhausted') {
    const mod = moduleConfig(next);
    mod.max_fails = 2;
    mod.auto_retry_threshold = 1;
    setFailingApi(mod, failingApiSpecPath('REAL_E2E_EXPECTED_RETRY_BUDGET_EXHAUSTED'));
  }

  if (scenario.id === 'retry-fix-malformed-output') {
    const mod = moduleConfig(next);
    mod.max_fails = 3;
    mod.auto_retry_threshold = 1;
    mod.timeout_minutes = Number(process.env.REAL_E2E_RETRY_FIX_MALFORMED_TIMEOUT_MINUTES || 15);
    setFailOnceRetryFixture(mod);
  }

  if (scenario.id === 'retry-buster-pass-echo-rejects') {
    const mod = moduleConfig(next);
    mod.max_fails = 2;
    mod.auto_retry_threshold = 1;
    setFailOnceRetryFixture(mod);
    const gate = next.gates?.['module-review'];
    if (!gate) throw new Error('real E2E progress must define module-review gate');
    gate.primary_reviewer = 'echo-codex';
    gate.instructions_file = 'echo-review/MODULE-REVIEW-REJECT-INSTRUCTIONS.md';
    gate.output_file = 'logs/echo-review/MODULE-REVIEW.json';
  }

  if (scenario.id === 'needs-nova-code-failure') {
    const mod = moduleConfig(next);
    mod.max_fails = 2;
    mod.auto_retry_threshold = 0;
    setFailingApi(mod, failingApiSpecPath('REAL_E2E_EXPECTED_NEEDS_NOVA_CODE_FAILURE'));
  }

  if (scenario.id === 'forge-malformed-output') {
    const mod = moduleConfig(next);
    mod.timeout_minutes = Number(process.env.REAL_E2E_FORGE_MALFORMED_TIMEOUT_MINUTES || 15);
  }

  if (scenario.id === 'architecture-validator-block') {
    next.execution_order = ['REAL_E2E_EXPECTED_ARCH_VALIDATOR_UNKNOWN_MODULE', ...next.execution_order];
  }

  if (scenario.id === 'echo-malformed-output') {
    const gate = next.gates?.['module-review'];
    if (!gate) throw new Error('real E2E progress must define module-review gate');
    gate.timeout_minutes = Number(process.env.REAL_E2E_ECHO_MALFORMED_TIMEOUT_MINUTES || 0.1);
  }

  if (scenario.id === 'buster-invalid-completion-identity') {
    const mod = moduleConfig(next);
    mod.timeout_minutes = Number(process.env.REAL_E2E_BUSTER_IDENTITY_FAILURE_TIMEOUT_MINUTES || 1);
  }

  if (scenario.id === 'buster-gate-failure') {
    const gate = finalBusterGate(next);
    setFailingApi(gate, failingApiSpecPath('REAL_E2E_EXPECTED_BUSTER_GATE_FAILURE'));
  }

  if (scenario.id === 'k8s-pod-never-ready') {
    next.real_e2e.kubernetes_fixture.readiness_timeout_seconds = 30;
  }

  if (scenario.id === 'namespace-lease-denied') {
    next.real_e2e.kubernetes_fixture.namespace_prefix = 'prod';
  }

  if (scenario.id === 'tailscale-exposure-url-unreachable') {
    next.real_e2e.public_http_url_override = 'http://127.0.0.1:1';
    next.real_e2e.public_http_timeout_ms = 1000;
  }

  if (scenario.id === 'tailscale-exposure-wrong-content') {
    next.real_e2e.public_http_expected_text = 'REAL_E2E_EXPECTED_DIFFERENT_DEPLOYMENT_MARKER';
  }

  if (scenario.id === 'redis-unavailable') {
    next.real_e2e.intentional_config_failure = {
      component: 'redis',
      surface: 'transport',
      error_code: 'REDIS_CONNECTION_UNAVAILABLE',
    };
  }

  if (scenario.id === 'k8s-context-invalid') {
    next.real_e2e.kubernetes_fixture.namespace_prefix = 'prod';
    next.real_e2e.intentional_config_failure = {
      component: 'kubernetes',
      surface: 'fixture-capability',
      error_code: 'KUBERNETES_FIXTURE_NAMESPACE_PREFIX_DENIED',
    };
  }

  if (scenario.id === 'registry-pull-failure') {
    next.real_e2e.kubernetes_fixture.image = {
      reference: `${realE2ERegistryTarget().host}/real-e2e-intentional-missing@sha256:${'f'.repeat(64)}`,
      digest: `sha256:${'f'.repeat(64)}`,
    };
  }

  if (scenario.id === 'forge-timeout') {
    const mod = moduleConfig(next);
    mod.timeout_minutes = Number(process.env.REAL_E2E_FORGE_TIMEOUT_MINUTES || 0.001);
  }

  if (scenario.id === 'buster-module-timeout') {
    const mod = moduleConfig(next);
    mod.timeout_minutes = Number(process.env.REAL_E2E_BUSTER_MODULE_TIMEOUT_MINUTES || 0.001);
  }

  if (scenario.id === 'echo-gate-timeout') {
    const gate = next.gates?.['module-review'];
    if (!gate) throw new Error('real E2E progress must define module-review gate');
    gate.timeout_minutes = Number(process.env.REAL_E2E_ECHO_GATE_TIMEOUT_MINUTES || 0.001);
  }

  if (scenario.id === 'final-review-timeout') {
    const gate = next.gates?.['final-review'];
    if (!gate) throw new Error('real E2E progress must define final-review gate');
    gate.timeout_minutes = Number(process.env.REAL_E2E_FINAL_REVIEW_TIMEOUT_MINUTES || 0.001);
  }

  if (scenario.id === 'multi-module-independent-success') {
    configureSecondModule(next);
  }

  if (scenario.id === 'multi-module-dependent-success') {
    configureSecondModule(next, { dependsOn: ['01-nginx'] });
  }

  if (scenario.id === 'multi-module-dependency-blocked') {
    configureSecondModule(next, { dependsOn: ['01-nginx'] });
    const mod = moduleConfig(next);
    mod.max_fails = 1;
    setFailingApi(mod, failingApiSpecPath('REAL_E2E_EXPECTED_MULTI_MODULE_DEPENDENCY_BLOCKED'));
  }

  return { progress: next, scenario };
}

export function applyRealE2EConfigScenario(config, scenarioId) {
  const scenario = requireScenario(scenarioId);
  if (CONFIG_MUTATION_SCENARIOS.has(scenario.id)) {
    assertScenarioMutationChannel(scenario, 'config');
  }
  const next = cloneJson(config);

  if (scenario.id === 'pipeline-summary-failure') {
    next.plugins = {
      ...(next.plugins || {}),
      modules: {
        ...(next.plugins?.modules || {}),
        'builtin.generator.project_summary': {
          ...(next.plugins?.modules?.['builtin.generator.project_summary'] || {}),
          enabled: false,
        },
      },
    };
  }

  if (scenario.id === 'discord-unavailable') {
    next.discord_webhook_url = 'http://127.0.0.1:1/real-e2e-discord-unavailable';
    next.discord = {
      ...(next.discord || {}),
      webhook_timeout_ms: 1000,
    };
  }

  if (scenario.id === 'redis-unavailable') {
    next.telemetry = {
      ...(next.telemetry || {}),
      redisHost: '127.0.0.1',
      redisPort: 1,
      redisNetworkIsolation: 'isolated',
    };
    next.agent_observability = {
      ...(next.agent_observability || {}),
      ingester: {
        ...(next.agent_observability?.ingester || {}),
        redisHost: '127.0.0.1',
        redisPort: 1,
        redisNetworkIsolation: 'isolated',
      },
    };
  }

  if (scenario.id === 'pipeline-review-timeout') {
    next.pipeline_review = {
      ...(next.pipeline_review || {}),
      timeout_minutes: Number(process.env.REAL_E2E_PIPELINE_REVIEW_TIMEOUT_MINUTES || 0.001),
    };
  }

  return next;
}

export function buildRealE2EScenarioEnv(scenarioId) {
  const scenario = requireScenario(scenarioId);
  if (ENV_MUTATION_SCENARIOS.has(scenario.id)) {
    assertScenarioMutationChannel(scenario, 'env');
  }
  if (scenario.id === 'redis-unavailable') {
    return {
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: '1',
      REDIS_PASSWORD: '',
      REDIS_TLS: '',
      REDIS_TLS_ENABLED: '',
      REDIS_NETWORK_ISOLATION: 'isolated',
    };
  }
  if (scenario.id === 'discord-unavailable') {
    return {
      DISCORD_WEBHOOK: 'http://127.0.0.1:1/real-e2e-discord-unavailable',
      DISCORD_WEBHOOK_URL: 'http://127.0.0.1:1/real-e2e-discord-unavailable',
    };
  }
  if (scenario.id === 'k8s-context-invalid') {
    return {};
  }
  return {};
}

export function applyRealE2EFileScenario({ projectSrc, scenarioId }) {
  const scenario = requireScenario(scenarioId);
  if (scenarioFixtureContract(scenario)) {
    assertScenarioMutationChannel(scenario, 'fixture-contract');
  }
  if (FILE_MUTATION_SCENARIOS.has(scenario.id)) {
    assertScenarioMutationChannel(scenario, 'file');
  }
  writeScenarioFixtureContract(projectSrc, scenario);

  if (scenario.id === 'namespace-lease-denied') {
    return;
  }

  if (scenario.id === 'buster-module-infra-failure') {
    return;
  }

  if (scenario.id !== 'k8s-pod-never-ready') return;

  const deploymentPath = path.join(projectSrc, 'k8s', 'deployment.yaml');
  const current = fs.readFileSync(deploymentPath, 'utf8');
  const next = current.replace(
    /readinessProbe:\n(\s+)httpGet:\n(\s+)path: \/\n(\s+)port: http/,
    'readinessProbe:\n$1exec:\n$2command: ["/bin/sh", "-c", "exit 1"]',
  );
  if (next === current) {
    throw new Error(`could not inject readiness failure into ${deploymentPath}`);
  }
  fs.writeFileSync(deploymentPath, next);
}

export function applyRealE2EWorkspaceScenario({ projectSrc, progress, scenarioId }) {
  applyRealE2EFileScenario({ projectSrc, scenarioId });
  return progress;
}
