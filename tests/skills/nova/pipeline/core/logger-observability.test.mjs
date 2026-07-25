import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  initContextLogging,
  log,
  runWithActiveContext,
} from '../../../../../skills/nova/pipeline/core/logger.ts';

test('Nova runtime logs are durable records and canonical live events', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-runtime-log-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const emitted = [];
  const runLog = path.join(root, 'runs', 'run-1', 'pipeline.jsonl');
  const ctx = {
    runId: 'run-1',
    config: {
      project: 'project-1',
      _emitCanonicalEvidence: (...args) => emitted.push(args),
    },
    stats: { errors: [] },
    _logModule: 'module-1',
  };
  initContextLogging(ctx, { path: path.join(root, 'pipeline.jsonl') }, { path: runLog });

  runWithActiveContext(ctx, () => log('INFO', 'runtime proof', { producer_private: true }));
  await new Promise((resolve) => setImmediate(resolve));

  const record = JSON.parse(fs.readFileSync(path.join(root, 'runs', 'run-1', 'runtime-logs.jsonl'), 'utf8'));
  const schema = JSON.parse(fs.readFileSync('contracts/telemetry/v1/bundle/runtime_log.v1.schema.json', 'utf8'));
  for (const field of schema.required) assert.ok(field in record, `missing runtime log field ${field}`);
  assert.deepEqual(Object.keys(record).filter((field) => !(field in schema.properties)), []);
  assert.equal(record.project, 'project-1');
  assert.equal(record.run_id, 'run-1');
  assert.equal(record.work_id, 'module-1');
  assert.equal('producer_private' in record, false);

  assert.equal(emitted.length, 1);
  assert.equal(emitted[0][0], 'runtime.log');
  assert.equal(emitted[0][1].message, 'runtime proof');

  runWithActiveContext(ctx, () => log('INFO', 'runtime proof'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 2);
  assert.notEqual(emitted[0][2].sourceEventId, emitted[1][2].sourceEventId);
});
