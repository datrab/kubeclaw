import assert from 'node:assert/strict';
import test from 'node:test';

import { acpxCleanup, spawnSession } from '../../../../../skills/common/pipeline/agents/lifecycle.ts';

function testSpawnPolicy(maxRetries = 3) {
  return {
    mode: 'isolated',
    cleanup: 'on_exit',
    streamTo: 'pipeline',
    thread: false,
    gateway: {
      timeoutMs: 1000,
      maxRetries,
      retryDelayMs: 0,
    },
  };
}

test('acpxCleanup treats ACP close failure as non-critical cleanup', async () => {
  await acpxCleanup('agent:test', 'session:test', { timeoutMs: 1 });
});

test('spawnSession does not retry Gateway 400 contract errors', async (t) => {
  const oldFetch = globalThis.fetch;
  const oldGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const oldGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  let calls = 0;

  process.env.OPENCLAW_GATEWAY_URL = 'http://gateway.test';
  process.env.OPENCLAW_GATEWAY_TOKEN = 'token';
  globalThis.fetch = async () => {
    calls += 1;
    return new Response('bad request', { status: 400, statusText: 'Bad Request' });
  };
  t.after(() => {
    globalThis.fetch = oldFetch;
    if (oldGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = oldGatewayUrl;
    if (oldGatewayToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = oldGatewayToken;
  });

  await assert.rejects(
    spawnSession({
      session: {
        model: 'gpt-5.4',
        runtime: 'subagent',
        agentId: 'codex',
        cwd: '/tmp',
        label: 'reviewfix-module-review-1',
      },
    }, 'fix this', 60, {
      spawnPolicy: testSpawnPolicy(3),
      model: 'gpt-5.4',
      runtime: 'subagent',
      agentId: 'codex',
      cwd: '/tmp',
      label: 'reviewfix-module-review-1',
      trackActive: false,
    }),
    /Gateway session spawn contract invalid.*400 Bad Request/,
  );
  assert.equal(calls, 1);
});
