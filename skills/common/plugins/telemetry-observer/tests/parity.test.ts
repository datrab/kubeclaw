import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { telemetryEnvelope } = await import(pathToFileURL(path.resolve('src/observer.ts')).href);
const manifest = JSON.parse(fs.readFileSync('plugin.json', 'utf8'));
const subscriptions = manifest.observers[0].subscriptions;
for (const [index, type] of subscriptions.entries()) {
  const delivery = {
    deliveryId: `delivery:${type}`,
    attemptNumber: 1,
    observer: { registrationId: 'telemetry' },
    event: {
      eventId: `event:${type}`,
      sequence: index + 1,
      type,
      identity: { runId: 'run:1' },
      occurredAt: '2026-07-28T00:00:00Z',
      causationId: null,
      payload: { status: 'ok', token: 'must-not-survive' },
    },
  };
  const first = telemetryEnvelope(delivery);
  const retry = telemetryEnvelope({ ...delivery, attemptNumber: 9 });
  assert.equal(JSON.stringify(first), JSON.stringify(retry), type);
  assert.equal(first.event.type, type);
  assert.equal(first.event.payload.token, '[redacted]');
  assert.doesNotMatch(JSON.stringify(first), /must-not-survive/);
}
console.log(JSON.stringify({ ok: true, plugin: manifest.id, suite: 'parity' }));

