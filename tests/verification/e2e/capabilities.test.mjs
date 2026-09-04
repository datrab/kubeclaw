import assert from 'node:assert/strict';
import test from 'node:test';

import { probeCapabilities } from './capabilities.mts';

test('gateway capability performs an authenticated read-only tool request', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  const originalUrl = process.env.OPENCLAW_GATEWAY_TOOLS_URL;
  let request;
  try {
    process.env.OPENCLAW_GATEWAY_TOKEN = 'test-gateway-token';
    process.env.OPENCLAW_GATEWAY_TOOLS_URL = 'https://gateway.example.test/tools/invoke';
    globalThis.fetch = async (input, init) => {
      request = { input: String(input), init };
      return new Response(JSON.stringify({ ok: true, result: { agents: [] } }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    };
    const [result] = await probeCapabilities(['gateway']);
    assert.equal(result.ok, true);
    assert.equal(request.input, 'https://gateway.example.test/tools/invoke');
    assert.equal(request.init.method, 'POST');
    assert.equal(request.init.headers.authorization, 'Bearer test-gateway-token');
    assert.deepEqual(JSON.parse(request.init.body), { tool: 'agents_list', action: 'json', args: {} });
    assert.deepEqual(result.evidence, { authenticated: true, tool: 'agents_list' });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = originalToken;
    if (originalUrl === undefined) delete process.env.OPENCLAW_GATEWAY_TOOLS_URL;
    else process.env.OPENCLAW_GATEWAY_TOOLS_URL = originalUrl;
  }
});

test('gateway capability rejects an invalid token', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  const originalUrl = process.env.OPENCLAW_GATEWAY_TOOLS_URL;
  try {
    process.env.OPENCLAW_GATEWAY_TOKEN = 'invalid-gateway-token';
    process.env.OPENCLAW_GATEWAY_TOOLS_URL = 'https://gateway.example.test/tools/invoke';
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401, headers: { 'content-type': 'application/json' },
    });
    const [result] = await probeCapabilities(['gateway']);
    assert.deepEqual(result, { capability: 'gateway', ok: false, reason: 'INFRA_OPENCLAW_GATEWAY_AUTH_FAILED' });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = originalToken;
    if (originalUrl === undefined) delete process.env.OPENCLAW_GATEWAY_TOOLS_URL;
    else process.env.OPENCLAW_GATEWAY_TOOLS_URL = originalUrl;
  }
});

test('gateway capability distinguishes tool-policy denial from authentication failure', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  const originalUrl = process.env.OPENCLAW_GATEWAY_TOOLS_URL;
  try {
    process.env.OPENCLAW_GATEWAY_TOKEN = 'valid-but-restricted-token';
    process.env.OPENCLAW_GATEWAY_TOOLS_URL = 'https://gateway.example.test/tools/invoke';
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, error: 'forbidden' }), {
      status: 403, headers: { 'content-type': 'application/json' },
    });
    const [result] = await probeCapabilities(['gateway']);
    assert.deepEqual(result, { capability: 'gateway', ok: false, reason: 'INFRA_OPENCLAW_GATEWAY_POLICY_DENIED' });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = originalToken;
    if (originalUrl === undefined) delete process.env.OPENCLAW_GATEWAY_TOOLS_URL;
    else process.env.OPENCLAW_GATEWAY_TOOLS_URL = originalUrl;
  }
});
