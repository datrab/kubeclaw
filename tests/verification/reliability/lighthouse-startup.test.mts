import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import test from 'node:test';
import { BrowserLighthouseCapabilityInvoker } from '../../../skills/buster/engine/test-gates/browser-lighthouse-runtime.ts';

test('an actual executable startup failure preserves diagnostics and removes its Chrome profile', { timeout: 40000 }, async () => {
  const profiles = () => fs.readdirSync(os.tmpdir()).filter(name => name.startsWith('kubeclaw-lighthouse-')).sort();
  const before = profiles();
  // Deliberately misconfigure the real Node executable as Chrome. Node rejects
  // Chrome's flags; no browser result or launch function is substituted.
  const runtime = new BrowserLighthouseCapabilityInvoker({ allowedOrigins: ['http://127.0.0.1:9'],
    chromeExecutable: process.execPath, maximumRuns: 1, maximumExecutionMs: 30000, maximumResultBytes: 1048576 });
  await assert.rejects(runtime.invoke('browser.lighthouse', { operation: 'audit', resource: { type: 'network.url', canonicalId: 'http://127.0.0.1:9' },
    payload: { timeoutMs: 30000, runs: [{ route: '/', purpose: 'performance', profile: {
      name: 'startup', formFactor: 'desktop', screen: { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false },
      throttling: { rttMs: 0, throughputKbps: 100000, cpuSlowdownMultiplier: 1 },
    } }] } }, new AbortController().signal), /BROWSER_LIGHTHOUSE_LAUNCH_FAILED:[\s\S]*bad option/);
  assert.deepEqual(profiles(), before);
});
