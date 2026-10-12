import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { NetworkHttpCapabilityInvoker } from '@kubeclaw/buster-engine';
import { provider } from '../src/provider.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'api-flow-semantics-'));
for (const name of ['repository', 'evidence']) fs.mkdirSync(path.join(root, name));
const contacts: string[] = [];
let abortOnContact: AbortController | undefined;
const server = http.createServer((request, response) => {
  contacts.push(request.url!);
  if (request.url === '/slow') { abortOnContact!.abort(new Error('CALLER_CANCELLED')); return; }
  response.end(request.url === '/large' ? 'x'.repeat(2048) : 'ok');
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address(); if (!address || typeof address === 'string') throw new Error('SERVER_BIND_FAILED');
const origin = `http://127.0.0.1:${address.port}`;
const capability = new NetworkHttpCapabilityInvoker({ allowedOrigins: [origin], allowedHostSuffixes: [],
  allowedPorts: [address.port], allowedMethods: ['GET'], allowedRequestHeaders: ['accept'],
  maximumResponseBytes: 4096, maximumExecutionMs: 1000 });
function execute(flow: unknown, config: Record<string, unknown> = {}, signal = new AbortController().signal) {
  fs.writeFileSync(path.join(root, 'repository/flow.json'), JSON.stringify(flow));
  return provider().execute({ testIdentity: 'test:semantics', inputs: [], timeoutMs: 1000,
    workspace: { repository: 'repository', evidence: 'evidence' }, configuration: { values: {
      flowFile: 'flow.json', url: origin, maximumResponseBytes: 4096, requestTimeoutMs: 1000, ...config,
    } } } as any, { workspaceRoot: root, signal, log() {},
    invoke: (name: string, request: any) => capability.invoke(name, request, signal) });
}
const skipped = { id: 'dependent', path: '/{{missing}}', expect: { status: 200 } };
const cleanup = [{ id: 'cleanup', path: '/cleanup', expect: { status: 200 } }];
try {
  const empty = await execute({ schemaVersion: 'kubeclaw.api-flow.v1', steps: [skipped] });
  assert.equal(empty.outcome, 'failed');
  assert.deepEqual(empty.counts, { total: 1, passed: 0, failed: 0, skipped: 1 });
  assert.equal(empty.findings[0].rule, 'api-flow.coverage'); assert.deepEqual(contacts, []);
  const setupOnly = await execute({ schemaVersion: 'kubeclaw.api-flow.v1',
    setup: [{ id: 'setup', path: '/setup' }], steps: [skipped], cleanup });
  assert.equal(setupOnly.outcome, 'failed'); assert.equal(setupOnly.findings[0].rule, 'api-flow.coverage');
  assert.deepEqual(contacts, ['/setup', '/cleanup']);
  const mixed = await execute({ schemaVersion: 'kubeclaw.api-flow.v1',
    steps: [skipped, { id: 'independent', path: '/normal', expect: { status: 200 } }] });
  assert.equal(mixed.outcome, 'passed'); assert.equal(mixed.counts.skipped, 1);
  const assertion = await execute({ schemaVersion: 'kubeclaw.api-flow.v1',
    steps: [{ id: 'assertion', path: '/normal', expect: { status: 201 } }] });
  assert.equal(assertion.outcome, 'failed'); assert.equal(assertion.findings[0].rule, 'api-flow.assertion');
  const before = contacts.length;
  await assert.rejects(() => execute({ schemaVersion: 'kubeclaw.api-flow.v1',
    steps: [{ id: 'denied', path: '/denied', headers: { authorization: 'forbidden' } },
      { id: 'later', path: '/must-not-run' }], cleanup }), /HTTP_REQUEST_HEADER_DENIED/u);
  assert.deepEqual(contacts.slice(before), ['/cleanup'], 'cleanup runs without hiding the original policy error');
  await assert.rejects(() => execute({ schemaVersion: 'kubeclaw.api-flow.v1',
    steps: [{ id: 'large', path: '/large' }] }, { maximumResponseBytes: 64 }), /HTTP_RESPONSE_SIZE_EXCEEDED/u);
  const beforeAbort = contacts.length; abortOnContact = new AbortController();
  await assert.rejects(() => execute({ schemaVersion: 'kubeclaw.api-flow.v1',
    steps: [{ id: 'slow', path: '/slow' }], cleanup }, {}, abortOnContact!.signal), /CALLER_CANCELLED/u);
  assert.deepEqual(contacts.slice(beforeAbort), ['/slow'], 'cancellation prohibits additional cleanup requests');
} finally {
  server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(root, { recursive: true, force: true });
}
console.log(JSON.stringify({ ok: true, provider: 'api-flow', realHttp: true, mocks: 0 }));
