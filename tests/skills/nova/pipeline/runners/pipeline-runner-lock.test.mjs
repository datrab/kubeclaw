import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  acquirePipelineRunLock,
  releasePipelineRunLock,
} from '../../../../../skills/nova/pipeline/runners/pipeline-runner-lock.ts';

function testConfig(dir, runId) {
  return {
    project: 'lock-test',
    _runId: runId,
    paths: { swarm_dir: dir },
    locks: {
      pipeline_run: {
        lease_ms: 2000,
        heartbeat_ms: 1000,
        mutation_stale_ms: 1,
        abort_settle_ms: 0,
      },
    },
  };
}

function expireLock(lockPath) {
  const parsed = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const expiredAt = new Date(Date.now() - 1000).toISOString();
  fs.writeFileSync(lockPath, JSON.stringify({
    ...parsed,
    heartbeat_at: expiredAt,
    lease_expires_at: expiredAt,
    stale_at: expiredAt,
  }, null, 2) + '\n');
}

function readLock(lockPath) {
  return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('pipeline lock heartbeat refreshes the owner without losing the lock', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-lock-heartbeat-'));
  const config = testConfig(dir, 'run-heartbeat');
  config.locks.pipeline_run.lease_ms = 3000;
  config.locks.pipeline_run.heartbeat_ms = 1000;
  const lock = acquirePipelineRunLock(config);
  const first = readLock(lock.path);

  try {
    await sleep(1200);
    lock.heartbeat.assertActive();
    const refreshed = readLock(lock.path);
    assert.equal(refreshed.token, first.token);
    assert.notEqual(refreshed.heartbeat_at, first.heartbeat_at);
    assert.equal(lock.heartbeat.lost, false);
  } finally {
    releasePipelineRunLock(lock);
  }
});

test('reclaimed pipeline lock makes the previous owner fail its active assertion', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-lock-'));
  const first = acquirePipelineRunLock(testConfig(dir, 'run-a'));
  first.heartbeat.stop();
  expireLock(first.path);

  const second = acquirePipelineRunLock(testConfig(dir, 'run-b'));
  try {
    assert.notEqual(second.token, first.token);
    assert.throws(
      () => first.heartbeat.assertActive(),
      /Pipeline runtime lock lost: pipeline_run_lock_heartbeat_owner_lost/,
    );
  } finally {
    releasePipelineRunLock(first);
    releasePipelineRunLock(second);
  }
});

test('stale mutation guard does not permanently block stale lock reclaim', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-lock-mutation-'));
  const first = acquirePipelineRunLock(testConfig(dir, 'run-a'));
  first.heartbeat.stop();
  expireLock(first.path);

  const mutationDir = `${first.path}.mutation`;
  fs.mkdirSync(mutationDir);
  const old = new Date(Date.now() - 10000);
  fs.utimesSync(mutationDir, old, old);

  const second = acquirePipelineRunLock(testConfig(dir, 'run-b'));
  try {
    assert.notEqual(second.token, first.token);
    assert.equal(fs.existsSync(mutationDir), false);
  } finally {
    releasePipelineRunLock(second);
    releasePipelineRunLock(first);
  }
});
