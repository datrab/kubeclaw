import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { computePackageDigest } from '@kubeclaw/plugin-foundation/registry/digest';
import { readPackage, writePackageSnapshot } from '../report-adapter-package.ts';

function workspace(t: test.TestContext): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'report-package-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('snapshot preserves registry digest, nested bytes and private file modes', async t => {
  const root = workspace(t); const source = path.join(root, 'source');
  fs.mkdirSync(path.join(source, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(source, 'z.txt'), 'last');
  fs.writeFileSync(path.join(source, 'nested', 'é.txt'), 'nested unicode');
  fs.writeFileSync(path.join(source, 'a.txt'), 'first');
  const snapshot = await readPackage(source);
  assert.equal(snapshot.digest, computePackageDigest(source));
  assert.deepEqual(snapshot.files.map(file => file.relative), ['a.txt', 'nested/é.txt', 'z.txt']);
  const target = path.join(root, 'snapshot');
  await writePackageSnapshot(target, snapshot.files);
  assert.equal((await readPackage(target)).digest, snapshot.digest);
  assert.equal(fs.statSync(target).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(target, 'nested', 'é.txt')).mode & 0o777, 0o600);
  fs.writeFileSync(path.join(source, 'a.txt'), 'changed');
  assert.notEqual((await readPackage(source)).digest, snapshot.digest);
  assert.equal((await readPackage(target)).digest, snapshot.digest);
});

test('package reader rejects symlinks and the existing aggregate byte bound', async t => {
  const root = workspace(t); const outside = path.join(root, 'outside');
  fs.writeFileSync(outside, 'outside');
  const source = path.join(root, 'source'); fs.mkdirSync(source);
  fs.symlinkSync(outside, path.join(source, 'link'));
  await assert.rejects(readPackage(source), /REPORT_ADAPTER_PACKAGE_SYMLINK/u);
  fs.unlinkSync(path.join(source, 'link'));
  const file = fs.openSync(path.join(source, 'oversize'), 'w');
  try { fs.ftruncateSync(file, 64 * 1024 * 1024 + 1); } finally { fs.closeSync(file); }
  await assert.rejects(readPackage(source), /REPORT_ADAPTER_PACKAGE_BYTE_LIMIT/u);
});

test('package reader preserves its 2048-file admission limit', async t => {
  const source = workspace(t);
  for (let index = 0; index < 2049; index++) fs.writeFileSync(path.join(source, String(index)), '');
  await assert.rejects(readPackage(source), /REPORT_ADAPTER_PACKAGE_FILE_LIMIT/u);
});

test('package read and snapshot write preserve cancellation reason identity', async t => {
  const root = workspace(t); const controller = new AbortController();
  const reason = new Error('caller abort'); controller.abort(reason);
  await assert.rejects(readPackage(root, controller.signal), error => error === reason);
  await assert.rejects(writePackageSnapshot(path.join(root, 'copy'), [{ relative: 'a', bytes: Buffer.from('a') }],
    controller.signal), error => error === reason);
  assert.deepEqual(fs.readdirSync(path.join(root, 'copy')), [], 'existing writer creates its private directory before abort check');
});
