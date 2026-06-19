import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { GATE_OUTPUT_EVIDENCE_SOURCE } from '../../../../../../skills/nova/pipeline/services/status-store-read-models/common.ts';
import { projectGateSchedulerState } from '../../../../../../skills/nova/pipeline/services/status-store-read-models/gate-projection.ts';

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
    const output = {
      exists: true,
      isPass: false,
      isFail: true,
      status,
      invalid_contract: false,
      data: { status },
      path: path.join(config.paths.swarm_dir, gate.output_file),
    };

    const projection = projectGateSchedulerState(config, 'buster', gate, {
      readGateOutput: () => output,
      readGateCompletionEvidence: () => ({
        isPass: false,
        source: null,
        output,
      }),
    });

    assert.equal(projection.status, status);
    assert.equal(projection.completed, false);
    assert.equal(projection.completion_source, GATE_OUTPUT_EVIDENCE_SOURCE);
  }
});
