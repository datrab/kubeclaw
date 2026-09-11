import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { chromium } from 'playwright';
import fixture from '../../../contracts/prism/v1/fixtures/minimal-web.json' with { type: 'json' };
import { PrismEngine, DeterministicDesignProvider, type EngineResult } from '../engine/index.ts';

// This is an explicit native gate. Never skip, install, substitute, or lower its
// configured acceptance budget when prerequisites or measurements fail.
function options(args: string[]) {
  const values = new Map<string, number>();
  const allowed = new Set(['max-retained-growth-bytes', 'captures-per-window']);
  for (const arg of args) {
    const match = /^--([a-z-]+)=([0-9]+)$/u.exec(arg);
    assert(match && allowed.has(match[1]!), `Unknown or malformed argument: ${arg}`);
    assert(!values.has(match[1]!), `Duplicate argument: ${match[1]}`);
    const value = Number(match[2]);
    assert(Number.isSafeInteger(value) && value > 0, `Invalid positive integer: ${arg}`);
    values.set(match[1]!, value);
  }
  const maximumRetainedGrowthBytes = values.get('max-retained-growth-bytes');
  assert(maximumRetainedGrowthBytes !== undefined,
    'RETAINED_HEAP_BUDGET_REQUIRED: supply --max-retained-growth-bytes=<predeclared acceptance limit>');
  const capturesPerWindow = values.get('captures-per-window') ?? 32;
  assert(capturesPerWindow >= 16 && capturesPerWindow <= 1024, 'captures-per-window must be 16..1024');
  return { maximumRetainedGrowthBytes, capturesPerWindow };
}
const sha256 = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const emit = (event: Record<string, unknown>): Promise<void> => new Promise((resolve, reject) => {
  process.stdout.write(`${JSON.stringify(event)}\n`, error => { if (error) reject(error); else resolve(); });
});
const limits = Object.freeze({ maximumInFlight: 2, maximumCompletedEntries: 4, maximumCompletedBytes: 128 * 1024 });

