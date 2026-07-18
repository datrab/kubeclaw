import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  allocateModuleWorktree,
  cleanupModuleWorktree,
  freezeParallelGitBase,
  mergeModuleBranches,
  verifyModuleWorktreeClean,
} from '../../skills/common/pipeline/integrations/git-worktree.ts';

function git(cwd, args, opts = {}) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: opts.stdio || ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'E2E Test',
      GIT_AUTHOR_EMAIL: 'e2e@example.test',
      GIT_COMMITTER_NAME: 'E2E Test',
      GIT_COMMITTER_EMAIL: 'e2e@example.test',
    },
  }).trim();
}

function createRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'common-git-worktree-'));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.name', 'E2E Test']);
  git(root, ['config', 'user.email', 'e2e@example.test']);
  fs.writeFileSync(path.join(root, 'README.md'), '# seed\n');
  git(root, ['add', 'README.md']);
  git(root, ['commit', '-m', 'seed']);
  return root;
}

function commitFile(repoRoot, fileName, content, message) {
  fs.mkdirSync(path.dirname(path.join(repoRoot, fileName)), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, fileName), content);
  git(repoRoot, ['add', fileName]);
  git(repoRoot, ['commit', '-m', message]);
}

test('common Git authority allocates distinct module worktrees from one frozen base and joins clean branches', () => {
  const repoRoot = createRepo();
  const config = { repo_root: repoRoot, project: 'git-worktree-test' };
  const base = freezeParallelGitBase(config);

  const moduleTwo = allocateModuleWorktree(config, {
    runId: 'run-1',
    moduleId: '02-nginx',
    attempt: 1,
    baseCommit: base.base_commit,
  });
  const moduleThree = allocateModuleWorktree(config, {
    runId: 'run-1',
    moduleId: '03-nginx',
    attempt: 1,
    baseCommit: base.base_commit,
  });

  assert.notEqual(moduleTwo.worktree_path, moduleThree.worktree_path);
  assert.notEqual(moduleTwo.branch, moduleThree.branch);
  assert.equal(path.relative(repoRoot, moduleTwo.worktree_path).startsWith('..'), true);
  assert.equal(path.relative(repoRoot, moduleThree.worktree_path).startsWith('..'), true);
  assert.equal(git(moduleTwo.worktree_path, ['rev-parse', 'HEAD']), base.base_commit);
  assert.equal(git(moduleThree.worktree_path, ['rev-parse', 'HEAD']), base.base_commit);

  commitFile(moduleTwo.worktree_path, 'modules/02/content.txt', 'content branch\n', 'module 02');
  commitFile(moduleThree.worktree_path, 'modules/03/assets.txt', 'assets branch\n', 'module 03');
  verifyModuleWorktreeClean(moduleTwo.worktree_path);
  verifyModuleWorktreeClean(moduleThree.worktree_path);

  const merge = mergeModuleBranches(config, {
    branches: [moduleTwo.branch, moduleThree.branch],
  });

  assert.equal(merge.ok, true);
  assert.deepEqual(merge.merged_branches, [moduleTwo.branch, moduleThree.branch]);
  assert.equal(fs.readFileSync(path.join(repoRoot, 'modules/02/content.txt'), 'utf8'), 'content branch\n');
  assert.equal(fs.readFileSync(path.join(repoRoot, 'modules/03/assets.txt'), 'utf8'), 'assets branch\n');

  cleanupModuleWorktree(config, moduleTwo);
  cleanupModuleWorktree(config, moduleThree);
});

test('common Git authority reports typed module join conflicts', () => {
  const repoRoot = createRepo();
  const config = { repo_root: repoRoot, project: 'git-worktree-conflict-test' };
  const base = freezeParallelGitBase(config);

  const left = allocateModuleWorktree(config, { runId: 'run-2', moduleId: '02-nginx', attempt: 1, baseCommit: base.base_commit });
  const right = allocateModuleWorktree(config, { runId: 'run-2', moduleId: '03-nginx', attempt: 1, baseCommit: base.base_commit });

  commitFile(left.worktree_path, 'shared.txt', 'left\n', 'left edits shared');
  commitFile(right.worktree_path, 'shared.txt', 'right\n', 'right edits shared');

  assert.throws(
    () => mergeModuleBranches(config, { branches: [left.branch, right.branch] }),
    (error) => {
      assert.equal(error.code, 'module_join/conflict');
      assert.deepEqual(error.gitSync.conflicted_paths, ['shared.txt']);
      return true;
    },
  );

  cleanupModuleWorktree(config, left);
  cleanupModuleWorktree(config, right);
});

