import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { activate } from '../../../skills/common/plugins/artifact-store/src/adapter.ts';
import { readRunArtifacts } from './real-run-evidence.mjs';

test('E2E acceptance reads actual durable artifact writes and rejects damaged evidence', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-durable-evidence-'));
  const adapter = activate({ config: { artifactRoot: root } });
  const namespace = 'kubeclaw.lint';
  try {
    await adapter.ready();
    for (const runId of ['run:current', 'run:other']) {
      await adapter.invoke({ confidential: true, signal: new AbortController().signal, request: {
        capability: 'artifacts.write', operation: 'put_json', idempotencyKey: runId,
        resource: { type: 'artifact.object', canonicalId: 'lint:module' },
        attempt: { runId, stageId: 'lint', attemptId: `${runId}:1`, attemptNumber: 1 },
        payload: { namespace, mediaType: 'application/json', value: { runId, findings: ['actual persisted report bytes'] } },
      } });
    }
    const artifacts = await readRunArtifacts(root, 'run:current', [namespace]);
    assert.equal(artifacts.length, 1);
    assert.deepEqual(artifacts[0].value, { runId: 'run:current', findings: ['actual persisted report bytes'] });
    const hash = artifacts[0].artifact.digest.slice('sha256:'.length);
    fs.writeFileSync(path.join(root, 'blobs/sha256', hash.slice(0, 2), hash.slice(2)), '{}');
    await assert.rejects(() => readRunArtifacts(root, 'run:current', [namespace]), /DURABLE_BLOB_INTEGRITY_FAILED/);
  } finally { await adapter.shutdown(new AbortController().signal); fs.rmSync(root, { recursive: true, force: true }); }
});
