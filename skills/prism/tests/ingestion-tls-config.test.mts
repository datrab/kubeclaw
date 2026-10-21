import assert from 'node:assert/strict';
import test from 'node:test';
import https from 'node:https';
import tls from 'node:tls';
import { promises as dns } from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer as reservePort } from 'node:net';
import { once } from 'node:events';
import { publishedServiceConfig } from './fixtures/published-config.mjs';

// Real verified TLS and HTTP, with explicitly modeled public DNS/routing only.
// This is not evidence of native public-network SSRF or full delivery acceptance.
test('published ingestion A/B/A selects real TLS request timeout and redirect budget', { timeout: 60000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'ingestion-tls-selected-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=source.fixture.test', '-addext', 'subjectAltName=DNS:source.fixture.test',
    '-keyout', join(root, 'key.pem'), '-out', join(root, 'cert.pem')], { stdio: 'pipe' });
  const cert = await readFile(join(root, 'cert.pem'), 'utf8');
  const originalRoots = tls.getCACertificates('default');
  tls.setDefaultCACertificates([...originalRoots, cert]);
  t.after(() => tls.setDefaultCACertificates(originalRoots));
  let redirects = 0, stalls = 0;
  const observedTimeouts: number[] = [];
  const sockets = new Set<any>();
  const source = https.createServer({ key: await readFile(join(root, 'key.pem')), cert }, (req, res) => {
    if (req.url === '/stall') { stalls++; return; }
    redirects++; res.writeHead(302, { location: '/loop' }); res.end();
  });
  source.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  source.listen(0, '127.0.0.1'); await once(source, 'listening');
  t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => source.close(() => resolve())); });
  const sourceAddress = source.address(); assert(sourceAddress && typeof sourceAddress !== 'string');
  const originalLookup = dns.lookup.bind(dns), originalRequest = https.request.bind(https);
  t.mock.method(dns, 'lookup', async (name: any, options: any) => name === 'source.fixture.test'
    ? [{ address: '203.0.113.10', family: 4 }] : originalLookup(name, options));
  t.mock.method(https, 'request', (options: any, callback: any) => {
    assert.equal(options.hostname, '203.0.113.10');
    assert.equal(options.servername, 'source.fixture.test');
    assert.equal(options.rejectUnauthorized, true);
    // Only routing is modeled. TLS identity validation remains enabled.
    const request = originalRequest({ ...options, hostname: '127.0.0.1', agent: false }, callback);
    const setTimeout = request.setTimeout.bind(request);
    request.setTimeout = ((ms: number, callback?: () => void) => { observedTimeouts.push(ms); return setTimeout(ms, callback); }) as typeof request.setTimeout;
    return request;
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const base = JSON.parse(await readFile(new URL('../../../config/components/prism-control.config.json', import.meta.url), 'utf8')).profiles.standard.settings.ingestionServer;
  const selected: any[] = [];
  for (const [index, sourceRequestTimeoutMs, maximumRedirects] of [[0, 40, 0], [1, 180, 2]]) {
    const reserve = reservePort(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
    const reserved = reserve.address(); assert(reserved && typeof reserved !== 'string');
    await new Promise<void>(resolve => reserve.close(() => resolve()));
    const { capture, code } = await publishedServiceConfig(t, 'prism-ingestion', { ingestionServer: {
      ...base, port: reserved.port, quarantineRoot: join(root, String(index)), sourceRequestTimeoutMs, maximumRedirects,
    } });
    const { loadIngestionConfig } = await import(pathToFileURL(join(code, 'skills/packages/prism-engine/server/ingestion-config.ts')).href);
    const { startIngestionServer } = await import(pathToFileURL(join(code, 'skills/packages/prism-engine/server/ingestion.ts')).href);
    selected.push({ expectedTimeout: sourceRequestTimeoutMs, expectedRedirects: maximumRedirects, config: loadIngestionConfig(capture, { PRISM_INGESTION_SECRET: 'tls-selected' }), startIngestionServer });
  }
  for (const [index, selection] of [selected[0], selected[1], selected[0]].entries()) {
    const server = await selection.startIngestionServer(selection.config);
    try {
      const address = server.address(); assert(address && typeof address !== 'string');
      const post = (path: string) => fetch(`http://127.0.0.1:${address.port}/v1/acquisitions`, {
        method: 'POST', headers: { authorization: 'Bearer tls-selected' }, body: JSON.stringify({
          sourceKind: 'public-web', rights: 'full', title: 'TLS fixture', summary: 'selected transport', tags: [],
          locator: `https://source.fixture.test:${sourceAddress.port}${path}`,
        }),
      });
      const before = redirects;
      assert.equal(selection.config.sourceRequestTimeoutMs, selection.expectedTimeout);
      assert.equal(selection.config.maximumRedirects, selection.expectedRedirects);
      const redirected = await post('/loop'); assert.equal(redirected.status, 422);
      assert.match((await redirected.json()).error, /too many source redirects/);
      assert.equal(redirects - before, selection.expectedRedirects + 1);
      const priorTimeouts = observedTimeouts.length;
      const priorStalls = stalls, started = performance.now();
      const stalled = await post('/stall'); const elapsed = performance.now() - started;
      assert.equal(stalled.status, 422); assert.match((await stalled.json()).error, /source request timed out/);
      assert.deepEqual(observedTimeouts.slice(priorTimeouts), [selection.expectedTimeout], 'actual TLS request receives the authored timeout, independently of loaded configuration');
      assert.equal(stalls - priorStalls, 1, `snapshot ${index} reached real TLS server`);
      assert(elapsed >= selection.expectedTimeout * 0.8, 'selected timeout must not expire early');
      assert(elapsed < 2000, 'must not fall back to historical 15-second timeout');
      assert.equal((await fetch(`http://127.0.0.1:${address.port}/ready`)).status, 200);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  }
});
