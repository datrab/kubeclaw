// Real disk adapters and journal replay; no injected storage implementation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { activate } from '../../../skills/common/plugins/artifact-store/src/adapter.ts';
import { FileEffectJournal } from '../../../skills/nova/core/effects/journal.ts';
import { assertMatchingRequest, stableEffectId } from '../../../skills/nova/core/effects/identity.ts';
import { canonicalJson, sha256Text } from '../../../skills/common/plugin-runtime/sdk/src/values.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-json-consumers-'));
const attempt = { runId: 'run:test', stageId: 'stage:test', attemptId: 'attempt:test', attemptNumber: 1 };
const adapter = activate({ config: { artifactRoot: path.join(root, 'artifacts') } } as Parameters<typeof activate>[0]);
const signal = new AbortController().signal;
const request = {
  schemaVersion: 'effect-request.v1', requestId: 'request:test', effectId: '', idempotencyKey: 'effect:test', attempt,
  capability: 'artifacts.write', operation: 'put_json', resource: { type: 'artifact.object', canonicalId: 'artifact:test' },
  payload: { namespace: 'sdk.test', mediaType: 'application/json', value: { Z: 1, a: [null, true], 'é': 2 } },
};
// The confidential production entrypoint intentionally needs no lease/fence.
const invoke = (input: unknown) => adapter.invoke({ request: input, signal, confidential: true } as Parameters<typeof adapter.invoke>[0]);
try {
  await adapter.ready();
  const first = await invoke(request);
  const artifact = first.artifact as { digest: string; sizeBytes: number };
  const baselineBytes = '{"a":[null,true],"é":2,"Z":1}';
  assert.equal(canonicalJson(request.payload.value), baselineBytes);
  assert.equal(artifact.digest, sha256Text(baselineBytes));
  assert.equal(artifact.sizeBytes, Buffer.byteLength(canonicalJson(request.payload.value)));
  for (const [index, value] of [new Array(2), { x: undefined }, { x: NaN }].entries()) {
    const rejected = { ...request, idempotencyKey: `invalid:${index}`,
      resource: { ...request.resource, canonicalId: `artifact:invalid:${index}` } };
    await assert.rejects(invoke({ ...rejected, payload: { ...request.payload, value } }), /CANONICAL_JSON_/);
    await assert.rejects(invoke({ ...rejected, capability: 'artifacts.read', operation: 'get_latest_json',
      payload: { namespace: 'sdk.test' } }), /ARTIFACT_NOT_FOUND/);
  }
  const loaded = await invoke({ ...request, capability: 'artifacts.read', operation: 'get_json', payload: {
    namespace: 'sdk.test', digest: artifact.digest,
  } });
  assert.deepEqual(loaded.value, request.payload.value);
  const journalPath = path.join(root, 'effects.jsonl');
  const invocation = { ...request, payload: { x: null } };
  invocation.effectId = stableEffectId(invocation);
  const journal = new FileEffectJournal(journalPath);
  await journal.requested(invocation as Parameters<typeof journal.requested>[0]);
  const replayed = await new FileEffectJournal(journalPath).request(invocation.idempotencyKey);
  assertMatchingRequest(replayed, invocation);
  assert.throws(() => assertMatchingRequest(replayed, { ...invocation, payload: { x: undefined } }), /CANONICAL_JSON_/);
  assert.throws(() => assertMatchingRequest(replayed, { ...invocation, payload: {} }), /EFFECT_IDEMPOTENCY_CONFLICT/);
  console.log('Real ArtifactStore and FileEffectJournal replay JSON regressions passed');
} finally {
  await adapter.shutdown(signal);
  fs.rmSync(root, { recursive: true, force: true });
}
