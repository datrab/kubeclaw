import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fixture from '../../../contracts/prism/v1/fixtures/minimal-web.json' with { type: 'json' };
import { PrismEngine, DeterministicDesignProvider } from '../engine/index.ts';
import { PrismWorkerOperation } from '../server/worker-operation.ts';
import { WorkerArtifactClient } from '../server/worker-artifacts.ts';
import { ContentAddressedArtifactStore } from '../storage/artifacts.ts';
import { handleInternalArtifact } from '../server/internal-artifacts.ts';
import { prismNativeAttempt } from '../engine/worker-envelope.ts';
import { type WorkerAttemptEnvelopeV3 } from '@kubeclaw/pipeline-worker-core-contract';

const request = (key: string) => ({ contract: 'kubeclaw.prism-design-engine@1' as const,
  operation: 'render' as const, input: { document: structuredClone(fixture), view: 'home', state: 'default', viewport: 'wide' }, idempotencyKey: key });

test('only the admitted owner can cancel a pending original render; callers without cancellation still coalesce', async () => {
  const engine = new PrismEngine(new DeterministicDesignProvider());
  const owner = new AbortController(), stranger = new AbortController();
  const options = { signal: owner.signal };
  const first = engine.execute(request('owner'), options);
  options.signal = stranger.signal;
  const duplicate = engine.execute(request('owner'), { signal: owner.signal });
  await assert.rejects(engine.execute(request('owner'), { signal: stranger.signal }), /OWNER_CONFLICT/u);
  stranger.abort();
  assert.equal(await first, await duplicate);
  const firstUnowned = engine.execute(request('unowned')), same = engine.execute(request('unowned'));
  assert.equal(await firstUnowned, await same);
  const cancelled = new AbortController();
  const pending = engine.execute(request('cancel'), { signal: cancelled.signal });
  cancelled.abort(new Error('owner cancelled'));
  await assert.rejects(pending, /owner cancelled/u);
  assert.equal(engine.cacheUsage().inFlight, 0);
  await assert.rejects(engine.execute(request('pre-abort'), { signal: cancelled.signal }), /owner cancelled/u);
  assert.equal(engine.cacheUsage().completedEntries, 2);
});

async function setup(t: { after(callback: () => Promise<void>): void }, stall: 'upload' | 'read' | undefined = undefined) {
  const root = await mkdtemp(join(tmpdir(), 'prism-cancel-'));
  const store = new ContentAddressedArtifactStore(root);
  let uploadClosed = false, storedUpload = '';
  let started!: () => void;
  const contact = new Promise<void>(resolve => { started = resolve; });
  const server = createServer((req, res) => {
    const run = async () => {
      if (stall === 'read' && req.method === 'GET') {
        res.on('close', () => { uploadClosed = true; });
        res.writeHead(200); res.write('{'); started(); return;
      }
      if (stall === 'upload' && req.method === 'POST') {
        const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
        storedUpload = (await store.put(Buffer.concat(chunks))).artifactId;
        res.on('close', () => { uploadClosed = true; });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.write('{"artifactId":'); // Actual persisted write, stalled acknowledgment body.
        started();
        return;
      }
      await handleInternalArtifact(req, res, new URL(req.url!, 'http://control'), {
        artifacts: store, spiffeEnabled: false, workerSecret: 'local', trustedControlSpiffeId: '', trustedWorkerSpiffeId: '',
      });
    };
    void run().catch((error: unknown) => { res.writeHead(500); res.end(String(error)); });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); });
  const address = server.address(); assert(address && typeof address !== 'string');
  const origin = new URL(`http://127.0.0.1:${address.port}`);
  const ref = await store.put(Buffer.from(JSON.stringify(request('input').input)));
  const envelope = structuredClone(prismNativeAttempt('render', { artifactId: ref.artifactId, type: 'prism-engine-input', mediaType: 'application/json',
    contentDigest: ref.digest, sizeBytes: ref.sizeBytes, storageUrl: new URL(`/v1/internal/artifacts/${ref.digest}`, origin).href }, 'cancel-test')) as WorkerAttemptEnvelopeV3;
  return { store, envelope, client: new WorkerArtifactClient(origin, 'local', false), engine: new PrismEngine(new DeterministicDesignProvider()),
    contact, uploadClosed: () => uploadClosed, storedUpload: () => storedUpload };
}

test('real full-log upload aborts a stalled response body; persisted receiver bytes are not claimed rolled back', { timeout: 5000 }, async t => {
  const f = await setup(t, 'upload');
  const content = Buffer.from('[system] Prism render operation started');
  const controller = new AbortController();
  const rejected = assert.rejects(f.client.upload('prism-full-log', 'log', 'text/plain', content, controller.signal));
  await f.contact; controller.abort(); await rejected;
  for (let index = 0; index < 20 && !f.uploadClosed(); index++) await new Promise(resolve => setTimeout(resolve, 10));
  assert(f.uploadClosed(), 'actual fetch response connection closed on phase abort');
  assert.equal(Buffer.from(await f.store.get(f.storedUpload())).toString(), '[system] Prism render operation started');
});


test('terminate aborts and drains the original artifact read before any engine operation starts', async t => {
  const f = await setup(t, 'read');
  const operation = new PrismWorkerOperation(f.envelope, f.engine, f.client);
  operation.prepare(f.envelope.limits);
  const result = operation.execute({ signal: new AbortController().signal, log() {} });
  const rejected = assert.rejects(result, /terminated/u);
  await f.contact;
  await operation.terminate();
  await rejected;
  assert.equal(f.engine.cacheUsage().totalEntries, 0);
  for (let index = 0; index < 20 && !f.uploadClosed(); index++) await new Promise(resolve => setTimeout(resolve, 10));
  assert(f.uploadClosed());
});


test('owner cancellation before retention rejects every coalesced original-render caller', async () => {
  const engine = new PrismEngine(new DeterministicDesignProvider());
  const owner = new AbortController();
  const first = engine.execute(request('retention-cancel'), { signal: owner.signal });
  const duplicate = engine.execute(request('retention-cancel'), { signal: owner.signal });
  const rejected = Promise.all([assert.rejects(first, /cancel before retain/u), assert.rejects(duplicate, /cancel before retain/u)]);
  queueMicrotask(() => queueMicrotask(() => owner.abort(new Error('cancel before retain'))));
  await rejected;
  assert.deepEqual(engine.cacheUsage(), { inFlight: 0, completedEntries: 0, completedBytes: 0, totalEntries: 0 });
  assert.match(String((await engine.execute(request('retention-cancel'))).output.html), /<!doctype html>/u);
});
