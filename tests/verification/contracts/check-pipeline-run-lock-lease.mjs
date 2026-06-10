import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
installQuietRuntimeConsole({ label: 'contracts/check-pipeline-run-lock-lease' });

import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

const { sourceRoot } = parseArgs();
const recoveryPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner-recovery.ts');
const lockPathSource = path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner-lock.ts');
const recoverySource = fs.readFileSync(recoveryPath, 'utf8');
const lockSource = fs.readFileSync(lockPathSource, 'utf8');

for (const marker of [
  'PIPELINE_RUN_LOCK_SCHEMA_VERSION',
  'pipeline_run_lock_lease_ms',
  'heartbeat_at',
  'lease_expires_at',
  'stale_at',
  'startPipelineRunLockHeartbeat',
  'timer.unref',
  'heartbeat.stop',
  'empty lock file',
  'pipeline_run_lock_stale_reclaimed',
  'pipeline_run_lock_release_token_mismatch',
  'Manual cleanup required',
]) {
  assert.equal(lockSource.includes(marker), true, `leased run lock implementation should include ${marker}`);
}
assert.equal(lockSource.includes('pidAlive('), false, 'PID-only lock liveness must not remain as reclaim authority');
assert.equal(lockSource.includes('current?.malformed) return'), false, 'malformed release must not be silently ignored');
assert.equal(lockSource.includes('current.token !== lock.token) {'), true, 'token mismatch must be explicit release failure');
assert.equal(recoverySource.includes("from './pipeline-runner-lock.ts'"), true, 'recovery surface must re-export the lock helper');

const recoveryMod = await import(pathToFileURL(recoveryPath).href);
const swarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-lock-lease-'));
const config = {
  project: 'lock-lease-contract',
  repo_root: '/tmp/lock-lease-contract',
  _runId: 'run-lock-main',
  pipeline_run_lock_lease_ms: 100,
  pipeline_run_lock_heartbeat_ms: 1000,
  paths: { swarm_dir: swarmDir },
};
const lockPath = path.join(swarmDir, 'logs', 'pipeline', 'active-run.lock.json');

const lock = recoveryMod.acquirePipelineRunLock(config, { module: '01' });
const persisted = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
assert.equal(persisted.schema_version, 1);
assert.equal(persisted.run_id, 'run-lock-main');
assert.equal(persisted.module, '01');
assert.equal(typeof persisted.heartbeat_at, 'string');
assert.equal(typeof persisted.lease_expires_at, 'string');
assert.equal(typeof persisted.stale_at, 'string');
assert(Date.parse(persisted.lease_expires_at) > Date.parse(persisted.heartbeat_at));
assert.equal(lock.heartbeat.stopped, false);

assert.throws(
  () => recoveryMod.releasePipelineRunLock({ path: lockPath, token: 'wrong-token', config }),
  /token mismatch/,
);
assert.equal(fs.existsSync(lockPath), true, 'token mismatch must not delete active lock');
assert.equal(fs.existsSync(path.join(swarmDir, 'logs', 'pipeline', 'operator-alerts.jsonl')), true, 'token mismatch should write durable CRITICAL alert evidence');

recoveryMod.releasePipelineRunLock(lock);
assert.equal(lock.heartbeat.stopped, true, 'release should stop heartbeat timer');
assert.equal(fs.existsSync(lockPath), false);

fs.writeFileSync(lockPath, '');
assert.throws(
  () => recoveryMod.acquirePipelineRunLock(config, { module: '02' }),
  /malformed and cannot be safely reclaimed|Manual cleanup required/,
);
assert.equal(fs.existsSync(lockPath), true, 'corrupt lock must fail closed and remain for manual cleanup');
fs.unlinkSync(lockPath);

const expired = {
  schema_version: 1,
  token: 'expired-token',
  pid: 999999,
  hostname: 'other-host',
  project: config.project,
  run_id: 'expired-run',
  module: '03',
  resume: false,
  acquired_at: '2026-01-01T00:00:00.000Z',
  heartbeat_at: '2026-01-01T00:00:00.000Z',
  lease_expires_at: '2026-01-01T00:00:01.000Z',
  stale_at: '2026-01-01T00:00:01.000Z',
  lease_ms: 100,
  heartbeat_ms: 50,
  repo_root: '/tmp/expired',
};
fs.writeFileSync(lockPath, `${JSON.stringify(expired, null, 2)}\n`);
const reclaimed = recoveryMod.acquirePipelineRunLock(config, { module: '04', resume: true });
const reclaimedPersisted = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
assert.equal(reclaimedPersisted.run_id, 'run-lock-main');
assert.equal(reclaimedPersisted.module, '04');
assert.equal(reclaimedPersisted.resume, true);
assert.notEqual(reclaimedPersisted.token, 'expired-token');
recoveryMod.releasePipelineRunLock(reclaimed);

console.log(JSON.stringify({ ok: true, checked: 19 }));
