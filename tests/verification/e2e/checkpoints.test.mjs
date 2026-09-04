import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CHECKPOINT_NAMES,
  CHECKPOINT_SCHEMA_VERSION,
  captureCheckpoint,
  checkpointBundlePath,
  checkpointCaptureNames,
  checkpointDefinition,
  checkpointHookContract,
  checkpointPlanForScenario,
  defaultCheckpointRoot,
  restoreCheckpointProjectSource,
  validateCheckpointBundle,
  validateCheckpointState,
} from './checkpoints.mjs';

function write(file, value = '') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
}

function appendEvent(file, entry) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify({ entry })}\n`);
}

function fixture({
  checkpoint = 'pre-forge',
  runId = 'run:v2-seed',
  projectName = 'checkpoint-project',
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-v2-checkpoint-'));
  const worktreePath = path.join(root, 'worktree');
  const projectSrc = path.join(worktreePath, 'Projects', projectName, 'src');
  const swarmDir = path.join(projectSrc, '.swarm');
  const artifactRoot = path.join(swarmDir, 'artifacts', 'v2');
  const runDir = path.join(swarmDir, 'v2-runtime', 'runs', runId.replaceAll(':', '_'));
  write(path.join(swarmDir, 'progress.json'), `${JSON.stringify({
    project: projectName,
    real_e2e: { scenario_id: 'success' },
  })}\n`);
  write(path.join(projectSrc, 'README.md'), `${projectName}:${runId}\n`);
  write(path.join(runDir, 'effects.jsonl'));
  const events = path.join(runDir, 'events.jsonl');
  appendEvent(events, { type: 'run.created', identity: { runId } });
  appendEvent(events, { type: 'stage.started', identity: { runId, stageId: 'architecture' } });
  appendEvent(events, {
    type: 'attempt.completed',
    identity: { runId, stageId: 'architecture' },
    payload: { outcome: 'passed' },
  });
  if (checkpoint === 'post-forge' || checkpoint === 'pre-module-buster') {
    appendEvent(events, { type: 'stage.started', identity: { runId, stageId: 'forge-01-nginx' } });
    appendEvent(events, {
      type: 'attempt.completed',
      identity: { runId, stageId: 'forge-01-nginx' },
      payload: { outcome: 'passed' },
    });
  }
  return {
    root,
    workspace: {
      runId,
      projectName,
      artifactRoot,
      worktreePath,
      projectSrc,
      swarmDir,
    },
  };
}

test('checkpoint inventory is entirely v2', () => {
  assert.equal(CHECKPOINT_SCHEMA_VERSION, 'real_e2e_checkpoint.v2');
  assert.equal(CHECKPOINT_NAMES.length, 13);
  assert.deepEqual(checkpointCaptureNames(), CHECKPOINT_NAMES.filter((name) => name !== 'fresh'));
  for (const checkpoint of CHECKPOINT_NAMES) {
    const definition = checkpointDefinition(checkpoint);
    const contract = checkpointHookContract(checkpoint);
    assert.deepEqual(Object.keys(definition).sort(), [
      'forbidden_v2_run_files',
      'name',
      'required_v2_run_files',
    ]);
    assert.deepEqual(Object.keys(contract.required_state), ['v2_run_files']);
    assert.deepEqual(Object.keys(contract.forbidden_state), ['v2_run_files']);
  }
});

test('fresh requires no canonical v2 run', () => {
  const fixtureRoot = fixture();
  try {
    fs.rmSync(path.join(fixtureRoot.workspace.swarmDir, 'v2-runtime'), { recursive: true, force: true });
    assert.equal(validateCheckpointState({
      checkpoint: 'fresh',
      swarmDir: fixtureRoot.workspace.swarmDir,
    }).ok, true);
  } finally {
    fs.rmSync(fixtureRoot.root, { recursive: true, force: true });
  }
});

test('pre-forge is derived from canonical v2 lifecycle events', () => {
  const fixtureRoot = fixture();
  try {
    const state = validateCheckpointState({
      checkpoint: 'pre-forge',
      swarmDir: fixtureRoot.workspace.swarmDir,
    });
    assert.equal(state.ok, true, JSON.stringify(state));
    appendEvent(
      path.join(fixtureRoot.workspace.swarmDir, 'v2-runtime', 'runs', 'run_v2-seed', 'events.jsonl'),
      { type: 'stage.started', identity: { runId: 'run:v2-seed', stageId: 'forge-01-nginx' } },
    );
    assert.equal(validateCheckpointState({
      checkpoint: 'pre-forge',
      swarmDir: fixtureRoot.workspace.swarmDir,
    }).ok, false);
  } finally {
    fs.rmSync(fixtureRoot.root, { recursive: true, force: true });
  }
});

test('checkpoint reads ignore only an actively written trailing journal fragment', () => {
  const fixtureRoot = fixture();
  try {
    const events = path.join(
      fixtureRoot.workspace.swarmDir,
      'v2-runtime',
      'runs',
      'run_v2-seed',
      'events.jsonl',
    );
    fs.appendFileSync(events, '{"entry":{"type":"effect.requested"');
    const state = validateCheckpointState({
      checkpoint: 'pre-forge',
      swarmDir: fixtureRoot.workspace.swarmDir,
    });
    assert.equal(state.ok, true, JSON.stringify(state));
  } finally {
    fs.rmSync(fixtureRoot.root, { recursive: true, force: true });
  }
});

test('capture and restore preserve only canonical v2 state and rewrite run identity', () => {
  const source = fixture();
  const target = fixture({ runId: 'run:v2-target', projectName: 'target-project' });
  try {
    const checkpointRoot = defaultCheckpointRoot(source.root);
    const captured = captureCheckpoint({
      checkpointRoot,
      checkpoint: 'pre-forge',
      workspace: source.workspace,
      seedId: 'v2-seed',
    });
    assert.equal(captured.manifest.schema_version, CHECKPOINT_SCHEMA_VERSION);
    assert.equal(validateCheckpointBundle({
      checkpointDir: captured.checkpoint_dir,
      checkpoint: 'pre-forge',
    }).ok, true);
    fs.rmSync(target.workspace.projectSrc, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(target.workspace.projectSrc), { recursive: true });
    const restored = restoreCheckpointProjectSource({
      checkpointDir: checkpointBundlePath({
        checkpointRoot,
        checkpoint: 'pre-forge',
        seedId: 'v2-seed',
      }),
      checkpoint: 'pre-forge',
      workspace: target.workspace,
    });
    assert.equal(restored.restored_run_id, 'run:v2-target');
    const restoredEvents = fs.readFileSync(
      path.join(target.workspace.swarmDir, 'v2-runtime', 'runs', 'run_v2-target', 'events.jsonl'),
      'utf8',
    );
    assert.equal(restoredEvents.includes('run:v2-seed'), false);
    assert.equal(restoredEvents.includes('run:v2-target'), true);
    assert.equal(validateCheckpointState({
      checkpoint: 'pre-forge',
      swarmDir: target.workspace.swarmDir,
    }).ok, true);
  } finally {
    fs.rmSync(source.root, { recursive: true, force: true });
    fs.rmSync(target.root, { recursive: true, force: true });
  }
});

test('checkpoint replacement preserves the previous bundle when publication fails', () => {
  const source = fixture();
  const checkpointRoot = defaultCheckpointRoot(source.root);
  const first = captureCheckpoint({
    checkpointRoot, checkpoint: 'pre-forge', workspace: source.workspace, seedId: 'replace-failure',
  });
  const marker = path.join(first.checkpoint_dir, 'previous-bundle-marker');
  write(marker, 'authoritative\n');
  const rename = fs.renameSync;
  let injected = false;
  fs.renameSync = (from, to) => {
    if (!injected && String(from).includes('.tmp-') && to === first.checkpoint_dir) {
      injected = true;
      const error = new Error('injected checkpoint publication failure');
      error.code = 'EIO';
      throw error;
    }
    return rename(from, to);
  };
  try {
    assert.throws(() => captureCheckpoint({
      checkpointRoot, checkpoint: 'pre-forge', workspace: source.workspace, seedId: 'replace-failure',
    }), /injected checkpoint publication failure/u);
    assert.equal(fs.readFileSync(marker, 'utf8'), 'authoritative\n');
  } finally {
    fs.renameSync = rename;
    fs.rmSync(source.root, { recursive: true, force: true });
  }
});

test('scenario plans expose v2 hook contracts', () => {
  const plan = checkpointPlanForScenario('buster-module-failure');
  assert.equal(plan.checkpoint, 'pre-module-buster');
  assert.equal(plan.hook_contract.required_lifecycle_state.passed_stages.includes('forge-01-nginx'), true);
  assert.deepEqual(plan.hook_contract.required_state, { v2_run_files: ['events.jsonl', 'effects.jsonl'] });
});
