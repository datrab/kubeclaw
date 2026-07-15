import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { GATE_OUTPUT_EVIDENCE_SOURCE } from '../../../../../../skills/nova/pipeline/services/status-store-read-models/common.ts';
import {
  projectGateCompletionState,
  projectGateSchedulerState,
} from '../../../../../../skills/nova/pipeline/services/status-store-read-models/gate-projection.ts';

function makeConfig() {
  const root = fs.mkdtempSync(path.join('/home', 'gate-projection-'));
  const swarmDir = path.join(root, '.swarm');
  fs.mkdirSync(swarmDir, { recursive: true });
  return {
    project: 'test-project',
    repo_root: root,
    paths: {
      swarm_dir: swarmDir,
    },
    _runId: 'run-test',
    run_id: 'run-test',
  };
}

test('projectGateSchedulerState preserves canonical failed gate output statuses', () => {
  for (const status of ['FAIL', 'FAIL', 'BLOCKED']) {
    const config = makeConfig();
    const gate = {
      type: 'buster',
      title: 'Buster Gate',
      output_file: `${status.toLowerCase()}-gate-output.json`,
    };
    const outputPath = path.join(config.paths.swarm_dir, gate.output_file);
    fs.writeFileSync(outputPath, JSON.stringify({ status }, null, 2));

    const projection = projectGateSchedulerState(config, 'buster', gate);

    assert.equal(projection.status, status);
    assert.equal(projection.completed, false);
    assert.equal(projection.completion_source, GATE_OUTPUT_EVIDENCE_SOURCE);
  }
});

test('projectGateCompletionState reports explicit invalid gate output status reasons', () => {
  const cases = [
    [{}, 'missing_gate_output_status', 'Gate output contract invalid: missing_gate_output_status'],
    [{ status: 'MAYBE' }, 'unsupported_gate_output_status', 'Gate output contract invalid: unsupported_gate_output_status'],
  ];

  for (const [payload, invalidReason, reason] of cases) {
    const config = makeConfig();
    const gate = {
      type: 'buster',
      title: 'Buster Gate',
      output_file: `${invalidReason}.json`,
    };
    const outputPath = path.join(config.paths.swarm_dir, gate.output_file);
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));

    const projection = projectGateCompletionState(config, 'buster', gate);

    assert.equal(projection.status, 'INVALID_OUTPUT');
    assert.equal(projection.outcome, 'invalid_contract');
    assert.equal(projection.data.invalid_reason, invalidReason);
    assert.equal(projection.data.reason, reason);
  }
});
