import assert from 'node:assert/strict';
import test from 'node:test';

import { checkGatewayHealth, getGatewaySessionStatus } from '../../../../../skills/common/pipeline/integrations/gateway.ts';

test('gateway invoke options do not leak timeoutMs into request body', async (t) => {
  const originalFetch = globalThis.fetch;
  let requestBody = null;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init.body));
    return new Response('{}', { status: 200 });
  };

  await getGatewaySessionStatus('session-1', undefined, {
    gatewayUrl: 'http://gateway.example',
    gatewayToken: '',
    timeoutMs: 1,
  });

  assert.deepEqual(requestBody, {
    tool: 'session_status',
    args: { sessionKey: 'session-1' },
  });
});

test('gateway invoke options timeoutMs overrides the positional timeout', async (t) => {
  const originalFetch = globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  });

  const startedAt = Date.now();
  await assert.rejects(
    getGatewaySessionStatus('session-1', 10000, {
      gatewayUrl: 'http://gateway.example',
      gatewayToken: '',
      timeoutMs: 1,
      maxRetries: 1,
      retryDelayMs: 0,
    }),
    { name: 'AbortError' },
  );

  assert.ok(Date.now() - startedAt < 1000);
});

test('gateway health check does not require a token', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalOpenclawToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  let requestUrl = null;
  let requestHeaders = null;

  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalOpenclawToken === undefined) {
      delete process.env.OPENCLAW_GATEWAY_TOKEN;
    } else {
      process.env.OPENCLAW_GATEWAY_TOKEN = originalOpenclawToken;
    }
  });

  globalThis.fetch = async (url, init) => {
    requestUrl = String(url);
    requestHeaders = init.headers;
    return new Response(null, { status: 200 });
  };

  const healthy = await checkGatewayHealth({
    gatewayUrl: 'http://gateway.example',
    timeoutMs: 1,
  });

  assert.equal(healthy, true);
  assert.equal(requestUrl, 'http://gateway.example/health');
  assert.deepEqual(requestHeaders, {
    'Content-Type': 'application/json',
  });
});
