import assert from 'node:assert/strict';
import test from 'node:test';

import { RedisTransportPolicyError, resolveRedisTransportConfig } from '../../../../skills/common/pipeline/redis-transport.ts';

test('redis transport accepts integer port strings', () => {
  const { redisOptions } = resolveRedisTransportConfig({ port: '6379', password: 'p' }, {});

  assert.equal(redisOptions.port, 6379);
});

test('redis transport rejects malformed and out of range port strings', () => {
  for (const port of ['6379abc', '1.5', 'abc', '0', '65536']) {
    assert.throws(
      () => resolveRedisTransportConfig({ port, password: 'p' }, {}),
      RedisTransportPolicyError,
    );
  }
});
