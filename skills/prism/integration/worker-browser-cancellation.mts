import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { openOwnedBrowser } from '../engine/browser-capture.ts';
import { PrismEngine, DeterministicDesignProvider } from '../engine/index.ts';
import fixture from '../../../contracts/prism/v1/fixtures/minimal-web.json' with { type: 'json' };

// Native gate: absent Chromium must fail, never silently skip or replace launch.
await test('owned original Chromium closes and settles a real page load on cancellation', async t => {
  let contacted!: () => void;
  const contact = new Promise<void>(resolve => { contacted = resolve; });
  const server = createServer((_req, _res) => { contacted(); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert(address && typeof address !== 'string');
  const owner = new AbortController();
  const owned = await openOwnedBrowser(owner.signal);
  t.after(async () => { if (owned.browser.isConnected()) await owned.close(); });
  const page = await owned.browser.newPage();
  const capture = page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: 'load' });
  await Promise.race([contact, capture]);
  assert(owned.browser.isConnected());
  const rejected = assert.rejects(capture, /closed|cancel|abort/u);
  owner.abort(new Error('cancel owned browser'));
  await assert.rejects(owned.close(), /cancel owned browser/u);
  await rejected;
  assert.equal(owned.browser.isConnected(), false);
});

await test('original engine capture cancellation near launch drains before rejecting and releases ownership', async () => {
  // Establish the genuine prerequisite before the cancellation timing exercise.
  const prerequisite = await openOwnedBrowser(undefined);
  assert(prerequisite.browser.isConnected());
  await prerequisite.close();
  const engine = new PrismEngine(new DeterministicDesignProvider());
  const owner = new AbortController();
  const capture = engine.execute({ contract: 'kubeclaw.prism-design-engine@1', operation: 'render',
    input: { document: structuredClone(fixture), view: 'home', state: 'default', viewport: 'wide', capture: true },
    idempotencyKey: 'native-owner' }, { signal: owner.signal });
  const abort = setTimeout(() => owner.abort(new Error('cancel capture')), 1);
  try { await assert.rejects(capture, /cancel|closed|abort/u); }
  finally { clearTimeout(abort); }
  assert.deepEqual(engine.cacheUsage(), { inFlight: 0, completedEntries: 0, completedBytes: 0, totalEntries: 0 });
});
