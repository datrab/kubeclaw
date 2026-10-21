import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { BrowserVisualCapabilityInvoker } from '@kubeclaw/buster-engine';
import { provider } from '../src/provider.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-provider-')); let changed = false; let maskControlChanged = false; let deniedOrigin = '';
const repository = path.join(root, 'workspace/repository');
for (const directory of ['.swarm/visual', 'baselines', '../../artifacts', '../../observability']) fs.mkdirSync(path.resolve(repository, directory), { recursive: true });
const deniedServer = http.createServer((_request, response) => { response.end('denied-origin'); });
await new Promise<void>((resolve, reject) => { deniedServer.once('error', reject); deniedServer.listen(0, '127.0.0.1', resolve); });
const deniedAddress = deniedServer.address(); if (!deniedAddress || typeof deniedAddress === 'string') throw new Error('VISUAL_TEST_BIND_FAILED');
deniedOrigin = `http://127.0.0.1:${deniedAddress.port}`;
const server = http.createServer((request, response) => {
  response.setHeader('content-type', 'text/html');
  if (request.url === '/mask-coverage') return response.end(`<!doctype html><style>
    *{margin:0}body{background:white}div{position:absolute;top:20px;width:40px;height:40px}
    #a{left:20px;background:#ff0000}#b{left:100px;background:#00ff00}
    #control{left:180px;background:${maskControlChanged ? '#000000' : '#0000ff'}}</style>
    <div id="a"></div><div id="b"></div><div id="control"></div>`);
  if (request.url === '/egress') return response.end(`<!doctype html><img src="${deniedOrigin}/pixel.png">`);
  if (request.url === '/websocket') return response.end(`<!doctype html><script>new WebSocket('${deniedOrigin.replace('http:', 'ws:')}/socket')</script>`);
  if (request.url === '/slow') return setTimeout(() => response.end('<!doctype html><p>late</p>'), 2000);
  if (request.url === '/tall') return response.end('<!doctype html><div style="height:100000px">too tall</div>');
  if (request.url === '/noise') return response.end(`<!doctype html><style>*{margin:0}</style><canvas width="640" height="480"></canvas><script>
    const c=document.querySelector('canvas'),x=c.getContext('2d'),d=x.createImageData(640,480);for(let i=0;i<d.data.length;i+=65536)crypto.getRandomValues(d.data.subarray(i,Math.min(i+65536,d.data.length)));for(let i=3;i<d.data.length;i+=4)d.data[i]=255;x.putImageData(d,0,0)</script>`);
  response.end(`<!doctype html><html><head><title>Visual</title></head><body><main style="width:320px;height:180px;background:${changed ? '#f00' : '#fff'}"><h1>Stable</h1><p id="dynamic">${Date.now()}</p></main></body></html>`);
});
await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const address = server.address(); if (!address || typeof address === 'string') throw new Error('VISUAL_TEST_BIND_FAILED');
const origin = `http://127.0.0.1:${address.port}`;
const executable = chromium.executablePath();
assert.equal(fs.existsSync(executable), true, 'real Chromium is required');
const profile = { name: 'desktop', browser: 'chromium', viewport: { width: 640, height: 480 }, colorScheme: 'light',
  reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'UTC', deviceScaleFactor: 1 };
const capability = new BrowserVisualCapabilityInvoker({ allowedOrigins: [origin], allowedBrowsers: ['chromium'],
  browserExecutables: { chromium: executable }, maximumCombinations: 8, maximumConcurrency: 1, maximumExecutionMs: 60000,
  maximumResultBytes: 32 * 1024 * 1024, maximumScreenshotBytes: 8 * 1024 * 1024, maximumMasksPerCombination: 8 });
