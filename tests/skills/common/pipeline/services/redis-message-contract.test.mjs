import assert from 'node:assert/strict';
import test from 'node:test';

import { validateRedisCompletionEntry } from '../../../../../skills/common/pipeline/services/redis-message-contract.ts';

function completionEntry(overrides = {}) {
  return {
    _id: '1-0',
    schema_version: 'v1',
    type: 'completion',
    stream_role: 'completion',
    project: 'p',
    run_id: 'r',
    target_kind: 'module',
    target_id: 'm',
    source: 'agent',
    timestamp: '123',
    attempt: '1',
    dispatch_id: 'd',
    status: 'PASS',
    ...overrides,
  };
}

test('validateRedisCompletionEntry rejects non-JSON verdict strings', () => {
  const errors = validateRedisCompletionEntry(completionEntry({ verdict: 'not-json' }));

  assert.ok(errors.includes('verdict must be valid JSON'));
});

test('validateRedisCompletionEntry accepts JSON verdict strings', () => {
  const errors = validateRedisCompletionEntry(completionEntry({
    verdict: JSON.stringify({ status: 'PASS', findings: [] }),
  }));

  assert.deepEqual(errors, []);
});
