import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import { createBudget, isBudgetExhaustedError } from '../../../../skills/common/pipeline/timing.ts';

test('budget signal aborts when deadline passes without polling', async () => {
  const budget = createBudget({ timeoutMs: 10, label: 'test-budget' });

  await delay(30);

  assert.equal(budget.signal.aborted, true);
  assert.equal(isBudgetExhaustedError(budget.signal.reason), true);
  assert.equal(budget.signal.reason.reason, 'budget_exhausted');
});

test('authorized extension reschedules budget signal deadline', async () => {
  const budget = createBudget({ timeoutMs: 30, label: 'extended-budget' });

  budget.extend(60, { authorized: true, reason: 'test_extension' });
  await delay(45);

  assert.equal(budget.signal.aborted, false);

  await delay(60);

  assert.equal(budget.signal.aborted, true);
  assert.equal(isBudgetExhaustedError(budget.signal.reason), true);
});

test('budget removes upstream abort listener after deadline expiry', async () => {
  const upstream = new AbortController();
  const originalAddEventListener = upstream.signal.addEventListener.bind(upstream.signal);
  const originalRemoveEventListener = upstream.signal.removeEventListener.bind(upstream.signal);
  let abortListenerCount = 0;

  upstream.signal.addEventListener = (type, listener, options) => {
    if (type === 'abort') abortListenerCount += 1;
    return originalAddEventListener(type, listener, options);
  };
  upstream.signal.removeEventListener = (type, listener, options) => {
    if (type === 'abort') abortListenerCount -= 1;
    return originalRemoveEventListener(type, listener, options);
  };

  const budget = createBudget({ timeoutMs: 10, signal: upstream.signal });
  assert.equal(abortListenerCount, 1);

  await delay(30);

  assert.equal(budget.signal.aborted, true);
  assert.equal(abortListenerCount, 0);
});
