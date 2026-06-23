#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';

import { buildBusterPayload } from '../../../skills/nova/pipeline/agents/orchestration.ts';
import {
  assertRedisTaskEntry,
  buildRedisTaskStreamEntry,
} from '../../../skills/common/pipeline/services/redis-message-contract.ts';
import { validateBusterTaskPayload } from '../../../skills/buster/pipeline/services/task-validation.ts';

const repoRoot = process.cwd();
const swarmDir = path.join(repoRoot, '.swarm');
const moduleId = '01-contract';
const gateId = 'final-buster';
const runId = 'run-contract-envelope';
const attempt = 2;
const dispatchId = 'dispatch-contract-envelope';
const gateDispatchId = 'dispatch-gate-contract-envelope';

const config = {
  project: 'contract-envelope',
  repo_root: repoRoot,
  run_id: runId,
  _runId: runId,
  _runStats: {},
  default_timeout_minutes: 30,
  acp_monitor: { enabled: false },
  rate_limit: {
    cooldown_hours: 1,
    max_pauses_per_module: 0,
  },
  buster: {
    suite_timeout_ms: 300000,
  },
  paths: {
    swarm_dir: swarmDir,
    modules_dir: path.join(swarmDir, 'modules'),
  },
};

const progress = {
  modules: {
    [moduleId]: {
      dir: moduleId,
      title: 'Contract Envelope',
      timeout_minutes: 12,
      test_suites: ['build', 'unit'],
      test_config: {
        suite_timeout_ms: 120000,
        unit: {
          test_cmd: ['npm', 'test'],
        },
      },
      capabilities: ['container_runtime'],
    },
  },
  gates: {
    [gateId]: {
      title: 'Final Buster',
      timeout_minutes: 20,
      test_suites: ['manifest'],
      test_config: {
        suite_timeout_ms: 180000,
        manifest: {
          deployment_yaml: 'k8s/app.yaml',
        },
      },
      capabilities: ['kubernetes_api'],
      output_file: 'buster-test/final-buster-output.json',
      instructions_file: 'buster-test/FINAL-BUSTER.md',
    },
  },
};

const status = {
  forge_commit_hash: 'abcdef1234567890abcdef1234567890abcdef12',
};

const payload = buildBusterPayload(
  config,
  progress,
  moduleId,
  'module_test',
  'Run the module Buster contract test.',
  status,
  {
    attempt,
    dispatch_id: dispatchId,
    model: 'gpt-5-codex',
    model_source: 'project_default',
    thinking: 'high',
    thinking_source: 'project_default',
    thinking_supported: true,
    reasoning_level: 'high',
  },
);

assert.equal(payload.task_type, 'module_test');
assert.equal(payload.run_id, runId);
assert.equal(payload.attempt, attempt);
assert.equal(payload.dispatch_id, dispatchId);
assert.equal(payload.commit_hash, status.forge_commit_hash);
assert.equal(payload.timeout_seconds, 12 * 60);
assert.equal(payload.session.timeout_seconds, payload.timeout_seconds);
assert.equal(payload.session.runtime, 'subagent');
assert.equal(payload.session.agentId, 'codex');
assert.equal(payload.model_source, 'project_default');
assert.equal(payload.thinking_source, 'project_default');
assert.equal(payload.thinking_supported, true);
assert.equal(payload.reasoning_level, 'high');
assert.equal(payload.session.thinking_source, 'project_default');
assert.equal(payload.session.reasoning_level, 'high');
assert.equal(payload.test_config.suite_timeout_ms, 120000);
assert.deepEqual(payload.suites, ['build', 'unit']);

const entry = buildRedisTaskStreamEntry({
  type: 'module_test',
  sender: 'nova',
  source: 'nova',
  payload,
  iteration: attempt,
  timestamp: '2026-06-16T00:00:00.000Z',
});

assertRedisTaskEntry(entry, { requireStreamId: false });
const consumedPayload = JSON.parse(entry.payload);
assert.deepEqual(consumedPayload, payload);

const identity = validateBusterTaskPayload(consumedPayload);
assert.deepEqual(identity, {
  taskType: 'module_test',
  moduleId,
  gateId: null,
  project: 'contract-envelope',
  runId,
  attempt,
  dispatchId,
  completionStream: payload.completion_stream,
  commitHash: status.forge_commit_hash,
  stageId: 'worker:module_buster',
  workerType: 'module_buster',
  timeoutSeconds: 720,
  suites: ['build', 'unit'],
  capabilities: ['container_runtime'],
  suiteTimeoutMs: 120000,
});

