import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import fixture from '../../../contracts/prism/v1/fixtures/minimal-web.json' with { type: 'json' };
import { PrismEngine, DeterministicDesignProvider } from '../engine/index.ts';
import { ContentAddressedArtifactStore } from '../storage/artifacts.ts';

// Explicit native gate: missing Chromium is a failure, never a simulated capture.
await test('original Chromium captures stay within the RAM cache budget while durable evidence survives', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'prism-capture-cache-'));
  try {
    const limits = { maximumInFlight: 2, maximumCompletedEntries: 2, maximumCompletedBytes: 128 * 1024 };
    const engine = new PrismEngine(new DeterministicDesignProvider(), limits);
    const artifacts = new ContentAddressedArtifactStore(root);
    const retained = [];
    for (let index = 0; index < 20; index++) {
      const document = structuredClone(fixture);
      document.views.home.root.children[0]!.props.content = `Actual capture ${index}`;
      const request = { contract: 'kubeclaw.prism-design-engine@1' as const, operation: 'render' as const,
        input: { document, view: 'home', state: 'default', viewport: 'wide', capture: true }, idempotencyKey: `capture:${index}` };
      const first = engine.execute(request);
      const duplicate = engine.execute(request);
      assert.equal(engine.cacheUsage().inFlight, 1);
      const [result, replay] = await Promise.all([first, duplicate]);
      assert.equal(result, replay);
      assert.equal((result.output.renderer as { name: string }).name, 'chromium');
      const screenshot = Buffer.from(String(result.output.screenshotBase64), 'base64');
      assert.equal(screenshot.subarray(1, 4).toString(), 'PNG');
      retained.push({ ref: await artifacts.put(screenshot), bytes: screenshot });
      const aria = Buffer.from(String(result.output.ariaSnapshot));
      retained.push({ ref: await artifacts.put(aria), bytes: aria });
      assert.equal(engine.cacheUsage().inFlight, 0);
      assert(engine.cacheUsage().completedEntries <= limits.maximumCompletedEntries);
      assert(engine.cacheUsage().completedBytes <= limits.maximumCompletedBytes);
    }
    const reopened = new ContentAddressedArtifactStore(root);
    for (const item of retained) assert.deepEqual(Buffer.from(await reopened.get(item.ref.artifactId)), item.bytes);
  } finally { await rm(root, { recursive: true, force: true }); }
});
