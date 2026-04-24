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
await record('restart-time stale ACP recovery clears orphaned module and gate sessions', async () => {
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);
  const { runtimeRoot: reconcileRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(reconcileRuntimeRoot);
  const reconcileRunnerMod = await importRuntimeModule(reconcileRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.js');
  const reconcilePathsMod = await importRuntimeModule(reconcileRuntimeRoot, '/app/skills/pipeline/core/paths.js');

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

  const config = {
    project: 'behavior-demo',
    repo_root: repoRoot,
    _runId: 'run-reconcile',
    run_id: 'run-reconcile',
    telemetry: { enabled: true },
    _logDir: logDir,
    _runStats: {},
    paths: {
      swarm_dir: swarmDir,
      modules_dir: modulesDir,
    },
    poll_interval_seconds: 1,
    default_timeout_minutes: 1,
    arch_validation: { enabled: false },
    _testOverrides: {
      pipelineRunner: {
        output: () => {},
        releaseGateFiles: async () => {},
        syncControlFiles: async () => {},
        writeSummary: () => {},
        generateProjectSummary: async () => {},
        generatePipelineReview: async () => {},
        generateCaseStudy: async () => {},
        readGateOutput: () => ({ isPass: false }),
        readGateStatusJson: () => ({ isPass: false }),
        runArchValidator: async () => ({ blocked: false, findings: [] }),
      },
    },
  };

  const progress = {
    modules: {
      '01': { dir: '01' },
    },
    gates: {
      'review-01': { type: 'review' },
    },
    execution_order: [],
    arch_validation: { enabled: false },
  };

  fs.writeFileSync(reconcilePathsMod.statusPath(config, '01'), JSON.stringify({
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
      attempt: 3,
      runtime: 'acp',
      model: 'claude-sonnet',
      agent_id: 'claude',
    },
  }, null, 2));

  fs.writeFileSync(reconcilePathsMod.gateActiveSessionPath(config, 'review-01'), JSON.stringify({
    gate_id: 'review-01',
    phase: 'review_fix',
    session_key: 'agent:main:acp:gate',
    stream_log_path: null,
    label: 'reviewfix-review-01-1',
    gateway_label: 'reviewfix-review-01-1-123',
    attempt: 2,
    dispatch_id: 'buster-gate-review-01-dispatch-2',
    runtime: 'acp',
    model: 'claude-sonnet',
    agent_id: 'claude',
  }, null, 2));

  try {
    const exitCode = await reconcileRunnerMod.runPipeline(config, progress, { skipArchValidation: true });
    assert.equal(exitCode, 0);
    await flushAsync();

    const moduleStatus = JSON.parse(fs.readFileSync(reconcilePathsMod.statusPath(config, '01'), 'utf8'));
    assert.equal(moduleStatus.status, 'PENDING');
    assert.equal(moduleStatus.current_phase, null);
    assert.equal(moduleStatus.active_agent, null);
    assert.equal(fs.existsSync(reconcilePathsMod.gateActiveSessionPath(config, 'review-01')), false);

    const statusStoreMod = await importRuntimeModule(reconcileRuntimeRoot, '/app/skills/pipeline/services/status-store.js');
    const lifecycleEvents = statusStoreMod.readLifecycleEvents(config);
    const staleRecoveryEvents = lifecycleEvents.filter((event) => event.type === 'recovery.stale_reset');
    assert.equal(staleRecoveryEvents.length, 2);
    assert.equal(staleRecoveryEvents.some((event) => event.refs?.module_id === '01' && event.data?.recovery_action === 'killed_orphan'), true);
    assert.equal(staleRecoveryEvents.some((event) => event.refs?.gate_id === 'review-01' && event.data?.recovery_action === 'killed_orphan'), true);

    const readModels = statusStoreMod.loadLifecycleReadModels(config);
    assert.equal(readModels.modules['01'].status, 'PENDING');
    assert.equal(readModels.modules['01'].last_recovery_action, 'killed_orphan');
    assert.equal(readModels.gates['review-01'].status, 'PENDING');
    assert.equal(readModels.gates['review-01'].last_recovery_action, 'killed_orphan');

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

    const gateObservabilityDegraded = events.find((event) => event.type === 'observability.degraded' && event.gate_id === 'review-01' && event.reason === 'gateway_unreachable');
    assert(gateObservabilityDegraded, 'missing stale gate recovery observability.degraded event');
    assert.equal(gateObservabilityDegraded.surface, 'gateway');
    assert.equal(gateObservabilityDegraded.gate_type, 'review');
    assert.equal(gateObservabilityDegraded.session_key, 'agent:main:acp:gate');
    assert.equal(gateObservabilityDegraded.attempt, 2);
    assert.equal(gateObservabilityDegraded.dispatch_id, 'buster-gate-review-01-dispatch-2');
    assert.match(gateObservabilityDegraded.detail || '', /Gateway session_status failed:/);

    const gateObservabilityRestored = events.find((event) => event.type === 'observability.restored' && event.gate_id === 'review-01' && event.reason === 'gateway_unreachable');
    assert(gateObservabilityRestored, 'missing stale gate recovery observability.restored event');
    assert.equal(gateObservabilityRestored.surface, 'gateway');
    assert.equal(gateObservabilityRestored.gate_type, 'review');
    assert.equal(gateObservabilityRestored.session_key, 'agent:main:acp:gate');
    assert.equal(gateObservabilityRestored.attempt, 2);
    assert.equal(gateObservabilityRestored.dispatch_id, 'buster-gate-review-01-dispatch-2');
    assert.equal(gateObservabilityRestored.detail, 'session status reachable again');
    assert.equal(typeof gateObservabilityRestored.restored_after_ms, 'number');

    const stopRequests = requests.filter((req) => req?.tool === 'sessions_send');
    assert.deepEqual(stopRequests.map((req) => req?.args?.sessionKey), [
      'agent:main:acp:module',
      'agent:main:acp:gate',
    ]);

    const discordAuditPath = path.join(logDir, 'pipeline', 'discord.jsonl');
    const discordEntries = fs.readFileSync(discordAuditPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

    const moduleRecoveryDiscord = discordEntries.find((entry) => entry.title === 'Module 01 — Recovered stale forge state');
    assert(moduleRecoveryDiscord, 'missing module stale-recovery Discord alert');
    assert.equal(moduleRecoveryDiscord.fields.some((field) => field.name === 'Attempt' && field.value === '3'), true);
    assert.equal(moduleRecoveryDiscord.fields.some((field) => field.name === 'Label' && field.value === 'forge-01-123'), true);
    assert.equal(moduleRecoveryDiscord.fields.some((field) => field.name === 'Session' && field.value === 'agent:main:acp:module'), true);
    assert.equal(moduleRecoveryDiscord.fields.some((field) => field.name === 'Recovery Action' && field.value === 'killed_orphan'), true);
    assert.equal(moduleRecoveryDiscord.gateway_label, 'forge-01-123');
    assert.equal(moduleRecoveryDiscord.attempt, 3);

    const gateRecoveryDiscord = discordEntries.find((entry) => entry.title === 'Gate review-01 — Recovered stale review_fix session');
    assert(gateRecoveryDiscord, 'missing gate stale-recovery Discord alert');
    assert.equal(gateRecoveryDiscord.fields.some((field) => field.name === 'Gate Type' && field.value === 'review'), true);
    assert.equal(gateRecoveryDiscord.fields.some((field) => field.name === 'Attempt' && field.value === '2'), true);
    assert.equal(gateRecoveryDiscord.fields.some((field) => field.name === 'Dispatch' && field.value === 'buster-gate-review-01-dispatch-2'), true);
    assert.equal(gateRecoveryDiscord.fields.some((field) => field.name === 'Label' && field.value === 'reviewfix-review-01-1-123'), true);
    assert.equal(gateRecoveryDiscord.fields.some((field) => field.name === 'Session' && field.value === 'agent:main:acp:gate'), true);
    assert.equal(gateRecoveryDiscord.fields.some((field) => field.name === 'Recovery Action' && field.value === 'killed_orphan'), true);
    assert.equal(gateRecoveryDiscord.gateway_label, 'reviewfix-review-01-1-123');
    assert.equal(gateRecoveryDiscord.gate_type, 'review');
    assert.equal(gateRecoveryDiscord.attempt, 2);
    assert.equal(gateRecoveryDiscord.dispatch_id, 'buster-gate-review-01-dispatch-2');
  } finally {
    if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    await gateway.close();
  }
});
}
