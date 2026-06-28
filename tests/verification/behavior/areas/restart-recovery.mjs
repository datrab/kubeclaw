import {
  buildBuiltInRegistry,
  platformTestDefaults,
} from './helpers.mjs';

export async function registerRestartRecoveryArea({
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
function platformRestartRecoveryDefaults() {
  return {
    ...platformTestDefaults(),
    fallback_model: 'openai/gpt-5.4',
    default_timeout_minutes: 30,
    default_max_fails: 3,
    rate_limit: { max_pauses_per_module: 3, cooldown_hours: 0 },
    pre_check: { enabled: false, lint_report_path: '/app/skills/pipeline/tools/lint-report.ts', timeout_seconds: 60 },
    review_defaults: { timeout_minutes: 30, max_fix_cycles: 3, lint_tier: 'full', lint_required: false },
    acp_monitor: {
      poll_limit: 10,
      max_transcript_extensions: 3,
      transcript_grace_ms: 300000,
      monitor_poll_ms: 10000,
    },
  };
}

function seedModuleLifecycleReadModel(statusStoreMod, config, moduleId, moduleDir, statusData = {}) {
  const occurredAt = statusData.updated_at || new Date(Date.now() - (15 * 60 * 1000)).toISOString();
  const startedStatus = {
    ...statusData,
    status: 'IN_PROGRESS',
    current_phase: 'forge',
  };
  statusStoreMod.appendModuleLifecycleEvent(config, moduleDir, startedStatus, {
    eventType: 'module_attempt.started',
    oldStatus: 'PENDING',
    previousPhase: null,
    now: occurredAt,
  });
  if (statusData.current_phase === 'buster') {
    statusStoreMod.appendModuleLifecycleEvent(config, moduleDir, statusData, {
      eventType: 'module_attempt.testing_started',
      oldStatus: 'READY_FOR_TESTING',
      previousPhase: 'forge',
      now: occurredAt,
    });
  }
  const readModels = statusStoreMod.loadLifecycleReadModels(config);
  if (statusData.current_phase !== 'buster') {
    readModels.modules ||= {};
    readModels.modules[moduleId] = {
      ...(readModels.modules[moduleId] || {}),
      status: statusData.status || 'IN_PROGRESS',
      current_phase: statusData.current_phase ?? 'forge',
      latest_event_type: 'module_attempt.started',
      latest_event_at: occurredAt,
    };
  }
  readModels.modules ||= {};
  readModels.active_sessions ||= { modules: {}, gates: {} };
  readModels.active_sessions.modules ||= {};
  readModels.modules[moduleId] = {
    ...(readModels.modules[moduleId] || {}),
    module_id: moduleId,
    title: statusData.title || null,
    module_dir: moduleDir,
    status: statusData.status || 'PENDING',
    current_phase: statusData.current_phase ?? null,
    fail_count: statusData.fail_count ?? 0,
    current_attempt: statusData.active_agent?.attempt ?? null,
    latest_event_type: statusData.current_phase === 'buster' ? 'module_attempt.testing_started' : 'module_attempt.started',
    latest_event_at: statusData.updated_at || new Date(Date.now() - (15 * 60 * 1000)).toISOString(),
    projection_source: 'canonical-events',
  };
  if (statusData.active_agent?.session_key) {
    readModels.active_sessions.modules[moduleId] = {
      module_id: moduleId,
      ...statusData.active_agent,
      projection_source: 'canonical-events',
    };
  } else {
    delete readModels.active_sessions.modules[moduleId];
  }
  statusStoreMod.saveLifecycleReadModels(config, readModels);
}

function seedGateActiveSessionReadModel(statusStoreMod, config, gateId, gateType, activeSession = {}) {
  const readModels = statusStoreMod.loadLifecycleReadModels(config);
  readModels.gates ||= {};
  readModels.active_sessions ||= { modules: {}, gates: {} };
  readModels.active_sessions.gates ||= {};
  readModels.gates[gateId] = {
    ...(readModels.gates[gateId] || {}),
    gate_id: gateId,
    gate_type: gateType || null,
    status: 'PENDING',
    scheduler_consumed: false,
    projection_source: 'canonical-events',
  };
  readModels.active_sessions.gates[gateId] = {
    gate_id: gateId,
    ...activeSession,
    projection_source: 'canonical-events',
  };
  statusStoreMod.saveLifecycleReadModels(config, readModels);
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

	await record('restart-time stale ACP recovery clears orphaned module session and preserves file-only gate evidence', async () => {
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);
  const { runtimeRoot: reconcileRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(reconcileRuntimeRoot);
  const reconcileRunnerMod = await importRuntimeModule(reconcileRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
  const reconcilePathsMod = await importRuntimeModule(reconcileRuntimeRoot, '/app/skills/pipeline/core/paths.ts');
  const statusStoreMod = await importRuntimeModule(reconcileRuntimeRoot, '/app/skills/pipeline/services/status-store.ts');

  const requests = [];
  const sessionStates = new Map([
    ['agent:main:acp:module', 'running'],
    ['agent:main:acp:gate', 'running'],
  ]);
  let moduleStatusFailureInjected = false;
  let gateStatusFailureInjected = false;
  const gateway = await startGatewayServer(async ({ body }) => {
    requests.push(body);
    if (body?.tool === 'session_status') {
      if (body?.args?.sessionKey === 'agent:main:acp:module' && !moduleStatusFailureInjected) {
        moduleStatusFailureInjected = true;
        throw new Error('session status unreachable during stale recovery (module)');
      }
      if (body?.args?.sessionKey === 'agent:main:acp:gate' && !gateStatusFailureInjected) {
        gateStatusFailureInjected = true;
        throw new Error('session status unreachable during stale recovery (gate)');
      }
      return { result: { details: { state: sessionStates.get(body?.args?.sessionKey) || 'closed' } } };
    }
    if (body?.tool === 'sessions_send') {
      sessionStates.set(body?.args?.sessionKey, 'closed');
      return { result: { details: { ok: true } } };
    }
    return { result: { details: { ok: true } } };
  });

  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  process.env.OPENCLAW_GATEWAY_URL = gateway.url;

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-reconcile-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const modulesDir = path.join(swarmDir, 'modules');
  const logDir = path.join(swarmDir, 'logs');
  fs.mkdirSync(path.join(modulesDir, '01'), { recursive: true });
  fs.mkdirSync(path.join(logDir, 'gates', 'review-01'), { recursive: true });

    const deps = {
      pipelineRunner: {
        output: () => {},
        releaseGateFiles: async () => {},
        syncControlFiles: async () => {},
        writeSummary: () => {},
        generateProjectSummary: async () => {},
        generatePipelineReview: async () => {},
        generateCaseStudy: async () => {},
        readGateOutput: () => ({ isPass: false }),
        runArchValidator: async () => ({ blocked: false, findings: [] }),
      },
    };
const config = {
    ...platformRestartRecoveryDefaults(),
    project: 'behavior-demo',
    repo_root: repoRoot,
    _runId: 'run-reconcile',
    run_id: 'run-reconcile',
    telemetry: platformRestartRecoveryDefaults().telemetry,
    _runStats: {},
    pluginRegistry: withStubbedGeneratorStages(await buildBuiltInRegistry(reconcileRuntimeRoot)),
    paths: {
      swarm_dir: swarmDir,
      modules_dir: modulesDir,
    },
    poll_interval_seconds: 1,
    default_timeout_minutes: 1,
    arch_validation: { ...platformRestartRecoveryDefaults().arch_validation, enabled: false },
      };

  const progress = {
    modules: {
      '01': { dir: '01' },
    },
    gates: {
      'review-01': { type: 'review' },
    },
    execution_order: [],
    arch_validation: { ...platformRestartRecoveryDefaults().arch_validation, enabled: false },
  };

  const module01Status = {
    module_id: '01',
    status: 'IN_PROGRESS',
    current_phase: 'forge',
    fail_count: 2,
    updated_at: new Date(Date.now() - (20 * 60 * 1000)).toISOString(),
    history: [],
    active_agent: {
      session_key: 'agent:main:acp:module',
      stream_log_path: null,
      label: 'forge-01',
      gateway_label: 'forge-01-123',
      run_id: 'run-reconcile',
      attempt: '3',
      dispatch_id: 'forge-01-dispatch-3',
      runtime: 'acp',
      model: 'claude-sonnet',
      agent_id: 'claude',
    },
  };

  fs.writeFileSync(reconcilePathsMod.gateActiveSessionPath(config, 'review-01'), JSON.stringify({
    gate_id: 'review-01',
    phase: 'review_fix',
    session_key: 'agent:main:acp:gate',
    stream_log_path: null,
    label: 'reviewfix-review-01-1',
    gateway_label: 'reviewfix-review-01-1-123',
    run_id: 'run-reconcile',
    attempt: '2',
    dispatch_id: 'buster-gate-review-01-dispatch-2',
    runtime: 'acp',
    model: 'claude-sonnet',
    agent_id: 'claude',
  }, null, 2));
  seedModuleLifecycleReadModel(statusStoreMod, config, '01', '01', module01Status);
  seedGateActiveSessionReadModel(statusStoreMod, config, 'review-01', 'review', JSON.parse(fs.readFileSync(reconcilePathsMod.gateActiveSessionPath(config, 'review-01'), 'utf8')));

  try {
    const exitCode = await reconcileRunnerMod.runPipeline(config, progress, { deps, skipArchValidation: true }, { deps });
    assert.equal(exitCode, 0);
    await flushAsync();

	    const moduleStatus = statusStoreMod.loadStatus(config, '01');
	    assert.equal(moduleStatus.status, 'PENDING');
	    assert.equal(moduleStatus.current_phase, null);
	    assert.equal(moduleStatus.active_agent, null);
	    assert.equal(fs.existsSync(reconcilePathsMod.gateActiveSessionPath(config, 'review-01')), true);

	    const lifecycleEvents = statusStoreMod.readLifecycleEvents(config);
	    const staleRecoveryEvents = lifecycleEvents.filter((event) => event.type === 'recovery.stale_reset');
	    assert.equal(staleRecoveryEvents.length, 1);
	    assert.equal(staleRecoveryEvents.some((event) => event.refs?.module_id === '01' && event.data?.recovery_action === 'killed_orphan'), true);
	    assert.equal(staleRecoveryEvents.some((event) => event.refs?.gate_id === 'review-01'), false);

	    const readModels = statusStoreMod.loadLifecycleReadModels(config);
	    assert.equal(readModels.modules['01'].status, 'PENDING');
	    assert.equal(readModels.modules['01'].last_recovery_action, 'killed_orphan');
	    assert.equal(readModels.gates['review-01']?.last_recovery_action || null, null);

    const streamKey = 'pipeline:telemetry:behavior-demo:run-reconcile';
    const events = xaddEvents(streamKey);
    const recoveredStatus = events.find((event) => event.type === 'module.status_changed' && event.module_id === '01' && event.new_status === 'PENDING');
    assert(recoveredStatus, 'missing module.status_changed for stale module recovery');
    assert.equal(recoveredStatus.old_status, 'IN_PROGRESS');
    assert.equal(recoveredStatus.phase, 'forge');
    assert.match(recoveredStatus.reason || '', /Recovered stale forge state/);

    const moduleObservabilityDegraded = events.find((event) => event.type === 'observability.degraded' && event.module_id === '01' && event.reason === 'gateway_unreachable');
    assert(moduleObservabilityDegraded, 'missing stale module recovery observability.degraded event');
    assert.equal(moduleObservabilityDegraded.surface, 'gateway');
    assert.equal(moduleObservabilityDegraded.session_key, 'agent:main:acp:module');
    assert.equal(moduleObservabilityDegraded.attempt, 3);
    assert.match(moduleObservabilityDegraded.detail || '', /Gateway session_status failed:/);

    const moduleObservabilityRestored = events.find((event) => event.type === 'observability.restored' && event.module_id === '01' && event.reason === 'gateway_unreachable');
    assert(moduleObservabilityRestored, 'missing stale module recovery observability.restored event');
    assert.equal(moduleObservabilityRestored.surface, 'gateway');
    assert.equal(moduleObservabilityRestored.session_key, 'agent:main:acp:module');
    assert.equal(moduleObservabilityRestored.attempt, 3);
    assert.equal(moduleObservabilityRestored.detail, 'session status reachable again');
    assert.equal(typeof moduleObservabilityRestored.restored_after_ms, 'number');

	    const gateObservability = events.find((event) => (event.type === 'observability.degraded' || event.type === 'observability.restored') && event.gate_id === 'review-01');
	    assert.equal(gateObservability, undefined);

	    const stopRequests = requests.filter((req) => req?.tool === 'sessions_send');
	    assert.deepEqual(stopRequests.map((req) => req?.args?.sessionKey), [
	      'agent:main:acp:module',
	    ]);

    const discordAuditPath = path.join(logDir, 'pipeline', 'discord.jsonl');
    const discordEntries = fs.readFileSync(discordAuditPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

    const moduleRecoveryDiscord = discordEntries.find((entry) => entry.title === 'Module 01 — Recovered stale forge state');
    assert(moduleRecoveryDiscord, 'missing module stale-recovery Discord alert');
    assert.equal(moduleRecoveryDiscord.fields.some((field) => field.name === 'Attempt' && field.value === '3'), true);
    assert.equal(moduleRecoveryDiscord.fields.some((field) => field.name === 'Gateway Label' && field.value === 'forge-01-123'), true);
    assert.equal(moduleRecoveryDiscord.fields.some((field) => field.name === 'Session' && field.value === 'agent:main:acp:module'), true);
    assert.equal(moduleRecoveryDiscord.fields.some((field) => field.name === 'Recovery Action' && field.value === 'killed_orphan'), true);
    assert.equal(moduleRecoveryDiscord.gateway_label, 'forge-01-123');
    assert.equal(moduleRecoveryDiscord.attempt, 3);

	    const gateRecoveryDiscord = discordEntries.find((entry) => entry.title === 'Gate review-01 — Recovered stale review_fix session');
	    assert.equal(gateRecoveryDiscord, undefined);
  } finally {
    if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    await gateway.close();
  }
});

await record('restart-time observed-terminal module and gate reconciliation resets without stop requests', async () => {
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);
  const { runtimeRoot: reconcileRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(reconcileRuntimeRoot);
  const reconcileRunnerMod = await importRuntimeModule(reconcileRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
  const reconcilePathsMod = await importRuntimeModule(reconcileRuntimeRoot, '/app/skills/pipeline/core/paths.ts');
  const statusStoreMod = await importRuntimeModule(reconcileRuntimeRoot, '/app/skills/pipeline/services/status-store.ts');

  const requests = [];
  const gateway = await startGatewayServer(async ({ body }) => {
    requests.push(body);
    if (body?.tool === 'session_status') {
      return { result: { details: { state: 'closed' } } };
    }
    if (body?.tool === 'sessions_send') {
      return { result: { details: { ok: true } } };
    }
    return { result: { details: { ok: true } } };
  });

  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  process.env.OPENCLAW_GATEWAY_URL = gateway.url;

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-reconcile-terminal-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const modulesDir = path.join(swarmDir, 'modules');
  const logDir = path.join(swarmDir, 'logs');
  fs.mkdirSync(path.join(modulesDir, '04'), { recursive: true });
  fs.mkdirSync(path.join(logDir, 'gates', 'review-terminal'), { recursive: true });

    const configDeps2 = {
      pipelineRunner: {
        output: () => {},
        releaseGateFiles: async () => {},
        syncControlFiles: async () => {},
        writeSummary: () => {},
        generateProjectSummary: async () => {},
        generatePipelineReview: async () => {},
        generateCaseStudy: async () => {},
      },
    };
const config = {
    ...platformRestartRecoveryDefaults(),
    project: 'behavior-terminal-reconcile',
    repo_root: repoRoot,
    _runId: 'run-terminal-reconcile',
    run_id: 'run-terminal-reconcile',
    telemetry: platformRestartRecoveryDefaults().telemetry,
    _disable_discord_webhooks: true,
    _runStats: {},
    pluginRegistry: withStubbedGeneratorStages(await buildBuiltInRegistry(reconcileRuntimeRoot)),
    paths: {
      swarm_dir: swarmDir,
      modules_dir: modulesDir,
    },
    arch_validation: { ...platformRestartRecoveryDefaults().arch_validation, enabled: false },
      };

  const progress = {
    modules: {
      '04': { dir: '04', title: 'Terminal Module' },
    },
    gates: {
      'review-terminal': { type: 'review', title: 'Terminal Review' },
    },
    execution_order: [],
    arch_validation: { ...platformRestartRecoveryDefaults().arch_validation, enabled: false },
  };

  const module04Status = {
    module_id: '04',
    title: 'Terminal Module',
    status: 'IN_PROGRESS',
    current_phase: 'forge',
    fail_count: 0,
    updated_at: new Date(Date.now() - (15 * 60 * 1000)).toISOString(),
    history: [],
    active_agent: {
      session_key: 'agent:main:acp:module-terminal',
      stream_log_path: null,
      label: 'forge-04-diagnostic-label',
      gateway_label: 'forge-04-gateway-label',
      run_id: 'run-terminal-reconcile',
      attempt: '1',
      dispatch_id: 'forge-04-dispatch-1',
      runtime: 'acp',
      model: 'claude-sonnet',
      agent_id: 'claude',
    },
  };

  fs.writeFileSync(reconcilePathsMod.gateActiveSessionPath(config, 'review-terminal'), JSON.stringify({
    gate_id: 'review-terminal',
    phase: 'review_fix',
    session_key: 'agent:main:acp:gate-terminal',
    stream_log_path: null,
    label: 'reviewfix-terminal-diagnostic-label',
    gateway_label: 'reviewfix-terminal-gateway-label',
    run_id: 'run-terminal-reconcile',
    attempt: '1',
    dispatch_id: 'review-terminal-dispatch-1',
    runtime: 'acp',
    model: 'claude-sonnet',
    agent_id: 'claude',
  }, null, 2));
  seedModuleLifecycleReadModel(statusStoreMod, config, '04', '04', module04Status);
  seedGateActiveSessionReadModel(statusStoreMod, config, 'review-terminal', 'review', JSON.parse(fs.readFileSync(reconcilePathsMod.gateActiveSessionPath(config, 'review-terminal'), 'utf8')));

  try {
    const exitCode = await reconcileRunnerMod.runPipeline(config, progress, { deps: configDeps2, skipArchValidation: true }, { deps: configDeps2 });
    assert.equal(exitCode, 0);
    await flushAsync();

	    const moduleStatus = statusStoreMod.loadStatus(config, '04');
	    assert.equal(moduleStatus.status, 'PENDING');
	    assert.equal(moduleStatus.current_phase, null);
	    assert.equal(moduleStatus.active_agent, null);
	    assert.equal(fs.existsSync(reconcilePathsMod.gateActiveSessionPath(config, 'review-terminal')), true);

	    const lifecycleEvents = statusStoreMod.readLifecycleEvents(config);
	    const staleRecoveryEvents = lifecycleEvents.filter((event) => event.type === 'recovery.stale_reset');
	    assert.equal(staleRecoveryEvents.length, 1);
	    const moduleRecovery = staleRecoveryEvents.find((event) => event.refs?.module_id === '04');
	    const gateRecovery = staleRecoveryEvents.find((event) => event.refs?.gate_id === 'review-terminal');
	    assert(moduleRecovery, 'missing observed-terminal module recovery event');
	    assert.equal(gateRecovery, undefined);
	    assert.equal(moduleRecovery.data?.recovery_action, 'observed_terminal');
	    assert.equal(moduleRecovery.data?.stale_evidence?.observed_via, 'session_monitor');
	    assert.equal(moduleRecovery.data?.gateway_label, 'forge-04-gateway-label');
	    assert.equal(moduleRecovery.data?.stale_evidence?.diagnostic_label, 'forge-04-diagnostic-label');

	    const stopRequests = requests.filter((req) => req?.tool === 'sessions_send');
	    assert.equal(stopRequests.length, 0, 'observed terminal sessions must not receive stop requests');

	    const discordAuditPath = path.join(logDir, 'pipeline', 'discord.jsonl');
	    const discordEntries = fs.readFileSync(discordAuditPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
	    const moduleRecoveryDiscord = discordEntries.find((entry) => entry.title === 'Module 04 — Recovered stale forge state');
	    const gateRecoveryDiscord = discordEntries.find((entry) => entry.title === 'Gate review-terminal — Recovered stale review_fix session');
	    assert(moduleRecoveryDiscord, 'missing observed-terminal module Discord alert');
	    assert.equal(gateRecoveryDiscord, undefined);
	    assert.equal(moduleRecoveryDiscord.fields.some((field) => field.name === 'Recovery Action' && field.value === 'observed_terminal'), true);
	    assert.equal(moduleRecoveryDiscord.fields.some((field) => field.name === 'Diagnostic Label' && field.value === 'forge-04-diagnostic-label'), true);
	    assert.equal(moduleRecoveryDiscord.gateway_label, 'forge-04-gateway-label');
  } finally {
    if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    await gateway.close();
  }
});

await record('restart-time stale no-session module recovery refuses age-only reset with durable evidence', async () => {
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);
  const { runtimeRoot: reconcileRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(reconcileRuntimeRoot);
  const reconcileRunnerMod = await importRuntimeModule(reconcileRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
  const reconcilePathsMod = await importRuntimeModule(reconcileRuntimeRoot, '/app/skills/pipeline/core/paths.ts');
  const statusStoreMod = await importRuntimeModule(reconcileRuntimeRoot, '/app/skills/pipeline/services/status-store.ts');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-reconcile-no-session-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const modulesDir = path.join(swarmDir, 'modules');
  const logDir = path.join(swarmDir, 'logs');
  fs.mkdirSync(path.join(modulesDir, '02'), { recursive: true });

    const configDeps3 = {
      pipelineRunner: {
        output: () => {},
        releaseGateFiles: async () => {},
        syncControlFiles: async () => {},
        writeSummary: () => {},
        generateProjectSummary: async () => {},
        generatePipelineReview: async () => {},
        generateCaseStudy: async () => {},
      },
    };
const config = {
    ...platformRestartRecoveryDefaults(),
    project: 'behavior-no-session-reconcile',
    repo_root: repoRoot,
    _runId: 'run-no-session-reconcile',
    run_id: 'run-no-session-reconcile',
    telemetry: platformRestartRecoveryDefaults().telemetry,
    _disable_discord_webhooks: true,
    _runStats: {},
    pluginRegistry: withStubbedGeneratorStages(await buildBuiltInRegistry(reconcileRuntimeRoot)),
    paths: {
      swarm_dir: swarmDir,
      modules_dir: modulesDir,
    },
    arch_validation: { ...platformRestartRecoveryDefaults().arch_validation, enabled: false },
      };

  const progress = {
    modules: {
      '02': { dir: '02', title: 'No Session Module' },
    },
    gates: {},
    execution_order: [],
    arch_validation: { ...platformRestartRecoveryDefaults().arch_validation, enabled: false },
  };

  const module02Status = {
    module_id: '02',
    title: 'No Session Module',
    status: 'TESTING',
    current_phase: 'buster',
    fail_count: 1,
    updated_at: new Date(Date.now() - (25 * 60 * 1000)).toISOString(),
    history: [],
    active_agent: null,
  };
  seedModuleLifecycleReadModel(statusStoreMod, config, '02', '02', module02Status);

  const exitCode = await reconcileRunnerMod.runPipeline(config, progress, { deps: configDeps3, skipArchValidation: true }, { deps: configDeps3 });
  assert.equal(exitCode, 0);
  await flushAsync();

  const moduleStatus = statusStoreMod.loadStatus(config, '02');
  assert.equal(moduleStatus.status, 'TESTING');
  assert.equal(moduleStatus.current_phase, 'buster');
  assert.equal(moduleStatus.active_agent, null);

  const lifecycleEvents = statusStoreMod.readLifecycleEvents(config);
  const staleRecoveryEvent = lifecycleEvents.find((event) => event.type === 'recovery.stale_reset' && event.refs?.module_id === '02');
  assert.equal(staleRecoveryEvent, undefined, 'age-only stale recovery must not reset module status without typed session evidence');

  const events = xaddEvents('pipeline:telemetry:behavior-no-session-reconcile:run-no-session-reconcile');
  const recoveredStatus = events.find((event) => event.type === 'module.status_changed' && event.module_id === '02' && event.new_status === 'READY_FOR_TESTING');
  assert.equal(recoveredStatus, undefined, 'age-only stale recovery must not emit a recovered status transition');

  const operatorAlertPath = path.join(logDir, 'pipeline', 'operator-alerts.jsonl');
  const operatorAlerts = fs.readFileSync(operatorAlertPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const staleEvidenceAlert = operatorAlerts.find((entry) => entry.reason === 'stale_module_recovery_requires_session_evidence' && entry.module_id === '02');
  assert(staleEvidenceAlert, 'missing durable operator alert for refused age-only stale recovery');
  assert.equal(staleEvidenceAlert.payload?.status_before_reset, 'TESTING');
  assert.equal(staleEvidenceAlert.payload?.status_reset_to, 'unchanged');
  assert.equal(staleEvidenceAlert.payload?.previous_phase, 'buster');
});

await record('restart-time stale recovery blocks visibly when orphan kill is unconfirmed', async () => {
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);
  const { runtimeRoot: reconcileRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(reconcileRuntimeRoot);
  const recoveryMod = await importRuntimeModule(reconcileRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner-recovery.ts');
  const reconcilePathsMod = await importRuntimeModule(reconcileRuntimeRoot, '/app/skills/pipeline/core/paths.ts');
  const statusStoreMod = await importRuntimeModule(reconcileRuntimeRoot, '/app/skills/pipeline/services/status-store.ts');

  const requests = [];
  const gateway = await startGatewayServer(async ({ body }) => {
    requests.push(body);
    if (body?.tool === 'session_status') {
      return { result: { details: { state: 'running' } } };
    }
    if (body?.tool === 'sessions_send') {
      return { result: { details: { ok: true } } };
    }
    return { result: { details: { ok: true } } };
  });

  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  process.env.OPENCLAW_GATEWAY_URL = gateway.url;

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-reconcile-unconfirmed-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const modulesDir = path.join(swarmDir, 'modules');
  const logDir = path.join(swarmDir, 'logs');
  fs.mkdirSync(path.join(modulesDir, '03'), { recursive: true });
  fs.mkdirSync(path.join(logDir, 'gates', 'review-unconfirmed'), { recursive: true });

  const config = {
    ...platformRestartRecoveryDefaults(),
    project: 'behavior-unconfirmed-reconcile',
    repo_root: repoRoot,
    _runId: 'run-unconfirmed-reconcile',
    run_id: 'run-unconfirmed-reconcile',
    telemetry: platformRestartRecoveryDefaults().telemetry,
    _disable_discord_webhooks: true,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: modulesDir,
    },
    recovery_session_stop_confirm_timeout_ms: 100,
    recovery_session_stop_confirm_poll_ms: 10,
  };

  const progress = {
    modules: {
      '03': { dir: '03', title: 'Unconfirmed Module' },
    },
    gates: {
      'review-unconfirmed': { type: 'review', title: 'Unconfirmed Review' },
    },
    execution_order: [],
  };

  const module03Status = {
    module_id: '03',
    title: 'Unconfirmed Module',
    status: 'IN_PROGRESS',
    current_phase: 'forge',
    fail_count: 1,
    updated_at: new Date(Date.now() - (25 * 60 * 1000)).toISOString(),
    history: [],
    active_agent: {
      session_key: 'agent:main:subagent:module-unconfirmed',
      stream_log_path: null,
      label: 'forge-03-diagnostic',
      gateway_label: 'forge-03-gateway',
      run_id: 'run-unconfirmed-reconcile',
      attempt: '2',
      dispatch_id: 'forge-03-dispatch-2',
      runtime: 'subagent',
      model: 'test-model',
      agent_id: null,
    },
  };
  seedModuleLifecycleReadModel(statusStoreMod, config, '03', '03', module03Status);

  await assert.rejects(
    () => recoveryMod.reconcileStaleModuleState(config, progress),
    /orphaned child session could not be confirmed stopped \(termination_grace_expired\)/,
  );

  const moduleStatus = statusStoreMod.loadStatus(config, '03');
  assert.equal(moduleStatus.status, 'IN_PROGRESS');
  assert.equal(moduleStatus.current_phase, 'forge');
  assert.equal(moduleStatus.active_agent?.session_key, 'agent:main:subagent:module-unconfirmed');

  const gateActivePath = reconcilePathsMod.gateActiveSessionPath(config, 'review-unconfirmed');
  fs.writeFileSync(gateActivePath, JSON.stringify({
    gate_id: 'review-unconfirmed',
    phase: 'review_fix',
    session_key: 'agent:main:subagent:gate-unconfirmed',
    stream_log_path: null,
    label: 'reviewfix-unconfirmed-diagnostic',
    gateway_label: 'reviewfix-unconfirmed-gateway',
    run_id: 'run-unconfirmed-reconcile',
    attempt: '4',
    dispatch_id: 'review-unconfirmed-dispatch-4',
    runtime: 'subagent',
    model: 'test-model',
    agent_id: null,
  }, null, 2));
  seedGateActiveSessionReadModel(statusStoreMod, config, 'review-unconfirmed', 'review', JSON.parse(fs.readFileSync(gateActivePath, 'utf8')));

  await assert.rejects(
    () => recoveryMod.reconcileStaleGateSessions(config, progress),
    /orphaned gate session could not be confirmed stopped \(termination_grace_expired\)/,
  );

  assert.equal(fs.existsSync(gateActivePath), true, 'gate active-session file must remain when kill is unconfirmed');
  const gateActive = JSON.parse(fs.readFileSync(gateActivePath, 'utf8'));
  assert.equal(gateActive.session_key, 'agent:main:subagent:gate-unconfirmed');

  const lifecycleEvents = statusStoreMod.readLifecycleEvents(config);
  const blockedEvents = lifecycleEvents.filter((event) => event.type === 'recovery.stale_blocked');
  assert.equal(blockedEvents.length, 2);
  const moduleBlocked = blockedEvents.find((event) => event.data?.module_id === '03');
  const gateBlocked = blockedEvents.find((event) => event.data?.gate_id === 'review-unconfirmed');
  assert(moduleBlocked, 'missing module recovery.stale_blocked event');
  assert(gateBlocked, 'missing gate recovery.stale_blocked event');
  assert.equal(moduleBlocked.data?.recovery_action, 'kill_unconfirmed');
  assert.equal(moduleBlocked.data?.recovery_target_status, 'unchanged');
  assert.equal(moduleBlocked.data?.stop_confirmed, false);
  assert.match(moduleBlocked.data?.stop_state || '', /^(running|termination_grace_expired)$/);
  assert.equal(moduleBlocked.data?.session_key, 'agent:main:subagent:module-unconfirmed');
  assert.equal(gateBlocked.data?.recovery_action, 'kill_unconfirmed');
  assert.equal(gateBlocked.data?.recovery_target_status, 'unchanged');
  assert.equal(gateBlocked.data?.stop_confirmed, false);
  assert.match(gateBlocked.data?.stop_state || '', /^(running|termination_grace_expired)$/);
  assert.equal(gateBlocked.data?.active_session_path, gateActivePath);

  const subagentKillRequests = requests.filter((req) => req?.tool === 'subagents' && req?.args?.action === 'kill');
  assert.deepEqual(subagentKillRequests.map((req) => req?.args?.target), [
    'agent:main:subagent:module-unconfirmed',
    'agent:main:subagent:gate-unconfirmed',
  ]);

  const discordAuditPath = path.join(logDir, 'pipeline', 'discord.jsonl');
  const discordEntries = fs.readFileSync(discordAuditPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const moduleBlockedDiscord = discordEntries.find((entry) => entry.title === 'Module 03 — Stale forge recovery blocked');
  const gateBlockedDiscord = discordEntries.find((entry) => entry.title === 'Gate review-unconfirmed — Stale review_fix recovery blocked');
  assert(moduleBlockedDiscord, 'missing module unconfirmed-kill Discord alert');
  assert(gateBlockedDiscord, 'missing gate unconfirmed-kill Discord alert');
  assert.equal(moduleBlockedDiscord.fields.some((field) => field.name === 'Recovery Action' && field.value === 'kill_unconfirmed'), true);
  assert.equal(moduleBlockedDiscord.fields.some((field) => field.name === 'Status Reset To' && field.value === 'unchanged'), true);
  assert.equal(gateBlockedDiscord.fields.some((field) => field.name === 'Recovery Action' && field.value === 'kill_unconfirmed'), true);
  assert.equal(gateBlockedDiscord.fields.some((field) => field.name === 'Action' && /Manually stop/.test(field.value)), true);

  if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
  else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
  await gateway.close();
});

await record('restart-time stale recovery blocks weak active-agent identity before stop requests', async () => {
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);
  const { runtimeRoot: reconcileRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(reconcileRuntimeRoot);
  const recoveryMod = await importRuntimeModule(reconcileRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner-recovery.ts');
  const reconcilePathsMod = await importRuntimeModule(reconcileRuntimeRoot, '/app/skills/pipeline/core/paths.ts');
  const statusStoreMod = await importRuntimeModule(reconcileRuntimeRoot, '/app/skills/pipeline/services/status-store.ts');

  const requests = [];
  const gateway = await startGatewayServer(async ({ body }) => {
    requests.push(body);
    return { result: { details: { state: 'running' } } };
  });

  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  process.env.OPENCLAW_GATEWAY_URL = gateway.url;

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-reconcile-weak-identity-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const modulesDir = path.join(swarmDir, 'modules');
  const logDir = path.join(swarmDir, 'logs');
  fs.mkdirSync(path.join(modulesDir, '05'), { recursive: true });
  fs.mkdirSync(path.join(logDir, 'gates', 'review-weak'), { recursive: true });

  const config = {
    ...platformRestartRecoveryDefaults(),
    project: 'behavior-weak-identity-reconcile',
    repo_root: repoRoot,
    _runId: 'run-weak-identity-reconcile',
    run_id: 'run-weak-identity-reconcile',
    telemetry: platformRestartRecoveryDefaults().telemetry,
    _disable_discord_webhooks: true,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: modulesDir,
    },
  };

  const progress = {
    modules: {
      '05': { dir: '05', title: 'Weak Identity Module' },
    },
    gates: {
      'review-weak': { type: 'review', title: 'Weak Identity Review' },
    },
    execution_order: [],
  };

  const module05Status = {
    module_id: '05',
    title: 'Weak Identity Module',
    status: 'IN_PROGRESS',
    current_phase: 'forge',
    updated_at: new Date(Date.now() - (25 * 60 * 1000)).toISOString(),
    history: [],
    active_agent: {
      session_key: 'agent:main:subagent:weak-module',
      gateway_label: 'forge-05-gateway',
      attempt: 1,
      runtime: 'subagent',
      model: 'test-model',
    },
  };
  seedModuleLifecycleReadModel(statusStoreMod, config, '05', '05', module05Status);

  await assert.rejects(
    () => recoveryMod.reconcileStaleModuleState(config, progress),
    /stale module session identity was not confirmed \(no_lifecycle_active_session\)/,
  );
  assert.equal(requests.length, 0, 'weak module identity must block before session_status or stop requests');

  const moduleStatus = statusStoreMod.loadStatus(config, '05');
  assert.equal(moduleStatus.status, 'IN_PROGRESS');
  assert.equal(moduleStatus.active_agent?.session_key, 'agent:main:subagent:weak-module');

  const gateActivePath = reconcilePathsMod.gateActiveSessionPath(config, 'review-weak');
  fs.writeFileSync(gateActivePath, JSON.stringify({
    gate_id: 'review-weak',
    phase: 'review_fix',
    session_key: 'agent:main:subagent:weak-gate',
    gateway_label: 'reviewfix-weak-gateway',
    attempt: 1,
    runtime: 'subagent',
    model: 'test-model',
  }, null, 2));
  seedGateActiveSessionReadModel(statusStoreMod, config, 'review-weak', 'review', JSON.parse(fs.readFileSync(gateActivePath, 'utf8')));

  await recoveryMod.reconcileStaleGateSessions(config, progress);
  assert.equal(requests.length, 0, 'weak gate identity must not trigger session_status or stop requests');
  assert.equal(fs.existsSync(gateActivePath), true, 'pre-existing weak gate active-session evidence is ignored and left for manual inspection');

  const lifecycleEvents = statusStoreMod.readLifecycleEvents(config);
  const blockedEvents = lifecycleEvents.filter((event) => event.type === 'recovery.stale_blocked');
  assert.equal(blockedEvents.length, 1);
  assert.equal(blockedEvents.every((event) => event.data?.recovery_action === 'identity_unconfirmed'), true);
  assert.equal(blockedEvents.every((event) => event.data?.stop_requested === false), true);
  assert.equal(blockedEvents.every((event) => event.data?.session_authority?.allow_status_active_agent_authority === false), true);

  if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
  else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
  await gateway.close();
});
}
