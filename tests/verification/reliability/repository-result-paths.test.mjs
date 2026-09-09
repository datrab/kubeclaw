import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { activate } from '../../../skills/nova/plugins/repository-adapter/src/adapter.ts';
import { readOpenClawResult } from '../../../skills/common/plugins/runtime-dispatch/src/openclaw-result.ts';
import { persistResult } from '../../../skills/common/plugins/runtime-dispatch/src/result-persistence.ts';

if (process.argv[2] === 'swap') {
  const [root, outside] = process.argv.slice(3);
  const live = path.join(root, 'race'); const parked = path.join(root, 'parked');
  process.send('ready');
  process.once('message', () => {
    fs.symlinkSync(outside, parked);
    execFileSync('python3', ['-c', `
import ctypes, os, sys, time
libc = ctypes.CDLL(None, use_errno=True)
left, right = os.fsencode(sys.argv[1]), os.fsencode(sys.argv[2])
for _ in range(2000):
    if libc.renameat2(-100, left, -100, right, 2) != 0:
        raise OSError(ctypes.get_errno(), 'renameat2 exchange failed')
    time.sleep(0.001)
`, live, parked]);
    process.disconnect();
  });
} else {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'collector-paths-'));
  const root = path.join(temporary, 'repo'); const outside = path.join(temporary, 'outside');
  fs.mkdirSync(root); fs.mkdirSync(outside);
  const adapter = activate({ config: { repositoryRoot: root } });
  const read = (relative) => adapter.invoke({ confidential: true, signal: new AbortController().signal,
    request: { capability: 'git.repository.read', operation: 'read_text', resource: { canonicalId: relative }, attempt: { attemptId: 'test' }, payload: {} } });
  const context = { invokeConfidential: async (_capability, request) => read(request.resource.canonicalId) };
  const collect = (relative) => readOpenClawResult(context, { repositoryRoot: root }, { payload: {}, relative, key: 'session', token: '', startedAt: new Date().toISOString(), state: { state: 'completed', structured: { ok: true } } });
  try {
    fs.symlinkSync(outside, path.join(root, 'escape'));
    fs.writeFileSync(path.join(outside, 'existing.json'), '{"ok":true}');
    for (const relative of ['escape/missing.json', 'escape/existing.json']) {
      await assert.rejects(read(relative), /REPOSITORY_PATH_FORBIDDEN/);
      await assert.rejects(collect(relative), /REPOSITORY_PATH_FORBIDDEN/);
      assert.throws(() => persistResult(root, relative, '{"ok":true}'), /OPENCLAW_RESULT_PATH_INVALID/);
    }
    assert.deepEqual(fs.readdirSync(outside), ['existing.json']);
    assert.deepEqual((await collect('results/nested/result.json')).result, { ok: true });
    persistResult(root, 'results/nested/result.json', '{"ok":true}');
    assert.throws(() => persistResult(root, 'results/nested/result.json', '{"ok":false}'), /OPENCLAW_RESULT_PATH_INVALID/);
    fs.symlinkSync(path.join(outside, 'existing.json'), path.join(root, 'leaf.json'));
    assert.throws(() => persistResult(root, 'leaf.json', '{"ok":true}'), /OPENCLAW_RESULT_PATH_INVALID/);
    const rootLink = path.join(temporary, 'root-link'); fs.symlinkSync(root, rootLink);
    assert.throws(() => activate({ config: { repositoryRoot: rootLink } }), /REPOSITORY_PATH_FORBIDDEN/);
    assert.throws(() => persistResult(rootLink, 'created.json', '{}'), /OPENCLAW_RESULT_PATH_INVALID/);
    fs.mkdirSync(path.join(root, 'race'));
    const swapper = fork(new URL(import.meta.url), ['swap', root, outside], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    let stderr = ''; swapper.stderr.on('data', (chunk) => { stderr += chunk; });
    const exited = once(swapper, 'exit'); await once(swapper, 'message'); swapper.send('start');
    let allowed = 0; let denied = 0;
    try {
      for (let index = 0; index < 300; index++) {
        try { persistResult(root, `race/result-${index}.json`, '{}'); allowed++; }
        catch (error) { assert.equal(error.message, 'OPENCLAW_RESULT_PATH_INVALID'); denied++; }
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
    } finally { await exited; }
    assert.equal(swapper.exitCode, 0, stderr);
    assert(denied > 0, 'real concurrent symlink replacement encountered');
    assert.deepEqual(fs.readdirSync(outside), ['existing.json'], 'no external files or temporary artifacts');
    console.log(JSON.stringify({ ok: true, missingSymlink: true, directWriter: true, rootSymlink: true, idempotency: true, concurrentAttempts: 300, allowed, denied, outsideWrites: 0 }));
  } finally { await adapter.shutdown(); fs.rmSync(temporary, { recursive: true, force: true }); }
}