const controller = new AbortController();
try {
  const capture: any = await capability.invoke('browser.visual', { operation: 'capture', resource: { type: 'network.url', canonicalId: origin },
    payload: { combinations: [{ id: 'home', route: '/', profile, masks: ['#dynamic'] }], timeoutMs: 30000 } }, controller.signal);
  const baseline = Buffer.from(capture.results[0].data, 'base64'); const baselineFile = 'baselines/home.png';
  fs.writeFileSync(path.join(repository, baselineFile), baseline);
  fs.writeFileSync(path.join(repository, '.swarm/visual/profiles.json'), JSON.stringify({ schemaVersion: 'kubeclaw.browser-profiles.v1', profiles: {
    desktop: { browser: 'chromium', viewport: profile.viewport, colorScheme: 'light', reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'UTC', deviceScaleFactor: 1 },
  } }));
  const manifestPath = path.join(repository, '.swarm/visual/manifest.json');
  const manifestDocument: any = { schemaVersion: 'kubeclaw.visual-baselines.v2',
    baselineBundleDigest: `sha256:${crypto.createHash('sha256').update(`sha256:${crypto.createHash('sha256').update(baseline).digest('hex')}`).digest('hex')}`, entries: [{ id: 'home', route: '/', profile: 'desktop', baselineFile,
      sha256: `sha256:${crypto.createHash('sha256').update(baseline).digest('hex')}`, browser: 'chromium', browserVersion: capture.results[0].browserVersion, viewport: profile.viewport,
      pageConditions: { colorScheme: 'light', reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'UTC', deviceScaleFactor: 1,
        hasTouch: false, isMobile: false, fullPage: true } }] };
  const writeManifest = (value = manifestDocument) => fs.writeFileSync(manifestPath, JSON.stringify(value)); writeManifest();
  const limits = { cpuMillis: 120000, memoryBytes: 1024 * 1024 * 1024, logBytes: 1024 * 1024,
    artifactBytes: 64 * 1024 * 1024, artifactFiles: 32, processes: 64 };
  const invocation: any = { schemaVersion: 'provider-invocation.v1', planId: 'plan:visual', runId: 'run:visual', moduleId: 'visual',
    gateId: null, suiteInstanceId: null, nodeId: 'visual', executionId: 'plan:visual:visual', testIdentity: 'test:visual',
    nodeKind: 'test', attemptId: 'attempt:visual', attemptNumber: 1, provider: {}, configuration: { values: { url: origin,
      manifestFile: '.swarm/visual/manifest.json', profileFile: '.swarm/visual/profiles.json', targets: ['home'],
      comparisonProfile: 'strict-v1', masks: [{ target: 'home', selectors: ['#dynamic'] }], timeoutMs: 30000 } }, inputs: [],
    evidence: {}, grantedCapabilities: ['browser.visual'], timeoutMs: 120000, limits,
    workspace: { repository: 'repository', scratch: 'scratch', evidence: 'evidence' } };
  fs.mkdirSync(path.join(root, 'workspace/scratch'), { recursive: true }); fs.mkdirSync(path.join(root, 'workspace/evidence'), { recursive: true });
  const context: any = { signal: controller.signal, workspaceRoot: path.join(root, 'workspace'), log() {},
    invoke: (name: string, request: any) => capability.invoke(name, request, controller.signal) };
  const passed = await provider().execute(invocation, context); assert.equal(passed.outcome, 'passed', JSON.stringify(passed));
  assert.equal(passed.evidenceFiles.filter((item: any) => item.type.startsWith('visual-')).length, 3);
  await assert.rejects(() => provider().execute({ ...invocation, limits: { ...limits, artifactFiles: 3 } }, context),
    /VISUAL_EVIDENCE_FILE_LIMIT_EXCEEDED/);
  await assert.rejects(() => provider().execute({ ...invocation, limits: { ...limits, artifactBytes: baseline.byteLength + 128 } }, context),
    /VISUAL_EVIDENCE_BYTES_EXCEEDED/);
  changed = true; const failed = await provider().execute(invocation, context); assert.equal(failed.outcome, 'failed', JSON.stringify(failed));
  assert.equal(failed.findings.some((item: any) => item.rule === 'visual-difference'), true);
  const uncertain = await provider().execute({ ...invocation, configuration: { values: { ...invocation.configuration.values,
    comparisonProfile: 'balanced-v1', overrides: { maximumDifferencePercent: 0, uncertaintyMarginPercent: 100 } } } }, context);
  assert.equal(uncertain.outcome, 'failed'); assert.equal(uncertain.findings[0]?.rule, 'visual-difference-uncertain');
  await assert.rejects(() => provider().execute({ ...invocation, configuration: { values: { ...invocation.configuration.values,
    comparisonProfile: 'unreviewed-profile' } } }, context), /VISUAL_COMPARISON_PROFILE_INVALID/);
  changed = false;

  const originalManifest = JSON.parse(JSON.stringify(manifestDocument));
  writeManifest({ ...originalManifest, entries: [{ ...originalManifest.entries[0], browserVersion: '0.0.0-obsolete' }] });
  await assert.rejects(() => provider().execute(invocation, context), /VISUAL_BASELINE_BROWSER_VERSION_MISMATCH/);
  writeManifest();
  const renewed = await provider().execute(invocation, context);
  assert.equal(renewed.outcome, 'passed');
  assert.equal(renewed.providerDetails.values.results[0].baselineBrowserVersion, capture.results[0].browserVersion);
  assert.equal(renewed.providerDetails.values.results[0].browserVersion, capture.results[0].browserVersion);
  writeManifest({ ...originalManifest, entries: [{ ...originalManifest.entries[0], sha256: `sha256:${'0'.repeat(64)}` }] });
  await assert.rejects(() => provider().execute(invocation, context), /VISUAL_BASELINE_DIGEST_MISMATCH/);
  writeManifest({ ...originalManifest, entries: [{ ...originalManifest.entries[0], browser: 'firefox' }] });
  await assert.rejects(() => provider().execute(invocation, context), /VISUAL_BASELINE_IDENTITY_MISMATCH/);
  writeManifest({ ...originalManifest, entries: [{ ...originalManifest.entries[0], baselineFile: '../outside.png' }] });
  await assert.rejects(() => provider().execute(invocation, context), /VISUAL_BASELINE_FILE_DENIED/);
  writeManifest();

  const second = { ...originalManifest.entries[0], id: 'about' };
  const twoEntries = { ...originalManifest, entries: [originalManifest.entries[0], second],
    baselineBundleDigest: `sha256:${crypto.createHash('sha256').update([originalManifest.entries[0].sha256, second.sha256].sort().join('\n')).digest('hex')}` };
  writeManifest(twoEntries); const multiple = await provider().execute({ ...invocation, configuration: { values: {
    ...invocation.configuration.values, targets: ['home', 'about'], masks: [{ target: 'home', selectors: ['#dynamic'] },
      { target: 'about', selectors: ['#dynamic'] }] } } }, context);
  assert.equal(multiple.counts.total, 2); writeManifest();

  // RT-086164702f20b582-BROWSER04-ALTERNATE: scoped real-render witness.
  // Local provider/capability execution is NOT Nova/Buster isolated-plan admission.
  // Use actual Chromium bytes/version, one immutable captured baseline and A/B/A.
  const maskCapture: any = await capability.invoke('browser.visual', { operation: 'capture',
    resource: { type: 'network.url', canonicalId: origin }, payload: {
      combinations: [{ id: 'target-a', route: '/mask-coverage', profile, masks: ['#a'] }], timeoutMs: 30000,
    } }, controller.signal);
  const maskBaseline = Buffer.from(maskCapture.results[0].data, 'base64');
  const maskBaselineFile = 'baselines/mask-coverage.png';
  fs.writeFileSync(path.join(repository, maskBaselineFile), maskBaseline);
  const maskDigest = `sha256:${crypto.createHash('sha256').update(maskBaseline).digest('hex')}`;
  const maskManifest = { ...originalManifest,
    baselineBundleDigest: `sha256:${crypto.createHash('sha256').update(maskDigest).digest('hex')}`,
    entries: [{ ...originalManifest.entries[0], id: 'target-a', route: '/mask-coverage',
      baselineFile: maskBaselineFile, sha256: maskDigest, browserVersion: maskCapture.results[0].browserVersion }] };
  writeManifest(maskManifest);
  const maskInvocation = (target: string, selectors: string[]) => ({ ...invocation,
    configuration: { values: { ...invocation.configuration.values, targets: ['target-a'],
      masks: [{ target, selectors }] } } });
  const pixel = (bytes: Buffer, x: number, y: number) => {
    const png = PNG.sync.read(bytes); const offset = (y * png.width + x) * 4;
    return [...png.data.subarray(offset, offset + 4)];
  };
  const maskA = [255, 0, 255, 255], red = [255, 0, 0, 255], green = [0, 255, 0, 255], blue = [0, 0, 255, 255];
  assert.deepEqual(pixel(maskBaseline, 40, 40), maskA);
  assert.deepEqual(pixel(maskBaseline, 120, 40), green);
  assert.deepEqual(pixel(maskBaseline, 200, 40), blue);
  for (const selector of ['#a', '#b', '#a']) {
    const result = await provider().execute(maskInvocation('target-a', [selector]), context);
    assert.equal(result.outcome, selector === '#a' ? 'passed' : 'failed');
    const details = result.providerDetails.values.results[0];
    assert.equal(details.id, 'target-a'); assert.deepEqual(details.masks, [selector]);
    assert.equal(details.baselineDigest, maskDigest);
    assert.equal(details.browserVersion, maskCapture.results[0].browserVersion);
    assert.equal(details.baselineBrowserVersion, maskCapture.results[0].browserVersion);
    const currentFile = result.evidenceFiles.find((item: any) => item.type === 'visual-current');
    assert(currentFile && typeof currentFile.file === 'string');
    const currentBytes = fs.readFileSync(path.join(root, 'workspace/evidence', currentFile.file));
    assert.equal(`sha256:${crypto.createHash('sha256').update(currentBytes).digest('hex')}`, details.currentDigest);
    assert.deepEqual(pixel(currentBytes, 40, 40), selector === '#a' ? maskA : red);
    assert.deepEqual(pixel(currentBytes, 120, 40), selector === '#b' ? maskA : green);
    assert.deepEqual(pixel(currentBytes, 200, 40), blue, 'mask selection must not hide the unmasked control');
    if (selector === '#a') assert.equal(details.diffCount, 0);
    else assert(details.diffCount > 0, 'moving the mask must change real PNG coverage, not only metadata');
  }
  const unmasked = await provider().execute(maskInvocation('target-a', []), context);
  assert.equal(unmasked.outcome, 'failed', 'dropping the mask must expose the original DOM');
  maskControlChanged = true;
  const controlChanged = await provider().execute(maskInvocation('target-a', ['#a']), context);
  assert.equal(controlChanged.outcome, 'failed', 'A must still detect changes outside its mask');
  maskControlChanged = false;
  await assert.rejects(() => provider().execute(maskInvocation('unknown', ['#a']), context), /VISUAL_MASK_INVALID/);
  const restoredMaskA = await provider().execute(maskInvocation('target-a', ['#a']), context);
  assert.equal(restoredMaskA.outcome, 'passed', 'negative control must not poison restored A');
  assert.deepEqual(fs.readFileSync(path.join(repository, maskBaselineFile)), maskBaseline,
    'A/B/A, unmasked and negative controls must not mutate the real captured baseline');
  writeManifest();

  const direct = (route: string, signal = controller.signal) => capability.invoke('browser.visual', { operation: 'capture',
    resource: { type: 'network.url', canonicalId: origin }, payload: { combinations: [{ id: 'denied', route, profile, masks: [] }], timeoutMs: 30000 } }, signal);
  await assert.rejects(() => direct('/egress'), /BROWSER_VISUAL_SUBRESOURCE_ORIGIN_DENIED/);
  await assert.rejects(() => direct('/websocket'), /BROWSER_VISUAL_SUBRESOURCE_ORIGIN_DENIED/);
  await assert.rejects(() => direct('/tall'), /BROWSER_VISUAL_DECODED_IMAGE_LIMIT_EXCEEDED/);
  await assert.rejects(() => capability.invoke('browser.visual', { operation: 'capture', resource: { type: 'network.url', canonicalId: origin },
    payload: { combinations: [{ id: 'slow', route: '/slow', profile, masks: [] }], timeoutMs: 1000 } }, controller.signal),
  /BROWSER_VISUAL_TIMEOUT_EXCEEDED/);
  const aborted = new AbortController(); aborted.abort(); await assert.rejects(() => direct('/', aborted.signal), /BROWSER_VISUAL_CANCELLED/);
  await assert.rejects(() => capability.invoke('browser.visual', { operation: 'capture', resource: { type: 'network.url', canonicalId: origin },
    payload: { combinations: Array.from({ length: 9 }, (_, index) => ({ id: `limit-${index}`, route: '/', profile, masks: [] })), timeoutMs: 30000 } }, controller.signal),
  /BROWSER_VISUAL_COMBINATION_LIMIT_EXCEEDED/);
  const resultBoundCapability = new BrowserVisualCapabilityInvoker({ allowedOrigins: [origin], allowedBrowsers: ['chromium'],
    browserExecutables: { chromium: executable }, maximumCombinations: 2, maximumConcurrency: 1, maximumExecutionMs: 30000,
    maximumResultBytes: 1_300_000, maximumScreenshotBytes: 8 * 1024 * 1024, maximumMasksPerCombination: 1 });
  await assert.rejects(() => resultBoundCapability.invoke('browser.visual', { operation: 'capture',
    resource: { type: 'network.url', canonicalId: origin }, payload: {
      combinations: [{ id: 'result-limit-1', route: '/noise', profile, masks: [] },
        { id: 'result-limit-2', route: '/noise', profile, masks: [] }], timeoutMs: 30000,
    } }, controller.signal), /BROWSER_VISUAL_RESULT_BYTES_EXCEEDED/);
  await assert.rejects(() => capability.invoke('browser.visual', { operation: 'compare', resource: { type: 'visual.comparison', canonicalId: 'pixelmatch-v1' },
    payload: { baseline: '%%%%', current: baseline.toString('base64'), pixelThreshold: 0.1 } }, controller.signal), /BROWSER_VISUAL_COMPARE_INVALID/);
  const oversizedPng = Buffer.from(baseline); oversizedPng.writeUInt32BE(16384, 16); oversizedPng.writeUInt32BE(16384, 20);
  await assert.rejects(() => capability.invoke('browser.visual', { operation: 'compare', resource: { type: 'visual.comparison', canonicalId: 'pixelmatch-v1' },
    payload: { baseline: oversizedPng.toString('base64'), current: baseline.toString('base64'), pixelThreshold: 0.1 } }, controller.signal),
  /BROWSER_VISUAL_DECODED_IMAGE_LIMIT_EXCEEDED/);
  const narrow = new PNG({ width: 4, height: 8 }); narrow.data.fill(255); const narrowBytes = PNG.sync.write(narrow);
  const dimensionDifference: any = await capability.invoke('browser.visual', { operation: 'compare',
    resource: { type: 'visual.comparison', canonicalId: 'pixelmatch-v1' }, payload: {
      baseline: baseline.toString('base64'), current: narrowBytes.toString('base64'), pixelThreshold: 0.1,
    } }, controller.signal);
  assert.equal(dimensionDifference.diffPercent, 100);
  assert.notEqual(dimensionDifference.difference, narrowBytes.toString('base64'));
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(repository, baselineFile))).digest('hex'),
    crypto.createHash('sha256').update(baseline).digest('hex'), 'test execution must not change baselines');
} finally {
  await Promise.all([new Promise<void>((resolve) => server.close(() => resolve())),
    new Promise<void>((resolve) => deniedServer.close(() => resolve()))]); fs.rmSync(root, { recursive: true, force: true });
}
console.log(JSON.stringify({ ok: true, provider: 'visual', realBrowser: true, realPngComparison: true, mocks: 0, wrappers: 0 }));
