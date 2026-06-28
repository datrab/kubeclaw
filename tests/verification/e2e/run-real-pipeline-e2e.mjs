#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { runCapabilityProbe } from './check-real-e2e-capabilities.mjs';
import {
  cleanupRealE2ERunWorkspace,
  createRealE2EGitCleanupBlocker,
  createRealE2ERunWorkspace,
  REPO_ROOT,
  summarizeWorkspace,
} from './real-run-workspace.mjs';
import { verifyExpectedFailureEvidence, verifyRealRunEvidence } from './real-run-evidence.mjs';
import { buildRealE2EScenarioEnv, listRealE2EScenarioIds, resolveRealE2EScenario } from './failure-scenarios.mjs';
import { malformedOutputScenarioConfig } from './malformed-output-publisher.mjs';
import {
  captureChildOutput,
  childOutputDiagnostics,
  createChildOutputCapture,
} from './bounded-output-capture.mjs';

const OPENCLAW_CONFIG_PATH = '/home/node/.openclaw/openclaw.json';
const RESULT_SCHEMA_VERSION = 'real_pipeline_e2e_result.v1';
const REAL_E2E_CRASH_EXIT_CODE = 86;

function parseArgs(argv) {
  const args = {
    mode: 'full',
    scenario: process.env.REAL_E2E_SCENARIO || 'success',
    capabilitiesOnly: false,
    keepArtifacts: process.env.REAL_E2E_KEEP_ARTIFACTS === '1',
    resultPath: process.env.REAL_E2E_RESULT_PATH || null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--mode') {
      args.mode = argv[++index] || '';
    } else if (arg === '--scenario') {
      args.scenario = argv[++index] || '';
    } else if (arg === '--capabilities-only') {
      args.capabilitiesOnly = true;
    } else if (arg === '--keep-artifacts') {
      args.keepArtifacts = true;
    } else if (arg === '--result-path') {
      args.resultPath = argv[++index] || '';
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!['fast', 'full'].includes(args.mode)) throw new Error('--mode must be fast or full');
  if (args.resultPath === '') throw new Error('--result-path requires a path');
  args.scenarioConfig = resolveRealE2EScenario(args.scenario);
  args.resultPath = path.resolve(args.resultPath || defaultResultPath(args));
  return args;
}

function usage() {
  return [
    'Usage: node tests/verification/e2e/run-real-pipeline-e2e.mjs --mode fast|full [--scenario <id>] [--capabilities-only] [--keep-artifacts] [--result-path <file>]',
    '',
    `Scenarios: ${listRealE2EScenarioIds().join(', ')}`,
    '',
  ].join('\n');
}

function safePathSegment(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'unknown';
}

function defaultResultPath(args) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(
    REPO_ROOT,
    '.swarm',
    'real-e2e',
    'results',
    `${stamp}-${process.pid}-${safePathSegment(args.mode)}-${safePathSegment(args.scenario)}.json`,
  );
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmpPath, filePath);
}

export function createResultRecord(args) {
  return {
    schema_version: RESULT_SCHEMA_VERSION,
    artifact_type: 'real_pipeline_e2e_result',
    created_at: new Date().toISOString(),
    updated_at: null,
    ok: false,
    exit_code: null,
    result_path: args.resultPath,
    mode: args.mode,
    scenario: {
      id: args.scenarioConfig.id,
      description: args.scenarioConfig.description || null,
      expected_pipeline_exit: args.scenarioConfig.expectedPipelineExit,
      expected_cleanup_ok: args.scenarioConfig.expectedCleanupOk !== false,
      approval_decision: args.scenarioConfig.approvalDecision ?? null,
      expected_evidence: args.scenarioConfig.expectedEvidence || null,
    },
    capability_probe: null,
    workspace: null,
    artifact_paths: null,
    pipeline: null,
    assertions: null,
    cleanup: null,
    diagnostics: null,
    phases: [],
    errors: [],
  };
}

export function writeResultRecord(resultPath, record) {
  const next = {
    ...record,
    updated_at: new Date().toISOString(),
  };
  writeJsonAtomic(resultPath, next);
  return next;
}

