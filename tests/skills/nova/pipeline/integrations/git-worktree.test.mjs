import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  __gitWorktreeTest,
  allocateModuleWorktree,
  commitModuleWorktreeChanges,
  freezeParallelGitBase,
  gitCommitAndPush,
  isRuntimeStatePath,
  mergeModuleBranches,
  setGitRuntimePolicy,
  verifyModuleWorktreeClean,
} from '../../../../../skills/nova/pipeline/integrations/git-worktree.ts';
import { gitSyncBeforeBuster } from '../../../../../skills/nova/pipeline/services/git-sync-before-buster.ts';
import { createRunStats } from '../../../../../skills/nova/pipeline/core/runtime.ts';
import { syncTaskRepo } from '../../../../../skills/buster/pipeline/services/task-lifecycle/git-sync.ts';

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
  setGitRuntimePolicy(gitPolicy());
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

function makeRemoteRepo() {
  setGitRuntimePolicy(gitPolicy());
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'git-worktree-remote-'));
  const remote = path.join(root, 'remote.git');
  const repoRoot = path.join(root, 'repo');
  const otherRoot = path.join(root, 'other');

  git(root, ['init', '--bare', remote]);
  git(root, ['clone', remote, repoRoot]);
  git(repoRoot, ['config', 'user.name', 'Test']);
  git(repoRoot, ['config', 'user.email', 'test@example.com']);

  fs.mkdirSync(path.join(repoRoot, 'Projects/demo/src/.swarm/modules/01-foundation'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'Projects/demo/src/package.json'), '{\n  "name": "demo"\n}\n');
  git(repoRoot, ['add', 'Projects/demo/src/package.json']);
  git(repoRoot, ['commit', '-m', 'initial']);
  git(repoRoot, ['push', '-u', 'origin', 'master']);

  git(root, ['clone', remote, otherRoot]);
  git(otherRoot, ['config', 'user.name', 'Other']);
  git(otherRoot, ['config', 'user.email', 'other@example.com']);

  return { root, remote, repoRoot, otherRoot };
}

function stashSubjects(repoRoot) {
  const output = git(repoRoot, ['stash', 'list', '--format=%s']);
  return output ? output.split('\n') : [];
}

function resolveGitPath(repoRoot, gitPathName) {
  const resolved = git(repoRoot, ['rev-parse', '--git-path', gitPathName]);
  return path.isAbsolute(resolved) ? resolved : path.join(repoRoot, resolved);
}

function gitPolicy() {
  return {
    git: {
      command: { timeout_ms: 30000, max_buffer_bytes: 52428800 },
      push: { timeout_ms: 60000, max_attempts: 3, retry_delay_ms: 1 },
    },
  };
}

function testConfig(repoRoot, extra = {}) {
  return { repo_root: repoRoot, project: 'test', ...gitPolicy(), ...extra };
}

async function withGitCommandShim({ command, message }, fn) {
  const shimRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'git-command-shim-'));
  const shimPath = path.join(shimRoot, 'git');
  fs.writeFileSync(shimPath, `#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
function gitCommand(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '-C') {
      index += 1;
      continue;
    }
    if (arg.startsWith('-')) continue;
    return arg;
  }
  return '';
}
if (gitCommand(args) === ${JSON.stringify(command)}) {
  console.error(${JSON.stringify(message)});
  process.exit(128);
}
const result = spawnSync('/usr/bin/git', args, { stdio: 'inherit', env: process.env });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);
`);
  fs.chmodSync(shimPath, 0o755);
  const oldPath = process.env.PATH;
  process.env.PATH = `${shimRoot}${path.delimiter}${oldPath || ''}`;
  try {
    return await fn();
  } finally {
    process.env.PATH = oldPath;
    fs.rmSync(shimRoot, { recursive: true, force: true });
  }
}

