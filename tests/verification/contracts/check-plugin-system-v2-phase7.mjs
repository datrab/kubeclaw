import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const core = await import(pathToFileURL(
  path.resolve('skills/nova/core/src/index.ts'),
).href);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-system-phase7-'));
const contendedJournalFile = path.join(root, 'contended.jsonl');
const appendLockFile = `${contendedJournalFile}.append-lock`;
const appendLockReady = `${appendLockFile}.ready`;
const lockHolder = spawn(process.execPath, ['-e', `
  const fs = require('node:fs');
  const { FileMutex } = require('./skills/nova/core/state/file-mutex.ts');
  new FileMutex(process.env.APPEND_LOCK_FILE, 5000, 'TEST_LOCK_TIMEOUT').withLock(() => {
    fs.writeFileSync(process.env.APPEND_LOCK_READY, 'ready');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150);
  });
`], {
  env: {
    ...process.env,
    APPEND_LOCK_FILE: appendLockFile,
    APPEND_LOCK_READY: appendLockReady,
  },
  stdio: 'ignore',
});
await new Promise((resolve, reject) => {
  const deadline = Date.now() + 5_000;
  const poll = () => {
    if (fs.existsSync(appendLockReady)) return resolve();
    if (lockHolder.exitCode !== null) return reject(new Error('append lock holder exited early'));
    if (Date.now() >= deadline) return reject(new Error('append lock holder did not become ready'));
    setTimeout(poll, 10);
  };
  poll();
});
const contentionStartedAt = Date.now();
new core.FileJournal(contendedJournalFile).append({ value: 'serialized' });
assert.ok(Date.now() - contentionStartedAt >= 50, 'journal append waits for a live writer');
if (lockHolder.exitCode === null) {
  await new Promise((resolve, reject) => {
    lockHolder.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`lock holder ${code}`)));
  });
} else {
  assert.equal(lockHolder.exitCode, 0);
}

const incrementalFile = path.join(root, 'incremental.jsonl');
const incrementalLeft = new core.FileJournal(incrementalFile);
const incrementalRight = new core.FileJournal(incrementalFile);
incrementalLeft.append({ writer: 'left', sequence: 1 });
incrementalRight.append({ writer: 'right', sequence: 2 });
incrementalLeft.append({ writer: 'left', sequence: 3 });
assert.deepEqual(incrementalRight.refresh().map(({ entry }) => entry.sequence), [1, 2, 3]);
const validPrefix = fs.readFileSync(incrementalFile);
incrementalLeft.append({ writer: 'left', sequence: 4 });
fs.writeFileSync(incrementalFile, validPrefix);
assert.throws(() => incrementalLeft.refresh(), /JOURNAL_REWIND_OR_DIVERGENCE/,
  'a replaced or truncated journal cannot roll back an already observed chain');
const sameSizeFile = path.join(root, 'same-size-tamper.jsonl');
const sameSizeJournal = new core.FileJournal(sameSizeFile);
sameSizeJournal.append({ value: 'trusted' });
const tampered = fs.readFileSync(sameSizeFile, 'utf8').replace('trusted', 'untrust');
fs.writeFileSync(sameSizeFile, tampered);
assert.throws(() => sameSizeJournal.refresh(), /JOURNAL_HASH_INVALID/,
  'same-size in-place journal tampering is detected without accepting a cached prefix');
const tornFile = path.join(root, 'torn-tail.jsonl');
const committedTornJournal = new core.FileJournal(tornFile);
committedTornJournal.append({ value: 'committed' });
const committedTornBytes = fs.statSync(tornFile).size;
fs.appendFileSync(tornFile, '{"sequence":2,"previousHash":"partial');
assert.deepEqual(committedTornJournal.refresh().map(({ entry }) => entry.value), ['committed'],
  'an already-open reader also removes an unterminated crash-torn tail');
const recoveredTornJournal = new core.FileJournal(tornFile);
assert.deepEqual(recoveredTornJournal.records().map(({ entry }) => entry.value), ['committed']);
assert.equal(fs.statSync(tornFile).size, committedTornBytes,
  'restart truncates only an unterminated final append to the last commit marker');
recoveredTornJournal.append({ value: 'after-recovery' });
assert.deepEqual(new core.FileJournal(tornFile).records().map(({ entry }) => entry.value),
  ['committed', 'after-recovery']);
