import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { findNextStep } from '../../../../../skills/nova/pipeline/runners/pipeline-runner-scheduling.ts';

function config() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-scheduling-'));
  return {
    project: 'pipeline-scheduling-test',
    _runId: 'run-scheduling-test',
    paths: {
      swarm_dir: path.join(root, '.swarm'),
    },
  };
}

function progress({ dependent = false } = {}) {
  return {
    modules: {
      '01-nginx': { title: 'A', dir: '01-nginx', depends_on: [] },
      '02-nginx': { title: 'B', dir: '02-nginx', depends_on: dependent ? ['01-nginx'] : [] },
    },
    gates: {
      'final-buster': { type: 'buster', title: 'Final Buster' },
    },
    execution_order: ['01-nginx', '02-nginx', 'gate:final-buster'],
  };
}

test('scheduler batches adjacent independent ready modules', () => {
  const next = findNextStep(config(), progress(), {
    checkDependencies() {
      return { met: true };
    },
  });

  assert.deepEqual(next, { type: 'module_batch', ids: ['01-nginx', '02-nginx'] });
});

test('scheduler does not batch a module that depends on an earlier pending module', () => {
  const next = findNextStep(config(), progress({ dependent: true }), {
    checkDependencies(_config, _progress, moduleId) {
      return moduleId === '02-nginx'
        ? { met: false, reason: 'Module 01-nginx is NOT_STARTED' }
        : { met: true };
    },
  });

  assert.deepEqual(next, { type: 'module', id: '01-nginx' });
});

test('scheduler keeps module batches contiguous when a later module is ready', () => {
  const prog = progress();
  prog.modules['03-nginx'] = { title: 'C', dir: '03-nginx', depends_on: [] };
  prog.execution_order = ['01-nginx', '02-nginx', '03-nginx', 'gate:final-buster'];

  const next = findNextStep(config(), prog, {
    checkDependencies(_config, _progress, moduleId) {
      return moduleId === '02-nginx'
        ? { met: false, reason: 'module 02 deliberately not ready' }
        : { met: true };
    },
  });

  assert.deepEqual(next, { type: 'module', id: '01-nginx' });
});
