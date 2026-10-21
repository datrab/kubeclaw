#!/usr/bin/env node

import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const core = await import(pathToFileURL(path.join(root, 'skills/nova/core/src/index.ts')).href);
const identity = await import(pathToFileURL(path.join(root, 'skills/nova/core/effects/identity.ts')).href);
const blueprint = await import(pathToFileURL(path.join(root, 'skills/nova/plugins/blueprint-sync/src/stage.ts')).href);

const calls = [];
const context = {
  contract: {
    config: {},
    artifacts: [],
    lease: { attempt: { runId: 'run:docs', stageId: 'sync', attemptId: 'attempt:sync', attemptNumber: 1 } },
  },
  async invoke(capability, request) {
    calls.push({ capability, operation: request.operation, resource: request.resource, payload: request.payload });
    if (capability === 'git.sync') return { synced: [{ path: 'control.json' }], missing: [] };
    if (capability === 'git.commit') return { commit: 'a'.repeat(40) };
    if (capability === 'state.append') return { appended: true };
    if (capability === 'artifacts.write') return { artifact: {
      artifactId: 'artifact:blueprint-sync', namespace: 'kubeclaw.blueprint-sync',
      mediaType: 'application/json', digest: `sha256:${'b'.repeat(64)}`, sizeBytes: 1,
      producer: { runId: 'run:docs', stageId: 'sync', attemptId: 'attempt:docs', attemptNumber: 1 },
    } };
    throw new Error(`unexpected capability: ${capability}`);
  },
};
const result = await blueprint.execute({
  blueprintId: 'docs', repositoryRoot: '/workspace/repository',
  branchRef: 'refs/heads/project/architecture', controlPaths: ['control.json'],
}, context);
assert.equal(result.outcome, 'passed');
assert.deepEqual(calls.map(({ capability }) => capability),
  ['git.sync', 'git.commit', 'state.append', 'artifacts.write']);

const attempt = { runId: 'run:docs', stageId: 'effect', attemptId: 'attempt:docs', attemptNumber: 1 };
const owner = {
  pluginId: 'example.effect-adapter', apiVersion: 'pipeline-plugin-v2', packageVersion: '1.0.0',
  contentDigest: `sha256:${'c'.repeat(64)}`, registrationId: 'state',
};
const invocation = {
  idempotencyKey: 'effect:docs:one', attempt, capability: 'state.append', operation: 'append',
  resource: { type: 'state.namespace', canonicalId: 'docs/effect' }, payload: { value: 1 },
};
const journal = new core.MemoryEffectJournal();
const effects = new core.EffectCoordinator(journal, () => new Date('2026-09-16T00:00:00Z'),
  undefined, new core.MemoryResourceLockManager());
let adapterInvocations = 0;
const adapter = {
  async ready() {},
  async invoke({ fence }) { fence.assertCurrent(); adapterInvocations += 1; return { appended: true }; },
  async shutdown() {},
};
const first = await effects.invoke(adapter, owner, invocation, new AbortController().signal);
const duplicate = await effects.invoke(adapter, owner, invocation, new AbortController().signal);
assert.equal(first.status, 'completed');
assert.deepEqual(duplicate, first);
assert.equal(adapterInvocations, 1, 'one effect identity must not invoke the adapter twice');

const next = await effects.invoke(adapter, owner,
  { ...invocation, idempotencyKey: 'effect:docs:next' }, new AbortController().signal);
assert.equal(next.status, 'completed');
assert.equal(adapterInvocations, 2, 'the resource lock must be released for the next effect');

let failedInvocations = 0;
const failingAdapter = {
  async ready() {},
  async invoke({ fence }) { fence.assertCurrent(); failedInvocations += 1; throw new Error('controlled failure'); },
  async shutdown() {},
};
const failedInvocation = { ...invocation, idempotencyKey: 'effect:docs:failed' };
const failed = await effects.invoke(failingAdapter, owner, failedInvocation, new AbortController().signal);
const failedRetry = await effects.invoke(failingAdapter, owner, failedInvocation, new AbortController().signal);
assert.equal(failed.status, 'failed');
assert.deepEqual(failedRetry, failed);
assert.equal(failedInvocations, 1, 'a recorded failure must not repeat the external mutation automatically');

const uncertainJournal = new core.MemoryEffectJournal();
const uncertainInvocation = { ...invocation, idempotencyKey: 'effect:docs:uncertain', payload: { value: 2 } };
const uncertain = {
  schemaVersion: 'effect-request.v2', effectId: identity.stableEffectId(uncertainInvocation), idempotencyKey: 'effect:docs:uncertain',
  attempt, capability: 'state.append', operation: 'append',
  resource: { type: 'state.namespace', canonicalId: 'docs/effect' }, payload: { value: 2 },
  requestedAt: '2026-09-16T00:00:00.000Z',
};
await uncertainJournal.requested(uncertain);
assert.equal(await uncertainJournal.accepted(uncertain), true);
assert.equal(await uncertainJournal.receipt(uncertain.idempotencyKey), undefined,
  'accepted without receipt must remain visibly uncertain');

let recoveryReceiptChecks = 0;
const recoveryAdapter = {
  async ready() {},
  async invoke() { throw new Error('recovery must not repeat the mutation'); },
  async receipt(request) { recoveryReceiptChecks += 1; return { recoveredEffectId: request.effectId }; },
  async shutdown() {},
};
const recoveryEffects = new core.EffectCoordinator(uncertainJournal, () => new Date('2026-09-16T00:00:00Z'),
  undefined, new core.MemoryResourceLockManager());
const recovered = await recoveryEffects.invoke(recoveryAdapter, owner, uncertainInvocation, new AbortController().signal);
assert.equal(recovered.status, 'completed');
assert.equal(recoveryReceiptChecks, 1, 'resume must reconcile an accepted effect through its external receipt');

const cancelled = new AbortController();
cancelled.abort(new Error('docs cancellation'));
await assert.rejects(effects.invoke(adapter, owner, { ...invocation, idempotencyKey: 'effect:docs:cancelled' }, cancelled.signal));

console.log(JSON.stringify({ ok: true, referencePlugin: 'kubeclaw.blueprint-sync',
  capabilityOrder: calls.map(({ capability }) => capability), duplicateAdapterInvocations: 1,
  nextEffectAfterLockRelease: next.status, failedRetryAdapterInvocations: failedInvocations,
  acceptedWithoutReceipt: true, recoveredByReceipt: recovered.status, cancellation: 'rejected',
  persistenceBoundary: 'memory journals; GNU flock-dependent checks reported separately' }));
