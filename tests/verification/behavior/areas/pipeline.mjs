import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';

import {
  materializeRuntimeTree,
  importRuntimeModule,
} from '../../lib/lifecycle-audit-lib.mjs';

async function buildBuiltInRegistry(runtimeRoot) {
  const registryMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/registry.ts');
  const { registry, errors } = registryMod.buildPluginRegistry({ enabled: true, allowCustomModules: false, extraModulePaths: [], modules: {}, stageOwners: {}, restrictedCapabilityAllowlist: {} }, { throwOnError: false });
  assert.equal(errors.length, 0);
  return registry;
}

function withStubbedGeneratorStages(registry) {
  return {
    ...registry,
    stageOwners: {
      ...registry.stageOwners,
      'validator.run': {
        ...registry.stageOwners['validator.run'],
        'validator:full_lint': {
          ...registry.stageOwners['validator.run']?.['validator:full_lint'],
          implementation: {
            run: async ({ input }) => ({
              schemaVersion: 'v1',
              producerKind: 'validator',
              producerType: input?.ids?.validatorName || 'full_lint',
              nextAction: 'pass',
              diagnostics: {
                summary: 'Full lint passed in test registry',
                typed: { validator: { outcomeClass: 'passed' } },
              },
            }),
          },
        },
      },
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

function stepOutcomeForExit(exitCode) {
  switch (Number(exitCode)) {
    case 0: return ['continue', 'passed', 'OK'];
    case 10: return ['halt', 'needs_nova', 'NEEDS_NOVA'];
    case 20: return ['halt', 'blocked', 'BLOCKED'];
    case 30: return ['halt', 'timeout', 'TIMEOUT'];
    case 40: return ['halt', 'rate_limited', 'RATE_LIMITED'];
    default: return ['halt', 'error', 'ERROR'];
  }
}

function makeStepResult({ stepType = 'module', stepId = '01', exit = 0, reason = null, status = null, projection = {}, correlation = {}, issueType = null } = {}) {
  const [nextAction, outcome, exitLabel] = stepOutcomeForExit(exit);
  return {
    schemaVersion: 'v1',
    kind: 'pipeline_step_result',
    stepType,
    stepId,
    nextAction,
    outcome,
    ...(issueType ? { issueType } : {}),
    diagnostics: {
      summary: reason,
      findings: [],
      metadata: {
        ...projection,
        ...(reason != null ? { reason } : {}),
        ...(status != null ? { status } : {}),
      },
      typed: {},
    },
    correlation,
    terminal: {
      exitCode: exit,
      exitLabel,
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
  const statusStoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/services/status-store.ts');
  const lifecycleStateMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/lifecycle-state.ts');
  const moduleDir = progress?.modules?.[moduleId]?.dir || moduleId;
  const moduleTitle = progress?.modules?.[moduleId]?.title || moduleId;

  fs.mkdirSync(path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'runs', config._runId || config.run_id || 'run-unknown'), { recursive: true });

  fs.mkdirSync(path.join(config.paths.modules_dir, moduleDir), { recursive: true });

  const status = statusStoreMod.initStatus(moduleId, { title: moduleTitle });
  status.active_agent = {
    attempt,
    dispatch_id: dispatchId || null,
    gateway_label: gatewayLabel || dispatchId || null,
    session_key: sessionKey,
    runtime: 'acp',
    model: 'anthropic/claude-sonnet-4-6',
  };

  const forgeStartTransition = lifecycleStateMod.startModulePhase(status, 'forge', 'Seed blocked module attempt', { now: '2026-04-20T17:00:00.000Z' });
  statusStoreMod.saveStatus(config, moduleDir, status, forgeStartTransition);

  const forgeCompleteTransition = lifecycleStateMod.transitionModuleStatus(status, 'READY_FOR_TESTING', {
    note: 'Forge complete',
    now: '2026-04-20T17:05:00.000Z',
  });
  statusStoreMod.saveStatus(config, moduleDir, status, forgeCompleteTransition);

  const busterStartTransition = lifecycleStateMod.transitionModuleStatus(status, 'TESTING', {
    note: 'Buster started',
    now: '2026-04-20T17:06:00.000Z',
  });
  statusStoreMod.saveStatus(config, moduleDir, status, busterStartTransition);

  status.fail_count = attempt;
  status.blockedReason = reason;
  status.blockedPhase = phase;
  status.blockedFailCount = attempt;
  status.fail_summaries = [{
    attempt,
    phase,
    summary: reason,
  }];
  const blockedTransition = lifecycleStateMod.markModuleBlocked(status, phase, reason, {
    reason,
    failCount: attempt,
    now: '2026-04-20T17:07:00.000Z',
    clearActiveAgent: false,
  });
  statusStoreMod.saveStatus(config, moduleDir, status, blockedTransition);

  return status;
}

async function seedFailedModuleLifecycleState(pipelineRuntimeRoot, config, progress, moduleId, {
  attempt = 3,
  dispatchId,
  gatewayLabel,
  sessionKey = null,
  reason = 'Failed in tests',
} = {}) {
  const statusStoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/services/status-store.ts');
  const lifecycleStateMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/lifecycle-state.ts');
  const moduleDir = progress?.modules?.[moduleId]?.dir || moduleId;
  const moduleTitle = progress?.modules?.[moduleId]?.title || moduleId;

  fs.mkdirSync(path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'runs', config._runId || config.run_id || 'run-unknown'), { recursive: true });

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

  const forgeStartTransition = lifecycleStateMod.startModulePhase(status, 'forge', 'Seed failed module attempt', { now: '2026-04-20T16:50:00.000Z' });
  statusStoreMod.saveStatus(config, moduleDir, status, forgeStartTransition);

  const forgeCompleteTransition = lifecycleStateMod.transitionModuleStatus(status, 'READY_FOR_TESTING', {
    note: 'Forge complete',
    now: '2026-04-20T16:55:00.000Z',
  });
  statusStoreMod.saveStatus(config, moduleDir, status, forgeCompleteTransition);

  const busterStartTransition = lifecycleStateMod.transitionModuleStatus(status, 'TESTING', {
    note: 'Buster started',
    now: '2026-04-20T16:56:00.000Z',
  });
  statusStoreMod.saveStatus(config, moduleDir, status, busterStartTransition);

  status.fail_count = attempt;
  status.fail_summaries = [{
    attempt,
    phase: 'buster',
    summary: reason,
  }];
  const failTransition = lifecycleStateMod.transitionModuleStatus(status, 'FAIL', {
    note: reason,
    now: '2026-04-20T16:57:00.000Z',
  });
  statusStoreMod.saveStatus(config, moduleDir, status, failTransition);

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
  
  const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
  const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const registry = withStubbedGeneratorStages(await buildBuiltInRegistry(pipelineRuntimeRoot));
  
    const discordCalls = [];
    const sessionKey = 'agent:main:acp:single-module-01';
        const deps = {
        pipelineRunner: {
          discord: async (...args) => { discordCalls.push(args); },
          runModule: async () => makeStepResult({
            stepId: '01',
            exit: 10,
            reason: 'Forge fix needs Nova guidance',
            projection: {
              fail_count: 3,
              attempt: 3,
              dispatch_id: 'dispatch-single-module-01-attempt-3',
              module_status: { session_key: sessionKey },
            },
            correlation: {
              module_id: '01',
              attempt: 3,
              dispatch_id: 'dispatch-single-module-01-attempt-3',
              session_key: sessionKey,
            },
          }),
          injectNeedsNova: async () => {},
          writeSummary: () => {},
        },
      };
const config = {
      project: 'behavior-single-module-halt',
      paths: {
        swarm_dir: '/tmp/behavior-single-module-halt/swarm',
        modules_dir: '/tmp/behavior-single-module-halt/modules',
      },
      telemetry: { enabled: true },
      pluginRegistry: registry,
      _runId: 'run-single-module-halt-1',
      run_id: 'run-single-module-halt-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
          };
  
    const progress = {
      execution_order: ['01'],
      modules: { '01': { title: 'Scaffold', dir: '01-scaffold' } },
      gates: {},
    };
  
    const result = await pipelineRunnerMod.runPipeline(config, progress, { deps, module: '01' }, { deps });
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
    assert.equal(events[1].gateway_label, null);
    assert.equal(events[1].fail_count, 3);
    assert.equal(events[1].last_failure, 'Forge fix needs Nova guidance');
    assert.equal(events[1].action, 'NEEDS_NOVA');
    assert.equal(events[1].exit_code, 10);
    assert.equal(events[2].reason, 'NEEDS_NOVA');
    assert.equal(events[2].module_id, '01');
    assert.equal(events[2].session_key, sessionKey);
    assert.equal(events[2].attempt, 3);
    assert.equal(events[2].dispatch_id, 'dispatch-single-module-01-attempt-3');
    assert.equal(events[2].gateway_label, null);
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

  await record('single-module typed step results own halt semantics without raw exit fallback', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = withStubbedGeneratorStages(await buildBuiltInRegistry(pipelineRuntimeRoot));

    const outputs = [];
    const injectNeedsNovaCalls = [];
    const sessionKey = 'agent:main:acp:single-module-typed-step';
    const dispatchId = 'dispatch-single-module-typed-step-5';
        const configDeps2 = {
        pipelineRunner: {
          discord: async () => {},
          output: (payload) => { outputs.push(payload); },
          runModule: async () => ({
            schemaVersion: 'v1',
            kind: 'pipeline_step_result',
            stepType: 'module',
            stepId: '01',
            nextAction: 'halt',
            outcome: 'needs_nova',
            issueType: 'code',
            diagnostics: {
              summary: 'Typed module halt requires Nova',
              findings: [],
              metadata: {},
              typed: {},
            },
            correlation: {
              run_id: 'run-single-module-typed-step-1',
              module_id: '01',
              attempt: 5,
              dispatch_id: dispatchId,
              gateway_label: dispatchId,
              session_key: sessionKey,
            },
            terminal: {
              exitCode: 10,
              exitLabel: 'NEEDS_NOVA',
            },
          }),
          injectNeedsNova: async (...args) => { injectNeedsNovaCalls.push(args); },
          writeSummary: () => {},
        },
      };
const config = {
      project: 'behavior-single-module-typed-step',
      paths: {
        swarm_dir: '/tmp/behavior-single-module-typed-step/swarm',
        modules_dir: '/tmp/behavior-single-module-typed-step/modules',
      },
      telemetry: { enabled: true },
      pluginRegistry: registry,
      _runId: 'run-single-module-typed-step-1',
      run_id: 'run-single-module-typed-step-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-25T00:00:00.000Z'),
          };

    const progress = {
      execution_order: ['01'],
      modules: { '01': { title: 'Scaffold', dir: '01-scaffold' } },
      gates: {},
    };

    const result = await pipelineRunnerMod.runPipeline(config, progress, { deps: configDeps2, module: '01' }, { deps: configDeps2 });
    await flushAsync();

    assert.equal(result, 10);
    assert.equal(outputs.length, 1);
    assert.equal(outputs[0].exit, 10);
    assert.equal(outputs[0].outcome, 'needs_nova');
    assert.equal(outputs[0].next_action, 'halt');
    assert.equal(outputs[0].attempt, 5);
    assert.equal(outputs[0].dispatch_id, dispatchId);
    assert.equal(outputs[0].gateway_label, dispatchId);
    assert.equal(outputs[0].session_key, sessionKey);
    assert.equal(injectNeedsNovaCalls.length, 1);
    assert.equal(injectNeedsNovaCalls[0][1].exit, 10);
    assert.equal(injectNeedsNovaCalls[0][1].attempt, 5);
    assert.equal(injectNeedsNovaCalls[0][1].dispatch_id, dispatchId);
    assert.equal(injectNeedsNovaCalls[0][1].session_key, sessionKey);

    const streamKey = 'pipeline:telemetry:behavior-single-module-typed-step:run-single-module-typed-step-1';
    const events = xaddEvents(streamKey);
    assert.deepEqual(events.map((event) => event.type), ['pipeline.started', 'error.escalation', 'pipeline.halted', 'summary.started', 'summary.completed']);
    assert.equal(events[1].exit_code, 10);
    assert.equal(events[1].attempt, 5);
    assert.equal(events[1].dispatch_id, dispatchId);
    assert.equal(events[2].exit_code, 10);
    assert.equal(events[2].attempt, 5);
    assert.equal(events[2].dispatch_id, dispatchId);
  });

  await record('single-module rate-limited runs emit pipeline halt telemetry without escalation drift', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = withStubbedGeneratorStages(await buildBuiltInRegistry(pipelineRuntimeRoot));

    const discordCalls = [];
    const outputs = [];
    const injectNeedsNovaCalls = [];
    const dispatchId = 'dispatch-single-module-rate-limit-7';
    const sessionKey = 'agent:main:acp:single-module-rate-limit';
        const configDeps3 = {
        pipelineRunner: {
          discord: async (...args) => { discordCalls.push(args); },
          output: (payload) => { outputs.push(payload); },
          runModule: async () => makeStepResult({
            stepId: '01',
            exit: 40,
            reason: 'Rate limit pauses exceeded maximum during Buster phase',
            projection: {
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
            },
            correlation: {
              module_id: '01',
              attempt: 7,
              dispatch_id: dispatchId,
              gateway_label: dispatchId,
              session_key: sessionKey,
            },
          }),
          injectNeedsNova: async (...args) => { injectNeedsNovaCalls.push(args); },
          writeSummary: () => {},
        },
      };
const config = {
      project: 'behavior-single-module-rate-limited',
      paths: {
        swarm_dir: '/tmp/behavior-single-module-rate-limited/swarm',
        modules_dir: '/tmp/behavior-single-module-rate-limited/modules',
      },
      telemetry: { enabled: true },
      pluginRegistry: registry,
      _runId: 'run-single-module-rate-limited-1',
      run_id: 'run-single-module-rate-limited-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-16T00:00:00.000Z'),
          };

    const progress = {
      execution_order: ['01'],
      modules: { '01': { title: 'Scaffold', dir: '01-scaffold' } },
      gates: {},
    };

    const result = await pipelineRunnerMod.runPipeline(config, progress, { deps: configDeps3, module: '01' }, { deps: configDeps3 });
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
    assert.equal(events[1].rate_limit_exhausted, true);
    assert.equal(events[1].max_rate_limit_pauses, 4);
    assert.equal(events[2].summary_type, 'pipeline');
    assert.equal(events[2].exit_code, 40);
    assert.equal(events[2].exit_reason, 'RATE_LIMITED:01');
    assert.equal(events[3].summary_type, 'pipeline');
    assert.equal(events[3].status, 'failed');
    assert.equal(events[3].exit_code, 40);
    assert.equal(events[3].exit_reason, 'RATE_LIMITED:01');

    const haltDiscordCall = discordCalls.find(([, , title]) => title === 'Pipeline halted: behavior-single-module-rate-limited');
    assert.equal(Boolean(haltDiscordCall), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Module' && field.value === '01'), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Attempt' && field.value === '7'), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Dispatch' && field.value === dispatchId), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Gateway Label' && field.value === dispatchId), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Session' && field.value === sessionKey), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Rate Limit Pauses' && field.value === '4'), true);
  });

  await record('single-module pipeline halts keep status correlation as provenance only', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const pathsMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/paths.ts');
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
        const configDeps4 = {
        pipelineRunner: {
          discord: async (...args) => { discordCalls.push(args); },
          output: (payload) => { outputs.push(payload); },
          runModule: async () => makeStepResult({
            stepId: '01',
            exit: 10,
            reason: 'Forge fix still needs Nova guidance',
            projection: { fail_count: 3 },
            correlation: { module_id: '01' },
          }),
          injectNeedsNova: async (...args) => { injectNeedsNovaCalls.push(args); },
          writeSummary: () => {},
        },
      };
const config = {
      project: 'behavior-single-module-failcount-halt',
      repo_root: repoRoot,
      paths: {
        swarm_dir: swarmDir,
        modules_dir: modulesDir,
      },
      telemetry: { enabled: true },
      pluginRegistry: registry,
      _runId: 'run-single-module-failcount-halt-1',
      run_id: 'run-single-module-failcount-halt-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
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

    const result = await pipelineRunnerMod.runPipeline(config, progress, { deps: configDeps4, module: '01' }, { deps: configDeps4 });
    await flushAsync();

    assert.equal(result, 10);

    const streamKey = 'pipeline:telemetry:behavior-single-module-failcount-halt:run-single-module-failcount-halt-1';
    const events = xaddEvents(streamKey);
    assert.deepEqual(events.map((event) => event.type), ['pipeline.started', 'error.escalation', 'pipeline.halted', 'summary.started', 'summary.completed']);
    assert.equal(events[1].attempt, null);
    assert.equal(events[1].dispatch_id, null);
    assert.equal(events[1].session_key, null);
    assert.equal(events[1].gateway_label, null);
    assert.equal(events[2].attempt, null);
    assert.equal(events[2].dispatch_id, null);
    assert.equal(events[2].session_key, null);
    assert.equal(events[2].gateway_label, null);

    const statusProvenanceOutput = outputs.find((payload) => payload?.correlation_provenance?.dispatch_id === 'dispatch-single-module-failcount-01-attempt-3' && payload?.correlation_provenance?.gateway_label === 'dispatch-single-module-failcount-01-attempt-3' && payload?.correlation_provenance?.session_key === sessionKey);
    assert(statusProvenanceOutput, 'status identity should remain available as diagnostic provenance');
    assert.equal(statusProvenanceOutput.attempt, null);
    assert.equal(statusProvenanceOutput.dispatch_id, null);
    assert.equal(statusProvenanceOutput.gateway_label, null);
    assert.equal(statusProvenanceOutput.session_key, null);
    assert.equal(injectNeedsNovaCalls.length, 1);
    assert.equal(injectNeedsNovaCalls[0][1]?.attempt, null);
    assert.equal(injectNeedsNovaCalls[0][1]?.dispatch_id, null);
    assert.equal(injectNeedsNovaCalls[0][1]?.gateway_label, null);
    assert.equal(injectNeedsNovaCalls[0][1]?.session_key, null);
    assert.equal(injectNeedsNovaCalls[0][1]?.correlation_provenance?.dispatch_id, 'dispatch-single-module-failcount-01-attempt-3');
    assert.equal(injectNeedsNovaCalls[0][1]?.correlation_provenance?.session_key, sessionKey);

    const haltDiscordCall = discordCalls.find(([, , title]) => title === 'Pipeline halted: behavior-single-module-failcount-halt');
    assert.equal(Boolean(haltDiscordCall), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Attempt' && field.value === '3'), false);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Dispatch' && field.value === 'dispatch-single-module-failcount-01-attempt-3'), false);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Session' && field.value === sessionKey), false);
  });

  await record('full-pipeline module halts keep status correlation as provenance only', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const pathsMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/paths.ts');
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
        const configDeps5 = {
        pipelineRunner: {
          discord: async (...args) => { discordCalls.push(args); },
          output: (payload) => { outputs.push(payload); },
          releaseGateFiles: async () => {},
          syncControlFiles: async () => {},
          runModule: async () => makeStepResult({
            stepId: '01',
            exit: 10,
            reason: 'Forge fix still needs Nova guidance',
            projection: { fail_count: 3 },
            correlation: { module_id: '01' },
          }),
          injectNeedsNova: async (...args) => { injectNeedsNovaCalls.push(args); },
          writeSummary: () => {},
        },
      };
const config = {
      project: 'behavior-full-pipeline-failcount-halt',
      repo_root: repoRoot,
      paths: {
        swarm_dir: swarmDir,
        modules_dir: modulesDir,
      },
      telemetry: { enabled: true },
      pluginRegistry: registry,
      _runId: 'run-full-pipeline-failcount-halt-1',
      run_id: 'run-full-pipeline-failcount-halt-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
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

    const result = await pipelineRunnerMod.runPipeline(config, progress, { deps: configDeps5, skipArchValidation: true }, { deps: configDeps5 });
    await flushAsync();

    assert.equal(result, 10);
    const provenanceOutput = outputs.find((payload) => payload?.correlation_provenance?.dispatch_id === 'dispatch-full-pipeline-failcount-01-attempt-3' && payload?.correlation_provenance?.gateway_label === 'dispatch-full-pipeline-failcount-01-attempt-3' && payload?.correlation_provenance?.session_key === sessionKey);
    assert(provenanceOutput, 'status identity should remain available as diagnostic provenance');
    assert.equal(provenanceOutput.attempt, null);
    assert.equal(provenanceOutput.dispatch_id, null);
    assert.equal(provenanceOutput.gateway_label, null);
    assert.equal(provenanceOutput.session_key, null);
    assert.equal(injectNeedsNovaCalls.length, 1);
    assert.equal(injectNeedsNovaCalls[0][1]?.attempt, null);
    assert.equal(injectNeedsNovaCalls[0][1]?.dispatch_id, null);
    assert.equal(injectNeedsNovaCalls[0][1]?.gateway_label, null);
    assert.equal(injectNeedsNovaCalls[0][1]?.session_key, null);
    assert.equal(injectNeedsNovaCalls[0][1]?.correlation_provenance?.dispatch_id, 'dispatch-full-pipeline-failcount-01-attempt-3');
    assert.equal(injectNeedsNovaCalls[0][1]?.correlation_provenance?.session_key, sessionKey);

    const streamKey = 'pipeline:telemetry:behavior-full-pipeline-failcount-halt:run-full-pipeline-failcount-halt-1';
    const events = xaddEvents(streamKey);
    const escalationEvent = events.find((event) => event.type === 'error.escalation');
    const haltedEvent = events.find((event) => event.type === 'pipeline.halted');
    assert(escalationEvent, 'missing full-pipeline failcount escalation event');
    assert(haltedEvent, 'missing full-pipeline failcount halted event');
    assert.equal(escalationEvent.attempt, null);
    assert.equal(escalationEvent.dispatch_id, null);
    assert.equal(escalationEvent.session_key, null);
    assert.equal(escalationEvent.gateway_label, null);
    assert.equal(haltedEvent.attempt, null);
    assert.equal(haltedEvent.dispatch_id, null);
    assert.equal(haltedEvent.session_key, null);
    assert.equal(haltedEvent.gateway_label, null);

    const haltDiscordCall = discordCalls.find(([, , title]) => title === 'Pipeline halted: behavior-full-pipeline-failcount-halt');
    assert.equal(Boolean(haltDiscordCall), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Attempt' && field.value === '3'), false);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Dispatch' && field.value === 'dispatch-full-pipeline-failcount-01-attempt-3'), false);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Session' && field.value === sessionKey), false);
  });

  await record('single-module blocked runs expose persisted module identity as provenance only', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const pathsMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/paths.ts');
    const registry = withStubbedGeneratorStages(await buildBuiltInRegistry(pipelineRuntimeRoot));
  
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-single-module-blocked-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    const modulesDir = path.join(swarmDir, 'modules');
    const moduleDir = path.join(modulesDir, '01-scaffold');
    fs.mkdirSync(moduleDir, { recursive: true });
  
    const discordCalls = [];
    let injectNeedsNovaCalls = 0;
    const sessionKey = 'agent:main:acp:single-module-blocked-01';
        const configDeps6 = {
        pipelineRunner: {
          discord: async (...args) => { discordCalls.push(args); },
          injectNeedsNova: async () => { injectNeedsNovaCalls++; },
          writeSummary: () => {},
        },
      };
const config = {
      project: 'behavior-single-module-blocked',
      repo_root: repoRoot,
      paths: {
        swarm_dir: swarmDir,
        modules_dir: modulesDir,
      },
      telemetry: { enabled: true },
      pluginRegistry: registry,
      _runId: 'run-single-module-blocked-1',
      run_id: 'run-single-module-blocked-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
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

    const result = await pipelineRunnerMod.runPipeline(config, progress, { deps: configDeps6, module: '01' }, { deps: configDeps6 });
    await flushAsync();
  
    assert.equal(result, 20);
    assert.equal(injectNeedsNovaCalls, 0);
  
    const streamKey = 'pipeline:telemetry:behavior-single-module-blocked:run-single-module-blocked-1';
    const events = xaddEvents(streamKey);
    assert.deepEqual(events.map((event) => event.type), ['pipeline.started', 'error.escalation', 'pipeline.halted', 'summary.started', 'summary.completed']);
    assert.equal(events[1].module_id, '01');
    assert.equal(events[1].gate_id, null);
    assert.equal(events[1].session_key, null);
    assert.equal(events[1].attempt, null);
    assert.equal(events[1].dispatch_id, null);
    assert.equal(events[1].gateway_label, null);
    assert.equal(events[1].fail_count, 3);
    assert.equal(events[1].last_failure, 'Repeated test crashes exhausted the retry budget');
    assert.equal(events[1].action, 'BLOCKED');
    assert.equal(events[1].exit_code, 20);
    assert.equal(events[2].reason, 'BLOCKED');
    assert.equal(events[2].module_id, '01');
    assert.equal(events[2].session_key, null);
    assert.equal(events[2].attempt, null);
    assert.equal(events[2].dispatch_id, null);
    assert.equal(events[2].gateway_label, null);
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
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Attempt' && field.value === '3'), false);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Dispatch' && field.value === 'buster-dispatch-01-attempt-3'), false);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Session' && field.value === sessionKey), false);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Reason' && field.value === 'Repeated test crashes exhausted the retry budget'), true);
  });
  
  await record('full-pipeline blocked runs keep persisted module identity as provenance only', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const pathsMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/paths.ts');
    const registry = withStubbedGeneratorStages(await buildBuiltInRegistry(pipelineRuntimeRoot));
  
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-full-pipeline-blocked-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    const modulesDir = path.join(swarmDir, 'modules');
    const moduleDir = path.join(modulesDir, '01-scaffold');
    fs.mkdirSync(moduleDir, { recursive: true });
  
    const discordCalls = [];
    const outputs = [];
    const sessionKey = 'agent:main:acp:full-pipeline-blocked-01';
        const configDeps7 = {
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
      };
const config = {
      project: 'behavior-full-pipeline-blocked',
      repo_root: repoRoot,
      paths: {
        swarm_dir: swarmDir,
        modules_dir: modulesDir,
      },
      telemetry: { enabled: true },
      pluginRegistry: registry,
      _runId: 'run-full-pipeline-blocked-1',
      run_id: 'run-full-pipeline-blocked-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
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

    const result = await pipelineRunnerMod.runPipeline(config, progress, { deps: configDeps7, skipArchValidation: true }, { deps: configDeps7 });
    await flushAsync();
  
    assert.equal(result, 20);
    const blockedOutput = outputs.find((payload) => payload?.exit === 20);
    assert(blockedOutput, 'missing blocked output payload');
    assert.equal(blockedOutput.session_key, null);
    assert.equal(blockedOutput.dispatch_id, null);
    assert.equal(blockedOutput.gateway_label, null);
    assert.equal(blockedOutput.attempt, null);
    assert.equal(blockedOutput.correlation_provenance?.session_key, sessionKey);
    assert.equal(blockedOutput.correlation_provenance?.dispatch_id, 'buster-dispatch-full-01-attempt-3');
  
    const streamKey = 'pipeline:telemetry:behavior-full-pipeline-blocked:run-full-pipeline-blocked-1';
    const events = xaddEvents(streamKey);
    assert.deepEqual(events.map((event) => event.type).sort(), ['error.escalation', 'pipeline.halted', 'pipeline.started', 'summary.completed', 'summary.started']);
    const escalationEvent = events.find((event) => event.type === 'error.escalation');
    const haltedEvent = events.find((event) => event.type === 'pipeline.halted');
    assert(escalationEvent, 'missing full-pipeline blocked escalation event');
    assert(haltedEvent, 'missing full-pipeline blocked halt event');
    assert.equal(escalationEvent.module_id, '01');
    assert.equal(escalationEvent.session_key, null);
    assert.equal(escalationEvent.attempt, null);
    assert.equal(escalationEvent.dispatch_id, null);
    assert.equal(escalationEvent.gateway_label, null);
    assert.equal(escalationEvent.fail_count, 3);
    assert.equal(escalationEvent.last_failure, 'Repeated test crashes exhausted the retry budget');
    assert.equal(escalationEvent.action, 'BLOCKED');
    assert.equal(haltedEvent.module_id, '01');
    assert.equal(haltedEvent.session_key, null);
    assert.equal(haltedEvent.attempt, null);
    assert.equal(haltedEvent.dispatch_id, null);
    assert.equal(haltedEvent.gateway_label, null);
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
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Attempt' && field.value === '3'), false);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Dispatch' && field.value === 'buster-dispatch-full-01-attempt-3'), false);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Session' && field.value === sessionKey), false);
  });

  await record('fresh full-pipeline EXIT_BLOCKED uses the same terminal halt finalizer as resumed BLOCKED state', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(pipelineRuntimeRoot);
    const generatorCalls = [];
    const projectSummaryStage = registry.stageOwners['generator.run']['generator:project_summary'];
    const testRegistry = {
      ...registry,
      stageOwners: {
        ...registry.stageOwners,
        'generator.run': {
          ...registry.stageOwners['generator.run'],
          'generator:project_summary': {
            ...projectSummaryStage,
            implementation: {
              run: async ({ input }) => {
                generatorCalls.push({ stageId: 'generator:project_summary', input });
                return { schemaVersion: 'v1', producerKind: 'generator', producerType: 'project_summary', outputs: { status: 'ok' } };
              },
            },
          },
        },
      },
    };

    const outputs = [];
    const injectNeedsNovaCalls = [];
    const sessionKey = 'agent:main:acp:fresh-blocked-01';
    const dispatchId = 'dispatch-fresh-blocked-01-attempt-3';
        const configDeps8 = {
        pipelineRunner: {
          discord: async () => {},
          output: (payload) => { outputs.push(payload); },
          writeSummary: () => {},
          injectNeedsNova: async (...args) => { injectNeedsNovaCalls.push(args); },
          runModule: async () => ({
            schemaVersion: 'v1',
            kind: 'pipeline_step_result',
            stepType: 'module',
            stepId: '01',
            nextAction: 'halt',
            outcome: 'blocked',
            issueType: 'policy',
            diagnostics: {
              summary: 'Buster crash retries exhausted after 2 attempts',
              findings: [],
              metadata: {
                reason: 'Buster crash retries exhausted after 2 attempts',
                fail_count: 3,
              },
              typed: {},
            },
            correlation: {
              run_id: 'run-fresh-blocked-finalizer-1',
              module_id: '01',
              attempt: 3,
              dispatch_id: dispatchId,
              gateway_label: dispatchId,
              session_key: sessionKey,
            },
            terminal: {
              exitCode: 20,
              exitLabel: 'BLOCKED',
            },
          }),
        },
      };
const config = {
      project: 'behavior-fresh-blocked-finalizer',
      paths: {
        swarm_dir: '/tmp/behavior-fresh-blocked-finalizer/swarm',
        modules_dir: '/tmp/behavior-fresh-blocked-finalizer/modules',
      },
      telemetry: { enabled: true },
      pluginRegistry: testRegistry,
      _runId: 'run-fresh-blocked-finalizer-1',
      run_id: 'run-fresh-blocked-finalizer-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-26T00:00:00.000Z'),
          };

    const progress = {
      execution_order: ['01'],
      modules: { '01': { title: 'Scaffold', dir: '01-scaffold' } },
      gates: {},
    };

    const result = await pipelineRunnerMod.runPipeline(config, progress, { deps: configDeps8, skipArchValidation: true }, { deps: configDeps8 });
    await flushAsync();

    assert.equal(result, 20);
    assert.equal(injectNeedsNovaCalls.length, 0, 'fresh BLOCKED should not inject NEEDS_NOVA');
    assert.equal(outputs.length, 1);
    assert.equal(outputs[0].exit, 20);
    assert.equal(outputs[0].attempt, 3);
    assert.equal(outputs[0].dispatch_id, dispatchId);
    assert.equal(outputs[0].session_key, sessionKey);

    const streamKey = 'pipeline:telemetry:behavior-fresh-blocked-finalizer:run-fresh-blocked-finalizer-1';
    const events = xaddEvents(streamKey);
    assert.deepEqual(events.map((event) => event.type), ['pipeline.started', 'error.escalation', 'pipeline.halted', 'summary.started', 'summary.completed']);
    assert.equal(events[1].module_id, '01');
    assert.equal(events[1].action, 'BLOCKED');
    assert.equal(events[1].exit_code, 20);
    assert.equal(events[1].attempt, 3);
    assert.equal(events[1].dispatch_id, dispatchId);
    assert.equal(events[1].session_key, sessionKey);
    assert.equal(events[2].reason, 'BLOCKED');
    assert.equal(events[2].exit_code, 20);
    assert.equal(events[3].exit_reason, 'BLOCKED:01');
    assert.equal(events[4].exit_reason, 'BLOCKED:01');
    assert.deepEqual(generatorCalls.map((call) => call.stageId), ['generator:project_summary']);
    assert.equal(generatorCalls[0].input.executionContext.exitCode, 20);
    assert.equal(generatorCalls[0].input.executionContext.exitReason, 'BLOCKED:01');
    assert.equal(generatorCalls[0].input.ids.moduleId, '01');
  });
  
  await record('full pipeline missing gate registries fail authoritatively instead of crashing before dispatch telemetry', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(pipelineRuntimeRoot);
    const discordCalls = [];
    const outputs = [];
    const swarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-gate-registry-pipeline-'));
    const logDir = path.join(swarmDir, 'logs');
    const runLogDir = path.join(logDir, 'pipeline', 'runs', 'run-gate-registry-pipeline-1');
    fs.mkdirSync(runLogDir, { recursive: true });
  
        const configDeps9 = {
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
      };
const config = {
      project: 'behavior-gate-registry-pipeline',
      paths: {
        swarm_dir: swarmDir,
        modules_dir: path.join(swarmDir, 'modules'),
      },
      telemetry: { enabled: true },
      pluginRegistry: registry,
      _runId: 'run-gate-registry-pipeline-1',
      run_id: 'run-gate-registry-pipeline-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
          };
  
    const progress = {
      execution_order: ['gate:missing'],
      modules: {},
    };
  
    const result = await pipelineRunnerMod.runPipeline(config, progress, { deps: configDeps9, skipArchValidation: true }, { deps: configDeps9 });
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
  
    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = withStubbedGeneratorStages(await buildBuiltInRegistry(pipelineRuntimeRoot));
    const discordCalls = [];
    const outputs = [];
    const injectNeedsNovaCalls = [];
    const sessionKey = 'agent:main:acp:gate-review-stop-1';
    const root = '/tmp/behavior-pipeline-gate-type-stop';
    const swarmDir = `${root}/.swarm`;
    const logDir = `${swarmDir}/logs`;
  
        const configDeps10 = {
        pipelineRunner: {
          discord: async (...args) => { discordCalls.push(args); },
          output: (payload) => { outputs.push(payload); },
          releaseGateFiles: async () => {},
          syncControlFiles: async () => {},
          writeSummary: () => {},
          injectNeedsNova: async (...args) => { injectNeedsNovaCalls.push(args); },
          runGate: async () => makeStepResult({
            stepType: 'gate',
            stepId: 'review',
            exit: 10,
            reason: 'Review gate needs Nova guidance',
            projection: {
              gate: 'review',
              gate_id: 'review',
              gate_type: 'review',
              fail_count: 3,
              attempt: 2,
              dispatch_id: 'review-dispatch-2',
              session_key: sessionKey,
            },
            correlation: {
              gate_id: 'review',
              gate_type: 'review',
              attempt: 2,
              dispatch_id: 'review-dispatch-2',
              session_key: sessionKey,
            },
          }),
        },
      };
const config = {
      project: 'behavior-pipeline-gate-type-stop',
      paths: {
        swarm_dir: swarmDir,
        modules_dir: `${root}/modules`,
      },
      telemetry: { enabled: true },
      pluginRegistry: registry,
      _runId: 'run-pipeline-gate-type-stop-1',
      run_id: 'run-pipeline-gate-type-stop-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
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
  
    const result = await pipelineRunnerMod.runPipeline(config, progress, { deps: configDeps10, skipArchValidation: true }, { deps: configDeps10 });
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
    assert.equal(events[1].gateway_label, null);
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
    assert.equal(events[2].gateway_label, null);
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

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = withStubbedGeneratorStages(await buildBuiltInRegistry(pipelineRuntimeRoot));

    const discordCalls = [];
    const outputs = [];
    const injectNeedsNovaCalls = [];
    const dispatchId = 'review-dispatch-rate-limit-2';
    const sessionKey = 'agent:main:acp:review-rate-limit';
    const root = '/tmp/behavior-pipeline-gate-rate-limited';
    const swarmDir = `${root}/swarm`;
    const logDir = `${swarmDir}/logs`;

        const configDeps11 = {
        pipelineRunner: {
          discord: async (...args) => { discordCalls.push(args); },
          output: (payload) => { outputs.push(payload); },
          releaseGateFiles: async () => {},
          syncControlFiles: async () => {},
          writeSummary: () => {},
          injectNeedsNova: async (...args) => { injectNeedsNovaCalls.push(args); },
          runGate: async () => makeStepResult({
            stepType: 'gate',
            stepId: 'review',
            exit: 40,
            reason: 'Review gate exceeded max rate limit pauses',
            projection: {
              gate: 'review',
              gate_id: 'review',
              gate_type: 'review',
              attempt: 2,
              dispatch_id: dispatchId,
              gateway_label: dispatchId,
              session_key: sessionKey,
              rate_limit_exhausted: true,
              max_rate_limit_pauses: 2,
            },
            correlation: {
              gate_id: 'review',
              gate_type: 'review',
              attempt: 2,
              dispatch_id: dispatchId,
              gateway_label: dispatchId,
              session_key: sessionKey,
            },
          }),
        },
      };
const config = {
      project: 'behavior-pipeline-gate-rate-limited',
      paths: {
        swarm_dir: swarmDir,
        modules_dir: `${root}/modules`,
      },
      telemetry: { enabled: true },
      pluginRegistry: registry,
      _runId: 'run-pipeline-gate-rate-limited-1',
      run_id: 'run-pipeline-gate-rate-limited-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-16T00:00:00.000Z'),
          };

    const progress = {
      execution_order: ['gate:review'],
      modules: {},
      gates: {
        review: { type: 'review', title: 'Review Gate' },
      },
    };

    const result = await pipelineRunnerMod.runPipeline(config, progress, { deps: configDeps11, skipArchValidation: true }, { deps: configDeps11 });
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
    assert.equal(events[1].rate_limit_exhausted, true);
    assert.equal(events[1].max_rate_limit_pauses, 2);
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
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Gateway Label' && field.value === dispatchId), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Session' && field.value === sessionKey), true);
    assert.equal(haltDiscordCall[4].some((field) => field.name === 'Rate Limit Pauses' && field.value === '2'), true);
  });
  
  await record('architecture validation blocks emit step-scoped pipeline halt and escalation telemetry', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
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
  
        const configDeps12 = {
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
      };
const config = {
      project: 'behavior-arch-validation-block',
      paths: {
        swarm_dir: '/tmp/behavior-arch-validation-block/swarm',
        modules_dir: '/tmp/behavior-arch-validation-block/modules',
      },
      telemetry: { enabled: true },
      _runId: 'run-arch-validation-block-1',
      run_id: 'run-arch-validation-block-1',
      pluginRegistry: testRegistry,
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
          };
  
    const progress = {
      execution_order: ['01'],
      modules: { '01': { title: 'Scaffold', dir: '01-scaffold' } },
      gates: {},
    };
  
    const result = await pipelineRunnerMod.runPipeline(config, progress, { deps: configDeps12 });
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

  await record('mandatory full_lint runs before review gate dispatch', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = withStubbedGeneratorStages(await buildBuiltInRegistry(pipelineRuntimeRoot));
    const validatorCalls = [];
    const testRegistry = {
      ...registry,
      stageOwners: {
        ...registry.stageOwners,
        'validator.run': {
          ...registry.stageOwners['validator.run'],
          'validator:full_lint': {
            ...registry.stageOwners['validator.run']['validator:full_lint'],
            implementation: {
              run: async ({ input }) => {
                validatorCalls.push(input);
                return {
                  schemaVersion: 'v1',
                  producerKind: 'validator',
                  producerType: 'full_lint',
                  nextAction: 'pass',
                  diagnostics: {
                    summary: 'Full lint passed',
                    typed: { validator: { outcomeClass: 'passed' } },
                  },
                };
              },
            },
          },
        },
      },
    };

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-full-lint-before-review-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    fs.mkdirSync(swarmDir, { recursive: true });
        const configDeps13 = {
        pipelineRunner: {
          discord: async () => {},
          output: () => {},
          releaseGateFiles: async () => {},
          syncControlFiles: async () => {},
          writeSummary: () => {},
          runGate: async (_config, _progress, gateId) => {
            assert.equal(validatorCalls.length, 1, 'review gate must not dispatch before full_lint passes');
            fs.writeFileSync(path.join(swarmDir, 'review-output.json'), JSON.stringify({ status: 'GO' }));
            return makeStepResult({
              stepType: 'gate',
              stepId: gateId,
              exit: 0,
              status: 'PASS',
              projection: { gate: gateId, gate_id: gateId, gate_type: 'review' },
              correlation: { gate_id: gateId, gate_type: 'review' },
            });
          },
        },
      };
const config = {
      project: 'behavior-full-lint-before-review',
      paths: { swarm_dir: swarmDir, modules_dir: path.join(repoRoot, 'modules') },
      telemetry: { enabled: true },
      _runId: 'run-full-lint-before-review-1',
      run_id: 'run-full-lint-before-review-1',
      pluginRegistry: testRegistry,
      _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
          };

    const progress = {
      execution_order: ['gate:review'],
      modules: {},
      gates: {
        review: {
          type: 'review',
          title: 'Review Gate',
          output_file: 'review-output.json',
          lint_tier: 'full',
        },
      },
    };

    const result = await pipelineRunnerMod.runPipeline(config, progress, { deps: configDeps13, skipArchValidation: true }, { deps: configDeps13 });
    await flushAsync();

    assert.equal(result, 0);
    assert.equal(validatorCalls.length, 1);
    assert.equal(validatorCalls[0].ids.stageId, 'validator:full_lint');
    assert.equal(validatorCalls[0].ids.scope, 'pipeline');
    assert.equal(validatorCalls[0].validator.config.tier, 'full');
  });

  await record('mandatory full_lint request_fix halts before review gate dispatch', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = withStubbedGeneratorStages(await buildBuiltInRegistry(pipelineRuntimeRoot));
    const testRegistry = {
      ...registry,
      stageOwners: {
        ...registry.stageOwners,
        'validator.run': {
          ...registry.stageOwners['validator.run'],
          'validator:full_lint': {
            ...registry.stageOwners['validator.run']['validator:full_lint'],
            implementation: {
              run: async () => ({
                schemaVersion: 'v1',
                producerKind: 'validator',
                producerType: 'full_lint',
                nextAction: 'request_fix',
                issueType: 'code',
                diagnostics: {
                  summary: 'Full lint found 2 error(s)',
                  findings: [{ code: 'lint.error', severity: 'error', message: 'fix lint' }],
                  typed: { validator: { outcomeClass: 'fix_requested' } },
                },
              }),
            },
          },
        },
      },
    };

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-full-lint-request-fix-'));
        const configDeps14 = {
        pipelineRunner: {
          discord: async () => {},
          output: () => {},
          injectNeedsNova: async () => {},
          releaseGateFiles: async () => {},
          syncControlFiles: async () => {},
          writeSummary: () => {},
          runGate: async () => {
            throw new Error('review gate should not dispatch when mandatory full_lint requests a fix');
          },
        },
      };
const config = {
      project: 'behavior-full-lint-request-fix',
      paths: { swarm_dir: path.join(repoRoot, '.swarm'), modules_dir: path.join(repoRoot, 'modules') },
      telemetry: { enabled: true },
      _runId: 'run-full-lint-request-fix-1',
      run_id: 'run-full-lint-request-fix-1',
      pluginRegistry: testRegistry,
      _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
          };

    const progress = {
      execution_order: ['gate:review'],
      modules: {},
      gates: { review: { type: 'review', title: 'Review Gate', output_file: 'review-output.json' } },
    };

    const result = await pipelineRunnerMod.runPipeline(config, progress, { deps: configDeps14, skipArchValidation: true }, { deps: configDeps14 });
    await flushAsync();

    assert.equal(result, 10);
    const streamKey = 'pipeline:telemetry:behavior-full-lint-request-fix:run-full-lint-request-fix-1';
    const events = xaddEvents(streamKey);
    const halt = events.find((event) => event.type === 'pipeline.halted');
    assert.equal(halt.step_type, 'validator');
    assert.equal(halt.exit_code, 10);
    assert.equal(halt.reason, 'NEEDS_NOVA');
  });

  await record('progress.json can schedule full_lint after a module', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const statusStoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/services/status-store.ts');
    const lifecycleStateMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/lifecycle-state.ts');
    const registry = withStubbedGeneratorStages(await buildBuiltInRegistry(pipelineRuntimeRoot));
    const validatorCalls = [];
    let moduleRuns = 0;
    const testRegistry = {
      ...registry,
      stageOwners: {
        ...registry.stageOwners,
        'validator.run': {
          ...registry.stageOwners['validator.run'],
          'validator:full_lint': {
            ...registry.stageOwners['validator.run']['validator:full_lint'],
            implementation: {
              run: async ({ input }) => {
                validatorCalls.push(input);
                return {
                  schemaVersion: 'v1',
                  producerKind: 'validator',
                  producerType: 'full_lint',
                  nextAction: 'pass',
                  diagnostics: {
                    summary: 'Scheduled full lint passed',
                    typed: { validator: { outcomeClass: 'passed' } },
                  },
                };
              },
            },
          },
        },
      },
    };

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-scheduled-full-lint-'));
        const configDeps15 = {
        pipelineRunner: {
          discord: async () => {},
          output: () => {},
          releaseGateFiles: async () => {},
          syncControlFiles: async () => {},
          writeSummary: () => {},
          runModule: async (configArg) => {
            moduleRuns += 1;
            if (moduleRuns > 1) throw new Error('module should not rerun after canonical PASS before scheduled full_lint');
            const status = statusStoreMod.loadStatus(configArg, '01-scaffold')
              || statusStoreMod.initStatus('01', { title: 'Scaffold' });
            if (!status.current_phase) {
              const startTransition = lifecycleStateMod.startModulePhase(status, 'forge', 'Scheduled full_lint verifier started module', {
                now: '2026-04-10T00:01:00.000Z',
              });
              statusStoreMod.saveStatus(configArg, '01-scaffold', status, startTransition);
            }
            const passTransition = lifecycleStateMod.transitionModuleStatus(status, 'PASS', {
              agent: 'forge',
              note: 'Scheduled full_lint verifier completed module',
              now: '2026-04-10T00:02:00.000Z',
              completedAt: '2026-04-10T00:02:00.000Z',
            });
            statusStoreMod.saveStatus(configArg, '01-scaffold', status, passTransition);
            return makeStepResult({
              stepId: '01',
              exit: 0,
              reason: 'Module passed before scheduled full_lint',
              status: 'PASS',
              correlation: { module_id: '01', attempt: 1, dispatch_id: 'dispatch-scheduled-full-lint-01-attempt-1' },
            });
          },
        },
      };
const config = {
      project: 'behavior-scheduled-full-lint',
      paths: { swarm_dir: path.join(repoRoot, '.swarm'), modules_dir: path.join(repoRoot, 'modules') },
      telemetry: { enabled: true },
      _runId: 'run-scheduled-full-lint-1',
      run_id: 'run-scheduled-full-lint-1',
      pluginRegistry: testRegistry,
      _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
          };

    const progress = {
      execution_order: ['01'],
      modules: { '01': { title: 'Scaffold', dir: '01-scaffold' } },
      gates: {},
      validators: {
        schedule: [{ stage: 'validator:full_lint', after: 'module:01', scope: 'pipeline', mode: 'mandatory', key: 'lint-after-01' }],
      },
    };

    const result = await pipelineRunnerMod.runPipeline(config, progress, { deps: configDeps15, skipArchValidation: true }, { deps: configDeps15 });
    await flushAsync();

    assert.equal(result, 0);
    assert.equal(moduleRuns, 1);
    assert.equal(validatorCalls.length, 1);
    assert.equal(validatorCalls[0].ids.stageId, 'validator:full_lint');
    assert.equal(validatorCalls[0].ids.scope, 'pipeline');
    assert.equal(validatorCalls[0].executionContext.scheduleKey, 'lint-after-01');
    assert.equal(validatorCalls[0].executionContext.scheduleReason, 'progress_json_after_module:01');

    const completionPath = path.join(path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'runs', config._runId || config.run_id || 'run-unknown'), 'scheduled-validator-completions.json');
    assert.equal(fs.existsSync(completionPath), true, 'scheduled validator completion should be durable');
    const completionState = JSON.parse(fs.readFileSync(completionPath, 'utf8'));
    assert.equal(completionState.completed.some((entry) => entry.key === 'lint-after-01'), true);

    const resumedConfig = {
      ...config,
      _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:10:00.000Z'),
    };
    delete resumedConfig._validatorRunState;
    const resumedResult = await pipelineRunnerMod.runPipeline(resumedConfig, progress, { skipArchValidation: true });
    await flushAsync();

    assert.equal(resumedResult, 0);
    assert.equal(moduleRuns, 1, 'fresh same-run config should not rerun passed module');
    assert.equal(validatorCalls.length, 1, 'fresh same-run config should not rerun completed scheduled validator');
  });

  await record('architecture validation runs through validator stage owners and preserves pass semantics', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
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

        const configDeps16 = {
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
      };
const config = {
      project: 'behavior-arch-validation-pass',
      paths: {
        swarm_dir: '/tmp/behavior-arch-validation-pass/swarm',
        modules_dir: '/tmp/behavior-arch-validation-pass/modules',
      },
      telemetry: { enabled: true },
      _runId: 'run-arch-validation-pass-1',
      run_id: 'run-arch-validation-pass-1',
      pluginRegistry: testRegistry,
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
          };

    const progress = {
      project: 'behavior-arch-validation-pass',
      execution_order: [],
      modules: {},
      gates: {},
    };

    const result = await pipelineRunnerMod.runPipeline(config, progress, { deps: configDeps16 });
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

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
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

        const configDeps17 = {
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
      };
const config = {
      project: 'behavior-arch-validation-error',
      paths: {
        swarm_dir: '/tmp/behavior-arch-validation-error/swarm',
        modules_dir: '/tmp/behavior-arch-validation-error/modules',
      },
      telemetry: { enabled: true },
      _runId: 'run-arch-validation-error-1',
      run_id: 'run-arch-validation-error-1',
      pluginRegistry: testRegistry,
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
          };

    const progress = {
      project: 'behavior-arch-validation-error',
      execution_order: ['01'],
      modules: { '01': { title: 'Scaffold', dir: '01-scaffold' } },
      gates: {},
    };

    const result = await pipelineRunnerMod.runPipeline(config, progress, { deps: configDeps17 });
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

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(pipelineRuntimeRoot);
    const discordCalls = [];
    const outputs = [];

        const configDeps18 = {
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
      };
const config = {
      project: 'behavior-arch-validation-registry-miss',
      paths: {
        swarm_dir: '/tmp/behavior-arch-validation-registry-miss/swarm',
        modules_dir: '/tmp/behavior-arch-validation-registry-miss/modules',
      },
      telemetry: { enabled: true },
      _runId: 'run-arch-validation-registry-miss-1',
      run_id: 'run-arch-validation-registry-miss-1',
      pluginRegistry: {
        ...registry,
        stageOwners: {
          ...registry.stageOwners,
          'validator.run': {},
        },
      },
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
          };

    const progress = {
      project: 'behavior-arch-validation-registry-miss',
      execution_order: ['01'],
      modules: { '01': { title: 'Scaffold', dir: '01-scaffold' } },
      gates: {},
    };

    const result = await pipelineRunnerMod.runPipeline(config, progress, { deps: configDeps18 });
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

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const statusStoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/services/status-store.ts');
    const lifecycleStateMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/lifecycle-state.ts');
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

        const beforeWorkConfigDeps = {
        pipelineRunner: {
          discord: async () => {},
          output: () => {},
          releaseGateFiles: async () => {},
          syncControlFiles: async () => {},
          writeSummary: () => {},
        },
      };
const beforeWorkConfig = {
      project: 'behavior-arch-validation-resume-before-work',
      paths: {
        swarm_dir: '/tmp/behavior-arch-validation-resume-before-work/swarm',
        modules_dir: '/tmp/behavior-arch-validation-resume-before-work/modules',
      },
      telemetry: { enabled: true },
      _runId: 'run-arch-validation-resume-before-work-1',
      run_id: 'run-arch-validation-resume-before-work-1',
      pluginRegistry: testRegistry,
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
          };

    const beforeWorkProgress = {
      project: 'behavior-arch-validation-resume-before-work',
      execution_order: [],
      modules: {},
      gates: {},
    };

    const beforeWorkResult = await pipelineRunnerMod.runPipeline(beforeWorkConfig, beforeWorkProgress, { resume: true, deps: beforeWorkConfigDeps });
    await flushAsync();

    assert.equal(beforeWorkResult, 0);
    assert.equal(validatorCalls.length, 1);
    assert.equal(validatorCalls[0].executionContext.resume, true);
    assert.equal(validatorCalls[0].executionContext.hasStartedModules, false);

    const modulesDir = '/tmp/behavior-arch-validation-resume-after-work/modules';
    fs.mkdirSync(path.join(modulesDir, '01-scaffold'), { recursive: true });

        const afterWorkConfigDeps = {
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
              const startTransition = lifecycleStateMod.startModulePhase(status, 'forge', 'Resume-after-work verifier started module', {
                now: '2026-04-09T00:01:30.000Z',
              });
              statusStoreMod.saveStatus(configArg, '01-scaffold', status, startTransition);
            }
            const passTransition = lifecycleStateMod.transitionModuleStatus(status, 'PASS', {
              agent: 'forge',
              note: 'Resume-after-work verifier completed module',
              now: '2026-04-09T00:02:00.000Z',
              completedAt: '2026-04-09T00:02:00.000Z',
            });
            statusStoreMod.saveStatus(configArg, '01-scaffold', status, passTransition);
            return makeStepResult({ stepId: '01', exit: 0, reason: 'PASS', status: 'PASS', correlation: { module_id: '01' } });
          },
        },
      };
