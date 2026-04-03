import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

import { assessPollingPullSafety, gitPullForPolling } from '../integrations/git.js';
import { trackAgent, untrackAgent } from '../agents/shutdown.js';

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function createRepoFixture(prefix, { withRemote = false } = {}) {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), `git-polling-${prefix}-`));
  const repoRoot = path.join(baseDir, 'repo');
  fs.mkdirSync(repoRoot, { recursive: true });
  git(baseDir, ['init', '--initial-branch=main', repoRoot]);
  git(repoRoot, ['config', 'user.email', 'tests@example.com']);
  git(repoRoot, ['config', 'user.name', 'Pipeline Tests']);
  fs.writeFileSync(path.join(repoRoot, 'README.md'), '# fixture\n');
  git(repoRoot, ['add', 'README.md']);
  git(repoRoot, ['commit', '-m', 'initial commit']);

  if (withRemote) {
    const remoteDir = path.join(baseDir, 'remote.git');
    git(baseDir, ['init', '--bare', remoteDir]);
    git(repoRoot, ['remote', 'add', 'origin', remoteDir]);
    git(repoRoot, ['push', '-u', 'origin', 'main']);
  }

  return {
    baseDir,
    repoRoot,
    config: {
      project: 'git-polling',
      repo_root: repoRoot,
    },
  };
}

afterEach(() => {
  for (const label of ['forge-active', 'echo-active']) {
    try { untrackAgent(label); } catch {}
  }
});

describe('git polling safety', () => {
  it('fails closed when the shared worktree is dirty', () => {
    const fixture = createRepoFixture('dirty');
    fs.writeFileSync(path.join(fixture.repoRoot, 'notes.txt'), 'untracked work\n');

    const safety = assessPollingPullSafety(fixture.config);

    assert.equal(safety.safe, false);
    assert.equal(safety.reason, 'dirty_worktree');

    let thrown = null;
    try {
      gitPullForPolling(fixture.config);
    } catch (err) {
      thrown = err;
    }
    assert.equal(thrown?.code, 'POLLING_GIT_UNSAFE');
    assert.equal(thrown?.pollingGit?.reason, 'dirty_worktree');
  });

  it('skips polling pulls when an active agent session may own local changes', () => {
    const fixture = createRepoFixture('active-session');
    trackAgent(fixture.config, 'forge-active', 'session-1', 'forge', 'forge-active');

    const safety = assessPollingPullSafety(fixture.config);
    const result = gitPullForPolling(fixture.config);

    assert.equal(safety.action, 'skip');
    assert.equal(safety.reason, 'active_session');
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'active_session');
  });

  it('fails closed when the local branch is ahead of upstream', () => {
    const fixture = createRepoFixture('ahead', { withRemote: true });
    fs.writeFileSync(path.join(fixture.repoRoot, 'README.md'), '# changed\n');
    git(fixture.repoRoot, ['add', 'README.md']);
    git(fixture.repoRoot, ['commit', '-m', 'ahead of upstream']);

    const safety = assessPollingPullSafety(fixture.config);

    assert.equal(safety.safe, false);
    assert.equal(safety.reason, 'unpushed_commits');

    let thrown = null;
    try {
      gitPullForPolling(fixture.config);
    } catch (err) {
      thrown = err;
    }
    assert.equal(thrown?.code, 'POLLING_GIT_UNSAFE');
    assert.equal(thrown?.pollingGit?.reason, 'unpushed_commits');
  });
});
