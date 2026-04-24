import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';

import {
  materializeRuntimeTree,
  importRuntimeModule,
} from '../../lib/lifecycle-audit-lib.mjs';

async function buildBuiltInRegistry(runtimeRoot) {
  const registryMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/registry.js');
  const { registry, errors } = registryMod.buildPluginRegistry({}, { throwOnError: false });
  assert.equal(errors.length, 0);
  return registry;
}

function withStubbedGeneratorStages(registry) {
  return {
    ...registry,
    stageOwners: {
      ...registry.stageOwners,
      'generator.run': {
        ...registry.stageOwners['generator.run'],
        'generator:project_summary': {
          ...registry.stageOwners['generator.run']['generator:project_summary'],
          implementation: {
            run: async ({ input }) => ({
              schemaVersion: 'v1',
              producerKind: 'generator',
              producerType: input?.ids?.generatorType || 'project_summary',
              outputs: { status: 'ok' },
            }),
          },
        },
        'generator:pipeline_review': {
          ...registry.stageOwners['generator.run']['generator:pipeline_review'],
          implementation: {
            run: async ({ input }) => ({
              schemaVersion: 'v1',
              producerKind: 'generator',
              producerType: input?.ids?.generatorType || 'pipeline_review',
              outputs: { status: 'ok' },
            }),
          },
        },
        'generator:case_study': {
          ...registry.stageOwners['generator.run']['generator:case_study'],
          implementation: {
            run: async ({ input }) => ({
              schemaVersion: 'v1',
              producerKind: 'generator',
              producerType: input?.ids?.generatorType || 'case_study',
              outputs: { status: 'ok' },
            }),
          },
        },
      },
    },
  };
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function seedBlockedModuleLifecycleState(pipelineRuntimeRoot, config, progress, moduleId, {
  attempt = 3,
  dispatchId,
  gatewayLabel,
  sessionKey = null,
  reason = 'Blocked in tests',
  phase = 'buster',
} = {}) {
  const statusStoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/services/status-store.js');
  const lifecycleStateMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/lifecycle-state.js');
  const moduleDir = progress?.modules?.[moduleId]?.dir || moduleId;
  const moduleTitle = progress?.modules?.[moduleId]?.title || moduleId;

  if (!config._logDir && config?.paths?.swarm_dir) {
    config._logDir = path.join(config.paths.swarm_dir, 'logs');
  }
  if (config._logDir && !config._runLogDir) {
    config._runLogDir = path.join(config._logDir, 'pipeline', 'runs', config._runId || config.run_id || 'run-unknown');
  }
  if (config._runLogDir) {
    fs.mkdirSync(config._runLogDir, { recursive: true });
  }

  fs.mkdirSync(path.join(config.paths.modules_dir, moduleDir), { recursive: true });

  const status = statusStoreMod.initStatus(moduleId, { title: moduleTitle });
  status.fail_count = Math.max(0, attempt - 1);
  status.active_agent = {
    attempt,
    dispatch_id: dispatchId || null,
    gateway_label: gatewayLabel || dispatchId || null,
    session_key: sessionKey,
    runtime: 'acp',
    model: 'anthropic/claude-sonnet-4-6',
  };

  lifecycleStateMod.startModulePhase(status, 'forge', 'Seed blocked module attempt', { now: '2026-04-20T17:00:00.000Z' });
  statusStoreMod.saveStatus(config, moduleDir, status);

  lifecycleStateMod.transitionModuleStatus(status, 'READY_FOR_TESTING', {
    note: 'Forge complete',
    now: '2026-04-20T17:05:00.000Z',
  });
  statusStoreMod.saveStatus(config, moduleDir, status);

  lifecycleStateMod.transitionModuleStatus(status, 'TESTING', {
    note: 'Buster started',
    now: '2026-04-20T17:06:00.000Z',
  });
  statusStoreMod.saveStatus(config, moduleDir, status);

  status.fail_count = attempt;
  status.blockedReason = reason;
  status.blockedPhase = phase;
  status.blockedFailCount = attempt;
  status.fail_summaries = [{
    attempt,
    phase,
    summary: reason,
  }];
  lifecycleStateMod.markModuleBlocked(status, phase, reason, {
    reason,
    failCount: attempt,
    now: '2026-04-20T17:07:00.000Z',
    clearActiveAgent: false,
  });
  statusStoreMod.saveStatus(config, moduleDir, status);

  return status;
}

async function seedFailedModuleLifecycleState(pipelineRuntimeRoot, config, progress, moduleId, {
  attempt = 3,
  dispatchId,
  gatewayLabel,
  sessionKey = null,
  reason = 'Failed in tests',
} = {}) {
  const statusStoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/services/status-store.js');
  const lifecycleStateMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/lifecycle-state.js');
  const moduleDir = progress?.modules?.[moduleId]?.dir || moduleId;
  const moduleTitle = progress?.modules?.[moduleId]?.title || moduleId;

  if (!config._logDir && config?.paths?.swarm_dir) {
    config._logDir = path.join(config.paths.swarm_dir, 'logs');
  }
  if (config._logDir && !config._runLogDir) {
    config._runLogDir = path.join(config._logDir, 'pipeline', 'runs', config._runId || config.run_id || 'run-unknown');
  }
  if (config._runLogDir) {
    fs.mkdirSync(config._runLogDir, { recursive: true });
  }

  fs.mkdirSync(path.join(config.paths.modules_dir, moduleDir), { recursive: true });

  const status = statusStoreMod.initStatus(moduleId, { title: moduleTitle });
  status.fail_count = Math.max(0, attempt - 1);
  status.active_agent = {
    attempt,
    dispatch_id: dispatchId || null,
    gateway_label: gatewayLabel || dispatchId || null,
    session_key: sessionKey,
    runtime: 'acp',
    model: 'anthropic/claude-sonnet-4-6',
  };

  lifecycleStateMod.startModulePhase(status, 'forge', 'Seed failed module attempt', { now: '2026-04-20T16:50:00.000Z' });
  statusStoreMod.saveStatus(config, moduleDir, status);

  lifecycleStateMod.transitionModuleStatus(status, 'READY_FOR_TESTING', {
    note: 'Forge complete',
    now: '2026-04-20T16:55:00.000Z',
  });
  statusStoreMod.saveStatus(config, moduleDir, status);

  lifecycleStateMod.transitionModuleStatus(status, 'TESTING', {
    note: 'Buster started',
    now: '2026-04-20T16:56:00.000Z',
  });
  statusStoreMod.saveStatus(config, moduleDir, status);

  status.fail_count = attempt;
  status.fail_summaries = [{
    attempt,
    phase: 'buster',
    summary: reason,
  }];
  lifecycleStateMod.transitionModuleStatus(status, 'FAIL', {
    note: reason,
    now: '2026-04-20T16:57:00.000Z',
  });
  statusStoreMod.saveStatus(config, moduleDir, status);

  return status;
}

export async function registerPipelineArea({
  record,
  sourceRoot,
  overlayRoot,
  installFakeRedis,
  flushAsync,
  xaddEvents,
}) {
  await record('single-module pipeline failures still emit authoritative pipeline halt telemetry', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
  const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.js');
  const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const registry = withStubbedGeneratorStages(await buildBuiltInRegistry(pipelineRuntimeRoot));
  
    const discordCalls = [];
    const sessionKey = 'agent:main:acp:single-module-01';
    const config = {
      project: 'behavior-single-module-halt',
      paths: {
        swarm_dir: '/tmp/behavior-single-module-halt/swarm',
        modules_dir: '/tmp/behavior-single-module-halt/modules',
      },
      telemetry: { enabled: true },
      _pluginRegistry: registry,
      _runId: 'run-single-module-halt-1',
      run_id: 'run-single-module-halt-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      _testOverrides: {
        pipelineRunner: {
          discord: async (...args) => { discordCalls.push(args); },
          runModule: async () => ({
            exit: 10,
            reason: 'Forge fix needs Nova guidance',
            fail_count: 3,
            attempt: 3,
            dispatch_id: 'dispatch-single-module-01-attempt-3',
            module_status: { session_key: sessionKey },
          }),
          injectNeedsNova: async () => {},
          writeSummary: () => {},
        },
      },
    };
  
    const progress = {
      execution_order: ['01'],
      modules: { '01': { title: 'Scaffold', dir: '01-scaffold' } },
      gates: {},
    };
  
    const result = await pipelineRunnerMod.runPipeline(config, progress, { module: '01' });
    await flushAsync();
  
    assert.equal(result, 10);
  
    const streamKey = 'pipeline:telemetry:behavior-single-module-halt:run-single-module-halt-1';
    const events = xaddEvents(streamKey);
    assert.deepEqual(events.map((event) => event.type), ['pipeline.started', 'error.escalation', 'pipeline.halted', 'summary.started', 'summary.completed']);
    assert.equal(events[1].module_id, '01');
    assert.equal(events[1].gate_id, null);
    assert.equal(events[1].session_key, sessionKey);
    assert.equal(events[1].attempt, 3);
    assert.equal(events[1].dispatch_id, 'dispatch-single-module-01-attempt-3');
    assert.equal(events[1].gateway_label, 'dispatch-single-module-01-attempt-3');
    assert.equal(events[1].fail_count, 3);
    assert.equal(events[1].last_failure, 'Forge fix needs Nova guidance');
    assert.equal(events[1].action, 'NEEDS_NOVA');
    assert.equal(events[1].exit_code, 10);
    assert.equal(events[2].reason, 'NEEDS_NOVA');
    assert.equal(events[2].module_id, '01');
    assert.equal(events[2].session_key, sessionKey);
    assert.equal(events[2].attempt, 3);
    assert.equal(events[2].dispatch_id, 'dispatch-single-module-01-attempt-3');
    assert.equal(events[2].gateway_label, 'dispatch-single-module-01-attempt-3');
    assert.equal(events[2].exit_code, 10);
    assert.equal(events[3].summary_type, 'pipeline');
    assert.equal(events[3].exit_code, 10);
    assert.equal(events[3].exit_reason, 'single_module:01');
    assert.equal(events[4].summary_type, 'pipeline');
    assert.equal(events[4].status, 'failed');
    assert.equal(events[4].exit_code, 10);
    assert.equal(events[4].exit_reason, 'single_module:01');
  
  const haltDiscordCall = discordCalls.find(([, , title]) => title === 'Pipeline halted: behavior-single-module-halt');
  assert.equal(Boolean(haltDiscordCall), true);
  assert.equal(haltDiscordCall[4].some((field) => field.name === 'Attempt' && field.value === '3'), true);
  assert.equal(haltDiscordCall[4].some((field) => field.name === 'Dispatch' && field.value === 'dispatch-single-module-01-attempt-3'), true);
  assert.equal(haltDiscordCall[4].some((field) => field.name === 'Session' && field.value === sessionKey), true);
});

  await record('single-module rate-limited runs emit pipeline halt telemetry without escalation drift', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.js');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
    const registry = withStubbedGeneratorStages(await buildBuiltInRegistry(pipelineRuntimeRoot));

    const discordCalls = [];
    const outputs = [];
    const injectNeedsNovaCalls = [];
    const dispatchId = 'dispatch-single-module-rate-limit-7';
    const sessionKey = 'agent:main:acp:single-module-rate-limit';
    const config = {
      project: 'behavior-single-module-rate-limited',
      paths: {
        swarm_dir: '/tmp/behavior-single-module-rate-limited/swarm',
        modules_dir: '/tmp/behavior-single-module-rate-limited/modules',
      },
      telemetry: { enabled: true },
      _pluginRegistry: registry,
      _runId: 'run-single-module-rate-limited-1',
      run_id: 'run-single-module-rate-limited-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-16T00:00:00.000Z'),
      _testOverrides: {
        pipelineRunner: {
          discord: async (...args) => { discordCalls.push(args); },
          output: (payload) => { outputs.push(payload); },
          runModule: async () => ({
            exit: 40,
            reason: 'Rate limit pauses exceeded maximum during Buster phase',
            rate_limit_exhausted: true,
            max_rate_limit_pauses: 4,
            rate_limit_status: {
              attempt: 7,
              dispatch_id: dispatchId,
              gateway_label: dispatchId,
              session_key: sessionKey,
              max_rate_limit_pauses: 4,
            },
            module_status: {
              attempt: 7,
              dispatch_id: dispatchId,
              gateway_label: dispatchId,
              session_key: sessionKey,
            },
          }),
          injectNeedsNova: async (...args) => { injectNeedsNovaCalls.push(args); },
          writeSummary: () => {},
        },
      },
    };

    const progress = {
      execution_order: ['01'],
      modules: { '01': { title: 'Scaffold', dir: '01-scaffold' } },
      gates: {},
    };

    const result = await pipelineRunnerMod.runPipeline(config, progress, { module: '01' });
    await flushAsync();

    assert.equal(result, 40);
    assert.equal(injectNeedsNovaCalls.length, 0, 'rate-limited single-module runs should not escalate to Nova');
    assert.equal(outputs.length, 1, 'expected one output payload');
    assert.equal(outputs[0].exit, 40);
    assert.equal(outputs[0].attempt, 7);
    assert.equal(outputs[0].dispatch_id, dispatchId);
    assert.equal(outputs[0].gateway_label, dispatchId);
    assert.equal(outputs[0].session_key, sessionKey);

    const streamKey = 'pipeline:telemetry:behavior-single-module-rate-limited:run-single-module-rate-limited-1';
    const events = xaddEvents(streamKey);
    assert.deepEqual(events.map((event) => event.type), ['pipeline.started', 'pipeline.halted', 'summary.started', 'summary.completed']);
    assert.equal(events[1].module_id, '01');
    assert.equal(events[1].gate_id, null);
    assert.equal(events[1].attempt, 7);
    assert.equal(events[1].dispatch_id, dispatchId);
    assert.equal(events[1].gateway_label, dispatchId);
    assert.equal(events[1].session_key, sessionKey);
    assert.equal(events[1].reason, 'RATE_LIMITED');
    assert.equal(events[1].exit_code, 40);
    assert.equal(events[2].summary_type, 'pipeline');
    assert.equal(events[2].exit_code, 40);
    assert.equal(events[2].exit_reason, 'single_module:01');
    assert.equal(events[3].summary_type, 'pipeline');
    assert.equal(events[3].status, 'failed');
    assert.equal(events[3].exit_code, 40);
    assert.equal(events[3].exit_reason, 'single_module:01');

    const haltDiscordCall = discordCalls.find(([, , title]) => title === 'Pipeline halted: behavior-single-module-rate-limited');
    assert.equal(Boolean(haltDiscordCall), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Module' && field.value === '01'), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Attempt' && field.value === '7'), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Dispatch' && field.value === dispatchId), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Label' && field.value === dispatchId), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Session' && field.value === sessionKey), true);
  });

  await record('single-module pipeline halts fall back to status correlation for output and Nova handoff', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.js');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
    const pathsMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/paths.js');
    const registry = withStubbedGeneratorStages(await buildBuiltInRegistry(pipelineRuntimeRoot));

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-single-module-failcount-halt-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    const modulesDir = path.join(swarmDir, 'modules');
    const moduleDir = path.join(modulesDir, '01-scaffold');
    fs.mkdirSync(moduleDir, { recursive: true });

    const discordCalls = [];
    const outputs = [];
    const injectNeedsNovaCalls = [];
    const sessionKey = 'agent:main:acp:single-module-failcount-01';
    const config = {
      project: 'behavior-single-module-failcount-halt',
      repo_root: repoRoot,
      paths: {
        swarm_dir: swarmDir,
        modules_dir: modulesDir,
      },
      telemetry: { enabled: true },
      _pluginRegistry: registry,
      _runId: 'run-single-module-failcount-halt-1',
      run_id: 'run-single-module-failcount-halt-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      _testOverrides: {
        pipelineRunner: {
          discord: async (...args) => { discordCalls.push(args); },
          output: (payload) => { outputs.push(payload); },
          runModule: async () => ({
            exit: 10,
            reason: 'Forge fix still needs Nova guidance',
            fail_count: 3,
          }),
          injectNeedsNova: async (...args) => { injectNeedsNovaCalls.push(args); },
          writeSummary: () => {},
        },
      },
    };

    const progress = {
      execution_order: ['01'],
      modules: { '01': { title: 'Scaffold', dir: '01-scaffold' } },
      gates: {},
    };

    await seedFailedModuleLifecycleState(pipelineRuntimeRoot, config, progress, '01', {
      attempt: 3,
      dispatchId: 'dispatch-single-module-failcount-01-attempt-3',
      gatewayLabel: 'dispatch-single-module-failcount-01-attempt-3',
      sessionKey,
      reason: 'Forge fix still needs Nova guidance',
    });

    const result = await pipelineRunnerMod.runPipeline(config, progress, { module: '01' });
    await flushAsync();

    assert.equal(result, 10);

    const streamKey = 'pipeline:telemetry:behavior-single-module-failcount-halt:run-single-module-failcount-halt-1';
    const events = xaddEvents(streamKey);
    assert.deepEqual(events.map((event) => event.type), ['pipeline.started', 'error.escalation', 'pipeline.halted', 'summary.started', 'summary.completed']);
    assert.equal(events[1].attempt, 3);
    assert.equal(events[1].dispatch_id, 'dispatch-single-module-failcount-01-attempt-3');
    assert.equal(events[1].session_key, sessionKey);
    assert.equal(events[1].gateway_label, 'dispatch-single-module-failcount-01-attempt-3');
    assert.equal(events[2].attempt, 3);
    assert.equal(events[2].dispatch_id, 'dispatch-single-module-failcount-01-attempt-3');
    assert.equal(events[2].session_key, sessionKey);
    assert.equal(events[2].gateway_label, 'dispatch-single-module-failcount-01-attempt-3');

    assert.equal(outputs.some((payload) => payload?.attempt === 3 && payload?.dispatch_id === 'dispatch-single-module-failcount-01-attempt-3' && payload?.gateway_label === 'dispatch-single-module-failcount-01-attempt-3' && payload?.session_key === sessionKey), true);
    assert.equal(injectNeedsNovaCalls.length, 1);
    assert.equal(injectNeedsNovaCalls[0][1]?.attempt, 3);
    assert.equal(injectNeedsNovaCalls[0][1]?.dispatch_id, 'dispatch-single-module-failcount-01-attempt-3');
    assert.equal(injectNeedsNovaCalls[0][1]?.gateway_label, 'dispatch-single-module-failcount-01-attempt-3');
    assert.equal(injectNeedsNovaCalls[0][1]?.session_key, sessionKey);

    const haltDiscordCall = discordCalls.find(([, , title]) => title === 'Pipeline halted: behavior-single-module-failcount-halt');
    assert.equal(Boolean(haltDiscordCall), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Attempt' && field.value === '3'), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Dispatch' && field.value === 'dispatch-single-module-failcount-01-attempt-3'), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Session' && field.value === sessionKey), true);
  });

  await record('full-pipeline module halts fall back to status correlation for output and Nova handoff', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.js');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
    const pathsMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/paths.js');
    const registry = withStubbedGeneratorStages(await buildBuiltInRegistry(pipelineRuntimeRoot));

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-full-pipeline-failcount-halt-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    const modulesDir = path.join(swarmDir, 'modules');
    const moduleDir = path.join(modulesDir, '01-scaffold');
    fs.mkdirSync(moduleDir, { recursive: true });

    const discordCalls = [];
    const outputs = [];
    const injectNeedsNovaCalls = [];
    const sessionKey = 'agent:main:acp:full-pipeline-failcount-01';
    const config = {
      project: 'behavior-full-pipeline-failcount-halt',
      repo_root: repoRoot,
      paths: {
        swarm_dir: swarmDir,
        modules_dir: modulesDir,
      },
      telemetry: { enabled: true },
      _pluginRegistry: registry,
      _runId: 'run-full-pipeline-failcount-halt-1',
      run_id: 'run-full-pipeline-failcount-halt-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
      _testOverrides: {
        pipelineRunner: {
          discord: async (...args) => { discordCalls.push(args); },
          output: (payload) => { outputs.push(payload); },
          releaseGateFiles: async () => {},
          syncControlFiles: async () => {},
          runModule: async () => ({
            exit: 10,
            reason: 'Forge fix still needs Nova guidance',
            fail_count: 3,
          }),
          injectNeedsNova: async (...args) => { injectNeedsNovaCalls.push(args); },
          writeSummary: () => {},
        },
      },
    };

    const progress = {
      execution_order: ['01'],
      modules: { '01': { title: 'Scaffold', dir: '01-scaffold' } },
      gates: {},
    };

    await seedFailedModuleLifecycleState(pipelineRuntimeRoot, config, progress, '01', {
      attempt: 3,
      dispatchId: 'dispatch-full-pipeline-failcount-01-attempt-3',
      gatewayLabel: 'dispatch-full-pipeline-failcount-01-attempt-3',
      sessionKey,
      reason: 'Forge fix still needs Nova guidance',
    });

    const result = await pipelineRunnerMod.runPipeline(config, progress, { skipArchValidation: true });
    await flushAsync();

    assert.equal(result, 10);
    assert.equal(outputs.some((payload) => payload?.attempt === 3 && payload?.dispatch_id === 'dispatch-full-pipeline-failcount-01-attempt-3' && payload?.gateway_label === 'dispatch-full-pipeline-failcount-01-attempt-3' && payload?.session_key === sessionKey), true);
    assert.equal(injectNeedsNovaCalls.length, 1);
    assert.equal(injectNeedsNovaCalls[0][1]?.attempt, 3);
    assert.equal(injectNeedsNovaCalls[0][1]?.dispatch_id, 'dispatch-full-pipeline-failcount-01-attempt-3');
    assert.equal(injectNeedsNovaCalls[0][1]?.gateway_label, 'dispatch-full-pipeline-failcount-01-attempt-3');
    assert.equal(injectNeedsNovaCalls[0][1]?.session_key, sessionKey);

    const streamKey = 'pipeline:telemetry:behavior-full-pipeline-failcount-halt:run-full-pipeline-failcount-halt-1';
    const events = xaddEvents(streamKey);
    const escalationEvent = events.find((event) => event.type === 'error.escalation');
    const haltedEvent = events.find((event) => event.type === 'pipeline.halted');
    assert(escalationEvent, 'missing full-pipeline failcount escalation event');
    assert(haltedEvent, 'missing full-pipeline failcount halted event');
    assert.equal(escalationEvent.attempt, 3);
    assert.equal(escalationEvent.dispatch_id, 'dispatch-full-pipeline-failcount-01-attempt-3');
    assert.equal(escalationEvent.session_key, sessionKey);
    assert.equal(escalationEvent.gateway_label, 'dispatch-full-pipeline-failcount-01-attempt-3');
    assert.equal(haltedEvent.attempt, 3);
    assert.equal(haltedEvent.dispatch_id, 'dispatch-full-pipeline-failcount-01-attempt-3');
    assert.equal(haltedEvent.session_key, sessionKey);
    assert.equal(haltedEvent.gateway_label, 'dispatch-full-pipeline-failcount-01-attempt-3');

    const haltDiscordCall = discordCalls.find(([, , title]) => title === 'Pipeline halted: behavior-full-pipeline-failcount-halt');
    assert.equal(Boolean(haltDiscordCall), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Attempt' && field.value === '3'), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Dispatch' && field.value === 'dispatch-full-pipeline-failcount-01-attempt-3'), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Session' && field.value === sessionKey), true);
  });

  await record('single-module blocked runs emit escalation telemetry with preserved session correlation', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.js');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
    const pathsMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/paths.js');
    const registry = withStubbedGeneratorStages(await buildBuiltInRegistry(pipelineRuntimeRoot));
  
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-single-module-blocked-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    const modulesDir = path.join(swarmDir, 'modules');
    const moduleDir = path.join(modulesDir, '01-scaffold');
    fs.mkdirSync(moduleDir, { recursive: true });
  
    const discordCalls = [];
    let injectNeedsNovaCalls = 0;
    const sessionKey = 'agent:main:acp:single-module-blocked-01';
    const config = {
      project: 'behavior-single-module-blocked',
      repo_root: repoRoot,
      paths: {
        swarm_dir: swarmDir,
        modules_dir: modulesDir,
      },
      telemetry: { enabled: true },
      _pluginRegistry: registry,
      _runId: 'run-single-module-blocked-1',
      run_id: 'run-single-module-blocked-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
      _testOverrides: {
        pipelineRunner: {
          discord: async (...args) => { discordCalls.push(args); },
          injectNeedsNova: async () => { injectNeedsNovaCalls++; },
          writeSummary: () => {},
        },
      },
    };
  
    const progress = {
      execution_order: ['01'],
      modules: { '01': { title: 'Scaffold', dir: '01-scaffold' } },
      gates: {},
    };

    await seedBlockedModuleLifecycleState(pipelineRuntimeRoot, config, progress, '01', {
      attempt: 3,
      dispatchId: 'buster-dispatch-01-attempt-3',
      gatewayLabel: 'buster-dispatch-01-attempt-3',
      sessionKey,
      reason: 'Repeated test crashes exhausted the retry budget',
    });

    const result = await pipelineRunnerMod.runPipeline(config, progress, { module: '01' });
    await flushAsync();
  
    assert.equal(result, 20);
    assert.equal(injectNeedsNovaCalls, 0);
  
    const streamKey = 'pipeline:telemetry:behavior-single-module-blocked:run-single-module-blocked-1';
    const events = xaddEvents(streamKey);
    assert.deepEqual(events.map((event) => event.type), ['pipeline.started', 'error.escalation', 'pipeline.halted', 'summary.started', 'summary.completed']);
    assert.equal(events[1].module_id, '01');
    assert.equal(events[1].gate_id, null);
    assert.equal(events[1].session_key, sessionKey);
    assert.equal(events[1].attempt, 3);
    assert.equal(events[1].dispatch_id, 'buster-dispatch-01-attempt-3');
    assert.equal(events[1].gateway_label, 'buster-dispatch-01-attempt-3');
    assert.equal(events[1].fail_count, 3);
    assert.equal(events[1].last_failure, 'Repeated test crashes exhausted the retry budget');
    assert.equal(events[1].action, 'BLOCKED');
    assert.equal(events[1].exit_code, 20);
    assert.equal(events[2].reason, 'BLOCKED');
    assert.equal(events[2].module_id, '01');
    assert.equal(events[2].session_key, sessionKey);
    assert.equal(events[2].attempt, 3);
    assert.equal(events[2].dispatch_id, 'buster-dispatch-01-attempt-3');
    assert.equal(events[2].gateway_label, 'buster-dispatch-01-attempt-3');
    assert.equal(events[2].exit_code, 20);
    assert.equal(events[3].summary_type, 'pipeline');
    assert.equal(events[3].exit_code, 20);
    assert.equal(events[3].exit_reason, 'single_module:01');
    assert.equal(events[4].summary_type, 'pipeline');
    assert.equal(events[4].status, 'failed');
    assert.equal(events[4].exit_code, 20);
    assert.equal(events[4].exit_reason, 'single_module:01');
  
    const haltDiscordCall = discordCalls.find(([, , title]) => title === 'Pipeline halted: behavior-single-module-blocked');
    assert.equal(Boolean(haltDiscordCall), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Attempt' && field.value === '3'), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Dispatch' && field.value === 'buster-dispatch-01-attempt-3'), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Session' && field.value === sessionKey), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Reason' && field.value === 'Repeated test crashes exhausted the retry budget'), true);
  });
  
  await record('full-pipeline blocked runs emit halt and escalation correlation from persisted module state', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.js');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
    const pathsMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/paths.js');
    const registry = withStubbedGeneratorStages(await buildBuiltInRegistry(pipelineRuntimeRoot));
  
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-full-pipeline-blocked-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    const modulesDir = path.join(swarmDir, 'modules');
    const moduleDir = path.join(modulesDir, '01-scaffold');
    fs.mkdirSync(moduleDir, { recursive: true });
  
    const discordCalls = [];
    const outputs = [];
    const sessionKey = 'agent:main:acp:full-pipeline-blocked-01';
    const config = {
      project: 'behavior-full-pipeline-blocked',
      repo_root: repoRoot,
      paths: {
        swarm_dir: swarmDir,
        modules_dir: modulesDir,
      },
      telemetry: { enabled: true },
      _pluginRegistry: registry,
      _runId: 'run-full-pipeline-blocked-1',
      run_id: 'run-full-pipeline-blocked-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
      _testOverrides: {
        pipelineRunner: {
          discord: async (...args) => { discordCalls.push(args); },
          output: (payload) => { outputs.push(payload); },
          writeSummary: () => {},
          generateProjectSummary: async () => ({
            schemaVersion: 'v1',
            producerKind: 'generator',
            producerType: 'project_summary',
            outputs: { status: 'ok' },
          }),
        },
      },
    };
  
    const progress = {
      execution_order: ['01'],
      modules: { '01': { title: 'Scaffold', dir: '01-scaffold' } },
      gates: {},
    };

    await seedBlockedModuleLifecycleState(pipelineRuntimeRoot, config, progress, '01', {
      attempt: 3,
      dispatchId: 'buster-dispatch-full-01-attempt-3',
      gatewayLabel: 'buster-dispatch-full-01-attempt-3',
      sessionKey,
      reason: 'Repeated test crashes exhausted the retry budget',
    });

    const result = await pipelineRunnerMod.runPipeline(config, progress, { skipArchValidation: true });
    await flushAsync();
  
    assert.equal(result, 20);
    assert.equal(outputs.some((payload) => payload?.exit === 20 && payload?.session_key === sessionKey), true);
  
    const streamKey = 'pipeline:telemetry:behavior-full-pipeline-blocked:run-full-pipeline-blocked-1';
    const events = xaddEvents(streamKey);
    assert.deepEqual(events.map((event) => event.type).sort(), ['error.escalation', 'pipeline.halted', 'pipeline.started', 'summary.completed', 'summary.started']);
    const escalationEvent = events.find((event) => event.type === 'error.escalation');
    const haltedEvent = events.find((event) => event.type === 'pipeline.halted');
    assert(escalationEvent, 'missing full-pipeline blocked escalation event');
    assert(haltedEvent, 'missing full-pipeline blocked halt event');
    assert.equal(escalationEvent.module_id, '01');
    assert.equal(escalationEvent.session_key, sessionKey);
    assert.equal(escalationEvent.attempt, 3);
    assert.equal(escalationEvent.dispatch_id, 'buster-dispatch-full-01-attempt-3');
    assert.equal(escalationEvent.gateway_label, 'buster-dispatch-full-01-attempt-3');
    assert.equal(escalationEvent.fail_count, 3);
    assert.equal(escalationEvent.last_failure, 'Repeated test crashes exhausted the retry budget');
    assert.equal(escalationEvent.action, 'BLOCKED');
    assert.equal(haltedEvent.module_id, '01');
    assert.equal(haltedEvent.session_key, sessionKey);
    assert.equal(haltedEvent.attempt, 3);
    assert.equal(haltedEvent.dispatch_id, 'buster-dispatch-full-01-attempt-3');
    assert.equal(haltedEvent.gateway_label, 'buster-dispatch-full-01-attempt-3');
    assert.equal(haltedEvent.reason, 'BLOCKED');
    assert.equal(haltedEvent.exit_code, 20);
    const summaryStartedEvent = events.find((event) => event.type === 'summary.started');
    const summaryCompletedEvent = events.find((event) => event.type === 'summary.completed');
    assert(summaryStartedEvent, 'missing full-pipeline blocked summary.started event');
    assert(summaryCompletedEvent, 'missing full-pipeline blocked summary.completed event');
    assert.equal(summaryStartedEvent.summary_type, 'pipeline');
    assert.equal(summaryStartedEvent.exit_code, 20);
    assert.equal(summaryStartedEvent.exit_reason, 'BLOCKED:01');
    assert.equal(summaryCompletedEvent.summary_type, 'pipeline');
    assert.equal(summaryCompletedEvent.status, 'failed');
    assert.equal(summaryCompletedEvent.exit_code, 20);
    assert.equal(summaryCompletedEvent.exit_reason, 'BLOCKED:01');
  
    const haltDiscordCall = discordCalls.find(([, , title]) => title === 'Pipeline halted: behavior-full-pipeline-blocked');
    assert.equal(Boolean(haltDiscordCall), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Attempt' && field.value === '3'), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Dispatch' && field.value === 'buster-dispatch-full-01-attempt-3'), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Session' && field.value === sessionKey), true);
  });
  
  await record('full pipeline missing gate registries fail authoritatively instead of crashing before dispatch telemetry', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.js');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
    const registry = await buildBuiltInRegistry(pipelineRuntimeRoot);
    const discordCalls = [];
    const outputs = [];
    const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-gate-registry-pipeline-'));
    const runLogDir = path.join(logDir, 'pipeline', 'runs', 'run-gate-registry-pipeline-1');
    fs.mkdirSync(runLogDir, { recursive: true });
  
    const config = {
      project: 'behavior-gate-registry-pipeline',
      paths: {
        swarm_dir: '/tmp/behavior-gate-registry-pipeline/.swarm',
        modules_dir: '/tmp/behavior-gate-registry-pipeline/modules',
      },
      telemetry: { enabled: true },
      _pluginRegistry: registry,
      _logDir: logDir,
      _runLogDir: runLogDir,
      _runId: 'run-gate-registry-pipeline-1',
      run_id: 'run-gate-registry-pipeline-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      _testOverrides: {
        pipelineRunner: {
          discord: async (...args) => { discordCalls.push(args); },
          output: (payload) => { outputs.push(payload); },
          releaseGateFiles: async () => {},
          syncControlFiles: async () => {},
          writeSummary: () => {},
        },
        gateRunner: {
          discord: async (...args) => { discordCalls.push(args); },
        },
      },
    };
  
    const progress = {
      execution_order: ['gate:missing'],
      modules: {},
    };
  
    const result = await pipelineRunnerMod.runPipeline(config, progress, { skipArchValidation: true });
    await flushAsync();
  
    assert.equal(result, 1);
    assert.equal(outputs.some((payload) => payload?.exit === 1 && payload?.reason === "Gate registry missing in progress.json while dispatching 'missing'"), true);
  
    const streamKey = 'pipeline:telemetry:behavior-gate-registry-pipeline:run-gate-registry-pipeline-1';
    const events = xaddEvents(streamKey);
    assert.deepEqual(events.map((event) => event.type), ['pipeline.started', 'gate.started', 'gate.verdict', 'pipeline.halted', 'summary.started', 'summary.completed']);
    assert.equal(events[1].gate_id, 'missing');
    assert.equal(events[1].gate_type, null);
    assert.equal(events[2].gate_id, 'missing');
    assert.equal(events[2].gate_type, null);
    assert.equal(events[2].verdict, 'NO-GO');
    assert.equal(events[2].reason, "Gate registry missing in progress.json while dispatching 'missing'");
    assert.equal(events[3].gate_id, 'missing');
    assert.equal(events[3].reason, 'ERROR');
    assert.equal(events[3].exit_code, 1);
    assert.equal(events[4].summary_type, 'pipeline');
    assert.equal(events[4].exit_code, 1);
    assert.equal(events[4].exit_reason, 'ERROR:missing');
    assert.equal(events[5].summary_type, 'pipeline');
    assert.equal(events[5].status, 'failed');
    assert.equal(events[5].exit_code, 1);
    assert.equal(events[5].exit_reason, 'ERROR:missing');
  
    const dispatchDiscordCall = readJsonl(path.join(runLogDir, 'discord.jsonl')).find((entry) => entry.title === 'Gate Dispatch Failed: missing');
    assert.equal(Boolean(dispatchDiscordCall), true, 'missing full-pipeline gate-registry dispatch Discord alert');
    assert.equal(dispatchDiscordCall.fields.some((field) => field.name === 'Run ID' && field.value === 'run-gate-registry-pipeline-1'), true);
    assert.equal(dispatchDiscordCall.fields.some((field) => field.name === 'Gate' && field.value === 'missing'), true);
  
    const haltDiscordCall = discordCalls.find(([, , title]) => title === 'Pipeline halted: behavior-gate-registry-pipeline');
    assert.equal(Boolean(haltDiscordCall), true, 'missing full-pipeline gate-registry halt Discord alert');
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Gate' && field.value === 'missing'), true);
  });
  
  await record('full-pipeline gate halts preserve gate_type across telemetry and operator surfaces', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.js');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
    const registry = withStubbedGeneratorStages(await buildBuiltInRegistry(pipelineRuntimeRoot));
    const discordCalls = [];
    const outputs = [];
    const injectNeedsNovaCalls = [];
    const sessionKey = 'agent:main:acp:gate-review-stop-1';
    const root = '/tmp/behavior-pipeline-gate-type-stop';
    const swarmDir = `${root}/.swarm`;
    const logDir = `${swarmDir}/logs`;
  
    const config = {
      project: 'behavior-pipeline-gate-type-stop',
      paths: {
        swarm_dir: swarmDir,
        modules_dir: `${root}/modules`,
      },
      telemetry: { enabled: true },
      _pluginRegistry: registry,
      _runId: 'run-pipeline-gate-type-stop-1',
      run_id: 'run-pipeline-gate-type-stop-1',
      _logDir: logDir,
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      _testOverrides: {
        pipelineRunner: {
          discord: async (...args) => { discordCalls.push(args); },
          output: (payload) => { outputs.push(payload); },
          releaseGateFiles: async () => {},
          syncControlFiles: async () => {},
          writeSummary: () => {},
          injectNeedsNova: async (...args) => { injectNeedsNovaCalls.push(args); },
          runGate: async () => ({
            exit: 10,
            reason: 'Review gate needs Nova guidance',
            fail_count: 3,
            attempt: 2,
            dispatch_id: 'review-dispatch-2',
            session_key: sessionKey,
          }),
        },
      },
    };
  
    const progress = {
      execution_order: ['gate:review'],
      modules: {},
      gates: {
        review: {
          type: 'review',
          title: 'Review Gate',
        },
      },
    };
  
    const result = await pipelineRunnerMod.runPipeline(config, progress, { skipArchValidation: true });
    await flushAsync();
  
    assert.equal(result, 10);
    assert.equal(outputs.some((payload) => payload?.exit === 10 && payload?.session_key === sessionKey && payload?.gate_type === 'review'), true);
    assert.equal(injectNeedsNovaCalls.length, 1);
    assert.equal(injectNeedsNovaCalls[0][1]?.gate_type, 'review');
    assert.equal(injectNeedsNovaCalls[0][1]?.dispatch_id, 'review-dispatch-2');
    assert.equal(injectNeedsNovaCalls[0][1]?.session_key, sessionKey);
  
    const streamKey = 'pipeline:telemetry:behavior-pipeline-gate-type-stop:run-pipeline-gate-type-stop-1';
    const events = xaddEvents(streamKey);
    assert.deepEqual(events.map((event) => event.type), ['pipeline.started', 'error.escalation', 'pipeline.halted', 'summary.started', 'summary.completed']);
    assert.equal(events[1].module_id, null);
    assert.equal(events[1].gate_id, 'review');
    assert.equal(events[1].gate_type, 'review');
    assert.equal(events[1].session_key, sessionKey);
    assert.equal(events[1].attempt, 2);
    assert.equal(events[1].dispatch_id, 'review-dispatch-2');
    assert.equal(events[1].gateway_label, 'review-dispatch-2');
    assert.equal(events[1].fail_count, 3);
    assert.equal(events[1].last_failure, 'Review gate needs Nova guidance');
    assert.equal(events[1].action, 'NEEDS_NOVA');
    assert.equal(events[1].exit_code, 10);
    assert.equal(events[2].module_id, null);
    assert.equal(events[2].gate_id, 'review');
    assert.equal(events[2].gate_type, 'review');
    assert.equal(events[2].session_key, sessionKey);
    assert.equal(events[2].attempt, 2);
    assert.equal(events[2].dispatch_id, 'review-dispatch-2');
    assert.equal(events[2].gateway_label, 'review-dispatch-2');
    assert.equal(events[2].reason, 'NEEDS_NOVA');
    assert.equal(events[2].exit_code, 10);
    assert.equal(events[3].summary_type, 'pipeline');
    assert.equal(events[3].exit_code, 10);
    assert.equal(events[3].exit_reason, 'NEEDS_NOVA:review');
    assert.equal(events[4].summary_type, 'pipeline');
    assert.equal(events[4].status, 'failed');
    assert.equal(events[4].exit_code, 10);
    assert.equal(events[4].exit_reason, 'NEEDS_NOVA:review');
  
    const haltDiscordCall = discordCalls.find(([, , title]) => title === 'Pipeline halted: behavior-pipeline-gate-type-stop');
    assert.equal(Boolean(haltDiscordCall), true, 'missing gate halt Discord alert');
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Gate' && field.value === 'review'), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Gate Type' && field.value === 'review'), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Attempt' && field.value === '2'), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Dispatch' && field.value === 'review-dispatch-2'), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Session' && field.value === sessionKey), true);
  });

  await record('full-pipeline gate rate-limit halts preserve gate correlation without escalation drift', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.js');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
    const registry = withStubbedGeneratorStages(await buildBuiltInRegistry(pipelineRuntimeRoot));

    const discordCalls = [];
    const outputs = [];
    const injectNeedsNovaCalls = [];
    const dispatchId = 'review-dispatch-rate-limit-2';
    const sessionKey = 'agent:main:acp:review-rate-limit';
    const root = '/tmp/behavior-pipeline-gate-rate-limited';
    const swarmDir = `${root}/swarm`;
    const logDir = `${swarmDir}/logs`;

    const config = {
      project: 'behavior-pipeline-gate-rate-limited',
      paths: {
        swarm_dir: swarmDir,
        modules_dir: `${root}/modules`,
      },
      telemetry: { enabled: true },
      _pluginRegistry: registry,
      _runId: 'run-pipeline-gate-rate-limited-1',
      run_id: 'run-pipeline-gate-rate-limited-1',
      _logDir: logDir,
      _runStats: runtimeCoreMod.createRunStats('2026-04-16T00:00:00.000Z'),
      _testOverrides: {
        pipelineRunner: {
          discord: async (...args) => { discordCalls.push(args); },
          output: (payload) => { outputs.push(payload); },
          releaseGateFiles: async () => {},
          syncControlFiles: async () => {},
          writeSummary: () => {},
          injectNeedsNova: async (...args) => { injectNeedsNovaCalls.push(args); },
          runGate: async () => ({
            exit: 40,
            reason: 'Review gate exceeded max rate limit pauses',
            attempt: 2,
            dispatch_id: dispatchId,
            gateway_label: dispatchId,
            session_key: sessionKey,
            rate_limit_exhausted: true,
            max_rate_limit_pauses: 2,
          }),
        },
      },
    };

    const progress = {
      execution_order: ['gate:review'],
      modules: {},
      gates: {
        review: { type: 'review', title: 'Review Gate' },
      },
    };

    const result = await pipelineRunnerMod.runPipeline(config, progress, { skipArchValidation: true });
    await flushAsync();

    assert.equal(result, 40);
    assert.equal(injectNeedsNovaCalls.length, 0, 'rate-limited gate halts should not escalate to Nova');
    assert.equal(outputs.length, 1, 'expected one output payload');
    assert.equal(outputs[0].exit, 40);
    assert.equal(outputs[0].gate_type, 'review');
    assert.equal(outputs[0].attempt, 2);
    assert.equal(outputs[0].dispatch_id, dispatchId);
    assert.equal(outputs[0].gateway_label, dispatchId);
    assert.equal(outputs[0].session_key, sessionKey);

    const streamKey = 'pipeline:telemetry:behavior-pipeline-gate-rate-limited:run-pipeline-gate-rate-limited-1';
    const events = xaddEvents(streamKey);
    assert.deepEqual(events.map((event) => event.type), ['pipeline.started', 'pipeline.halted', 'summary.started', 'summary.completed']);
    assert.equal(events[1].module_id, null);
    assert.equal(events[1].gate_id, 'review');
    assert.equal(events[1].gate_type, 'review');
    assert.equal(events[1].attempt, 2);
    assert.equal(events[1].dispatch_id, dispatchId);
    assert.equal(events[1].gateway_label, dispatchId);
    assert.equal(events[1].session_key, sessionKey);
    assert.equal(events[1].reason, 'RATE_LIMITED');
    assert.equal(events[1].exit_code, 40);
    assert.equal(events[2].summary_type, 'pipeline');
    assert.equal(events[2].exit_code, 40);
    assert.equal(events[2].exit_reason, 'RATE_LIMITED:review');
    assert.equal(events[3].summary_type, 'pipeline');
    assert.equal(events[3].status, 'failed');
    assert.equal(events[3].exit_code, 40);
    assert.equal(events[3].exit_reason, 'RATE_LIMITED:review');

    const haltDiscordCall = discordCalls.find(([, , title]) => title === 'Pipeline halted: behavior-pipeline-gate-rate-limited');
    assert.equal(Boolean(haltDiscordCall), true, 'missing gate rate-limit halt Discord alert');
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Gate' && field.value === 'review'), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Gate Type' && field.value === 'review'), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Attempt' && field.value === '2'), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Dispatch' && field.value === dispatchId), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Label' && field.value === dispatchId), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Session' && field.value === sessionKey), true);
  });
  
  await record('architecture validation blocks emit step-scoped pipeline halt and escalation telemetry', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.js');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
    const registry = await buildBuiltInRegistry(pipelineRuntimeRoot);
    const validatorCalls = [];
    const testRegistry = withStubbedGeneratorStages({
      ...registry,
      stageOwners: {
        ...registry.stageOwners,
        'validator.run': {
          ...registry.stageOwners['validator.run'],
          'validator:architecture': {
            ...registry.stageOwners['validator.run']['validator:architecture'],
            implementation: {
              run: async ({ input }) => {
                validatorCalls.push(input);
                return {
                  schemaVersion: 'v1',
                  producerKind: 'validator',
                  producerType: 'architecture',
                  nextAction: 'block',
                  issueType: 'code',
                  diagnostics: {
                    summary: 'Architecture validation BLOCKED with 1 blocking finding(s)',
                    metadata: {
                      blocked: true,
                      project: 'behavior-arch-validation-block',
                      timestamp: '2026-04-09T00:00:00.000Z',
                      raw_findings: [{ id: 'ARCH-1', severity: 'blocking', explanation: 'Missing deployment rollback plan' }],
                    },
                  },
                };
              },
            },
          },
        },
      },
    });
  
    const config = {
      project: 'behavior-arch-validation-block',
      paths: {
        swarm_dir: '/tmp/behavior-arch-validation-block/swarm',
        modules_dir: '/tmp/behavior-arch-validation-block/modules',
      },
      telemetry: { enabled: true },
      _runId: 'run-arch-validation-block-1',
      run_id: 'run-arch-validation-block-1',
      _pluginRegistry: testRegistry,
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      _testOverrides: {
        pipelineRunner: {
          discord: async () => {},
          output: () => {},
          releaseGateFiles: async () => {},
          syncControlFiles: async () => {},
          writeSummary: () => {},
          runArchValidator: async () => {
            throw new Error('fallback arch validator should not run when validator stage owner is registered');
          },
        },
      },
    };
  
    const progress = {
      execution_order: ['01'],
      modules: { '01': { title: 'Scaffold', dir: '01-scaffold' } },
      gates: {},
    };
  
    const result = await pipelineRunnerMod.runPipeline(config, progress);
    await flushAsync();
  
    assert.equal(result, 20);
    assert.equal(validatorCalls.length, 1);
    assert.equal(validatorCalls[0].ids.stageId, 'validator:architecture');
    assert.equal(validatorCalls[0].ids.scope, 'run');
    assert.equal(validatorCalls[0].ids.validatorName, 'architecture');
    assert.equal(validatorCalls[0].refs.validatorResultRef, 'validator_result:run-arch-validation-block-1:architecture');

    const streamKey = 'pipeline:telemetry:behavior-arch-validation-block:run-arch-validation-block-1';
    const events = xaddEvents(streamKey);
    assert.deepEqual(events.map((event) => event.type), ['pipeline.started', 'error.escalation', 'pipeline.halted', 'summary.started', 'summary.completed']);
    assert.equal(events[1].module_id, null);
    assert.equal(events[1].gate_id, null);
    assert.equal(events[1].step_type, 'arch_validation');
    assert.equal(events[1].step_id, 'arch-validation');
    assert.equal(events[1].last_failure, 'Architecture validation failed before module execution');
    assert.equal(events[1].action, 'BLOCKED');
    assert.equal(events[1].exit_code, 20);
    assert.equal(events[2].reason, 'ARCH_VALIDATION_BLOCKED');
    assert.equal(events[2].module_id, null);
    assert.equal(events[2].gate_id, null);
    assert.equal(events[2].step_type, 'arch_validation');
    assert.equal(events[2].step_id, 'arch-validation');
    assert.equal(events[2].exit_code, 20);
    assert.equal(events[3].summary_type, 'pipeline');
    assert.equal(events[3].exit_code, 20);
    assert.equal(events[3].exit_reason, 'ARCH_VALIDATION_BLOCKED');
    assert.equal(events[4].summary_type, 'pipeline');
    assert.equal(events[4].status, 'failed');
    assert.equal(events[4].exit_code, 20);
    assert.equal(events[4].exit_reason, 'ARCH_VALIDATION_BLOCKED');
  });

  await record('architecture validation runs through validator stage owners and preserves pass semantics', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.js');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
    const registry = await buildBuiltInRegistry(pipelineRuntimeRoot);
    const validatorCalls = [];
    const testRegistry = withStubbedGeneratorStages({
      ...registry,
      stageOwners: {
        ...registry.stageOwners,
        'validator.run': {
          ...registry.stageOwners['validator.run'],
          'validator:architecture': {
            ...registry.stageOwners['validator.run']['validator:architecture'],
            implementation: {
              run: async ({ input }) => {
                validatorCalls.push(input);
                return {
                  schemaVersion: 'v1',
                  producerKind: 'validator',
                  producerType: 'architecture',
                  nextAction: 'pass',
                  diagnostics: {
                    summary: 'Architecture validation passed',
                    metadata: {
                      blocked: false,
                      project: 'behavior-arch-validation-pass',
                      timestamp: '2026-04-09T00:00:00.000Z',
                      raw_findings: [],
                    },
                  },
                };
              },
            },
          },
        },
      },
    });

    const config = {
      project: 'behavior-arch-validation-pass',
      paths: {
        swarm_dir: '/tmp/behavior-arch-validation-pass/swarm',
        modules_dir: '/tmp/behavior-arch-validation-pass/modules',
      },
      telemetry: { enabled: true },
      _runId: 'run-arch-validation-pass-1',
      run_id: 'run-arch-validation-pass-1',
      _pluginRegistry: testRegistry,
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      _testOverrides: {
        pipelineRunner: {
          discord: async () => {},
          output: () => {},
          releaseGateFiles: async () => {},
          syncControlFiles: async () => {},
          writeSummary: () => {},
          runArchValidator: async () => {
            throw new Error('fallback arch validator should not run when validator stage owner is registered');
          },
        },
      },
    };

    const progress = {
      project: 'behavior-arch-validation-pass',
      execution_order: [],
      modules: {},
      gates: {},
    };

    const result = await pipelineRunnerMod.runPipeline(config, progress);
    await flushAsync();

    assert.equal(result, 0);
    assert.equal(validatorCalls.length, 1);
    assert.equal(validatorCalls[0].ids.stageId, 'validator:architecture');
    assert.equal(validatorCalls[0].ids.scope, 'run');
    assert.equal(validatorCalls[0].executionContext.resume, false);
    assert.equal(validatorCalls[0].stateSnapshot.pipeline.has_started_modules, false);
    assert.equal(config._governanceCtx.arch_validator.outcome, 'PASSED');
  });

  await record('architecture validator execution failures halt with EXIT_ERROR before module work starts', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.js');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
    const registry = await buildBuiltInRegistry(pipelineRuntimeRoot);
    const testRegistry = withStubbedGeneratorStages({
      ...registry,
      stageOwners: {
        ...registry.stageOwners,
        'validator.run': {
          ...registry.stageOwners['validator.run'],
          'validator:architecture': {
            ...registry.stageOwners['validator.run']['validator:architecture'],
            implementation: {
              run: async () => {
                throw new Error('synthetic validator crash');
              },
            },
          },
        },
      },
    });

    const config = {
      project: 'behavior-arch-validation-error',
      paths: {
        swarm_dir: '/tmp/behavior-arch-validation-error/swarm',
        modules_dir: '/tmp/behavior-arch-validation-error/modules',
      },
      telemetry: { enabled: true },
      _runId: 'run-arch-validation-error-1',
      run_id: 'run-arch-validation-error-1',
      _pluginRegistry: testRegistry,
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      _testOverrides: {
        pipelineRunner: {
          discord: async () => {},
          output: () => {},
          releaseGateFiles: async () => {},
          syncControlFiles: async () => {},
          writeSummary: () => {},
          runModule: async () => {
            throw new Error('module runner should not execute after architecture validator failure');
          },
        },
      },
    };

    const progress = {
      project: 'behavior-arch-validation-error',
      execution_order: ['01'],
      modules: { '01': { title: 'Scaffold', dir: '01-scaffold' } },
      gates: {},
    };

    const result = await pipelineRunnerMod.runPipeline(config, progress);
    await flushAsync();

    assert.equal(result, 1);
    assert.equal(config._governanceCtx.arch_validator.execution_failed, true);
    assert.equal(config._governanceCtx.arch_validator.outcome, 'ERROR');

    const streamKey = 'pipeline:telemetry:behavior-arch-validation-error:run-arch-validation-error-1';
    const events = xaddEvents(streamKey);
    assert.deepEqual(events.map((event) => event.type), ['pipeline.started', 'error.escalation', 'pipeline.halted', 'summary.started', 'summary.completed']);
    assert.equal(events[1].step_type, 'arch_validation');
    assert.equal(events[1].action, 'ERROR');
    assert.equal(events[1].exit_code, 1);
    assert.equal(events[2].reason, 'ARCH_VALIDATION_ERROR');
    assert.equal(events[2].step_type, 'arch_validation');
    assert.equal(events[2].exit_code, 1);
    assert.equal(events[3].exit_reason, 'ARCH_VALIDATION_ERROR');
    assert.equal(events[4].exit_reason, 'ARCH_VALIDATION_ERROR');
  });

  await record('architecture validator registry misses fail closed without executing a fallback validator', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.js');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
    const registry = await buildBuiltInRegistry(pipelineRuntimeRoot);
    const discordCalls = [];
    const outputs = [];

    const config = {
      project: 'behavior-arch-validation-registry-miss',
      paths: {
        swarm_dir: '/tmp/behavior-arch-validation-registry-miss/swarm',
        modules_dir: '/tmp/behavior-arch-validation-registry-miss/modules',
      },
      telemetry: { enabled: true },
      _runId: 'run-arch-validation-registry-miss-1',
      run_id: 'run-arch-validation-registry-miss-1',
      _pluginRegistry: {
        ...registry,
        stageOwners: {
          ...registry.stageOwners,
          'validator.run': {},
        },
      },
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      _testOverrides: {
        pipelineRunner: {
          discord: async (...args) => { discordCalls.push(args); },
          output: (payload) => { outputs.push(payload); },
          releaseGateFiles: async () => {},
          syncControlFiles: async () => {},
          writeSummary: () => {},
          runArchValidator: async () => {
            throw new Error('legacy validator fallback must not run after registry miss');
          },
          runModule: async () => {
            throw new Error('module runner should not execute after validator registry miss');
          },
        },
      },
    };

    const progress = {
      project: 'behavior-arch-validation-registry-miss',
      execution_order: ['01'],
      modules: { '01': { title: 'Scaffold', dir: '01-scaffold' } },
      gates: {},
    };

    const result = await pipelineRunnerMod.runPipeline(config, progress);
    await flushAsync();

    assert.equal(result, 1);
    assert.equal(config._governanceCtx.arch_validator.execution_failed, true);
    assert.equal(config._governanceCtx.arch_validator.outcome, 'ERROR');
    assert.equal(outputs.some((payload) => payload?.exit === 1 && payload?.reason === 'ARCH_VALIDATION_ERROR' && /No registered plugin owner found/.test(payload?.error || '')), true);

    const streamKey = 'pipeline:telemetry:behavior-arch-validation-registry-miss:run-arch-validation-registry-miss-1';
    const events = xaddEvents(streamKey);
    assert.deepEqual(events.map((event) => event.type), ['pipeline.started', 'error.escalation', 'pipeline.halted', 'summary.started', 'summary.completed']);
    assert.equal(events[1].step_type, 'arch_validation');
    assert.equal(events[1].action, 'ERROR');
    assert.equal(events[1].exit_code, 1);
    assert.match(events[1].last_failure || '', /No registered plugin owner found/);
    assert.equal(events[2].reason, 'ARCH_VALIDATION_ERROR');
    assert.equal(events[2].step_type, 'arch_validation');
    assert.equal(events[2].exit_code, 1);
    assert.equal(events[3].exit_reason, 'ARCH_VALIDATION_ERROR');
    assert.equal(events[4].exit_reason, 'ARCH_VALIDATION_ERROR');

    const haltDiscordCall = discordCalls.find(([, , title]) => title === 'Pipeline halted: behavior-arch-validation-registry-miss');
    assert.equal(Boolean(haltDiscordCall), true, 'missing validator registry-miss halt Discord alert');
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Reason' && /No registered plugin owner found/.test(field.value)), true);
  });

  await record('architecture validation resume timing stays core-owned across resume-before-work and resume-after-work', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.js');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
    const statusStoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/services/status-store.js');
    const lifecycleStateMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/lifecycle-state.js');
    const registry = await buildBuiltInRegistry(pipelineRuntimeRoot);
    const validatorCalls = [];
    const testRegistry = withStubbedGeneratorStages({
      ...registry,
      stageOwners: {
        ...registry.stageOwners,
        'validator.run': {
          ...registry.stageOwners['validator.run'],
          'validator:architecture': {
            ...registry.stageOwners['validator.run']['validator:architecture'],
            implementation: {
              run: async ({ input }) => {
                validatorCalls.push(input);
                return {
                  schemaVersion: 'v1',
                  producerKind: 'validator',
                  producerType: 'architecture',
                  nextAction: 'pass',
                  diagnostics: {
                    summary: 'Architecture validation passed',
                    metadata: {
                      blocked: false,
                      project: 'behavior-arch-validation-resume',
                      timestamp: '2026-04-09T00:00:00.000Z',
                      raw_findings: [],
                    },
                  },
                };
              },
            },
          },
        },
      },
    });

    const beforeWorkConfig = {
      project: 'behavior-arch-validation-resume-before-work',
      paths: {
        swarm_dir: '/tmp/behavior-arch-validation-resume-before-work/swarm',
        modules_dir: '/tmp/behavior-arch-validation-resume-before-work/modules',
      },
      telemetry: { enabled: true },
      _runId: 'run-arch-validation-resume-before-work-1',
      run_id: 'run-arch-validation-resume-before-work-1',
      _pluginRegistry: testRegistry,
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      _testOverrides: {
        pipelineRunner: {
          discord: async () => {},
          output: () => {},
          releaseGateFiles: async () => {},
          syncControlFiles: async () => {},
          writeSummary: () => {},
        },
      },
    };

    const beforeWorkProgress = {
      project: 'behavior-arch-validation-resume-before-work',
      execution_order: [],
      modules: {},
      gates: {},
    };

    const beforeWorkResult = await pipelineRunnerMod.runPipeline(beforeWorkConfig, beforeWorkProgress, { resume: true });
    await flushAsync();

    assert.equal(beforeWorkResult, 0);
    assert.equal(validatorCalls.length, 1);
    assert.equal(validatorCalls[0].executionContext.resume, true);
    assert.equal(validatorCalls[0].executionContext.hasStartedModules, false);

    const modulesDir = '/tmp/behavior-arch-validation-resume-after-work/modules';
    fs.mkdirSync(path.join(modulesDir, '01-scaffold'), { recursive: true });

    const afterWorkConfig = {
      project: 'behavior-arch-validation-resume-after-work',
      paths: {
        swarm_dir: '/tmp/behavior-arch-validation-resume-after-work/swarm',
        modules_dir: '/tmp/behavior-arch-validation-resume-after-work/modules',
      },
      telemetry: { enabled: true },
      _runId: 'run-arch-validation-resume-after-work-1',
      run_id: 'run-arch-validation-resume-after-work-1',
      _pluginRegistry: testRegistry,
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      _testOverrides: {
        pipelineRunner: {
          discord: async () => {},
          output: () => {},
          releaseGateFiles: async () => {},
          syncControlFiles: async () => {},
          writeSummary: () => {},
          runModule: async (configArg) => {
            const status = statusStoreMod.loadStatus(configArg, '01-scaffold')
              || statusStoreMod.initStatus('01', { title: 'Scaffold' });
            if (!status.current_phase) {
              lifecycleStateMod.startModulePhase(status, 'forge', 'Resume-after-work verifier started module', {
                now: '2026-04-09T00:01:30.000Z',
              });
              statusStoreMod.saveStatus(configArg, '01-scaffold', status);
            }
            lifecycleStateMod.transitionModuleStatus(status, 'PASS', {
              agent: 'forge',
              note: 'Resume-after-work verifier completed module',
              now: '2026-04-09T00:02:00.000Z',
              completedAt: '2026-04-09T00:02:00.000Z',
            });
            statusStoreMod.saveStatus(configArg, '01-scaffold', status);
            return { exit: 0 };
          },
        },
      },
    };

    if (!afterWorkConfig._logDir && afterWorkConfig?.paths?.swarm_dir) {
      afterWorkConfig._logDir = path.join(afterWorkConfig.paths.swarm_dir, 'logs');
    }
    if (afterWorkConfig._logDir && !afterWorkConfig._runLogDir) {
      afterWorkConfig._runLogDir = path.join(
        afterWorkConfig._logDir,
        'pipeline',
        'runs',
        afterWorkConfig._runId || afterWorkConfig.run_id || 'run-unknown',
      );
      fs.mkdirSync(afterWorkConfig._runLogDir, { recursive: true });
    }
    const afterWorkStatus = statusStoreMod.initStatus('01', { title: 'Scaffold' });
    lifecycleStateMod.startModulePhase(afterWorkStatus, 'forge', 'Synthetic started module for arch validation resume-after-work verifier', {
      now: '2026-04-09T00:01:00.000Z',
    });
    statusStoreMod.saveStatus(afterWorkConfig, '01-scaffold', afterWorkStatus);

    const afterWorkProgress = {
      project: 'behavior-arch-validation-resume-after-work',
      execution_order: ['01'],
      modules: { '01': { title: 'Scaffold', dir: '01-scaffold' } },
      gates: {},
    };

    const afterWorkResult = await pipelineRunnerMod.runPipeline(afterWorkConfig, afterWorkProgress, { resume: true });
    await flushAsync();

    assert.equal(afterWorkResult, 0);
    assert.equal(validatorCalls.length, 1, 'resume after module work started should skip architecture validator');
  });

  await record('built-in architecture validator stage returns control results while report artifacts stay downstream', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    const archValidatorMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/services/arch-validator.js');

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-arch-validator-artifacts-'));
    const modulesDir = path.join(tempRoot, 'modules');
    const moduleDir = path.join(modulesDir, '01-scaffold');
    fs.mkdirSync(moduleDir, { recursive: true });
    fs.writeFileSync(path.join(moduleDir, 'FORGE.md'), '# Forge\n');

    const config = {
      project: 'behavior-arch-validator-artifacts',
      paths: {
        swarm_dir: path.join(tempRoot, 'swarm'),
        modules_dir: modulesDir,
        progress_file: 'progress.json',
      },
      _logDir: path.join(tempRoot, 'logs'),
      _runId: 'run-arch-validator-artifacts-1',
      run_id: 'run-arch-validator-artifacts-1',
    };

    const progress = {
      project: 'behavior-arch-validator-artifacts',
      execution_order: ['01'],
      modules: {
        '01': { title: 'Scaffold', dir: '01-scaffold', stages: ['forge'] },
      },
      gates: {},
    };

    const result = await archValidatorMod.runArchitectureValidatorStage(config, progress, {
      input: {
        ids: {
          stageId: 'validator:architecture',
          validatorName: 'architecture',
        },
      },
    });

    const resultsPath = path.join(config._logDir, 'architecture-validator', 'results.json');
    const summaryPath = path.join(config._logDir, 'architecture-validator', 'summary.md');
    assert.equal(result.schemaVersion, 'v1');
    assert.equal(result.producerKind, 'validator');
    assert.equal(result.producerType, 'architecture');
    assert.equal(result.nextAction, 'pass');
    assert.equal(result.diagnostics.artifacts.some((artifact) => artifact.path === resultsPath), true);
    assert.equal(result.diagnostics.artifacts.some((artifact) => artifact.path === summaryPath), true);
    assert.equal(fs.existsSync(resultsPath), true);
    assert.equal(fs.existsSync(summaryPath), true);
    const writtenReport = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    assert.equal(writtenReport.blocked, false);
  });

  await record('pipeline completion schedules generators through explicit stage owners in core-defined order', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.js');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

    const registry = await buildBuiltInRegistry(pipelineRuntimeRoot);
    const generatorCalls = [];
    const testRegistry = {
      ...registry,
      stageOwners: {
        ...registry.stageOwners,
        'generator.run': {
          ...registry.stageOwners['generator.run'],
          'generator:project_summary': {
            ...registry.stageOwners['generator.run']['generator:project_summary'],
            implementation: {
              run: async ({ input }) => {
                generatorCalls.push({ stageId: 'generator:project_summary', input });
                return { schemaVersion: 'v1', producerKind: 'generator', producerType: 'project_summary', outputs: { status: 'ok' } };
              },
            },
          },
          'generator:pipeline_review': {
            ...registry.stageOwners['generator.run']['generator:pipeline_review'],
            implementation: {
              run: async ({ input }) => {
                generatorCalls.push({ stageId: 'generator:pipeline_review', input });
                return { schemaVersion: 'v1', producerKind: 'generator', producerType: 'pipeline_review', outputs: { status: 'ok' } };
              },
            },
          },
          'generator:case_study': {
            ...registry.stageOwners['generator.run']['generator:case_study'],
            implementation: {
              run: async ({ input }) => {
                generatorCalls.push({ stageId: 'generator:case_study', input });
                return { schemaVersion: 'v1', producerKind: 'generator', producerType: 'case_study', outputs: { status: 'ok' } };
              },
            },
          },
        },
      },
    };

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-generator-stage-order-'));
    const logRoot = path.join(repoRoot, '.swarm', 'logs', 'runs', 'run-generator-stage-order-1');
    fs.mkdirSync(logRoot, { recursive: true });

    const config = {
      project: 'behavior-generator-stage-order',
      repo_root: repoRoot,
      paths: {
        swarm_dir: '/tmp/behavior-generator-stage-order/swarm',
        modules_dir: '/tmp/behavior-generator-stage-order/modules',
      },
      telemetry: { enabled: true },
      _pluginRegistry: testRegistry,
      _logDir: path.join(repoRoot, '.swarm', 'logs'),
      _runLogDir: logRoot,
      _runId: 'run-generator-stage-order-1',
      run_id: 'run-generator-stage-order-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-21T00:00:00.000Z'),
      _testOverrides: {
        pipelineRunner: {
          discord: async () => {},
          output: () => {},
          releaseGateFiles: async () => {},
          syncControlFiles: async () => {},
          writeSummary: () => {},
        },
      },
    };

    const progress = {
      execution_order: [],
      modules: {},
      gates: {},
      case_study: { enabled: true },
    };

    const result = await pipelineRunnerMod.runPipeline(config, progress, { skipArchValidation: true });
    await flushAsync();

    assert.equal(result, 0);
    assert.deepEqual(generatorCalls.map((call) => call.stageId), [
      'generator:project_summary',
      'generator:pipeline_review',
      'generator:case_study',
    ]);
    assert.equal(generatorCalls[0].input.ids.generatorType, 'project_summary');
    assert.equal(generatorCalls[0].input.executionContext.orderIndex, 1);
    assert.equal(generatorCalls[0].input.executionContext.exitReason, 'PIPELINE_COMPLETE');
    assert.equal(generatorCalls[1].input.ids.generatorType, 'pipeline_review');
    assert.equal(generatorCalls[1].input.executionContext.orderIndex, 2);
    assert.equal(generatorCalls[2].input.ids.generatorType, 'case_study');
    assert.equal(generatorCalls[2].input.executionContext.orderIndex, 3);
  });

  await record('blocked module halts schedule only the project summary generator stage', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.js');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

    const registry = await buildBuiltInRegistry(pipelineRuntimeRoot);
    const generatorCalls = [];
    const stageOwners = {};
    for (const stageId of ['generator:project_summary', 'generator:pipeline_review', 'generator:case_study']) {
      stageOwners[stageId] = {
        ...registry.stageOwners['generator.run'][stageId],
        implementation: {
          run: async ({ input }) => {
            generatorCalls.push({ stageId, input });
            return { schemaVersion: 'v1', producerKind: 'generator', producerType: input.ids.generatorType, outputs: { status: 'ok' } };
          },
        },
      };
    }

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-generator-blocked-halt-'));
    const logRoot = path.join(repoRoot, '.swarm', 'logs', 'runs', 'run-generator-blocked-halt-1');
    fs.mkdirSync(logRoot, { recursive: true });

    const config = {
      project: 'behavior-generator-blocked-halt',
      repo_root: repoRoot,
      paths: {
        swarm_dir: '/tmp/behavior-generator-blocked-halt/swarm',
        modules_dir: '/tmp/behavior-generator-blocked-halt/modules',
      },
      telemetry: { enabled: false },
      _logDir: path.join(repoRoot, '.swarm', 'logs'),
      _runLogDir: logRoot,
      _pluginRegistry: {
        ...registry,
        stageOwners: {
          ...registry.stageOwners,
          'generator.run': stageOwners,
        },
      },
      _runId: 'run-generator-blocked-halt-1',
      run_id: 'run-generator-blocked-halt-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-21T00:00:00.000Z'),
      _testOverrides: {
        pipelineRunner: {
          discord: async () => {},
          output: () => {},
          writeSummary: () => {},
        },
      },
    };

    const progress = {
      execution_order: ['01'],
      modules: { '01': { title: 'Scaffold', dir: '01-scaffold' } },
      gates: {},
      case_study: { enabled: true },
    };

    await seedBlockedModuleLifecycleState(pipelineRuntimeRoot, config, progress, '01', {
      attempt: 3,
      reason: 'Blocked in tests',
    });

    const result = await pipelineRunnerMod.runPipeline(config, progress, { skipArchValidation: true });
    await flushAsync();

    assert.equal(result, 20);
    assert.deepEqual(generatorCalls.map((call) => call.stageId), ['generator:project_summary']);
    assert.equal(generatorCalls[0].input.ids.generatorType, 'project_summary');
    assert.equal(generatorCalls[0].input.ids.moduleId, '01');
    assert.equal(generatorCalls[0].input.executionContext.exitReason, 'BLOCKED:01');
  });

  await record('architecture validation blocks exit before the generator schedule runs', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.js');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

    const registry = await buildBuiltInRegistry(pipelineRuntimeRoot);
    const generatorCalls = [];
    const stageOwners = {};
    for (const stageId of ['generator:project_summary', 'generator:pipeline_review', 'generator:case_study']) {
      stageOwners[stageId] = {
        ...registry.stageOwners['generator.run'][stageId],
        implementation: {
          run: async ({ input }) => {
            generatorCalls.push({ stageId, input });
            return { schemaVersion: 'v1', producerKind: 'generator', producerType: input.ids.generatorType, outputs: { status: 'ok' } };
          },
        },
      };
    }

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-generator-arch-block-'));
    const logRoot = path.join(repoRoot, '.swarm', 'logs', 'runs', 'run-generator-arch-block-1');
    fs.mkdirSync(logRoot, { recursive: true });

    const config = {
      project: 'behavior-generator-arch-block',
      repo_root: repoRoot,
      paths: {
        swarm_dir: '/tmp/behavior-generator-arch-block/swarm',
        modules_dir: '/tmp/behavior-generator-arch-block/modules',
      },
      telemetry: { enabled: false },
      _logDir: path.join(repoRoot, '.swarm', 'logs'),
      _runLogDir: logRoot,
      _pluginRegistry: {
        ...registry,
        stageOwners: {
          ...registry.stageOwners,
          'generator.run': stageOwners,
        },
      },
      _runId: 'run-generator-arch-block-1',
      run_id: 'run-generator-arch-block-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-21T00:00:00.000Z'),
      _testOverrides: {
        pipelineRunner: {
          discord: async () => {},
          output: () => {},
          releaseGateFiles: async () => {},
          syncControlFiles: async () => {},
          writeSummary: () => {},
          runArchValidator: async () => ({
            blocked: true,
            findings: [{ id: 'ARCH-1', severity: 'blocking', explanation: 'Missing deployment rollback plan' }],
          }),
        },
      },
    };

    const progress = {
      execution_order: ['01'],
      modules: { '01': { title: 'Scaffold', dir: '01-scaffold' } },
      gates: {},
      case_study: { enabled: true },
    };

    const result = await pipelineRunnerMod.runPipeline(config, progress);
    await flushAsync();

    assert.equal(result, 20);
    assert.deepEqual(generatorCalls, []);
  });

  await record('single-module mode does not enter the full-pipeline generator schedule', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.js');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

    const registry = await buildBuiltInRegistry(pipelineRuntimeRoot);
    const generatorCalls = [];
    const stageOwners = {};
    for (const stageId of ['generator:project_summary', 'generator:pipeline_review', 'generator:case_study']) {
      stageOwners[stageId] = {
        ...registry.stageOwners['generator.run'][stageId],
        implementation: {
          run: async ({ input }) => {
            generatorCalls.push({ stageId, input });
            return { schemaVersion: 'v1', producerKind: 'generator', producerType: input.ids.generatorType, outputs: { status: 'ok' } };
          },
        },
      };
    }

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-generator-single-module-'));
    const logRoot = path.join(repoRoot, '.swarm', 'logs', 'runs', 'run-generator-single-module-1');
    fs.mkdirSync(logRoot, { recursive: true });

    const config = {
      project: 'behavior-generator-single-module',
      repo_root: repoRoot,
      paths: {
        swarm_dir: '/tmp/behavior-generator-single-module/swarm',
        modules_dir: '/tmp/behavior-generator-single-module/modules',
      },
      telemetry: { enabled: false },
      _logDir: path.join(repoRoot, '.swarm', 'logs'),
      _runLogDir: logRoot,
      _pluginRegistry: {
        ...registry,
        stageOwners: {
          ...registry.stageOwners,
          'generator.run': stageOwners,
        },
      },
      _runId: 'run-generator-single-module-1',
      run_id: 'run-generator-single-module-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-21T00:00:00.000Z'),
      _testOverrides: {
        pipelineRunner: {
          discord: async () => {},
          output: () => {},
          runModule: async () => ({ exit: 0, reason: 'PASS', status: 'PASS' }),
          writeSummary: () => {},
        },
      },
    };

    const progress = {
      execution_order: ['01'],
      modules: { '01': { title: 'Scaffold', dir: '01-scaffold' } },
      gates: {},
      case_study: { enabled: true },
    };

    const result = await pipelineRunnerMod.runPipeline(config, progress, { module: '01', skipArchValidation: true });
    await flushAsync();

    assert.equal(result, 0);
    assert.deepEqual(generatorCalls, []);
  });
}
