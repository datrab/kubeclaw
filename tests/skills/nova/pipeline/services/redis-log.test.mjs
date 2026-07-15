import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { logRedisExchange } from '../../../../../skills/nova/pipeline/services/redis-log.ts';

function makeConfig() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'redis-log-test-'));
  return {
    project: 'redis-log-test',
    repo_root: root,
    paths: {
      swarm_dir: path.join(root, '.swarm'),
    },
    _runId: 'run-redis-log-test',
    run_id: 'run-redis-log-test',
  };
}

function readProjectExchange(config) {
  const filePath = path.join(config.paths.swarm_dir, 'logs', 'redis', 'redis-exchanges.jsonl');
  const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);
  return JSON.parse(lines.at(-1));
}

test('logRedisExchange preserves payload fields before persisting', () => {
  const config = makeConfig();

  logRedisExchange(config, 'sent', 'task', 'module', 'alpha', {
    token: 'raw-token-value',
    nested: {
      password: 'raw-password-value',
      note: 'Authorization: Bearer abcdefghijklmnop',
    },
  });

  const record = readProjectExchange(config);
  const serialized = JSON.stringify(record);

  assert.equal(record.payload.token, 'raw-token-value');
  assert.equal(record.payload.nested.password, 'raw-password-value');
  assert.match(record.payload.nested.note, /Bearer abcdefghijklmnop/);
  assert.match(serialized, /raw-token-value|raw-password-value|abcdefghijklmnop/);
});

test('logRedisExchange truncation preview is derived from bounded payload', () => {
  const config = makeConfig();

  logRedisExchange(config, 'received', 'completion', 'pipeline', 'run', {
    authorization: 'Bearer abcdefghijklmnop',
    chunks: Array.from({ length: 8 }, () => 'x'.repeat(500)),
  });

  const record = readProjectExchange(config);
  const serialized = JSON.stringify(record);

  assert.equal(record.payload._truncated, true);
  assert.match(record.payload._preview, /Bearer abcdefghijklmnop/);
  assert.match(serialized, /Bearer abcdefghijklmnop|abcdefghijklmnop/);
});
