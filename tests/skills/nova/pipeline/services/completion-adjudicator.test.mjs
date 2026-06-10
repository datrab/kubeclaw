import assert from 'node:assert/strict';
import test from 'node:test';

import { STATUS } from '../../../../../skills/nova/pipeline/core/constants.ts';
import { adjudicateCompletionEvidence } from '../../../../../skills/nova/pipeline/services/completion-adjudicator.ts';

const expectedStatuses = [STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED];

test('completion adjudication does not special-case status source names', () => {
  const completion = adjudicateCompletionEvidence({
    targetKind: 'module',
    targetId: 'module-a',
    expectedStatuses,
    redisEntry: {
      status: STATUS.RATE_LIMITED,
      outcome: 'RATE_LIMITED',
      run_id: 'run-1',
      attempt: 1,
      dispatch_id: 'dispatch-1',
    },
    status: {
      status: STATUS.PASS,
      _source: 'status.json',
    },
    statusSource: 'status.json',
    preferRedis: true,
  });

  assert.equal(completion.status_completion?.source, 'status.json');
  assert.equal(completion.authority_source, 'redis');
  assert.equal(completion.status, STATUS.RATE_LIMITED);
  assert.equal(completion.rateLimited, true);
});

test('completion adjudication keeps canonical local lifecycle evidence', () => {
  const completion = adjudicateCompletionEvidence({
    targetKind: 'module',
    targetId: 'module-a',
    expectedStatuses,
    redisEntry: {
      status: STATUS.RATE_LIMITED,
      outcome: 'RATE_LIMITED',
      run_id: 'run-1',
      attempt: 1,
      dispatch_id: 'dispatch-1',
    },
    status: {
      status: STATUS.PASS,
      _source: 'local_lifecycle',
    },
    statusSource: 'local_lifecycle',
    preferRedis: true,
  });

  assert.equal(completion.status_completion?.source, 'local_lifecycle');
  assert.equal(completion.authority_source, 'redis');
  assert.equal(completion.status, STATUS.RATE_LIMITED);
});
