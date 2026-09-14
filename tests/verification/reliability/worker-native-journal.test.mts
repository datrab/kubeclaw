import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { NativeAttemptJournal } from '../../../skills/worker/core/worker/native-attempt-journal.ts';
import { NativeWorkerOutputSpool, readNativeWorkerOutput } from '../../../skills/worker/core/worker/native-output-spool.ts';
import { interruptedNativeWorkerResult } from '../../../skills/worker/core/worker/native-result.ts';
import { prismNativeAttempt } from '../../../skills/prism/engine/worker-envelope.ts';
import { workerAttemptSpecDigest, checkWorkerNativeResultBinding } from '@kubeclaw/pipeline-worker-core-contract';

const limits = { maximumRecords: 32, maximumStateBytes: 262144, maximumTotalBytes: 8388608,
  maximumInputBytes: 65536, maximumOutputBytes: 65536, maximumResultBytes: 65536 };
const artifact = { artifactId: 'input:journal-test', type: 'prism-engine-input', mediaType: 'application/json',
  contentDigest: `sha256:${'1'.repeat(64)}`, sizeBytes: 2, storageUrl: 'https://control.example/input' };

test('new-admission rejection persists no accepted work and cannot block historical receipt replay', async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'native-journal-admission-'));
  const journal = new NativeAttemptJournal(path.join(parent, 'journal'), limits);
  const envelope = prismNativeAttempt('render', artifact, 'admission-precondition');
  const reject = () => { throw new Error('EXPIRED_NEW_ADMISSION'); };
  try {
    await assert.rejects(journal.withAttempt(envelope, async () => assert.fail('rejected work entered'), reject), /EXPIRED_NEW_ADMISSION/);
    assert.equal(await journal.hasAttempt(envelope), false);
    const result = await journal.withAttempt(envelope, async context => journal.seal(envelope,
      interruptedNativeWorkerResult(envelope, new Date(context.acceptedAt), 'TEST_NOT_LAUNCHED', null, true)));
    const reopened = new NativeAttemptJournal(path.join(parent, 'journal'), limits);
    const replay = await reopened.withAttempt(envelope, async context => {
      assert.equal(context.newlyAccepted, false);
      return reopened.readResult(envelope);
    }, reject);
    assert.deepEqual(replay, result);
  } finally { await fs.rm(parent, { recursive: true, force: true }); }
});

for (const mode of ['accepted', 'sealed']) {
  test(`real writer SIGKILL preserves ${mode} identity, original output and receipt without re-admission`, { timeout: 20000 }, async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'native-journal-crash-'));
    const root = path.join(parent, 'journal');
    const envelope = prismNativeAttempt('render', artifact, 'journal-crash');
    const envelopePath = path.join(parent, 'envelope.json');
    await fs.writeFile(envelopePath, JSON.stringify(envelope));
    const child = spawn(process.execPath, [fileURLToPath(new URL('../../fixtures/worker-journal-writer.mjs', import.meta.url)), root, envelopePath, mode], { stdio: 'pipe' });
    const exited = once(child, 'exit');
    let errors = ''; child.stderr.on('data', bytes => { errors += String(bytes); });
    try {
      const ready = await Promise.race([once(child.stdout, 'data').then(([bytes]) => String(bytes)),
        exited.then(() => { throw new Error(`writer exited before durable checkpoint: ${errors}`); })]);
      assert.equal(ready, 'durable\n');
      const journal = new NativeAttemptJournal(root, limits);
      const before = await journal.readResult(envelope);
      assert.equal(before !== null, mode === 'sealed');
      const marker = path.join(parent, 'duplicate-entered');
      const duplicate = journal.withAttempt(envelope, async context => {
        await fs.writeFile(marker, 'entered');
        assert.equal(context.newlyAccepted, false);
        return journal.readResult(envelope);
      });
      // The production flock must block a second serving process while the first
      // still owns this attempt, and SIGKILL must release it without deleting data.
      await new Promise(resolve => setTimeout(resolve, 100));
      await assert.rejects(fs.access(marker), { code: 'ENOENT' });
      child.kill('SIGKILL'); assert.deepEqual(await exited, [null, 'SIGKILL']);
      assert.deepEqual(await duplicate, before);
      const bytes = await readNativeWorkerOutput(journal.outputRoot(envelope), limits.maximumOutputBytes);
      assert.equal(bytes.stderr.bytes.toString(), 'original diagnostic: test-credential\n');
      if (before) {
        assert.deepEqual(checkWorkerNativeResultBinding(envelope, before), { ok: true, errors: [] });
        await journal.seal(envelope, before);
        const changed = interruptedNativeWorkerResult(envelope, new Date(before.startedAt), 'TEST_OTHER_RECEIPT', null, true);
        await assert.rejects(journal.seal(envelope, changed), /WORKER_NATIVE_JOURNAL_RESULT_ALREADY_SEALED/u);
        assert.deepEqual(await journal.readResult(envelope), before);
      }
    } finally { child.kill('SIGKILL'); await exited; await fs.rm(parent, { recursive: true, force: true }); }
  });
}

