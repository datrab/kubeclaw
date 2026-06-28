export async function registerBusterRuntimeNormalizationArea({
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
  busterPipelineHelpersMod,
  busterSessionMonitorMod,
  busterTaskValidationMod,
  busterRuntimeDiagnosticsMod,
  busterRecoveryMod,
}) {
function createBusterTelemetryCapture() {
  const events = [];
  let seq = 0;
  const redis = {
    async incr() { seq += 1; return seq; },
    multi() {
      const chain = {
        xadd(...args) {
          const dataIndex = args.indexOf('data');
          if (dataIndex !== -1 && args[dataIndex + 1]) events.push(JSON.parse(args[dataIndex + 1]));
          return chain;
        },
        expire() { return chain; },
        async exec() { return []; },
      };
      return chain;
    },
  };

  return {
    events,
    ctx: {
      redis,
      streamKey: 'pipeline:telemetry:demo-project:run-1',
      seqKey: 'pipeline:telemetry:demo-project:run-1:seq',
      project: 'demo-project',
      runId: 'run-1',
      moduleId: '01',
      emitter: 'test/buster-runtime-normalization',
      attempt: 2,
      dispatchId: 'dispatch-1',
      sessionKey: 'agent:main:acp:buster-session-1',
    },
  };
}

const silentLogger = Object.freeze({
  info() {},
  warn() {},
  error() {},
  step() {},
});

function fakeMonitorState(overrides = {}) {
  const transcript = {
    offset: 0,
    byteOffset: 0,
    eventCount: 0,
    lastEventTs: null,
    lastActivityPoll: 0,
    hardError: false,
    rateLimited: false,
    terminal: overrides.terminal === true,
    lastDetail: '',
    partialLine: '',
    newLines: [],
    ...(overrides.transcript || {}),
  };
  return {
    sessionKey: 'agent:main:acp:buster-session-1',
    sessionState: 'running',
    sessionActive: true,
    transcript,
    unknownPolls: 0,
    transcriptStalePolls: 0,
    gatewayUnreachable: false,
    gatewayDetail: null,
    terminal: false,
    rateLimited: false,
    reason: null,
    detail: '',
    lastDetail: '',
    lastSummary: '',
    failed: false,
    sessionTerminal: false,
    stopped: false,
    ...overrides,
    transcript,
  };
}

function installQueuedTaskRedis(runtimeRoot, { payload, failCompletion = false, failDeadLetter = false } = {}) {
  const queueRedisPackage = `
class FakeRedis {
  constructor() { this.status = 'ready'; }
  on() {}
  async call(command) {
    globalThis.__queueRedisCalls.push({ op: 'call', command });
    return ['0-0', []];
  }
  async xreadgroup(...args) {
    globalThis.__queueRedisCalls.push({ op: 'xreadgroup', args });
    if (globalThis.__queueRedisDelivered) return null;
    globalThis.__queueRedisDelivered = true;
    return [[globalThis.__queueRedisStream, [[globalThis.__queueRedisId, globalThis.__queueRedisFields]]]];
  }
  async xadd(...args) {
    globalThis.__queueRedisCalls.push({ op: 'xadd', args });
    if (globalThis.__queueRedisFailCompletion && args[0] === globalThis.__queueRedisPayload.completion_stream) throw new Error('completion stream unavailable');
    if (globalThis.__queueRedisFailDeadLetter && String(args[0]).endsWith(':dead-letter')) throw new Error('dead-letter stream unavailable');
    return '1-0';
  }
  async xack(...args) { globalThis.__queueRedisCalls.push({ op: 'xack', args }); return 1; }
  async xtrim(...args) { globalThis.__queueRedisCalls.push({ op: 'xtrim', args }); return 1; }
  async quit() { globalThis.__queueRedisCalls.push({ op: 'quit' }); }
}
module.exports = FakeRedis;
`;
  for (const nodeModulesRoot of [
    path.join(runtimeRoot, 'node_modules'),
    path.join(runtimeRoot, 'app', 'node_modules'),
    path.join(runtimeRoot, 'app', 'skills', 'node_modules'),
  ]) {
    const nodeModulesDir = ensureDir(path.join(nodeModulesRoot, 'ioredis'));
    fs.writeFileSync(path.join(nodeModulesDir, 'index.js'), queueRedisPackage);
    fs.writeFileSync(path.join(nodeModulesDir, 'package.json'), '{"name":"ioredis","main":"index.js"}');
  }
  globalThis.__queueRedisCalls = [];
  globalThis.__queueRedisDelivered = false;
  globalThis.__queueRedisStream = 'swarm:buster:tasks';
  globalThis.__queueRedisId = '1690000000000-0';
  globalThis.__queueRedisPayload = payload;
  const taskType = payload?.task_type || 'module_test';
  const isGate = taskType === 'gate_test';
  const targetId = isGate ? (payload?.gate_id || payload?.module_id || payload?.module) : (payload?.module_id || payload?.module || payload?.gate_id);
  globalThis.__queueRedisFields = [
    'schema_version', 'v1',
    'type', taskType,
    'stream_role', 'task',
    'project', payload?.project || 'demo-project',
    'run_id', payload?.run_id || 'run-queue-guarantee',
    'target_kind', isGate ? 'gate' : 'module',
    'target_id', targetId,
    'module', payload?.module_id || payload?.module || targetId,
    ...(payload?.gate_id ? ['gate_id', payload.gate_id] : []),
    ...(payload?.gate_type ? ['gate_type', payload.gate_type] : []),
    'attempt', String(payload?.attempt || 1),
    'dispatch_id', payload?.dispatch_id || 'dispatch-queue-guarantee',
    'source', 'nova',
    'sender', 'nova',
    'payload', JSON.stringify(globalThis.__queueRedisPayload),
    'iteration', '1',
    'timestamp', '2026-05-09T00:00:00.000Z',
  ];
  globalThis.__queueRedisFailCompletion = failCompletion;
  globalThis.__queueRedisFailDeadLetter = failDeadLetter;
}

function buildQueuePayload(extra = {}) {
  return {
    task_type: 'module_test',
    module_id: '01',
    project: 'demo-project',
    run_id: 'run-queue-guarantee',
    attempt: 1,
    dispatch_id: 'dispatch-queue-guarantee',
    completion_stream: 'pipeline:demo-project:completions',
    ...extra,
  };
}

async function withCanonicalBusterRuntimePolicy(queueRoot, run) {
  const previousSwarmConfig = process.env.SWARM_CONFIG;
  let runtimePolicyMod = null;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-runtime-policy-'));
  const swarmConfigPath = path.join(root, 'swarm.config.json');
  fs.writeFileSync(swarmConfigPath, JSON.stringify({
    buster: {
      runtime: {
        task_stream: 'swarm:buster:tasks',
        heartbeat_path: path.join(root, 'heartbeat.json'),
        heartbeat_interval_ms: 1000,
        task_poll_interval_ms: 2000,
        task_pending_reclaim_idle_ms: 60000,
        completion_event_block_ms: 0,
        completion_recovery_scan_interval_ms: 5000,
        task_stream_max_len: 250,
      },
    },
  }));
  try {
    process.env.SWARM_CONFIG = swarmConfigPath;
    runtimePolicyMod = await importRuntimeModule(queueRoot, '/app/skills/pipeline/services/runtime-policy.ts');
    runtimePolicyMod.resetBusterRuntimePolicyForTests();
    return await run();
  } finally {
    if (runtimePolicyMod) runtimePolicyMod.resetBusterRuntimePolicyForTests();
    if (previousSwarmConfig === undefined) delete process.env.SWARM_CONFIG;
    else process.env.SWARM_CONFIG = previousSwarmConfig;
  }
}

function buildValidBusterTaskPayload(extra = {}) {
  return {
    task_type: 'module_test',
    module_id: '01',
    stage_id: 'module:01', worker_type: 'module_buster',
    project: 'demo-project',
    run_id: 'run-buster-identity-1',
    attempt: 2,
    dispatch_id: 'dispatch-buster-identity-1',
    completion_stream: 'swarm:pipeline:demo-project:completions',
    commit_hash: 'abc123',
    timeout_seconds: 1800,
    session: { runtime: 'acp', model: 'gpt-test', agentId: 'buster', cwd: sourceRoot, label: 'buster-dispatch-1' },
    suites: ['build'],
    test_config: { suite_timeout_ms: 300000 },
    output_file: '.swarm/modules/01/buster-output.json',
    ...extra,
  };
}

await record('Buster runtime imports, token resolution, and telemetry guard stay normalized', async () => {
  const busterPipelineText = `${readOverlayText(sourceRoot, overlayRoot, 'skills/buster/buster-pipeline.ts')}\n${readOverlayText(sourceRoot, overlayRoot, 'skills/buster/pipeline/services/gateway-health.ts')}`;
  const busterPipelineHelpersText = readOverlayText(sourceRoot, overlayRoot, 'skills/buster/pipeline/services/pipeline-helpers.ts');
  const busterSessionMonitorText = readOverlayText(sourceRoot, overlayRoot, 'skills/buster/pipeline/services/session-monitor.ts');

  assert(busterPipelineText.includes("from './pipeline/agents/session-termination.ts'"));
  assert(busterPipelineText.includes("from './pipeline/integrations/gateway.ts'"));
  assert.equal(busterPipelineHelpersText.includes("from '../lifecycle-state.ts'"), false);
  assert(busterSessionMonitorText.includes("from '../agents/acp-monitor.ts'"));
  assert(busterSessionMonitorText.includes("from '../agents/session-termination.ts'"));
  assert(busterSessionMonitorText.includes("from '../integrations/gateway.ts'"));
  assert(busterPipelineText.includes('checkCommonGatewayHealth'));
  assert(busterPipelineText.includes('resolveGatewayInvokeUrl'));
  assert.equal(busterPipelineText.includes('process.exit(1)'), false);
  assert(busterPipelineText.includes('emitGatewayHealthDegraded('));
  assert(busterPipelineText.includes("shutdownGateway('GATEWAY_HEALTH_FAILED'"));
  assert(busterSessionMonitorText.includes('resolveGatewayBaseUrl'));
  assert(busterSessionMonitorText.includes('resolveGatewayToken'));
  assert.equal(busterSessionMonitorText.includes('`buster-${moduleId}`,\n        moduleId,'), false);
  assert.equal(busterSessionMonitorText.includes('publishTranscriptDelta'), false);
  assert(busterSessionMonitorText.includes('Transcript delta observed through diagnostic ACP monitor'));
  assert(!busterPipelineText.includes('process.env.GATEWAY_TOKEN'));
  assert(!busterSessionMonitorText.includes('process.env.GATEWAY_TOKEN'));
  assert(!busterPipelineText.includes("const GATEWAY_URL            = 'http://127.0.0.1:18789/tools/invoke'"));
  assert(!busterPipelineText.includes("const GATEWAY_HEALTH_URL     = 'http://127.0.0.1:18789/health'"));
  assert(!busterSessionMonitorText.includes("const GATEWAY_URL            = 'http://127.0.0.1:18789/tools/invoke'"));
  assert(!busterSessionMonitorText.includes("const GATEWAY_HEALTH_URL     = 'http://127.0.0.1:18789/health'"));

  execFileSync('node', [
    path.join(overlayRoot || sourceRoot, 'tests/verification/runtime/check-runtime-collisions.mjs'),
    '--source-root', sourceRoot,
    ...(overlayRoot ? ['--overlay-root', overlayRoot] : []),
  ], { stdio: 'pipe' });

  execFileSync('node', [
    path.join(overlayRoot || sourceRoot, 'tests/verification/contracts/check-telemetry-contract.mjs'),
    '--source-root', sourceRoot,
    ...(overlayRoot ? ['--overlay-root', overlayRoot] : []),
    '--contract', contractPath,
  ], { stdio: 'pipe' });
});

await record('Buster monitor publishes transcript deltas with canonical session identity', async () => {
  const { ctx, events } = createBusterTelemetryCapture();
  const monitorStates = [
    fakeMonitorState({
      sessionState: 'running',
      sessionActive: true,
      terminal: false,
      detail: 'session running with transcript delta',
      transcript: { eventCount: 0, newLines: [] },
    }),
    fakeMonitorState({
      sessionState: 'running',
      sessionActive: true,
      terminal: false,
      detail: 'session running with transcript delta',
      transcript: {
        eventCount: 1,
        newLines: [JSON.stringify({ kind: 'assistant', text: 'Buster transcript line' })],
      },
    }),
    fakeMonitorState({
      sessionState: 'closed',
      sessionActive: false,
      terminal: true,
      reason: 'session_terminal',
      detail: 'session closed after completion',
      stopped: true,
      sessionTerminal: true,
      transcript: { eventCount: 1, terminal: true, newLines: [] },
    }),
  ];
  const result = await busterSessionMonitorMod.monitorSession(
    'agent:main:acp:buster-session-1',
    '/tmp/buster-session-1.jsonl',
    {
      project: 'demo-project',
      module_id: '01',
      run_id: 'run-1',
      attempt: 2,
      dispatch_id: 'dispatch-1',
      session: { label: 'buster-dispatch-1' },
      rate_limit: { max_pauses: 5, initial_cooldown_s: 7200, max_cooldown_s: 7200 },
      acp_monitor: { poll_limit: 10, max_transcript_extensions: 3, transcript_grace_ms: 300000, monitor_poll_ms: 1 },
    },
    ctx,
    {
      moduleId: '01',
      spawnedAt: Date.now(),
      timeoutSeconds: 30,
      gatewayUrl: 'http://127.0.0.1:1',
      gatewayToken: '',
      logger: silentLogger,
      testHooks: {
        now: () => Date.now(),
        sleep: async () => {},
        getAcpMonitorState: async () => monitorStates.shift() || fakeMonitorState({
          sessionState: 'closed',
          sessionActive: false,
          terminal: true,
          reason: 'session_terminal',
          detail: 'session closed after completion',
          stopped: true,
          sessionTerminal: true,
          transcript: { eventCount: 1, terminal: true, newLines: [] },
        }),
      },
    },
  );

  await flushAsync();
  await flushAsync();

  assert.equal(result.terminal, true, JSON.stringify(result));
  const transcriptEvents = events.filter((event) => event.type === 'agent.transcript');
  assert.equal(transcriptEvents.length, 0);
});

await record('Buster monitor returns rate-limit pause budget for terminal completion emission', async () => {
  const result = await busterSessionMonitorMod.monitorSession(
    'agent:main:acp:buster-rate-limited',
    null,
    {
      project: 'demo-project',
      module_id: '01',
      run_id: 'run-1',
      attempt: 3,
      dispatch_id: 'dispatch-rate-limited',
      rate_limit: { max_pauses: 0, initial_cooldown_s: 0, max_cooldown_s: 0 },
      acp_monitor: { poll_limit: 10, max_transcript_extensions: 3, transcript_grace_ms: 300000, monitor_poll_ms: 1 },
    },
    null,
    {
      moduleId: '01',
      spawnedAt: Date.now(),
      timeoutSeconds: 30,
      gatewayUrl: 'http://127.0.0.1:1',
      gatewayToken: '',
      logger: silentLogger,
      testHooks: {
        now: () => Date.now(),
        sleep: async () => {},
        getAcpMonitorState: async () => fakeMonitorState({
          sessionKey: 'agent:main:acp:buster-rate-limited',
          sessionState: 'running',
          sessionActive: true,
          terminal: false,
          detail: 'anthropic rate limit',
          rateLimited: true,
          transcript: { rateLimited: true },
        }),
      },
    },
  );

  assert.equal(result.terminal, false);
  assert.equal(result.reason, 'rate_limited');
  assert.equal(result.max_rate_limit_pauses, 0);
  assert.equal(result.rate_limit_status.max_rate_limit_pauses, 0);
  assert.equal(result.rate_limit_status.pause_count, 0);
  assert.equal(busterPipelineHelpersMod.resolveBusterRateLimitMaxPauses({}, result), 0);
  assert.equal(busterPipelineHelpersMod.resolveBusterRateLimitMaxPauses({ rate_limit: { max_pauses: 4 } }, {}), 4);
  assert.throws(() => busterPipelineHelpersMod.resolveBusterRateLimitMaxPauses({}, {}), /requires explicit rate_limit\.max_pauses/);
});

await record('Buster-owned gate cooldowns emit canonical gate-scoped pause telemetry', async () => {
  const { runtimeRoot: busterRateLimitRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
  installFakeRedis(busterRateLimitRoot);
  const busterRateLimitMod = await importRuntimeModule(busterRateLimitRoot, '/app/skills/pipeline/services/rate-limit.ts');
  const { ctx, events } = createBusterTelemetryCapture();
  const rlState = busterRateLimitMod.createRateLimitState({ maxPauses: 2, initialCooldownS: 0, maxCooldownS: 0 });

  await busterRateLimitMod.handleRateLimit(rlState, {
    childSessionKey: 'agent:main:acp:gate-buster-session',
    telemetryCtx: ctx,
    moduleId: 'gate:buster',
    gateId: 'gate:buster',
    gateType: 'buster',
    taskType: 'gate_test',
    project: 'demo-project',
    attempt: 1,
    dispatchId: 'dispatch-gate-buster',
    gatewayLabel: 'buster-dispatch-gate-buster',
    provider: 'anthropic',
    detail: '429 Too Many Requests',
    acpMonitorConfig: {
      poll_limit: 10,
      max_transcript_extensions: 3,
      transcript_grace_ms: 300000,
      monitor_poll_ms: 10000,
    },
    ownsCanonicalSignal: true,
  });

  await flushAsync();
  await flushAsync();

  const rateLimitEvents = events.filter((event) => event.type === 'rate_limit.detected');
  assert.equal(rateLimitEvents.length, 1);
  assert.equal(rateLimitEvents[0].agent_type, 'buster');
  assert.equal(rateLimitEvents[0].module_id, null);
  assert.equal(rateLimitEvents[0].gate_id, 'gate:buster');
  assert.equal(rateLimitEvents[0].gate_type, 'buster');
  assert.equal(rateLimitEvents[0].dispatch_id, 'dispatch-gate-buster');
  assert.equal(rateLimitEvents[0].gateway_label, 'buster-dispatch-gate-buster');
  assert.equal(rateLimitEvents[0].session_key, 'agent:main:acp:gate-buster-session');
  assert.equal(rateLimitEvents[0].pause_count, 1);
  assert.equal(rateLimitEvents[0].max_pauses, 2);
});

await record('Buster gate cooldowns do not invent gate_type from gate_test task type', async () => {
  const { runtimeRoot: busterRateLimitRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
  installFakeRedis(busterRateLimitRoot);
  const busterRateLimitMod = await importRuntimeModule(busterRateLimitRoot, '/app/skills/pipeline/services/rate-limit.ts');
  const { ctx, events } = createBusterTelemetryCapture();
  const rlState = busterRateLimitMod.createRateLimitState({ maxPauses: 1, initialCooldownS: 0, maxCooldownS: 0 });

  await busterRateLimitMod.handleRateLimit(rlState, {
    childSessionKey: 'agent:main:acp:gate-missing-type-session',
    telemetryCtx: ctx,
    moduleId: 'gate:missing-type',
    gateId: 'gate:missing-type',
    taskType: 'gate_test',
    project: 'demo-project',
    attempt: 1,
    dispatchId: 'dispatch-gate-missing-type',
    gatewayLabel: 'buster-dispatch-gate-missing-type',
    provider: 'anthropic',
    detail: '429 Too Many Requests',
    acpMonitorConfig: {
      poll_limit: 10,
      max_transcript_extensions: 3,
      transcript_grace_ms: 300000,
      monitor_poll_ms: 10000,
    },
    ownsCanonicalSignal: true,
  });

  await flushAsync();
  await flushAsync();

  const rateLimitEvent = events.find((event) => event.type === 'rate_limit.detected');
  assert(rateLimitEvent, 'missing rate_limit.detected event');
  assert.equal(rateLimitEvent.gate_id, 'gate:missing-type');
  assert.equal(Object.prototype.hasOwnProperty.call(rateLimitEvent, 'gate_type'), false);

  const rateLimitSource = readOverlayText(sourceRoot, overlayRoot, 'skills/buster/pipeline/services/rate-limit.ts');
  assert.equal(rateLimitSource.includes("taskType === 'gate_test' ? 'buster'"), false);
  assert.equal(rateLimitSource.includes('const resolvedGateType = gateType || null;'), true);
});

await record('Buster task payload validation rejects missing canonical identity instead of inventing it', async () => {
  const valid = busterTaskValidationMod.validateBusterTaskPayload(buildValidBusterTaskPayload());
  assert.equal(valid.taskType, 'module_test');
  assert.equal(valid.moduleId, '01');
  assert.equal(valid.project, 'demo-project');
  assert.equal(valid.runId, 'run-buster-identity-1');
  assert.equal(valid.attempt, 2);
  assert.equal(valid.dispatchId, 'dispatch-buster-identity-1');
  assert.equal(valid.commitHash, 'abc123');
  assert.equal(valid.timeoutSeconds, 1800);
  assert.deepEqual(valid.suites, ['build']);
  assert.equal(valid.suiteTimeoutMs, 300000);

  assert.throws(() => busterTaskValidationMod.validateBusterTaskPayload({
    task_type: 'module_test',
    module_id: '01',
    session: { label: 'session-label-is-not-dispatch-authority' },
  }), (error) => {
    assert.equal(error.code, 'BUSTER_TASK_MALFORMED');
    assert.equal(error.missing_fields.includes('project'), true);
    assert.equal(error.missing_fields.includes('run_id'), true);
    assert.equal(error.missing_fields.includes('attempt'), true);
    assert.equal(error.missing_fields.includes('dispatch_id'), true);
    assert.equal(error.missing_fields.includes('completion_stream'), true);
    assert.equal(error.missing_fields.includes('commit_hash'), true);
    assert.equal(error.missing_fields.includes('output_file'), true);
    return true;
  });

  assert.throws(() => busterTaskValidationMod.validateBusterTaskPayload({
    ...buildValidBusterTaskPayload(),
    task_type: 'gate_test',
    module_id: 'gate:missing-explicit-gate-id',
    run_id: 'run-gate-missing-id',
    attempt: 1,
    dispatch_id: 'dispatch-gate-missing-id',
    output_file: '.swarm/gates/gate-output.json',
  }), (error) => {
    assert.equal(error.code, 'BUSTER_TASK_MALFORMED');
    assert.equal(error.missing_fields.includes('gate_id'), true);
    return true;
  });

  assert.throws(() => busterTaskValidationMod.validateBusterTaskPayload({
    ...buildValidBusterTaskPayload(),
    output_file: '../escape.json',
  }), (error) => {
    assert.equal(error.code, 'BUSTER_TASK_MALFORMED');
    assert.equal(error.details.reason, 'unsafe_path_field');
    assert.equal(error.unsafe_fields.some(entry => entry.field === 'output_file'), true);
    return true;
  });

  assert.throws(() => busterTaskValidationMod.validateBusterTaskPayload({
    ...buildValidBusterTaskPayload(),
    task_type: 'gate_test',
    module_id: 'gate:quality',
    gate_id: 'gate:quality',
    run_id: 'run-gate-path',
    attempt: 1,
    dispatch_id: 'dispatch-gate-path',
    output_file: '.swarm/gates/gate-output.json',
    instructions_file: '/tmp/instructions.md',
  }), (error) => {
    assert.equal(error.code, 'BUSTER_TASK_MALFORMED');
    assert.equal(error.details.reason, 'unsafe_path_field');
    assert.equal(error.unsafe_fields.some(entry => entry.field === 'instructions_file'), true);
    return true;
  });

  const busterSource = `${readOverlayText(sourceRoot, overlayRoot, 'skills/buster/buster-pipeline.ts')}\n${readOverlayText(sourceRoot, overlayRoot, 'skills/buster/pipeline/services/task-lifecycle.ts')}`;
  assert.equal(busterSource.includes("payload?.module_id  || 'unknown'"), false);
  assert.equal(busterSource.includes('const project    = payload?.project'), false);
  assert.equal(busterSource.includes('const project    = identity.project;'), true);
  assert.equal(busterSource.includes('`buster-${moduleId}-${Date.now()}`'), false);
  assert.equal(busterSource.includes('payload?.attempt    ?? 1'), false);
  assert.equal(busterSource.includes('payload?.dispatch_id || payload?.session?.label'), false);
});

await record('Buster process health diagnostics are not fake run-scoped telemetry', async () => {
  const record = busterRuntimeDiagnosticsMod.buildBusterProcessDiagnosticRecord({
    reason: 'gateway_ready_timeout',
    detail: 'Gateway was not ready within 30s',
    projectHint: 'demo-project',
    ts: '2026-04-28T10:25:00.000Z',
  });

  assert.equal(record.type, 'observability.degraded');
  assert.equal(record.diagnostic_only, true);
  assert.equal(record.scope, 'process');
  assert.equal(record.component, 'buster_gateway_health');
  assert.equal(record.project_hint, 'demo-project');
  assert.equal(Object.prototype.hasOwnProperty.call(record, 'project'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(record, 'run_id'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(record, 'seq'), false);

  const busterSource = `${readOverlayText(sourceRoot, overlayRoot, 'skills/buster/buster-pipeline.ts')}\n${readOverlayText(sourceRoot, overlayRoot, 'skills/buster/pipeline/services/runtime-diagnostics.ts')}`;
  const monitorSource = readOverlayText(sourceRoot, overlayRoot, 'skills/buster/pipeline/services/session-monitor.ts');
  assert.equal(busterSource.includes('runId: `buster-gateway-health-${Date.now()}`'), false);
  assert.equal(busterSource.includes("join(logDir, 'process-health.jsonl')"), true);
  assert.equal(monitorSource.includes('project: payload?.project || process.env.BUSTER_PROJECT'), false);
  assert.equal(monitorSource.includes('dispatchId: payload?.dispatch_id || payload?.session?.label'), false);
});

await record('Buster critical runtime catches report typed process diagnostics', async () => {
  const record = busterRuntimeDiagnosticsMod.buildBusterProcessDiagnosticRecord({
    component: 'buster_cleanup',
    surface: 'shutdown',
    reason: 'shutdown_cleanup_failed',
    detail: new Error('cleanup failed during shutdown'),
    ts: '2026-04-29T10:20:00.000Z',
  });

  assert.equal(record.type, 'observability.degraded');
  assert.equal(record.diagnostic_only, true);
  assert.equal(record.scope, 'process');
  assert.equal(record.component, 'buster_cleanup');
  assert.equal(record.surface, 'shutdown');
  assert.equal(record.reason, 'shutdown_cleanup_failed');
  assert.equal(record.detail, 'cleanup failed during shutdown');
  assert.equal(Object.prototype.hasOwnProperty.call(record, 'run_id'), false);

  const busterSource = `${readOverlayText(sourceRoot, overlayRoot, 'skills/buster/buster-pipeline.ts')}\n${readOverlayText(sourceRoot, overlayRoot, 'skills/buster/pipeline/services/task-queue.ts')}`;
  const emptyCatchBlock = 'catch' + ' {' + '}';
  const emptyPromiseCatch = 'catch(() => {' + '})';
  assert.equal(busterSource.includes(`await doSandboxCleanup('error', payload).${emptyPromiseCatch}`), false);
  assert.equal(busterSource.includes(`try { await redisClient.xack(STREAM_KEY, GROUP_NAME, id); } ${emptyCatchBlock}`), false);
  assert.equal(busterSource.includes(`await killActiveSession().${emptyPromiseCatch}`), false);
  assert.equal(busterSource.includes(`await doSandboxCleanup(cleanupStage, {}).${emptyPromiseCatch}`), false);
  assert.equal(busterSource.includes(`try { redis?.disconnect(); } ${emptyCatchBlock}`), false);
  assert.equal(busterSource.includes("reason: 'task_error_cleanup_failed'"), true);
  assert.equal(busterSource.includes("'task_failure_ack_failed'"), true);
  assert.equal(busterSource.includes("'task_failure_terminal_guarantee_failed'"), true);
  assert.equal(busterSource.includes("reason: 'shutdown_kill_active_session_failed'"), true);
  assert.equal(busterSource.includes("reason: 'shutdown_cleanup_failed'"), true);
  assert.equal(busterSource.includes("reason: 'shutdown_redis_disconnect_failed'"), true);
});

await record('Buster task queue emits terminal completion before ACK when processTask throws', async () => {
  const { runtimeRoot: queueRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
  installQueuedTaskRedis(queueRoot, { payload: buildQueuePayload() });

  await withCanonicalBusterRuntimePolicy(queueRoot, async () => {
    const taskQueueMod = await importRuntimeModule(queueRoot, '/app/skills/pipeline/services/task-queue.ts');
    await taskQueueMod.processOneQueuedTask(async () => {
      throw new Error('finally failed before terminal completion');
    });
  });

  const calls = globalThis.__queueRedisCalls || [];
  const completionIndex = calls.findIndex((entry) => entry.op === 'xadd' && entry.args[0] === 'pipeline:demo-project:completions');
  const ackIndex = calls.findIndex((entry) => entry.op === 'xack');
  const deadLetterIndex = calls.findIndex((entry) => entry.op === 'xadd' && String(entry.args[0]).endsWith(':dead-letter'));
  assert(completionIndex !== -1, 'synthesized failure completion must be emitted');
  assert(ackIndex !== -1, 'task must be ACKed after terminal completion');
  assert(completionIndex < ackIndex, 'terminal completion must happen before ACK');
  assert.equal(deadLetterIndex, -1, 'dead-letter should not be needed when synthesized failure completion succeeds');
});

await record('Buster task queue writes dead-letter before synthesized failure completion ACK when completion fails', async () => {
  const { runtimeRoot: queueRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
  installQueuedTaskRedis(queueRoot, { payload: buildQueuePayload(), failCompletion: true });

  await withCanonicalBusterRuntimePolicy(queueRoot, async () => {
    const taskQueueMod = await importRuntimeModule(queueRoot, '/app/skills/pipeline/services/task-queue.ts');
    await taskQueueMod.processOneQueuedTask(async () => {
      throw new Error('finally failed before terminal completion');
    });
  });

  const calls = globalThis.__queueRedisCalls || [];
  const deadLetterIndex = calls.findIndex((entry) => entry.op === 'xadd' && String(entry.args[0]).endsWith(':dead-letter'));
  const ackIndex = calls.findIndex((entry) => entry.op === 'xack');
  assert(deadLetterIndex !== -1, 'dead-letter must be written when completion fallback fails');
  assert(ackIndex !== -1, 'task must be ACKed after dead-letter');
  assert(deadLetterIndex < ackIndex, 'dead-letter must happen before ACK');
});

await record('Buster task queue refuses ACK when completion and dead-letter both fail', async () => {
  const { runtimeRoot: queueRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
  installQueuedTaskRedis(queueRoot, { payload: buildQueuePayload(), failCompletion: true, failDeadLetter: true });

  await assert.rejects(
    () => withCanonicalBusterRuntimePolicy(queueRoot, async () => {
      const taskQueueMod = await importRuntimeModule(queueRoot, '/app/skills/pipeline/services/task-queue.ts');
      await taskQueueMod.processOneQueuedTask(async () => {
        throw new Error('finally failed before terminal completion');
      });
    }),
    /BUSTER_TASK_TERMINAL_GUARANTEE_FAILED/,
  );

  const calls = globalThis.__queueRedisCalls || [];
  assert.equal(calls.some((entry) => entry.op === 'xack'), false, 'ACK must not happen without completion or dead-letter');
});

await record('Buster lower-risk cleanup catches are explicit instead of empty suppressions', async () => {
  const emptyCatchBlock = 'catch' + ' {' + '}';
  const checkedFiles = [
    'skills/buster/pipeline/runners/suite-runner.ts',
    'skills/buster/pipeline/services/logger.ts',
    'skills/buster/pipeline/services/task-completion.ts',
    'skills/buster/pipeline/suites/build.ts',
    'skills/buster/pipeline/suites/bundle.ts',
    'skills/buster/pipeline/suites/k8s.ts',
    'skills/buster/pipeline/suites/api.ts',
    'skills/buster/pipeline/suites/health.ts',
    'skills/buster/pipeline/suites/a11y.ts',
    'skills/buster/pipeline/tools/screenshot.ts',
    'skills/common/pipeline/agents/lifecycle.ts',
  ];

  for (const file of checkedFiles) {
    const source = readOverlayText(sourceRoot, overlayRoot, file);
    assert.equal(source.includes(emptyCatchBlock), false, `${file} should not contain empty catch blocks`);
    assert.equal(source.includes('catch (() => {' + '})'), false, `${file} should not contain empty promise catch handlers`);
  }

  const suiteRunnerSource = readOverlayText(sourceRoot, overlayRoot, 'skills/buster/pipeline/runners/suite-runner.ts');
  const redisLifecycleSource = readOverlayText(sourceRoot, overlayRoot, 'skills/common/pipeline/agents/lifecycle.ts');
  assert.equal(suiteRunnerSource.includes('swarm_results_write_failed'), true);
  assert.equal(suiteRunnerSource.includes('sandbox_results_write_failed'), true);
  assert.equal(suiteRunnerSource.includes('suite_jsonl_append_failed'), true);
  assert.equal(redisLifecycleSource.includes('[session-lifecycle] active-session cleanup failed'), true);
});

await record('Buster startup recovery treats persisted active-session files as diagnostic-only fenced evidence', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-startup-recovery-'));
  const evidencePath = path.join(root, 'active-session.json');
  const malformedPath = path.join(root, 'malformed-active-session.json');

  fs.writeFileSync(evidencePath, JSON.stringify({
    childSessionKey: 'agent:main:subagent:buster-evidence',
    label: 'buster-evidence-label',
    gatewayLabel: 'buster-evidence-gateway',
    runtime: 'subagent',
    agentId: 'buster',
    model: 'test-model',
    runId: null,
    streamLogPath: null,
    cwd: root,
    activeStatePath: evidencePath,
  }, null, 2));

  const fenced = await busterRecoveryMod.recoverOrphanedActiveSession({
    activeStatePath: evidencePath,
  });
  assert.equal(fenced.found, true);
  assert.equal(fenced.ok, true);
  assert.equal(fenced.recovered, false);
  assert.equal(fenced.cleaned, false);
  assert.equal(fenced.reason, 'active_session_file_diagnostic_only');
  assert.equal(fenced.authority.active_session_authority_source, null);
  assert.equal(fenced.authority.allow_active_session_file_authority, false);
  assert.equal(fenced.authority.allow_evidence_hydration, false);
  assert.equal(fenced.authority.fenced, true);
  assert.equal(fenced.diagnostics.some((entry) => entry.reason === 'active_session_file_diagnostic_only'), true);
  assert.equal(fs.existsSync(evidencePath), true, 'diagnostic active-session evidence must be read-only and preserved');

  fs.writeFileSync(malformedPath, '{not-json');
  const malformed = await busterRecoveryMod.recoverOrphanedActiveSession({ activeStatePath: malformedPath });
  assert.equal(malformed.found, false);
  assert.equal(malformed.ok, true);
  assert.equal(malformed.invalid, true);
  assert.equal(malformed.recovered, false);
  assert.equal(malformed.cleaned, false);
  assert.equal(malformed.reason, 'malformed_active_session_file');
  assert.equal(malformed.authority.allow_evidence_hydration, false);
  assert.equal(fs.existsSync(malformedPath), true, 'malformed active-session evidence must not be deleted by recovery');

  const busterSource = `${readOverlayText(sourceRoot, overlayRoot, 'skills/buster/buster-pipeline.ts')}
${readOverlayText(sourceRoot, overlayRoot, 'skills/buster/pipeline/services/orphan-recovery.ts')}`;
  assert.equal(busterSource.includes('recoverActiveSession'), false);
  assert.equal(busterSource.includes('active_session_file_diagnostic_only'), true);
  assert.equal(busterSource.includes('allow_evidence_hydration: false'), true);
  assert.equal(busterSource.includes('killResult'), false);
});

await record('Buster Redis direct complete path is removed and cannot emit completion signals', async () => {
  const { runtimeRoot: busterRedisRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
  installFakeRedis(busterRedisRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const redisMod = await importRuntimeModule(busterRedisRoot, '/app/skills/pipeline/tools/redis.ts');
  const redisLib = redisMod.default;

  try {
    assert.equal(typeof redisLib.complete, 'undefined', 'removed complete action must not remain on the Redis tool surface');
  } finally {
    await redisLib.disconnect();
  }

  assert.equal((globalThis.__fakeRedisCalls || []).filter((entry) => entry.op === 'xadd').length, 0, 'removed complete action must not XADD a completion');
});
}
