import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { STATUS, EXIT_OK, EXIT_NEEDS_NOVA } from '../core/constants.js';
import { gateStatusPath } from '../core/paths.js';
import { createPipelineContext } from '../core/context.js';
import { setActiveContext, clearActiveContext } from '../core/logger.js';
import { initLogDir, initStatus, saveStatus, loadStatus } from '../services/status-store.js';
import { runModule } from '../runners/module-runner.js';
import { runPipeline } from '../runners/pipeline-runner.js';
import { runGate } from '../runners/gate-runner.js';
import { runBusterGate } from '../runners/buster-gate-runner.js';
import { runReviewGate } from '../runners/review-gate-runner.js';

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeJson(filePath, value) {
  mkdirp(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function createRunnerEnv(prefix) {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), `pipeline-runner-${prefix}-`));
  const project = 'runner-lifecycle';
  const swarmDir = path.join(baseDir, 'Projects', project, 'src', '.swarm');
  const modulesDir = path.join(swarmDir, 'modules');
  mkdirp(modulesDir);

  const config = {
    project,
    repo_root: baseDir,
    poll_interval_seconds: 0.01,
    default_timeout_minutes: 1,
    default_max_fails: 2,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: modulesDir,
      progress_file: path.join(swarmDir, 'progress.json'),
    },
    models: {
      forge: 'openai-codex/gpt-5.4',
      buster: 'openai-codex/gpt-5.4',
      echo: 'openai-codex/gpt-5.4',
    },
    rate_limit: {
      max_pauses_per_module: 1,
      cooldown_hours: 0,
    },
    agents: {
      forge: { dispatch: 'acp', acp_agent_id: 'forge' },
      buster: { dispatch: 'redis', redis_js_path: '/tmp/fake-redis.mjs' },
      echo: { dispatch: 'acp', acp_agent_id: 'echo' },
    },
  };

  const progress = {
    project,
    execution_order: [],
    modules: {},
    gates: {},
  };

  writeJson(config.paths.progress_file, progress);
  const ctx = createPipelineContext({ config, progress, runId: `run-${prefix}` });
  setActiveContext(ctx);
  initLogDir(config, ctx);

  return { baseDir, config, progress, ctx };
}

function persistProgress(env) {
  writeJson(env.config.paths.progress_file, env.progress);
}

function addModule(env, {
  id = 'module-01',
  dir = '01-foundation',
  title = 'Foundation module',
  stages = ['forge', 'buster'],
  status = STATUS.PENDING,
  validation = null,
} = {}) {
  env.progress.modules[id] = { dir, title, stages, timeout_minutes: 1, max_fails: 2 };
  if (!env.progress.execution_order.includes(id)) env.progress.execution_order.push(id);
  persistProgress(env);
  mkdirp(path.join(env.config.paths.modules_dir, dir));
  fs.writeFileSync(path.join(env.config.paths.modules_dir, dir, 'FORGE.md'), '# Forge\n');
  fs.writeFileSync(path.join(env.config.paths.modules_dir, dir, 'BUSTER.md'), '# Buster\n');
  const initial = initStatus(id, env.progress.modules[id]);
  initial.status = status;
  initial.started_at = new Date().toISOString();
  initial.current_phase = null;
  initial.validation = validation || initial.validation;
  saveStatus(env.config, dir, initial);
}

afterEach(() => {
  clearActiveContext();
});

