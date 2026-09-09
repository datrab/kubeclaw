import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import fixture from '../../../contracts/prism/v1/fixtures/minimal-web.json' with { type: 'json' };
import type { PrismDocument } from '@kubeclaw/prism-contracts-v1';
import { ContentAddressedArtifactStore } from '../storage/index.ts';
import { loadPreviewAssets } from '../studio/preview-assets.ts';
import { previewDocument } from '../studio/preview.ts';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
test('real stored image traverses HTTP with integrity, size, load and cancellation denials', async () => {
  const root = await mkdtemp(join(tmpdir(), 'prism-preview-assets-'));
  const store = new ContentAddressedArtifactStore(root);
  const artifact = await store.put(png);
  let mode = 'normal'; let contacts = 0;
  const server = createServer((request, response) => {
    contacts++;
    void (async () => {
      assert.equal(request.url, `/v1/artifacts/${artifact.digest}`);
      if (mode === 'denied') { response.writeHead(403); response.end('denied'); return; }
      if (mode === 'stall') { response.writeHead(200); response.flushHeaders(); return; }
      if (mode === 'declared-size') { response.writeHead(200, { 'content-length': 6_000_001 }); response.flushHeaders(); return; }
      if (mode === 'stream-size') { response.end(Buffer.alloc(6_000_001)); return; }
      response.end(mode === 'corrupt' ? Buffer.from('wrong') : await store.get(artifact.artifactId));
    })().catch((error) => response.destroy(error));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  // Supply the browser origin only; all network and artifact I/O is real.
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: `http://127.0.0.1:${address.port}` } });
  const document = structuredClone(fixture) as PrismDocument;
  document.assets = { hero: { kind: 'image', artifact: artifact.artifactId, mediaType: 'image/png', role: 'hero', alt: 'Pixel' } };
  document.views.home!.root.children = [{ id: 'hero-image', type: 'image', props: { asset: 'hero' } }];
  try {
    const assets = await loadPreviewAssets(document, new AbortController().signal);
    assert.equal(assets.hero!.src, `data:image/png;base64,${png.toString('base64')}`);
    assert.match(previewDocument(document, 'home', 'default', 'wide', assets), /<img[^>]+alt="Pixel"/u);
    for (const [failure, message] of [['denied', /LOAD_FAILED:403/u], ['corrupt', /INTEGRITY_FAILED/u],
      ['declared-size', /SIZE_EXCEEDED/u], ['stream-size', /SIZE_EXCEEDED/u]] as const) {
      mode = failure; await assert.rejects(loadPreviewAssets(document, new AbortController().signal), message);
    }
    mode = 'stall'; const controller = new AbortController();
    const pending = loadPreviewAssets(document, controller.signal);
    setTimeout(() => controller.abort(new Error('preview replaced')), 25);
    await assert.rejects(pending, /preview replaced/u);
    const before = contacts;
    const invalid = structuredClone(document);
    (invalid.assets.hero as Record<string, unknown>).mediaType = 'text/html';
    await assert.rejects(loadPreviewAssets(invalid, new AbortController().signal), /METADATA_INVALID/u);
    assert.equal(contacts, before);
  } finally {
    server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
    Reflect.deleteProperty(globalThis, 'location'); await rm(root, { recursive: true, force: true });
  }
});
