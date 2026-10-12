import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { buildRegistry, createProductionNovaTestGate, discoverPackages, resolveTestPlan } from '@kubeclaw/nova-core';
import { BusterRemotePlanRuntime, BusterRemotePlanService, FileBusterPlanJobStore } from '@kubeclaw/buster-engine';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lighthouse-remote-vertical-'));
const repository = path.join(root, 'repository'); const token = 'lighthouse-remote-vertical-token-0001';
const keys = crypto.generateKeyPairSync('ed25519');
const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
const server = http.createServer((request, response) => {
  if (request.url === '/robots.txt') { response.setHeader('content-type', 'text/plain'); response.end('User-agent: *\nDisallow:\n'); return; }
  response.setHeader('content-type', 'text/html'); response.end('<!doctype html><html lang="en"><head><title>Remote</title><meta name="description" content="proof"></head><body><main><h1>Remote proof</h1></main></body></html>');
});
try {
  fs.mkdirSync(path.join(repository, '.swarm'), { recursive: true });
  fs.writeFileSync(path.join(repository, '.swarm/lighthouse-settings.json'), JSON.stringify({
    schemaVersion: 'kubeclaw.lighthouse-settings.v1', profiles: { test: { formFactor: 'desktop',
      screen: { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false },
      throttling: { rttMs: 0, throughputKbps: 100000, cpuSlowdownMultiplier: 1 } } }, budgets: {},
  }));
  execFileSync('git', ['-C', repository, 'init', '-q']); execFileSync('git', ['-C', repository, 'config', 'user.email', 'lighthouse@example.invalid']);
  execFileSync('git', ['-C', repository, 'config', 'user.name', 'Lighthouse Proof']); execFileSync('git', ['-C', repository, 'add', '.']);
  execFileSync('git', ['-C', repository, 'commit', '-qm', 'Lighthouse remote fixture']);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('LIGHTHOUSE_REMOTE_BIND_FAILED');
  const origin = `http://127.0.0.1:${address.port}`; const pluginRoot = path.resolve('skills/buster/plugins');
  const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot], trustPolicy: {
    trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'lighthouse-remote-vertical',
  } }));
  const limits = { cpuMillis: 180_000, memoryBytes: 1024 * 1024 * 1024, logBytes: 1024 * 1024,
    artifactBytes: 64 * 1024 * 1024, artifactFiles: 16, processes: 64 };
  const plan = resolveTestPlan({ planId: 'plan:lighthouse:remote', runId: 'run:lighthouse:remote', project: 'lighthouse-remote',
    scope: { moduleId: 'perf', gateId: null }, createdAt: '2026-09-03T00:00:00.000Z', declaration: { tests: {
      seo: { uses: 'kubeclaw.lighthouse@1', mode: 'advisory', retries: 0, concurrencyGroup: 'lighthouse', config: {
        purpose: 'seo', url: origin, routes: ['/'], settingsFile: '.swarm/lighthouse-settings.json', profile: 'test', runs: 1,
      } },
    }, concurrencyLimits: { lighthouse: 1 } }, suiteTemplates: [], registry,
    facts: { changedPaths: ['.swarm/lighthouse-settings.json'], moduleType: 'service', pipelineStage: 'test' },
    policy: { defaultTimeoutMs: 180_000, maximumTimeoutMs: 180_000, defaultLimits: limits, maximumLimits: limits,
      maximumRetryCount: 1, maximumMatrixSize: 1, maximumNodes: 2, defaultConcurrencyLimit: 1,
      maximumConcurrencyLimits: { lighthouse: 1 } } });
  const records = { maximumRecords: 100, maximumBytes: 128 * 1024 * 1024, maximumRecordBytes: 64 * 1024 * 1024 };
  const store = new FileBusterPlanJobStore(path.join(root, 'buster-state'), { recordLimits: records,
    maximumArchiveBytes: 8 * 1024 * 1024, maximumResultBytes: 64 * 1024 * 1024,
    maximumResultStoreBytes: 128 * 1024 * 1024, trustedSourceAuthority: 'nova:production', sourceAttestationPublicKey: publicKey });
  const chromeExecutable = '/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell';
  const service = new BusterRemotePlanService({ store, registry, workerRevision: 'b'.repeat(40), runtimeRoot: path.join(root, 'buster-runs'),
    tarExecutable: '/usr/bin/tar', maximumExtractedBytes: 32 * 1024 * 1024, allowedCapabilities: new Set(['browser.lighthouse']),
    browserLighthouse: { allowedOrigins: [origin], chromeExecutable, maximumRuns: 4, maximumExecutionMs: 180_000,
      maximumResultBytes: 64 * 1024 * 1024 } });
  const runtime = new BusterRemotePlanRuntime({ service, host: '127.0.0.1', port: 0, token,
    maximumRequestBytes: 16 * 1024 * 1024, maximumResponseBytes: 64 * 1024,
    maximumResultBytes: 64 * 1024 * 1024, shutdownTimeoutMs: 5_000 });
  const runtimeAddress = await runtime.start();
  try {
    const gate = createProductionNovaTestGate({ stateRoot: path.join(root, 'nova-state'), endpoint: `http://127.0.0.1:${runtimeAddress.port}`,
      token, sourceAuthority: 'nova:production', sourceAttestationPrivateKey: privateKey, pollMilliseconds: 10,
      maximumResponseBytes: 64 * 1024, maximumResultBytes: 64 * 1024 * 1024, maximumArchiveBytes: 8 * 1024 * 1024,
      maximumArchiveStoreBytes: 32 * 1024 * 1024, maximumEvidenceBytes: 64 * 1024 * 1024,
      maximumEvidenceStoreBytes: 128 * 1024 * 1024, recordLimits: records });
    const executed = await gate.execute({ idempotencyKey: 'lighthouse:remote:vertical', pipelineStageId: 'stage:lighthouse', plan,
      repositoryRoot: repository, repositoryId: 'repository:lighthouse', maximumConcurrency: 1,
      grants: new Map([['seo', ['browser.lighthouse']]]), submittedAt: '2026-09-03T00:00:00.000Z', timeoutMs: 240_000 });
    assert.equal(executed.remote.status.state, 'completed'); assert.equal(executed.remote.decision.state, 'passed');
    const reference = executed.remote.status.result!;
    const result = JSON.parse((await service.result(executed.remote.status.jobId, reference.contentDigest, reference.sizeBytes)).toString('utf8'));
    assert.equal(result.attempts[0].providerDetails.values.lighthouseVersion, '13.4.1');
    assert.equal(result.attempts[0].evidence.some((item: any) => item.type === 'performance-report'), true);
    const imports = JSON.parse(fs.readFileSync(path.join(root, 'nova-state/imports/records/store.json'), 'utf8')).records;
    assert.equal(imports.some((record: any) => record.payload?.decision?.decisionDigest === executed.remote.decision.decisionDigest), true);
  } finally { await runtime.stop(); }
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve())); fs.rmSync(root, { recursive: true, force: true });
}
console.log(JSON.stringify({ ok: true, phase: 'lighthouse-remote-vertical', authenticatedDispatch: true, evidenceImported: true, realChrome: true, realLighthouse: true, mocks: 0 }));
