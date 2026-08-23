#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readReusedCapabilityProbeResult, runCapabilityProbe } from './check-real-e2e-capabilities.mjs';
import {
  buildRunConfig,
  cleanupRealE2ERunWorkspace,
  createRealE2EGitCleanupBlocker,
  createRealE2ERunWorkspace,
  DEFAULT_REAL_E2E_MODEL,
  DEFAULT_REAL_E2E_THINKING,
  applyRealE2EExecutionBoundary,
  normalizeRealE2ERuntimeDefaults,
  REPO_ROOT,
  summarizeWorkspace,
  validateRealE2EModel,
  writeRealE2ESwarmFiles,
} from './real-run-workspace.mjs';
import { verifyExpectedFailureEvidence, verifyRealRunEvidence } from './real-run-evidence.mjs';
import {
  applyRealE2EWorkspaceScenario,
  applyRealE2EScenario,
  assertScenarioMutationChannel,
  assertScenarioSetupChannel,
  buildRealE2EScenarioEnv,
  gitFaultForScenario,
  listRealE2EScenarioIds,
  resolveRealE2EScenario,
  validateRealE2EScenarioSetup,
} from './failure-scenarios.mjs';
import { malformedOutputScenarioConfig } from './malformed-output-publisher.mjs';
import {
  appendStreamCapture,
  captureChildOutput,
  childOutputDiagnostics,
  createChildOutputCapture,
} from './bounded-output-capture.mjs';
import {
  checkpointCaptureNames,
  restoreCheckpointProjectSource,
  startCheckpointCaptureController,
} from './checkpoints.mjs';
import { rateLimitCooldownDetails } from './rate-limit-output.mjs';

const OPENCLAW_CONFIG_PATH = '/home/node/.openclaw/openclaw.json';
const RESULT_SCHEMA_VERSION = 'real_pipeline_e2e_result.v2';
const REAL_E2E_CRASH_SIGNAL = 'SIGKILL';
const execFileAsync = promisify(execFile);
const DEFAULT_RATE_LIMIT_TIMEOUT_EXTENSION_MS = Number(
  process.env.REAL_E2E_RATE_LIMIT_TIMEOUT_EXTENSION_MS
    || process.env.REAL_E2E_MATRIX_RATE_LIMIT_TIMEOUT_EXTENSION_MS
    || 3 * 60 * 60 * 1000,
);
const DEFAULT_RATE_LIMIT_MAX_PAUSES = Number(process.env.REAL_E2E_RATE_LIMIT_MAX_PAUSES || 5);

function parseArgs(argv) {
  const args = {
    mode: 'full',
    scenario: process.env.REAL_E2E_SCENARIO || 'success',
    capabilitiesOnly: false,
    keepArtifacts: process.env.REAL_E2E_KEEP_ARTIFACTS === '1',
    resultPath: process.env.REAL_E2E_RESULT_PATH || null,
    restoreCheckpointDir: process.env.REAL_E2E_RESTORE_CHECKPOINT_DIR || null,
    restoreCheckpointName: process.env.REAL_E2E_RESTORE_CHECKPOINT_NAME || null,
    captureCheckpointRoot: process.env.REAL_E2E_CAPTURE_CHECKPOINT_ROOT || null,
    captureCheckpointSeedId: process.env.REAL_E2E_CAPTURE_CHECKPOINT_SEED_ID || 'canonical',
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
    } else if (arg === '--restore-checkpoint-dir') {
      args.restoreCheckpointDir = argv[++index] || '';
    } else if (arg === '--restore-checkpoint-name') {
      args.restoreCheckpointName = argv[++index] || '';
    } else if (arg === '--capture-checkpoint-root') {
      args.captureCheckpointRoot = argv[++index] || '';
    } else if (arg === '--capture-checkpoint-seed-id') {
      args.captureCheckpointSeedId = argv[++index] || '';
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!['fast', 'full'].includes(args.mode)) throw new Error('--mode must be fast or full');
  if (args.resultPath === '') throw new Error('--result-path requires a path');
  if (args.restoreCheckpointDir === '') throw new Error('--restore-checkpoint-dir requires a path');
  if (args.restoreCheckpointName === '') throw new Error('--restore-checkpoint-name requires a checkpoint name');
  if (args.captureCheckpointRoot === '') throw new Error('--capture-checkpoint-root requires a path');
  if (args.captureCheckpointSeedId === '') throw new Error('--capture-checkpoint-seed-id requires an id');
  if (args.restoreCheckpointDir && !args.restoreCheckpointName) {
    throw new Error('--restore-checkpoint-name is required with --restore-checkpoint-dir');
  }
  args.scenarioConfig = resolveRealE2EScenario(args.scenario);
  args.resultPath = path.resolve(args.resultPath || defaultResultPath(args));
  return args;
}

