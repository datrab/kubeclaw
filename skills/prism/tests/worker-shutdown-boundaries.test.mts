import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createTcpServer, type Socket } from 'node:net';
import { once } from 'node:events';
import { PrismEngine, DeterministicDesignProvider } from '../engine/index.ts';
import { WorkerArtifactClient } from '../server/worker-artifacts.ts';
import { createWorkerServer } from '../server/worker-service.ts';
import { WorkerNonceDatabase } from '../server/worker-readiness.ts';
import { loadWorkerConfig } from '../server/worker-config.ts';

async function setup(t: { after(callback: () => Promise<void>): void }, connectTimeoutMs: number) {
  const sockets = new Set<Socket>();
  const tcp = createTcpServer(socket => { sockets.add(socket); socket.on('data', () => {}); socket.on('close', () => sockets.delete(socket)); });
  tcp.listen(0, '127.0.0.1'); await once(tcp, 'listening');
  const address = tcp.address(); assert(address && typeof address !== 'string');
  const database = new WorkerNonceDatabase(`postgresql://local:local@127.0.0.1:${address.port}/local`, connectTimeoutMs);
  const engine = new PrismEngine(new DeterministicDesignProvider());
  const worker = createWorkerServer({ mode: 'hmac', secret: 'local', database }, engine,
    new WorkerArtifactClient(new URL('http://127.0.0.1:1'), 'local', false));
  worker.listen(0, '127.0.0.1'); await once(worker, 'listening');
  const listener = worker.address(); assert(listener && typeof listener !== 'string');
  t.after(async () => {
    worker.closeAllConnections(); await new Promise<void>(resolve => worker.close(() => resolve()));
    for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => tcp.close(() => resolve()));
  });
  return { tcp, sockets, database, worker, engine, origin: new URL(`http://127.0.0.1:${listener.port}`) };
}

// The original pg client connects to an actual TCP peer that does not complete
// PostgreSQL startup. This proves native connection drain/failure, not SQL or
// a running PostgreSQL service. No Pool/client/query replacement is installed.
test('shutdown waits for actual native pg acquisition settlement and closes the original pool', { timeout: 5000 }, async t => {
  const f = await setup(t, 100);
  const connecting = once(f.tcp, 'connection');
  const pending = fetch(new URL('/ready', f.origin));
  await connecting;
  assert.equal(f.database.openConnections, 1);
  const shutdown = f.worker.shutdown(1500);
  assert.equal(f.worker.shutdown(1500), shutdown);
  const response = await pending; assert.equal(response.status, 503); await response.body?.cancel();
  await shutdown;
  assert.equal(f.database.openConnections, 0); assert.equal(f.database.pendingConnections, 0);
  assert.equal(f.engine.cacheUsage().totalEntries, 0);
  await assert.rejects(f.database.check(), /PRISM_NONCE_DATABASE_UNAVAILABLE/u);
});

test('one service deadline fails explicitly while the real pg startup remains unresolved', { timeout: 5000 }, async t => {
  const f = await setup(t, 350);
  const connecting = once(f.tcp, 'connection');
  const pending = fetch(new URL('/ready', f.origin)).then(response => response.body?.cancel(), () => undefined);
  await connecting;
  const shutdown = f.worker.shutdown(30);
  await assert.rejects(shutdown, /PRISM_WORKER_SHUTDOWN_DEADLINE/u);
  assert.equal(f.worker.listening, false);
  assert.equal(f.database.openConnections, 1, 'deadline failure must not be described as native connection reaping');
  await pending;
  const deadline = performance.now() + 2000;
  while (f.database.openConnections > 0 && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(f.database.openConnections, 0); assert.equal(f.database.pendingConnections, 0);
  await assert.rejects(f.worker.shutdown(1500), /PRISM_WORKER_SHUTDOWN_DEADLINE/u,
    'a later call cannot rewrite the failed shutdown outcome');
});

test('invalid service deadline cannot stop a healthy listener; configuration owns a separate bounded default', async t => {
  const f = await setup(t, 100);
  for (const value of [0, -1, 1.5, NaN, Infinity, 2_147_483_648]) {
    await assert.rejects(f.worker.shutdown(value), /Invalid Prism worker shutdown deadline/u);
    const response = await fetch(new URL('/bootstrap', f.origin)); assert.equal(response.status, 200); await response.body?.cancel();
  }
  await f.worker.shutdown(1500);
  const environment = { WORKER_TRUST_SPIFFE_ENABLED: 'true', PRISM_TRUSTED_CONTROL_SPIFFE_ID: 'spiffe://local/control' };
  assert.equal(loadWorkerConfig(environment).shutdownTimeoutMs, 20_000);
  for (const value of ['', '0', '-1', '1.5', 'NaN', 'Infinity', '2147483648']) {
    assert.throws(() => loadWorkerConfig({ ...environment, PRISM_WORKER_SHUTDOWN_TIMEOUT_MS: value }), /PRISM_WORKER_SHUTDOWN_TIMEOUT_MS/u);
  }
});
