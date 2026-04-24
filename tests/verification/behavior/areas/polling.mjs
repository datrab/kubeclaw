export async function registerPollingArea({
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
const lifecycleTestModBase = await importRuntimeModule(runtimeRoot, '/app/common/pipeline/agents/lifecycle.js');
const gitMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/git.js');
const pollingMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/polling.js');

await record('pollGeneric checks immediately before waiting the first interval', async () => {
  const started = Date.now();
  let calls = 0;
  const result = await pollingMod.pollGeneric(
    { poll_interval_seconds: 0.2 },
    async () => {
      calls += 1;
      return { done: true, result: { ok: true, reason: 'immediate', data: { calls } } };
    },
    1,
    'immediate-poll-check',
  );

  const elapsedMs = Date.now() - started;
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'immediate');
  assert.equal(calls, 1);
  assert(elapsedMs < 100, `expected immediate poll resolution, got ${elapsedMs}ms`);
});

await record('pollGeneric throttles repeated unchanged progress logs', async () => {
  const originalConsoleError = console.error;
  const logs = [];
  console.error = (...args) => { logs.push(args.join(' ')); };
  try {
    let calls = 0;
    const result = await pollingMod.pollGeneric(
      { poll_interval_seconds: 0.01, poll_progress_log_interval_ms: 1000 },
      async () => {
        calls += 1;
        if (calls >= 4) return { done: true, result: { ok: true, reason: 'done', data: { calls } } };
        return { done: false, logMsg: 'same-state' };
      },
      1,
      'throttle-poll-check',
    );

    assert.equal(result.ok, true);
    assert.equal(calls, 4);
    const sameStateLogs = logs.filter((line) => line.includes('[throttle-poll-check] same-state |'));
    assert.equal(sameStateLogs.length, 1);
  } finally {
    console.error = originalConsoleError;
  }
});

await record('pollGeneric can throttle changing progress text when a stable logKey is provided', async () => {
  const originalConsoleError = console.error;
  const logs = [];
  console.error = (...args) => { logs.push(args.join(' ')); };
  try {
    let calls = 0;
    const result = await pollingMod.pollGeneric(
      { poll_interval_seconds: 0.01, poll_progress_log_interval_ms: 1000 },
      async () => {
        calls += 1;
        if (calls >= 4) return { done: true, result: { ok: true, reason: 'done', data: { calls } } };
        return { done: false, logMsg: `changing-state-${calls}`, logKey: 'stable-state' };
      },
      1,
      'stable-logkey-poll-check',
    );

    assert.equal(result.ok, true);
    assert.equal(calls, 4);
    const progressLogs = logs.filter((line) => line.includes('[stable-logkey-poll-check] changing-state-'));
    assert.equal(progressLogs.length, 1);
    assert.equal(progressLogs[0].includes('changing-state-1'), true);
  } finally {
    console.error = originalConsoleError;
  }
});

await record('ACP session rate-limit ownership is centralized in rate-limit service', async () => {
  const rateLimitMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/rate-limit.js');

  const exhausted = await rateLimitMod.processSessionRateLimit(
    { rate_limit: { max_pauses_per_module: 1, cooldown_hours: 0 } },
    {
      run_id: 'run-session-monitor-rate-limit-1',
      attempt: 2,
      dispatch_id: 'dispatch-session-monitor-rate-limit-1',
      gateway_label: 'session-monitor-rate-limit-gateway',
      session_key: 'agent:main:acp:session-monitor-rate-limit-1',
      detail: 'provider overloaded',
      transcript: { eventCount: 3, lastDetail: 'rate limited' },
    },
    {
      pauseCount: 2,
      maxPauses: 1,
    },
  );

  assert.equal(exhausted.exhausted, true);
  assert.equal(exhausted.result.reason, 'rate_limit_exhausted');
  assert.equal(exhausted.result.rate_limit_exhausted, true);
  assert.equal(exhausted.result.run_id, 'run-session-monitor-rate-limit-1');
  assert.equal(exhausted.result.attempt, 2);
  assert.equal(exhausted.result.dispatch_id, 'dispatch-session-monitor-rate-limit-1');
  assert.equal(exhausted.result.gateway_label, 'session-monitor-rate-limit-gateway');
  assert.equal(exhausted.result.session_key, 'agent:main:acp:session-monitor-rate-limit-1');
  assert.deepEqual(exhausted.result.rate_limit_status, {
    run_id: 'run-session-monitor-rate-limit-1',
    attempt: 2,
    dispatch_id: 'dispatch-session-monitor-rate-limit-1',
    gateway_label: 'session-monitor-rate-limit-gateway',
    session_key: 'agent:main:acp:session-monitor-rate-limit-1',
    detail: 'provider overloaded',
    transcript: { eventCount: 3, lastDetail: 'rate limited' },
  });
  assert.deepEqual(exhausted.result.status, exhausted.result.rate_limit_status);
  assert.deepEqual(exhausted.status, exhausted.result.rate_limit_status);
  assert.equal(exhausted.result.detail, 'provider overloaded');
  assert.deepEqual(exhausted.result.transcript, { eventCount: 3, lastDetail: 'rate limited' });
});

await record('shared session rate-limit ownership can preserve cooldown budget across retries', async () => {
  const rateLimitMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/rate-limit.js');

  const pauseState = rateLimitMod.createRateLimitPauseState();
  let calls = 0;
  const sharedStatus = {
    run_id: 'run-shared-session-rate-limit-1',
    attempt: 1,
    dispatch_id: 'dispatch-shared-session-rate-limit-1',
    gateway_label: 'shared-session-rate-limit-gateway',
    session_key: 'agent:one',
  };

  const first = await rateLimitMod.withSessionRateLimitRecovery(
    { rate_limit: { max_pauses_per_module: 2, cooldown_hours: 0 } },
    async () => {
      calls += 1;
      if (calls === 1) return { ok: false, reason: 'rate_limited', status: sharedStatus };
      return { ok: true, reason: 'target_reached', status: sharedStatus };
    },
    {
      sleepFn: async () => {},
      pauseState,
    },
  );

  const second = await rateLimitMod.withSessionRateLimitRecovery(
    { rate_limit: { max_pauses_per_module: 2, cooldown_hours: 0 } },
    async () => ({ ok: false, reason: 'rate_limited', status: sharedStatus }),
    {
      sleepFn: async () => {},
      pauseState,
    },
  );

  assert.equal(first.ok, true);
  assert.equal(second.run_id, sharedStatus.run_id);
  assert.equal(second.attempt, sharedStatus.attempt);
  assert.equal(second.dispatch_id, sharedStatus.dispatch_id);
  assert.equal(second.gateway_label, sharedStatus.gateway_label);
  assert.equal(second.session_key, sharedStatus.session_key);
  assert.equal(second.rate_limit_status.run_id, sharedStatus.run_id);
  assert.equal(second.rate_limit_status.attempt, sharedStatus.attempt);
  assert.equal(second.rate_limit_status.dispatch_id, sharedStatus.dispatch_id);
  assert.equal(second.rate_limit_status.gateway_label, sharedStatus.gateway_label);
  assert.equal(second.rate_limit_status.session_key, sharedStatus.session_key);
  assert.equal(second.reason, 'rate_limit_exhausted');
  assert.equal(second.rate_limit_exhausted, true);
  assert.equal(pauseState.count, 3);
  assert.equal(second.rate_limit_pauses, 3);
  assert.equal(second.max_rate_limit_pauses, 2);
});

await record('shared session rate-limit ownership can build canonical exhausted exits directly from shared build options', async () => {
  const rateLimitMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/rate-limit.js');

  const result = await rateLimitMod.withSessionRateLimitRecovery(
    { rate_limit: { max_pauses_per_module: 1, cooldown_hours: 0 } },
    async () => ({
      ok: false,
      reason: 'rate_limited',
      status: {
        attempt: 2,
        dispatch_id: 'dispatch-review-rate-limit-1',
        gateway_label: 'reviewer-1',
        session_key: 'session-review-rate-limit-1',
      },
    }),
    {
      sleepFn: async () => {},
      exhaustedResultOptions: ({ status, pauseCount, maxPauses }) => ({
        runIdFallback: 'run-review-rate-limit-1',
        attemptFallback: 2,
        dispatchIdFallback: 'dispatch-review-rate-limit-1',
        gatewayLabelFallback: 'reviewer-1',
        sessionKeyFallback: 'session-review-rate-limit-1',
        exit: 40,
        resultOverrides: {
          review_attempt: 2,
        },
      }),
    },
  );

  assert.equal(result.reason, 'rate_limit_exhausted');
  assert.equal(result.rate_limit_exhausted, true);
  assert.equal(result.exit, 40);
  assert.equal(result.run_id, 'run-review-rate-limit-1');
  assert.equal(result.attempt, 2);
  assert.equal(result.dispatch_id, 'dispatch-review-rate-limit-1');
  assert.equal(result.gateway_label, 'reviewer-1');
  assert.equal(result.session_key, 'session-review-rate-limit-1');
  assert.equal(result.review_attempt, 2);
  assert.equal(result.rate_limit_pauses, 2);
  assert.equal(result.max_rate_limit_pauses, 1);
  assert.equal(result.rate_limit_status.run_id, 'run-review-rate-limit-1');
  assert.equal(result.rate_limit_status.attempt, 2);
  assert.equal(result.rate_limit_status.dispatch_id, 'dispatch-review-rate-limit-1');
  assert.equal(result.rate_limit_status.gateway_label, 'reviewer-1');
  assert.equal(result.rate_limit_status.session_key, 'session-review-rate-limit-1');
});

await record('shared gate rate-limit status normalization centralizes Buster gate fallback correlation', async () => {
  const rateLimitMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/rate-limit.js');

  const normalized = rateLimitMod.buildGateSessionRateLimitStatus(
    {
      reason: 'provider overloaded',
      dispatch_id: 'dispatch-buster-status-1',
      session_key: 'agent:main:acp:buster-gate-1',
    },
    {
      gateId: 'gate:buster',
      gateType: 'buster',
      agentTypeFallback: 'buster',
      runIdFallback: 'run-buster-rate-limit-1',
      attemptFallback: 3,
      dispatchIdFallback: 'dispatch-buster-fallback-1',
      gatewayLabelFallback: 'buster-label-1',
      sessionKeyFallback: 'agent:main:acp:buster-fallback-1',
    },
  );

  assert.equal(normalized.status, 'RATE_LIMITED');
  assert.equal(normalized.gate, 'gate:buster');
  assert.equal(normalized.gate_id, 'gate:buster');
  assert.equal(normalized.gate_type, 'buster');
  assert.equal(normalized.agent_type, 'buster');
  assert.equal(normalized.run_id, 'run-buster-rate-limit-1');
  assert.equal(normalized.attempt, 3);
  assert.equal(normalized.dispatch_id, 'dispatch-buster-status-1');
  assert.equal(normalized.gateway_label, 'dispatch-buster-status-1');
  assert.equal(normalized.session_key, 'agent:main:acp:buster-gate-1');
});

await record('shared gate rate-limit status normalization centralizes review gate fallback correlation', async () => {
  const rateLimitMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/rate-limit.js');

  const normalized = rateLimitMod.buildGateSessionRateLimitStatus(
    {
      reason: 'provider overloaded',
      session_key: 'agent:main:acp:echo-review-1',
    },
    {
      gateId: 'gate:review',
      gateType: 'review',
      agentTypeFallback: 'echo',
      runIdFallback: 'run-review-rate-limit-1',
      attemptFallback: 2,
      dispatchIdFallback: 'dispatch-review-fallback-1',
      gatewayLabelFallback: 'echo-reviewer-1',
      sessionKeyFallback: 'agent:main:acp:echo-review-fallback-1',
    },
  );

  assert.equal(normalized.status, 'RATE_LIMITED');
  assert.equal(normalized.gate, 'gate:review');
  assert.equal(normalized.gate_id, 'gate:review');
  assert.equal(normalized.gate_type, 'review');
  assert.equal(normalized.agent_type, 'echo');
  assert.equal(normalized.run_id, 'run-review-rate-limit-1');
  assert.equal(normalized.attempt, 2);
  assert.equal(normalized.dispatch_id, 'dispatch-review-fallback-1');
  assert.equal(normalized.gateway_label, 'echo-reviewer-1');
  assert.equal(normalized.session_key, 'agent:main:acp:echo-review-1');
});

await record('shared tracked gate recovery preserves cached cooldown correlation through sparse exhausted statuses', async () => {
  const rateLimitMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/rate-limit.js');

  let latestGateDispatchId = null;
  let latestGateGatewayLabel = null;
  let latestGateSessionKey = null;
  let calls = 0;
  const recoveryOptions = rateLimitMod.createTrackedGateSessionRateLimitRecoveryOptions(
    { rate_limit: { max_pauses_per_module: 1, cooldown_hours: 0 } },
    {
      sleepFn: async () => {},
      gateId: 'gate:buster',
      gateType: 'buster',
      agentTypeFallback: 'buster',
      runIdFallback: () => 'run-gate-tracked-rate-limit-1',
      attemptFallback: () => 4,
      dispatchIdFallback: () => latestGateDispatchId,
      gatewayLabelFallback: () => latestGateGatewayLabel,
      sessionKeyFallback: () => latestGateSessionKey,
      exhaustedResultConfig: { exit: 40 },
    },
  );

  const result = await rateLimitMod.withSessionRateLimitRecovery(
    { rate_limit: { max_pauses_per_module: 1, cooldown_hours: 0 } },
    async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: false,
          reason: 'rate_limited',
          status: {
            run_id: 'run-gate-tracked-rate-limit-1',
            attempt: 4,
            dispatch_id: 'dispatch-gate-tracked-rate-limit-1',
            gateway_label: 'gate-reviewer-1',
            session_key: 'agent:main:acp:gate-tracked-rate-limit-1',
          },
        };
      }
      return {
        ok: false,
        reason: 'rate_limited',
        status: {
          run_id: 'run-gate-tracked-rate-limit-1',
          attempt: 4,
          session_key: 'agent:main:acp:gate-tracked-rate-limit-1',
        },
      };
    },
    recoveryOptions,
  );

  assert.equal(result.reason, 'rate_limit_exhausted');
  assert.equal(result.rate_limit_exhausted, true);
  assert.equal(result.exit, 40);
  assert.equal(result.run_id, 'run-gate-tracked-rate-limit-1');
  assert.equal(result.attempt, 4);
  assert.equal(result.dispatch_id, 'dispatch-gate-tracked-rate-limit-1');
  assert.equal(result.gateway_label, 'gate-reviewer-1');
  assert.equal(result.session_key, 'agent:main:acp:gate-tracked-rate-limit-1');
  assert.equal(result.rate_limit_status?.dispatch_id, 'dispatch-gate-tracked-rate-limit-1');
  assert.equal(result.rate_limit_status?.gateway_label, 'gate-reviewer-1');
  assert.equal(result.rate_limit_status?.session_key, 'agent:main:acp:gate-tracked-rate-limit-1');
  assert.deepEqual(recoveryOptions.getTrackedCorrelation(), {
    dispatch_id: 'dispatch-gate-tracked-rate-limit-1',
    gateway_label: 'gate-reviewer-1',
  });
});

