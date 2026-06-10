import assert from 'node:assert/strict';
import test from 'node:test';

import { acpxCleanup } from '../../../../../skills/common/pipeline/agents/lifecycle.ts';

test('acpxCleanup aborts an in-flight ACP close when the caller signal aborts', async () => {
  const controller = new AbortController();
  let observedSignal = null;

  const cleanupPromise = acpxCleanup('agent:test', 'session:test', {
    signal: controller.signal,
    execFileAsync: async (_command, _args, options = {}) => {
      observedSignal = options.signal;
      await new Promise((resolve, reject) => {
        observedSignal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    },
  });

  controller.abort('termination_grace_expired');

  await assert.rejects(cleanupPromise, /aborted|termination_grace_expired/);
  assert.equal(observedSignal, controller.signal);
  assert.equal(observedSignal.aborted, true);
});

test('acpxCleanup aborts an in-flight ACP close when the budget signal aborts', async () => {
  const caller = new AbortController();
  const budget = new AbortController();
  let observedSignal = null;

  const cleanupPromise = acpxCleanup('agent:test', 'session:test', {
    signal: caller.signal,
    budget: { signal: budget.signal },
    execFileAsync: async (_command, _args, options = {}) => {
      observedSignal = options.signal;
      await new Promise((resolve, reject) => {
        observedSignal.addEventListener('abort', () => reject(new Error('budget aborted')), { once: true });
      });
    },
  });

  budget.abort('kill_session_budget_exhausted');

  await assert.rejects(cleanupPromise, /budget aborted|kill_session_budget_exhausted/);
  assert.notEqual(observedSignal, caller.signal);
  assert.notEqual(observedSignal, budget.signal);
  assert.equal(observedSignal.aborted, true);
  assert.equal(caller.signal.aborted, false);
});
