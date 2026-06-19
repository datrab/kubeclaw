import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { sendTaskCompletionSignal } from '../../../../../skills/buster/pipeline/services/task-lifecycle/completion-signal.ts';
import { buildTaskCompletionRecord } from '../../../../../skills/buster/pipeline/services/task-completion.ts';
import { resolveBusterOutputFilePath } from '../../../../../skills/buster/pipeline/services/pipeline-helpers.ts';
import { createTaskCompletionState } from '../../../../../skills/buster/pipeline/services/task-completion.ts';

function makePayload(overrides = {}) {
  return {
    task_type: 'module_test',
    worker_type: 'module_buster',
    module_id: '01-forge',
    project: 'pipeline-smoke-landing',
    run_id: 'run-current',
    attempt: 2,
    dispatch_id: 'buster-module-01-forge-1781879465321-1',
    commit_hash: 'abc123',
    output_file: path.join('.swarm', 'test-output', `buster-signal-${Date.now()}-${Math.random()}.json`),
    completion_stream: 'swarm:completion:pipeline-smoke-landing:run-current',
    stage_id: 'worker:module_buster',
    timeout_seconds: 120,
    session: {
      runtime: 'subagent',
      model: 'gpt-test',
      agentId: 'buster',
      cwd: process.cwd(),
      label: 'buster-module-01-forge-1781879465321-1',
    },
    suites: ['build'],
    test_config: { suite_timeout_ms: 1000 },
    ...overrides,
  };
}

function logger() {
  return {
    info() {},
    error() {},
  };
}

test('Buster completion signal stamps current pipeline identity before Redis completion', async () => {
  const payload = makePayload();
  const outputPath = resolveBusterOutputFilePath(payload);
  const completionState = createTaskCompletionState();
  const redisClient = {};
  const emitted = [];
  const verified = [];

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({
    artifact_type: 'buster_output',
    run_id: 'run-stale',
    attempt: '1',
    dispatch_id: 'dispatch-stale',
    completion_key: 'run-stale:1:dispatch-stale',
    status: 'PASS',
    summary: 'child wrote a stale-looking PASS',
    findings: [],
  }, null, 2));

  try {
    await sendTaskCompletionSignal({
      payload,
      completionState,
      spawnedSubagent: true,
      suitesInfo: { results: [], suiteSummary: '', suiteDetailSummary: '' },
      agentResultForCompletion: { summary: 'child wrote a stale-looking PASS', source: 'output_file' },
      sessionResultForCompletion: { terminal: true },
      moduleId: payload.module_id,
      project: payload.project,
      outcome: 'PASS',
      reason: 'output_file_pass',
      runId: payload.run_id,
      attempt: payload.attempt,
      dispatchIdForCompletion: payload.dispatch_id,
      sessionKeyForCompletion: 'session-current',
      logger: logger(),
      deps: {
        verifyAndPush: async (...args) => {
          verified.push(args);
          return { action: 'noop', commit_hash: 'verify-sha' };
        },
        getRedisClient: () => redisClient,
        emitTaskCompletion: async (...args) => {
          emitted.push(args);
          return { ok: true, stream: payload.completion_stream, id: '1-0' };
        },
      },
    });

    const artifact = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(artifact.status, 'PASS');
    assert.equal(artifact.run_id, payload.run_id);
    assert.equal(artifact.attempt, String(payload.attempt));
    assert.equal(artifact.dispatch_id, payload.dispatch_id);
    assert.equal(artifact.completion_key, `${payload.run_id}:${payload.attempt}:${payload.dispatch_id}`);
    assert.equal(artifact.reason, 'output_file_identity_mismatch:run_id,attempt,dispatch_id,completion_key');

    assert.equal(verified.length, 1);
    assert.equal(verified[0][0], 'buster');
    assert.equal(verified[0][1], payload.project);

    assert.equal(emitted.length, 1);
    const [actualRedisClient, actualPayload, completionOpts] = emitted[0];
    assert.equal(actualRedisClient, redisClient);
    assert.equal(actualPayload, payload);
    assert.equal(completionOpts.runId, payload.run_id);
    assert.equal(completionOpts.attempt, payload.attempt);
    assert.equal(completionOpts.dispatchId, payload.dispatch_id);
    assert.equal(completionOpts.sessionKey, 'session-current');

    const completionRecord = buildTaskCompletionRecord(actualPayload, completionOpts);
    assert.equal(completionRecord.run_id, payload.run_id);
    assert.equal(completionRecord.attempt, String(payload.attempt));
    assert.equal(completionRecord.dispatch_id, payload.dispatch_id);
    assert.equal(completionRecord.session_key, 'session-current');
    assert.equal(completionRecord.completion_key, `${payload.run_id}:${payload.attempt}:${payload.dispatch_id}`);
    assert.equal(completionRecord.status, 'PASS');
    assert.equal(completionState.terminal, true);
    assert.equal(completionState.error, null);
  } finally {
    fs.rmSync(outputPath, { force: true });
  }
});
