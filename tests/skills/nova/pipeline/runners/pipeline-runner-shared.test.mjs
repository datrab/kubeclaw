import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { appendLifecycleEvent } from '../../../../../skills/nova/pipeline/services/status-store.ts';
import { hasAnyStartedModules } from '../../../../../skills/nova/pipeline/runners/pipeline-runner-shared.ts';

test('hasAnyStartedModules normalizes module-prefixed execution entries', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-runner-shared-'));
  const config = {
    project: 'pipeline-runner-shared-test',
    _runId: 'run-prefixed-module-started',
    run_id: 'run-prefixed-module-started',
    repo_root: dir,
    paths: {
      swarm_dir: path.join(dir, '.swarm'),
      modules_dir: path.join(dir, 'modules'),
    },
  };
  const progress = {
    execution_order: ['module:api'],
    modules: {
      api: { dir: 'services/api' },
    },
    gates: {},
  };
  appendLifecycleEvent(config, {
    type: 'module_attempt.started',
    refs: {
      primary_ref: { type: 'module_attempt', id: 'module:api:attempt:1' },
      run_id: config._runId,
      run_ref: `run:${config._runId}`,
      module_id: 'api',
      module_attempt_ref: 'module:api:attempt:1',
      attempt: 1,
    },
    data: {
      title: 'API',
      module_dir: 'services/api',
      stages: [],
      resume_from_status: 'PENDING',
    },
    occurredAt: '2026-06-03T06:00:00.000Z',
  });

  const started = hasAnyStartedModules(config, progress, {
    loadStatus: () => null,
  });

  assert.equal(started, true);
});
