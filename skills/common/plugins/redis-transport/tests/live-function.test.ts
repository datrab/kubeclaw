import assert from 'node:assert/strict';
import net from 'node:net';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const received: string[] = [];
const server = net.createServer((socket) => {
  socket.on('data', (chunk) => {
    received.push(chunk.toString('utf8'));
    socket.write('+OK\r\n$12\r\n1785270000-1\r\n');
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('redis test server unavailable');
const module = await import(pathToFileURL(path.resolve('dist/adapter.js')).href);
const context = {
  registration: {},
  config: {
    url: `redis://127.0.0.1:${address.port}`,
    passwordSecret: 'redis.password',
    streamPrefix: 'kubeclaw',
    maxLen: 1_000,
    dedupTtlMs: 60_000,
    timeoutMs: 1_000,
  },
  async emit() {},
  async invoke() { return { value: 'redis-secret' }; },
};
const attempt = { runId: 'run:redis', stageId: 'stage:redis', attemptId: 'attempt:redis', attemptNumber: 1 };
const invoke = (adapter, capability, operation, type, canonicalId) => adapter.invoke({
  request: {
    requestId: `request:${canonicalId}`,
    idempotencyKey: `key:${canonicalId}`,
    attempt,
    capability,
    operation,
    resource: { type, canonicalId },
    payload: { message: { ok: true } },
  },
  signal: new AbortController().signal,
  fence: { assertCurrent() {} },
});
const publisher = module.activatePublisher(context);
const telemetry = module.activateTelemetry(context);
try {
  await publisher.ready();
  await telemetry.ready();
  assert.deepEqual(await invoke(publisher, 'transport.publish', 'publish', 'transport.target', 'audit'), {
    accepted: true,
    stream: 'kubeclaw:audit',
    entryId: '1785270000-1',
  });
  assert.deepEqual(await invoke(telemetry, 'telemetry.emit', 'append', 'telemetry.event', 'pipeline.completed'), {
    accepted: true,
    stream: 'kubeclaw:pipeline_completed',
    entryId: '1785270000-1',
  });
  assert.equal(received.length, 2);
  assert.equal(received.every((wire) => wire.includes('AUTH') && wire.includes('EVAL') && wire.includes('MAXLEN')), true);
  assert.equal(received.some((wire) => wire.includes('redis-secret')), true);
} finally {
  await publisher.shutdown();
  await telemetry.shutdown();
  await new Promise((resolve) => server.close(resolve));
}
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.redis-transport', suite: 'live-function' }));
