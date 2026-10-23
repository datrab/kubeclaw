import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { FileDurableRecordStore } from '../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts';

const limits = { maximumRecords: 10, maximumBytes: 65536, maximumRecordBytes: 8192 };
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'transition-authority-review-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, store: new FileDurableRecordStore(root, limits) };
}

// These exercise the original generic RecordStore contract, not authorization
// for an operator projection or invented producer/consumer history.
test('independent transition authorization sees original locked records but cannot mutate committed state through its clone', async t => {
  const f = fixture(t);
  const original = (await f.store.append('requests', 'one', { nested: { value: 'original' } })).record;
  const other = (await f.store.append('receipts', 'two', { receipt: 'preserved' })).record;
  let called = 0;
  await f.store.transition('requests', 'one', original.payloadDigest, { nested: { value: 'replacement' } }, records => {
    called++;
    assert.equal(records.length, 2);
    assert.deepEqual(records[0], original);
    assert.deepEqual(records[1], other);
    records[0].payload.nested.value = 'callback mutation';
    records[1].payload.receipt = 'callback corruption';
    records.pop();
  });
  assert.equal(called, 1);
  assert.deepEqual((await f.store.read('requests'))[0].payload, { nested: { value: 'replacement' } });
  assert.deepEqual((await f.store.read('receipts'))[0], other);
});

test('independent async authorization and stale CAS fail before write, preserving bytes and releasing original fence', async t => {
  const f = fixture(t), file = path.join(f.root, 'records/store.json');
  const original = (await f.store.append('requests', 'one', { value: 'original' })).record;
  const before = fs.readFileSync(file);
  await assert.rejects(f.store.transition('requests', 'one', original.payloadDigest, { value: 'forbidden' },
    async records => { assert.deepEqual(records[0], original); }), /DURABLE_RECORD_AUTHORIZATION_NOT_SYNCHRONOUS/);
  assert.deepEqual(fs.readFileSync(file), before);
  const other = new FileDurableRecordStore(f.root, limits);
  const replacement = await other.transition('requests', 'one', original.payloadDigest, { value: 'accepted' });
  let called = false;
  await assert.rejects(f.store.transition('requests', 'one', original.payloadDigest, { value: 'stale' }, () => { called = true; }),
    /DURABLE_RECORD_TRANSITION_CONFLICT/);
  assert.equal(called, false);
  assert.deepEqual((await f.store.read('requests'))[0], replacement);
  await f.store.append('requests', 'two', { value: 'fence released' });
  assert.equal((await other.read('requests')).length, 2);
});
