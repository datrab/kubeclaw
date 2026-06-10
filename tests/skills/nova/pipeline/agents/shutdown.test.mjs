import assert from 'node:assert/strict';
import test from 'node:test';

import { getTrackedAgent, trackAgent, untrackAgent } from '../../../../../skills/nova/pipeline/agents/lifecycle.ts';
import { buildVictimSet, clearShutdownContext, setShutdownContext } from '../../../../../skills/nova/pipeline/agents/shutdown.ts';

test('clearShutdownContext preserves tracked live sessions', () => {
  const config = { project: 'shutdown-test', agents: { forge: { dispatch: 'local' } } };
  const label = 'forge-module-live-session';

  try {
    setShutdownContext(config, 'forge', 'module-live-session', null);
    trackAgent(config, label, 'session-key-1', 'agent-1', 'gateway-1', null);

    clearShutdownContext();

    assert.equal(getTrackedAgent(label)?.sessionKey, 'session-key-1');
  } finally {
    untrackAgent(label);
    clearShutdownContext();
  }
});

test('clearShutdownContext removes placeholder entries without sessions', () => {
  const config = { project: 'shutdown-test', agents: { forge: { dispatch: 'local' } } };
  const label = 'forge-module-placeholder';

  try {
    setShutdownContext(config, 'forge', 'module-placeholder', null);

    clearShutdownContext();

    assert.equal(getTrackedAgent(label), null);
  } finally {
    untrackAgent(label);
    clearShutdownContext();
  }
});

test('buildVictimSet does not include unrelated same-project orphan ACP wrappers', () => {
  const config = { project: 'shutdown-test', agents: { forge: { dispatch: 'local' } } };
  const label = 'forge-module-orphan';
  const sessionKey = 'session-key-target';
  const gatewayLabel = 'forge-module-orphan-123';

  try {
    trackAgent(config, label, sessionKey, 'claude', gatewayLabel, null);

    const victims = buildVictimSet('claude', sessionKey, gatewayLabel, {
      parsePsTable: () => [
        { pid: 101, ppid: 1, command: `node claude-agent-acp --name ${gatewayLabel} --session ${sessionKey}` },
        { pid: 102, ppid: 101, command: 'child process for target' },
        { pid: 201, ppid: 1, command: 'node claude-agent-acp --name unrelated-session' },
        { pid: 202, ppid: 201, command: 'child process for unrelated' },
      ],
      readProcEnv: () => ({ OPENCLAW_SHELL: 'acp', CURRENT_PROJECT: 'shutdown-test' }),
    });

    assert.deepEqual(victims.map((row) => row.pid), [102, 101]);
  } finally {
    untrackAgent(label);
  }
});
