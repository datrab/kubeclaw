import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('compiled original launcher refuses ordinary filesystems and cannot execute the requested program', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'worker-launcher-'));
  try {
    const binary = path.join(root, 'native-worker-launcher');
    const source = fileURLToPath(new URL('../../../skills/worker/core/worker/native-worker-launcher.c', import.meta.url));
    const build = spawnSync('cc', ['-std=c11', '-Wall', '-Wextra', '-Werror', '-O2', '-o', binary, source], { encoding: 'utf8' });
    assert.equal(build.status, 0, build.stderr);
    const sentinel = path.join(root, 'must-not-exist');
    const ordinaryScope = path.join(root, 'worker-11111111-1111-1111-1111-111111111111');
    await fs.mkdir(ordinaryScope);
    for (const target of [ordinaryScope, '/sys/fs/cgroup']) {
      const result = spawnSync(binary, [target, '1000', '1000', process.execPath, '-e',
        'require("node:fs").writeFileSync(process.argv[1], "executed")', sentinel], { encoding: 'utf8' });
      assert.equal(result.status, 125);
      assert.match(result.stderr, /WORKER_NATIVE_(LAUNCH_(SCOPE_INVALID|MEMBERSHIP_INVALID|ATTACH_FAILED)|SUPERVISOR_IDENTITY_REQUIRED)/u);
      await assert.rejects(fs.stat(sentinel), { code: 'ENOENT' });
    }
    const invalid = spawnSync(binary, [], { encoding: 'utf8' });
    assert.equal(invalid.status, 125);
    assert.match(invalid.stderr, /WORKER_NATIVE_LAUNCH_ARGUMENTS_INVALID/u);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
