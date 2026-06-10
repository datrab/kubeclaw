import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resolveProjectPaths } from '../../../../../skills/nova/pipeline/tools/project-summary.ts';

function writeSwarmConfig(dir, config = {}) {
  const configPath = path.join(dir, 'swarm.config.json');
  fs.writeFileSync(configPath, JSON.stringify({ projects_root: 'Projects', ...config }));
  return configPath;
}

test('resolveProjectPaths rejects traversal project selectors before filesystem scans', () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-summary-repo-'));
  const configPath = writeSwarmConfig(repoDir);

  assert.throws(
    () => resolveProjectPaths('../../tmp', repoDir, configPath),
    /project-summary\.project: invalid project selector/,
  );
});

test('resolveProjectPaths keeps derived paths inside the configured projects root', () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-summary-repo-'));
  const configPath = writeSwarmConfig(repoDir);

  const paths = resolveProjectPaths('demo', repoDir, configPath);

  assert.equal(paths.projectRoot, path.join(repoDir, 'Projects', 'demo', 'src'));
  assert.equal(paths.swarmRoot, path.join(repoDir, 'Projects', 'demo', 'src', '.swarm'));
  assert.equal(paths.progressPath, path.join(repoDir, 'Projects', 'demo', 'src', '.swarm', 'progress.json'));
});
