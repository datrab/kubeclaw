import fs from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_CHECKPOINT_FIXTURE_FAMILY,
  checkpointContractForScenario,
} from './failure-scenarios.mjs';

export const CHECKPOINT_SCHEMA_VERSION = 'real_e2e_checkpoint.v2';
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
  'architecture',
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

const MODULES = Object.freeze(['01-nginx', '02-nginx', '03-nginx', '04-nginx']);
const FORGE_STAGES = Object.freeze(MODULES.map((moduleId) => `forge-${moduleId}`));
const BUSTER_STAGES = Object.freeze(MODULES.map((moduleId) => `buster-${moduleId}`));
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
  requiredPassedStages = [],
  requiredStartedStages = [],
  forbiddenStartedStages = [],
  requiredRunStatus = null,
  allowedFaultSurfaces = CHECKPOINT_FAULT_SURFACES,
  fixtureFamilies = [DEFAULT_CHECKPOINT_FIXTURE_FAMILY],
}) {
  const effectiveSkippedAgentPhases = name === 'fresh'
    ? skippedAgentPhases
    : [...new Set(['architecture', ...skippedAgentPhases])];
  return Object.freeze({
    name,
    phase_boundary: name,
    fixture_families: freezeArray(fixtureFamilies),
    required_state: Object.freeze({
      v2_run_files: freezeArray(name === 'fresh' ? [] : ['events.jsonl', 'effects.jsonl']),
    }),
    forbidden_state: Object.freeze({
      v2_run_files: freezeArray([]),
    }),
    required_lifecycle_state: Object.freeze({
      passed_stages: freezeArray(requiredPassedStages),
      started_stages: freezeArray(requiredStartedStages),
      forbidden_started_stages: freezeArray(forbiddenStartedStages),
      run_status: requiredRunStatus,
    }),
    skipped_agent_phases: freezeArray(effectiveSkippedAgentPhases),
    remaining_phases: freezeArray(remainingPhases(effectiveSkippedAgentPhases)),
    allowed_fault_surfaces: freezeArray(allowedFaultSurfaces),
  });
}

