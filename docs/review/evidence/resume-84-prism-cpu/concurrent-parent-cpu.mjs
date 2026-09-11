import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pbkdf2Sync } from 'node:crypto';
import fixture from '../../../../contracts/prism/v1/fixtures/minimal-web.json' with { type: 'json' };
import { PrismEngine, DeterministicDesignProvider } from '../../../../skills/prism/engine/index.ts';
import { operationFor } from '../../../../skills/prism/server/worker-operation.ts';
import { prismAttempt } from '../../../../skills/prism/engine/worker-envelope.ts';
import { WorkerArtifactClient } from '../../../../skills/prism/server/worker-artifacts.ts';
import { ContentAddressedArtifactStore } from '../../../../skills/prism/storage/artifacts.ts';
import { handleInternalArtifact } from '../../../../skills/prism/server/internal-artifacts.ts';

const root = await mkdtemp(join(tmpdir(), 'prism-cpu-overlap-'));
const store = new ContentAddressedArtifactStore(root);
let contacted = 0, release, admit;
const held = new Promise(resolve => { release = resolve; });
const bothReading = new Promise(resolve => { admit = resolve; });
const server = createServer((request, response) => {
  void (async () => {
    if (request.method === 'GET') { if (++contacted === 2) admit(); await held; }
    await handleInternalArtifact(request, response, new URL(request.url, 'http://control'), {
      artifacts: store, spiffeEnabled: false, workerSecret: 'local', trustedControlSpiffeId: '', trustedWorkerSpiffeId: '',
    });
  })().catch(error => { response.writeHead(500); response.end(String(error)); });
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const address = server.address(); assert(address && typeof address !== 'string');
const origin = new URL(`http://127.0.0.1:${address.port}`);
try {
  const ref = await store.put(Buffer.from(JSON.stringify({ document: fixture, view: 'home', state: 'default', viewport: 'wide' })));
  const artifact = { artifactId: ref.artifactId, type: 'prism-engine-input', mediaType: 'application/json',
    contentDigest: ref.digest, sizeBytes: ref.sizeBytes, storageUrl: new URL(`/v1/internal/artifacts/${ref.digest}`, origin).href };
  const engine = new PrismEngine(new DeterministicDesignProvider());
  const client = new WorkerArtifactClient(origin, 'local', false);
  const envelopes = [prismAttempt('render', artifact, 'overlap-a'), prismAttempt('render', artifact, 'overlap-b')];
  const operations = envelopes.map(envelope => operationFor(envelope, engine, client));
  const controller = new AbortController(), logs = [];
  const before = process.cpuUsage();
  for (const [index, operation] of operations.entries()) await operation.prepare(envelopes[index].limits);
  const executions = operations.map((operation, index) => operation.execute({ attempt: envelopes[index], signal: controller.signal,
    log(channel, message) { logs.push({ index, channel, message }); } }));
  let timer;
  try { await Promise.race([bothReading, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Both original artifact reads did not arrive')), 5000);
  })]); } finally { clearTimeout(timer); }
  assert.equal(engine.cacheUsage().inFlight, 0, 'Both original attempts are awaiting actual artifact bytes');
  const burnBefore = process.cpuUsage();
  pbkdf2Sync('real unrelated concurrent parent work', 'salt', 1_000_000, 32, 'sha256');
  const burned = process.cpuUsage(burnBefore);
  const unrelatedCpuMs = (burned.user + burned.system) / 1000;
  release();
  await Promise.all(executions);
  const measured = await Promise.all(operations.map(operation => operation.measure({ signal: controller.signal })));
  const consumed = process.cpuUsage(before);
  const processCpuMs = (consumed.user + consumed.system) / 1000;
  const sumReportedCpuMs = measured.reduce((sum, value) => sum + value.cpuTimeMs, 0);
  console.log(JSON.stringify({ unrelatedCpuMs, processCpuMs, sumReportedCpuMs, measured, logs,
    originalEngineCompletions: engine.cacheUsage().completedEntries, nativeBrowserExecuted: false,
    meaning: 'two original overlapping attempts each charge unrelated real shared-parent CPU; not browser-child or isolated CPU proof' }, null, 2));
  assert(unrelatedCpuMs > 20, 'CPU workload must be measurable above timer rounding');
  assert(measured.every(value => value.cpuTimeMs >= unrelatedCpuMs * .95));
  assert(sumReportedCpuMs > processCpuMs * 1.5, 'Overlapping process baselines double-charge actual parent CPU');
  await Promise.all(operations.map(operation => operation.terminate()));
} finally {
  release(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true });
}
