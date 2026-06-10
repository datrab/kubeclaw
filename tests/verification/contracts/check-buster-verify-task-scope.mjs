import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-buster-verify-task-scope' });
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import {
  buildSwarmScope,
  isGitPathInside,
  normalizeGitPath,
  validateProjectSlug,
} from '../../../skills/buster/pipeline/tools/verify-task.ts';
import { gitPushWithRetry } from '../../../skills/buster/pipeline/services/git-workflows.ts';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

const { sourceRoot } = parseArgs();

assert.equal(validateProjectSlug('foo'), 'foo');
assert.equal(validateProjectSlug('foo.bar-1_2'), 'foo.bar-1_2');
for (const badProject of ['', '.', '..', '../foo', 'foo/bar', 'foo\\bar', ' foo/bar ']) {
  assert.throws(() => validateProjectSlug(badProject), /Invalid project id/, `project id ${JSON.stringify(badProject)} must be rejected`);
}

assert.equal(normalizeGitPath('/Projects/foo//src/.swarm/'), 'Projects/foo/src/.swarm');

const scope = buildSwarmScope('foo');
assert.deepEqual(scope, {
  project: 'foo',
  projectRoot: 'Projects/foo',
  swarmRoot: 'Projects/foo/src/.swarm',
});

assert.equal(isGitPathInside('Projects/foo/src/.swarm/status.json', scope.projectRoot), true, 'project file inside project root');
assert.equal(isGitPathInside('Projects/foo/src/.swarm/status.json', scope.swarmRoot), true, 'swarm file inside swarm root');
assert.equal(isGitPathInside('Projects/foo/src/app.js', scope.projectRoot), true, 'app file inside project root');
assert.equal(isGitPathInside('Projects/foo/src/app.js', scope.swarmRoot), false, 'app file outside swarm root');
assert.equal(isGitPathInside('Projects/foobar/src/.swarm/status.json', scope.projectRoot), false, 'sibling project must not match project prefix');
assert.equal(isGitPathInside('Projects/foo-bar/src/.swarm/status.json', scope.projectRoot), false, 'hyphenated sibling project must not match project prefix');

const source = fs.readFileSync(path.join(sourceRoot, 'skills/buster/pipeline/tools/verify-task.ts'), 'utf8');
assert.equal(source.includes("agentRole.includes('buster')"), false, 'verify-task must not authorize by buster substring');
assert.equal(source.includes("agentRole.includes('forge')"), false, 'verify-task must not authorize by forge substring');
assert.equal(source.includes("agentRole.includes('test')"), false, 'verify-task must not authorize by test substring');
assert.equal(source.includes("agentRole.includes('echo')"), false, 'verify-task must not authorize by echo substring');
assert.equal(source.includes("gitExec(repoRoot, ['add', swarmRoot]"), false, 'verify-task should delegate scoped add/commit/push to gitPushWithRetry');
assert.equal(source.includes('addPaths: [swarmRoot]'), true, 'verify-task must pass explicit swarm pathspec to gitPushWithRetry');
assert.equal(source.includes('[SWARM-SCOPE]'), true, 'verify-task must report swarm scope violations');

const workflowsSource = fs.readFileSync(path.join(sourceRoot, 'skills/buster/pipeline/services/git-workflows.ts'), 'utf8');
assert.equal(workflowsSource.includes("['add', '-A']"), false, 'gitPushWithRetry must not stage the entire worktree');
assert.equal(workflowsSource.includes("['add', '--', ...addPaths]"), true, 'gitPushWithRetry commit mode must use scoped pathspecs');
assert.equal(workflowsSource.includes('commit mode requires non-empty opts.addPaths'), true, 'gitPushWithRetry commit mode must require explicit pathspecs');
assert.equal(workflowsSource.includes('origin/${branch}'), false, 'gitSync must not reset to implicit origin/current-branch fallback');
assert.equal(workflowsSource.includes("error: 'missing_target_hash'"), true, 'gitSync must expose typed missing target hash failure metadata');
assert.equal(workflowsSource.includes('rebase failed after'), true, 'gitPushWithRetry must fail closed after final rebase failure');

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-git-scope-'));
const remote = path.join(tmp, 'origin.git');
const repo = path.join(tmp, 'work');
fs.mkdirSync(repo);
git(tmp, ['init', '--bare', 'origin.git']);
git(repo, ['init', '-b', 'main']);
git(repo, ['config', 'user.email', 'verify@example.test']);
git(repo, ['config', 'user.name', 'Verify Test']);
fs.writeFileSync(path.join(repo, 'README.md'), '# scoped commit test\n');
git(repo, ['add', 'README.md']);
git(repo, ['commit', '-m', 'initial']);
git(repo, ['remote', 'add', 'origin', remote]);
git(repo, ['push', '-u', 'origin', 'main']);

fs.writeFileSync(path.join(repo, 'missing-addpaths.txt'), 'must not be staged\n');
await assert.rejects(
  () => gitPushWithRetry(repo, 'main', { commitMessage: 'missing add paths' }),
  /requires non-empty opts\.addPaths/,
  'commitMessage without addPaths must fail before staging',
);
assert.equal(git(repo, ['diff', '--cached', '--name-only']), '', 'missing addPaths failure must not stage files');

fs.writeFileSync(path.join(repo, 'allowed.txt'), 'allowed\n');
fs.writeFileSync(path.join(repo, 'unrelated.txt'), 'unrelated\n');
await gitPushWithRetry(repo, 'main', { commitMessage: 'scoped commit', addPaths: ['allowed.txt'] });
const committedFiles = git(repo, ['show', '--name-only', '--pretty=format:', 'HEAD']).split('\n').filter(Boolean);
assert.deepEqual(committedFiles, ['allowed.txt'], 'scoped commit should include only explicit addPaths');
const statusAfterScopedCommit = git(repo, ['status', '--porcelain']);
assert.equal(statusAfterScopedCommit.includes('?? unrelated.txt'), true, 'unrelated file should remain uncommitted');
assert.equal(statusAfterScopedCommit.includes('?? missing-addpaths.txt'), true, 'file from rejected broad commit should remain uncommitted');
fs.rmSync(tmp, { recursive: true, force: true });

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 34 }));
