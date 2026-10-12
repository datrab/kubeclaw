import { readTestBundle, writeTestBundle } from '../../../tests/fixtures/config/swarm-bundle.mjs';
import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { connect, type AddressInfo, type Socket } from 'node:net';
import { once } from 'node:events';
import { createManagedWorkerServer } from '../server/worker-lifecycle.ts';
import { loadWorkerConfig } from '../server/worker-config.ts';
import type { PrismWorkerSettings } from '../../common/plugin-runtime/foundation/config/swarm.ts';

function settings(t: TestContext, overrides: Partial<PrismWorkerSettings>) {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'prism-worker-behavior-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const authored = readTestBundle(new URL('../../../charts/kubeclaw/files/config/swarm.config.json', import.meta.url));
  Object.assign(authored['prism-worker'].settings.ingress, overrides);
  const file = path.join(root, 'swarm.config.json'); writeTestBundle(file, authored);
  return loadWorkerConfig({ SWARM_CONFIG: file, WORKER_TRUST_SPIFFE_ENABLED: 'true', PRISM_TRUSTED_CONTROL_SPIFFE_ID: 'spiffe://local/control' });
}
function get(port: number, pathname: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: '127.0.0.1', port, path: pathname, agent: false }, response => {
      let body = ''; response.setEncoding('utf8'); response.on('data', chunk => { body += chunk; });
      response.on('error', reject); response.on('end', () => resolve({ status: response.statusCode!, body }));
    });
    request.on('error', reject);
  });
}
async function socket(port: number): Promise<Socket> {
  const value = connect(port, '127.0.0.1'); await once(value, 'connect'); return value;
}

test('CB01 real probe reservation overflows and recovers while work remains active', { timeout: 10000 }, async t => {
  const config = settings(t, { maximumActiveRequests: 1, maximumProbeRequests: 2, maximumConnections: 8 });
  const releases: (() => void)[] = [];
  let notify = () => {}; let entered = 0;
  const server = createManagedWorkerServer(async (_request, outgoing) => {
    entered += 1;
    await new Promise<void>(resolve => { releases.push(resolve); notify(); });
    outgoing.end('released');
  }, async () => {}, config.ingress);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  t.after(async () => { for (const release of releases) release(); await server.shutdown(config.shutdownTimeoutMs); });
  async function held(pathname: string) {
    const ready = new Promise<void>(resolve => { notify = resolve; });
    const response = get(port, pathname); await ready; return { response };
  }
  const work = await held('/attempt');
  const probe1 = await held('/health'); const probe2 = await held('/ready');
  const overflow = await get(port, '/bootstrap');
  assert.equal(overflow.status, 503); assert.match(overflow.body, /PRISM_WORKER_CAPACITY_EXCEEDED/);
  assert.equal(entered, 3, 'overflow never entered the handler');
  releases[1]!(); assert.equal((await probe1.response).status, 200);
  const recovered = await held('/health');
  releases[3]!(); assert.equal((await recovered.response).status, 200);
  assert.equal(entered, 4, 'released probe capacity is reusable while original work is held');
  releases[0]!(); releases[2]!();
  assert.equal((await work.response).status, 200); assert.equal((await probe2.response).status, 200);
});

test('CB02 actual TCP connection limit rejects the next socket and reopens after release', { timeout: 10000 }, async t => {
  const config = settings(t, { maximumActiveRequests: 1, maximumProbeRequests: 1, maximumConnections: 3 });
  const server = createManagedWorkerServer(async (_request, response) => { response.end('ok'); }, async () => {}, config.ingress);
  const clients: Socket[] = []; const accepted: Socket[] = [];
  server.on('connection', value => { accepted.push(value); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  t.after(async () => { for (const client of clients) client.destroy(); for (const connection of accepted) connection.destroy(); await server.shutdown(config.shutdownTimeoutMs); });
  for (let index = 0; index < 3; index++) {
    const admission = once(server, 'connection'); clients.push(await socket(port)); await admission;
  }
  assert.equal(accepted.length, 3);
  const dropped = once(server, 'drop'); const extra = connect(port, '127.0.0.1'); clients.push(extra);
  const closed = once(extra, 'close'); await dropped; await closed;
  assert.equal(accepted.length, 3, 'fourth socket is not admitted to the HTTP server');
  const released = once(accepted[0]!, 'close'); clients[0]!.destroy(); await released;
  const admission = once(server, 'connection'); clients.push(await socket(port)); await admission;
  assert.equal(accepted.length, 4, 'after release a new socket reaches the server');
});

test('CB03 original Node body deadline sends 408 without shortening its checking interval', { timeout: 45000 }, async t => {
  const config = settings(t, { maximumActiveRequests: 2, maximumProbeRequests: 1, maximumConnections: 8, requestTimeoutMs: 100 });
  let bodyStarted = () => {};
  const receiving = new Promise<void>(resolve => { bodyStarted = resolve; });
  const server = createManagedWorkerServer(async (request, response) => {
    if (request.url === '/health') { response.end('healthy'); return; }
    if (request.url === '/slow') bodyStarted();
    try { for await (const _bytes of request) { /* Consume real bytes; wait for completion or native timeout. */ } }
    catch { return; } // Expected native body disconnect is the scenario under test.
    response.end('complete');
  }, async () => {}, config.ingress);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  const fast = await fetch(`http://127.0.0.1:${port}/attempt`, { method: 'POST', body: 'complete' });
  assert.equal(fast.status, 200); assert.equal(await fast.text(), 'complete');
  const slow = await socket(port); let wire = ''; slow.setEncoding('utf8'); slow.on('data', bytes => { wire += bytes; });
  t.after(async () => { slow.destroy(); await server.shutdown(config.shutdownTimeoutMs); });
  const started = performance.now(); const closed = once(slow, 'close');
  slow.write('POST /slow HTTP/1.1\r\nHost: localhost\r\nContent-Length: 8\r\nConnection: close\r\n\r\nslow');
  await receiving;
  assert.deepEqual(await get(port, '/health'), { status: 200, body: 'healthy' });
  await closed;
  assert.match(wire, /^HTTP\/1\.1 408 Request Timeout\r\n/);
  assert.ok(performance.now() - started >= config.ingress.requestTimeoutMs, 'the actual configured deadline elapsed');
  assert.equal(slow.destroyed, true);
});
