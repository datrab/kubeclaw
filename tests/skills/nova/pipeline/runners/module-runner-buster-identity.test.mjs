import assert from 'node:assert/strict';
import test from 'node:test';

import { STATUS } from '../../../../../skills/nova/pipeline/core/constants.ts';
import { shouldApplyRedisCompletionToStatus } from '../../../../../skills/nova/pipeline/services/completion-adjudicator.ts';
import { resolveExpectedCompletionSessionKey } from '../../../../../skills/nova/pipeline/runners/module-runner/buster-phase/identity.ts';

test('Buster Redis completion adjudication rejects mismatched Redis session key', () => {
  const status = {
    status: STATUS.TESTING,
    session_key: 'active-session',
  };
  const completionIdentity = {
    runId: 'run-1',
    attempt: 1,
    dispatchId: 'dispatch-1',
  };
  const redisEntry = {
    status: STATUS.PASS,
    run_id: 'run-1',
    attempt: 1,
    dispatch_id: 'dispatch-1',
    session_key: 'stale-session',
  };

  const expectedSessionKey = resolveExpectedCompletionSessionKey(
    status,
    completionIdentity,
    'worker-session',
  );
  const adjudication = shouldApplyRedisCompletionToStatus({
    moduleId: 'module-a',
    expectedStatuses: [STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED],
    expectedIdentity: {
      run_id: completionIdentity.runId,
      attempt: completionIdentity.attempt,
      dispatch_id: completionIdentity.dispatchId,
      session_key: expectedSessionKey,
    },
    redisEntry,
    status,
  });

  assert.equal(expectedSessionKey, 'active-session');
  assert.equal(adjudication.shouldApply, false);
  assert.deepEqual(
    adjudication.adjudication.authority_policy.active_dispatch.optional_mismatched_fields,
    ['session_key'],
  );
});