test('runtime stash restore preserves pre-existing user stash', () => {
  const repoRoot = makeRepo();
  const config = testConfig(repoRoot);

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
  assert.match(stashesAfterCollect[0] || '', /pipeline-pre-push-project-worktree$/);
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
  const config = testConfig(repoRoot);
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

test('runtime stash restore treats recreated runtime files as already restored when stash pop fails without merge conflicts', () => {
  const repoRoot = makeRepo();
  const config = {
    repo_root: repoRoot,
    project: 'demo',
    ...gitPolicy(),
    paths: {
      swarm_dir: path.join(repoRoot, 'Projects/demo/src/.swarm'),
      modules_dir: path.join(repoRoot, 'Projects/demo/src/.swarm/modules'),
    },
  };
  const runtimeLog = path.join(repoRoot, 'Projects/demo/src/.swarm/logs/pipeline/pipeline.jsonl');
  const completionFile = path.join(repoRoot, 'Projects/demo/src/.swarm/modules/01-foundation/forge-completion.json');

  fs.mkdirSync(path.dirname(runtimeLog), { recursive: true });
  fs.mkdirSync(path.dirname(completionFile), { recursive: true });
  fs.writeFileSync(runtimeLog, '{"event":"stashed"}\n');
  fs.writeFileSync(completionFile, '{"status":"READY_FOR_TESTING"}\n');

  const stashState = __gitWorktreeTest.collectRuntimeStateStash(config);
  assert.equal(stashSubjects(repoRoot).length, 1);

  fs.mkdirSync(path.dirname(runtimeLog), { recursive: true });
  fs.mkdirSync(path.dirname(completionFile), { recursive: true });
  fs.writeFileSync(runtimeLog, '{"event":"recreated"}\n');
  fs.writeFileSync(completionFile, '{"status":"RECREATED"}\n');

  __gitWorktreeTest.restoreRuntimeStateStash(config, stashState);

  assert.equal(fs.readFileSync(runtimeLog, 'utf8'), '{"event":"recreated"}\n');
  assert.equal(fs.readFileSync(completionFile, 'utf8'), '{"status":"RECREATED"}\n');
  assert.deepEqual(stashSubjects(repoRoot), []);
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

test('runtime-state classifier treats pipeline-generated module artifacts as safe auto-heal files', () => {
  const runtimePaths = [
    'Projects/demo/src/.swarm/progress.json',
    'Projects/demo/src/.swarm/modules/01-foundation/forge-completion.json',
    'Projects/demo/src/.swarm/modules/01-foundation/forge-completion.json.identity.json',
    'Projects/demo/src/.swarm/modules/01-foundation/forge-completion.stale-before-attempt-2.json',
    'Projects/demo/src/.swarm/modules/01-foundation/buster-completion.json',
    'Projects/demo/src/.swarm/modules/01-foundation/forge-output.json',
    'Projects/demo/src/.swarm/modules/01-foundation/buster-output.json',
    'Projects/demo/src/.swarm/modules/01-foundation/status.json',
    'Projects/demo/src/.swarm/modules/01-foundation/runtime-summary.md',
  ];
  const nonRuntimePaths = [
    'Projects/demo/src/.swarm/modules/01-foundation/FORGE.md',
    'Projects/demo/src/.swarm/modules/01-foundation/implementation.js',
  ];

  for (const relPath of runtimePaths) assert.equal(isRuntimeStatePath(relPath), true, relPath);
  for (const relPath of nonRuntimePaths) assert.equal(isRuntimeStatePath(relPath), false, relPath);
});

test('module branch join keeps branch-owned completion artifacts over stale parent runtime state', () => {
  const repoRoot = makeRepo();
  const config = {
    repo_root: repoRoot,
    project: 'demo',
    ...gitPolicy(),
    paths: {
      swarm_dir: path.join(repoRoot, 'Projects/demo/src/.swarm'),
      modules_dir: path.join(repoRoot, 'Projects/demo/src/.swarm/modules'),
    },
  };
  const completionRel = 'Projects/demo/src/.swarm/modules/01-foundation/forge-completion.json';
  const completionPath = path.join(repoRoot, completionRel);
  fs.mkdirSync(path.dirname(completionPath), { recursive: true });
  fs.writeFileSync(completionPath, JSON.stringify({ status: 'READY_FOR_TESTING', summary: 'base' }, null, 2));
  git(repoRoot, ['add', completionRel]);
  git(repoRoot, ['commit', '-m', 'base completion']);

  git(repoRoot, ['checkout', '-b', 'module-01-output']);
  fs.writeFileSync(completionPath, JSON.stringify({
    artifact_type: 'forge_completion',
    run_id: 'run-test',
    module_id: '01-foundation',
    attempt: 2,
    status: 'READY_FOR_TESTING',
    summary: 'normalized branch artifact',
    normalized: true,
    normalized_fields: ['artifact_type', 'run_id', 'module_id', 'attempt'],
  }, null, 2));
  git(repoRoot, ['add', completionRel]);
  git(repoRoot, ['commit', '-m', 'normalized module completion']);

  git(repoRoot, ['checkout', 'master']);
  fs.writeFileSync(completionPath, JSON.stringify({ status: 'READY_FOR_TESTING', summary: 'stale parent artifact' }, null, 2));

  mergeModuleBranches(config, { branches: ['module-01-output'] });

  const joined = JSON.parse(fs.readFileSync(completionPath, 'utf8'));
  assert.equal(joined.summary, 'normalized branch artifact');
  assert.equal(joined.normalized, true);
  assert.deepEqual(joined.normalized_fields, ['artifact_type', 'run_id', 'module_id', 'attempt']);
  assert.equal(git(repoRoot, ['status', '--porcelain', '--', completionRel]), '');
});

test('gitSyncBeforeBuster commits only meaningful forge paths and auto-resolves scoped rebase conflicts', async () => {
  const { root, repoRoot, otherRoot } = makeRemoteRepo();

  try {
    fs.writeFileSync(path.join(otherRoot, 'Projects/demo/src/package.json'), '{\n  "name": "remote"\n}\n');
    git(otherRoot, ['add', 'Projects/demo/src/package.json']);
    git(otherRoot, ['commit', '-m', 'remote update']);
    git(otherRoot, ['push', 'origin', 'master']);

    fs.writeFileSync(path.join(repoRoot, 'Projects/demo/src/package.json'), '{\n  "name": "local"\n}\n');
    const runtimeLog = path.join(repoRoot, 'Projects/demo/src/.swarm/logs/pipeline/runtime.jsonl');
    fs.mkdirSync(path.dirname(runtimeLog), { recursive: true });
    fs.writeFileSync(runtimeLog, '{"event":"live"}\n');
    fs.writeFileSync(path.join(repoRoot, 'README-outside-project.md'), 'leave me dirty\n');

    const config = {
      repo_root: repoRoot,
      project: 'demo',
      ...gitPolicy(),
      _runId: 'run-git-sync-before-buster-test',
      _runStats: createRunStats('2026-06-20T00:00:00.000Z'),
      paths: {
        swarm_dir: path.join(repoRoot, 'Projects/demo/src/.swarm'),
        modules_dir: path.join(repoRoot, 'Projects/demo/src/.swarm/modules'),
      },
    };
    const status = {
      module_id: '01-foundation',
      meaningful_paths: ['rojects/demo/src/Dockerfile'],
    };

    const result = await gitSyncBeforeBuster(config, '01-foundation', status);

    assert.match(result.commitHash, /^[0-9a-f]{40}$/);
    assert.equal(fs.readFileSync(path.join(repoRoot, 'Projects/demo/src/package.json'), 'utf8'), '{\n  "name": "local"\n}\n');
    assert.equal(fs.readFileSync(runtimeLog, 'utf8'), '{"event":"live"}\n');
    assert.equal(fs.readFileSync(path.join(repoRoot, 'README-outside-project.md'), 'utf8'), 'leave me dirty\n');

    const committedFiles = git(repoRoot, ['show', '--name-only', '--pretty=format:', 'HEAD'])
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    assert.deepEqual(committedFiles, ['Projects/demo/src/package.json']);

    git(repoRoot, ['fetch', 'origin', 'master']);
    assert.equal(
      git(repoRoot, ['show', 'origin/master:Projects/demo/src/package.json']),
      '{\n  "name": "local"\n}',
    );
    const porcelain = git(repoRoot, ['status', '--porcelain']);
    assert.match(porcelain, /^\?\? Projects\/demo\/src\/\.swarm\/$/m);
    assert.match(porcelain, /^\?\? README-outside-project\.md$/m);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('gitSyncBeforeBuster commits isolated module worktree output without pull-rebase or remote push', async () => {
  const { root, repoRoot, remote } = makeRemoteRepo();

  try {
    const parentConfig = {
      repo_root: repoRoot,
      project: 'demo',
      ...gitPolicy(),
      _runId: 'run-module-worktree-sync-test',
    };
    const base = freezeParallelGitBase(parentConfig);
    const worktree = allocateModuleWorktree(parentConfig, {
      runId: 'run-module-worktree-sync-test',
      moduleId: '02-nginx',
      attempt: 1,
      baseCommit: base.base_commit,
    });
    const moduleConfig = {
      ...parentConfig,
      repo_root: worktree.worktree_path,
      paths: {
        swarm_dir: path.join(worktree.worktree_path, 'Projects/demo/src/.swarm'),
        modules_dir: path.join(worktree.worktree_path, 'Projects/demo/src/.swarm/modules'),
      },
      _moduleWorktree: worktree,
      _runStats: createRunStats('2026-06-20T00:00:00.000Z'),
    };

    fs.writeFileSync(path.join(worktree.worktree_path, 'Projects/demo/src/package.json'), '{\n  "name": "module-two"\n}\n');
    fs.mkdirSync(path.join(worktree.worktree_path, 'Projects/demo/src/.swarm/logs/modules/02-nginx'), { recursive: true });
    fs.writeFileSync(path.join(worktree.worktree_path, 'Projects/demo/src/.swarm/logs/modules/02-nginx/runtime.jsonl'), '{"event":"runtime"}\n');

    const status = { module_id: '02-nginx' };
    const result = await gitSyncBeforeBuster(moduleConfig, '02-nginx', status);

    assert.match(result.commitHash, /^[0-9a-f]{40}$/);
    assert.equal(status.forge_commit_hash, result.commitHash);
    assert.equal(git(worktree.worktree_path, ['rev-parse', 'HEAD']), result.commitHash);
    assert.throws(
      () => git(remote, ['show-ref', '--verify', `refs/heads/${worktree.branch}`]),
      /Command failed/,
    );
    assert.equal(
      git(worktree.worktree_path, ['show', '--name-only', '--pretty=format:', 'HEAD']).trim(),
      'Projects/demo/src/package.json',
    );

    const clean = verifyModuleWorktreeClean(worktree.worktree_path);
    assert.deepEqual(clean.ignored_runtime_paths, ['?? Projects/demo/src/.swarm/logs/modules/02-nginx/runtime.jsonl']);

    const merge = mergeModuleBranches(parentConfig, { branches: [worktree.branch] });
    assert.equal(merge.ok, true);
    assert.equal(fs.readFileSync(path.join(repoRoot, 'Projects/demo/src/package.json'), 'utf8'), '{\n  "name": "module-two"\n}\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Buster task repo sync uses isolated module worktree without resetting parent run worktree', async () => {
  const { root, repoRoot } = makeRemoteRepo();

  try {
    const parentConfig = {
      repo_root: repoRoot,
      project: 'demo',
      ...gitPolicy(),
      _runId: 'run-module-buster-task-sync-test',
      paths: {
        swarm_dir: path.join(repoRoot, 'Projects/demo/src/.swarm'),
        modules_dir: path.join(repoRoot, 'Projects/demo/src/.swarm/modules'),
      },
    };
    const parentHead = git(repoRoot, ['rev-parse', 'HEAD']);
    const parentRuntimePath = path.join(repoRoot, 'Projects/demo/src/.swarm/logs/pipeline/runs/run-module-buster-task-sync-test/lifecycle/read-models.json');
    fs.mkdirSync(path.dirname(parentRuntimePath), { recursive: true });
    fs.writeFileSync(parentRuntimePath, '{"modules":{"01-nginx":{"status":"PASS"}}}\n');

    const base = freezeParallelGitBase(parentConfig);
    const worktree = allocateModuleWorktree(parentConfig, {
      runId: 'run-module-buster-task-sync-test',
      moduleId: '02-nginx',
      attempt: 1,
      baseCommit: base.base_commit,
    });
    const moduleConfig = {
      ...parentConfig,
      repo_root: worktree.worktree_path,
      paths: {
        swarm_dir: path.join(worktree.worktree_path, 'Projects/demo/src/.swarm'),
        modules_dir: path.join(worktree.worktree_path, 'Projects/demo/src/.swarm/modules'),
      },
    };

    fs.writeFileSync(path.join(worktree.worktree_path, 'Projects/demo/src/package.json'), '{\n  "name": "module-two"\n}\n');
    const moduleCommit = commitModuleWorktreeChanges(moduleConfig, '[pipeline] Module 02-nginx: Forge output — ready for Buster').hash;

    const priorRepoRoot = process.env.REPO_ROOT;
    process.env.REPO_ROOT = repoRoot;
    try {
      const result = await syncTaskRepo({
        payload: { session: { cwd: worktree.worktree_path } },
        commitHash: moduleCommit,
        moduleId: '02-nginx',
        tctx: {},
        logger: { info: () => {} },
      });

      assert.equal(result.repoRoot, worktree.worktree_path);
      assert.equal(result.syncResult.ok, true);
      assert.equal(git(worktree.worktree_path, ['rev-parse', 'HEAD']), moduleCommit);
      assert.equal(git(repoRoot, ['rev-parse', 'HEAD']), parentHead);
      assert.equal(fs.readFileSync(parentRuntimePath, 'utf8'), '{"modules":{"01-nginx":{"status":"PASS"}}}\n');
    } finally {
      if (priorRepoRoot === undefined) delete process.env.REPO_ROOT;
      else process.env.REPO_ROOT = priorRepoRoot;
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('gitCommitAndPush defaults to project-scoped staging and ignores unrelated dirty files', async () => {
  const { root, repoRoot } = makeRemoteRepo();

  try {
    fs.writeFileSync(path.join(repoRoot, 'Projects/demo/src/package.json'), '{\n  "name": "demo-local"\n}\n');
    fs.writeFileSync(path.join(repoRoot, 'README-outside-project.md'), 'outside dirty\n');

    const config = {
      repo_root: repoRoot,
      project: 'demo',
      ...gitPolicy(),
      _runId: 'run-git-commit-project-scope-test',
      _runStats: createRunStats('2026-06-20T00:00:00.000Z'),
      paths: {
        swarm_dir: path.join(repoRoot, 'Projects/demo/src/.swarm'),
        modules_dir: path.join(repoRoot, 'Projects/demo/src/.swarm/modules'),
      },
    };

    const result = await gitCommitAndPush(config, '[pipeline] Project-scoped default staging');

    assert.equal(result.committed, true);
    const committedFiles = git(repoRoot, ['show', '--name-only', '--pretty=format:', 'HEAD'])
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    assert.deepEqual(committedFiles, ['Projects/demo/src/package.json']);

    const porcelain = git(repoRoot, ['status', '--porcelain']);
    assert.match(porcelain, /^\?\? README-outside-project\.md$/m);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('gitCommitAndPush surfaces Git commit failures at commit authority', async () => {
  const { root, repoRoot } = makeRemoteRepo();

  try {
    fs.writeFileSync(path.join(repoRoot, 'Projects/demo/src/package.json'), '{\n  "name": "demo-commit-fail"\n}\n');

    const config = {
      repo_root: repoRoot,
      project: 'demo',
      ...gitPolicy(),
      paths: {
        swarm_dir: path.join(repoRoot, 'Projects/demo/src/.swarm'),
        modules_dir: path.join(repoRoot, 'Projects/demo/src/.swarm/modules'),
      },
    };

    await withGitCommandShim({
      command: 'commit',
      message: 'git commit failed: pre-commit hook declined REAL_E2E_EXPECTED_GIT_COMMIT_FAILURE',
    }, async () => {
      await assert.rejects(
        () => gitCommitAndPush(config, '[pipeline] Intentional commit failure'),
        /REAL_E2E_EXPECTED_GIT_COMMIT_FAILURE/,
      );
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('gitCommitAndPush surfaces Git push failures at push authority', async () => {
  const { root, repoRoot } = makeRemoteRepo();

  try {
    fs.writeFileSync(path.join(repoRoot, 'Projects/demo/src/package.json'), '{\n  "name": "demo-push-fail"\n}\n');

    const config = {
      repo_root: repoRoot,
      project: 'demo',
      ...gitPolicy(),
      paths: {
        swarm_dir: path.join(repoRoot, 'Projects/demo/src/.swarm'),
        modules_dir: path.join(repoRoot, 'Projects/demo/src/.swarm/modules'),
      },
    };

    await withGitCommandShim({
      command: 'push',
      message: 'Permission denied (publickey).',
    }, async () => {
      await assert.rejects(
        () => gitCommitAndPush(config, '[pipeline] Intentional push failure'),
        /Permission denied \(publickey\)/,
      );
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('gitCommitAndPush skips proactive pull when tracked out-of-scope files are dirty', async () => {
  const { root, repoRoot } = makeRemoteRepo();

  try {
    fs.writeFileSync(path.join(repoRoot, 'Projects/demo/src/package.json'), '{\n  "name": "demo-local"\n}\n');
    fs.writeFileSync(path.join(repoRoot, 'README.md'), 'tracked out-of-scope dirty\n');

    const config = {
      repo_root: repoRoot,
      project: 'demo',
      ...gitPolicy(),
      _runId: 'run-git-commit-out-of-scope-dirty-test',
      _runStats: createRunStats('2026-06-20T00:00:00.000Z'),
      paths: {
        swarm_dir: path.join(repoRoot, 'Projects/demo/src/.swarm'),
        modules_dir: path.join(repoRoot, 'Projects/demo/src/.swarm/modules'),
      },
    };

    const result = await gitCommitAndPush(config, '[pipeline] Skip proactive pull for out-of-scope dirtiness');

    assert.equal(result.committed, true);
    assert.equal(fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8'), 'tracked out-of-scope dirty\n');
    assert.equal(
      git(repoRoot, ['show', 'origin/master:Projects/demo/src/package.json']),
      '{\n  "name": "demo-local"\n}',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('gitCommitAndPush falls back to pull-rebase after direct push rejection when out-of-scope files are dirty', async () => {
  const { root, repoRoot, otherRoot } = makeRemoteRepo();

  try {
    fs.writeFileSync(path.join(otherRoot, 'user.txt'), 'remote advancement\n');
    git(otherRoot, ['add', 'user.txt']);
    git(otherRoot, ['commit', '-m', 'remote advancement']);
    git(otherRoot, ['push', 'origin', 'master']);

    fs.writeFileSync(path.join(repoRoot, 'Projects/demo/src/package.json'), '{\n  "name": "demo-rebased"\n}\n');
    fs.writeFileSync(path.join(repoRoot, 'README.md'), 'tracked out-of-scope dirty\n');

    const config = {
      repo_root: repoRoot,
      project: 'demo',
      ...gitPolicy(),
      _runId: 'run-git-commit-out-of-scope-rejected-test',
      _runStats: createRunStats('2026-06-20T00:00:00.000Z'),
      paths: {
        swarm_dir: path.join(repoRoot, 'Projects/demo/src/.swarm'),
        modules_dir: path.join(repoRoot, 'Projects/demo/src/.swarm/modules'),
      },
    };

    const result = await gitCommitAndPush(config, '[pipeline] Fallback rebase after out-of-scope dirty push rejection');

    assert.equal(result.committed, true);
    assert.equal(fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8'), 'tracked out-of-scope dirty\n');
    assert.equal(
      git(repoRoot, ['show', 'origin/master:Projects/demo/src/package.json']),
      '{\n  "name": "demo-rebased"\n}',
    );
    assert.equal(git(repoRoot, ['show', 'origin/master:user.txt']), 'remote advancement');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('gitCommitAndPush auto-resolves conflicts for the staged publication paths', async () => {
  const { root, repoRoot, otherRoot } = makeRemoteRepo();

  try {
    fs.writeFileSync(path.join(repoRoot, 'review-output.json'), '{ "status": "base" }\n');
    git(repoRoot, ['add', 'review-output.json']);
    git(repoRoot, ['commit', '-m', 'add review output']);
    git(repoRoot, ['push', 'origin', 'master']);

    git(otherRoot, ['pull', '--rebase']);
    fs.writeFileSync(path.join(otherRoot, 'review-output.json'), '{ "status": "remote" }\n');
    git(otherRoot, ['add', 'review-output.json']);
    git(otherRoot, ['commit', '-m', 'remote review output']);
    git(otherRoot, ['push', 'origin', 'master']);

    fs.writeFileSync(path.join(repoRoot, 'review-output.json'), '{ "status": "local-publication" }\n');

    const config = {
      repo_root: repoRoot,
      project: 'demo',
      ...gitPolicy(),
      _runId: 'run-git-commit-staged-conflict-test',
      _runStats: createRunStats('2026-06-20T00:00:00.000Z'),
      paths: {
        swarm_dir: path.join(repoRoot, 'Projects/demo/src/.swarm'),
        modules_dir: path.join(repoRoot, 'Projects/demo/src/.swarm/modules'),
      },
    };

    const result = await gitCommitAndPush(config, '[pipeline] Publish review output', {
      addPaths: ['review-output.json'],
    });

    assert.equal(result.committed, true);
    assert.equal(git(repoRoot, ['show', 'origin/master:review-output.json']), '{ "status": "local-publication" }');
    assert.equal(git(repoRoot, ['status', '--porcelain']), '');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('gitCommitAndPush preserves uncommitted project files during pull-rebase', async () => {
  const { root, repoRoot, otherRoot } = makeRemoteRepo();

  try {
    const extraProjectFile = path.join(repoRoot, 'Projects/demo/src/local-notes.md');
    fs.writeFileSync(extraProjectFile, 'base notes\n');
    git(repoRoot, ['add', 'Projects/demo/src/local-notes.md']);
    git(repoRoot, ['commit', '-m', 'add local notes']);
    git(repoRoot, ['push', 'origin', 'master']);

    git(otherRoot, ['pull', '--rebase']);
    fs.writeFileSync(path.join(otherRoot, 'user.txt'), 'remote advancement\n');
    git(otherRoot, ['add', 'user.txt']);
    git(otherRoot, ['commit', '-m', 'remote advancement']);
    git(otherRoot, ['push', 'origin', 'master']);

    fs.writeFileSync(path.join(repoRoot, 'Projects/demo/src/package.json'), '{\n  "name": "demo-preserved"\n}\n');
    fs.writeFileSync(extraProjectFile, 'uncommitted project notes\n');

    const config = {
      repo_root: repoRoot,
      project: 'demo',
      ...gitPolicy(),
      _runId: 'run-git-commit-project-dirty-preserved-test',
      _runStats: createRunStats('2026-06-20T00:00:00.000Z'),
      paths: {
        swarm_dir: path.join(repoRoot, 'Projects/demo/src/.swarm'),
        modules_dir: path.join(repoRoot, 'Projects/demo/src/.swarm/modules'),
      },
    };

    const result = await gitCommitAndPush(config, '[pipeline] Preserve project dirtiness', {
      addPaths: ['Projects/demo/src/package.json'],
    });

    assert.equal(result.committed, true);
    assert.equal(fs.readFileSync(extraProjectFile, 'utf8'), 'uncommitted project notes\n');
    assert.equal(
      git(repoRoot, ['show', 'origin/master:Projects/demo/src/package.json']),
      '{\n  "name": "demo-preserved"\n}',
    );
    assert.equal(git(repoRoot, ['show', 'origin/master:Projects/demo/src/local-notes.md']), 'base notes');
    assert.match(git(repoRoot, ['status', '--porcelain']), /^ ?M Projects\/demo\/src\/local-notes\.md$/m);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
