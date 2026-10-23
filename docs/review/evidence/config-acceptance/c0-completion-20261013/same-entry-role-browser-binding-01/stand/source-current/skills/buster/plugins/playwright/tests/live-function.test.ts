import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserPlaywrightCapabilityInvoker } from '@kubeclaw/buster-engine';
import { provider } from '../src/provider.js';

const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
if (!browsersPath || !path.isAbsolute(browsersPath)) throw new Error('PLAYWRIGHT_TEST_BROWSER_PATH_REQUIRED');
const sourceRoot = path.resolve(import.meta.dirname, '../../../../..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-provider-'));
const repository = path.join(root, 'repository');
fs.cpSync(path.join(sourceRoot, 'skills/buster/plugins/playwright/tests/fixture'), repository, { recursive: true });
fs.mkdirSync(path.join(root, 'scratch')); fs.mkdirSync(path.join(root, 'evidence'));
let heading = 'E2E ready';
const server = http.createServer((_request, response) => { response.setHeader('content-type', 'text/html'); response.end(`<!doctype html><html><body><h1>${heading}</h1></body></html>`); });
await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const address = server.address(); if (!address || typeof address === 'string') throw new Error('PLAYWRIGHT_TEST_BIND_FAILED');
const origin = `http://127.0.0.1:${address.port}`; const executable = fs.realpathSync(path.join(sourceRoot, 'node_modules/.bin/playwright'));
let deniedOriginHits = 0; const deniedServer = http.createServer((_request, response) => { deniedOriginHits += 1; response.end('must not be reached'); });
await new Promise<void>((resolve, reject) => { deniedServer.once('error', reject); deniedServer.listen(0, '127.0.0.1', resolve); });
const deniedAddress = deniedServer.address(); if (!deniedAddress || typeof deniedAddress === 'string') throw new Error('PLAYWRIGHT_TEST_BIND_FAILED');
const deniedOrigin = `http://127.0.0.1:${deniedAddress.port}`;
const capability = new BrowserPlaywrightCapabilityInvoker({ workspaceRoot: root, allowedOrigins: [origin], playwrightExecutable: executable,
  allowedTargetPorts: [address.port],
  sandboxExecutable: fileURLToPath(import.meta.resolve('@kubeclaw/plugin-foundation/isolation/plugin-sandbox')),
  readOnlyRoots: [sourceRoot, browsersPath, '/usr', '/lib', '/lib64', '/etc/fonts', '/etc/hosts', '/etc/nsswitch.conf', '/etc/resolv.conf', '/etc/ssl', '/proc', '/sys', '/dev'],
  runtimeNodeModules: path.join(sourceRoot, 'node_modules'), browsersPath, maximumWorkers: 1, maximumExecutionMs: 120000,
  maximumOutputBytes: 4 * 1024 * 1024, maximumResultBytes: 64 * 1024 * 1024, maximumArtifactBytes: 64 * 1024 * 1024,
  maximumArtifactFiles: 32, maximumProcesses: 64, maximumMemoryBytes: 4 * 1024 * 1024 * 1024,
  maximumCpuMillis: 120000, terminationGraceMs: 5000, allowSampledResourceLimits: true });
const invocation: any = { schemaVersion: 'provider-invocation.v1', planId: 'plan:e2e', runId: 'run:e2e', moduleId: 'e2e', gateId: null,
  suiteInstanceId: null, nodeId: 'playwright', executionId: 'plan:e2e:playwright', testIdentity: 'test:playwright', nodeKind: 'test', attemptId: 'attempt:e2e', attemptNumber: 1,
  provider: {}, configuration: { values: { url: origin, projectDirectory: '.', configFile: 'playwright.config.ts', workers: 2, timeoutMs: 60000 } }, inputs: [], evidence: {},
  grantedCapabilities: ['browser.playwright'], timeoutMs: 90000, limits: { cpuMillis: 120000, memoryBytes: 4 * 1024 * 1024 * 1024, logBytes: 4 * 1024 * 1024, artifactBytes: 64 * 1024 * 1024, artifactFiles: 32, processes: 64 },
  workspace: { repository: 'repository', scratch: 'scratch', evidence: 'evidence' } };
