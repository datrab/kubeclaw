import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { NetworkHttpCapabilityInvoker } from '@kubeclaw/buster-engine';
import { provider } from '../src/provider.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'api-flow-'));
for (const directory of ['repository', 'scratch', 'evidence']) fs.mkdirSync(path.join(root, directory));
const calls = new Map<string, number>();
const server = http.createServer((request, response) => {
  const route = new URL(request.url ?? '/', 'http://localhost').pathname; calls.set(route, (calls.get(route) ?? 0) + 1);
  if (route === '/login') { response.setHeader('content-type', 'application/json'); response.end('{"token":"abc"}'); return; }
  if (route === '/data' && request.headers.authorization === 'Bearer abc') { response.setHeader('content-type', 'application/json'); response.end('{"ok":true,"user":{"role":"admin"}}'); return; }
  if (route === '/independent') { response.end('ok'); return; }
  if (route === '/logout') { response.writeHead(204).end(); return; }
  response.writeHead(404).end('missing');
});
const sockets = new WebSocketServer({ noServer: true });
server.on('upgrade', (request, socket, head) => request.url === '/events'
  ? sockets.handleUpgrade(request, socket, head, (client) => sockets.emit('connection', client, request)) : socket.destroy());
sockets.on('connection', (socket) => socket.on('message', (data) => socket.send(`received:${String(data)}`)));
await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const address = server.address(); if (!address || typeof address === 'string') throw new Error('API_FLOW_TEST_BIND_FAILED');
const origin = `http://127.0.0.1:${address.port}`;
const flow = { schemaVersion: 'kubeclaw.api-flow.v1',
  setup: [{ id: 'login', method: 'POST', path: '/login', body: { user: 'test' }, expect: { status: 200, contentType: 'application/json' }, extract: { token: 'token' } }],
  steps: [{ id: 'read', path: '/data', headers: { authorization: 'Bearer {{token}}' }, expect: { status: 200, json: { ok: true, user: { role: 'admin' } } } },
    { id: 'events', protocol: 'websocket', path: '/events', messages: ['hello'], expect: { minimumMessages: 1, messageContains: 'received:hello' } }],
  cleanup: [{ id: 'logout', method: 'DELETE', path: '/logout', expect: { status: 204 } }] };
fs.writeFileSync(path.join(root, 'repository/flow.json'), `${JSON.stringify(flow)}\n`);
const capability = new NetworkHttpCapabilityInvoker({ allowedOrigins: [origin], allowedHostSuffixes: [], allowedPorts: [address.port],
  allowedMethods: ['DELETE', 'GET', 'POST'], allowedRequestHeaders: ['accept', 'authorization', 'content-type'],
  allowWebSocket: true,
  maximumRequestBytes: 1024 * 1024, maximumResponseBytes: 1024 * 1024, maximumExecutionMs: 30_000 });
const invocation = { schemaVersion: 'provider-invocation.v1', planId: 'plan:api', runId: 'run:api', moduleId: 'api', gateId: null,
  suiteInstanceId: null, nodeId: 'api-flow', executionId: 'plan:api:api-flow', testIdentity: 'test:api-flow', nodeKind: 'test',
  attemptId: 'attempt:api-flow', attemptNumber: 1, provider: {}, configuration: { values: { flowFile: 'flow.json', url: origin } },
  inputs: [], evidence: {}, grantedCapabilities: ['network.http'], timeoutMs: 30_000,
  limits: { cpuMillis: 60_000, memoryBytes: 256 * 1024 * 1024, logBytes: 1024 * 1024, artifactBytes: 4 * 1024 * 1024, artifactFiles: 8, processes: 4 },
  workspace: { repository: 'repository', scratch: 'scratch', evidence: 'evidence' } } as any;
const signal = new AbortController().signal;
try {
  const result = await provider().execute(invocation, { signal, workspaceRoot: root, log() {}, invoke: (name: string, request: any) => capability.invoke(name, request, signal) } as any);
  assert.equal(result.outcome, 'passed'); assert.deepEqual(result.counts, { total: 4, passed: 4, failed: 0, skipped: 0 });
  assert.equal(calls.get('/logout'), 1); assert.equal(result.evidenceFiles[0].file, 'api-flow-result.json');
  fs.writeFileSync(path.join(root, 'repository/invalid.json'), '{"schemaVersion":"kubeclaw.api-flow.v1","steps":[{"id":"bad","path":"/","expect":{"statuz":200}}]}');
  await assert.rejects(() => provider().execute({ ...invocation, configuration: { values: { flowFile: 'invalid.json', url: origin } } }, { signal, workspaceRoot: root, log() {}, invoke: (name: string, request: any) => capability.invoke(name, request, signal) } as any), /API_FLOW_EXPECT_INVALID/u);
  fs.writeFileSync(path.join(root, 'repository/invalid.json'), '{"schemaVersion":"kubeclaw.api-flow.v1","steps":[{"id":"bad","protocol":"websocket","path":"/events","expect":{"status":101}}]}');
  await assert.rejects(() => provider().execute({ ...invocation, configuration: { values: { flowFile: 'invalid.json', url: origin } } }, { signal, workspaceRoot: root, log() {}, invoke: (name: string, request: any) => capability.invoke(name, request, signal) } as any), /API_FLOW_STEP_INVALID/u);
  await assert.rejects(() => provider().execute({ ...invocation,
    configuration: { values: { flowFile: 'missing.json', url: origin } } },
  { signal, workspaceRoot: root, log() {}, invoke: (name: string, request: any) => capability.invoke(name, request, signal) } as any),
  /API_FLOW_FILE_DENIED/u);
  const requestBounded = new NetworkHttpCapabilityInvoker({ allowedOrigins: [origin], allowedHostSuffixes: [],
    allowedPorts: [address.port], allowedMethods: ['GET'], allowedRequestHeaders: ['accept'],
    allowWebSocket: true,
    maximumRequestBytes: 4, maximumResponseBytes: 1024, maximumExecutionMs: 1000 });
  await assert.rejects(() => requestBounded.invoke('network.http', { operation: 'websocket',
    resource: { type: 'network.url', canonicalId: `${origin}/events` },
    payload: { messages: ['123', '456'], timeoutMs: 1000 } }, signal), /HTTP_WEBSOCKET_MESSAGES_INVALID/u);
} finally { await new Promise<void>((resolve) => sockets.close(() => resolve())); await new Promise<void>((resolve) => server.close(() => resolve())); fs.rmSync(root, { recursive: true, force: true }); }
console.log(JSON.stringify({ ok: true, provider: 'api-flow', realHttp: true, realWebSocket: true, mocks: 0, wrappers: 0 }));
