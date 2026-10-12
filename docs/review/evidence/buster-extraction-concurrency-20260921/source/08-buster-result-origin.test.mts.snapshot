import assert from 'node:assert/strict';
import test from 'node:test';
import type { RemotePlanStatusV1 } from '@kubeclaw/pipeline-test-gate-contract';
import { assertPreparedResultOrigin } from '../../../skills/buster/engine/test-gates/preparation-result-origin.ts';

// This unit boundary consumes only the state; the store separately validates the full status contract.
const completed = { state: 'completed' } as RemotePlanStatusV1;
const accepted = { state: 'accepted' } as RemotePlanStatusV1;
const historical = { kind: 'historical', importId: 'a'.repeat(32),
  originalStoreDigest: `sha256:${'b'.repeat(64)}`, originalPayloadDigest: `sha256:${'c'.repeat(64)}` };

test('result origin preserves explicit completed provenance and pending absence', () => {
  assert.doesNotThrow(() => assertPreparedResultOrigin(historical, completed));
  assert.doesNotThrow(() => assertPreparedResultOrigin({ kind: 'v2' }, completed));
  assert.doesNotThrow(() => assertPreparedResultOrigin(null, accepted));
  assert.throws(() => assertPreparedResultOrigin(null, completed), /RESULT_ORIGIN_INVALID/);
  assert.throws(() => assertPreparedResultOrigin(historical, accepted), /RESULT_ORIGIN_INVALID/);
});

for (const field of ['importId', 'originalStoreDigest', 'originalPayloadDigest'] as const) {
  test(`historical result origin rejects coerced or malformed ${field}`, () => {
    for (const value of [[historical[field]], [], 42, null, true, {}, '', `${historical[field]}x`]) {
      assert.throws(() => assertPreparedResultOrigin({ ...historical, [field]: value }, completed), /RESULT_ORIGIN_INVALID/);
    }
  });
}

test('result origin rejects alternate selectors and extra keys', () => {
  for (const value of [[], { kind: 'legacy' }, { kind: 'v2', fallback: true }, { ...historical, path: '/tmp/foreign' }]) {
    assert.throws(() => assertPreparedResultOrigin(value, completed), /RESULT_ORIGIN_INVALID/);
  }
});