const attempt = {
  runId: 'run:phase7',
  stageId: 'stage',
  attemptId: 'attempt:phase7:1',
  attemptNumber: 1,
};
const invalidExpiryLease = new core.RevocableLease({
  schemaVersion: 'invocation-lease.v2',
  leaseId: 'lease:invalid-expiry',
  attempt,
  status: 'active',
  issuedAt: '2026-07-28T00:00:00.000Z',
  expiresAt: 'not-a-timestamp',
  revokedAt: null,
  revocationReason: null,
}, () => new Date('2026-07-28T00:00:01.000Z'));
assert.throws(
  () => invalidExpiryLease.assertActive(),
  /PLUGIN_CONTEXT_EXPIRY_INVALID/,
  'an invalid expiry must fail closed instead of producing a non-expiring active lease',
);
const owner = {
  pluginId: 'example.adapter',
  apiVersion: 'pipeline-plugin-v2',
  packageVersion: '1.0.0',
  contentDigest: `sha256:${'a'.repeat(64)}`,
  registrationId: 'main',
};
const invocation = {
  idempotencyKey: 'effect-key:phase7',
  attempt,
  capability: 'artifact.write',
  operation: 'write',
  resource: { type: 'artifact.namespace', canonicalId: 'run:phase7' },
  payload: { value: 'durable' },
};
let calls = 0;
let observedLock;
const adapter = {
  async ready() {},
  async invoke({ request, lock, fence }) {
    fence.assertCurrent();
    calls += 1;
    observedLock = lock;
    return { effectId: request.effectId, accepted: true };
  },
  async shutdown() {},
};
const journalFile = path.join(root, 'effects.jsonl');
const coordinator = new core.EffectCoordinator(
  new core.FileEffectJournal(journalFile),
  () => new Date('2026-07-28T00:00:00Z'),
  undefined,
  new core.FileResourceLockManager(path.join(root, 'locks')),
);
const first = await coordinator.invoke(adapter, owner, invocation, new AbortController().signal);
const replay = await new core.EffectCoordinator(
  new core.FileEffectJournal(journalFile),
  () => new Date('2026-07-28T00:01:00Z'),
  undefined,
  new core.FileResourceLockManager(path.join(root, 'locks')),
).invoke(adapter, owner, invocation, new AbortController().signal);
assert.equal(calls, 1, 'durable receipt prevents duplicate external execution');
assert.equal(first.effectId, replay.effectId);
assert.match(first.effectId, /^effect:[a-f0-9]{64}$/);
assert.equal(observedLock.fencingToken, 1);
assert.equal(observedLock.resource.canonicalId, invocation.resource.canonicalId);

let preDispatchNow = new Date('2026-07-28T01:00:00.000Z');
const preDispatchLocks = new core.FileResourceLockManager(
  path.join(root, 'pre-dispatch-renewal-locks'),
  () => preDispatchNow,
);
const preDispatchCoordinator = new core.EffectCoordinator(
  new core.FileEffectJournal(path.join(root, 'pre-dispatch-renewal-effects.jsonl')),
  () => preDispatchNow,
  {
    requested() {},
    accepted() { preDispatchNow = new Date('2026-07-28T01:00:00.900Z'); },
    completed() {},
  },
  preDispatchLocks,
  1_000,
);
const preDispatchReceipt = await preDispatchCoordinator.invoke({
  async ready() {},
  async invoke({ fence }) {
    preDispatchNow = new Date('2026-07-28T01:00:01.100Z');
    fence.assertCurrent();
    return { renewed: true };
  },
  async shutdown() {},
}, owner, { ...invocation, idempotencyKey: 'effect-key:pre-dispatch-renewal' }, new AbortController().signal);
assert.deepEqual(preDispatchReceipt.result, { renewed: true },
  'the adapter starts with a full lease after durable pre-dispatch bookkeeping');

