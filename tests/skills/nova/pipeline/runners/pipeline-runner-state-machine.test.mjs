import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  PIPELINE_RUNNER_ACTIONS,
  planPipelineStep,
  runPipelineStateMachine,
} from '../../../../../skills/nova/pipeline/runners/pipeline-runner-state-machine.ts';

function testConfig() {
  const root = fs.mkdtempSync(path.join(process.cwd(), '.tmp-pipeline-state-machine-'));
  return {
    project: 'state-machine-test',
    _runId: 'run-test',
    repo_root: root,
    paths: {
      swarm_dir: path.join(root, '.swarm'),
    },
  };
}

test('pipeline state machine checks lock ownership before planning another step', async () => {
  let planned = false;
  await assert.rejects(
    () => runPipelineStateMachine({
      config: testConfig(),
      progress: {},
      opts: {
        assertPipelineRunLockActive() {
          throw new Error('lock lost');
        },
      },
      deps: {},
      findNextStep() {
        planned = true;
        return { type: 'done' };
      },
      runValidatorStep() {},
    }),
    /lock lost/,
  );
  assert.equal(planned, false);
});

test('pipeline state machine aborts an in-flight validator when the run signal aborts', async () => {
  const controller = new AbortController();
  let validatorStarted = false;

  await assert.rejects(
    () => runPipelineStateMachine({
      config: testConfig(),
      progress: {},
      opts: {
        signal: controller.signal,
        assertPipelineRunLockActive() {},
      },
      deps: {},
      findNextStep() {
        return { type: 'validator', id: 'validator:slow', schedule: {} };
      },
      runValidatorStep(_config, _progress, _next, _deps, opts) {
        validatorStarted = true;
        setTimeout(() => controller.abort('pipeline_run_lock_heartbeat_owner_lost'), 0);
        return new Promise((resolve) => {
          opts.signal.addEventListener('abort', () => resolve({
            kind: 'pipeline_step_result',
            step_type: 'validator',
            step_id: 'validator:slow',
            next_action: 'continue',
            outcome: 'cancelled',
          }), { once: true });
        });
      },
    }),
    /Pipeline runtime lock lost: pipeline_run_lock_heartbeat_owner_lost/,
  );

  assert.equal(validatorStarted, true);
});

test('pipeline state machine observes external abort when lock signal is also present', async () => {
  const lockController = new AbortController();
  const controller = new AbortController();
  let validatorStarted = false;

  await assert.rejects(
    () => Promise.race([
      runPipelineStateMachine({
        config: testConfig(),
        progress: {},
        opts: {
          pipelineRunLockSignal: lockController.signal,
          signal: controller.signal,
          assertPipelineRunLockActive() {},
        },
        deps: {},
        findNextStep() {
          return { type: 'validator', id: 'validator:external-abort', schedule: {} };
        },
        runValidatorStep() {
          validatorStarted = true;
          setTimeout(() => controller.abort('pipeline_run_aborted'), 0);
          return new Promise(() => {});
        },
      }),
      new Promise((_resolve, reject) => setTimeout(() => reject(new Error('external abort was not observed')), 100)),
    ]),
    /Pipeline runtime lock lost: pipeline_run_aborted/,
  );

  assert.equal(validatorStarted, true);
  assert.equal(lockController.signal.aborted, false);
});

test('pipeline state machine passes the run signal into validator steps', async () => {
  const controller = new AbortController();
  let receivedSignal = null;

  await assert.rejects(
    () => runPipelineStateMachine({
      config: testConfig(),
      progress: {},
      opts: {
        signal: controller.signal,
        assertPipelineRunLockActive() {},
      },
      deps: {},
      findNextStep() {
        return { type: 'validator', id: 'validator:quick', schedule: {} };
      },
      runValidatorStep(_config, _progress, _next, _deps, opts) {
        receivedSignal = opts.signal;
        throw new Error('validator stopped after signal capture');
      },
    }),
    /validator stopped after signal capture/,
  );

  assert.equal(receivedSignal, controller.signal);
});

test('pipeline state machine plans module batches as a first-class action', () => {
  const plan = planPipelineStep({ type: 'module_batch', ids: ['01-nginx', '02-nginx'] });
  assert.equal(plan.action, PIPELINE_RUNNER_ACTIONS.RUN_MODULE_BATCH);
  assert.deepEqual(plan.next.ids, ['01-nginx', '02-nginx']);
});