export function summarizeCleanupVerification(cleanup, { keepArtifacts = false, cleanupFailureObserved = false } = {}) {
  const steps = Array.isArray(cleanup?.steps) ? cleanup.steps : [];
  const step = (name) => steps.find((entry) => entry?.step === name) || null;
  const artifactRetained = step('artifact_root_retained');
  const artifactRemoved = step('artifact_root_remove');
  const gitBranchDelete = step('git_branch_delete');
  const gitBranchDeleteAfterBlocker = step('git_branch_delete_after_blocker_cleanup');
  const gitBranchOk = gitBranchDelete?.ok === true || (cleanupFailureObserved && gitBranchDeleteAfterBlocker?.ok === true);
  const surfaces = {
    redis: {
      ok: step('redis_run_keys_delete')?.ok === true,
      detail: step('redis_run_keys_delete')?.detail ?? null,
    },
    kubernetes: {
      ok: step('kubernetes_run_resources_delete')?.ok === true,
      detail: step('kubernetes_run_resources_delete')?.detail ?? null,
    },
    git_worktree: {
      ok: step('git_worktree_remove')?.ok === true,
      detail: step('git_worktree_remove')?.detail ?? null,
    },
    git_branch: {
      ok: gitBranchOk,
      detail: gitBranchDelete?.ok === true
        ? (gitBranchDelete.detail ?? null)
        : {
            first_delete: gitBranchDelete?.detail ?? null,
            recovered_by_blocker_cleanup: cleanupFailureObserved,
            retry_detail: gitBranchDeleteAfterBlocker?.detail ?? null,
          },
    },
  };
  const failedSurfaces = Object.entries(surfaces)
    .filter(([, surface]) => surface.ok !== true)
    .map(([name, surface]) => ({ surface: name, detail: surface.detail }));
  const artifactRetention = {
    retained: keepArtifacts,
    removed: artifactRemoved?.ok === true,
    diagnostic_only: keepArtifacts,
    path: artifactRetained?.detail || null,
    ok: keepArtifacts ? artifactRetained?.ok === true : artifactRemoved?.ok === true,
  };
  return {
    ok: failedSurfaces.length === 0 && artifactRetention.ok === true,
    infra_ok: failedSurfaces.length === 0,
    artifact_retention: artifactRetention,
    surfaces,
    failed_surfaces: failedSurfaces,
    cleanup_failure_observed: cleanupFailureObserved,
  };
}

export function artifactPathsForWorkspace(workspace) {
  if (!workspace) return null;
  return {
    artifact_root: workspace.artifactRoot,
    worktree: workspace.worktreePath,
    project_src: workspace.projectSrc,
    swarm_dir: workspace.swarmDir,
    swarm_config: workspace.runConfigPath,
    cleanup_manifest: workspace.cleanupManifestPath,
    progress: path.join(workspace.swarmDir, 'progress.json'),
    lifecycle_events: path.join(workspace.swarmDir, 'logs', 'pipeline', 'runs', workspace.runId, 'lifecycle', 'canonical-events.jsonl'),
    pipeline_events: path.join(workspace.swarmDir, 'logs', 'pipeline', 'pipeline.jsonl'),
    pipeline_summary: path.join(workspace.swarmDir, 'logs', 'pipeline', 'summary.json'),
    pipeline_latest: path.join(workspace.swarmDir, 'logs', 'pipeline', 'latest.json'),
    pipeline_review_json: path.join(workspace.swarmDir, 'logs', 'pipeline-review', 'PIPELINE-REVIEW.json'),
    pipeline_review_markdown: path.join(workspace.swarmDir, 'logs', 'pipeline-review', 'PIPELINE-REVIEW.md'),
    module_buster_output: path.join(workspace.swarmDir, 'modules', '01-nginx', 'buster-output.json'),
    final_buster_output: path.join(workspace.swarmDir, 'buster-test', 'FINAL-BUSTER-RESULT.json'),
    approval_decision: path.join(workspace.swarmDir, 'logs', 'gates', 'operator-approval', 'approval-decision.json'),
    module_echo_review: path.join(workspace.swarmDir, 'logs', 'echo-review', 'MODULE-REVIEW.json'),
    final_echo_review: path.join(workspace.swarmDir, 'logs', 'echo-review', 'FINAL-REVIEW.json'),
  };
}

function readOpenClawConfig() {
  if (!fs.existsSync(OPENCLAW_CONFIG_PATH)) return null;
  return JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
}

function resolveNovaChannel() {
  const openclawConfig = readOpenClawConfig();
  return process.env.REAL_E2E_NOVA_CHANNEL
    || process.env.REAL_E2E_DISCORD_TARGET
    || process.env.REAL_E2E_DISCORD_CHANNEL_ID
    || process.env.DISCORD_CHANNEL_ID
    || process.env.DISCORD_CHANNEL
    || openclawConfig?.verification?.real_e2e?.discord_target
    || null;
}