await record('shared module rate-limit status normalization centralizes forge fallback correlation', async () => {
  const rateLimitMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/rate-limit.js');

  const normalized = rateLimitMod.buildModuleSessionRateLimitStatus(
    {
      detail: '429 rate limit, retry after 30 seconds',
      session_key: 'agent:main:acp:forge-rate-limit-1',
    },
    {
      moduleId: '01',
      phaseFallback: 'forge',
      agentTypeFallback: 'forge',
      runIdFallback: 'run-forge-rate-limit-1',
      attemptFallback: 4,
      dispatchIdFallback: 'dispatch-forge-rate-limit-1',
      gatewayLabelFallback: 'forge-rate-limit-label-1',
      sessionKeyFallback: 'agent:main:acp:forge-rate-limit-fallback-1',
    },
  );

  assert.equal(normalized.status, 'RATE_LIMITED');
  assert.equal(normalized.module_id, '01');
  assert.equal(normalized.current_phase, 'forge');
  assert.equal(normalized.phase, 'forge');
  assert.equal(normalized.agent_type, 'forge');
  assert.equal(normalized.run_id, 'run-forge-rate-limit-1');
  assert.equal(normalized.attempt, 4);
  assert.equal(normalized.dispatch_id, 'dispatch-forge-rate-limit-1');
  assert.equal(normalized.gateway_label, 'forge-rate-limit-label-1');
  assert.equal(normalized.session_key, 'agent:main:acp:forge-rate-limit-1');
});

