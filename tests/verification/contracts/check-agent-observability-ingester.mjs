#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source-root') {
      args.sourceRoot = path.resolve(argv[i + 1]);
      i += 1;
    }
  }
  return args;
}

const { sourceRoot } = parseArgs();
const ingesterModule = await import(path.join(sourceRoot, 'skills/nova/pipeline/services/agent-observability-ingester/index.ts'));
const observabilityModule = await import(path.join(sourceRoot, 'skills/nova/pipeline/services/observability.ts'));
const contract = await import(path.join(sourceRoot, 'skills/common/pipeline/agent-observability/src/index.ts'));

class FakeRedis {
  constructor() {
    this.calls = [];
    this.newEntries = [];
    this.reclaimedEntries = [];
    this.pending = [0];
    this.payloadLength = 0;
    this.closed = false;
    this.status = 'wait';
  }

  async connect() {
    this.calls.push({ op: 'connect', args: [] });
    this.status = 'ready';
  }

  async ping() {
    this.calls.push({ op: 'ping', args: [] });
    return 'PONG';
  }

  async xgroup(...args) {
    this.calls.push({ op: 'xgroup', args });
    return 'OK';
  }

  async xreadgroup(...args) {
    this.calls.push({ op: 'xreadgroup', args });
    if (this.newEntries.length === 0) return null;
    return [[contract.AGENT_OBSERVABILITY_CONTROL_STREAM, [this.newEntries.shift()]]];
  }

  async call(...args) {
    this.calls.push({ op: 'call', args });
    if (args[0] !== 'XAUTOCLAIM') return null;
    if (this.reclaimedEntries.length === 0) return ['0-0', []];
    return ['0-0', [this.reclaimedEntries.shift()]];
  }

  async xack(...args) {
    this.calls.push({ op: 'xack', args });
    return 1;
  }

  async xadd(...args) {
    this.calls.push({ op: 'xadd', args });
    return `deadletter-${this.calls.filter((call) => call.op === 'xadd').length}`;
  }

  async xtrim(...args) {
    this.calls.push({ op: 'xtrim', args });
    return 1;
  }

  async xpending(...args) {
    this.calls.push({ op: 'xpending', args });
    return this.pending;
  }

  async xlen(...args) {
    this.calls.push({ op: 'xlen', args });
    return this.payloadLength;
  }

  async quit() {
    this.closed = true;
  }
}

function makeLogger() {
  const lines = [];
  return {
    lines,
    info: (line) => lines.push(['info', line]),
    warn: (line) => lines.push(['warn', line]),
    error: (line) => lines.push(['error', line]),
    debug: (line) => lines.push(['debug', line]),
  };
}

function makeEvent(type, payload, identity = {}) {
  const event = {
    v: 1,
    type,
    source: contract.AGENT_OBSERVABILITY_SOURCE,
    ts: '2026-05-16T20:00:00.000Z',
    identity: {
      run_id: 'run-ao2',
      project: 'kubeclaw-main',
      session_key: 'agent:forge:session-1',
      dispatch_id: 'dispatch-1',
      gateway_label: 'forge-dispatch-1',
      agent_type: 'forge',
      module_id: '01',
      ...identity,
    },
    payload,
    masking: {
      profile: contract.AGENT_OBSERVABILITY_MASKING_PROFILE,
      content: 'full',
      masked: [],
    },
  };
  assert.equal(contract.validateAgentObservabilityIngressEvent(event).ok, true);
  return event;
}

function entry(id, event) {
  return [id, [contract.AGENT_OBSERVABILITY_REDIS_DATA_FIELD, typeof event === 'string' ? event : JSON.stringify(event)]];
}

function createIngester(redis, extra = {}) {
  return ingesterModule.createAgentObservabilityIngester({
    config: {
      enabled: true,
      redisCommandTimeoutMs: 1000,
      controlLagDegradedThreshold: 1,
      payloadPressureDegradedThreshold: 1,
      redisNetworkIsolation: 'isolated',
    },
    env: {},
    logger: makeLogger(),
    redisClientFactory: () => redis,
    ...extra,
  });
}

