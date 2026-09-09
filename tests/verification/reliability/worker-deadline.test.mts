import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { WorkerAttemptExecutor } from '../../../skills/worker/core/worker/attempt-executor.ts';
import { LocalWorkerRuntime } from '../../../skills/worker/core/worker/local-runtime.ts';
import { FileEvidenceStore } from '../../../skills/buster/engine/test-gates/artifacts.ts';
import { envelope, fileOperation, writeEvidence } from './worker-deadline-fixture.mts';

async function directory(t: TestContext): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'worker-deadline-')); t.after(() => fs.rm(root, { recursive: true, force: true })); return root;
}

for (const wrapper of ['direct', 'runtime']) test(`${wrapper}: actual optional phases require a complete claim reservation`, async t => {
  const root = await directory(t), attempt = envelope(320, 50), operation = fileOperation(root);
  const execute = (signal?: AbortSignal) => new WorkerAttemptExecutor({ envelope: attempt, operation, ...(signal ? { signal } : {}),
    storeFullLog: (_id, content, { signal }) => writeEvidence(root, 'log', content, signal) }).execute();
  const runtime = new LocalWorkerRuntime({ workerId: 'worker:file', workerType: 'file', coreVersion: '1.0.0',
    protocolVersions: ['worker-protocol.v1'], profiles: [attempt.profile], capacity: 1 }); runtime.markReady();
  const result = await (wrapper === 'direct' ? execute() : runtime.runAttempt(attempt, execute));
  assert.equal(result.error?.code, 'WORKER_CLAIM_WINDOW_INSUFFICIENT');
  await assert.rejects(fs.readFile(path.join(root, 'operation')), /ENOENT/);
});

test('real completion hooks and durable log finish successfully inside the reserved claim', async t => {
  const root = await directory(t), attempt = envelope(), operation = fileOperation(root, undefined, 10);
  const result = await new WorkerAttemptExecutor({ envelope: attempt, operation,
    storeFullLog: async (_id, content, { signal }) => { await delay(10, undefined, { signal }); return writeEvidence(root, 'log', content, signal); } }).execute();
  assert.equal(result.state, 'completed', JSON.stringify(result.error));
  assert.equal(await fs.readFile(path.join(root, 'phases'), 'utf8'), 'measure\ncleanup\nevidence\nfinalize\n');
  assert.equal(await fs.readFile(path.join(root, 'log'), 'utf8'), '[stdout] actual operation');
});

for (const wrapper of ['direct', 'runtime']) test(`${wrapper}: final claim fence rejects completion after a native blocking hook`, async t => {
  const root = await directory(t), attempt = envelope(500, 50), operation = fileOperation(root);
  operation.finalizeResult = async ({ specialistResult }) => {
    // Real native wait blocks timer callbacks. No simulated clock or result is used.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 550); return specialistResult;
  };
  const execute = (signal?: AbortSignal) => new WorkerAttemptExecutor({ envelope: attempt, operation, ...(signal ? { signal } : {}),
    storeFullLog: (_id, content, { signal }) => writeEvidence(root, 'log', content, signal) }).execute();
  if (wrapper === 'direct') assert.equal((await execute()).error?.code, 'WORKER_CLAIM_EXPIRED');
  else {
    const runtime = new LocalWorkerRuntime({ workerId: 'worker:file', workerType: 'file', coreVersion: '1.0.0',
      protocolVersions: ['worker-protocol.v1'], profiles: [attempt.profile], capacity: 1 }); runtime.markReady();
    await assert.rejects(runtime.runAttempt(attempt, execute), /WORKER_LOCAL_CLAIM_EXPIRED/);
  }
});

