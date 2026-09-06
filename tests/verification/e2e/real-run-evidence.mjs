import { parseGateDecision } from '@kubeclaw/pipeline-test-gate-contract';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  realE2EScenarioSetupContract,
  validateRealE2EScenarioSetup,
} from './failure-scenarios.mjs';

const SPARK_MODEL = 'openai/gpt-5.3-codex-spark';
const RESULT_SCHEMA = 'real-production-pipeline-result.v2';
const EXPECTED_STAGES = Object.freeze([
  'architecture',
  'forge-01-nginx',
  'buster-01-nginx',
  'forge-02-nginx',
  'buster-02-nginx',
  'forge-03-nginx',
  'buster-03-nginx',
  'forge-04-nginx',
  'buster-04-nginx',
  'module-review',
  'operator-approval',
  'final-buster',
  'final-review',
  'summary',
]);
const EXPECTED_ROLES = Object.freeze({
  architecture: 'nova',
  'forge-01-nginx': 'forge',
  'buster-01-nginx': 'buster',
  'forge-02-nginx': 'forge',
  'buster-02-nginx': 'buster',
  'forge-03-nginx': 'forge',
  'buster-03-nginx': 'buster',
  'forge-04-nginx': 'forge',
  'buster-04-nginx': 'buster',
  'module-review': 'echo',
  'operator-approval': 'nova',
  'final-buster': 'buster',
  'final-review': 'echo',
  summary: 'nova',
});
const FAILURE_STAGE_BY_SCENARIO = Object.freeze({
  'approval-deny': 'operator-approval',
  'approval-timeout-block': 'operator-approval',
  'buster-module-failure': 'buster-01-nginx',
  'buster-module-infra-failure': 'buster-01-nginx',
  'needs-nova-code-failure': 'buster-01-nginx',
  'retry-budget-exhausted': 'buster-01-nginx',
  'retry-fix-malformed-output': 'forge-01-nginx',
  'retry-buster-pass-echo-rejects': 'module-review',
  'forge-malformed-output': 'forge-01-nginx',
  'discord-unavailable': null,
  'architecture-validator-block': 'architecture',
  'echo-malformed-output': 'module-review',
  'buster-invalid-completion-identity': 'buster-01-nginx',
  'buster-gate-failure': 'final-buster',
  'k8s-pod-never-ready': 'final-buster',
  'namespace-lease-denied': 'final-buster',
  'tailscale-exposure-url-unreachable': 'final-buster',
  'tailscale-exposure-wrong-content': 'final-buster',
  'pipeline-summary-failure': 'summary',
  'redis-unavailable': null,
  'k8s-context-invalid': 'final-buster',
  'registry-pull-failure': 'final-buster',
  'git-credential-failure': 'forge-01-nginx',
  'git-non-fast-forward': 'forge-01-nginx',
  'git-merge-conflict': 'forge-01-nginx',
  'git-commit-failure': 'forge-01-nginx',
  'forge-timeout': 'forge-01-nginx',
  'buster-module-timeout': 'buster-01-nginx',
  'echo-gate-timeout': 'module-review',
  'final-review-timeout': 'final-review',
  'pipeline-review-timeout': 'summary',
  'pipeline-cancelled': null,
  'multi-module-dependency-blocked': 'buster-01-nginx',
});
const BLOCKED_SCENARIOS = new Set([
  'approval-deny',
  'approval-timeout-block',
  'buster-module-infra-failure',
  'needs-nova-code-failure',
  'retry-budget-exhausted',
  'retry-buster-pass-echo-rejects',
  'architecture-validator-block',
  'buster-gate-failure',
  'namespace-lease-denied',
  'forge-timeout',
  'buster-module-timeout',
  'echo-gate-timeout',
  'final-review-timeout',
  'pipeline-review-timeout',
  'multi-module-dependency-blocked',
]);
const FAILURE_DIAGNOSTICS = Object.freeze({
  'architecture-validator-block': ['arch_validation_blocked'],
  'git-credential-failure': ['permission denied', 'git_credential'],
  'git-non-fast-forward': ['non-fast-forward'],
  'git-merge-conflict': ['git_rebase_conflict', 'merge conflict'],
  'git-commit-failure': ['pre-commit', 'git_commit'],
  'pipeline-cancelled': ['cancel'],
  'namespace-lease-denied': ['namespace', 'lease'],
  'registry-pull-failure': ['registry', 'pull'],
  'k8s-context-invalid': ['k8s', 'context'],
  'k8s-pod-never-ready': ['ready', 'timeout'],
  'tailscale-exposure-url-unreachable': ['tailscale', 'unreachable'],
  'tailscale-exposure-wrong-content': ['tailscale', 'deployment'],
});

