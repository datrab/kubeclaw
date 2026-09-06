import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { activate } from '../../../skills/common/plugins/artifact-store/src/adapter.ts';
import { repairEvidence } from '../../../skills/nova/plugins/implementation-agent/src/repair-evidence.ts';
import type { AdapterActivationContext, AdapterInvocation, ArtifactRef, PluginInvocationContext } from '@kubeclaw/plugin-sdk';

test('repair handoff reads real durable findings and rejects corrupt, cross-run and oversized evidence', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-evidence-'));
  const adapter = activate({ config: { artifactRoot: root } } as AdapterActivationContext);
  const producer = { runId: 'repair:run', stageId: 'lint-module', attemptNumber: 1, attemptId: 'lint:1' };
  const content = { findings: [{ file: 'module/main.sh', line: 2, message: 'Quote the variable expansion.' }] };
  const operation = async (capability: string, request: any) => adapter.invoke({ confidential: true,
    signal: new AbortController().signal, request: { ...request, capability, attempt: producer, idempotencyKey: 'write:findings' },
  } as AdapterInvocation);
  try {
    await adapter.ready();
    const response = await operation('artifacts.write', { operation: 'put_json',
      resource: { type: 'artifact.object', canonicalId: 'lint:full:module' },
      payload: { namespace: 'kubeclaw.lint', mediaType: 'application/json', value: content } });
    const artifact = response.artifact as ArtifactRef;
    const request = { schemaVersion: 'repair-request.v1', requesterStageId: producer.stageId,
      targetStageId: 'implement-module', generation: 1, invalidatedStageIds: ['lint-module'],
      requesterResult: { schemaVersion: 'stage-result.v2', outcome: 'request_fix', artifacts: [artifact],
        reason: { code: 'lint.blocking_findings', message: 'Fix shell findings' } } };
    let reads = 0;
    const context = (repairRequest: unknown) => ({ contract: { lease: { attempt: { ...producer, stageId: 'implement-module' } },
      guidance: { repairRequest } }, invoke: async (capability: string, input: any) => {
        reads += 1; return operation(capability, input);
      } }) as unknown as PluginInvocationContext;
    const result = JSON.parse((await repairEvidence(context(request)))!);
    assert.deepEqual(result.evidence[0].content, content);
    assert.deepEqual(result.evidence[0].artifact, artifact);
    assert.deepEqual(result.request, request);
    assert.equal(reads, 1);
    for (const [ref, error] of [
      [{ ...artifact, producer: { ...producer, runId: 'other:run' } }, /REFERENCE_INVALID/],
      [{ ...artifact, sizeBytes: 1024 * 1024 }, /LIMIT_EXCEEDED/],
    ] as const) {
      await assert.rejects(() => repairEvidence(context({ ...request,
        requesterResult: { ...request.requesterResult, artifacts: [ref] } })), error);
      assert.equal(reads, 1, 'invalid evidence must be rejected before reading');
    }
    await assert.rejects(() => repairEvidence(context({ ...request,
      requesterResult: { ...request.requesterResult, artifacts: [{ ...artifact, sizeBytes: artifact.sizeBytes + 1 }] } })), /CONTENT_INVALID/);
    await assert.rejects(() => repairEvidence(context({ ...request, targetStageId: 'unrelated' })), /REQUEST_INVALID/);
    await assert.rejects(() => repairEvidence(context({ ...request,
      requesterResult: { ...request.requesterResult, artifacts: [artifact, artifact] } })), /REFERENCE_DUPLICATE/);
    assert.equal(await repairEvidence(context(undefined)), undefined);
  } finally { await adapter.shutdown(); fs.rmSync(root, { recursive: true, force: true }); }
});
