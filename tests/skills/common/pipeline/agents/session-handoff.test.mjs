import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeAgentSessionHandoffReceipt,
  normalizeAgentSessionTarget,
  sendAgentSessionHandoff,
} from '../../../../../skills/common/pipeline/agents/session-handoff.ts';

test('normalizeAgentSessionTarget accepts session keys and channel ids', () => {
  assert.equal(
    normalizeAgentSessionTarget('agent:main:discord:channel:123'),
    'agent:main:discord:channel:123',
  );
  assert.equal(
    normalizeAgentSessionTarget('channel:123'),
    'agent:main:discord:channel:123',
  );
  assert.equal(
    normalizeAgentSessionTarget('123'),
    'agent:main:discord:channel:123',
  );
  assert.equal(normalizeAgentSessionTarget(''), null);
});

test('normalizeAgentSessionHandoffReceipt requires an explicit sessions_send delivery status', () => {
  assert.deepEqual(normalizeAgentSessionHandoffReceipt({
    result: {
      delivery: {
        status: 'sent',
        sessionKey: 'agent:main:discord:channel:123',
        turnId: 'turn-1',
      },
    },
  }), {
    acknowledged: true,
    delivery_status: 'gateway_sessions_send_delivered',
    raw_delivery_status: 'sent',
    gateway_run_id: null,
    session_key: 'agent:main:discord:channel:123',
    turn_id: 'turn-1',
    response_status: null,
  });

  assert.equal(normalizeAgentSessionHandoffReceipt({ result: { delivery: { status: 'failed' } } }).acknowledged, false);
});

test('normalizeAgentSessionHandoffReceipt accepts Gateway details payloads', () => {
  assert.deepEqual(normalizeAgentSessionHandoffReceipt({
    ok: true,
    result: {
      details: {
        runId: 'gateway-run-1',
        status: 'accepted',
        sessionKey: 'agent:main:discord:channel:123',
        delivery: {
          status: 'pending',
          mode: 'announce',
        },
      },
    },
  }), {
    acknowledged: true,
    delivery_status: 'gateway_sessions_send_delivered',
    raw_delivery_status: 'pending',
    gateway_run_id: 'gateway-run-1',
    session_key: 'agent:main:discord:channel:123',
    turn_id: null,
    response_status: null,
  });
});

test('sendAgentSessionHandoff sends through sessions_send only', async () => {
  const sends = [];
  const result = await sendAgentSessionHandoff({
    sessionKey: 'agent:main:discord:channel:123',
    message: 'handoff',
    timeoutMs: 100,
    policy: { timeoutSeconds: 0 },
    sendSessionMessage: async (sessionKey, message, timeoutMs, policy) => {
      sends.push({ sessionKey, message, timeoutMs, policy });
      return { result: { delivery: { status: 'queued', sessionKey, turnId: 'turn-2' } } };
    },
  });

  assert.equal(sends.length, 1);
  assert.equal(sends[0].sessionKey, 'agent:main:discord:channel:123');
  assert.equal(sends[0].message, 'handoff');
  assert.equal(sends[0].timeoutMs, 100);
  assert.equal(sends[0].policy.sessionSendArgs.timeoutSeconds, 0);
  assert.equal(result.delivery_surface, 'gateway_sessions_send');
  assert.equal(result.acknowledged, true);
  assert.equal(result.turn_id, 'turn-2');
});
