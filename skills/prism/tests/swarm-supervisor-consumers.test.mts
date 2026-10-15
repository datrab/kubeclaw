import { fileURLToPath } from 'node:url';
import { captureSwarmSettings, type PrismWorkerSettings, type PrismSupervisorSettings, type PrismNonceDatabaseSettings, type PrismNativeSettings } from '../../common/plugin-runtime/foundation/config/swarm.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { NativeWorkerOwnership } from '@kubeclaw/worker-core';
import { observeNativeProcessBoundary, observedProcessLimits } from './fixtures/native-process-boundary.mts';
import { ownershipTerminalCapacityBytes } from '../../worker/core/worker/ownership-capacity.ts';
import type { nativePrismSupervisorConfig } from '../config/native-worker.ts';
const observation = observeNativeProcessBoundary();
const { FileWorkerOwnershipStore } = await import('@kubeclaw/worker-core');
const { nativePrismExecution } = await import('../server/native-worker-execution.ts');
const { prismSupervisorSettings } = await import('../config/native-worker.ts');
const { prismNativeAttempt } = await import('../engine/worker-envelope.ts');
observation.deregister();

function fixture(t: test.TestContext, changes: Record<string, number>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-supervisor-consumers-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(fileURLToPath(new URL('../../../config/', import.meta.url)), root, { recursive: true });
  const authorFile = path.join(root, 'components/prism-worker.config.json');
  const author = JSON.parse(fs.readFileSync(authorFile, 'utf8'));
  Object.assign(author.profiles.standard.settings.supervisor, changes);
  fs.writeFileSync(authorFile, JSON.stringify(author));
  const entryFile = path.join(root, 'pipeline.config.json');
  const entry = JSON.parse(fs.readFileSync(entryFile, 'utf8'));
  const instanceId = 'kubeclaw/prism/prism-worker';
  const captured = captureSwarmSettings(entryFile, { role: 'prism', callerId: 'prism-worker', serviceInstanceId: instanceId,
    bindings: entry.bindings.filter((binding: { instanceId: string }) => binding.instanceId === instanceId)
      .map(({ role: _role, ...binding }: { role: string; owner: string; instanceId: string; profileId: string }) => binding) });
  const worker = captured.components['prism-worker']!.settings as unknown as {
    ingress: PrismWorkerSettings; supervisor: PrismSupervisorSettings; nonceDatabase: PrismNonceDatabaseSettings };
  const execution = captured.components['prism-execution']!.settings as unknown as Pick<PrismNativeSettings, 'resourcePolicy' | 'maximumResultBytes' | 'enginePolicy'>;
  const control = captured.components['prism-control']!.settings;
  // Consumer regression only: central selection, not a verified boot or privileged host capability.
  const config = { maximumArtifactAcknowledgmentBytes: control.maximumArtifactAcknowledgmentBytes as number, ingress: worker.ingress, port: worker.ingress.port, shutdownTimeoutMs: worker.ingress.shutdownTimeoutMs,
    native: { ...execution, supervisor: worker.supervisor, dispatchTimeoutMs: control.dispatchTimeoutMs as number },
    nonceDatabase: worker.nonceDatabase, controlInternalUrl: new URL(control.controlInternalUrl as string),
    spiffeEnabled: false, workerSecret: 'test', trustedControlSpiffeId: '', databaseUrl: 'postgresql://not-opened' };
  return { root, config, numeric: prismSupervisorSettings(config) };
}
const identity = (index: number) => ({ workerId: 'prism', attemptId: `attempt:${index}`, claimId: `claim:${index}`,
  generation: 1, profileDigest: `sha256:${'a'.repeat(64)}`, attemptSpecDigest: `sha256:${'b'.repeat(64)}` });
