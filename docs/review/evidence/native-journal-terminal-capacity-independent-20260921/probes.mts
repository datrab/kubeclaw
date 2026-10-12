import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { envelope, limits, metadata, metadataFile, temporary, finish } from '../../../../tests/verification/reliability/native-journal-capacity-fixture.mts';
import { NativeAttemptJournal } from '../../../../skills/worker/core/worker/native-attempt-journal.ts';
import { nativeJournalTerminalMetadataBytes } from '../../../../skills/worker/core/worker/native-journal-capacity.ts';
import { NativeWorkerOutputSpool } from '../../../../skills/worker/core/worker/native-output-spool.ts';
import { interruptedNativeWorkerResult } from '../../../../skills/worker/core/worker/native-result.ts';
import { canonicalJson } from '@kubeclaw/pipeline-worker-core-contract';

test('independent seven-way admission admits only one slot and retains exact winner replay', async () => {
  const parent = await temporary();
  try {
    const inputs = Array.from({ length: 7 }, (_, i) => envelope(`independent-race-${i}`));
    const estimateRoot = path.join(parent, 'estimate');
    await new NativeAttemptJournal(estimateRoot, limits).withAttempt(inputs[0]!, async () => {});
    const maximumStateBytes = nativeJournalTerminalMetadataBytes(await metadata(estimateRoot), limits);
    const root = path.join(parent, 'race');
    const attempts = await Promise.allSettled(inputs.map(input => new NativeAttemptJournal(root, { ...limits, maximumStateBytes }).withAttempt(input, async () => {})));
    assert.equal(attempts.filter(row => row.status === 'fulfilled').length, 1);
    for (const row of attempts) if (row.status === 'rejected') assert.match(String(row.reason), /METADATA_CAPACITY_EXCEEDED/);
    const winner = inputs[attempts.findIndex(row => row.status === 'fulfilled')]!;
    const journal = new NativeAttemptJournal(root, { ...limits, maximumStateBytes });
    const result = await finish(journal, winner);
    const before = await fs.readFile(metadataFile(root));
    assert.ok(before.byteLength <= maximumStateBytes);
    assert.deepEqual(await journal.readResult(winner), result);
    await journal.withAttempt(winner, async context => assert.equal(context.newlyAccepted, false));
    assert.deepEqual(await fs.readFile(metadataFile(root)), before);
  } finally { await fs.rm(parent, { recursive: true, force: true }); }
});

test('independent archived process preserves nonempty output, escaped diagnostics and actual serializer on sealing', async () => {
  const root = await temporary();
  try {
    const input = envelope('independent-archive');
    const journal = new NativeAttemptJournal(root, limits);
    await journal.withAttempt(input, async context => {
      const spool = await NativeWorkerOutputSpool.create(context.outputRoot, limits.maximumOutputBytes);
      await spool.append('stdout', Buffer.alloc(limits.maximumOutputBytes, 7)); await spool.close();
      const process = { schemaVersion: 'worker-native-process-result.v1' as const, stdout: Buffer.alloc(limits.maximumOutputBytes, 7), stderr: Buffer.alloc(0), exitCode: 255,
        signal: '\u0002'.repeat(4096), fault: '\u0001'.repeat(4096), resources: { unit: 'linux-tasks' as const, cpuTimeMicroseconds: Number.MAX_SAFE_INTEGER, maximumMemoryBytes: Number.MAX_SAFE_INTEGER, maximumTasks: Number.MAX_SAFE_INTEGER, populated: false, oomKills: Number.MAX_SAFE_INTEGER, taskLimitHits: Number.MAX_SAFE_INTEGER } };
      const beforeInvalid = await fs.readFile(metadataFile(root));
      await assert.rejects(journal.recordProcess(input, { ...process, signal: '\ud800'.repeat(4096) }, new Date()), /RFC8785_INVALID_UNICODE/);
      assert.deepEqual(await fs.readFile(metadataFile(root)), beforeInvalid);
      await journal.recordProcess(input, process, new Date('-271821-04-20T00:00:00.000Z'));
    });
    const archived = await journal.readProcess(input);
    const bound = nativeJournalTerminalMetadataBytes(await metadata(root), limits);
    const tight = new NativeAttemptJournal(root, { ...limits, maximumStateBytes: bound });
    await tight.withAttempt(input, async context => { await tight.seal(input, interruptedNativeWorkerResult(input, new Date(context.acceptedAt), 'TEST_ARCHIVE', null, true)); });
    assert.deepEqual(await tight.readProcess(input), archived);
    const state = await metadata(root); const bytes = await fs.readFile(metadataFile(root));
    assert.equal(bytes.byteLength, Buffer.byteLength(canonicalJson(state)));
    assert.ok(bytes.byteLength <= bound);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
