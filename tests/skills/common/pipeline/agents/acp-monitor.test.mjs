import assert from 'node:assert/strict';
import test from 'node:test';

import { isSessionTerminal } from '../../../../../skills/common/pipeline/agents/acp-monitor.ts';

test('isSessionTerminal remains a synchronous monitor-state predicate', () => {
  assert.equal(isSessionTerminal({ terminal: true, sessionState: 'completed' }), true);
  assert.equal(isSessionTerminal({ terminal: false, sessionState: 'running' }), false);
});

test('isSessionTerminal rejects label input instead of returning a truthy Promise', () => {
  assert.throws(
    () => isSessionTerminal('forge-1', {}, { gatewayUrl: 'http://127.0.0.1:1', gatewayToken: '' }),
    /expects an ACP monitor state object/,
  );
});
