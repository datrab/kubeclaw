import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';
import { FileDurableBlobStore } from '../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts';

const digest = bytes => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
function fixture(t, maximum = 16) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'original-blob-read-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new FileDurableBlobStore(root, maximum, Math.max(maximum * 4, 1024));
  const file = hash => path.join(root, 'blobs/sha256', hash.slice(7, 9), hash.slice(9));
  return { root, store, file };
}
test('original get rejects genuine content-addressed bytes over its configured maximum before allocation', async t => {
  const f = fixture(t), bytes = Buffer.alloc(33, 9), hash = digest(bytes), file = f.file(hash);
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes);
  await assert.rejects(f.store.get(hash), /DURABLE_BLOB_SIZE_EXCEEDED/);
  assert.deepEqual(fs.readFileSync(file), bytes);
});
test('original bounded reader preserves zero, exact maximum and unchanged quota/digest behavior', async t => {
  const f = fixture(t);
  for (const bytes of [Buffer.alloc(0), Buffer.from('small'), Buffer.alloc(16, 3)]) {
    const stored = await f.store.put(bytes);
    assert.deepEqual(await f.store.get(stored.digest), bytes);
    assert.deepEqual(await f.store.put(bytes), stored);
  }
  await assert.rejects(f.store.put(Buffer.alloc(17)), /DURABLE_BLOB_SIZE_EXCEEDED/);
  await assert.rejects(f.store.get(`sha256:${'a'.repeat(64)}`), /DURABLE_BLOB_NOT_FOUND/);
});
test('final symlink, parent symlink and FIFO cannot become blob bytes', async t => {
  const f = fixture(t), bytes = Buffer.from('retained'), hash = digest(bytes), file = f.file(hash);
  await f.store.put(bytes);
  const original = `${file}.original`; fs.renameSync(file, original); fs.symlinkSync(original, file);
  await assert.rejects(f.store.get(hash), /DURABLE_BLOB_PATH_INVALID/); fs.unlinkSync(file); fs.renameSync(original, file);
  const shard = path.dirname(file), saved = `${shard}-saved`;
  fs.renameSync(shard, saved); fs.symlinkSync(saved, shard);
  await assert.rejects(f.store.get(hash), /DURABLE_BLOB_PATH_INVALID/); fs.unlinkSync(shard); fs.renameSync(saved, shard);
  fs.unlinkSync(file); execFileSync('mkfifo', [file]);
  await assert.rejects(f.store.get(hash), /DURABLE_BLOB_PATH_INVALID/);
});
test('corrupt and truncated content reject repeatedly without losing the original valid reader', async t => {
  const f = fixture(t), bytes = Buffer.from('original'), hash = digest(bytes), file = f.file(hash);
  await f.store.put(bytes);
  for (let index = 0; index < 24; index++) {
    fs.writeFileSync(file, index % 2 ? Buffer.from('different') : bytes.subarray(0, 3));
    await assert.rejects(f.store.get(hash), /DURABLE_BLOB_INTEGRITY_FAILED/);
  }
  fs.writeFileSync(file, bytes); assert.deepEqual(await f.store.get(hash), bytes);
});
test('actual concurrent parent replacement is rejected or returns only the exact originally addressed bytes', { timeout: 20000 }, async t => {
  const f = fixture(t, 8 * 1024 * 1024), bytes = crypto.randomBytes(8 * 1024 * 1024);
  const stored = await f.store.put(bytes), file = f.file(stored.digest), shard = path.dirname(file);
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import fs from 'node:fs';
    const shard=process.argv[1], parked=shard+'-parked';
    process.send('ready');
    process.on('message', message=>{if(message==='start') {
      for(let i=0;i<4000;i++){fs.renameSync(shard,parked);fs.mkdirSync(shard);fs.rmdirSync(shard);fs.renameSync(parked,shard);}
      process.send('done');
    }});
  `, shard], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  await once(child, 'message');
  const done = once(child, 'message'); child.send('start');
  let rejected = 0;
  for (let index = 0; index < 30; index++) {
    try { assert.deepEqual(await f.store.get(stored.digest), bytes); }
    catch (error) {
      assert.match(error.message, /DURABLE_BLOB_(NOT_FOUND|PATH_CHANGED)|ENOENT/); rejected++;
    }
  }
  await done; child.disconnect(); child.kill('SIGTERM'); await once(child, 'exit');
  assert.ok(rejected > 0, 'a real overlapping parent replacement must be observed');
  assert.deepEqual(await f.store.get(stored.digest), bytes);
});