const afterWorkConfig = {
      project: 'behavior-arch-validation-resume-after-work',
      paths: {
        swarm_dir: '/tmp/behavior-arch-validation-resume-after-work/swarm',
        modules_dir: '/tmp/behavior-arch-validation-resume-after-work/modules',
      },
      telemetry: { enabled: true },
      _runId: 'run-arch-validation-resume-after-work-1',
      run_id: 'run-arch-validation-resume-after-work-1',
      pluginRegistry: testRegistry,
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
          };

    if (!path.join(afterWorkConfig.paths.swarm_dir, 'logs') && afterWorkConfig?.paths?.swarm_dir) {
      path.join(afterWorkConfig.paths.swarm_dir, 'logs') = path.join(afterWorkConfig.paths.swarm_dir, 'logs');
    }
    fs.mkdirSync(path.join(afterWorkConfig.paths.swarm_dir, 'logs', 'pipeline', 'runs', afterWorkConfig._runId || afterWorkConfig.run_id || 'run-unknown'), { recursive: true });
    const afterWorkStatus = statusStoreMod.initStatus('01', { title: 'Scaffold' });
    const afterWorkStartTransition = lifecycleStateMod.startModulePhase(afterWorkStatus, 'forge', 'Synthetic started module for arch validation resume-after-work verifier', {
      now: '2026-04-09T00:01:00.000Z',
    });
    statusStoreMod.saveStatus(afterWorkConfig, '01-scaffold', afterWorkStatus, afterWorkStartTransition);

    const afterWorkProgress = {
      project: 'behavior-arch-validation-resume-after-work',
      execution_order: ['01'],
      modules: { '01': { title: 'Scaffold', dir: '01-scaffold' } },
      gates: {},
    };

    const afterWorkResult = await pipelineRunnerMod.runPipeline(afterWorkConfig, afterWorkProgress, { resume: true, deps: afterWorkConfigDeps });
    await flushAsync();

    assert.equal(afterWorkResult, 0);
    assert.equal(validatorCalls.length, 1, 'resume after module work started should skip architecture validator');
  });

  await record('built-in architecture validator stage returns control results while report artifacts stay downstream', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    const archValidatorMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/services/arch-validator.ts');

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

    const resultsPath = path.join(path.join(config.paths.swarm_dir, 'logs'), 'architecture-validator', 'results.json');
    const summaryPath = path.join(path.join(config.paths.swarm_dir, 'logs'), 'architecture-validator', 'summary.md');
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

  await record('architecture validator reports malformed execution_order entries without internal error', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    const archValidatorChecksMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/services/arch-validator-checks.ts');
    const archValidatorMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/services/arch-validator.ts');

    const progress = {
      project: 'behavior-arch-validator-exec-order-entry',
      execution_order: [1, null, {}, '', '01', 'validator:full_lint'],
      modules: { '01': { title: 'Scaffold', dir: '01-scaffold', stages: [] } },
      gates: {},
    };
    const config = {
      project: 'behavior-arch-validator-exec-order-entry',
      paths: { progress_file: 'progress.json' },
    };

    const findings = archValidatorChecksMod.runDeterministicArchitectureChecks(progress, config);
    const invalidFindings = findings.filter((finding) => finding.id === 'EXEC_ORDER_ENTRY_INVALID');
    assert.equal(invalidFindings.length, 4);
    assert.equal(invalidFindings.every((finding) => finding.severity === 'blocking'), true);
    assert.equal(invalidFindings.every((finding) => finding.paths.includes('progress.json')), true);
    assert.equal(findings.some((finding) => finding.id === 'VALIDATOR_INTERNAL_ERROR'), false);

    const result = await archValidatorMod.runArchitectureValidatorStage(config, progress, {
      skipAgent: true,
      input: {
        ids: {
          stageId: 'validator:architecture',
          validatorName: 'architecture',
        },
      },
    });
    assert.equal(result.schemaVersion, 'v1');
    assert.equal(result.producerKind, 'validator');
    assert.equal(result.nextAction, 'block');
    assert.equal(result.diagnostics.metadata.blocked, true);
    assert.equal(result.diagnostics.metadata.raw_findings.filter((finding) => finding.id === 'EXEC_ORDER_ENTRY_INVALID').length, 4);
    assert.equal(result.diagnostics.metadata.raw_findings.some((finding) => finding.id === 'VALIDATOR_INTERNAL_ERROR'), false);
  });

  await record('built-in architecture validator internal errors become blocking control results', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    const archValidatorMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/services/arch-validator.ts');

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-arch-validator-internal-error-'));
    const config = {
      project: 'behavior-arch-validator-internal-error',
      paths: {
        swarm_dir: path.join(tempRoot, 'swarm'),
        modules_dir: path.join(tempRoot, 'modules'),
        progress_file: 'progress.json',
      },
      _runId: 'run-arch-validator-internal-error-1',
      run_id: 'run-arch-validator-internal-error-1',
    };

    const result = await archValidatorMod.runArchitectureValidatorStage(config, null, {
      input: {
        ids: {
          stageId: 'validator:architecture',
          validatorName: 'architecture',
        },
      },
    });

    assert.equal(result.schemaVersion, 'v1');
    assert.equal(result.producerKind, 'validator');
    assert.equal(result.nextAction, 'block');
    assert.equal(result.issueType, 'code');
    assert.equal(result.diagnostics.metadata.blocked, true);
    assert.equal(result.diagnostics.metadata.blocking_count, 1);
    assert.equal(result.diagnostics.metadata.raw_findings[0].id, 'VALIDATOR_INTERNAL_ERROR');
    assert.equal(result.diagnostics.metadata.raw_findings[0].severity, 'blocking');
    assert.match(result.diagnostics.summary, /Architecture validation BLOCKED with 1 blocking finding/);

    const resultsPath = path.join(path.join(config.paths.swarm_dir, 'logs'), 'architecture-validator', 'results.json');
    assert.equal(fs.existsSync(resultsPath), true);
    const writtenReport = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    assert.equal(writtenReport.blocked, true);
    assert.equal(writtenReport.findings[0].severity, 'blocking');
  });

  await record('pipeline completion schedules generators through explicit stage owners in core-defined order', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');

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
    fs.mkdirSync(path.join(repoRoot, '.swarm', 'logs', 'runs', 'run-generator-stage-order-1'), { recursive: true });

        const configDeps19 = {
        pipelineRunner: {
          discord: async () => {},
          output: () => {},
          releaseGateFiles: async () => {},
          syncControlFiles: async () => {},
          writeSummary: () => {},
        },
      };
const config = {
      project: 'behavior-generator-stage-order',
      repo_root: repoRoot,
      paths: {
        swarm_dir: path.join(repoRoot, '.swarm'),
        modules_dir: path.join(repoRoot, 'modules'),
      },
      telemetry: { enabled: true },
      pluginRegistry: testRegistry,
      _runId: 'run-generator-stage-order-1',
      run_id: 'run-generator-stage-order-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-21T00:00:00.000Z'),
          };

    const progress = {
      execution_order: [],
      modules: {},
      gates: {},
      case_study: { enabled: true },
    };

    const result = await pipelineRunnerMod.runPipeline(config, progress, { deps: configDeps19, skipArchValidation: true }, { deps: configDeps19 });
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

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');

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
    fs.mkdirSync(path.join(repoRoot, '.swarm', 'logs', 'runs', 'run-generator-blocked-halt-1'), { recursive: true });

        const configDeps20 = {
        pipelineRunner: {
          discord: async () => {},
          output: () => {},
          writeSummary: () => {},
        },
      };
