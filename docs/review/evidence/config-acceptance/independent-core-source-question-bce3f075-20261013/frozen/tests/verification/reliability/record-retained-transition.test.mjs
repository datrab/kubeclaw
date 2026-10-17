import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { FileDurableRecordStore } from '../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts';

const limits = { maximumRecords: 8, maximumRecordBytes: 1024, maximumBytes: 8192 };
async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retained-transition-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const ownerRoot = path.join(root, 'owner'), retainedRoot = path.join(root, 'retained');
  const owner = new FileDurableRecordStore(ownerRoot, limits), retained = new FileDurableRecordStore(retainedRoot, limits);
  const original = (await owner.append('owner', 'key', { value: 'original' })).record;
  const receipt = (await retained.append('retained', 'receipt', { value: 'receipt' })).record;
  return { root, ownerRoot, retainedRoot, owner, retained, original, receipt };
}

test('retained transition snapshots input before waiting and provides owned clones of both original stores', async t => {
  const f = await fixture(t);
  let release, entered;
  const ready = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
  const held = f.owner.withRecords('owner', async () => { entered(); await gate; });
  await ready;
  const payload = { nested: { value: 'before wait' } };
  const transition = f.owner.transitionWithRetainedStore('owner', 'key', f.original.payloadDigest, payload,
    f.retained, 'retained', (records, receipts) => {
      assert.deepEqual(records[0], f.original); assert.deepEqual(receipts[0], f.receipt);
      records[0].payload.value = 'forbidden mutation'; receipts[0].payload.value = 'forbidden mutation';
    });
  payload.nested.value = 'after wait'; release(); await held; await transition;
  assert.deepEqual((await f.owner.read('owner'))[0].payload, { nested: { value: 'before wait' } });
  assert.deepEqual((await f.retained.read('retained'))[0], f.receipt);
});

test('retained transition rejects self, separate same-root instance, symlink-parent and hardlink aliases before acquiring dependency', { timeout: 10000 }, async t => {
  const f = await fixture(t), before = fs.readFileSync(path.join(f.ownerRoot, 'records/store.json'));
  const alias = path.join(f.root, 'alias'); fs.symlinkSync(f.ownerRoot, alias);
  for (const dependency of [f.owner, new FileDurableRecordStore(f.ownerRoot, limits), new FileDurableRecordStore(alias, limits)]) {
    await assert.rejects(f.owner.transitionWithRetainedStore('owner', 'key', f.original.payloadDigest,
      { value: 'forbidden' }, dependency, 'retained', () => {}), /DURABLE_RECORD_RETAINED_STORE_ALIAS/);
  }
  const linked = path.join(f.root, 'hardlink'); fs.mkdirSync(path.join(linked, 'records'), { recursive: true });
  fs.linkSync(path.join(f.ownerRoot, 'records/store.json'), path.join(linked, 'records/store.json'));
  await assert.rejects(f.owner.transitionWithRetainedStore('owner', 'key', f.original.payloadDigest,
    { value: 'forbidden' }, new FileDurableRecordStore(linked, limits), 'retained', () => {}), /DURABLE_RECORD_RETAINED_STORE_ALIAS/);
  assert.deepEqual(fs.readFileSync(path.join(f.ownerRoot, 'records/store.json')), before);
});

test('retained transition preserves synchronous authorization, stale CAS and actual byte quota without callback bypass', async t => {
  const f = await fixture(t), file = path.join(f.ownerRoot, 'records/store.json'), before = fs.readFileSync(file);
  await assert.rejects(f.owner.transitionWithRetainedStore('owner', 'key', f.original.payloadDigest,
    { value: 'forbidden' }, f.retained, 'retained', async () => {}), /DURABLE_RECORD_AUTHORIZATION_NOT_SYNCHRONOUS/);
  assert.deepEqual(fs.readFileSync(file), before);
  const bounded = new FileDurableRecordStore(f.ownerRoot, { ...limits, maximumBytes: before.length });
  let authorized = false;
  await assert.rejects(bounded.transitionWithRetainedStore('owner', 'key', f.original.payloadDigest,
    { value: 'x'.repeat(500) }, f.retained, 'retained', () => { authorized = true; }), /DURABLE_RECORD_STORE_FULL/);
  assert.equal(authorized, false); assert.deepEqual(fs.readFileSync(file), before);
  await f.owner.transition('owner', 'key', f.original.payloadDigest, { value: 'other writer' });
  const updated = fs.readFileSync(file);
  await assert.rejects(f.owner.transitionWithRetainedStore('owner', 'key', f.original.payloadDigest,
    { value: 'stale' }, f.retained, 'retained', () => { authorized = true; }), /DURABLE_RECORD_TRANSITION_CONFLICT/);
  assert.equal(authorized, false); assert.deepEqual(fs.readFileSync(file), updated);
});
