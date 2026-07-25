import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

function createRedisMock(status = 'connecting') {
  const redis = new EventEmitter();
  redis.status = status;
  return redis;
}

export function registerRedisReadyContract(waitForRedisReady, implementation) {
  test(`${implementation}: resolves immediately when Redis is ready`, async () => {
    await waitForRedisReady(createRedisMock('ready'), 5);
  });

  for (const [event, message] of [['error', 'auth failed'], ['end', 'ended before ready'], ['close', 'closed before ready']]) {
    test(`${implementation}: rejects when Redis emits ${event} before ready`, async () => {
      const redis = createRedisMock();
      const promise = waitForRedisReady(redis, 50);
      redis.emit(event, event === 'error' ? new Error(message) : undefined);
      await assert.rejects(promise, new RegExp(message));
    });
  }

  test(`${implementation}: rejects when Redis never becomes ready`, async () => {
    await assert.rejects(waitForRedisReady(createRedisMock(), 5), /within 5ms/);
  });
}
