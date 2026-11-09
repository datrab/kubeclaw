import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { HttpRemotePlanTransport } from '../../../skills/nova/core/test-gates/remote-dispatch.ts';
import { RemotePlanTransportError } from '../../../skills/nova/core/test-gates/transport-error.ts';

test('non-JSON proxy errors retain HTTP retryability; malformed success still fails closed', async () => {
  let status = 502;
  const server = http.createServer((_request, response) => {
    response.writeHead(status, { 'content-type': 'text/plain' });
    response.end('upstream connection error');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const transport = new HttpRemotePlanTransport({ endpoint: `http://127.0.0.1:${address.port}`,
    token: 'synthetic-test-token'.repeat(3), maximumResponseBytes: 1024 });
  try {
    for (const [code, retryable] of [[502, true], [503, true], [429, true], [401, false], [404, false]] as const) {
      status = code;
      await assert.rejects(transport.status('job:proxy-test'), (error: unknown) =>
        error instanceof RemotePlanTransportError && error.retryable === retryable
        && error.message === `NOVA_REMOTE_PLAN_HTTP_${code}:NON_JSON_RESPONSE`);
    }
    status = 200;
    await assert.rejects(transport.status('job:proxy-test'), /NOVA_REMOTE_PLAN_RESPONSE_INVALID/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
