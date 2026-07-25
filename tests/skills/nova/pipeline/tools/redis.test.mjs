import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { main, waitForRedisReady } from '../../../../../skills/nova/pipeline/tools/redis.ts';
import { registerRedisReadyContract } from '../../../common/pipeline/redis-ready-contract.mjs';

registerRedisReadyContract(waitForRedisReady, 'Nova Redis tool');

test('read-completion CLI rejects missing identity flags', async () => {
  await assert.rejects(
    main(['--action', 'read-completion', '--stream', 'swarm:pipeline:completions', '--module', 'mod-a']),
    /Missing completion identity fields: --run-id, --attempt, --dispatch-id/,
  );
});

test('direct CLI wrapper does not force process exit after JSON writes', () => {
  const source = fs.readFileSync(fileURLToPath(new URL('../../../../../skills/nova/pipeline/tools/redis.ts', import.meta.url)), 'utf8');
  const wrapper = source.slice(source.indexOf('if (currentPath === entryPath)'));

  assert.equal(wrapper.includes('process.exit('), false);
  assert.equal(wrapper.includes('process.exitCode = 1'), true);
});

test('send CLI keeps human Redis dispatch diagnostics off stdout', () => {
  const source = fs.readFileSync(fileURLToPath(new URL('../../../../../skills/nova/pipeline/tools/redis.ts', import.meta.url)), 'utf8');

  assert.equal(source.includes('console.log(`[Redis] Sent'), false);
  assert.equal(source.includes('console.error(`[Redis] Sent'), true);
});
