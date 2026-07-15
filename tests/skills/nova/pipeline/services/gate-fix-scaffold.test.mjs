import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { gateActiveSessionPath } from '../../../../../skills/nova/pipeline/core/paths.ts';
import {
  finishGateForgeFixCycleScaffold,
  validateGateForgeFixSpawnContract,
} from '../../../../../skills/nova/pipeline/services/gate-fix-scaffold.ts';

function makeConfig() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-fix-scaffold-test-'));
  const swarmDir = path.join(root, '.swarm');
  fs.mkdirSync(swarmDir, { recursive: true });
  return {
    project: 'gate-fix-scaffold-test',
    repo_root: root,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(swarmDir, 'modules'),
    },
    _runId: 'run-test',
    run_id: 'run-test',
    locks: {
      gate_active_session: {
        stale_ms: 1000,
        timeout_ms: 1000,
      },
    },
  };
}

test('finishGateForgeFixCycleScaffold cleans up Forge session when polling throws', async () => {
  const config = makeConfig();
  const gateId = 'quality';
  const activeSessionPath = gateActiveSessionPath(config, gateId);
  fs.mkdirSync(path.dirname(activeSessionPath), { recursive: true });
  fs.writeFileSync(activeSessionPath, JSON.stringify({ gate_id: gateId, label: 'forge-gatefix-quality-1' }) + '\n');

  const killCalls = [];
  const deps = {
    pollForSessionEnd: async () => {
      throw new Error('gateway failed');
    },
    getTrackedAgent: () => null,
    killAgent: async (...args) => {
      killCalls.push(args);
      return true;
    },
  };

  await assert.rejects(
    () => finishGateForgeFixCycleScaffold({
      config,
      deps,
      gateId,
      gate: { type: 'buster' },
      cycle: 1,
      fixLabel: 'gatefix-quality-1',
      fixAcpLabel: 'forge-gatefix-quality-1',
      timeoutMinutes: 5,
      artifactLogLabel: 'Gate fix',
    }),
    /gateway failed/,
  );

  assert.deepEqual(killCalls, [[config, 'forge', 'gatefix-quality-1', false]]);
  assert.equal(fs.existsSync(activeSessionPath), false);
});

test('validateGateForgeFixSpawnContract rejects invalid review-fix spawn before Gateway', () => {
  const config = {
    agents: {
      forge: {
        dispatch: 'acp',
        acp_agent_id: 'codex',
      },
    },
  };

  assert.throws(
    () => validateGateForgeFixSpawnContract(config, {
      model: 'gpt-5.4/low',
      fixLabel: 'reviewfix-module review-1',
      fixAcpLabel: 'forge-reviewfix-module review-1',
      gateId: 'module-review',
      cycle: 1,
    }),
    /fixLabel is invalid/,
  );

  assert.doesNotThrow(() => validateGateForgeFixSpawnContract(config, {
    model: 'gpt-5.4/low',
    fixLabel: 'reviewfix-module-review-1',
    fixAcpLabel: 'forge-reviewfix-module-review-1',
    gateId: 'module-review',
    cycle: 1,
  }));
});
