import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile, access, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { publishedServiceConfig } from './fixtures/published-config.mjs';

test('real ingestion cleanup failure is explicit, preserves authorization and supports retry without process restart', async t => {
  const root = await mkdtemp(join(tmpdir(), 'prism-ingestion-http-'));
  const expired = join(root, 'b'.repeat(64)), recent = join(root, 'c'.repeat(64));
  await writeFile(expired, 'expired acquired bytes'); await writeFile(recent, 'recent acquired bytes');
  await utimes(expired, new Date(), new Date(Date.now() - 120000));
  await utimes(recent, new Date(), new Date(Date.now() - 1000));
  const reserve = createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
  const address = reserve.address(); assert(address && typeof address !== 'string');
  const port = address.port; await new Promise<void>(resolve => reserve.close(() => resolve()));
  const { capture, code } = await publishedServiceConfig(t, 'prism-ingestion', { ingestionServer: {
    port, quarantineRoot: root, quarantineTtlMs: 60000, reaperIntervalMs: 60000,
    maximumRequestBytes: 2000000, maximumSourceBytes: 6000000, sourceRequestTimeoutMs: 15000,
    maximumRedirects: 3, allowedMediaTypes: ['application/json', 'text/plain'],
  } });
  const { loadIngestionConfig } = await import(pathToFileURL(join(code, 'skills/packages/prism-engine/server/ingestion-config.ts')).href);
  const { startIngestionServer } = await import(pathToFileURL(join(code, 'skills/packages/prism-engine/server/ingestion.ts')).href);
  const server = await startIngestionServer(loadIngestionConfig(capture, { PRISM_INGESTION_SECRET: 'local-ingestion-regression' }));
  t.after(async () => {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${port}`;
  await assert.rejects(access(expired), { code: 'ENOENT' });
  await access(recent); // Explicit selected TTL keeps recent content.
  const file = join(root, 'a'.repeat(64)); await mkdir(file);
  const url = `${origin}/v1/acquisitions/${'a'.repeat(64)}`;
  assert.equal((await fetch(url, { method: 'DELETE' })).status, 401);
  await access(file);
  const options = { method: 'DELETE', headers: { authorization: 'Bearer local-ingestion-regression' } };
  const diagnostics: string[] = [];
  const originalWrite = process.stderr.write;
  process.stderr.write = ((chunk: any, ...args: any[]) => { diagnostics.push(String(chunk)); return originalWrite.call(process.stderr, chunk, ...args); }) as typeof process.stderr.write;
  let failed: Response;
  try { failed = await fetch(url, options); } finally { process.stderr.write = originalWrite; }
  assert.equal(failed.status, 503);
  assert.match(diagnostics.join(''), /PRISM_INGESTION_REQUEST_FAILED/);
  assert.match(diagnostics.join(''), /EISDIR/);
  const body = await failed.json(); assert.equal(body.error.code, 'PRISM_INGESTION_IO_FAILED');
  assert.equal(body.error.causeCode, 'EISDIR'); assert.match(body.error.message, /unlink/u);
  assert.equal((await fetch(`${origin}/health`)).status, 200);
  await rm(file, { recursive: true }); await writeFile(file, 'temporary acquired content');
  assert.equal((await fetch(url, options)).status, 204); await assert.rejects(access(file), { code: 'ENOENT' });
  assert.equal((await fetch(url, options)).status, 204);
  assert.equal((await fetch(`${origin}/ready`)).status, 200);
  const invalid = await fetch(`${origin}/v1/acquisitions`, { method: 'POST', headers: options.headers, body: '{' });
  assert.equal(invalid.status, 422); assert.equal((await fetch(`${origin}/health`)).status, 200);

});

test('real ingestion rejects nonfinite and fractional quarantine TTL before serving', async t => {
  const { capture, code } = await publishedServiceConfig(t, 'prism-ingestion');
  const { loadIngestionConfig } = await import(pathToFileURL(join(code, 'skills/packages/prism-engine/server/ingestion-config.ts')).href);
  for (const value of ['NaN', 'Infinity', '60000.5']) {
    assert.throws(() => loadIngestionConfig(capture, { PRISM_INGESTION_SECRET: 'local', PRISM_QUARANTINE_TTL_MS: value }), /LEGACY_OVERRIDE:PRISM_QUARANTINE_TTL_MS/);
  }
  for (const quarantineTtlMs of [NaN, Infinity, 60000.5, 59999, 86400001]) {
    await assert.rejects(publishedServiceConfig(t, 'prism-ingestion', { ingestionServer: {
      port: 8080, quarantineRoot: '/quarantine', quarantineTtlMs, reaperIntervalMs: 60000,
      maximumRequestBytes: 2000000, maximumSourceBytes: 6000000, sourceRequestTimeoutMs: 15000,
      maximumRedirects: 3, allowedMediaTypes: ['application/json'],
    } }), /SWARM_CONFIG/);
  }
});

test('published ingestion A/B snapshots drive actual request, source, media and cleanup behavior', async t => {
  const base = JSON.parse((await import('node:fs')).readFileSync(new URL('../../../config/components/prism-control.config.json', import.meta.url), 'utf8')).profiles.standard.settings.ingestionServer;
  const root = await mkdtemp(join(tmpdir(), 'prism-ingestion-ab-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const secret = 'ingestion-ab';
  let configA: any;
  for (const [index, maximumSourceBytes] of [4, 8].entries()) {
    const reserve = createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
    const address = reserve.address(); assert(address && typeof address !== 'string');
    const port = address.port; await new Promise<void>(resolve => reserve.close(() => resolve()));
    const { code, capture } = await publishedServiceConfig(t, 'prism-ingestion', { ingestionServer: {
      ...base, port, quarantineRoot: join(root, String(index)), maximumRequestBytes: 256,
      maximumSourceBytes, reaperIntervalMs: 20,
    } });
    const { loadIngestionConfig } = await import(pathToFileURL(join(code, 'skills/packages/prism-engine/server/ingestion-config.ts')).href);
    const { startIngestionServer } = await import(pathToFileURL(join(code, 'skills/packages/prism-engine/server/ingestion.ts')).href);
    const config = loadIngestionConfig(capture, { PRISM_INGESTION_SECRET: secret });
    assert(Object.isFrozen(config));
    for (const key of ['PORT', 'PRISM_QUARANTINE_ROOT', 'PRISM_QUARANTINE_TTL_MS']) {
      assert.throws(() => loadIngestionConfig(capture, { PRISM_INGESTION_SECRET: secret, [key]: '' }), /LEGACY_OVERRIDE/);
    }
    assert.throws(() => loadIngestionConfig(capture, {}), /SECRET is required/);
    assert.throws(() => loadIngestionConfig({ ...capture }, { PRISM_INGESTION_SECRET: secret }), /VERIFIED_CAPTURE_REQUIRED/);
    if (index === 0) configA = config;
    else assert.equal(configA.maximumSourceBytes, 4);
    const server = await startIngestionServer(config);
    t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
    const origin = `http://127.0.0.1:${port}`;
    const post = (body: string) => fetch(`${origin}/v1/acquisitions`, { method: 'POST', headers: { authorization: `Bearer ${secret}` }, body });
    // Original productive source-kind fixture; body padding makes exact byte admission observable.
    const input = { sourceKind: 'user-upload', rights: 'full', title: 'boundary', summary: 'test', tags: [], contentBase64: Buffer.alloc(maximumSourceBytes, 65).toString('base64'), mediaType: 'text/plain' };
    const encoded = JSON.stringify(input);
    assert(Buffer.byteLength(encoded) <= 256);
    const exact = await post(encoded + ' '.repeat(256 - Buffer.byteLength(encoded)));
    assert.equal(exact.status, 202, await exact.clone().text());
    const overflow = await post(encoded + ' '.repeat(257 - Buffer.byteLength(encoded)));
    assert.match((await overflow.json()).error, /request is too large/);
    const sourceOverflow = await post(JSON.stringify({ ...input, contentBase64: Buffer.alloc(maximumSourceBytes + 1, 65).toString('base64') }));
    assert.match((await sourceOverflow.json()).error, /invalid or too large/);
    const metadataOverflow = await post(JSON.stringify({ sourceKind: 'generated', rights: 'full', title: 'metadata', summary: 'exceeds source cap', tags: [] }));
    assert.match((await metadataOverflow.json()).error, /source is too large/);
    const badMedia = await post(JSON.stringify({ ...input, mediaType: 'application/x-binary' }));
    assert.match((await badMedia.json()).error, /media type is not allowed/);
    assert.equal((await post(encoded)).status, 202, 'rejection does not poison server');
  }
});

test('metadata-only acquisitions enforce the selected source-byte boundary before quarantine writes', async t => {
  const base = JSON.parse((await import('node:fs')).readFileSync(new URL('../../../config/components/prism-control.config.json', import.meta.url), 'utf8')).profiles.standard.settings.ingestionServer;
  const root = await mkdtemp(join(tmpdir(), 'ingestion-metadata-'));
  const reserve = createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
  const address = reserve.address(); assert(address && typeof address !== 'string');
  await new Promise<void>(resolve => reserve.close(() => resolve()));
  const metadata = { title: 'metadata', summary: 'ü', tags: [] };
  const maximumSourceBytes = Buffer.byteLength(JSON.stringify(metadata));
  const { capture, code } = await publishedServiceConfig(t, 'prism-ingestion', { ingestionServer: { ...base,
    port: address.port, quarantineRoot: root, maximumSourceBytes, maximumRequestBytes: 512 } });
  const { loadIngestionConfig } = await import(pathToFileURL(join(code, 'skills/packages/prism-engine/server/ingestion-config.ts')).href);
  const { startIngestionServer } = await import(pathToFileURL(join(code, 'skills/packages/prism-engine/server/ingestion.ts')).href);
  const server = await startIngestionServer(loadIngestionConfig(capture, { PRISM_INGESTION_SECRET: 'metadata-boundary' }));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); });
  for (const sourceKind of ['internal-project', 'generated', 'user-upload']) {
    const post = (title: string): Promise<Response> => fetch(`http://127.0.0.1:${address.port}/v1/acquisitions`, { method: 'POST',
      headers: { authorization: 'Bearer metadata-boundary' }, body: JSON.stringify({ ...metadata, title, sourceKind, rights: 'full' }) });
    const exact = await post(metadata.title); assert.equal(exact.status, 202, await exact.clone().text());
    assert.equal(Buffer.from((await exact.json()).contentBase64, 'base64').length, maximumSourceBytes);
    const over = await post(metadata.title + 'a'); assert.equal(over.status, 422); assert.match((await over.json()).error, /source is too large/);
    assert.equal((await post(metadata.title)).status, 202);
  }
  assert.equal((await (await import('node:fs/promises')).readdir(root)).length, 1, 'oversize metadata never writes quarantine bytes');
});
