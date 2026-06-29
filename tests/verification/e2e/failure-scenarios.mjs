import fs from 'node:fs';
import path from 'node:path';

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
  'approval-commentary': Object.freeze({
    id: 'approval-commentary',
    description: 'Real approval gate receives an operator commentary decision and continues with text preserved.',
    expectedPipelineExit: 'zero',
    approvalDecision: 'commentary',
    expectedEvidence: 'success',
  }),
  'approval-timeout-block': Object.freeze({
    id: 'approval-timeout-block',
    description: 'Real approval gate times out under BLOCK policy and halts.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: null,
    expectedEvidence: 'approval_timeout_block',
  }),
  'approval-timeout-continue': Object.freeze({
    id: 'approval-timeout-continue',
    description: 'Real approval gate times out under CONTINUE policy and proceeds.',
    expectedPipelineExit: 'zero',
    approvalDecision: null,
    expectedEvidence: 'success',
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
    description: 'Real Buster module build suite fails on an unavailable Dockerfile path.',
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
  'forge-multi-retry-then-success': Object.freeze({
    id: 'forge-multi-retry-then-success',
    description: 'Real module code fails twice, records both fix cycles, then succeeds on the third attempt.',
    expectedPipelineExit: 'zero',
    approvalDecision: 'approve',
    expectedEvidence: 'success_after_multi_retry',
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
    description: 'Real module retry reaches the Forge fix attempt, then malformed retry output is rejected by the production contract.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: null,
    expectedEvidence: 'retry_fix_malformed_output',
  }),
  'retry-buster-pass-echo-rejects': Object.freeze({
    id: 'retry-buster-pass-echo-rejects',
    description: 'Real module retry recovers and passes Buster, then the following Echo gate rejects its exact production contract.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: null,
    expectedEvidence: 'retry_buster_pass_echo_rejects',
  }),
  'retry-stale-forge-output': Object.freeze({
    id: 'retry-stale-forge-output',
    description: 'Real module retry receives a stale Forge completion artifact and must reject it instead of accepting old output.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: null,
    expectedEvidence: 'retry_stale_forge_output',
  }),
  'retry-reuses-previous-success-artifact': Object.freeze({
    id: 'retry-reuses-previous-success-artifact',
    description: 'Real module retry receives a previous success Forge artifact and must reject reused completion evidence.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: null,
    expectedEvidence: 'retry_reuses_previous_success_artifact',
  }),
  'needs-nova-code-failure': Object.freeze({
    id: 'needs-nova-code-failure',
    description: 'Real module failure exhausts auto-retry before max_fails and requests Nova handoff.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'needs_nova',
  }),
  'forge-spawn-gateway-failure': Object.freeze({
    id: 'forge-spawn-gateway-failure',
    description: 'Real Forge ACP spawn fails through the OpenClaw gateway path and blocks the run.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: null,
    expectedEvidence: 'forge_spawn_gateway_failure',
  }),
  'forge-malformed-output': Object.freeze({
    id: 'forge-malformed-output',
    description: 'Deterministic real E2E publisher writes malformed Forge completion output and Nova rejects the artifact contract.',
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
  'architecture-validator-config-contract-failure': Object.freeze({
    id: 'architecture-validator-config-contract-failure',
    description: 'Invalid architecture validator runtime config is reported as a contract failure, not code success.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: null,
    expectedEvidence: 'architecture_validator_config_contract_failure',
  }),
  'pipeline-review-config-contract-failure': Object.freeze({
    id: 'pipeline-review-config-contract-failure',
    description: 'Invalid pipeline review runtime config blocks a clean successful verification run.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'pipeline_review_config_contract_failure',
  }),
  'echo-gate-config-failure': Object.freeze({
    id: 'echo-gate-config-failure',
    description: 'Real Echo review gate rejects invalid reviewer configuration and blocks.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: null,
    expectedEvidence: 'echo_gate_failure',
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
  'buster-missing-output-file': Object.freeze({
    id: 'buster-missing-output-file',
    description: 'Contained Buster worker receives a real malformed task without output_file and Nova blocks on completion evidence.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'buster_missing_output_file',
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
  'tailscale-ingress-creation-failure': Object.freeze({
    id: 'tailscale-ingress-creation-failure',
    description: 'Real final-preview lease carries invalid Tailscale ingress exposure config and is rejected.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'tailscale_ingress_creation_failure',
  }),
  'tailscale-preview-url-unreachable': Object.freeze({
    id: 'tailscale-preview-url-unreachable',
    description: 'Real Tailscale preview URL is created but the served path is not reachable.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'tailscale_preview_url_unreachable',
  }),
  'tailscale-preview-wrong-deployment': Object.freeze({
    id: 'tailscale-preview-wrong-deployment',
    description: 'Real Tailscale preview URL serves content that does not match the run-scoped nginx deployment marker.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'tailscale_preview_wrong_deployment',
  }),
  'tailscale-unavailable': Object.freeze({
    id: 'tailscale-unavailable',
    description: 'Real final preview blocks when Tailscale operator/IngressClass/preview URL is unavailable.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'tailscale_unavailable',
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
  'redis-transport-policy-failure': Object.freeze({
    id: 'redis-transport-policy-failure',
    description: 'Real pipeline Redis transport policy failure blocks the run before Buster dispatch can proceed.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: null,
    expectedEvidence: 'redis_transport_policy_failure',
  }),
  'discord-unavailable': Object.freeze({
    id: 'discord-unavailable',
    description: 'Real Discord delivery failure must not produce a clean verified run.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'discord_unavailable',
  }),
  'discord-webhook-missing': Object.freeze({
    id: 'discord-webhook-missing',
    description: 'Missing production Discord webhook must become typed degraded evidence, not silent clean success.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'discord_webhook_missing',
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
  'registry-credentials-missing': Object.freeze({
    id: 'registry-credentials-missing',
    description: 'Real manifest validation fails when a private registry image lacks imagePullSecrets.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'registry_credentials_missing',
  }),
  'tailscale-preview-credentials-missing': Object.freeze({
    id: 'tailscale-preview-credentials-missing',
    description: 'Real final-preview validation fails when required Tailscale preview credentials are absent.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'tailscale_preview_credentials_missing',
  }),
  'required-env-missing': Object.freeze({
    id: 'required-env-missing',
    description: 'Real manifest validation fails when a required runtime environment variable is absent.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'required_env_missing',
  }),
  'git-credential-failure': Object.freeze({
    id: 'git-credential-failure',
    description: 'Real Git sync fails when push authentication is unavailable.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'git_credential_failure',
  }),
  'git-remote-push-failure': Object.freeze({
    id: 'git-remote-push-failure',
    description: 'Real Git sync fails when the configured remote cannot be reached during push.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'git_remote_push_failure',
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
    description: 'Real pipeline review generator times out and halts with a typed generator failure contract.',
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
    cancelAfterMs: Number(process.env.REAL_E2E_CANCEL_AFTER_MS || 2500),
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
  'multi-module-retry-unlocks-dependent': Object.freeze({
    id: 'multi-module-retry-unlocks-dependent',
    description: 'Module 01 fails once, retries successfully, and unlocks dependent module 02.',
    expectedPipelineExit: 'zero',
    approvalDecision: 'approve',
    expectedEvidence: 'multi_module_retry_unlocks_dependent',
  }),
  'multi-module-concurrency-stress': Object.freeze({
    id: 'multi-module-concurrency-stress',
    description: 'One independent module retries while another succeeds, then shared final Buster fails for one-module evidence.',
    expectedPipelineExit: 'nonzero',
    approvalDecision: 'approve',
    expectedEvidence: 'multi_module_final_gate_one_module_failure',
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
  'crash-during-retry-cycle': Object.freeze({
    id: 'crash-during-retry-cycle',
    description: 'Real pipeline crashes after retry scheduling and resumes into the next Forge attempt.',
    expectedPipelineExit: 'zero',
    approvalDecision: 'approve',
    expectedEvidence: 'success_after_crash_resume_retry',
    crashResume: true,
    crashPoint: 'during_retry_cycle',
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

const FULL_FAILURE_MATRIX = Object.freeze([
  'approval-deny',
  'approval-commentary',
  'approval-timeout-block',
  'approval-timeout-continue',
  'buster-module-failure',
  'buster-module-infra-failure',
  'retry-budget-exhausted',
  'retry-fix-malformed-output',
  'retry-buster-pass-echo-rejects',
  'retry-stale-forge-output',
  'retry-reuses-previous-success-artifact',
  'needs-nova-code-failure',
  'forge-spawn-gateway-failure',
  'forge-malformed-output',
  'architecture-validator-block',
  'architecture-validator-config-contract-failure',
  'pipeline-review-config-contract-failure',
  'echo-gate-config-failure',
  'echo-malformed-output',
  'buster-invalid-completion-identity',
  'buster-missing-output-file',
  'buster-gate-failure',
  'namespace-lease-denied',
  'k8s-pod-never-ready',
  'tailscale-ingress-creation-failure',
  'tailscale-preview-url-unreachable',
  'tailscale-preview-wrong-deployment',
  'tailscale-unavailable',
  'pipeline-summary-failure',
  'redis-unavailable',
  'redis-transport-policy-failure',
  'discord-unavailable',
  'discord-webhook-missing',
  'k8s-context-invalid',
  'registry-pull-failure',
  'registry-credentials-missing',
  'tailscale-preview-credentials-missing',
  'required-env-missing',
  'git-credential-failure',
  'git-remote-push-failure',
  'git-non-fast-forward',
  'git-merge-conflict',
  'git-commit-failure',
  'git-dirty-worktree-preserved',
  'forge-timeout',
  'buster-module-timeout',
  'echo-gate-timeout',
  'final-review-timeout',
  'pipeline-review-timeout',
  'pipeline-cancelled',
  'multi-module-independent-success',
  'multi-module-dependent-success',
  'multi-module-dependency-blocked',
  'multi-module-retry-unlocks-dependent',
  'multi-module-concurrency-stress',
  'crash-before-buster-handoff',
  'crash-after-buster-task-enqueue',
  'crash-during-buster-wait',
  'crash-after-failed-gate-before-retry',
  'crash-during-retry-cycle',
  'crash-during-git-operation',
  'crash-after-final-review-before-summary',
  'crash-during-cleanup',
  'git-cleanup-failure',
]);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function failUnitCommand(message) {
  const escaped = String(message).replace(/'/g, "'\"'\"'");
  return `node -e 'console.error("${escaped}"); process.exit(1)'`;
}

function failOnceUnitCommand() {
  const code = [
    'const fs=require("fs")',
    'const path=require("path")',
    'const marker=path.join(process.cwd(),".swarm","logs","real-e2e-retry-marker.txt")',
    'fs.mkdirSync(path.dirname(marker),{recursive:true})',
    'if(!fs.existsSync(marker)){fs.writeFileSync(marker,"REAL_E2E_EXPECTED_RETRYABLE_FORGE_CODE_FAILURE\\n");console.error("REAL_E2E_EXPECTED_RETRYABLE_FORGE_CODE_FAILURE");process.exit(1)}',
    'console.log("REAL_E2E_RETRY_RECOVERED")',
  ].join(';');
  return `node -e '${code}'`;
}

function failFirstAttemptsUnitCommand(failures) {
  const code = [
    'const fs=require("fs")',
    'const path=require("path")',
    'const marker=path.join(process.cwd(),".swarm","logs","real-e2e-multi-retry-count.txt")',
    'fs.mkdirSync(path.dirname(marker),{recursive:true})',
    'const count=fs.existsSync(marker)?Number(fs.readFileSync(marker,"utf8")):0',
    'const next=count+1',
    'fs.writeFileSync(marker,String(next))',
    `if(next<=${Number(failures)}){const failure="REAL_E2E_EXPECTED_MULTI_RETRY_FORGE_CODE_FAILURE_ATTEMPT_"+next;console.error(failure);process.exit(1)}`,
    'console.log("REAL_E2E_MULTI_RETRY_RECOVERED")',
  ].join(';');
  return `node -e '${code}'`;
}

function requireScenario(id) {
  const scenario = SCENARIOS[id];
  if (!scenario) {
    throw new Error(`unknown real E2E scenario: ${id}`);
  }
  return scenario;
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

function configureSecondModule(progress, { dependsOn = [], testCommand = null } = {}) {
  const first = moduleConfig(progress);
  const second = cloneJson(first);
  second.title = 'Second real nginx fixture through Forge, Buster, and Kubernetes preview';
  second.dir = '02-nginx';
  second.depends_on = [...dependsOn];
  if (testCommand) second.test_config.unit.test_cmd = testCommand;
  progress.modules['02-nginx'] = second;
  progress.execution_order = [
    '01-nginx',
    '02-nginx',
    'gate:module-review',
    'gate:operator-approval',
    'gate:final-buster',
    'gate:final-review',
  ];
  progress.real_e2e.multi_module = {
    modules: ['01-nginx', '02-nginx'],
    dependencies: {
      '01-nginx': [],
      '02-nginx': [...dependsOn],
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

export function listFullFailureMatrixScenarioIds() {
  return [...FULL_FAILURE_MATRIX];
}

export function resolveRealE2EScenario(id = 'success') {
  return requireScenario(id || 'success');
}

export function applyRealE2EScenario(progress, scenarioId) {
  const scenario = requireScenario(scenarioId);
  const next = cloneJson(progress);

  next.real_e2e = {
    ...(next.real_e2e || {}),
    scenario_id: scenario.id,
    scenario_description: scenario.description,
    expected_pipeline_exit: scenario.expectedPipelineExit,
    expected_evidence: scenario.expectedEvidence,
  };

  if (scenario.crashResume) {
    next.real_e2e.crash_injection = {
      point: scenario.crashPoint,
    };
  }

  if (scenario.id === 'approval-deny') {
    moveOperatorApprovalBeforeModules(next);
  }

  if (scenario.id === 'approval-timeout-block') {
    const gate = approvalGate(next);
    gate.on_timeout = 'block';
    gate.timeout_minutes = Number(process.env.REAL_E2E_APPROVAL_TIMEOUT_MINUTES || 0.02);
  }

  if (scenario.id === 'approval-timeout-continue') {
    const gate = approvalGate(next);
    gate.on_timeout = 'continue';
    gate.timeout_minutes = Number(process.env.REAL_E2E_APPROVAL_TIMEOUT_MINUTES || 0.02);
  }

  if (scenario.id === 'buster-module-failure') {
    const mod = moduleConfig(next);
    mod.test_config.unit.test_cmd = failUnitCommand('REAL_E2E_EXPECTED_BUSTER_MODULE_FAILURE');
  }

  if (scenario.id === 'buster-module-infra-failure') {
    const mod = moduleConfig(next);
    mod.test_config.serve.dockerfile = `${mod.test_config.serve.project_dir}/REAL_E2E_MISSING_DOCKERFILE`;
  }

  if (scenario.id === 'forge-retry-then-success') {
    const mod = moduleConfig(next);
    mod.max_fails = 2;
    mod.auto_retry_threshold = 1;
    mod.test_config.unit.test_cmd = failOnceUnitCommand();
  }

  if (scenario.id === 'crash-after-failed-gate-before-retry' || scenario.id === 'crash-during-retry-cycle') {
    const mod = moduleConfig(next);
    mod.max_fails = 2;
    mod.auto_retry_threshold = 1;
    mod.test_config.unit.test_cmd = failOnceUnitCommand();
  }

  if (scenario.id === 'forge-multi-retry-then-success') {
    const mod = moduleConfig(next);
    mod.max_fails = 3;
    mod.auto_retry_threshold = 2;
    mod.test_config.unit.test_cmd = failFirstAttemptsUnitCommand(2);
  }

  if (scenario.id === 'retry-budget-exhausted') {
    const mod = moduleConfig(next);
    mod.max_fails = 2;
    mod.auto_retry_threshold = 1;
    mod.test_config.unit.test_cmd = failUnitCommand('REAL_E2E_EXPECTED_RETRY_BUDGET_EXHAUSTED');
  }

  if (scenario.id === 'retry-fix-malformed-output') {
    const mod = moduleConfig(next);
    mod.max_fails = 2;
    mod.auto_retry_threshold = 1;
    mod.timeout_minutes = Number(process.env.REAL_E2E_RETRY_FIX_MALFORMED_TIMEOUT_MINUTES || 0.1);
    mod.test_config.unit.test_cmd = failOnceUnitCommand();
  }

  if (scenario.id === 'retry-stale-forge-output' || scenario.id === 'retry-reuses-previous-success-artifact') {
    const mod = moduleConfig(next);
    mod.max_fails = 2;
    mod.auto_retry_threshold = 1;
    mod.timeout_minutes = Number(process.env.REAL_E2E_RETRY_BAD_OUTPUT_TIMEOUT_MINUTES || 0.1);
    mod.test_config.unit.test_cmd = failOnceUnitCommand();
  }

  if (scenario.id === 'retry-buster-pass-echo-rejects') {
    const mod = moduleConfig(next);
    mod.max_fails = 2;
    mod.auto_retry_threshold = 1;
    mod.test_config.unit.test_cmd = failOnceUnitCommand();
    next.defaults = {
      ...(next.defaults || {}),
      reviewers: [],
    };
    const gate = next.gates?.['module-review'];
    if (!gate) throw new Error('real E2E progress must define module-review gate');
    gate.reviewers = [];
  }

  if (scenario.id === 'needs-nova-code-failure') {
    const mod = moduleConfig(next);
    mod.max_fails = 2;
    mod.auto_retry_threshold = 0;
    mod.test_config.unit.test_cmd = failUnitCommand('REAL_E2E_EXPECTED_NEEDS_NOVA_CODE_FAILURE');
  }

  if (scenario.id === 'forge-malformed-output') {
    const mod = moduleConfig(next);
    mod.timeout_minutes = Number(process.env.REAL_E2E_FORGE_MALFORMED_TIMEOUT_MINUTES || 0.1);
  }

  if (scenario.id === 'architecture-validator-block') {
    next.execution_order = ['REAL_E2E_EXPECTED_ARCH_VALIDATOR_UNKNOWN_MODULE', ...next.execution_order];
  }

  if (scenario.id === 'architecture-validator-config-contract-failure') {
    next.arch_validation = {
      ...(next.arch_validation || {}),
      timeout_minutes: -1,
    };
    next.real_e2e.scenario_description = 'Architecture validator config contract failure is reported before the run can be treated as successful.';
  }

  if (scenario.id === 'pipeline-review-config-contract-failure') {
    next.pipeline_review = {
      ...(next.pipeline_review || {}),
      timeout_minutes: -1,
    };
    next.real_e2e.scenario_description = 'Pipeline review config contract failure blocks a clean successful verification run.';
  }

  if (scenario.id === 'echo-gate-config-failure') {
    next.defaults = {
      ...(next.defaults || {}),
      reviewers: [],
    };
    const gate = next.gates?.['module-review'];
    if (!gate) throw new Error('real E2E progress must define module-review gate');
    gate.reviewers = [];
  }

  if (scenario.id === 'echo-malformed-output') {
    const gate = next.gates?.['module-review'];
    if (!gate) throw new Error('real E2E progress must define module-review gate');
    gate.timeout_minutes = Number(process.env.REAL_E2E_ECHO_MALFORMED_TIMEOUT_MINUTES || 0.1);
  }

  if (scenario.id === 'buster-invalid-completion-identity') {
    const mod = moduleConfig(next);
    mod.timeout_minutes = Number(process.env.REAL_E2E_BUSTER_IDENTITY_FAILURE_TIMEOUT_MINUTES || 0.1);
  }

  if (scenario.id === 'buster-gate-failure') {
    const gate = finalBusterGate(next);
    gate.test_config.unit.test_cmd = failUnitCommand('REAL_E2E_EXPECTED_BUSTER_GATE_FAILURE');
  }

  if (scenario.id === 'k8s-pod-never-ready') {
    const gate = finalBusterGate(next);
    gate.test_config.k8s.ready_timeout_seconds = 30;
  }

  if (scenario.id === 'namespace-lease-denied') {
    const gate = finalBusterGate(next);
    gate.test_config.k8s.namespace_prefix = 'prod';
  }

  if (scenario.id === 'tailscale-ingress-creation-failure') {
    const gate = finalBusterGate(next);
    gate.test_config.k8s.port = 70000;
  }

  if (scenario.id === 'tailscale-preview-url-unreachable') {
    const gate = finalBusterGate(next);
    gate.test_config.k8s.preview.path = '/real-e2e-unreachable';
  }

  if (scenario.id === 'tailscale-preview-wrong-deployment') {
    const gate = finalBusterGate(next);
    gate.test_config.k8s.preview.expected_text = 'REAL_E2E_EXPECTED_DIFFERENT_DEPLOYMENT_MARKER';
  }

  if (scenario.id === 'tailscale-unavailable') {
    const gate = finalBusterGate(next);
    gate.test_config.k8s.preview.provider = 'tailscale-ingress';
    gate.test_config.k8s.preview.hostname = `real-e2e-missing-operator-${Date.now()}`;
  }

  if (scenario.id === 'redis-unavailable') {
    next.real_e2e.intentional_config_failure = {
      component: 'redis',
      surface: 'transport',
      error_code: 'REDIS_CONNECTION_UNAVAILABLE',
    };
  }

  if (scenario.id === 'redis-transport-policy-failure') {
    next.real_e2e.intentional_config_failure = {
      component: 'redis',
      surface: 'transport_policy',
      error_code: 'SECURE_REDIS_TRANSPORT_POLICY_VIOLATION',
    };
  }

  if (scenario.id === 'k8s-context-invalid') {
    const gate = finalBusterGate(next);
    gate.test_config.k8s.namespace_prefix = 'test';
    next.real_e2e.intentional_config_failure = {
      component: 'kubernetes',
      surface: 'kubeconfig',
      error_code: 'KUBECONFIG_UNAVAILABLE',
    };
  }

  if (scenario.id === 'registry-credentials-missing') {
    const gate = finalBusterGate(next);
    gate.test_config.manifest.private_registries = ['registry.example.invalid/private'];
    gate.test_config.manifest.thresholds = {
      ...(gate.test_config.manifest.thresholds || {}),
      max_issues: 0,
    };
    next.real_e2e.intentional_config_failure = {
      component: 'registry',
      surface: 'image_pull_secrets',
      error_code: 'REGISTRY_IMAGE_PULL_SECRET_MISSING',
    };
  }

  if (scenario.id === 'tailscale-preview-credentials-missing') {
    const gate = finalBusterGate(next);
    gate.test_config.k8s.preview = {
      ...(gate.test_config.k8s.preview || {}),
      credentials_secret_name: 'real-e2e-missing-tailscale-preview-credentials',
      credentials_keys: ['client_id', 'client_secret'],
      reveal_credentials: true,
    };
    next.real_e2e.intentional_config_failure = {
      component: 'tailscale',
      surface: 'preview_credentials',
      error_code: 'TAILSCALE_PREVIEW_CREDENTIALS_MISSING',
    };
  }

  if (scenario.id === 'required-env-missing') {
    const gate = finalBusterGate(next);
    gate.test_config.manifest.required_env = ['REAL_E2E_REQUIRED_CONFIG_TOKEN'];
    next.real_e2e.intentional_config_failure = {
      component: 'manifest',
      surface: 'required_env',
      error_code: 'REQUIRED_ENV_MISSING',
    };
  }

  if (scenario.id === 'git-credential-failure') {
    next.real_e2e.intentional_git_failure = {
      component: 'git',
      surface: 'push_auth',
      error_code: 'GIT_PUSH_AUTH_FAILED',
    };
  }

  if (scenario.id === 'git-remote-push-failure') {
    next.real_e2e.intentional_git_failure = {
      component: 'git',
      surface: 'remote_push',
      error_code: 'GIT_REMOTE_PUSH_FAILED',
    };
  }

  if (scenario.id === 'git-non-fast-forward') {
    next.real_e2e.intentional_git_failure = {
      component: 'git',
      surface: 'non_fast_forward',
      error_code: 'GIT_PUSH_REJECTED',
    };
  }

  if (scenario.id === 'git-merge-conflict') {
    next.real_e2e.intentional_git_failure = {
      component: 'git',
      surface: 'merge_conflict',
      error_code: 'GIT_REBASE_CONFLICT',
    };
  }

  if (scenario.id === 'git-commit-failure') {
    next.real_e2e.intentional_git_failure = {
      component: 'git',
      surface: 'commit_index',
      error_code: 'GIT_COMMIT_FAILED',
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

  if (scenario.id === 'pipeline-review-timeout') {
    next.pipeline_review = {
      ...(next.pipeline_review || {}),
      timeout_minutes: Number(process.env.REAL_E2E_PIPELINE_REVIEW_TIMEOUT_MINUTES || 0.001),
    };
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
    mod.test_config.unit.test_cmd = failUnitCommand('REAL_E2E_EXPECTED_MULTI_MODULE_DEPENDENCY_BLOCKED');
  }

  if (scenario.id === 'multi-module-retry-unlocks-dependent') {
    configureSecondModule(next, { dependsOn: ['01-nginx'] });
    const mod = moduleConfig(next);
    mod.max_fails = 2;
    mod.auto_retry_threshold = 1;
    mod.test_config.unit.test_cmd = failOnceUnitCommand();
  }

  if (scenario.id === 'multi-module-concurrency-stress') {
    configureSecondModule(next);
    const mod = moduleConfig(next);
    mod.max_fails = 2;
    mod.auto_retry_threshold = 1;
    mod.test_config.unit.test_cmd = failOnceUnitCommand();
    const gate = finalBusterGate(next);
    gate.test_config.unit.test_cmd = failUnitCommand('REAL_E2E_EXPECTED_MULTI_MODULE_FINAL_GATE_MODULE_02_FAILURE');
  }

  return { progress: next, scenario };
}

export function applyRealE2EConfigScenario(config, scenarioId) {
  const scenario = requireScenario(scenarioId);
  const next = cloneJson(config);

  if (scenario.id === 'forge-spawn-gateway-failure') {
    next.agents = {
      ...(next.agents || {}),
      forge: {
        ...(next.agents?.forge || {}),
        dispatch: 'acp',
        acp_agent_id: 'real-e2e-missing-forge-agent',
      },
    };
  }

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

  if (scenario.id === 'discord-webhook-missing') {
    next.discord_webhook_url = '';
    next.discord = {
      ...(next.discord || {}),
      webhook_timeout_ms: 1000,
    };
  }

  return next;
}

export function buildRealE2EScenarioEnv(scenarioId) {
  const scenario = requireScenario(scenarioId);
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
  if (scenario.id === 'redis-transport-policy-failure') {
    return {
      REDIS_HOST: 'redis.real-e2e.invalid',
      REDIS_PORT: '6379',
      REDIS_PASSWORD: '',
      REDIS_TLS: '',
      REDIS_TLS_ENABLED: '',
      REDIS_NETWORK_ISOLATION: '',
    };
  }
  if (scenario.id === 'discord-unavailable') {
    return {
      DISCORD_WEBHOOK: 'http://127.0.0.1:1/real-e2e-discord-unavailable',
      DISCORD_WEBHOOK_URL: 'http://127.0.0.1:1/real-e2e-discord-unavailable',
    };
  }
  if (scenario.id === 'k8s-context-invalid') {
    return {
      KUBECONFIG: '/tmp/real-e2e-missing-kubeconfig',
    };
  }
  if (scenario.id === 'git-credential-failure') {
    return {
      GIT_TERMINAL_PROMPT: '0',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'remote.origin.url',
      GIT_CONFIG_VALUE_0: 'ssh://git@real-e2e-git-auth.invalid/repo.git',
      GIT_SSH_COMMAND: 'sh -c "echo Permission denied \\(publickey\\). >&2; exit 255"',
    };
  }
  if (scenario.id === 'git-remote-push-failure') {
    return {
      GIT_TERMINAL_PROMPT: '0',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'remote.origin.url',
      GIT_CONFIG_VALUE_0: 'ssh://git@real-e2e-git-remote.invalid/repo.git',
      GIT_SSH_COMMAND: 'sh -c "echo ssh: connect to host real-e2e-git-remote.invalid port 22: Network is unreachable >&2; exit 255"',
    };
  }
  if (scenario.id === 'git-non-fast-forward') {
    return {
      GIT_TERMINAL_PROMPT: '0',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'remote.origin.url',
      GIT_CONFIG_VALUE_0: 'ssh://git@real-e2e-git-rejected.invalid/repo.git',
      GIT_SSH_COMMAND: 'sh -c "echo ! \\[rejected\\] HEAD -> pipeline-code \\(non-fast-forward\\) >&2; echo error: failed to push some refs >&2; exit 1"',
    };
  }
  if (scenario.id === 'git-commit-failure') {
    return {
      GIT_INDEX_FILE: '/dev/null/real-e2e-index',
    };
  }
  return {};
}

export function applyRealE2EFileScenario({ projectSrc, scenarioId }) {
  const scenario = requireScenario(scenarioId);
  if (scenario.id === 'registry-pull-failure') {
    const dockerfilePath = path.join(projectSrc, 'Dockerfile');
    fs.writeFileSync(dockerfilePath, [
      'FROM registry-local.kubeclaw.svc.cluster.local:5001/real-e2e-intentional-missing-base:never',
      'COPY src/ /usr/share/nginx/html/',
      '',
    ].join('\n'));
    return;
  }

  if (scenario.id === 'registry-credentials-missing') {
    const deploymentPath = path.join(projectSrc, 'k8s', 'deployment.yaml');
    const current = fs.readFileSync(deploymentPath, 'utf8');
    const next = current.replace(
      '          image: real-pipeline-e2e-nginx:verification',
      '          image: registry.example.invalid/private/real-pipeline-e2e-nginx:verification',
    );
    if (next === current) {
      throw new Error(`could not inject private registry image into ${deploymentPath}`);
    }
    fs.writeFileSync(deploymentPath, next);
    return;
  }

  if (scenario.id !== 'k8s-pod-never-ready') return;

  const deploymentPath = path.join(projectSrc, 'k8s', 'deployment.yaml');
  const current = fs.readFileSync(deploymentPath, 'utf8');
  const next = current.replace(
    /readinessProbe:\n(\s+)httpGet:\n(\s+)path: \/\n(\s+)port: http/,
    'readinessProbe:\n$1httpGet:\n$2path: /real-e2e-intentional-not-ready\n$3port: http',
  );
  if (next === current) {
    throw new Error(`could not inject readiness failure into ${deploymentPath}`);
  }
  fs.writeFileSync(deploymentPath, next);
}