function pathExists(filePath) {
  return fs.existsSync(filePath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonLines(filePath) {
  if (!pathExists(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function evidencePass(code, details = {}) {
  return { code, ok: true, ...details };
}

function evidenceFail(code, reason, details = {}) {
  return { code, ok: false, reason, ...details };
}

function artifactBlob(root, artifact) {
  const digest = String(artifact?.digest || '');
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) {
    throw new Error(`REAL_E2E_ARTIFACT_DIGEST_INVALID:${artifact?.artifactId || 'unknown'}`);
  }
  const hash = digest.slice('sha256:'.length);
  const file = path.join(root, 'blobs', 'sha256', hash.slice(0, 2), `${hash.slice(2)}.json`);
  const bytes = fs.readFileSync(file);
  const actual = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
  if (actual !== digest) throw new Error(`REAL_E2E_ARTIFACT_DIGEST_MISMATCH:${artifact.artifactId}`);
  return JSON.parse(bytes.toString('utf8'));
}

function effectRequestsAndReceipts(records) {
  const requests = new Map();
  const receipts = new Map();
  for (const record of records) {
    if (record?.entry?.type === 'requested') {
      requests.set(record.entry.request.idempotencyKey, record.entry.request);
    } else if (record?.entry?.type === 'completed') {
      receipts.set(record.entry.receipt.idempotencyKey, record.entry.receipt);
    }
  }
  return { requests, receipts };
}

function runRootFor(result) {
  return path.join(result.stateRoot, 'runs', String(result.runId).replaceAll(':', '_'));
}

function requireScenarioSetupContract(workspace, scenario) {
  try {
    const progress = readJson(path.join(workspace.swarmDir, 'progress.json'));
    const config = readJson(workspace.runConfigPath);
    validateRealE2EScenarioSetup({
      progress,
      config,
      projectSrc: workspace.projectSrc,
      swarmDir: workspace.swarmDir,
      scenarioId: scenario.id,
    });
    return evidencePass('v2_scenario_setup_contract', {
      scenario: scenario.id,
      expectedEvidence: scenario.expectedEvidence,
    });
  } catch (error) {
    return evidenceFail('v2_scenario_setup_contract', 'REAL_E2E_V2_SCENARIO_SETUP_INVALID', {
      scenario: scenario.id,
      failures: Array.isArray(error?.failures) ? error.failures : [],
      error: error?.message || String(error),
    });
  }
}

function downstreamStages(stageId) {
  if (stageId === null) return [];
  const index = EXPECTED_STAGES.indexOf(stageId);
  return index < 0 ? [] : EXPECTED_STAGES.slice(index + 1);
}

export function expectedFailureContractForScenario(scenario) {
  if (!Object.hasOwn(FAILURE_STAGE_BY_SCENARIO, scenario.id)) {
    throw new Error(`missing v2 failure contract for scenario: ${scenario.id}`);
  }
  const cancelled = scenario.id === 'pipeline-cancelled';
  const blocked = BLOCKED_SCENARIOS.has(scenario.id);
  return Object.freeze({
    schemaVersion: 'real-e2e-failure-expectation.v2',
    scenarioId: scenario.id,
    expectedEvidence: scenario.expectedEvidence,
    expectedStageId: FAILURE_STAGE_BY_SCENARIO[scenario.id],
    allowedRunEventTypes: Object.freeze(
      cancelled ? ['run.cancelled'] : blocked ? ['run.blocked', 'run.failed'] : ['run.failed'],
    ),
    allowedStageEventTypes: Object.freeze(
      cancelled
        ? ['stage.cancelled']
        : blocked
          ? ['stage.blocked', 'stage.failed']
          : ['stage.failed'],
    ),
    diagnosticTokens: Object.freeze(FAILURE_DIAGNOSTICS[scenario.id] ?? []),
    setup: realE2EScenarioSetupContract(scenario.id),
  });
}

export function verifyNativeSubagentToolPairs(events) {
  const starts = events.filter((event) => event?.type === 'agent.tool.started');
  const finishes = events.filter((event) => event?.type === 'agent.tool.finished');
  const errors = [];
  const startsById = new Map();
  const finishesById = new Map();
  const causalIdentity = (event) => ({
    sessionId: event.session_id ?? event.session_key ?? null,
    modelCallId: event.model_call_id ?? null,
    workId: event.work_id ?? event.module_id ?? event.gate_id ?? null,
    attempt: event.attempt ?? null,
    dispatchId: event.dispatch_id ?? null,
  });
  for (const event of starts) {
    if (!event.tool_call_id) {
      errors.push({ reason: 'TOOL_CALL_ID_MISSING', type: event.type });
      continue;
    }
    if (startsById.has(event.tool_call_id)) errors.push({ reason: 'DUPLICATE_TOOL_START', toolCallId: event.tool_call_id });
    startsById.set(event.tool_call_id, event);
  }
  for (const event of finishes) {
    if (!event.tool_call_id) {
      errors.push({ reason: 'TOOL_CALL_ID_MISSING', type: event.type });
      continue;
    }
    const existing = finishesById.get(event.tool_call_id) ?? [];
    existing.push(event);
    finishesById.set(event.tool_call_id, existing);
  }
  for (const [toolCallId, start] of startsById) {
    const matches = finishesById.get(toolCallId) ?? [];
    if (matches.length !== 1) {
      errors.push({ reason: matches.length === 0 ? 'ORPHAN_TOOL_START' : 'DUPLICATE_TOOL_FINISH', toolCallId });
      continue;
    }
    const startIdentity = causalIdentity(start);
    const finishIdentity = causalIdentity(matches[0]);
    for (const field of Object.keys(startIdentity)) {
      if (startIdentity[field] === null || startIdentity[field] !== finishIdentity[field]) {
        errors.push({ reason: 'TOOL_PAIR_IDENTITY_MISMATCH', toolCallId, field });
      }
    }
  }
  for (const toolCallId of finishesById.keys()) {
    if (!startsById.has(toolCallId)) errors.push({ reason: 'ORPHAN_TOOL_FINISH', toolCallId });
  }
  return { ok: errors.length === 0, starts: starts.length, finishes: finishes.length, errors };
}

function canonicalResult(workspace, mode) {
  const resultPath = path.join(workspace.swarmDir, 'real-production-result.json');
  if (!pathExists(resultPath)) {
    const failure = evidenceFail('v2_canonical_result', 'REAL_E2E_V2_RESULT_MISSING', { path: resultPath });
    return { error: { ok: false, mode, checks: [failure], failures: [failure] } };
  }
  return { result: readJson(resultPath) };
}

export async function verifyRealRunEvidence(workspace, { mode = 'full' } = {}) {
  const loaded = canonicalResult(workspace, mode);
  if (loaded.error) return loaded.error;
  const { result } = loaded;
  const runRoot = runRootFor(result);
  const events = readJsonLines(path.join(runRoot, 'events.jsonl'));
  const effects = readJsonLines(path.join(runRoot, 'effects.jsonl'));
  const catalog = readJsonLines(path.join(result.artifactRoot, 'catalog.jsonl'));
  const progress = readJson(path.join(workspace.swarmDir, 'progress.json'));
  const { requests, receipts } = effectRequestsAndReceipts(effects);
  const stageFailures = EXPECTED_STAGES.filter((stageId) => result.stages?.[stageId] !== 'succeeded');
  const planEffects = [...requests.values()].filter((request) => request.capability === 'test.plan.execute');
  const runtimeEffects = [...requests.values()].filter((request) => request.capability === 'runtime.dispatch');
  const deliveries = readJsonLines(path.join(runRoot, 'observer-deliveries.jsonl'))
    .filter((record) => record?.entry?.observerId === 'kubeclaw.notification-observer:notifications');
  const discordReceipts = [...receipts].flatMap(([key, receipt]) => {
    const request = requests.get(key);
    return request?.capability === 'operator.request'
      && receipt?.status === 'completed'
      && receipt?.result?.accepted === true
      && typeof receipt?.result?.messageId === 'string'
      ? [receipt.result.messageId]
      : [];
  });
  const stageRoles = Object.fromEntries(events
    .filter((record) => record?.entry?.type === 'stage.started')
    .map((record) => [record.entry.identity?.stageId, record.entry.payload?.agentRole ?? null]));
  const roleMismatches = Object.entries(EXPECTED_ROLES)
    .filter(([stageId, role]) => stageRoles[stageId] !== role)
    .map(([stageId, role]) => ({ stageId, expected: role, actual: stageRoles[stageId] ?? null }));
  const artifacts = (namespace) => catalog
    .filter((artifact) => artifact.namespace === namespace)
    .map((artifact) => ({ artifact, value: artifactBlob(result.artifactRoot, artifact) }));
  const implementationArtifacts = artifacts('kubeclaw.implementation-agent');
  const gateArtifacts = artifacts('kubeclaw.buster-quality-gate');
  const testArtifacts = gateArtifacts.filter(({ artifact }) => artifact.producer.stageId.startsWith('buster-') && !artifact.artifactId.includes(':decision:'));
  const qualityArtifacts = gateArtifacts.filter(({ artifact }) => artifact.producer.stageId === 'final-buster' && !artifact.artifactId.includes(':decision:'));
  const decisionFor = (artifact) => {
    const matches = gateArtifacts.filter(item => item.artifact.producer.stageId === artifact.producer.stageId
      && item.artifact.producer.attemptNumber === artifact.producer.attemptNumber && item.artifact.artifactId.includes(':decision:'));
    if (matches.length !== 1) throw new Error('REAL_E2E_NATIVE_DECISION_MISSING_OR_AMBIGUOUS');
    const decision = parseGateDecision(matches[0].value);
    if (decision.runId !== result.runId) throw new Error('REAL_E2E_NATIVE_DECISION_RUN_MISMATCH');
    return decision;
  };
  const implementationFailures = implementationArtifacts.flatMap(({ artifact, value }) => {
    const changedPaths = Array.isArray(value?.changedPaths) ? value.changedPaths : [];
    const checksPassed = Array.isArray(value?.checks)
      && value.checks.length > 0
      && value.checks.every((check) => check?.passed === true);
    const mutationsExist = changedPaths.length > 0 && changedPaths.every((changedPath) => {
      const file = path.join(workspace.worktreePath, changedPath);
      return pathExists(file) && fs.readFileSync(file, 'utf8').includes(String(result.runId));
    });
    return value?.status === 'ready_for_testing'
      && value?.session?.termination === 'completed'
      && typeof value?.session?.sessionId === 'string'
      && /^[a-f0-9]{64}$/.test(String(value?.session?.transcriptDigest || ''))
      && checksPassed
      && mutationsExist
      ? []
      : [{ artifactId: artifact.artifactId, changedPaths, checksPassed, mutationsExist }];
  });
  const moduleBusterFailures = testArtifacts.flatMap(({ artifact, value }) => {
    try {
      const decision = decisionFor(artifact);
      return decision.state === 'passed' && value?.verdict?.outcome === 'passed'
        && value.decisionDigest === decision.decisionDigest ? [] : [{ artifactId: artifact.artifactId }];
    } catch (error) { return [{ artifactId: artifact.artifactId, error: String(error) }]; }
  });
  const requiredFinalSuites = ['security-headers', 'dependency-security', 'image-security',
    'kubernetes-policy-security', 'kubernetes-runtime-security'];
  const finalBusterFailures = qualityArtifacts.flatMap(({ artifact, value }) => {
    try {
      const decision = decisionFor(artifact);
      const nodeIds = new Set(decision.nodes.filter(node => ['passed', 'advisory_failure'].includes(node.effect)).map(node => node.nodeId));
      const missing = requiredFinalSuites.filter(suite => !nodeIds.has(suite));
      return decision.state === 'passed' && missing.length === 0 && value?.verdict?.outcome === 'passed'
        && value.decisionDigest === decision.decisionDigest ? [] : [{ artifactId: artifact.artifactId, missing }];
    } catch (error) { return [{ artifactId: artifact.artifactId, error: String(error) }]; }
  });
  const forgeCommitCount = String(result.gitLog || '').split('\n')
    .filter((line) => /\[forge:(?:01|02|03|04)-nginx\]/.test(line)).length;
  const branchPattern = `e2e-${String(result.runId).toLowerCase().replace(/[^a-z0-9-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 80)}-*`;
  const residualBranches = execFileSync('git', ['branch', '--list', branchPattern], {
    cwd: workspace.worktreePath,
    encoding: 'utf8',
  }).trim();
  const requiredArtifacts = [
    ['kubeclaw.architecture-validator', 1],
    ['kubeclaw.implementation-agent', 4],
    ['kubeclaw.buster-quality-gate', 10],
    ['kubeclaw.project-summary', 1],
  ];
  const checks = [
    result.schemaVersion === RESULT_SCHEMA
      ? evidencePass('v2_result_contract')
      : evidenceFail('v2_result_contract', 'REAL_E2E_V2_RESULT_CONTRACT_INVALID', { actual: result.schemaVersion ?? null }),
    result.status === 'succeeded'
      ? evidencePass('v2_pipeline_terminal_success', { runId: result.runId })
      : evidenceFail('v2_pipeline_terminal_success', 'REAL_E2E_V2_PIPELINE_NOT_SUCCEEDED', { status: result.status }),
    result.model === SPARK_MODEL
      ? evidencePass('v2_exact_spark_model', { model: result.model })
      : evidenceFail('v2_exact_spark_model', 'REAL_E2E_V2_MODEL_MISMATCH', { model: result.model }),
    stageFailures.length === 0
      ? evidencePass('v2_full_stage_topology', { stages: EXPECTED_STAGES })
      : evidenceFail('v2_full_stage_topology', 'REAL_E2E_V2_STAGE_FAILURES', { stages: stageFailures }),
    events.some((record) => record?.entry?.type === 'run.succeeded')
      ? evidencePass('v2_lifecycle_terminal')
      : evidenceFail('v2_lifecycle_terminal', 'REAL_E2E_V2_RUN_SUCCEEDED_EVENT_MISSING'),
    events.some((record) => record?.entry?.type === 'wait.created')
      && events.some((record) => record?.entry?.type === 'wait.resolved')
      ? evidencePass('v2_approval_wait_resume')
      : evidenceFail('v2_approval_wait_resume', 'REAL_E2E_V2_APPROVAL_EVIDENCE_MISSING'),
    planEffects.length >= 5
      ? evidencePass('v2_buster_plan_effects', { count: planEffects.length })
      : evidenceFail('v2_buster_plan_effects', 'REAL_E2E_V2_BUSTER_PLAN_EFFECTS_MISSING', { count: planEffects.length }),
    runtimeEffects.length >= 12
      ? evidencePass('v2_agent_effects', { count: runtimeEffects.length })
      : evidenceFail('v2_agent_effects', 'REAL_E2E_V2_AGENT_DISPATCH_EFFECTS_MISSING', { count: runtimeEffects.length }),
    deliveries.length >= EXPECTED_STAGES.length * 2
      ? evidencePass('v2_observer_delivery', { count: deliveries.length })
      : evidenceFail('v2_observer_delivery', 'REAL_E2E_V2_NOTIFICATION_DELIVERY_MISSING', { count: deliveries.length }),
    discordReceipts.length >= EXPECTED_STAGES.length * 2
      ? evidencePass('v2_discord_receipts', { messageIds: discordReceipts })
      : evidenceFail('v2_discord_receipts', 'REAL_E2E_V2_DISCORD_RECEIPTS_MISSING', { count: discordReceipts.length }),
    roleMismatches.length === 0
      ? evidencePass('v2_agent_roles', { roles: EXPECTED_ROLES })
      : evidenceFail('v2_agent_roles', 'REAL_E2E_V2_AGENT_ROLE_MISMATCH', { mismatches: roleMismatches }),
    implementationArtifacts.length === 4 && implementationFailures.length === 0
      ? evidencePass('v2_forge_evidence', { count: implementationArtifacts.length })
      : evidenceFail('v2_forge_evidence', 'REAL_E2E_V2_FORGE_EVIDENCE_INVALID', { failures: implementationFailures }),
    forgeCommitCount === 4 && residualBranches === ''
      ? evidencePass('v2_git_cleanup', { forgeCommitCount })
      : evidenceFail('v2_git_cleanup', 'REAL_E2E_V2_GIT_EVIDENCE_INVALID', { forgeCommitCount, residualBranches }),
    testArtifacts.length === 4 && moduleBusterFailures.length === 0
      ? evidencePass('v2_module_buster_evidence', { count: testArtifacts.length })
      : evidenceFail('v2_module_buster_evidence', 'REAL_E2E_V2_MODULE_BUSTER_EVIDENCE_INVALID', { failures: moduleBusterFailures }),
    qualityArtifacts.length === 1 && finalBusterFailures.length === 0
      ? evidencePass('v2_final_buster_evidence', { requiredFinalSuites })
      : evidenceFail('v2_final_buster_evidence', 'REAL_E2E_V2_FINAL_BUSTER_EVIDENCE_INVALID', { failures: finalBusterFailures }),
    ...requiredArtifacts.map(([namespace, minimum]) => {
      const count = catalog.filter((artifact) => artifact.namespace === namespace).length;
      return count >= minimum
        ? evidencePass(`v2_artifacts:${namespace}`, { count })
        : evidenceFail(`v2_artifacts:${namespace}`, 'REAL_E2E_V2_ARTIFACT_EVIDENCE_MISSING', { count, minimum });
    }),
  ];
  const failures = checks.filter((check) => !check.ok);
  return { ok: failures.length === 0, mode, checks, failures };
}

export async function verifyExpectedFailureEvidence(workspace, scenario) {
  const loaded = canonicalResult(workspace, 'failure');
  if (loaded.error) return loaded.error;
  const { result } = loaded;
  const events = readJsonLines(path.join(runRootFor(result), 'events.jsonl'));
  const contract = expectedFailureContractForScenario(scenario);
  const terminalIndex = events.findLastIndex((record) =>
    ['run.failed', 'run.blocked', 'run.cancelled'].includes(record?.entry?.type));
  const terminal = terminalIndex < 0 ? null : events[terminalIndex];
  const stageTerminal = contract.expectedStageId === null
    ? null
    : events.findLast((record) =>
      contract.allowedStageEventTypes.includes(record?.entry?.type)
      && record?.entry?.identity?.stageId === contract.expectedStageId);
  const failedAttempt = contract.expectedStageId === null
    ? null
    : events.findLast((record) =>
      ['attempt.completed', 'attempt.timed_out', 'attempt.cancelled'].includes(record?.entry?.type)
      && record?.entry?.identity?.stageId === contract.expectedStageId
      && record?.entry?.payload?.outcome !== 'passed');
  const causalStage = terminalIndex < 0
    ? null
    : events.slice(0, terminalIndex).findLast((record) =>
      ['stage.failed', 'stage.blocked', 'stage.cancelled'].includes(record?.entry?.type));
  const downstreamPasses = events
    .filter((record) =>
      record?.entry?.type === 'attempt.completed'
      && record?.entry?.payload?.outcome === 'passed'
      && downstreamStages(contract.expectedStageId).includes(record?.entry?.identity?.stageId))
    .map((record) => record.entry.identity.stageId);
  const diagnosticText = JSON.stringify({
    stage: stageTerminal?.entry?.payload ?? null,
    attempt: failedAttempt?.entry?.payload ?? null,
    run: terminal?.entry?.payload ?? null,
  }).toLowerCase();
  const matchedDiagnostics = contract.diagnosticTokens
    .filter((token) => diagnosticText.includes(token.toLowerCase()));
  const checks = [
    requireScenarioSetupContract(workspace, scenario),
    result.schemaVersion === RESULT_SCHEMA
      ? evidencePass('v2_failure_result_contract')
      : evidenceFail('v2_failure_result_contract', 'REAL_E2E_V2_RESULT_CONTRACT_INVALID', { actual: result.schemaVersion ?? null }),
    result.status !== 'succeeded'
      ? evidencePass('v2_expected_non_success', { status: result.status })
      : evidenceFail('v2_expected_non_success', 'REAL_E2E_UNEXPECTED_SUCCESS'),
    result.scenario?.id === contract.scenarioId
      && result.scenario?.expectedEvidence === contract.expectedEvidence
      ? evidencePass('v2_exact_failure_scenario')
      : evidenceFail('v2_exact_failure_scenario', 'REAL_E2E_V2_FAILURE_SCENARIO_MISMATCH'),
    terminal && contract.allowedRunEventTypes.includes(terminal.entry.type)
      ? evidencePass('v2_terminal_failure_event', { type: terminal.entry.type })
      : evidenceFail('v2_terminal_failure_event', 'REAL_E2E_V2_TERMINAL_FAILURE_EVENT_MISMATCH', {
        expected: contract.allowedRunEventTypes,
        actual: terminal?.entry?.type ?? null,
      }),
    contract.expectedStageId === null || stageTerminal
      ? evidencePass('v2_exact_failure_stage', { stageId: contract.expectedStageId })
      : evidenceFail('v2_exact_failure_stage', 'REAL_E2E_V2_FAILURE_STAGE_MISMATCH', { stageId: contract.expectedStageId }),
    contract.expectedStageId === null
      || (causalStage?.entry?.identity?.stageId === contract.expectedStageId
        && contract.allowedStageEventTypes.includes(causalStage?.entry?.type))
      ? evidencePass('v2_terminal_failure_causality')
      : evidenceFail('v2_terminal_failure_causality', 'REAL_E2E_V2_TERMINAL_CAUSE_MISMATCH'),
    contract.expectedStageId === null || failedAttempt
      ? evidencePass('v2_causal_failure_attempt')
      : evidenceFail('v2_causal_failure_attempt', 'REAL_E2E_V2_CAUSAL_FAILURE_ATTEMPT_MISSING'),
    downstreamPasses.length === 0
      ? evidencePass('v2_no_downstream_success')
      : evidenceFail('v2_no_downstream_success', 'REAL_E2E_V2_DOWNSTREAM_SUCCESS_AFTER_FAILURE', { stages: downstreamPasses }),
    contract.diagnosticTokens.length === 0 || matchedDiagnostics.length > 0
      ? evidencePass('v2_failure_diagnostic', { matched: matchedDiagnostics })
      : evidenceFail('v2_failure_diagnostic', 'REAL_E2E_V2_FAILURE_DIAGNOSTIC_MISMATCH', {
        expectedAny: contract.diagnosticTokens,
      }),
    result.model === SPARK_MODEL
      ? evidencePass('v2_exact_spark_model', { model: result.model })
      : evidenceFail('v2_exact_spark_model', 'REAL_E2E_V2_MODEL_MISMATCH', { model: result.model }),
  ];
  const failures = checks.filter((check) => !check.ok);
  return { ok: failures.length === 0, mode: 'failure', checks, failures };
}
