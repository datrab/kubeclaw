import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-repository-'));
const repository = path.join(temporary, 'repository');
const outside = path.join(temporary, 'outside.txt');
fs.mkdirSync(path.join(repository, 'nested'), { recursive: true });
fs.writeFileSync(path.join(repository, 'nested/file.txt'), 'real repository content');
fs.writeFileSync(path.join(repository, 'large.txt'), 'x'.repeat(65));
fs.writeFileSync(outside, 'outside');
fs.symlinkSync(outside, path.join(repository, 'escape.txt'));

const { activate } = await import(pathToFileURL(path.resolve('src/adapter.ts')).href);
const adapter = activate({
  registration: {},
  config: { repositoryRoot: repository, maxFileBytes: 64 },
  async emit() {},
  async invoke() { throw new Error('unexpected dependency'); },
});
const attempt = { runId: 'run:test', stageId: 'stage:test', attemptId: 'attempt:test', attemptNumber: 1 };
const fenced = { fence: { assertCurrent() {} } };
function read(canonicalId, signal = new AbortController().signal) {
  return adapter.invoke({
    ...fenced,
    request: {
      requestId: `request:${canonicalId}`,
      idempotencyKey: `read:${canonicalId}`,
      attempt,
      capability: 'git.repository.read',
      operation: 'read_text',
      resource: { type: 'git.repository.path', canonicalId },
      payload: {},
    },
    signal,
  });
}

try {
  await adapter.ready();
  assert.deepEqual(await read('nested/file.txt'), {
    content: 'real repository content',
    sizeBytes: 23,
    path: 'nested/file.txt',
  });
  await assert.rejects(read('../outside.txt'), /REPOSITORY_PATH_FORBIDDEN/);
  await assert.rejects(read('escape.txt'), /REPOSITORY_PATH_FORBIDDEN/);
  await assert.rejects(read('missing.txt'), /REPOSITORY_FILE_NOT_FOUND/);
  await assert.rejects(read('nested'), /REPOSITORY_NOT_A_FILE/);
  await assert.rejects(read('large.txt'), /REPOSITORY_FILE_TOO_LARGE/);
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(read('nested/file.txt', cancelled.signal), /ADAPTER_CANCELLED/);
} finally {
  await adapter.shutdown();
  fs.rmSync(temporary, { recursive: true, force: true });
}
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.repository-adapter', suite: 'live-function' }));
