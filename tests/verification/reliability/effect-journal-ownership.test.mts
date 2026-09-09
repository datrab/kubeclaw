import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { FileEffectJournal, MemoryEffectJournal } from '../../../skills/nova/core/effects/journal.ts';

for (const kind of ['memory', 'file', 'file-sidecar'] as const) {
  test(`effect journal owns request and receipt payloads: ${kind}`, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'effect-ownership-'));
    try {
      const file = path.join(root, 'effects.jsonl');
      const journal = kind === 'memory' ? new MemoryEffectJournal() : new FileEffectJournal(file);
      const request = { schemaVersion: 'effect-request.v2' as const, effectId: 'effect:ownership', idempotencyKey: 'ownership',
        attempt: { runId: 'run:ownership', stageId: 'write', attemptId: 'attempt:ownership', attemptNumber: 1 },
        capability: 'artifacts.write', operation: 'put_json', resource: { type: 'artifact.object', canonicalId: 'owned' },
        payload: { nested: { value: 'original' } }, requestedAt: '2026-09-09T00:00:00.000Z' };
      await journal.requested(request);
      request.payload.nested.value = 'caller mutation';
      assert.equal((await journal.request('ownership'))?.payload.nested.value, 'original');
      const returned = await journal.request('ownership');
      assert.throws(() => { returned!.payload.nested.value = 'reader mutation'; }, TypeError);
      const receipt = { schemaVersion: 'effect-receipt.v2' as const, effectId: request.effectId, idempotencyKey: request.idempotencyKey,
        adapter: { pluginId: 'kubeclaw.artifact-store', apiVersion: 'pipeline-plugin-v2' as const, packageVersion: '1.0.0',
          registrationId: 'main', contentDigest: `sha256:${'a'.repeat(64)}` }, status: 'completed' as const,
        result: { nested: { value: 'original' }, text: kind === 'file-sidecar' ? 'x'.repeat(70_000) : 'small' },
        recordedAt: '2026-09-09T00:00:01.000Z' };
      await journal.completed(receipt);
      receipt.result.nested.value = 'caller mutation';
      const saved = await journal.receipt('ownership');
      assert.equal(saved?.result?.nested.value, 'original');
      assert.throws(() => { saved!.result!.nested.value = 'reader mutation'; }, TypeError);
      if (kind !== 'memory') {
        const reopened = new FileEffectJournal(file);
        assert.deepEqual(await reopened.request('ownership'), returned);
        const replayed = await reopened.receipt('ownership');
        assert.deepEqual(replayed, saved);
        assert.throws(() => { replayed!.result!.nested.value = 'replay mutation'; }, TypeError);
        assert.deepEqual(await new FileEffectJournal(file).receipt('ownership'), saved);
        assert.equal(fs.readFileSync(file, 'utf8').includes('completed-reference'), kind === 'file-sidecar');
      }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
}
