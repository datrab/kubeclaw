import {
  buildBuiltInRegistry,
} from './helpers.mjs';

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
function platformAgentLifecycleDefaults() {
  return {
    fallback_model: 'openai/gpt-5.4',
    rate_limit: { max_pauses_per_module: 3, cooldown_hours: 0 },
    gateway: {
      invoke: {
        retry: { max_attempts: 1, retry_delay_ms: 100 },
        session_status: { timeout_ms: 30000 },
        session_spawn: { timeout_ms: 30000 },
        session_send: { timeout_ms: 30000 },
        subagent_kill: { timeout_ms: 30000 },
        subagent_list: { timeout_ms: 30000 },
        health: { timeout_ms: 30000 },
      },
      health: { timeout_ms: 30000, interval_ms: 3000, monitor_interval_ms: 60000, max_failures: 3 },
    },
    session: {
      health_check_timeout_ms: 30000,
      spawn: {
        thread: false,
        mode: 'run',
        cleanup: 'keep',
        stream_to: 'parent',
      },
      kill: {
        acp_confirm_timeout_ms: 15000,
        subagent_confirm_timeout_ms: 120000,
        confirm_poll_ms: 2000,
        cleanup_confirm_timeout_ms: 'match_confirm_timeout',
        acpx_timeout_ms: 10000,
        stop_message: '/stop',
      },
      termination: {
        grace_ms: 5000,
        max_grace_ms: 10000,
        poll_ms: 500,
        gateway_request_max_ms: 1000,
        cleanup_confirm_timeout_ms: 0,
        gateway_operation_timeout_ms: 1000,
        acpx_timeout_ms: 1000,
      },
    },
    agent_observability: {
      startup_evidence: { timeout_ms: 0, block_ms: 1 },
    },
    buster: {
      runtime: {
        heartbeat_path: '/tmp/kubeclaw-buster-heartbeat',
        heartbeat_interval_ms: 1000,
        task_poll_interval_ms: 2000,
        task_pending_reclaim_idle_ms: 60000,
        completion_event_block_ms: 0,
        completion_recovery_scan_interval_ms: 5000,
        task_stream_max_len: 250,
        suite_timeout_ms: 300000,
        max_crash_retries: 2,
      },
    },
    acp_monitor: {
      poll_limit: 10,
      max_transcript_extensions: 3,
      transcript_grace_ms: 300000,
      monitor_poll_ms: 10000,
    },
  };
}

