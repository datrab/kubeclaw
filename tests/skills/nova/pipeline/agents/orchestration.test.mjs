import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { computeFilesChanged } from '../../../../../skills/nova/pipeline/agents/orchestration.ts';

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });
}

function initRepo(cwd) {
  execFileSync('git', ['init', cwd], { stdio: 'ignore' });
  fs.writeFileSync(path.join(cwd, 'tracked.txt'), 'initial\n');
  git(cwd, ['add', 'tracked.txt']);
  git(cwd, ['commit', '-m', 'initial']);
}

test('computeFilesChanged uses the cwd captured with the baseline', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestration-cwd-'));
  const repoRoot = path.join(root, 'repo-root');
  const agentCwd = path.join(root, 'agent-cwd');

  try {
    fs.mkdirSync(repoRoot);
    fs.mkdirSync(agentCwd);
    initRepo(repoRoot);
    initRepo(agentCwd);

    fs.writeFileSync(path.join(repoRoot, 'repo-only.txt'), 'changed outside agent cwd\n');

    const result = computeFilesChanged({
      gatewayLabel: 'agent-cwd-test',
      _baselineCwd: agentCwd,
      _baselineFiles: new Set(),
    }, {
      repo_root: repoRoot,
    });

    assert.deepEqual(result, { filesChanged: null, baselineTracked: true });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('computeFilesChanged suppresses telemetry when baseline cwd is missing', () => {
  const result = computeFilesChanged({
    gatewayLabel: 'legacy-baseline-test',
    _baselineFiles: new Set(),
  }, {
    repo_root: process.cwd(),
  });

  assert.deepEqual(result, { filesChanged: null, baselineTracked: false });
});
