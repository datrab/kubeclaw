import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { FileEvidenceStore, stageEvidenceFiles } from '../../../skills/buster/engine/test-gates/artifacts.ts';

const declaration = { evidenceId: 'report', type: 'artifact', mediaType: 'application/octet-stream', file: 'report.bin' };
async function fixture(t: TestContext, bytes = Buffer.from('real producer bytes')) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-evidence-snapshot-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'), output = path.join(root, 'output'), staging = path.join(root, 'staging');
  fs.mkdirSync(source); fs.writeFileSync(path.join(source, declaration.file), bytes);
  return { root, source, output, staging, file: path.join(source, declaration.file), bytes, store: new FileEvidenceStore(output) };
}

// Hooks schedule actual filesystem mutations/cancellation at deterministic I/O
// boundaries. Reads, descriptors, stats, stored bytes and digests remain real.
async function observeSource(t: TestContext, file: string, hook: (handle: fs.promises.FileHandle) => void) {
  const open = fs.promises.open.bind(fs.promises);
  t.mock.method(fs.promises, 'open', async (...args: Parameters<typeof fs.promises.open>) => {
    const handle = await open(...args);
    if (args[0] === file) hook(handle);
    return handle;
  });
}

for (const destination of ['store', 'staging'] as const) {
  test(`${destination}: exact-cap multi-chunk producer bytes retained unchanged`, async t => {
    const f = await fixture(t, Buffer.alloc(150000, 137));
    if (destination === 'store') {
      const result = await f.store.store('attempt', f.source, declaration, f.bytes.length);
      assert.equal(result.artifact.sizeBytes, f.bytes.length);
      assert.equal(result.artifact.contentDigest, 'sha256:' + createHash('sha256').update(f.bytes).digest('hex'));
      assert.deepEqual(fs.readFileSync(new URL(result.artifact.storageUrl)), f.bytes);
    } else {
      assert.deepEqual(await stageEvidenceFiles(f.source, f.staging, [declaration], 1, f.bytes.length), { files: 1, bytes: f.bytes.length });
      assert.deepEqual(fs.readFileSync(path.join(f.staging, declaration.file)), f.bytes);
    }
  });
  for (const mutation of ['grow', 'rewrite', 'truncate'] as const) {
    test(`${destination}: rejects actual producer ${mutation} during descriptor read without publishing`, async t => {
      const f = await fixture(t, Buffer.alloc(150000, 137));
      await observeSource(t, f.file, handle => {
        const read = handle.read.bind(handle); let once = false;
        t.mock.method(handle, 'read', async (...args: any[]) => {
          const result = await (read as any)(...args);
          if (!once) {
            once = true;
            if (mutation === 'grow') fs.appendFileSync(f.file, Buffer.alloc(200000));
            if (mutation === 'truncate') fs.truncateSync(f.file, 1);
            if (mutation === 'rewrite') {
              const fd = fs.openSync(f.file, 'r+');
              try { fs.writeSync(fd, Buffer.from('changed'), 0, 7, 0); fs.futimesSync(fd, new Date(0), new Date(0)); }
              finally { fs.closeSync(fd); }
            }
          }
          return result;
        });
      });
      const operation = destination === 'store' ? f.store.store('attempt', f.source, declaration, 150000)
        : stageEvidenceFiles(f.source, f.staging, [declaration], 1, 150000);
      await assert.rejects(operation, /TEST_EVIDENCE_SOURCE_CHANGED/);
      assert.deepEqual(fs.readdirSync(f.output), []);
      if (destination === 'staging') assert.deepEqual(fs.readdirSync(f.staging), []);
    });
  }
}

test('precap rejects before any source read; zero-byte exact-cap source remains supported', async t => {
  const f = await fixture(t); let reads = 0;
  await observeSource(t, f.file, handle => { t.mock.method(handle, 'read', async () => { reads++; throw new Error('READ_BEFORE_PRECAP'); }); });
  await assert.rejects(f.store.store('attempt', f.source, declaration, f.bytes.length - 1), /TEST_PROVIDER_ARTIFACT_BYTE_LIMIT/);
  assert.equal(reads, 0);
  t.mock.restoreAll(); fs.truncateSync(f.file, 0);
  const result = await f.store.store('attempt', f.source, declaration, 0);
  assert.equal(result.artifact.sizeBytes, 0);
});

