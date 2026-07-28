import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-git-workspace-'));
const repository = path.join(temporary, 'repository');
const workspaceRoot = path.join(temporary, 'workspaces');
const deniedRoot = path.join(temporary, 'denied');
fs.mkdirSync(repository);
fs.mkdirSync(workspaceRoot);
fs.mkdirSync(deniedRoot);
const gitExecutable = fs.realpathSync(execFileSync('/usr/bin/env', ['which', 'git'], { encoding: 'utf8' }).trim());

function git(cwd, args) {
  return execFileSync(gitExecutable, args, { cwd, encoding: 'utf8' }).trim();
}

function gitWithIdentity(cwd, args) {
  return git(cwd, [
    '-c',
    'user.name=Git Workspace Test',
    '-c',
    'user.email=git-workspace@example.test',
    '-c',
    'core.hooksPath=/dev/null',
    '-c',
    'commit.gpgSign=false',
    ...args,
  ]);
}

git(repository, ['init', '-b', 'main']);
fs.writeFileSync(path.join(repository, 'selected.txt'), 'initial selected\n');
fs.writeFileSync(path.join(repository, 'unrelated.txt'), 'initial unrelated\n');
fs.writeFileSync(path.join(repository, 'merge.txt'), 'initial merge\n');
git(repository, ['add', '.']);
gitWithIdentity(repository, ['commit', '-m', 'initial']);

const { activate } = await import(pathToFileURL(path.resolve('dist/adapter.js')).href);
function createAdapter(overrides = {}) {
  return activate({
    registration: {},
    config: {
      allowedRepositoryRoots: [fs.realpathSync(repository)],
      workspaceRoot: fs.realpathSync(workspaceRoot),
      gitExecutable,
      authorName: 'Git Workspace Adapter',
      authorEmail: 'git-workspace-adapter@example.test',
      maxExecutionMs: 5_000,
      maxOutputBytes: 64 * 1024,
      terminationGraceMs: 25,
      ...overrides,
    },
    async emit() {},
    async invoke() { throw new Error('unexpected dependency'); },
  });
}

const attempt = {
  runId: 'run:test',
  stageId: 'stage:test',
  attemptId: 'attempt:test',
  attemptNumber: 1,
};
let sequence = 0;
function invoke(adapter, capability, operation, resource, payload, signal = new AbortController().signal) {
  sequence += 1;
  return adapter.invoke({
    request: {
      requestId: `request:${sequence}`,
      idempotencyKey: `git:${sequence}`,
      attempt,
      capability,
      operation,
      resource: { type: 'git.repository', canonicalId: resource },
      payload,
    },
    signal,
  });
}

const adapter = createAdapter();
const workspace = path.join(workspaceRoot, 'feature');
try {
  await adapter.ready();
  const created = await invoke(
    adapter,
    'git.workspace.create',
    'create',
    fs.realpathSync(repository),
    {
      repositoryRoot: fs.realpathSync(repository),
      workspacePath: workspace,
      branch: 'feature',
      baseRef: 'main',
    },
  );
  assert.equal(created.workspace, fs.realpathSync(workspace));

  const hookMarker = path.join(temporary, 'hook-ran');
  const hookDir = path.join(workspace, '.test-hooks');
  fs.mkdirSync(hookDir);
  const hook = path.join(hookDir, 'pre-commit');
  fs.writeFileSync(hook, `#!/bin/sh\nprintf hook > ${JSON.stringify(hookMarker)}\nexit 1\n`);
  fs.chmodSync(hook, 0o755);
  git(workspace, ['config', 'core.hooksPath', hookDir]);

  fs.writeFileSync(path.join(workspace, 'selected.txt'), 'committed selected\n');
  fs.writeFileSync(path.join(workspace, 'unrelated.txt'), 'staged but unrelated\n');
  git(workspace, ['add', 'unrelated.txt']);
  const committed = await invoke(
    adapter,
    'git.commit',
    'commit',
    fs.realpathSync(workspace),
    { paths: ['selected.txt'], message: 'scoped commit' },
  );
  assert.equal(committed.exitCode, 0);
  assert.equal(fs.existsSync(hookMarker), false);
  assert.equal(git(workspace, ['show', 'HEAD:selected.txt']), 'committed selected');
  assert.equal(git(workspace, ['show', 'HEAD:unrelated.txt']), 'initial unrelated');
  assert.match(git(workspace, ['status', '--porcelain']), /^M  unrelated\.txt$/m);
  git(workspace, ['reset', 'HEAD', '--', 'unrelated.txt']);
  git(workspace, ['checkout', '--', 'unrelated.txt']);

  git(repository, ['checkout', '-b', 'merge-source']);
  fs.writeFileSync(path.join(repository, 'merge.txt'), 'merged content\n');
  git(repository, ['add', 'merge.txt']);
  gitWithIdentity(repository, ['commit', '-m', 'merge source']);
  const merged = await invoke(
    adapter,
    'git.merge',
    'merge',
    fs.realpathSync(workspace),
    { sourceRef: 'merge-source' },
  );
  assert.equal(merged.exitCode, 0);
  assert.equal(fs.readFileSync(path.join(workspace, 'merge.txt'), 'utf8'), 'merged content\n');

  await assert.rejects(
    invoke(adapter, 'git.workspace.create', 'create', fs.realpathSync(repository), {
      repositoryRoot: fs.realpathSync(repository),
      workspacePath: path.join(workspaceRoot, 'bad-branch'),
      branch: '--upload-pack=evil',
      baseRef: 'main',
    }),
    /GIT_VALUE_INVALID:branch/,
  );
  await assert.rejects(
    invoke(adapter, 'git.workspace.create', 'create', fs.realpathSync(repository), {
      repositoryRoot: fs.realpathSync(repository),
      workspacePath: path.join(workspaceRoot, 'bad-ref'),
      branch: 'safe-branch',
      baseRef: 'main\n--help',
    }),
    /GIT_VALUE_INVALID:baseRef/,
  );
  await assert.rejects(
    invoke(adapter, 'git.merge', 'merge', fs.realpathSync(workspace), { sourceRef: '--help' }),
    /GIT_VALUE_INVALID:sourceRef/,
  );
  await assert.rejects(
    invoke(adapter, 'git.commit', 'commit', fs.realpathSync(workspace), {
      paths: ['../outside'],
      message: 'bad path',
    }),
    /GIT_PATHS_INVALID/,
  );
  await assert.rejects(
    invoke(adapter, 'git.commit', 'commit', fs.realpathSync(workspace), {
      paths: ['selected.txt'],
      message: 'bad\nmessage',
    }),
    /GIT_VALUE_INVALID:message/,
  );

  const outside = path.join(temporary, 'outside');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret');
  fs.symlinkSync(outside, path.join(workspace, 'linked'));
  await assert.rejects(
    invoke(adapter, 'git.commit', 'commit', fs.realpathSync(workspace), {
      paths: ['linked/secret.txt'],
      message: 'symlink path',
    }),
    /GIT_SYMLINK_DENIED/,
  );
  await assert.rejects(
    invoke(adapter, 'git.commit', 'commit', fs.realpathSync(deniedRoot), {
      paths: ['file.txt'],
      message: 'denied',
    }),
    /GIT_PATH_DENIED/,
  );
} finally {
  await adapter.shutdown();
}

