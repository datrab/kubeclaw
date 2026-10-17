import { captureSwarmSettings, type PrismWorkerSettings, type PrismNonceDatabaseSettings } from '../../common/plugin-runtime/foundation/config/swarm.ts';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createTcpServer, type Socket } from 'node:net';
import { once } from 'node:events';
import { createManagedWorkerServer } from '../server/worker-lifecycle.ts';
import { WorkerNonceDatabase } from '../server/worker-readiness.ts';
import { loadWorkerConfig } from '../server/worker-config.ts';

function settings(t: TestContext, shutdownTimeoutMs?: number) {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'prism-shutdown-author-'));
  t.after(() => { fs.rmSync(root, { recursive: true, force: true }); });
  fs.cpSync(fileURLToPath(new URL('../../../config/', import.meta.url)), root, { recursive: true });
  const authorFile = path.join(root, 'components/prism-worker.config.json');
  const authored = JSON.parse(fs.readFileSync(authorFile, 'utf8'));
  if (shutdownTimeoutMs !== undefined) authored.profiles.standard.settings.ingress.shutdownTimeoutMs = shutdownTimeoutMs;
  // Lifecycle deadlines are intentionally short; keep the selected profile internally valid.
  if (shutdownTimeoutMs !== undefined) Object.assign(authored.profiles.standard.settings.supervisor, { drainTimeoutMs: 1, closeTimeoutMs: 1 });
  fs.writeFileSync(authorFile, JSON.stringify(authored));
  const entryFile = path.join(root, 'pipeline.config.json');
  const entry = JSON.parse(fs.readFileSync(entryFile, 'utf8'));
  const instanceId = 'kubeclaw/prism/prism-worker';
  const captured = captureSwarmSettings(entryFile, { role: 'prism', callerId: 'prism-worker', serviceInstanceId: instanceId,
    bindings: entry.bindings.filter((binding: { instanceId: string }) => binding.instanceId === instanceId)
      .map(({ role: _role, ...binding }: { role: string; owner: string; instanceId: string; profileId: string }) => binding) });
  // Real central selection for lifecycle coverage, not a verified startup/native capability.
  const ingress = captured.components['prism-worker']!.settings.ingress as unknown as PrismWorkerSettings;
  return { ingress, shutdownTimeoutMs: ingress.shutdownTimeoutMs,
    nonceDatabase: captured.components['prism-worker']!.settings.nonceDatabase as unknown as PrismNonceDatabaseSettings };
}

async function setup(t: TestContext, connectTimeoutMs: number, shutdownTimeoutMs = 1500) {
  const config = settings(t, shutdownTimeoutMs);
  const sockets = new Set<Socket>();
  const tcp = createTcpServer(socket => { sockets.add(socket); socket.on('data', () => {}); socket.on('close', () => sockets.delete(socket)); });
  tcp.listen(0, '127.0.0.1'); await once(tcp, 'listening');
  const address = tcp.address(); assert(address && typeof address !== 'string');
  const database = new WorkerNonceDatabase(`postgresql://local:local@127.0.0.1:${address.port}/local`, { ...config.nonceDatabase, timeoutMs: connectTimeoutMs });
  // Exercise the original service lifecycle and original pg pool directly.
  // This HTTP application performs a real database check; it does not stand in
  // for native attempt execution or manufacture Worker receipts.
  const worker = createManagedWorkerServer(async (request, response, signal) => {
    if (request.url === '/bootstrap') { response.writeHead(200); response.end(); return; }
    try { await database.check(signal); response.writeHead(200); }
    catch { response.writeHead(503); }
    response.end();
  }, () => database.close(), config.ingress);
  worker.listen(0, '127.0.0.1'); await once(worker, 'listening');
  const listener = worker.address(); assert(listener && typeof listener !== 'string');
  t.after(async () => {
    worker.closeAllConnections(); await new Promise<void>(resolve => worker.close(() => resolve()));
    for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => tcp.close(() => resolve()));
  });
  return { tcp, sockets, database, worker, config, origin: new URL(`http://127.0.0.1:${listener.port}`) };
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
  const shutdown = f.worker.shutdown(f.config.shutdownTimeoutMs);
  assert.equal(f.worker.shutdown(f.config.shutdownTimeoutMs), shutdown);
  const response = await pending; assert.equal(response.status, 503); await response.body?.cancel();
  await shutdown;
  assert.equal(f.database.openConnections, 0); assert.equal(f.database.pendingConnections, 0);
  await assert.rejects(f.database.check(), /PRISM_NONCE_DATABASE_UNAVAILABLE/u);
});

test('one service deadline fails explicitly while the real pg startup remains unresolved', { timeout: 5000 }, async t => {
  const f = await setup(t, 350, 30);
  const connecting = once(f.tcp, 'connection');
  const pending = fetch(new URL('/ready', f.origin)).then(response => response.body?.cancel(), () => undefined);
  await connecting;
  const shutdown = f.worker.shutdown(f.config.shutdownTimeoutMs);
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
  await f.worker.shutdown(f.config.shutdownTimeoutMs);
  const environment = { WORKER_TRUST_SPIFFE_ENABLED: 'true', PRISM_TRUSTED_CONTROL_SPIFFE_ID: 'spiffe://local/control' };
  assert.equal(settings(t).shutdownTimeoutMs, 120_000);
  // Retired environment authors must reject before requiring a boot capture.
  for (const value of ['', '0', '-1', '1.5', 'NaN', 'Infinity', '2147483648']) {
    assert.throws(() => loadWorkerConfig(undefined as never, { ...environment, PRISM_WORKER_SHUTDOWN_TIMEOUT_MS: value }), /PRISM_WORKER_SHUTDOWN_TIMEOUT_MS/u);
  }
});
