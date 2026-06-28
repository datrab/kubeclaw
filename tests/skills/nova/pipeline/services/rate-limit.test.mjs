import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { transitionModuleStatus } from '../../../../../skills/nova/pipeline/lifecycle-state.ts';
import {
  createTrackedModuleSessionRateLimitRecoveryOptions,
  createGateSessionRateLimitExhaustionOptions,
  createModuleSessionRateLimitExhaustionOptions,
  emitGateRetryExhausted,
  finalizeGateSessionRateLimitExit,
  handleSessionRateLimit,
  resumeDurableCooldownForStep,
} from '../../../../../skills/nova/pipeline/services/rate-limit.ts';
import { onSummaryCompleted } from '../../../../../skills/nova/pipeline/services/telemetry.ts';
import {
  appendCooldownLifecycleEvent,
  getLifecycleCooldown,
  loadStatus,
  readLifecycleEvents,
  saveStatus,
  saveLifecycleReadModels,
} from '../../../../../skills/nova/pipeline/services/status-store.ts';

function makeConfig() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rate-limit-test-'));
  const swarmDir = path.join(root, '.swarm');
  fs.mkdirSync(swarmDir, { recursive: true });
  return {
    project: 'rate-limit-test',
    repo_root: root,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(swarmDir, 'modules'),
    },
    _runId: 'run-test',
    run_id: 'run-test',
    rate_limit: {
      max_pauses_per_module: 1,
      cooldown_hours: 0,
      cooldown_buffer_ms: 0,
    },
    locks: {
      lifecycle_append: { stale_ms: 1, timeout_ms: 1 },
      gate_active_session: { stale_ms: 1, timeout_ms: 1 },
    },
    _progress: {
      modules: {
        alpha: {
          dir: 'alpha',
          title: 'Alpha',
          stages: [],
        },
      },
    },
  };
}

function startModule(config, moduleDir = 'alpha') {
  const status = {
    module_id: 'alpha',
    title: 'Alpha',
    status: 'PENDING',
    current_phase: null,
    history: [],
    validation: {},
  };
  const started = transitionModuleStatus(status, 'IN_PROGRESS', {
    phase: 'forge',
    note: 'start module',
  });
  saveStatus(config, moduleDir, status, started);
  return loadStatus(config, moduleDir);
}

