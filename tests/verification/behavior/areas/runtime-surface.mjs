import {
  buildBuiltInRegistry,
  platformTestDefaults,
} from './helpers.mjs';

export async function registerRuntimeSurfaceArea({
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
const anyPluginConfigSchema = () => ({
  schemaType: 'json_schema',
  schemaVersion: 'draft-07',
  schema: { type: 'object', additionalProperties: true },
  defaults: {},
});

await record('gateway token/env resolution uses only canonical OPENCLAW names', async () => {
  const prev = {
    OPENCLAW_GATEWAY_URL: process.env.OPENCLAW_GATEWAY_URL,
    OPENCLAW_GATEWAY_TOKEN: process.env.OPENCLAW_GATEWAY_TOKEN,
  };
  try {
    process.env.OPENCLAW_GATEWAY_URL = 'http://gw.example/tools/invoke';
    process.env.OPENCLAW_GATEWAY_TOKEN = 'openclaw-token';
    assert.equal(gatewayMod.resolveGatewayBaseUrl(), 'http://gw.example');
    assert.equal(gatewayMod.resolveGatewayInvokeUrl(), 'http://gw.example/tools/invoke');
    assert.equal(gatewayMod.resolveGatewayHealthUrl(), 'http://gw.example/health');
    assert.equal(gatewayMod.resolveGatewayToken(), 'openclaw-token');

    delete process.env.OPENCLAW_GATEWAY_URL;
    delete process.env.OPENCLAW_GATEWAY_TOKEN;
    assert.throws(
      () => gatewayMod.resolveGatewayBaseUrl(),
      /Gateway URL is required/
    );
    assert.throws(
      () => gatewayMod.resolveGatewayToken(),
      /Gateway token policy is required/
    );
    assert.equal(gatewayMod.resolveLocalDevelopmentGatewayBaseUrl(), 'http://127.0.0.1:18789');
  } finally {
    Object.entries(prev).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});

await record('runtime run identity remains explicit per context/config in one process', async () => {
  const runtimeCoreMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const contextMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/context.ts');
  const loggerMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/logger.ts');

  const statsA = runtimeCoreMod.createRunStats('2026-05-08T00:01:00.000Z');
  const statsB = runtimeCoreMod.createRunStats('2026-05-08T00:02:00.000Z');
  const configA = { project: 'ctx-a' };
  const configB = { project: 'ctx-b' };
  const ctxA = contextMod.createPipelineContext({ config: configA, runId: 'run-context-a', stats: statsA });
  const ctxB = contextMod.createPipelineContext({ config: configB, runId: 'run-context-b', stats: statsB });

  assert.equal(Object.prototype.hasOwnProperty.call(runtimeCoreMod, 'RUN_ID'), false, 'runtime core must not export legacy RUN_ID');
  assert.equal(Object.prototype.hasOwnProperty.call(runtimeCoreMod, '_runStats'), false, 'runtime core must not export legacy _runStats');
  assert.equal(Object.prototype.hasOwnProperty.call(runtimeCoreMod, 'setRunState'), false, 'runtime core must not export legacy setRunState');
  assert.equal(runtimeCoreMod.getRunId(ctxA), 'run-context-a');
  assert.equal(runtimeCoreMod.getRunStats(ctxA), statsA);
  assert.equal(runtimeCoreMod.getRunId(configA), 'run-context-a');
  assert.equal(runtimeCoreMod.getRunStats(configA), statsA);
  assert.equal(runtimeCoreMod.getRunId(configB), 'run-context-b');
  assert.equal(runtimeCoreMod.getRunStats(configB), statsB);

  loggerMod.setActiveContext(ctxB);
  try {
    assert.equal(runtimeCoreMod.getRunId(), 'run-context-b', 'no-argument helper should use active context');
    assert.equal(runtimeCoreMod.getRunStats(), statsB, 'no-argument stats helper should use active context');
    assert.equal(runtimeCoreMod.getRunId(configA), 'run-context-a', 'explicit config A must not be overwritten by active context B');
    assert.equal(runtimeCoreMod.getRunStats(configA), statsA, 'explicit config A stats must not be overwritten by active context B');
    assert.equal(runtimeCoreMod.getRunId(ctxA), 'run-context-a', 'explicit context A must not be overwritten by active context B');
  } finally {
    loggerMod.clearActiveContext();
  }

  assert.equal(runtimeCoreMod.getRunId(), null, 'after clearing active context, no-argument helper must not invent fallback run identity');
  assert.throws(
    () => runtimeCoreMod.getRunStats(),
    /run context is unavailable|run context is missing/,
    'after clearing active context, stats helper requires explicit run context',
  );
});

await record('shared gateway helper exposes typed gateway operation surfaces', async () => {
  for (const name of ['getGatewaySessionStatus', 'spawnGatewaySession', 'sendGatewaySessionMessage', 'killGatewaySubagent', 'listGatewaySubagents', 'checkGatewayHealth']) {
    assert.equal(typeof gatewayMod[name], 'function');
  }
  assert.equal(typeof gatewayMod.resolveGatewayBaseUrl, 'function');
  assert.equal(typeof gatewayMod.resolveGatewayInvokeUrl, 'function');
  assert.equal(typeof gatewayMod.resolveGatewayHealthUrl, 'function');
  assert.equal(typeof gatewayMod.resolveGatewayToken, 'function');
  assert.equal(Object.prototype.hasOwnProperty.call(gatewayMod, 'GATEWAY_URL'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(gatewayMod, 'GATEWAY_TOKEN'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(gatewayMod, 'GATEWAY_HEALTH_URL'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(gatewayMod, 'DEFAULT_GATEWAY_BASE_URL'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(gatewayMod, 'DEFAULT_GATEWAY_INVOKE_URL'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(gatewayMod, 'DEFAULT_GATEWAY_HEALTH_URL'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(gatewayMod, 'gatewayHeaders'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(gatewayMod, 'invokeGatewayTool'), false);
});

await record('transcript path resolution prefers sessionFile then falls back to sessionId', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-home-'));
  const sessionsDir = ensureDir(path.join(home, '.openclaw', 'agents', 'main', 'sessions'));
  const sessionKey = 'agent:main:subagent:test-1';
  const relFile = 'relative-log.jsonl';
  fs.writeFileSync(path.join(sessionsDir, relFile), '');
  fs.writeFileSync(path.join(sessionsDir, 'abc.jsonl'), '');

  const prevHome = process.env.HOME;
  process.env.HOME = home;
  try {
    fs.writeFileSync(path.join(sessionsDir, 'sessions.json'), JSON.stringify({
      [sessionKey]: { sessionFile: relFile, sessionId: 'abc' },
    }));
    assert.equal(lifecycleMod.resolveSubagentTranscriptPath(sessionKey), path.join(sessionsDir, relFile));

    fs.writeFileSync(path.join(sessionsDir, 'sessions.json'), JSON.stringify({
      [sessionKey]: { sessionId: 'abc' },
    }));
    assert.equal(lifecycleMod.resolveSubagentTranscriptPath(sessionKey), path.join(sessionsDir, 'abc.jsonl'));
  } finally {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
  }
});

await record('redis audit artifacts use canonical redis/ paths for both global and run-scoped logs', async () => {
  const swarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-redis-logs-'));
  const logRoot = path.join(swarmDir, 'logs');
  const config = {
    paths: { swarm_dir: swarmDir },
    _runId: 'run-test',
  };

  const exchangeTargets = redisLogMod.getRedisLogTargets(config, 'redis-exchanges.jsonl');
  const opsTargets = redisLogMod.getRedisLogTargets(config, 'redis-ops.jsonl');

  assert.deepEqual(exchangeTargets, [
    path.join(logRoot, 'redis', 'redis-exchanges.jsonl'),
    path.join(logRoot, 'pipeline', 'runs', 'run-test', 'redis', 'redis-exchanges.jsonl'),
  ]);
  assert.deepEqual(opsTargets, [
    path.join(logRoot, 'redis', 'redis-ops.jsonl'),
    path.join(logRoot, 'pipeline', 'runs', 'run-test', 'redis', 'redis-ops.jsonl'),
  ]);
  assert.equal(exchangeTargets.some((target) => target.endsWith(path.join('pipeline', 'redis.jsonl'))), false);
});

await record('redis exchange artifacts are object JSONL, not double-encoded strings', async () => {
  const swarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-redis-exchange-jsonl-'));
  const logRoot = path.join(swarmDir, 'logs');
  const runtimeCoreMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const config = {
    ...platformTestDefaults(),
    project: 'behavior-redis-exchange-jsonl',
    paths: { swarm_dir: swarmDir },
    _runId: 'run-redis-exchange-jsonl',
    _runStats: runtimeCoreMod.createRunStats('2026-04-28T07:20:00.000Z'),
  };

  redisLogMod.logRedisSent(config, 'buster_task', 'module', '01', {
    task: 'module_test',
    module_id: '01',
  });
  redisLogMod.appendRedisArtifactRecord(config, JSON.stringify({ legacy: true }), 'redis-exchanges.jsonl');

  const globalLines = fs.readFileSync(path.join(logRoot, 'redis', 'redis-exchanges.jsonl'), 'utf8').trim().split('\n');
  const runLines = fs.readFileSync(path.join(logRoot, 'pipeline', 'runs', 'run-redis-exchange-jsonl', 'redis', 'redis-exchanges.jsonl'), 'utf8').trim().split('\n');
  assert.equal(globalLines.length, 1);
  assert.equal(runLines.length, 1);
  const entry = JSON.parse(runLines[0]);
  assert.equal(typeof entry, 'object');
  assert.equal(typeof entry !== 'string', true);
  assert.equal(entry.ts != null, true);
  assert.equal(entry.timestamp, undefined);
  assert.equal(entry.run_id, 'run-redis-exchange-jsonl');
  assert.equal(entry.direction, 'sent');
  assert.equal(entry.type, 'buster_task');
  assert.equal(entry.scope, 'module');
  assert.equal(entry.scope_id, '01');
  assert.equal(entry.payload.module_id, '01');
});

await record('redis artifact logging reports append failures without blocking callers', async () => {
  const swarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-redis-log-failure-'));
  const logRoot = path.join(swarmDir, 'logs');
  const runLogDir = path.join(logRoot, 'pipeline', 'runs', 'run-redis-log-failure');
  fs.mkdirSync(path.dirname(path.join(logRoot, 'redis')), { recursive: true });
  fs.writeFileSync(path.join(logRoot, 'redis'), 'not a directory');
  fs.mkdirSync(runLogDir, { recursive: true });
  fs.writeFileSync(path.join(runLogDir, 'redis'), 'not a directory');

  const config = {
    ...platformTestDefaults(),
    project: 'behavior-redis-log-failure',
    paths: { swarm_dir: swarmDir },
    _runId: 'run-redis-log-failure',
  };

  const originalStderrWrite = process.stderr.write;
  let stderr = '';
  process.stderr.write = (chunk, encoding, cb) => {
    stderr += String(chunk);
    if (typeof encoding === 'function') encoding();
    if (typeof cb === 'function') cb();
    return true;
  };
  try {
    const result = redisLogMod.appendRedisArtifactRecord(config, { ok: true }, 'redis-exchanges.jsonl');
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 2);
    assert.equal(stderr.includes('[redis-log] Redis artifact append failed for redis-exchanges.jsonl'), true);
    assert.equal(stderr.includes('classification=redis_artifact_append_failed'), true);
  } finally {
    process.stderr.write = originalStderrWrite;
  }
});

await record('redis log close is explicit sync-jsonl no-op without stale stream fallback', async () => {
  const result = redisLogMod.closeRedisLog();
  const redisLogSource = readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/services/redis-log.ts');

  assert.deepEqual(result, {
    ok: true,
    closed: false,
    reason: 'redis_log_uses_sync_jsonl_writes',
  });
  assert.equal(redisLogSource.includes('_logStream'), false);
  assert.equal(redisLogSource.includes('_logStreamPath'), false);
  assert.equal(redisLogSource.includes('catch' + ' {'), false);
});

await record('structured observability events mirror to both operator-tail and run-scoped pipeline logs', async () => {
  const swarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-observability-'));
  const logRoot = path.join(swarmDir, 'logs');
  const runId = 'run-obsv';
  const observabilityMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/observability.ts');
  const runtimeCoreMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const config = {
    ...platformTestDefaults(),
    project: 'behavior-demo',
    paths: { swarm_dir: swarmDir },
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
    pluginRegistry: await buildBuiltInRegistry(runtimeRoot),
  };

  observabilityMod.appendStructuredEvent(config, 'observability.degraded', {
    component: 'telemetry',
    surface: 'redis_stream',
    reason: 'redis_emit_failed',
  });

  const globalPath = path.join(logRoot, 'pipeline', 'pipeline.jsonl');
  const runPath = path.join(logRoot, 'pipeline', 'runs', runId, 'pipeline.jsonl');
  assert.equal(fs.existsSync(globalPath), true);
  assert.equal(fs.existsSync(runPath), true);

  const globalEvents = fs.readFileSync(globalPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const runEvents = fs.readFileSync(runPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

  assert.equal(globalEvents.length, 1);
  assert.equal(runEvents.length, 1);
  assert.deepEqual(globalEvents[0], runEvents[0]);
  assert.equal(globalEvents[0].type, 'observability.degraded');
  assert.equal(typeof globalEvents[0].ts, 'string');
  assert.equal(globalEvents[0].source, 'pipeline');
  assert.equal(globalEvents[0].emitter, 'nova/pipeline/services/observability');
  assert.equal(globalEvents[0].run_id, runId);
  assert.equal(Object.prototype.hasOwnProperty.call(globalEvents[0], 'event'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(globalEvents[0], 'timestamp'), false);
});

await record('artifact authority drift reports stale pointers and fallback evidence without lifecycle mutation', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-artifact-authority-drift-'));
  const swarmDir = path.join(root, '.swarm');
  const runId = 'run-artifact-authority-current';
  const statusStoreMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/status-store.ts');
  const artifactMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/artifact-bundle.ts');
  const config = {
    ...platformTestDefaults(),
    project: 'behavior-artifact-authority-drift',
    repo_root: root,
    _runId: runId,
    run_id: runId,
    paths: { swarm_dir: swarmDir },
  };

  try {
    statusStoreMod.initLogDir(config, { runId, config });
    const latestPath = path.join(swarmDir, 'logs', 'pipeline', 'latest.json');
    const staleLatest = {
      run_id: 'run-artifact-authority-stale',
      status: 'completed',
      pipeline_jsonl: 'runs/run-artifact-authority-stale/pipeline.jsonl',
    };
    fs.writeFileSync(latestPath, JSON.stringify(staleLatest, null, 2));
    const runLogDir = path.join(swarmDir, 'logs', 'pipeline', 'runs', runId);
    fs.mkdirSync(path.join(runLogDir, 'plugin-artifacts'), { recursive: true });
    fs.writeFileSync(path.join(runLogDir, 'buster-telemetry-fallback.jsonl'), JSON.stringify({
      type: 'observability.degraded',
      run_id: runId,
      artifact_fallback: true,
      seq: null,
      session_key: 'agent:old',
      dispatch_id: 'dispatch-old',
    }) + '\n');

    const beforeModels = statusStoreMod.loadLifecycleReadModels(config);
    assert.deepEqual(Object.keys(beforeModels.modules), []);
    assert.deepEqual(Object.keys(beforeModels.gates), []);

    const stalePointerEvidence = artifactMod.projectPipelineArtifactEvidence({
      surface: artifactMod.PIPELINE_ARTIFACT_SURFACES.LATEST_JSON,
      path: 'latest.json',
      artifact: staleLatest,
      expectedRunId: runId,
    });
    assert.equal(stalePointerEvidence.role, 'latest_pointer');
    assert.equal(stalePointerEvidence.authority.code, 'artifact_identity_drift');
    assert.equal(stalePointerEvidence.authority.stale_pointer, true);
    assert.equal(stalePointerEvidence.authority.allow_lifecycle_authority, false);
    assert.equal(stalePointerEvidence.authority.allow_session_authority, false);

    const fallbackEvidence = artifactMod.projectPipelineArtifactEvidence({
      surface: artifactMod.PIPELINE_ARTIFACT_SURFACES.FALLBACK_TELEMETRY,
      path: `runs/${runId}/buster-telemetry-fallback.jsonl`,
      artifact: {
        run_id: runId,
        artifact_fallback: true,
        seq: null,
        session_key: 'agent:old',
        dispatch_id: 'dispatch-old',
      },
      expectedRunId: runId,
      expectedSessionKey: 'agent:current',
      expectedDispatchId: 'dispatch-current',
    });
    assert.equal(fallbackEvidence.role, 'diagnostic_fallback');
    assert.equal(fallbackEvidence.authority.diagnostic_evidence_only, true);
    assert.equal(fallbackEvidence.authority.session_key_matches, false);
    assert.equal(fallbackEvidence.authority.dispatch_id_matches, false);
    assert.equal(fallbackEvidence.authority.allow_ordering_authority, false);
    assert.equal(fallbackEvidence.authority.allow_scheduler_authority, false);

    const afterModels = statusStoreMod.loadLifecycleReadModels(config);
    assert.deepEqual(Object.keys(afterModels.modules), []);
    assert.deepEqual(Object.keys(afterModels.gates), []);
    assert.deepEqual(statusStoreMod.readLifecycleEvents(config), []);
  } finally {
    config._pipelineLogFd?.end();
    config._runPipelineLogFd?.end();
  }
});

await record('successful telemetry emits mirror to both operator-tail and run-scoped pipeline logs', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(telemetryRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const telemetryMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/telemetry.ts');
  const runtimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const registryMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/registry.ts');
  const { registry, errors } = registryMod.buildPluginRegistry({ enabled: true, allowCustomModules: false, extraModulePaths: [], modules: {}, stageOwners: {}, restrictedCapabilityAllowlist: {} }, { throwOnError: false });
  assert.equal(errors.length, 0);

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-telemetry-mirror-'));
  const logRoot = path.join(repoRoot, '.swarm', 'logs');
  const runId = 'run-telemetry-mirror-1';
  const config = {
    ...platformTestDefaults(),
    project: 'behavior-telemetry-mirror',
    telemetry: platformTestDefaults().telemetry,
    paths: { swarm_dir: path.join(repoRoot, '.swarm') },
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
    pluginRegistry: registry,
  };

  telemetryMod.onModuleFail({ config }, '07', {
    title: 'Observability',
    old_status: 'IN_PROGRESS',
    attempt: 2,
    phase: 'forge',
    reason: 'compile failure',
  });
  await flushAsync();

  const streamKey = `pipeline:telemetry:${config.project}:${runId}`;
  const streamEvents = xaddEvents(streamKey);
  assert.equal(streamEvents.length, 1);

  const globalPath = path.join(logRoot, 'pipeline', 'pipeline.jsonl');
  const runPath = path.join(logRoot, 'pipeline', 'runs', runId, 'pipeline.jsonl');
  const globalEvents = fs.readFileSync(globalPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const runEvents = fs.readFileSync(runPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

  assert.equal(globalEvents.length, 1);
  assert.equal(runEvents.length, 1);
  assert.deepEqual(globalEvents[0], runEvents[0]);
  assert.equal(globalEvents[0].type, 'module.status_changed');
  assert.equal(globalEvents[0].new_status, 'FAIL');
  assert.equal(globalEvents[0].module_id, '07');
  assert.equal(globalEvents[0].seq, 1);
  assert.equal(globalEvents[0].source, 'pipeline');
  assert.equal(globalEvents[0].emitter, 'nova/pipeline/services/telemetry');
  assert.equal(globalEvents[0].reason, 'compile failure');
  assert.equal(streamEvents[0].seq, globalEvents[0].seq);
  assert.equal(streamEvents[0].type, globalEvents[0].type);
});

await record('notification registry exposes deterministic built-in sink order with Discord enabled for explicit presentation hooks', async () => {
  const { runtimeRoot: notificationRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  const registryMod = await importRuntimeModule(notificationRuntimeRoot, '/app/skills/pipeline/core/registry.ts');

  const { registry } = registryMod.buildPluginRegistry({ enabled: true, allowCustomModules: false, extraModulePaths: [], modules: {}, stageOwners: {}, restrictedCapabilityAllowlist: {} }, {});
  const listeners = registryMod.resolveHookListeners(registry, 'module.completed', 'module.completed');

  assert.deepEqual(listeners.map((record) => record.manifest.moduleId), [
    'builtin.notification.telemetry.module_completed',
    'builtin.notification.structured_event_artifact.module_completed',
    'builtin.notification.discord.module_completed',
  ]);
  assert.equal(Boolean(registry.records['builtin.notification.discord.module_completed']), true);
  assert.equal(registry.records['builtin.notification.discord.module_completed'].enabled, true);
});

await record('notification dispatch preserves one immutable fact snapshot, orders listeners by priority then moduleId, and degrades past listener failure', async () => {
  const { runtimeRoot: notificationRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  const registryMod = await importRuntimeModule(notificationRuntimeRoot, '/app/skills/pipeline/core/registry.ts');
  const dispatchMod = await importRuntimeModule(notificationRuntimeRoot, '/app/skills/pipeline/services/notification-dispatch.ts');
  const runtimeCoreMod = await importRuntimeModule(notificationRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');

  const calls = [];
  const seenSnapshots = [];
  const customModules = [
    {
      manifest: {
        moduleId: 'custom.notification.beta',
        contractVersion: 'pipeline-plugin-v1',
        kind: 'notification',
        hookFamily: 'module.completed',
        stageIds: ['module.completed'],
        capabilities: ['read.state', 'emit.stream'],
        configSchema: anyPluginConfigSchema(),
        sourceType: 'builtin',
        trustTier: 'trusted',
        defaultEnabled: true,
        priority: 20,
      },
      implementation: {
        observe: async (input) => {
          calls.push('beta');
          seenSnapshots.push(input);
        },
      },
    },
    {
      manifest: {
        moduleId: 'custom.notification.alpha',
        contractVersion: 'pipeline-plugin-v1',
        kind: 'notification',
        hookFamily: 'module.completed',
        stageIds: ['module.completed'],
        capabilities: ['read.state', 'emit.stream'],
        configSchema: anyPluginConfigSchema(),
        sourceType: 'builtin',
        trustTier: 'trusted',
        defaultEnabled: true,
        priority: 10,
      },
      implementation: {
        observe: async (input) => {
          calls.push('alpha');
          seenSnapshots.push(input);
          assert.equal(Object.isFrozen(input), true);
          assert.equal(Object.isFrozen(input.snapshot), true);
        },
      },
    },
    {
      manifest: {
        moduleId: 'custom.notification.gamma',
        contractVersion: 'pipeline-plugin-v1',
        kind: 'notification',
        hookFamily: 'module.completed',
        stageIds: ['module.completed'],
        capabilities: ['read.state', 'emit.stream'],
        configSchema: anyPluginConfigSchema(),
        sourceType: 'builtin',
        trustTier: 'trusted',
        defaultEnabled: true,
        priority: 10,
      },
      implementation: {
        observe: async (input) => {
          calls.push('gamma');
          seenSnapshots.push(input);
          throw new Error(`synthetic sink failure for ${input.event.type}`);
        },
      },
    },
  ];

  const { registry } = registryMod.buildPluginRegistry({ enabled: true, allowCustomModules: false, extraModulePaths: [], modules: {}, stageOwners: {}, restrictedCapabilityAllowlist: {} }, { builtinModules: customModules });
  const config = {
    ...platformTestDefaults(),
    project: 'behavior-notification-dispatch',
    _runId: 'run-notification-dispatch-1',
    run_id: 'run-notification-dispatch-1',
    _runStats: runtimeCoreMod.createRunStats('2026-04-21T00:00:00.000Z'),
    pluginRegistry: registry,
  };

  const result = await dispatchMod.dispatchNotificationHook({ config }, 'module.completed', {
    ids: { moduleId: '07', attempt: 3 },
    snapshot: { status: 'PASS' },
    event: { type: 'module.status_changed', payload: { module_id: '07', new_status: 'PASS', attempt: 3 } },
  });

  assert.deepEqual(calls, ['alpha', 'gamma', 'beta']);
  assert.equal(seenSnapshots.length, 3);
  assert.deepEqual(seenSnapshots[0], seenSnapshots[1]);
  assert.deepEqual(seenSnapshots[1], seenSnapshots[2]);
  assert.deepEqual(result.results, [
    { moduleId: 'custom.notification.alpha', ok: true },
    { moduleId: 'custom.notification.gamma', ok: false, error: 'synthetic sink failure for module.status_changed' },
    { moduleId: 'custom.notification.beta', ok: true },
  ]);
});

await record('notification dispatch fails visibly when a hook has no enabled listeners instead of falling back to direct lifecycle emission', async () => {
  const { runtimeRoot: notificationRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(notificationRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const registryMod = await importRuntimeModule(notificationRuntimeRoot, '/app/skills/pipeline/core/registry.ts');
  const dispatchMod = await importRuntimeModule(notificationRuntimeRoot, '/app/skills/pipeline/services/notification-dispatch.ts');
  const runtimeCoreMod = await importRuntimeModule(notificationRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');

  const { registry } = registryMod.buildPluginRegistry({ enabled: true, allowCustomModules: false, extraModulePaths: [], modules: {}, stageOwners: {}, restrictedCapabilityAllowlist: {} }, {});
  const runId = 'run-notification-missing-listener-1';
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-notification-missing-listener-'));
  const logRoot = path.join(repoRoot, '.swarm', 'logs');
  const config = {
    ...platformTestDefaults(),
    project: 'behavior-notification-missing-listener',
    telemetry: platformTestDefaults().telemetry,
    paths: { swarm_dir: path.join(repoRoot, '.swarm') },
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-22T00:00:00.000Z'),
    pluginRegistry: {
      ...registry,
      hookIndex: {
        ...registry.hookIndex,
        'module.completed': {
          ...registry.hookIndex['module.completed'],
          'module.completed': [],
        },
      },
    },
  };

  const result = await dispatchMod.dispatchNotificationHook({ config }, 'module.completed', {
    ids: { moduleId: '07', attempt: 2 },
    snapshot: { status: 'PASS' },
    event: { type: 'module.status_changed', payload: { module_id: '07', new_status: 'PASS', attempt: 2 } },
  });

  assert.equal(result.listenerMissing, true);
  assert.equal(result.reason, 'notification_listener_missing');
  assert.deepEqual(result.listeners, []);
  assert.deepEqual(result.results, []);

  const streamKey = `pipeline:telemetry:${config.project}:${runId}`;
  const streamEvents = xaddEvents(streamKey);
  assert.equal(streamEvents.length, 1);
  assert.equal(streamEvents[0].type, 'observability.degraded');
  assert.equal(streamEvents[0].surface, 'listener_registry');
  assert.equal(streamEvents[0].reason, 'notification_listener_missing');
  assert.equal(streamEvents[0].impacted_event_type, 'module.status_changed');
  assert.equal(streamEvents[0].hook_id, 'module.completed');
  assert.equal(streamEvents[0].module_id, '07');
  assert.equal(streamEvents.some((event) => event.type === 'module.status_changed'), false);

  const globalEvents = fs.readFileSync(path.join(logRoot, 'pipeline', 'pipeline.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.equal(globalEvents.length, 1);
  assert.equal(globalEvents[0].type, 'observability.degraded');
  assert.equal(globalEvents[0].surface, 'listener_registry');
  assert.equal(globalEvents[0].reason, 'notification_listener_missing');
});

await record('structured event sink degradation records observability.degraded and later observability.restored without becoming lifecycle authority', async () => {
  const { runtimeRoot: observabilityRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(observabilityRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const observabilityMod = await importRuntimeModule(observabilityRuntimeRoot, '/app/skills/pipeline/services/observability.ts');
  const runtimeCoreMod = await importRuntimeModule(observabilityRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-structured-sink-'));
  const blockedSwarmDir = path.join(repoRoot, 'blocked-swarm');
  const blockedLogRoot = path.join(blockedSwarmDir, 'logs');
  fs.mkdirSync(blockedSwarmDir, { recursive: true });
  fs.writeFileSync(blockedLogRoot, 'not-a-directory');

  const runId = 'run-structured-sink-1';
  const config = {
    ...platformTestDefaults(),
    project: 'behavior-structured-sink',
    telemetry: platformTestDefaults().telemetry,
    paths: { swarm_dir: blockedSwarmDir },
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-21T00:00:00.000Z'),
    pluginRegistry: await buildBuiltInRegistry(observabilityRuntimeRoot),
  };

  const firstOk = await observabilityMod.appendStructuredEventMirror(config, 'module.status_changed', {
    module_id: '01',
    new_status: 'FAIL',
  });
  assert.equal(firstOk, false);
  const duplicateOk = await observabilityMod.appendStructuredEventMirror(config, 'module.status_changed', {
    module_id: '01',
    new_status: 'FAIL',
  });
  assert.equal(duplicateOk, false);

  const degradedEvents = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`)
    .filter((event) => event.type === 'observability.degraded' && event.surface === 'pipeline_jsonl' && event.reason === 'structured_event_append_failed');
  assert.equal(degradedEvents.length, 1, 'central observability state should suppress duplicate degraded events for the same surface');

  const neverFailedRestore = await observabilityMod.recordObservabilityRestored({ config }, {
    component: 'observability',
    surface: 'never_failed',
    reason: 'synthetic',
    detail: 'should not emit',
  });
  assert.equal(neverFailedRestore.emitted, false, 'restored transitions should be ignored unless the surface is already degraded');

  const goodSwarmDir = path.join(repoRoot, '.swarm');
  const goodLogRoot = path.join(goodSwarmDir, 'logs');
  config.paths.swarm_dir = goodSwarmDir;

  const secondOk = await observabilityMod.appendStructuredEventMirror(config, 'module.status_changed', {
    module_id: '01',
    new_status: 'PASS',
  });
  assert.equal(secondOk, true);

  const streamEvents = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
  assert.equal(streamEvents.filter((event) => event.type === 'observability.restored' && event.surface === 'pipeline_jsonl' && event.reason === 'structured_event_append_failed').length, 1);

  const duplicateRestore = await observabilityMod.recordObservabilityRestored({ config }, {
    component: 'observability',
    surface: 'pipeline_jsonl',
    reason: 'structured_event_append_failed',
    detail: 'should not emit twice',
  });
  assert.equal(duplicateRestore.emitted, false, 'central observability state should suppress duplicate restored events');

  const globalEvents = fs.readFileSync(path.join(goodLogRoot, 'pipeline', 'pipeline.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const lifecycleEvents = globalEvents.filter((event) => event.type !== 'observability.degraded' && event.type !== 'observability.restored');
  assert.equal(lifecycleEvents.at(-1).type, 'module.status_changed');
  assert.equal(lifecycleEvents.at(-1).new_status, 'PASS');
});

await record('ACP launch verification fails closed on stream-log-only reachability evidence', async () => {
  const launchLibMod = await importRuntimeModule(sourceRoot, '/tests/verification/runtime/session-launch-lib.mjs');

  const result = launchLibMod.assessLaunchVerification({
    observed: {
      visible: false,
      active: false,
      state: 'status_error',
      degradedVisibility: true,
    },
    streamLogExists: true,
    cleanup: { confirmed: false },
    allowTerminalAfterLaunch: true,
    keepSession: false,
  });

  assert.equal(result.ok, false);
  assert.equal(result.launchConfirmed, false);
  assert.equal(result.launchEvidence, 'stream_log_only');
  assert.equal(result.degradedVisibility, true);
  assert.equal(result.cleanupConfirmed, false);
  assert.deepEqual(result.nonPassReasons, [
    'launch_unconfirmed_stream_log_only',
    'gateway_visibility_degraded',
    'cleanup_unconfirmed',
  ]);
});

await record('ACP launch verification requires confirmed cleanup before reporting PASS', async () => {
  const launchLibMod = await importRuntimeModule(sourceRoot, '/tests/verification/runtime/session-launch-lib.mjs');

  const result = launchLibMod.assessLaunchVerification({
    observed: {
      visible: true,
      active: false,
      state: 'completed',
      degradedVisibility: false,
    },
    streamLogExists: true,
    cleanup: { confirmed: false },
    allowTerminalAfterLaunch: true,
    keepSession: false,
  });

  assert.equal(result.ok, false);
  assert.equal(result.launchConfirmed, true);
  assert.equal(result.launchEvidence, 'session_status');
  assert.equal(result.cleanupConfirmed, false);
  assert.deepEqual(result.nonPassReasons, ['cleanup_unconfirmed']);
});

await record('ACP launch verification passes only on confirmed session-status reachability plus confirmed cleanup', async () => {
  const launchLibMod = await importRuntimeModule(sourceRoot, '/tests/verification/runtime/session-launch-lib.mjs');

  const result = launchLibMod.assessLaunchVerification({
    observed: {
      visible: true,
      active: false,
      state: 'completed',
      degradedVisibility: false,
    },
    streamLogExists: true,
    cleanup: { confirmed: true },
    allowTerminalAfterLaunch: true,
    keepSession: false,
  });

  assert.equal(result.ok, true);
  assert.equal(result.launchConfirmed, true);
  assert.equal(result.launchEvidence, 'session_status');
  assert.equal(result.degradedVisibility, false);
  assert.equal(result.cleanupConfirmed, true);
  assert.deepEqual(result.nonPassReasons, []);
});
}
