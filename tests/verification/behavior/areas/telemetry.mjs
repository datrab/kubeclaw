export async function registerTelemetryArea({
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
  materializeRuntimeTree,
  importRuntimeModule,
  runGateViaRegistry,
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
function gateRuntimeEvents(xaddEvents, streamKey) {
  return xaddEvents(streamKey)
    .filter((event) => !String(event.type || '').startsWith('plugin.gate.'))
    .map((event, index) => ({ ...event, seq: index + 1 }));
}

async function buildBuiltInRegistry(runtimeRoot) {
  const registryMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/registry.ts');
  const { registry, errors } = registryMod.buildPluginRegistry({ enabled: true, allowCustomModules: false, extraModulePaths: [], modules: {}, stageOwners: {}, restrictedCapabilityAllowlist: {} }, { throwOnError: false });
  assert.equal(errors.length, 0);
  return registry;
}
const EXPLICIT_ACP_MONITOR_CONFIG = {
  unknown_poll_limit: 10,
  stale_poll_limit: 10,
  max_transcript_extensions: 3,
  transcript_grace_ms: 300000,
  monitor_poll_ms: 10000,
};

function canonicalCompletionFields(fields, project = 'behavior-demo') {
  return [
    'schema_version', 'v1',
    'stream_role', 'completion',
    'project', project,
    'target_kind', 'module',
    'timestamp', '2026-05-23T00:00:00.000Z',
    ...fields,
  ];
}

await record('completion selection stays scoped to run and attempt identity instead of module-only latest', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-identity-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const modulesDir = path.join(swarmDir, 'modules');
  fs.mkdirSync(path.join(modulesDir, '01'), { recursive: true });

  const config = {
    project: 'behavior-demo',
    repo_root: repoRoot,
    _runId: 'run-current',
    run_id: 'run-current',
    default_timeout_minutes: 5,
    rate_limit: { cooldown_hours: 2, max_pauses_per_module: 5 },
    buster: {
      suite_timeout_ms: 300000,
      max_crash_retries: 2,
      runtime: {
        heartbeat_path: '/tmp/kubeclaw-buster-heartbeat',
        heartbeat_interval_ms: 1000,
        task_poll_interval_ms: 2000,
        task_pending_reclaim_idle_ms: 60000,
        task_stream_max_len: 250,
      },
    },
    acp_monitor: {
      unknown_poll_limit: 10,
      stale_poll_limit: 10,
      max_transcript_extensions: 3,
      transcript_grace_ms: 300000,
      monitor_poll_ms: 10000,
    },
    paths: {
      swarm_dir: swarmDir,
      modules_dir: modulesDir,
    },
  };
  const progress = {
    modules: {
      '01': { dir: '01', timeout_minutes: 7, test_suites: ['unit'] },
    },
    gates: {},
  };

  const payload = orchestrationMod.buildBusterPayload(
    config,
    progress,
    '01',
    'module_test',
    'Run unit suites',
    { forge_commit_hash: 'abc123' },
    {
      model: 'openai-codex/gpt-5.4',
      run_id: 'run-current',
      attempt: 2,
      dispatch_id: 'dispatch-current',
    },
  );

  assert.equal(payload.run_id, 'run-current');
  assert.equal(payload.attempt, 2);
  assert.equal(payload.dispatch_id, 'dispatch-current');
  assert.equal(payload.stage_id, 'worker:module_buster');
  assert.equal(payload.worker_type, 'module_buster');
  assert.equal(payload.session.label, 'dispatch-current');
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'status_json_path'), false);
  assert.equal(payload.pipeline_log_path.endsWith('/.swarm/logs/pipeline/pipeline.jsonl'), true);
  assert.equal(payload.pipeline_run_log_path.endsWith('/.swarm/logs/pipeline/runs/run-current/pipeline.jsonl'), true);
  assert.deepEqual(payload.acp_monitor, config.acp_monitor);
  assert.deepEqual(payload.rate_limit, { max_pauses: 5, initial_cooldown_s: 7200, max_cooldown_s: 7200 });

  const entries = [
    ['1-0', canonicalCompletionFields(['type', 'completion', 'module', '01', 'status', 'PASS', 'source', 'agent', 'run_id', 'run-old', 'attempt', '1', 'dispatch_id', 'dispatch-old', 'session_key', 'agent:main:acp:old'])],
    ['2-0', canonicalCompletionFields(['type', 'completion', 'module', '01', 'status', 'FAIL', 'source', 'buster-pipeline', 'run_id', 'run-current', 'attempt', '2', 'dispatch_id', 'dispatch-current', 'session_key', 'agent:main:acp:current'])],
    ['3-0', canonicalCompletionFields(['type', 'completion', 'module', '01', 'status', 'PASS', 'source', 'agent', 'run_id', 'run-other', 'attempt', '7', 'dispatch_id', 'dispatch-other', 'session_key', 'agent:main:acp:other'])],
    ['4-0', canonicalCompletionFields(['type', 'completion', 'module', '01', 'status', 'FAIL', 'source', 'agent', 'run_id', 'run-current', 'attempt', '2', 'dispatch_id', 'dispatch-current', 'session_key', 'agent:main:acp:current'])],
  ];

  assert.equal(
    pipelineRedisMod.matchesCompletionIdentity(
      { run_id: 'run-current', attempt: '2', dispatch_id: 'dispatch-current', session_key: 'agent:main:acp:current' },
      { run_id: 'run-current', attempt: 2, dispatch_id: 'dispatch-current' },
    ),
    true,
  );
  assert.equal(
    pipelineRedisMod.matchesCompletionIdentity(
      { run_id: 'run-old', attempt: '1', dispatch_id: 'dispatch-old' },
      { run_id: 'run-current', attempt: 2, dispatch_id: 'dispatch-current' },
    ),
    false,
  );
  assert.equal(
    pipelineRedisMod.matchesCompletionIdentity(
      { run_id: 'run-current', attempt: '2', dispatch_id: 'dispatch-current' },
      { run_id: 'run-current', attempt: 2 },
    ),
    false,
    'completion identity must be strong enough to include dispatch_id',
  );

  const selected = pipelineRedisMod.selectLatestCompletion(entries, '01', {
    run_id: payload.run_id,
    attempt: payload.attempt,
    dispatch_id: payload.dispatch_id,
  });

  assert(selected);
  assert.equal(selected._id, '2-0');
  assert.equal(selected.source, 'buster-pipeline');
  assert.equal(selected.run_id, 'run-current');
  assert.equal(selected.attempt, '2');
  assert.equal(selected.dispatch_id, 'dispatch-current');
  assert.equal(selected.ignored_completion_source_policy, 'ignored_noncanonical_source');
  assert.equal(selected.ignored_completion_count, '1');
  assert.equal(selected.ignored_completion_redis_ids, '4-0');
  assert.equal(selected.ignored_completion_sources, 'agent');
});

