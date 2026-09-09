import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { activate } from '../src/adapter.ts';
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'repository-path-safety-'));
const root = path.join(temporary, 'repo'); const outside = path.join(temporary, 'outside');
fs.mkdirSync(root); fs.mkdirSync(outside); fs.mkdirSync(path.join(root, 'inside'));
fs.writeFileSync(path.join(root, 'inside/file.txt'), 'inside'); fs.symlinkSync('inside', path.join(root, 'internal-link'));
fs.symlinkSync(outside, path.join(root, 'external-link')); fs.symlinkSync(path.join(outside, 'absent'), path.join(root, 'dangling-link'));
const adapter = activate({ config: { repositoryRoot: root } });
const read = (relative) => adapter.invoke({ confidential: true, signal: new AbortController().signal,
  request: { capability: 'git.repository.read', operation: 'read_text', resource: { canonicalId: relative }, attempt: { attemptId: 'test' }, payload: {} } });
try {
  assert.equal((await read('internal-link/file.txt')).content, 'inside');
  await assert.rejects(read('inside/missing/file.txt'), /REPOSITORY_FILE_NOT_FOUND/);
  await assert.rejects(read('external-link/missing/file.txt'), /REPOSITORY_PATH_FORBIDDEN/);
  await assert.rejects(read('dangling-link/file.txt'), /REPOSITORY_PATH_FORBIDDEN/);
  await assert.rejects(read('inside'), /REPOSITORY_NOT_A_FILE/);
  fs.renameSync(root, `${root}-parked`); fs.symlinkSync(outside, root);
  await assert.rejects(read('missing.txt'), /REPOSITORY_PATH_FORBIDDEN/);
  console.log(JSON.stringify({ ok: true, internalLinksReadable: true, forbiddenBeforeMissing: true, replacedRootDenied: true }));
} finally { await adapter.shutdown(); fs.rmSync(temporary, { recursive: true, force: true }); }
