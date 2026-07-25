import assert from 'node:assert/strict';
import test from 'node:test';
import {
  StructuredOperationError,
  errorCode,
  errorMessage,
  operationFailure,
  operationSuccess,
} from '../../../../skills/common/pipeline/operation-result.ts';

test('operation results preserve typed success values', () => {
  assert.deepEqual(operationSuccess({ id: 'task-1' }), {
    ok: true,
    value: { id: 'task-1' },
  });
});

test('structured failures separate reason code, classification, message, and diagnostics', () => {
  const error = new StructuredOperationError('REDIS_TIMEOUT', 'Redis did not answer', {
    kind: 'retryable',
    diagnostics: { stream: 'tasks' },
  });
  assert.deepEqual(operationFailure(error), {
    ok: false,
    code: 'REDIS_TIMEOUT',
    kind: 'retryable',
    message: 'Redis did not answer',
    diagnostics: { stream: 'tasks' },
  });
});

test('unknown errors receive explicit message and code normalization', () => {
  assert.equal(errorMessage('failed'), 'failed');
  assert.equal(errorMessage(new Error('broken')), 'broken');
  assert.equal(errorCode({ code: 'KNOWN' }, 'UNKNOWN'), 'KNOWN');
  assert.equal(errorCode({}, 'UNKNOWN'), 'UNKNOWN');
});
