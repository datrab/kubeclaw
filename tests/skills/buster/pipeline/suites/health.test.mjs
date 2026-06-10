import assert from 'node:assert/strict';
import test from 'node:test';

import healthSuite from '../../../../../skills/buster/pipeline/suites/health.ts';

test('healthSuite keeps concurrent log sinks isolated per invocation', async () => {
  const originalFetch = globalThis.fetch;
  const leftEntries = [];
  const rightEntries = [];

  globalThis.fetch = async (url) => {
    const delay = String(url).includes('/left') ? 40 : 10;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return new Response('', { status: 200 });
  };

  try {
    const [left, right] = await Promise.all([
      healthSuite({
        config: { serve: { port: 4321, health_path: '/left', health_retries: 1 } },
        logSink: (entry) => leftEntries.push(entry),
      }),
      healthSuite({
        config: { serve: { port: 4321, health_path: '/right', health_retries: 1 } },
        logSink: (entry) => rightEntries.push(entry),
      }),
    ]);

    assert.equal(left.status, 'PASS');
    assert.equal(right.status, 'PASS');
    assert.equal(leftEntries.length, 2);
    assert.equal(rightEntries.length, 2);
    assert.match(leftEntries[0].msg, /\/left/);
    assert.match(rightEntries[0].msg, /\/right/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
