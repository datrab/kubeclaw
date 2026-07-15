import assert from 'node:assert/strict';
import test from 'node:test';

import { buildModuleValidatorRunInput } from '../../../../../skills/nova/pipeline/runners/module-runner-shared.ts';

test('buildModuleValidatorRunInput exposes validator producerType metadata', () => {
  const input = buildModuleValidatorRunInput(
    {
      _runId: 'run-fixture',
      repo_root: '/repo',
      paths: { modules_dir: '/repo/modules' },
    },
    'module-a',
    { title: 'Module A' },
    'module-a',
    { fail_count: 0 },
    'validator:delivery_lint',
    { attempt: 1, phase: 'validation' },
  );

  assert.equal(input.ids.producerType, 'delivery_lint');
  assert.equal(input.validator.producerType, 'delivery_lint');
  assert.equal(input.validator.validatorType, 'delivery_lint');
});
