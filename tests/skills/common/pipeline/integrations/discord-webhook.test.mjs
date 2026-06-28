import assert from 'node:assert/strict';
import test from 'node:test';

import { DiscordWebhookDeliveryError, postDiscordWebhook } from '../../../../../skills/common/pipeline/integrations/discord-webhook.ts';

test('caller signal does not replace discord webhook timeout', async () => {
  const caller = new AbortController();
  let requestSignal = null;
  const startedAt = Date.now();

  await assert.rejects(
    postDiscordWebhook('https://discord.example/webhook', {
      body: '{}',
      signal: caller.signal,
      timeoutMs: 10,
      fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
        requestSignal = init.signal;
        init.signal.addEventListener('abort', () => {
          reject(init.signal.reason || new Error('aborted'));
        }, { once: true });
      }),
    }),
    (error) => {
      assert.equal(error instanceof DiscordWebhookDeliveryError, true);
      assert.equal(error.code, 'DISCORD_WEBHOOK_DELIVERY_FAILED');
      assert.ok(error.cause);
      return true;
    },
  );

  assert.notEqual(requestSignal, caller.signal);
  assert.equal(caller.signal.aborted, false);
  assert.ok(Date.now() - startedAt < 1000);
});

test('discord webhook timeout falls back when AbortSignal.timeout is unavailable', async (t) => {
  const timeoutDescriptor = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout');
  Object.defineProperty(AbortSignal, 'timeout', {
    configurable: true,
    writable: true,
    value: undefined,
  });
  t.after(() => {
    if (timeoutDescriptor) {
      Object.defineProperty(AbortSignal, 'timeout', timeoutDescriptor);
    } else {
      delete AbortSignal.timeout;
    }
  });

  let requestSignal = null;
  const startedAt = Date.now();

  await assert.rejects(
    postDiscordWebhook('https://discord.example/webhook', {
      body: '{}',
      timeoutMs: 10,
      fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
        requestSignal = init.signal;
        init.signal.addEventListener('abort', () => {
          reject(init.signal.reason || new Error('aborted'));
        }, { once: true });
      }),
    }),
    (error) => {
      assert.equal(error instanceof DiscordWebhookDeliveryError, true);
      assert.equal(error.code, 'DISCORD_WEBHOOK_DELIVERY_FAILED');
      assert.ok(error.cause);
      return true;
    },
  );

  assert.ok(requestSignal);
  assert.equal(requestSignal.aborted, true);
  assert.ok(Date.now() - startedAt < 1000);
});

test('discord webhook returns parsed JSON response body when Discord wait mode is enabled', async () => {
  const result = await postDiscordWebhook('https://discord.example/webhook?wait=true', {
    body: '{}',
    timeoutMs: 1000,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: (name) => (String(name).toLowerCase() === 'content-type' ? 'application/json' : null) },
      json: async () => ({ id: 'message-1', channel_id: 'channel-1' }),
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.body.id, 'message-1');
  assert.equal(result.body.channel_id, 'channel-1');
});
