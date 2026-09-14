import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import fixture from '../../../contracts/prism/v1/fixtures/minimal-web.json' with { type: 'json' };
import { validatePipelineWorkerCoreContract, workerAttemptResultDigest, workerAttemptSpecDigest, type WorkerAttemptResultV1 } from '@kubeclaw/pipeline-worker-core-contract';
import { ContentAddressedArtifactStore } from '../storage/artifacts.ts';
import { PrismEngine, DeterministicDesignProvider } from '../engine/index.ts';
import { prismNativeAttempt, prismRequestDigest } from '../engine/worker-envelope.ts';
import { handleInternalArtifact } from '../server/internal-artifacts.ts';
import { WorkerArtifactClient } from '../server/worker-artifacts.ts';
import { PrismWorkerOperation } from '../server/worker-operation.ts';
import historical from './fixtures/historical-worker-v1.json' with { type: 'json' };
import type { WorkerAttemptEnvelopeV1 } from '@kubeclaw/pipeline-worker-core-contract';
import { hydrateWorkerResult } from '../control/worker-evidence.ts';
import { acceptedCachedResult } from '../control/worker-results.ts';

async function setup(t: { after(callback: () => Promise<void>): void }, port = 0) {
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
  server.listen(port, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((done) => server.close(() => done())); await rm(root, { recursive: true, force: true }); });
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const origin = new URL(`http://127.0.0.1:${address.port}`);
  const client = new WorkerArtifactClient(origin, 'local-worker-test', false);
  const engine = new PrismEngine(new DeterministicDesignProvider());
  async function attempt(title = 'Deployments') {
    const document = structuredClone(fixture); document.views.home.root.children[0]!.props.content = title;
    const input = await artifacts.put(Buffer.from(JSON.stringify({ document, view: 'home', state: 'default', viewport: 'wide' })));
    return JSON.parse(JSON.stringify(prismNativeAttempt('render', { artifactId: input.artifactId, type: 'prism-engine-input', mediaType: 'application/json',
      contentDigest: input.digest, sizeBytes: input.sizeBytes, storageUrl: new URL(`/v1/internal/artifacts/${input.digest}`, origin).href }, 'test-request'))) as import('@kubeclaw/pipeline-worker-core-contract').WorkerAttemptEnvelopeV3;
  }
  return { root, artifacts, client, engine, attempt, contacts: () => contacts };
}
function changed(result: WorkerAttemptResultV1, change: (candidate: WorkerAttemptResultV1) => void): WorkerAttemptResultV1 {
  const copy = structuredClone(result); change(copy); copy.resultDigest = workerAttemptResultDigest(copy); return copy;
}

test('current specialist renders through the original authenticated artifact service', async t => {
  const f = await setup(t); const envelope = await f.attempt();
  const operation = new PrismWorkerOperation(envelope, f.engine, f.client);
  const logs: string[] = [];
  operation.prepare(envelope.limits);
  try {
    const result = await operation.execute({ signal: new AbortController().signal, log: (stream, text) => logs.push(`[${stream}] ${text}`) });
    assert.match(String(result.specialistResult!.values.html), /Deployments/u);
    assert.deepEqual(logs, ['[system] Prism render operation started']);
    const stored = await f.client.upload('prism-full-log', 'log', 'text/plain', Buffer.from(logs.join('\n')), new AbortController().signal);
    assert.equal(Buffer.from(await f.artifacts.get(stored.artifact.artifactId)).toString(), logs.join('\n'));
    assert.throws(() => operation.prepare(envelope.limits), /prepared again/u);
    assert.throws(() => operation.execute({ signal: new AbortController().signal, log() {} }), /already started/u);
  } finally { await operation.terminate(); }
});

test('original artifact service rejects actual full-log storage corruption', async t => {
  const f = await setup(t);
  const content = Buffer.from('[system] Prism render operation started');
  const hash = createHash('sha256').update(content).digest('hex');
  const directory = join(f.root, hash.slice(0, 2)); await mkdir(directory, { recursive: true });
  await writeFile(join(directory, hash), 'corrupt existing log');
  await assert.rejects(f.client.upload('prism-full-log', 'log', 'text/plain', content, new AbortController().signal), /PRISM_ARTIFACT_CORRUPT/u);
});

