import {
  buildBuiltInRegistry,
} from './helpers.mjs';

export async function registerTranscriptMonitorArea({
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
await record('pollForSessionEnd consumes budget strictly instead of extending for transcript activity', async () => {
  const pollingSource = readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/services/polling-session-end.ts');

  assert.equal(pollingSource.includes('createBudgetFromMinutes(timeoutMinutes'), true);
  assert.equal(pollingSource.includes('waitForAcpMonitorEvent(Math.min(interval, budget.remainingMs()))'), true);
  assert.equal(pollingSource.includes('deadline = Date.now() + _transcriptGraceMs'), false);
  assert.equal(pollingSource.includes('const _tsState = readAcpTranscriptState(_tsTracked?.streamLogPath, acpState.transcript || {});'), false);
});

await record('transcript monitor reads only appended transcript lines and preserves incremental state', async () => {
  const transcriptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-transcript-delta-'));
  const transcriptPath = path.join(transcriptDir, 'stream.jsonl');

  fs.writeFileSync(transcriptPath, `${JSON.stringify({ ts: '2026-04-09T21:00:00.000Z', kind: 'assistant', text: 'first' })}\n`);
  const first = monitorMod.readAcpTranscriptState(transcriptPath, {});
  assert.equal(first.newLines.length, 1);
  assert.equal(first.eventCount, 1);
  assert(first.byteOffset > 0);

  fs.appendFileSync(transcriptPath, `${JSON.stringify({ ts: '2026-04-09T21:00:01.000Z', kind: 'assistant', text: 'second' })}\n`);
  const second = monitorMod.readAcpTranscriptState(transcriptPath, first);
  assert.equal(second.newLines.length, 1);
  assert(second.byteOffset > first.byteOffset);
  assert.equal(second.eventCount, 2);
  assert.equal(second.newLines[0].includes('second'), true);

  const idle = monitorMod.readAcpTranscriptState(transcriptPath, second);
  assert.equal(idle.newLines.length, 0);
  assert.equal(idle.lastActivityPoll, 1);
});

await record('waitForSessionIdle honors the strict total timeout when gateway status is unreachable', async () => {
  const transcriptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-wait-for-idle-transcript-'));
  const transcriptPath = path.join(transcriptDir, 'stream.jsonl');
  fs.writeFileSync(transcriptPath, `${JSON.stringify({ ts: '2026-04-13T06:00:00.000Z', kind: 'assistant', text: 'wrapping up now' })}\n`);

  const started = Date.now();
  await monitorMod.waitForSessionIdle('agent:main:acp:wait-for-idle', {
    gatewayUrl: 'http://127.0.0.1:9',
    gatewayToken: '',
    streamLogPath: transcriptPath,
    extraGraceMs: 0,
    totalTimeoutMs: 10,
    pollMs: 5,
    unknown_poll_limit: 10,
    stale_poll_limit: 10,
    maxTranscriptExtensions: 1,
    transcriptGraceMs: 60,
    monitorPollMs: 5,
  });
  const elapsedMs = Date.now() - started;

  assert(elapsedMs < 100, `expected strict total timeout to bound return, got ${elapsedMs}ms`);
});

await record('verifyAgentAlive reuses transcript delta state, suppresses duplicate fallback warnings, and restores gateway observability', async () => {
  const orchestrationRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(orchestrationRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const orchestrationTestMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/agents/orchestration.ts');
  const lifecycleTestMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/agents/lifecycle.ts');
  const runtimeCoreMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');

  const sessionStates = ['unknown', 'unknown', 'running'];
  const gateway = await startGatewayServer(async ({ body }) => {
    if (body?.tool === 'session_status') {
      return { result: { details: { state: sessionStates.shift() || 'running' } } };
    }
    return { result: { details: { ok: true } } };
  });

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-verify-alive-transcript-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const runId = 'run-verify-agent-alive-1';
  const transcriptPath = path.join(repoRoot, 'stream.jsonl');
  fs.writeFileSync(transcriptPath, `${JSON.stringify({ ts: '2026-04-10T09:20:00.000Z', kind: 'assistant', text: 'first' })}\n`);

  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const prevConsoleError = console.error;
  const stderr = [];
  process.env.OPENCLAW_GATEWAY_URL = gateway.url;
  console.error = (...args) => { stderr.push(args.map(String).join(' ')); };

  const config = {
    project: 'behavior-verify-agent-alive',
    repo_root: repoRoot,
    telemetry: { enabled: true },
    agents: { forge: { cwd: repoRoot } },
    paths: { swarm_dir: swarmDir },
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
    pluginRegistry: await buildBuiltInRegistry(orchestrationRuntimeRoot),
  };

  try {
    lifecycleTestMod.trackAgent(config, 'forge-01', 'agent:main:acp:forge-01', 'claude', 'forge-01-123', transcriptPath, {
      model: 'claude-sonnet-4-6',
      runtime: 'acp',
      moduleId: '01',
      telemetry_module_id: '01',
    });

    const first = await orchestrationTestMod.verifyAgentAlive(config, 'forge', '01', 0);
    assert.equal(first, true);
    const firstState = lifecycleTestMod.getTrackedAgent('forge-01').transcriptState;
    assert.equal(firstState.eventCount, 1);
    assert.equal(firstState.newLines.length, 1);

    fs.appendFileSync(transcriptPath, `${JSON.stringify({ ts: '2026-04-10T09:20:01.000Z', kind: 'assistant', text: 'second' })}\n`);

    const second = await orchestrationTestMod.verifyAgentAlive(config, 'forge', '01', 0);
    assert.equal(second, true);
    const secondState = lifecycleTestMod.getTrackedAgent('forge-01').transcriptState;
    assert.equal(secondState.eventCount, 2);
    assert.equal(secondState.newLines.length, 1);
    assert.equal(secondState.newLines[0].includes('second'), true);

    const third = await orchestrationTestMod.verifyAgentAlive(config, 'forge', '01', 0);
    assert.equal(third, true);
    await flushAsync();

    const fallbackWarnings = stderr.filter((line) => line.includes('Agent health check using transcript fallback'));
    assert.equal(fallbackWarnings.length, 1);

    const streamEvents = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    const eventTypes = streamEvents.map((event) => event.type);
    assert.deepEqual(eventTypes, ['observability.degraded', 'observability.restored']);
    assert.equal(streamEvents[0].reason, 'gateway_status_unknown');
    assert.equal(streamEvents[0].module_id, '01');
    assert.equal(streamEvents[0].session_key, 'agent:main:acp:forge-01');
    assert.equal(streamEvents[1].reason, 'gateway_status_unknown');
  } finally {
    console.error = prevConsoleError;
    lifecycleTestMod.untrackAgent('forge-01');
    if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    await gateway.close();
  }
});

await record('verifyAgentAlive emits degraded observability before rejecting unknown session state with no transcript progress', async () => {
  const orchestrationRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(orchestrationRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const orchestrationTestMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/agents/orchestration.ts');
  const lifecycleTestMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/agents/lifecycle.ts');
  const runtimeCoreMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');

  const gateway = await startGatewayServer(async ({ body }) => {
    if (body?.tool === 'session_status') {
      return { result: { details: { state: 'unknown' } } };
    }
    return { result: { details: { ok: true } } };
  });

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-verify-alive-stale-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const runId = 'run-verify-agent-alive-stale-1';
  const transcriptPath = path.join(repoRoot, 'stream.jsonl');
  fs.writeFileSync(transcriptPath, '');

  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  process.env.OPENCLAW_GATEWAY_URL = gateway.url;

  const config = {
    project: 'behavior-verify-agent-alive-stale',
    repo_root: repoRoot,
    telemetry: { enabled: true },
    agents: { forge: { cwd: repoRoot } },
    paths: { swarm_dir: swarmDir },
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
    pluginRegistry: await buildBuiltInRegistry(orchestrationRuntimeRoot),
  };

  try {
    lifecycleTestMod.trackAgent(config, 'forge-01', 'agent:main:acp:forge-01', 'claude', 'forge-01-123', transcriptPath, {
      model: 'claude-sonnet-4-6',
      runtime: 'acp',
      moduleId: '01',
      telemetry_module_id: '01',
    });

    const alive = await orchestrationTestMod.verifyAgentAlive(config, 'forge', '01', 0);
    assert.equal(alive, false);
    await flushAsync();

    const streamEvents = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    assert.equal(streamEvents.length, 1);
    assert.equal(streamEvents[0].type, 'observability.degraded');
    assert.equal(streamEvents[0].reason, 'gateway_status_unknown');
    assert.equal(streamEvents[0].module_id, '01');
    assert.equal(streamEvents[0].session_key, 'agent:main:acp:forge-01');
  } finally {
    lifecycleTestMod.untrackAgent('forge-01');
    if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    await gateway.close();
  }
});
}
