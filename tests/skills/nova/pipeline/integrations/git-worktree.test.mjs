import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { __gitWorktreeTest } from '../../../../../skills/nova/pipeline/integrations/git-worktree.ts';

function git(repoRoot, args) {
  return execFileSync('git', ['-C', repoRoot, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  }).trim();
}

function makeRepo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'git-worktree-test-'));
  git(repoRoot, ['init']);
  git(repoRoot, ['config', 'user.name', 'Test']);
  git(repoRoot, ['config', 'user.email', 'test@example.com']);
  fs.writeFileSync(path.join(repoRoot, 'README.md'), 'base\n');
  fs.writeFileSync(path.join(repoRoot, 'user.txt'), 'base\n');
  git(repoRoot, ['add', 'README.md', 'user.txt']);
  git(repoRoot, ['commit', '-m', 'initial']);
  return repoRoot;
}

function stashSubjects(repoRoot) {
  const output = git(repoRoot, ['stash', 'list', '--format=%s']);
  return output ? output.split('\n') : [];
}

function resolveGitPath(repoRoot, gitPathName) {
  const resolved = git(repoRoot, ['rev-parse', '--git-path', gitPathName]);
  return path.isAbsolute(resolved) ? resolved : path.join(repoRoot, resolved);
}

test('runtime stash restore preserves pre-existing user stash', () => {
  const repoRoot = makeRepo();
  const config = { repo_root: repoRoot, project: 'test' };

  fs.writeFileSync(path.join(repoRoot, 'user.txt'), 'user change\n');
  git(repoRoot, ['stash', 'push', '-m', 'user-stash']);

  const runtimePath = path.join(repoRoot, '.swarm', 'logs', 'runtime.log');
  fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
  fs.writeFileSync(runtimePath, 'runtime state\n');

  const stashState = __gitWorktreeTest.collectRuntimeStateStash(config);
  assert.equal(stashState?.stashRef, 'stash@{0}');
  assert.match(stashState?.stashSha || '', /^[0-9a-f]{40}$/);
  const stashesAfterCollect = stashSubjects(repoRoot);
  assert.equal(stashesAfterCollect.length, 2);
  assert.match(stashesAfterCollect[0] || '', /pipeline-pre-push-runtime-state$/);
  assert.match(stashesAfterCollect[1] || '', /user-stash$/);

  __gitWorktreeTest.restoreRuntimeStateStash(config, stashState);

  assert.equal(fs.readFileSync(runtimePath, 'utf8'), 'runtime state\n');
  assert.equal(fs.readFileSync(path.join(repoRoot, 'user.txt'), 'utf8'), 'base\n');
  const stashesAfterRestore = stashSubjects(repoRoot);
  assert.equal(stashesAfterRestore.length, 1);
  assert.match(stashesAfterRestore[0] || '', /user-stash$/);
});

test('runtime stash restore keeps stashed content when runtime file conflicts', () => {
  const repoRoot = makeRepo();
  const config = { repo_root: repoRoot, project: 'test' };
  const runtimePath = path.join(repoRoot, '.swarm', 'logs', 'runtime.log');

  fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
  fs.writeFileSync(runtimePath, 'base runtime\n');
  git(repoRoot, ['add', '.swarm/logs/runtime.log']);
  git(repoRoot, ['commit', '-m', 'add runtime log']);

  fs.writeFileSync(runtimePath, 'stashed runtime state\n');
  const stashState = __gitWorktreeTest.collectRuntimeStateStash(config);

  fs.writeFileSync(runtimePath, 'pulled runtime state\n');
  git(repoRoot, ['add', '.swarm/logs/runtime.log']);
  git(repoRoot, ['commit', '-m', 'simulate pulled runtime log']);

  __gitWorktreeTest.restoreRuntimeStateStash(config, stashState);

  assert.equal(fs.readFileSync(runtimePath, 'utf8'), 'stashed runtime state\n');
  assert.deepEqual(stashSubjects(repoRoot), []);
  assert.equal(git(repoRoot, ['diff', '--name-only', '--diff-filter=U']), '');
});

test('rebase detection resolves gitdir paths for linked worktrees', () => {
  const repoRoot = makeRepo();
  const linkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'git-worktree-linked-'));
  fs.rmSync(linkedRoot, { recursive: true, force: true });
  git(repoRoot, ['worktree', 'add', linkedRoot, '-b', 'linked-test']);

  assert.equal(fs.statSync(path.join(linkedRoot, '.git')).isFile(), true);

  const rebaseMergePath = resolveGitPath(linkedRoot, 'rebase-merge');
  fs.mkdirSync(rebaseMergePath, { recursive: true });

  assert.equal(fs.existsSync(path.join(linkedRoot, '.git', 'rebase-merge')), false);
  assert.equal(__gitWorktreeTest.isRebaseInProgress(linkedRoot), true);
});
