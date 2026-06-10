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
async function buildBuiltInRegistry(runtimeRootForRegistry) {
  const registryMod = await importRuntimeModule(runtimeRootForRegistry, '/app/skills/pipeline/core/registry.ts');
  const { registry, errors } = registryMod.buildPluginRegistry({ enabled: true, allowCustomModules: false, extraModulePaths: [], modules: {}, stageOwners: {}, restrictedCapabilityAllowlist: {} }, { throwOnError: false });
  assert.equal(errors.length, 0);
  return registry;
}

function createCleanPollingRepo(prefix) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const remoteRoot = path.join(parent, 'remote.git');
  const repoRoot = path.join(parent, 'repo');
  execFileSync('git', ['init', '--bare', remoteRoot], { stdio: 'ignore' });
  execFileSync('git', ['init', repoRoot], { stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'nova@example.test'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Nova Test'], { cwd: repoRoot, stdio: 'ignore' });
  fs.writeFileSync(path.join(repoRoot, 'README.md'), 'ok\n');
  execFileSync('git', ['add', 'README.md'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['branch', '-M', 'main'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['remote', 'add', 'origin', remoteRoot], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['push', '-u', 'origin', 'main'], { cwd: repoRoot, stdio: 'ignore' });
  return repoRoot;
}

const lifecycleTestModBase = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/agents/lifecycle.ts');
const gitMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/git-context.ts');
const pollingMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/polling.ts');
const timingMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/timing.ts');
const EXPLICIT_ACP_MONITOR_CONFIG = {
  unknown_poll_limit: 10,
  stale_poll_limit: 10,
  max_transcript_extensions: 3,
  transcript_grace_ms: 300000,
  monitor_poll_ms: 10000,
};

function platformPollingDefaults() {
  return {
    rate_limit: { max_pauses_per_module: 3, cooldown_hours: 0 },
  };
}

await record('shared budget only extends through explicit authorized rate-limit cooldowns', async () => {
  const budget = timingMod.createBudget({ timeoutMs: 10, label: 'behavior-budget-extension' });
  const originalDeadline = budget.deadlineMs;

  assert.throws(
    () => budget.extend(100, { reason: 'unauthorized' }),
    /explicit authorization/,
  );
  budget.extendForRateLimit(200, { bufferMs: 7 });

  assert.equal(budget.deadlineMs, originalDeadline + 207);
  assert.deepEqual(budget.extensions.map((entry) => ({ ms: entry.ms, reason: entry.reason })), [
    { ms: 207, reason: 'rate_limit_cooldown' },
  ]);
});

await record('budgeted sleep rejects loudly when the absolute budget expires', async () => {
  const budget = timingMod.createBudget({ deadlineMs: Date.now() - 1, label: 'behavior-budget-sleep' });
  await assert.rejects(
    () => timingMod.sleep(50, { budget }),
    (error) => error?.name === 'BudgetExhaustedError' && error?.code === 'BUDGET_EXHAUSTED',
  );
});

await record('rate-limit handling extends shared budget by authorized cooldown plus buffer', async () => {
  const rateLimitMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/rate-limit.ts');
  const budget = timingMod.createBudget({ timeoutMs: 10, label: 'behavior-rate-limit-budget' });
  const originalDeadline = budget.deadlineMs;

  await rateLimitMod.handleSessionRateLimit(
    { rate_limit: { max_pauses_per_module: 1, cooldown_hours: 0.001, cooldown_buffer_ms: 13 } },
    { session_key: 'agent:rate-limit-budget', detail: 'provider cooldown' },
    {
      budget,
      suppressPausePresentation: true,
      sleepFn: async () => {},
      sendResumeDiscord: async () => {},
    },
  );

  assert.equal(budget.deadlineMs, originalDeadline + 3600 + 13);
  assert.deepEqual(budget.extensions.map((entry) => ({ ms: entry.ms, reason: entry.reason })), [
    { ms: 3613, reason: 'authorized_rate_limit_cooldown' },
  ]);
});

await record('pollGeneric consumes a strict shared budget without internal extension', async () => {
  const repoRoot = createCleanPollingRepo('behavior-poll-budget-');
  const budget = timingMod.createBudget({ timeoutMs: 20, label: 'behavior-poll-budget' });
  const originalDeadline = budget.deadlineMs;
  let calls = 0;

  const result = await pollingMod.pollGeneric(
    { repo_root: repoRoot, poll_interval_seconds: 0.05 },
    async () => {
      calls += 1;
      return { done: false, logMsg: 'pending' };
    },
    1,
    'strict-budget-poll-check',
    { budget },
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'timeout');
  assert.equal(result.error?.name, 'BudgetExhaustedError');
  assert.equal(budget.deadlineMs, originalDeadline);
  assert(calls >= 1, 'expected at least one immediate poll check before budget exhaustion');
});

function flattenRedisFields(entry = {}) {
  return Object.entries(entry).flatMap(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]);
}

function redisCompletionEntry(project, moduleId, overrides = {}) {
  return {
    _id: '1-0',
    schema_version: 'v1',
    type: 'completion',
    stream_role: 'completion',
    project,
    target_kind: 'module',
    target_id: moduleId,
    module: moduleId,
    source: 'buster-pipeline',
    status: 'PASS',
    outcome: 'PASS',
    summary: 'passed',
    timestamp: '2026-05-11T00:00:00.000Z',
    ...overrides,
  };
}

function makeRedisCompletionCtor(entries = [], stream = null) {
  return class TestRedisCompletionClient {
    constructor() {
      this.status = 'ready';
      this.queue = entries.map((entry, index) => {
        const id = entry._id || `${index + 1}-0`;
        return [id, flattenRedisFields({ ...entry, _id: id })];
      });
      this.pendingRejects = [];
    }

    on() {}

    async xread(...args) {
      const streamIndex = args.indexOf('STREAMS');
      const streamKey = stream || (streamIndex >= 0 ? args[streamIndex + 1] : 'swarm:pipeline:test:completions');
      if (this.queue.length > 0) return [[streamKey, [this.queue.shift()]]];
      return new Promise((_resolve, reject) => this.pendingRejects.push(reject));
    }

    disconnect() {
      for (const reject of this.pendingRejects.splice(0)) reject(new Error('connection is closed'));
    }
  };
}

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

await record('Redis completion archive adapter resolves per config instead of caching the first adapter', async () => {
  const calls = [];
  const adapterA = {
    async archiveCompletions(stream, archiveStream, moduleId, maxLen, activeIdentity) {
      calls.push({ adapter: 'A', method: 'archive', stream, archiveStream, moduleId, maxLen, activeIdentity });
      return { archived: 1, adapter: 'A' };
    },
  };
  const adapterB = {
    async archiveCompletions(stream, archiveStream, moduleId, maxLen, activeIdentity) {
      calls.push({ adapter: 'B', method: 'archive', stream, archiveStream, moduleId, maxLen, activeIdentity });
      return { archived: 1, adapter: 'B' };
    },
  };
    const configADeps = { adapters: { redis: adapterA } };
const configA = {
    project: 'behavior-polling-redis-adapter-a',
      };
    const configBDeps = { adapters: { redis: adapterB } };
const configB = {
    project: 'behavior-polling-redis-adapter-b',
      };

  const archiveResultA = await pollingMod.archiveModuleCompletions(configA, '01', { dispatch_id: 'dispatch-a' }, { deps: configADeps });
  const archiveResultB = await pollingMod.archiveModuleCompletions(configB, '02', { dispatch_id: 'dispatch-b' }, { deps: configBDeps });

  assert.equal(archiveResultA.adapter, 'A');
  assert.equal(archiveResultB.adapter, 'B');
  assert.deepEqual(calls.map((call) => `${call.adapter}:${call.method}:${call.moduleId}`), ['A:archive:01', 'B:archive:02']);
});

await record('pollGeneric throttles repeated unchanged progress logs', async () => {
  const originalConsoleError = console.error;
  const logs = [];
  console.error = (...args) => { logs.push(args.join(' ')); };
  try {
    let calls = 0;
    const repoRoot = createCleanPollingRepo('behavior-poll-progress-throttle-');
    const result = await pollingMod.pollGeneric(
      { repo_root: repoRoot, poll_interval_seconds: 0.01, poll_progress_log_interval_ms: 1000 },
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
    const repoRoot = createCleanPollingRepo('behavior-poll-progress-logkey-');
    const result = await pollingMod.pollGeneric(
      { repo_root: repoRoot, poll_interval_seconds: 0.01, poll_progress_log_interval_ms: 1000 },
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
  const rateLimitMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/rate-limit.ts');

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
  assert.deepEqual(exhausted.status, {
    run_id: 'run-session-monitor-rate-limit-1',
    attempt: 2,
    dispatch_id: 'dispatch-session-monitor-rate-limit-1',
    gateway_label: 'session-monitor-rate-limit-gateway',
    session_key: 'agent:main:acp:session-monitor-rate-limit-1',
    detail: 'provider overloaded',
    transcript: { eventCount: 3, lastDetail: 'rate limited' },
  });
  assert.equal(exhausted.result.detail, 'provider overloaded');
  assert.deepEqual(exhausted.result.transcript, { eventCount: 3, lastDetail: 'rate limited' });
});

await record('shared session rate-limit ownership can preserve cooldown budget across retries', async () => {
  const rateLimitMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/rate-limit.ts');

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
  const rateLimitMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/rate-limit.ts');

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
        identity: {
          run_id: 'run-review-rate-limit-1',
          attempt: 2,
          dispatch_id: 'dispatch-review-rate-limit-1',
          gateway_label: 'reviewer-1',
          session_key: 'session-review-rate-limit-1',
        },
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
  const rateLimitMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/rate-limit.ts');

  const normalized = rateLimitMod.buildGateSessionRateLimitStatus(
    {
      reason: 'provider overloaded',
      dispatch_id: 'dispatch-buster-status-1',
      session_key: 'agent:main:acp:buster-gate-1',
    },
    {
      gateId: 'gate:buster',
      gateType: 'buster',
      identity: {
        agent_type: 'buster',
        run_id: 'run-buster-rate-limit-1',
        attempt: 3,
        dispatch_id: 'dispatch-buster-fallback-1',
        gateway_label: 'buster-label-1',
        session_key: 'agent:main:acp:buster-fallback-1',
      },
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
  assert.equal(normalized.gateway_label, 'buster-label-1');
  assert.equal(normalized.session_key, 'agent:main:acp:buster-gate-1');
});

await record('shared gate rate-limit status normalization centralizes review gate fallback correlation', async () => {
  const rateLimitMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/rate-limit.ts');

  const normalized = rateLimitMod.buildGateSessionRateLimitStatus(
    {
      reason: 'provider overloaded',
      session_key: 'agent:main:acp:echo-review-1',
    },
    {
      gateId: 'gate:review',
      gateType: 'review',
      identity: {
        agent_type: 'echo',
        run_id: 'run-review-rate-limit-1',
        attempt: 2,
        dispatch_id: 'dispatch-review-fallback-1',
        gateway_label: 'echo-reviewer-1',
        session_key: 'agent:main:acp:echo-review-fallback-1',
      },
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

await record('tracked gate rate-limit correlation does not invent gateway labels from dispatch ids', async () => {
  const rateLimitMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/rate-limit.ts');

  const normalizeStatus = rateLimitMod.createTrackedGateSessionRateLimitStatusBuilder({
    gateId: 'gate:review',
    gateType: 'review',
    identity: { dispatch_id: 'dispatch-review-only-1' },
  });

  const normalized = normalizeStatus({ reason: 'provider overloaded' });
  assert.equal(normalized.dispatch_id, 'dispatch-review-only-1');
  assert.equal(normalized.gateway_label, null);
});

await record('shared tracked gate recovery preserves cached cooldown correlation through sparse exhausted statuses', async () => {
  const rateLimitMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/rate-limit.ts');

  let calls = 0;
  const rateLimitConfig = {
    project: 'behavior-gate-tracked-rate-limit',
    rate_limit: { max_pauses_per_module: 1, cooldown_hours: 0 },
    paths: { swarm_dir: fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-gate-tracked-rate-limit-swarm-')) },
    _runId: 'run-gate-tracked-rate-limit-1',
    run_id: 'run-gate-tracked-rate-limit-1',
  };
  const recoveryOptions = rateLimitMod.createTrackedGateSessionRateLimitRecoveryOptions(
    rateLimitConfig,
    {
      sleepFn: async () => {},
      gateId: 'gate:buster',
      gateType: 'buster',
      identity: {
        agent_type: 'buster',
        run_id: 'run-gate-tracked-rate-limit-1',
        attempt: 4,
      },
      exhaustedResultConfig: { exit: 40 },
    },
  );

  const result = await rateLimitMod.withSessionRateLimitRecovery(
    rateLimitConfig,
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
  const rateLimitMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/rate-limit.ts');

  const normalized = rateLimitMod.buildModuleSessionRateLimitStatus(
    {
      detail: '429 rate limit, retry after 30 seconds',
      session_key: 'agent:main:acp:forge-rate-limit-1',
    },
    {
      moduleId: '01',
      phase: 'forge',
      identity: {
        agent_type: 'forge',
        run_id: 'run-forge-rate-limit-1',
        attempt: 4,
        dispatch_id: 'dispatch-forge-rate-limit-1',
        gateway_label: 'forge-rate-limit-label-1',
        session_key: 'agent:main:acp:forge-rate-limit-fallback-1',
      },
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
  const pollingMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.ts');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-poll-dual-terminal-owned-rate-limit-'));
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

  const redisAdapter = {
    ...(await import(`file://${redisModulePath}`)).default,
    async archiveCompletions() { return { archived: 0 }; },
  };

    const deps = {
      completionEventAdapters: {
        RedisCtor: makeRedisCompletionCtor([redisCompletionEntry('behavior-poll-dual-terminal-owned-rate-limit', '01', {
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
        })]),
      },
    };

const result = await pollingMod.pollDual({
    project: 'behavior-poll-dual-terminal-owned-rate-limit',
    _runId: 'run-poll-dual-terminal-owned-rate-limit-1',
    run_id: 'run-poll-dual-terminal-owned-rate-limit-1',
    acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
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
    attempt: 4,
    dispatch_id: 'dispatch-buster-rate-limit-1',
    gateway_label: 'stale-module-label',
    session_key: 'agent:buster:module-rate-limit',
  }, { deps });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'rate_limit_exhausted');
  assert.equal(result.rate_limit_exhausted, true);
  assert.equal(result.run_id, 'run-poll-dual-terminal-owned-rate-limit-1');
  assert.equal(result.attempt, 4);
  assert.equal(result.dispatch_id, 'dispatch-buster-rate-limit-1');
  assert.equal(result.gateway_label, 'stale-module-label');
  assert.equal(result.session_key, 'agent:buster:module-rate-limit');
  assert.equal(result.max_rate_limit_pauses, 3);
  assert.equal(result.status?.status, 'RATE_LIMITED');
  assert.equal(result.status?.module_id, '01');
  assert.equal(result.status?.max_rate_limit_pauses, 3);
  assert.equal(result.rate_limit_status?.status, 'RATE_LIMITED');
  assert.equal(result.rate_limit_status?.module_id, '01');
  assert.equal(result.rate_limit_status?.max_rate_limit_pauses, 3);
  assert.equal(result.status?.gateway_label, 'stale-module-label');
  assert.equal(result.status?.dispatch_id, 'dispatch-buster-rate-limit-1');
  assert.equal(result.status?.session_key, 'agent:buster:module-rate-limit');
});

await record('pollDual preserves canonical module cooldown correlation on raw Redis rate-limited returns', async () => {
  const { runtimeRoot: pollingRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  const pollingMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.ts');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-poll-dual-redis-rate-limited-'));
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
      source: 'test-adapter',
      reason: 'provider overloaded',
      attempt: 4,
      dispatch_id: 'dispatch-buster-raw-rate-limit-1',
      session_key: 'agent:buster:module-raw-rate-limit',
    };
  },
};
`);

  const redisAdapter = {
    ...(await import(`file://${redisModulePath}`)).default,
    async archiveCompletions() { return { archived: 0 }; },
  };

    const deps = {
      completionEventAdapters: {
        RedisCtor: makeRedisCompletionCtor([redisCompletionEntry('behavior-poll-dual-redis-rate-limited', '01', {
          status: 'FAIL',
          outcome: 'RATE_LIMITED',
          source: 'agent',
          reason: 'provider overloaded',
          run_id: 'run-poll-dual-redis-rate-limited-1',
          attempt: 4,
          dispatch_id: 'dispatch-buster-raw-rate-limit-1',
          session_key: 'agent:buster:module-raw-rate-limit',
        })]),
      },
    };

const result = await pollingMod.pollDual({
    project: 'behavior-poll-dual-redis-rate-limited',
    repo_root: repoRoot,
    _runId: 'run-poll-dual-redis-rate-limited-1',
    run_id: 'run-poll-dual-redis-rate-limited-1',
    acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
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
    attempt: 4,
    dispatch_id: 'dispatch-buster-raw-rate-limit-1',
    gateway_label: 'stale-module-label',
    session_key: 'agent:buster:module-raw-rate-limit',
  }, { deps });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'rate_limited');
  assert.equal(result.status?.status, 'RATE_LIMITED');
  assert.equal(result.status?.module_id, '01');
  assert.equal(result.status?.current_phase, 'buster');
  assert.equal(result.status?.agent_type, 'buster');
  assert.equal(result.status?.run_id, 'run-poll-dual-redis-rate-limited-1');
  assert.equal(result.status?.attempt, 4);
  assert.equal(result.status?.dispatch_id, 'dispatch-buster-raw-rate-limit-1');
  assert.equal(result.status?.gateway_label, 'stale-module-label');
  assert.equal(result.status?.session_key, 'agent:buster:module-raw-rate-limit');
});

await record('pollDual ignores Redis terminal completion without active dispatch confirmation', async () => {
  const { runtimeRoot: pollingRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  const pollingMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.ts');
  const statusStoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/status-store.ts');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-poll-dual-unconfirmed-redis-'));
  const swarmDir = path.join(root, '.swarm');
  const modulesDir = path.join(swarmDir, 'modules');
  const moduleDir = path.join(modulesDir, '01-scaffold');
  fs.mkdirSync(moduleDir, { recursive: true });
  const fixtureConfig = {
    project: 'behavior-poll-dual-unconfirmed-redis',
    _runId: 'run-poll-dual-unconfirmed-redis-1',
    run_id: 'run-poll-dual-unconfirmed-redis-1',
    paths: { swarm_dir: swarmDir, modules_dir: modulesDir },
  };
  const readModels = statusStoreMod.loadLifecycleReadModels(fixtureConfig);
  readModels.modules['01'] = {
    module_id: '01',
    module_dir: '01-scaffold',
    status: 'TESTING',
    current_phase: 'buster',
    projection_source: 'canonical-events',
  };
  statusStoreMod.saveLifecycleReadModels(fixtureConfig, readModels);

  const redisModulePath = path.join(root, 'fake-redis-unconfirmed-module.mjs');
  fs.writeFileSync(redisModulePath, `export default { async readCompletion() { return {
    module_id: '01',
    status: 'PASS',
    outcome: 'PASS',
    source: 'buster-pipeline',
    summary: 'Redis says pass but does not carry active dispatch identity.'
  }; } };\n`);

  const redisAdapter = {
    ...(await import(`file://${redisModulePath}`)).default,
    async archiveCompletions() { return { archived: 0 }; },
  };

    const deps = {
      completionEventAdapters: {
        RedisCtor: makeRedisCompletionCtor([redisCompletionEntry('behavior-poll-dual-unconfirmed-redis', '01', {
          status: 'PASS',
          outcome: 'PASS',
          source: 'buster-pipeline',
          summary: 'Redis says pass but does not carry active dispatch identity.',
        })]),
      },
    };

const result = await pollingMod.pollDual({
    project: 'behavior-poll-dual-unconfirmed-redis',
    _runId: 'run-poll-dual-unconfirmed-redis-1',
    run_id: 'run-poll-dual-unconfirmed-redis-1',
    acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
    paths: { swarm_dir: swarmDir, modules_dir: modulesDir },
    agents: {
      buster: {
        dispatch: 'redis',
        redis_js_path: redisModulePath,
      },
    },
        poll_interval_seconds: 0.01,
  }, '01-scaffold', '01', ['PASS'], 0.001, {
    run_id: 'run-poll-dual-unconfirmed-redis-1',
    attempt: 1,
    dispatch_id: 'dispatch-poll-dual-unconfirmed-redis-1',
  }, { deps });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'timeout');
  assert.equal(result.status, null);
  assert.equal(result.failure_class, 'timeout');
});

await record('pollDual fails closed when Redis terminal completion conflicts with local terminal status', async () => {
  const { runtimeRoot: pollingRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  const pollingMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.ts');
  const statusStoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/status-store.ts');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-poll-dual-conflict-'));
  const swarmDir = path.join(root, '.swarm');
  const modulesDir = path.join(swarmDir, 'modules');
  const moduleDir = path.join(modulesDir, '01-scaffold');
  fs.mkdirSync(moduleDir, { recursive: true });

  const redisModulePath = path.join(root, 'fake-redis-conflict-module.mjs');
  fs.writeFileSync(redisModulePath, `export default { async readCompletion() { return {
    module_id: '01',
    status: 'PASS',
    outcome: 'PASS',
    source: 'buster-pipeline',
    run_id: 'run-poll-dual-conflict-1',
    attempt: 1,
    dispatch_id: 'dispatch-poll-dual-conflict-1',
    summary: 'Redis says pass while local terminal state says fail.'
  }; } };\n`);

  const redisAdapter = {
    ...(await import(`file://${redisModulePath}`)).default,
    async archiveCompletions() { return { archived: 0 }; },
  };

  const pollConfig = {
    project: 'behavior-poll-dual-conflict',
    _runId: 'run-poll-dual-conflict-1',
    run_id: 'run-poll-dual-conflict-1',
    acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
    paths: { swarm_dir: swarmDir, modules_dir: modulesDir },
    _progress: { modules: { '01': { dir: '01-scaffold' } }, gates: {}, execution_order: ['01'] },
  };
  const readModels = statusStoreMod.loadLifecycleReadModels(pollConfig);
  readModels.modules['01'] = {
    module_id: '01',
    module_dir: '01-scaffold',
    status: 'FAIL',
    current_phase: null,
    current_attempt: 1,
    dispatch_id: 'dispatch-poll-dual-conflict-1',
    projection_source: 'canonical-events',
  };
  statusStoreMod.saveLifecycleReadModels(pollConfig, readModels);

    const deps = {
      completionEventAdapters: {
        RedisCtor: makeRedisCompletionCtor([redisCompletionEntry('behavior-poll-dual-conflict', '01', {
          status: 'PASS',
          outcome: 'PASS',
          source: 'buster-pipeline',
          run_id: 'run-poll-dual-conflict-1',
          attempt: 1,
          dispatch_id: 'dispatch-poll-dual-conflict-1',
          summary: 'Redis says pass while local terminal state says fail.',
        })]),
      },
    };

const result = await pollingMod.pollDual({
    ...pollConfig,
    agents: {
      buster: {
        dispatch: 'redis',
        redis_js_path: redisModulePath,
      },
    },
        poll_interval_seconds: 0.01,
  }, '01-scaffold', '01', ['PASS'], 1, {
    run_id: 'run-poll-dual-conflict-1',
    attempt: 1,
    dispatch_id: 'dispatch-poll-dual-conflict-1',
  }, { deps });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'completion_conflict');
  assert.equal(result.status.redis_status, 'PASS');
  assert.equal(result.status.local_status, 'FAIL');
  assert.equal(result.status.authority_policy.code, 'redis_terminal_conflicts_with_terminal_status');
  assert.equal(result.status.drift.some((entry) => entry.code === 'redis_terminal_conflicts_with_terminal_status'), true);
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
  process.env.OPENCLAW_GATEWAY_TOKEN = '';

  try {
    gitMod.setRepoRoot(repoRoot);
    const config = {
      ...platformPollingDefaults(),
      repo_root: repoRoot,
      project: 'behavior-demo',
      poll_interval_seconds: 0.2,
      session_end_grace_ms: 0,
      acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
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
  process.env.OPENCLAW_GATEWAY_TOKEN = '';
  console.error = (...args) => { logs.push(args.join(' ')); };

  try {
    gitMod.setRepoRoot(repoRoot);
    const config = {
      ...platformPollingDefaults(),
      repo_root: repoRoot,
      project: 'behavior-demo',
      poll_interval_seconds: 0.01,
      session_end_grace_ms: 0,
      session_progress_log_interval_ms: 1000,
      acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
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
  process.env.OPENCLAW_GATEWAY_TOKEN = '';
  console.error = (...args) => { logs.push(args.join(' ')); };
  Date.now = () => {
    const current = fakeNow;
    fakeNow += 1100;
    return current;
  };

  try {
    gitMod.setRepoRoot(repoRoot);
    const config = {
      ...platformPollingDefaults(),
      repo_root: repoRoot,
      project: 'behavior-demo',
      poll_interval_seconds: 0.01,
      session_end_grace_ms: 0,
      session_progress_log_interval_ms: 60000,
      acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
      paths: { swarm_dir: path.join(repoRoot, '.swarm') },
    };
    lifecycleTestModBase.trackAgent(config, 'forge-throttle-elapsed', 'session-throttle-elapsed', null, 'forge-throttle-elapsed', null, { moduleId: '01', runtime: 'acp' });

    const result = await pollingMod.pollForSessionEnd(config, 'forge-throttle-elapsed', 10, 'session-throttle-elapsed-check');

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
  process.env.OPENCLAW_GATEWAY_TOKEN = '';

  try {
    gitMod.setRepoRoot(repoRoot);
    const config = {
      ...platformPollingDefaults(),
      repo_root: repoRoot,
      project: 'behavior-demo',
      poll_interval_seconds: 0.01,
      session_end_grace_ms: 80,
      session_nudge_threshold: 0,
      acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
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
  const swarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-session-single-nudge-swarm-'));
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
  process.env.OPENCLAW_GATEWAY_TOKEN = '';

  try {
    gitMod.setRepoRoot(repoRoot);
    const config = {
      ...platformPollingDefaults(),
      repo_root: repoRoot,
      project: 'behavior-demo',
      poll_interval_seconds: 0.01,
      session_end_grace_ms: 0,
      session_nudge_threshold: 0,
      acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
      paths: { swarm_dir: swarmDir },
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

  const pollingTestMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.ts');
  const lifecycleTestMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/agents/lifecycle.ts');

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
  process.env.OPENCLAW_GATEWAY_TOKEN = '';
  console.error = (...args) => { logs.push(args.join(' ')); };

  try {
    const config = {
      ...platformPollingDefaults(),
      project: 'behavior-file-poll-throttle',
      repo_root: repoRoot,
      poll_interval_seconds: 0.01,
      poll_progress_log_interval_ms: 1000,
      acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
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

  const pollingTestMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.ts');
  const lifecycleTestMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/agents/lifecycle.ts');

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
  process.env.OPENCLAW_GATEWAY_TOKEN = '';

  try {
    const config = {
      ...platformPollingDefaults(),
      project: 'behavior-file-poll-no-output',
      repo_root: repoRoot,
      poll_interval_seconds: 0.01,
      acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
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
    assert.equal(result.status.detail.startsWith('[redacted transcript_detail;'), true);
    assert.equal(result.transcript?.type, 'transcript.summary');
    assert.equal(result.transcript?.redacted, true);
    assert.equal(result.transcript?.eventCount, 1);
    assert.equal(result.transcript?.new_line_count, 1);
    assert.equal(result.transcript?.newLines, undefined);
    assert.equal(JSON.stringify(result.transcript).includes('still working'), false);
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
  const pollingRuntimeCoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const pollingTestMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.ts');
  const lifecycleTestMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/agents/lifecycle.ts');

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
  process.env.OPENCLAW_GATEWAY_TOKEN = '';

  try {
    const config = {
      ...platformPollingDefaults(),
      project: 'behavior-file-poll-rate-limit',
      repo_root: repoRoot,
      poll_interval_seconds: 0.01,
      _runId: runId,
      run_id: runId,
      _runStats: pollingRuntimeCoreMod.createRunStats('2026-04-15T08:00:00.000Z'),
      pluginRegistry: await buildBuiltInRegistry(pollingRuntimeRoot),
      acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
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
  const pollingRuntimeCoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const pollingTestMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.ts');
  const lifecycleTestMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/agents/lifecycle.ts');

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
  process.env.OPENCLAW_GATEWAY_TOKEN = '';

  try {
    const config = {
      ...platformPollingDefaults(),
      project: 'behavior-pipeline-review-file-poll-rate-limit',
      repo_root: repoRoot,
      poll_interval_seconds: 0.01,
      _runId: runId,
      run_id: runId,
      _runStats: pollingRuntimeCoreMod.createRunStats('2026-04-16T03:30:00.000Z'),
      pluginRegistry: await buildBuiltInRegistry(pollingRuntimeRoot),
      acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
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
  const pollingRuntimeCoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const pollingTestMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.ts');
  const lifecycleTestMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/agents/lifecycle.ts');

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
  process.env.OPENCLAW_GATEWAY_TOKEN = '';

  try {
    const config = {
      ...platformPollingDefaults(),
      project: 'behavior-case-study-file-poll-rate-limit',
      repo_root: repoRoot,
      poll_interval_seconds: 0.01,
      _runId: runId,
      run_id: runId,
      _runStats: pollingRuntimeCoreMod.createRunStats('2026-04-16T03:35:00.000Z'),
      pluginRegistry: await buildBuiltInRegistry(pollingRuntimeRoot),
      acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
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

  const telemetryRuntimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const telemetryPollingMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/polling.ts');
  const telemetryShutdownMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/agents/lifecycle.ts');
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
  process.env.OPENCLAW_GATEWAY_TOKEN = '';

  try {
    const runId = 'run-session-rate-limit-1';
    const config = {
      ...platformPollingDefaults(),
      project: 'behavior-session-rate-limit',
      repo_root: repoRoot,
      telemetry: { enabled: true },
      poll_interval_seconds: 0.01,
      session_end_grace_ms: 0,
      rate_limit: { cooldown_hours: 0, max_pauses_per_module: 1 },
      acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
      _runId: runId,
      run_id: runId,
      _runStats: telemetryRuntimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      pluginRegistry: await buildBuiltInRegistry(telemetryRuntimeRoot),
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

  const telemetryRuntimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const telemetryPollingMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/polling.ts');
  const telemetryShutdownMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/agents/lifecycle.ts');

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
    process.env.OPENCLAW_GATEWAY_TOKEN = '';

    try {
      const config = {
        ...platformPollingDefaults(),
        project: scenario.project,
        repo_root: repoRoot,
        telemetry: { enabled: true },
        poll_interval_seconds: 0.01,
        session_end_grace_ms: 0,
        rate_limit: { cooldown_hours: 0, max_pauses_per_module: 1 },
        _disable_discord_webhooks: true,
        _runId: scenario.runId,
        run_id: scenario.runId,
        _runStats: telemetryRuntimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
        pluginRegistry: await buildBuiltInRegistry(telemetryRuntimeRoot),
        acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
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
      assert.equal(pauseEntry.fields.some((field) => field.name === 'Gateway Label' && field.value === scenario.trackedGatewayLabel), true, `${scenario.name}: pause gateway label`);
      assert.equal(pauseEntry.fields.some((field) => field.name === 'Session' && field.value === scenario.sessionKey), true, `${scenario.name}: pause session`);
      assert.equal(resumeEntry.description, scenario.expectedResumeDescription, `${scenario.name}: resume description`);
      assert.equal(resumeEntry.fields.some((field) => field.name === 'Run ID' && field.value === scenario.runId), true, `${scenario.name}: resume run id`);
      assert.equal(resumeEntry.fields.some((field) => field.name === 'Gate' && field.value === scenario.gateId), true, `${scenario.name}: resume gate id`);
      assert.equal(resumeEntry.fields.some((field) => field.name === 'Gate Type' && field.value === scenario.gateType), true, `${scenario.name}: resume gate type`);
      assert.equal(resumeEntry.fields.some((field) => field.name === 'Dispatch' && field.value === scenario.dispatchId), true, `${scenario.name}: resume dispatch`);
      assert.equal(resumeEntry.fields.some((field) => field.name === 'Gateway Label' && field.value === scenario.trackedGatewayLabel), true, `${scenario.name}: resume gateway label`);
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

  const telemetryRuntimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const telemetryPollingMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/polling.ts');
  const telemetryShutdownMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/agents/lifecycle.ts');

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
    process.env.OPENCLAW_GATEWAY_TOKEN = '';

    try {
      const config = {
        ...platformPollingDefaults(),
        project: scenario.project,
        repo_root: repoRoot,
        telemetry: { enabled: true },
        poll_interval_seconds: 0.01,
        session_end_grace_ms: 0,
        rate_limit: { cooldown_hours: 0, max_pauses_per_module: 0 },
        _runId: scenario.runId,
        run_id: scenario.runId,
        _runStats: telemetryRuntimeCoreMod.createRunStats('2026-04-15T00:00:00.000Z'),
        pluginRegistry: await buildBuiltInRegistry(telemetryRuntimeRoot),
        acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
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

  const telemetryRuntimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const telemetryPollingMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/polling.ts');
  const telemetryShutdownMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/agents/lifecycle.ts');
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
  process.env.OPENCLAW_GATEWAY_TOKEN = '';

  try {
    const runId = 'run-session-gate-telemetry-1';
    const sessionKey = 'agent:main:acp:gatefix-gate-review-1';
    const config = {
      ...platformPollingDefaults(),
      project: 'behavior-session-gate-telemetry',
      repo_root: repoRoot,
      telemetry: { enabled: true },
      poll_interval_seconds: 0.01,
      session_end_grace_ms: 0,
      session_progress_emit_interval_ms: 0,
      acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
      _runId: runId,
      run_id: runId,
      _runStats: telemetryRuntimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
      pluginRegistry: await buildBuiltInRegistry(telemetryRuntimeRoot),
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

  const telemetryRuntimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const telemetryPollingMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/polling.ts');
  const telemetryShutdownMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/agents/lifecycle.ts');
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
  process.env.OPENCLAW_GATEWAY_TOKEN = '';

  try {
    const runId = 'run-transcript-obsv';
    const config = {
      ...platformPollingDefaults(),
      project: 'behavior-demo',
      repo_root: repoRoot,
      telemetry: { enabled: true },
      poll_interval_seconds: 0.01,
      session_end_grace_ms: 0,
      acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
      _runId: runId,
      run_id: runId,
      _runStats: telemetryRuntimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      pluginRegistry: await buildBuiltInRegistry(telemetryRuntimeRoot),
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

  const telemetryRuntimeCoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const telemetryPollingMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.ts');
  const statusStoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/status-store.ts');
  const repoRoot = createCleanPollingRepo('behavior-pollstatus-obsv-');

  const runId = 'run-pollstatus-obsv-1';
  const swarmDir = path.join(repoRoot, '.swarm');
  const moduleDir = path.join(swarmDir, 'modules', '01-scaffold');
  fs.mkdirSync(moduleDir, { recursive: true });

  const sessionKey = 'agent:main:acp:pollstatus-top-level-01';
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
      ...platformPollingDefaults(),
      project: 'behavior-pollstatus-obsv',
      repo_root: repoRoot,
      telemetry: { enabled: true },
      poll_interval_seconds: 0.01,
      acp_monitor: { unknown_poll_limit: 1, stale_poll_limit: 0, max_transcript_extensions: 3, transcript_grace_ms: 300000, monitor_poll_ms: 0 },
      _runId: runId,
      run_id: runId,
      _runStats: telemetryRuntimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
      pluginRegistry: await buildBuiltInRegistry(pollingRuntimeRoot),
      paths: {
        swarm_dir: swarmDir,
        modules_dir: path.join(swarmDir, 'modules'),
      },
      _progress: { modules: { '01': { dir: '01-scaffold' } }, gates: {}, execution_order: ['01'] },
    };
    const readModels = statusStoreMod.loadLifecycleReadModels(config);
    readModels.modules['01'] = {
      module_id: '01',
      module_dir: '01-scaffold',
      title: 'Scaffold',
      status: 'IN_PROGRESS',
      current_phase: 'forge',
      session_key: sessionKey,
      projection_source: 'canonical-events',
    };
    statusStoreMod.saveLifecycleReadModels(config, readModels);

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

  const telemetryRuntimeCoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const telemetryPollingMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.ts');
  const statusStoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/status-store.ts');
  const telemetryShutdownMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/agents/lifecycle.ts');
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

  const gateway = await startGatewayServer(async () => ({ result: { details: { acp: { state: 'closed' } } } }));
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const prevGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  process.env.OPENCLAW_GATEWAY_URL = gateway.url;
  process.env.OPENCLAW_GATEWAY_TOKEN = '';

  try {
    const config = {
      ...platformPollingDefaults(),
      project: 'behavior-pollstatus-live',
      repo_root: repoRoot,
      telemetry: { enabled: true },
      poll_interval_seconds: 0.01,
      session_progress_emit_interval_ms: 0,
      session_end_grace_ms: 0,
      acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
      _runId: runId,
      run_id: runId,
      _runStats: telemetryRuntimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
      pluginRegistry: await buildBuiltInRegistry(pollingRuntimeRoot),
      paths: {
        swarm_dir: swarmDir,
        modules_dir: path.join(swarmDir, 'modules'),
      },
      _progress: { modules: { '01': { dir: '01-scaffold' } }, gates: {}, execution_order: ['01'] },
    };

    const readModels = statusStoreMod.loadLifecycleReadModels(config);
    readModels.modules['01'] = {
      module_id: '01',
      module_dir: '01-scaffold',
      title: 'Scaffold',
      status: 'IN_PROGRESS',
      current_phase: 'forge',
      session_key: sessionKey,
      projection_source: 'canonical-events',
    };
    statusStoreMod.saveLifecycleReadModels(config, readModels);

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
    assert.equal(result.transcript?.type, 'transcript.summary');
    assert.equal(result.transcript?.redacted, true);
    assert.equal(result.transcript?.eventCount, 1);
    assert.equal(result.transcript?.lastActivityPoll, 0);
    assert.equal(result.transcript?.newLines, undefined);
    assert.equal(JSON.stringify(result.transcript).includes('forge progress update'), false);

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

await record('pollStatus preserves tracked rate-limit correlation on lifecycle RATE_LIMITED returns', async () => {
  const pollingRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  installFakeRedis(pollingRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const telemetryRuntimeCoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const telemetryPollingMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.ts');
  const statusStoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/status-store.ts');
  const telemetryShutdownMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/agents/lifecycle.ts');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-pollstatus-primary-rate-limit-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const moduleDir = path.join(swarmDir, 'modules', '01-scaffold');
  fs.mkdirSync(moduleDir, { recursive: true });

  const runId = 'run-pollstatus-primary-rate-limit';
  const sessionKey = 'agent:main:acp:pollstatus-primary-rate-limit-01';
  const trackingKey = 'forge-01-primary-rate-limit';
  const gatewayLabel = 'forge-01-primary-rate-limit-gateway';

  try {
    const config = {
      ...platformPollingDefaults(),
      project: 'behavior-pollstatus-primary-rate-limit',
      repo_root: repoRoot,
      telemetry: { enabled: true },
      poll_interval_seconds: 0.01,
      acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
      _runId: runId,
      run_id: runId,
      _runStats: telemetryRuntimeCoreMod.createRunStats('2026-04-15T08:00:00.000Z'),
      pluginRegistry: await buildBuiltInRegistry(pollingRuntimeRoot),
      paths: {
        swarm_dir: swarmDir,
        modules_dir: path.join(swarmDir, 'modules'),
      },
      _progress: { modules: { '01': { dir: '01-scaffold' } }, gates: {}, execution_order: ['01'] },
    };

    const readModels = statusStoreMod.loadLifecycleReadModels(config);
    readModels.modules['01'] = {
      module_id: '01',
      module_dir: '01-scaffold',
      title: 'Scaffold',
      status: 'RATE_LIMITED',
      current_phase: 'forge',
      projection_source: 'canonical-events',
    };
    readModels.active_sessions.modules['01'] = {
      module_id: '01',
      run_id: runId,
      attempt: 4,
      dispatch_id: 'dispatch-pollstatus-primary-rate-limit-1',
      session_key: sessionKey,
      gateway_label: gatewayLabel,
      label: trackingKey,
      runtime: 'acp',
      model: 'openai-codex/gpt-5.4',
      phase: 'forge',
      projection_source: 'canonical-events',
    };
    statusStoreMod.saveLifecycleReadModels(config, readModels);

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

  const telemetryRuntimeCoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const telemetryPollingMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.ts');
  const statusStoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/status-store.ts');
  const telemetryShutdownMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/agents/lifecycle.ts');
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

  const gateway = await startGatewayServer(async () => ({ result: { details: { acp: { state: 'running' } } } }));
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const prevGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  process.env.OPENCLAW_GATEWAY_URL = gateway.url;
  process.env.OPENCLAW_GATEWAY_TOKEN = '';

  try {
    const config = {
      ...platformPollingDefaults(),
      project: 'behavior-pollstatus-rate-limit',
      repo_root: repoRoot,
      telemetry: { enabled: true },
      poll_interval_seconds: 0.01,
      session_progress_emit_interval_ms: 0,
      acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
      _runId: runId,
      run_id: runId,
      _runStats: telemetryRuntimeCoreMod.createRunStats('2026-04-15T08:00:00.000Z'),
      pluginRegistry: await buildBuiltInRegistry(pollingRuntimeRoot),
      paths: {
        swarm_dir: swarmDir,
        modules_dir: path.join(swarmDir, 'modules'),
      },
      _progress: { modules: { '01': { dir: '01-scaffold' } }, gates: {}, execution_order: ['01'] },
    };

    const readModels = statusStoreMod.loadLifecycleReadModels(config);
    readModels.modules['01'] = {
      module_id: '01',
      module_dir: '01-scaffold',
      title: 'Scaffold',
      status: 'IN_PROGRESS',
      current_phase: 'forge',
      projection_source: 'canonical-events',
    };
    readModels.active_sessions.modules['01'] = {
      module_id: '01',
      run_id: runId,
      attempt: 4,
      dispatch_id: 'dispatch-pollstatus-rate-limit-1',
      session_key: sessionKey,
      gateway_label: gatewayLabel,
      label: trackingKey,
      runtime: 'acp',
      model: 'openai-codex/gpt-5.4',
      phase: 'forge',
      projection_source: 'canonical-events',
    };
    statusStoreMod.saveLifecycleReadModels(config, readModels);

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

  const telemetryRuntimeCoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const telemetryPollingMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.ts');
  const statusStoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/status-store.ts');
  const telemetryShutdownMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/agents/lifecycle.ts');
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

  const gateway = await startGatewayServer(async () => ({ result: { details: { acp: { state: 'closed' } } } }));
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const prevGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  process.env.OPENCLAW_GATEWAY_URL = gateway.url;
  process.env.OPENCLAW_GATEWAY_TOKEN = '';

  try {
    const config = {
      ...platformPollingDefaults(),
      project: 'behavior-pollstatus-live-dispatch-fallback',
      repo_root: repoRoot,
      telemetry: { enabled: true },
      poll_interval_seconds: 0.01,
      session_progress_emit_interval_ms: 0,
      session_end_grace_ms: 0,
      acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
      _runId: runId,
      run_id: runId,
      _runStats: telemetryRuntimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
      pluginRegistry: await buildBuiltInRegistry(pollingRuntimeRoot),
      paths: {
        swarm_dir: swarmDir,
        modules_dir: path.join(swarmDir, 'modules'),
      },
      _progress: { modules: { '01': { dir: '01-scaffold' } }, gates: {}, execution_order: ['01'] },
    };

    const readModels = statusStoreMod.loadLifecycleReadModels(config);
    readModels.modules['01'] = {
      module_id: '01',
      module_dir: '01-scaffold',
      title: 'Scaffold',
      status: 'IN_PROGRESS',
      current_phase: 'forge',
      dispatch_id: liveDispatchId,
      session_key: sessionKey,
      projection_source: 'canonical-events',
    };
    readModels.active_sessions.modules['01'] = {
      module_id: '01',
      run_id: runId,
      dispatch_id: liveDispatchId,
      session_key: sessionKey,
      projection_source: 'canonical-events',
    };
    statusStoreMod.saveLifecycleReadModels(config, readModels);

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
    assert.equal(transcript.label, staleGatewayLabel);
    assert.equal(transcript.dispatch_id, liveDispatchId);
    assert.equal(transcript.session_key, sessionKey);

    const progress = events.find((event) => event.type === 'agent.progress');
    assert(progress, 'missing pollStatus dispatch-backed agent.progress event');
    assert.equal(progress.label, staleGatewayLabel);
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

  const telemetryPollingMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.ts');
  const telemetryShutdownMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/agents/lifecycle.ts');
  const statusStoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/status-store.ts');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-pollstatus-terminal-detail-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const moduleDir = path.join(swarmDir, 'modules', '01-scaffold');
  fs.mkdirSync(moduleDir, { recursive: true });

  const transcriptPath = path.join(repoRoot, 'forge-terminal-detail-transcript.jsonl');
  fs.writeFileSync(transcriptPath, `${JSON.stringify({ kind: 'lifecycle', phase: 'error', data: { error: 'adapter command missing' } })}\n`);

  const sessionKey = 'agent:main:acp:pollstatus-terminal-detail-01';
  const trackingKey = 'forge-01-terminal-detail';

  const gateway = await startGatewayServer(async () => ({ result: { details: { acp: { state: 'closed' } } } }));
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const prevGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  process.env.OPENCLAW_GATEWAY_URL = gateway.url;
  process.env.OPENCLAW_GATEWAY_TOKEN = '';

  try {
    const config = {
      ...platformPollingDefaults(),
      project: 'behavior-pollstatus-terminal-detail',
      repo_root: repoRoot,
      _runId: 'run-pollstatus-terminal-detail',
      run_id: 'run-pollstatus-terminal-detail',
      poll_interval_seconds: 0.01,
      acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
      paths: {
        swarm_dir: swarmDir,
        modules_dir: path.join(swarmDir, 'modules'),
      },
    };
    const readModels = statusStoreMod.loadLifecycleReadModels(config);
    readModels.modules['01'] = {
      module_id: '01',
      module_dir: '01-scaffold',
      title: 'Scaffold',
      status: 'IN_PROGRESS',
      current_phase: 'forge',
      session_key: sessionKey,
      projection_source: 'canonical-events',
    };
    statusStoreMod.saveLifecycleReadModels(config, readModels);

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
    assert.equal(result.status?.detail.startsWith('[redacted transcript_detail;'), true);
    assert.equal(result.status?.detail.includes('adapter command missing'), false);
    assert.equal(result.status?.state, 'closed');
    assert.equal(result.transcript?.type, 'transcript.summary');
    assert.equal(result.transcript?.redacted, true);
    assert.equal(result.transcript?.lastDetail, undefined);
    assert.equal(result.transcript?.detail_summary.startsWith('[redacted transcript_detail;'), true);
    assert.equal(result.transcript?.detail_summary.includes('adapter command missing'), false);
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

  const telemetryRuntimeCoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const telemetryPollingMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.ts');
  const telemetryShutdownMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/agents/lifecycle.ts');
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
  process.env.OPENCLAW_GATEWAY_TOKEN = '';

  try {
    const runId = 'run-pollfile-obsv';
    const config = {
      ...platformPollingDefaults(),
      project: 'behavior-pollfile-obsv',
      repo_root: repoRoot,
      telemetry: { enabled: true },
      poll_interval_seconds: 0.01,
      session_end_grace_ms: 0,
      acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
      _runId: runId,
      run_id: runId,
      _runStats: telemetryRuntimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
      pluginRegistry: await buildBuiltInRegistry(pollingRuntimeRoot),
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

  const telemetryRuntimeCoreMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const telemetryPollingMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/services/polling.ts');
  const telemetryShutdownMod = await importRuntimeModule(pollingRuntimeRoot, '/app/skills/pipeline/agents/lifecycle.ts');
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
  process.env.OPENCLAW_GATEWAY_TOKEN = '';

  try {
    const runId = 'run-pollfile-live-telemetry';
    const sessionKey = 'agent:main:acp:pipeline-review-1';
    const trackingKey = 'pipeline-review-gpt-5.4';
    const gatewayLabel = 'pipeline-review-123';
    const config = {
      ...platformPollingDefaults(),
      project: 'behavior-pollfile-live-telemetry',
      repo_root: repoRoot,
      telemetry: { enabled: true },
      poll_interval_seconds: 0.01,
      session_progress_emit_interval_ms: 0,
      acp_monitor: EXPLICIT_ACP_MONITOR_CONFIG,
      _runId: runId,
      run_id: runId,
      _runStats: telemetryRuntimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
      pluginRegistry: await buildBuiltInRegistry(pollingRuntimeRoot),
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
