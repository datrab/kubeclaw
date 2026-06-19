import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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

test('publishTaskOutcome stamps child-written output_file identity', () => {
  const discordCalls = [];
  const outputFile = path.join('.swarm', 'test-output', `session-${Date.now()}-${Math.random()}.json`);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify({
    artifact_type: 'buster_output',
    status: 'PASS',
    summary: 'fresh child pass',
    completed_at: '2026-06-19T13:00:00Z',
  }));

  try {
    const published = publishTaskOutcome({
      payload: {
        task_type: 'module_test',
        module_id: 'mod',
        project: 'project',
        run_id: 'run-current',
        attempt: 2,
        dispatch_id: 'dispatch-current',
        output_file: outputFile,
      },
      sessionData: testSessionData(),
      sessionResult: { terminal: true },
      elapsedSeconds: 12,
      timeoutSeconds: 60,
      moduleId: 'mod',
      project: 'project',
      commitHash: null,
      currentDiscordContext: (extra = {}) => extra,
      discord: (message, context) => discordCalls.push({ message, context }),
      logger: noopLogger(),
      dispatchIdForCompletion: 'dispatch-current',
    });
    const artifact = JSON.parse(fs.readFileSync(outputFile, 'utf8'));

    assert.equal(published.outcome, 'PASS');
    assert.equal(published.reason, 'output_file_pass');
    assert.equal(published.agentResult.repaired_identity, true);
    assert.equal(artifact.run_id, 'run-current');
    assert.equal(artifact.attempt, '2');
    assert.equal(artifact.dispatch_id, 'dispatch-current');
    assert.equal(artifact.completion_key, 'run-current:2:dispatch-current');
    assert.equal(discordCalls.length, 1);
    assert.match(discordCalls[0].message.title, /Session Complete/);
  } finally {
    fs.rmSync(outputFile, { force: true });
  }
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
