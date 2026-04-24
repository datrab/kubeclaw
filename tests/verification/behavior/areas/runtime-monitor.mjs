export async function registerRuntimeMonitorArea({
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
await record('monitor handles running, closed, unreachable-with-progress, and rate-limited states', async () => {
  const gateway = await startGatewayServer(async ({ body }) => {
    const sessionKey = body?.args?.sessionKey;
    if (sessionKey === 'running-session') return { result: { details: { acp: { state: 'running' } } } };
    if (sessionKey === 'closed-session') return { result: { details: { acp: { state: 'closed' } } } };
    return { result: { details: { acp: { state: 'unknown' } } } };
  });
  try {
    const running = await monitorMod.getAcpMonitorState('running-session', null, {}, { gatewayUrl: gateway.url });
    assert.equal(running.sessionState, 'running');
    assert.equal(running.sessionActive, true);
    assert.equal(running.terminal, false);
    assert.equal(running.gatewayUnreachable, false);

    const closed = await monitorMod.getAcpMonitorState('closed-session', null, {}, { gatewayUrl: gateway.url });
    assert.equal(closed.sessionState, 'closed');
    assert.equal(closed.terminal, true);
    assert.equal(closed.reason, 'session_terminal');
    assert.equal(closed.gatewayUnreachable, false);
  } finally {
    await gateway.close();
  }

  const transcriptPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-transcript-')), 'stream.jsonl');
  fs.writeFileSync(transcriptPath, `${JSON.stringify({ ts: new Date().toISOString(), kind: 'assistant', text: 'still working' })}\n`);
  const progressState = await monitorMod.getAcpMonitorState('missing-session', transcriptPath, {}, { gatewayUrl: 'http://127.0.0.1:1' });
  assert.equal(progressState.sessionState, 'running');
  assert.equal(progressState.sessionActive, true);
  assert.equal(progressState.terminal, false);
  assert.equal(progressState.gatewayUnreachable, true);
  assert.equal(typeof progressState.gatewayDetail, 'string');

  fs.writeFileSync(transcriptPath, `${JSON.stringify({ ts: new Date().toISOString(), kind: 'lifecycle', phase: 'error', data: { error: '429 rate limit, retry after 60 seconds' } })}\n`);
  const rateLimited = await monitorMod.getAcpMonitorState('missing-session', transcriptPath, {}, { gatewayUrl: 'http://127.0.0.1:1' });
  assert.equal(rateLimited.rateLimited, true);
  assert.equal(rateLimited.reason, 'rate_limited');
  assert.equal(rateLimited.gatewayUnreachable, true);
});

await record('Nova and Buster consume explicit gateway-unreachable monitor state', async () => {
  const pollingPath = path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'services', 'polling.js');
  const pollingText = fs.readFileSync(pollingPath, 'utf8');
  const telemetryPath = path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'services', 'telemetry.js');
  const telemetryText = fs.readFileSync(telemetryPath, 'utf8');
  const busterSessionMonitorPath = path.join(sourceRoot, 'skills', 'buster', 'buster-session-monitor.js');
  const busterSessionMonitorText = fs.readFileSync(busterSessionMonitorPath, 'utf8');
  const orchestrationPath = path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'agents', 'orchestration.js');
  const orchestrationText = fs.readFileSync(orchestrationPath, 'utf8');

  assert.equal(telemetryText.includes("data.gateway_unreachable === true || data.session_state === 'unreachable'"), true);
  assert.equal(telemetryText.includes('export function updateGatewayObservability(ctx, state, data = {}) {'), true);
  assert.equal(telemetryText.includes('export function updateTranscriptObservability(ctx, state, data = {}) {'), true);
  assert.equal(telemetryText.includes('export function updateRedisCompletionObservability(ctx, state, data = {}) {'), true);
  assert.equal(pollingText.includes('updateGatewayObservability(_ctx, observabilityState.gateway, observabilityData);'), true);
  assert.equal(pollingText.includes('gateway_unreachable: acpState.gatewayUnreachable === true'), true);
  assert.equal(pollingText.includes('gateway_detail: acpState.gatewayDetail || null'), true);

  assert.equal(busterSessionMonitorText.includes('gateway_unreachable: state.gatewayUnreachable === true'), true);
  assert.equal(busterSessionMonitorText.includes('if (state.gatewayUnreachable === true && !gatewayDegradedAt)'), true);
  assert.equal(busterSessionMonitorText.includes("state.gatewayDetail || state.detail || 'session status unreachable'"), true);

  assert.equal(orchestrationText.includes('gate_type: entry?.telemetry_gate_type ?? null,'), true);
  assert.equal(orchestrationText.includes('dispatch_id: entry?.telemetry_dispatch_id || null,'), true);
});

