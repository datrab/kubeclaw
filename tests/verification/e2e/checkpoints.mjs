import fs from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_CHECKPOINT_FIXTURE_FAMILY,
  checkpointContractForScenario,
} from './failure-scenarios.mjs';

export const CHECKPOINT_SCHEMA_VERSION = 'real_e2e_checkpoint.v1';
export const CHECKPOINT_SEED_SCENARIO = 'success';
export { DEFAULT_CHECKPOINT_FIXTURE_FAMILY };

export const CHECKPOINT_FIXTURE_FAMILIES = Object.freeze([
  'standard-4-module',
  'linear-2-module',
  'single-module',
]);

export const CHECKPOINT_NAMES = Object.freeze([
  'fresh',
  'pre-forge',
  'post-forge',
  'pre-module-buster',
  'during-module-buster-wait',
  'pre-module-review',
  'post-module-review',
  'post-approval',
  'pre-final-buster',
  'pre-final-review',
  'post-final-review',
  'pre-terminal-delivery',
  'during-cleanup',
]);

export const CHECKPOINT_AGENT_PHASES = Object.freeze([
  'forge',
  'git-sync',
  'module-buster',
  'module-review',
  'approval',
  'final-buster',
  'final-review',
  'pipeline-summary',
  'pipeline-review',
  'terminal-delivery',
  'cleanup',
]);

export const CHECKPOINT_FAULT_SURFACES = Object.freeze([
  'baseline',
  'architecture-validator',
  'forge',
  'module-buster',
  'module-review',
  'operator-approval',
  'pipeline-review',
  'final-buster',
  'final-review',
  'terminal-delivery',
  'pipeline-summary',
  'runtime-config.redis',
  'observability.discord',
  'git-sync',
  'pipeline-signal',
  'module-graph',
  'cleanup',
  'crash-resume.*',
]);

const MODULE = '01-nginx';
const MODULES = Object.freeze(['01-nginx', '02-nginx', '03-nginx', '04-nginx']);
const MODULE_FORGE_OUTPUTS = Object.freeze(MODULES.map((moduleId) => `modules/${moduleId}/forge-completion.json`));
const MODULE_BUSTER_OUTPUTS = Object.freeze(MODULES.map((moduleId) => `modules/${moduleId}/buster-output.json`));
const MODULE_REVIEW_OUTPUT = 'logs/echo-review/MODULE-REVIEW.json';
const APPROVAL_DECISION = 'logs/gates/operator-approval/approval-decision.json';
const FINAL_BUSTER_OUTPUT = 'buster-test/FINAL-BUSTER-RESULT.json';
const FINAL_REVIEW_OUTPUT = 'logs/echo-review/FINAL-REVIEW.json';
const PIPELINE_SUMMARY_OUTPUT = 'logs/pipeline/summary.json';
const PIPELINE_LATEST_OUTPUT = 'logs/pipeline/latest.json';
const CAPTURE_CHECKPOINTS = Object.freeze(CHECKPOINT_NAMES.filter((name) => name !== 'fresh'));

function remainingPhases(skippedAgentPhases) {
  const skipped = new Set(skippedAgentPhases);
  return CHECKPOINT_AGENT_PHASES.filter((phase) => !skipped.has(phase));
}

function freezeArray(values = []) {
  return Object.freeze([...values]);
}

function defineHook({
  name,
  skippedAgentPhases = [],
  requiredSwarmPaths = ['progress.json'],
  forbiddenSwarmPaths = [],
  requiredModuleStatuses = {},
  allowedFaultSurfaces = CHECKPOINT_FAULT_SURFACES,
  fixtureFamilies = [DEFAULT_CHECKPOINT_FIXTURE_FAMILY],
}) {
  return Object.freeze({
    name,
    phase_boundary: name,
    fixture_families: freezeArray(fixtureFamilies),
    required_state: Object.freeze({
      swarm_paths: freezeArray(requiredSwarmPaths),
    }),
    forbidden_state: Object.freeze({
      swarm_paths: freezeArray(forbiddenSwarmPaths),
    }),
    required_lifecycle_state: Object.freeze({
      module_statuses: Object.freeze(Object.fromEntries(
        Object.entries(requiredModuleStatuses).map(([moduleId, statuses]) => [moduleId, freezeArray(statuses)]),
      )),
    }),
    skipped_agent_phases: freezeArray(skippedAgentPhases),
    remaining_phases: freezeArray(remainingPhases(skippedAgentPhases)),
    allowed_fault_surfaces: freezeArray(allowedFaultSurfaces),
  });
}

const ALL_MODULE_PASS_STATUSES = Object.freeze(Object.fromEntries(
  MODULES.map((moduleId) => [moduleId, Object.freeze(['PASS'])]),
));

