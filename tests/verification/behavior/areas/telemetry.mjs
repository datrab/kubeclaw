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
async function buildBuiltInRegistry(runtimeRoot) {
  const registryMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/registry.js');
  const { registry, errors } = registryMod.buildPluginRegistry({}, { throwOnError: false });
  assert.equal(errors.length, 0);
  return registry;
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
    _logDir: path.join(swarmDir, 'logs'),
    _runLogDir: path.join(swarmDir, 'logs', 'pipeline', 'runs', 'run-current'),
    default_timeout_minutes: 5,
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
  assert.equal(payload.pipeline_log_path.endsWith('/.swarm/logs/pipeline/pipeline.jsonl'), true);
  assert.equal(payload.pipeline_run_log_path.endsWith('/.swarm/logs/pipeline/runs/run-current/pipeline.jsonl'), true);

  const entries = [
    ['1-0', ['type', 'completion', 'module', '01', 'status', 'PASS', 'source', 'agent', 'run_id', 'run-old', 'attempt', '1', 'dispatch_id', 'dispatch-old', 'session_key', 'agent:main:acp:old']],
    ['2-0', ['type', 'completion', 'module', '01', 'status', 'FAIL', 'source', 'buster-pipeline', 'run_id', 'run-current', 'attempt', '2', 'dispatch_id', 'dispatch-current', 'session_key', 'agent:main:acp:current']],
    ['3-0', ['type', 'completion', 'module', '01', 'status', 'PASS', 'source', 'agent', 'run_id', 'run-other', 'attempt', '7', 'dispatch_id', 'dispatch-other', 'session_key', 'agent:main:acp:other']],
    ['4-0', ['type', 'completion', 'module', '01', 'status', 'PASS', 'source', 'agent', 'run_id', 'run-current', 'attempt', '2', 'dispatch_id', 'dispatch-current', 'session_key', 'agent:main:acp:current']],
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

  const selected = pipelineRedisMod.selectLatestCompletion(entries, '01', {
    run_id: payload.run_id,
    attempt: payload.attempt,
    dispatch_id: payload.dispatch_id,
  });

  assert(selected);
  assert.equal(selected._id, '4-0');
  assert.equal(selected.run_id, 'run-current');
  assert.equal(selected.attempt, '2');
  assert.equal(selected.dispatch_id, 'dispatch-current');
});

