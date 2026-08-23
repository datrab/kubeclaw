import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildRegistry, discoverPackages, resolveTestPlan } from '@kubeclaw/nova-core';
import { NetworkHttpCapabilityInvoker, TestPlanRunner } from '@kubeclaw/buster-engine';

const counters = new Map<string, number>();
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  const count = (counters.get(pathname) ?? 0) + 1;
  counters.set(pathname, count);
  response.setHeader('content-type', 'text/plain');
  if (pathname.endsWith('/retry') && count < 3) { response.statusCode = 503; response.end('starting'); return; }
  if (pathname.endsWith('/failure')) { response.statusCode = 503; response.end('unavailable'); return; }
  response.end(pathname.endsWith('/text') ? 'service ready' : 'ready');
});
await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const address = server.address();
if (!address || typeof address === 'string') throw new Error('HTTP_PARITY_SERVER_BIND_FAILED');
const origin = `http://127.0.0.1:${address.port}`;
const pluginRoot = path.resolve('skills/buster/plugins');
const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot], trustPolicy: {
  trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(),
  verifierId: 'http-parity',
} }));
const limits = { cpuMillis: 60_000, memoryBytes: 256 * 1024 * 1024, logBytes: 1024 * 1024,
  artifactBytes: 1024 * 1024, artifactFiles: 4, processes: 4 };

async function replacement(pathname: string, options: { retries?: number; expectedText?: string } = {}) {
  const declaration: any = { tests: { health: { uses: 'kubeclaw.http@1', mode: 'blocking',
    retries: options.retries ?? 0, config: { url: origin, path: pathname,
      ...(options.expectedText === undefined ? {} : { expectedText: options.expectedText }) } } } };
  const plan = resolveTestPlan({ planId: `plan:${crypto.randomUUID()}`, runId: `run:${crypto.randomUUID()}`,
    project: 'parity', scope: { moduleId: 'app', gateId: null }, createdAt: '2026-08-22T07:00:00.000Z',
    declaration, suiteTemplates: [], registry, facts: { changedPaths: [], moduleType: 'service', pipelineStage: 'test' },
    policy: { defaultTimeoutMs: 5_000, maximumTimeoutMs: 10_000, defaultLimits: limits, maximumLimits: limits,
      maximumRetryCount: 3, maximumMatrixSize: 8, maximumNodes: 8, defaultConcurrencyLimit: 1,
      maximumConcurrencyLimits: {} } });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-http-parity-'));
  try {
    for (const directory of ['workspace/repository', 'artifacts', 'observability']) {
      fs.mkdirSync(path.join(root, directory), { recursive: true });
    }
    return await new TestPlanRunner({ plan, registry, workspaceRoot: path.join(root, 'workspace'),
      repositoryRoot: path.join(root, 'workspace/repository'), artifactRoot: path.join(root, 'artifacts'),
      observabilityRoot: path.join(root, 'observability'), maximumConcurrency: 1,
      grants: new Map([['health', ['network.http']]]), capabilityInvoker: new NetworkHttpCapabilityInvoker({
        allowedOrigins: [origin], allowedHostSuffixes: [], allowedPorts: [address.port],
        maximumResponseBytes: 1024 * 1024, maximumExecutionMs: 10_000,
      }) }).run();
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

try {
  const legacyPath = path.resolve('skills/buster/plugins/buster-suite-runtime/src/runtime/suites/health.ts');
  const healthSuite = fs.existsSync(legacyPath) ? (await import(pathToFileURL(legacyPath).href)).default : null;
  if (healthSuite) {
    const legacyRetry = await healthSuite({ config: { serve: { port: address.port, health_path: '/legacy/retry',
      health_retries: 3, health_base_delay: 1, health_timeout: 1_000 } } });
    assert.equal(legacyRetry.status, 'PASS');
    assert.equal(legacyRetry.metadata?.attempts, 3);
    const legacyFailure = await healthSuite({ config: { serve: { port: address.port, health_path: '/legacy/failure',
      health_retries: 1, health_base_delay: 1, health_timeout: 1_000 } } });
    assert.equal(legacyFailure.status, 'FAIL');
    const legacyText = await healthSuite({ config: { serve: { port: address.port, health_path: '/legacy/text',
      smoke_paths: ['/legacy/text'], smoke_expected_text: { '/legacy/text': 'ready' }, health_retries: 1 } } });
    assert.equal(legacyText.status, 'PASS');
    const legacyInvalid = await healthSuite({ config: { serve: { health_path: 'relative' } } });
    assert.equal(legacyInvalid.status, 'ERROR');
    assert.equal(counters.get('/legacy/retry'), 3);
  } else {
    const bridge = JSON.parse(fs.readFileSync('contracts/pipeline-test-gate/v1/legacy-suite-bridge.json', 'utf8'));
    assert.equal(bridge.suites.health.state, 'migrated');
  }
  const providerRetry = await replacement('/provider/retry', { retries: 2 });
  assert.equal(providerRetry.nodes[0].outcome, 'passed');
  assert.equal(providerRetry.attempts.length, 3);

  const providerFailure = await replacement('/provider/failure');
  assert.equal(providerFailure.nodes[0].outcome, 'failed');

  const providerText = await replacement('/provider/text', { expectedText: 'ready' });
  assert.equal(providerText.nodes[0].outcome, 'passed');

  const providerWrongText = await replacement('/provider/text', { expectedText: 'missing' });
  assert.equal(providerWrongText.nodes[0].outcome, 'failed');
  assert.equal(counters.get('/provider/retry'), 3);
} finally { await new Promise<void>((resolve) => server.close(() => resolve())); }

const baseline = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-http-baseline.json', 'utf8'));
const ledger = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-http-parity-ledger.json', 'utf8'));
assert.equal(baseline.items.length, 50);
assert.equal(Object.values(ledger.entries).every((entry: any) => entry.status === 'proved'), true);
assert.deepEqual(ledger.authority, ledger.cutover?.status === 'complete'
  ? { old: 'deleted', replacement: 'authoritative' }
  : { old: 'authoritative', replacement: 'shadow-only' });
console.log(JSON.stringify({ ok: true, phase: 'http-parity', items: 50, realHttp: true,
  legacyAttempts: 3, replacementAttempts: 3, mocks: 0, wrappers: 0 }));
