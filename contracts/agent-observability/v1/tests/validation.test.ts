import assert from 'node:assert/strict';

import { validateAgentObservabilityIngressEvent } from '../src/validation.ts';

const cyclic: unknown[] = [];
cyclic.push(cyclic);
const cyclicEvent = {
  v: 1,
  type: 'openclaw.session.started',
  source: 'openclaw.plugin.agent-observer',
  ts: '2026-09-04T00:00:00.000Z',
  identity: {},
  payload: { hook: 'session_start', metadata: cyclic },
};
let result;
assert.doesNotThrow(() => { result = validateAgentObservabilityIngressEvent(cyclicEvent); },
  'cyclic arrays must be rejected without overflowing the validator stack');
assert.equal(result?.ok, false);
function event(ts: string) {
  return {
    v: 1, type: 'openclaw.session.started', source: 'openclaw.plugin.agent-observer', ts,
    identity: {}, payload: { hook: 'session_start' },
  };
}

assert.equal(validateAgentObservabilityIngressEvent(event('2026-09-04T12:30:45.123Z')).ok, true);
assert.equal(validateAgentObservabilityIngressEvent(event('2026-09-04T14:30:45+02:00')).ok, true);
assert.equal(validateAgentObservabilityIngressEvent(event('2026-09-04t12:30:45z')).ok, true);
for (const timestamp of [
  '2026-09-04',
  '09/04/2026',
  '2026-02-30T12:00:00Z',
  '2026-09-04 12:00:00Z',
  '2026-09-04T12:30:60Z',
  '1990-12-31T23:59:60Z',
]) {
  assert.equal(validateAgentObservabilityIngressEvent(event(timestamp)).ok, false,
    `${timestamp} must not satisfy the RFC 3339 ingress contract`);
}

console.log(JSON.stringify({ ok: true, contract: 'agent-observability-validation' }));
