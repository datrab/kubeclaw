import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { EffectCoordinator } from '../../../skills/nova/core/effects/coordinator.ts';
import { FileEffectJournal } from '../../../skills/nova/core/effects/journal.ts';
import { FileResourceLockManager } from '../../../skills/nova/core/effects/locks.ts';
import { activate } from '../../../skills/common/plugins/git-workspace/src/adapter.ts';
import { git } from './fixtures/forge-runtime.mts';
const owner = { pluginId: 'kubeclaw.git-workspace', apiVersion: 'pipeline-plugin-v2' as const,
  packageVersion: '1.0.0', contentDigest: `sha256:${'a'.repeat(64)}`, registrationId: 'git' };

for (const disposition of ['release', 'cancel', 'timeout'] as const) test(`real Git resource contention ${disposition} is resolved before effect acceptance`, async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-lock-wait-'));
  const repo = path.join(temporary, 'repository'), workspaces = path.join(temporary, 'workspaces');
  fs.mkdirSync(repo); fs.mkdirSync(workspaces);
  git(repo, ['init', '-q']); git(repo, ['config', 'user.name', 'Fixture']); git(repo, ['config', 'user.email', 'fixture@example.invalid']);
  fs.writeFileSync(path.join(repo, 'file'), 'baseline'); git(repo, ['add', '.']); git(repo, ['commit', '-qm', 'baseline']);
  const adapter = activate({ config: { allowedRepositoryRoots: [repo], workspaceRoot: workspaces,
    gitExecutable: fs.realpathSync('/usr/bin/git'), authorName: 'Fixture', authorEmail: 'fixture@example.invalid', maxExecutionMs: 5000, maxOutputBytes: 65536, terminationGraceMs: 100 } });
  const signal = new AbortController();
  const journalPath = path.join(temporary, 'effects.jsonl');
  const locks = new FileResourceLockManager(path.join(temporary, 'locks'));
  const competing = new FileResourceLockManager(path.join(temporary, 'locks'));
  const resource = { type: 'git.repository', canonicalId: repo };
  const held = competing.acquire(resource, 'existing-owner', 5000);
  let released = false;
  try {
    const effects = new EffectCoordinator(new FileEffectJournal(journalPath), undefined, undefined, locks, disposition === 'timeout' ? 40 : 1000);
    const pending = effects.invoke(adapter, owner, { idempotencyKey: 'create', attempt: { runId: 'run', stageId: 'create', attemptId: 'waiter', attemptNumber: 1 },
      capability: 'git.workspace.create', operation: 'create', resource,
      payload: { repositoryRoot: repo, workspacePath: path.join(workspaces, 'run', 'new'), branch: 'new', baseRef: 'HEAD' } }, signal.signal);
    // Observe rejection immediately; the timer acts only on the real competing
    // lock or cancellation signal, never on the adapter or effect journal.
    const outcome = pending.then(value => ({ value }), error => ({ error }));
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(fs.existsSync(path.join(workspaces, 'run', 'new')), false);
    assert.equal(fs.existsSync(journalPath) ? fs.readFileSync(journalPath, 'utf8').trim() : '', '');
    if (disposition === 'release') { competing.release(held.lockId, held.ownerLeaseId); released = true; }
    if (disposition === 'cancel') signal.abort(new Error('caller cancelled'));
    const result = await outcome;
    if (disposition === 'release') {
      assert('value' in result); assert.equal(result.value.status, 'completed');
      assert.equal(git(path.join(workspaces, 'run', 'new'), ['rev-parse', 'HEAD']), git(repo, ['rev-parse', 'HEAD']));
      const outside = path.join(temporary, 'outside'); fs.mkdirSync(outside);
      fs.symlinkSync(outside, path.join(workspaces, 'linked'));
      const denied = await effects.invoke(adapter, owner, { idempotencyKey: 'outside', attempt: { runId: 'run', stageId: 'create', attemptId: 'outside', attemptNumber: 1 },
        capability: 'git.workspace.create', operation: 'create', resource,
        payload: { repositoryRoot: repo, workspacePath: path.join(workspaces, 'linked', 'missing', 'new'), branch: 'outside', baseRef: 'HEAD' } }, signal.signal);
      assert.equal(denied.status, 'failed'); assert.match(denied.error!.message, /GIT_CONFIG_INVALID:workspaceParent/);
      assert.deepEqual(fs.readdirSync(outside), [], 'missing parents below a symlink are not created outside the root');

    } else {
      assert('error' in result); assert.match(result.error.message, disposition === 'cancel' ? /WAIT_CANCELLED/ : /WAIT_TIMEOUT/);
      assert.equal(fs.existsSync(path.join(workspaces, 'run', 'new')), false);
      assert.equal(fs.existsSync(journalPath) ? fs.readFileSync(journalPath, 'utf8').trim() : '', '');
    }
  } finally {
    if (!released) competing.release(held.lockId, held.ownerLeaseId);
    await adapter.shutdown(new AbortController().signal); fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('serialized real conflicting merges retain the conflict instead of treating it as lock contention', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-merge-conflict-'));
  const repo = path.join(temporary, 'repository'), workspaces = path.join(temporary, 'workspaces');
  fs.mkdirSync(repo); fs.mkdirSync(workspaces);
  git(repo, ['init', '-q']); git(repo, ['config', 'user.name', 'Fixture']); git(repo, ['config', 'user.email', 'fixture@example.invalid']);
  fs.writeFileSync(path.join(repo, 'file'), 'baseline\n'); git(repo, ['add', '.']); git(repo, ['commit', '-qm', 'baseline']);
  for (const branch of ['left', 'right']) {
    const workspace = path.join(workspaces, branch);
    git(repo, ['worktree', 'add', '-qb', branch, workspace, 'HEAD']);
    fs.writeFileSync(path.join(workspace, 'file'), `${branch}\n`); git(workspace, ['commit', '-qam', branch]);
  }
  const adapter = activate({ config: { allowedRepositoryRoots: [repo], workspaceRoot: workspaces,
    gitExecutable: fs.realpathSync('/usr/bin/git'), authorName: 'Fixture', authorEmail: 'fixture@example.invalid', maxExecutionMs: 5000, maxOutputBytes: 65536, terminationGraceMs: 100 } });
  const signal = new AbortController().signal;
  try {
    const journal = new FileEffectJournal(path.join(temporary, 'effects.jsonl'));
    const effects = new EffectCoordinator(journal, undefined, undefined, new FileResourceLockManager(path.join(temporary, 'locks')), 1000);
    const results = await Promise.all(['left', 'right'].map(branch => effects.invoke(adapter, owner, {
      idempotencyKey: `merge:${branch}`, attempt: { runId: 'run', stageId: branch, attemptId: branch, attemptNumber: 1 },
      capability: 'git.merge', operation: 'merge', resource: { type: 'git.repository', canonicalId: repo }, payload: { sourceRef: branch },
    }, signal)));
    assert.deepEqual(results.map(result => result.status).sort(), ['completed', 'failed']);
    assert.match(results.find(result => result.status === 'failed')!.error!.message, /^GIT_COMMAND_FAILED:1:/);
    assert.notEqual(git(repo, ['ls-files', '-u']), '', 'real unresolved merge index remains inspectable');
    const entries = fs.readFileSync(path.join(temporary, 'effects.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line).entry);
    assert.equal(entries.filter(entry => entry.type === 'accepted').length, 2, 'each real merge executes once');
  } finally { await adapter.shutdown(signal); fs.rmSync(temporary, { recursive: true, force: true }); }
});