const externalJournalFile = path.join(root, 'external-results', 'effects.jsonl');
const externalJournal = new core.FileEffectJournal(externalJournalFile);
const largeValue = `result-${'x'.repeat(128 * 1024)}`;
const externalReceipt = {
  schemaVersion: 'effect-receipt.v2',
  effectId: `effect:${'c'.repeat(64)}`,
  idempotencyKey: 'effect-key:external-result',
  adapter: owner,
  status: 'completed',
  result: { largeValue },
  recordedAt: '2026-07-28T00:00:00.000Z',
};
await externalJournal.completed(externalReceipt);
assert.equal(fs.readFileSync(externalJournalFile, 'utf8').includes(largeValue), false,
  'large effect results are not duplicated inline in the effect journal');
const externalizedFiles = fs.readdirSync(path.join(path.dirname(externalJournalFile), 'effect-results', 'sha256'),
  { recursive: true }).filter((entry) => String(entry).endsWith('.json'));
assert.equal(externalizedFiles.length, 1);
assert.deepEqual((await new core.FileEffectJournal(externalJournalFile)
  .receipt(externalReceipt.idempotencyKey))?.result, externalReceipt.result,
  'a restarted process verifies and hydrates the content-addressed effect result');
const sharedEffectFile = path.join(root, 'shared-effects.jsonl');
const sharedEffectLeft = new core.FileEffectJournal(sharedEffectFile);
const sharedEffectRight = new core.FileEffectJournal(sharedEffectFile);
const sharedRequest = { ...invocation, idempotencyKey: 'effect-key:cross-instance-acceptance' };
await sharedEffectLeft.requested(sharedRequest);
await sharedEffectRight.requested(sharedRequest);
assert.equal(await sharedEffectLeft.accepted(sharedRequest), true);
assert.equal(await sharedEffectRight.accepted(sharedRequest), false,
  'accepted is an atomic cross-instance decision under the journal transaction lock');

let releaseConcurrentDispatches;
const concurrentDispatchGate = new Promise((resolve) => { releaseConcurrentDispatches = resolve; });
let concurrentDispatches = 0;
const concurrentDispatchLocks = [];
const concurrentDispatchAdapter = {
  async ready() {},
  async invoke({ lock, fence }) {
    fence.assertCurrent();
    concurrentDispatches += 1;
    concurrentDispatchLocks.push(lock.resource);
    if (concurrentDispatches === 2) releaseConcurrentDispatches();
    await concurrentDispatchGate;
    return { accepted: true };
  },
  async shutdown() {},
};
const concurrentDispatchCoordinator = new core.EffectCoordinator(
  new core.MemoryEffectJournal(),
  undefined,
  undefined,
  new core.MemoryResourceLockManager(),
);
const runtimeInvocation = {
  ...invocation,
  capability: 'runtime.dispatch',
  operation: 'dispatch',
  resource: { type: 'runtime.agent', canonicalId: 'echo' },
};
await Promise.all([
  concurrentDispatchCoordinator.invoke(
    concurrentDispatchAdapter,
    owner,
    { ...runtimeInvocation, idempotencyKey: 'runtime-dispatch:first', payload: { job: 'first' } },
    new AbortController().signal,
  ),
  concurrentDispatchCoordinator.invoke(
    concurrentDispatchAdapter,
    owner,
    { ...runtimeInvocation, idempotencyKey: 'runtime-dispatch:second', payload: { job: 'second' } },
    new AbortController().signal,
  ),
]);
assert.equal(concurrentDispatches, 2, 'independent runtime jobs can use one concurrent target');
assert.equal(new Set(concurrentDispatchLocks.map((resource) => resource.canonicalId)).size, 2);
assert.ok(concurrentDispatchLocks.every((resource) => resource.type === 'runtime.invocation'));
await assert.rejects(
  () => coordinator.invoke(
    adapter,
    owner,
    { ...invocation, payload: { value: 'different' } },
    new AbortController().signal,
  ),
  /EFFECT_IDEMPOTENCY_CONFLICT/,
  'an idempotency key cannot suppress an invocation with different payload',
);

