export async function registerModuleFailuresArea({
  record,
  sourceRoot,
  overlayRoot,
  contractPath,
  installFakeRedis,
  xaddEvents,
  flushAsync,
  startGatewayServer,
  fs,
  os,
  path,
  assert,
  execFileSync,
  readOverlayText,
  materializeRuntimeTree,
  importRuntimeModule,
  ensureDir,
  writeExecutable,
  runtimeRoot,
  sandboxRuntimeRoot,
  pipelineEntryMod,
  pipelineIndexMod,
  pipelineRunnerMod,
  orchestrationMod,
  pipelineRedisMod,
  runtimeMod,
  gatewayMod,
  discordMod,
  lifecycleMod,
  lifecycleStateMod,
  monitorMod,
  redisLogMod,
  pathsMod,
  busterPipelineMod,
}) {
function getFieldValue(fields = [], name) {
  return fields.find((field) => field.name === name)?.value;
}

async function buildBuiltInRegistry(runtimeRoot) {
  const registryMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/registry.js');
  const { registry, errors } = registryMod.buildPluginRegistry({}, { throwOnError: false });
  assert.equal(errors.length, 0);
  return registry;
}

function seedCanonicalReadyForTestingStatus(statusStoreMod, config, dir, overrides = {}) {
  const moduleId = overrides.module_id || '01';
  const title = overrides.title || 'Scaffold';
  const startedAt = overrides.started_at || '2026-04-10T00:00:00.000Z';
  const readyAt = overrides.ready_at || '2026-04-10T00:01:00.000Z';
  const status = statusStoreMod.initStatus(moduleId, { title });

  lifecycleStateMod.startModulePhase(status, 'forge', 'Synthetic started module for READY_FOR_TESTING verifier fixture', {
    now: startedAt,
  });
  statusStoreMod.saveStatus(config, dir, status);

  lifecycleStateMod.transitionModuleStatus(status, 'READY_FOR_TESTING', {
    note: 'Synthetic READY_FOR_TESTING verifier fixture',
    now: readyAt,
  });

  const {
    module_id: _moduleId,
    title: _title,
    status: _status,
    current_phase: _currentPhase,
    history: _history,
    started_at: _startedAt,
    attempt_started_at: _attemptStartedAt,
    phase_started_at: _phaseStartedAt,
    completed_at: _completedAt,
    ready_at: _readyAt,
    ...rest
  } = overrides || {};
  Object.assign(status, rest);
  statusStoreMod.saveStatus(config, dir, status);
  return status;
}

await record('module-runner reuses poll-owned transcript state for session_ended_no_changes alerts', async () => {
  const moduleRunnerForgeSource = readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/runners/module-runner-forge.js');

  assert.equal(moduleRunnerForgeSource.includes('readAcpTranscriptState'), false);
  assert.equal(moduleRunnerForgeSource.includes('const transcriptState = result.transcript || null;'), true);
});

await record('module-runner routes Forge execution through the worker:module_forge stage owner when the registry is present', async () => {
  const moduleRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(moduleRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const moduleRunnerMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/runners/module-runner.js');
  const registryMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/core/registry.js');
  const runtimeCoreMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-module-forge-stage-owner-'));
  const modulesRoot = path.join(repoRoot, 'modules');
  const runId = 'run-module-forge-stage-owner-1';
  fs.mkdirSync(path.join(modulesRoot, '01-scaffold'), { recursive: true });

  let currentStatus = {
    module_id: '01',
    title: 'Scaffold',
    status: 'IN_PROGRESS',
    current_phase: null,
    fail_count: 0,
    history: [],
    cost: {},
    started_at: '2026-04-10T00:00:00.000Z',
    attempt_started_at: '2026-04-10T00:00:00.000Z',
  };

  const { registry, errors } = registryMod.buildPluginRegistry({}, { throwOnError: false });
  assert.equal(errors.length, 0);
  let stageOwnerCalls = 0;
  const testRegistry = {
    ...registry,
    stageOwners: {
      ...registry.stageOwners,
      'worker.execute': {
        ...registry.stageOwners['worker.execute'],
        'worker:module_forge': {
          ...registry.stageOwners['worker.execute']['worker:module_forge'],
          implementation: {
            execute: async ({ input, workerInput, pluginContext }) => {
              stageOwnerCalls += 1;
              assert.equal(input.ids.stageId, 'worker:module_forge');
              assert.equal(input.ids.moduleId, '01');
              assert.equal(input.ids.attempt, 1);
              assert.equal(input.refs.moduleAttemptRef, `module_attempt:${runId}:01:1`);
              assert.equal(input.worker.workerType, 'module_forge');
              assert.equal(pluginContext.schemaVersion, 'v1');
              assert.equal(pluginContext.stageId, 'worker:module_forge');
              await workerInput.onDispatched({
                session_key: 'agent:main:acp:forge-stage-owner',
                gateway_label: 'forge-stage-owner',
                stream_log_path: '/tmp/forge-stage-owner.jsonl',
                runtime: 'acp',
                agent_id: 'forge',
              });
              await workerInput.onFinalized({
                status: currentStatus,
                stream_log_path: '/tmp/forge-stage-owner.jsonl',
                poll_result: { ok: true },
              });
              return {
                schemaVersion: 'v1',
                producerKind: 'worker',
                producerType: 'module_forge',
                nextAction: 'pass',
                diagnostics: {
                  summary: 'Forge worker passed',
                  metadata: {
                    legacy_result: {
                      ok: true,
                      poll_result: { ok: true },
                      status: currentStatus,
                      session_key: 'agent:main:acp:forge-stage-owner',
                      gateway_label: 'forge-stage-owner',
                      attempt: 1,
                    },
                  },
                },
              };
            },
          },
        },
      },
    },
  };

  const progress = {
    execution_order: ['01'],
    modules: {
      '01': {
        title: 'Scaffold',
        dir: '01-scaffold',
        stages: ['forge'],
      },
    },
  };

  const config = {
    project: 'behavior-module-forge-stage-owner',
    default_timeout_minutes: 30,
    default_max_fails: 3,
    telemetry: { enabled: false },
    paths: { modules_dir: modulesRoot },
    _pluginRegistry: testRegistry,
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
    _testOverrides: {
      moduleRunner: {
        checkDependencies: () => ({ met: true }),
        loadStatus: () => currentStatus,
        saveStatus: (_config, _dir, nextStatus) => { currentStatus = nextStatus; },
        runPreflightValidation: () => ({ passed: true, failures: [] }),
        resolvePolicy: () => ({ model: 'forge-model', thinking: 'high', model_source: 'project_default', thinking_source: 'project_default' }),
        modelToHarness: () => 'forge',
        logEffectivePolicy: () => {},
        buildForgePrompt: async () => ({ prompt: 'forge prompt', recalledMemoryIds: [] }),
        savePrompt: () => {},
        discord: async () => {},
        setShutdownContext: () => {},
        clearShutdownContext: () => {},
        invalidateHeadHash: () => {},
        headHash: () => 'abc123',
        gitCommitAndPush: async () => {},
        sleep: async () => {},
      },
    },
  };

  const result = await moduleRunnerMod.runModule(config, progress, '01');

  assert.equal(stageOwnerCalls, 1);
  assert.equal(result.exit, 0);
  assert.equal(result.status, 'PASS');
});

await record('module-runner fails closed when worker:module_forge returns an invalid control result', async () => {
  const moduleRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(moduleRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const moduleRunnerMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/runners/module-runner.js');
  const registryMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/core/registry.js');
  const runtimeCoreMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-module-forge-stage-invalid-'));
  const logRoot = path.join(repoRoot, '.swarm', 'logs');
  const modulesRoot = path.join(repoRoot, 'modules');
  const runId = 'run-module-forge-stage-invalid-1';
  fs.mkdirSync(path.join(modulesRoot, '01-scaffold'), { recursive: true });

  let currentStatus = {
    module_id: '01',
    title: 'Scaffold',
    status: 'IN_PROGRESS',
    current_phase: 'forge',
    fail_count: 0,
    history: [],
    cost: {},
    started_at: '2026-04-10T00:00:00.000Z',
    attempt_started_at: '2026-04-10T00:00:00.000Z',
    phase_started_at: '2026-04-10T00:00:00.000Z',
  };

  const { registry, errors } = registryMod.buildPluginRegistry({}, { throwOnError: false });
  assert.equal(errors.length, 0);
  const testRegistry = {
    ...registry,
    stageOwners: {
      ...registry.stageOwners,
      'worker.execute': {
        ...registry.stageOwners['worker.execute'],
        'worker:module_forge': {
          ...registry.stageOwners['worker.execute']['worker:module_forge'],
          implementation: {
            execute: async () => ({
              schemaVersion: 'v1',
              producerKind: 'worker',
              producerType: 'module_forge',
              nextAction: 'ship_it',
            }),
          },
        },
      },
    },
  };

  const progress = {
    execution_order: ['01'],
    modules: {
      '01': {
        title: 'Scaffold',
        dir: '01-scaffold',
        stages: ['forge'],
      },
    },
  };

  const config = {
    project: 'behavior-module-forge-stage-invalid',
    default_timeout_minutes: 30,
    default_max_fails: 3,
    telemetry: { enabled: true },
    paths: { modules_dir: modulesRoot },
    _pluginRegistry: testRegistry,
    _logDir: logRoot,
    _runLogDir: path.join(logRoot, 'pipeline', 'runs', runId),
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
    _testOverrides: {
      moduleRunner: {
        checkDependencies: () => ({ met: true }),
        loadStatus: () => currentStatus,
        saveStatus: (_config, _dir, nextStatus) => { currentStatus = nextStatus; },
        runPreflightValidation: () => ({ passed: true, failures: [] }),
        resolvePolicy: () => ({ model: 'forge-model', thinking: 'high', model_source: 'project_default', thinking_source: 'project_default' }),
        modelToHarness: () => 'forge',
        logEffectivePolicy: () => {},
        buildForgePrompt: async () => ({ prompt: 'forge prompt', recalledMemoryIds: [] }),
        savePrompt: () => {},
        discord: async () => {},
        setShutdownContext: () => {},
        clearShutdownContext: () => {},
        invalidateHeadHash: () => {},
        headHash: () => 'abc123',
        sleep: async () => {},
      },
    },
  };

  const result = await moduleRunnerMod.runModule(config, progress, '01');

  assert.equal(result.exit, 1);
  assert.equal(result.reason, "Module Forge worker execution failed: Module Forge worker returned invalid control result: nextAction must be 'pass', 'retry', 'request_fix', or 'block' for worker:module_forge");
  await flushAsync();

  const streamEvents = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
  const failEvent = streamEvents.find((event) => event.type === 'module.status_changed' && event.new_status === 'FAIL');
  assert.equal(Boolean(failEvent), true);
  assert.equal(failEvent.module_id, '01');
  assert.equal(failEvent.phase, 'forge');
  assert.equal(failEvent.reason, result.reason);
});

await record('module-runner routes Buster execution through the worker:module_buster stage owner when the registry is present', async () => {
  const moduleRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(moduleRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const moduleRunnerMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/runners/module-runner.js');
  const registryMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/core/registry.js');
  const runtimeCoreMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-module-buster-stage-owner-'));
  const runId = 'run-module-buster-stage-owner-1';
  const modulesRoot = path.join(repoRoot, 'modules');
  fs.mkdirSync(path.join(modulesRoot, '01-scaffold'), { recursive: true });

  let currentStatus = {
    module_id: '01',
    title: 'Scaffold',
    status: 'READY_FOR_TESTING',
    current_phase: null,
    fail_count: 0,
    history: [],
    cost: {},
    started_at: '2026-04-10T00:00:00.000Z',
    attempt_started_at: '2026-04-10T00:00:00.000Z',
  };

  const { registry, errors } = registryMod.buildPluginRegistry({}, { throwOnError: false });
  assert.equal(errors.length, 0);
  let stageOwnerCalls = 0;
  const testRegistry = {
    ...registry,
    stageOwners: {
      ...registry.stageOwners,
      'worker.execute': {
        ...registry.stageOwners['worker.execute'],
        'worker:module_buster': {
          ...registry.stageOwners['worker.execute']['worker:module_buster'],
          implementation: {
            execute: async ({ input, workerInput, pluginContext }) => {
              stageOwnerCalls += 1;
              assert.equal(input.ids.stageId, 'worker:module_buster');
              assert.equal(input.ids.moduleId, '01');
              assert.equal(input.ids.attempt, 1);
              assert.equal(/^buster-module-01-/.test(input.ids.dispatchId), true);
              assert.equal(input.refs.moduleAttemptRef, `module_attempt:${runId}:01:1`);
              assert.equal(input.refs.workerDispatchRef.startsWith(`worker_dispatch:${runId}:01:1:buster-module-01-`), true);
              assert.equal(input.worker.workerType, 'module_buster');
              assert.equal(pluginContext.schemaVersion, 'v1');
              assert.equal(pluginContext.stageId, 'worker:module_buster');
              await workerInput.onDispatched({
                dispatch_id: 'buster-stage-owner-dispatch',
                gateway_label: 'buster-stage-owner-dispatch',
                run_id: 'run-buster-stage-owner',
              });
              currentStatus = {
                ...currentStatus,
                status: 'PASS',
                current_phase: null,
                completion_summary: 'Buster stage owner PASS',
              };
              await workerInput.onFinalized({
                status: currentStatus,
                session_key: 'agent:main:acp:buster-stage-owner',
                poll_result: { ok: true, status: { status: 'PASS' } },
              });
              return {
                schemaVersion: 'v1',
                producerKind: 'worker',
                producerType: 'module_buster',
                nextAction: 'pass',
                diagnostics: {
                  summary: 'Buster worker passed',
                  metadata: {
                    legacy_result: {
                      ok: true,
                      poll_result: { ok: true, status: { status: 'PASS' } },
                      status: currentStatus,
                      dispatch_id: 'buster-stage-owner-dispatch',
                      gateway_label: 'buster-stage-owner-dispatch',
                      session_key: 'agent:main:acp:buster-stage-owner',
                      attempt: 1,
                      run_id: 'run-buster-stage-owner',
                    },
                  },
                },
              };
            },
          },
        },
      },
    },
  };

  const progress = {
    execution_order: ['01'],
    modules: {
      '01': {
        title: 'Scaffold',
        dir: '01-scaffold',
        stages: ['buster'],
        test_suites: ['smoke'],
      },
    },
  };

  const config = {
    project: 'behavior-module-buster-stage-owner',
    default_timeout_minutes: 30,
    default_max_fails: 3,
    telemetry: { enabled: false },
    paths: { modules_dir: modulesRoot },
    _pluginRegistry: testRegistry,
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
    _testOverrides: {
      moduleRunner: {
        checkDependencies: () => ({ met: true }),
        loadStatus: () => currentStatus,
        saveStatus: (_config, _dir, nextStatus) => { currentStatus = nextStatus; },
        resolvePolicy: () => ({ model: 'buster-model', model_source: 'project_default' }),
        logEffectivePolicy: () => {},
        buildBusterModulePrompt: () => ({ prompt: 'Run smoke' }),
        savePrompt: () => {},
        validateBusterConfig: () => {},
        gitSyncBeforeBuster: async () => {},
        discord: async () => {},
        setShutdownContext: () => {},
        clearShutdownContext: () => {},
        sleep: async () => {},
      },
    },
  };

  const result = await moduleRunnerMod.runModule(config, progress, '01');

  assert.equal(stageOwnerCalls, 1);
  assert.equal(result.exit, 0);
  assert.equal(result.status, 'PASS');
});

await record('module-runner fails closed when worker:module_buster returns an invalid control result', async () => {
  const moduleRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(moduleRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const moduleRunnerMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/runners/module-runner.js');
  const registryMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/core/registry.js');
  const runtimeCoreMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-module-buster-stage-invalid-'));
  const logRoot = path.join(repoRoot, '.swarm', 'logs');
  const modulesRoot = path.join(repoRoot, 'modules');
  const runId = 'run-module-buster-stage-invalid-1';
  fs.mkdirSync(path.join(modulesRoot, '01-scaffold'), { recursive: true });

  let currentStatus = {
    module_id: '01',
    title: 'Scaffold',
    status: 'READY_FOR_TESTING',
    current_phase: 'buster',
    fail_count: 0,
    history: [],
    cost: {},
    started_at: '2026-04-10T00:00:00.000Z',
    attempt_started_at: '2026-04-10T00:00:00.000Z',
    phase_started_at: '2026-04-10T00:00:00.000Z',
  };

  const { registry, errors } = registryMod.buildPluginRegistry({}, { throwOnError: false });
  assert.equal(errors.length, 0);
  const testRegistry = {
    ...registry,
    stageOwners: {
      ...registry.stageOwners,
      'worker.execute': {
        ...registry.stageOwners['worker.execute'],
        'worker:module_buster': {
          ...registry.stageOwners['worker.execute']['worker:module_buster'],
          implementation: {
            execute: async () => ({
              schemaVersion: 'v1',
              producerKind: 'worker',
              producerType: 'module_buster',
              nextAction: 'ship_it',
            }),
          },
        },
      },
    },
  };

  const progress = {
    execution_order: ['01'],
    modules: {
      '01': {
        title: 'Scaffold',
        dir: '01-scaffold',
        stages: ['buster'],
        test_suites: ['smoke'],
      },
    },
  };

  const config = {
    project: 'behavior-module-buster-stage-invalid',
    default_timeout_minutes: 30,
    default_max_fails: 3,
    telemetry: { enabled: true },
    paths: { modules_dir: modulesRoot },
    _pluginRegistry: testRegistry,
    _logDir: logRoot,
    _runLogDir: path.join(logRoot, 'pipeline', 'runs', runId),
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
    _testOverrides: {
      moduleRunner: {
        checkDependencies: () => ({ met: true }),
        loadStatus: () => currentStatus,
        saveStatus: (_config, _dir, nextStatus) => { currentStatus = nextStatus; },
        resolvePolicy: () => ({ model: 'buster-model', model_source: 'project_default' }),
        logEffectivePolicy: () => {},
        buildBusterModulePrompt: () => ({ prompt: 'Run smoke' }),
        savePrompt: () => {},
        validateBusterConfig: () => {},
        gitSyncBeforeBuster: async () => {},
        discord: async () => {},
        setShutdownContext: () => {},
        clearShutdownContext: () => {},
        sleep: async () => {},
      },
    },
  };

  const result = await moduleRunnerMod.runModule(config, progress, '01');

  assert.equal(result.exit, 1);
  assert.equal(result.reason, "Module Buster worker execution failed: Module Buster worker returned invalid control result: nextAction must be 'pass', 'retry', 'request_fix', or 'block' for worker:module_buster");
  await flushAsync();

  const streamEvents = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
  const failEvent = streamEvents.find((event) => event.type === 'module.status_changed' && event.new_status === 'FAIL');
  assert.equal(Boolean(failEvent), true);
  assert.equal(failEvent.module_id, '01');
  assert.equal(failEvent.phase, 'buster');
  assert.equal(failEvent.reason, result.reason);
});

await record('module-runner appends terminal ACP detail to Forge no-change failures without losing transcript-active vs stale wording', async () => {
  const moduleRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(moduleRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const moduleRunnerMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/runners/module-runner.js');
  const runtimeCoreMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const registry = await buildBuiltInRegistry(moduleRuntimeRoot);

  const scenarios = [
    {
      name: 'active transcript',
      transcript: { eventCount: 3, lastActivityPoll: 0 },
      expectedReason: 'Forge completed without file changes (transcript shows recent activity — possible no-op session) (adapter command missing)',
      expectedTranscriptField: 'active (3 events)',
    },
    {
      name: 'stale transcript',
      transcript: { eventCount: 3, lastActivityPoll: 2 },
      expectedReason: 'Forge session ended but produced no commits — agent may have crashed or errored (adapter command missing)',
      expectedTranscriptField: 'stale (no activity for 2 polls)',
    },
  ];

  for (const scenario of scenarios) {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-forge-no-change-detail-'));
    const modulesRoot = path.join(repoRoot, 'modules');
    fs.mkdirSync(path.join(modulesRoot, '01-scaffold'), { recursive: true });

    let currentStatus = {
      module_id: '01',
      title: 'Scaffold',
      status: 'IN_PROGRESS',
      current_phase: 'forge',
      fail_count: 0,
      history: [],
      cost: {},
    };
    const handleFailCalls = [];
    const discordCalls = [];

    const progress = {
      execution_order: ['01'],
      modules: {
        '01': {
          title: 'Scaffold',
          dir: '01-scaffold',
          stages: ['forge'],
        },
      },
    };

    const config = {
      project: `behavior-forge-no-change-detail-${scenario.name.replace(/\s+/g, '-')}`,
      default_timeout_minutes: 30,
      default_max_fails: 3,
      telemetry: { enabled: false },
      _pluginRegistry: registry,
      paths: { modules_dir: modulesRoot },
      _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
      _testOverrides: {
        moduleRunner: {
          checkDependencies: () => ({ met: true }),
          loadStatus: () => currentStatus,
          saveStatus: (_config, _dir, nextStatus) => { currentStatus = nextStatus; },
          runPreflightValidation: () => ({ passed: true, failures: [] }),
          resolvePolicy: () => ({ model: 'forge-model', thinking: 'high', model_source: 'project_default', thinking_source: 'project_default' }),
          modelToHarness: () => 'forge',
          logEffectivePolicy: () => {},
          buildForgePrompt: async () => ({ prompt: 'forge prompt', recalledMemoryIds: [] }),
          savePrompt: () => {},
          discord: async (_config, _level, title, description, fields = []) => { discordCalls.push({ title, description, fields }); },
          setShutdownContext: () => {},
          clearShutdownContext: () => {},
          invalidateHeadHash: () => {},
          headHash: () => 'abc123',
          acpLabel: () => 'forge-01',
          spawnAgent: async () => {},
          verifyAgentAlive: async () => true,
          getTrackedAgent: () => ({ sessionKey: 'agent:main:acp:forge-no-change-detail', gatewayLabel: 'forge-01', runtime: 'acp', agentId: 'forge' }),
          pollWithRateLimitRecovery: async () => ({
            ok: false,
            reason: 'session_ended_no_changes',
            status: { detail: 'adapter command missing' },
            transcript: scenario.transcript,
          }),
          killAgent: async () => {},
          saveStreamLog: () => {},
          handleFail: async (_config, _statusValue, _dir, _moduleId, _maxFails, phase, reason) => {
            handleFailCalls.push({ phase, reason });
            return { exit: 10, reason, phase };
          },
          sleep: async () => {},
        },
      },
    };

    const result = await moduleRunnerMod.runModule(config, progress, '01');

    assert.equal(result.exit, 10, scenario.name);
    assert.equal(handleFailCalls.length, 1, scenario.name);
    assert.equal(handleFailCalls[0].phase, 'forge', scenario.name);
    assert.equal(handleFailCalls[0].reason, scenario.expectedReason, scenario.name);

    const noChangesAlert = discordCalls.find((call) => call.title === 'Module 01 — Forge no changes');
    assert(noChangesAlert, `${scenario.name}: missing Forge no-changes Discord alert`);
    assert.equal(noChangesAlert.description, scenario.expectedReason, scenario.name);
    const transcriptField = noChangesAlert.fields.find((field) => field.name === 'Transcript')?.value || null;
    assert.equal(
      transcriptField == null
        || transcriptField === scenario.expectedTranscriptField
        || transcriptField.startsWith('[redacted Transcript;'),
      true,
      scenario.name,
    );
  }
});

await record('module-runner terminal NEEDS_NOVA exits still emit module FAIL telemetry', async () => {
  const moduleRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(moduleRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const moduleRunnerMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/runners/module-runner.js');
  const runtimeCoreMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const statusStoreMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/services/status-store.js');
  const registry = await buildBuiltInRegistry(moduleRuntimeRoot);

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-terminal-needs-nova-'));
  const logRoot = path.join(repoRoot, '.swarm', 'logs');
  const modulesRoot = path.join(repoRoot, 'modules');
  const runId = 'run-terminal-needs-nova-1';
  fs.mkdirSync(path.join(modulesRoot, '01-scaffold'), { recursive: true });
  const status = {
    module_id: '01',
    title: 'Scaffold',
    status: 'READY_FOR_TESTING',
    current_phase: null,
    fail_count: 0,
    gateway_label: 'buster-config-stop-01',
    session_key: 'agent:main:acp:buster-config-stop-01',
    started_at: '2026-04-10T00:00:00.000Z',
    attempt_started_at: '2026-04-10T00:00:00.000Z',
    history: [],
  };

  const progress = {
    execution_order: ['01'],
    modules: {
      '01': {
        title: 'Scaffold',
        dir: '01-scaffold',
        stages: ['buster'],
        test_suites: ['smoke'],
      },
    },
  };

  const config = {
    project: 'behavior-terminal-needs-nova',
    default_timeout_minutes: 30,
    default_max_fails: 3,
    paths: { modules_dir: modulesRoot },
    telemetry: { enabled: true },
    _pluginRegistry: registry,
    _logDir: logRoot,
    _runLogDir: path.join(logRoot, 'pipeline', 'runs', runId),
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
    _testOverrides: {
      moduleRunner: {
        checkDependencies: () => ({ met: true }),
        loadStatus: () => ({ ...status }),
        saveStatus: () => {},
        gitSyncBeforeBuster: async () => {},
        resolvePolicy: () => ({ model: 'buster-model', model_source: 'project_default' }),
        logEffectivePolicy: () => {},
        buildBusterModulePrompt: () => ({ prompt: 'Run smoke' }),
        savePrompt: () => {},
        validateBusterConfig: () => { throw new Error('missing test binary'); },
        discord: async () => {},
        clearShutdownContext: () => {},
        sleep: async () => {},
      },
    },
  };

  const result = await moduleRunnerMod.runModule(config, progress, '01');
  assert.equal(result.exit, 10);
  assert.equal(result.reason, 'Config validation failed: missing test binary');
  assert.equal(result.gateway_label, 'buster-config-stop-01');
  assert.equal(result.session_key, 'agent:main:acp:buster-config-stop-01');
  await flushAsync();

  const streamEvents = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
  const failEvent = streamEvents.find((event) => event.type === 'module.status_changed' && event.new_status === 'FAIL');
  assert.equal(Boolean(failEvent), true);
  assert.equal(failEvent.module_id, '01');
  assert.equal(failEvent.old_status, 'READY_FOR_TESTING');
  assert.equal(failEvent.phase, 'buster');
  assert.equal(failEvent.model, 'buster-model');
  assert.equal(failEvent.reason, 'Config validation failed: missing test binary');
  assert.equal(failEvent.gateway_label, 'buster-config-stop-01');
  assert.equal(failEvent.session_key, 'agent:main:acp:buster-config-stop-01');
});

await record('module-runner resumed BLOCKED exits preserve canonical correlation', async () => {
  const moduleRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(moduleRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const moduleRunnerMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/runners/module-runner.js');
  const runtimeCoreMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-module-resumed-blocked-'));
  const logRoot = path.join(repoRoot, '.swarm', 'logs');
  const modulesRoot = path.join(repoRoot, 'modules');
  const runId = 'run-module-resumed-blocked-1';
  fs.mkdirSync(path.join(modulesRoot, '01-scaffold'), { recursive: true });

  const progress = {
    execution_order: ['01'],
    modules: {
      '01': {
        title: 'Scaffold',
        dir: '01-scaffold',
        stages: ['forge', 'buster'],
      },
    },
  };

  const config = {
    project: 'behavior-module-resumed-blocked',
    default_timeout_minutes: 30,
    default_max_fails: 3,
    paths: { modules_dir: modulesRoot },
    telemetry: { enabled: true },
    _logDir: logRoot,
    _runLogDir: path.join(logRoot, 'pipeline', 'runs', runId),
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
    _testOverrides: {
      moduleRunner: {
        checkDependencies: () => ({ met: true }),
        loadStatus: () => ({
          module_id: '01',
          title: 'Scaffold',
          status: 'BLOCKED',
          current_phase: 'buster',
          blockedPhase: 'buster',
          blockedFailCount: 3,
          fail_count: 3,
          blockedReason: 'Repeated test crashes exhausted the retry budget',
          gateway_label: 'dispatch-buster-blocked-01',
          session_key: 'agent:main:acp:buster-blocked-01',
          history: [],
          fail_summaries: [
            {
              attempt: 3,
              phase: 'buster',
              summary: 'Repeated test crashes exhausted the retry budget',
            },
          ],
        }),
      },
    },
  };

  const result = await moduleRunnerMod.runModule(config, progress, '01');

  assert.equal(result.exit, 20);
  assert.equal(result.module, '01');
  assert.equal(result.reason, 'Repeated test crashes exhausted the retry budget');
  assert.equal(result.fail_count, 3);
  assert.equal(result.phase, 'buster');
  assert.equal(result.gateway_label, 'dispatch-buster-blocked-01');
  assert.equal(result.session_key, 'agent:main:acp:buster-blocked-01');
});

await record('module-runner blueprint-release stop preserves canonical correlation', async () => {
  const moduleRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(moduleRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const moduleRunnerMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/runners/module-runner.js');
  const runtimeCoreMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-blueprint-release-correlation-'));
  const logRoot = path.join(repoRoot, '.swarm', 'logs');
  const modulesRoot = path.join(repoRoot, 'modules');
  const runId = 'run-blueprint-release-correlation-1';
  fs.mkdirSync(path.join(modulesRoot, '01-scaffold'), { recursive: true });

  const status = {
    module_id: '01',
    title: 'Scaffold',
    status: 'PENDING',
    current_phase: null,
    fail_count: 0,
    gateway_label: 'forge-blueprint-release',
    session_key: 'agent:main:acp:forge-blueprint-release',
    active_agent: {
      gateway_label: 'forge-blueprint-release',
      session_key: 'agent:main:acp:forge-blueprint-release',
      label: 'forge-blueprint-release',
    },
    started_at: '2026-04-10T00:00:00.000Z',
    attempt_started_at: '2026-04-10T00:00:00.000Z',
    history: [],
  };

  const progress = {
    execution_order: ['01'],
    modules: {
      '01': {
        title: 'Scaffold',
        dir: '01-scaffold',
        stages: ['forge', 'buster'],
      },
    },
  };

  const config = {
    project: 'behavior-blueprint-release-correlation',
    default_timeout_minutes: 30,
    default_max_fails: 3,
    paths: { modules_dir: modulesRoot },
    telemetry: { enabled: true },
    _logDir: logRoot,
    _runLogDir: path.join(logRoot, 'pipeline', 'runs', runId),
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
    _testOverrides: {
      moduleRunner: {
        checkDependencies: () => ({ met: true }),
        loadStatus: () => ({ ...status }),
        saveStatus: () => {},
        releaseBlueprint: async () => { throw new Error('architecture branch missing'); },
        discord: async () => {},
        clearShutdownContext: () => {},
        sleep: async () => {},
      },
    },
  };

  const result = await moduleRunnerMod.runModule(config, progress, '01');
  assert.equal(result.exit, 10);
  assert.equal(result.reason, 'Blueprint release failed: architecture branch missing. Nova may need to create/fix the architecture branch.');
  assert.equal(result.gateway_label, 'forge-blueprint-release');
  assert.equal(result.session_key, 'agent:main:acp:forge-blueprint-release');
  await flushAsync();

  const streamEvents = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
  const failEvent = streamEvents.find((event) => event.type === 'module.status_changed' && event.new_status === 'FAIL');
  assert.equal(Boolean(failEvent), true);
  assert.equal(failEvent.module_id, '01');
  assert.equal(typeof failEvent.old_status === 'string' || failEvent.old_status == null, true);
  assert.equal(failEvent.phase, 'blueprint_release');
  assert.equal(failEvent.reason, 'Blueprint release failed: architecture branch missing. Nova may need to create/fix the architecture branch.');
  assert.equal(failEvent.session_key, 'agent:main:acp:forge-blueprint-release');
});

await record('module-runner pre-Buster validation stop preserves canonical correlation', async () => {
  const moduleRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(moduleRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const moduleRunnerMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/runners/module-runner.js');
  const runtimeCoreMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-pre-buster-validation-correlation-'));
  const logRoot = path.join(repoRoot, '.swarm', 'logs');
  const modulesRoot = path.join(repoRoot, 'modules');
  const runId = 'run-pre-buster-validation-correlation-1';
  fs.mkdirSync(path.join(modulesRoot, '01-scaffold'), { recursive: true });

  const status = {
    module_id: '01',
    title: 'Scaffold',
    status: 'READY_FOR_TESTING',
    current_phase: null,
    fail_count: 0,
    gateway_label: 'forge-validation-stop',
    session_key: 'agent:main:acp:forge-validation-stop',
    validation: {
      attempt: 1,
      delivery_lint_passed: true,
      delivery_lint_passed_at: '2026-04-10T00:00:30.000Z',
      pre_check_passed: false,
      pre_check_passed_at: null,
    },
    started_at: '2026-04-10T00:00:00.000Z',
    attempt_started_at: '2026-04-10T00:00:00.000Z',
    history: [],
  };

  const progress = {
    execution_order: ['01'],
    modules: {
      '01': {
        title: 'Scaffold',
        dir: '01-scaffold',
        stages: ['forge', 'buster'],
      },
    },
  };

  let gitSyncCalled = false;
  const config = {
    project: 'behavior-pre-buster-validation-correlation',
    default_timeout_minutes: 30,
    default_max_fails: 3,
    paths: { modules_dir: modulesRoot },
    telemetry: { enabled: true },
    _logDir: logRoot,
    _runLogDir: path.join(logRoot, 'pipeline', 'runs', runId),
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
    _testOverrides: {
      moduleRunner: {
        checkDependencies: () => ({ met: true }),
        loadStatus: () => status,
        saveStatus: () => {},
        runPreCheck: async () => {
          status.validation.attempt = 999;
          return { passed: true };
        },
        gitSyncBeforeBuster: async () => {
          gitSyncCalled = true;
        },
        discord: async () => {},
        clearShutdownContext: () => {},
        sleep: async () => {},
      },
    },
  };

  const result = await moduleRunnerMod.runModule(config, progress, '01');
  assert.equal(result.exit, 1);
  assert.equal(result.reason, 'Validation milestones missing before Buster dispatch — refusing to continue');
  assert.equal(result.gateway_label, 'forge-validation-stop');
  assert.equal(result.session_key, 'agent:main:acp:forge-validation-stop');
  assert.equal(gitSyncCalled, false);
  await flushAsync();

  const streamEvents = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
  assert.equal(streamEvents.length, 0);
});

await record('module-runner Git sync stop preserves canonical correlation', async () => {
  const moduleRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(moduleRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const moduleRunnerMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/runners/module-runner.js');
  const runtimeCoreMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-git-sync-correlation-'));
  const logRoot = path.join(repoRoot, '.swarm', 'logs');
  const modulesRoot = path.join(repoRoot, 'modules');
  const runId = 'run-git-sync-correlation-1';
  fs.mkdirSync(path.join(modulesRoot, '01-scaffold'), { recursive: true });

  const status = {
    module_id: '01',
    title: 'Scaffold',
    status: 'READY_FOR_TESTING',
    current_phase: null,
    fail_count: 0,
    gateway_label: 'forge-git-sync',
    session_key: 'agent:main:acp:forge-git-sync',
    validation: {
      attempt: 1,
      delivery_lint_passed: true,
      delivery_lint_passed_at: '2026-04-10T00:00:30.000Z',
      pre_check_passed: true,
      pre_check_passed_at: '2026-04-10T00:00:45.000Z',
    },
    started_at: '2026-04-10T00:00:00.000Z',
    attempt_started_at: '2026-04-10T00:00:00.000Z',
    history: [],
  };

  const progress = {
    execution_order: ['01'],
    modules: {
      '01': {
        title: 'Scaffold',
        dir: '01-scaffold',
        stages: ['forge', 'buster'],
      },
    },
  };

  const config = {
    project: 'behavior-git-sync-correlation',
    default_timeout_minutes: 30,
    default_max_fails: 3,
    paths: { modules_dir: modulesRoot },
    telemetry: { enabled: true },
    _logDir: logRoot,
    _runLogDir: path.join(logRoot, 'pipeline', 'runs', runId),
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
    _testOverrides: {
      moduleRunner: {
        checkDependencies: () => ({ met: true }),
        loadStatus: () => ({ ...status, validation: { ...status.validation } }),
        saveStatus: () => {},
        gitSyncBeforeBuster: async () => { throw new Error('push rejected'); },
        discord: async () => {},
        clearShutdownContext: () => {},
        sleep: async () => {},
      },
    },
  };

  const result = await moduleRunnerMod.runModule(config, progress, '01');
  assert.equal(result.exit, 1);
  assert.equal(result.reason, 'push rejected');
  assert.equal(result.gateway_label, 'forge-git-sync');
  assert.equal(result.session_key, 'agent:main:acp:forge-git-sync');
  await flushAsync();

  const streamEvents = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
  const failEvent = streamEvents.find((event) => event.type === 'module.status_changed' && event.new_status === 'FAIL');
  assert.equal(Boolean(failEvent), true);
  assert.equal(failEvent.module_id, '01');
  assert.equal(failEvent.old_status, 'READY_FOR_TESTING');
  assert.equal(failEvent.phase, 'git_sync');
  assert.equal(failEvent.reason, 'push rejected');
  assert.equal(failEvent.session_key, 'agent:main:acp:forge-git-sync');
});

await record('module-runner Forge polling git stop preserves canonical correlation', async () => {
  const moduleRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(moduleRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const moduleRunnerMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/runners/module-runner.js');
  const runtimeCoreMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const registry = await buildBuiltInRegistry(moduleRuntimeRoot);

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-forge-poll-git-correlation-'));
  const modulesRoot = path.join(repoRoot, 'modules');
  fs.mkdirSync(path.join(modulesRoot, '01-scaffold'), { recursive: true });

  let currentStatus = {
    module_id: '01',
    title: 'Scaffold',
    status: 'IN_PROGRESS',
    current_phase: null,
    fail_count: 0,
    gateway_label: 'forge-poll-git',
    session_key: 'agent:main:acp:forge-poll-git',
    history: [],
    started_at: '2026-04-10T00:00:00.000Z',
    attempt_started_at: '2026-04-10T00:00:00.000Z',
  };

  const progress = {
    execution_order: ['01'],
    modules: {
      '01': {
        title: 'Scaffold',
        dir: '01-scaffold',
        stages: ['forge'],
      },
    },
  };

  const config = {
    project: 'behavior-forge-poll-git-correlation',
    default_timeout_minutes: 30,
    default_max_fails: 3,
    telemetry: { enabled: false },
    _pluginRegistry: registry,
    paths: { modules_dir: modulesRoot },
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
    _testOverrides: {
      moduleRunner: {
        checkDependencies: () => ({ met: true }),
        loadStatus: () => currentStatus,
        saveStatus: (_config, _dir, nextStatus) => { currentStatus = nextStatus; },
        runPreflightValidation: () => ({ passed: true, failures: [] }),
        resolvePolicy: () => ({ model: 'forge-model', thinking: 'high', model_source: 'project_default' }),
        logEffectivePolicy: () => {},
        buildForgePrompt: async () => ({ prompt: 'forge prompt', recalledMemoryIds: [] }),
        savePrompt: () => {},
        acpLabel: () => 'forge-poll-git',
        spawnAgent: async () => {},
        getTrackedAgent: () => ({
          sessionKey: 'agent:main:acp:forge-poll-git',
          gatewayLabel: 'forge-poll-git',
          streamLogPath: '/tmp/forge-poll-git.log',
          runtime: 'acp',
          agentId: 'claude',
        }),
        verifyAgentAlive: async () => true,
        pollWithRateLimitRecovery: async () => ({
          ok: false,
          reason: 'git_error',
          status: {
            message: 'forge polling git unsafe',
            details: { command: 'git pull --ff-only' },
          },
        }),
        killAgent: async () => {},
        saveStreamLog: () => {},
        setShutdownContext: () => {},
        clearShutdownContext: () => {},
        discord: async () => {},
        headHash: () => 'abc123',
        invalidateHeadHash: () => {},
      },
    },
  };

  const result = await moduleRunnerMod.runModule(config, progress, '01');
  assert.equal(result.exit, 1);
  assert.equal(result.reason, 'forge polling git unsafe');
  assert.equal(result.gateway_label, 'forge-poll-git');
  assert.equal(result.session_key, 'agent:main:acp:forge-poll-git');
  assert.deepEqual(result.polling_git, { command: 'git pull --ff-only' });
});

await record('module-runner Buster polling git stop preserves canonical correlation', async () => {
  const moduleRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(moduleRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const moduleRunnerMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/runners/module-runner.js');
  const runtimeCoreMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const registry = await buildBuiltInRegistry(moduleRuntimeRoot);

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-poll-git-correlation-'));
  const modulesRoot = path.join(repoRoot, 'modules');
  fs.mkdirSync(path.join(modulesRoot, '01-scaffold'), { recursive: true });

  let currentStatus = {
    module_id: '01',
    title: 'Scaffold',
    status: 'READY_FOR_TESTING',
    current_phase: null,
    fail_count: 0,
    history: [],
    started_at: '2026-04-10T00:00:00.000Z',
    attempt_started_at: '2026-04-10T00:00:00.000Z',
  };

  const progress = {
    execution_order: ['01'],
    modules: {
      '01': {
        title: 'Scaffold',
        dir: '01-scaffold',
        stages: ['buster'],
        test_suites: ['smoke'],
      },
    },
  };

  const config = {
    project: 'behavior-buster-poll-git-correlation',
    default_timeout_minutes: 30,
    default_max_fails: 3,
    telemetry: { enabled: false },
    _pluginRegistry: registry,
    paths: { modules_dir: modulesRoot },
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
    _testOverrides: {
      moduleRunner: {
        checkDependencies: () => ({ met: true }),
        loadStatus: () => currentStatus,
        saveStatus: (_config, _dir, nextStatus) => { currentStatus = nextStatus; },
        gitSyncBeforeBuster: async () => {},
        resolvePolicy: () => ({ model: 'buster-model', model_source: 'project_default' }),
        logEffectivePolicy: () => {},
        buildBusterModulePrompt: () => ({ prompt: 'Run tests' }),
        savePrompt: () => {},
        validateBusterConfig: () => {},
        archiveModuleCompletions: async () => {},
        spawnAgent: async () => ({ dispatch_id: 'buster-dispatch-01-attempt-1' }),
        pollDualWithRateLimitRecovery: async () => ({
          ok: false,
          reason: 'git_error',
          status: {
            message: 'buster polling git unsafe',
            details: { command: 'git pull --ff-only' },
            _redis_entry: {
              session_key: 'agent:buster:poll-git',
            },
          },
        }),
        killAgent: async () => {},
        saveStreamLog: () => {},
        setShutdownContext: () => {},
        clearShutdownContext: () => {},
        discord: async () => {},
      },
    },
  };

  const result = await moduleRunnerMod.runModule(config, progress, '01');
  assert.equal(result.exit, 1);
  assert.equal(result.reason, 'buster polling git unsafe');
  assert.equal(result.gateway_label, 'buster-dispatch-01-attempt-1');
  assert.equal(result.session_key, 'agent:buster:poll-git');
  assert.deepEqual(result.polling_git, { command: 'git pull --ff-only' });
});

await record('failure extraction prefers phase-owned agent detail over stale cross-phase notes', async () => {
  const moduleRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  const failuresMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/services/failures.js');

  assert.equal(
    failuresMod.extractAgentFailReason({
      history: [
        { agent: 'buster', note: 'Smoke suite failed in previous attempt' },
        { agent: 'pipeline', note: 'Retrying forge' },
      ],
      completion_summary: null,
    }, 'forge'),
    'forge reported FAIL (no details from agent)',
  );

  assert.equal(
    failuresMod.extractAgentFailReason({
      history: [
        { agent: 'forge', note: 'Forge completed' },
      ],
      completion_summary: 'Accessibility regression in smoke suite',
    }, 'buster'),
    '[buster] Accessibility regression in smoke suite',
  );
});

await record('module-runner buster failure-service alerts keep cached session correlation after active-agent cleanup', async () => {
  const moduleRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(moduleRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const moduleRunnerMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/runners/module-runner.js');
  const runtimeCoreMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const statusStoreMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/services/status-store.js');
  const registry = await buildBuiltInRegistry(moduleRuntimeRoot);

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-fail-session-'));
  const logRoot = path.join(repoRoot, '.swarm', 'logs');
  const modulesRoot = path.join(repoRoot, 'modules');
  const runId = 'run-buster-fail-session-1';
  fs.mkdirSync(path.join(modulesRoot, '01-scaffold'), { recursive: true });

  const sessionKey = 'agent:main:acp:buster-fail-session-01';
  const initialStatus = {
    module_id: '01',
    title: 'Scaffold',
    status: 'READY_FOR_TESTING',
    current_phase: null,
    fail_count: 0,
    fail_summaries: [],
    started_at: '2026-04-10T00:00:00.000Z',
    attempt_started_at: '2026-04-10T00:00:00.000Z',
    history: [],
    cost: {},
  };

  const progress = {
    execution_order: ['01'],
    modules: {
      '01': {
        title: 'Scaffold',
        dir: '01-scaffold',
        stages: ['buster'],
        test_suites: ['smoke'],
        auto_retry_threshold: 1,
      },
    },
  };

  const config = {
    project: 'behavior-buster-fail-session',
    default_timeout_minutes: 30,
    default_max_fails: 3,
    _disable_discord_webhooks: true,
    paths: { modules_dir: modulesRoot },
    telemetry: { enabled: true },
    _pluginRegistry: registry,
    _logDir: logRoot,
    _runLogDir: path.join(logRoot, 'pipeline', 'runs', runId),
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
    _testOverrides: {
      moduleRunner: {
        checkDependencies: () => ({ met: true }),
        gitSyncBeforeBuster: async () => {},
        resolvePolicy: () => ({ model: 'buster-model', model_source: 'project_default' }),
        logEffectivePolicy: () => {},
        buildBusterModulePrompt: () => ({ prompt: 'Run smoke' }),
        savePrompt: () => {},
        validateBusterConfig: () => {},
        archiveModuleCompletions: async () => {},
        spawnAgent: async () => ({ dispatch_id: 'dispatch-buster-fail-01' }),
        pollDualWithRateLimitRecovery: async () => {
          const status = statusStoreMod.loadStatus(config, '01-scaffold');
          status.active_agent = {
            ...(status.active_agent || {}),
            session_key: sessionKey,
            dispatch_id: 'dispatch-buster-fail-01',
            label: 'dispatch-buster-fail-01',
            model: 'buster-model',
            phase: 'buster',
          };
          statusStoreMod.saveStatus(config, '01-scaffold', status);
          return {
            ok: true,
            status: {
              _redis_entry: {
                status: 'FAIL',
                source: 'buster-subagent',
                summary: 'Smoke suite failed after agent execution',
              },
            },
          };
        },
        killAgent: async () => {},
        saveStreamLog: () => {},
        clearShutdownContext: () => {},
        setShutdownContext: () => {},
        extractAgentFailReason: () => 'Smoke suite failed after agent execution',
        sleep: async () => {},
      },
    },
  };

  seedCanonicalReadyForTestingStatus(statusStoreMod, config, '01-scaffold', initialStatus);

  const result = await moduleRunnerMod.runModule(config, progress, '01');
  await flushAsync();

  assert.equal(result.exit, 10);
  assert.equal(result.attempt, 2);
  assert.equal(result.dispatch_id, 'dispatch-buster-fail-01');
  assert.equal(result.session_key, sessionKey);
  assert.equal(result.module_status?.attempt, 2);
  assert.equal(result.module_status?.dispatch_id, 'dispatch-buster-fail-01');
  assert.equal(result.module_status?.session_key, sessionKey);

  const streamEvents = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
  const failEvent = streamEvents.find((event) => event.type === 'module.status_changed' && event.new_status === 'FAIL');
  assert.equal(Boolean(failEvent), true);
  assert.equal(failEvent.dispatch_id, 'dispatch-buster-fail-01');
  assert.equal(failEvent.gateway_label, 'dispatch-buster-fail-01');
  assert.equal(failEvent.session_key, sessionKey);

  const retryEvent = streamEvents.find((event) => event.type === 'retry.scheduled');
  assert.equal(Boolean(retryEvent), true);
  assert.equal(retryEvent.dispatch_id, 'dispatch-buster-fail-01');
  assert.equal(retryEvent.gateway_label, 'dispatch-buster-fail-01');
  assert.equal(retryEvent.session_key, sessionKey);

  const discordLogPath = path.join(config._runLogDir, 'discord.jsonl');
  const discordEntries = fs.readFileSync(discordLogPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const autoRetryEntry = discordEntries.find((entry) => entry.title === 'Module 01 FAIL (buster) — Auto-Retry');
  assert.equal(Boolean(autoRetryEntry), true);
  assert.equal(autoRetryEntry.run_id, runId);
  assert.equal(autoRetryEntry.dispatch_id, 'dispatch-buster-fail-01');
  assert.equal(autoRetryEntry.gateway_label, 'dispatch-buster-fail-01');
  assert.equal(autoRetryEntry.session_key, sessionKey);
  assert.equal(autoRetryEntry.fields.some((field) => field.name === 'Run ID' && field.value === runId), true);
  assert.equal(autoRetryEntry.fields.some((field) => field.name === 'Dispatch' && field.value === 'dispatch-buster-fail-01'), true);
  assert.equal(autoRetryEntry.fields.some((field) => field.name === 'Label' && field.value === 'dispatch-buster-fail-01'), true);
  assert.equal(autoRetryEntry.fields.some((field) => field.name === 'Session' && field.value === sessionKey), true);

  const needsNovaEntry = discordEntries.find((entry) => entry.title === 'Module 01 NEEDS_NOVA (buster)');
  assert.equal(Boolean(needsNovaEntry), true);
  assert.equal(needsNovaEntry.run_id, runId);
  assert.equal(needsNovaEntry.dispatch_id, 'dispatch-buster-fail-01');
  assert.equal(needsNovaEntry.gateway_label, 'dispatch-buster-fail-01');
  assert.equal(needsNovaEntry.session_key, sessionKey);
  assert.equal(needsNovaEntry.fields.some((field) => field.name === 'Run ID' && field.value === runId), true);
  assert.equal(needsNovaEntry.fields.some((field) => field.name === 'Dispatch' && field.value === 'dispatch-buster-fail-01'), true);
  assert.equal(needsNovaEntry.fields.some((field) => field.name === 'Label' && field.value === 'dispatch-buster-fail-01'), true);
  assert.equal(needsNovaEntry.fields.some((field) => field.name === 'Session' && field.value === sessionKey), true);
});

await record('module-runner buster crash exhaustion keeps dispatch correlation on telemetry and stop payloads', async () => {
  const moduleRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(moduleRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const moduleRunnerMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/runners/module-runner.js');
  const runtimeCoreMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const registry = await buildBuiltInRegistry(moduleRuntimeRoot);
  const statusStoreMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/services/status-store.js');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-crash-dispatch-'));
  const logRoot = path.join(repoRoot, '.swarm', 'logs');
  const modulesRoot = path.join(repoRoot, 'modules');
  const runId = 'run-buster-crash-dispatch-1';
  fs.mkdirSync(path.join(modulesRoot, '01-scaffold'), { recursive: true });

  const progress = {
    execution_order: ['01'],
    modules: {
      '01': {
        title: 'Scaffold',
        dir: '01-scaffold',
        stages: ['buster'],
        test_suites: ['smoke'],
        max_buster_crash_retries: 1,
      },
    },
  };

  const config = {
    project: 'behavior-buster-crash-dispatch',
    default_timeout_minutes: 30,
    default_max_fails: 3,
    _disable_discord_webhooks: true,
    telemetry: { enabled: true },
    _pluginRegistry: registry,
    _logDir: logRoot,
    _runLogDir: path.join(logRoot, 'pipeline', 'runs', runId),
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
    paths: { modules_dir: modulesRoot },
    _testOverrides: {
      moduleRunner: {
        checkDependencies: () => ({ met: true }),
        gitSyncBeforeBuster: async () => {},
        resolvePolicy: () => ({ model: 'buster-model', model_source: 'project_default' }),
        logEffectivePolicy: () => {},
        buildBusterModulePrompt: () => ({ prompt: 'Run smoke' }),
        savePrompt: () => {},
        validateBusterConfig: () => {},
        archiveModuleCompletions: async () => {},
        spawnAgent: async () => ({ dispatch_id: `dispatch-buster-crash-01-attempt-${spawnCount += 1}` }),
        pollDualWithRateLimitRecovery: async () => {
          const dispatchId = `dispatch-buster-crash-01-attempt-${pollCount + 1}`;
          const sessionKey = `agent:main:acp:buster-crash-01-attempt-${pollCount + 1}`;
          const status = statusStoreMod.loadStatus(config, '01-scaffold');
          status.active_agent = {
            ...(status.active_agent || {}),
            session_key: sessionKey,
            dispatch_id: dispatchId,
            gateway_label: dispatchId,
            label: dispatchId,
            model: 'buster-model',
            phase: 'buster',
          };
          statusStoreMod.saveStatus(config, '01-scaffold', status);
          pollCount += 1;
          return {
            ok: false,
            reason: 'timeout',
            status: {
              detail: `timed out on crash attempt ${pollCount}`,
            },
          };
        },
        killAgent: async () => {},
        saveStreamLog: () => {},
        clearShutdownContext: () => {},
        setShutdownContext: () => {},
        sleep: async () => {},
      },
    },
  };

  let spawnCount = 0;
  let pollCount = 0;

  seedCanonicalReadyForTestingStatus(statusStoreMod, config, '01-scaffold', {
    module_id: '01',
    title: 'Scaffold',
    status: 'READY_FOR_TESTING',
    current_phase: null,
    fail_count: 0,
    fail_summaries: [],
    started_at: '2026-04-10T00:00:00.000Z',
    attempt_started_at: '2026-04-10T00:00:00.000Z',
    history: [],
    cost: {},
  });

  const result = await moduleRunnerMod.runModule(config, progress, '01');
  await flushAsync();

  assert.equal(result.exit, 20);
  assert.equal(result.attempt, 1);
  assert.equal(result.dispatch_id, 'dispatch-buster-crash-01-attempt-2');
  assert.equal(result.gateway_label, 'dispatch-buster-crash-01-attempt-2');
  assert.equal(result.session_key, 'agent:main:acp:buster-crash-01-attempt-2');

  const streamEvents = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
  const failEvent = streamEvents.find((event) => event.type === 'module.status_changed' && event.new_status === 'FAIL');
  assert.equal(Boolean(failEvent), true);
  assert.equal(failEvent.attempt, 1);
  assert.equal(failEvent.dispatch_id, 'dispatch-buster-crash-01-attempt-2');
  assert.equal(failEvent.gateway_label, 'dispatch-buster-crash-01-attempt-2');
  assert.equal(failEvent.session_key, 'agent:main:acp:buster-crash-01-attempt-2');

  const blockedEvent = streamEvents.find((event) => event.type === 'module.status_changed' && event.new_status === 'BLOCKED');
  assert.equal(Boolean(blockedEvent), true);
  assert.equal(blockedEvent.attempt, 1);
  assert.equal(blockedEvent.dispatch_id, 'dispatch-buster-crash-01-attempt-2');
  assert.equal(blockedEvent.gateway_label, 'dispatch-buster-crash-01-attempt-2');
  assert.equal(blockedEvent.session_key, 'agent:main:acp:buster-crash-01-attempt-2');

  const retryExhausted = streamEvents.find((event) => event.type === 'retry.exhausted');
  assert.equal(Boolean(retryExhausted), true);
  assert.equal(retryExhausted.attempt, 1);
  assert.equal(retryExhausted.phase, 'buster');
  assert.equal(retryExhausted.dispatch_id, 'dispatch-buster-crash-01-attempt-2');
  assert.equal(retryExhausted.gateway_label, 'dispatch-buster-crash-01-attempt-2');
  assert.equal(retryExhausted.session_key, 'agent:main:acp:buster-crash-01-attempt-2');
  assert.equal(retryExhausted.max_attempts, 2);
  assert.equal(retryExhausted.max_fails, 2);

  const discordLogPath = path.join(config._runLogDir, 'discord.jsonl');
  const discordEntries = fs.readFileSync(discordLogPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const blockedEntry = discordEntries.find((entry) => entry.title === 'Module 01 BLOCKED — Buster crashes');
  assert.equal(Boolean(blockedEntry), true);
  assert.equal(blockedEntry.run_id, runId);
  assert.equal(blockedEntry.dispatch_id, 'dispatch-buster-crash-01-attempt-2');
  assert.equal(blockedEntry.gateway_label, 'dispatch-buster-crash-01-attempt-2');
  assert.equal(blockedEntry.session_key, 'agent:main:acp:buster-crash-01-attempt-2');
  assert.equal(blockedEntry.fields.some((field) => field.name === 'Dispatch' && field.value === 'dispatch-buster-crash-01-attempt-2'), true);
  assert.equal(blockedEntry.fields.some((field) => field.name === 'Label' && field.value === 'dispatch-buster-crash-01-attempt-2'), true);
  assert.equal(blockedEntry.fields.some((field) => field.name === 'Session' && field.value === 'agent:main:acp:buster-crash-01-attempt-2'), true);
});

await record('module-runner Buster pre-test infra stop preserves dispatch correlation through telemetry, stop payload, and Discord', async () => {
  const moduleRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(moduleRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const moduleRunnerMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/runners/module-runner.js');
  const runtimeCoreMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const registry = await buildBuiltInRegistry(moduleRuntimeRoot);

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-pretest-infra-dispatch-'));
  const logRoot = path.join(repoRoot, '.swarm', 'logs');
  const modulesRoot = path.join(repoRoot, 'modules');
  const runId = 'run-buster-pretest-infra-dispatch-1';
  fs.mkdirSync(path.join(modulesRoot, '01-scaffold'), { recursive: true });

  let currentStatus = {
    module_id: '01',
    title: 'Scaffold',
    status: 'READY_FOR_TESTING',
    current_phase: null,
    fail_count: 0,
    fail_summaries: [],
    started_at: '2026-04-10T00:00:00.000Z',
    attempt_started_at: '2026-04-10T00:00:00.000Z',
    history: [],
    cost: {},
  };

  const progress = {
    execution_order: ['01'],
    modules: {
      '01': {
        title: 'Scaffold',
        dir: '01-scaffold',
        stages: ['buster'],
        test_suites: ['smoke'],
      },
    },
  };

  const config = {
    project: 'behavior-buster-pretest-infra-dispatch',
    default_timeout_minutes: 30,
    default_max_fails: 3,
    telemetry: { enabled: true },
    _disable_discord_webhooks: true,
    _pluginRegistry: registry,
    _logDir: logRoot,
    _runLogDir: path.join(logRoot, 'pipeline', 'runs', runId),
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
    paths: { modules_dir: modulesRoot },
    _testOverrides: {
      moduleRunner: {
        checkDependencies: () => ({ met: true }),
        loadStatus: () => JSON.parse(JSON.stringify(currentStatus)),
        saveStatus: (_config, _dir, status) => { currentStatus = JSON.parse(JSON.stringify(status)); },
        gitSyncBeforeBuster: async () => {},
        resolvePolicy: () => ({ model: 'buster-model', model_source: 'project_default' }),
        logEffectivePolicy: () => {},
        buildBusterModulePrompt: () => ({ prompt: 'Run smoke' }),
        savePrompt: () => {},
        saveStreamLog: () => {},
        validateBusterConfig: () => {},
        archiveModuleCompletions: async () => {},
        setShutdownContext: () => {},
        clearShutdownContext: () => {},
        spawnAgent: async () => ({ dispatch_id: 'dispatch-buster-pretest-infra-01' }),
        pollDualWithRateLimitRecovery: async () => ({
          ok: true,
          status: {
            status: 'FAIL',
            _redis_entry: {
              status: 'FAIL',
              source: 'test-buster-pipeline',
              verdict: 'FAIL',
              dispatch_id: 'dispatch-buster-pretest-infra-01',
              session_key: 'agent:main:acp:buster-pretest-infra-01',
            },
          },
        }),
        killAgent: async () => {},
        extractPreTestFailReason: () => 'Registry unavailable',
        classifyPreTestFailure: () => ({ kind: 'infra', code: 'ENV_UNAVAILABLE', summary: 'Registry unavailable', detail: 'registry unavailable' }),
        getFailedSuiteNames: () => ['smoke'],
        getPassedSuiteNames: () => [],
        buildPreTestDiscordFields: () => [{ name: 'Failing Suites', value: 'smoke', inline: true }],
      },
    },
  };

  const result = await moduleRunnerMod.runModule(config, progress, '01');
  await flushAsync();

  assert.equal(result.exit, 10);
  assert.equal(result.reason, 'Buster infra issue (ENV_UNAVAILABLE) — Forge output preserved: registry unavailable');
  assert.equal(result.dispatch_id, 'dispatch-buster-pretest-infra-01');
  assert.equal(result.gateway_label, 'dispatch-buster-pretest-infra-01');
  assert.equal(result.session_key, 'agent:main:acp:buster-pretest-infra-01');

  const streamEvents = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
  const failEvent = streamEvents.find((event) => event.type === 'module.status_changed' && event.new_status === 'FAIL');
  assert.equal(Boolean(failEvent), true);
  assert.equal(failEvent.dispatch_id, 'dispatch-buster-pretest-infra-01');
  assert.equal(failEvent.gateway_label, 'dispatch-buster-pretest-infra-01');
  assert.equal(failEvent.session_key, 'agent:main:acp:buster-pretest-infra-01');

  const discordLogPath = path.join(config._runLogDir, 'discord.jsonl');
  const discordEntries = fs.readFileSync(discordLogPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const infraEntry = discordEntries.find((entry) => entry.title === 'Module 01 — Buster Infra Issue');
  assert.equal(Boolean(infraEntry), true);
  assert.equal(infraEntry.run_id, runId);
  assert.equal(infraEntry.dispatch_id, 'dispatch-buster-pretest-infra-01');
  assert.equal(infraEntry.gateway_label, 'dispatch-buster-pretest-infra-01');
  assert.equal(infraEntry.session_key, 'agent:main:acp:buster-pretest-infra-01');
  assert.equal(infraEntry.fields.some((field) => field.name === 'Dispatch' && field.value === 'dispatch-buster-pretest-infra-01'), true);
  assert.equal(infraEntry.fields.some((field) => field.name === 'Label' && field.value === 'dispatch-buster-pretest-infra-01'), true);
  assert.equal(infraEntry.fields.some((field) => field.name === 'Session' && field.value === 'agent:main:acp:buster-pretest-infra-01'), true);
});

await record('module-runner repeated Buster pre-test stop preserves dispatch correlation through telemetry, stop payload, and Discord', async () => {
  const moduleRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(moduleRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const moduleRunnerMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/runners/module-runner.js');
  const runtimeCoreMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const registry = await buildBuiltInRegistry(moduleRuntimeRoot);

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-pretest-repeat-dispatch-'));
  const logRoot = path.join(repoRoot, '.swarm', 'logs');
  const modulesRoot = path.join(repoRoot, 'modules');
  const runId = 'run-buster-pretest-repeat-dispatch-1';
  fs.mkdirSync(path.join(modulesRoot, '01-scaffold'), { recursive: true });

  let currentStatus = {
    module_id: '01',
    title: 'Scaffold',
    status: 'READY_FOR_TESTING',
    current_phase: null,
    fail_count: 1,
    fail_summaries: [
      {
        attempt: 1,
        summary: '[buster/pre-test] smoke failed before subagent spawn',
        phase: 'buster',
      },
    ],
    started_at: '2026-04-10T00:00:00.000Z',
    attempt_started_at: '2026-04-10T00:00:00.000Z',
    history: [],
    cost: {},
  };

  const progress = {
    execution_order: ['01'],
    modules: {
      '01': {
        title: 'Scaffold',
        dir: '01-scaffold',
        stages: ['buster'],
        test_suites: ['smoke'],
      },
    },
  };

  const config = {
    project: 'behavior-buster-pretest-repeat-dispatch',
    default_timeout_minutes: 30,
    default_max_fails: 3,
    telemetry: { enabled: true },
    _disable_discord_webhooks: true,
    _pluginRegistry: registry,
    _logDir: logRoot,
    _runLogDir: path.join(logRoot, 'pipeline', 'runs', runId),
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
    paths: { modules_dir: modulesRoot },
    _testOverrides: {
      moduleRunner: {
        checkDependencies: () => ({ met: true }),
        loadStatus: () => JSON.parse(JSON.stringify(currentStatus)),
        saveStatus: (_config, _dir, status) => { currentStatus = JSON.parse(JSON.stringify(status)); },
        gitSyncBeforeBuster: async () => {},
        resolvePolicy: () => ({ model: 'buster-model', model_source: 'project_default' }),
        logEffectivePolicy: () => {},
        buildBusterModulePrompt: () => ({ prompt: 'Run smoke' }),
        savePrompt: () => {},
        saveStreamLog: () => {},
        validateBusterConfig: () => {},
        archiveModuleCompletions: async () => {},
        setShutdownContext: () => {},
        clearShutdownContext: () => {},
        spawnAgent: async () => ({ dispatch_id: 'dispatch-buster-pretest-repeat-01' }),
        pollDualWithRateLimitRecovery: async () => ({
          ok: true,
          status: {
            status: 'FAIL',
            _redis_entry: {
              status: 'FAIL',
              source: 'test-buster-pipeline',
              verdict: 'FAIL',
              dispatch_id: 'dispatch-buster-pretest-repeat-01',
              session_key: 'agent:main:acp:buster-pretest-repeat-01',
            },
          },
        }),
        killAgent: async () => {},
        extractPreTestFailReason: () => 'Smoke suite failed again',
        classifyPreTestFailure: () => ({ kind: 'code', code: 'SUITE_REPEAT', summary: 'Smoke suite failed again', detail: 'smoke suite failed again' }),
        getFailedSuiteNames: () => ['smoke'],
        getPassedSuiteNames: () => [],
        buildPreTestDiscordFields: () => [{ name: 'Failing Suites', value: 'smoke', inline: true }],
      },
    },
  };

  const result = await moduleRunnerMod.runModule(config, progress, '01');
  await flushAsync();

  assert.equal(result.exit, 10);
  assert.equal(result.reason, 'Repeated pre-test failure (smoke) — needs Nova review before another Forge cycle');
  assert.equal(result.dispatch_id, 'dispatch-buster-pretest-repeat-01');
  assert.equal(result.gateway_label, 'dispatch-buster-pretest-repeat-01');
  assert.equal(result.session_key, 'agent:main:acp:buster-pretest-repeat-01');

  const streamEvents = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
  const failEvent = streamEvents.find((event) => event.type === 'module.status_changed' && event.new_status === 'FAIL');
  assert.equal(Boolean(failEvent), true);
  assert.equal(failEvent.dispatch_id, 'dispatch-buster-pretest-repeat-01');
  assert.equal(failEvent.gateway_label, 'dispatch-buster-pretest-repeat-01');
  assert.equal(failEvent.session_key, 'agent:main:acp:buster-pretest-repeat-01');

  const discordLogPath = path.join(config._runLogDir, 'discord.jsonl');
  const discordEntries = fs.readFileSync(discordLogPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const repeatEntry = discordEntries.find((entry) => entry.title === 'Module 01 — Repeated Pre-Test Failure');
  assert.equal(Boolean(repeatEntry), true);
  assert.equal(repeatEntry.run_id, runId);
  assert.equal(repeatEntry.dispatch_id, 'dispatch-buster-pretest-repeat-01');
  assert.equal(repeatEntry.gateway_label, 'dispatch-buster-pretest-repeat-01');
  assert.equal(repeatEntry.session_key, 'agent:main:acp:buster-pretest-repeat-01');
  assert.equal(repeatEntry.fields.some((field) => field.name === 'Dispatch' && field.value === 'dispatch-buster-pretest-repeat-01'), true);
  assert.equal(repeatEntry.fields.some((field) => field.name === 'Label' && field.value === 'dispatch-buster-pretest-repeat-01'), true);
  assert.equal(repeatEntry.fields.some((field) => field.name === 'Session' && field.value === 'agent:main:acp:buster-pretest-repeat-01'), true);
});

await record('module-runner code-side Buster pre-test retry keeps dispatch correlation through retry telemetry and Discord', async () => {
  const moduleRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(moduleRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const moduleRunnerMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/runners/module-runner.js');
  const runtimeCoreMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const statusStoreMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/services/status-store.js');
  const registry = await buildBuiltInRegistry(moduleRuntimeRoot);

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-pretest-code-retry-'));
  const logRoot = path.join(repoRoot, '.swarm', 'logs');
  const modulesRoot = path.join(repoRoot, 'modules');
  const runId = 'run-buster-pretest-code-retry-1';
  fs.mkdirSync(path.join(modulesRoot, '01-scaffold'), { recursive: true });

  const sessionKey = 'agent:main:acp:buster-pretest-code-retry-01';
  const dispatchId = 'dispatch-buster-pretest-code-retry-01';
  let pollCount = 0;
  const initialStatus = {
    module_id: '01',
    title: 'Scaffold',
    status: 'READY_FOR_TESTING',
    current_phase: null,
    fail_count: 0,
    fail_summaries: [],
    started_at: '2026-04-10T00:00:00.000Z',
    attempt_started_at: '2026-04-10T00:00:00.000Z',
    history: [],
    cost: {},
  };

  const progress = {
    execution_order: ['01'],
    modules: {
      '01': {
        title: 'Scaffold',
        dir: '01-scaffold',
        stages: ['buster'],
        test_suites: ['smoke'],
        auto_retry_threshold: 1,
      },
    },
  };

  const config = {
    project: 'behavior-buster-pretest-code-retry',
    default_timeout_minutes: 30,
    default_max_fails: 3,
    telemetry: { enabled: true },
    _disable_discord_webhooks: true,
    _pluginRegistry: registry,
    _logDir: logRoot,
    _runLogDir: path.join(logRoot, 'pipeline', 'runs', runId),
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
    paths: { modules_dir: modulesRoot },
    _testOverrides: {
      moduleRunner: {
        checkDependencies: () => ({ met: true }),
        gitSyncBeforeBuster: async () => {},
        resolvePolicy: () => ({ model: 'buster-model', model_source: 'project_default' }),
        logEffectivePolicy: () => {},
        buildBusterModulePrompt: () => ({ prompt: 'Run smoke' }),
        savePrompt: () => {},
        saveStreamLog: () => {},
        validateBusterConfig: () => {},
        archiveModuleCompletions: async () => {},
        setShutdownContext: () => {},
        clearShutdownContext: () => {},
        spawnAgent: async () => ({ dispatch_id: dispatchId }),
        pollDualWithRateLimitRecovery: async () => {
          pollCount += 1;
          const status = statusStoreMod.loadStatus(config, '01-scaffold');
          status.active_agent = {
            ...(status.active_agent || {}),
            session_key: sessionKey,
            dispatch_id: dispatchId,
            gateway_label: dispatchId,
            label: dispatchId,
            model: 'buster-model',
            phase: 'buster',
          };
          statusStoreMod.saveStatus(config, '01-scaffold', status);
          if (pollCount === 1) {
            return {
              ok: true,
              status: {
                status: 'FAIL',
                _redis_entry: {
                  status: 'FAIL',
                  source: 'test-buster-pipeline',
                  verdict: 'FAIL',
                  dispatch_id: dispatchId,
                  session_key: sessionKey,
                },
              },
            };
          }
          return {
            ok: true,
            status: {
              _redis_entry: {
                status: 'FAIL',
                source: 'buster-subagent',
                dispatch_id: dispatchId,
                session_key: sessionKey,
                summary: 'Agent retry failure after pre-test retry',
              },
            },
          };
        },
        killAgent: async () => {},
        extractPreTestFailReason: () => 'Smoke suite failed before subagent spawn',
        classifyPreTestFailure: () => ({ kind: 'code', code: 'TEST_FAILED', summary: 'Smoke suite failed', detail: 'smoke suite failed' }),
        getFailedSuiteNames: () => ['smoke'],
        getPassedSuiteNames: () => [],
        buildPreTestDiscordFields: () => [{ name: 'Failing Suites', value: 'smoke', inline: true }],
        extractAgentFailReason: () => 'Agent retry failure after pre-test retry',
        sleep: async () => {},
      },
    },
  };

  seedCanonicalReadyForTestingStatus(statusStoreMod, config, '01-scaffold', initialStatus);

  const result = await moduleRunnerMod.runModule(config, progress, '01');
  await flushAsync();

  assert.equal(result.exit, 10);
  assert.equal(result.reason, 'buster failed 2x — auto-retry exhausted, Nova must intervene');
  assert.equal(result.dispatch_id, dispatchId);
  assert.equal(result.gateway_label, dispatchId);
  assert.equal(result.session_key, sessionKey);

  const streamEvents = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
  const retryEvent = streamEvents.find((event) => event.type === 'retry.scheduled');
  assert.equal(Boolean(retryEvent), true);
  assert.equal(retryEvent.dispatch_id, dispatchId);
  assert.equal(retryEvent.gateway_label, dispatchId);
  assert.equal(retryEvent.session_key, sessionKey);

  const discordLogPath = path.join(config._runLogDir, 'discord.jsonl');
  const discordEntries = fs.readFileSync(discordLogPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const autoRetryEntry = discordEntries.find((entry) => entry.title === 'Module 01 FAIL (buster) — Auto-Retry');
  assert.equal(Boolean(autoRetryEntry), true);
  assert.equal(autoRetryEntry.run_id, runId);
  assert.equal(autoRetryEntry.dispatch_id, dispatchId);
  assert.equal(autoRetryEntry.gateway_label, dispatchId);
  assert.equal(autoRetryEntry.session_key, sessionKey);
  assert.equal(autoRetryEntry.fields.some((field) => field.name === 'Dispatch' && field.value === dispatchId), true);
  assert.equal(autoRetryEntry.fields.some((field) => field.name === 'Label' && field.value === dispatchId), true);
  assert.equal(autoRetryEntry.fields.some((field) => field.name === 'Session' && field.value === sessionKey), true);
});

await record('failure-service blocked results keep dispatch correlation through retry exhaustion after active-agent cleanup', async () => {
  const moduleRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(moduleRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const failuresMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/services/failures.js');
  const runtimeCoreMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const statusStoreMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/services/status-store.js');
  const registry = await buildBuiltInRegistry(moduleRuntimeRoot);

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-failure-service-blocked-dispatch-'));
  const logRoot = path.join(repoRoot, '.swarm', 'logs');
  const runLogRoot = path.join(logRoot, 'pipeline', 'runs', 'run-failure-service-blocked-dispatch-1');
  const modulesRoot = path.join(repoRoot, 'modules');
  const moduleDir = path.join(modulesRoot, '01-scaffold');
  fs.mkdirSync(moduleDir, { recursive: true });
  fs.mkdirSync(runLogRoot, { recursive: true });

  const status = {
    module_id: '01',
    title: 'Scaffold',
    status: 'TESTING',
    current_phase: 'buster',
    fail_count: 1,
    fail_summaries: [
      {
        attempt: 1,
        timestamp: '2026-04-10T00:00:00.000Z',
        summary: 'Smoke suite failed on first run',
        phase: 'buster',
        failPattern: 'unknown',
        is_timeout: false,
        files_changed: null,
      },
    ],
    started_at: '2026-04-10T00:00:00.000Z',
    attempt_started_at: '2026-04-10T00:00:00.000Z',
    history: [],
    cost: {},
  };

  const config = {
    project: 'behavior-failure-service-blocked-dispatch',
    default_max_fails: 2,
    telemetry: { enabled: true },
    _disable_discord_webhooks: true,
    _pluginRegistry: registry,
    _logDir: logRoot,
    _runLogDir: runLogRoot,
    _runId: 'run-failure-service-blocked-dispatch-1',
    run_id: 'run-failure-service-blocked-dispatch-1',
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
    paths: { modules_dir: modulesRoot },
  };

  const seededStatus = seedCanonicalReadyForTestingStatus(statusStoreMod, config, '01-scaffold', {
    module_id: '01',
    title: 'Scaffold',
    started_at: '2026-04-10T00:00:00.000Z',
    ready_at: '2026-04-10T00:00:30.000Z',
    cost: {},
  });
  lifecycleStateMod.transitionModuleStatus(seededStatus, 'FAIL', {
    note: 'Synthetic first buster failure for retry-exhaustion verifier fixture',
    now: '2026-04-10T00:00:40.000Z',
  });
  statusStoreMod.saveStatus(config, '01-scaffold', seededStatus);
  seededStatus.fail_count = 1;
  seededStatus.fail_summaries = status.fail_summaries;
  lifecycleStateMod.transitionModuleStatus(seededStatus, 'READY_FOR_TESTING', {
    note: 'Synthetic retry-ready state for failure-service blocked verifier fixture',
    now: '2026-04-10T00:00:50.000Z',
  });
  statusStoreMod.saveStatus(config, '01-scaffold', seededStatus);
  lifecycleStateMod.startModulePhase(seededStatus, 'buster', 'Synthetic buster retry attempt for failure-service blocked verifier fixture', {
    now: '2026-04-10T00:01:00.000Z',
  });
  statusStoreMod.saveStatus(config, '01-scaffold', seededStatus);

  const result = await failuresMod.handleFail(
    config,
    seededStatus,
    '01-scaffold',
    '01',
    2,
    'buster',
    'Smoke suite failed after cleanup',
    {
      autoRetryThreshold: 1,
      dispatch_id: 'dispatch-buster-blocked-01',
      gateway_label: 'dispatch-buster-blocked-01',
      session_key: 'agent:main:acp:buster-blocked-01',
    },
  );
  await flushAsync();

  assert.equal(result.exit, 20);
  assert.equal(result.attempt, 2);
  assert.equal(result.dispatch_id, 'dispatch-buster-blocked-01');
  assert.equal(result.gateway_label, 'dispatch-buster-blocked-01');
  assert.equal(result.session_key, 'agent:main:acp:buster-blocked-01');
  assert.equal(result.status?.dispatch_id, 'dispatch-buster-blocked-01');

  const streamEvents = xaddEvents(`pipeline:telemetry:${config.project}:${config.run_id}`);
  const failEvent = streamEvents.find((event) => event.type === 'module.status_changed' && event.new_status === 'FAIL');
  assert(failEvent, 'missing terminal FAIL event');
  assert.equal(failEvent.dispatch_id, 'dispatch-buster-blocked-01');
  assert.equal(failEvent.gateway_label, 'dispatch-buster-blocked-01');
  assert.equal(failEvent.session_key, 'agent:main:acp:buster-blocked-01');

  const blockedEvent = streamEvents.find((event) => event.type === 'module.status_changed' && event.new_status === 'BLOCKED');
  assert(blockedEvent, 'missing terminal BLOCKED event');
  assert.equal(blockedEvent.dispatch_id, 'dispatch-buster-blocked-01');
  assert.equal(blockedEvent.gateway_label, 'dispatch-buster-blocked-01');
  assert.equal(blockedEvent.session_key, 'agent:main:acp:buster-blocked-01');

  const retryExhausted = streamEvents.find((event) => event.type === 'retry.exhausted');
  assert(retryExhausted, 'missing retry.exhausted event');
  assert.equal(retryExhausted.module_id, '01');
  assert.equal(retryExhausted.phase, 'buster');
  assert.equal(retryExhausted.dispatch_id, 'dispatch-buster-blocked-01');
  assert.equal(retryExhausted.gateway_label, 'dispatch-buster-blocked-01');
  assert.equal(retryExhausted.session_key, 'agent:main:acp:buster-blocked-01');
  assert.equal(retryExhausted.max_attempts, 2);
  assert.equal(retryExhausted.max_fails, 2);

  const discordLogPath = path.join(config._runLogDir, 'discord.jsonl');
  const discordEntries = fs.readFileSync(discordLogPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const blockedEntry = discordEntries.find((entry) => entry.title === 'Module 01 BLOCKED');
  assert.equal(Boolean(blockedEntry), true);
  assert.equal(blockedEntry.run_id, 'run-failure-service-blocked-dispatch-1');
  assert.equal(blockedEntry.dispatch_id, 'dispatch-buster-blocked-01');
  assert.equal(blockedEntry.gateway_label, 'dispatch-buster-blocked-01');
  assert.equal(blockedEntry.session_key, 'agent:main:acp:buster-blocked-01');
  assert.equal(blockedEntry.fields.some((field) => field.name === 'Run ID' && field.value === 'run-failure-service-blocked-dispatch-1'), true);
  assert.equal(blockedEntry.fields.some((field) => field.name === 'Dispatch' && field.value === 'dispatch-buster-blocked-01'), true);
  assert.equal(blockedEntry.fields.some((field) => field.name === 'Label' && field.value === 'dispatch-buster-blocked-01'), true);
  assert.equal(blockedEntry.fields.some((field) => field.name === 'Session' && field.value === 'agent:main:acp:buster-blocked-01'), true);
});

await record('module-runner early terminal EXIT_ERROR paths still emit module FAIL telemetry', async () => {
  const moduleRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(moduleRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const moduleRunnerMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/runners/module-runner.js');
  const runtimeCoreMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const registry = await buildBuiltInRegistry(moduleRuntimeRoot);

  const scenarios = [
    {
      name: 'dependency check failure',
      project: 'behavior-module-dependency-fail',
      runId: 'run-module-dependency-fail-1',
      expectedExit: 1,
      expectedReason: 'Dependencies not met: module 00 not PASS',
      expectedPhase: 'dependency_check',
      expectedOldStatus: 'PENDING',
      expectedGatewayLabel: 'dependency-check-01',
      expectedSessionKey: 'agent:main:acp:dependency-check-01',
      configure: ({ repoRoot }) => ({
        progress: {
          execution_order: ['01'],
          modules: { '01': { title: 'Scaffold', dir: '01-scaffold', stages: ['forge'] } },
        },
        config: {
          default_timeout_minutes: 30,
          default_max_fails: 3,
          paths: { modules_dir: path.join(repoRoot, 'modules') },
          telemetry: { enabled: true },
          _testOverrides: {
            moduleRunner: {
              checkDependencies: () => ({ met: false, reason: 'module 00 not PASS' }),
              loadStatus: () => ({
                module_id: '01',
                title: 'Scaffold',
                status: 'PENDING',
                current_phase: null,
                fail_count: 0,
                gateway_label: 'dependency-check-01',
                session_key: 'agent:main:acp:dependency-check-01',
                history: [],
              }),
            },
          },
        },
      }),
    },
    {
      name: 'corrupt status file',
      project: 'behavior-module-corrupt-status',
      runId: 'run-module-corrupt-status-1',
      expectedExit: 1,
      expectedReasonIncludes: 'exists but is unparseable (corrupt)',
      expectedPhase: 'status_load',
      expectedOldStatus: 'PENDING',
      expectedGatewayLabel: 'corrupt-status-01',
      expectedSessionKey: 'agent:main:acp:corrupt-status-01',
      configure: ({ repoRoot, modulesRoot }) => {
        const moduleDir = path.join(modulesRoot, '01-scaffold');
        fs.mkdirSync(moduleDir, { recursive: true });
        fs.writeFileSync(path.join(moduleDir, 'status.json'), '{\n  "gateway_label": "corrupt-status-01",\n  "session_key": "agent:main:acp:corrupt-status-01",\n  bad json\n');
        return {
          progress: {
            execution_order: ['01'],
            modules: { '01': { title: 'Scaffold', dir: '01-scaffold', stages: ['forge'] } },
          },
          config: {
            default_timeout_minutes: 30,
            default_max_fails: 3,
            paths: { modules_dir: modulesRoot },
            telemetry: { enabled: true },
            _testOverrides: {
              moduleRunner: {
                checkDependencies: () => ({ met: true }),
                loadStatus: () => null,
              },
            },
          },
        };
      },
    },
    {
      name: 'forge prompt assembly failure',
      project: 'behavior-module-forge-prompt-fail',
      runId: 'run-module-forge-prompt-fail-1',
      expectedExit: 1,
      expectedReason: 'prompt missing inputs',
      expectedPhase: 'forge',
      expectedOldStatus: 'IN_PROGRESS',
      expectedModel: 'forge-model',
      expectedGatewayLabel: 'forge-prompt-stop-01',
      expectedSessionKey: 'agent:main:acp:forge-prompt-stop-01',
      configure: ({ repoRoot, modulesRoot }) => ({
        progress: {
          execution_order: ['01'],
          modules: { '01': { title: 'Scaffold', dir: '01-scaffold', stages: ['forge'] } },
        },
        config: {
          default_timeout_minutes: 30,
          default_max_fails: 3,
          paths: { modules_dir: modulesRoot },
          telemetry: { enabled: true },
          _testOverrides: {
            moduleRunner: {
              checkDependencies: () => ({ met: true }),
              loadStatus: () => ({ module_id: '01', title: 'Scaffold', status: 'IN_PROGRESS', current_phase: null, fail_count: 0, gateway_label: 'forge-prompt-stop-01', session_key: 'agent:main:acp:forge-prompt-stop-01', started_at: '2026-04-10T00:00:00.000Z', history: [] }),
              resolvePolicy: () => ({ model: 'forge-model', thinking: 'high', model_source: 'project_default' }),
              logEffectivePolicy: () => {},
              buildForgePrompt: async () => ({ error: 'prompt missing inputs' }),
            },
          },
        },
      }),
    },
    {
      name: 'forge spawn failure',
      project: 'behavior-module-forge-spawn-fail',
      runId: 'run-module-forge-spawn-fail-1',
      expectedExit: 1,
      expectedReason: 'Forge spawn failed: gateway unavailable',
      expectedPhase: 'forge',
      expectedOldStatus: 'IN_PROGRESS',
      expectedModel: 'forge-model',
      expectedGatewayLabel: 'forge-spawn-fail-01',
      expectedSessionKey: 'agent:main:acp:forge-spawn-fail-01',
      configure: ({ repoRoot, modulesRoot }) => ({
        progress: {
          execution_order: ['01'],
          modules: { '01': { title: 'Scaffold', dir: '01-scaffold', stages: ['forge'] } },
        },
        config: {
          default_timeout_minutes: 30,
          default_max_fails: 3,
          paths: { modules_dir: modulesRoot },
          telemetry: { enabled: true },
          _testOverrides: {
            moduleRunner: {
              checkDependencies: () => ({ met: true }),
              loadStatus: () => ({ module_id: '01', title: 'Scaffold', status: 'IN_PROGRESS', current_phase: null, fail_count: 0, started_at: '2026-04-10T00:00:00.000Z', history: [] }),
              saveStatus: () => {},
              discord: async () => {},
              resolvePolicy: () => ({ model: 'forge-model', thinking: 'high', model_source: 'project_default' }),
              logEffectivePolicy: () => {},
              buildForgePrompt: async () => ({ prompt: 'forge prompt', recalledMemoryIds: [] }),
              savePrompt: () => {},
              spawnAgent: async () => {
                const err = new Error('gateway unavailable');
                err.gateway_label = 'forge-spawn-fail-01';
                err.session_key = 'agent:main:acp:forge-spawn-fail-01';
                throw err;
              },
              clearShutdownContext: () => {},
            },
          },
        },
      }),
    },
    {
      name: 'git sync before buster failure',
      project: 'behavior-module-gitsync-fail',
      runId: 'run-module-gitsync-fail-1',
      expectedExit: 1,
      expectedReason: 'push rejected',
      expectedPhase: 'git_sync',
      expectedOldStatus: 'READY_FOR_TESTING',
      configure: ({ repoRoot, modulesRoot }) => ({
        progress: {
          execution_order: ['01'],
          modules: { '01': { title: 'Scaffold', dir: '01-scaffold', stages: ['buster'] } },
        },
        config: {
          default_timeout_minutes: 30,
          default_max_fails: 3,
          paths: { modules_dir: modulesRoot },
          telemetry: { enabled: true },
          _testOverrides: {
            moduleRunner: {
              checkDependencies: () => ({ met: true }),
              loadStatus: () => ({ module_id: '01', title: 'Scaffold', status: 'READY_FOR_TESTING', current_phase: null, fail_count: 0, started_at: '2026-04-10T00:00:00.000Z', history: [] }),
              saveStatus: () => {},
              gitSyncBeforeBuster: async () => { throw new Error('push rejected'); },
            },
          },
        },
      }),
    },
    {
      name: 'buster prompt build failure',
      project: 'behavior-module-buster-prompt-fail',
      runId: 'run-module-buster-prompt-fail-1',
      expectedExit: 1,
      expectedReason: 'missing buster prompt inputs',
      expectedPhase: 'buster',
      expectedOldStatus: 'READY_FOR_TESTING',
      expectedModel: 'buster-model',
      expectedGatewayLabel: 'buster-prompt-stop-01',
      expectedSessionKey: 'agent:main:acp:buster-prompt-stop-01',
      configure: ({ repoRoot, modulesRoot }) => ({
        progress: {
          execution_order: ['01'],
          modules: { '01': { title: 'Scaffold', dir: '01-scaffold', stages: ['buster'] } },
        },
        config: {
          default_timeout_minutes: 30,
          default_max_fails: 3,
          paths: { modules_dir: modulesRoot },
          telemetry: { enabled: true },
          _testOverrides: {
            moduleRunner: {
              checkDependencies: () => ({ met: true }),
              loadStatus: () => ({ module_id: '01', title: 'Scaffold', status: 'READY_FOR_TESTING', current_phase: null, fail_count: 0, gateway_label: 'buster-prompt-stop-01', session_key: 'agent:main:acp:buster-prompt-stop-01', started_at: '2026-04-10T00:00:00.000Z', history: [] }),
              saveStatus: () => {},
              gitSyncBeforeBuster: async () => {},
              resolvePolicy: () => ({ model: 'buster-model', model_source: 'project_default' }),
              logEffectivePolicy: () => {},
              buildBusterModulePrompt: () => ({ error: 'missing buster prompt inputs' }),
            },
          },
        },
      }),
    },
    {
      name: 'buster spawn failure',
      project: 'behavior-module-buster-spawn-fail',
      runId: 'run-module-buster-spawn-fail-1',
      expectedExit: 1,
      expectedReason: 'Buster spawn failed: buster queue unavailable',
      expectedPhase: 'buster',
      expectedOldStatus: 'TESTING',
      expectDispatchMirrorsGatewayLabel: true,
      expectedModel: 'buster-model',
      expectedGatewayLabelPrefix: 'buster-module-01-',
      expectedSessionKey: 'agent:buster:spawn-fail-01',
      configure: ({ repoRoot, modulesRoot }) => ({
        progress: {
          execution_order: ['01'],
          modules: { '01': { title: 'Scaffold', dir: '01-scaffold', stages: ['buster'], test_suites: ['smoke'] } },
        },
        config: {
          default_timeout_minutes: 30,
          default_max_fails: 3,
          paths: { modules_dir: modulesRoot },
          telemetry: { enabled: true },
          _testOverrides: {
            moduleRunner: {
              checkDependencies: () => ({ met: true }),
              loadStatus: () => ({ module_id: '01', title: 'Scaffold', status: 'READY_FOR_TESTING', current_phase: null, fail_count: 0, started_at: '2026-04-10T00:00:00.000Z', session_key: 'agent:buster:spawn-fail-01', history: [] }),
              saveStatus: () => {},
              gitSyncBeforeBuster: async () => {},
              resolvePolicy: () => ({ model: 'buster-model', model_source: 'project_default' }),
              logEffectivePolicy: () => {},
              buildBusterModulePrompt: () => ({ prompt: 'Run tests' }),
              savePrompt: () => {},
              validateBusterConfig: () => {},
              discord: async () => {},
              archiveModuleCompletions: async () => {},
              spawnAgent: async () => { throw new Error('buster queue unavailable'); },
              clearShutdownContext: () => {},
            },
          },
        },
      }),
    },
    {
      name: 'unexpected terminal status',
      project: 'behavior-module-unexpected-status',
      runId: 'run-module-unexpected-status-1',
      expectedExit: 1,
      expectedReason: 'Unexpected status: MYSTERY',
      expectedPhase: null,
      expectedOldStatus: 'MYSTERY',
      expectedGatewayLabel: 'mystery-module-01',
      expectedSessionKey: 'agent:main:acp:mystery-module-01',
      configure: ({ repoRoot, modulesRoot }) => ({
        progress: {
          execution_order: ['01'],
          modules: { '01': { title: 'Scaffold', dir: '01-scaffold', stages: ['forge', 'buster'] } },
        },
        config: {
          default_timeout_minutes: 30,
          default_max_fails: 3,
          paths: { modules_dir: modulesRoot },
          telemetry: { enabled: true },
          _testOverrides: {
            moduleRunner: {
              checkDependencies: () => ({ met: true }),
              loadStatus: () => ({ module_id: '01', title: 'Scaffold', status: 'MYSTERY', current_phase: null, fail_count: 0, gateway_label: 'mystery-module-01', session_key: 'agent:main:acp:mystery-module-01', started_at: '2026-04-10T00:00:00.000Z', history: [] }),
            },
          },
        },
      }),
    },
  ];

  for (const scenario of scenarios) {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${scenario.project}-`));
    const logRoot = path.join(repoRoot, '.swarm', 'logs');
    const modulesRoot = path.join(repoRoot, 'modules');
    fs.mkdirSync(modulesRoot, { recursive: true });

    const built = scenario.configure({ repoRoot, modulesRoot });
    const config = {
      project: scenario.project,
      telemetry: { enabled: true },
      _logDir: logRoot,
      _runLogDir: path.join(logRoot, 'pipeline', 'runs', scenario.runId),
      _runId: scenario.runId,
      run_id: scenario.runId,
      _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
      _pluginRegistry: registry,
      ...built.config,
    };

    const result = await moduleRunnerMod.runModule(config, built.progress, '01');
    await flushAsync();

    assert.equal(result.exit, scenario.expectedExit, scenario.name);
    if (scenario.expectedReason !== undefined) {
      assert.equal(result.reason, scenario.expectedReason, scenario.name);
    }
    if (scenario.expectedReasonIncludes) {
      assert.equal(String(result.reason || '').includes(scenario.expectedReasonIncludes), true, scenario.name);
    }
    if (scenario.expectedGatewayLabel !== undefined) {
      assert.equal(result.gateway_label, scenario.expectedGatewayLabel, scenario.name);
    }
    if (scenario.expectedGatewayLabelPrefix !== undefined) {
      assert.equal(String(result.gateway_label || '').startsWith(scenario.expectedGatewayLabelPrefix), true, scenario.name);
    }
    if (scenario.expectedSessionKey !== undefined) {
      assert.equal(result.session_key, scenario.expectedSessionKey, scenario.name);
    }

    const streamEvents = xaddEvents(`pipeline:telemetry:${config.project}:${scenario.runId}`);
    const failEvent = streamEvents.find((event) => event.type === 'module.status_changed' && event.new_status === 'FAIL');
    assert.equal(Boolean(failEvent), true, scenario.name);
    assert.equal(failEvent.module_id, '01', scenario.name);
    assert.equal(failEvent.phase ?? null, scenario.expectedPhase, scenario.name);
    assert.equal(failEvent.old_status ?? null, scenario.expectedOldStatus, scenario.name);
    if (scenario.expectedModel !== undefined) {
      assert.equal(failEvent.model, scenario.expectedModel, scenario.name);
    }
    if (scenario.expectedGatewayLabel !== undefined) {
      assert.equal(failEvent.gateway_label, scenario.expectedGatewayLabel, scenario.name);
    }
    if (scenario.expectedGatewayLabelPrefix !== undefined) {
      assert.equal(String(failEvent.gateway_label || '').startsWith(scenario.expectedGatewayLabelPrefix), true, scenario.name);
    }
    if (scenario.expectedSessionKey !== undefined) {
      assert.equal(failEvent.session_key, scenario.expectedSessionKey, scenario.name);
    }
    if (scenario.expectDispatchMirrorsGatewayLabel) {
      assert.equal(Boolean(result.dispatch_id), true, scenario.name);
      assert.equal(result.dispatch_id, result.gateway_label, scenario.name);
      assert.equal(failEvent.dispatch_id, result.dispatch_id, scenario.name);
      assert.equal(failEvent.gateway_label, result.gateway_label, scenario.name);
    }
    if (scenario.expectedReason !== undefined) {
      assert.equal(failEvent.reason, scenario.expectedReason, scenario.name);
    }
    if (scenario.expectedReasonIncludes) {
      assert.equal(String(failEvent.reason || '').includes(scenario.expectedReasonIncludes), true, scenario.name);
    }
  }
});

await record('module rate-limit exhaustion emits authoritative retry exhaustion telemetry before returning EXIT_RATE_LIMITED', async () => {
  const moduleRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(moduleRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const moduleRunnerMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/runners/module-runner.js');
  const runtimeCoreMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const registry = await buildBuiltInRegistry(moduleRuntimeRoot);

  const scenarios = [
    {
      name: 'forge phase exhaustion',
      project: 'behavior-module-rate-limit-forge',
      runId: 'run-module-rate-limit-forge-1',
      expectedReason: 'Rate limit pauses exceeded maximum — pipeline halted',
      expectedPhase: 'forge',
      expectedGatewayLabel: 'forge-01',
      expectedSessionKey: 'agent:main:acp:forge-rate-limit',
      expectedAttempt: 4,
      expectedDiscordTitle: 'Module 01 RATE LIMITED',
      expectedMaxRateLimitPauses: 3,
      expectedReturnedMaxRateLimitPauses: 3,
      expectedReturnedRateLimitStatusSessionKey: 'agent:main:acp:forge-rate-limit',
      expectedReturnedRateLimitStatusMaxRateLimitPauses: 3,
      expectedDiscordDescription: 'Forge attempt 4 exceeded max ACP rate limit pauses (3). Pipeline cannot continue.',
      progress: {
        execution_order: ['01'],
        modules: { '01': { title: 'Scaffold', dir: '01-scaffold', stages: ['forge'] } },
      },
      buildOverrides: (discordCalls) => ({
        checkDependencies: () => ({ met: true }),
        loadStatus: () => ({
          module_id: '01',
          title: 'Scaffold',
          status: 'IN_PROGRESS',
          current_phase: 'forge',
          fail_count: 0,
          attempt: 1,
          started_at: '2026-04-10T00:00:00.000Z',
          attempt_started_at: '2026-04-10T00:00:00.000Z',
          history: [],
        }),
        saveStatus: () => {},
        resolvePolicy: () => ({ model: 'forge-model', thinking: 'high', model_source: 'project_default', thinking_source: 'project_default' }),
        modelToHarness: () => 'forge',
        logEffectivePolicy: () => {},
        buildForgePrompt: async () => ({ prompt: 'forge prompt', recalledMemoryIds: [] }),
        savePrompt: () => {},
        discord: async (_config, _level, title, description, fields) => { discordCalls.push({ title, description, fields }); },
        setShutdownContext: () => {},
        clearShutdownContext: () => {},
        invalidateHeadHash: () => {},
        headHash: () => 'abc123',
        spawnAgent: async () => {},
        verifyAgentAlive: async () => true,
        acpLabel: () => 'forge-01',
        getTrackedAgent: () => ({ sessionKey: 'agent:main:acp:forge-rate-limit', streamLogPath: null, gatewayLabel: 'forge-01', runtime: 'acp', agentId: 'forge' }),
        pollWithRateLimitRecovery: async () => ({
          ok: false,
          reason: 'rate_limit_exhausted',
          attempt: 4,
          status: {
            attempt: 4,
            session_key: 'agent:main:acp:forge-rate-limit',
          },
          rate_limit_status: {
            attempt: 4,
            session_key: 'agent:main:acp:forge-rate-limit',
            max_rate_limit_pauses: 3,
          },
        }),
        killAgent: async () => {},
        saveStreamLog: () => {},
        sleep: async () => {},
      }),
    },
    {
      name: 'buster phase exhaustion',
      project: 'behavior-module-rate-limit-buster',
      runId: 'run-module-rate-limit-buster-1',
      expectedReason: 'Rate limit pauses exceeded maximum during Buster phase',
      expectedPhase: 'buster',
      expectedGatewayLabel: 'dispatch-buster-01',
      expectedSessionKey: 'agent:buster:rate-limit',
      expectedAttempt: 7,
      expectedDiscordTitle: 'Module 01 RATE LIMITED (Buster)',
      expectedMaxRateLimitPauses: 4,
      expectedReturnedDispatchId: 'dispatch-buster-01',
      expectedReturnedMaxRateLimitPauses: 4,
      expectedReturnedRateLimitStatusSessionKey: 'agent:buster:rate-limit',
      expectedReturnedRateLimitStatusMaxRateLimitPauses: 4,
      expectedDiscordDescription: 'Buster attempt 7 exceeded max ACP rate limit pauses (4).',
      progress: {
        execution_order: ['01'],
        modules: { '01': { title: 'Scaffold', dir: '01-scaffold', stages: ['buster'], test_suites: ['smoke'] } },
      },
      buildOverrides: (discordCalls) => ({
        checkDependencies: () => ({ met: true }),
        loadStatus: () => ({
          module_id: '01',
          title: 'Scaffold',
          status: 'READY_FOR_TESTING',
          current_phase: null,
          fail_count: 0,
          attempt: 1,
          started_at: '2026-04-10T00:00:00.000Z',
          attempt_started_at: '2026-04-10T00:00:00.000Z',
          history: [],
        }),
        saveStatus: () => {},
        gitSyncBeforeBuster: async () => {},
        resolvePolicy: () => ({ model: 'buster-model', model_source: 'project_default' }),
        logEffectivePolicy: () => {},
        buildBusterModulePrompt: () => ({ prompt: 'Run smoke' }),
        savePrompt: () => {},
        validateBusterConfig: () => {},
        discord: async (_config, _level, title, description, fields) => { discordCalls.push({ title, description, fields }); },
        archiveModuleCompletions: async () => {},
        setShutdownContext: () => {},
        clearShutdownContext: () => {},
        spawnAgent: async () => ({ dispatch_id: 'dispatch-buster-01' }),
        pollDualWithRateLimitRecovery: async () => ({
          ok: false,
          reason: 'rate_limit_exhausted',
          attempt: 7,
          status: {
            attempt: 7,
            session_key: 'agent:buster:rate-limit',
          },
          rate_limit_status: {
            attempt: 7,
            session_key: 'agent:buster:rate-limit',
            max_rate_limit_pauses: 4,
          },
        }),
        killAgent: async () => {},
        saveStreamLog: () => {},
        sleep: async () => {},
      }),
    },
  ];

  for (const scenario of scenarios) {
    scenario.discordCalls = [];
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${scenario.project}-`));
    const logRoot = path.join(repoRoot, '.swarm', 'logs');
    const modulesRoot = path.join(repoRoot, 'modules');
    fs.mkdirSync(modulesRoot, { recursive: true });

    const config = {
      project: scenario.project,
      default_timeout_minutes: 30,
      default_max_fails: 3,
      rate_limit: { max_pauses_per_module: 2 },
      telemetry: { enabled: true },
      _logDir: logRoot,
      _runLogDir: path.join(logRoot, 'pipeline', 'runs', scenario.runId),
      _runId: scenario.runId,
      run_id: scenario.runId,
      _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
      _pluginRegistry: registry,
      paths: { modules_dir: modulesRoot },
      _testOverrides: {
        moduleRunner: scenario.buildOverrides(scenario.discordCalls),
      },
    };

    const result = await moduleRunnerMod.runModule(config, scenario.progress, '01');
    await flushAsync();

    assert.equal(result.exit, 40, scenario.name);
    assert.equal(result.reason, scenario.expectedReason, scenario.name);
    assert.equal(result.run_id, scenario.runId, `${scenario.name}: returned run id`);
    assert.equal(result.attempt, scenario.expectedAttempt, scenario.name);
    if (scenario.expectedGatewayLabel) {
      assert.equal(result.gateway_label, scenario.expectedGatewayLabel, scenario.name);
      assert.equal(result.session_key, scenario.expectedSessionKey, scenario.name);
    }
    if (scenario.expectedReturnedDispatchId) {
      assert.equal(result.dispatch_id, scenario.expectedReturnedDispatchId, `${scenario.name}: returned dispatch id`);
    }
    if (scenario.expectedReturnedMaxRateLimitPauses !== undefined) {
      assert.equal(result.max_rate_limit_pauses, scenario.expectedReturnedMaxRateLimitPauses, scenario.name);
    }
    assert.equal(result.module, '01', `${scenario.name}: returned module id`);
    assert.equal(result.module_dir, '01-scaffold', `${scenario.name}: returned module dir`);
    if (scenario.expectedReturnedRateLimitStatusSessionKey) {
      assert.equal(result.rate_limit_exhausted, true, `${scenario.name}: canonical exhausted flag`);
      assert.equal(result.rate_limit_status?.run_id, scenario.runId, `${scenario.name}: returned rate-limit status run id`);
      assert.equal(result.rate_limit_status?.session_key, scenario.expectedReturnedRateLimitStatusSessionKey, `${scenario.name}: returned rate-limit status session`);
      assert.equal(result.rate_limit_status?.max_rate_limit_pauses, scenario.expectedReturnedRateLimitStatusMaxRateLimitPauses, `${scenario.name}: returned rate-limit status pause budget`);
    }

    const streamEvents = xaddEvents(`pipeline:telemetry:${config.project}:${scenario.runId}`);
    const retryExhausted = streamEvents.find((event) => event.type === 'retry.exhausted');
    assert(retryExhausted, `${scenario.name}: missing retry.exhausted event`);
    assert.equal(retryExhausted.module_id, '01', scenario.name);
    assert.equal(retryExhausted.phase, scenario.expectedPhase, scenario.name);
    assert.equal(retryExhausted.session_key, scenario.expectedSessionKey, scenario.name);
    assert.equal(retryExhausted.attempt, scenario.expectedAttempt, scenario.name);
    assert.equal(retryExhausted.max_attempts, scenario.expectedMaxRateLimitPauses, scenario.name);
    assert.equal(retryExhausted.max_fails, scenario.expectedMaxRateLimitPauses, scenario.name);
    assert.equal(retryExhausted.reason, scenario.expectedReason, scenario.name);

    const exhaustedDiscord = scenario.discordCalls.at(-1);
    assert.equal(exhaustedDiscord?.description, scenario.expectedDiscordDescription, `${scenario.name}: operator Discord description`);
    if (scenario.expectedDiscordTitle) {
      assert.equal(exhaustedDiscord?.title, scenario.expectedDiscordTitle, `${scenario.name}: operator Discord title`);
      assert.equal(getFieldValue(exhaustedDiscord?.fields, 'Run ID'), scenario.runId, `${scenario.name}: operator Discord run id`);
      assert.equal(getFieldValue(exhaustedDiscord?.fields, 'Module'), '01', `${scenario.name}: operator Discord module`);
      assert.equal(getFieldValue(exhaustedDiscord?.fields, 'Attempt'), `${scenario.expectedAttempt}`, `${scenario.name}: operator Discord attempt`);
      if (scenario.expectedReturnedDispatchId) {
        assert.equal(getFieldValue(exhaustedDiscord?.fields, 'Dispatch'), scenario.expectedReturnedDispatchId, `${scenario.name}: operator Discord dispatch`);
      }
      assert.equal(getFieldValue(exhaustedDiscord?.fields, 'Label'), scenario.expectedGatewayLabel, `${scenario.name}: operator Discord label`);
      assert.equal(getFieldValue(exhaustedDiscord?.fields, 'Session'), scenario.expectedSessionKey, `${scenario.name}: operator Discord session`);
    }
  }
});

await record('module polling rate-limit recovery reuses the shared session owner for forge and buster pause-resume lifecycle', async () => {
  const moduleRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(moduleRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const rateLimitMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/services/rate-limit.js');
  const runtimeCoreMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const statusStoreMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/services/status-store.js');

  const scenarios = [
    {
      name: 'forge',
      phase: 'forge',
      initialStatus: 'IN_PROGRESS',
      initialPhase: 'forge',
      attempt: 1,
      sessionKey: 'agent:main:acp:forge-shared-owner',
      gatewayLabel: 'forge-01',
      dispatchId: null,
      expectedResumedStatus: 'IN_PROGRESS',
    },
    {
      name: 'buster',
      phase: 'buster',
      initialStatus: 'READY_FOR_TESTING',
      initialPhase: null,
      attempt: 2,
      sessionKey: 'agent:main:acp:buster-shared-owner',
      gatewayLabel: 'dispatch-buster-01',
      dispatchId: 'dispatch-buster-01',
      expectedResumedStatus: 'TESTING',
    },
  ];

  for (const scenario of scenarios) {
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), `behavior-module-shared-rate-limit-${scenario.name}-`));
    const logRoot = path.join(repoRoot, '.swarm', 'logs');
    const runId = `run-module-shared-rate-limit-${scenario.name}-1`;
    const modulesRoot = path.join(repoRoot, 'modules');
    const moduleDir = '01-scaffold';
    fs.mkdirSync(path.join(modulesRoot, moduleDir), { recursive: true });

    const config = {
      project: `behavior-module-shared-rate-limit-${scenario.name}`,
      rate_limit: { max_pauses_per_module: 2, cooldown_hours: 0 },
      telemetry: { enabled: true },
      _disable_discord_webhooks: true,
      _logDir: logRoot,
      _runLogDir: path.join(logRoot, 'pipeline', 'runs', runId),
      _runId: runId,
      run_id: runId,
      _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
      paths: { modules_dir: modulesRoot },
    };

    statusStoreMod.saveStatus(config, moduleDir, {
      module_id: '01',
      title: 'Scaffold',
      status: scenario.initialStatus,
      current_phase: scenario.initialPhase,
      fail_count: 0,
      attempt: scenario.attempt,
      started_at: '2026-04-10T00:00:00.000Z',
      attempt_started_at: '2026-04-10T00:00:00.000Z',
      history: [],
      active_agent: {
        session_key: scenario.sessionKey,
        gateway_label: scenario.gatewayLabel,
        dispatch_id: scenario.dispatchId,
        model: `${scenario.phase}-model`,
      },
    });

    let pollCalls = 0;
    const result = await rateLimitMod.withRateLimitRecovery(config, moduleDir, async () => {
      pollCalls += 1;
      if (pollCalls === 1) {
        return {
          ok: false,
          reason: 'rate_limited',
          status: {
            module_id: '01',
            attempt: scenario.attempt,
            dispatch_id: scenario.dispatchId,
            session_key: scenario.sessionKey,
            gateway_label: scenario.gatewayLabel,
          },
        };
      }
      return {
        ok: true,
        reason: 'target_reached',
        status: statusStoreMod.loadStatus(config, moduleDir),
      };
    }, {
      phase: scenario.phase,
      moduleId: '01',
    });

    await flushAsync();

    assert.equal(pollCalls, 2, `${scenario.name}: poll restart count`);
    assert.equal(result.ok, true, `${scenario.name}: final poll result`);

    const finalStatus = statusStoreMod.loadStatus(config, moduleDir);
    assert.equal(finalStatus.status, scenario.expectedResumedStatus, `${scenario.name}: resumed status`);
    assert.equal(finalStatus.current_phase, scenario.phase, `${scenario.name}: resumed phase`);
    assert.equal(finalStatus.history.some((entry) => entry.to === 'RATE_LIMITED'), true, `${scenario.name}: history records pause`);
    assert.equal(finalStatus.history.some((entry) => entry.to === scenario.expectedResumedStatus), true, `${scenario.name}: history records resume`);

    const streamEvents = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    const rateLimitDetected = streamEvents.find((event) => event.type === 'rate_limit.detected');
    assert(rateLimitDetected, `${scenario.name}: missing rate_limit.detected`);
    assert.equal(rateLimitDetected.module_id, '01', `${scenario.name}: telemetry module id`);
    assert.equal(rateLimitDetected.agent_type, scenario.phase, `${scenario.name}: telemetry phase`);
    assert.equal(rateLimitDetected.session_key, scenario.sessionKey, `${scenario.name}: telemetry session`);
    if (scenario.dispatchId) {
      assert.equal(rateLimitDetected.dispatch_id, scenario.dispatchId, `${scenario.name}: telemetry dispatch`);
    }

    const pauseEvent = streamEvents.find((event) => event.type === 'module.status_changed' && event.new_status === 'RATE_LIMITED');
    const resumeEvent = streamEvents.find((event) => event.type === 'module.status_changed' && event.new_status === scenario.expectedResumedStatus);
    assert(pauseEvent, `${scenario.name}: missing paused status event`);
    assert(resumeEvent, `${scenario.name}: missing resumed status event`);
    assert.equal(pauseEvent.phase, scenario.phase, `${scenario.name}: pause event phase`);
    assert.equal(resumeEvent.phase, scenario.phase, `${scenario.name}: resume event phase`);
    assert.equal(pauseEvent.dispatch_id, scenario.dispatchId, `${scenario.name}: pause event dispatch`);
    assert.equal(resumeEvent.dispatch_id, scenario.dispatchId, `${scenario.name}: resume event dispatch`);
    assert.equal(pauseEvent.gateway_label, scenario.gatewayLabel, `${scenario.name}: pause event label`);
    assert.equal(resumeEvent.gateway_label, scenario.gatewayLabel, `${scenario.name}: resume event label`);
    assert.equal(pauseEvent.session_key, scenario.sessionKey, `${scenario.name}: pause event session`);
    assert.equal(resumeEvent.session_key, scenario.sessionKey, `${scenario.name}: resume event session`);

    const discordLog = fs.readFileSync(path.join(config._runLogDir, 'discord.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const pauseDiscord = discordLog.find((entry) => entry.title === '⏳ Rate Limited — Pause 1/2');
    const resumeDiscord = discordLog.find((entry) => entry.title === 'Rate limit cooldown complete');
    assert(pauseDiscord, `${scenario.name}: missing pause Discord entry`);
    assert(resumeDiscord, `${scenario.name}: missing resume Discord entry`);
    assert.equal(pauseDiscord.fields.some((field) => field.name === 'Run ID' && field.value === runId), true, `${scenario.name}: pause run id field`);
    assert.equal(pauseDiscord.fields.some((field) => field.name === 'Module' && field.value === '01'), true, `${scenario.name}: pause module field`);
    assert.equal(pauseDiscord.fields.some((field) => field.name === 'Phase' && field.value === scenario.phase), true, `${scenario.name}: pause phase field`);
    assert.equal(pauseDiscord.fields.some((field) => field.name === 'Label' && field.value === scenario.gatewayLabel), true, `${scenario.name}: pause label field`);
    assert.equal(pauseDiscord.fields.some((field) => field.name === 'Session' && field.value === scenario.sessionKey), true, `${scenario.name}: pause session field`);
    assert.equal(resumeDiscord.description, 'Resuming module 01', `${scenario.name}: resume description`);
    assert.equal(resumeDiscord.fields.some((field) => field.name === 'Run ID' && field.value === runId), true, `${scenario.name}: resume run id field`);
    assert.equal(resumeDiscord.fields.some((field) => field.name === 'Phase' && field.value === scenario.phase), true, `${scenario.name}: resume phase field`);
    if (scenario.dispatchId) {
      assert.equal(pauseDiscord.fields.some((field) => field.name === 'Dispatch' && field.value === scenario.dispatchId), true, `${scenario.name}: pause dispatch field`);
      assert.equal(resumeDiscord.fields.some((field) => field.name === 'Dispatch' && field.value === scenario.dispatchId), true, `${scenario.name}: resume dispatch field`);
    }
  }
});

await record('direct module handleRateLimit compatibility path reuses shared owner and preserves run-id correlation', async () => {
  const moduleRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(moduleRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const rateLimitMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/services/rate-limit.js');
  const runtimeCoreMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const statusStoreMod = await importRuntimeModule(moduleRuntimeRoot, '/app/skills/pipeline/services/status-store.js');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-module-handle-rate-limit-'));
  const logRoot = path.join(repoRoot, '.swarm', 'logs');
  const runId = 'run-module-handle-rate-limit-1';
  const modulesRoot = path.join(repoRoot, 'modules');
  const moduleDir = '01-scaffold';
  fs.mkdirSync(path.join(modulesRoot, moduleDir), { recursive: true });

  const config = {
    project: 'behavior-module-handle-rate-limit',
    rate_limit: { max_pauses_per_module: 3, cooldown_hours: 0 },
    telemetry: { enabled: true },
    _disable_discord_webhooks: true,
    _logDir: logRoot,
    _runLogDir: path.join(logRoot, 'pipeline', 'runs', runId),
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
    paths: { modules_dir: modulesRoot },
  };

  statusStoreMod.saveStatus(config, moduleDir, {
    module_id: '01',
    title: 'Scaffold',
    status: 'IN_PROGRESS',
    current_phase: 'forge',
    fail_count: 0,
    attempt: 3,
    started_at: '2026-04-10T00:00:00.000Z',
    attempt_started_at: '2026-04-10T00:00:00.000Z',
    history: [],
    active_agent: {
      session_key: 'agent:main:acp:forge-handle-rate-limit',
      gateway_label: 'forge-compat-01',
      dispatch_id: 'dispatch-forge-compat-01',
      model: 'forge-model',
    },
  });

  await rateLimitMod.handleRateLimit(config, {
    module_id: '01',
    current_phase: 'forge',
    attempt: 3,
    reason: '429 Too Many Requests',
    rate_limit_reason: 'provider requested cooldown',
    session_key: 'agent:main:acp:forge-handle-rate-limit',
    gateway_label: 'forge-compat-01',
    dispatch_id: 'dispatch-forge-compat-01',
  }, moduleDir, 1, 3);

  await flushAsync();

  const finalStatus = statusStoreMod.loadStatus(config, moduleDir);
  assert.equal(finalStatus.status, 'IN_PROGRESS');
  assert.equal(finalStatus.current_phase, 'forge');
  assert.equal(finalStatus.history.some((entry) => entry.to === 'RATE_LIMITED'), true);
  assert.equal(finalStatus.history.some((entry) => entry.to === 'IN_PROGRESS'), true);

  const streamEvents = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
  const rateLimitDetected = streamEvents.find((event) => event.type === 'rate_limit.detected');
  assert(rateLimitDetected, 'direct handleRateLimit: missing rate_limit.detected');
  assert.equal(rateLimitDetected.module_id, '01');
  assert.equal(rateLimitDetected.agent_type, 'forge');
  assert.equal(rateLimitDetected.dispatch_id, 'dispatch-forge-compat-01');
  assert.equal(rateLimitDetected.session_key, 'agent:main:acp:forge-handle-rate-limit');

  const discordLog = fs.readFileSync(path.join(config._runLogDir, 'discord.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const pauseDiscord = discordLog.find((entry) => entry.title === '⏳ Rate Limited — Pause 1/3');
  const resumeDiscord = discordLog.find((entry) => entry.title === 'Rate limit cooldown complete');
  assert(pauseDiscord, 'direct handleRateLimit: missing pause Discord entry');
  assert(resumeDiscord, 'direct handleRateLimit: missing resume Discord entry');
  assert.equal(pauseDiscord.fields.some((field) => field.name === 'Run ID' && field.value === runId), true);
  assert.equal(pauseDiscord.fields.some((field) => field.name === 'Module' && field.value === '01'), true);
  assert.equal(pauseDiscord.fields.some((field) => field.name === 'Phase' && field.value === 'forge'), true);
  assert.equal(pauseDiscord.fields.some((field) => field.name === 'Dispatch' && field.value === 'dispatch-forge-compat-01'), true);
  assert.equal(pauseDiscord.fields.some((field) => field.name === 'Label' && field.value === 'forge-compat-01'), true);
  assert.equal(pauseDiscord.fields.some((field) => field.name === 'Session' && field.value === 'agent:main:acp:forge-handle-rate-limit'), true);
  assert.equal(resumeDiscord.description, 'Resuming module 01');
  assert.equal(resumeDiscord.fields.some((field) => field.name === 'Run ID' && field.value === runId), true);
  assert.equal(resumeDiscord.fields.some((field) => field.name === 'Phase' && field.value === 'forge'), true);
  assert.equal(resumeDiscord.fields.some((field) => field.name === 'Dispatch' && field.value === 'dispatch-forge-compat-01'), true);
});
}