function usage() {
  return [
    'Usage: node tests/verification/e2e/run-real-pipeline-e2e.mjs --mode fast|full [--scenario <id>] [--capabilities-only] [--keep-artifacts] [--result-path <file>]',
    '       [--capture-checkpoint-root <dir> [--capture-checkpoint-seed-id <id>]]',
    '       [--restore-checkpoint-dir <dir> --restore-checkpoint-name <checkpoint>]',
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function execGit(args, options = {}) {
  return execFileAsync('git', args, {
    cwd: options.cwd || REPO_ROOT,
    encoding: 'utf8',
    timeout: options.timeout || 60000,
    maxBuffer: 4 * 1024 * 1024,
  });
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
    model: validateRealE2EModel(process.env.REAL_E2E_MODEL || DEFAULT_REAL_E2E_MODEL),
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
  const stepGroup = (name) => steps.filter((entry) => entry?.step === name);
  const stepDetail = (name) => {
    const entry = step(name);
    if (entry) return entry.detail ?? { reason: 'cleanup_step_detail_missing', step: name, ok: entry.ok === true };
    return { reason: 'cleanup_step_missing', step: name };
  };
  const groupedSurface = (name) => {
    const entries = stepGroup(name);
    return {
      ok: entries.length > 0 && entries.every((entry) => entry?.ok === true),
      detail: entries.length > 0
        ? entries.map((entry) => entry?.detail ?? { reason: 'cleanup_step_detail_missing', step: name, ok: entry?.ok === true })
        : [{ reason: 'cleanup_step_missing', step: name }],
    };
  };
  const artifactRetained = step('artifact_root_retained');
  const artifactRemoved = step('artifact_root_remove');
  const gitBranchDelete = step('git_branch_delete');
  const gitBranchDeleteAfterBlocker = step('git_branch_delete_after_blocker_cleanup');
  const gitArchitectureBranchDelete = step('git_architecture_branch_delete');
  const gitBranchOk = gitBranchDelete?.ok === true || (cleanupFailureObserved && gitBranchDeleteAfterBlocker?.ok === true);
  const surfaces = {
    kubernetes: {
      ok: step('kubernetes_run_resources_delete')?.ok === true,
      detail: stepDetail('kubernetes_run_resources_delete'),
    },
    git_worktree: {
      ok: step('git_worktree_remove')?.ok === true,
      detail: stepDetail('git_worktree_remove'),
    },
    git_branch: {
      ok: gitBranchOk && (gitArchitectureBranchDelete ? gitArchitectureBranchDelete.ok === true : true),
      detail: gitBranchDelete?.ok === true
        ? {
            run_branch: gitBranchDelete.detail ?? null,
            architecture_branch: gitArchitectureBranchDelete?.detail ?? null,
          }
        : {
            first_delete: gitBranchDelete?.detail ?? { reason: 'cleanup_step_missing', step: 'git_branch_delete' },
            recovered_by_blocker_cleanup: cleanupFailureObserved,
            retry_detail: gitBranchDeleteAfterBlocker?.detail ?? { reason: 'cleanup_step_missing', step: 'git_branch_delete_after_blocker_cleanup' },
            architecture_branch: gitArchitectureBranchDelete?.detail ?? { reason: 'cleanup_step_missing', step: 'git_architecture_branch_delete' },
          },
    },
    git_remote_branch: groupedSurface('git_remote_branch_delete'),
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

export function buildCleanupResult(cleanup, { keepArtifacts = false, expectsCleanupFailure = false } = {}) {
  const steps = Array.isArray(cleanup?.steps) ? cleanup.steps : [];
  const step = (name) => steps.find((entry) => entry?.step === name) || null;
  const firstGitDelete = step('git_branch_delete');
  const recoveredGitDelete = step('git_branch_delete_after_blocker_cleanup');
  const cleanupFailureObserved = cleanup?.ok === false
    && firstGitDelete?.ok === false
    && recoveredGitDelete?.ok === true;
  const verification = summarizeCleanupVerification(cleanup, { keepArtifacts, cleanupFailureObserved });
  if (expectsCleanupFailure) {
    return {
      ok: cleanupFailureObserved,
      code: cleanupFailureObserved ? 'git_cleanup_failed_recovered' : 'expected_git_cleanup_failure_missing',
      failure_class: cleanupFailureObserved ? 'git_cleanup_failed' : 'cleanup_contract_mismatch',
      cleanup_failure_observed: cleanupFailureObserved,
      verification,
    };
  }
  return {
    ok: cleanup?.ok === true && verification.ok === true,
    code: cleanup?.ok === true && verification.ok === true ? 'cleanup_succeeded' : 'cleanup_failed',
    failure_class: cleanup?.ok === true && verification.ok === true ? null : 'cleanup_failed',
    cleanup_failure_observed: cleanupFailureObserved,
    verification,
  };
}

function runnerErrorRecord(error) {
  const message = error?.message || String(error);
  if (/real E2E scenario setup contract failed/i.test(message)) {
    return {
      reason: 'REAL_E2E_SETUP_CONTRACT_FAILED',
      phase: 'scenario_setup',
      error: message,
      setup_failures: Array.isArray(error?.failures) ? error.failures : [],
    };
  }
  return {
    reason: 'REAL_E2E_RUNNER_FAILED',
    phase: 'runner',
    error: message,
  };
}

export function artifactPathsForWorkspace(workspace) {
  if (!workspace) return null;
  const progressPath = path.join(workspace.swarmDir, 'progress.json');
  return {
    artifact_root: workspace.artifactRoot,
    worktree: workspace.worktreePath,
    project_src: workspace.projectSrc,
    swarm_dir: workspace.swarmDir,
    swarm_config: workspace.runConfigPath,
    cleanup_manifest: workspace.cleanupManifestPath,
    progress: progressPath,
    v2_result: path.join(workspace.swarmDir, 'real-production-result.json'),
    v2_runtime: path.join(workspace.swarmDir, 'v2-runtime'),
    v2_artifacts: path.join(workspace.swarmDir, 'artifacts', 'v2'),
    runtime_results: path.join(workspace.worktreePath, '.swarm', 'runtime-results'),
  };
}

function stableResultArtifactRoot(args, workspace) {
  const resultBase = path.basename(args.resultPath || `${workspace?.runId || 'run'}-result.json`, '.json');
  return path.join(REPO_ROOT, '.swarm', 'real-e2e', 'results', 'artifacts', resultBase);
}

function copyResultArtifactFile(sourcePath, targetRoot, label) {
  if (!sourcePath || !fs.existsSync(sourcePath)) return null;
  const targetPath = path.join(targetRoot, `${safePathSegment(label)}${path.extname(sourcePath) || '.artifact'}`);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  return targetPath;
}

function copyResultArtifactValue(sourceValue, targetRoot, label) {
  if (!sourceValue || typeof sourceValue !== 'object' || Array.isArray(sourceValue)) {
    return copyResultArtifactFile(sourceValue, targetRoot, label);
  }
  const copied = {};
  for (const [key, value] of Object.entries(sourceValue)) {
    const copiedPath = copyResultArtifactFile(value, targetRoot, `${label}-${key}`);
    if (copiedPath) copied[key] = copiedPath;
  }
  return Object.keys(copied).length > 0 ? copied : null;
}

function copyResultArtifactDirectory(sourcePath, targetRoot, label) {
  if (!sourcePath || !fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isDirectory()) return null;
  const targetPath = path.join(targetRoot, safePathSegment(label));
  fs.cpSync(sourcePath, targetPath, { recursive: true, force: true });
  return targetPath;
}

export function snapshotResultArtifacts({ args, workspace }) {
  if (!workspace) return null;
  const sourcePaths = artifactPathsForWorkspace(workspace);
  const bundleRoot = stableResultArtifactRoot(args, workspace);
  fs.rmSync(bundleRoot, { recursive: true, force: true });
  fs.mkdirSync(bundleRoot, { recursive: true });
  const copied = {};
  const missing = [];
  const copyLabels = [
    'progress',
    'v2_result',
  ];
  for (const label of copyLabels) {
    const copiedPath = copyResultArtifactValue(sourcePaths?.[label], bundleRoot, label);
    if (copiedPath) {
      copied[label] = copiedPath;
    } else {
      missing.push({ label, status: 'missing', source_path: sourcePaths?.[label] || null });
    }
  }
  for (const label of ['v2_runtime', 'v2_artifacts', 'runtime_results']) {
    const copiedPath = copyResultArtifactDirectory(sourcePaths?.[label], bundleRoot, label);
    if (copiedPath) copied[label] = copiedPath;
    else missing.push({ label, status: 'missing', source_path: sourcePaths?.[label] || null });
  }
  const manifest = {
    schema_version: 'real_e2e_result_artifact_bundle.v2',
    run_id: workspace.runId,
    project: workspace.projectName,
    created_at: new Date().toISOString(),
    authority: 'real-e2e-result-bundle',
    source_paths: sourcePaths,
    copied,
    missing,
  };
  writeJsonAtomic(path.join(bundleRoot, 'artifact-bundle.json'), manifest);
  return {
    authority: 'real-e2e-result-bundle',
    artifact_root: bundleRoot,
    ...copied,
    stable_bundle_root: bundleRoot,
    stable_bundle_manifest: path.join(bundleRoot, 'artifact-bundle.json'),
    stable_artifacts: copied,
    stable_missing_artifacts: missing,
    diagnostic_source_paths: sourcePaths,
  };
}

function readJsonIfPresent(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function safeCheckpointPoint(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function runLifecycleEventsPath(workspace) {
  return path.join(
    workspace.swarmDir,
    'v2-runtime',
    'runs',
    workspace.runId.replaceAll(':', '_'),
    'events.jsonl',
  );
}

function crashInjectionJournalPath(workspace) {
  return path.join(
    workspace.swarmDir,
    'v2-runtime',
    'runs',
    workspace.runId.replaceAll(':', '_'),
    'harness-crash-injections.jsonl',
  );
}

function v2LifecycleEntries(workspace) {
  return readJsonlIfPresent(runLifecycleEventsPath(workspace))
    .map((record) => record?.entry)
    .filter(Boolean);
}

function checkpointEventForPoint(workspace, requestedPoint) {
  const point = safeCheckpointPoint(requestedPoint);
  const events = v2LifecycleEntries(workspace);
  const match = (type, stageId = null, outcome = null) => events.findLast((event) =>
    event?.type === type
    && (stageId === null || event?.identity?.stageId === stageId)
    && (outcome === null || event?.payload?.outcome === outcome));
  const checkpoints = {
    before_buster_handoff: () => match('attempt.completed', 'forge-01-nginx', 'passed'),
    after_buster_task_enqueue: () => match('stage.started', 'buster-01-nginx'),
    during_buster_wait: () => match('attempt.dispatched', 'buster-01-nginx'),
    after_failed_gate_before_retry: () => match('stage.retrying'),
    during_git_operation: () => match('effect.requested', 'forge-01-nginx'),
    after_final_review_before_summary: () => match('attempt.completed', 'final-review', 'passed'),
    during_cleanup: () => match('run.succeeded'),
  };
  return checkpoints[point]?.() ?? null;
}

async function commitRestoredCheckpointWorkspace(workspace) {
  await execGit(['add', 'Projects'], { cwd: workspace.worktreePath });
  const status = (await execGit(['status', '--porcelain'], { cwd: workspace.worktreePath })).stdout.trim();
  if (status) {
    await execGit(['commit', '-m', `[real-e2e] Restore checkpoint for ${workspace.scenario.id}`, '--', 'Projects'], {
      cwd: workspace.worktreePath,
    });
  }
  await execGit(['branch', '-f', workspace.architectureBranchName, 'HEAD'], { cwd: workspace.worktreePath });
  await execGit(['push', '--force', 'origin', `${workspace.architectureBranchName}:${workspace.architectureBranchName}`], {
    cwd: workspace.worktreePath,
  });
  if (workspace.runBranchUpstreamName) {
    await execGit(['push', '--force', 'origin', `HEAD:${workspace.runBranchUpstreamName}`], {
      cwd: workspace.worktreePath,
    });
  }
}

async function restoreCheckpointWorkspace({ workspace, args }) {
  const restored = restoreCheckpointProjectSource({
    checkpointDir: path.resolve(args.restoreCheckpointDir),
    checkpoint: args.restoreCheckpointName,
    workspace,
    scenarioId: args.scenarioConfig.id,
  });
  const progressPath = path.join(workspace.swarmDir, 'progress.json');
  const normalizedProgress = normalizeRealE2ERuntimeDefaults(readJson(progressPath), { scenarioId: args.scenarioConfig.id });
  applyRealE2EExecutionBoundary(normalizedProgress);
  const { progress } = applyRealE2EScenario(
    normalizedProgress,
    args.scenarioConfig.id,
  );
  applyRealE2EWorkspaceScenario({ projectSrc: workspace.projectSrc, progress, scenarioId: args.scenarioConfig.id });
  writeJsonAtomic(progressPath, progress);
  writeRealE2ESwarmFiles(workspace.swarmDir, progress);
  const runConfig = buildRunConfig({
    runId: workspace.runId,
    worktreePath: workspace.worktreePath,
    scenarioId: args.scenarioConfig.id,
  });
  writeJsonAtomic(workspace.runConfigPath, runConfig);
  validateRealE2EScenarioSetup({
    progress,
    config: runConfig,
    projectSrc: workspace.projectSrc,
    swarmDir: workspace.swarmDir,
    scenarioId: args.scenarioConfig.id,
  });
  await commitRestoredCheckpointWorkspace(workspace);
  return restored;
}

function readJsonlIfPresent(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    return fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function writeExternalCrashMarker({ workspace, scenario, checkpoint }) {
  const point = safeCheckpointPoint(scenario.crashPoint);
  const markerPath = path.join(
    workspace.swarmDir,
    'v2-runtime',
    'runs',
    workspace.runId.replaceAll(':', '_'),
    'harness-crash-injections',
    `${point}.json`,
  );
  writeJsonAtomic(markerPath, {
    schema_version: 'real_e2e_crash_injection.v2',
    artifact_type: 'real_e2e_crash_injection',
    point,
    requested_point: scenario.crashPoint,
    run_id: workspace.runId,
    project: workspace.projectName,
    scenario: scenario.id,
    crashed_at: new Date().toISOString(),
    signal: REAL_E2E_CRASH_SIGNAL,
    trigger: 'external_e2e_harness',
    checkpoint_event_id: checkpoint?.eventId || null,
    details: checkpoint?.payload || {},
  });
  return markerPath;
}

function appendExternalCrashEvent({ workspace, scenario, checkpoint }) {
  const eventsPath = crashInjectionJournalPath(workspace);
  fs.mkdirSync(path.dirname(eventsPath), { recursive: true });
  const details = checkpoint?.payload || {};
  const event = {
    schemaVersion: 'real-e2e-crash-injection.v2',
    eventId: `event-real-e2e-crash-${process.pid}-${Date.now()}`,
    type: 'real_e2e.crash_injected',
    occurredAt: new Date().toISOString(),
    identity: {
      runId: workspace.runId,
      stageId: checkpoint?.identity?.stageId || null,
    },
    payload: {
      point: safeCheckpointPoint(scenario.crashPoint),
      crashSignal: REAL_E2E_CRASH_SIGNAL,
      scenario: scenario.id,
      attempt: details.attempt ?? null,
      trigger: 'external_e2e_harness',
      checkpointEventId: checkpoint?.eventId || null,
    },
  };
  fs.appendFileSync(eventsPath, `${JSON.stringify(event)}\n`);
  return event;
}

function startExternalCrashController({ workspace, scenario, child }) {
  if (!scenario.crashResume || !scenario.crashPoint) {
    return { stop() {}, state: { enabled: false } };
  }
  assertScenarioMutationChannel(scenario, 'crash-controller');
  const point = safeCheckpointPoint(scenario.crashPoint);
  const state = {
    enabled: true,
    point,
    observed: false,
    marker_path: null,
    event_id: null,
    signal: null,
  };
  const timer = setInterval(() => {
    if (state.observed || child.exitCode !== null || child.signalCode !== null) return;
    const checkpoint = checkpointEventForPoint(workspace, point);
    if (!checkpoint) return;
    state.observed = true;
    state.marker_path = writeExternalCrashMarker({ workspace, scenario, checkpoint });
    const event = appendExternalCrashEvent({ workspace, scenario, checkpoint });
    state.event_id = event.eventId;
    state.signal = REAL_E2E_CRASH_SIGNAL;
    child.kill(state.signal);
  }, 250);
  return {
    state,
    stop() {
      clearInterval(timer);
    },
  };
}

function readCrashCheckpoint(workspace, scenario) {
  if (!scenario?.crashPoint) return null;
  return checkpointEventForPoint(workspace, scenario.crashPoint);
}

function injectCleanupCrash({ workspace, scenario, state }) {
  if (safeCheckpointPoint(scenario?.crashPoint) !== 'during_cleanup' || state.observed) return false;
  const checkpoint = readCrashCheckpoint(workspace, scenario);
  if (!checkpoint) return false;
  state.observed = true;
  state.marker_path = writeExternalCrashMarker({ workspace, scenario, checkpoint });
  const event = appendExternalCrashEvent({ workspace, scenario, checkpoint });
  state.event_id = event.eventId;
  state.signal = REAL_E2E_CRASH_SIGNAL;
  state.harness_phase = 'cleanup';
  return true;
}

function startCheckpointCancellationController({ workspace, scenario, child }) {
  if (!scenario.cancelAtCheckpoint) {
    return { stop() {}, state: { enabled: false } };
  }
  assertScenarioMutationChannel(scenario, 'signal-controller');
  const point = safeCheckpointPoint(scenario.cancelAtCheckpoint);
  const state = {
    enabled: true,
    point,
    observed: false,
    signal: null,
    checkpoint_event_id: null,
  };
  const timer = setInterval(() => {
    if (state.observed || child.exitCode !== null || child.signalCode !== null) return;
    const checkpoint = checkpointEventForPoint(workspace, point);
    if (!checkpoint) return;
    state.observed = true;
    state.signal = 'SIGTERM';
    state.checkpoint_event_id = checkpoint?.eventId || null;
    child.kill(state.signal);
  }, 250);
  return {
    state,
    stop() {
      clearInterval(timer);
    },
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

const trackedChildren = new Map();

function trackChild(child, label) {
  if (!child) return child;
  trackedChildren.set(child.pid, { child, label });
  child.once('exit', () => {
    trackedChildren.delete(child.pid);
  });
  return child;
}

async function stopTrackedChildren({ gracefulMs = 10000 } = {}) {
  const children = [...trackedChildren.values()]
    .filter(({ child }) => child.exitCode === null && child.signalCode === null);
  for (const { child } of children) {
    try {
      child.kill('SIGTERM');
    } catch (_error) {
      // Child already exited; exit handlers will remove it from the registry.
    }
  }
  const graceful = await Promise.race([
    Promise.all(children.map(({ child }) => waitForChild(child))),
    new Promise((resolve) => setTimeout(() => resolve(null), gracefulMs)),
  ]);
  if (graceful) {
    return {
      forced: false,
      children: children.map(({ label, child }, index) => ({
        label,
        pid: child.pid,
        exit: graceful[index] || null,
      })),
    };
  }
  for (const { child } of children) {
    try {
      child.kill('SIGKILL');
    } catch (_error) {
      // Best-effort hard stop.
    }
  }
  const killed = await Promise.all(children.map(({ child }) => waitForChild(child)));
  return {
    forced: true,
    children: children.map(({ label, child }, index) => ({
      label,
      pid: child.pid,
      exit: killed[index] || null,
    })),
  };
}

function installTerminationResultHandler({ persist, resultRecordRef }) {
  let handling = false;
  const handler = async (signal) => {
    if (handling) return;
    handling = true;
    const exitCode = signal === 'SIGINT' ? 130 : 143;
    let children = null;
    try {
      children = await stopTrackedChildren();
    } catch (error) {
      children = {
        forced: null,
        error: error?.message || String(error),
      };
    }
    persist({
      ok: false,
      exit_code: exitCode,
      pipeline: {
        ok: false,
        phase: 'harness-aborted',
        reason: 'REAL_E2E_RUNNER_TERMINATED',
        signal,
      },
      diagnostics: {
        ...(resultRecordRef()?.diagnostics || {}),
        terminated_children: children,
      },
      errors: [
        ...(resultRecordRef()?.errors || []),
        {
          reason: 'REAL_E2E_RUNNER_TERMINATED',
          phase: 'runner',
          signal,
        },
      ],
      phases: [
        ...(resultRecordRef()?.phases || []),
        {
          phase: 'runner-terminated',
          ok: false,
          signal,
          completed_at: new Date().toISOString(),
        },
      ],
    });
    process.exit(exitCode);
  };
  process.once('SIGTERM', handler);
  process.once('SIGINT', handler);
  return () => {
    process.off('SIGTERM', handler);
    process.off('SIGINT', handler);
  };
}

export function busterSimulatorTimeoutMsForPipeline({
  pipelineTimeoutMs,
  rateLimitTimeoutExtensionMs = DEFAULT_RATE_LIMIT_TIMEOUT_EXTENSION_MS,
  maxRateLimitPauses = DEFAULT_RATE_LIMIT_MAX_PAUSES,
} = {}) {
  const pipelineMs = Number(pipelineTimeoutMs);
  const extensionMs = Number(rateLimitTimeoutExtensionMs);
  const pauses = Number(maxRateLimitPauses);
  if (!Number.isFinite(pipelineMs) || pipelineMs <= 0) throw new Error('pipelineTimeoutMs must be positive');
  if (!Number.isFinite(extensionMs) || extensionMs < 0) throw new Error('rateLimitTimeoutExtensionMs must be non-negative');
  if (!Number.isFinite(pauses) || pauses < 0) throw new Error('maxRateLimitPauses must be non-negative');
  return pipelineMs + (extensionMs * pauses) + (10 * 60 * 1000);
}

export const helperTimeoutMsForPipeline = busterSimulatorTimeoutMsForPipeline;

async function waitForChildWithTimeout(child, label, timeoutMs, {
  childOutput = null,
  rateLimitTimeoutExtensionMs = DEFAULT_RATE_LIMIT_TIMEOUT_EXTENSION_MS,
  maxRateLimitTimeoutExtensions = DEFAULT_RATE_LIMIT_MAX_PAUSES,
} = {}) {
  let timedOut = false;
  let timeoutExtensions = 0;
  const extensionKeys = new Set();
  let timeout = null;
  let deadlineAt = Date.now() + timeoutMs;
  while (true) {
    const waitMs = Math.max(0, deadlineAt - Date.now());
    const result = await Promise.race([
      waitForChild(child),
      new Promise((resolve) => {
        timeout = setTimeout(() => resolve(null), waitMs);
      }),
    ]);
    clearTimeout(timeout);
    if (result) {
      return {
        ...result,
        timed_out: false,
        rate_limit_timeout_extended: timeoutExtensions > 0,
        rate_limit_timeout_extensions: timeoutExtensions,
      };
    }
    const cooldown = rateLimitCooldownDetails(childOutput);
    if (
      Number(rateLimitTimeoutExtensionMs) > 0
      && timeoutExtensions < Number(maxRateLimitTimeoutExtensions)
      && cooldown
    ) {
      const extensionKey = cooldown.resumeAt || `evidence:${cooldown.evidenceLength}`;
      if (!extensionKeys.has(extensionKey)) {
        extensionKeys.add(extensionKey);
        timeoutExtensions += 1;
        const resumeAtMs = cooldown.resumeAt ? Date.parse(cooldown.resumeAt) : NaN;
        const extendedDeadline = Number.isFinite(resumeAtMs) && resumeAtMs > Date.now()
          ? resumeAtMs + Number(rateLimitTimeoutExtensionMs)
          : Date.now() + Number(rateLimitTimeoutExtensionMs);
        deadlineAt = Math.max(deadlineAt, extendedDeadline);
        continue;
      }
    }
    break;
  }
  let gracefulTimeout = null;
  timedOut = true;
  child.kill('SIGTERM');
  const graceful = await Promise.race([
    waitForChild(child),
    new Promise((resolve) => {
      gracefulTimeout = setTimeout(() => resolve(null), 10000);
    }),
  ]);
  clearTimeout(gracefulTimeout);
  if (graceful) {
    return {
      ...graceful,
      timed_out: timedOut,
      rate_limit_timeout_extended: timeoutExtensions > 0,
      rate_limit_timeout_extensions: timeoutExtensions,
    };
  }
  process.stderr.write(`[${label}] forcing SIGKILL after pipeline timeout ${timeoutMs}ms\n`);
  child.kill('SIGKILL');
  const killed = await waitForChild(child);
  return {
    ...killed,
    timed_out: timedOut,
    rate_limit_timeout_extended: timeoutExtensions > 0,
    rate_limit_timeout_extensions: timeoutExtensions,
  };
}

async function stopChild(child, label) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return { alreadyExited: true };
  child.kill('SIGTERM');
  let timeout = null;
  const result = await Promise.race([
    waitForChild(child),
    new Promise((resolve) => {
      timeout = setTimeout(() => resolve(null), 10000);
    }),
  ]);
  clearTimeout(timeout);
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
    const matched = /REAL_E2E_BUSTER_INFRA_UNAVAILABLE|infra_error|Buster infrastructure/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_BUSTER_MODULE_INFRA_FAILURE');
  }
  if (scenario.id === 'needs-nova-code-failure') {
    const matched = combined.includes('REAL_E2E_EXPECTED_NEEDS_NOVA_CODE_FAILURE') || /needs_nova|NEEDS_NOVA|Nova must intervene|REQUEST_HANDOFF/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_NEEDS_NOVA');
  }
  if (scenario.id === 'forge-malformed-output') {
    const matched = /invalid_forge_completion|invalid_contract|forge_completion.*invalid|completion artifact|artifact_type|invalid JSON/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_FORGE_MALFORMED_OUTPUT');
  }
  if (scenario.id === 'architecture-validator-block') {
    const matched = combined.includes('REAL_E2E_EXPECTED_ARCH_VALIDATOR_UNKNOWN_MODULE') || /ARCH_VALIDATION_BLOCKED|Architecture validation BLOCKED|EXEC_ORDER_MODULE_UNDEFINED/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_ARCHITECTURE_VALIDATOR_BLOCK');
  }
  if (scenario.id === 'echo-malformed-output') {
    const matched = /Review output must be valid JSON|invalid_contract|malformed JSON|Failed to read review output|Review invalid output/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_ECHO_MALFORMED_OUTPUT');
  }
  if (scenario.id === 'buster-invalid-completion-identity') {
    const matched = /completion.*identity|identity.*mismatch|completion-invalid|mismatch|target.*not.*reached|real-e2e-identity-mismatch/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_BUSTER_INVALID_COMPLETION_IDENTITY');
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
  if (scenario.id === 'tailscale-preview-url-unreachable') {
    const matched = /tailscale-preview|dns-resolve|Preview URL|preview-health-check|HTTP|404|unreachable|real-e2e-unreachable/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_TAILSCALE_PREVIEW_URL_UNREACHABLE');
  }
  if (scenario.id === 'tailscale-preview-wrong-deployment') {
    const matched = /tailscale-preview|Preview URL did not serve expected text|REAL_E2E_EXPECTED_DIFFERENT_DEPLOYMENT_MARKER|preview-health-check/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_TAILSCALE_PREVIEW_WRONG_DEPLOYMENT');
  }
  if (scenario.id === 'pipeline-summary-failure') {
    const matched = /Project Summary Failed|project_summary|generator:project_summary|registry resolution failed|stage owner|disabled/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_PIPELINE_SUMMARY_FAILURE');
  }
  if (scenario.id === 'redis-unavailable') {
    const matched = /Redis|ECONNREFUSED|Redis connection|REDIS_HOST|REDIS_PORT|Redis did not become ready/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_REDIS_UNAVAILABLE');
  }
  if (scenario.id === 'discord-unavailable') {
    const matched = /discord|webhook|ECONNREFUSED|delivery failed|127\.0\.0\.1:1/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_DISCORD_UNAVAILABLE');
  }
  if (scenario.id === 'k8s-context-invalid') {
    const matched = /KUBERNETES_FIXTURE_NAMESPACE_PREFIX_DENIED|namespacePrefix|namespace prefix|denied/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_K8S_CONTEXT_INVALID');
  }
  if (scenario.id === 'registry-pull-failure') {
    const matched = /registry-local|missing-base|image.*pull|pull access denied|manifest unknown|build.*failed|docker/i.test(combined);
    return failureOutputDiagnostic(matched, 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_REGISTRY_PULL_FAILURE');
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

export function buildRealE2EPipelineEnv({ workspace, scenario, baseEnv = process.env } = {}) {
  const kubeclawNamespace = baseEnv.KUBECLAW_NAMESPACE || 'kubeclaw';
  const env = {
    ...baseEnv,
    ...buildRealE2EScenarioEnv(scenario.id),
    // Temporary real-E2E bridge until deployed agents provide this env directly.
    KUBECLAW_LOCAL_REGISTRY: baseEnv.KUBECLAW_LOCAL_REGISTRY || `registry-local.${kubeclawNamespace}.svc.cluster.local:5001`,
    REPO_ROOT: workspace.worktreePath,
    SWARM_CONFIG: workspace.runConfigPath,
    AGENT_ROLE: baseEnv.AGENT_ROLE || 'nova',
    REAL_E2E_RUN_ID: workspace.runId,
    REAL_E2E_SCENARIO: scenario.id,
  };
  return withGitFaultShimEnv({ env, workspace, scenario });
}

function gitFaultMessage(fault) {
  switch (fault?.error_code) {
    case 'GIT_PUSH_AUTH_FAILED':
      return 'Permission denied (publickey).';
    case 'GIT_REMOTE_PUSH_FAILED':
      return 'ssh: connect to host real-e2e-git-remote.invalid port 22: Network is unreachable';
    case 'GIT_PUSH_REJECTED':
      return '! [rejected] HEAD -> pipeline-code (non-fast-forward)\nerror: failed to push some refs';
    case 'GIT_COMMIT_FAILED':
      return 'git commit failed: pre-commit hook declined REAL_E2E_EXPECTED_GIT_COMMIT_FAILURE';
    default:
      return null;
  }
}

function gitFaultShimScript({ realGit, fault, message }) {
  return `#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const realGit = ${JSON.stringify(realGit)};
const fault = ${JSON.stringify(fault)};
const message = ${JSON.stringify(message)};
const args = process.argv.slice(2);
function gitCommand(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '-C') {
      index += 1;
      continue;
    }
    if (arg.startsWith('-')) continue;
    return arg;
  }
  return '';
}
const command = gitCommand(args);
const fail = (fault.surface === 'commit_index' && command === 'commit')
  || (['push_auth', 'remote_push', 'non_fast_forward'].includes(fault.surface) && command === 'push');
if (fail) {
  console.error(message);
  process.exit(128);
}
const result = spawnSync(realGit, args, { stdio: 'inherit', env: process.env });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);
`;
}

function withGitFaultShimEnv({ env, workspace, scenario }) {
  const fault = gitFaultForScenario(scenario.id);
  const message = gitFaultMessage(fault);
  if (!fault || !message) return env;
  if (!workspace?.artifactRoot) throw new Error(`git fault scenario '${scenario.id}' requires workspace.artifactRoot`);
  const shimDir = path.join(workspace.artifactRoot, 'git-fault-shim');
  fs.mkdirSync(shimDir, { recursive: true });
  const shimPath = path.join(shimDir, 'git');
  fs.writeFileSync(shimPath, gitFaultShimScript({
    realGit: process.env.REAL_E2E_REAL_GIT || '/usr/bin/git',
    fault,
    message,
  }));
  fs.chmodSync(shimPath, 0o755);
  return {
    ...env,
    PATH: `${shimDir}${path.delimiter}${env.PATH || process.env.PATH || ''}`,
  };
}

async function runProductionPipeline({ workspace, mode, scenario, resumeFromCheckpoint = false }) {
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
    ...buildRealE2EPipelineEnv({ workspace, scenario }),
    REAL_E2E_V2_RUNTIME: '1',
  };
  const pipelineTimeoutMs = Number(process.env.REAL_E2E_PIPELINE_TIMEOUT_MS || (mode === 'fast' ? 45 * 60 * 1000 : 2 * 60 * 60 * 1000));
  const rateLimitTimeoutExtensionMs = Number(
    process.env.REAL_E2E_RATE_LIMIT_TIMEOUT_EXTENSION_MS
      || process.env.REAL_E2E_MATRIX_RATE_LIMIT_TIMEOUT_EXTENSION_MS
      || DEFAULT_RATE_LIMIT_TIMEOUT_EXTENSION_MS,
  );
  const simulatorTimeoutMs = Number(process.env.REAL_E2E_BUSTER_SIMULATOR_TIMEOUT_MS || busterSimulatorTimeoutMsForPipeline({
    pipelineTimeoutMs,
    rateLimitTimeoutExtensionMs,
  }));
  const helperTimeoutMs = Number(process.env.REAL_E2E_HELPER_TIMEOUT_MS || helperTimeoutMsForPipeline({
    pipelineTimeoutMs,
    rateLimitTimeoutExtensionMs,
  }));

  const simulator = null;
  const simulatorOutput = createChildOutputCapture({ label: 'real-e2e-buster-v2-in-process' });

  const startApprovalOperator = ({
    stateFile,
    decision = 'approve',
    reason = 'Approved by canonical real E2E operator controller.',
  }) => trackChild(spawn(process.execPath, [
    path.join(REPO_ROOT, 'tests', 'verification', 'e2e', 'approval-operator.mts'),
    '--state-path',
    path.join(workspace.swarmDir, stateFile),
    '--decision',
    decision,
    '--reason',
    reason,
    '--timeout-ms',
    String(Number(process.env.REAL_E2E_APPROVAL_OPERATOR_TIMEOUT_MS || helperTimeoutMs)),
  ], {
    cwd: REPO_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  }), `real-e2e-approval:${stateFile}`);

  const shouldRunApprovalOperator = scenario.approvalDecision !== null;
  if (shouldRunApprovalOperator) {
    assertScenarioSetupChannel(scenario, 'operator-controller');
  }
  const approvalOperator = shouldRunApprovalOperator ? startApprovalOperator({
    stateFile: 'operator-approval-gate-status.json',
    decision: process.env.REAL_E2E_APPROVAL_DECISION || scenario.approvalDecision || 'approve',
    reason: process.env.REAL_E2E_APPROVAL_REASON || 'Approved by canonical real E2E operator controller.',
  }) : null;
  const approvalOutput = approvalOperator
    ? captureChildOutput(approvalOperator, { label: 'real-e2e-approval' })
    : createChildOutputCapture({ label: 'real-e2e-approval' });
  const architectureApprovalOperator = startApprovalOperator({
    stateFile: 'architecture-approval-gate-status.json',
    decision: process.env.REAL_E2E_ARCH_APPROVAL_DECISION || 'approve',
    reason: process.env.REAL_E2E_ARCH_APPROVAL_REASON || 'Approved by canonical real E2E architecture operator controller.',
  });
  const architectureApprovalOutput = captureChildOutput(architectureApprovalOperator, { label: 'real-e2e-architecture-approval' });

  const malformedOutputConfig = malformedOutputScenarioConfig(scenario.id);
  const malformedOutputPublisher = malformedOutputConfig ? trackChild(spawn(process.execPath, [
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
    String(Number(process.env.REAL_E2E_MALFORMED_OUTPUT_PUBLISHER_TIMEOUT_MS || helperTimeoutMs)),
    '--poll-ms',
    String(Number(process.env.REAL_E2E_MALFORMED_OUTPUT_PUBLISHER_POLL_MS || 50)),
  ], {
    cwd: REPO_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  }), 'real-e2e-malformed-output') : null;
  const malformedOutputPublisherOutput = malformedOutputPublisher
    ? captureChildOutput(malformedOutputPublisher, { label: 'real-e2e-malformed-output' })
    : createChildOutputCapture({ label: 'real-e2e-malformed-output' });

  const pipelineAttempts = [];
  const spawnPipelineAttempt = ({ resume = false, label = 'real-e2e-nova' } = {}) => {
    const args = [
      path.join(REPO_ROOT, 'tests', 'verification', 'e2e', 'run-v2-production-pipeline.mts'),
      '--project',
      workspace.projectName,
      '--repo',
      workspace.worktreePath,
      '--nova-channel',
      novaChannel,
      '--model',
      validateRealE2EModel(process.env.REAL_E2E_MODEL || DEFAULT_REAL_E2E_MODEL),
      '--thinking',
      process.env.REAL_E2E_THINKING || DEFAULT_REAL_E2E_THINKING,
    ];
    if (resume) args.push('--resume');
    const child = trackChild(spawn(process.execPath, args, {
      cwd: workspace.worktreePath,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    }), label);
    const output = captureChildOutput(child, { label });
    const attempt = { label, resume, child, output, exit: null };
    pipelineAttempts.push(attempt);
    return attempt;
  };

  const firstPipelineAttempt = spawnPipelineAttempt({
    resume: resumeFromCheckpoint,
    label: scenario.crashResume ? 'real-e2e-nova-crash' : 'real-e2e-nova',
  });
  const externalCrash = startExternalCrashController({ workspace, scenario, child: firstPipelineAttempt.child });
  const cancellation = startCheckpointCancellationController({ workspace, scenario, child: firstPipelineAttempt.child });
  firstPipelineAttempt.exit = await waitForChildWithTimeout(firstPipelineAttempt.child, firstPipelineAttempt.label, pipelineTimeoutMs, {
    childOutput: firstPipelineAttempt.output,
    rateLimitTimeoutExtensionMs,
  });
  if (
    firstPipelineAttempt.exit.code === 0
    && !fs.existsSync(path.join(workspace.swarmDir, 'real-production-result.json'))
  ) {
    firstPipelineAttempt.exit = {
      ...firstPipelineAttempt.exit,
      code: 1,
      empty_success_rejected: true,
      reason: 'REAL_E2E_PIPELINE_RESULT_MISSING',
    };
    appendStreamCapture(
      firstPipelineAttempt.output.stderr,
      'REAL_E2E_PIPELINE_RESULT_MISSING: child exited zero without canonical v2 result\n',
    );
  }
  externalCrash.stop();
  cancellation.stop();
  if (scenario.crashResume && safeCheckpointPoint(scenario.crashPoint) === 'during_cleanup') {
    const actualInitialExit = firstPipelineAttempt.exit;
    if (injectCleanupCrash({ workspace, scenario, state: externalCrash.state })) {
      firstPipelineAttempt.exit = {
        code: null,
        signal: REAL_E2E_CRASH_SIGNAL,
        timed_out: false,
        rate_limit_timeout_extended: false,
        rate_limit_timeout_extensions: 0,
        harness_phase: 'cleanup',
        actual_exit: actualInitialExit,
      };
    }
  }
  let pipelineExit = firstPipelineAttempt.exit;
  let pipelineOutput = firstPipelineAttempt.output;
  let crashResume = null;
  if (scenario.crashResume) {
    const initialCrashObserved = externalCrash.state.observed === true
      && (firstPipelineAttempt.exit?.code !== 0 || Boolean(firstPipelineAttempt.exit?.signal));
    crashResume = {
      enabled: true,
      point: scenario.crashPoint || null,
      expected_initial_signal: REAL_E2E_CRASH_SIGNAL,
      initial_exit: firstPipelineAttempt.exit,
      initial_crash_observed: initialCrashObserved,
      external_crash: externalCrash.state,
      resumed: false,
      resume_exit: null,
    };
    if (initialCrashObserved) {
      const resumePipelineAttempt = spawnPipelineAttempt({ resume: true, label: 'real-e2e-nova-resume' });
      resumePipelineAttempt.exit = await waitForChildWithTimeout(resumePipelineAttempt.child, resumePipelineAttempt.label, pipelineTimeoutMs, {
        childOutput: resumePipelineAttempt.output,
        rateLimitTimeoutExtensionMs,
      });
      pipelineExit = resumePipelineAttempt.exit;
      pipelineOutput = resumePipelineAttempt.output;
      crashResume = {
        ...crashResume,
        resumed: true,
        resume_exit: resumePipelineAttempt.exit,
        lock_recovery: 'resource-lock.v2',
      };
    }
  }
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
  const simulatorStop = await stopChild(simulator, 'real-e2e-buster');
  const approvalStop = await stopChild(approvalOperator, 'real-e2e-approval');
  const architectureApprovalStop = await stopChild(architectureApprovalOperator, 'real-e2e-architecture-approval');
  const malformedOutputPublisherStop = await stopChild(malformedOutputPublisher, 'real-e2e-malformed-output');
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
    cancellation: cancellation.state,
    pipeline_expectation_met: pipelineExpectationMet,
    failure_output_diagnostic: failureOutputDiagnostic,
    failure_evidence: failureEvidence,
    pipeline_exit: pipelineExit,
    simulator_stop: simulatorStop,
    approval_operator_stop: approvalStop,
    architecture_approval_operator_stop: architectureApprovalStop,
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
      architecture_approval_operator: childOutputDiagnostics('real-e2e-architecture-approval', architectureApprovalOutput),
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
  const uninstallTerminationHandler = installTerminationResultHandler({
    persist,
    resultRecordRef: () => resultRecord,
  });
  try {
  if (args.help) {
    process.stdout.write(usage());
    return 0;
  }
  validateRealE2EModel(process.env.REAL_E2E_MODEL || DEFAULT_REAL_E2E_MODEL);

  const capabilities = readReusedCapabilityProbeResult({ ...process.env, REAL_E2E_MODE: args.mode })
    || await runCapabilityProbe({ mode: args.mode });
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
  let resultArtifactSnapshot = null;
  try {
    workspace = await createRealE2ERunWorkspace({ mode: args.mode, scenarioId: args.scenarioConfig.id });
    let restoredCheckpoint = null;
    if (args.restoreCheckpointDir) {
      restoredCheckpoint = await restoreCheckpointWorkspace({ workspace, args });
      workspace.restoredCheckpoint = restoredCheckpoint;
    }
    const workspaceSummary = summarizeWorkspace(workspace);
    persist({
      workspace: workspaceSummary,
      artifact_paths: artifactPathsForWorkspace(workspace),
      checkpoint: restoredCheckpoint
        ? { mode: 'restored', ...restoredCheckpoint }
        : (args.captureCheckpointRoot ? { mode: 'capture', checkpoint_root: path.resolve(args.captureCheckpointRoot) } : null),
      phases: [
        ...resultRecord.phases,
        { phase: 'workspace-created', ok: true, completed_at: new Date().toISOString() },
        ...(restoredCheckpoint ? [{ phase: 'checkpoint-restored', ok: true, completed_at: new Date().toISOString(), checkpoint: restoredCheckpoint }] : []),
      ],
    });
    process.stdout.write(`${JSON.stringify({
      ok: true,
      phase: 'workspace-created',
      result_path: args.resultPath,
      workspace: workspaceSummary,
      checkpoint: restoredCheckpoint,
    }, null, 2)}\n`);

    const checkpointCapture = startCheckpointCaptureController({
      checkpointRoot: args.captureCheckpointRoot ? path.resolve(args.captureCheckpointRoot) : null,
      workspace,
      seedId: args.captureCheckpointSeedId,
      checkpoints: checkpointCaptureNames(),
    });
    const runResult = await runProductionPipeline({
      workspace,
      mode: args.mode,
      scenario: args.scenarioConfig,
      resumeFromCheckpoint: Boolean(restoredCheckpoint),
    });
    const checkpointCaptureResult = await checkpointCapture.stop();
    resultArtifactSnapshot = snapshotResultArtifacts({ args, workspace });
    const pipelineResult = {
      ok: runResult.ok,
      phase: runResult.phase,
      mode: runResult.mode,
      scenario: runResult.scenario,
      expected_pipeline_exit: runResult.expected_pipeline_exit,
      crash_resume: runResult.crash_resume || null,
      cancellation: runResult.cancellation || null,
      pipeline_expectation_met: runResult.pipeline_expectation_met,
      pipeline_exit: runResult.pipeline_exit,
      simulator_stop: runResult.simulator_stop,
      approval_operator_stop: runResult.approval_operator_stop,
      architecture_approval_operator_stop: runResult.architecture_approval_operator_stop,
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
      artifact_paths: resultArtifactSnapshot,
      checkpoint: restoredCheckpoint
        ? { mode: 'restored', ...restoredCheckpoint }
        : (args.captureCheckpointRoot ? { mode: 'capture', ...checkpointCaptureResult } : null),
      phases: [
        ...resultRecord.phases,
        { phase: 'pipeline-run', ok: runResult.ok, completed_at: new Date().toISOString() },
        ...(args.captureCheckpointRoot ? [{ phase: 'checkpoint-capture', ok: checkpointCaptureResult.pending.length === 0, completed_at: new Date().toISOString(), ...checkpointCaptureResult }] : []),
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
      assertScenarioMutationChannel(args.scenarioConfig, 'cleanup-blocker');
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
    if (workspace && !resultArtifactSnapshot) {
      try {
        resultArtifactSnapshot = snapshotResultArtifacts({ args, workspace });
      } catch (_error) {
        resultArtifactSnapshot = artifactPathsForWorkspace(workspace);
      }
    }
    const keepArtifacts = args.keepArtifacts || runFailed;
    const cleanup = await cleanupRealE2ERunWorkspace(workspace, { keepArtifacts });
    const expectsCleanupFailure = args.scenarioConfig?.expectedCleanupOk === false;
    const cleanupResult = buildCleanupResult(cleanup, { keepArtifacts, expectsCleanupFailure });
    const cleanupFailureObserved = cleanupResult.cleanup_failure_observed === true;
    const cleanupVerification = cleanupResult.verification;
    process.stdout.write(`${JSON.stringify({
      ok: cleanupResult.ok,
      phase: 'cleanup',
      result_path: args.resultPath,
      keep_artifacts: keepArtifacts,
      expected_cleanup_ok: args.scenarioConfig?.expectedCleanupOk !== false,
      cleanup_failure_observed: cleanupFailureObserved,
      cleanup_result: cleanupResult,
      cleanup_verification: cleanupVerification,
      cleanup,
      workspace: summarizeWorkspace(workspace),
    }, null, 2)}\n`);
    if (expectsCleanupFailure) {
      runExitCode = runResultOk && cleanupResult.ok ? 0 : 1;
    } else if (!cleanupResult.ok) {
      runExitCode = 1;
    }
    persist({
      ok: runExitCode === 0,
      exit_code: runExitCode,
      workspace: summarizeWorkspace(workspace),
      artifact_paths: resultArtifactSnapshot || artifactPathsForWorkspace(workspace),
      cleanup: {
        ok: cleanupResult.ok,
        keep_artifacts: keepArtifacts,
        expected_cleanup_ok: args.scenarioConfig?.expectedCleanupOk !== false,
        cleanup_failure_observed: cleanupFailureObserved,
        cleanup_result: cleanupResult,
        cleanup_verification: cleanupVerification,
        cleanup,
      },
      phases: [
        ...resultRecord.phases,
        {
          phase: 'cleanup',
          ok: cleanupResult.ok,
          completed_at: new Date().toISOString(),
        },
      ],
    });
  }
  uninstallTerminationHandler();
  return runExitCode;
  } catch (error) {
    persist({
      ok: false,
      exit_code: 1,
      errors: [...resultRecord.errors, runnerErrorRecord(error)],
    });
    throw error;
  } finally {
    uninstallTerminationHandler();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exit(await main());
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2)}\n`);
    process.exit(1);
  }
}
