import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildBusterTestConfig,
  computeFilesChanged,
} from '../../../../../skills/nova/pipeline/agents/orchestration.ts';

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

test('buildBusterTestConfig isolates standard PORT-based serve commands per dispatch', () => {
  const result = buildBusterTestConfig({
    test_config: {
      serve: {
        port: 43101,
        start_cmd: 'PORT=43101 npm start',
        health_path: '/health',
      },
    },
  }, {
    run_id: 'run-test',
    buster: { suite_timeout_ms: 120000 },
  }, {
    config: { run_id: 'run-test' },
    targetId: '01-foundation',
    attempt: 2,
    dispatchId: 'buster-module-01-foundation-test',
  });

  assert.equal(result.suite_timeout_ms, 120000);
  assert.notEqual(result.serve.port, 43101);
  assert.match(result.serve.start_cmd, /^PORT=\d+ npm start$/);
  assert.equal(result.serve.start_cmd.includes('43101'), false);
  assert.equal(result.serve.configured_port, 43101);
  assert.equal(result.serve.port_source, 'pipeline_isolated_per_dispatch');
});

test('buildBusterTestConfig leaves non-standard serve commands unchanged', () => {
  const result = buildBusterTestConfig({
    test_config: {
      serve: {
        port: 43101,
        start_cmd: 'npm start -- --port 43101',
      },
    },
  }, {
    run_id: 'run-test',
    buster: { suite_timeout_ms: 120000 },
  }, {
    config: { run_id: 'run-test' },
    targetId: '01-foundation',
    attempt: 1,
    dispatchId: 'buster-module-01-foundation-test',
  });

  assert.equal(result.serve.port, 43101);
  assert.equal(result.serve.start_cmd, 'npm start -- --port 43101');
  assert.equal(result.serve.configured_port, undefined);
});
