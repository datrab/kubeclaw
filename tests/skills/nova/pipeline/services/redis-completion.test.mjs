import test from 'node:test';
import assert from 'node:assert/strict';

import {
  scanLatestCompletionFromTail,
  selectLatestCompletion,
} from '../../../../../skills/nova/pipeline/services/redis-completion.ts';

const identity = Object.freeze({
  run_id: 'run-1',
  attempt: '1',
  dispatch_id: 'dispatch-1',
});

function completion(overrides = {}) {
  return {
    schema_version: 'v1',
    type: 'completion',
    stream_role: 'completion',
    project: 'project-a',
    target_kind: 'module',
    target_id: 'module-a',
    module: 'module-a',
    status: 'PASS',
    outcome: 'PASS',
    source: 'buster-pipeline',
    timestamp: '2026-06-03T00:00:00.000Z',
    ...identity,
    ...overrides,
  };
}

function streamEntry(id, entry) {
  return [id, Object.entries(entry).flat()];
}

test('selectLatestCompletion ignores malformed non-current completion sources', () => {
  const selected = selectLatestCompletion([
    streamEntry('1-0', completion()),
    streamEntry('2-0', completion({ status: 'NOPE', source: 'agent' })),
  ], 'module-a', identity);

  assert.equal(selected?._id, '1-0');
  assert.equal(selected?.source, 'buster-pipeline');
  assert.equal(selected?.status, 'PASS');
  assert.equal(selected?.ignored_completion_count, '1');
  assert.equal(selected?.ignored_completion_sources, 'agent');
});

test('scanLatestCompletionFromTail ignores malformed non-current completion sources', async () => {
  const redis = {
    async xrevrange() {
      return [
        streamEntry('2-0', completion({ status: 'NOPE', source: 'agent' })),
        streamEntry('1-0', completion()),
      ];
    },
  };

  const result = await scanLatestCompletionFromTail(redis, 'stream', 'module-a', identity);

  assert.equal(result.match?._id, '1-0');
  assert.equal(result.match?.source, 'buster-pipeline');
  assert.equal(result.match?.status, 'PASS');
  assert.equal(result.match?.ignored_completion_count, '1');
  assert.equal(result.match?.ignored_completion_sources, 'agent');
  assert.equal(result.conflict, null);
});
