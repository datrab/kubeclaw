import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitizeForJson } from '../../../../../skills/nova/pipeline/services/serialization.ts';

test('sanitizeForJson preserves repeated array references after traversal', () => {
  const shared = ['alpha', { value: 1 }];

  assert.deepEqual(sanitizeForJson({ a: shared, b: shared }), {
    a: ['alpha', { value: 1 }],
    b: ['alpha', { value: 1 }],
  });
});

test('sanitizeForJson still marks circular array references', () => {
  const circular = ['alpha'];
  circular.push(circular);

  assert.deepEqual(sanitizeForJson(circular), ['alpha', '[Circular]']);
});
