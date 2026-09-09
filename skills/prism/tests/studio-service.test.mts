import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function listen(server: Server): Promise<number> {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string'); return address.port;
}
async function close(server: Server): Promise<void> {
  server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
}
async function until(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!await check()) {
    if (Date.now() > deadline) throw new Error('TEST_CONDITION_TIMEOUT');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
async function studio(t: TestContext, control: string) {
  const reserve = createServer(); const port = await listen(reserve); await close(reserve);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-studio-http-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>Actual static fixture</title>');
  const child = spawn(process.execPath, [fileURLToPath(new URL('../server/studio.ts', import.meta.url))], {
    env: { ...process.env, PORT: String(port), STUDIO_ROOT: root, PRISM_CONTROL_URL: control,
      PRISM_INGRESS_SECRET: 'local-test-ingress', PRISM_CONTROL_TIMEOUT_MS: '250' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk.toString(); }); child.stdout.resume();
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    fs.rmSync(root, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${port}`;
  await until(async () => {
    assert.equal(child.exitCode, null, stderr);
    try { return (await fetch(`${url}/health`)).ok; } catch { return false; }
  });
  async function healthy() {
    assert.equal(child.exitCode, null, stderr);
    assert.equal((await fetch(`${url}/health`)).status, 200);
    assert.match(await (await fetch(url)).text(), /Actual static fixture/u);
  }
  return { url, healthy, errors: () => stderr };
}

test('actual Studio survives refused Control and malformed URL with explicit responses', async t => {
  const reserve = createServer(); const absent = await listen(reserve); await close(reserve);
  const app = await studio(t, `http://127.0.0.1:${absent}`);
  const failed = await fetch(`${app.url}/v1/projects`);
  assert.equal(failed.status, 502);
  const error = await failed.json();
  assert.equal(error.error.message, 'PRISM_STUDIO_UPSTREAM_FAILED');
  assert.match(JSON.stringify(error), /ECONNREFUSED/u);
  await app.healthy();
  const malformed = await fetch(`${app.url}/%E0%A4%A`);
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.message, 'PRISM_STUDIO_PATH_ENCODING_INVALID');
  await app.healthy();
});

test('actual Studio retains proxy bytes, cookies and upstream status', async t => {
  const upstream = createServer((request, response) => {
    assert.equal(request.headers['x-prism-ingress-secret'], 'local-test-ingress');
    response.writeHead(409, { 'content-type': 'application/json', 'set-cookie': ['one=1; HttpOnly', 'two=2; Secure'] });
    response.end('{"message":"explicit conflict ü"}');
  });
  const port = await listen(upstream); t.after(() => close(upstream));
  const app = await studio(t, `http://127.0.0.1:${port}`);
  const result = await fetch(`${app.url}/v1/projects?state=all`);
  assert.equal(result.status, 409); assert.equal(result.headers.getSetCookie().length, 2);
  assert.equal((await result.json()).message, 'explicit conflict ü');
  await app.healthy();
});

test('actual Studio forwards direction idempotency keys and retry payloads to Control', async t => {
  const upstream = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ method: request.method, url: request.url,
      key: request.headers['idempotency-key'], csrf: request.headers['x-prism-csrf'],
      cookie: request.headers.cookie, ingress: request.headers['x-prism-ingress-secret'],
      contentType: request.headers['content-type'], body: Buffer.concat(chunks).toString('utf8') }));
  });
  const port = await listen(upstream); t.after(() => close(upstream));
  const app = await studio(t, `http://127.0.0.1:${port}`);
  for (const [operation, payload] of [['select', { documentId: 'document-one' }], ['feedback', { action: 'liked' }]] as const) {
    const route = `/v1/directions/11111111-1111-4111-8111-111111111111/${operation}`;
    const body = JSON.stringify(payload);
    for (let retry = 0; retry < 2; retry++) {
      const result = await fetch(`${app.url}${route}`, { method: 'POST', body,
        headers: { 'Idempotency-Key': `decision-${operation}`, 'x-prism-csrf': 'csrf-test',
          cookie: 'prism_session=session-test', 'content-type': 'application/json',
          'x-prism-ingress-secret': 'untrusted-client-value' } });
      assert.equal(result.status, 200);
      assert.deepEqual(await result.json(), { method: 'POST', url: route, key: `decision-${operation}`,
        csrf: 'csrf-test', cookie: 'prism_session=session-test', ingress: 'local-test-ingress',
        contentType: 'application/json', body });
    }
  }
});

for (const phase of ['headers', 'empty-body', 'partial-body'] as const) {
  test(`actual Studio bounds upstream ${phase} wait and remains healthy`, async t => {
    let disconnected = false;
    const upstream = createServer((_request, response) => {
      response.once('close', () => { disconnected = true; });
      if (phase !== 'headers') { response.writeHead(200, { 'content-type': 'text/plain' }); response.flushHeaders(); }
      if (phase === 'partial-body') response.write('partial');
    });
    const port = await listen(upstream); t.after(() => close(upstream));
    const app = await studio(t, `http://127.0.0.1:${port}`);
    const start = Date.now(); const result = await fetch(`${app.url}/v1/projects`);
    if (phase === 'partial-body') { assert.equal(result.status, 200); await assert.rejects(result.text()); }
    else { assert.equal(result.status, 504); assert.equal((await result.json()).error.message, 'PRISM_STUDIO_CONTROL_TIMEOUT'); }
    assert(Date.now() - start < 2000);
    await until(() => disconnected); await app.healthy();
  });
}

test('actual Studio cancels upstream streaming when the client disconnects', async t => {
  let disconnected = false;
  const upstream = createServer((_request, response) => {
    response.once('close', () => { disconnected = true; }); response.write('started');
  });
  const port = await listen(upstream); t.after(() => close(upstream));
  const app = await studio(t, `http://127.0.0.1:${port}`);
  const controller = new AbortController();
  const result = await fetch(`${app.url}/v1/projects`, { signal: controller.signal });
  const reader = result.body!.getReader(); assert.equal((await reader.read()).done, false);
  controller.abort(); await assert.rejects(reader.read());
  await until(() => disconnected); await app.healthy();
});