function recordCountBudget(count: number): number {
  return ownershipTerminalCapacityBytes({ schemaVersion: 'worker-ownership-store.v3', hostIdentity: null,
    records: Array.from({ length: count }, (_value, index) => ({ identity: identity(index),
      scopeName: `worker-00000000-0000-0000-0000-${String(index).padStart(12, '0')}`, revision: 1,
      phase: 'reserved', binding: null, diagnosis: null, finalObservation: null,
      topology: { kind: 'aggregate.v1', children: [] } })) });
}
for (const maximumOwnershipRecords of [1, 2]) test(`CS3 real ownership store enforces ${maximumOwnershipRecords} authored records with representation-sized capacity`, async t => {
  // Separate profile: enough terminal bytes even for the rejected extra record.
  // The original 8192-byte profile below remains explicit zero-admission coverage.
  const maximumOwnershipBytes = recordCountBudget(maximumOwnershipRecords + 1);
  const f = fixture(t, { maximumOwnershipRecords, maximumOwnershipBytes });
  const store = new FileWorkerOwnershipStore(path.join(f.root, 'owners'), { maximumRecords: f.numeric.maximumRecords, maximumBytes: f.numeric.maximumBytes });
  for (let i = 0; i < maximumOwnershipRecords; i++) await store.reserve(identity(i));
  await assert.rejects(store.reserve(identity(maximumOwnershipRecords)), /WORKER_OWNERSHIP/);
  assert.equal((await store.records()).length, maximumOwnershipRecords);
  const byteControl = new FileWorkerOwnershipStore(path.join(f.root, 'byte-control'), { maximumRecords: maximumOwnershipRecords + 1, maximumBytes: maximumOwnershipBytes });
  for (let i = 0; i <= maximumOwnershipRecords; i++) await byteControl.reserve(identity(i));
  assert.equal((await byteControl.records()).length, maximumOwnershipRecords + 1, 'the original rejection must come from record count');
});
for (const maximumOwnershipBytes of [1, 8192]) test(`CS3 real ownership store enforces ${maximumOwnershipBytes} authored bytes`, async t => {
  const f = fixture(t, { maximumOwnershipRecords: 4, maximumOwnershipBytes });
  const store = new FileWorkerOwnershipStore(path.join(f.root, 'owners'), { maximumRecords: f.numeric.maximumRecords, maximumBytes: f.numeric.maximumBytes });
  await assert.rejects(store.reserve(identity(1)), /WORKER_OWNERSHIP_CAPACITY_EXCEEDED/);
  assert.deepEqual(await store.records(), [], 'small authored quotas cannot admit an unfinishable owner');
});
for (const factor of [1, 2]) test(`CS3 actual execution journal admission and process boundary profile ${factor}`, async t => {
  const f = fixture(t, { maximumJournalBytes: factor === 1 ? 1 : 268435456,
    maximumOwnershipRecords: 8, maximumOwnershipBytes: 262144, maximumOutputBytes: 128 * factor,
    pollIntervalMs: 3 * factor, closeTimeoutMs: 11 * factor, drainTimeoutMs: 7 * factor });
  // Deliberate pre-launch observer: real journal/executor runs, no scope or receipt is fabricated.
  let allocated: Record<string, number> | undefined; let fenced = false;
  const observationsBefore = observedProcessLimits.length;
  const marker = new Error('TEST_STOP_BEFORE_NATIVE_ALLOCATION');
  const owner = { isReady: () => true, record: async () => null, fenceAdmission: () => { fenced = true; },
    allocate: async (_identity: unknown, limits: Record<string, number>) => { allocated = limits; throw marker; } } as unknown as NativeWorkerOwnership;
  const native = { ...f.numeric, ownershipRoot: path.join(f.root, 'native'), launcher: '/not-invoked', browserPath: '/not-invoked',
    engineContentDigest: `sha256:${'a'.repeat(64)}` } as ReturnType<typeof nativePrismSupervisorConfig>;
  const execution = await nativePrismExecution(owner, native, f.config);
  const attempt = prismNativeAttempt('render', { artifactId: 'input:supervisor', type: 'prism-engine-input', mediaType: 'application/json',
    contentDigest: `sha256:${'a'.repeat(64)}`, sizeBytes: 2, storageUrl: 'https://control.example/input' }, `supervisor-${factor}`, f.config.native.resourcePolicy, 600000, 300000, 10000, 1048576, 16777216, 134217728, 64);
  if (factor === 1) {
    await assert.rejects(execution.execute(attempt, new AbortController().signal), /WORKER_NATIVE_JOURNAL_CAPACITY_EXCEEDED/);
    assert.equal(allocated, undefined);
  } else {
    await assert.rejects(execution.execute(attempt, new AbortController().signal), error => error === marker);
    assert.equal(observedProcessLimits.length, observationsBefore + 1);
    const processLimits = observedProcessLimits.at(-1) as Record<string, number>;
    assert.equal(processLimits.maximumOutputBytes, f.numeric.maximumOutputBytes);
    assert.equal(processLimits.pollIntervalMs, f.numeric.pollIntervalMs);
    assert.equal(processLimits.closeTimeoutMs, f.numeric.closeTimeoutMs);
    assert.deepEqual(allocated, { memoryBytes: f.config.native.resourcePolicy.memoryBytes, tasks: f.config.native.resourcePolicy.tasks });
  }
  assert.equal(fenced, true);
});