function readJsonl(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test('resume hook failure leaves lifecycle cooldown open', async () => {
  const config = makeConfig();

  await assert.rejects(
    () => handleSessionRateLimit(config, {
      module_id: 'alpha',
      current_phase: 'forge',
    }, {
      pauseCount: 1,
      maxPauses: 1,
      cooldownHours: 0,
      cooldownBufferMs: 0,
      suppressPausePresentation: true,
      sleepFn: async () => {},
      onResume: async () => {
        throw new Error('resume hook failed');
      },
    }),
    /resume hook failed/,
  );

  const cooldown = getLifecycleCooldown(config, {
    stepType: 'module',
    stepId: 'alpha',
  });
  assert.equal(cooldown.open, true);
});

test('tracked module resume sync runs before custom resume hook', async () => {
  const config = makeConfig();
  startModule(config);

  const recoveryOptions = createTrackedModuleSessionRateLimitRecoveryOptions(config, 'alpha', {
    moduleId: 'alpha',
    phase: 'forge',
    onResume: async () => {
      throw new Error('custom resume failed');
    },
  });

  await recoveryOptions.onPause({
    status: {
      module_id: 'alpha',
      current_phase: 'forge',
    },
    cooldownHours: 0,
  });
  assert.equal(loadStatus(config, 'alpha').status, 'RATE_LIMITED');

  await assert.rejects(
    () => recoveryOptions.onResume({
      status: {
        module_id: 'alpha',
        current_phase: 'forge',
      },
    }),
    /custom resume failed/,
  );

  assert.equal(loadStatus(config, 'alpha').status, 'IN_PROGRESS');
});

test('durable cooldown replay extends and passes runtime budget', async () => {
  const config = makeConfig();
  const budgetCalls = [];
  const sleepCalls = [];
  const budget = {
    extendForRateLimit: (ms, meta) => {
      budgetCalls.push({ ms, meta });
    },
  };

  appendCooldownLifecycleEvent(config, 'rate_limit.cooldown_started', {
    moduleId: 'alpha',
    attempt: 1,
    pauseCount: 1,
    maxPauses: 1,
    cooldownHours: 1,
    resumeAt: new Date(Date.now() + 60_000).toISOString(),
    detail: 'rate limited',
    agentType: 'forge',
  });

  const result = await resumeDurableCooldownForStep(config, config._progress, {
    type: 'module',
    id: 'alpha',
  }, {
    budget,
    cooldownBufferMs: 123,
    sleepFn: async (ms, options) => {
      sleepCalls.push({ ms, options });
    },
  });

  assert.equal(result.resumed, true);
  assert.equal(budgetCalls.length, 1);
  assert.ok(budgetCalls[0].ms > 0);
  assert.equal(budgetCalls[0].meta.bufferMs, 123);
  assert.equal(budgetCalls[0].meta.reason, 'authorized_rate_limit_cooldown');
  assert.equal(sleepCalls.length, 1);
  assert.equal(sleepCalls[0].ms, budgetCalls[0].ms);
  assert.deepEqual(sleepCalls[0].options, { budget });
  assert.equal(getLifecycleCooldown(config, { stepType: 'module', stepId: 'alpha' }).open, false);
});

test('durable cooldown replay leaves invalid resume_at cooldown open', async () => {
  const config = makeConfig();
  const budgetCalls = [];
  const sleepCalls = [];

  appendCooldownLifecycleEvent(config, 'rate_limit.cooldown_started', {
    moduleId: 'alpha',
    attempt: 1,
    pauseCount: 1,
    maxPauses: 1,
    cooldownHours: 1,
    resumeAt: 'not-a-date',
    detail: 'rate limited',
    agentType: 'forge',
  });

  const result = await resumeDurableCooldownForStep(config, config._progress, {
    type: 'module',
    id: 'alpha',
  }, {
    budget: {
      extendForRateLimit: (ms, meta) => {
        budgetCalls.push({ ms, meta });
      },
    },
    sleepFn: async (ms, options) => {
      sleepCalls.push({ ms, options });
    },
  });

  assert.equal(result.resumed, false);
  assert.equal(result.error, 'invalid_rate_limit_cooldown_resume_at');
  assert.equal(budgetCalls.length, 0);
  assert.equal(sleepCalls.length, 0);
  assert.equal(getLifecycleCooldown(config, { stepType: 'module', stepId: 'alpha' }).open, true);
  assert.equal(readLifecycleEvents(config).filter((event) => event.type === 'rate_limit.cooldown_completed').length, 0);

  const operatorAlerts = readJsonl(path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'operator-alerts.jsonl'));
  assert.ok(operatorAlerts.some((alert) => (
    alert.payload?.reason === 'invalid_rate_limit_cooldown_resume_at'
    && alert.payload?.module_id === 'alpha'
    && alert.payload?.resume_at === 'not-a-date'
  )));
});

test('durable cooldown replay rejects non-string serialized resume_at values', async () => {
  const config = makeConfig();

  appendCooldownLifecycleEvent(config, 'rate_limit.cooldown_started', {
    moduleId: 'alpha',
    attempt: 1,
    pauseCount: 1,
    maxPauses: 1,
    cooldownHours: 1,
    resumeAt: new Date(Date.now() + 60_000).toISOString(),
    detail: 'rate limited',
    agentType: 'forge',
  });
  const readModels = config._lifecycleReadModelsCache;
  readModels.cooldowns.modules.alpha.resume_at = true;
  saveLifecycleReadModels(config, readModels);

  const result = await resumeDurableCooldownForStep(config, config._progress, {
    type: 'module',
    id: 'alpha',
  });

  assert.equal(result.resumed, false);
  assert.equal(result.error, 'invalid_rate_limit_cooldown_resume_at');
  assert.equal(getLifecycleCooldown(config, { stepType: 'module', stepId: 'alpha' }).open, true);
  assert.equal(readLifecycleEvents(config).filter((event) => event.type === 'rate_limit.cooldown_completed').length, 0);

  const operatorAlerts = readJsonl(path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'operator-alerts.jsonl'));
  assert.ok(operatorAlerts.some((alert) => (
    alert.payload?.reason === 'invalid_rate_limit_cooldown_resume_at'
    && alert.payload?.module_id === 'alpha'
    && alert.payload?.resume_at === true
  )));
});

