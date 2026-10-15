import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import fixture from '../../../contracts/prism/v1/fixtures/minimal-web.json' with { type: 'json' };
import { publishedControlConfig } from './fixtures/published-config.mjs';

const credentials = { PRISM_WORKER_SECRET: 'local-engine-config', DATABASE_URL: 'postgresql://not-used' };
const contract = 'kubeclaw.prism-design-engine@1';
const prefix = 'data:image/png;base64,';
test('published engine policy crosses actual closed child assignment and governs cache plus ingest/render boundaries', async t => {
  let retained: any, measured = 0;
  for (const index of [0, 1, 2]) {
    const enginePolicy = { cache: { maximumInFlight: index === 1 ? 2 : 1, maximumCompletedEntries: index === 1 ? 2 : 1,
      maximumCompletedBytes: index === 2 ? measured - 1 : 4096 }, maximumIngestTextCharacters: index === 1 ? 5 : 3,
      maximumAssetSourceCharacters: prefix.length + (index === 1 ? 8 : 4) };
    const f = await publishedControlConfig(t, {}, {}, undefined, author => {
      const file = join(author, 'components/prism-execution.config.json');
      const value = JSON.parse(fs.readFileSync(file, 'utf8')); value.profiles.standard.settings.enginePolicy = enginePolicy;
      fs.writeFileSync(file, JSON.stringify(value));
    });
    const root = join(f.root, 'role/skills/packages/prism-engine');
    const { nativePrismCommand } = await import(pathToFileURL(join(root, 'server/native-worker-execution.ts')).href);
    const { nativePrismHostConfig } = await import(pathToFileURL(join(root, 'config/native-worker.ts')).href);
    const { PrismEngine, DeterministicDesignProvider } = await import(pathToFileURL(join(root, 'engine/index.ts')).href);
    const worker = f.loadWorkerConfig(f.workerCapture, credentials);
    const command = nativePrismCommand({ maximumInputBytes: 64 }, worker);
    const assigned = { ...command.environment, KUBECLAW_NATIVE_SCOPE: '/engine-parser-only' };
    const received = nativePrismHostConfig(assigned).enginePolicy;
    assert.deepEqual(received, enginePolicy); assert(Object.isFrozen(received.cache));
    assert.throws(() => f.loadWorkerConfig(f.workerCapture, { ...credentials, PRISM_NATIVE_ASSIGNED_ENGINE_POLICY: '{}' }), /LEGACY_OVERRIDE/);
    for (const raw of [undefined, '', '{}', 'null', JSON.stringify({ ...enginePolicy, hidden: 1 }), JSON.stringify({ ...enginePolicy, cache: { ...enginePolicy.cache, maximumInFlight: 0 } })]) {
      assert.throws(() => nativePrismHostConfig({ ...assigned, PRISM_NATIVE_ASSIGNED_ENGINE_POLICY: raw }), /ENGINE_(?:POLICY|CACHE)/);
    }
    const engine = new PrismEngine(new DeterministicDesignProvider(), received);
    const ingest = (id: string, text: string) => engine.execute({ contract, operation: 'ingest', input: { text }, idempotencyKey: id });
    const pending = Array.from({ length: received.cache.maximumInFlight }, (_, n) => ingest(`flight-${n}`, 'abc'));
    await assert.rejects(ingest('flight-excess', 'abc'), /IN_FLIGHT_LIMIT/); await Promise.all(pending);
    await ingest('one', 'abc'); await ingest('two', 'abc'); await ingest('three', 'abc');
    if (index !== 2) assert.equal(engine.cacheUsage().completedEntries, received.cache.maximumCompletedEntries);
    const exact = 'x'.repeat(received.maximumIngestTextCharacters);
    await ingest('text-exact', exact);
    await assert.rejects(ingest('text-over', exact + 'x'), /ingest text length is invalid/);
    const document = structuredClone(fixture) as import('@kubeclaw/prism-contracts-v1').PrismDocument;
    document.assets['configured-asset'] = { kind: 'image', artifact: `artifact:sha256:${'a'.repeat(64)}`, mediaType: 'image/png', role: 'illustration' };
    const render = (id: string, source: string) => engine.execute({ contract, operation: 'render', input: { document, view: 'home', state: 'default', viewport: 'wide', assetSources: { 'configured-asset': source } }, idempotencyKey: id });
    const source = prefix + 'A'.repeat(received.maximumAssetSourceCharacters - prefix.length);
    await render('render-exact', source);
    await assert.rejects(render('render-over', source + 'A'), /render asset is unavailable/);
    const byteEngine = new PrismEngine(new DeterministicDesignProvider(), received);
    await byteEngine.execute({ contract, operation: 'ingest', input: { text: 'abc' }, idempotencyKey: 'byte-test' });
    if (index === 0) { measured = byteEngine.cacheUsage().completedBytes; assert(measured > 1); retained = { worker, received }; }
    else if (index === 2) assert.equal(byteEngine.cacheUsage().completedBytes, 0, 'selected byte budget below exact result prevents retention');
    if (index > 0) assert.equal(retained.received.maximumIngestTextCharacters, 3);
  }
});
