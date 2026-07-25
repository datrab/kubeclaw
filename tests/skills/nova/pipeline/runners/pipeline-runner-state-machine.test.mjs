import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test, { after } from 'node:test';

import { createRunStats } from '../../../../../skills/nova/pipeline/core/runtime.ts';
import { getActiveContext } from '../../../../../skills/nova/pipeline/core/logger.ts';
import { projectSrcPath } from '../../../../../skills/nova/pipeline/core/paths.ts';
import { buildPipelineStepResult } from '../../../../../skills/nova/pipeline/services/contracts/pipeline-step-result.ts';
import {
  PIPELINE_RUNNER_ACTIONS,
  planPipelineStep,
  runPipelineStateMachine,
} from '../../../../../skills/nova/pipeline/runners/pipeline-runner-state-machine.ts';
import {
  appendPipelineLifecycleEvent,
  readLifecycleEvents,
} from '../../../../../skills/nova/pipeline/services/status-store.ts';

function testConfig() {
  const root = fs.mkdtempSync(path.join(process.cwd(), '.tmp-pipeline-state-machine-'));
  tempRepos.add(root);
  const telemetrySink = {
    enabled: true,
    manifest: {
      moduleId: 'test.telemetry.noop',
      kind: 'telemetry',
      hookFamily: 'telemetry.sink',
      stageIds: ['telemetry.sink'],
      capabilities: [],
      sourceType: 'builtin',
      trustTier: 'trusted',
      priority: 1,
    },
    implementation: {
      async observe() {},
    },
  };
  return {
    project: 'state-machine-test',
    _runId: 'run-test',
    run_id: 'run-test',
    _runStats: createRunStats('2026-07-10T00:00:00.000Z'),
    repo_root: root,
    paths: {
      project_src_dir: root,
      swarm_dir: path.join(root, '.swarm'),
      modules_dir: path.join(root, '.swarm', 'modules'),
    },
    locks: {
      lifecycle_append: { stale_ms: 1, timeout_ms: 1 },
    },
    telemetry: {
      sink_timeout_ms: 1_000,
    },
    pluginRegistry: {
      enabled: true,
      stageOwners: { worker: {} },
      hookIndex: {
        'telemetry.sink': {
          'telemetry.sink': [telemetrySink],
        },
      },
    },
  };
}

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Pipeline Test',
      GIT_AUTHOR_EMAIL: 'pipeline@example.test',
      GIT_COMMITTER_NAME: 'Pipeline Test',
      GIT_COMMITTER_EMAIL: 'pipeline@example.test',
    },
  }).trim();
}

function initGitRepo(root) {
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.name', 'Pipeline Test']);
  git(root, ['config', 'user.email', 'pipeline@example.test']);
  fs.writeFileSync(path.join(root, 'README.md'), '# pipeline\n');
  git(root, ['add', 'README.md']);
  git(root, ['commit', '-m', 'seed']);
}

