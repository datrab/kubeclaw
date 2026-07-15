import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { sendTaskCompletionSignal } from '../../../../../skills/buster/pipeline/services/task-lifecycle/completion-signal.ts';
import { resolveBusterOutputFilePath } from '../../../../../skills/buster/pipeline/services/pipeline-helpers.ts';
import {
  createTaskCompletionState,
  publishTaskCompletionWithArtifact,
} from '../../../../../skills/buster/pipeline/services/task-completion.ts';

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

test('Buster completion signal rejects stale output_file identity before Redis completion', async () => {
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
        publishTaskCompletionWithArtifact,
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
    assert.equal(artifact.run_id, 'run-stale');
    assert.equal(artifact.attempt, '1');
    assert.equal(artifact.dispatch_id, 'dispatch-stale');
    assert.equal(artifact.completion_key, 'run-stale:1:dispatch-stale');

    assert.equal(verified.length, 0);
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0][2].outcome, 'FAIL');
    assert.equal(emitted[0][2].reason, 'output_file_identity_mismatch:run_id,attempt,dispatch_id,completion_key');
    assert.equal(completionState.terminal, true);
    assert.equal(completionState.error, null);
  } finally {
    fs.rmSync(outputPath, { force: true });
  }
});

test('Buster completion signal writes supervisor-owned session failure over stale child output', async () => {
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
      agentResultForCompletion: {
        summary: 'Buster child session failed before canonical output',
        source: 'session_monitor',
      },
      sessionResultForCompletion: { terminal: true, failed: true },
      moduleId: payload.module_id,
      project: payload.project,
      outcome: 'FAIL',
      reason: 'agent_session_lifecycle_unstable',
      runId: payload.run_id,
      attempt: payload.attempt,
      dispatchIdForCompletion: payload.dispatch_id,
      sessionKeyForCompletion: 'session-current',
      logger: logger(),
      deps: {
        publishTaskCompletionWithArtifact,
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
    assert.equal(artifact.status, 'FAIL');
    assert.equal(artifact.reason, 'agent_session_lifecycle_unstable');
    assert.equal(artifact.run_id, payload.run_id);
    assert.equal(artifact.attempt, String(payload.attempt));
    assert.equal(artifact.dispatch_id, payload.dispatch_id);
    assert.equal(artifact.completion_key, `${payload.run_id}:${payload.attempt}:${payload.dispatch_id}`);
    assert.equal(verified.length, 1);
    assert.equal(emitted.length, 1);
    assert.equal(completionState.terminal, true);
    assert.equal(completionState.error, null);
  } finally {
    fs.rmSync(outputPath, { force: true });
  }
});

test('Buster completion signal writes deterministic suite PASS artifact without child spawn', async () => {
  const payload = makePayload();
  const outputPath = resolveBusterOutputFilePath(payload);
  const completionState = createTaskCompletionState();
  const emitted = [];
  const verified = [];

  try {
    await sendTaskCompletionSignal({
      payload,
      completionState,
      spawnedSubagent: false,
      suitesInfo: {
        suiteSummary: 'build passed; health passed; unit passed',
        suiteDetailSummary: 'build: PASS | health: PASS | unit: PASS',
        results: [
          { suite: 'build', status: 'PASS', metadata: { image: 'localhost/test:module' } },
          { suite: 'health', status: 'PASS', metadata: { url: 'http://127.0.0.1:43101/' } },
          { suite: 'unit', status: 'PASS', checks_total: 1, checks_passed: 1 },
        ],
      },
      agentResultForCompletion: null,
      sessionResultForCompletion: null,
      moduleId: payload.module_id,
      project: payload.project,
      outcome: 'PASS',
      reason: 'deterministic_suites_passed',
      runId: payload.run_id,
      attempt: payload.attempt,
      dispatchIdForCompletion: payload.dispatch_id,
      sessionKeyForCompletion: null,
      logger: logger(),
      deps: {
        publishTaskCompletionWithArtifact,
        verifyAndPush: async (...args) => {
          verified.push(args);
          return { action: 'noop', commit_hash: 'verify-sha' };
        },
        getRedisClient: () => ({}),
        emitTaskCompletion: async (...args) => {
          emitted.push(args);
          return { ok: true, stream: payload.completion_stream, id: '1-0' };
        },
      },
    });

    const artifact = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(artifact.status, 'PASS');
    assert.equal(artifact.reason, 'deterministic_suites_passed');
    assert.equal(artifact.run_id, payload.run_id);
    assert.equal(artifact.dispatch_id, payload.dispatch_id);
    assert.equal(artifact.suites.build.status, 'PASS');
    assert.equal(artifact.suites.health.status, 'PASS');
    assert.equal(artifact.suites.unit.status, 'PASS');
    assert.equal(Array.isArray(artifact.results), true);
    assert.equal(verified.length, 1);
    assert.equal(emitted.length, 1);
    assert.equal(completionState.terminal, true);
  } finally {
    fs.rmSync(outputPath, { force: true });
  }
});

test('Buster completion signal does not emit Redis when output_file verify fails', async () => {
  const payload = makePayload();
  const outputPath = resolveBusterOutputFilePath(payload);
  const completionState = createTaskCompletionState();
  const emitted = [];
  const errors = [];

  try {
    await sendTaskCompletionSignal({
      payload,
      completionState,
      spawnedSubagent: true,
      suitesInfo: { results: [], suiteSummary: '', suiteDetailSummary: '' },
      agentResultForCompletion: { summary: 'child did not write output_file', source: 'output_file' },
      sessionResultForCompletion: { terminal: true },
      moduleId: payload.module_id,
      project: payload.project,
      outcome: 'FAIL',
      reason: 'output_file_missing',
      runId: payload.run_id,
      attempt: payload.attempt,
      dispatchIdForCompletion: payload.dispatch_id,
      sessionKeyForCompletion: 'session-current',
      logger: {
        info() {},
        error(_tag, msg) {
          errors.push(msg);
        },
      },
      deps: {
        publishTaskCompletionWithArtifact,
        verifyAndPush: async () => ({ status: 'error', action: 'cleanup_failed', error: 'scope check failed' }),
        getRedisClient: () => ({}),
        emitTaskCompletion: async (...args) => {
          emitted.push(args);
          return { ok: true, stream: payload.completion_stream, id: '1-0' };
        },
      },
    });

    const artifact = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(artifact.status, 'FAIL');
    assert.equal(artifact.reason, 'output_file_missing');
    assert.equal(emitted.length, 0);
    assert.equal(completionState.terminal, false);
    assert.match(completionState.error, /scope check failed/);
    assert.equal(errors.some((msg) => /Failed to send completion signal/.test(msg)), true);
  } finally {
    fs.rmSync(outputPath, { force: true });
  }
});
