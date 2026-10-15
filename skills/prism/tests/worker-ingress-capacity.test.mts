import { fileURLToPath } from 'node:url';
import { captureSwarmSettings, type PrismWorkerSettings } from '../../common/plugin-runtime/foundation/config/swarm.ts';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createManagedWorkerServer } from '../server/worker-lifecycle.ts';

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

test('actual HTTP ingress rejects excess unfinished bodies while reserving health capacity', { timeout: 15000 }, async t => {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'prism-ingress-config-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(fileURLToPath(new URL('../../../config/', import.meta.url)), root, { recursive: true });
  const authorFile = path.join(root, 'components/prism-worker.config.json');
  const authored = JSON.parse(fs.readFileSync(authorFile, 'utf8'));
  Object.assign(authored.profiles.standard.settings.ingress, { maximumActiveRequests: 1, maximumProbeRequests: 1, maximumConnections: 4 });
  fs.writeFileSync(authorFile, JSON.stringify(authored));
  const entryFile = path.join(root, 'pipeline.config.json');
  const entry = JSON.parse(fs.readFileSync(entryFile, 'utf8'));
  const instanceId = 'kubeclaw/prism/prism-worker';
  const captured = captureSwarmSettings(entryFile, { role: 'prism', callerId: 'prism-worker', serviceInstanceId: instanceId,
    bindings: entry.bindings.filter((binding: { instanceId: string }) => binding.instanceId === instanceId)
      .map(({ role: _role, ...binding }: { role: string; owner: string; instanceId: string; profileId: string }) => binding) });
  // Real central selection for a consumer regression; not a privileged startup capability.
  const ingress = captured.components['prism-worker']!.settings.ingress as unknown as PrismWorkerSettings;
  let accepted = 0;
  let notify: () => void = () => {};
  const receiving = new Promise<void>(resolve => { notify = resolve; });
  const server = createManagedWorkerServer(async (request, outgoing) => {
    if (request.url === '/health') { outgoing.end('alive'); return; }
    accepted += 1; notify();
    const chunks: Buffer[] = [];
    for await (const bytes of request) chunks.push(bytes);
    outgoing.end(Buffer.concat(chunks));
  }, async () => {}, ingress);
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
