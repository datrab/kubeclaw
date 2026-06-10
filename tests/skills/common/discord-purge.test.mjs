import assert from 'node:assert/strict';
import test from 'node:test';

import deepPurge from '../../../skills/common/discord-purge.ts';

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

test('deepPurge retries message fetch rate limits', async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const calls = [];

  console.error = () => {};
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });

    if (calls.length === 1) {
      return jsonResponse({ retry_after: 0.001 }, { status: 429 });
    }

    if (calls.length === 2) {
      return jsonResponse([
        { id: 'recent-message', timestamp: new Date().toISOString() },
        { id: 'old-message', timestamp: new Date(0).toISOString() },
      ]);
    }

    return new Response(null, { status: 204 });
  };

  try {
    const deleted = await deepPurge('123456789012345678', 'token');

    assert.equal(deleted, 1);
    assert.equal(calls.length, 3);
    assert.match(calls[0].url, /\/channels\/123456789012345678\/messages\?limit=100$/);
    assert.match(calls[1].url, /\/channels\/123456789012345678\/messages\?limit=100$/);
    assert.match(calls[2].url, /\/channels\/123456789012345678\/messages\/recent-message$/);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});

test('deepPurge rejects invalid channel ids before fetching', async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  let fetchCalled = false;

  console.error = () => {};
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch should not be called');
  };

  try {
    await assert.rejects(
      deepPurge('123/../messages?limit=1', 'token'),
      /Invalid Discord channel id\./,
    );
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});
