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
  busterSessionMonitorMod,
}) {
await record('monitor handles running, closed, unreachable-with-progress, and rate-limited states', async () => {
  const acpMonitorConfig = {
    unknown_poll_limit: 10,
    stale_poll_limit: 10,
    max_transcript_extensions: 3,
    transcript_grace_ms: 300000,
    monitor_poll_ms: 10000,
  };
  const gateway = await startGatewayServer(async ({ body }) => {
    const sessionKey = body?.args?.sessionKey;
    if (sessionKey === 'running-session') return { result: { details: { acp: { state: 'running' } } } };
    if (sessionKey === 'closed-session') return { result: { details: { acp: { state: 'closed' } } } };
    return { result: { details: { acp: { state: 'unknown' } } } };
  });
  try {
    const running = await monitorMod.getAcpMonitorState({ childSessionKey: 'running-session', streamLogPath: null, previousState: {}, ...acpMonitorConfig, gatewayUrl: gateway.url, gatewayToken: '' });
    assert.equal(running.sessionState, 'running');
    assert.equal(running.sessionActive, true);
    assert.equal(running.terminal, false);
    assert.equal(running.gatewayUnreachable, false);

    const closed = await monitorMod.getAcpMonitorState({ childSessionKey: 'closed-session', streamLogPath: null, previousState: {}, ...acpMonitorConfig, gatewayUrl: gateway.url, gatewayToken: '' });
    assert.equal(closed.sessionState, 'closed');
    assert.equal(closed.terminal, true);
    assert.equal(closed.reason, 'session_terminal');
    assert.equal(closed.gatewayUnreachable, false);
  } finally {
    await gateway.close();
  }

  const transcriptPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-transcript-')), 'stream.jsonl');
  fs.writeFileSync(transcriptPath, `${JSON.stringify({ ts: new Date().toISOString(), kind: 'assistant', text: 'still working' })}\n`);
  const progressState = await monitorMod.getAcpMonitorState({ childSessionKey: 'missing-session', streamLogPath: transcriptPath, previousState: {}, ...acpMonitorConfig, gatewayUrl: 'http://127.0.0.1:1', gatewayToken: '' });
  assert.equal(progressState.sessionState, 'running');
  assert.equal(progressState.sessionActive, true);
  assert.equal(progressState.terminal, false);
  assert.equal(progressState.gatewayUnreachable, true);
  assert.equal(typeof progressState.gatewayDetail, 'string');

  fs.writeFileSync(transcriptPath, `${JSON.stringify({ ts: new Date().toISOString(), kind: 'lifecycle', phase: 'error', data: { error: '429 rate limit, retry after 60 seconds' } })}\n`);
  const rateLimited = await monitorMod.getAcpMonitorState({ childSessionKey: 'missing-session', streamLogPath: transcriptPath, previousState: {}, ...acpMonitorConfig, gatewayUrl: 'http://127.0.0.1:1', gatewayToken: '' });
  assert.equal(rateLimited.rateLimited, true);
  assert.equal(rateLimited.reason, 'rate_limited');
  assert.equal(rateLimited.gatewayUnreachable, true);
});

await record('ACP monitor config is explicit platform config with no hidden defaults', async () => {
  const monitorSource = fs.readFileSync(path.join(sourceRoot, 'skills/common/pipeline/agents/acp-monitor.ts'), 'utf8');
  assert.equal(monitorSource.includes('?? 10'), false, 'ACP monitor must not keep hidden numeric poll defaults');
  assert.throws(
    () => monitorMod.getAcpMonitorConfig({}),
    /ACP monitor config invalid: unknown_poll_limit is required/
  );
  assert.throws(
    () => monitorMod.getAcpMonitorConfig({ acp_monitor: { unknown_poll_limit: 10 } }),
    /stale_poll_limit is required/
  );
  assert.deepEqual(monitorMod.getAcpMonitorConfig({
    acp_monitor: {
      unknown_poll_limit: '10',
      stale_poll_limit: 10,
      max_transcript_extensions: 3,
      transcript_grace_ms: 300000,
      monitor_poll_ms: 10000,
    },
  }), {
    unknownPollLimit: 10,
    stalePollLimit: 10,
    maxTranscriptExtensions: 3,
    transcriptGraceMs: 300000,
    monitorPollMs: 10000,
    unknown_poll_limit: 10,
    stale_poll_limit: 10,
    max_transcript_extensions: 3,
    transcript_grace_ms: 300000,
    monitor_poll_ms: 10000,
  });
});

await record('Nova and Buster consume explicit gateway-unreachable monitor state', async () => {
  const pollingText = [
    'polling.ts',
    'polling-observability.ts',
    'polling-session-end.ts',
  ].map((file) => fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'services', file), 'utf8')).join('\n');
	  const telemetryText = [
	    'telemetry.ts',
	    path.join('telemetry', 'builders.ts'),
	  ].map((file) => fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'services', file), 'utf8')).join('\n');
  const busterSessionMonitorPath = path.join(sourceRoot, 'skills', 'buster', 'pipeline', 'services', 'session-monitor.ts');
  const busterSessionMonitorText = fs.readFileSync(busterSessionMonitorPath, 'utf8');
  const orchestrationText = [
    'orchestration.ts',
    'orchestration-healthcheck.ts',
    'orchestration-lifecycle-events.ts',
  ].map((file) => fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'agents', file), 'utf8')).join('\n');

  assert.equal(telemetryText.includes("data.gateway_unreachable === true || data.session_state === 'unreachable'"), true);
  assert.equal(telemetryText.includes('export function updateGatewayObservability(ctx, state, data = {}) {'), true);
  assert.equal(telemetryText.includes('export function updateTranscriptObservability(ctx, state, data = {}) {'), true);
  assert.equal(telemetryText.includes('export function updateRedisCompletionObservability(ctx, state, data = {}) {'), true);
  assert.equal(pollingText.includes('updateGatewayObservability(ctx, observabilityState.gateway, observabilityData);'), true);
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

  const busterRateLimitMod = await importRuntimeModule(sandboxTelemetryRoot, '/app/skills/pipeline/services/rate-limit.ts');
  const busterTelemetryMod = await importRuntimeModule(sandboxTelemetryRoot, '/app/skills/pipeline/services/telemetry.ts');

  const rateLimitLogDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-rate-limit-logs-')), 'module-01');
  const telemetryCtx = busterTelemetryMod.createTelemetryContext({
    project: 'behavior-buster-rate-limit-gateway',
    module: '01',
    run_id: 'run-buster-rate-limit-gateway-1',
    enabled: true,
    log_dir: rateLimitLogDir,
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
      gatewayUrl: 'http://127.0.0.1:1',
      gatewayToken: '',
      taskType: 'module_test',
      project: 'behavior-buster-rate-limit-gateway',
      attempt: 1,
      dispatchId: 'dispatch-rate-limit-gateway',
      provider: 'anthropic',
      acpMonitorConfig: {
        unknown_poll_limit: 10,
        stale_poll_limit: 10,
        max_transcript_extensions: 3,
        transcript_grace_ms: 300000,
        monitor_poll_ms: 10000,
      },
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
    assert.equal(pauseEntry.fields.some((field) => field.name === 'Gateway Label' && field.value === 'dispatch-rate-limit-gateway'), true);
    assert.equal(pauseEntry.fields.some((field) => field.name === 'Session' && field.value === 'agent:main:acp:behavior-rate-limit-gateway'), true);

    globalThis.__fakeRedisCalls = [];
    const closedState = {
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
    };
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
      closedState,
      closedState,
    ];

    const result = await busterSessionMonitorMod.monitorSession(
      'agent:main:acp:behavior-rate-limit-gateway',
      null,
      {
        project: 'behavior-buster-rate-limit-gateway',
        module_id: '01',
        task_type: 'module_test',
        dispatch_id: 'dispatch-rate-limit-gateway',
        attempt: 1,
        rate_limit: { max_pauses: 2, initial_cooldown_s: 0, max_cooldown_s: 0 },
        acp_monitor: { unknown_poll_limit: 1, stale_poll_limit: 1, max_transcript_extensions: 3, transcript_grace_ms: 300000, monitor_poll_ms: 0 },
      },
      telemetryCtx,
      {
        gatewayUrl: 'http://127.0.0.1:1',
        gatewayToken: '',
        logger: { info() {}, warn() {} },
        testHooks: {
          sleep: async () => {},
          getAcpMonitorState: async () => stateQueue.shift() || closedState,
        },
      },
    );

    assert.notEqual(result.reason, 'rate_limited');

    assert.equal(recovery.action, 'resume');
    assert.equal(recovery.gatewayUnreachable, true);
  } finally {
    global.fetch = originalFetch;
    await busterTelemetryMod.closeTelemetry(telemetryCtx);
  }

  const busterSessionMonitorText = readOverlayText(sourceRoot, overlayRoot, 'skills/buster/pipeline/services/session-monitor.ts');
  const rateLimitText = readOverlayText(sourceRoot, overlayRoot, 'skills/buster/pipeline/services/rate-limit.ts');
  assert.equal(rateLimitText.includes('Gateway unreachable after cooldown, preserving degraded visibility and resuming monitor'), true);
  assert.equal(rateLimitText.includes("state: 'probe_error'"), true);
  assert.equal(rateLimitText.includes("if (liveness.state === 'closed')"), true);
  assert.equal(busterSessionMonitorText.includes('if (recovery.gatewayUnreachable === true && !gatewayDegradedAt)'), true);
  assert.equal(busterSessionMonitorText.includes("session status unreachable during rate-limit recovery"), true);
});
}