const CHECKPOINT_HOOK_CONTRACTS = Object.freeze({
  fresh: defineHook({
    name: 'fresh',
    forbiddenStartedStages: ['architecture'],
  }),
  'pre-forge': defineHook({
    name: 'pre-forge',
    requiredPassedStages: ['architecture'],
    forbiddenStartedStages: FORGE_STAGES,
  }),
  'post-forge': defineHook({
    name: 'post-forge',
    skippedAgentPhases: ['forge'],
    requiredPassedStages: ['architecture', FORGE_STAGES[0]],
    forbiddenStartedStages: [BUSTER_STAGES[0]],
    allowedFaultSurfaces: ['git-sync', 'crash-resume.*'],
  }),
  'pre-module-buster': defineHook({
    name: 'pre-module-buster',
    skippedAgentPhases: ['forge', 'git-sync'],
    requiredPassedStages: ['architecture', FORGE_STAGES[0]],
    forbiddenStartedStages: [BUSTER_STAGES[0]],
    allowedFaultSurfaces: ['module-buster', 'crash-resume.*'],
  }),
  'during-module-buster-wait': defineHook({
    name: 'during-module-buster-wait',
    skippedAgentPhases: ['forge', 'git-sync'],
    requiredPassedStages: ['architecture', FORGE_STAGES[0]],
    requiredStartedStages: [BUSTER_STAGES[0]],
    forbiddenStartedStages: ['module-review'],
    allowedFaultSurfaces: ['module-buster', 'crash-resume.*'],
  }),
  'pre-module-review': defineHook({
    name: 'pre-module-review',
    skippedAgentPhases: ['forge', 'git-sync', 'module-buster'],
    requiredPassedStages: ['architecture', ...FORGE_STAGES, ...BUSTER_STAGES],
    forbiddenStartedStages: ['module-review'],
    allowedFaultSurfaces: ['module-review'],
  }),
  'post-module-review': defineHook({
    name: 'post-module-review',
    skippedAgentPhases: ['forge', 'git-sync', 'module-buster', 'module-review'],
    requiredPassedStages: ['architecture', ...FORGE_STAGES, ...BUSTER_STAGES, 'module-review'],
    forbiddenStartedStages: ['operator-approval'],
    allowedFaultSurfaces: ['operator-approval'],
  }),
  'post-approval': defineHook({
    name: 'post-approval',
    skippedAgentPhases: ['forge', 'git-sync', 'module-buster', 'module-review', 'approval'],
    requiredPassedStages: ['architecture', ...FORGE_STAGES, ...BUSTER_STAGES, 'module-review', 'operator-approval'],
    forbiddenStartedStages: ['final-buster'],
    allowedFaultSurfaces: ['pipeline-review'],
  }),
  'pre-final-buster': defineHook({
    name: 'pre-final-buster',
    skippedAgentPhases: ['forge', 'git-sync', 'module-buster', 'module-review', 'approval'],
    requiredPassedStages: ['architecture', ...FORGE_STAGES, ...BUSTER_STAGES, 'module-review', 'operator-approval'],
    forbiddenStartedStages: ['final-buster'],
    allowedFaultSurfaces: ['final-buster'],
  }),
  'pre-final-review': defineHook({
    name: 'pre-final-review',
    skippedAgentPhases: ['forge', 'git-sync', 'module-buster', 'module-review', 'approval', 'final-buster'],
    requiredPassedStages: ['architecture', ...FORGE_STAGES, ...BUSTER_STAGES, 'module-review', 'operator-approval', 'final-buster'],
    forbiddenStartedStages: ['final-review'],
    allowedFaultSurfaces: ['final-review'],
  }),
  'post-final-review': defineHook({
    name: 'post-final-review',
    skippedAgentPhases: ['forge', 'git-sync', 'module-buster', 'module-review', 'approval', 'final-buster', 'final-review'],
    requiredPassedStages: ['architecture', ...FORGE_STAGES, ...BUSTER_STAGES, 'module-review', 'operator-approval', 'final-buster', 'final-review'],
    forbiddenStartedStages: ['summary'],
    allowedFaultSurfaces: ['pipeline-summary', 'crash-resume.*'],
  }),
  'pre-terminal-delivery': defineHook({
    name: 'pre-terminal-delivery',
    skippedAgentPhases: ['forge', 'git-sync', 'module-buster', 'module-review', 'approval', 'final-buster', 'final-review', 'pipeline-summary'],
    requiredPassedStages: ['architecture', ...FORGE_STAGES, ...BUSTER_STAGES, 'module-review', 'operator-approval', 'final-buster', 'final-review', 'summary'],
    requiredRunStatus: 'succeeded',
    allowedFaultSurfaces: ['observability.discord', 'pipeline-review', 'crash-resume.*'],
  }),
  'during-cleanup': defineHook({
    name: 'during-cleanup',
    skippedAgentPhases: ['forge', 'git-sync', 'module-buster', 'module-review', 'approval', 'final-buster', 'final-review', 'pipeline-summary', 'pipeline-review', 'terminal-delivery'],
    requiredPassedStages: ['architecture', ...FORGE_STAGES, ...BUSTER_STAGES, 'module-review', 'operator-approval', 'final-buster', 'final-review', 'summary'],
    requiredRunStatus: 'succeeded',
    allowedFaultSurfaces: ['cleanup', 'crash-resume.*'],
  }),
});

