import assert from 'node:assert/strict';
import test from 'node:test';
import { execute } from '../src/stage.js';

const context = Object.freeze({
  contract: Object.freeze({ config: Object.freeze({ prefix: 'Hello' }) }),
});

test('returns a visible decision fact', async () => {
  assert.deepEqual(await execute({ name: 'KubeClaw' }, context), {
    schemaVersion: 'stage-result.v2',
    outcome: 'passed',
    artifacts: [],
    facts: { 'tutorial.greeting': 'Hello, KubeClaw!' },
  });
});

test('returns an intentional terminal failure', async () => {
  assert.deepEqual(await execute({ name: 'KubeClaw', fail: true }, context), {
    schemaVersion: 'stage-result.v2',
    outcome: 'failed',
    reason: {
      code: 'tutorial.requested_failure',
      message: 'The tutorial requested failure for KubeClaw.',
    },
    artifacts: [],
  });
});