const disabledRedis = new FakeRedis();
const disabled = ingesterModule.createAgentObservabilityIngester({
  env: {},
  redisClientFactory: () => disabledRedis,
  logger: makeLogger(),
});
assert.deepEqual(await disabled.processNext({}), { processed: 0, disabled: true });
assert.equal(disabledRedis.calls.length, 0);

const envOnlyRedis = new FakeRedis();
const envOnly = ingesterModule.createAgentObservabilityIngester({
  env: { OPENCLAW_AGENT_OBSERVABILITY_INGESTER_ENABLED: 'true' },
  redisClientFactory: () => envOnlyRedis,
  logger: makeLogger(),
});
assert.deepEqual(await envOnly.processNext({}), { processed: 0, disabled: true });
assert.equal(envOnlyRedis.calls.length, 0);
assert.throws(
  () => ingesterModule.resolveAgentObservabilityIngesterConfig({ enabled: 'true' }, {}),
  /enabled must be a boolean/,
  'ingester config must not string-coerce enabled from runtime config',
);
assert.throws(
  () => ingesterModule.resolveAgentObservabilityIngesterConfig({ pollBlockMs: '1000' }, {}),
  /pollBlockMs must be a positive integer/,
  'ingester config must not string-coerce numeric runtime config',
);
assert.equal(
  ingesterModule.resolveAgentObservabilityIngesterConfig({ enabled: true }, { REDIS_TLS: 'true' }).redisTls,
  true,
  'deployment env booleans remain accepted at the environment boundary',
);
assert.equal(
  ingesterModule.resolveAgentObservabilityIngesterConfig({ enabled: true }, { REDIS_TLS_ENABLED: 'true' }).redisTls,
  true,
  'deployment env aliases remain accepted at the environment boundary',
);

const emitted = [];
const redis = new FakeRedis();
redis.newEntries.push(entry('1-0', makeEvent('openclaw.agent.ended', {
  hook: 'agent_end',
  outcome: 'success',
  reason: 'done',
  duration_ms: 2500,
  final_messages: [{ role: 'assistant', content: 'finished' }],
})));
const ingester = createIngester(redis, {
  emitEvent: async (ctx, eventType, payload, options) => {
    emitted.push({ ctx, eventType, payload, options });
    return { ok: true };
  },
});
assert.deepEqual(await ingester.processNext({ run: 'ctx' }), { processed: 1 });
assert.equal(emitted.length, 1);
assert.equal(emitted[0].eventType, 'agent.ended');
assert.equal(emitted[0].payload.agent_type, 'forge');
assert.equal(emitted[0].payload.agent_scope, 'agent');
assert.equal(emitted[0].payload.outcome, 'success');
assert.equal(emitted[0].payload.duration_seconds, 2.5);
assert.equal(emitted[0].payload.final_message_count, 1);
assert.equal(redis.calls.some((call) => call.op === 'xreadgroup'), true);
assert.equal(redis.calls.findIndex((call) => call.op === 'connect') < redis.calls.findIndex((call) => call.op === 'xgroup'), true, 'ingester must connect before creating consumer groups');
assert.equal(redis.calls.findIndex((call) => call.op === 'ping') < redis.calls.findIndex((call) => call.op === 'xgroup'), true, 'ingester must confirm Redis is writable before stream setup');
assert.equal(redis.calls.some((call) => call.op === 'xack' && call.args[2] === '1-0'), true);
assert.equal(ingester.getStats().emitted, 1);

redis.newEntries.push(entry('2-0', '{ bad json'));
await ingester.processNext({});
assert.equal(ingester.getStats().deadLettered, 1);
const deadLetter = redis.calls.find((call) => call.op === 'xadd');
assert.equal(deadLetter.args[0], contract.AGENT_OBSERVABILITY_DEADLETTER_STREAM);
assert.equal(deadLetter.args[5], contract.AGENT_OBSERVABILITY_REDIS_DATA_FIELD);
assert.equal(JSON.parse(deadLetter.args[6]).reason, 'invalid_ingress_event');
assert.equal(redis.calls.some((call) => call.op === 'xack' && call.args[2] === '2-0'), true);

