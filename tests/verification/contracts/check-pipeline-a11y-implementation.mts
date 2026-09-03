import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { buildRegistry, discoverPackages, resolveTestPlan } from '@kubeclaw/nova-core';
import { BrowserAxeCapabilityInvoker, TestPlanRunner } from '@kubeclaw/buster-engine';
const pluginRoot = path.resolve('skills/buster/plugins');
const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot], trustPolicy: {
  trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'a11y-implementation',
} }));
const entry = registry.testProviderContracts.get('kubeclaw.axe@1'); assert.ok(entry);
assert.deepEqual(entry.registration.capabilities, ['browser.axe']);
const suite = JSON.parse(fs.readFileSync('contracts/pipeline-test-gate/v1/suites/a11y.v1.json', 'utf8'));
const limits = { cpuMillis: 60_000, memoryBytes: 512 * 1024 * 1024, logBytes: 1024 * 1024, artifactBytes: 16 * 1024 * 1024, artifactFiles: 16, processes: 16 };
const server = http.createServer((_request, response) => { response.setHeader('content-type', 'text/html');
  response.end('<!doctype html><html lang="en"><head><title>A11y</title></head><body><main><button></button></main></body></html>'); });
await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const address = server.address(); if (!address || typeof address === 'string') throw new Error('A11Y_VERTICAL_BIND_FAILED');
const origin = `http://127.0.0.1:${address.port}`;
const plan = resolveTestPlan({ planId: 'plan:a11y', runId: 'run:a11y', project: 'a11y-proof', scope: { moduleId: 'a11y', gateId: null },
  createdAt: '2026-09-03T00:00:00.000Z', declaration: { suites: { a11y: { uses: 'kubeclaw.a11y-suite@1', overrides: {
    axe: { config: { url: origin, routes: ['/'], profiles: ['desktop'], acceptances: [
      { rule: 'button-name', route: '/', selector: 'button', reason: 'Vertical test acceptance record', expiresAt: '2099-12-31' },
    ] } },
  } } } }, suiteTemplates: [suite], registry, facts: { changedPaths: [], moduleType: 'service', pipelineStage: 'test' },
  policy: { defaultTimeoutMs: 30_000, maximumTimeoutMs: 120_000, defaultLimits: limits, maximumLimits: limits,
    maximumRetryCount: 1, maximumMatrixSize: 8, maximumNodes: 8, defaultConcurrencyLimit: 1, maximumConcurrencyLimits: { 'browser-axe': 4 } } });
assert.equal(plan.nodes.length, 1); assert.equal(plan.nodes[0]?.provider.contractId, 'kubeclaw.axe@1');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-vertical-'));
for (const directory of ['workspace/repository', 'artifacts', 'observability']) fs.mkdirSync(path.join(root, directory), { recursive: true });
const localBrowser = '/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell';
const capability = new BrowserAxeCapabilityInvoker({ allowedOrigins: [origin], allowedBrowsers: ['chromium'],
  ...(fs.existsSync(localBrowser) ? { browserExecutables: { chromium: localBrowser } } : {}), maximumCombinations: 4,
  maximumConcurrency: 1, maximumExecutionMs: 30_000, maximumResultBytes: 8 * 1024 * 1024,
  maximumScreenshots: 4, maximumScreenshotBytes: 4 * 1024 * 1024 });
try {
  const run = await new TestPlanRunner({ plan, registry, workspaceRoot: path.join(root, 'workspace'), repositoryRoot: path.join(root, 'workspace/repository'),
    artifactRoot: path.join(root, 'artifacts'), observabilityRoot: path.join(root, 'observability'), maximumConcurrency: 1,
    grants: new Map([['a11y/axe', ['browser.axe']]]), capabilityInvoker: capability }).run();
  assert.equal(run.nodes[0]?.outcome, 'passed', JSON.stringify(run));
  assert.equal(run.attempts[0]?.findings.some((finding) => finding.rule === 'button-name'), true);
  assert.equal(run.attempts[0]?.evidence.some((evidence) => evidence.type === 'test-report'), true);
} finally { await new Promise<void>((resolve) => server.close(() => resolve())); fs.rmSync(root, { recursive: true, force: true }); }
console.log(JSON.stringify({ ok: true, phase: 'a11y-implementation', provider: 'kubeclaw.axe@1', realIsolatedRunner: true, mocks: 0 }));
