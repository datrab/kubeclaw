import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { cleanupForbiddenFile, parsePorcelainStatusPaths } from '../../../../../skills/buster/pipeline/tools/verify-task.ts';

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
