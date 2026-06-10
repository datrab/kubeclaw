import assert from 'node:assert/strict';
import test from 'node:test';

import { assertRedisTaskEntry } from '../../../../../skills/common/pipeline/services/redis-message-contract.ts';
import { decodeRedisStreamEntry } from '../../../../../skills/common/pipeline/services/task-transport-contract.ts';

test('decoded Redis stream task entries satisfy the Redis task validator', () => {
  const decoded = decodeRedisStreamEntry([
    '1-0',
    [
      'schema_version', 'v1',
      'type', 'module_test',
      'stream_role', 'task',
      'project', 'p',
      'run_id', 'r',
      'target_kind', 'module',
      'target_id', 'm',
      'module', 'm',
      'attempt', '1',
      'dispatch_id', 'd',
      'source', 's',
      'sender', 's',
      'payload', '{}',
      'iteration', '1',
      'timestamp', '123',
    ],
  ]);

  assert.equal(decoded?._id, '1-0');
  assert.equal(assertRedisTaskEntry(decoded), decoded);
});