test('journal binds the full envelope and reserves retained disk before admitting output', async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'native-journal-quota-'));
  const root = path.join(parent, 'journal');
  const journal = new NativeAttemptJournal(root, { ...limits, maximumTotalBytes: 950000 });
  const envelope = prismNativeAttempt('render', artifact, 'journal-quota');
  try {
    await journal.withAttempt(envelope, async context => { assert.equal(context.newlyAccepted, true); });
    const changed = structuredClone(envelope);
    changed.operation.values = { ...changed.operation.values, unexpected: true };
    changed.attemptSpecDigest = workerAttemptSpecDigest(changed);
    await assert.rejects(journal.withAttempt(changed, async () => assert.fail('conflicting identity admitted')), /WORKER_NATIVE_JOURNAL_IDENTITY_CONFLICT/u);
    // An unrelated retained original file also counts; only explicit retirement
    // can make space. No implicit cleanup is triggered by admission pressure.
    const retained = path.join(root, 'retained-original');
    await fs.writeFile(retained, Buffer.alloc(400000, 7));
    const second = prismNativeAttempt('render', artifact, 'journal-quota-second');
    await assert.rejects(journal.withAttempt(second, async () => assert.fail('disk quota bypassed')), /WORKER_NATIVE_JOURNAL_CAPACITY_EXCEEDED/u);
    assert.equal((await fs.stat(retained)).size, 400000);
    await journal.withAttempt(envelope, async context => { assert.equal(context.newlyAccepted, false); });
  } finally { await fs.rm(parent, { recursive: true, force: true }); }
});

test('process archive verifies original output and immutable completion time before receipt construction', async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'native-journal-process-'));
  const journal = new NativeAttemptJournal(path.join(parent, 'journal'), limits);
  const envelope = prismNativeAttempt('render', artifact, 'journal-process');
  try {
    await journal.withAttempt(envelope, async context => {
      const spool = await NativeWorkerOutputSpool.create(context.outputRoot, limits.maximumOutputBytes);
      await spool.append('stdout', Buffer.from('original-output'));
      await spool.close();
      // Storage format test data only: these counters are NOT represented as a
      // kernel measurement or as proof of positive cgroup execution.
      const process = { schemaVersion: 'worker-native-process-result.v1' as const, stdout: Buffer.from('original-output'), stderr: Buffer.alloc(0),
        exitCode: 1, signal: null, fault: 'TEST_EXIT', resources: { unit: 'linux-tasks' as const, cpuTimeMicroseconds: 123,
          maximumMemoryBytes: 456, maximumTasks: 7, populated: false, oomKills: 0, taskLimitHits: 0 } };
      const completed = new Date();
      await assert.rejects(journal.recordProcess(envelope, { ...process, stdout: Buffer.from('different') }, completed), /WORKER_NATIVE_JOURNAL_OUTPUT_INCOMPLETE/u);
      await journal.recordProcess(envelope, process, completed);
      const restored = await journal.readProcess(envelope);
      assert.equal(restored?.completedAt, completed.toISOString());
      assert.deepEqual(Buffer.from(restored!.process.stdout), process.stdout);
      assert.deepEqual(restored!.process.resources, process.resources);
      await assert.rejects(journal.recordProcess(envelope, process, new Date()), /WORKER_NATIVE_JOURNAL_PROCESS_ALREADY_RECORDED/u);
      await fs.writeFile(path.join(context.outputRoot, 'stdout'), 'tampered');
      await assert.rejects(journal.readProcess(envelope), /WORKER_NATIVE_JOURNAL_OUTPUT_CHANGED/u);
    });
  } finally { await fs.rm(parent, { recursive: true, force: true }); }
});

test('busy live attempt reports retryable contention without changing its durable identity', { timeout: 20000 }, async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'native-journal-busy-'));
  const root = path.join(parent, 'journal');
  const envelope = prismNativeAttempt('render', artifact, 'journal-busy');
  const envelopePath = path.join(parent, 'envelope.json');
  await fs.writeFile(envelopePath, JSON.stringify(envelope));
  const child = spawn(process.execPath, [fileURLToPath(new URL('../../fixtures/worker-journal-writer.mjs', import.meta.url)), root, envelopePath, 'accepted'], { stdio: 'pipe' });
  const exited = once(child, 'exit');
  try {
    const ready = await Promise.race([once(child.stdout, 'data').then(([bytes]) => String(bytes)),
      exited.then(() => { throw new Error('writer exited before accepting'); })]);
    assert.equal(ready, 'durable\n');
    const journal = new NativeAttemptJournal(root, limits);
    await assert.rejects(journal.withAttempt(envelope, async () => assert.fail('live attempt entered twice')), { message: 'WORKER_NATIVE_ATTEMPT_BUSY' });
    assert.equal(child.exitCode, null); assert.equal(child.signalCode, null);
    const accepted = [];
    for await (const value of journal.acceptedEnvelopes()) accepted.push(value);
    assert.deepEqual(accepted, [envelope]);
    child.kill('SIGKILL'); await exited;
    await journal.withAttempt(envelope, async context => { assert.equal(context.newlyAccepted, false); });
  } finally { child.kill('SIGKILL'); await exited; await fs.rm(parent, { recursive: true, force: true }); }
});
