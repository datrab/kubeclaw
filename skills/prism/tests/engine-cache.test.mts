import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import fixture from '../../../contracts/prism/v1/fixtures/minimal-web.json' with { type: 'json' };
import { PrismEngine, DeterministicDesignProvider } from '../engine/index.ts';
import { ContentAddressedArtifactStore } from '../storage/artifacts.ts';

const limits = { maximumInFlight: 2, maximumCompletedEntries: 3, maximumCompletedBytes: 100_000 };
const render = (key: string, text = 'Retained render') => {
  const document = structuredClone(fixture);
  document.views.home.root.children[0]!.props.content = text;
  return { contract: 'kubeclaw.prism-design-engine@1' as const, operation: 'render' as const,
    input: { document, view: 'home', state: 'default', viewport: 'wide' }, idempotencyKey: key };
};

test('many original renders bound retained entries and bytes without changing returned output', async () => {
  const engine = new PrismEngine(new DeterministicDesignProvider(), limits);
  for (let index = 0; index < 100; index++) {
    const result = await engine.execute(render(`render:${index}`, `Actual render ${index}`));
    assert.match(String(result.output.html), new RegExp(`Actual render ${index}`));
    const usage = engine.cacheUsage();
    assert.equal(usage.inFlight, 0);
    assert(usage.completedEntries <= limits.maximumCompletedEntries);
    assert(usage.completedBytes <= limits.maximumCompletedBytes);
    assert.equal(usage.totalEntries, usage.completedEntries);
  }
});

test('byte pressure and oversized successful renders do not retain their large payloads', async () => {
  const engine = new PrismEngine(new DeterministicDesignProvider(), { ...limits, maximumCompletedBytes: 1024 });
  const result = await engine.execute(render('oversized', 'Long render '.repeat(1000)));
  assert(String(result.output.html).length > 1024);
  assert.deepEqual(engine.cacheUsage(), { inFlight: 0, completedEntries: 0, completedBytes: 0, totalEntries: 0 });
});

test('accumulated render bytes evict completed entries before the count ceiling', async () => {
  const measured = new PrismEngine(new DeterministicDesignProvider(), limits);
  await measured.execute(render('sizing'));
  const budget = measured.cacheUsage().completedBytes + 128;
  const engine = new PrismEngine(new DeterministicDesignProvider(), { ...limits, maximumCompletedEntries: 100, maximumCompletedBytes: budget });
  for (let index = 0; index < 10; index++) {
    await engine.execute(render(`size:${index}`));
    assert.equal(engine.cacheUsage().completedEntries, 1);
    assert(engine.cacheUsage().completedBytes <= budget);
  }
});

test('active duplicates share one original operation and admission never evicts active ownership', async () => {
  const engine = new PrismEngine(new DeterministicDesignProvider(), limits);
  const first = engine.execute(render('first'));
  const same = engine.execute(render('first'));
  assert.equal(engine.cacheUsage().inFlight, 1);
  const second = engine.execute(render('second'));
  await assert.rejects(engine.execute(render('third')), /PRISM_ENGINE_IN_FLIGHT_LIMIT/u);
  await assert.rejects(engine.execute(render('first', 'conflict')), /different request/u);
  assert.equal(await first, await same);
  await second;
  assert.equal(engine.cacheUsage().inFlight, 0);
  await engine.execute(render('third'));
});

test('retained replay snapshots cannot be enlarged or corrupted through caller mutation', async () => {
  const engine = new PrismEngine(new DeterministicDesignProvider(), limits);
  const request = render('snapshot');
  const original = await engine.execute(request);
  const html = original.output.html;
  original.output.html = 'mutated caller output';
  const replay = await engine.execute(request);
  assert.equal(replay.output.html, html);
  replay.output.html = 'mutated replay';
  assert.equal((await engine.execute(request)).output.html, html);
  await assert.rejects(engine.execute(render('snapshot', 'conflict')), /different request/u);
});

test('failure releases admission and invalid cache limits cannot disable its bounds', async () => {
  const engine = new PrismEngine(new DeterministicDesignProvider(), limits);
  await assert.rejects(engine.execute({ ...render('bad'), input: {} }), /missing Prism input/u);
  assert.deepEqual(engine.cacheUsage(), { inFlight: 0, completedEntries: 0, completedBytes: 0, totalEntries: 0 });
  await engine.execute(render('bad'));
  assert.throws(() => new PrismEngine(new DeterministicDesignProvider(), { ...limits, maximumInFlight: 0 }), /CACHE_LIMIT_INVALID/u);
  assert.throws(() => new PrismEngine(new DeterministicDesignProvider(), {} as typeof limits), /CACHE_LIMIT_INVALID/u);
});

test('real render evidence survives RAM eviction and artifact-store reconstruction', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'prism-engine-cache-'));
  try {
    const engine = new PrismEngine(new DeterministicDesignProvider(), { ...limits, maximumCompletedEntries: 1 });
    const first = await engine.execute(render('evidence', 'Persisted evidence'));
    const bytes = Buffer.from(String(first.output.html));
    const stored = await new ContentAddressedArtifactStore(root).put(bytes);
    await engine.execute(render('evict-evidence'));
    assert.equal(engine.cacheUsage().completedEntries, 1);
    const reopened = new ContentAddressedArtifactStore(root);
    assert.deepEqual(Buffer.from(await reopened.get(stored.artifactId)), bytes);
    assert.match(stored.digest, /^sha256:[a-f0-9]{64}$/u);
    const restarted = new PrismEngine(new DeterministicDesignProvider(), limits);
    assert.equal(restarted.cacheUsage().completedBytes, 0);
    assert.deepEqual(Buffer.from(await reopened.get(stored.artifactId)), bytes);
  } finally { await rm(root, { recursive: true, force: true }); }
});


test('deferred original rendering uses the request snapshot bound to its fingerprint', async () => {
  const engine = new PrismEngine(new DeterministicDesignProvider(), limits);
  const request = render('input-snapshot', 'Original bound text');
  const untouched = structuredClone(request);
  const pending = engine.execute(request);
  request.input.document.views.home.root.children[0]!.props.content = 'Mutated nested text';
  request.idempotencyKey = 'mutated-key';
  const result = await pending;
  assert.match(String(result.output.html), /Original bound text/u);
  assert.doesNotMatch(String(result.output.html), /Mutated nested text/u);
  assert.equal((await engine.execute(untouched)).output.html, result.output.html);
  await assert.rejects(engine.execute(render('input-snapshot', 'Mutated nested text')), /different request/u);
  assert.equal(engine.cacheUsage().completedEntries, 1);
});
