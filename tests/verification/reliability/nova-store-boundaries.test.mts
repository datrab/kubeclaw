import assert from 'node:assert/strict';
import { test } from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import type { AdapterActivationContext } from '@kubeclaw/plugin-sdk';
import { plan, completed } from '../../fixtures/test-gate/remote-plan.mts';
import { buildCommittedSourceSnapshot } from '../../../skills/nova/core/test-gates/source-snapshot.ts';
import { createRemotePlanJob, FileNovaRemotePlanStore, HttpRemotePlanTransport } from '../../../skills/nova/core/test-gates/remote-dispatch.ts';
import { FileNovaGateImportStore, NovaRemoteGateImporter } from '../../../skills/nova/core/test-gates/remote-result-import.ts';
import { FileDurableBlobStore } from '../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts';
import { activate } from '../../../skills/nova/plugins/remote-test-gate/src/adapter.ts';

const recordLimits = { maximumRecords: 100, maximumRecordBytes: 1_000_000, maximumBytes: 10_000_000 };
const privateKey = crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
function source(root: string, revision: number) {
  const repository = path.join(root, 'repository');
  fs.mkdirSync(repository, { recursive: true });
  const git = (...args: string[]) => execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' });
  if (revision === 0) git('init', '-q');
  fs.writeFileSync(path.join(repository, 'README.md'), `Committed source ${revision}\n`);
  git('add', 'README.md');
  git('-c', 'user.name=Regression', '-c', 'user.email=regression@example.invalid', 'commit', '-qm', `source ${revision}`);
  const snapshot = buildCommittedSourceSnapshot({ repositoryRoot: repository, repositoryId: 'repository:quota',
    pipelineStageId: 'stage:quota', creatorAuthority: 'nova:quota', attestationPrivateKey: privateKey, maximumArchiveBytes: 100_000 });
  return createRemotePlanJob({ idempotencyKey: `quota:${revision}`, pipelineStageId: 'stage:quota', plan: plan('blocking', null),
    ...snapshot, grants: new Map([['test', []]]), maximumConcurrency: 1, submittedAt: '2026-08-10T03:00:00.000Z' });
}

test('SPIFFE transport and adapter agree on IPv4, bracketed IPv6 and denied remote hosts', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-loopback-'));
  try {
    for (const host of ['127.0.0.1', '[::1]', 'localhost']) {
      const endpoint = `http://${host}:8080`;
      assert.doesNotThrow(() => new HttpRemotePlanTransport({ endpoint, authentication: 'spiffe-proxy', maximumResponseBytes: 1024 }));
      const adapter = activate({ config: { endpoint, authentication: 'spiffe-proxy', stateRoot: root,
        allowedRepositoryRoots: [root], sourcePrivateKeySecret: 'test-key', sourceAuthority: 'nova:test' } } as unknown as AdapterActivationContext);
      await adapter.ready(); await adapter.shutdown();
    }
    for (const host of ['127.0.0.2', 'example.invalid', '[2001:db8::1]']) {
      const endpoint = `https://${host}:8080`;
      assert.throws(() => new HttpRemotePlanTransport({ endpoint, authentication: 'spiffe-proxy', maximumResponseBytes: 1024 }), /SPIFFE_PROXY_NOT_LOOPBACK/u);
      assert.throws(() => activate({ config: { endpoint, authentication: 'spiffe-proxy', stateRoot: root,
        allowedRepositoryRoots: [root] } } as unknown as AdapterActivationContext), /SPIFFE_PROXY_NOT_LOOPBACK/u);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('two real Git archives share a total quota while deduplicated bytes remain readable', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-archive-quota-'));
  try {
    const jobs = [source(root, 0), source(root, 1)];
    const budget = Math.max(...jobs.map(job => job.repositoryArchive.sizeBytes)) + 1;
    const storeRoot = path.join(root, 'dispatch');
    const options = { recordLimits, maximumArchiveBytes: 100_000, maximumArchiveStoreBytes: budget };
    const store = new FileNovaRemotePlanStore(storeRoot, options);
    await store.persistBeforeDispatch(jobs[0]!);
    await store.persistBeforeDispatch(jobs[0]!);
    await assert.rejects(store.persistBeforeDispatch(jobs[1]!), /DURABLE_BLOB_STORE_LIMIT_EXCEEDED/u);
    const reopened = new FileNovaRemotePlanStore(storeRoot, options);
    assert.deepEqual(await reopened.load(jobs[0]!.jobId), jobs[0]);
    await assert.rejects(reopened.load(jobs[1]!.jobId), /DURABLE_BLOB_STORE_LIMIT_EXCEEDED/u);
    assert.equal(fs.readdirSync(path.join(storeRoot, 'blobs'), { recursive: true, withFileTypes: true }).filter(item => item.isFile()).length, 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('real HTTP evidence import cannot mark a second over-quota job complete', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-evidence-quota-'));
  const bytes = [Buffer.from('first evidence bytes'), Buffer.from('other evidence bytes')];
  const jobs = [source(root, 0), source(root, 1)];
  const artifacts = bytes.map(content => ({ artifactId: 'artifact:log', type: 'log', mediaType: 'text/plain',
    contentDigest: `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`, sizeBytes: content.length, storageUrl: 'file:///buster/evidence' }));
  const results = jobs.map((job, i) => completed(job, { outcome: 'passed', artifact: artifacts[i]! }));
  const server = http.createServer((request, response) => {
    assert.equal(request.headers.authorization, `Bearer ${'x'.repeat(32)}`);
    const index = jobs.findIndex(job => request.url?.includes(encodeURIComponent(job.jobId)));
    if (index < 0) { response.writeHead(404); response.end(); return; }
    response.end(request.url?.includes('/results/') ? JSON.stringify(results[index]!.result) : bytes[index]);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const transport = new HttpRemotePlanTransport({ endpoint: `http://127.0.0.1:${address.port}`, token: 'x'.repeat(32), maximumResponseBytes: 100_000 });
    const storeRoot = path.join(root, 'imports');
    const options = { recordLimits, maximumEvidenceStoreBytes: bytes[0]!.length + 1 };
    const store = new FileNovaGateImportStore(storeRoot, options);
    const importer = new NovaRemoteGateImporter({ store, evidence: transport, results: transport, maximumEvidenceBytes: 100_000, maximumResultBytes: 100_000 });
    assert.equal((await importer.import(jobs[0]!, results[0]!.status)).state, 'passed');
    assert.equal((await importer.import(jobs[0]!, results[0]!.status)).state, 'passed');
    await assert.rejects(importer.import(jobs[1]!, results[1]!.status), /DURABLE_BLOB_STORE_LIMIT_EXCEEDED/u);
    const reopened = new FileNovaGateImportStore(storeRoot, options);
    assert.deepEqual((await reopened.readExecutionGraphs()).map(graph => graph.jobId), [jobs[0]!.jobId]);
    const blob = new FileDurableBlobStore(storeRoot, 100_000);
    assert.deepEqual(await blob.get(artifacts[0]!.contentDigest), bytes[0]);
    await assert.rejects(blob.get(artifacts[1]!.contentDigest), /DURABLE_BLOB_NOT_FOUND/u);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