function markTerminalGeneratorsComplete(config) {
  const completionPath = path.join(
    config.paths.swarm_dir,
    'logs',
    'pipeline',
    'runs',
    config._runId,
    'terminal-generator-completions.json',
  );
  fs.mkdirSync(path.dirname(completionPath), { recursive: true });
  fs.writeFileSync(completionPath, JSON.stringify({
    schemaVersion: 'v1',
    project: config.project,
    run_id: config._runId,
    completed: [
      { stage_id: 'generator:case_study', completed_at: '2026-07-10T00:00:00.000Z' },
      { stage_id: 'generator:pipeline_review', completed_at: '2026-07-10T00:00:00.000Z' },
      { stage_id: 'generator:project_summary', completed_at: '2026-07-10T00:00:00.000Z' },
    ],
  }, null, 2));
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

test('pipeline state machine does not plan after a persisted terminal halt', async () => {
  const config = testConfig();
  const progress = { modules: {}, gates: {}, execution_order: [] };
  const outputs = [];
  let planned = false;

  appendPipelineLifecycleEvent(config, 'pipeline_run.started', { progress });
  appendPipelineLifecycleEvent(config, 'pipeline_run.halted', {
    progress,
    result: {
      terminal_status: 'failed',
      terminal_decision: { reasonCode: 'git_credential_failed' },
      reason: 'Permission denied (publickey)',
    },
    stepType: 'module',
    stepId: '01-nginx',
    haltReason: 'git_credential_failed',
  });

  const exitCode = await runPipelineStateMachine({
    config,
    progress,
    opts: { assertPipelineRunLockActive() {} },
    deps: {
      output(payload) {
        outputs.push(payload);
      },
    },
    findNextStep() {
      planned = true;
      return { type: 'done' };
    },
    runValidatorStep() {},
  });

  assert.equal(exitCode, 1);
  assert.equal(planned, false);
  assert.equal(outputs.length, 1);
  assert.equal(outputs[0].halted_existing, true);
  assert.equal(outputs[0].terminal_status, 'failed');
  assert.equal(outputs[0].step_type, 'module');
  assert.equal(outputs[0].step_id, '01-nginx');
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

test('pipeline state machine passes explicit first attempt into planned gate steps', async () => {
  let receivedAttempt = null;

  await assert.rejects(
    () => runPipelineStateMachine({
      config: testConfig(),
      progress: { gates: { deploy: { type: 'approval' } }, execution_order: ['gate:deploy'] },
      opts: {
        assertPipelineRunLockActive() {},
      },
      deps: {
        runGate(_config, _progress, _gateId, opts) {
          receivedAttempt = opts.attempt;
          throw new Error('gate stopped after attempt capture');
        },
      },
      findNextStep() {
        return { type: 'gate', id: 'deploy' };
      },
      runValidatorStep() {},
    }),
    /gate stopped after attempt capture/,
  );

  assert.equal(receivedAttempt, 1);
});

test('pipeline state machine plans module batches as a first-class action', () => {
  const plan = planPipelineStep({ type: 'module_batch', ids: ['01-nginx', '02-nginx'] });
  assert.equal(plan.action, PIPELINE_RUNNER_ACTIONS.RUN_MODULE_BATCH);
  assert.deepEqual(plan.next.ids, ['01-nginx', '02-nginx']);
});

test('pipeline state machine runs parallel modules in isolated worktrees and joins passing branches', async () => {
  const config = testConfig();
  initGitRepo(config.repo_root);
  const progress = { modules: {}, gates: {}, execution_order: [] };
  appendPipelineLifecycleEvent(config, 'pipeline_run.started', { progress });
  markTerminalGeneratorsComplete(config);
  const seenRepoRoots = {};
  const seenModuleWorktrees = {};
  const seenRegistries = {};
  const seenActiveContextConfigs = {};
  const seenRunStats = {};
  const seenSwarmDirs = {};
  const seenProjectSrcDirs = {};
  const seenModulesDirs = {};
  let planned = 0;

  const exitCode = await runPipelineStateMachine({
    config,
    progress,
    opts: { assertPipelineRunLockActive() {} },
    deps: {
      output() {},
      writeSummary: () => ({}),
      async runModule(moduleConfig, _progress, moduleId) {
        seenRepoRoots[moduleId] = moduleConfig.repo_root;
        seenModuleWorktrees[moduleId] = moduleConfig._moduleWorktree;
        seenRegistries[moduleId] = moduleConfig.pluginRegistry;
        seenActiveContextConfigs[moduleId] = getActiveContext()?.config;
        seenRunStats[moduleId] = moduleConfig._runStats;
        seenSwarmDirs[moduleId] = moduleConfig.paths.swarm_dir;
        seenProjectSrcDirs[moduleId] = projectSrcPath(moduleConfig);
        seenModulesDirs[moduleId] = moduleConfig.paths.modules_dir;
        const relPath = path.join('modules', moduleId, 'output.txt');
        fs.mkdirSync(path.dirname(path.join(moduleConfig.repo_root, relPath)), { recursive: true });
        fs.writeFileSync(path.join(moduleConfig.repo_root, relPath), `${moduleId}\n`);
        git(moduleConfig.repo_root, ['add', relPath]);
        git(moduleConfig.repo_root, ['commit', '-m', `module ${moduleId}`]);
        return null;
      },
    },
    findNextStep() {
      planned += 1;
      return planned === 1 ? { type: 'module_batch', ids: ['02-nginx', '03-nginx'] } : { type: 'done' };
    },
    runValidatorStep() {},
  });

  assert.equal(exitCode, 0);
  assert.notEqual(seenRepoRoots['02-nginx'], config.repo_root);
  assert.notEqual(seenRepoRoots['03-nginx'], config.repo_root);
  assert.notEqual(seenRepoRoots['02-nginx'], seenRepoRoots['03-nginx']);
  assert.equal(seenModuleWorktrees['02-nginx']?.kind, 'module_worktree');
  assert.equal(seenModuleWorktrees['03-nginx']?.kind, 'module_worktree');
  assert.equal(seenModuleWorktrees['02-nginx']?.worktree_path, seenRepoRoots['02-nginx']);
  assert.equal(seenModuleWorktrees['03-nginx']?.worktree_path, seenRepoRoots['03-nginx']);
  assert.equal(seenRegistries['02-nginx'], config.pluginRegistry);
  assert.equal(seenRegistries['03-nginx'], config.pluginRegistry);
  assert.equal(seenRunStats['02-nginx'], config._runStats);
  assert.equal(seenRunStats['03-nginx'], config._runStats);
  assert.equal(seenSwarmDirs['02-nginx'], config.paths.swarm_dir);
  assert.equal(seenSwarmDirs['03-nginx'], config.paths.swarm_dir);
  assert.equal(seenProjectSrcDirs['02-nginx'], seenRepoRoots['02-nginx']);
  assert.equal(seenProjectSrcDirs['03-nginx'], seenRepoRoots['03-nginx']);
  assert.notEqual(seenModulesDirs['02-nginx'], config.paths.modules_dir);
  assert.notEqual(seenModulesDirs['03-nginx'], config.paths.modules_dir);
  assert.equal(seenActiveContextConfigs['02-nginx']?.repo_root, seenRepoRoots['02-nginx']);
  assert.equal(seenActiveContextConfigs['03-nginx']?.repo_root, seenRepoRoots['03-nginx']);
  assert.equal(fs.readFileSync(path.join(config.repo_root, 'modules/02-nginx/output.txt'), 'utf8'), '02-nginx\n');
  assert.equal(fs.readFileSync(path.join(config.repo_root, 'modules/03-nginx/output.txt'), 'utf8'), '03-nginx\n');
});

test('pipeline state machine treats null module result as a canonical module pass', async () => {
  const config = testConfig();
  initGitRepo(config.repo_root);
  const progress = { modules: {}, gates: {}, execution_order: [] };
  appendPipelineLifecycleEvent(config, 'pipeline_run.started', { progress });
  markTerminalGeneratorsComplete(config);
  let planned = 0;

  const exitCode = await runPipelineStateMachine({
    config,
    progress,
    opts: { assertPipelineRunLockActive() {} },
    deps: {
      output() {},
      writeSummary: () => ({}),
      async runModule(moduleConfig, _progress, moduleId) {
        const relPath = path.join('modules', moduleId, 'output.txt');
        fs.mkdirSync(path.dirname(path.join(moduleConfig.repo_root, relPath)), { recursive: true });
        fs.writeFileSync(path.join(moduleConfig.repo_root, relPath), `${moduleId}\n`);
        git(moduleConfig.repo_root, ['add', relPath]);
        git(moduleConfig.repo_root, ['commit', '-m', `module ${moduleId}`]);
        return null;
      },
    },
    findNextStep() {
      planned += 1;
      return planned === 1 ? { type: 'module', id: '02-nginx' } : { type: 'done' };
    },
    runValidatorStep() {},
  });

  assert.equal(exitCode, 0);
  assert.equal(fs.readFileSync(path.join(config.repo_root, 'modules/02-nginx/output.txt'), 'utf8'), '02-nginx\n');
});

test('pipeline state machine preserves passing and failing module facts without joining failed batches', async () => {
  const config = testConfig();
  initGitRepo(config.repo_root);
  const progress = { modules: {}, gates: {}, execution_order: [] };
  appendPipelineLifecycleEvent(config, 'pipeline_run.started', { progress });
  let planned = 0;
  const headBefore = git(config.repo_root, ['rev-parse', 'HEAD']);

  const exitCode = await runPipelineStateMachine({
    config,
    progress,
    opts: { assertPipelineRunLockActive() {} },
    deps: {
      output(payload) {
        assert.ok(payload);
      },
      writeSummary: () => ({}),
      async runModule(moduleConfig, _progress, moduleId) {
        if (moduleId === '02-nginx') {
          const relPath = path.join('modules', moduleId, 'output.txt');
          fs.mkdirSync(path.dirname(path.join(moduleConfig.repo_root, relPath)), { recursive: true });
          fs.writeFileSync(path.join(moduleConfig.repo_root, relPath), `${moduleId}\n`);
          git(moduleConfig.repo_root, ['add', relPath]);
          git(moduleConfig.repo_root, ['commit', '-m', `module ${moduleId}`]);
          return null;
        }
        return buildPipelineStepResult({
          stepType: 'module',
          stepId: moduleId,
          nextAction: 'halt',
          outcome: 'error',
          issueType: 'environment',
          reason: 'git sync failed before buster',
          correlation: {
            run_id: config._runId,
            module_id: moduleId,
          },
          terminalAction: 'stop',
          terminalScope: 'module',
          terminalReasonCode: 'failed/git_sync_before_buster',
          terminalHumanReason: 'git sync failed before buster',
        });
      },
    },
    findNextStep() {
      planned += 1;
      return planned === 1 ? { type: 'module_batch', ids: ['02-nginx', '03-nginx'] } : { type: 'done' };
    },
    runValidatorStep() {},
  });

  assert.equal(exitCode, 1);
  assert.equal(git(config.repo_root, ['rev-parse', 'HEAD']), headBefore);
  const halted = readLifecycleEvents(config).findLast((entry) => entry.type === 'pipeline_run.halted');
  assert.match(halted.data.last_failure, /02-nginx: PASS/);
  assert.match(halted.data.last_failure, /03-nginx: FAIL \(failed\/git_sync_before_buster\)/);
  assert.deepEqual(halted.data.terminal_decision.metadata.module_results, [
    { module_id: '02-nginx', outcome: 'passed', status: 'PASS', reason: 'passed' },
    { module_id: '03-nginx', outcome: 'error', status: 'FAIL', reason: 'failed/git_sync_before_buster' },
  ]);
  assert.deepEqual(halted.data.terminal_decision.metadata.failed_modules, [
    { module_id: '03-nginx', reason: 'failed/git_sync_before_buster' },
  ]);
});

test('pipeline state machine reports module batch join conflicts without shared-worktree fallback', async () => {
  const config = testConfig();
  initGitRepo(config.repo_root);
  const progress = { modules: {}, gates: {}, execution_order: [] };
  appendPipelineLifecycleEvent(config, 'pipeline_run.started', { progress });
  const seenRepoRoots = {};
  let planned = 0;

  const exitCode = await runPipelineStateMachine({
    config,
    progress,
    opts: { assertPipelineRunLockActive() {} },
    deps: {
      output() {},
      async runModule(moduleConfig, _progress, moduleId) {
        seenRepoRoots[moduleId] = moduleConfig.repo_root;
        fs.writeFileSync(path.join(moduleConfig.repo_root, 'shared.txt'), `${moduleId}\n`);
        git(moduleConfig.repo_root, ['add', 'shared.txt']);
        git(moduleConfig.repo_root, ['commit', '-m', `module ${moduleId} shared`]);
        return buildPipelineStepResult({
          stepType: 'module',
          stepId: moduleId,
          nextAction: 'continue',
          outcome: 'passed',
          reason: `${moduleId} passed`,
          correlation: {
            run_id: config._runId,
            module_id: moduleId,
          },
          terminalAction: 'none',
          terminalScope: 'module',
        });
      },
    },
    findNextStep() {
      planned += 1;
      return planned === 1 ? { type: 'module_batch', ids: ['02-nginx', '03-nginx'] } : { type: 'done' };
    },
    runValidatorStep() {},
  });

  assert.equal(exitCode, 1);
  assert.notEqual(seenRepoRoots['02-nginx'], config.repo_root);
  assert.notEqual(seenRepoRoots['03-nginx'], config.repo_root);
  assert.equal(fs.existsSync(path.join(config.repo_root, 'shared.txt')), false);
  const halted = readLifecycleEvents(config).findLast((entry) => entry.type === 'pipeline_run.halted');
  assert.equal(halted.data.terminal_decision.reasonCode, 'module_join/conflict');
  assert.match(halted.data.last_failure, /Module batch join failed: module_join\/conflict/);
  assert.deepEqual(halted.data.terminal_decision.metadata.module_results, [
    { module_id: '02-nginx', outcome: 'passed', status: 'PASS', reason: 'passed' },
    { module_id: '03-nginx', outcome: 'passed', status: 'PASS', reason: 'passed' },
  ]);
  assert.deepEqual(halted.data.terminal_decision.metadata.failed_modules, []);
  assert.deepEqual(halted.data.terminal_decision.metadata.git.conflicted_paths, ['shared.txt']);
});
const tempRepos = new Set();
after(() => {
  for (const root of tempRepos) fs.rmSync(root, { recursive: true, force: true });
});