function waitForChild(child) {
  return new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

async function waitForChildWithTimeout(child, label, timeoutMs) {
  let timedOut = false;
  const result = await Promise.race([
    waitForChild(child),
    new Promise((resolve) => setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      resolve(null);
    }, timeoutMs)),
  ]);
  if (result) return { ...result, timed_out: false };
  const graceful = await Promise.race([
    waitForChild(child),
    new Promise((resolve) => setTimeout(() => resolve(null), 10000)),
  ]);
  if (graceful) return { ...graceful, timed_out: timedOut };
  process.stderr.write(`[${label}] forcing SIGKILL after pipeline timeout ${timeoutMs}ms\n`);
  child.kill('SIGKILL');
  const killed = await waitForChild(child);
  return { ...killed, timed_out: timedOut };
}

async function stopChild(child, label) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return { alreadyExited: true };
  child.kill('SIGTERM');
  const result = await Promise.race([
    waitForChild(child),
    new Promise((resolve) => setTimeout(() => resolve(null), 10000)),
  ]);
  if (result) return result;
  process.stderr.write(`[${label}] forcing SIGKILL after graceful stop timeout\n`);
  child.kill('SIGKILL');
  return waitForChild(child);
}

export function pipelineExitMatchesExpectation(exit, scenario) {
  if (scenario.expectedPipelineExit === 'zero') return exit.code === 0;
  if (scenario.expectedPipelineExit === 'nonzero') return exit.code !== 0 || exit.signal;
  throw new Error(`unsupported scenario expectedPipelineExit: ${scenario.expectedPipelineExit}`);
}

function failureOutputDiagnostic(matched, missingReason) {
  return {
    diagnostic_only: true,
    matched,
    reason: matched ? null : missingReason,
  };
}