const interruptedJournal = new core.MemoryEffectJournal();
const interruptedRequest = {
  schemaVersion: 'effect-request.v2',
  effectId: first.effectId,
  idempotencyKey: invocation.idempotencyKey,
  attempt,
  capability: invocation.capability,
  operation: invocation.operation,
  resource: invocation.resource,
  payload: invocation.payload,
  requestedAt: '2026-07-28T00:00:00.000Z',
};
await interruptedJournal.requested(interruptedRequest);
await interruptedJournal.accepted(interruptedRequest);
let recoveredInvocations = 0;
const receiptAwareAdapter = {
  async ready() {},
  async invoke() {
    recoveredInvocations += 1;
    return { duplicated: true };
  },
  async receipt(request) {
    assert.equal(request.effectId, first.effectId);
    return { accepted: true, recovered: true };
  },
  async shutdown() {},
};
const recoveredReceipt = await new core.EffectCoordinator(
  interruptedJournal,
  undefined,
  undefined,
  new core.MemoryResourceLockManager(),
).invoke(
  receiptAwareAdapter,
  owner,
  invocation,
  new AbortController().signal,
);
assert.equal(recoveredInvocations, 0, 'accepted effect recovery checks the adapter receipt before repetition');
assert.deepEqual(recoveredReceipt.result, { accepted: true, recovered: true });
const unavailableReceiptJournal = new core.MemoryEffectJournal();
await unavailableReceiptJournal.requested(interruptedRequest);
await unavailableReceiptJournal.accepted(interruptedRequest);
await assert.rejects(
  () => new core.EffectCoordinator(
    unavailableReceiptJournal,
    undefined,
    undefined,
    new core.MemoryResourceLockManager(),
  ).invoke(
    { ...adapter, receipt: undefined },
    owner,
    invocation,
    new AbortController().signal,
  ),
  /EFFECT_RECOVERY_RECEIPT_UNAVAILABLE/,
  'ambiguous accepted effects fail closed when a provider has no durable receipt lookup',
);

const lockRoot = path.join(root, 'contention');
const leftLocks = new core.FileResourceLockManager(lockRoot);
const rightLocks = new core.FileResourceLockManager(lockRoot);
const held = leftLocks.acquire(invocation.resource, 'lease:left', 60_000);
assert.throws(
  () => rightLocks.acquire(invocation.resource, 'lease:right', 60_000),
  /RESOURCE_LOCKED/,
);
leftLocks.release(held.lockId, 'lease:left');
const next = rightLocks.acquire(invocation.resource, 'lease:right', 60_000);
assert.equal(next.fencingToken, held.fencingToken + 1);
const renewed = rightLocks.renew(next.lockId, 'lease:right', 120_000);
assert.equal(renewed.fencingToken, next.fencingToken);
assert.ok(Date.parse(renewed.expiresAt) > Date.parse(next.expiresAt));
rightLocks.release(next.lockId, 'lease:right');

const provisionalRoot = path.join(root, 'provisional');
const provisional = new core.FileResourceLockManager(provisionalRoot);
const abandoned = provisional.acquire(invocation.resource, 'lease:abandoned', 1);
const activeDirectory = fs.readdirSync(provisionalRoot)
  .map((entry) => path.join(provisionalRoot, entry))
  .find((entry) => entry.endsWith('.active'));
fs.rmSync(path.join(activeDirectory, 'owner.json'));
const old = new Date(Date.now() - 120_000);
fs.utimesSync(activeDirectory, old, old);
const recoveredLock = new core.FileResourceLockManager(provisionalRoot)
  .acquire(invocation.resource, 'lease:recovered', 60_000);
assert.equal(recoveredLock.fencingToken, abandoned.fencingToken + 1);
new core.FileResourceLockManager(provisionalRoot)
  .release(recoveredLock.lockId, 'lease:recovered');

let leaseNow = new Date('2026-07-28T00:00:00Z');
const expiringManager = new core.FileResourceLockManager(
  path.join(root, 'expiry'),
  () => leaseNow,
);
const expiring = expiringManager.acquire(invocation.resource, 'lease:expiry', 1_000);
leaseNow = new Date('2026-07-28T00:00:01.001Z');
assert.throws(
  () => expiringManager.assertCurrent(expiring.lockId, 'lease:expiry'),
  /RESOURCE_LOCK_EXPIRED/,
);
assert.throws(
  () => new core.FileResourceLockManager(path.join(root, 'expiry'))
    .acquire(invocation.resource, 'lease:replacement', 1_000),
  /RESOURCE_LOCKED/,
  'a live adapter execution boundary is not replaced while it unwinds',
);
const recoveredExpiry = expiringManager.renew(expiring.lockId, 'lease:expiry', 1_000);
assert.ok(Date.parse(recoveredExpiry.expiresAt) > leaseNow.getTime());
expiringManager.release(expiring.lockId, 'lease:expiry');