function retained(index: number) {
  const record = historical.receipts[index]!;
  return { attempt: record.attempt as WorkerAttemptEnvelopeV1, workerResult: record.workerResult as WorkerAttemptResultV1 };
}

test('captured historical receipts and evidence retain their original validated digests', () => {
  for (const [index, record] of historical.receipts.entries()) {
    const receipt = retained(index);
    validatePipelineWorkerCoreContract('workerAttemptEnvelope', receipt.attempt);
    validatePipelineWorkerCoreContract('workerAttemptResult', receipt.workerResult);
    assert.equal(workerAttemptSpecDigest(receipt.attempt), receipt.attempt.attemptSpecDigest);
    assert.equal(workerAttemptResultDigest(receipt.workerResult), receipt.workerResult.resultDigest);
    for (const item of receipt.workerResult.evidence) {
      const bytes = Buffer.from(record.evidence.find(value => value.artifactId === item.artifact.artifactId)!.base64, 'base64');
      assert.equal(bytes.byteLength, item.artifact.sizeBytes);
      assert.equal(`sha256:${createHash('sha256').update(bytes).digest('hex')}`, item.artifact.contentDigest);
    }
  }
});

test('Control shared boundary rejects other real attempts and modified results before evidence I/O', async t => {
  const { attempt: expected, workerResult: first } = retained(0);
  const f = await setup(t, Number(new URL(first.evidence[0]!.artifact.storageUrl).port));
  for (const evidence of historical.receipts[0]!.evidence) await f.artifacts.put(Buffer.from(evidence.base64, 'base64'));
  assert.match(String((await hydrateWorkerResult(expected, first, f.client)).values.html), /Deployments/u);
  const { attempt: other, workerResult: foreign } = retained(1);
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

test('historical real receipts remain readable and cannot be reinterpreted as native task receipts', async t => {
  const f = await setup(t);
  const { attempt: legacy, workerResult: result } = retained(0);
  assert.equal(result.state, 'completed', result.error?.message);
  const input = legacy.inputs[0]!;
  assert.equal(input.kind, 'artifact');
  if (input.kind !== 'artifact') throw new Error('test input must be the original retained artifact');
  const native = prismNativeAttempt('render', input.artifact, 'version-boundary');
  const before = f.contacts();
  await assert.rejects(hydrateWorkerResult(native, result, f.client));
  assert.equal(f.contacts(), before, 'a version mismatch must fail before artifact I/O');
  const requestDigest = prismRequestDigest(legacy.operation, input.artifact.contentDigest);
  const reopened = acceptedCachedResult(JSON.parse(JSON.stringify({ attempt: legacy, workerResult: result })), requestDigest, legacy.executionId);
  assert.equal(reopened.workerResult.schemaVersion, 'worker-attempt-result.v1');
  assert.equal(reopened.workerResult.resultDigest, result.resultDigest);
  assert.deepEqual(reopened.workerResult.resources, result.resources);
});

test('actual Control artifact handler rejects unauthenticated reads and verifies upload URL digest', async t => {
  const f = await setup(t); const attempt = await f.attempt();
  const declared = attempt.inputs[0]!; assert.equal(declared.kind, 'artifact'); if (declared.kind !== 'artifact') return;
  const response = await fetch(declared.artifact.storageUrl); assert.equal(response.status, 401); await response.body?.cancel();
  const wrong = await fetch(declared.artifact.storageUrl, { method: 'POST', headers: { authorization: 'Bearer local-worker-test' }, body: 'wrong bytes' });
  assert.equal(wrong.status, 422); assert.match(await wrong.text(), /digest does not match URL/u);
  await assert.doesNotReject(f.artifacts.get(declared.artifact.artifactId));
});

