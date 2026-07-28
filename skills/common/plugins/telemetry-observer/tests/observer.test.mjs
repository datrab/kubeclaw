import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { observe } = await import(pathToFileURL(path.resolve('dist/observer.js')).href);
const calls = [];
const delivery = {
  schemaVersion: 'observer-delivery.v2',
  deliveryId: 'delivery:telemetry:event:1',
  observer: { package: { package: { pluginId: 'kubeclaw.telemetry-observer' } }, registrationId: 'telemetry' },
  attemptNumber: 2,
  deliveredAt: '2026-07-26T00:00:01.000Z',
  event: {
    schemaVersion: 'lifecycle-event.v2',
    eventId: 'event:1',
    sequence: 7,
    type: 'run.succeeded',
    identity: { runId: 'run:1' },
    occurredAt: '2026-07-26T00:00:00.000Z',
    causationId: 'event:0',
    payload: { status: 'succeeded' },
  },
};
await observe(delivery, {
  contract: {},
  async invoke(capability, invocation) {
    calls.push({ capability, invocation });
    return { accepted: true };
  },
  async emit() { throw new Error('unexpected domain event'); },
});
assert.equal(calls.length, 1);
assert.equal(calls[0].capability, 'telemetry.emit');
assert.deepEqual(calls[0].invocation.payload.event, {
  eventId: 'event:1',
  sequence: 7,
  type: 'run.succeeded',
  identity: { runId: 'run:1' },
  occurredAt: '2026-07-26T00:00:00.000Z',
  causationId: 'event:0',
  payload: { status: 'succeeded' },
});
assert.equal(calls[0].invocation.payload.deliveryAttempt, 2);
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.telemetry-observer', suite: 'observer' }));