test('common Git authority separates non-conflict join failures from merge conflicts', () => {
  const repoRoot = createRepo();
  const config = { repo_root: repoRoot, project: 'git-worktree-missing-branch-test' };

  assert.throws(
    () => mergeModuleBranches(config, { branches: ['run/missing/module/02-nginx/attempt-1'] }),
    (error) => {
      assert.equal(error.code, 'module_join/merge_failed');
      assert.deepEqual(error.gitSync.conflicted_paths, []);
      assert.match(error.gitSync.cause, /not something we can merge|not a commit|unknown revision|ambiguous argument/i);
      return true;
    },
  );
});

test('common Git authority preserves parent runtime state while joining module branches', () => {
  const repoRoot = createRepo();
  const config = {
    repo_root: repoRoot,
    project: 'git-worktree-runtime-stash-test',
    paths: {
      swarm_dir: path.join(repoRoot, 'Projects/demo/src/.swarm'),
    },
  };
  fs.mkdirSync(path.join(repoRoot, 'Projects/demo/src'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'Projects/demo/src/app.txt'), 'base\n');
  git(repoRoot, ['add', 'Projects/demo/src/app.txt']);
  git(repoRoot, ['commit', '-m', 'app base']);
  const base = freezeParallelGitBase(config);

  const moduleTwo = allocateModuleWorktree(config, { runId: 'run-4', moduleId: '02-nginx', attempt: 1, baseCommit: base.base_commit });
  const runtimeLog = path.join(repoRoot, 'Projects/demo/src/.swarm/logs/pipeline/pipeline.jsonl');
  fs.mkdirSync(path.dirname(runtimeLog), { recursive: true });
  fs.writeFileSync(runtimeLog, '{"event":"live"}\n');

  commitFile(moduleTwo.worktree_path, 'Projects/demo/src/modules/02/content.txt', 'content branch\n', 'module 02');
  const merge = mergeModuleBranches(config, { branches: [moduleTwo.branch] });

  assert.equal(merge.ok, true);
  assert.deepEqual(merge.runtime_stash_paths, ['Projects/demo/src/.swarm/logs/pipeline/pipeline.jsonl']);
  assert.equal(fs.readFileSync(runtimeLog, 'utf8'), '{"event":"live"}\n');
  assert.equal(fs.readFileSync(path.join(repoRoot, 'Projects/demo/src/modules/02/content.txt'), 'utf8'), 'content branch\n');

  cleanupModuleWorktree(config, moduleTwo);
});

test('common Git authority treats Buster attempt workspaces as runtime state during module join', () => {
  const repoRoot = createRepo();
  const config = {
    repo_root: repoRoot,
    project: 'git-worktree-buster-attempt-runtime-test',
    paths: {
      swarm_dir: path.join(repoRoot, 'Projects/demo/src/.swarm'),
    },
  };
  fs.mkdirSync(path.join(repoRoot, 'Projects/demo/src'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'Projects/demo/src/app.txt'), 'base\n');
  git(repoRoot, ['add', 'Projects/demo/src/app.txt']);
  git(repoRoot, ['commit', '-m', 'app base']);
  const base = freezeParallelGitBase(config);

  const moduleTwo = allocateModuleWorktree(config, { runId: 'run-buster-attempt', moduleId: '02-nginx', attempt: 1, baseCommit: base.base_commit });
  const testEvidence = path.join(repoRoot, 'Projects/demo/src/.swarm/modules/01-nginx/tests/attempt-1/test-runtime.js');
  fs.mkdirSync(path.dirname(testEvidence), { recursive: true });
  fs.writeFileSync(testEvidence, 'export default true;\n');

  commitFile(moduleTwo.worktree_path, 'Projects/demo/src/modules/02/content.txt', 'content branch\n', 'module 02');
  const merge = mergeModuleBranches(config, { branches: [moduleTwo.branch] });

  assert.equal(merge.ok, true);
  assert.deepEqual(merge.runtime_stash_paths, ['Projects/demo/src/.swarm/modules/01-nginx/tests/attempt-1/test-runtime.js']);
  assert.equal(fs.readFileSync(testEvidence, 'utf8'), 'export default true;\n');

  cleanupModuleWorktree(config, moduleTwo);
});

test('common Git authority rejects module worktree roots inside the run worktree', () => {
  const repoRoot = createRepo();
  const config = {
    repo_root: repoRoot,
    project: 'git-worktree-inside-root-test',
    git: { parallel_worktree_root: '.swarm/worktrees' },
  };
  const base = freezeParallelGitBase(config);

  assert.throws(
    () => allocateModuleWorktree(config, {
      runId: 'run-3',
      moduleId: '02-nginx',
      attempt: 1,
      baseCommit: base.base_commit,
    }),
    (error) => {
      assert.equal(error.code, 'module_worktree/root_inside_repo');
      return true;
    },
  );
});