function executableScript(name, body) {
  const file = path.join(temporary, name);
  fs.writeFileSync(file, `#!/bin/sh\n${body}\n`);
  fs.chmodSync(file, 0o755);
  return fs.realpathSync(file);
}

async function processLimitCase(overrides, expected, signalSetup) {
  const limited = createAdapter(overrides);
  try {
    await limited.ready();
    const controller = new AbortController();
    const pending = invoke(
      limited,
      'git.commit',
      'commit',
      fs.realpathSync(repository),
      { paths: ['selected.txt'], message: 'limited' },
      controller.signal,
    );
    signalSetup?.(controller, limited);
    await assert.rejects(pending, expected);
  } finally {
    await limited.shutdown();
  }
}

await processLimitCase(
  { gitExecutable: executableScript('output-git', 'printf 0123456789') , maxOutputBytes: 8 },
  /GIT_OUTPUT_LIMIT_EXCEEDED/,
);
await processLimitCase(
  { gitExecutable: executableScript('timeout-git', 'sleep 10'), maxExecutionMs: 20 },
  /GIT_TIMEOUT/,
);
await processLimitCase(
  { gitExecutable: executableScript('cancel-git', 'sleep 10') },
  /ADAPTER_CANCELLED/,
  (controller) => setTimeout(() => controller.abort(), 20),
);

const shutdownAdapter = createAdapter({
  gitExecutable: executableScript('shutdown-git', 'trap "" TERM\nsleep 10'),
});
await shutdownAdapter.ready();
const shutdownPending = invoke(
  shutdownAdapter,
  'git.commit',
  'commit',
  fs.realpathSync(repository),
  { paths: ['selected.txt'], message: 'shutdown' },
);
await new Promise((resolve) => setTimeout(resolve, 20));
await shutdownAdapter.shutdown();
await assert.rejects(shutdownPending, /GIT_COMMAND_FAILED/);
await assert.rejects(
  invoke(
    shutdownAdapter,
    'git.commit',
    'commit',
    fs.realpathSync(repository),
    { paths: ['selected.txt'], message: 'after shutdown' },
  ),
  /ADAPTER_SHUTTING_DOWN/,
);

const symlinkRoot = path.join(temporary, 'repository-link');
fs.symlinkSync(repository, symlinkRoot);
assert.throws(
  () => createAdapter({ allowedRepositoryRoots: [symlinkRoot] }),
  /GIT_CONFIG_INVALID:allowedRepositoryRoots/,
);

fs.rmSync(temporary, { recursive: true, force: true });
console.log(JSON.stringify({
  ok: true,
  plugin: 'kubeclaw.git-workspace',
  suite: 'live-function',
}));
