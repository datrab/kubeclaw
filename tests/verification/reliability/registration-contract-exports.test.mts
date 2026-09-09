import { sha256Bytes, sha256Text } from '@kubeclaw/plugin-sdk';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalJson } from '@kubeclaw/pipeline-observability-contract/canonical-json';
import { canonicalJson as legacyCanonical, contentDigest } from '@kubeclaw/pipeline-observability-contract';
import { parseGateDecision } from '@kubeclaw/pipeline-test-gate-contract/gate-decision';
import { parseGateDecision as legacyDecision, remotePlanDigest } from '@kubeclaw/pipeline-test-gate-contract';

test('narrow exports retain original API identity and canonical digest bytes', () => {
  assert.equal(canonicalJson, legacyCanonical);
  assert.equal(parseGateDecision, legacyDecision);
  const value = { 'é': [-0, true, null, '😀'], z: 1e21, a: { b: 'line\n', A: 0 } };
  // Recorded against the unchanged original checkout before extraction.
  assert.equal(canonicalJson(value), '{"a":{"A":0,"b":"line\\n"},"z":1e+21,"é":[0,true,null,"😀"]}');
  const expected = 'sha256:6e56cbb2475a6f24df4aab526efbc5c15d81c0d62202efe981f227cca7339011';
  assert.equal(remotePlanDigest(value), expected);
  assert.equal(contentDigest(value), expected);
  for (const [value, error] of [[NaN, 'INVALID_NUMBER'], ['\ud800', 'INVALID_UNICODE'], [new Array(1), 'INVALID_ARRAY'], [new Date(0), 'INVALID_OBJECT'], [undefined, 'INVALID_TYPE']] as const) {
    assert.throws(() => canonicalJson(value), new RegExp(error));
  }
});

test('SDK byte digest hashes exact buffer views and preserves text digests', () => {
  const expected = 'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  const bytes = new Uint8Array([0, 97, 98, 99, 255]);
  assert.equal(sha256Bytes(bytes.subarray(1, 4)), expected);
  assert.equal(sha256Bytes(Buffer.from(bytes).subarray(1, 4)), expected);
  assert.equal(sha256Text('abc'), expected);
  assert.equal(sha256Bytes(new Uint8Array()), 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});
