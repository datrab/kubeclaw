import assert from 'node:assert/strict';
import http from 'node:http';
import { createGzip, gzipSync, constants } from 'node:zlib';
import { activate } from '../src/adapter.ts';

const observations = new Map();
const server = http.createServer((request, response) => {
  const route = request.url;
  const state = { chunks: 0, ended: false, closed: false };
  observations.set(route, state);
  response.on('close', () => { state.closed = true; });
  if (route === '/gzip-small') {
    response.writeHead(200, { 'content-encoding': 'gzip', 'content-type': 'text/plain' });
    response.end(gzipSync('€ valid'));
    return;
  }
  if (route === '/exact') { response.end('x'.repeat(128)); return; }
  if (route === '/headers' || route === '/body') {
    if (route === '/body') { response.writeHead(200); response.flushHeaders(); response.write('a'); }
    const timer = setTimeout(() => response.end('late'), 5_000);
    response.on('close', () => clearTimeout(timer));
    return;
  }
  response.writeHead(route === '/redirect' ? 302 : 200, {
    'content-type': 'text/plain',
    ...(route === '/gzip' ? { 'content-encoding': 'gzip' } : {}),
    ...(route === '/declared' ? { 'content-length': '1000000' } : {}),
    ...(route === '/redirect' ? { location: '/chunks' } : {}),
  });
  response.flushHeaders();
  const gzip = route === '/gzip' ? createGzip() : undefined;
  gzip?.pipe(response);
  const timer = setInterval(() => {
    state.chunks += 1;
    if (gzip) { gzip.write('x'.repeat(4096)); gzip.flush(constants.Z_SYNC_FLUSH); }
    else response.write('x'.repeat(32));
    if (state.chunks === 100) {
      state.ended = true; clearInterval(timer);
      if (gzip) gzip.end(); else response.end();
    }
  }, 10);
  response.on('close', () => { clearInterval(timer); gzip?.destroy(); });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
function adapter(timeoutMs) {
  return activate({ config: { allowedOrigins: [origin], maxResponseBytes: 128, timeoutMs } });
}
function invoke(instance, pathname, signal = new AbortController().signal) {
  return instance.invoke({ confidential: true, signal,
    request: { capability: 'network.http', operation: 'request', resource: { type: 'network.url', canonicalId: `${origin}${pathname}` }, payload: {} } });
}
async function closed(pathname) {
  const deadline = Date.now() + 1_000;
  while (!observations.get(pathname)?.closed && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  assert(observations.get(pathname)?.closed, `${pathname} connection is closed promptly`);
}
const failures = [];
async function check(label, action) {
  try { await action(); console.log(JSON.stringify({ label, ok: true })); }
  catch (error) { failures.push({ label, error }); console.error(`${label}: ${error.message}`); }
}
try {
  assert.equal((await invoke(adapter(3_000), '/gzip-small')).body, '€ valid');
  assert.equal((await invoke(adapter(3_000), '/exact')).body, 'x'.repeat(128));
  for (const route of ['/chunks', '/gzip', '/declared', '/redirect']) {
    await check(route, async () => {
      await assert.rejects(invoke(adapter(3_000), route), route === '/redirect' ? /NETWORK_REDIRECT_DENIED/ : /NETWORK_RESPONSE_SIZE_EXCEEDED/);
      await closed(route);
      assert.equal(observations.get(route).ended, false, 'reject before end-of-stream');
      assert(observations.get(route).chunks < 10, 'peer stops shortly after byte limit or header rejection');
    });
  }
  for (const pathname of ['/headers', '/body']) {
    await check(`timeout:${pathname}`, async () => {
      await assert.rejects(invoke(adapter(300), pathname), (error) => error.message === 'NETWORK_TIMEOUT');
      await closed(pathname);
    });
    await check(`abort:${pathname}`, async () => {
      const controller = new AbortController();
      const reason = new Error(`operator cancellation ${pathname}`);
      const pending = invoke(adapter(3_000), pathname, controller.signal);
      const timer = setTimeout(() => controller.abort(reason), 100);
      try { await assert.rejects(pending, (error) => error.message === 'ADAPTER_CANCELLED' && error.cause === reason); }
      finally { clearTimeout(timer); }
      await closed(pathname);
    });
  }
  assert.deepEqual(failures.map(({ label }) => label), [], 'all streaming and deadline cases pass');
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
