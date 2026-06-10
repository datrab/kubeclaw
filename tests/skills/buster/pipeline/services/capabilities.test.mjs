import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { appendDurableOperatorAlert } from '../../../../../skills/buster/pipeline/services/capabilities.ts';

function withTempCwd(fn) {
  const previousCwd = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-capabilities-'));
  const repoRoot = path.join(tempRoot, 'repo');
  fs.mkdirSync(repoRoot);
  process.chdir(repoRoot);
  try {
    return fn({ tempRoot, repoRoot });
  } finally {
    process.chdir(previousCwd);
  }
}

test('capability alerts ignore explicit context paths that escape the repository', () => {
  withTempCwd(({ tempRoot, repoRoot }) => {
    const outsideDir = path.join(tempRoot, 'outside');

    appendDurableOperatorAlert({
      logDir: '../outside',
      testsLogDir: '.swarm/logs/../outside-tests',
      pipelineLogPath: path.join(outsideDir, 'pipeline.jsonl'),
      pipelineRunLogPath: '../outside-run/pipeline.jsonl',
    }, { reason: 'buster_capability_denied' });

    assert.equal(fs.existsSync(path.join(outsideDir, 'operator-alerts.jsonl')), false);
    assert.equal(fs.existsSync(path.join(repoRoot, '.swarm', 'outside-tests', 'operator-alerts.jsonl')), false);
    assert.equal(fs.existsSync(path.join(tempRoot, 'outside-run', 'operator-alerts.jsonl')), false);
    assert.equal(fs.existsSync(path.join(repoRoot, '.swarm', 'logs', 'pipeline', 'operator-alerts.jsonl')), false);
  });
});

test('capability alerts still write repository-scoped context targets', () => {
  withTempCwd(({ repoRoot }) => {
    appendDurableOperatorAlert({
      logDir: '.swarm/logs/task',
      pipelineLogPath: '.swarm/logs/run/pipeline.jsonl',
    }, { reason: 'buster_capability_denied' });

    assert.equal(fs.existsSync(path.join(repoRoot, '.swarm', 'logs', 'task', 'operator-alerts.jsonl')), true);
    assert.equal(fs.existsSync(path.join(repoRoot, '.swarm', 'logs', 'run', 'operator-alerts.jsonl')), true);
    assert.equal(fs.existsSync(path.join(repoRoot, '.swarm', 'logs', 'pipeline', 'operator-alerts.jsonl')), false);
  });
});

test('capability alerts allow absolute context targets inside the repository', () => {
  withTempCwd(({ repoRoot }) => {
    appendDurableOperatorAlert({
      logDir: path.join(repoRoot, '.swarm', 'logs', 'task'),
      pipelineLogPath: path.join(repoRoot, '.swarm', 'logs', 'run', 'pipeline.jsonl'),
    }, { reason: 'buster_capability_denied' });

    assert.equal(fs.existsSync(path.join(repoRoot, '.swarm', 'logs', 'task', 'operator-alerts.jsonl')), true);
    assert.equal(fs.existsSync(path.join(repoRoot, '.swarm', 'logs', 'run', 'operator-alerts.jsonl')), true);
    assert.equal(fs.existsSync(path.join(repoRoot, '.swarm', 'logs', 'pipeline', 'operator-alerts.jsonl')), false);
  });
});
