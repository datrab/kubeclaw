import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { FileDurableRecordStore } from '../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts';

const limits = { maximumRecords: 8, maximumRecordBytes: 1024, maximumBytes: 8192 };
const moduleURL = new URL('../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts', import.meta.url).href;
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'record-fenced-review-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, store: new FileDurableRecordStore(root, limits) };
}
function worker(root, mode) {
  return spawn(process.execPath, ['--input-type=module', '-e', `
    const { FileDurableRecordStore } = await import(process.argv[1]);
    const store = new FileDurableRecordStore(process.argv[2], JSON.parse(process.argv[3]));
    if (process.argv[4] === 'hold') {
      await store.withRecords('stream', async records => {
        process.send({ held: true, records: records.length });
        await new Promise(() => {});
      });
    } else {
      process.send({ starting: true });
      await store.append('stream', 'child', { value: 'child' });
      process.send({ appended: true });
      process.disconnect();
    }
  `, moduleURL, root, JSON.stringify(limits), mode], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
}

test('independent actual competing process waits for original read fence, and callback receives owned records', { timeout: 15000 }, async t => {
  const f = fixture(t);
  await f.store.append('stream', 'original', { value: 'original' });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const held = f.store.withRecords('stream', async records => {
    records[0].payload.value = 'mutated callback clone';
    entered(); await gate;
  });
  await started;
  const child = worker(f.root, 'append');
  t.after(() => stop(child));
  const [ready] = await once(child, 'message'); assert.equal(ready.starting, true);
  let appended = false; child.on('message', value => { appended ||= value.appended === true; });
  await delay(150); assert.equal(appended, false);
  const exited = once(child, 'exit'); release(); await held;
  const [code] = await exited; assert.equal(code, 0); assert.equal(appended, true);
  const records = await new FileDurableRecordStore(f.root, limits).read('stream');
  assert.deepEqual(records.map(record => record.payload.value), ['original', 'child']);
});

test('independent actual SIGKILL of read-fence owner releases original kernel lock without partial write', { timeout: 15000 }, async t => {
  const f = fixture(t);
  await f.store.append('stream', 'original', { value: 'original' });
  const child = worker(f.root, 'hold'); t.after(() => stop(child));
  const [held] = await once(child, 'message'); assert.equal(held.held, true);
  let appended = false;
  const write = f.store.append('stream', 'after-death', { value: 'after-death' }).then(value => { appended = true; return value; });
  await delay(150); assert.equal(appended, false);
  await stop(child); await write;
  const records = await new FileDurableRecordStore(f.root, limits).read('stream');
  assert.deepEqual(records.map(record => record.payload.value), ['original', 'after-death']);
});
