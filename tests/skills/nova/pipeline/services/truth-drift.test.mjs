import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { projectGateTruthDrift } from '../../../../../skills/nova/pipeline/services/truth-drift.ts';

function makeConfig() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'truth-drift-'));
  const swarmDir = path.join(root, '.swarm');
  fs.mkdirSync(swarmDir, { recursive: true });
  return {
    project: 'test-project',
    repo_root: root,
    paths: {
      swarm_dir: swarmDir,
    },
    _runId: 'run-1',
    run_id: 'run-1',
  };
}

function cleanGateDeps() {
  const output = {
    exists: false,
    data: null,
    isPass: false,
    isFail: false,
    parse_error: false,
    invalid_contract: false,
    path: null,
    status: null,
  };
  return {
    readGateOutput: () => output,
    readGateCompletionEvidence: () => ({
      isPass: false,
      source: null,
      output,
    }),
  };
}

test('projectGateTruthDrift reports present Redis completion entries with missing status', () => {
  const malformedEntries = [
    { run_id: 'run-1', attempt: '1', dispatch_id: 'dispatch-1' },
    { run_id: 'run-1', attempt: '1', dispatch_id: 'dispatch-1', status: '' },
    { run_id: 'run-1', attempt: '1', dispatch_id: 'dispatch-1', status: null },
  ];

  for (const redisEntry of malformedEntries) {
    const result = projectGateTruthDrift(
      makeConfig(),
      'buster',
      { type: 'buster', title: 'Buster Gate', output_file: 'buster-output.json' },
      {
        redisEntry,
        expectedIdentity: {
          run_id: 'run-1',
          attempt: '1',
          dispatch_id: 'dispatch-1',
        },
        deps: cleanGateDeps(),
      },
    );

    assert.equal(result.scheduler_projection.scheduler_drift_detected, false);
    assert.equal(result.drift_detected, true);
    assert.ok(result.completion_adjudication);
    assert.ok(result.completion_adjudication.drift.some((entry) => (
      entry.code === 'redis_completion_missing_status'
    )));
    assert.ok(result.drift.some((entry) => (
      entry.source === 'completion_adjudicator'
        && entry.code === 'redis_completion_missing_status'
    )));
  }
});
