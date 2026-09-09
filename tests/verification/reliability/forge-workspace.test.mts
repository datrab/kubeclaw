import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { forgeFixture, git, repository } from './fixtures/forge-runtime.mts';
import { workspaceTarget } from '../../../skills/common/plugins/runtime-dispatch/src/workspace-target.ts';
import { runtimeWorkspaceGeneration } from '@kubeclaw/plugin-sdk';
import { targetsFrom } from '../../../skills/common/plugins/runtime-dispatch/src/openclaw-config.ts';
process.env.PATH = `${path.join(repository, 'node_modules/.bin')}:${process.env.PATH}`;
const records = (file: string) => fs.readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line).entry);

// Standalone worktree graph, real Core runner/effects/locks/Git and original HTTP gateway
// transport. The controlled HTTP endpoint executes native file operations; no
// real OpenClaw model or deployed Forge execution is claimed.
test('two real standalone workspaces reach original OpenClaw spawn and integrate only their own files', async () => {
  const f = await forgeFixture('parallel');
  try {
    const result = await f.runner.run(f.runId); f.assertServer();
    assert.equal(result.status, 'succeeded', JSON.stringify(records(f.eventsPath).filter(e => e.type === 'stage.blocked' || e.type === 'stage.failed')));
    assert.equal(f.spawns.length, 2); assert.notEqual(f.spawns[0]!.cwd, f.spawns[1]!.cwd);
    for (const module of ['a', 'b']) assert.equal(fs.readFileSync(path.join(f.repo, `${module}.js`), 'utf8'), 'export const ready = true;\n');
    const effects = records(f.effectsPath);
    const dispatches = effects.filter(e => e.type === 'requested' && e.request.capability === 'runtime.dispatch').map(e => e.request);
    const target = targetsFrom(f.configs.get('kubeclaw.runtime-dispatch:openclaw')!).get('forge')!;
    for (const request of dispatches) {
      const ref = request.payload.workspaceReference;
      assert.equal(f.spawns.some(s => s.cwd === ref.workspacePath), true);
      assert.equal(fs.existsSync(ref.workspacePath), false, 'successful cleanup removes only completed generation');
      const altered = { ...request, attempt: { ...request.attempt, runId: 'foreign-run' } };
      assert.throws(() => workspaceTarget(target, altered), /OWNER_MISMATCH/);
    }
    assert.equal(fs.readdirSync(path.join(f.repo, '.pipeline/results')).filter(name => name.endsWith('.json')).length, 2, 'collector results survive worktree cleanup');
  } finally { await f.close(); }
});

for (const mode of ['locked-worktree', 'branch-only'] as const) test(`real lint repair proceeds from H1 with retained ${mode}`, async () => {
  const f = await forgeFixture(mode);
  try {
    const result = await f.runner.run(f.runId); f.assertServer();
    assert.equal(result.status, 'succeeded', JSON.stringify(records(f.eventsPath).filter(e => e.type === 'stage.blocked' || e.type === 'stage.failed')));
    assert.equal(f.spawns.length, 2); assert.notEqual(f.spawns[0]!.cwd, f.spawns[1]!.cwd);
    const effects = records(f.effectsPath);
    const merges = effects.filter(e => e.type === 'requested' && e.request.capability === 'git.merge');
    const receipts = merges.map(e => effects.find(r => r.type === 'completed' && r.receipt.effectId === e.request.effectId).receipt);
    assert.equal(receipts.length, 2);
    assert.equal(f.spawns[1]!.input.headBefore, receipts[0]!.result.sourceRevision, 'repair starts at confirmed H1');
    assert.equal(git(f.repo, ['rev-parse', 'HEAD']), receipts[1]!.result.sourceRevision);
    assert.equal(records(f.eventsPath).filter(e => e.type === 'attempt.completed' && e.identity.stageId === 'lint-a').length, 2, 'native lint reruns after repair');
    assert.equal(fs.existsSync(f.retained[0].workspacePath), mode === 'locked-worktree');
    if (mode === 'locked-worktree') verifyRetainedAuthority(f, effects);

    assert.equal(git(f.repo, ['rev-parse', '--verify', f.retained[0].branch]).length, 40, 'retained prior branch is not adopted or deleted');
    assert.equal(fs.readFileSync(path.join(f.repo, 'a.js'), 'utf8'), 'export const ready = true;\n');
    assert(effects.some(e => e.type === 'requested' && e.request.payload?.value?.schemaVersion === 'implementation-cleanup.v1' && e.request.payload.value.workspaceReference.owner.attemptNumber === 1));
  } finally { await f.close(); }
});

function verifyRetainedAuthority(f: Awaited<ReturnType<typeof forgeFixture>>, effects: any[]): void {
  const request = effects.find(e => e.type === 'requested' && e.request.capability === 'runtime.dispatch').request;
  const target = targetsFrom(f.configs.get('kubeclaw.runtime-dispatch:openclaw')!).get('forge')!;
  assert.equal(workspaceTarget(target, request).cwd, f.retained[0].workspacePath, 'positive control uses existing owned worktree');
  assert.throws(() => workspaceTarget({ ...target, workspaceRoot: f.repo }, request), /ROOT_MISMATCH/);
  for (const field of ['runId', 'attemptId'] as const) {
    assert.throws(() => workspaceTarget(target, { ...request, attempt: { ...request.attempt, [field]: 'foreign' } }), /OWNER_MISMATCH/);
  }
  const forged = { ...request, payload: { ...request.payload, workspaceReference: { ...request.payload.workspaceReference, sourceRevision: 'a'.repeat(40) } } };
  assert.throws(() => workspaceTarget(target, forged), /OWNER_MISMATCH/, 'caller cannot rewrite persisted source ownership');
}

test('generation is deterministic and binds project branch, repository and complete attempt owner', () => {
  const owner = { runId: 'same-run', stageId: 'implementation-a', attemptId: 'same-attempt', attemptNumber: 1 };
  const scope = { repositoryRoot: '/repos/one', branch: 'nova/project-one/run/a' };
  const generation = runtimeWorkspaceGeneration(owner, scope);
  assert.equal(runtimeWorkspaceGeneration({ ...owner }, { ...scope }), generation);
  assert.equal(generation.length, 64);
  assert.notEqual(runtimeWorkspaceGeneration(owner, { ...scope, branch: 'nova/project-two/run/a' }), generation);
  assert.notEqual(runtimeWorkspaceGeneration(owner, { ...scope, repositoryRoot: '/repos/two' }), generation);
  assert.notEqual(runtimeWorkspaceGeneration({ ...owner, attemptNumber: 2 }, scope), generation);
  assert.notEqual(runtimeWorkspaceGeneration({ ...owner, runId: 'other-run' }, scope), generation);
});
