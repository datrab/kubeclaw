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
await record('gateway token/env resolution works for OPENCLAW and GATEWAY names with correct precedence', async () => {
  const prev = {
    OPENCLAW_GATEWAY_URL: process.env.OPENCLAW_GATEWAY_URL,
    OPENCLAW_GATEWAY_TOKEN: process.env.OPENCLAW_GATEWAY_TOKEN,
    GATEWAY_URL: process.env.GATEWAY_URL,
    GATEWAY_TOKEN: process.env.GATEWAY_TOKEN,
  };
  try {
    process.env.OPENCLAW_GATEWAY_URL = 'http://gw.example/tools/invoke';
    process.env.OPENCLAW_GATEWAY_TOKEN = 'openclaw-token';
    process.env.GATEWAY_URL = 'http://legacy.example';
    process.env.GATEWAY_TOKEN = 'legacy-token';
    assert.equal(gatewayMod.resolveGatewayBaseUrl(), 'http://gw.example');
    assert.equal(gatewayMod.resolveGatewayInvokeUrl(), 'http://gw.example/tools/invoke');
    assert.equal(gatewayMod.resolveGatewayHealthUrl(), 'http://gw.example/health');
    assert.equal(gatewayMod.resolveGatewayToken(), 'openclaw-token');

    delete process.env.OPENCLAW_GATEWAY_URL;
    delete process.env.OPENCLAW_GATEWAY_TOKEN;
    assert.equal(gatewayMod.resolveGatewayBaseUrl(), 'http://legacy.example');
    assert.equal(gatewayMod.resolveGatewayInvokeUrl(), 'http://legacy.example/tools/invoke');
    assert.equal(gatewayMod.resolveGatewayHealthUrl(), 'http://legacy.example/health');
    assert.equal(gatewayMod.resolveGatewayToken(), 'legacy-token');
  } finally {
    Object.entries(prev).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});

await record('shared gateway helper keeps only resolver and gatewayInvoke ownership surfaces public', async () => {
  assert.equal(typeof gatewayMod.gatewayInvoke, 'function');
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
  const logRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-redis-logs-'));
  const config = {
    _logDir: logRoot,
    _runLogDir: path.join(logRoot, 'pipeline', 'runs', 'run-test'),
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

await record('structured observability events mirror to both operator-tail and run-scoped pipeline logs', async () => {
  const logRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-observability-'));
  const runId = 'run-obsv';
  const observabilityMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/observability.js');
  const runtimeCoreMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/runtime.js');
  const config = {
    project: 'behavior-demo',
    _logDir: logRoot,
    _runLogDir: path.join(logRoot, 'pipeline', 'runs', runId),
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
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

await record('successful telemetry emits mirror to both operator-tail and run-scoped pipeline logs', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(telemetryRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const telemetryMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/telemetry.js');
  const runtimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const registryMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/registry.js');
  const { registry, errors } = registryMod.buildPluginRegistry({}, { throwOnError: false });
  assert.equal(errors.length, 0);

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-telemetry-mirror-'));
  const logRoot = path.join(repoRoot, '.swarm', 'logs');
  const runId = 'run-telemetry-mirror-1';
  const config = {
    project: 'behavior-telemetry-mirror',
    telemetry: { enabled: true },
    _logDir: logRoot,
    _runLogDir: path.join(logRoot, 'pipeline', 'runs', runId),
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
    _pluginRegistry: registry,
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
  const registryMod = await importRuntimeModule(notificationRuntimeRoot, '/app/skills/pipeline/core/registry.js');

  const { registry } = registryMod.buildPluginRegistry({}, {});
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
  const registryMod = await importRuntimeModule(notificationRuntimeRoot, '/app/skills/pipeline/core/registry.js');
  const dispatchMod = await importRuntimeModule(notificationRuntimeRoot, '/app/skills/pipeline/services/notification-dispatch.js');
  const runtimeCoreMod = await importRuntimeModule(notificationRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

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
        configSchema: { type: 'object', additionalProperties: true },
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
        configSchema: { type: 'object', additionalProperties: true },
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
        configSchema: { type: 'object', additionalProperties: true },
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

  const { registry } = registryMod.buildPluginRegistry({}, { builtinModules: customModules });
  const config = {
    project: 'behavior-notification-dispatch',
    _runId: 'run-notification-dispatch-1',
    run_id: 'run-notification-dispatch-1',
    _runStats: runtimeCoreMod.createRunStats('2026-04-21T00:00:00.000Z'),
    _pluginRegistry: registry,
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

  const registryMod = await importRuntimeModule(notificationRuntimeRoot, '/app/skills/pipeline/core/registry.js');
  const dispatchMod = await importRuntimeModule(notificationRuntimeRoot, '/app/skills/pipeline/services/notification-dispatch.js');
  const runtimeCoreMod = await importRuntimeModule(notificationRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

  const { registry } = registryMod.buildPluginRegistry({}, {});
  const runId = 'run-notification-missing-listener-1';
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-notification-missing-listener-'));
  const logRoot = path.join(repoRoot, '.swarm', 'logs');
  const config = {
    project: 'behavior-notification-missing-listener',
    telemetry: { enabled: true },
    _logDir: logRoot,
    _runLogDir: path.join(logRoot, 'pipeline', 'runs', runId),
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-22T00:00:00.000Z'),
    _pluginRegistry: {
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

  const observabilityMod = await importRuntimeModule(observabilityRuntimeRoot, '/app/skills/pipeline/services/observability.js');
  const runtimeCoreMod = await importRuntimeModule(observabilityRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-structured-sink-'));
  const blockedLogRoot = path.join(repoRoot, 'blocked-logs');
  fs.writeFileSync(blockedLogRoot, 'not-a-directory');

  const runId = 'run-structured-sink-1';
  const config = {
    project: 'behavior-structured-sink',
    telemetry: { enabled: true },
    _logDir: blockedLogRoot,
    _runLogDir: path.join(blockedLogRoot, 'pipeline', 'runs', runId),
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-21T00:00:00.000Z'),
  };

  const firstOk = await observabilityMod.appendStructuredEventMirror(config, 'module.status_changed', {
    module_id: '01',
    new_status: 'FAIL',
  });
  assert.equal(firstOk, false);

  const degradedEvents = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
  assert.equal(degradedEvents.some((event) => event.type === 'observability.degraded' && event.surface === 'pipeline_jsonl' && event.reason === 'structured_event_append_failed'), true);

  const goodLogRoot = path.join(repoRoot, '.swarm', 'logs');
  config._logDir = goodLogRoot;
  config._runLogDir = path.join(goodLogRoot, 'pipeline', 'runs', runId);

  const secondOk = await observabilityMod.appendStructuredEventMirror(config, 'module.status_changed', {
    module_id: '01',
    new_status: 'PASS',
  });
  assert.equal(secondOk, true);

  const streamEvents = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
  assert.equal(streamEvents.some((event) => event.type === 'observability.restored' && event.surface === 'pipeline_jsonl' && event.reason === 'structured_event_append_failed'), true);

  const globalEvents = fs.readFileSync(path.join(goodLogRoot, 'pipeline', 'pipeline.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(globalEvents.at(-1).type, 'module.status_changed');
  assert.equal(globalEvents.at(-1).new_status, 'PASS');
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