function request(key: string) {
  const document = structuredClone(fixture);
  document.views.home.root.children[0]!.props.content = `Native capture ${key}`;
  return { contract: 'kubeclaw.prism-design-engine@1' as const, operation: 'render' as const,
    input: { document, view: 'home', state: 'default', viewport: 'wide', capture: true }, idempotencyKey: key };
}
function checkCapture(result: EngineResult, key: string) {
  assert.equal(result.operation, 'render');
  const { screenshotBase64, ariaSnapshot, renderer, html, accessibilityFindings } = result.output;
  assert.equal(typeof screenshotBase64, 'string');
  assert.equal(typeof ariaSnapshot, 'string');
  assert.equal(typeof html, 'string');
  assert(String(html).includes(`Native capture ${key}`));
  assert(String(ariaSnapshot).includes(`Native capture ${key}`));
  assert(Array.isArray(accessibilityFindings));
  const metadata = renderer as { name?: string; version?: string };
  assert.equal(metadata.name, 'chromium'); assert(metadata.version);
  const png = Buffer.from(String(screenshotBase64), 'base64');
  assert(png.length > 33, 'Original screenshot must contain PNG header and data');
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.subarray(12, 16).toString(), 'IHDR');
  assert.equal(png.readUInt32BE(16), 1440); assert(png.readUInt32BE(20) >= 1000);
  assert.equal(png.subarray(-8, -4).toString(), 'IEND');
  return { pngBytes: png.length, pngSha256: sha256(png), ariaSha256: sha256(String(ariaSnapshot)),
    serializedBytes: Buffer.byteLength(JSON.stringify(result)), chromiumVersion: metadata.version };
}
function checkCache(engine: PrismEngine) {
  const usage = engine.cacheUsage();
  assert.equal(usage.inFlight, 0);
  assert(usage.completedEntries <= limits.maximumCompletedEntries);
  assert(usage.completedBytes <= limits.maximumCompletedBytes);
  assert.equal(usage.totalEntries, usage.completedEntries);
  return usage;
}
async function capture(engine: PrismEngine, key: string) {
  const summary = checkCapture(await engine.execute(request(key)), key);
  await emit({ event: 'capture', key, ...summary, cache: checkCache(engine) });
  // Do not retain the screenshot, result object, or resolved Promise in the
  // harness: only primitive counters/hashes leave this short-lived function.
  return summary;
}
async function memory(forceGc: () => void) {
  await nextTurn(); forceGc(); await nextTurn(); forceGc(); await nextTurn();
  const sample = process.memoryUsage();
  // external already includes ArrayBuffer allocations; never double-count them.
  return { ...sample, retainedBytes: sample.heapUsed + sample.external };
}
async function sameKey(engine: PrismEngine) {
  const owner = new AbortController();
  const input = request('native-same-key');
  const first = engine.execute(input, { signal: owner.signal });
  const duplicate = engine.execute(input, { signal: owner.signal });
  assert.equal(engine.cacheUsage().inFlight, 1, 'same-key callers share one admitted operation');
  const [a, b] = await Promise.all([first, duplicate]);
  assert.equal(a, b, 'coalesced callers receive the exact same settled original result object');
  const summary = checkCapture(a, input.idempotencyKey);
  return { ...summary, cache: checkCache(engine) };
}
async function dependencyIdentity() {
  const fixtureBytes = await readFile(new URL('../../../contracts/prism/v1/fixtures/minimal-web.json', import.meta.url));
  const packageBytes = await readFile(new URL(import.meta.resolve('playwright/package.json')));
  const metadata = JSON.parse(packageBytes.toString('utf8')) as { version?: string };
  assert.equal(typeof metadata.version, 'string');
  return { fixtureSha256: sha256(fixtureBytes), playwrightVersion: metadata.version, playwrightPackageSha256: sha256(packageBytes) };
}
async function sourceIdentity() {
  const paths = ['index.ts', 'render-operation.ts', 'capture-findings.ts', 'browser-capture.ts', 'execution-cache.ts'];
  return Object.fromEntries(await Promise.all(paths.map(async name => [name,
    sha256(await readFile(new URL(`../engine/${name}`, import.meta.url)))])));
}
async function measuredWindows(engine: PrismEngine, forceGc: () => void, config: ReturnType<typeof options>) {
  const baseline = await memory(forceGc);
  await emit({ event: 'baseline', memory: baseline, cache: checkCache(engine) });
  let producedOutputBytes = 0;
  for (let window = 0; window < 3; window++) {
    for (let index = 0; index < config.capturesPerWindow; index++) {
      const summary = await capture(engine, `window-${window}-capture-${index}`);
      producedOutputBytes += summary.serializedBytes;
    }
    const sample = await memory(forceGc);
    const retainedGrowthBytes = sample.retainedBytes - baseline.retainedBytes;
    await emit({ event: 'window', window, captures: config.capturesPerWindow, producedOutputBytes,
      memory: sample, retainedGrowthBytes, maximumRetainedGrowthBytes: config.maximumRetainedGrowthBytes,
      cache: checkCache(engine) });
    assert(retainedGrowthBytes <= config.maximumRetainedGrowthBytes,
      `Retained parent memory exceeds predeclared acceptance limit after window ${window}`);
  }
  assert(producedOutputBytes > 2 * limits.maximumCompletedBytes,
    'Native workload did not exceed twice the cache byte budget; increase capture count, not the memory limit');
}
async function main() {
  const config = options(process.argv.slice(2));
  const forceGc = globalThis.gc;
  assert(typeof forceGc === 'function', 'EXPLICIT_GC_REQUIRED: run node --expose-gc');
  const executable = chromium.executablePath();
  await access(executable, constants.X_OK); // ENOENT/EACCES is a hard prerequisite failure.
  await emit({ event: 'configuration', node: process.version, executable, ...config, limits, windows: 3,
    warmupCaptures: 8, sourceSha256: await sourceIdentity(), ...await dependencyIdentity(), nativeGate: true });
  const engine = new PrismEngine(new DeterministicDesignProvider(), limits);
  await emit({ event: 'same-key', ...await sameKey(engine),
    evidence: 'one cache admission and identical settled result; no browser-launch count inferred' });
  for (let index = 0; index < 8; index++) await capture(engine, `warmup-${index}`);
  await measuredWindows(engine, () => { forceGc({ execution: 'sync' }); }, config);
  await emit({ event: 'passed', captures: 1 + 8 + 3 * config.capturesPerWindow,
    scope: 'original native capture and bounded parent retention; Control restart, child RSS and process reaping not covered' });
}
await main();
