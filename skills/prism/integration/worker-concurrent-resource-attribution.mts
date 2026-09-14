import test from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync, createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ContentAddressedArtifactStore } from '../storage/artifacts.ts';
import { handleInternalArtifact } from '../server/internal-artifacts.ts';
import fixture from '../../../contracts/prism/v1/fixtures/minimal-web.json' with { type: 'json' };
import { prismNativeAttempt } from '../engine/worker-envelope.ts';
import { nativeWorkerHarness } from '../tests/native/worker-harness.mts';
import { boundWorkerResult } from '../control/worker-results.ts';

const input = Buffer.from(JSON.stringify({
  document: structuredClone(fixture),
  view: 'home',
  state: 'default',
  viewport: 'wide',
}));
const contentDigest = `sha256:${createHash('sha256').update(input).digest('hex')}`;

await test('native attempt receipt excludes real concurrent supervisor-process CPU', { timeout: 60000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'prism-native-attribution-'));
  const store = new ContentAddressedArtifactStore(root);
  await store.put(input);
  let releaseRead!: () => void;
  let markReadStarted!: () => void;
  const readReleased = new Promise<void>(resolve => { releaseRead = resolve; });
  const readStarted = new Promise<void>(resolve => { markReadStarted = resolve; });
  const server = createServer((request, response) => {
    void (async () => {
      if (request.method !== 'GET') {
        await handleInternalArtifact(request, response, new URL(request.url!, 'http://control'), {
          artifacts: store, spiffeEnabled: false, workerSecret: 'local', trustedControlSpiffeId: '', trustedWorkerSpiffeId: '',
        }); return;
      }
      assert.equal(request.headers.authorization, 'Bearer local');
      assert.equal(request.url, `/v1/internal/artifacts/${contentDigest}`);
      markReadStarted();
      await readReleased;
      response.writeHead(200, { 'content-type': 'application/octet-stream' });
      response.end(input);
    })().catch(error => { response.writeHead(500); response.end(String(error)); });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  const address = server.address();
  assert(address && typeof address !== 'string');
  const origin = new URL(`http://127.0.0.1:${address.port}`);
  const artifact = {
    artifactId: `artifact:${contentDigest}`,
    type: 'prism-engine-input',
    mediaType: 'application/json',
    contentDigest,
    sizeBytes: input.byteLength,
    storageUrl: new URL(`/v1/internal/artifacts/${contentDigest}`, origin).href,
  };
  const envelope = prismNativeAttempt('render', artifact, 'concurrent-resource-attribution');
  const worker = await nativeWorkerHarness(t, { mode: 'spiffe', trustedControlSpiffeId: 'spiffe://local/control' }, origin);
  t.after(() => rm(root, { recursive: true, force: true }));
  worker.listen(0, '127.0.0.1'); await once(worker, 'listening');
  const workerAddress = worker.address(); assert(workerAddress && typeof workerAddress !== 'string');
  const execution = fetch(`http://127.0.0.1:${workerAddress.port}/v1/attempts`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-client-cert': 'URI=spiffe://local/control' }, body: JSON.stringify(envelope) });
  await readStarted;

  const before = process.cpuUsage();
  do { pbkdf2Sync('unrelated concurrent service work', 'local salt', 500_000, 32, 'sha256'); }
  while ((process.cpuUsage(before).user + process.cpuUsage(before).system) / 1000 < 5000);
  const burn = process.cpuUsage(before);
  const unrelatedCpuMs = (burn.user + burn.system) / 1000;
  releaseRead();
  const response = await execution; assert.equal(response.status, 200);
  const result = boundWorkerResult(envelope, await response.json());
  assert.equal(result.schemaVersion, 'worker-attempt-result.v3');
  if (result.schemaVersion !== 'worker-attempt-result.v3') throw new Error('Current receipt required');
  assert.equal(result.state, 'completed', result.error?.message);
  const measured = result.resourceAccounting.observations.cpuTimeMs;
  assert.equal(measured.status, 'observed');
  if (measured.status !== 'observed') throw new Error('Actual kernel CPU observation required');

  assert(unrelatedCpuMs > 100, `expected material unrelated CPU, got ${unrelatedCpuMs} ms`);
  assert(
    measured.value < unrelatedCpuMs / 2,
    `attempt receipt included concurrent service CPU: measured=${measured.value} ms, unrelated=${unrelatedCpuMs} ms`,
  );
});
