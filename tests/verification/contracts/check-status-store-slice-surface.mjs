import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';
import { pathToFileURL } from 'url';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

const { sourceRoot } = parseArgs();
const mainPath = path.join(sourceRoot, 'skills/nova/pipeline/services/status-store.js');
const lifecyclePath = path.join(sourceRoot, 'skills/nova/pipeline/services/status-store-lifecycle.js');
const compatPath = path.join(sourceRoot, 'skills/nova/pipeline/services/status-store-compat.js');

const mainSource = fs.readFileSync(mainPath, 'utf8');
const lifecycleSource = fs.readFileSync(lifecyclePath, 'utf8');
const compatSource = fs.readFileSync(compatPath, 'utf8');

for (const marker of [
  "from './status-store-lifecycle.js'",
  "from './status-store-compat.js'",
  "export {\n  appendCooldownLifecycleEvent,",
  "export {\n  gateOutputExists,",
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
  'export function projectGateCompatibilityState(',
  'export function syncApprovalWaitState(',
  'export function projectModuleCompatibilityState(',
  'export function readGateOutput(',
  'export function gateOutputExists(',
  'export function readGateStatusJson(',
  'export function readBusterGateCompletion(',
]) {
  assert.equal(compatSource.includes(marker), true, `status-store compat helper should export ${marker}`);
}

for (const disallowed of [
  'function applyLifecycleEventToReadModels(',
  'function ensureLifecycleEventLegal(',
  'function normalizeCompatibilityGateStatus(',
  'function projectStatusIntoReadModels(',
]) {
  assert.equal(mainSource.includes(disallowed), false, `status-store main surface must not keep extracted helper ${disallowed}`);
}

const mainMod = await import(pathToFileURL(mainPath).href);
const lifecycleMod = await import(pathToFileURL(lifecyclePath).href);
const compatMod = await import(pathToFileURL(compatPath).href);

for (const [mod, name] of [
  [mainMod, 'initLogDir'],
  [mainMod, 'loadStatus'],
  [mainMod, 'saveStatus'],
  [mainMod, 'appendPipelineLifecycleEvent'],
  [mainMod, 'loadLifecycleReadModels'],
  [mainMod, 'getAuthoritativeModuleState'],
  [mainMod, 'syncApprovalWaitState'],
  [mainMod, 'readGateOutput'],
  [lifecycleMod, 'appendLifecycleEvent'],
  [lifecycleMod, 'appendModuleLifecycleEvent'],
  [lifecycleMod, 'loadLifecycleReadModels'],
  [lifecycleMod, 'readLifecycleEvents'],
  [compatMod, 'projectGateCompatibilityState'],
  [compatMod, 'projectModuleCompatibilityState'],
  [compatMod, 'syncApprovalWaitState'],
  [compatMod, 'readBusterGateCompletion'],
]) {
  assert.equal(typeof mod[name], 'function', `${name} should be exported`);
}

const tmpRoot = fs.mkdtempSync(path.join('/home/node/.openclaw/workspace', 'status-store-slice-'));
const config = {
  project: 'status-store-slice-contract',
  repo_root: tmpRoot,
  _runId: 'run-status-store-slice-1',
  compatibility: { legacy_module_status_bootstrap_mode: 'migration_only' },
  paths: {
    swarm_dir: path.join(tmpRoot, '.swarm'),
    modules_dir: path.join(tmpRoot, 'modules'),
  },
};
fs.mkdirSync(config.paths.swarm_dir, { recursive: true });
fs.mkdirSync(config.paths.modules_dir, { recursive: true });
config._logDir = path.join(config.paths.swarm_dir, 'logs');
fs.mkdirSync(config._logDir, { recursive: true });

const progress = {
  execution_order: ['01', 'gate:release-approval'],
  modules: {
    '01': { title: 'Module 01', dir: '01', stages: ['forge', 'buster'] },
  },
  gates: {
    'release-approval': { type: 'approval', title: 'Release approval' },
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

const status = mainMod.initStatus('01', { title: 'Module 01' });
status.status = 'READY_FOR_TESTING';
status.current_phase = null;
status.fail_count = 0;
mainMod.saveStatus(config, '01', status);

const authoritativeModule = mainMod.getAuthoritativeModuleState(config, '01', { dir: '01', status });
assert.equal(authoritativeModule.status, 'READY_FOR_TESTING');
assert.equal(mainMod.loadStatus(config, '01').status, 'READY_FOR_TESTING');

console.log(JSON.stringify({ ok: true, checked: 27 }));
