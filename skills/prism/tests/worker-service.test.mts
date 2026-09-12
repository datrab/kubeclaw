import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, pbkdf2Sync } from 'node:crypto';
import fixture from '../../../contracts/prism/v1/fixtures/minimal-web.json' with { type: 'json' };
import { WorkerAttemptExecutor } from '@kubeclaw/worker-core';
import { validatePipelineWorkerCoreContract, workerAttemptResultDigest, workerAttemptSpecDigest, type WorkerAttemptResultV1 } from '@kubeclaw/pipeline-worker-core-contract';
import { ContentAddressedArtifactStore } from '../storage/artifacts.ts';
import { PrismEngine, DeterministicDesignProvider } from '../engine/index.ts';
import { prismAttempt, prismRequestDigest } from '../engine/worker-envelope.ts';
import { handleInternalArtifact } from '../server/internal-artifacts.ts';
import { WorkerArtifactClient } from '../server/worker-artifacts.ts';
import { operationFor } from '../server/worker-operation.ts';
import { executeWorkerAttempt } from '../server/worker-attempt.ts';
import { hydrateWorkerResult } from '../control/worker-evidence.ts';
import { acceptedCachedResult } from '../control/worker-results.ts';

async function setup(t: { after(callback: () => Promise<void>): void }) {
  const root = await mkdtemp(join(tmpdir(), 'prism-worker-binding-'));
  const artifacts = new ContentAddressedArtifactStore(root); let contacts = 0;
  const server = createServer((request, response) => {
    contacts++;
    void handleInternalArtifact(request, response, new URL(request.url!, 'http://control'), {
      artifacts, spiffeEnabled: false, workerSecret: 'local-worker-test', trustedControlSpiffeId: '', trustedWorkerSpiffeId: '',
    }).then((handled) => { if (!handled) { response.writeHead(404); response.end(); } }).catch((error: unknown) => {
      response.writeHead(422, { 'content-type': 'application/json' }); response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((done) => server.close(() => done())); await rm(root, { recursive: true, force: true }); });
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const origin = new URL(`http://127.0.0.1:${address.port}`);
  const client = new WorkerArtifactClient(origin, 'local-worker-test', false);
  const engine = new PrismEngine(new DeterministicDesignProvider());
  async function attempt(title = 'Deployments') {
    const document = structuredClone(fixture); document.views.home.root.children[0]!.props.content = title;
    const input = await artifacts.put(Buffer.from(JSON.stringify({ document, view: 'home', state: 'default', viewport: 'wide' })));
    return JSON.parse(JSON.stringify(prismAttempt('render', { artifactId: input.artifactId, type: 'prism-engine-input', mediaType: 'application/json',
      contentDigest: input.digest, sizeBytes: input.sizeBytes, storageUrl: new URL(`/v1/internal/artifacts/${input.digest}`, origin).href }, 'test-request'))) as import('@kubeclaw/pipeline-worker-core-contract').WorkerAttemptEnvelopeV1;
  }
  return { root, artifacts, client, engine, attempt, contacts: () => contacts };
}
function changed(result: WorkerAttemptResultV1, change: (candidate: WorkerAttemptResultV1) => void): WorkerAttemptResultV1 {
  const copy = structuredClone(result); change(copy); copy.resultDigest = workerAttemptResultDigest(copy); return copy;
}

test('original worker operation reproduces missing log store; actual service executor persists the complete log', async t => {
  const f = await setup(t); const attempt = await f.attempt();
  const originalWiring = await new WorkerAttemptExecutor({ envelope: attempt,
    operation: operationFor(attempt, f.engine, f.client), receiptNamespace: 'prism-worker' }).execute();
  assert.equal(originalWiring.state, 'errored'); assert.equal(originalWiring.error?.code, 'WORKER_LOG_STORE_FAILED');
  const completed = await executeWorkerAttempt(attempt, f.engine, f.client);
  assert.equal(completed.state, 'completed', completed.error?.message);
  validatePipelineWorkerCoreContract('workerAttemptResult', completed);
  const log = completed.evidence.find((item) => item.evidenceId === 'prism-full-log')!;
  const full = Buffer.from(await f.artifacts.get(log.artifact.artifactId));
  assert.equal(full.toString('utf8'), '[system] Prism render operation started');
  assert.equal(full.byteLength, log.artifact.sizeBytes);
  assert.equal(`sha256:${createHash('sha256').update(full).digest('hex')}`, log.artifact.contentDigest);
  assert.match(String((await hydrateWorkerResult(attempt, completed, f.client)).values.html), /Deployments/u);
});

test('real durable log store corruption keeps an otherwise successful engine operation errored', async t => {
  const f = await setup(t); const attempt = await f.attempt();
  const hash = createHash('sha256').update('[system] Prism render operation started').digest('hex');
  const directory = join(f.root, hash.slice(0, 2)); await mkdir(directory, { recursive: true });
  await writeFile(join(directory, hash), 'corrupt existing log');
  const result = await executeWorkerAttempt(attempt, f.engine, f.client);
  assert.equal(result.state, 'errored'); assert.equal(result.error?.code, 'WORKER_LOG_STORE_FAILED');
  assert.match(result.error!.message, /PRISM_ARTIFACT_CORRUPT/u);
});

test('Control shared boundary rejects other real attempts and modified results before evidence I/O', async t => {
  const f = await setup(t); const expected = await f.attempt(); const other = await f.attempt('Other request');
  const first = await executeWorkerAttempt(expected, f.engine, f.client);
  const foreign = await executeWorkerAttempt(other, f.engine, f.client);
  const cases = [foreign,
    changed(first, value => { value.claimId = 'claim-other'; }),
    changed(first, value => { value.claimGeneration += 1; }),
    changed(first, value => { value.workerId = 'worker-other'; }),
    { ...first, resultDigest: `sha256:${'a'.repeat(64)}` },
    changed(first, value => { value.specialistResult!.schemaDigest = `sha256:${'b'.repeat(64)}`; }),
    changed(first, value => { value.specialistResult!.schemaId = 'wrong-schema'; }),
    changed(first, value => { delete value.specialistResult!.values.html; }),
    changed(first, value => { value.evidence[0]!.artifact.storageUrl = 'https://example.com/log'; }),
    changed(first, value => { value.evidence[0]!.artifact.storageUrl += '?other=1'; }),
    changed(first, value => { value.evidence[0]!.artifact.mediaType = 'text/html'; }),
    changed(first, value => { value.evidence = []; }),
    changed(first, value => { value.evidence.push(structuredClone(value.evidence[0]!)); }),
  ];
  const before = f.contacts();
  for (const candidate of cases) await assert.rejects(hydrateWorkerResult(expected, candidate, f.client));
  assert.equal(f.contacts(), before, 'invalid results must not fetch evidence');
  const digest = prismRequestDigest(expected.operation, expected.inputs[0]!.kind === 'artifact' ? expected.inputs[0]!.artifact.contentDigest : '');
  assert.equal(acceptedCachedResult({ attempt: expected, workerResult: first }, digest, expected.executionId).workerResult.resultDigest, first.resultDigest);
  assert.throws(() => acceptedCachedResult({ attempt: other, workerResult: foreign }, digest, other.executionId), /CACHE_REQUEST_MISMATCH/u);
  assert.throws(() => acceptedCachedResult({ attempt: expected, workerResult: first }, digest, other.executionId), /CACHE_EXECUTION_MISMATCH/u);
  assert.throws(() => acceptedCachedResult({ values: first.specialistResult!.values, evidence: first.evidence }, digest, expected.executionId), /CACHE_UNBOUND/u);
});

test('actual Control artifact handler rejects unauthenticated reads and verifies upload URL digest', async t => {
  const f = await setup(t); const attempt = await f.attempt();
  const declared = attempt.inputs[0]!; assert.equal(declared.kind, 'artifact'); if (declared.kind !== 'artifact') return;
  const response = await fetch(declared.artifact.storageUrl); assert.equal(response.status, 401); await response.body?.cancel();
  const wrong = await fetch(declared.artifact.storageUrl, { method: 'POST', headers: { authorization: 'Bearer local-worker-test' }, body: 'wrong bytes' });
  assert.equal(wrong.status, 422); assert.match(await wrong.text(), /digest does not match URL/u);
  await assert.doesNotReject(f.artifacts.get(declared.artifact.artifactId));
});

test('full log participates in the real neutral evidence budget before upload', async t => {
  const f = await setup(t); const attempt = await f.attempt();
  attempt.limits.evidenceBytes = 1; attempt.attemptSpecDigest = workerAttemptSpecDigest(attempt);
  const before = f.contacts(); const result = await executeWorkerAttempt(attempt, f.engine, f.client);
  assert.equal(result.state, 'errored'); assert.equal(result.error?.code, 'WORKER_LOG_STORE_FAILED');
  assert.match(result.error!.message, /WORKER_EVIDENCE_BYTE_LIMIT/u);
  assert.equal(f.contacts() - before, 1, 'input GET is allowed, oversized log POST is not');
});

test('CPU consumed by the actual full-log upload participates in the terminal attempt budget', async t => {
  const f = await setup(t);
  const attempt = await f.attempt();
  attempt.limits.cpuMillis = 1_000;
  attempt.attemptSpecDigest = workerAttemptSpecDigest(attempt);
  let uploadCpuMs = 0;
  class CpuConsumingArtifactClient extends WorkerArtifactClient {
    override async upload(...args: Parameters<WorkerArtifactClient['upload']>) {
      assert.equal(args[0], 'prism-full-log');
      const baseline = process.cpuUsage();
      do {
        pbkdf2Sync('attempt-owned log processing', 'local regression', 100_000, 32, 'sha256');
        const delta = process.cpuUsage(baseline);
        uploadCpuMs = (delta.user + delta.system) / 1_000;
      } while (uploadCpuMs <= 1_100);
      return super.upload(...args);
    }
  }
  const client = new CpuConsumingArtifactClient(f.client.origin, 'local-worker-test', false);
  const result = await executeWorkerAttempt(attempt, f.engine, client);
  assert(uploadCpuMs > attempt.limits.cpuMillis, 'the completion callback really exceeded the CPU budget');
  assert.equal(result.state, 'errored');
  assert.equal(result.error?.code, 'WORKER_CPU_LIMIT');
  validatePipelineWorkerCoreContract('workerAttemptResult', result);
  const log = result.evidence.find(item => item.evidenceId === 'prism-full-log');
  assert(log, 'the actual completed log upload remains available on budget failure');
  assert.equal(Buffer.from(await f.artifacts.get(log.artifact.artifactId)).toString(), '[system] Prism render operation started');
});
