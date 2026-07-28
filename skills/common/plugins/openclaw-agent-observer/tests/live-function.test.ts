import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { createOpenClawAgentObserver } = await import(
  pathToFileURL(path.resolve('src/index.ts')).href
);

const warnings = [];
let diagnosticHandler;
const writes = [];
const baseConfig = {
  enabled: false,
  redisHost: '127.0.0.1',
  redisPort: 6379,
  redisTls: false,
  redisNetworkIsolation: 'strict',
  maxEventBytes: 65536,
  maxQueuePerStream: 32,
  redisCommandTimeoutMs: 100,
  streamMaxLen: 5000,
  deadLetterMaxLen: 500,
  controlWriteMaxAttempts: 1,
  controlWriteRetryBaseMs: 1,
  controlWriteRetryMaxMs: 1,
  hookPriority: 0,
  hookTimeoutMs: 1000,
};
const observer = createOpenClawAgentObserver({
  env: {},
  initialConfig: baseConfig,
  logger: {
    info() {},
    warn(message) { warnings.push(message); },
    error() {},
    debug() {},
  },
  diagnosticSubscriberFactory(handler) {
    diagnosticHandler = handler;
    return () => {};
  },
});

observer.start();
assert.equal(observer.getStatus().enabled, false);
observer.handleAgentEvent({ type: 'agent.started', runId: 'run:disabled' });
assert.equal(observer.getStats().queuedControl, 0);
assert.equal(observer.getStats().queuedPayload, 0);

const healthy = createOpenClawAgentObserver({
  env: {},
  initialConfig: { ...baseConfig, enabled: true },
  logger: {
    info() {},
    warn(message) { warnings.push(message); },
    error() {},
    debug() {},
  },
  diagnosticSubscriberFactory(handler) {
    diagnosticHandler = handler;
    return () => {};
  },
  redisClientFactory() {
    return {
      async xadd(...args) {
        writes.push(args);
        return '1-0';
      },
      async quit() {},
    };
  },
});
healthy.start();
healthy.handleAgentEvent({
  stream: 'lifecycle',
  runId: 'run:healthy',
  sessionKey: 'session:healthy',
  data: { phase: 'start' },
});
await healthy.flush();
assert.equal(healthy.getStats().enqueued, 1);
assert.equal(healthy.getStats().written, 1);
assert.equal(writes.length, 1);
assert.match(String(writes[0].at(-1)), /"type":"openclaw\.session\.started"/);

const invalid = createOpenClawAgentObserver({
  env: {},
  initialConfig: baseConfig,
  logger: {
    info() {},
    warn(message) { warnings.push(message); },
    error() {},
    debug() {},
  },
});
invalid.handleHook('agent_start', {}, { pluginConfig: { enabled: true, redisPort: 70000 } });
assert.equal(warnings.some((entry) => entry.includes('invalid agent observability config')), true);

const degraded = createOpenClawAgentObserver({
  env: {},
  initialConfig: { ...baseConfig, enabled: true },
  logger: {
    info() {},
    warn(message) { warnings.push(message); },
    error() {},
    debug() {},
  },
  diagnosticSubscriberFactory() {
    throw new Error('DIAGNOSTIC_SUBSCRIBER_CRASH');
  },
  redisClientFactory() {
    throw new Error('REDIS_CLIENT_CRASH');
  },
});
degraded.start();
assert.equal(degraded.getStatus().enabled, true);
assert.equal(warnings.some((entry) => entry.includes('model.usage diagnostics unavailable')), true);
degraded.handleDiagnostic({ type: 'model.usage' });
await degraded.stop();
await invalid.stop();
await healthy.stop();
await observer.stop();
assert.equal(typeof diagnosticHandler, 'function');

console.log(JSON.stringify({
  ok: true,
  plugin: 'kubeclaw.openclaw-agent-observer',
  suite: 'live-function',
  registrations: { 'openclaw:service': ['pass', 'fail', 'crash'] },
}));
