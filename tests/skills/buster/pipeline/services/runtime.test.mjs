import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveDiscordWebhookUrl } from '../../../../../skills/buster/pipeline/services/runtime.ts';

function withDiscordWebhookEnv(env, fn) {
  const previousUrl = process.env.DISCORD_WEBHOOK_URL;
  const previousLegacy = process.env.DISCORD_WEBHOOK;

  if (env.DISCORD_WEBHOOK_URL === undefined) delete process.env.DISCORD_WEBHOOK_URL;
  else process.env.DISCORD_WEBHOOK_URL = env.DISCORD_WEBHOOK_URL;

  if (env.DISCORD_WEBHOOK === undefined) delete process.env.DISCORD_WEBHOOK;
  else process.env.DISCORD_WEBHOOK = env.DISCORD_WEBHOOK;

  try {
    fn();
  } finally {
    if (previousUrl === undefined) delete process.env.DISCORD_WEBHOOK_URL;
    else process.env.DISCORD_WEBHOOK_URL = previousUrl;

    if (previousLegacy === undefined) delete process.env.DISCORD_WEBHOOK;
    else process.env.DISCORD_WEBHOOK = previousLegacy;
  }
}

test('resolveDiscordWebhookUrl returns a non-empty string override', () => {
  withDiscordWebhookEnv({
    DISCORD_WEBHOOK_URL: 'https://env.example.test/webhook',
    DISCORD_WEBHOOK: undefined,
  }, () => {
    assert.equal(
      resolveDiscordWebhookUrl('  https://override.example.test/webhook  '),
      'https://override.example.test/webhook',
    );
  });
});

test('resolveDiscordWebhookUrl falls back when override is empty', () => {
  withDiscordWebhookEnv({
    DISCORD_WEBHOOK_URL: '  https://env.example.test/webhook  ',
    DISCORD_WEBHOOK: undefined,
  }, () => {
    assert.equal(resolveDiscordWebhookUrl('   '), 'https://env.example.test/webhook');
  });
});

test('resolveDiscordWebhookUrl ignores truthy non-string overrides', () => {
  for (const override of [{ url: 'https://example.invalid' }, 1, true, ['https://example.invalid']]) {
    withDiscordWebhookEnv({
      DISCORD_WEBHOOK_URL: undefined,
      DISCORD_WEBHOOK: 'https://legacy.example.test/webhook',
    }, () => {
      assert.equal(resolveDiscordWebhookUrl(override), 'https://legacy.example.test/webhook');
    });
  }
});

test('resolveDiscordWebhookUrl returns null without string override or env', () => {
  withDiscordWebhookEnv({
    DISCORD_WEBHOOK_URL: undefined,
    DISCORD_WEBHOOK: undefined,
  }, () => {
    assert.equal(resolveDiscordWebhookUrl({ url: 'https://example.invalid' }), null);
  });
});