await record('Buster telemetry mirrors successful events into canonical pipeline artifacts', async () => {
  const { runtimeRoot: sandboxTelemetryRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
  installFakeRedis(sandboxTelemetryRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const busterTelemetryMod = await importRuntimeModule(sandboxTelemetryRoot, '/app/skills/pipeline/services/telemetry.js');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-telemetry-mirror-'));
  const logRoot = path.join(repoRoot, '.swarm', 'logs');
  const pipelineLogPath = path.join(logRoot, 'pipeline', 'pipeline.jsonl');
  const pipelineRunLogPath = path.join(logRoot, 'pipeline', 'runs', 'run-buster-1', 'pipeline.jsonl');

  const tctx = busterTelemetryMod.createTelemetryContext({
    project: 'behavior-buster-telemetry',
    module: '07',
    runId: 'run-buster-1',
    enabled: true,
    logDir: path.join(logRoot, 'modules', '07'),
    pipelineLogPath,
    pipelineRunLogPath,
    attempt: 2,
    dispatchId: 'dispatch-buster-07',
    sessionKey: 'agent:main:acp:buster-07',
  });

  await busterTelemetryMod.emitEvent(tctx, 'buster.task_completed', {
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
  assert.equal(globalEvents[0].type, 'buster.task_completed');
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
  const nodeModulesDir = ensureDir(path.join(brokenTelemetryRoot, 'node_modules', 'ioredis'));
  fs.writeFileSync(path.join(nodeModulesDir, 'index.js'), `
module.exports = class BrokenRedis {
  constructor() {
    throw new Error('redis client unavailable');
  }
};
`);

  const busterTelemetryMod = await importRuntimeModule(brokenTelemetryRoot, '/app/skills/pipeline/services/telemetry.js');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-telemetry-fallback-'));
  const logDir = path.join(repoRoot, '.swarm', 'logs', 'modules', '07');

  const tctx = busterTelemetryMod.createTelemetryContext({
    project: 'behavior-buster-telemetry-fallback',
    module: '07',
    runId: 'run-buster-fallback-1',
    enabled: true,
    logDir,
    attempt: 1,
  });

  assert(tctx, 'buster telemetry context should fall back instead of returning null');
  assert.equal(tctx.redis, null);

  await busterTelemetryMod.emitEvent(tctx, 'buster.task_started', { module_id: '07' });
  await busterTelemetryMod.emitEvent(tctx, 'buster.task_completed', { module_id: '07', outcome: 'FAIL' });
  await flushAsync();

  const fallbackPath = path.join(logDir, 'telemetry-fallback.jsonl');
  assert.equal(fs.existsSync(fallbackPath), true);
  const fallbackEvents = fs.readFileSync(fallbackPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(fallbackEvents.length, 1);
  assert.equal(fallbackEvents[0].type, 'observability.degraded');
  assert.equal(fallbackEvents[0].reason, 'redis_emit_failed');
  assert.equal(fallbackEvents[0].detail, 'redis client unavailable');
  assert.equal(fallbackEvents[0].impacted_event_type, 'buster.task_started');
  assert.equal(fallbackEvents[0].run_id, 'run-buster-fallback-1');
  assert.equal(fallbackEvents[0].module_id, '07');
});

await record('pollDual emits explicit Redis completion-stream degraded/restored telemetry when Redis reads fail and recover', async () => {
  const pollingRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(pollingRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const pollingMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.js');
  const statusStoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/status-store.js');
  const runtimeCoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-polldual-redis-obsv-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const modulesDir = path.join(swarmDir, 'modules');
  fs.mkdirSync(path.join(modulesDir, '01'), { recursive: true });

  const runId = 'run-polldual-redis-obsv-1';
  const config = {
    project: 'behavior-polldual-redis-obsv',
    telemetry: { enabled: true },
    poll_interval_seconds: 0.01,
    poll_progress_log_interval_ms: 100000,
    _logDir: path.join(repoRoot, '.swarm', 'logs'),
    _runLogDir: path.join(repoRoot, '.swarm', 'logs', 'pipeline', 'runs', runId),
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-11T00:00:00.000Z'),
    paths: {
      swarm_dir: swarmDir,
      modules_dir: modulesDir,
    },
    agents: {
      buster: {
        dispatch: 'redis',
        redis_js_path: null,
      },
    },
  };

  statusStoreMod.saveStatus(config, '01', {
    module_id: '01',
    title: 'Module 01',
    status: 'TESTING',
    current_phase: 'buster',
    history: [],
  });

  const behaviorTempRoot = path.join(os.homedir(), '.openclaw', 'tmp');
  fs.mkdirSync(behaviorTempRoot, { recursive: true });
  const fakeRedisModuleDir = fs.mkdtempSync(path.join(behaviorTempRoot, 'behavior-polldual-redis-obsv-'));
  const fakeRedisModulePath = path.join(fakeRedisModuleDir, 'redis-read-flaky.mjs');
  const statusFilePath = path.join(modulesDir, '01', 'status.json');
  process.env.BEHAVIOR_POLLDUAL_STATUS_PATH = statusFilePath;
  fs.writeFileSync(fakeRedisModulePath, `
import fs from 'fs';
let readCalls = 0;
export default {
  async readCompletion() {
    readCalls += 1;
    if (readCalls === 1) {
      throw new Error('simulated redis completion failure');
    }
    fs.writeFileSync(process.env.BEHAVIOR_POLLDUAL_STATUS_PATH, JSON.stringify({
      module_id: '01',
      title: 'Module 01',
      status: 'PASS',
      current_phase: 'buster',
      history: [],
      updated_at: new Date().toISOString(),
    }, null, 2) + '\\n');
    return null;
  },
};
`);
  config.agents.buster.redis_js_path = fakeRedisModulePath;

  try {
    const result = await pollingMod.pollDual(config, '01', '01', ['PASS'], 1, {});
    await flushAsync();

    assert.equal(result.ok, true);
    assert.equal(result.reason, 'target_reached');
    assert.equal(result.status.status, 'PASS');
    assert.equal(result.status._source, 'git');

    const events = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    assert.deepEqual(events.map((event) => event.type), ['observability.degraded', 'observability.restored']);
    assert.equal(events[0].component, 'redis_completion');
    assert.equal(events[0].surface, 'completion_stream');
    assert.equal(events[0].reason, 'completion_read_failed');
    assert.equal(events[0].module_id, '01');
    assert.equal(events[0].agent_type, 'buster');
    assert.equal(events[0].stream_key, 'swarm:pipeline:behavior-polldual-redis-obsv:completions');
    assert.equal(events[0].detail, 'Redis completion read failed: simulated redis completion failure');
    assert.equal(events[1].component, 'redis_completion');
    assert.equal(events[1].surface, 'completion_stream');
    assert.equal(events[1].reason, 'completion_read_failed');
    assert.equal(events[1].module_id, '01');
    assert.equal(events[1].agent_type, 'buster');
    assert.equal(events[1].stream_key, 'swarm:pipeline:behavior-polldual-redis-obsv:completions');
    assert.equal(events[1].detail, 'redis completion stream readable again');
  } finally {
    delete process.env.BEHAVIOR_POLLDUAL_STATUS_PATH;
    fs.rmSync(fakeRedisModuleDir, { recursive: true, force: true });
  }
});

await record('buster gate polling emits explicit Redis completion-stream degraded/restored telemetry when Redis reads fail and recover', async () => {
  const gateRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(gateRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const gateRunnerMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/runners/buster-gate-runner.js');
  const runtimeCoreMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const registry = await buildBuiltInRegistry(gateRuntimeRoot);
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-gate-redis-obsv-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const outputFile = 'gates/buster-output.json';
  const outputPath = path.join(swarmDir, outputFile);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const runId = 'run-buster-gate-redis-obsv-1';
  const config = {
    project: 'behavior-buster-gate-redis-obsv',
    repo_root: repoRoot,
    telemetry: { enabled: true },
    _logDir: path.join(repoRoot, '.swarm', 'logs'),
    _runLogDir: path.join(repoRoot, '.swarm', 'logs', 'pipeline', 'runs', runId),
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-11T00:00:00.000Z'),
    _pluginRegistry: registry,
    default_timeout_minutes: 5,
    default_max_fails: 1,
    rate_limit: { max_pauses_per_module: 2, cooldown_hours: 0 },
    paths: {
      swarm_dir: swarmDir,
    },
    agents: {
      buster: {
        dispatch: 'redis',
        redis_js_path: null,
      },
    },
    _testOverrides: {
      busterGate: {
        discord: async () => {},
        readGateInstructions: () => 'buster gate instructions',
        resolvePolicy: () => ({ model: 'buster-model', model_source: 'test' }),
        logEffectivePolicy: () => {},
        validateBusterConfig: () => {},
        archiveModuleCompletions: async () => {},
        spawnAgent: async () => {},
        killAgent: async () => {},
        pollGeneric: async (_config, checkFn) => {
          const first = await checkFn();
          assert.equal(first.done, false);
          const second = await checkFn();
          assert.equal(second.done, true);
          return second.result;
        },
      },
    },
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

  const behaviorTempRoot = path.join(os.homedir(), '.openclaw', 'tmp');
  fs.mkdirSync(behaviorTempRoot, { recursive: true });
  const fakeRedisModuleDir = fs.mkdtempSync(path.join(behaviorTempRoot, 'behavior-buster-gate-redis-obsv-'));
  const fakeRedisModulePath = path.join(fakeRedisModuleDir, 'redis-read-flaky.mjs');
  process.env.BEHAVIOR_BUSTER_GATE_OUTPUT_PATH = outputPath;
  fs.writeFileSync(fakeRedisModulePath, `
import fs from 'fs';
import path from 'path';
let readCalls = 0;
export default {
  async readCompletion() {
    readCalls += 1;
    if (readCalls === 1) {
      throw new Error('simulated redis completion failure');
    }
    fs.mkdirSync(path.dirname(process.env.BEHAVIOR_BUSTER_GATE_OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(process.env.BEHAVIOR_BUSTER_GATE_OUTPUT_PATH, JSON.stringify({
      status: 'PASS',
      gate: 'gate:buster',
      summary: 'gate completed via file fallback',
    }, null, 2) + '\\n');
    return null;
  },
};
`);
  config.agents.buster.redis_js_path = fakeRedisModulePath;

  try {
    const result = await gateRunnerMod.runBusterGate(config, progress, 'gate:buster');
    await flushAsync();

    assert.equal(result.exit, 0);
    assert.equal(result.status, 'PASS');

    const events = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`)
      .filter((event) => event.type === 'observability.degraded' || event.type === 'observability.restored');
    assert.deepEqual(events.map((event) => event.type), ['observability.degraded', 'observability.restored']);
    assert.equal(events[0].component, 'redis_completion');
    assert.equal(events[0].surface, 'completion_stream');
    assert.equal(events[0].reason, 'completion_read_failed');
    assert.equal(events[0].gate_id, 'gate:buster');
    assert.equal(events[0].gate_type, 'buster');
    assert.equal(events[0].agent_type, 'buster');
    assert.equal(events[0].stream_key, 'swarm:pipeline:behavior-buster-gate-redis-obsv:completions');
    assert.equal(events[0].detail, 'Redis completion read failed: simulated redis completion failure');
    assert.equal(events[1].component, 'redis_completion');
    assert.equal(events[1].surface, 'completion_stream');
    assert.equal(events[1].reason, 'completion_read_failed');
    assert.equal(events[1].gate_id, 'gate:buster');
    assert.equal(events[1].gate_type, 'buster');
    assert.equal(events[1].agent_type, 'buster');
    assert.equal(events[1].stream_key, 'swarm:pipeline:behavior-buster-gate-redis-obsv:completions');
    assert.equal(events[1].detail, 'redis completion stream readable again');
  } finally {
    delete process.env.BEHAVIOR_BUSTER_GATE_OUTPUT_PATH;
    fs.rmSync(fakeRedisModuleDir, { recursive: true, force: true });
  }
});

await record('pollDual emits explicit Redis completion-stream degraded telemetry when Redis module import fails before polling starts', async () => {
  const pollingRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(pollingRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const pollingMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.js');
  const statusStoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/status-store.js');
  const runtimeCoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-polldual-redis-import-fail-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const modulesDir = path.join(swarmDir, 'modules');
  fs.mkdirSync(path.join(modulesDir, '01'), { recursive: true });

  const runId = 'run-polldual-redis-import-fail-1';
  const config = {
    project: 'behavior-polldual-redis-import-fail',
    telemetry: { enabled: true },
    poll_interval_seconds: 0.01,
    poll_progress_log_interval_ms: 100000,
    _logDir: path.join(repoRoot, '.swarm', 'logs'),
    _runLogDir: path.join(repoRoot, '.swarm', 'logs', 'pipeline', 'runs', runId),
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-11T00:00:00.000Z'),
    paths: {
      swarm_dir: swarmDir,
      modules_dir: modulesDir,
    },
    agents: {
      buster: {
        dispatch: 'redis',
        redis_js_path: '/tmp/behavior-invalid-redis-reader.mjs',
      },
    },
  };

  statusStoreMod.saveStatus(config, '01', {
    module_id: '01',
    title: 'Module 01',
    status: 'PASS',
    current_phase: 'buster',
    history: [],
  });

  const result = await pollingMod.pollDual(config, '01', '01', ['PASS'], 1, {});
  await flushAsync();

  assert.equal(result.ok, true);
  assert.equal(result.reason, 'target_reached');
  assert.equal(result.status.status, 'PASS');
  assert.equal(result.status._source, 'git');

  const events = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`)
    .filter((event) => event.type === 'observability.degraded' || event.type === 'observability.restored');
  assert.deepEqual(events.map((event) => event.type), ['observability.degraded']);
  assert.equal(events[0].component, 'redis_completion');
  assert.equal(events[0].surface, 'completion_stream');
  assert.equal(events[0].reason, 'completion_read_failed');
  assert.equal(events[0].module_id, '01');
  assert.equal(events[0].agent_type, 'buster');
  assert.equal(events[0].stream_key, 'swarm:pipeline:behavior-polldual-redis-import-fail:completions');
  assert.equal(events[0].detail.includes('Redis module import failed: redis.js (completion reader): path'), true);
  assert.equal(events[0].detail.includes('not in allowed prefixes [/app/, /opt/, /home/]. Update ALLOWED_PATH_PREFIXES in core/paths.js if this is intentional.'), true);
});

await record('buster gate polling emits explicit Redis completion-stream degraded telemetry when Redis module import fails before gate polling starts', async () => {
  const gateRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(gateRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const gateRunnerMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/runners/buster-gate-runner.js');
  const runtimeCoreMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const registry = await buildBuiltInRegistry(gateRuntimeRoot);
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-gate-redis-import-fail-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const outputFile = 'gates/buster-output.json';
  const outputPath = path.join(swarmDir, outputFile);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const runId = 'run-buster-gate-redis-import-fail-1';
  const config = {
    project: 'behavior-buster-gate-redis-import-fail',
    repo_root: repoRoot,
    telemetry: { enabled: true },
    _logDir: path.join(repoRoot, '.swarm', 'logs'),
    _runLogDir: path.join(repoRoot, '.swarm', 'logs', 'pipeline', 'runs', runId),
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-11T00:00:00.000Z'),
    _pluginRegistry: registry,
    default_timeout_minutes: 5,
    default_max_fails: 1,
    rate_limit: { max_pauses_per_module: 2, cooldown_hours: 0 },
    paths: {
      swarm_dir: swarmDir,
    },
    agents: {
      buster: {
        dispatch: 'redis',
        redis_js_path: '/tmp/behavior-invalid-gate-redis-reader.mjs',
      },
    },
    _testOverrides: {
      busterGate: {
        discord: async () => {},
        readGateInstructions: () => 'buster gate instructions',
        resolvePolicy: () => ({ model: 'buster-model', model_source: 'test' }),
        logEffectivePolicy: () => {},
        validateBusterConfig: () => {},
        archiveModuleCompletions: async () => {},
        spawnAgent: async () => {},
        killAgent: async () => {},
        pollGeneric: async (_config, checkFn) => {
          const first = await checkFn();
          assert.equal(first.done, false);
          fs.writeFileSync(outputPath, JSON.stringify({
            status: 'PASS',
            gate: 'gate:buster',
            summary: 'gate completed via file fallback',
          }, null, 2) + '\\n');
          const second = await checkFn();
          assert.equal(second.done, true);
          return second.result;
        },
      },
    },
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

  const result = await gateRunnerMod.runBusterGate(config, progress, 'gate:buster');
  await flushAsync();

  assert.equal(result.exit, 0);
  assert.equal(result.status, 'PASS');

  const events = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`)
    .filter((event) => event.type === 'observability.degraded' || event.type === 'observability.restored');
  assert.deepEqual(events.map((event) => event.type), ['observability.degraded']);
  assert.equal(events[0].component, 'redis_completion');
  assert.equal(events[0].surface, 'completion_stream');
  assert.equal(events[0].reason, 'completion_read_failed');
  assert.equal(events[0].gate_id, 'gate:buster');
  assert.equal(events[0].agent_type, 'buster');
  assert.equal(events[0].stream_key, 'swarm:pipeline:behavior-buster-gate-redis-import-fail:completions');
  assert.equal(events[0].detail.includes('Redis module import failed: redis.js (completion reader): path'), true);
  assert.equal(events[0].detail.includes('not in allowed prefixes [/app/, /opt/, /home/]. Update ALLOWED_PATH_PREFIXES in core/paths.js if this is intentional.'), true);
});

await record('completion tail scan stops near the newest matching identity and still prefers agent completions', async () => {
  const calls = [];
  const entries = [
    ['9-0', ['type', 'heartbeat', 'module', '01']],
    ['8-0', ['type', 'completion', 'module', '01', 'status', 'FAIL', 'source', 'buster-pipeline', 'run_id', 'run-current', 'attempt', '2', 'dispatch_id', 'dispatch-current']],
    ['7-0', ['type', 'completion', 'module', '99', 'status', 'PASS', 'source', 'agent', 'run_id', 'run-other', 'attempt', '1', 'dispatch_id', 'dispatch-other']],
    ['6-0', ['type', 'completion', 'module', '01', 'status', 'PASS', 'source', 'agent', 'run_id', 'run-current', 'attempt', '2', 'dispatch_id', 'dispatch-current']],
    ['5-0', ['type', 'completion', 'module', '01', 'status', 'PASS', 'source', 'agent', 'run_id', 'run-old', 'attempt', '1', 'dispatch_id', 'dispatch-old']],
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
  assert.equal(result.match._id, '6-0');
  assert.equal(result.match.source, 'agent');
  assert.equal(result.scanned, 4);
  assert.equal(result.batches, 2);
  assert.deepEqual(calls.map((call) => call.end), ['+', '(8-0']);
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

await record('buster gate rate-limit pauses emit canonical gate telemetry once', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  const { runtimeRoot: sandboxTelemetryRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
  installFakeRedis(telemetryRuntimeRoot);
  installFakeRedis(sandboxTelemetryRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const gateRunnerMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/runners/buster-gate-runner.js');
  const runtimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const busterRateLimitMod = await importRuntimeModule(sandboxTelemetryRoot, '/app/skills/pipeline/services/rate-limit.js');
  const busterTelemetryMod = await importRuntimeModule(sandboxTelemetryRoot, '/app/skills/pipeline/services/telemetry.js');
  const registry = await buildBuiltInRegistry(telemetryRuntimeRoot);

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-gate-rate-limit-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const logDir = path.join(swarmDir, 'logs', 'pipeline');
  fs.mkdirSync(swarmDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });

  const busterTelemetryCtx = busterTelemetryMod.createTelemetryContext({
    project: 'behavior-gate-rate-limit',
    module: 'gate:quality',
    runId: 'run-gate-1',
    enabled: true,
    logDir,
  });

  let runOnceCalls = 0;
  const config = {
    project: 'behavior-gate-rate-limit',
    repo_root: repoRoot,
    telemetry: { enabled: true },
    _runId: 'run-gate-1',
    run_id: 'run-gate-1',
    _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
    _pluginRegistry: registry,
    _logDir: logDir,
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
    _testOverrides: {
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
              taskType: 'gate_test',
              project: 'behavior-gate-rate-limit',
              attempt: 1,
              dispatchId: 'dispatch-gate-quality',
              provider: 'anthropic',
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
            status: {
              _source: 'redis',
              dispatch_id: 'dispatch-gate-quality',
              session_key: 'agent:main:acp:gate-quality',
            },
          };
        },
      },
    },
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

  const result = await gateRunnerMod.runBusterGate(config, progress, 'gate:quality');
  await flushAsync();

  assert.equal(result.status, 'PASS');
  assert.equal(runOnceCalls, 2);

  const streamKey = 'pipeline:telemetry:behavior-gate-rate-limit:run-gate-1';
  const gateEvents = xaddEvents(streamKey);
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

  const busterTelemetryMod = await importRuntimeModule(sandboxTelemetryRoot, '/app/skills/pipeline/services/telemetry.js');
  const runtimeCoreMod = await importRuntimeModule(generalTelemetryRoot, '/app/skills/pipeline/core/runtime.js');
  const novaTelemetryMod = await importRuntimeModule(generalTelemetryRoot, '/app/skills/pipeline/services/telemetry.js');

  const runId = 'run-shared-seq-1';
  const streamKey = 'pipeline:telemetry:behavior-shared-seq:run-shared-seq-1';
  const busterCtx = busterTelemetryMod.createTelemetryContext({
    project: 'behavior-shared-seq',
    module: '01',
    runId,
    enabled: true,
  });
  const config = {
    project: 'behavior-shared-seq',
    telemetry: { enabled: true },
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
  };

  await busterTelemetryMod.emitEvent(busterCtx, 'buster.task_started', { module_id: '01' });
  await novaTelemetryMod.emitEvent({ config }, 'module.started', {
    module_id: '01',
    model: 'anthropic/claude-sonnet-4-6',
    attempt: 1,
  });
  await busterTelemetryMod.emitEvent(busterCtx, 'buster.task_completed', { module_id: '01', outcome: 'PASS' });
  await flushAsync();
  await busterTelemetryMod.closeTelemetry(busterCtx);
  await novaTelemetryMod.closeTelemetryRedis();

  const events = xaddEvents(streamKey);
  assert.deepEqual(events.map((event) => event.type), ['buster.task_started', 'module.started', 'buster.task_completed']);
  assert.deepEqual(events.map((event) => event.source), ['buster', 'pipeline', 'buster']);
  assert.deepEqual(events.map((event) => event.seq), [1, 2, 3]);
});

await record('module polling treats Buster Pipeline-owned RATE_LIMITED completions as terminal ownership, not a second cooldown owner', async () => {
  const pollingMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/polling.js');

  assert.equal(pollingMod.isTerminalOwnedRateLimitedOutcome({ outcome: 'RATE_LIMITED', source: 'buster-pipeline' }), true);
  assert.equal(pollingMod.isTerminalOwnedRateLimitedOutcome({ outcome: 'RATE_LIMITED', source: 'agent' }), false);
  assert.equal(pollingMod.isTerminalOwnedRateLimitedOutcome({ outcome: 'FAIL', source: 'buster-pipeline' }), false);
});

await record('buster gate polling treats Buster Pipeline-owned RATE_LIMITED completions as terminal ownership, not a second cooldown owner', async () => {
  const { runtimeRoot: gateRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(gateRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const gateRunnerMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/runners/buster-gate-runner.js');
  const pollingMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/services/polling.js');
  const runtimeCoreMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const registry = await buildBuiltInRegistry(gateRuntimeRoot);

  let pollCalls = 0;
  let capturedResult = null;
  const discordCalls = [];
  const config = {
    project: 'behavior-buster-terminal-owned-rate-limit',
    repo_root: fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-terminal-owned-rate-limit-')),
    paths: { swarm_dir: '/tmp/behavior-buster-terminal-owned-rate-limit-swarm' },
    agents: { buster: {} },
    telemetry: { enabled: true },
    _runId: 'run-buster-terminal-owned-rate-limit-1',
    run_id: 'run-buster-terminal-owned-rate-limit-1',
    _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
    _pluginRegistry: registry,
    default_timeout_minutes: 5,
    default_max_fails: 1,
    rate_limit: { max_pauses_per_module: 2, cooldown_hours: 0 },
    _testOverrides: {
      busterGate: {
        discord: async (_config, _level, title, description, fields) => { discordCalls.push({ title, description, fields }); },
        readGateInstructions: () => 'buster gate instructions',
        resolvePolicy: () => ({ model: 'buster-model', model_source: 'test' }),
        logEffectivePolicy: () => {},
        validateBusterConfig: () => {},
        archiveModuleCompletions: async () => {},
        spawnAgent: async () => {},
        killAgent: async () => {},
        readCompletionFromRedis: async () => ({
          status: 'FAIL',
          outcome: 'RATE_LIMITED',
          source: 'buster-pipeline',
          reason: 'max_pauses_exceeded',
          summary: 'max_pauses_exceeded',
          run_id: 'run-buster-terminal-owned-rate-limit-1',
          attempt: 4,
          dispatch_id: 'dispatch-buster-rate-limit-1',
          session_key: 'agent:main:acp:gate-buster',
          max_rate_limit_pauses: 3,
        }),
        pollGeneric: async (_config, checkFn) => {
          pollCalls += 1;
          const check = await checkFn();
          assert.equal(check.done, true);
          capturedResult = check.result;
          return check.result;
        },
      },
    },
  };

  const progress = {
    modules: {},
    gates: {
      'gate:buster': { type: 'buster', title: 'Buster Gate', timeout_minutes: 5 },
    },
  };

  const result = await gateRunnerMod.runBusterGate(config, progress, 'gate:buster');
  await flushAsync();

  assert.equal(pollCalls, 1);
  assert.equal(result.exit, 40);
  assert.equal(result.reason, "Gate 'gate:buster' exceeded max rate limit pauses");
  assert.equal(result.attempt, 4);
  assert.equal(result.dispatch_id, 'dispatch-buster-rate-limit-1');
  assert.equal(result.gateway_label, 'dispatch-buster-rate-limit-1');
  assert.equal(result.session_key, 'agent:main:acp:gate-buster');
  assert.equal(capturedResult.rate_limit_exhausted, true);
  assert.equal(capturedResult.max_rate_limit_pauses, 3);
  assert.equal(capturedResult.rate_limit_status?.max_rate_limit_pauses, 3);
  assert.equal(capturedResult.status?.max_rate_limit_pauses, 3);
  assert.equal(capturedResult.dispatch_id, 'dispatch-buster-rate-limit-1');
  assert.equal(capturedResult.gateway_label, 'dispatch-buster-rate-limit-1');
  assert.equal(capturedResult.session_key, 'agent:main:acp:gate-buster');

  const exhaustedDiscord = discordCalls.find((call) => call.title === "Gate 'gate:buster' Rate Limit Exhausted");
  assert.equal(exhaustedDiscord.description, 'Gate attempt 4 exceeded max ACP rate limit pauses (3).');

  const streamKey = 'pipeline:telemetry:behavior-buster-terminal-owned-rate-limit:run-buster-terminal-owned-rate-limit-1';
  const events = xaddEvents(streamKey);
  assert.deepEqual(events.map((event) => event.type), ['gate.started', 'gate.verdict', 'retry.exhausted']);
  assert.equal(events[1].reason, "Gate 'gate:buster' exceeded max rate limit pauses");
  assert.equal(events[1].dispatch_id, 'dispatch-buster-rate-limit-1');
  assert.equal(events[1].session_key, 'agent:main:acp:gate-buster');
  assert.equal(events[2].gate_id, 'gate:buster');
  assert.equal(events[2].gate_type, 'buster');
  assert.equal(events[2].module_id, null);
  assert.equal(events[2].phase, 'buster_gate');
  assert.equal(result.gateway_label, events[1].dispatch_id);
  assert.equal(events[2].dispatch_id, events[1].dispatch_id);
  assert.equal(events[2].session_key, 'agent:main:acp:gate-buster');
  assert.equal(events[2].reason, "Gate 'gate:buster' exceeded max rate limit pauses");
  assert.equal(events[2].attempt, 4);
  assert.equal(events[2].max_attempts, 3);
  assert.equal(events[2].max_fails, 3);
  assert.equal(pollingMod.isTerminalOwnedRateLimitedOutcome({ outcome: 'RATE_LIMITED', source: 'buster-pipeline' }), true);
});

await record('shared telemetry loader uses canonical packaged ioredis resolution only', async () => {
  const telemetryHelperPath = path.join(sourceRoot, 'skills', 'common', 'pipeline', 'telemetry.js');
  const telemetryHelper = fs.readFileSync(telemetryHelperPath, 'utf8');

  assert.equal(telemetryHelper.includes("require('ioredis')"), true);
  assert.equal(telemetryHelper.includes('requireFirst('), false);
  assert.equal(telemetryHelper.includes('/app/node_modules/ioredis'), false);
  assert.equal(telemetryHelper.includes('/usr/local/lib/node_modules/ioredis'), false);
  assert.equal(telemetryHelper.includes('pipeline telemetry transport'), true);

  const { runtimeRoot: sandboxTelemetryRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
  installFakeRedis(sandboxTelemetryRoot);
  const busterTelemetryMod = await importRuntimeModule(sandboxTelemetryRoot, '/app/skills/pipeline/services/telemetry.js');
  const busterCtx = busterTelemetryMod.createTelemetryContext({
    project: 'behavior-telemetry-loader',
    module: '01',
    runId: 'run-telemetry-loader-1',
    enabled: true,
  });
  assert(busterCtx?.redis, 'buster telemetry should resolve packaged ioredis through the shared loader');
  await busterTelemetryMod.closeTelemetry(busterCtx);
});
}
