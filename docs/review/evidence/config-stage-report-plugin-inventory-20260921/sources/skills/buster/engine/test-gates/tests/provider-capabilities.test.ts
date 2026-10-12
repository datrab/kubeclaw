import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { ProviderCapabilities } from '../provider-capabilities.ts';
import type { TestProviderExecutionContext } from '@kubeclaw/plugin-sdk';
let received = 0;
const server = http.createServer((_request, response) => { received += 1; response.writeHead(200); response.write('open'); });
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const address = server.address(); assert.ok(address && typeof address !== 'string');
const endpoint = `http://127.0.0.1:${address.port}`;
let started = 0; let ended = 0; let observed: unknown;
const context = { signal: new AbortController().signal,
  invoke: async (_capability: string, _request: unknown, signal?: AbortSignal) => {
    started += 1;
    try { const response = await fetch(endpoint, { signal: signal ?? null }); return await response.text(); }
    catch (error) { observed = signal?.reason; throw error; }
    finally { ended += 1; }
  },
} as unknown as TestProviderExecutionContext;
try {
  const capabilities = new ProviderCapabilities(2);
  const replies: unknown[] = [];
  const send = (value: unknown) => { replies.push(value); return true; };
  const first = capabilities.handle('a', 'network.http', {} as never, context, send);
  const second = capabilities.handle('b', 'network.http', {} as never, context, send);
  await assert.rejects(capabilities.handle('a', 'network.http', {} as never, context, send), /DUPLICATE/);
  await assert.rejects(capabilities.handle('c', 'network.http', {} as never, context, send), /LIMIT/);
  while (received !== 2) await new Promise((resolve) => setImmediate(resolve));
  const reason = new Error('provider-ended'); capabilities.abort(reason);
  await capabilities.drain(); await Promise.all([first, second]);
  assert.equal(started, 2); assert.equal(received, 2); assert.equal(ended, 2); assert.equal(observed, reason); assert.equal(capabilities.pending, 0);
  assert.deepEqual(replies, []);
  await assert.rejects(capabilities.handle('d', 'network.http', {} as never, context, send), (error) => error === reason);
  console.log(JSON.stringify({ ok: true, suite: 'provider-capabilities', transport: 'native-http', checks: 6 }));
} finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
