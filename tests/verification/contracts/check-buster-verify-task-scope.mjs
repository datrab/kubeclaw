import { parseSourceRootArgs } from '../lib/contract-check-helpers.mjs';
import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-buster-verify-task-scope' });
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { expandSwarmConfig } from '../../../skills/nova/pipeline/core/platform-config.ts';
import {
  buildSwarmScope,
  isGitPathInside,
  normalizeGitPath,
  validateProjectSlug,
} from '../../../skills/buster/pipeline/tools/verify-task.ts';
import { gitPushWithRetry } from '../../../skills/buster/pipeline/services/git-workflows.ts';


const { sourceRoot } = parseSourceRootArgs();
const previousSwarmConfig = process.env.SWARM_CONFIG;
const expandedConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-verify-scope-config-'));
const expandedConfigPath = path.join(expandedConfigDir, 'swarm.config.effective.json');
const compactConfig = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'charts', 'kubeclaw', 'files', 'config', 'swarm.config.json'), 'utf8'));
fs.writeFileSync(expandedConfigPath, `${JSON.stringify(expandSwarmConfig(compactConfig), null, 2)}\n`);
process.env.SWARM_CONFIG = expandedConfigPath;

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

const source = [
  fs.readFileSync(path.join(sourceRoot, 'skills/buster/pipeline/tools/verify-task.ts'), 'utf8'),
  fs.readFileSync(path.join(sourceRoot, 'skills/buster/pipeline/tools/verify-task-execution.ts'), 'utf8'),
  fs.readFileSync(path.join(sourceRoot, 'skills/buster/pipeline/tools/verify-task-scope.ts'), 'utf8'),
].join('\n');
assert.equal(source.includes("agentRole.includes('buster')"), false, 'verify-task must not authorize by buster substring');
assert.equal(source.includes("agentRole.includes('forge')"), false, 'verify-task must not authorize by forge substring');
assert.equal(source.includes("agentRole.includes('test')"), false, 'verify-task must not authorize by test substring');
assert.equal(source.includes("agentRole.includes('echo')"), false, 'verify-task must not authorize by echo substring');
assert.equal(source.includes("gitExec(repoRoot, ['add', swarmRoot]"), false, 'verify-task should delegate scoped add/commit/push to gitPushWithRetry');
assert.equal(source.includes('addPaths: explicitAddPaths'), true, 'verify-task must pass validated explicit swarm pathspecs to gitPushWithRetry');
assert.equal(source.includes('[SWARM-SCOPE]'), true, 'verify-task must report swarm scope violations');

const workflowsSource = [
  fs.readFileSync(path.join(sourceRoot, 'skills/buster/pipeline/services/git-workflows.ts'), 'utf8'),
  fs.readFileSync(path.join(sourceRoot, 'skills/buster/pipeline/services/git-push-policy.ts'), 'utf8'),
].join('\n');
const gitSyncSource = workflowsSource.slice(
  workflowsSource.indexOf('export async function gitSync'),
  workflowsSource.indexOf('// ─── gitPushWithRetry'),
);
assert.equal(workflowsSource.includes("['add', '-A']"), false, 'gitPushWithRetry must not stage the entire worktree');
assert.equal(workflowsSource.includes("['add', '--', ...addPaths]"), true, 'gitPushWithRetry commit mode must use scoped pathspecs');
assert.equal(workflowsSource.includes('commit mode requires non-empty opts.addPaths'), true, 'gitPushWithRetry commit mode must require explicit pathspecs');
assert.equal(workflowsSource.includes("'--autostash'"), true, 'gitPushWithRetry must tolerate unrelated dirty runtime state during pull --rebase');
assert.equal(gitSyncSource.includes('origin/${branch}'), false, 'gitSync must not reset to implicit origin/current-branch fallback');
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
  () => gitPushWithRetry(repo, 'main', { maxAttempts: 1, retryDelayMs: 1, commitMessage: 'missing add paths' }),
  /requires non-empty opts\.addPaths/,
  'commitMessage without addPaths must fail before staging',
);
assert.equal(git(repo, ['diff', '--cached', '--name-only']), '', 'missing addPaths failure must not stage files');

fs.writeFileSync(path.join(repo, 'allowed.txt'), 'allowed\n');
fs.writeFileSync(path.join(repo, 'unrelated.txt'), 'unrelated\n');
await gitPushWithRetry(repo, 'main', { maxAttempts: 1, retryDelayMs: 1, commitMessage: 'scoped commit', addPaths: ['allowed.txt'] });
const committedFiles = git(repo, ['show', '--name-only', '--pretty=format:', 'HEAD']).split('\n').filter(Boolean);
assert.deepEqual(committedFiles, ['allowed.txt'], 'scoped commit should include only explicit addPaths');
const statusAfterScopedCommit = git(repo, ['status', '--porcelain']);
assert.equal(statusAfterScopedCommit.includes('?? unrelated.txt'), true, 'unrelated file should remain uncommitted');
assert.equal(statusAfterScopedCommit.includes('?? missing-addpaths.txt'), true, 'file from rejected broad commit should remain uncommitted');
fs.rmSync(tmp, { recursive: true, force: true });
fs.rmSync(expandedConfigDir, { recursive: true, force: true });
if (previousSwarmConfig === undefined) delete process.env.SWARM_CONFIG;
else process.env.SWARM_CONFIG = previousSwarmConfig;

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 34 }));