const CHECKPOINT_HOOK_CONTRACTS = Object.freeze({
  fresh: defineHook({
    name: 'fresh',
    forbiddenSwarmPaths: [
      `modules/${MODULE}/forge-completion.json`,
      `modules/${MODULE}/buster-output.json`,
      MODULE_REVIEW_OUTPUT,
      APPROVAL_DECISION,
      FINAL_BUSTER_OUTPUT,
      FINAL_REVIEW_OUTPUT,
      PIPELINE_SUMMARY_OUTPUT,
    ],
  }),
  'pre-forge': defineHook({
    name: 'pre-forge',
    forbiddenSwarmPaths: [
      `modules/${MODULE}/forge-completion.json`,
      `modules/${MODULE}/buster-output.json`,
      MODULE_REVIEW_OUTPUT,
      APPROVAL_DECISION,
      FINAL_BUSTER_OUTPUT,
      FINAL_REVIEW_OUTPUT,
      PIPELINE_SUMMARY_OUTPUT,
    ],
  }),
  'post-forge': defineHook({
    name: 'post-forge',
    skippedAgentPhases: ['forge'],
    requiredSwarmPaths: [
      'progress.json',
      `modules/${MODULE}/forge-completion.json`,
    ],
    forbiddenSwarmPaths: [
      `modules/${MODULE}/buster-output.json`,
      MODULE_REVIEW_OUTPUT,
      APPROVAL_DECISION,
      FINAL_BUSTER_OUTPUT,
      FINAL_REVIEW_OUTPUT,
      PIPELINE_SUMMARY_OUTPUT,
    ],
    requiredModuleStatuses: { [MODULE]: ['READY_FOR_TESTING'] },
    allowedFaultSurfaces: ['git-sync', 'crash-resume.*'],
  }),
  'pre-module-buster': defineHook({
    name: 'pre-module-buster',
    skippedAgentPhases: ['forge', 'git-sync'],
    requiredSwarmPaths: [
      'progress.json',
      `modules/${MODULE}/forge-completion.json`,
    ],
    forbiddenSwarmPaths: [
      `modules/${MODULE}/buster-output.json`,
      MODULE_REVIEW_OUTPUT,
      APPROVAL_DECISION,
      FINAL_BUSTER_OUTPUT,
      FINAL_REVIEW_OUTPUT,
      PIPELINE_SUMMARY_OUTPUT,
    ],
    requiredModuleStatuses: { [MODULE]: ['READY_FOR_TESTING'] },
    allowedFaultSurfaces: ['module-buster', 'crash-resume.*'],
  }),
  'during-module-buster-wait': defineHook({
    name: 'during-module-buster-wait',
    skippedAgentPhases: ['forge', 'git-sync'],
    requiredSwarmPaths: [
      'progress.json',
      `modules/${MODULE}/forge-completion.json`,
    ],
    forbiddenSwarmPaths: [
      `modules/${MODULE}/buster-output.json`,
      MODULE_REVIEW_OUTPUT,
      APPROVAL_DECISION,
      FINAL_BUSTER_OUTPUT,
      FINAL_REVIEW_OUTPUT,
      PIPELINE_SUMMARY_OUTPUT,
    ],
    requiredModuleStatuses: { [MODULE]: ['TESTING'] },
    allowedFaultSurfaces: ['module-buster', 'crash-resume.*'],
  }),
  'pre-module-review': defineHook({
    name: 'pre-module-review',
    skippedAgentPhases: ['forge', 'git-sync', 'module-buster'],
    requiredSwarmPaths: ['progress.json', ...MODULE_FORGE_OUTPUTS, ...MODULE_BUSTER_OUTPUTS],
    forbiddenSwarmPaths: [
      MODULE_REVIEW_OUTPUT,
      APPROVAL_DECISION,
      FINAL_BUSTER_OUTPUT,
      FINAL_REVIEW_OUTPUT,
      PIPELINE_SUMMARY_OUTPUT,
    ],
    requiredModuleStatuses: ALL_MODULE_PASS_STATUSES,
    allowedFaultSurfaces: ['module-review'],
  }),
  'post-module-review': defineHook({
    name: 'post-module-review',
    skippedAgentPhases: ['forge', 'git-sync', 'module-buster', 'module-review'],
    requiredSwarmPaths: [
      'progress.json',
      ...MODULE_FORGE_OUTPUTS,
      ...MODULE_BUSTER_OUTPUTS,
      MODULE_REVIEW_OUTPUT,
    ],
    forbiddenSwarmPaths: [
      APPROVAL_DECISION,
      FINAL_BUSTER_OUTPUT,
      FINAL_REVIEW_OUTPUT,
      PIPELINE_SUMMARY_OUTPUT,
    ],
    requiredModuleStatuses: ALL_MODULE_PASS_STATUSES,
    allowedFaultSurfaces: ['operator-approval'],
  }),
  'post-approval': defineHook({
    name: 'post-approval',
    skippedAgentPhases: ['forge', 'git-sync', 'module-buster', 'module-review', 'approval'],
    requiredSwarmPaths: [
      'progress.json',
      ...MODULE_FORGE_OUTPUTS,
      ...MODULE_BUSTER_OUTPUTS,
      MODULE_REVIEW_OUTPUT,
      APPROVAL_DECISION,
    ],
    forbiddenSwarmPaths: [
      FINAL_BUSTER_OUTPUT,
      FINAL_REVIEW_OUTPUT,
      PIPELINE_SUMMARY_OUTPUT,
    ],
    requiredModuleStatuses: ALL_MODULE_PASS_STATUSES,
    allowedFaultSurfaces: ['pipeline-review'],
  }),
  'pre-final-buster': defineHook({
    name: 'pre-final-buster',
    skippedAgentPhases: ['forge', 'git-sync', 'module-buster', 'module-review', 'approval'],
    requiredSwarmPaths: [
      'progress.json',
      ...MODULE_FORGE_OUTPUTS,
      ...MODULE_BUSTER_OUTPUTS,
      MODULE_REVIEW_OUTPUT,
      APPROVAL_DECISION,
    ],
    forbiddenSwarmPaths: [
      FINAL_BUSTER_OUTPUT,
      FINAL_REVIEW_OUTPUT,
      PIPELINE_SUMMARY_OUTPUT,
    ],
    requiredModuleStatuses: ALL_MODULE_PASS_STATUSES,
    allowedFaultSurfaces: ['final-buster'],
  }),
  'pre-final-review': defineHook({
    name: 'pre-final-review',
    skippedAgentPhases: ['forge', 'git-sync', 'module-buster', 'module-review', 'approval', 'final-buster'],
    requiredSwarmPaths: [
      'progress.json',
      ...MODULE_FORGE_OUTPUTS,
      ...MODULE_BUSTER_OUTPUTS,
      MODULE_REVIEW_OUTPUT,
      APPROVAL_DECISION,
      FINAL_BUSTER_OUTPUT,
    ],
    forbiddenSwarmPaths: [
      FINAL_REVIEW_OUTPUT,
      PIPELINE_SUMMARY_OUTPUT,
    ],
    requiredModuleStatuses: ALL_MODULE_PASS_STATUSES,
    allowedFaultSurfaces: ['final-review'],
  }),
  'post-final-review': defineHook({
    name: 'post-final-review',
    skippedAgentPhases: ['forge', 'git-sync', 'module-buster', 'module-review', 'approval', 'final-buster', 'final-review'],
    requiredSwarmPaths: [
      'progress.json',
      ...MODULE_FORGE_OUTPUTS,
      ...MODULE_BUSTER_OUTPUTS,
      MODULE_REVIEW_OUTPUT,
      APPROVAL_DECISION,
      FINAL_BUSTER_OUTPUT,
      FINAL_REVIEW_OUTPUT,
    ],
    forbiddenSwarmPaths: [
      PIPELINE_SUMMARY_OUTPUT,
      PIPELINE_LATEST_OUTPUT,
    ],
    requiredModuleStatuses: ALL_MODULE_PASS_STATUSES,
    allowedFaultSurfaces: ['pipeline-summary', 'crash-resume.*'],
  }),
  'pre-terminal-delivery': defineHook({
    name: 'pre-terminal-delivery',
    skippedAgentPhases: ['forge', 'git-sync', 'module-buster', 'module-review', 'approval', 'final-buster', 'final-review', 'pipeline-summary'],
    requiredSwarmPaths: [
      'progress.json',
      ...MODULE_FORGE_OUTPUTS,
      ...MODULE_BUSTER_OUTPUTS,
      MODULE_REVIEW_OUTPUT,
      APPROVAL_DECISION,
      FINAL_BUSTER_OUTPUT,
      FINAL_REVIEW_OUTPUT,
      PIPELINE_SUMMARY_OUTPUT,
      PIPELINE_LATEST_OUTPUT,
    ],
    requiredModuleStatuses: ALL_MODULE_PASS_STATUSES,
    allowedFaultSurfaces: ['observability.discord', 'pipeline-review', 'crash-resume.*'],
  }),
  'during-cleanup': defineHook({
    name: 'during-cleanup',
    skippedAgentPhases: ['forge', 'git-sync', 'module-buster', 'module-review', 'approval', 'final-buster', 'final-review', 'pipeline-summary', 'pipeline-review', 'terminal-delivery'],
    requiredSwarmPaths: [
      'progress.json',
      ...MODULE_FORGE_OUTPUTS,
      ...MODULE_BUSTER_OUTPUTS,
      MODULE_REVIEW_OUTPUT,
      APPROVAL_DECISION,
      FINAL_BUSTER_OUTPUT,
      FINAL_REVIEW_OUTPUT,
      PIPELINE_SUMMARY_OUTPUT,
      PIPELINE_LATEST_OUTPUT,
    ],
    requiredModuleStatuses: ALL_MODULE_PASS_STATUSES,
    allowedFaultSurfaces: ['cleanup', 'crash-resume.*'],
  }),
});