test('timed out log hook receives cancellation and settles before result, without a later write', async t => {
  const root = await directory(t); let settled = false;
  const result = await new WorkerAttemptExecutor({ envelope: envelope(2000, 30), operation: fileOperation(root),
    storeFullLog: async (_id, content, { signal }) => {
      try { await delay(150, undefined, { signal }); return await writeEvidence(root, 'late-log', content, signal); }
      finally { settled = true; }
    } }).execute();
  assert.notEqual(result.state, 'completed'); assert.equal(settled, true);
  await delay(170); await assert.rejects(fs.readFile(path.join(root, 'late-log')), /ENOENT/);
});

test('uncooperative storage is reported unresolved rather than completed', async t => {
  const root = await directory(t); let work: Promise<unknown> | undefined;
  const result = await new WorkerAttemptExecutor({ envelope: envelope(2000, 20), operation: fileOperation(root),
    storeFullLog: (_id, content) => {
      const operation = delay(150).then(() => writeEvidence(root, 'uncooperative-log', content, new AbortController().signal));
      work = operation; return operation;
    } }).execute();
  assert.equal(result.error?.code, 'WORKER_PHASE_UNRESOLVED');
  // Quarantine is explicit: generic JS cannot be killed. Drain fixture-owned work.
  await work;
});

test('original executor preserves each UTF-8 byte split and rejects malformed/incomplete byte logs', async t => {
  const root = await directory(t);
  for (const text of ['é', '日', '😀', '\uFEFF']) for (let split = 1; split < Buffer.byteLength(text); split++) {
    const bytes = Buffer.from(text), id = `${text.codePointAt(0)}-${split}`;
    const result = await new WorkerAttemptExecutor({ envelope: envelope(), operation: fileOperation(root, [bytes.subarray(0, split), bytes.subarray(split)]),
      storeFullLog: (_id, content, { signal }) => writeEvidence(root, id, content, signal) }).execute();
    assert.equal(result.state, 'completed', JSON.stringify(result.error));
    assert.equal(await fs.readFile(path.join(root, id), 'utf8'), `[stdout] ${text}`);
  }
  for (const bytes of [Buffer.from([255]), Buffer.from([240,159])]) {
    const result = await new WorkerAttemptExecutor({ envelope: envelope(), operation: fileOperation(root, [bytes]) }).execute();
    assert.equal(result.error?.code, 'WORKER_LOG_UTF8_INVALID');
  }
});

test('real Buster evidence I/O drains cancellation and does not publish a later artifact', async t => {
  const root = await directory(t), source = path.join(root, 'source'), output = path.join(root, 'output');
  await fs.mkdir(source); await fs.writeFile(path.join(source, 'report.txt'), 'actual report');
  const store = new FileEvidenceStore(output), controller = new AbortController();
  const declaration = { evidenceId: 'report', type: 'report', mediaType: 'text/plain', file: 'report.txt' };
  const pending = store.store('attempt', source, declaration, 1024, controller.signal);
  controller.abort(new Error('stop evidence upload'));
  await assert.rejects(pending); await delay(20);
  assert.deepEqual(await fs.readdir(output), []);
  const stored = await store.store('attempt', source, declaration, 1024, new AbortController().signal);
  assert.equal(await fs.readFile(new URL(stored.artifact.storageUrl), 'utf8'), 'actual report');
});

test('stdout and stderr streaming decoders retain separate partial byte sequences', async t => {
  const root = await directory(t), operation = fileOperation(root, []), original = operation.execute;
  operation.execute = async context => {
    const result = await original(context), out = Buffer.from('😀'), err = Buffer.from('日本');
    context.log('stdout', out.subarray(0, 2)); context.log('stderr', err.subarray(0, 2));
    context.log('stdout', out.subarray(2)); context.log('stderr', err.subarray(2)); return result;
  };
  const result = await new WorkerAttemptExecutor({ envelope: envelope(), operation,
    storeFullLog: (_id, content, { signal }) => writeEvidence(root, 'mixed-log', content, signal) }).execute();
  assert.equal(result.state, 'completed', JSON.stringify(result.error));
  assert.equal(await fs.readFile(path.join(root, 'mixed-log'), 'utf8'), '[stdout] 😀[stderr] 日本');
});
