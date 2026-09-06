import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import { once } from 'node:events';
import { NetworkHttpCapabilityInvoker } from '../../../skills/buster/engine/test-gates/network-http-runtime.ts';

test('suffix matching cannot contact an unrelated real HTTP service; exact origin works and redirects stop', async () => {
  let contacts = 0;
  const server = http.createServer((request, response) => {
    contacts++;
    if (request.url === '/redirect') { response.writeHead(302, { location: '/forbidden' }); response.end(); }
    else response.end('real service response');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = (server.address() as import('node:net').AddressInfo).port;
  const origin = `http://127.0.0.1:${port}`;
  const options = { allowedOrigins: [], allowedHostSuffixes: ['.0.0.1'], allowedPorts: [port], maximumResponseBytes: 4096, maximumExecutionMs: 2000 };
  const request = (method: string, route = '/') => ({ operation: 'request', resource: { type: 'network.url', canonicalId: origin + route }, payload: { method } });
  try {
    const restricted = new NetworkHttpCapabilityInvoker(options);
    for (const method of ['GET', 'HEAD']) await assert.rejects(restricted.invoke('network.http', request(method), new AbortController().signal), /HTTP_REQUEST_EXACT_ORIGIN_REQUIRED/);
    assert.equal(contacts, 0);
    const allowed = new NetworkHttpCapabilityInvoker({ ...options, allowedOrigins: [origin] });
    const response = await allowed.invoke('network.http', request('GET'), new AbortController().signal);
    assert.equal(response.body, 'real service response');
    assert.equal(contacts, 1);
    await assert.rejects(allowed.invoke('network.http', request('GET', '/redirect'), new AbortController().signal), /HTTP_RESPONSE_REDIRECT_DENIED/);
    assert.equal(contacts, 2, 'redirect target must never be contacted');
  } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

test('fixture leases reject expired authority before contact and cancel a real in-flight request at expiry', async () => {
  let contacts = 0;
  const server = http.createServer((request, response) => {
    contacts += 1;
    if (request.url !== '/pending') response.end('leased response');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = (server.address() as import('node:net').AddressInfo).port;
  const origin = `http://127.0.0.1:${port}`;
  const invoker = new NetworkHttpCapabilityInvoker({ allowedOrigins: [origin], allowedHostSuffixes: [],
    allowedPorts: [port], maximumResponseBytes: 4096, maximumExecutionMs: 10000 });
  const request = (route: string) => ({ operation: 'request', resource: { type: 'network.url', canonicalId: origin + route }, payload: {} });
  const inputs = (expiresAt: string) => [{ name: 'deployment', kind: 'value' as const,
    schemaId: 'kubeclaw.kubernetes-deployment-fixture@1', value: { schemaVersion: 'kubernetes-deployment-fixture.v1',
      expiresAt, endpoints: [{ name: 'api', url: origin }] } }];
  try {
    await assert.rejects(() => invoker.invoke('network.http', request('/'), new AbortController().signal,
      inputs(new Date(Date.now() - 1000).toISOString())), /FIXTURE_AUTHORITY_EXPIRED/);
    await assert.rejects(() => invoker.invoke('network.http', request('/'), new AbortController().signal,
      inputs('invalid-date')), /FIXTURE_AUTHORITY_INVALID/);
    assert.equal(contacts, 0);
    const valid = await invoker.invoke('network.http', request('/'), new AbortController().signal,
      inputs(new Date(Date.now() + 60000).toISOString()));
    assert.equal(valid.body, 'leased response');
    const expiry = Date.now() + 1000;
    await assert.rejects(() => invoker.invoke('network.http', request('/pending'), new AbortController().signal,
      inputs(new Date(expiry).toISOString())), /HTTP_REQUEST_CANCELLED/);
    assert.equal(contacts, 2, 'the pending request genuinely reached the server');
    assert.ok(Date.now() >= expiry, 'expiry cancelled the in-flight request');
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
