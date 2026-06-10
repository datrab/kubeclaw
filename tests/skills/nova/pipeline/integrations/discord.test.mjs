import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { discordEmbeds } from '../../../../../skills/nova/pipeline/integrations/discord.ts';

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
    return { ok: true, status: 204, statusText: 'No Content' };
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
