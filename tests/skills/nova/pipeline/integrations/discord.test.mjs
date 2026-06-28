import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { discord, discordEmbeds } from '../../../../../skills/nova/pipeline/integrations/discord.ts';

function makeConfig() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'discord-embeds-test-'));
  return {
    project: 'discord-embeds-test',
    repo_root: root,
    paths: {
      swarm_dir: path.join(root, '.swarm'),
    },
    _runId: 'run-discord-embeds-test',
    run_id: 'run-discord-embeds-test',
    discord_webhook_url: 'https://discord.example/webhook',
    discord: {
      webhook_timeout_ms: 10000,
    },
    discord_alerts: {
      info: false,
      warn: true,
      critical: true,
      ok: true,
    },
  };
}

test('discordEmbeds honors level-based webhook gating', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: (name) => (String(name).toLowerCase() === 'content-type' ? 'application/json' : null) },
      json: async () => ({ id: 'discord-message-1', channel_id: 'discord-channel-1' }),
    };
  };

  try {
    const config = makeConfig();
    const embeds = [{
      title: 'Pipeline update',
      description: 'Embed delivery should follow alert config.',
      fields: [{ name: 'Status', value: 'complete' }],
    }];

    await discordEmbeds(config, embeds, { level: 'INFO' });
    assert.equal(calls.length, 0);

    await discordEmbeds(config, embeds, { level: 'WARN' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, config.discord_webhook_url);
    assert.deepEqual(JSON.parse(calls[0].init.body).embeds[0].title, 'Pipeline update');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('discord delivery and audit keep canonical verdict and model wording readable', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: (name) => (String(name).toLowerCase() === 'content-type' ? 'application/json' : null) },
      json: async () => ({ id: 'discord-message-1', channel_id: 'discord-channel-1' }),
    };
  };

  try {
    const config = makeConfig();
    await discord(config, 'WARN', 'Review: gate FAIL', 'Gate returned PASS/FAIL language.', [
      { name: 'Status', value: 'FAIL', inline: true },
      { name: 'Model', value: 'openai-codex/gpt-5.4', inline: true },
      { name: 'Evidence', value: '.swarm/logs/pipeline/latest.json', inline: false },
    ]);

    assert.equal(calls.length, 1);
    const webhookEmbed = JSON.parse(calls[0].init.body).embeds[0];
    assert.equal(webhookEmbed.title, '⚠️ Review: gate FAIL');
    assert.equal(webhookEmbed.description, 'Gate returned PASS/FAIL language.');
    assert.equal(webhookEmbed.fields.find((field) => field.name === 'Status')?.value, 'FAIL');
    assert.equal(webhookEmbed.fields.find((field) => field.name === 'Model')?.value, 'openai/gpt-5.4');
    assert.match(webhookEmbed.fields.find((field) => field.name === 'Evidence')?.value, /Status: FAIL/);
    assert.doesNotMatch(webhookEmbed.fields.find((field) => field.name === 'Evidence')?.value, /latest\.json/);

    const auditPath = path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'runs', config.run_id, 'discord.jsonl');
    const auditEntry = JSON.parse(fs.readFileSync(auditPath, 'utf8').trim().split('\n').at(-1));
    assert.equal(auditEntry.title, 'Review: gate FAIL');
    assert.equal(auditEntry.fields.find((field) => field.name === 'Status')?.value, 'FAIL');
    assert.equal(auditEntry.fields.find((field) => field.name === 'Model')?.value, 'openai/gpt-5.4');
    assert.match(auditEntry.fields.find((field) => field.name === 'Evidence')?.value, /Status: FAIL/);

    const receiptPath = path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'runs', config.run_id, 'discord-deliveries.jsonl');
    const receiptEntry = JSON.parse(fs.readFileSync(receiptPath, 'utf8').trim().split('\n').at(-1));
    assert.equal(receiptEntry.ok, true);
    assert.equal(receiptEntry.message_id, 'discord-message-1');
    assert.equal(receiptEntry.channel_id, 'discord-channel-1');
    assert.equal(receiptEntry.webhook_message_returned, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
