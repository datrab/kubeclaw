import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assertMatchingRequest, stableEffectId} from '../../../skills/nova/core/effects/identity.ts';
import {canonicalJson, portableJson, sha256Text} from '@kubeclaw/plugin-sdk';

// A design diagnostic against saved REAL registered-stage requests/receipts.
// Not a new Core recovery test and not an implemented reader repair.
const raw = fs.readFileSync(new URL('./run10-prism-reader-before.txt', import.meta.url), 'utf8');
const cases = raw.split('\n').filter((line) => line.startsWith('{"mixed":')).map((line) => JSON.parse(line));
assert.equal(cases.length, 2);
for (const sample of cases) {
  const prior = sample.artifactReadRequest.request;
  const response = sample.artifactReadReceipt.receipt.result;
  const expected = sample.artifactReference;
  assert.equal(prior.operation, 'get_json');
  assert.equal(prior.idempotencyKey, `run:prism-reader-${sample.mixed ? 'mixed' : 'fixed'}:design:1:1`);
  assertMatchingRequest(prior, prior);
  const bytesOperation = {...prior, operation: 'get_json_bytes', payload: {...prior.payload, reference: expected}};
  assert.notEqual(stableEffectId(bytesOperation), prior.effectId);
  assert.throws(() => assertMatchingRequest(prior, bytesOperation), /EFFECT_IDEMPOTENCY_CONFLICT/);
  const payloadOnly = {...prior, payload: {...prior.payload, reference: expected}};
  assert.equal(stableEffectId(payloadOnly), prior.effectId);
  assert.throws(() => assertMatchingRequest(prior, payloadOnly), /EFFECT_IDEMPOTENCY_CONFLICT/);
  assert.equal(expected.encoding, 'kubeclaw-json.utf16.v1');
  assert.equal(portableJson(response.artifact), portableJson(expected));
  const bytes = portableJson(response.value);
  assert.equal(bytes, sample.exactOriginalArtifactBytes);
  assert.equal(sha256Text(bytes), expected.digest);
  assert.equal(Buffer.byteLength(bytes), expected.sizeBytes);
  assert.equal(response.digest, expected.digest);
  assert.equal(response.sizeBytes, expected.sizeBytes);
  if (sample.mixed) assert.notEqual(sha256Text(canonicalJson(response.value)), expected.digest);
  console.log(JSON.stringify({mixed: sample.mixed, originalEffectId: prior.effectId,
    sameOperationAndPayload: 'matches original request', bytesOperation: 'EFFECT_IDEMPOTENCY_CONFLICT',
    referencePayloadOnly: 'EFFECT_IDEMPOTENCY_CONFLICT',
    existingCompletedReceiptPortableBytes: 'exact original CAS bytes/ref/digest/size',
    changedProductionFiles: 0, recoveryExecutionClaimed: false}));
}
