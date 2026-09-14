import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { fetchUpstream } from '../../../scripts/updates/upstream-fetch.mjs';

async function fixture(t, handler) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}/release`;
}

test('real HTTP 504s are retried and the eventual release bytes are preserved', async t => {
  let calls = 0;
  const url = await fixture(t, (request, response) => {
    assert.equal(request.headers.accept, 'application/octet-stream');
    assert.equal(request.headers['cache-control'], 'no-cache');
    response.writeHead(++calls < 3 ? 504 : 200);
    response.end(calls < 3 ? 'gateway timeout' : 'exact release bytes');
  });
  const response = await fetchUpstream(url, { headers: { Accept: 'application/octet-stream' }, retryDelayMs: 1 });
  assert.equal(await response.text(), 'exact release bytes');
  assert.equal(calls, 3);
});

test('permanent HTTP failures are not retried', async t => {
  let calls = 0;
  const url = await fixture(t, (_request, response) => { calls++; response.writeHead(404); response.end(); });
  await assert.rejects(fetchUpstream(url, { retryDelayMs: 1 }), /404:/);
  assert.equal(calls, 1);
});

test('persistent transient failures stop after the bounded attempt count', async t => {
  let calls = 0;
  const url = await fixture(t, (_request, response) => { calls++; response.writeHead(503); response.end(); });
  await assert.rejects(fetchUpstream(url, { retryDelayMs: 1 }), /503:/);
  assert.equal(calls, 5);
});

test('the shared deadline interrupts retry waits', async t => {
  let calls = 0;
  const url = await fixture(t, (_request, response) => { calls++; response.writeHead(504); response.end(); });
  await assert.rejects(fetchUpstream(url, { timeoutMs: 1000, retryDelayMs: 10000 }), { name: 'AbortError' });
  assert.equal(calls, 1);
});
