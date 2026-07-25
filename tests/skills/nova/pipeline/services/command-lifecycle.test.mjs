import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  consumeCommandOnce,
  processCommand,
  validateCommand,
} from '../../../../../skills/nova/pipeline/services/command-lifecycle.ts';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'command-lifecycle-'));
  const config = {
    project: 'example',
    run_id: 'run-1',
    _runId: 'run-1',
    paths: { swarm_dir: path.join(root, '.swarm') },
    control: { enabled: true },
  };
  const command = {
    schema_version: 'pipeline_command_request.v1',
    command_id: 'command-1',
    command_type: 'pipeline.pause',
    project: 'example',
    run_id: 'run-1',
    actor: 'operator',
    capability: 'pipeline.control',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    reason: 'maintenance window',
    target: { run_id: 'run-1' },
    expected_lifecycle_version: 7,
  };
  const context = {
    project: 'example',
    run_id: 'run-1',
    capabilities: ['pipeline.control'],
    lifecycle_version: 7,
    pipeline_state: 'running',
  };
  return { root, config, command, context };
}

test('command validation requires rationale and a legal authority state', () => {
  const { command, context } = fixture();
  assert.equal(validateCommand({ ...command, reason: '' }, context).errors.includes('RATIONALE_MISSING'), true);
  assert.equal(validateCommand(command, { ...context, pipeline_state: 'paused' }).errors.includes('COMMAND_ILLEGAL_STATE'), true);
});

test('handler failure writes a terminal completed evidence record', async () => {
  const { root, config, command, context } = fixture();
  const terminal = await processCommand(config, command, context, {
    'pipeline.pause': async () => { throw Object.assign(new Error('pause failed'), { code: 'PAUSE_FAILED' }); },
  });
  assert.equal(terminal.state, 'completed');
  assert.equal(terminal.reason_code, 'COMMAND_HANDLER_FAILED');
  assert.equal(terminal.result.status, 'failed');
  const records = fs.readFileSync(path.join(root, '.swarm/logs/pipeline/runs/run-1/commands.jsonl'), 'utf8')
    .trim().split('\n').map(JSON.parse);
  assert.deepEqual(records.map(record => record.state), ['requested', 'accepted', 'completed']);
});

test('consumer reclaims and closes a pending command after restart', async () => {
  const { config, command, context } = fixture();
  const previous = process.env.PIPELINE_CONTROL_ENABLED;
  process.env.PIPELINE_CONTROL_ENABLED = '1';
  let acknowledged = null;
  let invoked = 0;
  const redis = {
    async xgroup() {},
    async xautoclaim() { return ['0-0', [['42-0', ['data', JSON.stringify(command)]]]]; },
    async xreadgroup() { throw new Error('fresh read must not run after reclaim'); },
    async xack(_stream, _group, id) { acknowledged = id; },
  };
  try {
    const result = await consumeCommandOnce(config, {
      redis,
      context,
      handlers: { 'pipeline.pause': async () => { invoked += 1; } },
      reclaim_idle_ms: 1,
    });
    assert.equal(result.processed, 1);
    assert.equal(invoked, 1);
    assert.equal(acknowledged, '42-0');
  } finally {
    if (previous === undefined) delete process.env.PIPELINE_CONTROL_ENABLED;
    else process.env.PIPELINE_CONTROL_ENABLED = previous;
  }
});
