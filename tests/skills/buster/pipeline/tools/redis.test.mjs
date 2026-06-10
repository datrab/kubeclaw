import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { waitForRedisReady } from '../../../../../skills/buster/pipeline/tools/redis.ts';

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

test('send CLI keeps human Redis dispatch diagnostics off stdout', () => {
  const source = fs.readFileSync(fileURLToPath(new URL('../../../../../skills/buster/pipeline/tools/redis.ts', import.meta.url)), 'utf8');

  assert.equal(source.includes('console.log(`[Redis] Sent'), false);
  assert.equal(source.includes('console.error(`[Redis] Sent'), true);
});
