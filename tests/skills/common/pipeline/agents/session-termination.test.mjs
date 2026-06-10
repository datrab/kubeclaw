import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import { terminateSession } from '../../../../../skills/common/pipeline/agents/session-termination.ts';

test('terminateSession observes a successful kill that completes within graceMs', async () => {
  let forwardedOptions = null;
  const result = await terminateSession('session:test', {
    graceMs: 50,
    confirmPollMs: 1,
    killSession: async (_sessionKey, opts) => {
      forwardedOptions = opts;
      await delay(5);
      return {
        requested: true,
        confirmed: true,
        state: 'stopped',
        cleanupAttempted: false,
      };
    },
  });

  assert.equal(result.requested, true);
  assert.equal(result.confirmed, true);
  assert.equal(result.state, 'stopped');
  assert.equal(result.unconfirmed, false);
  assert.equal(forwardedOptions.confirmTimeoutMs, 50);
  assert.equal('killSession' in forwardedOptions, false);
});

test('terminateSession stops waiting when kill exceeds graceMs', async () => {
  const started = Date.now();
  const result = await terminateSession('session:test', {
    graceMs: 10,
    confirmPollMs: 1,
    killSession: async () => new Promise(() => {}),
  });

  assert.equal(result.requested, false);
  assert.equal(result.confirmed, false);
  assert.equal(result.unconfirmed, true);
  assert.equal(result.state, 'termination_grace_expired');
  assert.equal(result.graceMs, 10);
  assert.equal(Date.now() - started < 100, true);
});

test('terminateSession aborts the kill workflow when grace expires', async () => {
  let observedSignal = null;
  let abortObserved = false;
  let delayedSideEffectRan = false;

  const result = await terminateSession('session:test', {
    graceMs: 10,
    confirmPollMs: 1,
    killSession: async (_sessionKey, opts) => {
      observedSignal = opts.signal;
      const outcome = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve('timer'), 50);
        opts.signal.addEventListener('abort', () => {
          abortObserved = true;
          clearTimeout(timer);
          resolve('aborted');
        }, { once: true });
      });
      if (outcome === 'timer') delayedSideEffectRan = true;
      return {
        requested: true,
        confirmed: outcome === 'aborted',
        state: outcome === 'aborted' ? 'aborted' : 'stopped',
        cleanupAttempted: false,
      };
    },
  });

  await delay(60);

  assert.equal(result.state, 'termination_grace_expired');
  assert.equal(typeof observedSignal?.addEventListener, 'function');
  assert.equal(observedSignal.aborted, true);
  assert.equal(abortObserved, true);
  assert.equal(delayedSideEffectRan, false);
});
