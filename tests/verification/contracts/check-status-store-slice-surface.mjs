import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-status-store-slice-surface' });
import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';
import { pathToFileURL } from 'url';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

function extractExportedFunctionSource(source, name) {
  const start = source.indexOf(`export function ${name}(`);
  assert.notEqual(start, -1, `expected to find exported function ${name}`);
  const paramsStart = source.indexOf('(', start);
  let parenDepth = 0;
  let bodyStart = -1;
  for (let i = paramsStart; i < source.length; i += 1) {
    if (source[i] === '(') parenDepth += 1;
    if (source[i] === ')') parenDepth -= 1;
    if (parenDepth === 0) {
      bodyStart = source.indexOf('{', i);
      break;
    }
  }
  assert.notEqual(bodyStart, -1, `expected ${name} to have a function body`);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated function body for ${name}`);
}

const { sourceRoot } = parseArgs();
const mainPath = path.join(sourceRoot, 'skills/nova/pipeline/services/status-store.ts');
const lifecyclePath = path.join(sourceRoot, 'skills/nova/pipeline/services/status-store-lifecycle.ts');
const lifecycleLegalityPath = path.join(sourceRoot, 'skills/nova/pipeline/services/status-store-lifecycle/legality.ts');
const compatPath = path.join(sourceRoot, 'skills/nova/pipeline/services/status-store-compat.ts');
const compatCommonPath = path.join(sourceRoot, 'skills/nova/pipeline/services/status-store-compat/common.ts');
const compatGatePath = path.join(sourceRoot, 'skills/nova/pipeline/services/status-store-compat/gate-projection.ts');
const compatModulePath = path.join(sourceRoot, 'skills/nova/pipeline/services/status-store-compat/module-projection.ts');
const completionAdjudicatorPath = path.join(sourceRoot, 'skills/nova/pipeline/services/completion-adjudicator.ts');
const truthDriftPath = path.join(sourceRoot, 'skills/nova/pipeline/services/truth-drift.ts');
const dependenciesPath = path.join(sourceRoot, 'skills/nova/pipeline/services/dependencies.ts');
const pollingPath = path.join(sourceRoot, 'skills/nova/pipeline/services/polling.ts');
const pollingDualPath = path.join(sourceRoot, 'skills/nova/pipeline/services/polling-dual.ts');
const busterCompletionControllerPath = path.join(sourceRoot, 'skills/nova/pipeline/services/buster-completion-controller.ts');
const moduleRunnerAttemptPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner/attempt.ts');
const pipelineRunnerSchedulingPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner-scheduling.ts');
const pipelineRunnerRecoveryPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner-recovery.ts');
const pipelineRunnerSharedPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner-shared.ts');
const pathsPath = path.join(sourceRoot, 'skills/nova/pipeline/core/paths.ts');
const pathConstructionMapPath = path.join(sourceRoot, 'docs/pipeline/implementation-map/path-construction.md');
const externalBoundariesMapPath = path.join(sourceRoot, 'docs/pipeline/implementation-map/external-boundaries.md');

const mainSource = fs.readFileSync(mainPath, 'utf8');
const lifecycleSource = fs.readFileSync(lifecyclePath, 'utf8');
const lifecycleLegalitySource = fs.readFileSync(lifecycleLegalityPath, 'utf8');
const compatFacadeSource = fs.readFileSync(compatPath, 'utf8');
const compatCommonSource = fs.readFileSync(compatCommonPath, 'utf8');
const compatGateSource = fs.readFileSync(compatGatePath, 'utf8');
const compatModuleSource = fs.readFileSync(compatModulePath, 'utf8');
const compatSource = [compatFacadeSource, compatCommonSource, compatGateSource, compatModuleSource].join('\n');
const completionAdjudicatorSource = fs.readFileSync(completionAdjudicatorPath, 'utf8');
const truthDriftSource = fs.readFileSync(truthDriftPath, 'utf8');
const dependenciesSource = fs.readFileSync(dependenciesPath, 'utf8');
const pollingSource = fs.readFileSync(pollingPath, 'utf8');
const pollingDualSource = fs.readFileSync(pollingDualPath, 'utf8');
const busterCompletionControllerSource = fs.readFileSync(busterCompletionControllerPath, 'utf8');
const moduleRunnerAttemptSource = fs.readFileSync(moduleRunnerAttemptPath, 'utf8');
const pipelineRunnerSchedulingSource = fs.readFileSync(pipelineRunnerSchedulingPath, 'utf8');
const pipelineRunnerRecoverySource = fs.readFileSync(pipelineRunnerRecoveryPath, 'utf8');
const pipelineRunnerSharedSource = fs.readFileSync(pipelineRunnerSharedPath, 'utf8');
const pathsSource = fs.readFileSync(pathsPath, 'utf8');
const pathConstructionMap = fs.readFileSync(pathConstructionMapPath, 'utf8');
const externalBoundariesMap = fs.readFileSync(externalBoundariesMapPath, 'utf8');

for (const marker of [
  "from './status-store-lifecycle.ts'",
  "from './status-store-compat.ts'",
  "from './truth-drift.ts'",
  'export {\n  appendCooldownLifecycleEvent,',
  'export {\n  GATE_STATUS_AUTHORITY_ROLES,',
]) {
  assert.equal(mainSource.includes(marker), true, `status-store main surface should include ${marker}`);
}

for (const marker of [
  'export function loadLifecycleReadModels(',
  'export function readLifecycleEvents(',
  'export function appendLifecycleEvent(',
  'export function appendPipelineLifecycleEvent(',
  'export function appendWaitLifecycleEvent(',
  'export function appendCooldownLifecycleEvent(',
  'export function appendStaleRecoveryLifecycleEvent(',
  'export function appendModuleLifecycleEvent(',
  'export function getLifecycleGateState(',
  'export function getLifecycleModuleState(',
  'export function getLifecycleCooldown(',
  'export function resetLifecycleStore(',
]) {
  assert.equal(lifecycleSource.includes(marker), true, `status-store lifecycle helper should export ${marker}`);
}

for (const marker of [
  'export function getAuthoritativeModuleState(',
  'export function projectModuleSchedulerState(',
  'export function projectGateLegacyEvidenceIntoReadModel(',
  'export function projectGateCompletionState(',
  'export function projectGateSchedulerState(',
  'export function syncApprovalWaitState(',
  'export const GATE_STATUS_AUTHORITY_ROLES',
  'export function buildGateStatusAuthorityPolicy(',
  'export function readGateOutput(',
  'export function gateOutputExists(',
  'export function readGateStatusJson(',
  'export function readBusterGateCompletion(',
]) {
  assert.equal(compatSource.includes(marker), true, `status-store compat helpers should export ${marker}`);
}

for (const removedMarker of [
  'LEGACY_MODULE_STATUS_PROJECTION_MODES',
  'LEGACY_MODULE_STATUS_PROJECTION_PURPOSES',
  'MODULE_STATUS_SNAPSHOT_AUTHORITY_ROLES',
  'projectModuleLegacyStatusIntoReadModel',
  'readModuleStatusJson',
  'resolveLegacyModuleStatusProjectionPolicy',
  'resolveModuleStatusSnapshotAuthority',
  'legacy_status:status_json',
  'status_json_role',
  'status_json_authority',
  'legacy_status_path',
]) {
  assert.equal(compatSource.includes(removedMarker), false, `module status compat surface must remove ${removedMarker}`);
}

assert.equal(pathsSource.includes('export function statusPath('), false, 'path helpers must not construct module status.json paths');
assert.equal(compatCommonSource.includes('legacy_status:status_json'), false, 'compat common constants must not retain module status legacy evidence tags');
assert.equal(lifecycleLegalitySource.includes('export function cloneSerializable('), false, 'legality module must not export removed cloneSerializable helper');
assert.equal(lifecycleLegalitySource.includes('cloneSerializableValue'), false, 'legality module should not reference missing cloneSerializableValue');
assert.equal(lifecycleLegalitySource.includes('export function ensureLifecycleEventLegal('), true, 'legality module should export the legal transition guard');

assert.equal(dependenciesSource.includes('projectModuleSchedulerState('), true, 'dependency checks should consume module scheduler projections');
assert.equal(dependenciesSource.includes('loadStatus'), false, 'dependency checks must not decide module readiness from raw loadStatus calls');

const loadStatusSource = extractExportedFunctionSource(mainSource, 'loadStatus');
assert.equal(loadStatusSource.includes('getLifecycleModuleState(config, moduleId)'), true, 'loadStatus must consume lifecycle module state');
assert.equal(loadStatusSource.includes('buildStatusFromLifecycleModule('), true, 'loadStatus must project lifecycle state');
for (const disallowedLoadStatusRead of ['fs.', 'readModuleStatusJson', 'statusPath(']) {
  assert.equal(loadStatusSource.includes(disallowedLoadStatusRead), false, `loadStatus must not retain legacy status reads via ${disallowedLoadStatusRead}`);
}

const saveStatusSource = extractExportedFunctionSource(mainSource, 'saveStatus');
assert.equal(saveStatusSource.includes('appendModuleLifecycleEvent('), true, 'saveStatus must append lifecycle events');
assert.equal(saveStatusSource.includes('syncRuntimeSnapshotToReadModels(config, dir, status)'), true, 'saveStatus should synchronize runtime snapshot fields into lifecycle read-models');
for (const removedSnapshotWrite of ['fs.writeFileSync(tmp,', 'fs.renameSync(tmp, p)', 'statusPath(config, dir)']) {
  assert.equal(saveStatusSource.includes(removedSnapshotWrite), false, `saveStatus must not keep legacy status.json write path ${removedSnapshotWrite}`);
}

const statusJsonAuthorityReadSurfaces = {
  compatFacade: compatFacadeSource,
  compatModule: compatModuleSource,
  dependencies: dependenciesSource,
  moduleRunnerAttempt: moduleRunnerAttemptSource,
  pipelineRunnerScheduling: pipelineRunnerSchedulingSource,
  pipelineRunnerShared: pipelineRunnerSharedSource,
  pipelineRunnerRecovery: pipelineRunnerRecoverySource,
  polling: pollingSource,
  truthDrift: truthDriftSource,
};
for (const [surface, source] of Object.entries(statusJsonAuthorityReadSurfaces)) {
  for (const pattern of [/readModuleStatusJson\s*\(/, /resolveModuleStatusSnapshotAuthority\s*\(/, /statusPath\s*\(/, /legacy_status:status_json/, /status\.json/i]) {
    assert.equal(pattern.test(source), false, `${surface} must not retain module status.json logic`);
  }
}

assert.equal(moduleRunnerAttemptSource.includes('deps.loadStatus(config, dir)'), true, 'module attempt routing may consume lifecycle-backed loadStatus');
assert.equal(pipelineRunnerSchedulingSource.includes('deps.loadStatus(config, mod.dir)'), true, 'pipeline scheduling may consume lifecycle-backed loadStatus');
assert.equal(pipelineRunnerRecoverySource.includes('loadStatus(config, dir)'), true, 'recovery may consume lifecycle-backed loadStatus');
assert.equal(pollingSource.includes('loadStatus(config, moduleDir)'), true, 'module polling may consume lifecycle-backed loadStatus');
assert.equal(pollingSource.includes('Lifecycle read models are the only local polling authority for module state.'), true, 'polling docs should describe lifecycle authority explicitly');

assert.equal(completionAdjudicatorSource.includes("source: source || status._source || 'lifecycle_read_model'"), true, 'completion projection should default local authority to lifecycle_read_model');
assert.equal(completionAdjudicatorSource.includes("statusSource = 'lifecycle_read_model'"), true, 'completion adjudication should default local status source to lifecycle_read_model');
assert.equal(completionAdjudicatorSource.includes('status_json_status'), false, 'completion adjudicator drift fields must not retain status_json wording');
assert.equal(truthDriftSource.includes('function collectModuleArtifactRefs(moduleProjection = {}) {\n  void moduleProjection;\n  return {};\n}'), true, 'module truth drift artifacts must no longer expose removed status paths');

assert.equal(pollingSource.includes("from './completion-adjudicator.ts'"), true, 'polling should import shared completion adjudication');
assert.equal(pollingSource.includes('projectCompletionState,') || pollingSource.includes('projectCompletionState\n'), true, 'polling should re-export centralized completion projection helpers');
assert.equal(pollingDualSource.includes('waitForBusterCompletion({'), true, 'pollDual should route Redis completions through the centralized Buster completion controller');
assert.equal(busterCompletionControllerSource.includes('adjudicateCompletionEvidence({'), true, 'Buster completion controller should classify Redis completions through centralized arbitration');

for (const marker of [
  'export function normalizeCompletionIdentity(',
  'export function hasStrongCompletionIdentity(',
  'export function projectCompletionState(',
  'export function adjudicateCompletionEvidence(',
  'export function shouldApplyRedisCompletionToStatus(',
]) {
  assert.equal(completionAdjudicatorSource.includes(marker), true, `completion adjudicator should export ${marker}`);
}
for (const marker of [
  'export function projectModuleTruthDrift(',
  'export function projectGateTruthDrift(',
]) {
  assert.equal(truthDriftSource.includes(marker), true, `truth drift helper should export ${marker}`);
}

const mainMod = await import(pathToFileURL(mainPath).href);
const lifecycleMod = await import(pathToFileURL(lifecyclePath).href);
const lifecycleLegalityMod = await import(pathToFileURL(lifecycleLegalityPath).href);
const compatMod = await import(pathToFileURL(compatPath).href);
const completionAdjudicatorMod = await import(pathToFileURL(completionAdjudicatorPath).href);
const truthDriftMod = await import(pathToFileURL(truthDriftPath).href);
const pollingMod = await import(pathToFileURL(pollingPath).href);

assert.equal('cloneSerializable' in lifecycleLegalityMod, false, 'removed broken legality cloneSerializable helper must not be exported');
assert.equal(typeof lifecycleLegalityMod.ensureLifecycleEventLegal, 'function', 'legality module should still export ensureLifecycleEventLegal');

for (const [mod, name] of [
  [mainMod, 'initLogDir'],
  [mainMod, 'loadStatus'],
  [mainMod, 'saveStatus'],
  [mainMod, 'appendPipelineLifecycleEvent'],
  [mainMod, 'loadLifecycleReadModels'],
  [mainMod, 'getAuthoritativeModuleState'],
  [mainMod, 'projectModuleSchedulerState'],
  [mainMod, 'buildGateStatusAuthorityPolicy'],
  [mainMod, 'projectGateCompletionState'],
  [mainMod, 'projectGateSchedulerState'],
  [mainMod, 'syncApprovalWaitState'],
  [mainMod, 'readGateOutput'],
  [lifecycleMod, 'appendLifecycleEvent'],
  [lifecycleMod, 'appendModuleLifecycleEvent'],
  [lifecycleMod, 'loadLifecycleReadModels'],
  [lifecycleMod, 'readLifecycleEvents'],
  [compatMod, 'getAuthoritativeModuleState'],
  [compatMod, 'projectModuleSchedulerState'],
  [compatMod, 'buildGateStatusAuthorityPolicy'],
  [compatMod, 'projectGateLegacyEvidenceIntoReadModel'],
  [compatMod, 'projectGateCompletionState'],
  [compatMod, 'projectGateSchedulerState'],
  [compatMod, 'syncApprovalWaitState'],
  [compatMod, 'readBusterGateCompletion'],
  [completionAdjudicatorMod, 'normalizeCompletionIdentity'],
  [completionAdjudicatorMod, 'hasStrongCompletionIdentity'],
  [completionAdjudicatorMod, 'projectCompletionState'],
  [completionAdjudicatorMod, 'adjudicateCompletionEvidence'],
  [completionAdjudicatorMod, 'shouldApplyRedisCompletionToStatus'],
  [truthDriftMod, 'projectModuleTruthDrift'],
  [truthDriftMod, 'projectGateTruthDrift'],
  [mainMod, 'projectModuleTruthDrift'],
  [mainMod, 'projectGateTruthDrift'],
  [pollingMod, 'projectCompletionState'],
]) {
  assert.equal(typeof mod[name], 'function', `${name} should be exported`);
}

for (const removedExport of [
  'LEGACY_MODULE_STATUS_PROJECTION_MODES',
  'LEGACY_MODULE_STATUS_PROJECTION_PURPOSES',
  'MODULE_STATUS_SNAPSHOT_AUTHORITY_ROLES',
  'projectModuleLegacyStatusIntoReadModel',
  'readModuleStatusJson',
  'resolveLegacyModuleStatusProjectionPolicy',
  'resolveModuleStatusSnapshotAuthority',
]) {
  assert.equal(removedExport in mainMod, false, `${removedExport} must not remain on status-store main exports`);
  assert.equal(removedExport in compatMod, false, `${removedExport} must not remain on compat exports`);
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'status-store-slice-'));
process.on('exit', () => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});
const config = {
  project: 'status-store-slice-contract',
  repo_root: tmpRoot,
  _runId: 'run-status-store-slice-1',
  paths: {
    swarm_dir: path.join(tmpRoot, '.swarm'),
    modules_dir: path.join(tmpRoot, 'modules'),
  },
};
fs.mkdirSync(config.paths.swarm_dir, { recursive: true });
fs.mkdirSync(config.paths.modules_dir, { recursive: true });
fs.mkdirSync(path.join(config.paths.swarm_dir, 'logs'), { recursive: true });

const progress = {
  execution_order: ['01', 'gate:release-approval'],
  modules: {
    '01': { title: 'Module 01', dir: '01', stages: ['forge', 'buster'] },
  },
  gates: {
    'release-approval': { type: 'approval', title: 'Release approval', on_timeout: 'block' },
  },
};
config._progress = progress;

mainMod.appendPipelineLifecycleEvent(config, 'pipeline_run.started', { progress, opts: { resume: false } });
assert.deepEqual(mainMod.readLifecycleEvents(config).map((event) => event.type), ['pipeline_run.started']);

const pendingApproval = mainMod.syncApprovalWaitState(config, 'release-approval', progress.gates['release-approval'], {
  status: 'PENDING_APPROVAL',
  requested_at: '2026-04-24T06:34:00.000Z',
  timeout_minutes: 30,
  timeout_policy: 'BLOCK',
});
assert.equal(pendingApproval.status, 'PENDING_APPROVAL');

const approvedApproval = mainMod.syncApprovalWaitState(config, 'release-approval', progress.gates['release-approval'], {
  status: 'APPROVED',
  requested_at: '2026-04-24T06:34:00.000Z',
  resolved_at: '2026-04-24T06:35:00.000Z',
  decision_by: 'Raven',
  decision_via: 'openclaw',
});
assert.equal(approvedApproval.status, 'APPROVED');
assert.equal(mainMod.getLifecycleGateState(config, 'release-approval').scheduler_consumed, true);

const unguardedStatus = mainMod.initStatus('unguarded', { title: 'Unguarded Module' });
unguardedStatus.status = 'READY_FOR_TESTING';
assert.throws(
  () => mainMod.saveStatus(config, 'unguarded', unguardedStatus),
  (err) => err?.code === 'STATUS_LIFECYCLE_GUARD_VIOLATION' && err.guarded_fields?.includes('status'),
  'saveStatus should reject lifecycle field changes without lifecycle transition intent',
);

const status = mainMod.initStatus('01', { title: 'Module 01' });
assert.equal(mainMod.getAuthoritativeModuleState(config, '01', { dir: '01', status }), null, 'module authority should remain absent before lifecycle events exist');
assert.equal(mainMod.loadStatus(config, '01'), null, 'loadStatus must not invent status without lifecycle authority');

status.status = 'IN_PROGRESS';
status.current_phase = 'forge';
mainMod.appendModuleLifecycleEvent(config, '01', status, {
  eventType: 'module_attempt.started',
  oldStatus: 'PENDING',
  previousPhase: null,
  note: 'canonical start',
  now: '2026-04-24T06:35:00.000Z',
});
status.status = 'PASS';
status.current_phase = null;
mainMod.appendModuleLifecycleEvent(config, '01', status, {
  eventType: 'module_attempt.passed',
  oldStatus: 'TESTING',
  previousPhase: 'buster',
  note: 'canonical pass',
  now: '2026-04-24T06:36:00.000Z',
});

const authoritativeModule = mainMod.getAuthoritativeModuleState(config, '01', { dir: '01' });
assert.equal(authoritativeModule.status, 'PASS');
const authorityResolvedStatus = mainMod.loadStatus(config, '01');
assert.equal(authorityResolvedStatus.status, 'PASS', 'loadStatus should use lifecycle read-model authority');
assert.equal(authorityResolvedStatus.status_authority_source, 'lifecycle_read_model');
assert.equal(authorityResolvedStatus.lifecycle_module_state_authority, true);
assert.equal('status_json_authority' in authorityResolvedStatus, false, 'loadStatus should no longer expose status_json authority fields');
assert.equal('status_json_role' in authorityResolvedStatus, false, 'loadStatus should no longer expose status_json role fields');

const moduleProjection = mainMod.projectModuleSchedulerState(config, '01', progress.modules['01']);
assert.equal(moduleProjection.status, 'PASS', 'module scheduler projection should use lifecycle state');
assert.equal(moduleProjection.read_model_source, 'canonical-events');
assert.equal(moduleProjection.operator_projection_source, 'module_scheduler_read_model');
assert.equal(moduleProjection.legacy_evidence_source, null);
assert.equal(moduleProjection.scheduler_drift_detected, false);
assert.equal('legacy_status' in moduleProjection, false, 'module scheduler projection should not surface legacy status evidence');

const moduleTruthDrift = mainMod.projectModuleTruthDrift(config, '01', progress.modules['01'], {
  redisEntry: { status: 'PASS', source: 'buster-pipeline' },
  expectedIdentity: { run_id: 'run-status-store-slice-1', attempt: 1, dispatch_id: 'dispatch-1' },
});
assert.equal(moduleTruthDrift.drift_detected, true, 'module truth drift report should aggregate completion drift');
assert.equal(moduleTruthDrift.drift.some((entry) => entry.source === 'completion_adjudicator'), true);
assert.deepEqual(moduleTruthDrift.artifacts, {}, 'module truth drift must not expose removed status artifact paths');

const redisCompletion = pollingMod.projectCompletionState({
  targetKind: 'module',
  targetId: '01',
  expectedStatuses: ['PASS', 'FAIL', 'BLOCKED'],
  redisEntry: { status: 'PASS', source: 'buster-pipeline' },
});
assert.equal(redisCompletion.outcome, 'target_reached');
assert.equal(redisCompletion.status, 'PASS');

assert.deepEqual(
  completionAdjudicatorMod.normalizeCompletionIdentity({ runId: 'run-1', attempt: 2, dispatchId: 'dispatch-1' }),
  { run_id: 'run-1', attempt: '2', dispatch_id: 'dispatch-1' },
  'completion identity normalization should canonicalize camelCase inputs',
);
assert.equal(completionAdjudicatorMod.hasStrongCompletionIdentity({ run_id: 'run-1', attempt: 1, dispatch_id: 'dispatch-1' }), true);
assert.equal(completionAdjudicatorMod.hasStrongCompletionIdentity({ run_id: 'run-1', attempt: 1 }), false);

const adjudicatedDefault = completionAdjudicatorMod.adjudicateCompletionEvidence({
  targetKind: 'module',
  targetId: '01',
  expectedStatuses: ['PASS', 'FAIL', 'BLOCKED'],
  expectedIdentity: { run_id: 'run-status-store-slice-1', attempt: 1, dispatch_id: 'dispatch-1' },
  redisEntry: { status: 'PASS', source: 'buster-pipeline', run_id: 'run-status-store-slice-1', attempt: 1, dispatch_id: 'dispatch-1' },
  status: { status: 'TESTING' },
});
assert.equal(adjudicatedDefault.authority_source, 'lifecycle_read_model', 'default completion adjudication should treat local lifecycle state as authority');
assert.equal(adjudicatedDefault.candidate_completion?.source, 'redis');

const adjudicatedNonterminal = completionAdjudicatorMod.adjudicateCompletionEvidence({
  targetKind: 'module',
  targetId: '01',
  expectedStatuses: ['PASS', 'FAIL', 'BLOCKED'],
  expectedIdentity: { run_id: 'run-status-store-slice-1', attempt: 1, dispatch_id: 'dispatch-1' },
  redisEntry: { status: 'PASS', source: 'buster-pipeline', run_id: 'run-status-store-slice-1', attempt: 1, dispatch_id: 'dispatch-1' },
  status: { status: 'TESTING' },
  preferRedis: true,
});
assert.equal(adjudicatedNonterminal.authority_source, 'redis');
assert.equal(adjudicatedNonterminal.authority_policy.code, 'redis_terminal_confirmed_by_active_dispatch');
assert.equal(adjudicatedNonterminal.drift.some((entry) => entry.code === 'redis_terminal_confirmed_by_active_dispatch'), true);

const adjudicatedTerminalConflict = completionAdjudicatorMod.adjudicateCompletionEvidence({
  targetKind: 'module',
  targetId: '01',
  expectedStatuses: ['PASS', 'FAIL', 'BLOCKED'],
  expectedIdentity: { run_id: 'run-status-store-slice-1', attempt: 1, dispatch_id: 'dispatch-1' },
  redisEntry: { status: 'PASS', source: 'buster-pipeline', run_id: 'run-status-store-slice-1', attempt: 1, dispatch_id: 'dispatch-1' },
  status: { status: 'FAIL' },
});
assert.equal(adjudicatedTerminalConflict.authority_policy.code, 'redis_terminal_conflicts_with_terminal_status');
assert.equal(adjudicatedTerminalConflict.completion_conflict, true);
assert.equal(adjudicatedTerminalConflict.authority_source, 'lifecycle_read_model');

assert.equal(completionAdjudicatorMod.shouldApplyRedisCompletionToStatus({
  moduleId: '01',
  expectedIdentity: { run_id: 'run-status-store-slice-1', attempt: 1, dispatch_id: 'dispatch-1' },
  redisEntry: { status: 'FAIL', source: 'buster-pipeline', run_id: 'run-status-store-slice-1', attempt: 1, dispatch_id: 'dispatch-1' },
  status: { status: 'TESTING' },
}).shouldApply, true);

progress.gates.quality = { type: 'buster', title: 'Quality Gate', output_file: 'gates/quality.json' };
fs.writeFileSync(path.join(config.paths.swarm_dir, 'quality-gate-status.json'), JSON.stringify({ status: 'PASS' }, null, 2) + '\n');
const gateProjection = mainMod.projectGateSchedulerState(config, 'quality', progress.gates.quality);
assert.equal(gateProjection.completed, false);
assert.equal(gateProjection.legacy_evidence_source, 'legacy_status:gate-status.json');

fs.rmSync(tmpRoot, { recursive: true, force: true });

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 97 }));
