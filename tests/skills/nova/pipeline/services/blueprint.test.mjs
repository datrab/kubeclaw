import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { __blueprintTest } from '../../../../../skills/nova/pipeline/services/blueprint.ts';

function git(cwd, args, extraEnv = {}) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
      ...extraEnv,
    },
  }).trim();
}

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

test('ensureRemoteBranchRef fetches architecture refs into single-branch clones', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-fetch-test-'));
  const remoteRoot = path.join(root, 'remote.git');
  const seedRoot = path.join(root, 'seed');
  const cloneRoot = path.join(root, 'clone');

  fs.mkdirSync(remoteRoot, { recursive: true });
  git(root, ['init', '--bare', remoteRoot]);
  git(root, ['clone', remoteRoot, seedRoot]);
  git(seedRoot, ['config', 'user.name', 'Test']);
  git(seedRoot, ['config', 'user.email', 'test@example.com']);

  writeFile(path.join(seedRoot, 'README.md'), 'seed\n');
  git(seedRoot, ['add', 'README.md']);
  git(seedRoot, ['commit', '-m', 'seed']);
  git(seedRoot, ['branch', '-M', 'pipeline-code']);
  git(seedRoot, ['push', '-u', 'origin', 'pipeline-code']);

  git(seedRoot, ['checkout', '-b', 'pipeline-smoke-landing/architecture']);
  writeFile(
    path.join(seedRoot, 'Projects/pipeline-smoke-landing/src/.swarm/modules/01-foundation/FORGE.md'),
    '# blueprint\n',
  );
  git(seedRoot, ['add', 'Projects/pipeline-smoke-landing/src/.swarm/modules/01-foundation/FORGE.md']);
  git(seedRoot, ['commit', '-m', 'add architecture blueprint']);
  git(seedRoot, ['push', '-u', 'origin', 'pipeline-smoke-landing/architecture']);

  git(root, ['clone', '--single-branch', '--branch', 'pipeline-code', remoteRoot, cloneRoot]);
  assert.equal(
    git(cloneRoot, ['config', '--get-all', 'remote.origin.fetch']),
    '+refs/heads/pipeline-code:refs/remotes/origin/pipeline-code',
  );

  assert.throws(
    () => git(cloneRoot, ['cat-file', '-e', 'origin/pipeline-smoke-landing/architecture:Projects/pipeline-smoke-landing/src/.swarm/modules/01-foundation/FORGE.md']),
    /fatal:/,
  );

  const branchRef = __blueprintTest.ensureRemoteBranchRef(
    { repo_root: cloneRoot },
    'pipeline-smoke-landing/architecture',
    'test fetch',
  );

  assert.equal(branchRef, 'origin/pipeline-smoke-landing/architecture');
  assert.match(
    git(cloneRoot, ['show', `${branchRef}:Projects/pipeline-smoke-landing/src/.swarm/modules/01-foundation/FORGE.md`]),
    /# blueprint/,
  );
});
