import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { EffectCoordinator } from '../../../skills/nova/core/effects/coordinator.ts';
import { FileEffectJournal } from '../../../skills/nova/core/effects/journal.ts';
import { FileResourceLockManager } from '../../../skills/nova/core/effects/locks.ts';
import { stableEffectId } from '../../../skills/nova/core/effects/identity.ts';
import { activate } from '../../../skills/common/plugins/artifact-store/src/adapter.ts';

const owner = { pluginId: 'kubeclaw.artifact-store', apiVersion: 'pipeline-plugin-v2' as const,
  packageVersion: '1.0.0', contentDigest: `sha256:${'a'.repeat(64)}`, registrationId: 'main' };

for (const outcome of ['conflicting-request', 'orphaned-receipt', 'corrupt-journal'] as const) {
  test(`effect releases resource after locked recheck rejects ${outcome}`, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'effect-lock-lifetime-'));
    const signal = new AbortController().signal;
    const adapter = activate({ config: { artifactRoot: path.join(root, 'artifacts') } });
    try {
      const file = path.join(root, 'effects.jsonl');
      const journal = new FileEffectJournal(file);
      const concurrent = new FileEffectJournal(file);
      const locks = new FileResourceLockManager(path.join(root, 'locks'));
      const invocation = { idempotencyKey: 'race:key',
        attempt: { runId: 'run:regression', stageId: 'write', attemptId: 'attempt:regression', attemptNumber: 1 },
        capability: 'artifacts.write', operation: 'put_json',
        resource: { type: 'artifact.object', canonicalId: 'regression:object' },
        payload: { namespace: 'regression', mediaType: 'application/json', value: { original: true } } };
      const coordinator = new EffectCoordinator(journal, undefined, undefined, locks, 1000);
      const pending = coordinator.invoke(adapter, owner, invocation, signal);
      // Microtasks place a real second writer between the initial read and the
      // resource-locked recheck. No journal, lock manager or adapter is replaced.
      if (outcome === 'conflicting-request') {
        await concurrent.requested({ ...invocation, payload: { ...invocation.payload, value: { concurrent: true } },
          schemaVersion: 'effect-request.v2', effectId: stableEffectId(invocation), requestedAt: new Date().toISOString() });
        await assert.rejects(pending, /EFFECT_IDEMPOTENCY_CONFLICT/);
      } else {
        // Let the first request() complete and the initial receipt() read capture
        // absence; publish before the following continuation acquires the lock.
        await Promise.resolve();
        if (outcome === 'orphaned-receipt') {
          await concurrent.completed({ schemaVersion: 'effect-receipt.v2', effectId: 'effect:orphan',
            idempotencyKey: invocation.idempotencyKey, adapter: owner, status: 'completed', result: {},
            recordedAt: new Date().toISOString() });
          await assert.rejects(pending, /EFFECT_RECEIPT_ORPHANED/);
        } else {
          fs.appendFileSync(file, 'not-json\n');
          await assert.rejects(pending, SyntaxError);
        }
      }
      // A released record proves the error occurred after acquisition. A simple
      // absence assertion would also pass if the first unlocked read had failed.
      const history = fs.readFileSync(path.join(root, 'locks', 'locks.jsonl'), 'utf8').trim().split('\n')
        .map(line => JSON.parse(line).entry);
      assert.deepEqual(history.map(entry => entry.status), ['active', 'released']);
      const next = locks.acquire(invocation.resource, 'next:owner', 1000);
      assert.equal(next.fencingToken, 2);
      locks.release(next.lockId, next.ownerLeaseId);
      assert.equal(fs.readdirSync(path.join(root, 'locks')).filter(name => name.endsWith('.active')).length, 0);
    } finally {
      await adapter.shutdown(signal);
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

test('real artifact completion and receipt replay release once without repeating the effect', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'effect-completion-'));
  const signal = new AbortController().signal;
  const adapter = activate({ config: { artifactRoot: path.join(root, 'artifacts') } });
  try {
    const journal = new FileEffectJournal(path.join(root, 'effects.jsonl'));
    const locks = new FileResourceLockManager(path.join(root, 'locks'));
    const invocation = { idempotencyKey: 'write:key',
      attempt: { runId: 'run:success', stageId: 'write', attemptId: 'attempt:success', attemptNumber: 1 },
      capability: 'artifacts.write', operation: 'put_json', resource: { type: 'artifact.object', canonicalId: 'success' },
      payload: { namespace: 'regression', mediaType: 'application/json', value: { correct: true } } };
    const coordinator = new EffectCoordinator(journal, undefined, undefined, locks, 1000);
    const first = await coordinator.invoke(adapter, owner, invocation, signal);
    assert.equal(first.status, 'completed');
    assert.deepEqual(await coordinator.invoke(adapter, owner, invocation, signal), first);
    const history = fs.readFileSync(path.join(root, 'locks', 'locks.jsonl'), 'utf8').trim().split('\n')
      .map(line => JSON.parse(line).entry.status);
    // Invocation renews before dispatch; replay must create no second ownership.
    assert.equal(history.filter(status => status === 'released').length, 1);
    assert.equal(fs.readdirSync(path.join(root, 'locks')).filter(name => name.endsWith('.active')).length, 0);
  } finally { await adapter.shutdown(signal); fs.rmSync(root, { recursive: true, force: true }); }
});