const config = {
      project: 'behavior-generator-blocked-halt',
      repo_root: repoRoot,
      paths: {
        swarm_dir: path.join(repoRoot, '.swarm'),
        modules_dir: path.join(repoRoot, 'modules'),
      },
      telemetry: { enabled: false },
      pluginRegistry: {
        ...registry,
        stageOwners: {
          ...registry.stageOwners,
          'generator.run': stageOwners,
        },
      },
      _runId: 'run-generator-blocked-halt-1',
      run_id: 'run-generator-blocked-halt-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-21T00:00:00.000Z'),
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

    const result = await pipelineRunnerMod.runPipeline(config, progress, { deps: configDeps20, skipArchValidation: true }, { deps: configDeps20 });
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

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');

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
    fs.mkdirSync(path.join(repoRoot, '.swarm', 'logs', 'runs', 'run-generator-arch-block-1'), { recursive: true });

        const configDeps21 = {
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
      };
const config = {
      project: 'behavior-generator-arch-block',
      repo_root: repoRoot,
      paths: {
        swarm_dir: path.join(repoRoot, '.swarm'),
        modules_dir: path.join(repoRoot, 'modules'),
      },
      telemetry: { enabled: false },
      pluginRegistry: {
        ...registry,
        stageOwners: {
          ...registry.stageOwners,
          'generator.run': stageOwners,
        },
      },
      _runId: 'run-generator-arch-block-1',
      run_id: 'run-generator-arch-block-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-21T00:00:00.000Z'),
          };

    const progress = {
      execution_order: ['01'],
      modules: { '01': { title: 'Scaffold', dir: '01-scaffold' } },
      gates: {},
      case_study: { enabled: true },
    };

    const result = await pipelineRunnerMod.runPipeline(config, progress, { deps: configDeps21 });
    await flushAsync();

    assert.equal(result, 20);
    assert.deepEqual(generatorCalls, []);
  });

  await record('single-module mode does not enter the full-pipeline generator schedule', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');

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
    fs.mkdirSync(path.join(repoRoot, '.swarm', 'logs', 'runs', 'run-generator-single-module-1'), { recursive: true });

        const configDeps22 = {
        pipelineRunner: {
          discord: async () => {},
          output: () => {},
          runModule: async () => makeStepResult({ stepId: '01', exit: 0, reason: 'PASS', status: 'PASS', correlation: { module_id: '01' } }),
          writeSummary: () => {},
        },
      };
const config = {
      project: 'behavior-generator-single-module',
      repo_root: repoRoot,
      paths: {
        swarm_dir: path.join(repoRoot, '.swarm'),
        modules_dir: path.join(repoRoot, 'modules'),
      },
      telemetry: { enabled: false },
      pluginRegistry: {
        ...registry,
        stageOwners: {
          ...registry.stageOwners,
          'generator.run': stageOwners,
        },
      },
      _runId: 'run-generator-single-module-1',
      run_id: 'run-generator-single-module-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-21T00:00:00.000Z'),
          };

    const progress = {
      execution_order: ['01'],
      modules: { '01': { title: 'Scaffold', dir: '01-scaffold' } },
      gates: {},
      case_study: { enabled: true },
    };

    const result = await pipelineRunnerMod.runPipeline(config, progress, { deps: configDeps22, module: '01', skipArchValidation: true });
    await flushAsync();

    assert.equal(result, 0);
    assert.deepEqual(generatorCalls, []);
  });

  await record('pipeline rejects raw exit-shaped step results as scheduler authority', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');

    const outputs = [];
        const configDeps23 = {
        pipelineRunner: {
          discord: async () => {},
          output: (payload) => { outputs.push(payload); },
          runModule: async () => ({ exit: 0, reason: 'old raw compatibility success' }),
          writeSummary: () => {},
        },
      };
const config = {
      project: 'behavior-raw-exit-rejected',
      paths: {
        swarm_dir: '/tmp/behavior-raw-exit-rejected/swarm',
        modules_dir: '/tmp/behavior-raw-exit-rejected/modules',
      },
      telemetry: { enabled: false },
      pluginRegistry: withStubbedGeneratorStages(await buildBuiltInRegistry(pipelineRuntimeRoot)),
      _runId: 'run-raw-exit-rejected-1',
      run_id: 'run-raw-exit-rejected-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-26T00:00:00.000Z'),
          };

    const progress = {
      execution_order: ['01'],
      modules: { '01': { title: 'Scaffold', dir: '01-scaffold' } },
      gates: {},
    };

    const result = await pipelineRunnerMod.runPipeline(config, progress, { deps: configDeps23, module: '01', skipArchValidation: true });
    await flushAsync();

    assert.equal(result, 1);
    assert.match(outputs[0]?.reason || '', /expected pipeline_step_result/);
    assert.equal(outputs[0]?.outcome, 'error');
  });
}