export function checkpointDefinition(name) {
  const contract = CHECKPOINT_HOOK_CONTRACTS[name];
  if (!contract) throw new Error(`unknown real E2E checkpoint: ${name || '<missing>'}`);
  return {
    name,
    required_v2_run_files: [...contract.required_state.v2_run_files],
    forbidden_v2_run_files: [...contract.forbidden_state.v2_run_files],
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
      v2_run_files: [...contract.required_state.v2_run_files],
    },
    forbidden_state: {
      v2_run_files: [...contract.forbidden_state.v2_run_files],
    },
    required_lifecycle_state: {
      passed_stages: [...contract.required_lifecycle_state.passed_stages],
      started_stages: [...contract.required_lifecycle_state.started_stages],
      forbidden_started_stages: [...contract.required_lifecycle_state.forbidden_started_stages],
      run_status: contract.required_lifecycle_state.run_status,
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

export function checkpointForScenario(scenarioId, options = {}) {
  const requested = options.checkpoint;
  if (requested !== undefined) {
    if (!CHECKPOINT_NAMES.includes(requested)) {
      throw new Error(`unknown real E2E checkpoint: ${requested || '<missing>'}`);
    }
    return requested;
  }
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

function lifecycleRunDirs(swarmDir) {
  const runsDir = path.join(swarmDir, 'v2-runtime', 'runs');
  if (!fs.existsSync(runsDir)) return [];
  return fs.readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(runsDir, entry.name));
}

function readV2Events(runDir) {
  const eventsPath = path.join(runDir, 'events.jsonl');
  if (!fs.existsSync(eventsPath)) return [];
  const content = fs.readFileSync(eventsPath, 'utf8');
  const lines = content.split(/\r?\n/);
  if (content.length > 0 && !content.endsWith('\n')) {
    // The checkpoint watcher may snapshot the append-only journal between the
    // writer's bytes and terminating newline. Ignore only that active trailing
    // fragment; malformed newline-terminated records still fail closed.
    lines.pop();
  }
  return lines.filter(Boolean).map((line) => JSON.parse(line).entry);
}

function v2LifecycleProjection(runDir) {
  const events = readV2Events(runDir);
  const startedStages = new Set();
  const passedStages = new Set();
  let runStatus = null;
  for (const event of events) {
    const stageId = event?.identity?.stageId;
    if (event?.type === 'stage.started' && stageId) startedStages.add(stageId);
    if (event?.type === 'attempt.completed' && stageId && event?.payload?.outcome === 'passed') {
      passedStages.add(stageId);
    }
    if (event?.type === 'run.succeeded') runStatus = 'succeeded';
    if (event?.type === 'run.failed') runStatus = 'failed';
    if (event?.type === 'run.blocked') runStatus = 'blocked';
    if (event?.type === 'run.cancelled') runStatus = 'cancelled';
  }
  return { events, startedStages, passedStages, runStatus };
}

function validateCheckpointLifecycle({ checkpoint, swarmDir }) {
  if (checkpoint === 'fresh') {
    const runDirs = lifecycleRunDirs(swarmDir);
    return { ok: runDirs.length === 0, run_dirs: runDirs, reason: runDirs.length === 0 ? null : 'CHECKPOINT_V2_RUN_UNEXPECTED' };
  }
  const runDirs = lifecycleRunDirs(swarmDir);
  const complete = runDirs
    .map((runDir) => ({
      run_dir: runDir,
      events_path: path.join(runDir, 'events.jsonl'),
      effects_path: path.join(runDir, 'effects.jsonl'),
    }))
    .filter((entry) => fs.existsSync(entry.events_path) && fs.existsSync(entry.effects_path));
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
  const lifecycle = validateCheckpointLifecycle({ checkpoint, swarmDir });
  if (!lifecycle.ok || checkpoint === 'fresh') return { ok: lifecycle.ok, failures };
  const projection = v2LifecycleProjection(lifecycle.complete.at(-1).run_dir);
  for (const stageId of hookContract.required_lifecycle_state.passed_stages) {
    if (!projection.passedStages.has(stageId)) {
      failures.push({ path: `v2.stages.${stageId}`, expected: 'passed', actual: 'not-passed' });
    }
  }
  for (const stageId of hookContract.required_lifecycle_state.started_stages) {
    if (!projection.startedStages.has(stageId)) {
      failures.push({ path: `v2.stages.${stageId}`, expected: 'started', actual: 'not-started' });
    }
  }
  for (const stageId of hookContract.required_lifecycle_state.forbidden_started_stages) {
    if (projection.startedStages.has(stageId)) {
      failures.push({ path: `v2.stages.${stageId}`, expected: 'not-started', actual: 'started' });
    }
  }
  const expectedRunStatus = hookContract.required_lifecycle_state.run_status;
  if (expectedRunStatus && projection.runStatus !== expectedRunStatus) {
    failures.push({ path: 'v2.run.status', expected: expectedRunStatus, actual: projection.runStatus || 'running' });
  }

  return {
    ok: failures.length === 0,
    failures,
  };
}

export function validateCheckpointState({ checkpoint, swarmDir }) {
  const definition = checkpointDefinition(checkpoint);
  const lifecycle = validateCheckpointLifecycle({ checkpoint, swarmDir });
  const runDir = lifecycle.complete?.at(-1)?.run_dir || null;
  const missing = definition.required_v2_run_files
    .filter((relativePath) => !runDir || !pathExists(path.join(runDir, relativePath)));
  const forbidden_present = definition.forbidden_v2_run_files
    .filter((relativePath) => runDir && pathExists(path.join(runDir, relativePath)));
  const progressPath = swarmPath(swarmDir, 'progress.json');
  let progressScenario = null;
  let progressError = null;
  try {
    const progress = readJson(progressPath);
    progressScenario = progress?.real_e2e?.scenario_id || null;
  } catch (error) {
    progressError = error?.message || String(error);
  }
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

function checkpointPipelineRunId(swarmDir) {
  const runDirs = lifecycleRunDirs(swarmDir)
    .map((runDir) => {
      try {
        const created = readV2Events(runDir).find((event) => event?.type === 'run.created');
        return created?.identity?.runId || null;
      } catch {
        return null;
      }
    })
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

export function captureCheckpoint({ checkpointRoot, checkpoint, workspace, seedId = 'canonical' }) {
  const sourceState = validateCheckpointState({ checkpoint, swarmDir: workspace.swarmDir });
  if (!sourceState.ok) assertValidCheckpointState({ checkpoint, swarmDir: workspace.swarmDir });
  const checkpointDir = checkpointBundlePath({ checkpointRoot, checkpoint, seedId });
  const checkpointTmpDir = `${checkpointDir}.tmp-${process.pid}-${Date.now()}`;
  fs.rmSync(checkpointTmpDir, { recursive: true, force: true });
  const checkpointProjectSrc = path.join(checkpointTmpDir, 'worktree', 'Projects', workspace.projectName, 'src');
  fs.mkdirSync(path.dirname(checkpointProjectSrc), { recursive: true });
  try {
    fs.cpSync(workspace.projectSrc || path.join(workspace.worktreePath, 'Projects', workspace.projectName, 'src'), checkpointProjectSrc, { recursive: true });
    if (workspace.runConfigPath && fs.existsSync(workspace.runConfigPath)) {
      fs.mkdirSync(checkpointTmpDir, { recursive: true });
      fs.copyFileSync(workspace.runConfigPath, path.join(checkpointTmpDir, path.basename(workspace.runConfigPath)));
    }
    const manifest = writeCheckpointManifest({ checkpointDir: checkpointTmpDir, checkpoint, workspace, seedId });
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
    if (!state.ok) {
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
    const runsDir = path.join(workspace.swarmDir, 'v2-runtime', 'runs');
    const sourceRunDir = path.join(runsDir, runIdToMove.replaceAll(':', '_'));
    const targetRunDir = path.join(runsDir, workspace.runId.replaceAll(':', '_'));
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
  assertValidCheckpointState({ checkpoint, swarmDir: workspace.swarmDir });
  return {
    checkpoint,
    checkpoint_dir: checkpointDir,
    seed_id: validation.manifest.seed_id,
    source: validation.manifest.source,
    restored_project: workspace.projectName,
    restored_run_id: workspace.runId,
    boundary_normalized: [],
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
        if (!state.ok) continue;
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
    path.join(workspace.swarmDir, 'v2-runtime'),
    path.join(workspace.swarmDir, 'v2-runtime', 'runs'),
    path.join(workspace.swarmDir, 'artifacts', 'v2'),
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
