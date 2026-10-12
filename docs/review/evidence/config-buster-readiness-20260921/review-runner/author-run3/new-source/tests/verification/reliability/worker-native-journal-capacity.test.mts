import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { canonicalJson } from '@kubeclaw/pipeline-worker-core-contract';
import { NativeAttemptJournal } from '../../../skills/worker/core/worker/native-attempt-journal.ts';
import { nativeJournalTerminalMetadataBytes } from '../../../skills/worker/core/worker/native-journal-capacity.ts';
import { envelope, limits, metadata, metadataFile, temporary, finish } from './native-journal-capacity-fixture.mts';

async function estimate(root: string, inputs: ReturnType<typeof envelope>[]) {
  const journal = new NativeAttemptJournal(root, limits);
  for (const input of inputs) await journal.withAttempt(input, async () => {});
  return nativeJournalTerminalMetadataBytes(await metadata(root), limits);
}

test('exact future metadata fit completes valid maximal diagnostics; one byte short admits no blob', async () => {
  const parent = await temporary();
  const input = envelope('capacity-fit');
  try {
    const bound = await estimate(path.join(parent, 'estimate'), [input]);
    for (const budget of [8192, bound - 1]) {
      const rejectedRoot = path.join(parent, `short-${budget}`);
      const short = new NativeAttemptJournal(rejectedRoot, { ...limits, maximumStateBytes: budget });
      await assert.rejects(short.withAttempt(input, async () => assert.fail('short admission entered')), /METADATA_CAPACITY_EXCEEDED/);
      assert.equal(await short.hasAttempt(input), false);
      await assert.rejects(fs.access(path.join(rejectedRoot, 'data')), { code: 'ENOENT' });
    }
    const root = path.join(parent, 'fit');
    const fit = new NativeAttemptJournal(root, { ...limits, maximumStateBytes: bound });
    await fit.withAttempt(input, async () => {});
    const result = await finish(fit, input);
    assert.deepEqual(await fit.readResult(input), result);
    const bytes = await fs.readFile(metadataFile(root));
    assert.equal(bytes.byteLength, Buffer.byteLength(canonicalJson(await metadata(root))));
    assert.ok(bytes.byteLength <= bound);
    assert.equal(nativeJournalTerminalMetadataBytes(await metadata(root), limits), bytes.byteLength);
  } finally { await fs.rm(parent, { recursive: true, force: true }); }
});

test('all pending rows reserve metadata and concurrent independent journals cannot over-admit', async () => {
  const parent = await temporary();
  const inputs = [envelope('pending-one'), envelope('pending-two'), envelope('pending-tri')];
  try {
    const bound = await estimate(path.join(parent, 'estimate'), inputs.slice(0, 2));
    const root = path.join(parent, 'concurrent');
    const config = { ...limits, maximumStateBytes: bound };
    const results = await Promise.allSettled(inputs.map(input => new NativeAttemptJournal(root, config).withAttempt(input, async () => {})));
    assert.equal(results.filter(item => item.status === 'fulfilled').length, 2);
    const rejected = results.find(item => item.status === 'rejected');
    assert.match(String(rejected?.status === 'rejected' ? rejected.reason : ''), /METADATA_CAPACITY_EXCEEDED/);
    const journal = new NativeAttemptJournal(root, config);
    for (const [index, result] of results.entries()) if (result.status === 'fulfilled') await finish(journal, inputs[index]!);
    assert.equal((await metadata(root)).records.length, 2);
  } finally { await fs.rm(parent, { recursive: true, force: true }); }
});

test('historical pending overcommit remains readable and replayable while growth fails closed', async () => {
  const parent = await temporary();
  const input = envelope('historical');
  try {
    const original = new NativeAttemptJournal(parent, limits);
    await original.withAttempt(input, async () => {});
    const before = await fs.readFile(metadataFile(parent));
    const old = new NativeAttemptJournal(parent, { ...limits, maximumStateBytes: before.byteLength + 100 });
    await old.withAttempt(input, async context => assert.equal(context.newlyAccepted, false));
    await assert.rejects(old.withAttempt(envelope('new-record'), async () => assert.fail('overcommit admitted')), /METADATA_CAPACITY_EXCEEDED/);
    assert.deepEqual(await fs.readFile(metadataFile(parent)), before);
    await assert.rejects(finish(old, input), /DURABLE_RECORD_STORE_FULL/);
    assert.equal(await old.hasAttempt(input), true);
  } finally { await fs.rm(parent, { recursive: true, force: true }); }
});

test('retained metadata outside the journal stream consumes the same whole-store ceiling', async () => {
  const parent = await temporary();
  const inputs = [envelope('retained-one'), envelope('retained-two')];
  try {
    const { FileDurableRecordStore } = await import('@kubeclaw/plugin-foundation/observability/durable-records');
    const root = path.join(parent, 'journal');
    const journal = new NativeAttemptJournal(root, limits);
    await journal.withAttempt(inputs[0]!, async () => {});
    const store = new FileDurableRecordStore(path.join(root, 'metadata'), {
      maximumRecords: 32, maximumBytes: limits.maximumStateBytes, maximumRecordBytes: 65536 });
    await store.append('retained-audit', 'audit', { note: '\u0000'.repeat(128) }, 'other-owner');
    const before = await fs.readFile(metadataFile(root));
    const unrelated = (await metadata(root)).records.find((row: { stream: string }) => row.stream === 'retained-audit');
    const withoutForeign = await estimate(path.join(parent, 'estimate'), inputs);
    const ceiling = withoutForeign + Buffer.byteLength(canonicalJson(unrelated));
    const constrained = new NativeAttemptJournal(root, { ...limits, maximumStateBytes: ceiling });
    await assert.rejects(constrained.withAttempt(inputs[1]!, async () => assert.fail('foreign bytes ignored')), /METADATA_CAPACITY_EXCEEDED/);
    assert.deepEqual(await fs.readFile(metadataFile(root)), before);
  } finally { await fs.rm(parent, { recursive: true, force: true }); }
});
