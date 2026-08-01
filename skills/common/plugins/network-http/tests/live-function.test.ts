import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const server = http.createServer((request, response) => {
  if (request.url === '/json') {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ method: request.method, idempotency: request.headers['idempotency-key'] }));
  } else if (request.url === '/text') {
    response.setHeader('content-type', 'text/plain');
    response.end('plain');
  } else if (request.url === '/redirect') {
    response.writeHead(302, { location: 'http://example.com/' }).end();
  } else if (request.url === '/large') {
    response.end('x'.repeat(200));
  } else if (request.url === '/slow') {
    setTimeout(() => response.end('late'), 500);
  } else {
    response.writeHead(503).end('unavailable');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('test server did not bind');
const origin = `http://127.0.0.1:${address.port}`;
const { activate } = await import(pathToFileURL(path.resolve('src/adapter.ts')).href);
const adapter = activate({
  registration: {},
  config: {
    allowedOrigins: [origin],
    allowedMethods: ['GET', 'POST'],
    allowedHeaders: ['content-type', 'idempotency-key'],
    maxRequestBytes: 64,
    maxResponseBytes: 128,
    timeoutMs: 100,
  },
  async emit() {},
  async invoke() { throw new Error('unexpected dependency'); },
});
const attempt = { runId: 'run:test', stageId: 'stage:test', attemptId: 'attempt:test', attemptNumber: 1 };
let sequence = 0;
const fenced = { fence: { assertCurrent() {} } };
const invoke = (pathname, payload = {}, signal = new AbortController().signal) => {
  sequence += 1;
  return adapter.invoke({
    ...fenced,
    request: {
      requestId: `request:${sequence}`,
      idempotencyKey: `network:${sequence}`,
      attempt,
      capability: 'network.http',
      operation: 'request',
      resource: { type: 'network.url', canonicalId: `${origin}${pathname}` },
      payload,
    },
    signal,
  });
};

try {
  await adapter.ready();
  const json = await invoke('/json', { method: 'POST', headers: { 'idempotency-key': 'key' }, body: { ok: true } });
  assert.deepEqual(json.body, { method: 'POST', idempotency: 'key' });
  assert.equal((await invoke('/text')).body, 'plain');
  await assert.rejects(invoke('/redirect'), /NETWORK_REDIRECT_DENIED/);
  await assert.rejects(invoke('/large'), /NETWORK_RESPONSE_SIZE_EXCEEDED/);
  await assert.rejects(invoke('/slow'), /NETWORK_TIMEOUT/);
  await assert.rejects(invoke('/json', { method: 'TRACE' }), /NETWORK_METHOD_DENIED/);
  await assert.rejects(invoke('/json', { headers: { authorization: 'secret' } }), /NETWORK_HEADER_DENIED/);
  await assert.rejects(invoke('/json', { body: { value: 'x'.repeat(80) } }), /NETWORK_REQUEST_SIZE_EXCEEDED/);
  await assert.rejects(adapter.invoke({
    ...fenced,
    request: {
      requestId: 'denied',
      idempotencyKey: 'denied',
      attempt,
      capability: 'network.http',
      operation: 'request',
      resource: { type: 'network.url', canonicalId: 'http://example.com/' },
      payload: {},
    },
    signal: new AbortController().signal,
  }), /NETWORK_ORIGIN_DENIED/);
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(invoke('/json', {}, cancelled.signal), /ADAPTER_CANCELLED/);
} finally {
  await adapter.shutdown();
  await new Promise((resolve) => server.close(resolve));
}

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.network-http', suite: 'live-function' }));
