import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { BrowserAxeCapabilityInvoker } from '@kubeclaw/buster-engine';
import { provider } from '../src/provider.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'axe-provider-'));
for (const directory of ['repository', 'scratch', 'evidence']) fs.mkdirSync(path.join(root, directory));
const server = http.createServer((request, response) => {
  response.setHeader('content-type', 'text/html; charset=utf-8');
  if (request.url === '/good') {
    response.end('<!doctype html><html lang="en"><head><title>Good</title></head><body><main><button aria-label="Save">+</button></main></body></html>');
    return;
  }
  if (request.url === '/egress') {
    response.end('<!doctype html><html lang="en"><head><title>Egress</title></head><body><main><img alt="blocked" src="http://127.0.0.1:1/denied.png"></main></body></html>');
    return;
  }
  if (request.url === '/websocket-egress') {
    response.end('<!doctype html><html lang="en"><head><title>WebSocket egress</title></head><body><main>Test</main><script>new WebSocket("ws://127.0.0.1:1/denied")</script></body></html>');
    return;
  }
  if (request.url === '/websocket-local') {
    response.end(`<!doctype html><html lang="en"><head><title>WebSocket local</title></head><body><main>Test</main><script>new WebSocket("ws://127.0.0.1:${(server.address() as any).port}/socket")</script></body></html>`);
    return;
  }
  if (request.url === '/webrtc-egress') {
    response.end('<!doctype html><html lang="en"><head><title>WebRTC blocked</title></head><body><main>Test</main><script>if (typeof RTCPeerConnection !== "undefined") { const peer = new RTCPeerConnection({iceServers:[{urls:"stun:127.0.0.1:1"}]}); peer.createDataChannel("egress"); const button = document.createElement("button"); document.body.append(button); }</script></body></html>');
    return;
  }
  if (request.url === '/popup-egress') {
    response.end('<!doctype html><html lang="en"><head><title>Popup egress</title></head><body><main>Test</main><script>window.open("http://127.0.0.1:1/denied")</script></body></html>');
    return;
  }
  if (request.url === '/redirect-egress') {
    response.statusCode = 302; response.setHeader('location', 'http://127.0.0.1:1/denied'); response.end();
    return;
  }
  if (request.url === '/redirect-local') {
    response.statusCode = 302; response.setHeader('location', '/good'); response.end();
    return;
  }
  response.end('<!doctype html><html><head><title>Bad</title></head><body><main><button></button><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="></main></body></html>');
});
await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const address = server.address(); if (!address || typeof address === 'string') throw new Error('AXE_TEST_BIND_FAILED');
const origin = `http://127.0.0.1:${address.port}`;
const localBrowser = chromium.executablePath();
const capability = new BrowserAxeCapabilityInvoker({ allowedOrigins: [origin], allowedBrowsers: ['chromium'],
  ...(fs.existsSync(localBrowser) ? { browserExecutables: { chromium: localBrowser } } : {}), maximumCombinations: 8,
  maximumConcurrency: 2, maximumExecutionMs: 30_000, maximumResultBytes: 8 * 1024 * 1024,
  maximumScreenshots: 8, maximumScreenshotBytes: 4 * 1024 * 1024 });
const invocation: any = { schemaVersion: 'provider-invocation.v1', planId: 'plan:axe', runId: 'run:axe', moduleId: 'a11y', gateId: null,
  suiteInstanceId: null, nodeId: 'axe', executionId: 'plan:axe:axe', testIdentity: 'test:axe', nodeKind: 'test',
  attemptId: 'attempt:axe', attemptNumber: 1, provider: {}, configuration: { values: { url: origin, routes: ['/good'], profiles: ['desktop'] } },
  inputs: [], evidence: {}, grantedCapabilities: ['browser.axe'], timeoutMs: 30_000,
  limits: { cpuMillis: 60_000, memoryBytes: 512 * 1024 * 1024, logBytes: 1024 * 1024, artifactBytes: 16 * 1024 * 1024, artifactFiles: 16, processes: 16 },
  workspace: { repository: 'repository', scratch: 'scratch', evidence: 'evidence' } };
const signal = new AbortController().signal;
const context: any = { signal, workspaceRoot: root, log() {}, invoke: (name: string, request: any) => capability.invoke(name, request, signal) };
try {
  const good = await provider().execute(invocation, context); assert.equal(good.outcome, 'passed');
  const bad = await provider().execute({ ...invocation, configuration: { values: { url: origin, routes: ['/bad'], profiles: ['desktop'] } } }, context);
  assert.equal(bad.outcome, 'failed'); assert.equal(bad.findings.some((finding: any) => finding.rule === 'button-name'), true);
  assert.equal(bad.evidenceFiles.some((evidence: any) => evidence.type === 'screenshot'), true);
  const acceptances = bad.findings.filter((finding: any) => String(finding.id).startsWith('axe:')).map((finding: any) => {
    const match = String(finding.message).match(/^\/bad desktop chromium [0-9]+x[0-9]+ (.+): /u); assert.ok(match);
    return { rule: finding.rule, route: '/bad', selector: match[1], reason: 'Approved temporary exception', expiresAt: '2099-12-31' };
  });
  const accepted = await provider().execute({ ...invocation, configuration: { values: { url: origin, routes: ['/bad'], profiles: ['desktop'], acceptances } } }, context);
  assert.equal(accepted.outcome, 'passed'); assert.match(accepted.findings[0].message, /Approved temporary exception/u);
  const expired = acceptances.map((acceptance: any) => ({ ...acceptance, expiresAt: '2000-01-01' }));
  const expiredResult = await provider().execute({ ...invocation,
    configuration: { values: { url: origin, routes: ['/bad'], profiles: ['desktop'], acceptances: expired } } }, context);
  assert.equal(expiredResult.outcome, 'failed');
  await assert.rejects(() => provider().execute({ ...invocation,
    configuration: { values: { url: origin, routes: ['/egress'], profiles: ['desktop'] } } }, context),
  /BROWSER_AXE_SUBRESOURCE_ORIGIN_DENIED/u);
  for (const route of ['/websocket-egress', '/popup-egress', '/redirect-egress']) {
    await assert.rejects(() => provider().execute({ ...invocation,
      configuration: { values: { url: origin, routes: [route], profiles: ['desktop'] } } }, context),
    /BROWSER_AXE_SUBRESOURCE_ORIGIN_DENIED/u);
  }
  const localRedirect = await provider().execute({ ...invocation,
    configuration: { values: { url: origin, routes: ['/redirect-local'], profiles: ['desktop'] } } }, context);
  assert.equal(localRedirect.outcome, 'passed');
  const localWebSocket = await provider().execute({ ...invocation,
    configuration: { values: { url: origin, routes: ['/websocket-local'], profiles: ['desktop'] } } }, context);
  assert.equal(localWebSocket.outcome, 'passed');
  const blockedWebRtc = await provider().execute({ ...invocation,
    configuration: { values: { url: origin, routes: ['/webrtc-egress'], profiles: ['desktop'] } } }, context);
  assert.equal(blockedWebRtc.outcome, 'passed', 'WebRTC constructors must be unavailable to scanned content');
  assert.equal(good.providerDetails.values.combinations[0].browserVersion.length > 0, true);
  assert.equal(fs.existsSync(path.join(root, 'evidence/axe-results.json')), true);
} finally { await new Promise<void>((resolve) => server.close(() => resolve())); fs.rmSync(root, { recursive: true, force: true }); }
console.log(JSON.stringify({ ok: true, provider: 'axe', realBrowser: true, realAxe: true, mocks: 0, wrappers: 0 }));
