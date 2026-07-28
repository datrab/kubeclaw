import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const { resolveAgentObserverConfig } = await import(pathToFileURL(path.resolve('src/config.ts')).href);

const resolved = resolveAgentObserverConfig({
  enabled: true,
  redisHost: 'redis.internal',
  redisPort: 6380,
  redisUsername: 'observer',
  redisPassword: 'secret',
  redisTls: true,
  redisNetworkIsolation: 'strict',
  maxEventBytes: 65536,
  maxQueuePerStream: 32,
  redisCommandTimeoutMs: 900,
  streamMaxLen: 5000,
  deadLetterMaxLen: 500,
  controlWriteMaxAttempts: 5,
  controlWriteRetryBaseMs: 50,
  controlWriteRetryMaxMs: 500,
  hookPriority: 7,
  hookTimeoutMs: 1200,
}, {});

assert.equal(resolved.enabled, true);
assert.equal(resolved.redisHost, 'redis.internal');
assert.equal(resolved.redisPort, 6380);
assert.equal(resolved.redisUsername, 'observer');
assert.equal(resolved.redisPassword, 'secret');
assert.equal(resolved.redisTls, true);
assert.equal(resolved.redisNetworkIsolation, 'strict');
assert.equal(resolved.maxEventBytes, 65536);
assert.equal(resolved.maxQueuePerStream, 32);
assert.equal(resolved.redisCommandTimeoutMs, 900);
assert.equal(resolved.streamMaxLen, 5000);
assert.equal(resolved.deadLetterMaxLen, 500);
assert.equal(resolved.controlWriteMaxAttempts, 5);
assert.equal(resolved.controlWriteRetryBaseMs, 50);
assert.equal(resolved.controlWriteRetryMaxMs, 500);
assert.equal(resolved.hookPriority, 7);
assert.equal(resolved.hookTimeoutMs, 1200);

assert.throws(
  () => resolveAgentObserverConfig({ enabled: true, redisPort: 70000 }, {}),
  /redisPort must be an integer between 1 and 65535/,
);

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.openclaw-agent-observer', suite: 'config' }));
