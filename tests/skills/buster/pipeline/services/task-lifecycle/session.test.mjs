import assert from 'node:assert/strict';
import test from 'node:test';

import {
  killTaskSession,
  monitorTaskSession,
  publishTaskOutcome,
} from '../../../../../../skills/buster/pipeline/services/task-lifecycle/session.ts';

function noopLogger() {
  return {
    info() {},
    error() {},
  };
}

function testSessionData() {
  return {
    childSessionKey: 'session-123',
    streamLogPath: '/tmp/session.log',
    runtime: 'acp',
    agentId: 'agent',
    label: 'dispatch-123',
  };
}

test('publishTaskOutcome normalizes monitor hard-timeout results', () => {
  const discordCalls = [];
  const sessionResult = {
    terminal: false,
    reason: 'session_timeout_kill_confirmed',
    detail: 'hard timeout reached after 60s; explicit termination confirmed as killed',
    termination: { confirmed: true, unconfirmed: false },
  };

  const published = publishTaskOutcome({
    payload: {
      task_type: 'module_test',
      module_id: 'mod',
      project: 'project',
      output_file: '.swarm/test-output/unused.json',
    },
    sessionData: {
      childSessionKey: 'session-123',
      streamLogPath: '/tmp/session.log',
      runtime: 'acp',
      label: 'dispatch-123',
    },
    sessionResult,
    elapsedSeconds: 60,
    timeoutSeconds: 60,
    moduleId: 'mod',
    project: 'project',
    commitHash: null,
    currentDiscordContext: (extra = {}) => extra,
    discord: (message, context) => discordCalls.push({ message, context }),
    logger: noopLogger(),
    dispatchIdForCompletion: 'dispatch-123',
  });

  assert.equal(published.outcome, 'TIMEOUT');
  assert.equal(published.reason, 'session_timeout_kill_confirmed');
  assert.equal(published.agentResult.detail, sessionResult.detail);
  assert.equal(published.agentResult.source, 'session_monitor');
  assert.equal(discordCalls.length, 1);
  assert.match(discordCalls[0].message.title, /Session Timeout/);
  assert.equal(discordCalls[0].context.session_key, 'session-123');
});

test('monitorTaskSession clears active session when termination after monitor error throws', async () => {
  const clearCalls = [];
  const errors = [];

  const result = await monitorTaskSession({
    sessionData: testSessionData(),
    payload: {},
    tctx: null,
    moduleId: 'mod',
    timeoutSeconds: 60,
    logger: {
      info() {},
      error(tag, msg, data) {
        errors.push({ tag, msg, data });
      },
    },
    testHooks: {
      async monitorSession() {
        throw new Error('monitor exploded');
      },
      async terminateSession() {
        throw new Error('termination exploded');
      },
      clearActiveSession(options) {
        clearCalls.push(options);
      },
    },
  });

  assert.equal(result.ok, false);
  assert.match(result.reason, /monitor_error: monitor exploded/);
  assert.deepEqual(clearCalls, [{ preserveFile: false }]);
  assert.equal(errors.some((entry) => entry.tag === 'SESSION' && /termination exploded/.test(entry.msg)), true);
});

test('killTaskSession clears active session when terminateSession throws', async () => {
  const clearCalls = [];
  const errors = [];

  await assert.rejects(
    () => killTaskSession({
      sessionData: testSessionData(),
      sessionResult: { terminal: false, reason: 'rate_limited' },
      elapsedSeconds: 12,
      moduleId: 'mod',
      tctx: null,
      logger: {
        info() {},
        error(tag, msg, data) {
          errors.push({ tag, msg, data });
        },
      },
      testHooks: {
        async terminateSession() {
          throw new Error('termination exploded');
        },
        clearActiveSession(options) {
          clearCalls.push(options);
        },
      },
    }),
    /termination exploded/,
  );

  assert.deepEqual(clearCalls, [{ preserveFile: false }]);
  assert.equal(errors.some((entry) => entry.tag === 'SESSION' && /termination exploded/.test(entry.msg)), true);
});
