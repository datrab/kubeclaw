import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { gateActiveSessionPath } from '../../../../../skills/nova/pipeline/core/paths.ts';
import { clearGateActiveSession, persistGateActiveSession } from '../../../../../skills/nova/pipeline/services/gate-active-session.ts';

function makeConfig() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-active-session-test-'));
  const swarmDir = path.join(root, '.swarm');
  fs.mkdirSync(swarmDir, { recursive: true });
  return {
    project: 'gate-active-session-test',
    repo_root: root,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(swarmDir, 'modules'),
    },
    _runId: 'run-test',
    run_id: 'run-test',
  };
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function waitUntilSync(predicate, timeoutMs = 2000) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) return false;
    sleepSync(10);
  }
  return true;
}

function sessionKeyAt(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')).session_key;
  } catch {
    return null;
  }
}

function spawnReplacementPersist(config, gateId) {
  return spawn(process.execPath, ['--input-type=module', '-e', `
    import path from 'node:path';
    import { pathToFileURL } from 'node:url';
    const { persistGateActiveSession } = await import(pathToFileURL(path.join(process.cwd(), 'skills/nova/pipeline/services/gate-active-session.ts')).href);
    const config = JSON.parse(process.env.GATE_ACTIVE_SESSION_CONFIG);
    const ok = persistGateActiveSession(config, process.env.GATE_ID, 'gate-b', { sessionKey: 'session-b' }, {
      run_id: 'run-b',
      attempt: 2,
      dispatch_id: 'dispatch-b',
      gateway_label: 'gateway-b',
    });
    process.exit(ok ? 0 : 2);
  `], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      GATE_ACTIVE_SESSION_CONFIG: JSON.stringify(config),
      GATE_ID: gateId,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function waitForChild(child) {
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`replacement persist exited code=${code} signal=${signal || ''} stdout=${stdout} stderr=${stderr}`));
    });
  });
}

test('persistGateActiveSession uses isolated temp paths for active-session writes', () => {
  const config = makeConfig();
  const gateId = 'quality';
  const activeSessionPath = gateActiveSessionPath(config, gateId);
  const originalRenameSync = fs.renameSync;
  const tmpPaths = [];

  fs.renameSync = function patchedRenameSync(from, to, ...args) {
    if (to === activeSessionPath) tmpPaths.push(from);
    return originalRenameSync.call(this, from, to, ...args);
  };

  try {
    assert.equal(persistGateActiveSession(config, gateId, 'gate-a', { sessionKey: 'session-a' }, {
      run_id: 'run-a',
      attempt: 1,
      dispatch_id: 'dispatch-a',
      gateway_label: 'gateway-a',
    }), true);
    assert.equal(persistGateActiveSession(config, gateId, 'gate-b', { sessionKey: 'session-b' }, {
      run_id: 'run-b',
      attempt: 2,
      dispatch_id: 'dispatch-b',
      gateway_label: 'gateway-b',
    }), true);
  } finally {
    fs.renameSync = originalRenameSync;
  }

  assert.equal(tmpPaths.length, 2);
  assert.notEqual(tmpPaths[0], tmpPaths[1]);
  for (const tmpPath of tmpPaths) {
    assert.equal(tmpPath.startsWith(`${activeSessionPath}.`), true);
    assert.equal(tmpPath.endsWith('.tmp'), true);
    assert.equal(fs.existsSync(tmpPath), false);
  }
  assert.equal(sessionKeyAt(activeSessionPath), 'session-b');
});

test('clearGateActiveSession preserves replacement session when stale cleanup sees replacement first', () => {
  const config = makeConfig();
  const gateId = 'quality';
  const activeSessionPath = gateActiveSessionPath(config, gateId);

  assert.equal(persistGateActiveSession(config, gateId, 'gate-a', { sessionKey: 'session-a' }, {
    run_id: 'run-a',
    attempt: 1,
    dispatch_id: 'dispatch-a',
    gateway_label: 'gateway-a',
  }), true);
  assert.equal(persistGateActiveSession(config, gateId, 'gate-b', { sessionKey: 'session-b' }, {
    run_id: 'run-b',
    attempt: 2,
    dispatch_id: 'dispatch-b',
    gateway_label: 'gateway-b',
  }), true);

  assert.equal(clearGateActiveSession(config, gateId, {
    run_id: 'run-a',
    telemetry_attempt: 1,
    telemetry_dispatch_id: 'dispatch-a',
    sessionKey: 'session-a',
    gatewayLabel: 'gateway-a',
  }), false);

  assert.equal(fs.existsSync(activeSessionPath), true);
  assert.equal(JSON.parse(fs.readFileSync(activeSessionPath, 'utf8')).session_key, 'session-b');

  assert.equal(clearGateActiveSession(config, gateId, {
    run_id: 'run-b',
    telemetry_attempt: 2,
    telemetry_dispatch_id: 'dispatch-b',
    sessionKey: 'session-b',
    gatewayLabel: 'gateway-b',
  }), true);
  assert.equal(fs.existsSync(activeSessionPath), false);
});

test('clearGateActiveSession serializes replacement attempted between identity check and unlink', async () => {
  const config = makeConfig();
  const gateId = 'quality';
  const activeSessionPath = gateActiveSessionPath(config, gateId);
  const lockPath = `${activeSessionPath}.lock`;
  let replacementChild = null;
  const originalUnlinkSync = fs.unlinkSync;

  assert.equal(persistGateActiveSession(config, gateId, 'gate-a', { sessionKey: 'session-a' }, {
    run_id: 'run-a',
    attempt: 1,
    dispatch_id: 'dispatch-a',
    gateway_label: 'gateway-a',
  }), true);

  fs.unlinkSync = function patchedUnlinkSync(filePath, ...args) {
    if (filePath === activeSessionPath && !replacementChild) {
      replacementChild = spawnReplacementPersist(config, gateId);
      if (!fs.existsSync(lockPath)) {
        assert.equal(waitUntilSync(() => sessionKeyAt(activeSessionPath) === 'session-b'), true);
      }
    }
    return originalUnlinkSync.call(this, filePath, ...args);
  };

  try {
    assert.equal(clearGateActiveSession(config, gateId, {
      run_id: 'run-a',
      telemetry_attempt: 1,
      telemetry_dispatch_id: 'dispatch-a',
      sessionKey: 'session-a',
      gatewayLabel: 'gateway-a',
    }), true);
  } finally {
    fs.unlinkSync = originalUnlinkSync;
  }

  assert.ok(replacementChild);
  await waitForChild(replacementChild);
  assert.equal(fs.existsSync(activeSessionPath), true);
  assert.equal(sessionKeyAt(activeSessionPath), 'session-b');
});
