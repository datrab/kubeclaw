import assert from 'node:assert/strict';
import test from 'node:test';

import {
  shouldPreserveTerminalModuleRecovery,
} from '../../../../../skills/nova/pipeline/runners/pipeline-runner-recovery-session.ts';

test('terminal Buster module recovery preserves dispatch for phase polling', () => {
  assert.equal(shouldPreserveTerminalModuleRecovery({
    previousPhase: 'buster',
    recoveryAction: 'observed_terminal',
  }), true);
});

test('non-Buster terminal recovery still uses stale reset semantics', () => {
  assert.equal(shouldPreserveTerminalModuleRecovery({
    previousPhase: 'forge',
    recoveryAction: 'observed_terminal',
  }), false);
  assert.equal(shouldPreserveTerminalModuleRecovery({
    previousPhase: 'buster',
    recoveryAction: 'killed_orphan',
  }), false);
});
