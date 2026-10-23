import { publishedControlConfig } from './fixtures/published-config.mjs';
import { fileURLToPath } from 'node:url';
import { captureSwarmSettings, type PrismWorkerSettings, type PrismSupervisorSettings, type PrismNonceDatabaseSettings, type PrismNativeSettings } from '../../common/plugin-runtime/foundation/config/swarm.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prismSupervisorSettings, type nativePrismSupervisorConfig } from '../config/native-worker.ts';
import { nativePrismCommand } from '../server/native-worker-execution.ts';
import { NativeWorkerOutputSpool } from '../../worker/core/worker/native-output-spool.ts';
const configRoot = fileURLToPath(new URL('../../../config/', import.meta.url));
const defaults = JSON.parse(fs.readFileSync(path.join(configRoot, 'components/prism-worker.config.json'), 'utf8')).profiles.standard.settings.supervisor;
const legacy = ['UID', 'GID', 'MAXIMUM_OWNERSHIP_RECORDS', 'MAXIMUM_OWNERSHIP_BYTES', 'MAXIMUM_OUTPUT_BYTES',
  'MAXIMUM_JOURNAL_BYTES', 'POLL_INTERVAL_MS', 'DRAIN_TIMEOUT_MS', 'CLOSE_TIMEOUT_MS'].map(key => `PRISM_NATIVE_${key}`);
