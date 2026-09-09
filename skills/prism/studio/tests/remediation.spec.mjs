import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import fixture from '../../../../contracts/prism/v1/fixtures/minimal-web.json' with { type: 'json' };
import { validatePrism } from '@kubeclaw/prism-contracts-v1';
import { ContentAddressedArtifactStore } from '../../storage/index.ts';
// Production Studio bundle and real stored image; local HTTP fixture is not Control auth proof.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
let server; let origin; let temporary; let mode = 'normal';
function design(artifact) {
  const document = structuredClone(fixture);
  document.assets = { hero: { kind: 'image', artifact: artifact.artifactId, mediaType: 'image/png', role: 'hero', alt: 'Real pixel' } };
  document.views.home.root.children.push(
    { id: 'pages', type: 'pagination', props: { page: 1, pageCount: 2, previousAction: 'back', nextAction: 'forward' } },
    { id: 'hero-image', type: 'image', props: { asset: 'hero' } });
  document.views.home.states.second = { patches: { pages: { page: 2 }, title: { content: 'Second page' } } };
  const start = { view: 'home', state: 'default' }; const end = { view: 'home', state: 'second' };
  document.flows.pages = { title: 'Pages', goal: 'Browse', start, success: end, recovery: [start], transitions: [
    { id: 'go-next', from: start, to: end, trigger: { actor: 'user', action: 'forward', node: 'pages' } },
    { id: 'go-back', from: end, to: start, trigger: { actor: 'user', action: 'back', node: 'pages' } },
  ] };
  validatePrism('designDocument', document); return document;
}
test.beforeAll(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'prism-browser-remediation-'));
  const artifacts = new ContentAddressedArtifactStore(temporary); const artifact = await artifacts.put(png);
  const document = design(artifact);
  const bundle = fileURLToPath(new URL('../../dist-studio/', import.meta.url));
  server = createServer((request, response) => {
    void (async () => {
      const pathname = new URL(request.url, 'http://fixture').pathname;
      if (pathname === '/v1/session') { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ csrf: 'fixture', userId: 'operator' })); return; }
      if (pathname === '/v1/documents/demo') { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ document })); return; }
      if (pathname.startsWith('/v1/artifacts/')) {
        if (mode === 'denied') { response.writeHead(403); response.end(); return; }
        if (mode === 'oversize') { response.writeHead(200, { 'content-length': 6_000_001 }); response.flushHeaders(); return; }
        response.end(mode === 'corrupt' ? Buffer.from('corrupt') : await artifacts.get(artifact.artifactId)); return;
      }
      const file = resolve(bundle, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!file.startsWith(`${resolve(bundle)}${sep}`)) { response.writeHead(404); response.end(); return; }
      response.setHeader('content-type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(file)] ?? 'application/octet-stream');
      response.end(await readFile(file));
    })().catch((error) => response.destroy(error));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => {
  server?.closeAllConnections(); if (server) await new Promise((done) => server.close(done));
  if (temporary) await rm(temporary, { recursive: true, force: true });
});
test('real iframe clicks run original App transitions and canonical image loads inside sandbox', async ({ page }) => {
  mode = 'normal'; await page.goto(`${origin}/?document=demo`);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('iframe[title="Isolated prototype preview"]')).toHaveAttribute('sandbox', 'allow-scripts');
  const frame = page.frameLocator('iframe[title="Isolated prototype preview"]');
  const image = frame.getByRole('img', { name: 'Real pixel' });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth)).toBe(1);
  await frame.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(frame.getByRole('heading', { name: 'Second page' })).toBeVisible();
  await expect(frame.getByRole('navigation', { name: 'Pagination' })).toContainText('2 / 2');
  await frame.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(frame.getByRole('heading', { name: 'Deployments' })).toBeVisible();
  await expect(frame.getByRole('navigation', { name: 'Pagination' })).toContainText('1 / 2');
});
for (const [failure, message] of [['denied', 'LOAD_FAILED:403'], ['corrupt', 'INTEGRITY_FAILED'], ['oversize', 'SIZE_EXCEEDED']]) {
  test(`production App exposes asset ${failure} without an unverified image`, async ({ page }) => {
    mode = failure; await page.goto(`${origin}/?document=demo`);
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible();
    await expect(page.frameLocator('iframe[title="Isolated prototype preview"]').getByRole('img')).toHaveCount(0);
  });
}
