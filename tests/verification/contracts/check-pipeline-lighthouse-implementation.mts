import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { buildRegistry, discoverPackages, resolveTestPlan } from '@kubeclaw/nova-core';
import { BrowserLighthouseCapabilityInvoker, TestPlanRunner } from '@kubeclaw/buster-engine';
import { lighthouseConnectAuthority } from '../../../skills/buster/engine/test-gates/browser-lighthouse-runtime.ts';

assert.equal(lighthouseConnectAuthority(new URL('https://example.com')), 'example.com:443');
assert.equal(lighthouseConnectAuthority(new URL('https://example.com:8443')), 'example.com:8443');
assert.equal(lighthouseConnectAuthority(new URL('https://[::1]')), '[::1]:443');

const pluginRoot = path.resolve('skills/buster/plugins');
const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot], trustPolicy: {
  trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'lighthouse-implementation',
} }));
const entry = registry.testProviderContracts.get('kubeclaw.lighthouse@1');
assert.ok(entry); assert.deepEqual(entry.registration.capabilities, ['browser.lighthouse']);
const suite = JSON.parse(fs.readFileSync('contracts/pipeline-test-gate/v1/suites/perf.v1.json', 'utf8'));
assert.deepEqual(Object.keys(suite.tests).sort(), ['best-practices', 'performance', 'seo']);
assert.equal(JSON.stringify(suite).includes('accessibility'), false);
const resolverLimits = { cpuMillis: 180_000, memoryBytes: 1024 * 1024 * 1024, logBytes: 1024 * 1024,
  artifactBytes: 64 * 1024 * 1024, artifactFiles: 16, processes: 64 };
assert.throws(() => resolveTestPlan({ planId: 'plan:lighthouse:no-budget', runId: 'run:lighthouse:no-budget',
  project: 'lighthouse-proof', scope: { moduleId: 'perf', gateId: null }, createdAt: '2026-09-03T00:00:00.000Z',
  declaration: { tests: { performance: { uses: 'kubeclaw.lighthouse@1', mode: 'blocking', config: {
    purpose: 'performance', url: 'http://127.0.0.1:8080', routes: ['/'], settingsFile: '.swarm/lighthouse-settings.json', profile: 'test', runs: 3,
  } } } }, suiteTemplates: [], registry, facts: { changedPaths: [], moduleType: 'service', pipelineStage: 'test' },
  policy: { defaultTimeoutMs: 180_000, maximumTimeoutMs: 180_000, defaultLimits: resolverLimits,
    maximumLimits: resolverLimits, maximumRetryCount: 1, maximumMatrixSize: 1, maximumNodes: 4,
    defaultConcurrencyLimit: 1, maximumConcurrencyLimits: {} } }), /TEST_PLAN_LIGHTHOUSE_BUDGET_REQUIRED/u);
const advisoryWithoutBudget = resolveTestPlan({ planId: 'plan:lighthouse:advisory-no-budget', runId: 'run:lighthouse:advisory-no-budget',
  project: 'lighthouse-proof', scope: { moduleId: 'perf', gateId: null }, createdAt: '2026-09-03T00:00:00.000Z',
  declaration: { tests: { performance: { uses: 'kubeclaw.lighthouse@1', mode: 'advisory', config: {
    purpose: 'performance', url: 'http://127.0.0.1:8080', routes: ['/'], settingsFile: '.swarm/lighthouse-settings.json', profile: 'test', runs: 3,
  } } } }, suiteTemplates: [], registry, facts: { changedPaths: [], moduleType: 'service', pipelineStage: 'test' },
  policy: { defaultTimeoutMs: 180_000, maximumTimeoutMs: 180_000, defaultLimits: resolverLimits,
    maximumLimits: resolverLimits, maximumRetryCount: 1, maximumMatrixSize: 1, maximumNodes: 4,
    defaultConcurrencyLimit: 1, maximumConcurrencyLimits: {} } });
