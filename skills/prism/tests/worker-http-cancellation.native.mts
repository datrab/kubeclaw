import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request, type Server, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fixture from '../../../contracts/prism/v1/fixtures/minimal-web.json' with { type: 'json' };
import { prismNativeAttempt } from '../engine/worker-envelope.ts';
import { ContentAddressedArtifactStore } from '../storage/artifacts.ts';
import { nativeWorkerHarness } from './native/worker-harness.mts';
import { handleInternalArtifact } from '../server/internal-artifacts.ts';

async function listen(server: Server): Promise<URL> {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string');
  return new URL(`http://127.0.0.1:${address.port}`);
}
async function close(server: Server) {
  server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
async function setup(t: { after(callback: () => Promise<void>): void }, stall?: 'read' | 'upload') {
  const root = await mkdtemp(join(tmpdir(), 'prism-http-cancel-'));
  const store = new ContentAddressedArtifactStore(root), started = deferred(), drained = deferred();
  let stalled: ServerResponse | undefined, storedUpload: string | undefined;
  const contacts: string[] = [];
  const control = createServer((req, res) => {
    contacts.push(req.method!);
    void (async () => {
      if ((stall === 'read' && req.method === 'GET') || (stall === 'upload' && req.method === 'POST')) {
        stalled = res;
        res.once('close', drained.resolve);
        if (stall === 'upload') {
          const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
          storedUpload = (await store.put(Buffer.concat(chunks))).artifactId;
        }
        res.writeHead(200, { 'content-type': 'application/json' }); res.write('{');
        started.resolve(); return;
      }
      await handleInternalArtifact(req, res, new URL(req.url!, 'http://control'), {
        artifacts: store, spiffeEnabled: false, workerSecret: 'local', trustedControlSpiffeId: '', trustedWorkerSpiffeId: '',
      });
    })().catch((error: unknown) => { res.writeHead(500); res.end(String(error)); });
  });
  const origin = await listen(control);
  const worker = await nativeWorkerHarness(t, { mode: 'spiffe', trustedControlSpiffeId: 'spiffe://local/control' }, origin);
  const workerOrigin = await listen(worker);
  t.after(async () => { stalled?.destroy(); await close(control); await close(worker); await rm(root, { recursive: true, force: true }); });
  const input = await store.put(Buffer.from(JSON.stringify({ document: fixture, view: 'home', state: 'default', viewport: 'wide' })));
  const envelope = prismNativeAttempt('render', { artifactId: input.artifactId, type: 'prism-engine-input', mediaType: 'application/json',
    contentDigest: input.digest, sizeBytes: input.sizeBytes, storageUrl: new URL(`/v1/internal/artifacts/${input.digest}`, origin).href }, 'http-cancellation');
  return { store, envelope, worker, workerOrigin, started, drained, contacts, storedUpload: () => storedUpload };
}
const headers = { 'content-type': 'application/json', 'x-forwarded-client-cert': 'URI=spiffe://local/control' };

for (const phase of ['read', 'upload'] as const) {
  test(`actual HTTP caller disconnect cancels and drains original artifact ${phase}`, { timeout: 10_000 }, async t => {
    const f = await setup(t, phase);
    const caller = request(new URL('/v1/attempts', f.workerOrigin), { method: 'POST', headers });
    caller.on('error', () => {}); // The deliberate socket destruction is the cancellation event.
    caller.end(JSON.stringify(f.envelope));
    await f.started.promise;
    caller.destroy();
    await Promise.race([f.drained.promise, new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error('artifact I/O remained active after caller disconnect')), 1500);
      timer.unref(); f.drained.promise.then(() => clearTimeout(timer));
    })]);
    if (phase === 'read') {
      assert.deepEqual(f.contacts, ['GET'], 'cancelled hydration must not start rendering or upload a full log');
    } else {
      assert.deepEqual(f.contacts, ['GET', 'POST']);
      assert.equal(Buffer.from(await f.store.get(f.storedUpload()!)).toString(), '[system] Prism render operation started',
        'receiver bytes persisted before disconnect remain real; cancellation does not roll them back');
    }
  });
}

test('normal HTTP completion keeps its bound result and original persisted full log', { timeout: 10_000 }, async t => {
  const f = await setup(t);
  const response = await fetch(new URL('/v1/attempts', f.workerOrigin), { method: 'POST', headers, body: JSON.stringify(f.envelope) });
  assert.equal(response.status, 200);
  const result = await response.json() as { state: string; attemptId: string; evidence: { evidenceId: string; artifact: { artifactId: string } }[] };
  assert.equal(result.state, 'completed'); assert.equal(result.attemptId, f.envelope.attemptId);
  const log = result.evidence.find(value => value.evidenceId === 'prism-full-log'); assert(log);
  assert.equal(Buffer.from(await f.store.get(log.artifact.artifactId)).toString(), '[system] Prism render operation started');
});

for (const phase of ['read', 'upload'] as const) {
  test(`service shutdown drains the original ${phase} and returns a cancelled bound attempt`, { timeout: 10_000 }, async t => {
    const f = await setup(t, phase);
    const response = fetch(new URL('/v1/attempts', f.workerOrigin), { method: 'POST', headers, body: JSON.stringify(f.envelope) });
    await f.started.promise;
    const shutdown = f.worker.shutdown(1500);
    assert.equal(f.worker.shutdown(1500), shutdown, 'repeated shutdown must share one drain');
    const result = await (await response).json() as { state: string; attemptId: string; error?: { code: string } };
    assert.equal(result.state, 'cancelled'); assert.equal(result.attemptId, f.envelope.attemptId);
    assert.equal(result.error?.code, 'WORKER_ATTEMPT_CANCELLED');
    await shutdown; await f.drained.promise;
    assert.equal(f.worker.listening, false);
    await assert.rejects(fetch(new URL('/ready', f.workerOrigin)), /fetch failed/u);
  });
}

test('shutdown interrupts a real incomplete request body before authentication or artifact I/O', { timeout: 10_000 }, async t => {
  const f = await setup(t);
  const admitted = once(f.worker, 'request');
  const caller = request(new URL('/v1/attempts', f.workerOrigin), { method: 'POST', headers: { ...headers, 'content-length': '1000' } });
  const disconnected = once(caller, 'error');
  caller.write('{');
  await admitted;
  await f.worker.shutdown(1500); await disconnected;
  assert.deepEqual(f.contacts, []);
});