const signal = new AbortController().signal; const context: any = { signal, workspaceRoot: root, log(_stream: string, content: string) { process.stderr.write(content); }, invoke: (name: string, request: any) => capability.invoke(name, request, signal) };
try {
  const passed = await provider().execute(invocation, context); assert.equal(passed.outcome, 'passed'); assert.deepEqual(passed.counts, { total: 3, passed: 2, failed: 0, skipped: 1 });
  assert.equal(passed.providerDetails.values.workers, 1);
  assert.deepEqual(passed.providerDetails.values.testCases.map((item: any) => ({ title: item.title, status: item.status, attempts: item.attempts })), [
    { title: 'home.spec.ts > project-owned assertion > real-chromium', status: 'passed', attempts: 1 },
    { title: 'home.spec.ts > independent test continues > real-chromium', status: 'passed', attempts: 1 },
    { title: 'home.spec.ts > project-owned skip > real-chromium', status: 'skipped', attempts: 1 },
  ]);
  assert.equal(passed.providerDetails.schemaId, 'kubeclaw.e2e-result.v1');
  assert.equal(passed.providerDetails.values.resourceEnforcement, 'sampled');
  assert.equal(passed.providerDetails.values.browserProjects.includes('real-chromium'), true); assert.equal(passed.evidenceFiles.some((item: any) => item.type === 'test-report'), true);
  fs.writeFileSync(path.join(repository, 'specs/cross-origin.spec.ts'), `import { test, expect } from '@playwright/test';\ntest('exact origin proxy',async({page})=>{const response=await page.goto(${JSON.stringify(deniedOrigin)});expect(response?.status()).toBe(403);});\n`);
  fs.writeFileSync(path.join(repository, 'cross-origin.config.ts'), `import { defineConfig } from '@playwright/test';\nexport default defineConfig({testMatch:/cross-origin\\.spec\\.ts/,projects:[{name:'real-chromium',use:{browserName:'chromium',headless:true}}]});\n`);
  const deniedResult: any = await capability.invoke('browser.playwright', { operation: 'run', resource: { type: 'network.url', canonicalId: origin }, payload: { repository: 'repository', projectDirectory: '.', configFile: 'cross-origin.config.ts', workers: 1, timeoutMs: 60000, limits: { maximumProcesses: 64, maximumMemoryBytes: 4 * 1024 * 1024 * 1024, maximumCpuMillis: 120000, maximumOutputBytes: 4 * 1024 * 1024, maximumResultBytes: 64 * 1024 * 1024, maximumArtifactBytes: 64 * 1024 * 1024, maximumArtifactFiles: 32 } } }, signal);
  assert.equal(deniedResult.exitCode, 0); assert.equal(deniedOriginHits, 0);
  fs.rmSync(path.join(repository, 'specs/cross-origin.spec.ts')); fs.rmSync(path.join(repository, 'cross-origin.config.ts'));
  heading = 'Wrong heading'; fs.rmSync(path.join(root, 'evidence'), { recursive: true, force: true }); fs.mkdirSync(path.join(root, 'evidence'));
  const failed = await provider().execute(invocation, context); assert.equal(failed.outcome, 'failed'); assert.deepEqual(failed.counts, { total: 3, passed: 1, failed: 1, skipped: 1 }); assert.equal(failed.findings.length, 1);
  const failedCase = failed.providerDetails.values.testCases.find((item: any) => item.status === 'failed');
  assert.ok(failedCase); assert.equal(failedCase.attempts, 2);
  fs.writeFileSync(path.join(repository, 'empty.config.ts'), `import { defineConfig } from '@playwright/test';\nexport default defineConfig({ testMatch: /never-match\\.spec\\.ts/, projects: [{ name: 'real-chromium', use: { browserName: 'chromium', headless: true } }] });\n`);
  await assert.rejects(() => provider().execute({ ...invocation, configuration: { values: { ...invocation.configuration.values, configFile: 'empty.config.ts' } } }, context), /PLAYWRIGHT_ZERO_TESTS/u);
  const processLimited = { ...invocation, limits: { ...invocation.limits, processes: 1 } };
  await assert.rejects(() => provider().execute(processLimited, context), /BROWSER_PLAYWRIGHT_PROCESS_LIMIT_EXCEEDED/u);
  const cancelledController = new AbortController(); const cancelled = capability.invoke('browser.playwright', { operation: 'run', resource: { type: 'network.url', canonicalId: origin }, payload: {
    repository: 'repository', projectDirectory: '.', configFile: 'playwright.config.ts', workers: 1, timeoutMs: 60000,
    limits: { maximumProcesses: 64, maximumMemoryBytes: 4 * 1024 * 1024 * 1024, maximumCpuMillis: 120000,
      maximumOutputBytes: 4 * 1024 * 1024, maximumResultBytes: 64 * 1024 * 1024,
      maximumArtifactBytes: 64 * 1024 * 1024, maximumArtifactFiles: 32 } } }, cancelledController.signal);
  setTimeout(() => cancelledController.abort(), 25); await assert.rejects(cancelled, /BROWSER_PLAYWRIGHT_CANCELLED/u);
  assert.deepEqual(fs.readdirSync(repository).filter((name) => name.startsWith('.kubeclaw-playwright-')), []);
  await assert.rejects(() => provider().execute({ ...invocation, configuration: { values: { ...invocation.configuration.values, configFile: '../escape.ts' } } }, context), /PLAYWRIGHT_CONFIG_FILE_INVALID/u);
} finally { await Promise.all([new Promise<void>((resolve) => server.close(() => resolve())), new Promise<void>((resolve) => deniedServer.close(() => resolve()))]); fs.rmSync(root, { recursive: true, force: true }); }
console.log(JSON.stringify({ ok: true, provider: 'playwright', scenarios: ['multiple-tests','failure-after-retry','independent-continuation','skip','zero-tests','process-limit','cancellation','cleanup','worker-clamp','output-capture','path-boundary','exact-origin-proxy'], realChromium: true, structuredReporter: true, mocks: 0, wrappers: 0 }));
