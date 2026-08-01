import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const {
  auditRecord,
  lifecycleNotification,
  observe,
  previewNotification,
} = await import(pathToFileURL(path.resolve('dist/observer.js')).href);
const manifest = JSON.parse(fs.readFileSync('plugin.json', 'utf8'));
const notification = manifest.observers.find((entry) => entry.id === 'notifications');
const labels = new Map([
  ['run.started', ['info', 'Pipeline run started']],
  ['run.succeeded', ['success', 'Pipeline run succeeded']],
  ['run.failed', ['error', 'Pipeline run failed']],
  ['run.blocked', ['warning', 'Pipeline run blocked']],
  ['run.cancelled', ['warning', 'Pipeline run cancelled']],
  ['stage.started', ['info', 'Stage 1 started']],
  ['stage.skipped', ['info', 'Stage 1 skipped']],
  ['stage.succeeded', ['success', 'Stage 1 passed']],
  ['stage.failed', ['error', 'Stage 1 failed']],
  ['stage.blocked', ['warning', 'Stage 1 blocked']],
  ['stage.cancelled', ['warning', 'Stage 1 cancelled']],
  ['stage.retrying', ['warning', 'Stage 1 retrying']],
  ['stage.waiting', ['warning', 'Stage 1 waiting']],
  ['orchestrator.required', ['warning', 'Orchestrator action required']],
]);
for (const type of notification.subscriptions) {
  const projected = lifecycleNotification({
    deliveryId: `delivery:${type}`,
    event: {
      eventId: `event:${type}`,
      type,
      identity: { runId: 'run:1', stageId: 'stage:1' },
      payload: {},
    },
  });
  assert.equal(projected.severity, labels.get(type)[0], type);
  assert.equal(projected.title, labels.get(type)[1], type);
  assert.equal(projected.summary, labels.get(type)[1], type);
  assert.ok(Array.isArray(projected.fields), type);
  assert.match(projected.footer, /run:1/u, type);
}

const long = 'x'.repeat(300);
assert.equal(lifecycleNotification({
  event: {
    eventId: 'event:bounded',
    type: 'run.failed',
    identity: { runId: 'run:1' },
    payload: { summary: long },
  },
}, 256).summary, `${'x'.repeat(256)}…`);

let calls = 0;
await observe({
  event: {
    eventId: 'event:suppressed',
    type: 'run.failed',
    identity: { runId: 'run:1' },
    payload: {},
  },
}, {
  contract: { config: { target: 'operators', suppressEventTypes: ['run.failed'] } },
  async invoke() { calls += 1; },
});
assert.equal(calls, 0);

const preview = previewNotification({
  event: {
    eventId: 'event:preview',
    type: 'artifact.created',
    identity: { runId: 'run:1', artifactId: 'artifact:1' },
    payload: {
      artifact: {
        artifactId: 'artifact:1',
        digest: `sha256:${'a'.repeat(64)}`,
        mediaType: 'text/html',
        logicalName: 'preview',
        token: 'must-not-survive',
      },
    },
  },
});
assert.doesNotMatch(JSON.stringify(preview), /must-not-survive/);

const auditDelivery = {
  deliveryId: 'delivery:audit',
  attemptNumber: 9,
  event: {
    eventId: 'event:audit',
    sequence: 7,
    type: 'run.failed',
    identity: { runId: 'run:1' },
    occurredAt: '2026-07-28T00:00:00Z',
    causationId: null,
    payload: { token: 'must-not-survive', nested: { authorization: 'Bearer secret' } },
  },
};
const audit = auditRecord(auditDelivery);
assert.equal(audit.payload.token, '[redacted]');
assert.equal(audit.payload.nested.authorization, '[redacted]');
assert.equal(JSON.stringify(audit), JSON.stringify(auditRecord({ ...auditDelivery, attemptNumber: 10 })));
console.log(JSON.stringify({ ok: true, plugin: manifest.id, suite: 'parity' }));
