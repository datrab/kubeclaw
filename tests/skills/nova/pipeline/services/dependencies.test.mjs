import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { checkDependencies } from '../../../../../skills/nova/pipeline/services/dependencies.ts';
import { appendModuleLifecycleEvent } from '../../../../../skills/nova/pipeline/services/status-store.ts';

function config(runId = 'run-dependencies-test') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dependencies-test-'));
  return {
    project: 'dependencies-test',
    _runId: runId,
    paths: {
      swarm_dir: path.join(root, '.swarm'),
    },
  };
}

function markModulePass(cfg, moduleId) {
  appendModuleLifecycleEvent(cfg, moduleId, {
    module_id: moduleId,
    status: 'IN_PROGRESS',
    current_phase: 'forge',
    fail_count: 0,
  }, {
    eventType: 'module_attempt.started',
    oldStatus: 'PENDING',
    newStatus: 'IN_PROGRESS',
    now: '2026-07-10T00:00:00.000Z',
  });
  appendModuleLifecycleEvent(cfg, moduleId, {
    module_id: moduleId,
    status: 'PASS',
    current_phase: null,
    fail_count: 0,
  }, {
    eventType: 'module_attempt.passed',
    oldStatus: 'TESTING',
    newStatus: 'PASS',
    now: '2026-07-10T00:00:00.000Z',
  });
}

test('checkDependencies reports missing gate when progress.gates is omitted', () => {
  const result = checkDependencies({}, {
    modules: {
      m1: { depends_on: ['gate:approval'] },
    },
  }, 'm1');

  assert.deepEqual(result, {
    met: false,
    reason: "Gate 'approval' not defined",
  });
});

test('checkDependencies uses shared run authority inside isolated module worktrees', () => {
  const shared = config();
  const isolated = {
    ...config('run-dependencies-test-isolated'),
    _sharedPipelineConfig: shared,
  };
  const progress = {
    modules: {
      '01-nginx': { title: 'Foundation', dir: '01-nginx', depends_on: [] },
      '02-nginx': { title: 'Branch', dir: '02-nginx', depends_on: ['01-nginx'] },
    },
  };

  markModulePass(shared, '01-nginx');

  assert.deepEqual(checkDependencies(isolated, progress, '02-nginx'), { met: true });
});
