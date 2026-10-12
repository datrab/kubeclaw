import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { NetworkHttpCapabilityInvoker } from '@kubeclaw/buster-engine';
import { provider } from '../src/provider.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openapi-semantics-'));
for (const name of ['repository', 'evidence']) fs.mkdirSync(path.join(root, name));
let body: unknown = [1]; let contacts = 0; const routes: string[] = [];
let abortOnContact: AbortController | undefined;
const server = http.createServer((request, response) => {
  routes.push(request.url!);
  if (abortOnContact) { contacts++; abortOnContact.abort(new Error('ACTIVE_CANCELLED')); return; }
  contacts++; response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(body));
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address(); if (!address || typeof address === 'string') throw new Error('SERVER_BIND_FAILED');
const origin = `http://127.0.0.1:${address.port}`;
const capability = new NetworkHttpCapabilityInvoker({ allowedOrigins: [origin], allowedHostSuffixes: [],
  allowedPorts: [address.port], allowedMethods: ['GET', 'POST'], allowedRequestHeaders: ['accept', 'content-type'],
  maximumRequestBytes: 4096, maximumResponseBytes: 4096, maximumExecutionMs: 1000 });
function execute(schema: unknown, value: unknown, request = false, config: Record<string, unknown> = {},
  signal = new AbortController().signal) {
  body = value;
  const operation = { operationId: 'probe', parameters: [{ in: 'header', name: 'authorization', schema: { type: 'string' } }], ...(request ? { requestBody: { content: {
    'application/json': { schema },
  } } } : {}), responses: { 200: { content: { 'application/json': { schema: request ? true : schema } } } } };
  fs.writeFileSync(path.join(root, 'repository/spec.json'), JSON.stringify({ openapi: '3.1.0',
    paths: { '/': { [request ? 'post' : 'get']: operation },
      '/cleanup': { get: { operationId: 'cleanup', responses: { 200: { description: 'ok' } } } } } }));
  return provider().execute({ testIdentity: 'test:semantics', inputs: [], timeoutMs: 1000,
    workspace: { repository: 'repository', evidence: 'evidence' }, configuration: { values: {
      specFile: 'spec.json', url: origin, maximumResponseBytes: 4096, requestTimeoutMs: 1000, operations: [{ operationId: 'probe', ...(request ? { body: value } : {}) }],
      ...config,
    } } } as any, { workspaceRoot: root, signal, log() {},
    invoke: (name: string, request: any) => capability.invoke(name, request, signal) });
}
try {
  const cases: [unknown, unknown, string][] = [
    [{ type: 'array', items: false }, [1], 'failed'], [{ type: 'array', items: false }, [], 'passed'],
    [{ type: 'array', items: true }, [1], 'passed'], [{ type: 'array', items: { type: 'string' } }, [1], 'failed'],
    [{ properties: { item: false } }, { item: 1 }, 'failed'], [{ properties: { item: false } }, {}, 'passed'],
    [{ properties: { item: true } }, { item: 1 }, 'passed'],
    [{ additionalProperties: false }, { item: 1 }, 'failed'], [{ additionalProperties: false }, {}, 'passed'],
    [{ additionalProperties: true }, { item: 1 }, 'passed'],
    [{ additionalProperties: { type: 'string' } }, { item: 1 }, 'failed'],
    [{ not: false }, 1, 'passed'], [{ not: true }, 1, 'failed'], [{ not: { type: 'number' } }, 1, 'failed'],
    [{ allOf: [false] }, 1, 'failed'], [{ anyOf: [false, true] }, 1, 'passed'],
    [{ oneOf: [true, true] }, 1, 'failed'],
    [{ type: 'array', contains: false }, [], 'failed'],
    [{ type: 'array', items: { unsupportedAssertion: true } }, [], 'failed'],
    [{ properties: { absent: null } }, {}, 'failed'],
  ];
  for (const request of [false, true]) for (const [schema, value, outcome] of cases) {
    const before = contacts; const result = await execute(schema, value, request);
    assert.equal(result.outcome, outcome, JSON.stringify({ schema, value, request }));
    assert.equal(contacts - before, request && outcome === 'failed' ? 0 : 1);
  }
  const before = contacts;
  await assert.rejects(() => execute(true, {}, false, { url: `http://127.0.0.2:${address.port}` }),
    /HTTP_REQUEST_ORIGIN_DENIED/u);
  assert.equal(contacts, before, 'denied origin must never contact the real server');
  await assert.rejects(() => execute(true, 'x'.repeat(2048), false, { maximumResponseBytes: 64 }),
    /HTTP_RESPONSE_SIZE_EXCEEDED/u);
  const abort = new AbortController(); abort.abort(new Error('CALLER_CANCELLED'));
  await assert.rejects(() => execute(true, {}, false, {}, abort.signal), /CALLER_CANCELLED/u);
  assert.equal(contacts, before + 1);
  const beforeCleanup = routes.length;
  await assert.rejects(() => execute(true, {}, false, { operations: [
    { operationId: 'probe', headers: { authorization: 'forbidden' } },
    { operationId: 'cleanup', cleanup: true },
  ] }), /HTTP_REQUEST_HEADER_DENIED/u);
  assert.deepEqual(routes.slice(beforeCleanup), ['/cleanup']);
  abortOnContact = new AbortController();
  const beforeAbort = routes.length;
  await assert.rejects(() => execute(true, {}, false, { operations: [
    { operationId: 'probe' }, { operationId: 'cleanup', cleanup: true },
  ] }, abortOnContact!.signal), /ACTIVE_CANCELLED/u);
  assert.deepEqual(routes.slice(beforeAbort), ['/']);
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve())); fs.rmSync(root, { recursive: true, force: true });
}
console.log(JSON.stringify({ ok: true, provider: 'openapi', schemaCases: 40, realHttp: true, mocks: 0 }));
