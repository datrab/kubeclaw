import { admission, readiness } from '../../fixtures/buster-fixture-protocol.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { FileBusterFixtureJournal } from '../../../skills/buster/engine/test-gates/native-fixture-journal.ts';
import { NativeAttemptJournal } from '../../../skills/worker/core/worker/native-attempt-journal.ts';
import { interruptedNativeWorkerResult } from '../../../skills/worker/core/worker/native-result.ts';
import { sha256Digest, workerAttemptSpecDigest } from '@kubeclaw/worker-core';

const limits = { maximumRecords: 32, maximumStateBytes: 262144, maximumBlobBytes: 65536, maximumTotalBytes: 8388608 };
const nativeLimits = { maximumRecords: 32, maximumStateBytes: 262144, maximumTotalBytes: 8388608,
  maximumInputBytes: 65536, maximumOutputBytes: 65536, maximumResultBytes: 65536 };

for (const checkpoint of ['accepted', 'teardown']) {
  test(`fixture ${checkpoint} survives real writer SIGKILL and cannot become a new identity`, { timeout: 20000 }, async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'buster-fixture-crash-'));
    const value = admission(); const file = path.join(directory, 'admission.json'); const root = path.join(directory, 'fixtures');
    await fs.writeFile(file, JSON.stringify(value));
    const child = spawn(process.execPath, [fileURLToPath(new URL('../../fixtures/buster-fixture-writer.mts', import.meta.url)), root, file, checkpoint], { stdio: 'pipe' });
    const exited = once(child, 'exit'); let errors = ''; child.stderr.on('data', bytes => { errors += String(bytes); });
    try {
      const message = await Promise.race([once(child.stdout, 'data').then(([bytes]) => String(bytes)),
        exited.then(() => { throw new Error(`writer failed: ${errors}`); })]);
      assert.equal(message, 'durable\n');
      const journal = new FileBusterFixtureJournal(root, limits); const before = await journal.snapshot();
      assert.equal(before.length, 1); assert.equal(before[0]!.state.teardown !== null, checkpoint === 'teardown');
      child.kill('SIGKILL'); assert.deepEqual(await exited, [null, 'SIGKILL']);
      assert.deepEqual(await new FileBusterFixtureJournal(root, limits).snapshot(), before);
      assert.deepEqual(await journal.reserve(value), before[0]!.state);
      if (checkpoint === 'teardown') await assert.rejects(journal.ready(value, readiness(value)), /READINESS_FENCED/);
      const changed = structuredClone(value); changed.envelope.limits.logBytes += 1;
      changed.envelope.attemptSpecDigest = workerAttemptSpecDigest(changed.envelope);
      await assert.rejects(journal.reserve(changed), /IDENTITY_CONFLICT/);
    } finally { child.kill('SIGKILL'); await exited; await fs.rm(directory, { recursive: true, force: true }); }
  });
}

test('actual fixture files preserve nonterminal readiness, first teardown intent and immutable scope binding', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'buster-fixture-ready-'));
  const root = path.join(directory, 'fixtures'); const journal = new FileBusterFixtureJournal(root, limits); const value = admission();
  try {
    const reservations = await Promise.all(Array.from({ length: 8 }, () => journal.reserve(value)));
    for (const entry of reservations) assert.deepEqual(entry, reservations[0]);
    const ready = readiness(value); const state = await journal.ready(value, ready);
    assert.equal(state.terminal, null); assert.equal(state.teardown, null);
    const changed = { ...structuredClone(ready), scope: { ...ready.scope, inode: ready.scope.inode + 1 } };
    await assert.rejects(journal.ready(value, changed), /READINESS_IMMUTABLE/);
    const teardown = await journal.requestTeardown(value, 'dependencies-finished');
    assert.deepEqual(await journal.requestTeardown(value, 'recovery'), teardown);
    assert.deepEqual(await journal.ready(value, ready), teardown, 'An exact old acknowledgment cannot undo teardown');
    const reopened = (await new FileBusterFixtureJournal(root, limits).snapshot())[0]!;
    assert.deepEqual(reopened.readiness, ready); assert.equal(reopened.terminal, null);
    const native = new NativeAttemptJournal(path.join(directory, 'native'), nativeLimits);
    await assert.rejects(journal.seal(value, native), /TERMINAL_RECEIPT_REQUIRED/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('original Core never-launched receipt closes an unready fixture and remains replayable without invented observations', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'buster-fixture-terminal-'));
  const journal = new FileBusterFixtureJournal(path.join(directory, 'fixtures'), limits);
  const native = new NativeAttemptJournal(path.join(directory, 'native'), nativeLimits); const value = admission();
  try {
    await journal.reserve(value);
    const original = await native.withAttempt(value.envelope, async context => native.seal(value.envelope,
      interruptedNativeWorkerResult(value.envelope, new Date(context.acceptedAt), 'FIXTURE_NOT_LAUNCHED', null, true)));
    const sealed = await journal.seal(value, native);
    assert(sealed.terminal); assert.equal(sealed.readiness, null);
    assert.deepEqual(await journal.seal(value, native), sealed);
    assert.deepEqual((await journal.snapshot())[0]!.terminal, original);
    await assert.rejects(journal.ready(value, readiness(value)), /READINESS_FENCED/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('retained bytes reserve readiness and receipt space, and corruption is not silently repaired', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'buster-fixture-quota-'));
  const root = path.join(directory, 'fixtures'); const journal = new FileBusterFixtureJournal(root, { ...limits, maximumTotalBytes: 950000 });
  const value = admission();
  try {
    await journal.reserve(value);
    const retained = path.join(root, 'retained-original'); await fs.writeFile(retained, Buffer.alloc(400000, 7));
    await assert.rejects(journal.reserve(admission()), /CAPACITY_EXCEEDED/);
    assert.equal((await fs.stat(retained)).size, 400000);
    const state = (await journal.snapshot())[0]!.state;
    const hash = state.admission.digest.slice(7); const blob = path.join(root, 'data', 'blobs', 'sha256', hash.slice(0, 2), hash.slice(2));
    await fs.writeFile(blob, '{}');
    await assert.rejects(journal.snapshot(), /DURABLE_BLOB_INTEGRITY_FAILED/);
    await assert.rejects(journal.reserve(value), /DURABLE_BLOB_INTEGRITY_FAILED/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
