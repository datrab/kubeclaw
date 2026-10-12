import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {listen, close, until, studio} from './fixtures/studio-service.mts';

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

for (const timeout of [150, 600]) {
  test(`authored Studio timeout ${timeout} reaches the live proxy and startup snapshot`, async t => {
    const upstream = createServer(() => {});
    const port = await listen(upstream); t.after(() => close(upstream));
    const app = await studio(t, `http://127.0.0.1:${port}`, timeout);
    app.rewritePolicy({port: 1, controlTimeoutMs: 1, controlUrl: 'http://127.0.0.1:1'});
    const start = Date.now();
    const result = await fetch(`${app.url}/v1/projects`);
    assert.equal(result.status, 504);
    assert.equal((await result.json()).error.message, 'PRISM_STUDIO_CONTROL_TIMEOUT');
    const elapsed = Date.now() - start;
    assert(elapsed >= timeout * 0.7 && elapsed < timeout + 1000, `deadline ${timeout}, elapsed ${elapsed}`);
    await app.healthy();
  });
}

test('missing Studio ingress secret retains 503 proxy response and static availability', async t => {
  const app = await studio(t, 'http://127.0.0.1:1', 250, undefined, '');
  const result = await fetch(`${app.url}/v1/projects`);
  assert.equal(result.status, 503);
  assert.equal((await result.json()).error.message, 'PRISM_STUDIO_PROXY_NOT_CONFIGURED');
  await app.healthy();
});