for (const field of ['timeout_seconds', 'completion_stream', 'commit_hash']) {
  assert.throws(
    () => validateBusterTaskPayload({ ...consumedPayload, [field]: undefined }),
    (error) => error?.code === 'BUSTER_TASK_MALFORMED'
      && error?.missing_fields?.includes(field),
    `Buster consumer must reject Nova payload when ${field} is missing`,
  );
}

for (const sessionField of ['runtime', 'agentId']) {
  assert.throws(
    () => validateBusterTaskPayload({
      ...consumedPayload,
      session: { ...consumedPayload.session, [sessionField]: undefined },
    }),
    (error) => error?.code === 'BUSTER_TASK_MALFORMED'
      && error?.missing_fields?.includes(`session.${sessionField}`),
    `Buster consumer must reject Nova payload when session.${sessionField} is missing`,
  );
}

assert.throws(
  () => validateBusterTaskPayload({
    ...consumedPayload,
    test_config: { ...consumedPayload.test_config, suite_timeout_ms: undefined },
  }),
  (error) => error?.code === 'BUSTER_TASK_MALFORMED'
    && error?.missing_fields?.includes('test_config.suite_timeout_ms'),
  'Buster consumer must reject Nova payload when test_config.suite_timeout_ms is missing',
);

const gatePayload = buildBusterPayload(
  config,
  progress,
  gateId,
  'gate_test',
  'Run the final Buster contract test.',
  status,
  {
    attempt,
    dispatch_id: gateDispatchId,
    model: 'gpt-5-codex',
    model_source: 'project_default',
    thinking: 'high',
    thinking_source: 'project_default',
    thinking_supported: true,
    reasoning_level: 'high',
    gate: progress.gates[gateId],
  },
);

assert.equal(gatePayload.task_type, 'gate_test');
assert.equal(gatePayload.gate_id, gateId);
assert.equal(gatePayload.run_id, runId);
assert.equal(gatePayload.attempt, attempt);
assert.equal(gatePayload.dispatch_id, gateDispatchId);
assert.equal(gatePayload.timeout_seconds, 20 * 60);
assert.equal(gatePayload.session.timeout_seconds, gatePayload.timeout_seconds);
assert.equal(gatePayload.session.runtime, 'subagent');
assert.equal(gatePayload.session.agentId, 'codex');
assert.equal(gatePayload.model_source, 'project_default');
assert.equal(gatePayload.thinking_source, 'project_default');
assert.equal(gatePayload.thinking_supported, true);
assert.equal(gatePayload.reasoning_level, 'high');
assert.equal(gatePayload.session.thinking_source, 'project_default');
assert.equal(gatePayload.session.reasoning_level, 'high');
assert.equal(gatePayload.test_config.suite_timeout_ms, 180000);
assert.deepEqual(gatePayload.suites, ['manifest']);

const gateEntry = buildRedisTaskStreamEntry({
  type: 'gate_test',
  sender: 'nova',
  source: 'nova',
  payload: gatePayload,
  iteration: attempt,
  timestamp: '2026-06-16T00:00:00.000Z',
});

assertRedisTaskEntry(gateEntry, { requireStreamId: false });
const consumedGatePayload = JSON.parse(gateEntry.payload);
assert.deepEqual(consumedGatePayload, gatePayload);

const gateIdentity = validateBusterTaskPayload(consumedGatePayload);
assert.deepEqual(gateIdentity, {
  taskType: 'gate_test',
  moduleId: gateId,
  gateId,
  project: 'contract-envelope',
  runId,
  attempt,
  dispatchId: gateDispatchId,
  completionStream: gatePayload.completion_stream,
  commitHash: status.forge_commit_hash,
  stageId: 'gate:buster',
  workerType: null,
  timeoutSeconds: 1200,
  suites: ['manifest'],
  capabilities: ['kubernetes_api'],
  suiteTimeoutMs: 180000,
});

console.log(JSON.stringify({
  ok: true,
  contract: 'nova-buster-task-envelope',
  run_id: runId,
  module_id: moduleId,
  gate_id: gateId,
  attempt,
  dispatch_id: dispatchId,
  gate_dispatch_id: gateDispatchId,
}, null, 2));