await record('buster rate-limit recovery keeps gateway outages explicit instead of silently killing the session', async () => {
  const { runtimeRoot: sandboxTelemetryRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
  installFakeRedis(sandboxTelemetryRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const busterRateLimitMod = await importRuntimeModule(sandboxTelemetryRoot, '/app/skills/pipeline/services/rate-limit.js');
  const busterPipelineMod = await importRuntimeModule(sandboxTelemetryRoot, '/app/skills/buster-pipeline.js');
  const busterTelemetryMod = await importRuntimeModule(sandboxTelemetryRoot, '/app/skills/pipeline/services/telemetry.js');

  const rateLimitLogDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-rate-limit-logs-')), 'module-01');
  const telemetryCtx = busterTelemetryMod.createTelemetryContext({
    project: 'behavior-buster-rate-limit-gateway',
    module: '01',
    runId: 'run-buster-rate-limit-gateway-1',
    enabled: true,
    logDir: rateLimitLogDir,
  });

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 503,
    statusText: 'Service Unavailable',
    text: async () => JSON.stringify({ error: 'gateway unavailable during cooldown liveness probe' }),
  });

  try {
    const rlState = busterRateLimitMod.createRateLimitState({ maxPauses: 2, initialCooldownS: 0, maxCooldownS: 0 });
    const recovery = await busterRateLimitMod.handleRateLimit(rlState, {
      childSessionKey: 'agent:main:acp:behavior-rate-limit-gateway',
      telemetryCtx,
      moduleId: '01',
      taskType: 'module_test',
      project: 'behavior-buster-rate-limit-gateway',
      attempt: 1,
      dispatchId: 'dispatch-rate-limit-gateway',
      provider: 'anthropic',
    });

    assert.equal(recovery.action, 'resume');
    assert.equal(recovery.gatewayUnreachable, true);
    assert.equal(typeof recovery.gatewayDetail, 'string');
    assert(recovery.gatewayDetail.includes('503'));

    const discordEntries = fs.readFileSync(path.join(rateLimitLogDir, 'discord.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line).payload.embeds?.[0] || null)
      .filter(Boolean);
    const pauseEntry = discordEntries.find((entry) => entry.title === '⏳ Rate Limited — Pause 1/2');
    assert(pauseEntry, 'missing canonical Buster pause Discord entry');
    assert.equal(pauseEntry.fields.some((field) => field.name === 'Run ID' && field.value === 'run-buster-rate-limit-gateway-1'), true);
    assert.equal(pauseEntry.fields.some((field) => field.name === 'Module' && field.value === '01'), true);
    assert.equal(pauseEntry.fields.some((field) => field.name === 'Phase' && field.value === 'buster'), true);
    assert.equal(pauseEntry.fields.some((field) => field.name === 'Dispatch' && field.value === 'dispatch-rate-limit-gateway'), true);
    assert.equal(pauseEntry.fields.some((field) => field.name === 'Label' && field.value === 'dispatch-rate-limit-gateway'), true);
    assert.equal(pauseEntry.fields.some((field) => field.name === 'Session' && field.value === 'agent:main:acp:behavior-rate-limit-gateway'), true);

    globalThis.__fakeRedisCalls = [];
    const stateQueue = [
      {
        sessionState: 'running',
        sessionActive: true,
        transcript: { eventCount: 0, newLines: [], lastActivityPoll: 0, rateLimited: true },
        unknownPolls: 0,
        transcriptStalePolls: 0,
        gatewayUnreachable: false,
        terminal: false,
        rateLimited: true,
        reason: 'rate_limited',
        detail: '429 Too Many Requests',
      },
      {
        sessionState: 'closed',
        sessionActive: false,
        transcript: { eventCount: 0, newLines: [], lastActivityPoll: 1, rateLimited: false },
        unknownPolls: 0,
        transcriptStalePolls: 1,
        gatewayUnreachable: false,
        gatewayDetail: null,
        terminal: true,
        rateLimited: false,
        reason: 'session_terminal',
        detail: 'closed',
      },
    ];

    const result = await busterPipelineMod.monitorSession(
      'agent:main:acp:behavior-rate-limit-gateway',
      null,
      {
        project: 'behavior-buster-rate-limit-gateway',
        module_id: '01',
        task_type: 'module_test',
        dispatch_id: 'dispatch-rate-limit-gateway',
        attempt: 1,
        rate_limit: { max_pauses: 2, initial_cooldown_s: 0, max_cooldown_s: 0 },
        acp_monitor: { poll_ms: 0, unknown_poll_limit: 1, stale_poll_limit: 1 },
      },
      telemetryCtx,
      {
        logger: { info() {}, warn() {} },
        testHooks: {
          sleep: async () => {},
          getAcpMonitorState: async () => stateQueue.shift(),
        },
      },
    );

    assert.equal(result.terminal, true);
    assert.equal(result.reason, 'session_terminal');

    const streamKey = 'pipeline:telemetry:behavior-buster-rate-limit-gateway:run-buster-rate-limit-gateway-1';
    const eventTypes = xaddEvents(streamKey).map((event) => event.type);
    assert.deepEqual(eventTypes, [
      'buster.session_monitor',
      'rate_limit.detected',
      'observability.degraded',
      'buster.session_monitor',
      'observability.restored',
    ]);
  } finally {
    global.fetch = originalFetch;
    await busterTelemetryMod.closeTelemetry(telemetryCtx);
  }

  const busterSessionMonitorText = readOverlayText(sourceRoot, overlayRoot, 'skills/buster/buster-session-monitor.js');
  const rateLimitText = readOverlayText(sourceRoot, overlayRoot, 'skills/buster/pipeline/services/rate-limit.js');
  assert.equal(rateLimitText.includes('Gateway unreachable after cooldown, preserving degraded visibility and resuming monitor'), true);
  assert.equal(rateLimitText.includes("action: 'resume'"), true);
  assert.equal(busterSessionMonitorText.includes('if (recovery.gatewayUnreachable === true && !gatewayDegradedAt)'), true);
  assert.equal(busterSessionMonitorText.includes("session status unreachable during rate-limit recovery"), true);
});
}