export function checkpointDefinition(name) {
  const contract = CHECKPOINT_HOOK_CONTRACTS[name];
  if (!contract) throw new Error(`unknown real E2E checkpoint: ${name || '<missing>'}`);
  return {
    name,
    required_swarm_paths: [...contract.required_state.swarm_paths],
    forbidden_swarm_paths: [...contract.forbidden_state.swarm_paths],
  };
}

export function checkpointHookContract(name) {
  const contract = CHECKPOINT_HOOK_CONTRACTS[name];
  if (!contract) throw new Error(`unknown real E2E checkpoint: ${name || '<missing>'}`);
  return {
    name: contract.name,
    phase_boundary: contract.phase_boundary,
    fixture_families: [...contract.fixture_families],
    required_state: {
      swarm_paths: [...contract.required_state.swarm_paths],
    },
    forbidden_state: {
      swarm_paths: [...contract.forbidden_state.swarm_paths],
    },
    required_lifecycle_state: {
      module_statuses: Object.fromEntries(
        Object.entries(contract.required_lifecycle_state.module_statuses)
          .map(([moduleId, statuses]) => [moduleId, [...statuses]]),
      ),
    },
    skipped_agent_phases: [...contract.skipped_agent_phases],
    remaining_phases: [...contract.remaining_phases],
    allowed_fault_surfaces: [...contract.allowed_fault_surfaces],
  };
}