test('gate failure telemetry emits when exhaustion beforeReturn hook fails', async () => {
  const config = makeConfig();

  const exitResult = await finalizeGateSessionRateLimitExit({
    rate_limit_status: {
      attempt: 2,
      dispatch_id: 'dispatch-1',
      gateway_label: 'gateway-1',
      session_key: 'session-1',
    },
    rate_limit_pauses: 2,
    max_rate_limit_pauses: 1,
  }, {
    config,
    gateId: 'review-gate',
    gateType: 'review',
    phase: 'review',
    identity: { run_id: config._runId },
    runId: config._runId,
    telemetryCtx: { config },
    beforeReturn: async () => {
      throw new Error('custom beforeReturn failed');
    },
    logMessage: null,
  });

  assert.equal(exitResult.reason, 'rate_limit_exhausted');

  const pipelineEvents = readJsonl(path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'pipeline.jsonl'));
  assert.ok(pipelineEvents.some((event) => (
    event.type === 'gate.verdict'
    && event.gate_id === 'review-gate'
    && event.verdict === 'FAIL'
    && event.reason === 'rate_limit_exhausted'
  )));

  const operatorAlerts = readJsonl(path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'operator-alerts.jsonl'));
  assert.ok(operatorAlerts.some((alert) => (
    alert.payload?.reason === 'rate_limit_exhaustion_delivery_failed'
    && alert.payload?.failed_hook === 'beforeReturn'
    && alert.payload?.error === 'custom beforeReturn failed'
  )));
});

test('rate-limit exhaustion telemetry helpers return awaitable delivery promises', async () => {
  const config = makeConfig();
  const exitResult = {
    attempt: 2,
    dispatch_id: 'dispatch-1',
    gateway_label: 'gateway-1',
    session_key: 'session-1',
    reason: 'rate_limit_exhausted',
    max_rate_limit_pauses: 1,
  };

  const gatePromise = emitGateRetryExhausted({ config }, 'review-gate', {
    gateType: 'review',
    phase: 'review',
    attempt: exitResult.attempt,
    maxAttempts: exitResult.max_rate_limit_pauses,
    reason: exitResult.reason,
    sessionKey: exitResult.session_key,
    dispatchId: exitResult.dispatch_id,
    gatewayLabel: exitResult.gateway_label,
  });
  assert.equal(typeof gatePromise?.then, 'function');
  await gatePromise;

  const gateOptions = createGateSessionRateLimitExhaustionOptions(config, {
    gateId: 'review-gate',
    gateType: 'review',
    phase: 'review',
    telemetryCtx: { config },
  });
  const gateHookPromise = gateOptions.emitRetryExhausted(exitResult);
  assert.equal(typeof gateHookPromise?.then, 'function');
  await gateHookPromise;

  const moduleOptions = createModuleSessionRateLimitExhaustionOptions(config, {
    moduleId: 'alpha',
    phase: 'forge',
  });
  const moduleHookPromise = moduleOptions.emitRetryExhausted(exitResult);
  assert.equal(typeof moduleHookPromise?.then, 'function');
  await moduleHookPromise;

  const summaryPromise = onSummaryCompleted({ config }, 'project_summary', {
    status: 'failed',
    reason: 'rate_limit_exhausted',
  });
  assert.equal(typeof summaryPromise?.then, 'function');
  await summaryPromise;
});
