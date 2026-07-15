import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createLogger } from '../../../../../skills/buster/pipeline/services/logger.ts';

test('Buster logger recreates module log directory if git sync removed it after construction', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-logger-'));
  const logPath = path.join(root, '.swarm/logs/modules/02-nginx/buster-pipeline.jsonl');
  const logger = createLogger({ logPath, module: '02-nginx', taskType: 'module_test' });

  fs.rmSync(path.dirname(logPath), { recursive: true, force: true });
  logger.info('GIT', 'after sync');

  assert.ok(fs.existsSync(logPath));
  const entries = fs.readFileSync(logPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].module, '02-nginx');
  assert.equal(entries[0].msg, 'after sync');
});
