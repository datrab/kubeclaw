import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { activate } from '../src/adapter.ts';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'git-sync-disposition-'));
const repository = path.join(root, 'repo'); const workspaceRoot = path.join(root, 'workspaces');
fs.mkdirSync(repository); fs.mkdirSync(workspaceRoot);
const git = (...args) => execFileSync('/usr/bin/git', ['-C', repository, ...args], { encoding: 'utf8', stdio: 'pipe' });
git('init', '-b', 'main'); fs.writeFileSync(path.join(repository, 'small.txt'), 'original\n'); fs.writeFileSync(path.join(repository, 'large.txt'), 'x'.repeat(1024));
fs.writeFileSync(path.join(repository, 'literal[1].txt'), 'literal\n');
git('add', '.'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'initial');
const adapter = activate({ config: { allowedRepositoryRoots: [repository], workspaceRoot, gitExecutable: '/usr/bin/git', authorName: 'Test', authorEmail: 'test@example.invalid', maxExecutionMs: 3000, maxOutputBytes: 128, terminationGraceMs: 25 } });
function sync(ref, paths, signal = new AbortController().signal) {
  return adapter.invoke({ confidential: true, signal, request: { capability: 'git.sync', operation: 'sync_paths', resource: { canonicalId: repository }, payload: { ref, paths } } });
}
try {
  assert.deepEqual(await sync('main', ['missing.txt']), { synced: [], missing: ['missing.txt'] });
  await assert.rejects(sync('not-a-real-ref', ['small.txt']), /GIT_COMMAND_FAILED/);
  await assert.rejects(sync('main', ['large.txt']), /GIT_OUTPUT_LIMIT_EXCEEDED/);
  const controller = new AbortController(); controller.abort(new Error('operator'));
  await assert.rejects(sync('main', ['large.txt'], controller.signal), /ADAPTER_CANCELLED/);
  fs.writeFileSync(path.join(repository, 'small.txt'), 'local\n');
  await assert.rejects(sync('main', ['small.txt', 'large.txt']), /GIT_OUTPUT_LIMIT_EXCEEDED/);
  assert.equal(fs.readFileSync(path.join(repository, 'small.txt'), 'utf8'), 'original\n', 'completed earlier sync remains explicit partial work');
  fs.unlinkSync(path.join(repository, 'literal[1].txt'));
  assert.deepEqual(await sync('main', ['literal[1].txt']), { synced: [{ path: 'literal[1].txt', action: 'created' }], missing: [] });
  assert.equal(fs.readFileSync(path.join(repository, 'literal[1].txt'), 'utf8'), 'literal\n');
  console.log(JSON.stringify({ ok: true, missingDistinct: true, invalidRef: true, outputLimit: true, cancellation: true, partialSync: true, literalPath: true }));
} finally { await adapter.shutdown(); fs.rmSync(root, { recursive: true, force: true }); }