for (const boundary of ['chunk', 'eof', 'close'] as const) test(`original cancellation at ${boundary} prevents publication`, async t => {
  const f = await fixture(t), controller = new AbortController();
  await observeSource(t, f.file, handle => {
    if (boundary === 'close') {
      const close = handle.close.bind(handle);
      t.mock.method(handle, 'close', async () => { await close(); controller.abort(new Error('ORIGINAL_CANCELLED')); });
    } else {
      const read = handle.read.bind(handle);
      t.mock.method(handle, 'read', async (...args: any[]) => {
        const result = await (read as any)(...args);
        if (boundary === 'chunk' || result.bytesRead === 0) controller.abort(new Error('ORIGINAL_CANCELLED'));
        return result;
      });
    }
  });
  await assert.rejects(f.store.store('attempt', f.source, declaration, 1024, controller.signal), /ORIGINAL_CANCELLED/);
  assert.deepEqual(fs.readdirSync(f.output), []);
});

test('staging total uses the original remaining-byte allowance; no second file on overflow', async t => {
  const f = await fixture(t), second = { ...declaration, evidenceId: 'other', file: 'other.bin' };
  fs.writeFileSync(path.join(f.source, second.file), f.bytes);
  await assert.rejects(stageEvidenceFiles(f.source, f.staging, [declaration, second], 2, f.bytes.length * 2 - 1), /TEST_PROVIDER_ARTIFACT_BYTE_LIMIT/);
  assert.deepEqual(fs.readdirSync(f.staging), [declaration.file]);
});

for (const destination of ['store', 'staging'] as const) {
  test(`${destination}: original declaration identity survives caller mutation during source read`, async t => {
    const f = await fixture(t), selected = { ...declaration };
    await observeSource(t, f.file, handle => {
      const read = handle.read.bind(handle);
      t.mock.method(handle, 'read', async (...args: any[]) => {
        const result = await (read as any)(...args);
        Object.assign(selected, { evidenceId: 'changed', type: 'log', mediaType: 'text/plain', file: 'changed.bin' });
        return result;
      });
    });
    if (destination === 'store') {
      const result = await f.store.store('attempt', f.source, selected, 1024);
      assert.deepEqual(result.declaration, declaration);
      assert.equal(result.artifact.type, declaration.type);
      assert.equal(result.artifact.mediaType, declaration.mediaType);
      assert.equal(path.basename(new URL(result.artifact.storageUrl).pathname), 'report-report.bin');
    } else {
      await stageEvidenceFiles(f.source, f.staging, [selected], 1, 1024);
      assert.deepEqual(fs.readdirSync(f.staging), ['report.bin']);
      assert.deepEqual(fs.readFileSync(path.join(f.staging, 'report.bin')), f.bytes);
    }
  });
}

test('staging captures the whole original declaration set before asynchronous directory creation', async t => {
  const f = await fixture(t), selected = [{ ...declaration }];
  const mkdir = fs.promises.mkdir.bind(fs.promises);
  t.mock.method(fs.promises, 'mkdir', async (...args: any[]) => {
    const result = await (mkdir as any)(...args);
    if (args[0] === f.staging) selected.splice(0);
    return result;
  });
  assert.deepEqual(await stageEvidenceFiles(f.source, f.staging, selected, 1, 1024), { files: 1, bytes: f.bytes.length });
  assert.deepEqual(fs.readFileSync(path.join(f.staging, 'report.bin')), f.bytes);
});

test('staging cancellation after actual final write cannot return completed retention', async t => {
  const f = await fixture(t), controller = new AbortController();
  const write = fs.promises.writeFile.bind(fs.promises);
  t.mock.method(fs.promises, 'writeFile', async (...args: any[]) => {
    const result = await (write as any)(...args);
    controller.abort(new Error('ORIGINAL_CANCELLED_AFTER_WRITE'));
    return result;
  });
  await assert.rejects(stageEvidenceFiles(f.source, f.staging, [declaration], 1, 1024, controller.signal), /ORIGINAL_CANCELLED_AFTER_WRITE/);
  // Existing staged bytes are retained for original uncertain/error handling;
  // cancellation is not permission to erase files or reset spent accounting.
  assert.deepEqual(fs.readFileSync(path.join(f.staging, 'report.bin')), f.bytes);
});