export function checkpointSkippedAgentPhases(name) {
  return [...checkpointHookContract(name).skipped_agent_phases];
}

export function checkpointRemainingAgentPhases(name) {
  return [...checkpointHookContract(name).remaining_phases];
}

export function checkpointForScenario(scenarioId) {
  return checkpointContractForScenario(scenarioId).required_hook;
}

export function checkpointPlanForScenario(scenarioId, options = {}) {
  const scenarioContract = checkpointContractForScenario(scenarioId);
  const checkpoint = checkpointForScenario(scenarioId, options);
  const skippedAgentPhases = checkpointSkippedAgentPhases(checkpoint);
  const remainingAgentPhases = checkpointRemainingAgentPhases(checkpoint);
  const hookContract = checkpointHookContract(checkpoint);
  return {
    scenario: scenarioId,
    checkpoint,
    start_from: checkpoint,
    estimated_skipped_agent_phases: skippedAgentPhases,
    estimated_skipped_agent_phase_count: skippedAgentPhases.length,
    agent_phases_to_run: remainingAgentPhases,
    agent_phase_count_to_run: remainingAgentPhases.length,
    fixture_family: scenarioContract.fixture_family,
    fault_injection_surface: scenarioContract.fault_injection_surface,
    expected_terminal_authority: scenarioContract.expected_terminal_authority,
    dedupe_group: scenarioContract.dedupe_group,
    scenario_contract: scenarioContract,
    hook_contract: hookContract,
  };
}

export function checkpointCaptureNames() {
  return [...CAPTURE_CHECKPOINTS];
}

function pathExists(filePath) {
  return fs.existsSync(filePath);
}

function swarmPath(root, relativePath) {
  return path.join(root, relativePath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function checkpointJsonStatus(swarmDir, relativePath) {
  const filePath = swarmPath(swarmDir, relativePath);
  if (!fs.existsSync(filePath)) return null;
  try {
    const value = readJson(filePath);
    return String(value?.status || value?.verdict || value?.result?.status || '').toUpperCase() || null;
  } catch {
    return 'INVALID_JSON';
  }
}

function lifecycleRunDirs(swarmDir) {
  const runsDir = path.join(swarmDir, 'logs', 'pipeline', 'runs');
  if (!fs.existsSync(runsDir)) return [];
  return fs.readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(runsDir, entry.name));
}

function validateCheckpointLifecycle({ checkpoint, swarmDir }) {
  if (checkpoint === 'fresh' || checkpoint === 'pre-forge') return { ok: true, run_dirs: [] };
  const runDirs = lifecycleRunDirs(swarmDir);
  const complete = runDirs
    .map((runDir) => ({
      run_dir: runDir,
      events_path: path.join(runDir, 'lifecycle', 'canonical-events.jsonl'),
      read_models_path: path.join(runDir, 'lifecycle', 'read-models.json'),
    }))
    .filter((entry) => fs.existsSync(entry.events_path) && fs.existsSync(entry.read_models_path));
  if (complete.length === 0) {
    return {
      ok: false,
      run_dirs: runDirs,
      reason: 'CHECKPOINT_LIFECYCLE_STATE_MISSING',
    };
  }
  return { ok: true, run_dirs: runDirs, complete };
}

function validateCheckpointSemantics({ checkpoint, swarmDir }) {
  const failures = [];
  const hookContract = checkpointHookContract(checkpoint);
  const requirePass = (relativePath) => {
    const status = checkpointJsonStatus(swarmDir, relativePath);
    if (status !== 'PASS') failures.push({ path: relativePath, expected: 'PASS', actual: status || 'missing' });
  };
  const requireLifecycleModuleStatus = (moduleId, expectedStatuses) => {
    const lifecycle = validateCheckpointLifecycle({ checkpoint, swarmDir });
    const statuses = (lifecycle.complete || [])
      .map((entry) => {
        try {
          return String(readJson(entry.read_models_path)?.modules?.[moduleId]?.status || '').toUpperCase() || null;
        } catch {
          return 'INVALID_JSON';
        }
      })
      .filter(Boolean);
    if (!expectedStatuses.some((status) => statuses.includes(status))) {
      failures.push({
        path: `lifecycle.modules.${moduleId}.status`,
        expected: expectedStatuses.length === 1 ? expectedStatuses[0] : expectedStatuses,
        actual: statuses.at(-1) || 'missing',
      });
    }
  };
  const expectedModuleStatusesById = hookContract.required_lifecycle_state.module_statuses;
  for (const [moduleId, expectedStatuses] of Object.entries(expectedModuleStatusesById)) {
    requireLifecycleModuleStatus(moduleId, expectedStatuses);
  }

  for (const relativePath of hookContract.required_state.swarm_paths) {
    if (/^modules\/[^/]+\/buster-output\.json$/.test(relativePath)
      || relativePath === MODULE_REVIEW_OUTPUT
      || relativePath === FINAL_BUSTER_OUTPUT
      || relativePath === FINAL_REVIEW_OUTPUT) {
      requirePass(relativePath);
    }
  }

  return {
    ok: failures.length === 0,
    failures,
  };
}

export function validateCheckpointState({ checkpoint, swarmDir }) {
  const definition = checkpointDefinition(checkpoint);
  const missing = definition.required_swarm_paths
    .filter((relativePath) => !pathExists(swarmPath(swarmDir, relativePath)));
  const forbidden_present = definition.forbidden_swarm_paths
    .filter((relativePath) => pathExists(swarmPath(swarmDir, relativePath)));
  const progressPath = swarmPath(swarmDir, 'progress.json');
  let progressScenario = null;
  let progressError = null;
  try {
    const progress = readJson(progressPath);
    progressScenario = progress?.real_e2e?.scenario_id || null;
  } catch (error) {
    progressError = error?.message || String(error);
  }
  const lifecycle = validateCheckpointLifecycle({ checkpoint, swarmDir });
  const semantics = validateCheckpointSemantics({ checkpoint, swarmDir });
  const ok = missing.length === 0 && forbidden_present.length === 0 && !progressError && lifecycle.ok && semantics.ok;
  return {
    ok,
    checkpoint,
    swarm_dir: swarmDir,
    progress_scenario: progressScenario,
    missing,
    forbidden_present,
    progress_error: progressError,
    lifecycle,
    semantics,
  };
}

export function assertValidCheckpointState(input) {
  const result = validateCheckpointState(input);
  if (result.ok) return result;
  const error = new Error(`real E2E checkpoint '${input.checkpoint}' is not valid`);
  error.validation = result;
  throw error;
}

function safeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'checkpoint';
}

