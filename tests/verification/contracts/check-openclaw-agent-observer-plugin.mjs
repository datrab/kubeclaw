#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
const pluginRoot = path.join(sourceRoot, 'plugins/openclaw-agent-observer');
const plugin = await import(path.join(pluginRoot, 'src/index.ts'));
const pluginConfig = await import(path.join(pluginRoot, 'src/config.ts'));
const contract = await import(path.join(sourceRoot, 'skills/common/pipeline/agent-observability/src/index.ts'));

const packageJson = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'package.json'), 'utf8'));
assert.deepEqual(packageJson.openclaw.runtimeExtensions, ['./dist/index.js']);
const pluginManifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'openclaw.plugin.json'), 'utf8'));
assert.equal(pluginManifest.configSchema.properties.enabled.default, undefined, 'observer plugin manifest must not supply hidden runtime defaults');

const compactResolvedConfig = pluginConfig.resolveAgentObserverConfig({}, {
  SWARM_CONFIG: path.join(sourceRoot, 'charts/kubeclaw/files/config/swarm.config.json'),
  KUBECLAW_SWARM_STANDARD_PROFILE: path.join(sourceRoot, 'skills/nova/pipeline/core/config-profiles/standard.json'),
});
assert.equal(compactResolvedConfig.enabled, true);
assert.equal(compactResolvedConfig.maxEventBytes, 3145728);
assert.equal(compactResolvedConfig.redisCommandTimeoutMs, 5000);
assert.equal(compactResolvedConfig.hookTimeoutMs, 1000);

for (const file of fs.readdirSync(path.join(pluginRoot, 'src'), { recursive: true })) {
  if (!String(file).endsWith('.ts')) continue;
  const full = path.join(pluginRoot, 'src', file);
  const text = fs.readFileSync(full, 'utf8');
  assert(!text.includes('skills/common'), `${file} must not import repo-local common skills`);
  const allowedProfileRead = String(file) === 'config.ts' && text.includes('/app/skills/pipeline/core/config-profiles/standard.json');
  assert(
    !text.includes('/app/skills') || allowedProfileRead,
    `${file} must not import production skill paths except the standard config profile artifact`,
  );
}

class FakeRedis {
  constructor() {
    this.commands = [];
    this.attempts = [];
    this.closed = false;
  }

  async xadd(...args) {
    this.attempts.push(args);
    this.commands.push(args);
    return `fake-${this.commands.length}`;
  }

  async quit() {
    this.closed = true;
  }
}

class FailNTimesRedis extends FakeRedis {
  constructor(failures) {
    super();
    this.failures = failures;
  }

  async xadd(...args) {
    this.attempts.push(args);
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error('planned xadd failure');
    }
    this.commands.push(args);
    return `fake-${this.commands.length}`;
  }
}

class FailControlStreamRedis extends FakeRedis {
  async xadd(...args) {
    this.attempts.push(args);
    if (args[0] === contract.AGENT_OBSERVABILITY_CONTROL_STREAM) {
      throw new Error('planned control failure');
    }
    this.commands.push(args);
    return `fake-${this.commands.length}`;
  }
}

class SlowRedis extends FakeRedis {
  constructor() {
    super();
    this.releaseWrite = null;
    this.started = new Promise((resolve) => {
      this.resolveStarted = resolve;
    });
  }

  async xadd(...args) {
    this.attempts.push(args);
    this.resolveStarted();
    await new Promise((resolve) => {
      this.releaseWrite = resolve;
    });
    this.commands.push(args);
    return `fake-${this.commands.length}`;
  }

