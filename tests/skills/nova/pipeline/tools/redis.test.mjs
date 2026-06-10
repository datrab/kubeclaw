import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { main, waitForRedisReady } from '../../../../../skills/nova/pipeline/tools/redis.ts';

function createRedisMock(status = 'connecting') {
  const redis = new EventEmitter();
  redis.status = status;
  return redis;
}

test('waitForRedisReady resolves immediately when Redis is ready', async () => {
  await waitForRedisReady(createRedisMock('ready'), 5);
});

test('waitForRedisReady rejects when Redis errors before ready', async () => {
  const redis = createRedisMock();
  const promise = waitForRedisReady(redis, 50);

  redis.emit('error', new Error('auth failed'));

  await assert.rejects(promise, /auth failed/);
});

test('waitForRedisReady rejects when Redis ends before ready', async () => {
  const redis = createRedisMock();
  const promise = waitForRedisReady(redis, 50);

  redis.emit('end');

  await assert.rejects(promise, /ended before ready/);
});

test('waitForRedisReady rejects when Redis closes before ready', async () => {
  const redis = createRedisMock();
  const promise = waitForRedisReady(redis, 50);

  redis.emit('close');

  await assert.rejects(promise, /closed before ready/);
});

test('waitForRedisReady rejects when Redis never becomes ready', async () => {
  await assert.rejects(waitForRedisReady(createRedisMock(), 5), /within 5ms/);
});

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