export function defaultCheckpointRoot(repoRoot) {
  return path.join(repoRoot, '.swarm', 'real-e2e', 'checkpoints');
}

export function checkpointBundlePath({ checkpointRoot, checkpoint, seedId = 'canonical' }) {
  return path.join(checkpointRoot, safeName(seedId), safeName(checkpoint));
}

function readJsonIfPresent(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return readJson(filePath);
  } catch {
    return null;
  }
}

function checkpointPipelineRunId(swarmDir) {
  const latest = readJsonIfPresent(path.join(swarmDir, 'logs', 'pipeline', 'latest.json'));
  if (typeof latest?.run_id === 'string' && latest.run_id.trim()) return latest.run_id.trim();
  const runDirs = lifecycleRunDirs(swarmDir)
    .map((runDir) => path.basename(runDir))
    .filter(Boolean);
  return runDirs.length === 1 ? runDirs[0] : null;
}

export function writeCheckpointManifest({ checkpointDir, checkpoint, workspace, seedId = 'canonical' }) {
  const manifest = {
    schema_version: CHECKPOINT_SCHEMA_VERSION,
    checkpoint,
    fixture_family: DEFAULT_CHECKPOINT_FIXTURE_FAMILY,
    seed_id: seedId,
    created_at: new Date().toISOString(),
    source: {
      run_id: workspace?.runId || null,
      project: workspace?.projectName || null,
      artifact_root: workspace?.artifactRoot || null,
      worktree: workspace?.worktreePath || null,
      swarm_dir: workspace?.swarmDir || null,
      pipeline_run_id: workspace?.swarmDir ? checkpointPipelineRunId(workspace.swarmDir) : null,
    },
    definition: checkpointDefinition(checkpoint),
    hook_contract: checkpointHookContract(checkpoint),
  };
  fs.mkdirSync(checkpointDir, { recursive: true });
  fs.writeFileSync(path.join(checkpointDir, 'checkpoint-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function prunableLateCheckpointState({ checkpoint, state }) {
  if (checkpoint !== 'post-final-review') return false;
  if (!state || state.progress_error || state.missing?.length) return false;
  const forbidden = Array.isArray(state.forbidden_present) ? state.forbidden_present : [];
  const prunable = new Set(checkpointHookContract('post-final-review').forbidden_state.swarm_paths);
  return forbidden.length > 0 && forbidden.every((relativePath) => prunable.has(relativePath));
}

function removeSwarmPaths(swarmDir, relativePaths = []) {
  for (const relativePath of relativePaths) {
    fs.rmSync(path.join(swarmDir, relativePath), { recursive: true, force: true });
  }
}

export function captureCheckpoint({ checkpointRoot, checkpoint, workspace, seedId = 'canonical' }) {
  const sourceState = validateCheckpointState({ checkpoint, swarmDir: workspace.swarmDir });
  const pruneForbiddenPaths = prunableLateCheckpointState({ checkpoint, state: sourceState })
    ? [...sourceState.forbidden_present]
    : [];
  if (!sourceState.ok && pruneForbiddenPaths.length === 0) assertValidCheckpointState({ checkpoint, swarmDir: workspace.swarmDir });
  const checkpointDir = checkpointBundlePath({ checkpointRoot, checkpoint, seedId });
  const checkpointTmpDir = `${checkpointDir}.tmp-${process.pid}-${Date.now()}`;
  fs.rmSync(checkpointTmpDir, { recursive: true, force: true });
  const checkpointProjectSrc = path.join(checkpointTmpDir, 'worktree', 'Projects', workspace.projectName, 'src');
  fs.mkdirSync(path.dirname(checkpointProjectSrc), { recursive: true });
  try {
    fs.cpSync(workspace.projectSrc || path.join(workspace.worktreePath, 'Projects', workspace.projectName, 'src'), checkpointProjectSrc, { recursive: true });
    if (pruneForbiddenPaths.length > 0) {
      removeSwarmPaths(path.join(checkpointProjectSrc, '.swarm'), pruneForbiddenPaths);
    }
    if (workspace.runConfigPath && fs.existsSync(workspace.runConfigPath)) {
      fs.mkdirSync(checkpointTmpDir, { recursive: true });
      fs.copyFileSync(workspace.runConfigPath, path.join(checkpointTmpDir, path.basename(workspace.runConfigPath)));
    }
    const manifest = writeCheckpointManifest({ checkpointDir: checkpointTmpDir, checkpoint, workspace, seedId });
    if (pruneForbiddenPaths.length > 0) {
      manifest.pruned_forbidden_swarm_paths = pruneForbiddenPaths;
      fs.writeFileSync(path.join(checkpointTmpDir, 'checkpoint-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
      assertValidCheckpointState({ checkpoint, swarmDir: path.join(checkpointProjectSrc, '.swarm') });
    }
    fs.rmSync(checkpointDir, { recursive: true, force: true });
    fs.renameSync(checkpointTmpDir, checkpointDir);
    return { checkpoint, checkpoint_dir: checkpointDir, manifest };
  } catch (error) {
    fs.rmSync(checkpointTmpDir, { recursive: true, force: true });
    throw error;
  }
}

function checkpointCaptureTransientError(error) {
  return error?.code === 'ENOENT' || error?.code === 'ENOTDIR';
}

export function captureAvailableCheckpoints({ checkpointRoot, workspace, seedId = 'canonical', checkpoints = CAPTURE_CHECKPOINTS }) {
  const captured = [];
  const skipped = [];
  for (const checkpoint of checkpoints) {
    const state = validateCheckpointState({ checkpoint, swarmDir: workspace.swarmDir });
    if (!state.ok && !prunableLateCheckpointState({ checkpoint, state })) {
      skipped.push({ checkpoint, state });
      continue;
    }
    captured.push(captureCheckpoint({ checkpointRoot, checkpoint, workspace, seedId }));
  }
  return { captured, skipped };
}

function jsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function faultSurfaceAllowed(surface, allowedSurfaces) {
  return allowedSurfaces.some((allowed) => {
    if (allowed === surface) return true;
    if (allowed.endsWith('.*')) return surface.startsWith(allowed.slice(0, -1));
    return false;
  });
}

function validateManifestHookContract({ manifest, checkpoint, failures }) {
  const expected = checkpointHookContract(checkpoint);
  const actual = manifest?.hook_contract || null;
  if (!actual) {
    failures.push({
      field: 'manifest.hook_contract',
      expected,
      actual: null,
    });
    return;
  }
  if (!jsonEqual(actual, expected)) {
    failures.push({
      field: 'manifest.hook_contract',
      expected,
      actual,
    });
  }
}

export function validateScenarioCheckpointContract({ scenarioId, checkpoint, manifest = null }) {
  const scenarioContract = checkpointContractForScenario(scenarioId);
  const hookContract = checkpointHookContract(checkpoint);
  const failures = [];
  if (scenarioContract.required_hook !== checkpoint) {
    failures.push({
      field: 'required_hook',
      expected: scenarioContract.required_hook,
      actual: checkpoint,
    });
  }
  if (!hookContract.fixture_families.includes(scenarioContract.fixture_family)) {
    failures.push({
      field: 'fixture_family',
      expected: hookContract.fixture_families,
      actual: scenarioContract.fixture_family,
    });
  }
  if (!faultSurfaceAllowed(scenarioContract.fault_injection_surface, hookContract.allowed_fault_surfaces)) {
    failures.push({
      field: 'fault_injection_surface',
      expected: hookContract.allowed_fault_surfaces,
      actual: scenarioContract.fault_injection_surface,
    });
  }
  if (manifest && manifest.fixture_family !== scenarioContract.fixture_family) {
    failures.push({
      field: 'manifest.fixture_family',
      expected: scenarioContract.fixture_family,
      actual: manifest.fixture_family || null,
    });
  }
  if (manifest) validateManifestHookContract({ manifest, checkpoint, failures });
  return {
    ok: failures.length === 0,
    scenario: scenarioId,
    checkpoint,
    scenario_contract: scenarioContract,
    hook_contract: hookContract,
    failures,
  };
}

export function validateCheckpointBundle({ checkpointDir, checkpoint, scenarioId = null }) {
  const manifestPath = path.join(checkpointDir, 'checkpoint-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return { ok: false, checkpoint, checkpoint_dir: checkpointDir, reason: 'CHECKPOINT_MANIFEST_MISSING' };
  }
  const manifest = readJson(manifestPath);
  if (manifest.schema_version !== CHECKPOINT_SCHEMA_VERSION) {
    return { ok: false, checkpoint, checkpoint_dir: checkpointDir, reason: 'CHECKPOINT_SCHEMA_MISMATCH', manifest };
  }
  if (manifest.checkpoint !== checkpoint) {
    return { ok: false, checkpoint, checkpoint_dir: checkpointDir, reason: 'CHECKPOINT_NAME_MISMATCH', manifest };
  }
  const scenarioContract = scenarioId
    ? validateScenarioCheckpointContract({ scenarioId, checkpoint, manifest })
    : null;
  if (scenarioContract && !scenarioContract.ok) {
    return {
      ok: false,
      checkpoint,
      checkpoint_dir: checkpointDir,
      reason: 'CHECKPOINT_CONTRACT_UNSATISFIED',
      manifest,
      scenario_contract: scenarioContract,
    };
  }
  const worktree = path.join(checkpointDir, 'worktree');
  const swarmDir = path.join(worktree, 'Projects', manifest.source?.project || '', 'src', '.swarm');
  const state = validateCheckpointState({ checkpoint, swarmDir });
  return {
    ok: state.ok,
    checkpoint,
    checkpoint_dir: checkpointDir,
    manifest,
    scenario_contract: scenarioContract,
    state,
    reason: state.ok ? null : 'CHECKPOINT_STATE_INVALID',
  };
}

function walkFiles(root) {
  const output = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const filePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(filePath);
      } else if (entry.isFile()) {
        output.push(filePath);
      }
    }
  };
  if (fs.existsSync(root)) visit(root);
  return output;
}

function replaceTextFile(filePath, replacements) {
  const before = fs.readFileSync(filePath, 'utf8');
  let after = before;
  for (const [from, to] of replacements) {
    if (!from || from === to) continue;
    after = after.split(from).join(to);
  }
  if (after !== before) fs.writeFileSync(filePath, after);
}

const RESTORED_CHECKPOINT_COMMIT_FIELDS = new Set([
  'commit_hash',
  'forge_commit_hash',
  'buster_commit_hash',
  'commitHash',
]);

function clearCommitFields(value) {
  if (!value || typeof value !== 'object') return false;
  let changed = false;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (clearCommitFields(item)) changed = true;
    }
    return changed;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (RESTORED_CHECKPOINT_COMMIT_FIELDS.has(key) && typeof nested === 'string' && nested.length > 0) {
      value[key] = null;
      changed = true;
    } else if (clearCommitFields(nested)) {
      changed = true;
    }
  }
  return changed;
}