const reclaimedRedis = new FakeRedis();
const reclaimedEmits = [];
reclaimedRedis.reclaimedEntries.push(entry('3-0', makeEvent('openclaw.session.ended', {
  hook: 'session_end',
  session_key: 'agent:forge:session-1',
  outcome: 'success',
  duration_ms: 100,
})));
const reclaimedIngester = createIngester(reclaimedRedis, {
  emitEvent: async (_ctx, eventType, payload) => {
    reclaimedEmits.push({ eventType, payload });
    return { ok: true };
  },
});
await reclaimedIngester.processNext({});
assert.equal(reclaimedRedis.calls.some((call) => call.op === 'call' && call.args[0] === 'XAUTOCLAIM'), true);
assert.equal(reclaimedRedis.calls.some((call) => call.op === 'xreadgroup'), false, 'reclaimed entries are processed before new XREADGROUP reads');
assert.equal(reclaimedEmits[0].eventType, 'agent.session.ended');
assert.equal(reclaimedEmits[0].payload.session_key, 'agent:forge:session-1');

const spawnedRedis = new FakeRedis();
const spawnedEmits = [];
spawnedRedis.newEntries.push(entry('4-0', makeEvent('openclaw.subagent.spawning', {
  hook: 'subagent_spawning',
  agent_id: 'buster',
  mode: 'run',
  spawn_mode: 'run',
  thread: false,
  expects_completion_message: true,
  requester_session_key: 'agent:forge:session-1',
  requester_origin: { channel: 'discord' },
})));
spawnedRedis.newEntries.push(entry('4-1', makeEvent('openclaw.subagent.spawned', {
  hook: 'subagent_spawned',
  child_session_key: 'agent:buster:session-child',
  agent_id: 'buster',
  mode: 'run',
  thread: false,
}, { child_session_key: 'agent:buster:session-child' })));
spawnedRedis.newEntries.push(entry('4-2', makeEvent('openclaw.subagent.delivery_target', {
  hook: 'subagent_delivery_target',
  child_session_key: 'agent:buster:session-child',
  agent_id: 'buster',
  requester_session_key: 'agent:forge:session-1',
  child_run_id: 'child-run-1',
  spawn_mode: 'run',
  expects_completion_message: true,
  requester_origin: { channel: 'discord' },
}, { child_session_key: 'agent:buster:session-child' })));
const spawnedIngester = createIngester(spawnedRedis, {
  emitEvent: async (_ctx, eventType, payload) => {
    spawnedEmits.push({ eventType, payload });
    return { ok: true };
  },
});
await spawnedIngester.processNext({});
await spawnedIngester.processNext({});
await spawnedIngester.processNext({});
assert.equal(spawnedEmits[0].eventType, 'agent.spawn.requested');
assert.equal(spawnedEmits[0].payload.requester_session_key, 'agent:forge:session-1');
assert.equal(spawnedEmits[0].payload.requester_origin.channel, 'discord');
assert.equal(spawnedEmits[1].eventType, 'agent.spawned');
assert.equal(spawnedEmits[1].payload.session_key, 'agent:buster:session-child');
assert.equal(spawnedEmits[2].eventType, 'agent.delivery.target');
assert.equal(spawnedEmits[2].payload.child_session_key, 'agent:buster:session-child');
assert.equal(spawnedEmits[2].payload.child_run_id, 'child-run-1');