export function diagnoseExpectedFailureOutput({ scenario, pipelineOutput }) {
  if (scenario.expectedPipelineExit !== 'nonzero') return failureOutputDiagnostic(true, null);
  const stdout = typeof pipelineOutput.stdout === 'string' ? pipelineOutput.stdout : pipelineOutput.stdout?.tail || '';
  const stderr = typeof pipelineOutput.stderr === 'string' ? pipelineOutput.stderr : pipelineOutput.stderr?.tail || '';
  const combined = `${stdout}\n${stderr}`;
  if (scenario.id === 'approval-deny') {
    const matched = /REJECTED|rejected|real-e2e-auto-deny|approval/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_APPROVAL_REJECTION');
  }
  if (scenario.id === 'approval-timeout-block') {
    const matched = /TIMED_OUT|timed out|timeout_block|Approval gate/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_APPROVAL_TIMEOUT_BLOCK');
  }
  if (scenario.id === 'buster-module-failure') {
    const matched = combined.includes('REAL_E2E_EXPECTED_BUSTER_MODULE_FAILURE') || /Buster.*FAIL|module.*FAIL/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_BUSTER_MODULE_FAILURE');
  }
  if (scenario.id === 'buster-module-infra-failure') {
    const matched = /REAL_E2E_MISSING_DOCKERFILE|serve\.dockerfile|Dockerfile|not found|invalid/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_BUSTER_MODULE_INFRA_FAILURE');
  }
  if (scenario.id === 'needs-nova-code-failure') {
    const matched = combined.includes('REAL_E2E_EXPECTED_NEEDS_NOVA_CODE_FAILURE') || /needs_nova|NEEDS_NOVA|Nova must intervene|REQUEST_HANDOFF/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_NEEDS_NOVA');
  }
  if (scenario.id === 'forge-spawn-gateway-failure') {
    const matched = /spawn_failed|gateway|real-e2e-missing-forge-agent|agent.*not.*found|unknown.*agent|session.*spawn/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_FORGE_SPAWN_GATEWAY_FAILURE');
  }
  if (scenario.id === 'forge-malformed-output') {
    const matched = /invalid_forge_completion|forge_completion.*invalid|completion artifact|artifact_type|invalid JSON/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_FORGE_MALFORMED_OUTPUT');
  }
  if (scenario.id === 'architecture-validator-block') {
    const matched = combined.includes('REAL_E2E_EXPECTED_ARCH_VALIDATOR_UNKNOWN_MODULE') || /ARCH_VALIDATION_BLOCKED|Architecture validation BLOCKED|EXEC_ORDER_MODULE_UNDEFINED/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_ARCHITECTURE_VALIDATOR_BLOCK');
  }
  if (scenario.id === 'architecture-validator-config-contract-failure') {
    const matched = /VALIDATOR_INTERNAL_ERROR|Architecture validator encountered an internal error|timeout_minutes/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_ARCHITECTURE_VALIDATOR_CONFIG_CONTRACT_FAILURE');
  }
  if (scenario.id === 'pipeline-review-config-contract-failure') {
    const matched = /Pipeline review failed|pipeline_review|config\.pipeline_review\.timeout_minutes|timeout_minutes/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_PIPELINE_REVIEW_CONFIG_CONTRACT_FAILURE');
  }
  if (scenario.id === 'echo-gate-config-failure') {
    const matched = /Review gate|module-review|No reviewers configured|REVIEW_GATE_CONFIG_INVALID|config_invalid|reviewer/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_ECHO_GATE_FAILURE');
  }
  if (scenario.id === 'echo-malformed-output') {
    const matched = /Review output must be valid JSON|invalid_contract|malformed JSON|Failed to read review output|Review invalid output/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_ECHO_MALFORMED_OUTPUT');
  }
  if (scenario.id === 'buster-invalid-completion-identity') {
    const matched = /completion.*identity|identity.*mismatch|completion-invalid|mismatch|target.*not.*reached|real-e2e-identity-mismatch/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_BUSTER_INVALID_COMPLETION_IDENTITY');
  }
  if (scenario.id === 'buster-missing-output-file') {
    const matched = /output_file|missing_required_identity|BUSTER_TASK_MALFORMED|dead.?letter|completion.*missing/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_BUSTER_MISSING_OUTPUT_FILE');
  }
  if (scenario.id === 'buster-gate-failure') {
    const matched = combined.includes('REAL_E2E_EXPECTED_BUSTER_GATE_FAILURE') || /final-buster|gate.*FAIL|Buster.*FAIL/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_BUSTER_GATE_FAILURE');
  }
  if (scenario.id === 'k8s-pod-never-ready') {
    const matched = /pod.*ready|condition=Ready|never.*ready|health/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_K8S_NOT_READY');
  }
  if (scenario.id === 'namespace-lease-denied') {
    const matched = /namespace_prefix|namespacePrefix|Invalid k8s namespace_prefix|expected one of|denied|forbidden/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_NAMESPACE_LEASE_DENIED');
  }
  if (scenario.id === 'tailscale-ingress-creation-failure') {
    const matched = /servicePort|70000|maximum|Tailscale|ingress|lease|invalid/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_TAILSCALE_INGRESS_CREATION_FAILURE');
  }
  if (scenario.id === 'tailscale-preview-url-unreachable') {
    const matched = /Preview URL|preview-health-check|curl|HTTP|404|unreachable|real-e2e-unreachable/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_TAILSCALE_PREVIEW_URL_UNREACHABLE');
  }
  if (scenario.id === 'tailscale-preview-wrong-deployment') {
    const matched = /Preview URL did not serve expected text|REAL_E2E_EXPECTED_DIFFERENT_DEPLOYMENT_MARKER|preview-health-check/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_TAILSCALE_PREVIEW_WRONG_DEPLOYMENT');
  }
  if (scenario.id === 'tailscale-unavailable') {
    const matched = /tailscale|previewUrl|preview_url|Ingress/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_TAILSCALE_UNAVAILABLE');
  }
  if (scenario.id === 'pipeline-summary-failure') {
    const matched = /Project Summary Failed|project_summary|generator:project_summary|registry resolution failed|stage owner|disabled/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_PIPELINE_SUMMARY_FAILURE');
  }
  if (scenario.id === 'redis-unavailable') {
    const matched = /Redis|ECONNREFUSED|Redis connection|REDIS_HOST|REDIS_PORT|Redis did not become ready/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_REDIS_UNAVAILABLE');
  }
  if (scenario.id === 'redis-transport-policy-failure') {
    const matched = /SECURE_REDIS_TRANSPORT_POLICY_VIOLATION|REDIS_PASSWORD|REDIS_TLS|REDIS_NETWORK_ISOLATION|Redis transport policy/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_REDIS_TRANSPORT_POLICY_FAILURE');
  }
  if (scenario.id === 'discord-unavailable') {
    const matched = /discord|webhook|ECONNREFUSED|delivery failed|127\.0\.0\.1:1/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_DISCORD_UNAVAILABLE');
  }
  if (scenario.id === 'discord-webhook-missing') {
    const matched = /discord|webhook|webhook_url_missing|discord_webhook_url/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_DISCORD_WEBHOOK_MISSING');
  }
  if (scenario.id === 'k8s-context-invalid') {
    const matched = /KUBECONFIG|real-e2e-missing-kubeconfig|namespace-lease|kubectl/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_K8S_CONTEXT_INVALID');
  }
  if (scenario.id === 'registry-pull-failure') {
    const matched = /registry-local|missing-base|image.*pull|pull access denied|manifest unknown|build.*failed|docker/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_REGISTRY_PULL_FAILURE');
  }
  if (scenario.id === 'registry-credentials-missing') {
    const matched = /imagePullSecrets|private registry|registry\.example\.invalid/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_REGISTRY_CREDENTIALS_MISSING');
  }
  if (scenario.id === 'tailscale-preview-credentials-missing') {
    const matched = /real-e2e-missing-tailscale-preview-credentials|secret-copy|preview credentials|tailscale/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_TAILSCALE_PREVIEW_CREDENTIALS_MISSING');
  }
  if (scenario.id === 'required-env-missing') {
    const matched = /REAL_E2E_REQUIRED_CONFIG_TOKEN|required env var|manifest/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_REQUIRED_ENV_MISSING');
  }
  return failureOutputDiagnostic(true, null);
}

