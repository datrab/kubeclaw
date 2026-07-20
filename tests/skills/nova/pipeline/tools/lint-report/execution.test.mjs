import assert from 'node:assert/strict';
import test from 'node:test';

import { requireToolExecution } from '../../../../../../skills/nova/pipeline/tools/lint-report/execution.ts';

test('tool timeout is an execution failure', () => {
  assert.throws(
    () => requireToolExecution({ timedOut: true, error: 'timeout after 10ms', exitCode: -1 }, 'fixture'),
    error => error?.code === 'fixture-timeout'
  );
});

test('tool spawn failure is an execution failure', () => {
  assert.throws(
    () => requireToolExecution({ timedOut: false, error: 'spawn failed', exitCode: -1 }, 'fixture'),
    error => error?.code === 'fixture-execution-failed'
  );
});