const usageRedis = new FakeRedis();
const usageEmits = [];
const usageSwarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-observability-usage-'));
const usageLogDir = path.join(usageSwarmDir, 'logs');
const usageConfig = { paths: { swarm_dir: usageSwarmDir }, project: 'contract' };
usageRedis.newEntries.push(entry('5-0', makeEvent('openclaw.model.usage', {
  hook: 'model_usage',
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  cost_usd: 0.123,
  duration_ms: 4321,
  context: { limit: 200000, used: 12345 },
  usage: { input: 111, output: 222, cacheRead: 3, cacheWrite: 4, total: 340 },
})));
usageRedis.newEntries.push(entry('5-1', makeEvent('openclaw.model.usage', {
  hook: 'model_usage',
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  cost_usd: 0.077,
  usage: { input: 10, output: 20 },
})));
const usageIngester = createIngester(usageRedis, {
  emitEvent: async (_ctx, eventType, payload) => {
    usageEmits.push({ eventType, payload });
    return { ok: true };
  },
});
await usageIngester.processNext({ config: usageConfig });
await usageIngester.processNext({ config: usageConfig });
assert.equal(usageEmits[0].eventType, 'cost.update');
assert.equal(usageEmits[0].payload.cost_usd, 0.123);
assert.equal(usageEmits[0].payload.estimated_cost_usd, 0.123);
assert.equal(usageEmits[0].payload.total_cost_usd, 0.123);
assert.equal(usageEmits[0].payload.cumulative_cost_usd, 0.123);
assert.equal(usageEmits[0].payload.input_tokens, 111);
assert.equal(usageEmits[0].payload.output_tokens, 222);
assert.equal(usageEmits[0].payload.tokens_in, 111);
assert.equal(usageEmits[0].payload.tokens_out, 222);
assert.equal(usageEmits[0].payload.model, 'claude-sonnet-4-6');
assert.equal(usageEmits[1].payload.total_cost_usd, 0.2);
assert.equal(usageEmits[1].payload.cumulative_cost_usd, 0.2);
assert.equal(usageEmits[1].payload.input_tokens, 10);
assert.equal(usageEmits[1].payload.output_tokens, 20);
const snapshots = fs.readFileSync(path.join(usageLogDir, 'cost', 'usage-snapshots.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
assert.equal(snapshots.length, 2);
assert.equal(snapshots[0].source, 'openclaw.model.usage');
const costReport = observabilityModule.writeCostReport(usageConfig);
assert.equal(costReport.usage.run.input_tokens, 121);
assert.equal(costReport.usage.run.output_tokens, 242);
assert.equal(costReport.usage.run.estimated_cost_usd, 0.2);
assert.equal(JSON.parse(fs.readFileSync(path.join(usageLogDir, 'cost', 'cost-report.json'), 'utf8')).usage.run.estimated_cost_usd, 0.2);

const failingRedis = new FakeRedis();
failingRedis.newEntries.push(entry('6-0', makeEvent('openclaw.model.ended', {
  hook: 'model_call_ended',
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  outcome: 'error',
  duration_ms: 10,
})));
const failingIngester = createIngester(failingRedis, {
  emitEvent: async () => {
    throw new Error('sink exploded');
  },
});
await failingIngester.processNext({});
assert.equal(failingIngester.getStats().deadLettered, 1);
assert.equal(JSON.parse(failingRedis.calls.find((call) => call.op === 'xadd').args[6]).reason, 'telemetry_emit_failed');
assert.equal(failingRedis.calls.some((call) => call.op === 'xack' && call.args[2] === '6-0'), true);

const pressureRedis = new FakeRedis();
pressureRedis.pending = [2];
pressureRedis.payloadLength = 3;
const degraded = [];
const restored = [];
const pressureIngester = createIngester(pressureRedis, {
  recordObservabilityDegraded: async (_ctx, data) => degraded.push(data),
  recordObservabilityRestored: async (_ctx, data) => restored.push(data),
});
let pressure = await pressureIngester.checkPressure({});
assert.deepEqual(pressure.degraded, ['control_lag', 'payload_pressure']);
assert.equal(degraded.length, 2);
pressureRedis.pending = [0];
pressureRedis.payloadLength = 0;
pressure = await pressureIngester.checkPressure({});
assert.deepEqual(pressure.degraded, []);
assert.equal(restored.length, 2);
await pressureIngester.trim();
assert.equal(pressureRedis.calls.filter((call) => call.op === 'xtrim').length, 2);

await ingester.stop();
assert.equal(redis.closed, true);

console.log(JSON.stringify({ ok: true, checked: 90 }));