export function realPipelineScenarioResultOk({
  scenario,
  pipelineExpectationMet,
  successEvidence = null,
  failureEvidence = null,
}) {
  if (scenario.expectedPipelineExit === 'zero') {
    return pipelineExpectationMet && successEvidence?.ok === true;
  }
  if (scenario.expectedPipelineExit === 'nonzero') {
    return pipelineExpectationMet
      && failureEvidence?.ok === true;
  }
  throw new Error(`unsupported scenario expectedPipelineExit: ${scenario.expectedPipelineExit}`);
}

async function runProductionPipeline({ workspace, mode, scenario }) {
  const novaChannel = resolveNovaChannel();
  if (!novaChannel) {
    return {
      ok: false,
      phase: 'pipeline-run',
      reason: 'INFRA_MISSING_DISCORD_TARGET',
      message: 'REAL_E2E_NOVA_CHANNEL, REAL_E2E_DISCORD_TARGET, REAL_E2E_DISCORD_CHANNEL_ID, or DISCORD_CHANNEL_ID is required for a real Nova pipeline run.',
    };
  }

  const env = {
    ...process.env,
    ...buildRealE2EScenarioEnv(scenario.id),
    REPO_ROOT: workspace.worktreePath,
    SWARM_CONFIG: workspace.runConfigPath,
    AGENT_NAME: 'buster-real-e2e',
    REAL_E2E_SCENARIO: scenario.id,
    ...(scenario.crashResume ? { REAL_E2E_ENABLE_CRASH_INJECTION: '1' } : {}),
  };
  const simulator = spawn(process.execPath, [
    path.join(REPO_ROOT, 'tests', 'verification', 'e2e', 'buster-simulator.mjs'),
    '--timeout-ms',
    String(Number(process.env.REAL_E2E_BUSTER_SIMULATOR_TIMEOUT_MS || (mode === 'fast' ? 20 * 60 * 1000 : 45 * 60 * 1000))),
  ], {
    cwd: REPO_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const simulatorOutput = captureChildOutput(simulator, { label: 'real-e2e-buster' });

  const approvalArgs = [
    path.join(REPO_ROOT, 'tests', 'verification', 'e2e', 'approval-operator.mjs'),
    '--state-path',
    path.join(workspace.swarmDir, 'operator-approval-gate-status.json'),
    '--decision',
    process.env.REAL_E2E_APPROVAL_DECISION || scenario.approvalDecision || 'approve',
    '--reason',
    process.env.REAL_E2E_APPROVAL_REASON || 'Approved by canonical real E2E operator controller.',
    '--timeout-ms',
    String(Number(process.env.REAL_E2E_APPROVAL_OPERATOR_TIMEOUT_MS || (mode === 'fast' ? 10 * 60 * 1000 : 20 * 60 * 1000))),
  ];
  const shouldRunApprovalOperator = scenario.approvalDecision !== null;
  const approvalOperator = shouldRunApprovalOperator ? spawn(process.execPath, approvalArgs, {
    cwd: REPO_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  }) : null;
  const approvalOutput = approvalOperator
    ? captureChildOutput(approvalOperator, { label: 'real-e2e-approval' })
    : createChildOutputCapture({ label: 'real-e2e-approval' });

  const malformedOutputPublisher = malformedOutputScenarioConfig(scenario.id) ? spawn(process.execPath, [
    path.join(REPO_ROOT, 'tests', 'verification', 'e2e', 'malformed-output-publisher.mjs'),
    '--scenario',
    scenario.id,
    '--swarm-dir',
    workspace.swarmDir,
    '--run-id',
    workspace.runId,
    '--project',
    workspace.projectName,
    '--timeout-ms',
    String(Number(process.env.REAL_E2E_MALFORMED_OUTPUT_PUBLISHER_TIMEOUT_MS || (mode === 'fast' ? 10 * 60 * 1000 : 20 * 60 * 1000))),
  ], {
    cwd: REPO_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  }) : null;
  const malformedOutputPublisherOutput = malformedOutputPublisher
    ? captureChildOutput(malformedOutputPublisher, { label: 'real-e2e-malformed-output' })
    : createChildOutputCapture({ label: 'real-e2e-malformed-output' });

  const pipelineTimeoutMs = Number(process.env.REAL_E2E_PIPELINE_TIMEOUT_MS || (mode === 'fast' ? 45 * 60 * 1000 : 2 * 60 * 60 * 1000));

  const pipelineAttempts = [];
  const spawnPipelineAttempt = ({ resume = false, label = 'real-e2e-nova' } = {}) => {
    const args = [
      path.join(REPO_ROOT, 'skills', 'nova', 'pipeline.ts'),
      '--project',
      workspace.projectName,
      '--repo',
      workspace.worktreePath,
      '--nova-channel',
      novaChannel,
      '--model',
      process.env.REAL_E2E_MODEL || 'gpt-5-codex',
      '--thinking',
      process.env.REAL_E2E_THINKING || 'adaptive',
    ];
    if (resume) args.push('--resume');
    const child = spawn(process.execPath, args, {
      cwd: workspace.worktreePath,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const output = captureChildOutput(child, { label });
    const attempt = { label, resume, child, output, exit: null };
    pipelineAttempts.push(attempt);
    return attempt;
  };

  const firstPipelineAttempt = spawnPipelineAttempt({
    resume: false,
    label: scenario.crashResume ? 'real-e2e-nova-crash' : 'real-e2e-nova',
  });
  const cancellationTimer = scenario.cancelAfterMs
    ? setTimeout(() => {
      firstPipelineAttempt.child.kill('SIGTERM');
    }, scenario.cancelAfterMs)
    : null;
  firstPipelineAttempt.exit = await waitForChildWithTimeout(firstPipelineAttempt.child, firstPipelineAttempt.label, pipelineTimeoutMs);
  if (cancellationTimer) clearTimeout(cancellationTimer);
  let pipelineExit = firstPipelineAttempt.exit;
  let pipelineOutput = firstPipelineAttempt.output;
  let crashResume = null;
  if (scenario.crashResume) {
    const initialCrashObserved = firstPipelineAttempt.exit?.code === REAL_E2E_CRASH_EXIT_CODE;
    crashResume = {
      enabled: true,
      point: scenario.crashPoint || null,
      expected_initial_exit_code: REAL_E2E_CRASH_EXIT_CODE,
      initial_exit: firstPipelineAttempt.exit,
      initial_crash_observed: initialCrashObserved,
      resumed: false,
      resume_exit: null,
    };
    if (initialCrashObserved) {
      const resumePipelineAttempt = spawnPipelineAttempt({ resume: true, label: 'real-e2e-nova-resume' });
      resumePipelineAttempt.exit = await waitForChildWithTimeout(resumePipelineAttempt.child, resumePipelineAttempt.label, pipelineTimeoutMs);
      pipelineExit = resumePipelineAttempt.exit;
      pipelineOutput = resumePipelineAttempt.output;
      crashResume = {
        ...crashResume,
        resumed: true,
        resume_exit: resumePipelineAttempt.exit,
      };
    }
  }
  const simulatorStop = await stopChild(simulator, 'real-e2e-buster');
  const approvalStop = await stopChild(approvalOperator, 'real-e2e-approval');
  const malformedOutputPublisherStop = await stopChild(malformedOutputPublisher, 'real-e2e-malformed-output');
  const pipelineExpectationMet = (scenario.crashResume
    ? crashResume?.initial_crash_observed === true && crashResume?.resumed === true && pipelineExitMatchesExpectation(pipelineExit, scenario)
    : pipelineExitMatchesExpectation(pipelineExit, scenario));
  const failureOutputDiagnostic = diagnoseExpectedFailureOutput({ scenario, pipelineOutput });
  const evidence = pipelineExit.code === 0
    ? await verifyRealRunEvidence(workspace, { mode, scenario })
    : null;
  const failureEvidence = scenario.expectedPipelineExit === 'nonzero'
    ? await verifyExpectedFailureEvidence(workspace, scenario)
    : null;
  const ok = realPipelineScenarioResultOk({
    scenario,
    pipelineExpectationMet,
    successEvidence: evidence,
    failureEvidence,
  });
  return {
    ok,
    phase: 'pipeline-run',
    mode,
    scenario: scenario.id,
    expected_pipeline_exit: scenario.expectedPipelineExit,
    crash_resume: crashResume,
    pipeline_expectation_met: pipelineExpectationMet,
    failure_output_diagnostic: failureOutputDiagnostic,
    failure_evidence: failureEvidence,
    pipeline_exit: pipelineExit,
    simulator_stop: simulatorStop,
    approval_operator_stop: approvalStop,
    malformed_output_publisher_stop: malformedOutputPublisherStop,
    evidence,
    diagnostics: {
      pipeline: childOutputDiagnostics('real-e2e-nova', pipelineOutput),
      pipeline_attempts: pipelineAttempts.map((attempt) => ({
        label: attempt.label,
        resume: attempt.resume,
        exit: attempt.exit,
        diagnostics: childOutputDiagnostics(attempt.label, attempt.output),
      })),
      buster_simulator: childOutputDiagnostics('real-e2e-buster', simulatorOutput),
      approval_operator: childOutputDiagnostics('real-e2e-approval', approvalOutput),
      malformed_output_publisher: childOutputDiagnostics('real-e2e-malformed-output', malformedOutputPublisherOutput),
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let resultRecord = createResultRecord(args);
  const persist = (patch = {}) => {
    resultRecord = writeResultRecord(args.resultPath, {
      ...resultRecord,
      ...patch,
      phases: patch.phases || resultRecord.phases,
      errors: patch.errors || resultRecord.errors,
    });
    return resultRecord;
  };
  persist();
  try {
  if (args.help) {
    process.stdout.write(usage());
    return 0;
  }

  const capabilities = await runCapabilityProbe({ mode: args.mode });
  persist({
    capability_probe: capabilities,
    phases: [
      ...resultRecord.phases,
      { phase: 'capabilities', ok: capabilities.ok, completed_at: new Date().toISOString() },
    ],
  });
  if (!capabilities.ok) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      phase: 'capabilities',
      mode: args.mode,
      result_path: args.resultPath,
      failures: capabilities.failures,
      capabilities,
    }, null, 2)}\n`);
    persist({ ok: false, exit_code: 1 });
    return 1;
  }

  if (args.capabilitiesOnly) {
    process.stdout.write(`${JSON.stringify({
      ok: true,
      phase: 'capabilities',
      mode: args.mode,
      result_path: args.resultPath,
      capabilities,
    }, null, 2)}\n`);
    persist({ ok: true, exit_code: 0 });
    return 0;
  }

  let workspace = null;
  let runFailed = false;
  let runExitCode = 1;
  let runResultOk = false;
  try {
    workspace = await createRealE2ERunWorkspace({ mode: args.mode, scenarioId: args.scenarioConfig.id });
    const workspaceSummary = summarizeWorkspace(workspace);
    persist({
      workspace: workspaceSummary,
      artifact_paths: artifactPathsForWorkspace(workspace),
      phases: [
        ...resultRecord.phases,
        { phase: 'workspace-created', ok: true, completed_at: new Date().toISOString() },
      ],
    });
    process.stdout.write(`${JSON.stringify({
      ok: true,
      phase: 'workspace-created',
      result_path: args.resultPath,
      workspace: workspaceSummary,
    }, null, 2)}\n`);

    const runResult = await runProductionPipeline({ workspace, mode: args.mode, scenario: args.scenarioConfig });
    const pipelineResult = {
      ok: runResult.ok,
      phase: runResult.phase,
      mode: runResult.mode,
      scenario: runResult.scenario,
      expected_pipeline_exit: runResult.expected_pipeline_exit,
      crash_resume: runResult.crash_resume || null,
      pipeline_expectation_met: runResult.pipeline_expectation_met,
      pipeline_exit: runResult.pipeline_exit,
      simulator_stop: runResult.simulator_stop,
      approval_operator_stop: runResult.approval_operator_stop,
      malformed_output_publisher_stop: runResult.malformed_output_publisher_stop,
    };
    persist({
      pipeline: pipelineResult,
      assertions: {
        pipeline_expectation_met: runResult.pipeline_expectation_met,
        success_evidence: runResult.evidence,
        failure_evidence: runResult.failure_evidence,
        failure_output_diagnostic: runResult.failure_output_diagnostic,
      },
      diagnostics: runResult.diagnostics,
      phases: [
        ...resultRecord.phases,
        { phase: 'pipeline-run', ok: runResult.ok, completed_at: new Date().toISOString() },
      ],
    });
    process.stdout.write(`${JSON.stringify({
      ...runResult,
      result_path: args.resultPath,
      workspace: summarizeWorkspace(workspace),
    }, null, 2)}\n`);
    runFailed = !runResult.ok;
    runResultOk = runResult.ok;
    runExitCode = runResult.ok ? 0 : 1;
    if (runResult.ok && args.scenarioConfig.id === 'git-cleanup-failure') {
      const blockerPath = await createRealE2EGitCleanupBlocker(workspace);
      process.stdout.write(`${JSON.stringify({
        ok: true,
        phase: 'git-cleanup-failure-armed',
        result_path: args.resultPath,
        blocker_worktree: blockerPath,
        branch: workspace.branchName,
      }, null, 2)}\n`);
    }
  } finally {
    const keepArtifacts = args.keepArtifacts || runFailed;
    const cleanup = await cleanupRealE2ERunWorkspace(workspace, { keepArtifacts });
    const expectsCleanupFailure = args.scenarioConfig?.expectedCleanupOk === false;
    const cleanupFailureObserved = cleanup.ok === false
      && cleanup.steps.some((step) => step.step === 'git_branch_delete' && step.ok === false)
      && cleanup.steps.some((step) => step.step === 'git_branch_delete_after_blocker_cleanup' && step.ok === true);
    const cleanupVerification = summarizeCleanupVerification(cleanup, { keepArtifacts, cleanupFailureObserved });
    process.stdout.write(`${JSON.stringify({
      ok: expectsCleanupFailure ? cleanupFailureObserved : cleanup.ok,
      phase: 'cleanup',
      result_path: args.resultPath,
      keep_artifacts: keepArtifacts,
      expected_cleanup_ok: args.scenarioConfig?.expectedCleanupOk !== false,
      cleanup_failure_observed: cleanupFailureObserved,
      cleanup_verification: cleanupVerification,
      cleanup,
      workspace: summarizeWorkspace(workspace),
    }, null, 2)}\n`);
    if (expectsCleanupFailure) {
      runExitCode = runResultOk && cleanupFailureObserved ? 0 : 1;
    } else if (!cleanup.ok) {
      runExitCode = 1;
    }
    persist({
      ok: runExitCode === 0,
      exit_code: runExitCode,
      workspace: summarizeWorkspace(workspace),
      artifact_paths: artifactPathsForWorkspace(workspace),
      cleanup: {
        ok: expectsCleanupFailure ? cleanupFailureObserved : cleanup.ok,
        keep_artifacts: keepArtifacts,
        expected_cleanup_ok: args.scenarioConfig?.expectedCleanupOk !== false,
        cleanup_failure_observed: cleanupFailureObserved,
        cleanup_verification: cleanupVerification,
        cleanup,
      },
      phases: [
        ...resultRecord.phases,
        {
          phase: 'cleanup',
          ok: expectsCleanupFailure ? cleanupFailureObserved : cleanup.ok,
          completed_at: new Date().toISOString(),
        },
      ],
    });
  }
  return runExitCode;
  } catch (error) {
    persist({
      ok: false,
      exit_code: 1,
      errors: [
        ...resultRecord.errors,
        {
          reason: 'REAL_E2E_RUNNER_FAILED',
          error: error?.message || String(error),
        },
      ],
    });
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = await main();
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