describe('runModule() state machine', () => {
  it('executes forge → delivery lint → pre-check → git sync → Buster in order', async () => {
    const env = createRunnerEnv('module-order');
    addModule(env, { status: STATUS.PENDING });
    const calls = [];

    env.config._testOverrides = {
      moduleRunner: {
        checkDependencies: () => ({ met: true }),
        releaseBlueprint: async () => calls.push('blueprint'),
        runPreflightValidation: () => {
          calls.push('preflight');
          return { passed: true, failures: [] };
        },
        resolveModel: (_config, _progress, agentType) => `${agentType}-model`,
        buildForgePrompt: async () => ({ prompt: 'forge prompt', recalledMemoryIds: [] }),
        savePrompt: () => {},
        discord: async () => {},
        setShutdownContext: () => {},
        clearShutdownContext: () => {},
        invalidateHeadHash: () => {},
        headHash: () => 'head-before',
        acpLabel: (agentType, id) => `${agentType}-${id}`,
        spawnAgent: async (_config, _progress, agentType) => {
          calls.push(`${agentType}_spawn`);
        },
        verifyAgentAlive: async () => true,
        pollWithRateLimitRecovery: async () => {
          calls.push('forge_poll');
          const status = loadStatus(env.config, '01-foundation');
          status.status = STATUS.READY_FOR_TESTING;
          status.current_phase = null;
          saveStatus(env.config, '01-foundation', status);
          return { ok: true };
        },
        getTrackedAgent: () => null,
        killAgent: async (_config, agentType) => {
          calls.push(`${agentType}_kill`);
        },
        saveStreamLog: () => {},
        runDeliveryLintValidation: () => {
          calls.push('delivery_lint');
          return { passed: true, failures: [] };
        },
        runPreCheck: async () => {
          calls.push('pre_check');
          return { passed: true, report: null };
        },
        gitSyncBeforeBuster: async (_config, _dir, status) => {
          calls.push('git_sync');
          status.forge_commit_hash = 'abc123';
        },
        buildBusterModulePrompt: () => ({ prompt: 'buster prompt' }),
        validateBusterConfig: () => {},
        archiveModuleCompletions: async () => {
          calls.push('archive');
        },
        pollDualWithRateLimitRecovery: async () => {
          calls.push('buster_poll');
          return { ok: true, status: { _redis_entry: { status: 'PASS', source: 'agent' } } };
        },
        sleep: async () => {},
        handleFail: async () => {
          throw new Error('unexpected failure');
        },
      },
    };

    const result = await runModule(env.config, env.progress, 'module-01');
    assert.equal(result.exit, EXIT_OK);

    const status = loadStatus(env.config, '01-foundation');
    assert.equal(status.status, STATUS.PASS);
    assert.equal(status.validation.delivery_lint_passed, true);
    assert.equal(status.validation.pre_check_passed, true);

    const ordered = calls.filter(call => [
      'preflight',
      'forge_spawn',
      'delivery_lint',
      'pre_check',
      'git_sync',
      'buster_spawn',
      'buster_poll',
    ].includes(call));
    assert.deepEqual(ordered, [
      'preflight',
      'forge_spawn',
      'delivery_lint',
      'pre_check',
      'git_sync',
      'buster_spawn',
      'buster_poll',
    ]);
  });

  it('resumes from READY_FOR_TESTING and reruns only missing validations before Buster', async () => {
    const env = createRunnerEnv('module-resume');
    addModule(env, {
      status: STATUS.READY_FOR_TESTING,
      validation: {
        attempt: 1,
        delivery_lint_passed: true,
        delivery_lint_passed_at: '2026-01-01T00:00:00.000Z',
        pre_check_passed: false,
        pre_check_passed_at: null,
      },
    });
    const calls = [];

    env.config._testOverrides = {
      moduleRunner: {
        checkDependencies: () => ({ met: true }),
        discord: async () => {},
        savePrompt: () => {},
        resolveModel: (_config, _progress, agentType) => `${agentType}-model`,
        runDeliveryLintValidation: () => {
          calls.push('delivery_lint');
          return { passed: true, failures: [] };
        },
        runPreCheck: async () => {
          calls.push('pre_check');
          return { passed: true, report: null };
        },
        gitSyncBeforeBuster: async (_config, _dir, status) => {
          calls.push('git_sync');
          status.forge_commit_hash = 'resume-commit';
        },
        buildBusterModulePrompt: () => ({ prompt: 'buster prompt' }),
        validateBusterConfig: () => {},
        archiveModuleCompletions: async () => {},
        spawnAgent: async (_config, _progress, agentType) => {
          calls.push(`${agentType}_spawn`);
        },
        killAgent: async () => {},
        pollDualWithRateLimitRecovery: async () => ({ ok: true, status: { _redis_entry: { status: 'PASS', source: 'agent' } } }),
        sleep: async () => {},
        handleFail: async () => {
          throw new Error('unexpected failure');
        },
      },
    };

    const result = await runModule(env.config, env.progress, 'module-01');
    assert.equal(result.exit, EXIT_OK);

    const status = loadStatus(env.config, '01-foundation');
    assert.equal(status.validation.delivery_lint_passed, true);
    assert.equal(status.validation.pre_check_passed, true);
    assert.deepEqual(calls, ['pre_check', 'git_sync', 'buster_spawn']);
  });

  it('returns full-pipeline resume guidance when blueprint release needs Nova', async () => {
    const env = createRunnerEnv('module-blueprint-resume');
    addModule(env, { status: STATUS.PENDING });

    env.config._testOverrides = {
      moduleRunner: {
        checkDependencies: () => ({ met: true }),
        releaseBlueprint: async () => {
          throw new Error('missing architecture branch');
        },
      },
    };

    const result = await runModule(env.config, env.progress, 'module-01');
    assert.equal(result.exit, EXIT_NEEDS_NOVA);
    assert.equal(result.resume_command, 'node pipeline.js --project runner-lifecycle --resume');
    assert.doesNotMatch(result.resume_command, /--module\b/);
  });
});

