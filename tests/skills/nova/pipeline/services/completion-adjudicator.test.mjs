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

test('redis terminal for active dispatch is a phase transition, not drift, while local phase is non-terminal', () => {
  const completion = adjudicateCompletionEvidence({
    targetKind: 'module',
    targetId: 'module-a',
    expectedStatuses,
    expectedIdentity: { run_id: 'run-1', attempt: 1, dispatch_id: 'dispatch-1' },
    redisEntry: {
      status: STATUS.PASS,
      run_id: 'run-1',
      attempt: 1,
      dispatch_id: 'dispatch-1',
      source: 'buster-pipeline',
    },
    status: {
      status: STATUS.READY_FOR_TESTING,
      current_phase: 'buster',
      _source: 'local_lifecycle',
    },
    statusSource: 'local_lifecycle',
    preferRedis: true,
  });

  assert.equal(completion.authority_source, 'redis');
  assert.equal(completion.authority_policy.code, 'redis_terminal_confirmed_by_active_dispatch');
  assert.equal(completion.drift_detected, false);
  assert.deepEqual(completion.drift, []);
});

test('redis terminal still reports drift when it conflicts with same-phase terminal lifecycle', () => {
  const completion = adjudicateCompletionEvidence({
    targetKind: 'module',
    targetId: 'module-a',
    expectedStatuses,
    expectedIdentity: { run_id: 'run-1', attempt: 1, dispatch_id: 'dispatch-1' },
    redisEntry: {
      status: STATUS.PASS,
      run_id: 'run-1',
      attempt: 1,
      dispatch_id: 'dispatch-1',
      source: 'buster-pipeline',
    },
    status: {
      status: STATUS.FAIL,
      current_phase: 'buster',
      _source: 'local_lifecycle',
    },
    statusSource: 'local_lifecycle',
    preferRedis: true,
  });

  assert.equal(completion.authority_source, 'local_lifecycle');
  assert.equal(completion.completion_conflict, true);
  assert.equal(completion.drift_detected, true);
  assert.equal(completion.drift[0].code, 'redis_terminal_conflicts_with_terminal_status');
});
