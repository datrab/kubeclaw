import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildLatestPointer,
  createPluginArtifactsApi,
  getPluginArtifactBundle,
  projectPipelineArtifactEvidence,
} from '../../../../../skills/nova/pipeline/services/artifact-bundle.ts';

function makeConfig() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-bundle-test-'));
  return {
    project: 'artifact-bundle-test',
    repo_root: root,
    paths: {
      swarm_dir: path.join(root, '.swarm'),
      modules_dir: path.join(root, '.swarm', 'modules'),
    },
    _runId: 'run-test',
    run_id: 'run-test',
  };
}

test('plugin artifact lane rejects dot-only identity segments', () => {
  const config = makeConfig();

  assert.throws(
    () => getPluginArtifactBundle(config, {
      moduleId: '..',
      hookFamily: 'worker.execute',
      stageId: 'forge',
    }),
    /Plugin artifact moduleId must not be dot-only/,
  );
});

test('artifact evidence rejects removed camelCase identity aliases', () => {
  assert.throws(
    () => projectPipelineArtifactEvidence({
      artifact: { runId: 'run-legacy' },
      expectedRunId: 'run-legacy',
    }),
    /removed alias 'runId' is not accepted/,
  );
});

test('latest pointer projects canonical run facts for operator summaries', () => {
  const config = makeConfig();
  const runFacts = {
    modules: { total: 4, completed: 4, failed_or_blocked: 0, pending: 0 },
    gates: { total: 3, completed: 3, failed_or_blocked: 0, pending: 0 },
  };

  const latest = buildLatestPointer(config, {
    status: 'completed',
    terminalStatus: 'succeeded',
    runFacts,
  });

  assert.equal(latest.run_facts, runFacts);
  assert.equal(latest.pipeline_run_id, 'run-test');
  assert.equal(latest.module_statuses, runFacts.modules);
  assert.equal(latest.modules, runFacts.modules);
  assert.equal(latest.gates, runFacts.gates);
  assert.deepEqual(latest.tests.modules, {
    total: 4,
    completed: 4,
    failed_or_blocked: 0,
    pending: 0,
    status_counts: {},
  });
  assert.equal(latest.cost.source, 'not_available');
});

test('plugin artifact lane rejects missing identity segments', () => {
  const config = makeConfig();

  assert.throws(
    () => createPluginArtifactsApi(config, {
      hookFamily: 'worker.execute',
      stageId: 'forge',
    }),
    /Plugin artifact moduleId must be a non-empty string/,
  );
});

test('plugin artifact index append preserves entries added before locked write', async () => {
  const config = makeConfig();
  const bundle = getPluginArtifactBundle(config, {
    moduleId: 'module-a',
    hookFamily: 'worker.execute',
    stageId: 'forge',
  });
  const concurrentEntry = {
    type: 'diagnostic',
    path: 'concurrent-entry.txt',
    requestId: 'artifact-concurrent',
    recordedAt: '2026-06-03T00:00:00.000Z',
  };
  const originalMkdirSync = fs.mkdirSync;
  let injected = false;

  fs.mkdirSync = function patchedMkdirSync(targetPath, options) {
    const result = originalMkdirSync.call(this, targetPath, options);
    if (!injected && targetPath === `${bundle.lane_index_path}.lock`) {
      injected = true;
      originalMkdirSync.call(this, path.dirname(bundle.lane_index_path), { recursive: true });
      fs.writeFileSync(bundle.lane_index_path, JSON.stringify([concurrentEntry], null, 2));
    }
    return result;
  };

  try {
    const api = createPluginArtifactsApi(config, {
      moduleId: 'module-a',
      hookFamily: 'worker.execute',
      stageId: 'forge',
      now: () => '2026-06-03T00:00:01.000Z',
    });
    await api.persist({
      type: 'diagnostic',
      format: 'text',
      content: 'payload',
    });
  } finally {
    fs.mkdirSync = originalMkdirSync;
  }

  const entries = JSON.parse(fs.readFileSync(bundle.lane_index_path, 'utf8'));
  assert.equal(entries.length, 2);
  assert.equal(entries.some((entry) => entry.requestId === concurrentEntry.requestId), true);

  const api = createPluginArtifactsApi(config, {
    moduleId: 'module-a',
    hookFamily: 'worker.execute',
    stageId: 'forge',
  });
  const found = await api.find({ type: 'diagnostic' });
  assert.equal(found.length, 2);
  assert.equal(found.some((entry) => entry.path === concurrentEntry.path), true);
});

test('plugin artifact index append reclaims stale lock directories', async () => {
  const config = makeConfig();
  const bundle = getPluginArtifactBundle(config, {
    moduleId: 'module-stale',
    hookFamily: 'worker.execute',
    stageId: 'forge',
  });
  const lockPath = `${bundle.lane_index_path}.lock`;
  const staleTime = new Date(Date.now() - 10 * 60 * 1000);

  fs.mkdirSync(lockPath, { recursive: true });
  fs.writeFileSync(path.join(lockPath, 'owner.json'), JSON.stringify({ pid: 1, acquired_at: staleTime.toISOString() }));
  fs.utimesSync(lockPath, staleTime, staleTime);

  const api = createPluginArtifactsApi(config, {
    moduleId: 'module-stale',
    hookFamily: 'worker.execute',
    stageId: 'forge',
    now: () => '2026-06-03T00:00:02.000Z',
  });
  const receipt = await api.persist({
    type: 'diagnostic',
    format: 'text',
    content: 'payload',
  });

  assert.equal(receipt.artifact.type, 'diagnostic');
  assert.equal(fs.existsSync(lockPath), false);
  const entries = JSON.parse(fs.readFileSync(bundle.lane_index_path, 'utf8'));
  assert.equal(entries.length, 1);
});

test('plugin artifact index keeps distinct paths when request ids collide', async () => {
  const config = makeConfig();
  const originalDateNow = Date.now;
  const originalRandom = Math.random;
  Date.now = () => 1780650000000;
  Math.random = () => 0.123456789;

  try {
    const api = createPluginArtifactsApi(config, {
      moduleId: 'module-collision',
      hookFamily: 'worker.execute',
      stageId: 'forge',
      now: () => '2026-06-03T00:00:03.000Z',
    });
    await api.persist({
      type: 'diagnostic',
      format: 'text',
      suggestedPath: 'first.txt',
      content: 'first',
    });
    await api.persist({
      type: 'diagnostic',
      format: 'text',
      suggestedPath: 'second.txt',
      content: 'second',
    });

    const found = await api.find({ type: 'diagnostic' });
    assert.equal(found.length, 2);
    assert.equal(found.some((entry) => entry.path.includes('first')), true);
    assert.equal(found.some((entry) => entry.path.includes('second')), true);
  } finally {
    Date.now = originalDateNow;
    Math.random = originalRandom;
  }
});
