import assert from 'node:assert/strict';
import test from 'node:test';

import { createTrackedSummarySessionCleanup } from '../../../../../skills/nova/pipeline/services/summary-session-cleanup.ts';

test('tracked summary cleanup retries failed termination without duplicating untrack', async () => {
  const terminated = [];
  const untracked = [];
  const cleanup = createTrackedSummarySessionCleanup({
    terminateSession: async (sessionKey) => {
      terminated.push(sessionKey);
      if (terminated.length === 1) throw new Error('transient gateway failure');
      return {
        sessionKey,
        requested: true,
        confirmed: true,
        unconfirmed: false,
        terminal: true,
        state: 'terminated',
        cleanupAttempted: true,
        cleanupConfirmed: true,
        cleanupError: null,
        graceMs: 0,
      };
    },
    untrackAgent: (trackingKey) => {
      untracked.push(trackingKey);
    },
  }, {
    sessionKey: 'session-1',
    trackingKey: 'tracking-1',
  }, {
    summaryType: 'test-summary',
  });

  const first = await cleanup('post-poll');
  assert.equal(first.termination_error, 'transient gateway failure');
  assert.deepEqual(terminated, ['session-1']);
  assert.deepEqual(untracked, ['tracking-1']);

  const second = await cleanup('finally');
  assert.equal(second.termination_error, null);
  assert.equal(second.termination?.confirmed, true);
  assert.deepEqual(terminated, ['session-1', 'session-1']);
  assert.deepEqual(untracked, ['tracking-1']);

  const third = await cleanup('final-check');
  assert.deepEqual(third, { cleaned: false, skipped: 'already_cleaned', reason: 'final-check' });
});