  release() {
    this.releaseWrite?.();
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

function parseWritten(command) {
  const [stream, maxlenToken, trimToken, maxlen, idToken, field, data] = command;
  assert.equal(maxlenToken, 'MAXLEN');
  assert.equal(trimToken, '~');
  assert.equal(idToken, '*');
  assert.equal(field, contract.AGENT_OBSERVABILITY_REDIS_DATA_FIELD);
  return { stream, maxlen, event: JSON.parse(data) };
}

function observerConfig(overrides = {}) {
  return {
    enabled: true,
    maxEventBytes: 3145728,
    maxQueuePerStream: 10,
    redisCommandTimeoutMs: 1000,
    streamMaxLen: 10000,
    deadLetterMaxLen: 1000,
    controlWriteMaxAttempts: 3,
    controlWriteRetryBaseMs: 1,
    controlWriteRetryMaxMs: 1,
    hookPriority: -100,
    hookTimeoutMs: 1000,
    redisNetworkIsolation: 'isolated',
    ...overrides,
  };
}

const logger = makeLogger();
const redis = new FakeRedis();
let diagnosticHandler = null;
let diagnosticsUnsubscribed = false;
const observer = plugin.createOpenClawAgentObserver({
  logger,
  initialConfig: observerConfig(),
  env: {},
  redisClientFactory: () => redis,
  diagnosticSubscriberFactory: (handler) => {
    diagnosticHandler = handler;
    return () => {
      diagnosticsUnsubscribed = true;
    };
  },
});

const api = {
  hooks: [],
  services: [],
  gatewayMethods: [],
  agentEventSubscriptions: [],
  runtimeAgentEventHandlers: [],
  runtime: {
    events: {
      onAgentEvent(handler) {
        api.runtimeAgentEventHandlers.push(handler);
        return () => {
          api.runtimeAgentEventHandlers = api.runtimeAgentEventHandlers.filter((candidate) => candidate !== handler);
        };
      },
    },
  },
  on(name, handler, opts) { this.hooks.push({ name, handler, opts }); },
  registerGatewayMethod(method, handler, opts) { this.gatewayMethods.push({ method, handler, opts }); },
  registerAgentEventSubscription(subscription) { this.agentEventSubscriptions.push(subscription); },
  registerService(service) { this.services.push(service); },
};
plugin.registerOpenClawAgentObserver(api, observer);
assert.deepEqual(api.hooks.map((hook) => hook.name), [...contract.AGENT_OBSERVABILITY_HOOKS]);
assert.equal(api.hooks.some((hook) => hook.name === 'model_usage'), false);
assert.equal(api.hooks.every((hook) => hook.opts.priority === -100 && hook.opts.timeoutMs === 1000), true);
assert.equal(api.agentEventSubscriptions.length, 0, 'runtime event facade should be preferred over host bridge to avoid duplicate writes');
assert.equal(api.runtimeAgentEventHandlers.length, 1);
assert.deepEqual(api.gatewayMethods.map((entry) => entry.method), ['kubeclaw.agentObserver.status', 'kubeclaw.agentObserver.selfTest']);
assert.equal(api.services.length, 1);

const fallbackApi = {
  hooks: [],
  services: [],
  agentEventSubscriptions: [],
  on(name, handler, opts) { this.hooks.push({ name, handler, opts }); },
  registerAgentEventSubscription(subscription) { this.agentEventSubscriptions.push(subscription); },
  registerService(service) { this.services.push(service); },
};
plugin.registerOpenClawAgentObserver(fallbackApi, plugin.createOpenClawAgentObserver({
  initialConfig: observerConfig(),
  env: {},
  logger: makeLogger(),
  redisClientFactory: () => new FakeRedis(),
}));
assert.equal(fallbackApi.agentEventSubscriptions.length, 1);
assert.equal(fallbackApi.agentEventSubscriptions[0].id, 'kubeclaw-agent-observer.agent-events');
assert(fallbackApi.agentEventSubscriptions[0].streams.includes('lifecycle'));
assert.equal(api.services[0].id, 'kubeclaw-agent-observer');
api.services[0].start();
assert.equal(typeof diagnosticHandler, 'function');
let serviceStatus = api.services[0].status();
assert.equal(serviceStatus.enabled, true);
assert.equal(serviceStatus.redis.connected, true);
assert.equal(serviceStatus.registered_hooks.includes('agent_end'), true);
assert.equal(serviceStatus.writer.queuedControl, 0);

const llmInputHook = api.hooks.find((hook) => hook.name === 'llm_input');
llmInputHook.handler({
  prompt: 'Authorization: sk-1234567890abcdef',
  systemPrompt: 'raw system prompt',
  historyMessages: [{ role: 'user', content: 'full user prompt' }],
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  request: { temperature: 0.1 },
  metadata: { route: 'smoke' },
}, {
  runId: 'run-1',
  sessionKey: 'agent:forge:session-1',
  agentId: 'forge',
});
await observer.flush();
assert.equal(redis.commands.length, 1);
let written = parseWritten(redis.commands[0]);
assert.equal(written.stream, contract.AGENT_OBSERVABILITY_PAYLOAD_STREAM);
assert.equal(written.maxlen, 10000);
assert.equal(written.event.type, 'openclaw.llm.input');
assert.equal(written.event.identity.run_id, 'run-1');
assert.equal(written.event.identity.session_key, 'agent:forge:session-1');
assert.equal(written.event.identity.agent_id, 'forge');
assert.equal(written.event.payload.prompt, 'Authorization: [REDACTED_API_KEY]');
assert.equal(written.event.payload.system_prompt, 'raw system prompt');
assert.equal(written.event.payload.history_messages[0].content, 'full user prompt');
assert.deepEqual(written.event.masking.masked, [contract.AGENT_OBSERVABILITY_MASK_BASIC_API_KEY_PATTERN]);
assert.equal(contract.validateAgentObservabilityIngressEvent(written.event).ok, true);

const deliveryTargetHook = api.hooks.find((hook) => hook.name === 'subagent_delivery_target');
deliveryTargetHook.handler({
  childSessionKey: 'child-session-1',
  childRunId: 'child-run-1',
  spawnMode: 'session',
  expectsCompletionMessage: true,
  requesterOrigin: { channel: 'discord', threadId: '1505923209957081100' },
}, {
  requesterSessionKey: 'agent:forge:session-1',
  runId: 'run-1',
});
await observer.flush();
assert.equal(redis.commands.length, 2);
written = parseWritten(redis.commands[1]);
assert.equal(written.stream, contract.AGENT_OBSERVABILITY_CONTROL_STREAM);
assert.equal(written.event.type, 'openclaw.subagent.delivery_target');
assert.equal(written.event.identity.parent_session_key, 'agent:forge:session-1');
assert.equal(written.event.identity.child_session_key, 'child-session-1');
assert.equal(written.event.payload.child_run_id, 'child-run-1');
assert.equal(written.event.payload.expects_completion_message, true);
assert.equal(written.event.payload.requester_origin.channel, 'discord');

diagnosticHandler({
  type: 'model.usage',
  sessionKey: 'agent:forge:session-1',
  costUsd: 0.123,
  context: { limit: 200000, used: 12345 },
  model: 'claude-sonnet-4-6',
  provider: 'anthropic',
  durationMs: 4321,
  usage: { input: 111, output: 222, cacheRead: 3, cacheWrite: 4, total: 340 },
});
await observer.flush();
assert.equal(redis.commands.length, 3);
written = parseWritten(redis.commands[2]);
assert.equal(written.stream, contract.AGENT_OBSERVABILITY_CONTROL_STREAM);
assert.equal(written.event.type, 'openclaw.model.usage');
assert.equal(written.event.identity.session_key, 'agent:forge:session-1');
assert.equal(written.event.payload.hook, 'model_usage');
assert.equal(written.event.payload.cost_usd, 0.123);
assert.equal(written.event.payload.usage.input, 111);
assert.equal(written.event.payload.context.limit, 200000);

const agentEndHook = api.hooks.find((hook) => hook.name === 'agent_end');
agentEndHook.handler({
  success: true,
  reason: 'done',
  durationMs: 1234,
  finalMessages: [{ role: 'assistant', content: 'final message' }],
  ctx: { runId: 'run-1', sessionKey: 'agent:forge:session-1' },
});
await observer.flush();
assert.equal(redis.commands.length, 4);
written = parseWritten(redis.commands[3]);
assert.equal(written.stream, contract.AGENT_OBSERVABILITY_CONTROL_STREAM);
assert.equal(written.event.type, 'openclaw.agent.ended');
assert.equal(written.event.payload.outcome, 'success');
assert.equal(written.event.payload.final_messages[0].content, 'final message');

const priorityRedis = new FakeRedis();
const priorityObserver = plugin.createOpenClawAgentObserver({
  initialConfig: observerConfig(),
  env: {},
  logger: makeLogger(),
  redisClientFactory: () => priorityRedis,
});
priorityObserver.handleHook('llm_input', { prompt: 'payload first', historyMessages: [], ctx: { runId: 'run-priority' } });
priorityObserver.handleHook('agent_end', { success: true, ctx: { runId: 'run-priority' } });
await priorityObserver.flush();
assert.equal(priorityRedis.commands.length, 2);
assert.equal(parseWritten(priorityRedis.commands[0]).stream, contract.AGENT_OBSERVABILITY_CONTROL_STREAM);
assert.equal(parseWritten(priorityRedis.commands[1]).stream, contract.AGENT_OBSERVABILITY_PAYLOAD_STREAM);

const retryRedis = new FailNTimesRedis(2);
const retryObserver = plugin.createOpenClawAgentObserver({
  initialConfig: observerConfig(),
  env: {},
  logger: makeLogger(),
  redisClientFactory: () => retryRedis,
});
retryObserver.handleHook('agent_end', { success: true, ctx: { runId: 'run-retry' } });
await retryObserver.flush();
assert.equal(retryRedis.attempts.length, 3);
assert.equal(retryRedis.commands.length, 1);
assert.equal(retryObserver.getStats().retriedControlWrites, 2);
assert.equal(retryObserver.getStats().writtenControl, 1);
assert.equal(retryObserver.getStats().droppedWriteFailureControl, 0);

const deadLetterRedis = new FailControlStreamRedis();
const deadLetterObserver = plugin.createOpenClawAgentObserver({
  initialConfig: observerConfig({ deadLetterMaxLen: 7 }),
  env: {},
  logger: makeLogger(),
  redisClientFactory: () => deadLetterRedis,
});
deadLetterObserver.handleHook('agent_end', { success: true, ctx: { runId: 'run-deadletter' } });
await deadLetterObserver.flush();
assert.equal(deadLetterRedis.attempts.filter((args) => args[0] === contract.AGENT_OBSERVABILITY_CONTROL_STREAM).length, 3);
assert.equal(deadLetterRedis.commands.length, 1);
const deadLetter = parseWritten(deadLetterRedis.commands[0]);
assert.equal(deadLetter.stream, contract.AGENT_OBSERVABILITY_DEADLETTER_STREAM);
assert.equal(deadLetter.maxlen, 7);
assert.equal(deadLetter.event.reason, 'redis_write_failed');
assert.equal(deadLetter.event.source_stream, contract.AGENT_OBSERVABILITY_CONTROL_STREAM);
assert.equal(JSON.parse(deadLetter.event.data).type, 'openclaw.agent.ended');
assert.equal(deadLetterObserver.getStats().droppedWriteFailureControl, 1);
assert.equal(deadLetterObserver.getStats().deadLetterWritten, 1);
assert.equal(typeof deadLetterObserver.getStats().lastErrorAt, 'string');

const payloadFailureRedis = new FailNTimesRedis(1);
const payloadFailureObserver = plugin.createOpenClawAgentObserver({
  initialConfig: observerConfig(),
  env: {},
  logger: makeLogger(),
  redisClientFactory: () => payloadFailureRedis,
});
payloadFailureObserver.handleHook('llm_input', { prompt: 'payload fail', historyMessages: [], ctx: { runId: 'run-payload-fail' } });
await payloadFailureObserver.flush();
assert.equal(payloadFailureRedis.attempts.length, 1);
assert.equal(payloadFailureObserver.getStats().droppedWriteFailurePayload, 1);
assert.equal(payloadFailureObserver.getStats().deadLetterWritten, 0);

const slowRedis = new SlowRedis();
const slowObserver = plugin.createOpenClawAgentObserver({
  initialConfig: observerConfig(),
  env: {},
  logger: makeLogger(),
  redisClientFactory: () => slowRedis,
});
slowObserver.handleHook('agent_end', { success: true, ctx: { runId: 'run-slow' } });
const inFlightFlush = slowObserver.flush();
await slowRedis.started;
let stopped = false;
const stopPromise = slowObserver.stop().then(() => { stopped = true; });
await Promise.resolve();
assert.equal(stopped, false, 'stop should wait for the in-flight flush before closing Redis');
slowRedis.release();
await inFlightFlush;
await stopPromise;
assert.equal(slowRedis.commands.length, 1);
assert.equal(slowRedis.closed, true);
assert.equal(stopped, true);

const queueRedis = new FakeRedis();
const queueObserver = plugin.createOpenClawAgentObserver({
  initialConfig: observerConfig({ maxQueuePerStream: 1 }),
  env: {},
  logger: makeLogger(),
  redisClientFactory: () => queueRedis,
});
queueObserver.handleHook('llm_input', { prompt: 'one', historyMessages: [], ctx: { runId: 'run-q' } });
queueObserver.handleHook('llm_input', { prompt: 'two', historyMessages: [], ctx: { runId: 'run-q' } });
await queueObserver.flush();
assert.equal(queueRedis.commands.length, 1);
assert.equal(queueObserver.getStats().droppedQueueFull, 1);

const oversizeRedis = new FakeRedis();
const oversizeObserver = plugin.createOpenClawAgentObserver({
  initialConfig: observerConfig({ maxEventBytes: 256 }),
  env: {},
  logger: makeLogger(),
  redisClientFactory: () => oversizeRedis,
});
oversizeObserver.handleHook('llm_input', { prompt: 'x'.repeat(1024), historyMessages: [], ctx: { runId: 'run-o' } });
await oversizeObserver.flush();
assert.equal(oversizeRedis.commands.length, 0);
assert.equal(oversizeObserver.getStats().droppedOversize, 1);

const runtimeConfigRedis = new FakeRedis();
const runtimeConfigObserver = plugin.createOpenClawAgentObserver({
  initialConfig: observerConfig(),
  env: {},
  logger: makeLogger(),
  redisClientFactory: () => runtimeConfigRedis,
  diagnosticSubscriberFactory: () => () => {},
});
runtimeConfigObserver.start({ config: { maxQueuePerStream: 1 } });
runtimeConfigObserver.handleHook('llm_input', { prompt: 'one', historyMessages: [] }, { sessionKey: 'ctx-session' });
runtimeConfigObserver.handleHook('llm_input', { prompt: 'two', historyMessages: [] }, { sessionKey: 'ctx-session' });
await runtimeConfigObserver.flush();
assert.equal(runtimeConfigRedis.commands.length, 1);
assert.equal(runtimeConfigObserver.getStats().droppedQueueFull, 1);
let runtimeWritten = parseWritten(runtimeConfigRedis.commands[0]);
assert.equal(runtimeWritten.event.identity.session_key, 'ctx-session');

const agentEventRedis = new FakeRedis();
const agentEventObserver = plugin.createOpenClawAgentObserver({
  initialConfig: observerConfig(),
  env: {},
  logger: makeLogger(),
  redisClientFactory: () => agentEventRedis,
});
agentEventObserver.handleAgentEvent({
  runId: 'run-agent-event',
  sessionKey: 'agent:codex:observer-smoke',
  sessionId: 'session-agent-event',
  stream: 'lifecycle',
  data: {
    phase: 'end',
    startedAt: 100,
    endedAt: 250,
    stopReason: 'completed',
  },
});
agentEventObserver.handleAgentEvent({
  runId: 'run-agent-event',
  stream: 'assistant',
  data: { text: 'OBSERVER_SMOKE_OK' },
});
await agentEventObserver.flush();
assert.equal(agentEventRedis.commands.length, 2);
runtimeWritten = parseWritten(agentEventRedis.commands[0]);
assert.equal(runtimeWritten.stream, contract.AGENT_OBSERVABILITY_CONTROL_STREAM);
assert.equal(runtimeWritten.event.type, 'openclaw.agent.ended');
assert.equal(runtimeWritten.event.identity.run_id, 'run-agent-event');
assert.equal(runtimeWritten.event.identity.session_key, 'agent:codex:observer-smoke');
assert.equal(runtimeWritten.event.payload.outcome, 'success');
assert.equal(runtimeWritten.event.payload.reason, 'completed');
runtimeWritten = parseWritten(agentEventRedis.commands[1]);
assert.equal(runtimeWritten.stream, contract.AGENT_OBSERVABILITY_PAYLOAD_STREAM);
assert.equal(runtimeWritten.event.type, 'openclaw.llm.output');
assert.equal(runtimeWritten.event.payload.assistant_response, 'OBSERVER_SMOKE_OK');

const dedupeRedis = new FakeRedis();
const dedupeObserver = plugin.createOpenClawAgentObserver({
  initialConfig: observerConfig({ maxQueuePerStream: 10 }),
  env: {},
  logger: makeLogger(),
  redisClientFactory: () => dedupeRedis,
});
const duplicateAgentEvent = {
  runId: 'run-dedupe',
  sessionKey: 'agent:codex:dedupe',
  stream: 'lifecycle',
  seq: 2,
  data: { phase: 'end', stopReason: 'completed' },
};
dedupeObserver.handleAgentEvent(duplicateAgentEvent);
dedupeObserver.handleAgentEvent(duplicateAgentEvent);
await dedupeObserver.flush();
assert.equal(dedupeRedis.commands.length, 1);

const hookConfigRedis = new FakeRedis();
const hookConfigObserver = plugin.createOpenClawAgentObserver({
  initialConfig: observerConfig({ enabled: false }),
  env: {},
  logger: makeLogger(),
  redisClientFactory: () => hookConfigRedis,
});
hookConfigObserver.handleHook('agent_end', { success: true }, { sessionKey: 'hook-config', pluginConfig: { enabled: true } });
await hookConfigObserver.flush();
assert.equal(hookConfigRedis.commands.length, 1);

const disabledRedis = new FakeRedis();
const disabledObserver = plugin.createOpenClawAgentObserver({
  initialConfig: observerConfig({ enabled: false }),
  env: {},
  logger: makeLogger(),
  redisClientFactory: () => disabledRedis,
});
disabledObserver.handleHook('agent_end', { success: true, ctx: { runId: 'disabled' } });
await disabledObserver.flush();
assert.equal(disabledRedis.commands.length, 0);
assert.equal(disabledObserver.getStats().droppedDisabled, 0, 'disabled hooks should return before writer enqueue');

assert.throws(
  () => plugin.createOpenClawAgentObserver({
    env: {},
    logger: makeLogger(),
    redisClientFactory: () => new FakeRedis(),
  }),
  /enabled must be configured as a boolean/,
  'observer startup without swarm/plugin config should fail fast instead of using hidden defaults',
);

await observer.stop();
assert.equal(redis.closed, true);
assert.equal(diagnosticsUnsubscribed, true);

console.log(JSON.stringify({ ok: true, checked: 130 }));