export function clearRestoredCheckpointReadModelCommits(swarmDir) {
  const cleared = [];
  const runsDir = path.join(swarmDir, 'logs', 'pipeline', 'runs');
  if (!fs.existsSync(runsDir)) return cleared;
  for (const runDir of lifecycleRunDirs(swarmDir)) {
    const readModelsPath = path.join(runDir, 'lifecycle', 'read-models.json');
    if (!fs.existsSync(readModelsPath)) continue;
    const readModels = readJson(readModelsPath);
    if (!clearCommitFields(readModels)) continue;
    fs.writeFileSync(readModelsPath, `${JSON.stringify(readModels, null, 2)}\n`);
    cleared.push(path.relative(swarmDir, readModelsPath));
  }
  return cleared;
}

function normalizePreTerminalDeliveryLifecycle(swarmDir) {
  const normalized = [];
  for (const runDir of lifecycleRunDirs(swarmDir)) {
    const lifecycleDir = path.join(runDir, 'lifecycle');
    const eventsPath = path.join(lifecycleDir, 'canonical-events.jsonl');
    const readModelsPath = path.join(lifecycleDir, 'read-models.json');
    if (fs.existsSync(eventsPath)) {
      const lines = fs.readFileSync(eventsPath, 'utf8').split(/\r?\n/);
      const kept = [];
      let removed = false;
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event?.type === 'pipeline_run.completed') {
            removed = true;
            continue;
          }
        } catch {
          // Preserve unreadable lines; checkpoint validation will report them through normal paths.
        }
        kept.push(line);
      }
      if (removed) {
        fs.writeFileSync(eventsPath, `${kept.join('\n')}${kept.length ? '\n' : ''}`);
        normalized.push(path.relative(swarmDir, eventsPath));
      }
    }
    if (fs.existsSync(readModelsPath)) {
      const readModels = readJson(readModelsPath);
      if (readModels?.pipeline?.status === 'COMPLETED' || readModels?.pipeline?.terminal_status === 'succeeded') {
        readModels.pipeline = {
          ...readModels.pipeline,
          status: 'RUNNING',
          completed_at: null,
          terminal_status: null,
          terminal_decision: null,
          reason_code: null,
          halt_reason: null,
          latest_event_type: 'pipeline.checkpoint',
        };
        fs.writeFileSync(readModelsPath, `${JSON.stringify(readModels, null, 2)}\n`);
        normalized.push(path.relative(swarmDir, readModelsPath));
      }
    }
  }
  return normalized;
}