await record('Buster telemetry mirrors successful events into canonical pipeline artifacts', async () => {
  const { runtimeRoot: sandboxTelemetryRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
  installFakeRedis(sandboxTelemetryRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const busterTelemetryMod = await importRuntimeModule(sandboxTelemetryRoot, '/app/skills/pipeline/services/telemetry.ts');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-telemetry-mirror-'));
  const logRoot = path.join(repoRoot, '.swarm', 'logs');
  const pipelineLogPath = path.join(logRoot, 'pipeline', 'pipeline.jsonl');
  const pipelineRunLogPath = path.join(logRoot, 'pipeline', 'runs', 'run-buster-1', 'pipeline.jsonl');

  const tctx = busterTelemetryMod.createTelemetryContext({
    project: 'behavior-buster-telemetry',
    module_id: '07',
    run_id: 'run-buster-1',
    enabled: true,
    log_dir: path.join(logRoot, 'modules', '07'),
    pipeline_log_path: pipelineLogPath,
    pipeline_run_log_path: pipelineRunLogPath,
    attempt: 2,
    dispatch_id: 'dispatch-buster-07',
    session_key: 'agent:main:acp:buster-07',
  });

  await busterTelemetryMod.emitPluginEvent(tctx, 'task_completed', {
    module_id: '07',
    outcome: 'PASS',
    duration_seconds: 14,
  });
  await flushAsync();
  await busterTelemetryMod.closeTelemetry(tctx);

  const streamKey = 'pipeline:telemetry:behavior-buster-telemetry:run-buster-1';
  const streamEvents = xaddEvents(streamKey);
  const globalEvents = fs.readFileSync(pipelineLogPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const runEvents = fs.readFileSync(pipelineRunLogPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

  assert.equal(streamEvents.length, 1);
  assert.equal(globalEvents.length, 1);
  assert.equal(runEvents.length, 1);
  assert.deepEqual(globalEvents[0], runEvents[0]);
  assert.equal(globalEvents[0].type, 'plugin.event');
  assert.equal(globalEvents[0].plugin_id, 'buster');
  assert.equal(globalEvents[0].plugin_event, 'task_completed');
  assert.equal(globalEvents[0].source, 'buster');
  assert.equal(globalEvents[0].emitter, 'buster/pipeline/services/telemetry');
  assert.equal(globalEvents[0].run_id, 'run-buster-1');
  assert.equal(globalEvents[0].module_id, '07');
  assert.equal(globalEvents[0].attempt, 2);
  assert.equal(globalEvents[0].dispatch_id, 'dispatch-buster-07');
  assert.equal(globalEvents[0].session_key, 'agent:main:acp:buster-07');
  assert.equal(globalEvents[0].seq, 1);
  assert.equal(streamEvents[0].seq, globalEvents[0].seq);
  assert.equal(streamEvents[0].type, globalEvents[0].type);
});

await record('Buster telemetry init failure emits explicit degraded fallback artifacts', async () => {
  const { runtimeRoot: brokenTelemetryRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
  const brokenRedisPackage = `
module.exports = class BrokenRedis {
  constructor() {
    throw new Error('redis client unavailable');
  }
};
`;
  for (const nodeModulesRoot of [
    path.join(brokenTelemetryRoot, 'node_modules'),
    path.join(brokenTelemetryRoot, 'app', 'node_modules'),
    path.join(brokenTelemetryRoot, 'app', 'skills', 'node_modules'),
  ]) {
    const nodeModulesDir = ensureDir(path.join(nodeModulesRoot, 'ioredis'));
    fs.writeFileSync(path.join(nodeModulesDir, 'index.js'), brokenRedisPackage);
    fs.writeFileSync(path.join(nodeModulesDir, 'package.json'), '{"name":"ioredis","main":"index.js"}');
  }

  const busterTelemetryMod = await importRuntimeModule(brokenTelemetryRoot, '/app/skills/pipeline/services/telemetry.ts');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-telemetry-fallback-'));
  const logRoot = path.join(repoRoot, '.swarm', 'logs');
  const logDir = path.join(logRoot, 'modules', '07');
  const pipelineLogPath = path.join(logRoot, 'pipeline', 'pipeline.jsonl');
  const pipelineRunLogPath = path.join(logRoot, 'pipeline', 'runs', 'run-buster-fallback-1', 'pipeline.jsonl');

  const tctx = busterTelemetryMod.createTelemetryContext({
    project: 'behavior-buster-telemetry-fallback',
    module_id: '07',
    run_id: 'run-buster-fallback-1',
    enabled: true,
    log_dir: logDir,
    pipeline_log_path: pipelineLogPath,
    pipeline_run_log_path: pipelineRunLogPath,
    attempt: 1,
    dispatch_id: 'dispatch-buster-fallback-1',
    session_key: 'agent:main:acp:buster-fallback-session-1',
  });

  assert(tctx, 'buster telemetry context should fall back instead of returning null');
  assert.equal(tctx.redis, null);

  await busterTelemetryMod.emitPluginEvent(tctx, 'task_started', { module_id: '07' });
  await busterTelemetryMod.emitPluginEvent(tctx, 'task_completed', { module_id: '07', outcome: 'FAIL' });
  await flushAsync();

  const fallbackPath = path.join(logDir, 'telemetry-fallback.jsonl');
  assert.equal(fs.existsSync(fallbackPath), true);
  const fallbackEvents = fs.readFileSync(fallbackPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(fallbackEvents.length, 1);
  assert.equal(fallbackEvents[0].type, 'observability.degraded');
  assert.equal(fallbackEvents[0].reason, 'redis_emit_failed');
  assert.equal(fallbackEvents[0].detail, 'redis client unavailable');
  assert.equal(fallbackEvents[0].impacted_event_type, 'plugin.event');
  assert.equal(fallbackEvents[0].run_id, 'run-buster-fallback-1');
  assert.equal(fallbackEvents[0].module_id, '07');
  assert.equal(fallbackEvents[0].attempt, 1);
  assert.equal(fallbackEvents[0].dispatch_id, 'dispatch-buster-fallback-1');
  assert.equal(fallbackEvents[0].session_key, 'agent:main:acp:buster-fallback-session-1');

  const runFallbackPath = path.join(logRoot, 'pipeline', 'runs', 'run-buster-fallback-1', 'buster-telemetry-fallback.jsonl');
  assert.equal(fs.existsSync(runFallbackPath), true);
  const runFallbackEvents = fs.readFileSync(runFallbackPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(runFallbackEvents[0].type, 'observability.degraded');
  assert.equal(runFallbackEvents[0].artifact_fallback, true);

  const pipelineEvents = fs.readFileSync(pipelineRunLogPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(pipelineEvents.length, 1);
  assert.equal(pipelineEvents[0].type, 'observability.degraded');
  assert.equal(pipelineEvents[0].source, 'buster');
  assert.equal(pipelineEvents[0].seq, null);
  assert.equal(pipelineEvents[0].artifact_fallback, true);
  assert.equal(pipelineEvents[0].attempt, 1);
  assert.equal(pipelineEvents[0].dispatch_id, 'dispatch-buster-fallback-1');
  assert.equal(pipelineEvents[0].session_key, 'agent:main:acp:buster-fallback-session-1');

  const gateRunLogPath = path.join(logRoot, 'pipeline', 'runs', 'run-buster-fallback-gate-1', 'pipeline.jsonl');
  const gateCtx = busterTelemetryMod.createTelemetryContext({
    project: 'behavior-buster-telemetry-fallback',
    module_id: '07',
    run_id: 'run-buster-fallback-gate-1',
    enabled: true,
    pipeline_run_log_path: gateRunLogPath,
    attempt: 2,
    dispatch_id: 'dispatch-buster-fallback-gate-1',
    session_key: 'agent:main:acp:buster-fallback-gate-session-1',
    gate_id: 'review-gate-07',
    gate_type: 'review',
  });
  await busterTelemetryMod.emitPluginEvent(gateCtx, 'review_started', { outcome: 'PENDING' });
  await flushAsync();
  const gatePipelineEvents = fs.readFileSync(gateRunLogPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(gatePipelineEvents[0].type, 'observability.degraded');
  assert.equal(gatePipelineEvents[0].module_id, null);
  assert.equal(gatePipelineEvents[0].gate_id, 'review-gate-07');
  assert.equal(gatePipelineEvents[0].gate_type, 'review');
  assert.equal(gatePipelineEvents[0].attempt, 2);
  assert.equal(gatePipelineEvents[0].dispatch_id, 'dispatch-buster-fallback-gate-1');
  assert.equal(gatePipelineEvents[0].session_key, 'agent:main:acp:buster-fallback-gate-session-1');
});

await record('Buster telemetry explicit disabled mode is intentional and emits no degraded fallback', async () => {
  const { runtimeRoot: disabledTelemetryRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
  const busterTelemetryMod = await importRuntimeModule(disabledTelemetryRoot, '/app/skills/pipeline/services/telemetry.ts');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-telemetry-disabled-'));
  const logRoot = path.join(repoRoot, '.swarm', 'logs');
  const logDir = path.join(logRoot, 'modules', '07');
  const pipelineRunLogPath = path.join(logRoot, 'pipeline', 'runs', 'run-buster-disabled-1', 'pipeline.jsonl');

  const tctx = busterTelemetryMod.createTelemetryContext({
    project: 'behavior-buster-telemetry-disabled',
    module_id: '07',
    run_id: 'run-buster-disabled-1',
    enabled: false,
    log_dir: logDir,
    pipeline_run_log_path: pipelineRunLogPath,
    attempt: 1,
  });

  assert(tctx, 'disabled telemetry should be explicit, not an ambiguous null context');
  assert.equal(tctx.redis, null);
  assert.equal(tctx._health.redis.disabled, true);

  await busterTelemetryMod.emitPluginEvent(tctx, 'task_started', { module_id: '07' });
  await flushAsync();
  assert.equal(fs.existsSync(path.join(logDir, 'telemetry-fallback.jsonl')), false);
  assert.equal(fs.existsSync(pipelineRunLogPath), false);
});

await record('ACP observability does not promote monitor lookup labels into canonical session identity', async () => {
  const telemetryRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(telemetryRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const telemetryRuntimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const acpObservabilityMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/acp-observability.ts');
  const runId = 'run-acp-observability-joinability';
  const config = {
    project: 'behavior-acp-observability-joinability',
    acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
    telemetry: { enabled: true },
    _runId: runId,
    run_id: runId,
    _runStats: telemetryRuntimeCoreMod.createRunStats('2026-04-17T00:00:00.000Z'),
    pluginRegistry: await buildBuiltInRegistry(telemetryRuntimeRoot),
  };

  const gateway = await startGatewayServer(async () => {
    throw new Error('gateway unavailable during ACP observability joinability check');
  });
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  process.env.OPENCLAW_GATEWAY_URL = gateway.url;
  try {
    await acpObservabilityMod.observeAcpMonitorSurfaces(config, 'agent:main:acp:display-session-label-only', {}, {
      maxPolls: 1,
      pollMs: 0,
      gatewayState: { active: false, degradedAt: null },
      transcriptState: { active: false, degradedAt: null },
    });
    await flushAsync();
  } finally {
    await gateway.close();
    if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
  }

  const events = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
  const degraded = events.find((event) => event.type === 'observability.degraded' && event.reason === 'gateway_unreachable');
  assert(degraded, 'missing gateway observability.degraded event');
  assert.equal(degraded.session_key, null);
  assert.equal(degraded.module_id, null);
  assert.equal(degraded.gate_id, null);
  assert.equal(degraded.dispatch_id, null);
});

await record('pollDual fails closed when Redis completion event adapter errors', async () => {
  const pollingRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(pollingRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const pollingMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.ts');
  const runtimeCoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const statusStoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/status-store.ts');
  const registry = await buildBuiltInRegistry(pollingRuntimeRoot);
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-polldual-redis-adapter-fail-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const modulesDir = path.join(swarmDir, 'modules');
  const runId = 'run-polldual-redis-adapter-fail-1';
  fs.mkdirSync(path.join(modulesDir, '01'), { recursive: true });
  const fixtureConfig = {
    project: 'behavior-polldual-redis-adapter-fail',
    _runId: runId,
    run_id: runId,
    paths: { swarm_dir: swarmDir, modules_dir: modulesDir },
  };
  const readModels = statusStoreMod.loadLifecycleReadModels(fixtureConfig);
  readModels.modules['01'] = {
    module_id: '01',
    module_dir: '01',
    title: 'Module 01',
    status: 'TESTING',
    current_phase: 'buster',
    projection_source: 'canonical-events',
  };
  statusStoreMod.saveLifecycleReadModels(fixtureConfig, readModels);

  class FailingRedisCompletionClient {
    constructor() { this.status = 'ready'; }
    on() {}
    async xread() {
      await Promise.resolve();
      throw new Error('simulated redis completion adapter failure');
    }
    disconnect() {}
  }

    const deps = {
      completionEventAdapters: { RedisCtor: FailingRedisCompletionClient },
    };
const config = {
    project: 'behavior-polldual-redis-adapter-fail',
    acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
    telemetry: { enabled: true },
    poll_interval_seconds: 0.01,
    poll_progress_log_interval_ms: 100000,
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-11T00:00:00.000Z'),
    pluginRegistry: registry,
    paths: { swarm_dir: swarmDir, modules_dir: modulesDir },
      };

  const result = await pollingMod.pollDual(config, '01', '01', ['PASS'], 1, {
    run_id: runId,
    attempt: 1,
    dispatch_id: 'dispatch-polldual-redis-adapter-fail-1',
  }, { deps });
  await flushAsync();

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'completion_event_adapter_failed');
  assert.equal(result.status.status, 'FAIL');
  assert.equal(result.status.error, 'simulated redis completion adapter failure');
});

await record('buster gate fails closed when Redis completion event adapter errors', async () => {
  const gateRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(gateRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const gateRunnerMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/runners/buster-gate-runner.ts');
  const runtimeCoreMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const registry = await buildBuiltInRegistry(gateRuntimeRoot);
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-gate-redis-adapter-fail-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const outputFile = 'gates/buster-output.json';
  fs.mkdirSync(path.join(swarmDir, 'gates'), { recursive: true });

  class FailingRedisCompletionClient {
    constructor() { this.status = 'ready'; }
    on() {}
    async xread() {
      await Promise.resolve();
      throw new Error('simulated gate redis completion adapter failure');
    }
    disconnect() {}
  }

  const runId = 'run-buster-gate-redis-adapter-fail-1';
    const configDeps2 = {
      completionEventAdapters: { RedisCtor: FailingRedisCompletionClient },
      busterGate: {
        discord: async () => {},
        readGateInstructions: () => 'buster gate instructions',
        resolvePolicy: () => ({ model: 'buster-model', model_source: 'test' }),
        logEffectivePolicy: () => {},
        validateBusterConfig: () => {},
        archiveModuleCompletions: async () => {},
        headHash: () => 'abcdef1234567890',
        spawnAgent: async () => {},
        killAgent: async () => {},
      },
    };
const config = {
    project: 'behavior-buster-gate-redis-adapter-fail',
    acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
    repo_root: repoRoot,
    telemetry: { enabled: true },
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-11T00:00:00.000Z'),
    pluginRegistry: registry,
    default_timeout_minutes: 5,
    default_max_fails: 1,
    rate_limit: { max_pauses_per_module: 2, cooldown_hours: 0 },
    paths: { swarm_dir: swarmDir },
      };

  const progress = {
    modules: {},
    gates: {
      'gate:buster': {
        type: 'buster',
        title: 'Buster Gate',
        timeout_minutes: 5,
        output_file: outputFile,
      },
    },
  };

  const result = await runGateViaRegistry(gateRuntimeRoot, config, progress, 'gate:buster', { deps: configDeps2 });
  await flushAsync();

  assert.equal(result.terminal.status, 'failed');
  assert.equal(result.terminal.decision.action, 'stop');
  assert.equal(result.outcome, 'error');
  assert.equal(result.diagnostics.metadata.failure_class, 'completion_event_adapter_failed');
});

await record('completion tail scan rejects same-identity contradictory completions', async () => {
  const calls = [];
  const entries = [
    ['9-0', ['type', 'heartbeat', 'module', '01']],
    ['8-0', canonicalCompletionFields(['type', 'completion', 'module', '01', 'status', 'FAIL', 'source', 'buster-pipeline', 'run_id', 'run-current', 'attempt', '2', 'dispatch_id', 'dispatch-current'])],
    ['7-0', canonicalCompletionFields(['type', 'completion', 'module', '99', 'status', 'PASS', 'source', 'agent', 'run_id', 'run-other', 'attempt', '1', 'dispatch_id', 'dispatch-other'])],
    ['6-0', canonicalCompletionFields(['type', 'completion', 'module', '01', 'status', 'PASS', 'source', 'buster-pipeline', 'run_id', 'run-current', 'attempt', '2', 'dispatch_id', 'dispatch-current'])],
    ['5-0', canonicalCompletionFields(['type', 'completion', 'module', '01', 'status', 'PASS', 'source', 'agent', 'run_id', 'run-old', 'attempt', '1', 'dispatch_id', 'dispatch-old'])],
  ];

  const fakeRedis = {
    async xrevrange(_streamKey, end, _start, _countToken, count) {
      calls.push({ end, count });
      let startIndex = 0;
      if (end !== '+') {
        const exclusiveId = String(end).replace(/^\(/, '');
        const foundIndex = entries.findIndex(([id]) => id === exclusiveId);
        startIndex = foundIndex >= 0 ? foundIndex + 1 : entries.length;
      }
      return entries.slice(startIndex, startIndex + count);
    },
  };

  const result = await pipelineRedisMod.scanLatestCompletionFromTail(fakeRedis, 'stream:test', '01', {
    run_id: 'run-current',
    attempt: 2,
    dispatch_id: 'dispatch-current',
  }, {
    batchSize: 2,
    scanLimit: 10,
  });

  assert(result.match);
  assert.equal(result.match.source, 'completion-conflict');
  assert.equal(result.match.status, 'FAIL');
  assert.equal(result.match.outcome, 'COMPLETION_CONFLICT');
  assert.equal(result.match.reason, 'same_identity_completion_conflict');
  assert.equal(result.match.conflicting_redis_ids, '8-0,6-0');
  assert.equal(result.scanned, 5);
  assert.equal(result.batches, 3);
  assert.deepEqual(calls.map((call) => call.end), ['+', '(8-0', '(6-0']);
});

await record('completion tail scan treats same-identity same-outcome duplicates as idempotent diagnostics', async () => {
  const entries = [
    ['9-0', ['type', 'heartbeat', 'module', '01']],
    ['8-0', canonicalCompletionFields(['type', 'completion', 'module', 'gate:quality', 'status', 'PASS', 'source', 'buster-pipeline', 'run_id', 'run-current', 'attempt', '2', 'dispatch_id', 'dispatch-current'])],
    ['7-0', canonicalCompletionFields(['type', 'completion', 'module', 'gate:quality', 'status', 'PASS', 'source', 'buster-pipeline', 'run_id', 'run-current', 'attempt', '2', 'dispatch_id', 'dispatch-current'])],
    ['6-0', canonicalCompletionFields(['type', 'completion', 'module', 'gate:quality', 'status', 'PASS', 'source', 'agent', 'run_id', 'run-current', 'attempt', '2', 'dispatch_id', 'dispatch-current'])],
    ['5-0', canonicalCompletionFields(['type', 'completion', 'module', 'gate:quality', 'status', 'PASS', 'source', 'buster-pipeline', 'run_id', 'run-old', 'attempt', '1', 'dispatch_id', 'dispatch-old'])],
  ];

  const fakeRedis = {
    async xrevrange(_streamKey, end, _start, _countToken, count) {
      let startIndex = 0;
      if (end !== '+') {
        const exclusiveId = String(end).replace(/^\(/, '');
        const foundIndex = entries.findIndex(([id]) => id === exclusiveId);
        startIndex = foundIndex >= 0 ? foundIndex + 1 : entries.length;
      }
      return entries.slice(startIndex, startIndex + count);
    },
  };

  const result = await pipelineRedisMod.scanLatestCompletionFromTail(fakeRedis, 'stream:test', 'gate:quality', {
    run_id: 'run-current',
    attempt: 2,
    dispatch_id: 'dispatch-current',
  }, {
    batchSize: 2,
    scanLimit: 10,
  });

  assert(result.match);
  assert.equal(result.conflict, null);
  assert.equal(result.match._id, '8-0');
  assert.equal(result.match.status, 'PASS');
  assert.equal(result.match.source, 'buster-pipeline');
  assert.equal(result.match.duplicate_completion_policy, 'idempotent_same_outcome');
  assert.equal(result.match.duplicate_completion_count, '2');
  assert.equal(result.match.duplicate_completion_redis_ids, '8-0,7-0');
  assert.equal(result.match.duplicate_completion_outcome, 'PASS');
  assert.equal(result.match.duplicate_completion_sources, 'buster-pipeline');
  assert.equal(result.match.ignored_completion_source_policy, 'ignored_noncanonical_source');
  assert.equal(result.match.ignored_completion_count, '1');
  assert.equal(result.match.ignored_completion_redis_ids, '6-0');
  assert.equal(result.match.ignored_completion_sources, 'agent');
});

await record('completion tail scan ignores legacy source=agent completions as lifecycle truth', async () => {
  const entries = [
    ['3-0', ['type', 'heartbeat', 'module', '01']],
    ['2-0', canonicalCompletionFields(['type', 'completion', 'module', '01', 'status', 'PASS', 'source', 'agent', 'run_id', 'run-current', 'attempt', '2', 'dispatch_id', 'dispatch-current'])],
    ['1-0', canonicalCompletionFields(['type', 'completion', 'module', '01', 'status', 'FAIL', 'source', 'agent', 'run_id', 'run-old', 'attempt', '1', 'dispatch_id', 'dispatch-old'])],
  ];

  const selected = pipelineRedisMod.selectLatestCompletion(entries, '01', {
    run_id: 'run-current',
    attempt: 2,
    dispatch_id: 'dispatch-current',
  });
  assert.equal(selected, null);

  const fakeRedis = {
    async xrevrange(_streamKey, end, _start, _countToken, count) {
      let startIndex = 0;
      if (end !== '+') {
        const exclusiveId = String(end).replace(/^\(/, '');
        const foundIndex = entries.findIndex(([id]) => id === exclusiveId);
        startIndex = foundIndex >= 0 ? foundIndex + 1 : entries.length;
      }
      return entries.slice(startIndex, startIndex + count);
    },
  };
  const result = await pipelineRedisMod.scanLatestCompletionFromTail(fakeRedis, 'stream:test', '01', {
    run_id: 'run-current',
    attempt: 2,
    dispatch_id: 'dispatch-current',
  }, {
    batchSize: 2,
    scanLimit: 10,
  });

  assert.equal(result.match, null);
  assert.equal(result.conflict, null);
  assert.equal(result.scanned, 3);
});

await record('completion archive scans active stream in bounded batches and moves all matching module entries', async () => {
  const calls = [];
  const activeEntries = [
    ['1-0', ['type', 'completion', 'module', '01', 'status', 'FAIL']],
    ['2-0', ['type', 'completion', 'module', '02', 'status', 'PASS']],
    ['3-0', ['type', 'completion', 'module', '01', 'status', 'PASS']],
    ['4-0', ['type', 'heartbeat', 'module', '01']],
    ['5-0', ['type', 'completion', 'module', '01', 'status', 'BLOCKED']],
  ];
  const archivedAdds = [];
  const deletedIds = [];
  let trimmed = null;

  const fakeRedis = {
    async xrange(_streamKey, start, _end, _countToken, count) {
      calls.push({ start, count });
      let startIndex = 0;
      if (start !== '-') {
        const exclusiveId = String(start).replace(/^\(/, '');
        const foundIndex = activeEntries.findIndex(([id]) => id === exclusiveId);
        startIndex = foundIndex >= 0 ? foundIndex + 1 : activeEntries.length;
      }
      return activeEntries.slice(startIndex, startIndex + count);
    },
    multi() {
      const ops = [];
      const chain = {
        xadd: (...args) => { ops.push({ op: 'xadd', args }); return chain; },
        xdel: (...args) => { ops.push({ op: 'xdel', args }); return chain; },
        exec: async () => {
          for (const op of ops) {
            if (op.op === 'xadd') archivedAdds.push(op.args);
            if (op.op === 'xdel') deletedIds.push(op.args[1]);
          }
          return ops;
        },
      };
      return chain;
    },
    async xtrim(...args) {
      trimmed = args;
      return 1;
    },
  };

  const result = await pipelineRedisMod.archiveCompletionsChunked(fakeRedis, 'stream:test', 'stream:test:log', '01', 1000, { batchSize: 2 });

  assert.equal(result.archived, 3);
  assert.equal(result.scanned, 5);
  assert.equal(result.batches, 3);
  assert.deepEqual(calls.map((call) => call.start), ['-', '(2-0', '(4-0']);
  assert.deepEqual(deletedIds, ['1-0', '3-0', '5-0']);
  assert.equal(archivedAdds.length, 3);
  assert.deepEqual(trimmed, ['stream:test:log', 'MAXLEN', '~', 1000]);
  assert(archivedAdds.every((args) => args.includes('archived_at')));
});

await record('completion archive preserves entries for the active dispatch identity', async () => {
  const activeEntries = [
    ['1-0', ['type', 'completion', 'module', '01', 'status', 'FAIL', 'run_id', 'run-old', 'attempt', '1', 'dispatch_id', 'dispatch-old']],
    ['2-0', ['type', 'completion', 'module', '01', 'status', 'PASS', 'run_id', 'run-current', 'attempt', '2', 'dispatch_id', 'dispatch-current']],
    ['3-0', ['type', 'completion', 'module', '01', 'status', 'BLOCKED', 'run_id', 'run-other', 'attempt', '3', 'dispatch_id', 'dispatch-other']],
  ];
  const deletedIds = [];

  const fakeRedis = {
    async xrange(_streamKey, start, _end, _countToken, count) {
      let startIndex = 0;
      if (start !== '-') {
        const exclusiveId = String(start).replace(/^\(/, '');
        const foundIndex = activeEntries.findIndex(([id]) => id === exclusiveId);
        startIndex = foundIndex >= 0 ? foundIndex + 1 : activeEntries.length;
      }
      return activeEntries.slice(startIndex, startIndex + count);
    },
    multi() {
      const ops = [];
      const chain = {
        xadd: (...args) => { ops.push({ op: 'xadd', args }); return chain; },
        xdel: (...args) => { ops.push({ op: 'xdel', args }); return chain; },
        exec: async () => {
          for (const op of ops) {
            if (op.op === 'xdel') deletedIds.push(op.args[1]);
          }
          return ops;
        },
      };
      return chain;
    },
    async xtrim() { return 1; },
  };

  const result = await pipelineRedisMod.archiveCompletionsChunked(fakeRedis, 'stream:test', 'stream:test:log', '01', 1000, {
    batchSize: 2,
    activeIdentity: { run_id: 'run-current', attempt: 2, dispatch_id: 'dispatch-current' },
  });

  assert.equal(result.archived, 2);
  assert.equal(result.identity_scoped, true);
  assert.deepEqual(deletedIds, ['1-0', '3-0']);
});

await record('completion archive failure emits degraded telemetry and returns a failed archive result', async () => {
  const { runtimeRoot: archiveRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(archiveRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const pollingMod = await importRuntimeModule(archiveRuntimeRoot, '/app/skills/pipeline/services/polling.ts');
  const runtimeCoreMod = await importRuntimeModule(archiveRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const registry = await buildBuiltInRegistry(archiveRuntimeRoot);

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-archive-failure-'));
  const runId = 'run-archive-failure-1';
  const behaviorTempRoot = path.join(os.homedir(), '.openclaw', 'tmp');
  fs.mkdirSync(behaviorTempRoot, { recursive: true });
  const fakeRedisModuleDir = fs.mkdtempSync(path.join(behaviorTempRoot, 'behavior-archive-failure-'));
  const fakeRedisModulePath = path.join(fakeRedisModuleDir, 'redis-archive-fails.mjs');
  fs.writeFileSync(fakeRedisModulePath, `
export default {
  async archiveCompletions() {
    throw new Error('simulated archive failure');
  },
};
`);

    const configDeps3 = {
      adapters: {
        redis: {
          ...(await import(`file://${fakeRedisModulePath}`)).default,
          async readCompletion() { return null; },
        },
      },
    };
const config = {
    project: 'behavior-archive-failure',
    acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
    repo_root: repoRoot,
    telemetry: { enabled: true },
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-11T00:00:00.000Z'),
    pluginRegistry: registry,
    agents: {
      buster: {
        dispatch: 'redis',
        redis_js_path: fakeRedisModulePath,
      },
    },
    paths: { swarm_dir: path.join(repoRoot, '.swarm') },
      };

  try {
    const result = await pollingMod.archiveModuleCompletions(config, '01', {
      run_id: runId,
      attempt: 2,
      dispatch_id: 'dispatch-archive-failure-1',
    }, {
      targetKind: 'module',
      module_id: '01',
      agent_type: 'buster',
      deps: configDeps3,
    });
    await flushAsync();

    assert.equal(result.failed, true);
    assert.equal(result.reason, 'completion_archive_failed');
    assert.equal(result.error, 'simulated archive failure');
    assert.equal(result.stream, 'swarm:pipeline:behavior-archive-failure:completions');
    assert.equal(result.archive_stream, 'swarm:pipeline:behavior-archive-failure:completions:log');

    const events = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'observability.degraded');
    assert.equal(events[0].component, 'redis_completion');
    assert.equal(events[0].surface, 'completion_archive');
    assert.equal(events[0].reason, 'completion_archive_failed');
    assert.equal(events[0].module_id, '01');
    assert.equal(events[0].agent_type, 'buster');
    assert.equal(events[0].attempt, 2);
    assert.equal(events[0].dispatch_id, 'dispatch-archive-failure-1');
    assert.equal(events[0].stream_key, 'swarm:pipeline:behavior-archive-failure:completions');
    assert.equal(events[0].detail, 'Redis completion archive failed: simulated archive failure');
  } finally {
    fs.rmSync(fakeRedisModuleDir, { recursive: true, force: true });
  }
});

await record('buster gate rate-limit pauses emit canonical gate telemetry once', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  const { runtimeRoot: sandboxTelemetryRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
  installFakeRedis(telemetryRuntimeRoot);
  installFakeRedis(sandboxTelemetryRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const gateRunnerMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/runners/buster-gate-runner.ts');
  const runtimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const busterRateLimitMod = await importRuntimeModule(sandboxTelemetryRoot, '/app/skills/pipeline/services/rate-limit.ts');
  const busterTelemetryMod = await importRuntimeModule(sandboxTelemetryRoot, '/app/skills/pipeline/services/telemetry.ts');
  const registry = await buildBuiltInRegistry(telemetryRuntimeRoot);

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-gate-rate-limit-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const logDir = path.join(swarmDir, 'logs', 'pipeline');
  fs.mkdirSync(swarmDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });

  const busterTelemetryCtx = busterTelemetryMod.createTelemetryContext({
    project: 'behavior-gate-rate-limit',
    module_id: 'gate:quality',
    run_id: 'run-gate-1',
    enabled: true,
    log_dir: logDir,
  });

  let runOnceCalls = 0;
    const configDeps4 = {
      busterGate: {
        resolvePolicy: () => ({ model: 'anthropic/claude-sonnet-4-6', model_source: 'test' }),
        logEffectivePolicy: () => {},
        readGateInstructions: () => 'Gate instructions',
        archiveGateOutputIfPresent: () => null,
        gitCommitAndPush: async () => {},
        sleep: async () => {},
        discord: async () => {},
        runOnce: async () => {
          runOnceCalls += 1;
          if (runOnceCalls === 1) {
            const rlState = busterRateLimitMod.createRateLimitState({ maxPauses: 2, initialCooldownS: 0, maxCooldownS: 0 });
            await busterRateLimitMod.handleRateLimit(rlState, {
              childSessionKey: 'agent:main:acp:gate-quality',
              telemetryCtx: busterTelemetryCtx,
              moduleId: 'gate:quality',
              gateId: 'gate:quality',
              gateType: 'buster',
              taskType: 'gate_test',
              project: 'behavior-gate-rate-limit',
              attempt: 1,
              dispatchId: 'dispatch-gate-quality',
              provider: 'anthropic',
              detail: '429 Too Many Requests',
              acpMonitorConfig: {
                unknown_poll_limit: 10,
                stale_poll_limit: 10,
                max_transcript_extensions: 3,
                transcript_grace_ms: 300000,
                monitor_poll_ms: 10000,
              },
              ownsCanonicalSignal: true,
            });
            return {
              ok: false,
              reason: 'rate_limited',
              status: {
                gate: 'gate:quality',
                _source: 'redis',
                source: 'buster-pipeline',
                dispatch_id: 'dispatch-gate-quality',
                session_key: 'agent:main:acp:gate-quality',
                attempt: 1,
                provider: 'anthropic',
                detail: '429 Too Many Requests',
              },
            };
          }
          return {
            ok: true,
            reason: 'target_reached',
            status: {
              status: 'PASS',
              reason: 'target_reached',
              _source: 'redis',
              run_id: 'run-gate-1',
              dispatch_id: 'dispatch-gate-quality',
              session_key: 'agent:main:acp:gate-quality',
              attempt: 1,
            },
          };
        },
      },
    };
const config = {
    project: 'behavior-gate-rate-limit',
    acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
    repo_root: repoRoot,
    telemetry: { enabled: true },
    _runId: 'run-gate-1',
    run_id: 'run-gate-1',
    _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
    pluginRegistry: registry,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(swarmDir, 'modules'),
      progress_file: path.join(repoRoot, 'progress.json'),
    },
    rate_limit: {
      max_pauses_per_module: 2,
      cooldown_hours: 0,
    },
    default_timeout_minutes: 5,
    default_max_fails: 1,
      };

  const progress = {
    modules: {},
    gates: {
      'gate:quality': {
        type: 'buster',
        title: 'Quality Gate',
      },
    },
    execution_order: [],
  };

  const result = await runGateViaRegistry(telemetryRuntimeRoot, config, progress, 'gate:quality', { deps: configDeps4 });
  await flushAsync();

  assert.equal(result.outcome, 'passed');
  assert.equal(result.terminal.status, 'succeeded');
  assert.equal(result.terminal.decision.action, 'none');
  assert.equal(runOnceCalls, 2);

  const streamKey = 'pipeline:telemetry:behavior-gate-rate-limit:run-gate-1';
  const gateEvents = gateRuntimeEvents(xaddEvents, streamKey);
  assert.deepEqual(gateEvents.map((event) => event.type), ['gate.started', 'rate_limit.detected', 'gate.verdict']);
  assert.deepEqual(gateEvents.map((event) => event.seq), [1, 2, 3]);

  const rateLimit = gateEvents.find((event) => event.type === 'rate_limit.detected');
  assert(rateLimit, 'missing gate rate_limit.detected event');
  assert.equal(rateLimit.agent_type, 'buster');
  assert.equal(rateLimit.gate_id, 'gate:quality');
  assert.equal(rateLimit.gate_type, 'buster');
  assert.equal(rateLimit.module_id, null);
  assert.equal(rateLimit.dispatch_id, 'dispatch-gate-quality');
  assert.equal(rateLimit.session_key, 'agent:main:acp:gate-quality');
  assert.equal(rateLimit.attempt, 1);
  assert.equal(rateLimit.pause_count, 1);
  assert.equal(rateLimit.max_pauses, 2);
  assert.equal(rateLimit.retry_after_seconds, 0);
  assert.equal(rateLimit.detail, '429 Too Many Requests');
  assert.equal(gateEvents[2].dispatch_id, 'dispatch-gate-quality');
  assert.equal(gateEvents[2].session_key, 'agent:main:acp:gate-quality');
});

await record('Nova and Buster share a run-global monotonic seq on the canonical stream', async () => {
  const { runtimeRoot: sandboxTelemetryRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
  const { runtimeRoot: generalTelemetryRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(sandboxTelemetryRoot);
  installFakeRedis(generalTelemetryRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const busterTelemetryMod = await importRuntimeModule(sandboxTelemetryRoot, '/app/skills/pipeline/services/telemetry.ts');
  const runtimeCoreMod = await importRuntimeModule(generalTelemetryRoot, '/app/skills/pipeline/core/runtime.ts');
  const novaTelemetryMod = await importRuntimeModule(generalTelemetryRoot, '/app/skills/pipeline/services/telemetry.ts');
  const registry = await buildBuiltInRegistry(generalTelemetryRoot);

  const runId = 'run-shared-seq-1';
  const streamKey = 'pipeline:telemetry:behavior-shared-seq:run-shared-seq-1';
  const busterCtx = busterTelemetryMod.createTelemetryContext({
    project: 'behavior-shared-seq',
    module_id: '01',
    run_id: runId,
    enabled: true,
  });
  const config = {
    project: 'behavior-shared-seq',
    acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
    telemetry: { enabled: true },
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
    pluginRegistry: registry,
  };

  await busterTelemetryMod.emitPluginEvent(busterCtx, 'task_started', { module_id: '01' });
  await novaTelemetryMod.emitEvent({ config }, 'module.started', {
    module_id: '01',
    model: 'anthropic/claude-sonnet-4-6',
    attempt: 1,
  });
  await busterTelemetryMod.emitPluginEvent(busterCtx, 'task_completed', { module_id: '01', outcome: 'PASS' });
  await flushAsync();
  await busterTelemetryMod.closeTelemetry(busterCtx);
  await novaTelemetryMod.closeTelemetryRedis();

  const events = gateRuntimeEvents(xaddEvents, streamKey);
  assert.deepEqual(events.map((event) => event.type), ['plugin.event', 'module.started', 'plugin.event']);
  assert.deepEqual(events.filter((event) => event.type === 'plugin.event').map((event) => event.plugin_event), ['task_started', 'task_completed']);
  assert.deepEqual(events.map((event) => event.source), ['buster', 'pipeline', 'buster']);
  assert.deepEqual(events.map((event) => event.seq), [1, 2, 3]);
});

await record('module polling treats Buster Pipeline-owned RATE_LIMITED completions as terminal ownership, not a second cooldown owner', async () => {
  const pollingMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/polling.ts');

  assert.equal(pollingMod.isTerminalOwnedRateLimitedOutcome({ outcome: 'RATE_LIMITED', source: 'buster-pipeline' }), true);
  assert.equal(pollingMod.isTerminalOwnedRateLimitedOutcome({ outcome: 'RATE_LIMITED', source: 'agent' }), false);
  assert.equal(pollingMod.isTerminalOwnedRateLimitedOutcome({ outcome: 'FAIL', source: 'buster-pipeline' }), false);
});

await record('buster gate polling treats Buster Pipeline-owned RATE_LIMITED completions as terminal ownership, not a second cooldown owner', async () => {
  const { runtimeRoot: gateRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(gateRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const gateRunnerMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/runners/buster-gate-runner.ts');
  const pollingMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/services/polling.ts');
  const rateLimitMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/services/rate-limit.ts');
  const runtimeCoreMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const registry = await buildBuiltInRegistry(gateRuntimeRoot);

  let waitCalls = 0;
  let capturedResult = null;
  const discordCalls = [];
    const configDeps5 = {
      busterGate: {
        discord: async (_config, _level, title, description, fields) => { discordCalls.push({ title, description, fields }); },
        readGateInstructions: () => 'buster gate instructions',
        resolvePolicy: () => ({ model: 'buster-model', model_source: 'test' }),
        logEffectivePolicy: () => {},
        validateBusterConfig: () => {},
        archiveModuleCompletions: async () => {},
        spawnAgent: async () => {},
        killAgent: async () => {},
        getTrackedAgent: () => ({
          telemetry_dispatch_id: 'dispatch-buster-rate-limit-1',
          dispatch_id: 'dispatch-buster-rate-limit-1',
          gatewayLabel: null,
          session_key: 'agent:main:acp:gate-buster',
        }),
        waitBusterGateCompletionEvidence: async ({ gateId, gate }) => {
          waitCalls += 1;
          capturedResult = rateLimitMod.buildGateTerminalOwnedRedisRateLimitExitResult({
            status: 'FAIL',
            outcome: 'RATE_LIMITED',
            source: 'buster-pipeline',
            reason: 'max_pauses_exceeded',
            summary: 'max_pauses_exceeded',
            run_id: 'run-buster-terminal-owned-rate-limit-1',
            attempt: 1,
            dispatch_id: 'dispatch-buster-rate-limit-1',
            session_key: 'agent:main:acp:gate-buster',
            max_rate_limit_pauses: 3,
          }, {
            expectedIdentity: { run_id: 'run-buster-terminal-owned-rate-limit-1', attempt: 1, dispatch_id: 'dispatch-buster-rate-limit-1', session_key: 'agent:main:acp:gate-buster' },
            gateId,
            gateType: gate.type,
            resultOverrides: { outcome_class: "rate_limited" },
          });
          return capturedResult;
        },
      },
    };
const config = {
    project: 'behavior-buster-terminal-owned-rate-limit',
    acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
    repo_root: fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-terminal-owned-rate-limit-')),
    paths: { swarm_dir: '/tmp/behavior-buster-terminal-owned-rate-limit-swarm' },
    agents: { buster: {} },
    telemetry: { enabled: true },
    _runId: 'run-buster-terminal-owned-rate-limit-1',
    run_id: 'run-buster-terminal-owned-rate-limit-1',
    _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
    pluginRegistry: registry,
    default_timeout_minutes: 5,
    default_max_fails: 1,
    rate_limit: { max_pauses_per_module: 2, cooldown_hours: 0 },
      };

  const progress = {
    modules: {},
    gates: {
      'gate:buster': { type: 'buster', title: 'Buster Gate', timeout_minutes: 5 },
    },
  };

  const result = await runGateViaRegistry(gateRuntimeRoot, config, progress, 'gate:buster', { deps: configDeps5 });
  await flushAsync();

  assert.equal(waitCalls, 1);
  assert.equal(result.terminal.status, 'rate_limited');
  assert.equal(result.terminal.decision.action, 'retry_later');
  assert.equal(result.diagnostics.summary, "Gate 'gate:buster' exceeded max rate limit pauses");
  assert.equal(result.diagnostics.metadata.attempt, 1);
  assert.equal(result.diagnostics.metadata.dispatch_id, 'dispatch-buster-rate-limit-1');
  assert.equal(result.diagnostics.metadata.gateway_label, null);
  assert.equal(result.diagnostics.metadata.session_key, 'agent:main:acp:gate-buster');
  assert.equal(capturedResult.rate_limit_exhausted, true);
  assert.equal(capturedResult.max_rate_limit_pauses, 3);
  assert.equal(capturedResult.rate_limit_status?.max_rate_limit_pauses, 3);
  assert.equal(capturedResult.status?.max_rate_limit_pauses, 3);
  assert.equal(capturedResult.dispatch_id, 'dispatch-buster-rate-limit-1');
  assert.equal(capturedResult.gateway_label, null);
  assert.equal(capturedResult.session_key, 'agent:main:acp:gate-buster');

  const exhaustedDiscord = discordCalls.find((call) => call.title === "Gate 'gate:buster' Rate Limit Exhausted");
  assert.equal(exhaustedDiscord.description, 'Gate attempt 1 exceeded max ACP rate limit pauses (3).');

  const streamKey = 'pipeline:telemetry:behavior-buster-terminal-owned-rate-limit:run-buster-terminal-owned-rate-limit-1';
  const events = gateRuntimeEvents(xaddEvents, streamKey);
  assert.deepEqual(events.map((event) => event.type), ['gate.started', 'gate.verdict', 'retry.exhausted']);
  assert.equal(events[1].reason, "Gate 'gate:buster' exceeded max rate limit pauses");
  assert.equal(events[1].dispatch_id, 'dispatch-buster-rate-limit-1');
  assert.equal(events[1].session_key, 'agent:main:acp:gate-buster');
  assert.equal(events[2].gate_id, 'gate:buster');
  assert.equal(events[2].gate_type, 'buster');
  assert.equal(events[2].module_id, null);
  assert.equal(events[2].phase, 'buster_gate');
  assert.equal(result.gateway_label, null);
  assert.equal(events[2].dispatch_id, events[1].dispatch_id);
  assert.equal(events[2].session_key, 'agent:main:acp:gate-buster');
  assert.equal(events[2].reason, "Gate 'gate:buster' exceeded max rate limit pauses");
  assert.equal(events[2].attempt, 1);
  assert.equal(events[2].max_attempts, 3);
  assert.equal(events[2].max_fails, 3);
  assert.equal(pollingMod.isTerminalOwnedRateLimitedOutcome({ outcome: 'RATE_LIMITED', source: 'buster-pipeline' }), true);
});

await record('shared telemetry loader uses secure Redis transport contract', async () => {
  const telemetryHelperPath = path.join(sourceRoot, 'skills', 'common', 'pipeline', 'telemetry.ts');
  const transportHelperPath = path.join(sourceRoot, 'skills', 'common', 'pipeline', 'redis-transport.ts');
  const telemetryHelper = fs.readFileSync(telemetryHelperPath, 'utf8');
  const transportHelper = fs.readFileSync(transportHelperPath, 'utf8');

  assert.equal(telemetryHelper.includes("from './redis-transport.ts'"), true);
  assert.equal(transportHelper.includes('Secure Redis transport policy violation'), true);
  assert.equal(transportHelper.includes('SECURE_REDIS_TRANSPORT_POLICY_VIOLATION'), true);
  assert.equal(transportHelper.includes('enforceSecureMode'), true);
  assert.equal(transportHelper.includes('MissingDependencyError'), true);
  assert.equal(transportHelper.includes('/app/node_modules/ioredis'), false);
  assert.equal(transportHelper.includes('/usr/local/lib/node_modules/ioredis'), false);
  assert.equal(transportHelper.includes('requireFirst'), false);

  const { runtimeRoot: sandboxTelemetryRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
  installFakeRedis(sandboxTelemetryRoot);
  const busterTelemetryMod = await importRuntimeModule(sandboxTelemetryRoot, '/app/skills/pipeline/services/telemetry.ts');
  const busterCtx = busterTelemetryMod.createTelemetryContext({
    project: 'behavior-telemetry-loader',
    module_id: '01',
    run_id: 'run-telemetry-loader-1',
    enabled: true,
    redisHost: '127.0.0.1',
    enforceSecureMode: false,
  });
  assert(busterCtx?.redis, 'buster telemetry should resolve packaged ioredis through the shared secure loader with explicit local verification options');
  await busterTelemetryMod.closeTelemetry(busterCtx);
});
}
