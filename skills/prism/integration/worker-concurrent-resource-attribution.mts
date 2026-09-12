import test from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync, createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import fixture from '../../../contracts/prism/v1/fixtures/minimal-web.json' with { type: 'json' };
import { PrismEngine, DeterministicDesignProvider } from '../engine/index.ts';
import { prismAttempt } from '../engine/worker-envelope.ts';
import { operationFor } from '../server/worker-operation.ts';
import { WorkerArtifactClient } from '../server/worker-artifacts.ts';

const input = Buffer.from(JSON.stringify({
  document: structuredClone(fixture),
  view: 'home',
  state: 'default',
  viewport: 'wide',
}));
const contentDigest = `sha256:${createHash('sha256').update(input).digest('hex')}`;

await test('one small original Prism attempt does not inherit concurrent service CPU', async t => {
  let releaseRead!: () => void;
  let markReadStarted!: () => void;
  const readReleased = new Promise<void>(resolve => { releaseRead = resolve; });
  const readStarted = new Promise<void>(resolve => { markReadStarted = resolve; });
  const server = createServer((request, response) => {
    void (async () => {
      assert.equal(request.headers.authorization, 'Bearer local');
      assert.equal(request.url, `/v1/internal/artifacts/${contentDigest}`);
      assert.equal(request.method, 'GET');
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
  const envelope = prismAttempt('render', artifact, 'concurrent-resource-attribution');
  const operation = operationFor(
    envelope,
    new PrismEngine(new DeterministicDesignProvider()),
    new WorkerArtifactClient(origin, 'local', false),
  );
  operation.prepare(envelope.limits);
  const signal = new AbortController().signal;
  const execution = operation.execute({ attempt: envelope, signal, log() {} });
  await readStarted;

  const before = process.cpuUsage();
  pbkdf2Sync('unrelated concurrent service work', 'local salt', 2_000_000, 32, 'sha256');
  const burn = process.cpuUsage(before);
  const unrelatedCpuMs = (burn.user + burn.system) / 1000;
  releaseRead();
  await execution;
  const measured = await operation.measure({ signal });
  await operation.terminate();

  assert(unrelatedCpuMs > 100, `expected material unrelated CPU, got ${unrelatedCpuMs} ms`);
  assert(
    measured.cpuTimeMs < unrelatedCpuMs / 2,
    `attempt receipt included concurrent service CPU: measured=${measured.cpuTimeMs} ms, unrelated=${unrelatedCpuMs} ms`,
  );
});