assert.equal(advisoryWithoutBudget.nodes[0]?.mode, 'advisory');
assert.match(fs.readFileSync('skills/buster/plugins/lighthouse/src/provider.js', 'utf8'), /LIGHTHOUSE_AUDIT_EXECUTION_ERROR/u);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lighthouse-vertical-'));
for (const directory of ['workspace/repository/.swarm', 'artifacts', 'observability']) fs.mkdirSync(path.join(root, directory), { recursive: true });
fs.writeFileSync(path.join(root, 'workspace/repository/.swarm/lighthouse-settings.json'), JSON.stringify({
  schemaVersion: 'kubeclaw.lighthouse-settings.v1', profiles: { test: { formFactor: 'desktop',
    screen: { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false },
    throttling: { rttMs: 0, throughputKbps: 100000, cpuSlowdownMultiplier: 1 } } }, budgets: {},
}));
const server = http.createServer((request, response) => {
  if (request.url === '/robots.txt') { response.setHeader('content-type', 'text/plain'); response.end('User-agent: *\nDisallow:\n'); return; }
  response.setHeader('content-type', 'text/html');
  response.end('<!doctype html><html lang="en"><head><title>Vertical</title><meta name="description" content="proof"></head><body><main><h1>Ready</h1></main></body></html>');
});
await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const address = server.address(); if (!address || typeof address === 'string') throw new Error('LIGHTHOUSE_VERTICAL_BIND_FAILED');
const origin = `http://127.0.0.1:${address.port}`;
const limits = resolverLimits;
const plan = resolveTestPlan({ planId: 'plan:lighthouse', runId: 'run:lighthouse', project: 'lighthouse-proof',
  scope: { moduleId: 'perf', gateId: null }, createdAt: '2026-09-03T00:00:00.000Z', declaration: { tests: {
    seo: { uses: 'kubeclaw.lighthouse@1', mode: 'blocking', retries: 0, concurrencyGroup: 'lighthouse',
      config: { purpose: 'seo', url: origin, routes: ['/'], settingsFile: '.swarm/lighthouse-settings.json', profile: 'test', runs: 1 } },
  }, concurrencyLimits: { lighthouse: 1 } }, suiteTemplates: [suite], registry,
  facts: { changedPaths: [], moduleType: 'service', pipelineStage: 'test' }, policy: { defaultTimeoutMs: 180_000,
    maximumTimeoutMs: 180_000, defaultLimits: limits, maximumLimits: limits, maximumRetryCount: 1,
    maximumMatrixSize: 1, maximumNodes: 4, defaultConcurrencyLimit: 1, maximumConcurrencyLimits: { lighthouse: 1 } } });
const chromeExecutable = '/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell';
assert.equal(fs.existsSync(chromeExecutable), true, 'real Chrome is required');
const capability = new BrowserLighthouseCapabilityInvoker({ allowedOrigins: [origin], chromeExecutable,
  maximumRuns: 4, maximumExecutionMs: 180_000, maximumResultBytes: 64 * 1024 * 1024 });
try {
  const run = await new TestPlanRunner({ plan, registry, workspaceRoot: path.join(root, 'workspace'),
    repositoryRoot: path.join(root, 'workspace/repository'), artifactRoot: path.join(root, 'artifacts'),
    observabilityRoot: path.join(root, 'observability'), maximumConcurrency: 1,
    grants: new Map([['seo', ['browser.lighthouse']]]), capabilityInvoker: capability }).run();
  assert.equal(run.nodes[0]?.outcome, 'passed', JSON.stringify(run));
  assert.equal(run.attempts[0]?.evidence.some((item) => item.type === 'performance-report'), true);
  assert.equal(run.attempts[0]?.providerDetails?.values?.lighthouseVersion, '13.4.1');
} finally { await new Promise<void>((resolve) => server.close(() => resolve())); fs.rmSync(root, { recursive: true, force: true }); }
console.log(JSON.stringify({ ok: true, phase: 'lighthouse-implementation', realChrome: true, realLighthouse: true, isolatedRunner: true, mocks: 0 }));
