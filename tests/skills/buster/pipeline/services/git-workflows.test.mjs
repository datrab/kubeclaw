import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { gitPushWithRetry, gitSync } from '../../../../../skills/buster/pipeline/services/git-workflows.ts';

function git(repoRoot, args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

test('gitPushWithRetry rejects unsafe branch names before git commands', async () => {
  for (const branch of ['', '--force', ' topic', 'topic with space', 'topic..main', 'topic/@{upstream}', 'topic.lock', '/topic', 'topic//name']) {
    await assert.rejects(
      () => gitPushWithRetry('/definitely/not/a/repo', branch, { maxAttempts: 1, retryDelayMs: 1 }),
      /branch must be a valid branch name/,
      branch,
    );
  }
});

test('gitPushWithRetry accepts a normal branch name', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'git-workflows-'));
  const remote = path.join(root, 'remote.git');
  const repo = path.join(root, 'repo');

  try {
    git(root, ['init', '--bare', remote]);
    git(root, ['init', repo]);
    git(repo, ['config', 'user.email', 'test@example.com']);
    git(repo, ['config', 'user.name', 'Test User']);
    git(repo, ['checkout', '-b', 'feature/topic-1']);
    writeFileSync(path.join(repo, 'tracked.txt'), 'initial\n');
    git(repo, ['add', 'tracked.txt']);
    git(repo, ['commit', '-m', 'initial']);
    git(repo, ['remote', 'add', 'origin', remote]);
    git(repo, ['push', '-u', 'origin', 'feature/topic-1']);

    const result = await gitPushWithRetry(repo, 'feature/topic-1', { maxAttempts: 1, retryDelayMs: 1 });

    assert.equal(result.pushed, true);
    assert.equal(result.hash, git(repo, ['rev-parse', '--short', 'HEAD']));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('gitPushWithRetry bootstraps repo-local git identity when missing', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'git-workflows-identity-'));
  const remote = path.join(root, 'remote.git');
  const repo = path.join(root, 'repo');
  const previousEnv = {
    HOME: process.env.HOME,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL,
    GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM,
    CURRENT_AGENT: process.env.CURRENT_AGENT,
    AGENT_NAME: process.env.AGENT_NAME,
  };

  try {
    git(root, ['init', '--bare', remote]);
    git(root, ['init', repo]);
    git(repo, ['config', 'user.email', 'seed@example.test']);
    git(repo, ['config', 'user.name', 'Seed User']);
    git(repo, ['checkout', '-b', 'main']);
    writeFileSync(path.join(repo, 'tracked.txt'), 'initial\n');
    git(repo, ['add', 'tracked.txt']);
    git(repo, ['commit', '-m', 'seed']);
    git(repo, ['remote', 'add', 'origin', remote]);
    git(repo, ['push', '-u', 'origin', 'main']);
    git(repo, ['config', '--unset', 'user.email']);
    git(repo, ['config', '--unset', 'user.name']);
    writeFileSync(path.join(repo, 'tracked.txt'), 'initial\nsecond\n');

    const emptyHome = path.join(root, 'empty-home');
    const emptyXdg = path.join(root, 'empty-xdg');
    execFileSync('mkdir', ['-p', emptyHome, emptyXdg]);
    process.env.HOME = emptyHome;
    process.env.XDG_CONFIG_HOME = emptyXdg;
    process.env.GIT_CONFIG_GLOBAL = '/dev/null';
    process.env.GIT_CONFIG_NOSYSTEM = '1';
    process.env.CURRENT_AGENT = 'buster';
    process.env.AGENT_NAME = 'buster';

    const result = await gitPushWithRetry(repo, 'main', {
      maxAttempts: 1,
      retryDelayMs: 1,
      commitMessage: 'initial',
      addPaths: ['tracked.txt'],
    });

    assert.equal(result.pushed, true);
    assert.equal(git(repo, ['rev-list', '--count', 'HEAD']), '2');
    assert.equal(git(repo, ['config', '--get', 'user.name']), 'Buster Agent');
    assert.equal(git(repo, ['config', '--get', 'user.email']), 'buster@kubeclaw.swarm');
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test('gitPushWithRetry returns without commit when scoped add stages nothing', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'git-workflows-empty-stage-'));
  const remote = path.join(root, 'remote.git');
  const repo = path.join(root, 'repo');

  try {
    git(root, ['init', '--bare', remote]);
    git(root, ['init', repo]);
    git(repo, ['config', 'user.email', 'test@example.com']);
    git(repo, ['config', 'user.name', 'Test User']);
    git(repo, ['checkout', '-b', 'main']);
    writeFileSync(path.join(repo, 'tracked.txt'), 'initial\n');
    writeFileSync(path.join(repo, 'other.txt'), 'baseline\n');
    git(repo, ['add', '.']);
    git(repo, ['commit', '-m', 'initial']);
    git(repo, ['remote', 'add', 'origin', remote]);
    git(repo, ['push', '-u', 'origin', 'main']);

    writeFileSync(path.join(repo, 'other.txt'), 'changed\n');

    const beforeHash = git(repo, ['rev-parse', '--short', 'HEAD']);
    const result = await gitPushWithRetry(repo, 'main', {
      maxAttempts: 1,
      retryDelayMs: 1,
      commitMessage: 'scoped no-op',
      addPaths: ['tracked.txt'],
    });

    assert.equal(result.pushed, false);
    assert.equal(result.hash, beforeHash);
    assert.equal(git(repo, ['rev-parse', '--short', 'HEAD']), beforeHash);
    assert.match(git(repo, ['status', '--porcelain']), /^M other\.txt$/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('gitSync verifies and returns the full HEAD hash', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'git-sync-'));
  const remote = path.join(root, 'remote.git');
  const repo = path.join(root, 'repo');

  try {
    git(root, ['init', '--bare', remote]);
    git(root, ['init', repo]);
    git(repo, ['config', 'user.email', 'test@example.com']);
    git(repo, ['config', 'user.name', 'Test User']);
    git(repo, ['checkout', '-b', 'main']);
    writeFileSync(path.join(repo, 'tracked.txt'), 'first\n');
    git(repo, ['add', 'tracked.txt']);
    git(repo, ['commit', '-m', 'first']);
    const targetHash = git(repo, ['rev-parse', 'HEAD']);
    writeFileSync(path.join(repo, 'tracked.txt'), 'second\n');
    git(repo, ['commit', '-am', 'second']);
    git(repo, ['remote', 'add', 'origin', remote]);

    const result = await gitSync(repo, targetHash);

    assert.equal(result.ok, true);
    assert.equal(result.target_hash, targetHash);
    assert.equal(result.actual_hash, targetHash);
    assert.equal(result.actual_hash.length, targetHash.length);
    assert.equal(result.actual_hash, git(repo, ['rev-parse', 'HEAD']));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
