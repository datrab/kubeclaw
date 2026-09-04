import assert from 'node:assert/strict';

import { validateAgentObservabilityIngressEvent } from '../src/validation.ts';

const cyclic: unknown[] = [];
cyclic.push(cyclic);
const event = {
  v: 1,
  type: 'openclaw.session.started',
  source: 'openclaw.plugin.agent-observer',
  ts: '2026-09-04T00:00:00.000Z',
  identity: {},
  payload: { hook: 'session_start', metadata: cyclic },
};
let result;
assert.doesNotThrow(() => { result = validateAgentObservabilityIngressEvent(event); },
  'cyclic arrays must be rejected without overflowing the validator stack');
assert.equal(result?.ok, false);

console.log(JSON.stringify({ ok: true, contract: 'agent-observability-validation' }));