await record('pollDual preserves canonical exhaustion correlation when Redis already owns rate-limit recovery', async () => {
  const { runtimeRoot: pollingRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  const pollingMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.js');

  const repoRoot = fs.mkdtempSync(path.join('/home/node/.openclaw/workspace', 'behavior-poll-dual-terminal-owned-rate-limit-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const modulesDir = path.join(swarmDir, 'modules');
  fs.mkdirSync(path.join(modulesDir, '01-scaffold'), { recursive: true });

  const redisModulePath = path.join(repoRoot, 'fake-redis-module.mjs');
  fs.writeFileSync(redisModulePath, `
export default {
  async readCompletion() {
    return {
      status: 'FAIL',
      outcome: 'RATE_LIMITED',
      source: 'buster-pipeline',
      reason: 'max_pauses_exceeded',
      summary: 'max_pauses_exceeded',
      run_id: 'run-poll-dual-terminal-owned-rate-limit-1',
      attempt: 4,
      dispatch_id: 'dispatch-buster-rate-limit-1',
      session_key: 'agent:buster:module-rate-limit',
      max_rate_limit_pauses: 3,
    };
  },
};
`);

  const result = await pollingMod.pollDual({
    project: 'behavior-poll-dual-terminal-owned-rate-limit',
    paths: { swarm_dir: swarmDir, modules_dir: modulesDir },
    agents: {
      buster: {
        dispatch: 'redis',
        redis_js_path: redisModulePath,
      },
    },
    poll_interval_seconds: 0.01,
  }, '01-scaffold', '01', ['PASS'], 1, {
    run_id: 'run-poll-dual-terminal-owned-rate-limit-1',
    attempt: 1,
    dispatch_id: 'dispatch-stale-module-rate-limit-1',
    gateway_label: 'stale-module-label',
    session_key: 'agent:buster:stale-module-rate-limit',
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'rate_limit_exhausted');
  assert.equal(result.rate_limit_exhausted, true);
  assert.equal(result.run_id, 'run-poll-dual-terminal-owned-rate-limit-1');
  assert.equal(result.attempt, 4);
  assert.equal(result.dispatch_id, 'dispatch-buster-rate-limit-1');
  assert.equal(result.gateway_label, 'dispatch-buster-rate-limit-1');
  assert.equal(result.session_key, 'agent:buster:module-rate-limit');
  assert.equal(result.max_rate_limit_pauses, 3);
  assert.equal(result.status?.status, 'RATE_LIMITED');
  assert.equal(result.status?.module_id, '01');
  assert.equal(result.status?.max_rate_limit_pauses, 3);
  assert.equal(result.rate_limit_status?.status, 'RATE_LIMITED');
  assert.equal(result.rate_limit_status?.module_id, '01');
  assert.equal(result.rate_limit_status?.max_rate_limit_pauses, 3);
  assert.equal(result.status?.gateway_label, 'dispatch-buster-rate-limit-1');
  assert.equal(result.status?.dispatch_id, 'dispatch-buster-rate-limit-1');
  assert.equal(result.status?.session_key, 'agent:buster:module-rate-limit');
});

await record('pollDual preserves canonical module cooldown correlation on raw Redis rate-limited returns', async () => {
  const { runtimeRoot: pollingRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  const pollingMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.js');

  const repoRoot = fs.mkdtempSync(path.join('/home/node/.openclaw/workspace', 'behavior-poll-dual-redis-rate-limited-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const modulesDir = path.join(swarmDir, 'modules');
  fs.mkdirSync(path.join(modulesDir, '01-scaffold'), { recursive: true });

  const redisModulePath = path.join(repoRoot, 'fake-redis-rate-limited-module.mjs');
  fs.writeFileSync(redisModulePath, `
export default {
  async readCompletion() {
    return {
      status: 'FAIL',
      outcome: 'RATE_LIMITED',
      source: 'agent',
      reason: 'provider overloaded',
      attempt: 4,
      dispatch_id: 'dispatch-buster-raw-rate-limit-1',
      session_key: 'agent:buster:module-raw-rate-limit',
    };
  },
};
`);

  const result = await pollingMod.pollDual({
    project: 'behavior-poll-dual-redis-rate-limited',
    repo_root: repoRoot,
    paths: { swarm_dir: swarmDir, modules_dir: modulesDir },
    agents: {
      buster: {
        dispatch: 'redis',
        redis_js_path: redisModulePath,
      },
    },
    poll_interval_seconds: 0.01,
  }, '01-scaffold', '01', ['PASS'], 1, {
    run_id: 'run-poll-dual-redis-rate-limited-1',
    attempt: 2,
    dispatch_id: 'dispatch-stale-module-rate-limit-1',
    gateway_label: 'stale-module-label',
    session_key: 'agent:buster:stale-module-rate-limit',
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'rate_limited');
  assert.equal(result.status?.status, 'RATE_LIMITED');
  assert.equal(result.status?.module_id, '01');
  assert.equal(result.status?.current_phase, 'buster');
  assert.equal(result.status?.agent_type, 'buster');
  assert.equal(result.status?.run_id, 'run-poll-dual-redis-rate-limited-1');
  assert.equal(result.status?.attempt, 4);
  assert.equal(result.status?.dispatch_id, 'dispatch-buster-raw-rate-limit-1');
  assert.equal(result.status?.gateway_label, 'dispatch-buster-raw-rate-limit-1');
  assert.equal(result.status?.session_key, 'agent:buster:module-raw-rate-limit');
});

await record('pollDual preserves canonical module cooldown correlation on git-backed RATE_LIMITED status', async () => {
  const { runtimeRoot: pollingRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  const pollingMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.js');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-poll-dual-git-rate-limited-'));
  execFileSync('git', ['init'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'nova@example.test'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Nova Test'], { cwd: repoRoot, stdio: 'ignore' });
  fs.writeFileSync(path.join(repoRoot, 'README.md'), 'ok\n');
  execFileSync('git', ['add', 'README.md'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: repoRoot, stdio: 'ignore' });

  const swarmDir = path.join(repoRoot, '.swarm');
  const modulesDir = path.join(swarmDir, 'modules');
  const moduleDir = path.join(modulesDir, '01-scaffold');
  fs.mkdirSync(moduleDir, { recursive: true });
  fs.writeFileSync(path.join(moduleDir, 'status.json'), JSON.stringify({
    module_id: '01',
    status: 'RATE_LIMITED',
    current_phase: 'buster',
    active_agent: {
      dispatch_id: 'dispatch-buster-git-rate-limit-1',
      gateway_label: 'buster-git-label-1',
      session_key: 'agent:buster:module-git-rate-limit',
    },
    history: [],
  }, null, 2));

  const redisModulePath = path.join(repoRoot, 'fake-redis-empty-module.mjs');
  fs.writeFileSync(redisModulePath, `export default { async readCompletion() { return null; } };\n`);

  const result = await pollingMod.pollDual({
    project: 'behavior-poll-dual-git-rate-limited',
    repo_root: repoRoot,
    paths: { swarm_dir: swarmDir, modules_dir: modulesDir },
    agents: {
      buster: {
        dispatch: 'redis',
        redis_js_path: redisModulePath,
      },
    },
    poll_interval_seconds: 0.01,
  }, '01-scaffold', '01', ['PASS'], 1, {
    run_id: 'run-poll-dual-git-rate-limited-1',
    attempt: 3,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'rate_limited');
  assert.equal(result.status?.status, 'RATE_LIMITED');
  assert.equal(result.status?.module_id, '01');
  assert.equal(result.status?.current_phase, 'buster');
  assert.equal(result.status?.agent_type, 'buster');
  assert.equal(result.status?.run_id, 'run-poll-dual-git-rate-limited-1');
  assert.equal(result.status?.attempt, 3);
  assert.equal(result.status?.dispatch_id, 'dispatch-buster-git-rate-limit-1');
  assert.equal(result.status?.gateway_label, 'buster-git-label-1');
  assert.equal(result.status?.session_key, 'agent:buster:module-git-rate-limit');
});

await record('pollForSessionEnd checks immediately before waiting the first interval', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-session-poll-'));
  execFileSync('git', ['init'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'nova@example.test'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Nova Test'], { cwd: repoRoot, stdio: 'ignore' });
  fs.writeFileSync(path.join(repoRoot, 'README.md'), 'ok\n');
  execFileSync('git', ['add', 'README.md'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: repoRoot, stdio: 'ignore' });

  const gateway = await startGatewayServer(async () => ({ result: { details: { acp: { state: 'closed' } } } }));
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const prevGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  process.env.OPENCLAW_GATEWAY_URL = gateway.url;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    gitMod.setRepoRoot(repoRoot);
    const config = {
      repo_root: repoRoot,
      project: 'behavior-demo',
      poll_interval_seconds: 0.2,
      session_end_grace_ms: 0,
      paths: { swarm_dir: path.join(repoRoot, '.swarm') },
    };
    lifecycleTestModBase.trackAgent(config, 'forge-immediate', 'session-immediate', null, 'forge-immediate', null, { moduleId: '01', runtime: 'acp' });

    const started = Date.now();
    const result = await pollingMod.pollForSessionEnd(config, 'forge-immediate', 1, 'session-immediate-check');
    const elapsedMs = Date.now() - started;

    assert.equal(result.completed, true);
    assert.equal(result.hasChanges, false);
    assert.equal(result.reason, 'session_closed_no_changes');
    assert(elapsedMs < 250, `expected immediate session-end poll resolution, got ${elapsedMs}ms`);
  } finally {
    lifecycleTestModBase.untrackAgent('forge-immediate');
    await gateway.close();
    if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    if (prevGatewayToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = prevGatewayToken;
  }
});

await record('pollForSessionEnd throttles repeated unchanged active-session logs', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-session-throttle-'));
  execFileSync('git', ['init'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'nova@example.test'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Nova Test'], { cwd: repoRoot, stdio: 'ignore' });
  fs.writeFileSync(path.join(repoRoot, 'README.md'), 'ok\n');
  execFileSync('git', ['add', 'README.md'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: repoRoot, stdio: 'ignore' });

  let statusCalls = 0;
  const gateway = await startGatewayServer(async () => {
    statusCalls += 1;
    const state = statusCalls >= 4 ? 'closed' : 'running';
    return { result: { details: { acp: { state } } } };
  });
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const prevGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  const originalConsoleError = console.error;
  const logs = [];

  process.env.OPENCLAW_GATEWAY_URL = gateway.url;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;
  console.error = (...args) => { logs.push(args.join(' ')); };

  try {
    gitMod.setRepoRoot(repoRoot);
    const config = {
      repo_root: repoRoot,
      project: 'behavior-demo',
      poll_interval_seconds: 0.01,
      session_end_grace_ms: 0,
      session_progress_log_interval_ms: 1000,
      paths: { swarm_dir: path.join(repoRoot, '.swarm') },
    };
    lifecycleTestModBase.trackAgent(config, 'forge-throttle', 'session-throttle', null, 'forge-throttle', null, { moduleId: '01', runtime: 'acp' });

    const result = await pollingMod.pollForSessionEnd(config, 'forge-throttle', 1, 'session-throttle-check');

    assert.equal(result.completed, true);
    const activeLogs = logs.filter((line) => line.includes('[session-throttle-check] Session active |'));
    assert.equal(activeLogs.length, 1);
  } finally {
    console.error = originalConsoleError;
    lifecycleTestModBase.untrackAgent('forge-throttle');
    await gateway.close();
    if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    if (prevGatewayToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = prevGatewayToken;
  }
});

await record('pollForSessionEnd keeps active-session logs throttled even when elapsed text changes', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-session-throttle-changing-elapsed-'));
  execFileSync('git', ['init'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'nova@example.test'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Nova Test'], { cwd: repoRoot, stdio: 'ignore' });
  fs.writeFileSync(path.join(repoRoot, 'README.md'), 'ok\n');
  execFileSync('git', ['add', 'README.md'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: repoRoot, stdio: 'ignore' });

  let statusCalls = 0;
  const gateway = await startGatewayServer(async () => {
    statusCalls += 1;
    const state = statusCalls >= 4 ? 'closed' : 'running';
    return { result: { details: { acp: { state } } } };
  });
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const prevGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  const originalConsoleError = console.error;
  const originalDateNow = Date.now;
  const logs = [];
  let fakeNow = 1_700_000_000_000;

  process.env.OPENCLAW_GATEWAY_URL = gateway.url;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;
  console.error = (...args) => { logs.push(args.join(' ')); };
  Date.now = () => {
    const current = fakeNow;
    fakeNow += 1100;
    return current;
  };

  try {
    gitMod.setRepoRoot(repoRoot);
    const config = {
      repo_root: repoRoot,
      project: 'behavior-demo',
      poll_interval_seconds: 0.01,
      session_end_grace_ms: 0,
      session_progress_log_interval_ms: 60000,
      paths: { swarm_dir: path.join(repoRoot, '.swarm') },
    };
    lifecycleTestModBase.trackAgent(config, 'forge-throttle-elapsed', 'session-throttle-elapsed', null, 'forge-throttle-elapsed', null, { moduleId: '01', runtime: 'acp' });

    const result = await pollingMod.pollForSessionEnd(config, 'forge-throttle-elapsed', 1, 'session-throttle-elapsed-check');

    assert.equal(result.completed, true);
    const activeLogs = logs.filter((line) => line.includes('[session-throttle-elapsed-check] Session active |'));
    assert.equal(activeLogs.length, 1);
  } finally {
    Date.now = originalDateNow;
    console.error = originalConsoleError;
    lifecycleTestModBase.untrackAgent('forge-throttle-elapsed');
    await gateway.close();
    if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    if (prevGatewayToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = prevGatewayToken;
  }
});

await record('pollForSessionEnd does not send timeout nudges after the session already closed', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-session-closed-no-nudge-'));
  execFileSync('git', ['init'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'nova@example.test'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Nova Test'], { cwd: repoRoot, stdio: 'ignore' });
  fs.writeFileSync(path.join(repoRoot, 'README.md'), 'ok\n');
  execFileSync('git', ['add', 'README.md'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: repoRoot, stdio: 'ignore' });

  const requests = [];
  const gateway = await startGatewayServer(async ({ body }) => {
    requests.push(body);
    if (body?.tool === 'session_status') return { result: { details: { acp: { state: 'closed' } } } };
    if (body?.tool === 'sessions_send') return { result: { ok: true } };
    return { result: {} };
  });
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const prevGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  process.env.OPENCLAW_GATEWAY_URL = gateway.url;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    gitMod.setRepoRoot(repoRoot);
    const config = {
      repo_root: repoRoot,
      project: 'behavior-demo',
      poll_interval_seconds: 0.01,
      session_end_grace_ms: 80,
      session_nudge_threshold: 0,
      paths: { swarm_dir: path.join(repoRoot, '.swarm') },
    };
    lifecycleTestModBase.trackAgent(config, 'forge-closed-no-nudge', 'session-closed-no-nudge', null, 'forge-closed-no-nudge', null, { moduleId: '01', runtime: 'acp' });

    const result = await pollingMod.pollForSessionEnd(config, 'forge-closed-no-nudge', 1, 'session-closed-no-nudge');

    assert.equal(result.completed, true);
    assert.equal(result.reason, 'session_closed_no_changes');
    const sendRequests = requests.filter((req) => req?.tool === 'sessions_send');
    assert.equal(sendRequests.length, 0);
  } finally {
    lifecycleTestModBase.untrackAgent('forge-closed-no-nudge');
    await gateway.close();
    if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    if (prevGatewayToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = prevGatewayToken;
  }
});

await record('pollForSessionEnd sends at most one timeout nudge when sessions_send fails', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-session-single-nudge-'));
  execFileSync('git', ['init'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'nova@example.test'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Nova Test'], { cwd: repoRoot, stdio: 'ignore' });
  fs.writeFileSync(path.join(repoRoot, 'README.md'), 'ok\n');
  execFileSync('git', ['add', 'README.md'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: repoRoot, stdio: 'ignore' });

  const requests = [];
  const gateway = await startGatewayServer(async ({ body }) => {
    requests.push(body);
    if (body?.tool === 'session_status') return { result: { details: { acp: { state: 'running' } } } };
    if (body?.tool === 'sessions_send') return { error: 'send failed' };
    return { result: {} };
  });
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const prevGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  process.env.OPENCLAW_GATEWAY_URL = gateway.url;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    gitMod.setRepoRoot(repoRoot);
    const config = {
      repo_root: repoRoot,
      project: 'behavior-demo',
      poll_interval_seconds: 0.01,
      session_end_grace_ms: 0,
      session_nudge_threshold: 0,
      paths: { swarm_dir: path.join(repoRoot, '.swarm') },
    };
    lifecycleTestModBase.trackAgent(config, 'forge-single-nudge', 'session-single-nudge', null, 'forge-single-nudge', null, { moduleId: '01', runtime: 'acp' });

    const result = await pollingMod.pollForSessionEnd(config, 'forge-single-nudge', 0.003, 'session-single-nudge');

    assert.equal(result.completed, false);
    assert.equal(result.reason, 'timeout');
    const sendRequests = requests.filter((req) => req?.tool === 'sessions_send');
    const statusRequests = requests.filter((req) => req?.tool === 'session_status');
    assert.equal(sendRequests.length, 1);
    assert(statusRequests.length >= 2, `expected repeated session_status polling, got ${statusRequests.length}`);
  } finally {
    lifecycleTestModBase.untrackAgent('forge-single-nudge');
    await gateway.close();
    if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    if (prevGatewayToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = prevGatewayToken;
  }
});

await record('pollForFile throttles repeated ACP monitor progress logs even when counters change each cycle', async () => {
  const { runtimeRoot: pollingRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(pollingRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const pollingTestMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.js');
  const lifecycleTestMod = await importRuntimeModule(pollingRuntimeRoot, '/app/common/pipeline/agents/lifecycle.js');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-file-poll-throttle-'));
  const transcriptPath = path.join(repoRoot, 'review-throttle.jsonl');
  fs.writeFileSync(transcriptPath, '');

  const gateway = await startGatewayServer(async ({ body }) => {
    if (body?.tool === 'session_status') return { result: { details: { acp: { state: 'running' } } } };
    return { result: {} };
  });
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const prevGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  const originalConsoleError = console.error;
  const logs = [];

  process.env.OPENCLAW_GATEWAY_URL = gateway.url;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;
  console.error = (...args) => { logs.push(args.join(' ')); };

  try {
    const config = {
      project: 'behavior-file-poll-throttle',
      repo_root: repoRoot,
      poll_interval_seconds: 0.01,
      poll_progress_log_interval_ms: 1000,
      paths: { swarm_dir: path.join(repoRoot, '.swarm') },
    };
    lifecycleTestMod.trackAgent(config, 'pipeline-review-throttle', 'agent:main:acp:pipeline-review-throttle', 'codex', 'pipeline-review-throttle', transcriptPath, {
      runtime: 'acp',
      moduleId: 'pipeline-review',
      telemetry_module_id: 'pipeline-review',
    });

    const result = await pollingTestMod.pollForFile(
      config,
      path.join(repoRoot, 'missing-output.md'),
      0.003,
      'Pipeline Review Throttle',
      'pipeline-review-throttle',
    );

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'timeout');
    const progressLogs = logs.filter((line) => line.includes('[Pipeline Review Throttle] session=running unknown='));
    assert.equal(progressLogs.length, 1);
  } finally {
    console.error = originalConsoleError;
    lifecycleTestMod.untrackAgent('pipeline-review-throttle');
    await gateway.close();
    if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    if (prevGatewayToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = prevGatewayToken;
  }
});

await record('pollForFile preserves transcript state when an ACP session ends without producing output', async () => {
  const { runtimeRoot: pollingRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(pollingRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const pollingTestMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.js');
  const lifecycleTestMod = await importRuntimeModule(pollingRuntimeRoot, '/app/common/pipeline/agents/lifecycle.js');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-file-poll-no-output-'));
  const transcriptPath = path.join(repoRoot, 'review-transcript.jsonl');
  fs.writeFileSync(transcriptPath, `${JSON.stringify({ ts: '2026-04-13T06:00:00.000Z', kind: 'assistant', text: 'still working' })}\n`);

  const gateway = await startGatewayServer(async ({ body }) => {
    if (body?.tool === 'session_status') return { result: { details: { acp: { state: 'closed' } } } };
    return { result: {} };
  });
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const prevGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  process.env.OPENCLAW_GATEWAY_URL = gateway.url;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    const config = {
      project: 'behavior-file-poll-no-output',
      repo_root: repoRoot,
      poll_interval_seconds: 0.01,
      paths: { swarm_dir: path.join(repoRoot, '.swarm') },
    };
    lifecycleTestMod.trackAgent(config, 'pipeline-review-session', 'agent:main:acp:pipeline-review-session', 'codex', 'pipeline-review-session', transcriptPath, {
      runtime: 'acp',
      moduleId: 'pipeline-review',
      telemetry_module_id: 'pipeline-review',
    });

    const result = await pollingTestMod.pollForFile(
      config,
      path.join(repoRoot, 'missing-output.md'),
      1,
      'Pipeline Review',
      'pipeline-review-session',
    );

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'session_ended_no_output');
    assert.equal(result.status.session_key, 'agent:main:acp:pipeline-review-session');
    assert.equal(result.transcript?.eventCount, 1);
    assert.equal(result.transcript?.newLines?.length, 1);
  } finally {
    lifecycleTestMod.untrackAgent('pipeline-review-session');
    await gateway.close();
    if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    if (prevGatewayToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = prevGatewayToken;
  }
});

await record('pollForFile preserves tracked rate-limit correlation on ACP-owned returns', async () => {
  const { runtimeRoot: pollingRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  const pollingRuntimeCoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const pollingTestMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.js');
  const lifecycleTestMod = await importRuntimeModule(pollingRuntimeRoot, '/app/common/pipeline/agents/lifecycle.js');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-file-poll-rate-limit-'));
  const transcriptPath = path.join(repoRoot, 'review-rate-limit.jsonl');
  fs.writeFileSync(transcriptPath, `${JSON.stringify({ ts: '2026-04-15T08:00:00.000Z', kind: 'lifecycle', phase: 'error', data: { error: '429 rate limit, retry after 60 seconds' } })}\n`);

  const runId = 'run-file-poll-rate-limit-1';
  const gateway = await startGatewayServer(async ({ body }) => {
    if (body?.tool === 'session_status') return { result: { details: { acp: { state: 'running' } } } };
    return { result: {} };
  });
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const prevGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  process.env.OPENCLAW_GATEWAY_URL = gateway.url;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    const config = {
      project: 'behavior-file-poll-rate-limit',
      repo_root: repoRoot,
      poll_interval_seconds: 0.01,
      _runId: runId,
      run_id: runId,
      _runStats: pollingRuntimeCoreMod.createRunStats('2026-04-15T08:00:00.000Z'),
      paths: { swarm_dir: path.join(repoRoot, '.swarm') },
    };
    lifecycleTestMod.trackAgent(config, 'review-rate-limit-session', 'agent:main:acp:review-rate-limit-session', 'codex', 'reviewer-01', transcriptPath, {
      runtime: 'acp',
      telemetry_gate_id: 'gate:review',
      telemetry_gate_type: 'review',
      telemetry_dispatch_id: 'dispatch-review-rate-limit-1',
      telemetry_attempt: 4,
    });

    const result = await pollingTestMod.pollForFile(
      config,
      path.join(repoRoot, 'missing-review.md'),
      1,
      "Review 'gate:review'",
      'review-rate-limit-session',
    );

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'rate_limited');
    assert.equal(result.status.run_id, runId);
    assert.equal(result.status.gate_id, 'gate:review');
    assert.equal(result.status.gate_type, 'review');
    assert.equal(result.status.current_phase, 'review');
    assert.equal(result.status.agent_type, 'review');
    assert.equal(result.status.attempt, 4);
    assert.equal(result.status.dispatch_id, 'dispatch-review-rate-limit-1');
    assert.equal(result.status.gateway_label, 'reviewer-01');
    assert.equal(result.status.session_key, 'agent:main:acp:review-rate-limit-session');
    assert.equal(result.status.reason, '429 rate limit, retry after 60 seconds');
    assert.equal(result.status.detail, '429 rate limit, retry after 60 seconds');
  } finally {
    lifecycleTestMod.untrackAgent('review-rate-limit-session');
    await gateway.close();
    if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    if (prevGatewayToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = prevGatewayToken;
  }
});

await record('pollForFile preserves tracked pipeline-review rate-limit identity on ACP-owned returns', async () => {
  const { runtimeRoot: pollingRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  const pollingRuntimeCoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const pollingTestMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.js');
  const lifecycleTestMod = await importRuntimeModule(pollingRuntimeRoot, '/app/common/pipeline/agents/lifecycle.js');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-pipeline-review-file-poll-rate-limit-'));
  const transcriptPath = path.join(repoRoot, 'pipeline-review-rate-limit.jsonl');
  fs.writeFileSync(transcriptPath, `${JSON.stringify({ ts: '2026-04-16T03:30:00.000Z', kind: 'lifecycle', phase: 'error', data: { error: '429 rate limit, retry after 30 seconds' } })}\n`);

  const runId = 'run-pipeline-review-file-poll-rate-limit-1';
  const gateway = await startGatewayServer(async ({ body }) => {
    if (body?.tool === 'session_status') return { result: { details: { acp: { state: 'running' } } } };
    return { result: {} };
  });
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const prevGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  process.env.OPENCLAW_GATEWAY_URL = gateway.url;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    const config = {
      project: 'behavior-pipeline-review-file-poll-rate-limit',
      repo_root: repoRoot,
      poll_interval_seconds: 0.01,
      _runId: runId,
      run_id: runId,
      _runStats: pollingRuntimeCoreMod.createRunStats('2026-04-16T03:30:00.000Z'),
      paths: { swarm_dir: path.join(repoRoot, '.swarm') },
    };
    lifecycleTestMod.trackAgent(config, 'pipeline-review-test-session', 'agent:main:acp:pipeline-review-test-session', 'echo', 'pipeline-review-telemetry-01', transcriptPath, {
      runtime: 'acp',
      telemetry_module_id: 'pipeline-review',
      telemetry_agent_type: 'echo',
      telemetry_attempt: 5,
    });

    const result = await pollingTestMod.pollForFile(
      config,
      path.join(repoRoot, 'missing-pipeline-review.md'),
      1,
      'Pipeline Review',
      'pipeline-review-test-session',
    );

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'rate_limited');
    assert.equal(result.status.run_id, runId);
    assert.equal(result.status.module_id, 'pipeline-review');
    assert.equal(result.status.current_phase, 'echo');
    assert.equal(result.status.agent_type, 'echo');
    assert.equal(result.status.attempt, 5);
    assert.equal(result.status.dispatch_id, null);
    assert.equal(result.status.gateway_label, 'pipeline-review-telemetry-01');
    assert.equal(result.status.session_key, 'agent:main:acp:pipeline-review-test-session');
    assert.equal(result.status.reason, '429 rate limit, retry after 30 seconds');
    assert.equal(result.status.detail, '429 rate limit, retry after 30 seconds');
  } finally {
    lifecycleTestMod.untrackAgent('pipeline-review-test-session');
    await gateway.close();
    if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    if (prevGatewayToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = prevGatewayToken;
  }
});

await record('pollForFile preserves tracked case-study rate-limit identity on ACP-owned returns', async () => {
  const { runtimeRoot: pollingRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  const pollingRuntimeCoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const pollingTestMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.js');
  const lifecycleTestMod = await importRuntimeModule(pollingRuntimeRoot, '/app/common/pipeline/agents/lifecycle.js');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-case-study-file-poll-rate-limit-'));
  const transcriptPath = path.join(repoRoot, 'case-study-rate-limit.jsonl');
  fs.writeFileSync(transcriptPath, `${JSON.stringify({ ts: '2026-04-16T03:35:00.000Z', kind: 'lifecycle', phase: 'error', data: { error: '429 rate limit, retry after 45 seconds' } })}\n`);

  const runId = 'run-case-study-file-poll-rate-limit-1';
  const gateway = await startGatewayServer(async ({ body }) => {
    if (body?.tool === 'session_status') return { result: { details: { acp: { state: 'running' } } } };
    return { result: {} };
  });
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const prevGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  process.env.OPENCLAW_GATEWAY_URL = gateway.url;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    const config = {
      project: 'behavior-case-study-file-poll-rate-limit',
      repo_root: repoRoot,
      poll_interval_seconds: 0.01,
      _runId: runId,
      run_id: runId,
      _runStats: pollingRuntimeCoreMod.createRunStats('2026-04-16T03:35:00.000Z'),
      paths: { swarm_dir: path.join(repoRoot, '.swarm') },
    };
    lifecycleTestMod.trackAgent(config, 'case-study-test-session', 'agent:main:acp:case-study-test-session', 'echo', 'case-study-telemetry-01', transcriptPath, {
      runtime: 'acp',
      telemetry_module_id: 'case-study',
      telemetry_agent_type: 'echo',
      telemetry_attempt: 6,
    });

    const result = await pollingTestMod.pollForFile(
      config,
      path.join(repoRoot, 'missing-case-study.md'),
      1,
      'Case Study',
      'case-study-test-session',
    );

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'rate_limited');
    assert.equal(result.status.run_id, runId);
    assert.equal(result.status.module_id, 'case-study');
    assert.equal(result.status.current_phase, 'echo');
    assert.equal(result.status.agent_type, 'echo');
    assert.equal(result.status.attempt, 6);
    assert.equal(result.status.dispatch_id, null);
    assert.equal(result.status.gateway_label, 'case-study-telemetry-01');
    assert.equal(result.status.session_key, 'agent:main:acp:case-study-test-session');
    assert.equal(result.status.reason, '429 rate limit, retry after 45 seconds');
    assert.equal(result.status.detail, '429 rate limit, retry after 45 seconds');
  } finally {
    lifecycleTestMod.untrackAgent('case-study-test-session');
    await gateway.close();
    if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    if (prevGatewayToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = prevGatewayToken;
  }
});

await record('pollForSessionEnd recovers ACP rate limits without misclassifying the session as timeout/no-output', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(telemetryRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const telemetryRuntimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const telemetryPollingMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/polling.js');
  const telemetryShutdownMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/common/pipeline/agents/lifecycle.js');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-session-rate-limit-'));
  execFileSync('git', ['init'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'nova@example.test'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Nova Test'], { cwd: repoRoot, stdio: 'ignore' });
  fs.writeFileSync(path.join(repoRoot, 'README.md'), 'ok\n');
  execFileSync('git', ['add', 'README.md'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: repoRoot, stdio: 'ignore' });

  const transcriptPath = path.join(repoRoot, 'session-rate-limit.jsonl');
  fs.writeFileSync(transcriptPath, `${JSON.stringify({ ts: new Date().toISOString(), kind: 'lifecycle', phase: 'error', data: { error: '429 rate limit, retry after 60 seconds' } })}\n`);

  let statusCalls = 0;
  const gateway = await startGatewayServer(async () => {
    statusCalls += 1;
    const state = statusCalls >= 2 ? 'closed' : 'running';
    return { result: { details: { acp: { state } } } };
  });
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const prevGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  process.env.OPENCLAW_GATEWAY_URL = gateway.url;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    const runId = 'run-session-rate-limit-1';
    const config = {
      project: 'behavior-session-rate-limit',
      repo_root: repoRoot,
      telemetry: { enabled: true },
      poll_interval_seconds: 0.01,
      session_end_grace_ms: 0,
      rate_limit: { cooldown_hours: 0, max_pauses_per_module: 1 },
      _logDir: path.join(repoRoot, '.swarm', 'logs'),
      _runLogDir: path.join(repoRoot, '.swarm', 'logs', 'pipeline', 'runs', runId),
      _runId: runId,
      run_id: runId,
      _runStats: telemetryRuntimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      paths: { swarm_dir: path.join(repoRoot, '.swarm') },
    };

    telemetryShutdownMod.trackAgent(config, 'forge-rate-limit', 'session-rate-limit', null, 'forge-rate-limit', transcriptPath, {
      moduleId: 'gate:review',
      telemetry_module_id: null,
      telemetry_gate_id: 'gate:review',
      telemetry_dispatch_id: 'dispatch-review-rate-limit-1',
      runtime: 'acp',
    });

    const result = await telemetryPollingMod.pollForSessionEnd(config, 'forge-rate-limit', 1, 'session-rate-limit-check', {
      moduleId: 'gate:review',
      gateId: 'gate:review',
      gateType: 'review',
      attempt: 1,
      agentType: 'forge',
    });
    await flushAsync();

    assert.equal(result.completed, true);
    assert.equal(result.hasChanges, false);
    assert.equal(result.reason, 'session_closed_no_changes');

    const events = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    const rateLimit = events.find((event) => event.type === 'rate_limit.detected');
    assert(rateLimit, 'missing session poll rate_limit.detected event');
    assert.equal(rateLimit.agent_type, 'forge');
    assert.equal(rateLimit.gate_id, 'gate:review');
    assert.equal(rateLimit.module_id, null);
    assert.equal(rateLimit.gate_type, 'review');
    assert.equal(rateLimit.session_key, 'session-rate-limit');
    assert.equal(rateLimit.dispatch_id, 'dispatch-review-rate-limit-1');
    assert.equal(rateLimit.pause_count, 1);
    assert.equal(rateLimit.max_pauses, 1);
  } finally {
    telemetryShutdownMod.untrackAgent('forge-rate-limit');
    await gateway.close();
    if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    if (prevGatewayToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = prevGatewayToken;
  }
});

await record('pollForSessionEnd preserves tracked rate-limit Discord correlation for gate-owned session polling', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(telemetryRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const telemetryRuntimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const telemetryPollingMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/polling.js');
  const telemetryShutdownMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/common/pipeline/agents/lifecycle.js');

  const scenarios = [
    {
      name: 'review-fix',
      project: 'behavior-session-review-fix-rate-limit-discord',
      runId: 'run-session-review-fix-rate-limit-discord-1',
      trackLabel: 'forge-review-fix-rate-limit',
      trackedGatewayLabel: 'review-fix-forge-01',
      sessionKey: 'session-review-fix-rate-limit',
      transcriptName: 'review-fix-rate-limit.jsonl',
      gateId: 'gate:review',
      gateType: 'review',
      dispatchId: 'dispatch-review-fix-rate-limit-1',
      expectedResumeDescription: 'Resuming gate fix gate:review',
    },
    {
      name: 'buster-fix',
      project: 'behavior-session-buster-fix-rate-limit-discord',
      runId: 'run-session-buster-fix-rate-limit-discord-1',
      trackLabel: 'forge-buster-fix-rate-limit',
      trackedGatewayLabel: 'buster-fix-forge-01',
      sessionKey: 'session-buster-fix-rate-limit',
      transcriptName: 'buster-fix-rate-limit.jsonl',
      gateId: 'gate:buster',
      gateType: 'buster',
      dispatchId: 'dispatch-buster-fix-rate-limit-1',
      expectedResumeDescription: 'Resuming gate fix gate:buster',
    },
  ];

  for (const scenario of scenarios) {
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${scenario.project}-`));
    execFileSync('git', ['init'], { cwd: repoRoot, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'nova@example.test'], { cwd: repoRoot, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Nova Test'], { cwd: repoRoot, stdio: 'ignore' });
    fs.writeFileSync(path.join(repoRoot, 'README.md'), 'ok\n');
    execFileSync('git', ['add', 'README.md'], { cwd: repoRoot, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: repoRoot, stdio: 'ignore' });

    const swarmDir = path.join(repoRoot, '.swarm');
    const logRoot = path.join(swarmDir, 'logs');
    const runLogDir = path.join(logRoot, 'pipeline', 'runs', scenario.runId);
    fs.mkdirSync(runLogDir, { recursive: true });
    const transcriptPath = path.join(repoRoot, scenario.transcriptName);
    fs.writeFileSync(transcriptPath, `${JSON.stringify({ ts: new Date().toISOString(), kind: 'lifecycle', phase: 'error', data: { error: '429 rate limit, retry after 60 seconds' } })}\n`);

    let statusCalls = 0;
    const gateway = await startGatewayServer(async () => {
      statusCalls += 1;
      const state = statusCalls >= 2 ? 'closed' : 'running';
      return { result: { details: { acp: { state } } } };
    });
    const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
    const prevGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

    process.env.OPENCLAW_GATEWAY_URL = gateway.url;
    delete process.env.OPENCLAW_GATEWAY_TOKEN;

    try {
      const config = {
        project: scenario.project,
        repo_root: repoRoot,
        telemetry: { enabled: true },
        poll_interval_seconds: 0.01,
        session_end_grace_ms: 0,
        rate_limit: { cooldown_hours: 0, max_pauses_per_module: 1 },
        _disable_discord_webhooks: true,
        _logDir: logRoot,
        _runLogDir: runLogDir,
        _runId: scenario.runId,
        run_id: scenario.runId,
        _runStats: telemetryRuntimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
        paths: { swarm_dir: swarmDir },
      };

      telemetryShutdownMod.trackAgent(config, scenario.trackLabel, scenario.sessionKey, null, scenario.trackedGatewayLabel, transcriptPath, {
        moduleId: scenario.gateId,
        telemetry_module_id: null,
        telemetry_gate_id: scenario.gateId,
        telemetry_dispatch_id: scenario.dispatchId,
        runtime: 'acp',
      });

      const result = await telemetryPollingMod.pollForSessionEnd(config, scenario.trackLabel, 1, `${scenario.name}-session-rate-limit-check`, {
        gateId: scenario.gateId,
        gateType: scenario.gateType,
        attempt: 1,
        agentType: 'forge',
      });
      await flushAsync();

      assert.equal(result.completed, true, `${scenario.name}: completed`);
      assert.equal(result.reason, 'session_closed_no_changes', `${scenario.name}: completion reason`);

      const discordEntries = fs.readFileSync(path.join(runLogDir, 'discord.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      const pauseEntry = discordEntries.find((entry) => entry.title === '⏳ Rate Limited — Pause 1/1');
      const resumeEntry = discordEntries.find((entry) => entry.title === 'Rate limit cooldown complete');
      assert(pauseEntry, `${scenario.name}: missing pause Discord entry`);
      assert(resumeEntry, `${scenario.name}: missing resume Discord entry`);
      assert.equal(pauseEntry.fields.some((field) => field.name === 'Run ID' && field.value === scenario.runId), true, `${scenario.name}: pause run id`);
      assert.equal(pauseEntry.fields.some((field) => field.name === 'Gate' && field.value === scenario.gateId), true, `${scenario.name}: pause gate id`);
      assert.equal(pauseEntry.fields.some((field) => field.name === 'Gate Type' && field.value === scenario.gateType), true, `${scenario.name}: pause gate type`);
      assert.equal(pauseEntry.fields.some((field) => field.name === 'Phase' && field.value === 'forge'), true, `${scenario.name}: pause phase`);
      assert.equal(pauseEntry.fields.some((field) => field.name === 'Attempt' && field.value === '1'), true, `${scenario.name}: pause attempt`);
      assert.equal(pauseEntry.fields.some((field) => field.name === 'Dispatch' && field.value === scenario.dispatchId), true, `${scenario.name}: pause dispatch`);
      assert.equal(pauseEntry.fields.some((field) => field.name === 'Label' && field.value === scenario.trackedGatewayLabel), true, `${scenario.name}: pause label`);
      assert.equal(pauseEntry.fields.some((field) => field.name === 'Session' && field.value === scenario.sessionKey), true, `${scenario.name}: pause session`);
      assert.equal(resumeEntry.description, scenario.expectedResumeDescription, `${scenario.name}: resume description`);
      assert.equal(resumeEntry.fields.some((field) => field.name === 'Run ID' && field.value === scenario.runId), true, `${scenario.name}: resume run id`);
      assert.equal(resumeEntry.fields.some((field) => field.name === 'Gate' && field.value === scenario.gateId), true, `${scenario.name}: resume gate id`);
      assert.equal(resumeEntry.fields.some((field) => field.name === 'Gate Type' && field.value === scenario.gateType), true, `${scenario.name}: resume gate type`);
      assert.equal(resumeEntry.fields.some((field) => field.name === 'Dispatch' && field.value === scenario.dispatchId), true, `${scenario.name}: resume dispatch`);
      assert.equal(resumeEntry.fields.some((field) => field.name === 'Label' && field.value === scenario.trackedGatewayLabel), true, `${scenario.name}: resume label`);
      assert.equal(resumeEntry.fields.some((field) => field.name === 'Session' && field.value === scenario.sessionKey), true, `${scenario.name}: resume session`);
    } finally {
      telemetryShutdownMod.untrackAgent(scenario.trackLabel);
      await gateway.close();
      if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
      else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
      if (prevGatewayToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
      else process.env.OPENCLAW_GATEWAY_TOKEN = prevGatewayToken;
    }
  }
});

await record('pollForSessionEnd normalizes exhausted gate-fix rate-limit status before returning the terminal session result', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(telemetryRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const telemetryRuntimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const telemetryPollingMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/polling.js');
  const telemetryShutdownMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/common/pipeline/agents/lifecycle.js');

  const scenarios = [
    {
      name: 'review-fix',
      project: 'behavior-session-review-fix-rate-limit-exhausted',
      runId: 'run-session-review-fix-rate-limit-exhausted-1',
      trackLabel: 'forge-review-fix-rate-limit-exhausted',
      trackedGatewayLabel: 'review-fix-forge-01',
      sessionKey: 'session-review-fix-rate-limit-exhausted',
      transcriptName: 'review-fix-rate-limit-exhausted.jsonl',
      gateId: 'gate:review',
      gateType: 'review',
      dispatchId: 'dispatch-review-fix-rate-limit-exhausted-1',
    },
    {
      name: 'buster-fix',
      project: 'behavior-session-buster-fix-rate-limit-exhausted',
      runId: 'run-session-buster-fix-rate-limit-exhausted-1',
      trackLabel: 'forge-buster-fix-rate-limit-exhausted',
      trackedGatewayLabel: 'buster-fix-forge-01',
      sessionKey: 'session-buster-fix-rate-limit-exhausted',
      transcriptName: 'buster-fix-rate-limit-exhausted.jsonl',
      gateId: 'gate:buster',
      gateType: 'buster',
      dispatchId: 'dispatch-buster-fix-rate-limit-exhausted-1',
    },
  ];

  for (const scenario of scenarios) {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${scenario.project}-`));
    execFileSync('git', ['init'], { cwd: repoRoot, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'nova@example.test'], { cwd: repoRoot, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Nova Test'], { cwd: repoRoot, stdio: 'ignore' });
    fs.writeFileSync(path.join(repoRoot, 'README.md'), 'ok\n');
    execFileSync('git', ['add', 'README.md'], { cwd: repoRoot, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: repoRoot, stdio: 'ignore' });

    const transcriptPath = path.join(repoRoot, scenario.transcriptName);
    fs.writeFileSync(transcriptPath, `${JSON.stringify({ ts: new Date().toISOString(), kind: 'lifecycle', phase: 'error', data: { error: '429 rate limit, retry after 60 seconds' } })}\n`);

    const gateway = await startGatewayServer(async () => ({ result: { details: { acp: { state: 'running' } } } }));
    const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
    const prevGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

    process.env.OPENCLAW_GATEWAY_URL = gateway.url;
    delete process.env.OPENCLAW_GATEWAY_TOKEN;

    try {
      const config = {
        project: scenario.project,
        repo_root: repoRoot,
        telemetry: { enabled: true },
        poll_interval_seconds: 0.01,
        session_end_grace_ms: 0,
        rate_limit: { cooldown_hours: 0, max_pauses_per_module: 0 },
        _logDir: path.join(repoRoot, '.swarm', 'logs'),
        _runLogDir: path.join(repoRoot, '.swarm', 'logs', 'pipeline', 'runs', scenario.runId),
        _runId: scenario.runId,
        run_id: scenario.runId,
        _runStats: telemetryRuntimeCoreMod.createRunStats('2026-04-15T00:00:00.000Z'),
        paths: { swarm_dir: path.join(repoRoot, '.swarm') },
      };

      telemetryShutdownMod.trackAgent(config, scenario.trackLabel, scenario.sessionKey, null, scenario.trackedGatewayLabel, transcriptPath, {
        moduleId: scenario.gateId,
        telemetry_module_id: null,
        telemetry_gate_id: scenario.gateId,
        telemetry_dispatch_id: scenario.dispatchId,
        runtime: 'acp',
      });

      const result = await telemetryPollingMod.pollForSessionEnd(config, scenario.trackLabel, 1, `${scenario.name}-session-rate-limit-exhausted`, {
        gateId: scenario.gateId,
        gateType: scenario.gateType,
        attempt: 1,
        agentType: 'forge',
      });

      assert.equal(result.ok, false, `${scenario.name}: ok`);
      assert.equal(result.reason, 'rate_limit_exhausted', `${scenario.name}: reason`);
      assert.equal(result.rate_limit_exhausted, true, `${scenario.name}: exhausted flag`);
      assert.equal(result.run_id, scenario.runId, `${scenario.name}: returned run id`);
      assert.equal(result.attempt, 1, `${scenario.name}: returned attempt`);
      assert.equal(result.dispatch_id, scenario.dispatchId, `${scenario.name}: returned dispatch`);
      assert.equal(result.gateway_label, scenario.trackedGatewayLabel, `${scenario.name}: returned label`);
      assert.equal(result.session_key, scenario.sessionKey, `${scenario.name}: returned session`);
      assert.equal(result.status?.status, 'RATE_LIMITED', `${scenario.name}: top-level status`);
      assert.equal(result.rate_limit_status?.status, 'RATE_LIMITED', `${scenario.name}: nested status`);
      assert.equal(result.rate_limit_status?.run_id, scenario.runId, `${scenario.name}: run id`);
      assert.equal(result.rate_limit_status?.gate_id, scenario.gateId, `${scenario.name}: gate id`);
      assert.equal(result.rate_limit_status?.gate_type, scenario.gateType, `${scenario.name}: gate type`);
      assert.equal(result.rate_limit_status?.agent_type, 'forge', `${scenario.name}: agent type`);
      assert.equal(result.rate_limit_status?.attempt, 1, `${scenario.name}: attempt`);
      assert.equal(result.rate_limit_status?.dispatch_id, scenario.dispatchId, `${scenario.name}: dispatch`);
      assert.equal(result.rate_limit_status?.gateway_label, scenario.trackedGatewayLabel, `${scenario.name}: label`);
      assert.equal(result.rate_limit_status?.session_key, scenario.sessionKey, `${scenario.name}: session`);
    } finally {
      telemetryShutdownMod.untrackAgent(scenario.trackLabel);
      await gateway.close();
      if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
      else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
      if (prevGatewayToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
      else process.env.OPENCLAW_GATEWAY_TOKEN = prevGatewayToken;
    }
  }
});

await record('pollForSessionEnd keeps gate-backed transcript and progress telemetry gate-scoped instead of overloading module_id', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(telemetryRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const telemetryRuntimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const telemetryPollingMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/polling.js');
  const telemetryShutdownMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/common/pipeline/agents/lifecycle.js');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-session-gate-telemetry-'));
  execFileSync('git', ['init'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'nova@example.test'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Nova Test'], { cwd: repoRoot, stdio: 'ignore' });
  fs.writeFileSync(path.join(repoRoot, 'README.md'), 'ok\n');
  execFileSync('git', ['add', 'README.md'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: repoRoot, stdio: 'ignore' });

  const transcriptPath = path.join(repoRoot, 'gate-session-transcript.jsonl');
  fs.writeFileSync(transcriptPath, `${JSON.stringify({ ts: new Date().toISOString(), kind: 'assistant', text: 'Applying gate fix now', offset: 42 })}\n`);

  let statusCalls = 0;
  const gateway = await startGatewayServer(async () => {
    statusCalls += 1;
    const state = statusCalls >= 2 ? 'closed' : 'running';
    return { result: { details: { acp: { state } } } };
  });
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const prevGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  process.env.OPENCLAW_GATEWAY_URL = gateway.url;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    const runId = 'run-session-gate-telemetry-1';
    const sessionKey = 'agent:main:acp:gatefix-gate-review-1';
    const config = {
      project: 'behavior-session-gate-telemetry',
      repo_root: repoRoot,
      telemetry: { enabled: true },
      poll_interval_seconds: 0.01,
      session_end_grace_ms: 0,
      session_progress_emit_interval_ms: 0,
      _logDir: path.join(repoRoot, '.swarm', 'logs'),
      _runLogDir: path.join(repoRoot, '.swarm', 'logs', 'pipeline', 'runs', runId),
      _runId: runId,
      run_id: runId,
      _runStats: telemetryRuntimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
      paths: { swarm_dir: path.join(repoRoot, '.swarm') },
    };

    const gatewayLabel = 'forge-gatefix-review-123';
    telemetryShutdownMod.trackAgent(
      config,
      'forge-gatefix-review',
      sessionKey,
      null,
      gatewayLabel,
      transcriptPath,
      {
        moduleId: 'gate:review',
        telemetry_module_id: null,
        telemetry_gate_id: 'gate:review',
        telemetry_dispatch_id: 'dispatch-review-gatefix-1',
        runtime: 'acp',
      },
    );

    const result = await telemetryPollingMod.pollForSessionEnd(config, 'forge-gatefix-review', 1, 'reviewfix-gate:review-1', {
      moduleId: 'gate:review',
      gateId: 'gate:review',
      gateType: 'review',
      attempt: 1,
      agentType: 'forge',
    });
    await flushAsync();

    assert.equal(result.completed, true);

    const events = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    const transcript = events.find((event) => event.type === 'agent.transcript');
    assert(transcript, 'missing gate-backed agent.transcript event');
    assert.equal(transcript.label, gatewayLabel);
    assert.equal(transcript.module_id, null);
    assert.equal(transcript.gate_id, 'gate:review');
    assert.equal(transcript.gate_type, 'review');
    assert.equal(transcript.session_key, sessionKey);
    assert.equal(transcript.dispatch_id, 'dispatch-review-gatefix-1');

    const progress = events.find((event) => event.type === 'agent.progress');
    assert(progress, 'missing gate-backed agent.progress event');
    assert.equal(progress.label, gatewayLabel);
    assert.equal(progress.module_id, null);
    assert.equal(progress.gate_id, 'gate:review');
    assert.equal(progress.gate_type, 'review');
    assert.equal(progress.session_key, sessionKey);
    assert.equal(progress.dispatch_id, 'dispatch-review-gatefix-1');
  } finally {
    telemetryShutdownMod.untrackAgent('forge-gatefix-review');
    await gateway.close();
    if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    if (prevGatewayToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = prevGatewayToken;
  }
});

await record('pollForSessionEnd emits explicit degraded observability when transcript reads fail', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(telemetryRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const telemetryRuntimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const telemetryPollingMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/polling.js');
  const telemetryShutdownMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/common/pipeline/agents/lifecycle.js');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-transcript-obsv-'));
  execFileSync('git', ['init'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'nova@example.test'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Nova Test'], { cwd: repoRoot, stdio: 'ignore' });
  fs.writeFileSync(path.join(repoRoot, 'README.md'), 'ok\n');
  execFileSync('git', ['add', 'README.md'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: repoRoot, stdio: 'ignore' });

  const badTranscriptPath = path.join(repoRoot, 'bad-transcript');
  fs.mkdirSync(badTranscriptPath, { recursive: true });

  const gateway = await startGatewayServer(async () => ({ result: { details: { acp: { state: 'closed' } } } }));
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const prevGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  process.env.OPENCLAW_GATEWAY_URL = gateway.url;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    const runId = 'run-transcript-obsv';
    const config = {
      project: 'behavior-demo',
      repo_root: repoRoot,
      telemetry: { enabled: true },
      poll_interval_seconds: 0.01,
      session_end_grace_ms: 0,
      _logDir: path.join(repoRoot, '.swarm', 'logs'),
      _runLogDir: path.join(repoRoot, '.swarm', 'logs', 'pipeline', 'runs', runId),
      _runId: runId,
      run_id: runId,
      _runStats: telemetryRuntimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      paths: { swarm_dir: path.join(repoRoot, '.swarm') },
    };

    telemetryShutdownMod.trackAgent(config, 'forge-bad-transcript', 'session-bad-transcript', null, 'forge-bad-transcript', badTranscriptPath, { moduleId: '01', runtime: 'acp' });

    const result = await telemetryPollingMod.pollForSessionEnd(config, 'forge-bad-transcript', 1, 'transcript-obsv-check');
    await flushAsync();

    assert.equal(result.completed, true);
    const events = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    const degraded = events.find((event) => event.type === 'observability.degraded' && event.reason === 'transcript_read_failed');
    assert(degraded, 'missing transcript observability.degraded event');
    assert.equal(degraded.surface, 'transcript');
    assert.equal(degraded.component, 'acp_monitor');
    assert.equal(degraded.impacted_event_type, 'agent.transcript');
    assert.equal(degraded.session_key, 'session-bad-transcript');
  } finally {
    telemetryShutdownMod.untrackAgent('forge-bad-transcript');
    await gateway.close();
    if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    if (prevGatewayToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = prevGatewayToken;
  }
});

await record('pollStatus observability preserves top-level module session correlation after active-agent cleanup', async () => {
  const pollingRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(pollingRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const telemetryRuntimeCoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const telemetryPollingMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.js');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-pollstatus-obsv-'));

  const runId = 'run-pollstatus-obsv-1';
  const swarmDir = path.join(repoRoot, '.swarm');
  const moduleDir = path.join(swarmDir, 'modules', '01-scaffold');
  fs.mkdirSync(moduleDir, { recursive: true });

  const sessionKey = 'agent:main:acp:pollstatus-top-level-01';
  fs.writeFileSync(path.join(moduleDir, 'status.json'), JSON.stringify({
    module_id: '01',
    title: 'Scaffold',
    status: 'IN_PROGRESS',
    current_phase: 'forge',
    session_key: sessionKey,
    active_agent: null,
    history: [],
  }, null, 2));

  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const originalFetch = global.fetch;
  process.env.OPENCLAW_GATEWAY_URL = 'http://behavior-pollstatus-obsv.invalid';
  global.fetch = async () => ({
    ok: false,
    status: 503,
    statusText: 'Service Unavailable',
    text: async () => JSON.stringify({ error: 'gateway unavailable during pollStatus monitor' }),
  });

  try {
    const config = {
      project: 'behavior-pollstatus-obsv',
      telemetry: { enabled: true },
      poll_interval_seconds: 0.01,
      acp_monitor: { poll_ms: 0, unknown_poll_limit: 1, stale_poll_limit: 0 },
      _logDir: path.join(repoRoot, '.swarm', 'logs'),
      _runLogDir: path.join(repoRoot, '.swarm', 'logs', 'pipeline', 'runs', runId),
      _runId: runId,
      run_id: runId,
      _runStats: telemetryRuntimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
      paths: {
        swarm_dir: swarmDir,
        modules_dir: path.join(swarmDir, 'modules'),
      },
    };

    const result = await telemetryPollingMod.pollStatus(config, '01-scaffold', ['READY_FOR_TESTING'], 1, {
      sessionLabel: sessionKey,
    });
    await flushAsync();

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'session_ended_no_changes');

    const events = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    const degraded = events.find((event) => event.type === 'observability.degraded' && event.reason === 'gateway_unreachable');
    assert(degraded, 'missing gateway observability.degraded event');
    assert.equal(degraded.module_id, '01');
    assert.equal(degraded.session_key, sessionKey);
  } finally {
    global.fetch = originalFetch;
    if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
  }
});

await record('pollStatus emits live transcript and progress telemetry for module-backed ACP sessions with preserved correlation', async () => {
  const pollingRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(pollingRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const telemetryRuntimeCoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const telemetryPollingMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.js');
  const telemetryShutdownMod = await importRuntimeModule(pollingRuntimeRoot, '/app/common/pipeline/agents/lifecycle.js');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-pollstatus-live-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const moduleDir = path.join(swarmDir, 'modules', '01-scaffold');
  fs.mkdirSync(moduleDir, { recursive: true });

  const transcriptPath = path.join(repoRoot, 'forge-live-transcript.jsonl');
  fs.writeFileSync(transcriptPath, `${JSON.stringify({ kind: 'assistant', text: 'forge progress update', offset: 1 })}\n`);

  const runId = 'run-pollstatus-live';
  const sessionKey = 'agent:main:acp:pollstatus-live-01';
  const trackingKey = 'forge-01-live';
  const gatewayLabel = 'forge-01-live-123';
  fs.writeFileSync(path.join(moduleDir, 'status.json'), JSON.stringify({
    module_id: '01',
    title: 'Scaffold',
    status: 'IN_PROGRESS',
    current_phase: 'forge',
    session_key: sessionKey,
    active_agent: null,
    history: [],
  }, null, 2));

  const gateway = await startGatewayServer(async () => ({ result: { details: { acp: { state: 'closed' } } } }));
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const prevGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  process.env.OPENCLAW_GATEWAY_URL = gateway.url;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    const config = {
      project: 'behavior-pollstatus-live',
      repo_root: repoRoot,
      telemetry: { enabled: true },
      poll_interval_seconds: 0.01,
      session_progress_emit_interval_ms: 0,
      session_end_grace_ms: 0,
      _logDir: path.join(repoRoot, '.swarm', 'logs'),
      _runLogDir: path.join(repoRoot, '.swarm', 'logs', 'pipeline', 'runs', runId),
      _runId: runId,
      run_id: runId,
      _runStats: telemetryRuntimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
      paths: {
        swarm_dir: swarmDir,
        modules_dir: path.join(swarmDir, 'modules'),
      },
    };

    telemetryShutdownMod.trackAgent(
      config,
      trackingKey,
      sessionKey,
      null,
      gatewayLabel,
      transcriptPath,
      { model: 'openai-codex/gpt-5.4', runtime: 'acp' },
    );

    const result = await telemetryPollingMod.pollStatus(config, '01-scaffold', ['READY_FOR_TESTING'], 1, {
      sessionLabel: trackingKey,
    });
    await flushAsync();

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'session_ended_no_changes');
    assert.equal(result.transcript?.eventCount, 1);
    assert.equal(result.transcript?.lastActivityPoll, 0);

    const events = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    const transcript = events.find((event) => event.type === 'agent.transcript');
    assert(transcript, 'missing pollStatus agent.transcript event');
    assert.equal(transcript.agent_type, 'forge');
    assert.equal(transcript.label, gatewayLabel);
    assert.equal(transcript.module_id, '01');
    assert.equal(transcript.gate_id, null);
    assert.equal(transcript.session_key, sessionKey);

    const progress = events.find((event) => event.type === 'agent.progress');
    assert(progress, 'missing pollStatus agent.progress event');
    assert.equal(progress.agent_type, 'forge');
    assert.equal(progress.label, gatewayLabel);
    assert.equal(progress.module_id, '01');
    assert.equal(progress.gate_id, null);
    assert.equal(progress.session_key, sessionKey);
  } finally {
    telemetryShutdownMod.untrackAgent(trackingKey);
    await gateway.close();
    if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    if (prevGatewayToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = prevGatewayToken;
  }
});

await record('pollStatus preserves tracked rate-limit correlation on primary status.json RATE_LIMITED returns', async () => {
  const pollingRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(pollingRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const telemetryRuntimeCoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const telemetryPollingMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.js');
  const telemetryShutdownMod = await importRuntimeModule(pollingRuntimeRoot, '/app/common/pipeline/agents/lifecycle.js');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-pollstatus-primary-rate-limit-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const moduleDir = path.join(swarmDir, 'modules', '01-scaffold');
  fs.mkdirSync(moduleDir, { recursive: true });

  const runId = 'run-pollstatus-primary-rate-limit';
  const sessionKey = 'agent:main:acp:pollstatus-primary-rate-limit-01';
  const trackingKey = 'forge-01-primary-rate-limit';
  const gatewayLabel = 'forge-01-primary-rate-limit-gateway';
  fs.writeFileSync(path.join(moduleDir, 'status.json'), JSON.stringify({
    module_id: '01',
    title: 'Scaffold',
    status: 'RATE_LIMITED',
    current_phase: 'forge',
    active_agent: null,
    history: [],
  }, null, 2));

  try {
    const config = {
      project: 'behavior-pollstatus-primary-rate-limit',
      repo_root: repoRoot,
      telemetry: { enabled: true },
      poll_interval_seconds: 0.01,
      _logDir: path.join(repoRoot, '.swarm', 'logs'),
      _runLogDir: path.join(repoRoot, '.swarm', 'logs', 'pipeline', 'runs', runId),
      _runId: runId,
      run_id: runId,
      _runStats: telemetryRuntimeCoreMod.createRunStats('2026-04-15T08:00:00.000Z'),
      paths: {
        swarm_dir: swarmDir,
        modules_dir: path.join(swarmDir, 'modules'),
      },
    };

    telemetryShutdownMod.trackAgent(
      config,
      trackingKey,
      sessionKey,
      null,
      gatewayLabel,
      null,
      {
        model: 'openai-codex/gpt-5.4',
        runtime: 'acp',
        telemetry_attempt: 4,
        telemetry_dispatch_id: 'dispatch-pollstatus-primary-rate-limit-1',
      },
    );

    const result = await telemetryPollingMod.pollStatus(config, '01-scaffold', ['READY_FOR_TESTING'], 1, {
      sessionLabel: trackingKey,
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'rate_limited');
    assert.equal(result.status.status, 'RATE_LIMITED');
    assert.equal(result.status.run_id, runId);
    assert.equal(result.status.module_id, '01');
    assert.equal(result.status.current_phase, 'forge');
    assert.equal(result.status.agent_type, 'forge');
    assert.equal(result.status.attempt, 4);
    assert.equal(result.status.dispatch_id, 'dispatch-pollstatus-primary-rate-limit-1');
    assert.equal(result.status.gateway_label, gatewayLabel);
    assert.equal(result.status.session_key, sessionKey);
  } finally {
    telemetryShutdownMod.untrackAgent(trackingKey);
  }
});

await record('pollStatus preserves tracked rate-limit correlation when ACP monitor owns the live status signal', async () => {
  const pollingRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(pollingRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const telemetryRuntimeCoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const telemetryPollingMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.js');
  const telemetryShutdownMod = await importRuntimeModule(pollingRuntimeRoot, '/app/common/pipeline/agents/lifecycle.js');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-pollstatus-rate-limit-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const moduleDir = path.join(swarmDir, 'modules', '01-scaffold');
  fs.mkdirSync(moduleDir, { recursive: true });

  const transcriptPath = path.join(repoRoot, 'forge-rate-limit-transcript.jsonl');
  fs.writeFileSync(transcriptPath, `${JSON.stringify({ kind: 'lifecycle', phase: 'error', data: { error: '429 rate limit, retry after 30 seconds' } })}\n`);

  const runId = 'run-pollstatus-rate-limit';
  const sessionKey = 'agent:main:acp:pollstatus-rate-limit-01';
  const trackingKey = 'forge-01-rate-limit';
  const gatewayLabel = 'forge-01-rate-limit-gateway';
  fs.writeFileSync(path.join(moduleDir, 'status.json'), JSON.stringify({
    module_id: '01',
    title: 'Scaffold',
    status: 'IN_PROGRESS',
    current_phase: 'forge',
    active_agent: null,
    history: [],
  }, null, 2));

  const gateway = await startGatewayServer(async () => ({ result: { details: { acp: { state: 'running' } } } }));
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const prevGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  process.env.OPENCLAW_GATEWAY_URL = gateway.url;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    const config = {
      project: 'behavior-pollstatus-rate-limit',
      repo_root: repoRoot,
      telemetry: { enabled: true },
      poll_interval_seconds: 0.01,
      session_progress_emit_interval_ms: 0,
      _logDir: path.join(repoRoot, '.swarm', 'logs'),
      _runLogDir: path.join(repoRoot, '.swarm', 'logs', 'pipeline', 'runs', runId),
      _runId: runId,
      run_id: runId,
      _runStats: telemetryRuntimeCoreMod.createRunStats('2026-04-15T08:00:00.000Z'),
      paths: {
        swarm_dir: swarmDir,
        modules_dir: path.join(swarmDir, 'modules'),
      },
    };

    telemetryShutdownMod.trackAgent(
      config,
      trackingKey,
      sessionKey,
      null,
      gatewayLabel,
      transcriptPath,
      {
        model: 'openai-codex/gpt-5.4',
        runtime: 'acp',
        telemetry_attempt: 4,
        telemetry_dispatch_id: 'dispatch-pollstatus-rate-limit-1',
      },
    );

    const result = await telemetryPollingMod.pollStatus(config, '01-scaffold', ['READY_FOR_TESTING'], 1, {
      sessionLabel: trackingKey,
    });
    await flushAsync();

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'rate_limited');
    assert.equal(result.status.status, 'RATE_LIMITED');
    assert.equal(result.status.run_id, runId);
    assert.equal(result.status.module_id, '01');
    assert.equal(result.status.current_phase, 'forge');
    assert.equal(result.status.agent_type, 'forge');
    assert.equal(result.status.attempt, 4);
    assert.equal(result.status.dispatch_id, 'dispatch-pollstatus-rate-limit-1');
    assert.equal(result.status.gateway_label, gatewayLabel);
    assert.equal(result.status.session_key, sessionKey);
    assert.equal(result.status.rate_limit_reason, '429 rate limit, retry after 30 seconds');
    assert.equal(result.status.detail, '429 rate limit, retry after 30 seconds');
  } finally {
    telemetryShutdownMod.untrackAgent(trackingKey);
    await gateway.close();
    if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    if (prevGatewayToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = prevGatewayToken;
  }
});

await record('pollStatus prefers live status dispatch-backed correlation over stale tracked labels for transcript and progress telemetry', async () => {
  const pollingRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(pollingRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const telemetryRuntimeCoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const telemetryPollingMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.js');
  const telemetryShutdownMod = await importRuntimeModule(pollingRuntimeRoot, '/app/common/pipeline/agents/lifecycle.js');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-pollstatus-live-dispatch-fallback-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const moduleDir = path.join(swarmDir, 'modules', '01-scaffold');
  fs.mkdirSync(moduleDir, { recursive: true });

  const transcriptPath = path.join(repoRoot, 'forge-live-dispatch-fallback-transcript.jsonl');
  fs.writeFileSync(transcriptPath, `${JSON.stringify({ kind: 'assistant', text: 'forge progress update', offset: 1 })}\n`);

  const runId = 'run-pollstatus-live-dispatch-fallback';
  const sessionKey = 'agent:main:acp:pollstatus-live-dispatch-fallback-01';
  const trackingKey = 'forge-01-live-dispatch-fallback';
  const staleGatewayLabel = 'forge-01-stale-label';
  const staleDispatchId = 'dispatch-stale-01';
  const liveDispatchId = 'dispatch-live-01';
  fs.writeFileSync(path.join(moduleDir, 'status.json'), JSON.stringify({
    module_id: '01',
    title: 'Scaffold',
    status: 'IN_PROGRESS',
    current_phase: 'forge',
    session_key: sessionKey,
    dispatch_id: liveDispatchId,
    active_agent: null,
    history: [],
  }, null, 2));

  const gateway = await startGatewayServer(async () => ({ result: { details: { acp: { state: 'closed' } } } }));
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const prevGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  process.env.OPENCLAW_GATEWAY_URL = gateway.url;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    const config = {
      project: 'behavior-pollstatus-live-dispatch-fallback',
      repo_root: repoRoot,
      telemetry: { enabled: true },
      poll_interval_seconds: 0.01,
      session_progress_emit_interval_ms: 0,
      session_end_grace_ms: 0,
      _logDir: path.join(repoRoot, '.swarm', 'logs'),
      _runLogDir: path.join(repoRoot, '.swarm', 'logs', 'pipeline', 'runs', runId),
      _runId: runId,
      run_id: runId,
      _runStats: telemetryRuntimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
      paths: {
        swarm_dir: swarmDir,
        modules_dir: path.join(swarmDir, 'modules'),
      },
    };

    telemetryShutdownMod.trackAgent(
      config,
      trackingKey,
      sessionKey,
      null,
      staleGatewayLabel,
      transcriptPath,
      { model: 'openai-codex/gpt-5.4', runtime: 'acp', telemetry_dispatch_id: staleDispatchId },
    );

    const result = await telemetryPollingMod.pollStatus(config, '01-scaffold', ['READY_FOR_TESTING'], 1, {
      sessionLabel: trackingKey,
    });
    await flushAsync();

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'session_ended_no_changes');

    const events = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    const transcript = events.find((event) => event.type === 'agent.transcript');
    assert(transcript, 'missing pollStatus dispatch-backed agent.transcript event');
    assert.equal(transcript.label, liveDispatchId);
    assert.equal(transcript.dispatch_id, liveDispatchId);
    assert.equal(transcript.session_key, sessionKey);

    const progress = events.find((event) => event.type === 'agent.progress');
    assert(progress, 'missing pollStatus dispatch-backed agent.progress event');
    assert.equal(progress.label, liveDispatchId);
    assert.equal(progress.dispatch_id, liveDispatchId);
    assert.equal(progress.session_key, sessionKey);
  } finally {
    telemetryShutdownMod.untrackAgent(trackingKey);
    await gateway.close();
    if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    if (prevGatewayToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = prevGatewayToken;
  }
});

await record('pollStatus preserves terminal ACP detail alongside the transcript snapshot for no-change exits', async () => {
  const pollingRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(pollingRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const telemetryPollingMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.js');
  const telemetryShutdownMod = await importRuntimeModule(pollingRuntimeRoot, '/app/common/pipeline/agents/lifecycle.js');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-pollstatus-terminal-detail-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const moduleDir = path.join(swarmDir, 'modules', '01-scaffold');
  fs.mkdirSync(moduleDir, { recursive: true });

  const transcriptPath = path.join(repoRoot, 'forge-terminal-detail-transcript.jsonl');
  fs.writeFileSync(transcriptPath, `${JSON.stringify({ kind: 'lifecycle', phase: 'error', data: { error: 'adapter command missing' } })}\n`);

  const sessionKey = 'agent:main:acp:pollstatus-terminal-detail-01';
  const trackingKey = 'forge-01-terminal-detail';
  fs.writeFileSync(path.join(moduleDir, 'status.json'), JSON.stringify({
    module_id: '01',
    title: 'Scaffold',
    status: 'IN_PROGRESS',
    current_phase: 'forge',
    session_key: sessionKey,
    active_agent: null,
    history: [],
  }, null, 2));

  const gateway = await startGatewayServer(async () => ({ result: { details: { acp: { state: 'closed' } } } }));
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const prevGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  process.env.OPENCLAW_GATEWAY_URL = gateway.url;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    const config = {
      project: 'behavior-pollstatus-terminal-detail',
      repo_root: repoRoot,
      poll_interval_seconds: 0.01,
      paths: {
        swarm_dir: swarmDir,
        modules_dir: path.join(swarmDir, 'modules'),
      },
    };

    telemetryShutdownMod.trackAgent(
      config,
      trackingKey,
      sessionKey,
      null,
      trackingKey,
      transcriptPath,
      { runtime: 'acp' },
    );

    const result = await telemetryPollingMod.pollStatus(config, '01-scaffold', ['READY_FOR_TESTING'], 1, {
      sessionLabel: trackingKey,
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'session_ended_no_changes');
    assert.equal(result.status?.detail, 'adapter command missing');
    assert.equal(result.status?.state, 'closed');
    assert.equal(result.transcript?.lastDetail, 'adapter command missing');
    assert.equal(result.transcript?.eventCount, 1);
  } finally {
    telemetryShutdownMod.untrackAgent(trackingKey);
    await gateway.close();
    if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    if (prevGatewayToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = prevGatewayToken;
  }
});

await record('pollForFile observability preserves tracked gate session correlation instead of label-derived fake module ids', async () => {
  const pollingRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(pollingRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const telemetryRuntimeCoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const telemetryPollingMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.js');
  const telemetryShutdownMod = await importRuntimeModule(pollingRuntimeRoot, '/app/common/pipeline/agents/lifecycle.js');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-pollfile-obsv-'));
  execFileSync('git', ['init'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'nova@example.test'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Nova Test'], { cwd: repoRoot, stdio: 'ignore' });
  fs.writeFileSync(path.join(repoRoot, 'README.md'), 'ok\n');
  execFileSync('git', ['add', 'README.md'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: repoRoot, stdio: 'ignore' });

  const badTranscriptPath = path.join(repoRoot, 'bad-review-transcript');
  fs.mkdirSync(badTranscriptPath, { recursive: true });

  const gateway = await startGatewayServer(async () => ({ result: { details: { acp: { state: 'closed' } } } }));
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const prevGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  process.env.OPENCLAW_GATEWAY_URL = gateway.url;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    const runId = 'run-pollfile-obsv';
    const config = {
      project: 'behavior-pollfile-obsv',
      repo_root: repoRoot,
      telemetry: { enabled: true },
      poll_interval_seconds: 0.01,
      session_end_grace_ms: 0,
      _logDir: path.join(repoRoot, '.swarm', 'logs'),
      _runLogDir: path.join(repoRoot, '.swarm', 'logs', 'pipeline', 'runs', runId),
      _runId: runId,
      run_id: runId,
      _runStats: telemetryRuntimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
      paths: { swarm_dir: path.join(repoRoot, '.swarm') },
    };

    telemetryShutdownMod.trackAgent(
      config,
      'echo-quality-gate:review',
      'agent:main:acp:echo-review-obsv',
      null,
      'echo-quality-gate:review',
      badTranscriptPath,
      { telemetry_gate_id: 'gate:review', runtime: 'acp' }
    );

    const result = await telemetryPollingMod.pollForFile(
      config,
      path.join(repoRoot, 'missing-review-output.json'),
      1,
      "Review 'gate:review'",
      'echo-quality-gate:review'
    );
    await flushAsync();

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'session_ended_no_output');

    const events = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    const degraded = events.find((event) => event.type === 'observability.degraded' && event.reason === 'transcript_read_failed');
    assert(degraded, 'missing pollForFile transcript observability.degraded event');
    assert.equal(degraded.gate_id, 'gate:review');
    assert.equal(degraded.session_key, 'agent:main:acp:echo-review-obsv');
    assert.equal(degraded.module_id, null);
  } finally {
    telemetryShutdownMod.untrackAgent('echo-quality-gate:review');
    await gateway.close();
    if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    if (prevGatewayToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = prevGatewayToken;
  }
});

await record('pollForFile emits live transcript and progress telemetry for file-backed ACP sessions with preserved correlation', async () => {
  const pollingRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(pollingRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const telemetryRuntimeCoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const telemetryPollingMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.js');
  const telemetryShutdownMod = await importRuntimeModule(pollingRuntimeRoot, '/app/common/pipeline/agents/lifecycle.js');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-pollfile-live-telemetry-'));
  execFileSync('git', ['init'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'nova@example.test'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Nova Test'], { cwd: repoRoot, stdio: 'ignore' });
  fs.writeFileSync(path.join(repoRoot, 'README.md'), 'ok\n');
  execFileSync('git', ['add', 'README.md'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: repoRoot, stdio: 'ignore' });

  const transcriptPath = path.join(repoRoot, 'pipeline-review-transcript.jsonl');
  fs.writeFileSync(transcriptPath, `${JSON.stringify({ ts: new Date().toISOString(), kind: 'assistant', text: 'Reviewing pipeline run now', offset: 12 })}\n`);

  let statusCalls = 0;
  const gateway = await startGatewayServer(async () => {
    statusCalls += 1;
    const state = statusCalls >= 2 ? 'closed' : 'running';
    return { result: { details: { acp: { state } } } };
  });
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const prevGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  process.env.OPENCLAW_GATEWAY_URL = gateway.url;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    const runId = 'run-pollfile-live-telemetry';
    const sessionKey = 'agent:main:acp:pipeline-review-1';
    const trackingKey = 'pipeline-review-gpt-5.4';
    const gatewayLabel = 'pipeline-review-123';
    const config = {
      project: 'behavior-pollfile-live-telemetry',
      repo_root: repoRoot,
      telemetry: { enabled: true },
      poll_interval_seconds: 0.01,
      session_progress_emit_interval_ms: 0,
      _logDir: path.join(repoRoot, '.swarm', 'logs'),
      _runLogDir: path.join(repoRoot, '.swarm', 'logs', 'pipeline', 'runs', runId),
      _runId: runId,
      run_id: runId,
      _runStats: telemetryRuntimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
      paths: { swarm_dir: path.join(repoRoot, '.swarm') },
    };

    telemetryShutdownMod.trackAgent(
      config,
      trackingKey,
      sessionKey,
      null,
      gatewayLabel,
      transcriptPath,
      {
        model: 'openai-codex/gpt-5.4',
        runtime: 'acp',
        telemetry_module_id: 'pipeline-review',
        telemetry_agent_type: 'echo',
      },
    );

    const result = await telemetryPollingMod.pollForFile(
      config,
      path.join(repoRoot, 'missing-pipeline-review.md'),
      1,
      'Pipeline Review',
      trackingKey,
    );
    await flushAsync();

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'session_ended_no_output');

    const events = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    const transcript = events.find((event) => event.type === 'agent.transcript');
    assert(transcript, 'missing pollForFile agent.transcript event');
    assert.equal(transcript.agent_type, 'echo');
    assert.equal(transcript.label, gatewayLabel);
    assert.equal(transcript.module_id, 'pipeline-review');
    assert.equal(transcript.gate_id, null);
    assert.equal(transcript.session_key, sessionKey);

    const progress = events.find((event) => event.type === 'agent.progress');
    assert(progress, 'missing pollForFile agent.progress event');
    assert.equal(progress.agent_type, 'echo');
    assert.equal(progress.label, gatewayLabel);
    assert.equal(progress.module_id, 'pipeline-review');
    assert.equal(progress.gate_id, null);
    assert.equal(progress.session_key, sessionKey);
  } finally {
    telemetryShutdownMod.untrackAgent('pipeline-review-gpt-5.4');
    await gateway.close();
    if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    if (prevGatewayToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = prevGatewayToken;
  }
});
}
