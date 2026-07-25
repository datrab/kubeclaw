import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

import {
  findNextStep,
  markScheduledValidatorComplete,
} from '../../../../../skills/nova/pipeline/runners/pipeline-runner-scheduling.ts';
import { markModulePassed } from '../lifecycle-test-fixtures.mjs';

function config() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-scheduling-'));
  tempRepos.add(root);
  return {
    project: 'pipeline-scheduling-test',
    _runId: 'run-scheduling-test',
    paths: {
      swarm_dir: path.join(root, '.swarm'),
    },
    locks: {
      lifecycle_append: {
        stale_ms: 30_000,
        timeout_ms: 1000,
      },
    },
  };
}

const markModulePass = (cfg, moduleId) => markModulePassed(cfg, moduleId, {
  completedPhase: 'complete',
  passingFrom: 'READY_FOR_TESTING',
});

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
  const next = findNextStep(config(), progress());

  assert.deepEqual(next, { type: 'module_batch', ids: ['01-nginx', '02-nginx'] });
});

test('scheduler does not batch a module that depends on an earlier pending module', () => {
  const next = findNextStep(config(), progress({ dependent: true }));

  assert.deepEqual(next, { type: 'module', id: '01-nginx' });
});

test('scheduler keeps module batches contiguous when a later module is ready', () => {
  const prog = progress();
  prog.modules['02-nginx'].depends_on = ['missing-module'];
  prog.modules['03-nginx'] = { title: 'C', dir: '03-nginx', depends_on: [] };
  prog.execution_order = ['01-nginx', '02-nginx', '03-nginx', 'gate:final-buster'];

  const next = findNextStep(config(), prog);

  assert.deepEqual(next, { type: 'module', id: '01-nginx' });
});

test('scheduler selects seed DAG as foundation, parallel branches, then assembly', () => {
  const cfg = config();
  const prog = {
    modules: {
      '01-nginx': { title: 'Foundation', dir: '01-nginx', depends_on: [] },
      '02-nginx': { title: 'Content branch', dir: '02-nginx', depends_on: ['01-nginx'] },
      '03-nginx': { title: 'Assets branch', dir: '03-nginx', depends_on: ['01-nginx'] },
      '04-nginx': { title: 'Release assembly', dir: '04-nginx', depends_on: ['01-nginx', '02-nginx', '03-nginx'] },
    },
    gates: {
      'final-buster': { type: 'buster', title: 'Final Buster' },
    },
    execution_order: ['01-nginx', '02-nginx', '03-nginx', '04-nginx', 'gate:final-buster'],
  };

  assert.deepEqual(findNextStep(cfg, prog), { type: 'module', id: '01-nginx' });

  markModulePass(cfg, '01-nginx');
  assert.deepEqual(findNextStep(cfg, prog), { type: 'module_batch', ids: ['02-nginx', '03-nginx'] });

  markModulePass(cfg, '02-nginx');
  markModulePass(cfg, '03-nginx');
  assert.deepEqual(findNextStep(cfg, prog), { type: 'module', id: '04-nginx' });
});

test('scheduler batches ready modules after completed inline validators', () => {
  const cfg = config();
  const prog = {
    modules: {
      '01-nginx': { title: 'Foundation', dir: '01-nginx', depends_on: [] },
      '02-nginx': { title: 'Content branch', dir: '02-nginx', depends_on: ['01-nginx'] },
      '03-nginx': { title: 'Assets branch', dir: '03-nginx', depends_on: ['01-nginx'] },
      '04-nginx': { title: 'Release assembly', dir: '04-nginx', depends_on: ['01-nginx', '02-nginx', '03-nginx'] },
    },
    gates: {
      'final-buster': { type: 'buster', title: 'Final Buster' },
    },
    execution_order: ['01-nginx', 'validator:architecture', '02-nginx', '03-nginx', '04-nginx', 'gate:final-buster'],
  };

  markModulePass(cfg, '01-nginx');
  markScheduledValidatorComplete(cfg, 'execution_order:validator:architecture');

  assert.deepEqual(findNextStep(cfg, prog), { type: 'module_batch', ids: ['02-nginx', '03-nginx'] });
});
const tempRepos = new Set();
after(() => {
  for (const root of tempRepos) fs.rmSync(root, { recursive: true, force: true });
});
