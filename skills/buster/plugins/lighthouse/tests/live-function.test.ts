import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { BrowserLighthouseCapabilityInvoker } from '@kubeclaw/buster-engine';
import { provider } from '../src/provider.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lighthouse-provider-'));
for (const directory of ['repository/.swarm', 'scratch', 'evidence']) fs.mkdirSync(path.join(root, directory), { recursive: true });
const settingsPath = path.join(root, 'repository/.swarm/lighthouse-settings.json');
const validSettings = {
  schemaVersion: 'kubeclaw.lighthouse-settings.v1',
  profiles: { test: { formFactor: 'desktop', screen: { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false },
    throttling: { rttMs: 0, throughputKbps: 100000, cpuSlowdownMultiplier: 1 } } },
  budgets: {
    permissive: { minimumScore: 0, maximumLcpMs: 120000, maximumCls: 10, maximumTbtMs: 120000 },
    impossible: { maximumLcpMs: 0 },
  },
};
fs.writeFileSync(settingsPath, JSON.stringify(validSettings));
const server = http.createServer((request, response) => {
  response.setHeader('content-type', 'text/html; charset=utf-8');
  if (request.url === '/egress') {
    response.end('<!doctype html><html lang="en"><head><title>Egress</title></head><body><main><img alt="x" src="http://example.invalid/denied.png"></main></body></html>');
    return;
  }
  response.end('<!doctype html><html lang="en"><head><title>Fast page</title><meta name="viewport" content="width=device-width"></head><body><main><h1>Ready</h1><p>Real Lighthouse page.</p></main></body></html>');
});
await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const address = server.address(); if (!address || typeof address === 'string') throw new Error('LIGHTHOUSE_TEST_BIND_FAILED');
const origin = `http://127.0.0.1:${address.port}`;
const chromeExecutable = chromium.executablePath();
assert.equal(fs.existsSync(chromeExecutable), true, 'real Chromium is required');
const capability = new BrowserLighthouseCapabilityInvoker({ allowedOrigins: [origin], chromeExecutable,
  maximumRuns: 16, maximumExecutionMs: 180000, maximumResultBytes: 64 * 1024 * 1024 });
const invocation: any = { schemaVersion: 'provider-invocation.v1', planId: 'plan:lighthouse', runId: 'run:lighthouse', moduleId: 'perf', gateId: null,
  suiteInstanceId: null, nodeId: 'performance', executionId: 'plan:lighthouse:performance', testIdentity: 'test:lighthouse', nodeKind: 'test',
  attemptId: 'attempt:lighthouse', attemptNumber: 1, provider: {}, configuration: { values: { purpose: 'performance', url: origin,
    routes: ['/'], settingsFile: '.swarm/lighthouse-settings.json', profile: 'test', budget: 'permissive', runs: 3, timeoutMs: 120000 } },
  inputs: [], evidence: {}, grantedCapabilities: ['browser.lighthouse'], timeoutMs: 180000,
  limits: { cpuMillis: 180000, memoryBytes: 1024 * 1024 * 1024, logBytes: 1024 * 1024, artifactBytes: 128 * 1024 * 1024, artifactFiles: 32, processes: 64 },
  workspace: { repository: 'repository', scratch: 'scratch', evidence: 'evidence' } };
const signal = new AbortController().signal;
const context: any = { signal, workspaceRoot: root, log() {}, invoke: (name: string, request: any) => capability.invoke(name, request, signal) };
try {
  for (const invalidSettings of [
    { ...validSettings, unknown: true },
    { ...validSettings, profiles: { test: { ...validSettings.profiles.test, screen: { ...validSettings.profiles.test.screen, width: 1 } } } },
    { ...validSettings, budgets: { invalid: {} } },
    { ...validSettings, budgets: { invalid: { minimumScore: '90' } } },
  ]) {
    fs.writeFileSync(settingsPath, JSON.stringify(invalidSettings));
    await assert.rejects(() => provider().execute(invocation, context), /LIGHTHOUSE_(?:SETTINGS_FILE|PROFILE|BUDGET)_INVALID/u);
  }
  fs.writeFileSync(settingsPath, JSON.stringify(validSettings));
  const passed = await provider().execute(invocation, context);
  assert.equal(passed.outcome, 'passed');
  assert.equal(passed.evidenceFiles.length, 3);
  assert.equal(passed.evidenceFiles.filter((item: any) => item.type === 'performance-report-representative').length, 1);
  assert.equal(passed.providerDetails.values.lighthouseVersion, '13.4.1');
  const failed = await provider().execute({ ...invocation, configuration: { values: {
    ...invocation.configuration.values, budget: 'impossible', runs: 3,
  } } }, context);
  assert.equal(failed.outcome, 'failed');
  assert.equal(failed.findings.some((item: any) => item.rule === 'largest-contentful-paint'), true);
  await assert.rejects(() => provider().execute({ ...invocation, configuration: { values: {
    ...invocation.configuration.values, routes: ['/egress'], budget: 'permissive', runs: 3,
  } } }, context), /BROWSER_LIGHTHOUSE_SUBRESOURCE_ORIGIN_DENIED/u);
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(root, { recursive: true, force: true });
}
console.log(JSON.stringify({ ok: true, provider: 'lighthouse', realChrome: true, realLighthouse: true, mocks: 0, wrappers: 0 }));