await record('session-backed Forge spawns pass observer identity without core agent.spawned telemetry', async () => {
  const orchestrationRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(orchestrationRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const orchestrationTestMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/agents/orchestration.ts');
  const lifecycleTestMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/agents/lifecycle.ts');
  const runtimeCoreMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');

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
    ...platformAgentLifecycleDefaults(),
    project: 'behavior-agent-spawn-correlation',
    repo_root: repoRoot,
    telemetry: { enabled: true },
    agents: { forge: { cwd: repoRoot, timeout_seconds: 2700 } },
    paths: { swarm_dir: path.join(repoRoot, '.swarm') },
    _runId: runId,
    run_id: runId,
    _disable_discord_webhooks: true,
    discord_webhook_url: 'https://example.invalid/webhook',
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
    pluginRegistry: await buildBuiltInRegistry(orchestrationRuntimeRoot),
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
    assert.equal(spawnRequests[0]?.args?.runId, runId);
    assert.equal(spawnRequests[0]?.args?.project, config.project);
    assert.equal(spawnRequests[0]?.args?.agentType, 'forge');
    assert.equal(spawnRequests[0]?.args?.moduleId, '01');
    assert.equal(spawnRequests[0]?.args?.dispatchId.startsWith('forge-01-dispatch-'), true);
    assert.equal(spawnRequests[0]?.args?.gatewayLabel.startsWith('forge-01-'), true);
    assert.equal(spawnRequests[0]?.args?.metadata?.attempt, 2);

    const streamEvents = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    assert.equal(streamEvents.some((event) => event.type === 'agent.spawned'), false);

    const topLevelEntry = JSON.parse(fs.readFileSync(path.join(logRoot, 'pipeline', 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));
    const runScopedEntry = JSON.parse(fs.readFileSync(path.join(logRoot, 'pipeline', 'runs', runId, 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));
    assert.equal(topLevelEntry.title, '🔬 Forge ACP Session Spawned: forge/01');
    assert.equal(topLevelEntry.run_id, runId);
    assert.equal(runScopedEntry.run_id, runId);
    assert.equal(runScopedEntry.gateway_label, topLevelEntry.gateway_label);
    assert.equal(runScopedEntry.session_key, 'agent:main:acp:forge-spawn-1');
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Run ID' && field.value === runId), true);
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Module' && field.value === '01'), true);
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Attempt' && field.value === '2'), true);
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Gateway Label' && String(field.value).startsWith('forge-01-')), true);
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

  const orchestrationTestMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/agents/orchestration.ts');
  const lifecycleTestMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/agents/lifecycle.ts');
  const runtimeCoreMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');

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
    ...platformAgentLifecycleDefaults(),
    project: 'behavior-subagent-spawn-correlation',
    repo_root: repoRoot,
    telemetry: { enabled: true },
    agents: { forge: { cwd: repoRoot, timeout_seconds: 2700, thinking_level: 'high' } },
    paths: { swarm_dir: path.join(repoRoot, '.swarm') },
    _runId: runId,
    run_id: runId,
    _disable_discord_webhooks: true,
    discord_webhook_url: 'https://example.invalid/webhook',
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
    pluginRegistry: await buildBuiltInRegistry(orchestrationRuntimeRoot),
  };

  try {
    const spawnResult = await orchestrationTestMod.spawnAcpAgent(config, 'forge', '01', 'openai/gpt-5.4', 'Implement the module', {
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
    assert.equal(spawnRequests[0]?.args?.model, 'openai/gpt-5.4');
    assert.equal(spawnRequests[0]?.args?.agentId ?? null, null);
    assert.equal(spawnRequests[0]?.args?.streamTo ?? null, null);
    assert.equal(spawnRequests[0]?.args?.thinking ?? null, null);
    assert.equal(spawnRequests[0]?.args?.runId, runId);
    assert.equal(spawnRequests[0]?.args?.project, config.project);
    assert.equal(spawnRequests[0]?.args?.agentType, 'forge');
    assert.equal(spawnRequests[0]?.args?.moduleId, '01');
    assert.equal(spawnRequests[0]?.args?.dispatchId.startsWith('forge-01-dispatch-'), true);
    assert.equal(spawnRequests[0]?.args?.gatewayLabel.startsWith('forge-01-'), true);
    assert.equal(spawnRequests[0]?.args?.metadata?.attempt, 3);

    const streamEvents = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    assert.equal(streamEvents.some((event) => event.type === 'agent.spawned'), false);

    const topLevelEntry = JSON.parse(fs.readFileSync(path.join(logRoot, 'pipeline', 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));
    const runScopedEntry = JSON.parse(fs.readFileSync(path.join(logRoot, 'pipeline', 'runs', runId, 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));
    assert.equal(topLevelEntry.title, '🔬 Forge Subagent Session Spawned: forge/01');
    assert.equal(topLevelEntry.run_id, runId);
    assert.equal(runScopedEntry.run_id, runId);
    assert.equal(runScopedEntry.gateway_label, topLevelEntry.gateway_label);
    assert.equal(runScopedEntry.session_key, 'agent:main:subagent:forge-spawn-1');
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Run ID' && field.value === runId), true);
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Module' && field.value === '01'), true);
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Attempt' && field.value === '3'), true);
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Gateway Label' && String(field.value).startsWith('forge-01-')), true);
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

  const orchestrationTestMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/agents/orchestration.ts');
  const runtimeCoreMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');

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
    ...platformAgentLifecycleDefaults(),
    project: 'behavior-agent-spawn-failed',
    repo_root: repoRoot,
    telemetry: { enabled: true },
    agents: { forge: { cwd: repoRoot, timeout_seconds: 2700 } },
    paths: { swarm_dir: path.join(repoRoot, '.swarm') },
    _runId: runId,
    run_id: runId,
    _disable_discord_webhooks: true,
    discord_webhook_url: 'https://example.invalid/webhook',
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
    pluginRegistry: await buildBuiltInRegistry(orchestrationRuntimeRoot),
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

    const runScopedEntry = JSON.parse(fs.readFileSync(path.join(logRoot, 'pipeline', 'runs', runId, 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));
    assert.equal(runScopedEntry.title, '❌ Spawn Failed: forge/01');
    assert.equal(runScopedEntry.run_id, runId);
    assert.equal(runScopedEntry.session_key ?? null, null);
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Run ID' && field.value === runId), true);
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Module' && field.value === '01'), true);
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Attempt' && field.value === '2'), true);
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Gateway Label' && String(field.value).startsWith('forge-01-')), true);
  } finally {
    process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    await gateway.close();
  }
});

await record('kill path keeps ACP cleanup distinct from subagent stop behavior', async () => {
  const requests = [];
  let subagentKilled = false;
  let acpStopped = false;
  const gateway = await startGatewayServer(async ({ body }) => {
    requests.push(body);
    if (body?.tool === 'subagents' && body?.args?.action === 'kill') subagentKilled = true;
    if (body?.tool === 'sessions_send' && body?.args?.sessionKey === 'agent:main:acp:1') acpStopped = true;
    if (body?.tool === 'session_status') {
      if (body?.args?.sessionKey === 'agent:main:subagent:1') {
        return { result: { details: { status: subagentKilled ? 'closed' : 'running' } } };
      }
      if (body?.args?.sessionKey === 'agent:main:acp:1') {
        return { result: { details: { status: acpStopped ? 'closed' : 'running' } } };
      }
    }
    return { result: { details: { ok: true } } };
  });
  const fakeBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-bin-'));
  const acpxLog = path.join(fakeBinDir, 'acpx.log');
  writeExecutable(path.join(fakeBinDir, 'acpx'), `#!/bin/sh\necho "$@" >> ${acpxLog}\n`);
  const prevPath = process.env.PATH;
  process.env.PATH = `${fakeBinDir}:${prevPath}`;
  const gatewayPolicy = { timeoutMs: 1000, maxRetries: 1, retryDelayMs: 1 };
  const killPolicy = {
    acpConfirmTimeoutMs: 15000,
    subagentConfirmTimeoutMs: 120000,
    confirmPollMs: 1,
    cleanupConfirmTimeoutMs: 0,
    statusTimeoutMs: 1000,
    requestTimeoutMs: 1000,
    stopRequestTimeoutMs: 1000,
    listTimeoutMs: 1000,
    statusGateway: gatewayPolicy,
    requestGateway: gatewayPolicy,
    stopGateway: gatewayPolicy,
    listGateway: gatewayPolicy,
    acpxTimeoutMs: 1000,
    stopMessage: '/stop',
  };
  try {
    await lifecycleMod.killSession('agent:main:subagent:1', {
      runtime: 'subagent',
      label: 'subagent-check',
      gatewayUrl: gateway.url,
      gatewayToken: '',
      killPolicy,
    });
    await lifecycleMod.killSession('agent:main:acp:1', {
      runtime: 'acp',
      agentId: 'claude',
      label: 'acp-check',
      gatewayUrl: gateway.url,
      gatewayToken: '',
      killPolicy,
    });
    const subagentKillRequests = requests.filter((req) => req?.tool === 'subagents' && req?.args?.action === 'kill');
    const stopRequests = requests.filter((req) => req?.tool === 'sessions_send');
    const statusRequests = requests.filter((req) => req?.tool === 'session_status');
    assert.equal(subagentKillRequests.length, 1);
    assert.equal(subagentKillRequests[0]?.args?.target, 'agent:main:subagent:1');
    assert.equal(stopRequests.length, 1);
    assert.deepEqual(stopRequests.map((req) => req?.args?.sessionKey), ['agent:main:acp:1']);
    assert(statusRequests.length >= 2);
    const acpxCalls = fs.existsSync(acpxLog) ? fs.readFileSync(acpxLog, 'utf8').trim().split('\n').filter(Boolean) : [];
    assert.equal(acpxCalls.length, 0);
  } finally {
    process.env.PATH = prevPath;
    await gateway.close();
  }
});

await record('termination controller returns canonical unconfirmed result within isolated grace period', async () => {
  const terminationMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/agents/session-termination.ts');
  const requests = [];
  const gateway = await startGatewayServer(async ({ body }) => {
    requests.push(body);
    if (body?.tool === 'session_status') return { result: { details: { status: 'running' } } };
    return { result: { details: { ok: true } } };
  });
  const gatewayPolicy = { timeoutMs: 1000, maxRetries: 1, retryDelayMs: 1 };
  const killPolicy = {
    acpConfirmTimeoutMs: 1000,
    subagentConfirmTimeoutMs: 1000,
    confirmPollMs: 10,
    cleanupConfirmTimeoutMs: 0,
    statusTimeoutMs: 20,
    requestTimeoutMs: 20,
    stopRequestTimeoutMs: 20,
    listTimeoutMs: 20,
    statusGateway: gatewayPolicy,
    requestGateway: gatewayPolicy,
    stopGateway: gatewayPolicy,
    listGateway: gatewayPolicy,
    acpxTimeoutMs: 20,
    stopMessage: '/stop',
  };
  try {
    const result = await terminationMod.terminateSession('agent:main:acp:unconfirmed', {
      runtime: 'acp',
      agentId: 'claude',
      label: 'unconfirmed-check',
      gatewayUrl: gateway.url,
      gatewayToken: '',
      graceMs: 1000,
      maxGraceMs: 1000,
      confirmPollMs: 10,
      gatewayRequestMaxMs: 20,
      cleanupConfirmTimeoutMs: 0,
      statusTimeoutMs: 20,
      requestTimeoutMs: 20,
      stopRequestTimeoutMs: 20,
      listTimeoutMs: 20,
      acpxTimeoutMs: 20,
      killPolicy,
    });
    assert.deepEqual(Object.keys(result).sort(), [
      'cleanupAttempted',
      'cleanupConfirmed',
      'cleanupError',
      'confirmed',
      'graceMs',
      'requested',
      'sessionKey',
      'state',
      'terminal',
      'unconfirmed',
    ].sort());
    assert.equal(result.sessionKey, 'agent:main:acp:unconfirmed');
    assert.equal(result.confirmed, false);
    assert.equal(result.unconfirmed, true);
    assert.equal(result.terminal, false);
    assert.equal(result.graceMs, 1000);
    assert(requests.some((req) => req?.tool === 'sessions_send'), 'termination should request a stop through the gateway');
  } finally {
    await gateway.close();
  }
});

await record('reviewer lifecycle passes observer identity and leaves spawned/killed telemetry to the plugin', async () => {
  const orchestrationRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(orchestrationRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const orchestrationTestMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/agents/orchestration.ts');
  const lifecycleTestMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/agents/lifecycle.ts');
  const runtimeCoreMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');

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
    ...platformAgentLifecycleDefaults(),
    project: 'behavior-reviewer-lifecycle',
    repo_root: repoRoot,
    telemetry: { enabled: true },
    agents: { echo: { cwd: repoRoot, thinking_level: 'high' } },
    paths: { swarm_dir: path.join(repoRoot, '.swarm') },
    _runId: runId,
    run_id: runId,
    _disable_discord_webhooks: true,
    discord_webhook_url: 'https://example.invalid/webhook',
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
    pluginRegistry: await buildBuiltInRegistry(orchestrationRuntimeRoot),
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
    assert.equal(spawnRequests[0]?.args?.runId, runId);
    assert.equal(spawnRequests[0]?.args?.project, config.project);
    assert.equal(spawnRequests[0]?.args?.agentType, 'echo');
    assert.equal(spawnRequests[0]?.args?.gateId, 'gate:quality');
    assert.equal(spawnRequests[0]?.args?.dispatchId, 'dispatch-review-gate-quality-3');
    assert.equal(spawnRequests[0]?.args?.gatewayLabel.startsWith('echo-quality-gate:quality-'), true);
    assert.equal(spawnRequests[0]?.args?.metadata?.gate_type, 'review');
    assert.equal(spawnRequests[0]?.args?.metadata?.attempt, 3);

    const streamEvents = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    assert.equal(streamEvents.some((event) => event.type === 'agent.spawned'), false);
    assert.equal(streamEvents.some((event) => event.type === 'agent.killed'), false);

    const runScopedEntries = fs.readFileSync(path.join(logRoot, 'pipeline', 'runs', runId, 'discord.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    const spawnEntry = runScopedEntries.find((entry) => entry.title === '🔬 Reviewer Spawned: quality/gate:quality');
    assert.equal(Boolean(spawnEntry), true);
    assert.equal(spawnEntry.run_id, runId);
    assert.equal(spawnEntry.gate_id, 'gate:quality');
    assert.equal(spawnEntry.gate_type, 'review');
    assert.equal(spawnEntry.dispatch_id, 'dispatch-review-gate-quality-3');
    assert.equal(spawnEntry.session_key, 'agent:main:acp:echo-review-1');
    assert.equal(spawnEntry.fields.some((field) => field.name === 'Run ID' && field.value === runId), true);
    assert.equal(spawnEntry.fields.some((field) => field.name === 'Gate' && field.value === 'gate:quality'), true);
    assert.equal(spawnEntry.fields.some((field) => field.name === 'Gate Type' && field.value === 'review'), true);
    assert.equal(spawnEntry.fields.some((field) => field.name === 'Attempt' && field.value === '3'), true);
    assert.equal(spawnEntry.fields.some((field) => field.name === 'Dispatch' && field.value === 'dispatch-review-gate-quality-3'), true);
    assert.equal(spawnEntry.fields.some((field) => field.name === 'Gateway Label' && String(field.value).startsWith('echo-quality-gate:quality-')), true);
    assert.equal(spawnEntry.fields.some((field) => field.name === 'Session' && field.value === 'agent:main:acp:echo-review-1'), true);
  } finally {
    lifecycleTestMod.untrackAgent('echo-quality-gate:quality');
    process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    await gateway.close();
  }
});

await record('agent kill stops the session without core agent.killed telemetry', async () => {
  const orchestrationRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(orchestrationRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const orchestrationTestMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/agents/orchestration.ts');
  const lifecycleTestMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/agents/lifecycle.ts');
  const runtimeCoreMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');

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
    ...platformAgentLifecycleDefaults(),
    project: 'behavior-agent-killed-session-correlation',
    telemetry: { enabled: true },
    paths: { swarm_dir: path.join(repoRoot, '.swarm') },
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
    pluginRegistry: await buildBuiltInRegistry(orchestrationRuntimeRoot),
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
    assert.equal(streamEvents.some((event) => event.type === 'agent.killed'), false);

  } finally {
    lifecycleTestMod.untrackAgent('forge-01');
    process.env.PATH = prevPath;
    process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    await gateway.close();
  }
});

await record('spawnAgent routes Buster through the canonical session spawn path', async () => {
  const orchestrationRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(orchestrationRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const orchestrationTestMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/agents/orchestration.ts');
  const lifecycleTestMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/agents/lifecycle.ts');
  const runtimeCoreMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');

  const requests = [];
  const gateway = await startGatewayServer(async ({ body }) => {
    requests.push(body);
    if (body?.tool === 'sessions_spawn') {
      return { result: { details: { status: 'accepted', childSessionKey: 'agent:main:acp:buster-spawn-1', runId: 'buster-spawn-run-1' } } };
    }
    return { result: { details: { ok: true } } };
  });

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-session-spawn-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const modulesDir = path.join(swarmDir, 'modules');
  fs.mkdirSync(path.join(modulesDir, '01'), { recursive: true });
  const runId = 'run-buster-session-spawn-1';
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  process.env.OPENCLAW_GATEWAY_URL = gateway.url;

  const config = {
    ...platformAgentLifecycleDefaults(),
    project: 'behavior-buster-session-spawn',
    repo_root: repoRoot,
    telemetry: { enabled: true },
    paths: {
      swarm_dir: swarmDir,
      modules_dir: modulesDir,
    },
    agents: {
      buster: {
        dispatch: 'acp',
        acp_agent_id: 'buster',
        cwd: repoRoot,
        timeout_seconds: 2700,
      },
    },
    _runId: runId,
    run_id: runId,
    _disable_discord_webhooks: true,
    discord_webhook_url: 'https://example.invalid/webhook',
    _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
    pluginRegistry: await buildBuiltInRegistry(orchestrationRuntimeRoot),
  };

  const progress = {
    modules: {
      '01': { dir: '01', timeout_minutes: 5, test_suites: ['unit'] },
    },
    gates: {},
  };

  try {
    const result = await orchestrationTestMod.spawnAgent(
      config,
      progress,
      'buster',
      '01',
      'openai/gpt-5.4',
      'Run the unit suite',
      {
        taskType: 'module_test',
        run_id: runId,
        attempt: 2,
        dispatch_id: 'dispatch-buster-01-attempt-2',
      },
    );
    await flushAsync();

    assert.equal(result.childSessionKey, 'agent:main:acp:buster-spawn-1');
    assert.equal(result.dispatch_id, 'dispatch-buster-01-attempt-2');
    assert.equal(result.runtime, 'acp');

    const spawnRequests = requests.filter((req) => req?.tool === 'sessions_spawn');
    assert.equal(spawnRequests.length, 1);
    assert.equal(spawnRequests[0]?.args?.runId, runId);
    assert.equal(spawnRequests[0]?.args?.project, config.project);
    assert.equal(spawnRequests[0]?.args?.agentType, 'buster');
    assert.equal(spawnRequests[0]?.args?.moduleId, '01');
    assert.equal(spawnRequests[0]?.args?.dispatchId, 'dispatch-buster-01-attempt-2');
    assert.equal(spawnRequests[0]?.args?.metadata?.attempt, 2);

    const tracked = lifecycleTestMod.getTrackedAgent('buster-01');
    assert.equal(tracked?.runtime, 'acp');
    assert.equal(tracked?.sessionKey, 'agent:main:acp:buster-spawn-1');
  } finally {
    lifecycleTestMod.untrackAgent('buster-01');
    process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    await gateway.close();
  }
});
}
