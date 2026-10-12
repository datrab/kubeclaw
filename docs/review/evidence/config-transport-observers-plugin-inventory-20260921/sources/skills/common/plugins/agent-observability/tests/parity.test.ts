import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { projectAgentEvent } = await import(pathToFileURL(path.resolve('src/observers.ts')).href);
const manifest = JSON.parse(fs.readFileSync('plugin.json', 'utf8'));
const deliveryTargetType = 'plugin.kubeclaw.openclaw-agent-events.subagent-delivery-target';
for (const observer of manifest.observers) {
  assert.equal(observer.subscriptions.includes(deliveryTargetType), true, `${observer.id} must observe delivery targets`);
}
const subscriptions = new Set(manifest.observers.flatMap((entry) => entry.subscriptions));
for (const [index, type] of [...subscriptions].entries()) {
  const delivery = {
    deliveryId: `delivery:${type}`,
    attemptNumber: 1,
    event: {
      eventId: `event:${type}`,
      sequence: index + 1,
      type,
      identity: { runId: 'run:1' },
      occurredAt: '2026-07-28T00:00:00Z',
      payload: {
        token: 'must-not-survive',
        nested: { credential: 'must-not-survive-either', value: index },
      },
    },
  };
  const first = projectAgentEvent(delivery);
  const retry = projectAgentEvent({ ...delivery, attemptNumber: 7 });
  assert.equal(JSON.stringify(first), JSON.stringify(retry), type);
  assert.equal(first.eventType, type);
  assert.equal(first.payload.token, '[redacted]');
  assert.equal(first.payload.nested.credential, '[redacted]');
  assert.equal(first.payload.nested.value, index);
  assert.doesNotMatch(JSON.stringify(first), /must-not-survive/);
}
console.log(JSON.stringify({ ok: true, plugin: manifest.id, suite: 'parity' }));
