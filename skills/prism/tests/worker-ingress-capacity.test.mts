import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createManagedWorkerServer } from '../server/worker-lifecycle.ts';
import { workerIngressLimits } from '../server/worker-config.ts';

function response(request: http.ClientRequest): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    request.once('error', reject);
    request.once('response', incoming => {
      const chunks: Buffer[] = [];
      incoming.on('data', bytes => chunks.push(bytes));
      incoming.once('error', reject);
      incoming.once('end', () => resolve({ status: incoming.statusCode!, body: Buffer.concat(chunks).toString('utf8') }));
    });
  });
}

test('actual HTTP ingress rejects excess unfinished bodies while reserving health capacity', { timeout: 15000 }, async () => {
  let accepted = 0;
  let notify: () => void = () => {};
  const receiving = new Promise<void>(resolve => { notify = resolve; });
  const server = createManagedWorkerServer(async (request, outgoing) => {
    if (request.url === '/health') { outgoing.end('alive'); return; }
    accepted += 1; notify();
    const chunks: Buffer[] = [];
    for await (const bytes of request) chunks.push(bytes);
    outgoing.end(Buffer.concat(chunks));
  }, async () => {}, { ...workerIngressLimits({}), maximumActiveRequests: 1, maximumProbeRequests: 1, maximumConnections: 4 });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  const options = { host: '127.0.0.1', port, agent: false as const };
  const first = http.request({ ...options, method: 'POST', path: '/attempt', headers: { 'content-length': '8' } });
  const firstResponse = response(first); first.flushHeaders(); first.write('slow');
  try {
    await receiving;
    const second = http.request({ ...options, method: 'POST', path: '/attempt' });
    const rejected = response(second); second.end('must-not-enter');
    assert.deepEqual(await rejected, { status: 503, body: '{"status":"not-ready","error":"PRISM_WORKER_CAPACITY_EXCEEDED"}' });
    assert.equal(accepted, 1);
    const health = http.request({ ...options, method: 'GET', path: '/health' });
    const healthResponse = response(health); health.end();
    assert.deepEqual(await healthResponse, { status: 200, body: 'alive' });
    first.end('body'); assert.deepEqual(await firstResponse, { status: 200, body: 'slowbody' });
    const next = http.request({ ...options, method: 'POST', path: '/attempt' });
    const nextResponse = response(next); next.end('next');
    assert.deepEqual(await nextResponse, { status: 200, body: 'next' }); assert.equal(accepted, 2);
    assert.equal(server.maxConnections, 4); assert.equal(server.requestTimeout, 120000);
  } finally {
    first.destroy(); await firstResponse.catch(() => undefined);
    await server.shutdown(2000);
  }
});
