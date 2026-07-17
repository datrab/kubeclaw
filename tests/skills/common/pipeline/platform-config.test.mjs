import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  DEFAULT_SWARM_CONFIG_PATH,
  discoverPlatformSwarmConfigCandidates,
} from '../../../../skills/common/pipeline/platform-config.ts';

function withEnv(key, value, fn) {
  const prior = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    return fn();
  } finally {
    if (prior === undefined) delete process.env[key];
    else process.env[key] = prior;
  }
}

test('explicit SWARM_CONFIG is the first platform config discovery candidate', () => {
  const explicitConfig = '/tmp/openclaw-explicit-swarm.config.json';
  withEnv('SWARM_CONFIG', explicitConfig, () => {
    const candidates = discoverPlatformSwarmConfigCandidates();

    assert.equal(candidates[0], path.resolve(explicitConfig));
    assert.equal(candidates[1], path.resolve(DEFAULT_SWARM_CONFIG_PATH));
  });
});