describe('runPipeline()', () => {
  it('advances through modules and gates in execution order', async () => {
    const env = createRunnerEnv('pipeline-success');
    env.progress.execution_order = ['module-01', 'gate:quality'];
    env.progress.modules['module-01'] = { dir: '01-foundation', title: 'Foundation module' };
    env.progress.gates.quality = { type: 'buster', title: 'Quality gate', output_file: 'quality.json' };
    persistProgress(env);

    const calls = [];
    const summaries = [];
    const state = { modulePass: false, gatePass: false };

    env.config._testOverrides = {
      pipelineRunner: {
        loadStatus: () => (state.modulePass ? { status: STATUS.PASS } : null),
        readGateOutput: () => ({ isPass: state.gatePass, exists: state.gatePass }),
        readGateStatusJson: () => ({ isPass: false }),
        releaseGateFiles: async () => {},
        syncControlFiles: async () => {},
        runModule: async () => {
          calls.push('module');
          state.modulePass = true;
          return { exit: EXIT_OK };
        },
        runGate: async () => {
          calls.push('gate');
          state.gatePass = true;
          return { exit: EXIT_OK };
        },
        discord: async () => {},
        output: () => {},
        writeSummary: (_config, code, reason) => summaries.push({ code, reason }),
        generateProjectSummary: async () => {},
        generatePipelineReview: async () => {},
      },
    };

    const exit = await runPipeline(env.config, env.progress);
    assert.equal(exit, EXIT_OK);
    assert.deepEqual(calls, ['module', 'gate']);
    assert.deepEqual(summaries.at(-1), { code: EXIT_OK, reason: 'PIPELINE_COMPLETE' });
  });

  it('halts single-module runs with Nova escalation when a module returns NEEDS_NOVA', async () => {
    const env = createRunnerEnv('pipeline-halt');
    env.progress.modules['module-01'] = { dir: '01-foundation', title: 'Foundation module' };
    persistProgress(env);

    const injections = [];
    env.config._testOverrides = {
      pipelineRunner: {
        runModule: async () => ({ exit: EXIT_NEEDS_NOVA, reason: 'needs help', module: 'module-01' }),
        discord: async () => {},
        output: () => {},
        writeSummary: () => {},
        injectNeedsNova: async (_config, result, channel, stepType, stepId) => {
          injections.push({ result, channel, stepType, stepId });
        },
      },
    };

    const exit = await runPipeline(env.config, env.progress, { module: 'module-01', novaChannel: '123' });
    assert.equal(exit, EXIT_NEEDS_NOVA);
    assert.equal(injections.length, 1);
    assert.equal(injections[0].channel, '123');
    assert.equal(injections[0].stepType, 'module');
    assert.equal(injections[0].stepId, 'module-01');
  });
});

