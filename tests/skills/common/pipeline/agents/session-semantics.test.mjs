import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isSessionTerminalState,
  isStoppedSessionState,
  isUnreachableSessionState,
  parseSessionState,
} from '../../../../../skills/common/pipeline/agents/session-semantics.ts';

test('structured failed session states normalize to stopped terminal error', () => {
  for (const state of ['failed', 'failure', 'errored', 'aborted', 'cancelled', 'canceled']) {
    const parsed = parseSessionState({ state });

    assert.equal(parsed.active, false);
    assert.equal(parsed.state, 'error');
    assert.equal(isSessionTerminalState(parsed.state), true);
    assert.equal(isStoppedSessionState(parsed.state), true);
  }
});

test('parser unparsed detail states count as unreachable', () => {
  const parsed = parseSessionState({ raw: 'unexpected gateway text' });

  assert.equal(parsed.active, false);
  assert.equal(parsed.state, 'status_unparsed (unexpected gateway text)');
  assert.equal(isUnreachableSessionState(parsed.state), true);
});
