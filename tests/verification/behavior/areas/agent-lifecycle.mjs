export async function registerAgentLifecycleArea({
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
await record('agent.spawned is emitted for session-backed Forge spawns with correlation fields', async () => {
  const orchestrationRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(orchestrationRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const orchestrationTestMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/agents/orchestration.js');
  const lifecycleTestMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/common/pipeline/agents/lifecycle.js');
  const runtimeCoreMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

  const requests = [];
  const gateway = await startGatewayServer(async ({ body }) => {
    requests.push(body);
    if (body?.tool === 'sessions_spawn') {
      return { result: { details: { status: 'accepted', childSessionKey: 'agent:main:acp:forge-spawn-1', runId: 'forge-spawn-run-1' } } };
    }
    return { result: { details: { ok: true } } };
  });

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-agent-spawn-'));
  const logRoot = path.join(repoRoot, '.swarm', 'logs');
  const runId = 'run-agent-spawn-correlation-1';
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  process.env.OPENCLAW_GATEWAY_URL = gateway.url;

  const config = {
    project: 'behavior-agent-spawn-correlation',
    repo_root: repoRoot,
    telemetry: { enabled: true },
    agents: { forge: { cwd: repoRoot, timeout_seconds: 2700 } },
    _logDir: logRoot,
    _runLogDir: path.join(logRoot, 'pipeline', 'runs', runId),
    _runId: runId,
    run_id: runId,
    _disable_discord_webhooks: true,
    discord_webhook_url: 'https://example.invalid/webhook',
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
  };

  try {
    const spawnResult = await orchestrationTestMod.spawnAcpAgent(config, 'forge', '01', 'claude-sonnet-4-6', 'Implement the module', {
      module_id: '01',
      attempt: 2,
      thinking: 'high',
    });
    assert.equal(spawnResult.childSessionKey, 'agent:main:acp:forge-spawn-1');
    await flushAsync();

    const spawnRequests = requests.filter((req) => req?.tool === 'sessions_spawn');
    assert.equal(spawnRequests.length, 1);

    const streamEvents = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    const spawnedEvent = streamEvents.find((event) => event.type === 'agent.spawned');
    assert.equal(Boolean(spawnedEvent), true);
    assert.equal(spawnedEvent.agent_type, 'forge');
    assert.equal(spawnedEvent.label.startsWith('forge-01-'), true);
    assert.equal(spawnedEvent.module_id, '01');
    assert.equal(spawnedEvent.attempt, 2);
    assert.equal(spawnedEvent.session_key, 'agent:main:acp:forge-spawn-1');
    assert.equal(spawnedEvent.dispatch, 'acp');

    const topLevelEntry = JSON.parse(fs.readFileSync(path.join(logRoot, 'pipeline', 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));
    const runScopedEntry = JSON.parse(fs.readFileSync(path.join(config._runLogDir, 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));
    assert.equal(topLevelEntry.title, '🔬 ACP Session Spawned: forge/01');
    assert.equal(topLevelEntry.run_id, runId);
    assert.equal(runScopedEntry.run_id, runId);
    assert.equal(runScopedEntry.gateway_label, topLevelEntry.gateway_label);
    assert.equal(runScopedEntry.session_key, 'agent:main:acp:forge-spawn-1');
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Run ID' && field.value === 'forge-spawn-run-1'), true);
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Module' && field.value === '01'), true);
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Attempt' && field.value === '2'), true);
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Label' && String(field.value).startsWith('forge-01-')), true);
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Session' && field.value === 'agent:main:acp:forge-spawn-1'), true);
  } finally {
    lifecycleTestMod.untrackAgent('forge-01');
    process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    await gateway.close();
  }
});

await record('subagent-backed Forge spawns preserve subagent runtime semantics across gateway, telemetry, and Discord', async () => {
  const orchestrationRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(orchestrationRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const orchestrationTestMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/agents/orchestration.js');
  const lifecycleTestMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/common/pipeline/agents/lifecycle.js');
  const runtimeCoreMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

  const requests = [];
  const gateway = await startGatewayServer(async ({ body }) => {
    requests.push(body);
    if (body?.tool === 'sessions_spawn') {
      return { result: { details: { status: 'accepted', childSessionKey: 'agent:main:subagent:forge-spawn-1', runId: 'forge-subagent-run-1' } } };
    }
    return { result: { details: { ok: true } } };
  });

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-subagent-spawn-'));
  const logRoot = path.join(repoRoot, '.swarm', 'logs');
  const runId = 'run-subagent-spawn-correlation-1';
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  process.env.OPENCLAW_GATEWAY_URL = gateway.url;

  const config = {
    project: 'behavior-subagent-spawn-correlation',
    repo_root: repoRoot,
    telemetry: { enabled: true },
    agents: { forge: { cwd: repoRoot, timeout_seconds: 2700, thinking_level: 'high' } },
    _logDir: logRoot,
    _runLogDir: path.join(logRoot, 'pipeline', 'runs', runId),
    _runId: runId,
    run_id: runId,
    _disable_discord_webhooks: true,
    discord_webhook_url: 'https://example.invalid/webhook',
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
  };

  try {
    const spawnResult = await orchestrationTestMod.spawnAcpAgent(config, 'forge', '01', 'openai-codex/gpt-5.4', 'Implement the module', {
      module_id: '01',
      attempt: 3,
      thinking: 'high',
    });
    assert.equal(spawnResult.childSessionKey, 'agent:main:subagent:forge-spawn-1');
    await flushAsync();

    const tracked = lifecycleTestMod.getTrackedAgent('forge-01');
    assert.equal(tracked.runtime, 'subagent');
    assert.equal(tracked.sessionKey, 'agent:main:subagent:forge-spawn-1');

    const spawnRequests = requests.filter((req) => req?.tool === 'sessions_spawn');
    assert.equal(spawnRequests.length, 1);
    assert.equal(spawnRequests[0]?.args?.runtime, 'subagent');
    assert.equal(spawnRequests[0]?.args?.model, 'openai-codex/gpt-5.4');
    assert.equal(spawnRequests[0]?.args?.agentId ?? null, null);
    assert.equal(spawnRequests[0]?.args?.streamTo ?? null, null);
    assert.equal(spawnRequests[0]?.args?.thinking ?? null, null);

    const streamEvents = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    const spawnedEvent = streamEvents.find((event) => event.type === 'agent.spawned');
    assert.equal(Boolean(spawnedEvent), true);
    assert.equal(spawnedEvent.agent_type, 'forge');
    assert.equal(spawnedEvent.label.startsWith('forge-01-'), true);
    assert.equal(spawnedEvent.module_id, '01');
    assert.equal(spawnedEvent.attempt, 3);
    assert.equal(spawnedEvent.session_key, 'agent:main:subagent:forge-spawn-1');
    assert.equal(spawnedEvent.dispatch, 'subagent');
    assert.equal(spawnedEvent.thinking_level, 'high');

    const topLevelEntry = JSON.parse(fs.readFileSync(path.join(logRoot, 'pipeline', 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));
    const runScopedEntry = JSON.parse(fs.readFileSync(path.join(config._runLogDir, 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));
    assert.equal(topLevelEntry.title, '🔬 Subagent Session Spawned: forge/01');
    assert.equal(topLevelEntry.run_id, runId);
    assert.equal(runScopedEntry.run_id, runId);
    assert.equal(runScopedEntry.gateway_label, topLevelEntry.gateway_label);
    assert.equal(runScopedEntry.session_key, 'agent:main:subagent:forge-spawn-1');
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Run ID' && field.value === 'forge-subagent-run-1'), true);
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Module' && field.value === '01'), true);
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Attempt' && field.value === '3'), true);
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Label' && String(field.value).startsWith('forge-01-')), true);
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Session' && field.value === 'agent:main:subagent:forge-spawn-1'), true);
  } finally {
    lifecycleTestMod.untrackAgent('forge-01');
    process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    await gateway.close();
  }
});

await record('spawn-failed lifecycle alerts preserve canonical run and label correlation', async () => {
  const orchestrationRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(orchestrationRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const orchestrationTestMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/agents/orchestration.js');
  const runtimeCoreMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

  const gateway = await startGatewayServer(async ({ body }) => {
    if (body?.tool === 'sessions_spawn') {
      return { result: { details: { status: 'rejected', reason: 'gateway unavailable' } } };
    }
    return { result: { details: { ok: true } } };
  });

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-agent-spawn-failed-'));
  const logRoot = path.join(repoRoot, '.swarm', 'logs');
  const runId = 'run-agent-spawn-failed-1';
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  process.env.OPENCLAW_GATEWAY_URL = gateway.url;

  const config = {
    project: 'behavior-agent-spawn-failed',
    repo_root: repoRoot,
    telemetry: { enabled: true },
    agents: { forge: { cwd: repoRoot, timeout_seconds: 2700 } },
    _logDir: logRoot,
    _runLogDir: path.join(logRoot, 'pipeline', 'runs', runId),
    _runId: runId,
    run_id: runId,
    _disable_discord_webhooks: true,
    discord_webhook_url: 'https://example.invalid/webhook',
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
  };

  try {
    await assert.rejects(
      orchestrationTestMod.spawnAcpAgent(config, 'forge', '01', 'claude-sonnet-4-6', 'Implement the module', {
        module_id: '01',
        attempt: 2,
      }),
      (err) => {
        assert.equal(typeof err?.gateway_label, 'string');
        assert.equal(err.gateway_label.startsWith('forge-01-'), true);
        assert.equal(err.message.includes("Failed to spawn session 'forge-01-"), true);
        return true;
      },
    );
    await flushAsync();

    const runScopedEntry = JSON.parse(fs.readFileSync(path.join(config._runLogDir, 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));
    assert.equal(runScopedEntry.title, '❌ Spawn Failed: forge/01');
    assert.equal(runScopedEntry.run_id, runId);
    assert.equal(runScopedEntry.session_key ?? null, null);
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Run ID' && field.value === runId), true);
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Module' && field.value === '01'), true);
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Attempt' && field.value === '2'), true);
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Label' && String(field.value).startsWith('forge-01-')), true);
  } finally {
    process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    await gateway.close();
  }
});

await record('kill path keeps ACP cleanup distinct from subagent stop behavior', async () => {
  const requests = [];
  const gateway = await startGatewayServer(async ({ body }) => {
    requests.push(body);
    return { result: { details: { ok: true } } };
  });
  const fakeBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-bin-'));
  const acpxLog = path.join(fakeBinDir, 'acpx.log');
  writeExecutable(path.join(fakeBinDir, 'acpx'), `#!/bin/sh\necho "$@" >> ${acpxLog}\n`);
  const prevPath = process.env.PATH;
  process.env.PATH = `${fakeBinDir}:${prevPath}`;
  try {
    await lifecycleMod.killSession('agent:main:subagent:1', {
      runtime: 'subagent',
      label: 'subagent-check',
      gatewayUrl: gateway.url,
    });
    await lifecycleMod.killSession('agent:main:acp:1', {
      runtime: 'acp',
      agentId: 'claude',
      label: 'acp-check',
      gatewayUrl: gateway.url,
    });
    const stopRequests = requests.filter((req) => req?.tool === 'sessions_send');
    const statusRequests = requests.filter((req) => req?.tool === 'session_status');
    assert.equal(stopRequests.length, 2);
    assert.deepEqual(stopRequests.map((req) => req?.args?.sessionKey), [
      'agent:main:subagent:1',
      'agent:main:acp:1',
    ]);
    assert(statusRequests.length >= 2);
    const acpxCalls = fs.existsSync(acpxLog) ? fs.readFileSync(acpxLog, 'utf8').trim().split('\n').filter(Boolean) : [];
    assert.equal(acpxCalls.length, 1);
    assert(acpxCalls[0].includes('sessions close --name acp-check'));
  } finally {
    process.env.PATH = prevPath;
    await gateway.close();
  }
});

await record('reviewer lifecycle emits gate-scoped agent.spawned and agent.killed events', async () => {
  const orchestrationRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(orchestrationRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const orchestrationTestMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/agents/orchestration.js');
  const lifecycleTestMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/common/pipeline/agents/lifecycle.js');
  const runtimeCoreMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

  const requests = [];
  let reviewerStatusPolls = 0;
  const gateway = await startGatewayServer(async ({ body }) => {
    requests.push(body);
    if (body?.tool === 'sessions_spawn') {
      return { result: { details: { status: 'accepted', childSessionKey: 'agent:main:acp:echo-review-1', runId: 'reviewer-run-1' } } };
    }
    if (body?.tool === 'session_status') {
      reviewerStatusPolls += 1;
      if (reviewerStatusPolls === 1) {
        return { result: { details: { state: 'running', active: true } } };
      }
      if (reviewerStatusPolls === 2) {
        return { result: { details: { state: 'closed' } } };
      }
      if (reviewerStatusPolls === 3) {
        throw new Error('reviewer session status unreachable after stop');
      }
      return { result: { details: { state: 'closed' } } };
    }
    return { result: { details: { ok: true } } };
  });

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-reviewer-lifecycle-'));
  const logRoot = path.join(repoRoot, '.swarm', 'logs');
  const runId = 'run-reviewer-lifecycle-1';
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  process.env.OPENCLAW_GATEWAY_URL = gateway.url;

  const config = {
    project: 'behavior-reviewer-lifecycle',
    repo_root: repoRoot,
    telemetry: { enabled: true },
    agents: { echo: { cwd: repoRoot, thinking_level: 'high' } },
    _logDir: logRoot,
    _runLogDir: path.join(logRoot, 'pipeline', 'runs', runId),
    _runId: runId,
    run_id: runId,
    _disable_discord_webhooks: true,
    discord_webhook_url: 'https://example.invalid/webhook',
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
  };

  const reviewer = {
    label: 'quality',
    model: 'claude-sonnet-4-6',
    dispatch: 'acp',
    timeout_seconds: 1800,
  };

  try {
    const spawnResult = await orchestrationTestMod.spawnReviewerAgent(config, {}, 'gate:quality', reviewer, 'Review the gate output', {
      gate_type: 'review',
      attempt: 3,
      dispatch_id: 'dispatch-review-gate-quality-3',
      thinking: 'high',
    });
    assert.equal(spawnResult.childSessionKey, 'agent:main:acp:echo-review-1');

    const killed = await orchestrationTestMod.killReviewerAgent(config, 'gate:quality', reviewer);
    assert.equal(killed, true);
    await flushAsync();

    const spawnRequests = requests.filter((req) => req?.tool === 'sessions_spawn');
    const stopRequests = requests.filter((req) => req?.tool === 'sessions_send');
    assert.equal(spawnRequests.length, 1);
    assert.equal(stopRequests.length >= 1, true);

    const streamEvents = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    const spawnedEvent = streamEvents.find((event) => event.type === 'agent.spawned' && event.agent_type === 'echo');
    const killedEvent = streamEvents.find((event) => event.type === 'agent.killed' && event.agent_type === 'echo');
    const degradedEvent = streamEvents.find((event) => event.type === 'observability.degraded' && event.gate_id === 'gate:quality' && event.reason === 'gateway_unreachable');
    const restoredEvent = streamEvents.find((event) => event.type === 'observability.restored' && event.gate_id === 'gate:quality' && event.reason === 'gateway_unreachable');
    assert.equal(Boolean(spawnedEvent), true);
    assert.equal(Boolean(killedEvent), true);
    assert.equal(Boolean(degradedEvent), true);
    assert.equal(Boolean(restoredEvent), true);
    assert.equal(spawnedEvent.label.startsWith('echo-quality-gate:quality-'), true);
    assert.equal(spawnedEvent.gate_id, 'gate:quality');
    assert.equal(spawnedEvent.gate_type, 'review');
    assert.equal(spawnedEvent.attempt, 3);
    assert.equal(spawnedEvent.dispatch_id, 'dispatch-review-gate-quality-3');
    assert.equal(spawnedEvent.session_key, 'agent:main:acp:echo-review-1');
    assert.equal(killedEvent.label, spawnedEvent.label);
    assert.equal(killedEvent.gate_id, 'gate:quality');
    assert.equal(killedEvent.gate_type, 'review');
    assert.equal(killedEvent.attempt, 3);
    assert.equal(killedEvent.dispatch_id, 'dispatch-review-gate-quality-3');
    assert.equal(killedEvent.session_key, 'agent:main:acp:echo-review-1');
    assert.equal(degradedEvent.surface, 'gateway');
    assert.equal(degradedEvent.gate_type, 'review');
    assert.equal(degradedEvent.dispatch_id, 'dispatch-review-gate-quality-3');
    assert.equal(degradedEvent.session_key, 'agent:main:acp:echo-review-1');
    assert.match(degradedEvent.detail || '', /Gateway session_status failed:/);
    assert.equal(restoredEvent.surface, 'gateway');
    assert.equal(restoredEvent.gate_type, 'review');
    assert.equal(restoredEvent.dispatch_id, 'dispatch-review-gate-quality-3');
    assert.equal(restoredEvent.session_key, 'agent:main:acp:echo-review-1');
    assert.equal(restoredEvent.detail, 'session status reachable again');
    assert.equal(typeof restoredEvent.restored_after_ms, 'number');

    const runScopedEntries = fs.readFileSync(path.join(config._runLogDir, 'discord.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    const spawnEntry = runScopedEntries.find((entry) => entry.title === '🔬 Reviewer Spawned: quality/gate:quality');
    assert.equal(Boolean(spawnEntry), true);
    assert.equal(spawnEntry.run_id, runId);
    assert.equal(spawnEntry.gate_id, 'gate:quality');
    assert.equal(spawnEntry.gate_type, 'review');
    assert.equal(spawnEntry.dispatch_id, 'dispatch-review-gate-quality-3');
    assert.equal(spawnEntry.session_key, 'agent:main:acp:echo-review-1');
    assert.equal(spawnEntry.fields.some((field) => field.name === 'Run ID' && field.value === 'reviewer-run-1'), true);
    assert.equal(spawnEntry.fields.some((field) => field.name === 'Gate' && field.value === 'gate:quality'), true);
    assert.equal(spawnEntry.fields.some((field) => field.name === 'Gate Type' && field.value === 'review'), true);
    assert.equal(spawnEntry.fields.some((field) => field.name === 'Attempt' && field.value === '3'), true);
    assert.equal(spawnEntry.fields.some((field) => field.name === 'Dispatch' && field.value === 'dispatch-review-gate-quality-3'), true);
    assert.equal(spawnEntry.fields.some((field) => field.name === 'Label' && String(field.value).startsWith('echo-quality-gate:quality-')), true);
    assert.equal(spawnEntry.fields.some((field) => field.name === 'Session' && field.value === 'agent:main:acp:echo-review-1'), true);
  } finally {
    lifecycleTestMod.untrackAgent('echo-quality-gate:quality');
    process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    await gateway.close();
  }
});

await record('agent.killed preserves session correlation when orchestration knows the session key', async () => {
  const orchestrationRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(orchestrationRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const orchestrationTestMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/agents/orchestration.js');
  const lifecycleTestMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/common/pipeline/agents/lifecycle.js');
  const runtimeCoreMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

  const requests = [];
  let sessionStatusPolls = 0;
  const gateway = await startGatewayServer(async ({ body }) => {
    requests.push(body);
    if (body?.tool === 'session_status') {
      sessionStatusPolls += 1;
      if (sessionStatusPolls === 1) {
        return { result: { details: { state: 'running', active: true } } };
      }
      if (sessionStatusPolls === 2) {
        return { result: { details: { state: 'closed' } } };
      }
      if (sessionStatusPolls === 3) {
        throw new Error('session status unreachable after stop');
      }
      return { result: { details: { state: 'closed' } } };
    }
    return { result: { details: { ok: true } } };
  });
  const fakeBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-bin-'));
  const acpxLog = path.join(fakeBinDir, 'acpx.log');
  writeExecutable(path.join(fakeBinDir, 'acpx'), `#!/bin/sh\necho "$@" >> ${acpxLog}\n`);

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-agent-killed-'));
  const logRoot = path.join(repoRoot, '.swarm', 'logs');
  const runId = 'run-agent-killed-session-correlation-1';

  const prevPath = process.env.PATH;
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  process.env.PATH = `${fakeBinDir}:${prevPath}`;
  process.env.OPENCLAW_GATEWAY_URL = gateway.url;

  const config = {
    project: 'behavior-agent-killed-session-correlation',
    telemetry: { enabled: true },
    _logDir: logRoot,
    _runLogDir: path.join(logRoot, 'pipeline', 'runs', runId),
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
  };

  try {
    lifecycleTestMod.trackAgent(config, 'forge-01', 'agent:main:acp:1', 'claude', 'forge-01-123', null, {
      model: 'claude-sonnet-4-6',
      runtime: 'acp',
      moduleId: '01',
    });

    const terminated = await orchestrationTestMod.killAcpAgent(config, 'forge', '01');
    assert.equal(terminated, true);
    await flushAsync();

    const stopRequests = requests.filter((req) => req?.tool === 'sessions_send');
    assert.equal(stopRequests.length >= 1, true);
    assert.equal(stopRequests.at(-1)?.args?.sessionKey, 'agent:main:acp:1');

    const streamEvents = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    const killedEvent = streamEvents.find((event) => event.type === 'agent.killed');
    assert.equal(Boolean(killedEvent), true);
    assert.equal(killedEvent.agent_type, 'forge');
    assert.equal(killedEvent.label, 'forge-01-123');
    assert.equal(killedEvent.module_id, '01');
    assert.equal(killedEvent.session_key, 'agent:main:acp:1');

    const degradedEvent = streamEvents.find((event) => event.type === 'observability.degraded' && event.module_id === '01' && event.reason === 'gateway_unreachable');
    const restoredEvent = streamEvents.find((event) => event.type === 'observability.restored' && event.module_id === '01' && event.reason === 'gateway_unreachable');
    assert.equal(Boolean(degradedEvent), true);
    assert.equal(Boolean(restoredEvent), true);
    assert.equal(degradedEvent.surface, 'gateway');
    assert.equal(degradedEvent.session_key, 'agent:main:acp:1');
    assert.match(degradedEvent.detail || '', /Gateway session_status failed:/);
    assert.equal(restoredEvent.surface, 'gateway');
    assert.equal(restoredEvent.session_key, 'agent:main:acp:1');
    assert.equal(restoredEvent.detail, 'session status reachable again');
    assert.equal(typeof restoredEvent.restored_after_ms, 'number');
  } finally {
    lifecycleTestMod.untrackAgent('forge-01');
    process.env.PATH = prevPath;
    process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    await gateway.close();
  }
});

await record('dispatchRedisTask imports the Redis dispatch abstraction directly without spawning a temp node wrapper', async () => {
  const orchestrationRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(orchestrationRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const orchestrationTestMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/agents/orchestration.js');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-redis-dispatch-direct-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const modulesDir = path.join(swarmDir, 'modules');
  fs.mkdirSync(path.join(modulesDir, '01'), { recursive: true });

  const behaviorTempRoot = path.join(os.homedir(), '.openclaw', 'tmp');
  fs.mkdirSync(behaviorTempRoot, { recursive: true });
  const fakeRedisModuleDir = fs.mkdtempSync(path.join(behaviorTempRoot, 'behavior-redis-dispatch-'));
  const fakeRedisModulePath = path.join(fakeRedisModuleDir, 'redis-dispatch-direct.mjs');
  const callPath = path.join(fakeRedisModuleDir, 'dispatch-call.json');
  const fakeBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-redis-dispatch-bin-'));
  const nodeTrapLog = path.join(fakeBinDir, 'node-trap.log');

  writeExecutable(path.join(fakeBinDir, 'node'), `#!/bin/sh\necho "$@" >> ${nodeTrapLog}\nexit 88\n`);

  process.env.BEHAVIOR_REDIS_DISPATCH_CALL_PATH = callPath;
  fs.writeFileSync(fakeRedisModulePath, `
import fs from 'fs';
export default {
  async sendTask(targetAgent, type, payload, iteration = 1) {
    fs.writeFileSync(process.env.BEHAVIOR_REDIS_DISPATCH_CALL_PATH, JSON.stringify({
      targetAgent,
      type,
      payload,
      iteration,
    }, null, 2));
    return { status: 'sent', id: 'behavior-redis-dispatch-1', stream: 'swarm:buster:tasks' };
  },
};
`);

  const config = {
    project: 'behavior-redis-dispatch-direct',
    repo_root: repoRoot,
    _logDir: path.join(swarmDir, 'logs'),
    paths: {
      swarm_dir: swarmDir,
      modules_dir: modulesDir,
    },
    agents: {
      buster: {
        dispatch: 'redis',
        redis_js_path: fakeRedisModulePath,
      },
    },
  };

  const progress = {
    modules: {
      '01': { dir: '01', timeout_minutes: 5, test_suites: ['unit'] },
    },
    gates: {},
  };

  const prevPath = process.env.PATH;
  process.env.PATH = fakeBinDir;

  try {
    const result = await orchestrationTestMod.dispatchRedisTask(
      config,
      progress,
      'buster',
      '01',
      'module_test',
      'Run the unit suite',
      { forge_commit_hash: 'abc123' },
      {
        model: 'openai-codex/gpt-5.4',
        run_id: 'run-dispatch-direct-1',
        attempt: 2,
        dispatch_id: 'dispatch-buster-01-attempt-2',
      },
    );

    assert.equal(result.status, 'sent');
    assert.equal(result.id, 'behavior-redis-dispatch-1');
    assert.equal(result.stream, 'swarm:buster:tasks');
    assert.equal(result.run_id, 'run-dispatch-direct-1');
    assert.equal(result.attempt, 2);
    assert.equal(result.dispatch_id, 'dispatch-buster-01-attempt-2');
    assert.equal(fs.existsSync(nodeTrapLog), false);

    const dispatchCall = JSON.parse(fs.readFileSync(callPath, 'utf8'));
    assert.equal(dispatchCall.targetAgent, 'buster');
    assert.equal(dispatchCall.type, 'module_test');
    assert.equal(dispatchCall.iteration, 1);
    assert.equal(dispatchCall.payload.module_id, '01');
    assert.equal(dispatchCall.payload.run_id, 'run-dispatch-direct-1');
    assert.equal(dispatchCall.payload.attempt, 2);
    assert.equal(dispatchCall.payload.dispatch_id, 'dispatch-buster-01-attempt-2');
    assert.equal(dispatchCall.payload.session.label, 'dispatch-buster-01-attempt-2');
  } finally {
    delete process.env.BEHAVIOR_REDIS_DISPATCH_CALL_PATH;
    process.env.PATH = prevPath;
    fs.rmSync(fakeRedisModuleDir, { recursive: true, force: true });
    fs.rmSync(fakeBinDir, { recursive: true, force: true });
  }
});

await record('dispatchRedisTask stays fail-closed when redis_js_path is outside the safe-path allowlist', async () => {
  const orchestrationRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(orchestrationRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const orchestrationTestMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/agents/orchestration.js');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-redis-dispatch-invalid-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const modulesDir = path.join(swarmDir, 'modules');
  fs.mkdirSync(path.join(modulesDir, '01'), { recursive: true });

  const config = {
    project: 'behavior-redis-dispatch-invalid',
    repo_root: repoRoot,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: modulesDir,
    },
    agents: {
      buster: {
        dispatch: 'redis',
        redis_js_path: '/tmp/behavior-invalid-redis-dispatch.mjs',
      },
    },
  };

  const progress = {
    modules: {
      '01': { dir: '01', timeout_minutes: 5, test_suites: ['unit'] },
    },
    gates: {},
  };

  await assert.rejects(
    orchestrationTestMod.dispatchRedisTask(
      config,
      progress,
      'buster',
      '01',
      'module_test',
      'Run the unit suite',
      { forge_commit_hash: 'abc123' },
      {
        model: 'openai-codex/gpt-5.4',
        run_id: 'run-dispatch-invalid-1',
        attempt: 1,
        dispatch_id: 'dispatch-invalid-1',
      },
    ),
    (err) => {
      assert.equal(err.message.includes('Failed to dispatch Redis task to buster: agents.buster.redis_js_path: path'), true);
      assert.equal(err.message.includes("not in allowed prefixes [/app/, /opt/, /home/]. Update ALLOWED_PATH_PREFIXES in core/paths.js if this is intentional."), true);
      return true;
    },
  );
});
}
