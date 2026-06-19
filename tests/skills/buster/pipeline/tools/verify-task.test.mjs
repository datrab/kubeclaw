import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import verifyAndPush, { cleanupForbiddenFile, parsePorcelainStatusPaths } from '../../../../../skills/buster/pipeline/tools/verify-task.ts';

function git(repoRoot, args) {
  return execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
}

test('parsePorcelainStatusPaths preserves both paths for staged renames', () => {
  const paths = parsePorcelainStatusPaths(
    'R  Projects/current/src/.swarm/a.txt\0Projects/other/src/.swarm/a.txt\0',
  );

  assert.deepEqual(paths, [
    'Projects/current/src/.swarm/a.txt',
    'Projects/other/src/.swarm/a.txt',
  ]);
});

test('parsePorcelainStatusPaths preserves both paths for copies', () => {
  const paths = parsePorcelainStatusPaths(
    'C  Projects/current/src/.swarm/copy.txt\0Projects/other/src/.swarm/source.txt\0',
  );

  assert.deepEqual(paths, [
    'Projects/current/src/.swarm/copy.txt',
    'Projects/other/src/.swarm/source.txt',
  ]);
});

test('parsePorcelainStatusPaths keeps normal paths with spaces', () => {
  const paths = parsePorcelainStatusPaths(
    ' M Projects/current/src/.swarm/file with spaces.txt\0?? Projects/current/src/.swarm/new file.txt\0',
  );

  assert.deepEqual(paths, [
    'Projects/current/src/.swarm/file with spaces.txt',
    'Projects/current/src/.swarm/new file.txt',
  ]);
});

test('cleanupForbiddenFile unstages and deletes staged additions absent from HEAD', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-task-cleanup-test-'));

  try {
    git(repoRoot, ['init']);
    git(repoRoot, ['config', 'user.email', 'test@example.invalid']);
    git(repoRoot, ['config', 'user.name', 'Test User']);

    fs.writeFileSync(path.join(repoRoot, 'README.md'), 'baseline\n');
    git(repoRoot, ['add', 'README.md']);
    git(repoRoot, ['commit', '-m', 'baseline']);

    const forbiddenPath = 'outside.txt';
    fs.writeFileSync(path.join(repoRoot, forbiddenPath), 'forbidden\n');
    git(repoRoot, ['add', forbiddenPath]);

    assert.equal(git(repoRoot, ['diff', '--cached', '--name-only']), forbiddenPath);

    const action = cleanupForbiddenFile(repoRoot, forbiddenPath);

    assert.deepEqual(action, { file: forbiddenPath, cleaned: true, method: 'delete' });
    assert.equal(fs.existsSync(path.join(repoRoot, forbiddenPath)), false);
    assert.equal(git(repoRoot, ['diff', '--cached', '--name-only']), '');
    assert.equal(git(repoRoot, ['status', '--porcelain']), '');
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('verifyAndPush commits scoped swarm artifact despite unrelated dirty repo files', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-task-scoped-artifact-'));
  const remote = path.join(root, 'origin.git');
  const repoRoot = path.join(root, 'repo');
  const previousRepoRoot = process.env.REPO_ROOT;

  try {
    git(root, ['init', '--bare', 'origin.git']);
    fs.mkdirSync(repoRoot);
    git(repoRoot, ['init', '-b', 'main']);
    git(repoRoot, ['config', 'user.email', 'test@example.invalid']);
    git(repoRoot, ['config', 'user.name', 'Test User']);
    fs.mkdirSync(path.join(repoRoot, 'Projects/demo/src/.swarm/modules/01'), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, 'Projects/other/src'), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, 'README.md'), 'baseline\n');
    fs.writeFileSync(path.join(repoRoot, 'Projects/demo/src/.swarm/progress.json'), '{}\n');
    fs.writeFileSync(path.join(repoRoot, 'Projects/other/src/app.js'), 'console.log("other");\n');
    git(repoRoot, ['add', '.']);
    git(repoRoot, ['commit', '-m', 'baseline']);
    git(repoRoot, ['remote', 'add', 'origin', remote]);
    git(repoRoot, ['push', '-u', 'origin', 'main']);

    fs.writeFileSync(
      path.join(repoRoot, 'Projects/demo/src/.swarm/modules/01/buster-output.json'),
      '{"status":"PASS"}\n',
    );
    fs.writeFileSync(path.join(repoRoot, 'Projects/other/src/app.js'), 'console.log("dirty other");\n');
    fs.writeFileSync(path.join(repoRoot, 'outside-runtime.tmp'), 'runtime residue\n');

    process.env.REPO_ROOT = repoRoot;
    const result = await verifyAndPush('buster', 'demo', { commitMessage: '[BUSTER] scoped artifact' });

    assert.equal(result.status, 'success');
    assert.equal(result.action, 'pushed');
    assert.equal(git(repoRoot, ['show', '--name-only', '--pretty=format:', 'HEAD']).trim(), 'Projects/demo/src/.swarm/modules/01/buster-output.json');
    const status = git(repoRoot, ['status', '--porcelain']);
    assert.match(status, /M Projects\/other\/src\/app\.js/);
    assert.match(status, /\?\? outside-runtime\.tmp/);
    assert(result.logs.some((line) => line.includes('Ignoring 2 dirty file(s) outside Projects/demo/')));
  } finally {
    if (previousRepoRoot === undefined) delete process.env.REPO_ROOT;
    else process.env.REPO_ROOT = previousRepoRoot;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
