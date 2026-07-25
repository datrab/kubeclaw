import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { waitForRedisReady } from '../../../../../skills/buster/pipeline/tools/redis.ts';
import { registerRedisReadyContract } from '../../../common/pipeline/redis-ready-contract.mjs';

registerRedisReadyContract(waitForRedisReady, 'Buster Redis tool');

test('send CLI keeps human Redis dispatch diagnostics off stdout', () => {
  const source = fs.readFileSync(fileURLToPath(new URL('../../../../../skills/buster/pipeline/tools/redis.ts', import.meta.url)), 'utf8');

  assert.equal(source.includes('console.log(`[Redis] Sent'), false);
  assert.equal(source.includes('console.error(`[Redis] Sent'), true);
});