const packageIdentity = {
  pluginId: 'example.stage',
  apiVersion: 'pipeline-plugin-v2',
  packageVersion: '1.0.0',
  contentDigest: `sha256:${'b'.repeat(64)}`,
};
const provenance = {
  schemaVersion: 'registration-provenance.v2',
  package: {
    schemaVersion: 'package-provenance.v2',
    package: packageIdentity,
    source: { type: 'builtin', canonicalReference: 'builtin:example.stage' },
    canonicalPath: '/plugins/example',
    trustScope: 'trusted_first_party',
    trustEvidence: {
      method: 'builtin_allowlist',
      verifier: 'test:registry',
      verifiedAt: '2026-07-28T00:00:00Z',
    },
    resolvedAt: '2026-07-28T00:00:00Z',
  },
  surface: 'stage',
  registrationId: 'main',
};
const stateFile = path.join(root, 'plugin-state.jsonl');
const state = new core.PluginStateJournal(
  stateFile,
  provenance,
  () => new Date('2026-07-28T00:00:00Z'),
);
const namespace = 'plugin.example.stage.main';
const stateEntry = state.append({
  namespace,
  registration: provenance,
  attempt,
  entryType: 'example.counter.incremented',
  entrySchemaVersion: 'example.counter.v1',
  idempotencyKey: 'state-key:1',
  payload: { amount: 2 },
});
assert.equal(state.append({
  namespace,
  registration: provenance,
  attempt,
  entryType: 'example.counter.incremented',
  entrySchemaVersion: 'example.counter.v1',
  idempotencyKey: 'state-key:1',
  payload: { amount: 2 },
}).entryId, stateEntry.entryId);
assert.throws(() => state.append({
  namespace: 'plugin.other.stage.main',
  registration: provenance,
  idempotencyKey: 'state-key:2',
  entryType: 'example.counter.incremented',
  payload: { amount: 1 },
}), /PLUGIN_STATE_NAMESPACE_DENIED/);
const foreignProvenance = structuredClone(provenance);
foreignProvenance.package.package.pluginId = 'other.stage';
foreignProvenance.package.package.contentDigest = `sha256:${'c'.repeat(64)}`;
foreignProvenance.registrationId = 'other';
assert.throws(() => state.append({
  namespace: 'plugin.other.stage.other',
  registration: foreignProvenance,
  idempotencyKey: 'state-key:foreign',
  entryType: 'example.counter.incremented',
  payload: { amount: 1 },
}), /PLUGIN_STATE_NAMESPACE_DENIED/, 'state writers are bound to one registration provenance');
const restartedState = new core.PluginStateJournal(stateFile, provenance);
assert.equal(restartedState.project(
  namespace,
  0,
  (total, entry) => total + Number(entry.payload.amount),
), 2);
assert.equal(restartedState.entries()[0].sequence, 1);
const parallelState = new core.PluginStateJournal(stateFile, provenance);
parallelState.append({
  namespace,
  registration: provenance,
  attempt,
  entryType: 'example.counter.incremented',
  idempotencyKey: 'state-key:2',
  payload: { amount: 3 },
});
state.append({
  namespace,
  registration: provenance,
  attempt,
  entryType: 'example.counter.incremented',
  idempotencyKey: 'state-key:3',
  payload: { amount: 4 },
});
const concurrentReplay = new core.PluginStateJournal(stateFile, provenance);
assert.deepEqual(concurrentReplay.entries().map(({ sequence }) => sequence), [1, 2, 3]);
assert.equal(concurrentReplay.project(
  namespace,
  0,
  (total, entry) => total + Number(entry.payload.amount),
), 9);
new core.FileJournal(stateFile).append({
  ...stateEntry,
  entryId: 'state:corrupt-after-startup',
  sequence: 99,
  idempotencyKey: 'state-key:corrupt-after-startup',
});
assert.throws(
  () => state.entries(),
  /PLUGIN_STATE_SEQUENCE_INVALID/,
  'state records added after startup are revalidated before projection',
);

fs.rmSync(root, { recursive: true, force: true });
console.log(JSON.stringify({ ok: true, contract: 'plugin-system-v2-phase7' }));