describe('gate runners', () => {
  it('dispatches runGate() to the configured gate runner', async () => {
    const env = createRunnerEnv('gate-dispatch');
    env.progress.gates.quality = { type: 'buster', title: 'Quality gate' };
    persistProgress(env);

    env.config._testOverrides = {
      gateRunner: {
        runners: {
          buster: async () => ({ exit: EXIT_OK, via: 'buster-runner' }),
        },
      },
    };

    const result = await runGate(env.config, env.progress, 'quality');
    assert.equal(result.via, 'buster-runner');
  });

  it('retests failing Buster gates through the Forge fix loop', async () => {
    const env = createRunnerEnv('buster-gate');
    env.progress.gates.quality = {
      type: 'buster',
      title: 'Quality gate',
      output_file: 'quality/output.json',
      on_fail: 'fix_and_retest',
      max_fix_cycles: 1,
    };
    persistProgress(env);

    const calls = [];
    let gateAttempt = 0;
    env.config._testOverrides = {
      busterGate: {
        readGateInstructions: () => 'gate instructions',
        resolveModel: () => 'buster-model',
        runOnce: async () => {
          gateAttempt += 1;
          return gateAttempt === 1
            ? { ok: false, reason: 'gate_fail', status: { issues: [{ title: 'missing test', severity: 'critical' }] } }
            : { ok: true, status: { _source: 'redis' } };
        },
        discord: async () => {},
        spawnAgent: async () => { calls.push('forge_fix_spawn'); },
        verifyAgentAlive: async () => true,
        pollForSessionEnd: async () => ({ completed: true, hasChanges: true }),
        killAgent: async () => {},
        getTrackedAgent: () => null,
        gitCommitAndPush: async () => { calls.push('commit'); },
        sleep: async () => {},
      },
    };

    const result = await runBusterGate(env.config, env.progress, 'quality');
    assert.equal(result.exit, EXIT_OK);
    assert.deepEqual(calls, ['forge_fix_spawn', 'commit', 'commit']);
    assert.equal(JSON.parse(fs.readFileSync(gateStatusPath(env.config, 'quality'), 'utf8')).status, 'PASS');
  });

  it('re-runs Echo reviews after Forge review fixes', async () => {
    const env = createRunnerEnv('review-gate');
    env.progress.gates.review = {
      type: 'review',
      title: 'Architecture review',
      review_name: 'architecture',
      output_file: 'reviews/architecture.json',
      reviewers: [{ label: 'echo', model: 'openai-codex/gpt-5.4' }],
      max_fix_cycles: 1,
      on_nogo: 'fix_and_rereview',
    };
    persistProgress(env);

    const calls = [];
    let reviewAttempt = 0;
    env.config._testOverrides = {
      reviewGate: {
        resolveModel: () => 'echo-model',
        runOnce: async () => {
          reviewAttempt += 1;
          return reviewAttempt === 1
            ? { ok: false, mergedResult: { status: 'NO-GO', critical_issues: [{ description: 'missing audit trail' }] } }
            : { ok: true, mergedResult: { status: 'GO' } };
        },
        discord: async () => {},
        spawnAgent: async () => { calls.push('review_fix_spawn'); },
        verifyAgentAlive: async () => true,
        pollForSessionEnd: async () => ({ completed: true, hasChanges: true }),
        killAgent: async () => {},
        getTrackedAgent: () => null,
        gitCommitAndPush: async () => { calls.push('commit'); },
      },
    };

    const result = await runReviewGate(env.config, env.progress, 'review');
    assert.equal(result.exit, EXIT_OK);
    assert.deepEqual(calls, ['review_fix_spawn', 'commit']);
  });
});