export function restoreCheckpointProjectSource({ checkpointDir, checkpoint, workspace, scenarioId = null }) {
  const validation = validateCheckpointBundle({ checkpointDir, checkpoint, scenarioId });
  if (!validation.ok) {
    const error = new Error(`real E2E checkpoint bundle '${checkpoint}' is not valid`);
    error.validation = validation;
    throw error;
  }

  const sourceProject = validation.manifest.source?.project;
  if (!sourceProject) {
    throw new Error(`real E2E checkpoint bundle '${checkpoint}' is missing source project`);
  }
  const sourceRunId = validation.manifest.source?.run_id || null;
  const sourceProjectSrc = path.join(checkpointDir, 'worktree', 'Projects', sourceProject, 'src');
  if (!fs.existsSync(sourceProjectSrc)) {
    throw new Error(`real E2E checkpoint bundle '${checkpoint}' is missing project source: ${sourceProjectSrc}`);
  }

  fs.rmSync(workspace.projectSrc, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(workspace.projectSrc), { recursive: true });
  fs.cpSync(sourceProjectSrc, workspace.projectSrc, { recursive: true });
  const sourcePipelineRunId = validation.manifest.source?.pipeline_run_id || checkpointPipelineRunId(workspace.swarmDir);
  const runIdToMove = sourcePipelineRunId || sourceRunId;
  if (runIdToMove && runIdToMove !== workspace.runId) {
    const runsDir = path.join(workspace.swarmDir, 'logs', 'pipeline', 'runs');
    const sourceRunDir = path.join(runsDir, runIdToMove);
    const targetRunDir = path.join(runsDir, workspace.runId);
    if (fs.existsSync(sourceRunDir)) {
      fs.rmSync(targetRunDir, { recursive: true, force: true });
      fs.renameSync(sourceRunDir, targetRunDir);
    }
  }

  const replacements = [
    [sourceProject, workspace.projectName],
    [sourcePipelineRunId, workspace.runId],
    [sourceRunId, workspace.runId],
    [validation.manifest.source?.artifact_root, workspace.artifactRoot],
    [validation.manifest.source?.worktree, workspace.worktreePath],
    [validation.manifest.source?.swarm_dir, workspace.swarmDir],
  ].filter(([from]) => typeof from === 'string' && from.length > 0);

  for (const filePath of walkFiles(workspace.projectSrc)) {
    try {
      replaceTextFile(filePath, replacements);
    } catch {
      // The E2E fixture is text-only for the checkpointed surfaces. If a future
      // binary fixture appears, leave it byte-for-byte from the seed checkpoint.
    }
  }
  clearRestoredCheckpointReadModelCommits(workspace.swarmDir);
  const boundaryNormalized = checkpoint === 'pre-terminal-delivery'
    ? normalizePreTerminalDeliveryLifecycle(workspace.swarmDir)
    : [];

  assertValidCheckpointState({ checkpoint, swarmDir: workspace.swarmDir });
  return {
    checkpoint,
    checkpoint_dir: checkpointDir,
    seed_id: validation.manifest.seed_id,
    source: validation.manifest.source,
    restored_project: workspace.projectName,
    restored_run_id: workspace.runId,
    boundary_normalized: boundaryNormalized,
  };
}

