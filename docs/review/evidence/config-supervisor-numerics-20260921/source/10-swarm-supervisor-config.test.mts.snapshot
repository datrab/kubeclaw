import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadWorkerConfig } from '../server/worker-config.ts';
import { prismSupervisorSettings, type nativePrismSupervisorConfig } from '../config/native-worker.ts';
import { nativePrismCommand } from '../server/native-worker-execution.ts';
import { NativeWorkerOutputSpool } from '../../worker/core/worker/native-output-spool.ts';
const authored = JSON.parse(fs.readFileSync(new URL('../../../charts/kubeclaw/files/config/swarm.config.json', import.meta.url), 'utf8'));
const defaults = authored.operator.prism.native.supervisor;
const legacy = ['UID', 'GID', 'MAXIMUM_OWNERSHIP_RECORDS', 'MAXIMUM_OWNERSHIP_BYTES', 'MAXIMUM_OUTPUT_BYTES',
  'MAXIMUM_JOURNAL_BYTES', 'POLL_INTERVAL_MS', 'DRAIN_TIMEOUT_MS', 'CLOSE_TIMEOUT_MS'].map(key => `PRISM_NATIVE_${key}`);
function fixture(t: test.TestContext, supervisor: unknown) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-supervisor-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const value = structuredClone(authored); value.operator.prism.native.supervisor = supervisor;
  const file = path.join(root, 'swarm.config.json'); fs.writeFileSync(file, JSON.stringify(value));
  return { root, file, value, env: { SWARM_CONFIG: file, PRISM_WORKER_SECRET: 'test', DATABASE_URL: 'postgresql://not-opened' } };
}
for (const key of Object.keys(defaults)) for (const invalid of [undefined, null, '1', 0, -1, 1.5,
  key === 'maximumJournalBytes' ? Number.MAX_SAFE_INTEGER + 1 : 2147483648]) {
  test(`CS1 supervisor ${key} rejects ${String(invalid)}`, t => {
    const f = fixture(t, { ...defaults, [key]: invalid });
    assert.throws(() => loadWorkerConfig(f.env), /SWARM_CONFIG_INVALID/);
  });
}
for (const value of [undefined, null, { ...defaults, unknown: 1 }]) test('CS1 strict supervisor object', t => {
  assert.throws(() => loadWorkerConfig(fixture(t, value).env), /SWARM_CONFIG_INVALID/);
});
for (const key of legacy) test(`CS2 old ${key} is rejected even empty`, t => {
  const f = fixture(t, defaults);
  for (const value of ['', '1']) assert.throws(() => loadWorkerConfig({ ...f.env, [key]: value }), /SWARM_CONFIG_LEGACY_OVERRIDE/);
});
for (const drainTimeoutMs of [14999, 15000, 15001]) test(`CS4 combined close plus drain ${drainTimeoutMs}`, t => {
  const f = fixture(t, { ...defaults, drainTimeoutMs });
  if (drainTimeoutMs < 15000) assert.equal(loadWorkerConfig(f.env).shutdownTimeoutMs, 120000);
  else assert.throws(() => loadWorkerConfig(f.env), /SHUTDOWN_BUDGET_INVALID/);
});
for (const factor of [1, 2]) test(`CS3 production mapping and actual output spool profile ${factor}`, async t => {
  const supervisor = { uid: 1000 + factor, gid: 2000 + factor, maximumOwnershipRecords: factor,
    maximumOwnershipBytes: 8192 * factor, maximumOutputBytes: 8 * factor, maximumJournalBytes: 16384 * factor,
    pollIntervalMs: 3 * factor, drainTimeoutMs: 7 * factor, closeTimeoutMs: 11 * factor };
  const f = fixture(t, supervisor), worker = loadWorkerConfig(f.env);
  assert.ok(Object.isFrozen(worker.native.supervisor));
  f.value.operator.prism.native.supervisor = defaults; fs.writeFileSync(f.file, JSON.stringify(f.value));
  const native = prismSupervisorSettings(worker);
  assert.equal(native.uid, supervisor.uid); assert.equal(native.gid, supervisor.gid);
  assert.equal(native.maximumRecords, supervisor.maximumOwnershipRecords); assert.equal(native.maximumBytes, supervisor.maximumOwnershipBytes);
  for (const key of ['maximumOutputBytes', 'maximumJournalBytes', 'pollIntervalMs', 'drainTimeoutMs', 'closeTimeoutMs'] as const) {
    assert.equal(native[key], supervisor[key]);
  }
  // Command transport only: no privileged host or root-owned policy is fabricated.
  const command = nativePrismCommand({ ...native, launcher: '/not-invoked', browserPath: '/not-invoked',
    engineContentDigest: `sha256:${'a'.repeat(64)}` } as ReturnType<typeof nativePrismSupervisorConfig>, worker);
  assert.equal(command.uid, supervisor.uid); assert.equal(command.gid, supervisor.gid);
  assert.ok(legacy.every(key => !(key in command.environment)));
  const spool = await NativeWorkerOutputSpool.create(path.join(f.root, 'output'), native.maximumOutputBytes);
  try {
    await spool.append('stdout', Buffer.alloc(8));
    if (factor === 1) await assert.rejects(spool.append('stderr', Buffer.alloc(1)), /WORKER_OUTPUT_SPOOL_LIMIT/);
    else await spool.append('stderr', Buffer.alloc(8));
    await assert.rejects(spool.append('stdout', Buffer.alloc(1)), /WORKER_OUTPUT_SPOOL_LIMIT/);
  } finally { await spool.close(); }
});
test('CS2 startup snapshot ignores later legacy environment changes', t => {
  const f = fixture(t, defaults), worker = loadWorkerConfig(f.env), before = prismSupervisorSettings(worker);
  const previous = legacy.map(key => process.env[key]);
  try {
    for (const key of legacy) process.env[key] = 'invalid';
    assert.deepEqual(prismSupervisorSettings(worker), before);
  } finally {
    for (const [index, key] of legacy.entries()) {
      if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index];
    }
  }
});
test('CS1 journal safe-integer ceiling and timer/identity integer ceilings remain distinct', t => {
  const value = { ...defaults, uid: 2147483647, gid: 2147483647, maximumOwnershipRecords: 2147483647,
    maximumOwnershipBytes: 2147483647, maximumOutputBytes: 2147483647, maximumJournalBytes: Number.MAX_SAFE_INTEGER,
    pollIntervalMs: 2147483647 };
  assert.deepEqual(loadWorkerConfig(fixture(t, value).env).native.supervisor, value);
});
