import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { projectAgentEvent } = await import(pathToFileURL(path.resolve('src/observers.ts')).href);
const delivery = {
  deliveryId: 'delivery:1', attemptNumber: 2,
  event: {
    eventId: 'event:1', type: 'plugin.kubeclaw.openclaw-agent-events.session-end',
    sequence: 4, identity: { runId: 'run:1' }, occurredAt: '2026-07-26T00:00:00Z',
    payload: { token: 'raw-secret', nested: { authorization: 'Bearer raw', value: 1 } },
  },
};
const projected = projectAgentEvent(delivery);
assert.equal(projected.deliveryAttempt, undefined);
assert.equal(projected.payload.token, '[redacted]');
assert.equal(projected.payload.nested.authorization, '[redacted]');
assert.equal(projected.payload.nested.value, 1);
assert.doesNotMatch(JSON.stringify(projected), /raw-secret|Bearer raw/);
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.agent-observability', suite: 'observers-unit' }));
