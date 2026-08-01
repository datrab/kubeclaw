import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  listFailureMatrixSuiteIds,
  listRealE2EScenarioIds,
  resolveRealE2EScenario,
} from './failure-scenarios.mts';
import {
  captureCheckpoint,
  CHECKPOINT_NAMES,
  restoreCheckpoint,
} from './checkpoints.mts';

const scenarios = listRealE2EScenarioIds();
assert.equal(scenarios.length, 46);
assert.equal(new Set(scenarios).size, scenarios.length);
assert.deepEqual(listFailureMatrixSuiteIds(), [
  'full-pipeline-smoke',
  'human-gates',
  'module-failure-retry',
  'infrastructure-observability',
  'final-deployment-buster',
  'git-authority',
  'module-graph',
  'crash-resume',
]);
for (const id of scenarios) {
  const scenario = resolveRealE2EScenario(id);
  assert.ok(CHECKPOINT_NAMES.includes(scenario.checkpoint as typeof CHECKPOINT_NAMES[number]));
  assert.ok(scenario.expectedEvidence);
  assert.ok(scenario.faultSurface);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-matrix-checkpoint-'));
try {
  const runRoot = path.join(root, 'run');
  fs.mkdirSync(runRoot);
  fs.writeFileSync(path.join(runRoot, 'graph-snapshot.json'), '{"digest":"graph:test"}\n');
  fs.writeFileSync(path.join(runRoot, 'registry-snapshot.json'), '{"packages":[]}\n');
  fs.writeFileSync(path.join(runRoot, 'events.jsonl'), '{"sequence":1}\n');
  const checkpointRoot = path.join(root, 'checkpoints');
  const manifest = captureCheckpoint({
    checkpointRoot,
    checkpoint: 'pre-forge',
    runRoot,
    sourceRunId: 'run:test',
  });
  assert.equal(manifest.checkpoint, 'pre-forge');
  const restored = path.join(root, 'restored');
  assert.equal(restoreCheckpoint({
    checkpointRoot,
    checkpoint: 'pre-forge',
    targetRunRoot: restored,
  }).sourceRunId, 'run:test');
  assert.equal(fs.readFileSync(path.join(restored, 'events.jsonl'), 'utf8'), '{"sequence":1}\n');
  fs.appendFileSync(path.join(checkpointRoot, 'pre-forge', 'events.jsonl'), 'tampered\n');
  assert.throws(
    () => restoreCheckpoint({
      checkpointRoot,
      checkpoint: 'pre-forge',
      targetRunRoot: path.join(root, 'tampered'),
    }),
    /CHECKPOINT_DIGEST_MISMATCH/,
  );
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, scenarios: scenarios.length, suites: listFailureMatrixSuiteIds().length }));
