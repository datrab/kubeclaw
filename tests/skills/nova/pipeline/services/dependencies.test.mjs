import assert from 'node:assert/strict';
import test from 'node:test';

import { checkDependencies } from '../../../../../skills/nova/pipeline/services/dependencies.ts';

test('checkDependencies reports missing gate when progress.gates is omitted', () => {
  const result = checkDependencies({}, {
    modules: {
      m1: { depends_on: ['gate:approval'] },
    },
  }, 'm1');

  assert.deepEqual(result, {
    met: false,
    reason: "Gate 'approval' not defined",
  });
});