function fixture(t: test.TestContext, supervisor: unknown) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-supervisor-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(configRoot, root, { recursive: true });
  const file = path.join(root, 'components/prism-worker.config.json');
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  value.profiles.standard.settings.supervisor = supervisor;
  fs.writeFileSync(file, JSON.stringify(value));
  const load = () => {
    const entryFile = path.join(root, 'pipeline.config.json');
    const entry = JSON.parse(fs.readFileSync(entryFile, 'utf8'));
    const instanceId = 'kubeclaw/prism/prism-worker';
    const captured = captureSwarmSettings(entryFile, { role: 'prism', callerId: 'prism-worker', serviceInstanceId: instanceId,
      bindings: entry.bindings.filter((binding: { instanceId: string }) => binding.instanceId === instanceId)
        .map(({ role: _role, ...binding }: { role: string; owner: string; instanceId: string; profileId: string }) => binding) });
    const worker = captured.components['prism-worker']!.settings as unknown as {
      ingress: PrismWorkerSettings; supervisor: PrismSupervisorSettings; nonceDatabase: PrismNonceDatabaseSettings };
    const execution = captured.components['prism-execution']!.settings as unknown as Pick<PrismNativeSettings, 'resourcePolicy' | 'maximumResultBytes'>;
    const control = captured.components['prism-control']!.settings;
    // Consumer regression only; no verified boot or privileged native-host capability.
    return Object.freeze({ ingress: worker.ingress, port: worker.ingress.port, shutdownTimeoutMs: worker.ingress.shutdownTimeoutMs,
      native: Object.freeze({ ...execution, supervisor: worker.supervisor, dispatchTimeoutMs: control.dispatchTimeoutMs as number }),
      nonceDatabase: worker.nonceDatabase, controlInternalUrl: new URL(control.controlInternalUrl as string),
      spiffeEnabled: false, workerSecret: 'test', trustedControlSpiffeId: '', databaseUrl: 'postgresql://not-opened' });
  };
  return { root, file, value, load, env: { PRISM_WORKER_SECRET: 'test', DATABASE_URL: 'postgresql://not-opened' } };
}
for (const key of Object.keys(defaults)) for (const invalid of [undefined, null, '1', 0, -1, 1.5,
  key === 'maximumJournalBytes' ? Number.MAX_SAFE_INTEGER + 1 : 2147483648]) {
  test(`CS1 supervisor ${key} rejects ${String(invalid)}`, async t => {
    await assert.rejects(() => publishedControlConfig(t, {}, { supervisor: { ...defaults, [key]: invalid } }), /SWARM_CONFIG_INVALID/);
  });
}
for (const value of [undefined, null, { ...defaults, unknown: 1 }]) test('CS1 strict supervisor object', async t => {
  await assert.rejects(() => publishedControlConfig(t, {}, { supervisor: value }), /SWARM_CONFIG_INVALID/);
});
for (const key of legacy) test(`CS2 old ${key} is rejected even empty`, async t => {
  const {workerCapture, loadWorkerConfig: configured} = await publishedControlConfig(t, {}, {});
  const environment = { WORKER_TRUST_SPIFFE_ENABLED: 'true', PRISM_TRUSTED_CONTROL_SPIFFE_ID: 'spiffe://local/control' };
  for (const value of ['', '1']) assert.throws(() => configured(workerCapture, { ...environment, [key]: value }), /SWARM_CONFIG_LEGACY_OVERRIDE/);
});
for (const drainTimeoutMs of [14999, 15000, 15001]) test(`CS4 combined close plus drain ${drainTimeoutMs}`, async t => {
  const publication = () => publishedControlConfig(t, {}, { supervisor: { ...defaults, drainTimeoutMs } });
  if (drainTimeoutMs < 15000) {
    const f = await publication();
    const worker = f.loadWorkerConfig(f.workerCapture, { WORKER_TRUST_SPIFFE_ENABLED: 'true',
      PRISM_TRUSTED_CONTROL_SPIFFE_ID: 'spiffe://local/control' });
    assert.equal(worker.shutdownTimeoutMs, 120000);
    assert.equal(prismSupervisorSettings(worker).drainTimeoutMs, drainTimeoutMs);
  } else await assert.rejects(publication(), /SHUTDOWN_BUDGET_INVALID/);
});
for (const factor of [1, 2]) test(`CS3 production mapping and actual output spool profile ${factor}`, async t => {
  const supervisor = { uid: 1000 + factor, gid: 2000 + factor, maximumOwnershipRecords: factor,
    maximumOwnershipBytes: 8192 * factor, maximumOutputBytes: 8 * factor, maximumJournalBytes: 16384 * factor,
    pollIntervalMs: 3 * factor, drainTimeoutMs: 7 * factor, closeTimeoutMs: 11 * factor };
  const f = await publishedControlConfig(t, {}, { supervisor });
  const worker = f.loadWorkerConfig(f.workerCapture, { WORKER_TRUST_SPIFFE_ENABLED: 'true',
    PRISM_TRUSTED_CONTROL_SPIFFE_ID: 'spiffe://local/control' });
  assert.ok(Object.isFrozen(worker.native.supervisor));
  const authorFile = path.join(f.author, 'components/prism-worker.config.json');
  const authorValue = JSON.parse(fs.readFileSync(authorFile, 'utf8'));
  authorValue.profiles.standard.settings.supervisor = defaults;
  fs.writeFileSync(authorFile, JSON.stringify(authorValue));
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
test('CS2 startup snapshot ignores later legacy environment changes', async t => {
  const f = await publishedControlConfig(t, {}, {});
  const worker = f.loadWorkerConfig(f.workerCapture, { WORKER_TRUST_SPIFFE_ENABLED: 'true',
    PRISM_TRUSTED_CONTROL_SPIFFE_ID: 'spiffe://local/control' });
  const before = prismSupervisorSettings(worker);
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
test('CS1 journal safe-integer ceiling and timer/identity integer ceilings remain distinct', async t => {
  const value = { ...defaults, uid: 2147483647, gid: 2147483647, maximumOwnershipRecords: 2147483647,
    maximumOwnershipBytes: 2147483647, maximumOutputBytes: 2147483647, maximumJournalBytes: Number.MAX_SAFE_INTEGER,
    pollIntervalMs: 2147483647 };
  const f = await publishedControlConfig(t, {}, { supervisor: value });
  const worker = f.loadWorkerConfig(f.workerCapture, { WORKER_TRUST_SPIFFE_ENABLED: 'true',
    PRISM_TRUSTED_CONTROL_SPIFFE_ID: 'spiffe://local/control' });
  assert.deepEqual(worker.native.supervisor, value);
});