export function startCheckpointCaptureController({
  checkpointRoot,
  workspace,
  seedId = 'canonical',
  checkpoints = CAPTURE_CHECKPOINTS,
  intervalMs = 10,
} = {}) {
  if (!checkpointRoot) return { stop: async () => ({ captured: [], pending: [] }), state: { captured: [] } };
  const pending = new Set(checkpoints);
  const captured = [];
  let captureInProgress = false;
  const captureReady = () => {
    if (captureInProgress) return;
    captureInProgress = true;
    try {
      for (const checkpoint of [...pending]) {
        const state = validateCheckpointState({ checkpoint, swarmDir: workspace.swarmDir });
        if (!state.ok && !prunableLateCheckpointState({ checkpoint, state })) continue;
        try {
          captured.push(captureCheckpoint({ checkpointRoot, checkpoint, workspace, seedId }));
        } catch (error) {
          if (checkpointCaptureTransientError(error)) continue;
          throw error;
        }
        pending.delete(checkpoint);
      }
    } finally {
      captureInProgress = false;
    }
  };
  captureReady();
  const timer = setInterval(captureReady, intervalMs);
  const watchRoots = [
    workspace.swarmDir,
    path.join(workspace.swarmDir, 'modules', MODULE),
    path.join(workspace.swarmDir, 'logs', 'echo-review'),
    path.join(workspace.swarmDir, 'logs', 'gates', 'operator-approval'),
    path.join(workspace.swarmDir, 'buster-test'),
  ];
  const watchers = watchRoots
    .filter((dir) => fs.existsSync(dir))
    .map((dir) => {
      try {
        return fs.watch(dir, { persistent: false }, () => setImmediate(captureReady));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return {
    state: { captured, pending },
    stop: async () => {
      clearInterval(timer);
      for (const watcher of watchers) watcher.close();
      captureReady();
      return {
        captured: [...captured],
        pending: [...pending],
      };
    },
  };
}
